/**
 * SARGASSES — Reboot from scratch (4 avril 2026)
 * "Cette fois, tu seras prévenu."
 *
 * Architecture : Map-first, data-driven (Clarity — 25% clics = carte)
 * Stack : React 18 · Leaflet · Bricolage Grotesque + Anton · Open-Meteo
 */
import React,{useState,useEffect,useRef,useMemo,useCallback,createContext,useContext,Component,Suspense,lazy}from"react"

const LazyMapView=lazy(()=>import("./src/MapView"))

class ErrBound extends Component{
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return{err:e}}
  componentDidCatch(e){console.error("CAUGHT:",e.message,e.stack)}
  render(){if(this.state.err)return React.createElement("pre",{style:{color:"red",padding:20,whiteSpace:"pre-wrap"}},this.state.err.message+"\n\n"+this.state.err.stack);return this.props.children}
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXT
   ═══════════════════════════════════════════════════════════════════════════ */
const LangCtx=createContext("fr")
export function useLang(){return useContext(LangCtx)||"fr"}
function getLang(){try{return typeof window!=="undefined"&&window.location.pathname.startsWith("/en")?"en":"fr"}catch{return"fr"}}

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */
const C={
  bg:"#FDFCF7",bgD:"#F7F5EF",card:"#FFFFFF",cardS:"#FAFAFA",
  ink:"#0D0D0D",mid:"#686868",mute:"#686868",
  border:"rgba(0,0,0,.04)",borderM:"rgba(0,0,0,.08)",
  gold:"#E8A800",goldL:"#FFC72C",goldLL:"#FFE47A",
  goldBg:"rgba(232,168,0,.07)",goldBgL:"rgba(255,199,44,.15)",
  teal:"#009E8E",tealL:"#1EC8B0",tealBg:"rgba(0,158,142,.08)",
  green:"#22C55E",greenL:"#16A34A",greenBg:"rgba(34,197,94,.1)",
  amber:"#B87A00",amberBg:"rgba(184,122,0,.1)",
  red:"#E8522A",redBg:"rgba(232,82,42,.1)",
  sarg:"#8B6914",sargL:"#A67C1A",sargBg:"rgba(139,105,20,.12)",
  night:"#0D1E1C",night2:"#0A1714",ocean:"#014F86",
}

const ST={
  _loading:{c:"#666",bg:"rgba(100,100,100,.1)",l:"Chargement…",le:"Loading…",e:"⏳",h2s:false,
    desc:"Données en cours de chargement…",descEn:"Loading data…"},
  clean:{c:C.green,bg:C.greenBg,l:"Propre",le:"Clean",e:"✅",h2s:false,
    desc:"Peu ou pas de sargasses détectées par satellite au large.",
    descEn:"Little to no sargassum detected by satellite offshore."},
  moderate:{c:C.amber,bg:C.amberBg,l:"Modéré",le:"Moderate",e:"⚠️",h2s:false,
    desc:"Présence modérée de sargasses détectée au large. Vérifiez sur place avant de vous baigner.",
    descEn:"Moderate sargassum detected offshore. Check conditions on site before swimming."},
  avoid:{c:C.red,bg:C.redBg,l:"Alerte",le:"Alert",e:"🚫",h2s:true,
    desc:"Forte concentration de sargasses détectée au large. Échouages probables — vérifiez l'état de la plage sur place.",
    descEn:"High sargassum concentration detected offshore. Beaching likely — check beach conditions on site."},
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEASON DETECTION
   ═══════════════════════════════════════════════════════════════════════════ */
const SARGASSES_SEASON=(()=>{
  const m=new Date().getMonth() // 0-indexed
  if(m>=3&&m<=8)return"high"     // April-September
  if(m===2||m===9)return"shoulder" // March, October
  return"off"                      // November-February
})()

/* ═══════════════════════════════════════════════════════════════════════════
   I18N
   ═══════════════════════════════════════════════════════════════════════════ */
const T={
  fr:{
    days:["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],today:"Auj.",tomorrow:"Dem.",
    clean:"Propre",moderate:"Modéré",avoid:"Alerte",
    search:"Rechercher une plage…",
    filters:["Toutes","Propres","Favoris","Alertes"],
    filtersIcon:["🌊","✅","❤️","🚫"],
    navMap:"Carte",navList:"Plages",navGame:"Jeu",navPremium:"Premium",
    forecast:"Prévisions",weather:"Météo",directions:"Y aller",
    fav:"Favori",addFav:"Ajouter aux favoris",removeFav:"Retirer des favoris",
    wind:"Vent",uv:"UV",temp:"Température",drive:"min",
    kids:"Enfants",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"Ton veilleur sargasses : brief matin, alertes plages favorites, reco du jour.",
    premiumPrice:"4,99 €/mois",premiumCta:"Commencer — 0€ aujourd'hui",
    premiumFeatures:["Essai 7 jours — 0€, annule en 1 clic","Brief matin : ta meilleure plage, chaque jour","Alertes push avant que les sargasses arrivent","Sans pub · Sans engagement · Satisfait ou remboursé"],
    h2sWarn:"Si des sargasses sont échouées et en décomposition sur place, éloignez-vous (risque H₂S). Source : HCSP/ARS.",
    copernicus:"Copernicus Marine",live:"LIVE",
    nClean:"{n} propres",island_mq:"Martinique",island_gp:"Guadeloupe",
    reportThanks:"Merci pour ton signalement !",report:"Signaler",
    openWaze:"Ouvrir Waze",driftDown:"Dispersion attendue",driftUp:"Arrivée possible",driftStable:"Stable",
    close:"Fermer",nearby:"Plages à proximité",locked:"Premium",
    beachScore:"Score plage",waves:"Vagues",swell:"Houle",rain:"Pluie",
    scoreExcellent:"Excellent",scoreGood:"Bon",scoreMedium:"Moyen",scoreBad:"Conditions difficiles",
    marine:"Conditions marines",
    history:"Tendance récente",historyEmpty:"Pas encore d'historique",
    historyDays:"{n}j",
  },
  en:{
    days:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],today:"Today",tomorrow:"Tmrw",
    clean:"Clean",moderate:"Moderate",avoid:"Alert",
    search:"Search a beach…",
    filters:["All","Clean","Favourites","Alerts"],
    filtersIcon:["🌊","✅","❤️","🚫"],
    navMap:"Map",navList:"Beaches",navGame:"Game",navPremium:"Premium",
    forecast:"Forecast",weather:"Weather",directions:"Directions",
    fav:"Favourite",addFav:"Add to favourites",removeFav:"Remove from favourites",
    wind:"Wind",uv:"UV",temp:"Temperature",drive:"min",
    kids:"Kids",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"Your sargassum watchman: morning brief, favourite-beach alerts, daily pick.",
    premiumPrice:"€4.99/mo",premiumCta:"Start free — 0€ today",
    premiumFeatures:["7-day free trial — cancel in 1 click","Morning brief: your best beach, every day","Push alerts before sargassum hits your favourites","No ads · No commitment · 30-day guarantee"],
    h2sWarn:"If sargassum is beached and decomposing on site, move away (H₂S risk). Source: HCSP/ARS.",
    copernicus:"Copernicus Marine",live:"LIVE",
    nClean:"{n} clean",island_mq:"Martinique",island_gp:"Guadeloupe",
    reportThanks:"Thanks for your report!",report:"Report",
    openWaze:"Open Waze",driftDown:"Dispersing",driftUp:"Incoming",driftStable:"Stable",
    close:"Close",nearby:"Nearby beaches",locked:"Premium",
    beachScore:"Beach Score",waves:"Waves",swell:"Swell",rain:"Rain",
    scoreExcellent:"Excellent",scoreGood:"Good",scoreMedium:"Fair",scoreBad:"Difficult conditions",
    marine:"Marine conditions",
    history:"Recent trend",historyEmpty:"No history yet",
    historyDays:"{n}d",
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEACH DATA — 20 inline fallback + runtime fetch for 190
   ═══════════════════════════════════════════════════════════════════════════ */
const BEACHES_FALLBACK=[
  {id:"mq001",island:"mq",name:"Plage des Salines",commune:"Sainte-Anne",lat:14.3958521,lng:-60.8689802,kids:true,snorkel:false,parking:true,drive:52},
  {id:"mq011",island:"mq",name:"Anse Mitan",commune:"Les Trois-Îles",lat:14.5522593,lng:-61.0552056,kids:true,snorkel:false,parking:true,drive:18},
  {id:"mq014",island:"mq",name:"Grande Anse d'Arlet",commune:"Les Anses-d'Arlet",lat:14.5027854,lng:-61.0856311,kids:true,snorkel:true,parking:true,drive:25},
  {id:"mq016",island:"mq",name:"Plage du Diamant",commune:"Le Diamant",lat:14.4758027,lng:-61.0314046,kids:false,snorkel:false,parking:true,drive:32},
  {id:"mq005",island:"mq",name:"Anse Trabaud",commune:"Sainte-Anne",lat:14.4101296,lng:-60.8482068,kids:false,snorkel:false,parking:true,drive:52},
  {id:"mq024",island:"mq",name:"Anse Madame",commune:"Schoelcher",lat:14.6177983,lng:-61.1036302,kids:true,snorkel:false,parking:true,drive:12},
  {id:"mq029",island:"mq",name:"Plage de Saint-Pierre",commune:"Saint-Pierre",lat:14.7404792,lng:-61.1768484,kids:true,snorkel:true,parking:true,drive:32},
  {id:"mq012",island:"mq",name:"Anse Noire",commune:"Les Anses-d'Arlet",lat:14.5277232,lng:-61.0873771,kids:true,snorkel:true,parking:false,drive:28},
  {id:"mq019",island:"mq",name:"Anse Gros Raisins",commune:"Sainte-Luce",lat:14.4658147,lng:-60.9260982,kids:true,snorkel:true,parking:false,drive:38},
  {id:"mq023",island:"mq",name:"Plage de la Française",commune:"Fort-de-France",lat:14.6011133,lng:-61.0674743,kids:true,snorkel:false,parking:true,drive:8},
  {id:"gp009",island:"gp",name:"Plage de la Caravelle",commune:"Sainte-Anne",lat:16.2181,lng:-61.3965,kids:true,snorkel:true,parking:true,drive:38},
  {id:"gp012",island:"gp",name:"Plage du Gosier",commune:"Le Gosier",lat:16.2048,lng:-61.4948,kids:true,snorkel:true,parking:true,drive:12},
  {id:"gp031",island:"gp",name:"Plage de Malendure",commune:"Bouillante",lat:16.1721,lng:-61.7767,kids:true,snorkel:true,parking:true,drive:42},
  {id:"gp024",island:"gp",name:"Plage de Deshaies",commune:"Deshaies",lat:16.3053509,lng:-61.7950711,kids:true,snorkel:true,parking:true,drive:55},
  {id:"gp005",island:"gp",name:"Pointe des Châteaux",commune:"Saint-François",lat:16.2531027,lng:-61.2306694,kids:false,snorkel:false,parking:true,drive:52},
  {id:"gp015",island:"gp",name:"Porte d'Enfer",commune:"Anse-Bertrand",lat:16.4861861,lng:-61.4416828,kids:false,snorkel:false,parking:true,drive:55},
  {id:"gp045",island:"gp",name:"Plage Pain de Sucre",commune:"Terre-de-Haut (Les Saintes)",lat:15.8635,lng:-61.5988,kids:true,snorkel:true,parking:false,drive:60},
  {id:"gp001",island:"gp",name:"Plage de Saint-François",commune:"Saint-François",lat:16.2521,lng:-61.2644,kids:true,snorkel:true,parking:true,drive:48},
  {id:"gp010",island:"gp",name:"Plage de Sainte-Anne",commune:"Sainte-Anne",lat:16.2226,lng:-61.3828,kids:true,snorkel:false,parking:true,drive:38},
  {id:"gp021",island:"gp",name:"Plage de Grande Anse",commune:"Trois-Rivières",lat:15.9589717,lng:-61.6719389,kids:true,snorkel:true,parking:true,drive:45},
]

const ISLAND_CENTER={mq:[14.64,-61.02],gp:[16.22,-61.55]}

// Mapping: sargassum.json / history.json IDs → beaches-list.json IDs
const SARG_TO_BEACH={"grande-anse":"mq014","anse-mitan":"mq011","anse-noire":"mq012","tartane":"mq034","anse-madame":"mq024","diamant":"mq016","pt-marin":"mq008","sainte-anne":"mq004","les-salines":"mq001","vauclin":"mq044","gp-grande-anse":"gp021","gp-malendure":"gp031","gp-sainte-anne":"gp010","gp-pt-chateaux":"gp005","gp-gosier":"gp012","gp-caravelle":"gp009","gp-bas-du-fort":"gp014","gp-deshaies":"gp024","gp-moule":"gp080","gp-vieux-fort":"gp042"}
const BEACH_TO_SARG=Object.fromEntries(Object.entries(SARG_TO_BEACH).map(([k,v])=>[v,k]))

function findMostRelevantThreat(banks,beaches,favorites,userPos,island){
  if(!banks||!banks.length||!beaches||!beaches.length)return null
  const isGP=island==="gp"
  const visible=banks.filter(b=>isGP?b.centroid[0]>=15.5:b.centroid[0]<15.5)
  let best=null,bestScore=-1
  for(const bank of visible){
    if(!bank.threatens)continue
    for(const tk of["now","6h","12h","24h"]){
      const threats=bank.threatens[tk];if(!threats)continue
      for(const t of threats){
        const beachId=SARG_TO_BEACH[t.id]
        const beach=beachId?beaches.find(b=>b.id===beachId):null
        if(!beach)continue
        let score=0
        if(favorites&&favorites.includes(beach.id))score+=100
        if(userPos){
          const d=haversine(userPos.lat,userPos.lng,beach.lat,beach.lng)
          score+=Math.max(0,50*(1-d/50))
        }
        score+=tk==="now"?40:tk==="6h"?30:tk==="12h"?20:10
        score+=bank.mass*20
        if(score>bestScore){bestScore=score;best={bank,beach,timeKey:tk,km:t.km}}
      }
    }
  }
  return best
}

// Stripe — Payment Links (fallback popup) + Buy Button (embedded, si configure)
const STRIPE_LINK_MONTHLY="https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s" // 4.99 EUR/mois + 7d trial
const STRIPE_LINK_ANNUAL="https://buy.stripe.com/14AeVf0h5c3o4yhgAz0co0r" // 39.99 EUR/an + 7d trial
const STRIPE_PK="pk_live_51PW2TGP9RK8Orx516Nx5mGUixrk2ozE8ppOcygq9Wkb1Tz5CkozRcRFcPAv53uNOmuVCHakWAse09I7KXuUiAb5r00CKYHh9zE"
// Buy Button IDs — creer sur dashboard.stripe.com/buy-buttons puis coller ici
const STRIPE_BUY_BTN_MONTHLY="buy_btn_1TJLdoP9RK8Orx514zzwL1B4" // 4.99€/mois + trial 7j + taxes
const STRIPE_BUY_BTN_ANNUAL="buy_btn_1TJLcjP9RK8Orx51JDzUFge3"

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */
const g=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const s=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}

/* ═══════════════════════════════════════════════════════════════════════════
   A/B TESTING + ANALYTICS
   ═══════════════════════════════════════════════════════════════════════════ */
function abVariant(testId,variants,weights){
  const ab=g("sg_ab",{})
  if(ab[testId]!=null&&ab[testId]<variants.length)return variants[ab[testId]]
  const r=Math.random();let cum=0,pick=0
  for(let i=0;i<weights.length;i++){cum+=weights[i];if(r<cum){pick=i;break}}
  ab[testId]=pick;s("sg_ab",ab)
  return variants[pick]
}

const TRACK_QUEUE_KEY="sg_track_queue"
const APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
function track(event,params={}){
  const ab=g("sg_ab",{})
  const p={...params}
  for(const[k,v]of Object.entries(ab))p["ab_"+k]=v
  // Primary: GA4 (gtag.js — may 503 in EU/DMA regions)
  try{window.gtag("event",event,p)}catch(e){}
  // Measurement Protocol direct beacon — bypasses gtag.js DMA block
  try{
    const isGP=window.location.hostname.includes("guadeloupe")
    const mid=isGP?"G-Q31VV3LLM9":"G-V8JGMDZZ2Y"
    const sec=isGP?"eWAv3vACT6uVzcrAi7JgYQ":"eFHMRr4tQ-2B-JYidixOSA"
    const cid=document.cookie.match(/_ga=GA\d+\.\d+\.(\d+\.\d+)/)?.[1]||"a."+Date.now()
    navigator.sendBeacon&&navigator.sendBeacon(
      `https://www.google-analytics.com/mp/collect?measurement_id=${mid}&api_secret=${sec}`,
      JSON.stringify({client_id:cid,events:[{name:event,params:p}]}))
  }catch{}
  // Backup: queue critical conversion events to localStorage + beacon to Apps Script
  const critical=event.startsWith("sg_checkout")||event.startsWith("sg_premium")||event==="sg_conversion"
    ||event==="sg_email_submit"||event==="sg_forecast_lock_click"||event==="sg_session_start"
    ||event==="sg_push_accept"||event==="sg_push_primer_accept"||event==="sg_push_primer_dismiss"
    ||event==="sg_weekend_banner_click"||event==="sg_referral_share"
  if(critical){
    const entry={e:event,p,t:Date.now(),island:window.location.hostname.includes("guadeloupe")?"GP":"MQ"}
    try{
      const q=JSON.parse(localStorage.getItem(TRACK_QUEUE_KEY)||"[]")
      q.push(entry)
      if(q.length>200)q.splice(0,q.length-200) // cap
      localStorage.setItem(TRACK_QUEUE_KEY,JSON.stringify(q))
    }catch{}
    // Fire-and-forget beacon to Apps Script as backup
    try{navigator.sendBeacon&&navigator.sendBeacon(APPS_SCRIPT_URL,
      JSON.stringify({type:"analytics_event",...entry}))}catch{}
  }
}
// Flush queued events on next session if GA4 is available
function flushTrackQueue(){
  try{
    if(!window.gtag)return
    const q=JSON.parse(localStorage.getItem(TRACK_QUEUE_KEY)||"[]")
    if(!q.length)return
    // Send top 50 oldest events, clear them
    const batch=q.splice(0,50)
    localStorage.setItem(TRACK_QUEUE_KEY,JSON.stringify(q))
    for(const{e,p}of batch){try{window.gtag("event","recovery_"+e,p)}catch{}}
  }catch{}
}
try{if(typeof window!=="undefined")setTimeout(flushTrackQueue,5000)}catch{}

function AbDebug(){
  const[show,setShow]=useState(false)
  useEffect(()=>{try{if(new URLSearchParams(window.location.search).get("ab_debug")==="1")setShow(true)}catch{}},[])
  if(!show)return null
  const ab=g("sg_ab",{})
  const tests={lock1:["control","loss"],modal1:["control","family"],free1:["control","two_free"]}
  return(
    <div style={{position:"fixed",top:8,right:8,zIndex:99999,background:"rgba(0,0,0,.9)",color:"#0f0",
      padding:12,borderRadius:8,fontSize:11,fontFamily:"monospace",maxWidth:260}}>
      <div style={{fontWeight:700,marginBottom:6}}>A/B Debug</div>
      {Object.entries(tests).map(([id,vars])=>{
        const idx=ab[id]
        return <div key={id}>{id}: <b>{idx!=null?vars[idx]:"unassigned"}</b> ({idx})</div>
      })}
      <button onClick={()=>{localStorage.removeItem("sg_ab");window.location.reload()}}
        style={{marginTop:8,background:"#333",color:"#0f0",border:"1px solid #0f0",borderRadius:4,
          padding:"4px 8px",cursor:"pointer",fontSize:10}}>Reset variants</button>
    </div>
  )
}

/**
 * Status thresholds aligned with NOAA SIR (Sargassum Inundation Risk).
 * NOAA raw AFAI deviation thresholds: 0.001 (low/medium), 0.003 (medium/high).
 * Our normalizeAfai() maps: raw 0.002→0.15, raw 0.005→0.40.
 * Sources: NOAA/AOML SIR v1.4, Wang & Hu 2016 (USF MODIS).
 */
function statusFromAfai(afai){return afai<.15?"clean":afai<.40?"moderate":"avoid"}

function generateForecast(afai,lang="fr"){
  const LL=T[lang]||T.fr,now=new Date()
  return Array.from({length:7},(_,i)=>{
    const d=new Date(now);d.setDate(d.getDate()+i)
    const dayName=i===0?LL.today:i===1?LL.tomorrow:LL.days[d.getDay()]
    const v=Math.sin(i*.8+afai*10)*.15
    const a=Math.max(0,Math.min(1,afai+v))
    return{day:dayName,date:d.toISOString().slice(0,10),afai:Math.round(a*100)/100,status:statusFromAfai(a)}
  })
}

function satImg(lat,lng,size=280){
  const p=.006
  return`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${lng-p},${lat-p},${lng+p},${lat+p}&bboxSR=4326&size=${size},${size}&imageSR=4326&format=png&f=image`
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371,toR=Math.PI/180
  const dLat=(lat2-lat1)*toR,dLon=(lon2-lon1)*toR
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

/**
 * Inverse Distance Weighting — interpolate AFAI for non-sentinel beaches
 * from the K nearest sentinel beaches. Power=2, K=3.
 */
function interpolateIDW(beach,sentinels,k=3,power=2){
  if(!sentinels||sentinels.length===0)return null
  const withDist=sentinels.map(s=>({...s,dist:haversine(beach.lat,beach.lng,s.lat,s.lng)}))
    .sort((a,b)=>a.dist-b.dist).slice(0,k)
  // If closest sentinel is <0.5km, just use its value directly
  if(withDist[0].dist<0.5)return withDist[0].afai
  let sumW=0,sumV=0
  for(const s of withDist){
    const w=1/Math.pow(s.dist,power)
    sumW+=w;sumV+=w*s.afai
  }
  return Math.round((sumV/sumW)*100)/100
}

/**
 * Classify a beach coast: 'atlantic' (exposed to trade winds / sargassum arrivals)
 * or 'sheltered' (protected by relief, never receives sargassum).
 * Rule-based from lat/lng/island — Anses d'Arlet + sud MQ restent atlantic
 * (contournement sud possible).
 */
function classifyBeachCoast(lat,lng,island){
  if(island==="mq"){
    // Baie de Fort-de-France (Trois-Îlets, Schoelcher) : abritée
    if(lat>14.54&&lat<14.68&&lng<-61.02&&lng>-61.16)return"sheltered"
    // Anses d'Arlet nord (Anse Noire, Anse Dufour) : partiellement abritées
    if(lat>14.52&&lat<14.55&&lng<-61.08)return"sheltered"
    // Cote nord-ouest (Prêcheur, Grand'Rivière) : abritée par Pelée
    if(lat>14.78&&lng<-61.10)return"sheltered"
    return"atlantic"
  }
  if(island==="gp"){
    // Basse-Terre côte ouest (Bouillante, Pointe-Noire, Vieux-Habitants, Deshaies)
    if(lng<-61.70)return"sheltered"
    // Basse-Terre nord-ouest (Sainte-Rose, Deshaies)
    if(lng<-61.55&&lat>16.25)return"sheltered"
    return"atlantic"
  }
  return"atlantic"
}

/**
 * Interpolate forecast for non-sentinel beaches by IDW-blending K nearest sentinels
 * v3: propagates arrivalDetected, forecastMethod, reliableHorizon from sentinels
 * v3.1: caribbean beaches never show arrivalDetected (geography rule)
 */
function interpolateForecast(beach,sentinels,weeklyData,k=3,power=2){
  if(!weeklyData||!sentinels||sentinels.length===0)return null
  const withDist=sentinels
    .filter(s=>weeklyData[s.sargId])
    .map(s=>({...s,dist:haversine(beach.lat,beach.lng,s.lat,s.lng)}))
    .sort((a,b)=>a.dist-b.dist).slice(0,k)
  if(withDist.length===0)return null
  const weights=withDist.map(s=>({w:1/Math.pow(Math.max(s.dist,0.1),power),id:s.sargId}))
  const sumW=weights.reduce((s,x)=>s+x.w,0)
  const ref=weeklyData[weights[0].id].forecast
  const forecast=ref.map((dayRef,i)=>{
    let blended=0
    let blendedConf=0
    for(const{w,id}of weights){
      const f=weeklyData[id].forecast[i]
      blended+=(w/sumW)*(f?f.afai:dayRef.afai)
      blendedConf+=(w/sumW)*((f?.confidence)||dayRef.confidence||40)
    }
    const afai=Math.round(Math.max(0,Math.min(1,blended))*100)/100
    return{day:dayRef.day,date:dayRef.date,afai,status:statusFromAfai(afai),
      confidence:Math.round(blendedConf),type:dayRef.type,sources:dayRef.sources}
  })
  // Sheltered beaches NEVER get arrival signal (baie FDF + Basse-Terre ouest)
  const beachCoast=beach.coast||classifyBeachCoast(beach.lat,beach.lng,beach.island)
  const isSheltered=beachCoast==="sheltered"
  // Propagate arrivalDetected if ANY nearby sentinel flags arrival (union) — unless sheltered
  const anyArrival=!isSheltered&&withDist.some(s=>weeklyData[s.sargId]?.arrivalDetected)
  const maxArrival=isSheltered?0:Math.max(...withDist.map(s=>weeklyData[s.sargId]?.arrivalStrength||0))
  // reliableHorizon = min of nearby sentinels (most conservative)
  const minHorizon=Math.min(...withDist.map(s=>weeklyData[s.sargId]?.reliableHorizon||3))
  // Drift from day 0 to day 3 (meaningful short horizon)
  const trend=(forecast[3]?.afai||forecast[forecast.length-1].afai)-forecast[0].afai
  return{
    forecast,
    drift:trend>0.05?"up":trend<-0.05?"down":"stable",
    driftLabel:trend>0.05?"Dérive possible vers la côte":trend<-0.05?"Dispersion attendue":"Stable",
    driftValue:Math.round(trend*100)/100,
    interpolated:true,
    arrivalDetected:anyArrival,
    arrivalStrength:Math.round(maxArrival*100)/100,
    reliableHorizon:minHorizon,
    forecastMethod:anyArrival?"arrival-banks":"interpolated",
    forecastDisclaimer:anyArrival
      ?"Banc detecte pres des plages voisines — risque de derive."
      :"Interpolation des plages voisines surveillees.",
  }
}

// Beaches missing Google Places photos — use satellite fallback
const NO_PHOTO=new Set([])

function getBeachPhoto(beach){
  if(!beach)return null
  // Skip if no Google Places photo exists
  if(NO_PHOTO.has(beach.id))return null
  // Google Places photo (129/135 plages, 1600px HQ)
  return`/beaches/gplace-${beach.id}.jpg?v=2`
}

/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL STYLES (injected once)
   ═══════════════════════════════════════════════════════════════════════════ */
const CSS=`
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{height:100vh;height:100dvh;overflow:hidden;font-family:'Bricolage Grotesque',system-ui,sans-serif;-webkit-font-smoothing:antialiased;touch-action:manipulation}
body{background:var(--sg-bg,#FDFCF7);color:var(--sg-ink,#0D0D0D)}
button,a,[role="button"]{touch-action:manipulation;cursor:pointer;-webkit-user-select:none;user-select:none;transition:transform .12s,opacity .12s}
button:active,a:active,[role="button"]:active{transform:scale(.96)!important;opacity:.85}
.anton{font-family:'Anton',sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:-.02em}
.leaflet-container{background:#0a1a2e!important;touch-action:manipulation}
.leaflet-control-attribution{display:none!important}
/* Marker glow — status-colored halo around beach dots */
.leaflet-interactive{filter:drop-shadow(0 0 4px rgba(255,255,255,.3))}
/* Fav heart bounce */
@keyframes heartPop{0%{transform:scale(1)}30%{transform:scale(1.3)}60%{transform:scale(.9)}100%{transform:scale(1)}}
.heart-pop{animation:heartPop .4s cubic-bezier(.22,1,.36,1)}
.leaflet-control-zoom{display:none!important}
.leaflet-interactive{cursor:pointer!important}
/* Nearest clean beach — golden pulsing ring */
.sg-nearest-ring{animation:nearestPulse 2s ease-in-out infinite}
@keyframes nearestPulse{0%,100%{stroke-opacity:.4;r:22}50%{stroke-opacity:.1;r:30}}

/* Gold button */
.gbtn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  background:linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%);
  border:none;border-radius:22px;color:#0D0D0D;font-weight:700;font-size:15px;
  padding:14px 28px;cursor:pointer;position:relative;overflow:hidden;
  font-family:'Bricolage Grotesque',system-ui,sans-serif;
  box-shadow:0 2px 12px rgba(232,168,0,.3);transition:transform .15s,box-shadow .15s;
  will-change:transform;
}
.gbtn:active{transform:scale(.95);box-shadow:0 1px 6px rgba(232,168,0,.2)}
.gbtn::after{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);
  animation:shine 4.5s infinite;
  will-change:left;
}
@keyframes shine{0%,70%{left:-100%}100%{left:100%}}

/* Bottom sheet */
.sheet{
  position:fixed;bottom:0;left:0;right:0;z-index:900;
  max-width:520px;margin:0 auto;
  background:var(--sg-card,#fff);border-radius:20px 20px 0 0;
  box-shadow:0 -4px 30px rgba(0,0,0,.12);
  transition:transform .35s cubic-bezier(.32,.72,0,1);
  max-height:85vh;max-height:85dvh;overflow-y:auto;overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
  animation:sheetSlideUp .4s cubic-bezier(.32,.72,0,1);
  will-change:transform;
}
@keyframes sheetSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.sheet-handle{width:48px;height:5px;border-radius:3px;background:var(--sg-handle,rgba(0,0,0,.2));margin:10px auto 6px;cursor:grab}

/* Backdrop */
.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:899;animation:fadeIn .25s ease-out;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);will-change:opacity}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}

/* ── ONBOARDING (removed full-screen overlay, now inline coachmark) ── */

@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes float-a{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes float-b{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes dot-pulse{0%,100%{box-shadow:0 0 0 2px rgba(34,197,94,.2)}50%{box-shadow:0 0 0 5px rgba(34,197,94,.07)}}
@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
@keyframes sg-threat-slide{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
@keyframes sg-threat-glow{0%,100%{box-shadow:0 4px 20px rgba(232,82,42,.3)}50%{box-shadow:0 4px 30px rgba(232,82,42,.55)}}
@keyframes sg-dash-flow{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
.sg-drift-path{animation:sg-dash-flow 1.5s linear infinite}
@keyframes goldGlow{0%,100%{box-shadow:0 4px 20px rgba(232,168,0,.25)}50%{box-shadow:0 4px 30px rgba(232,168,0,.5)}}
@keyframes confirmPop{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes pin-pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.8);opacity:0}}
@keyframes beacon{0%,100%{box-shadow:0 0 0 0 rgba(232,82,42,.5)}60%{box-shadow:0 0 0 10px rgba(232,82,42,0)}}
@keyframes satellite-scan{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}

/* Scrollbar — 8px for touch targets */
::-webkit-scrollbar{width:8px}
::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:4px}
::-webkit-scrollbar-track{background:transparent}
*{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent}

/* Forecast bars — staggered grow-in */
.fc-bar{border-radius:3px 3px 0 0;animation:barGrow .6s cubic-bezier(.22,1,.36,1) backwards}
.fc-bar:nth-child(1){animation-delay:0s}.fc-bar:nth-child(2){animation-delay:.06s}.fc-bar:nth-child(3){animation-delay:.12s}
.fc-bar:nth-child(4){animation-delay:.18s}.fc-bar:nth-child(5){animation-delay:.24s}.fc-bar:nth-child(6){animation-delay:.3s}.fc-bar:nth-child(7){animation-delay:.36s}
@keyframes barGrow{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}}

/* Status pulse */
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.pulse{animation:pulse 2s infinite}

/* Sargassum bank animations */
.sg-bank{transition:fill-opacity .6s ease}
.sg-drift-dot{transition:all .6s ease}
@keyframes sg-eta-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.sg-eta-badge{animation:sg-eta-pulse 2s ease-in-out infinite}

/* Shine for onboarding buttons */
@keyframes onb-shine{0%,100%{left:-75%}35%,65%{left:120%}}

/* Small screens — iPhone SE, Galaxy S5, etc. */
@media(max-width:360px){
  .gbtn{padding:12px 18px !important;font-size:14px !important}
  .sheet{border-radius:16px 16px 0 0 !important}
  .anton{letter-spacing:0 !important}
}

/* Reduced motion — kill infinite animations, keep one-shot transitions */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
  .gbtn::after{animation:none !important}
  .sg-nearest-ring,.sg-eta-badge,.pulse,.sg-drift-path{animation:none !important}
  .heart-pop{animation:none !important}
}
`

function StyleInjector(){
  const ref=useRef(false)
  useEffect(()=>{
    if(ref.current)return;ref.current=true
    const el=document.createElement("style");el.textContent=CSS;document.head.appendChild(el)
  },[])
  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */
function StatusBadge({status,lang="fr"}){
  const st=ST[status]||ST._loading
  const label=lang==="en"?st.le:st.l
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 14px",
      borderRadius:100,background:st.bg,color:st.c,fontSize:13,fontWeight:700,
      boxShadow:`0 2px 8px ${st.c}20`,animation:"confirmPop .35s cubic-bezier(.22,1,.36,1)"}}>
      <span>{st.e}</span>{label}
    </span>
  )
}

function AfaiBadge({afai}){
  if(afai==null)return null
  const pct=Math.round(afai*100)
  const color=afai<.3?C.green:afai<.65?C.amber:C.red
  return(
    <span style={{fontSize:12,fontWeight:600,color,opacity:.9}}>AFAI {pct}%</span>
  )
}

function FilterChip({label,icon,active,onClick,count}){
  return(
    <button onClick={onClick} style={{
      display:"inline-flex",alignItems:"center",gap:5,padding:"8px 16px",
      borderRadius:100,border:active?"1.5px solid "+C.gold:"1.5px solid var(--sg-border,rgba(0,0,0,.08))",
      background:active?"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)":"var(--sg-card,#fff)",
      color:active?C.ink:"var(--sg-ink,#0D0D0D)",fontSize:13,fontWeight:active?700:500,
      cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",
      boxShadow:active?"0 2px 8px rgba(232,168,0,.2)":"0 1px 4px rgba(0,0,0,.04)",
      transition:"all .2s",
    }}>
      <span>{icon}</span>{label}
      {count!=null&&<span style={{fontSize:11,fontWeight:600,opacity:.6,
        background:active?"rgba(0,0,0,.1)":"rgba(0,0,0,.05)",
        borderRadius:100,padding:"1px 6px",marginLeft:1}}>{count}</span>}
    </button>
  )
}

function BottomNav({view,onChangeView,lang}){
  const LL=T[lang]||T.fr
  const tabs=[
    {id:"map",label:LL.navMap,icon:"🗺️"},
    {id:"list",label:LL.navList,icon:"📋"},
    {id:"premium",label:LL.navPremium,icon:"⭐"},
  ]
  return(
    <nav style={{
      position:"fixed",bottom:0,left:0,right:0,zIndex:800,
      display:"flex",justifyContent:"space-around",alignItems:"center",
      background:"var(--sg-glass,rgba(255,255,255,.92))",
      backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
      borderTop:"1px solid var(--sg-glassBorder,rgba(0,0,0,.06))",
      padding:"8px 0 max(12px,env(safe-area-inset-bottom))",
    }}>
      {tabs.map(t=>{
        const active=view===t.id||(t.id==="premium"&&false)
        return(
        <button key={t.id} onClick={()=>onChangeView(t.id)} style={{
          display:"flex",flexDirection:"column",alignItems:"center",gap:2,
          background:"none",border:"none",cursor:"pointer",
          color:active?C.gold:"var(--sg-mid,#686868)",
          fontSize:10,fontWeight:active?700:500,fontFamily:"inherit",
          transition:"all .2s",padding:"4px 16px",position:"relative",
        }}>
          {active&&<div style={{position:"absolute",top:-1,width:24,height:3,
            borderRadius:2,background:C.gold,transition:"width .2s"}}/>}
          <span style={{fontSize:20,transition:"transform .2s",
            transform:active?"scale(1.1)":"scale(1)"}}>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      )})}
    </nav>
  )
}

/* MapView extracted to src/MapView.jsx — lazy-loaded via LazyMapView */

/* ═══════════════════════════════════════════════════════════════════════════
   FORECAST CHART — Day 1 (today) free, days 2-7 LOCKED (blurred) for premium
   Data: 1.57% conversion — show only today free to increase premium value
   ═══════════════════════════════════════════════════════════════════════════ */
function ForecastChart({forecast,lang,onPremiumClick,isPremium,weatherDaily,weeklyData}){
  if(!forecast||!forecast.length)return null
  const LL=T[lang]||T.fr
  // v3: cap visible days at J+3 (horizon beyond that is unreliable per backtest)
  // Memory beaches: show only J+1 reliably
  const reliableHorizon=weeklyData?.reliableHorizon||3
  const visibleDays=Math.min(forecast.length,Math.max(4,reliableHorizon+1))
  const visible=forecast.slice(0,visibleDays)
  const max=Math.max(...visible.map(d=>d.afai),.1)
  // A/B Test 4: free days (1 vs 2)
  const freeV=abVariant("free1",["control","two_free"],[.5,.5])
  const freeThreshold=freeV==="two_free"?2:1
  const lockedCount=visibleDays-freeThreshold
  // A/B Test 1: lock framing
  const lockV=abVariant("lock1",["control","loss"],[.5,.5])
  const inSeason=SARGASSES_SEASON==="high"
  const lockCTA=lockV==="loss"
    ?(lang==="en"
      ?(inSeason?"Beaches change daily":"Don't miss this weekend")
      :(inSeason?"Les plages changent chaque jour":"Ne rate pas ce weekend"))
    :(lang==="en"?"See 4-day forecast":"Voir les 4 jours")
  const lockSub=lockV==="loss"
    ?(lang==="en"
      ?(inSeason?"Sargassum season is active. Know before you go.":"Saturday, it'll be too late to switch beaches.")
      :(inSeason?"La saison est là. Sache avant d'y aller.":"Samedi, il sera trop tard pour changer de plage."))
    :(lang==="en"?"Free trial · cancel anytime":"Essai gratuit · sans engagement")
  const firstConf=visible[1]?.confidence||40
  return(
    <div style={{position:"relative"}}>
      <div style={{display:"flex",gap:6,alignItems:"flex-end",height:140,padding:"8px 0"}}>
        {visible.map((d,i)=>{
          const h=Math.max(8,(d.afai/max)*70)
          const st=ST[d.status]||ST._loading
          const isLocked=!isPremium&&i>=freeThreshold
          const hasDaily=weatherDaily&&weatherDaily.tempMax&&i<weatherDaily.tempMax.length
          const dayPrecip=hasDaily?weatherDaily.precipSum[i]:0
          const dayCloud=hasDaily?weatherDaily.cloudMean[i]:0
          const dayWind=hasDaily?weatherDaily.windMax[i]:0
          const dayTemp=hasDaily?Math.round(weatherDaily.tempMax[i]):null
          const wxIcon=hasDaily?getDayWeatherIcon(dayPrecip,dayCloud,dayWind):null
          const fType=d.type||(i===0?"observation":i<=3?"tendance":"horizon")
          const fConf=d.confidence||null
          const typeOpacity=fType==="observation"?1:fType==="tendance"?.9:.55
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              filter:isLocked?"blur(2px)":"none",opacity:isLocked?0.55:typeOpacity,
              pointerEvents:isLocked?"none":"auto"}}>
              {wxIcon&&<span style={{fontSize:13,lineHeight:1}}>{wxIcon}</span>}
              {dayTemp!=null&&<span style={{fontSize:9,fontWeight:600,color:"var(--sg-mid,#686868)"}}>{dayTemp}°</span>}
              <span style={{fontSize:10,fontWeight:600,color:st.c}}>{Math.round(d.afai*100)}%</span>
              <div className="fc-bar" style={{width:"100%",height:h,background:st.c,opacity:.8}}/>
              <span style={{fontSize:10,color:"var(--sg-mid,#686868)",fontWeight:500}}>{d.day}</span>
              {fConf!=null&&!isLocked&&<span style={{fontSize:8,color:"var(--sg-mid,#999)",fontWeight:400}}>{fConf}%</span>}
            </div>
          )
        })}
      </div>
      <div style={{fontSize:9,color:"var(--sg-mid,#999)",textAlign:"center",padding:"2px 0 0",lineHeight:1.3}}>
        {lang==="en"
          ?`Reliable up to 4 days. ${Math.round(firstConf)}% confidence tomorrow.`
          :`Fiable jusqu'a 4 jours. Fiabilite ${Math.round(firstConf)}% demain.`}
      </div>
      {!isPremium&&lockedCount>0&&<div onClick={()=>{track("sg_forecast_lock_click",{variant:lockV});onPremiumClick("forecast")}}
        style={{position:"absolute",top:0,right:0,bottom:0,width:`${(lockedCount/visibleDays*100).toFixed(1)}%`,
        display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
        background:"linear-gradient(90deg,transparent,var(--sg-bg,#FDFCF7) 25%)",
        borderRadius:8}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <button className="gbtn" style={{
            padding:"10px 20px",fontSize:13,fontWeight:700,
            fontFamily:"'Anton',sans-serif",letterSpacing:".04em",textTransform:"uppercase",
            animation:"pulse 2s ease-in-out infinite",
          }}>
            🔒 {lockCTA}
          </button>
          <span style={{fontSize:11,color:"var(--sg-mid,#686868)",fontWeight:500,textAlign:"center",maxWidth:160}}>
            {lockSub}
          </span>
        </div>
      </div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   METHODOLOGY LINK — "Comment c'est calcule?" expandable
   ═══════════════════════════════════════════════════════════════════════════ */
function MethodologyLink({beach,lang,sargData}){
  const[open,setOpen]=useState(false)
  if(!beach)return null
  const fr=lang!=="en"
  const chain=beach._communityOverride
    ?(fr?"Signalements visiteurs (48h) → Consensus ≥3 → Votre écran":"Visitor reports (48h) → Consensus ≥3 → Your screen")
    :beach.beachMemory
    ?(fr?"Historique satellite 7j → Décroissance exponentielle (demi-vie 3.5j) → Votre écran":"Satellite history 7d → Exponential decay (half-life 3.5d) → Your screen")
    :beach._src==="live"
    ?(fr?"NOAA ERDDAP (satellite AFAI) → Normalisation → Votre écran":"NOAA ERDDAP (satellite AFAI) → Normalization → Your screen")
    :(fr?"3 plages proches avec satellite → Interpolation IDW → Votre écran":"3 nearest satellite beaches → IDW interpolation → Your screen")
  return(<div style={{marginBottom:8}}>
    <button onClick={()=>setOpen(!open)} style={{
      background:"none",border:"none",padding:0,cursor:"pointer",
      fontSize:10,color:"var(--sg-mid,#999)",textDecoration:"underline",fontWeight:500,
    }}>{fr?"Comment c'est calculé ?":"How is this calculated?"} {open?"▲":"▼"}</button>
    {open&&<div style={{fontSize:10,color:"var(--sg-mid,#686868)",marginTop:4,padding:"6px 10px",
      background:"rgba(0,0,0,.03)",borderRadius:8,lineHeight:1.5}}>
      <div style={{fontWeight:600,marginBottom:2}}>{fr?"Chaîne de données":"Data chain"}</div>
      <div>{chain}</div>
      {sargData?.pipelineVersion&&<div style={{marginTop:4,fontSize:9,opacity:.6}}>Pipeline v{sargData.pipelineVersion}</div>}
    </div>}
  </div>)
}

/* ═══════════════════════════════════════════════════════════════════════════
   WEATHER (Open-Meteo)
   ═══════════════════════════════════════════════════════════════════════════ */
const WEATHER_TTL=30*60*1000 // 30 min cache
function cachedFetch(url,cacheKey){
  try{
    const raw=sessionStorage.getItem(cacheKey)
    if(raw){const c=JSON.parse(raw);if(Date.now()-c.t<WEATHER_TTL)return Promise.resolve(c.d)}
  }catch{}
  return fetch(url).then(r=>{
    if(!r.ok)throw new Error(r.status)
    return r.json()
  }).then(d=>{
    try{sessionStorage.setItem(cacheKey,JSON.stringify({t:Date.now(),d}))}catch{}
    return d
  })
}
function useWeather(beach){
  const[data,setData]=useState(null)
  useEffect(()=>{
    if(!beach)return setData(null)
    let cancel=false
    const weatherUrl=`https://api.open-meteo.com/v1/forecast?latitude=${beach.lat}&longitude=${beach.lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index,precipitation&daily=temperature_2m_max,precipitation_sum,cloud_cover_mean,wind_speed_10m_max&timezone=America/Martinique`
    const marineUrl=`https://marine-api.open-meteo.com/v1/marine?latitude=${beach.lat}&longitude=${beach.lng}&current=wave_height,wave_direction,swell_wave_height&timezone=America/Martinique`
    const wKey=`sg_wx_${beach.id}`,mKey=`sg_mx_${beach.id}`
    Promise.allSettled([
      cachedFetch(weatherUrl,wKey),
      cachedFetch(marineUrl,mKey),
    ]).then(([weatherRes,marineRes])=>{
      if(cancel)return
      const w=weatherRes.status==="fulfilled"?weatherRes.value:null
      const m=marineRes.status==="fulfilled"?marineRes.value:null
      if(!w?.current)return
      setData({
        temp:Math.round(w.current.temperature_2m),
        wind:Math.round(w.current.wind_speed_10m),
        windDir:w.current.wind_direction_10m,
        uv:w.current.uv_index,
        precipitation:w.current.precipitation||0,
        waveHeight:m?.current?.wave_height??null,
        swellHeight:m?.current?.swell_wave_height??null,
        waveDir:m?.current?.wave_direction??null,
        daily:w.daily?{
          tempMax:w.daily.temperature_2m_max,
          precipSum:w.daily.precipitation_sum,
          cloudMean:w.daily.cloud_cover_mean,
          windMax:w.daily.wind_speed_10m_max,
        }:null,
      })
    })
    return()=>{cancel=true}
  },[beach?.id])
  return data
}

/* ═══════════════════════════════════════════════════════════════════════════
   AXE 2: COMMUNITY REPORTS — "Tu es sur place ? Confirme le statut"
   ═══════════════════════════════════════════════════════════════════════════ */
function BeachReport({beach,lang,communityReports}){
  const key="sg_breport_"+beach.id
  const cooldownKey="sg_breport_t_"+beach.id
  const[voted,setVoted]=useState(()=>{
    const last=g(cooldownKey,0)
    if(last&&Date.now()-last<12*3600*1000)return g(key,null)
    return null
  })
  const counts=communityReports[beach.id]||communityReports[BEACH_TO_SARG[beach.id]]||{clean:0,moderate:0,avoid:0,total:0}
  const total=counts.total||0
  const LEVELS=[
    {id:"clean",e:"✅",l:"Propre",le:"Clean",c:C.green,bg:C.greenBg},
    {id:"moderate",e:"⚠️",l:"Modéré",le:"Moderate",c:C.amber,bg:C.amberBg},
    {id:"avoid",e:"🚫",l:"Beaucoup",le:"Heavy",c:C.red,bg:C.redBg},
  ]
  const submit=(level)=>{
    if(voted)return
    setVoted(level);s(key,level);s(cooldownKey,Date.now())
    track("sg_beach_report",{beach_id:beach.id,level,satellite_status:beach.status,island:beach.island})
    try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({type:"beach_report",beach_id:BEACH_TO_SARG[beach.id]||beach.id,beach_name:beach.name,level,island:beach.island,date:new Date().toISOString()})
    }).catch(()=>{})}catch{}
  }
  // Community consensus (mode of reports)
  const consensus=total>=3?(counts.avoid>=counts.moderate&&counts.avoid>=counts.clean?"avoid":counts.moderate>=counts.clean?"moderate":"clean"):null
  return(
    <div style={{margin:"12px 0",padding:"12px 14px",borderRadius:14,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        <span>📍</span>
        {lang==="en"?"On the beach? Report sargassum level":"Sur place ? Signale le niveau de sargasses"}
      </div>
      <div style={{display:"flex",gap:8}}>
        {LEVELS.map(lv=>(
          <button key={lv.id} onClick={()=>submit(lv.id)} disabled={!!voted} style={{
            flex:1,padding:"10px 8px",borderRadius:12,border:"none",cursor:voted?"default":"pointer",
            background:voted===lv.id?lv.bg:"var(--sg-card,#fff)",
            color:voted===lv.id?lv.c:"var(--sg-ink)",fontSize:12,fontWeight:600,
            fontFamily:"inherit",transition:"all .2s",
            boxShadow:voted===lv.id?"inset 0 0 0 1.5px "+lv.c:"0 1px 4px rgba(0,0,0,.04)",
            animation:voted===lv.id?"confirmPop .3s ease":"none",
            opacity:voted&&voted!==lv.id?.4:1,
          }}>{lv.e} {lang==="en"?lv.le:lv.l}</button>
        ))}
      </div>
      {total>0&&(
        <div style={{marginTop:8}}>
          <div style={{display:"flex",height:4,borderRadius:2,overflow:"hidden",background:"var(--sg-border,rgba(0,0,0,.06))"}}>
            {counts.clean>0&&<div style={{flex:counts.clean,background:C.green}}/>}
            {counts.moderate>0&&<div style={{flex:counts.moderate,background:C.amber}}/>}
            {counts.avoid>0&&<div style={{flex:counts.avoid,background:C.red}}/>}
          </div>
          <div style={{marginTop:4,fontSize:11,color:"var(--sg-mid)",textAlign:"center"}}>
            {total} {lang==="en"?"report"+(total>1?"s":""):"signalement"+(total>1?"s":"")} (7j)
            {counts.trend&&counts.trend!=="stable"&&<span style={{marginLeft:4,color:counts.trend==="worsening"?C.red:C.green}}>
              {counts.trend==="worsening"?"↗":"↘"}</span>}
            {consensus&&<> · {lang==="en"?"Consensus: ":"Consensus : "}<span style={{fontWeight:700,color:ST[consensus].c}}>{ST[consensus].e} {lang==="en"?ST[consensus].le:ST[consensus].l}</span></>}
          </div>
        </div>
      )}
      {voted&&<div style={{marginTop:6,fontSize:11,color:C.green,textAlign:"center",fontWeight:500}}>
        {lang==="en"?"Thanks for your report!":"Merci pour ton signalement !"}
      </div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   AXE 3: RELIABILITY SCORE — "85% propre en avril" from history
   ═══════════════════════════════════════════════════════════════════════════ */
function ReliabilityScore({beachId,historyData,lang}){
  const stats=useMemo(()=>{
    if(!historyData)return null
    const sargId=BEACH_TO_SARG[beachId]
    if(!sargId||!historyData[sargId])return null
    const entries=historyData[sargId]
    if(!Array.isArray(entries)||entries.length<3)return null
    const clean=entries.filter(e=>e.afai<0.15).length
    const pct=Math.round(clean/entries.length*100)
    const month=new Date().toLocaleString(lang==="en"?"en":"fr",{month:"long"})
    return{pct,total:entries.length,month}
  },[beachId,historyData,lang])
  if(!stats)return null
  const color=stats.pct>=80?C.green:stats.pct>=50?C.amber:C.red
  const bg=stats.pct>=80?C.greenBg:stats.pct>=50?C.amberBg:C.redBg
  return(
    <div style={{display:"inline-flex",alignItems:"center",gap:8,margin:"8px 0 12px",
      padding:"8px 14px",borderRadius:12,background:bg,border:"1px solid "+color+"22"}}>
      <div style={{position:"relative",width:36,height:36}}>
        <svg width={36} height={36} viewBox="0 0 36 36">
          <circle cx={18} cy={18} r={15} fill="none" stroke="rgba(0,0,0,.06)" strokeWidth={3}/>
          <circle cx={18} cy={18} r={15} fill="none" stroke={color} strokeWidth={3}
            strokeDasharray={`${stats.pct*.94} 100`}
            strokeLinecap="round" transform="rotate(-90 18 18)"
            style={{transition:"stroke-dasharray .6s ease"}}/>
        </svg>
        <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:10,fontWeight:800,color}}>{stats.pct}%</span>
      </div>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)"}}>
          {lang==="en"?`Clean ${stats.pct}% of the time`:`Propre ${stats.pct}% du temps`}
        </div>
        <div style={{fontSize:10,color:"var(--sg-mid)"}}>
          {lang==="en"?`Based on ${stats.total} readings in ${stats.month}`:`${stats.total} mesures en ${stats.month}`}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOTTOM SHEET — beach detail with photo, forecast, weather, nearby
   ═══════════════════════════════════════════════════════════════════════════ */
function BeachSheet({beach,onClose,favorites,onToggleFav,lang,allBeaches,imageMap,onBeachClick,onPremiumClick,isPremium,historyData,sargData,dataSource,userPos,communityReports}){
  const LL=T[lang]||T.fr
  const weather=useWeather(beach)
  // Use REAL forecast, then interpolated, then fallback generated
  // If community reports override status, blend into forecast
  const weeklyData=useMemo(()=>{
    if(!beach||!sargData)return null
    const sargId=BEACH_TO_SARG[beach.id]
    let w=null
    if(sargId&&sargData.weekly?.[sargId])w=sargData.weekly[sargId]
    else{
      const interpKey=`_interp_${beach.id}`
      w=sargData._enrichedWeekly?.[interpKey]||null
    }
    if(!w)return null
    // Force sheltered beaches to never show arrival (geography rule)
    const coast=beach.coast||classifyBeachCoast(beach.lat,beach.lng,beach.island)
    if(coast==="sheltered"&&w.arrivalDetected){
      return{...w,arrivalDetected:false,arrivalStrength:0}
    }
    return w
  },[beach?.id,sargData])
  const forecast=useMemo(()=>{
    if(!beach)return null
    let fc=weeklyData?.forecast||null
    // 3. Math.sin fallback (should not happen with 20 sentinels)
    if(!fc) fc=generateForecast(beach.afai,lang)
    // 4. Blend community reports into forecast when terrain says worse
    if(fc&&beach?._communityOverride){
      const RANK={clean:0,moderate:1,avoid:2}
      const STATUS_AFAI={clean:.05,moderate:.25,avoid:.60}
      const communityAfai=STATUS_AFAI[beach.status]||.05
      if(RANK[beach.status]>(RANK[fc[0]?.status]||0)){
        fc=fc.map((d,i)=>{
          // Day 1 = community status, then decay influence over 3 days
          const w=Math.max(0,1-i*.33)
          const blended=Math.round((communityAfai*w+d.afai*(1-w))*100)/100
          const st=statusFromAfai(blended)
          return {...d,afai:blended,status:st,sources:[...(d.sources||[]),...(i===0?["community"]:[])]}
        })
      }
    }
    return fc
  },[beach?.id,beach?.status,beach?._communityOverride,lang,weeklyData])
  const isFav=favorites.includes(beach?.id)
  const startY=useRef(0)
  const sheetRef=useRef(null)

  // Scroll to top when beach changes
  useEffect(()=>{
    if(sheetRef.current)sheetRef.current.scrollTop=0
  },[beach?.id])

  // Nearby beaches: same COMMUNE first (SEO internal linking), then by distance
  const nearby=useMemo(()=>{
    if(!beach||!allBeaches)return[]
    const others=allBeaches
      .filter(b=>b.id!==beach.id&&b.island===beach.island)
      .map(b=>({...b,dist:haversine(beach.lat,beach.lng,b.lat,b.lng)}))
    const sameCommune=others.filter(b=>b.commune===beach.commune).sort((a,b)=>a.dist-b.dist)
    const diffCommune=others.filter(b=>b.commune!==beach.commune).sort((a,b)=>a.dist-b.dist)
    return[...sameCommune,...diffCommune].slice(0,3)
  },[beach?.id,allBeaches])

  if(!beach)return null

  const photo=getBeachPhoto(beach)
  const bgImage=photo||satImg(beach.lat,beach.lng,560)

  const onTouchStart=e=>{startY.current=e.touches[0].clientY}
  const onTouchMove=e=>{
    // Only allow swipe-dismiss when sheet is scrolled to top (not mid-scroll)
    if(sheetRef.current&&sheetRef.current.scrollTop>5)return
    const dy=e.touches[0].clientY-startY.current
    if(dy>0&&sheetRef.current)sheetRef.current.style.transform=`translateY(${dy}px)`
  }
  const onTouchEnd=e=>{
    if(sheetRef.current&&sheetRef.current.scrollTop>5){sheetRef.current.style.transform="";return}
    const dy=(e.changedTouches[0]?.clientY||0)-startY.current
    if(dy>60)onClose()
    else if(sheetRef.current){sheetRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";sheetRef.current.style.transform="";setTimeout(()=>{if(sheetRef.current)sheetRef.current.style.transition=""},300)}
  }

  const wazeUrl=`https://waze.com/ul?ll=${beach.lat},${beach.lng}&navigate=yes`

  return(
    <>
      <div className="backdrop" onClick={onClose}/>
      <div className="sheet" ref={sheetRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet-handle"/>

        {/* Photo (real or satellite) */}
        <div style={{height:"min(240px, 30vh)",background:`url(${bgImage}) center center/cover`,
          borderRadius:"0",position:"relative"}}>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(transparent 40%,var(--sg-card,#fff) 100%)"}}/>
          <button onClick={onClose} style={{position:"absolute",top:12,right:12,
            width:44,height:44,borderRadius:22,background:"rgba(0,0,0,.45)",
            border:"none",color:"#fff",fontSize:18,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{padding:"0 20px calc(70px + env(safe-area-inset-bottom,12px))"}}>
          {/* Name + Status */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <h2 className="anton" style={{fontSize:22,margin:0,lineHeight:1.2}}>{beach.name}</h2>
            <StatusBadge status={beach.status} lang={lang}/>
          </div>
          <p style={{fontSize:13,color:"var(--sg-mid,#686868)",margin:"0 0 8px"}}>
            {beach.commune} · {beach.drive} {LL.drive}
            {userPos&&beach.lat&&<> · {Math.round(haversine(userPos.lat,userPos.lng,beach.lat,beach.lng))} km</>}
          </p>
          {/* BeachScoreBadge removed — confusing score, status already says it all */}

          {/* Status description */}
          {ST[beach.status]&&(
            <p style={{fontSize:12,color:beach._communityOverride?C.gold:beach.beachMemory?C.sarg:ST[beach.status].c,fontWeight:500,margin:"0 0 12px",lineHeight:1.5,
              padding:"6px 10px",background:beach._communityOverride?C.goldBg:beach.beachMemory?C.sargBg:ST[beach.status].bg,borderRadius:8}}>
              {beach._communityOverride
                ?(lang==="en"
                  ?`${beach._communityTotal} visitors report this level on site. Community reports take priority over satellite data.`
                  :`${beach._communityTotal} visiteurs signalent ce niveau sur place. Les signalements terrain priment sur les données satellite.`)
                :beach.beachMemory
                ?(lang==="en"
                  ?"Satellite no longer detects sargassum offshore, but beaching occurred in recent days. Algae can persist on the beach for 7 to 14 days without cleanup."
                  :"Le satellite ne détecte plus de sargasses au large, mais des échouages ont eu lieu ces derniers jours. Les algues peuvent persister sur la plage 7 à 14 jours sans ramassage.")
                :(lang==="en"?ST[beach.status].descEn:ST[beach.status].desc)}
            </p>
          )}

          {/* MethodologyLink removed — technical jargon (IDW, pipeline) doesn't help users */}

          {/* H2S warning */}
          {ST[beach.status]?.h2s&&(
            <div style={{padding:"10px 14px",borderRadius:12,background:C.redBg,
              color:C.red,fontSize:13,fontWeight:600,marginBottom:12,
              display:"flex",alignItems:"center",gap:8}}>
              ⚠️ {LL.h2sWarn}
            </div>
          )}

          {/* ── AXE 2: Beach Reports — 3-level user sargassum reports ── */}
          <BeachReport beach={beach} lang={lang} communityReports={communityReports}/>

          {/* InlinePushCTA removed — OneSignal handles native push prompt */}

          {/* Tags — only parking (actionable info) */}
          {beach.parking&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
              <Tag icon="🅿️" label={LL.parking}/>
            </div>
          )}

          {/* Actions */}
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <a href={wazeUrl} target="_blank" rel="noopener" className="gbtn"
              style={{flex:1,textDecoration:"none",textAlign:"center"}}>{LL.directions}</a>
            <button onClick={()=>{
              const slug=beach.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/-+$/,"")
              const refCode=isPremium?localStorage.getItem("sg_referral_code"):""
              const url=window.location.origin+"/plages/"+slug+(refCode?"?ref="+refCode:"")
              const isRef=!!refCode
              if(navigator.share){track("sg_share",{beach_id:beach.id,method:"native",has_referral:isRef});navigator.share({title:beach.name+" — Sargasses",text:(ST[beach.status]||ST._loading).l+" aujourd'hui",url}).catch(()=>{})}
              else{navigator.clipboard?.writeText(url);track("sg_share",{beach_id:beach.id,has_referral:isRef})}
            }} style={{flex:0,padding:"14px 20px",borderRadius:22,border:"1.5px solid var(--sg-border)",
              background:"var(--sg-card)",cursor:"pointer",fontSize:18,fontFamily:"inherit"}}>
              📤
            </button>
            <button onClick={e=>{onToggleFav(beach.id);e.currentTarget.classList.remove("heart-pop");void e.currentTarget.offsetWidth;e.currentTarget.classList.add("heart-pop")}} style={{
              flex:0,padding:"14px 20px",borderRadius:22,border:isFav?`1.5px solid ${C.red}22`:"1.5px solid var(--sg-border)",
              background:isFav?"rgba(232,82,42,.06)":"var(--sg-card)",cursor:"pointer",fontSize:18,
              fontFamily:"inherit",transition:"all .2s",
            }}>{isFav?"❤️":"🤍"}</button>
          </div>

          {/* Forecast (days 4-7 locked) */}
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:8}}>{LL.forecast}</h3>
          {/* v3: Arrival banner — strongest signal the app provides */}
          {weeklyData?.arrivalDetected&&(
            <div style={{
              padding:"10px 12px",marginBottom:10,borderRadius:12,
              background:"linear-gradient(135deg,rgba(232,143,42,.12),rgba(232,82,42,.08))",
              border:"1px solid rgba(232,143,42,.35)",
              display:"flex",alignItems:"center",gap:10,
            }}>
              <span style={{fontSize:20}}>⚠</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#b35818"}}>
                  {lang==="en"?"Sargassum bank approaching":"Banc de sargasses en approche"}
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:2}}>
                  {lang==="en"
                    ?"Satellite detects a bank drifting toward this beach (1–3 days)."
                    :"Le satellite detecte un banc derivant vers cette plage (1–3 jours)."}
                </div>
              </div>
            </div>
          )}
          <ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick} isPremium={isPremium}
            weatherDaily={weather?.daily||null} weeklyData={weeklyData}/>
          {weeklyData?.forecastDisclaimer&&(
            <div style={{fontSize:10,color:"var(--sg-mid,#999)",marginTop:4,fontStyle:"italic"}}>
              {weeklyData.forecastDisclaimer}
            </div>
          )}

          {/* Weather */}
          {weather&&(
            <>
              <h3 style={{fontSize:15,fontWeight:700,margin:"20px 0 10px"}}>{LL.weather}</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <WeatherCard icon="🌡️" label={LL.temp} value={`${weather.temp}°C`}/>
                <WeatherCard icon="💨" label={LL.wind} value={`${weather.wind} km/h`}/>
                <WeatherCard icon="☀️" label={LL.uv} value={weather.uv}/>
              </div>
              {/* Marine — only when significant */}
              {(()=>{
                const cards=[]
                if(weather.waveHeight!=null&&weather.waveHeight>=1.5)cards.push(<WeatherCard key="w" icon="🌊" label={LL.waves} value={`${weather.waveHeight}m`}/>)
                if(weather.swellHeight!=null&&weather.swellHeight>=1.5)cards.push(<WeatherCard key="s" icon="🏄" label={LL.swell} value={`${weather.swellHeight}m`}/>)
                if(weather.precipitation>0)cards.push(<WeatherCard key="r" icon="💧" label={LL.rain} value={`${weather.precipitation}mm`}/>)
                return cards.length>0?<div style={{display:"grid",gridTemplateColumns:`repeat(${cards.length},1fr)`,gap:10,marginTop:10}}>{cards}</div>:null
              })()}
            </>
          )}

          {/* HistoryChart removed — technical trend, users just want today's status */}

          {/* Nearby beaches */}
          {nearby.length>0&&(
            <>
              <h3 style={{fontSize:15,fontWeight:700,margin:"20px 0 10px"}}>{LL.nearby}</h3>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {nearby.map(nb=>{
                  const nst=ST[nb.status]||ST._loading
                  const nbPhoto=getBeachPhoto(nb)
                  return(
                    <button key={nb.id} onClick={()=>onBeachClick(nb)} style={{
                      display:"flex",alignItems:"center",gap:10,padding:10,
                      borderRadius:14,border:"1px solid var(--sg-border)",
                      background:"var(--sg-card,#fff)",cursor:"pointer",
                      textAlign:"left",fontFamily:"inherit",width:"100%",
                      boxShadow:"0 1px 4px rgba(0,0,0,.04)",
                    }}>
                      <div style={{width:44,height:44,borderRadius:10,flexShrink:0,
                        background:`url(${nbPhoto||satImg(nb.lat,nb.lng,88)}) center/cover`}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nb.name}</div>
                        <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:1}}>
                          {Math.round(nb.dist)} km
                        </div>
                      </div>
                      <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:100,
                        background:nst.bg,color:nst.c}}>{nst.e} {lang==="en"?nst.le:nst.l}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Email capture — at the bottom, after all useful content */}
          <InlineEmailCapture lang={lang}/>
        </div>
      </div>
    </>
  )
}

function Tag({icon,label}){
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4,
      padding:"4px 10px",borderRadius:100,background:"var(--sg-bgD,#F7F5EF)",
      fontSize:12,fontWeight:500,color:"var(--sg-mid,#686868)"}}>
      {icon} {label}
    </span>
  )
}

function WeatherCard({icon,label,value}){
  return(
    <div style={{padding:"12px",borderRadius:14,background:"var(--sg-bgD,#F7F5EF)",
      textAlign:"center",border:"1px solid var(--sg-border,rgba(0,0,0,.04))",
      transition:"transform .2s"}}>
      <div style={{fontSize:20,marginBottom:4,animation:"float-b 3s ease-in-out infinite"}}>{icon}</div>
      <div style={{fontSize:14,fontWeight:700,color:"var(--sg-ink)"}}>{value}</div>
      <div style={{fontSize:11,color:"var(--sg-mid,#686868)"}}>{label}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEACH SCORE — Combined conditions /10 (Clarity: 25.71% map clicks)
   ═══════════════════════════════════════════════════════════════════════════ */
function calcBeachScore(afai,weather){
  // Sargasses (40%): AFAI 0=10, 0.3=7, 0.65=3, 1.0=0
  const sargScore=Math.max(0,Math.min(10,10-afai*(10/1)))
  let parts=[{score:sargScore,weight:0.4}]
  let totalWeight=0.4

  if(weather){
    // Vent (20%): <15=10, 15-25=7, 25-35=4, >35=1
    if(weather.wind!=null){
      const w=weather.wind
      const windScore=w<15?10:w<=25?7:w<=35?4:1
      parts.push({score:windScore,weight:0.2})
      totalWeight+=0.2
    }
    // UV (20%): 0-5=10, 5-8=7, 8-10=4, >10=2
    if(weather.uv!=null){
      const u=weather.uv
      const uvScore=u<=5?10:u<=8?7:u<=10?4:2
      parts.push({score:uvScore,weight:0.2})
      totalWeight+=0.2
    }
    // Vagues (20%): <0.5=10, 0.5-1.5=8, 1.5-2.5=5, >2.5=2
    if(weather.waveHeight!=null){
      const v=weather.waveHeight
      const waveScore=v<0.5?10:v<=1.5?8:v<=2.5?5:2
      parts.push({score:waveScore,weight:0.2})
      totalWeight+=0.2
    }
  }

  // Weighted average, normalized to total available weight
  const raw=parts.reduce((sum,p)=>sum+p.score*(p.weight/totalWeight),0)
  return Math.round(raw*10)/10
}

function getScoreStyle(score){
  if(score>=8)return{color:"#16A34A",bg:"rgba(34,197,94,.12)",border:"rgba(34,197,94,.25)"}
  if(score>=6)return{color:"#B87A00",bg:"rgba(232,168,0,.10)",border:"rgba(232,168,0,.22)"}
  if(score>=4)return{color:"#E07800",bg:"rgba(224,120,0,.10)",border:"rgba(224,120,0,.22)"}
  return{color:"#E8522A",bg:"rgba(232,82,42,.10)",border:"rgba(232,82,42,.22)"}
}

function getScoreLabel(score,lang){
  const LL=T[lang]||T.fr
  if(score>=8)return LL.scoreExcellent
  if(score>=6)return LL.scoreGood
  if(score>=4)return LL.scoreMedium
  return LL.scoreBad
}

function BeachScoreBadge({afai,weather,lang}){
  const score=calcBeachScore(afai,weather)
  const st=getScoreStyle(score)
  const label=getScoreLabel(score,lang)
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,
      padding:"8px 14px 8px 8px",borderRadius:16,
      background:st.bg,border:`1.5px solid ${st.border}`,marginBottom:12}}>
      <div style={{width:48,height:48,borderRadius:"50%",
        background:`conic-gradient(${st.color} ${score*36}deg, rgba(0,0,0,.06) ${score*36}deg)`,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <div style={{width:38,height:38,borderRadius:"50%",background:"var(--sg-card,#fff)",
          display:"flex",alignItems:"center",justifyContent:"center",
          flexDirection:"column",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,lineHeight:1,color:st.color}}>{score}</span>
          <span style={{fontSize:8,color:"var(--sg-mid,#686868)",fontWeight:600}}>/10</span>
        </div>
      </div>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:st.color}}>{label}</div>
        <div style={{fontSize:11,color:"var(--sg-mid,#686868)"}}>{(T[lang]||T.fr).beachScore}</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   WEATHER ICON helper (for 7-day forecast)
   ═══════════════════════════════════════════════════════════════════════════ */
function getDayWeatherIcon(precipMm,cloudPct,windKmh){
  if(windKmh>30)return"\uD83D\uDCA8" // wind
  if(precipMm>2)return"\uD83C\uDF27\uFE0F" // rain
  if(cloudPct>60)return"\uD83C\uDF24\uFE0F" // partly cloudy
  return"\u2600\uFE0F" // sun
}

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORY CHART — Sparkline SVG showing AFAI trend (7-30 days)
   ═══════════════════════════════════════════════════════════════════════════ */
function HistoryChart({beachId,historyData,lang}){
  const LL=T[lang]||T.fr
  const points=useMemo(()=>{
    if(!historyData||!beachId)return[]
    const sargId=BEACH_TO_SARG[beachId]
    if(!sargId)return[]
    return historyData.map(day=>{
      const entry=day.levels.find(l=>l.id===sargId)
      return entry?{date:day.date,afai:entry.afai,status:entry.status}:null
    }).filter(Boolean)
  },[beachId,historyData])

  if(!points.length)return null

  const W=280,H=60,PAD=4
  const max=Math.max(.15,...points.map(p=>p.afai))
  const xStep=(W-PAD*2)/(Math.max(points.length-1,1))

  const coords=points.map((p,i)=>({
    x:PAD+i*xStep,
    y:PAD+(1-p.afai/max)*(H-PAD*2),
    afai:p.afai,status:p.status,date:p.date,
  }))

  const pathD=coords.map((c,i)=>`${i===0?"M":"L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ")
  const areaD=pathD+` L${coords[coords.length-1].x.toFixed(1)} ${H-PAD} L${coords[0].x.toFixed(1)} ${H-PAD} Z`

  // Status color for last point
  const last=coords[coords.length-1]
  const first=coords[0]
  const lineColor=last.status==="avoid"?C.red:last.status==="moderate"?C.amber:C.teal

  // Trend arrow
  const delta=points[points.length-1].afai-points[0].afai
  const trend=delta>0.05?"up":delta<-0.05?"down":"stable"
  const trendIcon=trend==="up"?"\u2197\uFE0F":trend==="down"?"\u2198\uFE0F":"\u27A1\uFE0F"

  // Date labels
  const firstDate=points[0].date.slice(5) // "03-30"
  const lastDate=points[points.length-1].date.slice(5)

  return(
    <div style={{marginTop:16}}>
      <h3 style={{fontSize:15,fontWeight:700,margin:"0 0 8px",display:"flex",alignItems:"center",gap:6}}>
        {LL.history} <span style={{fontSize:13}}>{trendIcon}</span>
      </h3>
      <div style={{background:"var(--sg-cardS,#FAFAFA)",borderRadius:12,padding:"12px 14px",
        border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{display:"block"}}>
          {/* Background zones — aligned with NOAA SIR thresholds (0.15/0.40) */}
          <rect x={0} y={0} width={W} height={H*0.15} fill="rgba(232,82,42,.04)" rx={0}/>
          <rect x={0} y={H*0.15} width={W} height={H*0.25} fill="rgba(184,122,0,.04)" rx={0}/>
          <rect x={0} y={H*0.40} width={W} height={H*0.60} fill="rgba(34,197,94,.04)" rx={0}/>
          {/* Threshold lines */}
          <line x1={0} y1={PAD+(1-0.15/max)*(H-PAD*2)} x2={W} y2={PAD+(1-0.15/max)*(H-PAD*2)}
            stroke="rgba(184,122,0,.2)" strokeDasharray="3 3" strokeWidth={0.5}/>
          <line x1={0} y1={PAD+(1-0.40/max)*(H-PAD*2)} x2={W} y2={PAD+(1-0.40/max)*(H-PAD*2)}
            stroke="rgba(232,82,42,.2)" strokeDasharray="3 3" strokeWidth={0.5}/>
          {/* Area fill */}
          <path d={areaD} fill={lineColor} opacity={0.1}/>
          {/* Line */}
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          {/* Dots */}
          {coords.map((c,i)=>{
            const dotColor=c.status==="avoid"?C.red:c.status==="moderate"?C.amber:C.teal
            return <circle key={i} cx={c.x} cy={c.y} r={i===coords.length-1?3.5:2} fill={dotColor} stroke="#fff" strokeWidth={1}/>
          })}
        </svg>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
          <span style={{fontSize:10,color:"var(--sg-mid,#686868)"}}>{firstDate}</span>
          <span style={{fontSize:10,color:"var(--sg-mid,#686868)",fontWeight:600}}>
            {LL.historyDays.replace("{n}",points.length)}
          </span>
          <span style={{fontSize:10,color:"var(--sg-mid,#686868)"}}>{lastDate}</span>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEARCH BAR — floating pill (14 clics Clarity)
   ═══════════════════════════════════════════════════════════════════════════ */
function SearchBar({value,onChange,lang}){
  const LL=T[lang]||T.fr
  return(
    <div style={{position:"relative"}}>
      <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
        fontSize:16,opacity:.5}}>🔍</span>
      <input type="text" value={value} onChange={e=>onChange(e.target.value)}
        placeholder={LL.search}
        style={{
          width:"100%",padding:"12px 16px 12px 42px",borderRadius:100,
          border:"1.5px solid var(--sg-border,rgba(0,0,0,.08))",
          background:"var(--sg-card,#fff)",color:"var(--sg-ink)",
          fontSize:14,fontFamily:"inherit",outline:"none",
          boxShadow:"0 2px 12px rgba(0,0,0,.06)",
          transition:"border-color .2s",
        }}
        onFocus={e=>e.target.style.borderColor=C.gold}
        onBlur={e=>e.target.style.borderColor="var(--sg-border,rgba(0,0,0,.08))"}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEACH LIST VIEW — alternative to map (tab Plages)
   ═══════════════════════════════════════════════════════════════════════════ */
function BeachListView({beaches,onBeachClick,favorites,lang,imageMap}){
  const LL=T[lang]||T.fr
  const nClean=beaches.filter(b=>b.status==="clean").length
  return(
    <div style={{height:"100%",overflowY:"auto",
      paddingTop:"calc(140px + env(safe-area-inset-top,0px))",paddingBottom:"calc(70px + env(safe-area-inset-bottom,12px))",
      background:"var(--sg-bg,#FDFCF7)"}}>
      <div style={{padding:"8px 16px 0",fontSize:13,color:"var(--sg-mid,#686868)",fontWeight:500}}>
        {LL.nClean.replace("{n}",nClean)} / {beaches.length}
      </div>
      {beaches.length===0?(
        <div style={{padding:"60px 32px",textAlign:"center",animation:"fadeIn .3s ease"}}>
          <div style={{fontSize:48,marginBottom:12}}>🏖️</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",marginBottom:6}}>
            {lang==="en"?"No beaches match":"Aucune plage trouvée"}
          </div>
          <div style={{fontSize:13,color:"var(--sg-mid,#686868)",lineHeight:1.5}}>
            {lang==="en"?"Try a different filter or search.":"Essaie un autre filtre ou une autre recherche."}
          </div>
        </div>
      ):(
      <div style={{padding:"8px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {beaches.map(b=>{
          const photo=getBeachPhoto(b)
          return(
            <button key={b.id} onClick={()=>onBeachClick(b)} style={{
              display:"flex",alignItems:"center",gap:12,padding:12,
              borderRadius:16,border:"1px solid var(--sg-border)",
              background:"var(--sg-card,#fff)",cursor:"pointer",
              textAlign:"left",fontFamily:"inherit",width:"100%",
              boxShadow:"0 2px 8px rgba(0,0,0,.04)",
              transition:"all .2s cubic-bezier(.22,1,.36,1)",
              animation:"slideUp .3s cubic-bezier(.22,1,.36,1) backwards",
              animationDelay:`${Math.min(b._dist||0,10)*20}ms`,
            }}>
              {/* Photo thumbnail */}
              <div style={{width:64,height:48,borderRadius:10,
                background:`url(${photo||satImg(b.lat,b.lng,128)}) center 40%/cover`,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,whiteSpace:"nowrap",
                  overflow:"hidden",textOverflow:"ellipsis",color:"var(--sg-ink)"}}>
                  {favorites.includes(b.id)?"❤️ ":""}{b.name}
                </div>
                <div style={{fontSize:12,color:"var(--sg-mid,#686868)",marginTop:2}}>
                  {b.commune} · {b.drive} {LL.drive}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <StatusBadge status={b.status} lang={lang}/>
                <AfaiBadge afai={b.afai}/>
              </div>
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ONBOARDING — Inline coachmark (progressive disclosure, no overlay)
   Map visible immediately. Small card guides user to tap a marker.
   ═══════════════════════════════════════════════════════════════════════════ */
function Onboarding({onDone,island="mq",lang="fr"}){
  const[step,setStep]=useState(0)
  const isMQ=island==="mq"

  useEffect(()=>{
    // Auto-advance from welcome (step 0) to hint (step 1) after 6s
    if(step===0){const t=setTimeout(()=>setStep(1),6000);return()=>clearTimeout(t)}
    // Auto-dismiss hint after 8s
    if(step===1){const t=setTimeout(()=>{s("sg_onb",1);onDone()},8000);return()=>clearTimeout(t)}
  },[step,onDone])

  const dismiss=useCallback(()=>{
    track("sg_onb_skip",{from_step:step})
    s("sg_onb",1)
    onDone()
  },[onDone,step])

  return(
    <div style={{position:"absolute",
      top:"max(108px, calc(env(safe-area-inset-top,12px) + 100px))",
      left:12,right:12,zIndex:750,pointerEvents:"none"}}>

      {step===0&&(
        <div style={{pointerEvents:"auto",
          background:"rgba(255,255,255,.96)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
          borderRadius:18,padding:"16px 18px",
          boxShadow:"0 8px 32px rgba(0,0,0,.12),0 0 0 1px rgba(232,168,0,.12)",
          animation:"slideUp .4s cubic-bezier(.22,1,.36,1)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",flexShrink:0,
              animation:"dot-pulse 2s ease-in-out infinite"}}/>
            <span style={{fontSize:12,fontWeight:700,color:C.ink}}>
              <em style={{fontStyle:"normal",color:C.amber,fontWeight:700}}>
                {isMQ?"53 plages":"82 plages"}
              </em> {lang==="en"?"monitored live":"surveillées en temps réel"}
            </span>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1,
            textTransform:"uppercase",color:C.ink,marginBottom:8}}>
            <span style={{color:C.teal}}>{lang==="en"?"Green":"Vert"}</span> = {lang==="en"?"clean":"propre"}.{" "}
            <span style={{color:C.red}}>{lang==="en"?"Red":"Rouge"}</span> = sargasses.
          </div>
          <p style={{fontSize:13,color:C.mid,margin:"0 0 12px",lineHeight:1.5}}>
            {lang==="en"
              ?"Tap a beach on the map to see real-time conditions."
              :"Touche une plage sur la carte pour voir son état en temps réel."}
          </p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setStep(1)} style={{
              flex:1,padding:"11px",borderRadius:12,border:"none",cursor:"pointer",
              background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
              fontFamily:"inherit",fontSize:13,fontWeight:700,color:C.ink,
              boxShadow:"0 4px 16px rgba(232,168,0,.3)"}}>
              {lang==="en"?"Got it":"Compris"}
            </button>
          </div>
        </div>
      )}

      {step===1&&(
        <div style={{pointerEvents:"auto",
          background:"rgba(255,255,255,.92)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
          borderRadius:14,padding:"10px 14px",
          boxShadow:"0 4px 16px rgba(0,0,0,.1),0 0 0 1px rgba(0,158,142,.1)",
          display:"flex",alignItems:"center",gap:8,
          animation:"slideUp .3s cubic-bezier(.22,1,.36,1)"}}>
          <span style={{fontSize:18}}>👆</span>
          <span style={{fontSize:12,fontWeight:600,color:C.ink}}>
            {lang==="en"?"Tap a ":"Touche un "}{" "}
            <span style={{color:C.green}}>●</span>{" "}
            <span style={{color:C.amber}}>●</span>{" "}
            <span style={{color:C.red}}>●</span>{" "}
            {lang==="en"?"to see details":"pour voir les détails"}
          </span>
          <button onClick={dismiss} style={{
            background:"none",border:"none",color:C.mid,cursor:"pointer",
            fontSize:14,padding:4,marginLeft:"auto",flexShrink:0}}>✕</button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEACH PICKER — "Quelle est ta plage ?" (new user onboarding → 1 tap)
   Design: onboarding-final.html level — floating cards, gold accents, shine
   ═══════════════════════════════════════════════════════════════════════════ */
const POPULAR_BEACHES={
  mq:["mq001","mq014","mq011","mq016","mq024"],
  gp:["gp009","gp012","gp031","gp010","gp005"]
}

function BeachPicker({island,allBeaches,onSelect,lang,userPos,onDismiss}){
  const ids=POPULAR_BEACHES[island]||POPULAR_BEACHES.mq
  let picks=ids.map(id=>allBeaches.find(b=>b.id===id)).filter(Boolean)
  if(userPos&&picks.length){
    picks=picks.map(b=>({...b,_d:haversine(userPos.lat,userPos.lng,b.lat,b.lng)}))
      .sort((a,b)=>a._d-b._d)
  }
  const isMQ=island==="mq"

  return(
    <div onClick={e=>{if(e.target===e.currentTarget&&onDismiss)onDismiss()}} style={{
      position:"absolute",top:0,left:0,right:0,bottom:0,zIndex:750,
      display:"flex",flexDirection:"column",
      background:"linear-gradient(180deg,#0D1E1C 0%,#0A1714 100%)",
      animation:"fadeIn .3s ease",overflow:"auto",
    }}>
      {/* Ambient orbs */}
      <div style={{position:"absolute",top:-60,right:-40,width:220,height:220,borderRadius:"50%",
        background:"radial-gradient(circle,rgba(232,168,0,.12) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:200,left:-60,width:180,height:180,borderRadius:"50%",
        background:"radial-gradient(circle,rgba(0,158,142,.08) 0%,transparent 70%)",pointerEvents:"none"}}/>

      {/* Top bar */}
      <div style={{padding:"max(16px,env(safe-area-inset-top)) 22px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,
            background:"conic-gradient(from -10deg,#FFE898 0deg 25deg,#E8A800 25deg 65deg,#FFD040 65deg 110deg,#B87A00 110deg 155deg,#FFE07A 155deg 195deg,#E09000 195deg 240deg,#FFC72C 240deg 285deg,#B07000 285deg 325deg,#FFE898 325deg 360deg)",
            animation:"spin 20s linear infinite",
            boxShadow:"0 2px 10px rgba(232,168,0,.35)",
          }}/>
          <span style={{fontSize:13,fontWeight:700,letterSpacing:".06em",color:"#fff",
            fontFamily:"'Anton',sans-serif",textTransform:"uppercase"}}>
            SARGASSES.{isMQ?"MQ":"GP"}
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#22C55E",
            animation:"dot-pulse 2s ease-in-out infinite"}}/>
          <span style={{fontSize:10.5,fontWeight:600,color:"rgba(255,255,255,.5)"}}>{lang==="en"?"Live":"En direct"}</span>
        </div>
      </div>

      {/* Headline */}
      <div style={{padding:"28px 22px 0"}}>
        <div style={{fontSize:12,fontStyle:"italic",color:"rgba(255,255,255,.4)",marginBottom:6}}>
          {lang==="en"?"Sargassum or not — know before you go.":"Sargasses ou pas — sache avant de partir."}
        </div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:42,lineHeight:.9,
          textTransform:"uppercase",color:"#fff",letterSpacing:"-.02em"}}>
          {lang==="en"?<>What's <span style={{color:C.tealL}}>your</span><br/>beach?</>
            :<>Quelle est<br/><span style={{color:C.tealL}}>ta</span> plage ?</>}
        </div>
        <p style={{fontSize:13.5,color:"rgba(255,255,255,.5)",margin:"8px 0 0",lineHeight:1.5}}>
          {lang==="en"
            ?"We'll tell you every day if it's clear."
            :"On te dit chaque jour si tu peux y aller."}
        </p>
      </div>

      {/* Satellite inline badge */}
      <div style={{padding:"12px 22px 0"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,
          background:"rgba(0,158,142,.07)",border:"1px solid rgba(0,158,142,.12)",
          borderRadius:100,padding:"5px 12px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,bottom:0,left:0,width:60,
            background:"linear-gradient(90deg,transparent,rgba(0,158,142,.1),transparent)",
            animation:"satellite-scan 3s ease-in-out infinite"}}/>
          <span style={{fontSize:9.5,fontWeight:700,color:C.tealL,position:"relative"}}>COPERNICUS MARINE</span>
          <span style={{fontSize:9,color:"rgba(255,255,255,.35)",fontWeight:500,position:"relative"}}>
            {lang==="en"?"Updated today":"Mis à jour aujourd'hui"}
          </span>
        </div>
      </div>

      {/* Beach options */}
      <div style={{padding:"16px 22px 0",display:"flex",flexDirection:"column",gap:7}}>
        {picks.map(b=>{
          const st=ST[b.status]||ST._loading
          const isC=b.status==="clean"
          const borderC=!b.status?"rgba(100,100,100,.15)":isC?"rgba(34,197,94,.15)":b.status==="avoid"?"rgba(232,82,42,.15)":"rgba(232,168,0,.15)"
          const badgeBg=!b.status?"rgba(100,100,100,.1)":isC?"rgba(34,197,94,.15)":b.status==="avoid"?"rgba(232,82,42,.2)":"rgba(232,168,0,.15)"
          const badgeColor=!b.status?"#999":isC?"#4ADE80":b.status==="avoid"?"#FF8066":C.goldL
          return(
            <button key={b.id} onClick={()=>{track("sg_beach_pick",{beach_id:b.id});onSelect(b.id)}}
              style={{
                display:"flex",alignItems:"center",gap:12,
                background:"rgba(255,255,255,.05)",
                border:`1px solid ${borderC}`,
                borderRadius:16,padding:"13px 14px",cursor:"pointer",
                fontFamily:"inherit",textAlign:"left",width:"100%",
                boxShadow:"0 2px 12px rgba(0,0,0,.15)",
                transition:"all .2s",
              }}>
              <div style={{width:36,height:36,borderRadius:12,flexShrink:0,
                background:isC?"linear-gradient(135deg,#D6F5EF,#A8EDE4)":"linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.02))",
                display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:st.c,
                  border:"2px solid rgba(255,255,255,.8)",boxShadow:`0 1px 6px ${st.c}50`,position:"relative",zIndex:2}}/>
                <div style={{position:"absolute",width:12,height:12,borderRadius:"50%",
                  border:`2px solid ${st.c}30`,animation:"pin-pulse 2.5s ease-out infinite"}}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{b.name}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",display:"flex",alignItems:"center",gap:6}}>
                  {b.commune}{b._d!=null?` · ${Math.round(b._d)} km`:""}
                </div>
              </div>
              <span style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:100,
                background:badgeBg,color:badgeColor}}>
                {st.l}
              </span>
            </button>
          )
        })}
      </div>

      {/* Micro proof footer */}
      <div style={{padding:"16px 22px max(20px,calc(env(safe-area-inset-bottom,12px) + 12px))",
        textAlign:"center",fontSize:10.5,color:"rgba(255,255,255,.25)",
        display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        {lang==="en"?"Free":"Gratuit"}
        <span style={{width:3,height:3,borderRadius:"50%",background:"rgba(255,255,255,.15)"}}/>
        {lang==="en"?"No signup":"Sans inscription"}
        <span style={{width:3,height:3,borderRadius:"50%",background:"rgba(255,255,255,.15)"}}/>
        {lang==="en"?"Updated daily":"Mis à jour chaque jour"}
      </div>
    </div>
  )
}

/* HeroCard removed — iterated 3 versions (transparent, dark opaque, status strip),
   none worked visually on top of the satellite map. Keeping BeachPicker only.
   TODO: revisit when UX flow for "my beach status" is decided. */

/* ═══════════════════════════════════════════════════════════════════════════
   PUSH PRIMER — contextual soft prompt before OneSignal native dialog.
   Why: ga4-diagnose 2026-04-12 measured opt-in = 23/376 = 6%. Industry best
   practice (OneSignal blog, Urban Airship 2025 report): a contextual soft
   prompt before the native browser dialog lifts opt-in 2-3×. The native
   prompt cannot be re-shown if denied, so we filter the audience first.
   Render rules: top banner, slideDown, dismissible, 7-day cooldown.
   ═══════════════════════════════════════════════════════════════════════════ */
function PushPrimer({lang,onAccept,onDismiss}){
  return(
    <div style={{
      position:"fixed",top:0,left:0,right:0,zIndex:780,
      paddingTop:"env(safe-area-inset-top, 0px)",
      background:"var(--sg-card,#fff)",
      boxShadow:"0 4px 20px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04)",
      animation:"sg-threat-slide .4s cubic-bezier(.22,1,.36,1)",
    }}>
      <div style={{
        maxWidth:480,margin:"0 auto",padding:"12px 14px",
        display:"flex",alignItems:"center",gap:10,
      }}>
        <div style={{fontSize:22,flexShrink:0}}>{"\ud83d\udd14"}</div>
        <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:600,
          color:"var(--sg-ink,#0D0D0D)",lineHeight:1.3}}>
          {lang==="en"
            ?"Get notified when your favorite beaches change."
            :"Sois pr\u00e9venu si tes plages favorites changent."}
        </div>
        <button onClick={onAccept} style={{
          background:"#16a34a",color:"#fff",border:"none",
          padding:"9px 14px",borderRadius:10,fontSize:13,fontWeight:700,
          cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",
          minHeight:36,
        }}>
          {lang==="en"?"Activate":"Activer"}
        </button>
        <button onClick={onDismiss} aria-label={lang==="en"?"Dismiss":"Plus tard"}
          style={{
            background:"transparent",border:"none",padding:"8px 4px",
            fontSize:18,color:"var(--sg-mid,#686868)",cursor:"pointer",
            flexShrink:0,minHeight:36,minWidth:32,
          }}>
          {"\u2715"}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DAILY RECO STRIP — "Ta meilleure plage maintenant" — smart forecast pattern
   Data-driven decision (2026-04-10 audit premium):
   • GSC intent = "aujourd'hui / temps réel" (162 clics top query, 0 sur "weekend")
   • Funnel 2% CTA → value prop cassée, angle "7j débloqués" ne matche pas
   • Clarity carte = 25.71% clics → la carte reste le canvas principal
   • Pattern: Weather Underground Smart Forecast + Windy + card mobile 2026
   Gratuit : nom visible + reco principale. Premium : alternatives dépliables.
   ═══════════════════════════════════════════════════════════════════════════ */
function windCompass(deg,lang){
  if(deg==null)return""
  const dirs=lang==="en"?["N","NE","E","SE","S","SW","W","NW"]:["N","NE","E","SE","S","SO","O","NO"]
  return dirs[Math.round(deg/45)%8]
}

function DailyRecoStrip({allBeaches,sargData,island,lang,isPremium,onBeachClick,userPos,onPremiumClick,communityReports}){
  const[expanded,setExpanded]=useState(false)

  // Score NOW + near-term forecast. Signals used (v2, 2026-04-10):
  // • status today (clean/moderate/avoid) — primary
  // • AFAI continuous value — differentiates 0.05 vs 0.14 (both "clean")
  // • forecast J+1 status — penalty if degrading tomorrow
  // • trend drift (up/stable/down) — penalty if sargasses drifting toward beach
  // • confidence — dampens unreliable picks
  // • beach memory — persistent echouage penalty
  // • community reports — terrain wins over satellite when ≥3 reports differ
  // • distance (geoloc) OR drive time fallback — proximity wins ties
  // • amenities (kids, parking)
  const picks=useMemo(()=>{
    if(!allBeaches?.length)return[]
    const islandBeaches=allBeaches.filter(b=>b.island===island&&b.status&&b.status!=="_loading")
    if(!islandBeaches.length)return[]
    const scored=islandBeaches.map(b=>{
      const dist=userPos?haversine(userPos.lat,userPos.lng,b.lat,b.lng):null
      const sargId=BEACH_TO_SARG[b.id]
      const weekly=sargId&&sargData?.weekly?.[sargId]
      const enriched=sargData?._enrichedWeekly?.[`_interp_${b.id}`]
      const activeWeekly=weekly||enriched
      const fc1=activeWeekly?.forecast?.[1]
      const fc3=activeWeekly?.forecast?.[3]
      const drift=activeWeekly?.drift||null
      const arrivalDetected=!!activeWeekly?.arrivalDetected
      const arrivalStrength=activeWeekly?.arrivalStrength||0
      let score=0
      // 1. Status today (dominant)
      if(b.status==="clean")score+=100
      else if(b.status==="moderate")score+=40
      else score-=50
      // 2. Continuous AFAI — reward very clean waters (0.05) over borderline (0.14)
      if(typeof b.afai==="number")score-=b.afai*60 // 0.05→-3, 0.14→-8, 0.42→-25
      // 3. Forecast J+1 — heavy penalty if tomorrow degrades
      if(fc1){
        if(fc1.status==="avoid")score-=35
        else if(fc1.status==="moderate")score-=15
      }
      // 3b. v3: Forecast J+3 — bigger penalty if 3-day outlook degrades
      if(fc3){
        if(fc3.status==="avoid")score-=25
        else if(fc3.status==="moderate")score-=12
      }
      // 4. Trend drift — banc approaching is bad news
      if(drift==="up")score-=20
      else if(drift==="down")score+=5
      // 4b. v3: Arrival signal from banks — real incoming threat
      if(arrivalDetected)score-=Math.round(arrivalStrength*200) // 0.03→-6, 0.08→-16
      // 5. Confidence dampener — low confidence reduces the score's signal
      const conf=(activeWeekly?.forecast?.[0]?.confidence)||60
      score=score*(0.6+Math.min(conf,100)/250) // conf 60→0.84, 100→1.0, 20→0.68
      // 6. Community reports override (terrain wins)
      const cReports=communityReports?.[b.id]||communityReports?.[sargId]
      if(cReports&&cReports.total>=3){
        const avoidPct=cReports.avoid/cReports.total
        const modPct=cReports.moderate/cReports.total
        if(avoidPct>=0.5)score-=50
        else if(modPct>=0.5)score-=20
      }
      // 7. Beach memory (recent echouage still on sand)
      if(b.beachMemory)score-=25
      // 8. Distance — geoloc real distance or drive time fallback
      if(dist!=null)score-=Math.min(dist,50)*1.2
      else if(typeof b.drive==="number")score-=Math.min(b.drive,90)*0.6 // 18min→-11, 52min→-31
      // 9. Amenities (tie-breakers)
      if(b.kids)score+=5
      if(b.parking)score+=3
      return{...b,_score:Math.round(score*10)/10,_dist:dist,_fc1:fc1,_fc3:fc3,_drift:drift,_conf:conf,_communityReports:cReports,_arrivalDetected:arrivalDetected,_arrivalStrength:arrivalStrength}
    })
    scored.sort((a,b)=>b._score-a._score)
    return scored.slice(0,3)
  },[allBeaches,island,userPos,sargData,communityReports])

  const top=picks[0]
  const weather=useWeather(top)
  if(!top)return null

  const topSt=ST[top.status]||ST._loading

  // Verdict text — Smart Forecast pattern (Weather Underground)
  // v3 priorities: arrival > community > memory > forecast J+3 > J+1 > drift > weather
  const verdict=(()=>{
    const fc1=top._fc1,fc3=top._fc3,drift=top._drift
    // v3: arrival signal is the HIGHEST actionable priority
    if(top._arrivalDetected&&top.status==="clean"){
      return lang==="en"?"Clean now — sargassum bank approaching":"Propre mais banc en approche"
    }
    if(top._communityReports&&top._communityReports.total>=3){
      return lang==="en"?`${top._communityReports.total} visitor reports on site`:`${top._communityReports.total} signalements visiteurs sur place`
    }
    if(top.beachMemory)return lang==="en"?"Recent beaching — check on site":"Mémoire échouage — vérifie sur place"
    if(top.status==="avoid")return lang==="en"?"Difficult conditions island-wide":"Conditions difficiles partout"
    if(top.status==="moderate")return lang==="en"?"Moderate — verify on site":"Modéré — vérifie sur place"
    // Top is clean — look ahead
    if(fc1&&fc1.status&&fc1.status!=="clean"){
      return lang==="en"?`Clean today but ${fc1.status} tomorrow`:`Propre aujourd'hui, ${statusFromAfai(fc1.afai)==="moderate"?"modéré":"alerte"} demain`
    }
    if(fc3&&fc3.status&&fc3.status!=="clean"){
      return lang==="en"?`Clean now — ${fc3.status} in 3 days`:`Propre — ${statusFromAfai(fc3.afai)==="moderate"?"modéré":"alerte"} dans 3 jours`
    }
    if(drift==="up"){
      return lang==="en"?"Clean now but sargassum drifting in":"Propre mais sargasses en approche"
    }
    if(weather?.precipitation>5){
      return lang==="en"?`Clean but rain ${Math.round(weather.precipitation)}mm today`:`Propre mais pluie ${Math.round(weather.precipitation)}mm aujourd'hui`
    }
    if(weather?.wind!=null&&weather.windDir!=null){
      const wd=windCompass(weather.windDir,lang)
      return lang==="en"?`Wind ${wd} ${weather.wind}km/h · clean & stable`:`Vent ${wd} ${weather.wind}km/h · propre et stable`
    }
    return lang==="en"?"Stable conditions":"Conditions stables"
  })()

  const distLabel=top._dist!=null?`${Math.round(top._dist)} km`:""
  const driveLabel=top.drive?`${top.drive} min`:""

  const handleMainClick=()=>{
    track("sg_daily_reco_main_click",{beach_id:top.id,status:top.status,is_premium:isPremium})
    onBeachClick(top)
  }
  const handleAltClick=(e)=>{
    e.stopPropagation()
    if(isPremium){
      setExpanded(!expanded)
      track("sg_daily_reco_alt_toggle",{expanded:!expanded})
    }else{
      track("sg_daily_reco_lock_click",{source:"alternatives"})
      onPremiumClick("daily_reco")
    }
  }
  const handleWazeClick=(e)=>{
    e.stopPropagation()
    track("sg_daily_reco_waze",{beach_id:top.id})
  }
  const wazeUrl=`https://waze.com/ul?ll=${top.lat},${top.lng}&navigate=yes`

  return(
    <div style={{
      position:"fixed",
      // Align with BottomNav height: 8px top + ~40px button + max(12, safe-area) bottom = 60 + max(12, safe-area)
      // +12px gap above the nav
      bottom:"calc(60px + max(12px, env(safe-area-inset-bottom,0px)) + 12px)",
      left:12,right:12,zIndex:720,
      maxWidth:480,margin:"0 auto",
      background:"var(--sg-card,#fff)",
      borderRadius:16,
      boxShadow:"0 4px 20px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04)",
      overflow:"hidden",
      animation:"slideUp .4s cubic-bezier(.22,1,.36,1)",
    }}>
      {/* Main row — tap opens beach sheet */}
      <div onClick={handleMainClick} style={{
        padding:"11px 14px",cursor:"pointer",
        display:"flex",alignItems:"center",gap:12,
      }}>
        <div style={{
          width:44,height:44,borderRadius:14,flexShrink:0,
          background:topSt.bg,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:22,
        }}>{topSt.e}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9.5,fontWeight:700,color:"var(--sg-mid,#686868)",letterSpacing:".05em",
            textTransform:"uppercase",marginBottom:2}}>
            {lang==="en"?"Best beach now":"Ta meilleure plage maintenant"}
          </div>
          <div style={{fontSize:15,fontWeight:700,color:"var(--sg-ink,#0D0D0D)",lineHeight:1.2,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {top.name}
          </div>
          <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:2,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {distLabel&&<>{distLabel}</>}
            {distLabel&&driveLabel&&<> · </>}
            {driveLabel&&<>{driveLabel}</>}
            {verdict&&(distLabel||driveLabel)&&<> · </>}
            {verdict}
          </div>
        </div>
      </div>
      {/* Action row */}
      <div style={{
        display:"flex",gap:8,padding:"0 14px 12px",
      }}>
        <a href={wazeUrl} target="_blank" rel="noopener" onClick={handleWazeClick}
          style={{
            flex:"1 1 auto",minWidth:0,textDecoration:"none",textAlign:"center",
            background:"var(--sg-ink,#0D0D0D)",color:"#fff",
            padding:"10px 12px",borderRadius:10,
            fontSize:13,fontWeight:700,fontFamily:"inherit",
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
          }}>
          {lang==="en"?"Go there":"Y aller"}
        </a>
        {picks.length>1&&(
          <button onClick={handleAltClick} style={{
            flex:"1 1 auto",minWidth:0,
            background:isPremium?"var(--sg-bgD,#F7F5EF)":C.goldBg,
            border:`1px solid ${isPremium?"rgba(0,0,0,.08)":C.gold}`,
            color:"var(--sg-ink,#0D0D0D)",
            padding:"10px 12px",borderRadius:10,cursor:"pointer",
            fontSize:13,fontWeight:700,fontFamily:"inherit",
            display:"flex",alignItems:"center",justifyContent:"center",gap:4,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
          }}>
            {isPremium
              ?(expanded
                ?(lang==="en"?"Less ▲":"Moins ▲")
                :(lang==="en"?`+${picks.length-1} options`:`+${picks.length-1} options`))
              :<>🔒 {lang==="en"?`+${picks.length-1} options`:`+${picks.length-1} options`}</>}
          </button>
        )}
      </div>
      {/* Expanded alternatives — premium only */}
      {isPremium&&expanded&&picks.length>1&&(
        <div style={{
          borderTop:"1px solid var(--sg-border,rgba(0,0,0,.06))",
          background:"var(--sg-bgD,#FAFAFA)",
          maxHeight:200,overflowY:"auto",
        }}>
          {picks.slice(1).map(alt=>{
            const altSt=ST[alt.status]||ST._loading
            const altDist=alt._dist!=null?`${Math.round(alt._dist)} km`:""
            const altDrive=alt.drive?`${alt.drive} min`:""
            return(
              <button key={alt.id} onClick={()=>{
                track("sg_daily_reco_alt_click",{beach_id:alt.id,status:alt.status})
                onBeachClick(alt)
              }} style={{
                display:"flex",alignItems:"center",gap:10,
                padding:"10px 14px",width:"100%",
                background:"transparent",border:"none",
                borderBottom:"1px solid var(--sg-border,rgba(0,0,0,.06))",
                cursor:"pointer",fontFamily:"inherit",textAlign:"left",
              }}>
                <span style={{fontSize:16,flexShrink:0}}>{altSt.e}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--sg-ink,#0D0D0D)",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {alt.name}
                  </div>
                  <div style={{fontSize:10.5,color:"var(--sg-mid,#686868)"}}>
                    {altDist}{altDist&&altDrive&&" · "}{altDrive}
                  </div>
                </div>
                <span style={{fontSize:9.5,fontWeight:700,padding:"3px 8px",borderRadius:100,
                  background:altSt.bg,color:altSt.c,flexShrink:0}}>
                  {lang==="en"?altSt.le:altSt.l}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEASON BANNER — subtle top bar during high season (April-September)
   sessionStorage: shows once per session, dismissible
   ═══════════════════════════════════════════════════════════════════════════ */
function SeasonBanner({lang}){
  const[visible,setVisible]=useState(()=>{
    if(SARGASSES_SEASON!=="high")return false
    try{return!sessionStorage.getItem("sg_season_banner_dismissed")}catch{return true}
  })
  useEffect(()=>{if(visible)track("sg_season_banner_view")},[visible])
  if(!visible)return null
  return(
    <div style={{position:"absolute",top:0,left:0,right:0,zIndex:800,
      background:"rgba(232,168,0,.92)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      padding:"6px 32px 6px 12px",fontSize:11,fontWeight:600,color:C.ink}}>
      <span>{lang==="en"
        ?"Sargasses season active \u2014 forecasts are more reliable right now"
        :"Saison sargasses active \u2014 les pr\u00e9visions sont plus fiables en ce moment"}</span>
      <button onClick={()=>{
        setVisible(false)
        try{sessionStorage.setItem("sg_season_banner_dismissed","1")}catch{}
        track("sg_season_banner_dismiss")
      }} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
        background:"none",border:"none",cursor:"pointer",fontSize:13,
        color:"rgba(13,13,13,.5)",padding:4,lineHeight:1}}>&#x2715;</button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   WEEKEND BANNER — visible on map, teases premium value
   ═══════════════════════════════════════════════════════════════════════════ */
function WeekendBanner({allBeaches,sargData,island,lang,isPremium,onPremiumClick,onBeachClick,userPos}){
  const[dismissed,setDismissed]=useState(false)
  // Don't show if premium, dismissed, or no data
  if(isPremium||dismissed||!sargData?.weekly)return null
  const LL=T[lang]||T.fr
  // A/B test: value proposition framing
  const vpV=abVariant("vp1",["feature","outcome"],[.5,.5])

  // Compute weekend forecast (next Saturday/Sunday)
  const now=new Date()
  const daysUntilSat=(6-now.getDay()+7)%7||7
  const islandBeaches=allBeaches.filter(b=>b.island===island)

  // Count clean beaches this weekend (from interpolated forecasts)
  let cleanWeekend=0,totalWeekend=0
  let bestBeach=null,bestDist=Infinity
  for(const b of islandBeaches){
    const sargId=BEACH_TO_SARG[b.id]
    const fc=sargId&&sargData.weekly?.[sargId]?.forecast
    const interpFc=sargData._enrichedWeekly?.[`_interp_${b.id}`]?.forecast
    const forecast=fc||interpFc
    if(!forecast||forecast.length<6)continue
    totalWeekend++
    // Check Saturday (index = daysUntilSat) — clamp to array bounds
    const satIdx=Math.min(daysUntilSat,6)
    if(forecast[satIdx]&&forecast[satIdx].afai<0.15)cleanWeekend++
    // Find best nearby beach for weekend
    if(userPos&&forecast[satIdx]){
      const dist=haversine(userPos.lat,userPos.lng,b.lat,b.lng)
      if(forecast[satIdx].afai<0.15&&dist<bestDist){bestDist=dist;bestBeach=b}
    }
  }

  const handleClick=()=>{
    track("sg_weekend_banner_click",{variant:vpV})
    onPremiumClick("weekend_banner")
  }

  return(
    <div style={{position:"fixed",bottom:68,left:12,right:12,zIndex:750,
      background:"linear-gradient(135deg,rgba(13,30,28,.95),rgba(10,23,20,.95))",
      backdropFilter:"blur(16px)",borderRadius:18,padding:"14px 16px",
      boxShadow:"0 8px 32px rgba(0,0,0,.35),0 0 0 1px rgba(255,199,44,.15)",
      display:"flex",alignItems:"center",gap:12,
      animation:"slideUp .4s cubic-bezier(.22,1,.36,1)"}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:".04em",
          textTransform:"uppercase",marginBottom:3}}>
          {lang==="en"?"This weekend":"Ce weekend"}
        </div>
        {vpV==="outcome"?(
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#fff",lineHeight:1.3}}>
              {cleanWeekend>0
                ?(lang==="en"
                  ?`${cleanWeekend} clean beaches nearby`
                  :`${cleanWeekend} plages propres à proximité`)
                :(lang==="en"?"Check which beaches are safe":"Vérifie quelles plages sont sûres")}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>
              {bestBeach&&!isPremium
                ?(lang==="en"
                  ?`Best bet: ${bestBeach.name} (${Math.round(bestDist)} km)`
                  :`Meilleur choix : ${bestBeach.name} (${Math.round(bestDist)} km)`)
                :(lang==="en"
                  ?"Unlock the full weekend forecast"
                  :"Débloquer les prévisions weekend")}
            </div>
          </>
        ):(
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#fff",lineHeight:1.3}}>
              {lang==="en"?"Full forecast for all beaches":"Prévisions détaillées pour toutes les plages"}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>
              {lang==="en"
                ?`${totalWeekend} beaches monitored · Updated daily`
                :`${totalWeekend} plages surveillées · Mis à jour chaque jour`}
            </div>
          </>
        )}
      </div>
      <button onClick={handleClick} style={{
        background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
        border:"none",borderRadius:14,padding:"10px 16px",cursor:"pointer",
        fontFamily:"'Anton',sans-serif",fontSize:13,color:C.ink,letterSpacing:".04em",
        textTransform:"uppercase",whiteSpace:"nowrap",flexShrink:0,
        boxShadow:"0 4px 16px rgba(232,168,0,.35)"}}>
        {vpV==="outcome"
          ?(lang==="en"?"Plan my weekend":"Planifier")
          :(lang==="en"?"Unlock":"Débloquer")}
      </button>
      <button onClick={()=>{setDismissed(true);track("sg_weekend_banner_dismiss")}} style={{
        position:"absolute",top:6,right:8,background:"none",border:"none",
        color:"rgba(255,255,255,.3)",cursor:"pointer",fontSize:14,padding:4}}>✕</button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   STRIPE BUY BUTTON — web component, checkout in-app
   ═══════════════════════════════════════════════════════════════════════════ */
function StripeInlineCheckout({plan,lang,source,onSuccess}){
  const cardRef=useRef(null)
  const stripeRef=useRef(null)
  const elementsRef=useRef(null)
  const[email,setEmail]=useState("")
  const[ready,setReady]=useState(false)
  const[submitting,setSubmitting]=useState(false)
  const[error,setError]=useState(null)
  const LL=T[lang]||T.fr
  const openedAt=useRef(Date.now())
  const emailTracked=useRef(false)
  const validEmail=email.match(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)

  // Track checkout form view
  useEffect(()=>{track("sg_checkout_view",{plan,source:source||"unknown"})},[])

  useEffect(()=>{
    let cancelled=false
    const init=()=>{
      if(cancelled||!cardRef.current) return
      const stripe=window.Stripe(STRIPE_PK)
      stripeRef.current=stripe
      const elements=stripe.elements({
        mode:"setup",currency:"eur",
        appearance:{
          theme:"night",
          variables:{
            colorPrimary:"#E8A800",colorBackground:"#0A1714",
            colorText:"#e6edf3",colorDanger:"#ff6b6b",
            fontFamily:"Bricolage Grotesque,system-ui,sans-serif",
            borderRadius:"12px",spacingUnit:"4px",
          },
          rules:{".Input":{border:"1.5px solid rgba(255,255,255,.15)",
            backgroundColor:"rgba(255,255,255,.06)",padding:"14px 16px"}}
        }
      })
      elementsRef.current=elements
      const pe=elements.create("payment",{layout:"tabs"})
      pe.on("ready",()=>{if(!cancelled)setReady(true)})
      pe.mount(cardRef.current)
    }
    if(window.Stripe){init()}
    else{
      // Load Stripe.js on demand (works even without window.loadStripe in index.html)
      const s=document.createElement('script');s.src='https://js.stripe.com/v3/'
      s.onload=()=>init();s.onerror=()=>setError("Stripe non disponible")
      document.head.appendChild(s)
    }
    return()=>{cancelled=true;elementsRef.current?.getElement?.("payment")?.destroy?.()}
  },[])

  // Checkout abandonment tracking: if email entered but no payment within 60s, mark as abandoned
  const abandonTimerRef=useRef(null)
  useEffect(()=>{
    if(validEmail&&!submitting){
      // Save email immediately for potential recovery
      localStorage.setItem("sg_checkout_abandoned",JSON.stringify({email,ts:Date.now()}))
      // Start 60s abandonment timer
      if(abandonTimerRef.current)clearTimeout(abandonTimerRef.current)
      abandonTimerRef.current=setTimeout(()=>{
        // Only fire if checkout still not completed
        if(!localStorage.getItem("sg_premium")){
          track("sg_checkout_abandoned",{plan,email_domain:email.split("@")[1],source:source||"unknown"})
          // Notify Apps Script for follow-up email
          try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
            method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
            body:JSON.stringify({type:"checkout_abandoned",email,island:window.location.hostname.includes("guadeloupe")?"GP":"MQ"})
          }).catch(()=>{})}catch(ex){}
        }
      },60000)
    }
    return()=>{if(abandonTimerRef.current)clearTimeout(abandonTimerRef.current)}
  },[validEmail,submitting])

  const handleSubmit=async()=>{
    if(!stripeRef.current||!elementsRef.current||!validEmail)return
    setSubmitting(true);setError(null)
    track("sg_checkout_submit",{plan,source:source||"unknown"})
    const{error:submitErr}=await elementsRef.current.submit()
    if(submitErr){setError(submitErr.message);setSubmitting(false);track("sg_checkout_error",{step:"elements_submit",error:submitErr.message,plan});return}
    let clientSecret
    try{
      const r=await fetch("/api/create-checkout.php",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"setup"})
      })
      const d=await r.json()
      if(d.error){setError(d.error);setSubmitting(false);track("sg_checkout_error",{step:"setup_intent",error:d.error,plan});return}
      clientSecret=d.clientSecret
    }catch{setError("Connexion impossible");setSubmitting(false);track("sg_checkout_error",{step:"network",error:"fetch_failed",plan});return}
    const{error:stripeErr,setupIntent}=await stripeRef.current.confirmSetup({
      elements:elementsRef.current,clientSecret,
      confirmParams:{return_url:window.location.href},
      redirect:"if_required"
    })
    if(stripeErr){setError(stripeErr.message);setSubmitting(false);track("sg_checkout_error",{step:"confirm_setup",error:stripeErr.message,plan});return}
    track("sg_checkout_card_confirmed",{plan,source:source||"unknown"})
    const res=await fetch("/api/create-checkout.php",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"subscribe",email,plan,setupIntentId:setupIntent.id,lang:lang||"fr"})
    })
    const data=await res.json()
    if(data.error){setError(data.error);setSubmitting(false);track("sg_checkout_error",{step:"subscribe",error:data.error,plan});return}
    // Generate referral code for this new premium user
    const refCode="REF-"+Math.random().toString(36).slice(2,8).toUpperCase()
    localStorage.setItem("sg_referral_code",refCode)
    // Check if this user was referred
    const referredBy=localStorage.getItem("sg_referred_by")||""
    track("sg_premium_subscribed",{plan,source,referral_code:refCode,referred_by:referredBy})
    if(referredBy){
      try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
        method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
        body:JSON.stringify({type:"referral_conversion",referrer_code:referredBy,new_subscriber_email:email,plan,island:window.location.hostname.includes("guadeloupe")?"GP":"MQ",date:new Date().toISOString()})
      }).catch(()=>{})}catch{}
    }
    localStorage.setItem("sg_premium","1")
    localStorage.setItem("sg_premium_trial_end",String(data.trialEnd))
    localStorage.setItem("sg_premium_email",email)
    // Clear abandonment tracking on success
    localStorage.removeItem("sg_checkout_abandoned")
    if(abandonTimerRef.current)clearTimeout(abandonTimerRef.current)
    // Fire-and-forget welcome email via Apps Script (safety net if PHP/Resend path fails silently)
    try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({type:"send_welcome_email",email,lang:lang||"fr",plan,trial_end:data.trialEnd,island:window.location.hostname.includes("guadeloupe")?"GP":"MQ",source:source||"unknown"})
    }).catch(()=>{})}catch{}
    onSuccess?.()
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <input type="email" placeholder={lang==="en"?"Your email":"Ton email"}
        value={email} onChange={e=>{
          setEmail(e.target.value)
          if(!emailTracked.current&&e.target.value.includes("@")){emailTracked.current=true;track("sg_checkout_email",{plan,source:source||"unknown"})}
        }}
        style={{width:"100%",padding:"14px 16px",fontSize:15,fontFamily:"inherit",
          background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(255,255,255,.15)",
          borderRadius:12,color:"#e6edf3",outline:"none",boxSizing:"border-box"}}/>
      <div ref={cardRef}/>
      {!ready&&!error&&<div style={{textAlign:"center",color:"rgba(255,255,255,.4)",fontSize:13,padding:12}}>
        {lang==="en"?"Loading secure form...":"Chargement du formulaire sécurisé..."}</div>}
      {error&&<p style={{color:"#ff6b6b",fontSize:12,textAlign:"center",margin:0}}>{error}</p>}
      <button onClick={handleSubmit} disabled={submitting||!ready||!validEmail}
        className="gbtn" style={{width:"100%",fontSize:17,padding:"16px 24px",
          border:"none",cursor:submitting?"wait":"pointer",fontFamily:"inherit",
          opacity:(submitting||!ready||!validEmail)?0.6:1}}>
        {submitting?(lang==="en"?"Processing...":"En cours...")
          :(lang==="en"?"Start free trial":"Démarrer l'essai gratuit")}
      </button>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,
        fontSize:10,color:"rgba(255,255,255,.35)",marginTop:2}}>
        <span>🔒</span>
        {lang==="en"?"Secured by Stripe · Cancel anytime":"Sécurisé par Stripe · Annule quand tu veux"}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREMIUM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
function PremiumModal({onClose,lang,source,onActivated}){
  const LL=T[lang]||T.fr
  const hasAnnual=!!STRIPE_LINK_ANNUAL
  const modalOpenedAt=useRef(Date.now())
  const sawCheckoutRef=useRef(false)
  // price1 A/B test ended: season pass variant got 0 checkouts vs 1 for monthly. Monthly wins.
  const[plan,setPlan]=useState("monthly") // "monthly" | "annual"
  const[showCheckout,setShowCheckout]=useState(false)
  const[showReferral,setShowReferral]=useState(false)
  const[refCopied,setRefCopied]=useState(false)
  // modal1 A/B test ended: family framing 2.1% vs control 1.4%. Family wins.
  const headline=lang==="en"?"Protect your weekend":"Protège ton weekend"
  const subtitle=lang==="en"?"Your kids count on you to find the right beach.":"Tes enfants comptent sur toi pour trouver la bonne plage."
  const effectivePlan=hasAnnual?plan:"monthly"
  return(
    <>
      <div className="backdrop" onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,saw_checkout:sawCheckoutRef.current});onClose()}}/>
      <div style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:1100,
        background:"linear-gradient(145deg,#0D1E1C,#0A1714)",
        borderRadius:"24px 24px 0 0",padding:"28px 24px 20px",
        color:"#e6edf3",maxHeight:"85vh",overflow:"auto",
      }}>
        <div className="sheet-handle" style={{background:"rgba(255,255,255,.2)"}}/>
        <div style={{borderTop:`3px solid ${C.gold}`,borderRadius:"3px 3px 0 0",
          margin:"-8px -24px 20px",padding:0}}/>

        <h2 className="anton" style={{fontSize:28,color:"#fff",marginBottom:6}}>{headline}</h2>
        <p style={{fontSize:13,color:"#adbac7",marginBottom:18}}>{subtitle}</p>

        <ul style={{listStyle:"none",padding:0,margin:"0 0 16px",display:"flex",flexDirection:"column",gap:12}}>
          {(lang==="en"
            ?["Daily pick — your best beach, updated in real time","Alerts before sargassum hits your favourites","Morning brief at 7am — ready for you, no need to open the app"]
            :["Reco du jour — ta meilleure plage, mise à jour en temps réel","Alertes avant que les sargasses arrivent sur tes favoris","Brief matin 7h — prêt pour toi, sans ouvrir l'app"]
          ).map((f,i)=>(
            <li key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:14}}>
              <span style={{color:C.gold,fontSize:18}}>✓</span>{f}
            </li>
          ))}
        </ul>

        {/* CTA section — sticky so it's always visible even if user hasn't scrolled */}
        <div style={{position:"sticky",bottom:0,
          background:"linear-gradient(180deg,transparent 0,#0A1714 16px)",
          paddingTop:8,paddingBottom:12,marginLeft:-24,marginRight:-24,paddingLeft:24,paddingRight:24}}>

        {/* Plan toggle — monthly + annual */}
        {hasAnnual&&(
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button onClick={()=>{setPlan("monthly");track("sg_plan_toggle",{plan:"monthly"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",
            background:plan==="monthly"?"rgba(255,199,44,.15)":"rgba(255,255,255,.04)",
            border:plan==="monthly"?"1.5px solid rgba(255,199,44,.4)":"1.5px solid rgba(255,255,255,.1)",
            color:plan==="monthly"?"#fff":"rgba(255,255,255,.5)",fontSize:13,fontWeight:600,
            transition:"all .2s"}}>
            <div>{lang==="en"?"Monthly":"Mensuel"}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{lang==="en"?"€4.99":"4,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{lang==="en"?"mo":"mois"}</span></div>
          </button>
          <button onClick={()=>{setPlan("annual");track("sg_plan_toggle",{plan:"annual"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",position:"relative",
            background:plan==="annual"?"rgba(255,199,44,.15)":"rgba(255,255,255,.04)",
            border:plan==="annual"?"1.5px solid rgba(255,199,44,.4)":"1.5px solid rgba(255,255,255,.1)",
            color:plan==="annual"?"#fff":"rgba(255,255,255,.5)",fontSize:13,fontWeight:600,
            transition:"all .2s"}}>
            <div style={{position:"absolute",top:-8,right:8,background:C.gold,color:C.ink,
              fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:100,letterSpacing:".02em"}}>
              -33%
            </div>
            <div>{lang==="en"?"Annual":"Annuel"}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{lang==="en"?"€39.99":"39,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{lang==="en"?"yr":"an"}</span></div>
          </button>
        </div>
        )}

        {showReferral?(
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <div style={{fontSize:36,marginBottom:12}}>🎉</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>
              {lang==="en"?"Premium activated!":"Premium activé !"}
            </div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginBottom:20}}>
              {lang==="en"?"Premium activated — morning brief, alerts, daily pick.":"Premium activé — brief matin, alertes, reco du jour."}
            </div>
            <div style={{background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(255,255,255,.12)",
              borderRadius:16,padding:"16px 20px",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:8,color:C.goldL}}>
                {lang==="en"?"Refer a friend — 1 free month for both of you":"Parraine un ami — 1 mois offert pour vous deux"}
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:14}}>
                {lang==="en"?"Share your link. When they subscribe, you both get 1 extra month free.":"Partage ton lien. Quand il s'abonne, vous avez chacun 1 mois offert."}
              </div>
              <button onClick={()=>{
                const code=localStorage.getItem("sg_referral_code")||""
                const refUrl=window.location.origin+"/?ref="+code
                track("sg_referral_share",{code,method:navigator.share?"native":"clipboard"})
                if(navigator.share){
                  navigator.share({title:lang==="en"?"Sargasses — Beach forecast":"Sargasses — Prévisions plage",
                    text:lang==="en"?"Check which beaches are sargassum-free before you go!":"Vérifie quelles plages sont propres avant d'y aller !",
                    url:refUrl}).catch(()=>{})
                }else{
                  navigator.clipboard?.writeText(refUrl)
                  setRefCopied(true);setTimeout(()=>setRefCopied(false),2000)
                }
              }} className="gbtn" style={{width:"100%",fontSize:15,padding:"14px 20px",
                border:"none",cursor:"pointer",fontFamily:"inherit",display:"flex",
                alignItems:"center",justifyContent:"center",gap:8}}>
                <span style={{fontSize:18}}>{refCopied?"✅":"📤"}</span>
                {refCopied
                  ?(lang==="en"?"Link copied!":"Lien copié !")
                  :(lang==="en"?"Share my referral link":"Partager mon lien")}
              </button>
            </div>
            <button onClick={onClose} style={{
              width:"100%",padding:"12px",background:"none",
              border:"1px solid rgba(255,255,255,.15)",borderRadius:16,
              color:"#8b949e",fontSize:13,cursor:"pointer",fontFamily:"inherit",
            }}>{lang==="en"?"Continue":"Continuer"}</button>
          </div>
        ):(
        <>
        {!showCheckout?(
          <button onClick={()=>{track("sg_premium_modal_cta",{plan:effectivePlan,source:source||"unknown"});sawCheckoutRef.current=true;setShowCheckout(true)}}
            className="gbtn" style={{width:"100%",textAlign:"center",fontSize:17,
              padding:"16px 24px",display:"block",border:"none",cursor:"pointer",fontFamily:"inherit",lineHeight:1.2}}>
            <div>{LL.premiumCta}</div>
            <div style={{fontSize:11,opacity:.7,fontWeight:400,marginTop:3}}>
              {lang==="en"?"0€ charged today · cancel anytime":"0€ débité aujourd'hui · annule quand tu veux"}
            </div>
          </button>
        ):(
          <StripeInlineCheckout plan={effectivePlan} lang={lang} source={source}
            onSuccess={()=>{track("sg_premium_success",{plan:effectivePlan,source:source||"unknown"});setShowReferral(true);onActivated?.()}}/>
        )}

        {/* Guarantee */}
        <div style={{textAlign:"center",marginTop:10,fontSize:11,color:"rgba(255,255,255,.4)",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span>🛡️</span>{lang==="en"?"30-day money-back guarantee":"Satisfait ou remboursé 30 jours"}
        </div>

        {/* Already subscribed — for users who installed the PWA after paying.
            iOS PWA and Safari have separate localStorage, so the ?premium_email=
            link from the welcome email opens in Safari and never reaches the PWA.
            This button lets them re-validate their sub from INSIDE the PWA. */}
        <button onClick={()=>{
          track("sg_premium_already_click",{source:source||"unknown"})
          const em=prompt(lang==="en"?"Enter the email used for your subscription:":"Entre l'email utilise pour ton abonnement :")
          if(!em||!em.includes("@"))return
          fetch("/api/create-checkout.php",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"verify_subscription",email:em})
          }).then(r=>r.json()).then(d=>{
            if(d.active){
              localStorage.setItem("sg_premium","1")
              localStorage.setItem("sg_premium_email",em)
              if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
              track("sg_premium_already_success",{source:source||"unknown"})
              onActivated?.()
              onClose()
            }else{
              track("sg_premium_already_failed",{reason:d.reason||d.error||"inactive"})
              alert(lang==="en"
                ?"No active subscription found for this email. Check the address or contact alerte@sargasses-martinique.com."
                :"Aucun abonnement actif trouvé pour cet email. Vérifie l'adresse ou contacte alerte@sargasses-martinique.com.")
            }
          }).catch(e=>{
            track("sg_premium_already_failed",{reason:e?.message||"network"})
            alert(lang==="en"?"Connection issue. Try again in a moment.":"Connexion impossible. Reessaie dans un instant.")
          })
        }} style={{
          width:"100%",padding:"10px",marginTop:10,background:"none",
          border:"1px dashed rgba(255,255,255,.2)",borderRadius:14,
          color:"rgba(255,255,255,.55)",fontSize:12,cursor:"pointer",fontFamily:"inherit",
        }}>{lang==="en"?"I already have a subscription":"J'ai deja un abonnement"}</button>

        <button onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,saw_checkout:sawCheckoutRef.current});onClose()}} style={{
          width:"100%",padding:"12px",marginTop:8,background:"none",
          border:"1px solid rgba(255,255,255,.15)",borderRadius:16,
          color:"#8b949e",fontSize:13,cursor:"pointer",fontFamily:"inherit",
        }}>{LL.close}</button>
        </>
        )}
        </div>{/* end sticky CTA section */}
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEADER — floating over map
   ═══════════════════════════════════════════════════════════════════════════ */
function Header({island,onIslandChange,lang,onLangToggle,theme,onThemeToggle,beachCount,dataSource}){
  const LL=T[lang]||T.fr
  const isLive=dataSource==="erddap-live"
  const srcLabel=isLive?(lang==="en"?"LIVE satellite":"LIVE satellite"):(lang==="en"?"Estimation":"Estimation")
  const srcColor=isLive?C.green:C.amber
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
      {/* Island toggle — sliding pill indicator */}
      <div style={{display:"flex",borderRadius:12,overflow:"hidden",position:"relative",
        border:"1.5px solid var(--sg-border,rgba(0,0,0,.08))",
        background:"var(--sg-card,#fff)",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
        <div style={{position:"absolute",top:2,bottom:2,width:"calc(50% - 2px)",borderRadius:10,
          background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
          transform:island==="mq"?"translateX(2px)":"translateX(calc(100% + 2px))",
          transition:"transform .3s cubic-bezier(.22,1,.36,1)",
          boxShadow:"0 2px 6px rgba(232,168,0,.3)"}}/>
        {["mq","gp"].map(id=>(
          <button key={id} onClick={()=>{onIslandChange(id);track("sg_island_switch",{to:id})}} style={{
            padding:"8px 14px",border:"none",cursor:"pointer",
            background:"transparent",position:"relative",zIndex:1,
            color:island===id?"#0D0D0D":"var(--sg-mid,#686868)",
            fontSize:12,fontWeight:700,fontFamily:"inherit",
            transition:"color .2s",
          }}>{id==="mq"?"MQ":"GP"}</button>
        ))}
      </div>

      {/* Live indicator — shows LIVE or Estimation based on data source */}
      <a href="https://marine.copernicus.eu" target="_blank" rel="noopener noreferrer"
        onClick={()=>track("sg_live_badge_click",{source:dataSource})}
        style={{display:"flex",alignItems:"center",gap:6,
          padding:"6px 12px",borderRadius:100,
          background:"var(--sg-card,#fff)",
          boxShadow:"0 2px 8px rgba(0,0,0,.06)",
          border:`1px solid ${isLive?"var(--sg-border)":"rgba(184,122,0,.2)"}`,
          fontSize:11,fontWeight:600,color:isLive?C.teal:C.amber,
          textDecoration:"none",cursor:"pointer"}}>
          <span className={isLive?"pulse":""} style={{width:8,height:8,borderRadius:4,background:srcColor}}/>
          {srcLabel} · {beachCount||47} {lang==="en"?"beaches":"plages"}
        </a>

      {/* Theme + Lang */}
      <div style={{display:"flex",gap:4}}>
        <button onClick={onThemeToggle} style={{
          width:44,height:44,borderRadius:12,border:"1px solid var(--sg-border)",
          background:"var(--sg-card,#fff)",cursor:"pointer",fontSize:16,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 2px 8px rgba(0,0,0,.06)",
        }}>{theme==="dark"?"☀️":"🌙"}</button>
        <button onClick={onLangToggle} style={{
          width:44,height:44,borderRadius:12,border:"1px solid var(--sg-border)",
          background:"var(--sg-card,#fff)",cursor:"pointer",fontSize:12,fontWeight:700,
          fontFamily:"inherit",color:"var(--sg-ink)",
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 2px 8px rgba(0,0,0,.06)",
        }}>{lang==="fr"?"EN":"FR"}</button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   INLINE PUSH CTA — Contextual in beach sheet after 3rd beach view
   ═══════════════════════════════════════════════════════════════════════════ */
function InlinePushCTA({lang,beachId}){
  const[accepted,setAccepted]=useState(false)
  const[dismissed,setDismissed]=useState(false)
  const tracked=useRef(false)
  // Only show after 3 beach views and if push not already set up
  const beachViews=parseInt(sessionStorage.getItem("sg_beach_views")||"0")
  if(beachViews<3||dismissed||g("sg_push_done",false))return null
  if(!tracked.current){tracked.current=true;track("sg_push_view",{beach_id:beachId||"unknown"})}

  const handleActivate=()=>{
    track("sg_push_accept",{beach_id:beachId||"unknown"})
    s("sg_push_done",true)
    setAccepted(true)
    try{
      window.loadOneSignal?.()
      // Tag user's beach for segmented push notifications
      const tagBeach=beachId||g("sg_my_beach",null)
      if(tagBeach){
        const waitForOS=setInterval(()=>{
          if(window.OneSignalDeferred){
            clearInterval(waitForOS)
            window.OneSignalDeferred.push(function(O){
              O.User.addTag("my_beach",tagBeach)
              O.User.addTag("sarg_alert","1")
            })
          }
        },500)
        setTimeout(()=>clearInterval(waitForOS),10000)
      }
    }catch(e){}
  }

  if(accepted)return(
    <div style={{margin:"12px 0",padding:"12px 14px",borderRadius:12,
      background:C.greenBg,textAlign:"center",fontSize:13,fontWeight:600,color:C.green}}>
      {lang==="en"?"Alerts activated! You'll be notified.":"Alertes activées ! Tu seras notifié."}
    </div>
  )

  return(
    <div style={{margin:"12px 0",padding:"12px 14px",borderRadius:14,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18,flexShrink:0}}>🔔</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)"}}>
            {lang==="en"?"Know before you go":"Sois prévenu avant d'aller à la plage"}
          </div>
          <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:1}}>
            {lang==="en"?"We'll alert you if this beach changes status. Free.":"On te prévient si ta plage change de statut. Gratuit."}
          </div>
        </div>
        <button onClick={handleActivate} style={{
          padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",
          background:C.gold,color:"#fff",fontSize:12,fontWeight:700,
          fontFamily:"inherit",flexShrink:0,
          boxShadow:"0 2px 8px rgba(232,168,0,.25)"}}>
          {lang==="en"?"Activate":"Activer"}
        </button>
      </div>
      <button onClick={()=>{setDismissed(true);track("sg_push_dismiss",{beach_id:beachId||"unknown"})}} style={{
        display:"block",margin:"6px auto 0",background:"none",border:"none",
        cursor:"pointer",color:"var(--sg-mid)",fontSize:11,padding:0}}>
        {lang==="en"?"Not now":"Plus tard"}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   INLINE EMAIL CAPTURE — Smart visit-based trigger (visit 3+)
   ═══════════════════════════════════════════════════════════════════════════ */
function InlineEmailCapture({lang}){
  const[email,setEmail]=useState("")
  const[submitted,setSubmitted]=useState(false)
  const[dismissed,setDismissed]=useState(false)
  const tracked=useRef(false)
  const visitCount=g("sg_visit_count",0)
  if(visitCount<1||dismissed||g("sg_email_prompt",false))return null
  if(!tracked.current){tracked.current=true;track("sg_smart_email_trigger",{visit_count:visitCount});track("sg_email_view")}

  const handleSubmit=e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    track("sg_email_submit",{source:"inline_beach"})
    s("sg_email",email)
    s("sg_email_prompt",true)
    setSubmitted(true)
    const island=window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({email,island,source:"inline-beach",date:new Date().toISOString()})
    }).catch(()=>{})}catch{}
  }

  if(submitted)return(
    <div style={{margin:"12px 0",padding:"12px 14px",borderRadius:12,
      background:C.greenBg,textAlign:"center",fontSize:13,fontWeight:600,color:C.green}}>
      {lang==="en"?"Subscribed! See you Friday.":"Inscrit ! À vendredi."}
    </div>
  )

  return(
    <div style={{margin:"12px 0",padding:"12px 14px",borderRadius:14,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
        <span>📧</span>
        {SARGASSES_SEASON==="high"
          ?(lang==="en"?"Season is active — stay informed":"Saison en cours — reste informé")
          :visitCount>=3
            ?(lang==="en"?"You keep coming back!":"Tu reviens souvent !")
            :(lang==="en"?"Stay ahead of sargassum":"Ne te fais pas surprendre")}
      </div>
      <div style={{fontSize:11,color:"var(--sg-mid)",marginBottom:8}}>
        {SARGASSES_SEASON==="high"
          ?(lang==="en"?"Beaches change fast right now. Get your Friday status update — free.":"Les plages changent vite en ce moment. Reçois ton bilan du vendredi — gratuit.")
          :visitCount>=3
            ?(lang==="en"?"Get your beaches status every Friday in your inbox.":"Reçois l'état de tes plages chaque vendredi.")
            :(lang==="en"?"Free weekly update: which beaches are clean this weekend.":"Chaque vendredi : quelles plages sont propres ce weekend. Gratuit.")}
      </div>
      <form onSubmit={handleSubmit} style={{display:"flex",gap:8,alignItems:"center"}}>
        <input type="email" placeholder={lang==="en"?"your@email.com":"ton@email.com"}
          value={email} onChange={e=>setEmail(e.target.value)}
          style={{flex:1,padding:"9px 12px",borderRadius:10,
            border:"1px solid var(--sg-border,rgba(0,0,0,.08))",
            fontSize:13,fontFamily:"inherit",background:"var(--sg-card,#fff)",
            outline:"none",minWidth:0,color:"var(--sg-ink)"}}/>
        <button type="submit" style={{
          padding:"9px 14px",borderRadius:10,border:"none",cursor:"pointer",
          background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
          color:C.ink,fontSize:12,fontWeight:700,whiteSpace:"nowrap",fontFamily:"inherit",
          boxShadow:"0 2px 8px rgba(232,168,0,.25)"}}>
          {lang==="en"?"Subscribe":"S'inscrire"}
        </button>
      </form>
      <button onClick={()=>{setDismissed(true);s("sg_email_prompt",true);track("sg_email_dismiss")}} style={{
        display:"block",margin:"6px auto 0",background:"none",border:"none",
        cursor:"pointer",color:"var(--sg-mid)",fontSize:11,padding:0}}>
        {lang==="en"?"Not now":"Plus tard"}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEEDBACK WIDGET — appears after 3 visits, once only
   ═══════════════════════════════════════════════════════════════════════════ */
function FeedbackWidget(){
  const[visible,setVisible]=useState(false)
  const[step,setStep]=useState(0) // 0=rating, 1=text, 2=done
  const[rating,setRating]=useState(0)
  const[text,setText]=useState("")

  useEffect(()=>{
    if(g("sg_feedback_done",false))return
    const visits=g("sg_visits",0)+1
    s("sg_visits",visits)
    if(visits>=3){setTimeout(()=>setVisible(true),30000)} // 30s after 3rd visit
  },[])

  if(!visible)return null

  const submit=()=>{
    track("sg_feedback",{rating,text:text.slice(0,200)})
    const island=window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({type:"feedback",rating,text:text.slice(0,500),island,date:new Date().toISOString()})
    }).catch(()=>{})}catch{}
    s("sg_feedback_done",true)
    setStep(2)
    setTimeout(()=>setVisible(false),2000)
  }

  return(
    <div style={{position:"fixed",bottom:"calc(60px + max(12px, env(safe-area-inset-bottom,0px)) + 160px)",left:12,right:12,zIndex:755,
      background:"var(--sg-card,#fff)",borderRadius:18,padding:"16px 18px",
      boxShadow:"0 8px 32px rgba(0,0,0,.15),0 0 0 1px var(--sg-border)",
      animation:"slideUp .4s cubic-bezier(.22,1,.36,1)"}}>
      <button onClick={()=>{setVisible(false);s("sg_feedback_done",true)}}
        style={{position:"absolute",top:8,right:10,background:"none",border:"none",
          color:"var(--sg-mid)",cursor:"pointer",fontSize:14}}>✕</button>
      {step===0&&(
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",marginBottom:10}}>
            Cette app t'est utile ?
          </div>
          <div style={{display:"flex",gap:6,justifyContent:"center"}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>{setRating(n);setStep(1)}}
                style={{width:44,height:44,borderRadius:12,border:"1.5px solid var(--sg-border)",
                  background:rating===n?C.goldBg:"var(--sg-card)",cursor:"pointer",
                  fontSize:18,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",
                  transition:"all .2s"}}>
                {n<=2?"😕":n===3?"😐":n===4?"🙂":"🤩"}
              </button>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--sg-mid)",marginTop:4,padding:"0 4px"}}>
            <span>Pas du tout</span><span>Indispensable</span>
          </div>
        </div>
      )}
      {step===1&&(
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",marginBottom:8}}>
            {rating>=4?"Super ! Qu'est-ce qui te plait le plus ?":"Qu'est-ce qui manque ?"}
          </div>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            placeholder={rating>=4?"Ce que j'utilise le plus...":"Ce qui me manque..."}
            style={{width:"100%",height:60,borderRadius:10,border:"1.5px solid var(--sg-border)",
              padding:"8px 10px",fontSize:13,fontFamily:"inherit",resize:"none",
              background:"var(--sg-bgD)",color:"var(--sg-ink)"}}/>
          <button onClick={submit} style={{width:"100%",marginTop:8,padding:"10px",
            borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
            background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
            fontSize:13,fontWeight:700,color:C.ink}}>Envoyer</button>
        </div>
      )}
      {step===2&&(
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <span style={{fontSize:24}}>🙏</span>
          <div style={{fontSize:13,fontWeight:600,color:"var(--sg-ink)",marginTop:4}}>Merci pour ton retour !</div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETURN USER CARD — inline welcome for returning users (J+1/J+7)
   Shows on map, not a popup. Auto-dismisses after 6s.
   ═══════════════════════════════════════════════════════════════════════════ */
function ReturnUserCard({lang,allBeaches}){
  const[visible,setVisible]=useState(false)
  const[dismissed,setDismissed]=useState(false)
  // Capture last visit ONCE on mount (before useEffect overwrites it)
  const lastVisitRef=useRef(g("sg_last_visit",0))

  const info=useMemo(()=>{
    const lastVisit=lastVisitRef.current
    const now=Date.now()
    if(!lastVisit||now-lastVisit<12*3600*1000)return null // less than 12h ago
    const daysSince=Math.round((now-lastVisit)/(24*3600*1000))
    const changed=allBeaches.filter(b=>b.status&&b.status!=="clean").length
    return{daysSince,changed}
  },[allBeaches])

  useEffect(()=>{
    if(!info||dismissed||sessionStorage.getItem("sg_return_card_shown"))return
    const t=setTimeout(()=>setVisible(true),1500)
    const auto=setTimeout(()=>{setVisible(false);sessionStorage.setItem("sg_return_card_shown","1")},8000)
    return()=>{clearTimeout(t);clearTimeout(auto)}
  },[info,dismissed])

  // Record visit time for next session
  useEffect(()=>{s("sg_last_visit",Date.now())},[])

  if(!visible||!info)return null

  const dismiss=()=>{setDismissed(true);setVisible(false);sessionStorage.setItem("sg_return_card_shown","1")}

  return(
    <div style={{position:"absolute",
      top:"max(108px, calc(env(safe-area-inset-top,12px) + 100px))",
      left:12,right:12,zIndex:745,pointerEvents:"none"}}>
      <div style={{pointerEvents:"auto",
        background:"rgba(255,255,255,.94)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
        borderRadius:14,padding:"12px 14px",
        boxShadow:"0 4px 20px rgba(0,0,0,.1),0 0 0 1px rgba(0,158,142,.1)",
        display:"flex",alignItems:"center",gap:10,
        animation:"slideUp .35s cubic-bezier(.22,1,.36,1)"}}>
        <span style={{fontSize:18,flexShrink:0}}>👋</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)"}}>
            {info.daysSince>=7
              ?(lang==="en"?"Welcome back! Here's what changed":"Bon retour ! Voici ce qui a changé")
              :(lang==="en"?"Welcome back!":"Bon retour !")}
          </div>
          <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:1}}>
            {info.changed>0
              ?(lang==="en"
                ?`${info.changed} beach${info.changed>1?"es":""} changed status since your last visit`
                :`${info.changed} plage${info.changed>1?"s":""} ${info.changed>1?"ont":"a"} changé de statut`)
              :(lang==="en"?"All beaches stable — enjoy!":"Toutes les plages sont stables")}
          </div>
        </div>
        <button onClick={dismiss} style={{
          background:"none",border:"none",color:"var(--sg-mid)",cursor:"pointer",
          fontSize:14,padding:4,flexShrink:0}}>✕</button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FAV TOAST — brief inline toast when user adds first favorite
   ═══════════════════════════════════════════════════════════════════════════ */
function FavToast({show,lang}){
  const[visible,setVisible]=useState(false)
  useEffect(()=>{
    if(!show)return
    setVisible(true)
    const t=setTimeout(()=>setVisible(false),3000)
    return()=>clearTimeout(t)
  },[show])
  if(!visible)return null
  return(
    <div style={{position:"fixed",bottom:74,left:"50%",transform:"translateX(-50%)",
      zIndex:800,background:"var(--sg-card,#fff)",color:"var(--sg-ink)",
      padding:"10px 18px",borderRadius:14,fontSize:13,fontWeight:600,
      boxShadow:"0 4px 20px rgba(0,0,0,.12),0 0 0 1px var(--sg-border)",
      display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap",
      animation:"slideUp .3s cubic-bezier(.22,1,.36,1)"}}>
      <span style={{color:C.green}}>✓</span>
      {lang==="en"?"Added to favorites":"Ajouté aux favoris"}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PWA INSTALL PROMPT — Android (beforeinstallprompt) + iOS (Safari tutorial)
   Best practice: show after 2nd beach view (value demonstrated), not on timer
   ═══════════════════════════════════════════════════════════════════════════ */
function InstallPrompt(){
  const[deferredPrompt,setDeferredPrompt]=useState(null)
  const[visible,setVisible]=useState(false)
  const[showIosTutorial,setShowIosTutorial]=useState(false)
  const[dismissed,setDismissed]=useState(()=>!!g("sg_pwa_prompt",0))

  const isIos=useMemo(()=>/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream,[])
  const isStandalone=useMemo(()=>
    window.matchMedia("(display-mode: standalone)").matches
    ||window.matchMedia("(display-mode: window-controls-overlay)").matches
    ||window.matchMedia("(display-mode: minimal-ui)").matches
    ||window.navigator.standalone===true,[])

  useEffect(()=>{
    if(dismissed||isStandalone)return
    // Android/Chrome: listen for beforeinstallprompt
    const handler=e=>{e.preventDefault();setDeferredPrompt(e)}
    window.addEventListener("beforeinstallprompt",handler)
    // iOS never fires beforeinstallprompt — on iOS web push requires PWA install,
    // so be aggressive: show the prompt after 8s regardless of beach views.
    // Android also gets this fallback if the native prompt doesn't fire.
    const showPrompt=(reason)=>{
      setVisible(true);s("sg_pwa_prompt",1)
      track("sg_pwa_prompt_shown",{platform:isIos?"ios":"android",reason})
    }
    const checkEngagement=()=>{
      const beachViews=parseInt(sessionStorage.getItem("sg_beach_views")||"0")
      if(beachViews>=2)showPrompt("beach-views")
    }
    const interval=setInterval(checkEngagement,5000)
    // iOS: show after 8s regardless. Android: fallback after 60s.
    const fallback=setTimeout(()=>{if(!visible)showPrompt(isIos?"ios-timer":"android-fallback")},isIos?8000:60000)
    return()=>{window.removeEventListener("beforeinstallprompt",handler);clearInterval(interval);clearTimeout(fallback)}
  },[dismissed,isStandalone])

  if(!visible||isStandalone)return null

  const handleInstall=async()=>{
    if(deferredPrompt){
      track("sg_pwa_install",{platform:"android"})
      deferredPrompt.prompt()
      const{outcome}=await deferredPrompt.userChoice
      track("sg_pwa_install_result",{outcome,platform:"android"})
      setVisible(false);setDismissed(true);s("sg_pwa_prompt",1)
    }else if(isIos){
      track("sg_pwa_ios_tutorial_open")
      setShowIosTutorial(true)
    }
  }

  const dismiss=()=>{setVisible(false);setDismissed(true);s("sg_pwa_prompt",1);track("sg_pwa_dismiss",{platform:isIos?"ios":"android"})}

  return(
    <>
      <div style={{position:"fixed",bottom:"calc(60px + max(12px, env(safe-area-inset-bottom,0px)) + 160px)",left:12,right:12,zIndex:760,
        background:"linear-gradient(135deg,rgba(0,158,142,.95),rgba(30,200,176,.92))",
        backdropFilter:"blur(16px)",borderRadius:18,padding:"14px 16px",
        boxShadow:"0 8px 32px rgba(0,158,142,.35)",display:"flex",alignItems:"center",gap:12,
        animation:"slideUp .4s cubic-bezier(.22,1,.36,1)"}}>
        <div style={{width:42,height:42,borderRadius:12,background:"rgba(255,255,255,.15)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>📱</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>
            {isIos?"Ajoute l'app sur ton iPhone":"Installer l'app"}
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginTop:1}}>
            {isIos?"Accès direct + alertes sargasses":"Accès direct, alertes push, hors-ligne"}
          </div>
        </div>
        <button onClick={handleInstall} style={{background:"#fff",color:C.teal,border:"none",
          borderRadius:12,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",
          fontFamily:"inherit",flexShrink:0}}>{isIos?"Voir comment":"Installer"}</button>
        <button onClick={dismiss}
          style={{position:"absolute",top:6,right:8,background:"none",border:"none",
            color:"rgba(255,255,255,.4)",cursor:"pointer",fontSize:14,padding:4}}>✕</button>
      </div>

      {/* iOS Safari tutorial overlay */}
      {showIosTutorial&&(
        <>
          <div className="backdrop" onClick={()=>{setShowIosTutorial(false);dismiss()}}
            style={{zIndex:1200}}/>
          <div style={{
            position:"fixed",bottom:0,left:0,right:0,zIndex:1201,
            background:"var(--sg-card,#fff)",borderRadius:"24px 24px 0 0",
            padding:"28px 24px 40px",maxHeight:"70vh",overflow:"auto",
            boxShadow:"0 -8px 40px rgba(0,0,0,.2)",
            animation:"slideUp .4s cubic-bezier(.22,1,.36,1)",
          }}>
            <div className="sheet-handle"/>
            <h3 className="anton" style={{fontSize:22,marginBottom:4,color:"var(--sg-ink)"}}>
              Ajoute Sargasses sur ton iPhone
            </h3>
            <p style={{fontSize:12,color:"var(--sg-mid)",marginBottom:16,lineHeight:1.5}}>
              En 3 secondes, tu auras l'app sur ton ecran d'accueil avec les alertes sargasses.
            </p>

            {/* Step 1 */}
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
              <div style={{width:32,height:32,borderRadius:10,background:C.tealBg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                fontWeight:800,color:C.teal,flexShrink:0}}>1</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--sg-ink)"}}>
                  Appuie sur <span style={{display:"inline-flex",alignItems:"center",
                    padding:"2px 8px",background:"rgba(0,122,255,.1)",borderRadius:6,
                    fontSize:18,verticalAlign:"middle"}}>⬆️</span> en bas de Safari
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:2}}>Le bouton partager (carre avec fleche)</div>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
              <div style={{width:32,height:32,borderRadius:10,background:C.tealBg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                fontWeight:800,color:C.teal,flexShrink:0}}>2</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--sg-ink)"}}>
                  Scroll et appuie sur <strong>"Sur l'ecran d'accueil"</strong>
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:2}}>Icone + avec un carre</div>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:20}}>
              <div style={{width:32,height:32,borderRadius:10,background:C.tealBg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                fontWeight:800,color:C.teal,flexShrink:0}}>3</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--sg-ink)"}}>
                  Appuie <strong>"Ajouter"</strong> en haut a droite
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:2}}>L'app apparait sur ton ecran d'accueil</div>
              </div>
            </div>

            <button onClick={()=>{setShowIosTutorial(false);dismiss();track("sg_pwa_ios_tutorial_done")}}
              className="gbtn" style={{width:"100%",textAlign:"center",fontSize:15,padding:"14px 24px"}}>
              J'ai compris
            </button>

            {/* Arrow pointing down to Safari bar */}
            <div style={{position:"absolute",bottom:-8,left:"50%",transform:"translateX(-50%)",
              width:0,height:0,borderLeft:"10px solid transparent",borderRight:"10px solid transparent",
              borderTop:"10px solid var(--sg-card,#fff)"}}/>
          </div>
        </>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App(){
  const[lang,setLang]=useState(getLang)
  const[theme,setTheme]=useState(()=>g("sg_theme","light"))
  const[island,setIsland]=useState(()=>{
    // Domain detection takes priority over saved preference
    try{
      if(window.location.hostname.includes("guadeloupe"))return"gp"
      if(window.location.hostname.includes("martinique"))return"mq"
    }catch{}
    // Fallback to saved preference (for localhost/dev)
    const saved=g("sg_island",null)
    if(saved)return saved
    return"mq"
  })
  const[view,setView]=useState("map") // map | list | jeu | premium
  const[search,setSearch]=useState("")
  const[filter,setFilter]=useState(0) // index in T.filters
  const[selectedBeach,setSelectedBeach]=useState(null)
  const[favorites,setFavorites]=useState(()=>g("sg_fav",[]))
  const[myBeachId,setMyBeachId]=useState(()=>{
    const saved=g("sg_my_beach",null)
    if(saved)return saved
    // Migration: existing users with favorites → auto-pick first fav
    const favs=g("sg_fav",[])
    if(favs.length>0){s("sg_my_beach",favs[0]);return favs[0]}
    return null
  })
  const[showPicker,setShowPicker]=useState(false)
  const[showOnboarding,setShowOnboarding]=useState(()=>!g("sg_onb",0))
  const[showPremium,setShowPremium]=useState(false)
  const[premiumSource,setPremiumSource]=useState(null)
  const[showFavToast,setShowFavToast]=useState(false)
  const[isPremium,setIsPremium]=useState(()=>{
    if(g("sg_premium",false))return true
    try{
      const params=new URLSearchParams(window.location.search)
      // Stripe redirect: ?premium=1 OR ?session_id=cs_xxx
      const sessionId=params.get("session_id")
      if(params.get("premium")==="1"||params.get("success")==="1"||sessionId){
        s("sg_premium",true)
        s("sg_premium_welcome",true)
        track("sg_conversion",{session_id:sessionId||"direct"})
        // Log payment to Apps Script (fire-and-forget)
        if(sessionId){
          try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
            method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
            body:JSON.stringify({type:"checkout.session.completed",data:{object:{id:sessionId,payment_status:"paid",
              metadata:{island:window.location.hostname.includes("guadeloupe")?"GP":"MQ"}}}})
          }).catch(()=>{})}catch(ex){}
        }
        window.history.replaceState({},"",window.location.pathname)
        return true
      }
    }catch(e){}
    return false
  })
  const[showWelcome,setShowWelcome]=useState(()=>{
    const w=g("sg_premium_welcome",false)
    if(w){s("sg_premium_welcome",false)}
    return w
  })
  useEffect(()=>{if(showWelcome){track("sg_welcome_toast_view");const t=setTimeout(()=>setShowWelcome(false),5000);return()=>clearTimeout(t)}},[showWelcome])

  // Handle ?manage=1 → open Stripe Customer Portal
  // MUST run independently of isPremium state: the user is already premium and
  // clicks the link from email to manage/cancel, so a "return true" early-exit
  // in the isPremium useState initializer would skip this handler on the 2nd+
  // click (1st click worked because localStorage was empty at that moment).
  useEffect(()=>{
    try{
      const params=new URLSearchParams(window.location.search)
      if(params.get("manage")!=="1")return
      const urlEmail=params.get("email")||""
      const em=urlEmail||localStorage.getItem("sg_premium_email")
      if(em){
        if(urlEmail)localStorage.setItem("sg_premium_email",urlEmail)
        track("sg_manage_portal_open",{has_url_email:!!urlEmail})
        fetch("/api/create-checkout.php",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"portal",email:em})
        }).then(r=>r.json()).then(d=>{
          if(d.url){window.location.href=d.url;return}
          track("sg_manage_portal_error",{error:d.error||"no_url"})
          alert((d.error||"Erreur Stripe")+"\n\nContacte alerte@sargasses-martinique.com si le probleme persiste.")
        }).catch(e=>{
          track("sg_manage_portal_error",{error:e?.message||"network"})
          alert("Connexion impossible au portail Stripe. Reessaie dans un instant ou contacte alerte@sargasses-martinique.com.")
        })
      }else{
        const promptEmail=prompt("Entre ton email pour gerer ton abonnement :")
        if(promptEmail&&promptEmail.includes("@")){
          localStorage.setItem("sg_premium_email",promptEmail)
          fetch("/api/create-checkout.php",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"portal",email:promptEmail})
          }).then(r=>r.json()).then(d=>{
            if(d.url){window.location.href=d.url;return}
            alert(d.error||"Email introuvable chez Stripe")
          }).catch(()=>alert("Connexion impossible"))
        }
      }
      params.delete("manage")
      params.delete("email")
      const qs=params.toString()
      window.history.replaceState({},"",window.location.pathname+(qs?"?"+qs:""))
    }catch{}
  },[])

  // Auto-unlock premium from welcome email link on a fresh device
  // Link format: /?premium_email=<encoded>. Verifies active Stripe sub via PHP.
  useEffect(()=>{
    if(isPremium)return
    try{
      const params=new URLSearchParams(window.location.search)
      const pEmail=params.get("premium_email")
      if(!pEmail||!pEmail.includes("@"))return
      fetch("/api/create-checkout.php",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"verify_subscription",email:pEmail})
      }).then(r=>r.json()).then(d=>{
        if(d.active){
          localStorage.setItem("sg_premium","1")
          localStorage.setItem("sg_premium_email",pEmail)
          if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
          setIsPremium(true)
          setShowWelcome(true)
          track("sg_premium_unlock_from_email",{status:d.status||"unknown"})
        }else{
          track("sg_premium_unlock_failed",{reason:d.reason||d.error||"inactive"})
        }
      }).catch(e=>track("sg_premium_unlock_failed",{reason:e?.message||"network"}))
      params.delete("premium_email")
      const qs=params.toString()
      window.history.replaceState({},"",window.location.pathname+(qs?"?"+qs:""))
    }catch{}
  },[])

  // Analytics: session start
  useEffect(()=>{track("sg_session_start",{island,is_premium:isPremium,is_returning:!!g("sg_seen",0)});s("sg_seen",1)},[])

  // Push opt-in: contextual primer + native OneSignal prompt at a VALUE moment.
  // Old timing (1.5s PWA / 12s browser, no primer) gave 6% opt-in on 376 sessions.
  // New flow (2026-04-12):
  //   1. User opens first beach (sg:value_moment)
  //   2. After 1.5s delay, show PushPrimer banner (top, dismissable)
  //   3. User clicks "Activer" -> loadOneSignal() -> native prompt -> opt-in
  //   4. User clicks "X" -> 7-day cooldown, no native prompt
  //   5. Fallback: 60s on browser, 30s on PWA -> direct loadOneSignal() (legacy 6% floor)
  // Skipped if recently dismissed, already loaded, or iOS Safari (not standalone).
  const[showPushPrimer,setShowPushPrimer]=useState(false)
  const pushLoadedRef=useRef(false)

  const loadPushNow=useCallback((trigger)=>{
    if(pushLoadedRef.current)return
    if(g("sg_push_loaded_once",0)){pushLoadedRef.current=true;return}
    pushLoadedRef.current=true
    try{
      window.loadOneSignal?.()
      s("sg_push_loaded_once",1)
      track("sg_push_auto_loaded",{trigger})
    }catch(e){}
    setShowPushPrimer(false)
  },[])

  useEffect(()=>{
    if(g("sg_push_loaded_once",0))return
    const isIos=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream
    const isStandalone=window.matchMedia("(display-mode: standalone)").matches
      ||window.navigator.standalone===true
    if(isIos&&!isStandalone)return

    const dismissedAt=g("sg_push_primer_dismissed_at",0)
    const SEVEN_DAYS=7*24*3600*1000
    const recentlyDismissed=dismissedAt&&(Date.now()-dismissedAt)<SEVEN_DAYS

    let primerTimeout=null
    const onValueMoment=()=>{
      if(pushLoadedRef.current)return
      if(recentlyDismissed){
        loadPushNow("beach_open_no_primer")
        return
      }
      if(primerTimeout)return
      primerTimeout=setTimeout(()=>{
        if(pushLoadedRef.current)return
        setShowPushPrimer(true)
        track("sg_push_primer_shown",{trigger:"beach_open"})
      },1500)
    }
    window.addEventListener("sg:value_moment",onValueMoment)

    const FALLBACK_MS=isStandalone?30000:60000
    const t=setTimeout(()=>loadPushNow("fallback_timer"),FALLBACK_MS)

    return()=>{
      clearTimeout(t)
      if(primerTimeout)clearTimeout(primerTimeout)
      window.removeEventListener("sg:value_moment",onValueMoment)
    }
  },[loadPushNow])

  // onPushPrimerAccept + onPushPrimerDismiss are defined later, after the
  // userPos / allBeaches state declarations they reference (search for
  // "PRIMER CALLBACKS" below). Splitting here avoids a temporal dead zone.

  // F2: sync OneSignal tags so backend can segment pushes by premium + island
  // Re-runs when isPremium, island, OR favorites change. Fav tags also set
  // individually in toggleFav for immediate effect; this useEffect catches
  // batch updates (e.g. auto-favorite on primer accept).
  useEffect(()=>{
    try{
      if(!window.OneSignalDeferred)return
      window.OneSignalDeferred.push(function(O){
        if(isPremium)O.User.addTag("sg_premium","1")
        else O.User.removeTag("sg_premium")
        O.User.addTag("sg_island",island)
        if(Array.isArray(favorites)){
          for(const fid of favorites)O.User.addTag("fav_"+fid,"1")
        }
      })
    }catch(e){}
  },[isPremium,island,favorites])

  // Referral detection: check ?ref= param on landing
  const[showReferralBanner,setShowReferralBanner]=useState(false)
  useEffect(()=>{
    try{
      const params=new URLSearchParams(window.location.search)
      const refCode=params.get("ref")
      if(refCode&&refCode.startsWith("REF-")){
        localStorage.setItem("sg_referred_by",refCode)
        track("sg_referral_landing",{ref_code:refCode,island})
        if(!isPremium)setShowReferralBanner(true)
        // Clean URL but keep other params
        params.delete("ref")
        const qs=params.toString()
        window.history.replaceState({},"",window.location.pathname+(qs?"?"+qs:""))
      }
    }catch{}
  },[])
  useEffect(()=>{if(showReferralBanner){const t=setTimeout(()=>setShowReferralBanner(false),8000);return()=>clearTimeout(t)}},[showReferralBanner])

  // Checkout abandonment recovery: show banner if user left mid-checkout within last 24h
  const[showRecoveryBanner,setShowRecoveryBanner]=useState(false)
  useEffect(()=>{
    if(isPremium)return
    try{
      const raw=localStorage.getItem("sg_checkout_abandoned")
      if(!raw)return
      const{email,ts}=JSON.parse(raw)
      const age=Date.now()-ts
      if(age<24*60*60*1000&&email){
        setShowRecoveryBanner(true)
        track("sg_checkout_recovery_eligible",{age_hours:Math.round(age/3600000),island})
      }else{
        // Expired — clean up
        localStorage.removeItem("sg_checkout_abandoned")
      }
    }catch{localStorage.removeItem("sg_checkout_abandoned")}
  },[])

  // Runtime data sources
  const[allBeaches,setAllBeaches]=useState(BEACHES_FALLBACK)
  const[imageMap,setImageMap]=useState(null)
  const[sargData,setSargData]=useState(null)
  const[historyData,setHistoryData]=useState(null)
  const[dataSource,setDataSource]=useState("loading")
  const[userPos,setUserPos]=useState(null) // {lat,lng}
  const[communityReports,setCommunityReports]=useState({})
  const[hasActiveThreat,setHasActiveThreat]=useState(false)

  // Deep-link: /plages/:slug → auto-open beach sheet
  useEffect(()=>{
    if(!allBeaches.length)return
    const m=window.location.pathname.match(/^\/plages\/([^/]+)/)
    if(!m)return
    const slug=m[1]
    const match=allBeaches.find(b=>
      b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/-+$/,"")===slug)
    if(match){setSelectedBeach(match);track("sg_beach_open",{beach_id:match.id,status:match.status,source:"deeplink"})}
  },[allBeaches])

  // PRIMER CALLBACKS — must come after userPos/allBeaches/island state to
  // avoid temporal dead zone in their dep arrays.
  const onPushPrimerAccept=useCallback(()=>{
    track("sg_push_primer_accept",{})
    loadPushNow("primer_accept")
    try{
      const favs=g("sg_fav",[])
      if(Array.isArray(favs)&&favs.length===0&&userPos&&allBeaches?.length){
        const islandBeaches=allBeaches
          .filter(b=>b.island===island&&b.lat&&b.lng)
          .map(b=>({...b,_d:haversine(userPos.lat,userPos.lng,b.lat,b.lng)}))
          .sort((a,b)=>a._d-b._d)
          .slice(0,3)
        const ids=islandBeaches.map(b=>b.id)
        if(ids.length){
          setFavorites(ids)
          track("sg_auto_fav_set",{count:ids.length,beach_ids:ids.join(","),source:"primer_accept"})
        }
      }
    }catch(e){}
  },[loadPushNow,userPos,allBeaches,island])

  const onPushPrimerDismiss=useCallback(()=>{
    track("sg_push_primer_dismiss",{})
    s("sg_push_primer_dismissed_at",Date.now())
    setShowPushPrimer(false)
  },[])

  const LL=T[lang]||T.fr

  // Fetch beaches-list.json + sargassum.json in parallel, merge in correct order
  // Promise.all eliminates race condition: IDW always runs on full 135-beach list
  useEffect(()=>{
    Promise.all([
      fetch("/data/beaches-list.json").then(r=>r.json()).catch(()=>null),
      fetch("/api/copernicus/sargassum.json").then(r=>r.json()).catch(()=>null)
    ]).then(([beachData,sargResult])=>{
      // 1. Build full beach list (strip stale status/afai from JSON)
      let beaches=Array.isArray(beachData)&&beachData.length>0
        ?beachData.map(b=>{const{status,afai,...rest}=b;return rest})
        :[...BEACHES_FALLBACK]
      // 2. Merge sargassum data if available
      if(sargResult){
        setSargData(sargResult)
        setDataSource(sargResult?.source||"reference")
        if(sargResult?.levels){
          // Build sentinel lookup: beachId → {lat, lng, afai, sargId}
          const sentinelMap={}
          for(const lvl of sargResult.levels){
            const beachId=SARG_TO_BEACH[lvl.id]
            if(!beachId)continue
            const bch=beaches.find(b=>b.id===beachId)
            if(bch)sentinelMap[beachId]={lat:bch.lat,lng:bch.lng,afai:lvl.afai,sargId:lvl.id}
          }
          const sentinels=Object.values(sentinelMap)
          // Update sentinels with live data
          for(const lvl of sargResult.levels){
            const beachId=SARG_TO_BEACH[lvl.id]
            if(!beachId)continue
            const idx=beaches.findIndex(b=>b.id===beachId)
            if(idx>=0){
              beaches[idx]={...beaches[idx],afai:lvl.afai,status:statusFromAfai(lvl.afai),_src:"live",beachMemory:lvl.beachMemory||false,afaiSat:lvl.afaiSat}
            }
          }
          // IDW interpolation for non-sentinel beaches
          for(let i=0;i<beaches.length;i++){
            if(beaches[i]._src==="live")continue
            const same=sentinels.filter(s=>
              (beaches[i].island==="mq"&&s.lat<15.5)||(beaches[i].island==="gp"&&s.lat>=15.5))
            const interp=interpolateIDW(beaches[i],same.length>0?same:sentinels)
            if(interp!==null){
              beaches[i]={...beaches[i],afai:interp,status:statusFromAfai(interp),_src:"interpolated"}
            }
          }
          // Interpolate weekly forecasts for non-sentinel beaches
          if(sargResult.weekly){
            const enrichedWeekly={...sargResult.weekly}
            for(const b of beaches){
              const sargId=BEACH_TO_SARG[b.id]
              if(sargId&&sargResult.weekly[sargId])continue
              const same=sentinels.filter(s=>
                (b.island==="mq"&&s.lat<15.5)||(b.island==="gp"&&s.lat>=15.5))
              const interp=interpolateForecast(b,same.length>0?same:sentinels,sargResult.weekly)
              if(interp){
                const syntheticId=`_interp_${b.id}`
                enrichedWeekly[syntheticId]=interp
              }
            }
            sargResult._enrichedWeekly=enrichedWeekly
          }
        }
      }
      setAllBeaches(beaches)
    })
  },[])

  // Fetch community beach reports (last 48h) — deferred 3s to not compete with critical data
  useEffect(()=>{
    const t=setTimeout(()=>{
      fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=beach_reports")
        .then(r=>r.json())
        .then(data=>{if(data?.reports)setCommunityReports(data.reports)})
        .catch(()=>{})
    },3000)
    return()=>clearTimeout(t)
  },[])

  // Fetch beaches-images.json — deferred (only needed when opening beach sheet)
  useEffect(()=>{
    const t=setTimeout(()=>{
      fetch("/data/beaches-images.json")
        .then(r=>r.json())
        .then(data=>{
          if(data&&typeof data==="object")setImageMap(data)
        })
        .catch(()=>{})
    },1500)
    return()=>clearTimeout(t)
  },[])

  // Apply community reports overlay SEPARATELY — no re-fetch of sargassum.json
  useEffect(()=>{
    if(Object.keys(communityReports).length===0)return
    setAllBeaches(prev=>{
      let changed=false
      const updated=prev.map(b=>{
        if(!b.status)return b // sargassum not loaded yet, skip
        const sargId=BEACH_TO_SARG[b.id]
        const rpt=communityReports[b.id]||communityReports[sargId]
        if(!rpt||!rpt.total||rpt.total<3)return b
        const consensus=rpt.avoid>=rpt.moderate&&rpt.avoid>=rpt.clean?"avoid":rpt.moderate>=rpt.clean?"moderate":"clean"
        const STATUS_RANK={clean:0,moderate:1,avoid:2}
        if(STATUS_RANK[consensus]>STATUS_RANK[b.status]){
          changed=true
          return{...b,status:consensus,_communityOverride:true,_communityTotal:rpt.total}
        }
        return b
      })
      return changed?updated:prev
    })
  },[communityReports])

  // Fetch history.json for trend chart — deferred (only needed in beach sheet)
  useEffect(()=>{
    const t=setTimeout(()=>{
      fetch("/api/copernicus/history.json")
        .then(r=>r.json())
        .then(data=>{if(data?.history)setHistoryData(data.history)})
        .catch(()=>{})
    },2000)
    return()=>clearTimeout(t)
  },[])

  // Geolocation — center map on user, find nearest beach
  useEffect(()=>{
    if(!navigator.geolocation)return
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude,lng=pos.coords.longitude
      setUserPos({lat,lng})
      // Auto-detect island from GPS (Martinique ~14.6°N, Guadeloupe ~16.2°N)
      const gpsIsland=lat>15.5?"gp":"mq"
      setIsland(prev=>{
        const saved=g("sg_island",null)
        if(!saved)return gpsIsland // only override if no manual selection
        return prev
      })
    },()=>{},{enableHighAccuracy:false,timeout:8000,maximumAge:300000})
  },[])

  // Theme
  useEffect(()=>{
    document.documentElement.classList.toggle("theme-dark",theme==="dark")
    s("sg_theme",theme)
  },[theme])

  // Visit counter (persists across sessions for smart email trigger)
  useEffect(()=>{
    const vc=g("sg_visit_count",0)+1
    s("sg_visit_count",vc)
  },[])

  // Island
  useEffect(()=>{s("sg_island",island)},[island])

  // Favorites
  useEffect(()=>{s("sg_fav",favorites)},[favorites])

  // My beach persistence
  useEffect(()=>{if(myBeachId)s("sg_my_beach",myBeachId)},[myBeachId])

  // Resolve myBeach object from allBeaches
  const myBeach=useMemo(()=>{
    if(!myBeachId)return null
    return allBeaches.find(b=>b.id===myBeachId)||null
  },[myBeachId,allBeaches])

  // Beach picker selection handler
  const onPickBeach=useCallback(id=>{
    setMyBeachId(id)
    s("sg_my_beach",id)
    setShowPicker(false)
    // Also add to favorites
    setFavorites(f=>f.includes(id)?f:[...f,id])
    // Mark old onboarding as done
    s("sg_onb",1)
    setShowOnboarding(false)
  },[])

  const toggleFav=useCallback(id=>{
    setFavorites(f=>{
      const isAdding=!f.includes(id)
      track(isAdding?"sg_fav_add":"sg_fav_remove",{beach_id:id})
      if(isAdding&&!g("sg_fav_toast_shown",false)){
        setShowFavToast(true)
        s("sg_fav_toast_shown",true)
        setTimeout(()=>setShowFavToast(false),3500)
      }
      // F2: sync OneSignal tag so backend can segment "favorite changed" pushes
      try{
        if(window.OneSignalDeferred){
          window.OneSignalDeferred.push(function(O){
            const tagKey="fav_"+id
            if(isAdding)O.User.addTag(tagKey,"1")
            else O.User.removeTag(tagKey)
          })
        }
      }catch(e){}
      return isAdding?[...f,id]:f.filter(x=>x!==id)
    })
  },[])

  const toggleTheme=useCallback(()=>setTheme(t=>t==="dark"?"light":"dark"),[])
  const toggleLang=useCallback(()=>setLang(l=>l==="fr"?"en":"fr"),[])

  // Filter beaches + sort by distance if GPS available
  const filtered=useMemo(()=>{
    let list=allBeaches.filter(b=>b.island===island)
    // Attach distance from user
    if(userPos){
      list=list.map(b=>({...b,_dist:haversine(userPos.lat,userPos.lng,b.lat,b.lng)}))
    }
    // Search
    if(search.trim()){
      const q=search.trim().toLowerCase()
      list=list.filter(b=>b.name.toLowerCase().includes(q)||b.commune.toLowerCase().includes(q))
    }
    // Filter
    if(filter===1)list=list.filter(b=>b.status==="clean")
    else if(filter===2)list=list.filter(b=>favorites.includes(b.id))
    else if(filter===3)list=list.filter(b=>b.status==="avoid")
    // Sort by distance when GPS available
    if(userPos){list.sort((a,b)=>(a._dist||999)-(b._dist||999))}
    return list
  },[island,search,filter,favorites,allBeaches,userPos])

  // Filter chip counts (unfiltered, per island)
  const filterCounts=useMemo(()=>{
    const ib=allBeaches.filter(b=>b.island===island)
    return[ib.length,ib.filter(b=>b.status==="clean").length,favorites.filter(id=>ib.some(b=>b.id===id)).length,ib.filter(b=>b.status==="avoid").length]
  },[allBeaches,island,favorites])

  const onBeachClick=useCallback(b=>{
    setSelectedBeach(b);track("sg_beach_open",{beach_id:b?.id,status:b?.status})
    // Signal to push auto-loader that user reached a value moment
    try{window.dispatchEvent(new Event("sg:value_moment"))}catch(e){}
    // Auto-dismiss onboarding coachmark on first beach interaction
    if(showOnboarding){setShowOnboarding(false);s("sg_onb",1)}
    // Track beach views for PWA install prompt timing
    const v=parseInt(sessionStorage.getItem("sg_beach_views")||"0")+1
    sessionStorage.setItem("sg_beach_views",String(v))
  },[showOnboarding])
  const closeSheet=useCallback(()=>setSelectedBeach(null),[])

  const onChangeView=useCallback(v=>{
    track("sg_nav_change",{tab:v})
    if(v==="premium")setShowPremium(true)
    else setView(v)
  },[])

  const openPremium=useCallback((src)=>{const s=src||"nav";setPremiumSource(s);setShowPremium(true);track("sg_premium_modal_open",{source:s})},[])

  return(
    <LangCtx.Provider value={lang}>
      <StyleInjector/>
      <AbDebug/>
      <h1 style={{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap"}}>{island==="mq"?"Sargasses Martinique en temps réel — carte et plages aujourd'hui":"Sargasses Guadeloupe en temps réel — carte et plages aujourd'hui"}</h1>
      <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>

        {/* CHECKOUT RECOVERY BANNER */}
        {showRecoveryBanner&&(
          <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,
            background:"linear-gradient(90deg,#0A1714 0%,#1a2f28 100%)",
            borderBottom:"1px solid rgba(232,168,0,.3)",
            padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:12,
            fontSize:13,color:"#e6edf3",fontFamily:"inherit"}}>
            <span style={{opacity:.9}}>{SARGASSES_SEASON==="high"
              ?(lang==="en"?"Beaches are changing fast. You almost had Premium — finish now.":"Les plages bougent vite. Tu étais presque Premium — termine maintenant.")
              :(lang==="en"?"You were almost Premium! Pick up where you left off.":"Tu étais presque Premium\u00a0! Reprends où tu en étais.")}</span>
            <button onClick={()=>{
              track("sg_checkout_recovery_click",{island})
              setShowRecoveryBanner(false)
              openPremium("recovery_banner")
            }} style={{background:"#E8A800",color:"#0A1714",border:"none",borderRadius:8,
              padding:"6px 14px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",
              whiteSpace:"nowrap"}}>
              {lang==="en"?"Go Premium":"Passer Premium"}
            </button>
            <button onClick={()=>{
              track("sg_checkout_recovery_dismiss",{island})
              setShowRecoveryBanner(false)
              localStorage.removeItem("sg_checkout_abandoned")
            }} style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",
              cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}}
              aria-label="Fermer">&times;</button>
          </div>
        )}

        {/* MAP, LIST or GAME — both rendered, visibility toggled for instant switch */}
        <div style={{position:"absolute",inset:0,opacity:view==="map"?1:0,
          pointerEvents:view==="map"?"auto":"none",transition:"opacity .25s ease"}}>
          <ErrBound><Suspense fallback={<div style={{width:"100%",height:"100%",background:"#0A1714"}}/>}>
            <LazyMapView beaches={filtered} island={island} lang={lang}
            onBeachClick={onBeachClick} selectedBeach={selectedBeach} sargData={sargData} userPos={userPos}
            favorites={favorites} allBeaches={allBeaches} onThreatChange={setHasActiveThreat}
            onPremiumClick={openPremium} track={track}/>
          </Suspense></ErrBound>
        </div>
        <div style={{position:"absolute",inset:0,opacity:view==="list"?1:0,
          pointerEvents:view==="list"?"auto":"none",transition:"opacity .25s ease"}}>
          <BeachListView beaches={filtered} onBeachClick={onBeachClick}
            favorites={favorites} lang={lang} imageMap={imageMap}/>
        </div>

        {/* FLOATING UI (over map) — frosted glass panel */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:700,
          padding:"max(12px,env(safe-area-inset-top)) 16px 0",
          pointerEvents:"none",
          background:view==="map"?"linear-gradient(180deg,rgba(253,252,247,.88) 0%,rgba(253,252,247,.7) 85%,transparent 100%)":"none",
          backdropFilter:view==="map"?"blur(8px)":"none",
          WebkitBackdropFilter:view==="map"?"blur(8px)":"none",
        }}>
          <div style={{pointerEvents:"auto"}}>
            <Header island={island} onIslandChange={setIsland}
              lang={lang} onLangToggle={toggleLang}
              theme={theme} onThemeToggle={toggleTheme}
              beachCount={allBeaches.length} dataSource={dataSource}/>
            <div style={{marginTop:10}}>
              <SearchBar value={search} onChange={setSearch} lang={lang}/>
            </div>
            <div style={{marginTop:8,position:"relative"}}>
              <div style={{display:"flex",gap:6,overflowX:"auto",
                paddingBottom:4,paddingRight:24,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
                {LL.filters.map((f,i)=>(
                  <FilterChip key={i} label={f} icon={LL.filtersIcon[i]} count={filterCounts[i]||null}
                    active={filter===i} onClick={()=>{setFilter(i);track("sg_filter",{filter:f,index:i})}}/>
                ))}
              </div>
              {/* Fade hint for scrollable chips */}
              <div style={{position:"absolute",top:0,right:0,bottom:4,width:32,
                background:"linear-gradient(90deg,transparent,var(--sg-bg,#FDFCF7))",pointerEvents:"none"}}/>
            </div>
            {/* Search results dropdown on map */}
            {view==="map"&&search.trim().length>=2&&filtered.length>0&&filtered.length<=8&&(
              <div style={{marginTop:4,background:"var(--sg-card,#fff)",borderRadius:14,
                boxShadow:"0 4px 20px rgba(0,0,0,.12)",border:"1px solid var(--sg-border,rgba(0,0,0,.06))",
                maxHeight:240,overflowY:"auto",overscrollBehavior:"contain"}}>
                {filtered.slice(0,5).map(b=>{
                  const st=ST[b.status]||ST._loading
                  return(
                    <button key={b.id} onClick={()=>{setSearch("");onBeachClick(b)}} style={{
                      display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                      background:"none",border:"none",borderBottom:"1px solid var(--sg-border,rgba(0,0,0,.04))",
                      cursor:"pointer",textAlign:"left",fontFamily:"inherit",width:"100%"}}>
                      <div style={{width:8,height:8,borderRadius:4,background:st.c,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--sg-ink)",
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</div>
                        <div style={{fontSize:11,color:"var(--sg-mid,#686868)"}}>{b.commune}</div>
                      </div>
                      <span style={{fontSize:10,fontWeight:700,color:st.c}}>{lang==="en"?st.le:st.l}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* PUSH PRIMER — contextual soft prompt before native OneSignal dialog.
            Triggered 1.5s after first beach_open. Dismissable. 7-day cooldown. */}
        {showPushPrimer&&(
          <PushPrimer lang={lang} onAccept={onPushPrimerAccept} onDismiss={onPushPrimerDismiss}/>
        )}

        {/* DAILY RECO STRIP — replaces BestBeachWidget (masked "••••") with visible reco
            Hidden when ThreatBanner active, sheet open, onboarding, or searching */}
        {view==="map"&&!selectedBeach&&!showOnboarding&&!hasActiveThreat&&!search.trim()&&(
          <DailyRecoStrip allBeaches={allBeaches} sargData={sargData} island={island}
            lang={lang} isPremium={isPremium} onBeachClick={onBeachClick}
            userPos={userPos} onPremiumClick={openPremium} communityReports={communityReports}/>
        )}

        {/* WeekendBanner removed — upsell disguised as feature */}

        {/* SeasonBanner removed — "saison active" doesn't help decide beach visit */}

        {/* BOTTOM NAV */}
        <BottomNav view={view} onChangeView={onChangeView} lang={lang}/>

        {/* BOTTOM SHEET (beach detail) */}
        {selectedBeach&&(
          <BeachSheet beach={selectedBeach} onClose={closeSheet}
            favorites={favorites} onToggleFav={toggleFav} lang={lang}
            allBeaches={allBeaches} imageMap={imageMap}
            onBeachClick={onBeachClick} onPremiumClick={openPremium} isPremium={isPremium}
            historyData={historyData} sargData={sargData}
            dataSource={dataSource} userPos={userPos} communityReports={communityReports}/>
        )}

        {/* PREMIUM MODAL */}
        {showPremium&&<PremiumModal onClose={()=>setShowPremium(false)} lang={lang} source={premiumSource}
          onActivated={()=>{setIsPremium(true);setShowWelcome(true)}}/>}

        {/* First-visit hint — auto-dismiss on first tap or after 5s */}
        {showOnboarding&&view==="map"&&!selectedBeach&&(
          <div style={{position:"fixed",bottom:74,left:"50%",transform:"translateX(-50%)",
            zIndex:750,background:"rgba(255,255,255,.95)",backdropFilter:"blur(12px)",
            WebkitBackdropFilter:"blur(12px)",padding:"10px 20px",borderRadius:100,
            boxShadow:"0 4px 20px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04)",
            display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap",
            animation:"slideUp .4s cubic-bezier(.22,1,.36,1)",pointerEvents:"none"}}>
            <span style={{fontSize:16}}>👆</span>
            <span style={{fontSize:13,fontWeight:600,color:C.ink}}>
              {lang==="en"?"Tap a beach to see its status":"Touche une plage sur la carte"}
            </span>
          </div>
        )}

        {/* BOTTOM PROMPTS — feedback + install only (email/push moved inline to beach sheet) */}
        {!showOnboarding&&(()=>{
          const feedbackDone=g("sg_feedback_done",false)
          const visits=g("sg_visits",0)
          const pwaShown=g("sg_pwa_prompt",0)
          if(!feedbackDone&&visits>=3)return<FeedbackWidget/>
          if(!pwaShown)return<InstallPrompt/>
          return null
        })()}

        {/* FAV TOAST — inline, first favorite only */}
        <FavToast show={showFavToast} lang={lang}/>

        {/* REFERRAL LANDING BANNER */}
        {showReferralBanner&&(
          <div onClick={()=>{openPremium("referral_banner");setShowReferralBanner(false)}} style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",
            zIndex:9998,background:"linear-gradient(135deg,#7C3AED,#A855F7)",color:"#fff",
            padding:"12px 20px",borderRadius:14,fontSize:13,fontWeight:600,
            boxShadow:"0 8px 24px rgba(124,58,237,.35)",cursor:"pointer",
            display:"flex",alignItems:"center",gap:10,maxWidth:"90vw",
            animation:"slideUp .4s ease"}}>
            <span style={{fontSize:20}}>🎁</span>
            <div>
              <div>{lang==="en"?"Recommended by a friend":"Recommandé par un ami"}</div>
              <div style={{fontSize:10,fontWeight:400,opacity:.85,marginTop:2}}>
                {lang==="en"?"Tap to start your free premium trial":"Appuie pour essayer premium gratuitement"}
              </div>
            </div>
            <button onClick={e=>{e.stopPropagation();setShowReferralBanner(false)}} style={{
              background:"rgba(255,255,255,.2)",border:"none",color:"#fff",
              borderRadius:12,padding:"4px 10px",cursor:"pointer",fontSize:16,marginLeft:8}}>✕</button>
          </div>
        )}

        {/* PREMIUM WELCOME TOAST */}
        {showWelcome&&(
          <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",
            zIndex:9999,background:"linear-gradient(135deg,#009E8E,#1EC8B0)",color:"#fff",
            padding:"14px 24px",borderRadius:16,fontSize:14,fontWeight:600,
            boxShadow:"0 8px 24px rgba(0,158,142,.35)",
            display:"flex",alignItems:"center",gap:10,maxWidth:"90vw",
            animation:"slideUp .4s ease"}}>
            <span style={{fontSize:22}}>🎉</span>
            <div>
              <div>Premium activé !</div>
              <div style={{fontSize:11,fontWeight:400,opacity:.85,marginTop:2}}>Brief matin + alertes + reco du jour.</div>
              <a href="?manage=1" onClick={e=>{e.stopPropagation();track("sg_manage_click")}} style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:3,display:"inline-block"}}>Gérer mon abonnement</a>
            </div>
            <button onClick={()=>setShowWelcome(false)} style={{
              background:"rgba(255,255,255,.2)",border:"none",color:"#fff",
              borderRadius:12,padding:"4px 10px",cursor:"pointer",fontSize:16,marginLeft:8}}>✕</button>
          </div>
        )}
      </div>
    </LangCtx.Provider>
  )
}
