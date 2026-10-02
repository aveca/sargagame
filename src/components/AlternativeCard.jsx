import React from "react"
import { findAlternatives, haversineKm, _t } from "../lib/beach-decision.js"

const INK = "#0d0b14"

/**
 * AlternativeCard — Affiche les plages alternatives
 * Affiche jusqu'à 3 alternatives avec distance, confiance et raison
 * États : loading, success, empty, warning, error
 */
export function AlternativeCard({ beach, allBeaches, lang = "fr", maxAlternatives = 3 }) {
  // État loading - pas de beach ou pas de données
  if (!beach || !allBeaches || allBeaches.length === 0) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Aucune alternative disponible")
  }

  // État error - pas d'alternatives possibles
  if (beach.status === "clean" && beach.confidence >= 80) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Aucune alternative nécessaire — conditions optimales")
  }

  // Find alternatives using existing engine
  const alternatives = findAlternatives(beach, allBeaches, { lang, maxAlternatives })

  // État empty - pas d'alternatives trouvées
  if (alternatives.length === 0) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Aucune alternative proche avec de bonnes conditions")
  }

  return React.createElement("div", {
    style: {
      background: "#fff", border: `2px solid ${INK}`, borderRadius: 16,
      boxShadow: `3px 3px 0 ${INK}`, padding: 16, margin: 8, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
    }
  },
    React.createElement("h3", {
      style: {
        margin: 0, fontSize: 13, fontWeight: 800,
        letterSpacing: ".08em", textTransform: "uppercase", color: INK,
        borderBottom: "2px solid #eee", paddingBottom: 8
      }
    }, _t(lang, "Plages alternatives", "Alternative beaches", "Playas alternativas")),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, alternatives.map((alt, i) => {
      const statusLabels = { clean: "Propre", moderate: "Risque", avoid: "À éviter" }
      const statusColors = { clean: "#22C55E", moderate: "#FFC72C", avoid: "#E8512A" }

      return React.createElement("div", {
        key: alt.beach.id,
        style: {
          background: "#F8FAFF", border: `1px solid #e2e8f0`, borderRadius: 12,
          padding: 12, display: "flex", alignItems: "center", gap: 12
        }
      },
        React.createElement("span", {
          style: {
            width: 36, height: 36, borderRadius: 12,
            background: statusColors[alt.beach.status] || "#eee", color: "#fff",
            fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center"
          }
        }, _t(lang, alt.beach.status === "clean" ? "Propre" : alt.beach.status === "moderate" ? "Risque" : "À éviter"),
        ),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", {
            style: { fontWeight: 800, fontSize: 13, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }
          }, alt.beach.name),
          alt.beach.commune && React.createElement("div", {
            style: { fontSize: 11, opacity: 0.7, marginTop: 2 }
          }, alt.beach.commune),
          React.createElement("div", {
            style: { display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 11, color: "#5a5a5a" }
          },
            React.createElement("span", null, `${alt.distanceKm} km`),
            alt.beach.driveMinutes && React.createElement("span", null, ` · ${alt.beach.driveMinutes}`)
          )
        ),
        React.createElement("span", {
          style: {
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 999,
            background: statusColors[alt.beach.status] || "#eee", color: statusColors[alt.beach.status] || "#333",
            fontSize: 10, fontWeight: 700
          }
        }, alt.reason ? alt.reason.slice(0, 20) + "..." : "")
      )
    }))
  )
}