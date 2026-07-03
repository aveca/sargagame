import React,{useState,useRef,useEffect,useMemo,useCallback} from "react"
import {createPortal} from "react-dom"
import {useSwipeClose} from "./useSwipeClose"

/* ============================================================
   LE VEILLEUR TE RÉPOND — assistant VISUEL, 100% CLIENT, ZÉRO-LLM.
   Port fidèle de design/proto-veilleur-repond.html (workflow
   visual-assistant-concept, gagnant 2026-07-03).

   Intent-parsing DÉTERMINISTE (regex+lexique ~3Ko, in-browser) → SÉLECTION
   d'une vraie plage dans `allBeaches` (filtre status/score/kids/snorkel/
   commune, tous des champs RÉELS — cf. BEACHES_FALLBACK) → réponse en
   BULLES VISUELLES : scène SVG déterministe + verdict RÉEL + badge LIVE +
   plan B (plage propre la plus proche). NE PEUT PAS halluciner : aucune
   génération de texte libre, uniquement de la sélection + un gabarit fixe.

   Safety : donnée manquante = message honnête (jamais un faux résultat) ;
   plage à éviter = alerte H2S HEDGÉE avant le CTA. L'argent ne touche
   jamais le verdict. Termine sur un CTA → portes de conversion existantes
   (onOpenBeach/onPremium), contexte plage pré-chargé.

   Surface = deep-link ?veille=1 (comme BriefMatin.jsx), rollback ?veille=0.
   Lois mobile : createPortal(document.body) + useSwipeClose(guardInput
   car champ de saisie) + focus-trap/restauration + 4 sorties (✕/Échap/
   backdrop/swipe-down). Pattern CSS scopée .vr-* (pas de Shadow DOM),
   comme BriefMatin — !important pour battre le skin .theme-comic.
   ============================================================ */

const STR={
  fr:{title:"Le Veilleur te répond",sub:"MESURÉ AU SATELLITE · JAMAIS DEVINÉ",
      placeholder:"Dis-moi ce que tu cherches…",send:"Envoyer",close:"Fermer",
      intro:"Salut — dis-moi où tu veux aller et pour qui, je regarde la mer et je te réponds avec la crique qu'il te faut. Ex : « une plage propre près de Sainte-Anne, pour les enfants ».",
      lbl:{clean:"PROPRE",moderate:"MODÉRÉ",avoid:"À ÉVITER"},
      score:s=>"score "+s+"/100",kidsFact:"👶 Familles",snorkFact:"🤿 Snorkeling",
      okFact:"🌊 Baignade OK ce matin",checkFact:"⚠️ Vérifie sur place",
      h2s:"Algues en décomposition possibles à proximité — indice dérivé, pas une mesure de gaz. Si ça sent l'œuf pourri, éloigne-toi (déconseillé enfants/asthme/grossesse).",
      planb:n=>["Plan B propre à côté : ",n],
      ctaAlert:n=>"🔔 Être prévenu·e si ça change à "+n,ctaSheet:n=>"Voir la fiche de "+n,
      noMatch:"Aucune mesure fraîche ne satisfait ça pour l'instant — je préfère te le dire plutôt que d'inventer. Élargis la zone ?",
      chipsNoMatch:["plus loin","sans contrainte","voir la carte"],
      chipsFollow:(snork)=>["et pour demain ?",snork?"plutôt au calme":"pour le snorkeling","voir la carte"],
      sug:["propre près de chez moi, pour les enfants","snorkeling au calme","où aller ce week-end ?","une plage sans algues"],
      measured:"MESURÉ"},
  en:{title:"The Watchman answers",sub:"MEASURED BY SATELLITE · NEVER GUESSED",
      placeholder:"Tell me what you're looking for…",send:"Send",close:"Close",
      intro:"Hey — tell me where you want to go and for whom, I'll check the sea and answer with the right cove. E.g. “a clean beach near me, for kids”.",
      lbl:{clean:"CLEAN",moderate:"MODERATE",avoid:"AVOID"},
      score:s=>"score "+s+"/100",kidsFact:"👶 Families",snorkFact:"🤿 Snorkeling",
      okFact:"🌊 Safe to swim this morning",checkFact:"⚠️ Check on site",
      h2s:"Decomposing sargassum possibly nearby — a derived indicator, not a gas reading. If it smells like rotten eggs, move away (not advised for kids/asthma/pregnancy).",
      planb:n=>["Clean Plan B nearby: ",n],
      ctaAlert:n=>"🔔 Get notified if it changes at "+n,ctaSheet:n=>"See "+n+"'s page",
      noMatch:"No fresh reading matches that right now — I'd rather tell you than make it up. Widen the search?",
      chipsNoMatch:["further away","no constraints","show the map"],
      chipsFollow:(snork)=>["and tomorrow?",snork?"somewhere calm":"for snorkeling","show the map"],
      sug:["clean beach near me, for kids","calm snorkeling spot","where to go this weekend?","a beach with no sargassum"],
      measured:"MEASURED"},
  es:{title:"El Vigía te responde",sub:"MEDIDO POR SATÉLITE · NUNCA ADIVINADO",
      placeholder:"Dime qué buscas…",send:"Enviar",close:"Cerrar",
      intro:"Hola — dime a dónde quieres ir y para quién, miro el mar y te respondo con la cala que necesitas. Ej.: «una playa limpia cerca de mí, para niños».",
      lbl:{clean:"LIMPIA",moderate:"MODERADA",avoid:"EVITAR"},
      score:s=>"puntaje "+s+"/100",kidsFact:"👶 Familias",snorkFact:"🤿 Snorkel",
      okFact:"🌊 Baño OK esta mañana",checkFact:"⚠️ Verifica en el lugar",
      h2s:"Posible sargazo en descomposición cerca — un índice derivado, no una medición de gas. Si huele a huevo podrido, aléjate (no recomendado para niños/asma/embarazo).",
      planb:n=>["Plan B limpio cerca: ",n],
      ctaAlert:n=>"🔔 Avísame si cambia en "+n,ctaSheet:n=>"Ver la ficha de "+n,
      noMatch:"Ninguna medición reciente cumple eso ahora mismo — prefiero decírtelo antes que inventar. ¿Ampliamos la zona?",
      chipsNoMatch:["más lejos","sin restricciones","ver el mapa"],
      chipsFollow:(snork)=>["¿y mañana?",snork?"algo tranquilo":"para snorkel","ver el mapa"],
      sug:["playa limpia cerca de mí, para niños","snorkel tranquilo","¿a dónde ir este fin de semana?","una playa sin sargazo"],
      measured:"MEDIDO"}
}

const VCOL={clean:"#22C55E",moderate:"#B87A00",avoid:"#E8522A"}

/* ---- routeur DÉTERMINISTE (regex+lexique) : slots → sélection, ZÉRO génération ----
   opère sur de VRAIES plages (id/name/commune/status/score/afai/kids/snorkel réels). */
function routeIntent(q,beaches){
  const s=(q||"").toLowerCase()
  const wantClean=/(propre|sans algue|sans sargasse|baignab|clean|limpi)/.test(s) || !/(algue|sargasse|sargaz)/.test(s)
  const kids=/(enfant|famille|kids|child|family|petit|bambin|ni[nñ]o)/.test(s)
  const snork=/(snork|masque|tuba|plong|poisson|fond|mask|snorkel)/.test(s)
  let named=null,loc=null
  for(const b of beaches){
    const nm=(b.name||"").toLowerCase(),co=(b.commune||"").toLowerCase()
    if(nm&&s.indexOf(nm)>-1)named=b
    if(co&&s.indexOf(co)>-1)loc=b.commune
  }
  const byScore=(a,b)=>(b.score||0)-(a.score||0)
  let best
  if(named){best=named}
  else{
    let pool=beaches.slice()
    if(loc)pool=pool.filter(b=>b.commune===loc)
    if(kids)pool=pool.filter(b=>b.kids)
    if(snork)pool=pool.filter(b=>b.snorkel)
    const clean=pool.filter(b=>b.status==="clean").sort(byScore)
    best=wantClean?(clean[0]||null):(pool.slice().sort(byScore)[0]||null)
  }
  const planB=beaches.filter(b=>b.status==="clean"&&(!best||b.id!==best.id)&&(!kids||b.kids)&&(!snork||b.snorkel)).sort(byScore)[0]
    || beaches.filter(b=>b.status==="clean"&&(!best||b.id!==best.id)).sort(byScore)[0]
    || null
  return{best,planB,kids,snork,loc,wantClean}
}

/* scène SVG compacte, déterministe — statut réel = humeur du Veilleur (mood dot), pas d'archétype inventé */
function MiniScene({beach,w=360,h=140}){
  const st=beach.status
  const sky=st==="clean"?["#123047","#C97E3A"]:st==="moderate"?["#0B2230","#6a4a2a"]:["#141026","#B85A2A"]
  const mood=VCOL[st]||VCOL.moderate
  const gid="vrsc"+beach.id
  return(
    <svg className="vr-scene" viewBox={"0 0 "+w+" "+h} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={sky[0]}/><stop offset="1" stopColor={sky[1]}/>
      </linearGradient></defs>
      <rect width={w} height={h} fill={"url(#"+gid+")"}/>
      <circle cx={w*0.62} cy={h*0.5} r={h*0.34} fill="#FFD884" opacity=".85"/>
      <rect y={h*0.62} width={w} height={h*0.5} fill="#0e3a35"/>
      {st!=="clean"&&<path d={"M0 "+(h-30)+" Q120 "+(h-38)+" 260 "+(h-30)+" L260 "+(h-18)+" L0 "+(h-18)+" Z"} fill="#2c3019" opacity=".9"/>}
      <path d={"M0 "+(h-20)+" Q200 "+(h-28)+" 400 "+(h-20)+" L400 "+h+" L0 "+h+" Z"} fill="#1C1712"/>
      <g transform={"translate("+(w*0.16)+" "+(h*0.34)+")"}>
        <rect x="-13" y="-15" width="26" height="30" rx="7" fill="#FFC72C" stroke="#0D0D0D" strokeWidth="2.5"/>
        <circle cx="0" cy="2" r="7.5" fill="#0d1117"/><circle cx="2" cy="4" r="3" fill={mood}/>
      </g>
    </svg>
  )
}

let __vrId=0

export default function VeilleurRepond(props){
  const{allBeaches,lang="fr",onClose,onOpenBeach,onPremium,onShowMap,track}=props
  const L=STR[lang]||STR.fr
  const reduce=useMemo(()=>{try{return matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){return false}},[])
  const beaches=useMemo(()=>(allBeaches||[]).filter(b=>b&&b.status&&b.score!=null),[allBeaches])

  const sw=useSwipeClose(()=>onClose&&onClose(),{guardInput:true,threshold:70})
  const rootRef=useRef(null)
  const closeRef=useRef(null)
  const inputRef=useRef(null)
  const [msgs,setMsgs]=useState([])
  const [val,setVal]=useState("")
  const mountedRef=useRef(true)
  useEffect(()=>()=>{mountedRef.current=false},[])

  const emit=useCallback((ev,p)=>{try{track&&track(ev,p||{})}catch(_){}},[track])

  useEffect(()=>{
    const src=(()=>{try{return /[?&]veille=1/.test(window.location.search)?"deeplink":"entry"}catch(_){return"entry"}})()
    emit("sg_veille_view",{lang,source:src,beachCount:beaches.length})
    setMsgs([{id:"intro",kind:"veil-intro"}])
  },[]) // eslint-disable-line

  useEffect(()=>{const el=sw.ref.current;if(el)el.scrollTop=el.scrollHeight},[msgs]) // eslint-disable-line

  /* Échap + focus-trap + restauration (même protocole que BriefMatin) */
  useEffect(()=>{
    const prev=typeof document!=="undefined"?document.activeElement:null
    try{inputRef.current&&inputRef.current.focus()}catch(_){}
    const onKey=e=>{
      if(e.key==="Escape"){onClose&&onClose();return}
      if(e.key==="Tab"&&rootRef.current){
        const f=rootRef.current.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')
        if(!f.length)return
        const first=f[0],last=f[f.length-1]
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    }
    document.addEventListener("keydown",onKey)
    return()=>{document.removeEventListener("keydown",onKey);try{prev&&prev.focus&&prev.focus()}catch(_){}}
  },[onClose]) // eslint-disable-line

  const ask=useCallback((q)=>{
    const text=(q||"").trim();if(!text)return
    __vrId++
    const uid="u"+__vrId
    setMsgs(m=>[...m,{id:uid,kind:"user",text}])
    emit("sg_veille_ask",{q:text.slice(0,80)})
    const res=routeIntent(text,beaches)
    const delay=reduce?0:340
    setTimeout(()=>{
      if(!mountedRef.current)return
      __vrId++
      setMsgs(m=>[...m,{id:"a"+__vrId,kind:"veil-answer",res}])
      emit("sg_veille_answer",{matched:!!res.best,beach:res.best&&res.best.id,status:res.best&&res.best.status})
    },delay)
  },[beaches,reduce,emit])

  const onSubmit=e=>{e&&e.preventDefault();const v=val;setVal("");ask(v)}

  const onCta=(beach)=>{
    emit("sg_veille_cta",{beach:beach.id,status:beach.status})
    if(beach.status==="clean"){onPremium?onPremium("veille_alert",{beach}):onOpenBeach&&onOpenBeach(beach)}
    else{onOpenBeach&&onOpenBeach(beach)}
  }
  const onMap=()=>{emit("sg_veille_tap",{el:"map"});onShowMap?onShowMap():onClose&&onClose()}

  const onBackdrop=e=>{
    const el=e.target;if(!el||!el.classList)return
    if(el.closest&&el.closest(".vr-dock,.vr-bubble"))return
    if(el===rootRef.current||el.classList.contains("vr-scrim"))onClose&&onClose()
  }

  const node=(
    <div ref={rootRef} className="sg-onink-scope vr-root" data-sg-live="1"
      role="dialog" aria-modal="true" aria-label={L.title}
      onClick={onBackdrop}>
      <style>{VR_CSS}</style>

      <header className="vr-hd">
        <svg className="vr-av" viewBox="-52 -30 104 84" aria-hidden="true">
          <rect x="-46" y="-14" width="26" height="28" rx="5" fill="#E8A800" stroke="#0D0D0D" strokeWidth="3"/>
          <rect x="20" y="-14" width="26" height="28" rx="5" fill="#E8A800" stroke="#0D0D0D" strokeWidth="3"/>
          <rect x="-18" y="-22" width="36" height="44" rx="9" fill="#FFC72C" stroke="#0D0D0D" strokeWidth="3.5"/>
          <circle cx="0" cy="4" r="11" fill="#0d1117"/><circle cx="3" cy="7" r="4.4" fill="#1EC8B0"/>
          <path d="M0 22 L-8 40 L8 40 Z" fill="#009E8E" opacity=".5"/>
        </svg>
        <div className="vr-tt-wrap">
          <div className="vr-tt">{L.title}</div>
          <div className="vr-st"><span className="vr-dot"/>{L.sub}</div>
        </div>
        <button ref={closeRef} className="vr-x vr-x" onClick={()=>onClose&&onClose()} aria-label={L.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
        </button>
      </header>

      <div className="vr-scrim"/>
      <div className="vr-conv" ref={sw.ref} aria-live="polite"
        onTouchStart={sw.onTouchStart} onTouchMove={sw.onTouchMove} onTouchEnd={sw.onTouchEnd}>
        {msgs.map(m=>{
          if(m.kind==="user")return<div key={m.id} className="vr-bubble vr-buser">{m.text}</div>
          if(m.kind==="veil-intro")return<div key={m.id} className="vr-bubble vr-bveil"><div className="vr-lock">{L.intro}</div></div>
          const res=m.res
          if(!res.best)return(
            <React.Fragment key={m.id}>
              <div className="vr-bubble vr-bveil"><div className="vr-lock">{L.noMatch}</div></div>
              <div className="vr-rebound">{L.chipsNoMatch.map(c=>(
                <button key={c} type="button" className="vr-rbtn vr-rbtn" onClick={()=>c===L.chipsNoMatch[2]?onMap():ask(c)}>{c}</button>
              ))}</div>
            </React.Fragment>
          )
          const beach=res.best,st=beach.status
          return(
            <React.Fragment key={m.id}>
              <div className="vr-bubble vr-bveil">
                <div className="vr-card">
                  <div className="vr-scenewrap">
                    <MiniScene beach={beach}/>
                    <div className={"vr-stamp vr-stamp-"+st}>
                      <div className="vr-v">{L.lbl[st]}</div>
                      <div className="vr-sc">{L.score(Math.round(beach.score))}</div>
                    </div>
                  </div>
                  <div className="vr-body">
                    <div className="vr-nm">{beach.name} <span>{beach.commune?("· "+beach.commune):""}</span></div>
                    <div className="vr-src">{L.measured}{beach.afai!=null?(" · AFAI "+Number(beach.afai).toFixed(2)):""}</div>
                    <div className="vr-facts">
                      {beach.kids&&<span className="vr-fact">{L.kidsFact}</span>}
                      {beach.snorkel&&<span className="vr-fact">{L.snorkFact}</span>}
                      <span className="vr-fact">{st==="clean"?L.okFact:L.checkFact}</span>
                    </div>
                    {st==="avoid"&&<div className="vr-h2s">{L.h2s}</div>}
                    {res.planB&&(
                      <div className="vr-planb">
                        <MiniScene beach={res.planB} w={120} h={40}/>
                        <div className="vr-t">{L.planb(res.planB.name+(res.planB.commune?(" ("+res.planB.commune+")"):""))[0]}<b>{res.planB.name}</b></div>
                      </div>
                    )}
                    <button type="button" className="vr-cta vr-cta" onClick={()=>onCta(beach)}>
                      {st==="clean"?L.ctaAlert(beach.name):L.ctaSheet(beach.name)}
                    </button>
                  </div>
                </div>
              </div>
              <div className="vr-rebound">{L.chipsFollow(res.snork).map(c=>(
                <button key={c} type="button" className="vr-rbtn vr-rbtn" onClick={()=>c===L.chipsFollow(res.snork)[2]?onMap():ask(c)}>{c}</button>
              ))}</div>
            </React.Fragment>
          )
        })}
      </div>

      <div className="vr-dock">
        <div className="vr-chips">
          {L.sug.map(s=>(<button key={s} type="button" className="vr-chip" onClick={()=>ask(s)}>{s}</button>))}
        </div>
        <form className="vr-inbar" onSubmit={onSubmit}>
          <input ref={inputRef} type="text" value={val} onChange={e=>setVal(e.target.value)} placeholder={L.placeholder} autoComplete="off"/>
          <button type="submit" className="vr-send vr-send" aria-label={L.send}>➤</button>
        </form>
      </div>
    </div>
  )
  if(typeof document==="undefined")return null
  return createPortal(node,document.body)
}

/* ============================================================
   CSS scopée .vr-* — racine .sg-onink-scope : re-spécifie boutons
   (.vr-x.vr-x/.vr-cta.vr-cta/.vr-send.vr-send, 0,3,x) + !important pour
   battre .theme-comic .sg-onink-scope button{…!important} (0,2,1).
   ============================================================ */
const VR_CSS=`
.vr-root{position:fixed;inset:0;z-index:4200;font-family:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",sans-serif;
  color:#0D0D0D;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;
  background:linear-gradient(180deg,#0a1620,#0e2a26 40%,#123a34);overscroll-behavior:none}
.vr-hd{padding:max(14px,env(safe-area-inset-top)) 16px 12px;border-bottom:2px solid rgba(255,255,255,.08);
  display:flex;gap:12px;align-items:center;flex:0 0 auto}
.vr-av{flex:0 0 auto;width:42px;height:42px}
.vr-tt-wrap{min-width:0}
.vr-tt{font:400 20px/1 Anton,Impact,Haettenschweiler,"Arial Narrow",system-ui,sans-serif;letter-spacing:.02em;color:#FFE47A;text-transform:uppercase}
.vr-st{margin-top:3px;font:700 10.5px/1 "JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;color:#1EC8B0;letter-spacing:.02em;display:flex;align-items:center;gap:5px}
.vr-dot{width:7px;height:7px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 3px rgba(34,197,94,.28);display:inline-block}
.vr-root button.vr-x.vr-x{margin-left:auto;cursor:pointer;display:grid;place-items:center;flex:0 0 auto;
  width:44px;height:44px;min-height:44px;border-radius:100px!important;color:#fff!important;
  border:1.5px solid rgba(255,216,132,.28)!important;background:rgba(8,20,15,.5)!important;box-shadow:none!important;padding:0!important}
.vr-scrim{display:none}
.vr-conv{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 14px 8px;display:flex;flex-direction:column;gap:10px}
.vr-bubble{max-width:92%;animation:vr-pop .42s cubic-bezier(.22,1.4,.36,1) both}
@keyframes vr-pop{0%{opacity:0;transform:translateY(10px) scale(.9,1.06)}60%{opacity:1;transform:translateY(0) scale(1.03,.97)}100%{transform:scale(1)}}
.vr-buser{align-self:flex-end;background:#FFC72C;color:#0D0D0D;border:2.5px solid #0D0D0D;
  border-radius:16px 16px 4px 16px;padding:10px 14px;font:600 14.5px/1.35 "Bricolage Grotesque",sans-serif;box-shadow:2px 2px 0 #0D0D0D}
.vr-bveil{align-self:flex-start;width:100%;max-width:100%}
.vr-lock{padding:12px 14px;border:2px dashed rgba(120,153,170,.55);border-radius:12px;background:#0e2a26;color:#cfeee7;font:600 13px/1.4 "Bricolage Grotesque",sans-serif}
.vr-card{border:3px solid #0D0D0D;border-radius:18px;overflow:hidden;background:#FDFCF7;box-shadow:4px 5px 0 rgba(0,0,0,.5)}
.vr-scenewrap{position:relative}
.vr-scenewrap svg.vr-scene{display:block;width:100%;height:150px}
.vr-stamp{position:absolute;left:12px;bottom:10px;background:#FDFCF7;border:2.5px solid #0D0D0D;border-radius:11px;
  padding:6px 12px 5px;transform:rotate(-3deg);box-shadow:3px 3px 0 #0D0D0D}
.vr-v{font:400 22px/.86 Anton,Impact,Haettenschweiler,"Arial Narrow",system-ui,sans-serif;text-transform:uppercase;color:#22C55E}
.vr-stamp-moderate .vr-v{color:#B87A00} .vr-stamp-avoid .vr-v{color:#E8522A}
.vr-sc{font:700 10px/1 "JetBrains Mono",monospace;color:#0D0D0D;margin-top:3px}
.vr-body{padding:11px 13px 13px}
.vr-nm{font:800 16px/1.1 "Bricolage Grotesque",sans-serif;color:#0D0D0D}
.vr-nm span{font:600 12px/1 "Bricolage Grotesque",sans-serif;color:#5A5A5A}
.vr-src{margin:5px 0 8px;font:700 10.5px/1.3 "JetBrains Mono",monospace;color:#B87A00}
.vr-facts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 4px}
.vr-fact{font:700 12px/1 "Bricolage Grotesque",sans-serif;background:#eef3f2;border:2px solid #0D0D0D;border-radius:999px;padding:6px 9px}
.vr-h2s{margin:7px 0 0;padding:8px 10px;border:2px solid #E8522A;border-radius:10px;background:#fff2ee;
  font:700 12px/1.35 "Bricolage Grotesque",sans-serif;color:#8a1c05}
.vr-planb{margin:8px 0 0;padding:9px 11px;border:2px dashed #009E8E;border-radius:12px;background:#eafcf8;display:flex;gap:9px;align-items:center}
.vr-planb svg{flex:0 0 auto;width:56px;height:40px;border-radius:6px;border:1.5px solid #0D0D0D}
.vr-planb .vr-t{font:700 12.5px/1.3 "Bricolage Grotesque",sans-serif;color:#075}
.vr-planb .vr-t b{color:#009E8E}
.vr-root button.vr-cta.vr-cta{display:block;width:100%;margin:10px 0 0;text-align:center;cursor:pointer;
  font:800 14px/1 "Bricolage Grotesque",sans-serif;color:#0D0D0D!important;background:#FFC72C!important;
  border:2.5px solid #0D0D0D!important;border-radius:12px!important;padding:12px;box-shadow:3px 3px 0 #0D0D0D!important;min-height:44px}
.vr-root button.vr-cta.vr-cta:active{transform:scale(.98)}
.vr-rebound{display:flex;flex-wrap:wrap;gap:7px;margin:2px 2px 2px}
.vr-root button.vr-rbtn.vr-rbtn{font:700 12.5px/1 "Bricolage Grotesque",sans-serif;cursor:pointer;background:rgba(255,255,255,.08)!important;
  color:#eafcf8!important;border:2px solid rgba(255,255,255,.2)!important;border-radius:999px!important;padding:8px 12px;min-height:34px}
.vr-root button.vr-rbtn.vr-rbtn:active{transform:scale(.95)}
.vr-dock{flex:0 0 auto;padding:10px 12px calc(env(safe-area-inset-bottom,0) + 12px);border-top:2px solid rgba(255,255,255,.08);background:#0a1620}
.vr-chips{display:flex;gap:7px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none}
.vr-chips::-webkit-scrollbar{display:none}
.vr-root button.vr-chip.vr-chip{white-space:nowrap;background:rgba(255,199,44,.14)!important;border:2px solid rgba(255,199,44,.4)!important;color:#FFE47A!important;
  border-radius:999px!important;padding:8px 12px;font:700 12.5px/1 "Bricolage Grotesque",sans-serif;cursor:pointer;min-height:34px}
.vr-root button.vr-chip.vr-chip:active{transform:scale(.95)}
.vr-inbar{display:flex;gap:8px}
.vr-inbar input{flex:1 1 auto;font:600 15px/1 "Bricolage Grotesque",sans-serif;color:#fff;background:rgba(255,255,255,.06);
  border:2px solid rgba(255,255,255,.2);border-radius:12px;padding:12px 14px;min-height:46px}
.vr-inbar input::placeholder{color:rgba(255,255,255,.5)}
.vr-root button.vr-send.vr-send{flex:0 0 auto;width:46px;min-height:46px;border:2.5px solid #0D0D0D!important;
  background:#FFC72C!important;color:#0D0D0D!important;border-radius:12px!important;font:800 16px/1 sans-serif;cursor:pointer;box-shadow:none!important}
.vr-root button.vr-send.vr-send:active{transform:scale(.95)}
@media (prefers-reduced-motion:reduce){.vr-bubble{animation:none!important}}
`
