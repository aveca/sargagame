'use strict'

const fs = require('fs')
const path = require('path')
const { buildPage } = require('./premium-page.cjs')
const { buildOffersPage } = require('./offers-page.cjs')
const { readObservationIso } = require('./home-first.cjs')
const { offerLang } = require('./commercial-catalog.cjs')

function writeCommercialPages(outDir, region, root) {
  const iso = readObservationIso(root || path.resolve(__dirname, '../..'))
  const premiumRegion = Object.assign({}, region, { primaryLang: offerLang(region) })
  fs.mkdirSync(path.join(outDir, 'premium'), { recursive: true })
  fs.mkdirSync(path.join(outDir, 'offres'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'premium', 'index.html'), buildPage(premiumRegion), 'utf8')
  fs.writeFileSync(path.join(outDir, 'offres', 'index.html'), buildOffersPage(region, iso), 'utf8')
}

module.exports = { writeCommercialPages }
