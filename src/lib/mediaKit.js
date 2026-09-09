/**
 * mediaKit.js — socle HARD ASSET REQUIREMENT (2026-09-07).
 *
 * Helpers PURS (importables en node pour les tests contrat, zéro dépendance,
 * zéro window au import). Toute logique qui touche les données réelles vit ici
 * pour être verrouillée par `scripts/tests/media-kit.test.cjs`.
 *
 * Règles produit appliquées :
 * - Naming déterministe : beach-{beachId}-{kind}.{ext}
 * - Provenance classée (jamais de tiers passé pour du propriétaire)
 * - AUCUNE fabrication : unlockedRows() ne retourne que des jours RÉELS
 *   débloqués ; le reste = gated (cadenas), jamais une couleur inventée.
 */

// ── Événements média canoniques (§9 HARD ASSET REQUIREMENT) ──
const MEDIA_EVENTS = [
  "sg_svg_view",
  "sg_photo_view",
  "sg_video_view",
  "sg_video_start",
  "sg_video_25",
  "sg_video_50",
  "sg_video_75",
  "sg_video_complete",
  "sg_gif_view",
  "sg_pdf_preview",
  "sg_pdf_open",
  "sg_pdf_download",
  "sg_pdf_share",
]

// ── Provenance (§7) ──
const PROVENANCE = {
  OWNER_GENERATED: "OWNER_GENERATED", // produit par Sargagame (SVG, rapport, drift-strip)
  USER_GENERATED: "USER_GENERATED",   // signalements terrain approuvés
  COMMUNITY: "COMMUNITY",             // photos visiteurs modérées (Supabase)
  SATELLITE: "SATELLITE",             // ERDDAP / Sentinel-MODIS (source unique)
  PARTNER: "PARTNER",                 // encart sponsorisé (ne touche JAMAIS le verdict)
  THIRD_PARTY: "THIRD_PARTY",         // NASA/JPL Sentinel-6 (domaine public, crédit)
}

// ── Naming déterministe (§6) : beach-{id}-{kind}.{ext} ──
function slugId(id) {
  return String(id == null ? "unknown" : id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
}
function beachAssetName(beachId, kind, ext) {
  const k = String(kind || "asset").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "asset"
  const e = String(ext || "bin").toLowerCase().replace(/[^a-z0-9]+/g, "") || "bin"
  return "beach-" + slugId(beachId) + "-" + k + "." + e
}

// ── Lignes rapport honnêtes (§8 + moat) ──
// fcDays : série J0→J6 (peut contenir des placeholders {_ph:true} ou _loading).
// unlocked : true si premium OU « Ma plage » (série réelle complète offerte).
// Retourne {rows, gated} — rows = jours RÉELS affichables, gated = booléen
// « il existe des jours verrouillés ». Gratuit : J0–J1 réels UNIQUEMENT.
function unlockedRows(fcDays, unlocked) {
  const days = Array.isArray(fcDays) ? fcDays.slice(0, 7) : []
  const real = (d) => d && !d._ph && d.status && d.status !== "_loading"
  if (unlocked) {
    const rows = days.filter(real)
    return { rows, gated: days.length > rows.length }
  }
  const rows = days.slice(0, 2).filter(real)
  const gated = days.length > rows.length || days.some((d) => !real(d))
  return { rows, gated: days.length === 0 ? false : gated }
}

// ── Params analytics (§9) : beach_id, region, screen, asset_id, type — JAMAIS de PII ──
function mediaParams(o) {
  o = o || {}
  const p = {}
  if (o.beach_id != null) p.beach_id = String(o.beach_id)
  if (o.region != null) p.region = String(o.region)
  if (o.screen != null) p.screen = String(o.screen)
  if (o.asset_id != null) p.asset_id = String(o.asset_id)
  if (o.asset_type != null) p.asset_type = String(o.asset_type)
  if (o.source != null) p.source = String(o.source)
  if (o.interaction != null) p.interaction = String(o.interaction)
  if (o.render != null) p.render = String(o.render)
  return p
}

// ── Safe wrapper tracking (jamais de throw si track absent) ──
function trackMedia(trackFn, event, params) {
  try {
    const fn = trackFn || (typeof window !== "undefined" && window.track) || null
    if (typeof fn === "function") fn(event, params || {})
  } catch (_) {}
}

// ── prefers-reduced-motion (safe SSR/node) ──
function prefersReducedMotion() {
  try {
    return !!(typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  } catch (_) { return false }
}

// ESM pur (même pattern que src/lib/pass-price.js) — le test contrat
// l'importe via `await import()` côté node, Vite côté front.
export { MEDIA_EVENTS, PROVENANCE, slugId, beachAssetName, unlockedRows, mediaParams, trackMedia, prefersReducedMotion }
