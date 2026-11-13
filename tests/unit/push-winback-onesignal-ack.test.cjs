#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { classifyOneSignalResponse } = require('../../scripts/automation/push-winback.cjs')

const accepted200 = classifyOneSignalResponse({
  status: 200,
  body: JSON.stringify({ id: 'notification-123', recipients: 2 }),
})
assert.equal(accepted200.accepted, true)
assert.equal(accepted200.id, 'notification-123')
assert.equal(accepted200.recipients, 2)

const accepted201 = classifyOneSignalResponse({
  status: 201,
  body: JSON.stringify({ id: 'notification-456' }),
})
assert.equal(accepted201.accepted, true)

const noSubscribers = classifyOneSignalResponse({
  status: 200,
  body: JSON.stringify({ id: '', errors: ['All included players are not subscribed'] }),
})
assert.equal(noSubscribers.accepted, false)
assert.equal(noSubscribers.reason, 'api_errors')

const emptyId = classifyOneSignalResponse({
  status: 200,
  body: JSON.stringify({ id: '', recipients: 0 }),
})
assert.equal(emptyId.accepted, false)
assert.equal(emptyId.reason, 'missing_notification_id')

const zeroRecipients = classifyOneSignalResponse({
  status: 200,
  body: JSON.stringify({ id: 'notification-empty', recipients: 0 }),
})
assert.equal(zeroRecipients.accepted, false)
assert.equal(zeroRecipients.reason, 'zero_recipients')

const malformed = classifyOneSignalResponse({ status: 200, body: 'not-json' })
assert.equal(malformed.accepted, false)
assert.equal(malformed.reason, 'invalid_json')

const httpError = classifyOneSignalResponse({ status: 401, body: '{"errors":["unauthorized"]}' })
assert.equal(httpError.accepted, false)
assert.equal(httpError.reason, 'http_status')

console.log('PUSH_WINBACK_ONESIGNAL_ACK_CONTRACT PASS')
