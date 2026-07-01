#!/usr/bin/env node
/**
 * UX Audit — Generate a UX report from GA4 and CrUX data.
 * Reads audit-summary.json (or fetches fresh data) and produces ux-report.json.
 * Report only — no site modifications.
 *
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_JSON='...' GA4_PROPERTY_ID_MQ=123 GA4_PROPERTY_ID_GP=456 node ux-audit.cjs
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { SITES } = require('./lib/config.cjs')
const { appendLog } = require('./lib/safety.cjs')

const DATA_DIR = resolve(__dirname, 'data')
const AUDIT_PATH = resolve(DATA_DIR, 'audit-summary.json')
const REPORT_PATH = resolve(DATA_DIR, 'ux-report.json')

// ── First-party (stats.php) : NOMME le coupable des dead-clicks ────────────────
// Clarity (audit-summary) ne donne que la PAGE (target vide). La heatmap first-party
// (top_dead_els, PR #320) donne l'ÉLÉMENT. On enrichit le rapport → ux-watch email
// nomme le coupable au lieu de « ? ». Zéro Google, gracieux si pas de clé.
function _statsRegions() {
  const sites = [{ id: 'mq', domain: 'sargasses-martinique.com' }, { id: 'gp', domain: 'sargasses-guadeloupe.com' }]
  try { const { getAllRegions } = require('../../regions/index.cjs'); for (const r of getAllRegions()) if (r && r.domain && !sites.some(s => s.id === r.id)) sites.push({ id: r.id, domain: r.domain }) } catch (e) {}
  return sites
}
function _statsKeys() {
  const map = {}, env = process.env.SG_STATS_KEY
  try { Object.assign(map, JSON.parse(readFileSync(resolve(DATA_DIR, 'stats-keys.json'), 'utf8'))) } catch (e) {}
  for (const k of Object.keys(process.env)) { const m = k.match(/^SG_STATS_KEY_([A-Z0-9]+)$/); if (m && process.env[k]) map[m[1].toLowerCase()] = process.env[k] }
  return { env, map }
}
async function _fetchStats(domain, key) {
  const res = await fetch(`https://${domain}/stats.php?key=${encodeURIComponent(key)}&days=7`, { headers: { 'User-Agent': 'sarga-ux-audit' } })
  const j = JSON.parse(await res.text()); if (j.error) throw new Error(j.error); return j
}
// Agrège top_dead_els (par écran) → coupables nommés par région, ajoute des issues au rapport.
async function enrichNamedDeadClicks(report) {
  const { env, map } = _statsKeys()
  if (!env && !Object.keys(map).length) { console.log('[named dead-clicks] pas de clé stats — enrichissement sauté.'); return }
  for (const site of _statsRegions()) {
    const key = map[site.id] || env; if (!key) continue
    let data; try { data = await _fetchStats(site.domain, key) } catch (e) { console.error(`  [${site.id}] stats.php: ${e.message}`); continue }
    const els = {}
    for (const c of Object.values(data.clicks || {})) for (const [el, n] of Object.entries(c.top_dead_els || {})) els[el] = (els[el] || 0) + n
    const top = Object.entries(els).sort((a, b) => b[1] - a[1]).slice(0, 6).filter(([, n]) => n >= 8)
    if (!top.length) continue
    if (!report.sites[site.id]) report.sites[site.id] = { domain: site.domain, issues: [], crux: null, stats: { total: 0, critical: 0, warnings: 0 } }
    const S = report.sites[site.id]
    for (const [el, n] of top) {
      const severity = n >= 20 ? 'critical' : 'warning'
      S.issues.push({ type: 'dead-click-el', severity, page: 'app', target: el, metric: `${n} dead clicks on ${el}`, recommendation: 'First-party heatmap named this element. Make it interactive (tap → action) or remove its interactive look. Rollback flag advised.' })
      S.stats.total++; S.stats[severity === 'critical' ? 'critical' : 'warnings']++
      report.summary.totalIssues++; report.summary[severity === 'critical' ? 'critical' : 'warnings']++
      console.log(`  [${site.id}] NAMED dead-click: ${el} (${n}) → ${severity}`)
    }
  }
}

async function main() {
  console.log('=== UX Audit ===\n')

  if (!existsSync(AUDIT_PATH)) {
    console.log('No audit-summary.json found. Run seo-audit.cjs first.')
    process.exit(0)
  }

  const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'))
  const report = {
    generatedAt: new Date().toISOString(),
    sites: {},
    summary: { totalIssues: 0, critical: 0, warnings: 0 },
  }

  for (const [key, siteData] of Object.entries(audit.sites)) {
    const issues = []
    const findings = siteData.findings

    // High bounce rate pages
    for (const page of (findings.highBouncePages || [])) {
      issues.push({
        type: 'high-bounce',
        severity: page.bounceRate > 85 ? 'critical' : 'warning',
        page: page.pagePath,
        device: page.device,
        metric: `${page.bounceRate}% bounce rate`,
        sessions: page.sessions,
        recommendation: page.device === 'mobile'
          ? 'Check mobile responsiveness, font sizes, and touch targets'
          : 'Check page load speed and content relevance',
      })
    }

    // Core Web Vitals
    for (const cwv of (findings.cwvIssues || [])) {
      const severity = cwv.metric === 'LCP' && cwv.value > 4000 ? 'critical'
        : cwv.metric === 'CLS' && cwv.value > 0.25 ? 'critical'
        : 'warning'

      const recommendations = {
        LCP: 'Optimize largest image (compress, use WebP, add loading="lazy"), preload critical fonts, reduce server response time',
        INP: 'Reduce JavaScript execution time, defer non-critical scripts, use requestIdleCallback for analytics',
        CLS: 'Set explicit width/height on images, avoid dynamic content insertion above the fold, use font-display: swap',
      }

      issues.push({
        type: 'cwv',
        severity,
        metric: cwv.metric,
        value: cwv.value,
        threshold: cwv.threshold,
        recommendation: recommendations[cwv.metric] || 'Investigate Core Web Vitals',
      })
    }

    // Rage clicks (from Clarity → GA4 bridge)
    for (const rc of (findings.rageClicks || [])) {
      if (rc.count >= 3) {
        issues.push({
          type: 'rage-click',
          severity: rc.count >= 10 ? 'critical' : 'warning',
          page: rc.page,
          target: rc.target,
          metric: `${rc.count} rage clicks on ${rc.target || '?'} (${rc.page})`,
          recommendation: 'Element receives frustrated repeated clicks. Check if it looks interactive but is not, or if it responds too slowly.',
        })
      }
    }

    // Dead clicks
    for (const dc of (findings.deadClicks || [])) {
      if (dc.count >= 5) {
        issues.push({
          type: 'dead-click',
          severity: dc.count >= 15 ? 'critical' : 'warning',
          page: dc.page,
          target: dc.target,
          metric: `${dc.count} dead clicks on ${dc.target || '?'} (${dc.page})`,
          recommendation: 'Non-interactive element receives clicks. Either make it clickable or change its visual style to not look interactive.',
        })
      }
    }

    // Quick bounces
    const quickBounceTotal = (findings.quickBounces || []).reduce((s, q) => s + q.count, 0)
    if (quickBounceTotal >= 10) {
      issues.push({
        type: 'quick-bounce',
        severity: quickBounceTotal >= 30 ? 'critical' : 'warning',
        metric: `${quickBounceTotal} visitors left within 10 seconds`,
        recommendation: 'Users leave very quickly. Check first impression: loading speed, above-the-fold content, and mobile layout.',
      })
    }

    // Mobile vs Desktop gap analysis
    const mobilePages = (findings.highBouncePages || []).filter(p => p.device === 'mobile')
    const desktopPages = (findings.highBouncePages || []).filter(p => p.device === 'desktop')
    if (mobilePages.length > 0 && desktopPages.length > 0) {
      const avgMobileBounce = mobilePages.reduce((s, p) => s + p.bounceRate, 0) / mobilePages.length
      const avgDesktopBounce = desktopPages.reduce((s, p) => s + p.bounceRate, 0) / desktopPages.length
      if (avgMobileBounce - avgDesktopBounce > 15) {
        issues.push({
          type: 'mobile-gap',
          severity: 'warning',
          metric: `Mobile bounce ${Math.round(avgMobileBounce)}% vs Desktop ${Math.round(avgDesktopBounce)}%`,
          gap: Math.round(avgMobileBounce - avgDesktopBounce),
          recommendation: 'Significant mobile/desktop gap. Review responsive layout, tap targets, and mobile navigation.',
        })
      }
    }

    const critical = issues.filter(i => i.severity === 'critical').length
    const warnings = issues.filter(i => i.severity === 'warning').length

    report.sites[key] = {
      domain: siteData.domain,
      issues,
      crux: siteData.crux,
      stats: { total: issues.length, critical, warnings },
    }

    report.summary.totalIssues += issues.length
    report.summary.critical += critical
    report.summary.warnings += warnings

    console.log(`${siteData.domain}: ${issues.length} issues (${critical} critical, ${warnings} warnings)`)
    for (const issue of issues) {
      const icon = issue.severity === 'critical' ? '!!!' : ' ! '
      console.log(`  [${icon}] ${issue.type}: ${issue.metric}`)
    }
  }

  // Enrichissement first-party : NOMME les coupables dead-click (top_dead_els).
  try { await enrichNamedDeadClicks(report) } catch (e) { console.error('[named dead-clicks]', e.message) }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
  console.log(`\n✓ UX report saved to ${REPORT_PATH}`)

  appendLog({
    script: 'ux-audit',
    action: 'report-generated',
    issues: report.summary,
  })
}

main().catch(e => { console.error(e.message); process.exit(1) })
