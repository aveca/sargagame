#!/usr/bin/env node
/* eslint-disable */
/**
 * pulse.cjs — PULSE UNIFIÉ : ce que fait l'USER, le SITE, et l'IA (les sessions).
 *
 * Mandat fondateur 2026-06-15 : « tracker et améliorer en continu — ce que fait l'IA,
 * ce que fait le site, et ce que fait l'user ». Ce script est la boucle observe→oriente :
 * il agrège les axes en UN rapport (scripts/automation/data/pulse.json) que chaque
 * /loop lit au début de son cycle pour prioriser par la DATA, pas par le goût.
 *
 * Rapide, lecture seule, sûr à lancer n'importe quand (chaque session, chaque cycle).
 *   node scripts/automation/pulse.cjs            # écrit pulse.json + résumé console
 */
const fs = require('fs')
const path = require('path')
const cp = require('child_process')
const ROOT = path.resolve(__dirname, '..', '..')
const NOW = Date.now()
const rd = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) } catch { return fb } }
const ageH = (iso) => { const t = Date.parse(iso); return isNaN(t) ? null : +(((NOW - t) / 3.6e6).toFixed(1)) }
// execFileSync (PAS de shell, args en tableau → zéro injection) ; commandes 100% statiques.
const git = (args) => { try { return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }

function getRegions() {
  const base = [{ id: 'mq', sub: '' }, { id: 'gp', sub: '' }]
  try { for (const r of require('../../regions/index.cjs').getAllRegions()) if (!['mq', 'gp'].includes(r.id)) base.push({ id: r.id, sub: r.id + '/' }) } catch {}
  return base
}

// ── 1. USER — friction/funnel/ennui first-party (sortie d'analyze-ux.cjs) ──
function userAxis() {
  const ux = rd('scripts/automation/data/ux-alerts.json', null)
  if (!ux) return { ok: false, note: 'pas d\'ux-alerts.json → lance: node scripts/automation/analyze-ux.cjs' }
  return {
    ok: true, generatedAgeH: ageH(ux.generated), days: ux.days, alertCount: ux.alertCount,
    top: (ux.alerts || []).slice(0, 6).map(a => ({ region: a.region, type: a.type, where: a.where, metric: a.metric, sev: Math.round(a.severity || 0), fix: a.fix })),
  }
}

// ── 2. SITE — fraîcheur data, version déployée, dernier deploy, santé CI ──
function siteAxis() {
  const freshness = getRegions().map(r => {
    const d = rd(`public/api/copernicus/${r.sub}sargassum.json`, null)
    const h = d ? ageH(d.updatedAt) : null
    return { id: r.id, source: d && d.source, ageH: h, stale: h == null || h > 12 }
  })
  let sw = null
  try { sw = (fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8').match(/sargasses-v\d+/) || [])[0] || null } catch {}
  const lastDeployRel = git(['log', '-1', '--format=%cr', '--grep=chore: update Copernicus']) || git(['log', '-1', '--format=%cr'])
  // CI : santé des derniers runs GH Actions (« ce que fait le site » côté deploy).
  let ci = null
  try {
    const raw = cp.execFileSync('gh', ['run', 'list', '--repo', 'aveca/sargagame', '--limit', '5', '--json', 'status,conclusion,workflowName'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 12000 })
    ci = JSON.parse(raw).map(r => ({ wf: r.workflowName, status: r.status, concl: r.conclusion }))
  } catch {}
  return {
    freshness, sw, ci, ciFails: ci ? ci.filter(r => r.concl === 'failure').length : null,
    lastCommit: git(['log', '-1', '--format=%h %s']).slice(0, 80), lastDeployRel,
    staleRegions: freshness.filter(f => f.stale).map(f => f.id),
  }
}

// ── 3. GROUND-TRUTH — volume de confirmations terrain (le moat #2 qui se remplit) ──
async function gtAxis() {
  let key = ''
  try { key = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/automation/data/stats-keys.json'), 'utf8')).mq } catch {}
  if (!key) return { ok: false, note: 'clé MQ absente' }
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`https://sargasses-martinique.com/ground-truth.php?key=${encodeURIComponent(key)}&days=30`, { signal: ctrl.signal })
    clearTimeout(to)
    const j = await r.json()
    return { ok: true, confirmations: j.total_confirmations, beaches: j.beaches_confirmed }
  } catch (e) { return { ok: false, note: 'fetch: ' + String(e.message || e).slice(0, 36) } }
}

// ── 4. IA — ce que les sessions ont shippé (git log catégorisé) ──
const TOPIC = [
  [/conv\(|paywall|pw_/i, 'conversion'],
  [/design|scene|svg|beachscene|veilleur|golden|archipel|écran|hero/i, 'design'],
  [/feat\(social|wrapped|sargadle|verdict|share-card/i, 'social'],
  [/forecast|backtest|calm|fiabil|confidence|regime/i, 'fiabilité'],
  [/moat|archive|ground-truth|confirme|append-only|pulse/i, 'moat'],
  [/seo|sitemap|indexnow|weekly|hreflang|meta/i, 'seo'],
  [/chore|bot|update Copernicus|email state/i, 'auto'],
]
function aiAxis() {
  const lines = git(['log', '--oneline', '-30']).split('\n').filter(Boolean)
  const byTopic = {}; const recent = []
  for (const l of lines) {
    const msg = l.replace(/^\w+\s/, '')
    let topic = 'autre'
    for (const [re, name] of TOPIC) if (re.test(msg)) { topic = name; break }
    byTopic[topic] = (byTopic[topic] || 0) + 1
    if (recent.length < 12) recent.push({ topic, msg: msg.slice(0, 72) })
  }
  let nightHead = ''
  try { const nl = fs.readFileSync(path.join(ROOT, 'NIGHT_LOG.md'), 'utf8').split('\n'); nightHead = (nl.filter(x => /^#{2,3}\s/.test(x)).pop() || '').slice(0, 100) } catch {}
  return { byTopic, recent, nightHead, totalRecent: lines.length }
}

// ── SYNTHÈSE — priorités dérivées des axes (oriente les loops) ──
function priorities(user, site, ai) {
  const p = []
  if (site.ciFails) p.push({ axis: 'site', urg: 'haut', what: `CI: ${site.ciFails} run(s) en échec → diagnostiquer les logs` })
  if (site.staleRegions.length) p.push({ axis: 'site', urg: 'haut', what: `Data STALE: ${site.staleRegions.join(', ')} → relancer le pipeline` })
  if (user.ok) for (const a of (user.top || []).slice(0, 3)) p.push({ axis: 'user', urg: a.type.startsWith('funnel') ? 'haut' : 'moyen', what: `[${a.region}] ${a.type} ${a.where}=${a.metric} → ${String(a.fix).split(':')[0]}` })
  if (!user.ok) p.push({ axis: 'user', urg: 'moyen', what: 'Pas de mesure UX fraîche → lancer analyze-ux (clés stats requises)' })
  for (const t of ['design', 'conversion']) if (!ai.byTopic[t] || ai.byTopic[t] < 2) p.push({ axis: 'ia', urg: 'moyen', what: `Topic "${t}" sous-investi (${ai.byTopic[t] || 0} commits/30) → pousser` })
  return p
}

async function main() {
  const user = userAxis(), site = siteAxis(), ai = aiAxis()
  const gt = await gtAxis()
  const out = { generated: new Date().toISOString(), user, site, groundTruth: gt, ai, priorities: priorities(user, site, ai) }
  try { fs.writeFileSync(path.join(ROOT, 'scripts/automation/data/pulse.json'), JSON.stringify(out, null, 2)) } catch {}

  console.log('\n═══ PULSE · ' + out.generated.slice(0, 16).replace('T', ' ') + ' UTC ═══')
  console.log('\n👤 USER  ' + (user.ok ? `${user.alertCount} alertes UX (${user.days}j, il y a ${user.generatedAgeH}h)` : user.note))
  if (user.ok) user.top.slice(0, 4).forEach(a => console.log(`   • [${a.region}] ${a.type} ${a.where}=${a.metric}`))
  console.log('\n🌐 SITE  SW ' + (site.sw || '?') + ' · deploy ' + site.lastDeployRel + (site.ciFails != null ? ` · CI échecs: ${site.ciFails}/5` : ''))
  site.freshness.forEach(f => console.log(`   • ${f.id.padEnd(12)} ${(f.source || '—')} ${f.ageH != null ? f.ageH + 'h' : '?'} ${f.stale ? '⚠ STALE' : 'OK'}`))
  console.log('\n🛰️  GROUND-TRUTH  ' + (gt.ok ? `${gt.confirmations} confirmations · ${gt.beaches} plages (30j)` : gt.note))
  console.log('\n🤖 IA    ' + Object.entries(ai.byTopic).map(([k, v]) => `${k}:${v}`).join(' · '))
  if (ai.nightHead) console.log('   night-log: ' + ai.nightHead)
  console.log('\n🎯 PRIORITÉS')
  out.priorities.forEach((pr, i) => console.log(`   ${i + 1}. [${pr.urg}/${pr.axis}] ${pr.what}`))
  console.log('\n→ pulse.json écrit (lu par les loops au début de chaque cycle)\n')
}
main()
