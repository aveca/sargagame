import React,{useEffect,useRef,memo}from"react"
import{getSegment}from"./lib/segment.js"
import{track}from"./Sargasses_PROD.jsx"

const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)
const SEG_URL = "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
function sbeacon(p) { try { const b = JSON.stringify({ type: "analytics_event", e: "sg_pass_seg", p: p || {}, t: Date.now() }); if (navigator.sendBeacon) navigator.sendBeacon(SEG_URL, b); else fetch(SEG_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: b }).catch(() => {}) } catch (_) {} }

const PASS = { key: "season", cents: { eur: 1999, usd: 1499 }, days: 30 }

const money = (c, cur, lang) => (cur === "usd" ? "$" + (c / 100).toFixed(2) : lang === "en" ? "€" + (c / 100).toFixed(2) : (c / 100).toFixed(2).replace(".", ",") + " €")
const perDay = (c, days, cur, lang) => { const v = c / 100 / days; const s = (cur === "usd" ? "$" + v.toFixed(2) : lang === "en" ? "€" + v.toFixed(2) : v.toFixed(2).replace(".", ",") + " €"); return _t(lang, `${s}/jour`, `${s}/day`, `${s}/día`) }

const Ck = () => (<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#FFC72C" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>)

const TrustBadge = ({icon, title, desc}) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
    background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,199,44,.25)",
    borderRadius: 12, minWidth: 0, flex: 1
  }}>
    <span style={{flex:"0 0 auto",width:28,height:28,borderRadius:"50%",background:"rgba(255,199,44,.15)",display:"grid",placeItems:"center"}}>{icon}</span>
    <div style={{minWidth:0}}>
      <div style={{fontSize:12,fontWeight:800,color:"#fff",lineHeight:1.2}}>{title}</div>
      <div style={{fontSize:10,fontWeight:600,color:"rgba(234,247,244,.6)",lineHeight:1.2,marginTop:1}}>{desc}</div>
    </div>
  </div>
)

const PassOffer = memo(function PassOffer({ lang = "fr", currency = "eur", community = 0, freshTs = null, onBuy }) {
  const v2Enabled=(()=>{try{return !/[?&]sguxv2=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  const cur = currency === "usd" ? "usd" : "eur"
  const seg = getSegment()
  const cents = PASS.cents[cur]
  const stickyCtaRef = useRef(null)
  const [showSticky, setShowSticky] = React.useState(false)

  React.useEffect(()=>{
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>setShowSticky(!e.isIntersecting))
    },{rootMargin:"0px 0px 120px 0px"})
    if(stickyCtaRef.current) io.observe(stickyCtaRef.current)
    return ()=>io.disconnect()
  },[])

  useEffect(()=>{sbeacon({stage:"view",segment:seg,model:"oneprice"});try{track("sg_pass_offer_view",{segment:seg,model:"oneprice"})}catch(_){}},[])
  const buy=()=>{
    sbeacon({stage:"cta",segment:seg,pass:PASS.key,cents})
    localStorage.setItem('sg_checkout_started_at', Date.now())
    if(onBuy)onBuy({c:cents,pass:PASS.key,days:PASS.days,segment:seg})
  }
  const lost = cur === "usd" ? "$200" : lang === "en" ? "€200" : "200 €"
  const pd = perDay(cents, PASS.days, cur, lang)

  return (
    <div className={v2Enabled?"sg-v2-pass-offer":undefined} style={{ position: "relative", color: "#EAF7F4", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>

      <div style={{ position: "relative", zIndex: 1, paddingBottom: showSticky ? 100 : 0 }}>
        {(() => { const m = new Date().getMonth() + 1; const inPeak = m >= 5 && m <= 8; const inSeason = m >= 3 && m <= 8; return inSeason ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 14, borderRadius: 12, background: inPeak ? "rgba(232,82,42,.15)" : "rgba(255,199,44,.12)", border: `1px solid ${inPeak ? "rgba(232,82,42,.35)" : "rgba(255,199,44,.25)"}`, fontSize: 12, fontWeight: 700, color: inPeak ? "#FFB59E" : "#FFC72C" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: inPeak ? "#E8522A" : "#FFC72C", flexShrink: 0, boxShadow: `0 0 6px ${inPeak ? "#E8522A50" : "#FFC72C50"}` }} />
            {_t(lang, inPeak ? "Pic sargasses en cours — chaque jour sans prévision est un risque" : "Saison sargasses active — protège tes plages", inPeak ? "Peak sargassum — every day without forecast is a risk" : "Sargassum season — protect your beaches", inPeak ? "Pico de sargazo — cada día sin pronóstico es un riesgo" : "Temporada de sargazo — protege tus playas")}
          </div>
        ) : null })()}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#FFC72C" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
          {_t(lang, "Le Veilleur", "The Watchman", "El Vigía")}
        </div>
        <h2 className="anton" style={{ fontSize: "clamp(24px,7vw,34px)", lineHeight: 1.0, color: "#fff", margin: "12px 0 0", letterSpacing: "-.01em", maxWidth: "90%" }}>
          {_t(lang, <>Sache où sera la mer <span style={{ color: "#FFC72C" }}>demain</span>.</>, <>Know where the sea will be <span style={{ color: "#FFC72C" }}>tomorrow</span>.</>, <>Sabe dónde estará el mar <span style={{ color: "#FFC72C" }}>mañana</span>.</>)}
        </h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: "rgba(234,247,244,.70)", margin: "10px 0 0" }}>
          {_t(lang, "Satellite 4×/jour · Prévision 7 jours · Alerte si ta plage bascule. Un prix, pas d'abonnement.", "Satellite 4×/day · 7-day forecast · Alert when your beach flips. One price, no subscription.", "Satélite 4×/día · Pronóstico 7 días · Alerta si tu playa cambia. Un precio, sin suscripción.")}
        </p>

        <div style={{ margin: "18px 0 0" }}>
          <button onClick={buy} className="sg-passcard-hero" style={{
            position: "relative", display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
            border: "2px solid rgba(255,199,44,.5)", borderRadius: 18, padding: "18px 17px 16px",
            background: "linear-gradient(165deg,rgba(255,199,44,.20),rgba(255,199,44,.04) 55%,transparent)",
            boxShadow: "0 4px 0 0 rgba(0,0,0,.35),0 14px 40px rgba(232,168,0,.18),inset 0 0 0 1px rgba(255,228,122,.15)",
          }}>
            <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.05 }}>
                  {_t(lang, "Pass saison", "Season pass", "Pase temporada")}
                </span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "rgba(234,247,244,.6)", marginTop: 4 }}>
                  {_t(lang, "Toutes les plages · Prévision 7 j", "All beaches · 7-day forecast", "Todas las playas · Pronóstico 7 d")}
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                <span className="anton" style={{ fontSize: 36, color: "#FFC72C", lineHeight: .85, letterSpacing: "-.01em" }}>{money(cents, cur, lang)}</span>
                <span style={{ display: "inline-block", marginTop: 10, fontSize: 11, fontWeight: 800, color: "#190c2c", background: "linear-gradient(135deg,#FFE47A,#FFC72C)", padding: "4px 11px", borderRadius: 999, boxShadow: "0 2px 0 0 rgba(0,0,0,.20)" }}>{pd}</span>
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 7, margin: "14px 0 0" }}>
              {[
                _t(lang, <><b style={{ color: "#fff", fontWeight: 800 }}>LA plage propre</b> chaque matin, 7h</>, <><b style={{ color: "#fff", fontWeight: 800 }}>THE clean beach</b> every morning, 7am</>, <><b style={{ color: "#fff", fontWeight: 800 }}>LA playa limpia</b> cada mañana, 7h</>),
                _t(lang, <>Prévision <b style={{ color: "#fff", fontWeight: 800 }}>7 jours</b> · toutes les plages</>, <><b style={{ color: "#fff", fontWeight: 800 }}>7-day</b> forecast · all beaches</>, <>Pronóstico <b style={{ color: "#fff", fontWeight: 800 }}>7 días</b> · todas las playas</>),
                _t(lang, <>Alerte le jour où <b style={{ color: "#fff", fontWeight: 800 }}>ça bascule</b></>, <>Alert the day <b style={{ color: "#fff", fontWeight: 800 }}>it flips</b></>, <>Alerta el día que <b style={{ color: "#fff", fontWeight: 800 }}>cambia</b></>),
              ].map((t, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 600, color: "rgba(234,247,244,.82)" }}>
                  <span style={{ flex: "0 0 auto", width: 17, height: 17, borderRadius: "50%", background: "rgba(255,199,44,.18)", display: "grid", placeItems: "center" }}><Ck /></span>
                  <span>{t}</span>
                </span>
              ))}
            </span>
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 16, borderRadius: 14, padding: "16px",
              fontFamily: "inherit", fontSize: 16, fontWeight: 800,
              background: "linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E8A317)",
              color: "#190c2c",
              boxShadow: "0 4px 0 0 rgba(0,0,0,.30),0 8px 24px rgba(232,168,0,.28)",
              border: "none",
              animation: "sg-pulse-cta 2.5s ease-in-out infinite",
            }}>
              {_t(lang, "Protéger mes plages maintenant →", "Protect my beaches now →", "Proteger mis playas ahora →")}
            </span>
            <div ref={stickyCtaRef} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, fontSize: 11, fontWeight: 700, color: "rgba(234,247,244,.55)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                <rect x="4" y="10" width="16" height="10" rx="2" stroke="rgba(124,224,176,.85)" strokeWidth="2"/>
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="rgba(124,224,176,.85)" strokeWidth="2"/>
              </svg>
              {_t(lang, "Paiement sécurisé · Accès immédiat", "Secure payment · Instant access", "Pago seguro · Acceso inmediato")}
            </div>
          </button>
        </div>

        {/* Trust badges row - closer to CTA */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <TrustBadge icon="🛡" title={_t(lang,"Paiement sécurisé","Secure payment","Pago seguro")} desc={_t(lang,"Mollie · 3D Secure","Mollie · 3D Secure","Mollie · 3D Secure")} />
          <TrustBadge icon="📧" title={_t(lang,"Sans carte","No card","Sin tarjeta")} desc={_t(lang,"Juste ton email","Just your email","Solo tu email")} />
          <TrustBadge icon="✕" title={_t(lang,"Sans engagement","No strings","Sin compromiso")} desc={_t(lang,"Annule quand tu veux","Cancel anytime","Cancela cuando quieras")} />
        </div>

        {(community > 0 || freshTs) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", margin: "14px 0 0", fontSize: 11.5, fontWeight: 600, color: "rgba(234,247,244,.62)" }}>
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
          style={{ display: "block", textAlign: "center", margin: "10px 0 0", fontSize: 12, fontWeight: 800, color: "#FFC72C", textDecoration: "underline", textUnderlineOffset: 2 }}>
          {_t(lang, "Avant de payer, voyez nos erreurs →", "Before you pay, see our errors →", "Antes de pagar, vea nuestros errores →")}
        </a>

        {/* Transparence prix USD haute saison (juin-nov) */}
        {cur === "usd" && (() => { const m = new Date().getMonth() + 1; return (m >= 6 && m <= 11) ? (
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 10.5, color: "rgba(234,247,244,.45)", letterSpacing: ".01em" }}>
            {_t(lang, "Tarif haute saison · +15 % sur les passes 30 j et saison", "High-season rate · +15 % on 30-day & season passes", "Tarifa alta temporada · +15 % en pases de 30 días y temporada")}
          </div>
        ) : null })()}

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px", margin: "14px 0 2px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".01em", color: "rgba(234,247,244,.42)", lineHeight: 1.5 }}>
          <span>Mollie</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "Pas d'abonnement", "No subscription", "Sin suscripción")}</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "30 jours", "30 days", "30 días")}</span><span aria-hidden="true">·</span>
          <span>{_t(lang, "Paiement sécurisé", "Secure payment", "Pago seguro")}</span>
        </div>

        {/* Sticky CTA sentinel */}
        <div ref={stickyCtaRef} style={{height:1}} />
      </div>

      {/* Sticky CTA on mobile */}
      {showSticky && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
          padding: "12px 16px 14px", background: "linear-gradient(180deg,rgba(13,11,20,0),rgba(13,11,20,.95) 30%,#0d0b14)",
          borderTop: "1px solid rgba(255,199,44,.3)", boxShadow: "0 -4px 20px rgba(0,0,0,.4)"
        }}>
          <button onClick={buy} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 16px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 16, fontWeight: 800, color: "#190c2c",
            background: "linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E8A317)",
            boxShadow: "0 4px 0 0 rgba(0,0,0,.30),0 8px 24px rgba(232,168,0,.28)"
          }}>
            {_t(lang, "Protéger mes plages maintenant →", "Protect my beaches now →", "Proteger mis playas ahora →")}
          </button>
        </div>
      )}
    </div>
  )
})
export default PassOffer
