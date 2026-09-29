import React from "react"
import { haversineKm, _t } from "../lib/beach-decision.js"

const INK = "#0d0b14"

/**
 * NearbyCard — Affiche les plages à proximité
 * Affiche les plages dans un rayon de 5km avec distance et statut
 * États : loading, success, empty, warning, error
 */
export function NearbyCard({ beach, allBeaches, lang = "fr", maxDistanceKm = 5 }) {
  // État loading - pas de beach ou pas de données
  if (!beach || !allBeaches || allBeaches.length === 0 || beach.lat == null || beach.lng == null) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, "Chargement des plages proches")
  }

  // Calcul des plages proches (≤ maxDistanceKm km)
  const nearby = []
  for (const b of allBeaches || []) {
    if (!b || b.id === beach.id || b.island !== beach.island || b.lat == null || b.lng == null) continue
    const distance = haversineKm(beach.lat, beach.lng, b.lat, b.lng)
    if (distance <= maxDistanceKm) {
      nearby.push({ beach: b, distanceKm: distance })
    }
  }

  // Trier par distance (proche d'abord)
  nearby.sort((a, b) => a.distanceKm - b.distanceKm)
  nearby.splice(maxDistanceKm) // Limiter le nombre affiché

  // État empty - pas de plages proches
  if (nearby.length === 0) {
    return React.createElement("div", {
      style: {
        padding: 12, color: "#666", fontSize: 14,
        border: "2px dashed #ddd", borderRadius: 12, textAlign: "center", margin: 8
      }
    }, `Aucune plage dans un rayon de ${maxDistanceKm} km`)
  }

  // Limiter à 3 affichage maximum
  const displayNearby = nearby.slice(0, 3)

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
    }, _t(lang, "Plages à proximité", "Nearby beaches", "Playas cercanas")),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, displayNearby.map((item, i) => {
      const statusLabels = { clean: "Propre", moderate: "Risque", avoid: "À éviter" }
      const statusColors = { clean: "#22C55E", moderate: "#FFC72C", avoid: "#E8512A" }

      return React.createElement("div", {
        key: item.beach.id,
        style: {
          background: "#F8FAFF", border: `1px solid #e2e8f0`, borderRadius: 10,
          padding: 10, display: "flex", alignItems: "center", gap: 10
        }
      },
        React.createElement("span", {
          style: {
            width: 30, height: 30, borderRadius: 999,
            background: statusColors[item.beach.status] || "#eee", color: "#fff",
            fontWeight: 800, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center"
          }
        }, _t(lang, item.beach.status || "?")),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", {
            style: { fontWeight: 800, fontSize: 13, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }
          }, item.beach.name),
          item.beach.commune && React.createElement("div", {
            style: { fontSize: 11, opacity: 0.7, marginTop: 2 }
          }, item.beach.commune),
          React.createElement("div", {
            style: { fontSize: 11, color: "#5a5a5a" }
          }, `${item.distanceKm.toFixed(1)} km`)
        )
      )
    }))
  )
}