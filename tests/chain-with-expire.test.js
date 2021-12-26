const test = require('tape')
const lcp = require('../index.js')

let model

test("compile fail2ban chain with expire", (t) => {

  t.plan(2)

  let { model: compiled, last } = lcp.chain([
    "failed-login",
    { eq: "ip", expire: "2m" },
    "failed-login"
  ])

  compiled.elements[last].actions = [ 'ban' ]

  console.log(JSON.stringify(compiled, null, '  '))

  model = compiled

  t.deepEqual(model, {
    "elements": {
      "failed-login": {
        "type": "failed-login",
        "id": "failed-login",
        "prev": [],
        "next": [
          "failed-login/ip@[ip|wait:2m]/failed-login",
          "failed-login/wait:2m@[ip|wait:2m]"
        ]
      },
      "failed-login/ip|wait:2m/failed-login": {
        "type": "failed-login",
        "id": "failed-login/ip|wait:2m/failed-login",
        "prev": [
          "failed-login/ip@[ip|wait:2m]/failed-login",
          "failed-login/wait:2m@[ip|wait:2m]"
        ],
        "next": [],
        "actions": ['ban']
      }
    },
    "relations": {
      "failed-login/ip@[ip|wait:2m]/failed-login": {
        "eq": [
          {
            "prev": "ip",
            "next": "ip"
          }
        ],
        "id": "failed-login/ip@[ip|wait:2m]/failed-login",
        "cancel": [
          "failed-login/wait:2m@[ip|wait:2m]"
        ],
        "prev": [
          "failed-login"
        ],
        "next": [
          "failed-login/ip|wait:2m/failed-login"
        ]
      },
      "failed-login/wait:2m@[ip|wait:2m]": {
        "id": "failed-login/wait:2m@[ip|wait:2m]",
        "wait": "2m",
        "cancel": [
          "failed-login/ip@[ip|wait:2m]/failed-login",
          "failed-login/wait:2m@[ip|wait:2m]"
        ],
        "prev": [
          "failed-login"
        ],
        "next": []
      }
    }
  })

  t.test('live processor', (t) => {
    t.plan(4)

    lcp.prepareModelForLive(model)
    const processor = new lcp.LiveProcessor(model, lcp.relationsStore())
    const ip = (Math.random()*1000).toFixed()
    let time = 0

    t.test('push first event', async (t) => {
      t.plan(1)
      const actions = await processor.processEvent({ id:1, type: 'failed-login', keys: { ip }, time }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
      const relations = await processor.store.getRelations('failed-login', { ip })
      console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(processor.store.eventRelations.get(`["failed-login",[["ip","${ip}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

    t.test('wait 2.5m for expire', async (t) => {
      t.plan(1)
      time += 2.5 * 60 * 1000
      const actions = await processor.processTime(time)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
      if(!processor.store.eventRelations.get(`["failed-login",[["ip","${ip}"]]]`)) t.pass('expired')
      else t.fail('still exists')
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({ id:2, type: 'failed-login', keys: { ip }, time }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
      if(processor.store.eventRelations.get(`["failed-login",[["ip","${ip}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

    t.test('push third event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({ id:3, type: 'failed-login', keys: { ip }, time }, 0)
      console.log("ACTIONS", actions)
      t.deepEqual(actions, ['ban'],'actions match')
    })

  })

})


