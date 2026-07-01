// WeekHub — « La Vigie » : hub prévision premium « Le Veilleur ». Ouvert au tap sur l'encart
// digest « Ta semaine » de la carte (WorldMapView). Vend une DÉCISION (où aller / où ne pas
// aller / quel jour), pas de la data brute. UN écran day-tripper-first : la réponse en haut
// sans scroll, la profondeur planner en opt-in scroll.
//
// Issu du panel adverse 2026-06-30 (« La Vigie », ossature planner-horizon + grafts). 3 lois :
//  • Le mur d'honnêteté coupe l'ACTION, pas la couleur : au-delà de reliableHorizon (déf 3),
//    aucune plage n'est un CTA « vas-y », aucune bascule n'affiche de date sèche, le chiffre or
//    ne compte QUE les jours ≤horizon (« 4/4 confirmés (+2 tendance) »).
//  • Tout par plage, data 100% ERDDAP réelle, ZÉRO fabrication ; unknown jamais compté propre.
//  • Saison (>7j) = pas de chiffre de risque fabriqué : stabilité-côte mesurée + engagement daté.
// Lazy → hors budget eager. a11y plancher : role=dialog, Échap, focus piégé+restauré,
// ruban clavier ←/→, prefers-reduced-motion (fallback statique). Flags ?weekhub=0 / ?weekhubseason=0.
import React, { useEffect, useRef, useMemo, useState, useCallback } from "react"
import { useSwipeClose } from "./useSwipeClose"

const DAY_LBL = [["Auj","Today","Hoy"],["+1j","+1d","+1d"],["+2j","+2d","+2d"],["+3j","+3d","+3d"],["+4j","+4d","+4d"],["+5j","+5d","+5d"]]
const ti = (lang, a) => lang === "en" ? a[1] : lang === "es" ? a[2] : a[0]
const _t = (lang, fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr
const STATUS_C = { clean:"#22C55E", moderate:"#B87A00", avoid:"#E8522A" }
const STATUS_LBL = { clean:["Propre","Clean","Limpia"], moderate:["Modéré","Moderate","Moderado"], avoid:["À éviter","Avoid","Evitar"] }
const INK = "#0d0b14", PAPER = "#fdf6e3", GOLD = "#FFC72C"

function haversineKm(a, b){
  if(!a||!b||a.lat==null||a.lng==null||b.lat==null||b.lng==null) return Infinity
  const R=6371, r=x=>x*Math.PI/180
  const dLat=r(b.lat-a.lat), dLng=r(b.lng-a.lng)
  const s=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)))
}
function freshLabel(updatedAt, lang){
  try{ const h=(Date.now()-new Date(updatedAt).getTime())/3.6e6
    if(!(h>=0)) return null
    if(h<1.5) return _t(lang,"mesuré à l'instant","measured just now","medido ahora")
    return _t(lang,`mesuré il y a ${Math.round(h)} h`,`measured ${Math.round(h)}h ago`,`medido hace ${Math.round(h)} h`)
  }catch(_){ return null }
}

// Signal saison HONNÊTE = label ordinal sourcé (season-climatology.cjs), zéro %, zéro date.
// On le dit au présent (« où on en est dans la saison »), jamais une prévision de jour.
function seasonPhaseMsg(phase, lang){
  if(phase==="pleine-saison") return _t(lang,
    "On est en pleine saison sargasses : les arrivées par vagues sont fréquentes. Le Veilleur surveille la mer pour toi, jour par jour.",
    "We're in peak sargassum season: arrivals come in waves. Le Veilleur watches the sea for you, day by day.",
    "Estamos en plena temporada de sargazo: las llegadas vienen en oleadas. Le Veilleur vigila el mar por ti, día a día.")
  if(phase==="approche-saison") return _t(lang,
    "La saison sargasses approche : ça peut commencer à bouger. On garde l'œil ouvert pour toi.",
    "Sargassum season is approaching: things may start to move. We keep watch for you.",
    "La temporada de sargazo se acerca: puede empezar a moverse. Seguimos vigilando por ti.")
  if(phase==="hors-saison") return _t(lang,
    "On est hors saison sargasses : les arrivées sont rares en ce moment. Profite — on te prévient si ça change.",
    "We're out of sargassum season: arrivals are rare right now. Enjoy — we'll warn you if it changes.",
    "Estamos fuera de temporada de sargazo: las llegadas son raras ahora. Disfruta — te avisamos si cambia.")
  return null
}

// Mascotte Veilleur minimale (satellite/oeil) — autonome pour éviter l'import circulaire.
function Watcher({ size=42 }){
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{flexShrink:0}}>
      <rect x="6" y="20" width="9" height="8" rx="2" fill="#5b3a8e" stroke={INK} strokeWidth="1.6"/>
      <rect x="33" y="20" width="9" height="8" rx="2" fill="#5b3a8e" stroke={INK} strokeWidth="1.6"/>
      <path d="M24 12V6" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round"/>
      <circle cx="24" cy="5" r="2.4" fill={GOLD}/>
      <rect x="14" y="14" width="20" height="22" rx="6" fill="#5b3a8e" stroke={INK} strokeWidth="1.8"/>
      <rect x="14" y="14" width="20" height="7" rx="6" fill={GOLD}/>
      <circle cx="24" cy="27" r="7.5" fill="#07201e" stroke={INK} strokeWidth="1.4"/>
      <circle cx="24" cy="27" r="4.6" fill="#3fd07f"/>
      <circle cx="22" cy="25.2" r="1.8" fill="#eafbf8"/>
    </svg>
  )
}

// Pastille statut (grammaire de la frise carte) : carré ink, hachuré si unknown, point tier.
function DayCell({ st, tier, active, label, sub }){
  const bg = st ? STATUS_C[st] : null
  return (
    <span style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
      <span style={{font:"700 9px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#4a4458"}}>{label}</span>
      <span style={{width:22,height:22,borderRadius:5,boxSizing:"border-box",
        background:bg||"#efe9da",
        backgroundImage:bg?"none":"repeating-linear-gradient(45deg,#d2ccbd 0 3px,#efe9da 3px 6px)",
        border:active?`3px solid ${GOLD}`:`2px solid ${INK}`,
        boxShadow:active?`0 0 0 1.5px ${INK}`:"none"}}/>
      <span aria-hidden="true" style={{width:5,height:5,borderRadius:"50%",boxSizing:"border-box",
        background:tier==="high"?INK:"transparent",
        backgroundImage:tier==="med"?`linear-gradient(90deg,${INK} 0 50%,transparent 50%)`:"none",
        border:tier==="low"?`1px dotted ${INK}`:tier==="med"?`1px solid ${INK}`:"none"}}/>
      {sub&&<span style={{font:"600 8px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#6b6478"}}>{sub}</span>}
    </span>
  )
}

export default function WeekHub({
  lang="fr", onClose, beachList=[], weekDigest=null, updatedAt=null,
  reliableHorizon=3, pos=null, seasonOff=false, seasonOutlook=null, island="mq",
  onSelectBeach, onPickDay, onPlannerOptin, track,
}){
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const reduced = useRef(false)
  // Convention UX (loi du repo) : toute feuille plein écran se ferme par swipe-down depuis le
  // haut. Hook canonique useSwipeClose (guardInput → pas de fermeture en pleine saisie du planner).
  const swipe = useSwipeClose(onClose, { guardInput:true })
  const setPanel = useCallback((el)=>{ panelRef.current=el; swipe.ref.current=el },[swipe])
  const REL = Math.max(1, Math.min(5, reliableHorizon||3))
  const D = [0,1,2,3,4,5]
  // Preuve d'honnêteté SURFACÉE in-app (le moat) : l'asymétrie régime calme — nos « mer propre »
  // sont quasi infaillibles, mais les rares alertes de saison calme sont peu fiables → on les
  // donne à faible confiance, « on ne crie pas au loup ». Source = track-record.json (public,
  // auditable, même que /fiabilite/). Affiché seulement en saison calme, avec N réel.
  const [calmProof, setCalmProof] = useState(null)
  useEffect(()=>{ let ok=true
    fetch("/api/copernicus/track-record.json").then(r=>r.json()).then(d=>{
      try{ const c=d&&d.byRegime&&d.byRegime.calm
        if(ok&&c&&c.cleanReliabilityPct!=null&&c.cleanSamples>=20) setCalmProof({pct:c.cleanReliabilityPct, n:c.cleanSamples, fa:c.falseAlarmRatePct})
      }catch(_){}
    }).catch(()=>{})
    return ()=>{ ok=false }
  },[])

  // Climatologie OBSERVÉE (état B planner) : pour une date future, on donne l'estimation
  // approximative demandée par le fondateur — le taux propre RÉELLEMENT observé pour ce
  // mois sur la côte, étiqueté « observé, pas prédit » + N. Honnête : si pas assez
  // d'historique pour ce mois → on ne fabrique rien, on retombe sur la tendance récente.
  const [climatology, setClimatology] = useState(null)
  useEffect(()=>{ let ok=true
    fetch("/api/copernicus/climatology.json").then(r=>r.json()).then(d=>{ if(ok&&d&&Array.isArray(d.cells)) setClimatology(d) }).catch(()=>{})
    return ()=>{ ok=false }
  },[])
  const tierOf = (d, cf) => d>=4 ? "low" : (cf>=55?"high":cf>=38?"med":"low")

  const [activeDay, setActiveDay] = useState(()=>{
    const bd = weekDigest && weekDigest.bestDay
    return (bd!=null && bd<=REL) ? bd : 0  // jamais ouvrir sur un jour horizon
  })

  useEffect(()=>{ try{ reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches }catch(_){} },[])

  useEffect(()=>{
    try{ track && track("sg_weekhub_open", {}) }catch(_){}
    const t = setTimeout(()=>{ try{ closeRef.current && closeRef.current.focus() }catch(_){} }, 30)
    const onKey = (e)=>{
      if(e.key === "Escape"){ e.stopPropagation(); onClose && onClose(); return }
      if(e.key === "Tab"){
        const root = panelRef.current; if(!root) return
        const f = root.querySelectorAll('button,a[href],input,[tabindex]:not([tabindex="-1"])')
        if(!f.length) return
        const first=f[0], last=f[f.length-1]
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus() }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", onKey, true)
    return ()=>{ clearTimeout(t); document.removeEventListener("keydown", onKey, true) }
  },[onClose, track])

  const pickBeach = useCallback((b)=>{ if(!b) return; try{ track && track("sg_weekhub_select_beach",{}) }catch(_){}; onSelectBeach && onSelectBeach(b) },[onSelectBeach, track])
  const seeOnMap = useCallback((d)=>{ try{ track && track("sg_weekhub_seemap",{day:d}) }catch(_){}; onPickDay && onPickDay(d) },[onPickDay, track])

  // ── HERO « le coup sûr » : valeur sûre + meilleur jour, chiffre or BORNÉ aux jours ≤horizon ──
  const hero = useMemo(()=>{
    if(!weekDigest) return null
    const safe = weekDigest.safe
    let confirmed=0, trend=0
    if(safe && safe.days){
      for(const d of D){ if(safe.days[d]==="clean"){ if(d<=REL) confirmed++; else trend++ } }
    }
    const bd = weekDigest.bestDay
    const bestIsHorizon = bd>REL
    return { safe, confirmed, trend, N: REL+1, bestDay: bd, bestN: weekDigest.bestN, bestIsHorizon, calm: weekDigest.calm }
  },[weekDigest, REL])

  // ── OÙ ALLER (jour actif) : top 3 plages propres, triées score puis distance si géoloc ──
  const goTo = useMemo(()=>{
    const list = beachList.filter(b=>b.days && b.days[activeDay]==="clean")
    list.sort((x,y)=>{
      const ds=(y.score||0)-(x.score||0); if(ds) return ds
      if(pos){ return haversineKm(pos,x)-haversineKm(pos,y) }
      return 0
    })
    return list.slice(0,3)
  },[beachList, activeDay, pos])
  const activeIsHorizon = activeDay>REL

  // ── OÙ NE PAS ALLER : bascules. ≤horizon = actionable (jour + plan B) ; >horizon = à surveiller ──
  const avoidList = useMemo(()=>{
    const cleansToday = beachList.filter(b=>b.days && b.days[0]==="clean")
    const planB = (beach)=>{ let best=null,bd=Infinity; for(const c of cleansToday){ if(c.id===beach.id) continue; const dd=haversineKm(beach,c); if(dd<bd){bd=dd;best=c} } return best?{beach:best,km:bd}:null }
    return beachList
      .filter(b=> b.days && (b.days[0]==="avoid" || (b.firstHit!=null && b.firstHit>=1)))
      .map(b=>{ const flip=b.days[0]==="avoid"?0:b.firstHit; return { b, flip, actionable: flip<=REL, alt: flip<=REL?planB(b):null } })
      .sort((x,y)=> x.flip-y.flip)
      .slice(0,4)
  },[beachList, REL])

  // ── Ruban 6 jours (île) : nb propres connus + tier ──
  const strip = useMemo(()=> D.map(d=>{
    const known = beachList.filter(b=>{const s=b.days&&b.days[d]; return s==="clean"||s==="moderate"||s==="avoid"}).length
    const clean = beachList.filter(b=>b.days&&b.days[d]==="clean").length
    let cfSum=0,cfN=0; for(const b of beachList){ const c=b.conf&&b.conf[d]; if(c!=null){cfSum+=c;cfN++} }
    const cf = cfN?cfSum/cfN:0
    return { d, known, clean, tier: tierOf(d, cf) }
  }), [beachList])
  const maxClean = Math.max(1, ...strip.map(w=>w.clean))

  // ── BLOC 5 stabilité-côte : combien de plages basculent par façade sur la fenêtre 6j (mesuré) ──
  const coastStab = useMemo(()=>{
    const valid = beachList.filter(b=>b.lng!=null)
    if(valid.length<4) return null
    const lngs=valid.map(b=>b.lng).sort((a,b)=>a-b); const med=lngs[Math.floor(lngs.length/2)]
    const east = valid.filter(b=>b.lng>=med), west = valid.filter(b=>b.lng<med)
    const flips = arr => arr.filter(b=>b.firstHit!=null || (b.days&&b.days[0]==="avoid")).length
    return { eastFlips:flips(east), westFlips:flips(west), eastN:east.length, westN:west.length }
  },[beachList])

  // Engagement daté planner — DIRECT, zéro email (décision fondateur) : la date choisie affiche
  // immédiatement l'estimation OBSERVÉE (planEstimate) sans rien demander. Pas de champ email,
  // pas de rappel J-7 par mail — la valeur vient à l'utilisateur, on ne quémande pas d'adresse.
  const [planDate, setPlanDate] = useState("")
  const [planSent, setPlanSent] = useState(false)
  const planMsg = useMemo(()=>{
    if(!planDate) return null
    try{
      const target=new Date(planDate+"T12:00:00"); const open=new Date(target.getTime()-7*864e5)
      const fmt=dt=>dt.toLocaleDateString(lang==="en"?"en-GB":lang==="es"?"es-ES":"fr-FR",{day:"numeric",month:"long"})
      const days=Math.ceil((target.getTime()-Date.now())/864e5)
      if(days<=7) return _t(lang,"Ta date est déjà dans notre fenêtre fiable — le verdict jour par jour est ouvert sur la carte.","Your date is already in our reliable window — the day-by-day verdict is open on the map.","Tu fecha ya está en nuestra ventana fiable — el veredicto diario está abierto en el mapa.")
      // Honnêteté (moat) : on énonce QUAND la fenêtre fiable s'ouvre, sans promettre un
      // ping automatique tant que le rappel J-7 (cron planner-alerts.cjs) n'émet pas —
      // on ne promet jamais ce qu'on ne délivre pas encore.
      return _t(lang,
        `Ton verdict jour par jour s'ouvre le ${fmt(open)} (J-7) — reviens le consulter à ce moment-là.`,
        `Your day-by-day verdict opens on ${fmt(open)} (D-7) — come back then to read it.`,
        `Tu veredicto diario se abre el ${fmt(open)} (D-7) — vuelve entonces a consultarlo.`)
    }catch(_){ return null }
  },[planDate, lang])
  // Estimation OBSERVÉE pour la date choisie (le « à peu près » demandé) : taux propre réel
  // du mois de la date, par côte, depuis la climatologie. « Observé », jamais « prédit ».
  const planEstimate = useMemo(()=>{
    if(!planDate || !climatology) return null
    let m; try{ m = new Date(planDate+"T12:00:00").getMonth()+1 }catch(_){ return null }
    const monthName = (()=>{ try{ return new Date(2000,m-1,1).toLocaleDateString(lang==="en"?"en-US":lang==="es"?"es-ES":"fr-FR",{month:"long"}) }catch(_){ return "" } })()
    const cells = climatology.cells.filter(c=>c.island===island && c.month===m)
    if(!cells.length) return { none:true, monthName }
    const atl = cells.find(c=>c.coast==="atlantic"), shel = cells.find(c=>c.coast==="sheltered")
    return { none:false, monthName, atl, shel }
  },[planDate, climatology, island, lang])
  const sendPlan = useCallback(()=>{
    try{ track && track("sg_weekhub_planner_optin",{}) }catch(_){}
    // Intention DIRECTE (aucun email) : on note la date localement et on rappelle que le verdict
    // jour-par-jour s'ouvrira à J-7 — l'utilisateur revient le consulter. Zéro ping, zéro adresse.
    try{ onPlannerOptin && onPlannerOptin({ source:"weekhub_planner", date:planDate }) }catch(_){}
    setPlanSent(true)
  },[onPlannerOptin, planDate, track])

  const card = { background:PAPER, border:`2.5px solid ${INK}`, boxShadow:`3px 3px 0 ${INK}`, borderRadius:14, padding:"13px 14px" }
  const h2 = { font:"400 15px/1 'Anton','Bricolage Grotesque',sans-serif", letterSpacing:".01em" }
  const fresh = freshLabel(updatedAt, lang)

  return (
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Hub prévision de ta semaine","Your week forecast hub","Tu centro de pronóstico semanal")}
      style={{position:"fixed", inset:0, zIndex:1300, background:"rgba(13,11,20,.55)", display:"flex", justifyContent:"center", alignItems:"flex-end"}}
      onClick={(e)=>{ if(e.target===e.currentTarget){ onClose && onClose() } }}>
      <div ref={setPanel} data-wkhub="1"
        onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}
        style={{
        width:"100%", maxWidth:560, maxHeight:"94vh", overflowY:"auto", WebkitOverflowScrolling:"touch",
        background:`linear-gradient(180deg,#2bb6ef 0%,#62c8ee 28%,#ffc187 78%,#ff944a 100%)`,
        borderTopLeftRadius:22, borderTopRightRadius:22, border:`3px solid ${INK}`, borderBottom:"none",
        padding:"0 0 calc(22px + env(safe-area-inset-bottom))",
        animation: reduced.current ? "none" : "wkhubIn .26s cubic-bezier(.34,1.4,.5,1) both",
        fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", color:INK,
      }}>
        <style>{`@keyframes wkhubIn{from{transform:translateY(28px);opacity:.4}to{transform:translateY(0);opacity:1}}
          @media (prefers-reduced-motion: reduce){[data-wkhub]{animation:none!important}}`}</style>

        {/* HEADER sticky */}
        <div style={{position:"sticky", top:0, zIndex:2, display:"flex", alignItems:"center", gap:11,
          background:PAPER, borderBottom:`2.5px solid ${INK}`, padding:"max(12px,env(safe-area-inset-top)) 14px 11px"}}>
          <Watcher size={40}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{font:"400 22px/1.05 'Anton','Bricolage Grotesque',sans-serif"}}>{_t(lang,"Ta semaine","Your week","Tu semana")}</div>
            <div style={{font:"500 11px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458", marginTop:2}}>
              {_t(lang,"Mesuré au satellite à J0, tendance jusqu'à J+3, incertain au-delà.","Satellite-measured at D0, trend to D+3, uncertain beyond.","Medido por satélite en D0, tendencia hasta D+3, incierto más allá.")}{fresh?` · ${fresh}`:""}
            </div>
          </div>
          <button ref={closeRef} onClick={()=>onClose&&onClose()} aria-label={_t(lang,"Fermer","Close","Cerrar")}
            style={{flexShrink:0, width:44, height:44, borderRadius:999, border:`2.5px solid ${INK}`, background:GOLD, color:INK, font:"800 17px/1 system-ui", cursor:"pointer", boxShadow:`2px 2px 0 ${INK}`}}>✕</button>
        </div>

        <div style={{padding:"13px", display:"flex", flexDirection:"column", gap:11}}>

          {/* BLOC 1 — LE COUP SÛR (hero) */}
          {hero && (
            <button onClick={()=>hero.safe&&pickBeach(hero.safe)} disabled={!hero.safe}
              style={{...card, textAlign:"left", width:"100%", cursor:hero.safe?"pointer":"default", background:"linear-gradient(135deg,#fff6d8,#fdf6e3 60%)", outline:`2px solid ${GOLD}`, outlineOffset:-6}}>
              {hero.calm ? (
                <>
                  <div style={{font:"400 18px/1.05 'Anton',sans-serif"}}>🌴 {_t(lang,"Toute ta semaine au vert","Your whole week is green","Toda tu semana en verde")}</div>
                  <div style={{font:"500 12px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458", marginTop:5}}>{_t(lang,"On surveille la mer pour toi — alerte à la seconde où ça bascule.","We watch the sea for you — alerted the second it shifts.","Vigilamos el mar por ti — aviso en cuanto cambie.")}</div>
                  {calmProof && (
                    <div style={{font:"600 10.5px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548", marginTop:8, paddingTop:8, borderTop:`1.5px dashed rgba(13,11,20,.22)`}}>{_t(lang,
                      `En saison calme, ${calmProof.pct}% de nos « mer propre » se sont vérifiées (${calmProof.n.toLocaleString("fr-FR")} cas). Les rares alertes, on les donne à faible confiance — on ne crie pas au loup. 76-79% tous régimes confondus, détail sur /fiabilite/.`,
                      `In calm season, ${calmProof.pct}% of our “clean water” calls held up (${calmProof.n.toLocaleString("en-US")} cases). The rare alerts we give low-confidence — we don't cry wolf. 76-79% across all regimes, details on /reliability/.`,
                      `En temporada calma, ${calmProof.pct}% de nuestros “agua limpia” se cumplieron (${calmProof.n.toLocaleString("es-ES")} casos). Las raras alertas las damos con baja confianza — no gritamos lobo. 76-79% en todos los regímenes, detalle en /fiabilidad/.`)}</div>
                  )}
                </>
              ) : hero.safe ? (
                <>
                  <div style={{font:"800 11px/1 'Bricolage Grotesque',system-ui,sans-serif", color:"#0a7d33", letterSpacing:".04em", textTransform:"uppercase"}}>{_t(lang,"Ton coup sûr","Your safe bet","Tu apuesta segura")}</div>
                  <div style={{font:"400 22px/1.05 'Anton',sans-serif", marginTop:4}}>{hero.safe.name}</div>
                  <div style={{font:"700 12px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458", marginTop:4}}>
                    {_t(lang,`Propre ${hero.confirmed}/${hero.N} jours confirmés`,`Clean ${hero.confirmed}/${hero.N} days confirmed`,`Limpia ${hero.confirmed}/${hero.N} días confirmados`)}{hero.trend>0?_t(lang,` (+${hero.trend} en tendance)`,` (+${hero.trend} trend)`,` (+${hero.trend} tendencia)`):""}
                    {hero.bestN>0 && ` · ${hero.bestIsHorizon?_t(lang,"fenêtre la plus favorable","most favourable window","ventana más favorable"):_t(lang,"meilleur jour","best day","mejor día")} ${ti(lang,DAY_LBL[hero.bestDay]||DAY_LBL[0])}`}
                  </div>
                </>
              ) : (
                <>
                  <div style={{font:"400 18px/1.05 'Anton',sans-serif"}}>{_t(lang,"Pas de valeur sûre cette semaine","No safe bet this week","Sin apuesta segura esta semana")}</div>
                  <div style={{font:"600 12px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458", marginTop:5}}>{_t(lang,`Vise plutôt ${ti(lang,DAY_LBL[hero.bestDay]||DAY_LBL[0])} — la fenêtre la plus propre.`,`Aim for ${ti(lang,DAY_LBL[hero.bestDay]||DAY_LBL[0])} — the cleanest window.`,`Apunta a ${ti(lang,DAY_LBL[hero.bestDay]||DAY_LBL[0])} — la ventana más limpia.`)}</div>
                </>
              )}
            </button>
          )}

          {/* BLOC 2 — OÙ ALLER (jour actif) */}
          <div style={card}>
            <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8, marginBottom:9}}>
              <span style={h2}>{_t(lang,"Où aller","Where to go","Adónde ir")}</span>
              <span style={{font:"700 11px/1 'Bricolage Grotesque',system-ui,sans-serif", color:"#6b6478"}}>{ti(lang,DAY_LBL[activeDay])}{activeIsHorizon?` · ${_t(lang,"horizon incertain","uncertain horizon","horizonte incierto")}`:""}</span>
            </div>
            {goTo.length>0 ? (
              <div style={{display:"flex", flexDirection:"column", gap:7}}>
                {activeIsHorizon && <div style={{font:"600 10.5px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:"#9a5a00", marginBottom:2}}>{_t(lang,"Au-delà de J+3 : des pistes à reconfirmer, pas une destination sûre.","Beyond D+3: leads to reconfirm, not a sure bet.","Más allá de D+3: pistas por reconfirmar, no un destino seguro.")}</div>}
                {goTo.map(b=>(
                  <button key={b.id} onClick={()=>!activeIsHorizon&&pickBeach(b)} disabled={activeIsHorizon}
                    style={{display:"flex", alignItems:"center", gap:9, textAlign:"left", width:"100%", minHeight:44,
                      background: activeIsHorizon?"#f4efe2":"#fffbf0", border:`2px solid ${INK}`, borderRadius:10, padding:"7px 10px",
                      cursor:activeIsHorizon?"default":"pointer", opacity:activeIsHorizon?.8:1}}>
                    <span style={{width:11, height:11, borderRadius:"50%", background:STATUS_C.clean, border:`1.5px solid ${INK}`, flexShrink:0}}/>
                    <span style={{flex:1, minWidth:0}}>
                      <span style={{font:"800 13.5px/1.1 'Bricolage Grotesque',system-ui,sans-serif", display:"block", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{b.name}</span>
                      {b.commune && <span style={{font:"600 10.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color:"#6b6478"}}>{b.commune}</span>}
                    </span>
                    {!activeIsHorizon && <span aria-hidden="true" style={{font:"800 14px/1 'Bricolage Grotesque',system-ui,sans-serif", color:INK}}>›</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{font:"600 12px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458"}}>
                {(hero&&hero.bestN>0&&!hero.bestIsHorizon)
                  ? _t(lang,`Rien de propre ${ti(lang,DAY_LBL[activeDay])}. Vise ${ti(lang,DAY_LBL[hero.bestDay])} →`,`Nothing clean ${ti(lang,DAY_LBL[activeDay])}. Aim for ${ti(lang,DAY_LBL[hero.bestDay])} →`,`Nada limpio ${ti(lang,DAY_LBL[activeDay])}. Apunta a ${ti(lang,DAY_LBL[hero.bestDay])} →`)
                  : _t(lang,"Rien de propre confirmé ce jour-là.","Nothing clean confirmed that day.","Nada limpio confirmado ese día.")}
              </div>
            )}
          </div>

          {/* BLOC 3 — RUBAN 6 JOURS (tap re-cale BLOC 2 ; clavier ←/→ ; voir sur la carte) */}
          <div style={card} role="group" aria-label={_t(lang,"Choisir le jour","Choose the day","Elegir el día")}>
            <div style={{...h2, marginBottom:10}}>{_t(lang,"La semaine d'un coup d'œil","The week at a glance","La semana de un vistazo")}</div>
            <div style={{display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:3}}
              onKeyDown={(e)=>{ if(e.key==="ArrowRight"){e.preventDefault();setActiveDay(d=>Math.min(5,d+1))} else if(e.key==="ArrowLeft"){e.preventDefault();setActiveDay(d=>Math.max(0,d-1))} }}>
              {strip.map(w=>(
                <button key={w.d} onClick={()=>setActiveDay(w.d)} aria-pressed={activeDay===w.d}
                  aria-label={`${ti(lang,DAY_LBL[w.d])} · ${w.known?w.clean+" "+_t(lang,"propres","clean","limpias"):_t(lang,"inconnu","unknown","desconocido")} · ${w.tier==="high"?_t(lang,"confiance forte","strong confidence","confianza alta"):w.tier==="med"?_t(lang,"tendance","trend","tendencia"):_t(lang,"horizon incertain","uncertain horizon","horizonte incierto")}`}
                  style={{flex:1, minHeight:44, display:"flex", flexDirection:"column", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", padding:"2px 0"}}>
                  <span style={{font:"800 11px/1 'Bricolage Grotesque',system-ui,sans-serif"}}>{w.known?w.clean:"—"}</span>
                  <span style={{width:"80%", height:Math.max(8, Math.round(40*(w.known?w.clean:0)/maxClean)),
                    background:w.known?"#22C55E":"transparent",
                    backgroundImage:w.known?"none":"repeating-linear-gradient(45deg,#d2ccbd 0 3px,#efe9da 3px 6px)",
                    border:activeDay===w.d?`3px solid ${GOLD}`:`2px solid ${INK}`, borderRadius:5, boxSizing:"border-box",
                    boxShadow:activeDay===w.d?`0 0 0 1.5px ${INK}`:"none"}}/>
                  <span style={{font:"700 9.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color:activeDay===w.d?INK:"#4a4458"}}>{ti(lang,DAY_LBL[w.d])}</span>
                  <span aria-hidden="true" style={{width:5, height:5, borderRadius:"50%", boxSizing:"border-box",
                    background:w.tier==="high"?INK:"transparent",
                    backgroundImage:w.tier==="med"?`linear-gradient(90deg,${INK} 0 50%,transparent 50%)`:"none",
                    border:w.tier==="low"?`1px dotted ${INK}`:w.tier==="med"?`1px solid ${INK}`:"none"}}/>
                </button>
              ))}
            </div>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginTop:9}}>
              <span style={{font:"600 9.5px/1.25 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458"}}>{_t(lang,"plein = mesuré · demi = tendance · pointillé = horizon","filled = measured · half = trend · dotted = horizon","lleno = medido · medio = tendencia · punteado = horizonte")}</span>
              <button onClick={()=>seeOnMap(activeDay)} style={{flexShrink:0, font:"800 10.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color:INK, background:GOLD, border:`2px solid ${INK}`, borderRadius:999, padding:"6px 10px", cursor:"pointer", minHeight:36, boxShadow:`2px 2px 0 ${INK}`}}>{_t(lang,"Voir sur la carte","See on map","Ver en el mapa")}</button>
            </div>
          </div>

          {/* BLOC 4 — OÙ NE PAS ALLER + Plan B */}
          {avoidList.length>0 && (
            <div style={{...card, background:"#fff3e0"}}>
              <div style={{...h2, marginBottom:9}}>{_t(lang,"À surveiller · ton plan B","Keep an eye · your plan B","A vigilar · tu plan B")}</div>
              <div style={{display:"flex", flexDirection:"column", gap:8}}>
                {avoidList.map(({b,flip,actionable,alt})=>(
                  <div key={b.id} style={{background:"#fffaf3", border:`2px solid ${INK}`, borderRadius:10, padding:"8px 10px"}}>
                    <div style={{display:"flex", alignItems:"center", gap:9}}>
                      <span style={{width:11, height:11, borderRadius:"50%", background:STATUS_C.avoid, border:`1.5px solid ${INK}`, flexShrink:0}}/>
                      <span style={{flex:1, minWidth:0, font:"800 13px/1.1 'Bricolage Grotesque',system-ui,sans-serif", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{b.name}</span>
                      <span style={{font:"800 10px/1 'Bricolage Grotesque',system-ui,sans-serif", color:actionable?"#b5341a":"#6b6478", whiteSpace:"nowrap"}}>
                        {actionable
                          ? (flip===0?_t(lang,"à éviter","avoid","evitar"):`${_t(lang,"bascule","flips","cambia")} ${ti(lang,DAY_LBL[flip])}${b.drift==="up"?" ↗":b.drift==="down"?" ↘":""}`)
                          : _t(lang,"à surveiller","watch","a vigilar")}
                      </span>
                    </div>
                    {actionable && alt ? (
                      <button onClick={()=>pickBeach(alt.beach)} style={{marginTop:7, display:"flex", alignItems:"center", gap:6, textAlign:"left", width:"100%", minHeight:40,
                        background:"#0f5132", color:"#eafaf0", border:`2px solid ${INK}`, borderRadius:999, padding:"6px 10px", cursor:"pointer",
                        font:"800 11px/1.15 'Bricolage Grotesque',system-ui,sans-serif", boxShadow:`2px 2px 0 ${INK}`}}>
                        <span aria-hidden="true" style={{fontSize:13}}>→</span>
                        <span>{_t(lang,`Vise plutôt ${alt.beach.name} · ${alt.km<1?"< 1":Math.round(alt.km)} km, c'est propre`,`Aim for ${alt.beach.name} instead · ${alt.km<1?"< 1":Math.round(alt.km)} km, it's clean`,`Mejor ${alt.beach.name} · ${alt.km<1?"< 1":Math.round(alt.km)} km, está limpia`)}</span>
                      </button>
                    ) : !actionable ? (
                      <div style={{marginTop:5, font:"600 10.5px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:"#6b6478"}}>{_t(lang,"Faible certitude à cet horizon — on garde l'œil et on te préviendra.","Low certainty at this range — we keep watch and will warn you.","Baja certeza a este horizonte — seguimos vigilando y te avisaremos.")}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* État calme : pas de trou silencieux — on rassure (s'enchaîne avec la proactivité). */}
          {avoidList.length===0 && (
            <div style={{...card, background:"#eafaf1"}}>
              <div style={{font:"800 12.5px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:"#0a7d33"}}>✓ {_t(lang,"Aucune plage à éviter cette semaine","No beach to avoid this week","Ninguna playa a evitar esta semana")}</div>
              <div style={{font:"500 11px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458", marginTop:4}}>{_t(lang,"On garde l'œil ouvert — tu seras prévenu le matin où ça bascule.","We keep watch — you'll be warned the morning it shifts.","Seguimos vigilando — te avisaremos la mañana en que cambie.")}</div>
            </div>
          )}

          {/* SÉPARATEUR HONNÊTETÉ (sobre) */}
          {!seasonOff && (
            <div style={{display:"flex", flexDirection:"column", gap:6, padding:"4px 2px"}}>
              <div style={{borderTop:`1.5px dashed ${INK}`, opacity:.45}}/>
              <div style={{font:"600 11px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548", textAlign:"center"}}>{_t(lang,"Au-delà de 7 jours, on ne prédit plus le jour — ce serait te mentir.","Beyond 7 days we don't predict the day — that would be lying.","Más allá de 7 días no predecimos el día — sería mentirte.")}</div>
            </div>
          )}

          {/* BLOC 5 — PLUS LOIN QUE 7 JOURS (planner, opt-in) */}
          {!seasonOff && (
            <div style={{...card, background:"#fff8e8"}}>
              <div style={{...h2, marginBottom:8}}>{_t(lang,"Tu pars dans 2 semaines ?","Travelling in 2 weeks?","¿Viajas en 2 semanas?")}</div>
              {seasonOutlook && seasonOutlook.phase && seasonPhaseMsg(seasonOutlook.phase, lang) && (
                <div style={{font:"600 12px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548", marginBottom:9, paddingBottom:9, borderBottom:`1.5px dashed rgba(13,11,20,.25)`}}>{seasonPhaseMsg(seasonOutlook.phase, lang)}</div>
              )}
              {coastStab && (coastStab.eastFlips!==coastStab.westFlips) && (
                <div style={{font:"600 12px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458", marginBottom:9}}>
                  {(()=>{ const stableEast=coastStab.eastFlips<coastStab.westFlips
                    return _t(lang,
                      `Lecture de tendance (sur la fenêtre mesurée, pas ta date) : la côte ${stableEast?"au vent":"sous le vent"} tient mieux (${Math.min(coastStab.eastFlips,coastStab.westFlips)} bascule vs ${Math.max(coastStab.eastFlips,coastStab.westFlips)}). Si tu réserves, vise ce côté.`,
                      `Trend reading (over the measured window, not your date): the ${stableEast?"windward":"leeward"} coast holds better (${Math.min(coastStab.eastFlips,coastStab.westFlips)} flip vs ${Math.max(coastStab.eastFlips,coastStab.westFlips)}). If you book, aim that side.`,
                      `Lectura de tendencia (sobre la ventana medida, no tu fecha): la costa ${stableEast?"de barlovento":"de sotavento"} aguanta mejor (${Math.min(coastStab.eastFlips,coastStab.westFlips)} vs ${Math.max(coastStab.eastFlips,coastStab.westFlips)}). Si reservas, apunta a ese lado.`)
                  })()}
                </div>
              )}
              {!planSent ? (
                <>
                  <label style={{display:"block", font:"700 11px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:"#4a4458", marginBottom:5}}>{_t(lang,"Ta date d'arrivée :","Your arrival date:","Tu fecha de llegada:")}</label>
                  <div style={{display:"flex", gap:7, flexWrap:"wrap"}}>
                    <input type="date" value={planDate} onChange={e=>setPlanDate(e.target.value)}
                      min={(()=>{try{return new Date().toISOString().slice(0,10)}catch(_){return undefined}})()}
                      max={(()=>{try{return new Date(Date.now()+30*864e5).toISOString().slice(0,10)}catch(_){return undefined}})()}
                      style={{flex:"1 1 150px", minHeight:44, fontSize:16, padding:"8px 10px", border:`2px solid ${INK}`, borderRadius:10, background:"#fffbf0", color:INK, fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}/>
                    <button onClick={sendPlan} disabled={!planDate}
                      style={{flex:"0 0 auto", minHeight:44, font:"800 12px/1 'Bricolage Grotesque',system-ui,sans-serif", color:INK, background:planDate?GOLD:"#e8e0cc", border:`2.5px solid ${INK}`, borderRadius:999, padding:"0 16px", cursor:planDate?"pointer":"default", boxShadow:`2px 2px 0 ${INK}`}}>{_t(lang,"Préviens-moi","Notify me","Avísame")}</button>
                  </div>
                  {planEstimate && (
                    <div style={{font:"600 11px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548", marginTop:8, paddingTop:8, borderTop:`1.5px dashed rgba(13,11,20,.22)`}}>
                      {planEstimate.none
                        ? _t(lang,`On n'a pas encore assez d'historique observé pour ${planEstimate.monthName} — on s'appuie sur la tendance récente ci-dessus, pas sur un chiffre inventé.`,`Not enough observed history yet for ${planEstimate.monthName} — we lean on the recent trend above, not a made-up figure.`,`Aún no hay suficiente historial observado para ${planEstimate.monthName} — nos apoyamos en la tendencia reciente, no en un número inventado.`)
                        : _t(lang,
                            `Observé en ${planEstimate.monthName}${planEstimate.atl?` — côte au vent : ${planEstimate.atl.clean_rate}% de jours propres (${planEstimate.atl.n_samples} relevés)`:""}${planEstimate.shel?` · côte abritée : ${planEstimate.shel.clean_rate}%`:""}. Tendance observée, PAS une prévision de ta date.`,
                            `Observed in ${planEstimate.monthName}${planEstimate.atl?` — windward coast: ${planEstimate.atl.clean_rate}% clean days (${planEstimate.atl.n_samples} records)`:""}${planEstimate.shel?` · sheltered coast: ${planEstimate.shel.clean_rate}%`:""}. Observed trend, NOT a forecast for your date.`,
                            `Observado en ${planEstimate.monthName}${planEstimate.atl?` — costa de barlovento: ${planEstimate.atl.clean_rate}% días limpios (${planEstimate.atl.n_samples} registros)`:""}${planEstimate.shel?` · costa abrigada: ${planEstimate.shel.clean_rate}%`:""}. Tendencia observada, NO un pronóstico de tu fecha.`)}
                    </div>
                  )}
                  {planMsg && <div style={{font:"600 11px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548", marginTop:8}}>{planMsg}</div>}
                </>
              ) : (
                <div style={{font:"700 12px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:"#0a7d33"}}>✓ {_t(lang,"C'est noté. ","Noted. ","Anotado. ")}{planMsg || _t(lang,"Ton verdict jour par jour sera prêt à J-7 — reviens le consulter à ce moment-là.","Your day-by-day verdict will be ready at D-7 — come back then to read it.","Tu veredicto diario estará listo en D-7 — vuelve entonces a consultarlo.")}</div>
              )}
            </div>
          )}

          {/* PIED honnêteté */}
          <div style={{textAlign:"center", padding:"2px 4px 0"}}>
            <a href="/fiabilite/" style={{font:"800 11.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color:INK, textDecoration:"underline"}}>{_t(lang,"Va voir ce qu'on vaut vraiment →","See what we're really worth →","Mira lo que valemos de verdad →")}</a>
            <div style={{font:"600 10px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548", marginTop:6}}>{_t(lang,"76 à 79 % de justesse selon la saison · confiance forte J0-J3, indicative au-delà.","76-79% accuracy by season · strong confidence D0-D3, indicative beyond.","76-79 % de acierto según temporada · confianza alta D0-D3, indicativa más allá.")}</div>
          </div>

        </div>
      </div>
    </div>
  )
}
