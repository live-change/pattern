const test = require('tape')
const rp = require('../index.js')

let model

test("compile simple chain", (t) => {

  t.plan(2)

  let { model: compiled } =
      rp.first({ id: 'visitor', type: 'enter-website' })
          .link("sessionId", rp.first({ id: 'started-registration', type: 'start-register' }))
          .link("userId", rp.first({ id: 'registered', type: 'finish-register' }))

  console.log(JSON.stringify(compiled, null, '  '))

  model = compiled

  t.deepEqual(model, {
    "elements": {
      "visitor": {
        "id": "visitor",
        "type": "enter-website",
        "prev": [],
        "next": [
          "visitor/sessionId/started-registration"
        ]
      },
      "started-registration": {
        "id": "started-registration",
        "type": "start-register",
        "prev": [
          "visitor/sessionId/started-registration"
        ],
        "next": [
          "started-registration/userId/registered"
        ]
      },
      "registered": {
        "id": "registered",
        "type": "finish-register",
        "prev": [
          "started-registration/userId/registered"
        ],
        "next": []
      }
    },
    "relations": {
      "visitor/sessionId/started-registration": {
        "eq": [
          {
            "prev": "sessionId",
            "next": "sessionId"
          }
        ],
        "id": "visitor/sessionId/started-registration",
        "prev": [
          "visitor"
        ],
        "next": [
          "started-registration"
        ]
      },
      "started-registration/userId/registered": {
        "eq": [
          {
            "prev": "userId",
            "next": "userId"
          }
        ],
        "id": "started-registration/userId/registered",
        "prev": [
          "started-registration"
        ],
        "next": [
          "registered"
        ]
      }
    }
  }, 'model compiled')

  t.test('live processor', (t) => {
    t.plan(2)

    rp.prepareModelForLive(model)
    const processor = new rp.LiveProcessor(model, rp.relationsStore())
    const sessionId = (Math.random()*1000).toFixed()
    const userId = (Math.random()*1000).toFixed()

    t.test('push first event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'enter-website', keys: { sessionId }, time: 0 })
      if(processor.store.eventRelations.get(`["start-register",[["sessionId","${sessionId}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'start-register', keys: { sessionId, userId }, time: 100 })
      if(processor.store.eventRelations.get(`["finish-register",[["userId","${userId}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

  })

})


