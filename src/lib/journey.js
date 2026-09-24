/**
 * journey.js — « WORLD SPINE » (WOW JOURNEY / CONTINUITY, 2026-09-24).
 *
 * PROBLEM : l'app était une succession de pages/modales — experience plage,
 *   TripPlanner, carte, chacun avec sa propre plomberie. Un switch de plage
 *   (backup) REMONTait toute l'expérience (key=beach.id) sans aucun fil
 *   continu → sentiment « j'ai changé de page ».
 * CHANGE : une seule source de vérité « séjour » (journeyFor) partagée entre
 *   l'experience ET le TripPlanner : plage active, semaine réelle (forecast
 *   satellite), plan B réel (findAlternatives), plage précédente (pile
 *   in-world de la session). Le parent (Sargasses_PROD) la calcule une fois
 *   et la passe aux deux surfaces = MÊME objet numérique, transformé.
 * DATA : 100 % réelle — forecastById (weekly réel, même source que la carte)
 *   + findAlternatives (même module que la fiche). Jamais d'invention :
 *   forecast absent → days=[] ; pas de plan B confirmé → backup=null.
 * ROLLBACK : ?sgjourney=0 → journeyOff() true → rail/strip/history/swipe
 *   absents, produit identique à l'avant.
 *
 * Pur module (pas d'import Sargasses_PROD — pas de cycle) :
 *   journeyOff()                    — kill-switch du layer entier
 *   journeyFor({beach, forecastById, allBeaches, lang, isPremium})
 *     → { beachId, beachName, days:[{i,label,date,status,confidence,locked}],
 *         backup:{id,name,status,distanceKm,beach}|null, critDay:int|null }
 *   statusColor(status)             — couleur statut (palette produit)
 */
import { findAlternatives } from "./beach-decision.js"

export const journeyOff = () => {
  try { return /[?&]sgjourney=0(?:&|$)/.test(window.location.search) } catch (_) { return false }
}

// Palette statut = celle de l'experience/fiche (clean/moderate/alert).
const STATUS_COLOR = { clean: "#22C55E", moderate: "#B87A00", alert: "#E8522A" }
export const statusColor = (s) => STATUS_COLOR[s] || "#8A8F98"

// maxAlternatives 3 : même cadence que BeachExperience/PremiumModal ; le pick
// privilégie un backup CLEAN (destination réelle) sinon le 1er candidat.
export function journeyFor({ beach, forecastById, allBeaches, lang, isPremium }) {
  try {
    if (!beach || !beach.id) return null
    const days = []
    const fc = forecastById && forecastById[beach.id] ? forecastById[beach.id].forecast : null
    if (Array.isArray(fc) && fc.length) {
      for (let i = 0; i < Math.min(7, fc.length); i++) {
        const d = fc[i]
        if (!d) continue
        days.push({
          i,
          label: d.day || "",
          date: d.date || "",
          status: d.status || null,
          confidence: (d.confidence != null ? d.confidence : null),
          locked: !!(!isPremium && i >= 2),
        })
      }
    }
    let backup = null
    try {
      const alts = findAlternatives(beach, allBeaches || [], { lang, maxAlternatives: 3 }) || []
      const pick = alts.find(a => a && a.beach && a.beach.status === "clean") || alts[0] || null
      if (pick && pick.beach && pick.beach.id) {
        backup = {
          id: pick.beach.id,
          name: pick.beach.name || "",
          status: pick.beach.status || null,
          distanceKm: (pick.distanceKm != null ? pick.distanceKm : null),
          beach: pick.beach,
        }
      }
    } catch (_) { backup = null }
    // critDay = 1er jour à éviter (le jour où le plan B compte vraiment) ;
    // null si la semaine est propre — honnêteté : pas de fausse alerte.
    let critDay = null
    for (const d of days) { if (d.status === "alert") { critDay = d.i; break } }
    return { beachId: beach.id, beachName: beach.name || "", days, backup, critDay }
  } catch (_) { return null }
}
