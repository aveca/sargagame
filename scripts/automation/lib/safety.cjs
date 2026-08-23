/**
 * Safety utilities for SEO automation.
 * Dry-run mode, change limits, .htaccess validation, audit logging.
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

const LIMITS = {
  MAX_REDIRECTS_PER_RUN: 10,
  MAX_META_CHANGES_PER_RUN: 5,
  MAX_ENRICHMENTS_PER_RUN: 5,
  MAX_NEW_PAGES_PER_RUN: 3,
  MAX_URL_SUBMISSIONS_PER_DAY: 200,
}

const LOG_PATH = resolve(__dirname, '..', 'data', 'automation-log.json')

function readLog() {
  if (!existsSync(LOG_PATH)) return { runs: [] }
  try {
    return JSON.parse(readFileSync(LOG_PATH, 'utf-8'))
  } catch {
    return { runs: [] }
  }
}

function appendLog(entry) {
  const log = readLog()
  log.runs.push({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    ...entry,
  })
  // Keep last 100 runs
  if (log.runs.length > 100) log.runs = log.runs.slice(-100)
  if (!DRY_RUN) {
    writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))
  }
  return log
}

/**
 * Validate .htaccess syntax: ensure RewriteRule lines have correct format.
 * Returns array of error strings (empty = valid).
 */
function validateHtaccess(content) {
  const errors = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('RewriteRule')) {
      // Basic format check: RewriteRule <pattern> <target> [flags]
      const parts = line.split(/\s+/)
      if (parts.length < 3) {
        errors.push(`Line ${i + 1}: RewriteRule missing target: "${line}"`)
      }
      // Check for common regex issues
      const pattern = parts[1]
      try {
        new RegExp(pattern)
      } catch (e) {
        errors.push(`Line ${i + 1}: Invalid regex in RewriteRule: "${pattern}" — ${e.message}`)
      }
    }
  }
  return errors
}

/**
 * Parse .htaccess to extract existing redirect rules.
 * Returns array of { pattern, target, flags, line }.
 */
function parseHtaccessRedirects(content) {
  const rules = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('RewriteRule') && line.includes('[R=301')) {
      const match = line.match(/^RewriteRule\s+(\S+)\s+(\S+)\s+(\[.*\])/)
      if (match) {
        rules.push({ pattern: match[1], target: match[2], flags: match[3], line: i + 1 })
      }
    }
  }
  return rules
}

/**
 * Check if a URL path is already covered by an existing redirect rule.
 */
function isPathRedirected(htaccessContent, urlPath) {
  const rules = parseHtaccessRedirects(htaccessContent)
  const cleanPath = urlPath.replace(/^\//, '')
  for (const rule of rules) {
    try {
      const re = new RegExp(rule.pattern)
      if (re.test(cleanPath)) return true
    } catch {
      // Skip invalid patterns
    }
  }
  return false
}

/**
 * Simple Levenshtein distance for fuzzy slug matching.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    }
  }
  return d[m][n]
}

/**
 * Compute similarity score (0-1) between two strings.
 */
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

module.exports = {
  DRY_RUN,
  LIMITS,
  readLog,
  appendLog,
  validateHtaccess,
  parseHtaccessRedirects,
  isPathRedirected,
  levenshtein,
  similarity,
}
