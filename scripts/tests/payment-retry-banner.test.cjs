#!/usr/bin/env node
/**
 * payment-retry-banner.test.cjs — PAYUX #1 (parcours paiement, retour Mollie).
 *
 * Friction : le retour /?payment_failed=1 (annulation 3DS, échec, expiration)
 * rouvrait le paywall SANS aucun message — le contexte sg_payment_retry était
 * écrit en sessionStorage mais jamais lu. Le payeur croyait à un bug.
 *
 * Fix : WorldPaywall lit sg_payment_retry une fois (fraîcheur ≤ 15 min),
 * affiche une bannière role=alert honnête ("aucun montant débité") mappée par
 * statut (canceled/expired/failed), dismiss efface le contexte.
 * Le handler App conserve désormais params.get("status") dans le contexte.
 * Rollback : ?payfailmsg=0. Montants/provider/tracking intacts.
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
  const APP = read('src/Sargasses_PROD.jsx')

  // 1. Lecture du contexte retry (source de vérité = clé écrite par l'App).
  ok(WP.includes('sessionStorage.getItem("sg_payment_retry")'), 'WorldPaywall lit sg_payment_retry (sessionStorage)')
  ok(/Date\.now\(\) - ctx\.ts > 15 \* 60 \* 1000/.test(WP), 'fraîcheur ≤ 15 min (pas de bannière résiduelle)')
  ok(WP.includes('payfailmsg=0'), 'rollback produit ?payfailmsg=0 présent')

  // 2. Statut propagé par le handler payment_failed (+ rollback à l'écriture).
  ok(APP.includes('status:params.get("status")||""'), 'handler ?payment_failed=1 conserve le statut Mollie')
  ok(APP.includes('payfailmsg=0'), 'rollback ?payfailmsg=0 lu à l\'écriture (URL nettoyée ensuite par replaceState)')

  // 3. Bannière : sémantique a11y + mapping des statuts + honnêteté "aucun débit".
  ok(WP.includes('data-testid="payment-retry-banner"'), 'data-testid payment-retry-banner')
  ok(/role="alert"/.test(WP), 'role="alert" (lecture écran immédiate)')
  ok(/ctx\.status === "canceled" \|\| ctx\.status === "expired" \|\| ctx\.status === "failed"/.test(WP), 'allowlist statuts (canceled/expired/failed → fallback failed)')
  ok(WP.includes('"canceled"') && WP.includes('"expired"') && WP.includes('"failed"'), '3 statuts mappés')
  ok(WP.indexOf('aucun montant débité') >= 0, 'copy honnête : aucun montant débité (FR)')
  ok(WP.indexOf('no charge') >= 0, 'copy honnête : no charge (EN)')
  ok(WP.indexOf('sin ningún cargo') >= 0, 'copy honnête : sin cargo (ES)')

  // 4. Dismiss : efface le contexte + ferme la bannière (pas de rerun infini).
  ok(WP.includes('sessionStorage.removeItem("sg_payment_retry")'), 'dismiss efface sg_payment_retry')
  ok(/onClick=\{dismissRetryInfo\}/.test(WP), 'bouton dismiss branché')

  // 5. Sécurité périmètre : AUCUN montant, provider, endpoint ou tracking touché.
  ok(!WP.includes('1499') && !WP.includes('1 499'), 'aucun montant codé en dur dans WorldPaywall')
  ok(!/create_payment|createToken|payment_status/.test(WP), 'aucune logique paiement dans WorldPaywall')
  ok(!/track\(/.test(WP.slice(WP.indexOf('retryInfo'), WP.indexOf('retryInfo') + 2600)), 'aucun tracking nouveau dans le bloc retry')

  console.log(failures === 0 ? '\nPAYMENT-RETRY-BANNER TESTS: ALL PASS' : `\nPAYMENT-RETRY-BANNER TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
