#!/usr/bin/env node
/**
 * forecast-j1-free.test.cjs — Test A13 (J+1 offert, le "aha" avant paywall).
 *
 * État : la fiche plage (BeachSheetComic) verrouillait J+1→J+6 (gated i>0 +
 * cadenas invisible dès 15%). A13 ouvre J+1 (donnée réelle, jamais fabriquée),
 * J+2→J+6 restent verrouillés. Rollback ?j1_free=0 (ordre historique).
 *
 * Audits :
 *  1. Flag j1Free + rollback ?j1_free=0 (scope fiche bsc).
 *  2. Gating J+1 : `i>(j1Free?1:0)` ; ancienne forme `i>0` disparue du strip.
 *  3. Cadenas invisible : départ 29% si J+1 offert / 15% en rollback + garde
 *     de longueur (aucun jour verrouillé → pas de bouton).
 *  4. Pastille INCLUS sur J+1 (i===1) quand offert, non-premium, non-free7.
 *  5. Cartes jour testables (data-testid fc-day + data-gated).
 *  6. Bypass premium/free7 préservés (aucun changement pour les payants/suivis).
 *  7. Event de mesure inchangé (sg_forecast_lock_click sur le cadenas).
 *  8. Scope : ChasseHome (autre surface) non touchée ; commentaire E2E p1-03
 *     mis à jour (J0+J1 nets).
 *
 * Preuve live (preview + Playwright, vrai funnel carte→fiche) exécutée à la
 * main et consignée dans MASTER_AUDIT.md. Exit 1 si échec.
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
  const S = read('src/Sargasses_PROD.jsx')
  const CH = read('src/ChasseHome.jsx')
  const P103 = read('tests/e2e/p1-03-week-hub.spec.ts')

  ok(/const j1Free=\(\(\)=>\{try\{return !\/\[\?&\]j1_free=0/.test(S), 'flag j1Free + rollback ?j1_free=0')
  ok(S.includes('const gated=!isPremium&&!free7&&i>(j1Free?1:0)'), 'gating strip : i>(j1Free?1:0)')
  ok(!S.includes('const gated=!isPremium&&!free7&&i>0'), 'ancienne forme i>0 disparue')
  ok(S.includes('fcDays.length>(j1Free?2:1)'), 'cadenas masqué sans jour verrouillé')
  ok(S.includes('left:(j1Free?"29%":"15%")'), 'cadenas : 29% si J+1 offert, 15% en rollback')
  ok(/j1Free&&!isPremium&&!free7&&i===1/.test(S), 'pastille J+1 (i===1) non-premium non-free7')
  ok(S.includes('"Inclus","Included","Incluido"') || S.includes('"Inclus", "Included"'), 'pastille libellée Inclus (FR/EN/ES)')
  ok(S.includes('data-testid="fc-day"') && S.includes('data-gated={gated?"1":"0"}'), 'cartes jour testables (fc-day + data-gated)')
  ok(/const gated=!isPremium&&!free7&&/.test(S), 'bypass premium/free7 préservés')
  ok(S.includes('trk("sg_forecast_lock_click",{variant:"bsc",beat:0});onCTA()'), 'event lock inchangé (mesure existante)')
  ok(!CH.includes('j1_free') && !CH.includes('j1Free'), 'ChasseHome hors scope (non touchée)')
  ok(!/J0 net, J1\+ flout/.test(P103), 'commentaire E2E p1-03 mis à jour (plus de "J1+ floutés")')

  console.log(failures === 0 ? '\nFORECAST-J1-FREE TESTS: ALL PASS' : `\nFORECAST-J1-FREE TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

try { main() } catch (e) {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
}
