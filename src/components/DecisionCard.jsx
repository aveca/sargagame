import React from "react"
import { _t } from "../lib/beach-decision.js"

const INK = "#0d0b14"

/**
 * DecisionCard — Aide à la décision pour une plage
 * Affiche le verdict, la confiance et la raison principale
 * États : loading, success, empty, warning, error
 */
export function DecisionCard({ beach, lang = "fr", showConfidence = true, showReason = true }) {
  // États de chargement/erreurs
  if (!beach) {
    return React.createElement("div", {
      style: {
        padding: 16, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center"
      }
    }, "Aucune donnée de plage disponible")
  }

  // État error - données manquantes critiques
  if (!beach.status || beach.lat == null || beach.lng == null) {
    return React.createElement("div", {
      style: {
        padding: 16, color: "#e8512a", fontSize: 14,
        border: "2px solid #e8512a", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Données incomplètes pour cette plage")
  }

  const statusMeta = {
    clean: { label: _t(lang, "Propre", "Clean", "Limpia"), color: "#22C55E", bg: "#E4F6EC" },
    moderate: { label: _t(lang, "Risque", "Caution", "Riesgo"), color: "#B87A00", bg: "#FFF3D6" },
    avoid: { label: _t(lang, "À éviter", "Avoid", "Evitar"), color: "#E8512A", bg: "#FDE7DF" },
  }[beach.status] || { label: _t(lang, "Inconnu", "Unknown", "Desconocido"), color: "#666", bg: "#eee" }

  return React.createElement("div", {
    style: {
      background: "#fff", border: `2px solid ${INK}`, borderRadius: 16,
      boxShadow: `3px 3px 0 ${INK}`, padding: 16, margin: 8, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
    }
  },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 12 } },
      React.createElement("span", {
        style: {
          width: 10, height: 10, borderRadius: "50%", background: statusMeta.color,
          flexShrink: 0
        }
      }),
      React.createElement("span", { style: { fontWeight: 800, fontSize: 14 } }, statusMeta.label)
    ),
    showConfidence && beach.confidence != null && React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        fontSize: 12, color: "#5a5a5a"
      }
    },
      React.createElement("span", { style: { flexShrink: 0 } }, "★"),
      React.createElement("span", null, `${beach.confidence} %`)
    ),
    showReason && beach.reason && React.createElement("p", {
      style: {
        margin: "8 0", fontSize: 13, lineHeight: 1.5,
        color: "#333", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical"
      }
    }, beach.reason)
  )
}