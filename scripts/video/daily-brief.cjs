// « Brief plage » quotidien — orchestre les 5 régions via le pipeline Remotion.
// Usage : node scripts/video/daily-brief.cjs [--dry] [--publish]
//   --dry      vérifie les prérequis + storyboard sans rendre
//   --publish  tente la publication FB (nécessite session Edge locale)
// Sortie : scripts/video/out/brief-<region>-<date>.mp4 pour chaque région
const { execFileSync, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REGIONS = ['mq', 'gp', 'puntacana', 'florida', 'rivieramaya']
const DRY = process.argv.includes('--dry')
const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', BOLD = '\x1b[1m', RESET = '\x1b[0m'

function check(cmd, args, label) {
  try {
    execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    return true
  } catch (e) {
    return false
  }
}

function log(ok, msg) {
  const icon = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
  console.log(`  ${icon} ${msg}`)
}

async function main() {
  console.log(`\n${BOLD}${CYAN}═══ Brief plage quotidien ═══${RESET}\n`)

  // ── Prérequis ──
  console.log(`${BOLD}Prérequis :${RESET}`)
  const ffmpegOk = check('ffmpeg', ['-version'], 'ffmpeg')
  log(ffmpegOk, `ffmpeg ${ffmpegOk ? '' : 'MANQUANT'}`)

  const edgeOk = check('python', ['-m', 'edge_tts', '--help'], 'edge-tts')
  log(edgeOk, `edge-tts ${edgeOk ? '' : 'MANQUANT (pip install edge-tts)'}`)

  let pwOk = false
  try { require(path.join(ROOT, 'node_modules/playwright')); pwOk = true } catch (_) {}
  log(pwOk, `Playwright ${pwOk ? '' : 'MANQUANT (npm install)'}`)

  const remotionOk = fs.existsSync(path.join(ROOT, 'video-remotion', 'node_modules'))
  log(remotionOk, `Remotion ${remotionOk ? '' : 'MANQUANT (cd video-remotion && npm install)'}`)

  const ready = ffmpegOk && edgeOk && pwOk && remotionOk
  if (!ready) {
    console.log(`\n${RED}Prérequis insuffisants — région MQ seulement avec fallback si dispo${RESET}`)
  }

  // ── Régions ──
  console.log(`\n${BOLD}Régions :${RESET}`)
  const results = []
  for (const r of REGIONS) {
    process.stdout.write(`  ${YELLOW}${r}${RESET} … `)
    try {
      // Vérifier la fraîcheur en amont via storyboard
      const { buildStoryboard } = require('./storyboard.cjs')
      const sb = buildStoryboard(r)
      if (DRY) {
        const dur = sb.scenes.reduce((a, s) => a + (s.minDur || 4), 0)
        console.log(`storyboard OK (${sb.scenes.length} scènes, ~${dur.toFixed(0)}s)`)
        results.push({ region: r, ok: true, scenes: sb.scenes.length, dry: true })
        continue
      }
      // Rendu Remotion
      execFileSync('node', ['scripts/video/make-brief-remotion.cjs', r], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8'
      })
      // Trouver le fichier produit (le plus récent par date dans le nom)
      const files = fs.readdirSync(OUT).filter(f => f.startsWith(`brief-${r}-`) && f.endsWith('.mp4'))
      const mp4 = files.sort().pop()
      if (mp4) {
        const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, mp4)], { encoding: 'utf8' }).trim())
        console.log(`${GREEN}✓${RESET} ${mp4} — ${dur.toFixed(1)}s`)
        results.push({ region: r, ok: true, file: mp4, dur: Math.round(dur * 10) / 10 })
      } else {
        console.log(`${RED}FAIL${RESET} fichier non trouvé après rendu`)
        results.push({ region: r, ok: false, error: 'no output file' })
      }
    } catch (e) {
      if (e.code === 'STALE_DATA_SKIP_RENDER') {
        console.log(`${YELLOW}skip (donnée périmée)${RESET}`)
        results.push({ region: r, ok: false, error: 'stale data' })
      } else {
        console.log(`${RED}FAIL${RESET} ${e.message}`)
        results.push({ region: r, ok: false, error: e.message })
      }
    }
  }

  // ── Résumé ──
  console.log(`\n${BOLD}${CYAN}Résumé :${RESET}`)
  const done = results.filter(r => r.ok)
  const fail = results.filter(r => !r.ok)
  for (const r of done) {
    const extra = r.dry ? '' : ` → ${r.file} (${r.dur}s)`
    console.log(`  ${GREEN}✓${RESET} ${r.region}${extra}`)
  }
  for (const r of fail) {
    console.log(`  ${RED}✗${RESET} ${r.region} — ${r.error}`)
  }
  const stamp = new Date().toISOString().slice(0, 10)
  console.log(`\n${BOLD}${done.length}/${REGIONS.length} régions produites le ${stamp}${RESET}`)
  if (done.length && !DRY) {
    const totalSize = done.reduce((s, r) => {
      try { return s + fs.statSync(path.join(OUT, r.file)).size } catch { return s }
    }, 0)
    console.log(`Volume total : ${(totalSize / 1048576).toFixed(1)} Mo`)
  }
  if (fail.length) process.exit(1)
}

main().catch(e => { console.error(`\n${RED}FATAL${RESET}`, e.message); process.exit(1) })
