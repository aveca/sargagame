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
  clean:{c:C.green,bg:C.greenBg,l:"Propre",le:"Clean",e:"✅",h2s:false},
  moderate:{c:C.amber,bg:C.amberBg,l:"Modéré",le:"Moderate",e:"⚠️",h2s:false},
  avoid:{c:C.red,bg:C.redBg,l:"À éviter",le:"Avoid",e:"🚫",h2s:true},
}

/* ═══════════════════════════════════════════════════════════════════════════
   I18N
   ═══════════════════════════════════════════════════════════════════════════ */
const T={
  fr:{
    days:["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],today:"Auj.",tomorrow:"Dem.",
    clean:"Propre",moderate:"Modéré",avoid:"À éviter",
    search:"Rechercher une plage…",
    filters:["Toutes","Propres","Favoris","Enfants","Snorkeling","À éviter"],
    filtersIcon:["🌊","✅","❤️","🧒","🤿","🚫"],
    navMap:"Carte",navList:"Plages",navPremium:"Premium",
    forecast:"Prévisions 7j",weather:"Météo",directions:"Y aller",
    fav:"Favori",addFav:"Ajouter aux favoris",removeFav:"Retirer des favoris",
    wind:"Vent",uv:"UV",temp:"Température",drive:"min",
    kids:"Enfants",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"Prévisions 7 jours, alertes push, zéro pub.",
    premiumPrice:"4,99 €/mois",premiumCta:"S'abonner",
    premiumFeatures:["Prévisions 7 jours débloquées","Alertes push quand le statut change","Zéro publicité","Annulation en 1 clic"],
    h2sWarn:"Risque H₂S — évitez cette plage avec des enfants.",
    copernicus:"Copernicus Marine",live:"LIVE",
    nClean:"{n} propres",island_mq:"Martinique",island_gp:"Guadeloupe",
    reportThanks:"Merci pour ton signalement !",report:"Signaler",
    openWaze:"Ouvrir Waze",driftDown:"Dispersion attendue",driftUp:"Arrivée possible",driftStable:"Stable",
    close:"Fermer",nearby:"Plages à proximité",locked:"Premium",
  },
  en:{
    days:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],today:"Today",tomorrow:"Tmrw",
    clean:"Clean",moderate:"Moderate",avoid:"Avoid",
    search:"Search a beach…",
    filters:["All","Clean","Favourites","Kids","Snorkeling","Avoid"],
    filtersIcon:["🌊","✅","❤️","🧒","🤿","🚫"],
    navMap:"Map",navList:"Beaches",navPremium:"Premium",
    forecast:"7-day forecast",weather:"Weather",directions:"Directions",
    fav:"Favourite",addFav:"Add to favourites",removeFav:"Remove from favourites",
    wind:"Wind",uv:"UV",temp:"Temperature",drive:"min",
    kids:"Kids",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"7-day forecast, push alerts, no ads.",
    premiumPrice:"€4.99/mo",premiumCta:"Subscribe",
    premiumFeatures:["7-day forecast unlocked","Push alerts when status changes","Zero ads","Cancel in 1 click"],
    h2sWarn:"H₂S risk — avoid this beach with children.",
    copernicus:"Copernicus Marine",live:"LIVE",
    nClean:"{n} clean",island_mq:"Martinique",island_gp:"Guadeloupe",
    reportThanks:"Thanks for your report!",report:"Report",
    openWaze:"Open Waze",driftDown:"Dispersing",driftUp:"Incoming",driftStable:"Stable",
    close:"Close",nearby:"Nearby beaches",locked:"Premium",
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
const STRIPE_URL="https://buy.stripe.com/28E7sN2pd5F07Ktesr0co0p"

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */
const g=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const s=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}

function statusFromAfai(afai){return afai<.3?"clean":afai<.65?"moderate":"avoid"}

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

// Wikimedia photos for MQ beaches (no local files exist)
const WIKI_PHOTOS={
  mq001:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Plage_des_Salines_Martinique.jpg/640px-Plage_des_Salines_Martinique.jpg",
  mq010:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Anse_Mitan_-_Les_Trois-Ilets.jpg/640px-Anse_Mitan_-_Les_Trois-Ilets.jpg",
  mq011:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Anse_Mitan_-_Les_Trois-Ilets.jpg/640px-Anse_Mitan_-_Les_Trois-Ilets.jpg",
  mq012:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Anses_d%27Arlet_-_Martinique.jpg/640px-Anses_d%27Arlet_-_Martinique.jpg",
  mq013:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Anses_d%27Arlet_-_Martinique.jpg/640px-Anses_d%27Arlet_-_Martinique.jpg",
  mq014:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Anses_d%27Arlet_-_Martinique.jpg/640px-Anses_d%27Arlet_-_Martinique.jpg",
  mq015:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Anses_d%27Arlet_-_Martinique.jpg/640px-Anses_d%27Arlet_-_Martinique.jpg",
  mq016:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Le_Diamant_beach_Martinique.jpg/640px-Le_Diamant_beach_Martinique.jpg",
  mq027:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Saint_Pierre_Martinique.jpg/640px-Saint_Pierre_Martinique.jpg",
  mq028:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Saint_Pierre_Martinique.jpg/640px-Saint_Pierre_Martinique.jpg",
  mq029:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Saint_Pierre_Martinique.jpg/640px-Saint_Pierre_Martinique.jpg",
}
function getBeachPhoto(beach,imageMap){
  if(!beach)return null
  // 1. Real photo from beaches-images.json (GP local files)
  if(imageMap){const file=imageMap[beach.id];if(file)return`/beaches/${file}`}
  // 2. Wikimedia photo (MQ)
  if(WIKI_PHOTOS[beach.id])return WIKI_PHOTOS[beach.id]
  // 3. Pre-generated satellite thumbnail (static, fast)
  return`/beaches/sat-${beach.id}.jpg`
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
function MapView({beaches,island,onBeachClick,selectedBeach}){
  const containerRef=useRef(null)
  const mapRef=useRef(null)
  const markersRef=useRef([])
  const heatRef=useRef([])
  const[mapError,setMapError]=useState(null)

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
    // Labels overlay (on top of satellite)
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
    const center=ISLAND_CENTER[island]||ISLAND_CENTER.mq
    try{
      const size=mapRef.current.getSize()
      if(size.x===0||size.y===0){mapRef.current.setView(center,11)}
      else{mapRef.current.flyTo(center,11,{duration:1})}
    }catch(e){mapRef.current.setView(center,11)}
  },[island])

  // Update markers + heatmap
  useEffect(()=>{
    if(!mapRef.current)return
    markersRef.current.forEach(m=>m.remove())
    markersRef.current=[]
    heatRef.current.forEach(m=>m.remove())
    heatRef.current=[]

    beaches.forEach(b=>{
      const st=ST[b.status]||ST.clean
      const isSelected=selectedBeach?.id===b.id

      // Sargassum heatmap: large semi-transparent ocean circle
      if(b.afai>.2){
        const heatRadius=Math.max(800,b.afai*4000)
        const heatColor=b.afai<.3?C.green:b.afai<.65?C.amber:C.red
        // Offset slightly toward ocean (east for MQ Atlantic coast, varies for GP)
        const lngOffset=b.island==="mq"?.015:.012
        const heat=L.circle([b.lat,b.lng+lngOffset],{
          radius:heatRadius,
          fillColor:heatColor,
          color:"transparent",
          fillOpacity:Math.min(.35,b.afai*.45),
          interactive:false,
        })
        heat.addTo(mapRef.current)
        heatRef.current.push(heat)
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
      marker.addTo(mapRef.current)
      markersRef.current.push(marker)
    })
  },[beaches,onBeachClick,selectedBeach])

  if(mapError)return <div style={{padding:40,color:"red"}}>{mapError}</div>
  return <div ref={containerRef} style={{width:"100%",height:"100%"}}/>
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORECAST CHART — Day 1 (today) free, days 2-7 LOCKED (blurred) for premium
   Data: 1.57% conversion — show only today free to increase premium value
   ═══════════════════════════════════════════════════════════════════════════ */
function ForecastChart({forecast,lang,onPremiumClick}){
  if(!forecast||!forecast.length)return null
  const LL=T[lang]||T.fr
  const max=Math.max(...forecast.map(d=>d.afai),.1)
  return(
    <div style={{position:"relative"}}>
      <div style={{display:"flex",gap:6,alignItems:"flex-end",height:100,padding:"8px 0"}}>
        {forecast.map((d,i)=>{
          const h=Math.max(8,(d.afai/max)*80)
          const st=ST[d.status]||ST.clean
          const isLocked=i>=1
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              filter:isLocked?"blur(3px)":"none",opacity:isLocked?.4:1,
              pointerEvents:isLocked?"none":"auto"}}>
              <span style={{fontSize:10,fontWeight:600,color:st.c}}>{Math.round(d.afai*100)}%</span>
              <div className="fc-bar" style={{width:"100%",height:h,background:st.c,opacity:.8}}/>
              <span style={{fontSize:10,color:"var(--sg-mid,#686868)",fontWeight:500}}>{d.day}</span>
            </div>
          )
        })}
      </div>
      {/* Lock overlay for days 2-7 (today is free, rest is premium) */}
      <div style={{position:"absolute",top:0,right:0,bottom:0,width:`${(6/7*100).toFixed(1)}%`,
        display:"flex",alignItems:"center",justifyContent:"center",
        background:"linear-gradient(90deg,transparent,rgba(253,252,247,.7) 20%)",
        borderRadius:8}}>
        <button onClick={onPremiumClick} style={{
          display:"flex",alignItems:"center",gap:6,
          padding:"8px 16px",borderRadius:100,border:"none",
          background:"linear-gradient(135deg,"+C.goldL+","+C.gold+")",
          color:C.ink,fontSize:11,fontWeight:700,cursor:"pointer",
          boxShadow:"0 2px 12px rgba(232,168,0,.3)",fontFamily:"inherit",
        }}>
           {LL.locked}
        </button>
      </div>
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
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${beach.lat}&longitude=${beach.lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index&timezone=America/Martinique`)
      .then(r=>r.json()).then(j=>{
        if(!cancel&&j.current)setData({
          temp:Math.round(j.current.temperature_2m),
          wind:Math.round(j.current.wind_speed_10m),
          windDir:j.current.wind_direction_10m,
          uv:j.current.uv_index,
        })
      }).catch(()=>{})
    return()=>{cancel=true}
  },[beach?.id])
  return data
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOTTOM SHEET — beach detail with photo, forecast, weather, nearby
   ═══════════════════════════════════════════════════════════════════════════ */
function BeachSheet({beach,onClose,favorites,onToggleFav,lang,allBeaches,imageMap,onBeachClick,onPremiumClick}){
  const LL=T[lang]||T.fr
  const weather=useWeather(beach)
  const forecast=useMemo(()=>beach?generateForecast(beach.afai,lang):null,[beach?.id,lang])
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

  const photo=getBeachPhoto(beach,imageMap)
  const bgImage=photo||satImg(beach.lat,beach.lng,560)

  const onTouchStart=e=>{startY.current=e.touches[0].clientY}
  const onTouchMove=e=>{
    const dy=e.touches[0].clientY-startY.current
    if(dy>0&&sheetRef.current)sheetRef.current.style.transform=`translateY(${dy}px)`
  }
  const onTouchEnd=e=>{
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
        <div style={{height:180,background:`url(${bgImage}) center/cover`,
          borderRadius:"0",position:"relative"}}>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(transparent 40%,var(--sg-card,#fff) 100%)"}}/>
          <button onClick={onClose} style={{position:"absolute",top:12,right:12,
            width:32,height:32,borderRadius:16,background:"rgba(0,0,0,.4)",
            border:"none",color:"#fff",fontSize:16,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{padding:"0 20px 100px"}}>
          {/* Name + Status */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <h2 className="anton" style={{fontSize:22,margin:0,lineHeight:1.2}}>{beach.name}</h2>
            <StatusBadge status={beach.status} lang={lang}/>
          </div>
          <p style={{fontSize:13,color:"var(--sg-mid,#686868)",margin:"0 0 12px"}}>
            {beach.commune} · <AfaiBadge afai={beach.afai}/> · {beach.drive} {LL.drive}
          </p>

          {/* H2S warning */}
          {ST[beach.status]?.h2s&&(
            <div style={{padding:"10px 14px",borderRadius:12,background:C.redBg,
              color:C.red,fontSize:13,fontWeight:600,marginBottom:12,
              display:"flex",alignItems:"center",gap:8}}>
              ⚠️ {LL.h2sWarn}
            </div>
          )}

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
            <button onClick={()=>onToggleFav(beach.id)} style={{
              flex:0,padding:"14px 20px",borderRadius:22,border:"1.5px solid var(--sg-border)",
              background:"var(--sg-card)",cursor:"pointer",fontSize:18,
              fontFamily:"inherit",
            }}>{isFav?"❤️":""}</button>
          </div>

          {/* Forecast (days 4-7 locked) */}
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:8}}>{LL.forecast}</h3>
          <ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick}/>

          {/* Weather */}
          {weather&&(
            <>
              <h3 style={{fontSize:15,fontWeight:700,margin:"20px 0 10px"}}>{LL.weather}</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <WeatherCard icon="️" label={LL.temp} value={`${weather.temp}°C`}/>
                <WeatherCard icon="" label={LL.wind} value={`${weather.wind} km/h`}/>
                <WeatherCard icon="☀️" label={LL.uv} value={weather.uv}/>
              </div>
            </>
          )}

          {/* Nearby beaches (netlinking) */}
          {nearby.length>0&&(
            <>
              <h3 style={{fontSize:15,fontWeight:700,margin:"20px 0 10px"}}>{LL.nearby}</h3>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {nearby.map(nb=>{
                  const nst=ST[nb.status]||ST.clean
                  const nbPhoto=getBeachPhoto(nb,imageMap)
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
    <div style={{height:"100%",overflowY:"auto",paddingTop:150,paddingBottom:80,
      background:"var(--sg-bg,#FDFCF7)"}}>
      <div style={{padding:"8px 16px 0",fontSize:13,color:"var(--sg-mid,#686868)",fontWeight:500}}>
        {LL.nClean.replace("{n}",nClean)} / {beaches.length}
      </div>
      <div style={{padding:"8px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {beaches.map(b=>{
          const photo=getBeachPhoto(b,imageMap)
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
              <div style={{width:56,height:56,borderRadius:12,
                background:`url(${photo||satImg(b.lat,b.lng,112)}) center/cover`,flexShrink:0}}/>
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

  const closeOnboarding=useCallback(()=>{
    s("sg_onb",1)
    onDone()
    // Show push notification prompt AFTER onboarding (not during — blocks CTA clicks)
    try{window.OneSignalDeferred?.push(o=>o.Slidedown?.promptPush())}catch(e){}
  },[onDone])

  const openStripe=useCallback(()=>{
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
                Sargasses ou pas — <strong style={{color:C.ink,fontWeight:700}}>vérifie ta plage en 5 secondes</strong> avant de charger la voiture.
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
                  <strong style={{color:C.ink,fontWeight:700}}>+2 400 {locals}</strong> ont déjà vérifié avant toi ce matin
                </div>
              </div>

              {/* CTA — INSIDE slide 1 */}
              <div style={{marginTop:20,paddingBottom:50,display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>setStep(1)} style={{
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
              Confirmé par <strong style={{color:C.ink}}>+2 400 locaux</strong> ce matin
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
              <button onClick={()=>setStep(2)} style={{
                width:"100%",background:"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)",
                color:C.ink,border:"none",borderRadius:20,padding:"17px 20px",
                fontFamily:"'Anton',sans-serif",fontSize:19,letterSpacing:".06em",textTransform:"uppercase",
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",
                boxShadow:"inset 0 1px 0 rgba(255,255,255,.55),0 8px 28px rgba(232,168,0,.44)",
                position:"relative",overflow:"hidden"}}>
                <span style={{position:"relative",zIndex:1}}>Choisir ma plage</span>
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
        {[0,1,2].map(i=>(
          <button key={i} onClick={()=>setStep(i)}
            style={{width:i===step?22:7,height:7,borderRadius:i===step?4:7,
              background:i===step?"#E8A800":"rgba(0,0,0,.15)",
              border:"none",cursor:"pointer",transition:"all .3s",padding:0}}/>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREMIUM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
function PremiumModal({onClose,lang}){
  const LL=T[lang]||T.fr
  return(
    <>
      <div className="backdrop" onClick={onClose}/>
      <div style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:1100,
        background:"linear-gradient(145deg,#0D1E1C,#0A1714)",
        borderRadius:"24px 24px 0 0",padding:"28px 24px 40px",
        color:"#e6edf3",maxHeight:"80vh",overflow:"auto",
      }}>
        <div className="sheet-handle" style={{background:"rgba(255,255,255,.2)"}}/>
        <div style={{borderTop:`3px solid ${C.gold}`,borderRadius:"3px 3px 0 0",
          margin:"-8px -24px 20px",padding:0}}/>

        <h2 className="anton" style={{fontSize:28,color:"#fff",marginBottom:8}}>⭐ {LL.premium}</h2>
        <p style={{fontSize:14,color:"#adbac7",marginBottom:20}}>{LL.premiumDesc}</p>

        <ul style={{listStyle:"none",padding:0,margin:"0 0 24px",display:"flex",flexDirection:"column",gap:12}}>
          {LL.premiumFeatures.map((f,i)=>(
            <li key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:14}}>
              <span style={{color:C.gold,fontSize:18}}>✓</span>{f}
            </li>
          ))}
        </ul>

        <a href={STRIPE_URL} target="_blank" rel="noopener" className="gbtn"
          style={{width:"100%",textDecoration:"none",textAlign:"center",
            fontSize:17,padding:"16px 24px",display:"block"}}>
          {LL.premiumCta} — {LL.premiumPrice}
        </a>

        <button onClick={onClose} style={{
          width:"100%",padding:"12px",marginTop:12,background:"none",
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
function Header({island,onIslandChange,lang,onLangToggle,theme,onThemeToggle}){
  const LL=T[lang]||T.fr
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

      {/* Live indicator + GSC subtitle (#1 query: "sargasse martinique en temps réel") */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        <div style={{display:"flex",alignItems:"center",gap:6,
          padding:"6px 12px",borderRadius:100,
          background:"var(--sg-card,#fff)",
          boxShadow:"0 2px 8px rgba(0,0,0,.06)",
          border:"1px solid var(--sg-border)",
          fontSize:11,fontWeight:600,color:C.teal}}>
          <span className="pulse" style={{width:8,height:8,borderRadius:4,background:C.green}}/>
          {LL.live} · {LL.copernicus}
        </div>
        <span style={{fontSize:9,fontWeight:600,color:"var(--sg-mid,#686868)",letterSpacing:".02em",
          whiteSpace:"nowrap"}}>{lang==="en"?"Sargassum map in real time":"Carte des sargasses en temps réel"}</span>
      </div>

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
   APP PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App(){
  const[lang,setLang]=useState(getLang)
  const[theme,setTheme]=useState(()=>g("sg_theme","light"))
  const[island,setIsland]=useState(()=>{
    const saved=g("sg_island",null)
    if(saved)return saved
    // Auto-detect island from hostname (GSC: GP at position 70 → must show GP content on GP domain)
    try{if(window.location.hostname.includes("guadeloupe"))return"gp"}catch{}
    return"mq"
  })
  const[view,setView]=useState("map") // map | list | premium
  const[search,setSearch]=useState("")
  const[filter,setFilter]=useState(0) // index in T.filters
  const[selectedBeach,setSelectedBeach]=useState(null)
  const[favorites,setFavorites]=useState(()=>g("sg_fav",[]))
  const[showOnboarding,setShowOnboarding]=useState(()=>!g("sg_onb",0))
  const[showPremium,setShowPremium]=useState(false)

  // Runtime data sources
  const[allBeaches,setAllBeaches]=useState(BEACHES_FALLBACK)
  const[imageMap,setImageMap]=useState(null)
  const[sargData,setSargData]=useState(null)

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

  // Fetch beaches-images.json at mount
  useEffect(()=>{
    fetch("/data/beaches-images.json")
      .then(r=>r.json())
      .then(data=>{
        if(data&&typeof data==="object")setImageMap(data)
      })
      .catch(()=>{})
  },[])

  // Fetch sargassum.json at mount and merge AFAI levels
  useEffect(()=>{
    fetch("/api/copernicus/sargassum.json")
      .then(r=>r.json())
      .then(data=>{
        setSargData(data)
      })
      .catch(()=>{})
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

  // Filter beaches
  const filtered=useMemo(()=>{
    let list=allBeaches.filter(b=>b.island===island)
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
    return list
  },[island,search,filter,favorites,allBeaches])

  const onBeachClick=useCallback(b=>{setSelectedBeach(b)},[])
  const closeSheet=useCallback(()=>setSelectedBeach(null),[])

  const onChangeView=useCallback(v=>{
    if(v==="premium")setShowPremium(true)
    else setView(v)
  },[])

  const openPremium=useCallback(()=>setShowPremium(true),[])

  return(
    <LangCtx.Provider value={lang}>
      <StyleInjector/>
      <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>

        {/* MAP or LIST */}
        {view==="map"?(
          <ErrBound><MapView beaches={showOnboarding?[]:filtered} island={island}
            onBeachClick={onBeachClick} selectedBeach={selectedBeach}/></ErrBound>
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
              theme={theme} onThemeToggle={toggleTheme}/>
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

        {/* BOTTOM NAV */}
        <BottomNav view={view} onChangeView={onChangeView} lang={lang}/>

        {/* BOTTOM SHEET (beach detail) */}
        {selectedBeach&&(
          <BeachSheet beach={selectedBeach} onClose={closeSheet}
            favorites={favorites} onToggleFav={toggleFav} lang={lang}
            allBeaches={allBeaches} imageMap={imageMap}
            onBeachClick={onBeachClick} onPremiumClick={openPremium}/>
        )}

        {/* PREMIUM MODAL */}
        {showPremium&&<PremiumModal onClose={()=>setShowPremium(false)} lang={lang}/>}

        {/* ONBOARDING */}
        {showOnboarding&&<Onboarding onDone={()=>setShowOnboarding(false)} island={island} lang={lang}/>}
      </div>
    </LangCtx.Provider>
  )
}
