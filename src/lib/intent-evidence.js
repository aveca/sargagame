/**
 * intent-evidence.js — contrats « DATA INTELLIGENCE » (2026-09-25F).
 *
 * Chaîne : SOURCE RÉELLE → contrat → intent → recommandation → plan.
 * Chaque recommandation est EXPLICABLE : score déterministe + raisons citées
 * avec leur source. Aucune intention sans donnée → { blocked:true, reason }.
 *
 * Sources (registre, jamais silencieuses) :
 *   satellite : statut + AFAI (Copernicus/ERDDAP, pipeline)
 *   flag      : kids/snorkel/parking (beach objects, régions)
 *   coords    : côte sous le vent (géométrie, seuils MQ/GP)
 *   drive     : temps d'accès (donnée plage)
 *   forecast  : prévision 7j (même moteur que carte/trip)
 *   marine    : Open-Meteo marine temps réel (fetch client, par coords)
 *   media     : catalogue photo/vidéo réel
 *
 * Formule de score (déterministe, expliquée, jamais absolue) :
 *   base statut : clean 70 / moderate 40 / avoid 10 / inconnu → blocked
 *   +15 si le flag du intent est présent (snorkel/family/easy)
 *   +10 si côte sous le vent ET intent sunset
 *   +0..10 score plage / 10 (arrondi)
 *   = 10..100. Confidence : high si statut+score connus, medium sinon.
 *
 * Intents BLOQUÉS (aucune source — activation interdite, raisons exactes) :
 *   diving   : pas de donnée profondeur/spot (le flag snorkel ≠ plongée)
 *   fishing  : pas de flag pêche/port/rampe (seul signal = heuristique noms
 *              de communes côté VisitPlan legacy, pas une source)
 *   sailing  : pas de flag mouillage/cale/école (vent Open-Meteo seul = insuffisant)
 *   romantic : aucun signal mesurable (pas de proxy honnête)
 *   wild     : pas de flag isolement (drive+parking = proxy non prouvé)
 *
 * Pur module (zéro import produit — réutilisable B2C/B2B/B2G, testable Node).
 * Interface future B2B/B2G : evidenceFor() + tipsFor() + INTENT_REGISTRY.
 */

const T = (lang, fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr)

export const SOURCES = {
  satellite: { fr: "satellite", en: "satellite", es: "satélite" },
  flag: { fr: "flag plage", en: "beach flag", es: "flag" },
  coords: { fr: "coords", en: "coords", es: "coords" },
  drive: { fr: "donnée plage", en: "beach data", es: "dato playa" },
  forecast: { fr: "prévision 7j", en: "7-day forecast", es: "pronóstico 7d" },
  marine: { fr: "Open-Meteo marine", en: "Open-Meteo marine", es: "Open-Meteo marine" },
}

export const sourceShort = (key, lang = "fr") => {
  const s = SOURCES[key]
  return s ? (s[lang] || s.fr) : key
}

// Registre : live = affichable (couverture réelle prouvée), sinon blocked.
export const INTENT_REGISTRY = {
  top: { live: true, needs: ["satellite:status"] },
  snorkel: { live: true, needs: ["flag:snorkel", "satellite:status"] },
  family: { live: true, needs: ["flag:kids"] },
  sunset: { live: true, needs: ["coords:leeward"] },
  easy: { live: true, needs: ["flag:parking"] },
  diving: { live: false, missing: ["depth", "dive_spot"], reason: "no-depth-data" },
  fishing: { live: false, missing: ["fishing_flag", "harbor", "ramp"], reason: "no-fishing-source" },
  sailing: { live: false, missing: ["mooring", "launch", "school"], reason: "no-sailing-source" },
  romantic: { live: false, missing: ["any-measurable-signal"], reason: "no-honest-proxy" },
  wild: { live: false, missing: ["isolation_flag"], reason: "drive-plus-parking-unproven" },
}

export const intentStatus = (intentId) => {
  const r = INTENT_REGISTRY[intentId]
  if (!r) return { live: false, reason: "unknown-intent", missing: [] }
  return r
}

const STATUS_BASE = { clean: 70, moderate: 40, avoid: 10 }

function isLeeward(beach) {
  if (!beach || beach.lng == null) return false
  const WIN = { mq: -61.1, gp: -61.6 }
  const win = WIN[beach.island]
  if (win != null) return beach.lng < win
  return false
}

/**
 * Preuve de recommandation pour un intent LIVE.
 * → { intent, beachId, score, confidence, evidence[{text,source}], updatedAt }
 * → { blocked:true, reason, missing[] } si intent bloqué/inconnu ou statut absent.
 */
export function evidenceFor(intentId, beach, lang = "fr") {
  const reg = intentStatus(intentId)
  if (!reg.live) return { blocked: true, intent: intentId, reason: reg.reason || "unknown-intent", missing: reg.missing || [] }
  if (!beach || beach.id == null || STATUS_BASE[beach.status] == null) {
    return { blocked: true, intent: intentId, reason: "no-status", missing: ["satellite:status"] }
  }
  const evidence = []
  let score = STATUS_BASE[beach.status]
  const stWord = T(lang,
    beach.status === "clean" ? "propre" : beach.status === "moderate" ? "à surveiller" : "à éviter",
    beach.status === "clean" ? "clean" : beach.status === "moderate" ? "to watch" : "to avoid",
    beach.status === "clean" ? "limpia" : beach.status === "moderate" ? "a vigilar" : "a evitar")
  evidence.push({ text: T(lang, `Eau ${stWord} mesurée aujourd'hui`, `Water ${stWord} measured today`, `Agua ${stWord} medida hoy`), source: "satellite" })

  if (intentId === "snorkel" && beach.snorkel) {
    score += 15
    evidence.push({ text: T(lang, "Spot snorkeling", "Snorkeling spot", "Spot snorkel"), source: "flag" })
  }
  if (intentId === "family" && beach.kids) {
    score += 15
    evidence.push({ text: T(lang, "Adaptée aux enfants", "Suitable for children", "Apta para niños"), source: "flag" })
  }
  if (intentId === "easy" && beach.parking) {
    score += 15
    evidence.push({ text: T(lang, "Parking dédié", "Dedicated parking", "Estacionamiento"), source: "flag" })
  }
  if (intentId === "sunset" && isLeeward(beach)) {
    score += 10
    evidence.push({ text: T(lang, "Côte sous le vent (ouest) — versant abrité", "Leeward coast (west) — sheltered side", "Sotavento (oeste) — lado protegido"), source: "coords" })
  }
  if (beach.score != null && Number.isFinite(beach.score)) {
    score += Math.round(Math.max(0, Math.min(100, beach.score)) / 10)
    evidence.push({ text: T(lang, `Score ${Math.round(beach.score)}/100`, `Score ${Math.round(beach.score)}/100`, `Puntuación ${Math.round(beach.score)}/100`), source: "satellite" })
  }
  score = Math.max(10, Math.min(100, score))
  const confidence = (beach.score != null && beach.confidence != null) ? "high" : "medium"
  return {
    intent: intentId, beachId: beach.id, score, confidence,
    evidence: evidence.slice(0, 4), updatedAt: new Date().toISOString(),
  }
}

/**
 * Bons plans / astuces avec PROVENANCE (Phase 6).
 * → [{ kind:'warning'|'tip'|'fact', text, source, confidence:'high'|'medium' }]
 * Chaque règle cite sa source ; rien sans source. [] si rien de justifié.
 */
export function tipsFor(beach, lang = "fr") {
  try {
    if (!beach) return []
    const out = []
    const afai = typeof beach.afai === "number" ? beach.afai : null
    // Warning H2S : sargasses avérées + vieillissement probable (même règle
    // que VisitPlan legacy : afai ≥ 0.40).
    if (beach.status === "avoid" && afai != null && afai >= 0.40) {
      out.push({
        kind: "warning",
        text: beach.kids
          ? T(lang, "Algues en décomposition = gaz (H2S). Déconseillé aux enfants, asthmatiques, femmes enceintes.", "Rotting seaweed = gas (H2S). Not advised for kids, asthma, pregnancy.", "Algas en descomposición = gas (H2S). No recomendado a niños, asmáticos, embarazadas.")
          : T(lang, "Algues en décomposition = gaz (H2S). Si tu sens l'œuf pourri, éloigne-toi.", "Rotting seaweed = gas (H2S). If you smell rotten eggs, move away.", "Algas en descomposición = gas (H2S). Si hueles a huevo podrido, aléjate."),
        source: "satellite", confidence: "high",
      })
    }
    // Tip masque : spot + eau propre + AFAI bas (même règle que VisitPlan).
    if (beach.snorkel && beach.status === "clean" && (afai == null || afai < 0.3)) {
      out.push({
        kind: "tip",
        text: T(lang, "Masque-tuba recommandé ici.", "Bring your snorkel mask.", "Trae tu máscara de snorkel."),
        source: "flag", confidence: "high",
      })
    }
    // Fact abrité : géométrie réelle + eau propre.
    if (isLeeward(beach) && beach.status === "clean") {
      out.push({
        kind: "fact",
        text: T(lang, "Côte abritée : reçoit rarement les sargasses, valeur sûre.", "Sheltered coast: rarely gets sargassum, a safe bet.", "Costa protegida: rara vez recibe sargazo."),
        source: "coords", confidence: "medium",
      })
    }
    // Fact parking : flag réel.
    if (beach.parking === false) {
      out.push({
        kind: "fact",
        text: T(lang, "Pas de parking aménagé : viens tôt ou en 2-roues.", "No real parking: come early or on two wheels.", "Sin estacionamiento: llega temprano o en moto."),
        source: "flag", confidence: "high",
      })
    }
    // Fact accès : donnée plage réelle.
    if (Number.isFinite(beach.drive) && beach.drive > 0) {
      out.push({
        kind: "fact",
        text: T(lang, `${beach.drive} min en voiture depuis la ville principale`, `${beach.drive} min drive from the main town`, `${beach.drive} min en coche`),
        source: "drive", confidence: "high",
      })
    }
    return out.slice(0, 5)
  } catch (_) { return [] }
}
