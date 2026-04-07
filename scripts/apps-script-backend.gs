/**
 * SARGASSES BACKEND — Google Apps Script
 * Deploy as Web App: Execute as Me, Access Anyone
 *
 * Handles:
 * 1. POST type="email_signup"  → save email to Sheet
 * 2. POST type="feedback"      → save feedback to Sheet
 * 3. POST type="checkout.session.completed" → Stripe webhook → log payment
 * 4. POST type="weekend_email" → dispatch HTML email to all subscribers
 * 5. GET ?action=stats         → return all metrics as JSON
 * 6. GET ?action=emails&island=MQ → return email list for an island
 *
 * Google Sheet ID: 1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ
 */

const SHEET_ID = '1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ'

// ── Helpers ──────────────────────────────────────────

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    if (headers) sheet.appendRow(headers)
  }
  return sheet
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

// ── POST handler ─────────────────────────────────────

function doPost(e) {
  try {
    let payload
    try {
      payload = JSON.parse(e.postData.contents)
    } catch {
      // Stripe sends form-encoded sometimes
      payload = JSON.parse(e.parameter.payload || '{}')
    }

    const type = payload.type || ''

    // 1. Email signup
    if (type === 'email_signup' || (!type && payload.email && payload.source)) {
      const sheet = getOrCreateSheet('emails', ['date', 'email', 'island', 'source'])
      // Deduplicate
      const data = sheet.getDataRange().getValues()
      const exists = data.some(row => row[1] === payload.email)
      if (!exists) {
        sheet.appendRow([
          payload.date || new Date().toISOString(),
          payload.email,
          payload.island || 'MQ',
          payload.source || 'app'
        ])
      }
      return jsonResponse({ ok: true, action: 'email_saved' })
    }

    // 2. Feedback
    if (type === 'feedback') {
      const sheet = getOrCreateSheet('feedback', ['date', 'rating', 'text', 'island'])
      sheet.appendRow([
        payload.date || new Date().toISOString(),
        payload.rating || 0,
        (payload.text || '').substring(0, 500),
        payload.island || 'MQ'
      ])
      return jsonResponse({ ok: true, action: 'feedback_saved' })
    }

    // 3. Stripe webhook
    if (type === 'checkout.session.completed') {
      const session = payload.data ? payload.data.object : payload
      const sheet = getOrCreateSheet('payments', ['date', 'session_id', 'email', 'amount', 'currency', 'status', 'island'])
      // Deduplicate by session_id
      const data = sheet.getDataRange().getValues()
      const sid = session.id || ''
      const exists = data.some(row => row[1] === sid)
      if (!exists) {
        sheet.appendRow([
          new Date().toISOString(),
          sid,
          session.customer_email || (session.customer_details ? session.customer_details.email : '') || '',
          session.amount_total ? (session.amount_total / 100).toFixed(2) : '4.99',
          session.currency || 'eur',
          session.payment_status || 'paid',
          session.metadata ? session.metadata.island : ''
        ])
      }
      return jsonResponse({ received: true })
    }

    // 4. Weekend email dispatch
    if (type === 'weekend_email') {
      const island = payload.island || 'MQ'
      const subject = payload.subject || 'Bulletin weekend sargasses'
      const html = payload.html || ''

      if (!html) return jsonResponse({ error: 'no html' })

      // Get subscriber emails for this island
      const sheet = getOrCreateSheet('emails', ['date', 'email', 'island', 'source'])
      const data = sheet.getDataRange().getValues()
      let sent = 0
      for (let i = 1; i < data.length; i++) {
        const email = data[i][1]
        const sub_island = (data[i][2] || 'MQ').toUpperCase()
        if (!email || !email.includes('@')) continue
        if (sub_island !== island.toUpperCase() && sub_island !== 'ALL') continue
        try {
          MailApp.sendEmail({
            to: email,
            subject: subject,
            htmlBody: html,
            name: 'Sargasses ' + (island === 'GP' ? 'Guadeloupe' : 'Martinique'),
            replyTo: 'noreply@sargasses-martinique.com'
          })
          sent++
        } catch (err) {
          // Log failed sends but continue
          Logger.log('Failed to send to ' + email + ': ' + err.message)
        }
      }

      // Log dispatch
      const logSheet = getOrCreateSheet('email_log', ['date', 'island', 'subject', 'sent', 'total_subscribers'])
      logSheet.appendRow([new Date().toISOString(), island, subject, sent, data.length - 1])

      return jsonResponse({ ok: true, sent: sent, island: island })
    }

    // 5. Beach report (user sargassum level report)
    if (type === 'beach_report') {
      const sheet = getOrCreateSheet('beach_reports', ['date', 'beach_id', 'beach_name', 'island', 'level'])
      sheet.appendRow([
        payload.date || new Date().toISOString(),
        payload.beach_id || '',
        payload.beach_name || '',
        (payload.island || 'MQ').toUpperCase(),
        payload.level || 'clean'
      ])
      return jsonResponse({ ok: true, action: 'beach_report_saved' })
    }

    // 6. Email tracking (Resend delivery + opens + clicks)
    if (type === 'email_tracking') {
      const sheet = getOrCreateSheet('email_tracking', [
        'date', 'resend_id', 'to', 'subject', 'email_type', 'island',
        'status', 'plan', 'source', 'ab_tests'
      ])
      sheet.appendRow([
        payload.date || new Date().toISOString(),
        payload.resend_id || '',
        payload.to || '',
        (payload.subject || '').substring(0, 200),
        payload.email_type || 'unknown',   // welcome, post_checkout, weekend
        (payload.island || 'MQ').toUpperCase(),
        payload.status || 'sent',
        payload.plan || '',                 // monthly, annual
        payload.source || '',               // forecast, nav, best_beach...
        payload.ab_tests || ''              // JSON string of active tests
      ])
      return jsonResponse({ ok: true, action: 'email_tracked' })
    }

    // 7. Weekly digest (legacy)
    if (payload.email === 'WEEKLY_DIGEST') {
      const sheet = getOrCreateSheet('digest_log', ['date', 'island', 'digest'])
      sheet.appendRow([new Date().toISOString(), payload.island || 'MQ', payload.digest || ''])
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: true, action: 'unknown_type' })

  } catch (err) {
    return jsonResponse({ error: err.message })
  }
}

// ── GET handler ──────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action || ''

  // Stats endpoint — returns all key metrics
  if (action === 'stats') {
    try {
      const ss = SpreadsheetApp.openById(SHEET_ID)

      // Payments
      let payments = 0, revenue = 0
      const paySheet = ss.getSheetByName('payments')
      if (paySheet) {
        const pData = paySheet.getDataRange().getValues()
        payments = Math.max(0, pData.length - 1)
        for (let i = 1; i < pData.length; i++) {
          revenue += parseFloat(pData[i][3]) || 0
        }
      }

      // Emails
      let emails = 0
      const emailSheet = ss.getSheetByName('emails')
      if (emailSheet) {
        emails = Math.max(0, emailSheet.getDataRange().getValues().length - 1)
      }

      // Feedback
      let feedbacks = 0, avgRating = 0
      const fbSheet = ss.getSheetByName('feedback')
      if (fbSheet) {
        const fbData = fbSheet.getDataRange().getValues()
        feedbacks = Math.max(0, fbData.length - 1)
        if (feedbacks > 0) {
          let sum = 0
          for (let i = 1; i < fbData.length; i++) sum += (parseInt(fbData[i][1]) || 0)
          avgRating = Math.round(sum / feedbacks * 10) / 10
        }
      }

      // Email dispatches
      let lastDispatch = null, totalSent = 0
      const logSheet = ss.getSheetByName('email_log')
      if (logSheet) {
        const logData = logSheet.getDataRange().getValues()
        if (logData.length > 1) {
          lastDispatch = logData[logData.length - 1][0]
          for (let i = 1; i < logData.length; i++) totalSent += (parseInt(logData[i][3]) || 0)
        }
      }

      return jsonResponse({
        payments: payments,
        revenue: Math.round(revenue * 100) / 100,
        emails: emails,
        feedbacks: feedbacks,
        avgRating: avgRating,
        emailsSent: totalSent,
        lastDispatch: lastDispatch,
        date: new Date().toISOString()
      })
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Email list for a specific island
  if (action === 'emails') {
    const island = (e.parameter.island || 'MQ').toUpperCase()
    try {
      const sheet = getOrCreateSheet('emails', ['date', 'email', 'island', 'source'])
      const data = sheet.getDataRange().getValues()
      const emails = []
      for (let i = 1; i < data.length; i++) {
        if ((data[i][2] || 'MQ').toUpperCase() === island) {
          emails.push(data[i][1])
        }
      }
      return jsonResponse({ island: island, count: emails.length })
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Feedback list
  if (action === 'feedback') {
    try {
      const sheet = getOrCreateSheet('feedback', ['date', 'rating', 'text', 'island'])
      const data = sheet.getDataRange().getValues()
      const items = []
      for (let i = 1; i < data.length; i++) {
        items.push({ date: data[i][0], rating: data[i][1], text: data[i][2], island: data[i][3] })
      }
      return jsonResponse({ count: items.length, items: items.slice(-20) })
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Beach reports — aggregated last 48h per beach
  if (action === 'beach_reports') {
    try {
      const sheet = getOrCreateSheet('beach_reports', ['date', 'beach_id', 'beach_name', 'island', 'level'])
      const data = sheet.getDataRange().getValues()
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const agg = {}
      for (let i = 1; i < data.length; i++) {
        const date = data[i][0] || ''
        if (date < cutoff) continue
        const bid = data[i][1]
        const level = data[i][4] || 'clean'
        if (!bid) continue
        if (!agg[bid]) agg[bid] = { clean: 0, moderate: 0, avoid: 0, total: 0, latest: date }
        agg[bid][level] = (agg[bid][level] || 0) + 1
        agg[bid].total++
        if (date > agg[bid].latest) agg[bid].latest = date
      }
      return jsonResponse({ reports: agg })
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  return jsonResponse({ error: 'unknown action. Use ?action=stats|emails|feedback|beach_reports' })
}
