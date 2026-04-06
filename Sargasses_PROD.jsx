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
    filters:["Toutes","Propres","Favoris","Enfants","Snorkeling","Alertes"],
    filtersIcon:["🌊","✅","❤️","🧒","🤿","🚫"],
    navMap:"Carte",navList:"Plages",navGame:"Jeu",navPremium:"Premium",
    forecast:"Prévisions 7j",weather:"Météo",directions:"Y aller",
    fav:"Favori",addFav:"Ajouter aux favoris",removeFav:"Retirer des favoris",
    wind:"Vent",uv:"UV",temp:"Température",drive:"min",
    kids:"Enfants",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"Prévisions 7 jours, alertes push, zéro pub.",
    premiumPrice:"4,99 €/mois",premiumCta:"Essai gratuit 7 jours",
    premiumFeatures:["7 jours gratuits — sans engagement","Sois prévenu AVANT que les sargasses arrivent","Prévisions 7 jours pour 135 plages","Annule quand tu veux, zéro pub"],
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
    filters:["All","Clean","Favourites","Kids","Snorkeling","Alerts"],
    filtersIcon:["🌊","✅","❤️","🧒","🤿","🚫"],
    navMap:"Map",navList:"Beaches",navGame:"Game",navPremium:"Premium",
    forecast:"7-day forecast",weather:"Weather",directions:"Directions",
    fav:"Favourite",addFav:"Add to favourites",removeFav:"Remove from favourites",
    wind:"Wind",uv:"UV",temp:"Temperature",drive:"min",
    kids:"Kids",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"7-day forecast, push alerts, no ads.",
    premiumPrice:"€4.99/mo",premiumCta:"Free 7-day trial",
    premiumFeatures:["7 days free — no commitment","Get warned BEFORE sargassum arrives","7-day forecast for 135 beaches","Cancel anytime, zero ads"],
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
const STRIPE_URL="https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s" // 4.99 EUR/mois recurring + 7d trial
const STRIPE_ANNUAL_URL="https://buy.stripe.com/14AeVf0h5c3o4yhgAz0co0r" // 39.99 EUR/an recurring + 7d trial

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
  const tests={lock1:["control","loss"],modal1:["control","family"],onb1:["control","skip"],free1:["control","two_free"]}
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

/* ── ONBOARDING (conditional render) ── */
.onb-overlay{
  position:fixed;inset:0;z-index:2000;
  background:#FDFCF7;
  display:flex;align-items:center;justify-content:center;
  overflow:hidden;
}
.onb-overlay::before{
  content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity:.026;mix-blend-mode:multiply;
}
.onb-inner{position:relative;z-index:2;width:100%;max-width:390px;height:100%;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;}
@media(max-width:420px){.onb-inner{max-width:100%;}}

@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes float-a{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes float-b{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes dot-pulse{0%,100%{box-shadow:0 0 0 2px rgba(34,197,94,.2)}50%{box-shadow:0 0 0 5px rgba(34,197,94,.07)}}
@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
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
function MapView({beaches,island,onBeachClick,selectedBeach,sargData,userPos}){
  const containerRef=useRef(null)
  const mapRef=useRef(null)
  const markersRef=useRef([])
  const heatRef=useRef([])
  const gridLayerRef=useRef(null)
  const userMarkerRef=useRef(null)
  const driftRef=useRef(null) // animation interval
  const[mapError,setMapError]=useState(null)
  const[afaiGrid,setAfaiGrid]=useState(null)

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

        // Drift trail — smaller circles showing direction of movement
        if(b.afai>.3){
          const driftInfo=driftMap[b.id]
          const isDrifting=driftInfo?.drift==="up" // approaching coast
          const trailCount=isDrifting?3:1
          for(let i=1;i<=trailCount;i++){
            const trailLng=b.lng+lngDir*(1+i*.8)
            const trailRadius=mainRadius*(0.7-i*0.15)
            const trailOpacity=Math.max(.08,(.25-i*.06)*b.afai)
            // Deterministic offset per beach (avoids random jitter on re-render)
            const latOff=((bi*7+i*13)%100-50)*.0001
            const trail=L.circle([b.lat+latOff,trailLng],{
              radius:Math.max(300,trailRadius),
              fillColor:heatColor,
              color:"transparent",
              fillOpacity:trailOpacity,
              interactive:false,
            })
            trail.addTo(heatGroup)
            heatRef.current.push(trail)
          }

          // Arrow indicator showing drift direction
          if(driftInfo&&b.afai>.4){
            const arrowLat=b.lat
            const arrowLng=b.lng+lngDir*.5
            const arrowColor=isDrifting?"#E8522A":"#009E8E"
            const arrow=L.marker([arrowLat,arrowLng],{
              icon:L.divIcon({
                className:"",
                html:`<div style="font-size:11px;font-weight:800;color:${arrowColor};text-shadow:0 1px 3px rgba(0,0,0,.5);white-space:nowrap;pointer-events:none">${isDrifting?"⬅":"➡"} ${isDrifting?"Dérive côte":"Dispersion"}</div>`,
                iconSize:[100,20],
                iconAnchor:[50,10],
              }),
              interactive:false,
            })
            arrow.addTo(heatGroup)
            heatRef.current.push(arrow)
          }
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

  if(mapError)return <div style={{padding:40,color:"red"}}>{mapError}</div>
  return <div ref={containerRef} style={{width:"100%",height:"100%"}}/>
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
    :(lang==="en"?"Unlock 7 days":"Débloquer 7 jours")
  const lockSub=lockV==="loss"
    ?(lang==="en"?"Saturday, it'll be too late to switch beaches.":"Samedi, il sera trop tard pour changer de plage.")
    :(lang==="en"?"Cheaper than a coffee. Avoid a wasted day.":"Moins cher qu'un café. Évite une journée gâchée.")
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
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              filter:isLocked?"blur(3px)":"none",opacity:isLocked?.4:1,
              pointerEvents:isLocked?"none":"auto"}}>
              {wxIcon&&<span style={{fontSize:13,lineHeight:1}}>{wxIcon}</span>}
              {dayTemp!=null&&<span style={{fontSize:9,fontWeight:600,color:"var(--sg-mid,#686868)"}}>{dayTemp}°</span>}
              <span style={{fontSize:10,fontWeight:600,color:st.c}}>{Math.round(d.afai*100)}%</span>
              <div className="fc-bar" style={{width:"100%",height:h,background:st.c,opacity:.8}}/>
              <span style={{fontSize:10,color:"var(--sg-mid,#686868)",fontWeight:500}}>{d.day}</span>
            </div>
          )
        })}
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
          <p style={{fontSize:13,color:"var(--sg-mid,#686868)",margin:"0 0 4px"}}>
            {beach.commune} · <AfaiBadge afai={beach.afai}/> · {beach.drive} {LL.drive}
            {userPos&&beach.lat&&<> · {Math.round(haversine(userPos.lat,userPos.lng,beach.lat,beach.lng))} km</>}
          </p>
          <div style={{display:"inline-flex",alignItems:"center",gap:4,marginBottom:6,
            padding:"2px 8px",borderRadius:100,fontSize:10,fontWeight:600,
            background:beach._communityOverride?C.goldBg:beach.beachMemory?"rgba(139,105,20,.1)":beach._src==="live"?"rgba(34,197,94,.1)":"rgba(184,122,0,.08)",
            color:beach._communityOverride?C.gold:beach.beachMemory?C.sarg:beach._src==="live"?"#16A34A":"#B87A00"}}>
            <span style={{width:5,height:5,borderRadius:3,
              background:beach._communityOverride?C.gold:beach.beachMemory?C.sarg:beach._src==="live"?"#22C55E":"#B87A00"}}/>
            {beach._communityOverride?(lang==="en"?`Reported by ${beach._communityTotal} visitors`:`Signalé par ${beach._communityTotal} visiteurs`)
              :beach.beachMemory?(lang==="en"?"Beach memory (7d)":"Mémoire plage (7j)")
              :beach._src==="live"?(lang==="en"?"Satellite data":"Donnée satellite")
              :(lang==="en"?"Estimated (IDW)":"Estimation (IDW)")}
          </div>
          {/* Beach Score du Jour */}
          <BeachScoreBadge afai={beach.afai} weather={weather} lang={lang}/>

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
              {beach._communityOverride&&(<><br/><span style={{fontSize:10,fontWeight:400,opacity:.7}}>
                {lang==="en"?"Source: on-site user reports (last 48h)":"Source\u00a0: signalements visiteurs sur place (48h)"}
              </span></>)}
              {beach.beachMemory&&!beach._communityOverride&&beach.afaiSat!=null&&(<><br/><span style={{fontSize:10,fontWeight:400,opacity:.7}}>
                {lang==="en"
                  ?`Satellite now: AFAI ${Math.round(beach.afaiSat*100)}% (clean) · Adjusted for recent beaching history`
                  :`Satellite actuel\u00a0: AFAI ${Math.round(beach.afaiSat*100)}% (propre) · Ajusté selon l'historique d'échouages`}
              </span></>)}
              {!beach.beachMemory&&!beach._communityOverride&&(<><br/><span style={{fontSize:10,fontWeight:400,opacity:.7}}>
                {lang==="en"
                  ?"Offshore satellite estimate (NOAA AFAI) — not an on-site measurement."
                  :"Estimation satellite au large (NOAA AFAI) — pas une mesure sur place."}
              </span></>)}
            </p>
          )}

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

          {/* ── AXE 3: Reliability Score from history ── */}
          <ReliabilityScore beachId={beach.id} historyData={historyData} lang={lang}/>

          {/* Tags */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
            {beach.kids&&<Tag icon="🏖️" label={LL.kids}/>}
            {beach.snorkel&&<Tag icon="🏖️" label={LL.snorkel}/>}
            {beach.parking&&<Tag icon="🏖️️" label={LL.parking}/>}
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <a href={wazeUrl} target="_blank" rel="noopener" className="gbtn"
              style={{flex:1,textDecoration:"none",textAlign:"center"}}>{LL.directions}</a>
            <button onClick={()=>{
              const url=window.location.origin+"/weekend.html"
              if(navigator.share){navigator.share({title:"Sargasses ce weekend",url}).catch(()=>{})}
              else{navigator.clipboard?.writeText(url);track("sg_share")}
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
              {/* Marine conditions (waves, swell, rain) */}
              {(weather.waveHeight!=null||weather.swellHeight!=null||weather.precipitation!=null)&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:10}}>
                  {weather.waveHeight!=null&&<WeatherCard icon="🌊" label={LL.waves} value={`${weather.waveHeight}m`}/>}
                  {weather.swellHeight!=null&&<WeatherCard icon="🏄" label={LL.swell} value={`${weather.swellHeight}m`}/>}
                  <WeatherCard icon="💧" label={LL.rain} value={`${weather.precipitation}mm`}/>
                </div>
              )}
            </>
          )}

          {/* History trend chart */}
          <HistoryChart beachId={beach.id} historyData={historyData} lang={lang}/>

          {/* Season context — show value when everything is clean */}
          {beach.status==="clean"&&!isPremium&&(()=>{
            const month=new Date().getMonth() // 0-indexed
            const isOffSeason=month<4||month>8 // Nov-Apr = off-season
            if(!isOffSeason)return null
            const seasonStart=new Date(new Date().getFullYear(),4,1) // May 1
            const daysUntil=Math.max(0,Math.ceil((seasonStart-new Date())/(86400000)))
            return(
              <div style={{margin:"16px 0",padding:"14px 16px",borderRadius:14,
                background:"linear-gradient(135deg,rgba(232,168,0,.06),rgba(232,82,42,.04))",
                border:"1px solid rgba(232,168,0,.12)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:18}}>📅</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)"}}>
                      {lang==="en"?"Sargassum season starts in":"La saison des sargasses commence dans"} <span style={{color:C.amber}}>{daysUntil} {lang==="en"?"days":"jours"}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:2}}>
                      {lang==="en"
                        ?"May to August — conditions change fast. Get alerted before it happens."
                        :"Mai à août — les conditions changent vite. Sois alerté avant que ça n'arrive."}
                    </div>
                  </div>
                </div>
                <button onClick={()=>{track("sg_season_cta");onPremiumClick("season_alert")}} style={{
                  width:"100%",padding:"10px",borderRadius:10,border:"none",cursor:"pointer",
                  background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
                  fontFamily:"inherit",fontSize:12,fontWeight:700,color:C.ink}}>
                  {lang==="en"?"Get early alerts — €4.99/mo":"Alertes précoces — 4,99 €/mois"}
                </button>
              </div>
            )
          })()}

          {/* Nearby beaches (netlinking) */}
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
   ONBOARDING — Conditional render (step===0/1/2), no carousel/translateX
   Fixes: OneSignal phantom clicks, phone container cropping, slide order
   ═══════════════════════════════════════════════════════════════════════════ */
function Onboarding({onDone,island="mq",lang="fr"}){
  // Adapt content per island (Clarity: 91% new users see this — must be relevant)
  const isMQ=island==="mq"
  const siteName=isMQ?"SARGASSES.MQ":"SARGASSES.GP"
  const islandName=isMQ?"Martinique":"Guadeloupe"
  const locals=isMQ?"Martiniquais":"Guadeloupéens"
  const goodBeach=isMQ?"Grande Anse d'Arlet":"Plage de la Caravelle"
  const badBeach=isMQ?"Sainte-Anne":"Porte d'Enfer"
  const midBeach=isMQ?"Le Diamant":"Pointe des Châteaux"
  const mapLabel=isMQ?"Martinique":"Guadeloupe"
  const oceanLabel=isMQ?"Atlantique":"Caraïbes"
  // Island shape: MQ = tall thin, GP = butterfly
  const islandShape=isMQ
    ?{borderRadius:"38% 52% 44% 58%/50% 40% 54% 44%",width:120,height:90}
    :{borderRadius:"30% 70% 50% 50%/40% 40% 60% 60%",width:160,height:70}
  const[step,setStep]=useState(0)
  // A/B Test 3: skip slide 3 (premium pitch)
  const onbV=abVariant("onb1",["control","skip"],[.5,.5])

  const goStep=useCallback((n)=>{track("sg_onb_slide",{slide:n});setStep(n)},[])

  const closeOnboarding=useCallback(()=>{
    track("sg_onb_skip",{from_slide:step})
    s("sg_onb",1)
    onDone()
  },[onDone,step])

  const openStripe=useCallback(()=>{
    track("sg_onb_premium_click")
    track("sg_stripe_redirect",{source:"onboarding"})
    window.open(STRIPE_URL,"_blank")
  },[])

  return(
    <div className="onb-overlay">
      <div className="onb-inner">

      {step===0 && (
          <>{/* ═══════════════════════════════════════════
              SLIDE 1 — "Sache avant de partir"
              ═══════════════════════════════════════════ */}
          <div style={{display:"flex",flexDirection:"column",flex:1}}>
            {/* Live strip */}
            <div style={{margin:"28px 20px 0",
              background:"rgba(255,255,255,.75)",border:"1px solid rgba(232,168,0,.26)",
              borderRadius:100,padding:"8px 10px 8px 14px",
              display:"flex",alignItems:"center",justifyContent:"space-between",
              position:"relative",zIndex:10,backdropFilter:"blur(16px)",
              boxShadow:"0 2px 18px rgba(232,168,0,.09),inset 0 1px 0 rgba(255,255,255,.95)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",flexShrink:0,animation:"dot-pulse 2s ease-in-out infinite"}}/>
                <span style={{fontSize:11.5,fontWeight:600,color:C.ink}}>
                  <em style={{fontStyle:"normal",color:C.amber,fontWeight:700}}>47 plages</em> surveillées en temps réel
                </span>
              </div>
              <div style={{background:"linear-gradient(135deg,"+C.tealL+","+C.teal+")",color:"white",
                fontSize:9,fontWeight:800,letterSpacing:".14em",padding:"5px 13px",borderRadius:100,
                boxShadow:"0 3px 12px rgba(0,158,142,.32)"}}>LIVE</div>
            </div>

            {/* Hero section */}
            <div style={{position:"relative",height:310,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:60,
                background:"linear-gradient(to bottom,transparent,#FDFCF7)",pointerEvents:"none",zIndex:8}}/>

              {/* Rotating disc */}
              <div style={{width:216,height:216,borderRadius:"50%",
                background:"conic-gradient(from -10deg,#FFE898 0deg 25deg,#E8A800 25deg 65deg,#FFD040 65deg 110deg,#B87A00 110deg 155deg,#FFE07A 155deg 195deg,#E09000 195deg 240deg,#FFC72C 240deg 285deg,#B07000 285deg 325deg,#FFE898 325deg 360deg)",
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:"0 0 0 3px rgba(255,255,255,.85),0 0 0 5px rgba(232,168,0,.18),0 0 0 7px rgba(255,255,255,.12),0 8px 48px rgba(232,168,0,.28),0 20px 50px rgba(0,0,0,.08)",
                animation:"spin 22s linear infinite",zIndex:6,position:"relative"}}>
                {/* Inner disc */}
                <div style={{width:86,height:86,borderRadius:"50%",
                  background:"linear-gradient(150deg,#FFFDF5 40%,#F0EDD5 100%)",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
                  animation:"spin 22s linear infinite reverse",
                  boxShadow:"inset 0 2px 6px rgba(255,255,255,.95),inset 0 -3px 8px rgba(184,122,0,.14),0 3px 18px rgba(0,0,0,.13)",
                  position:"relative",zIndex:2}}>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,color:C.amber,letterSpacing:".07em",textAlign:"center",lineHeight:1.05}}>SAR<br/>GASSES</div>
                  <div style={{fontSize:8,fontWeight:800,color:C.teal,letterSpacing:".15em",textTransform:"uppercase"}}>.MQ</div>
                </div>
              </div>

              {/* Danger card (floating) */}
              <div style={{position:"absolute",top:42,left:14,
                background:"rgba(255,255,255,.96)",border:"1px solid rgba(232,82,42,.2)",
                boxShadow:"0 6px 24px rgba(232,82,42,.1),inset 0 1px 0 white",
                borderRadius:16,padding:"10px 14px",
                display:"flex",alignItems:"center",gap:9,
                animation:"float-b 4s ease-in-out .8s infinite",zIndex:12}}>
                <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,#FFE4DC,#FFCAB8)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}></div>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <div style={{fontSize:9.5,fontWeight:700,color:C.red,letterSpacing:".08em",textTransform:"uppercase"}}>Éviter</div>
                  <div style={{fontSize:12,fontWeight:800,color:C.ink,lineHeight:1.2}}>{badBeach}</div>
                  <div style={{fontSize:10,fontWeight:500,color:C.mid}}>Sargasses ce matin</div>
                </div>
              </div>

              {/* Good card (floating) */}
              <div style={{position:"absolute",bottom:36,right:14,
                background:"rgba(255,255,255,.97)",border:"1px solid rgba(0,158,142,.13)",
                boxShadow:"0 8px 32px rgba(0,0,0,.08),inset 0 1px 0 white",
                borderRadius:18,padding:"11px 15px",
                display:"flex",alignItems:"center",gap:10,
                animation:"float-a 3.6s ease-in-out infinite",zIndex:12,minWidth:172}}>
                <div style={{width:34,height:34,borderRadius:11,background:"linear-gradient(135deg,#D6F5EF,#A8EDE4)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>🛰️</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:C.ink,whiteSpace:"nowrap"}}>{goodBeach}</div>
                  <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:C.teal}}>
                    <span style={{width:12,height:12,borderRadius:"50%",background:C.teal,
                      display:"inline-flex",alignItems:"center",justifyContent:"center",
                      fontSize:7,color:"white",flexShrink:0}}>✓</span>
                    Propre aujourd'hui
                  </div>
                </div>
              </div>
            </div>

            {/* Copy section */}
            <div style={{padding:"8px 28px 0",flex:1,display:"flex",flexDirection:"column"}}>
              <h1 style={{fontFamily:"'Anton',sans-serif",fontSize:68,lineHeight:.88,letterSpacing:"-.025em",
                textTransform:"uppercase",color:C.ink,marginBottom:10}}>
                <span style={{color:C.teal}}>Sache</span><br/>
                <span style={{display:"inline-block",background:"linear-gradient(138deg,#FFD860 0%,#E8A800 48%,#B07000 100%)",
                  WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",position:"relative"}}>avant</span><br/>
                <span>de partir.</span>
              </h1>
              <p style={{fontSize:14,color:C.mid,fontWeight:400,lineHeight:1.6,marginBottom:14,maxWidth:270}}>
                Tu pars dans 30 minutes ? <strong style={{color:C.ink,fontWeight:700}}>Vérifie en 5 secondes</strong> si ta plage est propre.
              </p>

              {/* Social proof */}
              <div style={{display:"flex",alignItems:"center",marginBottom:14,padding:"9px 13px",
                background:"rgba(255,199,44,.07)",border:"1px solid rgba(232,168,0,.13)",borderRadius:14}}>
                <div style={{fontSize:11,letterSpacing:-1,flexShrink:0,marginRight:9}}>⭐⭐⭐⭐⭐</div>
                <div style={{display:"flex",flexShrink:0}}>
                  {[["#FF6B6B","#FF8E53","M"],["#4ECDC4","#44A08D","J"],["#A18CD1","#FBC2EB","S"],["#FDDB92","#D1913C","R"]].map(([a,b,l],i)=>(
                    <div key={i} style={{width:25,height:25,borderRadius:"50%",border:"2px solid #FDFCF7",marginRight:-7,
                      background:`linear-gradient(135deg,${a},${b})`,display:"flex",alignItems:"center",
                      justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>{l}</div>
                  ))}
                </div>
                <div style={{marginLeft:15,fontSize:11.5,fontWeight:500,color:C.mid,lineHeight:1.4}}>
                  <strong style={{color:C.ink,fontWeight:700}}>135 plages</strong> surveillées par satellite en temps réel
                </div>
              </div>

              {/* CTA — INSIDE slide 1 */}
              <div style={{marginTop:20,paddingBottom:50,display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>goStep(1)} style={{
                  background:"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)",
                  color:C.ink,border:"none",borderRadius:22,padding:"19px 20px 19px 28px",
                  fontFamily:"'Anton',sans-serif",fontSize:21,letterSpacing:".06em",textTransform:"uppercase",
                  cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",
                  boxShadow:"inset 0 1px 0 rgba(255,255,255,.58),inset 0 -2px 0 rgba(0,0,0,.11),0 8px 28px rgba(232,168,0,.48),0 2px 8px rgba(232,168,0,.22)",
                  position:"relative",overflow:"hidden"}}>
                  <span style={{position:"relative",zIndex:1}}>Voir les plages propres</span>
                  <span style={{width:44,height:44,background:"rgba(0,0,0,.11)",borderRadius:"50%",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
                    flexShrink:0,position:"relative",zIndex:1}}>→</span>
                </button>
                <div style={{textAlign:"center",fontSize:11,color:C.mid,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  Gratuit<span style={{width:3,height:3,borderRadius:"50%",background:"rgba(104,104,104,.35)"}}/>Sans inscription<span style={{width:3,height:3,borderRadius:"50%",background:"rgba(104,104,104,.35)"}}/>Mis à jour chaque jour
                </div>
                <button onClick={closeOnboarding} style={{textAlign:"center",fontSize:12.5,fontWeight:500,color:C.mid,
                  background:"none",border:"none",cursor:"pointer",padding:4,fontFamily:"inherit"}}>
                  Déjà un compte ? <span style={{color:C.teal,fontWeight:700,textDecoration:"underline",textUnderlineOffset:3}}>Se connecter</span>
                </button>
              </div>
            </div>
          </div>
          </>
      )}

      {step===1 && (
          <>{/* ═══════════════════════════════════════════
              SLIDE 2 — "Vert = tu pars. Rouge = tu évites."
              ═══════════════════════════════════════════ */}
          <div style={{display:"flex",flexDirection:"column",flex:1}}>
            {/* Header */}
            <div style={{padding:"28px 22px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,letterSpacing:".05em",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:20,height:20,borderRadius:"50%",
                  background:"conic-gradient(from -10deg,#FFE898 0deg 30deg,#E8A800 30deg 80deg,#FFD040 80deg 130deg,#B87A00 130deg 180deg,#FFE898 180deg 360deg)",
                  animation:"spin 20s linear infinite",boxShadow:"0 2px 8px rgba(232,168,0,.28)"}}/>
                {siteName}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10.5,fontWeight:600,color:C.mid}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#22C55E",animation:"dot-pulse 2s ease-in-out infinite"}}/>
                En direct
              </div>
            </div>

            <div style={{padding:"16px 22px 0",fontSize:12.5,fontStyle:"italic",color:C.mid}}>La carte que tu aurais voulu avoir.</div>

            <div style={{padding:"6px 22px 0",fontFamily:"'Anton',sans-serif",fontSize:42,lineHeight:.9,
              letterSpacing:"-.02em",textTransform:"uppercase",color:C.ink}}>
              <span style={{color:C.teal}}>Vert</span> = tu pars.<br/>Rouge = tu évites.
            </div>

            {/* Satellite badge */}
            <div style={{margin:"10px 22px 0",display:"inline-flex",alignItems:"center",gap:6,
              background:"rgba(0,158,142,.07)",border:"1px solid rgba(0,158,142,.12)",
              borderRadius:100,padding:"5px 12px",position:"relative",overflow:"hidden"}}>
              <span style={{fontSize:11}}>🛰️</span>
              <span style={{fontSize:9.5,fontWeight:700,color:C.teal}}>Sentinel-2 · ESA Copernicus</span>
            </div>

            {/* Proof */}
            <div style={{margin:"6px 22px 0",fontSize:11,color:C.mid,display:"flex",alignItems:"center",gap:5}}>
              <span style={{color:"#16A34A",fontWeight:700}}>✓</span>
              Données NOAA AFAI mises à jour <strong style={{color:C.ink}}>4x par jour</strong>
            </div>

            {/* Map zone */}
            <div style={{margin:"12px 22px 0",background:"linear-gradient(145deg,#D8EFF8 0%,#C8E4F4 50%,#D0EEE8 100%)",
              border:"1px solid rgba(0,158,142,.1)",borderRadius:22,position:"relative",height:185,overflow:"hidden"}}>
              <div style={{position:"absolute",top:10,left:14,fontSize:8,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"rgba(0,80,40,.4)"}}>🌿 {mapLabel}</div>
              <div style={{position:"absolute",bottom:10,left:14,fontSize:8.5,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"rgba(0,80,120,.4)"}}>🌊 {oceanLabel}</div>
              {/* Island shape — adapté MQ ou GP */}
              <div style={{position:"absolute",top:"50%",left:"52%",transform:"translate(-50%,-52%)",
                width:islandShape.width,height:islandShape.height,background:"linear-gradient(145deg,#C8E8C0,#B8D8B0)",
                borderRadius:islandShape.borderRadius,boxShadow:"0 4px 14px rgba(0,80,40,.12)"}}/>
              {/* Pins */}
              {[[28,61,"g"],[45,74,"g"],[65,57,"r"],[34,35,"o"],[57,31,"g"],[72,43,"r"],[19,49,"g"],[51,65,"o"]].map(([t,l,c],i)=>{
                const bg=c==="g"?"#22C55E":c==="r"?C.red:C.goldL
                return(
                  <div key={i} style={{position:"absolute",top:t+"%",left:l+"%",transform:"translate(-50%,-50%)"}}>
                    <div style={{width:12,height:12,borderRadius:"50%",border:"2px solid white",background:bg,
                      boxShadow:"0 1px 6px rgba(0,0,0,.2)",position:"relative",zIndex:2}}/>
                  </div>
                )
              })}
              {/* Legend */}
              <div style={{position:"absolute",bottom:8,right:10,display:"flex",gap:8}}>
                {[["Propre","#22C55E"],["Modéré",C.goldL],["Éviter",C.red]].map(([lab,col],i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:8,fontWeight:700,color:C.mid}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:col,border:"1.5px solid white"}}/>
                    {lab}
                  </div>
                ))}
              </div>
            </div>

            {/* Beach list rows */}
            <div style={{margin:"10px 22px 0",display:"flex",flexDirection:"column",gap:6}}>
              {[
                ["🏖️",goodBeach,isMQ?"Sud · 12 km":"Est · 38 km","✓ Propre","g"],
                ["⛱️",midBeach,isMQ?"Sud · 25 km":"Est · 52 km","⚡ Modéré","o"],
                ["🌊",badBeach,isMQ?"Extrême Sud · 38 km":isMQ?"Nord · 55 km":"Nord · 55 km","🚫 Éviter","r"],
              ].map(([emoji,name,dist,statusTxt,cls],i)=>(
                <div key={i} style={{background:"white",borderRadius:14,padding:"10px 14px",
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  boxShadow:"0 2px 10px rgba(0,0,0,.04)",border:"1px solid rgba(0,0,0,.04)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9}}>
                    <span style={{fontSize:17}}>{emoji}</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:C.ink}}>{name}</div>
                      <div style={{fontSize:10,color:C.mid}}>{dist}</div>
                    </div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:100,
                    background:cls==="g"?C.greenBg:cls==="r"?C.redBg:C.amberBg,
                    color:cls==="g"?C.greenL:cls==="r"?C.red:C.amber}}>{statusTxt}</span>
                </div>
              ))}
            </div>

            {/* CTA — INSIDE slide 2 */}
            <div style={{marginTop:16,padding:"10px 22px 48px"}}>
              <button onClick={()=>{onbV==="skip"?closeOnboarding():goStep(2)}} style={{
                width:"100%",background:"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)",
                color:C.ink,border:"none",borderRadius:20,padding:"17px 20px",
                fontFamily:"'Anton',sans-serif",fontSize:19,letterSpacing:".06em",textTransform:"uppercase",
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",
                boxShadow:"inset 0 1px 0 rgba(255,255,255,.55),0 8px 28px rgba(232,168,0,.44)",
                position:"relative",overflow:"hidden"}}>
                <span style={{position:"relative",zIndex:1}}>{onbV==="skip"?"Voir la carte":"Choisir ma plage"}</span>
                <div style={{width:36,height:36,background:"rgba(0,0,0,.11)",borderRadius:"50%",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,
                  position:"relative",zIndex:1}}>→</div>
              </button>
            </div>
          </div>
          </>
      )}

      {step===2 && (
          <>{/* ═══════════════════════════════════════════
              SLIDE 3 — Premium / Forecast
              ═══════════════════════════════════════════ */}
          <div style={{display:"flex",flexDirection:"column",flex:1}}>
            {/* Header */}
            <div style={{padding:"28px 22px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,letterSpacing:".05em",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:20,height:20,borderRadius:"50%",
                  background:"conic-gradient(from -10deg,#FFE898 0deg 30deg,#E8A800 30deg 80deg,#FFD040 80deg 130deg,#B87A00 130deg 180deg,#FFE898 180deg 360deg)",
                  animation:"spin 20s linear infinite",boxShadow:"0 2px 8px rgba(232,168,0,.28)"}}/>
                {siteName}
              </div>
              <button onClick={closeOnboarding} style={{fontSize:12,fontWeight:600,color:C.mid,background:"none",
                border:"none",cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,fontFamily:"inherit"}}>Passer</button>
            </div>

            <div style={{padding:"18px 22px 0",fontSize:12.5,fontStyle:"italic",color:C.mid}}>Pour les weekends qui comptent vraiment.</div>

            <div style={{padding:"6px 22px 0",fontFamily:"'Anton',sans-serif",fontSize:40,lineHeight:.9,
              letterSpacing:"-.02em",textTransform:"uppercase",color:C.ink,marginBottom:6}}>
              Sois <span style={{background:"linear-gradient(138deg,#FFD860,#E8A800 50%,#B07000)",
                WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>prévenu</span><br/>
              7 jours<br/>à l'avance.
            </div>

            <p style={{padding:"0 22px",fontSize:13,color:C.mid,lineHeight:1.55,marginBottom:14}}>
              Les données du jour c'est bien. <strong style={{color:C.ink,fontWeight:700}}>Savoir ce qui arrive ce weekend</strong>, c'est mieux.
            </p>

            {/* Premium card */}
            <div style={{margin:"0 22px",background:"linear-gradient(145deg,#0D1E1C,#0A1714)",
              borderRadius:26,padding:20,position:"relative",overflow:"hidden",
              boxShadow:"0 16px 48px rgba(0,0,0,.18)"}}>
              {/* Gold top border */}
              <div style={{position:"absolute",top:0,left:0,right:0,height:1,
                background:"linear-gradient(90deg,transparent,"+C.goldL+",transparent)"}}/>
              {/* Glow */}
              <div style={{position:"absolute",top:-50,right:-30,width:160,height:160,borderRadius:"50%",
                background:"radial-gradient(circle,rgba(232,168,0,.1) 0%,transparent 70%)"}}/>

              {/* PREMIUM badge */}
              <div style={{display:"inline-flex",alignItems:"center",gap:5,
                background:"rgba(255,199,44,.12)",border:"1px solid rgba(255,199,44,.18)",
                borderRadius:100,padding:"4px 11px",fontSize:9.5,fontWeight:700,
                letterSpacing:".1em",textTransform:"uppercase",color:C.goldL,marginBottom:12}}>
                <span style={{width:4,height:4,borderRadius:"50%",background:C.goldL}}/>PREMIUM
              </div>

              {/* Price */}
              <div style={{marginBottom:6}}>
                <div style={{display:"flex",alignItems:"baseline",gap:3}}>
                  <span style={{fontSize:20,fontWeight:700,color:"rgba(255,255,255,.6)",marginTop:6}}>€</span>
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:52,color:"white",lineHeight:1,letterSpacing:"-.02em"}}>4,99</span>
                  <span style={{fontSize:13,color:"rgba(255,255,255,.35)",fontWeight:500,alignSelf:"flex-end",marginBottom:4}}>/ mois</span>
                </div>
              </div>

              {/* Price anchor */}
              <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:14,lineHeight:1.5,
                padding:"8px 10px",background:"rgba(255,255,255,.04)",borderRadius:10,
                borderLeft:"2px solid rgba(232,168,0,.3)"}}>
                Une journée plage pour 4 personnes = <strong style={{color:"rgba(255,255,255,.6)"}}>80€ minimum.</strong><br/>
                Savoir à l'avance = <strong style={{color:"rgba(255,255,255,.6)"}}>4,99€.</strong>
              </div>

              {/* Forecast preview */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9.5,fontWeight:700,color:"rgba(255,255,255,.4)",
                  letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>Prévisions de ta semaine</div>
                <div style={{display:"flex",gap:5}}>
                  {[
                    ["Lun","️","Propre","g",false],
                    ["Mar","️","Propre","g",false],
                    ["Mer","⚡","Modéré","o","semi"],
                    ["Jeu","🚫","Éviter","r",true],
                    ["Ven","🚫","Éviter","r",true],
                    ["Sam","⚡","Modéré","o",true],
                    ["Dim","️","Propre","g",true],
                  ].map(([day,ic,st,cl,locked],i)=>(
                    <div key={i} style={{flex:1,background:"rgba(255,255,255,.05)",borderRadius:10,
                      padding:"8px 6px",textAlign:"center",display:"flex",flexDirection:"column",
                      alignItems:"center",gap:3,
                      filter:locked===true?"blur(3px)":locked==="semi"?"blur(1.5px)":"none",
                      opacity:locked===true?.35:locked==="semi"?.5:1,
                      pointerEvents:locked?"none":"auto"}}>
                      <span style={{fontSize:8.5,fontWeight:700,color:"rgba(255,255,255,.4)"}}>{day}</span>
                      <span style={{fontSize:15}}>{ic}</span>
                      <span style={{fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:100,
                        background:cl==="g"?"rgba(34,197,94,.15)":cl==="r"?"rgba(232,82,42,.2)":"rgba(232,168,0,.15)",
                        color:cl==="g"?"#4ADE80":cl==="r"?"#FF8066":C.goldL}}>{st}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unlock banner */}
              <div style={{position:"relative",marginTop:-28,marginBottom:14,
                background:"linear-gradient(0deg,rgba(13,30,28,.95) 60%,transparent)",
                padding:"20px 8px 8px",textAlign:"center",fontSize:10.5,fontWeight:600,
                color:"rgba(255,255,255,.5)"}}>
                 Débloque les 5 prochains jours
              </div>

              {/* Features */}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                {[
                  ["Prévisions 7 jours","· dérive satellite"],
                  ["Alertes","avant que ça arrive"],
                  ["Annulation","à tout moment"],
                ].map(([bold,rest],i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:9}}>
                    <div style={{width:18,height:18,borderRadius:"50%",
                      background:"rgba(0,158,142,.18)",border:"1px solid rgba(0,158,142,.28)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:9,color:C.tealL,flexShrink:0}}>✓</div>
                    <span style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>
                      <strong style={{color:"#fff"}}>{bold}</strong> {rest}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA — INSIDE slide 3 (premium card) */}
              <button onClick={openStripe} style={{
                width:"100%",background:"linear-gradient(135deg,"+C.goldL+","+C.gold+")",
                color:C.ink,border:"none",borderRadius:16,padding:"16px 20px",
                fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:".05em",textTransform:"uppercase",
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",
                boxShadow:"0 8px 24px rgba(232,168,0,.38),inset 0 1px 0 rgba(255,255,255,.4)",
                position:"relative",overflow:"hidden",transition:"transform .12s"}}>
                <span style={{position:"relative",zIndex:1}}>Débloquer mes prévisions</span>
                <span style={{width:36,height:36,background:"rgba(0,0,0,.15)",borderRadius:"50%",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
                  position:"relative",zIndex:1}}>→</span>
              </button>
            </div>

            {/* Testimonial */}
            <div style={{margin:"12px 22px 0",background:"rgba(255,255,255,.6)",
              border:"1px solid rgba(232,168,0,.12)",borderRadius:14,padding:"12px 14px",
              display:"flex",gap:10,alignItems:"flex-start"}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#4ECDC4,#44A08D)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                color:"#fff",flexShrink:0}}>M</div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.ink,marginBottom:3}}>Marie · Schoelcher</div>
                <div style={{fontSize:11.5,color:C.mid,lineHeight:1.5,fontStyle:"italic"}}>
                  "Grâce aux alertes, j'ai évité une journée perdue avec mes enfants."
                </div>
              </div>
            </div>

            {/* Free entry */}
            <div style={{padding:"10px 22px 0",textAlign:"center",fontSize:12,color:C.mid}}>
              Pas maintenant —{" "}
              <button onClick={closeOnboarding} style={{background:"none",border:"none",cursor:"pointer",
                color:C.teal,fontWeight:700,fontSize:12,textDecoration:"underline",textUnderlineOffset:3,
                fontFamily:"'Bricolage Grotesque',sans-serif"}}>commencer gratuitement</button>
            </div>

            {/* Micro */}
            <div style={{padding:"6px 22px 48px",textAlign:"center",fontSize:10.5,color:"rgba(104,104,104,.6)",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              Paiement sécurisé<span style={{width:3,height:3,borderRadius:"50%",background:"rgba(104,104,104,.25)"}}/>Annulation à tout moment
            </div>
          </div>
          </>
      )}

      </div>{/* /onb-inner */}

      {/* Dots — fixed at bottom, outside scroll */}
      <div style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",
        display:"flex",gap:7,zIndex:30}}>
        {(onbV==="skip"?[0,1]:[0,1,2]).map(i=>(
          <button key={i} onClick={()=>goStep(i)}
            style={{width:i===step?22:7,height:7,borderRadius:i===step?4:7,
              background:i===step?"#E8A800":"rgba(0,0,0,.15)",
              border:"none",cursor:"pointer",transition:"all .3s",padding:0}}/>
        ))}
      </div>
    </div>
  )
}

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
      position:"absolute",top:"max(120px,env(safe-area-inset-top,12px) + 110px)",right:12,zIndex:750,
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
          <span>🔓</span>{lang==="en"?"Try free 7 days":"Essai gratuit 7 jours"}
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
   PREMIUM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
function PremiumModal({onClose,lang}){
  const LL=T[lang]||T.fr
  const hasAnnual=!!STRIPE_ANNUAL_URL
  const[plan,setPlan]=useState("monthly") // "monthly" | "annual"
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
    ?(lang==="en"?"This week, 3 beaches will change status. You'll know which ones.":"Cette semaine, 3 plages vont changer de statut. Tu sauras lesquelles.")
    :(lang==="en"?"A wasted beach day = €80. Knowing before = €4.99/mo.":"Une journée gâchée = 80€. Savoir avant = 4,99€/mois.")
  // Season urgency
  const seasonStart=new Date("2026-05-01")
  const daysLeft=Math.max(0,Math.ceil((seasonStart-Date.now())/864e5))
  const effectivePlan=hasAnnual?plan:"monthly"
  const stripeUrl=effectivePlan==="annual"?STRIPE_ANNUAL_URL:STRIPE_URL
  const priceLabel=effectivePlan==="annual"
    ?(lang==="en"?"€39.99/year":"39,99 €/an")
    :LL.premiumPrice
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

        <a href={stripeUrl} target="_blank" rel="noopener" className="gbtn"
          onClick={()=>track("sg_premium_modal_cta",{plan:effectivePlan})}
          style={{width:"100%",textDecoration:"none",textAlign:"center",
            fontSize:17,padding:"16px 24px",display:"block"}}>
          {LL.premiumCta} — {priceLabel}
        </a>

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
          <button key={id} onClick={()=>onIslandChange(id)} style={{
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
   PUSH PROMPT — Custom French notification prompt (replaces OneSignal slidedown)
   ═══════════════════════════════════════════════════════════════════════════ */
function PushPrompt({onClose}){
  const timerRef=useRef(null)
  const[visible,setVisible]=useState(false)

  useEffect(()=>{
    // Slide in after a short delay
    const showTimer=setTimeout(()=>setVisible(true),80)
    // Auto-dismiss after 10 seconds
    timerRef.current=setTimeout(()=>{setVisible(false);setTimeout(onClose,350)},10000)
    return()=>{clearTimeout(showTimer);clearTimeout(timerRef.current)}
  },[onClose])

  const handleActivate=useCallback(()=>{
    track("sg_push_accept")
    clearTimeout(timerRef.current)
    try{window.loadOneSignal?.()}catch(e){}
    setVisible(false)
    setTimeout(onClose,350)
  },[onClose])

  const handleDismiss=useCallback(()=>{
    track("sg_push_dismiss")
    clearTimeout(timerRef.current)
    setVisible(false)
    setTimeout(onClose,350)
  },[onClose])

  return(
    <div style={{
      position:"fixed",top:0,left:0,right:0,zIndex:1500,
      display:"flex",justifyContent:"center",
      padding:"max(12px,env(safe-area-inset-top)) 16px 0",
      pointerEvents:"none",
    }}>
      <div style={{
        pointerEvents:"auto",
        maxWidth:380,width:"100%",
        background:"rgba(255,255,255,.88)",
        backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        borderRadius:16,
        border:"1px solid rgba(232,168,0,.18)",
        boxShadow:"0 4px 24px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06)",
        padding:"16px 18px",
        transform:visible?"translateY(0)":"translateY(-100%)",
        opacity:visible?1:0,
        transition:"transform .35s cubic-bezier(.22,1,.36,1),opacity .35s ease",
      }}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:22,lineHeight:"28px",flexShrink:0}} role="img" aria-label="bell">🔔</span>
          <div style={{flex:1,minWidth:0}}>
            <p style={{margin:0,fontSize:13.5,fontWeight:600,color:C.ink,lineHeight:"19px"}}>
              Recevez une alerte quand les sargasses arrivent à votre plage.
            </p>
            <div style={{display:"flex",gap:10,marginTop:12}}>
              <button onClick={handleActivate} style={{
                flex:1,padding:"9px 0",borderRadius:10,border:"none",cursor:"pointer",
                background:C.gold,color:"#fff",fontSize:13,fontWeight:700,
                boxShadow:"0 2px 8px rgba(232,168,0,.25)",
              }}>Activer</button>
              <button onClick={handleDismiss} style={{
                flex:1,padding:"9px 0",borderRadius:10,border:"none",cursor:"pointer",
                background:"rgba(0,0,0,.05)",color:C.mid,fontSize:13,fontWeight:600,
              }}>Plus tard</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMAIL CAPTURE — Weekly sargasses bulletin signup
   ═══════════════════════════════════════════════════════════════════════════ */
function EmailCapture(){
  const[visible,setVisible]=useState(false)
  const[email,setEmail]=useState("")
  const[submitted,setSubmitted]=useState(false)
  const timerRef=useRef(null)

  useEffect(()=>{
    // Only show once
    if(g("sg_email_prompt",false))return
    const showTimer=setTimeout(()=>setVisible(true),15000)
    // Auto-dismiss after 30s of visibility
    timerRef.current=setTimeout(()=>{setVisible(false)},45000) // 15s delay + 30s visible
    return()=>{clearTimeout(showTimer);clearTimeout(timerRef.current)}
  },[])

  const handleSubmit=useCallback(e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    track("sg_email_submit")
    s("sg_email",email)
    s("sg_email_prompt",true)
    setSubmitted(true)
    clearTimeout(timerRef.current)
    setTimeout(()=>setVisible(false),2000)
    // Send to Brevo (Sendinblue) free API — or fallback beacon
    const island=window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    try{
      // Google Sheets webhook (Apps Script) — illimité, gratuit
      fetch("https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec",{
        method:"POST",mode:"no-cors",
        headers:{"Content-Type":"text/plain"},
        body:JSON.stringify({email,island,source:"sargasses-app",date:new Date().toISOString()})
      }).catch(()=>{})
    }catch(ex){}
  },[email])

  const handleDismiss=useCallback(()=>{
    s("sg_email_prompt",true)
    clearTimeout(timerRef.current)
    setVisible(false)
  },[])

  if(!visible)return null

  return(
    <div style={{
      position:"fixed",bottom:68,left:0,right:0,zIndex:1200,
      display:"flex",justifyContent:"center",
      padding:"0 12px",
      pointerEvents:"none",
    }}>
      <div style={{
        pointerEvents:"auto",
        maxWidth:400,width:"100%",
        background:"rgba(255,255,255,.88)",
        backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        borderRadius:16,
        border:"1px solid rgba(232,168,0,.18)",
        boxShadow:"0 4px 24px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06)",
        padding:"14px 16px",
        animation:"slideUp .35s cubic-bezier(.22,1,.36,1)",
      }}>
        {submitted?(
          <p style={{margin:0,fontSize:14,fontWeight:600,color:C.green,textAlign:"center"}}>
            Merci ! Tu recevras le bulletin chaque semaine.
          </p>
        ):(
          <>
            <p style={{margin:"0 0 10px",fontSize:13.5,fontWeight:600,color:C.ink,lineHeight:"19px"}}>
              {"📧"} Reçois le bulletin sargasses chaque semaine
            </p>
            <form onSubmit={handleSubmit} style={{display:"flex",gap:8,alignItems:"center"}}>
              <input
                type="email"
                placeholder="ton@email.com"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                style={{
                  flex:1,padding:"9px 12px",borderRadius:10,
                  border:"1px solid rgba(0,0,0,.1)",
                  fontSize:14,fontFamily:"inherit",
                  background:"rgba(255,255,255,.7)",
                  outline:"none",minWidth:0,
                }}
              />
              <button type="submit" style={{
                padding:"9px 16px",borderRadius:10,border:"none",cursor:"pointer",
                background:"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)",
                color:"#fff",fontSize:13,fontWeight:700,whiteSpace:"nowrap",
                boxShadow:"0 2px 8px rgba(232,168,0,.25)",
              }}>S'inscrire</button>
            </form>
            <button onClick={handleDismiss} style={{
              display:"block",margin:"8px auto 0",background:"none",border:"none",
              cursor:"pointer",color:C.mid,fontSize:12,fontWeight:500,
              textDecoration:"underline",padding:0,
            }}>Plus tard</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXIT-INTENT POPUP — last chance email capture before user leaves
   Desktop: mouseleave at top of viewport. Mobile: fast scroll-up.
   Shows once only. Skips if email already captured or premium.
   ═══════════════════════════════════════════════════════════════════════════ */
function ExitIntent(){
  const[visible,setVisible]=useState(false)
  const[email,setEmail]=useState("")
  const[submitted,setSubmitted]=useState(false)
  const shownRef=useRef(false)

  useEffect(()=>{
    if(g("sg_exit_shown",false)||g("sg_email_prompt",false)||g("sg_premium",false))return
    const arm=setTimeout(()=>{
      const onLeave=e=>{
        if(e.clientY<=0&&!shownRef.current){
          shownRef.current=true
          setVisible(true)
          track("sg_exit_intent_show")
          document.removeEventListener("mouseout",onLeave)
        }
      }
      document.addEventListener("mouseout",onLeave)
      let lastY=window.scrollY,lastT=Date.now()
      const onScroll=()=>{
        const y=window.scrollY,t=Date.now(),dt=t-lastT
        if(dt>50&&dt<300){
          const speed=(lastY-y)/dt
          if(speed>2&&y<100&&!shownRef.current){
            shownRef.current=true
            setVisible(true)
            track("sg_exit_intent_show")
            window.removeEventListener("scroll",onScroll)
          }
        }
        lastY=y;lastT=t
      }
      window.addEventListener("scroll",onScroll,{passive:true})
      return()=>{
        document.removeEventListener("mouseout",onLeave)
        window.removeEventListener("scroll",onScroll)
      }
    },8000)
    return()=>clearTimeout(arm)
  },[])

  const handleSubmit=useCallback(e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    track("sg_exit_email_submit")
    s("sg_email",email)
    s("sg_email_prompt",true)
    s("sg_exit_shown",true)
    setSubmitted(true)
    setTimeout(()=>setVisible(false),2000)
    const island=window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    try{fetch("https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({email,island,source:"exit-intent",date:new Date().toISOString()})
    }).catch(()=>{})}catch{}
  },[email])

  const handleDismiss=useCallback(()=>{
    s("sg_exit_shown",true)
    setVisible(false)
    track("sg_exit_intent_dismiss")
  },[])

  if(!visible)return null

  return(
    <div style={{
      position:"fixed",inset:0,zIndex:9998,
      background:"rgba(0,0,0,.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",
      display:"flex",alignItems:"center",justifyContent:"center",
      padding:16,animation:"fadeIn .25s ease",
    }} onClick={handleDismiss}>
      <div onClick={e=>e.stopPropagation()} style={{
        maxWidth:380,width:"100%",
        background:"#fff",borderRadius:24,
        padding:"32px 24px",textAlign:"center",
        boxShadow:"0 20px 60px rgba(0,0,0,.25)",
        animation:"slideUp .35s cubic-bezier(.22,1,.36,1)",
      }}>
        {submitted?(
          <p style={{margin:0,fontSize:16,fontWeight:700,color:C.green}}>
            Inscrit ! A vendredi.
          </p>
        ):(
          <>
            <div style={{fontSize:32,marginBottom:8}}>{"🏖️"}</div>
            <h3 style={{margin:"0 0 6px",fontSize:20,fontWeight:800,color:C.ink}}>
              Avant de partir...
            </h3>
            <p style={{margin:"0 0 16px",fontSize:14,color:C.mid,lineHeight:"20px"}}>
              La saison des sargasses arrive bientot.<br/>
              Recois chaque vendredi les <strong style={{color:C.ink}}>meilleures plages</strong> pour ton weekend.
            </p>
            <form onSubmit={handleSubmit} style={{display:"flex",gap:8,marginBottom:10}}>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="ton@email.com" required
                style={{
                  flex:1,padding:"12px 14px",borderRadius:12,
                  border:"1.5px solid #e0e0e0",fontSize:15,fontFamily:"inherit",
                  outline:"none",minWidth:0,
                }}
                onFocus={e=>e.target.style.borderColor="#E8A800"}
                onBlur={e=>e.target.style.borderColor="#e0e0e0"}
              />
              <button type="submit" style={{
                padding:"12px 18px",borderRadius:12,border:"none",cursor:"pointer",
                background:"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)",
                color:"#0D0D0D",fontSize:14,fontWeight:700,whiteSpace:"nowrap",
                boxShadow:"0 4px 16px rgba(232,168,0,.3)",
              }}>OK</button>
            </form>
            <p style={{margin:0,fontSize:11,color:"#999"}}>
              Gratuit, zero spam, desinscription en 1 clic.
            </p>
            <button onClick={handleDismiss} style={{
              display:"block",margin:"12px auto 0",background:"none",border:"none",
              cursor:"pointer",color:C.mid,fontSize:12,fontWeight:500,padding:0,
            }}>Non merci</button>
          </>
        )}
      </div>
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
  const[showOnboarding,setShowOnboarding]=useState(()=>!g("sg_onb",0))
  const[showPushPrompt,setShowPushPrompt]=useState(false)
  const[showPremium,setShowPremium]=useState(false)
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
    }catch(e){}
    return false
  })
  const[showWelcome,setShowWelcome]=useState(()=>{
    const w=g("sg_premium_welcome",false)
    if(w){s("sg_premium_welcome",false)}
    return w
  })
  useEffect(()=>{if(showWelcome){const t=setTimeout(()=>setShowWelcome(false),5000);return()=>clearTimeout(t)}},[showWelcome])

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

  const toggleFav=useCallback(id=>{
    setFavorites(f=>f.includes(id)?f.filter(x=>x!==id):[...f,id])
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
    else if(filter===3)list=list.filter(b=>b.kids)
    else if(filter===4)list=list.filter(b=>b.snorkel)
    else if(filter===5)list=list.filter(b=>b.status==="avoid")
    // Sort by distance when GPS available
    if(userPos){list.sort((a,b)=>(a._dist||999)-(b._dist||999))}
    return list
  },[island,search,filter,favorites,allBeaches,userPos])

  const onBeachClick=useCallback(b=>{
    setSelectedBeach(b);track("sg_beach_open",{beach_id:b?.id,status:b?.status})
    // Track beach views for PWA install prompt timing
    const v=parseInt(sessionStorage.getItem("sg_beach_views")||"0")+1
    sessionStorage.setItem("sg_beach_views",String(v))
  },[])
  const closeSheet=useCallback(()=>setSelectedBeach(null),[])

  const onChangeView=useCallback(v=>{
    track("sg_nav_change",{tab:v})
    if(v==="premium")setShowPremium(true)
    else setView(v)
  },[])

  const openPremium=useCallback((src)=>{setShowPremium(true);track("sg_premium_modal_open",{source:src||"nav"})},[])

  return(
    <LangCtx.Provider value={lang}>
      <StyleInjector/>
      <AbDebug/>
      <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>

        {/* MAP, LIST or GAME */}
        {view==="map"?(
          <ErrBound><MapView beaches={showOnboarding?[]:filtered} island={island}
            onBeachClick={onBeachClick} selectedBeach={selectedBeach} sargData={sargData} userPos={userPos}/></ErrBound>
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
            <div style={{marginTop:10}}>
              <SearchBar value={search} onChange={setSearch} lang={lang}/>
            </div>
            <div style={{marginTop:8,display:"flex",gap:6,overflowX:"auto",
              paddingBottom:4,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
              {LL.filters.map((f,i)=>(
                <FilterChip key={i} label={f} icon={LL.filtersIcon[i]}
                  active={filter===i} onClick={()=>setFilter(i)}/>
              ))}
            </div>
          </div>
        </div>

        {/* BEST BEACH WIDGET — "Meilleure plage pour toi" */}
        {view==="map"&&!selectedBeach&&!showOnboarding&&(
          <BestBeachWidget allBeaches={allBeaches} sargData={sargData} island={island}
            lang={lang} isPremium={isPremium} onBeachClick={onBeachClick}
            userPos={userPos} onPremiumClick={openPremium}/>
        )}

        {/* WEEKEND BANNER — premium teaser on map */}
        {view==="map"&&!selectedBeach&&!showOnboarding&&(
          <WeekendBanner allBeaches={allBeaches} sargData={sargData} island={island}
            lang={lang} isPremium={isPremium} onPremiumClick={openPremium}
            onBeachClick={onBeachClick} userPos={userPos}/>
        )}

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
        {showPremium&&<PremiumModal onClose={()=>setShowPremium(false)} lang={lang}/>}

        {/* ONBOARDING */}
        {showOnboarding&&<Onboarding onDone={()=>{setShowOnboarding(false);setShowPushPrompt(true)}} island={island} lang={lang}/>}

        {/* CUSTOM FRENCH PUSH PROMPT */}
        {showPushPrompt&&<PushPrompt onClose={()=>setShowPushPrompt(false)}/>}

        {/* BOTTOM PROMPTS — ONE AT A TIME, priority: feedback > install > email
             Exit-intent is a full overlay (separate, triggered by mouse leave) */}
        {!showOnboarding&&!showPushPrompt&&(()=>{
          const feedbackDone=g("sg_feedback_done",false)
          const visits=g("sg_visits",0)
          const pwaShown=g("sg_pwa_prompt",0)
          const emailShown=g("sg_email_prompt",false)
          // Priority 1: Feedback (3rd+ visit, not done yet)
          if(!feedbackDone&&visits>=3)return<FeedbackWidget/>
          // Priority 2: Install prompt (not yet shown)
          if(!pwaShown)return<InstallPrompt/>
          // Priority 3: Email capture (not yet shown)
          if(!emailShown)return<EmailCapture/>
          return null
        })()}

        {/* EXIT-INTENT POPUP — full overlay, separate from bottom stack */}
        {!showOnboarding&&!isPremium&&<ExitIntent/>}

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
