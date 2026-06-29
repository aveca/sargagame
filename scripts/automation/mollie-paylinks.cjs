#!/usr/bin/env node
/**
 * mollie-paylinks — crée (idempotent) les LIENS DE PAIEMENT Mollie B2B et les publie
 * dans public/api/b2b-paylinks.json (lu par l'app + les emails de prospection/drip).
 *
 * Modèle B2B = PRÉPAIEMENT ANNUEL (mémo : pousser l'annuel = cash d'avance, immunise
 * le churn hors-saison). Lien de paiement Mollie = page hébergée, réutilisable, zéro
 * formulaire chez nous, zéro changement au chemin de paiement conso. One-time → on
 * renvoie un lien de renouvellement l'année suivante (relance auto).
 *
 * Clé : env MOLLIE_API_KEY (secret CI) — sinon fallback api/mollie-config.php (local).
 * Idempotent : un lien déjà présent dans le JSON n'est PAS recréé. Tourne dans le
 * pipeline (no-op tant que la clé est absente — ne casse rien).
 *
 *   node scripts/automation/mollie-paylinks.cjs           # crée les liens manquants
 *   node scripts/automation/mollie-paylinks.cjs --dry     # affiche, ne crée rien
 */
const fs = require('fs')
const path = require('path')

const OUT_PATH = path.join(__dirname, '..', '..', 'public', 'api', 'b2b-paylinks.json')
const DRY = process.argv.includes('--dry')
const REDIRECT = 'https://sargasses-martinique.com/?pro_paid=1'

// Grille B2B annuelle (prépaiement). Décision pricing 2026-06-29 (panel) : Pro annuel
// 790→690 € (sous la barre des 700, « 2 mois offerts » vs 79 €/mois). Brief inchangé.
// L'annuel reste l'ancre/option « verrouiller » ; le mensuel récurrent (79/29 €) est la
// porte d'entrée par défaut, à câbler en plans Mollie (mollie-config.php, action fondateur).
const TIERS = [
  // EUR (MQ/GP)
  { id: 'brief_annual',     value: '290.00', currency: 'EUR', label: 'Sargasses Pro — Brief (abonnement annuel)' },
  { id: 'pro_annual',       value: '690.00', currency: 'EUR', label: 'Sargasses Pro — Pro : widget marque-blanche + brief + alertes (abonnement annuel)' },
  // USD (florida/puntacana/rivieramaya) — grille de réf. Pro $790 / Brief $390 (Mollie encaisse l'USD).
  { id: 'brief_annual_usd', value: '390.00', currency: 'USD', label: 'Sargassum Pro — Brief (annual)' },
  { id: 'pro_annual_usd',   value: '790.00', currency: 'USD', label: 'Sargassum Pro — Pro: white-label widget + brief + alerts (annual)' },
]

function loadKey() {
  if (process.env.MOLLIE_API_KEY) return process.env.MOLLIE_API_KEY.trim()
  // fallback local : api/mollie-config.php (extraction grossière de 'api_key' => '...')
  for (const p of ['public/api/mollie-config.php', 'martinique-ftp/api/mollie-config.php']) {
    try { const t = fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8'); const m = t.match(/'api_key'\s*=>\s*'([^']+)'/); if (m && !m[1].includes('REPLACE')) return m[1] } catch {}
  }
  return null
}

function loadOut() { try { return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) } catch { return { _note: 'Liens de paiement Mollie B2B (générés par mollie-paylinks.cjs). Lus par l\'app + emails.', links: {} } } }
function saveOut(d) { fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true }); fs.writeFileSync(OUT_PATH, JSON.stringify(d, null, 2)) }

async function createLink(key, tier) {
  const res = await fetch('https://api.mollie.com/v2/payment-links', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: tier.label,
      amount: { currency: tier.currency || 'EUR', value: tier.value },
      redirectUrl: REDIRECT,
    }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j && j.detail) || `HTTP ${res.status}`)
  const url = j && j._links && j._links.paymentLink && j._links.paymentLink.href
  if (!url) throw new Error('no paymentLink in response')
  return { id: j.id, url, value: tier.value }
}

async function main() {
  console.log('=== Mollie B2B payment links ===')
  const out = loadOut()
  out.links = out.links || {}
  const key = loadKey()
  if (!key) { console.log('MOLLIE_API_KEY absent — no-op (rien créé).'); saveOut(out); return }
  if (key.startsWith('test_')) console.log('⚠️  clé TEST (test_) — liens en mode test (pas de vrai argent).')
  for (const tier of TIERS) {
    const existing = out.links[tier.id]
    // Idempotent : un lien déjà présent au BON montant n'est pas recréé.
    if (existing && existing.url && existing.value === tier.value) { console.log(`  = ${tier.id} déjà présent (${tier.value} €)`); continue }
    // Auto-réparation : si le montant du tier a changé (ex. pricing panel 790→690 €),
    // le lien stocké est périmé → on en frappe un neuf qui écrase l'ancien (sinon le
    // garde idempotent figerait l'ancien prix indéfiniment).
    if (existing && existing.url && existing.value !== tier.value) { console.log(`  ~ ${tier.id} prix changé ${existing.value}→${tier.value} € — recrée le lien`) }
    if (DRY) { console.log(`  ~ ${tier.id} (${tier.value} €) serait ${existing ? 'recréé' : 'créé'}`); continue }
    try {
      const link = await createLink(key, tier)
      out.links[tier.id] = { ...link, createdAt: new Date().toISOString() }
      console.log(`  + ${tier.id} → ${link.url}`)
      saveOut(out)
    } catch (e) { console.log(`  x ${tier.id}: ${e.message}`) }
  }
  out.updatedAt = new Date().toISOString()
  saveOut(out)
  console.log('Liens:', Object.keys(out.links).join(', ') || '(aucun)')
}
main().catch(e => { console.error(e); process.exit(1) })
