#!/usr/bin/env node
/**
 * webcam-health.cjs — santé des webcams live (anti-rotation d'IDs YouTube).
 *
 * POURQUOI : les webcams « live 24/7 » YouTube (Vision-Environnement,
 * webcamsdemexico, BFree…) tournent leur `videoId` à chaque redémarrage du
 * stream → un id codé en dur dans nos JSON finit « recording not available »
 * (mort) ou en VOD figée (« was_live »). Le `WebcamPanel` dégrade déjà
 * proprement au runtime (pas de gel), mais une cam morte affiche quand même
 * un cadre « EN DIRECT » trompeur. Ce check tourne en cron, DÉTECTE les cams
 * mortes/tournées et les DÉSACTIVE (`webcam.disabled=true`, réversible) →
 * `WebcamPanel` les ignore (rend null). Self-healing : une cam redevenue live
 * est ré-activée automatiquement.
 *
 * DOCTRINE (CLAUDE.md) :
 *   - dry-run par défaut (rapport seul). `--apply` édite les JSON. `--send`
 *     emaile le fondateur (HOLD par défaut).
 *   - idempotent : marqueur d'état `data/webcam-health.json` (strikes par id).
 *     Un id MORT (erreur dure : recording unavailable / private / removed) est
 *     désactivé tout de suite ; un id « stale » (was_live = stream tourné) après
 *     2 passages consécutifs (anti-faux-positif sur un redémarrage transitoire).
 *   - JAMAIS de désactivation sur signal AMBIGU (bot-wall « confirm you're not a
 *     bot », erreur réseau) → état `unknown`, on ne touche à rien.
 *   - écritures CIBLÉES : ne réécrit QUE les fichiers réellement modifiés
 *     (réserialise à l'identique, préserve la convention de newline finale).
 *
 * SIGNAL : `yt-dlp` (live_status fiable) en priorité, repli sur la watch-page
 *   (`playabilityStatus`) qui détecte les morts durs même sous bot-wall.
 *
 * Usage :
 *   node scripts/automation/webcam-health.cjs            # dry-run (rapport)
 *   node scripts/automation/webcam-health.cjs --apply    # édite les JSON
 *   node scripts/automation/webcam-health.cjs --apply --send   # + email fondateur
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const APPLY = process.argv.includes('--apply')
const SEND = process.argv.includes('--send')
const STATE_PATH = path.join(__dirname, 'data', 'webcam-health.json')
const STALE_STRIKES_TO_DISABLE = 2

const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Webcams <alerte@sargasses-martinique.com>'

// Fichiers susceptibles de contenir des `webcam` (array de plages, ou {beaches:[…]}).
function targetFiles() {
  const files = [path.join(ROOT, 'public', 'data', 'beaches-list.json')]
  const regDir = path.join(ROOT, 'regions')
  for (const f of fs.readdirSync(regDir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue
    files.push(path.join(regDir, f))
  }
  return files
}

function beachesOf(json) {
  if (Array.isArray(json)) return json
  if (json && Array.isArray(json.beaches)) return json.beaches
  return []
}

// ── Statut d'un id YouTube ───────────────────────────────────────────────────
// → { state: 'ok'|'stale'|'dead'|'unknown', via, detail }
const DEAD_RE = /recording is not available|video unavailable|private video|been removed|no longer available|account.*(terminated|closed)|removed by the uploader|does not exist/i
const BOT_RE = /sign in to confirm|not a bot|confirm you'?re not a bot/i

function ytdlpStatus(id) {
  try {
    const out = execSync(
      `yt-dlp -q --no-warnings --print "%(live_status)s" "https://www.youtube.com/watch?v=${id}"`,
      { timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] }
    ).toString().trim()
    if (out === 'is_live') return { state: 'ok', via: 'yt-dlp', detail: 'is_live' }
    if (out === 'was_live' || out === 'post_live') return { state: 'stale', via: 'yt-dlp', detail: out }
    if (out === 'not_live') return { state: 'stale', via: 'yt-dlp', detail: 'not_live' }
    return null // signal non concluant → repli
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString()
    if (DEAD_RE.test(msg)) return { state: 'dead', via: 'yt-dlp', detail: msg.replace(/\s+/g, ' ').slice(0, 90) }
    return null // bot-wall / yt-dlp absent / erreur → repli watch-page
  }
}

function watchPageStatus(id) {
  try {
    const html = execSync(
      `curl -s -m 30 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "https://www.youtube.com/watch?v=${id}"`,
      { timeout: 35000, maxBuffer: 1 << 27 }
    ).toString()
    const m = html.match(/"playabilityStatus":\{"status":"([A-Z_]+)"(?:,"reason":"([^"]*)")?/)
    if (!m) return { state: 'unknown', via: 'watch', detail: 'no playabilityStatus' }
    const status = m[1], reason = m[2] || ''
    if (status === 'OK') {
      // OK sans confirmation de live : la cam répond et est embarquable → on garde.
      return { state: 'ok', via: 'watch', detail: 'OK' }
    }
    if (status === 'UNPLAYABLE' || status === 'ERROR') {
      if (DEAD_RE.test(reason) || !reason) return { state: 'dead', via: 'watch', detail: (reason || status).slice(0, 90) }
      return { state: 'dead', via: 'watch', detail: `${status}: ${reason}`.slice(0, 90) }
    }
    if (status === 'LOGIN_REQUIRED' && BOT_RE.test(reason)) return { state: 'unknown', via: 'watch', detail: 'bot-wall' }
    return { state: 'unknown', via: 'watch', detail: `${status}: ${reason}`.slice(0, 90) }
  } catch (e) {
    return { state: 'unknown', via: 'none', detail: 'fetch error' }
  }
}

function statusOf(id) {
  return ytdlpStatus(id) || watchPageStatus(id)
}

// ── Main ─────────────────────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { return {} }
}
function writeJsonPreserve(file, original, data) {
  const body = JSON.stringify(data, null, 2) + (original.endsWith('\n') ? '\n' : '')
  fs.writeFileSync(file, body)
}

function main() {
  const state = loadState()
  const now = new Date().toISOString()
  const fileChanged = {}
  const parsed = {}          // file -> {json, original}
  const cams = []            // {file, beach, cam}

  for (const file of targetFiles()) {
    let original
    try { original = fs.readFileSync(file, 'utf8') } catch { continue }
    let json
    try { json = JSON.parse(original) } catch { continue }
    parsed[file] = { json, original }
    for (const b of beachesOf(json)) {
      const cam = b && b.webcam
      if (!cam || cam.type === 'hls' || !cam.id) continue // on ne sait checker que YouTube
      cams.push({ file, beach: b.name || b.id, cam })
    }
  }

  const disabled = [], reenabled = [], report = []
  for (const { file, beach, cam } of cams) {
    const st = statusOf(cam.id)
    const prev = state[cam.id] || { strikes: 0 }
    let action = 'none'

    if (st.state === 'ok') {
      prev.strikes = 0
      if (cam.disabled) { delete cam.disabled; delete cam.deadReason; delete cam.deadSince; fileChanged[file] = true; action = 'reenable'; reenabled.push({ beach, id: cam.id }) }
    } else if (st.state === 'dead') {
      prev.strikes = (prev.strikes || 0) + 1
      if (!cam.disabled) { cam.disabled = true; cam.deadReason = st.detail; cam.deadSince = now; fileChanged[file] = true; action = 'disable'; disabled.push({ beach, id: cam.id, reason: st.detail }) }
    } else if (st.state === 'stale') {
      prev.strikes = (prev.strikes || 0) + 1
      if (prev.strikes >= STALE_STRIKES_TO_DISABLE && !cam.disabled) {
        cam.disabled = true; cam.deadReason = `stale (${st.detail})`; cam.deadSince = now; fileChanged[file] = true; action = 'disable'
        disabled.push({ beach, id: cam.id, reason: `stale ×${prev.strikes}` })
      } else { action = `strike ${prev.strikes}/${STALE_STRIKES_TO_DISABLE}` }
    } else {
      action = 'skip (unknown)' // signal ambigu → on ne touche à rien
    }

    prev.lastState = st.state; prev.lastCheck = now; prev.beach = beach
    prev.file = path.relative(ROOT, file)
    state[cam.id] = prev
    report.push({ beach, id: cam.id, state: st.state, via: st.via, detail: st.detail, action, disabled: !!cam.disabled })
  }

  // Rapport console
  console.log(`\n📹 webcam-health — ${cams.length} cam(s) YouTube vérifiée(s)  [${APPLY ? 'APPLY' : 'DRY-RUN'}]`)
  for (const r of report) {
    const flag = r.state === 'ok' ? '✓' : r.state === 'dead' ? '✗' : r.state === 'stale' ? '~' : '?'
    console.log(`  ${flag} ${r.beach.padEnd(26)} ${r.id.padEnd(13)} ${r.state.padEnd(8)} ${r.action.padEnd(22)} (${r.via}) ${r.detail}`)
  }
  console.log(`\n  → ${disabled.length} désactivée(s), ${reenabled.length} ré-activée(s)`)

  if (!APPLY) {
    console.log('\nDRY-RUN — aucun fichier modifié. --apply pour écrire, --send pour emailer.')
    return
  }

  // Écritures ciblées (fichiers réellement modifiés uniquement)
  for (const file of Object.keys(fileChanged)) {
    const { json, original } = parsed[file]
    writeJsonPreserve(file, original, json)
    console.log(`  écrit : ${path.relative(ROOT, file)}`)
  }
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n')

  // Alerte fondateur si du mouvement (pour trouver un remplaçant)
  if ((disabled.length || reenabled.length) && SEND) {
    sendFounderEmail(disabled, reenabled).then(ok => console.log(ok ? '  email envoyé.' : '  email NON envoyé (SMTP absent).'))
  } else if (disabled.length || reenabled.length) {
    console.log('  (--send absent → pas d\'email)')
  }
}

async function sendFounderEmail(disabled, reenabled) {
  let lib
  try { lib = require('./lib/email-send.cjs') } catch { return false }
  if (!lib.mailReady()) return false
  const li = (x) => `<li><b>${x.beach}</b> — <code>${x.id}</code>${x.reason ? ` <span style="color:#8a93a0">(${x.reason})</span>` : ''}</li>`
  const html = `${lib.brandHeader('Webcams', 'Santé des caméras live', 'Détection auto de flux morts / tournés')}
    <div style="padding:22px 24px;font-family:${lib.FONT_SANS};color:#1d2b3a;font-size:14px;line-height:1.5">
      ${disabled.length ? `<p><b>${disabled.length} webcam(s) désactivée(s)</b> (flux mort/tourné — l'app les masque désormais) :</p><ul>${disabled.map(li).join('')}</ul><p style="color:#8a93a0">Pour en remettre une : trouver l'id live actuel (ex. <code>yt-dlp --print "%(live_status)s"</code>) et le poser dans le JSON de la plage.</p>` : ''}
      ${reenabled.length ? `<p><b>${reenabled.length} webcam(s) ré-activée(s)</b> (revenues live) :</p><ul>${reenabled.map(li).join('')}</ul>` : ''}
    </div>`
  const { error } = await lib.sendEmail({
    from: FROM, to: TO,
    subject: `[Sargasses] Webcams : ${disabled.length} morte(s), ${reenabled.length} revenue(s)`,
    html,
  })
  return !error
}

main()
