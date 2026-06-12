// Test fond vivant /jeu/ : video loop si manifest la contient, photo sinon,
// jamais en reduced-motion. Serveur statique sur public/ (le jeu est standalone).
const http = require('http')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..', 'public')
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const f = path.join(ROOT, p)
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404') }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  fs.createReadStream(f).pipe(res)
})

async function main() {
  await new Promise(r => srv.listen(4180, r))
  const localMp4 = fs.readdirSync(path.join(ROOT, 'videos/hero')).find(f => f.endsWith('.mp4'))
  console.log('stub mp4 =', localMp4)
  const browser = await chromium.launch()

  // ── Cas 1 : la plage choisie A une loop → video joue, opacity 1 ──
  {
    const page = await (await browser.newContext()).newPage()
    // Stub manifest : on déclare TOUTES les ids → la plage élue matche forcément
    await page.route('**/videos/hero/manifest.json', r => r.fulfill({ json: { v: 2, ids: ['mq001','mq002','mq004','mq008','mq011','mq012','mq014','mq016','mq024','mq034','mq044'], wide: [] } }))
    // Toute requête mp4 → un vrai fichier local (le contenu importe peu, il doit jouer)
    await page.route('**/videos/hero/*.mp4', r => r.fulfill({ path: path.join(ROOT, 'videos/hero', localMp4), contentType: 'video/mp4' }))
    await page.goto('http://localhost:4180/jeu/index.html')
    await page.waitForTimeout(2500)
    const st = await page.evaluate(() => {
      const v = document.getElementById('bgv'), bg = document.getElementById('bg')
      return { src: v.src, paused: v.paused, ready: v.readyState, op: getComputedStyle(v).opacity, bgSrc: bg.src, bgOp: getComputedStyle(bg).opacity }
    })
    console.log('CAS1 video:', JSON.stringify(st))
    const ok = /\/videos\/hero\/mq\d+\.mp4$/.test(st.src) && !st.paused && st.ready >= 2 && st.op === '1' && st.bgSrc.includes('/beaches/')
    console.log(ok ? 'CAS1 PASS — loop joue par-dessus la photo' : 'CAS1 FAIL')
    if (!ok) process.exitCode = 1
  }

  // ── Cas 2 : pas de loop pour cette plage → fallback photo seule ──
  {
    const page = await (await browser.newContext()).newPage()
    await page.route('**/videos/hero/manifest.json', r => r.fulfill({ json: { v: 2, ids: [], wide: [] } }))
    await page.goto('http://localhost:4180/jeu/index.html')
    await page.waitForTimeout(2000)
    const st = await page.evaluate(() => {
      const v = document.getElementById('bgv'), bg = document.getElementById('bg')
      return { src: v.src, op: getComputedStyle(v).opacity, bgOp: getComputedStyle(bg).opacity }
    })
    console.log('CAS2 fallback:', JSON.stringify(st))
    const ok = st.src === '' && st.op === '0' && st.bgOp === '1'
    console.log(ok ? 'CAS2 PASS — photo seule, pas de requête vidéo' : 'CAS2 FAIL')
    if (!ok) process.exitCode = 1
  }

  // ── Cas 3 : prefers-reduced-motion → aucune vidéo, même avec manifest plein ──
  {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    let manifestRequested = false
    await page.route('**/videos/hero/manifest.json', r => { manifestRequested = true; r.fulfill({ json: { v: 2, ids: ['mq001'], wide: [] } }) })
    await page.goto('http://localhost:4180/jeu/index.html')
    await page.waitForTimeout(2000)
    const src = await page.evaluate(() => document.getElementById('bgv').src)
    const ok = src === '' && !manifestRequested
    console.log('CAS3', ok ? 'PASS — reduced-motion : zéro fetch vidéo' : `FAIL (src=${src}, manifestRequested=${manifestRequested})`)
    if (!ok) process.exitCode = 1
  }

  await browser.close()
  srv.close()
}
main().catch(e => { console.error(e); process.exit(1) })
