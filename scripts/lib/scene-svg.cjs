/**
 * scene-svg.cjs — Hero SVG golden-hour INLINE pour les pages SEO (SSR, ZERO React).
 *
 * Mandat (mega-loop UX, flagship) : 100% du trafic Google atterrit sur les pages
 * SEO. Sans JS, le noscript émis était du Times-New-Roman nu. Ce module porte la
 * géométrie VERBATIM de Sargasses_PROD.jsx (BeachScene + Veilleur) en CommonJS pur
 * → chaque page JS-off devient golden-hour, jamais noir-sur-blanc.
 *
 * DÉTERMINISME TOTAL (sinon SSR casse) : phase figée (opts.phase||'golden'),
 * seed = hashSeed(beach.id), AUCUNE horloge runtime ni Math.random non-seedé.
 * 2 builds = HTML byte-identique. Le badge LIVE lit data.updatedAt (déjà fourni).
 *
 * Source portée (lecture seule de Sargasses_PROD.jsx) :
 *   SCENE_TOKENS L129-138, BEACH_PHASE L501-506, moodFromScore/moodFromStatus
 *   L163-164, VEILLEUR_MOOD L157-162, hashSeed/rng/pick/rangeR/intR/chance
 *   L368-373, archetypeOf L378-402, mornePath/_PALM_N/palmPlan/buildBeachScene
 *   L408-443, _mixHex/waterTint L447-448, BeachScene L514-608, Veilleur L331-352.
 *
 * Aucun hex de scène inventé : recopié depuis SCENE_TOKENS.
 */

// ── SCENE_TOKENS (VERBATIM Sargasses_PROD.jsx L129-138) ──────────────────────
const SCENE_TOKENS = {
  phases: {
    dawn:   { sky: ['#141B33', '#3A4A6B', '#B86E7E', '#F2A968'], seaT: '#235862', seaB: '#0A2630', sand: '#C9A86A', sandNight: '#15110D', rim: '#F2A968', sun: 'set',  glit: '#F2A968' },
    day:    { sky: ['#1A6FA8', '#3E9BC4', '#7BC8D8', '#AEE0E6'], seaT: '#15706A', seaB: '#0B3A34', sand: '#C9A86A', sandNight: '#15110D', rim: '#FFFFFF', sun: 'high', glit: '#FDFCF7' },
    golden: { sky: ['#0B2230', '#155A5A', '#C97E3A', '#F2B05E'], seaT: '#1A5852', seaB: '#08251F', sand: '#1C1712', sandNight: '#15110D', rim: '#FFD884', sun: 'set',  glit: '#FFD884' },
    night:  { sky: ['#040B16', '#0A1B2E', '#10303B', '#16424A'], seaT: '#0A2E2E', seaB: '#04140F', sand: '#15110D', sandNight: '#15110D', rim: '#9ADCD4', sun: 'moon', glit: '#9ADCD4' },
  },
  sargasse: { base: '#7a5c14', dark: '#5d400e', light: '#8a6c1c', glint: '#a8862a', strand: '#6b4a12' },
  sat: { body: '#C9971F', top: '#FFC72C', lens: '#07201E' },
}

// ── BEACH_PHASE (VERBATIM dérivation L501-506) ───────────────────────────────
// DÉRIVE de SCENE_TOKENS (sky/seaT/seaB/glit/sun/rim) + clés non-scène inline.
const _BEACH_EXTRA = {
  dawn:   { cloud: '#1A2440', rock: '#1b2a33', rockLit: '#F2A968', trunk: '#14100C', frond: '#1a2e26' },
  day:    { cloud: '#EAF6F6', rock: '#5d6f62', rockLit: '#A8C6AE', trunk: '#3A2E1A', frond: '#3F6B52' },
  golden: { cloud: '#10333E', rock: '#16242A', rockLit: '#FFD884', trunk: '#120F0A', frond: '#16120C' },
  night:  { cloud: '#0A1622', rock: '#0c171b', rockLit: '#9ADCD4', trunk: '#0A0806', frond: '#0C0A06' },
}
const BEACH_PHASE = Object.fromEntries(Object.entries(_BEACH_EXTRA).map(([k, ex]) => {
  const t = SCENE_TOKENS.phases[k]
  return [k, { sky: t.sky, seaT: t.seaT, seaB: t.seaB, glit: t.glit, sun: t.sun, rim: t.rim, ...ex }]
}))

// ── Veilleur moods (VERBATIM L157-164) ───────────────────────────────────────
const VEILLEUR_MOOD = {
  serein:   { wing: '#3BA7A0', halo: '#3BA7A0', lens: '#5FD3C9', ant: '#5FD3C9', tilt: 0, ring: null },
  vigilant: { wing: '#F59E0B', halo: '#F59E0B', lens: '#FFD27A', ant: '#FFD27A', tilt: 0, ring: null },
  alerte:   { wing: '#E8522A', halo: '#E8522A', lens: '#F4845F', ant: '#F4845F', tilt: -8, ring: '#E8522A' },
  scan:     { wing: '#3BA7A0', halo: '#3BA7A0', lens: '#5FD3C9', ant: '#5FD3C9', tilt: 0, ring: null },
}
function moodFromScore(score) { return typeof score !== 'number' ? 'scan' : score >= 70 ? 'serein' : score >= 40 ? 'vigilant' : 'alerte' }
function moodFromStatus(s) { return s === 'clean' ? 'serein' : s === 'moderate' ? 'vigilant' : s === 'avoid' ? 'alerte' : 'scan' }

// ── PRNG DÉTERMINISTE (VERBATIM L368-373) — FNV-1a + mulberry32 ──────────────
function hashSeed(str) { let h = 2166136261 >>> 0; str = String(str == null ? '' : str); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } return h >>> 0 }
function rng(seed) { let a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)] }
function rangeR(rnd, a, b) { return a + (b - a) * rnd() }
function intR(rnd, a, b) { return Math.floor(a + (b - a + 1) * rnd()) }
function chance(rnd, p) { return rnd() < p }

// ── archetypeOf (VERBATIM L378-402) ──────────────────────────────────────────
const _ARCH_BLACK = /noire|dufour|c[ée]ron|couleuvre|grand.?rivi|anse l[ae]vau/i
const _ARCH_CLIFF = /caravelle|tartane|presqu|tombolo|ch[aâ]teaux|pointe|\bcap\b/i
const _ARCH_REEF = /[iî]let|petite[ -]?terre|caret|fajou|gosier/i
const _ARCH_RIVER = /rivi[èe]re|embouchure|gal[io]n|figuier|mangrove/i
const _ARCH_MARINA = /bourg|marina|ponton|fran[çc]aise/i
const _ARCH_OPEN = /salines?|grande[ -]anse/i
const _MARINA_COMMUNES = ['sainte-anne', 'le gosier', 'le marin', 'fort-de-france', 'saint-françois', 'saint-francois']
function archetypeOf(beach) {
  if (!beach) return 'MORNE_COAST'
  const k = ((beach.id || '') + ' ' + (beach.name || '') + ' ' + (beach.commune || '')).toLowerCase()
  const isl = beach.island
  if (/diamant/.test(k)) return 'ICONIC_ROCK'
  if (_ARCH_BLACK.test(k)) return 'VOLCANIC_BLACK'
  if (_ARCH_CLIFF.test(beach.name || '')) return 'CLIFF_HEADLAND'
  if (isl === 'gp' && _ARCH_REEF.test(k)) return 'REEF_ISLET'
  if (_ARCH_RIVER.test(beach.name || '')) return 'RIVER_MANGROVE'
  let coast = beach.coast
  // SSR : classifyBeachCoast vit dans le monolithe React ; on s'appuie sur
  // beach.coast quand fourni, sinon les branches coast restent en défaut MORNE.
  if (coast === 'sheltered' && beach.parking === true && (_ARCH_MARINA.test(k) || _MARINA_COMMUNES.includes((beach.commune || '').toLowerCase()))) return 'MARINA_URBAN'
  if (_ARCH_OPEN.test(k) || isl === 'fl' || isl === 'pc' || isl === 'rm' || (coast === 'atlantic' && (beach.drive || 0) >= 40)) return 'OPEN_SHORE'
  if (coast === 'sheltered') return 'SHELTERED_BAY'
  return 'MORNE_COAST'
}

// ── Relief & palmiers seedés (VERBATIM L408-443) ─────────────────────────────
function mornePath(r, n, h0, h1, fromLeft) {
  const baseY = 340, x0 = fromLeft ? -40 : 840, dir = fromLeft ? 1 : -1, span = 380
  let d = 'M' + x0 + ' ' + baseY
  for (let i = 0; i < n; i++) {
    const px = Math.round(x0 + dir * span * (i + 0.5) / n)
    const py = Math.round(baseY - rangeR(r, h0, h1))
    const ex = Math.round(x0 + dir * span * (i + 1) / n)
    const ey = Math.round(baseY - rangeR(r, 2, 14))
    d += ' Q' + px + ' ' + py + ' ' + ex + ' ' + ey
  }
  d += ' L' + Math.round(x0 + dir * span) + ' ' + baseY + ' Z'
  return d
}
const _PALM_N = { OPEN_SHORE: [2, 4], SHELTERED_BAY: [2, 3], VOLCANIC_BLACK: [2, 3], MORNE_COAST: [1, 3], MARINA_URBAN: [0, 1], REEF_ISLET: [1, 2], RIVER_MANGROVE: [0, 1], CLIFF_HEADLAND: [0, 2], ICONIC_ROCK: [1, 1] }
function palmPlan(r, arch) {
  const c = _PALM_N[arch] || [1, 2], k = intR(r, c[0], c[1]), palms = []
  for (let i = 0; i < k; i++) palms.push({ x: Math.round(rangeR(r, 120, 680)), s: +rangeR(r, 0.72, 1.12).toFixed(2), tilt: +rangeR(r, -7, 7).toFixed(1), fr: intR(r, 4, 6) })
  return palms
}
function buildBeachScene(beach) {
  const arch = archetypeOf(beach)
  const r = rng(hashSeed((beach && beach.id) || 'x'))
  const fromLeft = r() < 0.5
  let relief
  if (arch === 'ICONIC_ROCK') relief = { type: 'diamond' }
  else if (arch === 'CLIFF_HEADLAND') relief = { type: 'cliff', cut: Math.round(rangeR(r, 232, 262)), second: r() < 0.5, fromLeft }
  else if (arch === 'REEF_ISLET') relief = { type: 'islet', x: Math.round(rangeR(r, 160, 640)) }
  else if (arch === 'MARINA_URBAN') relief = { type: 'marina', boats: intR(r, 1, 2), fromLeft }
  else if (arch === 'VOLCANIC_BLACK') relief = { type: 'morne', d: mornePath(r, intR(r, 2, 3), 84, 126, fromLeft), tall: true }
  else if (arch === 'RIVER_MANGROVE') relief = { type: 'morne', d: mornePath(r, 2, 30, 56, fromLeft) }
  else if (arch === 'SHELTERED_BAY') relief = { type: 'morne', d: mornePath(r, intR(r, 1, 2), 28, 56, fromLeft) }
  else if (arch === 'OPEN_SHORE') relief = { type: 'morne', d: mornePath(r, 1, 12, 30, fromLeft), flat: true }
  else relief = { type: 'morne', d: mornePath(r, intR(r, 3, 6), 44, 90, fromLeft) }
  const palms = palmPlan(r, arch)
  const galets = arch === 'VOLCANIC_BLACK' ? Array.from({ length: intR(r, 3, 5) }, () => ({ x: Math.round(rangeR(r, 180, 640)), y: Math.round(rangeR(r, 500, 540)), rx: +rangeR(r, 5, 11).toFixed(1) })) : []
  return { arch, fromLeft, relief, palms, galets }
}

// ── waterTint (VERBATIM L447-448) ────────────────────────────────────────────
function _mixHex(a, b, k) { a = a.replace('#', ''); b = b.replace('#', ''); const p = (s, i) => parseInt(s.slice(i, i + 2), 16), m = x => ('0' + Math.round(x).toString(16)).slice(-2); return '#' + m(p(a, 0) + (p(b, 0) - p(a, 0)) * k) + m(p(a, 2) + (p(b, 2) - p(a, 2)) * k) + m(p(a, 4) + (p(b, 4) - p(a, 4)) * k) }
function waterTint(seaT, afai) { const a = typeof afai === 'number' ? afai : 0.2, inten = Math.max(0, Math.min(1, (a - 0.15) / 0.63)); return inten <= 0.03 ? seaT : _mixHex(seaT, '#6E5A1E', inten * 0.55) }

// ── helpers SSR (templating sûr, déterministe) ───────────────────────────────
function _n(v) { return Math.round(v * 1000) / 1000 } // tronque le bruit flottant
function _attr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

// ── Veilleur inline (VERBATIM géométrie L331-352, figé au repos) ─────────────
// Posé en (x,y) au lieu de translate(32,33) interne : on rend le <g> directement
// dans la scène 800×600 à l'échelle voulue (scale autour de son centre).
function veilleurMarkup(mood, x, y, scale) {
  const m = VEILLEUR_MOOD[mood] || VEILLEUR_MOOD.serein
  scale = scale || 1
  const ring = m.ring ? `<circle cx="0" cy="2" r="6.6" fill="none" stroke="${m.ring}" stroke-width="1"/>` : ''
  // viewBox source 64×64, centre du satellite à (32,33). On translate à (x,y),
  // applique l'échelle, puis le tilt de l'humeur (rotate) autour du centre.
  return `<g transform="translate(${_n(x)},${_n(y)}) scale(${_n(scale)})"><g transform="rotate(${m.tilt})">`
    + `<circle r="22" fill="${m.halo}" opacity=".15"/>`
    + `<circle r="14" fill="${m.lens}" opacity=".12"/>`
    + `<rect x="-27" y="-5" width="13" height="11" rx="2.5" fill="${m.wing}"/>`
    + `<rect x="14" y="-5" width="13" height="11" rx="2.5" fill="${m.wing}"/>`
    + `<rect x="-11" y="-11" width="22" height="22" rx="6" fill="#C9971F"/>`
    + `<rect x="-11" y="-11" width="22" height="7" rx="6" fill="#FFC72C"/>`
    + `<line x1="0" y1="-11" x2="0" y2="-19" stroke="${m.ant}" stroke-width="1.6" stroke-linecap="round"/>`
    + `<circle cx="0" cy="-20" r="1.9" fill="${m.lens}"/>`
    + ring
    + `<circle cx="0" cy="2" r="5.4" fill="#07201E"/>`
    + `<circle cx="0" cy="2" r="4" fill="${m.lens}"/>`
    + `<circle cx="-1.4" cy=".5" r="1.4" fill="#EAFBF8"/>`
    + `</g></g>`
}

// ── palmier paramétrique (VERBATIM L522-529) → markup string ─────────────────
function _palmMarkup(p, t) {
  const bx = p.x, by = 556, h = 118 * p.s, tx = bx + p.tilt * 3.2, ty = by - h
  const trunk = 'M' + bx + ' ' + by + ' Q' + Math.round(bx + (tx - bx) * 0.45) + ' ' + Math.round(by - h * 0.55) + ' ' + Math.round(tx) + ' ' + Math.round(ty)
  const fr = [], n = p.fr
  for (let f = 0; f < n; f++) {
    const a = (-150 + 120 * (n > 1 ? f / (n - 1) : 0.5)) * Math.PI / 180
    const ex = Math.round(tx + Math.cos(a) * 48 * p.s), ey = Math.round(ty + Math.sin(a) * 42 * p.s)
    const mx = Math.round(tx + Math.cos(a) * 26 * p.s), my = Math.round(ty + Math.sin(a) * 22 * p.s - 5)
    fr.push('M' + Math.round(tx) + ' ' + Math.round(ty) + ' Q' + mx + ' ' + my + ' ' + ex + ' ' + ey)
  }
  const fronds = fr.map(d => `<path d="${d}"/>`).join('')
  return `<g><path d="${trunk}" stroke="${t.trunk}" stroke-width="${Math.max(5, 12 * p.s)}" fill="none" stroke-linecap="round"/>`
    + `<g fill="none" stroke="${t.frond}" stroke-width="${Math.max(4, 8 * p.s)}" stroke-linecap="round">${fronds}</g></g>`
}

// ── relief par archétype (VERBATIM L554-568) → markup string ─────────────────
function _reliefMarkup(scene, t) {
  const rel = scene.relief
  if (rel.type === 'diamond') {
    return `<g>`
      + `<path d="M468 340 Q481 284 509 252 Q525 234 534 253 Q560 292 570 340 Z" fill="${t.rock}"/>`
      + `<path d="M509 252 Q525 234 534 253 Q560 292 570 340 L534 340 Z" fill="#000" opacity=".22"/>`
      + `<path d="M509 252 Q481 284 468 340 L509 340 Z" fill="${t.rockLit}" opacity=".26"/>`
      + `<path d="M468 340 Q519 351 570 340 L570 349 Q519 360 468 349 Z" fill="${t.rock}" opacity=".45"/>`
      + `</g>`
  }
  if (rel.type === 'cliff') {
    const cut = rel.cut, fl = rel.fromLeft
    const main = fl ? ('M-40 340 L-40 ' + cut + ' Q120 ' + (cut - 38) + ' 236 ' + (cut + 8) + ' L266 340 Z') : ('M840 340 L840 ' + cut + ' Q680 ' + (cut - 38) + ' 564 ' + (cut + 8) + ' L534 340 Z')
    const edge = fl ? ('M-40 ' + cut + ' Q120 ' + (cut - 38) + ' 236 ' + (cut + 8)) : ('M840 ' + cut + ' Q680 ' + (cut - 38) + ' 564 ' + (cut + 8))
    const second = rel.second ? `<path d="${fl ? 'M840 340 L840 288 Q772 272 714 302 L692 340 Z' : 'M-40 340 L-40 288 Q28 272 86 302 L108 340 Z'}" fill="${t.rock}" opacity=".8"/>` : ''
    return `<g><path d="${main}" fill="${t.rock}"/><path d="${edge}" fill="none" stroke="${t.rockLit}" stroke-width="3" opacity=".25"/>${second}</g>`
  }
  if (rel.type === 'islet') {
    const x = rel.x
    return `<g><path d="M-40 366 Q400 358 840 368" fill="none" stroke="${t.rim}" stroke-width="2" stroke-dasharray="5 9" opacity=".38"/>`
      + `<path d="M${x - 46} 340 Q${x} 300 ${x + 46} 340 Z" fill="${t.rock}" opacity=".9"/>`
      + `<path d="M${x - 46} 340 Q${x} 300 ${x + 46} 340" fill="none" stroke="${t.rockLit}" stroke-width="2" opacity=".22"/></g>`
  }
  if (rel.type === 'marina') {
    const fl = rel.fromLeft
    let pylons = ''
    for (let i = 0; i < 5; i++) { const px = (fl ? 64 : 548) + i * 30; pylons += `<line x1="${px}" y1="338" x2="${px + 8}" y2="372"/>` }
    let boats = ''
    for (let i = 0; i < rel.boats; i++) { const bx = 372 + i * 84; boats += `<g transform="translate(${bx},348)"><ellipse rx="22" ry="6.5" fill="${t.rock}"/><line x1="-2" y1="-3" x2="-2" y2="-28" stroke="${t.rock}" stroke-width="2.4"/><path d="M-2 -26 L16 -7 L-2 -7 Z" fill="${t.rockLit}" opacity=".55"/></g>` }
    return `<g><rect x="${fl ? 40 : 524}" y="334" width="172" height="6" fill="${t.trunk}" opacity=".8"/>`
      + `<g stroke="${t.trunk}" stroke-width="4.5" opacity=".7" stroke-linecap="round">${pylons}</g>${boats}</g>`
  }
  // morne (défaut)
  return `<g><path d="${rel.d}" fill="${t.rock}" opacity="${rel.flat ? '.72' : '.95'}"/><path d="${rel.d}" fill="none" stroke="${t.rockLit}" stroke-width="2.4" opacity=".2"/></g>`
}

// ── acteurs de statut (VERBATIM L584-600) → markup string ────────────────────
function _actorsMarkup(status, t) {
  if (status === 'clean') {
    return `<g>`
      + `<g><circle cx="372" cy="392" r="6" fill="#0D2B26"/><path d="M360 398 q12 -8 24 0" stroke="#0D2B26" stroke-width="3.4" fill="none" stroke-linecap="round"/></g>`
      + `<g><circle cx="452" cy="404" r="5" fill="#0D2B26"/><path d="M442 409 q10 -7 20 0" stroke="#0D2B26" stroke-width="3" fill="none" stroke-linecap="round"/></g>`
      + `<path d="M348 396 h8 M396 398 h7 M462 410 h8" stroke="${t.rim}" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>`
      + `</g>`
  }
  if (status === 'moderate') {
    return `<g>`
      + `<g><path d="M286 372 Q360 382 434 374" fill="none" stroke="#CDEBE6" stroke-width="1.2" stroke-dasharray="1.5 4" opacity=".6"/><circle cx="300" cy="374" r="3" fill="#FFC72C"/><circle cx="344" cy="378" r="2.6" fill="#FFC72C"/><circle cx="388" cy="375" r="2.6" fill="#FFC72C"/><circle cx="432" cy="374" r="3" fill="#FFC72C"/></g>`
      + `<g transform="translate(330,388) scale(.62)" opacity=".8"><ellipse rx="22" ry="7" fill="#7a5c14"/><ellipse cx="-10" cy="-3" rx="9" ry="4" fill="#8a6c1c"/></g>`
      + `<g transform="translate(458,502)"><g transform="translate(-20,12) scale(.5)" opacity=".7"><ellipse rx="22" ry="7" fill="#7a5c14"/></g><g fill="#0E1F1A"><circle cx="0" cy="-27" r="5"/><path d="M-5 -22 q5 -4 10 0 l-1.5 19 h-7 Z"/><path d="M-4 -4 l-3 12 M4 -4 l3 12" stroke="#0E1F1A" stroke-width="2.4" stroke-linecap="round" fill="none"/></g><g stroke="#3A2A14" stroke-width="2.2" fill="none" stroke-linecap="round"><line x1="2" y1="-19" x2="20" y2="8"/><path d="M13 6 h13 M15 3 v7 M19 2 v8.5 M23 2 v8"/></g></g>`
      + `</g>`
  }
  if (status === 'avoid') {
    return `<g>`
      + `<g><g transform="translate(300,372)"><ellipse rx="24" ry="8" fill="#7a5c14"/><ellipse cx="-12" cy="-4" rx="10" ry="5" fill="#8a6c1c"/><ellipse cx="12" cy="-3" rx="11" ry="5" fill="#5d400e"/></g><g transform="translate(470,390) scale(.9)"><ellipse rx="22" ry="7" fill="#7a5c14"/><ellipse cx="8" cy="-3" rx="9" ry="4" fill="#8a6c1c"/></g><g transform="translate(386,360) scale(.55)"><ellipse rx="22" ry="7" fill="#6b4a12"/></g></g>`
      + `<g><ellipse cx="318" cy="502" rx="72" ry="14" fill="#5d400e"/><ellipse cx="288" cy="496" rx="34" ry="10" fill="#7a5c14"/><ellipse cx="472" cy="514" rx="60" ry="12" fill="#6b4a12"/><ellipse cx="492" cy="508" rx="28" ry="8" fill="#8a6c1c"/></g>`
      + `</g>`
  }
  return ''
}

// ── badge LIVE — heure courte de data.updatedAt (valeur déjà fournie, on NE
//    génère PAS l'heure nous-mêmes). FR par défaut, robuste si absent. ─────────
function _liveHHMM(updatedAt) {
  try {
    const d = new Date(updatedAt)
    if (isNaN(d.getTime())) return ''
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return hh + ':' + mm
  } catch (_) { return '' }
}

/**
 * buildHeroSvg(beach, lv, data, opts) → string complet <svg viewBox="0 0 800 600" …>
 *  - beach : { id, name, commune, island, slug, status, afai, parking, drive, coast? }
 *  - lv    : { status, score, afai }  (override live ; sinon on lit beach.*)
 *  - data  : { updatedAt }            (pour le badge LIVE)
 *  - opts  : { phase, label }         (phase figée, défaut 'golden')
 * Déterministe (seed=beach.id, phase figée). Ne throw JAMAIS, jamais de fond vide.
 */
function buildHeroSvg(beach, lv, data, opts) {
  try {
    beach = beach || {}
    lv = lv || {}
    data = data || {}
    opts = opts || {}
    const ph = (opts.phase && BEACH_PHASE[opts.phase]) ? opts.phase : 'golden'
    const t = BEACH_PHASE[ph] || BEACH_PHASE.golden

    // statut & afai : live (lv) prioritaire, fallback beach, défaut clean/0.2
    const status = lv.status || beach.status || 'clean'
    const afai = typeof lv.afai === 'number' ? lv.afai : (typeof beach.afai === 'number' ? beach.afai : 0.2)
    const score = typeof lv.score === 'number' ? lv.score : (typeof beach.score === 'number' ? beach.score : undefined)

    // SAISON CALME : status clean → on force la plus belle scène (sun high,
    // turquoise pleine, archétype EAU-LIBRE), jamais un trou. On clone le token
    // golden mais avec le soleil HAUT et la teinte d'eau JOUR (turquoise franc).
    const calm = status === 'clean'
    const tt = calm
      ? { ...t, sun: 'high', seaT: SCENE_TOKENS.phases.day.seaT, seaB: SCENE_TOKENS.phases.day.seaB, glit: t.glit, rim: t.rim }
      : t

    const scene = buildBeachScene(beach)
    const black = scene.arch === 'VOLCANIC_BLACK'
    const sand = black ? '#0F0D0B' : (t.rock === '#16242A' ? '#1C1712' : '#15110D')

    // mood : score réel → moodFromScore, sinon moodFromStatus (doctrine app L8949)
    const mood = typeof score === 'number' ? moodFromScore(score) : moodFromStatus(status)

    // ── gradients (sky 4 stops + sea seaT→seaB avec waterTint) ──
    const sky = tt.sky
    const seaTop = waterTint(tt.seaT, calm ? 0 : afai) // calm → turquoise franc (afai neutralisé)
    const defs = `<defs>`
      + `<linearGradient id="sgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".52" stop-color="${sky[1]}"/><stop offset=".84" stop-color="${sky[2]}"/><stop offset="1" stop-color="${sky[3]}"/></linearGradient>`
      + `<linearGradient id="sgSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${seaTop}"/><stop offset="1" stop-color="${tt.seaB}"/></linearGradient>`
      + `</defs>`

    // ── ciel + soleil (set/high/moon) ──
    let sun = ''
    if (tt.sun === 'set') {
      sun = `<circle cx="400" cy="330" r="120" fill="${tt.glit}" opacity=".08"/><circle cx="400" cy="330" r="64" fill="${tt.glit}" opacity=".12"/><path d="M340 332 a60 60 0 0 1 120 0 Z" fill="${tt.glit}" opacity=".9"/>`
      sun += `<g>` + [-52, -26, 0, 26, 52].map(a => `<path d="M400 330 L390 150 L410 150 Z" fill="${tt.glit}" opacity=".1" transform="rotate(${a} 400 330)"/>`).join('') + `</g>`
    } else if (tt.sun === 'high') {
      sun = `<circle cx="300" cy="98" r="52" fill="#FDFCF7" opacity=".2"/><circle cx="300" cy="98" r="30" fill="#FFF4D6"/>`
      sun += `<g>` + [-46, -22, 2, 26, 50].map(a => `<path d="M300 98 L291 300 L309 300 Z" fill="#FFF4D6" opacity=".09" transform="rotate(${a} 300 98)"/>`).join('') + `</g>`
    } else if (tt.sun === 'moon') {
      sun = `<circle cx="320" cy="96" r="40" fill="#9ADCD4" opacity=".08"/><circle cx="320" cy="96" r="20" fill="#E6F2EF"/><circle cx="313" cy="90" r="3.6" fill="#C2D8D2" opacity=".7"/>`
    }

    // ── nuages (figés) ──
    const clouds = `<g><path d="M120 128 q14 -26 48 -26 q18 -18 46 -12 q30 -8 44 12 q26 2 30 26 Z" fill="${tt.cloud}" opacity=".9"/><path d="M122 129 h162" stroke="${tt.rim}" stroke-width="2" opacity=".32"/></g>`
      + `<g><path d="M512 92 q12 -22 42 -22 q16 -13 40 -9 q26 -7 38 11 q22 2 26 20 Z" fill="${tt.cloud}" opacity=".78"/><path d="M514 93 h140" stroke="${tt.rim}" stroke-width="1.7" opacity=".26"/></g>`

    // ── oiseaux (sauf nuit ; ici jamais nuit en SSR golden/high) ──
    const birds = (ph !== 'night') ? `<g opacity=".55" stroke="${ph === 'day' ? '#2A5566' : tt.rim}" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M712 138 q5.5 -6.5 11 0 q5.5 -6.5 11 0"/><path d="M754 124 q4.5 -5 9 0 q4.5 -5 9 0"/><path d="M648 156 q5 -6 10 0 q5 -6 10 0"/><path d="M576 128 q4 -5 8 0 q4 -5 8 0"/><path d="M620 122 q4.5 -5.5 9 0 q4.5 -5.5 9 0"/></g>` : ''

    // ── mer + colonne lumière lune (si moon) ──
    const sea = `<rect x="-40" y="330" width="880" height="200" fill="url(#sgSea)"/>`
      + (tt.sun === 'moon' ? `<path d="M302 332 L338 332 L356 474 Q320 486 284 474 Z" fill="#9ADCD4" opacity=".34"/>` : '')

    // ── relief (selon archétype) ──
    const relief = _reliefMarkup(scene, t)

    // ── glitter (3 lignes) + colonne lumière (shimmer points) ──
    const glitter = `<line x1="-40" y1="356" x2="840" y2="356" stroke="${tt.glit}" stroke-width="2.2" stroke-dasharray="3 13" opacity=".5"/>`
      + `<line x1="-40" y1="386" x2="840" y2="386" stroke="${tt.glit}" stroke-width="1.8" stroke-dasharray="2 17" opacity=".3"/>`
      + `<line x1="-40" y1="420" x2="840" y2="420" stroke="${tt.glit}" stroke-width="1.6" stroke-dasharray="2 23" opacity=".18"/>`
      + `<g fill="${tt.glit}"><circle cx="372" cy="372" r="1.9" opacity=".5"/><circle cx="392" cy="398" r="1.5" opacity=".5"/><circle cx="356" cy="410" r="1.6" opacity=".5"/><circle cx="412" cy="384" r="1.4" opacity=".5"/></g>`

    // ── acteurs de statut ──
    const actors = _actorsMarkup(status, t)

    // ── sable + écume + galets + palmiers ──
    const beachland = `<path d="M-40 472 Q200 434 430 448 Q640 460 840 502 L840 620 L-40 620 Z" fill="${sand}"/>`
      + `<path d="M-40 472 Q200 434 430 448 Q640 460 840 502" fill="none" stroke="${tt.rim}" stroke-width="2.4" opacity=".3"/>`
      + scene.galets.map(gp => `<ellipse cx="${gp.x}" cy="${gp.y}" rx="${gp.rx}" ry="${_n(gp.rx * 0.5)}" fill="#1a1714" opacity=".7"/>`).join('')
      + scene.palms.map(p => _palmMarkup(p, t)).join('')

    // ── Veilleur (mood data-driven) — posé à l'horizon, signature home ──
    const veil = veilleurMarkup(mood, 482, 92, 1.5)

    // ── badge LIVE (heure de data.updatedAt) ──
    const hhmm = _liveHHMM(data.updatedAt)
    const lab = opts.label || 'LIVE'
    const badge = hhmm
      ? `<g transform="translate(28,30)" font-family="ui-monospace,SFMono-Regular,'JetBrains Mono',monospace"><circle cx="8" cy="-4" r="4" fill="#22C55E"/><text x="20" y="0" font-size="15" font-weight="700" fill="#fff">${_attr(lab)} ${_attr(hhmm)} UTC</text></g>`
      : ''

    return `<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${_attr((beach.name || 'Plage') + ' — vue golden-hour')}" style="position:absolute;inset:0;width:100%;height:100%;display:block">`
      + defs
      + `<rect width="800" height="360" fill="url(#sgSky)"/>`
      + sun + clouds + birds + sea + relief + glitter + actors + beachland + veil + badge
      + `</svg>`
  } catch (e) {
    // FALLBACK GRACIEUX : jamais throw, jamais fond vide → golden-hour beau minimal.
    const sky = SCENE_TOKENS.phases.golden.sky
    return `<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plage golden-hour" style="position:absolute;inset:0;width:100%;height:100%;display:block">`
      + `<defs><linearGradient id="sgSkyF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".52" stop-color="${sky[1]}"/><stop offset=".84" stop-color="${sky[2]}"/><stop offset="1" stop-color="${sky[3]}"/></linearGradient></defs>`
      + `<rect width="800" height="600" fill="url(#sgSkyF)"/>`
      + `<circle cx="400" cy="330" r="120" fill="#FFD884" opacity=".1"/><circle cx="400" cy="330" r="64" fill="#FFD884" opacity=".14"/>`
      + `<path d="M-40 472 Q200 440 430 452 Q640 462 840 500 L840 620 L-40 620 Z" fill="#1C1712"/>`
      + `</svg>`
  }
}

/**
 * buildHeroCss() → string <style>…</style> scope .sg-hero.
 *  - wrapper + le <svg> en fond ; article/h1/h2/p/ul/a stylés golden-hour.
 *  - 2 fontes : Anton (titres), Bricolage Grotesque (corps), mono (données dures).
 *  - sous-texte rgba(255,255,255,.74), bande mobile-safe.
 *  - fallbacks hex EN DUR depuis SCENE_TOKENS (jamais de fond noir-sur-blanc).
 */
function buildHeroCss() {
  const g = SCENE_TOKENS.phases.golden
  // .sg-page = conteneur sombre. .sg-hero = postcard BORNÉE (aspect-ratio) où la
  // scène 800×600 s'affiche en ENTIER (Veilleur, relief, acteurs visibles) ; le
  // verdict est une légende posée en bas sur un scrim. L'<article> est un FRÈRE de
  // .sg-hero (pas dedans) → la scène ne s'étire plus derrière le texte.
  return `<style>
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap');
.sg-page{--sg-glit:${g.glit};--sg-rim:${g.rim};background:#0A1714;margin:0;color:#fff;font-family:'Bricolage Grotesque',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.sg-hero{position:relative;width:100%;max-width:760px;margin:0 auto;aspect-ratio:4/3;max-height:72vh;overflow:hidden;background:linear-gradient(180deg,${g.sky[0]},${g.sky[1]} 52%,${g.sky[2]} 84%,${g.sky[3]})}
.sg-hero>svg{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0}
.sg-hero>.sg-verdict{position:absolute;left:0;right:0;bottom:0;z-index:1;padding:64px 22px 20px;background:linear-gradient(180deg,rgba(6,16,14,0),rgba(6,16,14,.72) 70%,rgba(6,16,14,.88));text-align:left}
.sg-hero .sg-verdict h1{font-family:'Anton',system-ui,sans-serif;font-weight:400;letter-spacing:.01em;text-transform:uppercase;font-size:clamp(26px,6.4vw,42px);line-height:1;margin:0 0 6px;color:#fff;text-shadow:0 2px 16px rgba(0,0,0,.45)}
.sg-hero .sg-verdict .sg-stat{font-family:ui-monospace,SFMono-Regular,'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:var(--sg-glit,${g.glit});letter-spacing:.02em}
.sg-hero .sg-verdict .sg-line{font-size:13.5px;color:rgba(255,255,255,.8);margin:6px 0 0;line-height:1.5}
.sg-hero .sg-verdict .sg-live{display:inline-block;font-family:ui-monospace,monospace;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.78);margin-top:9px;padding:3px 10px;border:1px solid rgba(255,255,255,.24);border-radius:999px}
.sg-page article{max-width:680px;margin:0 auto;padding:26px 22px calc(44px + env(safe-area-inset-bottom,0px));color:rgba(255,255,255,.9);font-family:'Bricolage Grotesque',system-ui,sans-serif;line-height:1.6}
.sg-page article h1{font-family:'Anton',system-ui,sans-serif;font-weight:400;letter-spacing:.01em;text-transform:uppercase;font-size:clamp(24px,5.4vw,36px);line-height:1.08;margin:0 0 12px;color:#fff}
.sg-page article h2,.sg-page article h3{font-family:'Anton',system-ui,sans-serif;font-weight:400;letter-spacing:.01em;text-transform:uppercase;color:var(--sg-glit,${g.glit});margin:26px 0 8px;font-size:clamp(17px,3.6vw,22px)}
.sg-page article p{margin:0 0 12px;color:rgba(255,255,255,.84)}
.sg-page article p em{color:rgba(255,255,255,.72);font-style:normal;font-family:ui-monospace,monospace;font-size:13px}
.sg-page article strong{color:#fff;font-weight:800}
.sg-page article ul{margin:0 0 14px;padding:0;list-style:none}
.sg-page article li{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.8)}
.sg-page article a{color:var(--sg-glit,${g.glit});text-decoration:none;font-weight:600;border-bottom:1px solid rgba(255,216,132,.32)}
.sg-page article a:hover{border-bottom-color:var(--sg-glit,${g.glit})}
.sg-page article img{max-width:100%;height:auto;border-radius:16px;display:block;margin:0 0 16px}
@media(prefers-reduced-motion:reduce){.sg-page *{animation:none!important}}
</style>`
}

module.exports = {
  buildHeroSvg,
  buildHeroCss,
  // exports utilitaires (déterministes) — utiles aux injecteurs (forecast/score)
  archetypeOf,
  buildBeachScene,
  moodFromScore,
  moodFromStatus,
  hashSeed,
  SCENE_TOKENS,
  BEACH_PHASE,
}
