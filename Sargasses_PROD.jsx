/**
 * SARGASSES — Reboot from scratch (4 avril 2026)
 * "Cette fois, tu seras prévenu."
 *
 * Architecture : Map-first, data-driven (Clarity — 25% clics = carte)
 * Stack : React 18 · Leaflet · Bricolage Grotesque + Anton · Open-Meteo
 */
import React,{useState,useEffect,useRef,useMemo,useCallback,createContext,useContext,Component}from"react"
import L from"leaflet"
import"leaflet/dist/leaflet.css"

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
    forecast:"Prévisions 7j",weather:"Météo",directions:"Y aller",
    fav:"Favori",addFav:"Ajouter aux favoris",removeFav:"Retirer des favoris",
    wind:"Vent",uv:"UV",temp:"Température",drive:"min",
    kids:"Enfants",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"Prévisions 7 jours, alertes push, zéro pub.",
    premiumPrice:"4,99 €/mois",premiumCta:"Essai gratuit 7 jours",
    premiumFeatures:["Essaie 7 jours — 0€, annule en 1 clic","Sois prévenu AVANT que les sargasses arrivent","Prévisions 7 jours — sache samedi dès lundi","Sans pub · Sans engagement · Satisfait ou remboursé"],
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
    forecast:"7-day forecast",weather:"Weather",directions:"Directions",
    fav:"Favourite",addFav:"Add to favourites",removeFav:"Remove from favourites",
    wind:"Wind",uv:"UV",temp:"Temperature",drive:"min",
    kids:"Kids",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"7-day forecast, push alerts, no ads.",
    premiumPrice:"€4.99/mo",premiumCta:"Free 7-day trial",
    premiumFeatures:["Try 7 days free — cancel in 1 click","Get warned BEFORE sargassum arrives","7-day forecast — know Saturday by Monday","No ads · No commitment · 30-day guarantee"],
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
  {id:"mq001",island:"mq",name:"Plage des Salines",commune:"Sainte-Anne",lat:14.3958521,lng:-60.8689802,status:"moderate",afai:.42,kids:true,snorkel:false,parking:true,drive:52},
  {id:"mq011",island:"mq",name:"Anse Mitan",commune:"Les Trois-Îles",lat:14.5522593,lng:-61.0552056,status:"clean",afai:.17,kids:true,snorkel:false,parking:true,drive:18},
  {id:"mq014",island:"mq",name:"Grande Anse d'Arlet",commune:"Les Anses-d'Arlet",lat:14.5027854,lng:-61.0856311,status:"clean",afai:.12,kids:true,snorkel:true,parking:true,drive:25},
  {id:"mq016",island:"mq",name:"Plage du Diamant",commune:"Le Diamant",lat:14.4758027,lng:-61.0314046,status:"moderate",afai:.42,kids:false,snorkel:false,parking:true,drive:32},
  {id:"mq005",island:"mq",name:"Anse Trabaud",commune:"Sainte-Anne",lat:14.4101296,lng:-60.8482068,status:"avoid",afai:.78,kids:false,snorkel:false,parking:true,drive:52},
  {id:"mq024",island:"mq",name:"Anse Madame",commune:"Schoelcher",lat:14.6177983,lng:-61.1036302,status:"clean",afai:.14,kids:true,snorkel:false,parking:true,drive:12},
  {id:"mq029",island:"mq",name:"Plage de Saint-Pierre",commune:"Saint-Pierre",lat:14.7404792,lng:-61.1768484,status:"clean",afai:.15,kids:true,snorkel:true,parking:true,drive:32},
  {id:"mq012",island:"mq",name:"Anse Noire",commune:"Les Anses-d'Arlet",lat:14.5277232,lng:-61.0873771,status:"clean",afai:.08,kids:true,snorkel:true,parking:false,drive:28},
  {id:"mq019",island:"mq",name:"Anse Gros Raisins",commune:"Sainte-Luce",lat:14.4658147,lng:-60.9260982,status:"clean",afai:.16,kids:true,snorkel:true,parking:false,drive:38},
  {id:"mq023",island:"mq",name:"Plage de la Française",commune:"Fort-de-France",lat:14.6011133,lng:-61.0674743,status:"clean",afai:.2,kids:true,snorkel:false,parking:true,drive:8},
  {id:"gp009",island:"gp",name:"Plage de la Caravelle",commune:"Sainte-Anne",lat:16.2181,lng:-61.3965,status:"clean",afai:.14,kids:true,snorkel:true,parking:true,drive:38},
  {id:"gp012",island:"gp",name:"Plage du Gosier",commune:"Le Gosier",lat:16.2048,lng:-61.4948,status:"clean",afai:.18,kids:true,snorkel:true,parking:true,drive:12},
  {id:"gp031",island:"gp",name:"Plage de Malendure",commune:"Bouillante",lat:16.1721,lng:-61.7767,status:"clean",afai:.12,kids:true,snorkel:true,parking:true,drive:42},
  {id:"gp024",island:"gp",name:"Plage de Deshaies",commune:"Deshaies",lat:16.3053509,lng:-61.7950711,status:"clean",afai:.11,kids:true,snorkel:true,parking:true,drive:55},
  {id:"gp005",island:"gp",name:"Pointe des Châteaux",commune:"Saint-François",lat:16.2531027,lng:-61.2306694,status:"moderate",afai:.38,kids:false,snorkel:false,parking:true,drive:52},
  {id:"gp015",island:"gp",name:"Porte d'Enfer",commune:"Anse-Bertrand",lat:16.4861861,lng:-61.4416828,status:"avoid",afai:.7,kids:false,snorkel:false,parking:true,drive:55},
  {id:"gp045",island:"gp",name:"Plage Pain de Sucre",commune:"Terre-de-Haut (Les Saintes)",lat:15.8635,lng:-61.5988,status:"clean",afai:.07,kids:true,snorkel:true,parking:false,drive:60},
  {id:"gp001",island:"gp",name:"Plage de Saint-François",commune:"Saint-François",lat:16.2521,lng:-61.2644,status:"moderate",afai:.35,kids:true,snorkel:true,parking:true,drive:48},
  {id:"gp010",island:"gp",name:"Plage de Sainte-Anne",commune:"Sainte-Anne",lat:16.2226,lng:-61.3828,status:"clean",afai:.22,kids:true,snorkel:false,parking:true,drive:38},
  {id:"gp021",island:"gp",name:"Plage de Grande Anse",commune:"Trois-Rivières",lat:15.9589717,lng:-61.6719389,status:"clean",afai:.15,kids:true,snorkel:true,parking:true,drive:45},
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

function track(event,params={}){
  const ab=g("sg_ab",{})
  const p={...params}
  for(const[k,v]of Object.entries(ab))p["ab_"+k]=v
  try{window.gtag("event",event,p)}catch(e){}
}

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
 * Interpolate 7-day forecast for non-sentinel beaches
 * by IDW-blending forecasts from K nearest sentinels
 */
function interpolateForecast(beach,sentinels,weeklyData,k=3,power=2){
  if(!weeklyData||!sentinels||sentinels.length===0)return null
  const withDist=sentinels
    .filter(s=>weeklyData[s.sargId])
    .map(s=>({...s,dist:haversine(beach.lat,beach.lng,s.lat,s.lng)}))
    .sort((a,b)=>a.dist-b.dist).slice(0,k)
  if(withDist.length===0)return null
  // Compute weights
  const weights=withDist.map(s=>({w:1/Math.pow(Math.max(s.dist,0.1),power),id:s.sargId}))
  const sumW=weights.reduce((s,x)=>s+x.w,0)
  // Blend each day
  const ref=weeklyData[weights[0].id].forecast
  const forecast=ref.map((dayRef,i)=>{
    let blended=0
    for(const{w,id}of weights){
      const f=weeklyData[id].forecast[i]
      blended+=(w/sumW)*(f?f.afai:dayRef.afai)
    }
    const afai=Math.round(Math.max(0,Math.min(1,blended))*100)/100
    return{day:dayRef.day,date:dayRef.date,afai,status:statusFromAfai(afai)}
  })
  // Drift from blended forecast
  const trend=forecast[6].afai-forecast[0].afai
  return{
    forecast,
    drift:trend>0.05?"up":trend<-0.05?"down":"stable",
    driftLabel:trend>0.05?"Dérive possible vers la côte":trend<-0.05?"Dispersion attendue":"Stable",
    driftValue:Math.round(trend*100)/100,
    interpolated:true,
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
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,600;12..96,700;12..96,800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;overflow:hidden;font-family:'Bricolage Grotesque',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body{background:var(--sg-bg,#FDFCF7);color:var(--sg-ink,#0D0D0D)}
.anton{font-family:'Anton',sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:-.02em}
.leaflet-container{background:#0a1a2e!important}
.leaflet-control-attribution{display:none!important}
.leaflet-control-zoom{display:none!important}

/* Gold button */
.gbtn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  background:linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%);
  border:none;border-radius:22px;color:#0D0D0D;font-weight:700;font-size:15px;
  padding:14px 28px;cursor:pointer;position:relative;overflow:hidden;
  font-family:'Bricolage Grotesque',system-ui,sans-serif;
  box-shadow:0 2px 12px rgba(232,168,0,.3);transition:transform .15s,box-shadow .15s;
}
.gbtn:active{transform:scale(.97)}
.gbtn::after{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);
  animation:shine 4.5s infinite;
}
@keyframes shine{0%,70%{left:-100%}100%{left:100%}}

/* Bottom sheet */
.sheet{
  position:fixed;bottom:0;left:0;right:0;z-index:900;
  max-width:520px;margin:0 auto;
  background:var(--sg-card,#fff);border-radius:20px 20px 0 0;
  box-shadow:0 -4px 30px rgba(0,0,0,.12);
  transition:transform .35s cubic-bezier(.32,.72,0,1);
  max-height:85vh;overflow-y:auto;overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
}
.sheet-handle{width:40px;height:4px;border-radius:2px;background:var(--sg-handle,rgba(0,0,0,.25));margin:12px auto 8px}

/* Backdrop */
.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:899;animation:fadeIn .2s}
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

/* Scrollbar */
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:2px}

/* Forecast bars */
.fc-bar{border-radius:3px 3px 0 0;transition:height .4s ease}

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
  const st=ST[status]||ST.clean
  const label=lang==="en"?st.le:st.l
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",
      borderRadius:100,background:st.bg,color:st.c,fontSize:13,fontWeight:700}}>
      <span>{st.e}</span>{label}
    </span>
  )
}

function AfaiBadge({afai}){
  const pct=Math.round(afai*100)
  const color=afai<.3?C.green:afai<.65?C.amber:C.red
  return(
    <span style={{fontSize:12,fontWeight:600,color,opacity:.9}}>AFAI {pct}%</span>
  )
}

function FilterChip({label,icon,active,onClick}){
  return(
    <button onClick={onClick} style={{
      display:"inline-flex",alignItems:"center",gap:5,padding:"8px 16px",
      borderRadius:100,border:active?"1.5px solid "+C.gold:"1.5px solid var(--sg-border,rgba(0,0,0,.08))",
      background:active?"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)":"var(--sg-card,#fff)",
      color:active?C.ink:"var(--sg-ink,#0D0D0D)",fontSize:13,fontWeight:active?700:500,
      cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",
      boxShadow:active?"0 2px 8px rgba(232,168,0,.2)":"none",
      transition:"all .2s",
    }}>
      <span>{icon}</span>{label}
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
      padding:"8px 0 max(8px,env(safe-area-inset-bottom))",
      height:60,
    }}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>onChangeView(t.id)} style={{
          display:"flex",flexDirection:"column",alignItems:"center",gap:2,
          background:"none",border:"none",cursor:"pointer",
          color:view===t.id?C.gold:"var(--sg-mid,#686868)",
          fontSize:10,fontWeight:view===t.id?700:500,fontFamily:"inherit",
          transition:"color .2s",padding:"4px 16px",
        }}>
          <span style={{fontSize:20}}>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAP VIEW (Leaflet — satellite tiles, CircleMarkers + heatmap)
   ═══════════════════════════════════════════════════════════════════════════ */
function MapView({beaches,island,onBeachClick,selectedBeach,sargData,userPos,favorites,allBeaches,onThreatChange,onPremiumClick,lang}){
  const containerRef=useRef(null)
  const mapRef=useRef(null)
  const markersRef=useRef([])
  const heatRef=useRef([])
  const gridLayerRef=useRef(null)
  const userMarkerRef=useRef(null)
  const driftRef=useRef(null) // animation interval
  const[mapError,setMapError]=useState(null)
  const[afaiGrid,setAfaiGrid]=useState(null)
  const[banksData,setBanksData]=useState(null)
  const[timeStep,setTimeStep]=useState(0) // 0=now, 6, 12, 24 hours
  const[autoPlaying,setAutoPlaying]=useState(false)
  const autoPlayTimersRef=useRef([])
  const autoZoomDoneRef=useRef(false)
  const[threatDismissed,setThreatDismissed]=useState(()=>sessionStorage.getItem("sg_threat_dismissed")==="1")
  const banksLayerRef=useRef(null)

  // Init map once
  useEffect(()=>{
    if(!containerRef.current||mapRef.current)return
    try{
    const center=ISLAND_CENTER[island]||ISLAND_CENTER.mq
    const map=L.map(containerRef.current,{
      zoomControl:false,
      attributionControl:false,
      maxBoundsViscosity:1,
    })
    map.setView(center,11)
    // Satellite tiles (users prefer satellite — 21 clics Clarity)
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
      maxZoom:18,
    }).addTo(map)
    // Copernicus WMS removed — server is unreliable (503 returns opaque PNG error tiles
    // that mask the satellite layer). AFAI grid from sargassum-grid.json provides
    // the sargassum visualization instead (rendered in canvas, see useEffect below).
    // Labels overlay (on top of satellite + sargassum)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",{
      maxZoom:18,subdomains:"abcd",
    }).addTo(map)
    mapRef.current=map
    }catch(err){console.error("MAP INIT ERROR:",err.message,err.stack);setMapError(err.message)}
    return()=>{try{mapRef.current?.remove()}catch(e){};mapRef.current=null}
  },[])

  // Fly to island (setView if container has 0 size, flyTo otherwise)
  useEffect(()=>{
    if(!mapRef.current)return
    // If user GPS is on this island, center on them; else default island center
    if(userPos){
      const onMq=userPos.lat<15.5,onGp=userPos.lat>=15.5
      if((island==="mq"&&onMq)||(island==="gp"&&onGp)){
        mapRef.current.flyTo([userPos.lat,userPos.lng],12,{duration:1})
        return
      }
    }
    const center=ISLAND_CENTER[island]||ISLAND_CENTER.mq
    try{
      const size=mapRef.current.getSize()
      if(size.x===0||size.y===0){mapRef.current.setView(center,11)}
      else{mapRef.current.flyTo(center,11,{duration:1})}
    }catch(e){mapRef.current.setView(center,11)}
  },[island,userPos])

  // User location marker (blue pulsing dot)
  useEffect(()=>{
    if(!mapRef.current)return
    if(userMarkerRef.current){userMarkerRef.current.remove();userMarkerRef.current=null}
    if(!userPos)return
    const icon=L.divIcon({
      className:"",
      html:`<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 8px rgba(66,133,244,.5);animation:pulse 2s infinite"></div>`,
      iconSize:[16,16],iconAnchor:[8,8],
    })
    userMarkerRef.current=L.marker([userPos.lat,userPos.lng],{icon,interactive:false,zIndexOffset:1000})
      .addTo(mapRef.current)
    return()=>{if(userMarkerRef.current){userMarkerRef.current.remove();userMarkerRef.current=null}}
  },[userPos])

  // Fetch AFAI grid for offshore heatmap
  useEffect(()=>{
    fetch("/api/copernicus/sargassum-grid.json")
      .then(r=>r.json())
      .then(d=>{if(d?.points?.length)setAfaiGrid(d)})
      .catch(()=>{})
  },[])

  // Fetch sargassum banks (clustered AFAI + drift predictions)
  useEffect(()=>{fetch("/api/copernicus/sargassum-banks.json").then(r=>r.json()).then(d=>{if(d?.banks?.length)setBanksData(d)}).catch(()=>{})},[])

  /* Bank polygons, drift paths, auto-zoom, auto-play all removed.
     Drift predictions use fixed speed/bearing — not real ocean modeling.
     Keeping only the AFAI heatmap (real satellite data). */

  // Render AFAI heatmap from grid data (canvas circles, efficient)
  useEffect(()=>{
    if(!mapRef.current)return
    if(gridLayerRef.current){gridLayerRef.current.remove();gridLayerRef.current=null}
    if(!afaiGrid||!afaiGrid.points.length)return
    // Filter to current island region
    const isGP=island==="gp"
    const pts=afaiGrid.points.filter(p=>isGP?p[0]>=15.5:p[0]<15.5)
    if(!pts.length)return
    // Canvas layer for performance (hundreds of circles)
    const renderer=L.canvas({padding:0.5})
    const group=L.layerGroup()
    for(const[lat,lng,afai]of pts){
      const r=Math.max(800,afai*5000) // radius in meters
      const opacity=Math.min(0.55,afai*0.8)
      const color=afai<.15?"rgba(34,197,94,.6)":afai<.40?"rgba(232,168,0,.7)":"rgba(232,82,42,.8)"
      const c=L.circle([lat,lng],{radius:r,fillColor:color,color:"transparent",weight:0,
        fillOpacity:opacity,renderer,interactive:true})
      // Tunnel clic: tap hotspot → find nearest beach → open it
      c.on("click",()=>{
        track("sg_heatmap_click",{afai,lat,lng})
        const nearest=beaches.slice().sort((a,b)=>
          haversine(lat,lng,a.lat,a.lng)-haversine(lat,lng,b.lat,b.lng))[0]
        if(nearest)onBeachClick(nearest)
      })
      c.addTo(group)
    }
    group.addTo(mapRef.current)
    gridLayerRef.current=group
    return()=>{if(gridLayerRef.current){gridLayerRef.current.remove();gridLayerRef.current=null}}
  },[afaiGrid,island,beaches,onBeachClick])

  // Update markers + heatmap
  useEffect(()=>{
    if(!mapRef.current)return
    markersRef.current.forEach(m=>m.remove())
    markersRef.current=[]
    heatRef.current.forEach(m=>m.remove())
    heatRef.current=[]

    // Get drift data from sargassum.json weekly forecasts
    // FIX: map sarg slug keys → beach IDs via SARG_TO_BEACH
    const driftMap={}
    if(sargData?.weekly){
      for(const[sargId,w]of Object.entries(sargData.weekly)){
        const beachId=SARG_TO_BEACH[sargId]
        if(beachId)driftMap[beachId]={drift:w.drift,dv:w.driftValue||0}
      }
    }

    // Batch all layers in groups to avoid per-marker redraws (perf: 161 addTo → 2)
    const heatGroup=L.layerGroup()
    const markerGroup=L.layerGroup()

    beaches.forEach((b,bi)=>{
      const st=ST[b.status]||ST.clean
      const isSelected=selectedBeach?.id===b.id

      // Sargassum drift visualization — animated ellipses on ocean
      if(b.afai>.15){
        const heatColor=b.afai<.3?"rgba(34,197,94,.2)":b.afai<.65?"rgba(184,122,0,.25)":"rgba(232,82,42,.3)"
        const strokeColor=b.afai<.3?"rgba(34,197,94,.1)":b.afai<.65?"rgba(184,122,0,.12)":"rgba(232,82,42,.15)"
        // Direction: east coast MQ = drift from east, west coast = from west
        const isEastCoast=b.island==="mq"?b.lng>-61.0:b.lng>-61.5
        const lngDir=isEastCoast?.02:-.02

        // Main sargassum mass — elongated ellipse toward ocean
        const mainRadius=Math.max(600,b.afai*3500)
        const main=L.circle([b.lat,b.lng+lngDir],{
          radius:mainRadius,
          fillColor:heatColor,
          color:strokeColor,
          weight:1,
          fillOpacity:Math.min(.3,b.afai*.4),
          interactive:false,
        })
        main.addTo(heatGroup)
        heatRef.current.push(main)

        // Drift trails + arrows removed — ThreatBanner handles threat communication
        if(b.afai>.3){
        }
      }

      // Beach marker
      const marker=L.circleMarker([b.lat,b.lng],{
        radius:isSelected?12:8,
        fillColor:st.c,
        color:"#fff",
        weight:isSelected?3:2,
        fillOpacity:.9,
      })
      marker.bindTooltip(b.name,{direction:"top",offset:[0,-12],
        className:"",
        permanent:false,
      })
      marker.on("click",()=>onBeachClick(b))
      marker.addTo(markerGroup)
      markersRef.current.push(marker)
    })

    // Add both groups at once (2 redraws instead of 161)
    heatGroup.addTo(mapRef.current)
    markerGroup.addTo(mapRef.current)

    // Animate drift: slowly pulse the sargassum masses
    if(driftRef.current)clearInterval(driftRef.current)
    let tick=0
    driftRef.current=setInterval(()=>{
      tick++
      heatRef.current.forEach((h,i)=>{
        if(h.setRadius&&h.options?.interactive===false){
          const baseR=h._mRadius||h.getRadius()
          if(!h._baseR)h._baseR=baseR
          const pulse=Math.sin(tick*.15+i*.3)*.08
          try{h.setRadius(h._baseR*(1+pulse))}catch(e){}
        }
      })
    },800)
    return()=>{if(driftRef.current)clearInterval(driftRef.current)}
  },[beaches,onBeachClick,selectedBeach,sargData])

  /* Threat banner + time slider removed — based on fake drift model (fixed speed/bearing) */

  if(mapError)return <div style={{padding:40,color:"red"}}>{mapError}</div>
  return(<div style={{position:"relative",width:"100%",height:"100%"}}>
    <div ref={containerRef} style={{width:"100%",height:"100%"}}/>
  </div>)
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORECAST CHART — Day 1 (today) free, days 2-7 LOCKED (blurred) for premium
   Data: 1.57% conversion — show only today free to increase premium value
   ═══════════════════════════════════════════════════════════════════════════ */
function ForecastChart({forecast,lang,onPremiumClick,isPremium,weatherDaily}){
  if(!forecast||!forecast.length)return null
  const LL=T[lang]||T.fr
  const max=Math.max(...forecast.map(d=>d.afai),.1)
  // A/B Test 4: free days (1 vs 2)
  const freeV=abVariant("free1",["control","two_free"],[.5,.5])
  const freeThreshold=freeV==="two_free"?2:1
  const lockedCount=7-freeThreshold
  // A/B Test 1: lock framing
  const lockV=abVariant("lock1",["control","loss"],[.5,.5])
  const lockCTA=lockV==="loss"
    ?(lang==="en"?"Don't miss this weekend":"Ne rate pas ce weekend")
    :(lang==="en"?"See the rest — free trial":"Voir la suite — essai gratuit")
  const lockSub=lockV==="loss"
    ?(lang==="en"?"Saturday, it'll be too late to switch beaches.":"Samedi, il sera trop tard pour changer de plage.")
    :(lang==="en"?"A ti-punch costs more. 7 days free.":"Un ti-punch coûte plus cher. 7 jours gratuits.")
  return(
    <div style={{position:"relative"}}>
      <div style={{display:"flex",gap:6,alignItems:"flex-end",height:140,padding:"8px 0"}}>
        {forecast.map((d,i)=>{
          const h=Math.max(8,(d.afai/max)*70)
          const st=ST[d.status]||ST.clean
          const isLocked=!isPremium&&i>=freeThreshold
          const hasDaily=weatherDaily&&weatherDaily.tempMax&&i<weatherDaily.tempMax.length
          const dayPrecip=hasDaily?weatherDaily.precipSum[i]:0
          const dayCloud=hasDaily?weatherDaily.cloudMean[i]:0
          const dayWind=hasDaily?weatherDaily.windMax[i]:0
          const dayTemp=hasDaily?Math.round(weatherDaily.tempMax[i]):null
          const wxIcon=hasDaily?getDayWeatherIcon(dayPrecip,dayCloud,dayWind):null
          const fType=d.type||(i===0?"observation":i<=3?"tendance":"horizon")
          const fConf=d.confidence||null
          const typeOpacity=fType==="observation"?1:fType==="tendance"?.85:.6
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              filter:isLocked?"blur(3px)":"none",opacity:isLocked?0.4:typeOpacity,
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
        {forecast[0]?.sources?"Tendance basee sur satellite + vent prevu. Fiabilite decroit avec les jours.":""}
      </div>
      {!isPremium&&<div style={{position:"absolute",top:0,right:0,bottom:0,width:`${(lockedCount/7*100).toFixed(1)}%`,
        display:"flex",alignItems:"center",justifyContent:"center",
        background:"linear-gradient(90deg,transparent,rgba(253,252,247,.7) 20%)",
        borderRadius:8}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <button onClick={()=>{track("sg_forecast_lock_click");onPremiumClick("forecast")}} className="gbtn" style={{
            padding:"10px 20px",fontSize:13,fontWeight:700,
            fontFamily:"'Anton',sans-serif",letterSpacing:".04em",textTransform:"uppercase",
          }}>
            🔒 {lockCTA}
          </button>
          <span style={{fontSize:11,color:"var(--sg-mid,#686868)",fontWeight:500,textAlign:"center"}}>
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
function useWeather(beach){
  const[data,setData]=useState(null)
  useEffect(()=>{
    if(!beach)return setData(null)
    let cancel=false
    const weatherUrl=`https://api.open-meteo.com/v1/forecast?latitude=${beach.lat}&longitude=${beach.lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index,precipitation&daily=temperature_2m_max,precipitation_sum,cloud_cover_mean,wind_speed_10m_max&timezone=America/Martinique`
    const marineUrl=`https://marine-api.open-meteo.com/v1/marine?latitude=${beach.lat}&longitude=${beach.lng}&current=wave_height,wave_direction,swell_wave_height&timezone=America/Martinique`
    Promise.allSettled([
      fetch(weatherUrl).then(r=>r.json()),
      fetch(marineUrl).then(r=>r.json()),
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
        // Marine data (graceful — may be null)
        waveHeight:m?.current?.wave_height??null,
        swellHeight:m?.current?.swell_wave_height??null,
        waveDir:m?.current?.wave_direction??null,
        // Daily forecast (7 days)
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
    try{fetch("https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec",{
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
            {total} {lang==="en"?"report"+(total>1?"s":""):"signalement"+(total>1?"s":"")} (48h)
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
  const forecast=useMemo(()=>{
    if(!beach)return null
    const sargId=BEACH_TO_SARG[beach.id]
    // 1. Direct sentinel forecast
    if(sargId&&sargData?.weekly?.[sargId]?.forecast){
      return sargData.weekly[sargId].forecast
    }
    // 2. IDW-interpolated forecast
    const interpKey=`_interp_${beach.id}`
    const enriched=sargData?._enrichedWeekly
    if(enriched?.[interpKey]?.forecast){
      return enriched[interpKey].forecast
    }
    // 3. Math.sin fallback (should not happen with 20 sentinels)
    return generateForecast(beach.afai,lang)
  },[beach?.id,lang,sargData])
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
    if(dy>100)onClose()
    else if(sheetRef.current)sheetRef.current.style.transform=""
  }

  const wazeUrl=`https://waze.com/ul?ll=${beach.lat},${beach.lng}&navigate=yes`

  return(
    <>
      <div className="backdrop" onClick={onClose}/>
      <div className="sheet" ref={sheetRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet-handle"/>

        {/* Photo (real or satellite) */}
        <div style={{height:240,background:`url(${bgImage}) center center/cover`,
          borderRadius:"0",position:"relative"}}>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(transparent 40%,var(--sg-card,#fff) 100%)"}}/>
          <button onClick={onClose} style={{position:"absolute",top:12,right:12,
            width:32,height:32,borderRadius:16,background:"rgba(0,0,0,.4)",
            border:"none",color:"#fff",fontSize:16,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{padding:"0 20px calc(80px + env(safe-area-inset-bottom,0px))"}}>
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
              const url=window.location.origin+"/plages/"+slug
              if(navigator.share){track("sg_share",{beach_id:beach.id,method:"native"});navigator.share({title:beach.name+" — Sargasses",text:(ST[beach.status]||ST.clean).l+" aujourd'hui",url}).catch(()=>{})}
              else{navigator.clipboard?.writeText(url);track("sg_share",{beach_id:beach.id})}
            }} style={{flex:0,padding:"14px 20px",borderRadius:22,border:"1.5px solid var(--sg-border)",
              background:"var(--sg-card)",cursor:"pointer",fontSize:18,fontFamily:"inherit"}}>
              📤
            </button>
            <button onClick={()=>onToggleFav(beach.id)} style={{
              flex:0,padding:"14px 20px",borderRadius:22,border:"1.5px solid var(--sg-border)",
              background:"var(--sg-card)",cursor:"pointer",fontSize:18,
              fontFamily:"inherit",
            }}>{isFav?"❤️":""}</button>
          </div>

          {/* Forecast (days 4-7 locked) */}
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:8}}>{LL.forecast}</h3>
          <ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick} isPremium={isPremium}
            weatherDaily={weather?.daily||null}/>

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
                  const nst=ST[nb.status]||ST.clean
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
      textAlign:"center"}}>
      <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
      <div style={{fontSize:14,fontWeight:700}}>{value}</div>
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
      paddingTop:"calc(140px + env(safe-area-inset-top,0px))",paddingBottom:80,
      background:"var(--sg-bg,#FDFCF7)"}}>
      <div style={{padding:"8px 16px 0",fontSize:13,color:"var(--sg-mid,#686868)",fontWeight:500}}>
        {LL.nClean.replace("{n}",nClean)} / {beaches.length}
      </div>
      <div style={{padding:"8px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {beaches.map(b=>{
          const photo=getBeachPhoto(b)
          return(
            <button key={b.id} onClick={()=>onBeachClick(b)} style={{
              display:"flex",alignItems:"center",gap:12,padding:12,
              borderRadius:16,border:"1px solid var(--sg-border)",
              background:"var(--sg-card,#fff)",cursor:"pointer",
              textAlign:"left",fontFamily:"inherit",width:"100%",
              boxShadow:"0 1px 4px rgba(0,0,0,.04)",
              transition:"background .15s",
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
          const st=ST[b.status]||ST.clean
          const isC=b.status==="clean"
          return(
            <button key={b.id} onClick={()=>{track("sg_beach_pick",{beach_id:b.id});onSelect(b.id)}}
              style={{
                display:"flex",alignItems:"center",gap:12,
                background:"rgba(255,255,255,.05)",
                border:`1px solid ${isC?"rgba(34,197,94,.15)":b.status==="avoid"?"rgba(232,82,42,.15)":"rgba(232,168,0,.15)"}`,
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
                background:isC?"rgba(34,197,94,.15)":b.status==="avoid"?"rgba(232,82,42,.2)":"rgba(232,168,0,.15)",
                color:isC?"#4ADE80":b.status==="avoid"?"#FF8066":C.goldL}}>
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
   BEST BEACH WIDGET — "Quelle plage ce weekend ?" — THE differentiator
   Scores: forecast cleanliness × distance × amenities × weather
   ═══════════════════════════════════════════════════════════════════════════ */
function BestBeachWidget({allBeaches,sargData,island,lang,isPremium,onBeachClick,userPos,onPremiumClick}){
  const pick=useMemo(()=>{
    if(!sargData?.weekly)return null
    const islandBeaches=allBeaches.filter(b=>b.island===island&&b.status==="clean")
    if(!islandBeaches.length)return null
    const scored=islandBeaches.map(b=>{
      let score=0
      const sargId=BEACH_TO_SARG[b.id]
      const wkEntry=sargId&&sargData.weekly[sargId]
      if(wkEntry){
        const wk=Array.isArray(wkEntry)?wkEntry:(wkEntry.forecast||[])
        score+=wk.filter(d=>d&&d.afai<0.15).length*10
      }else{score+=b.afai<0.15?50:b.afai<0.4?20:0}
      const dist=userPos?haversine(userPos.lat,userPos.lng,b.lat,b.lng):30
      score+=Math.max(0,30-dist)
      if(b.kids)score+=8
      if(b.parking)score+=5
      if(b.snorkel)score+=5
      return{...b,_score:score,_dist:dist}
    })
    scored.sort((a,b)=>b._score-a._score)
    return scored[0]||null
  },[allBeaches,sargData,island,userPos])
  const weather=useWeather(pick)
  if(!pick)return null
  const distLabel=userPos?Math.round(pick._dist)+"km":pick.drive?pick.drive+"min":""
  // Weekend day name
  const now=new Date(),dow=now.getDay()
  const dayLabel=dow===6?(lang==="en"?"Today":"Aujourd'hui"):dow===0?(lang==="en"?"Today":"Aujourd'hui")
    :(lang==="en"?"This Saturday":"Ce samedi")
  return(
    <div onClick={()=>{
      if(isPremium){onBeachClick(pick);track("sg_best_beach_click",{beach:pick.id})}
      else{onPremiumClick("best_beach");track("sg_best_beach_lock",{beach:pick.id})}
    }} style={{
      position:"absolute",top:"max(170px,env(safe-area-inset-top,12px) + 160px)",right:12,zIndex:750,
      background:"linear-gradient(145deg,rgba(13,30,28,.95),rgba(10,23,20,.95))",
      backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
      borderRadius:18,padding:"14px 16px",maxWidth:210,cursor:"pointer",
      border:"1px solid rgba(255,199,44,.25)",
      animation:"slideUp .5s cubic-bezier(.22,1,.36,1), goldGlow 3s ease-in-out infinite",
    }}>
      {/* Gold accent line */}
      <div style={{position:"absolute",top:0,left:16,right:16,height:2,borderRadius:1,
        background:"linear-gradient(90deg,transparent,"+C.goldL+",transparent)"}}/>
      <div style={{fontSize:8,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",
        color:C.goldL,marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
        <span style={{display:"inline-block",width:5,height:5,borderRadius:3,background:C.goldL,
          animation:"pulse 2s infinite"}}/>
        {dayLabel}
      </div>
      <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:4,lineHeight:1.2,
        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isPremium?pick.name:"••••••••••"}</div>
      <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"rgba(255,255,255,.6)",flexWrap:"wrap"}}>
        <span style={{color:C.green,fontSize:13}}>✅</span>
        <span>{lang==="en"?"Clean":"Propre"}</span>
        {distLabel&&<><span style={{color:"rgba(255,255,255,.15)"}}>·</span><span>{distLabel}</span></>}
        {pick.kids&&<span>🧒</span>}
        {pick.snorkel&&<span>🤿</span>}
      </div>
      {/* Weather preview */}
      {weather&&(
        <div style={{display:"flex",gap:8,marginTop:8,padding:"6px 0 0",
          borderTop:"1px solid rgba(255,255,255,.08)"}}>
          <span style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>🌡️{weather.temp}°</span>
          <span style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>💨{weather.wind}km/h</span>
          {weather.uv!=null&&<span style={{fontSize:10,color:weather.uv>6?"#FF8066":"rgba(255,255,255,.5)"}}>☀️UV{weather.uv}</span>}
        </div>
      )}
      {!isPremium&&(
        <div style={{marginTop:8,fontSize:10,fontWeight:700,color:C.goldL,
          display:"flex",alignItems:"center",gap:4}}>
          <span>🔓</span>{lang==="en"?"Which beach Saturday? Free trial":"Quelle plage samedi ? Essai gratuit"}
        </div>
      )}
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
              {lang==="en"?"7-day forecast for all beaches":"Prévisions 7j pour toutes les plages"}
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

  useEffect(()=>{
    if(!window.Stripe) return
    fetch("/api/create-checkout.php",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"setup"})
    }).then(r=>r.json()).then(data=>{
      if(data.error){setError(data.error);return}
      const stripe=window.Stripe(STRIPE_PK)
      stripeRef.current=stripe
      const elements=stripe.elements({
        clientSecret:data.clientSecret,
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
      pe.on("ready",()=>setReady(true))
      pe.mount(cardRef.current)
    }).catch(()=>setError("Connexion impossible"))
    return()=>{elementsRef.current?.getElement?.("payment")?.destroy?.()}
  },[])

  const handleSubmit=async()=>{
    if(!stripeRef.current||!elementsRef.current||!email.includes("@"))return
    setSubmitting(true);setError(null)
    track("sg_checkout_submit",{plan,source:source||"unknown"})
    const{error:stripeErr,setupIntent}=await stripeRef.current.confirmSetup({
      elements:elementsRef.current,
      confirmParams:{return_url:window.location.href},
      redirect:"if_required"
    })
    if(stripeErr){setError(stripeErr.message);setSubmitting(false);return}
    const res=await fetch("/api/create-checkout.php",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"subscribe",email,plan,setupIntentId:setupIntent.id,lang:lang||"fr"})
    })
    const data=await res.json()
    if(data.error){setError(data.error);setSubmitting(false);return}
    track("sg_premium_subscribed",{plan,source})
    localStorage.setItem("sg_premium","1")
    localStorage.setItem("sg_premium_trial_end",String(data.trialEnd))
    localStorage.setItem("sg_premium_email",email)
    onSuccess?.()
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <input type="email" placeholder={lang==="en"?"Your email":"Ton email"}
        value={email} onChange={e=>setEmail(e.target.value)}
        style={{width:"100%",padding:"14px 16px",fontSize:15,fontFamily:"inherit",
          background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(255,255,255,.15)",
          borderRadius:12,color:"#e6edf3",outline:"none",boxSizing:"border-box"}}/>
      <div ref={cardRef}/>
      {!ready&&!error&&<div style={{textAlign:"center",color:"rgba(255,255,255,.4)",fontSize:13,padding:12}}>
        {lang==="en"?"Loading secure form...":"Chargement du formulaire sécurisé..."}</div>}
      {error&&<p style={{color:"#ff6b6b",fontSize:12,textAlign:"center",margin:0}}>{error}</p>}
      <button onClick={handleSubmit} disabled={submitting||!ready||!email.includes("@")}
        className="gbtn" style={{width:"100%",fontSize:17,padding:"16px 24px",
          border:"none",cursor:submitting?"wait":"pointer",fontFamily:"inherit",
          opacity:(submitting||!ready||!email.includes("@"))?0.6:1}}>
        {submitting?(lang==="en"?"Processing...":"En cours...")
          :(lang==="en"?"Start free trial":"Démarrer l'essai gratuit")}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREMIUM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
function PremiumModal({onClose,lang,source,allBeaches,sargData}){
  const LL=T[lang]||T.fr
  const hasAnnual=!!STRIPE_LINK_ANNUAL
  // Compute dynamic beach change count from weekly data
  const changingCount=useMemo(()=>{
    if(!sargData?.weekly||!allBeaches)return 3
    let count=0
    for(const b of allBeaches){
      const w=sargData.weekly?.[b.sarg_id]
      if(w?.forecast?.length>=2&&w.forecast[0].status!==w.forecast[w.forecast.length-1].status)count++
    }
    return Math.max(count,1)
  },[sargData,allBeaches])
  const[plan,setPlan]=useState("monthly") // "monthly" | "annual"
  const[showCheckout,setShowCheckout]=useState(false)
  // A/B Test 2: modal value proposition
  const modalV=abVariant("modal1",["control","family"],[.5,.5])
  const isFamily=modalV==="family"
  const headline=isFamily
    ?(lang==="en"?"Protect your weekend":"Protège ton weekend")
    :`⭐ ${LL.premium}`
  const subtitle=isFamily
    ?(lang==="en"?"Your kids count on you to find the right beach.":"Tes enfants comptent sur toi pour trouver la bonne plage.")
    :(lang==="en"?"Sargassum changes every day. Know before you go.":"Les sargasses changent chaque jour. Sache avant de partir.")
  const socialProof=isFamily
    ?(lang==="en"?"Satellite data updated 4x per day":"Données satellite mises à jour 4x par jour")
    :(lang==="en"?"Used by families across Martinique and Guadeloupe":"Utilisé par les familles de Martinique et Guadeloupe")
  const anchor=isFamily
    ?(lang==="en"?`This week, ${changingCount} beach${changingCount>1?"es":""} will change status. You'll know which.`:`Cette semaine, ${changingCount} plage${changingCount>1?"s":""} va changer de statut. Tu sauras ${changingCount>1?"lesquelles":"laquelle"}.`)
    :(lang==="en"?"A wasted beach day = €80. Knowing before = €4.99/mo.":"Une journée gâchée = 80€. Savoir avant = 4,99€/mois.")
  // Season urgency
  const seasonStart=new Date("2026-05-01")
  const daysLeft=Math.max(0,Math.ceil((seasonStart-Date.now())/864e5))
  const effectivePlan=hasAnnual?plan:"monthly"
  return(
    <>
      <div className="backdrop" onClick={()=>{track("sg_premium_modal_close");onClose()}}/>
      <div style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:1100,
        background:"linear-gradient(145deg,#0D1E1C,#0A1714)",
        borderRadius:"24px 24px 0 0",padding:"28px 24px 40px",
        color:"#e6edf3",maxHeight:"80vh",overflow:"auto",
      }}>
        <div className="sheet-handle" style={{background:"rgba(255,255,255,.2)"}}/>
        <div style={{borderTop:`3px solid ${C.gold}`,borderRadius:"3px 3px 0 0",
          margin:"-8px -24px 20px",padding:0}}/>

        {/* Season urgency banner */}
        {daysLeft>0&&daysLeft<=60&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,
            padding:"10px 12px",background:"rgba(232,82,42,.12)",borderRadius:10,
            border:"1px solid rgba(232,82,42,.25)"}}>
            <span style={{fontSize:16}}>⏰</span>
            <span style={{fontSize:12,fontWeight:700,color:"#FF8066"}}>
              {lang==="en"
                ?`Sargassum season in ${daysLeft} days — be ready`
                :`Saison sargasses dans ${daysLeft} jours — sois prêt`}
            </span>
          </div>
        )}

        <h2 className="anton" style={{fontSize:28,color:"#fff",marginBottom:4}}>{headline}</h2>
        <p style={{fontSize:13,color:"#adbac7",marginBottom:6}}>{subtitle}</p>

        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,
          padding:"8px 12px",background:"rgba(255,199,44,.08)",borderRadius:10,
          border:"1px solid rgba(255,199,44,.15)"}}>
          <span style={{fontSize:14}}>{isFamily?"👨‍👩‍👧‍👦":"👥"}</span>
          <span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.7)"}}>{socialProof}</span>
        </div>

        <div style={{padding:"10px 12px",background:"rgba(255,255,255,.04)",borderRadius:10,
          borderLeft:`2px solid rgba(${isFamily?"232,82,42":"232,168,0"},.4)`,marginBottom:16,fontSize:12,
          color:"rgba(255,255,255,.5)",lineHeight:1.6}}>
          {anchor}
        </div>

        <ul style={{listStyle:"none",padding:0,margin:"0 0 16px",display:"flex",flexDirection:"column",gap:12}}>
          {LL.premiumFeatures.map((f,i)=>(
            <li key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:14}}>
              <span style={{color:C.gold,fontSize:18}}>✓</span>{f}
            </li>
          ))}
        </ul>

        {/* Plan toggle: monthly vs annual — only visible when annual Stripe link is configured */}
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

        {!showCheckout?(
          <button onClick={()=>{track("sg_premium_modal_cta",{plan:effectivePlan,source:source||"unknown"});setShowCheckout(true)}}
            className="gbtn" style={{width:"100%",textAlign:"center",fontSize:17,
              padding:"16px 24px",display:"block",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
            {LL.premiumCta} — {effectivePlan==="annual"?(lang==="en"?"€39.99/year":"39,99 €/an"):LL.premiumPrice}
          </button>
        ):(
          <StripeInlineCheckout plan={effectivePlan} lang={lang} source={source}
            onSuccess={()=>{track("sg_premium_success",{plan:effectivePlan,source:source||"unknown"});onClose()}}/>
        )}

        {/* Guarantee */}
        <div style={{textAlign:"center",marginTop:10,fontSize:11,color:"rgba(255,255,255,.4)",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span>🛡️</span>{lang==="en"?"30-day money-back guarantee":"Satisfait ou remboursé 30 jours"}
        </div>

        <button onClick={()=>{track("sg_premium_modal_close");onClose()}} style={{
          width:"100%",padding:"12px",marginTop:10,background:"none",
          border:"1px solid rgba(255,255,255,.15)",borderRadius:16,
          color:"#8b949e",fontSize:13,cursor:"pointer",fontFamily:"inherit",
        }}>{LL.close}</button>
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
      {/* Island toggle */}
      <div style={{display:"flex",borderRadius:12,overflow:"hidden",
        border:"1.5px solid var(--sg-border,rgba(0,0,0,.08))",
        background:"var(--sg-card,#fff)",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
        {["mq","gp"].map(id=>(
          <button key={id} onClick={()=>{onIslandChange(id);track("sg_island_switch",{to:id})}} style={{
            padding:"8px 14px",border:"none",cursor:"pointer",
            background:island===id?C.gold:"transparent",
            color:island===id?"#0D0D0D":"var(--sg-mid,#686868)",
            fontSize:12,fontWeight:700,fontFamily:"inherit",
            transition:"all .2s",
          }}>{id==="mq"?"MQ":"GP"}</button>
        ))}
      </div>

      {/* Live indicator — shows LIVE or Estimation based on data source */}
      <a href="https://marine.copernicus.eu/" target="_blank" rel="noopener"
        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,textDecoration:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,
          padding:"6px 12px",borderRadius:100,
          background:"var(--sg-card,#fff)",
          boxShadow:"0 2px 8px rgba(0,0,0,.06)",
          border:`1px solid ${isLive?"var(--sg-border)":"rgba(184,122,0,.2)"}`,
          fontSize:11,fontWeight:600,color:isLive?C.teal:C.amber,cursor:"pointer"}}>
          <span className={isLive?"pulse":""} style={{width:8,height:8,borderRadius:4,background:srcColor}}/>
          {srcLabel} · {beachCount||47} {lang==="en"?"beaches":"plages"}
        </div>
        <span style={{fontSize:9,fontWeight:600,color:"var(--sg-mid,#686868)",letterSpacing:".02em",
          textAlign:"center",lineHeight:1.2}}>{lang==="en"?"Real-time map":"En temps réel"}</span>
      </a>

      {/* Theme + Lang */}
      <div style={{display:"flex",gap:4}}>
        <button onClick={onThemeToggle} style={{
          width:36,height:36,borderRadius:12,border:"1px solid var(--sg-border)",
          background:"var(--sg-card,#fff)",cursor:"pointer",fontSize:16,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 2px 8px rgba(0,0,0,.06)",
        }}>{theme==="dark"?"☀️":"🌙"}</button>
        <button onClick={onLangToggle} style={{
          width:36,height:36,borderRadius:12,border:"1px solid var(--sg-border)",
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
    try{window.loadOneSignal?.()}catch(e){}
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
   INLINE EMAIL CAPTURE — Contextual in beach sheet after 2nd beach view
   ═══════════════════════════════════════════════════════════════════════════ */
function InlineEmailCapture({lang}){
  const[email,setEmail]=useState("")
  const[submitted,setSubmitted]=useState(false)
  const[dismissed,setDismissed]=useState(false)
  const tracked=useRef(false)
  const beachViews=parseInt(sessionStorage.getItem("sg_beach_views")||"0")
  if(beachViews<2||dismissed||g("sg_email_prompt",false))return null
  if(!tracked.current){tracked.current=true;track("sg_email_view")}

  const handleSubmit=e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    track("sg_email_submit",{source:"inline_beach"})
    s("sg_email",email)
    s("sg_email_prompt",true)
    setSubmitted(true)
    const island=window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    try{fetch("https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec",{
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
        {lang==="en"?"Stop wasting a Saturday at the beach":"Ne gâche plus un samedi à la plage"}
      </div>
      <div style={{fontSize:11,color:"var(--sg-mid)",marginBottom:8}}>
        {lang==="en"?"Every Friday, the 5 cleanest beaches in your inbox.":"Chaque vendredi, les 5 plages les plus propres dans ta boîte."}
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
    try{fetch("https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({type:"feedback",rating,text:text.slice(0,500),island,date:new Date().toISOString()})
    }).catch(()=>{})}catch{}
    s("sg_feedback_done",true)
    setStep(2)
    setTimeout(()=>setVisible(false),2000)
  }

  return(
    <div style={{position:"fixed",bottom:68,left:12,right:12,zIndex:755,
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
    // Show prompt after user has viewed 2 beaches (value demonstrated)
    const checkEngagement=()=>{
      const beachViews=parseInt(sessionStorage.getItem("sg_beach_views")||"0")
      if(beachViews>=2){setVisible(true);s("sg_pwa_prompt",1);track("sg_pwa_prompt_shown",{platform:isIos?"ios":"android"})}
    }
    const interval=setInterval(checkEngagement,5000)
    // Fallback: show after 60s if no beach views
    const fallback=setTimeout(()=>{if(!visible)checkEngagement()},60000)
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
      <div style={{position:"fixed",bottom:68,left:12,right:12,zIndex:760,
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
          try{fetch("https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec",{
            method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
            body:JSON.stringify({type:"checkout.session.completed",data:{object:{id:sessionId,payment_status:"paid",
              metadata:{island:window.location.hostname.includes("guadeloupe")?"GP":"MQ"}}}})
          }).catch(()=>{})}catch(ex){}
        }
        window.history.replaceState({},"",window.location.pathname)
        return true
      }
      // ?manage=1 → ouvrir le portail Stripe
      if(params.get("manage")==="1"){
        const em=localStorage.getItem("sg_premium_email")
        if(em){
          fetch("/api/create-checkout.php",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"portal",email:em})
          }).then(r=>r.json()).then(d=>{
            if(d.url)window.location.href=d.url
          }).catch(()=>{})
        }
        window.history.replaceState({},"",window.location.pathname)
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

  // Analytics: session start
  useEffect(()=>{track("sg_session_start",{island,is_premium:isPremium,is_returning:!!g("sg_seen",0)});s("sg_seen",1)},[])

  // Runtime data sources
  const[allBeaches,setAllBeaches]=useState(BEACHES_FALLBACK)
  const[imageMap,setImageMap]=useState(null)
  const[sargData,setSargData]=useState(null)
  const[historyData,setHistoryData]=useState(null)
  const[dataSource,setDataSource]=useState("loading")
  const[userPos,setUserPos]=useState(null) // {lat,lng}
  const[communityReports,setCommunityReports]=useState({})
  const[hasActiveThreat,setHasActiveThreat]=useState(false)

  const LL=T[lang]||T.fr

  // Fetch beaches-list.json at mount
  useEffect(()=>{
    fetch("/data/beaches-list.json")
      .then(r=>r.json())
      .then(data=>{
        if(Array.isArray(data)&&data.length>0)setAllBeaches(data)
      })
      .catch(()=>{})
  },[])

  // Fetch community beach reports (last 48h)
  useEffect(()=>{
    fetch("https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec?action=beach_reports")
      .then(r=>r.json())
      .then(data=>{if(data?.reports)setCommunityReports(data.reports)})
      .catch(()=>{})
  },[])

  // Fetch beaches-images.json at mount
  useEffect(()=>{
    fetch("/data/beaches-images.json")
      .then(r=>r.json())
      .then(data=>{
        if(data&&typeof data==="object")setImageMap(data)
      })
      .catch(()=>{})
  },[])

  // Fetch sargassum.json at mount and merge AFAI levels into ALL 135 beaches
  useEffect(()=>{
    fetch("/api/copernicus/sargassum.json")
      .then(r=>r.json())
      .then(data=>{
        setSargData(data)
        setDataSource(data?.source||"reference")
        if(data?.levels){
          setAllBeaches(prev=>{
            const updated=[...prev]
            // Build sentinel lookup: beachId → {lat, lng, afai, sargId}
            const sentinelMap={}
            for(const lvl of data.levels){
              const beachId=SARG_TO_BEACH[lvl.id]
              if(!beachId)continue
              const bch=updated.find(b=>b.id===beachId)
              if(bch)sentinelMap[beachId]={lat:bch.lat,lng:bch.lng,afai:lvl.afai,sargId:lvl.id}
            }
            const sentinels=Object.values(sentinelMap)
            // 1. Update sentinels with live data
            for(const lvl of data.levels){
              const beachId=SARG_TO_BEACH[lvl.id]
              if(!beachId)continue
              const idx=updated.findIndex(b=>b.id===beachId)
              if(idx>=0){
                updated[idx]={...updated[idx],afai:lvl.afai,status:statusFromAfai(lvl.afai),_src:"live",beachMemory:lvl.beachMemory||false,afaiSat:lvl.afaiSat}
              }
            }
            // 2. IDW interpolation for non-sentinel beaches
            for(let i=0;i<updated.length;i++){
              if(updated[i]._src==="live")continue // already has live data
              // FIX: threshold 15.5 (was 16) — includes Les Saintes, Marie-Galante, Désirade, gp-grande-anse sentinel
              const same=sentinels.filter(s=>
                (updated[i].island==="mq"&&s.lat<15.5)||(updated[i].island==="gp"&&s.lat>=15.5))
              const interp=interpolateIDW(updated[i],same.length>0?same:sentinels)
              if(interp!==null){
                updated[i]={...updated[i],afai:interp,status:statusFromAfai(interp),_src:"interpolated"}
              }
            }
            // 3. Interpolate weekly forecasts for non-sentinel beaches
            if(data.weekly){
              const enrichedWeekly={...data.weekly}
              for(const b of updated){
                const sargId=BEACH_TO_SARG[b.id]
                if(sargId&&data.weekly[sargId])continue // already has real forecast
                const same=sentinels.filter(s=>
                  (b.island==="mq"&&s.lat<15.5)||(b.island==="gp"&&s.lat>=15.5))
                const interp=interpolateForecast(b,same.length>0?same:sentinels,data.weekly)
                if(interp){
                  const syntheticId=`_interp_${b.id}`
                  enrichedWeekly[syntheticId]=interp
                }
              }
              data._enrichedWeekly=enrichedWeekly
            }
            // 4. Cross with community reports (source 2): elevate status if users report worse
            if(Object.keys(communityReports).length>0){
              for(let i=0;i<updated.length;i++){
                const sargId=BEACH_TO_SARG[updated[i].id]
                const rpt=communityReports[updated[i].id]||communityReports[sargId]
                if(!rpt||!rpt.total||rpt.total<3)continue // need 3+ reports for consensus
                const consensus=rpt.avoid>=rpt.moderate&&rpt.avoid>=rpt.clean?"avoid":rpt.moderate>=rpt.clean?"moderate":"clean"
                const STATUS_RANK={clean:0,moderate:1,avoid:2}
                if(STATUS_RANK[consensus]>STATUS_RANK[updated[i].status]){
                  updated[i]={...updated[i],status:consensus,_communityOverride:true,_communityTotal:rpt.total}
                }
              }
            }
            return updated
          })
        }
      })
      .catch(()=>{})
  },[communityReports])

  // Fetch history.json for trend chart
  useEffect(()=>{
    fetch("/api/copernicus/history.json")
      .then(r=>r.json())
      .then(data=>{if(data?.history)setHistoryData(data.history)})
      .catch(()=>{})
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

  const onBeachClick=useCallback(b=>{
    setSelectedBeach(b);track("sg_beach_open",{beach_id:b?.id,status:b?.status})
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
      <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>

        {/* MAP, LIST or GAME */}
        {view==="map"?(
          <ErrBound><MapView beaches={filtered} island={island} lang={lang}
            onBeachClick={onBeachClick} selectedBeach={selectedBeach} sargData={sargData} userPos={userPos}
            favorites={favorites} allBeaches={allBeaches} onThreatChange={setHasActiveThreat}
            onPremiumClick={openPremium}/></ErrBound>
        ):(
          <BeachListView beaches={filtered} onBeachClick={onBeachClick}
            favorites={favorites} lang={lang} imageMap={imageMap}/>
        )}

        {/* FLOATING UI (over map) */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:700,
          padding:"max(12px,env(safe-area-inset-top)) 16px 0",
          pointerEvents:"none",
        }}>
          <div style={{pointerEvents:"auto"}}>
            <Header island={island} onIslandChange={setIsland}
              lang={lang} onLangToggle={toggleLang}
              theme={theme} onThemeToggle={toggleTheme}
              beachCount={allBeaches.length} dataSource={dataSource}/>
            {view!=="map"&&(
              <div style={{marginTop:10}}>
                <SearchBar value={search} onChange={setSearch} lang={lang}/>
              </div>
            )}
            <div style={{marginTop:8,display:"flex",gap:6,overflowX:"auto",
              paddingBottom:4,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
              {LL.filters.map((f,i)=>(
                <FilterChip key={i} label={f} icon={LL.filtersIcon[i]}
                  active={filter===i} onClick={()=>{setFilter(i);track("sg_filter",{filter:f,index:i})}}/>
              ))}
            </div>
          </div>
        </div>

        {/* BEST BEACH WIDGET — hidden when ThreatBanner active to avoid clutter */}
        {view==="map"&&!selectedBeach&&!showOnboarding&&!hasActiveThreat&&(
          <BestBeachWidget allBeaches={allBeaches} sargData={sargData} island={island}
            lang={lang} isPremium={isPremium} onBeachClick={onBeachClick}
            userPos={userPos} onPremiumClick={openPremium}/>
        )}

        {/* WeekendBanner removed — upsell disguised as feature */}

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
        {showPremium&&<PremiumModal onClose={()=>setShowPremium(false)} lang={lang} source={premiumSource} allBeaches={allBeaches} sargData={sargData}/>}

        {/* BEACH PICKER — for new users or when "Changer" tapped */}
        {(!myBeachId||showPicker)&&view==="map"&&!selectedBeach&&(
          <BeachPicker island={island} allBeaches={allBeaches} lang={lang} userPos={userPos}
            onSelect={onPickBeach} onDismiss={myBeachId?()=>setShowPicker(false):null}/>
        )}

        {/* ReturnUserCard removed — "Bon retour" popup adds no value */}

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
              <div style={{fontSize:11,fontWeight:400,opacity:.85,marginTop:2}}>Prévisions 7 jours débloquées.</div>
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
