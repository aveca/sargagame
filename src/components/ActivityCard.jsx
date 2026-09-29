import React from "react"
import { _t } from "../lib/beach-decision.js"

const INK = "#0d0b14"

// Activity category icons (inline SVG, zero deps)
const ACTIVITY_ICONS = {
  snorkel: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-4"/><path d="M18 18a6 6 0 0 0-12 0"/><path d="M6 14a8 8 0 0 1 12 0"/><circle cx="12" cy="10" r="2"/></svg>`,
  kids: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3"/><path d="M6 21a9 9 0 0 1 12 0"/><path d="M6 15a3 3 0 0 1 6 0"/></svg>`,
  family: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  parking: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17v-5"/><path d="M15 17v-5"/></svg>`,
  beach: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-4"/><path d="M18 18a6 6 0 0 0-12 0"/><path d="M6 14a8 8 0 0 1 12 0"/></svg>`
}

/**
 * ActivityCard — Affiche les activités disponibles sur la plage
 * Affiche: snorkeling, kids/family, parking, et autres activités basées sur les flags
 * États : loading, success, empty, warning, error
 */
export function ActivityCard({ beach, lang = "fr" }) {
  // État loading - pas de beach
  if (!beach) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Chargement des activités")
  }

  // État error - pas de flags d'activités
  if (!beach.kids && !beach.snorkel && !beach.parking) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Aucune activité spécifique détectée")
  }

  // Construction des activités basées sur les flags
  const activities = []

  if (beach.snorkel) {
    activities.push({
      id: "snorkel",
      label: _t(lang, "Snorkeling", "Snorkeling", "Snorkeling"),
      icon: "snorkel",
      description: _t(lang, "Eau claire pour observation marine", "Clear water for marine observation", "Agua clara para observación marina")
    })
  }

  if (beach.kids) {
    activities.push({
      id: "kids",
      label: _t(lang, "Enfants bienvenus", "Kids welcome", "Niños bienvenidos"),
      icon: "kids",
      description: _t(lang, "Plage adaptée aux enfants", "Suitable for children", "Apta para niños")
    })
  }

  if (beach.parking) {
    activities.push({
      id: "parking",
      label: _t(lang, "Parking disponible", "Parking available", "Parking disponible"),
      icon: "parking",
      description: _t(lang, "Parking dédié sur place", "Dedicated parking on site", "Parking dedicado en el lugar")
    })
  }

  // État success - activités disponibles
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
    }, _t(lang, "Activités", "Activities", "Actividades")),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, activities.map((act, i) => {
      const iconSvg = ACTIVITY_ICONS[act.icon] || ""

      return React.createElement("div", {
        key: act.id,
        style: {
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          padding: 10, borderRadius: 10,
          background: act.icon === "snorkel" ? "#E8F4FD" : act.icon === "kids" ? "#FFFDF5" : "#F0FDF4"
        }
      },
        React.createElement("div", {
          style: {
            width: 32, height: 32, borderRadius: 999,
            background: "#E2E8F0", color: "#666", fontSize: 12,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4
          }, iconSvg
        }),
        React.createElement("div", {
          style: {
            textAlign: "center", fontSize: 12, fontWeight: 600, color: INK
          }
        }, act.label),
        React.createElement("div", {
          style: {
            textAlign: "center", fontSize: 10, color: "#6B7280", marginTop: 2
          }
        }, act.description)
      )
    }))
  )
}