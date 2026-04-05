#!/usr/bin/env node
/**
 * Download real beach photos from Google Places API (New).
 * Uses Text Search to find each beach, then downloads the first photo.
 * Output: public/beaches/gp-photo-{beachId}.jpg
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const API_KEY = 'REDACTED_GOOGLE_KEY'
const BEACHES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/beaches-list.json'), 'utf8'))
const OUT_DIR = path.resolve(__dirname, '../public/beaches')

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

async function getPlacePhoto(beachName, commune, island) {
  const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
  const query = encodeURIComponent(`${beachName} ${commune} ${islandName} plage`)

  // Step 1: Find Place via Text Search
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${API_KEY}&language=fr`
  const searchResult = await fetchJSON(searchUrl)

  if (!searchResult.results || searchResult.results.length === 0) return null

  const place = searchResult.results[0]
  if (!place.photos || place.photos.length === 0) return null

  // Step 2: Get photo URL (max width 800px for good quality without being too heavy)
  const photoRef = place.photos[0].photo_reference
  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${photoRef}&key=${API_KEY}`

  return photoUrl
}

async function main() {
  console.log(`Downloading Google Places photos for ${BEACHES.length} beaches...`)
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  let ok = 0, fail = 0, skip = 0
  for (const beach of BEACHES) {
    const dest = path.join(OUT_DIR, `gplace-${beach.id}.jpg`)

    // Skip if already downloaded
    if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) {
      skip++
      console.log(`  skip ${beach.id} (exists)`)
      continue
    }

    try {
      const photoUrl = await getPlacePhoto(beach.name, beach.commune, beach.island)
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
