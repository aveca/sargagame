import React, { useState, useEffect, useCallback } from "react"
import { _t, track } from "./Sargasses_PROD.jsx"

const LEAD_DISMISSED_KEY = "sg_lead_dismissed"
const LEAD_SESSION_KEY = "sg_lead_session_start"
const LEAD_SCROLL_KEY = "sg_lead_scroll_count"

function getDomain() {
  try { return window.location.hostname.replace(/^www\./, "") } catch { return "" }
}

function getRegion() {
  const domain = getDomain()
  if (domain.includes("martinique")) return "MQ"
  if (domain.includes("guadeloupe")) return "GP"
  if (domain.includes("cancun") || domain.includes("tulum")) return "MX"
  if (domain.includes("puntacana")) return "DO"
  if (domain.includes("miami")) return "US"
  return "UNKNOWN"
}

export default function LeadCapture() {
  const [visible, setVisible] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  // SPRINT #15 — B2C/B2B toggle (rollback ?b2c=0 force B2B, ?lead=0 disables banner)
  const b2cFlagOff = (() => { try { return /[?&]b2c=0/.test(window.location.search) } catch { return false } })()
  const [mode, setMode] = useState(b2cFlagOff ? 'b2b' : 'b2c')
  const lang = (() => { try { const p = window.location.pathname; if (p.startsWith("/es")) return "es"; if (p.startsWith("/en")) return "en"; return "fr" } catch { return "fr" } })()

  const dismissed = useCallback(() => {
    try {
      const d = localStorage.getItem(LEAD_DISMISSED_KEY)
      if (d) { const ts = parseInt(d, 10); if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return true }
      return false
    } catch { return false }
  }, [])

  useEffect(() => {
    if (dismissed()) return
    const start = Date.now()
    let scrollCount = 0
    let timer = null

    const checkShow = () => {
      const elapsed = Date.now() - start
      if (elapsed >= 15000 || scrollCount >= 2) {
        setVisible(true)
        track("sg_lead_banner_view", { domain: getDomain(), region: getRegion() })
      }
    }

    const onScroll = () => {
      scrollCount++
      checkShow()
    }

    timer = setTimeout(checkShow, 15000)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener("scroll", onScroll) }
  }, [dismissed])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || loading) return
    setLoading(true)

    const isB2C = mode === 'b2c'
    const table = isB2C ? 'b2c_alerts' : 'b2b_leads'
    const insert = isB2C ? {
      email: email.trim().toLowerCase(),
      region: getRegion().toLowerCase(),
      domain: getDomain(),
      beaches: [],
      status: 'active'
    } : {
      email: email.trim().toLowerCase(),
      domain: getDomain(),
      region: getRegion(),
      source: "map_banner",
      created_at: new Date().toISOString()
    }

    try {
      const res = await fetch("/api/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, insert })
      })
      if (res.ok) {
        setSubmitted(true)
        if (isB2C) {
          const reg = getRegion();
          setMessage(_t(lang, `✅ Vous recevrez les alertes sargassum pour ${reg} par email`, `✅ You will receive sargassum alerts for ${reg} by email`, `✅ Recibirás alertas de sargazo para ${reg} por email`))
          track("sg_lead_b2c_submit", { domain: getDomain(), region: getRegion() })
        } else {
          setMessage(_t(lang, "Merci ! On vous contacte sous 24h.", "Thanks! We'll contact you within 24h.", "¡Gracias! Te contactamos en 24h."))
          track("sg_lead_banner_submit", { domain: getDomain(), region: getRegion() })
        }
      } else {
        throw new Error("supabase failed")
      }
    } catch {
      // Fallback: B2C silent, B2B redirect
      if (isB2C) {
        setSubmitted(true)
        setMessage(_t(lang, "✅ Alertes activées !", "✅ Alerts on!", "✅ ¡Alertas activadas!"))
      } else {
        window.location.href = "/b2b"
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    try { localStorage.setItem(LEAD_DISMISSED_KEY, String(Date.now())) } catch {}
    setVisible(false)
    track("sg_lead_banner_dismiss", { domain: getDomain(), region: getRegion() })
  }

  if (!visible || dismissed()) return null

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1500,
        background: "white",
        borderTop: "2px solid #0d7f63",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
        padding: isMobile ? "16px 20px" : "16px 20px",
        ...(isMobile ? {} : { borderRadius: "12px 12px 0 0", maxWidth: 600, margin: "0 auto", boxSizing: "border-box" })
      }}
      role="region"
      aria-label={_t(lang, "Capture email pour alertes sargasses", "Email capture for sargassum alerts", "Captura email para alertas de sargazo")}
    >
      {!submitted ? (
        <>
          <button
            onClick={handleDismiss}
            aria-label={_t(lang, "Fermer", "Close", "Cerrar")}
            style={{
              position: "absolute",
              top: 8,
              right: 12,
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.05)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              lineHeight: 1
            }}
          >
            ×
          </button>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
            <button type="button" onClick={() => setMode('b2c')} style={{ flex: 1, padding: "8px 10px", borderRadius: 20, border: mode==='b2c' ? '2px solid #0d7f63' : '1px solid #ddd', background: mode==='b2c' ? '#0d7f63' : 'white', color: mode==='b2c' ? 'white' : '#0d1117', font: "700 12px/1 'Bricolage Grotesque'", cursor: "pointer", maxWidth: 220 }}>{"🏖️ " + _t(lang, "Je veux des alertes plage", "I want beach alerts", "Quiero alertas de playa")}</button>
            <button type="button" onClick={() => setMode('b2b')} style={{ flex: 1, padding: "8px 10px", borderRadius: 20, border: mode==='b2b' ? '2px solid #0d7f63' : '1px solid #ddd', background: mode==='b2b' ? '#0d7f63' : 'white', color: mode==='b2b' ? 'white' : '#0d1117', font: "700 12px/1 'Bricolage Grotesque'", cursor: "pointer", maxWidth: 220 }}>{"🏨 " + _t(lang, "Je suis un hôtel/pro", "I'm a hotel/pro", "Soy un hotel/pro")}</button>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", ...(isMobile ? { flexDirection: "column", alignItems: "stretch" } : {}) }}>
            <span style={{ flex: 1, font: "600 14px/1.3 'Bricolage Grotesque'", color: "#0d1117", ...(isMobile ? { textAlign: "center" } : {}) }}>
              {mode==='b2c' ? _t(lang, "🏖️ Alerte sargasses gratuite par région", "🏖️ Free sargassum alerts by region", "🏖️ Alertas gratuitas por región") : _t(lang, "📍 Recevez l'alerte sargassum pour vos plages", "📍 Get sargassum alerts for your beaches", "📍 Reciba alertas de sargazo para sus playas")}
            </span>
            <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flex: 1, minWidth: 200, ...(isMobile ? { flexDirection: "column" } : {}) }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={_t(lang, "votre@email.com", "your@email.com", "tu@email.com")}
                required
                autoComplete="email"
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "2px solid #0d7f63",
                  font: "600 14px/1 'Bricolage Grotesque'",
                  color: "#0d1117",
                  minWidth: 180,
                  boxSizing: "border-box"
                }}
                aria-label={_t(lang, "Votre email", "Your email", "Tu email")}
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0d7f63",
                  color: "white",
                  font: "700 14px/1 'Bricolage Grotesque'",
                  cursor: loading || !email.trim() ? "not-allowed" : "pointer",
                  opacity: loading || !email.trim() ? 0.6 : 1,
                  whiteSpace: "nowrap",
                  minWidth: isMobile ? "auto" : 140
                }}
              >
                {loading ? _t(lang, "Envoi…", "Sending…", "Enviando…") : _t(lang, "Activer", "Activate", "Activar")}
              </button>
            </form>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ font: "600 14px/1.3 'Bricolage Grotesque'", color: "#1c8f4e" }}>{message}</span>
          <a href="/b2b" style={{ padding: "10px 18px", borderRadius: 8, border: "2px solid #0d7f63", background: "white", color: "#0d7f63", font: "700 14px/1 'Bricolage Grotesque'", textDecoration: "none", whiteSpace: "nowrap" }}>
            {_t(lang, "Voir les offres pro →", "See pro offers →", "Ver ofertas pro →")}
          </a>
          <button onClick={handleDismiss} aria-label={_t(lang, "Fermer", "Close", "Cerrar")} style={{ position: "absolute", top: 8, right: 12, width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.05)", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
      )}
    </div>
  )
}