/**
 * Google API authentication via Service Account JWT.
 * Reads GOOGLE_SERVICE_ACCOUNT_JSON from env (full JSON key content).
 * Exports authenticated service clients for GSC, GA4 Data API, Indexing API.
 */
const { google } = require('googleapis')

let _auth = null

function getAuth() {
  if (_auth) return _auth
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const key = JSON.parse(raw)
    _auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: [
        'https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/webmasters',
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/indexing',
      ],
    })
    return _auth
  } catch (e) {
    console.error('[google-auth] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', e.message)
    return null
  }
}

function getSearchConsole() {
  const auth = getAuth()
  if (!auth) return null
  return google.searchconsole({ version: 'v1', auth })
}

function getAnalyticsData() {
  const auth = getAuth()
  if (!auth) return null
  return google.analyticsdata({ version: 'v1beta', auth })
}

function getIndexing() {
  const auth = getAuth()
  if (!auth) return null
  return google.indexing({ version: 'v3', auth })
}

module.exports = { getAuth, getSearchConsole, getAnalyticsData, getIndexing }
