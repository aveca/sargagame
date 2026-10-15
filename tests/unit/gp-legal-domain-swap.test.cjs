#!/usr/bin/env node
'use strict'
// Régression : pages légales GP « sargasses-guadeloupe.com et sargasses-guadeloupe.com ».
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { swapMqDomainToGp } = require('../../scripts/lib/gp-domain-swap.cjs')
const ROOT = path.resolve(__dirname, '..', '..')

assert.strictEqual(swapMqDomainToGp('<link rel="canonical" href="https://sargasses-martinique.com/cgv" />'),
  '<link rel="canonical" href="https://sargasses-guadeloupe.com/cgv" />', 'domaine seul → GP')
const pair = 'sites <strong>sargasses-martinique.com</strong> et <strong>sargasses-guadeloupe.com</strong> sont'
assert.strictEqual(swapMqDomainToGp(pair), pair, 'paire <strong> intacte')
const meta = 'des sites sargasses-martinique.com et sargasses-guadeloupe.com. Éditeur'
assert.strictEqual(swapMqDomainToGp(meta), meta, 'paire texte intacte')
const list = '<strong>sargasses-martinique.com</strong>, <strong>sargasses-guadeloupe.com</strong>, <strong>x</strong>'
assert.strictEqual(swapMqDomainToGp(list), list, 'énumération intacte')
assert.strictEqual(swapMqDomainToGp('mail@sargasses-martinique.com et https://sargasses-martinique.com/x'),
  'mail@sargasses-guadeloupe.com et https://sargasses-guadeloupe.com/x', 'pas de faux positif hors paire')

// Les 4 pages légales sources : après swap, le texte nommant les deux sites est identique à MQ
for (const slug of ['cgv', 'confidentialite', 'mentions-legales', 'remboursement']) {
  const src = fs.readFileSync(path.join(ROOT, 'public', slug + '.html'), 'utf-8')
  const out = swapMqDomainToGp(src)
  assert.ok(!/sargasses-guadeloupe\.com(?:<\/strong>)?(?: et |, )(?:<strong>)?sargasses-guadeloupe\.com/.test(out), slug + ' : pas de double GP')
  const pairsSrc = (src.match(/sargasses-martinique\.com(?:<\/strong>)?(?: et |, )(?:<strong>)?sargasses-guadeloupe\.com/g) || []).length
  const pairsOut = (out.match(/sargasses-martinique\.com(?:<\/strong>)?(?: et |, )(?:<strong>)?sargasses-guadeloupe\.com/g) || []).length
  assert.strictEqual(pairsOut, pairsSrc, slug + ' : paires conservées')
}
console.log('OK — gp-legal-domain-swap')
