// Regression P0 - livrable B2B encadrable (widget iframe).
// Defaut (e808c2cf5, 2026-10-11) : public/_headers posait frame-ancestors 'none'
// + X-Frame-Options: DENY via `/*`, donc aussi sur /widget/embed/. Or le produit
// vendu aux hotels EST un iframe sur LEUR site (code fourni par /pro/espace/ et
// les emails B2B). Mesure en production : /pro/espace/ rendait
// chrome-error://chromewebdata.
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
let fail = 0
function check(c, l) { if (c) console.log('OK  ' + l); else { console.error('FAIL ' + l); fail++ } }

// 1. Le chemin exempte est bien celui que le produit distribue.
const ESPACE = fs.readFileSync(path.join(ROOT, 'public/pro/espace/index.html'), 'utf8')
check(ESPACE.includes('/widget/embed/?'), 'espace Pro distribue un iframe /widget/embed/?beach=...')

// 2. Simulateur _headers Cloudflare Pages : fusion des règles, detachment `! `,
// concatenation des en-têtes repetes a la virgule (intersection).
function parseHeaders(raw) {
  const rules = []
  let cur = null
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    if (/^\s/.test(line)) {
      const t = line.trim()
      if (t.startsWith('! ')) { cur.headers.push(['DETACH', t.slice(2)]) }
      else { const i = line.indexOf(':'); if (i < 0) continue; cur.headers.push([line.slice(0,i).trim(), line.slice(i+1).trim()]) }
    }
    else { cur = { pattern: line.trim(), headers: [] }; rules.push(cur) }
  }
  return rules
}
function isMatch(pattern, url) {
  if (pattern === '/*') return true
  if (pattern.endsWith('/*')) return url.startsWith(pattern.slice(0, -1))
  if (pattern.startsWith('/')) return url === pattern || url.startsWith(pattern + '/') || url.startsWith(pattern + '?')
  return url === pattern || url.startsWith(pattern)
}
function simulateHeaders(rules, url) {
  const headers = {}
  for (const r of rules) {
    if (!isMatch(r.pattern, url)) continue
    for (const [name, val] of r.headers) {
      if (name === 'DETACH') { delete headers[val] }
      else { headers[name] = headers[name] ? headers[name] + ', ' + val : val }
    }
  }
  return headers
}
const HEADERS_FILE = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8')
const RULES = parseHeaders(HEADERS_FILE)

// widget = encadrable : pas de DENY, pas de frame-ancestors 'none'
const w = simulateHeaders(RULES, '/widget/embed/?beach=plage-des-salines')
check(!(/DENY/.test(w['X-Frame-Options'] || '')), '_headers : widget sans X-Frame-Options DENY')
check(!(/(^|,\s*)frame-ancestors\s+'none'(,|$)/.test(w['Content-Security-Policy'] || '')), '_headers : widget sans frame-ancestors none')

// reste du site : NON encadrable (anti-clickjacking conservé)
const s = simulateHeaders(RULES, '/pro/espace/')
check(/DENY/.test(s['X-Frame-Options'] || ''), '_headers : reste du site garde X-Frame-Options DENY')
check(/(^|,\s*)frame-ancestors\s+'none'(,|$)/.test(s['Content-Security-Policy'] || ''), '_headers : reste du site garde frame-ancestors none')

process.exit(fail ? 1 : 0)
