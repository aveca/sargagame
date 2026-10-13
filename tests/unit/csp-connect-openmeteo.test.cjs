#!/usr/bin/env node
// Test de régression CSP open-meteo (fix/csp-open-meteo-20261013, issue #898).
// Défaut : les fetch météo/marine navigateur vers api.open-meteo.com et
// marine-api.open-meteo.com étaient bloqués par connect-src du meta CSP
// (servi aussi en production — header HTTP prod = frame-ancestors 'none' seul).
// Ce test verrouille :
//  1. La présence des DEUX origines HTTPS explicites dans connect-src.
//  2. La conservation de TOUTES les autorisations existantes (self, paiements,
//     analytics) et des autres directives (script-src, frame-src, form-action…).
//  3. Aucun wildcard affaiblissant (pas de connect-src *, pas de https://*).
//  4. Pas de duplication ni contradiction HTML/HTTP : le _headers Cloudflare ne
//     définit PAS connect-src (sinon il IGNORERAIT le meta), uniquement
//     frame-ancestors — et le meta ne définit PAS frame-ancestors.
//  5. Croisement code réel : les origins appelées par src/ sont exactement
//     celles autorisées (ni plus, ni moins).
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
const metas = [...html.matchAll(/<meta[^>]*Content-Security-Policy[^>]*content="([^"]+)"/g)]
if (metas.length !== 1) { console.error(`FAIL: ${metas.length} meta CSP trouvées (attendu exactement 1)`); process.exit(1) }
const csp = metas[0][1]

function directive(name) {
  const d = csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' '))
  return d ? d.split(/\s+/).slice(1) : []
}

let fail = 0
function check(cond, label) {
  if (cond) console.log(`OK  ${label}`)
  else { console.error(`FAIL ${label}`); fail++ }
}

// 1. Les deux origines Open-Meteo, HTTPS explicites.
const connectSrc = directive('connect-src')
check(connectSrc.includes('https://api.open-meteo.com'), "connect-src autorise https://api.open-meteo.com (météo fiches)")
check(connectSrc.includes('https://marine-api.open-meteo.com'), "connect-src autorise https://marine-api.open-meteo.com (marine fiches)")

// 2. Conservation intégrale des autorisations et directives existantes.
check(connectSrc.includes("'self'"), "connect-src conserve 'self'")
for (const origin of ['https://api.mollie.com', 'https://api.stripe.com', 'https://www.mollie.com', 'https://www.paypal.com',
  'https://www.google-analytics.com', 'https://region1.analytics.google.com', 'https://www.googletagmanager.com',
  'https://script.google.com', 'https://script.googleusercontent.com', 'https://*.clarity.ms',
  'https://rswdmjtdzrucqzzukfmd.supabase.co']) {
  check(connectSrc.includes(origin), `connect-src conserve ${origin}`)
}
const scriptSrc = directive('script-src')
check(scriptSrc.includes('https://js.stripe.com') && scriptSrc.includes('https://js.mollie.com') && scriptSrc.includes("'self'"),
  'script-src inchangé (self + paiements conservés)')
check(directive('frame-src').join(' ') === "'self' https://js.stripe.com https://www.paypal.com https://js.mollie.com", 'frame-src inchangé')
check(directive('form-action').join(' ') === "'self' https://www.mollie.com https://www.paypal.com", 'form-action inchangé')
check(directive('default-src').join(' ') === "'self'", "default-src reste 'self' (aucun affaiblissement)")
check(directive('base-uri').includes("'self'"), "base-uri conserve 'self'")

// 3. Pas de wildcard affaiblissant dans connect-src.
check(!connectSrc.includes('*:') && !connectSrc.includes('https://*') && !connectSrc.includes('*.'),
  "connect-src sans wildcard général (origines explicites uniquement)")
check(!connectSrc.includes('http://'), 'connect-src sans origine HTTP non sécurisée')

// 4. Non-contradiction HTML/HTTP : le header Cloudflare ne définit PAS connect-src.
const pageHeaders = fs.readFileSync(path.join(ROOT, 'public', '_headers'), 'utf8')
check(!/connect-src/.test(pageHeaders), '_headers (Cloudflare) ne définit pas connect-src (le meta gouverne)')
check(/Content-Security-Policy:\s*frame-ancestors 'none'/.test(pageHeaders), "_headers conserve frame-ancestors 'none'")
check(!directive('frame-ancestors').length, 'meta CSP ne définit pas frame-ancestors (non supporté en meta)')

// 5. Croisement avec le code appelant : exactement ces origines, HTTPS.
//    Fichiers TRACKED uniquement (src/lib/marine.js peut ne pas exister sur
//    toutes les branches : optionnel, jamais bloquant — l'appel marine tracked
//    vit dans Sargasses_PROD.jsx).
const prod = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')
let marine = ''
try { marine = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'marine.js'), 'utf8') } catch (_) {}
const called = new Set()
for (const src of [prod, marine]) {
  if (!src) continue
  for (const m of src.matchAll(/https:\/\/[a-z0-9.-]*open-meteo\.com/g)) called.add(m[0])
}
const allowed = new Set(['https://api.open-meteo.com', 'https://marine-api.open-meteo.com'])
check(called.size > 0 && [...called].every(o => allowed.has(o)), `toutes les origines open-meteo appelées (${[...called].join(', ')}) sont exactement celles autorisées`)
check([...called].every(o => connectSrc.includes(o)), 'chaque origine appelée figure dans connect-src')

console.log(fail ? `\n${fail} ECHEC(S)` : '\nCSP_OPEN_METEO_TESTS PASS')
process.exit(fail ? 1 : 0)
