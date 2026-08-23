/**
 * share-card.cjs — Socle commun des générateurs de cartes de partage social.
 *
 * Rôle : primitives PARTAGÉES par les 3 générateurs autonomes (Beach Wrapped,
 * Wordle de la plage, Verdict du Veilleur). Aucun de ces générateurs ne touche
 * l'app (Sargasses_PROD.jsx / src/) — ils lisent la donnée déjà publiée et
 * produisent des images PNG carrées/portrait prêtes à publier.
 *
 *   Rendu  : SVG (chaîne) → PNG via `sharp` (déjà en devDependency, aucun
 *            navigateur requis, déterministe, CI-friendly).
 *   Données: public/api/copernicus/sargassum.json (live, lecture seule)
 *            scripts/automation/data/backtest-results.json (précision réelle)
 *
 * RÈGLE D'OR (héritée de reliability-page.cjs) : aucun chiffre inventé. Toute
 * stat affichée vient de la donnée réelle. Le « streak » du Veilleur n'est
 * calculé QUE sur les plages dont le backtest dépasse le seuil de fiabilité —
 * broadcaster une fausse info = risque réputation.
 *
 * Partage natif : les cartes ne portent JAMAIS de lien sortant. Le domaine est
 * gravé DANS l'image (texte). Un lien dans un post tue la portée organique et
 * le partage natif — on veut l'image, pas le clic.
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const DATA_DIR = path.join(__dirname, '..', 'data')
const OUT_DIR = path.join(__dirname, '..', 'share-cards', 'out')

// ── Palette de marque (alignée public/about/index.html + reliability-page.cjs) ──
const PALETTE = {
  ink: '#0A1714',
  ink2: '#06100D',
  card: '#10231E',
  cardLine: 'rgba(255,255,255,.10)',
  gold: '#FFC72C',
  teal: '#3BA7A0',
  white: '#FFFFFF',
  mut: 'rgba(255,255,255,.66)',
  mut2: 'rgba(255,255,255,.42)',
}

// Couleurs de score (mêmes seuils que le pipeline : scores{}.color)
const SCORE_COLORS = { SUPER: '#1EC8B0', BON: '#6AC15A', MOYEN: '#E8A800', PASSABLE: '#E87B1E', MAUVAIS: '#E0533B' }

// Statut sargasses → couleur + libellé court
const STATUS = {
  clean: { color: '#1EC8B0', fr: 'Propre' },
  moderate: { color: '#E8A800', fr: 'Modéré' },
  avoid: { color: '#E0533B', fr: 'À éviter' },
}

// Police : pile robuste cross-plateforme (Windows local + runner Linux CI).
// librsvg substitue dans l'ordre ; le gras est synthétisé via font-weight.
const FONT = "Arial, 'Helvetica Neue', Helvetica, 'DejaVu Sans', 'Liberation Sans', sans-serif"

// Points de mesure du pipeline (ids backtest = ids pipeline, PAS ids beaches-list).
// Copie locale volontaire : garde les générateurs disjoints de scripts/lib/.
// Source de vérité : reliability-page.cjs / fetch-sargassum-live.cjs.
const PIPELINE_BEACHES = {
  'grande-anse': { name: "Grande Anse d'Arlet", island: 'mq' },
  'anse-mitan': { name: 'Anse Mitan', island: 'mq' },
  'anse-noire': { name: 'Anse Noire', island: 'mq' },
  'tartane': { name: 'Tartane', island: 'mq' },
  'anse-madame': { name: 'Anse Madame', island: 'mq' },
  'diamant': { name: 'Le Diamant', island: 'mq' },
  'pt-marin': { name: 'Pointe du Marin', island: 'mq' },
  'sainte-anne': { name: 'Sainte-Anne', island: 'mq' },
  'les-salines': { name: 'Les Salines', island: 'mq' },
  'vauclin': { name: 'Le Vauclin', island: 'mq' },
  'gp-grande-anse': { name: 'Grande Anse', island: 'gp' },
  'gp-malendure': { name: 'Malendure', island: 'gp' },
  'gp-sainte-anne': { name: 'Sainte-Anne', island: 'gp' },
  'gp-pt-chateaux': { name: 'Pointe des Châteaux', island: 'gp' },
  'gp-gosier': { name: 'Le Gosier', island: 'gp' },
  'gp-caravelle': { name: 'La Caravelle', island: 'gp' },
  'gp-bas-du-fort': { name: 'Bas du Fort', island: 'gp' },
  'gp-deshaies': { name: 'Deshaies', island: 'gp' },
  'gp-moule': { name: 'Le Moule', island: 'gp' },
  'gp-vieux-fort': { name: 'Vieux-Fort', island: 'gp' },
}

const REGION = {
  mq: { name: 'Martinique', domain: 'sargasses-martinique.com', label: 'MARTINIQUE' },
  gp: { name: 'Guadeloupe', domain: 'sargasses-guadeloupe.com', label: 'GUADELOUPE' },
}

const SEUIL_FIABILITE = 85 // % de réussite backtest minimum pour autoriser un « streak »

// ── Helpers données ─────────────────────────────────────────────
const loadJSON = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }

function loadSarg() {
  return loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'))
}
function loadBacktest() {
  return loadJSON(path.join(DATA_DIR, 'backtest-results.json'))
}
const islandOf = id => (String(id).startsWith('gp-') ? 'gp' : 'mq')
const beachName = id => (PIPELINE_BEACHES[id] ? PIPELINE_BEACHES[id].name : id)

/** Niveaux du pipeline filtrés par région (mq/gp). */
function levelsForRegion(sarg, region) {
  return (sarg.levels || []).filter(l => islandOf(l.id) === region)
}

/**
 * Plages « fiables » : statusHitRate backtest ≥ SEUIL_FIABILITE.
 * Seules celles-ci peuvent porter un streak (garde-fou réputation).
 */
function reliableBeaches(bt, min = SEUIL_FIABILITE) {
  if (!bt || !bt.byBeach) return new Set()
  return new Set(
    Object.entries(bt.byBeach)
      .filter(([, v]) => typeof v.statusHitRate === 'number' && v.pairs > 0 && v.statusHitRate >= min)
      .map(([id]) => id),
  )
}

/**
 * Streak réel d'une plage à J+1 : nombre de jours consécutifs (les plus
 * récents) où la prévision de la veille a touché l'observation satellite.
 * Calculé depuis les paires backtest (horizon 1), jamais inventé.
 * Retourne 0 si la donnée manque.
 */
function currentStreak(bt, slug) {
  if (!bt || !Array.isArray(bt.pairs)) return 0
  const h1 = bt.pairs
    .filter(p => p.beach === slug && p.horizon === 1 && p.targetDate)
    .sort((a, b) => (a.targetDate < b.targetDate ? 1 : -1)) // récent d'abord
  let n = 0
  for (const p of h1) {
    if (p.statusHit === 1) n++
    else break
  }
  return n
}

// ── Helpers texte / SVG ─────────────────────────────────────────
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Découpe un texte en lignes par budget de caractères (SVG <text> ne wrap pas).
 * Budget conservateur car les métriques de police diffèrent sous librsvg.
 */
function wrapLines(text, maxChars) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) { lines.push(line); line = w }
    else line = line ? line + ' ' + w : w
  }
  if (line) lines.push(line)
  return lines
}

/** PRNG déterministe seedé (défi du jour stable sur 24 h). */
function seededRand(seedStr) {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function shuffleSeeded(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Date du jour ISO (YYYY-MM-DD) — accepte un override pour tests reproductibles. */
function todayISO() { return new Date().toISOString().slice(0, 10) }
function dateLongFR(iso) {
  const d = new Date(iso + 'T12:00:00Z')
  if (isNaN(d)) return iso
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// ── Briques SVG réutilisables ───────────────────────────────────
/** <defs> communs : fond dégradé + vignette douce. */
function commonDefs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${PALETTE.ink}"/>
      <stop offset="1" stop-color="${PALETTE.ink2}"/>
    </linearGradient>
    <radialGradient id="vign" cx="0.5" cy="0.32" r="0.85">
      <stop offset="0.55" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.34)"/>
    </radialGradient>
    <linearGradient id="goldgrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFD75A"/><stop offset="1" stop-color="${PALETTE.gold}"/>
    </linearGradient>
  </defs>`
}

/** Bandeau de marque (wordmark) en haut. */
function wordmark(x, y, text, opts = {}) {
  const size = opts.size || 22
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="800" letter-spacing="${size * 0.16}" fill="${opts.fill || PALETTE.gold}">${esc(text)}</text>`
}

/** Filigrane domaine en bas (texte gravé, jamais un lien). */
function domainWatermark(W, H, domain) {
  const y = H - 56
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="1.5" fill="${PALETTE.white}" opacity="0.92">${esc(domain)}</text>
    <text x="${W / 2}" y="${y + 34}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="600" letter-spacing="2.5" fill="${PALETTE.mut2}">SATELLITE COPERNICUS · 4×/JOUR · GRATUIT</text>`
}

/** Pastille de statut (couleur + libellé). */
function statusPill(x, y, status) {
  const s = STATUS[status] || STATUS.clean
  const w = 200
  return `<rect x="${x}" y="${y}" rx="26" ry="26" width="${w}" height="52" fill="${s.color}" opacity="0.16"/>
    <circle cx="${x + 30}" cy="${y + 26}" r="9" fill="${s.color}"/>
    <text x="${x + 50}" y="${y + 34}" font-family="${FONT}" font-size="26" font-weight="800" fill="${s.color}">${esc(s.fr)}</text>`
}

/**
 * Rasterise une chaîne SVG → PNG via sharp. Crée le dossier de sortie.
 * Retourne { path, bytes, width, height }.
 */
async function renderSVG(svg, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath)
  const meta = await sharp(outPath).metadata()
  return { path: outPath, bytes: fs.statSync(outPath).size, width: meta.width, height: meta.height }
}

module.exports = {
  ROOT, DATA_DIR, OUT_DIR, PALETTE, SCORE_COLORS, STATUS, FONT,
  PIPELINE_BEACHES, REGION, SEUIL_FIABILITE,
  loadJSON, loadSarg, loadBacktest, islandOf, beachName, levelsForRegion,
  reliableBeaches, currentStreak,
  esc, wrapLines, seededRand, shuffleSeeded, todayISO, dateLongFR,
  commonDefs, wordmark, domainWatermark, statusPill, renderSVG,
}
