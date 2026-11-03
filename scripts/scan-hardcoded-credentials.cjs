#!/usr/bin/env node
"use strict"

/**
 * Fail-closed scan for hardcoded credentials.
 *
 * Motivation (mission P0.67 section 1): the deployed sg-payments Worker was
 * found to carry a hardcoded bearer literal with an env-var fallback. That
 * class of defect is invisible to every existing guard in this repository:
 * the bundle budget checks size, the smoke checks the funnel, ux-smoke checks
 * the DOM, but nothing ever looked for a secret written in source.
 *
 * This scanner never reads, prints, stores or transmits a secret value. A
 * match reports the file, the line, the rule name and a masked preview only.
 *
 * Exit 0: no hardcoded credential found.
 * Exit 1: at least one hardcoded credential found (CI gate).
 */

const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.resolve(__dirname, "..")

// Directories never scanned (deps, build output, local tooling, VCS metadata).
const SKIP_DIRS = new Set([
  "node_modules", "dist", ".git", ".github", "coverage", ".nyc_output",
  ".wrangler", "playwright-report", "test-results", "backup",
])

// Extensions worth scanning.
const SCAN_EXT = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json", ".jsonc",
  ".php", ".sh", ".ps1", ".yml", ".yaml", ".toml", ".env", ".conf",
])

// Files whose purpose is to document or template a variable name.
const TEMPLATE_SUFFIX = [".example", ".template", ".sample", ".dist", ".tfvars.example"]

// Explicit allowlist of paths that legitimately contain credential-looking
// strings because they are fixtures, scanners or docs about credentials.
const ALLOWLIST = [
  "scripts/scan-hardcoded-credentials.cjs",
  "tests/unit/scan-hardcoded-credentials.test.cjs",
]

// A value is a placeholder, not a secret.
const PLACEHOLDER = /^(|x+|<[^>]*>|your[_-]?.*|change[_-]?me|redacted|placeholder|example|test|todo|none|null|undefined|true|false|\$\{[^}]*\}|\$\([^)]*\)|%[^%]*%|\*+|\.{3})$/i
const PLACEHOLDER_PREFIX = /^(test|demo|sample|stub|fake|dummy|sandbox|fixture)[._-]/i

// A real credential never carries URL or path syntax.
const NOT_A_CREDENTIAL = /[:/\\]|\s|^-+$/

/**
 * Classify every character of a source text as code or not-code.
 * Handles line comments, block comments, single/double quotes, templates and
 * escapes. A finding is only reported when its match starts in code, so
 * documentation examples and generated-code snippets never trip the gate.
 */
function classify(text) {
  const isCode = new Array(text.length).fill(true)
  const set = (from, to, value) => {
    for (let i = Math.max(0, from); i < Math.min(text.length, to); i += 1) isCode[i] = value
  }
  let i = 0
  let state = "code"
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (state === "code") {
      if (ch === "/" && next === "/") { state = "line"; set(i, i + 2, false); i += 2; continue }
      if (ch === "/" && next === "*") { state = "block"; set(i, i + 2, false); i += 2; continue }
      if (ch === '"') { state = "dquote"; i += 1; continue }
      if (ch === "'") { state = "squote"; i += 1; continue }
      if (ch === "`") { state = "template"; i += 1; continue }
      i += 1
      continue
    }
    if (state === "line") {
      if (ch === "\n") { state = "code"; i += 1; continue }
      set(i, i + 1, false); i += 1; continue
    }
    if (state === "block") {
      if (ch === "*" && next === "/") { set(i, i + 2, false); state = "code"; i += 2; continue }
      set(i, i + 1, false); i += 1; continue
    }
    // inside quote-ish states
    if (ch === "\\") { i += 2; continue }
    const closer = state === "dquote" ? '"' : state === "squote" ? "'" : "`"
    if (ch === closer) { state = "code"; i += 1; continue }
    i += 1
  }
  return isCode
}

const RULES = [
  {
    name: "bearer-secret-assignment",
    // A *_BEARER / *_TOKEN / *_KEY variable assigned a long literal.
    test: /(?:BEARER|_TOKEN|_API_KEY|APIKEY|API_KEY|_SECRET|_PASSWORD|_PAT)\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/i,
    group: 1,
  },
  {
    name: "authorization-bearer-literal",
    test: /Authorization\s*:\s*["'`]?\s*Bearer\s+([A-Za-z0-9._\-]{20,})/i,
    group: 1,
  },
  {
    name: "inline-bearer-literal",
    test: /["'`]Bearer\s+([A-Za-z0-9._\-]{20,})["'`]/i,
    group: 1,
  },
  {
    name: "stripe-live-secret",
    test: /(sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,})/,
    group: 1,
  },
  {
    name: "private-key-block",
    test: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    group: 0,
  },
]

function mask(value) {
  if (typeof value !== "string" || value.length === 0) return "<empty>"
  if (value.length <= 8) return "*".repeat(value.length)
  return value.slice(0, 4) + "*".repeat(Math.min(12, value.length - 8)) + value.slice(-4)
}

function walk(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, out)
      continue
    }
    if (!entry.isFile()) continue
    out.push(full)
  }
  return out
}

function shouldScan(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/")
  if (ALLOWLIST.some((entry) => rel === entry || rel.endsWith(entry))) return false
  // config.example.js / wrangler.template.jsonc etc.: the marker sits before
  // the final extension, so strip it before matching.
  const ext = path.extname(rel)
  const stem = ext ? rel.slice(0, -ext.length) : rel
  if (TEMPLATE_SUFFIX.some((suffix) => stem.endsWith(suffix))) return false
  // Reject skipped directories here too, not only in walk(), so a scanner
  // call can never be pointed at vendored or build output by accident.
  if (rel.split("/").some((segment) => SKIP_DIRS.has(segment))) return false
  return SCAN_EXT.has(path.extname(file).toLowerCase())
}

function scanFile(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/")
  let text
  try { text = fs.readFileSync(file, "utf8") } catch { return [] }
  const findings = []
  const isCode = classify(text)
  const lines = text.split(/\r?\n/)
  // True start offset of every line. split() consumes the optional CR, so
  // lines[i].length + 1 under-counts by one for each CRLF line and the
  // mapping drifts further out of true on every following line. Reading
  // isCode at a drifted index can classify a real secret as comment content
  // and silently drop it, so the offsets are taken from the text itself.
  const offsets = [0]
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") offsets.push(i + 1)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.length > 4000) continue
    const base = offsets[i]
    for (const rule of RULES) {
      rule.test.lastIndex = 0
      const match = rule.test.exec(line)
      if (!match) continue
      const raw = match[rule.group] === undefined ? match[0] : match[rule.group]
      const value = String(raw).trim()
      // Only what actually lives in executable code can be a leaked secret.
      if (isCode[base + match.index] === false) continue
      if (PLACEHOLDER.test(value)) continue
      if (PLACEHOLDER_PREFIX.test(value)) continue
      // rules with a capture group compare a value; marker rules (group 0)
      // match a structural pattern such as a PEM header that carries spaces.
      if (rule.group > 0 && NOT_A_CREDENTIAL.test(value)) continue
      const key = rel + ":" + (i + 1) + ":" + value
      if (findings.some((existing) => existing.key === key)) continue
      findings.push({
        key,
        file: rel,
        line: i + 1,
        rule: rule.name,
        preview: mask(value),
      })
    }
  }
  return findings
}

function main() {
  const findings = []
  const files = walk(ROOT, []).filter(shouldScan)
  for (const file of files) {
    findings.push(...scanFile(file))
  }

  const scanned = files.length
  if (findings.length === 0) {
    console.log(`CREDENTIAL_SCAN_OK scanned=${scanned} findings=0`)
    return 0
  }

  console.error(`CREDENTIAL_SCAN_FAIL scanned=${scanned} findings=${findings.length}`)
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line} ${finding.rule} ${finding.preview}`)
  }
  console.error("Hardcoded credential: use a managed secret binding and drop the literal.")
  return 1
}

if (require.main === module) {
  process.exit(main())
}

module.exports = { main, scanFile, mask, shouldScan, RULES, PLACEHOLDER, PLACEHOLDER_PREFIX, NOT_A_CREDENTIAL, classify, ALLOWLIST }
