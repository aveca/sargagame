const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  sessionIdFromParams,
} = require('../../scripts/automation/funnel-analytics-classification.cjs')

const root = path.resolve(__dirname, '../..')
const app = fs.readFileSync(path.join(root, 'src/Sargasses_PROD.jsx'), 'utf8')

async function main() {
  const start = app.indexOf('if(remoteEnabled&&SG_FUNNEL_EVENTS.has(event)){try{')
  const end = app.indexOf('// Primary: GA4', start)
  assert.ok(start >= 0 && end > start, 'Supabase funnel sink must remain in the central track() path')
  const sink = app.slice(start, end)

        assert.match(sink, /const sid=_sgcSid\(\);logAnalyticsEvent\(event,sid===['"]x['"]\?p:\{\.\.\.p,sid\}/, 'reuse existing tab session id only for Supabase and omit unavailable sentinel')
  
  // Keep the pre-existing GA4 payload untouched: sid must not be added to p.
  assert.match(app, /if\(remoteEnabled\)try\{window\.gtag\("event",event,p\)\}/)
  assert.match(app, /function _sgcSid\(\)\{try\{let s=sessionStorage\.getItem\("sg_sid"\)/)

  // The current funnel aggregator already understands the same `sid` field.
  assert.equal(sessionIdFromParams({ sid: 'tab-session-123' }), 'tab-session-123')
  assert.equal(sessionIdFromParams({ session_id: 'legacy-session-456' }), 'legacy-session-456')
  assert.equal(sessionIdFromParams({ sid: '', session_id: 'legacy-session-456' }), 'legacy-session-456')
  assert.equal(sessionIdFromParams({}), null)

  console.log('PASS: Supabase funnel events receive the existing anonymous tab sid; GA4 and fallback payloads remain unchanged')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
