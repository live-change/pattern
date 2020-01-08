
const durationMultipliers = {
  'ms':1, 's':1000, 'm':60*1000, 'h':60*60*1000, 'd':24*60*60*1000,
  'w':7*24*60*60*1000, 'n':30*24*60*60*1000, 'y':365*24*60*60*1000
}
function parseDuration(text) {
  const [all, prefix, sufix] = text.match(/^([0-9]*)([a-z]?)$/i)
  const amount = (+prefix) || 1
  const multiplier = durationMultipliers[sufix]
  if(sufix && !multiplier) throw new Error(`unknown duration sufix "${sufix}"`)
  return amount * multiplier
}

function relationDescriptors(model, now, relation, keys, withCancel = true) {
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
      descriptors.push({ type:'eq', relation: relationModel.id, keys: relKeys, eventTypes})
    }
  }
  if(relationModel.wait) {
    const timeout = { type:'timeout', relation: relationModel.id, time: now + parseDuration(relationModel.wait) }
    if(relationModel.next && relationModel.next.length > 0) timeout.keys = keys
    descriptors.push(timeout)
  }
  if(relationModel.cancel && withCancel) {
    const cancelList = []
    for(const cancelId of relationModel.cancel) {
      cancelList.push(...relationDescriptors(model, now, cancelId, keys, false))
    }
    for(const descriptor of descriptors) {
      descriptor.cancel = cancelList
    }
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

async function processEvent(event, model, now, getRelationsByEvent) {
  const { type, keys } = event
  const nextRelations = await getRelationsByEvent(type, keys)

  let newRelations = []
  let canceledRelations = []
  let actions = []

  for(let relationDescriptor of nextRelations) {
    console.log("NEXT RELATION", relationDescriptor)
    if(findDescriptor(relationDescriptor, canceledRelations)) continue
    const relationModel = model.relations[relationDescriptor.relation]
    console.log("NEXT RELATION MODEL", relationModel)
    const nextElements = relationModel.next.filter(id => model.elements[id].type == type)
    console.log("NEXT ELEMENTS", nextElements)
    if (nextElements.length > 0) {
      canceledRelations.push(...(relationDescriptor.cancel || []))
      for (const element of nextElements) {
        const elementModel = model.elements[element]
        if(elementModel.actions) actions.push(...elementModel.actions)
        for (const elementRelation of elementModel.next) {
          newRelations.push(...relationDescriptors(model, now, elementRelation, keys))
        }
      }
    }
  }

  const newElements = model.start[type]
  if(newElements) {
    for (const element of newElements) {
      const elementModel = model.elements[element]
      console.log("NEW ELEMENT", element, elementModel)
      for (const elementRelation of elementModel.next) {
        newRelations.push(...relationDescriptors(model, now, elementRelation, keys))
      }
    }
  }

  return { newRelations, canceledRelations, actions }
}

function processTimeout(timeout, model, now) {
  const timeoutModel = model.relations[timeout.relation]
  const nextElements = timeoutModel.next

  console.log("TIMEOUT", timeout)

  let newRelations = []
  let canceledRelations = []
  let actions = []

  canceledRelations.push(...(timeout.cancel || []))

  if (nextElements.length > 0) {
    for (const element of nextElements) {
      const elementModel = model.elements[element]
      if(elementModel.actions) actions.push(...elementModel.actions)
      for (const elementRelation of elementModel.next) {
        newRelations.push(...relationDescriptors(model, now, elementRelation, timeout.keys))
      }
    }
  }

  return { newRelations, canceledRelations, actions }
}

function relationKey(type, keys) {
  let keysList = Object.keys(keys || {}).map(k => [k, keys[k]])
  keysList.sort((a,b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
  return JSON.stringify([type, keysList])
}

function combinations(x, n ,p=[]) {
  if(x.length == 0 || n > x.length) return []
  if(n == 1 || x.length == 1) return x.map(e=>p.concat([e]))
  let acc = []
  for(let i = 0; i < x.length; i++) acc.push(
      ...combinations(x.slice(i+1), n - 1, p.concat([x[i]]))
  )
  return acc
}

function allCombinations(x) {
  let acc = []
  for(let i = 1; i<=x.length; i++) acc.push(...combinations(x,i))
  return acc
}

function eventRelationKeys(type, keys) {
  let keysList = Object.keys(keys).map(k => [k, keys[k]])
  keysList.sort((a,b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
  let keySets = allCombinations(keysList)
  return keySets.map(k => JSON.stringify([type,k]))
}

class LiveProcessor {
  constructor(model) {
    this.model = model
    this.eventRelations = new Map() // By event and key and value
    this.timeouts = []
  }

  getNextTimeoutTime() {
    return this.timeouts[0] ? this.timeouts[0].time : Infinity
  }

  processTime(to) {
    let allActions = []
    while(this.timeouts[0] && this.timeouts[0].time <= to) {
      const { newRelations, canceledRelations, actions } = processTimeout(this.timeouts.shift(), this.model, to)

      console.log("PROCESSING RESULTS:")
      console.log("NR: ", newRelations)
      console.log("CR: ", canceledRelations)

      this.applyChanges({ newRelations, canceledRelations })

      allActions.push(...actions)
    }
    return allActions
  }

  async processEvent(event, now) {
    const { newRelations, canceledRelations, actions } = await processEvent(event, this.model, now,
        async (type, keys) => { /// TODO: split keys to different sets
          console.log("FETCH RELATIONS", type, keys)
          const keyIds = eventRelationKeys(type, keys)
          console.log("KEY IDS:", keyIds)
          const found = keyIds.map(key => this.eventRelations.get(key) || []).reduce((a,b) => a.concat(b), [])
          console.log("FOUND:", found)
          return found
        })

    console.log("PROCESSING RESULTS:")
    console.log("NR: ", newRelations)
    console.log("CR: ", canceledRelations)

    this.applyChanges({ newRelations, canceledRelations })
    return actions
  }

  applyChanges({ newRelations, canceledRelations }) {
    for(const relation of newRelations) {
      if(relation.type == 'eq') {
        const relationStr = JSON.stringify(relation)
        for(const type of relation.eventTypes) {
          const key = relationKey(type, relation.keys)
          let relations = this.eventRelations.get(key) || []
          relations = relations.filter(rel => JSON.stringify(rel) != relationStr)
          relations.push(relation)
          if (relations.length == 1) {
            this.eventRelations.set(key, relations)
          }
        }
      } else if(relation.type == 'timeout') {
        let found = null
        const cancelStr = JSON.stringify(relation.cancel)
        for(let i = 0; i < this.timeouts.length; i++) { // Timeout de-duplication
          const timeout = this.timeouts[i]
          if(timeout.relation == relation.relation && JSON.stringify(timeout.cancel) == cancelStr) {
            if(timeout.time <= relation.time) { // it's before new one - remove it
              this.timeouts.splice(i, 1)
              i--
            } else {
              found = timeout
            }
          }
        }
        if(!found) {
          this.timeouts.push(relation)
          this.timeouts.sort((a, b) => a.time == b.time ? 0 : (a.time > b.time ? 1 : -1))
        }
      }
    }

    for(const relation of canceledRelations) {
      if(relation.type == 'eq') {
        for(const type of relation.eventTypes) {
          const key = relationKey(type, relation.keys)
          console.log("CANCEL KEY", key)
          let relations = this.eventRelations.get(key) || []
          relations = relations.filter(rel => rel.relation != relation.relation)
          if (relations.length) {
            this.eventRelations.set(key, relations)
          } else {
            this.eventRelations.delete(key)
          }
        }
      } else if(relation.type == 'timeout') {
        this.timeouts = this.timeouts.filter(to => to.relation != relation.relation)
      }
    }
  }
}

module.exports = {
  parseDuration,
  relationKey,
  processEvent,
  LiveProcessor
}
