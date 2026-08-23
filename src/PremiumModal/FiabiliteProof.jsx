/**
 * FiabiliteProof — Preuve de calibration / fiabilité à afficher dans le paywall
 * Affiche les métriques de backtest et clean-rate (source __REL injectée au build)
 * Remplace la navigation vers /fiabilite/ par une preuve inline au moment de la décision.
 * 
 * Props: { lang, __REL, regime, onClose }
 */
import React, { useMemo } from "react"

const REGIME_LABELS = {
  high: { fr: "saison haute", en: "high season", es: "temporada alta" },
  low:  { fr: "saison calme", en: "calm season", es: "temporada tranquila" }
}

const CONFIDENCE_DESC = {
  fr: "Notre prévision est recoupée quotidiennement au satellite (AFAI NOAA). Backtest quotidien sur 1323 paires plage/jour → 97% de fiabilité globale. La confiance décroit après J+3 (persistance).",
  en: "Our forecast is cross-checked daily with satellite (NOAA AFAI). Daily backtest on 1323 beach/day pairs → 97% global reliability. Confidence decays after J+3 (persistence method).",
  es: "Nuestro pronóstico se verifica diariamente por satélite (AFAI NOAA). Backtest diario en 1323 pares playa/día → 97% de fiabilidad global. La confianza decae tras J+3 (método de persistencia)."
}

const CLEAN_LABELS = {
  fr: "mer propre", en: "clean sea", es: "mar limpio"
}

export function FiabiliteProof({ 
  lang = "fr", 
  REL, 
  regime = "high",
  onClose,
  className = ""
}) {
  const t = (fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr
  const regimeLabel = REGIME_LABELS[regime] || REGIME_LABELS.high
  const cleanLabel = CLEAN_LABELS[lang] || CLEAN_LABELS.fr
  const regLabel = regimeLabel[lang] || regimeLabel.fr
  
  const confidenceDesc = useMemo(() => CONFIDENCE_DESC[lang] || CONFIDENCE_DESC.fr, [lang])
  const cleanLabelT = useMemo(() => cleanLabel, [lang])
  const regLabelT = useMemo(() => regLabel, [lang])
  
  // Backtest stats from __REL or defaults
  const cleanPct = REL?.cleanPct ?? 76
  const globalPct = REL?.global ?? 97
  const cleanN = REL?.cleanN ?? 1323
  const regimeStr = REL?.regime ?? regime
  const n = REL?.cleanN ?? 1323
  
  const regimeDisplay = regimeStr === "high" 
    ? t("saison haute", "high season", "temporada alta")
    : t("saison calme", "calm season", "temporada tranquila")
  
  const nFormatted = useMemo(() => 
    n.toLocaleString(lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : "en-US"), [n, lang])
  
  const verifiedText = useMemo(() => 
    t(
      `${cleanPct}% de ${cleanLabel} vérifiées ${regimeDisplay} (${nFormatted})`,
      `${cleanPct}% of ${cleanLabel} verified ${regimeDisplay} (${nFormatted})`,
      `${cleanPct}% de ${cleanLabel} verificadas ${regimeDisplay} (${nFormatted})`
    ), [cleanPct, cleanLabel, regimeDisplay, nFormatted, lang])

  return (
    <div className={`sg-fiabilite-proof ${className || ""}`} style={{
      position: "relative",
      background: "linear-gradient(135deg, rgba(34,197,94,.08) 0%, rgba(255,199,44,.06) 100%)",
      border: "1.5px solid rgba(34,197,94,.35)",
      borderRadius: 16,
      padding: "16px 18px",
      margin: "16px 0",
      boxShadow: "0 4px 20px rgba(34,197,94,.12)",
      color: "#0d1117",
      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 12, flexWrap: "wrap"
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: "50%",
          background: "linear-gradient(135deg, #22C55E, #16A34A)",
          color: "#fff", fontWeight: 800, fontSize: 16
        }}>
          ✓
        </span>
        <div>
          <div style={{
            font: "800 13px/1 'Anton',system-ui,sans-serif",
            textTransform: "uppercase", letterSpacing: ".04em",
            color: "#0A2B1C"
          }}>
            {t("Preuve de calibration", "Calibration proof", "Prueba de calibración")}
          </div>
          <div style={{
            font: "600 11px 'Bricolage Grotesque',system-ui,sans-serif",
            color: "rgba(13,17,23,.7)", textTransform: "uppercase", letterSpacing: ".06em"
          }}>
            {t("Source : backtest quotidien satellite NOAA", "Source: daily satellite backtest NOAA", "Fuente: backtest diario satélite NOAA")}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            marginLeft: "auto", width: 28, height: 28, borderRadius: 8,
            background: "rgba(13,17,23,.08)", border: "1px solid rgba(13,17,23,.12)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(13,17,23,.5)", transition: "all .15s ease"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(13,17,23,.15)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(13,17,23,.08)"}
          aria-label="Fermer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
      
      {/* Main metric */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        marginBottom: 14
      }}>
        <div style={{
          background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.25)",
          borderRadius: 12, padding: "14px 12px", textAlign: "center"
        }}>
          <div style={{
            font: "800 36px/1 'Anton',system-ui,sans-serif",
            color: "#16A34A", lineHeight: 1, marginBottom: 2
          }}>
            {cleanPct}%
          </div>
          <div style={{
            font: "600 10px/1 'Bricolage Grotesque',system-ui,sans-serif",
            textTransform: "uppercase", letterSpacing: ".08em",
            color: "rgba(13,17,23,.6)"
          }}>
            {t("Prévisions mer propre vérifiées", "Clean water forecasts verified", "Previsiones mar limpio verificadas")}
          </div>
        </div>
        <div style={{
          background: "rgba(255,199,44,.12)", border: "1px solid rgba(255,199,44,.25)",
          borderRadius: 12, padding: "14px 12px", textAlign: "center"
        }}>
          <div style={{
            font: "800 36px/1 'Anton',system-ui,sans-serif",
            color: "#E8A800", lineHeight: 1, marginBottom: 2
          }}>
            {globalPct}%
          </div>
          <div style={{
            font: "600 10px/1 'Bricolage Grotesque',system-ui,sans-serif",
            textTransform: "uppercase", letterSpacing: ".08em",
            color: "rgba(13,17,23,.6)"
          }}>
            {t("Fiabilité globale backtest", "Global backtest reliability", "Fiabilidad global backtest")}
          </div>
        </div>
      </div>
      
      {/* Detail text */}
      <div style={{
        background: "rgba(13,17,23,.04)", border: "1px solid rgba(13,17,23,.08)",
        borderRadius: 10, padding: "12px 14px", marginBottom: 14,
        font: "400 12px/1.5 'Bricolage Grotesque',system-ui,sans-serif",
        color: "rgba(13,17,23,.85)"
      }}>
        {confidenceDesc}
      </div>
      
      {/* Verified stat line */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)",
        borderRadius: 999, padding: "8px 14px",
        font: "700 11px/1 'Bricolage Grotesque',system-ui,sans-serif",
        color: "#16A34A", whiteSpace: "nowrap"
      }}>
        <span aria-hidden="true">✅</span>
        <span>{verifiedText}</span>
      </div>
      
      {/* Methodology hint */}
      <div style={{
        marginTop: 10, paddingTop: 10,
        borderTop: "1px solid rgba(13,17,23,.08)",
        font: "500 10px/1.4 'Bricolage Grotesque',system-ui,sans-serif",
        color: "rgba(13,17,23,.55)", textAlign: "center"
      }}>
        {t(
          "Méthode : persistance + bancs satellite AFAI + vent. Jamais 100% garanti.",
          "Method: persistence + AFAI satellite banks + wind. Never 100% guaranteed.",
          "Método: persistencia + bancos AFAI satelital + viento. Nunca 100% garantizado."
        )}
      </div>
      
      {/* Close button if onClose provided */}
      {onClose && (
        <button onClick={onClose} style={{
          marginTop: 12, width: "100%", padding: "10px",
          background: "transparent", border: "1px solid rgba(13,17,23,.15)",
          borderRadius: 10, color: "rgba(13,17,23,.6)",
          font: "600 12px 'Bricolage Grotesque',system-ui,sans-serif",
          cursor: "pointer", transition: "all .15s ease"
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(13,17,23,.3)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(13,17,23,.15)"}
        >
          {t("J'ai compris", "Got it", "Entendido")}
        </button>
      )}
    </div>
  )
}

export default FiabiliteProof