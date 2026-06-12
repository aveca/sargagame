// Test beacons KPI /jeu/ : sg_game_start / sg_game_end / sg_game_share
// envoyés en analytics_event avec island. sendBeacon stubé, zéro réseau réel.
const http = require('http')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..', 'public')
const MIME = { '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const f = path.join(ROOT, p)
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404') }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  fs.createReadStream(f).pipe(res)
})

async function main() {
  await new Promise(r => srv.listen(4181, r))
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  await page.addInitScript(() => {
    window.__beacons = []
    navigator.sendBeacon = (url, body) => { window.__beacons.push({ url, body: String(body) }); return true }
  })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto('http://localhost:4181/jeu/index.html')
  await page.waitForTimeout(1200)
  await page.click('#btnStart')
  await page.waitForTimeout(800)
  await page.evaluate(() => end(true))
  await page.evaluate(() => { window.alert = () => {} })
  await page.click('#btnShare')
  await page.waitForTimeout(300)
  const beacons = await page.evaluate(() => window.__beacons.map(b => JSON.parse(b.body)))
  console.log('beacons:', beacons.map(b => b.e + '|' + b.island).join('  '))
  const names = beacons.map(b => b.e)
  const endEv = beacons.find(b => b.e === 'sg_game_end')
  const ok = names.includes('sg_game_start') && names.includes('sg_game_end') && names.includes('sg_game_share')
    && beacons.every(b => b.type === 'analytics_event' && b.island === 'MQ' && typeof b.t === 'number')
    && endEv && typeof endEv.p.score === 'number' && endEv.p.win === 1
    && errors.length === 0
  console.log(ok ? 'PASS — 3 beacons, enveloppe analytics_event conforme, 0 erreur JS' : `FAIL (errors=${errors.join(';')})`)
  if (!ok) { console.log(JSON.stringify(beacons, null, 1)); process.exitCode = 1 }
  await browser.close()
  srv.close()
}
main().catch(e => { console.error(e); process.exit(1) })
