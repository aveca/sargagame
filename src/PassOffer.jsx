import React, { useEffect } from "react"
import { getSegment } from "./lib/segment.js"

// i18n local (le _t de l'app n'est pas exporté).
const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)

// Beacon segment first-party (même endpoint analytics que le reste). Mesure la
// valeur PAR segment : sg_pass_seg {stage:view|cta, segment, pass, cents, variant}.
const SEG_URL = "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
function sbeacon(p) { try { const b = JSON.stringify({ type: "analytics_event", e: "sg_pass_seg", p: p || {}, t: Date.now() }); if (navigator.sendBeacon) navigator.sendBeacon(SEG_URL, b); else fetch(SEG_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: b }).catch(() => {}) } catch (_) {} }

// A/B sticky local (même convention sg_ab que l'app) — retourne l'INDEX de variante.
function abPick(testId, variants, weights) {
  try {
    const ab = JSON.parse(localStorage.getItem("sg_ab") || "{}")
    if (ab[testId] != null && ab[testId] < variants.length) return ab[testId]
    let r = Math.random(), c = 0, p = 0
    for (let i = 0; i < weights.length; i++) { c += weights[i]; if (r < c) { p = i; break } }
    ab[testId] = p; localStorage.setItem("sg_ab", JSON.stringify(ab)); return p
  } catch { return 0 }
}

// Catalogue passes one-time (généré par scripts/create-pass-links.cjs → pass-links.json).
// Liens Payment Link publics (aucun secret). Redirigent ?pass=pNN → accès time-boxé.
const PASS = {
  mq: {
    p7: [{ c: 799, u: "https://buy.stripe.com/4gM6oJfbZ2sOggZacb0co0Q" }, { c: 999, u: "https://buy.stripe.com/fZu28t1l92sO2q95VV0co0R" }],
    p30: [{ c: 1499, u: "https://buy.stripe.com/bJe5kFgg35F06Gp1FF0co0S" }, { c: 1999, u: "https://buy.stripe.com/28EdRbd3R4AWaWF8430co0T" }, { c: 2499, u: "https://buy.stripe.com/aFa28t3th1oKggZ8430co0U" }],
  },
  gp: {
    p7: [{ c: 799, u: "https://buy.stripe.com/8x26oJd3RgjE1m56ZZ0co0V" }, { c: 999, u: "https://buy.stripe.com/00w28t8NB6J48Ox6ZZ0co0W" }],
    p30: [{ c: 1499, u: "https://buy.stripe.com/4gM6oJ2pd8Rcd4N6ZZ0co0X" }, { c: 1999, u: "https://buy.stripe.com/fZu00l6Ftd7se8R0BB0co0Y" }, { c: 2499, u: "https://buy.stripe.com/fZu4gB9RF9Vg2q96ZZ0co0Z" }],
  },
}

const eur = (c, lang) => (lang === "en" ? "€" + (c / 100).toFixed(2) : (c / 100).toFixed(2).replace(".", ",") + " €")
const perDay = (c, days, lang) => { const v = (c / 100 / days); const s = (lang === "en" ? "€" + v.toFixed(2) : v.toFixed(2).replace(".", ",") + " €"); return _t(lang, `${s}/jour`, `${s}/day`, `${s}/día`) }

/**
 * PassOffer — storefront « paie à l'usage », niveau PRO golden-hour. Passes one-time
 * (accès time-boxé à la prévision 7j RÉELLE + alertes + brief). Sans abonnement, sans
 * essai. Prix par A/B (pass_price). onBuy(item) → track + redirect direct.
 */
export default function PassOffer({ lang = "fr", onBuy }) {
  const isGP = typeof window !== "undefined" && /guadeloupe/.test(window.location.hostname)
  const cat = isGP ? PASS.gp : PASS.mq
  const v = abPick("pass_price", ["a", "b", "c"], [.34, .33, .33])
  const seg = getSegment()
  const p30 = cat.p30[Math.min(v, cat.p30.length - 1)]
  const p7 = cat.p7[Math.min(v, cat.p7.length - 1)]
  useEffect(() => { sbeacon({ stage: "view", segment: seg, variant: v, island: isGP ? "gp" : "mq" }) }, [])// eslint-disable-line
  const buy = (item, pass) => {
    sbeacon({ stage: "cta", segment: seg, pass, cents: item.c, variant: v })
    if (onBuy) onBuy({ ...item, pass, segment: seg }); else try { window.location.href = item.u } catch (_) {}
  }

  return (
    <div style={{ margin: "0 0 8px" }}>
      {/* Bandeau golden-hour (le style : une aube sur la mer, calme, statique) */}
      <div style={{ position: "relative", margin: "0 -24px 16px", height: 86, overflow: "hidden" }}>
        <svg viewBox="0 0 400 86" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
          <defs>
            <linearGradient id="poSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230" /><stop offset=".5" stopColor="#155A5A" /><stop offset=".84" stopColor="#C97E3A" /><stop offset="1" stopColor="#F2B05E" /></linearGradient>
            <radialGradient id="poSun" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFE6A8" stopOpacity=".95" /><stop offset=".45" stopColor="#FFD884" stopOpacity=".4" /><stop offset="1" stopColor="#FFD884" stopOpacity="0" /></radialGradient>
          </defs>
          <rect width="400" height="86" fill="url(#poSky)" />
          <circle cx="300" cy="86" r="64" fill="url(#poSun)" /><circle cx="300" cy="84" r="17" fill="#FFE6A8" />
          {[-32, -16, 0, 16, 32].map((a, i) => (<path key={i} d="M300 84 L295 30 L305 30 Z" fill="#FFD884" opacity=".07" transform={`rotate(${a} 300 84)`} />))}
          <path d="M0 60 Q120 50 230 58 L240 86 L0 86 Z" fill="#0E1F25" opacity=".55" />
          <path d="M250 50 q10 -26 22 -2 q6 16 2 16 l-30 0 q-2 -8 6 -14 Z" fill="#12262B" opacity=".7" />
        </svg>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(13,30,28,0) 38%,rgba(13,30,28,.55) 78%,#0D1E1C 100%)" }} />
        <div style={{ position: "absolute", left: 24, right: 24, bottom: 10 }}>
          <div className="anton" style={{ fontSize: 23, lineHeight: 1.02, color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,.5)", letterSpacing: ".005em" }}>
            {(() => { const G = { color: "#FFC72C" }; const H = {
              voyageur: _t(lang, <>Ne gâche pas tes <span style={G}>vacances</span>.</>, <>Don't let sargassum ruin your <span style={G}>trip</span>.</>, <>Que el sargazo no arruine tus <span style={G}>vacaciones</span>.</>),
              planificateur: _t(lang, <>Prépare ton séjour. Sache où sera la <span style={G}>mer</span>.</>, <>Plan your stay. Know where the <span style={G}>sea</span> will be.</>, <>Planea tu viaje. Sabe dónde estará el <span style={G}>mar</span>.</>),
              habitue: _t(lang, <>Tes plages, surveillées tout l'<span style={G}>été</span>.</>, <>Your beaches, watched all <span style={G}>season</span>.</>, <>Tus playas, vigiladas toda la <span style={G}>temporada</span>.</>),
              decouverte: _t(lang, <>Paie ta période. <span style={G}>Rien de plus.</span></>, <>Pay for your stay. <span style={G}>Nothing more.</span></>, <>Paga tu estancia. <span style={G}>Nada más.</span></>),
            }; return H[seg] || H.decouverte })()}
          </div>
        </div>
      </div>

      <div style={{ font: "600 12.5px/1.45 'Bricolage Grotesque',system-ui,sans-serif", color: "rgba(234,247,244,.66)", margin: "0 0 14px" }}>
        {_t(lang, "Le Veilleur garde ta plage à l'œil le temps de tes vacances. Pas d'abonnement, pas de renouvellement.", "The Watcher keeps an eye on your beach for your whole stay. No subscription, no auto-renew.", "El Vigía vigila tu playa durante tu estancia. Sin suscripción ni renovación.")}
      </div>

      {/* Carte 30j — HÉRO (golden) */}
      <button onClick={() => buy(p30, "p30")} style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", position: "relative",
        border: "1.5px solid #FFC72C", borderRadius: 18, background: "linear-gradient(165deg,rgba(255,199,44,.16),rgba(255,199,44,.03) 60%,transparent)",
        padding: "16px 17px 15px", marginBottom: 11, boxShadow: "0 10px 30px rgba(232,168,0,.16)",
      }}>
        <span style={{ position: "absolute", top: -10, right: 16, background: "linear-gradient(135deg,#FFD75A,#E8A800)", color: "#1A2B26", font: "800 10.5px/1 'Bricolage Grotesque',system-ui", letterSpacing: ".05em", padding: "5px 10px", borderRadius: 999, boxShadow: "0 4px 12px rgba(232,168,0,.4)" }}>
          {_t(lang, "VACANCES", "VACATION", "VACACIONES")}
        </span>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "800 17px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#fff" }}>{_t(lang, "Pass 30 jours", "30-day pass", "Pase 30 días")}</div>
            <div style={{ font: "700 11px/1 'Bricolage Grotesque',system-ui", color: "#FFC72C", marginTop: 5, letterSpacing: ".02em" }}>{perDay(p30.c, 30, lang)}</div>
          </div>
          <div className="anton" style={{ fontSize: 30, color: "#FFC72C", lineHeight: .9, letterSpacing: "-.01em", flexShrink: 0 }}>{eur(p30.c, lang)}</div>
        </div>
        <div style={{ font: "600 12px/1.4 system-ui,sans-serif", color: "rgba(234,247,244,.72)", margin: "9px 0 13px" }}>
          {_t(lang, "Accès complet 30 jours · prévision 7 j, alertes & brief par plage. Paiement unique.", "Full access for 30 days · 7-day forecast, alerts & brief per beach. One-time.", "Acceso completo 30 días · pronóstico 7 d, alertas y resumen por playa. Pago único.")}
        </div>
        <div style={{ display: "block", width: "100%", textAlign: "center", borderRadius: 13, padding: "13px", background: "linear-gradient(135deg,#FFC72C,#E8A800)", color: "#1A2B26", font: "800 15px/1 'Bricolage Grotesque',system-ui", boxShadow: "0 6px 18px rgba(232,168,0,.3)" }}>
          {_t(lang, "Activer mes 30 jours →", "Activate my 30 days →", "Activar mis 30 días →")}
        </div>
      </button>

      {/* Carte 7j — secondaire */}
      <button onClick={() => buy(p7, "p7")} style={{
        display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        border: "1px solid rgba(255,255,255,.18)", borderRadius: 15, background: "rgba(255,255,255,.04)", padding: "13px 15px",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "800 14.5px/1 'Bricolage Grotesque',system-ui", color: "#fff" }}>{_t(lang, "Pass 7 jours", "7-day pass", "Pase 7 días")}</div>
          <div style={{ font: "600 11.5px/1.3 system-ui", color: "rgba(234,247,244,.6)", marginTop: 4 }}>{_t(lang, "Un week-end, une escapade.", "A weekend, a getaway.", "Un finde, una escapada.")} · {perDay(p7.c, 7, lang)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          <span className="anton" style={{ fontSize: 19, color: "#EAF7F4", lineHeight: .9 }}>{eur(p7.c, lang)}</span>
          <span style={{ color: "#FFC72C", fontSize: 18, fontWeight: 800 }}>→</span>
        </div>
      </button>

      <div style={{ textAlign: "center", marginTop: 12, font: "600 10.5px/1.3 system-ui,sans-serif", color: "rgba(234,247,244,.46)", letterSpacing: ".015em" }}>
        {_t(lang, "Sans abonnement · sans renouvellement · accès immédiat · paiement sécurisé Stripe", "No subscription · no auto-renew · instant access · secure Stripe payment", "Sin suscripción · sin renovación · acceso inmediato · pago seguro Stripe")}
      </div>
    </div>
  )
}
