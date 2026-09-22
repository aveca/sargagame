#!/usr/bin/env node
/**
 * ux-qa-006-plus-tard.test.cjs — Contrat UX-QA-006 / UX-QA-005 (2026-09-21).
 *
 * Historique : run 20260916T2132Z (UX-D-002) — « Plus tard » ne fermait pas
 * le modal premium desktop. Cause racine : AVANT le fix UX-R2-003 (a1585b563,
 * 2026-09-17, POSTÉRIEUR au run) le panel paywall était à z1100, SOUS la
 * fiche ChasseDetail (z1200) — le clic atterrissait sur la couche fiche.
 * Le fix a monté backdrop=1250/panel=1260 : bug non reproductible depuis
 * (local + prod, desktop 1440×900 + mobile 390×844 — ux-qa-006-plus-tard.spec.ts).
 *
 * Ce contrat verrouille : les deux sorties (« Plus tard », ×) câblées sur
 * onClose, et le z-index UX-R2-003 conservé (anti-régression de la racine).
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
  const WP = read('src/PremiumModal/WorldPaywall.jsx')
  const PM = read('src/PremiumModal.jsx')
  const SPEC = 'tests/e2e/ux-qa-006-plus-tard.spec.ts'

  // 1. « Plus tard » (WorldPaywall) câblé sur onClose — la SEULE sortie douce,
  //    jamais un no-op ni une navigation.
  ok(WP.includes('onClick={onClose}'), 'WorldPaywall : bouton « Plus tard » → onClick={onClose}')
  ok(/onClick=\{onClose\}[\s\S]{0,700}t\("Plus tard"/.test(WP), '« Plus tard » = le bouton qui appelle onClose')

  // 2. × du shell (PremiumModal) présent + câblé onClose.
  ok(PM.includes('_t(lang,"Fermer","Close","Cerrar")'), 'PremiumModal : × aria-label Fermer/Close/Cerrar présent')
  ok(/via:"close_x"[\s\S]{0,80}onClose\(\)/.test(PM), '× : tracking close_x suivi de onClose()')

  // 3. Racine UX-QA-006 : UX-R2-003 conservé — panel AU-DESSUS de la fiche
  //    (.lc-detail z1200) : backdrop 1250, panel 1260, checkout 1300 (intact).
  ok(PM.includes('zIndex: 1250'), 'backdrop z1250 conservé (> .lc-detail z1200)')
  ok(/sg-modal-panel[\s\S]{0,400}zIndex:1260/.test(PM), 'panel z1260 conservé (> backdrop, < checkout)')
  ok(PM.includes('OnsiteCheckout'), 'OnsiteCheckout monté (z1300, au-dessus du paywall)')

  // 4. Spec de régression E2E présente (desktop 1440×900 + mobile 390×844).
  ok(fs.existsSync(path.join(ROOT, SPEC)), 'tests/e2e/ux-qa-006-plus-tard.spec.ts présente (E2E desktop+mobile)')
  const SP = read(SPEC)
  ok(SP.includes('width: 1440, height: 900'), 'spec : viewport desktop 1440×900')
  ok(SP.includes("name: 'Plus tard'"), 'spec : clic « Plus tard » couvert')
  ok(SP.includes('toHaveCount(0'), 'spec : assertion dialog réellement parti (DOM/ARIA)')

  console.log(failures === 0 ? '\nUX-QA-006 CONTRACT: ALL PASS' : `\nUX-QA-006 CONTRACT: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
