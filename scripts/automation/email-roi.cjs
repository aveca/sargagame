#!/usr/bin/env node
/**
 * Email ROI — lecture unique « qu'est-ce que l'email rapporte ».
 *
 * Mesure B (2026-06-17) : on a découvert qu'AUCUNE attribution n'existait
 * (opens/clicks jetés dans les logs CI, zéro lien clic→paiement). Cette mesure,
 * 100% additive et gratuite, s'appuie sur la plomberie déjà en place :
 *   - ENGAGEMENT : cumuls Resend (?action=email_stats) persistés en série dans
 *     daily-metrics.json (champ `email`) par daily-stats-check.cjs.
 *   - REVENU     : abonnements Stripe bucketés par metadata.source (champ
 *     `stripe.emailAttributed` / `stripe.bySource`). Le front pose
 *     source=deeplink_email quand le clic vient d'un mail (?paywall=1&utm_source=email).
 *
 * L'attribution démarre AU DÉPLOIEMENT : les abonnés pré-on-site n'ont pas de
 * source (legacy Payment Links). Donner ~2-4 semaines pour un chiffre exploitable.
 *
 * Usage : node scripts/automation/email-roi.cjs [--days=28]
 */
const fs = require('fs')
const path = require('path')

const METRICS_PATH = path.join(__dirname, 'data', 'daily-metrics.json')
const days = (() => {
  const a = process.argv.find(x => x.startsWith('--days='))
  return a ? Math.max(1, parseInt(a.split('=')[1], 10) || 28) : 28
})()

function load() {
  try { return JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8')) } catch { return [] }
}

function lastWith(rows, pred) {
  for (let i = rows.length - 1; i >= 0; i--) if (pred(rows[i])) return rows[i]
  return null
}

function main() {
  const all = load()
  if (!all.length) { console.log('Pas de daily-metrics.json — rien à lire.'); return }

  // Fenêtre : les `days` derniers jours présents dans la série.
  const window = all.slice(-days)
  const first = window[0], last = window[window.length - 1]

  console.log('=== Email ROI (mesure B) ===')
  console.log(`Période : ${first.date} → ${last.date} (${window.length} j de série)\n`)

  // ── ENGAGEMENT : deltas cumul Resend sur la fenêtre ──────────────────────
  const startE = window.find(r => r.email && r.email.delivered != null)?.email || null
  const endE = lastWith(window, r => r.email && r.email.delivered != null)?.email || null
  console.log('ENGAGEMENT (cumul Resend, delta sur la période)')
  if (startE && endE) {
    const d = (k) => Math.max(0, (endE[k] ?? 0) - (startE[k] ?? 0))
    const deliv = d('delivered'), opened = d('opened'), clicked = d('clicked'), bounced = d('bounced')
    const openPct = deliv ? Math.round((opened / deliv) * 1000) / 10 : null
    const clickPct = opened ? Math.round((clicked / opened) * 1000) / 10 : null
    console.log(`  Délivrés +${deliv} · Ouverts +${opened}${openPct != null ? ` (${openPct}% des délivrés)` : ''} · Clics +${clicked}${clickPct != null ? ` (${clickPct}% des ouvreurs)` : ''} · Bounces +${bounced}`)
    console.log(`  (cumul actuel : ${endE.opened ?? '–'} ouverts / ${endE.delivered ?? '–'} délivrés · ${endE.clicked ?? '–'} clics)`)
  } else {
    console.log('  Pas encore de point d\'engagement en série (le 1er run daily-stats-check le posera).')
  }

  // ── REVENU : attribution Stripe metadata.source ──────────────────────────
  const st = lastWith(all, r => r.stripe && r.stripe.emailAttributed)?.stripe || null
  console.log('\nATTRIBUTION REVENU (Stripe metadata.source)')
  if (st && st.emailAttributed) {
    const a = st.emailAttributed
    console.log(`  Abonnés venus d'un mail : ${a.active} · €${a.mrrEur}/mois de MRR attribué`)
    if (st.bySource) {
      const rows = Object.entries(st.bySource).sort((x, y) => y[1].active - x[1].active)
      console.log('  Répartition de TOUS les abonnés actifs par source :')
      for (const [src, v] of rows) console.log(`    ${String(v.active).padStart(3)}  ${src}${v.mrrEur ? `  (€${v.mrrEur}/mo)` : ''}`)
    }
  } else {
    console.log('  Pas encore de point Stripe avec attribution (tourne en local/cron command-center avec .env).')
  }

  // ── VERDICT ──────────────────────────────────────────────────────────────
  console.log('\nVERDICT')
  const a = st && st.emailAttributed
  if (!a || a.active === 0) {
    console.log('  Attribution à 0 — ATTENDU au démarrage. Les 15 abonnés actuels sont pré-on-site (sans source).')
    console.log('  → Laisser tourner ~2-4 semaines. Dès qu\'un abonné porte source=*email*, il apparaît ici.')
    console.log('  → Décision « payer Resend ? » = à reprendre quand ce chiffre est non nul et stable.')
  } else {
    const payback = a.mrrEur >= 20
    console.log(`  L'email a généré ${a.active} abonné(s) actifs = €${a.mrrEur}/mois.`)
    console.log(payback
      ? `  → Couvre largement Resend Pro ($20/mo). L'email se paie tout seul — scaler est justifié.`
      : `  → Encore sous le coût d'un plan payant ($20/mo). Continuer à mesurer avant de payer.`)
  }
}

main()
