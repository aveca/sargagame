#!/usr/bin/env node
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')
const imageMap = JSON.parse(fs.readFileSync(path.join(root, 'public/data/beaches-images.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/ChasseHome.jsx'), 'utf8')

async function main() {
  const { resolveBeachPhoto } = await import(pathToFileURL(path.join(root, 'src/lib/beach-photo.js')).href)

  assert.equal(resolveBeachPhoto('fl001', { fl001: 'Miami Beach.jpg' }), '/beaches/Miami%20Beach.jpg')
  assert.equal(resolveBeachPhoto('gp004', { gp004: "Plage_d'Anse_à_la_Gourde.jpg" }), "/beaches/Plage_d'Anse_%C3%A0_la_Gourde.jpg")
  assert.equal(resolveBeachPhoto('missing001', imageMap), null, 'missing images must use the illustration fallback')
  assert.equal(resolveBeachPhoto('../fl001', imageMap), null, 'invalid ids are rejected')
  assert.equal(resolveBeachPhoto('fl001', { fl001: '../secret.jpg' }), null, 'path traversal is rejected')
  assert.equal(resolveBeachPhoto('fl001', { fl001: 'https://example.com/beach.jpg' }), null, 'external URLs are not injected')
  assert.equal(resolveBeachPhoto('fl001', { fl001: 'image.svg' }), null, 'unsupported files use the safe fallback')

  const entries = Object.keys(imageMap)
  assert.ok(entries.length >= 100, 'local beach photo catalogue should remain populated')
  for (const id of entries) {
    assert.match(id, /^[a-z0-9_-]+$/i)
    assert.ok(resolveBeachPhoto(id, imageMap), 'safe local image path expected for ' + id)
  }

  assert.match(source, /function useBeachPhoto\(beachId\)/, 'shared lazy photo-map hook is wired')
  assert.match(source, /loading="lazy" decoding="async"/, 'photos do not block first paint')
  assert.match(source, /onError=\{\(\)=>setFailedPhotoSrc\(photoSrc\)\}/, 'missing photo falls back to vector art')
  assert.match(source, /\.lc-illu-photo::after/, 'photo crop has readable contrast overlay')
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/, 'motion respects reduced-motion settings')

  console.log('OK — beach photo cards: safe URLs, lazy loading, fallback, readable overlay, reduced motion')
}
main().catch(err => { console.error(err); process.exit(1) })
