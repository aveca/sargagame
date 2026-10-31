'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const research = fs.readFileSync(path.join(ROOT, 'public', 'research', 'index.html'), 'utf8')
const frResearch = fs.readFileSync(path.join(ROOT, 'public', 'recherche', 'index.html'), 'utf8')
const esResearch = fs.readFileSync(path.join(ROOT, 'public', 'investigacion', 'index.html'), 'utf8')
const apiDocs = fs.readFileSync(path.join(ROOT, 'public', 'api', 'index.html'), 'utf8')
const regionalSeo = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'region-seo-pages.cjs'), 'utf8')

assert.equal(research.includes('3.5-day</b> half-life'), false,
  'the obsolete 3.5-day half-life claim must not return')
assert.ok(research.includes('For floating mats, the model uses a <b>5-day</b> persistence half-life'),
  'the five-day half-life must be scoped to floating mats')
assert.ok(research.includes('provisional persistence prior'),
  'beached material must remain explicitly provisional')

assert.ok(frResearch.includes('Pour les bancs flottants, le modèle utilise une <b>demi-vie de persistance de 5 jours</b>'),
  'French research must scope the five-day half-life to floating mats')
assert.ok(frResearch.includes('hypothèse provisoire de persistance'),
  'French research must keep beached-material persistence explicitly provisional')
assert.doesNotMatch(frResearch, /demi-vie <b>3,5/i,
  'French research must not publish the obsolete 3.5-day half-life')

assert.ok(esResearch.includes('Para los bancos flotantes, el modelo utiliza una <b>semivida de persistencia de 5 días</b>'),
  'Spanish research must scope the five-day half-life to floating mats')
assert.ok(esResearch.includes('hipótesis provisional de persistencia'),
  'Spanish research must keep beached-material persistence explicitly provisional')
assert.doesNotMatch(esResearch, /vida media <b>3,5/i,
  'Spanish research must not publish the obsolete 3.5-day half-life')
assert.ok(research.includes('NOAA/AOML ERDDAP'),
  'research must identify the verified NOAA/AOML distribution source')
assert.ok(research.includes('USF Optical Oceanography Laboratory'),
  'research must identify the source laboratory')
assert.doesNotMatch(research, /Sentinel-3 OLCI|Copernicus Marine|4×.{0,8}day/i,
  'research must not claim an unverified sensor or four-times-daily AFAI feed')
for (const [name, html] of [['French research', frResearch], ['Spanish research', esResearch]]) {
  assert.ok(html.includes('NOAA/AOML ERDDAP'), name + ' must identify the AFAI distribution source')
  assert.doesNotMatch(html, /Sentinel-3 OLCI|Copernicus Marine \/ ERDDAP|4×\/jour|4×\/día/i,
    name + ' must not claim an unsupported AFAI sensor or four-times-daily sampling')
}
assert.ok(apiDocs.includes('NOAA/AOML ERDDAP'), 'API docs must identify the AFAI source')
assert.ok(apiDocs.includes('erddapTimestamp'), 'API docs must distinguish observation time from publication time')
assert.doesNotMatch(apiDocs, /Sentinel-3 \/ MODIS \(Copernicus Marine\)|Mise à jour 4×\/jour · ERDDAP-live/i,
  'API docs must not claim an unsupported sensor or guaranteed four-times-daily observations')
assert.doesNotMatch(regionalSeo, /Copernicus\/NOAA AFAI|NOAA\/Copernicus imagery/i,
  'regional SEO copy must distinguish NOAA/AOML AFAI from Copernicus current inputs')

const widget = fs.readFileSync(path.join(ROOT, 'public', 'pro', 'widget-sargasses-hotel', 'index.html'), 'utf8')
assert.ok(widget.includes('NOAA/AOML ERDDAP'),
  'hotel widget landing must identify the verified distribution source')
assert.ok(widget.includes('Université de Floride du Sud'),
  'hotel widget landing must identify the source laboratory')
const widgetTitle = widget.split('<title>')[1]?.split('</title>')[0] || ''
const widgetDescription = widget.split('<meta name="description" content="')[1]?.split('"')[0] || ''
assert.doesNotMatch(widgetTitle, /en direct/i, 'widget title must not promise a live observation')
assert.doesNotMatch(widgetDescription, /en direct/i, 'widget description must not promise a live observation')
assert.match(widgetTitle + widgetDescription, /dernière observation disponible/i)
assert.doesNotMatch(widget, /Copernicus Marine|4× par jour|4×.{0,8}jour|quatre fois par jour/i,
  'hotel widget landing must not claim an unverified source or satellite cadence')

console.log('PASS: research and B2B widget source/cadence copy matches NOAA/AOML AFAI provenance')
