#!/usr/bin/env node
/* eslint-disable */
/**
 * analyze-ux.cjs — ALERTE UX / FUNNEL first-party (lit stats.php, zéro Google).
 *
 * Mandat fondateur : "notre système d'analyse/scroll/clic doit nous ALERTER quand
 * les gens sont BLOQUÉS, que l'UX n'est pas simple, qu'ils n'avancent pas dans le
 * funnel ou qu'ils S'ENNUIENT — pour construire par-dessus en solutionnant
 * (SVG / marketing / code web)." Ce script est le CERVEAU de la boucle
 * détecter → alerter → fixer. Indépendant, scalable (N régions), automatisable (cron).
 *
 * Usage :
 *   SG_STATS_KEY=<key> node scripts/analyze-ux.cjs                # toutes régions (clé partagée)
 *   node scripts/analyze-ux.cjs --days 7
 *   node scripts/analyze-ux.cjs --mock scripts/automation/data/_stats-sample.json   # test offline
 * Clés par région (chaque host génère la sienne dans sg-data/.statskey, récupérée par FTP) :
 *   - SG_STATS_KEY (si partagée) OU scripts/automation/data/stats-keys.json (gitignored) :
 *     { "mq":"...", "gp":"...", "florida":"...", "puntacana":"...", "rivieramaya":"..." }
 * Sortie : alertes triées en console + scripts/automation/data/ux-alerts.json (pour le build loop).
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const DAYS = Math.max(1, Math.min(30, parseInt(arg('--days', '7')) || 7))
const MOCK = arg('--mock', null)

// Régions → domaine. MQ/GP en dur (historique), le reste depuis le moteur regions/.
function regionsList() {
  const sites = [
    { id: 'mq', domain: 'sargasses-martinique.com' },
    { id: 'gp', domain: 'sargasses-guadeloupe.com' },
  ]
  try {
    const { getAllRegions } = require('../regions/index.cjs')
    for (const r of getAllRegions()) if (r && r.domain) sites.push({ id: r.id, domain: r.domain })
  } catch (e) { /* moteur regions absent → MQ/GP seulement */ }
  return sites
}

function loadKeys() {
  const env = process.env.SG_STATS_KEY
  let map = {}
  try { map = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'automation', 'data', 'stats-keys.json'), 'utf8')) } catch (e) {}
  return { env, map }
}

async function fetchStats(domain, key) {
  const url = `https://${domain}/stats.php?key=${encodeURIComponent(key)}&days=${DAYS}`
  const res = await fetch(url, { headers: { 'User-Agent': 'sarga-ux-analyzer' } })
  const txt = await res.text()
  let json; try { json = JSON.parse(txt) } catch (e) { throw new Error(`réponse non-JSON (${res.status})`) }
  if (json.error) throw new Error(json.error)
  return json
}

// ── Seuils (tunables) — un signal n'alerte qu'au-dessus d'un volume mini (anti-bruit).
const T = {
  minScreenVisits: 15,
  boredRate: 0.35,        // ≥35% s'ennuient sur un écran
  shortDwellMs: 3500,     // décrochage : <3,5s sur un écran à fort trafic
  minFunnelSessions: 30,
  modalToCta: 12,         // % — sous ça, le paywall ne convainc pas (la fuite mesurée ~2,2%)
  ctaToRedirect: 60,      // % — sous ça, fuite avant d'arriver à Stripe
  redirectToConv: 30,     // % — sous ça, abandon au checkout Stripe
}

// Angle de fix par type — alimente "construire par-dessus" (SVG / marketing / code).
const FIX = {
  ennui: 'SVG : rendre l\'écran vivant à l\'interaction (reveal, devine-puis-révèle) + Lecture du Jour ; jamais de boucle idle.',
  decrochage: 'UX : clarifier le next-step (un seul CTA désirable) + ancrer l\'info dans la scène, pas en panneau.',
  funnel_modal: 'Marketing/conversion : paywall in-scène sur intention CHAUDE (forecast-lock), 1 promesse+1 preuve+1 CTA, value-prop positive en saison calme.',
  funnel_cta: 'Code : checkout on-site (pas de redirect externe qui perd au saut), pré-remplir email, réduire les étapes.',
  funnel_conv: 'Code : sonder la perte au redirect Stripe (3DS/timeout), checkout on-site partout, panier abandonné armé.',
  bloque: 'UX : sortie/next-step TOUJOURS visible (dock immortel), jamais de cul-de-sac, retour élastique.',
}

function analyzeRegion(id, data) {
  const alerts = []
  const sessions = data.sessions || 0
  // 1) ENNUI + DÉCROCHAGE par écran
  const screens = data.screens || {}
  for (const [scr, o] of Object.entries(screens)) {
    const v = o.visits || 0; if (v < T.minScreenVisits) continue
    if ((o.bored_rate || 0) >= T.boredRate)
      alerts.push({ region: id, type: 'ennui', where: scr, metric: `bored ${Math.round(o.bored_rate * 100)}%`, volume: v, severity: o.bored_rate * v, fix: FIX.ennui })
    if ((o.avg_dwell_ms || 0) > 0 && o.avg_dwell_ms < T.shortDwellMs && v >= T.minScreenVisits * 2)
      alerts.push({ region: id, type: 'decrochage', where: scr, metric: `dwell ${Math.round(o.avg_dwell_ms / 100) / 10}s`, volume: v, severity: (T.shortDwellMs - o.avg_dwell_ms) / 1000 * v / 10, fix: FIX.decrochage })
  }
  // 2) FUNNEL — par région (la marche revenu + les fuites)
  const br = (data.byRegion || {})[id] || (Object.keys(data.byRegion || {}).length === 1 ? Object.values(data.byRegion)[0] : null)
  if (br && br.sessions >= T.minFunnelSessions) {
    const r = br.rates || {}, f = br.funnel || {}
    if (f.modal_open >= 10 && (r.modal_to_cta || 0) < T.modalToCta)
      alerts.push({ region: id, type: 'funnel_modal', where: 'modal→CTA', metric: `${r.modal_to_cta}%`, volume: f.modal_open, severity: (T.modalToCta - r.modal_to_cta) * f.modal_open / 10, fix: FIX.funnel_modal })
    if (f.modal_cta >= 5 && (r.cta_to_redirect || 0) < T.ctaToRedirect)
      alerts.push({ region: id, type: 'funnel_cta', where: 'CTA→redirect', metric: `${r.cta_to_redirect}%`, volume: f.modal_cta, severity: (T.ctaToRedirect - r.cta_to_redirect) * f.modal_cta / 10, fix: FIX.funnel_cta })
    if (f.checkout_redirect >= 5 && (r.redirect_to_conversion || 0) < T.redirectToConv)
      alerts.push({ region: id, type: 'funnel_conv', where: 'redirect→paiement', metric: `${r.redirect_to_conversion}%`, volume: f.checkout_redirect, severity: (T.redirectToConv - r.redirect_to_conversion) * f.checkout_redirect / 10, fix: FIX.funnel_conv })
  }
  // 3) FRICTION — rage-clicks (sg_friction) = "ça marche pas / je suis bloqué".
  const fric = (br && br.friction) || 0
  if (fric >= 5)
    alerts.push({ region: id, type: 'bloque', where: 'rage-clicks', metric: `${fric} évts`, volume: fric, severity: fric * 3, fix: FIX.bloque })
  return alerts
}

async function main() {
  let perRegion = []
  if (MOCK) {
    const data = JSON.parse(fs.readFileSync(path.resolve(ROOT, MOCK), 'utf8'))
    const id = (data.regions && Object.keys(data.regions)[0]) || 'mock'
    perRegion.push({ id, data })
  } else {
    const { env, map } = loadKeys()
    if (!env && !Object.keys(map).length) {
      console.error('⚠ Aucune clé. Mets SG_STATS_KEY=<clé> (sg-data/.statskey via FTP) ou scripts/automation/data/stats-keys.json {region:key}. Ou teste : --mock scripts/automation/data/_stats-sample.json')
      process.exit(2)
    }
    for (const site of regionsList()) {
      const key = map[site.id] || env
      if (!key) continue
      try { perRegion.push({ id: site.id, data: await fetchStats(site.domain, key) }) }
      catch (e) { console.error(`  [${site.id}] ${e.message}`) }
    }
  }

  let alerts = []
  for (const { id, data } of perRegion) alerts = alerts.concat(analyzeRegion(id, data))
  alerts.sort((a, b) => b.severity - a.severity)

  const out = { generated: new Date().toISOString(), days: DAYS, regions: perRegion.map(p => p.id), alertCount: alerts.length, alerts }
  try { fs.mkdirSync(path.join(ROOT, 'scripts', 'automation', 'data'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'scripts', 'automation', 'data', 'ux-alerts.json'), JSON.stringify(out, null, 2)) } catch (e) {}

  const ICON = { ennui: '😴', decrochage: '🚪', funnel_modal: '🧱', funnel_cta: '💸', funnel_conv: '🛑', bloque: '⛔' }
  console.log(`\n═══ ALERTES UX/FUNNEL · ${DAYS}j · régions: ${out.regions.join(', ') || '—'} ═══`)
  if (!alerts.length) { console.log('✅ Aucune alerte au-dessus des seuils (ou pas assez de volume).'); return }
  alerts.slice(0, 20).forEach((a, i) => {
    console.log(`\n${i + 1}. ${ICON[a.type] || '•'} [${a.region}] ${a.type.toUpperCase()} · ${a.where} = ${a.metric} (n=${a.volume})`)
    console.log(`   → FIX : ${a.fix}`)
  })
  console.log(`\n→ ${alerts.length} alertes · backlog écrit dans scripts/automation/data/ux-alerts.json`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
