#!/usr/bin/env node
/**
 * Check Email Status — polls Apps Script for email stats
 *
 * - Fetches open/click/bounce rates from ?action=email_stats
 * - Auto-updates bounced-emails.json with newly bounced addresses
 * - Logs summary to console for pipeline visibility
 *
 * Runs 1x/day (10h UTC build) in the pipeline.
 *
 * Usage: node scripts/automation/check-email-status.cjs
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { emailHash } = require('./lib/email-hash.cjs')

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}

function saveJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'))
      https.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1)
        }
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => {
          try { resolve(JSON.parse(d)) } catch { resolve(null) }
        })
      }).on('error', reject)
    }
    get(url)
  })
}

async function main() {
  console.log('=== Email Status Check ===')

  try {
    const stats = await fetchJSON(`${WEBHOOK_URL}?action=email_stats`)
    if (!stats || stats.error) {
      console.log('Could not fetch email stats:', stats?.error || 'no response')
      return
    }

    const { counts, rates, bounced_emails } = stats

    console.log(`\nEmail funnel:`)
    console.log(`  Sent:      ${counts.sent}`)
    console.log(`  Delivered: ${counts.delivered} (${rates.delivery}%)`)
    console.log(`  Opened:    ${counts.opened} (${rates.open}%)`)
    console.log(`  Clicked:   ${counts.clicked} (${rates.click}%)`)
    console.log(`  Bounced:   ${counts.bounced} (${rates.bounce}%)`)
    if (counts.complained) console.log(`  Complained: ${counts.complained}`)

    // Auto-update bounced-emails.json with new bounces
    // RGPD : le fichier ne stocke que des hashes — entrées legacy ('@') hashées à la lecture
    if (bounced_emails && bounced_emails.length > 0) {
      const raw = loadJSON(BOUNCED_PATH, [])
      const existing = new Set(raw.map(e => String(e).includes('@') ? emailHash(e) : e))
      const wasLegacy = existing.size !== new Set(raw).size || raw.some(e => String(e).includes('@'))
      let added = 0
      for (const email of bounced_emails) {
        const h = email && emailHash(email)
        if (h && !existing.has(h)) {
          existing.add(h)
          added++
        }
      }
      if (added > 0 || wasLegacy) {
        saveJSON(BOUNCED_PATH, [...existing])
        if (added > 0) console.log(`\n+ ${added} new bounced email(s) added to blocklist`)
      }
    }

  } catch (e) {
    console.log('Error checking email status:', e.message)
  }

  console.log('\nDone.')
}

main().catch(e => console.error(e))
