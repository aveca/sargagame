'use strict'

const { execFileSync } = require('node:child_process')

const ALLOWED_PAGES_ONLY_PATHS = Object.freeze([
  '.ai/release-pages-code-only.json',
  'scripts/lib/hotel-landing-fr.cjs',
  'scripts/lib/region-seo-pages.cjs',
  'scripts/automation/prepare-pages-code-only-payload.cjs',
  'src/ChasseHome.jsx',
  'src/lib/format-freshness.mjs',
  'tests/unit/b2b-hotel-form-contract.test.cjs',
  'tests/unit/bug-2026-015-offer-decoupling.test.cjs',
])

function validateChangedFiles(files) {
  const normalized = (files || []).map((file) => String(file).replace(/\\/g, '/')).filter(Boolean)
  const rejected = normalized.filter((file) => !ALLOWED_PAGES_ONLY_PATHS.includes(file))
  return { ok: normalized.length > 0 && rejected.length === 0, files: normalized, rejected }
}

function readChangedFiles(before, after) {
  if (!before || !after || /^0+$/.test(before)) {
    throw new Error('PAGES_CODE_ONLY_BEFORE/AFTER missing or invalid; refusing release')
  }
  const output = execFileSync('git', ['diff', '--name-only', before, after], { encoding: 'utf8' })
  return output.split(/\r?\n/).filter(Boolean)
}

if (require.main === module) {
  try {
    const result = validateChangedFiles(readChangedFiles(
      process.env.PAGES_CODE_ONLY_BEFORE,
      process.env.PAGES_CODE_ONLY_AFTER,
    ))
    if (!result.ok) {
      console.error('Refusing Pages-only release: changed files outside the allowlist:', result.rejected.join(', ') || '(empty diff)')
      process.exit(1)
    }
    console.log('Pages-only change scope verified:', result.files.join(', '))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = { ALLOWED_PAGES_ONLY_PATHS, validateChangedFiles, readChangedFiles }
