/**
 * marine.js — conditions marines temps réel (2026-09-25F, DATA INTELLIGENCE).
 *
 * Source : Open-Meteo Marine API (gratuit, sans clé, par coords) — MÊME
 * provider que useWeather() (Sargasses_PROD.jsx), mêmes endpoints.
 *   https://marine-api.open-meteo.com/v1/marine?latitude=..&longitude=..
 *   &current=wave_height,wave_direction,swell_wave_height
 * Fréquence : temps réel à l'ouverture (fetch paresseux, jamais en rafale).
 * Couverture : toutes coords (196/196 plages). Champs : vagues, houle, direction.
 * Limites : pas de vent (route weather, pas marine) — le vent pour la voile
 *   reste une source FUTURE documentée, pas un input silencieux.
 * Cache : mémoire 30 min (pas de quota disque, pas de PII).
 *
 * Seuils = CEUX de src/lib/conditions-filters.js (source unique métier) :
 *   mer calme    : vagues < 0,8 m
 *   snorkeling   : vagues < 1,0 m (visibilité)
 *   mer agitée   : vagues ≥ 1,5 m
 */

export const CALM_WAVE = 0.8
export const SNORKEL_WAVE = 1.0
export const ROUGH_WAVE = 1.5

const TTL_MS = 30 * 60 * 1000
const _cache = new Map()

export const marineSourceLabel = (lang = "fr") =>
  lang === "en" ? "Open-Meteo marine · live" : lang === "es" ? "Open-Meteo marine · en vivo" : "Open-Meteo marine · temps réel"

/** État de mer depuis une mesure (pur, testable). */
export function marineState(marine) {
  try {
    const h = marine && marine.waveHeight
    if (h == null || !Number.isFinite(h)) return null
    if (h < CALM_WAVE) return "calm"
    if (h >= ROUGH_WAVE) return "rough"
    return "moderate"
  } catch (_) { return null }
}

/**
 * Aptitude snorkeling avec mer réelle (pur, testable).
 * → { ok:true } si flag + eau propre + vagues < 1,0 m (même règle que
 *   conditions-filters.js) ; { ok:false, reason } sinon ; { ok:null } sans mesure.
 */
export function snorkelSea(beach, marine) {
  try {
    if (!beach || !beach.snorkel) return { ok: null, reason: "no-flag" }
    if (beach.status !== "clean") return { ok: false, reason: "status" }
    const h = marine && marine.waveHeight
    if (h == null || !Number.isFinite(h)) return { ok: null, reason: "no-marine" }
    return h < SNORKEL_WAVE ? { ok: true, reason: "calm" } : { ok: false, reason: "waves" }
  } catch (_) { return { ok: null, reason: "error" } }
}

/** Fetch paresseux (1 plage = 1 appel, cache 30 min). Jamais de throw. */
export async function fetchMarine(beach, fetchImpl = null) {
  try {
    if (!beach || beach.lat == null || beach.lng == null) return null
    const key = beach.id || `${beach.lat},${beach.lng}`
    const hit = _cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null)
    if (!f) return null
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${beach.lat}&longitude=${beach.lng}&current=wave_height,wave_direction,swell_wave_height&timezone=America%2FMartinique`
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort() } catch (_) {} }, 8000) : null
    const r = await f(url, ctrl ? { signal: ctrl.signal } : undefined)
    if (timer) clearTimeout(timer)
    if (!r || !r.ok) return null
    const j = await r.json()
    const c = (j && j.current) || {}
    if (c.wave_height == null) return null
    const data = {
      waveHeight: c.wave_height, swellHeight: c.swell_wave_height ?? null,
      waveDir: c.wave_direction ?? null, at: new Date().toISOString(),
    }
    _cache.set(key, { at: Date.now(), data })
    return data
  } catch (_) { return null }
}

export function clearMarineCache() { _cache.clear() }
