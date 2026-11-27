// Validate the file Wrangler uses to exclude private files from static Worker assets.
'use strict'

const fs = require('fs')
const path = require('path')

const REQUIRED_ASSET_IGNORE_RULES = Object.freeze([
  '**/*.php',
  '**/*.php.*',
  '**/.env*',
  '**/.htaccess',
  '**/.htpasswd',
  '**/_private/',
])

function assertWorkerAssetIgnore(assetDirectory, label = assetDirectory) {
  const ignorePath = path.join(assetDirectory, '.assetsignore')
  if (!fs.existsSync(ignorePath)) {
    throw new Error(`[${label}] .assetsignore missing at Worker assets root: ${ignorePath}`)
  }

  const content = fs.readFileSync(ignorePath, 'utf8')
  const rules = new Set(content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')))
  const missing = REQUIRED_ASSET_IGNORE_RULES.filter(rule => !rules.has(rule))
  if (missing.length) {
    throw new Error(`[${label}] .assetsignore missing required rules: ${missing.join(', ')}`)
  }

  console.log(`✓ [${label}] .assetsignore present with all ${REQUIRED_ASSET_IGNORE_RULES.length} required exclusion rules`)
  return { ignorePath, rules: [...rules] }
}

module.exports = { REQUIRED_ASSET_IGNORE_RULES, assertWorkerAssetIgnore }
