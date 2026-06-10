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
const { getAllRegions } = require('../../regions/index.cjs')

// Toutes les régions (MQ/GP + nouvelles) : home + API data de chaque domaine.
const SITES = getAllRegions().flatMap(r => [
  { name: r.name, url: `https://${r.domain}/` },
  { name: `${r.name} API`, url: `https://${r.domain}/api/copernicus/sargassum.json` },
])

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

// Data staleness check — alert if any region's sargassum.json is too old
async function checkStaleness() {
  const issues = []
  for (const region of getAllRegions()) {
    try {
      const apiUrl = `https://${region.domain}/api/copernicus/sargassum.json`
      const body = await new Promise((resolve, reject) => {
        https.get(apiUrl, { timeout: 10000 }, res => {
          let d = ''
          res.on('data', c => d += c)
          res.on('end', () => resolve(d))
        }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout')) })
      })
      const data = JSON.parse(body)
      const ageH = (Date.now() - new Date(data.updatedAt)) / 3.6e6
      if (ageH > 12) {
        issues.push(`[${region.id}] Data stale: sargassum.json is ${ageH.toFixed(1)}h old (threshold: 12h)`)
        console.log(`⚠️  [${region.id}] Data staleness: ${ageH.toFixed(1)}h since last update`)
      } else {
        console.log(`✅ [${region.id}] Data freshness: ${ageH.toFixed(1)}h old`)
      }
      // Check ERDDAP timestamp age (satellite data itself)
      if (data.erddapTimestamp) {
        const satAge = (Date.now() - new Date(data.erddapTimestamp)) / 3.6e6
        if (satAge > 48) {
          issues.push(`[${region.id}] Satellite data stale: ERDDAP timestamp is ${satAge.toFixed(0)}h old`)
          console.log(`⚠️  [${region.id}] Satellite staleness: ERDDAP data is ${satAge.toFixed(0)}h old`)
        }
      }
    } catch (e) {
      issues.push(`[${region.id}] Staleness check failed: ${e.message}`)
    }
  }
  return issues
}

// Send staleness/downtime alert via Resend
function sendAlert(subject, issues) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const html = `<div style="font-family:system-ui;max-width:500px;padding:20px">
    <h2 style="color:#dc2626;margin:0 0 12px">${subject}</h2>
    <ul>${issues.map(i => `<li style="margin:4px 0">${i}</li>`).join('')}</ul>
    <p style="font-size:12px;color:#999;margin-top:16px">Auto-alert from health-check.cjs</p>
  </div>`
  const body = JSON.stringify({
    from: 'Sargasses Pipeline <alerts@sargasses-martinique.com>',
    to: ['aveca@aveca.fr'],
    subject: `[Sargasses] ${subject}`,
    html,
  })
  const req = https.request({
    hostname: 'api.resend.com', path: '/emails', method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, res => {
    let d = ''
    res.on('data', c => d += c)
    res.on('end', () => {
      if (res.statusCode < 300) console.log(`Alert email sent: ${subject}`)
      else console.log(`Alert email failed: ${res.statusCode} ${d}`)
    })
  })
  req.on('error', e => console.log(`Alert send error: ${e.message}`))
  req.write(body)
  req.end()
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

  // Check data staleness
  console.log('')
  const stalenessIssues = await checkStaleness()

  // Collect all issues for alerting
  const allIssues = []
  if (!criticalOk) allIssues.push(...critical.filter(r => !r.ok).map(r => `${r.name} DOWN: ${r.error || r.status}`))
  if (!optionalOk) allIssues.push(...optional.filter(r => !r.ok).map(r => `${r.name} DOWN: ${r.error || r.status}`))
  allIssues.push(...stalenessIssues)

  if (allIssues.length > 0) {
    const severity = !criticalOk ? 'CRITICAL' : 'Warning'
    sendAlert(`${severity}: ${allIssues.length} issue(s) detected`, allIssues)
  }

  console.log(`\n${criticalOk ? '✅ Critical sites healthy' : '❌ CRITICAL SITES DOWN — check above'}`)
  // Always exit 0 — alert emails handle notification, exit(1) just breaks workflows
  process.exit(0)
}

main()
