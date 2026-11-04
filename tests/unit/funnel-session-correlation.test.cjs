const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  sessionIdFromParams,
} = require('../../scripts/automation/funnel-analytics-classification.cjs')

const root = path.resolve(__dirname, '../..')
const app = fs.readFileSync(path.join(root, 'src/Sargasses_PROD.jsx'), 'utf8')
const supabase = fs.readFileSync(path.join(root, 'src/supabasePhotos.js'), 'utf8')

async function main() {
  const start = app.indexOf('if(remoteEnabled&&SG_FUNNEL_EVENTS.has(event)){try{logAnalyticsEvent(event,p,')
  const trackEnd = app.indexOf('\n}', start)
  assert.ok(start >= 0 && trackEnd > start, 'Supabase funnel sink must remain in the central track() path')
  const sink = app.slice(start, trackEnd)
  assert.ok(app.indexOf('window.gtag("event",event,p)') < start, 'GA4 receives the unchanged params before the Supabase sink')
  assert.ok(app.indexOf('navigator.sendBeacon(APPS_SCRIPT_URL') < start, 'Apps Script receives the unchanged params before the Supabase sink')
  assert.ok(app.indexOf('sgCollectEvent(event,p)') < start, 'first-party collection initializes the tab sid before the Supabase sink')
  assert.doesNotMatch(app, /p\.sid\s*=/, 'track() never mutates the event payload with sid')
  assert.match(sink, /logAnalyticsEvent\(event,p,/, 'track() forwards unmodified params to the Supabase adapter')
    assert.match(sink, /if\(localStorage\.sg_cookie_consent==="accepted"\)p\.sid=_sgcSid\(\);logAnalyticsEvent\(event,p,/, 'the final Supabase sink attaches sid only after analytics opt-in')
  assert.doesNotMatch(supabase, /payloadParams\.sid\s*=/, 'the adapter does not add ids to unrelated Supabase events')
  assert.match(app, /_sgc\.buf=\{v:1,sid:_sgcSid\(\)/, 'the first-party collector creates the existing session id before the Supabase call')
  
  // Keep the pre-existing GA4 payload untouched: sid must not be added to p.
  assert.match(app, /if\(remoteEnabled\)try\{window\.gtag\("event",event,p\)\}/)
  assert.match(app, /function _sgcSid\(\)\{try\{let s=sessionStorage\.getItem\("sg_sid"\)/)

  // The current funnel aggregator already understands the same `sid` field.
  assert.equal(sessionIdFromParams({ sid: 'tab-session-123' }), 'tab-session-123')
  assert.equal(sessionIdFromParams({ session_id: 'legacy-session-456' }), 'legacy-session-456')
  assert.equal(sessionIdFromParams({ sid: '', session_id: 'legacy-session-456' }), 'legacy-session-456')
  assert.equal(sessionIdFromParams({}), null)
  assert.equal(sessionIdFromParams({ sid: 'x' }), null, 'storage-unavailable sentinel is not a real session')

  console.log('PASS: Supabase funnel events receive the existing anonymous tab sid; GA4 and fallback payloads remain unchanged')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
