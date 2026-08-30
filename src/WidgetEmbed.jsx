import React, { useState, useEffect, useMemo } from "react"
import { _t, track, BEACHES_FALLBACK, BEACH_TO_SARG, SARG_TO_BEACH, REGION, IS_NEW_REGION } from "./Sargasses_PROD.jsx"
import { computeScore } from "./lib/score.js"

const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" }
const STATUS_LBL = {
  clean:    { fr: "Propre", en: "Clean", es: "Limpia" },
  moderate: { fr: "Modéré", en: "Moderate", es: "Moderado" },
  avoid:    { fr: "À éviter", en: "Avoid", es: "Evitar" },
}
const DAY_LBL = [
  { fr: "Auj", en: "Now", es: "Hoy" },
  { fr: "+1j", en: "+1d", es: "+1d" },
  { fr: "+2j", en: "+2d", es: "+2d" },
  { fr: "+3j", en: "+3d", es: "+3d" },
]

function ti(lang, arr) { return lang === "en" ? arr.en : lang === "es" ? arr.es : arr.fr }

export default function WidgetEmbed({ sargData, token = "demo", lang = "fr", preview = true }) {
  const domain = typeof window !== "undefined" ? window.location.hostname.replace(/^www\./, "") : "sargasses-martinique.com"
  const [copied, setCopied] = useState(false)

  const topBeach = useMemo(() => {
    if (!sargData?.levels) return null
    const lvls = Object.values(sargData.levels)
    const filtered = IS_NEW_REGION && REGION
      ? lvls.filter(b => REGION.id === "gp" ? b.id?.startsWith("gp-") : !b.id?.startsWith("gp-"))
      : lvls.filter(b => !b.id?.startsWith("gp-"))
    const scored = filtered.map(b => {
      const days = sargData.weekly?.[b.id]?.forecast?.map(d => d.status) || []
      const score = computeScore(days)
      return { ...b, score, days }
    })
    scored.sort((a, b) => (b.score || 0) - (a.score || 0))
    return scored[0] || null
  }, [sargData])

  const fcDays = useMemo(() => {
    if (!topBeach || !sargData?.weekly?.[topBeach.id]?.forecast) return []
    return sargData.weekly[topBeach.id].forecast.slice(0, 3)
  }, [topBeach, sargData])

  const iframeCode = useMemo(() => {
    const protocol = typeof window !== "undefined" ? window.location.protocol : "https:"
    const host = typeof window !== "undefined" ? window.location.host : domain
    return `<iframe src="${protocol}//${host}/widget?token=${token}" width="100%" height="320" frameborder="0" style="border-radius:12px"></iframe>`
  }, [domain, token])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(iframeCode)
      setCopied(true)
      track("sg_widget_embed_copy", { token })
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const beachName = topBeach
    ? (IS_NEW_REGION ? REGION?.beaches?.find(b => b.id === topBeach.id)?.name : BEACHES_FALLBACK.find(b => b.id === SARG_TO_BEACH[topBeach.id])?.name)
    : _t(lang, "Votre plage", "Your beach", "Tu playa")

  if (!preview) {
    return (
      <div style={{ fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
        <pre style={{ background: "#0d1117", color: "#FFC72C", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{iframeCode}</pre>
        <button onClick={handleCopy} style={{ marginTop: 8, padding: "8px 16px", background: "#FFC72C", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>
          {copied ? _t(lang, "Copié !", "Copied!", "¡Copiado!") : _t(lang, "Copier le code", "Copy code", "Copiar código")}
        </button>
      </div>
    )
  }

  return (
    <div style={{
      fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
      border: "2px solid #0d7f63",
      borderRadius: 16,
      overflow: "hidden",
      background: "white",
      maxWidth: 400,
      boxShadow: "0 8px 24px rgba(13,127,99,0.15)"
    }}>
      {/* Mini Map Preview */}
      <div style={{ height: 300, position: "relative", background: "linear-gradient(135deg, #0a5c4a, #0d7f63)" }}>
        <div style={{ position: "absolute", inset: 0, background: "url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 800 600%27%3E%3Crect fill=%27%230a5c4a%27 width=%27800%27 height=%27600%27/%3E%3C/svg%3E') center/cover" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "3px solid rgba(255,199,44,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFC72C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22V12"/><path d="M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z"/>
            </svg>
          </div>
          <div style={{ marginTop: 12, font: "700 16px/1.2 'Bricolage Grotesque'", color: "white", textAlign: "center", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            {beachName}
          </div>
          <div style={{ marginTop: 4, font: "500 12px/1 'Bricolage Grotesque'", color: "rgba(255,255,255,0.8)" }}>
            {_t(lang, "Carte interactive", "Interactive map", "Mapa interactivo")}
          </div>
        </div>
      </div>

      {/* 3-Day Status Badges */}
      <div style={{ padding: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {fcDays.length > 0 ? fcDays.map((d, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "8px 14px", borderRadius: 100,
            background: STATUS_C[d.status] || "#5A5A5A", color: "white",
            font: "700 11px/1 'Bricolage Grotesque'", textTransform: "uppercase", letterSpacing: ".5px"
          }}>
            <span>{ti(lang, DAY_LBL[i] || { fr: `J+${i}`, en: `+${i}d`, es: `+${i}d` })}</span>
            <span style={{ fontSize: 10, opacity: 0.9 }}>{ti(lang, STATUS_LBL[d.status] || { fr: "…", en: "…", es: "…" })}</span>
          </div>
        )) : Array(3).fill(0).map((_, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "8px 14px", borderRadius: 100,
            background: "#e0e0e0", color: "#999",
            font: "700 11px/1 'Bricolage Grotesque'", textTransform: "uppercase", letterSpacing: ".5px"
          }}>
            <span>{ti(lang, DAY_LBL[i] || { fr: `J+${i}`, en: `+${i}d`, es: `+${i}d` })}</span>
            <span style={{ fontSize: 10 }}>{_t(lang, "Chargement", "Loading", "Cargando")}</span>
          </div>
        ))}
      </div>

      {/* Powered by + CTA */}
      <div style={{ padding: "0 16px 16px", textAlign: "center" }}>
        <div style={{ font: "500 11px/1 'Bricolage Grotesque'", color: "#666", marginBottom: 12 }}>
          {_t(lang, "Sargassum status powered by SargaGame", "Sargassum status powered by SargaGame", "Estado de sargazo impulsado por SargaGame")}
        </div>
        <a href="/b2b" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "10px 18px", borderRadius: 8,
          background: "linear-gradient(180deg,#ffe07a,#ffb338)",
          border: "1px solid rgba(0,0,0,0.18)",
          boxShadow: "0 4px 14px rgba(255,150,60,0.35)",
          color: "#0d1117", font: "700 13px/1 'Bricolage Grotesque'",
          textDecoration: "none"
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
          </svg>
          {_t(lang, "Get this widget →", "Get this widget →", "Obtener este widget →")}
        </a>
      </div>

      {/* Embed Code (collapsible) */}
      <details style={{ padding: "0 16px 16px", borderTop: "1px solid #eee" }}>
        <summary style={{ cursor: "pointer", font: "600 12px/1 'Bricolage Grotesque'", color: "#0d7f63", marginBottom: 8 }}>
          {_t(lang, "Code d'intégration (iframe)", "Embed code (iframe)", "Código de integración (iframe)")}
        </summary>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <pre style={{
            flex: 1, minWidth: 280, background: "#0d1117", color: "#FFC72C",
            padding: 12, borderRadius: 8, overflow: "auto", fontSize: 11, lineHeight: 1.4,
            fontFamily: "'JetBrains Mono',ui-monospace,monospace", margin: 0
          }}>{iframeCode}</pre>
          <button onClick={handleCopy} style={{
            padding: "8px 14px", borderRadius: 6, border: "none",
            background: copied ? "#22C55E" : "#0d7f63", color: "white",
            font: "700 12px/1 'Bricolage Grotesque'", cursor: "pointer", whiteSpace: "nowrap"
          }}>
            {copied ? _t(lang, "Copié !", "Copied!", "¡Copiado!") : _t(lang, "Copier", "Copy", "Copiar")}
          </button>
        </div>
      </details>
    </div>
  )
}