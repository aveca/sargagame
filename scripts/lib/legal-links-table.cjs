/**
 * legal-links-table.cjs — table des URLs de pages légales RÉELLEMENT livrées,
 * par région et par langue. Source unique consommée par :
 *   - vite.config.js (injection runtime `__LEGAL_LINKS__` → src/lib/legal-links.js)
 *   - tests/legal-links-runtime.test.cjs (parité build <-> générateur)
 *
 * Miroir EXACT du générateur qui écrit les pages :
 *   - régions USD : SLUGS de legal-pages.cjs + emittedLangs de region-langs.cjs
 *     (une langue absente du déploiement n'entre PAS dans la table) ;
 *   - MQ/GP : pages statiques FR de public/ + /en/privacy/ de public/en/.
 *
 * Pourquoi ce fichier existe : trois surfaces in-app pointaient vers des pages
 * inexistantes sur leur domaine (bannière cookies `/en/privacy/` et
 * `/es/privacy/`, paywall `/cgv`, pied de page sans repli) → 404 en production
 * sur 4 des 6 régions, dont le chemin de conversion.
 */

const { SLUGS } = require('./legal-pages.cjs')
const { emittedLangs, normLang } = require('./region-langs.cjs')

// MQ/GP : pages légales FR historiques + la seule page EN livrée (public/en/).
// Pas de page ES sur MQ/GP → la table reste honnête (pas d'entrée fantôme).
const MQGP_PAGES = {
  fr: { terms: '/cgv.html', privacy: '/confidentialite.html', refund: '/remboursement.html' },
  en: { privacy: '/en/privacy/' },
}

function buildLegalLinks(region) {
  if (!region) return null
  let pages = {}
  if (region.id !== 'mq' && region.id !== 'gp') {
    for (const l of emittedLangs(region)) {
      pages[l] = {
        terms: `/${SLUGS.terms[l]}/`,
        privacy: `/${SLUGS.privacy[l]}/`,
        refund: `/${SLUGS.refund[l]}/`,
      }
    }
  } else {
    pages = JSON.parse(JSON.stringify(MQGP_PAGES))
  }
  if (!Object.keys(pages).length) return null
  // Langue primaire Telle quelle : MQ/GP sont FR (normLang aplatit 'fr' en 'en'
  // car il ne connaît que le couple ES/EN des régions USD).
  const primary = region.primaryLang === 'es' ? 'es' : region.primaryLang === 'fr' ? 'fr' : 'en'
  return { primary, pages }
}

module.exports = { buildLegalLinks, MQGP_PAGES }
