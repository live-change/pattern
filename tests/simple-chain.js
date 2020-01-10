const test = require('tape')
const rp = require('../index.js')

let model

test("simple chain", (t) => {
  t.plan(4)

  t.test('compile', (t) => {
    t.plan(1)

    let { model: compiled } = rp.chain([
      "enter-website",
      "sessionId",
      "start-register",
      "userId",
      "finish-register"
    ])

    console.log(JSON.stringify(compiled, null, '  '))

    model = compiled

    t.deepEqual(model,{
          "elements": {
            "enter-website": {
              "type": "enter-website",
              "id": "enter-website",
              "prev": [],
              "next": [
                "enter-website/sessionId/start-register"
              ]
            },
            "enter-website/sessionId/start-register": {
              "type": "start-register",
              "id": "enter-website/sessionId/start-register",
              "prev": [
                "enter-website/sessionId/start-register"
              ],
              "next": [
                "enter-website/sessionId/start-register/userId/finish-register"
              ]
            },
            "enter-website/sessionId/start-register/userId/finish-register": {
              "type": "finish-register",
              "id": "enter-website/sessionId/start-register/userId/finish-register",
              "prev": [
                "enter-website/sessionId/start-register/userId/finish-register"
              ],
              "next": []
            }
          },
          "relations": {
            "enter-website/sessionId/start-register": {
              "eq": [
                {
                  "prev": "sessionId",
                  "next": "sessionId"
                }
              ],
              "id": "enter-website/sessionId/start-register",
              "prev": [
                "enter-website"
              ],
              "next": [
                "enter-website/sessionId/start-register"
              ]
            },
            "enter-website/sessionId/start-register/userId/finish-register": {
              "eq": [
                {
                  "prev": "userId",
                  "next": "userId"
                }
              ],
              "id": "enter-website/sessionId/start-register/userId/finish-register",
              "prev": [
                "enter-website/sessionId/start-register"
              ],
              "next": [
                "enter-website/sessionId/start-register/userId/finish-register"
              ]
            }
          }
        }
        , 'model compiled')

  })

  t.test('live processor', (t) => {
    t.plan(2)

    rp.prepareModelForLive(model)
    const processor = new rp.LiveProcessor(model)
    const sessionId = (Math.random()*1000).toFixed()
    const userId = (Math.random()*1000).toFixed()

    t.test('push first event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'enter-website', keys: { sessionId }, time: 0 })
      if(processor.eventRelations.get(`["start-register",[["sessionId","${sessionId}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'start-register', keys: { sessionId, userId }, time: 100 })
      if(processor.eventRelations.get(`["finish-register",[["userId","${userId}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

  })

  t.test("test relations search", async (t) => {
    t.plan(4)

    const sessionId = (Math.random()*1000).toFixed()
    const userId = (Math.random()*1000).toFixed()

    const events = [
      { id: 0, type: 'enter-website', keys: { sessionId } },
      { id: 1, type: 'start-register', keys: { sessionId, userId } },
      { id: 2, type: 'finish-register', keys: { userId  } }
    ]

    async function getEventsByRelation( types, keys, from, to ) {
      console.log("GETEVENTS", types, keys, from, to)
      return events.filter(ev => {
        if(types.indexOf(ev.type) == -1) return
        for(let key in keys) if(ev.keys[key] != keys[key]) return
        return true
      })
    }

    t.test("related previous events", async (t) => {
      t.plan(1)
      const related = await rp.findRelatedEvents([events[2]], true, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [{
        ...events[1], elements: ['enter-website/sessionId/start-register']
      }], "found related events")
    })

    t.test("all related previous events", async (t) => {
      t.plan(1)
      const related = await rp.findAllRelatedEvents([events[2]], true, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [
        { ...events[1], elements: [ 'enter-website/sessionId/start-register' ] },
        { ...events[0], elements: [ 'enter-website' ] }
      ], "found related events")
    })

    t.test("related next events", async (t) => {
      t.plan(1)
      const related = await rp.findRelatedEvents([events[0]], false, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [{
        ...events[1], elements: ['enter-website/sessionId/start-register']
      }], "found related events")
    })

    t.test("all related previous events", async (t) => {
      t.plan(1)
      const related = await rp.findAllRelatedEvents([events[0]], false, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [
        { ...events[1], elements: [ 'enter-website/sessionId/start-register' ] },
        { ...events[2], elements: [ 'enter-website/sessionId/start-register/userId/finish-register' ] }
      ], "found related events")
    })
  })

  t.test("test graphs", async (t) => {
    t.plan(3)

    const sessionId = (Math.random() * 1000).toFixed()
    const userId = (Math.random() * 1000).toFixed()
    const userId2 = userId + 1

    const events = [
      {id: 0, type: 'enter-website', keys: {sessionId}, time: 0},
      {id: 1, type: 'enter-website', keys: {sessionId}, time: 1000},
      {id: 2, type: 'start-register', keys: {sessionId, userId}, time: 2000},
      {id: 3, type: 'start-register', keys: {sessionId, userId: userId2}, time: 3000},
      {id: 4, type: 'finish-register', keys: {userId}, time: 4000}
    ]

    t.test("build full graph", async (t) => {
      t.plan(1)
      const processor = new rp.FullGraphProcessor(model)
      for(const ev of events) await processor.processEvent(ev)
      console.log("GRAPH\n  "+Array.from(processor.graph.values()).map(n => JSON.stringify(n)).join('\n  '))
      t.deepEqual(Array.from(processor.graph.values()), [
        {"id":0,"type":"enter-website","keys":{"sessionId":""+sessionId},"time":0,"prev":[],"next":[
            {"relation":"enter-website/sessionId/start-register","to":2},
            {"relation":"enter-website/sessionId/start-register","to":3}],
          "start":true},
        {"id":1,"type":"enter-website","keys":{"sessionId":""+sessionId},"time":1000,"prev":[],"next":[
            {"relation":"enter-website/sessionId/start-register","to":2},
            {"relation":"enter-website/sessionId/start-register","to":3}],
          "start":true},
        {"id":2,"type":"start-register","keys":{"sessionId":""+sessionId,"userId":""+userId},"time":2000,
          "prev":[
            {"relation":"enter-website/sessionId/start-register","to":0},
            {"relation":"enter-website/sessionId/start-register","to":1}],
          "next":[
            {"relation":"enter-website/sessionId/start-register/userId/finish-register","to":4}],
          "start":false},
        {"id":3,"type":"start-register","keys":{"sessionId":""+sessionId,"userId":""+userId2},"time":3000,"prev":[
            {"relation":"enter-website/sessionId/start-register","to":0},
            {"relation":"enter-website/sessionId/start-register","to":1}],
          "next":[],"start":false},
        {"id":4,"type":"finish-register","keys":{"userId":""+userId},"time":4000,"prev":[
            {"relation":"enter-website/sessionId/start-register/userId/finish-register","to":2}],
          "next":[],"start":false}
      ], 'proper graph generated')
    })

    t.test("build summary graph with count", async (t) => {
      t.plan(1)
      const processor = new rp.SummaryGraphProcessor(model)
      for(const ev of events) await processor.processEvent(ev)
      console.log("GRAPH\n  "+Array.from(processor.graph.values()).map(n => JSON.stringify(n)).join('\n  '))
      t.deepEqual(Array.from(processor.graph.values()), [
        {"id":"enter-website:0","prev":[],
          "next":[{"to":"enter-website/sessionId/start-register:1","counter":4}],
          "start":true,"counter":2},
        {"id":"enter-website/sessionId/start-register:1",
          "prev":[{"to":"enter-website:0","counter":4}],
          "next":[{"to":"enter-website/sessionId/start-register/userId/finish-register:2","counter":1}],
          "start":false,"counter":2},
        {"id":"enter-website/sessionId/start-register/userId/finish-register:2",
          "prev":[{"to":"enter-website/sessionId/start-register:1","counter":1}],
          "next":[],"start":false,"counter":1}
      ], 'proper graph generated')
    })

    t.test("build summary graph with events", async (t) => {
      t.plan(1)
      const processor = new rp.SummaryGraphProcessor(model, {
        ...rp.graphAggregation.nodeElementDepth,
        ...rp.graphAggregation.relationSimple,
        ...rp.graphAggregation.summaryEvents
      })
      for (const ev of events) await processor.processEvent(ev)
      console.log("GRAPH\n  " + Array.from(processor.graph.values()).map(n => JSON.stringify(n)).join('\n  '))
      t.deepEqual(Array.from(processor.graph.values()), [
        {"id":"enter-website:0","prev":[],
          "next":[{"to":"enter-website/sessionId/start-register:1","events":[2,3]}],
          "start":true,"events":[0,1]},
        {"id":"enter-website/sessionId/start-register:1",
          "prev":[{"to":"enter-website:0","events":[2,3]}],
          "next":[{"to":"enter-website/sessionId/start-register/userId/finish-register:2","events":[4]}],
          "start":false,"events":[2,3]},
        {"id":"enter-website/sessionId/start-register/userId/finish-register:2",
          "prev":[{"to":"enter-website/sessionId/start-register:1","events":[4]}],
          "next":[],
          "start":false,"events":[4]}

      ], 'proper graph generated')
    })
  })

})


