const { LiveProcessor } = require('./live.js')

function updateGraph(event, transitions, aggregation, addToNode, addToRelation) {
  const mark = aggregation.mark && aggregation.mark(event)
  for(const transition of transitions) {
    if(transition.relation && mark) mark(transition.relation)
    const ids = aggregation.nodes(transition, event.keys)
    console.log("TR", transition, 'KEYS', event.keys, 'IDS', ids)
    for(let id of ids) {
      addToNode(id, transition, event, !transition.relation)
      if (transition.relation != null) {
        for(const prev of transition.relation.prev) {
          const prevIds = aggregation.nodes(prev, transition.relation && transition.relation.keys)
          for(const prevId of prevIds) {
            addToRelation(id, prevId, transition, event, true)
            addToRelation(prevId, id, transition, event, false)
          }
        }
      }
    }
  }
}

class FullGraphProcessor extends LiveProcessor {
  constructor(model, store) {
    super(model, store)
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
    nodes: ({ element, relation }, keys) => [element + ':' + (relation?.depth ?? 0)],
    mark: (event) =>
        (rel) => rel.depth = (rel.prev && rel.prev.length)
            ? rel.prev.reduce((a, b) => Math.max(a, b?.relation?.depth ?? 0), 0) + 1
            : 0
  },
  nodeElement: {
    nodes: ({ element, relation }, keys) => [ element ],
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
  constructor(model, store,
              aggregation = { ...agg.nodeElementDepth, ...agg.relationSimple, ...agg.summaryCount }
              ) {
    super(model, store)
    this.aggregation = aggregation
    this.graph = new Map()
  }

  async applyChanges({ newRelations, canceledRelations, transitions }, event) {
    const mark = this.aggregation.mark && this.aggregation.mark(event)
    this.addNewRelations(newRelations, mark)
    this.removeCanceledRelations(canceledRelations)

    await updateGraph(event, transitions, this.aggregation,
      (id, transition, event, start) => {
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
        if(start) node.start = true
      },
      (fromId, toId, transition, event, prev) => {
        let node = this.graph.get(fromId)
        if(!node) console.log("NODE", node, fromId)
        if(!node) throw new Error('node '+fromId+' not found when adding relation')
        const list = (prev ? node.prev : node.next)
        let rel = list.find(this.aggregation.relationEq(transition, toId))
        if(!rel) {
          rel = this.aggregation.relationFactory(transition, toId)
          list.push(rel)
        }
        this.aggregation.addToRelation(rel, transition, event)
      }
    )
  }
}

function computeGraphDepth(graph, startingNodes, fieldName = 'depth') {
  let workingSet = startingNodes.map(node => ({ node, depth: 0 }))
  while(workingSet.length > 0) {
    let next = []
    for(const nodeInfo of workingSet) {
      let node = graph.get(nodeInfo.node)
      node[fieldName] = nodeInfo.depth
      next.push(...(
          node.prev
              .map(r => ({ node: r.to, depth: nodeInfo.depth - 1 }))
              .filter(r => !graph.get(r.node).hasOwnProperty(fieldName))
      ))
      next.push(...(
          node.next
              .map(r => ({ node: r.to, depth: nodeInfo.depth + 1 }))
              .filter(r => !graph.get(r.node).hasOwnProperty(fieldName))
      ))
    }
    workingSet = next
  }
}

function graphToD3Sankey(graph,
                         nodeFunc = n => n,
                         linkFunc = (rel, source, target) => ({ value: 1, ...rel })) {
  let d3graph = {
    nodes:[],
    links:[]
  }
  const nodeMap = new Map()
  for(let node of graph.values()) {
    const d3node = nodeFunc(node)
    d3graph.nodes.push(d3node)
    nodeMap.set(node.id, d3node)
  }
  for(let node of graph.values()) {
    const d3node = nodeMap.get(node.id)
    for (let next of node.next) {
      const to = nodeMap.get(next.to)
      d3graph.links.push({ source: node.id, target: next.to, ...linkFunc(next, d3node, to) })
    }
  }
  return d3graph
}

module.exports = {
  FullGraphProcessor,
  SummaryGraphProcessor,
  graphAggregation: agg,
  computeGraphDepth,
  graphToD3Sankey
}