// segment.js — Segmentation visiteur FIRST-PARTY (zéro tracking externe).
//
// But : (1) adapter le MESSAGE de l'offre au segment, (2) MESURER la valeur PAR
// segment (réponse data à « assez de valeur ? »). Signaux honnêtes seulement :
// le site (FR île vs USD = touriste), la page d'ENTRÉE (planification vs map),
// et le visiteur récurrent (a déjà laissé un email / joué / acheté un pass).
//
// 4 segments :
//   voyageur       — site USD (Miami/Cancún/Punta Cana) = touriste par nature.
//   planificateur  — entré par une page prévisions / mois / conditions = prépare un séjour.
//   habitue        — récurrent / engagé (email, jeu, pass) = réflexe régulier (souvent local).
//   decouverte     — première touche, pas de signal fort.

const ENTRY = (typeof location !== "undefined") ? (location.pathname || "/") : "/"
const PLANNING = /previsions|conditions|alertes|\/plages|sargasses-[a-z]+-20\d\d|forecast|alerts|pronostico|temporada/i

export function getSegment() {
  try {
    const host = location.hostname || ""
    const foreign = !/martinique|guadeloupe/.test(host)            // sites USD = touristes
    const hasEmail = !!localStorage.getItem("sg_email")
    const returning = hasEmail
      || !!localStorage.getItem("sg_rel_seen")                     // a vu le journal des nouveautés
      || !!localStorage.getItem("sg_best")                         // a joué à SargaCatch
      || !!localStorage.getItem("sg_premium_pass_end")             // a déjà eu un pass
    const planning = PLANNING.test(ENTRY) || /[?&]utm_/.test(location.search)
    if (foreign) return "voyageur"
    if (planning) return "planificateur"
    if (returning) return "habitue"
    return "decouverte"
  } catch { return "decouverte" }
}

// Pass mis en avant par segment (tous → 30 j pour l'instant ; le message change,
// le hero peut diverger plus tard si la data le justifie).
export const SEG_HERO = { voyageur: "p30", planificateur: "p30", habitue: "p30", decouverte: "p30" }
