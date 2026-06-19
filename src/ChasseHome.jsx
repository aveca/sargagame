/**
 * ChasseHome — accueil « LA CHASSE » (bras A/B `arena_loop`).
 *
 * Boucle de jeu (thème ARENA / TCG comic) montée comme accueil alternatif,
 * en priorité sur le hero quand le flag est actif. ADDITIF : control =
 * GameFunnel / HeroVerdict, intact. Override ?chasse=1/0.
 *
 * Trois piliers fun, branchés sur les VRAIES portes de conversion (mêmes
 * hooks que HomeAZ : onOpen / onOpenBeach / onPremium / onShowMap / track) :
 *   1. CARTE DU JOUR — duel « devine le verdict » → flip reveal holographique
 *      → le Veilleur réagit (iris calm/scan/alert) → série 🔥 (streak).
 *   2. MA COLLECTION — chaque plage = une carte TCG (rareté = score), à
 *      collectionner ; taper une carte ouvre la fiche plage (= conversion).
 *   3. PRÉVISIONS 7 JOURS — carte verrouillée → premium (onPremium).
 *
 * Isolation : tout le CSS est scopé `.lc-` (injecté une fois) ; aucune classe
 * générique (.card, .btn…) n'est utilisée nue → zéro fuite vers/depuis l'app.
 * Persistance locale : localStorage `sg_chasse` { streak, best, last, collected[] }.
 * Reduced-motion : foil + flip + flottement désactivés (plancher statique).
 */
import React,{useState,useEffect,useRef,useMemo,useCallback} from "react"

/* ---- persistance locale (série + collection) ---- */
const LS_KEY="sg_chasse"
function todayKey(){ const d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate() }
function yesterdayKey(){ const d=new Date(Date.now()-864e5); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate() }
function loadState(){
  try{ const v=JSON.parse(localStorage.getItem(LS_KEY)||"{}");
    return { streak:+v.streak||0, best:+v.best||0, last:v.last||null, played:v.played||null,
             guessOk:!!v.guessOk, collected:Array.isArray(v.collected)?v.collected:[] } }
  catch(_){ return { streak:0, best:0, last:null, played:null, guessOk:false, collected:[] } }
}
function saveState(s){ try{ localStorage.setItem(LS_KEY,JSON.stringify(s)) }catch(_){} }

/* ---- mapping statut → verdict / couleur / humeur Veilleur ---- */
const VERDICT={
  clean:   {fr:"PROPRE",en:"CLEAN",es:"LIMPIA", st:"ok",  mood:"calm",  no:{fr:"PROPRE!",en:"CLEAN!",es:"LIMPIA!"}},
  moderate:{fr:"MODÉRÉ",en:"MODERATE",es:"MODERADA", st:"mod", mood:"scan",  no:{fr:"BOF…",en:"MEH…",es:"BAH…"}},
  avoid:   {fr:"À ÉVITER",en:"AVOID",es:"EVITAR", st:"bad", mood:"alert", no:{fr:"BERK!",en:"YUCK!",es:"PUAJ!"}}
}
function vof(status){ return VERDICT[status]||VERDICT.clean }
const MOOD_COL={calm:"#27c46b",scan:"#ffd23f",alert:"#e8322a"}

/* paliers de complétion du Pokédex → titre + skin d'iris du Veilleur */
const TIERS=[
  {n:0,  iris:"#7a6cff", fr:"Promeneur",        en:"Stroller",        es:"Paseante"},
  {n:5,  iris:"#27c46b", fr:"Apprenti Veilleur",en:"Veilleur Trainee",es:"Aprendiz"},
  {n:12, iris:"#19b3e6", fr:"Éclaireur",        en:"Scout",           es:"Explorador"},
  {n:25, iris:"#ffd23f", fr:"Cartographe",      en:"Cartographer",    es:"Cartógrafo"},
  {n:45, iris:"#ff8a1e", fr:"Maître Veilleur",  en:"Veilleur Master", es:"Maestro"},
  {n:70, iris:"#ff3da6", fr:"Légende du Lagon", en:"Lagoon Legend",   es:"Leyenda"}
]
function tierOf(count){
  let cur=TIERS[0],nx=null
  for(const t of TIERS){ if(count>=t.n) cur=t; else { nx=t; break } }
  const span = nx ? nx.n-cur.n : 1
  const prog = nx ? Math.max(0,Math.min(1,(count-cur.n)/span)) : 1
  return {cur,nx,prog}
}

/* rareté dérivée du score (0-100) */
function rarity(score){
  const s=+score||0
  if(s>=90) return {cls:"r-leg", lbl:{fr:"LÉGENDAIRE",en:"LEGENDARY",es:"LEGENDARIA"}, stars:"★★★★★"}
  if(s>=80) return {cls:"r-epic",lbl:{fr:"ÉPIQUE",en:"EPIC",es:"ÉPICA"},           stars:"★★★★☆"}
  if(s>=65) return {cls:"r-rare",lbl:{fr:"RARE",en:"RARE",es:"RARA"},               stars:"★★★☆☆"}
  return            {cls:"r-com", lbl:{fr:"COMMUNE",en:"COMMON",es:"COMÚN"},         stars:"★★☆☆☆"}
}

/* emoji-type : varie le visuel même entre plages « propres » */
function typeEmoji(b){
  if(b.status==="avoid") return "⚠️"
  if(b.snorkel) return "🐠"
  if(b.status==="moderate") return "🌬️"
  if((b.score||0)>=88) return "🌴"
  return "🌊"
}

/* n° de carte (depuis l'id : mq016 → 016) */
function cardNum(b){ const m=b&&b.id&&String(b.id).match(/(\d+)/); return m?m[1].padStart(3,"0"):"—" }

/* « pouvoirs » = vraies caractéristiques de la plage (mesuré, pas deviné) */
function powers(b,lang){
  const _t=(o)=>o[lang]||o.fr
  const out=[]
  if(b.status==="avoid") out.push(["☠",_t({fr:"Sargasses +++",en:"Sargassum +++",es:"Sargazo +++"})])
  else if(b.status==="moderate") out.push(["👁",_t({fr:"À surveiller",en:"Watch it",es:"Vigilar"})])
  if(b.snorkel) out.push(["🤿",_t({fr:"Snorkeling",en:"Snorkeling",es:"Snorkel"})])
  if(b.kids) out.push(["👶",_t({fr:"Familles",en:"Families",es:"Familias"})])
  if(b.parking) out.push(["🅿️",_t({fr:"Parking",en:"Parking",es:"Parking"})])
  if(b.drive!=null&&isFinite(b.drive)) out.push(["🚗",_t({fr:"à "+b.drive+" min",en:b.drive+" min away",es:"a "+b.drive+" min"})])
  if(!out.length) out.push(["≈",_t({fr:"Eau calme",en:"Calm water",es:"Agua tranquila"})])
  return out.slice(0,2)
}

/* ---- illustration golden-hour (portée de comic-cartes.html, en JSX) ---- */
function Illu({st,uid,score=0}){
  const sea = st==="bad" ? "#7a8a4a" : st==="mod" ? "#3a8f86" : "#2bb6a6"
  const gid = "lcg"+uid
  const top = score>=85   /* plages d'exception → oiseaux + soleil franc */
  return (
    <svg viewBox="0 0 200 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1f6f9e"/><stop offset=".55" stopColor="#5fb6d6"/>
        <stop offset=".8" stopColor="#ffb267"/><stop offset="1" stopColor="#ff8a3d"/>
      </linearGradient></defs>
      <rect width="200" height="96" fill={`url(#${gid})`}/>
      <circle cx="150" cy="60" r="26" fill="#ffe08a" opacity=".5"/>
      <circle cx="150" cy="60" r="16" fill="#fff2c4"/>
      <g stroke="#fff" strokeOpacity=".3" strokeWidth="1.4">
        <line x1="10" y1="20" x2="70" y2="17"/><line x1="6" y1="32" x2="56" y2="30"/>
      </g>
      <path d="M0 64 H200 V96 H0 Z" fill={sea}/>
      <path d="M0 64 q50 -6 100 0 t100 0 V76 H0 Z" fill="#2bb6a6" opacity=".6"/>
      <path d="M0 84 Q100 78 200 86 V96 H0 Z" fill="#f3d9a3"/>
      <path d="M0 84 Q100 78 200 86" fill="none" stroke="#0d0b14" strokeWidth="1.5"/>
      <g stroke="#0d0b14" strokeWidth="2.5" fill="none" strokeLinecap="round"><path d="M34 92 Q30 70 38 56"/></g>
      <g fill="#1c7a3a" stroke="#0d0b14" strokeWidth="1.4">
        <path d="M38 56 Q22 49 16 53 Q29 51 38 58Z"/><path d="M38 56 Q56 48 62 52 Q47 51 38 58Z"/>
        <path d="M38 56 Q31 42 25 41 Q36 48 39 57Z"/><path d="M38 56 Q47 43 55 43 Q41 48 39 57Z"/>
      </g>
      {st==="bad"&&(
        <g fill="#6b4a26" stroke="#0d0b14" strokeWidth="1" opacity=".9">
          <ellipse cx="80" cy="80" rx="16" ry="5"/><ellipse cx="120" cy="86" rx="20" ry="6"/>
          <ellipse cx="150" cy="80" rx="13" ry="4"/>
        </g>
      )}
      {top&&(
        <g stroke="#0d0b14" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".75">
          <path d="M96 26 q5 -4 10 0 q5 -4 10 0"/><path d="M120 34 q4 -3 8 0 q4 -3 8 0"/>
        </g>
      )}
    </svg>
  )
}

/* ---- Le Veilleur (satellite-œil) — iris piloté par l'humeur ---- */
function Veilleur({mood,size=64}){
  const iris=MOOD_COL[mood]||MOOD_COL.calm
  return (
    <svg className="lc-veil" viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      {/* panneaux solaires */}
      <g stroke="#0d0b14" strokeWidth="2.5">
        <rect x="6" y="50" width="20" height="22" rx="2" fill="#27a9e3"/>
        <rect x="94" y="50" width="20" height="22" rx="2" fill="#27a9e3"/>
        <line x1="26" y1="61" x2="40" y2="61"/><line x1="94" y1="61" x2="80" y2="61"/>
      </g>
      {/* corps */}
      <circle cx="60" cy="62" r="34" fill="#fdf6e3" stroke="#0d0b14" strokeWidth="3"/>
      {/* antenne */}
      <line x1="60" y1="28" x2="60" y2="14" stroke="#0d0b14" strokeWidth="3"/>
      <circle cx="60" cy="11" r="5" fill="#ffd23f" stroke="#0d0b14" strokeWidth="2.5"/>
      {/* œil / iris */}
      <circle cx="60" cy="62" r="20" fill="#0d0b14"/>
      <circle className="lc-iris" cx="60" cy="62" r="14" fill={iris}/>
      <circle cx="60" cy="62" r="6" fill="#0d0b14"/>
      <circle cx="64" cy="58" r="2.5" fill="#fff"/>
      {/* paupière (clignement comic steppé) */}
      <rect className="lc-lid" x="39" y="41" width="42" height="22" fill="#fdf6e3"/>
      {/* sourcil + sourire */}
      <path d="M44 40 Q60 34 76 40" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
      <path d="M50 86 Q60 92 70 86" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  )
}

/* ---- carte TCG (face révélée) ---- */
function TCard({beach,lang,onTap,rot=0,collected=true}){
  const v=vof(beach.status), r=rarity(beach.score)
  const uid=beach.id||Math.random().toString(36).slice(2,7)
  const _t=(o)=>o[lang]||o.fr
  const sc=beach.score!=null?Math.round(beach.score):null
  const pw=powers(beach,lang)
  return (
    <button type="button" className={`lc-card ${r.cls} ${collected?"":"lc-locked"}`} style={{"--rot":rot+"deg"}}
      onClick={onTap} aria-label={beach.name}>
      <span className={`lc-pow s-${v.st}`}><b>{_t(v.no)}</b></span>
      <span className="lc-in">
        <span className={`lc-bn s-${v.st}`}>
          <span className="lc-nm">{beach.name}</span>
          <span className="lc-sc">{sc!=null?sc:"—"}</span>
          <span className="lc-ty">{typeEmoji(beach)}</span>
        </span>
        <span className="lc-hp" aria-hidden="true"><span className={`lc-hpfill s-${v.st}`} style={{width:(sc||0)+"%"}}/></span>
        <span className="lc-illu"><Illu st={v.st} score={sc||0} uid={uid}/>
          <span className="lc-rar">{r.stars} {_t(r.lbl)}</span></span>
        <span className="lc-bd">
          {pw.map(([e,t],i)=>(
            <span className="lc-atk" key={i}><span className="lc-atke">{e}</span>
              <span className="lc-atkt">{t}</span></span>
          ))}
          <span className="lc-ft"><span>N° {cardNum(beach)}</span><span>{beach.commune||"Copernicus"}</span></span>
        </span>
      </span>
      {!collected&&<span className="lc-collect">{_t({fr:"COLLECTER",en:"COLLECT",es:"COLECCIONAR"})}</span>}
    </button>
  )
}

/* DÉTAIL PLAGE « en monde comic » — ouvert au tap d'une carte. Garde le joueur
   dans l'univers arène (mêmes police/couleurs/Veilleur) au lieu de l'éjecter
   vers l'app sombre. Le seul handoff = le CTA premium (moment de conversion). */
export function ChasseDetail({beach,lang,onClose,onPremium,onFull,onRelated,pool=[],track}){
  const rel=(pool||[]).filter(b=>b&&b.id&&b.id!==beach.id&&b.status&&b.score!=null).slice(0,3)
  const _t=(o)=>(o&&(o[lang]||o.fr))||""
  const v=vof(beach.status), r=rarity(beach.score)
  const sc=beach.score!=null?Math.round(beach.score):null
  const pw=powers(beach,lang)
  const head = beach.status==="avoid" ? {fr:"ÉVITE CE MATIN",en:"AVOID THIS MORNING",es:"EVITA HOY"}
    : beach.status==="moderate" ? {fr:"À SURVEILLER",en:"KEEP AN EYE",es:"A VIGILAR"}
    : {fr:"BAIGNADE OK",en:"SWIM OK",es:"BAÑO OK"}
  useEffect(()=>{ try{ document.body.style.overflow="hidden" }catch(_){}; return ()=>{ try{ document.body.style.overflow="" }catch(_){} } },[])
  /* a11y clavier : Échap ferme le détail plein écran */
  useEffect(()=>{ const k=(e)=>{ if(e.key==="Escape"){ e.stopPropagation(); onClose&&onClose() } }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k) },[onClose])
  /* a11y focus : à l'ouverture, le focus entre dans le dialog (bouton fermer) */
  const closeRef=useRef(null)
  useEffect(()=>{ try{ closeRef.current&&closeRef.current.focus() }catch(_){} },[])
  return (
    <div className="lc-detail" role="dialog" aria-modal="true" aria-label={beach.name}>
      <button type="button" ref={closeRef} className="lc-detail-x" onClick={onClose} aria-label="Fermer">✕</button>
      <div className={`lc-detail-illu s-${v.st}`}>
        <Illu st={v.st} score={sc||0} uid={(beach.id||"d")+"-dt"}/>
        <svg className="lc-zip" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {Array.from({length:20}).map((_,i)=>{const a=(i/20)*Math.PI*2,x1=100+Math.cos(a)*28,y1=100+Math.sin(a)*28,x2=100+Math.cos(a)*180,y2=100+Math.sin(a)*180;return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>})}
        </svg>
        <span className="lc-detail-veil"><Veilleur mood={v.mood} size={62}/></span>
        <span className={`lc-detail-tag s-${v.st}`}>{r.stars} {_t(r.lbl)} · N° {cardNum(beach)}</span>
      </div>
      <div className="lc-detail-body">
        <h2 className="lc-detail-name">{beach.name}</h2>
        <div className={`lc-detail-head s-${v.st}`}>{_t(head)}</div>
        <div className="lc-detail-sub">{_t({fr:"Mesuré au satellite ce matin — pas deviné.",en:"Measured by satellite this morning — not guessed.",es:"Medido por satélite — no adivinado."})}</div>
        <div className="lc-detail-score">
          <span className="lc-detail-scnum">{sc!=null?sc:"—"}<small>/100</small></span>
          <span className="lc-hp"><span className={`lc-hpfill s-${v.st}`} style={{width:(sc||0)+"%"}}/></span>
        </div>
        <div className="lc-detail-facts">
          {pw.map(([e,t],i)=><span className="lc-detail-fact" key={i}><b>{e}</b> {t}</span>)}
          {beach.commune&&<span className="lc-detail-fact">📍 {beach.commune}</span>}
        </div>

        {/* 7 PROCHAINS JOURS — aujourd'hui réel, le reste verrouillé (honnête) → premium */}
        <div className="lc-detail-fc">
          <div className="lc-detail-fc-h">{_t({fr:"7 PROCHAINS JOURS",en:"NEXT 7 DAYS",es:"PRÓXIMOS 7 DÍAS"})}</div>
          <div className="lc-detail-fc-row" onClick={()=>{ if(track)try{track("sg_chasse_detail_premium",{beach_id:beach.id,from:"fcstrip"})}catch(_){}; onPremium&&onPremium("chasse_detail_fc") }}>
            {Array.from({length:7}).map((_,i)=>{
              const d=new Date(Date.now()+i*864e5)
              const dl=["D","L","M","M","J","V","S"][d.getDay()]
              return (
                <div key={i} className={"lc-fc-cell"+(i===0?` s-${v.st} now`:" lock")}>
                  <span className="lc-fc-day">{i===0?_t({fr:"Auj",en:"Now",es:"Hoy"}):dl}</span>
                  <span className="lc-fc-dot">{i===0?(sc!=null?sc:"•"):"🔒"}</span>
                </div>
              )
            })}
          </div>
        </div>

        <button type="button" className="lc-cta yel" onClick={()=>{ if(track)try{track("sg_chasse_detail_premium",{beach_id:beach.id})}catch(_){}; onPremium&&onPremium("chasse_detail") }}>
          {_t({fr:"VOIR LES 7 PROCHAINS JOURS →",en:"SEE THE NEXT 7 DAYS →",es:"VER LOS 7 DÍAS →"})}
        </button>
        <button type="button" className="lc-detail-full" onClick={onFull}>
          {_t({fr:"Fiche complète & carte →",en:"Full sheet & map →",es:"Ficha completa y mapa →"})}
        </button>

        {rel.length>0&&(
          <div className="lc-detail-rel">
            <div className="lc-detail-fc-h">{_t({fr:"PLAGES VOISINES",en:"NEARBY BEACHES",es:"PLAYAS CERCA"})}</div>
            <div className="lc-detail-rel-row">
              {rel.map(b=>(
                <div className="lc-detail-rel-card" key={b.id}>
                  <TCard beach={b} lang={lang} onTap={()=>onRelated&&onRelated(b)}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const I18N={
  eyebrow:{fr:"LA CHASSE · EN DIRECT",en:"THE HUNT · LIVE",es:"LA CAZA · EN DIRECTO"},
  guessTitle:{fr:"DEVINE LE VERDICT",en:"GUESS THE VERDICT",es:"ADIVINA EL VEREDICTO"},
  guessSub:{fr:"La carte du jour. Mesurée au satellite, pas devinée — à toi de jouer.",
            en:"Today's card. Measured by satellite, not guessed — your turn.",
            es:"La carta del día. Medida por satélite, no adivinada — te toca."},
  win:{fr:"BIEN VU !",en:"NICE!",es:"¡BIEN!"},
  lose:{fr:"RATÉ !",en:"MISSED!",es:"¡FALLASTE!"},
  reveal:{fr:"Verdict mesuré",en:"Measured verdict",es:"Veredicto medido"},
  streak:{fr:"série",en:"streak",es:"racha"},
  best:{fr:"record",en:"best",es:"récord"},
  back:{fr:"reviens demain pour la prochaine carte",en:"come back tomorrow for the next card",es:"vuelve mañana por la próxima carta"},
  openBeach:{fr:"Voir ma plage en détail →",en:"See my beach in detail →",es:"Ver mi playa en detalle →"},
  collTitle:{fr:"MA COLLECTION",en:"MY COLLECTION",es:"MI COLECCIÓN"},
  collSub:{fr:(n,t)=>`${n}/${t} plages collectées · tape une carte pour l'ouvrir`,
           en:(n,t)=>`${n}/${t} beaches collected · tap a card to open it`,
           es:(n,t)=>`${n}/${t} playas coleccionadas · toca una carta`},
  lockTitle:{fr:"LES 7 JOURS",en:"THE 7 DAYS",es:"LOS 7 DÍAS"},
  lockSub:{fr:"Débloque la prévision plage par plage, et l'alerte le jour où ça bascule.",
           en:"Unlock the forecast beach by beach, and the alert the day it flips.",
           es:"Desbloquea el pronóstico playa por playa, y la alerta el día que cambia."},
  lockCta:{fr:"Activer mon Veilleur",en:"Turn on my Veilleur",es:"Activar mi Veilleur"},
  mapLink:{fr:"Ouvrir la carte en direct",en:"Open the live map",es:"Abrir el mapa en directo"},
  guessBtn:{clean:{fr:"PROPRE",en:"CLEAN",es:"LIMPIA"},moderate:{fr:"MODÉRÉ",en:"MODERATE",es:"MODERADA"},avoid:{fr:"À ÉVITER",en:"AVOID",es:"EVITAR"}}
}

export default function ChasseHome(props){
  const {beach,lang="fr",sargData,pickBeaches=[],onOpen,onOpenBeach,onPremium,onShowMap,onCaptureEmail,track,exiting}=props
  const _t=useCallback((o)=>{ const v=o&&(o[lang]!=null?o[lang]:o.fr); return v },[lang])

  const reduce = useMemo(()=>{ try{ return window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches }catch(_){ return false } },[])

  const [st,setSt]=useState(loadState)
  const playedToday = st.played===todayKey()
  const [revealed,setRevealed]=useState(playedToday)   /* carte du jour retournée ? */
  const [outcome,setOutcome]=useState(playedToday?(st.guessOk?"win":"lose"):null)
  const [mood,setMood]=useState(()=> playedToday ? vof(beach?.status).mood : "scan")
  /* re-sync l'humeur si la plage arrive après le mount sur un jour déjà joué (évite iris faux) */
  useEffect(()=>{ if(playedToday&&beach) setMood(vof(beach.status).mood) },[beach,playedToday])
  const [detail,setDetail]=useState(null)   /* plage ouverte en détail (monde comic) */
  /* capture email (funnel) — l'arène est l'accueil 100% : sans ça, plus de leads */
  const [capEmail,setCapEmail]=useState("")
  const [capDone,setCapDone]=useState(()=>{ try{ return !!localStorage.getItem("sg_email") }catch(_){ return false } })
  const submitCap=useCallback((e)=>{ if(e&&e.preventDefault)e.preventDefault()
    const em=(capEmail||"").trim(); if(!em||!em.includes("@")||!em.includes("."))return
    try{ localStorage.setItem("sg_email",em) }catch(_){}
    try{ onCaptureEmail&&onCaptureEmail(em) }catch(_){}
    if(track)try{track("sg_email_submit",{source:"chasse"})}catch(_){}
    setCapDone(true)
  },[capEmail,onCaptureEmail,track])
  const openDetail=useCallback((b,src)=>{ if(!b)return; if(track)try{track("sg_chasse_card_open",{beach_id:b.id,which:src})}catch(_){}; setDetail(b) },[track])

  /* collection : on sème avec la plage du jour + ce qui est déjà collecté */
  const collected = st.collected||[]
  const collSet = useMemo(()=>new Set(collected),[collected])

  const fresh = useMemo(()=>{
    try{ const u=sargData&&(sargData.updatedAt||sargData.erddapTimestamp); if(!u) return null
      const age=(Date.now()-new Date(u).getTime())/36e5; if(!isFinite(age)||age<0||age>12) return null
      return age<1 ? _t({fr:"il y a "+Math.max(1,Math.round(age*60))+" min",en:Math.max(1,Math.round(age*60))+" min ago",es:"hace "+Math.max(1,Math.round(age*60))+" min"})
                   : _t({fr:"il y a "+Math.round(age)+" h",en:Math.round(age)+"h ago",es:"hace "+Math.round(age)+" h"}) }
    catch(_){ return null }
  },[sargData,_t])

  useEffect(()=>{ if(track) try{ track("sg_chasse_shown",{beach:beach?.id,score:beach?.score,status:beach?.status,streak:st.streak,collected:collected.length,variant:"chasse"}) }catch(_){} },[]) // eslint-disable-line

  const persist=useCallback((next)=>{ setSt(next); saveState(next) },[])

  /* collectionner une plage (taper une carte) */
  const collect=useCallback((b)=>{
    if(!b||!b.id) return
    setSt(prev=>{ if(prev.collected.includes(b.id)) return prev
      const next={...prev,collected:[...prev.collected,b.id]}; saveState(next); return next })
  },[])

  /* BOOSTER DU JOUR — 3 cartes, stables sur la journée (offset = index du jour).
     La VEDETTE (carte révélée en dernier) = la plage du hero ; +2 plages
     bonus piochées dans la région. Disposées en éventail, vedette devant. */
  const packBeaches = useMemo(()=>{
    if(!beach) return []
    const pool=(pickBeaches||[]).filter(b=>b&&b.id&&b.id!==beach.id&&b.status&&b.score!=null)
    const doy=Math.floor(Date.now()/864e5)
    const bonus=[]
    for(let k=0;k<2&&pool.length;k++){ bonus.push(pool[(doy*2+k)%pool.length]) }
    return [beach,...bonus]   /* [vedette, g, d] */
  },[beach,pickBeaches])

  /* duel : devine le verdict de la VEDETTE → ouvre le booster (les 3 cartes) */
  const guess=useCallback((status)=>{
    if(revealed||!beach) return
    const real=beach.status||"clean"
    const ok = (status===real)
    setOutcome(ok?"win":"lose")
    setMood(vof(real).mood)
    setRevealed(true)
    /* série : +1 si bien vu ET (premier jeu ou enchaîné depuis hier), sinon repart à 1 (win) / 0 (lose) */
    const cont = st.last===yesterdayKey()||st.last===todayKey()
    let streak = ok ? ( (st.last===null||cont) ? st.streak+1 : 1 ) : 0
    const best=Math.max(st.best,streak)
    /* on collectionne TOUT le pack (vedette + bonus) */
    const ids=packBeaches.map(b=>b&&b.id).filter(Boolean)
    const coll=[...st.collected]; ids.forEach(id=>{ if(!coll.includes(id)) coll.push(id) })
    persist({...st, streak, best, last:todayKey(), played:todayKey(), guessOk:ok, collected:coll})
    if(track) try{ track("sg_chasse_guess",{correct:ok?1:0,guess:status,real,streak,pack:ids.length}) }catch(_){}
  },[revealed,beach,st,persist,track,packBeaches])

  /* POKÉDEX — toutes les plages de la région (collectées en couleur, sinon grisées) */
  const collList = useMemo(()=>{
    return (pickBeaches||[]).filter(b=>b&&b.id&&b.status&&b.score!=null)
      .sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,90)
  },[pickBeaches])
  const dexTotal = useMemo(()=>Math.min((pickBeaches||[]).filter(b=>b&&b.id&&b.status&&b.score!=null).length,90),[pickBeaches])

  const dayV = beach ? vof(beach.status) : VERDICT.clean
  const vedRare = beach ? rarity(beach.score).cls : "r-com"   /* rareté de la vedette (tension du pull) */
  const tier = useMemo(()=>tierOf(collSet.size),[collSet])
  const dateLbl = useMemo(()=>{
    const d=new Date(), moFR=["JANV.","FÉVR.","MARS","AVR.","MAI","JUIN","JUIL.","AOÛT","SEPT.","OCT.","NOV.","DÉC."]
    return d.getDate()+" "+moFR[d.getMonth()]
  },[])

  return (
    <div className={"lc-root"+(reduce?" lc-reduce":"")} role="dialog" aria-label="La Chasse"
      style={{position:"absolute",inset:0,zIndex:1050,overflowY:"auto",overflowX:"hidden",
        WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",
        opacity:exiting?0:1,transform:exiting?"scale(1.04)":"none",
        transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}}>
      <style>{CSS}</style>

      {/* ---- barre haute : Veilleur + EN DIRECT + série ---- */}
      <div className="lc-top">
        <div className="lc-veilwrap"><Veilleur mood={mood} size={52}/></div>
        <div className="lc-live">
          <span className="lc-eyebrow">{_t(I18N.eyebrow)}</span>
          <span className="lc-date">{dateLbl}{fresh?" · maj "+fresh:""}</span>
        </div>
        <div className="lc-streak" title={_t(I18N.streak)}>
          <span className="lc-fire">🔥</span><b>{st.streak}</b>
          <small>{_t(I18N.best)} {st.best}</small>
        </div>
      </div>

      {/* ---- CARTE DU JOUR : duel → reveal ---- */}
      <section className="lc-hero">
        <div className="lc-eyebrow lc-center">{revealed?_t(I18N.reveal):_t(I18N.guessTitle)}</div>
        {!revealed && <p className="lc-sub">{_t(I18N.guessSub)}</p>}

        {!beach ? <div className="lc-fanwrap"/> : !revealed ? (
          <>
            {/* PACK FERMÉ */}
            <div className="lc-pack">
              <div className="lc-pack-shine" aria-hidden="true"/>
              <div className="lc-pack-top"><Veilleur mood="scan" size={84}/></div>
              <div className="lc-pack-lbl">{_t({fr:"PACK DU JOUR",en:"DAILY PACK",es:"PACK DEL DÍA"})}</div>
              <div className="lc-pack-count">{_t({fr:"3 cartes à révéler",en:"3 cards to reveal",es:"3 cartas por revelar"})}</div>
            </div>
            <div className="lc-guesses">
              {["clean","moderate","avoid"].map(s=>(
                <button key={s} type="button" className={`lc-gbtn s-${vof(s).st}`} onClick={()=>guess(s)}>
                  {_t(I18N.guessBtn[s])}
                </button>
              ))}
            </div>
            <div className="lc-backnote lc-rip">{_t({fr:"devine la vedette → ouvre ton booster",en:"guess the star → rip your booster",es:"adivina la estrella → abre tu sobre"})}</div>
          </>
        ) : (
          <>
            <div className={"lc-fanwrap "+vedRare}>
              {vedRare==="r-leg"&&<div className="lc-halo" aria-hidden="true"/>}
              <div className={"lc-flash"+(vedRare==="r-leg"?" leg":"")} aria-hidden="true"/>
              <svg className={`lc-burst s-${dayV.st}`} viewBox="0 0 300 300" aria-hidden="true">
                {Array.from({length:18}).map((_,i)=>{
                  const a=(i/18)*Math.PI*2, x1=150+Math.cos(a)*70, y1=150+Math.sin(a)*70,
                        x2=150+Math.cos(a)*150, y2=150+Math.sin(a)*150
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={i%2?6:10}/>
                })}
              </svg>
              <div className="lc-fan">
                {packBeaches.map((b,i)=>{
                  const fan=[{r:0,x:0,z:3,d:.55},{r:-13,x:-60,z:1,d:0},{r:13,x:60,z:2,d:.27}][i]||{r:0,x:0,z:1,d:0}
                  return (
                    <div className="lc-fancard" key={b.id||i}
                      style={{"--d":fan.d+"s",zIndex:fan.z,
                        transform:`translateX(calc(-50% + ${fan.x}px)) rotate(${fan.r}deg)`}}>
                      {i===0&&<span className={`lc-pow s-${dayV.st} lc-verdictpow`}><b>{outcome==="win"?_t(I18N.win):_t(I18N.lose)}</b></span>}
                      <TCard beach={b} lang={lang}
                        onTap={()=>{ if(i!==0) collect(b); openDetail(b,i===0?"day":"pack") }}/>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="lc-result">
              <div className={"lc-streakup"+(outcome==="win"?" win":"")}>
                {outcome==="win"
                  ? _t({fr:"+1 · série "+st.streak+" 🔥",en:"+1 · streak "+st.streak+" 🔥",es:"+1 · racha "+st.streak+" 🔥"})
                  : _t({fr:"série à 0 — la vedette était "+_t(dayV),en:"streak reset — the star was "+_t(dayV),es:"racha a 0 — la estrella era "+_t(dayV)})}
              </div>
              <button type="button" className="lc-cta yel"
                onClick={()=>openDetail(beach,"cta")}>
                {_t(I18N.openBeach)}
              </button>
              <div className="lc-backnote">{_t(I18N.back)}</div>
            </div>
          </>
        )}
      </section>

      {/* ---- CAPTURE EMAIL (funnel — gratuit, distinct du premium) ---- */}
      <section className="lc-capture">
        {capDone ? (
          <div className="lc-cap-done"><span>✅</span> {_t({fr:"C'est lancé — le verdict t'attendra chaque matin.",en:"You're set — the verdict waits each morning.",es:"¡Listo! El veredicto te espera cada mañana."})}</div>
        ) : (
          <div className="lc-cap-card">
            <div className="lc-eyebrow">{_t({fr:"LE VERDICT, CHAQUE MATIN",en:"THE VERDICT, EVERY MORNING",es:"EL VEREDICTO, CADA MAÑANA"})}</div>
            <p className="lc-sub">{_t({fr:"Reçois l'état de la mer par email — gratuit, zéro spam.",en:"Get the sea's status by email — free, no spam.",es:"Recibe el estado del mar por email — gratis, sin spam."})}</p>
            <form className="lc-cap-row" onSubmit={submitCap}>
              <input className="lc-cap-in" type="email" inputMode="email" autoComplete="email"
                placeholder={_t({fr:"ton email",en:"your email",es:"tu email"})}
                value={capEmail} onChange={e=>setCapEmail(e.target.value)} aria-label="email"/>
              <button type="submit" className="lc-cta yel lc-cap-btn">{_t({fr:"JE VEUX",en:"I'M IN",es:"QUIERO"})}</button>
            </form>
          </div>
        )}
      </section>

      {/* ---- COLLECTION ---- */}
      <section className="lc-coll">
        <div className="lc-coll-h">
          <div className="lc-eyebrow">{_t(I18N.collTitle)}</div>
          <div className="lc-coll-sub">{(I18N.collSub[lang]||I18N.collSub.fr)(collSet.size,dexTotal||collList.length)}</div>
          {/* PALIER : titre du Veilleur + progression vers le rang suivant */}
          <div className="lc-rank">
            <span className="lc-rank-badge" style={{background:tier.cur.iris}}>{_t(tier.cur)}</span>
            <div className="lc-rank-bar"><div className="lc-rank-fill" style={{width:Math.round(tier.prog*100)+"%",background:tier.cur.iris}}/></div>
            <span className="lc-rank-next">{tier.nx
              ? _t({fr:(tier.nx.n-collSet.size)+" → "+tier.nx.fr,en:(tier.nx.n-collSet.size)+" → "+tier.nx.en,es:(tier.nx.n-collSet.size)+" → "+tier.nx.es})
              : _t({fr:"rang max 👑",en:"max rank 👑",es:"rango máx 👑"})}</span>
          </div>
        </div>
        <div className="lc-grid">
          {collList.map((b,i)=>(
            <TCard key={b.id} beach={b} lang={lang} rot={(i%2?1:-1)*(0.6+(i%3)*0.4)}
              collected={collSet.has(b.id)}
              onTap={()=>{ collect(b); openDetail(b,"coll") }}/>
          ))}
        </div>
      </section>

      {/* ---- PRÉVISION 7J = premium ---- */}
      <section className="lc-lock">
        <div className="lc-lock-card">
          <div className="lc-lock-badge">🔒 7J</div>
          <div className="lc-eyebrow">{_t(I18N.lockTitle)}</div>
          <p className="lc-sub lc-center">{_t(I18N.lockSub)}</p>
          <button type="button" className="lc-cta" onClick={()=>onPremium&&onPremium("chasse_lock")}>{_t(I18N.lockCta)}</button>
        </div>
        <button type="button" className="lc-maplink" onClick={()=>onShowMap&&onShowMap()}>{_t(I18N.mapLink)}</button>
      </section>

      {detail&&<ChasseDetail beach={detail} lang={lang} track={track} pool={collList}
        onClose={()=>setDetail(null)}
        onPremium={(src)=>{ setDetail(null); onPremium&&onPremium(src||"chasse_detail") }}
        onRelated={(b)=>{ collect(b); if(track)try{track("sg_chasse_card_open",{beach_id:b.id,which:"related"})}catch(_){}; setDetail(b) }}
        onFull={()=>{ const b=detail; setDetail(null); onOpenBeach&&onOpenBeach(b) }}/>}
    </div>
  )
}

/* ====================================================================
   CSS — entièrement scopé `.lc-`. Tokens & cartes portés de
   public/comic-cartes.html + public/themes-lab/arena.css.
   ==================================================================== */
const CSS=`
@font-face{font-family:"AntonLC";src:url("/fonts/anton-1Ptgg87LROyAm3Kz-C8.woff2") format("woff2");font-weight:400;font-display:swap}
.lc-root{--ink:#0d0b14;--paper:#fdf6e3;--red:#e8322a;--yel:#ffd23f;--blu:#27a9e3;--org:#ff8a3d;--grn:#27c46b;--pur:#7b46d6;
  font-family:"Comic Neue","Comic Sans MS",system-ui,sans-serif;color:var(--ink);
  background:
    radial-gradient(rgba(13,11,20,.14) 1.4px,transparent 1.5px) 0 0/9px 9px,
    radial-gradient(rgba(13,11,20,.14) 1.4px,transparent 1.5px) 4.5px 4.5px/9px 9px,
    radial-gradient(rgba(214,0,92,.06) 1.3px,transparent 1.4px) 2px 1px/7px 7px,
    linear-gradient(170deg,#2bb6ef,#5fc8ef 30%,#ffb36b 66%,#ff8a3d);
  padding:14px 12px 60px;-webkit-tap-highlight-color:transparent}
.lc-root *{box-sizing:border-box}
.lc-eyebrow{font-family:"AntonLC",system-ui,sans-serif;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--ink);
  background:var(--yel);display:inline-block;border:2px solid var(--ink);padding:3px 9px;border-radius:5px;box-shadow:2px 2px 0 var(--ink)}
.lc-center{display:block;margin:0 auto;text-align:center}
.lc-sub{font-size:13px;line-height:1.35;color:#241f30;max-width:340px;margin:8px auto 0;text-align:center}

/* barre haute */
.lc-top{display:flex;align-items:center;gap:10px;max-width:520px;margin:0 auto 6px}
.lc-veilwrap{flex:0 0 auto;filter:drop-shadow(2px 2px 0 rgba(13,11,20,.4))}
.lc-live{flex:1;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.lc-date{font-weight:700;font-size:11px;color:#fff;text-shadow:1px 1px 0 rgba(13,11,20,.6)}
.lc-streak{flex:0 0 auto;background:var(--paper);border:2.5px solid var(--ink);border-radius:14px;padding:4px 10px;
  box-shadow:3px 3px 0 var(--ink);text-align:center;line-height:1}
.lc-streak .lc-fire{font-size:15px}
.lc-streak b{font-family:"AntonLC",system-ui,sans-serif;font-size:18px;margin-left:2px}
.lc-streak small{display:block;font-size:8.5px;font-weight:700;color:#7a7488;letter-spacing:.3px;margin-top:2px;text-transform:uppercase}

/* hero / carte du jour */
.lc-hero{max-width:520px;margin:14px auto 0;text-align:center}
.lc-flip{width:230px;margin:14px auto 0;perspective:1100px}
.lc-flip-inner{position:relative;width:100%;aspect-ratio:5/7;transform-style:preserve-3d;
  transition:transform .8s cubic-bezier(.55,.06,.32,1.3)}
.lc-flip.is-rev .lc-flip-inner{transform:rotateY(180deg)}
.lc-reduce .lc-flip-inner{transition:none}
.lc-face{position:absolute;inset:0;-webkit-backface-visibility:hidden;backface-visibility:hidden;display:flex}
.lc-front{align-items:center;justify-content:center;flex-direction:column;gap:10px;
  border-radius:16px;border:3px solid var(--ink);box-shadow:0 8px 0 rgba(13,11,20,.4);
  background:repeating-linear-gradient(135deg,#7b46d6 0 14px,#6a3bc0 14px 28px)}
.lc-back-art{position:relative;display:grid;place-items:center}
.lc-back-q{position:absolute;font-family:"AntonLC",system-ui,sans-serif;font-size:54px;color:#fff;text-shadow:3px 3px 0 var(--ink)}
.lc-back-lbl{font-family:"AntonLC",system-ui,sans-serif;font-size:15px;color:#fff;text-shadow:2px 2px 0 var(--ink);
  text-transform:uppercase;letter-spacing:.4px;padding:0 10px}
.lc-rear{transform:rotateY(180deg);align-items:stretch;justify-content:center}
.lc-rear .lc-card{width:100%}
.lc-stage{position:relative;width:230px;margin:14px auto 0}
.lc-stage .lc-flip{margin-top:0}
.lc-burst{position:absolute;top:50%;left:50%;width:420px;height:420px;transform:translate(-50%,-50%);z-index:0;
  pointer-events:none;animation:lc-burstin .55s cubic-bezier(.2,1.1,.3,1) both}
.lc-burst line{stroke:#0d0b14;opacity:.22;stroke-linecap:round}
.lc-burst.s-ok line{stroke:#19a85f;opacity:.5}.lc-burst.s-mod line{stroke:#e08a1e;opacity:.5}.lc-burst.s-bad line{stroke:#d8351f;opacity:.5}
.lc-stage .lc-flip{position:relative;z-index:1}
.lc-reduce .lc-burst{animation:none;opacity:.4}
@keyframes lc-burstin{0%{transform:translate(-50%,-50%) scale(.2) rotate(-30deg);opacity:0}
  60%{opacity:.8}100%{transform:translate(-50%,-50%) scale(1) rotate(0);opacity:.6}}
.lc-streakup{font-family:"AntonLC",system-ui,sans-serif;font-size:15px;letter-spacing:.4px;color:#fff;
  background:rgba(13,11,20,.65);border:2.5px solid var(--ink);border-radius:20px;padding:5px 14px;
  text-shadow:1.5px 1.5px 0 var(--ink);box-shadow:3px 3px 0 var(--ink)}
.lc-streakup.win{background:linear-gradient(180deg,#3fd98a,var(--grn))}

/* boutons guess */
.lc-guesses{display:flex;gap:8px;max-width:340px;margin:16px auto 0}
.lc-gbtn{-webkit-appearance:none;appearance:none;flex:1;font-family:"AntonLC",system-ui,sans-serif;font-size:13px;letter-spacing:.3px;color:#fff;
  border:3px solid var(--ink);border-radius:11px;padding:11px 6px;text-shadow:1.5px 1.5px 0 rgba(13,11,20,.6);
  box-shadow:3px 3px 0 var(--ink);cursor:pointer;transition:transform .08s}
.lc-gbtn:active{transform:translateY(3px);box-shadow:0 0 0 var(--ink)}
.lc-gbtn.s-ok{background:linear-gradient(180deg,#3fd98a,var(--grn))}
.lc-gbtn.s-mod{background:linear-gradient(180deg,#ffd569,var(--org));color:var(--ink);text-shadow:1px 1px 0 #fff}
.lc-gbtn.s-bad{background:linear-gradient(180deg,#ff6a4a,var(--red))}

/* résultat */
.lc-result{margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px}
.lc-verdictpow{transform:rotate(-4deg) scale(1.2);animation:lc-pop .5s cubic-bezier(.18,1.4,.4,1) both}
.lc-reduce .lc-verdictpow{animation:none}
@keyframes lc-pop{0%{transform:rotate(-4deg) scale(0)}70%{transform:rotate(-4deg) scale(1.35)}100%{transform:rotate(-4deg) scale(1.2)}}
.lc-cta{font-family:"AntonLC",system-ui,sans-serif;font-size:16px;letter-spacing:.5px;text-transform:uppercase;color:#fff;
  background:linear-gradient(180deg,#ff5a4f,var(--red));border:3px solid var(--ink);border-radius:12px;padding:12px 20px;
  text-shadow:2px 2px 0 rgba(13,11,20,.55);box-shadow:4px 4px 0 var(--ink);cursor:pointer;transition:transform .08s}
.lc-cta:active{transform:translateY(3px);box-shadow:0 1px 0 var(--ink)}
.lc-cta.yel{background:linear-gradient(180deg,#ffe06a,var(--yel));color:var(--ink);text-shadow:1px 1px 0 #fff}
.lc-backnote{font-size:11px;color:#fff;text-shadow:1px 1px 0 rgba(13,11,20,.5);font-weight:700}

/* collection */
.lc-coll{max-width:520px;margin:28px auto 0}
.lc-coll-h{text-align:center;margin-bottom:14px}
.lc-coll-sub{font-size:12px;color:#fff;text-shadow:1px 1px 0 rgba(13,11,20,.5);font-weight:700;margin-top:7px}
.lc-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
/* PERF : les cartes hors écran ne sont ni peintes ni animées (foil) */
.lc-grid .lc-card{content-visibility:auto;contain-intrinsic-size:auto 240px}

/* ---- DÉTAIL PLAGE « monde comic » (plein écran, même univers) ---- */
.lc-detail{position:fixed;inset:0;z-index:1200;overflow-y:auto;-webkit-overflow-scrolling:touch;
  font-family:"Comic Neue","Comic Sans MS",system-ui,sans-serif;color:var(--ink);
  background:
    radial-gradient(rgba(13,11,20,.12) 1.4px,transparent 1.5px) 0 0/9px 9px,
    linear-gradient(170deg,#2bb6ef,#5fc8ef 28%,#ffb36b 70%,#ff8a3d);
  animation:lc-detail-in .28s cubic-bezier(.22,1,.36,1) both}
@keyframes lc-detail-in{0%{opacity:0;transform:scale(.88) rotate(-1.2deg)}55%{opacity:1}100%{opacity:1;transform:none}}
.lc-reduce .lc-detail{animation:none}

/* ============================================================
   FX COMIC-BOOK ANIMÉ « Marvel / Spider-Verse » (réf : clip
   From The D 2 The LBC). Aberration chromatique + steps() +
   halftone désaligné + slam de case. Reduced-motion = figé.
   ============================================================ */
/* aberration chromatique steppée sur les gros titres encrés */
@keyframes lc-chroma{
  0%{text-shadow:-1.5px 0 rgba(255,0,92,.55),1.6px 0 rgba(0,214,255,.55),2px 2px 0 var(--ink)}
  100%{text-shadow:-2.6px .5px rgba(255,0,92,.6),2.6px -.5px rgba(0,214,255,.6),2px 2px 0 var(--ink)}}
.lc-detail-name,.lc-pack-lbl{animation:lc-chroma 1.6s steps(3) infinite alternate}
.lc-reduce .lc-detail-name,.lc-reduce .lc-pack-lbl{animation:none}
.lc-detail-x{position:fixed;top:calc(12px + env(safe-area-inset-top));right:12px;z-index:3;width:42px;height:42px;border-radius:50%;
  border:2.5px solid var(--ink);background:var(--yel);color:var(--ink);font-size:17px;font-weight:800;cursor:pointer;box-shadow:2px 2px 0 var(--ink)}
.lc-detail-illu{position:relative;height:230px;border-bottom:3px solid var(--ink);overflow:hidden}
.lc-detail-illu svg{position:absolute;inset:0;width:100%;height:100%}
.lc-detail-veil{position:absolute;left:50%;top:50%;transform:translate(-50%,-58%);filter:drop-shadow(2px 4px 0 rgba(13,11,20,.4));z-index:2}
.lc-detail-illu .lc-zip{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;
  stroke:rgba(255,255,255,.55);stroke-width:2.5;transform-origin:center;animation:lc-zip .5s steps(4,end) forwards}
@keyframes lc-zip{0%{opacity:.9;transform:scale(.55)}100%{opacity:0;transform:scale(1.6)}}
.lc-reduce .lc-detail-illu .lc-zip{display:none}
.lc-detail-tag{position:absolute;left:12px;bottom:10px;font-family:"AntonLC",system-ui,sans-serif;font-size:10px;color:#fff;
  background:var(--ink);border:2px solid #fff;padding:3px 9px;border-radius:14px;letter-spacing:.5px}
.lc-detail-body{max-width:520px;margin:0 auto;padding:16px 18px 60px}
.lc-detail-name{font-family:"AntonLC",system-ui,sans-serif;font-size:30px;line-height:1;margin:6px 0 8px;color:var(--ink);
  text-shadow:2px 2px 0 #fff;letter-spacing:.3px}
.lc-detail-head{display:inline-block;font-family:"AntonLC",system-ui,sans-serif;font-size:22px;color:#fff;
  border:2.5px solid var(--ink);border-radius:9px;padding:5px 12px;box-shadow:3px 3px 0 var(--ink);transform:rotate(-1.5deg)}
.lc-detail-head.s-ok{background:var(--grn)}.lc-detail-head.s-mod{background:var(--org)}.lc-detail-head.s-bad{background:var(--red)}
.lc-detail-sub{font-size:13px;font-weight:700;margin:11px 0 14px;color:#0d2330}
.lc-detail-score{display:flex;align-items:center;gap:11px;margin-bottom:14px}
.lc-detail-scnum{font-family:"AntonLC",system-ui,sans-serif;font-size:34px;line-height:.9;color:var(--ink);text-shadow:1.5px 1.5px 0 #fff}
.lc-detail-scnum small{font-size:14px;opacity:.6}
.lc-detail-score .lc-hp{flex:1;height:14px;border:2.5px solid var(--ink);border-radius:10px;background:#fff;box-shadow:2px 2px 0 var(--ink)}
.lc-detail-facts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.lc-detail-fact{font-size:13px;font-weight:800;background:#fff;border:2.5px solid var(--ink);border-radius:20px;padding:6px 12px;box-shadow:2px 2px 0 var(--ink)}
.lc-detail-full{display:block;width:100%;margin-top:12px;background:none;border:none;color:#0d2330;font-weight:800;font-size:13px;
  text-decoration:underline;cursor:pointer;font-family:inherit}
/* strip 7 jours (case BD) */
.lc-detail-fc{margin:4px 0 18px}
.lc-detail-fc-h{font-family:"AntonLC",system-ui,sans-serif;font-size:13px;letter-spacing:.6px;margin-bottom:7px;color:var(--ink)}
.lc-detail-fc-row{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;cursor:pointer}
.lc-fc-cell{border:2.5px solid var(--ink);border-radius:9px;padding:7px 2px;text-align:center;background:#fff;box-shadow:2px 2px 0 var(--ink);
  display:flex;flex-direction:column;align-items:center;gap:3px}
.lc-fc-cell.now.s-ok{background:var(--grn)}.lc-fc-cell.now.s-mod{background:var(--org)}.lc-fc-cell.now.s-bad{background:var(--red)}
.lc-fc-cell.now{color:#fff}
.lc-fc-cell.lock{background:repeating-linear-gradient(45deg,#eee 0 5px,#fff 5px 10px)}
.lc-fc-day{font:800 9px/1 "Comic Neue",system-ui,sans-serif;text-transform:uppercase;opacity:.8}
.lc-fc-dot{font-family:"AntonLC",system-ui,sans-serif;font-size:14px;line-height:1}
.lc-fc-cell.lock .lc-fc-dot{font-size:11px;filter:grayscale(1);opacity:.7}
/* plages voisines (hub d'exploration in-world) */
.lc-detail-rel{margin-top:20px}
.lc-detail-rel-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}
.lc-detail-rel-card .lc-card{width:100%}
/* capture email (funnel) — case comic claire */
.lc-capture{max-width:520px;margin:18px auto 0}
.lc-cap-card{background:var(--paper);border:3px solid var(--ink);border-radius:16px;padding:14px 15px;box-shadow:0 5px 0 var(--ink),0 12px 22px rgba(13,11,20,.32)}
.lc-cap-card .lc-sub{margin:7px 0 11px;color:#2a2536;font-weight:700;font-size:13px}
.lc-cap-row{display:flex;gap:8px}
.lc-cap-in{flex:1;min-width:0;font-family:"Comic Neue",system-ui,sans-serif;font-size:15px;font-weight:700;color:var(--ink);
  background:#fff;border:2.5px solid var(--ink);border-radius:11px;padding:11px 13px;box-shadow:2px 2px 0 var(--ink) inset;forced-color-adjust:none}
.lc-cap-in::placeholder{color:#9a93a8}
.lc-cap-btn{width:auto!important;flex:0 0 auto;padding:11px 16px!important;font-size:15px!important}
.lc-cap-done{max-width:520px;margin:18px auto 0;background:#0e3a28;border:2.5px solid var(--ink);border-radius:14px;
  padding:13px 15px;color:#fff;font-weight:800;font-size:13.5px;box-shadow:2px 2px 0 var(--ink);forced-color-adjust:none}
.lc-cap-done span{font-size:17px}

/* carte TCG (réutilisable) */
.lc-card{position:relative;border-radius:14px;padding:6px;border:2.5px solid var(--ink);text-align:left;cursor:pointer;
  box-shadow:0 6px 0 rgba(13,11,20,.35),0 10px 20px rgba(13,11,20,.4);transform:rotate(var(--rot,-1deg));
  font-family:inherit;display:block;width:100%}
.lc-card.r-com{background:linear-gradient(135deg,#dfe6ea,#bfcad2 60%,#eef2f4)}
.lc-card.r-rare{background:linear-gradient(135deg,#bfe3ff,#5fb6e8 55%,#dff2ff);
  box-shadow:0 0 0 2px #2f9fe0 inset,0 6px 0 rgba(13,11,20,.35),0 10px 20px rgba(47,159,224,.4)}
.lc-card.r-epic{background:linear-gradient(135deg,#e9d3ff,#a86fe0 55%,#f3e8ff);
  box-shadow:0 0 0 2px #8a4fd0 inset,0 6px 0 rgba(13,11,20,.35),0 10px 22px rgba(138,79,208,.5)}
.lc-card.r-leg{background:linear-gradient(135deg,#ffe79a,#f6b73c 28%,#fff3c4 52%,#e0962a 74%,#ffe79a);
  box-shadow:0 0 0 2px #e0962a inset,0 6px 0 rgba(13,11,20,.35),0 10px 26px rgba(246,183,60,.65)}
.lc-card::after{content:"";position:absolute;inset:0;border-radius:14px;pointer-events:none;
  background:linear-gradient(115deg,transparent 30%,rgba(255,0,170,.28) 42%,rgba(0,200,255,.28) 50%,rgba(120,255,90,.28) 58%,transparent 70%);
  background-size:280% 280%;mix-blend-mode:screen;animation:lc-foil 5s linear infinite}
.lc-card.r-com::after{opacity:.35}.lc-card.r-rare::after{opacity:.7}
.lc-reduce .lc-card::after{animation:none}
@keyframes lc-foil{0%{background-position:0 0}100%{background-position:280% 280%}}
.lc-card.lc-locked .lc-in{filter:saturate(.32) brightness(.9) contrast(.95)}
.lc-card.lc-locked::before{content:"";position:absolute;inset:6px;z-index:3;border-radius:9px;pointer-events:none;
  background:repeating-linear-gradient(45deg,rgba(13,11,20,.16) 0 9px,rgba(13,11,20,.04) 9px 18px)}
.lc-collect{position:absolute;z-index:5;bottom:14px;left:50%;transform:translateX(-50%) rotate(-3deg);
  font-family:"AntonLC",system-ui,sans-serif;font-size:11px;letter-spacing:1px;color:var(--ink);
  background:var(--yel);border:2.5px solid var(--ink);border-radius:7px;padding:4px 10px;box-shadow:2px 2px 0 var(--ink);white-space:nowrap}
.lc-ty{flex:0 0 auto;width:22px;height:22px;border-radius:50%;border:2px solid var(--ink);display:grid;place-items:center;
  font-size:12px;background:radial-gradient(circle at 35% 30%,#fff,#cfeafe)}
.lc-hp{display:block;height:7px;background:rgba(13,11,20,.18);border-bottom:2px solid var(--ink)}
.lc-hpfill{display:block;height:100%}
.lc-hpfill.s-ok{background:linear-gradient(90deg,#3fd98a,var(--grn))}
.lc-hpfill.s-mod{background:linear-gradient(90deg,#ffd569,var(--org))}
.lc-hpfill.s-bad{background:linear-gradient(90deg,#ff8a6a,var(--red))}
.lc-atke{flex:0 0 auto;width:18px;text-align:center;font-size:12px}
.lc-in{position:relative;z-index:2;display:block;border:2px solid var(--ink);border-radius:9px;overflow:hidden;background:var(--paper)}
.lc-bn{display:flex;align-items:center;gap:5px;padding:5px 7px;border-bottom:2.5px solid var(--ink)}
.lc-bn.s-ok{background:linear-gradient(90deg,#2bb6a6,#0f7d72)}
.lc-bn.s-mod{background:linear-gradient(90deg,#f0b73a,#d4912a)}
.lc-bn.s-bad{background:linear-gradient(90deg,#ff6a4a,#d8351f)}
.lc-nm{font-family:"AntonLC",system-ui,sans-serif;font-size:13px;color:#fff;line-height:1.05;text-shadow:1.5px 1.5px 0 var(--ink);
  flex:1;text-transform:uppercase;letter-spacing:.3px}
.lc-sc{font-family:"AntonLC",system-ui,sans-serif;font-size:18px;color:#fff;text-shadow:1.5px 1.5px 0 var(--ink);line-height:1}
.lc-illu{position:relative;display:block;height:96px;border-bottom:2.5px solid var(--ink);overflow:hidden}
.lc-illu svg{position:absolute;inset:0;width:100%;height:100%}
.lc-rar{position:absolute;left:5px;bottom:4px;font-family:"AntonLC",system-ui,sans-serif;font-size:8px;color:#fff;
  background:var(--ink);padding:1.5px 6px;border-radius:12px;letter-spacing:.4px;border:1.5px solid rgba(255,255,255,.5)}
.lc-card.r-rare .lc-rar{background:#1f7fc0}
.lc-card.r-epic .lc-rar{background:#7a3fc0}
.lc-card.r-leg .lc-rar{background:#c47a12;color:#fff8e0}
.lc-card.r-leg .lc-ty{background:radial-gradient(circle at 35% 30%,#fff,#ffe08a);box-shadow:0 0 8px rgba(246,183,60,.9)}
.lc-pow{position:absolute;z-index:3;top:-9px;right:-5px;font-family:"AntonLC",system-ui,sans-serif;font-size:13px;transform:rotate(9deg)}
.lc-pow b{display:inline-block;border:2.5px solid var(--ink);border-radius:6px;padding:1px 7px;color:#fff;text-shadow:1.5px 1.5px 0 var(--ink)}
.lc-pow.s-ok b{background:var(--grn)}.lc-pow.s-mod b{background:var(--org)}.lc-pow.s-bad b{background:var(--red)}
.lc-bd{display:block;padding:6px 8px 8px}
.lc-atk{display:flex;gap:6px;align-items:baseline;padding:3px 0}
.lc-atkt{font-family:"AntonLC",system-ui,sans-serif;font-size:10px;text-transform:uppercase;color:var(--ink);flex:1;letter-spacing:.2px}
.lc-atkv{font-family:"AntonLC",system-ui,sans-serif;font-size:12px;color:var(--red);text-shadow:1px 1px 0 var(--ink)}
.lc-ft{display:flex;justify-content:space-between;font-size:7.5px;color:#7a7488;padding-top:3px;margin-top:2px;border-top:1.5px solid var(--ink)}

/* premium / lock */
.lc-lock{max-width:520px;margin:30px auto 0;text-align:center}
.lc-lock-card{position:relative;background:linear-gradient(135deg,#e9d3ff,#b88be8 60%,#f3e8ff);border:3px solid var(--ink);
  border-radius:16px;box-shadow:0 6px 0 rgba(13,11,20,.35);padding:18px 14px 16px}
.lc-lock-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-family:"AntonLC",system-ui,sans-serif;
  font-size:13px;background:var(--pur);color:#fff;border:2.5px solid var(--ink);border-radius:20px;padding:3px 12px;
  text-shadow:1.5px 1.5px 0 var(--ink);box-shadow:2px 2px 0 var(--ink)}
.lc-lock .lc-cta{margin-top:12px}
.lc-maplink{display:inline-block;margin-top:16px;font-weight:800;font-size:13px;color:#fff;background:none;border:none;
  text-decoration:underline;text-shadow:1px 1px 0 rgba(13,11,20,.5);cursor:pointer}
.lc-veil .lc-iris{transition:fill .6s ease}
.lc-veil .lc-lid{transform-box:fill-box;transform-origin:top;transform:scaleY(0);animation:lc-blink 5.4s steps(1,end) infinite}
@keyframes lc-blink{0%,93%{transform:scaleY(0)}95%,98%{transform:scaleY(1)}100%{transform:scaleY(0)}}
.lc-reduce .lc-veil .lc-lid{animation:none;transform:scaleY(0)}

/* ---- BOOSTER : pack fermé ---- */
.lc-pack{position:relative;width:210px;aspect-ratio:5/7;margin:16px auto 0;border-radius:18px;border:3px solid var(--ink);
  box-shadow:0 8px 0 rgba(13,11,20,.4),0 14px 26px rgba(13,11,20,.45);overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
  background:linear-gradient(160deg,#8a55e8,#6a3bc0 45%,#4f2a99);cursor:default}
.lc-pack-top{filter:drop-shadow(2px 3px 0 rgba(13,11,20,.5))}
.lc-pack-lbl{font-family:"AntonLC",system-ui,sans-serif;font-size:24px;line-height:.95;color:#fff;
  text-shadow:3px 3px 0 var(--ink);text-align:center;letter-spacing:.5px;transform:rotate(-2deg)}
.lc-pack-count{font:800 11px/1 "Comic Neue",system-ui,sans-serif;color:var(--ink);background:var(--yel);
  border:2.5px solid var(--ink);border-radius:20px;padding:4px 11px;box-shadow:2px 2px 0 var(--ink)}
.lc-pack-shine{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.45) 48%,transparent 58%);
  background-size:280% 280%;mix-blend-mode:screen;animation:lc-foil 3.2s linear infinite}
.lc-reduce .lc-pack-shine{animation:none;opacity:.3}
.lc-rip{margin-top:12px;display:block;text-align:center}

/* ---- BOOSTER : éventail de 3 cartes au reveal ---- */
.lc-fanwrap{position:relative;width:100%;max-width:360px;margin:14px auto 0}
.lc-fan{position:relative;width:100%;height:300px;z-index:1}
.lc-fancard{position:absolute;top:0;left:50%;width:160px;transform-origin:bottom center;
  animation:lc-fanin .5s cubic-bezier(.2,1.2,.3,1) both;animation-delay:var(--d)}
.lc-fancard .lc-card{width:100%}
.lc-reduce .lc-fancard{animation:none}
@keyframes lc-fanin{0%{opacity:0;transform:translateX(-50%) translateY(26px) scale(.55) rotate(0)}}
.lc-fancard .lc-verdictpow{top:-14px;right:-8px}
/* tension du pull : flash blanc à l'arrivée de la vedette (gros + doré si légendaire) */
.lc-flash{position:absolute;left:50%;top:42%;width:120%;height:120%;transform:translate(-50%,-50%);pointer-events:none;z-index:4;
  border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.95),rgba(255,255,255,0) 60%);
  opacity:0;animation:lc-flash .7s ease-out .5s both}
.lc-flash.leg{background:radial-gradient(circle,rgba(255,255,255,.98),rgba(255,210,90,.7) 38%,rgba(255,170,30,0) 66%);animation-duration:1s}
@keyframes lc-flash{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}28%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}}
.lc-halo{position:absolute;left:50%;top:44%;width:300px;height:300px;transform:translate(-50%,-50%);pointer-events:none;z-index:0;
  background:conic-gradient(from 0deg,rgba(255,200,60,.55),rgba(255,255,255,0) 22%,rgba(255,200,60,.55) 50%,rgba(255,255,255,0) 72%,rgba(255,200,60,.55));
  border-radius:50%;animation:lc-spin 7s linear infinite;filter:blur(2px)}
@keyframes lc-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}
.lc-reduce .lc-flash,.lc-reduce .lc-halo{animation:none;opacity:.25}

/* PALIER de complétion (rang Veilleur + barre) */
.lc-rank{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.lc-rank-badge{font-family:"AntonLC",system-ui,sans-serif;font-size:11px;color:#fff;text-shadow:1.5px 1.5px 0 var(--ink);
  border:2.5px solid var(--ink);border-radius:8px;padding:3px 9px;box-shadow:2px 2px 0 var(--ink);letter-spacing:.4px;white-space:nowrap}
.lc-rank-bar{flex:1;min-width:90px;height:11px;background:#fff;border:2.5px solid var(--ink);border-radius:10px;overflow:hidden;box-shadow:2px 2px 0 var(--ink)}
.lc-rank-fill{height:100%;border-right:2px solid var(--ink);transition:width .6s cubic-bezier(.22,1,.36,1)}
.lc-rank-next{font:800 10px/1 "Comic Neue",system-ui,sans-serif;color:var(--ink);white-space:nowrap}

/* ---- holo renforcé sur épique / légendaire ---- */
.lc-root .lc-card.r-epic::after{opacity:1}
.lc-root .lc-card.r-leg::after{opacity:1}
.lc-card.r-leg .lc-in::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(circle at 30% 18%,rgba(255,255,255,.55),transparent 42%);mix-blend-mode:screen}
.lc-card.lc-locked::after{animation:none;opacity:0}

/* ====================================================================
   OVERRIDES — le thème comic de l'app force background/border/shadow en
   !important sur TOUT <button> / [role=button] / [class*=cta]. Mes cartes
   et boutons SONT des <button> → on regagne la main avec une spécificité
   supérieure (préfixe .lc-root) + !important, sinon rareté & couleurs
   sautent (cartes cream, verdicts blancs).
   ==================================================================== */
.lc-root .lc-gbtn{font-family:"AntonLC",system-ui,sans-serif!important;border-radius:11px!important}
.lc-root .lc-gbtn.s-ok{background:linear-gradient(180deg,#3fd98a,var(--grn))!important}
.lc-root .lc-gbtn.s-mod{background:linear-gradient(180deg,#ffd569,var(--org))!important;color:var(--ink)}
.lc-root .lc-gbtn.s-bad{background:linear-gradient(180deg,#ff6a4a,var(--red))!important}
.lc-root .lc-card{border-radius:14px!important;
  box-shadow:0 6px 0 rgba(13,11,20,.35),0 10px 20px rgba(13,11,20,.4)!important}
.lc-root .lc-card.r-com{background:linear-gradient(135deg,#dfe6ea,#bfcad2 60%,#eef2f4)!important}
.lc-root .lc-card.r-rare{background:linear-gradient(135deg,#bfe3ff,#5fb6e8 55%,#dff2ff)!important}
.lc-root .lc-card.r-epic{background:linear-gradient(135deg,#e9d3ff,#a86fe0 55%,#f3e8ff)!important}
.lc-root .lc-card.r-leg{background:linear-gradient(135deg,#ffe79a,#f6b73c 28%,#fff3c4 52%,#e0962a 74%,#ffe79a)!important}
.lc-root .lc-cta{border-radius:12px!important;box-shadow:4px 4px 0 var(--ink)!important}
.lc-root .lc-maplink{background:none!important;border:none!important;box-shadow:none!important;
  font-family:inherit!important;border-radius:0!important}
`
