#!/usr/bin/env node
/**
 * depthflow-batch.cjs — parallaxe 2.5D pour TOUTES les photos héros (même pool
 * que make-hero-loops : qualité ≥85, hors sat-*). 100 % local et gratuit.
 *
 * Par plage : DepthFlow dolly 6 s @2048w (GPU) → palindrome ffmpeg (boucle
 * parfaite par construction) en 1080×1080 (mobile) + 1920×1080 (-w, desktop)
 * → assets/hero-depthflow/<id>.mp4 + <id>-w.mp4.
 *
 * Distribution : GitHub Release (pas le repo — ~150-250 Mo) :
 *   gh release create depthflow-heroes --notes "clips parallaxe" assets/hero-depthflow/*.mp4
 * Le CI les télécharge avant make-hero-loops (étape daily-copernicus), qui les
 * copie par-dessus le zoompan via l'overlay existant.
 *
 * Usage : node scripts/video/depthflow-batch.cjs [--only=mq,fl] [--force]
 * Idempotent : skippe les clips déjà présents (sauf --force).
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const Q = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/beaches-images-quality.json'), 'utf8'))
const IMG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/beaches-images.json'), 'utf8'))
const OUT = path.join(ROOT, 'assets/hero-depthflow')
const TMP = path.join(ROOT, 'scripts/video/out/depthflow')
const DF = path.join(ROOT, '.venv-depthflow/Scripts/depthflow.exe')
const MIN_Q = 85
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(TMP, { recursive: true })

const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
const FORCE = process.argv.includes('--force')

// Même sélection que make-hero-loops (qualité ≥85, pas de satellite)
const picked = []
for (const [id, q] of Object.entries(Q)) {
  const file = IMG[id]
  if (!file || String(file).startsWith('sat-') || q < MIN_Q) continue
  const pfx = (id.match(/^[a-z]+/) || [])[0]
  if (only.length && !only.includes(pfx)) continue
  if (!fs.existsSync(path.join(ROOT, 'public/beaches', file))) continue
  picked.push({ id, file, q })
}
console.log(`DepthFlow batch : ${picked.length} plages`)

const CROPS = [
  { suffix: '', vf: 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080', preset: 'slow', crf: '26' },
  { suffix: '-w', vf: 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080', preset: 'fast', crf: '27' },
]

let done = 0, skipped = 0, failed = []
const t0 = Date.now()
for (const p of picked) {
  const targets = CROPS.map(c => path.join(OUT, `${p.id}${c.suffix}.mp4`))
  if (!FORCE && targets.every(t => fs.existsSync(t) && fs.statSync(t).size > 100000)) { skipped++; continue }
  const src = path.join(TMP, `${p.id}-src.mp4`)
  try {
    execFileSync(DF, ['input', '-i', path.join(ROOT, 'public/beaches', p.file), 'dolly',
      'main', '-o', src, '--time', '6', '--fps', '30', '--width', '2048'],
      { stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 120000 })
    for (const c of CROPS) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src,
        '-filter_complex', `[0:v]${c.vf},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]`,
        '-map', '[v]', '-c:v', 'libx264', '-preset', c.preset, '-crf', c.crf,
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
        path.join(OUT, `${p.id}${c.suffix}.mp4`)], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 })
    }
    fs.rmSync(src, { force: true })
    done++
    if (done % 10 === 0) console.log(`  ${done} rendues (q${p.q} dernier: ${p.id}) — ${Math.round((Date.now() - t0) / 1000)}s`)
  } catch (e) {
    failed.push(p.id)
    console.warn(`  ✗ ${p.id}: ${String(e.message).slice(0, 80)}`)
  }
}
const totalMB = fs.readdirSync(OUT).filter(f => f.endsWith('.mp4'))
  .reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1e6
console.log(`\nOK — ${done} rendues, ${skipped} déjà là, ${failed.length} échecs${failed.length ? ' (' + failed.join(',') + ')' : ''}`)
console.log(`assets/hero-depthflow : ${fs.readdirSync(OUT).filter(f => f.endsWith('.mp4')).length} clips, ${totalMB.toFixed(0)} Mo — ${Math.round((Date.now() - t0) / 60000)} min`)
