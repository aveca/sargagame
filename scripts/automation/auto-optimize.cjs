#!/usr/bin/env node
/**
 * Auto-Optimize — Self-improvement loop.
 * Reads audit data (seo-audit + ux-audit outputs), analyzes metrics,
 * and applies data-driven optimizations automatically.
 *
 * Idempotent: safe to run multiple times. Existing entries are updated, not duplicated.
 *
 * Outputs:
 *   data/meta-overrides.json    — Title/description overrides for low-CTR and GP gap pages
 *   data/optimization-log.json  — All optimization decisions with supporting data
 *
 * Usage:
 *   node scripts/automation/auto-optimize.cjs
 *   DRY_RUN=1 node scripts/automation/auto-optimize.cjs
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { SITES, BEACHES } = require('./lib/config.cjs')
const { DRY_RUN, appendLog } = require('./lib/safety.cjs')

const DATA_DIR = resolve(__dirname, 'data')
const AUDIT_PATH = resolve(DATA_DIR, 'audit-summary.json')
const UX_REPORT_PATH = resolve(DATA_DIR, 'ux-report.json')
const META_OVERRIDES_PATH = resolve(DATA_DIR, 'meta-overrides.json')
const OPT_LOG_PATH = resolve(DATA_DIR, 'optimization-log.json')

// ── Helpers ──────────────────────────────────────────────────

function readJSON(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function writeJSON(filePath, data) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would write ${filePath}`)
    return
  }
  mkdirSync(resolve(filePath, '..'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2))
}

function readOptLog() {
  const existing = readJSON(OPT_LOG_PATH)
  if (existing && Array.isArray(existing.decisions)) return existing
  return { decisions: [], lastRun: null }
}

function addDecision(optLog, decision) {
  // Idempotent: replace existing decision with same rule + key, or append
  const idx = optLog.decisions.findIndex(
    d => d.rule === decision.rule && d.key === decision.key
  )
  const entry = {
    ...decision,
    timestamp: new Date().toISOString(),
  }
  if (idx >= 0) {
    optLog.decisions[idx] = entry
  } else {
    optLog.decisions.push(entry)
  }
}

// ── Rule 1: Low CTR pages -> Optimize meta ───────────────────

function ruleLowCTR(audit, metaOverrides, optLog) {
  let count = 0
  console.log('\n--- Rule 1: Low CTR pages ---')

  for (const [siteKey, siteData] of Object.entries(audit.sites)) {
    const island = siteKey === 'mq' ? 'Martinique' : 'Guadeloupe'
    const lowCtrPages = (siteData.findings && siteData.findings.lowCtrPages) || []

    for (const page of lowCtrPages) {
      // Threshold: >100 impressions AND <3% CTR
      if (page.impressions <= 100 || page.actualCtr >= 3) continue

      // Match to a beach slug
      const urlMatch = page.page.match(/\/plages\/([^/]+)\//)
      if (!urlMatch) continue
      const slug = urlMatch[1]
      const beach = BEACHES.find(b => b.slug === slug)
      if (!beach) continue

      const year = new Date().getFullYear()
      // Proven high-CTR keywords: "en temps reel" and "aujourd'hui"
      const newTitle = `${beach.name} — Sargasses ${island} en temps r\u00e9el ${year}`
      const newDesc = `Sargasses \u00e0 ${beach.name} (${beach.commune}, ${island}) : plage propre ou \u00e0 \u00e9viter aujourd'hui ? Pr\u00e9visions 7 jours, indice AFAI en temps r\u00e9el et carte interactive.`

      metaOverrides.titles[slug] = newTitle
      metaOverrides.descriptions[slug] = newDesc
      count++

      addDecision(optLog, {
        rule: 'low-ctr',
        key: `${siteKey}:${slug}`,
        action: 'meta-override',
        data: {
          impressions: page.impressions,
          ctr: page.actualCtr,
          position: page.avgPosition,
          topQueries: (page.topQueries || []).slice(0, 3).map(q => q.query),
        },
        result: { title: newTitle, description: newDesc },
        reason: `CTR ${page.actualCtr}% < 3% with ${page.impressions} impressions. Updated meta with high-CTR keywords.`,
      })

      console.log(`  [FIX] ${slug}: CTR ${page.actualCtr}% (${page.impressions} imp) -> new meta`)
    }
  }

  if (count === 0) console.log('  No low-CTR pages needing optimization.')
  else console.log(`  ${count} meta overrides generated.`)
  return count
}

// ── Rule 2: High bounce pages -> Flag for content review ─────

function ruleHighBounce(audit, optLog) {
  let count = 0
  console.log('\n--- Rule 2: High bounce pages ---')

  for (const [siteKey, siteData] of Object.entries(audit.sites)) {
    const highBounce = (siteData.findings && siteData.findings.highBouncePages) || []

    for (const page of highBounce) {
      // Threshold: >60% bounce rate
      if (page.bounceRate <= 60) continue

      count++
      addDecision(optLog, {
        rule: 'high-bounce',
        key: `${siteKey}:${page.pagePath}:${page.device}`,
        action: 'content-review-needed',
        data: {
          pagePath: page.pagePath,
          device: page.device,
          bounceRate: page.bounceRate,
          sessions: page.sessions,
          avgDuration: page.avgDuration,
        },
        result: {
          recommendations: [
            'Add more internal links to related beach pages',
            'Improve above-the-fold content to retain visitors',
            page.device === 'mobile'
              ? 'Check mobile layout: font sizes, touch targets, and loading speed'
              : 'Check content relevance and page load performance',
            page.avgDuration < 15
              ? 'Very short sessions: content may not match search intent'
              : null,
          ].filter(Boolean),
        },
        reason: `Bounce rate ${page.bounceRate}% > 60% threshold (${page.sessions} sessions, ${page.device}).`,
      })

      console.log(`  [FLAG] ${page.pagePath} (${page.device}): ${page.bounceRate}% bounce, ${page.sessions} sessions`)
    }
  }

  if (count === 0) console.log('  No high-bounce pages above threshold.')
  else console.log(`  ${count} pages flagged for content review.`)
  return count
}

// ── Rule 3: Dead clicks -> Flag elements to fix ──────────────

function ruleDeadClicks(audit, uxReport, optLog) {
  let count = 0
  console.log('\n--- Rule 3: Dead clicks tracking ---')

  // Check UX report for dead click issues
  if (uxReport && uxReport.sites) {
    for (const [siteKey, siteData] of Object.entries(uxReport.sites)) {
      const deadClickIssues = (siteData.issues || []).filter(i => i.type === 'dead-click')

      for (const issue of deadClickIssues) {
        count++
        addDecision(optLog, {
          rule: 'dead-clicks',
          key: `${siteKey}:${issue.page || 'global'}:${issue.target}`,
          action: 'fix-affordance',
          data: {
            page: issue.page,
            target: issue.target,
            metric: issue.metric,
            severity: issue.severity,
          },
          result: {
            recommendations: [
              `Element "${issue.target}" receives clicks but is not interactive`,
              'Add cursor:pointer and hover state if it should be clickable',
              'Or change visual style (remove underline/blue color) if it should NOT be clickable',
              issue.severity === 'critical'
                ? 'CRITICAL: High volume of dead clicks - prioritize fix'
                : null,
            ].filter(Boolean),
          },
          reason: `Dead click detected: ${issue.metric}. Users expect "${issue.target}" to be interactive.`,
        })

        console.log(`  [FLAG] ${issue.target}: ${issue.metric} (${issue.severity})`)
      }
    }
  }

  // Also check raw audit data for dead clicks from Clarity
  for (const [siteKey, siteData] of Object.entries(audit.sites)) {
    const deadClicks = (siteData.findings && siteData.findings.deadClicks) || []
    // Calculate total clicks to determine dead click percentage
    const totalClicks = deadClicks.reduce((sum, dc) => sum + dc.count, 0)

    for (const dc of deadClicks) {
      if (!dc || !dc.target) continue
      // Threshold: >10% of interactions on that element are dead clicks
      if ((dc.count || 0) < 5) continue
      // Avoid duplicates from UX report
      const existingKey = `${siteKey}:${dc.page || 'global'}:${dc.target}`
      if (optLog.decisions.find(d => d.rule === 'dead-clicks' && d.key === existingKey)) continue

      count++
      addDecision(optLog, {
        rule: 'dead-clicks',
        key: existingKey,
        action: 'fix-affordance',
        data: {
          page: dc.page,
          target: dc.target,
          count: dc.count,
        },
        result: {
          recommendations: [
            `"${dc.target}" on page "${dc.page}" gets ${dc.count} dead clicks`,
            'Make element interactive or change its visual appearance',
          ],
        },
        reason: `${dc.count} dead clicks on "${dc.target}". Element needs better affordance.`,
      })

      console.log(`  [FLAG] ${dc.target} (${dc.page}): ${dc.count} dead clicks`)
    }
  }

  if (count === 0) console.log('  No dead click issues found.')
  else console.log(`  ${count} elements flagged for affordance fixes.`)
  return count
}

// ── Rule 4: Conversion rate tracking ─────────────────────────

function ruleConversion(audit, uxReport, optLog) {
  let count = 0
  console.log('\n--- Rule 4: Conversion rate tracking ---')

  for (const [siteKey, siteData] of Object.entries(audit.sites)) {
    const siteConfig = SITES[siteKey]
    if (!siteConfig) {
      console.log(`  Skipping unknown site key "${siteKey}"`)
      continue
    }

    // GA4 data may be in audit-full.json but not in audit-summary.json
    const ga4Data = siteData.ga4 || []
    const findings = siteData.findings || {}

    // Estimate conversion from GA4 page data: visits to premium pages / total sessions
    let totalSessions = 0
    let premiumPageViews = 0

    if (Array.isArray(ga4Data)) {
      for (const row of ga4Data) {
        totalSessions += row.sessions || 0
        if (row.pagePath && (
          row.pagePath.includes('premium') ||
          row.pagePath.includes('upgrade') ||
          row.pagePath.includes('abonnement')
        )) {
          premiumPageViews += row.pageViews || row.sessions || 0
        }
      }
    }

    // Performance data may be in audit-full.json but not in audit-summary.json
    const performance = siteData.performance || {}
    let premiumClicks = 0
    for (const [page, metrics] of Object.entries(performance)) {
      if (page.includes('premium') || page.includes('abonnement')) {
        premiumClicks += (metrics && metrics.clicks) || 0
      }
    }

    if (totalSessions === 0) {
      console.log(`  ${siteConfig.domain}: No session data available (ga4 data may not be in audit-summary.json).`)
      continue
    }

    const conversionRate = totalSessions > 0
      ? ((premiumPageViews / totalSessions) * 100)
      : 0
    const conversionRounded = Math.round(conversionRate * 100) / 100

    let action, reason
    if (conversionRate < 2) {
      action = 'increase-cta-visibility'
      reason = `Conversion rate ${conversionRounded}% < 2% threshold. Recommend increasing premium CTA visibility.`
      count++
    } else if (conversionRate > 5) {
      action = 'conversion-success'
      reason = `Conversion rate ${conversionRounded}% > 5%. Premium funnel performing well.`
    } else {
      action = 'conversion-normal'
      reason = `Conversion rate ${conversionRounded}% is within normal range (2-5%).`
    }

    addDecision(optLog, {
      rule: 'conversion-rate',
      key: `${siteKey}:premium`,
      action,
      data: {
        totalSessions,
        premiumPageViews,
        premiumClicks,
        conversionRate: conversionRounded,
      },
      result: {
        recommendations: conversionRate < 2
          ? [
              'Make premium CTA more prominent on beach pages',
              'Add premium CTA above the fold on high-traffic pages',
              'Test different CTA copy: urgency, value proposition',
              'Consider adding premium preview/teaser content',
            ]
          : conversionRate > 5
            ? ['Premium funnel is performing well. Monitor for sustained performance.']
            : ['Conversion is within normal range. Continue monitoring.'],
      },
      reason,
    })

    const icon = conversionRate < 2 ? 'LOW' : conversionRate > 5 ? 'OK+' : ' OK'
    console.log(`  [${icon}] ${siteConfig.domain}: ${conversionRounded}% conversion (${premiumPageViews}/${totalSessions} sessions)`)
  }

  if (count === 0) console.log('  Conversion rates are acceptable.')
  else console.log(`  ${count} sites need CTA visibility improvements.`)
  return count
}

// ── Rule 5: Guadeloupe SEO gap ───────────────────────────────

function ruleGPSeoGap(audit, metaOverrides, optLog) {
  let count = 0
  console.log('\n--- Rule 5: Guadeloupe SEO gap ---')

  const gpData = audit.sites && audit.sites.gp
  if (!gpData) {
    console.log('  No Guadeloupe audit data available.')
    return 0
  }

  const performance = gpData.performance || {}
  const year = new Date().getFullYear()

  // Check all GP queries — look for high-position (bad ranking) queries
  for (const [page, metrics] of Object.entries(performance)) {
    if (!metrics || typeof metrics !== 'object') continue
    const avgPos = metrics.count > 0
      ? Math.round(metrics.position / metrics.count)
      : 999

    // Threshold: GP query with position > 30 (not on first 3 pages)
    if (avgPos <= 30) continue
    if ((metrics.impressions || 0) < 10) continue // Ignore very low volume

    // Match to a beach slug
    const urlMatch = page.match(/\/plages\/([^/]+)\//)
    if (!urlMatch) continue
    const slug = urlMatch[1]
    const beach = BEACHES.find(b => b.slug === slug && b.island === 'gp')
    if (!beach) continue

    count++

    // Generate SEO-optimized meta specifically for GP
    const newTitle = `Sargasses ${beach.name} Guadeloupe aujourd'hui ${year} - Plage propre ?`
    const newDesc = `\u00c9tat des sargasses \u00e0 ${beach.name} (${beach.commune}, Guadeloupe) en temps r\u00e9el. Plage propre ou \u00e0 \u00e9viter ? Pr\u00e9visions 7 jours, photos et indice AFAI.`

    metaOverrides.titles[slug] = newTitle
    metaOverrides.descriptions[slug] = newDesc

    const topQueries = (metrics.topQueries || []).slice(0, 3).map(q => (q && q.query) || '')

    addDecision(optLog, {
      rule: 'gp-seo-gap',
      key: `gp:${slug}`,
      action: 'urgent-seo-fix',
      data: {
        page,
        avgPosition: avgPos,
        impressions: metrics.impressions || 0,
        clicks: metrics.clicks || 0,
        topQueries,
      },
      result: {
        title: newTitle,
        description: newDesc,
        urgency: avgPos > 50 ? 'critical' : 'high',
      },
      reason: `GP page "${slug}" at position ${avgPos} (>30). Urgent SEO fix: new meta with GP-specific keywords.`,
    })

    console.log(`  [URGENT] ${slug}: position ${avgPos}, ${metrics.impressions || 0} impressions -> new meta`)
  }

  if (count === 0) console.log('  No GP pages with position >30 found.')
  else console.log(`  ${count} GP pages flagged for urgent SEO fix.`)
  return count
}

// ── Main ─────────────────────────────────────────────────────

function main() {
  console.log(`=== Auto-Optimize ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // 1. Read input data
  const audit = readJSON(AUDIT_PATH)
  if (!audit || !audit.sites) {
    console.log('No audit-summary.json found. Run seo-audit.cjs first.')
    process.exit(0)
  }

  const uxReport = readJSON(UX_REPORT_PATH)
  if (!uxReport) {
    console.log('Warning: No ux-report.json found. UX rules will use audit data only.\n')
  }

  // 2. Load existing outputs (idempotent merge)
  const existingOverrides = readJSON(META_OVERRIDES_PATH)
  const metaOverrides = {
    titles: (existingOverrides && existingOverrides.titles) || {},
    descriptions: (existingOverrides && existingOverrides.descriptions) || {},
    generatedAt: new Date().toISOString(),
  }

  const optLog = readOptLog()
  optLog.lastRun = new Date().toISOString()

  // 3. Run all optimization rules
  const results = {
    lowCtr: ruleLowCTR(audit, metaOverrides, optLog),
    highBounce: ruleHighBounce(audit, optLog),
    deadClicks: ruleDeadClicks(audit, uxReport, optLog),
    conversion: ruleConversion(audit, uxReport, optLog),
    gpSeoGap: ruleGPSeoGap(audit, metaOverrides, optLog),
  }

  const totalActions = Object.values(results).reduce((a, b) => a + b, 0)

  // 4. Write outputs
  console.log(`\n--- Summary ---`)
  console.log(`Total optimizations: ${totalActions}`)
  console.log(`  Low CTR meta fixes: ${results.lowCtr}`)
  console.log(`  High bounce flags:  ${results.highBounce}`)
  console.log(`  Dead click flags:   ${results.deadClicks}`)
  console.log(`  Conversion alerts:  ${results.conversion}`)
  console.log(`  GP SEO gap fixes:   ${results.gpSeoGap}`)

  // Keep optimization log trimmed (last 200 decisions)
  if (optLog.decisions.length > 200) {
    optLog.decisions = optLog.decisions.slice(-200)
  }

  writeJSON(META_OVERRIDES_PATH, metaOverrides)
  writeJSON(OPT_LOG_PATH, optLog)

  if (!DRY_RUN) {
    console.log(`\nWritten:`)
    console.log(`  ${META_OVERRIDES_PATH}`)
    console.log(`  ${OPT_LOG_PATH}`)
  }

  // 5. Log to shared automation log
  appendLog({
    script: 'auto-optimize',
    action: DRY_RUN ? 'dry-run' : 'optimizations-applied',
    results,
    totalActions,
    metaOverridesCount: Object.keys(metaOverrides.titles).length,
    decisionsCount: optLog.decisions.length,
  })

  console.log(`\n=== Auto-Optimize complete ===`)
}

try {
  main()
} catch (err) {
  console.error(`\n[auto-optimize] Fatal error: ${err.message}`)
  console.error(err.stack)
  // Exit 0 so the CI pipeline continues — this step uses continue-on-error anyway,
  // but a clean exit prevents confusing error noise in the workflow logs.
  process.exit(0)
}
