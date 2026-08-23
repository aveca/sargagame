#!/usr/bin/env node
/**
 * Pre-generate satellite thumbnails for all beaches.
 * Downloads Esri World Imagery exports and saves them as static JPGs.
 * Run: node scripts/generate-thumbnails.cjs
 *
 * Output: public/beaches/sat-{beachId}.jpg (280x280)
 * These are served as static files — no API call needed at runtime.
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const BEACHES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/beaches-list.json'), 'utf8'))
const OUT_DIR = path.resolve(__dirname, '../public/beaches')
const SIZE = 280
const PADDING = 0.006

function satUrl(lat, lng) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${lng-PADDING},${lat-PADDING},${lng+PADDING},${lat+PADDING}&bboxSR=4326&size=${SIZE},${SIZE}&imageSR=4326&format=jpg&f=image`
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { console.log('  skip (exists):', path.basename(dest)); return resolve() }
    const file = fs.createWriteStream(dest)
    https.get(url, res => {
      if (res.statusCode !== 200) { fs.unlinkSync(dest); return reject(new Error(`HTTP ${res.statusCode}`)) }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', e => { fs.unlinkSync(dest); reject(e) })
  })
}

async function main() {
  console.log(`Generating ${BEACHES.length} satellite thumbnails...`)
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  let ok = 0, fail = 0
  for (const beach of BEACHES) {
    const dest = path.join(OUT_DIR, `sat-${beach.id}.jpg`)
    const url = satUrl(beach.lat, beach.lng)
    try {
      await download(url, dest)
      ok++
      console.log(`  ✓ ${beach.id} (${beach.name})`)
    } catch (e) {
      fail++
      console.log(`  ✗ ${beach.id}: ${e.message}`)
    }
    // Rate limit: 200ms between requests
    await new Promise(r => setTimeout(r, 200))
  }
  console.log(`\nDone: ${ok} OK, ${fail} failed`)
}

main().catch(console.error)
