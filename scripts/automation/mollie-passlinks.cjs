#!/usr/bin/env node
/**
 * mollie-passlinks.cjs — Crée des LIENS DE PAIEMENT Mollie pour TOUS les produits
 * (B2C passes + B2B annual) et les publie dans public/api/mollie-passlinks.json.
 *
 * Contrairement à mollie-paylinks.cjs (B2B annual only), ici on couvre :
 *   B2C : p7 (7,99 € / $5.99), p30 (14,99 € / $11.99), saison (24,99 € / $19.99)
 *   B2B : brief_annual (290 €), pro_annual (690 €), territory_annual (1990 €)
 *   B2B USD : brief_annual_usd ($390), pro_annual_usd ($790)
 *
 * Idempotent : un lien déjà présent au BON montant n'est pas recréé.
 * Auto-réparation : si le montant change, le lien est re-frappé.
 * Webhook : tous les liens pointent vers mollie-webhook.php pour le tracking.
 *
 * Usage :
 *   node scripts/automation/mollie-passlinks.cjs           # dry-run
 *   node scripts/automation/mollie-passlinks.cjs --send    # create missing links
 */
const fs = require('fs')
const path = require('path')

const OUT_PATH = path.join(__dirname, '..', '..', 'public', 'api', 'mollie-passlinks.json')
const DRY = process.argv.includes('--dry')
const SEND = process.argv.includes('--send')
const WEBHOOK = 'https://sargasses-martinique.com/api/mollie-webhook.php'
const REDIRECT = 'https://sargasses-martinique.com/?paywall=1'

// Tous les produits — source unique. Chaque entrée = un lien de paiement Mollie.
// B2C : clé = passKey (same as PassOffer.jsx/PremiumModal.jsx)
// B2B : clé = planId (same as mollie-paylinks.cjs + mol_b2b_plans)
const PRODUCTS = [
  // ── B2C EUR (MQ/GP) ──
  { id: 'pass_p7_eur',       value: '7.99',  currency: 'EUR', desc: 'Pass 7 jours — Sargasses' },
  { id: 'pass_p30_eur',      value: '14.99', currency: 'EUR', desc: 'Pass 30 jours — Sargasses' },
  { id: 'pass_saison_eur',   value: '19.99', currency: 'EUR', desc: 'Pass Saison — Sargasses' },
  // ── B2C USD (florida/puntacana/rivieramaya) ──
  { id: 'pass_p7_usd',       value: '5.99',  currency: 'USD', desc: '7-Day Pass — Sargassum' },
  { id: 'pass_p30_usd',      value: '11.99', currency: 'USD', desc: '30-Day Pass — Sargassum' },
  { id: 'pass_saison_usd',   value: '19.99', currency: 'USD', desc: 'Season Pass — Sargassum' },
  // ── B2B Annual EUR ──
  { id: 'brief_annual',      value: '290.00', currency: 'EUR', desc: 'Brief annuel — Sargasses Pro' },
  { id: 'pro_annual',        value: '690.00', currency: 'EUR', desc: 'Pro annuel — widget + brief + alertes' },
  { id: 'territory_annual',  value: '1990.00', currency: 'EUR', desc: 'Territoire annuel — littoral complet' },
  // ── B2B Annual USD ──
  { id: 'brief_annual_usd',  value: '390.00', currency: 'USD', desc: 'Brief Annual — Sargassum Pro' },
  { id: 'pro_annual_usd',    value: '790.00', currency: 'USD', desc: 'Pro Annual — white-label widget + brief + alerts' },
]

function loadKey() {
  if (process.env.MOLLIE_API_KEY) return process.env.MOLLIE_API_KEY.trim()
  for (const p of ['public/api/mollie-config.php', 'martinique-ftp/api/mollie-config.php']) {
    try { const t = fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8'); const m = t.match(/'api_key'\s*=>\s*'([^']+)'/); if (m && !m[1].includes('REPLACE')) return m[1] } catch {}
  }
  return null
}

function loadOut() { try { return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) } catch { return { _note: 'Liens de paiement Mollie — tous produits (généré par mollie-passlinks.cjs)', updatedAt: null, links: {} } } }
function saveOut(d) { fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true }); fs.writeFileSync(OUT_PATH, JSON.stringify(d, null, 2)) }

async function createLink(key, product) {
  const res = await fetch('https://api.mollie.com/v2/payment-links', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: product.desc,
      amount: { currency: product.currency, value: product.value },
      redirectUrl: REDIRECT,
      webhookUrl: WEBHOOK,
    }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j && j.detail) || `HTTP ${res.status}`)
  const url = j && j._links && j._links.paymentLink && j._links.paymentLink.href
  if (!url) throw new Error('no paymentLink in response')
  return { id: j.id, url, value: product.value, currency: product.currency, webhooked: true }
}

async function main() {
  console.log('=== Mollie Payment Links (all products) ===')
  const out = loadOut()
  out.links = out.links || {}
  const key = loadKey()
  if (!key) { console.log('MOLLIE_API_KEY absent — no-op.'); saveOut(out); return }
  if (!SEND && !DRY) { console.log('Dry-run (passe --send pour créer les liens)'); }
  if (key.startsWith('test_')) console.log('⚠️ clé TEST — liens en mode test')

  let created = 0, skipped = 0, repaired = 0
  for (const product of PRODUCTS) {
    const existing = out.links[product.id]
    if (existing && existing.url && existing.value === product.value && existing.webhooked) {
      if (SEND || DRY) console.log(`  = ${product.id} (${product.value} ${product.currency}) déjà présent`)
      skipped++
      continue
    }
    if (existing && existing.url && existing.value !== product.value) {
      console.log(`  ~ ${product.id} prix changé ${existing.value}→${product.value} — recréation`)
      repaired++
    }
    if (existing && existing.url && existing.value === product.value && !existing.webhooked) {
      console.log(`  ~ ${product.id} sans webhook — recréation`)
      repaired++
    }
    if (!SEND) {
      console.log(`  ~ ${product.id} (${product.value} ${product.currency}) serait créé`)
      continue
    }
    try {
      const link = await createLink(key, product)
      out.links[product.id] = { ...link, createdAt: new Date().toISOString() }
      console.log(`  + ${product.id} → ${link.url}`)
      created++
      saveOut(out)
    } catch (e) { console.log(`  x ${product.id}: ${e.message}`) }
  }

  out.updatedAt = new Date().toISOString()
  out.count = Object.keys(out.links).length
  saveOut(out)
  console.log(`\nCréés: ${created}, Skippés: ${skipped}, Réparés: ${repaired}, Total: ${out.count}`)
  console.log('Fichier:', path.relative(process.cwd(), OUT_PATH))
}

main().catch(e => { console.error(e); process.exit(1) })
