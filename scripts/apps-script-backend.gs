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

  // Email stats — open/click/bounce rates from email_events
  if (action === 'email_stats') {
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID)
      var counts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
      var bouncedEmails = []

      // Count events
      var evSheet = ss.getSheetByName('email_events')
      if (evSheet) {
        var evData = evSheet.getDataRange().getValues()
        for (var i = 1; i < evData.length; i++) {
          var evType = (evData[i][1] || '').replace('email.', '')
          if (counts.hasOwnProperty(evType)) counts[evType]++
          if (evType === 'bounced' && evData[i][3]) bouncedEmails.push(evData[i][3])
        }
      }

      // Count sends from email_tracking
      var trSheet = ss.getSheetByName('email_tracking')
      if (trSheet) {
        var trData = trSheet.getDataRange().getValues()
        counts.sent = Math.max(0, trData.length - 1)
      }

      return jsonResponse({
        counts: counts,
        rates: {
          delivery: counts.sent > 0 ? Math.round(counts.delivered / counts.sent * 100) : 0,
          open: counts.delivered > 0 ? Math.round(counts.opened / counts.delivered * 100) : 0,
          click: counts.opened > 0 ? Math.round(counts.clicked / counts.opened * 100) : 0,
          bounce: counts.sent > 0 ? Math.round(counts.bounced / counts.sent * 100) : 0
        },
        bounced_emails: bouncedEmails,
        date: new Date().toISOString()
      })
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

  return jsonResponse({ error: 'unknown action. Use ?action=stats|emails|feedback|beach_reports|email_stats|drip_check|clean_bounces' })
}

// ── Drip email sequences ────────────────────────────

var DRIP_SEQUENCES = [
  {
    day: 3, id: 'drip_j3',
    subject: function(clean) { return clean + ' plages propres cette semaine' },
    html: function(island, clean) {
      var name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
      return '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        + '<h1 style="color:#E8A800;font-size:22px;margin:0 0 16px">' + clean + ' plages propres en ' + name + '</h1>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Bonne nouvelle ! Cette semaine, <strong>' + clean + ' plages</strong> sont propres en ' + name + '.</p>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">La carte est mise à jour chaque jour grâce aux données satellite Copernicus.</p>'
        + '<a href="https://sargasses-' + name.toLowerCase() + '.com/?utm_source=email&utm_medium=drip&utm_campaign=j3" style="display:inline-block;background:#E8A800;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Voir la carte →</a>'
        + '<p style="color:#999;font-size:12px;margin-top:32px">Sargasses ' + name + ' · Données satellite en temps réel</p>'
        + '</div>'
    }
  },
  {
    day: 7, id: 'drip_j7',
    subject: function() { return 'Sache samedi dès lundi ☀️' },
    html: function(island) {
      var name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
      return '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        + '<h1 style="color:#E8A800;font-size:22px;margin:0 0 16px">Planifie ton weekend sans surprise</h1>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Tu utilises la carte depuis une semaine — super ! Mais savais-tu que les sargasses changent en quelques jours ?</p>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Avec les <strong>prévisions 7 jours</strong>, tu sais dès lundi quelle plage sera propre samedi. Plus de mauvaise surprise en arrivant.</p>'
        + '<a href="https://sargasses-' + name.toLowerCase() + '.com/?utm_source=email&utm_medium=drip&utm_campaign=j7#premium" style="display:inline-block;background:#E8A800;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Essayer 7 jours gratuit →</a>'
        + '<p style="color:#666;font-size:13px">Essai gratuit, annulation en 1 clic.</p>'
        + '<p style="color:#999;font-size:12px;margin-top:32px">Sargasses ' + name + ' · Données satellite en temps réel</p>'
        + '</div>'
    }
  },
  {
    day: 14, id: 'drip_j14',
    subject: function() { return 'Ton weekend sans surprise 🏖️' },
    html: function(island) {
      var name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
      return '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        + '<h1 style="color:#E8A800;font-size:22px;margin:0 0 16px">135 plages. Laquelle samedi ?</h1>'
        + '<p style="color:#333;font-size:15px;line-height:1.6">Depuis 2 semaines tu as accès à la carte. Nos utilisateurs Premium vont plus loin :</p>'
        + '<ul style="color:#333;font-size:15px;line-height:1.8;padding-left:20px">'
        + '<li><strong>Prévisions 7 jours</strong> — sache samedi dès lundi</li>'
        + '<li><strong>Alertes plage</strong> — ta plage préférée change ? On te prévient</li>'
        + '<li><strong>Données vent + courants</strong> — comprends pourquoi</li>'
        + '</ul>'
        + '<p style="color:#333;font-size:15px;line-height:1.6"><em>« J\'ai évité 3 weekends pourris grâce aux prévisions »</em> — un utilisateur ' + name + '</p>'
        + '<a href="https://sargasses-' + name.toLowerCase() + '.com/?utm_source=email&utm_medium=drip&utm_campaign=j14#premium" style="display:inline-block;background:#E8A800;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Essai gratuit 7 jours →</a>'
        + '<p style="color:#666;font-size:13px">4,99 €/mois après l\'essai. Annulation en 1 clic.</p>'
        + '<p style="color:#999;font-size:12px;margin-top:32px">Sargasses ' + name + ' · Données satellite en temps réel</p>'
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
          replyTo: 'noreply@sargasses-martinique.com'
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
        htmlBody: '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
          + '<h1 style="color:#E8A800;font-size:20px;margin:0 0 16px">Merci pour ta confiance !</h1>'
          + '<p style="color:#333;font-size:15px;line-height:1.6">Tu fais partie des premiers abonnés Premium de Sargasses. Ça représente beaucoup pour nous.</p>'
          + '<p style="color:#333;font-size:15px;line-height:1.6"><strong>Une seule question :</strong> qu\'est-ce qui t\'a convaincu de t\'abonner ? (en une phrase, c\'est parfait)</p>'
          + '<p style="color:#333;font-size:15px;line-height:1.6">Réponds simplement à cet email — ta réponse nous aide à améliorer le service pour tout le monde.</p>'
          + '<p style="color:#333;font-size:15px;line-height:1.6">Merci 🤙</p>'
          + '<p style="color:#999;font-size:12px;margin-top:32px">L\'équipe Sargasses</p>'
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
