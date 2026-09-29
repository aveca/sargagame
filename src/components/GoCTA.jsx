import React from "react"
import { _t } from "../Sargasses_PROD.jsx"

const INK = "#0d0b14"
const GOLD = "#FFC72C"
const GOLD_L = "#FFE47A"

/**
 * GoCTA — CTA principal "GO" pour aller à la plage
 * Doit être toujours évident, mobile-first, avec contraste fort
 * États : loading, success, empty, warning, error
 */
export function GoCTA({ beach, lang = "fr", onClick, disabled = false, variant = "primary", track }) {
  // État disabled - pas de beach valide
  if (!beach || !beach.id || disabled) {
    const btnStyle = {
      minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      width: "100%", background: "#e2e8f0", color: "#9ca3af",
      border: `2px solid #cbd5e1`, borderRadius: 14,
      fontWeight: 700, fontSize: "clamp(14px,4vw,16px)", cursor: disabled ? "default" : "pointer",
      boxShadow: "none", transition: "background 0.15s ease"
    }

    return React.createElement("button", {
      type: "button", onClick: disabled ? null : onClick,
      style: btnStyle, "data-testid": "go-cta", disabled: disabled
    }, _t(lang, "Voir la fiche →", "Open beach →", "Ver ficha →"))
  }

  // État success - beach valide avec CTA actif
  const btnStyle = {
    minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%", background: GOLD, color: INK,
    border: `2.5px solid ${INK}`, borderRadius: 14,
    boxShadow: `3px 3px 0 ${INK}`, fontWeight: 800, fontSize: "clamp(15px,4.2vw,17px)",
    cursor: "pointer", padding: "12px 16px", transition: "transform 0.1s, box-shadow 0.1s"
  }

  const hoverStyle = {
    ...btnStyle,
    transform: "translateY(2px)", boxShadow: `2px 2px 0 ${INK}`
  }

  return React.createElement("button", {
    type: "button", onClick: () => {
      try { track?.("sg_beach_cta", { beach_id: beach.id, status: beach.status }) } catch (_) {}
      onClick?.()
    },
    style: variant === "primary" ? btnStyle : { ...btnStyle, background: "#3F3F46", color: "#fff" },
    "data-testid": "go-cta"
  },
    _t(lang, "J'y vais →", "Go →", "Voy →"),
    React.createElement("span", { style: { fontSize: 10, opacity: 0.8 } }, "▶")
  )
}