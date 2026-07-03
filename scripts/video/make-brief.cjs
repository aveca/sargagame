// Rendu du « Brief plage » quotidien — 100 % local et gratuit.
// photos (Ken Burns ffmpeg) + calques typo (Playwright→PNG, design du hero)
// + voix edge-tts + sous-titres incrustés + nappe de vagues synthétisée.
// Usage : node scripts/video/make-brief.cjs [region] [--keep]
// Sortie : scripts/video/out/brief-<region>-<date>.mp4 (1080×1920, 30 fps)
const { execFileSync, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { buildStoryboard } = require('./storyboard.cjs')

const REGION = process.argv[2] || 'mq'
const OUT = path.join(__dirname, 'out')
const W = 1080, H = 1920, FPS = 30
fs.mkdirSync(OUT, { recursive: true })

// ── Police Anton self-hosted, inlinée base64 → ZÉRO dépendance réseau au rendu ──
// L'usine locale (Couche C) doit rendre même réseau coupé. Charger Anton depuis
// fonts.googleapis.com faisait tomber les titres en police système (moche, hors
// marque) EN SILENCE dès que le réseau flanchait au rendu. Les .woff2 sont déjà
// dans le repo (public/fonts/, mêmes fichiers que l'app). Subsets latin +
// latin-ext = couvre FR/EN/ES (é ñ ú à ü…). Cf. README local-factory backlog #1.
const ROOT = path.resolve(__dirname, '../..')
const FONT_DIR = path.join(ROOT, 'public', 'fonts')
const ANTON_CSS = (() => {
  const faces = [
    { file: 'anton-1Ptgg87LROyAm3Kz-C8.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
    { file: 'anton-1Ptgg87LROyAm3K9-C8QSw.woff2', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ]
  try {
    return faces.map(f => {
      const b64 = fs.readFileSync(path.join(FONT_DIR, f.file)).toString('base64')
      return `@font-face{font-family:'Anton';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${f.range}}`
    }).join('')
  } catch (e) { console.error('WARN police Anton locale introuvable, fallback système:', e.message); return '' }
})()

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: OUT, ...opts })
const ffprobeDur = f => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())

// ── 1. Storyboard (garde-fou fraîcheur : skip PROPRE, exit 0, si donnée périmée) ──
let sb
try {
  sb = buildStoryboard(REGION)
} catch (e) {
  if (e && e.code === 'STALE_DATA_SKIP_RENDER') { console.log(`BRIEF_SKIPPED_STALE ${e.message}`); process.exit(0) }
  throw e
}
console.log(`[1/5] storyboard ${REGION} : ${sb.scenes.map(s => s.id).join(' → ')}`)

// ── 2. TTS par scène (edge-tts : mp3 + srt minuté) ─────────────
console.log('[2/5] voix (edge-tts ' + sb.voice + ')…')
for (const s of sb.scenes) {
  if (!s.vo) { s.voDur = 0; continue }
  const mp3 = path.join(OUT, `vo-${s.id}.mp3`), srt = path.join(OUT, `vo-${s.id}.srt`)
  execFileSync('python', ['-m', 'edge_tts', '--voice', sb.voice, '--text', s.vo,
    '--write-media', mp3, '--write-subtitles', srt], { stdio: 'ignore' })
  s.voDur = ffprobeDur(mp3)
  s.dur = Math.max(s.minDur || 4, s.voDur + 0.7)
  console.log(`   ${s.id}: vo ${s.voDur.toFixed(1)}s → scène ${s.dur.toFixed(1)}s`)
}
for (const s of sb.scenes) if (!s.dur) s.dur = s.minDur || 4

// ── 3. Calques typo via Playwright (PNG 1080×1920) ─────────────
console.log('[3/5] calques typographiques (Playwright)…')
const sceneHTML = s => {
  const card = s.type === 'card'
  const o = s.overlay || {}, c = s.card || {}
  const lines = (txt) => String(txt || '').split('\n').map(l => `<div>${l}</div>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${ANTON_CSS}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:'Segoe UI',sans-serif;
  background:${card ? '#0A1714' : 'transparent'}}
.scrimTop{position:absolute;top:0;left:0;right:0;height:420px;
  background:linear-gradient(180deg,rgba(10,23,20,.62),rgba(10,23,20,0))}
.scrimBot{position:absolute;bottom:0;left:0;right:0;height:1100px;
  background:linear-gradient(180deg,rgba(10,23,20,0),rgba(10,23,20,.55) 38%,rgba(10,23,20,.94) 78%)}
.dark{position:absolute;inset:0;background:rgba(10,23,20,.30)}
.wordmark{position:absolute;top:54px;left:0;right:0;text-align:center;
  font-family:'Anton';font-size:30px;letter-spacing:.18em;color:#fff;opacity:.92}
.live{position:absolute;top:118px;left:0;right:0;text-align:center;font-size:24px;
  font-weight:700;letter-spacing:.08em;color:#22C55E}
.chapter{position:absolute;top:200px;left:64px;display:inline-block;
  font-family:'Anton';font-size:34px;letter-spacing:.14em;color:#FFC72C;
  border:3px solid rgba(255,199,44,.55);border-radius:18px;padding:14px 26px;background:rgba(10,23,20,.45)}
.stack{position:absolute;left:64px;right:64px;bottom:${card ? 0 : 0}px;top:${card ? 0 : 'auto'};
  ${card ? 'display:flex;flex-direction:column;justify-content:center;align-items:flex-start;' : ''}
  padding-bottom:${card ? 0 : 430}px}
.overline{font-size:34px;font-weight:700;letter-spacing:.16em;color:rgba(255,255,255,.72);
  margin-bottom:18px;text-transform:uppercase}
.title{font-family:'Anton';font-size:148px;line-height:.96;color:#fff;text-transform:uppercase;
  letter-spacing:.01em;text-shadow:0 4px 40px rgba(0,0,0,.45);margin-bottom:30px}
.pill{display:inline-block;font-weight:800;font-size:44px;letter-spacing:.02em;color:#0A1714;
  padding:18px 36px;border-radius:999px;margin-bottom:22px}
.sub{font-size:34px;color:rgba(255,255,255,.75)}
.cardSub{font-size:36px;color:rgba(255,255,255,.65);margin-top:26px}
</style></head><body>
${card ? '' : `<div class="scrimTop"></div><div class="scrimBot"></div>${s.dark ? '<div class="dark"></div>' : ''}`}
<div class="wordmark">${sb.wordmark}</div>
<div class="live">● LIVE · SATELLITE COPERNICUS</div>
${s.chapter ? `<div class="chapter">${s.chapter}</div>` : ''}
<div class="stack">
  ${card
    ? `<div class="overline">${c.overline || ''}</div><div class="title">${lines(c.title)}</div><div class="cardSub">${c.sub || ''}</div>`
    : `<div class="overline">${o.overline || ''}</div><div class="title">${lines(o.title)}</div>
       ${o.pill ? `<div class="pill" style="background:${o.pillColor || '#FFC72C'}">${o.pill}</div>` : ''}
       ${o.sub ? `<div class="sub">${o.sub}</div>` : ''}`}
</div>
</body></html>`
}

;(async () => {
  const { chromium } = require(path.join(__dirname, '../../node_modules/playwright'))
  const browser = await chromium.launch()
  const pg = await browser.newPage({ viewport: { width: W, height: H } })
  for (const s of sb.scenes) {
    await pg.setContent(sceneHTML(s), { waitUntil: 'networkidle' })
    await pg.evaluate(() => document.fonts.ready)
    await pg.waitForTimeout(150)
    await pg.screenshot({ path: path.join(OUT, `ov-${s.id}.png`), omitBackground: s.type !== 'card' })
    console.log(`   ov-${s.id}.png`)
  }
  await browser.close()

  // ── 4. Segments ffmpeg (Ken Burns + calque + voix + fondus) ──
  console.log('[4/5] segments vidéo…')
  let zoomIn = true
  for (const s of sb.scenes) {
    const dur = s.dur, frames = Math.round(dur * FPS)
    const seg = path.join(OUT, `seg-${s.id}.mp4`)
    const ovPng = path.join(OUT, `ov-${s.id}.png`)
    const fadeOutSt = Math.max(0, dur - 0.35)
    const zexpr = zoomIn ? `min(1+0.00050*on,1.16)` : `max(1.16-0.00050*on,1.0)`
    zoomIn = !zoomIn
    const vf = s.type === 'card'
      ? `[0:v]scale=${W}:${H},zoompan=z='min(1+0.00018*on,1.05)':x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS},fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOutSt}:d=0.35,format=yuv420p[v]`
      : `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${zexpr}':x='iw/2-(iw/zoom)/2':y='(ih/2-(ih/zoom)/2)*0.82':d=1:s=${W}x${H}:fps=${FPS}[bg];[bg][1:v]overlay=0:0,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOutSt}:d=0.35,format=yuv420p[v]`
    const args = ['-y', '-loop', '1', '-framerate', String(FPS), '-t', String(dur),
      '-i', s.type === 'card' ? ovPng : s.img]
    if (s.type !== 'card') args.push('-loop', '1', '-framerate', String(FPS), '-t', String(dur), '-i', ovPng)
    if (s.vo) args.push('-i', path.join(OUT, `vo-${s.id}.mp3`))
    else args.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=24000:cl=mono')
    const aIdx = s.type === 'card' ? 1 : 2
    args.push('-filter_complex', vf, '-map', '[v]',
      '-map', `${aIdx}:a`, '-af', `apad,atrim=0:${dur},afade=t=out:st=${Math.max(0, dur - 0.3)}:d=0.3`,
      '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '1', seg)
    run('ffmpeg', args)
    console.log(`   seg-${s.id}.mp4 (${dur.toFixed(1)}s)`)
  }

  // ── 5. Concat + sous-titres globaux + nappe vagues + loudnorm ──
  console.log('[5/5] assemblage final…')
  fs.writeFileSync(path.join(OUT, 'list.txt'), sb.scenes.map(s => `file 'seg-${s.id}.mp4'`).join('\n'))
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'concat.mp4'])

  // SRT global : offsets cumulés des scènes
  const toMs = ts => { const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4]) }
  const fmt = ms => { const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s2 = Math.floor(ms % 60000 / 1000), x = Math.floor(ms % 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')},${String(x).padStart(3, '0')}` }
  let srtAll = [], idx = 1, t0 = 0
  for (const s of sb.scenes) {
    const p = path.join(OUT, `vo-${s.id}.srt`)
    if (s.vo && fs.existsSync(p)) {
      const blocks = fs.readFileSync(p, 'utf8').split(/\r?\n\r?\n/).filter(b => b.trim())
      for (const b of blocks) {
        const ls = b.split(/\r?\n/)
        const tm = ls.find(l => l.includes('-->'))
        if (!tm) continue
        const [a, bb] = tm.split('-->').map(x => toMs(x.trim()))
        const txt = ls.slice(ls.indexOf(tm) + 1).join(' ')
        srtAll.push(`${idx++}\n${fmt(a + t0 * 1000)} --> ${fmt(Math.min(bb, (s.dur - 0.1) * 1000) + t0 * 1000)}\n${txt}`)
      }
    }
    t0 += s.dur
  }
  fs.writeFileSync(path.join(OUT, 'brief.srt'), srtAll.join('\n\n') + '\n')

  const finalName = `brief-${REGION}-${sb.date}.mp4`
  const totalDur = sb.scenes.reduce((a, s) => a + s.dur, 0)
  run('ffmpeg', ['-y', '-i', 'concat.mp4',
    '-f', 'lavfi', '-t', String(totalDur), '-i', 'anoisesrc=color=pink:amplitude=0.05',
    '-filter_complex',
    `[1:a]lowpass=f=480,tremolo=f=0.16:d=0.55,volume=0.5[waves];` +
    `[0:a][waves]amix=inputs=2:duration=first:weights=1 0.30,loudnorm=I=-16:TP=-1.5:LRA=11[a];` +
    `[0:v]subtitles=brief.srt:force_style='FontName=Segoe UI Black,Fontsize=10.5,PrimaryColour=&H00FFFFFF,OutlineColour=&H7F000000,BorderStyle=1,Outline=1.4,Shadow=0,MarginV=30,Alignment=2'[v]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', finalName])
  // Chapitres (timestamps pour description YouTube/FB) + texte de post prêt à coller
  let cT = 0
  const chapters = []
  for (const s of sb.scenes) {
    const mm = String(Math.floor(cT / 60)).padStart(1, '0'), ss = String(Math.floor(cT % 60)).padStart(2, '0')
    const label = s.chapter ? s.chapter.replace(/^\d+ · /, '') : (s.id === 'title' ? sb.wordmark : (s.id === 'outro' ? sb.domain : s.id))
    chapters.push(`${mm}:${ss} ${label}`)
    cT += s.dur
  }
  fs.writeFileSync(path.join(OUT, finalName.replace('.mp4', '-chapters.txt')),
    chapters.join('\n') + `\n\nhttps://${sb.domain}/?utm_source=video&utm_medium=brief\n`)
  const fin = path.join(OUT, finalName)
  console.log(`\n✓ ${finalName} — ${ffprobeDur(fin).toFixed(1)}s, ${(fs.statSync(fin).size / 1048576).toFixed(1)} Mo`)
  if (!process.argv.includes('--keep')) {
    for (const f of fs.readdirSync(OUT)) if (/^(seg-|concat|list)/.test(f)) fs.unlinkSync(path.join(OUT, f))
  }
})().catch(e => { console.error('FAIL', e.message, e.stderr ? e.stderr.toString().slice(-800) : ''); process.exit(1) })
