#!/usr/bin/env node
// Remplace uniquement id et url des payment links déjà catalogués.
// N'appelle pas Mollie. Ne change pas value. Une url vide est ignorée.
// Une url https neuve pose reachable:true. Tout autre champ, ou une clé inconnue, échoue.
const fs = require('fs')
const path = require('path')

const CATALOG = path.join(__dirname, '..', '..', 'public', 'api', 'b2b-paylinks.json')
const SWAP = path.join(__dirname, '..', '..', 'public', 'api', 'b2b-paylink-url-swap.json')

function applyPaylinkUrlSwap(catalog, swap) {
  if (!catalog || typeof catalog.links !== 'object' || !swap || typeof swap.links !== 'object') {
    throw new Error('catalog_or_swap_invalid')
  }
  const next = JSON.parse(JSON.stringify(catalog))
  for (const [key, incoming] of Object.entries(swap.links)) {
    if (!Object.prototype.hasOwnProperty.call(next.links, key)) throw new Error('unknown_tier:' + key)
    if (!incoming || typeof incoming !== 'object') throw new Error('swap_entry_invalid:' + key)
    const extra = Object.keys(incoming).filter((name) => name !== 'id' && name !== 'url')
    if (extra.length) throw new Error('amount_or_extra_field:' + key)
    const url = String(incoming.url || '')
    if (!url) continue
    if (!url.startsWith('https://')) throw new Error('url_not_https:' + key)
    const id = String(incoming.id || '')
    if (!id) throw new Error('id_required:' + key)
    next.links[key] = { ...next.links[key], id, url, reachable: true }
  }
  return next
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'))
  const swap = JSON.parse(fs.readFileSync(SWAP, 'utf8'))
  const next = applyPaylinkUrlSwap(catalog, swap)
  if (process.argv.includes('--write')) {
    fs.writeFileSync(CATALOG, JSON.stringify(next, null, 2) + '\n')
  }
  const changed = Object.keys(next.links).filter((key) => next.links[key].url !== catalog.links[key].url)
  console.log(JSON.stringify({ ok: true, changed }))
}

module.exports = { applyPaylinkUrlSwap }

if (require.main === module) {
  try { main() } catch (error) {
    console.error(error.message || error)
    process.exit(1)
  }
}
