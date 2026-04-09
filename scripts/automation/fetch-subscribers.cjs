#!/usr/bin/env node
/**
 * Fetch Subscribers — reads email list directly from Google Sheet
 *
 * Uses the service account (GOOGLE_SERVICE_ACCOUNT_JSON) to read
 * the 'emails' sheet (columns: date, email, island, source).
 * Saves to data/subscribers.json for welcome-email.cjs.
 *
 * The service account must have read access to the sheet.
 * Share the sheet with the service account email address.
 *
 * Usage: node scripts/automation/fetch-subscribers.cjs
 */
const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')

const SHEET_ID = '1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ'
const SHEET_RANGE = 'emails!A:E' // date, email, island, source, unsubscribed
const OUT_PATH = path.join(__dirname, 'data', 'subscribers.json')

async function main() {
  console.log('=== Fetch Subscribers (Google Sheets) ===')

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    console.log('GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping.')
    return
  }

  let auth
  try {
    const key = JSON.parse(raw)
    auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  } catch (e) {
    console.log('Failed to parse service account:', e.message)
    return
  }

  const sheets = google.sheets({ version: 'v4', auth })

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_RANGE,
    })

    const rows = res.data.values || []
    if (rows.length <= 1) {
      console.log('No subscribers found (empty sheet).')
      return
    }

    // Skip header row, map to objects, exclude unsubscribed
    const subscribers = rows.slice(1)
      .filter(r => r[1] && r[1].includes('@')) // must have valid email
      .filter(r => (r[4] || '').toString().toLowerCase() !== 'yes') // skip unsubscribed
      .map(r => ({
        date: r[0] || '',
        email: r[1].trim().toLowerCase(),
        island: (r[2] || 'MQ').toUpperCase(),
        source: r[3] || 'unknown',
      }))

    // Filter out bounced emails
    const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
    let bounced = new Set()
    try { bounced = new Set(JSON.parse(fs.readFileSync(BOUNCED_PATH, 'utf-8'))) } catch {}
    const filtered = subscribers.filter(s => !bounced.has(s.email))
    if (bounced.size) console.log(`Filtered ${subscribers.length - filtered.length} bounced emails`)

    // Deduplicate by email (keep latest)
    const seen = new Map()
    for (const s of filtered) seen.set(s.email, s)
    const unique = [...seen.values()]

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(unique, null, 2))
    console.log(`Saved ${unique.length} unique subscribers (${rows.length - 1} total rows)`)

  } catch (e) {
    console.log(`Error reading sheet: ${e.message}`)
    if (e.message.includes('not found') || e.message.includes('403')) {
      console.log(`Share the sheet with the service account email to grant access.`)
    }
  }
}

main()
