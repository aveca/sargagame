// WelcomePoste — « Le Poste de Veille » : accueil premium VERDICT-FIRST, explorable, un seul
// écran scrollable dans UN seul dialog. Remplace le tunnel linéaire PaidOnboarding (fallback
// conservé via ?poste=0). Issu du panel adverse 2026-06-30 : les 3 personas ont tué le « hub de
// tuiles » (paradoxe du choix) → valeur D'ABORD (hero verdict réel, 0 tap), accès ENSUITE
// (encarts inline, jamais de porte fermée), zéro compteur « X/5 », zéro cul-de-sac.
//
// COHÉRENCE verrouillée sur le CODE de WeekHub (card/STATUS_C/DayCell/Watcher/INK/PAPER/GOLD
// recopiés verbatim) → onboarding et hub premium indiscernables. Typo entièrement en clamp()
// (fin du 800 écrasé / rotation / ombre portée — le grief central). a11y : role=dialog, focus
// ✕ à l'ouverture, focus-trap (1 seul niveau), Échap, reduced-motion. Flag ?poste=0.
import React, { useEffect, useRef, useMemo, useState, useCallback } from "react"
import { useSwipeClose } from "./useSwipeClose"

const INK = "#0d0b14", PAPER = "#fdf6e3", GOLD = "#FFC72C", SUB = "#4a4458"
const STATUS_C = { clean:"#22C55E", moderate:"#B87A00", avoid:"#E8522A" }
const _t = (lang, fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr
const DAY_LBL = [["Auj","Today","Hoy"],["+1j","+1d","+1d"],["+2j","+2d","+2d"],["+3j","+3d","+3d"],["+4j","+4d","+4d"],["+5j","+5d","+5d"]]
const ti = (lang, a) => lang === "en" ? a[1] : lang === "es" ? a[2] : a[0]
// card : constante recopiée VERBATIM de WeekHub.jsx (cohérence sur le code, pas la mémoire).
const card = { background:PAPER, border:`2.5px solid ${INK}`, boxShadow:`3px 3px 0 ${INK}`, borderRadius:14, padding:"13px 14px" }

function haversine(a,b,c,d){ const R=6371,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p,h=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2; return 2*R*Math.asin(Math.sqrt(h)) }

// Mascotte Veilleur — recopiée VERBATIM de WeekHub (autonome, anti-import-circulaire / budget lazy).
function Watcher({ size=40 }){
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

export default function WelcomePoste({ lang="fr", allBeaches=[], favorites=[], onToggleFav, onEnableNotif, onDone, island, userPos, track }){
  const panelRef = useRef(null), closeRef = useRef(null), reduced = useRef(false), prechecked = useRef(false)
  // Convention UX mobile (loi du repo) : feuille plein écran fermable par swipe-down depuis le haut.
  const swipe = useSwipeClose(()=>{ try{ track&&track("sg_onboard_done",{src:"swipe"}) }catch(_){}; onDone&&onDone() })
  const setPanel = useCallback((el)=>{ panelRef.current=el; swipe.ref.current=el },[swipe])
  const [notifAsked, setNotifAsked] = useState(false)
  const [weekAck, setWeekAck] = useState(false)
  const seenAct = useRef({})
  const tk = (e,p)=>{ try{ track && track(e,p||{}) }catch(_){} }
  const act = (section)=>{ if(seenAct.current[section]) return; seenAct.current[section]=1; tk("sg_onboard_section_act",{section}) }
  const relPath = lang === "en" ? "/reliability/" : lang === "es" ? "/fiabilidad/" : "/fiabilite/"

  useEffect(()=>{ try{ reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches }catch(_){} },[])

  // Suggestions : meme ile, propres d'abord, plus proches si geo sinon meilleur score (repris PaidOnboarding).
  const suggestions = useMemo(()=>{
    const geo = !!(userPos && userPos.lat)
    const pool = (allBeaches||[]).filter(b=>b && b.id && b.lat && b.lng && (!island || b.island===island))
    const rank = b => geo ? haversine(userPos.lat,userPos.lng,b.lat,b.lng) : -(b.score||0)
    const clean = pool.filter(b=>b.status==="clean").sort((a,b)=>rank(a)-rank(b))
    const rest = pool.filter(b=>b.status!=="clean").sort((a,b)=>rank(a)-rank(b))
    return [...clean, ...rest].slice(0,8)
  },[allBeaches, island, userPos])
  const heroBeach = suggestions.find(b=>b.status==="clean") || suggestions[0] || null

  // Pre-cochage du geste coeur : si aucun favori, cocher la/les 1-2 plages propres proches (toggleable).
  useEffect(()=>{
    if(prechecked.current) return; prechecked.current = true
    if((favorites||[]).length>0) return
    const clean = suggestions.filter(b=>b.status==="clean").slice(0,2)
    if(clean.length && onToggleFav){ clean.forEach(b=>{ try{ onToggleFav(b.id) }catch(_){} }) }
  // eslint-disable-next-line
  },[suggestions])

  // a11y : focus ✕ a l'ouverture, focus-trap (1 niveau), Echap -> sortie.
  useEffect(()=>{
    tk("sg_onboard_open",{})
    const t = setTimeout(()=>{ try{ closeRef.current && closeRef.current.focus() }catch(_){} }, 30)
    const onKey = (e)=>{
      if(e.key==="Escape"){ e.stopPropagation(); exit("esc"); return }
      if(e.key==="Tab"){
        const root=panelRef.current; if(!root) return
        const f=root.querySelectorAll('button,a[href],input,[tabindex]:not([tabindex="-1"])'); if(!f.length) return
        const first=f[0], last=f[f.length-1]
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus() }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", onKey, true)
    return ()=>{ clearTimeout(t); document.removeEventListener("keydown", onKey, true) }
  // eslint-disable-next-line
  },[])

  const favSet = new Set(favorites)
  const picked = (favorites||[]).length
  const exit = (src)=>{ tk("sg_onboard_done",{favs:picked, src}); onDone && onDone() }
  const enableAlerts = ()=>{ act("alert"); setNotifAsked(true); try{ onEnableNotif && onEnableNotif() }catch(_){} }
  const openProof = ()=>{ act("proof"); tk("sg_onboard_proof",{}); try{ window.open(relPath,"_blank","noopener") }catch(_){} }

  const h2 = { font:"400 15px/1 'Anton','Bricolage Grotesque',sans-serif", letterSpacing:".01em" }
  const subTxt = { font:"500 clamp(13px,3.6vw,14px)/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:SUB }
  const goldBtn = { font:"700 clamp(15px,4vw,16px)/1.15 'Bricolage Grotesque',system-ui,sans-serif", color:INK, background:GOLD, border:`2.5px solid ${INK}`, borderRadius:999, padding:"12px 16px", cursor:"pointer", minHeight:44, boxShadow:`3px 3px 0 ${INK}`, width:"100%" }
  const okBadge = (label)=>(<span style={{display:"inline-flex",alignItems:"center",gap:5,font:"700 11px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#0a7d33"}}><span aria-hidden="true">✓</span>{label}</span>)

  return (
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Bienvenue · le poste du Veilleur","Welcome · the Watcher's post","Bienvenida · el puesto del Vigía")}
      ref={setPanel} onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd} style={{
        position:"fixed", inset:0, zIndex:1450, overflowY:"auto", WebkitOverflowScrolling:"touch",
        background:`linear-gradient(180deg,#2bb6ef 0%,#62c8ee 28%,#ffc187 78%,#ff944a 100%)`,
        color:INK, fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
        padding:`0 0 calc(22px + env(safe-area-inset-bottom))`,
        animation: reduced.current ? "none" : "wpIn .26s cubic-bezier(.34,1.4,.5,1) both",
      }}>
      <style>{`@keyframes wpIn{from{transform:translateY(28px);opacity:.4}to{transform:translateY(0);opacity:1}}
        @media (prefers-reduced-motion: reduce){[data-wp]{animation:none!important}}`}</style>
      <div data-wp="1">

        {/* HEADER sticky */}
        <div style={{position:"sticky", top:0, zIndex:2, display:"flex", alignItems:"center", gap:11,
          background:PAPER, borderBottom:`2.5px solid ${INK}`, padding:`max(12px,env(safe-area-inset-top)) clamp(14px,4.5vw,22px) 11px`}}>
          <Watcher size={40}/>
          <div style={{flex:1, minWidth:0}}>
            <span style={{display:"inline-block", font:"700 11px/1 'Bricolage Grotesque',system-ui,sans-serif", letterSpacing:".06em", textTransform:"uppercase", color:INK, background:GOLD, border:`2px solid ${INK}`, borderRadius:6, padding:"3px 7px", marginBottom:5}}>⭐ {_t(lang,"Pass activé","Pass active","Pase activo")}</span>
            <div style={{font:"400 clamp(22px,6vw,30px)/1.06 'Anton','Bricolage Grotesque',sans-serif", letterSpacing:"0", textTransform:"uppercase"}}>{_t(lang,"Le Veilleur a pris son poste","Le Veilleur is on watch","Le Veilleur está de guardia")}</div>
            <div style={{...subTxt, marginTop:3}}>{_t(lang,"Voici ce qu'il garde pour toi.","Here's what he's keeping for you.","Esto es lo que cuida para ti.")}</div>
          </div>
          <button ref={closeRef} onClick={()=>exit("close")} aria-label={_t(lang,"Entrer dans l'app","Enter the app","Entrar en la app")}
            style={{flexShrink:0, width:44, height:44, borderRadius:999, border:`2.5px solid ${INK}`, background:GOLD, color:INK, font:"700 17px/1 system-ui", cursor:"pointer", boxShadow:`2px 2px 0 ${INK}`}}>✕</button>
        </div>

        <div style={{padding:"13px clamp(14px,4.5vw,22px)", display:"flex", flexDirection:"column", gap:"clamp(10px,2.6vw,12px)", maxWidth:560, margin:"0 auto"}}>

          {/* [A] HÉRO VERDICT — le cadeau, 0 tap */}
          {heroBeach && (
            <div style={{...card, background:"linear-gradient(135deg,#fff6d8,#fdf6e3 60%)", outline:`2px solid ${GOLD}`, outlineOffset:-6}}>
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6}}>
                <span style={{width:12, height:12, borderRadius:"50%", background:STATUS_C[heroBeach.status]||"#9aa0a8", border:`1.5px solid ${INK}`, flexShrink:0}}/>
                <span style={{font:"400 clamp(18px,4.6vw,20px)/1.05 'Anton',sans-serif"}}>{heroBeach.name}</span>
              </div>
              <div style={{...subTxt, color:INK, fontWeight:600}}>{_t(lang,
                `Aujourd'hui : ${heroBeach.status==="clean"?"mer propre":heroBeach.status==="moderate"?"à surveiller":"à éviter"}. Mesuré au satellite, pas deviné.`,
                `Today: ${heroBeach.status==="clean"?"clean water":heroBeach.status==="moderate"?"watch out":"avoid"}. Satellite-measured, not guessed.`,
                `Hoy: ${heroBeach.status==="clean"?"mar limpio":heroBeach.status==="moderate"?"a vigilar":"evitar"}. Medido por satélite, no adivinado.`)}</div>
              <button onClick={openProof} style={{marginTop:8, background:"none", border:"none", padding:0, font:"700 12px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color:INK, textDecoration:"underline", cursor:"pointer"}}>{_t(lang,"on publie même nos erreurs →","we even publish our errors →","incluso publicamos nuestros errores →")}</button>
            </div>
          )}

          {/* [B] MES PLAGES — coeur n°1, déplié + pré-coché */}
          <div style={card}>
            <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8}}>
              <span style={h2}>{_t(lang,"Les plages qu'il garde pour toi","The beaches he keeps for you","Las playas que cuida para ti")}</span>
              {picked>0 && okBadge(_t(lang,`${picked} surveillée${picked>1?"s":""}`,`${picked} watched`,`${picked} vigilada${picked>1?"s":""}`))}
            </div>
            <div style={{...subTxt, margin:"5px 0 10px"}}>{_t(lang,"Il les surveille au satellite, 4×/jour, et te prévient le matin où l'une bascule.","He watches them by satellite, 4×/day, and warns you the morning one turns.","Las vigila por satélite, 4×/día, y te avisa la mañana en que una cambie.")}</div>
            <div style={{display:"flex", flexDirection:"column", gap:7}}>
              {suggestions.map(b=>{
                const on = favSet.has(b.id)
                const col = STATUS_C[b.status]||"#9aa0a8"
                return (
                  <button key={b.id} onClick={()=>{ act("fav"); onToggleFav && onToggleFav(b.id) }} aria-pressed={on}
                    style={{display:"flex", alignItems:"center", gap:11, minHeight:44, padding:"9px 12px", borderRadius:11, cursor:"pointer", textAlign:"left",
                      border:`2.5px solid ${INK}`, color:INK, background:on?GOLD:"#fffbf0", boxShadow:on?`3px 3px 0 ${INK}`:`2px 2px 0 ${INK}`}}>
                    <span style={{width:12, height:12, borderRadius:"50%", background:col, flexShrink:0, boxShadow:`0 0 0 2px ${INK}`}}/>
                    <span style={{flex:1, minWidth:0, font:"700 13.5px/1.15 'Bricolage Grotesque',system-ui,sans-serif"}}>{b.name}{b.commune?<span style={{opacity:.55, fontWeight:600}}> · {b.commune}</span>:null}</span>
                    <span aria-hidden="true" style={{width:25, height:25, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", border:`2px solid ${INK}`, background:on?INK:PAPER, color:on?GOLD:INK, fontWeight:800, fontSize:14}}>{on?"✓":"+"}</span>
                  </button>
                )
              })}
              {!suggestions.length && <div style={subTxt}>{_t(lang,"Tu pourras choisir tes plages favorites depuis la carte.","You can pick favorite beaches from the map.","Podrás elegir tus playas favoritas desde el mapa.")}</div>}
            </div>
          </div>

          {/* [C] ALERTES — coeur n°2, encart inline 1-tap */}
          <div style={card}>
            <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8}}>
              <span style={h2}>{_t(lang,"Le matin où ça bascule","The morning it turns","La mañana en que cambia")}</span>
              {notifAsked && okBadge(_t(lang,"alertes activées","alerts on","alertas activadas"))}
            </div>
            <div style={{...subTxt, margin:"5px 0 10px"}}>{_t(lang,"Une alerte le matin où ta plage tourne — jamais toi. La mer parle, pas nous ; en saison calme, on ne te ping pas pour rien.","One alert the morning your beach turns — never you. The sea talks, not us; in calm season we won't ping you for nothing.","Una alerta la mañana en que tu playa cambia — nunca tú. El mar habla, no nosotros; en temporada calma no te molestamos.")}</div>
            {!notifAsked && <button onClick={enableAlerts} style={goldBtn}>{_t(lang,"Activer les alertes","Enable alerts","Activar alertas")}</button>}
          </div>

          {/* [D] PREUVE — 1 ligne + lien, encart sobre */}
          <div style={{...card, background:"#fff8e8", borderStyle:"dashed"}}>
            <div style={{...subTxt, color:"#3a3548"}}>{_t(lang,"On ne te demande pas de nous croire : 76 à 79 % de justesse selon la saison, confiance forte J0-J3. On publie nos erreurs, datées.","Don't take our word: 76-79% accuracy by season, strong confidence D0-D3. We publish our errors, dated.","No nos creas: 76-79 % de acierto según temporada, confianza alta D0-D3. Publicamos nuestros errores, fechados.")}</div>
            <button onClick={openProof} style={{marginTop:8, background:"none", border:"none", padding:0, font:"800 12px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color:INK, textDecoration:"underline", cursor:"pointer"}}>{_t(lang,"Va voir ce qu'on vaut →","See what we're worth →","Mira lo que valemos →")}</button>
          </div>

          {/* [E] MA SEMAINE — aperçu statique qui ENSEIGNE la grammaire (pas de fausse data) */}
          <div style={card}>
            <div style={h2}>{_t(lang,"Chaque matin, ta semaine t'attend","Every morning, your week awaits","Cada mañana, tu semana te espera")}</div>
            <div style={{...subTxt, margin:"5px 0 10px"}}>{_t(lang,"6 jours d'un coup d'œil, du plus sûr (point plein) au plus incertain (pointillé). On ne devine jamais le jour au-delà de 7 — ce serait te mentir.","6 days at a glance, from most certain (filled dot) to least (dotted). We never fake the day beyond 7 — that would be lying.","6 días de un vistazo, de lo más seguro (punto lleno) a lo incierto (punteado). Nunca inventamos el día más allá de 7.")}</div>
            <div aria-hidden="true" style={{display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:4, opacity:.92}}>
              {[0,1,2,3,4,5].map(d=>{ const tier=d>=4?"low":d===3?"med":"high"
                return (
                  <span key={d} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4}}>
                    <span style={{width:"78%", height:[18,15,16,12,10,8][d], background:[STATUS_C.clean,STATUS_C.clean,STATUS_C.moderate,STATUS_C.clean,"#efe9da","#efe9da"][d],
                      backgroundImage:d>=4?"repeating-linear-gradient(45deg,#d2ccbd 0 3px,#efe9da 3px 6px)":"none",
                      border:`2px solid ${INK}`, borderRadius:5, boxSizing:"border-box"}}/>
                    <span style={{font:"700 9px/1 'Bricolage Grotesque',system-ui,sans-serif", color:SUB}}>{ti(lang,DAY_LBL[d])}</span>
                    <span style={{width:5, height:5, borderRadius:"50%", boxSizing:"border-box",
                      background:tier==="high"?INK:"transparent",
                      backgroundImage:tier==="med"?`linear-gradient(90deg,${INK} 0 50%,transparent 50%)`:"none",
                      border:tier==="low"?`1px dotted ${INK}`:tier==="med"?`1px solid ${INK}`:"none"}}/>
                  </span>
                )
              })}
            </div>
            {!weekAck && <button onClick={()=>{ act("week"); setWeekAck(true) }} style={{...goldBtn, marginTop:11, background:"#fffbf0"}}>{_t(lang,"Compris","Got it","Entendido")}</button>}
            {weekAck && <div style={{marginTop:9}}>{okBadge(_t(lang,"tu sauras lire ta semaine","you'll read your week","sabrás leer tu semana"))}</div>}
          </div>

          {/* [F] SORTIE nette — l'app est derrière */}
          <button onClick={()=>exit("enter")} style={{...goldBtn, fontWeight:800, fontSize:"clamp(15px,4.2vw,17px)", padding:"15px 18px"}}>{_t(lang,"Entrer dans l'app →","Enter the app →","Entrar en la app →")}</button>

          {/* PIED honnêteté (repris de La Vigie) */}
          <div style={{textAlign:"center", padding:"2px 4px 0"}}>
            <div style={{font:"600 10px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548"}}>{_t(lang,"Il regarde la mer, jamais tes vacances.","He watches the sea, never your holiday.","Mira el mar, nunca tus vacaciones.")}</div>
          </div>

        </div>
      </div>
    </div>
  )
}
