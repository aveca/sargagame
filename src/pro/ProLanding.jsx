import React, { useState, useEffect, useCallback } from "react"
import { B2BModal } from "./PremiumModal.jsx"

const INK = "#0D0D0D"
const GOLD = { background: "linear-gradient(180deg,#ffe07a,#ffb338)", border: "1px solid rgba(0,0,0,.18)", boxShadow: "6px 6px 0 rgba(255,150,60,.6)" }
const GOLD_OUTLINE = { background: "transparent", border: "1px solid #FFC72C", color: "#FFC72C", boxShadow: "4px 4px 0 rgba(255,199,44,.45)" }
const GLASS = { background: "rgba(20,11,32,.46)", border: "1px solid rgba(255,255,255,.22)", boxShadow: "4px 4px 0 rgba(0,0,0,.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)" }
const MUTE = "rgba(255,255,255,.62)"
const CARD_BG = "rgba(255,255,255,.04)"
const BORDER = "rgba(255,255,255,.12)"
const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" }
const STATUS_LBL = { clean: "Propre", moderate: "Modéré", avoid: "À éviter" }

function _t(lang, fr, en, es) { return lang === "es" ? es : lang === "en" ? en : fr }

export function ProLanding({ lang = "fr", sargData, island, track, onOpenBeach }) {
  const [showModal, setShowModal] = useState(false)
  const [modalSource, setModalSource] = useState("pro_landing")
  const [leadData, setLeadData] = useState({ email: "", org: "", tier: "pro" })

  const openPremium = useCallback((source = "pro_landing") => {
    setModalSource(source)
    setShowModal(true)
    try { track("sg_b2b_open", { source }) } catch (_) {}
  }, [track])

  const handleLeadSubmit = useCallback(async (e) => {
    e.preventDefault()
    const { email, org, tier } = leadData
    if (!email || !email.includes("@")) return
    
    try {
      localStorage.setItem("sg_b2b_lane", tier)
      localStorage.setItem("sg_b2b_org", org)
      localStorage.setItem("sg_b2b_email", email)
      
      await fetch("/api/b2b-trial.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: email.trim(), 
          name: org.trim(), 
          island: (island || "mq").toUpperCase() 
        })
      })
      
      try { track("sg_b2b_lead_submit", { tier, hasOrg: !!org }) } catch (_) {}
      setLeadData({ ...leadData, submitted: true })
    } catch (err) {
      console.error("B2B lead submit error:", err)
    }
  }, [leadData, island, track])

  const isl = island || "mq"
  const levels = Object.values(sargData?.levels || {})
  const islandLevels = levels.filter(l => isl === "gp" ? l.id?.startsWith("gp-") : !l.id?.startsWith("gp-"))
  const cleanCount = islandLevels.filter(l => l.status === "clean").length
  const totalCount = islandLevels.length
  const cleanPct = totalCount ? Math.round((cleanCount / totalCount) * 100) : 0

  const freshLine = (() => {
    const sat = sargData?.erddapTimestamp || null, up = sargData?.updatedAt || null
    const src = sat || up; if (!src) return null
    const h = Math.max(1, Math.round((Date.now() - new Date(src).getTime()) / 3.6e6))
    if (!isFinite(h)) return null
    return sat 
      ? _t(lang, `Vu du satellite il y a ${h} h`, `Seen by satellite ${h}h ago`, `Visto por satélite hace ${h} h`)
      : _t(lang, `Données mises à jour il y a ${h} h`, `Data updated ${h}h ago`, `Datos actualizados hace ${h} h`)
  })()

  const proofLine = _t(lang, "76–79 % de justesse selon la saison · registre public", "76–79% accuracy by season · public record", "76–79 % de acierto según temporada · registro público")

  return (
    <div style={{ minHeight: "100vh", background: "#0B2230", color: "#fff", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
      
      {/* HERO */}
      <section style={{ padding: "clamp(40px,10vw,80px) 20px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(255,199,44,.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(255,199,44,.15)", border: "1px solid rgba(255,199,44,.3)", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#FFC72C", marginBottom: 24 }}>
            🏨 {_t(lang, "Beach Intelligence pour hôtels", "Beach Intelligence for hotels", "Inteligencia de playas para hoteles")}
          </div>
          
          <h1 style={{ fontFamily: "'Anton',sans-serif", fontSize: "clamp(32px,8vw,56px)", lineHeight: 1.05, textTransform: "uppercase", letterSpacing: "-1px", marginBottom: 16, color: "#FDFCF7" }}>
            {_t(lang, "Sachez ce que vos clients verront<br/>avant qu'ils ne réservent.", "Know what your guests will see<br/>before they book.", "Sepa lo que verán sus huéspedes<br/>antes de que reserven.")}
          </h1>
          
          <p style={{ fontSize: "clamp(16px,2.5vw,20px)", lineHeight: 1.5, color: MUTE, maxWidth: 600, margin: "0 auto 32px" }}>
            {_t(lang, "Le satellite passe 4 fois par jour. Vos clients consultent le verdict avant de venir. Soyez le premier à le savoir.", "The satellite passes 4× daily. Your guests check the verdict before coming. Be the first to know.", "El satélite pasa 4 veces al día. Sus huéspedes consultan el veredicto antes de venir. Sea el primero en saberlo.")}
          </p>

          {/* Live proof bar */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginBottom: 32 }}>
            <div style={{ ...GLASS, padding: "16px 24px", borderRadius: 14, minWidth: 200 }}>
              <div style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 800, fontFamily: "'Anton',sans-serif", color: "#22C55E" }}>{cleanCount}/{totalCount}</div>
              <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>{_t(lang, "plages propres ce matin", "beaches clean this morning", "playas limpias esta mañana")}</div>
            </div>
            <div style={{ ...GLASS, padding: "16px 24px", borderRadius: 14, minWidth: 200 }}>
              <div style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 800, fontFamily: "'Anton',sans-serif", color: "#FFC72C" }}>{cleanPct}%</div>
              <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>{_t(lang, "taux de propreté", "cleanliness rate", "tasa de limpieza")}</div>
            </div>
            <div style={{ ...GLASS, padding: "16px 24px", borderRadius: 14, minWidth: 200 }}>
              <div style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 800, fontFamily: "'Anton',sans-serif", color: "#FDFCF7" }}>4×/jour</div>
              <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>{_t(lang, "mise à jour satellite", "satellite updates", "actualizaciones satelitales")}</div>
            </div>
          </div>

          {freshLine && (
            <div style={{ fontSize: 13, color: MUTE, marginBottom: 24 }}>
              {freshLine}
            </div>
          )}

          <button
            onClick={() => openPremium("pro_landing_hero")}
            style={{ ...GOLD, color: INK, border: "none", borderRadius: 12, padding: "18px 36px", fontSize: 16, fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase", letterSpacing: ".02em" }}
          >
            {_t(lang, "Activer l'essai 30 jours gratuit", "Start free 30-day trial", "Activar prueba gratuita 30 días")}
          </button>
        </div>
      </section>

      {/* PROOF SECTION */}
      <section style={{ padding: "60px 20px", background: "#081620", borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Anton',sans-serif", fontSize: "clamp(24px,4vw,36px)", textTransform: "uppercase", letterSpacing: "-.5px", marginBottom: 12, color: "#FDFCF7" }}>
            {_t(lang, "Données satellites vérifiables — pas de promesse", "Verifiable satellite data — no promises", "Datos satelitales verificables — sin promesas")}
          </h2>
          <p style={{ fontSize: 16, color: MUTE, maxWidth: 600, margin: "0 auto 40px", lineHeight: 1.6 }}>
            {_t(lang, "Source unique : Copernicus/NOAA AFAI. 76–79 % de justesse auditée par régime. Chaque alerte affiche sa confiance.", "Single source: Copernicus/NOAA AFAI. 76–79% audited accuracy by regime. Every alert shows its confidence.", "Fuente única: Copernicus/NOAA AFAI. 76–79 % de precisión auditada por régimen. Cada alerta muestra su confianza.")}
          </p>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, maxWidth: 800, margin: "0 auto" }}>
            <div style={{ ...GLASS, padding: 24, borderRadius: 16, textAlign: "left" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🛰️</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: "#FDFCF7" }}>{_t(lang, "Source publique", "Public source", "Fuente pública")}</div>
              <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>{_t(lang, "AFAI NOAA/ERDDAP — même donnée que Météo-France", "NOAA/ERDDAP AFAI — same data as Météo-France", "AFAI NOAA/ERDDAP — mismo dato que Météo-France")}</div>
            </div>
            <div style={{ ...GLASS, padding: 24, borderRadius: 16, textAlign: "left" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: "#FDFCF7" }}>{_t(lang, "Fiabilité auditée", "Audited reliability", "Fiabilidad auditada")}</div>
              <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>{proofLine}</div>
            </div>
            <div style={{ ...GLASS, padding: 24, borderRadius: 16, textAlign: "left" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🔓</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: "#FDFCF7" }}>{_t(lang, "Transparence totale", "Total transparency", "Transparencia total")}</div>
              <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>{_t(lang, "Chaque verdict montre sa source et sa confiance", "Every verdict shows source & confidence", "Cada veredicto muestra su fuente y confianza")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* OFFER TIERS */}
      <section style={{ padding: "60px 20px", background: "#0B2230" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Anton',sans-serif", fontSize: "clamp(24px,4vw,36px)", textTransform: "uppercase", letterSpacing: "-.5px", marginBottom: 12, color: "#FDFCF7" }}>
              {_t(lang, "Une offre adaptée à votre établissement", "An offer tailored to your property", "Una oferta para su establecimiento")}
            </h2>
            <p style={{ fontSize: 16, color: MUTE, maxWidth: 600, margin: "0 auto" }}>
              {_t(lang, "Essai 30 jours sans carte · Annuel = 2 mois offerts · Arrêt quand vous voulez", "30-day trial, no card · Yearly = 2 months free · Cancel anytime", "Prueba 30 días sin tarjeta · Anual = 2 meses gratis · Cancela cuando quiera")}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 }}>
            {/* BRIEF */}
            <div style={{ ...GLASS, padding: 24, borderRadius: 16, border: "1px solid rgba(255,199,44,.2)", position: "relative" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>📩</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: "#FDFCF7" }}>{_t(lang, "Brief", "Brief", "Brief")}</div>
              <div style={{ fontWeight: 800, fontSize: 24, fontFamily: "'Anton',sans-serif", color: "#FFC72C", marginBottom: 16 }}>{_t(lang, "29 €/mois", "€29/mo", "29 €/mes")}</div>
              <p style={{ fontSize: 13, color: MUTE, lineHeight: 1.6, marginBottom: 20 }}>
                {_t(lang, "Brief quotidien de vos plages + alerte échouage par email. Pour gîtes, restos, clubs plage.", "Daily brief of your beaches + landing alert by email. For guesthouses, restaurants, beach clubs.", "Informe diario de sus playas + alerta por email. Para alojamientos, restaurantes, clubes.")}
              </p>
              <button
                onClick={() => { setLeadData(d => ({ ...d, tier: "brief" })); openPremium("pro_landing_brief"); }}
                style={{ width: "100%", ...GOLD_OUTLINE, borderRadius: 12, padding: "14px", fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase" }}
              >
                {_t(lang, "Démarrer l'essai 30 j", "Start 30-day trial", "Empezar prueba 30 días")}
              </button>
            </div>

            {/* PRO - FEATURED */}
            <div style={{ ...GLASS, padding: 24, borderRadius: 16, border: "2px solid #FFC72C", position: "relative" }}>
              <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#0D0D0D", color: "#FFC72C", fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".06em" }}>
                {_t(lang, "Populaire", "Popular", "Popular")}
              </div>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🔔</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: "#FDFCF7" }}>{_t(lang, "Pro", "Pro", "Pro")}</div>
              <div style={{ fontWeight: 800, fontSize: 24, fontFamily: "'Anton',sans-serif", color: "#FFC72C", marginBottom: 16 }}>{_t(lang, "79 €/mois", "€79/mo", "79 €/mes")}</div>
              <p style={{ fontSize: 13, color: MUTE, lineHeight: 1.6, marginBottom: 20 }}>
                {_t(lang, "Devenez LA référence sargasses de votre plage : mis en avant dans l'app, brief matinal, alertes, prévision 7 j, encart sur votre site. Pour hôtels & resorts.", "Become THE sargassum reference for your beach: featured in app, morning brief, alerts, 7-day forecast, panel on your site. For hotels & resorts.", "Conviértase en LA referencia de sargazo: destacado en la app, informe matinal, alertas, pronóstico 7 días, panel en su web. Para hoteles y resorts.")}
              </p>
              <button
                onClick={() => { setLeadData(d => ({ ...d, tier: "pro" })); openPremium("pro_landing_pro"); }}
                style={{ width: "100%", ...GOLD_OUTLINE, borderRadius: 12, padding: "14px", fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase" }}
              >
                {_t(lang, "Démarrer l'essai 30 j", "Start 30-day trial", "Empezar prueba 30 días")}
              </button>
            </div>

            {/* TERRITOIRE */}
            <div style={{ ...GLASS, padding: 24, borderRadius: 16, border: "1px solid rgba(255,255,255,.1)" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🏛️</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: "#FDFCF7" }}>{_t(lang, "Territoire", "Territory", "Territorio")}</div>
              <div style={{ fontWeight: 800, fontSize: 24, fontFamily: "'Anton',sans-serif", color: "#FFC72C", marginBottom: 16 }}>{_t(lang, "dès 199 €/mois HT", "from €199/mo excl. tax", "desde 199 €/mes sin IVA")}</div>
              <p style={{ fontSize: 13, color: MUTE, lineHeight: 1.6, marginBottom: 20 }}>
                {_t(lang, "Multi-plages + rapports + API + widget public. Pour communes & offices de tourisme.", "Multi-beach + reports + API + public widget. For towns & tourism boards.", "Multi-playa + informes + API + widget público. Para municipios y oficinas de turismo.")}
              </p>
              <button
                onClick={() => { setLeadData(d => ({ ...d, tier: "territoire" })); openPremium("pro_landing_territoire"); }}
                style={{ width: "100%", ...GOLD_OUTLINE, borderRadius: 12, padding: "14px", fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase" }}
              >
                {_t(lang, "Demander un devis", "Request a quote", "Solicitar presupuesto")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <section style={{ padding: "60px 20px", background: "#081620", borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Anton',sans-serif", fontSize: "clamp(24px,4vw,36px)", textTransform: "uppercase", letterSpacing: "-.5px", marginBottom: 12, color: "#FDFCF7" }}>
              {_t(lang, "Votre tableau de bord hôtel", "Your hotel dashboard", "Su panel de hotel")}
            </h2>
            <p style={{ fontSize: 16, color: MUTE, maxWidth: 600, margin: "0 auto" }}>
              {_t(lang, "Aperçu temps réel — données live de vos plages", "Real-time preview — live data from your beaches", "Vista previa en tiempo real — datos live de sus playas")}
            </p>
          </div>

          <div style={{ ...GLASS, borderRadius: 16, overflow: "hidden" }}>
            {/* Dashboard header */}
            <div style={{ padding: 20, borderBottom: "1px solid rgba(255,255,255,.1)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#FDFCF7" }}>{_t(lang, "Hôtel Le Carayou — Trois-Îlets", "Le Carayou Hotel — Trois-Îlets", "Hotel Le Carayou — Trois-Îlets")}</div>
                <div style={{ fontSize: 13, color: MUTE }}>{_t(lang, "3 plages surveillées · Martinique", "3 beaches monitored · Martinique", "3 playas vigiladas · Martinica")}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...GLASS, padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#22C55E" }}>● {_t(lang, "LIVE", "LIVE", "EN VIVO")}</span>
                {freshLine && <span style={{ ...GLASS, padding: "6px 12px", borderRadius: 999, fontSize: 11, color: MUTE }}>{freshLine}</span>}
              </div>
            </div>

            {/* Beach cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, padding: 20 }}>
              {islandLevels.filter(l => ["clean", "moderate", "avoid"].includes(l.status)).slice(0, 3).map(l => {
                const st = STATUS_C[l.status] || "#9aa0a8"
                const stLbl = STATUS_LBL[l.status] || "—"
                const name = l.id ? (l.id.replace(/^gp-/, "").split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")) : "Plage"
                return (
                  <div key={l.id} style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#FDFCF7" }}>{name}</div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: st + "20", color: st, border: `1px solid ${st}40` }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: st }} />
                        {stLbl}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: MUTE, marginBottom: 12 }}>
                      {l.confidence ? _t(lang, `Confiance ${l.confidence}%`, `${l.confidence}% confidence`, `Confianza ${l.confidence}%`) : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, fontSize: 11, color: MUTE }}>
                      <span>🌊 {l.afai != null ? `AFAI ${l.afai.toFixed(2)}` : "AFAI —"}</span>
                      <span>📍 {l.lat && l.lng ? `${l.lat.toFixed(3)}, ${l.lng.toFixed(3)}` : ""}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* CTA */}
            <div style={{ padding: "20px", borderTop: "1px solid rgba(255,255,255,.1)", textAlign: "center" }}>
              <button
                onClick={() => openPremium("pro_landing_dashboard")}
                style={{ ...GOLD_OUTLINE, borderRadius: 12, padding: "14px 28px", fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase", letterSpacing: ".02em" }}
              >
                {_t(lang, "Voir le dashboard complet →", "View full dashboard →", "Ver panel completo →")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS / SOCIAL PROOF */}
      <section style={{ padding: "60px 20px", background: "#0B2230" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Anton',sans-serif", fontSize: "clamp(24px,4vw,36px)", textTransform: "uppercase", letterSpacing: "-.5px", marginBottom: 32, color: "#FDFCF7" }}>
            {_t(lang, "Ils nous font confiance", "They trust us", "Confían en nosotros")}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
            {["Hotel Bakoua", "Hotel La Pagerie", "Club Med Les Boucaniers", "Hotel Carayou", "Resort Cap Est"].map((name, i) => (
              <div key={i} style={{ ...GLASS, padding: "16px 24px", borderRadius: 12, minWidth: 180, fontWeight: 600, color: "#FDFCF7" }}>
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section style={{ padding: "60px 20px", background: "#081620", textAlign: "center", borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Anton',sans-serif", fontSize: "clamp(24px,4vw,36px)", textTransform: "uppercase", letterSpacing: "-.5px", marginBottom: 16, color: "#FDFCF7" }}>
            {_t(lang, "Prêt à devancer l'échouage ?", "Ready to stay ahead of sargassum?", "¿Listo para adelantarse al sargazo?")}
          </h2>
          <p style={{ fontSize: 16, color: MUTE, marginBottom: 24, lineHeight: 1.6 }}>
            {_t(lang, "Essai 30 jours sans carte bancaire. Accès immédiat. Annulation en 1 clic.", "30-day trial, no card required. Instant access. Cancel in 1 click.", "Prueba 30 días sin tarjeta. Acceso inmediato. Cancelación en 1 clic.")}
          </p>
          <button
            onClick={() => openPremium("pro_landing_footer")}
            style={{ ...GOLD_OUTLINE, borderRadius: 12, padding: "18px 36px", fontSize: 16, fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase", letterSpacing: ".02em" }}
          >
            {_t(lang, "Activer mon essai gratuit", "Start my free trial", "Activar mi prueba gratis")}
          </button>
        </div>
      </section>

      {/* B2B MODAL */}
      {showModal && (
        <B2BModal
          lang={lang}
          onClose={() => setShowModal(false)}
          sargData={sargData}
          island={island}
          beach={null}
          source={modalSource}
        />
      )}
    </div>
  )
}