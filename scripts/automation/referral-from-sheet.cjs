#!/usr/bin/env node
/**
 * referral-from-sheet.cjs — Rapport parrainage DIRECTEMENT depuis la Google Sheet
 *
 * Remplace l'appel Apps Script `?action=referral` (bloqué, nécessite clasp push).
 * Lit la Sheet (emails, payments, subscription_events) en CSV via l'URL publique
 * de la Google Sheet, et agrège les signaux parrainage :
 *   - share (partage de lien)      → source = "sg_share" + has_referral
 *   - landing (arrivée via ?ref=)  → source = "referral_landing"
 *   - convert (filleul a payé)     → source = "referral_convert"
 *
 * Sortie : data/referral-report.json (même format que l'ancien script GAS).
 * READ-ONLY, zéro envoi.
 *
 * Usage : node scripts/automation/referral-from-sheet.cjs
 */
const fs = require('fs')
const path = require('path')

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ/gviz/tq?tqx=out:csv&sheet='
const OUT_PATH = path.join(__dirname, 'data', 'referral-report.json')

async function fetchCsv(sheet) {
  const url = SHEET_URL + sheet
  const res = await fetch(url, { redirect: 'follow' })
  if (res.status === 401) {
    console.log(`  ⚠️ Sheet ${sheet} requires auth (401) — skipping`)
    return null
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} pour sheet ${sheet}`)
  return res.text()
}

function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return []
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
  return lines.slice(1).map(line => {
    const vals = line.split('","').map(v => v.replace(/^"|"$/g, '').trim())
    const row = {}
    headers.forEach((h, i) => { row[h] = vals[i] || '' })
    return row
  })
}

async function main() {
  console.log('=== Referral Report (via Sheet direct) ===')

  // 1. Fetch all sheets
  const [emailsRaw, paymentsRaw, subsRaw] = await Promise.all([
    fetchCsv('emails'),
    fetchCsv('payments'),
    fetchCsv('subscription_events'),
  ])

  // Handle 401 - sheet not accessible
  if (!emailsRaw || !paymentsRaw || !subsRaw) {
    console.log('  ⚠️ One or more sheets not accessible — writing empty report')
    const emptyReport = { shares: 0, landings: 0, converts: 0, total_referrals: 0, generated_at: new Date().toISOString() }
    fs.writeFileSync(OUT_PATH, JSON.stringify(emptyReport, null, 2))
    return
  }

  const emails = parseCsv(emailsRaw)
  const payments = parseCsv(paymentsRaw)
  const subs = parseCsv(subsRaw)

  console.log(`emails: ${emails.length}, payments: ${payments.length}, events: ${subs.length}`)

  // 2. Find referral events in emails sheet
  // Structure: date, email, island, source, unsubscribed
  // We look for sources matching referral patterns
  const shares = emails.filter(e => {
    const src = (e.source || '').toLowerCase()
    return src.includes('referral_share') || src.includes('sg_referral')
  })
  const landings = emails.filter(e => {
    const src = (e.source || '').toLowerCase()
    return src.includes('referral_landing')
  })
  const converts = emails.filter(e => {
    const src = (e.source || '').toLowerCase()
    return src.includes('referral_convert')
  })

  // 3. Also check payment ref column for referral codes
  const paymentsWithRef = payments.filter(p => p.ref && p.ref.startsWith('ref_'))
  const paymentsWithRefPaid = paymentsWithRef.filter(p => p.status === 'paid')

  console.log(`\nshares (partages parrain)  : ${shares.length}`)
  console.log(`landings (filleuls arrivés): ${landings.length}`)
  console.log(`converts (filleuls payants): ${converts.length}`)
  console.log(`paiements avec ref code    : ${paymentsWithRef.length}`)

  // 4. Build top referees
  const refCounts = {}
  for (const s of [...shares, ...landings, ...converts]) {
    const code = s.ref || (s.email ? s.email.substring(0, 8) : 'unknown')
    if (!refCounts[code]) refCounts[code] = { code, shares: 0, landings: 0, converts: 0 }
    const src = (s.source || '').toLowerCase()
    if (src.includes('share')) refCounts[code].shares++
    if (src.includes('landing')) refCounts[code].landings++
    if (src.includes('convert')) refCounts[code].converts++
  }

  const top = Object.values(refCounts)
    .sort((a, b) => b.landings - a.landings || b.shares - a.shares)
    .slice(0, 10)

  const totals = {
    shares: shares.length,
    landings: landings.length,
    converts: converts.length,
  }

  const rates = {
    share_to_landing: totals.shares > 0
      ? ((totals.landings / totals.shares) * 100).toFixed(1)
      : '0.0',
    landing_to_convert: totals.landings > 0
      ? ((totals.converts / totals.landings) * 100).toFixed(1)
      : '0.0',
  }

  console.log(`\ntaux share→landing   : ${rates.share_to_landing}%`)
  console.log(`taux landing→convert : ${rates.landing_to_convert}%`)

  if (top.length) {
    console.log('\nTop parrains :')
    for (const t of top) {
      console.log(`  ${t.code} · ${t.shares} partage(s) · ${t.landings} landing(s) · ${t.converts} convert(s)`)
    }
  } else {
    console.log('\nAucun code parrain actif.')
  }

  // 5. Save report
  const report = {
    generatedAt: new Date().toISOString(),
    source: 'sheet-direct',
    window_days: 90,
    shares: totals.shares,
    landings: totals.landings,
    converts: totals.converts,
    rates,
    top,
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n')
  console.log(`\nSauvegardé → ${path.relative(process.cwd(), OUT_PATH)}`)
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
