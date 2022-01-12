const { parseDuration } = require('./duration.js')
const { eventElementMatch } = require('./match.js')

function relationDescriptors(model, source, now, relation, keys, prev, withCancel = true) {
  let descriptors = []
  const relationModel = model.relations[relation]
  if(relationModel.eq) {
    let relKeys = {}
    let notFound = false
    for(const {prev, next} of relationModel.eq) {
      const value = keys[prev]
      if(!value) notFound = true
      relKeys[next] = value
    }
    if(!notFound) {
      const eventTypes = relationModel.next.map(el => model.elements[el].type)
      descriptors.push({
        type:'eq', relation: relationModel.id, keys: relKeys, eventTypes,
        prev: [ prev ], source
      })
    }
  }
  if(relationModel.wait) {
    /// TODO: some uid to identify timeout ?
    const timeout = {
      type:'timeout', relation: relationModel.id, time: now + parseDuration(relationModel.wait), keys,
      prev: [ prev ], source
    }
    if(relationModel.next && relationModel.next.length > 0) timeout.keys = keys
    descriptors.push(timeout)
  }
  return descriptors
}

function findDescriptor(that, list) {
  for(let descriptor of list) {
    if(descriptor.relation != that.relation) continue
    if(descriptor.type != that.type) continue
    if(that.type == 'eq') {
      if(that.key == descriptor.key && that.value == descriptor.value) return descriptor
    } else if(that.type == 'timeout') {
      return true
    } else throw new Error(`unknown descriptor type ${that.type}`)
  }
  return false
}

async function processEvent(event, model, getRelationsByEvent) {
  const { type, keys, properties } = event
  const nextRelations = await getRelationsByEvent(type, keys)
  //console.log("EVENT", event, "NEXT RELATIONS", nextRelations)

  let newRelations = []
  let canceledRelations = []
  let actions = []
  let transitions = []

  for(let relationDescriptor of nextRelations) {
    //console.log("NEXT RELATION", relationDescriptor)
    if(findDescriptor(relationDescriptor, canceledRelations)) continue
    const relationModel = model.relations[relationDescriptor.relation]
    //console.log("NEXT RELATION MODEL", relationModel)
    const nextElements = relationModel.next.filter(id => eventElementMatch(event, model.elements[id]))
    //console.log("NEXT ELEMENTS", nextElements)
    if (nextElements.length > 0) {
      if(relationModel.cancel) {
        for(const cancelId of relationModel.cancel) {
          canceledRelations.push({ relation: cancelId, source: relationDescriptor.source })
        }
      }
      for (const element of nextElements) {
        let transition = { element, relation: relationDescriptor }
        transitions.push(transition)
        const elementModel = model.elements[element]
        if(elementModel.actions) actions.push(...elementModel.actions)

        for (const elementRelation of elementModel.next) {
          newRelations.push(...relationDescriptors(model, event.id, event.time, elementRelation, keys, transition))
        }
      }
    }
  }

  const newElements = model.start[type]
  if(newElements) {
    for (const element of newElements) {
      const elementModel = model.elements[element]
      if(!eventElementMatch(event, elementModel)) continue
      //console.log("NEW ELEMENT", element, elementModel)
      let transition = { element, relation: null }
      transitions.push(transition)
      for (const elementRelation of elementModel.next) {
        newRelations.push(...relationDescriptors(model, event.id, event.time, elementRelation, keys, transition))
      }
    }
  }

  return { newRelations, canceledRelations, actions, transitions }
}

function processTimeout(timeout, model, now) {
  const timeoutModel = model.relations[timeout.relation]
  const nextElements = timeoutModel.next

  let newRelations = []
  let canceledRelations = []
  let actions = []
  let transitions = []

  for(const cancelId of timeoutModel.cancel) {
    canceledRelations.push({ relation: cancelId, source: timeout.source })
  }

  if (nextElements.length > 0) {
    for (const element of nextElements) {
      const elementModel = model.elements[element]
      let transition = { element, relation: timeout }
      transitions.push(transition)
      if(elementModel.actions) actions.push(...elementModel.actions)
      for (const elementRelation of elementModel.next) {
        newRelations.push(...relationDescriptors(model, timeout.source+'t', now, elementRelation, timeout.keys, transition))
      }
    }
  }

  return { newRelations, canceledRelations, actions, transitions }
}

class LiveProcessor {
  constructor(model, store) {
    this.model = model
    this.store = store

    this.timeouts = []
  }

  getNextTimeoutTime() {
    return this.timeouts[0] ? this.timeouts[0].time : Infinity
  }

  processTime(to) {
    let allActions = []
    while(this.timeouts[0] && this.timeouts[0].time <= to) {
      const timeout = this.timeouts.shift()
      const changes = processTimeout(timeout, this.model, to)

      const { newRelations, canceledRelations, actions } = changes

      /*console.log("PROCESSING RESULTS:")
      console.log("NR: ", newRelations)
      console.log("CR: ", canceledRelations)*/

      this.applyChanges(changes, timeout)

      allActions.push(...actions)
    }
    return allActions
  }

  async processEvent(event) {
    this.processTime(event.time)
    //console.log("PROCESSING", event.id, event.type, 'AT', event.time, "KEYS", event.keys)
    const changes = await processEvent(event, this.model, this.store.getRelations)

    const { newRelations, canceledRelations, actions } = changes

    /*
    console.log("PROCESSING RESULTS:")
    console.log("NR: ", newRelations)
    console.log("CR: ", canceledRelations)//*/

    await this.applyChanges(changes, event)
    return actions
  }

  async addNewRelations(newRelations, mark) {
    for(const relation of newRelations) {
      if(relation.type == 'eq') {
        await this.store.saveRelation(relation, mark)
      } else if(relation.type == 'timeout') { /// TODO: revisit de-duplication, think if possible
        if(mark) mark(relation)
        this.timeouts.push(relation)
        this.timeouts.sort((a, b) => a.time == b.time ? 0 : (a.time > b.time ? 1 : -1))
      } else {
        throw new Error(`Relation type ${JSON.stringify(relation.type)} not supported`)
      }
    }
  }

  async removeCanceledRelations(canceledRelations) {
    for(const relation of canceledRelations) {
      const relationModel = this.model.relations[relation.relation]
      if(relationModel.eq) {
        await this.store.removeRelation(relation)
      } else if(relationModel.wait) {
        this.timeouts = this.timeouts.filter(to => to.relation != relation.relation || to.source != relation.source)
      } else {
        throw new Error(`Relation ${JSON.stringify(relation.relation)} not supported`)
      }
    }
  }

  async applyChanges({ newRelations, canceledRelations }, event) {
    await Promise.all([
      this.addNewRelations(newRelations),
      this.removeCanceledRelations(canceledRelations)
    ])
  }
}

module.exports = {
  parseDuration,
  processEvent,
  processTimeout,
  LiveProcessor
}
