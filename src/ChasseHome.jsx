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
  const sea = st==="bad" ? "#7a8a4a" : st==="mod" ? "#3a8f86" : "#3e2470"
  const gid = "lcg"+uid
  const top = score>=85   /* plages d'exception → oiseaux + soleil franc */
  return (
    <svg viewBox="0 0 200 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2e1a5e"/><stop offset=".55" stopColor="#6a2f9e"/>
        <stop offset=".8" stopColor="#ffb267"/><stop offset="1" stopColor="#ff8a3d"/>
      </linearGradient></defs>
      <rect width="200" height="96" fill={`url(#${gid})`}/>
      <circle cx="150" cy="60" r="26" fill="#ffe08a" opacity=".5"/>
      <circle cx="150" cy="60" r="16" fill="#fff2c4"/>
      <g stroke="#fff" strokeOpacity=".3" strokeWidth="1.4">
        <line x1="10" y1="20" x2="70" y2="17"/><line x1="6" y1="32" x2="56" y2="30"/>
      </g>
      <path d="M0 64 H200 V96 H0 Z" fill={sea}/>
      <path d="M0 64 q50 -6 100 0 t100 0 V76 H0 Z" fill="#3e2470" opacity=".6"/>
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
        <rect x="6" y="50" width="20" height="22" rx="2" fill="#1c7fb0"/>
        <rect x="94" y="50" width="20" height="22" rx="2" fill="#1c7fb0"/>
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

/* ---- REPÈRE SANTÉ H₂S (§4A santé) ----------------------------------------
   Les sargasses qui s'échouent et pourrissent dégagent du sulfure d'hydrogène
   (H₂S) + ammoniac. C'est LE vrai danger d'une plage « à éviter » — pas l'eau,
   mais l'air près des amas en décomposition. On le dit honnêtement, sans alarmer,
   avec un repère pour les personnes sensibles (réf. recommandations ARS Antilles).
   Additif, in-world comic, ZÉRO impact conversion/Stripe. Réversible : ?h2snote=0.
   (NB : ?h2s=1/0 est déjà pris par l'A/B `pw_h2s` du data-fiche BeachDive — surface
   distincte ; ce repère-ci vit dans le détail comic qui n'avait AUCUNE info santé.) */
function h2sOn(){ try{ return !/[?&]h2snote=0(?:&|$)/.test(window.location.search) }catch(_){ return true } }
const H2S_TXT={
  bad:{
    h:{fr:"GAZ H₂S — PRUDENCE",en:"H₂S GAS — CAUTION",es:"GAS H₂S — PRECAUCIÓN"},
    t:{fr:"Les sargasses échouées qui pourrissent dégagent du sulfure d'hydrogène (H₂S, odeur d'œuf pourri) et de l'ammoniac. À forte concentration ça irrite les yeux, la gorge et les voies respiratoires, et peut donner maux de tête et nausées.",
       en:"Sargassum rotting on the shore releases hydrogen sulfide (H₂S, rotten-egg smell) and ammonia. At higher levels it irritates eyes, throat and airways and can cause headaches and nausea.",
       es:"El sargazo varado que se pudre libera sulfuro de hidrógeno (H₂S, olor a huevo podrido) y amoníaco. En concentración alta irrita ojos, garganta y vías respiratorias y puede causar dolor de cabeza y náuseas."},
    s:{fr:"Nourrissons, femmes enceintes, asthmatiques, personnes âgées ou cardiaques : restez à distance des amas échoués et ne stationnez pas sous le vent.",
       en:"Infants, pregnant women, asthmatics, elderly or heart patients: keep your distance from the beached piles and don't stay downwind.",
       es:"Bebés, embarazadas, asmáticos, personas mayores o cardíacas: manténganse lejos de los montones varados y no se queden a favor del viento."}
  },
  mod:{
    h:{fr:"ODEUR POSSIBLE",en:"POSSIBLE SMELL",es:"POSIBLE OLOR"},
    t:{fr:"Quelques sargasses peuvent échouer et dégager une légère odeur en se décomposant. Sans danger en passage, mais évitez de stationner près des amas, surtout avec de jeunes enfants.",
       en:"Some sargassum may wash up and give off a mild smell as it decomposes. Harmless in passing, but avoid lingering near the piles, especially with young children.",
       es:"Algo de sargazo puede llegar y oler al descomponerse. Inofensivo de paso, pero evita quedarte junto a los montones, sobre todo con niños pequeños."}
  },
  src:{fr:"Repère santé — recommandations sargasses (ARS Antilles)",
       en:"Health note — sargassum public-health guidance",
       es:"Nota de salud — recomendaciones sanitarias del sargazo"}
}
function H2sNote({status,lang}){
  if(!h2sOn()) return null
  if(status!=="avoid"&&status!=="moderate") return null
  const bad=status==="avoid", k=bad?"bad":"mod"
  const _t=(o)=>(o&&(o[lang]||o.fr))||""
  return (
    <div className={"lc-h2s "+(bad?"bad":"mod")} role="note">
      <div className="lc-h2s-h"><span className="lc-h2s-ic" aria-hidden="true">{bad?"⚠️":"👃"}</span>{_t(H2S_TXT[k].h)}</div>
      <p className="lc-h2s-txt">{_t(H2S_TXT[k].t)}</p>
      {bad&&<div className="lc-h2s-sens"><b aria-hidden="true">👶</b><span>{_t(H2S_TXT.bad.s)}</span></div>}
      <div className="lc-h2s-src">{_t(H2S_TXT.src)}</div>
    </div>
  )
}

/* ---- PLAN B « OÙ ALLER PLUTÔT » (§4A #2) -------------------------------------
   Quand la plage ouverte est à éviter / à surveiller, l'angoisse n°1 devient
   « ok… mais où je vais alors ? ». On répond DANS le détail comic, sans éjecter :
   un rail des plages PROPRES les plus PROCHES (data RÉELLE — status clean +
   haversine sur la même île + score), meilleure note en tête (« le + sûr »).
   Miroir du PlanBPanel de la fiche data (A/B pw_planb), porté in-world. Additif,
   réversible ?planbcomic=0. Zéro logique paiement (tap = ouvre une plage propre).
   Calme (0 avoid/moderate) = rien ne s'affiche → on garde « plages voisines ». */
function planbOn(){ try{ return !/[?&]planbcomic=0(?:&|$)/.test(window.location.search) }catch(_){ return true } }
function _havKm(la1,lo1,la2,lo2){
  const R=6371,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180
  const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2
  return 2*R*Math.asin(Math.min(1,Math.sqrt(a)))
}
function cleanNearby(beach,pool){
  if(!beach||!(beach.status==="avoid"||beach.status==="moderate")) return []
  const geo=beach.lat!=null&&beach.lng!=null
  let list=(pool||[]).filter(b=>b&&b.id&&b.id!==beach.id&&b.status==="clean"&&b.score!=null
    &&(!beach.island||b.island===beach.island))
  if(geo) list=list.filter(b=>b.lat!=null&&b.lng!=null).map(b=>({...b,_d:_havKm(beach.lat,beach.lng,b.lat,b.lng)}))
  // 3 plus proches (ou meilleurs scores sans géo), puis meilleure note en tête du rail
  list.sort((a,b)=> geo ? ((a._d??1e9)-(b._d??1e9)) : ((b.score||0)-(a.score||0)))
  return list.slice(0,3).sort((a,b)=>(b.score||0)-(a.score||0))
}

/* APERÇU PRÉVISION 7 J (SCREENS_V2 #09) — rend la timeline RÉELLE tangible dans le
   détail comic, pour vendre la valeur premium (« la prévision + l'alerte ») au lieu
   d'un strip de 6 cadenas muets. Frontière gratuit/premium CALQUÉE sur ForecastChart
   (la data-fiche) : J0 = verdict réel · J+1.. = teinte du statut réel (la « forme »,
   estompée) + cadenas + confiance décroissante · jours « horizon » plus pâles (honnête).
   Source = données RÉELLES uniquement : sargData.weekly[sargId].forecast (20 zones
   sentinelles) ou _enrichedWeekly[_interp_<id>] (interpolation pipeline). JAMAIS de
   forecast généré → plage non couverte = on garde le simple cadenas (zéro fabrication,
   cf. circuit-breaker fiche-dive). Additif, in-world, ZÉRO logique paiement (tap →
   onPremium, inchangé). Réversible : ?fc7=0 → ancien strip plat. */
function fc7On(){ try{ return !/[?&]fc7=0(?:&|$)/.test(window.location.search) }catch(_){ return true } }
/* Inverse de SARG_TO_BEACH (SOURCE DE VÉRITÉ = src/Sargasses_PROD.jsx) : beach.id →
   id de zone sentinelle dans weekly{}. Carte stable (20 zones MQ/GP) — garder synchro. */
const SARG_BY_BEACH={mq014:"grande-anse",mq011:"anse-mitan",mq012:"anse-noire",mq034:"tartane",mq024:"anse-madame",mq016:"diamant",mq008:"pt-marin",mq004:"sainte-anne",mq001:"les-salines",mq044:"vauclin",gp021:"gp-grande-anse",gp031:"gp-malendure",gp010:"gp-sainte-anne",gp005:"gp-pt-chateaux",gp012:"gp-gosier",gp009:"gp-caravelle",gp014:"gp-bas-du-fort",gp024:"gp-deshaies",gp080:"gp-moule",gp042:"gp-vieux-fort"}
function resolveForecast(beach,sargData){
  if(!beach||!sargData) return null
  if(Array.isArray(beach.forecast)&&beach.forecast.length) return beach.forecast
  const wk=sargData.weekly||{}
  const w = wk[beach.id]                                              /* région USD / clé directe */
        || (SARG_BY_BEACH[beach.id]&&wk[SARG_BY_BEACH[beach.id]])     /* MQ/GP via mapping */
        || (sargData._enrichedWeekly&&sargData._enrichedWeekly["_interp_"+beach.id]) /* interpolé pipeline */
        || null
  const fc=w&&Array.isArray(w.forecast)?w.forecast:null
  return (fc&&fc.length)?fc:null
}
/* lettre du jour (depuis la date réelle du forecast) — i18n simple */
function fcLetter(d,lang){
  try{ const dt=d&&d.date?new Date(d.date+"T12:00:00"):null
    if(!dt||isNaN(dt.getTime())) return "·"
    const L={fr:["D","L","M","M","J","V","S"],en:["S","M","T","W","T","F","S"],es:["D","L","M","X","J","V","S"]}
    return (L[lang]||L.fr)[dt.getDay()] }catch(_){ return "·" }
}
/* TENDANCE du forecast → headline conversion HONNÊTE. On ne révèle JAMAIS le verdict/jour
   exact (= produit premium) ; on donne seulement la DIRECTION, et uniquement quand un jour
   PROCHE et FIABLE le justifie (type≠horizon + confiance≥50) — sinon « alerte » générique
   (jamais d'over-claim sur l'horizon flou). États : allclean (rassure) · worsen (propre→se
   dégrade : loss-aversion) · improve (sale→s'éclaircit : espoir) · alert. */
const ST_RANK={clean:0,moderate:1,avoid:2}
function fcTrend(fc){
  if(!fc||!fc.length) return "alert"
  if(fc.every(d=>d&&d.status==="clean")) return "allclean"
  const r0=ST_RANK[fc[0]&&fc[0].status]??0
  const reliable=fc.slice(1).filter(d=>d&&d.type!=="horizon"&&(d.confidence==null||d.confidence>=50))
  const worse=reliable.some(d=>(ST_RANK[d.status]??0)>r0)
  const better=reliable.some(d=>(ST_RANK[d.status]??0)<r0)
  if(r0===0&&worse) return "worsen"
  if(r0>0&&better) return "improve"
  return "alert"
}

/* DÉTAIL PLAGE « en monde comic » — ouvert au tap d'une carte. Garde le joueur
   dans l'univers arène (mêmes police/couleurs/Veilleur) au lieu de l'éjecter
   vers l'app sombre. Le seul handoff = le CTA premium (moment de conversion). */
export function ChasseDetail({beach,lang,onClose,onPremium,onFull,onRelated,pool=[],track,sargData,isPremium=false,favorites=[],onToggleFav}){
  const rel=(pool||[]).filter(b=>b&&b.id&&b.id!==beach.id&&b.status&&b.score!=null).slice(0,3)
  const planB=useMemo(()=>planbOn()?cleanNearby(beach,pool):[],[beach,pool])
  /* prévision 7 j RÉELLE (item 09) — null si plage non couverte ou kill-switch */
  const fc7=useMemo(()=>fc7On()?resolveForecast(beach,sargData):null,[beach,sargData])
  const fcTrendKey=useMemo(()=>fc7?fcTrend(fc7):"alert",[fc7])
  const fcConfJ1=fc7&&fc7[1]&&fc7[1].confidence!=null?Math.round(fc7[1].confidence):null
  const _t=(o)=>(o&&(o[lang]||o.fr))||""
  const v=vof(beach.status), r=rarity(beach.score)
  const sc=beach.score!=null?Math.round(beach.score):null
  const openFc=()=>{ if(track)try{track("sg_chasse_detail_premium",{beach_id:beach.id,from:"fcstrip",fc:fc7?1:0})}catch(_){}; onPremium&&onPremium("chasse_detail_fc") }
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
  const [shared,setShared]=useState(false)
  const share=useCallback(()=>{
    const url=(typeof window!=="undefined"&&window.location&&window.location.origin)||""
    const txt=_t({fr:`${beach.name} — ${_t(head)} ce matin. Vérifié au satellite par Le Veilleur 🛰️`,
                  en:`${beach.name} — ${_t(head)} this morning. Satellite-checked by Le Veilleur 🛰️`,
                  es:`${beach.name} — ${_t(head)} esta mañana. Verificado por satélite 🛰️`})
    try{
      if(navigator.share){ navigator.share({title:"Le Veilleur",text:txt,url}).catch(()=>{}) }
      else if(navigator.clipboard){ navigator.clipboard.writeText(txt+" "+url); setShared(true); setTimeout(()=>setShared(false),1800) }
    }catch(_){}
    if(track)try{track("sg_chasse_share",{beach_id:beach.id})}catch(_){}
  },[beach,head,track]) // eslint-disable-line
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

        {/* REPÈRE SANTÉ H₂S — n'apparaît que sur les plages à éviter / à surveiller */}
        <H2sNote status={beach.status} lang={lang}/>

        {/* 7 PROCHAINS JOURS — J0 réel ; le reste = aperçu honnête de la prévision RÉELLE
            (teinte du statut + cadenas + confiance), calqué sur la frontière de ForecastChart.
            Plage non couverte ou ?fc7=0 → simple cadenas (fallback honnête, inchangé). */}
        {fc7&&fc7.length ? (
          <div className="lc-detail-fc">
            <div className="lc-detail-fc-h">{_t({fr:"7 PROCHAINS JOURS",en:"NEXT 7 DAYS",es:"PRÓXIMOS 7 DÍAS"})}</div>
            <div className="lc-fc-cap">{fcConfJ1!=null
              ? _t({fr:`Mesuré au satellite · fiable ~4 j · ${fcConfJ1}% demain`,en:`Satellite-measured · reliable ~4 d · ${fcConfJ1}% tomorrow`,es:`Medido por satélite · fiable ~4 d · ${fcConfJ1}% mañana`})
              : _t({fr:"Mesuré au satellite ce matin",en:"Satellite-measured this morning",es:"Medido por satélite esta mañana"})}</div>
            <div className="lc-detail-fc-row" onClick={isPremium?undefined:openFc}>
              {Array.from({length:7}).map((_,i)=>{
                const d=fc7[i]
                if(i===0) return (
                  <div key={i} className={`lc-fc-cell s-${v.st} now`}>
                    <span className="lc-fc-day">{_t({fr:"Auj",en:"Now",es:"Hoy"})}</span>
                    <span className="lc-fc-dot">{sc!=null?sc:"•"}</span>
                  </div>
                )
                if(!d) return (
                  <div key={i} className="lc-fc-cell lock">
                    <span className="lc-fc-day">·</span><span className="lc-fc-dot">🔒</span>
                  </div>
                )
                const dv=vof(d.status), far=d.type==="horizon"
                const conf=d.confidence!=null?Math.round(d.confidence):null
                if(isPremium) return (
                  /* PREMIUM : jour débloqué — statut réel coloré, plus de cadenas */
                  <div key={i} className={`lc-fc-cell s-${dv.st} now${far?" far":""}`}>
                    <span className="lc-fc-day">{fcLetter(d,lang)}</span>
                    <span className="lc-fc-dot">{conf!=null?conf:"•"}</span>
                  </div>
                )
                return (
                  <div key={i} className={`lc-fc-cell teaser s-${dv.st}${far?" far":""}`}>
                    <span className="lc-fc-day">{fcLetter(d,lang)}</span>
                    <span className="lc-fc-dot">🔒</span>
                    {conf!=null&&<span className="lc-fc-conf">{conf}%</span>}
                  </div>
                )
              })}
            </div>
            <div className={"lc-fc-line"+(isPremium||fcTrendKey==="allclean"?" ok":fcTrendKey==="worsen"?" warn":fcTrendKey==="improve"?" hope":"")}>{
              isPremium ? _t({fr:"Prévision 7 jours débloquée — Le Veilleur veille pour toi.",en:"7-day forecast unlocked — Le Veilleur watches for you.",es:"Pronóstico 7 días desbloqueado — El Vigía vela por ti."})
              : fcTrendKey==="allclean" ? _t({fr:"Propre toute la semaine — Le Veilleur veille pour toi.",en:"Clean all week — Le Veilleur watches for you.",es:"Limpia toda la semana — El Vigía vela por ti."})
              : fcTrendKey==="worsen" ? _t({fr:"Propre aujourd'hui — mais ça pourrait tourner. Le Veilleur te prévient avant.",en:"Clean today — but it could turn. Le Veilleur warns you first.",es:"Limpia hoy — pero puede cambiar. El Vigía te avisa antes."})
              : fcTrendKey==="improve" ? _t({fr:"Ça devrait se dégager — débloque le jour où la mer revient propre.",en:"It should clear up — unlock the day the water comes back clean.",es:"Debería despejarse — desbloquea el día en que el agua vuelve limpia."})
              : _t({fr:"Le Veilleur t'alerte le jour exact où ça bascule.",en:"Le Veilleur alerts you the exact day it flips.",es:"El Vigía te avisa el día exacto en que cambia."})}</div>
          </div>
        ) : (
          <div className="lc-detail-fc">
            <div className="lc-detail-fc-h">{_t({fr:"7 PROCHAINS JOURS",en:"NEXT 7 DAYS",es:"PRÓXIMOS 7 DÍAS"})}</div>
            <div className="lc-detail-fc-row" onClick={isPremium?undefined:openFc}>
              {Array.from({length:7}).map((_,i)=>{
                const d=new Date(Date.now()+i*864e5)
                const dl=["D","L","M","M","J","V","S"][d.getDay()]
                return (
                  <div key={i} className={"lc-fc-cell"+(i===0?` s-${v.st} now`:" lock")}>
                    <span className="lc-fc-day">{i===0?_t({fr:"Auj",en:"Now",es:"Hoy"}):dl}</span>
                    <span className="lc-fc-dot">{i===0?(sc!=null?sc:"•"):(isPremium?"·":"🔒")}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!isPremium&&<button type="button" className="lc-cta yel" onClick={()=>{ if(track)try{track("sg_chasse_detail_premium",{beach_id:beach.id})}catch(_){}; onPremium&&onPremium("chasse_detail") }}>
          {_t({fr:"VOIR LES 7 PROCHAINS JOURS →",en:"SEE THE NEXT 7 DAYS →",es:"VER LOS 7 DÍAS →"})}
        </button>}
        <div className="lc-detail-actions">
          {onToggleFav&&<button type="button" className={"lc-detail-full lc-detail-fav"+(favorites.includes(beach.id)?" on":"")} aria-pressed={favorites.includes(beach.id)}
            onClick={()=>{ if(track)try{track(favorites.includes(beach.id)?"sg_chasse_unfav":"sg_chasse_fav",{beach_id:beach.id})}catch(_){}; onToggleFav(beach.id) }}>
            {favorites.includes(beach.id)?"❤️ "+_t({fr:"Suivie",en:"Saved",es:"Guardada"}):"🤍 "+_t({fr:"Suivre",en:"Save",es:"Seguir"})}
          </button>}
          <button type="button" className="lc-detail-full" onClick={share}>
            📣 {shared?_t({fr:"Copié !",en:"Copied!",es:"¡Copiado!"}):_t({fr:"Partager",en:"Share",es:"Compartir"})}
          </button>
          <button type="button" className="lc-detail-full" onClick={onFull}>
            {_t({fr:"Fiche complète →",en:"Full sheet →",es:"Ficha completa →"})}
          </button>
        </div>

        {planB.length>0 ? (
          <div className="lc-detail-rel lc-detail-planb">
            <div className="lc-detail-fc-h">{_t({fr:"OÙ ALLER PLUTÔT",en:"GO HERE INSTEAD",es:"MEJOR VE AQUÍ"})}</div>
            <div className="lc-planb-sub">{_t({fr:"Plages propres les plus proches, vérifiées au satellite ce matin.",en:"Closest clean beaches, satellite-checked this morning.",es:"Playas limpias más cercanas, verificadas por satélite."})}</div>
            <div className="lc-detail-rel-row">
              {planB.map((b,i)=>(
                <div className={"lc-detail-rel-card"+(i===0?" lc-planb-best":"")} key={b.id}>
                  {i===0&&<span className="lc-planb-tag">{_t({fr:"le + sûr",en:"best pick",es:"mejor"})}</span>}
                  <TCard beach={b} lang={lang} onTap={()=>{ if(track)try{track("sg_chasse_planb_pick",{from:beach.id,to:b.id,rank:i,dist:b._d!=null?Math.round(b._d):null})}catch(_){}; onRelated&&onRelated(b) }}/>
                  {b._d!=null&&<span className="lc-planb-dist">~{Math.round(b._d)} km</span>}
                </div>
              ))}
            </div>
          </div>
        ) : rel.length>0 ? (
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
        ) : null}
      </div>
    </div>
  )
}

/* ====================================================================
   CENTRE D'ALERTES « MES ALERTES » (SCREENS_V2 #19 — alerts center)
   ------------------------------------------------------------------
   Modale BD qui liste des alertes RÉELLES dérivées UNIQUEMENT de la donnée
   déjà présente — JAMAIS d'historique de notifications factice, JAMAIS d'alerte
   inventée. Deux types, tous deux 100% data :
     1) TRANSITION : pour chaque plage affichée/collectée ayant un forecast réel
        (resolveForecast → sargData.weekly[id].forecast), le 1er jour J+N (N≥1)
        où forecast[N].status diffère du statut d'aujourd'hui → « {nom} —
        bascule J+N : {ancien}→{nouveau} ». On ignore les jours « horizon » (flous)
        ET les jours peu fiables (confidence<50) → on n'alerte que sur du solide.
     2) SANTÉ : si une plage affichée est ACTUELLEMENT 'avoid' → « {nom} — odeur
        possible (H₂S) aujourd'hui » (le vrai danger d'une plage à éviter).
   Tri par imminence (J+1 d'abord ; la santé = J0 → tout en tête). Si rien de
   fiable → état VIDE HONNÊTE « Tout est calme ». Additif, in-world comic, i18n
   fr/en/es, a11y (role=dialog + Échap + focus) + reduced-motion. ZÉRO logique
   paiement (tap d'une carte → onOpenBeach, comme partout). Réversible : ?alerts=0
   désactive la cloche+modale ; ?alerts=preview force l'ouverture avec un échantillon
   pour la revue design (clairement étiqueté « aperçu », pas mêlé aux vraies). */
function alertsOnFlag(){ try{ return !/[?&]alerts=0(?:&|$)/.test(window.location.search) }catch(_){ return true } }
function alertsPreview(){ try{ return /[?&]alerts=preview(?:&|$)/.test(window.location.search) }catch(_){ return false } }
function alertsForceOpen(){ try{ return /[?&]alerts=(1|preview)(?:&|$)/.test(window.location.search) }catch(_){ return false } }

const ALERTS_I18N={
  title:{fr:"MES ALERTES",en:"MY ALERTS",es:"MIS ALERTAS"},
  bell:{fr:"Mes alertes",en:"My alerts",es:"Mis alertas"},
  sub:{fr:"Dérivées de la prévision satellite de tes plages — pas de notifications inventées.",
       en:"Derived from the satellite forecast of your beaches — no invented notifications.",
       es:"Derivadas del pronóstico satelital de tus playas — sin notificaciones inventadas."},
  empty:{fr:"Tout est calme — aucune alerte pour tes plages.",
         en:"All calm — no alerts for your beaches.",
         es:"Todo tranquilo — ninguna alerta para tus playas."},
  emptySub:{fr:"Le Veilleur surveille. Reviens demain : si la mer change, tu le sauras ici.",
            en:"Le Veilleur is watching. Come back tomorrow: if the sea changes, you'll know here.",
            es:"El Vigía vigila. Vuelve mañana: si el mar cambia, lo sabrás aquí."},
  preview:{fr:"APERÇU (données d'exemple)",en:"PREVIEW (sample data)",es:"VISTA PREVIA (datos de ejemplo)"},
  today:{fr:"Aujourd'hui",en:"Today",es:"Hoy"},
  tomorrow:{fr:"Demain",en:"Tomorrow",es:"Mañana"},
  inDays:{fr:(n)=>"Dans "+n+" j",en:(n)=>"In "+n+" d",es:(n)=>"En "+n+" d"},
  transition:{fr:"Bascule",en:"Flip",es:"Cambio"},
  h2sHead:{fr:"Odeur possible (H₂S) aujourd'hui",en:"Possible smell (H₂S) today",es:"Posible olor (H₂S) hoy"},
  h2sSub:{fr:"Sargasses échouées qui se décomposent — évite de stationner près des amas.",
          en:"Beached sargassum decomposing — avoid lingering near the piles.",
          es:"Sargazo varado descomponiéndose — evita quedarte junto a los montones."},
  open:{fr:"Voir la plage →",en:"See the beach →",es:"Ver la playa →"}
}
/* libellé d'échéance i18n (J0=auj, J+1=demain, sinon « dans N j ») */
function alertWhen(n,lang){
  const _t=(o)=>(o&&(o[lang]||o.fr))||""
  if(n<=0) return _t(ALERTS_I18N.today)
  if(n===1) return _t(ALERTS_I18N.tomorrow)
  return (ALERTS_I18N.inDays[lang]||ALERTS_I18N.inDays.fr)(n)
}
/* ---- calcul des alertes (fonction PURE, data réelle uniquement) ----
   Pour chaque plage de `beaches` (déjà filtrées id+status+score), on lit le
   forecast réel via resolveForecast. On émet :
     · une alerte SANTÉ (J0) si status courant = 'avoid'
     · une alerte TRANSITION sur le 1er jour fiable (≠horizon, conf≥50) dont le
       status diffère d'aujourd'hui.
   Aucune fabrication : plage sans forecast couvert → aucune transition émise. */
function computeAlerts(beaches,sargData){
  const out=[]
  if(!Array.isArray(beaches)) return out
  for(const b of beaches){
    if(!b||!b.id||!b.status||b.score==null) continue
    const today=b.status
    /* — santé : à éviter aujourd'hui = odeur H₂S possible (vrai danger) — */
    if(today==="avoid"){
      out.push({key:b.id+"-h2s",type:"health",day:0,beach:b,status:"avoid"})
    }
    /* — transition : 1er jour fiable où le statut change — */
    const fc=resolveForecast(b,sargData)
    if(fc&&fc.length){
      for(let i=1;i<fc.length;i++){
        const d=fc[i]
        if(!d||!d.status) continue
        if(d.type==="horizon") continue                       /* horizon flou = on n'alerte pas */
        if(d.confidence!=null&&d.confidence<50) continue       /* peu fiable = on n'alerte pas */
        if(d.status!==today){
          out.push({key:b.id+"-tr",type:"transition",day:i,beach:b,
            from:today,to:d.status,conf:d.confidence!=null?Math.round(d.confidence):null})
          break                                                /* 1re transition seulement */
        }
      }
    }
  }
  /* tri par imminence (J0 santé d'abord, puis J+1, J+2…), puis score décroissant */
  out.sort((a,b)=> (a.day-b.day) || ((b.beach.score||0)-(a.beach.score||0)))
  return out
}
/* échantillon d'aperçu (?alerts=preview) — clairement étiqueté, JAMAIS mêlé aux vraies */
function previewAlerts(beaches){
  const pick=(Array.isArray(beaches)?beaches:[]).filter(b=>b&&b.id&&b.name).slice(0,3)
  const nm=(i,fb)=> (pick[i]&&pick[i].name)||fb
  const bk=(i)=> pick[i]||{id:"_pv"+i,name:nm(i,"Plage")}
  return [
    {key:"_pv-h",type:"health",day:0,beach:bk(0),status:"avoid",_preview:true},
    {key:"_pv-t1",type:"transition",day:1,beach:bk(1),from:"clean",to:"moderate",conf:78,_preview:true},
    {key:"_pv-t2",type:"transition",day:3,beach:bk(2),from:"avoid",to:"clean",conf:61,_preview:true}
  ]
}

/* ---- AlertsModal : modale du centre d'alertes (overlay in-world, jamais de cul-de-sac) ----
   z-index 1140 < détail 1200 < levelup 1250 (comme BadgesSheet 1150, juste en dessous). */
function AlertsModal({alerts,lang,onClose,onOpenBeach,track,preview}){
  const _t=(o)=>(o&&(o[lang]||o.fr))||""
  const closeRef=useRef(null)
  useEffect(()=>{ try{ closeRef.current&&closeRef.current.focus() }catch(_){} },[])
  useEffect(()=>{ const k=(e)=>{ if(e.key==="Escape"){ e.stopPropagation(); onClose&&onClose() } }
    window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k) },[onClose])
  return (
    <div className="lc-alerts" role="dialog" aria-modal="true"
      aria-label={_t(ALERTS_I18N.bell)} onClick={onClose}>
      <div className="lc-alerts-modal" onClick={e=>e.stopPropagation()}>
        <button type="button" ref={closeRef} className="lc-alerts-x" onClick={onClose}
          aria-label={_t({fr:"Fermer",en:"Close",es:"Cerrar"})}>✕</button>
        <div className="lc-alerts-title"><span aria-hidden="true">🔔</span>{_t(ALERTS_I18N.title)}</div>
        {preview&&<div className="lc-alerts-pv">{_t(ALERTS_I18N.preview)}</div>}
        <p className="lc-alerts-sub">{_t(ALERTS_I18N.sub)}</p>
        {alerts.length ? (
          <div className="lc-alerts-list">
            {alerts.map((a)=>{
              const b=a.beach
              if(a.type==="health"){
                const dv=vof("avoid")
                return (
                  <div key={a.key} className={`lc-alert-card s-${dv.st}`}>
                    <span className={`lc-alert-pill s-${dv.st}`} aria-hidden="true">👃</span>
                    <span className="lc-alert-body">
                      <span className="lc-alert-when">{alertWhen(0,lang)}</span>
                      <span className="lc-alert-name">{b.name}</span>
                      <span className="lc-alert-msg">{_t(ALERTS_I18N.h2sHead)}</span>
                      <span className="lc-alert-detail">{_t(ALERTS_I18N.h2sSub)}</span>
                      {!a._preview&&onOpenBeach&&(
                        <button type="button" className="lc-alert-open"
                          onClick={()=>{ if(track)try{track("sg_alert_open_beach",{beach_id:b.id,type:"health"})}catch(_){}; onOpenBeach(b) }}>
                          {_t(ALERTS_I18N.open)}
                        </button>)}
                    </span>
                  </div>
                )
              }
              /* transition */
              const nv=vof(a.to), ov=vof(a.from)
              return (
                <div key={a.key} className={`lc-alert-card s-${nv.st}`}>
                  <span className={`lc-alert-pill s-${nv.st}`} aria-hidden="true">{a.to==="avoid"?"⚠️":a.to==="moderate"?"🌬️":"🌊"}</span>
                  <span className="lc-alert-body">
                    <span className="lc-alert-when">{alertWhen(a.day,lang)}{a.conf!=null?" · "+a.conf+"%":""}</span>
                    <span className="lc-alert-name">{b.name}</span>
                    <span className="lc-alert-msg">
                      {_t(ALERTS_I18N.transition)} J+{a.day}
                      <span className="lc-alert-arrow">
                        <i className={`s-${ov.st}`}>{_t(ov)}</i>
                        <em aria-hidden="true">→</em>
                        <i className={`s-${nv.st}`}>{_t(nv)}</i>
                      </span>
                    </span>
                    {!a._preview&&onOpenBeach&&(
                      <button type="button" className="lc-alert-open"
                        onClick={()=>{ if(track)try{track("sg_alert_open_beach",{beach_id:b.id,type:"transition",day:a.day})}catch(_){}; onOpenBeach(b) }}>
                        {_t(ALERTS_I18N.open)}
                      </button>)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="lc-alert-empty">
            <div className="lc-alert-empty-veil"><Veilleur mood="calm" size={64}/></div>
            <div className="lc-alert-empty-h">{_t(ALERTS_I18N.empty)}</div>
            <p className="lc-sub">{_t(ALERTS_I18N.emptySub)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ====================================================================
   SÉRIE « 7 JOURS D'AFFILÉE » (SCREENS_V2 #28 — streak reward)
   ------------------------------------------------------------------
   Surface de rétention qui rend tangible la VRAIE série du joueur : chaque
   matin où il devine le verdict de la carte du jour = +1 jour. On affiche
   un ruban comic de 7 cases = le cycle d'une « septaine », plus le record.
   DONNÉES 100% RÉELLES (sg_chasse) — zéro fabrication :
     · st.streak  → jours consécutifs en cours (déjà calculé par guess())
     · st.best    → record de série
     · st.last    → dernière date jouée → série « vivante » (auj/hier) ou « froide »
   On NE fabrique aucun calendrier : on dérive la position dans le cycle de 7
   depuis le streak réel (weekDone = streak % 7, 7 si multiple non nul).
   La récompense au bout de 7 = un PALIER honnête (titre Veilleur, cf TIERS) +
   célébration ; on ne promet RIEN qui touche au paiement (le CTA premium reste
   la même porte que partout : onPremium, inchangé). Additif, in-world comic,
   i18n fr/en/es, a11y + reduced-motion. Réversible : ?streak7=0. */
function streak7On(){ try{ return !/[?&]streak7=0(?:&|$)/.test(window.location.search) }catch(_){ return true } }
/* dérive l'état de la septaine depuis le streak RÉEL + la date du dernier jeu.
   inWeek = nb de cases pleines dans le cycle courant (1..7) ; 7 pile = septaine
   fraîchement bouclée. toGo = jours restants avant la prochaine septaine. */
function streakWeek(streak,last){
  const s=Math.max(0,+streak||0)
  const live = !!last && (last===todayKey()||last===yesterdayKey())   /* série encore en vie ? */
  const mod = s%7
  const cycles = Math.floor(s/7)                                       /* septaines complètes */
  const inWeek = s===0 ? 0 : (mod===0 ? 7 : mod)                       /* cases pleines 1..7 */
  const justDone = s>0 && mod===0 && live                             /* septaine bouclée à l'instant (vivante) */
  const toGo = s===0 ? 7 : (mod===0 ? 7 : 7-mod)                       /* jours avant la prochaine septaine */
  return {s,live,cycles,inWeek,justDone,toGo}
}
const STREAK7_I18N={
  title:{fr:"SÉRIE 7 JOURS",en:"7-DAY STREAK",es:"RACHA DE 7 DÍAS"},
  sub:{fr:"Devine le verdict chaque matin. Sept jours d'affilée = une septaine bouclée.",
       en:"Guess the verdict every morning. Seven days in a row = one week sealed.",
       es:"Adivina el veredicto cada mañana. Siete días seguidos = una semana sellada."},
  dayShort:{fr:["J1","J2","J3","J4","J5","J6","J7"],en:["D1","D2","D3","D4","D5","D6","D7"],es:["D1","D2","D3","D4","D5","D6","D7"]},
  live:{fr:"série en cours 🔥",en:"streak live 🔥",es:"racha activa 🔥"},
  cold:{fr:"série en pause — reviens demain pour la relancer",en:"streak paused — come back tomorrow to revive it",es:"racha en pausa — vuelve mañana para reactivarla"},
  none:{fr:"Joue la carte du jour pour démarrer ta série.",en:"Play today's card to start your streak.",es:"Juega la carta del día para empezar tu racha."},
  best:{fr:"record",en:"best",es:"récord"},
  cycles:{fr:(n)=>n+" septaine"+(n>1?"s":"")+" bouclée"+(n>1?"s":""),
          en:(n)=>n+" full week"+(n>1?"s":""),
          es:(n)=>n+" semana"+(n>1?"s":"")+" completada"+(n>1?"s":"")},
  toGo:{fr:(n)=>n===1?"plus qu'1 jour avant la septaine":"encore "+n+" jours avant la septaine",
        en:(n)=>n===1?"just 1 day to complete the week":n+" more days to complete the week",
        es:(n)=>n===1?"solo 1 día para completar la semana":n+" días más para completar la semana"},
  sealed:{fr:"SEPTAINE BOUCLÉE !",en:"WEEK SEALED!",es:"¡SEMANA SELLADA!"},
  sealedSub:{fr:"Sept jours d'affilée. Le Veilleur te repère parmi les chasseurs assidus.",
             en:"Seven days straight. Le Veilleur marks you among the dedicated hunters.",
             es:"Siete días seguidos. El Vigía te distingue entre los cazadores dedicados."},
  cta:{fr:"Activer l'alerte 7 jours",en:"Turn on the 7-day alert",es:"Activar la alerta de 7 días"}
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

/* ====================================================================
   BADGES (SCREENS_V2 — BadgesSheet) — récompenses de progression
   collectées DANS le monde comic, à partir de DONNÉES RÉELLES uniquement :
     · sg_chasse { streak, best, collected[] }  (état local du joueur)
     · sg_unlocks { keys:[] }  (système jeu/solutions, window.sgUnlockCount)
   Zéro serveur, zéro fabrication : chaque condition lit une vraie valeur.
   Additif, in-world, ZÉRO logique paiement. Réversible : ?badges=0.
   Rareté parallèle aux cartes TCG (common/rare/épique/légendaire). i18n fr/en/es. */
function badgesOnFlag(){ try{ return !/[?&]badges=0(?:&|$)/.test(window.location.search) }catch(_){ return true } }
function badgesForceOpen(){ try{ return /[?&]badges=1(?:&|$)/.test(window.location.search) }catch(_){ return false } }
/* compteur de déblocages jeu (sgUnlockCount global posé par Sargasses_PROD), tolérant si absent */
function sgUnlockCnt(){ try{ return (typeof window!=="undefined"&&typeof window.sgUnlockCount==="function") ? (window.sgUnlockCount()||0) : 0 }catch(_){ return 0 } }

/* ctx = { collected[], collSet:Set, streak, best, unlocks } ; chaque condition lit du RÉEL */
const CHASSE_BADGES=[
  /* — Pokédex (plages collectées) : miroir des paliers TIERS — */
  {id:"first_collect", icon:"🎴", rar:"com",  fr:"Première Carte",   en:"First Card",       es:"Primera Carta",
   cond:(c)=>c.collSet.size>=1},
  {id:"dex_5",         icon:"⭐", rar:"com",  fr:"Apprenti Veilleur", en:"Veilleur Trainee", es:"Aprendiz",
   cond:(c)=>c.collSet.size>=5},
  {id:"dex_12",        icon:"🧭", rar:"rare", fr:"Éclaireur",         en:"Scout",            es:"Explorador",
   cond:(c)=>c.collSet.size>=12},
  {id:"dex_25",        icon:"🗺️", rar:"epic", fr:"Cartographe",       en:"Cartographer",     es:"Cartógrafo",
   cond:(c)=>c.collSet.size>=25},
  {id:"dex_45",        icon:"🏆", rar:"leg",  fr:"Maître Veilleur",   en:"Veilleur Master",  es:"Maestro",
   cond:(c)=>c.collSet.size>=45},
  {id:"dex_70",        icon:"👑", rar:"leg",  fr:"Légende du Lagon",  en:"Lagoon Legend",    es:"Leyenda del Lagón",
   cond:(c)=>c.collSet.size>=70},
  /* — Série (devine le verdict) : streak réel + record réel — */
  {id:"streak_5",      icon:"🔥", rar:"rare", fr:"Série de 5",        en:"Streak of 5",      es:"Racha de 5",
   cond:(c)=>(c.streak>=5||c.best>=5)},
  {id:"streak_10",     icon:"💥", rar:"epic", fr:"Série de 10",       en:"Streak of 10",     es:"Racha de 10",
   cond:(c)=>(c.streak>=10||c.best>=10)},
  {id:"streak_20",     icon:"⚡", rar:"leg",  fr:"Série de 20",       en:"Streak of 20",     es:"Racha de 20",
   cond:(c)=>(c.streak>=20||c.best>=20)},
  /* — Tous les verdicts collectés (clean + moderate + avoid présents dans la collection) — */
  {id:"verdict_all",   icon:"🌈", rar:"epic", fr:"Tous les Verdicts", en:"Every Verdict",    es:"Todos los Veredictos",
   cond:(c)=>c.statusSet&&c.statusSet.has("clean")&&c.statusSet.has("moderate")&&c.statusSet.has("avoid")},
  /* — Système jeu : déblocages (solutions / pistes) — */
  {id:"unlock_1",      icon:"🔓", rar:"com",  fr:"Premier Déblocage", en:"First Unlock",     es:"Primer Desbloqueo",
   cond:(c)=>c.unlocks>=1},
  {id:"unlock_8",      icon:"🔬", rar:"rare", fr:"Données Déverrouillées", en:"Data Unlocked", es:"Datos Desbloqueados",
   cond:(c)=>c.unlocks>=8},
  /* — Engagement (email capté — vraie valeur funnel) — */
  {id:"watcher",       icon:"📬", rar:"rare", fr:"Le Veilleur Veille", en:"Watcher On",      es:"El Vigía Vela",
   cond:(c)=>!!c.email}
]
const BADGE_RAR={
  com: {cls:"b-com",  lbl:{fr:"COMMUN",en:"COMMON",es:"COMÚN"}},
  rare:{cls:"b-rare", lbl:{fr:"RARE",en:"RARE",es:"RARO"}},
  epic:{cls:"b-epic", lbl:{fr:"ÉPIQUE",en:"EPIC",es:"ÉPICO"}},
  leg: {cls:"b-leg",  lbl:{fr:"LÉGENDAIRE",en:"LEGENDARY",es:"LEGENDARIO"}}
}
/* construit le contexte RÉEL pour évaluer les conditions */
function badgeCtx({collected,collSet,statusSet,streak,best,unlocks,email}){
  return {collected:collected||[],collSet:collSet||new Set(),statusSet:statusSet||new Set(),
          streak:+streak||0,best:+best||0,unlocks:+unlocks||0,email:!!email}
}

/* ---- BadgesSheet : modal des badges (overlay in-world, jamais de cul-de-sac) ---- */
function BadgesSheet({badges,unlockedSet,onClose,lang}){
  const _t=(o)=>(o&&(o[lang]||o.fr))||""
  const closeRef=useRef(null)
  useEffect(()=>{ try{ closeRef.current&&closeRef.current.focus() }catch(_){} },[])
  useEffect(()=>{ const k=(e)=>{ if(e.key==="Escape"){ e.stopPropagation(); onClose&&onClose() } }
    window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k) },[onClose])
  const unlocked=badges.filter(b=>unlockedSet.has(b.id))
  const locked=badges.filter(b=>!unlockedSet.has(b.id))
  return (
    <div className="lc-badgesheet" role="dialog" aria-modal="true"
      aria-label={_t({fr:"Badges collectés",en:"Collected badges",es:"Insignias coleccionadas"})}
      onClick={onClose}>
      <div className="lc-badge-modal" onClick={e=>e.stopPropagation()}>
        <button type="button" ref={closeRef} className="lc-badge-x" onClick={onClose}
          aria-label={_t({fr:"Fermer",en:"Close",es:"Cerrar"})}>✕</button>
        <div className="lc-badge-title"><span aria-hidden="true">🏅</span>{_t({fr:"BADGES DÉBLOQUÉS",en:"BADGES UNLOCKED",es:"INSIGNIAS"})}</div>
        <div className="lc-badge-cnt">{unlocked.length}/{badges.length}</div>
        {unlocked.length ? (
          <div className="lc-badge-grid">
            {unlocked.map((b,i)=>{
              const r=BADGE_RAR[b.rar]||BADGE_RAR.com
              return (
                <div key={b.id} className={"lc-badge-card lc-badge-pop "+r.cls} style={{"--delay":(i*0.05)+"s"}}>
                  <span className="lc-badge-ic" aria-hidden="true">{b.icon}</span>
                  <span className="lc-badge-nm">{b[lang]||b.fr}</span>
                  <span className="lc-badge-rar">{_t(r.lbl)}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="lc-sub lc-center">{_t({fr:"Aucun badge encore — collectionne des cartes et enchaîne les séries.",en:"No badge yet — collect cards and build streaks.",es:"Aún sin insignias — colecciona cartas y encadena rachas."})}</p>
        )}
        {locked.length>0&&(
          <>
            <div className="lc-badge-toh">{_t({fr:"À DÉBLOQUER",en:"TO UNLOCK",es:"POR DESBLOQUEAR"})}</div>
            <div className="lc-badge-grid">
              {locked.map(b=>(
                <div key={b.id} className="lc-badge-card lc-badge-locked">
                  <span className="lc-badge-ic" aria-hidden="true">{b.icon}</span>
                  <span className="lc-badge-nm">{b[lang]||b.fr}</span>
                  <span className="lc-badge-rar">🔒</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ChasseHome(props){
  const {beach,lang="fr",sargData,pickBeaches=[],onOpen,onOpenBeach,onPremium,onShowMap,onCaptureEmail,track,exiting,isPremium=false,favorites=[],onToggleFav}=props
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
  /* DÉFI DU JOUR « plus chaud / plus froid » (mini-jeu self-contained, 1 round/jour) */
  const defiPair=useMemo(()=>{
    const a=(pickBeaches||[]).filter(b=>b&&b.id&&b.score!=null&&b.status&&b.name)
    if(a.length<2) return null
    const doy=Math.floor(Date.now()/864e5), i=doy%a.length; let j=(doy*7+3)%a.length; if(j===i) j=(i+1)%a.length
    return [a[i],a[j]]
  },[pickBeaches])
  const [defiDone,setDefiDone]=useState(()=>{ try{ return localStorage.getItem("sg_defi_day")===todayKey() }catch(_){ return false } })
  const [defiRes,setDefiRes]=useState(null)
  const guessDefi=useCallback((dir)=>{
    if(!defiPair||defiRes||defiDone) return
    const cur=defiPair[0], nxt=defiPair[1]
    const ok = dir==="up" ? (nxt.score>=cur.score) : (nxt.score<=cur.score)
    setDefiRes({ok,score:Math.round(nxt.score),name:nxt.name})
    try{ localStorage.setItem("sg_defi_day",todayKey()) }catch(_){}
    setDefiDone(true)
    if(track)try{track("sg_chasse_defi",{correct:ok?1:0})}catch(_){}
  },[defiPair,defiRes,defiDone,track])
  /* recherche + filtre du Pokédex (écrans v2 #06/#21/#22) — collFiltered défini après collList */
  const [q,setQ]=useState("")
  const [filt,setFilt]=useState("all")
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
  const collFiltered=useMemo(()=>{ const qq=q.trim().toLowerCase()
    return collList.filter(b=>(filt==="all"||b.status===filt)&&(!qq||(b.name||"").toLowerCase().includes(qq)))
  },[collList,q,filt])
  /* fiabilité publique (track-record) — confiance honnête, écran v2 #24 */
  const [trackRec,setTrackRec]=useState(null)
  useEffect(()=>{ let ok=true; fetch("/api/copernicus/track-record.json").then(r=>r.json()).then(d=>{if(ok)setTrackRec(d)}).catch(()=>{}); return()=>{ok=false} },[])
  const reliab=useMemo(()=>{ try{ const r=trackRec; if(!r||!r.byRegime)return null
    const best=Object.values(r.byRegime).filter(x=>x&&x.cleanSamples>0&&x.cleanReliabilityPct).sort((a,b)=>b.cleanSamples-a.cleanSamples)[0]
    return best?{pct:Math.round(best.cleanReliabilityPct),n:best.cleanSamples}:null
  }catch(_){return null} },[trackRec])

  const dayV = beach ? vof(beach.status) : VERDICT.clean
  const vedRare = beach ? rarity(beach.score).cls : "r-com"   /* rareté de la vedette (tension du pull) */
  const tier = useMemo(()=>tierOf(collSet.size),[collSet])

  /* ---- SÉRIE 7 JOURS (#28) — septaine dérivée du streak RÉEL (sg_chasse) ----
     Flag kill-switch ?streak7=0 (défaut on). Zéro fabrication : tout vient de
     st.streak / st.best / st.last, déjà calculés et persistés par guess(). */
  const streak7Enabled = useMemo(()=>streak7On(),[])
  const sweek = useMemo(()=>streakWeek(st.streak,st.last),[st.streak,st.last])
  /* célébration « SEPTAINE BOUCLÉE » = ONE-SHOT par nouvelle septaine (persistée
     sg_chasse_seal = dernier cycle célébré), sinon elle se redéclenchait à chaque
     ouverture tant que le streak restait multiple de 7 vivant (bug revue). */
  const [weekSeal,setWeekSeal]=useState(false)
  useEffect(()=>{ if(!streak7Enabled||!sweek.justDone) return
    try{ const sealed=parseInt(localStorage.getItem("sg_chasse_seal")||"0")||0
      if(sweek.cycles>sealed){ setWeekSeal(true); localStorage.setItem("sg_chasse_seal",String(sweek.cycles)) } }catch(_){}
  },[streak7Enabled,sweek.justDone,sweek.cycles])
  /* RÉCOMPENSE : célébration comic quand on franchit un rang Veilleur (one-shot, persistée) */
  const [levelUp,setLevelUp]=useState(null)
  useEffect(()=>{ try{
    const idx=TIERS.indexOf(tier.cur)
    const prev=parseInt(localStorage.getItem("sg_chasse_rank")||"-1",10)
    if(idx>prev){ localStorage.setItem("sg_chasse_rank",String(idx)); if(prev>=0&&idx>0){ setLevelUp(tier.cur); if(track)try{track("sg_chasse_levelup",{rank:idx})}catch(_){} } }
  }catch(_){} },[tier,track])
  const dateLbl = useMemo(()=>{
    const d=new Date(), moFR=["JANV.","FÉVR.","MARS","AVR.","MAI","JUIN","JUIL.","AOÛT","SEPT.","OCT.","NOV.","DÉC."]
    return d.getDate()+" "+moFR[d.getMonth()]
  },[])

  /* ---- BADGES (BadgesSheet) — déblocages à partir de DONNÉES RÉELLES ----
     Flag kill-switch ?badges=0 (défaut on) ; ?badges=1 force l'ouverture au mount.
     Conditions évaluées sur l'état RÉEL du joueur (collection, série/record,
     déblocages jeu, email capté). Zéro fabrication, zéro serveur. */
  const badgesEnabled = useMemo(()=>badgesOnFlag(),[])
  const [badgesOpen,setBadgesOpen]=useState(false)
  /* statut RÉEL des plages collectées → pour le badge « tous les verdicts » */
  const collStatusSet = useMemo(()=>{
    const m=new Map((pickBeaches||[]).filter(b=>b&&b.id).map(b=>[b.id,b.status]))
    const s=new Set()
    collSet.forEach(id=>{ const st2=m.get(id); if(st2) s.add(st2) })
    return s
  },[pickBeaches,collSet])
  const badgeUnlocks = useMemo(()=>sgUnlockCnt(),[badgesOpen,collSet,st.streak])
  /* Set des badges déjà débloqués (hydraté du localStorage), évalué chaque render */
  const unlockedBadges = useMemo(()=>{
    if(!badgesEnabled) return new Set()
    const ctx=badgeCtx({collected:collected,collSet,statusSet:collStatusSet,
      streak:st.streak,best:st.best,unlocks:badgeUnlocks,email:capDone})
    const s=new Set()
    for(const b of CHASSE_BADGES){ try{ if(b.cond(ctx)) s.add(b.id) }catch(_){} }
    return s
  },[badgesEnabled,collected,collSet,collStatusSet,st.streak,st.best,badgeUnlocks,capDone])
  /* persistance + détection delta (nouveau badge) → track + persist (one-shot par id) */
  const badgePrevRef=useRef(null)
  useEffect(()=>{
    if(!badgesEnabled) return
    let prev=badgePrevRef.current
    if(prev===null){
      try{ prev=new Set(JSON.parse(localStorage.getItem("sg_badges_unlocked")||"[]")) }catch(_){ prev=new Set() }
      badgePrevRef.current=prev
    }
    let added=false
    unlockedBadges.forEach(id=>{ if(!prev.has(id)){ prev.add(id); added=true
      if(track)try{ track("sg_badge_unlock",{badge_id:id,count_total:unlockedBadges.size}) }catch(_){} } })
    if(added){ try{ localStorage.setItem("sg_badges_unlocked",JSON.stringify([...prev])) }catch(_){} }
  },[badgesEnabled,unlockedBadges,track])
  /* ?badges=1 → ouvre la modale au mount (vérif visuelle) */
  useEffect(()=>{ if(badgesEnabled&&badgesForceOpen()) setBadgesOpen(true) },[badgesEnabled])

  /* ---- CENTRE D'ALERTES (#19) — alertes RÉELLES dérivées du forecast ----
     Flag kill-switch ?alerts=0 (défaut on) ; ?alerts=1 ou ?alerts=preview force
     l'ouverture au mount. Zéro fabrication : tout vient de resolveForecast +
     statuts réels des plages (sauf l'échantillon explicite ?alerts=preview). */
  const alertsEnabled = useMemo(()=>alertsOnFlag(),[])
  const alertsIsPreview = useMemo(()=>alertsPreview(),[])
  const [alertsOpen,setAlertsOpen]=useState(false)
  /* plages à scruter = celles affichées (pickBeaches) ∪ collectées, dédupliquées par id */
  const alertBeaches = useMemo(()=>{
    if(!alertsEnabled) return []
    const seen=new Set(), out=[]
    const push=(b)=>{ if(b&&b.id&&!seen.has(b.id)){ seen.add(b.id); out.push(b) } }
    ;(pickBeaches||[]).forEach(push)
    if(beach) push(beach)
    return out
  },[alertsEnabled,pickBeaches,beach])
  const alerts = useMemo(()=>{
    if(!alertsEnabled) return []
    if(alertsIsPreview) return previewAlerts(alertBeaches)
    return computeAlerts(alertBeaches,sargData)
  },[alertsEnabled,alertsIsPreview,alertBeaches,sargData])
  /* ?alerts=1 / ?alerts=preview → ouvre la modale au mount (vérif visuelle) */
  useEffect(()=>{ if(alertsEnabled&&alertsForceOpen()) setAlertsOpen(true) },[alertsEnabled])
  /* impression « centre d'alertes » — one-shot au mount, état RÉEL */
  useEffect(()=>{ if(alertsEnabled&&track) try{ track("sg_alerts_shown",{count:alerts.length,preview:alertsIsPreview?1:0}) }catch(_){} },[alertsEnabled]) // eslint-disable-line

  /* impression « série 7 jours » (#28) — one-shot au mount, état RÉEL */
  useEffect(()=>{ if(streak7Enabled&&track) try{ track("sg_chasse_streak7_shown",{streak:st.streak,best:st.best,live:sweek.live?1:0,cycles:sweek.cycles}) }catch(_){} },[streak7Enabled]) // eslint-disable-line

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
        {/* CLOCHE — centre d'alertes (#19), data réelle, flag ?alerts=0 */}
        {alertsEnabled&&(
          <button type="button" className="lc-bells"
            onClick={()=>{ if(track)try{track("sg_alerts_open",{count:alerts.length})}catch(_){}; setAlertsOpen(true) }}
            aria-label={_t(ALERTS_I18N.bell)} title={_t(ALERTS_I18N.bell)}>
            <span className="lc-bell-ic" aria-hidden="true">🔔</span>
            {alerts.length>0&&<span className="lc-bell-count" aria-hidden="true">{alerts.length}</span>}
          </button>
        )}
      </div>

      {/* ---- CARTE = cœur produit (« carte sargasses ») : accès direct proéminent ---- */}
      <button type="button" className="lc-gomap" onClick={()=>{ if(track)try{track("sg_chasse_mapcta")}catch(_){}; onShowMap&&onShowMap() }}>
        <span className="lc-gomap-ic">🗺️</span>
        <span className="lc-gomap-tx">
          <b>{_t({fr:"VOIR LA CARTE SARGASSES",en:"SEE THE SARGASSUM MAP",es:"VER EL MAPA DE SARGAZO"})}</b>
          <small>{(()=>{const ok=(pickBeaches||[]).filter(b=>b&&b.status==="clean").length,tot=(pickBeaches||[]).filter(b=>b&&b.status&&b.score!=null).length;return _t({fr:ok+"/"+tot+" plages propres aujourd'hui · en direct",en:ok+"/"+tot+" clean beaches today · live",es:ok+"/"+tot+" playas limpias hoy · en directo"})})()}</small>
        </span>
        <span className="lc-gomap-go">›</span>
      </button>

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
          {/* BADGES — bouton discret ouvrant la modale (data RÉELLE, flag ?badges=0) */}
          {badgesEnabled&&(
            <button type="button" className="lc-badge-btn"
              onClick={()=>{ if(track)try{track("sg_badge_open",{count:unlockedBadges.size})}catch(_){}; setBadgesOpen(true) }}
              aria-label={_t({fr:"Voir mes badges",en:"See my badges",es:"Ver mis insignias"})}>
              <span aria-hidden="true">🏅</span> {_t({fr:"Badges",en:"Badges",es:"Insignias"})}
              <b className="lc-badge-bcnt">{unlockedBadges.size}/{CHASSE_BADGES.length}</b>
            </button>
          )}
        </div>
        <div className="lc-coll-tools">
          <input className="lc-coll-search" type="search" value={q} onChange={e=>setQ(e.target.value)}
            placeholder={_t({fr:"Chercher une plage…",en:"Search a beach…",es:"Buscar una playa…"})} aria-label={_t({fr:"Chercher une plage",en:"Search a beach",es:"Buscar una playa"})}/>
          <div className="lc-coll-chips">
            {[["all",{fr:"Toutes",en:"All",es:"Todas"}],["clean",VERDICT.clean],["moderate",VERDICT.moderate],["avoid",VERDICT.avoid]].map(([k,lbl])=>(
              <button key={k} type="button" className={"lc-chip"+(filt===k?" on s-"+(k==="all"?"all":vof(k).st):"")} onClick={()=>setFilt(k)}>{_t(lbl)}</button>
            ))}
          </div>
        </div>
        {collFiltered.length ? (
          <div className="lc-grid">
            {collFiltered.map((b,i)=>(
              <TCard key={b.id} beach={b} lang={lang} rot={(i%2?1:-1)*(0.6+(i%3)*0.4)}
                collected={collSet.has(b.id)}
                onTap={()=>{ collect(b); openDetail(b,"coll") }}/>
            ))}
          </div>
        ) : (
          <p className="lc-sub lc-center">{_t({fr:"Aucune plage ne correspond.",en:"No beach matches.",es:"Ninguna playa coincide."})}</p>
        )}
      </section>

      {/* ---- DÉFI DU JOUR : plus chaud / plus froid (mini-jeu) ---- */}
      {defiPair&&(
        <section className="lc-defi">
          <div className="lc-eyebrow lc-center">{_t({fr:"🎯 DÉFI DU JOUR",en:"🎯 DAILY CHALLENGE",es:"🎯 DESAFÍO DEL DÍA"})}</div>
          <div className="lc-defi-card">
            {(!defiRes&&!defiDone) ? (
              <>
                <div className="lc-defi-cur"><b>{defiPair[0].name}</b><span className="lc-defi-sc">{Math.round(defiPair[0].score)}</span></div>
                <p className="lc-sub lc-center">{_t({
                  fr:"« "+defiPair[1].name+" » est-elle plus propre, ou moins ?",
                  en:"Is “"+defiPair[1].name+"” cleaner, or less?",
                  es:"¿“"+defiPair[1].name+"” está más limpia, o menos?"})}</p>
                <div className="lc-guesses">
                  <button type="button" className="lc-gbtn s-ok" onClick={()=>guessDefi("up")}>⬆️ {_t({fr:"PLUS PROPRE",en:"CLEANER",es:"MÁS LIMPIA"})}</button>
                  <button type="button" className="lc-gbtn s-bad" onClick={()=>guessDefi("down")}>⬇️ {_t({fr:"MOINS",en:"LESS",es:"MENOS"})}</button>
                </div>
              </>
            ) : (
              <>
                {defiRes&&<span className={`lc-pow s-${defiRes.ok?"ok":"bad"} lc-verdictpow`}><b>{defiRes.ok?_t(I18N.win):_t(I18N.lose)}</b></span>}
                <p className="lc-sub lc-center">{defiRes
                  ? _t({fr:defiRes.name+" = "+defiRes.score+"/100. "+(defiRes.ok?"Bien vu !":"Raté !")+" Reviens demain.",
                        en:defiRes.name+" = "+defiRes.score+"/100. "+(defiRes.ok?"Nice!":"Missed!")+" Come back tomorrow.",
                        es:defiRes.name+" = "+defiRes.score+"/100. "+(defiRes.ok?"¡Bien!":"¡Fallaste!")+" Vuelve mañana."})
                  : _t({fr:"Déjà joué aujourd'hui — reviens demain.",en:"Already played today — come back tomorrow.",es:"Ya jugaste hoy — vuelve mañana."})}</p>
              </>
            )}
          </div>
        </section>
      )}

      {/* ---- SÉRIE 7 JOURS (#28) : ruban de la septaine, dérivé du streak RÉEL ---- */}
      {streak7Enabled&&(
        <section className="lc-week" aria-label={_t(STREAK7_I18N.title)}>
          <div className="lc-eyebrow lc-center">🔥 {_t(STREAK7_I18N.title)}</div>
          <div className={"lc-week-card"+(weekSeal?" sealed":"")}>
            {weekSeal&&<span className="lc-pow s-ok lc-verdictpow lc-week-pow"><b>{_t(STREAK7_I18N.sealed)}</b></span>}
            <p className="lc-sub">{sweek.s===0?_t(STREAK7_I18N.none):_t(STREAK7_I18N.sub)}</p>
            {/* ruban de 7 cases — cases pleines = jours de la série en cours (data réelle) */}
            <div className="lc-week-row" role="img"
              aria-label={_t({fr:sweek.inWeek+" jours sur 7 dans la série en cours",en:sweek.inWeek+" of 7 days in the current streak",es:sweek.inWeek+" de 7 días en la racha actual"})}>
              {Array.from({length:7}).map((_,i)=>{
                const filled=i<sweek.inWeek
                const isNext=!filled&&i===sweek.inWeek&&sweek.live   /* prochaine case à gagner si série vivante */
                return (
                  <div key={i} className={"lc-week-pip"+(filled?(sweek.live?" on":" cold"):"")+(isNext?" next":"")}>
                    <span className="lc-week-pip-d">{(STREAK7_I18N.dayShort[lang]||STREAK7_I18N.dayShort.fr)[i]}</span>
                    <span className="lc-week-pip-ic" aria-hidden="true">{filled?"🔥":(isNext?"·":"🔒")}</span>
                  </div>
                )
              })}
            </div>
            {/* ligne d'état honnête : vivante / en pause / vide + record + progression */}
            <div className="lc-week-meta">
              <span className={"lc-week-state"+(sweek.live?" live":sweek.s>0?" cold":"")}>
                {sweek.s===0?"—":sweek.live?_t(STREAK7_I18N.live):_t(STREAK7_I18N.cold)}
              </span>
              <span className="lc-week-best">{_t(STREAK7_I18N.best)} <b>{st.best}</b> 🔥</span>
            </div>
            {weekSeal ? (
              <p className="lc-sub lc-center lc-week-sealsub">{_t(STREAK7_I18N.sealedSub)}</p>
            ) : sweek.cycles>0 ? (
              <div className="lc-week-prog">{(STREAK7_I18N.cycles[lang]||STREAK7_I18N.cycles.fr)(sweek.cycles)}
                {sweek.live&&sweek.s>0&&<> · {(STREAK7_I18N.toGo[lang]||STREAK7_I18N.toGo.fr)(sweek.toGo)}</>}</div>
            ) : sweek.live&&sweek.s>0 ? (
              <div className="lc-week-prog">{(STREAK7_I18N.toGo[lang]||STREAK7_I18N.toGo.fr)(sweek.toGo)}</div>
            ) : null}
            {/* récompense au bout de 7 = alerte (porte premium habituelle, inchangée) */}
            {weekSeal&&(
              <button type="button" className="lc-cta yel lc-week-cta"
                onClick={()=>{ if(track)try{track("sg_chasse_streak7_cta",{streak:sweek.s,cycles:sweek.cycles})}catch(_){}; onPremium&&onPremium("chasse_streak7") }}>
                {_t(STREAK7_I18N.cta)}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ---- FIABILITÉ DU VEILLEUR (track-record honnête) ---- */}
      {reliab&&(
        <section className="lc-reliab">
          <div className="lc-eyebrow lc-center">{_t({fr:"FIABILITÉ DU VEILLEUR",en:"WATCHMAN RELIABILITY",es:"FIABILIDAD DEL VIGÍA"})}</div>
          <div className="lc-reliab-card">
            <div className="lc-reliab-pct">{reliab.pct}<small>%</small></div>
            <div className="lc-reliab-bar"><div className="lc-reliab-fill" style={{width:reliab.pct+"%"}}/></div>
            <p className="lc-sub lc-center">{_t({
              fr:reliab.n.toLocaleString("fr-FR")+" prévisions « mer propre » vérifiées au satellite · registre public",
              en:reliab.n.toLocaleString("en-US")+" “clean water” forecasts satellite-verified · public record",
              es:reliab.n.toLocaleString("es-ES")+" pronósticos « agua limpia » verificados · registro público"})}</p>
          </div>
        </section>
      )}

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

      {detail&&<ChasseDetail beach={detail} lang={lang} track={track} pool={collList} sargData={sargData} isPremium={isPremium} favorites={favorites} onToggleFav={onToggleFav}
        onClose={()=>setDetail(null)}
        onPremium={(src)=>{ setDetail(null); onPremium&&onPremium(src||"chasse_detail") }}
        onRelated={(b)=>{ collect(b); if(track)try{track("sg_chasse_card_open",{beach_id:b.id,which:"related"})}catch(_){}; setDetail(b) }}
        onFull={()=>{ const b=detail; setDetail(null); onOpenBeach&&onOpenBeach(b) }}/>}

      {badgesEnabled&&badgesOpen&&(
        <BadgesSheet badges={CHASSE_BADGES} unlockedSet={unlockedBadges} lang={lang}
          onClose={()=>setBadgesOpen(false)}/>
      )}

      {alertsEnabled&&alertsOpen&&(
        <AlertsModal alerts={alerts} lang={lang} track={track} preview={alertsIsPreview}
          onClose={()=>setAlertsOpen(false)}
          onOpenBeach={(b)=>{ setAlertsOpen(false); openDetail(b,"alert") }}/>
      )}

      {levelUp&&(
        <div className="lc-levelup" role="dialog" aria-label="Nouveau rang" onClick={()=>setLevelUp(null)}>
          <svg className="lc-burst s-ok" viewBox="0 0 300 300" aria-hidden="true">
            {Array.from({length:18}).map((_,i)=>{const a=(i/18)*Math.PI*2,x1=150+Math.cos(a)*70,y1=150+Math.sin(a)*70,x2=150+Math.cos(a)*150,y2=150+Math.sin(a)*150;return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={i%2?6:10}/>})}
          </svg>
          <div className="lc-lvl-card" onClick={e=>e.stopPropagation()}>
            <span className="lc-pow s-ok lc-verdictpow"><b>{_t({fr:"NIVEAU !",en:"LEVEL UP!",es:"¡NIVEL!"})}</b></span>
            <div className="lc-lvl-veil"><Veilleur mood="calm" size={88}/></div>
            <div className="lc-lvl-rank" style={{background:levelUp.iris}}>{_t(levelUp)}</div>
            <p className="lc-sub lc-center">{_t({fr:"Nouveau rang de Veilleur débloqué. Continue à collectionner.",en:"New Veilleur rank unlocked. Keep collecting.",es:"Nuevo rango de Vigía desbloqueado. Sigue coleccionando."})}</p>
            <button type="button" className="lc-cta yel" onClick={()=>setLevelUp(null)}>{_t({fr:"CONTINUER",en:"CONTINUE",es:"SEGUIR"})}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ====================================================================
   CSS — entièrement scopé `.lc-`. Tokens & cartes portés de
   public/comic-cartes.html + public/themes-lab/arena.css.
   ==================================================================== */
export const CSS=`
@font-face{font-family:"AntonLC";src:url("/fonts/anton-1Ptgg87LROyAm3Kz-C8.woff2") format("woff2");font-weight:400;font-display:swap}
.lc-root{--ink:#0d0b14;--paper:#fdf6e3;--red:#e8322a;--yel:#ffd23f;--blu:#1c7fb0;--org:#ff8a3d;--grn:#27c46b;--pur:#7b46d6;
  font-family:"Comic Neue","Comic Sans MS",system-ui,sans-serif;color:var(--ink);
  background:
    radial-gradient(rgba(13,11,20,.14) 1.4px,transparent 1.5px) 0 0/9px 9px,
    radial-gradient(rgba(13,11,20,.14) 1.4px,transparent 1.5px) 4.5px 4.5px/9px 9px,
    radial-gradient(rgba(214,0,92,.06) 1.3px,transparent 1.4px) 2px 1px/7px 7px,
    linear-gradient(170deg,#2e1a5e,#6a2f9e 30%,#ffb36b 66%,#ff8a3d);
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
.lc-gomap{display:flex;align-items:center;gap:11px;width:100%;margin:12px 0 2px;cursor:pointer;text-align:left;
  background:linear-gradient(135deg,#2e1a5e,#156a96);border:3px solid var(--ink);border-radius:15px;padding:11px 13px;
  box-shadow:0 5px 0 var(--ink),0 11px 20px rgba(13,11,20,.3);font-family:inherit;forced-color-adjust:none}
.lc-gomap:active{transform:translateY(2px);box-shadow:0 3px 0 var(--ink)}
.lc-gomap-ic{flex:0 0 auto;font-size:26px;filter:drop-shadow(1px 2px 0 rgba(13,11,20,.5))}
.lc-gomap-tx{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.1}
.lc-gomap-tx b{font-family:"AntonLC",system-ui,sans-serif;font-size:16px;color:#fff;text-shadow:2px 2px 0 var(--ink);letter-spacing:.3px}
.lc-gomap-tx small{font-weight:800;font-size:11.5px;color:#eaf7ff;margin-top:2px}
.lc-gomap-go{flex:0 0 auto;font-family:"AntonLC",system-ui,sans-serif;font-size:26px;color:var(--ink);background:var(--yel);border:2.5px solid var(--ink);border-radius:9px;width:34px;height:34px;display:grid;place-items:center;box-shadow:2px 2px 0 var(--ink)}
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
/* outils Pokédex : recherche + filtres */
.lc-coll-tools{margin:0 0 13px}
.lc-coll-search{width:100%;font-family:"Comic Neue",system-ui,sans-serif;font-size:15px;font-weight:700;color:var(--ink);
  background:#fff;border:2.5px solid var(--ink);border-radius:11px;padding:10px 13px;box-shadow:2px 2px 0 var(--ink);forced-color-adjust:none}
.lc-coll-search::placeholder{color:#9a93a8}
.lc-coll-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
.lc-chip{font-family:"AntonLC",system-ui,sans-serif;font-size:11px;letter-spacing:.4px;color:var(--ink);
  background:var(--paper);border:2.5px solid var(--ink);border-radius:20px;padding:5px 12px;box-shadow:2px 2px 0 var(--ink);cursor:pointer;forced-color-adjust:none}
.lc-chip.on{color:#fff}
.lc-chip.on.s-all{background:var(--ink)}
.lc-chip.on.s-ok{background:var(--grn)}.lc-chip.on.s-mod{background:var(--org)}.lc-chip.on.s-bad{background:var(--red)}
.lc-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
/* PERF : les cartes hors écran ne sont ni peintes ni animées (foil) */
.lc-grid .lc-card{content-visibility:auto;contain-intrinsic-size:auto 240px}

/* ---- DÉTAIL PLAGE « monde comic » (plein écran, même univers) ---- */
.lc-detail{position:fixed;inset:0;z-index:1200;overflow-y:auto;-webkit-overflow-scrolling:touch;
  font-family:"Comic Neue","Comic Sans MS",system-ui,sans-serif;color:var(--ink);
  background:
    radial-gradient(rgba(13,11,20,.12) 1.4px,transparent 1.5px) 0 0/9px 9px,
    linear-gradient(170deg,#2e1a5e,#6a2f9e 28%,#ffb36b 70%,#ff8a3d);
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
  -webkit-appearance:none;appearance:none;
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
.lc-detail-full{display:block;width:100%;margin-top:12px;-webkit-appearance:none;appearance:none;background:none;border:none;color:#0d2330;font-weight:800;font-size:13px;
  text-decoration:underline;cursor:pointer;font-family:inherit}
.lc-detail-actions{display:flex;gap:14px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.lc-detail-actions .lc-detail-full{width:auto;margin-top:0}
.lc-detail-fav.on{color:#E8522A}
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
/* aperçu prévision réelle (item 09) — teinte du statut (la « forme », estompée) + cadenas + confiance.
   Frontière calquée sur ForecastChart : on laisse SENTIR la couleur du verdict, sans révéler le détail. */
.lc-fc-cap{font:700 10px/1.3 "Comic Neue",system-ui,sans-serif;color:var(--ink);opacity:.7;margin:-3px 0 7px}
.lc-fc-cell.teaser{background:#fff}
.lc-fc-cell.teaser.s-ok{background:#dff6e8}
.lc-fc-cell.teaser.s-mod{background:#ffeccd}
.lc-fc-cell.teaser.s-bad{background:#f9d9d6}
.lc-fc-cell.teaser.far{opacity:.62}
.lc-fc-cell.teaser .lc-fc-dot{font-size:11px;opacity:.78}
.lc-fc-conf{font:800 8px/1 "Comic Neue",system-ui,sans-serif;opacity:.72}
.lc-fc-line{font:800 11px/1.3 "Comic Neue",system-ui,sans-serif;color:var(--ink);margin-top:9px;text-align:center;
  background:#fff;border:2.5px solid var(--ink);border-radius:9px;padding:8px 9px;box-shadow:2px 2px 0 var(--ink)}
.lc-fc-line.ok{background:#dff6e8}
.lc-fc-line.warn{background:#ffe6c7}
.lc-fc-line.hope{background:#d8eef0}
/* repère santé H₂S (case BD — plages à éviter / à surveiller) */
.lc-h2s{margin:2px 0 18px;border:3px solid var(--ink);border-radius:13px;padding:11px 13px 12px;box-shadow:0 4px 0 var(--ink);forced-color-adjust:none}
.lc-h2s.bad{background:#fff0ed}
.lc-h2s.mod{background:#fff7e6}
.lc-h2s-h{display:flex;align-items:center;gap:8px;font-family:"AntonLC",system-ui,sans-serif;font-size:15px;letter-spacing:.4px;color:var(--ink);line-height:1}
.lc-h2s.bad .lc-h2s-h{color:var(--red)}
.lc-h2s-ic{font-size:17px;line-height:1}
.lc-h2s-txt{font-size:12.5px;font-weight:700;line-height:1.45;color:#2a1f1f;margin:8px 0 0}
.lc-h2s-sens{display:flex;gap:8px;align-items:flex-start;margin-top:9px;font-size:12px;font-weight:800;color:var(--ink);
  background:#fff;border:2.5px solid var(--ink);border-radius:10px;padding:8px 10px;box-shadow:2px 2px 0 var(--ink);line-height:1.4}
.lc-h2s-sens b{font-size:15px;line-height:1;flex:0 0 auto}
.lc-h2s-src{font-size:9.5px;font-weight:700;color:#8a7f7f;margin-top:9px;letter-spacing:.2px}
/* plages voisines (hub d'exploration in-world) */
.lc-detail-rel{margin-top:20px}
.lc-detail-rel-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}
.lc-detail-rel-card{position:relative}
.lc-detail-rel-card .lc-card{width:100%}
.lc-detail-planb .lc-detail-fc-h::before{content:"";display:inline-block;width:8px;height:8px;border-radius:4px;background:#E8522A;margin-right:7px;vertical-align:middle;box-shadow:0 0 0 2px var(--ink)}
.lc-planb-sub{font-size:11.5px;font-weight:700;line-height:1.25;color:var(--ink);opacity:.82;margin:4px 0 2px}
.lc-planb-best .lc-card{outline:2.5px solid #FFC72C;outline-offset:1px}
.lc-planb-tag{position:absolute;top:-8px;left:50%;transform:translateX(-50%);z-index:3;font-size:8.5px;font-weight:800;letter-spacing:.04em;color:#1A2B26;background:#FFC72C;border:2px solid var(--ink);border-radius:6px;padding:2px 6px;white-space:nowrap}
.lc-planb-dist{display:block;text-align:center;font-size:10px;font-weight:800;color:var(--ink);opacity:.66;margin-top:4px}
/* DÉFI DU JOUR (mini-jeu plus chaud/plus froid) */
.lc-defi{max-width:520px;margin:22px auto 0;text-align:center}
.lc-defi-card{margin-top:10px;background:var(--paper);border:3px solid var(--ink);border-radius:16px;padding:16px 15px;box-shadow:0 5px 0 var(--ink),0 12px 22px rgba(13,11,20,.32);position:relative}
.lc-defi-cur{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
.lc-defi-cur b{font-family:"AntonLC",system-ui,sans-serif;font-size:18px;letter-spacing:.3px;text-transform:uppercase}
.lc-defi-sc{font-family:"AntonLC",system-ui,sans-serif;font-size:26px;color:#fff;background:var(--grn);border:2.5px solid var(--ink);border-radius:9px;padding:2px 11px;box-shadow:2px 2px 0 var(--ink);text-shadow:1.5px 1.5px 0 var(--ink)}
.lc-defi-card .lc-sub{margin:9px 0 12px;color:#2a2536;font-weight:700}
/* SÉRIE 7 JOURS (#28) — ruban de la septaine (case BD, data réelle) */
.lc-week{max-width:520px;margin:22px auto 0;text-align:center}
.lc-week-card{position:relative;margin-top:10px;background:var(--paper);border:3px solid var(--ink);border-radius:16px;
  padding:16px 15px 15px;box-shadow:0 5px 0 var(--ink),0 12px 22px rgba(13,11,20,.32)}
.lc-week-card.sealed{background:linear-gradient(160deg,#fff7df,#ffe9b0 60%,#fff7df);box-shadow:0 0 0 2px #e0962a inset,0 5px 0 var(--ink),0 12px 24px rgba(246,183,60,.5)}
.lc-week-card .lc-sub{margin:8px 0 12px;color:#2a2536;font-weight:700;font-size:12.5px}
.lc-week-pow{position:absolute;top:-13px;left:50%;transform:translateX(-50%) rotate(-4deg) scale(1.05);right:auto}
.lc-week-row{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin:2px 0 13px}
.lc-week-pip{border:2.5px solid var(--ink);border-radius:9px;padding:7px 2px 6px;background:#fff;box-shadow:2px 2px 0 var(--ink);
  display:flex;flex-direction:column;align-items:center;gap:3px;forced-color-adjust:none}
.lc-week-pip.on{background:linear-gradient(180deg,#ffd569,var(--org))}
.lc-week-pip.on .lc-week-pip-d{color:var(--ink)}
.lc-week-pip.cold{background:#efe7d6}
.lc-week-pip.cold .lc-week-pip-ic{filter:grayscale(1);opacity:.7}
.lc-week-pip.next{background:repeating-linear-gradient(45deg,#fff6d8 0 6px,#fff 6px 12px);border-style:dashed}
.lc-week-pip-d{font:800 9px/1 "Comic Neue",system-ui,sans-serif;text-transform:uppercase;opacity:.85}
.lc-week-pip-ic{font-family:"AntonLC",system-ui,sans-serif;font-size:15px;line-height:1}
.lc-week-pip:not(.on):not(.cold):not(.next) .lc-week-pip-ic{font-size:12px;filter:grayscale(1);opacity:.65}
.lc-week-meta{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin-bottom:2px}
.lc-week-state{font:800 11px/1.2 "Comic Neue",system-ui,sans-serif;color:var(--ink);background:#fff;border:2.5px solid var(--ink);
  border-radius:20px;padding:4px 11px;box-shadow:2px 2px 0 var(--ink);forced-color-adjust:none}
.lc-week-state.live{background:linear-gradient(180deg,#ffe06a,var(--yel))}
.lc-week-state.cold{background:#efe7d6;color:#5a5360}
.lc-week-best{font:800 11px/1 "Comic Neue",system-ui,sans-serif;color:var(--ink)}
.lc-week-best b{font-family:"AntonLC",system-ui,sans-serif;font-size:15px}
.lc-week-prog{font:800 11px/1.35 "Comic Neue",system-ui,sans-serif;color:var(--ink);opacity:.82;margin-top:9px}
.lc-week-sealsub{margin:9px 0 0!important;font-size:12px!important}
.lc-week-cta{margin-top:13px}
.lc-root .lc-week-card .lc-week-state{background:#fff!important;border:2.5px solid var(--ink)!important;border-radius:20px!important;box-shadow:2px 2px 0 var(--ink)!important}
.lc-root .lc-week-state.live{background:linear-gradient(180deg,#ffe06a,var(--yel))!important}
.lc-root .lc-week-state.cold{background:#efe7d6!important}

/* fiabilité du Veilleur (jauge track-record) */
.lc-reliab{max-width:520px;margin:22px auto 0;text-align:center}
.lc-reliab-card{margin-top:10px;background:var(--paper);border:3px solid var(--ink);border-radius:16px;padding:16px 16px 14px;box-shadow:0 5px 0 var(--ink),0 12px 22px rgba(13,11,20,.32)}
.lc-reliab-pct{font-family:"AntonLC",system-ui,sans-serif;font-size:46px;line-height:.9;color:var(--grn);text-shadow:2px 2px 0 var(--ink)}
.lc-reliab-pct small{font-size:22px}
.lc-reliab-bar{height:14px;margin:10px 0;border:2.5px solid var(--ink);border-radius:10px;background:#fff;overflow:hidden;box-shadow:2px 2px 0 var(--ink);forced-color-adjust:none}
.lc-reliab-fill{height:100%;background:linear-gradient(90deg,#3fd98a,var(--grn));border-right:2px solid var(--ink)}
.lc-reliab-card .lc-sub{margin:6px 0 0;color:#2a2536;font-weight:700;font-size:12.5px}
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
/* RÉCOMPENSE niveau (célébration comic) */
.lc-levelup{position:fixed;inset:0;z-index:1250;display:flex;align-items:center;justify-content:center;padding:24px;
  background:radial-gradient(rgba(13,11,20,.12) 1.4px,transparent 1.5px) 0 0/9px 9px,rgba(13,11,20,.62);
  animation:lc-detail-in .3s cubic-bezier(.2,1.2,.3,1) both}
.lc-levelup .lc-burst{position:absolute;width:min(112vw,460px);height:min(112vw,460px);opacity:.9}
.lc-lvl-card{position:relative;z-index:1;max-width:330px;width:100%;text-align:center;background:var(--paper);
  border:3px solid var(--ink);border-radius:18px;padding:30px 22px 22px;box-shadow:0 7px 0 var(--ink),0 16px 30px rgba(13,11,20,.5)}
.lc-lvl-veil{display:flex;justify-content:center;filter:drop-shadow(2px 4px 0 rgba(13,11,20,.4))}
.lc-lvl-rank{display:inline-block;margin:12px 0 4px;font-family:"AntonLC",system-ui,sans-serif;font-size:24px;color:#fff;
  text-shadow:2px 2px 0 var(--ink);border:3px solid var(--ink);border-radius:11px;padding:6px 16px;box-shadow:3px 3px 0 var(--ink);transform:rotate(-1.5deg)}
.lc-lvl-card .lc-sub{margin:8px 0 16px;color:#2a2536;font-weight:700}
.lc-reduce .lc-levelup{animation:none}

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
.lc-bn.s-ok{background:linear-gradient(90deg,#3e2470,#0f7d72)}
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
.lc-root .lc-gomap{background:linear-gradient(135deg,#2e1a5e,#156a96)!important;border:3px solid var(--ink)!important;border-radius:15px!important;box-shadow:0 5px 0 var(--ink),0 11px 20px rgba(13,11,20,.3)!important}
.lc-root .lc-maplink{background:none!important;border:none!important;box-shadow:none!important;
  font-family:inherit!important;border-radius:0!important}

/* ====================================================================
   BADGES (BadgesSheet) — bouton dans le header Pokédex + modale comic.
   z-index 1150 < détail 1200 < levelup 1250. Rareté = couleurs TCG.
   ==================================================================== */
.lc-badge-btn{display:inline-flex;align-items:center;gap:6px;margin-top:10px;cursor:pointer;
  font-family:"AntonLC",system-ui,sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--ink);
  background:var(--paper);border:2.5px solid var(--ink);border-radius:20px;padding:5px 12px;box-shadow:2px 2px 0 var(--ink);
  forced-color-adjust:none;transition:transform .08s}
.lc-badge-btn:active{transform:translateY(2px);box-shadow:0 0 0 var(--ink)}
.lc-badge-bcnt{font-family:"AntonLC",system-ui,sans-serif;font-size:11px;color:#fff;background:var(--ink);
  border-radius:12px;padding:2px 8px;margin-left:2px}
.lc-root .lc-badge-btn{background:var(--paper)!important;border:2.5px solid var(--ink)!important;border-radius:20px!important;box-shadow:2px 2px 0 var(--ink)!important}
.lc-badgesheet{position:fixed;inset:0;z-index:1150;display:flex;align-items:center;justify-content:center;padding:20px;
  background:radial-gradient(rgba(13,11,20,.12) 1.4px,transparent 1.5px) 0 0/9px 9px,rgba(13,11,20,.62);
  animation:lc-detail-in .26s cubic-bezier(.2,1.2,.3,1) both}
.lc-reduce .lc-badgesheet{animation:none}
.lc-badge-modal{position:relative;width:100%;max-width:420px;max-height:86vh;overflow-y:auto;-webkit-overflow-scrolling:touch;
  text-align:center;background:var(--paper);border:3px solid var(--ink);border-radius:18px;
  padding:24px 18px 22px;box-shadow:0 7px 0 var(--ink),0 16px 30px rgba(13,11,20,.5);forced-color-adjust:none}
.lc-badge-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border-radius:50%;-webkit-appearance:none;appearance:none;
  border:2.5px solid var(--ink);background:var(--yel);color:var(--ink);font-size:16px;font-weight:800;cursor:pointer;box-shadow:2px 2px 0 var(--ink)}
.lc-badge-title{display:inline-flex;align-items:center;gap:8px;font-family:"AntonLC",system-ui,sans-serif;font-size:16px;
  letter-spacing:.5px;color:var(--ink);text-shadow:1.5px 1.5px 0 #fff}
.lc-badge-cnt{font-family:"AntonLC",system-ui,sans-serif;font-size:13px;color:#fff;background:var(--ink);
  display:inline-block;border-radius:14px;padding:2px 12px;margin:8px 0 4px;letter-spacing:.5px}
.lc-badge-toh{font-family:"AntonLC",system-ui,sans-serif;font-size:12px;letter-spacing:.6px;color:var(--ink);
  opacity:.72;margin:18px 0 9px;text-align:left}
.lc-badge-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.lc-badge-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;
  background:var(--paper);border:3px solid var(--ink);border-radius:14px;padding:12px 8px 9px;box-shadow:0 5px 0 var(--ink)}
.lc-badge-card.b-rare{background:#dff1ff;box-shadow:0 0 0 2px var(--blu) inset,0 5px 0 var(--ink)}
.lc-badge-card.b-epic{background:#efe2ff;box-shadow:0 0 0 2px var(--pur) inset,0 5px 0 var(--ink)}
.lc-badge-card.b-leg{background:linear-gradient(135deg,#ffe79a,#fff3c4 52%,#ffe79a);
  box-shadow:0 0 0 2px #e0962a inset,0 5px 0 var(--ink),0 8px 18px rgba(246,183,60,.6)}
.lc-badge-card.lc-badge-locked{background:repeating-linear-gradient(45deg,#eceaf0 0 7px,#f6f4f8 7px 14px);opacity:.55}
.lc-badge-ic{font-size:38px;line-height:1;filter:drop-shadow(1.5px 2px 0 rgba(13,11,20,.35))}
.lc-badge-card.lc-badge-locked .lc-badge-ic{filter:grayscale(1);opacity:.7}
.lc-badge-nm{font-family:"AntonLC",system-ui,sans-serif;font-size:12px;line-height:1.05;color:var(--ink);
  letter-spacing:.2px;text-transform:uppercase}
.lc-badge-rar{font:800 8.5px/1 "Comic Neue",system-ui,sans-serif;letter-spacing:.4px;color:#fff;background:var(--ink);
  border-radius:10px;padding:2px 7px}
.lc-badge-card.b-rare .lc-badge-rar{background:var(--blu)}
.lc-badge-card.b-epic .lc-badge-rar{background:var(--pur)}
.lc-badge-card.b-leg .lc-badge-rar{background:#c47a12;color:#fff8e0}
.lc-badge-card.lc-badge-locked .lc-badge-rar{background:transparent;color:var(--ink)}
.lc-badge-pop{animation:lc-badge-pop .4s cubic-bezier(.2,1.2,.3,1) both;animation-delay:var(--delay,0s)}
@keyframes lc-badge-pop{0%{transform:scale(0)}70%{transform:scale(1.12)}100%{transform:scale(1)}}
.lc-reduce .lc-badge-pop{animation:none;opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){
  .lc-badgesheet{animation:none}
  .lc-badge-pop{animation:none;opacity:1;transform:none}
}
@media(min-width:560px){.lc-badge-grid{grid-template-columns:1fr 1fr 1fr}}

/* ====================================================================
   CENTRE D'ALERTES « MES ALERTES » (#19) — cloche header + modale comic.
   z-index 1140 < badges 1150 < détail 1200 < levelup 1250.
   --paper / --ink / ombres dures ; Anton titre, Comic Neue corps.
   ==================================================================== */
.lc-bells{position:relative;flex:0 0 auto;width:38px;height:38px;cursor:pointer;-webkit-appearance:none;appearance:none;
  background:var(--paper);border:2.5px solid var(--ink);border-radius:50%;box-shadow:2px 2px 0 var(--ink);
  display:grid;place-items:center;forced-color-adjust:none;transition:transform .08s}
.lc-bells:active{transform:translateY(2px);box-shadow:0 0 0 var(--ink)}
.lc-bell-ic{font-size:18px;line-height:1}
.lc-bell-count{position:absolute;top:-7px;right:-7px;min-width:19px;height:19px;padding:0 4px;
  font-family:"AntonLC",system-ui,sans-serif;font-size:11px;line-height:19px;color:#fff;text-align:center;
  background:var(--red);border:2px solid var(--ink);border-radius:11px;box-shadow:1.5px 1.5px 0 var(--ink)}
.lc-root .lc-bells{background:var(--paper)!important;border:2.5px solid var(--ink)!important;border-radius:50%!important;box-shadow:2px 2px 0 var(--ink)!important}
/* overlay */
.lc-alerts{position:fixed;inset:0;z-index:1140;display:flex;align-items:flex-start;justify-content:center;
  padding:max(20px,env(safe-area-inset-top)) 16px 24px;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:radial-gradient(rgba(13,11,20,.12) 1.4px,transparent 1.5px) 0 0/9px 9px,rgba(13,11,20,.62);
  animation:lc-detail-in .26s cubic-bezier(.2,1.2,.3,1) both}
.lc-reduce .lc-alerts{animation:none}
.lc-alerts-modal{position:relative;width:100%;max-width:440px;margin:auto 0;
  background:var(--paper);border:3px solid var(--ink);border-radius:18px;
  padding:24px 18px 22px;box-shadow:0 7px 0 var(--ink),0 16px 30px rgba(13,11,20,.5);forced-color-adjust:none}
.lc-alerts-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border-radius:50%;-webkit-appearance:none;appearance:none;
  border:2.5px solid var(--ink);background:var(--yel);color:var(--ink);font-size:16px;font-weight:800;cursor:pointer;box-shadow:2px 2px 0 var(--ink)}
.lc-alerts-title{display:inline-flex;align-items:center;gap:8px;font-family:"AntonLC",system-ui,sans-serif;font-size:18px;
  letter-spacing:.5px;color:var(--ink);text-shadow:1.5px 1.5px 0 #fff}
.lc-alerts-pv{display:inline-block;margin:8px 0 0;font:800 9px/1 "Comic Neue",system-ui,sans-serif;letter-spacing:.5px;
  text-transform:uppercase;color:#fff;background:var(--pur);border:2px solid var(--ink);border-radius:10px;padding:3px 9px;box-shadow:1.5px 1.5px 0 var(--ink)}
.lc-alerts-sub{font-size:12px;line-height:1.35;color:#2a2536;font-weight:700;margin:9px 0 14px}
.lc-alerts-list{display:flex;flex-direction:column;gap:11px}
.lc-alert-card{position:relative;display:flex;gap:11px;align-items:flex-start;text-align:left;
  background:#fff;border:2.5px solid var(--ink);border-left-width:6px;border-radius:13px;padding:11px 13px 12px;
  box-shadow:0 4px 0 var(--ink);content-visibility:auto;contain-intrinsic-size:auto 92px}
.lc-alert-card.s-ok{border-left-color:var(--grn)}
.lc-alert-card.s-mod{border-left-color:var(--org)}
.lc-alert-card.s-bad{border-left-color:var(--red)}
.lc-alert-pill{flex:0 0 auto;width:34px;height:34px;border-radius:9px;border:2.5px solid var(--ink);
  display:grid;place-items:center;font-size:17px;line-height:1;box-shadow:2px 2px 0 var(--ink)}
.lc-alert-pill.s-ok{background:#dff6e8}.lc-alert-pill.s-mod{background:#ffeccd}.lc-alert-pill.s-bad{background:#f9d9d6}
.lc-alert-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.lc-alert-when{font:800 9.5px/1 "Comic Neue",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.4px;color:#7a7488}
.lc-alert-name{font-family:"AntonLC",system-ui,sans-serif;font-size:15px;line-height:1.05;color:var(--ink);letter-spacing:.2px;text-transform:uppercase}
.lc-alert-msg{font-size:12.5px;font-weight:800;color:var(--ink);line-height:1.3;display:flex;flex-wrap:wrap;align-items:center;gap:5px}
.lc-alert-arrow{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}
.lc-alert-arrow i{font-style:normal;font-family:"AntonLC",system-ui,sans-serif;font-size:10px;color:#fff;text-shadow:1px 1px 0 var(--ink);
  border:2px solid var(--ink);border-radius:6px;padding:1.5px 7px;letter-spacing:.3px}
.lc-alert-arrow i.s-ok{background:var(--grn)}.lc-alert-arrow i.s-mod{background:var(--org);color:var(--ink);text-shadow:1px 1px 0 #fff}.lc-alert-arrow i.s-bad{background:var(--red)}
.lc-alert-arrow em{font-style:normal;font-family:"AntonLC",system-ui,sans-serif;font-size:13px;color:var(--ink)}
.lc-alert-detail{font-size:11.5px;font-weight:700;line-height:1.35;color:#5a5360;margin-top:2px}
.lc-alert-open{align-self:flex-start;margin-top:7px;-webkit-appearance:none;appearance:none;cursor:pointer;
  font-family:"AntonLC",system-ui,sans-serif;font-size:10px;letter-spacing:.4px;text-transform:uppercase;color:var(--ink);
  background:var(--yel);border:2.5px solid var(--ink);border-radius:9px;padding:5px 11px;box-shadow:2px 2px 0 var(--ink);transition:transform .08s}
.lc-alert-open:active{transform:translateY(2px);box-shadow:0 0 0 var(--ink)}
.lc-root .lc-alert-card{background:#fff!important;border:2.5px solid var(--ink)!important;border-left-width:6px!important;border-radius:13px!important;box-shadow:0 4px 0 var(--ink)!important}
.lc-root .lc-alert-card.s-ok{border-left-color:var(--grn)!important}
.lc-root .lc-alert-card.s-mod{border-left-color:var(--org)!important}
.lc-root .lc-alert-card.s-bad{border-left-color:var(--red)!important}
.lc-root .lc-alert-open{background:var(--yel)!important;border:2.5px solid var(--ink)!important;border-radius:9px!important;box-shadow:2px 2px 0 var(--ink)!important}
.lc-root .lc-alert-pill{border-radius:9px!important;box-shadow:2px 2px 0 var(--ink)!important}
/* état vide honnête */
.lc-alert-empty{text-align:center;padding:14px 6px 6px}
.lc-alert-empty-veil{display:flex;justify-content:center;filter:drop-shadow(2px 4px 0 rgba(13,11,20,.4))}
.lc-alert-empty-h{font-family:"AntonLC",system-ui,sans-serif;font-size:17px;line-height:1.1;color:var(--ink);
  text-shadow:1.5px 1.5px 0 #fff;margin:12px 0 0}
.lc-alert-empty .lc-sub{margin:9px auto 0;font-style:italic;color:#2a2536;font-weight:700}
@media(prefers-reduced-motion:reduce){.lc-alerts{animation:none}}
`
