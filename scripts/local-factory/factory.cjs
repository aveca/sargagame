#!/usr/bin/env node
/**
 * factory.cjs — L'USINE LOCALE Sargasses · COUCHE C (pur-code, ZÉRO LLM, ZÉRO Claude).
 * ---------------------------------------------------------------------------------
 * Un seul programme déterministe, lancé par le Planificateur de tâches Windows
 * (au démarrage + chaque jour). Il fait UNIQUEMENT ce que le cloud ne PEUT pas
 * faire depuis une machine éteinte :
 *   1. se met à jour tout seul   (git pull --ff-only → code + data du jour)
 *   2. rend le « Brief plage » vidéo du jour, 5 régions   (GPU/ffmpeg/edge-tts local)
 *   3. publie sur Facebook        (session Edge locale — impossible en cloud)   [OPT-IN]
 * Rattrapage idempotent : ne rend QUE le jour même, jamais de backfill. Le poll
 * --serve (30 min, admin-free) retente aussi le rendu — c'est lui le vrai filet
 * de rattrapage, le trigger quotidien 05:30 dépendant du StartWhenAvailable Windows.
 *
 * Ce qu'il ne fait PAS (par design — cf. README) : aucun email/pipeline/deploy
 * (= couche CLOUD GitHub Actions, tourne machine éteinte), aucune décision LLM,
 * aucune écriture money/checkout. C'est une usine à CONTENU + PUBLICATION, point.
 *
 * Garde-fous : lockfile (1 instance), marker daté (1 rendu/région/jour),
 * fraîcheur satellite (skip si donnée périmée), FB re-vérifiée ≤24 h + cap + dédup,
 * publication FB derrière un flag committé (config.fbAutoPublish) que tu bascules
 * depuis mobile via GitHub — jamais de publication à l'aveugle.
 *
 * Usage :
 *   node scripts/local-factory/factory.cjs           # run réel (rend + publie selon config)
 *   node scripts/local-factory/factory.cjs --plan     # n'exécute rien : dit ce qu'il FERAIT
 *   SARGA_FACTORY_NO_PULL=1 node ... factory.cjs       # sans git pull (mode hors-ligne)
 */
'use strict'
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { HANDLERS } = require('./handlers.cjs')

const DIR = __dirname
const ROOT = path.resolve(DIR, '../..')
const STATE = path.join(DIR, 'state')
const LOGS = path.join(DIR, 'logs')
const OUT = path.join(ROOT, 'scripts', 'video', 'out')
for (const d of [STATE, LOGS, OUT]) fs.mkdirSync(d, { recursive: true })

const PLAN = process.argv.includes('--plan') || process.env.SARGA_FACTORY_DRY === '1'
const SERVE = process.argv.includes('--serve')
const NO_PULL = process.env.SARGA_FACTORY_NO_PULL === '1' || PLAN

// ── Config committée (le fondateur la bascule depuis mobile via GitHub) ─────────
const CFG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8')) } catch (_) { return {} }
})()
const RENDER_REGIONS = CFG.renderRegions || ['mq', 'gp', 'puntacana', 'florida', 'rivieramaya']
const FB_REGIONS = CFG.fbRegions || ['mq', 'gp']
const FB_AUTO = CFG.fbAutoPublish === true
const MAX_FB = Number.isFinite(CFG.maxFbPostsPerDay) ? CFG.maxFbPostsPerDay : 2
const FB_MAX_AGE_H = Number.isFinite(CFG.fbPublishMaxAgeH) ? CFG.fbPublishMaxAgeH : 24 // plus strict que le rendu (36 h)

const TODAY = new Date().toISOString().slice(0, 10)

// ── Journal (JSONL + console) ───────────────────────────────────────────────────
const logFile = path.join(LOGS, `factory-${TODAY}.jsonl`)
const events = []
function log(event, data) {
  const rec = Object.assign({ t: new Date().toISOString(), event }, data || {})
  events.push(rec)
  try { fs.appendFileSync(logFile, JSON.stringify(rec) + '\n') } catch (_) {}
  const extra = data && Object.keys(data).length ? ' ' + JSON.stringify(data) : ''
  console.log(`[factory]${PLAN ? '(plan)' : ''} ${event}${extra}`)
}

// ── Lockfile : une seule instance à la fois ─────────────────────────────────────
const LOCK = path.join(STATE, '.lock')
function pidAlive(pid) { try { process.kill(pid, 0); return true } catch (_) { return false } }
function acquireLock() {
  try {
    const { pid, at } = JSON.parse(fs.readFileSync(LOCK, 'utf8'))
    const ageMin = (Date.now() - Date.parse(at)) / 60000
    if (ageMin < 120 && pidAlive(pid)) { console.log(`[factory] déjà en cours (pid ${pid}, ${ageMin.toFixed(0)} min) — sortie.`); process.exit(0) }
    log('lock.reclaim', { stalePid: pid, ageMin: Math.round(ageMin) })
  } catch (_) { /* pas de lock */ }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
}
function releaseLock() { try { fs.unlinkSync(LOCK) } catch (_) {} }

// ── Fraîcheur satellite (âge en heures ; jamais updatedAt) ───────────────────────
function satelliteAgeH(region) {
  const isNew = !['mq', 'gp'].includes(region)
  const p = path.join(ROOT, 'public/api/copernicus', isNew ? region : '', 'sargassum.json')
  try {
    const s = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (s.source !== 'erddap-live' || s.stale === true) return { ageH: null, bad: true }
    const ageH = typeof s.dataAgeMinutes === 'number' ? s.dataAgeMinutes / 60
      : (s.erddapTimestamp ? (Date.now() - Date.parse(s.erddapTimestamp)) / 3.6e6 : null)
    return { ageH, bad: ageH == null }
  } catch (_) { return { ageH: null, bad: true } }
}

// ── 0. Auto-update (git pull) ────────────────────────────────────────────────────
function selfUpdate() {
  if (NO_PULL) { log('git.skip', { reason: PLAN ? 'plan' : 'SARGA_FACTORY_NO_PULL' }); return }
  const r = spawnSync('git', ['pull', '--ff-only'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 })
  if (r.status === 0) log('git.pull.ok', { out: String(r.stdout || '').trim().split('\n').pop().slice(0, 160) })
  else log('git.pull.fail', { err: String((r.stderr || '') + (r.stdout || '')).trim().slice(0, 240) }) // non-fatal : on tourne sur le local
}

// ── 1. Rendu des briefs (marker daté, per-région isolé, skip fraîcheur) ─────────
function renderBriefs() {
  const results = []
  for (const region of RENDER_REGIONS) {
    const marker = path.join(OUT, `brief-${region}-${TODAY}.mp4`)
    const have = fs.existsSync(marker) && fs.statSync(marker).size > 100000
    if (have) { log('render.skip.exists', { region }); results.push({ region, status: 'exists' }); continue }
    if (PLAN) {
      const f = satelliteAgeH(region)
      results.push({ region, status: f.bad ? 'would-skip-stale' : 'would-render', ageH: f.ageH })
      log('render.plan', { region, ageH: f.ageH, decision: f.bad ? 'skip-stale' : 'render' }); continue
    }
    log('render.start', { region })
    const r = spawnSync('node', [path.join(ROOT, 'scripts', 'video', 'make-brief.cjs'), region],
      { cwd: ROOT, encoding: 'utf8', timeout: 8 * 60000 })
    const out = String(r.stdout || '') + String(r.stderr || '')
    if (/BRIEF_SKIPPED_STALE/.test(out)) {
      const m = out.match(/BRIEF_SKIPPED_STALE[^\n]*/)
      log('render.skip.stale', { region, why: m ? m[0].slice(0, 160) : '' }); results.push({ region, status: 'stale' }); continue
    }
    const done = fs.existsSync(marker) && fs.statSync(marker).size > 100000
    if (r.status === 0 && done) { log('render.ok', { region, mb: +(fs.statSync(marker).size / 1e6).toFixed(2) }); results.push({ region, status: 'rendered' }) }
    else { log('render.fail', { region, code: r.status, err: out.trim().slice(-360) }); results.push({ region, status: 'failed' }) }
  }
  return results
}

// ── 2. Publication FB (OPT-IN, gardée : fraîcheur ≤24 h + dédup + cap) ───────────
function publishFB(renderResults) {
  const eligible = renderResults.filter(r => (r.status === 'rendered' || r.status === 'exists') && FB_REGIONS.includes(r.region))
  if (!eligible.length) { log('fb.none'); return }
  let posted = 0
  for (const { region } of eligible) {
    if (posted >= MAX_FB) { log('fb.cap', { max: MAX_FB }); break }
    const dedup = path.join(STATE, `fb-${region}-${TODAY}.done`)
    if (fs.existsSync(dedup)) { log('fb.skip.dup', { region }); continue }
    const f = satelliteAgeH(region)
    if (f.bad || f.ageH > FB_MAX_AGE_H) { log('fb.skip.stale', { region, ageH: f.ageH, ceil: FB_MAX_AGE_H }); continue }
    if (!FB_AUTO || PLAN) { log('fb.staged', { region, ageH: +(f.ageH || 0).toFixed(1), note: PLAN ? 'plan' : 'config.fbAutoPublish=false → aucune publication réelle' }); continue }
    log('fb.post.start', { region })
    const r = spawnSync('node', [path.join(ROOT, 'scripts', 'automation', 'fb-post-video.cjs'), `--region=${region}`, '--go', '--headless'],
      { cwd: ROOT, encoding: 'utf8', timeout: 5 * 60000 })
    const out = String(r.stdout || '') + String(r.stderr || '')
    if (r.status === 0) { fs.writeFileSync(dedup, new Date().toISOString()); posted++; log('fb.post.ok', { region }) }
    else { log('fb.post.fail', { region, code: r.status, err: out.trim().slice(-300) }) }
  }
}

// ── 3. LAST_RUN.md (le fondateur voit « ce qui s'est passé » sans ouvrir Claude) ─
function writeLastRun(renderResults) {
  const md = [
    `# SargaFactory — dernier run${PLAN ? ' (PLAN, rien exécuté)' : ''}`,
    '',
    `- **Quand** : ${new Date().toISOString()}`,
    `- **Machine** : ${os.hostname()}`,
    `- **Rendus** : ${renderResults.map(r => `${r.region}=${r.status}`).join(' · ') || '—'}`,
    `- **FB auto** : ${FB_AUTO ? `ON (≤${FB_MAX_AGE_H} h, cap ${MAX_FB}/j)` : 'OFF (dry-run — bascule config.fbAutoPublish=true pour activer)'}`,
    '',
    `Journal détaillé : \`logs/factory-${TODAY}.jsonl\``,
    '',
  ].join('\n')
  try { fs.writeFileSync(path.join(DIR, 'LAST_RUN.md'), md) } catch (_) {}
}

// ── 4. Heartbeat cloud (clé anon PUBLIQUE — même sécurité que le front, RLS insert-only)
// Le Planificateur Windows est la surface la moins observable du stack (une MAJ Windows
// peut le désenregistrer en silence). Ce signal permet à daily-copernicus.yml de détecter
// une usine morte sans lire un fichier local (cf. factory-heartbeat-watch.cjs). Best-effort,
// ne bloque jamais le run et ne throw jamais.
const SUPABASE_URL = 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_EnUyZjHbluk9Adumxhwcbw_nmDE8vMz'
function sendHeartbeat(renderResults) {
  try {
    fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ event: 'factory_heartbeat', island: null, params: { host: os.hostname(), rendered: renderResults.map(r => `${r.region}:${r.status}`) } }),
    }).then(r => log(r.ok ? 'heartbeat.ok' : 'heartbeat.http_fail', { status: r.status }))
      .catch(e => log('heartbeat.fail', { err: String((e && e.message) || e).slice(0, 160) }))
  } catch (e) { log('heartbeat.fail', { err: String((e && e.message) || e).slice(0, 160) }) }
}

// ── File de jobs À LA DEMANDE (git-file queue — TRIZ inversion : la machine SONDE) ─
// Le fondateur commit un queue/<x>.json depuis son phone → git pull le ramène → on
// l'exécute via le CATALOGUE FERMÉ (handlers.cjs), JAMAIS de code arbitraire.
// Idempotent par job.id (state/processed.json, gitignored) ; on ne touche PAS aux
// fichiers commités (zéro bagarre git, zéro push non-attendu).
const QUEUE = path.join(ROOT, 'queue')
const QSTATE = path.join(QUEUE, 'state')
function loadProcessed() { try { return new Set(JSON.parse(fs.readFileSync(path.join(QSTATE, 'processed.json'), 'utf8'))) } catch (_) { return new Set() } }
function saveProcessed(set) { fs.mkdirSync(QSTATE, { recursive: true }); fs.writeFileSync(path.join(QSTATE, 'processed.json'), JSON.stringify([...set])) }
function drainQueue() {
  if (!fs.existsSync(QUEUE)) { log('serve.no-queue'); return }
  const processed = loadProcessed()
  const files = fs.readdirSync(QUEUE).filter(f => f.endsWith('.json'))
  let ran = 0
  for (const file of files) {
    let job
    try { job = JSON.parse(fs.readFileSync(path.join(QUEUE, file), 'utf8')) } catch (_) { log('serve.badjob', { file }); continue }
    const id = job.id || (file + ':' + (job.type || ''))
    if (processed.has(id)) continue
    const type = job.type
    if (!HANDLERS[type]) { log('serve.unknown', { file, type }); processed.add(id); saveProcessed(processed); continue } // poka-yoke : type hors catalogue = refusé
    if (PLAN) { log('serve.plan', { id, type }); continue }
    log('serve.run', { id, type })
    try { const result = HANDLERS[type](job.payload || {}); log('serve.done', { id, type, result }) }
    catch (e) { log('serve.fail', { id, type, err: String((e && e.message) || e).slice(0, 200) }) }
    processed.add(id); saveProcessed(processed); ran++
  }
  log('serve.drained', { seen: files.length, ran })
}

// ── Main ─────────────────────────────────────────────────────────────────────────
acquireLock()
try {
  if (SERVE) {
    log('serve.start', { root: ROOT, plan: PLAN })
    selfUpdate()   // ramène les queue/*.json commités depuis le phone/GitHub
    drainQueue()
    // Retente aussi le rendu du jour ici : le trigger quotidien 05:30 dépend du
    // rattrapage StartWhenAvailable de Windows (pas fiable si le PC était éteint/
    // verrouillé à cette heure-là, cf. AtLogOn qui échoue sans droits admin).
    // Ce poll tourne déjà toutes les 30 min indépendamment du logon ; le marker
    // daté rend l'appel gratuit une fois le jour rendu, et retente automatiquement
    // tant que le satellite reste périmé (>36h).
    const results = renderBriefs()
    publishFB(results)
    writeLastRun(results)
    if (!PLAN) sendHeartbeat(results)
  } else {
    log('factory.start', { root: ROOT, regions: RENDER_REGIONS.join(','), fbAuto: FB_AUTO, plan: PLAN })
    selfUpdate()
    const results = renderBriefs()
    publishFB(results)
    drainQueue()   // le run quotidien draine aussi les jobs à la demande en attente
    writeLastRun(results)
    if (!PLAN) sendHeartbeat(results)
    log('factory.done', { summary: results.map(r => `${r.region}:${r.status}`).join(' ') })
  }
} catch (e) {
  log('factory.error', { err: String((e && e.stack) || e).slice(0, 500) })
} finally {
  releaseLock()
}
