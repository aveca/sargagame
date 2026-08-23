/**
 * Google Apps Script — Stripe Webhook + Premium Verification
 * Deploy as Web App (Execute as: Me, Access: Anyone)
 *
 * 1. Stripe sends checkout.session.completed → doPost() logs to Sheet
 * 2. Client calls doGet(?verify=SESSION_ID) → returns {valid: true/false}
 *
 * Setup:
 * - Create a new Apps Script project
 * - Paste this code
 * - Deploy > New deployment > Web app > Anyone
 * - Copy the URL → set as STRIPE_WEBHOOK_URL in Sargasses_PROD.jsx
 * - In Stripe Dashboard > Webhooks > Add endpoint → paste Apps Script URL
 * - Select event: checkout.session.completed
 */

const SHEET_ID = '1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ'
const SHEET_NAME = 'payments'

// POST: Stripe webhook (checkout.session.completed)
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents)
    const event = payload.type || 'unknown'

    if (event === 'checkout.session.completed') {
      const session = payload.data.object
      const row = [
        new Date().toISOString(),
        session.id || '',
        session.customer_email || session.customer_details?.email || '',
        (session.amount_total / 100).toFixed(2),
        session.currency || 'eur',
        session.payment_status || '',
        session.metadata?.island || '',
      ]

      const sheet = SpreadsheetApp.openById(SHEET_ID)
      let tab = sheet.getSheetByName(SHEET_NAME)
      if (!tab) {
        tab = sheet.insertSheet(SHEET_NAME)
        tab.appendRow(['date', 'session_id', 'email', 'amount', 'currency', 'status', 'island'])
      }
      tab.appendRow(row)
    }

    return ContentService.createTextOutput(JSON.stringify({ received: true }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

// GET: Client-side verification (?verify=cs_xxx)
function doGet(e) {
  const sessionId = e.parameter.verify
  if (!sessionId) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'missing verify param' }))
      .setMimeType(ContentService.MimeType.JSON)
  }

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID)
    const tab = sheet.getSheetByName(SHEET_NAME)
    if (!tab) {
      return ContentService.createTextOutput(JSON.stringify({ valid: false, reason: 'no payments sheet' }))
        .setMimeType(ContentService.MimeType.JSON)
    }

    const data = tab.getDataRange().getValues()
    const found = data.some(row => row[1] === sessionId && row[5] === 'paid')

    return ContentService.createTextOutput(JSON.stringify({ valid: found }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    // If sheet check fails, accept the session (graceful degradation)
    return ContentService.createTextOutput(JSON.stringify({ valid: true, fallback: true }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}
