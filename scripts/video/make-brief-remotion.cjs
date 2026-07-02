// « Brief plage » — rendu REMOTION (v2). Storyboard + voix edge-tts identiques
// au v1 (make-brief.cjs) ; l'assemblage visuel (Ken Burns, calques, fondus,
// sous-titres) est une composition React (video-remotion/src/Brief.tsx).
// Usage : node scripts/video/make-brief-remotion.cjs [region]
// Sortie : scripts/video/out/brief-<region>-<date>.mp4 (1080×1920, 30 fps)
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { buildStoryboard } = require('./storyboard.cjs')

const REGION = process.argv[2] || 'mq'
const FPS = 30
const ROOT = path.resolve(__dirname, '../..')
const RPROJ = path.join(ROOT, 'video-remotion')
const CACHE = path.join(RPROJ, 'public', 'cache')
const OUT = path.join(__dirname, 'out')
fs.mkdirSync(CACHE, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

const ffprobeDur = f => parseFloat(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
const toMs = ts => { const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4]) }

// ── 1. Storyboard (garde-fou fraîcheur : skip PROPRE, exit 0, si donnée périmée) ──
let sb
try {
  sb = buildStoryboard(REGION)
} catch (e) {
  if (e && e.code === 'STALE_DATA_SKIP_RENDER') { console.log(`BRIEF_SKIPPED_STALE ${e.message}`); process.exit(0) }
  throw e
}
console.log(`[1/4] storyboard ${REGION} : ${sb.scenes.map(s => s.id).join(' → ')}`)

// ── 2. TTS par scène + copie des assets dans public/cache ─────
console.log(`[2/4] voix (edge-tts ${sb.voice}) + assets…`)
for (const s of sb.scenes) {
  if (s.vo) {
    const mp3 = path.join(CACHE, `vo-${REGION}-${s.id}.mp3`)
    const srt = path.join(CACHE, `vo-${REGION}-${s.id}.srt`)
    execFileSync('python', ['-m', 'edge_tts', '--voice', sb.voice, '--text', s.vo,
      '--write-media', mp3, '--write-subtitles', srt], { stdio: 'ignore' })
    s.voDur = ffprobeDur(mp3)
    s.dur = Math.max(s.minDur || 4, s.voDur + 0.7)
    s._voice = `cache/vo-${REGION}-${s.id}.mp3`
    s._srt = srt
    console.log(`   ${s.id}: vo ${s.voDur.toFixed(1)}s → scène ${s.dur.toFixed(1)}s`)
  } else { s.dur = s.minDur || 4 }
  if (s.img) {
    const dest = `cache/img-${REGION}-${s.id}${path.extname(s.img)}`
    fs.copyFileSync(s.img, path.join(RPROJ, 'public', dest))
    s._img = dest
  }
}

// ── 3. Props (scènes en frames + cues sous-titres globaux) ────
const scenes = []
const cues = []
let fromF = 0
for (const s of sb.scenes) {
  const durF = Math.round(s.dur * FPS)
  scenes.push({
    id: s.id, type: s.type === 'card' ? 'card' : 'photo', durF,
    voice: s._voice || null, img: s._img || null,
    chapter: s.chapter || null, dark: !!s.dark,
    overlay: s.overlay || null, card: s.card || null,
  })
  if (s._srt && fs.existsSync(s._srt)) {
    const blocks = fs.readFileSync(s._srt, 'utf8').split(/\r?\n\r?\n/).filter(b => b.trim())
    for (const b of blocks) {
      const ls = b.split(/\r?\n/)
      const tm = ls.find(l => l.includes('-->'))
      if (!tm) continue
      const [a, bb] = tm.split('-->').map(x => toMs(x.trim()))
      const text = ls.slice(ls.indexOf(tm) + 1).join(' ').trim()
      if (!text) continue
      const endMs = Math.min(bb, (s.dur - 0.1) * 1000)
      cues.push({
        startF: fromF + Math.round(a / 1000 * FPS),
        endF: fromF + Math.round(endMs / 1000 * FPS),
        text,
      })
    }
  }
  fromF += durF
}
const props = { wordmark: sb.wordmark, scenes, cues }
const propsPath = path.join(CACHE, `props-${REGION}.json`)
fs.writeFileSync(propsPath, JSON.stringify(props))
console.log(`[3/4] props : ${scenes.length} scènes, ${cues.length} cues, ${fromF} frames (${(fromF / FPS).toFixed(1)}s)`)

// ── 4. Rendu Remotion + loudnorm ───────────────────────────────
console.log('[4/4] rendu Remotion…')
const finalName = `brief-${REGION}-${sb.date}.mp4`
const raw = path.join(OUT, finalName.replace('.mp4', '-raw.mp4'))
execFileSync('npx', ['remotion', 'render', 'Brief', raw, `--props=${propsPath}`, '--log=error'],
  { cwd: RPROJ, stdio: 'inherit', shell: process.platform === 'win32' })
// Normalisation diffusion (le mix Remotion n'est pas loudness-normalisé)
execFileSync('ffmpeg', ['-y', '-i', raw, '-c:v', 'copy',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', path.join(OUT, finalName)], { stdio: 'ignore' })
fs.unlinkSync(raw)

// Chapitres + lien utm (identique au v1)
let cT = 0
const chapters = []
for (const s of sb.scenes) {
  const mm = String(Math.floor(cT / 60)), ss = String(Math.floor(cT % 60)).padStart(2, '0')
  const label = s.chapter ? s.chapter.replace(/^\d+ · /, '') : (s.id === 'title' ? sb.wordmark : (s.id === 'outro' ? sb.domain : s.id))
  chapters.push(`${mm}:${ss} ${label}`)
  cT += s.dur
}
fs.writeFileSync(path.join(OUT, finalName.replace('.mp4', '-chapters.txt')),
  chapters.join('\n') + `\n\nhttps://${sb.domain}/?utm_source=video&utm_medium=brief\n`)
const fin = path.join(OUT, finalName)
console.log(`\n✓ ${finalName} — ${ffprobeDur(fin).toFixed(1)}s, ${(fs.statSync(fin).size / 1048576).toFixed(1)} Mo (Remotion)`)
