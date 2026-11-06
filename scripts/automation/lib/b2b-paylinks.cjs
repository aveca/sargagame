// Helper partagé : lit les liens de paiement Mollie B2B publiés par mollie-paylinks.cjs.
// Mappe uniquement les tiers explicitement autorisés vers un lien annuel.
// Territoire et tout tier inconnu restent sans paylink tant qu'aucun mapping n'est approuvé.
const fs = require('fs')
const path = require('path')

const PATH = path.join(__dirname, '..', '..', '..', 'public', 'api', 'b2b-paylinks.json')

function loadLinks() {
  try { return (JSON.parse(fs.readFileSync(PATH, 'utf8')).links) || {} } catch { return {} }
}

// Tier logique → clé de lien. Aucun fallback : un tier inconnu ne doit jamais
// recevoir silencieusement un paylink Pro (notamment Territoire).
function payUrlFor(tier) {
  const links = loadLinks()
  const normalized = String(tier || '').trim().toLowerCase()
  const map = { pro: 'pro_annual', hotel: 'pro_annual', resort: 'pro_annual', brief: 'brief_annual', 'lodge-gite': 'brief_annual' }
  const key = map[normalized]
  if (!key) return null
  const link = links[key]
  return (link && typeof link.url === 'string' && link.url.startsWith('https://')) ? link.url : null
}

module.exports = { payUrlFor, loadLinks }
