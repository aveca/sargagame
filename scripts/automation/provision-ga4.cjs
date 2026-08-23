#!/usr/bin/env node
/**
 * provision-ga4.cjs — Crée les propriétés GA4 + web data streams des nouvelles
 * régions via la GA4 Admin API, si le service account a des droits niveau compte.
 *
 * Pour chaque région (défaut puntacana florida rivieramaya) :
 *   1. accounts.list → premier compte accessible (ou GA4_ACCOUNT env "accounts/XXXX")
 *   2. properties.create (displayName "Sargassum <Name>", timezone/currency région)
 *   3. dataStreams.create (web, https://<domain>) → measurementId G-XXXX
 *   4. imprime le mapping à reporter dans regions/<id>.json (ga4Id)
 *
 * Idempotent : réutilise propriété/stream existants (match displayName/defaultUri).
 * Échec droits → log clair + exit 2 (fallback humain : créer via UI).
 *
 * Env requis : GOOGLE_SERVICE_ACCOUNT_JSON. Optionnel : GA4_ACCOUNT.
 */
const { google } = require('googleapis')
const { getRegion } = require('../../regions/index.cjs')

const TARGETS = process.argv.slice(2).filter(a => !a.startsWith('-'))
const IDS = TARGETS.length ? TARGETS : ['puntacana', 'florida', 'rivieramaya']

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) { console.error('✗ GOOGLE_SERVICE_ACCOUNT_JSON manquant'); process.exit(1) }
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/analytics.edit'],
  })
  const admin = google.analyticsadmin({ version: 'v1beta', auth })

  let account = process.env.GA4_ACCOUNT || ''
  if (!account) {
    const res = await admin.accounts.list({})
    const accounts = res.data.accounts || []
    if (!accounts.length) {
      console.error('✗ Le service account ne voit aucun compte GA4 (droits niveau propriété seulement).')
      console.error('  Fallback : ajouter le SA comme Editor au niveau COMPTE dans GA4 Admin, ou créer les propriétés à la main.')
      process.exit(2)
    }
    account = accounts[0].name
    console.log(`Compte GA4 : ${account} (${accounts[0].displayName})`)
  }

  const results = {}
  const existing = await admin.properties.list({ filter: `parent:${account}` })
  const props = existing.data.properties || []

  for (const id of IDS) {
    const region = getRegion(id)
    const displayName = `Sargassum ${region.name}`
    console.log(`\n=== ${id} — ${displayName} ===`)

    let prop = props.find(p => p.displayName === displayName)
    if (prop) {
      console.log(`  propriété existante: ${prop.name}`)
    } else {
      const created = await admin.properties.create({
        requestBody: {
          parent: account,
          displayName,
          timeZone: region.timezone || 'America/New_York',
          currencyCode: region.currency || 'USD',
          industryCategory: 'TRAVEL',
        },
      })
      prop = created.data
      console.log(`  ✅ propriété créée: ${prop.name}`)
    }

    const streams = await admin.properties.dataStreams.list({ parent: prop.name })
    let stream = (streams.data.dataStreams || []).find(s => s.webStreamData && s.webStreamData.defaultUri.includes(region.domain))
    if (stream) {
      console.log(`  stream existant: ${stream.webStreamData.measurementId}`)
    } else {
      const created = await admin.properties.dataStreams.create({
        parent: prop.name,
        requestBody: {
          type: 'WEB_DATA_STREAM',
          displayName: region.domain,
          webStreamData: { defaultUri: `https://${region.domain}` },
        },
      })
      stream = created.data
      console.log(`  ✅ stream créé: ${stream.webStreamData.measurementId}`)
    }
    results[id] = stream.webStreamData.measurementId
  }

  console.log('\n=== MAPPING regions/<id>.json → ga4Id ===')
  console.log(JSON.stringify(results, null, 2))
}

main().catch(e => {
  console.error('✗', e?.errors?.[0]?.message || e.message)
  process.exit(1)
})
