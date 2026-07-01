/**
 * sentinel2-readiness.cjs — GARDE DE MATURITÉ Sentinel-2 (auto-veille fondateur).
 *
 * Surveille l'accumulation de public/api/copernicus/sentinel2-history.json. Quand
 * assez de passages satellite sont collectés pour un backtest défendable, envoie UN
 * email au fondateur avec le PROMPT EXACT à lancer dans une session Claude Code pour
 * calibrer + activer le flag SG_SENTINEL2. Idempotent (marker → une seule fois).
 *
 * Pourquoi : le signal S2 se collecte tout seul mais NE se calibre PAS tout seul
 * (seuils faiToAfaiLike figés, flag OFF). Ce garde supprime la seule action fondateur
 * restante (« se souvenir de calibrer ») : il PRÉVIENT le jour où c'est mûr.
 *
 * Non-bloquant, dry-run par défaut. --send pour envoyer (le workflow passe --send).
 *   node scripts/automation/sentinel2-readiness.cjs          # dry-run
 *   node scripts/automation/sentinel2-readiness.cjs --send    # envoi réel
 */
const fs = require('fs')
const path = require('path')
const { sendEmail, mailReady } = require('./lib/email-send.cjs')

// bridge .env → process.env (exécution locale)
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => {
  if (!process.env[k]) { try { const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8'); const m = t.match(new RegExp('^' + k + '=([^\\r\\n]+)', 'm')); if (m) process.env[k] = m[1].trim() } catch (_) {} }
})

const DO_SEND = process.argv.includes('--send')
const HIST = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus', 'sentinel2-history.json')
const SENT = path.join(__dirname, 'data', 'sentinel2-readiness-sent.json')
const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Data <alerte@sargasses-martinique.com>'

// Seuil de maturité : au moins MIN_BEACHES plages ayant chacune ≥ MIN_PASSES passages
// distincts (obsDate). ~1 passage/5j après nuages → 6 passages ≈ 4-6 semaines de données
// par plage. Assez pour un backtest afaiLike vs réalisé qui ne soit pas du bruit.
const MIN_PASSES = 6
const MIN_BEACHES = 4

const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }

const hist = load(HIST, null)
if (!hist || !Array.isArray(hist.observations) || !hist.observations.length) {
  console.log('sentinel2-readiness: pas encore d\'historique — rien à faire.')
  process.exit(0)
}

// Compte les obsDate DISTINCTES par plage.
const byBeach = {}
for (const o of hist.observations) {
  if (!o || !o.id || !o.obsDate) continue
  ;(byBeach[o.id] = byBeach[o.id] || new Set()).add(o.obsDate)
}
const counts = Object.entries(byBeach).map(([id, set]) => ({ id, passes: set.size })).sort((a, b) => b.passes - a.passes)
const readyBeaches = counts.filter(c => c.passes >= MIN_PASSES)
const isReady = readyBeaches.length >= MIN_BEACHES

console.log('=== sentinel2-readiness ===', DO_SEND ? 'SEND' : 'DRY-RUN')
counts.forEach(c => console.log(`  ${c.id}: ${c.passes} passage(s)${c.passes >= MIN_PASSES ? ' ✓' : ''}`))
console.log(`  → ${readyBeaches.length}/${MIN_BEACHES} plages prêtes (seuil ${MIN_PASSES} passages) → ${isReady ? 'MÛR' : 'pas encore'}`)

if (!isReady) { console.log('sentinel2-readiness: pas encore mûr, aucun email.'); process.exit(0) }
if (load(SENT, {}).sent) { console.log('sentinel2-readiness: email déjà envoyé (marker).'); process.exit(0) }

// Le PROMPT exact à copier-coller dans une session Claude Code.
const PROMPT = `Calibre Sentinel-2 near-shore. Lis scripts/fetch-sentinel2.cjs et public/api/copernicus/sentinel2-history.json. Écris un backtest comparant, pour chaque plage et chaque obsDate, l'afaiLike Sentinel-2 au verdict ERDDAP/réalisé de la même date (history.json + backtest-results.json). Ré-ajuste les seuils faiToAfaiLike() sur ces données réelles. Vérifie que la correction S2 améliore le J+1 near-shore vs baseline (sinon garde OFF). Si concluant, active SG_SENTINEL2=1 dans .github/workflows/daily-copernicus.yml (step ERDDAP) et étends TARGET_BEACHES aux autres plages/régions pertinentes. Respecte le moat : 0 fabrication, publie le gain mesuré sur /fiabilite/.`

const rows = counts.map(c => `<tr><td style="padding:4px 10px 4px 0">${c.id}</td><td style="padding:4px 0;font-weight:700">${c.passes} passage(s)</td></tr>`).join('')

const { brandHeader } = require('./lib/email-send.cjs')
const html = `<div style="max-width:560px;margin:0 auto">
  ${brandHeader('Sentinel-2 · near-shore', 'C\'est mûr : on peut calibrer', 'Assez de passages satellite accumulés pour un backtest fiable. Il ne reste qu\'à lancer une session.')}
  <div style="background:#FDFCF7;border-radius:0 0 16px 16px;padding:24px">
    <p style="font-size:14px;line-height:1.6;color:#222;margin:0 0 14px">L'historique Sentinel-2 (5 plages MQ) a atteint le seuil de maturité. Le signal se collecte depuis des semaines mais le flag <code>SG_SENTINEL2</code> reste <b>OFF</b> tant qu'un backtest n'a pas prouvé qu'il améliore la précision.</p>
    <table style="font-size:13px;color:#333;border-collapse:collapse;margin:0 0 16px">${rows}</table>
    <p style="font-size:14px;line-height:1.6;color:#222;margin:0 0 8px"><b>Pour finir, une seule chose :</b> ouvre une session Claude Code et colle ce prompt 👇</p>
    <div style="background:#0D1E1C;color:#EAF3EF;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.55;padding:14px 16px;border-radius:10px;white-space:pre-wrap;word-break:break-word">${PROMPT.replace(/</g, '&lt;')}</div>
    <p style="font-size:12px;color:#777;margin:14px 0 0">Je fais alors tout : backtest, ré-estimation des seuils, vérif du gain, activation si concluant. Tu ne touches à rien d'autre.</p>
    <p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;margin-top:14px">Auto-veille Sentinel-2 · seuil ${MIN_PASSES} passages × ${MIN_BEACHES} plages · ${new Date().toISOString().slice(0, 10)}</p>
  </div></div>`

if (!DO_SEND) { console.log('\nDRY-RUN — email prêt, rien envoyé. --send pour envoyer.'); process.exit(0) }
if (!mailReady()) { console.error('SMTP_PASS absent — pas d\'envoi.'); process.exit(0) }

sendEmail({ from: FROM, to: TO, subject: '[Sargasses] 🛰️ Sentinel-2 prêt à calibrer — 1 prompt à lancer', html, preheader: 'Assez de données S2 accumulées : colle le prompt et j\'active.' })
  .then(({ error }) => {
    if (error) { console.error('SMTP error:', error.message); return }
    fs.mkdirSync(path.dirname(SENT), { recursive: true })
    fs.writeFileSync(SENT, JSON.stringify({ sent: true, at: new Date().toISOString(), readyBeaches: readyBeaches.map(b => b.id) }, null, 2))
    console.log('sentinel2-readiness: email envoyé + marker écrit.')
  })
  .catch(e => console.error('sentinel2-readiness (non-bloquant):', e.message || e))
