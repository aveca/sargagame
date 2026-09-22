#!/usr/bin/env node
/**
 * sticky-cta-align.test.cjs — E1 promise parity hero/sticky (2026-09-22).
 *
 * Friction : le CTA hero promet « Voir la prévision 7 jours → » (E1) tandis
 * que le sticky promettait « Voir mes plages propres · prix » — deux promesses
 * sur le même écran. Fix : le sticky réutilise le flag E1 `ctaSpecific`
 * (rollback partagé `?sgcta=0`), prix/aria-label/onBuy intacts.
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

  // 1. Sticky aligné sur E1 via le flag existant (pas de nouveau flag).
  ok(PO.includes('ctaSpecific ? `Voir la prévision 7 jours'), 'sticky FR suit ctaSpecific (E1)')
  ok(PO.includes('ctaSpecific ? `See the 7-day forecast'), 'sticky EN suit ctaSpecific (E1)')
  ok(PO.includes('ctaSpecific ? `Ver el pronóstico 7 días'), 'sticky ES suit ctaSpecific (E1)')

  // 2. Rollback partagé : ?sgcta=0 restaure l'ancien libellé sticky.
  ok(PO.includes(': `Voir mes plages propres ·'), 'rollback FR intact sous ?sgcta=0')
  ok(PO.includes(': `See clean beaches ·'), 'rollback EN intact sous ?sgcta=0')
  ok(PO.includes(': `Ver playas limpias ·'), 'rollback ES intact sous ?sgcta=0')

  // 3. Prix, accessibilité et chaîne d'achat intacts.
  ok(PO.includes('money(displayCents, cur, lang)'), 'prix affiché inchangé (money/displayCents)')
  ok(PO.includes('aria-label={_t(lang, "Commencer maintenant"'), 'aria-label sticky intact')
  ok(PO.includes('if(onBuy)onBuy({c:cents,pass:PASS.key'), 'chaîne buy→onBuy intacte')

  // 4. Garde-fous : pas de tracking ajouté, pas de logique financière.
  const stickyBlock = (PO.match(/sg-sticky-buy[\s\S]{0,2000}/) || [''])[0]
  ok(!/track\(/.test(stickyBlock), 'aucun tracking ajouté au sticky buy')
  ok(!/cents\s*=|PASS_CENTS\s*=|seasonalCents\(cents/.test(stickyBlock), 'aucune logique prix dans le sticky buy')

  // 5. Hero E1 intact (référence de la parité).
  ok(PO.includes('ctaSpecific ? "Voir la prévision 7 jours →"'), 'hero E1 intact (référence)')

  console.log(failures === 0 ? '\nSTICKY-CTA-ALIGN TESTS: ALL PASS' : `\nSTICKY-CTA-ALIGN TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
