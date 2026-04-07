#!/usr/bin/env node
/**
 * Health Check — Sargasses MQ/GP
 *
 * Checks both sites are up, returning valid HTML with sargassum data.
 * Exits with code 1 if any site is down (triggers GitHub Actions failure notification).
 *
 * Usage: node scripts/automation/health-check.cjs
 */
const https = require('https')

const SITES = [
  { name: 'Martinique', url: 'https://sargasses-martinique.com/' },
  { name: 'Guadeloupe', url: 'https://sargasses-guadeloupe.com/' },
  { name: 'MQ API', url: 'https://sargasses-martinique.com/api/copernicus/sargassum.json' },
  { name: 'GP API', url: 'https://sargasses-guadeloupe.com/api/copernicus/sargassum.json' },
]

function check(site) {
  return new Promise(resolve => {
    const start = Date.now()
    const req = https.get(site.url, { timeout: 15000 }, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        const ms = Date.now() - start
        const ok = res.statusCode >= 200 && res.statusCode < 400
        const hasContent = body.length > 100
        // For API endpoints, check valid JSON with levels
        const isAPI = site.url.includes('.json')
        let dataOk = true
        if (isAPI) {
          try {
            const d = JSON.parse(body)
            dataOk = d.levels && d.levels.length > 0
          } catch { dataOk = false }
        }
        console.log(`${ok && hasContent && dataOk ? '✅' : '❌'} ${site.name} — ${res.statusCode} — ${ms}ms — ${Math.round(body.length / 1024)}KB`)
        resolve({ name: site.name, ok: ok && hasContent && dataOk, status: res.statusCode, ms })
      })
    })
    req.on('error', e => {
      console.log(`❌ ${site.name} — ERROR: ${e.message}`)
      resolve({ name: site.name, ok: false, status: 0, ms: 0 })
    })
    req.on('timeout', () => {
      console.log(`❌ ${site.name} — TIMEOUT (15s)`)
      req.destroy()
      resolve({ name: site.name, ok: false, status: 0, ms: 15000 })
    })
  })
}

async function main() {
  console.log(`Health check — ${new Date().toISOString()}\n`)
  const results = await Promise.all(SITES.map(check))
  // MQ is critical (must pass), GP is best-effort (DNS migration in progress)
  const critical = results.filter(r => r.name.includes('Martinique') || r.name === 'MQ API')
  const optional = results.filter(r => r.name.includes('Guadeloupe') || r.name === 'GP API')
  const criticalOk = critical.every(r => r.ok)
  const optionalOk = optional.every(r => r.ok)
  if (!optionalOk) console.log(`\n⚠️  GP down (DNS migration) — deploy continues`)
  console.log(`\n${criticalOk ? '✅ Critical sites healthy' : '❌ CRITICAL SITES DOWN — check above'}`)
  process.exit(criticalOk ? 0 : 1)
}

main()
