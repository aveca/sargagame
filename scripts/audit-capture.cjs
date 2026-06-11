// Audit « capture intelligence » — checklist issue des patterns sourcés des géants
// (memory reference_capture_intelligence : Duolingo valeur-avant-signup, Tesla
// clarté radicale, pièges FTC/DSA). 13 checks automatisés + 7 manuels listés.
// Usage : node scripts/audit-capture.cjs [--domain=https://...]   (défaut : les 5)
// Sortie : console + scripts/automation/data/capture-audit.json (score par domaine).
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ONLY = (process.argv.find(a => a.startsWith('--domain=')) || '').slice(9)
const DOMAINS = ONLY ? [ONLY] : [
  'https://sargasses-martinique.com',
  'https://sargasses-guadeloupe.com',
  'https://sargassumpuntacana.com',
  'https://sargassummiami.com',
  'https://sargassumcancun.com',
]
// Bloquants légaux (FTC/DSA) : un échec ici = alerte, pas juste un point perdu.
const BLOCKING = ['price_transparent', 'no_fake_scarcity']
const MANUAL = [
  'cta_to_redirect_rate ≥80% (funnel Apps Script — 94% au 2026-06-11)',
  'proof_is_real (compteurs branchés sur data live, pas de constante)',
  'capture_dismissible (close ≥44px + dismiss persistant 7j)',
  'inline_capture_present (form email inline fiche plage — présent par design)',
  'no_dark_pattern_asymmetry (styles accepter/refuser comparables)',
  'checkout_steps ≤2 navigations (vérifié par design : same-tab session 36)',
  'no_account_before_value (aucun mur de compte — vrai par architecture)',
]

async function auditDomain(browser, D) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pg = await ctx.newPage()
  const checks = {}
  const note = {}
  try {
    await pg.goto(D + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (e) { await ctx.close(); return { error: e.message.slice(0, 80) } }
  await sleep(3000)

  // 9. LCP < 2,5s (mesuré au chargement, avant interaction)
  const lcp = await pg.evaluate(() => new Promise(res => {
    let v = 0
    try {
      new PerformanceObserver(l => { const e = l.getEntries(); if (e.length) v = e[e.length - 1].startTime })
        .observe({ type: 'largest-contentful-paint', buffered: true })
    } catch (_) {}
    setTimeout(() => res(Math.round(v)), 400)
  }))
  checks.lcp_under_2_5s = lcp > 0 && lcp < 2500
  note.lcp_under_2_5s = lcp + 'ms'

  const fold = await pg.evaluate(() => document.body.innerText.slice(0, 1200))
  // 1. Verdict lisible premier écran sans interaction
  checks.hero_verdict_visible = /PROPRE|CLEAN TODAY|SIN SARGAZO|MODÉRÉ|MODERATE|À ÉVITER|AVOID|EVITAR/i.test(fold)
  // 11. Fraîcheur affichée
  checks.data_freshness_shown = /LIVE|il y a|ago|hace/i.test(fold)
  // 12. Attribution source
  checks.source_attribution = /Copernicus|satellite|satélite/i.test(fold)
  // 4. Promesse en une phrase courte (h1 ou heading visible ≤90c)
  checks.promise_one_sentence = await pg.evaluate(() => {
    const h = document.querySelector('h1') || document.querySelector('h2')
    return !!h && h.innerText.trim().length > 0 && h.innerText.trim().length <= 90
  })
  // 2. CTA au-dessus de la ligne de flottaison ≤ 4 (hero : CTA + carte + dismiss)
  const ctas = await pg.evaluate(() => [...document.querySelectorAll('button, a[role=button]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 30 && r.top >= 0 && r.bottom <= 844 }).length)
  checks.cta_count_above_fold = ctas <= 4
  note.cta_count_above_fold = ctas + ' visibles'
  // 13. Zéro fausse rareté (bloquant)
  const all = await pg.evaluate(() => document.body.innerText)
  checks.no_fake_scarcity = !/plus que \d|dépêche|hurry|only \d+ (left|remaining)|últim[oa]s \d|act now|offre expire/i.test(all)
  // 15/16. Pas de capture email sans interaction (10s après load)
  await sleep(4000)
  checks.no_capture_on_load = await pg.evaluate(() => {
    const inp = [...document.querySelectorAll('input[type=email]')]
    return !inp.some(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  })
  // 5. Formulaires ≤ 2 champs (tous les forms du DOM)
  checks.form_fields_max2 = await pg.evaluate(() =>
    [...document.querySelectorAll('form')].every(f => f.querySelectorAll('input:not([type=hidden]):not([type=submit])').length <= 2))

  // Paywall : ouvrir Premium → prix transparent + cancel path + pas de _blank
  try {
    for (const sel of ['text=Toutes les plages', 'text=All beaches on the map', 'text=Todas las playas']) {
      const el = pg.locator(sel).first()
      if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); break }
    }
    await sleep(800)
    const prem = pg.locator('button:has-text("Premium")').last()
    await prem.click({ timeout: 8000 })
    await sleep(2500)
    const modal = await pg.evaluate(() => document.body.innerText)
    // 3. Prix AVANT tout clic checkout (bloquant)
    checks.price_transparent = /4,99|5\.99|\$|€/.test(modal)
    // 20. Chemin d'annulation énoncé
    checks.cancel_path_stated = /annul|cancel|cancela/i.test(modal)
    // 7. Pas de _blank sur le flux paiement (same-tab, leçon session 36)
    checks.no_blank_checkout = await pg.evaluate(() =>
      ![...document.querySelectorAll('a[target=_blank]')].some(a => /stripe|checkout|buy\./i.test(a.href)))
  } catch (e) {
    checks.price_transparent = false
    checks.cancel_path_stated = false
    checks.no_blank_checkout = false
    note.paywall = 'inaccessible: ' + e.message.slice(0, 60)
  }
  await ctx.close()
  return { checks, note }
}

;(async () => {
  const browser = await chromium.launch()
  const report = { date: new Date().toISOString(), domains: {} }
  for (const D of DOMAINS) {
    const r = await auditDomain(browser, D)
    report.domains[D] = r
    if (r.error) { console.log(`\n=== ${D} === ERREUR: ${r.error}`); continue }
    const entries = Object.entries(r.checks)
    const pass = entries.filter(([, v]) => v).length
    const blockFails = entries.filter(([k, v]) => !v && BLOCKING.includes(k)).map(([k]) => k)
    console.log(`\n=== ${D} === ${pass}/${entries.length}${blockFails.length ? '  🚨 BLOQUANTS: ' + blockFails.join(',') : ''}`)
    for (const [k, v] of entries) console.log(`  ${v ? '✓' : '✗'} ${k}${r.note[k] ? ` (${r.note[k]})` : ''}`)
  }
  console.log('\nChecks manuels / par design (non automatisés) :')
  MANUAL.forEach(m => console.log('  • ' + m))
  const out = path.join(__dirname, 'automation/data/capture-audit.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(report, null, 1))
  console.log('\nRapport: scripts/automation/data/capture-audit.json')
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
