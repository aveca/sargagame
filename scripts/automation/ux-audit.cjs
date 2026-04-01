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

function main() {
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

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
  console.log(`\n✓ UX report saved to ${REPORT_PATH}`)

  appendLog({
    script: 'ux-audit',
    action: 'report-generated',
    issues: report.summary,
  })
}

main()
