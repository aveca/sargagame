#!/usr/bin/env node
/**
 * passoffer-trust-row.test.cjs — E11 trust row (2026-09-20, PR dédiée).
 *
 * Rangée iconée (cadenas/calendrier/sans-abo) sous le CTA hero, copy 100 %
 * recyclée, flag ?trust_row=0, aucun event/tracking/checkout touché.
 * Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

function main() {
  const PO = read('src/PassOffer.jsx')

  // 1. Flag rollback, défaut ON, désactive uniquement la rangée.
  ok(/const trustRow = \(\(\)=>\{try\{return !\/\[\?&\]trust_row=0/.test(PO), 'flag trustRow + rollback ?trust_row=0 (défaut ON)')
  ok(PO.includes('{trustRow && ('), 'rendu conditionné à trustRow seul')

  // 2. Testid + placement : après le CTA hero, avant la ligne existante,
  //    donc avant l'email de WorldPaywall (contrat j0 offre AVANT email).
  ok(PO.includes('data-testid="passoffer-trust-row"'), 'testid passoffer-trust-row')
  const ctaIdx = PO.indexOf('Voir la prévision 7 jours')
  const rowIdx = PO.indexOf('data-testid="passoffer-trust-row"')
  const secureIdx = PO.indexOf('Paiement sécurisé · Accès immédiat')
  const stickyIdx = PO.indexOf('sg-sticky')
  ok(ctaIdx !== -1 && rowIdx > ctaIdx, 'rangée APRÈS le CTA hero')
  ok(secureIdx !== -1 && rowIdx < secureIdx, 'rangée AVANT la ligne existante (carte hero)')
  ok(stickyIdx !== -1 && rowIdx < stickyIdx, 'rangée AVANT le sticky (pas de duplication)')

  // 3. Copy 100 % recyclée FR/EN/ES (faits déjà claimés l115/l150-153).
  for (const [fr, en, es] of [
    ['Paiement sécurisé', 'Secure payment', 'Pago seguro'],
    ['30 jours', '30 days', '30 días'],
    ['Sans abonnement', 'No subscription', 'Sin suscripción'],
  ]) {
    ok(PO.includes(`"${fr}"`) && PO.includes(`"${en}"`) && PO.includes(`"${es}"`), `copy recyclée : ${fr} / ${en} / ${es}`)
  }

  // 4. Aucune instrumentation nouvelle, aucun z-index, chaîne buy intacte.
  const tracks = [...PO.matchAll(/track\("([^"]+)"/g)].map(m => m[1])
  ok(tracks.length === 1 && tracks[0] === 'sg_pass_offer_view', `aucun event ajouté (seul sg_pass_offer_view, trouvé : ${tracks.join(',')})`)
  const rowBlock = PO.slice(rowIdx, PO.indexOf('Paiement sécurisé · Accès immédiat'))
  ok(!/zIndex/.test(rowBlock), 'aucun z-index dans la rangée')
  ok(PO.includes('const buy=()=>{') && PO.includes('onBuy({c:cents'), 'chaîne buy→onBuy intacte')
  ok(!/Mollie|createToken|doSubscribe|checkout|onPassBuy/.test(rowBlock), 'ni Mollie ni checkout ni buy dans la rangée')

  console.log(failures === 0 ? '\nPASSOFFER-TRUST-ROW TESTS: ALL PASS' : `\nPASSOFFER-TRUST-ROW TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
