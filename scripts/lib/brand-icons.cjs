/**
 * brand-icons.cjs — Icônes SVG de marque (kit multidimensionnel, pilier icono).
 * Langage : géométrique, trait 1.8, 24×24, currentColor + accents or/teal —
 * même famille visuelle que les scènes SVG (MethodScene/AlertScene/jeu).
 * Remplace les emojis OS (🛰📊📅🔔…) qui cassaient la cohérence (audit 2026-06-12).
 *
 * Usage générateurs statiques : icon('satellite', 22, '#FFC72C')
 * Le JSX de l'app a son propre miroir (composant Icon dans Sargasses_PROD.jsx)
 * — garder les DEUX synchronisés (même paths).
 */
const GOLD = '#FFC72C'
const TEAL = '#3BA7A0'

// paths 24×24, stroke-based (fill none sauf accents)
const PATHS = {
  // satellite : corps + 2 panneaux + faisceau
  satellite: `<rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.2"/><path d="M7.5 9.5L5 7M16.5 14.5l2.5 2.5"/><rect x="1.6" y="2.6" width="5.2" height="3.6" rx="0.8" transform="rotate(45 4.2 4.4)"/><rect x="17.2" y="17.2" width="5.2" height="3.6" rx="0.8" transform="rotate(45 19.8 19)"/><path d="M14.5 7.5c1.6-1.6 4.6-1.4 6 0" class="acc"/><path d="M16 5.5c2.4-2.2 6-2 7.6 0" class="acc" opacity=".55" transform="translate(-3 1)"/>`,
  // score : 3 barres + coche
  score: `<path d="M5 19V12M10 19V7M15 19v-4"/><path d="M16.5 8.5l2 2L22 7" class="acc"/>`,
  // calendrier 7 jours
  cal7: `<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3.2v3.4M16 3.2v3.4"/><text x="12" y="17.4" text-anchor="middle" font-size="7.5" font-weight="800" font-family="inherit" stroke="none" fill="currentColor">7</text>`,
  // cloche
  bell: `<path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.6 2.2H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0" class="acc"/>`,
  // brief du matin : enveloppe + soleil levant
  brief: `<rect x="3" y="8.5" width="14" height="11" rx="2"/><path d="M3.6 9.5L10 14.5l6.4-5"/><circle cx="19.5" cy="5.5" r="2.4" class="accfill" stroke="none"/><path d="M19.5 1.4v1M22.8 5.5h1M16.2 5.5h1" class="acc"/>`,
  // carte / map
  map: `<path d="M9 4.5L4 6.5v13l5-2 6 2 5-2v-13l-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>`,
  // bouclier-coche (garantie)
  shield: `<path d="M12 3l7 2.6v5.7c0 4.6-3 7.7-7 9.7-4-2-7-5.1-7-9.7V5.6z"/><path d="M8.8 11.8l2.3 2.3 4.1-4.4" class="acc"/>`,
  // cadenas (paiement sécurisé)
  lock: `<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3"/><circle cx="12" cy="15.2" r="1.4" class="accfill" stroke="none"/>`,
  // croix (sans engagement)
  nocommit: `<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6" class="acc"/>`,
  // règle / backtest
  ruler: `<rect x="2.6" y="13.2" width="18.8" height="6" rx="1.3" transform="rotate(-24 12 16.2)"/><path d="M8.2 14.6l1.1 1.9M11.8 13l1.1 1.9M15.4 11.4l1.1 1.9" class="acc"/>`,
  // vague
  wave: `<path d="M3 14.5c2.4 0 2.4-2.2 4.8-2.2s2.4 2.2 4.8 2.2 2.4-2.2 4.8-2.2 2.4 2.2 4.6 2.2"/><path d="M3 18.8c2.4 0 2.4-2.2 4.8-2.2s2.4 2.2 4.8 2.2 2.4-2.2 4.8-2.2 2.4 2.2 4.6 2.2" class="acc" opacity=".6"/><circle cx="17.6" cy="6.6" r="2.6" class="accfill" stroke="none"/>`,
  // mains / communauté
  community: `<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3.5 19.5c.4-3.2 2.2-5 4.5-5s4.1 1.8 4.5 5M12.7 19.5c.3-2.4 1.6-3.8 3.8-3.8 2 0 3.3 1.3 3.7 3.8" class="acc"/>`,
  // téléphone notification
  phone: `<rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M10.5 5h3"/><circle cx="16.8" cy="6.2" r="2.6" class="accfill" stroke="none"/>`,
  // éclair (instantané)
  bolt: `<path d="M13 3L6 13.5h5L10.5 21 18 10.5h-5z" class="accfill" stroke="currentColor" stroke-linejoin="round"/>`,
}

/**
 * icon(name, size, color, accent) → SVG inline string.
 * color = trait principal (hérite du texte par défaut), accent = or par défaut.
 */
function icon(name, size = 22, color = 'currentColor', accent = GOLD) {
  const p = PATHS[name]
  if (!p) return ''
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><style>.acc{stroke:${accent}}.accfill{fill:${accent}}</style>${p}</svg>`
}

module.exports = { icon, PATHS, GOLD, TEAL }
