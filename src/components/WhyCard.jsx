import React from "react"
import { computeScore } from "../lib/score.js"
import { _t } from "../lib/beach-decision.js"

const INK = "#0d0b14"

/**
 * WhyCard — Affiche les raisons principales pour lesquelles cette plage est recommandée
 * Affiche: statut, score, confiance, meilleure fenêtre, raisons données
 * États : loading, success, empty, warning, error
 */
export function WhyCard({ beach, lang = "fr", showConfidence = true, showScore = true }) {
  // État loading - pas de beach
  if (!beach) {
    return React.createElement("div", {
      style: {
        padding: 16, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Aucune donnée disponible")
  }

  // État error - données manquantes critiques
  if (!beach.status || beach.lat == null) {
    return React.createElement("div", {
      style: {
        padding: 16, color: "#e8512a", fontSize: 14,
        border: "2px solid #e8512a", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Données insuffisantes pour analyser cette plage")
  }

  // Compute score for detailed breakdown
  const scoreData = beach.score != null ? computeScore({ afai: beach.afai, wave: beach.wave, wind: beach.wind, sst: beach.sst, cloud: beach.cloud, uv: beach.uv, tide: beach.tide }, lang) : null

  const statusLabels = {
    clean: _t(lang, "Propre", "Clean", "Limpia"),
    moderate: _t(lang, "Risque", "Caution", "Riesgo"),
    avoid: _t(lang, "À éviter", "Avoid", "Evitar"),
  }

  const statusColors = {
    clean: "#22C55E",
    moderate: "#FFC72C",
    avoid: "#E8512A",
  }

  return React.createElement("div", {
    style: {
      background: "#fff", border: `2px solid ${INK}`, borderRadius: 16,
      boxShadow: `3px 3px 0 ${INK}`, padding: 16, margin: 8, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
    }
  },
    React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("div", {
        style: {
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          fontSize: 14, fontWeight: 800
        }
      },
        React.createElement("span", {
          style: {
            width: 8, height: 8, borderRadius: "50%", background: statusColors[beach.status],
            flexShrink: 0
          }
        }),
        React.createElement("span", null, `${statusLabels[beach.status]} aujourd'hui`)
      ),
      showScore && beach.score != null && React.createElement("div", {
        style: {
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          fontSize: 12, color: "#5a5a5a"
        }
      },
        React.createElement("span", null, `Score: ${beach.score}/100`)
      )
    ),
    showConfidence && beach.confidence != null && React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        fontSize: 12, color: "#5a5a5a"
      }
    },
      React.createElement("span", null, "Confiance: "),
      React.createElement("span", { style: { color: "#e8a800", fontWeight: 800 } }, `${beach.confidence}%`)
    ),
    React.createElement("p", {
      style: {
        margin: "10 0", fontSize: 13, lineHeight: 1.5,
        color: "#333", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical"
      }
    }, beach.reason || "Conditions favorables pour la baignade aujourd'hui"),
    scoreData && React.createElement("div", {
      style: {
        marginTop: 10, fontSize: 12, color: "#666"
      },
      // Raison détaillée depuis le score engine
    }, scoreData.reason)
  )
}