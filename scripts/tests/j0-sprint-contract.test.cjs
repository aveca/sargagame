#!/usr/bin/env node
// J0-SPRINT contract — vérifie STATICEMENT les 8 objectifs du sprint J0-J30.
// Zéro navigateur : grep structurel sur les sources. Échoue (exit 1) si un
// chaînon manque. Règle : ne prétend rien de fonctionnel, prouve la présence.
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const PROD = R('src/Sargasses_PROD.jsx')
const WP = R('src/PremiumModal/WorldPaywall.jsx')
const PO = R('src/PassOffer.jsx')
const REPORT = R('src/components/BeachDayReport.jsx')
const ESPACE = R('public/pro/espace/index.html')
const FUN1 = R('scripts/automation/funnel-from-supabase.cjs')
const DAILY = R('scripts/automation/daily-stats-check.cjs')
const ENHANCED_ALTS = R('src/components/EnhancedAlternativesPanel.jsx')

console.log('— OBJ1 CRO paywall —')
// 1a. Ordre offre-avant-email par défaut + rollback ?sgpayorder=0
check('payOrderOfferFirst flag + rollback sgpayorder=0', /sgpayorder=0/.test(WP) && /payOrderOfferFirst/.test(WP))
check('PassOffer rendu AVANT email (flag on)', WP.indexOf('{payOrderOfferFirst && (') !== -1)
check('PassOffer rendu UNE SEULE fois par branche', (WP.match(/<PassOffer/g) || []).length === 2, `trouvé ${(WP.match(/<PassOffer/g) || []).length}`)
check('email input sans required bloquant', !/type="email"[\s\S]{0,120}required/.test(WP), 'required encore présent')
// 1b. sg_pass_cta dans le backup critique (même chemin que modal_open)
check('sg_pass_cta en backup critique', /event==="sg_pass_cta"/.test(PROD) && /sg_pass_cta ajouté/.test(PROD))
check('chaîne buy→onPassBuy→sg_pass_cta intacte', /track\("sg_pass_cta"/.test(R('src/PremiumModal.jsx')) && /sg_pass_cta est tracké UNE seule fois/.test(PO))

console.log('— OBJ2 Où aller plutôt —')
check('nearestCleanAlt même île (territorialité)', /b\.island===beach\.island/.test(PROD))
check('planB ≤60km top-3 clean', /b\._d<=60/.test(PROD) && /status==="clean"/.test(PROD))
check('planB view trackée (sg_planb_view)', /trk\("sg_planb_view"/.test(PROD))
check('planB pick tracké (sg_planb_pick)', /sg_planb_pick/.test(PROD))
check('repli honnête si aucune alternative', /Pas d'alternative propre/.test(PROD) || /Pas d\\'alternative propre/.test(ENHANCED_ALTS))
check('planB déclenché pour avoid ET moderate (pas clean)', /status==="clean"\|\|status==="_loading"\)return\[\]/.test(PROD))

console.log('— OBJ3 Rapport / partage —')
check('bouton rapport fiche (sg_pdf_preview)', /sg_pdf_preview/.test(PROD))
check('BeachDayReport share natif+clipboard', /navigator\.share/.test(REPORT) && /navigator\.clipboard/.test(REPORT))
check('bouton WhatsApp explicite wa.me', /wa\.me\/\?text=/.test(REPORT))
check('tracking whatsapp via sg_pdf_share interaction', /interaction:\s*"whatsapp"/.test(REPORT))
check('texte partagé factuel (état+date, zéro promesse)', /Mesuré au satellite/.test(REPORT) && !/garanti/i.test(REPORT.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')))

console.log('— OBJ4 B2B self-serve —')
check('trial endpoint existe', fs.existsSync(path.join(ROOT, 'public/api/b2b-trial.php')))
check('espace appelle b2b-trial.php', /fetch\("\/api\/b2b-trial\.php"/.test(ESPACE))
check('espace vérifie token (widget-token.php)', /widget-token\.php\?k=/.test(ESPACE))
check('espace snippet iframe avec ?k= token', /if\(token\)p\.set\("k",token\)/.test(ESPACE))
check('espace abo mensuel create_subscription (additif, inchangé)', /action:"create_subscription"/.test(ESPACE))
check('espace paylink annuel (b2b-paylinks.json)', /b2b-paylinks\.json/.test(ESPACE))
check('paylinks pro_annual 690€ live', (() => { try { const j = JSON.parse(R('public/api/b2b-paylinks.json')); return j.links && j.links.pro_annual && /690/.test(JSON.stringify(j.links.pro_annual)) } catch { return false } })())
check('espace télémétrie trial_activated (zéro PII)', /sg_b2b_trial_activated/.test(ESPACE) && !/trialEmail.*sgEv|sgEv.*trialEmail/.test(ESPACE))
check('espace télémétrie paylink_click', /sg_b2b_paylink_click/.test(ESPACE))
check('espace télémétrie space_open + widget_preview', /sg_b2b_space_open/.test(ESPACE) && /sg_b2b_widget_preview/.test(ESPACE))
check('money-path intact (aucun montant modifié)', /PLAN_MO/.test(ESPACE) && /PLAN_YR_KEY/.test(ESPACE))

console.log('— OBJ5 Ground truth —')
check('vote 1-tap 3 niveaux existe (BeachReport)', /Sur place \? Signale/.test(PROD))
check('submit sg_beach_report + offline queue', /track\("sg_beach_report"/.test(PROD) && /_sgReportStash/.test(PROD))
check('modération via submit-report (pas de publi directe)', /submitBeachReport/.test(PROD) && /fetchApprovedReports/.test(PROD))
check('verdict jamais influencé (terrain affiché à part)', /ne\s*$|touche PAS la couleur du verdict/.test(PROD))
check('seuil consensus ≥3 (pas de petit N publié)', /total>=3/.test(PROD))

console.log('— OBJ6 Analytics allowlists —')
const NEW_EV = ['sg_planb_view', 'sg_planb_pick', 'sg_beach_report', 'sg_observation', 'sg_beach_event', 'sg_obs_smell', 'sg_b2b_widget_preview']
for (const ev of NEW_EV) {
  const bare = ev.replace(/^sg_/, '')
  check(`${ev} dans SG_FUNNEL_EVENTS`, PROD.includes(`"${ev}"`), 'absent du front allowlist')
  check(`${bare} dans funnel-from-supabase FUNNEL_KEYS`, FUN1.includes(`'${bare}'`), 'aveugle snapshot')
}
check('pass_offer_view dans FUNNEL_KEYS (2 scripts)', FUN1.includes("'pass_offer_view'") && DAILY.includes("'pass_offer_view'"))
check('daily-stats ctaViews + altViews + rates', /ctaViews/.test(DAILY) && /alt_view_to_click/.test(DAILY) && /cta_view_to_click/.test(DAILY))

console.log('— OBJ4b B2B monthly front (mission 2026-09-15) —')
const B2BM = R('src/PremiumModal/B2BModal.jsx')
const MOLLIB = R('public/api/mollie-lib.php')
const WH = R('public/api/mollie-webhook.php')
const WK = R('workers/sg-payments/src/index.ts')
check('espace toggle Concierge actif en USD (plus de masquage)', !/if\(CUR==="USD"\)\{var _tr/.test(ESPACE))
check('espace deep-link ?tier= + ?email=', /\?tier=/.test(B2BM) && /get\("tier"\)/.test(ESPACE) && /get\("email"\)/.test(ESPACE))
check('B2BModal pont mensuel → espace (monthly_bridge)', /monthly_bridge/.test(B2BM) && /\/pro\/espace\/\?tier=/.test(B2BM))
check('espace télémétrie lead_success (zéro PII)', /sg_b2b_lead_success/.test(ESPACE))
check('plans USD mensuels PHP (89/39)', /pro_monthly_usd/.test(MOLLIB) && /brief_monthly_usd/.test(MOLLIB))
check('grant mensuel 30j inclut USD (pas 365)', /'pro_monthly_usd', 'brief_monthly_usd'/.test(MOLLIB))
check('webhook PHP grants USD + subscription_created + trial_to_paid', /'pro_monthly_usd', 'brief_monthly_usd'/.test(WH) && /subscription_created/.test(WH) && /b2b_trial_to_paid/.test(WH))
check('worker B2B_PLANS USD + grants USD + analytics', /pro_monthly_usd/.test(WK) && /brief_monthly_usd/.test(WK) && /subscription_created/.test(WK) && /b2b_trial_to_paid/.test(WK))
check('clés funnel b2b_lead_success + subscription_created', FUN1.includes("'b2b_lead_success'") && FUN1.includes("'subscription_created'") && DAILY.includes("'b2b_lead_success'") && DAILY.includes("'subscription_created'"))

check('espace inline scripts parsables (P0 2026-09-15 : un `)` manquant tuait TOUT le JS espace)', (() => {
  try {
    const blocks = [...ESPACE.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    if (!blocks.length) return false
    const vm = require('vm')
    for (const b of blocks) { new vm.Script(b) }
    return true
  } catch { return false }
})())

console.log('— BUG-2026-036 readiness carte (mission fermeture #672) —')
const WMV = R('src/WorldMapView.jsx')
check('declutter publie data-sg-labels-ready (arbitrage achevé, els>0)', /data-sg-labels-ready/.test(WMV) && /els\.length>0/.test(WMV))
check('héros repliable sg-hero-dismiss (44px, session, ?maphero=0 intact)', /sg-hero-dismiss/.test(WMV) && /sg_hero_fold/.test(WMV) && /maphero=0/.test(WMV))
check('prologues E2E attendent la readiness (pas 1er label visible)', (() => {
  const F = ['tests/e2e/funnel-payment.spec.ts', 'tests/e2e/bottomnav-redesign.spec.ts', 'tests/e2e/responsive.spec.ts', 'tests/e2e/j0-sprint.spec.ts']
  return F.every((f) => /waitForSelector\("\[data-sg-labels-ready\]"/.test(R(f)) && !/waitForSelector\("\.sg-maplabel", \{ timeout/.test(R(f)))
})())
check('funnel-82 repli héros quand aucun label tappable (assertions intactes)', /sg-hero-dismiss/.test(R('tests/e2e/funnel-payment.spec.ts')) && /toBeGreaterThanOrEqual\(0\)/.test(R('tests/e2e/funnel-payment.spec.ts')))

console.log('— OBJ7 gardes —')
check('aucun runtime 3D introduit par le sprint (diff git)', (() => {
  try {
    const { execSync } = require('child_process')
    const diff = execSync('git diff -- src/ public/pro/espace/index.html', { cwd: ROOT, encoding: 'utf8' })
    const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    return !added.some((l) => /from\s+["']three["']|require\(["']three["']|getContext\(\s*["']webgl/i.test(l))
  } catch { return false }
})())
check('rollback flags présents', /\?sgpayorder=0/.test(WP) && /\?report=0/.test(PROD))

console.log(`\n${pass} ok, ${fail} échecs`)
process.exit(fail ? 1 : 0)
