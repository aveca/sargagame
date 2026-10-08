import React, { useState, useEffect, useCallback, memo, useRef } from "react"
import { track } from "./Sargasses_PROD.jsx"

const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)

const STATUS_LABEL = {
  clean: { fr: "Propre", en: "Clean", es: "Limpia", color: "#22C55E", verb: { fr: "GO", en: "GO", es: "GO" } },
  moderate: { fr: "Attention", en: "Caution", es: "Precaución", color: "#F59E0B", verb: { fr: "ATTENTION", en: "CAUTION", es: "PRECAUCIÓN" } },
  avoid: { fr: "Éviter", en: "Avoid", es: "Evitar", color: "#E8522A", verb: { fr: "ÉVITER", en: "AVOID", es: "EVITAR" } },
}

function moneyEUR(cents, lang) {
  const euros = (cents / 100).toFixed(2).replace(".", lang === "fr" ? "," : ".")
  return lang === "en" ? `€${euros}` : `${euros} €`
}

// Modal a11y - focus trap, ESC, restore focus
function useModalA11y(panelRef, onClose) {
  useEffect(() => {
    const panel = panelRef.current
    const prevFocus = (typeof document !== "undefined" && document.activeElement) || null
    const SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const focusables = () => panel ? Array.prototype.filter.call(panel.querySelectorAll(SEL), el => el.offsetParent !== null || el === document.activeElement) : []
    try { if (panel && !panel.contains(document.activeElement)) { const f = focusables(); (f[0] || panel).focus && (f[0] || panel).focus() } } catch (_) {}
    const onKey = e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose && onClose(); return }
      if (e.key !== "Tab" || !panel) return
      const f = focusables(); if (!f.length) { e.preventDefault(); return }
      const first = f[0], last = f[f.length - 1], a = document.activeElement
      if (e.shiftKey && (a === first || !panel.contains(a))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey, true)
    return () => { document.removeEventListener("keydown", onKey, true); try { prevFocus && prevFocus.focus && prevFocus.focus() } catch (_) {} }
  }, [onClose])
}

function SOSPlage({ lang = "fr", onClose, sargData = null, region = "mq" }) {
  const [beaches, setBeaches] = useState([])
  const [selectedBeachId, setSelectedBeachId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const panelRef = useRef(null)
  
  useModalA11y(panelRef, onClose)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [beachListRes, sargRes] = await Promise.all([
          fetch("/data/beaches-list.json").then(r => r.json()).catch(() => null),
          sargData ? Promise.resolve(sargData) : fetch("/api/copernicus/sargassum.json").then(r => r.json()).catch(() => null),
        ])
        if (cancelled) return

        if (!beachListRes || !Array.isArray(beachListRes)) {
          throw new Error("Données plages indisponibles")
        }

        const islandBeaches = beachListRes.filter(b => b.island === region)
        const bySargId = {}
        if (sargRes && Array.isArray(sargRes.levels)) {
          for (const lvl of sargRes.levels) bySargId[lvl.id] = lvl
        }

        const enriched = islandBeaches.map(b => {
          const lvl = bySargId[b.id] || bySargId[`${region}${b.id.slice(2)}`] || null
          return {
            ...b,
            status: lvl?.status || "clean",
            confidence: lvl?.confidence || 70,
            forecast: lvl?.forecast || [],
            afai: lvl?.afai || 0,
          }
        }).filter(b => b.status)

        setBeaches(enriched)
        if (enriched.length > 0 && !selectedBeachId) {
          setSelectedBeachId(enriched[0].id)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sargData, region, selectedBeachId])

  const selectedBeach = beaches.find(b => b.id === selectedBeachId)
  const tomorrowForecast = selectedBeach?.forecast?.[1] || null
  const statusMeta = selectedBeach ? STATUS_LABEL[selectedBeach.status] : STATUS_LABEL.clean

  const handleBuy = useCallback(async () => {
    if (!selectedBeach || checkoutLoading) return
    if (typeof window !== "undefined") window.__sosHandleBuyCalled = true
    setCheckoutLoading(true)
    track("sg_sos_checkout_start", { beach: selectedBeach.id, beachName: selectedBeach.name })
    try {
      const origin = window.location.origin
      const res = await fetch("/api/mollie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_payment",
          pass: "sos",
          cents: 100,
          cur: "eur",
          email: "",
          source: "sos_plage",
          lang: lang,
          metadata: {
            beach: selectedBeach.id,
            beachName: selectedBeach.name,
          },
          redirectUrl: origin + "/?sos_success=1",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur paiement")
      if (data.checkoutUrl) {
        track("sg_sos_redirect", { beach: selectedBeach.id, paymentId: data.paymentId })
        window.location.href = data.checkoutUrl
      } else {
        throw new Error("URL de paiement non reçue")
      }
    } catch (e) {
      track("sg_sos_checkout_error", { beach: selectedBeach.id, error: e.message })
      alert(_t(lang, "Erreur lors de l'ouverture du paiement. Réessayez.", "Error opening payment. Please try again.", "Error al abrir el pago. Inténtalo de nuevo."))
    } finally {
      setCheckoutLoading(false)
    }
  }, [selectedBeach, checkoutLoading, lang])

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,.6)" }}>
        <div style={{ fontSize: 14 }}>Chargement des plages…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#E8522A" }}>
        <div style={{ fontSize: 14 }}>{error}</div>
        <button onClick={onClose} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #E8522A", background: "transparent", color: "#E8522A", cursor: "pointer" }}>
          {_t(lang, "Fermer", "Close", "Cerrar")}
        </button>
      </div>
    )
  }

  if (!selectedBeach) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,.6)" }}>
        <div style={{ fontSize: 14 }}>Aucune plage disponible</div>
      </div>
    )
  }

  const recommendation = statusMeta.verb[lang] || statusMeta.verb.fr
  const recommendationColor = statusMeta.color

  return (
    <div data-sos-plage="true" style={{ color: "#FDFCF7", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#FFC72C", marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
        {_t(lang, "SOS PLAGE 24H", "SOS BEACH 24H", "SOS PLAYA 24H")}
      </div>

      <h2 style={{ fontFamily: "'Anton',sans-serif", fontSize: "clamp(22px,6vw,28px)", lineHeight: 1.0, color: "#fff", margin: "8px 0 4px", letterSpacing: "-.01em" }}>
        {_t(lang, "Quelle plage choisir <span style='color:#FFC72C'>demain</span> ?", "Which beach to pick <span style='color:#FFC72C'>tomorrow</span>?", "¿Qué playa elegir <span style='color:#FFC72C'>mañana</span>?")}
      </h2>

      <p style={{ fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: "rgba(253,252,247,.7)", margin: "0 0 16px" }}>
        {_t(lang, "Prévision sargasses personnalisée · Satellite 4×/jour · Décision immédiate.", "Personalized sargassum forecast · Satellite 4×/day · Instant decision.", "Previsión sargazo personalizada · Satélite 4×/día · Decisión inmediata.")}
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(253,252,247,.5)", marginBottom: 8 }}>
          {_t(lang, "Votre plage", "Your beach", "Su playa")}
        </label>
        <select
          value={selectedBeachId}
          onChange={e => setSelectedBeachId(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
            border: "1.5px solid rgba(255,255,255,.15)", background: "#1A1428",
            font: "700 15px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#FDFCF7",
            cursor: "pointer", outline: "none",
          }}
        >
          {beaches.map(b => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.commune}
            </option>
          ))}
        </select>
      </div>

      <div style={{
        border: `2px solid ${recommendationColor}`, borderRadius: 16, padding: 16,
        background: "linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01))",
        boxShadow: `0 0 0 1px ${recommendationColor}40`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", background: recommendationColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "#fff",
          }}>
            {recommendation}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              {selectedBeach.name}
            </div>
            <div style={{ fontSize: 12, color: "rgba(253,252,247,.5)", marginTop: 2 }}>
              {selectedBeach.commune} · {_t(lang, "Confiance", "Confidence", "Confianza")}: {selectedBeach.confidence}%
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "rgba(253,252,247,.4)", letterSpacing: ".05em", marginBottom: 4 }}>
              {_t(lang, "Aujourd'hui", "Today", "Hoy")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: STATUS_LABEL[selectedBeach.status].color }}>
              {_t(lang, selectedBeach.status === "clean" ? "Propre" : selectedBeach.status === "moderate" ? "Algues modérées" : "À éviter",
                selectedBeach.status === "clean" ? "Clean" : selectedBeach.status === "moderate" ? "Moderate" : "Avoid",
                selectedBeach.status === "clean" ? "Limpia" : selectedBeach.status === "moderate" ? "Moderado" : "Evitar")}
            </div>
            <div style={{ fontSize: 10, color: "rgba(253,252,247,.4)", marginTop: 4 }}>
              AFai: {selectedBeach.afai.toFixed(2)}
            </div>
          </div>

          <div style={{ padding: 12, borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "rgba(253,252,247,.4)", letterSpacing: ".05em", marginBottom: 4 }}>
              {_t(lang, "Demain", "Tomorrow", "Mañana")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: tomorrowForecast ? STATUS_LABEL[tomorrowForecast.status].color : "rgba(253,252,247,.5)" }}>
              {tomorrowForecast
                ? _t(lang,
                    tomorrowForecast.status === "clean" ? "Propre" : tomorrowForecast.status === "moderate" ? "Algues modérées" : "À éviter",
                    tomorrowForecast.status === "clean" ? "Clean" : tomorrowForecast.status === "moderate" ? "Moderate" : "Avoid",
                    tomorrowForecast.status === "clean" ? "Limpia" : tomorrowForecast.status === "moderate" ? "Moderado" : "Evitar")
                : _t(lang, "Données en cours", "Loading…", "Cargando…")}
            </div>
            {tomorrowForecast && (
              <div style={{ fontSize: 10, color: "rgba(253,252,247,.4)", marginTop: 4 }}>
                Confiance: {tomorrowForecast.confidence || "—"}%
              </div>
            )}
          </div>
        </div>

        {tomorrowForecast && tomorrowForecast.status !== "clean" && beaches.some(b => b.id !== selectedBeachId && b.forecast?.[1]?.status === "clean") && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", marginBottom: 4 }}>
              {_t(lang, "💡 Alternative recommandée", "💡 Recommended alternative", "💡 Alternativa recomendada")}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#FDFCF7" }}>
              {(() => {
                const alt = beaches.find(b => b.id !== selectedBeachId && b.forecast?.[1]?.status === "clean")
                return alt ? `${alt.name} (${alt.commune}) — Propre demain` : ""
              })()}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button
          id="sos-plage-cta"
          onClick={handleBuy}
          disabled={checkoutLoading}
          style={{
            width: "100%", padding: "16px 20px", borderRadius: 14, border: "none",
            background: checkoutLoading
              ? "linear-gradient(135deg,#CCC,#BBB)"
              : "linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E8A317)",
            color: "#190c2c", fontWeight: 800, fontSize: 16, fontFamily: "inherit",
            cursor: checkoutLoading ? "wait" : "pointer",
            boxShadow: "0 4px 0 0 rgba(0,0,0,.30),0 8px 24px rgba(232,168,0,.28)",
            opacity: checkoutLoading ? 0.7 : 1,
            transition: "opacity .15s",
          }}
        >
          {checkoutLoading
            ? _t(lang, "Ouverture du paiement…", "Opening payment…", "Abriendo pago…")
            : _t(lang, "Voir mon rapport — 1 €", "See my report — 1 €", "Ver mi informe — 1 €")}
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, fontSize: 11, fontWeight: 700, color: "rgba(253,252,247,.55)" }}>
          <span>🔒 Mollie</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "Paiement sécurisé", "Secure payment", "Pago seguro")}</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "Accès immédiat", "Instant access", "Acceso inmediato")}</span>
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,199,44,.08)", border: "1px solid rgba(255,199,44,.2)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#FFC72C", marginBottom: 4 }}>
          {_t(lang, "Ce que vous recevez après paiement", "What you get after payment", "Lo que recibes tras pagar")}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(253,252,247,.85)" }}>
          {_t(lang,
            "• Niveau de risque sargasses (Propre / Attention / Éviter)<br/>• Prévision demain + tendance 3 jours<br/>• Recommandation claire : GO / ATTENTION / ÉVITER<br/>• Meilleure alternative si votre plage est risquée<br/>• Date/heure de la prévision + sources Copernicus/ERDDAP",
            "• Sargassum risk level (Clean / Caution / Avoid)<br/>• Tomorrow forecast + 3-day trend<br/>• Clear recommendation: GO / CAUTION / AVOID<br/>• Best alternative if your beach is risky<br/>• Forecast timestamp + Copernicus/ERDDAP sources",
            "• Nivel de riesgo sargazo (Limpia / Precaución / Evitar)<br/>• Previsión mañana + tendencia 3 días<br/>• Recomendación clara: GO / PRECAUCIÓN / EVITAR<br/>• Mejor alternativa si tu playa es riesgosa<br/>• Fecha/hora de la previsión + fuentes Copernicus/ERDDAP"
          )}
        </div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          style={{
            marginTop: 16, padding: "10px 16px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,.15)", background: "transparent",
            color: "rgba(253,252,247,.6)", fontSize: 12, fontWeight: 700,
            fontFamily: "inherit", cursor: "pointer",
          }}
        >
          {_t(lang, "Plus tard", "Later", "Más tarde")}
        </button>
      )}
    </div>
  )
}

export default memo(SOSPlage)