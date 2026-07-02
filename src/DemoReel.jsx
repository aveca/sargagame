/**
 * DemoReel — « Le Registre du Veilleur », mode VITRINE (attract mode) ?demo=1.
 * Boucle auto-play ~30 s (5 scènes) qu'un hôtel/hostel laisse tourner sur une
 * tablette de hall (ou qu'on partage en B2C). Présente la value proposition avec
 * de la VRAIE donnée, suit le spine 6-temps, se termine sur un QR co-brandé.
 *
 * Verdict panel adverse (2026-07-02) : GO recadré, OFF par défaut. Ce n'est PAS
 * un canal d'acquisition (scans de hall dérisoires) mais un OBJET DE FIERTÉ /
 * RÉTENTION B2B — l'hôtel le laisse tourner car ça le crédibilise et rend le moat
 * honnêteté physiquement visible. Garde-fous honnêteté HARD-WIRÉS ici (gate-stale,
 * floor-first, skip-if-empty, co-brand confiné à s5, jamais de peur montrée).
 *
 * Perf « leave-in-background » : ZÉRO rAF continu (avance = setTimeout chaîné),
 * GEL DUR sur visibilitychange (0 % CPU onglet caché / veille, anti burn-in H24),
 * une seule scène montée à la fois, reduced-motion = plancher. Lazy → hors budget
 * eager. QR = SVG JSX inline (src/qr-lite.js, vérifié jsQR), zéro image externe.
 *
 * Rollback : ?demo=0 (no-op) + OFF par défaut (jamais monté sans ?demo=1).
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useSwipeClose } from "./useSwipeClose.js"
import { SeqDots, SEQ_STEP_CSS } from "./SeqPrimitives.jsx"
import { qrPath } from "./qr-lite.js"

const GOLD = "#FFC72C"
const INK = "#0d1117"
const PAPER = "#fdf6e3"

// Couleur de statut (jamais l'info par la couleur seule → toujours un libellé à côté)
const STC = { clean: "#27c46b", moderate: "#f5a623", watch: "#f5a623", heavy: "#e8503a", high: "#e8503a", red: "#e8503a" }
const stColor = s => STC[s] || "#1c7fb0"

// QR en JSX pur (un seul <path>, aucun HTML injecté)
function QR({ text, className, dark = INK, light = "#ffffff", ariaLabel }) {
  const { d, dim } = useMemo(() => { try { return qrPath(text, { margin: 3 }) } catch (_) { return { d: "", dim: 29 } } }, [text])
  if (!d) return null
  return (
    <svg className={className} viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges" role="img" aria-label={ariaLabel}>
      <rect width={dim} height={dim} fill={light} />
      <path d={d} fill={dark} />
    </svg>
  )
}

// Mascotte Le Veilleur (œil-satellite compact, panneaux solaires bleus = canon)
function Veilleur({ size = 60 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" style={{ display: "block", filter: "drop-shadow(0 4px 10px rgba(0,0,0,.35))" }}>
      <g stroke={INK} strokeWidth="3"><rect x="4" y="50" width="22" height="24" rx="2" fill="#1c7fb0" /><rect x="94" y="50" width="22" height="24" rx="2" fill="#1c7fb0" /><line x1="26" y1="62" x2="42" y2="62" /><line x1="94" y1="62" x2="78" y2="62" /></g>
      <circle cx="60" cy="62" r="36" fill={PAPER} stroke={INK} strokeWidth="3.5" />
      <line x1="60" y1="26" x2="60" y2="12" stroke={INK} strokeWidth="3.5" />
      <circle cx="60" cy="9" r="5.5" fill={GOLD} stroke={INK} strokeWidth="2.5" />
      <circle cx="60" cy="62" r="21" fill={INK} />
      <circle cx="60" cy="62" r="15" fill={GOLD} />
      <circle cx="60" cy="62" r="6.5" fill={INK} />
      <circle cx="65" cy="57" r="3" fill="#fff" />
      <path d="M43 40 Q60 33 77 40" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

export default function DemoReel({ lang = "fr", src = "lobby", partner = null, allBeaches, imageMap, imageQ, mapForecastByBeach, sargData, island, track, onClose, onEnterFunnel, onPick }) {
  const t = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr)
  const reduce = useMemo(() => { try { return window.matchMedia("(prefers-reduced-motion:reduce)").matches } catch (_) { return false } }, [])
  // Mode INTERACTIF (attract in-app, ?idle) : additif, ne touche PAS le kiosk (src="lobby")
  // ni le partage (src="share"). Le 1er geste NE recharge PAS la page — il dissout le reel
  // via un capture-wipe doré (suppr. sous reduced-motion) et rend la main au funnel vivant
  // sur la MÊME plage vedette (onEnterFunnel). onPick fige l'objet plage pour le parent.
  const interactive = src === "interactive"
  const [wiping, setWiping] = useState(false)
  const enteringRef = useRef(false)

  // ── Plage vedette du démo : meilleure PROPRE avec vraie photo, rotation
  //    quotidienne pour la variété ; sinon meilleure dispo. Fallback honnête :
  //    la MOINS touchée + verdict prudent, JAMAIS inventer une plage propre. ──
  const pick = useMemo(() => {
    try {
      const cands = (allBeaches || []).filter(b => b && b.status && b.name)
      if (!cands.length) return null
      const withPhoto = cands.filter(b => imageMap && imageMap[b.id] && !String(imageMap[b.id]).startsWith("sat-"))
      const cleans = withPhoto.filter(b => b.status === "clean")
      const pool = cleans.length ? cleans : (withPhoto.length ? withPhoto : cands)
      const sorted = [...pool].sort((a, b) => (b.score || 0) - (a.score || 0))
      const top = sorted.slice(0, 4)
      const day = Math.floor(Date.now() / 864e5)
      const p = top.length ? top[day % top.length] : sorted[0]
      if (!p) return null
      const img = (imageMap && imageMap[p.id] && !String(imageMap[p.id]).startsWith("sat-")) ? "/beaches/" + imageMap[p.id] : null
      return { ...p, _img: img, _isClean: p.status === "clean" }
    } catch (_) { return null }
  }, [allBeaches, imageMap])

  // ── Expose la plage vedette résolue au parent (mode interactif), UNE seule fois : le
  //    funnel DOIT atterrir sur EXACTEMENT cette plage (même verdict, même statut → zéro
  //    bait). Le parent stocke l'objet et l'ouvre au 1er geste. ──
  const pickedRef = useRef(false)
  useEffect(() => { if (pick && !pickedRef.current) { pickedRef.current = true; try { onPick && onPick(pick) } catch (_) {} } }, [pick])

  // ── GATE-STALE dur : pas d'affirmation de fraîcheur si données >12 h / stale ──
  const freshOK = useMemo(() => {
    try {
      if (!sargData || sargData.stale) return false
      const u = sargData.updatedAt; if (!u) return false
      const h = (Date.now() - new Date(u).getTime()) / 3.6e6
      return isFinite(h) && h >= 0 && h < 12
    } catch (_) { return false }
  }, [sargData])
  const freshLabel = freshOK ? t("en ce moment", "right now", "ahora mismo") : t("au dernier passage satellite", "at the last satellite pass", "en el último paso del satélite")

  // ── Prévision 7 j réelle de la plage vedette (skip s2 si absente) ──
  const forecast = useMemo(() => {
    try { const f = pick && mapForecastByBeach && mapForecastByBeach[pick.id]; return (f && f.d && f.d.length) ? f.d.slice(0, 6) : null } catch (_) { return null }
  }, [pick, mapForecastByBeach])

  // ── Preuve fiabilité auditée (track-record) : régime le plus échantillonné.
  //    SKIP-IF-EMPTY dur : s4 sautée si n<20, pct absent, OU pas de fenêtre datée
  //    (loi moat : un « 100 % » ne s'affiche JAMAIS sans les 5 qualificatifs, dont
  //    la fenêtre datée). ──
  const [proof, setProof] = useState(null)
  useEffect(() => {
    let ok = true
    fetch("/api/copernicus/track-record.json").then(r => r.json()).then(d => {
      if (!ok) return
      try {
        if (!d || !d.byRegime) { setProof(null); return }
        const ent = Object.entries(d.byRegime).filter(([, x]) => x && x.cleanSamples >= 20 && x.cleanReliabilityPct).sort((a, b) => b[1].cleanSamples - a[1].cleanSamples)[0]
        const w = d.window || {}
        const win = (w.days || w.rollingDays) ? { days: w.days || w.rollingDays } : (w.from && w.to ? { range: w.from + " → " + w.to } : null)
        if (!ent || !win) { setProof(null); return } // pas de fenêtre datée → pas de claim
        setProof({ pct: Math.round(ent[1].cleanReliabilityPct), n: ent[1].cleanSamples, calm: ent[0] === "calm", win })
      } catch (_) { setProof(null) }
    }).catch(() => {})
    return () => { ok = false }
  }, [])

  // ── Deep-link (co-brand porté par l'URL du kiosk, attribution via utm) ──
  const loc = (() => { try { return window.location } catch (_) { return { origin: "", host: "sargasses.com" } } })()
  const deepLink = useMemo(() => {
    const base = (loc.origin || "") + "/?utm_source=lobby&utm_medium=qr"
    return partner ? base + "&utm_campaign=" + encodeURIComponent(partner) : base
  }, [loc.origin, partner])
  const partnerName = useMemo(() => partner ? String(partner).replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : null, [partner])
  const qrAria = t("Scannez pour votre plage", "Scan for your beach", "Escanea para tu playa")

  // ── Construction des scènes (skips honnêtes) ──
  const scenes = useMemo(() => {
    const list = []
    if (pick) list.push({ id: "s1_verdict", dur: 6 })
    if (pick && forecast) list.push({ id: "s2_semaine", dur: 6 })
    list.push({ id: "s3_granularite", dur: 5 })
    if (proof) list.push({ id: "s4_registre", dur: 7 })
    list.push({ id: "s5_offre", dur: 6 })
    return list
  }, [pick, forecast, proof])
  const nScenes = scenes.length

  // ── PRÊT : on attend que la plage vedette soit résolue (données async) pour
  //    DÉMARRER la boucle sur la scène-hameçon (s1), pas au milieu. Grâce 2,5 s :
  //    si les données ne viennent pas, on démarre quand même avec ce qu'on a. ──
  const [grace, setGrace] = useState(false)
  useEffect(() => { const id = setTimeout(() => setGrace(true), 2500); return () => clearTimeout(id) }, [])
  const ready = (pick != null) || grace

  // ── Moteur de boucle : setTimeout chaîné (ZÉRO rAF), gel visibilitychange ──
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const advTimer = useRef(null)
  const pauseTimer = useRef(null)

  useEffect(() => {
    // Interactif + reduced-motion : plancher a11y = 1 frame STATIQUE (s1), pas d'auto-avance.
    if (paused || frozen || !ready || nScenes === 0 || (interactive && reduce)) return
    const cur = scenes[idx % nScenes] || scenes[0]
    advTimer.current = setTimeout(() => setIdx(i => (i + 1) % nScenes), (cur.dur || 6) * 1000)
    return () => clearTimeout(advTimer.current)
  }, [idx, paused, frozen, ready, nScenes]) // eslint-disable-line

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { if (advTimer.current) clearTimeout(advTimer.current); setFrozen(true) }
      else setFrozen(false)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  // Analytics : impression display (1×) — volume FAIBLE assumé (rétention B2B)
  useEffect(() => { try { track && track("sg_attract_view", { src, partner: partner || "" }) } catch (_) {} }, []) // eslint-disable-line

  const goToApp = useCallback(() => {
    try { track && track("sg_attract_share", { src, partner: partner || "" }) } catch (_) {}
    try { window.location.href = deepLink } catch (_) {}
  }, [deepLink, src, partner, track])

  // Mode interactif : capture le 1er geste — dissout le reel via un wipe doré ~430 ms (une
  // seule fois, suppr. sous reduced-motion) puis rend la main au funnel vivant sur la MÊME
  // plage. JAMAIS window.location.href : un reload effacerait la fiche et atterrirait sur un
  // home froid (= cul-de-sac). enteringRef : anti double-tir (tap + wheel).
  const enterFunnel = useCallback(() => {
    if (enteringRef.current) return
    enteringRef.current = true
    try { track && track("sg_attract_tap", { src, scene: (scenes[idx % nScenes] || {}).id }) } catch (_) {}
    if (reduce) { try { onEnterFunnel && onEnterFunnel(pick) } catch (_) {}; return }
    setWiping(true)
    setTimeout(() => { try { onEnterFunnel && onEnterFunnel(pick) } catch (_) {} }, 430)
  }, [reduce, onEnterFunnel, pick, src, scenes, idx, nScenes, track])

  const onTap = useCallback(() => {
    if (src === "interactive") { enterFunnel(); return } // in-app : dissout → funnel (pas de reload, track dans enterFunnel)
    try { track && track("sg_attract_tap", { src, partner: partner || "", scene: (scenes[idx % nScenes] || {}).id }) } catch (_) {}
    if (src === "share") { goToApp(); return } // display passif → funnel actif
    // Kiosk : pause tactile ~18 s (comptoir), puis reprise
    setPaused(true)
    if (pauseTimer.current) clearTimeout(pauseTimer.current)
    pauseTimer.current = setTimeout(() => setPaused(false), 18000)
  }, [src, partner, idx, nScenes, scenes, goToApp, enterFunnel, track])

  // Sorties : ✕ / Échap / swipe-down (kiosk = URL dédiée ; tap = pause, pas close)
  const close = useCallback(() => { try { onClose && onClose() } catch (_) {} }, [onClose])
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") close() }
    document.addEventListener("keydown", onKey)
    try { document.body.style.overflow = "hidden" } catch (_) {}
    return () => { document.removeEventListener("keydown", onKey); try { document.body.style.overflow = "" } catch (_) {}; if (pauseTimer.current) clearTimeout(pauseTimer.current) }
  }, [close])
  const sw = useSwipeClose(close, { threshold: 90 })

  const stLabel = s => t(
    s === "clean" ? "propre" : s === "moderate" || s === "watch" ? "à surveiller" : s === "heavy" || s === "high" || s === "red" ? "chargée" : "—",
    s === "clean" ? "clear" : s === "moderate" || s === "watch" ? "watch" : s === "heavy" || s === "high" || s === "red" ? "heavy" : "—",
    s === "clean" ? "limpia" : s === "moderate" || s === "watch" ? "atención" : s === "heavy" || s === "high" || s === "red" ? "cargada" : "—")
  const dayLabel = ds => { try { const d = new Date(ds); if (isNaN(d)) return ""; return d.toLocaleDateString(lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR", { weekday: "short" }).replace(".", "") } catch (_) { return "" } }

  const cur = scenes[idx % nScenes] || scenes[0] || { id: "s5_offre" }

  // ── Rendu d'une scène ──
  const renderScene = (id) => {
    switch (id) {
      case "s1_verdict":
        return (
          <div className="sgd-scene sgd-photo">
            {pick._img
              ? <div className={"sgd-bg " + (reduce ? "" : "sgd-kb")} style={{ backgroundImage: `url("${pick._img}")` }} />
              : <div className="sgd-bg sgd-goldbg" />}
            <div className="sgd-scrim" />
            <div className="sgd-corner"><Veilleur size={54} /></div>
            <div className="sgd-body">
              <div className="sgd-chip">
                <span className="sgd-dot" style={{ background: stColor(pick.status) }} />
                <b>{pick.name}</b>
                <span className="sgd-chip-st">· {stLabel(pick.status)}</span>
              </div>
              <h1 className="sgd-h1">
                {pick._isClean
                  ? t(`${cap(freshLabel)}, ${pick.name} est propre.`, `${cap(freshLabel)}, ${pick.name} is clear.`, `${cap(freshLabel)}, ${pick.name} está limpia.`)
                  : t(`${cap(freshLabel)}, on surveille ${pick.name} pour vous.`, `${cap(freshLabel)}, we're watching ${pick.name} for you.`, `${cap(freshLabel)}, vigilamos ${pick.name} por ti.`)}
              </h1>
              <p className="sgd-tag">{t("Mesuré au satellite, pas deviné.", "Measured by satellite, not guessed.", "Medido por satélite, no adivinado.")}</p>
            </div>
          </div>
        )
      case "s2_semaine":
        return (
          <div className="sgd-scene sgd-photo">
            {pick._img
              ? <div className="sgd-bg sgd-back" style={{ backgroundImage: `url("${pick._img}")` }} />
              : <div className="sgd-bg sgd-goldbg sgd-back" />}
            <div className="sgd-scrim" />
            <div className="sgd-body">
              <h2 className="sgd-h2">{t("Et les 7 prochains jours ?", "And the next 7 days?", "¿Y los próximos 7 días?")}</h2>
              <div className="sgd-week" role="img" aria-label={t("Prévision 7 jours", "7-day forecast", "Pronóstico 7 días")}>
                {(forecast || []).map((d, i) => (
                  <div className="sgd-day" key={i}>
                    <span className="sgd-day-lbl">{dayLabel(d.date)}</span>
                    <span className="sgd-day-pill" style={{ background: stColor(d.st) }} />
                    <span className="sgd-day-conf">{stLabel(d.st)}</span>
                  </div>
                ))}
              </div>
              <p className="sgd-tag">{t("On vous les montre. Le verdict du jour est toujours gratuit.", "We show you. Today's verdict is always free.", "Te los mostramos. El veredicto de hoy siempre es gratis.")}</p>
            </div>
          </div>
        )
      case "s3_granularite": {
        // Mosaïque anonyme des statuts réels (aucun nom de plage, aucune photo d'algues)
        const dist = (allBeaches || []).filter(b => b && b.status).slice(0, 48)
        const avg = dist.length ? stColor(mode(dist.map(b => b.status))) : "#1c7fb0"
        return (
          <div className="sgd-scene sgd-split">
            <div className="sgd-split-row">
              <div className="sgd-half">
                <div className="sgd-lbl">{t("Une moyenne d'île", "An island average", "Un promedio de isla")}</div>
                <svg viewBox="0 0 100 120" className="sgd-isle" aria-hidden="true"><path d="M50 6 C74 10 92 34 88 64 C84 96 66 114 50 114 C34 114 16 96 12 64 C8 34 26 10 50 6Z" fill={avg} opacity=".6" /></svg>
                <div className="sgd-lbl sgd-mut">{t("flou", "blurry", "borroso")}</div>
              </div>
              <div className="sgd-half">
                <div className="sgd-lbl" style={{ color: GOLD }}>{t("Nous, plage par plage", "Us, beach by beach", "Nosotros, playa por playa")}</div>
                <svg viewBox="0 0 100 120" className="sgd-isle" aria-hidden="true">
                  <defs><clipPath id="sgdIsle"><path d="M50 6 C74 10 92 34 88 64 C84 96 66 114 50 114 C34 114 16 96 12 64 C8 34 26 10 50 6Z" /></clipPath></defs>
                  <g clipPath="url(#sgdIsle)">{dist.map((b, i) => (<circle key={i} cx={12 + (i % 8) * 11} cy={12 + Math.floor(i / 8) * 15} r="4.6" fill={stColor(b.status)} />))}</g>
                  <path d="M50 6 C74 10 92 34 88 64 C84 96 66 114 50 114 C34 114 16 96 12 64 C8 34 26 10 50 6Z" fill="none" stroke={INK} strokeWidth="2.5" />
                </svg>
                <div className="sgd-lbl" style={{ color: GOLD }}>{t("net", "sharp", "nítido")}</div>
              </div>
            </div>
            <p className="sgd-tag sgd-tag-pain">{t("Personne n'aime découvrir les algues une fois la serviette posée.", "Nobody likes finding the seaweed once the towel is down.", "A nadie le gusta descubrir el sargazo con la toalla puesta.")}</p>
          </div>
        )
      }
      case "s4_registre":
        return (
          <div className="sgd-scene sgd-registre">
            <div className="sgd-stamp">{t("REGISTRE PUBLIC", "PUBLIC RECORD", "REGISTRO PÚBLICO")}</div>
            <h2 className="sgd-h2" style={{ color: PAPER }}>{t("On publie nos erreurs.", "We publish our misses.", "Publicamos nuestros errores.")}</h2>
            <div className="sgd-floor">{t("76 % à 79 % de justesse", "76% to 79% accurate", "76 % a 79 % de acierto")}</div>
            <div className="sgd-floor-sub">{t("selon la saison, tous régimes confondus", "depending on season, across all regimes", "según la temporada, en todos los regímenes")}</div>
            <p className="sgd-proof">{(() => {
              const win = proof.win.days
                ? t(`sur les ${proof.win.days} derniers jours`, `over the last ${proof.win.days} days`, `en los últimos ${proof.win.days} días`)
                : proof.win.range
              return t(
                `${proof.pct} % de nos prévisions « mer propre » vérifiées${proof.calm ? " en saison calme" : ""} ${win} (${proof.n} comparaisons) · faible confiance sur les rares alertes.`,
                `${proof.pct}% of our clean-water forecasts verified${proof.calm ? " in calm season" : ""} ${win} (${proof.n} checks) · low confidence on the rare alerts.`,
                `${proof.pct} % de nuestros pronósticos "agua limpia" verificados${proof.calm ? " en temporada tranquila" : ""} ${win} (${proof.n} comparaciones) · baja confianza en las raras alertas.`)
            })()}</p>
            <div className="sgd-reg-link">{t("Registre public", "Public record", "Registro público")} : {t("/fiabilite/", "/reliability/", "/fiabilidad/")}</div>
          </div>
        )
      case "s5_offre":
      default:
        return (
          <div className="sgd-scene sgd-offer">
            <div className="sgd-half sgd-offer-l">
              <Veilleur size={72} />
              <h1 className="sgd-h1" style={{ marginTop: 14 }}>{t("Devenez celui qui connaît la fin de l'histoire.", "Be the one who knows how the story ends.", "Sé quien conoce el final de la historia.")}</h1>
              <p className="sgd-sign">{t("Il regarde la mer, jamais vos clients.", "He watches the sea, never your guests.", "Mira el mar, nunca a tus clientes.")}</p>
            </div>
            <div className="sgd-half sgd-offer-r">
              {partnerName && (
                <div className="sgd-cobrand">
                  <span className="sgd-spons">{t("Offert par", "Courtesy of", "Cortesía de")}</span>
                  <b>{partnerName}</b>
                </div>
              )}
              <div className="sgd-qr"><QR text={deepLink} className="sgd-qr-svg" ariaLabel={qrAria} /></div>
              <div className="sgd-scan">{qrAria}</div>
              <div className="sgd-url">{loc.host || "sargasses.com"}</div>
            </div>
          </div>
        )
    }
  }

  return (
    <div
      className={"sgd-root sg-onink-scope" + (frozen ? " sgd-frozen" : "")}
      role="dialog" aria-modal="true" aria-label={t("Démonstration Le Veilleur", "Le Veilleur demo", "Demostración Le Veilleur")}
      ref={sw.ref} onTouchStart={sw.onTouchStart} onTouchMove={sw.onTouchMove} onTouchEnd={sw.onTouchEnd}
      onClick={onTap} onWheel={interactive ? enterFunnel : undefined}
    >
      <style>{`
        ${SEQ_STEP_CSS}
        .sgd-root{position:fixed;inset:0;z-index:4000;overflow:hidden;background:${INK};color:#fff;
          font-family:"Bricolage Grotesque",system-ui,sans-serif;-webkit-tap-highlight-color:transparent;cursor:pointer;user-select:none}
        .sgd-frozen *{animation-play-state:paused!important}
        .sgd-scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:max(24px,env(safe-area-inset-top)) 24px max(28px,env(safe-area-inset-bottom));box-sizing:border-box;text-align:center}
        @media (prefers-reduced-motion:no-preference){.sgd-scene{animation:sgdIn .4s ease both}}
        @keyframes sgdIn{from{opacity:0}to{opacity:1}}
        .sgd-bg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
        .sgd-goldbg{background:radial-gradient(120% 90% at 50% 8%,#ffd77a 0%,#ff9e5e 34%,#7e2f8e 74%,#241246 100%)}
        @media (prefers-reduced-motion:no-preference){.sgd-kb{animation:sgdKB 12s ease-in-out both}.sgd-back{animation:sgdBack .35s ease both}}
        @keyframes sgdKB{from{transform:scale(1.08)}to{transform:scale(1)}}
        @keyframes sgdBack{from{transform:scale(1)}to{transform:scale(.92)}}
        .sgd-back{transform:scale(.92)}
        .sgd-scrim{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(9,7,20,.15) 0%,rgba(9,7,20,.35) 45%,rgba(9,7,20,.82) 100%)}
        .sgd-corner{position:absolute;top:max(18px,env(safe-area-inset-top));left:18px;z-index:3}
        .sgd-body{position:relative;z-index:2;max-width:760px;display:flex;flex-direction:column;align-items:center;gap:14px}
        .sgd-chip{display:inline-flex;align-items:center;gap:8px;background:${PAPER};color:${INK};border:2.5px solid ${INK};
          box-shadow:3px 3px 0 ${INK};border-radius:999px;padding:7px 15px;font-size:clamp(13px,2.4vw,16px);font-weight:700}
        .sgd-chip b{font-weight:800}.sgd-chip-st{font-weight:600;opacity:.72}
        .sgd-dot{width:11px;height:11px;border-radius:50%;border:2px solid ${INK};box-sizing:border-box}
        .sgd-h1{margin:0;font-family:"Anton","Arial Black",Impact,sans-serif;font-weight:400;text-transform:uppercase;
          font-size:clamp(30px,6.4vw,62px);line-height:.94;letter-spacing:-.5px;color:#fff;
          text-shadow:0 2px 0 rgba(0,0,0,.35),0 0 34px rgba(255,150,90,.5)}
        .sgd-h2{margin:0;font-family:"Anton","Arial Black",Impact,sans-serif;font-weight:400;text-transform:uppercase;
          font-size:clamp(24px,5vw,44px);line-height:.98;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.35)}
        .sgd-tag{margin:0;font-size:clamp(13px,2.6vw,19px);font-weight:600;color:#ffe0bf;letter-spacing:.2px}
        .sgd-tag-pain{max-width:620px;color:#fff;padding:0 8px;margin-top:6px}
        /* s2 semaine */
        .sgd-week{display:flex;gap:clamp(6px,1.6vw,14px);flex-wrap:nowrap;justify-content:center}
        .sgd-day{display:flex;flex-direction:column;align-items:center;gap:5px;background:rgba(253,246,227,.94);color:${INK};
          border:2.5px solid ${INK};box-shadow:2px 2px 0 ${INK};border-radius:12px;padding:8px clamp(6px,1.4vw,11px);min-width:44px}
        .sgd-day-lbl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.3px}
        .sgd-day-pill{width:22px;height:22px;border-radius:6px;border:2px solid ${INK}}
        .sgd-day-conf{font-size:10px;font-weight:700}
        /* s3 split */
        .sgd-split{flex-direction:column;gap:clamp(16px,4vw,28px);justify-content:center}
        .sgd-split-row{display:flex;flex-direction:row;gap:clamp(14px,5vw,60px);align-items:center;justify-content:center}
        .sgd-half{display:flex;flex-direction:column;align-items:center;gap:10px}
        .sgd-isle{width:clamp(96px,26vw,180px);height:auto}
        .sgd-lbl{font-weight:800;font-size:clamp(13px,2.6vw,18px);text-transform:uppercase;letter-spacing:.4px;color:#fff}
        .sgd-mut{opacity:.55;font-weight:600}
        /* s4 registre */
        .sgd-registre{background:radial-gradient(120% 100% at 50% 0%,#12233a 0%,#0a1620 70%,#070d15 100%);gap:10px}
        .sgd-stamp{border:3px solid ${GOLD};color:${GOLD};border-radius:8px;padding:4px 12px;font-weight:800;letter-spacing:2px;
          font-size:clamp(11px,2.2vw,14px);transform:rotate(-3deg);opacity:.9}
        .sgd-floor{font-family:"Anton",sans-serif;font-weight:400;color:${GOLD};font-size:clamp(34px,8vw,72px);line-height:1;margin-top:6px}
        .sgd-floor-sub{color:#cfe0f0;font-size:clamp(12px,2.6vw,18px);font-weight:600}
        .sgd-proof{max-width:640px;margin:10px 0 0;color:#e8f0f8;font-size:clamp(12px,2.5vw,17px);font-weight:600;line-height:1.4}
        .sgd-reg-link{margin-top:8px;color:${GOLD};font-weight:800;font-size:clamp(12px,2.4vw,16px);letter-spacing:.3px}
        /* s5 offre */
        .sgd-offer{flex-direction:column;gap:22px;background:radial-gradient(120% 100% at 50% 0%,#ffd77a 0%,#ffb84d 30%,#b25a2e 72%,#3a1c22 100%)}
        .sgd-offer-l{max-width:620px}
        .sgd-offer .sgd-h1{color:${INK};text-shadow:0 2px 0 rgba(255,255,255,.25)}
        .sgd-sign{margin:2px 0 0;font-style:italic;font-weight:700;color:#3a1c12;font-size:clamp(13px,2.6vw,19px)}
        .sgd-offer-r{gap:8px}
        .sgd-qr{background:#fff;border:4px solid ${INK};box-shadow:5px 5px 0 rgba(0,0,0,.4);border-radius:14px;padding:10px;line-height:0}
        .sgd-qr-svg{width:clamp(150px,34vw,240px);height:auto;display:block}
        .sgd-scan{font-weight:800;color:${INK};font-size:clamp(14px,2.8vw,20px);text-transform:uppercase;letter-spacing:.4px}
        .sgd-url{font-weight:700;color:#4a2418;font-size:clamp(12px,2.4vw,16px)}
        .sgd-cobrand{display:flex;flex-direction:column;align-items:center;gap:1px;margin-bottom:2px}
        .sgd-cobrand .sgd-spons{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#5a3018;opacity:.8}
        .sgd-cobrand b{color:${INK};font-size:clamp(14px,2.8vw,20px);font-weight:800}
        /* filigrane QR persistant (capte un scan à tout moment) */
        .sgd-wm{position:absolute;right:16px;bottom:max(58px,calc(env(safe-area-inset-bottom) + 50px));z-index:6;
          background:#fff;border:2.5px solid ${INK};box-shadow:2px 2px 0 rgba(0,0,0,.35);border-radius:10px;padding:6px;line-height:0}
        .sgd-wm-svg{width:74px;height:74px;display:block}
        .sgd-wm-cap{position:absolute;right:16px;bottom:max(40px,calc(env(safe-area-inset-bottom) + 32px));z-index:6;
          font-size:9px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-shadow:0 1px 3px rgba(0,0,0,.6)}
        /* progression + fermeture */
        .sgd-dots{position:absolute;left:0;right:0;bottom:max(20px,env(safe-area-inset-bottom));z-index:6;display:flex;justify-content:center}
        .sgd-close{position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;z-index:7;width:44px;height:44px;border-radius:50%;
          display:grid;place-items:center;background:rgba(13,7,22,.42);border:1px solid rgba(255,255,255,.35);color:#fff;
          font-size:22px;line-height:1;cursor:pointer;backdrop-filter:blur(6px)}
        .sgd-paused{position:absolute;top:max(14px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:7;
          background:rgba(13,7,22,.5);color:#fff;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800;letter-spacing:.5px;backdrop-filter:blur(6px)}
        @media (orientation:landscape) and (min-width:760px){
          .sgd-offer{flex-direction:row;gap:clamp(32px,7vw,90px);text-align:left}
          .sgd-offer-l{align-items:flex-start;text-align:left}
        }
        @media (max-width:520px){.sgd-split{gap:14px}.sgd-day{min-width:40px;padding:7px 5px}}
        /* capture-wipe doré (mode interactif) — finie, one-shot, inerte sous reduced-motion */
        .sgd-wipe{position:absolute;inset:0;z-index:20;pointer-events:none;
          background:radial-gradient(circle at 50% 50%,${GOLD} 0%,${GOLD} 55%,#ffb84d 100%);
          clip-path:circle(0% at 50% 50%)}
        @media (prefers-reduced-motion:no-preference){.sgd-wipe{animation:sgdWipe .43s cubic-bezier(.4,0,.2,1) forwards}}
        @keyframes sgdWipe{to{clip-path:circle(150% at 50% 50%)}}
      `}</style>

      {ready ? renderScene(cur.id) : (
        <div className="sgd-scene sgd-offer">
          <Veilleur size={84} />
          <p className="sgd-tag" style={{ color: "#3a1c12", marginTop: 16 }}>{t("Mesuré au satellite, pas deviné.", "Measured by satellite, not guessed.", "Medido por satélite, no adivinado.")}</p>
        </div>
      )}

      {/* Filigrane QR persistant (sauf sur s5 qui a déjà le grand QR) */}
      {(!ready || cur.id !== "s5_offre") && (
        <>
          <div className="sgd-wm" aria-hidden="true"><QR text={deepLink} className="sgd-wm-svg" ariaLabel={qrAria} /></div>
          <div className="sgd-wm-cap">{t("scannez", "scan", "escanea")} ↗</div>
        </>
      )}

      {ready && <div className="sgd-dots"><SeqDots n={nScenes} at={(idx % nScenes) + 1} ink={"#fff"} gold={GOLD} /></div>}

      {paused && <div className="sgd-paused">{t("EN PAUSE", "PAUSED", "EN PAUSA")}</div>}

      {/* Capture-wipe doré (interactif) : révèle l'app réelle, n'invente rien. One-shot,
          jamais en boucle, inerte sous reduced-motion (clip-path figé à circle(0)). */}
      {wiping && <div className="sgd-wipe" aria-hidden="true" />}

      <button className="sgd-close" onClick={(e) => { e.stopPropagation(); close() }} aria-label={t("Fermer", "Close", "Cerrar")}>×</button>
    </div>
  )
}

// util : capitalise la 1re lettre d'une phrase
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }
// util : valeur la plus fréquente (mode) d'un tableau
function mode(arr) { const m = {}; let best = arr[0], bc = 0; for (const v of arr) { m[v] = (m[v] || 0) + 1; if (m[v] > bc) { bc = m[v]; best = v } } return best }
