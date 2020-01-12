function findPossibleElements(events, model) {
  const out = new Map()
  for(let event of events) {
    let elementIds = []
    for(let elementId in model.elements) {
      const element = model.elements[elementId]
      if(event.type == element.type) elementIds.push(elementId)
    }
    if(elementIds.length > 0) {
      out.set(event.id, {
        ...event,
        elements: elementIds
      })
    }
  }
  return out
}

function computeFetchGroups(to, reverse, relations, model, keys) {
  for(let relation of relations) {
    const relationModel = model.relations[relation]
    if (relationModel.eq) {
      let fetchKeys = []
      for (const eq of relationModel.eq) {
        fetchKeys.push([reverse ? eq.prev : eq.next, keys[reverse ? eq.next : eq.prev]])
      }
      fetchKeys.sort((a, b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
      const id = JSON.stringify(fetchKeys)
      let fetchGroup = to.get(id) || {
        types: [],
        relations: [],
        elements: []
      }
      const elements = reverse ? relationModel.prev : relationModel.next
      fetchGroup.relations.push(relation)
      for (const element of elements) {
        fetchGroup.elements.push(element)
        const elementModel = model.elements[element]
        fetchGroup.types.push(elementModel.type)
      }
      to.set(id, fetchGroup)
    } else if (relationModel.wait) {
      const elements = reverse ? relationModel.prev : relationModel.next
      for (const element of elements) {
        const elementModel = model.elements[element]
        computeFetchGroups(to, reverse, reverse ? elementModel.prev : elementModel.next, model, keys)
      }
    }
  }
}

async function findRelatedEvents(events, reverse, model, from, to, getEventsByRelation) {
  //console.log("FIND ELEMENTS")
  const eventsWithElements = events instanceof Map ? events : findPossibleElements(events, model)
  //console.log("FIND FETCH GROUPS")
  const fetchGroups = new Map()
  for(const event of eventsWithElements.values()) {
    for(const element of event.elements) {
      const elementModel = model.elements[element]
      computeFetchGroups(fetchGroups, reverse, reverse ? elementModel.prev : elementModel.next, model, event.keys)
    }
  }
  for(const fg of fetchGroups.values()) {
    fg.elements = Array.from(new Set(fg.elements))
  }
  //console.log("FETCH GROUPS", fetchGroups.size)
  //console.log("FETCH GROUPS", fetchGroups)
  let promises = []
  for(const [keysStr, { types, relations, elements }] of fetchGroups) {
    const keyList = JSON.parse(keysStr)
    let keys = {}
    for(let [key, value] of keyList) keys[key] = value
    promises.push(
        getEventsByRelation(types, keys, from, to)
            .then(events => ({ events, relations, elements }))
    )
  }
  //console.log("WAIT FOR RESULTS")
  const fetchResults = (await Promise.all(promises))
  //console.log("MERGE RESULTS")
  let results = new Map()
  for(const { events, elements } of fetchResults) {
    for(const inEvent of events) {
      let event = results.get(inEvent.id)
      if(!event) {
        event = { ...inEvent, elements: [] }
        results.set(inEvent.id, event)
      }
      //console.log("EVENT", inEvent.id, "ELEMENTS", elements)
      for(const element of elements) {
        const elementModel = model.elements[element]
        if (elementModel.type == event.type) {
          event.elements.push(element)
        }
      }
    }
  }
  return results
}

async function findAllRelatedEvents(events, reverse, model, from, to, getEventsByRelation) {
  let workingSet = events
  let all = new Map()
  let newFound
  do {
    console.log("SEARCH FOR MORE")
    const next = await findRelatedEvents(workingSet, reverse, model, from, to, getEventsByRelation)
    console.log("NEXT", next.size)
    console.log("ALL", all.size)
    workingSet = Array.from(next.values()).filter(ev => !all.has(ev.id))
    console.log("WORKING SET", workingSet.length)
    all = new Map([...all, ...next])
  } while(workingSet.length)
  return all
}

module.exports = {
  findPossibleElements,
  findRelatedEvents,
  findAllRelatedEvents
}
