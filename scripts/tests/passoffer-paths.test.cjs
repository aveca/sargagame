#!/usr/bin/env node
/**
 * passoffer-paths.test.cjs — Test A7 (tous les chemins via PassOffer simplifié).
 *
 * Invariant verrouillé : UNE SEULE offre B2C (one-price p30) et UN SEUL point
 * d'entrée d'achat (onPassBuy → passCtx → OnsiteCheckout). Les résidus legacy
 * (props variantes pwPass/pwSocial/pwFresh/pwSocialProof, threads A/B morts)
 * sont purgés pour ne jamais ressusciter un chemin parallèle.
 *
 * Audits :
 *  1. UNE SEULE écriture passCtxRef.current = (onPassBuy, PremiumModal).
 *  2. setPayStep(true) uniquement dans onPassBuy (aucun contournement).
 *  3. Les 3 sites <PassOffer (World×2 branches, Comic×1) portent onBuy.
 *  4. PassOffer.buy = contrat one-price {c,pass,days,segment} (PASS.key p30).
 *  5. Zéro résidu pwPass/pwSocial/pwFresh/pwSocialProof (PremiumModal + paywalls).
 *  6. OnsiteCheckout dérive de passCtx (aucun choix de pass indépendant).
 *  7. B2BModal (produit B2B distinct) sans PassOffer/onPassBuy (hors scope acté).
 *
 * Preuve live (preview + Playwright : clic offre → checkout cohérent 30 j /
 * même prix) exécutée à la main, consignée dans MASTER_AUDIT.md. Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const SRC = ['src/PremiumModal.jsx', 'src/PremiumModal/WorldPaywall.jsx', 'src/PremiumModal/ComicPaywall.jsx',
  'src/PremiumModal/OnsiteCheckout.jsx', 'src/PremiumModal/doSubscribe.jsx', 'src/PremiumModal/B2BModal.jsx',
  'src/PassOffer.jsx', 'src/Sargasses_PROD.jsx']
const all = Object.fromEntries(SRC.map((f) => [f, read(f)]))
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}
const count = (s, re) => (s.match(re) || []).length

function main() {
  const PM = all['src/PremiumModal.jsx']
  // 1+2. Point d'entrée unique.
  ok(count(PM, /passCtxRef\.current\s*=/g) === 1, 'UNE SEULE écriture passCtxRef.current (onPassBuy)')
  const writers = SRC.filter((f) => /setPayStep\(true\)/.test(all[f]))
  ok(writers.length === 1 && writers[0] === 'src/PremiumModal.jsx', `setPayStep(true) uniquement via onPassBuy (trouvé: ${writers.join(',') || 'aucun'})`)
  // 3. Les 3 sites PassOffer câblés.
  const sites = []
  for (const f of ['src/PremiumModal/WorldPaywall.jsx', 'src/PremiumModal/ComicPaywall.jsx']) {
    const re = /<PassOffer[\s\S]*?\/>/g
    let m
    while ((m = re.exec(all[f]))) sites.push({ f, tag: m[0] })
  }
  ok(sites.length === 3, `3 sites <PassOffer (World×2 + Comic×1, trouvés: ${sites.length})`)
  ok(sites.every((s) => /onBuy=/.test(s.tag)), 'chaque site porte onBuy')
  // 4. Contrat one-price.
  const PO = all['src/PassOffer.jsx']
  ok(/onBuy\(\{c:cents,pass:PASS\.key,days:PASS\.days,segment:seg\}\)/.test(PO), 'PassOffer.buy = contrat {c,pass,days,segment} one-price')
  ok(/key:\s*"p30"/.test(PO), 'PASS.key = p30 (offre unique)')
  // 5. Zéro résidu legacy.
  for (const f of ['src/PremiumModal.jsx', 'src/PremiumModal/WorldPaywall.jsx', 'src/PremiumModal/ComicPaywall.jsx']) {
    ok(!/pwPass|pwSocial|pwFresh|pwSocialProof/.test(all[f]), `zéro résidu variant dans ${f.split('/').pop()}`)
  }
  // 6. Checkout dérivé (aucun choix parallèle).
  const OC = all['src/PremiumModal/OnsiteCheckout.jsx']
  ok(/passCtxRef\.current/.test(OC) && !/setPayStep\(true\)/.test(OC), 'OnsiteCheckout dérive de passCtx, ne re-route jamais')
  // 7. Scope B2B acté.
  const B2B = all['src/PremiumModal/B2BModal.jsx']
  ok(!/<PassOffer/.test(B2B) && !/onPassBuy/.test(B2B), 'B2BModal sans PassOffer/onPassBuy (produit distinct, hors scope)')

  console.log(failures === 0 ? '\nPASSOFFER-PATHS TESTS: ALL PASS' : `\nPASSOFFER-PATHS TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

try { main() } catch (e) {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
}
