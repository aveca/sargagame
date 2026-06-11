// Upscale IA des photos plages (pool hero/jeu) — Real-ESRGAN ncnn-vulkan (local, GPU).
// In: scripts/tmp-wf-results/upscale-list.json (fichiers de public/beaches/ <1600px)
// 1. staging → .realesrgan/in/   2. exe ×4 (realesrgan-x4plus) batch → .realesrgan/out/ (png)
// 3. sharp : resize largeur max 2048 + JPEG progressif q80 → remplace public/beaches/<file>
// Originaux sauvegardés dans .realesrgan/orig-backup/ (rollback possible).
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const BEACHES = path.join(ROOT, 'public/beaches')
const RE = path.join(ROOT, '.realesrgan')
const IN = path.join(RE, 'in')
const OUT = path.join(RE, 'out')
const BAK = path.join(RE, 'orig-backup')
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'tmp-wf-results/upscale-list.json'), 'utf8'))

for (const d of [IN, OUT, BAK]) fs.mkdirSync(d, { recursive: true })

// 1. staging (skip si déjà traité — reprise possible)
let staged = 0
for (const f of LIST) {
  const src = path.join(BEACHES, f)
  if (!fs.existsSync(src)) continue
  if (fs.existsSync(path.join(BAK, f))) continue // déjà traité lors d'un run précédent
  fs.copyFileSync(src, path.join(IN, f))
  staged++
}
console.log(`Staging: ${staged} photos → ${IN}`)

if (staged > 0) {
  // 2. Real-ESRGAN batch (une seule invocation, le exe itère le dossier)
  console.log('Real-ESRGAN x4plus (GPU)…')
  const t0 = Date.now()
  execFileSync(path.join(RE, 'realesrgan-ncnn-vulkan.exe'),
    ['-i', IN, '-o', OUT, '-n', 'realesrgan-x4plus', '-f', 'png'],
    { stdio: 'inherit' })
  console.log(`Upscale terminé en ${((Date.now() - t0) / 60000).toFixed(1)} min`)
}

// 3. re-encode + remplacement
;(async () => {
  let done = 0, before = 0, after = 0
  for (const f of LIST) {
    const up = path.join(OUT, f.replace(/\.(jpe?g|webp|png)$/i, '.png'))
    const dst = path.join(BEACHES, f)
    if (!fs.existsSync(up) || !fs.existsSync(dst)) continue
    if (fs.existsSync(path.join(BAK, f)) && !fs.existsSync(path.join(IN, f))) continue // déjà remplacé
    before += fs.statSync(dst).size
    fs.copyFileSync(dst, path.join(BAK, f)) // backup original
    const img = sharp(up)
    const m = await img.metadata()
    const w = Math.min(m.width, 2048)
    const buf = await img.resize({ width: w }).jpeg({ quality: 80, progressive: true, mozjpeg: true }).toBuffer()
    fs.writeFileSync(dst, buf)
    after += buf.length
    done++
    if (done % 25 === 0) console.log(`  ${done}/${LIST.length}`)
  }
  console.log(`Remplacées: ${done} | avant: ${(before / 1048576).toFixed(1)}MB → après: ${(after / 1048576).toFixed(1)}MB`)
  // nettoyage staging (garde backup + out pour audit)
  for (const f of fs.readdirSync(IN)) fs.unlinkSync(path.join(IN, f))
  console.log('OK — backups dans .realesrgan/orig-backup/')
})()
