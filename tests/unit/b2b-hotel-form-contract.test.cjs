#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..', '..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const regional = read('scripts/lib/region-seo-pages.cjs')
const french = read('scripts/lib/hotel-landing-fr.cjs')
const { buildHotelLandingFr } = require('../../scripts/lib/hotel-landing-fr.cjs')
let failures = 0
function check(ok, label) {
  if (ok) console.log('  ok  ' + label)
  else { failures++; console.error('  FAIL ' + label) }
}
const regionalHotel = regional.slice(regional.indexOf('function buildHotelLanding('), regional.indexOf('function sanitizeCadenceClaims('))
for (const [label, source] of [['regional EN/ES', regionalHotel], ['French MQ/GP', french]]) {
  check(source.includes("headers:{'Content-Type':'application/json'}"), label + ' sends JSON to the Worker')
  check(source.includes('event.preventDefault()'), label + ' prevents the browser URL-encoded form submit')
  check(source.includes('marketingConsent:false'), label + ' never opts a hotel into marketing')
  check(source.includes('data.persisted!==true') && source.includes("typeof data.token!=='string'"), label + ' accepts success only after persistence acknowledgement and a token')
  check(source.includes('sg-b2b-form-status') && source.includes('aria-live="polite"'), label + ' exposes an accessible result/error state')
  check(source.includes('b2bform=0'), label + ' retains the form rollback switch')
}
check(regionalHotel.includes("['mq','gp','florida','puntacana','rivieramaya'].includes(region.id)"), 'regional form is restricted to Worker-supported island identifiers; Tulum is excluded until its delivery domain is mapped')
check(!regional.slice(0, regional.indexOf('function buildHotelLanding(')).includes("headers:{'Content-Type':'application/json'}"), 'form handler is not injected into unrelated regional pages')
let renderedFrench = ''
try {
  renderedFrench = buildHotelLandingFr({
    islandId: 'mq',
    islandName: 'Martinique',
    domain: 'sargasses-martinique.com',
    coverage: [],
    reliability: null,
    updatedRel: '',
    freshnessStatus: 'unknown',
  })
} catch (error) {
  check(false, 'French hotel landing renders without a runtime exception: ' + error.message)
}
if (renderedFrench) {
  check(renderedFrench.includes('sg-b2b-form-status'), 'French hotel landing actually renders its form status node')
  check(renderedFrench.includes('Activation de votre essai'), 'French hotel landing renders localized loading copy')
  check(!renderedFrench.includes('${_('), 'French hotel landing contains no unresolved translation helper')
}
console.log('B2B_HOTEL_FORM_CONTRACT', failures === 0 ? 'PASS' : 'FAIL')
process.exit(failures ? 1 : 0)
