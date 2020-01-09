const { LiveProcessor } = require('./live.js')

class FullGraphProcessor extends LiveProcessor {
  constructor(model) {
    super(model)
    this.graph = new Map()
  }

  applyChanges({ newRelations, canceledRelations, transitions }, event) {
    this.addNewRelations(newRelations, (rel) => rel.events = rel.events ? [...rel.events, event] : [event])
    this.removeCanceledRelations(canceledRelations)
    let node = {
      ...event,
      prev: [],
      next: [],
      start: false
    }
    console.log("EVENT", event)
    for(const transition of transitions) {
      if(transition.relation == null) {
        node.start = true
      } else {
        for(const event of transition.relation.events) {
          node.prev.push({ relation: transition.relation.relation, to: event.id })
        }
      }
    }
    for(const prev of node.prev) {
      console.log("P", prev.to)
      const prevNode = this.graph.get(prev.to)
      prevNode.next.push({...prev, to: node.id })
    }
    this.graph.set(node.id, node)
  }
}

const addToCounter = (cont, transition, event) => cont.counter = (cont.counter || 0) + 1
const addEvent = (cont, transition, event) => {
  cont.events = cont.events || []
  if(cont.events.indexOf(event.id) == -1) cont.events.push(event.id)
}

const agg = {
  addToCounter, addEvent,

  relationSimple: {
    relationFactory: (transition, otherId) => ({ to: otherId }),
    relationEq: (transition, otherId) => (rel) => rel.to == otherId,
  },
  nodeElementDepth: {
    nodes: ({ element, relation }) => [element + ':' + (relation ? relation.depth : 0)],
    mark: (event) =>
        (rel) => rel.depth = (rel.prev && rel.prev.length)
            ? rel.prev.reduce((a, b) => Math.max(a, b.relation ? b.relation.depth : 0), 0) + 1
            : 0
  },
  nodeElement: {
    nodes: (element, relation, event) => [ element ],
    mark: null
  },

  summaryCount: {
    addToNode: addToCounter,
    addToRelation: addToCounter
  },

  summaryEvents: {
    addToNode: addEvent,
    addToRelation: addEvent
  }
}

class SummaryGraphProcessor extends LiveProcessor {
  constructor(model,
              aggregation = { ...agg.nodeElementDepth, ...agg.relationSimple, ...agg.summaryCount }
              ) {
    super(model)
    this.aggregation = aggregation
    this.graph = new Map()
  }

  applyChanges({ newRelations, canceledRelations, transitions }, event) {
    const mark = this.aggregation.mark && this.aggregation.mark(event)
    this.addNewRelations(newRelations, mark)
    this.removeCanceledRelations(canceledRelations)
    for(const transition of transitions) {
      if(transition.relation) mark(transition.relation)
      const ids = this.aggregation.nodes(transition)
      for(let id of ids) {
        let node = this.graph.get(id)
        if (!node) {
          node = {
            id,
            prev: [],
            next: [],
            start: false
          }
          this.graph.set(id, node)
        }
        this.aggregation.addToNode(node, transition, event)
        if (transition.relation == null) {
          node.start = true
        } else {
          for(const prev of transition.relation.prev) {
            const prevIds = this.aggregation.nodes(prev)
            for (const prevId of prevIds) {
              let prevRel = node.prev.find(this.aggregation.relationEq(transition, prevId))
              if(!prevRel) {
                prevRel = this.aggregation.relationFactory(transition, prevId)
                node.prev.push(prevRel)
              }
              this.aggregation.addToRelation(prevRel, transition, event)
              const prevNode = this.graph.get(prevId)
              let nextRel = prevNode.next.find(this.aggregation.relationEq(transition, id))
              if(!nextRel) {
                nextRel = this.aggregation.relationFactory(transition, id)
                prevNode.next.push(nextRel)
              }
              this.aggregation.addToRelation(nextRel, transition, event)
            }
          }
        }
      }
    }
  }
}

module.exports = {
  FullGraphProcessor,
  SummaryGraphProcessor,
  graphAggregation: agg
}