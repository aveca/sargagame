/**
 * mollie-aggregate.cjs — Agrégation PURE des pages paiements Mollie → bloc
 * « vérité Mollie » de daily-metrics.json.
 *
 * Extraite de daily-stats-check.cjs (mollieTruth) le 2026-08-25 SANS changement
 * de sémantique, pour testabilité contrat (scripts/tests/mollie-paid-contract.test.cjs) :
 * le réseau reste dans l'appelant (daily-stats-check.cjs), cette lib ne fait que
 * classer/compter les lignes déjà fetchées.
 *
 * Ajouts 2026-08-25 (fiabilité KPI — cause « paid={} depuis le 18/08 » prouvée
 * correcte : dernière vente réelle 2026-07-19 sortie de la fenêtre 30j) :
 *  - `lastPaidAt` : vente `paid` la plus récente PARMI LES PAGES FETCHÉES (inclut
 *    hors-fenêtre 30j). Désambiguïe paid={} « zéro vente depuis X » (normal) d'un
 *    collector cassé — l'ambiguïté a coûté une session d'investigation entière.
 *  - (côté appelant) `fetchedAt` : horodatage du run — rend le carry-forward
 *    (bloc réutilisé faute de réponse API) détectable dans la série.
 *
 * ⚠️ Fenêtre GLISSANTE : `sinceTs` = Date.now() - 30*864e5 côté appelant.
 * Une ligne avec createdAt < sinceTs est IGNORÉE (compteur 30j), mais peut
 * toujours porter lastPaidAt. Tri Mollie = antéchronologique : l'appelant
 * s'arrête à la première page contenant une ligne hors fenêtre.
 */
const { logId } = require('./email-hash.cjs')

const round2 = n => Math.round(n * 100) / 100

function aggregateMolliePayments(pages, sinceTs) {
  const paid = {}                          // devise → { count, total }
  const refunds = { count: 0, total: {} }  // paiements 30j avec amountRefunded > 0
  const chargebacks = { count: 0, total: {} }
  const payers = new Set()
  const addCur = (obj, cur, val) => { obj[cur] = round2((obj[cur] || 0) + val) }
  let b2b = 0
  let lastPaidAt = null
  for (const payments of pages || []) {
    for (const p of payments || []) {
      // lastPaidAt AVANT le skip fenêtre : une vente payée hors 30j reste la
      // réponse à « quand a eu lieu la dernière vraie vente ? » (paid={}).
      if (p.status === 'paid' && p.createdAt && (!lastPaidAt || p.createdAt > lastPaidAt)) lastPaidAt = p.createdAt
      const created = Date.parse(p.createdAt || '')
      if (!isNaN(created) && created < sinceTs) continue // hors fenêtre 30j
      if (p.status !== 'paid') continue
      const cur = (p.amount && p.amount.currency) || 'EUR'
      const val = parseFloat((p.amount && p.amount.value) || '0') || 0
      if (!paid[cur]) paid[cur] = { count: 0, total: 0 }
      paid[cur].count++
      paid[cur].total = round2(paid[cur].total + val)
      const ref = parseFloat((p.amountRefunded && p.amountRefunded.value) || '0') || 0
      if (ref > 0) { refunds.count++; addCur(refunds.total, cur, ref) }
      const cb = parseFloat((p.amountChargedBack && p.amountChargedBack.value) || '0') || 0
      if (cb > 0) { chargebacks.count++; addCur(chargebacks.total, cur, cb) }
      const m = p.metadata || {}
      // Préfixe SANS le tiret cadratin — même forme EXACTE que mollie-webhook.php
      // (annualGrid) et b2b-funnel.cjs : les 3 détections paylink doivent matcher
      // le même ensemble, sinon le compteur b2b diverge du grant (panel 2026-07-02).
      if (m.b2b === '1' || /^(pro|brief|territory)_/.test(m.plan || '') ||
          (!m.email && /^(Sargasses|Sargassum) Pro /.test(p.description || ''))) b2b++
      const em = m.email || m.customerEmail || ''
      if (String(em).includes('@')) payers.add(logId(em))
    }
  }
  return { paid, refunds, chargebacks, b2b, payers: [...payers].sort(), lastPaidAt }
}

module.exports = { aggregateMolliePayments, round2 }
