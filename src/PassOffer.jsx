import React, { useEffect } from "react"
import { getSegment } from "./lib/segment.js"

// i18n local (le _t de l'app n'est pas exporté).
const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)

// Beacon segment first-party (même endpoint analytics). sg_pass_seg {stage, segment, pass, cents, method}.
const SEG_URL = "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
function sbeacon(p) { try { const b = JSON.stringify({ type: "analytics_event", e: "sg_pass_seg", p: p || {}, t: Date.now() }); if (navigator.sendBeacon) navigator.sendBeacon(SEG_URL, b); else fetch(SEG_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: b }).catch(() => {}) } catch (_) {} }

// ── Catalogue PASS one-time, PAR DEVISE (modèle PASS-ONLY, prix figés) ─────────
// cents validés serveur (mollie.php $allowedByCur). EUR (MQ/GP) : 799/1499/2499.
// USD (régions touristes) : 599/1199/1999 ($5.99/$11.99/$19.99). Le paiement passe
// TOUJOURS par onBuy → Mollie on-site (carte / Apple / Google Pay), multi-devise
// (Mollie encaisse en USD, règle en EUR). Saison montrée au segment local seulement.
const CAT = {
  eur: { P7: { c: 799, days: 7, key: "p7" }, P30: { c: 1499, days: 30, key: "p30" }, SAISON: { c: 2499, days: 210, key: "saison" } },
  usd: { P7: { c: 599, days: 7, key: "p7" }, P30: { c: 1199, days: 30, key: "p30" }, SAISON: { c: 1999, days: 210, key: "saison" } },
}
// Formatage devise-aware. USD → "$5.99" (point). EUR → "€5.99" (en) / "5,99 €" (fr/es).
const money = (c, cur, lang) => (cur === "usd" ? "$" + (c / 100).toFixed(2) : lang === "en" ? "€" + (c / 100).toFixed(2) : (c / 100).toFixed(2).replace(".", ",") + " €")
const perDay = (c, days, cur, lang) => { const v = (c / 100 / days); const s = (cur === "usd" ? "$" + v.toFixed(2) : lang === "en" ? "€" + v.toFixed(2) : v.toFixed(2).replace(".", ",") + " €"); return _t(lang, `${s}/jour`, `${s}/day`, `${s}/día`) }
const Ck = () => (<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#FFC72C" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>)

/**
 * PassOffer — storefront PASS-ONLY (direction "premium sombre"). 3 cartes : 7j (ancre
 * basse), 30j HÉROS, Saison (local). Aucune mention d'abonnement. onBuy({c,pass,days,
 * method}) → le parent route vers Mollie on-site (carte ou wallet). Pas de Stripe.
 */
export default function PassOffer({ lang = "fr", currency = "eur", community = 0, freshTs = null, onBuy }) {
  const cur = currency === "usd" ? "usd" : "eur"
  const { P7, P30, SAISON } = CAT[cur]
  const seg = getSegment()
  const isGP = typeof window !== "undefined" && /guadeloupe/.test(window.location.hostname)
  const showSeason = seg === "habitue" || seg === "local"
  // Ancrages devise-aware : journée gâchée (~200) + prix/jour du pass héros 30j.
  const lost = cur === "usd" ? "$200" : lang === "en" ? "€200" : "200 €"
  const pd30 = perDay(P30.c, P30.days, cur, lang)
  useEffect(() => { sbeacon({ stage: "view", segment: seg, island: isGP ? "gp" : "mq", model: "passonly" }) }, [])// eslint-disable-line
  const buy = (p, method) => {
    sbeacon({ stage: "cta", segment: seg, pass: p.key, cents: p.c, method: method || "card" })
    if (onBuy) onBuy({ c: p.c, pass: p.key, days: p.days, segment: seg, method: method || null })
  }

  const G = { color: "#FFC72C" }
  // carte secondaire (7j / saison)
  const SecCard = ({ p, label, desc, perdayTxt }) => (
    <button onClick={() => buy(p)} className="sg-passcard-sec" style={{
      display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 12,
      cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit",
      border: "1px solid rgba(255,255,255,.13)", borderRadius: 18, background: "rgba(255,255,255,.035)", padding: "14px 16px",
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{label}</span>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "rgba(234,247,244,.56)", marginTop: 5, lineHeight: 1.3 }}>{desc}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ textAlign: "right" }}>
          <span className="anton" style={{ display: "block", fontSize: 19, color: "#EAF7F4", lineHeight: .9 }}>{money(p.c, cur, lang)}</span>
          <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "rgba(234,247,244,.5)", marginTop: 3 }}>{perdayTxt}</span>
        </span>
        <span style={{ color: "#FFC72C", fontSize: 17, fontWeight: 800 }}>→</span>
      </span>
    </button>
  )

  return (
    <div style={{ position: "relative", color: "#EAF7F4", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
      {/* halo doré diffus (golden-hour, ancre l'or premium) */}
      <div aria-hidden style={{ position: "absolute", top: -130, left: "50%", transform: "translateX(-50%)", width: "min(420px,100%)", maxWidth: "100%", height: 280, background: "radial-gradient(ellipse at center,rgba(255,199,44,.16),transparent 64%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* eyebrow */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#FFC72C" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
          {_t(lang, "Le Veilleur · Pass", "The Watcher · Pass", "El Vigía · Pase")}
        </div>
        {/* titre */}
        <h2 className="anton" style={{ fontSize: 27, lineHeight: 1.05, color: "#fff", margin: "10px 0 0", letterSpacing: "-.005em" }}>
          {_t(lang, <>Ne gâche pas un seul jour de tes <span style={G}>vacances.</span></>, <>Don't waste a single day of your <span style={G}>trip.</span></>, <>No pierdas ni un día de tus <span style={G}>vacaciones.</span></>)}
        </h2>
        {/* sous-titre */}
        <p style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: "rgba(234,247,244,.72)", margin: "10px 0 0" }}>
          {_t(lang, <>Le Veilleur te dit <b style={{ color: "#fff", fontWeight: 800 }}>chaque matin</b> LA plage sans sargasses. Pass, paiement unique — pas d'abonnement.</>,
            <>The Watcher tells you <b style={{ color: "#fff", fontWeight: 800 }}>every morning</b> THE sargassum-free beach. Pass, one-time — no subscription.</>,
            <>El Vigía te dice <b style={{ color: "#fff", fontWeight: 800 }}>cada mañana</b> LA playa sin sargazo. Pase, pago único — sin suscripción.</>)}
        </p>
        {/* ancrage regret */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "16px 0 0", padding: "11px 13px", borderRadius: 14, background: "rgba(232,82,42,.08)", border: "1px solid rgba(232,82,42,.22)" }}>
          <span style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(232,82,42,.14)" }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#E8522A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /></svg>
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.4, fontWeight: 600, color: "rgba(234,247,244,.82)" }}>
            {_t(lang, <>Un jour de plage gâché = <b style={{ color: "#fff", fontWeight: 800 }}>~{lost} perdus</b>. Ton pass : <span style={{ color: "#FFC72C", fontWeight: 800 }}>{pd30}</span>.</>,
              <>One ruined beach day = <b style={{ color: "#fff", fontWeight: 800 }}>~{lost} lost</b>. Your pass: <span style={{ color: "#FFC72C", fontWeight: 800 }}>{pd30}</span>.</>,
              <>Un día de playa perdido = <b style={{ color: "#fff", fontWeight: 800 }}>~{lost} perdidos</b>. Tu pase: <span style={{ color: "#FFC72C", fontWeight: 800 }}>{pd30}</span>.</>)}
          </span>
        </div>
        {/* preuve fiabilité (désamorce le doute juste avant le prix) */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "10px 0 0", padding: "9px 13px", borderRadius: 12, background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.18)", fontSize: 12, lineHeight: 1.35, fontWeight: 600, color: "rgba(234,247,244,.8)" }}>
          <span style={{ color: "#34d399", fontWeight: 800, fontSize: 14 }}>100%</span>
          {_t(lang, "de nos prévisions « mer propre » se sont vérifiées (saison calme, sur 2274) · ~76% tous régimes confondus · mesuré au satellite, jamais deviné.", "of our \"clean water\" calls proved correct (calm season, over 2274) · ~76% across all regimes · measured by satellite, never guessed.", "de nuestros pronósticos de \"agua limpia\" se cumplieron (temporada tranquila, sobre 2274) · ~76% en todos los regímenes · medido por satélite, nunca adivinado.")}
        </div>

        {/* Preuve sociale + fraîcheur (A/B-gated côté parent : community=0 / freshTs=null → masqué).
            Valeurs HONNÊTES : community = plancher réel des leads email ; freshTs = updatedAt réel du pipeline. */}
        {(community > 0 || freshTs) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", margin: "10px 0 0", fontSize: 11.5, fontWeight: 600, color: "rgba(234,247,244,.62)" }}>
            {community > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#FFC72C", fontWeight: 800 }}>★</span>
                {_t(lang, `Déjà ${community}+ vacanciers suivent leurs plages`, `${community}+ beachgoers already track their beaches`, `${community}+ veraneantes ya siguen sus playas`)}
              </span>
            )}
            {(() => {
              if (!freshTs) return null
              const h = Math.round((Date.now() - new Date(freshTs).getTime()) / 3.6e6)
              if (!(h >= 0 && h < 48)) return null
              const txt = h < 1
                ? _t(lang, "Données mises à jour à l'instant", "Data updated just now", "Datos actualizados ahora")
                : _t(lang, `Données mises à jour il y a ${h} h`, `Data updated ${h}h ago`, `Datos actualizados hace ${h} h`)
              return (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
                  {txt}
                </span>
              )
            })()}
          </div>
        )}

        {/* GRILLE PASS */}
        <div style={{ margin: "18px 0 0", display: "flex", flexDirection: "column", gap: 11 }}>
          {/* 7 jours — ancre basse */}
          <SecCard p={P7}
            label={_t(lang, "Pass 7 jours", "7-day Pass", "Pase 7 días")}
            desc={_t(lang, "Court séjour, une escapade", "Short stay, a getaway", "Estancia corta, una escapada")}
            perdayTxt={perDay(P7.c, P7.days, cur, lang)} />

          {/* 30 jours — HÉROS */}
          <button onClick={() => buy(P30)} className="sg-passcard-hero" style={{
            position: "relative", display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
            border: "1.5px solid #FFC72C", borderRadius: 18, padding: "18px 17px 16px", marginTop: 6,
            background: "linear-gradient(165deg,rgba(255,199,44,.17),rgba(255,199,44,.03) 58%,transparent)",
            boxShadow: "0 14px 40px rgba(232,168,0,.20),inset 0 0 0 1px rgba(255,228,122,.18)",
          }}>
            <span style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", background: "linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)", color: "#190c2c", fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", padding: "5px 12px", borderRadius: 999, boxShadow: "0 5px 14px rgba(232,168,0,.45)" }}>
              {_t(lang, "★ Le plus choisi", "★ Most chosen", "★ El más elegido")}
            </span>
            <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.05 }}>{_t(lang, "Pass 30 jours", "30-day pass", "Pase 30 días")}</span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "rgba(234,247,244,.6)", marginTop: 4 }}>{_t(lang, "Le séjour parfait · 1 à 3 semaines", "The perfect stay · 1 to 3 weeks", "La estancia perfecta · 1 a 3 semanas")}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                <span className="anton" style={{ fontSize: 34, color: "#FFC72C", lineHeight: .85, letterSpacing: "-.01em" }}>{money(P30.c, cur, lang)}</span>
                <span style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 800, color: "#190c2c", background: "linear-gradient(135deg,#FFE47A,#FFC72C)", padding: "3px 9px", borderRadius: 999 }}>{perDay(P30.c, P30.days, cur, lang)}</span>
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 7, margin: "13px 0 0" }}>
              {[
                _t(lang, <><b style={{ color: "#fff", fontWeight: 800 }}>LA plage sans sargasses</b> chaque matin, 7h</>, <><b style={{ color: "#fff", fontWeight: 800 }}>THE sargassum-free beach</b> every morning, 7am</>, <><b style={{ color: "#fff", fontWeight: 800 }}>LA playa sin sargazo</b> cada mañana, 7h</>),
                _t(lang, <>Prévision <b style={{ color: "#fff", fontWeight: 800 }}>7 jours</b> · 136+ plages détaillées</>, <><b style={{ color: "#fff", fontWeight: 800 }}>7-day</b> forecast · 136+ detailed beaches</>, <>Pronóstico <b style={{ color: "#fff", fontWeight: 800 }}>7 días</b> · 136+ playas</>),
                _t(lang, <>Alerte le jour où ta plage <b style={{ color: "#fff", fontWeight: 800 }}>bascule</b></>, <>Alert the day your beach <b style={{ color: "#fff", fontWeight: 800 }}>flips</b></>, <>Alerta el día que tu playa <b style={{ color: "#fff", fontWeight: 800 }}>cambia</b></>),
              ].map((t, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 600, color: "rgba(234,247,244,.82)" }}>
                  <span style={{ flex: "0 0 auto", width: 17, height: 17, borderRadius: "50%", background: "rgba(255,199,44,.18)", display: "grid", placeItems: "center" }}><Ck /></span>
                  <span>{t}</span>
                </span>
              ))}
            </span>
            <span className="sg-paygold" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 15, borderRadius: 14, padding: "15px", fontFamily: "inherit", background: "linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E89400)", color: "#190c2c", fontSize: 16, fontWeight: 800 }}>
              {_t(lang, "Activer mes 30 jours →", "Activate my 30 days →", "Activar mis 30 días →")}
            </span>
          </button>

          {/* Saison — local uniquement */}
          {showSeason && <SecCard p={SAISON}
            label={_t(lang, "Pass Saison", "Season Pass", "Pase Temporada")}
            desc={_t(lang, "Local, pêche & nautique · toute la saison", "Local, fishing & watersports · all season", "Local, pesca y náutica · toda la temporada")}
            perdayTxt={_t(lang, "le meilleur prix", "best value", "mejor precio")} />}
        </div>

        {/* PAIEMENT NATIF — Apple / Google Pay (one-tap sur le pass héros 30j) */}
        <div style={{ margin: "16px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 11px" }}>
            <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: "rgba(234,247,244,.42)", textTransform: "uppercase", whiteSpace: "nowrap" }}>{_t(lang, "1 geste, sans créer de compte", "one tap, no account", "1 toque, sin cuenta")}</span>
            <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={() => buy(P30, "applepay")} aria-label="Apple Pay" className="sg-wbtn sg-wbtn-dark" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 46, borderRadius: 13, border: "none", background: "#000", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
              <svg width="16" height="19" viewBox="0 0 17 20" fill="#fff" aria-hidden="true"><path d="M14.1 6.6c-.1.1-1.9 1-1.9 3.2 0 2.6 2.3 3.5 2.4 3.5 0 .1-.4 1.3-1.2 2.5-.7 1.1-1.5 2.2-2.7 2.2-1.1 0-1.5-.7-2.8-.7-1.3 0-1.7.7-2.7.7-1.2 0-2-1.2-2.8-2.3C1.3 14 .5 11.6.5 9.4c0-3.6 2.3-5.5 4.6-5.5 1.2 0 2.2.8 2.9.8.7 0 1.8-.8 3.2-.8.5 0 2.3 0 3.5 1.7-.1.1-1.5.9-1.5 1ZM10.4 2.4c.6-.7 1-1.6.9-2.5-.9 0-1.9.6-2.5 1.3-.5.6-1 1.5-.9 2.4 1 .1 1.9-.5 2.5-1.2Z" /></svg>
              Apple&nbsp;Pay
            </button>
            <button onClick={() => buy(P30, "googlepay")} aria-label="Google Pay" className="sg-wbtn sg-wbtn-light" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 46, borderRadius: 13, border: "none", background: "#fff", color: "#3c4043", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
              Google&nbsp;Pay
            </button>
          </div>
          <p style={{ margin: "11px 0 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "rgba(234,247,244,.6)" }}>{_t(lang, <>Paiement <span style={G}>unique</span> · accès immédiat · aucun compte à créer</>, <>One-time <span style={G}>payment</span> · instant access · no account</>, <>Pago <span style={G}>único</span> · acceso inmediato · sin cuenta</>)}</p>
        </div>

        {/* money-back « remboursé » RETIRÉ (2026-06-29 : pass one-time, accès numérique
            immédiat → pas de garantie de remboursement volontaire). Réassurance « paiement
            unique · accès immédiat » portée par la ligne ci-dessus. */}

        <div style={{ margin: "14px 0 2px", textAlign: "center", fontSize: 10.5, fontWeight: 700, letterSpacing: ".01em", color: "rgba(234,247,244,.42)", lineHeight: 1.5 }}>
          {_t(lang, "Paiement sécurisé Mollie · Pas d'abonnement · Pas de renouvellement", "Secure Mollie payment · No subscription · No auto-renew", "Pago seguro Mollie · Sin suscripción · Sin renovación")}
        </div>
      </div>
    </div>
  )
}
