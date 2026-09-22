#!/usr/bin/env node
/**
 * prune-ghost-paylinks.cjs — supprime de Mollie (mode LIVE) les 6 paylinks B2C
 * d'offres abandonnées (trip/sejour/saison, EUR+USD) + preuve par re-GET.
 *
 * Contexte : REVENUE RESCUE 2026-09-22 (GO fondateur). Le JSON repo seule était
 * insuffisant : ces liens sont hébergés chez Mollie et restaient payables via un
 * vieil email. Idempotent : 404 compté comme succès (déjà supprimé).
 *
 * Clé : env MOLLIE_API_KEY (CI uniquement — la clé live n'est jamais locale).
 */
'use strict'

const GHOSTS = {
  trip_eur: 'pl_AansH7qySCmCkY8hGPR3K',
  trip_usd: 'pl_rtywyW8nH4JpcvWyY47GP',
  sejour_eur: 'pl_6uFVxAzkUyqdvNzpV5R4f',
  sejour_usd: 'pl_xwjs5qndhV5iyrD88VXXn',
  saison_eur: 'pl_hFRkSfrzxWWcYxKBPhCiM',
  saison_usd: 'pl_DSA3QUxkpSs9fCCTiLZL9',
}

async function main() {
  const key = (process.env.MOLLIE_API_KEY || '').trim()
  if (!key) { console.error('MOLLIE_API_KEY absent — abort (no-op)'); process.exit(1) }
  if (key.startsWith('test_')) { console.error('Clé TEST détectée — abort (on vise le live, jamais la sandbox)'); process.exit(1) }
  const H = { Authorization: 'Bearer ' + key }

  // Inventaire avant : tous les liens existants (preuve globale + détection d'autres fantômes)
  const all = await fetch('https://api.mollie.com/v2/payment-links?limit=50', { headers: H })
  if (!all.ok) { console.error('list HTTP', all.status); process.exit(1) }
  const aj = await all.json(); const links = (aj._embedded && aj._embedded['payment_links']) || []
  console.log('INVENTAIRE AVANT:', links.length, 'liens')
  for (const l of links) console.log(' -', l.id, '|', l.status, '|', l.amount && l.amount.value, l.amount && l.amount.currency, '|', (l.description || '').slice(0, 70))

  let fails = 0
  for (const [name, id] of Object.entries(GHOSTS)) {
    const found = links.find((l) => l.id === id)
    if (!found) { console.log(name, '|', id, '| déjà absent ✓'); continue }
    const d = await fetch('https://api.mollie.com/v2/payment-links/' + id, { method: 'DELETE', headers: H })
    if (d.status !== 204 && d.status !== 404) { console.log(name, '|', id, '| DELETE HTTP', d.status, '✗'); fails++; continue }
    const chk = await fetch('https://api.mollie.com/v2/payment-links/' + id, { headers: H })
    const gone = chk.status === 404
    if (!gone) fails++
    console.log(name, '|', id, '| DELETE', d.status, '| re-GET', chk.status, gone ? '✓ GONE' : '✗ TOUJOURS LÀ')
  }

  const after = await fetch('https://api.mollie.com/v2/payment-links?limit=50', { headers: H })
  const bj = await after.json(); const rest = (bj._embedded && bj._embedded['payment_links']) || []
  console.log('INVENTAIRE APRÈS:', rest.length, 'liens')
  const ghostLeft = rest.filter((l) => Object.values(GHOSTS).includes(l.id))
  console.log(ghostLeft.length === 0 ? 'GHOSTS_GONE' : 'GHOSTS_RESTANTS: ' + ghostLeft.map((l) => l.id).join(','))

  if (fails > 0) process.exit(1)
  console.log('PRUNE_OK')
}

main().catch((e) => { console.error(e); process.exit(1) })
