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
 * 7. POST type="email.*"           → Resend webhook events (opens, clicks, bounces)
 * 8. GET ?action=email_stats       → open/click/bounce rates
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

      // Server-side deduplication: refuse if already dispatched today for this island.
      // Prevents duplicate sends if the GH Actions step fires multiple times
      // (e.g. workflow_dispatch bypass, retry-on-failure storm).
      const logSheetCheck = getOrCreateSheet('email_log', ['date', 'island', 'subject', 'sent', 'total_subscribers'])
      const logData = logSheetCheck.getDataRange().getValues()
      const todayStr = new Date().toISOString().split('T')[0]
      for (let i = 1; i < logData.length; i++) {
        const logDate = (logData[i][0] || '').toString().split('T')[0]
        const logIsland = (logData[i][1] || '').toString().toUpperCase()
        if (logDate === todayStr && logIsland === island.toUpperCase()) {
          Logger.log('weekend_email refused: already dispatched today for ' + island)
          return jsonResponse({ ok: false, skipped: true, reason: 'already_dispatched_today', island: island })
        }
      }

      // Get subscriber emails for this island
      const sheet = getOrCreateSheet('emails', ['date', 'email', 'island', 'source'])
      const data = sheet.getDataRange().getValues()
      const headers = data[0]
      const unsubCol = headers.indexOf('unsubscribed')
      let sent = 0
      for (let i = 1; i < data.length; i++) {
        const email = data[i][1]
        const sub_island = (data[i][2] || 'MQ').toUpperCase()
        if (!email || !email.includes('@')) continue
        if (sub_island !== island.toUpperCase() && sub_island !== 'ALL') continue
        // Skip unsubscribed
        if (unsubCol >= 0 && (data[i][unsubCol] || '').toString().toLowerCase() === 'yes') continue
        try {
          // Replace {{EMAIL}} placeholder with actual subscriber email
          const personalHtml = html.replace(/\{\{EMAIL\}\}/g, encodeURIComponent(email))
          MailApp.sendEmail({
            to: email,
            subject: subject,
            htmlBody: personalHtml,
            name: 'Sargasses ' + (island === 'GP' ? 'Guadeloupe' : 'Martinique'),
            replyTo: 'alerte@sargasses-martinique.com'
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

    // 6z. Welcome email after successful trial signup — fallback path
    // Client fires this from StripeInlineCheckout.handleSubmit as a safety net
    // when PHP/Resend path silently fails (e.g. missing resend_key in stripe-config.php)
    if (type === 'send_welcome_email') {
      var wEmail = (payload.email || '').trim()
      if (!wEmail || wEmail.indexOf('@') < 0) return jsonResponse({ error: 'invalid email' })
      var wLang = (payload.lang || 'fr').toLowerCase()
      var wIsland = (payload.island || 'MQ').toUpperCase()
      var wPlan = payload.plan || 'monthly'
      var wTrialEnd = parseInt(payload.trial_end || 0, 10)
      var wDomain = (wIsland === 'GP') ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
      var wIslandName = (wIsland === 'GP') ? 'Guadeloupe' : 'Martinique'
      var wDateEnd = wTrialEnd
        ? Utilities.formatDate(new Date(wTrialEnd * 1000), 'Europe/Paris', 'dd/MM/yyyy')
        : ''
      // Server-side dedup: skip if welcome email already sent for this email in last 24h
      var trSheet = getOrCreateSheet('email_tracking', [
        'date', 'resend_id', 'to', 'subject', 'email_type', 'island',
        'status', 'plan', 'source', 'ab_tests'
      ])
      var trData = trSheet.getDataRange().getValues()
      var now = Date.now()
      if (!payload.force) {
        for (var wi = 1; wi < trData.length; wi++) {
          if (trData[wi][2] === wEmail && trData[wi][4] === 'welcome') {
            var sent = new Date(trData[wi][0]).getTime()
            if (now - sent < 24 * 3600 * 1000) {
              return jsonResponse({ ok: true, skipped: true, reason: 'already_sent_24h' })
            }
          }
        }
      }
      // Build email
      var wSubject, wTitle, wSubtitle, wFeat1, wFeat2, wFeat3, wCta, wTrialNote, wManage
      if (wLang === 'en') {
        wSubject = "You're in — your 7-day forecast is live"
        wTitle = "You're in!"
        wSubtitle = "Your 7-day forecast is now active."
        wFeat1 = "7-day forecast for all beaches"
        wFeat2 = "Push alerts when conditions change"
        wFeat3 = "Zero ads, clean experience"
        wCta = "Open the map"
        wTrialNote = wDateEnd ? "Your free trial ends on " + wDateEnd + ". You'll only be charged if you stay." : "Your free trial is active."
        wManage = "Manage my subscription"
      } else {
        wSubject = "C'est parti — tes prévisions 7 jours sont actives"
        wTitle = "C'est parti !"
        wSubtitle = "Tes prévisions 7 jours sont actives."
        wFeat1 = "Prévisions 7 jours pour toutes les plages"
        wFeat2 = "Alertes push quand les conditions changent"
        wFeat3 = "Zéro pub, expérience propre"
        wCta = "Voir la carte"
        wTrialNote = wDateEnd ? "Ton essai gratuit se termine le " + wDateEnd + ". Tu ne seras débité que si tu restes." : "Ton essai gratuit est actif."
        wManage = "Gérer mon abonnement"
      }
      var wMapUrl = 'https://' + wDomain + '/?premium_email=' + encodeURIComponent(wEmail)
      var wManageUrl = 'https://' + wDomain + '/?manage=1&email=' + encodeURIComponent(wEmail)
      var wHtml = '' +
        '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
        '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;"><tr><td align="center">' +
        '<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">' +
        '<tr><td style="background:#0D1E1C;padding:40px 32px 32px;text-align:center;">' +
        '<div style="display:inline-block;background:rgba(232,168,0,.15);color:#E8A800;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:6px 16px;border-radius:20px;text-transform:uppercase;margin-bottom:16px;">PREMIUM</div>' +
        '<h1 style="color:#fff;font-size:26px;margin:12px 0 8px;font-weight:800;">' + wTitle + '</h1>' +
        '<p style="color:rgba(255,255,255,.7);font-size:15px;margin:0;">' + wSubtitle + '</p></td></tr>' +
        '<tr><td style="background:#fff;padding:32px;">' +
        '<table width="100%" cellpadding="0" cellspacing="0">' +
        '<tr><td style="padding:10px 0;font-size:15px;color:#1a1a1a;"><span style="color:#009E8E;font-weight:700;margin-right:8px;">&#10003;</span> ' + wFeat1 + '</td></tr>' +
        '<tr><td style="padding:10px 0;font-size:15px;color:#1a1a1a;"><span style="color:#009E8E;font-weight:700;margin-right:8px;">&#10003;</span> ' + wFeat2 + '</td></tr>' +
        '<tr><td style="padding:10px 0;font-size:15px;color:#1a1a1a;"><span style="color:#009E8E;font-weight:700;margin-right:8px;">&#10003;</span> ' + wFeat3 + '</td></tr>' +
        '</table>' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 16px;"><tr><td align="center">' +
        '<a href="' + wMapUrl + '" style="display:inline-block;background:linear-gradient(135deg,#E8A800,#F0C040);color:#1a1a1a;font-size:16px;font-weight:700;padding:16px 40px;border-radius:14px;text-decoration:none;">' + wCta + '</a>' +
        '</td></tr></table>' +
        '<p style="color:#888;font-size:12px;text-align:center;margin:16px 0 0;line-height:1.5;">' + wTrialNote + '</p>' +
        '</td></tr>' +
        '<tr><td style="background:#f9f9f9;padding:20px 32px;text-align:center;border-top:1px solid #eee;">' +
        '<a href="' + wManageUrl + '" style="color:#888;font-size:12px;text-decoration:underline;">' + wManage + '</a>' +
        '<p style="color:#bbb;font-size:11px;margin:8px 0 0;">Sargasses ' + wIslandName + ' · ' + wDomain + '</p>' +
        '</td></tr>' +
        '</table></td></tr></table></body></html>'
      try {
        MailApp.sendEmail({
          to: wEmail,
          subject: wSubject,
          htmlBody: wHtml,
          name: 'Sargasses ' + wIslandName,
          replyTo: 'alerte@sargasses-martinique.com'
        })
        trSheet.appendRow([
          new Date().toISOString(), '', wEmail, wSubject.substring(0, 200),
          'welcome', wIsland, 'sent', wPlan, payload.source || '', ''
        ])
        return jsonResponse({ ok: true, action: 'welcome_sent', to: wEmail })
      } catch (err) {
        return jsonResponse({ error: 'send_failed: ' + err.message })
      }
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

    // 6b. Analytics events fallback (when GA4 returns 503)
    if (type === 'analytics_event') {
      var aSheet = getOrCreateSheet('analytics_events', [
        'date', 'event_name', 'island', 'ab_lock1', 'ab_modal1', 'ab_onb1', 'ab_free1', 'ab_vp1', 'ab_price1', 'raw_params'
      ])
      var p = payload.p || {}
      aSheet.appendRow([
        new Date(payload.t || Date.now()).toISOString(),
        payload.e || '',
        payload.island || 'MQ',
        p.ab_lock1 != null ? p.ab_lock1 : '',
        p.ab_modal1 != null ? p.ab_modal1 : '',
        p.ab_onb1 != null ? p.ab_onb1 : '',
        p.ab_free1 != null ? p.ab_free1 : '',
        p.ab_vp1 != null ? p.ab_vp1 : '',
        p.ab_price1 != null ? p.ab_price1 : '',
        JSON.stringify(p).substring(0, 500)
      ])
      return jsonResponse({ ok: true, action: 'analytics_event_saved' })
    }

    // 7. Resend webhook events (email.delivered, email.opened, email.clicked, email.bounced, etc.)
    if (type && type.startsWith('email.')) {
      var eventData = payload.data || {}
      var sheet = getOrCreateSheet('email_events', [
        'date', 'event_type', 'resend_id', 'to', 'subject', 'from'
      ])
      sheet.appendRow([
        payload.created_at || new Date().toISOString(),
        type,
        eventData.email_id || '',
        Array.isArray(eventData.to) ? eventData.to[0] : (eventData.to || ''),
        eventData.subject || '',
        eventData.from || ''
      ])
      return jsonResponse({ ok: true, action: 'event_logged', type: type })
    }

    // 8. Weekly digest (legacy)
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

  // Beach reports — ALL reports, weighted by age (0.95^days_old)
  if (action === 'beach_reports') {
    try {
      const sheet = getOrCreateSheet('beach_reports', ['date', 'beach_id', 'beach_name', 'island', 'level'])
      const data = sheet.getDataRange().getValues()
      const now = Date.now()
      const cutoff24h = new Date(now - 24 * 3600000).toISOString()
      const cutoff48h = new Date(now - 48 * 3600000).toISOString()
      const DAY_MS = 86400000
      const agg = {}
      for (let i = 1; i < data.length; i++) {
        const date = data[i][0] || ''
        if (!date) continue
        const bid = data[i][1]
        const level = data[i][4] || 'clean'
        if (!bid) continue
        const daysOld = Math.max(0, (now - new Date(date).getTime()) / DAY_MS)
        const weight = Math.pow(0.95, daysOld) // recent=1.0, 7d=0.70, 14d=0.49, 30d=0.21
        if (!agg[bid]) agg[bid] = {
          clean: 0, moderate: 0, avoid: 0, total: 0, rawTotal: 0, latest: date,
          recent24h: { clean: 0, moderate: 0, avoid: 0 },
          prev24_48h: { clean: 0, moderate: 0, avoid: 0 }
        }
        agg[bid][level] = Math.round(((agg[bid][level] || 0) + weight) * 100) / 100
        agg[bid].total = Math.round(((agg[bid].total || 0) + weight) * 100) / 100
        agg[bid].rawTotal = (agg[bid].rawTotal || 0) + 1
        if (date > agg[bid].latest) agg[bid].latest = date
        if (date >= cutoff24h) agg[bid].recent24h[level] = (agg[bid].recent24h[level] || 0) + 1
        else if (date >= cutoff48h) agg[bid].prev24_48h[level] = (agg[bid].prev24_48h[level] || 0) + 1
      }
      // Compute trend per beach (based on raw 24h vs 24-48h counts)
      for (const bid in agg) {
        const r = agg[bid].recent24h, p = agg[bid].prev24_48h
        const rBad = (r.moderate || 0) + (r.avoid || 0), rTotal = (r.clean || 0) + rBad
        const pBad = (p.moderate || 0) + (p.avoid || 0), pTotal = (p.clean || 0) + pBad
        if (rTotal === 0 && pTotal === 0) agg[bid].trend = 'stable'
        else if (pTotal === 0) agg[bid].trend = rBad > 0 ? 'worsening' : 'stable'
        else if (rTotal === 0) agg[bid].trend = 'improving'
        else {
          const rRatio = rBad / rTotal, pRatio = pBad / pTotal
          agg[bid].trend = rRatio > pRatio + 0.15 ? 'worsening' : rRatio < pRatio - 0.15 ? 'improving' : 'stable'
        }
      }
      return jsonResponse({ reports: agg })
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Email stats — open/click/bounce rates from email_events
  if (action === 'email_stats') {
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID)
      // All counts come from email_events (Resend webhooks) for consistency
      var counts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
      var bouncedEmails = []

      var evSheet = ss.getSheetByName('email_events')
      if (evSheet) {
        var evData = evSheet.getDataRange().getValues()
        for (var i = 1; i < evData.length; i++) {
          var evType = (evData[i][1] || '').replace('email.', '')
          if (counts.hasOwnProperty(evType)) counts[evType]++
          if (evType === 'bounced' && evData[i][3]) bouncedEmails.push(evData[i][3])
        }
      }

      // sent = email_tracking rows (each row = 1 Resend send, consistent with delivered events)
      var trSheet = ss.getSheetByName('email_tracking')
      if (trSheet) {
        var trData = trSheet.getDataRange().getValues()
        counts.sent = Math.max(0, trData.length - 1)
      }

      // Use sent from email_events if email_tracking is lower (catches unsynchronized tracking)
      if (counts.delivered > counts.sent) counts.sent = counts.delivered

      // Deduplicate bounced emails list
      var uniqueBounced = bouncedEmails.filter(function(v, i, a) { return a.indexOf(v) === i })

      return jsonResponse({
        counts: counts,
        rates: {
          delivery: counts.sent > 0 ? Math.round(counts.delivered / counts.sent * 100) : 0,
          open: counts.delivered > 0 ? Math.round(counts.opened / counts.delivered * 100) : 0,
          click: counts.opened > 0 ? Math.round(counts.clicked / counts.opened * 100) : 0,
          bounce: counts.sent > 0 ? Math.round(counts.bounced / counts.sent * 100) : 0
        },
        bounced_emails: uniqueBounced,
        date: new Date().toISOString()
      })
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Conversion funnel — reads analytics_events (last 28 days)
  if (action === 'funnel') {
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID)
      var funnel = {
        session: 0, forecast_lock_click: 0,
        premium_modal_open: 0, premium_modal_cta: 0,
        sample_start: 0,
        checkout_view: 0, checkout_submit: 0,
        conversion: 0, checkout_error: 0
      }

      var cutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()

      var aSheet = ss.getSheetByName('analytics_events')
      if (aSheet) {
        var aData = aSheet.getDataRange().getValues()
        var abCounts = {}
        var abCols = ['lock1', 'modal1', 'onb1', 'free1', 'vp1', 'price1']

        for (var i = 1; i < aData.length; i++) {
          if ((aData[i][0] || '') < cutoff) continue
          var evt = (aData[i][1] || '').replace('sg_', '')
          if (funnel.hasOwnProperty(evt)) funnel[evt]++

          // Aggregate A/B variant counts (cols 3-8: ab_lock1..ab_price1)
          for (var j = 0; j < abCols.length; j++) {
            var v = aData[i][3 + j]
            if (v !== '' && v != null) {
              var key = abCols[j] + ':' + v
              abCounts[key] = (abCounts[key] || 0) + 1
            }
          }
        }
        funnel.total_events = aData.length - 1
        funnel.ab_variants = abCounts
      }

      // payments_real: Stripe webhook truth (sg_conversion client event misses
      // 100% of real conversions because Payment Link opens in _blank tab —
      // user never returns to original tab to fire track()). 28-day window.
      var paySheet = ss.getSheetByName('payments')
      if (paySheet) {
        var pData = paySheet.getDataRange().getValues()
        var paymentsReal = 0, revenueReal = 0
        for (var k = 1; k < pData.length; k++) {
          var pDate = pData[k][0]
          var iso = pDate instanceof Date ? pDate.toISOString() : String(pDate || '')
          if (iso < cutoff) continue
          paymentsReal++
          revenueReal += parseFloat(pData[k][3]) || 0
        }
        funnel.payments_real = paymentsReal
        funnel.revenue_real = Math.round(revenueReal * 100) / 100
      }

      funnel.rates = {
        session_to_lock: funnel.session > 0 ? Math.round(funnel.forecast_lock_click / funnel.session * 1000) / 10 : 0,
        lock_to_modal: funnel.forecast_lock_click > 0 ? Math.round(funnel.premium_modal_open / funnel.forecast_lock_click * 100) : 0,
        modal_to_cta: funnel.premium_modal_open > 0 ? Math.round(funnel.premium_modal_cta / funnel.premium_modal_open * 100) : 0,
        modal_to_sample: funnel.premium_modal_open > 0 ? Math.round(funnel.sample_start / funnel.premium_modal_open * 100) : 0,
        modal_to_any_action: funnel.premium_modal_open > 0 ? Math.round((funnel.premium_modal_cta + funnel.sample_start) / funnel.premium_modal_open * 100) : 0,
        cta_to_checkout: funnel.premium_modal_cta > 0 ? Math.round(funnel.checkout_view / funnel.premium_modal_cta * 100) : 0,
        checkout_to_submit: funnel.checkout_view > 0 ? Math.round(funnel.checkout_submit / funnel.checkout_view * 100) : 0
      }

      return jsonResponse(funnel)
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Send feedback request to premium clients
  if (action === 'feedback_request') {
    try {
      return jsonResponse(sendFeedbackRequest())
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Drip check — send scheduled nurture emails
  if (action === 'drip_check') {
    try {
      return jsonResponse(runDripEmails())
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Bounce cleanup — remove known bounced emails
  if (action === 'clean_bounces') {
    try {
      return jsonResponse(cleanBouncedEmails())
    } catch (err) {
      return jsonResponse({ error: err.message })
    }
  }

  // Unsubscribe — mark email as unsubscribed in Sheet
  if (action === 'unsubscribe') {
    try {
      var email = (e.parameter.email || '').trim().toLowerCase()
      if (!email) return htmlResponse('Adresse email manquante.')
      // Sanitize email for safe HTML output
      var safeEmail = email.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

      var ss = SpreadsheetApp.openById(SHEET_ID)
      var sheet = ss.getSheetByName('emails')
      if (!sheet) return htmlResponse('Erreur interne.')

      var data = sheet.getDataRange().getValues()
      var headers = data[0]
      var emailCol = headers.indexOf('email')
      var unsubCol = headers.indexOf('unsubscribed')

      // Add unsubscribed column if missing
      if (unsubCol === -1) {
        unsubCol = headers.length
        sheet.getRange(1, unsubCol + 1).setValue('unsubscribed')
      }

      var found = false
      for (var i = 1; i < data.length; i++) {
        if ((data[i][emailCol] || '').toString().trim().toLowerCase() === email) {
          sheet.getRange(i + 1, unsubCol + 1).setValue('yes')
          found = true
        }
      }

      var island = e.parameter.island || ''
      var name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
      if (found) {
        return htmlResponse('<h2 style="color:#16A34A">Desabonnement confirme</h2><p>Tu ne recevras plus d\'emails de Sargasses ' + name + '.</p><p>Tu peux toujours consulter la carte sur <a href="https://sargasses-' + name.toLowerCase() + '.com">sargasses-' + name.toLowerCase() + '.com</a></p>')
      } else {
        return htmlResponse('<h2>Adresse non trouvee</h2><p>' + safeEmail + ' n\'est pas dans notre liste.</p>')
      }
    } catch (err) {
      return htmlResponse('Erreur: ' + err.message)
    }
  }

  return jsonResponse({ error: 'unknown action. Use ?action=stats|emails|feedback|beach_reports|email_stats|funnel|drip_check|clean_bounces|unsubscribe' })
}

function htmlResponse(body) {
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + '<style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:40px auto;padding:20px;text-align:center;color:#333}</style>'
    + '</head><body>' + body + '</body></html>'
  return HtmlService.createHtmlOutput(html)
}

// ── Drip email sequences ────────────────────────────

var DRIP_SEQUENCES = [
  {
    day: 3, id: 'drip_j3',
    subject: function(clean) { return clean + ' plages propres cette semaine' },
    html: function(island, clean) {
      var name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
      return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        + '<h1 style="color:#E8A800;font-size:22px;margin:0 0 16px">' + clean + ' plages propres en ' + name + '</h1>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Bonne nouvelle ! Cette semaine, <strong>' + clean + ' plages</strong> sont propres en ' + name + '.</p>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">La carte est mise &agrave; jour chaque jour gr&acirc;ce aux donn&eacute;es satellite Copernicus.</p>'
        + '<a href="https://sargasses-' + name.toLowerCase() + '.com/?utm_source=email&utm_medium=drip&utm_campaign=j3" style="display:inline-block;background:#E8A800;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Voir la carte →</a>'
        + '<p style="color:#999;font-size:12px;margin-top:32px">Sargasses ' + name + ' · Donn&eacute;es satellite en temps r&eacute;el</p>'
        + '</div>'
    }
  },
  {
    day: 7, id: 'drip_j7',
    subject: function() { return 'Sache samedi d&egrave;s lundi ☀️' },
    html: function(island) {
      var name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
      return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        + '<h1 style="color:#E8A800;font-size:22px;margin:0 0 16px">Planifie ton weekend sans surprise</h1>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Tu utilises la carte depuis une semaine — super ! Mais savais-tu que les sargasses changent en quelques jours ?</p>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Avec les <strong>pr&eacute;visions 7 jours</strong>, tu sais d&egrave;s lundi quelle plage sera propre samedi. Plus de mauvaise surprise en arrivant.</p>'
        + '<a href="https://sargasses-' + name.toLowerCase() + '.com/?utm_source=email&utm_medium=drip&utm_campaign=j7#premium" style="display:inline-block;background:#E8A800;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Essayer 7 jours gratuit →</a>'
        + '<p style="color:#666;font-size:13px">Essai gratuit, annulation en 1 clic.</p>'
        + '<p style="color:#999;font-size:12px;margin-top:32px">Sargasses ' + name + ' · Donn&eacute;es satellite en temps r&eacute;el</p>'
        + '</div>'
    }
  },
  {
    day: 14, id: 'drip_j14',
    subject: function() { return 'Ton weekend sans surprise 🏖️' },
    html: function(island) {
      var name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
      return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        + '<h1 style="color:#E8A800;font-size:22px;margin:0 0 16px">135 plages. Laquelle samedi ?</h1>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Depuis 2 semaines tu as acc&egrave;s &agrave; la carte. Nos utilisateurs Premium vont plus loin :</p>'
        + '<ul style="color:#333;font-size:15px;line-height:1.8;padding-left:20px">'
        + '<li><strong>Pr&eacute;visions 7 jours</strong> — sache samedi d&egrave;s lundi</li>'
        + '<li><strong>Alertes plage</strong> — ta plage pr&eacute;f&eacute;r&eacute;e change ? On te pr&eacute;vient</li>'
        + '<li><strong>Donn&eacute;es vent + courants</strong> — comprends pourquoi</li>'
        + '</ul>'
        + '<p style="color:#333;font-size:15px;line-height:1.6"><em>« J\'ai &eacute;vit&eacute; 3 weekends pourris gr&acirc;ce aux pr&eacute;visions »</em> — un utilisateur ' + name + '</p>'
        + '<a href="https://sargasses-' + name.toLowerCase() + '.com/?utm_source=email&utm_medium=drip&utm_campaign=j14#premium" style="display:inline-block;background:#E8A800;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Essai gratuit 7 jours →</a>'
        + '<p style="color:#666;font-size:13px">4,99 €/mois apr&egrave;s l\'essai. Annulation en 1 clic.</p>'
        + '<p style="color:#999;font-size:12px;margin-top:32px">Sargasses ' + name + ' · Donn&eacute;es satellite en temps r&eacute;el</p>'
        + '</div>'
    }
  }
]

function runDripEmails() {
  var ss = SpreadsheetApp.openById(SHEET_ID)
  var emailSheet = ss.getSheetByName('emails')
  if (!emailSheet) return { sent: 0, error: 'no emails sheet' }

  var data = emailSheet.getDataRange().getValues()
  var now = new Date()
  var sent = 0, skipped = 0, errors = []

  // Get already-sent drip log
  var dripSheet = getOrCreateSheet('drip_log', ['date', 'email', 'drip_id', 'island', 'status'])
  var dripData = dripSheet.getDataRange().getValues()
  var sentMap = {}
  for (var d = 1; d < dripData.length; d++) {
    sentMap[dripData[d][1] + ':' + dripData[d][2]] = true
  }

  // Count clean beaches (rough estimate from beach data)
  var cleanCount = 40 // default, will be overridden if data available

  for (var i = 1; i < data.length; i++) {
    var signupDate = new Date(data[i][0])
    var email = data[i][1]
    var island = (data[i][2] || 'MQ').toUpperCase()

    if (!email || !email.includes('@')) continue
    var daysSinceSignup = Math.floor((now - signupDate) / (1000 * 60 * 60 * 24))

    for (var s = 0; s < DRIP_SEQUENCES.length; s++) {
      var seq = DRIP_SEQUENCES[s]
      if (daysSinceSignup < seq.day) continue
      // Only send within a 2-day window (don't spam if we missed the exact day)
      if (daysSinceSignup > seq.day + 2) continue

      var key = email + ':' + seq.id
      if (sentMap[key]) { skipped++; continue }

      try {
        var subject = typeof seq.subject === 'function' ? seq.subject(cleanCount) : seq.subject
        var html = seq.html(island, cleanCount)
        var senderName = 'Sargasses ' + (island === 'GP' ? 'Guadeloupe' : 'Martinique')

        MailApp.sendEmail({
          to: email,
          subject: subject,
          htmlBody: html,
          name: senderName,
          replyTo: 'alerte@sargasses-martinique.com'
        })

        dripSheet.appendRow([now.toISOString(), email, seq.id, island, 'sent'])
        sentMap[key] = true
        sent++
      } catch (err) {
        dripSheet.appendRow([now.toISOString(), email, seq.id, island, 'error: ' + err.message])
        errors.push(email + ': ' + err.message)
      }
    }
  }

  return { sent: sent, skipped: skipped, errors: errors, date: now.toISOString() }
}

// ── Feedback request to premium clients ─────────────

function sendFeedbackRequest() {
  var ss = SpreadsheetApp.openById(SHEET_ID)
  var paySheet = ss.getSheetByName('payments')
  if (!paySheet) return { sent: 0, error: 'no payments sheet' }

  var feedbackSheet = getOrCreateSheet('feedback_requests', ['date', 'email', 'status'])
  var alreadySent = {}
  var frData = feedbackSheet.getDataRange().getValues()
  for (var i = 1; i < frData.length; i++) {
    alreadySent[frData[i][1]] = true
  }

  var pData = paySheet.getDataRange().getValues()
  var sent = 0
  for (var i = 1; i < pData.length; i++) {
    var email = pData[i][2]
    if (!email || !email.includes('@') || alreadySent[email]) continue

    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Merci pour ton abonnement Premium ! Une question rapide',
        htmlBody: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
          + '<h1 style="color:#E8A800;font-size:20px;margin:0 0 16px">Merci pour ta confiance !</h1>'
          + '<p style="color:#333;font-size:15px;line-height:1.6">Tu fais partie des premiers abonn&eacute;s Premium de Sargasses. &Ccedil;a repr&eacute;sente beaucoup pour nous.</p>'
          + '<p style="color:#333;font-size:15px;line-height:1.6"><strong>Une seule question :</strong> qu\'est-ce qui t\'a convaincu de t\'abonner ? (en une phrase, c\'est parfait)</p>'
          + '<p style="color:#333;font-size:15px;line-height:1.6">R&eacute;ponds simplement &agrave; cet email — ta r&eacute;ponse nous aide &agrave; am&eacute;liorer le service pour tout le monde.</p>'
          + '<p style="color:#333;font-size:15px;line-height:1.6">Merci 🤙</p>'
          + '<p style="color:#999;font-size:12px;margin-top:32px">L\'&eacute;quipe Sargasses</p>'
          + '</div>',
        name: 'Sargasses',
        replyTo: 'alerte@sargasses-martinique.com'
      })
      feedbackSheet.appendRow([new Date().toISOString(), email, 'sent'])
      alreadySent[email] = true
      sent++
    } catch (err) {
      feedbackSheet.appendRow([new Date().toISOString(), email, 'error: ' + err.message])
    }
  }
  return { sent: sent, total_clients: pData.length - 1, date: new Date().toISOString() }
}

// ── Bounce cleanup ──────────────────────────────────

function cleanBouncedEmails() {
  var ss = SpreadsheetApp.openById(SHEET_ID)
  var emailSheet = ss.getSheetByName('emails')
  if (!emailSheet) return { removed: 0, error: 'no emails sheet' }

  // Known bounces (hardcoded + from email_events)
  var bouncedSet = {}
  var knownBounces = [
    '***RGPD-PURGE***',
    '***RGPD-PURGE***',
    '***RGPD-PURGE***',
    '***RGPD-PURGE***',
    '***RGPD-PURGE***',
    '***RGPD-PURGE***'
  ]
  for (var b = 0; b < knownBounces.length; b++) bouncedSet[knownBounces[b].toLowerCase()] = true

  // Also check email_events for bounced
  var evSheet = ss.getSheetByName('email_events')
  if (evSheet) {
    var evData = evSheet.getDataRange().getValues()
    for (var e = 1; e < evData.length; e++) {
      if ((evData[e][1] || '').indexOf('bounced') >= 0 && evData[e][3]) {
        bouncedSet[evData[e][3].toString().toLowerCase()] = true
      }
    }
  }

  // Remove bounced from emails sheet (iterate backwards)
  var data = emailSheet.getDataRange().getValues()
  var removed = 0
  for (var i = data.length - 1; i >= 1; i--) {
    var email = (data[i][1] || '').toString().toLowerCase()
    if (bouncedSet[email]) {
      emailSheet.deleteRow(i + 1) // +1 because rows are 1-indexed
      removed++
    }
  }

  return { removed: removed, bounced_total: Object.keys(bouncedSet).length, date: new Date().toISOString() }
}
