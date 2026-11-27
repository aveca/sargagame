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
// Webhook = LE câblage qui rend un paiement paylink VISIBLE (2026-07-02). Sans lui,
// le 1er vrai client annuel 690 € payait dans le vide : aucun email d'accès, aucune
// alerte fondateur, aucune trace repo (constaté sur le paiement test fondateur du
// 01/07, intraçable). ⚠️ L'API payment-links n'accepte PAS de `metadata` (vérifié
// docs.mollie.com 2026-07-02) et `webhookUrl` n'est PAS patchable a posteriori →
// (1) l'identification B2B se fait côté mollie-webhook.php par description+montant
// de la grille TIERS (garder les labels et montants synchrones avec le webhook) ;
// (2) un lien existant sans webhook doit être RE-FRAPPÉ (marqueur `webhooked`).
const WEBHOOK = 'https://sargasses-martinique.com/api/mollie-webhook.php'

// Grille B2B annuelle (prépaiement). Décision pricing 2026-06-29 (panel) : Pro annuel
// 790→690 € (sous la barre des 700, « 2 mois offerts » vs 79 €/mois). Brief inchangé.
// L'annuel reste l'ancre/option « verrouiller » ; le mensuel récurrent (79/29 €) est la
// porte d'entrée par défaut, à câbler en plans Mollie (mollie-config.php, action fondateur).
const TIERS = [
  // EUR (MQ/GP) — B2B annuel
  { id: 'brief_annual',     value: '290.00', currency: 'EUR', label: 'Sargasses Pro — Brief (abonnement annuel)' },
  { id: 'pro_annual',       value: '690.00', currency: 'EUR', label: 'Sargasses Pro — Pro : widget marque-blanche + brief + alertes (abonnement annuel)' },
  // Territory (mairies / offices / groupes hôteliers) : 199 €/mois → 1 990 €/an (2 mois offerts).
  // Self-serve désormais bout-en-bout (essai 30 j in-app + ce lien annuel). Minté au prochain run.
  { id: 'territory_annual', value: '1990.00', currency: 'EUR', label: 'Sargasses Pro — Territoire : tout le littoral baie par baie + rapports + API (abonnement annuel)' },
  // USD (florida/puntacana/rivieramaya) — grille de réf. Pro $790 / Brief $390 (Mollie encaisse l'USD).
  { id: 'brief_annual_usd', value: '390.00', currency: 'USD', label: 'Sargassum Pro — Brief (annual)' },
  { id: 'pro_annual_usd',   value: '790.00', currency: 'USD', label: 'Sargassum Pro — Pro: white-label widget + brief + alerts (annual)' },
  // B2C PASS ONE-TIME — grille unifiée (EUR + USD) — pricing panel 2026-07-28
  // Anciennes valeurs gardées en commentaire pour rollback visuel (rollback instantané = décommenter + commenter les nouvelles).
  // trip_eur    : 499  (inchangé)  // trip_eur    : 499
  // trip_usd    : 499  (↓ de 599)  // trip_usd    : 599
  // sejour_eur  : 1299 (↓ de 1499) // sejour_eur  : 1499
  // sejour_usd  : 999  (↓ de 1199) // sejour_usd  : 1199
  // saison_eur  : 1999 (↓ de 2499) // saison_eur  : 2499
  // saison_usd  : 1499 (↓ de 1999) // saison_usd  : 1999
  { id: 'trip_eur',     value: '4.99',   currency: 'EUR', label: 'Sargasses Pass — Escale 1 jour (EUR)' },
  { id: 'trip_usd',     value: '4.99',   currency: 'USD', label: 'Sargassum Pass — 1-Day Trip (USD)' },
  { id: 'sejour_eur',   value: '12.99',  currency: 'EUR', label: 'Sargasses Pass — Séjour 7 jours (EUR)' },
  { id: 'sejour_usd',   value: '9.99',   currency: 'USD', label: 'Sargassum Pass — 7-Day Stay (USD)' },
  { id: 'saison_eur',   value: '19.99',  currency: 'EUR', label: 'Sargasses Pass — Saison 30 jours (EUR)' },
  { id: 'saison_usd',   value: '14.99',  currency: 'USD', label: 'Sargassum Pass — 30-Day Season (USD)' },
]

function loadKey() {
  if (process.env.MOLLIE_API_KEY) return process.env.MOLLIE_API_KEY.trim()
  // fallback local : api/mollie-config.php (extraction grossière de 'api_key' => '...')
  for (const p of ['public/api/mollie-config.php', 'martinique-ftp/api/mollie-config.php']) {
    try { const t = fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8'); const m = t.match(/'api_key'\s*=>\s*['"]([^'"]+)['"]/); if (m && !m[1].includes('REPLACE')) return m[1] } catch {}
  }
  return null
}

function loadOut() { try { return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) } catch { return { _note: 'Liens de paiement Mollie B2B (générés par mollie-paylinks.cjs). Lus par l\'app + emails.', links: {} } } }
function saveOut(d) { fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true }); fs.writeFileSync(OUT_PATH, JSON.stringify(d, null, 2)) }

// ═══ VÉRIFICATION LIVE (lecture seule, SANS clé API) ═══════════════════════════
// `reachable: true` est le contrat exigé par selectB2bPaylink() (app, CTA
// annuel du paywall) ET urlFromCatalog() (emails B2B) : sans ce drapeau VRAI,
// le lien n'est exposé NULLE PART. Constat 2026-11-26 : les 10 URL commités
// répondaient 404 (payment-links morts) → CTA annuel muet + liens de
// prospection morts, sans aucune alerte. On vérifie donc chaque URL à CHAQUE
// run (GET public, aucune création, aucun secret).
async function verifyLink(url) {
  try {
    const r = await fetch(url, { redirect: 'manual' })
    return r.status === 200 || (r.status >= 300 && r.status < 400)
  } catch (_) { return false }
}
// Liens annuels B2B auto-réparables : une URL morte sur un tier VENDU = un CTA
// et des emails morts → on refrappe un lien neuf (même montant, même label).
// Les entrées B2C (trip/sejour/saison) sont VÉRIFIÉES SEULEMENT : leur grille
// est périmée face à l'offre validée 2026-11-09 (7,99/14,99/24,99) — les
// recréer ici mintrait un prix non validé. Décision prix = mission séparée.
const REPAIRABLE = new Set(['brief_annual', 'pro_annual', 'brief_annual_usd', 'pro_annual_usd', 'territory_annual'])

/** Passe de vérification sur les liens DÉJÀ commités. Retourne true si au
 *  moins un drapeau a changé. Sans clé API, c'est la SEULE écriture faite. */
async function verifyCatalog(out) {
  let changed = false
  const now = new Date().toISOString()
  for (const [id, link] of Object.entries(out.links || {})) {
    if (!link || typeof link.url !== 'string' || !link.url.startsWith('https://')) continue
    const ok = await verifyLink(link.url)
    if (link.reachable !== ok) { link.reachable = ok; changed = true }
    if (ok) { if (link.verifiedAt !== now) { link.verifiedAt = now; changed = true } }
    else if (link.verifiedAt) { delete link.verifiedAt; changed = true }
    console.log(`  ${ok ? '✓' : '✗'} ${id} ${ok ? 'vivant' : 'MORT (404)'}${REPAIRABLE.has(id) && !ok ? ' → auto-réparation' : ''}`)
  }
  return changed
}

async function createLink(key, tier) {
  const res = await fetch('https://api.mollie.com/v2/payment-links', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: tier.label,
      amount: { currency: tier.currency || 'EUR', value: tier.value },
      redirectUrl: REDIRECT,
      webhookUrl: WEBHOOK,
    }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j && j.detail) || `HTTP ${res.status}`)
  const url = j && j._links && j._links.paymentLink && j._links.paymentLink.href
  if (!url) throw new Error('no paymentLink in response')
  return { id: j.id, url, value: tier.value, webhooked: true }
}

async function main() {
  console.log('=== Mollie B2B payment links ===')
  const out = loadOut()
  out.links = out.links || {}
  // 1. Vérification live du catalogue commité (mise à jour des drapeaux
  //    `reachable`) — tourne SANS clé, ne crée aucun lien.
  await verifyCatalog(out)
  const key = loadKey()
  if (!key) { console.log('MOLLIE_API_KEY absent — aucune création (vérification seule).'); if (!DRY) saveOut(out); return }
  if (key.startsWith('test_')) console.log('⚠️  clé TEST (test_) — liens en mode test (pas de vrai argent).')
  for (const tier of TIERS) {
    const existing = out.links[tier.id]
    // Idempotent : un lien déjà présent au BON montant, câblé webhook ET VÉRIFIÉ
    // vivant n'est pas recréé.
    if (existing && existing.url && existing.value === tier.value && existing.webhooked && existing.reachable === true) { console.log(`  = ${tier.id} déjà présent (${tier.value} ${tier.currency || 'EUR'}, webhook OK, URL vivante)`); continue }
    // URL MORTE sur un tier vendu : CTA + emails muets → on refrappe (même
    // montant, même label — AUCUN prix touché). Les entrées non réparables
    // (grille B2C périmée vs offre validée 2026-11-09) restent drapeau false :
    // le garde les tient hors de portée SANS minter un prix non validé.
    if (existing && existing.url && existing.value === tier.value && existing.webhooked && existing.reachable !== true) {
      if (!REPAIRABLE.has(tier.id)) { console.log(`  ! ${tier.id} mort — non réparable ici (grille non validée) : drapeau reachable=false seulement`); continue }
      console.log(`  ~ ${tier.id} URL morte — recrée le lien (CTA/email morts)`)
    }
    // Auto-réparation : si le montant du tier a changé (ex. pricing panel 790→690 €),
    // le lien stocké est périmé → on en frappe un neuf qui écrase l'ancien (sinon le
    // garde idempotent figerait l'ancien prix indéfiniment).
    if (existing && existing.url && existing.value !== tier.value) { console.log(`  ~ ${tier.id} prix changé ${existing.value}→${tier.value} — recrée le lien`) }
    // Migration webhook (one-shot, 2026-07-02) : webhookUrl n'est pas patchable sur un
    // lien existant → re-frappe. L'ancien lien reste valide côté Mollie mais plus rien
    // ne le référence (ce JSON est l'unique consommateur : app + emails au runtime).
    if (existing && existing.url && existing.value === tier.value && !existing.webhooked) { console.log(`  ~ ${tier.id} sans webhook — recrée le lien (paiement sinon invisible)`) }
    if (DRY) { console.log(`  ~ ${tier.id} (${tier.value} €) serait ${existing ? 'recréé' : 'créé'}`); continue }
    try {
      const link = await createLink(key, tier)
      out.links[tier.id] = { ...link, createdAt: new Date().toISOString(), reachable: await verifyLink(link.url) }
      console.log(`  + ${tier.id} → ${link.url}`)
      saveOut(out)
    } catch (e) { console.log(`  x ${tier.id}: ${e.message}`) }
  }
  out.updatedAt = new Date().toISOString()
  if (!DRY) saveOut(out); else console.log('--dry : aucune écriture')
  console.log('Liens:', Object.keys(out.links).join(', ') || '(aucun)')
}
main().catch(e => { console.error(e); process.exit(1) })
