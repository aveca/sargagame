/**
 * HomeHeroV2 — Hero section above the map (gradual rollout).
 *
 * Gated by abVariant("home_hero_v2", ["control","hero"], [.9,.1]) in Sargasses_PROD.
 * 10% of visitors see this hero; 90% see the current map-first experience.
 * Tracks: sg_home_hero_view, sg_home_hero_cta_click, sg_home_hero_dismiss.
 *
 * Rollback: ?homeherov2=0 (force control) or remove the abVariant gate.
 */
import React, { useEffect } from "react"

const T = {
  fr: {
    title: "Sache où sera la mer propre",
    sub: "Observation satellite + prévision 7 jours, plage par plage. Mesuré, pas deviné.",
    cta: "Découvrir Premium",
    ctaSub: "Alerte la veille · Prévision 7 j · Meilleur jour de la semaine",
    prices: "7,99 € (7 j) · 14,99 € (30 j) · 24,99 € (saison)",
    freshness: (ts) => ts ? `Dernière observation satellite : ${ts}` : "Observation satellite en cours",
    values: [
      { icon: "🛰️", title: "Observation satellite réelle", desc: "Pas de prédiction au doigt mouillé. On mesure, on te dit la vérité." },
      { icon: "📅", title: "Prévision 7 jours", desc: "Sache si ta plage sera propre demain, après-demain, et toute la semaine." },
      { icon: "🔔", title: "Alerte avant que ça bascule", desc: "On te prévient le matin même si le statut change. Tu ne rates rien." },
    ],
    mapCta: "Voir l'état des plages →",
  },
  en: {
    title: "Know where the sea will be clean",
    sub: "Satellite observation + 7-day forecast, beach by beach. Measured, not guessed.",
    cta: "Discover Premium",
    ctaSub: "Alert the day before · 7-day forecast · Best day of the week",
    prices: "$8.99 (7 d) · $16.99 (30 d) · $27.99 (season)",
    freshness: (ts) => ts ? `Last satellite observation: ${ts}` : "Satellite observation in progress",
    values: [
      { icon: "🛰️", title: "Real satellite observation", desc: "No finger-in-the-wind predictions. We measure, we tell you the truth." },
      { icon: "📅", title: "7-day forecast", desc: "Know if your beach will be clean tomorrow, the day after, and all week." },
      { icon: "🔔", title: "Alert before it turns", desc: "We warn you the same morning if the status changes. You miss nothing." },
    ],
    mapCta: "See beach status →",
  },
  es: {
    title: "Sabe dónde estará el mar limpio",
    sub: "Observación satelital + pronóstico 7 días, playa por playa. Medido, no adivinado.",
    cta: "Descubrir Premium",
    ctaSub: "Alerta la víspera · Pronóstico 7 d · Mejor día de la semana",
    prices: "$8.99 (7 d) · $16.99 (30 d) · $27.99 (temporada)",
    freshness: (ts) => ts ? `Última observación satelital: ${ts}` : "Observación satelital en curso",
    values: [
      { icon: "🛰️", title: "Observación satelital real", desc: "Sin predicciones al dedo. Medimos, te decimos la verdad." },
      { icon: "📅", title: "Pronóstico 7 días", desc: "Sabe si tu playa estará limpia mañana, pasado y toda la semana." },
      { icon: "🔔", title: "Alerta antes de que cambie", desc: "Te avisamos la misma mañana si el estado cambia. No te pierdes nada." },
    ],
    mapCta: "Ver estado de las playas →",
  },
}

export default function HomeHeroV2({ lang, sargData, onPremium, onShowMap, track }) {
  const t = T[lang] || T.fr
  const ts = sargData?.erddapTimestamp || sargData?.updatedAt || null

  // Track impression (once per mount)
  useEffect(() => {
    try { track && track("sg_home_hero_view", { variant: "hero" }) } catch (_) {}
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const freshLabel = t.freshness(ts)

  const handleCta = () => {
    try { track("sg_home_hero_cta_click", { section: "hero" }) } catch (_) {}
    onPremium && onPremium("home_hero_v2")
  }
  const handleMap = () => {
    try { track("sg_home_hero_map_click", {}) } catch (_) {}
    onShowMap && onShowMap()
  }
  const handleDismiss = () => {
    try { track("sg_home_hero_dismiss", {}) } catch (_) {}
    onShowMap && onShowMap()
  }

  return (
    <div style={{
      minHeight: "100svh", background: "linear-gradient(180deg,#0C1D21 0%,#120821 100%)",
      color: "#fff", position: "relative", padding: "40px 16px 60px",
      fontFamily: "inherit", overflow: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 20, fontWeight: 400, letterSpacing: ".02em", textTransform: "uppercase" }}>
            Le Veilleur
          </div>
          <div style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,.5)", letterSpacing: ".08em", textTransform: "uppercase", marginTop: 2 }}>
            Sargasses
          </div>
        </div>
        <button aria-label="Changer de langue" style={{
          background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)",
          color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600,
          cursor: "pointer", minHeight: 32, fontFamily: "inherit",
        }}>
          {lang === "fr" ? "FR" : lang === "es" ? "ES" : "EN"} ▾
        </button>
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{
          fontFamily: "'Anton',sans-serif", fontWeight: 400, fontSize: "clamp(28px,6.5vw,40px)",
          lineHeight: 1.02, letterSpacing: ".01em", textTransform: "uppercase",
          margin: "0 0 10px", color: "#fff",
        }}>
          {t.title}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.7)", lineHeight: 1.4, maxWidth: 320, margin: "0 auto 16px" }}>
          {t.sub}
        </p>
        <button onClick={handleCta} className="gbtn" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "#FFC72C", color: "#120821", border: "none", borderRadius: 14,
          padding: "14px 24px", fontSize: 15, fontWeight: 800, cursor: "pointer",
          fontFamily: "inherit", boxShadow: "0 6px 20px rgba(255,199,44,.3)", minHeight: 48,
        }}>
          {t.cta}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          fontSize: 11, color: "rgba(255,255,255,.45)", fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
          {freshLabel}
        </div>
      </div>

      {/* Valeur en 3 points */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {t.values.map((v, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "12px 14px", borderRadius: 12,
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)",
          }}>
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{v.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{v.title}</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", lineHeight: 1.35 }}>{v.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA secondaire : voir la carte */}
      <button onClick={handleMap} style={{
        display: "block", width: "100%", textAlign: "center",
        background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.85)",
        border: "1px solid rgba(255,255,255,.12)", borderRadius: 12,
        padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
        fontFamily: "inherit", minHeight: 44, marginBottom: 20,
      }}>
        {t.mapCta}
      </button>

      {/* Prix */}
      <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 20 }}>
        {t.prices}
      </div>

      {/* Footer minimal */}
      <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.35)", borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 16 }}>
        <a href="/fiabilite/" style={{ color: "rgba(255,255,255,.5)", textDecoration: "none" }}>Notre méthode</a>
        {" · "}
        <a href="/previsions/" style={{ color: "rgba(255,255,255,.5)", textDecoration: "none" }}>Comment ça marche</a>
      </div>
    </div>
  )
}