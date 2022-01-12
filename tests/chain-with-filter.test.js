const test = require('tape')
const lcp = require('../index.js')

let model

test("compile fail2ban chain with expire", (t) => {

  t.plan(3)

  let { model: compiled, last } = lcp.chain([
    { type: "failed-authentication", match: { secretType: 'code' } },
    "ip",
    { type: "failed-authentication", match: { secretType: 'code' } }
  ])

  compiled.elements[last].actions = [ 'ban' ]

  console.log(JSON.stringify(compiled, null, '  '))

  model = compiled

  t.deepEqual(model, {
    "elements": {
      "failed-authentication": {
        "type": "failed-authentication",
        "match": {
          "secretType": "code"
        },
        "id": "failed-authentication",
        "prev": [],
        "next": [
          "failed-authentication/ip/failed-authentication"
        ]
      },
      "failed-authentication/ip/failed-authentication": {
        "type": "failed-authentication",
        "match": {
          "secretType": "code"
        },
        "id": "failed-authentication/ip/failed-authentication",
        "prev": [
          "failed-authentication/ip/failed-authentication"
        ],
        "next": [],
        "actions": [
          "ban"
        ]
      }
    },
    "relations": {
      "failed-authentication/ip/failed-authentication": {
        "eq": [
          {
            "prev": "ip",
            "next": "ip"
          }
        ],
        "id": "failed-authentication/ip/failed-authentication",
        "prev": [
          "failed-authentication"
        ],
        "next": [
          "failed-authentication/ip/failed-authentication"
        ]
      }
    }
  })

  t.test('live processor with second event filtered', (t) => {
    t.plan(3)

    lcp.prepareModelForLive(model)
    const processor = new lcp.LiveProcessor(model, lcp.relationsStore())
    const ip = (Math.random() * 1000).toFixed()
    let time = 0

    t.test('push first event', async (t) => {
      t.plan(1)
      const actions = await processor.processEvent({
        id: 1, type: 'failed-authentication', keys: { ip }, properties: { secretType: 'code' }, time
      }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
      const relations = await processor.store.getRelations('failed-authentication', { ip })
      console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(processor.store.eventRelations.get(`["failed-authentication",[["ip","${ip}"]]]`)) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

    t.test('push second event', async (t) => {
      t.plan(2)
      time += 1000
      const actions = await processor.processEvent({
        id: 2, type: 'failed-authentication', keys: { ip }, properties: { secretType: 'link' }, time
      }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      const relations = await processor.store.getRelations('failed-authentication', { ip })
      console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      console.log("ACTIONS", actions)
      if(actions.length > 0) {
        t.fail('actions where it should be filtered')
      } else {
        t.pass('event filtered')
      }
      if(processor.store.eventRelations.get(`["failed-authentication",[["ip","${ip}"]]]`)) {
        t.pass('previous event exist')
      } else {
        t.fail('previous event not exist')
      }
    })

    t.test('push third event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({
        id: 3, type: 'failed-authentication', keys: { ip }, properties: { secretType: 'code' },  time
      }, 0)
      console.log("ACTIONS", actions)
      t.deepEqual(actions, ['ban'], 'actions match')
    })

  })

  t.test('live processor with first event filtered', (t) => {
    t.plan(3)

    lcp.prepareModelForLive(model)
    const processor = new lcp.LiveProcessor(model, lcp.relationsStore())
    const ip = (Math.random() * 1000).toFixed()
    let time = 0

    t.test('push first event', async (t) => {
      t.plan(1)
      const actions = await processor.processEvent({
        id: 1, type: 'failed-authentication', keys: { ip }, properties: { secretType: 'link' }, time
      }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
      const relations = await processor.store.getRelations('failed-authentication', { ip })
      console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(!processor.store.eventRelations.get(`["failed-authentication",[["ip","${ip}"]]]`)) {
        t.pass('filtered')
      } else {
        t.fail('processed')
      }
    })

    t.test('push second event', async (t) => {
      t.plan(2)
      time += 1000
      const actions = await processor.processEvent({
        id: 1, type: 'failed-authentication', keys: { ip }, properties: { secretType: 'code' }, time
      }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
      const relations = await processor.store.getRelations('failed-authentication', { ip })
      console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(processor.store.eventRelations.get(`["failed-authentication",[["ip","${ip}"]]]`)) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
      console.log("ACTIONS", actions)
      if(actions.length > 0) {
        t.fail('actions where it should be filtered')
      } else {
        t.pass('no action')
      }
    })

    t.test('push third event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({
        id: 3, type: 'failed-authentication', keys: { ip }, properties: { secretType: 'code' },  time
      }, 0)
      console.log("ACTIONS", actions)
      t.deepEqual(actions, ['ban'], 'actions match')
    })

  })

})


