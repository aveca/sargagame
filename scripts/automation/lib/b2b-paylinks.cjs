// Helper partagé : lit les liens de paiement Mollie B2B publiés par mollie-paylinks.cjs.
// Mappe un tier (pro/brief/hotel/territoire) → URL de paiement annuel, sinon null
// (les appelants retombent sur /?pro=1 = capture d'intention).
const fs = require('fs')
const path = require('path')

const PATH = path.join(__dirname, '..', '..', '..', 'public', 'api', 'b2b-paylinks.json')

function loadLinks() {
  try { return (JSON.parse(fs.readFileSync(PATH, 'utf8')).links) || {} } catch { return {} }
}

// tier logique → clé de lien. hotel/pro → pro_annual ; brief/gite → brief_annual.
function payUrlFor(tier) {
  const links = loadLinks()
  const map = { pro: 'pro_annual', hotel: 'pro_annual', resort: 'pro_annual', brief: 'brief_annual', 'lodge-gite': 'brief_annual' }
  const k = map[tier] || 'pro_annual'
  const l = links[k]
  return (l && l.url) || null
}

module.exports = { payUrlFor, loadLinks }
