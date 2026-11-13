#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { getBuildRegion } = require('../regions/index.cjs')
const { validatePreparedBeachIndexes } = require('./lib/regional-beach-index-contract.cjs')

const region = getBuildRegion()
const outputDir = path.resolve(region.ftpDir)

try {
  const routes = validatePreparedBeachIndexes(region, outputDir)
  for (const item of routes) {
    console.log(`PASS ${region.id}: ${item.route} -> ${path.join(outputDir, ...`${item.route}index.html`.split('/').filter(Boolean))}`)
  }
  console.log(`REGIONAL_BEACH_INDEX_PACKAGE PASS (${region.id}, ${routes.length} localized index route(s))`)
} catch (error) {
  console.error(`REGIONAL_BEACH_INDEX_PACKAGE FAIL (${region.id}): ${error.message}`)
  process.exitCode = 1
}
