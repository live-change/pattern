const { allCombinations } = require('./combinations.js')

function relationKey(type, keys) {
  let keysList = Object.keys(keys || {}).map(k => [k, keys[k]])
  keysList.sort((a,b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
  return JSON.stringify([type, keysList])
}

function eventRelationKeys(type, keys) {
  let keysList = Object.keys(keys).map(k => [k, keys[k]])
  keysList.sort((a,b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
  let keySets = allCombinations(keysList)
  return keySets.map(k => JSON.stringify([type,k]))
}


function relationsStore() {
  let eventRelations = new Map() // By event and key and value
  let eventRelationsBySource = new Map()

  async function getRelations(type, keys, properties) {
    const keyIds = eventRelationKeys(type, keys)
    const found = keyIds.map(key => eventRelations.get(key) || []).reduce((a,b) => a.concat(b), [])
    if(found.length == 0) {
      //console.log("NOT FOUND RELATIONS", type, keys,"KEY IDS:", keyIds)
    }
    return found
  }

  async function saveRelation(relation, mark = null) {
    let keys = []
    for(const type of relation.eventTypes) {
      const key = relationKey(type, relation.keys)
      //console.log("ADD REL", key, relation)
      let relations = eventRelations.get(key) || []
      const currentRelation = relations.find(rel => rel.relation == relation.relation)
      if(currentRelation) {
        currentRelation.prev.push(...relation.prev)
        if(mark) mark(currentRelation)
      } else {
        if(mark) mark(relation)
        relations.push(relation)
      }
      if (relations.length == 1) {
        eventRelations.set(key, relations)
      }
      keys.push(key)
    }
    const id = JSON.stringify([relation.source, relation.relation])
    eventRelationsBySource.set(id, keys)
  }

  async function removeRelation({ relation, source }) {
    const id = JSON.stringify([source, relation])
    const keys = eventRelationsBySource.get(id)
    for(const key of keys) {
      let relations = eventRelations.get(key) || []
      relations = relations.filter(rel => rel.relation != relation || rel.source != source)
      if (relations.length) {
        eventRelations.set(key, relations)
      } else {
        eventRelations.delete(key)
      }
    }
    eventRelationsBySource.delete(id)
  }

  return {
    getRelations,
    saveRelation,
    removeRelation,
    eventRelations
  }
}




module.exports = {
  relationsStore,
  relationKey,
  eventRelationKeys
}