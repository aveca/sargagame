/**
 * BeachExperience — « PLACE EXPERIENCE » (WOW TAKEOVER 2026-09-23).
 *
 * Remplace la fiche froide par un parcours de découverte en REVEALS :
 *   VISUAL → VERDICT → WHY → TOMORROW → BACKUP → TRIP → SHARE → PREMIUM
 * 100 % données réelles (mêmes lookups que la fiche : weekly[sid] + _interp,
 * findAlternatives) — jamais d'invention. Rollback : ?sgexp=0 (fiches legacy).
 *
 * Props (valeurs, PAS d'import Sargasses_PROD — pas de cycle) :
 *   { lang, beach, sargData, allBeaches, userPos, islandId, isNewRegion,
 *     BEACH_TO_SARG, isPremium, onClose, onOpenBeach, onPremium, onPlanTrip, track }
 */
import React, { useEffect, useMemo, useRef, useState } from "react"
import { findAlternatives } from "./lib/beach-decision.js"
import { beachPageUrl } from "./lib/slug-resolver.js"
import { nearestBeaches, dataAgeHours, visOff } from "./lib/sg-visual.js"
import { tipsFor, sourceShort } from "./lib/intent-evidence.js"
import { fetchMarine, marineState, snorkelSea, marineSourceLabel } from "./lib/marine.js"
import { off as sgmOff } from "./lib/sgMotion.js"
import { Icon } from "./lib/sg-icons.jsx"
import ComicIcon from "./components/ComicIcons.jsx"
import { VeilleurMark } from "./PremiumModal/VeilleurMark.jsx"

const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)

const VERDICT = {
  clean: { c: "#22C55E", bg: "rgba(34,197,94,.14)", glyph: "✓",
    go: ["On y va", "Go", "Vamos"], why: ["Baignade sereine aujourd'hui.", "Calm swim today.", "Baño tranquilo hoy."] },
  moderate: { c: "#B87A00", bg: "rgba(184,122,0,.14)", glyph: "◐",
    go: ["Prudence", "Caution", "Cuidado"], why: ["À surveiller — vérifie avant d'y aller.", "Worth checking before you go.", "Vigila antes de ir."] },
  avoid: { c: "#E8522A", bg: "rgba(232,82,42,.13)", glyph: "✕",
    go: ["On évite", "Avoid", "Evitar"], why: ["Les sargasses sont là — vise le plan B.", "Sargassum is here — go for plan B.", "Hay sargazo — ve al plan B."] },
}
const vOf = (s) => VERDICT[s] || VERDICT.moderate
const DOT = { clean: "#22C55E", moderate: "#B87A00", alert: "#E8522A" }
const DAYL = ["D", "L", "M", "M", "J", "V", "S"]

// Scène paramétrique par statut : même grammaire golden-hour (ciel/mer/soleil/sable),
// atmosphère pilotée par le verdict (données → visuel, jamais l'inverse).
function Scene({ status, island }) {
  const pal = status === "clean"
    ? { sky: ["#0B2230", "#155A5A", "#C97E3A", "#F2B05E"], sea: ["#1A5852", "#08251F"], sun: 1, haze: 0 }
    : status === "avoid"
    ? { sky: ["#1A1030", "#3A2A4A", "#7A4A3A", "#C97E3A"], sea: ["#14302E", "#0A1F1E"], sun: 0.45, haze: 1 }
    : { sky: ["#0B2230", "#2A5A55", "#D89E4A", "#F2C05E"], sea: ["#1A5852", "#0A2622"], sun: 0.8, haze: 0.4 }
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="bx-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.sky[0]} /><stop offset=".45" stopColor={pal.sky[1]} />
          <stop offset=".72" stopColor={pal.sky[2]} /><stop offset=".86" stopColor={pal.sky[3]} />
        </linearGradient>
        <linearGradient id="bx-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.sea[0]} /><stop offset="1" stopColor={pal.sea[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="208" fill="url(#bx-sky)" />
      <circle cx="200" cy="150" r="44" fill="#FFD884" opacity={pal.sun} />
      <circle cx="200" cy="150" r="60" fill="#FFD884" opacity={pal.sun * 0.25} />
      {pal.haze > 0 && <rect width="400" height="208" fill="#8A6A4A" opacity={pal.haze * 0.25} />}
      {/* île lointaine (FAR) + palmier (MID) */}
      <path d="M0 168 Q 80 150 150 166 T 400 162 V208 H0 Z" fill="#1C2A22" opacity=".85" />
      <g stroke="#0D0B14" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M52 168 Q 56 130 48 108" />
        <path d="M48 108 Q 30 100 22 108 M48 108 Q 48 92 40 86 M48 108 Q 62 98 70 104 M48 108 Q 58 116 66 114" strokeWidth="4" />
      </g>
      <rect y="168" width="400" height="40" fill="url(#bx-sea)" />
      <path d="M0 180 Q 25 174 50 180 T 100 180 T 150 180 T 200 180 T 250 180 T 300 180 T 350 180 T 400 180"
        stroke="rgba(255,255,255,.35)" strokeWidth="2" fill="none" />
      <path d="M0 192 Q 30 186 60 192 T 120 192 T 180 192 T 240 192 T 300 192 T 360 192 T 420 192"
        stroke="rgba(255,255,255,.18)" strokeWidth="2" fill="none" />
      {/* sargasses (NEAR) si avoid */}
      {status === "avoid" && (
        <g fill="#4A3A1A" opacity=".9">
          <ellipse cx="90" cy="196" rx="26" ry="6" /><ellipse cx="310" cy="200" rx="32" ry="7" />
          <ellipse cx="200" cy="190" rx="20" ry="5" />
        </g>
      )}
      <rect y="208" width="400" height="32" fill="#C9A86A" />
      <rect y="208" width="400" height="5" fill="#FFD884" opacity=".7" />
    </svg>
  )
}

/* ── ExpMedia — AHA LAYER (2026-09-23) : la VRAIE plage derrière la scène.
   Étages (zéro trou, jamais d'invention) : la scène SVG peint instantanément
   (et reste la vérité data-driven) → la vraie photo `/beaches/gplace-{id}.jpg`
   fond en fondu au load, disparaît si 404 → le hero-loop `/videos/hero/{id}.mp4`
   (garde-fous : reduced-motion, saveData, 2G, rollback ?aha=0 / ?heropv=0,
   variante `-w` desktop via manifest, 404 → la photo reste).
   L'atmosphère SUIT le verdict (filtre CSS = données → visuel) ; le verdict
   lui-même reste DOM. Régions sans média (ex. tulum) = scène SVG seule. */
function ExpMedia({ beachId, status, trk }) {
  const [photoOk, setPhotoOk] = useState(true)
  const [photoOn, setPhotoOn] = useState(false)
  const [vidSrc, setVidSrc] = useState(null)
  const [vidOn, setVidOn] = useState(false)
  const off = useMemo(() => {
    try { return /[?&](aha|heropv)=0/.test(window.location.search) } catch (_) { return false }
  }, [])
  useEffect(() => {
    if (off) return
    let allow = true, dead = false
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) allow = false
      const c = navigator.connection
      if (c && (c.saveData || /(^|-)2g/.test(c.effectiveType || ""))) allow = false
    } catch (_) {}
    if (!allow) return
    fetch("/videos/hero/manifest.json")
      .then(r => (r.ok ? r.json() : null))
      .then(m => {
        if (dead || !m || !Array.isArray(m.ids) || !m.ids.includes(beachId)) return
        const wide = !!(window.matchMedia && window.matchMedia("(min-width:900px)").matches
          && Array.isArray(m.wide) && m.wide.includes(beachId))
        setVidSrc(`/videos/hero/${beachId}${wide ? "-w" : ""}.mp4`)
      })
      .catch(() => {})
    return () => { dead = true }
  }, [beachId, off])
  if (off) return null
  const filter = status === "avoid" ? "saturate(.55) brightness(.8) contrast(1.05)"
    : status === "moderate" ? "saturate(.9) brightness(.96)" : "none"
  return (
    <>
      {photoOk && (
        <img src={`/beaches/gplace-${beachId}.jpg`} alt="" aria-hidden="true" fetchpriority="high"
          className="bx-media bx-media-img" style={{ filter, opacity: photoOn ? 1 : 0 }}
          onLoad={() => setPhotoOn(true)} onError={() => setPhotoOk(false)} />
      )}
      {vidSrc && (
        <video src={vidSrc} autoPlay muted loop playsInline preload="none" aria-hidden="true"
          className="bx-media" style={{ filter, opacity: vidOn ? 1 : 0 }}
          onPlaying={() => { setVidOn(true); trk && trk("sg_hero_video_view", { via: "experience" }) }}
          onError={() => setVidSrc(null)} />
      )}
      {/* scrim lisibilité (contrôles haut + encart bas) + glow verdict (donnée → lumière) */}
      <div aria-hidden="true" className="bx-media-scrim" />
      <div aria-hidden="true" className="bx-media-glow" />
    </>
  )
}

function Reveal({ id, kicker, title, open, onToggle, children, accent }) {
  return (
    <section id={id} className="bx-sec">
      <button type="button" onClick={onToggle} aria-expanded={!!open}
        className="bx-reveal-btn" style={{ borderColor: open ? accent : undefined }}>
        <span>
          <span className="bx-kicker">{kicker}</span>
          <span className="bx-reveal-name">{title}</span>
        </span>
        <span className="bx-chev" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}>↓</span>
      </button>
      {open && <div className="bx-reveal-body">{children}</div>}
    </section>
  )
}

export default function BeachExperience({
  lang = "fr", beach, sargData, allBeaches = [], userPos = null,
  BEACH_TO_SARG = {}, isNewRegion = false,
  isPremium = false, onClose, onOpenBeach, onPremium, onPlanTrip, track,
  /* 2026-09-25E : imageMap optionnel (catalogue réel) pour les cartes
     proximité. Absent → cartes texte (jamais de stock). */
  imageMap = null,
  /* WOW JOURNEY (2026-09-24) — spine « séjour » partagée (src/lib/journey.js,
     calculée par Sargasses_PROD). stay = {days:[{i,label,date,status,
     confidence,locked}], backup:{...,beach}|null, critDay} ; stayPrev = plage
     quittée (pile in-world de la session). Tout est OPTIONNEL : absent → le
     rail et le geste bord ne s'installent même pas (?sgjourney=0 côté parent). */
  stay = null, stayPrev = null, onStayBack = null,
}) {
  const [whyOpen, setWhyOpen] = useState(false)
  const [tmrOpen, setTmrOpen] = useState(false)
  const [bakOpen, setBakOpen] = useState(false)
  const [savOpen, setSavOpen] = useState(false)
  const [proxOpen, setProxOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(false)
  /* MER TEMPS RÉEL (2026-09-25F) : fetch paresseux à l'ouverture (1 plage =
     1 appel Open-Meteo marine, cache 30 min). Jamais au mount (saveData par
     défaut respecté : seul le geste utilisateur déclenche). */
  const [merOpen, setMerOpen] = useState(false)
  const [marine, setMarine] = useState(null)
  const [marineLoading, setMarineLoading] = useState(false)
  const [shared, setShared] = useState(false)
  const rootRef = useRef(null)
  const edgeSwipeRef = useRef(null)

  // Geste/souris : edge-swipe droite (≤ 28 px du bord gauche, ≥ 72 px) =
  // « retour » natif du monde — plage précédente si pile, sinon sortir.
  // Jamais de preventDefault : le scroll vertical/horizontal reste intact.
  const onEdgeStart = (e) => {
    try {
      if (!stay) { edgeSwipeRef.current = null; return }
      const t = e.touches && e.touches[0]
      if (!t || t.clientX > 28) { edgeSwipeRef.current = null; return }
      edgeSwipeRef.current = { x: t.clientX, y: t.clientY }
    } catch (_) { edgeSwipeRef.current = null }
  }
  const onEdgeEnd = (e) => {
    const s = edgeSwipeRef.current
    edgeSwipeRef.current = null
    try {
      if (!s || !stay) return
      const t = e.changedTouches && e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - s.x, dy = t.clientY - s.y
      if (dx >= 72 && Math.abs(dy) < 48) {
        try { track && track("sg_exp_swipeback", { beach_id: beach && beach.id, hadPrev: !!stayPrev }) } catch (_) {}
        if (stayPrev && onStayBack) onStayBack()
        else if (onClose) onClose()
      }
    } catch (_) {}
  }
  // Desktop : ← = retour in-world (même geste, clavier). Zéro effet hors journey.
  useEffect(() => {
    if (!stay) return
    const h = (e) => {
      try {
        const t = e.target
        if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return
      } catch (_) {}
      if (e.key === "ArrowLeft" && stayPrev && onStayBack) {
        try { track && track("sg_exp_back_tap", { via: "kbd", beach_id: beach && beach.id }) } catch (_) {}
        onStayBack()
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!stay, !!stayPrev])

  if (!beach) return null
  const L = (fr, en, es) => _t(lang, fr, en, es)
  const v = vOf(beach.status)

  const fc = useMemo(() => {
    try {
      const sid = isNewRegion ? beach.id : BEACH_TO_SARG[beach.id]
      const w = (sid && sargData && sargData.weekly && sargData.weekly[sid])
        || (sargData && sargData._enrichedWeekly && sargData._enrichedWeekly["_interp_" + beach.id])
      const f = w && w.forecast
      return Array.isArray(f) && f.length ? f.slice(0, 7) : []
    } catch (_) { return [] }
  }, [beach, sargData])

  const alts = useMemo(() => {
    try { return findAlternatives(beach, allBeaches || [], { lang, maxAlternatives: 3 }) || [] }
    catch (_) { return [] }
  }, [beach, allBeaches])
  const backup = alts.find(a => (a.beach.status === "clean")) || alts[0] || null

  const tmr = fc[1] || null
  const tmrMeta = tmr ? (vOf(tmr.status === "alert" ? "avoid" : tmr.status)) : null
  const conf = fc[0] && fc[0].confidence != null ? fc[0].confidence : null

  const trk = (n, p) => { try { track && track(n, { beach_id: beach.id, ...(p || {}) }) } catch (_) {} }
  const goTomorrow = () => { setTmrOpen(o => { if (!o) { trk("sg_forecast_view", { via: "experience" }); trk("sg_tomorrow_reveal", {}) } return !o }) }
  const goBackup = () => { setBakOpen(o => { if (!o) trk("sg_alternative_reveal", {}); return !o }) }
  const goWhy = () => { setWhyOpen(o => { if (!o) trk("sg_verdict_expand", { via: "experience" }); return !o }) }
  const goSav = () => { setSavOpen(o => { if (!o) trk("sg_verdict_expand", { via: "savoir" }); return !o }) }
  const goProx = () => { setProxOpen(o => { if (!o) trk("sg_alternative_reveal", { via: "proximity" }); return !o }) }
  const goFaq = () => { setFaqOpen(o => { if (!o) trk("sg_verdict_expand", { via: "faq" }); return !o }) }
  const merFetchedRef = useRef(false)
  const goMer = () => {
    const next = !merOpen
    setMerOpen(next)
    if (!next) return
    trk("sg_verdict_expand", { via: "marine" })
    if (merFetchedRef.current || marine || !beach || beach.lat == null) return
    merFetchedRef.current = true
    setMarineLoading(true)
    fetchMarine(beach).then(m => { setMarine(m); setMarineLoading(false) })
  }

  // ── JOURNEY RAIL (2026-09-24) — téléportation DANS l'objet, jamais de page.
  //   chip jour 0   → retour au sommet (= l'identité de l'objet, la plage)
  //   chip J+n      → ouvre le reveal TOMORROW et s'y téléporte (scroll in-world)
  //   chip verrouillée → moment premium (J+3+, même règle que le TripPlanner)
  const _bhv = (() => { try { return (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" } catch (_) { return "smooth" } })()
  const goTop = () => { try { const el = rootRef.current; if (el) el.scrollTo({ top: 0, behavior: _bhv }) } catch (_) { try { rootRef.current.scrollTop = 0 } catch (_) {} } }
  const onDayChip = (d) => {
    trk("sg_exp_chip_tap", { via: "rail_day", day: d.i, locked: !!d.locked })
    if (d.locked) { onPremium && onPremium("experience_chip"); return }
    if (d.i === 0) { goTop(); return }
    if (!tmrOpen) goTomorrow()
    setTimeout(() => { try { const el = document.getElementById("bx-tomorrow"); el && el.scrollIntoView({ behavior: _bhv, block: "start" }) } catch (_) {} }, 90)
  }

  const doShare = async () => {
    let url = null
    try { url = beachPageUrl ? beachPageUrl(beach) : null } catch (_) {}
    // WOW JOURNEY (2026-09-24) : « j'envoie une décision de plage VIVANTE » —
    // le message porte aujourd'hui ET demain (données réelles fc[1], rien si
    // absent) ; l'URL canonique SEO reste inchangée (jamais de bris de lien).
    const _tmrBit = (tmr && tmrMeta)
      ? L(`, demain : ${tmrMeta.go[0].toLowerCase()}`, `, tomorrow: ${tmrMeta.go[1].toLowerCase()}`, `, mañana: ${tmrMeta.go[2].toLowerCase()}`)
      : ""
    const txt = L(
      `${beach.name} : ${v.go[0]} aujourd'hui${_tmrBit} (Sargagame — mesuré au satellite, pas deviné).`,
      `${beach.name}: ${v.go[1]} today${_tmrBit} (Sargagame — satellite-measured, not guessed).`,
      `${beach.name}: ${v.go[2]} hoy${_tmrBit} (Sargagame — medido por satélite).`)
    try {
      if (navigator.share) { await navigator.share(url ? { title: beach.name + " — Sargagame", text: txt, url } : { title: beach.name + " — Sargagame", text: txt }); }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url ? `${txt} ${url}` : txt); }
      else return
      setShared(true); trk("sg_share", { via: "experience" })
      setTimeout(() => setShared(false), 2600)
    } catch (_) { /* dismiss = no-op */ }
  }

  // Parallaxe pointeur (1 ref, zéro setState — pas de jank ; réduit = off).
  const onPar = (e) => {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const x = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 10
      const y = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 8
      el.style.setProperty("--bx-px", x.toFixed(2) + "px")
      el.style.setProperty("--bx-py", y.toFixed(2) + "px")
    } catch (_) {}
  }

  return (
    <div ref={rootRef} className="bx-root" role="dialog" aria-modal="true" aria-label={beach.name} data-testid="bx-experience"
      onMouseMove={onPar} onTouchStart={onEdgeStart} onTouchEnd={onEdgeEnd} style={{ "--bx-accent": v.c }}>
      <style>{`
        .bx-root{position:fixed;inset:0;z-index:1240;overflow-y:auto;overflow-x:hidden;background:#0B2230;color:#FFFDF6;font-family:'Bricolage Grotesque',system-ui,sans-serif;-webkit-overflow-scrolling:touch}
        .bx-root button{font-family:'Bricolage Grotesque',system-ui,sans-serif !important;text-shadow:none !important}
        .bx-root button *{text-shadow:none !important}
        .bx-hero{position:relative;min-height:88dvh;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden}
        .bx-scene{position:absolute;inset:0;transform:translate(var(--bx-px,0px),var(--bx-py,0px));transition:transform .25s ease-out}
        .bx-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 45%;pointer-events:none;transition:opacity .9s ease}
        .bx-media-scrim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(11,34,48,.38) 0%,rgba(11,34,48,0) 26%,rgba(11,34,48,0) 58%,rgba(11,34,48,.55) 100%)}
        .bx-media-glow{position:absolute;left:0;right:0;bottom:0;height:38%;pointer-events:none;background:radial-gradient(ellipse at 50% 100%,var(--bx-accent,#FFC72C) 0%,transparent 62%);opacity:.22}
        .bx-hero-top{position:absolute;top:calc(10px + env(safe-area-inset-top));left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;z-index:3}
        .bx-x{width:44px;height:44px;border-radius:50%;background:rgba(11,34,48,.7);border:1.5px solid rgba(255,255,255,.4);color:#fff;font-size:18px;cursor:pointer}
        .bx-live{font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff;background:rgba(11,34,48,.65);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:5px 11px}
        .bx-hero-card{position:relative;z-index:2;margin:0 12px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(253,246,227,.98) 0%,rgba(253,246,227,.92) 100%);color:#0D0B14;border:2.5px solid #0D0B14;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.35),5px 5px 0 rgba(0,0,0,.45);padding:20px 18px 18px;backdrop-filter:blur(8px)}
        .bx-dest{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(13,11,20,.5)}
        .bx-name{font-weight:800;font-size:clamp(28px,8vw,38px);line-height:1.02;margin:4px 0 12px;text-shadow:0 2px 8px rgba(0,0,0,.08)}
        .bx-verdict-wrap{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-bottom:4px}
        .bx-verdict{display:inline-flex;align-items:center;gap:10px;font-size:clamp(15px,4vw,18px);font-weight:800;border-radius:999px;padding:10px 20px;border:2.5px solid #0D0B14;box-shadow:0 4px 20px rgba(0,0,0,.25);transform-origin:center}
        .bx-verdict-glyph{display:inline-block;animation:bx-verdict-pop .4s cubic-bezier(.2,.8,.2,1) backwards}
        .bx-verdict-text{white-space:nowrap}
        .bx-verdict-bar{height:3px;border-radius:2px;margin-top:8px;animation:bx-verdict-fill .5s cubic-bezier(.2,.8,.2,1) backwards}
        @keyframes bx-verdict-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
        @keyframes bx-verdict-fill{from{width:0}to{width:100%}}
        .bx-score{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:rgba(13,11,20,.6);margin-top:8px}
        .bx-actions{display:flex;gap:8px;margin-top:12px}
        .bx-btn{flex:1;min-height:52px;display:flex;align-items:center;justify-content:center;border-radius:14px;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit;border:2.5px solid #0D0B14}
        .bx-btn-gold{background:#FFC72C;color:#0D0B14;box-shadow:3px 3px 0 #0D0B14}
        /* ARMURE : le skin body.theme-comic force button{bg/card !important} (0,1,1) —
           triplé-classe (0,3,0) + !important pour garder l'or du CTA (pattern XP_ARMOR).
           Jamais "cta" dans le nom (le skin cible [class*="cta"]). */
        .bx-btn.bx-btn-gold.bx-btn-gold{background:#FFC72C !important;color:#0D0B14 !important;box-shadow:3px 3px 0 #0D0B14 !important;border:2.5px solid #0D0B14 !important}
        .bx-btn.bx-btn-gold.bx-btn-gold:active{box-shadow:1px 1px 0 #0D0B14 !important;transform:translate(2px,2px)}
        .bx-btn-ghost{background:#fff;color:#0D0B14}
        .bx-sec{padding:6px 14px}
        .bx-reveal-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.16);border-radius:16px;padding:14px;color:inherit;cursor:pointer;font-family:inherit;text-align:left;margin-top:10px;text-shadow:none}
        .bx-kicker{display:block;font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#FFC72C;text-shadow:none}
        .bx-reveal-name{display:block;font-size:17px;font-weight:800;margin-top:2px;text-shadow:none}
        .bx-chev{font-size:18px;font-weight:800;color:#FFC72C;flex-shrink:0;transition:transform .2s}
        .bx-reveal-body{padding:12px 2px 4px;font-size:14.5px;line-height:1.55;color:rgba(255,253,246,.88)}
        .bx-why-proofs{display:flex;flex-direction:column;gap:10px}
        .bx-proof{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.08);border-radius:14px;transition:transform .2s, border-color .2s}
        .bx-proof:active{transform:translateX(2px)}
        .bx-proof-icon{font-size:22px;flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--proof-accent),color-mix(in srgb, var(--proof-accent) 70%, white));border-radius:12px;color:#0D0B14;box-shadow:0 2px 8px rgba(0,0,0,.15)}
        .bx-proof-content{flex:1;min-width:0}
        .bx-proof-content strong{display:block;font-size:13.5px;font-weight:800;color:#FFFDF6;line-height:1.3;margin-bottom:2px}
        .bx-proof-content span{display:block;font-size:13px;color:rgba(255,253,246,.7);line-height:1.4}
        .bx-proof-location{margin-top:8px;padding:10px 12px;background:rgba(255,199,44,.12);border:1px solid rgba(255,199,44,.3);border-radius:10px;font-size:12.5px;font-weight:600;color:#FFC72C;text-align:center}
.bx-dots{display:flex;gap:7px;margin-top:10px}
        .bx-dot{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px}
        .bx-dot i{width:100%;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:13px;color:#0D0B14}
        .bx-dot span{font-size:10px;font-weight:700;color:rgba(255,253,246,.6)}
        .bx-tmr{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.16);border-radius:14px;padding:13px;margin-top:10px}
        .bx-tmr b{font-size:16px}
        .bx-timeline{display:flex;gap:8px;margin-top:12px;overflow-x:auto;padding:4px 2px 8px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
        .bx-timeline-day{flex:0 0 auto;width:48px;display:flex;flex-direction:column;align-items:center;gap:6px;scroll-snap-align:start;animation:bx-timeline-in .4s cubic-bezier(.2,.8,.2,1) backwards;animation-delay:calc(var(--i, 0) * 60ms)}
        .bx-timeline-dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#0D0B14;box-shadow:0 2px 10px rgba(0,0,0,.2);background:var(--day-color);opacity:var(--day-opacity);transition:transform .2s}
        .bx-timeline-day:active .bx-timeline-dot{transform:scale(1.1)}
        .bx-timeline-label{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center}
        .bx-timeline-dayname{font-size:10.5px;font-weight:800;color:#FFFDF6;text-transform:uppercase;letter-spacing:.04em}
        .bx-timeline-status{font-size:9.5px;color:rgba(255,253,246,.55);white-space:nowrap}
        .bx-timeline-conf{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;color:var(--day-color);opacity:var(--day-opacity)}
        @keyframes bx-timeline-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .bx-backup-card{background:linear-gradient(180deg,rgba(30,200,176,.08) 0%,rgba(255,255,255,.03) 100%);border:2px solid rgba(30,200,176,.3);border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
        .bx-backup-header{display:flex;align-items:center;gap:12px;margin-bottom:10px}
        .bx-backup-from,.bx-backup-to{flex:1;display:flex;flex-direction:column;gap:6px}
        .bx-backup-label{font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,253,246,.45)}
        .bx-backup-beach-name{font-weight:800;font-size:16px;color:#FFFDF6}
        .bx-backup-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;border:2px solid}
        .bx-backup-arrow{font-size:24px;font-weight:800;color:#1EC8B0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3));animation:bx-arrow-pulse 2s ease-in-out infinite}
        @keyframes bx-arrow-pulse{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
        .bx-premium-section{margin-top:8px}
        .bx-premium-preview{display:flex;flex-direction:column;gap:8px;margin-bottom:8px}
        .bx-premium-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.08)}
        .bx-premium-item.free{border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.06)}
        .bx-premium-item.premium{border-color:rgba(255,199,44,.3);background:rgba(255,199,44,.08)}
        .bx-premium-badge{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;color:#0D0B14}
        .bx-premium-item.free .bx-premium-badge{background:#22C55E;color:#0D0B14}
        .bx-premium-item.premium .bx-premium-badge{background:#FFC72C;color:#0D0B14}
        .bx-premium-label{flex:1;font-size:13.5px;font-weight:600;color:#FFFDF6}
        .bx-premium-check{font-size:18px;color:#22C55E}
        .bx-premium-lock{font-size:18px}
        .bx-sticky-preview{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px;padding:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px}
        .bx-sticky-free{font-size:11.5px;font-weight:700;color:#22C55E}
        .bx-sticky-arrow{font-size:14px;font-weight:800;color:#FFC72C}
        .bx-sticky-premium{font-size:11.5px;font-weight:700;color:#FFC72C}
        .bx-backup-reason{display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(30,200,176,.12);border:1px solid rgba(30,200,176,.25);border-radius:10px;font-size:12.5px;color:rgba(255,253,246,.85)}
        .bx-backup-icon{font-size:18px}
        .bx-backup-empty{padding:16px;text-align:center;color:rgba(255,253,246,.6)}
        /* ── WOW JOURNEY RAIL (2026-09-24) : le fil du séjour, persistant.
           Conteneur pointer-events:none → la barre ne bloque JAMAIS la carte
           en dessous ; seules les chips sont tactiles. TL/BR paddings dégagent
           la pill « Aujourd'hui » (gauche) et le ✕ (droite) du hero. */
        .bx-rail{position:sticky;top:0;z-index:6;display:flex;gap:6px;align-items:center;padding:calc(10px + env(safe-area-inset-top)) 64px 8px 118px;pointer-events:none;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch}
        .bx-rail::-webkit-scrollbar{display:none}
        .bx-rail>*{pointer-events:auto}
        .bx-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
        .bx-chip i{width:8px;height:8px;border-radius:50%;flex-shrink:0;font-style:normal}
        .bx-chip.bx-chip.bx-chip{background:rgba(11,34,48,.62) !important;color:#FFFDF6 !important;border:1px solid rgba(255,255,255,.28) !important}
        .bx-chip--today.bx-chip--today.bx-chip--today{border-color:#FFC72C !important}
        .bx-chip--lock{opacity:.62}
        .bx-chip--back.bx-chip--back.bx-chip--back{background:#FFC72C !important;color:#0D0B14 !important;border-color:#0D0B14 !important;font-weight:800 !important}
        @media(min-width:1200px){.bx-rail{max-width:1180px;margin:0 auto;padding-left:24px;padding-right:24px}}
        .bx-card{background:#FDF6E3;color:#0D0B14;border:2.5px solid #0D0B14;border-radius:16px;box-shadow:4px 4px 0 rgba(0,0,0,.45);padding:14px;margin:14px}
        .bx-card-name{font-weight:800;font-size:19px}
        .bx-foot{padding:8px 14px calc(110px + env(safe-area-inset-bottom));font-size:11.5px;color:rgba(255,253,246,.5);text-align:center}
        .bx-sticky{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:5}
        .bx-sharecard{border-radius:18px;overflow:hidden;border:2.5px solid #0D0B14;box-shadow:4px 4px 0 rgba(0,0,0,.45);margin-top:10px}
        @media(min-width:1200px){
          .bx-cols{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,4fr) minmax(0,4fr);gap:20px;align-items:start;padding:26px 22px 40px}
          .bx-hero{min-height:auto;height:calc(100dvh - 52px);position:sticky;top:26px;border-radius:20px;border:2px solid rgba(255,255,255,.14)}
          .bx-mid,.bx-right{min-width:0}
          .bx-sticky{left:auto;right:26px;width:340px}
          .bx-foot{grid-column:1/-1}
        }
        @media(prefers-reduced-motion:reduce){
          .bx-root *{animation:none !important;transition:none !important}
          .bx-scene{transform:none !important}
        }
      `}</style>

      {/* WOW JOURNEY RAIL (2026-09-24) — le fil du séjour, toujours visible :
          ← retour in-world · aujourd'hui · J+1…J+6 · plan B. Une plage se
          transforme dans une autre, le rail reste — le monde ne change jamais
          de « page ». stay absent (?sgjourney=0) → le rail n'existe pas. */}
      {stay && (
        <div className="bx-rail" data-testid="exp-journey-rail" role="navigation" aria-label={L("Fil de ton séjour", "Your stay thread", "Hilo de tu estancia")}>
          {stayPrev && (
            <button type="button" className="bx-chip bx-chip--back" data-testid="exp-back-chip"
              onClick={() => { trk("sg_exp_back_tap", { via: "chip", to: stayPrev.id }); onStayBack && onStayBack() }}
              aria-label={L(`Revenir à ${stayPrev.name}`, `Back to ${stayPrev.name}`, `Volver a ${stayPrev.name}`)}>
              ← {stayPrev.name}
            </button>
          )}
          {(stay.days || []).map((d) => (
            <button type="button" key={d.i}
              className={"bx-chip" + (d.i === 0 ? " bx-chip--today" : "") + (d.locked ? " bx-chip--lock" : "")}
              data-testid="exp-day-chip" data-day={d.i}
              onClick={() => onDayChip(d)}
              aria-label={(d.i === 0 ? L("Aujourd'hui", "Today", "Hoy") : (d.label || `J+${d.i}`)) + (d.locked ? " · " + L("premium", "premium", "premium") : "")}>
              {d.locked && <span aria-hidden="true" style={{ fontSize: 11 }}>🔒</span>}
              {!d.locked && <i aria-hidden="true" style={{ background: DOT[d.status] || "#8A8F98" }} />}
              <span>{d.i === 0 ? L("Aujourd'hui", "Today", "Hoy") : ((d.label || "").slice(0, 4) || "J+" + d.i)}</span>
            </button>
          ))}
          {stay.backup && (
            <button type="button" className="bx-chip" data-testid="exp-planb-chip"
              onClick={() => { trk("sg_exp_chip_tap", { via: "rail_planb", to: stay.backup.id }); onOpenBeach && onOpenBeach(stay.backup.beach) }}
              aria-label={L(`Plan B : aller à ${stay.backup.name}`, `Plan B: go to ${stay.backup.name}`, `Plan B: ir a ${stay.backup.name}`)}>
              <i aria-hidden="true" style={{ background: DOT[stay.backup.status] || "#8A8F98" }} />
              <span>{L("Plan B", "Plan B", "Plan B")} · {stay.backup.name}</span>
            </button>
          )}
        </div>
      )}

      <div className="bx-cols">
        {/* ── COL 1 : LIEU (scene + verdict) ── */}
        <div className="bx-hero">
          <div className="bx-scene">
            <Scene status={beach.status} />
            <ExpMedia beachId={beach.id} status={beach.status} trk={trk} />
          </div>
          <div className="bx-hero-top">
            <span className="bx-live">{L("Aujourd'hui", "Today", "Hoy")}</span>
            <button type="button" className="bx-x" onClick={onClose} aria-label={L("Fermer", "Close", "Cerrar")}>✕</button>
          </div>
          <div className="bx-hero-card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div className="bx-dest">{L("La décision du jour", "Today's call", "La decisión de hoy")}</div>
              <span style={{ marginTop: -34, flexShrink: 0, filter: "drop-shadow(2px 3px 0 rgba(0,0,0,.4))" }}>
                <VeilleurMark size={52} />
              </span>
            </div>
            <div className="bx-name">{beach.name}</div>
            <div className="bx-verdict-wrap">
              <span className="bx-verdict" style={{ color: v.c, background: v.bg, borderColor: v.c }}>
                <span className="bx-verdict-glyph" aria-hidden="true">{v.glyph}</span>
                <span className="bx-verdict-text">{v.go[lang === "en" ? 1 : lang === "es" ? 2 : 0]}</span>
              </span>
              <div className="bx-verdict-bar" style={{ background: v.c }} />
            </div>
            {beach.score != null && (
              <div className="bx-score">score {Math.round(beach.score)}/100{conf != null ? ` · ${conf}% ${L("confiance", "confidence", "confianza")}` : ""}</div>
            )}
            <div className="bx-actions">
              <button type="button" className="bx-btn bx-btn-gold" onClick={goWhy}>{L("Pourquoi ?", "Why?", "¿Por qué?")}</button>
              <button type="button" className="bx-btn bx-btn-ghost" onClick={goTomorrow}>{L("Demain →", "Tomorrow →", "Mañana →")}</button>
            </div>
          </div>
        </div>

        {/* ── COL 2 : COMPRENDRE (why + tomorrow) ── */}
        <div className="bx-mid">
          <Reveal id="bx-why" kicker={L("Pourquoi ce verdict", "Why this call", "Por qué")} title={L("L'eau, expliquée", "The water, explained", "El agua, explicada")}
            open={whyOpen} onToggle={goWhy} accent={v.c}>
            <div className="bx-why-proofs">
              <div className="bx-proof" style={{ "--proof-accent": v.c }}>
                <span className="bx-proof-icon">{v.glyph}</span>
                <div className="bx-proof-content">
                  <strong>{L("État satellite", "Satellite state", "Estado satelital")}</strong>
                  <span>{beach.reason || v.why[lang === "en" ? 1 : lang === "es" ? 2 : 0]}</span>
                </div>
              </div>
              {fc[0] && fc[0].confidence != null && (
                <div className="bx-proof" style={{ "--proof-accent": "#FFC72C" }}>
                  <span className="bx-proof-icon">📊</span>
                  <div className="bx-proof-content">
                    <strong>{L("Confiance du modèle", "Model confidence", "Confianza del modelo")}</strong>
                    <span>{L("{c}% sur la prévision d'aujourd'hui", "{c}% on today's forecast", "{c}% en el pronóstico de hoy").replace("{c}", fc[0].confidence)}</span>
                  </div>
                </div>
              )}
              {beach.sargassumArea != null && (
                <div className="bx-proof" style={{ "--proof-accent": "#1EC8B0" }}>
                  <span className="bx-proof-icon">📍</span>
                  <div className="bx-proof-content">
                    <strong>{L("Surface sargasses détectée", "Sargassum area detected", "Área de sargazo detectada")}</strong>
                    <span>{L("~{a} km² dans la zone côtière", "~{a} km² in coastal zone", "~{a} km² en zona costera").replace("{a}", beach.sargassumArea.toFixed(1))}</span>
                  </div>
                </div>
              )}
              {beach.commune && <div className="bx-proof-location">{beach.commune}</div>}
            </div>
          </Reveal>

          <Reveal id="bx-tomorrow" kicker={L("Anticipation", "What's next", "Anticipación")} title={L("Demain, puis tes 7 jours", "Tomorrow, then your 7 days", "Mañana, luego tus 7 días")}
            open={tmrOpen} onToggle={goTomorrow} accent="#FFC72C">
            {tmr && tmrMeta ? (
              <>
                <div className="bx-tmr">
                  <span aria-hidden="true" style={{ fontSize: 22, fontWeight: 800, color: tmrMeta.c }}>{tmrMeta.glyph}</span>
                  <div>
                    <b>{L("Demain : ", "Tomorrow: ", "Mañana: ")}{tmrMeta.go[lang === "en" ? 1 : lang === "es" ? 2 : 0]}</b>
                    <div style={{ fontSize: 12.5, opacity: .75 }}>
                      {tmr.day || ""}{tmr.confidence != null ? ` · ${tmr.confidence}%` : ""}
                    </div>
                  </div>
                </div>
                <div className="bx-timeline" role="img" aria-label={L("Prévision 7 jours", "7-day forecast", "Pronóstico 7 días")}>
                  {fc.map((d, i) => (
                    <div className="bx-timeline-day" key={i} style={{ "--day-color": DOT[d.status] || "#888", "--day-opacity": i === 0 ? 1 : i === 1 ? 0.9 : 0.7, "--i": i }}>
                      <div className="bx-timeline-dot" style={{ background: DOT[d.status] || "#888" }}>
                        {(DOT[d.status] ? (d.status === "clean" ? "✓" : d.status === "moderate" ? "◐" : "✕") : "·")}
                      </div>
                      <div className="bx-timeline-label">
                        <span className="bx-timeline-dayname">{(d.day || "").slice(0, 3) || DAYL[new Date(d.date).getDay()] || "·"}</span>
                        <span className="bx-timeline-status">{d.status === "clean" ? L("Clair", "Clear", "Claro") : d.status === "moderate" ? L("Surveillé", "Watched", "Vigilado") : d.status === "alert" ? L("Sargasses", "Sargassum", "Sargazo") : "—"}</span>
                      </div>
                      {d.confidence != null && <div className="bx-timeline-conf">{d.confidence}%</div>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div>{L("Prévision en cours de calcul — reviens dans un instant.", "Forecast computing — check back shortly.", "Pronóstico calculándose.")}</div>
            )}
          </Reveal>

          {/* ── MER TEMPS RÉEL (2026-09-25F, ?sgvis=0 = off) : vagues/houle
              Open-Meteo marine par coords (fetch paresseux au 1er tap, cache
              30 min) + verdict snorkeling mer calme (mêmes seuils que
              conditions-filters.js). Sans mesure → honnêteté, jamais de chiffre. */}
          {!visOff() && (
          <Reveal id="bx-mer" kicker={L("Conditions", "Conditions", "Condiciones")} title={L("La mer en direct", "Live sea state", "El mar en vivo")}
            open={merOpen} onToggle={goMer} accent="#5FD3C9">
            {marineLoading ? (
              <div style={{ fontSize: 13.5, opacity: .75 }}>{L("Mesure en cours…", "Measuring…", "Midiendo…")}</div>
            ) : !marine ? (
              <div style={{ fontSize: 13.5, opacity: .8 }}>
                {L("Conditions marines indisponibles pour l'instant — la décision satellite ci-dessus reste valable.", "Marine conditions unavailable right now — the satellite call above still stands.", "Condiciones marinas no disponibles — la decisión satelital sigue válida.")}
                <div style={{ marginTop: 8, fontSize: 12, opacity: .65 }}>{marineSourceLabel(lang)}</div>
              </div>
            ) : (() => {
              const st = marineState(marine)
              const sn = snorkelSea(beach, marine)
              const chip = st === "calm"
                ? { t: L("Mer calme", "Calm sea", "Mar calma"), c: "#22C55E" }
                : st === "rough"
                ? { t: L("Mer agitée", "Rough sea", "Mar agitada"), c: "#E8522A" }
                : { t: L("Mer modérée", "Moderate sea", "Mar moderada"), c: "#B87A00" }
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: chip.c }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: chip.c }} />{chip.t}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700 }}>
                      {marine.waveHeight != null ? `${String(marine.waveHeight).replace(".", ",")} m` : "—"}
                    </span>
                    {marine.swellHeight != null && (
                      <span style={{ fontSize: 12, opacity: .7 }}>{L(`houle ${String(marine.swellHeight).replace(".", ",")} m`, `swell ${marine.swellHeight} m`, `oleaje ${marine.swellHeight} m`)}</span>
                    )}
                  </div>
                  {beach.snorkel && sn.ok === true && (
                    <div style={{ marginTop: 8, fontSize: 13, background: "rgba(34,197,94,.1)", border: "1.5px solid rgba(34,197,94,.35)", borderRadius: 10, padding: "9px 11px" }}>
                      🤿 {L("Bonne visibilité probable — masque recommandé.", "Good visibility likely — bring your mask.", "Buena visibilidad probable — trae tu máscara.")}
                    </div>
                  )}
                  {beach.snorkel && sn.ok === false && sn.reason === "waves" && (
                    <div style={{ marginTop: 8, fontSize: 13, background: "rgba(184,122,0,.1)", border: "1.5px solid rgba(184,122,0,.35)", borderRadius: 10, padding: "9px 11px" }}>
                      {L("Mer trop brassée pour le snorkeling aujourd'hui.", "Too choppy for snorkeling today.", "Demasiado movido para snorkel hoy.")}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 11.5, opacity: .6 }}>{marineSourceLabel(lang)} · {L("seuils : calme < 0,8 m · agitée ≥ 1,5 m", "thresholds: calm < 0.8 m · rough ≥ 1.5 m", "umbrales: calma < 0,8 m · agitada ≥ 1,5 m")}</div>
                </div>
              )
            })()}
          </Reveal>
          )}
        </div>

        {/* ── COL 3 : AGIR (backup + trip + share + premium) ── */}
        <div className="bx-right">
          <Reveal id="bx-backup" kicker={L("Plan B", "Backup", "Plan B")} title={L("Et si la mer change ?", "If the sea shifts?", "¿Y si cambia el mar?")}
            open={bakOpen} onToggle={goBackup} accent="#1EC8B0">
            {backup ? (
              <div key={backup.beach.id} className={sgmOff() ? "bx-backup-card" : "bx-backup-card sgm-swap"} style={{ margin: 0 }}>
                <div className="bx-backup-header">
                  <div className="bx-backup-from">
                    <span className="bx-backup-label">{L("Au lieu de", "Instead of", "En vez de")}</span>
                    <div className="bx-backup-beach-name">{beach.name}</div>
                    <span className="bx-backup-status" style={{ color: v.c, background: v.bg, borderColor: v.c }}>
                      {v.glyph} {v.go[lang === "en" ? 1 : lang === "es" ? 2 : 0]}
                    </span>
                  </div>
                  <div className="bx-backup-arrow" aria-hidden="true">→</div>
                  <div className="bx-backup-to">
                    <span className="bx-backup-label">{L("Vers", "Toward", "Hacia")}</span>
                    <div className="bx-backup-beach-name">{backup.beach.name}</div>
                    <span className="bx-backup-status" style={{ color: vOf(backup.beach.status).c, background: vOf(backup.beach.status).bg, borderColor: vOf(backup.beach.status).c }}>
                      {vOf(backup.beach.status).glyph} {vOf(backup.beach.status).go[lang === "en" ? 1 : lang === "es" ? 2 : 0]}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(13,11,20,.55)", fontWeight: 700, marginTop: 4, display: "block" }}>
                      {backup.distanceKm != null ? `${backup.distanceKm} km` : ""}
                    </span>
                  </div>
                </div>
                <div className="bx-backup-reason">
                  <span className="bx-backup-icon">🧭</span>
                  <span>{L("Alternative intelligente — même région, meilleure eau", "Smart alternative — same region, better water", "Alternativa inteligente — misma región, mejor agua")}</span>
                </div>
                <div className="bx-actions">
                  <button type="button" className="bx-btn bx-btn-gold" style={{ minHeight: 48, fontSize: 14, width: "100%" }}
                    onClick={() => { trk("sg_trip_beach_open", { via: "experience_backup" }); onOpenBeach && onOpenBeach(backup.beach) }}>
                    {L("Voir cette plage →", "See this beach →", "Ver esta playa →")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bx-backup-empty">{L("Aucune alternative proche confirmée — le Trip Planner couvre ton séjour.", "No nearby backup confirmed — Trip Planner covers your stay.", "Sin alternativa cercana — el Trip Planner cubre tu estancia.")}</div>
            )}
          </Reveal>

          {/* ── MINI-GUIDE 2026-09-25E (?sgvis=0 = off) : la fiche devient
              explorable 30-90 s. Que du RÉEL — sections sans données = masquées,
              jamais remplies. ── */}
          {!visOff() && (() => {
            /* Bons plans AVEC PROVENANCE (2026-09-25F) : tipsFor() — chaque
               conseil cite sa source (satellite/flag/coords/donnée plage).
               Rien sans source, jamais rempli artificiellement. */
            const tips = tipsFor(beach, lang)
            const near = nearestBeaches(beach, allBeaches, 3)
            const ageH = dataAgeHours(sargData)
            const ageTxt = ageH == null ? null
              : ageH < 12 ? L(`Satellite il y a ${Math.max(1, Math.round(ageH))} h`, `Satellite ${Math.max(1, Math.round(ageH))}h ago`, `Satélite hace ${Math.max(1, Math.round(ageH))} h`)
              : ageH < 48 ? L(`Mis à jour il y a ${Math.round(ageH)} h`, `Updated ${Math.round(ageH)}h ago`, `Actualizado hace ${Math.round(ageH)} h`)
              : L(`Données de ${Math.round(ageH / 24)} j — restez prudent`, `Data ${Math.round(ageH / 24)}d old`, `Datos de hace ${Math.round(ageH / 24)} d`)
            const faq = []
            faq.push({ q: L("D'où vient ce verdict ?", "Where does this call come from?", "¿De dónde viene este veredicto?"),
              a: L("Mesuré au satellite (Copernicus/ERDDAP), jamais deviné.", "Satellite-measured (Copernicus/ERDDAP), never guessed.", "Medido por satélite (Copernicus/ERDDAP).") + (ageTxt ? " " + ageTxt + "." : "") })
            if (fc[0] && fc[0].confidence != null)
              faq.push({ q: L("Quelle confiance ?", "How confident?", "¿Qué confianza?"),
                a: L(`${fc[0].confidence} % sur la prévision d'aujourd'hui.`, `${fc[0].confidence}% on today's forecast.`, `${fc[0].confidence} % en el pronóstico de hoy.`) })
            faq.push({ q: L("Et si les conditions changent ?", "What if conditions shift?", "¿Y si cambian las condiciones?"),
              a: backup
                ? L(`Le plan B du jour : ${backup.beach.name}${backup.distanceKm != null ? ` (${backup.distanceKm} km)` : ""} — eau ${backup.beach.status === "clean" ? "propre" : "à vérifier"}.`, `Today's plan B: ${backup.beach.name}${backup.distanceKm != null ? ` (${backup.distanceKm} km)` : ""}.`, `El plan B de hoy: ${backup.beach.name}${backup.distanceKm != null ? ` (${backup.distanceKm} km)` : ""}.`)
                : L("Le Trip Planner couvre ton séjour, jour par jour.", "Trip Planner covers your stay, day by day.", "El Trip Planner cubre tu estancia, día a día.") })
            return (
              <>
                {!!tips.length && (
                  <Reveal id="bx-savoir" kicker={L("Bon à savoir", "Good to know", "Bueno saber")} title={L("La plage, en pratique", "The beach, practically", "La playa, en práctica")}
                    open={savOpen} onToggle={goSav} accent="#FFC72C">
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {tips.map((f, i) => (
                        <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, background: f.kind === "warning" ? "rgba(232,82,42,.08)" : "rgba(255,255,255,.04)", border: f.kind === "warning" ? "1.5px solid rgba(232,82,42,.4)" : "1.5px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 12px" }}>
                          <span style={{ color: f.kind === "warning" ? "#E8522A" : "#FFC72C", flexShrink: 0, display: "inline-flex", marginTop: 1 }}>
                            <Icon name={f.kind === "warning" ? "alert" : f.kind === "tip" ? "sun" : "pin"} size={16} />
                          </span>
                          <span>{f.text}
                            <span style={{ display: "block", fontSize: 11, opacity: .6, marginTop: 2 }}>
                              {L("Source : ", "Source: ", "Fuente: ")}{sourceShort(f.source, lang)}{f.confidence === "medium" ? L(" · confiance moyenne", " · medium confidence", " · confianza media") : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                )}
                {!!near.length && (
                  <Reveal id="bx-prox" kicker={L("À proximité", "Nearby", "Cerca")} title={L("Tu aimeras peut-être aussi", "You may also like", "También te gustará")}
                    open={proxOpen} onToggle={goProx} accent="#1EC8B0">
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {near.map((n, i) => {
                        const nm = vOf(n.beach.status)
                        const url = imageMap && imageMap[n.beach.id] ? "/beaches/" + imageMap[n.beach.id] : null
                        return (
                          <div key={n.beach.id} className={sgmOff() ? undefined : "sgm-gallery"} style={{ "--i": i, display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,.04)", border: "1.5px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 10 }}>
                            {!!url && (
                              <img src={url} alt={n.beach.name} loading="lazy" width="400" height="300"
                                style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
                                onError={e => { e.currentTarget.style.display = "none" }} />
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.beach.name}</div>
                              <div style={{ fontSize: 11.5, opacity: .7 }}>{n.beach.commune || ""}{n.distanceKm != null ? ` · ${n.distanceKm} km` : ""}</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: nm.c, marginTop: 2 }}>{nm.glyph} {nm.go[lang === "en" ? 1 : lang === "es" ? 2 : 0]}</div>
                            </div>
                            <button type="button" className="bx-btn bx-btn-ghost" style={{ flexShrink: 0, minWidth: 48, minHeight: 48, padding: "8px 12px", fontSize: 14 }}
                              onClick={() => { trk("sg_recommendation_open", { beach_id: n.beach.id, source: "bx_proximity" }); onOpenBeach && onOpenBeach(n.beach) }}
                              aria-label={`${L("Voir", "See", "Ver")} ${n.beach.name}`}>→</button>
                          </div>
                        )
                      })}
                    </div>
                  </Reveal>
                )}
                <Reveal id="bx-faq" kicker={L("Comprendre", "Understand", "Entender")} title={L("Questions utiles", "Useful questions", "Preguntas útiles")}
                  open={faqOpen} onToggle={goFaq} accent="#8A8F98">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {faq.map((f, i) => (
                      <details key={i} data-testid="bx-faq-item" style={{ background: "rgba(255,255,255,.04)", border: "1.5px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 12px", fontSize: 13.5 }}>
                        <summary style={{ fontWeight: 800, cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>{f.q}</summary>
                        <div style={{ marginTop: 6, opacity: .85, lineHeight: 1.5 }}>{f.a}</div>
                      </details>
                    ))}
                  </div>
                </Reveal>
              </>
            )
          })()}

          {/* Trip — suite naturelle (TripPlanner existant, jamais recodé) */}
          <section className="bx-sec">
            <button type="button" className="bx-reveal-btn" style={{ borderStyle: "dashed", borderColor: "rgba(255,199,44,.55)" }}
              onClick={() => { trk("sg_trip_open", { source: "experience" }); onPlanTrip && onPlanTrip() }}
              data-testid="exp-trip-open">
              <span>
                <span className="bx-kicker">{L("Ton séjour", "Your stay", "Tu estancia")}</span>
                <span className="bx-reveal-name">{L("La meilleure plage chaque jour →", "Best beach each day →", "Mejor playa cada día →")}</span>
              </span>
              <span className="bx-chev" aria-hidden="true">→</span>
            </button>
          </section>

          {/* Share — carte de voyage partageable */}
          <section className="bx-sec">
            <div className="bx-sharecard">
              <div style={{ position: "relative", height: 120 }}>
                <Scene status={beach.status} />
                <div style={{ position: "absolute", left: 12, bottom: 8, zIndex: 2 }}>
                  <VeilleurMark size={40} />
                </div>
              </div>
              <div style={{ background: "#FDF6E3", color: "#0D0B14", padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "rgba(13,11,20,.55)" }}>SARGAGAME · {L("AUJOURD'HUI", "TODAY", "HOY")}</div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{beach.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: v.c }}>{v.glyph} {v.go[lang === "en" ? 1 : lang === "es" ? 2 : 0]}</span>
                  {beach.score != null && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700 }}>{Math.round(beach.score)}/100</span>}
                </div>
                {fc.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    {fc.map((d, i) => (
                      <span key={i} title={d.status || ""} style={{ width: 18, height: 18, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, background: DOT[d.status] || "#888", color: "#0D0B14" }}>
                        {d.status === "clean" ? "✓" : d.status === "moderate" ? "◐" : d.status === "alert" ? "✕" : "·"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button type="button" className="bx-btn bx-btn-ghost" style={{ width: "100%", marginTop: 10, minHeight: 48, fontSize: 14 }}
              onClick={doShare} data-testid="exp-share">
              <ComicIcon name="burst" size={15} />&nbsp;{shared ? L("Partagé ✓", "Shared ✓", "Compartido ✓") : L("Partager cette décision", "Share this call", "Compartir")}
            </button>
          </section>

          {/* Premium — conséquence logique */}
          {!isPremium && (
            <section className="bx-sec bx-premium-section">
              <div className="bx-premium-preview">
                <div className="bx-premium-item free">
                  <span className="bx-premium-badge">{L("GRATUIT", "FREE", "GRATIS")}</span>
                  <span className="bx-premium-label">{L("Aujourd'hui + verdict", "Today + verdict", "Hoy + veredicto")}</span>
                  <span className="bx-premium-check">✓</span>
                </div>
                <div className="bx-premium-item premium">
                  <span className="bx-premium-badge">{L("PREMIUM", "PREMIUM", "PREMIUM")}</span>
                  <span className="bx-premium-label">{L("7 jours + alertes + historique", "7 days + alerts + history", "7 días + alertas + histórico")}</span>
                  <span className="bx-premium-lock">🔒</span>
                </div>
              </div>
              <button type="button" className="bx-btn bx-btn-gold" style={{ width: "100%", marginTop: 10 }}
                onClick={() => { onPremium && onPremium("experience") }} data-testid="exp-premium-cta">
                {L("Débloquer tout mon séjour →", "Unlock my whole stay →", "Desbloquear mi estancia →")}
              </button>
            </section>
          )}
        </div>

        <div className="bx-foot">
          {L("Prévision satellite Copernicus — mesuré, pas deviné.", "Copernicus satellite forecast — measured, not guessed.", "Pronóstico satelital Copernicus — medido, no adivinado.")}
        </div>
      </div>

      {/* Sticky thumb-zone : l'action qui débloque tout */}
      {!isPremium && (
        <div className="bx-sticky">
          <div className="bx-sticky-preview">
            <span className="bx-sticky-free">{L("Aujourd'hui : gratuit", "Today: free", "Hoy: gratis")}</span>
            <span className="bx-sticky-arrow">→</span>
            <span className="bx-sticky-premium">{L("7 jours + alertes : Premium", "7 days + alerts: Premium", "7 días + alertas: Premium")}</span>
          </div>
          <button type="button" className="bx-btn bx-btn-gold" style={{ width: "100%", boxShadow: "0 8px 28px rgba(0,0,0,.5)" }}
            onClick={() => { onPremium && onPremium("experience") }}>
            {L("Débloquer — 7 jours + alertes →", "Unlock — 7 days + alerts →", "Desbloquear — 7 días + alertas →")}
          </button>
        </div>
      )}
    </div>
  )
}
