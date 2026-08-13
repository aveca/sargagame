#!/usr/bin/env node
/**
 * Test GitHub Pages Backup Email
 * 
 * Sends a test email to validate the GitHub Pages backup workflow.
 * Uses Resend API (fallback if SMTP is down).
 * Usage: node scripts/automation/test-github-pages-email.cjs --to=email@example.com
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// Load .env
function envVal(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const m = t.match(new RegExp('^' + name + '=([^\\r\\n]+)', 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}

const RESEND_API_KEY = envVal('RESEND_API_KEY')
const SMTP_PASS = envVal('SMTP_PASS')

// Parse --to flag
const toArg = process.argv.find(a => a.startsWith('--to='))
const TO_EMAIL = toArg ? toArg.split('=')[1] : null

if (!TO_EMAIL) {
  console.error('Usage: node scripts/automation/test-github-pages-email.cjs --to=email@example.com')
  process.exit(1)
}

if (!RESEND_API_KEY && !SMTP_PASS) {
  console.error('Neither RESEND_API_KEY nor SMTP_PASS found in .env')
  process.exit(1)
}

const GITHUB_PAGES_URL = 'https://aveca.github.io/sargagame/'

const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Bricolage Grotesque', system-ui, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #161b22; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #11463E, #1a5c4f); padding: 30px; text-align: center; }
    .header h1 { color: #FFC72C; font-size: 24px; margin: 0; }
    .header p { color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0; }
    .content { padding: 30px; }
    .status-box { background: #21262d; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #FFC72C; }
    .status-box h3 { color: #FFC72C; font-size: 16px; margin: 0 0 12px; }
    .status-item { display: flex; align-items: center; gap: 10px; margin: 8px 0; font-size: 14px; }
    .status-ok { color: #3fb950; }
    .status-warn { color: #d29922; }
    .cta { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #FFC72C, #E8A800); color: #1A2B26; text-decoration: none; border-radius: 999px; font-weight: 700; font-size: 16px; margin: 20px 0; }
    .footer { padding: 20px 30px; background: #0d1117; text-align: center; font-size: 12px; color: #8b949e; }
    .veilleur { font-style: italic; color: rgba(255,255,255,0.65); font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌊 Test GitHub Pages Backup</h1>
      <p>Le Veilleur a déployé une solution de secours</p>
    </div>
    <div class="content">
      <p>Bonjour,</p>
      
      <p>Suite à l'incident FTP d'hôte (tous les serveurs HS), nous avons déployé 
      <strong>une version de secours sur GitHub Pages</strong> :</p>
      
      <div class="status-box">
        <h3>✅ Statut du deploy</h3>
        <div class="status-item status-ok">✓ GitHub Pages déployé et accessible</div>
        <div class="status-item status-ok">✓ Données sargasses en temps réel</div>
        <div class="status-item status-ok">✓ Carte et plages fonctionnelles</div>
        <div class="status-item status-warn">⚠ Paiements désactivés (hébergement statique)</div>
        <div class="status-item status-warn">⚠ Tracking désactivé</div>
      </div>
      
      <p style="text-align:center">
        <a href="${GITHUB_PAGES_URL}" class="cta">Voir la version de secours →</a>
      </p>
      
      <p class="veilleur">Le Veilleur regarde ta plage, pas la peur.</p>
    </div>
    <div class="footer">
      <p>Sargasses Martinique & Guadeloupe — Données satellite Copernicus 4×/jour</p>
      <p>Pour revenir sur l'hébergement principal : l'incident FTP sera résolu sous peu.</p>
    </div>
  </div>
</body>
</html>
`

async function sendViaResend() {
  const payload = JSON.stringify({
    from: 'onboarding@resend.dev',
    to: [TO_EMAIL],
    subject: 'Test GitHub Pages Backup — Sargasses Emergency Deploy',
    html: htmlContent,
    text: `Test GitHub Pages Backup\n\nLe Veilleur a déployé une version de secours sur GitHub Pages :\n\n${GITHUB_PAGES_URL}\n\nStatut : ✅ Déployé et accessible\nDonnées : ✅ Temps réel\nPaiements : ⚠ Désactivés\n\nLe Veilleur regarde ta plage, pas la peur.`,
    headers: {
      'List-Unsubscribe': `<${GITHUB_PAGES_URL}>`,
    },
  })

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const result = JSON.parse(data)
          resolve(result)
        } else {
          reject(new Error(`Resend API error ${res.statusCode}: ${data}`))
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function sendTestEmail() {
  if (RESEND_API_KEY) {
    console.log('📧 Sending via Resend API...')
    const result = await sendViaResend()
    console.log(`✅ Email sent to ${TO_EMAIL}`)
    console.log(`   Message ID: ${result.id}`)
  } else {
    // Fallback to SMTP
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    const info = await transporter.sendMail({
      from: `"Le Veilleur" <${SMTP_USER}>`,
      to: TO_EMAIL,
      subject: 'Test GitHub Pages Backup — Sargasses Emergency Deploy',
      html: htmlContent,
    })
    console.log(`✅ Email sent to ${TO_EMAIL}`)
    console.log(`   Message ID: ${info.messageId}`)
  }
}

sendTestEmail().catch(err => {
  console.error('❌ Failed to send email:', err.message)
  process.exit(1)
})
