import React, { useState, useMemo } from "react"

const INK = "#0d0b14"
const MUTE = "rgba(255,255,255,.62)"
const CARD_BG = "rgba(255,255,255,.04)"
const CARD_HOVER = "rgba(255,255,255,.08)"
const BORDER = "rgba(255,255,255,.12)"
const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" }
const GOLD = { background: "linear-gradient(180deg,#ffe07a,#ffb338)", border: "1px solid rgba(0,0,0,.18)", boxShadow: "0 8px 22px rgba(255,150,60,.45)" }

function _t(lang, fr, en, es) {
  return lang === "es" ? es : lang === "en" ? en : fr
}

const STATUS_LBL = {
  clean: _t("fr", "Propre", "Clean", "Limpia"),
  moderate: _t("fr", "Modéré", "Moderate", "Moderado"),
  avoid: _t("fr", "À éviter", "Avoid", "Evitar"),
}

export function AroundMeSortPanel({ beaches, onBeachClick, lang = "fr", limit = 5 }) {
  const [sort, setSort] = useState("distance")

  const sorted = useMemo(() => {
    const all = [...beaches]
    if (sort === "score") {
      all.sort((a, b) => (b.score || 0) - (a.score || 0))
    } else {
      all.sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity))
    }
    return all.slice(0, limit)
  }, [beaches, sort, limit])

  const distanceLabel = _t(lang, "Plus proches", "Nearest", "Más cercanas")
  const scoreLabel = _t(lang, "Meilleures", "Best rated", "Mejor valoradas")

  const statusLabels = {
    clean: _t(lang, "Propre", "Clean", "Limpia"),
    moderate: _t(lang, "Modéré", "Moderate", "Moderado"),
    avoid: _t(lang, "À éviter", "Avoid", "Evitar"),
  }

  return (
    <div data-testid="around-me-sort-panel">
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
        }}
        role="tablist"
        aria-label={_t(lang, "Trier les plages", "Sort beaches", "Ordenar playas")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={sort === "distance"}
          onClick={() => setSort("distance")}
          style={{
            flex: 1,
            ...(sort === "distance" ? GOLD : { background: "transparent", border: `1px solid ${BORDER}` }),
            color: sort === "distance" ? INK : "#fff",
            borderRadius: 8,
            padding: "8px 6px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
            textTransform: "uppercase",
            letterSpacing: ".02em",
            transition: "all .15s ease",
          }}
        >
          {distanceLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sort === "score"}
          onClick={() => setSort("score")}
          style={{
            flex: 1,
            ...(sort === "score" ? GOLD : { background: "transparent", border: `1px solid ${BORDER}` }),
            color: sort === "score" ? INK : "#fff",
            borderRadius: 8,
            padding: "8px 6px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
            textTransform: "uppercase",
            letterSpacing: ".02em",
            transition: "all .15s ease",
          }}
        >
          {scoreLabel}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((beach, idx) => (
          <button
            key={beach.id}
            type="button"
            onClick={() => onBeachClick?.(beach)}
            data-testid={`around-me-beach-${beach.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "background .15s ease, border-color .15s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = CARD_HOVER }}
            onMouseLeave={e => { e.currentTarget.style.background = CARD_BG }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: STATUS_C[beach.status] || "#9aa0a8",
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {beach.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: MUTE, marginTop: 2 }}>
                <span>{beach.distanceKm != null ? `${beach.distanceKm.toFixed(1)} km` : "—"}</span>
                {beach.score != null && (
                  <>
                    <span style={{ color: STATUS_C[beach.status] || MUTE }}>●</span>
                    <span>{beach.score}/100</span>
                  </>
                )}
                <span>{statusLabels[beach.status] || "—"}</span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: MUTE, fontWeight: 600 }}>▸</span>
          </button>
        ))}
      </div>
    </div>
  )
}