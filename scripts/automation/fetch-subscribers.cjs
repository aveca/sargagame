#!/usr/bin/env node
/**
 * Fetch Subscribers — pulls email list from Apps Script webhook
 *
 * The Apps Script stores emails in a Google Sheet.
 * This script fetches them via GET ?action=subscribers and saves locally.
 *
 * Usage: node scripts/automation/fetch-subscribers.cjs
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec?action=subscribers'
const OUT_PATH = path.join(__dirname, 'data', 'subscribers.json')

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, { timeout: 15000 }, res => {
        // Follow redirects (Apps Script returns 302)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location)
        }
        let d = ''; res.on('data', c => d += c)
        res.on('end', () => {
          try { resolve(JSON.parse(d)) } catch { resolve(null) }
        })
      }).on('error', reject)
    }
    get(url)
  })
}

async function main() {
  console.log('=== Fetch Subscribers ===')

  try {
    const data = await fetchJSON(WEBHOOK_URL)
    if (data && Array.isArray(data.subscribers)) {
      fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
      fs.writeFileSync(OUT_PATH, JSON.stringify(data.subscribers, null, 2))
      console.log(`Saved ${data.subscribers.length} subscribers to ${OUT_PATH}`)
    } else {
      console.log('Apps Script did not return subscribers array.')
      console.log('To enable: add action=subscribers handling in doGet()')
      console.log('Response:', JSON.stringify(data)?.substring(0, 200))
    }
  } catch (e) {
    console.log(`Error fetching subscribers: ${e.message}`)
  }
}

main()
