import React, { useMemo, useState, useEffect } from "react"
import { DecisionCard } from "./DecisionCard.jsx"
import { BeachStatus } from "./BeachStatus.jsx"
import { WhyCard } from "./WhyCard.jsx"
import { AlternativeCard } from "./AlternativeCard.jsx"
import { ActivityCard } from "./ActivityCard.jsx"
import { NearbyCard } from "./NearbyCard.jsx"
import { GoCTA } from "./GoCTA.jsx"
import { TripCard } from "./TripCard.jsx"
import { findAlternatives, haversineKm } from "../lib/beach-decision.js"
import { beachImageUrl, beachMedia } from "../lib/beach-media.js"
import { track } from "../Sargasses_PROD.jsx"
import { _t } from "../Sargasses_PROD.jsx"
import { evidenceFor, sourceShort } from "../lib/intent-evidence.js"
import { journeyFor, journeyOff } from "../lib/journey.js"
import { planOff } from "./PlanCard.jsx"

const INK = "#0d0b14"
const GOLD = "#FFC72C"
const CARD_BG = "#fff"
const CARD_BORDER = `2px solid ${INK}`
const CARD_RADIUS = 16
const CARD_SHADOW = `3px 3px 0 ${INK}`

const cardStyle = {
  background: CARD_BG,
  border: `2px solid ${INK}`,
  borderRadius: 16,
  boxShadow: `3px 3px 0 ${INK}`,
  padding: 16,
  margin: "8px 0",
  fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
}

const sectionStyle = {
  marginBottom: 16
}

const h2Style = {
  margin: 0,
  fontSize: "clamp(18px,5vw,22px)",
  fontWeight: 800,
  letterSpacing: ".02em",
  textTransform: "uppercase",
  color: INK,
  marginBottom: 12
}

const h3Style = {
  margin: "0 0 12px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: INK,
  borderBottom: "2px solid #eee",
  paddingBottom: 8
}

/**
 * BeachDecisionPage — SEE → DECIDE → GO → PROTECT
 * Assembles existing components into a decision-first beach page.
 * Replaces the comic-style BeachSheetComic with a decision-first flow.
 */
export function BeachDecisionPage({
  beach,
  allBeaches = [],
  lang = "fr",
  userPos,
  isPremium = false,
  sargData,
  imageMap = null,
  heroVids = null,
  onClose,
  onOpenBeach,
  onPremium,
  onPlanTrip,
  track,
  favorites = [],
  isPremium: premiumFlag = false,
  journey,
  forecastById
}) {

  // Early exit - loading/empty
  if (!beach) {
    return React.createElement("div", {
      style: {
        position: "fixed", inset: 0, background: "#0d1117", color: "#fff",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 24, textAlign: "center",
        fontFamily: "system-ui,sans-serif"
      }
    },
      React.createElement("div", { style: { fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" } },
        React.createElement("div", { style: { fontSize: 48, marginBottom: 16 } }, "🏖️"),
        React.createElement("h2", { style: { fontFamily: "'Anton',sans-serif", fontSize: 24, margin: 0 } },
          _t(lang, "Chargement de la plage...", "Loading beach...", "Cargando playa...")),
        React.createElement("p", { style: { opacity: 0.7, marginTop: 8 } },
          _t(lang, "Récupération des données satellite...", "Fetching satellite data...", "Obteniendo datos satelitales..."))
      )
    )
  }

  // Early exit - not found
  if (!beach.status || beach.lat == null || beach.lng == null) {
    return React.createElement("div", {
      style: {
        position: "fixed", inset: 0, background: "#0d1117", color: "#fff",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 24, textAlign: "center",
        fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
      }
    },
      React.createElement("div", { style: { fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" } },
        React.createElement("h2", { style: { fontFamily: "'Anton',sans-serif", fontSize: 24, marginBottom: 12 } },
          _t(lang, "Plage introuvable", "Beach not found", "Playa no encontrada")),
        React.createElement("p", { style: { opacity: 0.7, marginBottom: 16 } },
          _t(lang, "La plage demandée n'existe pas ou les données sont indisponibles.", "The requested beach doesn't exist or data is unavailable.", "La playa solicitada no existe o los datos no están disponibles.")),
        React.createElement("button", {
          onClick: onClose,
          style: {
            marginTop: 16, padding: "12px 24px", borderRadius: 999,
            background: GOLD, color: INK, fontWeight: 800, fontSize: 16,
            border: `2px solid ${INK}`, cursor: "pointer"
          }
        }, _t(lang, "← Retour à la carte", "← Back to map", "← Volver al mapa"))
      )
    )
  }

  // Compute live status from sargData
  const live = sargData?.levels?.find(l => l.id === beach.id) || sargData?.levels?.find(l => l.id === (beach.sargId || beach.id))
  const liveStatus = live?.status || beach.status
  const liveScore = typeof live?.score === "number" ? live.score : beach.score
  const liveConfidence = live?.confidence ?? beach.confidence
  const liveUpdatedAt = live?.updatedAt || sargData?.updatedAt

  // Status meta
  const statusMeta = {
    clean: { label: _t(lang, "Propre", "Clean", "Limpia"), color: "#22C55E", bg: "#E4F6EC", go: _t(lang, "On y va", "Go", "Vamos") },
    moderate: { label: _t(lang, "Risque", "Caution", "Riesgo"), color: "#B87A00", bg: "#FFF3D6", go: _t(lang, "Prudence", "Caution", "Cuidado") },
    avoid: { label: _t(lang, "À éviter", "Avoid", "Evitar"), color: "#E8512A", bg: "#FDE7DF", go: _t(lang, "On évite", "Avoid", "Evitar") }
  }[liveStatus] || { label: _t(lang, "Inconnu", "Unknown", "Desconocido"), color: "#9aa0a8", bg: "#eee", go: _t(lang, "Vérifier", "Check", "Verificar") }

  const statusLabel = liveStatus ? statusMeta.label : _t(lang, "Données indisponibles", "Data unavailable", "Datos no disponibles")
  const statusColor = liveStatus ? statusMeta.color : "#9aa0a8"

  // Alternatives
  const alternatives = useMemo(() => {
    if (!allBeaches || allBeaches.length === 0) return []
    return findAlternatives(beach, allBeaches, { lang, maxAlternatives: 3 })
  }, [beach, allBeaches, lang])

  // Journey / trip planning
  const tripJourney = journey ? journeyFor({ beach, forecastById, allBeaches, lang, isPremium }) : null

  // Close handler
  const handleClose = () => {
    onClose?.()
  }

  // Track beach view
  useEffect(() => {
    if (beach?.id) {
      track?.("sg_beach_view", { beach_id: beach.id, status: liveStatus })
    }
  }, [beach?.id, track])

  // Helper for GO click tracking
  const handleGoClick = (e) => {
    track?.("sg_beach_go_click", { beach_id: beach.id, status: liveStatus })
    // Default behavior - open beach detail (could be replaced with navigation)
  }

  // Helper for alternative click
  const handleAlternativeClick = (altBeach) => {
    track?.("sg_alternative_click", { from_beach: beach.id, to_beach: altBeach.id })
    onOpenBeach?.(altBeach)
  }

  // Hero image
  const heroImg = beachImageUrl(beach.id, imageMap)

  // Evidence for WHY section
  const evidence = evidenceFor("top", beach, lang)
  const reasons = !evidence.blocked ? evidence.evidence.slice(0, 3) : []

  // Helper to format freshness
  const formatFreshness = (ts, lang) => {
    if (!ts) return null
    const h = (Date.now() - new Date(ts).getTime()) / 3.6e6
    if (h < 0) return null
    if (h < 12) return `Satellite ${Math.max(1, Math.round(h))}h ago`
    if (h < 48) return `Updated ${Math.round(h)}h ago`
    return `Data ${Math.round(h / 24)}d old`
  }

  // Helper for distance
  const formatDistance = (km) => {
    if (km < 1) return `< 1 km`
    return `${Math.round(km)} km`
  }

  // Render
  return React.createElement("div", {
    "data-testid": "beach-decision-page",
    style: {
      position: "fixed", inset: 0, background: "#0d1117", color: "#fff",
      overflow: "auto", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
    }
  },
    // Back button
    React.createElement("button", {
      onClick: handleClose,
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
      style: {
        position: "fixed", top: 12, left: 12, zIndex: 100,
        width: 44, height: 44, borderRadius: "50%",
        background: "rgba(255,255,255,.15)", border: "none",
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer"
      }
    }, "←"),

    React.createElement("main", {
      style: {
        padding: "calc(60px + env(safe-area-inset-top)) 16px calc(80px + env(safe-area-inset-bottom))",
        maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16
      }
    },

    // ============ HERO ============
    heroImg && React.createElement("div", {
      style: {
        position: "relative", width: "100%", aspectRatio: "4/3", maxHeight: 280,
        borderRadius: 12, overflow: "hidden", marginBottom: 8
      }
    },
      React.createElement("img", {
        src: heroImg, alt: `${beach.name} — ${beach.commune || ""}`,
        style: { width: "100%", height: "100%", objectFit: "cover" },
        loading: "eager", fetchPriority: "high"
      }),
      // Live badge
      React.createElement("div", {
        style: {
          position: "absolute", top: 12, left: 12, zIndex: 2,
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(13,11,20,.9)", color: "#fff",
          padding: "6px 10px", borderRadius: 999,
          font: "700 11px/1 'Bricolage Grotesque',system-ui,sans-serif"
        }
      },
        React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: statusMeta.color, flexShrink: 0 } }),
        React.createElement("span", { style: { fontWeight: 800, fontSize: 11 } }, statusLabel)
      ),
      // Freshness badge
      liveUpdatedAt && React.createElement("div", {
        style: {
          position: "absolute", bottom: 12, right: 12, zIndex: 2,
          background: "rgba(13,11,20,.9)", color: "#fff",
          padding: "4px 8px", borderRadius: 999,
          font: "600 10px/1 'Bricolage Grotesque',system-ui,sans-serif"
        }
      }, `📡 ${Math.round((Date.now() - new Date(liveUpdatedAt).getTime()) / 3.6e6)}h`),

      // GO CTA on hero (sticky bottom)
      React.createElement(GoCTA, {
        beach, lang, onClick: handleGoClick, track, variant: "hero"
      })
    ),

    // ============ DECIDE — VERDICT ============
    React.createElement("section", { "aria-labelledby": "verdict-title" },
      React.createElement("h2", { id: "verdict-title", style: { ...h2Style, display: "none" } }, _t(lang, "Verdict", "Verdict", "Veredicto")),

      React.createElement("div", { style: { ...cardStyle, background: statusMeta.bg, borderColor: statusMeta.color } },
        // Status row
        React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }
        },
          React.createElement("div", {
            style: {
              display: "inline-flex", alignItems: "center", gap: 6,
              background: statusMeta.color, color: "#fff",
              padding: "4px 10px", borderRadius: 999,
              font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif"
            }
          },
            React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: statusMeta.color, flexShrink: 0 } }),
            React.createElement("span", { style: { fontWeight: 800, fontSize: 13 } }, statusLabel)
          ),
          liveConfidence != null && React.createElement("div", {
            style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#5a5a5a" }
          },
            React.createElement("span", { style: { flexShrink: 0 } }, "★"),
            React.createElement("span", { style: { color: "#e8a800", fontWeight: 800 } }, `${liveConfidence}%`)
          )
        ),

        // Score
        liveScore != null && React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 }
        },
          React.createElement("div", { style: { flex: 1, height: 8, borderRadius: 99, background: "#eee", border: "1px solid #ddd", overflow: "hidden" } },
            React.createElement("div", {
              style: { width: `${Math.max(0, Math.min(100, liveScore))}%`, height: "100%", background: liveScore >= 68 ? "#00B086" : liveScore >= 40 ? "#E8A800" : "#E8512A" }
            })
          ),
          React.createElement("span", { style: { fontWeight: 800, fontSize: 14 } }, `${Math.round(liveScore)}/100`)
        ),

        // Freshness
        liveUpdatedAt && React.createElement("div", {
          style: { fontSize: 11, opacity: 0.7, marginTop: 8 }
        }, `📡 ${formatFreshness(liveUpdatedAt, lang)}`)
      )
    ),

    // ============ DECIDE — WHY ============
    reasons.length > 0 && React.createElement("section", { "aria-labelledby": "why-title", style: sectionStyle },
      React.createElement("h2", { id: "why-title", style: h2Style }, _t(lang, "Pourquoi ?", "Why?", "¿Por qué?")),
      React.createElement("div", { style: cardStyle },
        React.createElement("ul", { style: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 } },
          reasons.map((r, i) => React.createElement("li", {
            key: i, style: {
              display: "flex", gap: 8, alignItems: "flex-start",
              padding: "10px 12px", background: "#fafafa", borderRadius: 10,
              border: "1px solid #eee"
            }
          },
            React.createElement("span", {
              style: {
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 24, height: 24, borderRadius: "50%",
                background: statusMeta.color, color: "#fff",
                font: "700 11px/1 'Bricolage Grotesque',system-ui,sans-serif",
                flexShrink: 0
              }
            }, "✓"),
            React.createElement("span", { style: { flex: 1, fontSize: 13, lineHeight: 1.5 } },
              React.createElement("span", { style: { fontWeight: 800 } }, r.text + " "),
              React.createElement("span", { style: { opacity: 0.65, fontStyle: "normal", fontWeight: 400 } }, `(${sourceShort(r.source, lang)})`)
            )
          ))
        )
      )
    ),

    // ============ GO — CTA ============
    React.createElement("section", { "aria-labelledby": "go-title", style: sectionStyle },
      React.createElement("h2", { id: "go-title", style: { ...h2Style, display: "none" } }, _t(lang, "J'y vais", "I'll go", "Voy")),
      React.createElement(GoCTA, { beach, lang, onClick: handleGoClick, track, variant: "primary" }),
      React.createElement("p", { style: { fontSize: 11, opacity: 0.6, textAlign: "center", marginTop: 8 } },
        _t(lang, "Le Veilleur a vérifié cette plage pour vous.", "The Watcher checked this beach for you.", "El Vigía revisó esta playa por ti.")
      )
    ),

    // ============ GO — PRACTICAL INFO ============
    React.createElement("section", { "aria-labelledby": "practical-title", style: sectionStyle },
      React.createElement("h2", { id: "practical-title", style: h2Style }, _t(lang, "Infos pratiques", "Practical info", "Info práctica")),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        // Distance / access
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
            React.createElement("span", { style: { fontSize: 20 } }, "📍"),
            React.createElement("div", { style: { flex: 1 } },
              React.createElement("div", { style: { fontWeight: 800, fontSize: 14 } }, _t(lang, "Comment s'y rendre", "How to get there", "Cómo llegar")),
              React.createElement("div", { style: { fontSize: 12, opacity: 0.7 } }, _t(lang, "Itinéraire disponible depuis votre position", "Route available from your location", "Ruta disponible desde tu posición"))
            )
          )
        ),
        // Activities
        ActivityCard({ beach, lang }),
        // Nearby
        NearbyCard({ beach, allBeaches, lang })
      )
    ),

    // ============ PROTECT — ALTERNATIVES ============
    liveStatus !== "clean" && React.createElement("section", { "aria-labelledby": "protect-title", style: sectionStyle },
      React.createElement("h2", { id: "protect-title", style: h2Style }, _t(lang, "Pas idéal aujourd'hui ?", "Not ideal today?", "¿No es ideal hoy?")),
      React.createElement("p", { style: { margin: "0 0 12px", color: "#666", fontSize: 13 } },
        _t(lang, "Cette plage n'est pas idéale aujourd'hui. Voici de meilleures options :", "This beach isn't ideal today. Here are better options:", "Esta playa no es ideal hoy. Aquí tienes mejores opciones:")
      ),
      React.createElement(AlternativeCard, {
        beach, allBeaches, lang, maxAlternatives: 3,
        onAlternativeClick: handleAlternativeClick
      })
    ),

    // ============ PLAN / TRIP ============
    tripJourney && React.createElement("section", { "aria-labelledby": "trip-title", style: sectionStyle },
      React.createElement("h2", { id: "trip-title", style: h2Style }, _t(lang, "Mon séjour", "My trip", "Mi estancia")),
      React.createElement(TripCard, { beach, lang, userPos, journey: tripJourney, onOpenBeach, onPlanTrip, track })
    ),

    // ============ ACTIVITIES ============
    ActivityCard({ beach, lang }),

    // ============ NEARBY ============
    NearbyCard({ beach, allBeaches, lang }),

    // ============ PREMIUM UPSELL ============
    !premiumFlag && React.createElement("section", { "aria-labelledby": "premium-title", style: sectionStyle },
      React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } },
          React.createElement("span", { style: { fontSize: 20 } }, "🔭"),
          React.createElement("div", { style: { flex: 1 } },
            React.createElement("div", { style: { fontWeight: 800, fontSize: 16 } }, _t(lang, "Le Pass 7 jours", "7-day Pass", "Pase 7 días")),
            React.createElement("div", { style: { fontSize: 13, opacity: 0.7 } }, _t(lang, "Prévisions 7 jours · Alertes · Historique", "7-day forecast · Alerts · History", "Pronóstico 7 días · Alertas · Historial"))
          )
        ),
        GoCTA({ beach, lang, onClick: () => onPremium?.(), track, variant: "primary" })
      )
    ),

    // Close button
    React.createElement("button", {
      onClick: handleClose,
      style: {
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 100, minHeight: 48, width: "calc(100% - 32px)", maxWidth: 520,
        background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)",
        color: "#fff", borderRadius: 999, padding: "14px 0",
        font: "700 15px/1 'Bricolage Grotesque',system-ui,sans-serif",
        textAlign: "center", cursor: "pointer"
      }
    }, _t(lang, "Fermer", "Close", "Cerrar"))
  )
)
}

export default BeachDecisionPage