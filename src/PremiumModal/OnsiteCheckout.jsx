/**
 * OnsiteCheckout — Overlay de paiement Mollie on-site (restauration post-split).
 *
 * Bug fix (P0 — bouton muet) : le split PremiumModal (commits 5b87b8b4 + 6020ae78)
 * avait perdu l'overlay payStep qui monte les Mollie Components et remplit
 * mollieRef.current. Sans cet overlay, onPassBuy() appelait doSubscribe() qui
 * lisait mollieRef.current = null → throw silencieux → bouton "Commencer" muet
 * sur les 5 domaines (panel : « bouton muet, Pass one-time, Mollie »).
 *
 * Ce module restaure :
 *   1. init Mollie (window.Mollie(profileId)) → mollieRef.current + payReadyRef
 *   2. overlay payStep (z 1300) avec email + 4 champs carte + bouton payer
 *   3. monte les Mollie Components (cardHolder/cardNumber/expiryDate/verificationCode)
 *      dans les refs mol{Holder,Number,Expiry,Cvc}Ref lorsque payStep=true
 *
 * Rendu TOUJOURS MOUNT (caché hors-écran quand payStep=false) — les iframes
 * Mollie ne bootent pas dans un conteneur display:none.
 */
import React, { useState, useRef, useEffect, useCallback } from "react"
import { track } from "../Sargasses_PROD.jsx"
import { seasonalCents } from "../lib/pass-price.js"

export function OnsiteCheckout({
  lang,
  source,
  pwVariant,
  payStep,
  setPayStep,
  passCtxRef,
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
  mollieRef,
  doSubscribe,
  payWithWallet,
  walletRedirect,
  onPayEmailInput,
  // constants
  PAY_PROVIDER,
  PAY_CAPTURE_ONLY,
  PAY_CUR,
  PAY_LABEL,
  NO_TRIAL,
  PRICE_MO,
  PRICE_YR,
  REGION_PAY,
  IS_NEW_REGION,
  REGION,
  __COMM,
  // helpers
  fmtPassPrice,
  _t,
  track,
  walletAvail,
  MOL_FIELD,
  MOL_LABEL,
  MOLLIE_PROFILE,
  MOLLIE_TESTMODE,
  loadMollieJs
}) {
  // Refs des 4 composants Mollie (cardHolder / cardNumber / expiryDate / verificationCode)
  const molHolderRef = useRef(null)
  const molNumberRef = useRef(null)
  const molExpiryRef = useRef(null)
  const molCvcRef = useRef(null)
  const payMountedRef = useRef(false)
  // molReady = state miroir de payReadyRef → re-déclenche l'effet de montage des
  // Components si payStep devient true AVANT la fin de l'init Mollie (race 2026-08-23).
  const [molReady, setMolReady] = useState(false)
  // Ref miroir de payBusy pour les closures clavier (Échap) sans re-bind.
  const payBusyRef = useRef(payBusy)
  payBusyRef.current = payBusy
  // Refs swipe-down (pour retour au paywall depuis l'étape paiement — même geste que le paywall)
  const payScrollRef = useRef(null)
  const payContentRef = useRef(null)
  const payStartYRef = useRef(0)

  // Email : l'overlay est le SEUL détenteur de payEmailRef. À l'ouverture de
  // payStep, on pré-remplit depuis sg_email (écrit par les inputs des paywalls).
  useEffect(() => {
    if (!payStep) return
    try {
      const el = payEmailRef.current
      if (el && !el.value) {
        const em = localStorage.getItem("sg_email") || ""
        if (em) { el.value = em; try { onPayEmailInput && onPayEmailInput() } catch (_) {} }
      }
    } catch (_) {}
  }, [payStep])

  // Échap = 3e voie de sortie (avec « ← Retour » + swipe-down). Interdit pendant
  // un paiement en cours (payBusy) pour ne pas interrompre le tokenize en vol.
  // NB : window+capture (et pas document) → court AVANT le handler du shell
  // paywall (useModalA11y), qui fait stopPropagation et masquerait l'event.
  useEffect(() => {
    if (!payStep) return
    const onKey = (e) => {
      if (e.key === "Escape" && !payBusyRef.current) {
        e.stopPropagation()
        try { track("sg_pay_onsite_back", { via: "esc" }) } catch (_) {}
        setPayStep(false)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [payStep])

  // bfcache : retour arrière depuis le checkout hébergé Mollie → déverrouille le
  // bouton (sinon état figé « Activation… » = paiement impossible sans reload).
  useEffect(() => {
    const onPageShow = (e) => { try { if (e.persisted) { setPayBusy(false); setPayRedirecting(false) } } catch (_) {} }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  const onTouchStartPay = e => { payStartYRef.current = e.touches[0].clientY }
  const onTouchMovePay = e => {
    if (payScrollRef.current && payScrollRef.current.scrollTop > 5) return
    const dy = e.touches[0].clientY - payStartYRef.current
    if (dy > 0 && payContentRef.current) payContentRef.current.style.transform = `translateY(${dy}px)`
  }
  const onTouchEndPay = e => {
    const reset = () => {
      if (payContentRef.current) {
        payContentRef.current.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)"
        payContentRef.current.style.transform = ""
        setTimeout(() => { if (payContentRef.current) payContentRef.current.style.transition = "" }, 300)
      }
    }
    if (payScrollRef.current && payScrollRef.current.scrollTop > 5) { reset(); return }
    const dy = (e.changedTouches[0]?.clientY || 0) - payStartYRef.current
    if (dy > 60) {
      if (payContentRef.current) payContentRef.current.style.transform = ""
      try { track("sg_pay_onsite_back", { plan: payPlanRef.current, via: "swipe" }) } catch (_) {}
      setPayStep(false)
    } else reset()
  }

  // Effet 1 — préchauffage SCRIPT Mollie.js + init mollieRef.current.
  // Le montage des composants (createComponent + .mount) se fait dans l'effet 2,
  // car les divs cibles (molNumberRef etc.) n'existent QUE quand payStep=true.
  useEffect(() => {
    if (PAY_CAPTURE_ONLY) { payReadyRef.current = true; return }
    if (PAY_PROVIDER !== "mollie") { payReadyRef.current = true; return }
    let cancelled = false
    loadMollieJs().then(() => {
      if (cancelled) return
      const locale = lang === "es" ? "es_ES" : lang === "en" ? "en_US" : "fr_FR"
      try {
        mollieRef.current = window.Mollie(MOLLIE_PROFILE, { locale, testmode: MOLLIE_TESTMODE })
        payReadyRef.current = true
        setMolReady(true)
      } catch (e) {
        try { console.error("sg_mollie_init_failed", e) } catch (_) {}
      }
    }).catch(e => {
      try { console.error("sg_mollie_js_load_failed", e) } catch (_) {}
    })
    return () => { cancelled = true }
  }, [PAY_PROVIDER, PAY_CAPTURE_ONLY, lang, MOLLIE_PROFILE, MOLLIE_TESTMODE])

  // Effet 2 — montage des 4 Mollie Components (uniquement quand payStep=true).
  useEffect(() => {
    if (!payStep || PAY_CAPTURE_ONLY || PAY_PROVIDER !== "mollie" || payMountedRef.current) return
    if (!mollieRef.current || !molNumberRef.current) return
    const _molBg = "#241837"
    const styles = {
      base: { color: "#eef2f7", backgroundColor: _molBg, fontSize: "16px", fontWeight: "500", "::placeholder": { color: "rgba(255,255,255,.32)" } },
      valid: { color: "#7CE0B0", backgroundColor: _molBg },
      invalid: { color: "#FF8A66", backgroundColor: _molBg }
    }
    try {
      const M = mollieRef.current
      const holder = M.createComponent("cardHolder", { styles })
      const number = M.createComponent("cardNumber", { styles })
      const expiry = M.createComponent("expiryDate", { styles })
      const cvc = M.createComponent("verificationCode", { styles })
      holder.mount(molHolderRef.current)
      number.mount(molNumberRef.current)
      expiry.mount(molExpiryRef.current)
      cvc.mount(molCvcRef.current)
      payMountedRef.current = true
      try { track("sg_onsite_checkout_opened", { plan: payPlanRef.current, pass: passCtx?.pass, source: source || "unknown" }) } catch (_) {}
    } catch (e) {
      try { console.error("sg_mollie_mount_failed", e) } catch (_) {}
    }
  }, [payStep, lang, PAY_PROVIDER, PAY_CAPTURE_ONLY, molReady])

  if (PAY_PROVIDER !== "mollie" && !PAY_CAPTURE_ONLY) return null

  const passCtx = passCtxRef.current
  const isComic = pwVariant === "comic"

  return (
    <div
      ref={payScrollRef}
      role={payStep ? "dialog" : undefined}
      aria-modal={payStep ? "true" : undefined}
      aria-label={payStep ? _t(lang, "Paiement sécurisé", "Secure checkout", "Pago seguro") : undefined}
      aria-hidden={payStep ? undefined : "true"}
      inert={payStep ? undefined : ""}
      onTouchStart={onTouchStartPay}
      onTouchMove={onTouchMovePay}
      onTouchEnd={onTouchEndPay}
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: isComic
          ? "linear-gradient(168deg,#FDF6E3 0%,#F5EDDA 58%,#EDE4CF 100%)"
          : PAY_CAPTURE_ONLY
          ? "linear-gradient(168deg,#0B2230 0%,#0D1E1C 58%,#0A1714 100%)"
          : "linear-gradient(145deg,#190c2c,#120821)",
        display: "flex", flexDirection: "column",
        overflowX: "hidden", overflowY: "auto",
        transform: payStep ? "none" : "translateX(-200vw)",
        pointerEvents: payStep ? "auto" : "none"
      }}
    >
      <div
        ref={payContentRef}
        style={{
          maxWidth: 480, width: "100%", margin: "0 auto",
          padding: "calc(16px + env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom))",
          flex: 1, display: "flex", flexDirection: "column"
        }}
      >
        {/* Header : Retour + provider */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button
            onClick={() => {
              try { track("sg_pay_onsite_back", { plan: payPlanRef.current, via: "btn" }) } catch (_) {}
              setPayStep(false)
            }}
            style={{
              background: "none", border: "none",
              color: isComic ? "#0D0B14" : "rgba(255,255,255,.65)",
              fontSize: 14,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center",
              gap: 6, padding: "8px 0"
            }}
          >
            ← {_t(lang, "Retour", "Back", "Atrás")}
          </button>
          <span style={{
            fontSize: 11,
            color: isComic ? "rgba(13,11,20,.45)" : "rgba(255,255,255,.45)",
            display: "flex", alignItems: "center", gap: 8
          }}>
            {IS_NEW_REGION && (
              <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 10.5, letterSpacing: ".12em", color: "rgba(255,255,255,.8)" }}>
                {((lang === "es" ? "SARGAZO " : "SARGASSUM ") + String(REGION?.name || "")).toUpperCase()}
              </span>
            )}
            🔒 {PAY_CAPTURE_ONLY ? _t(lang, "Sans carte", "No card", "Sin tarjeta") : "Mollie"}
          </span>
        </div>

        {/* Titre */}
        <h3 style={{
          fontFamily: "'Anton',system-ui,sans-serif", fontSize: 22,
          color: isComic ? "#0D0B14" : "#fff",
          margin: "0 0 4px", letterSpacing: "-.01em"
        }}>
          {PAY_CAPTURE_ONLY
            ? _t(lang, "Débloque ta semaine — c'est offert", "Unlock your week — on us", "Desbloquea tu semana — gratis")
            : passCtx
            ? _t(lang, `Active ton pass ${passCtx.days} jours`, `Activate your ${passCtx.days}-day pass`, `Activa tu pase ${passCtx.days} días`)
            : NO_TRIAL
            ? _t(lang, "Active ta reco du jour", "Activate your daily pick", "Activa tu playa del día")
            : _t(lang, "Démarre ton essai gratuit", "Start your free trial", "Empieza tu prueba gratis")}
        </h3>

        {/* Sous-titre + price detail */}
        <div style={{
          fontSize: 13,
          color: isComic ? "rgba(13,11,20,.6)" : "rgba(255,255,255,.6)",
          marginBottom: 18
        }}>
          {PAY_CAPTURE_ONLY
            ? _t(lang,
                "Paiements en maintenance quelques jours. En attendant, ton accès premium 7 jours est OFFERT — ton email et tu profites tout de suite.",
                "Payments down for a few days. Meanwhile your 7-day premium access is ON US — your email and you're in.",
                "Pagos en mantenimiento unos días. Mientras, tu acceso premium 7 días es GRATIS — tu email y listo.")
            : passCtx
            ? _t(lang,
                `${fmtPassPrice(seasonalCents(passCtx.cents, passCtx.cur), passCtx.cur, "fr")} · ${passCtx.days} jours d'accès complet · paiement unique`,
                `${fmtPassPrice(seasonalCents(passCtx.cents, passCtx.cur), passCtx.cur, "en")} · ${passCtx.days} days full access · one-time`,
                `${fmtPassPrice(seasonalCents(passCtx.cents, passCtx.cur), passCtx.cur, "es")} · ${passCtx.days} días · pago único`)
            : null}
        </div>

        {/* Social proof */}
        {__COMM > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            marginBottom: 14, fontSize: 12, fontWeight: 600,
            color: isComic ? "#B87A00" : "rgba(255,199,44,.75)"
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
            {_t(lang, `Déjà ${__COMM}+ qui suivent leurs plages`, `${__COMM}+ people track their beaches`, `${__COMM}+ personas rastrean sus playas`)}
          </div>
        )}

        {/* Email EN PREMIER (avant wallets et carte) — l'accès est lié à l'email */}
        {!PAY_CAPTURE_ONLY && (
          <div style={{ marginBottom: 14 }}>
            <label style={{
              ...MOL_FIELD,
              color: isComic ? "#0D0B14" : MOL_FIELD.color
            }}>{_t(lang, "E-mail (reçu d'accès)", "Email (access receipt)", "Email (recibo de acceso)")}</label>
            <input
              ref={payEmailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              onChange={onPayEmailInput}
              defaultValue={typeof localStorage !== "undefined" ? (localStorage.getItem("sg_email") || "") : ""}
              placeholder={_t(lang, "ton@email.com", "you@email.com", "tu@email.com")}
              style={{
                width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12,
                fontSize: 16, fontFamily: "inherit", outline: "none",
                border: isComic ? "2.5px solid #0D0B14" : "1px solid rgba(255,255,255,.14)",
                background: isComic ? "#FDF6E3" : "rgba(255,255,255,.05)",
                color: isComic ? "#0D0B14" : "#eef2f7",
                boxShadow: isComic ? "2px 2px 0 #0D0B14" : "none"
              }}
            />
          </div>
        )}
        {PAY_CAPTURE_ONLY && (
          <div style={{ marginBottom: 14 }}>
            <label style={{
              ...MOL_FIELD,
              color: isComic ? "#0D0B14" : MOL_FIELD.color
            }}>{_t(lang, "E-mail (reçu d'accès)", "Email (access receipt)", "Email (recibo de acceso)")}</label>
            <input
              ref={payEmailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              onChange={onPayEmailInput}
              defaultValue={typeof localStorage !== "undefined" ? (localStorage.getItem("sg_email") || "") : ""}
              placeholder={_t(lang, "ton@email.com", "you@email.com", "tu@email.com")}
              style={{
                width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12,
                fontSize: 16, fontFamily: "inherit", outline: "none",
                border: isComic ? "2.5px solid #0D0B14" : "1px solid rgba(255,255,255,.14)",
                background: isComic ? "#FDF6E3" : "rgba(255,255,255,.05)",
                color: isComic ? "#0D0B14" : "#eef2f7",
                boxShadow: isComic ? "2px 2px 0 #0D0B14" : "none"
              }}
            />
            <div style={{
              fontSize: 11,
              color: isComic ? "rgba(13,11,20,.4)" : "rgba(255,255,255,.4)",
              marginTop: 6
            }}>
              {_t(lang, "Pour t'envoyer ton reçu et ton accès premium.", "To send your receipt and premium access.", "Para enviarte tu recibo y acceso premium.")}
            </div>
          </div>
        )}

        {/* Wallets express (Apple Pay / Google Pay) — Mollie only, hors capture */}
        {!PAY_CAPTURE_ONLY && PAY_PROVIDER === "mollie" && (() => {
          let w = { apple: false, google: false }
          try { w = walletAvail() } catch (_) {}
          // walletAvail() peut retourner une Promise (async) — dans ce cas on skip
          // (les wallets seront affichés au prochain render via re-mount).
          if (w && typeof w.then === "function") return null
          if (!w.apple && !w.google) return null
          const cents = seasonalCents(passCtx?.cents ?? 499, passCtx?.cur || PAY_CUR)
          const amountStr2 = (cents / 100).toFixed(2) + (PAY_CUR === "usd" ? " $" : " €")
          const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
          const isAndroid = /Android/.test(navigator.userAgent)
          const order = isIOS ? ["apple", "google"] : isAndroid ? ["google", "apple"] : ["apple", "google"]
          // Consentement rétractation requis (même règle que le bouton carte) → wallets visuellement bloqués
          const walletBlocked = !!(consentFlag && !PAY_CAPTURE_ONLY && passCtx && !consentOk)
          return (
            <div style={{ marginBottom: 14 }}>
              {order.includes("apple") && w.apple && (
                <button
                  type="button"
                  aria-label="Apple Pay"
                  disabled={payBusy || walletBlocked}
                  onClick={() => payWithWallet("applepay")}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 12, border: "none",
                    background: "#000", color: "#fff", fontFamily: "inherit",
                    fontWeight: 600, fontSize: 17, cursor: payBusy ? "wait" : (walletBlocked ? "not-allowed" : "pointer"),
                    opacity: (payBusy || walletBlocked) ? .6 : 1, display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 6, marginBottom: w.google ? 8 : 0
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M17.564 13.13c-.03-2.79 2.28-4.13 2.38-4.2-1.3-1.9-3.32-2.16-4.04-2.19-1.72-.17-3.36 1.01-4.23 1.01-.87 0-2.21-.99-3.64-.96-1.87.03-3.6 1.09-4.56 2.77-1.95 3.38-.5 8.38 1.39 11.13.93 1.34 2.03 2.85 3.47 2.8 1.39-.06 1.92-.9 3.6-.9 1.67 0 2.15.9 3.62.87 1.5-.03 2.45-1.37 3.36-2.72 1.06-1.56 1.5-3.07 1.52-3.15-.03-.01-2.92-1.12-2.95-4.44zM14.78 4.62c.77-.93 1.29-2.22 1.15-3.51-1.11.04-2.45.74-3.24 1.67-.71.82-1.33 2.14-1.16 3.4 1.24.1 2.51-.63 3.25-1.56z" /></svg>
                  <span>{_t(lang, `Payer ${amountStr2} — Face ID / Touch ID`, `Pay ${amountStr2} — Face ID / Touch ID`, `Pagar ${amountStr2} — Face ID / Touch ID`)}</span>
                </button>
              )}
              {order.includes("google") && w.google && (
                <button
                  type="button"
                  aria-label="Google Pay"
                  disabled={payBusy || walletBlocked}
                  onClick={() => walletRedirect("googlepay")}
                  style={{
                    width: "100%", padding: "13px", borderRadius: 12, border: "none",
                    background: "#fff", color: "#3c4043", fontFamily: "inherit",
                    fontWeight: 600, fontSize: 15.5, cursor: payBusy ? "wait" : (walletBlocked ? "not-allowed" : "pointer"),
                    opacity: (payBusy || walletBlocked) ? .6 : 1, display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 7
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
                  <span>{_t(lang, `Payer ${amountStr2} — empreinte / code`, `Pay ${amountStr2} — fingerprint / PIN`, `Pagar ${amountStr2} — huella / PIN`)}</span>
                </button>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <div style={{ flex: 1, height: 1, background: isComic ? "rgba(13,11,20,.14)" : "rgba(255,255,255,.14)" }} />
                <span style={{ fontSize: 11, color: isComic ? "rgba(13,11,20,.45)" : "rgba(255,255,255,.45)" }}>{_t(lang, "ou par carte", "or by card", "o con tarjeta")}</span>
                <div style={{ flex: 1, height: 1, background: isComic ? "rgba(13,11,20,.14)" : "rgba(255,255,255,.14)" }} />
              </div>
            </div>
          )
        })()}

        {/* Panneau carte Mollie — 4 composants individuels (thème sombre premium, zéro blanc) */}
        {!PAY_CAPTURE_ONLY && PAY_PROVIDER === "mollie" && (
          <div style={{
            background: isComic
              ? "#FDF6E3"
              : "linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02))",
            borderRadius: 16,
            border: isComic ? "2.5px solid #0D0B14" : "1px solid rgba(255,255,255,.10)",
            padding: "14px 14px 4px",
            boxShadow: isComic ? "3px 3px 0 #0D0B14" : "0 8px 30px rgba(0,0,0,.30)"
          }}>
            <label style={{...MOL_LABEL, color: isComic ? "#0D0B14" : MOL_LABEL.color }}>{_t(lang, "Nom du titulaire", "Cardholder name", "Nombre del titular")}</label>
            <div ref={molHolderRef} style={{...MOL_FIELD, borderColor: isComic ? "#0D0B14" : MOL_FIELD.borderColor, background: isComic ? "#fff" : MOL_FIELD.background, color: isComic ? "#0D0B14" : MOL_FIELD.color}} />
            <label style={{...MOL_LABEL, color: isComic ? "#0D0B14" : MOL_LABEL.color }}>{_t(lang, "Numéro de carte", "Card number", "Número de tarjeta")}</label>
            <div style={{ position: "relative" }}>
              <div ref={molNumberRef} style={{ ...MOL_FIELD, paddingRight: 74, borderColor: isComic ? "#0D0B14" : MOL_FIELD.borderColor, background: isComic ? "#fff" : MOL_FIELD.background, color: isComic ? "#0D0B14" : MOL_FIELD.color }} />
              <span aria-hidden="true" style={{
                position: "absolute", right: 11, top: 15, display: "flex",
                gap: 5, alignItems: "center", pointerEvents: "none"
              }}>
                <svg width="26" height="17" viewBox="0 0 48 32"><rect width="48" height="32" rx="4" fill="#fff" /><text x="24" y="21" fontFamily="Arial,Helvetica,sans-serif" fontSize="13" fontWeight="700" fill="#1A1F71" textAnchor="middle" letterSpacing="0.5">VISA</text></svg>
                <svg width="26" height="17" viewBox="0 0 48 32"><rect width="48" height="32" rx="4" fill="#fff" /><circle cx="20" cy="16" r="9" fill="#EB001B" /><circle cx="28" cy="16" r="9" fill="#F79E1B" fillOpacity="0.85" /></svg>
              </span>
            </div>
            <div style={{ display: "flex", gap: 11 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{...MOL_LABEL, color: isComic ? "#0D0B14" : MOL_LABEL.color }}>{_t(lang, "Expiration", "Expiry", "Caducidad")}</label>
                <div ref={molExpiryRef} style={{...MOL_FIELD, borderColor: isComic ? "#0D0B14" : MOL_FIELD.borderColor, background: isComic ? "#fff" : MOL_FIELD.background, color: isComic ? "#0D0B14" : MOL_FIELD.color}} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{...MOL_LABEL, color: isComic ? "#0D0B14" : MOL_LABEL.color }}>CVC</label>
                <div ref={molCvcRef} style={{...MOL_FIELD, borderColor: isComic ? "#0D0B14" : MOL_FIELD.borderColor, background: isComic ? "#fff" : MOL_FIELD.background, color: isComic ? "#0D0B14" : MOL_FIELD.color}} />
              </div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 7, marginTop: 12,
              fontSize: 11.5, lineHeight: 1.35,
              color: isComic ? "rgba(13,11,20,.5)" : "rgba(255,255,255,.5)"
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                <rect x="4" y="10" width="16" height="10" rx="2" stroke={isComic ? "#22C55E" : "rgba(124,224,176,.85)"} strokeWidth="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={isComic ? "#22C55E" : "rgba(124,224,176,.85)"} strokeWidth="2" />
              </svg>
              {_t(lang,
                "Paiement chiffré · tes données carte ne sont jamais stockées chez nous",
                "Encrypted payment · your card data is never stored on our servers",
                "Pago cifrado · tus datos de tarjeta nunca se guardan en nuestros servidores")}
            </div>
          </div>
        )}

        {/* Erreur */}
        {payError && (
          <div role="alert" style={{
            display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12,
            padding: "11px 13px", borderRadius: 12,
            background: isComic ? "rgba(232,82,42,.08)" : "rgba(232,82,42,.12)",
            borderLeft: `4px solid #E8522A`
          }}>
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, color: "#F4845F" }}>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div style={{ color: isComic ? "#E8522A" : "#FFD9CC", fontSize: 15, lineHeight: 1.4, fontWeight: 600 }}>{payError}</div>
          </div>
        )}

        {/* Consentement rétractation 14j ( Pass B2C payant ) */}
        {consentFlag && !PAY_CAPTURE_ONLY && passCtx && (
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 9, marginTop: 16,
            padding: "11px 13px", borderRadius: 12,
            background: isComic ? "#F5EDDA" : "#13261F",
            border: isComic ? "2px solid #0D0B14" : "1px solid rgba(255,255,255,.14)",
            cursor: "pointer"
          }}>
            <input
              type="checkbox"
              checked={consentOk}
              onChange={e => {
                setConsentOk(e.target.checked)
                if (e.target.checked) setPayError("")
              }}
              style={{ flexShrink: 0, marginTop: 2, width: 18, height: 18, accentColor: "#FFC72C", cursor: "pointer" }}
            />
            <span style={{ fontSize: 11.5, lineHeight: 1.45, color: isComic ? "#0D0B14" : "rgba(255,255,255,.72)" }}>
              {_t(lang,
                "J'accepte que ma prévision 7 jours et mes alertes me soient fournies immédiatement, dès mon paiement, et je reconnais qu'en demandant cet accès immédiat je perds mon droit de rétractation de 14 jours une fois l'accès ouvert (art. L221-28 13° du Code de la consommation). En cas de problème, contactez-nous.",
                "I agree that my 7-day forecast and alerts are provided immediately upon payment, and I acknowledge that by requesting this immediate access I lose my 14-day right of withdrawal once access is opened (art. L221-28 13° French Consumer Code / Directive 2011/83/EU). If anything goes wrong, just email us.",
                "Acepto que mi previsión de 7 días y mis alertas se me faciliten de inmediato, en cuanto pague, y reconozco que al solicitar este acceso inmediato pierdo mi derecho de desistimiento de 14 días una vez abierto el acceso (art. L221-28 13° del Código de Consumo francés).")}
            </span>
          </label>
        )}

        {/* Bouton PAIEMENT PRINCIPAL — déclenche doSubscribe() (qui lit mollieRef.current.createToken()) */}
        <button
          onClick={() => { try { doSubscribe() } catch (_) {} }}
          disabled={payBusy || (consentFlag && !PAY_CAPTURE_ONLY && passCtx && !consentOk)}
          style={{
            width: "100%", padding: 15, borderRadius: 14, marginTop: 16,
            border: isComic ? "2.5px solid #0D0B14" : "none",
            cursor: payBusy ? "wait" : ((consentFlag && !PAY_CAPTURE_ONLY && passCtx && !consentOk) ? "not-allowed" : "pointer"),
            fontFamily: isComic ? "'Anton',system-ui,sans-serif" : "inherit",
            fontWeight: 800, fontSize: 15.5, letterSpacing: isComic ? ".02em" : "normal",
            textTransform: isComic ? "uppercase" : "none",
            opacity: (payBusy || (consentFlag && !PAY_CAPTURE_ONLY && passCtx && !consentOk)) ? .7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: isComic
              ? "#FFC72C"
              : "linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E8A317)",
            color: isComic ? "#0D0B14" : "#190c2c",
            boxShadow: isComic
              ? "3px 3px 0 #0D0B14"
              : "0 4px 0 0 rgba(0,0,0,.30),0 8px 24px rgba(232,168,0,.28)"
          }}
        >
          {payBusy
            ? _t(lang, "Activation…", "Activating…", "Activando…")
            : PAY_CAPTURE_ONLY
            ? _t(lang, "Débloquer gratuitement →", "Unlock free →", "Desbloquear gratis →")
            : passCtx
            ? _t(lang, `Payer ${fmtPassPrice(seasonalCents(passCtx.cents, passCtx.cur), passCtx.cur, "fr")}`, `Pay ${fmtPassPrice(seasonalCents(passCtx.cents, passCtx.cur), passCtx.cur, "en")}`, `Pagar ${fmtPassPrice(seasonalCents(passCtx.cents, passCtx.cur), passCtx.cur, "es")}`)
            : NO_TRIAL
            ? (payPlanRef.current === "annual"
              ? _t(lang, `Payer ${PRICE_YR} — activer maintenant`, `Pay ${PRICE_YR} — activate now`, `Pagar ${PRICE_YR} — activar ya`)
              : _t(lang, `Payer ${PRICE_MO} — activer maintenant`, `Pay ${PRICE_MO} — activate now`, `Pagar ${PRICE_MO} — activar ya`))
            : _t(lang, "Démarrer l'essai — 0 € aujourd'hui", "Start trial — $0 today", "Empezar prueba — $0 hoy")}
        </button>

        <div style={{
          textAlign: "center", marginTop: 12, fontSize: 10.5,
          color: isComic ? "rgba(13,11,20,.4)" : "rgba(255,255,255,.4)"
        }}>
          {PAY_CAPTURE_ONLY
            ? _t(lang, "Offert le temps qu'on rouvre · sans carte · juste ton email", "On us while we reopen · no card · just your email", "Gratis mientras reabrimos · sin tarjeta · solo tu email")
            : NO_TRIAL
            ? _t(lang, "Sans engagement · Annule en 2 clics · " + PAY_LABEL + " sécurisé", "No commitment · Cancel in 2 clicks · Secured by " + PAY_LABEL, "Sin compromiso · Cancela en 2 clics · " + PAY_LABEL + " seguro")
            : _t(lang, "Sans engagement · Rappel 2 jours avant la 1re charge", "No commitment · Reminder 2 days before first charge", "Sin compromiso · Recordatorio 2 días antes del primer cobro")}
        </div>

        {/* Consentement implicite (l'acte de paiement vaut renonciation) */}
        {!consentFlag && !PAY_CAPTURE_ONLY && (
          <div style={{
            textAlign: "center", marginTop: 8, fontSize: 10, lineHeight: 1.45,
            color: isComic ? "rgba(13,11,20,.34)" : "rgba(255,255,255,.34)"
          }}>
            {_t(lang,
              "Accès immédiat : en payant, vous demandez la livraison tout de suite — le droit de rétractation de 14 j ne s'applique plus une fois l'accès ouvert. En cas de problème, écrivez-nous.",
              "Immediate access: by paying, you request delivery right away — the 14-day right of withdrawal no longer applies once access is open. If anything goes wrong, just email us.",
              "Acceso inmediato: al pagar, solicitas la entrega de inmediato — el derecho de desistimiento de 14 días deja de aplicarse una vez abierto el acceso. Si hay algún problema, escríbenos.")}{" "}
            <a href="/cgv.html" target="_blank" rel="noopener" style={{ color: isComic ? "#B87A00" : "rgba(255,255,255,.5)", textDecoration: "underline" }}>{_t(lang, "CGV", "Terms", "Términos")}</a>
          </div>
        )}

        {/* Bouton Réessayer (visible seulement si erreur) */}
        {payError && (
          <button
            onClick={() => { try { setPayError(""); setPayStep(false) } catch (_) {} }}
            style={{
              background: "none",
              border: isComic ? "2px solid #0D0B14" : "1px solid rgba(255,255,255,.25)",
              borderRadius: 12,
              color: isComic ? "#0D0B14" : "rgba(255,255,255,.8)",
              fontSize: 12.5, fontWeight: 600, padding: "11px 14px",
              width: "100%", cursor: "pointer", fontFamily: "inherit", marginTop: 14
            }}
          >
            {_t(lang, "↻ Réessayer le paiement sécurisé", "↻ Retry secure checkout", "↻ Reintentar el pago seguro")}
          </button>
        )}
      </div>
    </div>
  )
}

export default OnsiteCheckout
