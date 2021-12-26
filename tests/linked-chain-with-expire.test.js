const test = require('tape')
const rp = require('../index.js')

let model

test("compile fail2ban chain with expire", (t) => {

  t.plan(2)

  let { model: compiled } =
      rp.first({ id: "first-failed-attempt", type: "failed-login" })
      .link({ eq: "ip", expire: "2m" },
          rp.first({ id: "second-failed-attempt", type: "failed-login", actions: ['ban'] })
      )

  console.log(JSON.stringify(compiled, null, '  '))

  model = compiled

  t.deepEqual(model, {
        "elements": {
          "first-failed-attempt": {
            "id": "first-failed-attempt",
            "type": "failed-login",
            "prev": [],
            "next": [
              "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt",
              "first-failed-attempt/wait:2m@[ip|wait:2m]"
            ]
          },
          "second-failed-attempt": {
            "id": "second-failed-attempt",
            "type": "failed-login",
            "actions": [
              "ban"
            ],
            "prev": [
              "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt"
            ],
            "next": []
          }
        },
        "relations": {
          "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt": {
            "eq": [
              {
                "prev": "ip",
                "next": "ip"
              }
            ],
            "id": "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt",
            "cancel": [
              "first-failed-attempt/wait:2m@[ip|wait:2m]"
            ],
            "prev": [
              "first-failed-attempt"
            ],
            "next": [
              "second-failed-attempt"
            ]
          },
          "first-failed-attempt/wait:2m@[ip|wait:2m]": {
            "id": "first-failed-attempt/wait:2m@[ip|wait:2m]",
            "wait": "2m",
            "cancel": [
              "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt",
              "first-failed-attempt/wait:2m@[ip|wait:2m]"
            ],
            "prev": [
              "first-failed-attempt"
            ],
            "next": []
          }
        }
      }, "compiled ok")

  t.test('live processor', (t) => {
    t.plan(4)

    rp.prepareModelForLive(model)
    const processor = new rp.LiveProcessor(model, rp.relationsStore())
    const ip = (Math.random()*1000).toFixed()

    let time = 0

    t.test('push first event', async (t) => {
      t.plan(1)
      const actions = await processor.processEvent({ type: 'failed-login', keys: { ip }, time }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
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
      const actions = await processor.processEvent({ type: 'failed-login', keys: { ip }, time }, 0)
      console.log("EVT", processor.store.eventRelations)
      console.log("TO", processor.timeouts)
      console.log("ACTIONS", actions)
      if(processor.store.eventRelations.get(`["failed-login",[["ip","${ip}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

    t.test('push third event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({ type: 'failed-login', keys: { ip }, time }, 0)
      console.log("ACTIONS", actions)
      t.deepEqual(actions, ['ban'],'actions match')
    })

  })


})


