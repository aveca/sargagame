import React,{useEffect,memo,useRef,useState}from"react"
import ComicIcon from"./components/ComicIcons.jsx"
import{getSegment}from"./lib/segment.js"
import{track}from"./Sargasses_PROD.jsx"
import{PASS_CENTS,seasonalCents}from"./lib/pass-price.js"
import{buildTrajectory}from"./lib/stay-trajectory.js"

// Ré-export pour les consommateurs existants (OnsiteCheckout) — source = lib/pass-price.js
export{seasonalCents}
export const PASS = { key: "p30", cents: PASS_CENTS, days: 30 }

const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)
const SEG_URL = "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
function sbeacon(p) { try { const b = JSON.stringify({ type: "analytics_event", e: "sg_pass_seg", p: p || {}, t: Date.now() }); if (navigator.sendBeacon) navigator.sendBeacon(SEG_URL, b); else fetch(SEG_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: b }).catch(() => {}) } catch (_) {} }

const money = (c, cur, lang) => (cur === "usd" ? "$" + (c / 100).toFixed(2) : lang === "en" ? "€" + (c / 100).toFixed(2) : (c / 100).toFixed(2).replace(".", ",") + " €")
const perDay = (c, days, cur, lang) => { const v = c / 100 / days; const s = (cur === "usd" ? "$" + v.toFixed(2) : lang === "en" ? "€" + v.toFixed(2) : v.toFixed(2).replace(".", ",") + " €"); return _t(lang, `${s}/jour`, `${s}/day`, `${s}/día`) }

const Ck = () => (<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#FFC72C" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>)

const PassOffer = memo(function PassOffer({ lang = "fr", currency = "eur", community = 0, freshTs = null, onBuy, pwVariant, tripDays = null, tripBeach = "", trajForecast = null }) {
  const v2Enabled=(()=>{try{return !/[?&]sguxv2=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  const cur = currency === "usd" ? "usd" : "eur"
  const seg = getSegment()
  const cents = PASS.cents[cur] // prix de BASE envoyé au serveur (validation anti-tamper)
  const displayCents = seasonalCents(cents, cur) // prix réellement débité (surcharge saison USD)
  useEffect(()=>{sbeacon({stage:"view",segment:seg,model:"oneprice"});try{track("sg_pass_offer_view",{segment:seg,model:"oneprice"})}catch(_){}},[])
  const buy=()=>{
    sbeacon({stage:"cta",segment:seg,pass:PASS.key,cents})
    // NB : sg_pass_cta est tracké UNE seule fois par PremiumModal.onPassBuy (payload plus riche).
    localStorage.setItem('sg_checkout_started_at', Date.now())
    if(onBuy)onBuy({c:cents,pass:PASS.key,days:PASS.days,segment:seg})
  }
  const lost = cur === "usd" ? "$200" : lang === "en" ? "€200" : "200 €"
  const pd = perDay(displayCents, PASS.days, cur, lang)
  const noSticky = /[?&]nosticky=0(?:&|$)/.test(window.location.search)
  // UI mobile CRO — CTA thumb reach (rollback ?sguxcta=0). Ne touche ni pricing ni tracking.
  const uxCtaV2 = (()=>{try{return !/[?&]sguxcta=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  // Lot 3 — armure fond barre sticky vs skin theme (rollback ?sguxlot3=0).
  const uxLot3 = (()=>{try{return !/[?&]sguxlot3=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  // Lot 4 — badges sticky masqués ≤480px, doublon hero + overflow 57px (rollback ?sguxlot4=0).
  const uxLot4 = (()=>{try{return !/[?&]sguxlot4=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  // E1 — CTA spécifique (rollback ?sgcta=0) : nomme le livrable (prévision
  // 7 jours) au lieu du bénéfice vague. Longueur ≈ identique (pas de layout).
  // Hors scope volontaire : subline durée/no-sub (E4), preuve sociale (E2).
  // E11 trust row shippée ci-dessous (rollback ?trust_row=0).
  const ctaSpecific = (()=>{try{return !/[?&]sgcta=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  // E11 — rangée confiance iconée sous CTA hero (rollback ?trust_row=0).
  // Recycle UNIQUEMENT des faits déjà claimés (l115/l150-153) : aucun chiffre,
  // aucun nouveau claim, aucun tracking, aucun layout structurel (+~20px).
  const trustRow = (()=>{try{return !/[?&]trust_row=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  // OPP-2026-001 (autopilot) — strip « Ta semaine » lisible : initiale du jour
  // sous chaque pastille + aria-label jour+statut (le title= est muet au tactile
  // et au lecteur d'écran). Jours DÉRIVÉS de fc[0]=aujourd'hui (même hypothèse
  // que tripDays[1]=« Demain » déjà utilisée par WorldPaywall) — zéro invention.
  // Affichage pur, zéro data/logique/paiement. Rollback : ?triplabels=0.
  const tripLabelsOn=(()=>{try{return !/[?&]triplabels=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  const DAY1=lang==="en"?["S","M","T","W","T","F","S"]:lang==="es"?["D","L","M","M","J","V","S"]:["D","L","M","M","J","V","S"]
  const stLabel=(st)=>_t(lang,
    st==="clean"?"propre":st==="moderate"?"à surveiller":st==="alert"?"à éviter":"inconnu",
    st==="clean"?"clean":st==="moderate"?"to watch":st==="alert"?"to avoid":"unknown",
    st==="clean"?"limpia":st==="moderate"?"a vigilar":st==="alert"?"a evitar":"desconocido")
  const isComic = pwVariant === "comic"

  // WOW « LA TRAJECTOIRE » (2026-09-24, rollback ?sgtraj=0) : quand le paywall
  // montre déjà la trajectoire de la semaine (StayTrajectory), le strip
  // tripDays interne ferait DOUBLON → masqué ; et le label sticky porte le
  // SYNOPSIS RÉEL de la semaine (jours propres / à éviter, comptés depuis le
  // forecast réel via buildTrajectory — jamais de chiffre marketing).
  const trajOn=(()=>{try{return !/[?&]sgtraj=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  const traj=(()=>{ if(!trajOn) return null; try{const t=buildTrajectory(trajForecast,null);return t.days.length>=2?t:null}catch(_){return null} })()
  const weekSyno=(()=>{
    if(!traj) return null
    const c=traj.counts
    if(c.clean+c.moderate+c.alert<=0) return null
    // Vérité stricte : clean / moderate / alert comptés sur les jours réels.
    const parts=[]
    if(c.clean>0) parts.push(_t(lang,`${c.clean} j propre${c.clean>1?"s":""}`,`${c.clean} clean day${c.clean>1?"s":""}`,`${c.clean} d limpia${c.clean>1?"s":""}`))
    if(c.moderate>0) parts.push(_t(lang,`${c.moderate} à surveiller`,`${c.moderate} to watch`,`${c.moderate} a vigilar`))
    if(c.alert>0) parts.push(_t(lang,`${c.alert} à éviter`,`${c.alert} to avoid`,`${c.alert} a evitar`))
    return parts.join(" · ")
  })()

  return (
    <div className={v2Enabled?"sg-v2-pass-offer":undefined} data-cur={cur} data-display-cents={displayCents} style={{ position: "relative", color: isComic ? "#0D0B14" : "#EAF7F4", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif", background: isComic ? "#FDF6E3" : "transparent", borderRadius: isComic ? 18 : 0, padding: isComic ? "20px 16px 8px" : 0 }}>

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: isComic ? "#B87A00" : "#FFC72C" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
          {_t(lang, "Le Veilleur", "The Watchman", "El Vigía")}
        </div>
        {/* PERFECT BEACH TRIP (2026-09-24B) : le titre vend le RÉSULTAT (le
            séjour), le moteur forecast reste la preuve dans le sous-texte.
            Rollback ?sgcopy=0 → copy historique. */}
        {(() => { let copyOn = true; try { copyOn = !/[?&]sgcopy=0/.test(window.location.search) } catch (_) {} return copyOn })() ? (
        <h2 className="anton" style={{ fontSize: "clamp(24px,7vw,34px)", lineHeight: 1.0, color: isComic ? "#0D0B14" : "#fff", margin: "12px 0 0", letterSpacing: "-.01em", maxWidth: "90%" }}>
          {_t(lang, <>Ton séjour idéal <span style={{ color: isComic ? "#B87A00" : "#FFC72C" }}>commence ici</span>.</>, <>Your perfect beach trip <span style={{ color: isComic ? "#B87A00" : "#FFC72C" }}>starts here</span>.</>, <>Tu estancia ideal en la playa <span style={{ color: isComic ? "#B87A00" : "#FFC72C" }}>empieza aquí</span>.</>)}
        </h2>
        ) : (
        <h2 className="anton" style={{ fontSize: "clamp(24px,7vw,34px)", lineHeight: 1.0, color: isComic ? "#0D0B14" : "#fff", margin: "12px 0 0", letterSpacing: "-.01em", maxWidth: "90%" }}>
          {_t(lang, <>Sache où sera la mer <span style={{ color: isComic ? "#B87A00" : "#FFC72C" }}>demain</span>.</>, <>Know where the sea will be <span style={{ color: isComic ? "#B87A00" : "#FFC72C" }}>tomorrow</span>.</>, <>Sabe dónde estará el mar <span style={{ color: isComic ? "#B87A00" : "#FFC72C" }}>mañana</span>.</>)}
        </h2>
        )}
        <p style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: isComic ? "rgba(13,11,20,.65)" : "rgba(234,247,244,.70)", margin: "10px 0 0" }}>
          {(() => { let copyOn = true; try { copyOn = !/[?&]sgcopy=0/.test(window.location.search) } catch (_) {} return copyOn })()
            ? _t(lang, "Tes meilleures plages, tes plans jour par jour, une alternative réelle si la mer change. Le satellite fait la preuve, pas la promesse.", "Your best beaches, day-by-day plans, a real alternative if the sea changes. Satellite proof, not promises.", "Tus mejores playas, planes día a día y una alternativa real si el mar cambia. Prueba satelital, no promesas.")
            : _t(lang, "Satellite 4×/jour · Prévision 7 jours · Alerte si ta plage bascule. Un prix, pas d'abonnement.", "Satellite 4×/day · 7-day forecast · Alert when your beach flips. One price, no subscription.", "Satélite 4×/día · Pronóstico 7 días · Alerta si tu playa cambia. Un precio, sin suscripción.")}
        </p>

        {/* TAKEOVER §9 — « FINISH MY TRIP PLAN » (2026-09-22) : le paywall prouve le
            résultat (semaine de la plage en contexte) avant de demander la carte.
            Données 100 % réelles (forecast weekly), jamais inventé ; ?tripplan=0 off. */}
        {Array.isArray(tripDays) && tripDays.length >= 2 && !traj && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, padding: "10px 12px", borderRadius: 12, background: isComic ? "rgba(13,11,20,.05)" : "rgba(255,255,255,.05)", border: isComic ? "1.5px dashed #0D0B14" : "1px solid rgba(255,255,255,.14)" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: isComic ? "#B87A00" : "#FFC72C", flexShrink: 0 }}>
              {_t(lang, "Ta semaine", "Your week", "Tu semana")}{tripBeach ? ` — ${tripBeach}` : ""}
            </span>
            <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {tripDays.map((st, i) => {
                const dayIdx = (new Date().getDay() + i) % 7
                const bg = st === "clean" ? "rgba(34,197,94,.18)" : st === "moderate" ? "rgba(245,158,11,.20)" : st === "alert" ? "rgba(239,68,68,.18)" : "rgba(120,120,130,.15)"
                const fg = st === "clean" ? "#16A34A" : st === "moderate" ? "#B45309" : st === "alert" ? "#DC2626" : "#777"
                const glyph = st === "clean" ? "✓" : st === "moderate" ? "!" : st === "alert" ? "✕" : "·"
                return (
                  <span key={i} title={`${DAY1[dayIdx]} · ${stLabel(st)}`} aria-label={`${DAY1[dayIdx]} · ${stLabel(st)}`}
                    style={{ display: "inline-flex", flexDirection: tripLabelsOn ? "column" : "row", alignItems: "center", justifyContent: "center",
                      width: tripLabelsOn ? 24 : 20, minHeight: 20, padding: tripLabelsOn ? "2px 0 3px" : 0, height: tripLabelsOn ? "auto" : 20,
                      borderRadius: 6, fontSize: 10, fontWeight: 800, background: bg, color: fg }}>
                    {tripLabelsOn && <span aria-hidden="true" style={{ fontSize: 7.5, fontWeight: 800, lineHeight: 1, opacity: .85, letterSpacing: ".02em" }}>{DAY1[dayIdx]}</span>}
                    <span aria-hidden="true" style={{ lineHeight: 1.1 }}>{glyph}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ margin: "18px 0 0" }}>
          <button onClick={buy} className="sg-passcard-hero" style={{
            position: "relative", display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            border: isComic ? "2.5px solid #0D0B14" : "2px solid rgba(255,199,44,.5)", borderRadius: 18, padding: "18px 17px 16px",
            background: isComic ? "#FDF6E3" : "linear-gradient(165deg,rgba(255,199,44,.20),rgba(255,199,44,.04) 55%,transparent)",
            boxShadow: isComic ? "4px 4px 0 #0D0B14" : "0 4px 0 0 rgba(0,0,0,.35),0 14px 40px rgba(232,168,0,.18),inset 0 0 0 1px rgba(255,228,122,.15)",
          }}>
            <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 19, fontWeight: 800, color: isComic ? "#0D0B14" : "#fff", lineHeight: 1.05 }}>
                  {_t(lang, "Pass 30 jours", "30-day pass", "Pase 30 días")}
                </span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: isComic ? "rgba(13,11,20,.5)" : "rgba(234,247,244,.6)", marginTop: 4 }}>
                  {_t(lang, "Toutes les plages · Prévision 7 j", "All beaches · 7-day forecast", "Todas las playas · Pronóstico 7 d")}
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                <span className="anton" style={{ fontSize: 36, color: isComic ? "#B87A00" : "#FFC72C", lineHeight: .85, letterSpacing: "-.01em" }}>{money(displayCents, cur, lang)}</span>
                <span style={{ display: "inline-block", marginTop: 10, fontSize: 11, fontWeight: 800, color: isComic ? "#0D0B14" : "#190c2c", background: "#FFC72C", padding: "4px 11px", borderRadius: 999, boxShadow: isComic ? "2px 2px 0 #0D0B14" : "0 2px 0 0 rgba(0,0,0,.20)" }}>{pd}</span>
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 7, margin: "14px 0 0" }}>
              {[
                _t(lang, <><b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>LA plage propre</b> chaque matin, 7h</>, <><b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>THE clean beach</b> every morning, 7am</>, <><b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>LA playa limpia</b> cada mañana, 7h</>),
                _t(lang, <>Prévision <b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>7 jours</b> · toutes les plages</>, <><b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>7-day</b> forecast · all beaches</>, <>Pronóstico <b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>7 días</b> · todas las playas</>),
                _t(lang, <>Alerte le jour où <b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>ça bascule</b></>, <>Alert the day <b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>it flips</b></>, <>Alerta el día que <b style={{ color: isComic ? "#0D0B14" : "#fff", fontWeight: 800 }}>cambia</b></>),
              ].map((t, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 600, color: isComic ? "rgba(13,11,20,.75)" : "rgba(234,247,244,.82)" }}>
                  <span style={{ flex: "0 0 auto", width: 17, height: 17, borderRadius: "50%", background: isComic ? "rgba(184,122,0,.12)" : "rgba(255,199,44,.18)", display: "grid", placeItems: "center" }}><Ck /></span>
                  <span>{t}</span>
                </span>
              ))}
            </span>
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 16, borderRadius: 14, padding: "16px",
              fontFamily: isComic ? "'Anton',system-ui,sans-serif" : "inherit", fontSize: 16, fontWeight: 800,
              letterSpacing: isComic ? ".02em" : "normal", textTransform: isComic ? "uppercase" : "none",
              background: "#FFC72C",
              color: "#0D0B14",
              boxShadow: isComic ? "3px 3px 0 #0D0B14" : "0 4px 0 0 rgba(0,0,0,.30),0 8px 24px rgba(232,168,0,.28)",
              border: isComic ? "2px solid #0D0B14" : "none",
            }}>
              {_t(lang,
                ctaSpecific ? "Voir la prévision 7 jours →" : "Voir mes plages propres →",
                ctaSpecific ? "See the 7-day forecast →" : "See my clean beaches →",
                ctaSpecific ? "Ver el pronóstico 7 días →" : "Ver mis playas limpias →")}
            </span>
            {/* E11 — trust row (cadenas / calendrier / sans abonnement), juste sous
                le CTA hero et au-dessus de la ligne existante (contrat j0 : offre
                AVANT email, préservé — tout reste dans la carte hero). Rollback
                ?trust_row=0. */}
            {trustRow && (
            <span data-testid="passoffer-trust-row" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap",
              width: "100%", marginTop: 12, fontSize: 11, fontWeight: 800,
              color: isComic ? "rgba(13,11,20,.68)" : "rgba(234,247,244,.78)",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2.4"/>
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.4"/>
                </svg>
                {_t(lang, "Paiement sécurisé", "Secure payment", "Pago seguro")}
              </span>
              <span aria-hidden="true" style={{ opacity: .5 }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="2.4"/>
                  <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
                </svg>
                {_t(lang, "30 jours", "30 days", "30 días")}
              </span>
              <span aria-hidden="true" style={{ opacity: .5 }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4"/>
                  <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
                </svg>
                {_t(lang, "Sans abonnement", "No subscription", "Sin suscripción")}
              </span>
            </span>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, fontSize: 11, fontWeight: 700, color: isComic ? "rgba(13,11,20,.5)" : "rgba(234,247,244,.55)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                <rect x="4" y="10" width="16" height="10" rx="2" stroke={isComic ? "#22C55E" : "rgba(124,224,176,.85)"} strokeWidth="2"/>
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={isComic ? "#22C55E" : "rgba(124,224,176,.85)"} strokeWidth="2"/>
              </svg>
              {_t(lang, "Paiement sécurisé · Accès immédiat", "Secure payment · Instant access", "Pago seguro · Acceso inmediato")}
            </div>
          </button>
        </div>

        {(community > 0 || freshTs) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", margin: "14px 0 0", fontSize: 11.5, fontWeight: 600, color: isComic ? "rgba(13,11,20,.55)" : "rgba(234,247,244,.62)" }}>
            {community > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: isComic ? "#B87A00" : "#FFC72C", fontWeight: 800 }}>★</span>
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
          style={{ display: "block", textAlign: "center", margin: "10px 0 0", fontSize: 12, fontWeight: 800, color: isComic ? "#B87A00" : "#FFC72C", textDecoration: "underline", textUnderlineOffset: 2 }}>
          {_t(lang, "Avant de payer, voyez nos erreurs →", "Before you pay, see our errors →", "Antes de pagar, vea nuestros errores →")}
        </a>

        {/* Transparence prix USD haute saison (juin-nov) */}
        {cur === "usd" && (() => { const m = new Date().getMonth() + 1; return (m >= 6 && m <= 11) ? (
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 10.5, color: isComic ? "rgba(13,11,20,.4)" : "rgba(234,247,244,.45)", letterSpacing: ".01em" }}>
            {_t(lang, "Tarif haute saison · +15 % sur les passes 30 j et saison", "High-season rate · +15 % on 30-day & season passes", "Tarifa alta temporada · +15 % en pases de 30 días y temporada")}
          </div>
        ) : null })()}

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px", margin: "14px 0 2px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".01em", color: isComic ? "rgba(13,11,20,.38)" : "rgba(234,247,244,.42)", lineHeight: 1.5 }}>
          <span>Mollie</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "Pas d'abonnement", "No subscription", "Sin suscripción")}</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "30 jours", "30 days", "30 días")}</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "Paiement sécurisé", "Secure payment", "Pago seguro")}</span>
        </div>
      </div>

      {!noSticky && (
        // Barre sticky = UNE seule surface de tap → buy() (fix 2026-08-25 : avant,
        // seuls ~30 % de la barre étaient cliquables — le reste (texte/badges) était
        // une zone morte qui recouvrait le CTA « Commencer maintenant » sur mobile
        // → taps morts sur le CTA money, modal→CTA plafonné à 12,7 %).
        <button type="button" onClick={buy} aria-label={_t(lang, "Commencer maintenant", "Start now", "Empezar ahora")} className={"sg-sticky sg-sticky-wrap"+((!isComic&&uxLot3)?" sg-sticky-dark":"")} style={{ position: "sticky", bottom: 0, zIndex: 10, width: "100%", textAlign: "left", background: isComic ? "#FDF6E3" : "linear-gradient(180deg,rgba(10,26,20,.97),rgba(10,26,20,.99))", borderTop: isComic ? "2.5px solid #0D0B14" : "1px solid rgba(255,199,44,.25)", borderLeft: "none", borderRight: "none", borderBottom: "none", padding: uxCtaV2 ? "12px 14px calc(12px + env(safe-area-inset-bottom,0px))" : "10px 14px", display: "flex", alignItems: "center", gap: 10, animation: "sgStickyIn .4s ease-out both", cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
          {/* VISUAL RESCUE 2026-09-18 : ≤480px la barre passe en 2 lignes
              (.sg-sticky-wrap, app-runtime.css lot 10 : min-width:0 + label/CTA
              pleine ligne) — avant, le label flex:1 (min-width:auto) poussait le
              CTA or ~22px hors panel à 390px (mesuré Playwright : CTA x=146+266=412
              > viewport 390, rogné par overflowX:hidden du panel). Desktop = inline
              d'origine strict (aucun changement). Zéro info perdue, zéro copy,
              aucun pricing/tracking touché. Rollback : ?nosticky=0 (barre off). */}
          <span className="sg-sticky-label" style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: isComic ? "#0D0B14" : "#EAF7F4", lineHeight: 1.3 }}>
            {weekSyno
              // WOW : le sticky porte TA semaine réelle (comptage forecast),
              // pas la copie technique. Rollback ?sgtraj=0 = label historique.
              ? _t(lang, `Ta semaine : ${weekSyno}`, `Your week: ${weekSyno}`, `Tu semana: ${weekSyno}`)
              : _t(lang, "Mollie · Sans engagement · 2 clics", "Mollie · No commitment · 2 clicks", "Mollie · Sin compromiso · 2 clics")}
          </span>
          <span className="sg-sticky-buy" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: uxCtaV2 ? 48 : undefined, padding: uxCtaV2 ? "12px 20px" : "9px 18px", borderRadius: 12, background: "#FFC72C", color: "#0D0B14", fontWeight: 800, fontSize: uxCtaV2 ? 14 : 12.5, fontFamily: isComic ? "'Anton',system-ui,sans-serif" : "inherit", boxShadow: isComic ? "2px 2px 0 #0D0B14" : "0 2px 0 0 rgba(0,0,0,.20)" }}>
            {/* E1-align : même promesse que le CTA hero (E1), prix inchangé.
                Rollback partagé : ?sgcta=0 restaure l'ancien libellé. */}
            {_t(lang,
              ctaSpecific ? `Voir la prévision 7 jours · ${money(displayCents, cur, lang)}` : `Voir mes plages propres · ${money(displayCents, cur, lang)}`,
              ctaSpecific ? `See the 7-day forecast · ${money(displayCents, cur, lang)}` : `See clean beaches · ${money(displayCents, cur, lang)}`,
              ctaSpecific ? `Ver el pronóstico 7 días · ${money(displayCents, cur, lang)}` : `Ver playas limpias · ${money(displayCents, cur, lang)}`)}
          </span>
          <span className={uxLot4?"sg-sticky-badges":undefined} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 9.5, fontWeight: 700, color: isComic ? "rgba(13,11,20,.5)" : "rgba(234,247,244,.55)" }}>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}}><ComicIcon name="lock" size={10}/> Mollie</span><span aria-hidden="true">·</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}}><ComicIcon name="card" size={11}/> {_t(lang,"Paiement sécurisé","Secure payment","Pago seguro")}</span><span aria-hidden="true">·</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}}><ComicIcon name="zap" size={10}/> {_t(lang,"Sans engagement","No commitment","Sin compromiso")}</span>
          </span>
        </button>
      )}
    </div>
  )
})

export default PassOffer
