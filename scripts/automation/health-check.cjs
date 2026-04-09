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

const MAX_RETRIES = 3
const RETRY_DELAY = 5000 // 5s between retries

function checkOnce(site) {
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
        resolve({ name: site.name, ok: ok && hasContent && dataOk, status: res.statusCode, ms, bodyKB: Math.round(body.length / 1024) })
      })
    })
    req.on('error', e => {
      resolve({ name: site.name, ok: false, status: 0, ms: 0, error: e.message })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve({ name: site.name, ok: false, status: 0, ms: 15000, error: 'TIMEOUT (15s)' })
    })
  })
}

async function check(site) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const r = await checkOnce(site)
    if (r.ok) {
      console.log(`✅ ${r.name} — ${r.status} — ${r.ms}ms — ${r.bodyKB}KB${attempt > 1 ? ` (retry ${attempt}/${MAX_RETRIES})` : ''}`)
      return r
    }
    if (attempt < MAX_RETRIES) {
      const reason = r.error || `${r.status}`
      console.log(`⚠️  ${r.name} — ${reason} — retrying in ${RETRY_DELAY / 1000}s (${attempt}/${MAX_RETRIES})`)
      await new Promise(ok => setTimeout(ok, RETRY_DELAY))
    } else {
      console.log(`❌ ${r.name} — ${r.error || r.status} — failed after ${MAX_RETRIES} attempts`)
      return r
    }
  }
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
