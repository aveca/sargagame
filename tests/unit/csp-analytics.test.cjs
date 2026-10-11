#!/usr/bin/env node
// Test de régression CSP (repair-csp-analytics-20261011)
// Régression : le CSP de index.html doit autoriser
//  - le beacon Cloudflare Web Analytics (script-src static.cloudflareinsights.com)
//  - le pool de sous-domaines Clarity (connect-src *.clarity.ms)
// Preuve réelle : https://github.com/aveca/factory-control (mission UX live 2026-10-11)
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
const m = html.match(/<meta[^>]*Content-Security-Policy[^>]*content="([^"]+)"/)
if (!m) { console.error('FAIL: meta CSP absente de index.html'); process.exit(1) }
const csp = m[1]

function directive(name) {
  const d = csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' '))
  return d ? d.split(/\s+/).slice(1) : []
}

let fail = 0
function check(cond, label) {
  if (cond) console.log(`OK  ${label}`)
  else { console.error(`FAIL ${label}`); fail++ }
}

const scriptSrc = directive('script-src')
const connectSrc = directive('connect-src')
check(scriptSrc.includes('https://static.cloudflareinsights.com'), 'script-src autorise static.cloudflareinsights.com (beacon Cloudflare)')
check(connectSrc.includes('https://*.clarity.ms'), 'connect-src autorise *.clarity.ms (pool n./y./k.clarity.ms)')
check(scriptSrc.includes("'self'"), "script-src conserve 'self'")
check(scriptSrc.includes('https://js.mollie.com'), 'script-src conserve js.mollie.com (paiement)')
check(connectSrc.includes('https://api.mollie.com'), 'connect-src conserve api.mollie.com (paiement)')
check(directive('frame-ancestors').includes("'none'"), "frame-ancestors 'none' conservé")
check(!/k\.clarity\.ms/.test(csp) || connectSrc.includes('https://*.clarity.ms'), 'pas de dépendance au seul k.clarity.ms')

process.exit(fail ? 1 : 0)
