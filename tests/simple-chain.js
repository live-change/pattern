const test = require('blue-tape')
const rp = require('../index.js')

let model

test("simple chain", (t) => {
  t.plan(2)

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
      await processor.processEvent({ type: 'enter-website', keys: { sessionId } })
      if(processor.eventRelations.get(`["start-register",[["sessionId","${sessionId}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'start-register', keys: { sessionId, userId } })
      if(processor.eventRelations.get(`["finish-register",[["userId","${userId}"]]]`)) t.pass('processed')
      else t.fail('no reaction')
    })

  })

})


