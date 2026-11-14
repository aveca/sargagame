'use strict'

const fs = require('fs')
const path = require('path')
const { offerLang } = require('./commercial-catalog.cjs')

function localizeProPricing(out, region, root) {
  const lang = offerLang(region)
  if (lang !== 'en' && lang !== 'es') return { copied: false, lang }
  const src = path.join(root, 'public', 'pro', lang, 'pricing', 'index.html')
  const dest = path.join(out, 'pro', 'pricing', 'index.html')
  if (!fs.existsSync(src)) return { copied: false, lang }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  let html = fs.readFileSync(src, 'utf8')
  const canonical = 'https://' + region.domain + '/pro/pricing/'
  html = html.replace(/(<link rel="canonical" href=")[^"]+(")/, '$1' + canonical + '$2')
  html = html.replace(/(<meta property="og:url" content=")[^"]+(")/, '$1' + canonical + '$2')
  fs.writeFileSync(dest, html)
  return { copied: true, lang }
}

module.exports = { localizeProPricing }
