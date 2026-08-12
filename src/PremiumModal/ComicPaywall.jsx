/**
 * ComicPaywall — Paywall "BD" plein écran (takeover immersif)
 * Variante "comic" du paywall : narration visuelle, storytelling BD,
 * immersion narrative avant l'appel à l'action.
 * 
 * Props: { lang, onClose, onActivated, source, pwVariant, ...paywallContext }
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import PassOffer from "../PassOffer.jsx"
import { SeqDots } from "../SeqPrimitives.jsx"
import { FiabiliteProof } from "./FiabiliteProof.jsx"

const PANELS = [
  {
    id: 1,
    fr: { title: "Le Veilleur regarde la mer", text: "Chaque matin, il scrute l'horizon. Satellites, courants, vents : il lit l'océan comme un livre ouvert." },
    en: { title: "The Watcher watches the sea", text: "Every morning, he scans the horizon. Satellites, currents, winds: he reads the ocean like an open book." },
    es: { title: "El Vigía mira el mar", text: "Cada mañana, escanea el horizonte. Satélites, corrientes, vientos: lee el océano como un libro abierto." }
  },
  {
    id: 2,
    fr: { title: "Les sargasses ne mentent pas", text: "L'indice AFAI satellite ne triche pas. 0,15 = propre. 0,40 = attention. La donnée brute, sans filtre." },
    en: { title: "Sargassum doesn't lie", text: "The satellite AFAI index doesn't cheat. 0.15 = clean. 0.40 = caution. Raw data, no filter." },
    es: { title: "El sargazo no miente", text: "El índice AFAI satelital no engaña. 0,15 = limpio. 0,40 = precaución. Dato bruto, sin filtro." }
  },
  {
    id: 3,
    fr: { title: "136 plages, 5 régions, 1 verdict", text: "Martinique, Guadeloupe, Floride, Punta Cana, Riviera Maya. Score 0-100 par plage. 4 mises à jour/jour." },
    en: { title: "136 beaches, 5 regions, 1 verdict", text: "Martinique, Guadeloupe, Florida, Punta Cana, Riviera Maya. Score 0-100 per beach. 4 updates/day." },
    es: { id: 3, title: "136 playas, 5 regiones, 1 veredicto", text: "Martinica, Guadalupe, Florida, Punta Cana, Riviera Maya. Puntuación 0-100 por playa. 4 actualizaciones/día." }
  },
  {
    id: 4,
    fr: { title: "Le Veilleur ne décide pas pour vous", text: "Il vous donne la vérité. Vous choisissez votre plage. Honnêteté = notre seul moat." },
    en: { title: "The Watcher doesn't decide for you", text: "He gives you the truth. You choose your beach. Honesty = our only moat." },
    es: { title: "El Vigía no decide por ti", text: "Te da la verdad. Tú eliges tu playa. Honestidad = nuestro único moat." }
  }
]

const PANEL_ART = [
  // Panel 1: Veilleur looking at horizon
  <svg key="p1" viewBox="0 0 300 200" style={{width:"100%",height:"auto"}}>
    <defs>
      <linearGradient id="sky1" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#0B2230"/><stop offset="50%" stopColor="#155A5A"/><stop offset="100%" stopColor="#C97E3A"/>
      </linearGradient>
      <linearGradient id="sea1" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1A5852"/><stop offset="100%" stopColor="#08251F"/>
      </linearGradient>
    </defs>
    <rect width="300" height="200" fill="url(#sky1)"/>
    <path d="M0,140 Q150,120 300,140 L300,200 L0,200 Z" fill="url(#sea1)"/>
    <circle cx="260" cy="40" r="25" fill="#FFC72C" opacity="0.9"/>
    <ellipse cx="260" cy="40" rx="35" ry="15" fill="#FFD884" opacity="0.3"/>
    {/* Veilleur silhouette */}
    <g transform="translate(50,130)">
      <rect x="-15" y="-80" width="10" height="80" fill="#07201E"/>
      <rect x="-15" y="-80" width="10" height="25" fill="#FFC72C"/>
      <rect x="-22" y="-100" width="24" height="20" rx="6" fill="#C9971F"/>
      <rect x="-22" y="-100" width="24" height="8" rx="6" fill="#FFC72C"/>
      <circle cx="0" cy="-105" r="14" fill="#07201E"/>
      <circle cx="0" cy="-105" r="10" fill="#5FD3C9"/>
      <circle cx="-3" cy="-107" r="3" fill="#EAFBF8"/>
    </g>
    {/* Seagulls */}
    <g fill="#FFD884" opacity="0.7">
      <path d="M30,50 Q35,45 40,50 Q45,45 50,50"/>
      <path d="M250,60 Q260,55 270,60 Q280,55 290,60"/>
    </g>
  </svg>,
  
  // Panel 2: Satellite view with AFAI overlay
  <svg key="p2" viewBox="0 0 300 200" style={{width:"100%",height:"auto"}}>
    <defs>
      <radialGradient id="satGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#5FD3C9" stopOpacity="0.4"/>
        <stop offset="100%" stopColor="#07201E" stopOpacity="0"/>
      </radialGradient>
    </defs>
    <rect width="300" height="200" fill="#07201E"/>
    <ellipse cx="150" cy="100" rx="120" ry="80" fill="url(#satGlow)"/>
    {/* Satellite beam */}
    <polygon points="150,0 140,80 160,80" fill="#5FD3C9" opacity="0.3"/>
    <ellipse cx="150" cy="100" rx="80" ry="50" fill="none" stroke="#5FD3C9" strokeWidth="1.5" opacity="0.6"/>
    <ellipse cx="150" cy="100" rx="60" ry="38" fill="none" stroke="#5FD3C9" strokeWidth="1" opacity="0.4"/>
    <ellipse cx="150" cy="100" rx="40" ry="25" fill="none" stroke="#5FD3C9" strokeWidth="1" opacity="0.2"/>
    {/* AFAI scale */}
    <g fontFamily="'Bricolage Grotesque',system-ui" fontSize="9" fill="#5FD3C9" fontWeight="700">
      <text x="20" y="30" fill="#22C55E">0.15 ✓</text>
      <text x="20" y="50" fill="#B87A00">0.30 ⚠</text>
      <text x="20" y="70" fill="#E8522A">0.40 ✗</text>
    </g>
  </svg>,
  
  // Panel 3: World map with 5 regions
  <svg key="p3" viewBox="0 0 300 200" style={{width:"100%",height:"auto"}}>
    <rect width="300" height="200" fill="#0B2230"/>
    {/* Simplified world regions */}
    <ellipse cx="80" cy="80" rx="35" ry="25" fill="#155A5A" opacity="0.8"/>
    <ellipse cx="220" cy="70" rx="40" ry="30" fill="#1A5852" opacity="0.8"/>
    <ellipse cx="240" cy="150" rx="30" ry="20" fill="#C97E3A" opacity="0.6"/>
    <ellipse cx="50" cy="140" rx="25" ry="18" fill="#1A5852" opacity="0.7"/>
    <ellipse cx="150" cy="160" rx="35" ry="22" fill="#C97E3A" opacity="0.6"/>
    {/* Region labels */}
    <g fontFamily="'Bricolage Grotesque',system-ui" fontSize="7" fill="#FFD884" fontWeight="700" textAnchor="middle">
      <text x="80" y="110">MQ/GP</text>
      <text x="220" y="105">FL</text>
      <text x="240" y="175">PC</text>
      <text x="50" y="165">RM</text>
      <text x="150" y="190">BDS</text>
    </g>
  </svg>,
  
  // Panel 4: The choice
  <svg key="p4" viewBox="0 0 300 200" style={{width:"100%",height:"auto"}}>
    <defs>
      <linearGradient id="choiceGlow" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFC72C"/><stop offset="100%" stopColor="#FF8A4D"/>
      </linearGradient>
    </defs>
    <rect width="300" height="200" fill="#0d1117"/>
    <circle cx="150" cy="100" r="80" fill="none" stroke="url(#choiceGlow)" strokeWidth="2" opacity="0.3"/>
    <circle cx="150" cy="100" r="60" fill="none" stroke="#FFC72C" strokeWidth="1.5" opacity="0.5"/>
    <circle cx="150" cy="100" r="40" fill="url(#choiceGlow)" opacity="0.2"/>
    {/* Two paths diverging */}
    <path d="M150,60 Q100,100 50,140" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
    <path d="M150,60 Q200,100 250,140" fill="none" stroke="#E8522A" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
    <circle cx="50" cy="140" r="12" fill="#22C55E"/>
    <circle cx="250" cy="140" r="12" fill="#E8522A"/>
    <text x="150" y="185" textAnchor="middle" fontFamily="'Bricolage Grotesque',system-ui" fontSize="11" fontWeight="700" fill="#FFC72C">VOUS CHOISISSEZ</text>
  </svg>
]

export function ComicPaywall({
  lang = "fr",
  onClose,
  onActivated,
  source = "comic",
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
  const [panel, setPanel] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [showOffer, setShowOffer] = useState(false)
  const panelRefs = useRef([])
  const containerRef = useRef(null)
  
  const t = (fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr
  
  // Auto-advance with user control — paused when PassOffer is showing,
  // paused on user interaction (pointer/scroll/keydown) for 6s, paused when tab hidden.
  // Fix A4 (funnel stability 2026-08-12) : était setInterval brut qui swapait pendant
  // la lecture = sensation de fuite. Maintenant respecte l'utilisateur.
  const autoTimerRef = useRef(null)
  const resumeAuto = useCallback(() => {
    if (showOffer) return
    clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => {
      if (typeof document !== "undefined" && document.hasFocus && !document.hasFocus()) {
        resumeAuto()
        return
      }
      setAnimating(true)
      setTimeout(() => {
        setPanel(p => (p + 1) % PANELS.length)
        setAnimating(false)
      }, 400)
      resumeAuto()
    }, 6000)
  }, [showOffer])
  useEffect(() => {
    resumeAuto()
    return () => clearTimeout(autoTimerRef.current)
  }, [resumeAuto])
  // Reset du timer à chaque interaction user (l'utilisateur reprend la main)
  useEffect(() => {
    if (showOffer) return
    const onInteract = () => resumeAuto()
    const root = containerRef.current
    if (root) {
      root.addEventListener("pointerdown", onInteract)
      root.addEventListener("scroll", onInteract, { passive: true })
      root.addEventListener("keydown", onInteract)
    }
    return () => {
      if (root) {
        root.removeEventListener("pointerdown", onInteract)
        root.removeEventListener("scroll", onInteract)
        root.removeEventListener("keydown", onInteract)
      }
    }
  }, [showOffer, resumeAuto])
  
  const goNext = () => {
    if (animating) return
    setAnimating(true)
    setTimeout(() => {
      setPanel(p => (p + 1) % PANELS.length)
      setAnimating(false)
    }, 400)
  }
  
  const goPrev = () => {
    if (animating) return
    setAnimating(true)
    setTimeout(() => {
      setPanel(p => (p - 1 + PANELS.length) % PANELS.length)
      setAnimating(false)
    }, 400)
  }
  
  const currentPanel = PANELS[panel]
  const currentText = currentPanel[lang] || currentPanel.fr
  const currentArt = PANEL_ART[panel]
  
  return (
    <div ref={containerRef} className="sg-paywall-comic" style={{
      position: "fixed", inset: 0, zIndex: 1200,
      background: "#0d1117", overflow: "hidden",
      display: "flex", flexDirection: "column"
    }}>
      {/* Progress indicator — hidden when PassOffer is showing */}
      {!showOffer && <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 10,
        background: "linear-gradient(90deg, #FFC72C, #FF8A4D, #FFC72C)",
        backgroundSize: "200% 100%",
        animation: "progressFlow 8s linear infinite"
      }}>
        <style>{`@keyframes progressFlow { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>}
      
      {/* Panel indicator dots — hidden when PassOffer is showing */}
      {!showOffer && <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 8, zIndex: 10
      }}>
        {PANELS.map((_, i) => (
          <div key={i} style={{
            width: i === panel ? 24 : 8, height: 8, borderRadius: 4,
            background: i === panel ? "#FFC72C" : "rgba(255,255,255,.3)",
            transition: "all .3s cubic-bezier(.34,1.56,.64,1)"
          }}/>
        ))}
      </div>}
      
      {/* Panel content */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "20px 16px", position: "relative", zIndex: 5
      }}>
        {showOffer ? (
          <div style={{ width: "100%", maxWidth: 400, overflowY: "auto", maxHeight: "100%" }}>
            <button
              onClick={() => setShowOffer(false)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)",
                borderRadius: 999, padding: "6px 14px", marginBottom: 16,
                color: "rgba(255,255,255,.7)", fontSize: 12, fontWeight: 600,
                fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
                cursor: "pointer"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              {t("Retour à l'histoire", "Back to story", "Volver a la historia")}
            </button>
            {/* ═══ EMAIL INPUT (P0 fix — bind to payEmailRef, mirror WorldPaywall.jsx:207) ═══ */}
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
                onChange={onPayEmailInput}
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
            <PassOffer
              lang={lang}
              onBuy={onPassBuy}
            />
          </div>
        ) : (<>
          <div key={panel} style={{
            width: "100%", maxWidth: 340, aspectRatio: "3/2",
            marginBottom: 24, borderRadius: 16, overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,.5)",
            animation: "panelSlide .4s cubic-bezier(.34,1.56,.64,1) both"
          }}>
            <style>{`
              @keyframes panelSlide {
                from { opacity: 0; transform: translateX(30px) scale(.95); }
                to { opacity: 1; transform: translateX(0) scale(1); }
              }
            `}</style>
            {currentArt}
          </div>
          <div style={{ textAlign: "center", maxWidth: 320 }}>
            <h2 style={{
              fontFamily: "'Anton', system-ui, sans-serif",
              fontSize: "clamp(22px, 5vw, 28px)",
              fontWeight: 400, textTransform: "uppercase",
              letterSpacing: ".01em", color: "#fff",
              margin: "0 0 12", lineHeight: 1.1,
              textShadow: "0 2px 16px rgba(0,0,0,.5)"
            }}>
              {currentText.title}
            </h2>
            <p style={{
              color: "rgba(255,255,255,.85)",
              fontSize: 15, lineHeight: 1.6,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              margin: "0 0 24"
            }}>
              {currentText.text}
            </p>
          </div>
          <div style={{
            display: "flex", justifyContent: "center", gap: 16,
            marginTop: "auto", paddingBottom: 24
          }}>
            <button
              onClick={goPrev}
              disabled={animating}
              aria-label="Panel précédent"
              style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: animating ? "not-allowed" : "pointer",
                opacity: animating ? 0.5 : 1, color: "#fff"
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,.6)", fontSize: 12, fontWeight: 600 }}>
              {panel + 1} / {PANELS.length}
            </div>
            <button
              onClick={goNext}
              disabled={animating}
              aria-label="Panel suivant"
              style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: animating ? "not-allowed" : "pointer",
                opacity: animating ? 0.5 : 1, color: "#fff"
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </>)}
      </div>
      
      {/* CTA at bottom — hidden when PassOffer is showing */}
      {!showOffer && <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "16px 20px 24px",
        background: "linear-gradient(180deg, transparent 0%, #0d1117 60%)",
        display: "flex", flexDirection: "column", gap: 12,
        alignItems: "center"
      }}>
        {/* FiabiliteProof — Preuve de calibration inline au moment de la décision */}
        <FiabiliteProof lang={lang} REL={window.__REL} regime="high" />
        
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(13,11,20,.9)", border: "1px solid rgba(255,199,44,.4)",
          borderRadius: 999, padding: "6px 14px",
          font: "700 10px 'Bricolage Grotesque',system-ui,sans-serif",
          color: "#FFC72C", letterSpacing: ".03em", textTransform: "uppercase"
        }}>
          <span aria-hidden="true">📖</span>
          <span>Histoire vraie — Données Copernicus</span>
        </div>
        
        <button
          onClick={() => setShowOffer(true)}
          style={{
            width: "100%", maxWidth: 320, margin: "0 auto",
            padding: "14px 28px",
            background: "linear-gradient(135deg, #FFC72C, #E8A800)",
            color: "#1A2B26", border: "none",
            borderRadius: 999, fontSize: 14, fontWeight: 800,
            fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
            letterSpacing: "-.01em", textDecoration: "none",
            boxShadow: "0 4px 20px rgba(232,168,0,.4), 0 2px 0 rgba(0,0,0,.18)",
            cursor: "pointer", transition: "transform .12s cubic-bezier(.34,1.56,.64,1)"
          }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(.97)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        >
          {t("Commencer l'aventure →","Start the adventure →","Comenzar la aventura →")}
        </button>
        
        <button
          onClick={onClose}
          style={{
            width: "100%", maxWidth: 320, margin: "0 auto",
            padding: "12px", background: "transparent",
            border: "1.5px solid rgba(255,255,255,.18)",
            borderRadius: 12, color: "rgba(255,255,255,.6)",
            fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
            fontSize: 13, fontWeight: 600, cursor: "pointer"
          }}
        >
          {t("Plus tard","Later","Más tarde")}
        </button>
      </div>}
      {/* Signature B2C « Le Veilleur » — moat identitaire en pied absolu du paywall comic.
          Toujours visible (panneau carousel ET offer), jamais un CTA, pose le moat seulement.
          Bricolage 600 italic 12px opacity .5 (discret, lisible sur #0d1117). */}
      <p style={{
        margin: "0 0 12px", textAlign: "center", padding: "0 20px",
        font: "italic 600 12px/1.4 'Bricolage Grotesque', system-ui, sans-serif",
        color: "rgba(255,255,255,.5)", letterSpacing: ".01em"
      }}>
        {t("Le Veilleur regarde ta plage, pas la peur.", "The Watcher watches your beach — not the fear.", "El Vigía mira tu playa, no el miedo.")}
      </p>
    </div>
  )
}

export default ComicPaywall