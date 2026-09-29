import React from "react"
import { journeyFor } from "../lib/journey.js"
import { _t } from "../Sargasses_PROD.jsx"
import { computeScore } from "../lib/score.js"

const INK = "#0d0b14"
const GOLD = "#FFC72C"

/**
 * TripCard — Carte de plan de séjour/jour
 * Affiche: journée actuelle, fenêtre meilleure, alternatives, CTA séjour
 * États : loading, success, empty, warning, error
 */
export function TripCard({ beach, lang = "fr", userPos, journey, onOpenBeach, onOpenAlt, track }) {
  // État loading - pas de beach
  if (!beach || !beach.id) {
    return React.createElement("div", {
      style: {
        padding: 16, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Chargement du séjour")
  }

  // État error - pas de données de voyage
  if (!journey || !journey.days || journey.days.length === 0) {
    return React.createElement("div", {
      style: {
        padding: 16, color: "#e8512a", fontSize: 14,
        border: "2px solid #e8512a", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Aucun plan de séjour disponible pour cette plage")
  }

  // Compute score pour l'affichage
  const scoreData = computeScore({ afai: beach.afai, wave: beach.wind, wind: beach.wind, sst: beach.sst, cloud: beach.cloud, uv: beach.uv, tide: beach.tide }, lang)

  const statusLabels = {
    clean: _t(lang, "Propre", "Clean", "Limpia"),
    moderate: _t(lang, "Risque", "Caution", "Riesgo"),
    avoid: _t(lang, "À éviter", "Avoid", "Evitar"),
  }

  const statusColors = {
    clean: "#22C55E",
    moderate: "#B87A00",
    avoid: "#E8512A",
  }

  // Trouver le jour propre meilleur
  const betterDay = journey.days.find(d => d.status === "clean" && d.i >= 1) || null
  const todayStatus = betterDay ? betterDay.label || `J+${betterDay.i}` : journey.days[0]?.label || "J+1"

  return React.createElement("section", {
    style: {
      background: "#fff", border: `2px solid ${INK}`, borderRadius: 16,
      boxShadow: `3px 3px 0 ${INK}`, padding: 16, margin: 8, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
    },
    "data-testid": "trip-card"
  },
    React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
        fontSize: 13, fontWeight: 800
      }
    },
      React.createElement("span", {
        style: {
          width: 8, height: 8, borderRadius: "50%", background: statusColors[beach.status] || "#999",
          flexShrink: 0
        }
      }),
      React.createElement("span", null, `${statusLabels[beach.status]} — ${beach.name}`)
    ),
    // Semaine en un coup d'œil
    React.createElement("div", {
      style: {
        margin: "10 0", display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap"
      }
    },
      React.createElement("span", {
        style: {
          fontSize: 10, fontWeight: 800, letterSpacing: ".06em",
          textTransform: "uppercase", opacity: .7, color: "#5a5a5a", flex: "0 0 auto"
        }
      }, _t(lang, "Cette semaine", "This week", "Esta semana")),
      journey.days.slice(0, 7).map((d, i) => {
        const isBetter = d.status === "clean" && d.i >= 1
        const dayLabel = d.label || "J+" + d.i
        const dayStatus = d.status || "?"
        const tooltip = dayLabel + " - " + dayStatus
        return React.createElement("span", {
          key: d.i,
          style: {
            display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2,
            flex: "0 0 auto", padding: "4px 8px", borderRadius: 6,
            background: isBetter ? "#D1FAE5" : "#F3F4F6", color: isBetter ? "#059669" : "#6b7280"
          },
          title: tooltip,
          "aria-label": tooltip,
          onClick: () => { try { track?.("sg_plan_select", { beach_id: beach.id, day: d.i }) } catch (_) {} }
        },
          React.createElement("i", {
            style: {
              width: 10, height: 10, borderRadius: "50%",
              border: `2px solid ${INK}`, background: isBetter ? "#059669" : DOT[d.status] || "#9ca3af"
            }
          }),
          React.createElement("span", { style: { fontSize: 9, fontWeight: 800 } }, `${d.label || "J+" + d.i}`)
        )
      })
    ),
    // Raison du jour
    React.createElement("p", {
      style: {
        margin: "8 0", fontSize: 12, lineHeight: 1.4,
        color: "#333", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical"
      }
    }, betterDay
      ? _t(lang, `Meilleur jour: ${betterDay.label || "J+" + betterDay.i} (${statusLabels[betterDay.status]}).`, `Best day: ${betterDay.label || "J+" + betterDay.i} (${statusLabels[betterDay.status]}).`, `Mejor día: ${betterDay.label || "J+" + betterDay.i} (${statusLabels[betterDay.status]}).`)
      : "Aucun jour optimal identifié"),
    // CTA séjour
    React.createElement("button", {
      type: "button",
      style: {
        marginTop: 10, minHeight: 44, width: "100%",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: GOLD, color: INK, border: `2.5px solid ${INK}`,
        borderRadius: 14, fontWeight: 800, fontSize: 14,
        cursor: "pointer", padding: "11px 14px", transition: "background 0.15s"
      },
      onClick: () => { try { track?.("sg_perfect_trip_cta", { beach_id: beach.id }) } catch (_) {} onOpenBeach?.(beach) }
    }, _t(lang, "Planifier mon séjour →", "Plan my trip →", "Planificar mi viaje →"))
  )
}