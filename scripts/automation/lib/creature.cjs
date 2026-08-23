/**
 * creature.cjs — « Le Sarga », la mascotte créature des share-cards.
 *
 * Source UNIQUE de la créature côté générateurs (node/librsvg). Reflète
 * visuellement le sprite du jeu (public/jeu/index.html) : même clump golden-hour
 * à visage, mêmes couleurs de marque. Lane jeune (acquisition/viralité) — JAMAIS
 * le funnel golden-hour.
 *
 * Retourne une chaîne SVG `<g>` (pas de <svg> racine) à insérer dans une carte,
 * déjà translatée/scalée. Boîte locale ~ 200×165, centre ~ (100,85).
 * 100 % shapes/paths/opacity → compatible librsvg (rendu via sharp). Zéro filtre.
 *
 * Humeurs (data-driven, comme le Veilleur) :
 *   happy  — yeux rieurs + grand sourire (carte « bien vu »)
 *   panic  — yeux écarquillés + goutte de sueur (carte « presque » / près du sable)
 *   magic  — halo doré + étincelles + regard serein (direction magique/fantasy)
 */

const C = {
  back: '#6b4a12', body: '#8a6a1a', bump: '#9a7a22', dark: '#4A3618',
  bubble: '#b8962e', rim: '#FFD884', rimMagic: '#FFE47A', spark: '#FFF3C4',
  eye: '#FFF8E7', pupil: '#2A1D20', mouth: '#3d2808', brow: '#5a3d10',
  sweat: '#bfeaf2', glow: '#FFE47A', blush: '#E8935C',
}

/** Étoile 4 branches (étincelle), centrée en (cx,cy), rayon r. */
function sparkle(cx, cy, r, fill = C.spark, op = 1) {
  const s = r * 0.26
  return `<path d="M${cx},${cy - r} L${cx + s},${cy - s} L${cx + r},${cy} L${cx + s},${cy + s} L${cx},${cy + r} L${cx - s},${cy + s} L${cx - r},${cy} L${cx - s},${cy - s} Z" fill="${fill}" opacity="${op}"/>`
}

function faceCalm() {
  return `<g>
    <ellipse cx="78" cy="86" rx="16" ry="19" fill="${C.eye}"/>
    <ellipse cx="122" cy="86" rx="16" ry="19" fill="${C.eye}"/>
    <circle cx="80" cy="90" r="8.5" fill="${C.pupil}"/><circle cx="120" cy="90" r="8.5" fill="${C.pupil}"/>
    <circle cx="75" cy="83" r="3" fill="#fff"/><circle cx="115" cy="83" r="3" fill="#fff"/>
    <path d="M58,62 q16,-9 31,-3" fill="none" stroke="${C.brow}" stroke-width="5" stroke-linecap="round"/>
    <path d="M142,62 q-16,-9 -31,-3" fill="none" stroke="${C.brow}" stroke-width="5" stroke-linecap="round"/>
    <path d="M86,112 q14,11 28,0 q-14,6 -28,0z" fill="${C.mouth}"/>
  </g>`
}

function faceHappy() {
  return `<g>
    <ellipse cx="62" cy="100" rx="13" ry="8" fill="${C.blush}" opacity="0.4"/>
    <ellipse cx="138" cy="100" rx="13" ry="8" fill="${C.blush}" opacity="0.4"/>
    <path d="M62,82 q16,18 32,0" fill="none" stroke="${C.pupil}" stroke-width="7" stroke-linecap="round"/>
    <path d="M106,82 q16,18 32,0" fill="none" stroke="${C.pupil}" stroke-width="7" stroke-linecap="round"/>
    <path d="M80,106 q20,26 40,0 q-20,12 -40,0z" fill="${C.mouth}"/>
    <path d="M88,112 q12,9 24,0" fill="#E8522A" opacity="0.55"/>
  </g>`
}

function facePanic() {
  return `<g>
    <ellipse cx="78" cy="84" rx="18" ry="22" fill="${C.eye}"/>
    <ellipse cx="122" cy="84" rx="18" ry="22" fill="${C.eye}"/>
    <circle cx="78" cy="78" r="6" fill="${C.pupil}"/><circle cx="122" cy="78" r="6" fill="${C.pupil}"/>
    <path d="M56,50 q18,-9 35,2" fill="none" stroke="${C.brow}" stroke-width="5" stroke-linecap="round"/>
    <path d="M144,52 q-18,-9 -35,2" fill="none" stroke="${C.brow}" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="100" cy="116" rx="11" ry="14" fill="${C.mouth}"/>
    <path d="M162,48 q7,12 0,19 q-7,-7 0,-19z" fill="${C.sweat}"/>
  </g>`
}

function faceMagic() {
  return `<g>
    <path d="M62,88 q16,11 31,0" fill="none" stroke="${C.pupil}" stroke-width="6" stroke-linecap="round"/>
    <path d="M107,88 q16,11 31,0" fill="none" stroke="${C.pupil}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="70" cy="86" r="2.4" fill="#fff"/><circle cx="130" cy="86" r="2.4" fill="#fff"/>
    <path d="M84,108 q16,10 32,0" fill="none" stroke="${C.mouth}" stroke-width="5" stroke-linecap="round"/>
  </g>`
}

/**
 * sargaCreature({ variant, x, y, scale }) → chaîne `<g>`.
 *   variant : 'happy' | 'panic' | 'magic' | 'calm' (défaut 'calm')
 *   x,y     : translation (coin haut-gauche de la boîte locale 200×165)
 *   scale   : échelle (1 = ~200px de large)
 */
function sargaCreature({ variant = 'calm', x = 0, y = 0, scale = 1 } = {}) {
  const magic = variant === 'magic'
  const rim = magic ? C.rimMagic : C.rim

  // Halo magique : cercles concentriques (pas de gradient → librsvg-safe).
  const glow = magic
    ? `<circle cx="100" cy="82" r="128" fill="${C.glow}" opacity="0.06"/>
       <circle cx="100" cy="82" r="104" fill="${C.glow}" opacity="0.08"/>
       <circle cx="100" cy="82" r="82" fill="${C.glow}" opacity="0.10"/>`
    : ''

  // Fronds (derrière le corps).
  const fronds = `<g fill="none" stroke="${C.dark}" stroke-width="10" stroke-linecap="round">
    <path d="M62,118 q-10,26 4,42"/><path d="M92,124 q5,26 -7,40"/>
    <path d="M124,120 q12,26 -2,42"/><path d="M150,114 q16,24 2,40"/>
  </g>`

  // Bulbes (pneumatocystes) — lumineux si magic.
  const bubblePts = [[40, 46], [82, 30], [120, 34], [160, 46], [70, 108], [132, 110]]
  let bubbles = ''
  for (const [bx, by] of bubblePts) {
    if (magic) bubbles += `<circle cx="${bx}" cy="${by}" r="13" fill="${C.glow}" opacity="0.25"/>`
    bubbles += `<circle cx="${bx}" cy="${by}" r="8" fill="${magic ? C.glow : C.bubble}"/>`
    bubbles += `<circle cx="${bx - 2}" cy="${by - 2}" r="2.5" fill="${C.spark}"/>`
  }

  // Étincelles autour (magic uniquement).
  let sparkles = ''
  if (magic) {
    sparkles = sparkle(28, 40, 13) + sparkle(176, 34, 10) + sparkle(20, 120, 9) +
      sparkle(184, 118, 11) + sparkle(100, 4, 9, C.spark, 0.9)
  }

  const face = variant === 'happy' ? faceHappy()
    : variant === 'panic' ? facePanic()
    : magic ? faceMagic()
    : faceCalm()

  const body = `
    <ellipse cx="97" cy="88" rx="82" ry="46" fill="${C.back}"/>
    <ellipse cx="100" cy="85" rx="80" ry="42" fill="${C.body}"/>
    <ellipse cx="58" cy="62" rx="32" ry="22" fill="${C.bump}"/>
    <ellipse cx="148" cy="64" rx="34" ry="22" fill="${C.bump}"/>
    <path d="M22,70 Q60,30 104,40 Q150,50 178,76" fill="none" stroke="${rim}" stroke-width="7" stroke-linecap="round" opacity="0.9"/>`

  return `<g transform="translate(${x},${y}) scale(${scale})">
    ${glow}${fronds}${body}${bubbles}${face}${sparkles}
  </g>`
}

module.exports = { sargaCreature, sparkle, CREATURE_COLORS: C }
