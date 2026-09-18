#!/usr/bin/env node
/**
 * passoffer-cta-copy.test.cjs — Test E1 (spécificité du CTA PassOffer).
 *
 * Avant E1, le CTA hero disait le bénéfice vague ("Voir mes plages propres →").
 * E1 nomme le livrable ("Voir la prévision 7 jours →", FR/EN/ES), longueur
 * équivalente (pas de layout), avec rollback ?sgcta=0 (copy historique).
 * Hors scope volontaire (E4/E11/E2) : subline durée/no-sub, trust row, social proof.
 *
 * Audits :
 *  1. Copy spécifique FR/EN/ES présent (livrable nommé).
 *  2. Copy historique conservé derrière le flag (rollback réel).
 *  3. Flag ?sgcta=0 câblé (ctaSpecific, défaut ON).
 *  4. Sticky CTA toujours prix-spécifique (money displayCents) — inchangé.
 *  5. aria-label "Commencer maintenant" stable (sélecteurs E2E money-path).
 *  6. Contrat onBuy intact ({c,pass,days,segment} one-price).
 *
 * Preuve live (preview + Playwright : libellé rendu FR + rollback + clic →
 * checkout) exécutée à la main, consignée dans MASTER_AUDIT.md. Exit 1 si échec.
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
  ok(PO.includes('Voir la prévision 7 jours →'), 'CTA FR spécifique (livrable nommé)')
  ok(PO.includes('See the 7-day forecast →'), 'CTA EN spécifique')
  ok(PO.includes('Ver el pronóstico 7 días →'), 'CTA ES spécifique')
  ok(PO.includes('Voir mes plages propres →'), 'copy historique conservé (rollback)')
  ok(/ctaSpecific\s*=\s*\(\(\)=>\{try\{return !\/\[\?&\]sgcta=0/.test(PO), 'flag ?sgcta=0 câblé (défaut ON)')
  ok(/ctaSpecific \? "Voir la prévision 7 jours/.test(PO), 'hero branché sur le flag')
  ok(PO.includes('Voir mes plages propres · ${money(displayCents'), 'sticky prix-spécifique inchangé')
  ok(PO.includes('aria-label={_t(lang, "Commencer maintenant"'), 'aria-label stable (sélecteurs E2E)')
  ok(/onBuy\(\{c:cents,pass:PASS\.key,days:PASS\.days,segment:seg\}\)/.test(PO), 'contrat onBuy intact')

  console.log(failures === 0 ? '\nPASSOFFER-CTA-COPY TESTS: ALL PASS' : `\nPASSOFFER-CTA-COPY TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

try { main() } catch (e) {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
}
