#!/usr/bin/env node
/**
 * List all GA4 properties + streams accessible by the service account.
 * Confirms whether a "ghost" property with the old typo'd measurement ID
 * (G-V83JGMDZ2Y) still exists anywhere we have access to.
 */
const https = require('https')
const { GoogleAuth } = require('google-auth-library')

async function req(path, token) {
  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'analyticsadmin.googleapis.com',
      path, headers: { Authorization: `Bearer ${token}` },
    }, res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(b))
    })
    r.on('error', e => resolve(JSON.stringify({ error: e.message })))
    r.end()
  })
}

async function main() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
  const client = await auth.getClient()
  const token = (await client.getAccessToken()).token

  // 1) List accounts
  const accountsRaw = await req('/v1beta/accounts', token)
  let accounts
  try { accounts = JSON.parse(accountsRaw).accounts || [] }
  catch { console.log('accounts raw:', accountsRaw); return }
  console.log(`Accounts accessible: ${accounts.length}`)

  for (const acc of accounts) {
    console.log(`\n=== ${acc.displayName} (${acc.name}) ===`)
    const propsRaw = await req(`/v1beta/properties?filter=parent:${acc.name}`, token)
    let props
    try { props = JSON.parse(propsRaw).properties || [] }
    catch { console.log('  props raw:', propsRaw); continue }
    console.log(`  Properties: ${props.length}`)
    for (const p of props) {
      console.log(`  • ${p.displayName} (${p.name})`)
      const streamsRaw = await req(`/v1beta/${p.name}/dataStreams`, token)
      try {
        const s = JSON.parse(streamsRaw).dataStreams || []
        for (const st of s) {
          const mid = st.webStreamData?.measurementId || '—'
          const url = st.webStreamData?.defaultUri || '—'
          console.log(`      ${st.displayName} | ${mid} | ${url}`)
        }
      } catch {
        console.log('    streams raw:', streamsRaw.slice(0, 200))
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
