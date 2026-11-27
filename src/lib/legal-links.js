/**
 * legal-links.js — source UNIQUE des URLs des pages légales, côté runtime.
 *
 * POURQUOI — trois surfaces pointaient vers des pages qui n'existent pas :
 *   1. la bannière cookies (`/en/privacy/`, `/es/privacy/` — préfixes de locale
 *      purs, or les régions USD émettent des slugs RACINE localisés :
 *      `/privacy/` + `/privacidad/`, cf. scripts/lib/legal-pages.cjs) ;
 *   2. le paywall (`/cgv` en dur — la page CGV française n'est livrée que sur
 *      MQ/GP, 404 sur florida/puntacana/rivieramaya/tulum) ;
 *   3. le pied de page (même table de slugs que le générateur, mais sans repli
 *      quand la langue courante n'est pas émise : tulum en EN → 404).
 *
 * LA TABLE EST INJECTÉE AU BUILD (`__LEGAL_LINKS__`, vite.config.js) depuis
 * EXACTEMENT les mêmes entrées que le générateur qui écrit les pages
 * (SLUGS de legal-pages.cjs + emittedLangs de region-langs.cjs) → build et
 * déploiement ne peuvent plus diverger. Repli : langue primaire de la région,
 * puis MQ/GP statique. `null` = aucune page → l'appelant n'affiche pas de lien.
 */

const normLang = (l) => (l === 'es' ? 'es' : l === 'fr' ? 'fr' : 'en')

function table() {
  try {
    if (typeof __LEGAL_LINKS__ !== 'undefined' && __LEGAL_LINKS__) return __LEGAL_LINKS__
  } catch (_) { /* __LEGAL_LINKS__ non défini */ }
  return null
}

/** URL de la page légale `kind` ('terms' | 'privacy' | 'refund') pour `lang`. */
export function legalHref(kind, lang) {
  const L = table()
  const l = normLang(lang)
  if (!L || !L.pages) return null
  if (L.pages[l] && L.pages[l][kind]) return L.pages[l][kind]
  if (L.pages[L.primary] && L.pages[L.primary][kind]) return L.pages[L.primary][kind]
  // Dernier recours : n'importe quelle langue réellement livrée — mieux vaut la
  // page d'une autre langue qu'un lien mort (ex. MQ/GP en EN → CGV française).
  for (const entry of Object.values(L.pages)) {
    if (entry && entry[kind]) return entry[kind]
  }
  return null
}

/** Les 3 URLs d'un coup (pied de page) — même ordre de repli que legalHref. */
export function legalLinks(lang) {
  return {
    terms: legalHref('terms', lang),
    privacy: legalHref('privacy', lang),
    refund: legalHref('refund', lang),
  }
}

export default legalHref
