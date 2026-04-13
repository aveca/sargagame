#!/usr/bin/env node
/**
 * Download beach photos from Google Places API.
 * Text Search + locationbias (5km radius) so lesser-known beaches don't collide
 * on a generic POI photo. Previous version hit 5 binary-duplicate pairs for
 * beaches with weak name recognition (e.g. Pointe Fort Caravelle vs Anse des Galets).
 *
 * Usage:
 *   GOOGLE_PLACES_KEY=... node scripts/download-google-photos.cjs
 *   GOOGLE_PLACES_KEY=... node scripts/download-google-photos.cjs --only=mq066,mq067 --force
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const API_KEY = process.env.GOOGLE_PLACES_KEY || 'REDACTED_GOOGLE_KEY'
const BEACHES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/beaches-list.json'), 'utf8'))
const OUT_DIR = path.resolve(__dirname, '../public/beaches')

const ARGS = process.argv.slice(2)
const ONLY = (ARGS.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean)
const FORCE = ARGS.includes('--force')

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch(e) { reject(new Error('JSON parse: ' + data.substring(0,200))) }
      })
    }).on('error', reject)
  })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

async function getPlacePhoto(beach) {
  const islandName = beach.island === 'mq' ? 'Martinique' : 'Guadeloupe'

  // Primary: nearbysearch with hard 300m radius — prevents collision for clustered
  // beaches like the Schoelcher trio (mq024/mq025/mq026 within 1km). Textsearch's
  // locationbias is only a hint and returns same POI for all 3.
  const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${beach.lat},${beach.lng}&radius=300&keyword=${encodeURIComponent(beach.name)}&key=${API_KEY}&language=fr`
  let result = await fetchJSON(nearbyUrl)
  let withPhotos = (result.results || []).filter(r => r.photos && r.photos.length)

  // Fallback: textsearch with 5km locationbias — for beaches where Google's POI is
  // outside the 300m radius (e.g. POI registered inland from the coast coords).
  if (withPhotos.length === 0) {
    const query = encodeURIComponent(`${beach.name} ${beach.commune} ${islandName} plage`)
    const bias = `circle:5000@${beach.lat},${beach.lng}`
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&locationbias=${encodeURIComponent(bias)}&key=${API_KEY}&language=fr`
    result = await fetchJSON(searchUrl)
    withPhotos = (result.results || []).filter(r => r.photos && r.photos.length)
  }

  if (withPhotos.length === 0) return null

  const photoRef = withPhotos[0].photos[0].photo_reference
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${photoRef}&key=${API_KEY}`
}

async function main() {
  const targets = ONLY.length ? BEACHES.filter(b => ONLY.includes(b.id)) : BEACHES
  console.log(`Downloading Google Places photos for ${targets.length} beaches${ONLY.length ? ' (filtered)' : ''}${FORCE ? ' [FORCE]' : ''}...`)
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  let ok = 0, fail = 0, skip = 0
  for (const beach of targets) {
    const dest = path.join(OUT_DIR, `gplace-${beach.id}.jpg`)

    if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 5000) {
      skip++
      console.log(`  skip ${beach.id} (exists)`)
      continue
    }

    try {
      const photoUrl = await getPlacePhoto(beach)
      if (!photoUrl) {
        console.log(`  ✗ ${beach.id} — no photo found for "${beach.name}"`)
        fail++
        continue
      }

      await downloadFile(photoUrl, dest)
      const size = fs.statSync(dest).size
      if (size < 5000) {
        fs.unlinkSync(dest)
        console.log(`  ✗ ${beach.id} — photo too small (${size} bytes)`)
        fail++
      } else {
        ok++
        console.log(`  ✓ ${beach.id} (${beach.name}) — ${Math.round(size/1024)}KB`)
      }
    } catch(e) {
      fail++
      console.log(`  ✗ ${beach.id}: ${e.message}`)
    }

    // Rate limit: 200ms between requests
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\nDone: ${ok} downloaded, ${skip} skipped, ${fail} failed`)
}

main().catch(console.error)
