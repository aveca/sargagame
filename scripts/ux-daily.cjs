#!/usr/bin/env node
/* eslint-disable */
/**
 * ux-daily.cjs — TRACKING UX JOURNALIER + DIFF jour-à-jour (first-party, zéro Google).
 *
 * Mandat fondateur : « générer des rapports et du tracking JOURNALIER pour voir,
 * lorsqu'il y a des modifications journalières, ce qu'elles apportent au niveau des
 * datas de navigation et du comportement des utilisateurs, pour au fil du temps
 * améliorer leur expérience. »
 *
 * Complète analyze-ux.cjs (alertes hebdo, snapshot) : ici on prend un cliché COMPACT
 * chaque jour (stats.php?days=1), on l'empile dans un HISTORIQUE, et on DIFFE vs la
 * veille → on voit l'impact comportemental des changements shippés la veille
 * (funnel, friction/rage, dead-clicks NOMMÉS via top_dead_els, ennui). Corrèle avec
 * les commits src/ shippés dans les dernières 24 h.
 *
 * Source = stats.php (heatmap first-party : inclut top_dead_els depuis PR #320).
 * Indépendant de GA4/Clarity (qui, eux, ne rafraîchissent que le vendredi et sont
 * cred-gated) → fiable au quotidien.
 *
 * Usage :
 *   SG_STATS_KEY=<key> node scripts/ux-daily.cjs            # toutes régions (clé partagée)
 *   node scripts/ux-daily.cjs --send                        # + email digest (si SMTP prêt)
 *   node scripts/ux-daily.cjs --mock scripts/automation/data/_stats-sample.json
 * Clés par région : SG_STATS_KEY (partagée) OU SG_STATS_KEY_<REGION> (secrets CI)
 *   OU scripts/automation/data/stats-keys.json (gitignored, local).
 * Sorties (committées par daily-copernicus.yml) :
 *   - scripts/automation/data/ux-daily.json          → cliché du jour + diffs vs veille
 *   - scripts/automation/data/ux-daily-history.json  → série temporelle (1 entrée/jour/région)
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'scripts', 'automation', 'data')
const OUT = path.join(DATA, 'ux-daily.json')
const HIST = path.join(DATA, 'ux-daily-history.json')
const HIST_CAP = 600 // ~120 jours × 5 régions
const DO_SEND = process.argv.includes('--send')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d }
const MOCK = arg('--mock', null)
const TODAY = new Date().toISOString().slice(0, 10) // UTC (stats.php agrège en gmdate)

// .env → remplit les trous (ne clobbe pas les secrets CI déjà dans process.env).
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
} catch (e) {}

const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }

function regionsList() {
  const sites = [
    { id: 'mq', domain: 'sargasses-martinique.com' },
    { id: 'gp', domain: 'sargasses-guadeloupe.com' },
  ]
  try {
    const { getAllRegions } = require('../regions/index.cjs')
    for (const r of getAllRegions()) if (r && r.domain && !sites.some(s => s.id === r.id)) sites.push({ id: r.id, domain: r.domain })
  } catch (e) {}
  return sites
}

function loadKeys() {
  const env = process.env.SG_STATS_KEY
  let map = {}
  try { map = JSON.parse(fs.readFileSync(path.join(DATA, 'stats-keys.json'), 'utf8')) } catch (e) {}
  for (const k of Object.keys(process.env)) {
    const m = k.match(/^SG_STATS_KEY_([A-Z0-9]+)$/)
    if (m && process.env[k]) map[m[1].toLowerCase()] = process.env[k]
  }
  return { env, map }
}

async function fetchStats(domain, key) {
  const url = `https://${domain}/stats.php?key=${encodeURIComponent(key)}&days=1`
  const res = await fetch(url, { headers: { 'User-Agent': 'sarga-ux-daily' } })
  const txt = await res.text()
  let json; try { json = JSON.parse(txt) } catch (e) { throw new Error(`réponse non-JSON (${res.status})`) }
  if (json.error) throw new Error(json.error)
  return json
}

// Cliché COMPACT et diff-able d'une région pour la journée.
function snapshot(id, data) {
  const br = (data.byRegion || {})[id] || (Object.values(data.byRegion || {})[0]) || {}
  const rates = br.rates || {}
  // Dead-clicks : agrégés depuis la heatmap clicks[screen] (inclut top_dead_els, PR #320).
  let n = 0, dead = 0, els = {}, worstDead = { screen: null, rate: 0, n: 0 }
  for (const [scr, c] of Object.entries(data.clicks || {})) {
    n += c.n || 0; dead += c.dead || 0
    if ((c.n || 0) >= 20 && (c.dead_rate || 0) > worstDead.rate) worstDead = { screen: scr, rate: c.dead_rate, n: c.n }
    for (const [el, cnt] of Object.entries(c.top_dead_els || {})) els[el] = (els[el] || 0) + cnt
  }
  const top_dead_els = Object.entries(els).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([el, count]) => ({ el, count }))
  // Ennui : pire écran (bored_rate) avec assez de trafic.
  let worstBored = { screen: null, rate: 0 }
  for (const [scr, o] of Object.entries(data.screens || {})) if ((o.visits || 0) >= 15 && (o.bored_rate || 0) > worstBored.rate) worstBored = { screen: scr, rate: o.bored_rate }
  return {
    sessions: data.sessions || 0,
    friction: br.friction || 0, // rage-clicks (sg_friction)
    dead_rate: n ? Math.round((dead / n) * 1000) / 1000 : 0,
    dead_worst: worstDead.screen ? worstDead : null,
    top_dead_els,
    bored_worst: worstBored.screen ? { screen: worstBored.screen, rate: Math.round(worstBored.rate * 100) / 100 } : null,
    modal_to_cta: rates.modal_to_cta ?? null,
    cta_to_redirect: rates.cta_to_redirect ?? null,
    redirect_to_conversion: rates.redirect_to_conversion ?? null,
    session_to_conversion: rates.session_to_conversion ?? null,
    session_to_email: rates.session_to_email ?? null,
  }
}

// Diff numérique + set-diff des coupables dead-click, en langage humain.
function diff(id, cur, prev) {
  if (!prev) return { prev_date: null, changes: ['(pas de veille — premier cliché)'] }
  const ch = []
  const delta = (label, a, b, unit, goodDown) => {
    if (a == null || b == null) return
    const d = Math.round((b - a) * 10) / 10
    if (Math.abs(d) < (unit === '%' ? 1 : 0.02)) return
    const better = goodDown ? d < 0 : d > 0
    ch.push(`${label} ${a}${unit}→${b}${unit} (${d > 0 ? '+' : ''}${d}${unit}) ${better ? '✅' : '⚠️'}`)
  }
  if (prev.sessions && cur.sessions) {
    const dv = Math.round((cur.sessions - prev.sessions) / prev.sessions * 100)
    if (Math.abs(dv) >= 15) ch.push(`sessions ${prev.sessions}→${cur.sessions} (${dv > 0 ? '+' : ''}${dv}%)`)
  }
  delta('dead-rate', prev.dead_rate, cur.dead_rate, '', true)
  if (prev.friction != null && cur.friction != null && Math.abs(cur.friction - prev.friction) >= 3)
    ch.push(`rage-clicks ${prev.friction}→${cur.friction} ${cur.friction < prev.friction ? '✅' : '⚠️'}`)
  delta('modal→CTA', prev.modal_to_cta, cur.modal_to_cta, '%', false)
  delta('CTA→redirect', prev.cta_to_redirect, cur.cta_to_redirect, '%', false)
  delta('redirect→paiement', prev.redirect_to_conversion, cur.redirect_to_conversion, '%', false)
  // Coupables dead-click NOUVEAUX ou disparus.
  const prevEls = new Set((prev.top_dead_els || []).map(e => e.el))
  const curEls = new Set((cur.top_dead_els || []).map(e => e.el))
  for (const e of (cur.top_dead_els || [])) if (!prevEls.has(e.el)) ch.push(`🆕 dead-click : ${e.el} (${e.count})`)
  for (const el of prevEls) if (!curEls.has(el)) ch.push(`✔︎ dead-click résolu : ${el}`)
  return { prev_date: prev.date, changes: ch.length ? ch : ['stable (aucun mouvement notable)'] }
}

// Commits src/ shippés dans les dernières 24 h (corrélation changement ↔ comportement).
function shippedLast24h() {
  try {
    const raw = execSync('git log --since="24 hours ago" --format="%h|%s" -- src/ vite.config.js public/', { cwd: ROOT, encoding: 'utf8' })
    return raw.trim().split('\n').filter(Boolean).slice(0, 25).map(l => { const [h, ...s] = l.split('|'); return { h, subject: s.join('|') } })
  } catch (e) { return [] }
}

async function main() {
  let perRegion = []
  if (MOCK) {
    const data = load(path.resolve(ROOT, MOCK), null)
    const id = (data && data.regions && Object.keys(data.regions)[0]) || 'mock'
    perRegion.push({ id, data })
  } else {
    const { env, map } = loadKeys()
    if (!env && !Object.keys(map).length) {
      console.log('⚠ Aucune clé stats (SG_STATS_KEY / SG_STATS_KEY_<REGION> / stats-keys.json). Rien à faire.')
      return // non-fatal : le step CI ne casse pas
    }
    for (const site of regionsList()) {
      const key = map[site.id] || env
      if (!key) continue
      try { perRegion.push({ id: site.id, data: await fetchStats(site.domain, key) }) }
      catch (e) { console.error(`  [${site.id}] ${e.message}`) }
    }
    if (!perRegion.length) { console.log('Aucune donnée stats récupérée (endpoint/clé) — rien écrit.'); return }
  }

  const history = load(HIST, [])
  const shipped = shippedLast24h()
  const out = { generated: new Date().toISOString(), date: TODAY, days: 1, regions: perRegion.map(p => p.id), shipped, perRegion: [] }

  for (const { id, data } of perRegion) {
    const cur = snapshot(id, data)
    // Veille = dernière entrée de CETTE région avec une date antérieure.
    const prev = [...history].reverse().find(h => h.region === id && h.date < TODAY) || null
    const d = diff(id, cur, prev)
    out.perRegion.push({ region: id, ...cur, prev_date: d.prev_date, changes: d.changes })
    // Historique : 1 entrée/jour/région (re-run du jour = écrase).
    const entry = { date: TODAY, region: id, ...cur }
    const idx = history.findIndex(h => h.date === TODAY && h.region === id)
    if (idx >= 0) history[idx] = entry; else history.push(entry)
  }
  while (history.length > HIST_CAP) history.shift()

  try {
    fs.mkdirSync(DATA, { recursive: true })
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
    fs.writeFileSync(HIST, JSON.stringify(history, null, 2))
  } catch (e) { console.error('écriture:', e.message) }

  // ── Digest console ──────────────────────────────────────────────────────
  console.log(`\n═══ UX JOURNALIER · ${TODAY} · régions: ${out.regions.join(', ') || '—'} ═══`)
  if (shipped.length) console.log(`  shippé <24h (${shipped.length}) : ${shipped.slice(0, 6).map(s => s.h).join(' ')}${shipped.length > 6 ? ' …' : ''}`)
  for (const r of out.perRegion) {
    console.log(`\n[${r.region.toUpperCase()}] sessions=${r.sessions} · dead-rate=${r.dead_rate} · rage=${r.friction} · modal→CTA=${r.modal_to_cta ?? '—'}%`)
    if (r.top_dead_els.length) console.log(`   dead-clicks top : ${r.top_dead_els.map(e => `${e.el}(${e.count})`).join(', ')}`)
    console.log(`   vs ${r.prev_date || 'veille?'} : ${r.changes.join(' · ')}`)
  }
  console.log(`\n→ ${OUT.replace(ROOT + '/', '')} + historique (${history.length} entrées).`)

  // ── Email digest (HOLD par défaut) ──────────────────────────────────────
  if (!DO_SEND) { console.log('\nDRY-RUN — pas d\'email. --send pour envoyer.'); return }
  let sendEmail, mailReady
  try { ({ sendEmail, mailReady } = require('./automation/lib/email-send.cjs')) } catch (e) { console.log('email-send absent — pas d\'envoi.'); return }
  if (!mailReady || !mailReady()) { console.log('SMTP_PASS absent — pas d\'envoi.'); return }
  // Dédup PAR JOUR : le workflow tourne plusieurs fois/jour → 1 digest max/jour.
  const SENT = path.join(DATA, 'ux-daily-sent.json')
  if (load(SENT, {}).date === TODAY) { console.log('Digest UX déjà envoyé aujourd\'hui — skip.'); return }
  // On n'écrit que si ça bouge (anti-bruit) : au moins une région avec un changement réel.
  const moved = out.perRegion.filter(r => r.changes.some(c => /[✅⚠️🆕✔︎]/.test(c)))
  if (!moved.length) { console.log('Rien de notable bougé — pas d\'email.'); return }
  const rows = moved.map(r => `<li><b>${r.region.toUpperCase()}</b> — sessions ${r.sessions} · dead-rate ${r.dead_rate} · rage ${r.friction}<br><span style="color:#666;font-size:12px">${r.changes.join(' · ')}</span></li>`).join('')
  const html = `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px">
    <h2 style="margin:0 0 4px;font-size:18px">UX du jour — ${TODAY}</h2>
    <p style="font-size:12px;color:#777;margin:0 0 12px">Shippé &lt;24h : ${shipped.map(s => `<code>${s.h}</code>`).join(' ') || '—'}</p>
    <ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0">${rows}</ul>
    <p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;margin-top:14px">Tracking UX first-party quotidien · stats.php · diff jour-à-jour</p></div>`
  sendEmail({ from: 'Sargasses UX <alerte@sargasses-martinique.com>', to: 'yacovassaraf@gmail.com', subject: `[Sargasses] UX du jour ${TODAY} — ${moved.length} région(s) qui bougent`, html })
    .then(({ error }) => {
      if (error) { console.error('SMTP error:', error.message); return }
      try { fs.writeFileSync(SENT, JSON.stringify({ date: TODAY, at: new Date().toISOString() }, null, 2)) } catch (e) {}
      console.log('Digest UX envoyé.')
    })
    .catch(e => console.error('send:', e.message))
}

main().catch(e => { console.error(e.message); process.exit(1) })
