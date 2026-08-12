/**
 * WorldPaywall — Paywall contextualisé "Monde" (carte + prévisions)
 * Variante "world" du paywall : ancre le paiement dans la carte mondiale,
 * montre la valeur globale (5 régions, 136+ plages) avant le détail local.
 * 
 * Props: { lang, onClose, onActivated, source, pwVariant, ...paywallContext }
 */
import React, { useState, useEffect, useMemo } from "react"
import PassOffer from "../PassOffer.jsx"
import { SeqDots } from "../SeqPrimitives.jsx"
import { FiabiliteProof } from "./FiabiliteProof.jsx"

const REGION_LABELS = {
  mq: { fr: "Martinique", en: "Martinique", es: "Martinica" },
  gp: { fr: "Guadeloupe", en: "Guadeloupe", es: "Guadalupe" },
  florida: { fr: "Floride", en: "Florida", es: "Florida" },
  puntacana: { fr: "Punta Cana", en: "Punta Cana", es: "Punta Cana" },
  rivieramaya: { fr: "Riviera Maya", en: "Riviera Maya", es: "Riviera Maya" },
  barbados: { fr: "Barbade", en: "Barbados", es: "Barbados" }
}

const WORLD_STATS = {
  fr: { regions: 5, beaches: "136+", freshness: "4×/jour" },
  en: { regions: 5, beaches: "136+", freshness: "4×/day" },
  es: { regions: 5, beaches: "136+", freshness: "4×/día" }
}

const STAT_LABELS = {
  clean:    { fr: "Propre", en: "Clean", es: "Limpia" },
  moderate: { fr: "Modéré", en: "Moderate", es: "Moderado" },
  avoid:    { fr: "À éviter", en: "Avoid", es: "Evitar" }
}

export function WorldPaywall({
  lang = "fr",
  onClose,
  onActivated,
  source = "world",
  pwVariant = "calm",
  island,
  beach,
  sargData,
  pwPass,
  pwSocial,
  pwFresh,
  payPlanRef,
  payEmailRef,
  payBusy,
  setPayBusy,
  payError,
  setPayError,
  payReadyRef,
  payRedirecting,
  setPayRedirecting,
  paySuccess,
  setPaySuccess,
  consentFlag,
  consentOk,
  setConsentOk,
  elementsRef,
  stripeRef,
  setupSecretRef,
  mollieRef,
  pwStep,
  setPayStep,
  pwToast,
  setPwToast,
  pwSocialProof,
  doSubscribe,
  payWithWallet,
  walletRedirect,
  onPayEmailInput,
  onPassBuy
}) {
  const stats = WORLD_STATS[lang] || WORLD_STATS.fr
  const regions = REGION_LABELS
  
  const t = (fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr

  // Restore email from localStorage
  const [emailValue, setEmailValue] = useState(() => {
    try { return localStorage.getItem("sgEmail") || "" } catch (_) { return "" }
  })
  const handleEmailChange = (e) => {
    setEmailValue(e.target.value)
    if (onPayEmailInput) onPayEmailInput()
  }
  
  // Variant-specific content
  const variantContent = useMemo(() => {
    const base = {
      title: t(
        "Le monde à portée de main — 136+ plages, 5 régions",
        "World at your fingertips — 136+ beaches, 5 regions",
        "El mundo al alcance — 136+ playas, 5 regiones"
      ),
      subtitle: t(
        "Score 0-100 par plage, mis à jour 4×/jour depuis le satellite Copernicus",
        "Score 0-100 per beach, updated 4×/day from Copernicus satellite",
        "Puntuación 0-100 por playa, actualizada 4×/día desde satélite Copernicus"
      ),
      cta: t(
        "Débloquer l'accès mondial",
        "Unlock worldwide access",
        "Desbloquear acceso mundial"
      ),
      features: [
        t("5 régions • 136+ plages • Score 0-100", "5 regions • 136+ beaches • Score 0-100", "5 regiones • 136+ playas • Puntuación 0-100"),
        t("Satellite Copernicus • Données 4×/jour", "Copernicus satellite • Data 4×/day", "Satélite Copernicus • Datos 4×/día"),
        t("Prévisions J+7 • Alertes push gratuites", "J+7 forecasts • Free push alerts", "Previsiones J+7 • Alertas push gratis")
      ]
    }
    
    switch (pwVariant) {
      case "beat":
        return {
          ...base,
          headline: t("L'énergie de l'océan, dans votre poche", "Ocean energy in your pocket", "La energía del océano en tu bolsillo"),
          tone: "energetic",
          accent: "#FFC72C"
        }
      case "constel":
        return {
          ...base,
          headline: t("Les étoiles guident votre baignade", "Stars guide your swim", "Las estrellas guían tu baño"),
          tone: "cosmic",
          accent: "#8A4A8E"
        }
      case "alert":
        return {
          ...base,
          headline: t("Alerte sargasses : restez informé", "Sargassum alert: stay informed", "Alerta sargazo: mantente informado"),
          tone: "urgent",
          accent: "#E8522A"
        }
      case "watch":
        return {
          ...base,
          headline: t("Le Veilleur veille sur vos plages", "The Watcher watches your beaches", "El Vigía vigila tus playas"),
          tone: "watchful",
          accent: "#5FD3C9"
        }
      case "calm":
      default:
        return {
          ...base,
          headline: t("Votre plage, vérifiée avant de partir", "Your beach, verified before you go", "Tu playa, verificada antes de ir"),
          tone: "calm",
          accent: "#22C55E"
        }
    }
  }, [pwVariant, lang])
  
  // Region selector for multi-region context
  const regionNames = Object.entries(regions).map(([id, labels]) => ({
    id,
    name: labels[lang] || labels.fr
  }))
  
  return (
    <div className="sg-paywall-world" style={{ position: "relative", width: "100%", maxWidth: 420, margin: "0 auto" }}>
      {/* Background atmosphere */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 20,
        background: `radial-gradient(ellipse at center, ${variantContent.accent}15 0%, transparent 70%)`,
        pointerEvents: "none", zIndex: 0
      }} />
      
      <div style={{ position: "relative", zIndex: 1, padding: 24 }}>
        {/* Compact header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <h2 style={{
            fontFamily: "'Anton', system-ui, sans-serif",
            fontSize: "clamp(20px, 5vw, 26px)",
            fontWeight: 400,
            textTransform: "uppercase",
            letterSpacing: ".02em",
            color: "#fff",
            margin: "0 0 6",
            textShadow: "0 2px 12px rgba(0,0,0,.4)"
          }}>
            {variantContent.headline}
          </h2>
          <p style={{
            color: "rgba(255,255,255,.85)",
            fontSize: 13,
            lineHeight: 1.4,
            margin: "0 0 14",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
          }}>
            {variantContent.subtitle}
          </p>
          {/* Compact stats badges */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
              🛰️ {stats.regions} {t("régions", "regions", "regiones")}
            </span>
            <span style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
              🏖️ {stats.beaches} {t("plages", "beaches", "playas")}
            </span>
            <span style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#5FD3C9", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
              📡 {stats.freshness}
            </span>
          </div>
        </div>
        
        {/* ═══ B1 fix — Beach context mini-cart (funnel stability 2026-08-12) ═══ */}
        {/* Si le paywall est ouvert depuis une fiche plage, rappeler LA plage observée
            au lieu d'un pitch générique "monde à portée de main". Relevance = conversion. */}
        {beach && beach.name && (() => {
          const verdictByStatus = {
            clean: { color: "#22C55E", label: t("Propre aujourd'hui", "Clean today", "Limpia hoy") },
            moderate: { color: "#F59E0B", label: t("Modérée — prudence", "Moderate — caution", "Moderada — cuidado") },
            avoid: { color: "#E8522A", label: t("À éviter aujourd'hui", "Avoid today", "Evitar hoy") }
          }
          const v = verdictByStatus[beach.status] || verdictByStatus.moderate
          return (
            <div style={{
              marginBottom: 14, padding: "12px 14px",
              background: "rgba(13,17,23,.6)", border: `1.5px solid ${v.color}55`,
              borderRadius: 12, display: "flex", alignItems: "center", gap: 10
            }}>
              <span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: "50%", background: v.color,
                boxShadow: `0 0 8px ${v.color}`, flexShrink: 0
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  fontSize: 14, fontWeight: 800, color: "#fff",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                }}>
                  {beach.name}
                </div>
                <div style={{
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  fontSize: 11, fontWeight: 600, color: v.color,
                  textTransform: "uppercase", letterSpacing: ".04em"
                }}>
                  {v.label}
                </div>
              </div>
            </div>
          )
        })()}
        
        {/* ═══ EMAIL INPUT (P0 fix — bind to payEmailRef) ═══ */}
        <div style={{ marginBottom: 14 }}>
          <label style={{
            display: "block", fontSize: 12, color: "rgba(255,255,255,.6)",
            marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em"
          }}>
            {t("Email pour recevoir ton accès", "Email to receive your access", "Email para recibir tu acceso")}
          </label>
          <input
            ref={payEmailRef}
            type="email"
            required
            autoComplete="email"
            placeholder={t("ton@email.com", "your@email.com", "tu@email.com")}
            defaultValue={emailValue}
            onChange={handleEmailChange}
            style={{
              width: "100%", padding: "13px 14px",
              background: "rgba(13,17,23,.8)", border: "1.5px solid rgba(255,199,44,.4)",
              borderRadius: 12, color: "#fff", fontSize: 15,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              fontWeight: 600, outline: "none", boxSizing: "border-box",
              transition: "border-color .15s ease"
            }}
            onFocus={e => e.target.style.borderColor = "rgba(255,199,44,.7)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,199,44,.4)"}
          />
        </div>
        
        {/* Pricing card (PassOffer) — immediately after email */}
        <div style={{ marginBottom: 14 }}>
          <PassOffer
            lang={lang}
            onBuy={onPassBuy}
          />
        </div>
        
        {/* ═══ BELOW THE FOLD — trust + features ═══ */}
        
        {/* FiabiliteProof */}
        <FiabiliteProof lang={lang} REL={window.__REL} regime="high" />
        
        {/* Trust signals */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 12,
          flexWrap: "wrap", marginTop: 12, paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,.08)"
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            <span aria-hidden="true">✅</span>
            <span>{t("97% vérifiées", "97% verified", "97% verificadas")}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,210,140,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            <span aria-hidden="true">🛰️</span>
            <span>Copernicus</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,210,140,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            <span aria-hidden="true">👥</span>
            <span>{t("12k+ voyageurs", "12k+ travelers", "12k+ viajeros")}</span>
          </span>
        </div>
        
        {/* Feature highlights — collapsed below fold */}
        <div style={{ marginTop: 14 }}>
          {variantContent.features.map((feat, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", marginBottom: 6,
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 10
            }}>
              <span style={{
                color: "rgba(255,255,255,.8)", fontSize: 12,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                fontWeight: 500
              }}>
                {feat}
              </span>
            </div>
          ))}
        </div>
        
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 14, padding: "10px",
            background: "transparent", border: "1.5px solid rgba(255,255,255,.15)",
            borderRadius: 12, color: "rgba(255,255,255,.6)",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            transition: "all .15s ease"
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.35)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.15)"}
        >
          {t("Plus tard", "Later", "Más tarde")}
        </button>
      </div>
    </div>
  )
}

export default WorldPaywall

