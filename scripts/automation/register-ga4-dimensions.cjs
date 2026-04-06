#!/usr/bin/env node
/**
 * Register GA4 Custom Dimensions for A/B tests.
 *
 * Creates event-scoped custom dimensions in GA4 so that A/B test
 * variant assignments (sent via gtag event params) appear in GA4 Explorations.
 *
 * Requires:
 *   GOOGLE_SERVICE_ACCOUNT_JSON env var (service account with GA4 edit access)
 *   GA4_PROPERTY_ID_MQ env var (numeric property ID, e.g. "123456789")
 *
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_JSON='...' GA4_PROPERTY_ID_MQ=123 node register-ga4-dimensions.cjs
 *
 * Or via GitHub Actions (where secrets are available).
 */
const https = require('https')
const crypto = require('crypto')

// Custom dimensions to register
const DIMENSIONS = [
  { parameterName: 'ab_lock1',  displayName: 'AB Lock CTA',       description: 'Forecast lock button copy variant' },
  { parameterName: 'ab_modal1', displayName: 'AB Modal headline',  description: 'Premium modal headline variant' },
  { parameterName: 'ab_onb1',   displayName: 'AB Onboarding',      description: 'Onboarding slides variant' },
  { parameterName: 'ab_free1',  displayName: 'AB Free days',       description: 'Free forecast days variant' },
  { parameterName: 'ab_vp1',    displayName: 'AB Value prop',      description: 'Weekend banner value proposition variant' },
  { parameterName: 'ab_price1', displayName: 'AB Price',           description: 'Monthly price variant' },
]

// ── JWT Auth (same approach as google-auth.cjs but standalone) ──

function base64url(data) {
  return Buffer.from(data).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.edit',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signable = `${header}.${payload}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signable)
  const signature = sign.sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signable}.${signature}`

  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data).access_token) } catch { reject(new Error('Token parse failed: ' + data)) }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

// ── GA4 Admin API ──

function ga4Request(method, path, token, body) {
  return new Promise((resolve) => {
    const postData = body ? JSON.stringify(body) : ''
    const opts = {
      hostname: 'analyticsadmin.googleapis.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    }
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', e => resolve({ status: 0, body: e.message }))
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    if (body) req.write(postData)
    req.end()
  })
}

async function main() {
  console.log('=== Register GA4 Custom Dimensions ===\n')

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_JSON env var not set.')
    console.log('Run via GitHub Actions where the secret is available,')
    console.log('or set the env var locally with the service account JSON.')
    process.exit(1)
  }

  const propertyId = process.env.GA4_PROPERTY_ID_MQ
  if (!propertyId) {
    console.error('ERROR: GA4_PROPERTY_ID_MQ env var not set.')
    process.exit(1)
  }

  const sa = JSON.parse(raw)
  console.log(`Service account: ${sa.client_email}`)
  console.log(`GA4 property: ${propertyId}\n`)

  const token = await getAccessToken(sa)
  console.log('Access token obtained.\n')

  // First list existing dimensions to avoid duplicates
  const existing = await ga4Request('GET', `/v1beta/properties/${propertyId}/customDimensions?pageSize=100`, token)
  let existingNames = []
  try {
    const parsed = JSON.parse(existing.body)
    existingNames = (parsed.customDimensions || []).map(d => d.parameterName)
    console.log(`Existing dimensions: ${existingNames.length}`)
  } catch { /* ignore */ }

  for (const dim of DIMENSIONS) {
    if (existingNames.includes(dim.parameterName)) {
      console.log(`SKIP: ${dim.parameterName} (already exists)`)
      continue
    }

    const result = await ga4Request('POST', `/v1beta/properties/${propertyId}/customDimensions`, token, {
      parameterName: dim.parameterName,
      displayName: dim.displayName,
      description: dim.description,
      scope: 'EVENT',
    })

    if (result.status === 200 || result.status === 201) {
      console.log(`OK: ${dim.parameterName} → ${dim.displayName}`)
    } else {
      console.log(`FAIL (${result.status}): ${dim.parameterName} → ${result.body.slice(0, 200)}`)
    }
  }

  console.log('\nDone. A/B test data will start appearing in GA4 Explorations within 24-48h.')
}

main().catch(e => { console.error(e); process.exit(1) })
