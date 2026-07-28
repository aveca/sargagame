import React, { useEffect, memo } from "react"
import { getSegment } from "./lib/segment.js"

const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)
const SEG_URL = "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
function sbeacon(p) { try { const b = JSON.stringify({ type: "analytics_event", e: "sg_pass_seg", p: p || {}, t: Date.now() }); if (navigator.sendBeacon) navigator.sendBeacon(SEG_URL, b); else fetch(SEG_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: b }).catch(() => {}) } catch (_) {} }

const PASS = { key: "p30", cents: { eur: 1499, usd: 1199 }, days: 30 }

const money = (c, cur, lang) => (cur === "usd" ? "$" + (c / 100).toFixed(2) : lang === "en" ? "€" + (c / 100).toFixed(2) : (c / 100).toFixed(2).replace(".", ",") + " €")
const perDay = (c, days, cur, lang) => { const v = c / 100 / days; const s = (cur === "usd" ? "$" + v.toFixed(2) : lang === "en" ? "€" + v.toFixed(2) : v.toFixed(2).replace(".", ",") + " €"); return _t(lang, `${s}/jour`, `${s}/day`, `${s}/día`) }

const Ck = () => (<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#FFC72C" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>)

const PassOffer = memo(function PassOffer({ lang = "fr", currency = "eur", community = 0, freshTs = null, onBuy, wallet = null }) {
  const cur = currency === "usd" ? "usd" : "eur"
  const seg = getSegment()
  const cents = PASS.cents[cur]
  useEffect(() => { sbeacon({ stage: "view", segment: seg, model: "oneprice" }) }, [])
  const buy = () => {
    sbeacon({ stage: "cta", segment: seg, pass: PASS.key, cents })
    if (onBuy) onBuy({ c: cents, pass: PASS.key, days: PASS.days, segment: seg })
  }
  const lost = cur === "usd" ? "$200" : lang === "en" ? "€200" : "200 €"
  const pd = perDay(cents, PASS.days, cur, lang)

  return (
    <div style={{ position: "relative", color: "#EAF7F4", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
      <div aria-hidden style={{ position: "absolute", top: -130, left: "50%", transform: "translateX(-50%)", width: "min(420px,100%)", maxWidth: "100%", height: 280, background: "radial-gradient(ellipse at center,rgba(255,199,44,.16),transparent 64%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#FFC72C" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
          {_t(lang, "Le Veilleur", "The Watcher", "El Vigía")}
        </div>
        <h2 className="anton" style={{ fontSize: 27, lineHeight: 1.05, color: "#fff", margin: "10px 0 0", letterSpacing: "-.005em" }}>
          {_t(lang, <>Sache où sera la mer <span style={{ color: "#FFC72C" }}>demain</span>.</>, <>Know where the sea will be <span style={{ color: "#FFC72C" }}>tomorrow</span>.</>, <>Sabe dónde estará el mar <span style={{ color: "#FFC72C" }}>mañana</span>.</>)}
        </h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: "rgba(234,247,244,.72)", margin: "10px 0 0" }}>
          {_t(lang, "Satellite 4×/jour, prévision 7 jours, alerte si ta plage bascule. Un prix, pas d'abonnement.", "Satellite 4×/day, 7-day forecast, alert when your beach flips. One price, no subscription.", "Satélite 4×/día, pronóstico 7 días, alerta si tu playa cambia. Un precio, sin suscripción.")}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "16px 0 0", padding: "11px 13px", borderRadius: 14, background: "rgba(232,82,42,.08)", border: "1px solid rgba(232,82,42,.22)" }}>
          <span style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(232,82,42,.14)" }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#E8522A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /></svg>
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.4, fontWeight: 600, color: "rgba(234,247,244,.82)" }}>
            {_t(lang, <>Un jour de plage gâché = <b style={{ color: "#fff", fontWeight: 800 }}>~{lost}</b>. Ton pass = <span style={{ color: "#FFC72C", fontWeight: 800 }}>{pd}</span>.</>,
              <>One ruined beach day = <b style={{ color: "#fff", fontWeight: 800 }}>~{lost}</b>. Your pass = <span style={{ color: "#FFC72C", fontWeight: 800 }}>{pd}</span>.</>,
              <>Un día de playa perdido = <b style={{ color: "#fff", fontWeight: 800 }}>~{lost}</b>. Tu pase = <span style={{ color: "#FFC72C", fontWeight: 800 }}>{pd}</span>.</>)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "10px 0 0", padding: "9px 13px", borderRadius: 12, background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.18)", fontSize: 12, lineHeight: 1.35, fontWeight: 600, color: "rgba(234,247,244,.8)" }}>
          <span style={{ color: "#34d399", fontWeight: 800, fontSize: 14 }}>100%</span>
          {_t(lang, "de nos prévisions « mer propre » vérifiées (saison calme) · ~76% tous régimes · satellite, pas deviné.", "of our \"clean water\" forecasts verified (calm season) · ~76% all regimes · satellite, not guessed.", "de nuestros pronósticos \"agua limpia\" verificados (temporada tranquila) · ~76% todos los regímenes · satélite, no adivinado.")}
        </div>

        <div style={{ margin: "10px 0 0", padding: "11px 13px", borderRadius: 12, background: "rgba(255,199,44,.08)", border: "1px solid rgba(255,199,44,.2)", fontSize: 12, lineHeight: 1.4, fontWeight: 700, color: "rgba(234,247,244,.85)" }}>
          <span style={{ fontSize: 14, marginRight: 7 }}>🌊</span>
          {_t(lang, <>Pic sargasses <b style={{ color: "#FFC72C" }}>en cours</b>. Chaque jour sans prévision = risque.</>,
            <>Sargassum <b style={{ color: "#FFC72C" }}>peak season</b>. Every day without a forecast = risk.</>,
            <>Pico de sargazo <b style={{ color: "#FFC72C" }}>en curso</b>. Cada día sin pronóstico = riesgo.</>)}
        </div>

        {/* Single product card */}
        <div style={{ margin: "18px 0 0" }}>
          <button onClick={buy} className="sg-passcard-hero" style={{
            position: "relative", display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
            border: "1.5px solid #FFC72C", borderRadius: 18, padding: "18px 17px 16px",
            background: "linear-gradient(165deg,rgba(255,199,44,.17),rgba(255,199,44,.03) 58%,transparent)",
            boxShadow: "0 14px 40px rgba(232,168,0,.20),inset 0 0 0 1px rgba(255,228,122,.18)",
          }}>
            <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.05 }}>
                  {_t(lang, "Pass 30 jours", "30-day pass", "Pase 30 días")}
                </span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "rgba(234,247,244,.6)", marginTop: 4 }}>
                  {_t(lang, "Toutes les plages · Prévision 7 jours", "All beaches · 7-day forecast", "Todas las playas · Pronóstico 7 días")}
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                <span className="anton" style={{ fontSize: 34, color: "#FFC72C", lineHeight: .85, letterSpacing: "-.01em" }}>{money(cents, cur, lang)}</span>
                <span style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 800, color: "#190c2c", background: "linear-gradient(135deg,#FFE47A,#FFC72C)", padding: "3px 9px", borderRadius: 999 }}>{pd}</span>
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 7, margin: "13px 0 0" }}>
              {[
                _t(lang, <><b style={{ color: "#fff", fontWeight: 800 }}>LA plage sans sargasses</b> chaque matin, 7h</>, <><b style={{ color: "#fff", fontWeight: 800 }}>THE sargassum-free beach</b> every morning, 7am</>, <><b style={{ color: "#fff", fontWeight: 800 }}>LA playa sin sargazo</b> cada mañana, 7h</>),
                _t(lang, <>Prévision <b style={{ color: "#fff", fontWeight: 800 }}>7 jours</b> · toutes les plages</>, <><b style={{ color: "#fff", fontWeight: 800 }}>7-day</b> forecast · all beaches</>, <>Pronóstico <b style={{ color: "#fff", fontWeight: 800 }}>7 días</b> · todas las playas</>),
                _t(lang, <>Alerte le jour où <b style={{ color: "#fff", fontWeight: 800 }}>ça bascule</b></>, <>Alert the day <b style={{ color: "#fff", fontWeight: 800 }}>it flips</b></>, <>Alerta el día que <b style={{ color: "#fff", fontWeight: 800 }}>cambia</b></>),
              ].map((t, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 600, color: "rgba(234,247,244,.82)" }}>
                  <span style={{ flex: "0 0 auto", width: 17, height: 17, borderRadius: "50%", background: "rgba(255,199,44,.18)", display: "grid", placeItems: "center" }}><Ck /></span>
                  <span>{t}</span>
                </span>
              ))}
            </span>
            <span className="sg-paygold" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 15, borderRadius: 14, padding: "15px", fontFamily: "inherit", background: "linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E89400)", color: "#190c2c", fontSize: 16, fontWeight: 800 }}>
              {_t(lang, "Voir toutes les plages →", "See all beaches →", "Ver todas las playas →")}
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, fontSize: 11, fontWeight: 700, color: "rgba(234,247,244,.55)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                <rect x="4" y="10" width="16" height="10" rx="2" stroke="rgba(124,224,176,.85)" strokeWidth="2"/>
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="rgba(124,224,176,.85)" strokeWidth="2"/>
              </svg>
              {_t(lang, "Paiement sécurisé · Accès immédiat", "Secure payment · Instant access", "Pago seguro · Acceso inmediato")}
            </div>
          </button>
        </div>

        {(community > 0 || freshTs) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", margin: "12px 0 0", fontSize: 11.5, fontWeight: 600, color: "rgba(234,247,244,.62)" }}>
            {community > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#FFC72C", fontWeight: 800 }}>★</span>
                {_t(lang, `Déjà ${community}+ suivent leurs plages`, `${community}+ already track their beaches`, `${community}+ ya siguen sus playas`)}
              </span>
            )}
            {freshTs && (() => {
              const h = Math.max(1, Math.round((Date.now() - new Date(freshTs).getTime()) / 3.6e6))
              if (!(h >= 1 && h < 48)) return null
              const txt = _t(lang, `Données satellite mises à jour il y a ${h} h`, `Satellite data updated ${h}h ago`, `Datos satelitales actualizados hace ${h} h`)
              return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />{txt}</span>
            })()}
          </div>
        )}

        <a href={lang === "en" ? "/reliability/" : lang === "es" ? "/fiabilidad/" : "/fiabilite/"} target="_blank" rel="noopener"
          style={{ display: "block", textAlign: "center", margin: "9px 0 0", fontSize: 12, fontWeight: 800, color: "#FFC72C", textDecoration: "underline", textUnderlineOffset: 2 }}>
          {_t(lang, "Avant de payer, voyez nos erreurs →", "Before you pay, see our errors →", "Antes de pagar, vea nuestros errores →")}
        </a>

        <div style={{ margin: "14px 0 2px", textAlign: "center", fontSize: 10.5, fontWeight: 700, letterSpacing: ".01em", color: "rgba(234,247,244,.42)", lineHeight: 1.5 }}>
          {_t(lang, "Paiement sécurisé Mollie · Pas d'abonnement · 30 jours · Satisfait ou remboursé", "Secure Mollie payment · No subscription · 30 days · Money-back guarantee", "Pago seguro Mollie · Sin suscripción · 30 días · Satisfecho o reembolsado")}
        </div>
      </div>
    </div>
  )
})

export default PassOffer
