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
import { compareRow } from "../Sargasses_PROD.jsx"
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
  elementsRef,
  stripeRef,
  setupSecretRef,
  mollieRef,
  pwStep,
  setPayStep,
  pwToast,
  pwSocialProof,
  doSubscribe,
  payWithWallet,
  walletRedirect,
  onPayEmailInput
}) {
  const stats = WORLD_STATS[lang] || WORLD_STATS.fr
  const regions = REGION_LABELS
  
  const t = (fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr
  
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
        {/* Header with world context */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 60, height: 60, margin: "0 auto 16",
            borderRadius: "50%",
            background: `radial-gradient(circle at 30% 30%, ${variantContent.accent}40, transparent 70%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28
          }}>
            🌍
          </div>
          
          <h2 style={{
            fontFamily: "'Anton', system-ui, sans-serif",
            fontSize: "clamp(22px, 5vw, 28px)",
            fontWeight: 400,
            textTransform: "uppercase",
            letterSpacing: ".02em",
            color: "#fff",
            margin: "0 0 8",
            textShadow: "0 2px 12px rgba(0,0,0,.4)"
          }}>
            {variantContent.headline}
          </h2>
          
          <p style={{
            color: "rgba(255,255,255,.85)",
            fontSize: 14,
            lineHeight: 1.5,
            margin: "0 0 20",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
          }}>
            {variantContent.subtitle}
          </p>
          
          {/* World stats badges */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 12,
            flexWrap: "wrap", marginBottom: 24
          }}>
            <span style={{
              background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 999, padding: "6px 12px", fontSize: 11,
              fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
            }}>
              🛰️ {stats.regions} {t("régions", "regions", "regiones")}
            </span>
            <span style={{
              background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 999, padding: "6px 12px", fontSize: 11,
              fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
            }}>
              🏖️ {stats.beaches} {t("plages", "beaches", "playas")}
            </span>
            <span style={{
              background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 999, padding: "6px 12px", fontSize: 11,
              fontWeight: 700, color: "#5FD3C9", whiteSpace: "nowrap",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
            }}>
              📡 {stats.freshness}
            </span>
          </div>
        </div>
        
        {/* Region selector (if multiple regions) */}
        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: "block", fontSize: 12, color: "rgba(255,255,255,.6)",
            marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em"
          }}>
            {t("Votre région", "Your region", "Su región")}
          </label>
          <select
            defaultValue={island || "mq"}
            onChange={e => { /* track region change */ }}
            style={{
              width: "100%", padding: "12px 14px",
              background: "rgba(13,17,23,.8)", border: "1.5px solid rgba(255,255,255,.18)",
              borderRadius: 12, color: "#fff", fontSize: 14,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              fontWeight: 600, appearance: "none",
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FFC72C' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
              backgroundSize: 20, paddingRight: 40
            }}
          >
            {regionNames.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        
        {/* Feature highlights */}
        <div style={{ marginBottom: 24 }}>
          {variantContent.features.map((feat, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", marginBottom: 10,
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 12
            }}>
              <div style={{
                width: 24, height: 24, flexShrink: 0,
                borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                background: `linear-gradient(135deg, ${variantContent.accent}20, ${variantContent.accent}40)`
              }}>
                ✓
              </div>
              <span style={{
                color: "rgba(255,255,255,.9)", fontSize: 13,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                fontWeight: 500
              }}>
                {feat}
              </span>
            </div>
          ))}
        </div>
        
        {/* Pricing cards (delegate to PassOffer) */}
        <div style={{ marginBottom: 20 }}>
          <PassOffer
            lang={lang}
            variant="world"
            payPlanRef={payPlanRef}
            payEmailRef={payEmailRef}
            payBusy={payBusy}
            setPayBusy={setPayBusy}
            payError={payError}
            setPayError={setPayError}
            payReadyRef={payReadyRef}
            payRedirecting={payRedirecting}
            setPayRedirecting={setPayRedirecting}
            paySuccess={paySuccess}
            setPaySuccess={setPaySuccess}
            consentFlag={consentFlag}
            consentOk={consentOk}
            elementsRef={elementsRef}
            stripeRef={stripeRef}
            setupSecretRef={setupSecretRef}
            mollieRef={mollieRef}
            onBuy={doSubscribe}
            payWithWallet={payWithWallet}
            walletRedirect={walletRedirect}
            onPayEmailInput={onPayEmailInput}
          />
        </div>
        
        {/* FiabiliteProof — Preuve de calibration inline au moment de la décision */}
        <FiabiliteProof lang={lang} REL={window.__REL} regime="high" />
        
        {/* Trust signals */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 16,
          flexWrap: "wrap", marginTop: 16, paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,.08)"
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(34,197,94,.4)",
            borderRadius: 999, padding: "4px 10px", fontSize: 10,
            fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
          }}>
            <span aria-hidden="true">✅</span>
            <span>{t("97% vérifiées", "97% verified", "97% verificadas")}</span>
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,210,140,.4)",
            borderRadius: 999, padding: "4px 10px", fontSize: 10,
            fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
          }}>
            <span aria-hidden="true">🛰️</span>
            <span>{t("Copernicus", "Copernicus", "Copernicus")}</span>
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,210,140,.4)",
            borderRadius: 999, padding: "4px 10px", fontSize: 10,
            fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
          }}>
            <span aria-hidden="true">👥</span>
            <span>{t("12k+ voyageurs", "12k+ travelers", "12k+ viajeros")}</span>
          </span>
        </div>
        
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 20, padding: "12px",
            background: "transparent", border: "1.5px solid rgba(255,255,255,.2)",
            borderRadius: 12, color: "rgba(255,255,255,.7)",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            transition: "all .15s ease"
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.4)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"}
        >
          {t("Plus tard", "Later", "Más tarde")}
        </button>
      </div>
    </div>
  )
}

export default WorldPaywall/ /   f o r c e   f u l l   b u i l d   2 0 2 6 - 0 8 - 1 1   1 4 : 4 6 : 5 5 Z  
 