/**
 * sg-visual.js — helpers visuels « 2026-09-25E » (VISUAL / UX OVERHAUL).
 *
 * Que du RÉEL : photos jamais inventées (beachImageUrl), proximité calculée
 * sur coords réelles (haversine), facts issus des flags plage uniquement.
 * Pur module (zéro import produit — testable Node).
 *
 * Rollback global : ?sgvis=0 → visOff() true → les blocs E sont masqués,
 * le produit retombe à l'état D (PR #746).
 */

export const visOff = () => {
  try { return /[?&]sgvis=0(?:&|$)/.test(window.location.search) } catch (_) { return false }
}

function toRad(d) { return (d * Math.PI) / 180 }

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
  return Number.isFinite(d) ? d : null
}

function isLeewardLocal(beach, islandBeaches) {
  if (!beach || beach.lng == null) return null
  const WIN = { mq: -61.1, gp: -61.6 }
  const win = WIN[beach.island]
  if (win != null) return beach.lng < win
  const lngs = (islandBeaches || [])
    .filter(x => x && x.lng != null && x.island === beach.island)
    .map(x => x.lng).sort((a, b) => a - b)
  if (lngs.length < 4 || beach.island == null) return null
  return beach.lng <= lngs[Math.floor((lngs.length - 1) * 0.25)]
}

/**
 * Plages les plus proches (coords réelles uniquement).
 * Même île d'abord (exposition comparable), puis autres îles.
 * Tri : clean d'abord (découverte utile), puis distance.
 * → [{ beach, distanceKm }] — jamais de plage sans coords.
 */
export function nearestBeaches(beach, allBeaches, n = 3) {
  try {
    if (!beach || beach.lat == null || beach.lng == null) return []
    const rank = s => (s === "clean" ? 0 : s === "moderate" ? 1 : 2)
    const rows = []
    for (const b of (allBeaches || [])) {
      if (!b || !b.id || b.id === beach.id) continue
      if (b.lat == null || b.lng == null) continue
      const d = haversineKm(beach.lat, beach.lng, b.lat, b.lng)
      if (d == null) continue
      rows.push({ beach: b, distanceKm: Math.round(d * 10) / 10, same: b.island === beach.island })
    }
    rows.sort((a, b) =>
      ((a.same ? 0 : 1) - (b.same ? 0 : 1))
      || (rank(a.beach.status) - rank(b.beach.status))
      || (a.distanceKm - b.distanceKm))
    return rows.slice(0, Math.max(0, n))
  } catch (_) { return [] }
}

/**
 * Faits « bon à savoir » — flags plage RÉELS uniquement.
 * → [{ icon (sg-icons), text }] — [] si rien de connu (la section se masque).
 */
export function beachFacts(beach, allBeaches, lang = "fr") {
  try {
    if (!beach) return []
    const T = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr)
    const out = []
    const lee = isLeewardLocal(beach, allBeaches || [])
    if (lee === true) out.push({ icon: "sunset", text: T("Côte sous le vent (ouest) — versant abrité de l'île.", "Leeward coast (west) — the sheltered side.", "Costa de sotavento (oeste) — lado protegido.") })
    else if (lee === false && beach.lng != null && beach.island != null) out.push({ icon: "wave", text: T("Côte au vent (est) — versant exposé de l'île.", "Windward coast (east) — more exposed side.", "Costa de barlovento (este) — lado más expuesto.") })
    if (Number.isFinite(beach.drive) && beach.drive > 0) out.push({ icon: "pin", text: T(`${beach.drive} min en voiture depuis la ville principale`, `${beach.drive} min drive from the main town`, `${beach.drive} min en coche desde la ciudad principal`) })
    if (beach.kids) out.push({ icon: "family", text: T("Adaptée aux enfants (flag plage)", "Suitable for children (beach flag)", "Apta para niños (flag)") })
    if (beach.snorkel) out.push({ icon: "snorkel", text: T("Spot snorkeling (flag plage)", "Snorkeling spot (beach flag)", "Spot snorkel (flag)") })
    if (beach.parking) out.push({ icon: "parking", text: T("Parking dédié (flag plage)", "Dedicated parking (beach flag)", "Estacionamiento dedicado (flag)") })
    return out.slice(0, 5)
  } catch (_) { return [] }
}

/**
 * Âge de la donnée satellite en heures (honnêteté : null si inconnu).
 */
export function dataAgeHours(sargData) {
  try {
    const ts = (sargData && (sargData.erddapTimestamp || sargData.updatedAt)) || null
    if (!ts) return null
    const h = (Date.now() - new Date(ts).getTime()) / 3.6e6
    return h >= 0 && Number.isFinite(h) ? h : null
  } catch (_) { return null }
}
