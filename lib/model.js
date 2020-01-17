const stepSeparator = '/'

function compileElement(element, namePrefix) {
  if(typeof element == 'string') return compileElement({ type: element }, namePrefix)
  element.id = element.id || namePrefix + element.type
  element.prev = []
  element.next = []
  return element
}
function compileEq(eq) {
  if(!Array.isArray(eq)) return compileEq([eq])
  return eq.map(e => {
    if(typeof e == 'string') return { prev: e, next: e }
    return e
  })
}
function compileSingleRelation(relation) {
  if(typeof relation == 'string') return compileSingleRelation({ eq: relation })
  if(!relation.eq) throw new Error("relation without keys")
  let compiledRelation = {}
  let results = [compiledRelation]
  compiledRelation.eq = compileEq(relation.eq)
  let nameParts = []
  nameParts.push(...(compiledRelation.eq.map(e => e.prev == e.next ? e.prev : `${e.prev}=${e.next}`)))
  compiledRelation.id = nameParts.join('&')
  if(relation.expire) {
    results.push({
      id: `wait:${relation.expire}`,
      wait: relation.expire,
      cancelOther: true,
      othersCancel: true
    })
  }
  return results
}
function compileRelation(relations, prevElementId, once) {
  if(!Array.isArray(relations)) return compileRelation([relations], prevElementId)

  let compiledRelations = []
  for(let input of relations) {
    compiledRelations.push(...compileSingleRelation(input))
  }
  let groupId = compiledRelations.map(r => r.id).join('|')
  for(let relation of compiledRelations) {
    relation.id = prevElementId + stepSeparator + relation.id
  }
  if(compiledRelations.length > 1) {
    for (let rel of compiledRelations) {
      rel.id = `${rel.id}@[${groupId}]`
      if (rel.cancel) rel.cancel = rel.cancel.map(id => `${rel.id}@[${groupId}]`)
    }
  }
  for (let rel1 of compiledRelations) {
    if(once || rel1.cancelOther) {
      for (let rel2 of compiledRelations) {
        rel1.cancel = rel1.cancel || []
        if(rel1.cancel.indexOf(rel2.id) == -1) rel1.cancel.push(rel2.id)
      }
      delete rel1.cancelOther
    }
  }
  for (let rel2 of compiledRelations) {
    if(rel2.othersCancel) {
      for (let rel1 of compiledRelations) {
        rel1.cancel = rel1.cancel || []
        if(rel1.cancel.indexOf(rel2.id) == -1) rel1.cancel.push(rel2.id)
      }
      delete rel2.othersCancel
    }
  }

  for(let relation of compiledRelations) {
    relation.prev = []
    relation.next = []
  }
  return { relations: compiledRelations, group: groupId }
}
function isRelationConnected(relation) {
  if(relation.wait) return false
  return true
}

class ModelBuilder {
  constructor(model, first, last) {
    this.model = model
    this.first = first
    this.last = last
  }

  next(relation, element, once) {
    const prev = this
    let model = JSON.parse(JSON.stringify(prev.model))
    const { relations, group } = compileRelation(relation, prev.last, once)
    const namePrefix = prev.last + stepSeparator + group + stepSeparator
    const nextElement = element && compileElement(element, namePrefix)

    for(let r of relations) {
      r.prev.push(prev.last)
      if(nextElement && isRelationConnected(r)) {
        r.next.push(nextElement.id)
        const nid = r.id + stepSeparator + nextElement.id.slice(namePrefix.length)
        for(let or of relations) if(or.cancel) or.cancel = or.cancel.map(o => o == r.id ? nid : o)
        r.id = nid
      }
      if(model.relations[r.id]) throw new Error(`relation ${r.id} already exists`)
      model.relations[r.id] = r
    }
    console.log("NR", relations.map(r => r.id))
    model.elements[prev.last].next.push(...relations.map(r => r.id))
    if(nextElement) {
      if(!model.elements[nextElement.id]) model.elements[nextElement.id] = nextElement
      nextElement.prev.push(...relations.map(r => r.id))
    }

    return new ModelBuilder( model, prev.first, (nextElement && nextElement.id) || prev.last )
  }

  link(relation, next, once) {
    const prev = this
    let model = mergeModels(prev.model, next.model)
    const { relations, group } = compileRelation(relation, prev.last, once)
    for(let r of relations) {
      r.prev.push(prev.last)
      if(isRelationConnected(r)) {
        r.next.push(next.first)
        const nid = r.id + stepSeparator + next.first
        for (let or of relations) if(or.cancel) or.cancel = or.cancel.map(o => o == r.id ? nid : o)
        r.id = nid
        model.elements[next.first].prev.push(r.id)
      }
      if(model.relations[r.id]) throw new Error(`relation ${r.id} already exists`)
      model.relations[r.id] = r
      model.elements[prev.last].next.push(r.id)
    }

    return new ModelBuilder( model, prev.first, next.last )
  }

}

function first(element) {
  let model = {
    elements: {},
    relations: {}
  }
  const compiled = compileElement(element, '')
  model.elements[compiled.id] = compiled
  return new ModelBuilder( model, compiled.id, compiled.id )
}

function chain(parts) {
  let acc
  for (let i = 1; i < parts.length; i += 2) {
    acc = acc || first(parts[i - 1])
    acc = acc.next(parts[i], parts[i + 1])
  }
  return acc
}

function isElementsMergeable(a, b) {
  return JSON.stringify({...a, next: null}) == JSON.stringify({...b, next: null})
}
function mergeElements(a, b) {
  return { ...a, ...b, next: a.next.concat(b.next)}
}
function isRelationsIdentical(a, b) {
  return JSON.stringify(a) == JSON.stringify(b)
}

function mergeModels(...models) {
  let model = {
    elements: {},
    relations: {}
  }
  for(let next of models) {
    next = JSON.parse(JSON.stringify(next))
    for(let elementId in next.elements) {
      const currentElement = model.elements[elementId]
      const nextElement = next.elements[elementId]
      if(!currentElement) {
        model.elements[elementId] = nextElement
      } else {
        if(!isElementsMergeable(currentElement, nextElement))
          throw new Error(`Element ${elementId} is not mergeable:`
              +`\n${JSON.stringify(currentElement)}\n${JSON.stringify(nextElement)}`)
        model.elements[elementId] = mergeElements(currentElement, nextElement)
      }
    }
    for(let relationId in next.relations) {
      const currentRelation = model.relations[relationId]
      const nextRelation = next.relations[relationId]
      if(!currentRelation) {
        model.relations[relationId] = nextRelation
      } else {
        if(!isRelationsIdentical(currentRelation, nextRelation))
          throw new Error(`Relation ${relationId} is not mergeable:`
              +`\n${JSON.stringify(currentRelation)}\n${JSON.stringify(nextRelation)}`)
      }
    }
  }
  return model
}

function prepareModelForLive(model) {
  model.start = {}
  for(const id in model.elements) {
    const element = model.elements[id]
    if(element.prev.length == 0) {
      const elements = model.start[element.type] || []
      elements.push(element.id)
      if(elements.length == 1) model.start[element.type] = elements
    }
  }
}

module.exports = {
  first,
  chain,
  mergeModels,
  prepareModelForLive
}
