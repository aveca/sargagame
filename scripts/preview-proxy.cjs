#!/usr/bin/env node
// Outil local (non committé) : sert dist/ en statique + proxy /api/*.php vers
// la prod Punta Cana (Origin forcé) — permet de smoke-tester le checkout
// embedded AVANT le deploy. Usage: node scripts/preview-proxy.cjs [port]
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const PORT = Number(process.argv[2] || 5180)
const DIST = path.join(__dirname, '..', 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' }

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname.endsWith('.php')) {
    // Proxy vers la prod PC avec Origin légitime
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      const pr = https.request({
        host: 'sargassumpuntacana.com', path: u.pathname, method: req.method,
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://sargassumpuntacana.com', 'Content-Length': Buffer.byteLength(body) },
      }, r2 => {
        res.writeHead(r2.statusCode, { 'Content-Type': 'application/json' })
        r2.pipe(res)
      })
      pr.on('error', () => { res.writeHead(502); res.end('{}') })
      pr.write(body); pr.end()
    })
    return
  }
  let p = path.join(DIST, decodeURIComponent(u.pathname))
  if (u.pathname.endsWith('/')) p = path.join(p, 'index.html')
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
}).listen(PORT, () => console.log(`preview http://localhost:${PORT} (dist + proxy PHP → PC prod)`))
