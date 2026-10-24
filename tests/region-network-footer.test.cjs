const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.resolve(__dirname, '../scripts/lib/region-seo-pages.cjs'), 'utf8')
const match = source.match(/const NETWORK = \[([\s\S]*?)\n\]/)
assert.ok(match, 'NETWORK must remain defined in the regional SEO generator')

const entries = [...match[1].matchAll(/\{ name: \{ en: '([^']+)', es: '([^']+)' \}, url: 'https:\/\/([^/]+)\/' \}/g)]
  .map(([, en, es, domain]) => ({ en, es, domain }))

assert.deepEqual(entries.map(entry => entry.domain), [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassumpuntacana.com',
  'sargassumcancun.com',
  'sargazotulum.com',
  'sargassummiami.com',
], 'the regional SEO network must link all six configured domains in stable order')

assert.deepEqual(entries.map(({ en, es }) => [en, es]), [
  ['Martinique', 'Martinica'],
  ['Guadeloupe', 'Guadalupe'],
  ['Punta Cana', 'Punta Cana'],
  ['Cancún & Riviera Maya', 'Cancún y Riviera Maya'],
  ['Tulum', 'Tulum'],
  ['Miami & Florida', 'Miami y Florida'],
], 'each regional network link must retain its EN/ES label')

assert.match(source, /NETWORK\.filter\(n => !n\.url\.includes\(region\.domain\)\)/,
  'the generator must continue excluding the current region from its own network links')

console.log('✓ Regional SEO network includes all six domains with localized labels and no self-link')
