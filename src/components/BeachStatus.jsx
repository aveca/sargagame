import React from "react"
import { _t } from "../Sargasses_PROD.jsx"

const INK = "#0d0b14"

/**
 * ConfidenceBadge — Affiche le niveau de confiance
 * Statuts: loading, success, empty, warning, error
 */
function ConfidenceBadge({ confidence, lang = "fr" }) {
  if (confidence == null) {
    return React.createElement("span", {
      style: {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, borderRadius: 999, background: "#eee", color: "#666",
        fontSize: 11, fontWeight: 700
      }
    }, "—")
  }

  const labels = {
    fr: { high: "Très fiable", medium: "Confiance moyenne", low: "Faible confiance" },
    en: { high: "Very reliable", medium: "Medium confidence", low: "Low confidence" },
    es: { high: "Muy fiable", medium: "Confianza media", low: "Baja confianza" }
  }[lang]

  const level = confidence >= 80 ? "high" : confidence >= 50 ? "medium" : "low"
  const label = labels[level] || labels.medium

  const colors = {
    high: "#22C55E", medium: "#F59E0B", low: "#E8512A"
  }

  return React.createElement("span", {
    style: {
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 24, height: 24, borderRadius: 999, background: colors[level], color: "#fff",
      fontSize: 11, fontWeight: 700
    }
  }, label)
}

/**
 * BeachStatus — Affiche l'état de la plage avec statut et confiance
 * États : loading, success, empty, warning, error
 */
export function BeachStatus({ beach, lang = "fr" }) {
  // État loading - pas encore de données
  if (!beach) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Chargement des données...")
  }

  // État error - données manquantes critiques
  if (!beach.status || beach.lat == null || beach.lng == null) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#e8512a", fontSize: 14,
        border: "2px solid #e8512a", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Données incomplètes")
  }

  // État success - données complètes
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

  return React.createElement("div", {
    style: {
      background: "#fff", border: `2px solid ${INK}`, borderRadius: 16,
      boxShadow: `3px 3px 0 ${INK}`, padding: 12, margin: 8, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
    }
  },
    React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        fontSize: 13
      }
    },
      React.createElement("span", {
        style: {
          width: 8, height: 8, borderRadius: "50%", background: statusColors[beach.status],
          flexShrink: 0
        }
      }),
      React.createElement("span", { style: { fontWeight: 800 } }, statusLabels[beach.status])
    ),
    beach.confidence !== undefined && React.createElement(ConfidenceBadge, { confidence: beach.confidence, lang })
  )
}