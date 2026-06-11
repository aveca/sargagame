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
const DUR = 8, FPS = 30, SIZE = 1080
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
const vf = [
  `scale=${SIZE * 2}:${SIZE * 2}:force_original_aspect_ratio=increase`,
  `crop=${SIZE * 2}:${SIZE * 2}`,
  `zoompan=z='1+0.14*${tri}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2-(ih*0.012)*${tri}':d=1:s=${SIZE}x${SIZE}:fps=${FPS}`,
  'format=yuv420p',
].join(',')

let done = 0, totalKB = 0
for (const p of picked) {
  const src = path.join(ROOT, 'public/beaches', p.file)
  const dst = path.join(OUT, `${p.id}.mp4`)
  if (!fs.existsSync(src)) continue
  execFileSync('ffmpeg', ['-y', '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', src,
    '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-movflags', '+faststart', dst],
    { stdio: ['ignore', 'ignore', 'ignore'] })
  const kb = fs.statSync(dst).size / 1024
  totalKB += kb
  done++
  console.log(`  ${p.id}.mp4  ${(kb / 1024).toFixed(2)}MB  (photo q${p.q})`)
}

// Manifest = uniquement les loops réellement présents sur disque
const ids = fs.readdirSync(OUT).filter(f => f.endsWith('.mp4')).map(f => f.replace('.mp4', ''))
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ v: 1, ids }))
console.log(`OK — ${done} générées | total ${(totalKB / 1024).toFixed(1)}MB | manifest: ${ids.length} ids`)
