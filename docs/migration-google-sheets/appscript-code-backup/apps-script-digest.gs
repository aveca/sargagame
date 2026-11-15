/**
 * Google Apps Script — Sargasses Weekly Email Digest
 *
 * Deploy in the same Apps Script project (ID: 1v23rVvp2Oa7bergwETnODYRf-kRbxRiIvGtY3bKonNtxp6ZR1UfpAsRV)
 * Sheet ID: 1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ
 *
 * Setup:
 * 1. Open https://script.google.com/d/1v23rVvp2Oa7bergwETnODYRf-kRbxRiIvGtY3bKonNtxp6ZR1UfpAsRV/edit
 * 2. Paste this code (add to existing or replace)
 * 3. Add a time-driven trigger: sendWeeklyDigest() every Monday 8:00
 *    Edit > Triggers > Add trigger > sendWeeklyDigest > Time-driven > Weekly > Monday > 8-9am
 */

const SHEET_ID = '1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ'
const FROM_NAME = 'Sargasses Alertes'
const SARGASSUM_URL_MQ = 'https://sargasses-martinique.com/api/copernicus/sargassum.json'
const SARGASSUM_URL_GP = 'https://sargasses-guadeloupe.com/api/copernicus/sargassum.json'

const BEACH_NAMES = {
  'grande-anse':    "Grande Anse d'Arlet",
  'anse-mitan':     'Anse Mitan',
  'anse-noire':     'Anse Noire',
  'tartane':        'Tartane',
  'anse-madame':    'Anse Madame',
  'diamant':        'Le Diamant',
  'pt-marin':       'Pointe du Marin',
  'sainte-anne':    'Sainte-Anne',
  'les-salines':   'Les Salines',
  'vauclin':        'Le Vauclin',
  'gp-grande-anse': 'Grande Anse (GP)',
  'gp-malendure':   'Malendure',
  'gp-sainte-anne': 'Sainte-Anne (GP)',
  'gp-pt-chateaux': 'Pointe des Châteaux',
  'gp-gosier':      'Le Gosier',
  'gp-caravelle':   'La Caravelle',
  'gp-bas-du-fort': 'Bas du Fort',
  'gp-deshaies':    'Deshaies',
  'gp-moule':       'Le Moule',
  'gp-vieux-fort':  'Vieux-Fort',
}

/**
 * Get all subscriber emails from the sheet.
 * Expects column A = email, column B = island (MQ/GP), column C = date
 */
function getSubscribers() {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName('emails') || ss.getSheets()[0]
  const data = sheet.getDataRange().getValues()

  const subs = []
  for (let i = 1; i < data.length; i++) {
    const email = (data[i][0] || '').toString().trim()
    const island = (data[i][1] || 'MQ').toString().trim().toUpperCase()
    if (email && email.includes('@') && email !== 'WEEKLY_DIGEST') {
      subs.push({ email, island })
    }
  }
  return subs
}

/**
 * Fetch current sargassum levels from the live JSON.
 */
function fetchSargassumData() {
  try {
    const resp = UrlFetchApp.fetch(SARGASSUM_URL_MQ, { muteHttpExceptions: true })
    if (resp.getResponseCode() === 200) {
      return JSON.parse(resp.getContentText())
    }
  } catch (e) {
    Logger.log('Failed to fetch sargassum data: ' + e.message)
  }
  return null
}

/**
 * Build the HTML email body.
 */
function buildDigestHtml(levels, island) {
  const filtered = island === 'GP'
    ? levels.filter(b => b.id.startsWith('gp-'))
    : levels.filter(b => !b.id.startsWith('gp-'))

  const clean = filtered.filter(b => b.status === 'clean')
  const moderate = filtered.filter(b => b.status === 'moderate')
  const avoid = filtered.filter(b => b.status === 'avoid')

  const islandName = island === 'GP' ? 'Guadeloupe' : 'Martinique'
  const siteUrl = island === 'GP'
    ? 'https://sargasses-guadeloupe.com'
    : 'https://sargasses-martinique.com'
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const beachLine = (b) => {
    const name = BEACH_NAMES[b.id] || b.id
    const pct = Math.round(b.afai * 100)
    return `<li>${name} — ${pct}%</li>`
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0D0D0D;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="font-size:22px;margin:0;">Sargasses ${islandName}</h1>
    <p style="color:#686868;font-size:14px;margin:4px 0 0;">Bilan hebdo — ${date}</p>
  </div>

  <div style="background:#f0fdf4;border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:16px;margin-bottom:16px;">
    <strong style="color:#16A34A;">✅ ${clean.length} plages propres</strong>
    ${clean.length > 0 ? '<ul style="margin:8px 0 0;padding-left:20px;font-size:13px;">' + clean.map(beachLine).join('') + '</ul>' : ''}
  </div>

  ${moderate.length > 0 ? `
  <div style="background:#fffbeb;border:1px solid rgba(184,122,0,.2);border-radius:12px;padding:16px;margin-bottom:16px;">
    <strong style="color:#B87A00;">⚠️ ${moderate.length} modérées</strong>
    <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;">${moderate.map(beachLine).join('')}</ul>
  </div>` : ''}

  ${avoid.length > 0 ? `
  <div style="background:#fef2f2;border:1px solid rgba(232,82,42,.2);border-radius:12px;padding:16px;margin-bottom:16px;">
    <strong style="color:#E8522A;">🚫 ${avoid.length} à éviter</strong>
    <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;">${avoid.map(beachLine).join('')}</ul>
  </div>` : ''}

  <div style="text-align:center;margin:24px 0;">
    <a href="${siteUrl}" style="display:inline-block;padding:14px 28px;background:#E8A800;color:#fff;text-decoration:none;border-radius:24px;font-weight:700;font-size:15px;">
      Voir la carte en direct
    </a>
  </div>

  <p style="font-size:11px;color:#999;text-align:center;margin-top:32px;">
    Tu reçois cet email car tu t'es inscrit sur sargasses-${islandName.toLowerCase()}.com
  </p>
</body>
</html>`
}

/**
 * MAIN — Send weekly digest to all subscribers.
 * Trigger this every Monday via Apps Script time-driven trigger.
 */
function sendWeeklyDigest() {
  Logger.log('=== Weekly Digest Start ===')

  const subs = getSubscribers()
  Logger.log('Subscribers: ' + subs.length)

  if (subs.length === 0) {
    Logger.log('No subscribers — skipping.')
    return
  }

  const sargData = fetchSargassumData()
  if (!sargData || !sargData.levels) {
    Logger.log('Cannot fetch sargassum data — aborting.')
    return
  }

  let sent = 0
  for (const sub of subs) {
    try {
      const html = buildDigestHtml(sargData.levels, sub.island)
      const islandName = sub.island === 'GP' ? 'Guadeloupe' : 'Martinique'

      GmailApp.sendEmail(sub.email, `Sargasses ${islandName} — Bilan de la semaine`, '', {
        htmlBody: html,
        name: FROM_NAME,
      })
      sent++
      Logger.log('Sent to: ' + sub.email)
    } catch (e) {
      Logger.log('FAILED for ' + sub.email + ': ' + e.message)
    }
  }

  Logger.log(`=== Done: ${sent}/${subs.length} emails sent ===`)
}

/**
 * TEST — Send a test digest to yourself.
 * Run this manually first to verify the email looks correct.
 */
function testDigest() {
  const sargData = fetchSargassumData()
  if (!sargData) { Logger.log('No data'); return }
  const html = buildDigestHtml(sargData.levels, 'MQ')
  GmailApp.sendEmail('alerte@sargasses-martinique.com', '[TEST] Sargasses Martinique — Bilan', '', {
    htmlBody: html,
    name: FROM_NAME,
  })
  Logger.log('Test email sent!')
}
