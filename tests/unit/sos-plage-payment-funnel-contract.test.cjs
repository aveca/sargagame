'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function main() {
  const root = path.resolve(__dirname, '../..')
  const mode = await import(pathToFileURL(path.join(root, 'workers/sargagame/mollie-mode.js')).href)

  for (const host of [
    'sargasses-martinique.com',
    'www.sargasses-martinique.com',
    'sargasses-guadeloupe.com',
    'sargassummiami.com',
    'sargassumpuntacana.com',
    'sargassumcancun.com',
    'sargazotulum.com',
  ]) {
    assert.equal(mode.isMollieModeAllowed(host, 'test_demo_key'), false, host + ' must reject a Mollie test key')
    assert.equal(mode.isMollieModeAllowed(host, 'live_demo_key'), true, host + ' must allow a Mollie live key')
  }
  assert.equal(mode.isMollieModeAllowed('sargagame.pages.dev', 'test_demo_key'), true)
  assert.equal(mode.isMollieModeAllowed('localhost:4173', 'test_demo_key'), true)
  assert.equal(mode.isMollieModeAllowed('preview.example.test', 'test_demo_key'), true)
  assert.equal(mode.isMollieModeAllowed('sargasses-martinique.com', ''), false)

  const sos = fs.readFileSync(path.join(root, 'src/SOSPlage.jsx'), 'utf8')
  const beach = fs.readFileSync(path.join(root, 'src/BeachSheet.jsx'), 'utf8')
  const app = fs.readFileSync(path.join(root, 'src/Sargasses_PROD.jsx'), 'utf8')
  const worker = fs.readFileSync(path.join(root, 'workers/sargagame/index.js'), 'utf8')
  const php = fs.readFileSync(path.join(root, 'public/api/mollie.php'), 'utf8')
  const phpWebhook = fs.readFileSync(path.join(root, 'public/api/mollie-webhook.php'), 'utf8')
  const funnel = require(path.join(root, 'scripts/automation/funnel-from-supabase.cjs'))

  assert.match(sos, /redirectUrl:\s*origin\s*\+\s*["']\/\?mollie_return=1["']/)
  assert.doesNotMatch(sos, /sos_success=1/)
  assert.match(sos, /sessionStorage\.setItem\(["']sg_mollie_pending/)
  assert.match(sos, /localStorage\.setItem\(["']sg_mollie_pending/)
  assert.match(sos, /paymentId:\s*data\.paymentId/)
  assert.match(sos, /pass:\s*["']sos["']/)
  assert.match(sos, /days:\s*1/)
  assert.match(sos, /aria-modal=["']true["']/)
  assert.match(sos, /ref=\{panelRef\}/)
  assert.doesNotMatch(sos, /_t\(lang,\s*[\"']Quelle plage choisir <span/)
  assert.doesNotMatch(sos, /<br\/>/)
  assert.doesNotMatch(beach, /_t\(lang,\s*[\"']Quelle plage choisir <span/)
  assert.match(app, /sg_sos_checkout_paid/)
  assert.match(app, /sg_sos_checkout_redirect/)
  assert.match(worker, /isMollieModeAllowed/)
  assert.match(worker, /payment_provider_not_live/)
  assert.match(php, /payment_provider_not_live/)
  assert.match(phpWebhook, /payment_provider_not_live/)

  for (const key of ['sos_checkout_start', 'sos_checkout_redirect', 'sos_checkout_paid', 'sos_checkout_error']) {
    assert.ok(funnel.FUNNEL_KEYS.includes(key), key + ' must be counted by the funnel snapshot')
  }

  const synthetic = funnel.computeFunnel([
    { event: 'sg_sos_checkout_start', island: 'mq', params: {} },
    { event: 'sg_sos_checkout_redirect', island: 'mq', params: {} },
    { event: 'sg_sos_checkout_paid', island: 'mq', params: {} },
  ])
  assert.equal(synthetic.counts.sos_checkout_start, 1)
  assert.equal(synthetic.counts.sos_checkout_redirect, 1)
  assert.equal(synthetic.counts.sos_checkout_paid, 1)
  assert.equal(synthetic.rates.sos_checkout_start_to_paid, 100)

  console.log('SOS_PLAGE_PAYMENT_FUNNEL_CONTRACT PASS')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
