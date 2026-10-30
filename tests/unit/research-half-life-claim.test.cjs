'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const research = fs.readFileSync(path.join(ROOT, 'public', 'research', 'index.html'), 'utf8')

assert.equal(research.includes('3.5-day</b> half-life'), false,
  'the obsolete 3.5-day half-life claim must not return')
assert.ok(research.includes('For floating mats, the model uses a <b>5-day</b> persistence half-life'),
  'the five-day half-life must be scoped to floating mats')
assert.ok(research.includes('provisional persistence prior'),
  'beached material must remain explicitly provisional')
assert.ok(research.includes('NOAA/AOML ERDDAP'),
  'research must identify the verified NOAA/AOML distribution source')
assert.ok(research.includes('USF Optical Oceanography Laboratory'),
  'research must identify the source laboratory')
assert.doesNotMatch(research, /Sentinel-3 OLCI|Copernicus Marine|4×.{0,8}day/i,
  'research must not claim an unverified sensor or four-times-daily AFAI feed')

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
