#!/usr/bin/env node
'use strict'
/**
 * b2b-capture-ack.test.cjs — les captures B2B doivent être CONFIRMÉES par le
 * serveur avant d'afficher un succès.
 *
 * DÉFAUT RÉEL (verrouillé par ce test) :
 *   les pages B2B (hotels, collectivités, brief gratuit, page /for-hotels/)
 *   affichaient « merci / you're in / listo » SANS confirmation serveur. Le POST
 *   partait en `mode:'no-cors'` (ou en `sendBeacon`, sans réponse possible) :
 *   le navigateur ne pouvait pas savoir si la demande avait été enregistrée.
 *   Un prospect perdu se voyait donc comme un succès → 0 signal, 0 relance.
 *
 * CE QUE CE TEST VERROUILLE :
 *   S1. plus aucun POST de capture en `no-cors` / `sendBeacon` (les captures
 *       ne doivent plus être « feu et oubli ») ;
 *   S2. chaque page de capture charge le helper partagé `/b2b-capture.js` ;
 *   S3. le panneau de succès est affiché UNIQUEMENT dans `onSuccess` (donc
 *       après confirmation serveur), jamais inconditionnellement ;
 *   S4. le helper lit la réponse (`mode:'cors'`, `text/plain` → requête simple
 *       sans preflight), exige `{ok:true}`, et possède une branche d'échec
 *       (message d'erreur + bouton réactivé + événement mesurable).
 *
 * B. Test COMPORTEMENTAL du helper : succès confirmé → onSuccess ; échec HTTP,
 *   `{ok:false}` ou réseau coupé → aucun onSuccess, message d'erreur affiché.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.resolve(__dirname, '..', '..')
let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const CAPTURE_PAGES = [
  'public/pro/collectivites/index.html',
  'public/pro/en/collectivites/index.html',
  'public/pro/es/collectivites/index.html',
  'public/pro/hotels/index.html',
  'public/pro/en/hotels/index.html',
  'public/pro/es/hotels/index.html',
  'public/pro/en/sargassum-forecast-cancun-hotels/index.html',
  'public/pro/en/sargassum-forecast-miami-hotels/index.html',
  'public/pro/en/sargassum-forecast-punta-cana-hotels/index.html',
  'public/pro/es/pronostico-sargazo-cancun-hoteles/index.html',
  'public/pro/es/pronostico-sargazo-punta-cana-hoteles/index.html',
  'public/for-hotels/index.html',
]

const HELPER_PATH = path.join(ROOT, 'public', 'b2b-capture.js')
const HELPER = fs.readFileSync(HELPER_PATH, 'utf8')

// ── S1 à S3 : contrat de source, page par page ────────────────────────────
let totalCalls = 0
for (const rel of CAPTURE_PAGES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const label = rel.replace('public/', '')

  t(!/mode:'no-cors'/.test(src) && !/mode:"no-cors"/.test(src),
    `S1 ${label} : plus aucun POST de capture en no-cors`)
  t(!/navigator\.sendBeacon/.test(src),
    `S1 ${label} : plus aucun envoi « feu et oubli » (sendBeacon)`)

  const tagCount = (src.match(/\/b2b-capture\.js/g) || []).length
  t(tagCount === 1, `S2 ${label} : charge exactement une fois /b2b-capture.js`)

  const calls = (src.match(/sgB2BCapture\(/g) || []).length
  t(calls >= 1, `S3 ${label} : la capture passe par sgB2BCapture (${calls} bloc(s))`)
  totalCalls += calls

  // Le panneau de succès ne doit PAS être atteint hors du callback onSuccess.
  const okIdx = src.indexOf("document.getElementById('form-ok').style.display='block'")
  if (okIdx >= 0) {
    const before = src.slice(0, okIdx)
    const lastOnSuccess = before.lastIndexOf('onSuccess:function(){')
    const lastCapture = before.lastIndexOf('sgB2BCapture(')
    t(lastOnSuccess > lastCapture,
      `S3 ${label} : le panneau de succès est dans onSuccess (après confirmation serveur)`)
  }
  const magnetIdx = src.indexOf("document.getElementById('magnet-ok').style.display='block'")
  if (magnetIdx >= 0) {
    const before = src.slice(0, magnetIdx)
    t(before.lastIndexOf('onSuccess:function(){') > before.lastIndexOf('sgB2BCapture('),
      `S3 ${label} : le panneau « brief gratuit » est dans onSuccess`)
  }
  if (rel === 'public/for-hotels/index.html') {
    const btnIdx = src.indexOf('first brief on its way')
    const before = src.slice(0, btnIdx)
    t(before.lastIndexOf('onSuccess:function(){') > before.lastIndexOf('sgB2BCapture('),
      `S3 ${label} : le bouton « You're in » n'apparaît qu'après confirmation serveur`)
  }
}
t(totalCalls === 21, `S3 : 21 blocs de capture au total sont passés par le helper (${totalCalls})`)

// ── S4 : contrat du helper partagé ─────────────────────────────────────────
t(/mode:\s*'cors'/.test(HELPER), "S4 : le helper lit la réponse serveur (mode:'cors')")
t(/'Content-Type':\s*'text\/plain'/.test(HELPER), "S4 : requête simple (text/plain) → aucun preflight")
t(!/mode:\s*'no-cors'/.test(HELPER), "S4 : le helper ne fait plus de POST opaque")
t(/data\.ok !== true/.test(HELPER), "S4 : le succès exige {ok:true} du serveur")
t(/sg_b2b_capture_failed/.test(HELPER), "S4 : l'échec de capture est mesurable (événement)")
t(/button\.disabled = false/.test(HELPER), "S4 : le bouton est réactivé après un échec")
t(/data-sg-capture-error/.test(HELPER), "S4 : un message d'erreur est affiché à l'utilisateur")
t(/global\.sgB2BCapture = capture/.test(HELPER), "S4 : le helper expose sgB2BCapture")

// ── B : comportement réel du helper (DOM + fetch simulés) ───────────────────
function makeEnv(responseFactory) {
  const state = { calls: [], errors: [], success: 0, failure: 0 }
  const button = { disabled: false }
  const errorEl = { style: { display: 'none' }, textContent: '', setAttribute() {} }
  const form = {
    children: [],
    querySelector(sel) {
      if (sel === '[data-sg-capture-error]') return form.children[0] || null
      if (sel === 'button') return button
      return null
    },
    appendChild(el) { form.children.push(el) },
  }
  const fakeDocument = {
    createElement() {
      return { style: { cssText: '', display: '' }, textContent: '', setAttribute() {}, appendChild() {} }
    },
  }
  const gtagEvents = []
  const win = {
    document: fakeDocument,
    // Signature GA4 : gtag('event', <nom>, <params>)
    gtag: (...args) => { gtagEvents.push({ args }) },
    fetch: (url, init) => {
      state.calls.push({ url, init })
      return responseFactory()
    },
  }
  const ctx = vm.createContext(win)
  vm.runInContext(HELPER, ctx, { filename: 'b2b-capture.js' })
  return { win, form, button, errorEl, state, gtagEvents }
}

async function main() {
  // B1 : le serveur confirme → onSuccess, aucune erreur
  {
    const env = makeEnv(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ ok: true, action: 'email_saved' }),
    }))
    let ok = false
    const res = await env.win.sgB2BCapture('https://x/exec', { email: 'a@b.co' }, {
      form: env.form, lang: 'fr', source: 'hotels', onSuccess: () => { ok = true },
    })
    t(ok === true, 'B1 : succès confirmé → onSuccess appelé')
    t(res && res.ok === true, 'B1 : la promesse résout avec la confirmation serveur')
    t(env.state.calls.length === 1 && env.state.calls[0].init.mode === 'cors',
      "B1 : une seule requête, en mode 'cors'")
    t(env.state.calls[0].init.headers['Content-Type'] === 'text/plain',
      'B1 : Content-Type text/plain (requête simple, sans preflight)')
    t(env.form.children.length === 0 || env.form.children[0].style.display !== 'block',
      'B1 : aucun message d\'erreur affiché')
  }

  // B2 : le serveur répond une erreur HTTP → pas de succès, erreur affichée
  {
    const env = makeEnv(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }))
    let ok = false
    await env.win.sgB2BCapture('https://x/exec', { email: 'a@b.co' }, {
      form: env.form, lang: 'fr', source: 'hotels', button: env.button, onSuccess: () => { ok = true },
    })
    t(ok === false, 'B2 : erreur HTTP → onSuccess NON appelé (pas de faux succès)')
    t(env.form.children.length === 1 && env.form.children[0].style.display === 'block',
      'B2 : erreur HTTP → message d\'erreur affiché')
    t(env.button.disabled === false, 'B2 : erreur HTTP → bouton réactivé (réessai possible)')
    t(env.gtagEvents.some((e) => e.args[0] === 'event' && e.args[1] === 'sg_b2b_capture_failed'),
      'B2 : erreur HTTP → échec mesuré (sg_b2b_capture_failed)')
  }

  // B3 : le serveur répond {ok:false} → pas de succès
  {
    const env = makeEnv(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ ok: false, error: 'quota' }),
    }))
    let ok = false
    await env.win.sgB2BCapture('https://x/exec', { email: 'a@b.co' }, {
      form: env.form, lang: 'en', source: 'hotels', onSuccess: () => { ok = true },
    })
    t(ok === false, "B3 : {ok:false} → onSuccess NON appelé")
    t(env.form.children.length === 1 && env.form.children[0].textContent.length > 0,
      'B3 : {ok:false} → message d\'erreur non vide')
  }

  // B4 : réseau coupé → pas de succès, erreur, bouton réactivé
  {
    const env = makeEnv(() => Promise.reject(new Error('network down')))
    let ok = false
    await env.win.sgB2BCapture('https://x/exec', { email: 'a@b.co' }, {
      form: env.form, lang: 'es', source: 'leadmagnet', button: env.button, onSuccess: () => { ok = true },
    })
    t(ok === false, 'B4 : réseau coupé → onSuccess NON appelé (le prospect est signalé, pas perdu en silence)')
    t(env.button.disabled === false, 'B4 : réseau coupé → bouton réactivé')
    t(env.form.children.length === 1, 'B4 : réseau coupé → message d\'erreur affiché')
  }

  // B5 : le bouton est désactivé pendant l'envoi
  {
    const env = makeEnv(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ ok: true }),
    }))
    const p = env.win.sgB2BCapture('https://x/exec', { email: 'a@b.co' }, {
      form: env.form, lang: 'fr', button: env.button,
    })
    t(env.button.disabled === true, 'B5 : le bouton est désactivé pendant l\'envoi (double clic évité)')
    await p
  }

  console.log(`\nB2B_CAPTURE_ACK_TESTS PASS (${n} assertions)`)
}

main().catch((error) => { console.error(error); process.exit(1) })
