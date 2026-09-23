/**
 * WorldPaywall — Paywall contextualisé "Monde" (carte + prévisions)
 * Variante "world" du paywall : ancre le paiement dans la carte mondiale,
 * montre la valeur globale (5 régions, 136+ plages) avant le détail local.
 * 
 * Props: { lang, onClose, onActivated, source, pwVariant, ...paywallContext }
 */
import React, { useState, useEffect, useMemo } from "react"
import PassOffer from "../PassOffer.jsx"
import ComicIcon from "../components/ComicIcons.jsx"
import { SeqDots } from "../SeqPrimitives.jsx"
import { FiabiliteProof } from "./FiabiliteProof.jsx"
import { usePreCtaEmail, emailPreEnabled } from "./preCtaEmail.js"
import { VeilleurMark } from "./VeilleurMark.jsx"

/**
 * (Removed inline def — VeilleurMark now imported from ./VeilleurMark.jsx)
 */

/**
 * Pictos SVG line pour stats badges (Bible v1 : emojis OS font "cheap" -> glyphes SVG stroke ink).
 * 12x12, 1.4 stroke, pas de fill (line-only = lisible sur backdrop sombre).
 * stroke=currentColor = prend la couleur du badge parent.
 */
const BADGE_ICONS = {
  regions: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18" />
    </svg>
  ),
  beaches: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18c3 0 3-2 6-2s3 2 6 2 3-2 6-2" />
      <circle cx="6" cy="9" r="2.5" />
      <path d="M16 11l1.5-2.5L20 11" />
    </svg>
  ),
  freshness: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14a8 8 0 0116 0" />
      <path d="M8 14a4 4 0 018 0" />
      <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
      <path d="M12 14V6" />
    </svg>
  ),
  // Trust signals (♗ Bible v1 : emojis OS -> pictos SVG line stroke ink)
  check: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  ),
  satellite: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="4" rx="1" />
      <rect x="9" y="14" width="6" height="4" rx="1" />
      <path d="M10 10v4M14 10v4M10 14h4" />
      <circle cx="18" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <path d="M18 7.4v3M16 6h2" />
    </svg>
  ),
  people: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M18 14c2.2 0 4 1.8 4 4M14.4 14h4" />
    </svg>
  )
}


/**
 * StatBadge — pastille compact avec picto SVG line + texte.
 * Plus fin que les emojis OS : trait 1.4px, stroke=currentColor, lisible everywhere.
 */
function StatBadge({ icon, color, children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: "rgba(255,255,255,.10)",
      border: "1px solid rgba(255,255,255,.15)",
      borderRadius: 999, padding: "4px 10px",
      fontSize: 10, fontWeight: 700, color,
      whiteSpace: "nowrap",
      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
    }}>
      {icon}{children}
    </span>
  )
}

const REGION_LABELS = {
  mq: { fr: "Martinique", en: "Martinique", es: "Martinica" },
  gp: { fr: "Guadeloupe", en: "Guadeloupe", es: "Guadalupe" },
  florida: { fr: "Floride", en: "Florida", es: "Florida" },
  puntacana: { fr: "Punta Cana", en: "Punta Cana", es: "Punta Cana" },
  rivieramaya: { fr: "Riviera Maya", en: "Riviera Maya", es: "Riviera Maya" },
  barbados: { fr: "Barbade", en: "Barbados", es: "Barbados" }
}

const WORLD_STATS = {
  fr: { regions: 5, beaches: "136+", freshness: "4×/jour" },
  en: { regions: 5, beaches: "136+", freshness: "4×/day" },
  es: { regions: 5, beaches: "136+", freshness: "4×/día" }
}

const STAT_LABELS = {
  clean:    { fr: "Propre", en: "Clean", es: "Limpia" },
  moderate: { fr: "Modéré", en: "Moderate", es: "Moderado" },
  avoid:    { fr: "À éviter", en: "Avoid", es: "Evitar" }
}

export function WorldPaywall({
  lang = "fr",
  onClose,
  onActivated,
  source = "world",
  pwVariant = "calm",
  island,
  beach,
  sargData, tripDays, beachCount = 0,
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
  doSubscribe,
  payWithWallet,
  walletRedirect,
  onPayEmailInput,
  onPassBuy,
  submitLead,
  community = 0,
  PAY_CUR
}) {
  // Stats régionales honnêtes (REVENUE 2026-09-23) : `stats` est calculé
  // après wowIsland (besoin du nom d'île) — voir useMemo ci-dessous.
  const regions = REGION_LABELS
  
  const t = (fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr
  // Lot 5 — repli boîte valeur ≤480px, stats tripliquées (rollback ?sguxlot5=0).
  const uxLot5 = (()=>{try{return !/[?&]sguxlot5=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()

  // CRO J0-J30 — offre AVANT email (rollback ?sgpayorder=0).
  // Diagnostic : email `required` au-dessus de l'offre = friction d'enregistrement
  // anticipé (modal→CTA chronique ~1,3 %). L'email reste capturé (sg_email →
  // pré-remplit OnsiteCheckout) mais APRÈS le clic d'intention.
  const payOrderOfferFirst = (()=>{try{return !/[?&]sgpayorder=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()

  // A1 — capture email optionnelle dans le paywall (rollback ?email_pre=0).
  // Placement : APRÈS l'offre dans le flux par défaut (contrat J0 « offre
  // AVANT email », fix UX-002) ; AVANT l'offre sous rollback ?sgpayorder=0.
  // Champ TOUJOURS optionnel : le CTA reste cliquable sans email (décision
  // J0-J30 conservée).
  // Le lead part en debounced via submitLead (G1) dès la saisie d'un email valide.
  // Flag figé au mount (useState initializer) : le handler deep-link ?paywall=1
  // nettoie TOUTE la query via replaceState à l'ouverture, ce qui fausserait
  // une lecture à chaque render.
  const [emailPre] = useState(emailPreEnabled)
  const onPreCtaEmail = usePreCtaEmail({ submitLead })

  // E2 — preuve sociale réelle (rollback ?sgsocial=0). Même copy que le
  // checkout (OnsiteCheckout) : compteur __COMM buildé, jamais inventé.
  // Gardée >0 : le cas community=0 appartient à E9 (preuve qualité données).
  const socialOn = (()=>{try{return !/[?&]sgsocial=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()

  // WOW TAKEOVER 2026-09-23 — « UNLOCK MY STAY » (rollback ?sgpaywow=0).
  // Le paywall devient destination d'abord : hero golden-hour (plage + verdict
  // + demain) → offre (PassOffer INCHANGÉ : prix, CTA, tracking, checkout) →
  // micro-trust. Les blocs stats/preuve passent en secondaire (<details>).
  // Money-path strictement intact : aucun prix, aucun event, aucun flux modifié.
  const wowOn = (()=>{try{return !/[?&]sgpaywow=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  const wowVerdict = (() => {
    const s = beach && beach.status
    if (s === "clean") return { c: "#22C55E", bg: "rgba(34,197,94,.14)", glyph: "✓", label: t("On y va", "Go", "Vamos") }
    if (s === "avoid") return { c: "#E8522A", bg: "rgba(232,82,42,.12)", glyph: "✕", label: t("On évite", "Avoid", "Evitar") }
    return { c: "#B87A00", bg: "rgba(184,122,0,.13)", glyph: "◐", label: t("Prudence", "Caution", "Cuidado") }
  })()
  // Demain (J+1) depuis la même source que le strip (tripDays = forecast réel,
  // jamais inventé). Rien si pas de contexte plage.
  const wowTomorrow = (() => {
    try {
      if (!Array.isArray(tripDays) || tripDays.length < 2) return null
      const st = tripDays[1]
      if (st !== "clean" && st !== "moderate" && st !== "alert") return null
      const m = {
        clean: { c: "#22C55E", glyph: "✓", label: t("Propre", "Clean", "Limpia") },
        moderate: { c: "#B87A00", glyph: "◐", label: t("À surveiller", "Worth checking", "A vigilar") },
        alert: { c: "#E8522A", glyph: "✕", label: t("À éviter", "Avoid", "Evitar") },
      }
      return m[st]
    } catch (_) { return null }
  })()
  const wowIsland = (() => {
    try {
      const id = (island && (island.id || island)) || (beach && beach.island)
      const l = id && REGION_LABELS[id]
      return l ? (l[lang] || l.fr) : ""
    } catch (_) { return "" }
  })()
  const stats = useMemo(() => {
    const base = WORLD_STATS[lang] || WORLD_STATS.fr
    const n = Number(beachCount) || 0
    if (n > 0 && wowIsland) return { ...base, beaches: String(n), regions: wowIsland, _regional: true }
    if (n > 0) return { ...base, beaches: String(n) }
    return base
  }, [lang, beachCount, wowIsland])

  // Restore email from localStorage (clé canonique = sg_email, écrite par tout le funnel)
  const [emailValue, setEmailValue] = useState(() => {
    try { return localStorage.getItem("sg_email") || "" } catch (_) { return "" }
  })
  const handleEmailChange = (e) => {
    setEmailValue(e.target.value)
    // Écriture immédiate : l'overlay OnsiteCheckout (seul détenteur de payEmailRef)
    // pré-remplit son champ depuis sg_email à l'ouverture de payStep.
    try { localStorage.setItem("sg_email", e.target.value.trim()) } catch (_) {}
    if (onPayEmailInput) onPayEmailInput()
  }
  
  // Variant-specific content
  const variantContent = useMemo(() => {
    const base = {
      title: t(
        "Le monde à portée de main — 136+ plages, 5 régions",
        "World at your fingertips — 136+ beaches, 5 regions",
        "El mundo al alcance — 136+ playas, 5 regiones"
      ),
      subtitle: t(
        "Score 0-100 par plage, mis à jour 4×/jour depuis le satellite Copernicus",
        "Score 0-100 per beach, updated 4×/day from Copernicus satellite",
        "Puntuación 0-100 por playa, actualizada 4×/día desde satélite Copernicus"
      ),
      cta: t(
        "Débloquer l'accès mondial",
        "Unlock worldwide access",
        "Desbloquear acceso mundial"
      ),
      // Pictos = set SVG maison (Bible v1 : JAMAIS d'emoji OS — voir BADGE_ICONS
      // ci-dessus). Wording inchangé (mesure CTA en cours, ne pas y toucher).
      features: [
        { icon: "palm", text: t("136+ plages · Score 0-100 · 5 régions", "136+ beaches · Score 0-100 · 5 regions", "136+ playas · Puntuación 0-100 · 5 regiones") },
        { icon: "orbit", text: t("Satellite Copernicus · Données 4×/jour", "Copernicus satellite · Data 4×/day", "Satélite Copernicus · Datos 4×/día") },
        { icon: "bell", text: t("Alerte le jour où ta plage bascule", "Alert the day your beach flips", "Alerta el día que tu playa cambia") },
        { icon: "bank", text: t("Un prix unique · Pas d'abonnement", "One price · No subscription", "Un precio único · Sin suscripción") }
      ]
    }
    
    switch (pwVariant) {
      case "beat":
        return {
          ...base,
          headline: t("L'énergie de l'océan, dans votre poche", "Ocean energy in your pocket", "La energía del océano en tu bolsillo"),
          tone: "energetic",
          accent: "#FFC72C"
        }
      case "constel":
        return {
          ...base,
          headline: t("Les étoiles guident votre baignade", "Stars guide your swim", "Las estrellas guían tu baño"),
          tone: "cosmic",
          accent: "#8A4A8E"
        }
      case "alert":
        return {
          ...base,
          headline: t("Alerte sargasses : restez informé", "Sargassum alert: stay informed", "Alerta sargazo: mantente informado"),
          tone: "urgent",
          accent: "#E8522A"
        }
      case "watch":
        return {
          ...base,
          headline: t("Le Veilleur veille sur vos plages", "The Watcher watches your beaches", "El Vigía vigila tus playas"),
          tone: "watchful",
          accent: "#5FD3C9"
        }
      case "calm":
      default:
        return {
          ...base,
          headline: t("Votre plage, vérifiée avant de partir", "Your beach, verified before you go", "Tu playa, verificada antes de ir"),
          tone: "calm",
          accent: "#22C55E"
        }
    }
  }, [pwVariant, lang])
  
  // Region selector for multi-region context
  const regionNames = Object.entries(regions).map(([id, labels]) => ({
    id,
    name: labels[lang] || labels.fr
  }))
  
  return (
    <div className={wowOn ? "sg-paywall-world sg-wow" : "sg-paywall-world"} style={{ position: "relative", width: "100%", maxWidth: wowOn ? undefined : 420, margin: "0 auto" }}>
      {/* Background atmosphere */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 20,
        background: `radial-gradient(ellipse at center, ${variantContent.accent}15 0%, transparent 70%)`,
        pointerEvents: "none", zIndex: 0
      }} />
      
      <div style={{ position: "relative", zIndex: 1, padding: 24 }} className={wowOn ? "sg-wow-flow" : undefined}>
        {wowOn && (
        <style>{`
          .sg-paywall-world.sg-wow{max-width:420px}
          .sg-wow-hero{border-radius:18px;overflow:hidden;border:2px solid #0D0B14;box-shadow:4px 4px 0 rgba(0,0,0,.45);margin-bottom:14px}
          .sg-wow-scene{position:relative;height:148px;background:linear-gradient(180deg,#0B2230 0%,#155A5A 30%,#C97E3A 62%,#F2B05E 78%,#1A5852 78.5%,#08251F 100%)}
          .sg-wow-sun{position:absolute;left:50%;top:44%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:radial-gradient(circle,#FFE47A 0%,#FFD884 55%,rgba(255,216,132,0) 72%)}
          .sg-wow-sea{position:absolute;left:0;right:0;bottom:0;height:32px}
          .sg-wow-veil{position:absolute;left:12px;top:10px;display:flex;align-items:center;gap:8px}
          .sg-wow-live{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff;background:rgba(11,34,48,.65);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:4px 10px}
          .sg-wow-card{background:#FDF6E3;color:#0D0B14;padding:14px 14px 12px}
          .sg-wow-dest{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(13,11,20,.55)}
          .sg-wow-name{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;font-size:22px;line-height:1.05;margin:2px 0 8px;overflow:hidden;text-overflow:ellipsis}
          .sg-wow-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
          .sg-wow-verdict{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;border-radius:999px;padding:5px 12px;border:2px solid #0D0B14}
          .sg-wow-tomorrow{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:rgba(13,11,20,.75)}
          .sg-wow-trip{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 13px;border-radius:12px;background:rgba(255,199,44,.08);border:1px dashed rgba(255,199,44,.5);font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:12.5px;font-weight:700;color:#FFE08A;line-height:1.4}
          .sg-wow-why{margin:2px 0 0;border:1px solid rgba(255,255,255,.14);border-radius:12px;overflow:hidden}
          .sg-wow-why summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:12px;font-weight:800;color:rgba(255,255,255,.75)}
          .sg-wow-why summary::-webkit-details-marker{display:none}
          .sg-wow-why summary:focus-visible{outline:2px solid #FFC72C;outline-offset:2px}
          @media (min-width:1024px){
            .sg-modal-panel:has(.sg-paywall-world.sg-wow){max-width:980px !important}
            .sg-paywall-world.sg-wow{max-width:920px}
            .sg-paywall-world.sg-wow .sg-wow-flow{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:22px;align-items:start}
            .sg-paywall-world.sg-wow .sg-wow-flow>*{grid-column:2;min-width:0}
            .sg-paywall-world.sg-wow .sg-wow-flow>.sg-wow-hero{grid-column:1;grid-row:1/span 40;position:sticky;top:0}
            .sg-wow-scene{height:220px}
            .sg-wow-sun{width:88px;height:88px;margin:-44px 0 0 -44px}
          }
          @media (prefers-reduced-motion:reduce){
            .sg-paywall-world.sg-wow *{animation:none !important;transition:none !important}
          }
        `}</style>
        )}
        {/* WOW hero : destination d'abord (rollback ?sgpaywow=0 = header legacy ci-dessous) */}
        {wowOn ? (
        <div className="sg-wow-hero">
          <div className="sg-wow-scene" aria-hidden="true">
            <div className="sg-wow-sun" />
            <svg className="sg-wow-sea" viewBox="0 0 400 32" preserveAspectRatio="none">
              <path d="M0 18 Q 25 10 50 18 T 100 18 T 150 18 T 200 18 T 250 18 T 300 18 T 350 18 T 400 18 V32 H0 Z" fill="rgba(255,255,255,.22)" />
              <path d="M0 24 Q 30 17 60 24 T 120 24 T 180 24 T 240 24 T 300 24 T 360 24 T 420 24 V32 H0 Z" fill="rgba(255,255,255,.14)" />
            </svg>
            <div className="sg-wow-veil">
              <VeilleurMark />
              <span className="sg-wow-live">{t("Aujourd'hui", "Today", "Hoy")}</span>
            </div>
          </div>
          <div className="sg-wow-card">
            <div className="sg-wow-dest">{wowIsland || t("Ta destination", "Your destination", "Tu destino")}{Number(beachCount) > 0 ? ` · ${beachCount} ${t("plages", "beaches", "playas")}` : ""}</div>
            <div className="sg-wow-name">{(beach && beach.name) || variantContent.title}</div>
            <div className="sg-wow-row">
              <span className="sg-wow-verdict" style={{ color: wowVerdict.c, background: wowVerdict.bg }}>
                <span aria-hidden="true">{wowVerdict.glyph}</span>{wowVerdict.label}
              </span>
              {wowTomorrow && (
                <span className="sg-wow-tomorrow">
                  <span aria-hidden="true" style={{ color: wowTomorrow.c, fontWeight: 800 }}>{wowTomorrow.glyph}</span>
                  {t("Demain :", "Tomorrow:", "Mañana:")} {wowTomorrow.label}
                </span>
              )}
            </div>
          </div>
        </div>
        ) : (
        <>
        {/* Compact header (legacy) */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {/* Le Veilleur SVG — mascotte de marque (axe commercial + rétention).
              Source : design/wow-candidates/paywall-golden-pass.html (proto Bible v1).
              Œil-capteur mi-clos qui regarde la mer (bas-droite), JAMAIS l'utilisateur
              (règle marque « Le Veilleur rassure, ne surveille pas »).
              Micro-respiration 3s amplitude 1.5px (calme-doctrine, pas jank).
              prefers-reduced-motion = plancher dur (pause). */}
          <VeilleurMark />
          <h2 style={{
            fontFamily: "'Anton', system-ui, sans-serif",
            fontSize: "clamp(20px, 5vw, 26px)",
            fontWeight: 400,
            textTransform: "uppercase",
            letterSpacing: ".02em",
            color: "#fff",
            margin: "0 0 6",
            textShadow: "0 2px 12px rgba(0,0,0,.4)"
          }}>
            {variantContent.headline}
          </h2>
          <p style={{
            color: "rgba(255,255,255,.85)",
            fontSize: 13,
            lineHeight: 1.4,
            margin: "0 0 14",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif"
          }}>
            {variantContent.subtitle}
          </p>
          {/* Compact stats badges — pictos SVG line (Bible v1 remplace emojis OS) */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <StatBadge icon={BADGE_ICONS.regions} color="#FFC72C">
              {stats._regional ? stats.regions : (<>{stats.regions} {t("régions", "regions", "regiones")}</>)}
            </StatBadge>
            <StatBadge icon={BADGE_ICONS.beaches} color="#22C55E">
              {stats.beaches} {t("plages", "beaches", "playas")}
            </StatBadge>
            <StatBadge icon={BADGE_ICONS.freshness} color="#5FD3C9">
              {stats.freshness}
            </StatBadge>
          </div>
        </div>
        </>
        )}
        {/* ═══ B1 fix — Beach context mini-cart (funnel stability 2026-08-12) ═══ */}
        {/* Si le paywall est ouvert depuis une fiche plage, rappeler LA plage observée
            au lieu d'un pitch générique "monde à portée de main". Relevance = conversion.
            WOW : fondu dans le hero (masqué, rollback ?sgpaywow=0). */}
        {!wowOn && beach && beach.name && (() => {
          const verdictByStatus = {
            clean: { color: "#22C55E", label: t("Propre aujourd'hui", "Clean today", "Limpia hoy") },
            moderate: { color: "#F59E0B", label: t("Modérée — prudence", "Moderate — caution", "Moderada — cuidado") },
            avoid: { color: "#E8522A", label: t("À éviter aujourd'hui", "Avoid today", "Evitar hoy") }
          }
          const v = verdictByStatus[beach.status] || verdictByStatus.moderate
          return (
            <div style={{
              marginBottom: 14, padding: "12px 14px",
              background: "rgba(13,17,23,.6)", border: `1.5px solid ${v.color}55`,
              borderRadius: 12, display: "flex", alignItems: "center", gap: 10
            }}>
              <span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: "50%", background: v.color,
                boxShadow: `0 0 8px ${v.color}`, flexShrink: 0
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  fontSize: 14, fontWeight: 800, color: "#fff",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                }}>
                  {beach.name}
                </div>
                <div style={{
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  fontSize: 11, fontWeight: 600, color: v.color,
                  textTransform: "uppercase", letterSpacing: ".04em"
                }}>
                  {v.label}
                </div>
              </div>
            </div>
          )
        })()}
        
        {/* ═══ HAVE vs GET — cadrage "ce que j'ai / ce que j'obtiens" (UX conversion).
            Données 100 % réelles (même verdict que la fiche) : le gratuit du jour
            d'abord, le Pass comme sa suite logique. Additif, wording offre/prix
            inchangé (mesure CTA préservée). Rollback ?mphave=0.
            WOW : fondu dans le hero (masqué, rollback ?sgpaywow=0). ═══ */}
        {!wowOn && (() => { try { if (/[?&]mphave=0/.test(window.location.search)) return null } catch (_) {}
          const haveLbl = (() => {
            const m = { clean: t("Propre aujourd'hui", "Clean today", "Limpia hoy"),
              moderate: t("À surveiller", "Worth checking", "A vigilar"),
              avoid: t("À éviter aujourd'hui", "Avoid today", "Evitar hoy") }
            return (beach && beach.name)
              ? `${beach.name} — ${m[beach.status] || m.moderate}`
              : t("Le verdict du jour", "Today's verdict", "El veredicto del día")
          })()
          return (
          <div style={{ marginBottom: 14, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,.04)",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.85)" }}>
              <span aria-hidden="true" style={{ fontSize: 13 }}>✓</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t("AUJOURD'HUI (gratuit) : ", "TODAY (free): ", "HOY (gratis): ")}{haveLbl}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,199,44,.08)",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", fontSize: 12, fontWeight: 800, color: "#FFC72C" }}>
              <span aria-hidden="true" style={{ fontSize: 13 }}>→</span>
              <span>{t("AVEC LE PASS : 7 jours · alertes · alternatives", "WITH THE PASS: 7 days · alerts · alternatives", "CON EL PASE: 7 días · alertas · alternativas")}</span>
            </div>
          </div>
          ) })()}
        
        {/* ═══ EMAIL INPUT (P0 fix — bind to payEmailRef) ═══
            CRO J0-J30 : rendu APRÈS l'offre par défaut (?sgpayorder=0 = avant).
            L'email reste optionnel ici (pré-remplit OnsiteCheckout via sg_email). */}
        {!payOrderOfferFirst && (
        <div style={{ marginBottom: 14 }}>
          <label style={{
            display: "block", fontSize: 12, color: "rgba(255,255,255,.6)",
            marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em"
          }}>
            {t("Email pour recevoir ton accès", "Email to receive your access", "Email para recibir tu acceso")}
          </label>
          <input
            type="email"
            autoComplete="email"
            {...(emailPre ? { "data-testid": "pre-cta-email" } : {})}
            placeholder={t("ton@email.com", "your@email.com", "tu@email.com")}
            defaultValue={emailValue}
            onChange={(e) => { handleEmailChange(e); if (emailPre) onPreCtaEmail(e) }}
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
        )}

        {/* ═══ VALEUR AVANT PRIX ═══ — Rapel du bénéfice avant le prix.
            Augmente le taux de conversion CTA→paiement en rappelant ce que
            l'utilisateur obtient. Placées juste avant PassOffer, ces pastilles
            renforcent la décision sans ajouter de dépendance.
            WOW : le hero porte la valeur (masqué, rollback ?sgpaywow=0). */}
        {!wowOn && (
        <div className={uxLot5?"sg-valeur-box":undefined} style={{
          marginBottom: 14, padding: "12px 14px",
          background: "rgba(13,17,23,.6)", border: "1.5px solid rgba(34,197,94,.3)",
          borderRadius: 12, marginTop: 6
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 8px #22C55E", flexShrink: 0 }} />
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>
              {t("136+ plages", "136+ beaches", "136+ playas")} {t("avec score 0-100", "with score 0-100", "con puntuación 0-100")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            <span style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>
              {t("mis à jour 4×/jour", "updated 4×/day", "actualizada 4×/día")}
            </span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#5FD3C9", boxShadow: "0 0 8px #5FD3C9", flexShrink: 0 }} />
            <span style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>
              {t("satellite", "satellite", "satélite")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            <span style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>
              {t("97% vérifiées", "97% verified", "97% verificadas")}
            </span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFC72C", boxShadow: "0 0 8px #FFC72C", flexShrink: 0 }} />
            <span style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>
              {t("fiabilité", "reliability", "fiabilidad")}
            </span>
          </div>
        </div>
        )}

        {/* ═══ PREUVE SOCIALE (E2) / PREUVE QUALITÉ DONNÉES (E9) ═══
            Juste avant l'offre : compteur réel d'abonnés-suivi si community>0,
            sinon preuve qualité données (98% globales, backtest 99% J+3→J+6).
            Rollback ?sgsocial=0 désactive les deux.
            WOW : secondaire (masqué, rollback ?sgpaywow=0 — voir <details> après l'offre). */}
        {!wowOn && socialOn && community > 0 && (
        <div data-testid="paywall-social-proof" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12, fontSize: 12, fontWeight: 600, color: "rgba(255,199,44,.8)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
          {t(`Déjà ${community}+ qui suivent leurs plages`, `${community}+ people track their beaches`, `${community}+ personas rastrean sus playas`)}
        </div>
        )}
        {!wowOn && socialOn && community === 0 && (
        <div data-testid="paywall-data-quality-proof" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12, padding: "10px 12px", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 10, fontSize: 11.5, fontWeight: 600, color: "rgba(34,197,94,.9)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
          {t("98% des prévisions vérifiées · Satellite Copernicus · Backtest 99% sur J+3→J+6", "98% of forecasts verified · Copernicus satellite · 99% backtest on day 3–6", "98% de pronósticos verificados · Satélite Copernicus · Backtest 99% en J+3→J+6")}
        </div>
        )}

        {/* Pricing card (PassOffer) — CRO J0-J30 : AVANT l'email par défaut
            (offre d'abord, enregistrement après). ?sgpayorder=0 = ordre historique. */}
        {payOrderOfferFirst && (
        <div style={{ marginBottom: 14 }}>
          <PassOffer
            lang={lang}
            currency={PAY_CUR}
            onBuy={onPassBuy}
            tripDays={tripDays} tripBeach={beach && beach.name ? beach.name : ""}
          />
        </div>
        )}

        {/* ═══ EMAIL CAPTURE (A1, après l'offre — ordre J0 « offre AVANT email ») ═══
            Fix UX-002 : la capture A1 se plaçait AVANT l'offre et cassait le
            contrat j0 (offerY > emailY). Elle est fusionnée ici avec le bloc
            email d'après-offre : toujours optionnelle (jamais required), CTA
            jamais conditionné, lead G1 debounced via le hook (rollback
            ?email_pre=0 = champ présent, capture désactivée — pas de testid). */}
        {payOrderOfferFirst && (
        <div style={{ marginBottom: 14 }}>
          <label style={{
            display: "block", fontSize: 12, color: "rgba(255,255,255,.6)",
            marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em"
          }}>
            {t("Email pour recevoir ton accès", "Email to receive your access", "Email para recibir tu acceso")}
          </label>
          <input
            type="email"
            autoComplete="email"
            {...(emailPre ? { "data-testid": "pre-cta-email" } : {})}
            placeholder={t("ton@email.com", "your@email.com", "tu@email.com")}
            defaultValue={emailValue}
            onChange={(e) => { handleEmailChange(e); if (emailPre) onPreCtaEmail(e) }}
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
        )}

        {/* ═══ Ordre historique (rollback ?sgpayorder=0) : offre après email+valeur ═══ */}
        {!payOrderOfferFirst && (
        <div style={{ marginBottom: 14 }}>
          <PassOffer
            lang={lang}
            currency={PAY_CUR}
            onBuy={onPassBuy}
            tripDays={tripDays} tripBeach={beach && beach.name ? beach.name : ""}
          />
        </div>
        )}

        {/* ═══ WOW — ligne séjour (rollback ?sgpaywow=0) ═══
            Le Pass débloque le Trip Planner (J+3+ verrouillés sans Pass — fait
            réel, aucune donnée inventée). Continuité découverte → séjour. */}
        {wowOn && (
        <div className="sg-wow-trip">
          <ComicIcon name="compass" size={15} />
          <span>{t("Séjour débloqué : la meilleure plage chaque jour, plan B inclus.", "Stay unlocked: the best beach each day, backup included.", "Estancia desbloqueada: la mejor playa cada día, plan B incluido.")}</span>
        </div>
        )}

        {/* ═══ BELOW THE FOLD — trust + features ═══
            WOW : preuve secondaire pliée dans <details> (rollback ?sgpaywow=0).
            La preuve reste accessible (lien /fiabilite/ gardé dans FiabiliteProof)
            mais ne domine plus la vente. */}
        {wowOn ? (
        <details className="sg-wow-why">
          <summary>
            <span aria-hidden="true" style={{ color: "#22C55E", fontWeight: 800 }}>✓</span>
            {t("Pourquoi nous croire →", "Why trust us →", "Por qué creernos →")}
          </summary>
          <div style={{ padding: "0 12px 12px" }}>
            <FiabiliteProof lang={lang} REL={window.__REL} regime="high" />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                {BADGE_ICONS.check}
                <span>{t("97% vérifiées", "97% verified", "97% verificadas")}</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,210,140,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                {BADGE_ICONS.satellite}
                <span>Copernicus</span>
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              {variantContent.features.map((feat, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 6, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 }}>
                  <span style={{ display: "inline-flex", flexShrink: 0, color: "#FFC72C" }} aria-hidden="true">
                    <ComicIcon name={feat.icon} size={15} />
                  </span>
                  <span style={{ color: "rgba(255,255,255,.8)", fontSize: 12, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", fontWeight: 500 }}>
                    {feat.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>
        ) : (
        <>
        {/* FiabiliteProof (legacy) */}
        <FiabiliteProof lang={lang} REL={window.__REL} regime="high" />
        </>
        )}
        
        {/* Trust signals (legacy flat — WOW : pliés dans <details> ci-dessus) */}
        {!wowOn && (
        <>
        <div style={{
          display: "flex", justifyContent: "center", gap: 12,
          flexWrap: "wrap", marginTop: 12, paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,.08)"
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            {BADGE_ICONS.check}
            <span>{t("97% vérifiées", "97% verified", "97% verificadas")}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,210,140,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            {BADGE_ICONS.satellite}
            <span>Copernicus</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,210,140,.4)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "#FFC72C", whiteSpace: "nowrap", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
            {BADGE_ICONS.people}
            <span>{t("12k+ voyageurs", "12k+ travelers", "12k+ viajeros")}</span>
          </span>
        </div>
        
        {/* Feature highlights — collapsed below fold */}
        <div style={{ marginTop: 14 }}>
          {variantContent.features.map((feat, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", marginBottom: 6,
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 10
            }}>
              <span style={{ display: "inline-flex", flexShrink: 0, color: "#FFC72C" }} aria-hidden="true">
                <ComicIcon name={feat.icon} size={15} />
              </span>
                <span style={{
                  color: "rgba(255,255,255,.8)", fontSize: 12,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  fontWeight: 500
                }}>
                  {feat.text}
                </span>
              </div>
            ))}
          </div>
          </>
          )}

          {/* Signature B2C « Le Veilleur » — moat identitaire en pied du paywall.
            Pas un CTA, ne vend rien : pose l'honnêteté de marque juste avant le choix.
            i18n via t(), Bricolage 600 12px italic opacity .5 (discret, pas distractant). */}
        <p style={{
          marginTop: 14, marginBottom: 0, textAlign: "center",
          font: "italic 600 12px/1.4 'Bricolage Grotesque', system-ui, sans-serif",
          color: "rgba(255,255,255,.5)", letterSpacing: ".01em"
        }}>
          {t("Le Veilleur regarde ta plage, pas la peur.", "The Watcher watches your beach — not the fear.", "El Vigía mira tu playa, no el miedo.")}
        </p>
        
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 14, padding: "10px",
            background: "transparent", border: "1.5px solid rgba(255,255,255,.15)",
            borderRadius: 12, color: "rgba(255,255,255,.6)",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            transition: "all .15s ease"
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.35)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.15)"}
        >
          {t("Plus tard", "Later", "Más tarde")}
        </button>
      </div>
    </div>
  )
}

export default WorldPaywall

