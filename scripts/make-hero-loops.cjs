// Boucles vidéo hero (photo → micro-loop "drone hover" façon SpaceX).
// Top 4 photos par région (score qualité ≥75) → public/videos/hero/<beachId>.mp4
// + manifest.json {ids:[...]}. Palindrome zoom (triangle 1→1.14→1) = loop seamless.
// Pièges payés (skill video-brief) : input -loop 1 -t D + zoompan d=1, upscale ×2
// avant zoompan sinon tremblements. H.264 yuv420p = autoplay iOS ok.
// Usage : node scripts/make-hero-loops.cjs [--only=fl,mq]
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const Q = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/beaches-images-quality.json'), 'utf8'))
const IMG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/beaches-images.json'), 'utf8'))
const OUT = path.join(ROOT, 'public/videos/hero')
fs.mkdirSync(OUT, { recursive: true })

// Couverture TOTALE de l'espace candidat hero : le pool de rotation = photos
// hero-grade (≥85) dans le peloton de score DU JOUR — imprévisible jour par
// jour, donc on génère une loop pour CHAQUE photo ≥85 (73 au 2026-06-11,
// ~1MB pièce, filtrées par domaine dans prepare-ftp). Garantie par construction.
const PER_REGION = 999
const MIN_Q = 85
const DUR = 8, FPS = 30
// Double résolution (feedback user 2026-06-11 « mauvaise qualité en grand ») :
// carré 1080² pour mobile/portrait, 1920×1080 pour desktop/paysage — un 1080²
// étiré sur un viewport 1440+ bave. Le wide est en preset fast/crf 27 pour
// contenir le temps CI (~×2 sinon). Suffixe -w, listé dans manifest.wide.
const VARIANTS = [
  { suffix: '', w: 1080, h: 1080, preset: 'medium', crf: '26' },
  { suffix: '-w', w: 1920, h: 1080, preset: 'fast', crf: '27' },
]
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)

// Groupes par préfixe région (mq, gp, fl, rm, pc…)
const byRegion = {}
for (const [id, q] of Object.entries(Q)) {
  const file = IMG[id]
  if (!file || String(file).startsWith('sat-') || q < MIN_Q) continue
  const pfx = (id.match(/^[a-z]+/) || [])[0]
  if (!pfx) continue
  if (only.length && !only.includes(pfx)) continue
  ;(byRegion[pfx] = byRegion[pfx] || []).push({ id, file, q })
}

const picked = []
for (const [pfx, arr] of Object.entries(byRegion)) {
  arr.sort((a, b) => b.q - a.q)
  picked.push(...arr.slice(0, PER_REGION).map(x => ({ ...x, pfx })))
}
console.log(`Boucles à générer : ${picked.length} (${Object.keys(byRegion).join(', ')})`)

const frames = DUR * FPS
// Triangle 0→1→0 : zoom et dérive verticale symétriques → première = dernière frame.
const tri = `(1-abs(2*on/${frames - 1}-1))`
const vfFor = v => [
  `scale=${v.w * 2}:${v.h * 2}:force_original_aspect_ratio=increase`,
  `crop=${v.w * 2}:${v.h * 2}`,
  `zoompan=z='1+0.14*${tri}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2-(ih*0.012)*${tri}':d=1:s=${v.w}x${v.h}:fps=${FPS}`,
  'format=yuv420p',
].join(',')

let done = 0, totalKB = 0
for (const p of picked) {
  const src = path.join(ROOT, 'public/beaches', p.file)
  if (!fs.existsSync(src)) continue
  for (const v of VARIANTS) {
    const dst = path.join(OUT, `${p.id}${v.suffix}.mp4`)
    execFileSync('ffmpeg', ['-y', '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', src,
      '-vf', vfFor(v), '-an', '-c:v', 'libx264', '-preset', v.preset, '-crf', v.crf, '-movflags', '+faststart', dst],
      { stdio: ['ignore', 'ignore', 'ignore'] })
    totalKB += fs.statSync(dst).size / 1024
  }
  done++
  console.log(`  ${p.id}.mp4 + -w  (photo q${p.q})`)
}

// Manifest = uniquement les loops réellement présents sur disque.
// v2 : ids = loops carrées, wide = ids ayant aussi la variante 1920×1080.
const all = fs.readdirSync(OUT).filter(f => f.endsWith('.mp4')).map(f => f.replace('.mp4', ''))
const ids = all.filter(x => !x.endsWith('-w'))
const wide = all.filter(x => x.endsWith('-w')).map(x => x.slice(0, -2))
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ v: 2, ids, wide }))
console.log(`OK — ${done} plages ×${VARIANTS.length} | total ${(totalKB / 1024).toFixed(1)}MB | manifest: ${ids.length} ids, ${wide.length} wide`)
