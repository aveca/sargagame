/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  SARGASSES · Version Production                              ║
 * ║  "Cette fois, tu seras prévenu."                             ║
 * ║                                                              ║
 * ║  Stack  : React 18 · Syne + Anton · Open-Meteo · Assistant statique   ║
 * ║  Local  : localStorage · GPS · Canvas · Notification API    ║
 * ║  Deploy : Namecheap shared hosting, FTP                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from "react"
import SargassesGame from "./SargassesGame.jsx"

const LangContext = createContext("fr")
export function useLang(){ return useContext(LangContext)||"fr" }

// ═══ FONTS ═══════════════════════════════════════════════════════════════════
const GFONTS=`@import url('https://fonts.googleapis.com/css2?family=Anton&family=Syne:wght@400;500;600;700;800&display=swap');`

// ═══ TOKENS ══════════════════════════════════════════════════════════════════
const C={
  bg:"#FFFFFF",        // blanc pur
  bgD:"#F8F8F8",      // gris très clair
  card:"#FFFFFF",
  cardS:"#FAFAFA",
  ink:"#000000",
  mid:"#000000",
  mute:"#333333",
  border:"rgba(0,0,0,.12)",
  borderM:"rgba(0,0,0,.18)",

  // Brand Gold
  gold:"#C4830A",
  goldL:"#EDA000",
  goldLL:"#FFD060",
  goldBg:"rgba(237,160,0,.09)",
  goldBgL:"rgba(255,208,96,.15)",

  // Teal ocean
  teal:"#00766A",
  tealL:"#009688",
  tealBg:"rgba(0,150,136,.08)",

  // Status
  green:"#27703A",greenL:"#38924E",greenBg:"rgba(39,112,58,.1)",
  amber:"#B55300",amberBg:"rgba(181,83,0,.1)",
  red:"#B01B1B",  redBg:"rgba(176,27,27,.1)",

  // Sargasses — couleur propre aux algues
  sarg:"#8B6914",sargL:"#A67C1A",sargBg:"rgba(139,105,20,.12)",

  // Night
  night:"#07111E",night2:"#0C1B2E",
  ocean:"#014F86",
}

// Dark theme tokens (surfaces + text)
const C_DARK={
  bg:"#0d1117",
  bgD:"#161b22",
  card:"#161b22",
  cardS:"#21262d",
  ink:"#e6edf3",
  mid:"#adbac7",
  mute:"#8b949e",
  border:"rgba(255,255,255,.08)",
  borderM:"rgba(255,255,255,.14)",
  // Accents légèrement éclaircis en dark
  gold:C.gold,
  goldL:C.goldL,
  goldLL:C.goldLL,
  goldBg:"rgba(237,160,0,.15)",
  goldBgL:"rgba(255,208,96,.2)",
  teal:C.teal,
  tealL:C.tealL,
  tealBg:"rgba(0,150,136,.18)",
  green:C.green,
  greenL:C.greenL,
  greenBg:C.greenBg,
  amber:C.amber,
  amberBg:C.amberBg,
  red:C.red,
  redBg:C.redBg,
  sarg:C.sarg,
  sargL:C.sargL,
  sargBg:C.sargBg,
  night:C.night,
  night2:C.night2,
  ocean:C.ocean,
}

// ═══ STATUS ══════════════════════════════════════════════════════════════════
const ST={
  clean:   {c:C.green, bg:C.greenBg, l:"Propre",   e:"✅",h2s:false},
  moderate:{c:C.amber, bg:C.amberBg, l:"Modéré",   e:"⚠️",h2s:false},
  avoid:   {c:C.red,   bg:C.redBg,   l:"À éviter", e:"🚫",h2s:true },
}

// ═══ I18N — FR / EN (lang from pathname /en) ═══════════════════════════════
function getLang(){ try { return (typeof window!=="undefined"&&window.location.pathname.startsWith("/en"))?"en":"fr" } catch { return "fr" } }
const T={
  fr:{
    statusClean:"Propre",statusModerate:"Modéré",statusAvoid:"À éviter",
    days:["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"], dayToday:"Auj.", dayTomorrow:"Dem.",
    navAccueil:"Accueil",navJeu:"Jeu",navArena:"Arena",navIA:"IA",navPlages:"Plages",navCarte:"Carte",navPremium:"Premium",navProfil:"Profil",
    propres:"propres",enLigne:"en ligne",horsLigne:"hors ligne",refData:"Données de référence",copernicus:"Copernicus Marine",
    assistantTitle:"Assistant Sargasses —",suggestions:"Suggestions",placeholderQuestion:"Ta question ou ta zone…",
    fav:"Favori",addFav:"Ajouter",voir:"Voir →",min:"min",drive:"min en voiture",
    filtres:["Toutes 🌊","✅ Propres","❤️ Favoris","🧒 Enfants","🤿 Snorkeling","🚫 À éviter"],
    prev:"Prévisions",meteo:"Météo",signaler:"Signaler",yAller:"Y aller",vent:"Vent",direction:"Direction",uv:"Indice UV",temp:"Température",
    conditionsFav:"Conditions favorables pour la baignade.",ventFort:"Vent fort — snorkeling déconseillé.",uvEleve:"UV élevé — crème solaire indispensable, évitez 12h-16h.",
    merci:"Merci !",signalementEnLigne:"Ton signalement est en ligne sur",itineraire:"Itinéraire voiture",ouvrirWaze:"Ouvrir Waze",voirWindy:"Voir sur Windy",
    prochainsJours:"Prochains jours",previsions7j:"Prévisions 7 jours activées !",jePars:"Je pars maintenant",aucunePropre:"Aucune propre",planifierWeekEnd:"Planifier le week-end",previsionsJ7:"Prévisions J+1 → J+7",
    carteTitle:"Carte satellite Sargasses — Martinique & Guadeloupe",consultations:"consultations",
    h1:"Sargasses {island} en temps réel",previsions:"Prévisions",meteoLabel:"Météo",
    onboardingNoAccount:"Aucun compte · Données locales · Zéro pub",modeClair:"Mode clair",modeSombre:"Mode sombre",live:"LIVE",
    onbKicker1:"La vraie vie",onbHead1:"Tu as déjà\nfait 50 km\npour rien.",onbBody1:"La plage envahie de sargasses. La puanteur. Le gaz. Tes enfants déçus.\n\nPlus jamais.",onbCta1:"Je connais ce moment →",
    onbKicker2:"Comment ça marche",onbHead2:"Données\nsatellite\ntoutes les 6h.",onbBody2:"Sentinel-3 détecte les sargasses depuis l'espace.\nModèle de dérive Copernicus Marine.\n\nPrécision : 92% sur 48h.",onbCta2:"Et alors ? →",
    onbKicker3:"La promesse",onbHead3:"Cette fois,\ntu seras\nprévenu.",onbBody3:"Notification push avant que tu partes.\nPrévision 7 jours pour planifier.\nAlerte H2S si danger pour tes enfants.",onbCta3:"Entrer dans l'app →",
    altPlage:"Plage — carte sargasses",altPlageEtat:"Plage — état sargasses",
  },
  en:{
    statusClean:"Clean",statusModerate:"Moderate",statusAvoid:"Avoid",
    days:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], dayToday:"Today", dayTomorrow:"Tomorrow",
    navAccueil:"Home",navJeu:"Game",navArena:"Arena",navIA:"AI",navPlages:"Beaches",navCarte:"Map",navPremium:"Premium",navProfil:"Profile",
    propres:"clean",enLigne:"online",horsLigne:"offline",refData:"Reference data",copernicus:"Copernicus Marine",
    assistantTitle:"Sargassum Assistant —",suggestions:"Suggestions",placeholderQuestion:"Your question or area…",
    fav:"Favourite",addFav:"Add",voir:"View →",min:"min",drive:"min drive",
    filtres:["All 🌊","✅ Clean","❤️ Favourites","🧒 Kids","🤿 Snorkeling","🚫 Avoid"],
    prev:"Forecast",meteo:"Weather",signaler:"Report",yAller:"Directions",vent:"Wind",direction:"Direction",uv:"UV index",temp:"Temp.",
    conditionsFav:"Good conditions for swimming.",ventFort:"Strong wind — snorkeling not recommended.",uvEleve:"High UV — use sunscreen, avoid 12pm–4pm.",
    merci:"Thanks!",signalementEnLigne:"Your report is live for",itineraire:"Driving directions",ouvrirWaze:"Open Waze",voirWindy:"View on Windy",
    prochainsJours:"Next days",previsions7j:"7-day forecast enabled!",jePars:"I'm going now",aucunePropre:"None clean",planifierWeekEnd:"Plan the weekend",previsionsJ7:"Forecast D+1 → D+7",
    carteTitle:"Sargassum satellite map — Martinique & Guadeloupe",consultations:"views",
    h1:"Sargassum {island} real-time",previsions:"Forecast",meteoLabel:"Weather",
    onboardingNoAccount:"No account · Local data · No ads",modeClair:"Light mode",modeSombre:"Dark mode",live:"LIVE",
    onbKicker1:"Real life",onbHead1:"You've already\ndriven 50 km\nfor nothing.",onbBody1:"The beach covered in sargassum. The smell. The gas. Your kids disappointed.\n\nNever again.",onbCta1:"I know that moment →",
    onbKicker2:"How it works",onbHead2:"Satellite\ndata every 6h.",onbBody2:"Sentinel-3 detects sargassum from space.\nCopernicus Marine drift model.\n\n92% accuracy at 48h.",onbCta2:"So what? →",
    onbKicker3:"The promise",onbHead3:"This time,\nyou'll know\nbefore you go.",onbBody3:"Push notification before you leave.\n7-day forecast to plan.\nH2S alert when risky for kids.",onbCta3:"Open the app →",
    altPlage:"Beach — sargassum map",altPlageEtat:"Beach — sargassum status",
  },
}

// ═══ GAMIFICATION ════════════════════════════════════════════════════════════
const LEVELS=[
  {min:0,   max:99,   id:"tourist", label:"Touriste",  e:"🧳", color:"#999"},
  {min:100, max:499,  id:"local",   label:"Local",     e:"🌴", color:C.tealL},
  {min:500, max:1999, id:"expert",  label:"Expert",    e:"🔬", color:C.goldL},
  {min:2000,max:Infinity,id:"vigil",label:"Vigile",   e:"🏆", color:"#E040FB"},
]
function getLevel(xp){return LEVELS.find(l=>xp>=l.min&&xp<=l.max)||LEVELS[0]}
function xpForAction(action){
  return {open:5,fav:15,report:25,chat:8,streak:30,premium:100}[action]||5
}

// ═══ BEACHES DATA — Martinique (mq) + Guadeloupe (gp) ═════════════════════════════
const BEACHES=[
  // Martinique
  {id:"grande-anse",island:"mq",name:"Grande Anse d'Arlet",  commune:"Les Anses-d'Arlet",status:"clean",   afai:.11,lat:14.4942,lng:-61.0834,px:28,py:62,kids:true, snorkel:true, parking:true, drive:25},
  {id:"anse-mitan", island:"mq",name:"Anse Mitan",            commune:"Les Trois-Îlets",  status:"clean",   afai:.17,lat:14.5510,lng:-61.0582,px:36,py:50,kids:true, snorkel:false,parking:true, drive:18},
  {id:"anse-noire", island:"mq",name:"Anse Noire",            commune:"Les Anses-d'Arlet",status:"clean",   afai:.08,lat:14.4968,lng:-61.0668,px:30,py:69,kids:true, snorkel:true, parking:false,drive:28},
  {id:"tartane",    island:"mq",name:"Tartane",               commune:"La Trinité",       status:"clean",   afai:.19,lat:14.7487,lng:-60.908, px:70,py:26,kids:true, snorkel:true, parking:false,drive:40},
  {id:"anse-madame",island:"mq",name:"Anse Madame",           commune:"Schoelcher",       status:"clean",   afai:.14,lat:14.6276,lng:-61.1207,px:32,py:38,kids:true, snorkel:false,parking:true, drive:12},
  {id:"diamant",    island:"mq",name:"Le Diamant",            commune:"Le Diamant",       status:"moderate",afai:.42,lat:14.4625,lng:-61.0389,px:24,py:73,kids:false,snorkel:false,parking:true, drive:32},
  {id:"pt-marin",   island:"mq",name:"Pointe Marin",          commune:"Sainte-Anne",      status:"moderate",afai:.47,lat:14.4523,lng:-60.8695,px:53,py:78,kids:false,snorkel:false,parking:true, drive:45},
  {id:"sainte-anne",island:"mq",name:"Sainte-Anne",           commune:"Sainte-Anne",      status:"avoid",   afai:.78,lat:14.4293,lng:-60.8868,px:57,py:80,kids:false,snorkel:true, parking:true, drive:48},
  {id:"les-salines",island:"mq",name:"Les Salines",           commune:"Sainte-Anne",      status:"avoid",   afai:.82,lat:14.4135,lng:-60.8589,px:62,py:85,kids:false,snorkel:false,parking:true, drive:52},
  {id:"vauclin",    island:"mq",name:"Le Vauclin",            commune:"Le Vauclin",       status:"avoid",   afai:.71,lat:14.5448,lng:-60.8388,px:74,py:66,kids:false,snorkel:false,parking:true, drive:55},
  // Guadeloupe
  {id:"gp-grande-anse",  island:"gp",name:"Grande Anse",        commune:"Bouillante",   status:"clean",   afai:.15,lat:16.1312,lng:-61.7682,px:22,py:48,kids:true, snorkel:true, parking:true, drive:45},
  {id:"gp-malendure",    island:"gp",name:"Malendure",          commune:"Bouillante",   status:"clean",   afai:.12,lat:16.1784,lng:-61.7902,px:18,py:42,kids:true, snorkel:true, parking:true, drive:42},
  {id:"gp-sainte-anne",  island:"gp",name:"Sainte-Anne",        commune:"Sainte-Anne",  status:"clean",   afai:.22,lat:16.2264,lng:-61.3856,px:58,py:55,kids:true, snorkel:false,parking:true, drive:38},
  {id:"gp-pt-chateaux",  island:"gp",name:"Pointe des Châteaux",commune:"Saint-François",status:"moderate",afai:.38,lat:16.2412,lng:-61.1084,px:82,py:38,kids:false,snorkel:false,parking:true, drive:52},
  {id:"gp-gosier",       island:"gp",name:"Le Gosier",          commune:"Le Gosier",    status:"clean",   afai:.18,lat:16.2064,lng:-61.4912,px:52,py:48,kids:true, snorkel:true, parking:true, drive:12},
  {id:"gp-caravelle",    island:"gp",name:"Plage de la Caravelle",commune:"Saint-François",status:"clean",afai:.14,lat:16.2260,lng:-61.3680,px:78,py:32,kids:true, snorkel:true, parking:true, drive:48},
  {id:"gp-bas-du-fort",  island:"gp",name:"Bas-du-Fort",        commune:"Pointe-à-Pitre",status:"moderate",afai:.35,lat:16.2184,lng:-61.5356,px:48,py:52,kids:true, snorkel:false,parking:true, drive:8},
  {id:"gp-deshaies",     island:"gp",name:"Grande Anse des Haies",commune:"Deshaies",   status:"clean",   afai:.11,lat:16.3044,lng:-61.7984,px:14,py:28,kids:true, snorkel:true, parking:true, drive:55},
  {id:"gp-moule",        island:"gp",name:"Plage de la Souffleur",commune:"Le Moule",  status:"moderate",afai:.44,lat:16.3324,lng:-61.3424,px:68,py:22,kids:false,snorkel:false,parking:true, drive:42},
  {id:"gp-vieux-fort",   island:"gp",name:"Anse de la Gourde", commune:"Saint-François",status:"avoid",   afai:.72,lat:16.2488,lng:-61.1428,px:80,py:35,kids:false,snorkel:false,parking:false,drive:50},
]

// URLs des photos (Wikimedia + /beaches/ pour GP) — utilisé liste + fiche détail
const BEACH_PHOTOS = {
  "grande-anse": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Anses_d%27Arlet_-_Martinique.jpg/960px-Anses_d%27Arlet_-_Martinique.jpg",
  "anse-mitan": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Anse_Mitan_-_Les_Trois-Ilets.jpg/960px-Anse_Mitan_-_Les_Trois-Ilets.jpg",
  "anse-noire": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Anses_d%27Arlet_-_Martinique.jpg/960px-Anses_d%27Arlet_-_Martinique.jpg",
  "tartane": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Saint_Pierre_Martinique.jpg/960px-Saint_Pierre_Martinique.jpg",
  "anse-madame": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Saint_Pierre_Martinique.jpg/960px-Saint_Pierre_Martinique.jpg",
  "diamant": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Le_Diamant_beach_Martinique.jpg/960px-Le_Diamant_beach_Martinique.jpg",
  "pt-marin": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Plage_des_Salines_Martinique.jpg/960px-Plage_des_Salines_Martinique.jpg",
  "sainte-anne": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Plage_des_Salines_Martinique.jpg/960px-Plage_des_Salines_Martinique.jpg",
  "les-salines": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Plage_des_Salines_Martinique.jpg/960px-Plage_des_Salines_Martinique.jpg",
  "vauclin": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Plage_des_Salines_Martinique.jpg/960px-Plage_des_Salines_Martinique.jpg",
  "gp-grande-anse": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Grande_Anse_Deshaies.jpg/960px-Grande_Anse_Deshaies.jpg",
  "gp-malendure": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Malendure_beach.jpg/960px-Malendure_beach.jpg",
  "gp-sainte-anne": "/beaches/Plage_De_Sainte-Anne.jpg",
  "gp-pt-chateaux": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Porte_d%27Enfer_-_Guadeloupe.jpg/960px-Porte_d%27Enfer_-_Guadeloupe.jpg",
  "gp-gosier": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Les_Saintes_-_Guadeloupe.jpg/960px-Les_Saintes_-_Guadeloupe.jpg",
  "gp-caravelle": "/beaches/Plage_la_caravelle.jpg",
  "gp-bas-du-fort": "/beaches/Plage_de_Bas_du_Fort.jpg",
  "gp-deshaies": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Grande_Anse_Deshaies.jpg/960px-Grande_Anse_Deshaies.jpg",
  "gp-moule": "/beaches/Plage_Du_Souffleur.jpg",
  "gp-vieux-fort": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Grande_Anse_Deshaies.jpg/960px-Grande_Anse_Deshaies.jpg",
}
const BEACH_PHOTO_FALLBACK = { mq: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Plage_des_Salines_Martinique.jpg/960px-Plage_des_Salines_Martinique.jpg", gp: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Grande_Anse_Deshaies.jpg/960px-Grande_Anse_Deshaies.jpg" }
// Placeholder data URI (vignette grise si toutes les sources échouent)
const BEACH_IMG_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='112' height='112' viewBox='0 0 112 112'%3E%3Crect fill='%23e8e6e1' width='112' height='112'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='28' font-family='sans-serif'%3E🌊%3C/text%3E%3C/svg%3E"
function getBaseUrl() {
  try {
    const b = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL
    return b ? (b.endsWith("/") ? b : b + "/") : "/"
  } catch { return "/" }
}
function getBeachPhoto(beach) {
  if (!beach) return BEACH_PHOTO_FALLBACK.mq
  const url = BEACH_PHOTOS[beach.id] || BEACH_PHOTO_FALLBACK[beach.island] || BEACH_PHOTO_FALLBACK.mq
  if (url.startsWith("/")) return getBaseUrl().replace(/\/$/, "") + url
  return url
}

// Image satellite Esri (liste + fiche détail) — bbox en degrés, size en pixels
function getBeachSatelliteImage(beach, opts = {}) {
  if (beach?.lat == null || beach?.lng == null) return null
  const { width = 272, height = 272 } = typeof opts === "number" ? { width: opts, height: opts } : opts
  const p = (width / 136) * 0.003
  const latP = p * (height / width)
  const lngMin = beach.lng - p
  const lngMax = beach.lng + p
  const latMin = beach.lat - latP
  const latMax = beach.lat + latP
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${lngMin},${latMin},${lngMax},${latMax}&bboxSR=4326&size=${width},${height}&imageSR=4326&format=png&f=image`
}

const DAYS=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]

// Prévisions 7j : batch API (weekly) si dispo, sinon génération locale
function getForecast(beach, sargassumData, lang = "fr") {
  const batch = sargassumData?.weekly?.[beach?.id]
  if (batch?.forecast?.length === 7) {
    const L = T[lang] || T.fr
    return batch.forecast.map(d => ({ ...d, day: d.day === "Auj." ? L.dayToday : d.day === "Dem." ? L.dayTomorrow : (T.fr.days.indexOf(d.day) >= 0 ? L.days[T.fr.days.indexOf(d.day)] : d.day) }))
  }
  return fc(beach?.afai ?? 0, lang)
}

// Stripe — 30 jours (lien Checkout)
const STRIPE_PAYMENT_URL="https://buy.stripe.com/28E7sN2pd5F07Ktesr0co0p"

// ═══ UTILS ════════════════════════════════════════════════════════════════════
const g=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const s=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function hav(a,b,c,d){const R=6371,dL=(c-a)*Math.PI/180,dG=(d-b)*Math.PI/180,x=Math.sin(dL/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dG/2)**2;return+(R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))).toFixed(1)}
function fc(afai, lang = "fr"){const L=T[lang]||T.fr;const t=new Date();return Array.from({length:7},(_,i)=>{const v=Math.max(0,Math.min(1,afai+Math.sin(i*1.4+afai*9)*.19));const d=new Date(t);d.setDate(d.getDate()+i);return{day:i===0?L.dayToday:i===1?L.dayTomorrow:L.days[d.getDay()],afai:v,status:v<.3?"clean":v<.65?"moderate":"avoid"}})}
function scoreB(afai,w){const s=1-afai,wind=w?Math.max(0,1-w.wind/40):.72,uv=w?Math.max(0,1-w.uv/12):.72;return Math.round((s*.65+wind*.18+uv*.17)*10*10)/10}

// ═══ ASSISTANT STATIQUE — réponses préenregistrées + données Copernicus (sans API LLM) ─
function getStaticReply(userMessage, beaches, options = {}){
  const lang = options.lang || "fr"
  if (lang === "en") return getStaticReplyEn(userMessage, beaches, options)
  return getStaticReplyFr(userMessage, beaches, options)
}

function getStaticReplyFr(userMessage, beaches, options = {}){
  const q=(userMessage||"").toLowerCase().trim()
  const clean=beaches.filter(b=>b.status==="clean")
  const withKids=clean.filter(b=>b.kids)
  const withSnorkel=clean.filter(b=>b.snorkel)
  const firstClean=clean[0]
  const rnd=(arr)=>arr[arr.length?Math.floor(Math.random()*arr.length):0]
  const fromCopernicus=options.sargassumData?.source==="copernicus"
  const dataNote=fromCopernicus?" Les statuts des plages viennent de Copernicus Marine (satellite + modèle de dérive), mis à jour régulièrement.":" Les statuts sont issus de données de référence ; connecte-toi pour profiter des mises à jour Copernicus Marine."

  function out(text, suggestions){
    if(suggestions&&suggestions.length) return { text, suggestions }
    return text
  }

  if(/plage propre|quelle plage|maintenant|propre maintenant/.test(q)){
    if(!firstClean) return out("Aucune plage en vert pour le moment. Consulte la carte pour suivre les mises à jour."+dataNote,["Quand les sargasses arrivent ?","C'est quoi l'AFAI ?"])
    const variants=[
      `Aujourd'hui ${clean.length} plage${clean.length>1?"s":""} propre${clean.length>1?"s":""}. Je te recommande <beach>${firstClean.id}</beach> — ${firstClean.drive} min en voiture.${dataNote}`,
      `Pour une sortie propre tout de suite : <beach>${firstClean.id}</beach> (${firstClean.name}, ${firstClean.commune}). ${clean.length} plage${clean.length>1?"s":""} en vert en ce moment.`
    ]
    return out(rnd(variants),["Avec des enfants 🧒","Snorkeling 🤿","Road trip aujourd'hui"])
  }
  if(/enfant|enfants|kids|🧒/.test(q)){
    if(!withKids.length) return "Pas de plage propre adaptée aux enfants pour l'instant. Regarde la liste et la carte, ça peut changer vite."
    const b=rnd(withKids)
    return `Pour les mômes, vise une plage calme et propre : <beach>${b.id}</beach>. ${b.commune}, ${b.drive} min. 🧒`
  }
  if(/snorkel|🤿|pmt/.test(q)){
    if(!withSnorkel.length) return "Aucun spot snorkeling propre en ce moment. Réessaie demain ou consulte la carte."
    const b=rnd(withSnorkel)
    return `Spot propre pour le masque et tuba : <beach>${b.id}</beach>. ${b.commune}, ${b.drive} min. 🤿`
  }
  if(/road trip|roadtrip|trois plages|3 plages/.test(q)){
    const three=clean.slice(0,3)
    if(three.length===0) return "Pas assez de plages propres pour un road trip aujourd'hui. Consulte la carte pour les prévisions."
    const names=three.map(b=>b.name).join(", ")
    const firstId=three[0].id
    return `Road trip du jour : ${names}. Commence par <beach>${firstId}</beach> puis enchaîne selon ton trajet. 🚗`
  }
  if(/données|donnée|copernicus|satellite|sentinel|source|fiabilité|mise à jour/.test(q)||/d'où viennent/.test(q)){
    const variants=fromCopernicus?["Les statuts viennent de Copernicus Marine : produit satellite (détection des algues) + modèle de dérive océanique. Les données sont rafraîchies régulièrement pour les Antilles. Tu vois la source « Copernicus » dans l'app quand c'est actif.","On utilise le service Copernicus Marine (satellite Sentinel-3 et modèle de dérive). Les plages sont mises à jour en fonction de ces données. C'est la même source que celle utilisée pour la recherche et la surveillance."]:["En ce moment les statuts viennent de données de référence. Dès que la connexion à Copernicus Marine est disponible, tu auras les mises à jour satellite + modèle de dérive pour Martinique et Guadeloupe.","Les données affichées sont de référence. Une fois Copernicus Marine connecté, tu auras les mises à jour issues du satellite et du modèle de dérive. Indicateur « Copernicus ✓ » en haut quand c'est actif."]
    return out(rnd(variants),["C'est quoi l'AFAI ?","Quand les sargasses arrivent ?","Quelle plage propre maintenant ?"])
  }
  if(/afai|indice|score|vert rouge orange/.test(q)&&!/plage|quelle/.test(q)){
    const variants=["L'AFAI (Algal Floating Algae Index) est un indice qui mesure la présence d'algues flottantes. Vert = propre (AFAI bas), orange = modéré, rouge = à éviter. On l'affiche sur chaque fiche plage avec une prévision sur 7 jours.","AFAI = indice de détection des algues par satellite. Plus c'est bas, mieux c'est. En dessous de ~0,3 on met « Propre », au-dessus de ~0,65 « À éviter ». Tu vois la courbe sur la fiche de chaque plage."]
    return out(rnd(variants),["C'est quoi le H2S ?","D'où viennent les données ?","Quelle plage propre maintenant ?"])
  }
  if(/week-end|weekend|semaine prochaine|j\+|demain/.test(q)&&!/touriste|3 jours/.test(q)){
    return out("Les prévisions à 7 jours sont sur la fiche de chaque plage (courbe AFAI). En général, plus l'AFAI est bas, plus la plage a des chances de rester propre. Consulte la carte pour comparer les spots."+dataNote,["C'est quoi l'AFAI ?","Quelle plage propre maintenant ?"])
  }
  if(/météo|meteo|vent|uv|soleil|chaud|température/.test(q)){
    return out("La météo (vent, UV, température) est sur la fiche de chaque plage, via Open-Meteo. Ça te permet de choisir l'heure et le spot selon le vent et l'ensoleillement.",["Meilleure heure pour y aller ?","Quelle plage propre maintenant ?"])
  }
  if(/écolog|ecolog|algue|sargasse|mer|océan|pollution|nature/.test(q)&&!/plage|quelle|où/.test(q)){
    const variants=["Les sargasses sont des algues brunes qui dérivent en mer. En trop grande quantité elles s'échouent, pourrissent et peuvent dégager du H2S. Les données satellite aident à anticiper les échouages pour protéger les plages et la santé.","Ce sont des algues pélagiques qui voyagent avec les courants. Quand elles s'accumulent sur le littoral, ça pose des problèmes d'odeur et de gaz. L'app utilise satellite + modèle de dérive pour te dire où c'est propre ou à éviter."]
    return out(rnd(variants),["C'est quoi le H2S ?","C'est quoi l'AFAI ?","D'où viennent les données ?"])
  }
  if(/martinique|guadeloupe|quelle île|quelle ile|choisir|différence/.test(q)||/^mq$|^gp$/.test(q)){
    const islandLabel=options.island==="gp"?"Guadeloupe":"Martinique"
    const nClean=clean.length
    return out(`Tu es sur la ${islandLabel}. ${nClean} plage${nClean>1?"s":""} en vert en ce moment. Change d'île en haut (MQ / GP) pour voir les statuts de l'autre.`+dataNote,["Quelle plage propre maintenant ?","Road trip aujourd'hui"])
  }
  if(/parking|voiture|calme|tranquille|peu fréquenté|famille/.test(q)){
    const withParking=clean.filter(b=>b.parking)
    if(!withParking.length) return out("Aucune plage propre avec parking indiqué pour l'instant. Consulte la liste des plages pour les infos détaillées (🅿️).",["Quelle plage propre maintenant ?"])
    const b=rnd(withParking)
    return out(`Avec parking et propre : <beach>${b.id}</beach> — ${b.commune}, ${b.drive} min. 🅿️`,["Avec des enfants 🧒","Snorkeling 🤿"])
  }
  if(/^salut|^bonjour|^coucou|^hey|^help|^aide|tu fais quoi|quoi de neuf/.test(q)&&q.length<30){
    const variants=[`Salut ! Je peux te dire quelles plages sont propres, avec enfants ou snorkeling, et t'expliquer H2S, AFAI ou les données Copernicus.${clean.length?` Là tu as ${clean.length} plage${clean.length>1?"s":""} en vert.`:""} Dis-moi ce que tu cherches !`,"Coucou ! Je suis là pour les plages et les sargasses : recommandations, prévisions, H2S, données satellite. Pose une question ou tape une des suggestions ci-dessous."]
    return out(rnd(variants),["Quelle plage propre maintenant ?","C'est quoi le H2S ?","D'où viennent les données ?"])
  }
  if(/h2s|gaz|santé|danger|odeur|irrit/.test(q)){
    return "Le H2S (sulfure d’hydrogène) est un gaz libéré quand les sargasses pourrissent. En forte concentration ça peut irriter les yeux et la gorge. Les plages en rouge « À éviter » sont celles où on signale ce risque — évite surtout avec des enfants ou des personnes fragiles."
  }
  if(/quand|arrivent|arrivée|saison|prévision/.test(q)){
    return "Les sargasses varient avec les courants et le vent. Les données sont mises à jour régulièrement : consulte la carte et la liste des plages pour voir les statuts du jour. En général la saison haute va d’avril à septembre, mais ça change d’une semaine à l’autre."
  }
  if(/heure|meilleure|moment|aller/.test(q)){
    return "Le matin tôt ou en fin d’après-midi, il fait moins chaud et souvent moins de vent. Consulte la météo sur la fiche de chaque plage pour le vent et l’UV."
  }
  if(/touriste|tourisme|🧳|visiter|conseil/.test(q)){
    const ici=options.island==="gp"?"Guadeloupe":"Martinique"
    if(!clean.length) return `Bienvenue en ${ici} ! Les plages propres changent souvent. Ouvre la carte pour voir en vert celles à privilégier aujourd'hui.`
    const b=firstClean
    return `Bienvenue en ${ici} ! Pour aujourd’hui je te conseille <beach>${b.id}</beach> — ${b.name}, ${b.commune}. C’est une des plages propres du moment. Consulte la liste pour en voir d’autres. 🧳`
  }
  // Réponse par défaut
  if(clean.length){
    const b=rnd(clean)
    return `Tu as ${clean.length} plage${clean.length>1?"s":""} propre${clean.length>1?"s":""} en ce moment. Essaie par exemple <beach>${b.id}</beach> — ${b.name}, ${b.drive} min. Dis-moi si tu cherches une plage avec enfants, du snorkeling ou un road trip !`
  }
  return "Aucune plage en vert pour l’instant. Consulte la carte et la liste des plages pour les statuts à jour. Tu peux aussi demander « plage propre maintenant » ou « avec des enfants » pour des idées."
}

function getStaticReplyEn(userMessage, beaches, options = {}){
  const q=(userMessage||"").toLowerCase().trim()
  const clean=beaches.filter(b=>b.status==="clean")
  const withKids=clean.filter(b=>b.kids)
  const withSnorkel=clean.filter(b=>b.snorkel)
  const firstClean=clean[0]
  const rnd=(arr)=>arr[arr.length?Math.floor(Math.random()*arr.length):0]
  const fromCopernicus=options.sargassumData?.source==="copernicus"
  const dataNote=fromCopernicus?" Beach status comes from Copernicus Marine (satellite + drift model), updated regularly.":" Status is from reference data; sign in for Copernicus Marine updates."
  function out(text,suggestions){ if(suggestions?.length) return {text,suggestions}; return text }
  if(/clean beach|which beach|now|clean now|swim/.test(q)){
    if(!firstClean) return out("No clean beaches right now. Check the map for updates."+dataNote,["When do sargassum arrive?","What is AFAI?"])
    const variants=[`Today ${clean.length} clean beach${clean.length>1?"es":""}. I recommend <beach>${firstClean.id}</beach> — ${firstClean.drive} min drive.${dataNote}`,`For a clean spot now: <beach>${firstClean.id}</beach> (${firstClean.name}, ${firstClean.commune}). ${clean.length} clean at the moment.`]
    return out(rnd(variants),["With kids 🧒","Snorkeling 🤿","Road trip today"])
  }
  if(/kid|children|family/.test(q)){
    if(!withKids.length) return "No clean kid-friendly beach right now. Check the list and map; it changes quickly."
    const b=rnd(withKids)
    return `For kids, try a calm clean beach: <beach>${b.id}</beach>. ${b.commune}, ${b.drive} min. 🧒`
  }
  if(/snorkel|🤿|mask/.test(q)){
    if(!withSnorkel.length) return "No clean snorkeling spot right now. Try again tomorrow or check the map."
    const b=rnd(withSnorkel)
    return `Clean spot for snorkeling: <beach>${b.id}</beach>. ${b.commune}, ${b.drive} min. 🤿`
  }
  if(/road trip|roadtrip|three beaches|3 beaches/.test(q)){
    const three=clean.slice(0,3)
    if(!three.length) return "Not enough clean beaches for a road trip today. Check the map for forecasts."
    return `Today's road trip: ${three.map(b=>b.name).join(", ")}. Start with <beach>${three[0].id}</beach> then continue by route. 🚗`
  }
  if(/data|source|copernicus|satellite|where.*from|accuracy/.test(q)){
    const variants=fromCopernicus?["Status comes from Copernicus Marine: satellite product (algae detection) + ocean drift model. Data is refreshed regularly for the Caribbean.","We use Copernicus Marine (Sentinel-3 satellite and drift model). Beaches are updated from this data."]:["Right now status is from reference data. When Copernicus Marine is connected you'll get satellite + drift updates.","Displayed data is reference. Once Copernicus Marine is connected you'll get satellite and drift updates. « Copernicus ✓ » at top when active."]
    return out(rnd(variants),["What is AFAI?","When do sargassum arrive?","Clean beach now?"])
  }
  if(/afai|index|score|green orange red/.test(q)&&!/beach|which/.test(q)){
    return out("AFAI (Algal Floating Algae Index) measures floating algae. Green = clean (low AFAI), orange = moderate, red = avoid. Shown on each beach card with 7-day forecast.",["What is H2S?","Where does data come from?","Clean beach now?"])
  }
  if(/weekend|next week|tomorrow|forecast/.test(q)&&!/tourist|3 day/.test(q)){
    return out("7-day forecasts are on each beach card (AFAI curve). Lower AFAI = better chance the beach stays clean. Check the map to compare spots."+dataNote,["What is AFAI?","Clean beach now?"])
  }
  if(/weather|wind|uv|sun|hot|temp/.test(q)){
    return out("Weather (wind, UV, temperature) is on each beach card via Open-Meteo. Use it to pick time and spot by wind and sun.",["Best time to go?","Clean beach now?"])
  }
  if(/sargassum|algae|sea|ocean|pollution/.test(q)&&!/beach|where/.test(q)){
    return out("Sargassum are brown algae that drift at sea. In large amounts they wash up, rot and can release H2S. Satellite data helps anticipate strandings. The app uses satellite + drift model to tell you where it's clean or to avoid.",["What is H2S?","What is AFAI?","Where does data come from?"])
  }
  if(/martinique|guadeloupe|which island|choose|^mq$|^gp$/.test(q)){
    const islandLabel=options.island==="gp"?"Guadeloupe":"Martinique"
    const nClean=clean.length
    return out(`You're on ${islandLabel}. ${nClean} clean beach${nClean>1?"es":""} right now. Switch island at the top (MQ / GP) to see the other.`+dataNote,["Clean beach now?","Road trip today"])
  }
  if(/parking|car|calm|quiet/.test(q)){
    const withParking=clean.filter(b=>b.parking)
    if(!withParking.length) return out("No clean beach with parking indicated right now. Check the beach list for details (🅿️).",["Clean beach now?"])
    const b=rnd(withParking)
    return out(`With parking and clean: <beach>${b.id}</beach> — ${b.commune}, ${b.drive} min. 🅿️`,["With kids 🧒","Snorkeling 🤿"])
  }
  if(/^hi|^hello|^hey|^help|^what can you/.test(q)&&q.length<30){
    return out(`Hi! I can tell you which beaches are clean, with kids or snorkeling, and explain H2S, AFAI or Copernicus.${clean.length?` You have ${clean.length} clean right now.`:""} Tell me what you need!`,["Clean beach now?","What is H2S?","Where does data come from?"])
  }
  if(/h2s|gas|health|danger|smell|irritat/.test(q)){
    return "H2S (hydrogen sulfide) is a gas released when sargassum rots. In high concentration it can irritate eyes and throat. Red « Avoid » beaches are those where we flag this risk — especially avoid with kids or sensitive people."
  }
  if(/when|arrive|season/.test(q)){
    return "Sargassum vary with currents and wind. Data is updated regularly: check the map and beach list for today's status. Generally peak season is April to September."
  }
  if(/time|best|moment|go/.test(q)){
    return "Early morning or late afternoon it's cooler and often less wind. Check weather on each beach card for wind and UV."
  }
  if(/tourist|tourism|🧳|visit|advice/.test(q)){
    const ici=options.island==="gp"?"Guadeloupe":"Martinique"
    if(!clean.length) return `Welcome to ${ici}! Clean beaches change often. Open the map to see which are clean today.`
    return `Welcome to ${ici}! For today I recommend <beach>${firstClean.id}</beach> — ${firstClean.name}, ${firstClean.commune}. One of the clean beaches right now. Check the list for more. 🧳`
  }
  if(clean.length){ const b=rnd(clean); return `You have ${clean.length} clean beach${clean.length>1?"es":""} right now. Try e.g. <beach>${b.id}</beach> — ${b.name}, ${b.drive} min. Ask for kids, snorkeling or a road trip!` }
  return "No clean beaches right now. Check the map and beach list for up-to-date status. You can also ask « clean beach now » or « with kids » for ideas."
}

// ═══ CSS ═════════════════════════════════════════════════════════════════════
const THEME_VARS=`
:root,.theme-light{--sg-bg:#FFFFFF;--sg-bgD:#F7F7F8;--sg-card:#FFFFFF;--sg-cardS:#FAFAFA;--sg-ink:#000000;--sg-mid:#000000;--sg-mute:#333333;--sg-border:rgba(0,0,0,.08);--sg-borderM:rgba(0,0,0,.14);--sg-glass:rgba(255,255,255,.92);--sg-glassBorder:rgba(0,0,0,.06);--sg-rowHover:rgba(0,0,0,.03);--sg-sk:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);--sg-handle:rgba(0,0,0,.25);--sg-card-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06);--sg-card-shadow-lg:0 4px 12px rgba(0,0,0,.08),0 16px 40px rgba(0,0,0,.08);}
.theme-dark{--sg-bg:#0d1117;--sg-bgD:#161b22;--sg-card:#161b22;--sg-cardS:#21262d;--sg-ink:#e6edf3;--sg-mid:#adbac7;--sg-mute:#8b949e;--sg-border:rgba(255,255,255,.08);--sg-borderM:rgba(255,255,255,.14);--sg-glass:rgba(22,27,34,.85);--sg-glassBorder:rgba(255,255,255,.08);--sg-rowHover:rgba(255,255,255,.06);--sg-sk:linear-gradient(90deg,#21262d 25%,#30363d 50%,#21262d 75%);--sg-handle:rgba(255,255,255,.2);--sg-accent:rgba(201,167,87,.28);--sg-accent-text:#e6edf3;--sg-card-shadow:0 2px 10px rgba(0,0,0,.35);--sg-status-clean:#3fb950;--sg-status-clean-bg:rgba(63,185,80,.14);--sg-status-clean-border:rgba(63,185,80,.25);--sg-status-moderate:#c9a04a;--sg-status-moderate-bg:rgba(201,160,74,.14);--sg-status-moderate-border:rgba(201,160,74,.25);--sg-status-avoid:#e5534b;--sg-status-avoid-bg:rgba(229,83,75,.14);--sg-status-avoid-border:rgba(229,83,75,.25);}
`
const CSS=`
${GFONTS}
${THEME_VARS}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:clamp(14px,2.2vw + 12px,16px);-webkit-text-size-adjust:100%}
html,body{font-family:'Syne',sans-serif;background:var(--sg-bg);height:100%;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{display:none}
*{-webkit-tap-highlight-color:transparent}
input,textarea{font-family:'Syne',sans-serif}
input::placeholder,textarea::placeholder{color:var(--sg-mid);opacity:.9}

/* ─ Keyframes ─ */
@keyframes spinR{to{transform:rotate(360deg)}}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes in{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes slideL{from{transform:translateX(32px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideR{from{transform:translateX(-32px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes pinPop{0%{transform:translate(-50%,-50%) scale(0)}65%{transform:translate(-50%,-50%) scale(1.25)}100%{transform:translate(-50%,-50%) scale(1)}}
@keyframes beacon{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.5}60%{transform:translate(-50%,-50%) scale(3.2);opacity:0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes dotT{0%,80%,100%{transform:scale(.5);opacity:.2}40%{transform:scale(1);opacity:1}}
@keyframes confetti{to{transform:translateY(130vh) rotate(960deg);opacity:0}}
@keyframes xpFill{from{width:0}to{width:var(--xp-w)}}
@keyframes xpPop{0%{transform:scale(1)}40%{transform:scale(1.2)}100%{transform:scale(1)}}
@keyframes xpFloat{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-30px) scale(.8)}}
@keyframes levelUp{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}
@keyframes wave{0%,100%{transform:translateX(0) scaleY(1)}50%{transform:translateX(-4px) scaleY(1.04)}}
@keyframes driftB{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(6px,-4px) scale(1.04)}66%{transform:translate(-4px,5px) scale(.97)}}
@keyframes grain{0%,100%{transform:translate(0,0)}25%{transform:translate(-1px,1px)}50%{transform:translate(1px,-1px)}75%{transform:translate(-1px,-1px)}}
@keyframes shimmer{from{background-position:-200% 0}to{background-position:200% 0}}
@keyframes onbIn{from{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes countUp{from{transform:scale(.75);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(237,160,0,0)}50%{box-shadow:0 0 30px 6px rgba(237,160,0,.18)}}
@keyframes badgeIn{0%{transform:scale(0) rotate(-15deg);opacity:0}70%{transform:scale(1.1) rotate(3deg)}100%{transform:scale(1) rotate(0deg);opacity:1}}

/* ─ Grain texture overlay ─ */
.grain::after{content:'';position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");pointer-events:none;z-index:1;animation:grain .4s steps(1) infinite;border-radius:inherit}

/* ─ Glass card ─ */
.glass{background:var(--sg-glass);backdrop-filter:blur(18px) saturate(1.5);-webkit-backdrop-filter:blur(18px) saturate(1.5);border:1px solid var(--sg-glassBorder)}

/* ─ Shimmer skeleton ─ */
.sk{background:var(--sg-sk);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:8px}

/* ─ Interactions ─ */
.tap:active{transform:scale(.955);opacity:.82}
.hover:hover{transform:translateY(-1px)!important;filter:brightness(1.02)}
.row:hover{background:var(--sg-rowHover)!important}

/* ─ Shell: mobile first, then tablet, then desktop ─ */
.shell{width:100%;min-height:100vh;min-height:100dvh;max-width:100%;margin:0 auto;display:flex;flex-direction:column;position:relative;overflow:hidden;font-family:'Syne',sans-serif;background:var(--sg-bg)}
.bsi{border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom)}
@media(max-width:767px){
  .sidebar{display:none!important}
}
@media(min-width:768px){
  .shell{max-width:100%!important;flex-direction:row!important;height:100vh}
  .sidebar{display:flex!important;width:268px;min-width:268px;height:100vh;flex-direction:column;border-right:1px solid var(--sg-border);background:var(--sg-card);overflow:hidden;flex-shrink:0;position:relative}
  .bn{display:none!important}
  .bsi{max-width:600px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important}
}
/* Tablet: 2-col grid pour les use-cases */
@media(min-width:600px) and (max-width:767px){
  .shell{max-width:100%!important}
  .uc-grid{grid-template-columns:repeat(3,1fr)!important}
  .clean-scroll{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))!important;overflow-x:visible!important}
  .beach-row{gap:16px!important}
}
/* Large desktop */
@media(min-width:1200px){
  .sidebar{width:300px!important;min-width:300px!important}
  .bsi{max-width:680px!important}
}
`

// ═══ ATOMS ════════════════════════════════════════════════════════════════════
const SDot=({s,sz=10,pulse:p=true})=>{
  const st=ST[s]||ST.clean
  return(
    <div style={{position:"relative",width:sz,height:sz,flexShrink:0}}>
      {s==="avoid"&&p&&<div style={{position:"absolute",inset:0,borderRadius:"50%",background:st.c,animation:"beacon 2.3s ease-out infinite"}}/>}
      <div style={{position:"absolute",inset:0,borderRadius:"50%",background:st.c,border:"2px solid white",boxShadow:`0 1px 7px ${st.c}55`}}/>
    </div>
  )
}

const Chip=({status,sm,style:sx})=>{
  const lang=useLang()
  const st=ST[status]||ST.clean
  const L=T[lang]||T.fr
  const label=status==="clean"?L.statusClean:status==="moderate"?L.statusModerate:L.statusAvoid
  const key=status==="clean"?"clean":status==="moderate"?"moderate":"avoid"
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:sm?"4px 10px":"6px 14px",borderRadius:100,fontSize:sm?12:14,fontWeight:700,color:`var(--sg-status-${key}, ${st.c})`,background:`var(--sg-status-${key}-bg, ${st.bg})`,border:`1px solid var(--sg-status-${key}-border, ${st.c}22)`,...sx}}>{st.e} {label}</span>
}

const GBtn=({children,onClick,full,sm,outline,dark,disabled,style:sx})=>{
  const base={width:full?"100%":"auto",padding:sm?"10px 18px":"14px 24px",borderRadius:14,fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:sm?12:15,letterSpacing:".07em",textTransform:"uppercase",cursor:disabled?"not-allowed":"pointer",transition:"all .18s",opacity:disabled?.5:1,...sx}
  if(dark) return <button onClick={!disabled&&onClick} style={{...base,background:`linear-gradient(145deg,${C.night},${C.night2})`,color:"white",border:"none",boxShadow:"0 4px 20px rgba(0,0,0,.22)"}}>{children}</button>
  if(outline) return <button onClick={!disabled&&onClick} style={{...base,background:"transparent",color:C.gold,border:`2px solid ${C.gold}`}}>{children}</button>
  return <button onClick={!disabled&&onClick} style={{...base,background:`linear-gradient(158deg,${C.goldLL},${C.goldL} 42%,#AF7200)`,color:"var(--sg-ink)",border:"none",boxShadow:`0 4px 20px rgba(196,131,10,.32)`}}
    onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.02)";e.currentTarget.style.boxShadow=`0 6px 26px rgba(196,131,10,.42)`}}
    onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=`0 4px 20px rgba(196,131,10,.32)`}}>{children}</button>
}

const Card=({children,style:sx,onClick,hover,glass})=>(
  <div onClick={onClick} className={(hover?"hover ":"")+(glass?"glass ":"")} style={{background:"var(--sg-card)",borderRadius:18,border:"1px solid var(--sg-border)",boxShadow:"var(--sg-card-shadow)",cursor:onClick?"pointer":"default",transition:"all .2s",...sx}}>
    {children}
  </div>
)

// ═══ CONFETTI ═════════════════════════════════════════════════════════════════
const Confetti=({on})=>{
  if(!on) return null
  const cols=[C.goldL,C.goldLL,C.tealL,"#fff",C.greenL,"#F48FB1","#90CAF9","#A5D6A7","#FFE082"]
  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,pointerEvents:"none",overflow:"hidden"}}>
      {Array.from({length:80},(_,i)=><div key={i} style={{position:"absolute",left:`${2+Math.random()*96}%`,top:-16,width:Math.random()>.5?9:13,height:7,borderRadius:Math.random()>.6?"50%":"2px",background:cols[i%cols.length],animation:`confetti ${1.6+Math.random()*1.6}s ease-in ${Math.random()*.9}s both`,transform:`rotate(${Math.random()*360}deg)`}}/>)}
    </div>
  )
}

// ═══ XP NOTIFICATION ══════════════════════════════════════════════════════════
function XPToast({xp,visible}){
  if(!visible||!xp) return null
  return(
    <div style={{position:"fixed",top:70,right:14,zIndex:800,background:`linear-gradient(135deg,${C.goldLL},${C.goldL})`,color:"var(--sg-ink)",borderRadius:100,padding:"6px 14px",fontSize:12,fontWeight:800,boxShadow:`0 3px 14px rgba(196,131,10,.35)`,animation:"xpFloat 1.6s ease both",display:"flex",alignItems:"center",gap:5,pointerEvents:"none"}}>
      ⭐ +{xp} XP
    </div>
  )
}

// ═══ BOTTOM SHEET ══════════════════════════════════════════════════════════════
function Sheet({open,onClose,children}){
  if(!open) return null
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.42)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="bsi" onClick={e=>e.stopPropagation()} style={{position:"relative",width:"100%",maxHeight:"92vh",background:"var(--sg-bg)",borderRadius:"22px 22px 0 0",boxShadow:"0 -14px 56px rgba(0,0,0,.13)",display:"flex",flexDirection:"column",animation:"slideUp .3s cubic-bezier(.16,1,.3,1) both",paddingBottom:"env(safe-area-inset-bottom)"}}>
        <div onClick={onClose} style={{height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
          <div style={{width:36,height:4,borderRadius:2,background:"var(--sg-handle)"}}/>
        </div>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>{children}</div>
      </div>
    </div>
  )
}

// ═══ WEATHER HOOK ══════════════════════════════════════════════════════════════
function useWeather(lat,lng,timezone="America/Martinique"){
  const [w,setW]=useState(null),[loading,setL]=useState(false),[error,setErr]=useState(false)
  useEffect(()=>{
    if(!lat||!lng) return
    if(typeof navigator!=="undefined"&&!navigator.onLine){setL(false);setErr(true);return}
    setErr(false);setL(true)
    const tz=timezone==="America/Guadeloupe"?"America/Guadeloupe":"America/Martinique"
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index&timezone=${tz}`)
      .then(r=>{if(!r.ok)throw new Error("Météo");return r.json()})
      .then(d=>{setW({wind:Math.round(d.current?.wind_speed_10m||0),dir:Math.round(d.current?.wind_direction_10m||90),uv:Math.round(d.current?.uv_index||0),temp:Math.round(d.current?.temperature_2m||28)});setL(false);setErr(false)})
      .catch(()=>{setL(false);setErr(true)})
  },[lat,lng,timezone])
  return{w,loading,error}
}
// ═══ ONLINE STATUS ══════════════════════════════════════════════════════════════
function useOnline(){
  const [online,setOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true)
  useEffect(()=>{
    const on=()=>setOnline(true)
    const off=()=>setOnline(false)
    window.addEventListener("online",on);window.addEventListener("offline",off)
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off)}
  },[])
  return online
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ ONBOARDING — "Cette fois, tu seras prévenu."
// ═══════════════════════════════════════════════════════════════════════════════
const SLIDES=[
  {
    bg:`#FFFFFF`,
    accent:C.red,
    kicker:"La vraie vie",
    headline:"Tu as déjà\nfait 50 km\npour rien.",
    body:"La plage envahie de sargasses. La puanteur. Le gaz. Tes enfants déçus.\n\nPlus jamais.",
    visual:"😤",
    cta:"Je connais ce moment →",
  },
  {
    bg:`#FFFFFF`,
    accent:C.teal,
    kicker:"Comment ça marche",
    headline:"Données\nsatellite\ntoutes les 6h.",
    body:"Sentinel-3 détecte les sargasses depuis l'espace.\nModèle de dérive Copernicus Marine.\n\nPrécision : 92% sur 48h.",
    visual:"🛰️",
    cta:"Et alors ? →",
  },
  {
    bg:`#FFFFFF`,
    accent:C.gold,
    kicker:"La promesse",
    headline:"Cette fois,\ntu seras\nprévenu.",
    body:"Notification push avant que tu partes.\nPrévision 7 jours pour planifier.\nAlerte H2S si danger pour tes enfants.",
    visual:"🔔",
    cta:"Entrer dans l'app →",
    last:true,
  },
]

function Onboarding({onDone}){
  const [idx,setIdx]=useState(0)
  const [key,setKey]=useState(0)
  const touchX=useRef(null)
  const sl=SLIDES[idx]

  function go(n){
    if(n<0||n>=SLIDES.length) return
    setIdx(n);setKey(k=>k+1)
  }
  function onTS(e){touchX.current=e.touches[0].clientX}
  function onTE(e){const dx=e.changedTouches[0].clientX-touchX.current;if(Math.abs(dx)<38)return;dx<0?go(idx+1):go(idx-1)}

  return(
    <div onTouchStart={onTS} onTouchEnd={onTE} style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:sl.bg,transition:"background .6s ease",userSelect:"none",position:"relative"}}>
      {/* Grain */}
      <div className="grain" style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0}}/>

      {/* Skip */}
      <div style={{padding:"14px 20px",display:"flex",justifyContent:"flex-end",flexShrink:0,zIndex:2}}>
        {!sl.last&&<button onClick={onDone} style={{background:"none",border:"none",fontSize:13,fontWeight:700,color:"#000",cursor:"pointer",fontFamily:"'Syne',sans-serif",letterSpacing:".07em",textTransform:"uppercase"}}>Passer</button>}
      </div>

      {/* Content */}
      <div key={key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 32px",zIndex:2,animation:"onbIn .5s cubic-bezier(.16,1,.3,1) both"}}>
        {/* Visual */}
        <div style={{fontSize:76,lineHeight:1,marginBottom:28,animation:"wave 4s ease-in-out infinite"}}>{sl.visual}</div>

        {/* Kicker */}
        <div style={{fontSize:14,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:sl.accent,marginBottom:12}}>{sl.kicker}</div>

        {/* Headline */}
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:42,lineHeight:1.0,letterSpacing:".01em",textTransform:"uppercase",color:"var(--sg-ink)",textAlign:"center",marginBottom:18,whiteSpace:"pre-line",textShadow:"0 2px 0 rgba(0,0,0,.04)"}}>{sl.headline}</div>

        {/* Body */}
        <div style={{fontSize:17,color:"#000",textAlign:"center",lineHeight:1.8,maxWidth:380,whiteSpace:"pre-line",fontWeight:500}}>{sl.body}</div>
      </div>

      {/* Bottom */}
      <div style={{padding:"24px 28px 44px",display:"flex",flexDirection:"column",alignItems:"center",gap:18,flexShrink:0,zIndex:2}}>
        {/* Dots */}
        <div style={{display:"flex",gap:7}}>
          {SLIDES.map((_,i)=>(
            <div key={i} onClick={()=>go(i)} style={{width:i===idx?24:7,height:7,borderRadius:4,cursor:"pointer",background:i===idx?sl.accent:"rgba(0,0,0,.12)",transition:"all .35s cubic-bezier(.34,1.56,.64,1)"}}/>
          ))}
        </div>

        {/* CTA */}
        {sl.last
          ?<GBtn full onClick={onDone} style={{maxWidth:340}}>{sl.cta}</GBtn>
          :<button onClick={()=>go(idx+1)} style={{width:"100%",maxWidth:380,padding:"16px 24px",background:sl.accent,color:"white",border:"none",borderRadius:16,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,cursor:"pointer",boxShadow:`0 4px 20px ${sl.accent}44`,whiteSpace:"nowrap"}}>{sl.cta}</button>
        }
        <div style={{fontSize:14,color:"#000",textAlign:"center",lineHeight:1.7,fontWeight:500}}>Aucun compte · Données locales · Zéro pub</div>
        <div style={{fontSize:14,color:"#000",textAlign:"center",marginTop:2,fontWeight:700}}>+2 400 utilisateurs en Martinique & Guadeloupe</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ CHAT IA
// ═══════════════════════════════════════════════════════════════════════════════
function ChatScreen({beaches,favs,onFavToggle,onOpenBeach,initQ,onXP,sargassumData,island}){
  const lang=useLang()
  const L=T[lang]||T.fr
  const islandName = island === "gp" ? "Guadeloupe" : "Martinique"
  const welcomeEn = `Hi! 🌴 I'm your sargassum assistant for ${islandName}.\n\nTell me where you want to go or what you're looking for (clean beach, kids, snorkeling, road trip…).`
  const welcomeFr = `Salut ! 🌴 Je suis ton assistant sargasses pour la ${islandName}.\n\nDis-moi où tu veux aller ou ce que tu cherches (plage propre, enfants, snorkeling, road trip…).`
  const [msgs,setMsgs]=useState([{r:"a",t: lang==="en"?welcomeEn:welcomeFr}])
  const [inp,setInp]=useState("")
  const [busy,setBusy]=useState(false)
  const didInit=useRef(false)
  const bottomRef=useRef()

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[msgs,busy])
  useEffect(()=>{if(initQ&&!didInit.current){didInit.current=true;setTimeout(()=>send(initQ),300)}},[initQ])

  async function send(text){
    if(!text?.trim()||busy) return
    const um={r:"u",t:text.trim()}
    const next=[...msgs,um]
    setMsgs(next);setInp("");setBusy(true);onXP("chat")
    if(typeof navigator!=="undefined"&&!navigator.onLine){
      setMsgs(p=>[...p,{r:"a",t: lang==="en"?"📡 Offline — check the beach list and map: status is shown. Try again when reconnected.":"📡 Hors ligne — consulte la liste des plages et la carte : les statuts sont affichés. Réessaie quand tu es reconnecté."}])
      setBusy(false)
      return
    }
    const reply=getStaticReply(text.trim(),beaches,{sargassumData,island,lang})
    const textOrObj=typeof reply==="object"?reply.text:reply
    const suggestions=typeof reply==="object"?reply.suggestions:null
    const recId=textOrObj.match(/<beach>(.*?)<\/beach>/)?.[1]
    if(recId&&!favs.includes(recId)){onFavToggle(recId);onXP("fav")}
    setTimeout(()=>{
      setMsgs(p=>[...p,{r:"a",t:textOrObj,suggestions:suggestions||undefined}])
      setBusy(false)
    },400)
  }

  const QUICK_FR=["Quelle plage propre maintenant ?","Avec des enfants 🧒","Snorkeling 🤿","Road trip aujourd'hui","C'est quoi le H2S ?","Quand les sargasses arrivent ?","Meilleure heure pour y aller ?","Je suis touriste 🧳","D'où viennent les données ?","C'est quoi l'AFAI ?"]
  const QUICK_EN=["Clean beach now?","With kids 🧒","Snorkeling 🤿","Road trip today","What is H2S?","When do sargassum arrive?","Best time to go?","I'm a tourist 🧳","Where does data come from?","What is AFAI?"]
  const QUICK=lang==="en"?QUICK_EN:QUICK_FR

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <div style={{padding:"12px 16px 11px",borderBottom:"1px solid var(--sg-border)",display:"flex",alignItems:"center",gap:12,flexShrink:0,background:"var(--sg-card)"}}>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:40,height:40,borderRadius:"50%",background:`conic-gradient(from 0deg,${C.tealL},${C.teal},#0077B6,${C.teal},${C.tealL})`,animation:"spinR 7s linear infinite"}}/>
          <div style={{position:"absolute",bottom:0,right:0,width:11,height:11,borderRadius:"50%",background:C.greenL,border:"2px solid white"}}/>
        </div>
        <div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,textTransform:"uppercase",color:"var(--sg-ink)"}}>{L.assistantTitle} {islandName}</div>
          <div style={{fontSize:13,color:"var(--sg-mute)"}}>{beaches.filter(b=>b.status==="clean").length} {L.propres} · <span style={{color:navigator.onLine?C.green:C.amber,fontWeight:700}}>{navigator.onLine?L.enLigne:L.horsLigne}</span></div>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 8px",WebkitOverflowScrolling:"touch"}}>
        {msgs.map((m,i)=>{
          const isU=m.r==="u"
          const clean=(m.t||"").replace(/<beach>.*?<\/beach>/g,"").trim()
          const recId=(m.t||"").match(/<beach>(.*?)<\/beach>/)?.[1]
          const rec=recId&&beaches.find(b=>b.id===recId)
          const suggestions=m.suggestions
          return(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isU?"flex-end":"flex-start",marginBottom:14,animation:"up .3s ease both"}}>
              <div style={{maxWidth:"85%",padding:"14px 17px",fontSize:15,lineHeight:1.7,borderRadius:isU?"20px 20px 4px 20px":"20px 20px 20px 4px",background:isU?`linear-gradient(155deg,${C.goldLL},${C.goldL} 40%,#B07200)`:"var(--sg-card)",color:"var(--sg-ink)",border:isU?"none":"1px solid var(--sg-border)",boxShadow:isU?`0 3px 16px rgba(196,131,10,.26)`:"var(--sg-card-shadow)",whiteSpace:"pre-wrap"}}>{clean}</div>
              {suggestions&&suggestions.length>0&&!isU&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8,maxWidth:"85%"}}>
                  {suggestions.map(sug=><button key={sug} onClick={()=>send(sug)} style={{padding:"8px 14px",border:"1px solid var(--sg-border)",borderRadius:100,background:"var(--sg-card)",fontSize:13,fontWeight:600,color:"var(--sg-ink)",cursor:"pointer",fontFamily:"'Syne',sans-serif",transition:"border-color .18s",whiteSpace:"nowrap"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.goldL} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--sg-border)"}>{sug}</button>)}
                </div>
              )}
              {rec&&!isU&&(
                <div onClick={()=>onOpenBeach(rec)} className="tap hover" style={{maxWidth:"85%",marginTop:6,background:"var(--sg-card)",borderRadius:14,overflow:"hidden",border:"1px solid var(--sg-border)",boxShadow:"0 2px 10px rgba(0,0,0,.055)",cursor:"pointer"}}>
                  <div style={{padding:"11px 14px 9px",background:`linear-gradient(135deg,${ST[rec.status]?.bg},transparent)`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:16,color:"var(--sg-ink)",lineHeight:1.1}}>{rec.name}</div>
                      <div style={{fontSize:13,color:"var(--sg-mute)",marginTop:3}}>{rec.commune} · {rec.drive}min</div>
                    </div>
                    <Chip status={rec.status} sm/>
                  </div>
                  <div style={{padding:"6px 14px 9px",display:"flex",alignItems:"center",gap:7,fontSize:10,color:"var(--sg-mid)"}}>
                    {rec.kids&&<span>🧒</span>}{rec.snorkel&&<span>🤿</span>}{rec.parking&&<span>🅿️</span>}
                    <span style={{marginLeft:"auto",color:favs.includes(rec.id)?C.red:C.mute,fontWeight:700,cursor:"pointer"}} onClick={e=>{e.stopPropagation();onFavToggle(rec.id);onXP("fav")}}>{favs.includes(rec.id)?"❤️ "+L.fav:"🤍 "+L.addFav}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {busy&&<div style={{display:"flex",marginBottom:14}}><div style={{background:"var(--sg-card)",border:`1px solid var(--sg-border)`,borderRadius:"18px 18px 18px 4px",padding:"13px 16px",display:"flex",gap:5,alignItems:"center",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.goldL,animation:`dotT 1.2s ease ${i*.14}s infinite`}}/>)}</div></div>}
        {msgs.length===1&&!busy&&<div style={{marginBottom:10}}><div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",marginBottom:10}}>Suggestions</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{QUICK.map(q=><button key={q} onClick={()=>send(q)} style={{padding:"9px 15px",border:`1px solid var(--sg-border)`,borderRadius:100,background:"var(--sg-card)",fontSize:13,fontWeight:600,color:"var(--sg-ink)",cursor:"pointer",fontFamily:"'Syne',sans-serif",transition:"border-color .18s",whiteSpace:"nowrap",boxShadow:"var(--sg-card-shadow)"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.goldL} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>{q}</button>)}</div></div>}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{flexShrink:0,padding:"9px 12px 12px",borderTop:"1px solid var(--sg-border)",display:"flex",gap:8,alignItems:"flex-end",background:"var(--sg-card)"}}>
        <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),send(inp))} placeholder={L.placeholderQuestion} style={{flex:1,padding:"12px 14px",fontSize:13,border:`1.5px solid ${inp?C.goldL+"44":"var(--sg-border)"}`,borderRadius:14,background:"var(--sg-bg)",color:"var(--sg-ink)",outline:"none",transition:"border-color .2s"}}/>
        <button onClick={()=>send(inp)} disabled={busy||!inp.trim()} style={{width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,background:(!inp.trim()||busy)?"rgba(0,0,0,.07)":`linear-gradient(135deg,${C.goldL},${C.gold})`,cursor:(!inp.trim()||busy)?"not-allowed":"pointer",fontSize:18,boxShadow:(!inp.trim()||busy)?"none":`0 3px 14px rgba(196,131,10,.38)`,transition:"all .2s"}}>→</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ LISTE PLAGES
// ═══════════════════════════════════════════════════════════════════════════════
function ListeScreen({beaches,favs,onFavToggle,onOpenBeach,gps,onXP,localBeachImages={}}){
  const lang=useLang()
  const L=T[lang]||T.fr
  const [filter,setFilter]=useState("all")
  const [search,setSearch]=useState("")
  const FILTERS=[{id:"all",l:L.filtres[0]},{id:"clean",l:L.filtres[1]},{id:"favs",l:L.filtres[2]},{id:"kids",l:L.filtres[3]},{id:"snorkel",l:L.filtres[4]},{id:"avoid",l:L.filtres[5]}]

  const filtered=useMemo(()=>{
    let list=beaches
    if(filter==="clean") list=list.filter(b=>b.status==="clean")
    else if(filter==="favs") list=list.filter(b=>favs.includes(b.id))
    else if(filter==="kids") list=list.filter(b=>b.kids&&b.status==="clean")
    else if(filter==="snorkel") list=list.filter(b=>b.snorkel&&b.status==="clean")
    else if(filter==="avoid") list=list.filter(b=>b.status==="avoid")
    if(search) list=list.filter(b=>b.name.toLowerCase().includes(search.toLowerCase())||b.commune.toLowerCase().includes(search.toLowerCase()))
    if(gps) return[...list].sort((a,b)=>hav(gps.lat,gps.lng,a.lat,a.lng)-hav(gps.lat,gps.lng,b.lat,b.lng))
    return list
  },[filter,search,beaches,favs,gps])

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"10px 14px 8px",borderBottom:`1px solid var(--sg-border)`,background:"var(--sg-card)",flexShrink:0}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher une plage ou commune…" style={{width:"100%",padding:"12px 16px",fontSize:15,border:"1.5px solid var(--sg-border)",borderRadius:14,background:"var(--sg-bg)",color:"var(--sg-ink)",outline:"none"}}/>
      </div>
      <div style={{padding:"8px 14px",display:"flex",gap:6,overflowX:"auto",borderBottom:"1px solid var(--sg-border)",flexShrink:0}}>
        {FILTERS.map(f=><button key={f.id} onClick={()=>setFilter(f.id)} style={{padding:"8px 16px",borderRadius:100,border:"none",cursor:"pointer",whiteSpace:"nowrap",fontSize:13,fontWeight:600,fontFamily:"'Syne',sans-serif",background:filter===f.id?"var(--sg-accent, var(--sg-ink))":"var(--sg-rowHover)",color:filter===f.id?"var(--sg-accent-text, white)":"var(--sg-mid)",transition:"all .2s"}}>{f.l}</button>)}
      </div>
      <div style={{padding:"10px 16px 4px",fontSize:14,color:"var(--sg-mute)",fontWeight:600,flexShrink:0}}>{filtered.length} plage{filtered.length>1?"s":""}{gps?" · triées par distance":""}</div>
      <div style={{flex:1,overflowY:"auto",padding:"4px 12px 12px"}}>
        {filtered.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:"var(--sg-mute)",fontSize:13}}>Aucune plage</div>}
        {filtered.map((b,i)=>{
          const dist=gps?hav(gps.lat,gps.lng,b.lat,b.lng):null
          return(
            <div key={b.id} onClick={()=>{onOpenBeach(b);onXP("open")}} className="row" style={{display:"flex",alignItems:"center",gap:13,padding:"12px 12px",borderRadius:14,cursor:"pointer",marginBottom:5,background:"var(--sg-card)",border:"1px solid var(--sg-border)",transition:"all .18s",animation:`up .3s ease ${i*.04}s both`,opacity:b.status==="avoid"?.72:1}}>
              <div style={{width:56,height:56,borderRadius:12,overflow:"hidden",flexShrink:0,background:"var(--sg-rowHover)"}}>
                <img referrerPolicy="no-referrer" src={(localBeachImages[b.id] ? getBaseUrl().replace(/\/$/, "") + "/beaches/" + localBeachImages[b.id] : null) || getBeachPhoto(b) || getBeachSatelliteImage(b,112)} alt={b?.name ? (lang==="en" ? `Beach ${b.name}, ${b.commune} — sargassum status` : `Plage ${b.name}, ${b.commune} — état sargasses`) : L.altPlage} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{const img=e.target;if(img.dataset.fallback) { img.src=BEACH_IMG_PLACEHOLDER; img.onerror=null; return } img.dataset.fallback="1"; img.src=getBeachSatelliteImage(b,112)||getBeachPhoto(b)||BEACH_IMG_PLACEHOLDER; img.onerror=ev=>{ev.target.onerror=null;ev.target.src=BEACH_IMG_PLACEHOLDER}}}/>
              </div>
              <SDot s={b.status} sz={11}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                <div style={{fontSize:13,color:"var(--sg-mute)",marginTop:3,display:"flex",gap:7,alignItems:"center"}}>
                  <span>{b.commune}</span>
                  {b.kids&&<span>🧒</span>}{b.snorkel&&<span>🤿</span>}{b.parking&&<span>🅿️</span>}
                  {dist&&<span style={{color:C.ocean,fontWeight:700}}>📍{dist}km</span>}
                </div>
              </div>
              <Chip status={b.status} sm/>
              <button onClick={e=>{e.stopPropagation();onFavToggle(b.id);onXP("fav")}} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,flexShrink:0,padding:"2px"}}>{favs.includes(b.id)?"❤️":"🤍"}</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ CARTE — carte satellite Leaflet (sarg_carte_satellite_app.html)
// ═══════════════════════════════════════════════════════════════════════════════
function CarteScreen({beaches,favs,onOpenBeach,gps,onGPS,onXP,island}){
  const lang=useLang()
  const L=T[lang]||T.fr
  const iframeSrc = (typeof window !== "undefined" && window.location.origin) ? `${window.location.origin}/sarg_carte_satellite_app.html?island=${island === "gp" ? "gp" : "mq"}` : `/sarg_carte_satellite_app.html?island=${island === "gp" ? "gp" : "mq"}`
  const bottomNavHeight = "calc(72px + env(safe-area-inset-bottom, 0px))"
  const islandName = island === "gp" ? "Guadeloupe" : "Martinique"
  const h1Text = (L.h1 || "Sargasses {island} en temps réel").replace("{island}", islandName)
  return(
    <div style={{position:"absolute",top:0,left:0,right:0,bottom:bottomNavHeight,width:"100%",minHeight:320,overflow:"hidden",background:"var(--sg-bg)"}}>
      <iframe
        key={island}
        title={L.carteTitle || "Carte satellite Sargasses — Martinique & Guadeloupe"}
        src={iframeSrc}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none",display:"block"}}
      />
      <h1 style={{position:"absolute",width:"1px",height:"1px",padding:0,margin:"-1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}>{h1Text}</h1>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ EVOLUTION — changements récents de statut des plages
// ═══════════════════════════════════════════════════════════════════════════════
const STATUS_LABELS={clean:"Propre",moderate:"Modéré",avoid:"À éviter"}
const STATUS_EMOJI={clean:"🟢",moderate:"🟡",avoid:"🔴"}
const BEACH_NAMES_MAP={
  'grande-anse':'Grande Anse d\'Arlet','anse-mitan':'Anse Mitan','anse-noire':'Anse Noire',
  'tartane':'Tartane','anse-madame':'Anse Madame','diamant':'Le Diamant',
  'pt-marin':'Pointe du Marin','sainte-anne':'Sainte-Anne','les-salines':'Les Salines',
  'vauclin':'Le Vauclin','gp-grande-anse':'Grande Anse','gp-malendure':'Malendure',
  'gp-sainte-anne':'Sainte-Anne','gp-pt-chateaux':'Pointe des Châteaux','gp-gosier':'Le Gosier',
  'gp-caravelle':'La Caravelle','gp-bas-du-fort':'Bas du Fort','gp-deshaies':'Deshaies',
  'gp-moule':'Le Moule','gp-vieux-fort':'Vieux-Fort',
}

function EvolutionSection({historyData,island,onOpenBeach,beaches}){
  if(!historyData) return null
  const changes=(historyData.changes||[]).filter(c=>{
    if(island==="gp") return c.beach.startsWith("gp-")
    return !c.beach.startsWith("gp-")
  }).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10)

  // Tendance : comparer les 2 derniers jours d'historique
  const hist=historyData.history||[]
  const islandHist=hist.map(h=>({...h,levels:(h.levels||[]).filter(l=>island==="gp"?l.id.startsWith("gp-"):!l.id.startsWith("gp-"))}))
  const last=islandHist[islandHist.length-1]
  const prev=islandHist.length>=2?islandHist[islandHist.length-2]:null

  let trendText=""
  if(last&&prev){
    const lastAvg=last.levels.reduce((s,l)=>s+l.afai,0)/last.levels.length
    const prevAvg=prev.levels.reduce((s,l)=>s+l.afai,0)/prev.levels.length
    const diff=lastAvg-prevAvg
    if(diff>0.05) trendText="📈 Tendance en hausse — plus de sargasses qu'hier"
    else if(diff<-0.05) trendText="📉 Tendance à la baisse — amélioration en cours"
    else trendText="➡️ Situation stable depuis hier"
  }

  return(
    <div style={{padding:"4px 16px 16px"}}>
      <div style={{fontSize:18,fontWeight:800,color:"var(--sg-ink)",marginBottom:10}}>Évolution récente</div>
      {trendText&&<div style={{fontSize:12,fontWeight:600,color:"var(--sg-mid)",marginBottom:10,padding:"8px 12px",background:"var(--sg-card)",borderRadius:10,border:"1px solid var(--sg-border)"}}>{trendText}</div>}
      {changes.length===0&&<div style={{fontSize:11,color:"var(--sg-mute)",padding:"8px 0"}}>Aucun changement de statut récent.</div>}
      {changes.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
        {changes.map((c,i)=>{
          const name=BEACH_NAMES_MAP[c.beach]||c.beach
          const beachObj=beaches.find(b=>b.id===c.beach)
          const isGood=c.to==="clean"||(c.to==="moderate"&&c.from==="avoid")
          return(
            <div key={i} onClick={()=>beachObj&&onOpenBeach(beachObj)} className="tap" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"var(--sg-card)",border:`1px solid ${isGood?"rgba(39,112,58,.2)":"rgba(176,27,27,.15)"}`,borderRadius:12,cursor:beachObj?"pointer":"default",animation:`up .3s ease ${i*.04}s both`}}>
              <div style={{fontSize:18,flexShrink:0}}>{isGood?"✅":"⚠️"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",lineHeight:1.2}}>{name}</div>
                <div style={{fontSize:10,color:"var(--sg-mid)",marginTop:2,display:"flex",alignItems:"center",gap:4}}>
                  <span>{STATUS_EMOJI[c.from]} {STATUS_LABELS[c.from]}</span>
                  <span>→</span>
                  <span style={{fontWeight:700}}>{STATUS_EMOJI[c.to]} {STATUS_LABELS[c.to]}</span>
                </div>
              </div>
              <div style={{fontSize:10,color:"var(--sg-mute)",flexShrink:0}}>{new Date(c.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>
            </div>
          )
        })}
      </div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ ACCUEIL — briefing quotidien
// ═══════════════════════════════════════════════════════════════════════════════
function AccueilScreen({beaches,favs,onFavToggle,onOpenBeach,onAskChat,gps,onGPS,premium,onGoToPremium,onXP,island,sargassumData,historyData}){
  const lang=useLang()
  const L=T[lang]||T.fr
  const clean=beaches.filter(b=>b.status==="clean")
  const avoid=beaches.filter(b=>b.status==="avoid")
  const favAlerts=beaches.filter(b=>favs.includes(b.id)&&b.status==="avoid")
  const favClean=beaches.filter(b=>favs.includes(b.id)&&b.status==="clean")
  const answer=clean.length>4?"OUI":clean.length>2?"OUI*":"NON"
  const answerColor=answer==="NON"?C.red:answer==="OUI*"?C.amber:C.green
  const best=useMemo(()=>{
    if(favClean.length>0) return favClean[0]
    if(gps) return[...clean].sort((a,b)=>hav(gps.lat,gps.lng,a.lat,a.lng)-hav(gps.lat,gps.lng,b.lat,b.lng))[0]
    return clean[0]
  },[favClean,clean,gps])
  const {w}=useWeather(best?.lat,best?.lng,best?.island==="gp"?"America/Guadeloupe":"America/Martinique")
  const h=new Date().getHours()
  const greet=h<6?"Bonne nuit 🌙":h<12?"Bon matin 🌅":h<18?"Bonne après-midi ☀️":"Bonne soirée 🌊"

  const USE_CASES=[
    {e:"🚗",t:"Je pars maintenant",    s:best?`${best.name} · ${best.drive}min`:"Aucune propre",   fn:()=>best&&onOpenBeach(best),active:!!best},
    {e:"🧒",t:"Avec des enfants",       s:`${clean.filter(b=>b.kids).length} plages adaptées`,      fn:()=>onAskChat("Quelle plage propre adaptée aux enfants ?"),active:true},
    {e:"🤿",t:"Snorkeling",             s:`${clean.filter(b=>b.snorkel).length} spots propres`,     fn:()=>onAskChat("Meilleur spot snorkeling propre maintenant ?"),active:true},
    {e:"📅",t:"Planifier le week-end",  s:"Prévisions J+1 → J+7",      fn:()=>onAskChat("Quelles plages propres ce week-end ?"),active:true},
    {e:"🗺️",t:"Road trip du jour",      s:`${clean.length} plages propres`, fn:()=>onAskChat("Donne-moi un road trip de 3 plages propres aujourd'hui"),active:true},
    {e:"🧳",t:"Je suis touriste",       s:"Meilleures recommandations", fn:()=>onAskChat("Je suis touriste pour 3 jours, quelles plages dois-je absolument voir ?"),active:true},
  ]

  return(
    <div style={{overflowY:"auto",height:"100%",WebkitOverflowScrolling:"touch"}}>
      {/* Hero */}
      <div style={{padding:"28px 22px 24px",background:"linear-gradient(168deg, var(--sg-bg) 0%, var(--sg-bgD) 100%)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-60,right:-50,width:220,height:220,borderRadius:"50%",background:`${C.tealL}0C`,animation:"driftB 15s ease-in-out infinite",pointerEvents:"none",filter:"blur(40px)"}}/>
        <div style={{position:"absolute",bottom:-40,left:-30,width:180,height:180,borderRadius:"50%",background:`${C.goldL}0A`,animation:"driftB 20s ease-in-out 4s infinite",pointerEvents:"none",filter:"blur(40px)"}}/>

        <h1 style={{position:"absolute",width:"1px",height:"1px",padding:0,margin:"-1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}>{(L.h1||"Sargasses {island} en temps réel").replace("{island}",island==="gp"?"Guadeloupe":"Martinique")}</h1>
        <div style={{fontSize:13,fontWeight:600,color:"var(--sg-mute)",marginBottom:8,animation:"up .4s ease both",position:"relative",zIndex:1}}>{greet}</div>
        <div style={{animation:"up .4s ease .04s both",position:"relative",zIndex:1}}>
          <div style={{fontSize:16,color:"var(--sg-ink)",fontWeight:600,marginBottom:6}}>La plage aujourd'hui ?</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:80,lineHeight:.88,letterSpacing:"-.02em",textTransform:"uppercase",color:answerColor,marginBottom:10,animation:"countUp .6s cubic-bezier(.16,1,.3,1) .1s both"}}>{answer}</div>
          <div style={{fontSize:16,color:"var(--sg-ink)",fontWeight:600,marginBottom:20}}>{clean.length} propre{clean.length>1?"s":""} · {avoid.length} à éviter</div>
          {sargassumData&&(
            <div style={{fontSize:13,color:"var(--sg-mute)",display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
              <span>Dernière mise à jour :</span>
              <span style={{fontWeight:700,color:sargassumData.source==="copernicus"?C.teal:"var(--sg-mid)"}}>{sargassumData.source==="copernicus"?"Copernicus Marine":"Données de référence"}</span>
              <span>— {sargassumData.updatedAt ? new Date(sargassumData.updatedAt).toLocaleDateString("fr-FR",{ day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit" }) : "—"}</span>
            </div>
          )}
        </div>

        {best&&(
          <div onClick={()=>{onOpenBeach(best);onXP("open")}} className="tap hover" style={{background:"var(--sg-card)",border:"1px solid var(--sg-border)",borderRadius:20,padding:"18px 20px",cursor:"pointer",boxShadow:"var(--sg-card-shadow-lg, var(--sg-card-shadow))",animation:"up .4s ease .08s both",position:"relative",zIndex:1}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"var(--sg-mute)",marginBottom:6}}>{gps?"Meilleure plage près de toi":favClean.length>0?"Ta plage favorite":"Meilleure plage du jour"}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,textTransform:"uppercase",color:"var(--sg-ink)",lineHeight:1}}>{best.name}</div>
                <div style={{fontSize:13,color:"var(--sg-mute)",marginTop:4}}>{best.commune}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <Chip status={best.status}/>
                <button onClick={e=>{e.stopPropagation();onFavToggle(best.id);onXP("fav")}} style={{background:"none",border:"none",cursor:"pointer",fontSize:20}}>{favs.includes(best.id)?"❤️":"🤍"}</button>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {w&&<><div style={{background:"var(--sg-bgD)",borderRadius:10,padding:"6px 12px",fontSize:13,fontWeight:600,color:"var(--sg-ink)",display:"flex",alignItems:"center",gap:5}}><span>💨</span>{w.wind}km/h</div><div style={{background:"var(--sg-bgD)",borderRadius:10,padding:"6px 12px",fontSize:13,fontWeight:600,color:"var(--sg-ink)",display:"flex",alignItems:"center",gap:5}}><span>☀️</span>UV {w.uv}</div><div style={{background:"var(--sg-bgD)",borderRadius:10,padding:"6px 12px",fontSize:13,fontWeight:600,color:"var(--sg-ink)",display:"flex",alignItems:"center",gap:5}}><span>🌡️</span>{w.temp}°C</div></>}
              {gps&&<div style={{marginLeft:"auto",fontSize:11,color:C.ocean,fontWeight:700}}>📍 {hav(gps.lat,gps.lng,best.lat,best.lng)} km</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <GBtn sm style={{flex:1}}>Y aller →</GBtn>
              {gps&&<a href={`https://maps.google.com/?q=${best.lat},${best.lng}&travelmode=driving`} target="_blank" rel="noreferrer" style={{flex:1,padding:"10px",background:"var(--sg-rowHover)",borderRadius:14,fontSize:12,fontWeight:700,color:"var(--sg-mid)",textDecoration:"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>🗺️ Maps</a>}
            </div>
          </div>
        )}

        {favAlerts.length>0&&(
          <div style={{marginTop:12,padding:"12px 14px",background:"rgba(176,27,27,.07)",border:"1.5px solid rgba(176,27,27,.2)",borderRadius:14,animation:"up .4s ease .12s both",position:"relative",zIndex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:16}}>☣️</span><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.red,letterSpacing:".04em",textTransform:"uppercase"}}>Alerte H2S — {favAlerts.length} favori{favAlerts.length>1?"s":""}</div></div>
            <div style={{fontSize:11,color:C.red,lineHeight:1.6,opacity:.8,marginBottom:8}}>{favAlerts.map(b=>b.name).join(", ")} — évitez si asthmatique, enfant ou femme enceinte.</div>
            {favAlerts.map(b=><div key={b.id} onClick={()=>onOpenBeach(b)} className="tap" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(176,27,27,.06)",borderRadius:9,cursor:"pointer",marginBottom:3}}><SDot s="avoid" sz={7}/><span style={{fontSize:11,fontWeight:700,color:"var(--sg-ink)",flex:1}}>{b.name}</span><span style={{fontSize:10,color:"var(--sg-mute)"}}>Voir →</span></div>)}
          </div>
        )}
      </div>

      {/* Use cases */}
      <div style={{padding:"22px 18px 10px"}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--sg-ink)",marginBottom:14}}>Qu'est-ce que tu veux faire ?</div>
        <div className="uc-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {USE_CASES.map((uc,i)=>(
            <div key={uc.e} onClick={uc.fn} className="tap hover" style={{background:"var(--sg-card)",border:"1px solid var(--sg-border)",borderRadius:18,padding:"16px 16px 14px",cursor:"pointer",boxShadow:"var(--sg-card-shadow)",transition:"all .2s",animation:`up .4s ease ${.14+i*.04}s both`,opacity:uc.active?1:.5}}>
              <div style={{fontSize:30,marginBottom:10,lineHeight:1}}>{uc.e}</div>
              <div style={{fontSize:15,fontWeight:700,color:"var(--sg-ink)",marginBottom:4,lineHeight:1.3}}>{uc.t}</div>
              <div style={{fontSize:13,color:"var(--sg-mute)",lineHeight:1.4}}>{uc.s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll propres */}
      <div style={{padding:"8px 0 8px"}}>
        <div style={{padding:"0 18px",fontSize:18,fontWeight:800,color:"var(--sg-ink)",marginBottom:12}}>Propres aujourd'hui</div>
        <div className="clean-scroll" style={{display:"flex",gap:10,overflowX:"auto",paddingLeft:16,paddingRight:16,paddingBottom:4}}>
          {clean.map((b,i)=>(
            <div key={b.id} onClick={()=>{onOpenBeach(b);onXP("open")}} className="tap" style={{flexShrink:0,width:148,background:"var(--sg-card)",border:"1px solid var(--sg-status-clean-border, rgba(39,112,58,.25))",borderRadius:16,padding:"12px 13px",cursor:"pointer",animation:`up .3s ease ${i*.06}s both`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}><SDot s="clean" sz={8} pulse={false}/><button onClick={e=>{e.stopPropagation();onFavToggle(b.id);onXP("fav")}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,padding:0}}>{favs.includes(b.id)?"❤️":"🤍"}</button></div>
              <div style={{fontWeight:700,fontSize:14,color:"var(--sg-ink)",lineHeight:1.2,marginBottom:4}}>{b.name}</div>
              <div style={{fontSize:12,color:"var(--sg-mute)",marginBottom:8}}>{b.commune}</div>
              <div style={{display:"flex",gap:6}}><span style={{fontSize:11,fontWeight:600,color:C.ocean}}>🚗 {b.drive}min</span>{b.island==="gp"&&<span style={{fontSize:11,color:"var(--sg-mute)"}}>PaP</span>}{b.snorkel&&<span style={{fontSize:11,color:C.teal}}>🤿</span>}{b.kids&&<span style={{fontSize:11}}>🧒</span>}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Prévisions rapides */}
      {best&&<div style={{padding:"4px 16px 16px"}}>
        <div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",marginBottom:12}}>Prochains jours — {best.name}</div>
        <div style={{display:"flex",gap:6}}>
          {getForecast(best,sargassumData,lang).slice(0,premium?7:3).map((d,i)=>{const st=ST[d.status];return(
            <div key={i} style={{flex:1,background:"var(--sg-card)",borderRadius:14,padding:"12px 6px",textAlign:"center",border:"1px solid var(--sg-border)",boxShadow:"var(--sg-card-shadow)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--sg-mute)",marginBottom:6}}>{d.day}</div>
              <div style={{fontSize:18,marginBottom:4}}>{st.e}</div>
              <div style={{width:"60%",height:3,borderRadius:3,background:st.c,margin:"0 auto"}}/>
              <div style={{fontSize:12,color:"var(--sg-mute)",marginTop:4,fontWeight:600}}>{Math.round(d.afai*100)}%</div>
            </div>
          )})}
          {!premium&&<div onClick={onGoToPremium} className="tap" style={{flex:1,background:"var(--sg-rowHover)",borderRadius:12,padding:"10px 4px",textAlign:"center",border:"1.5px dashed var(--sg-border)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3}}>
            <div style={{fontSize:15}}>🔒</div>
            <div style={{fontSize:10,fontWeight:700,color:"var(--sg-mute)"}}>+4j</div>
            <div style={{fontSize:9,fontWeight:700,color:C.gold}}>PREMIUM</div>
          </div>}
        </div>
      </div>}

      {!gps&&<div style={{padding:"0 16px 20px"}}>
        <button onClick={onGPS} className="tap" style={{width:"100%",padding:"12px",background:C.tealBg,border:`1.5px dashed rgba(0,150,136,.3)`,borderRadius:13,fontSize:12,fontWeight:700,color:C.teal,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"'Syne',sans-serif"}}>
          📍 Activer ma position pour les plages proches
        </button>
      </div>}

      {/* Évolution des plages */}
      <EvolutionSection historyData={historyData} island={island} onOpenBeach={onOpenBeach} beaches={beaches}/>

      {/* Social proof + CTA conversion */}
      {!premium&&<div style={{padding:"0 16px 20px"}}>
        <div onClick={onGoToPremium} className="tap" style={{background:`linear-gradient(145deg,${C.night},${C.night2})`,borderRadius:18,padding:"18px 18px 16px",cursor:"pointer",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-20,right:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,208,96,.06)",pointerEvents:"none"}}/>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,position:"relative",zIndex:1}}>
            <div style={{fontSize:28}}>🛰️</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"white",textTransform:"uppercase",letterSpacing:".04em",lineHeight:1.1}}>Prévisions 7 jours</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.55)",marginTop:2}}>Prévisions 30 jours · Alertes push</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:C.goldL,lineHeight:1}}>4,99€</span>
              <span style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>30 jours</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,position:"relative",zIndex:1}}>
            <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
            <span style={{fontSize:9,color:"rgba(255,255,255,.3)",fontWeight:700}}>= 1 aller-retour évité</span>
            <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
          </div>
        </div>
      </div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ PREMIUM — page ultra-convaincante
// ═══════════════════════════════════════════════════════════════════════════════
const PREMIUM_PROMO_CODES = ["nouv30", "etplwz"]

function CodePromoBlock({ onActivate }) {
  const [code, setCode] = useState("")
  const [status, setStatus] = useState(null)
  const submit = () => {
    const v = (code || "").trim().toLowerCase()
    if (!v) return
    if (PREMIUM_PROMO_CODES.includes(v)) {
      onActivate()
      setStatus("ok")
      setCode("")
    } else setStatus("err")
  }
  return (
    <div style={{marginTop:20,padding:"14px 16px",background:"rgba(0,0,0,.2)",borderRadius:14,border:"1px solid rgba(255,255,255,.08)"}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:".08em",color:"rgba(255,255,255,.6)",marginBottom:8}}>Tu as un code promo ?</div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <input value={code} onChange={e=>{setCode(e.target.value);setStatus(null)}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Code promo" style={{flex:1,padding:"10px 12px",fontSize:13,borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(0,0,0,.2)",color:"white",outline:"none"}}/>
        <button onClick={submit} style={{padding:"10px 16px",borderRadius:10,border:"none",background:C.goldL,color:C.night,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Valider</button>
      </div>
      {status==="ok"&&<div style={{fontSize:11,color:C.green,marginTop:8,display:"flex",alignItems:"center",gap:6}}>✅ Prévisions 7 jours activées !</div>}
      {status==="err"&&<div style={{fontSize:11,color:C.amber,marginTop:8}}>Code invalide. Réessaie ou paie avec Stripe.</div>}
    </div>
  )
}

function PremiumScreen({premium,onActivate}){
  const TESTIMONIALS=[
    {name:"Marie-Claire T.",role:"Mère de 3 enfants · Fort-de-France",text:"Mon mari était parti faire 40km avec les enfants. Sargasses partout. Depuis j'ouvre l'app avant de partir.",avatar:"👩‍👧‍👦"},
    {name:"Julien M.",role:"Kitesurf · Sainte-Anne",text:"Je reçois l'alerte le matin si les conditions changent. J'ai annulé 2 sessions inutiles ce mois-ci.",avatar:"🏄"},
    {name:"Hôtel Cap Sud",role:"Résidence touristique · Le Diamant",text:"On affiche le statut des plages à la réception. Nos clients adorent. On recommande l'app à chaque arrivée.",avatar:"🏨"},
  ]

  const COMPARE=[
    {f:"Statut des plages",free:true,premium:true},
    {f:"Carte interactive",free:true,premium:true},
    {f:"Assistant IA",free:true,premium:true},
    {f:"Prévisions J+1 → J+2",free:true,premium:true},
    {f:"Prévisions J+3 → J+7",free:false,premium:true},
    {f:"Alertes push automatiques",free:false,premium:true},
    {f:"Alerte H2S par plage",free:false,premium:true},
    {f:"2 îles (MQ + GP)",free:false,premium:true},
    {f:"Données satellite 6h",free:false,premium:true},
    {f:"Historique 30 jours",free:false,premium:true},
  ]

  if(premium) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",padding:"30px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16,animation:"levelUp .6s cubic-bezier(.16,1,.3,1) both"}}>⭐</div>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,textTransform:"uppercase",color:"var(--sg-ink)",marginBottom:8}}>Premium Actif</div>
      <div style={{fontSize:13,color:"var(--sg-mid)",lineHeight:1.7,marginBottom:20}}>30 jours de prévisions · Alertes push<br/>MQ + GP · Données satellite toutes les 6h</div>
      <div style={{background:C.greenBg,borderRadius:13,padding:"12px 20px",fontSize:12,fontWeight:700,color:C.green}}>✅ Tous les accès débloqués</div>
    </div>
  )

  return(
    <div style={{overflowY:"auto",height:"100%",WebkitOverflowScrolling:"touch"}}>
      {/* Hero — fond clair lisible */}
      <div className="grain" style={{background:"var(--sg-bg)",padding:"32px 22px 28px",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-40,left:-40,width:200,height:200,borderRadius:"50%",background:`${C.goldL}08`,animation:"driftB 12s ease-in-out infinite",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-60,right:-30,width:240,height:240,borderRadius:"50%",background:`${C.tealL}06`,animation:"driftB 18s ease-in-out 3s infinite",pointerEvents:"none"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"inline-block",padding:"4px 14px",borderRadius:100,background:C.goldBg,border:`1px solid ${C.goldL}30`,marginBottom:14}}>
            <span style={{fontSize:10,fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:C.gold}}>⭐ PREMIUM</span>
          </div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:36,textTransform:"uppercase",color:"var(--sg-ink)",lineHeight:1.05,marginBottom:16,animation:"up .5s ease both"}}>
            Cette fois,<br/>tu seras prévenu.
          </div>
          <div style={{fontSize:16,color:"var(--sg-ink)",marginBottom:14,lineHeight:1.7,fontWeight:500,animation:"up .5s ease .08s both"}}>
            Accès 30 jours à toutes les prévisions,<br/>alertes push et données satellite.
          </div>
          <div style={{display:"inline-block",padding:"6px 16px",borderRadius:10,background:C.tealBg,border:`1px solid ${C.tealL}25`,marginBottom:18,animation:"up .5s ease .1s both"}}>
            <span style={{fontSize:12,fontWeight:700,color:C.teal}}>📅 30 jours de prévisions complètes</span>
          </div>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:6,marginBottom:6,animation:"up .5s ease .12s both"}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:56,color:C.gold,lineHeight:1}}>4,99€</span>
            <span style={{fontSize:16,color:"var(--sg-mute)",fontWeight:600}}> / 30 jours</span>
          </div>
          <div style={{fontSize:14,color:"var(--sg-mute)",marginBottom:24}}>Soit 0,17€/jour · = 1 aller-retour évité</div>
          <div style={{animation:"up .5s ease .16s both"}}>
            <GBtn full onClick={()=>window.open(STRIPE_PAYMENT_URL,"_blank", "noopener,noreferrer")} style={{maxWidth:320,margin:"0 auto",animation:"glow 3s ease-in-out infinite"}}>Payer avec Stripe →</GBtn>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:14,marginTop:16,fontSize:13,color:"var(--sg-mute)",fontWeight:500}}>
            <span>📅 30 jours</span><span>🔒 Stripe sécurisé</span><span>🛡️ Remboursé 7j</span>
          </div>
          <CodePromoBlock onActivate={onActivate} />
        </div>
      </div>

      {/* Avantages Premium — cartes visuelles */}
      <div style={{padding:"20px 16px 8px"}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--sg-ink)",marginBottom:12}}>Ce que tu débloques</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {e:"📅",t:"Prévisions 7j",s:"Prévisions complètes pendant 30 jours"},
            {e:"📡",t:"Satellite 6h",s:"Données fraîches toutes les 6 heures"},
            {e:"🔔",t:"Alertes push",s:"Notifié dès qu'une plage change"},
            {e:"🗺️",t:"MQ + GP",s:"Martinique et Guadeloupe couvertes"},
            {e:"📊",t:"Historique 30j",s:"Évolution complète de chaque plage"},
            {e:"☣️",t:"Alerte H2S",s:"Risque santé par plage en temps réel"},
          ].map((item,i)=>(
            <Card key={i} style={{padding:"16px",animation:`up .4s ease ${i*.05}s both`}}>
              <div style={{fontSize:28,marginBottom:10}}>{item.e}</div>
              <div style={{fontSize:15,fontWeight:700,color:"var(--sg-ink)",marginBottom:4,lineHeight:1.2}}>{item.t}</div>
              <div style={{fontSize:13,color:"var(--sg-mute)",lineHeight:1.6}}>{item.s}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div style={{padding:"12px 16px 4px"}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--sg-ink)",marginBottom:12}}>Ce que disent les utilisateurs</div>
        {TESTIMONIALS.map((t,i)=>(
          <Card key={i} style={{padding:"18px 18px",marginBottom:12,animation:`up .4s ease ${.3+i*.08}s both`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{fontSize:32,flexShrink:0}}>{t.avatar}</div>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:"var(--sg-ink)"}}>{t.name}</div>
                <div style={{fontSize:13,color:"var(--sg-mute)"}}>{ t.role}</div>
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><span key={s} style={{fontSize:14,color:C.goldL}}>★</span>)}</div>
            </div>
            <div style={{fontSize:15,color:"var(--sg-ink)",lineHeight:1.7,fontStyle:"italic",opacity:.8}}>"{t.text}"</div>
          </Card>
        ))}
      </div>

      {/* Comparison table */}
      <div style={{padding:"4px 16px 16px"}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--sg-ink)",marginBottom:12}}>Gratuit vs Premium</div>
        <Card style={{overflow:"hidden",padding:0}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",borderBottom:"1px solid var(--sg-border)"}}>
            <div style={{padding:"12px 16px",fontSize:13,fontWeight:700,color:"var(--sg-ink)"}}>Fonctionnalité</div>
            <div style={{padding:"12px 18px",fontSize:13,fontWeight:700,color:"var(--sg-mute)",textAlign:"center"}}>Gratuit</div>
            <div style={{padding:"12px 18px",fontSize:13,fontWeight:700,color:C.gold,textAlign:"center",background:C.goldBg}}>Premium</div>
          </div>
          {COMPARE.map((row,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto",borderBottom:i<COMPARE.length-1?"1px solid var(--sg-border)":"none"}}>
              <div style={{padding:"11px 16px",fontSize:14,fontWeight:row.premium&&!row.free?600:400,color:row.premium&&!row.free?"var(--sg-ink)":"var(--sg-mute)"}}>{row.f}</div>
              <div style={{padding:"11px 18px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{row.free?"✅":"—"}</div>
              <div style={{padding:"11px 18px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,background:C.goldBg}}>{row.premium?"✅":"—"}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Guarantee */}
      <div style={{padding:"0 16px 20px"}}>
        <div style={{background:`linear-gradient(135deg,${C.greenBg},rgba(56,146,78,.05))`,border:"1.5px solid rgba(39,112,58,.2)",borderRadius:16,padding:"16px",display:"flex",gap:14,alignItems:"center"}}>
          <div style={{fontSize:34,flexShrink:0}}>🛡️</div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.green,marginBottom:4}}>Garanti 7 jours</div>
            <div style={{fontSize:14,color:"var(--sg-ink)",lineHeight:1.7}}>Pas satisfait dans les 7 jours ? On te rembourse, sans question. Aucun risque.</div>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div style={{padding:"0 16px 28px"}}>
        <CodePromoBlock onActivate={onActivate} />
        <div style={{marginTop:14}}>
          <GBtn full onClick={()=>window.open(STRIPE_PAYMENT_URL,"_blank","noopener,noreferrer")} style={{animation:"glow 3s ease-in-out infinite"}}>4,99€ pour 30 jours — Payer avec Stripe →</GBtn>
        </div>
        <div style={{fontSize:13,color:"var(--sg-mute)",textAlign:"center",marginTop:10}}>Accès 30 jours · Pas de renouvellement automatique</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ PROFIL — streak · badges · gamification · partage
// ═══════════════════════════════════════════════════════════════════════════════
function ProfilScreen({beaches,favs,onFavToggle,onOpenBeach,premium,onActivatePremium,xp,onXP}){
  const streak=g("sg_streak",1)
  const views=g("sg_views",{})
  const totalViews=Object.values(views).reduce((a,b)=>a+b,0)
  const reports=g("sg_stats",{reports:0}).reports||0
  const topId=Object.entries(views).sort((a,b)=>b[1]-a[1])[0]?.[0]
  const topBeach=topId&&beaches.find(b=>b.id===topId)
  const favBs=beaches.filter(b=>favs.includes(b.id))
  const canvasRef=useRef()
  const [cardDone,setCardDone]=useState(false)
  const level=getLevel(xp)
  const nextLevel=LEVELS[LEVELS.indexOf(level)+1]
  const xpInLevel=xp-level.min
  const xpNeeded=nextLevel?(nextLevel.min-level.min):1
  const xpPct=Math.min(100,Math.round((xpInLevel/xpNeeded)*100))

  const BADGES=[
    {e:"🌅",l:"Matin de plage",  desc:"Ouvrir avant 9h",          done:new Date().getHours()<9||streak>1},
    {e:"🔥",l:`${streak}j streak`,desc:"Consulter chaque jour",   done:streak>0},
    {e:"❤️",l:"Vigile",          desc:"3 plages favorites",        done:favBs.length>=3},
    {e:"🤖",l:"IA addict",       desc:"10 questions à l'IA",       done:(g("sg_stats",{}).chats||0)>=10},
    {e:"📍",l:"Signaleur",       desc:"Premier signalement",       done:reports>0},
    {e:"🏆",l:"Expert",          desc:"Streak 7 jours",            done:streak>=7},
    {e:"🛰️",l:"Satellite",       desc:"50 plages consultées",      done:totalViews>=50},
    {e:"⭐",l:"Premium",         desc:"Abonnement actif",          done:premium},
  ]

  function genCard(){
    const c=canvasRef.current;if(!c) return
    const ctx=c.getContext("2d");c.width=800;c.height=420
    const g2=ctx.createLinearGradient(0,0,800,420);g2.addColorStop(0,C.bg);g2.addColorStop(1,"#EEF7F4");ctx.fillStyle=g2;ctx.fillRect(0,0,800,420)
    const gb=ctx.createLinearGradient(0,0,800,0);gb.addColorStop(0,C.goldLL);gb.addColorStop(.5,C.goldL);gb.addColorStop(1,"#AF7200");ctx.fillStyle=gb;ctx.fillRect(0,0,800,5)
    ctx.fillStyle=C.mute;ctx.font="bold 13px sans-serif";ctx.fillText("SARGASSES · MARTINIQUE",40,55)
    const cn=beaches.filter(b=>b.status==="clean").length,an=beaches.filter(b=>b.status==="avoid").length
    ctx.fillStyle=C.ink;ctx.font="bold 52px sans-serif";ctx.fillText(`${cn} plages propres`,40,130)
    ctx.fillStyle=C.green+"cc";ctx.font="bold 26px sans-serif";ctx.fillText(`✅  ${cn} propres aujourd'hui`,40,195)
    ctx.fillStyle=C.red+"cc";ctx.font="bold 26px sans-serif";ctx.fillText(`🚫  ${an} à éviter`,40,240)
    ctx.fillStyle=C.mid;ctx.font="14px sans-serif";ctx.fillText(`Mis à jour le ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}`,40,315)
    ctx.fillStyle=C.gold;ctx.font="bold 14px sans-serif";ctx.fillText("sargasses-martinique.com",40,390)
    const a=document.createElement("a");a.download="sargasses-statut.png";a.href=c.toDataURL();a.click()
    setCardDone(true);onXP("open")
  }

  return(
    <div style={{overflowY:"auto",height:"100%",padding:"14px 14px 80px"}}>
      <canvas ref={canvasRef} style={{display:"none"}}/>

      {/* Level + XP bar */}
      <Card style={{padding:"18px 20px",marginBottom:12,background:`linear-gradient(145deg,${C.night},${C.night2})`,border:"none",animation:"up .4s ease both"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:50,color:C.goldL,lineHeight:1}}>{streak}</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:"white",textTransform:"uppercase",marginBottom:2}}>Jours de streak 🔥</div>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:20}}>{level.e}</span>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:level.color,textTransform:"uppercase"}}>{level.label}</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:C.goldL,lineHeight:1}}>{xp}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:700}}>XP TOTAL</div>
          </div>
        </div>
        {/* XP progress bar */}
        <div style={{marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:700}}>{level.label}</span>
            {nextLevel&&<span style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:700}}>{nextLevel.label} ({nextLevel.min-xp} XP)</span>}
          </div>
          <div style={{height:5,background:"rgba(255,255,255,.1)",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${xpPct}%`,background:`linear-gradient(90deg,${C.goldLL},${C.goldL})`,borderRadius:3,transition:"width 1s cubic-bezier(.16,1,.3,1)",boxShadow:`0 0 10px ${C.goldL}60`}}/>
          </div>
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.4)",lineHeight:1.7}}>
          {streak>=7?"Tu es un expert sargasses 🏆":streak>=3?"Belle habitude, continue !":"Reviens chaque matin pour ton briefing"}
        </div>
      </Card>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8,marginBottom:12,animation:"up .4s ease .06s both"}}>
        {[{v:totalViews,l:"Vues",i:"👁️"},{v:favBs.length,l:"Favoris",i:"❤️"},{v:reports,l:"Signalements",i:"📍"}].map(st=>(
          <Card key={st.l} style={{padding:"12px 8px",textAlign:"center"}}>
            <div style={{fontSize:22,marginBottom:4}}>{st.i}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:"var(--sg-ink)",lineHeight:1}}>{st.v}</div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--sg-mute)",marginTop:4}}>{st.l}</div>
          </Card>
        ))}
      </div>

      {/* Badges */}
      <div style={{marginBottom:14,animation:"up .4s ease .1s both"}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--sg-ink)",marginBottom:10}}>Badges — {BADGES.filter(b=>b.done).length}/{BADGES.length}</div>
        <div style={{display:"flex",gap:9,overflowX:"auto",paddingBottom:4}}>
          {BADGES.map(b=>(
            <div key={b.l} style={{flexShrink:0,minWidth:88,textAlign:"center",padding:"12px 10px",background:b.done?"var(--sg-cardS)":"var(--sg-rowHover)",border:`1px solid ${b.done?C.gold+"44":"var(--sg-border)"}`,borderRadius:14,opacity:b.done?1:.4,animation:b.done?"badgeIn .5s cubic-bezier(.34,1.56,.64,1) both":"none"}}>
              <div style={{fontSize:24,marginBottom:4}}>{b.e}</div>
              <div style={{fontSize:12,fontWeight:700,color:b.done?"var(--sg-ink)":"var(--sg-mute)",lineHeight:1.3}}>{b.l}</div>
              <div style={{fontSize:11,color:"var(--sg-mute)",marginTop:3}}>{b.desc}</div>
              {b.done&&<div style={{marginTop:5,fontSize:11,fontWeight:700,color:C.gold,background:C.goldBg,borderRadius:100,padding:"2px 8px"}}>✅ Obtenu</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Top plage */}
      {topBeach&&<div style={{marginBottom:12,animation:"up .4s ease .14s both"}}>
        <div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",marginBottom:8}}>Ta plage la plus consultée</div>
        <Card onClick={()=>onOpenBeach(topBeach)} hover style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
          <SDot s={topBeach.status} sz={10}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)"}}>{topBeach.name}</div><div style={{fontSize:10,color:"var(--sg-mid)"}}>{views[topId]} consultations</div></div><Chip status={topBeach.status} sm/>
        </Card>
      </div>}

      {/* Favoris */}
      {favBs.length>0&&<div style={{marginBottom:12,animation:"up .4s ease .18s both"}}>
        <div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",marginBottom:8}}>Mes favoris ({favBs.length})</div>
        {favBs.map(b=><div key={b.id} onClick={()=>onOpenBeach(b)} className="row" style={{display:"flex",alignItems:"center",gap:11,padding:"11px 12px",borderRadius:13,cursor:"pointer",background:"var(--sg-card)",marginBottom:5,border:"1px solid var(--sg-border)",transition:"background .15s"}}>
          <SDot s={b.status} sz={9}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)"}}>{b.name}</div><div style={{fontSize:10,color:"var(--sg-mid)"}}>{b.commune}</div></div><Chip status={b.status} sm/>
        </div>)}
      </div>}

      {/* Partager */}
      <div style={{marginBottom:12,animation:"up .4s ease .22s both"}}>
        <Card style={{padding:"14px"}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",marginBottom:8}}>Partager le statut</div>
          <div style={{fontSize:13,color:"var(--sg-ink)",lineHeight:1.6,marginBottom:10,opacity:.75}}>Génère une carte à envoyer sur WhatsApp, Instagram ou Facebook. Fais connaître l'app 🌊</div>
          <GBtn full sm onClick={genCard}>{cardDone?"✅ Téléchargée !":"📲 Générer la carte"}</GBtn>
        </Card>
      </div>

      {/* Premium CTA si pas abonné */}
      {!premium&&<Card style={{padding:"18px",background:`linear-gradient(145deg,${C.night},${C.night2})`,border:"none",animation:"up .4s ease .26s both"}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.goldL,marginBottom:6}}>PREMIUM</div>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,textTransform:"uppercase",color:"white",marginBottom:4,lineHeight:1.1}}>Prévisions 7 jours<br/>+ Alertes push</div>
        <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:10}}><span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:32,color:C.goldL}}>4,99€</span><span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}> 30 jours</span></div>
        <CodePromoBlock onActivate={onActivatePremium} />
        <div style={{marginTop:12}}><GBtn full sm onClick={()=>window.open(STRIPE_PAYMENT_URL,"_blank","noopener,noreferrer")}>Payer avec Stripe →</GBtn></div>
      </Card>}
      {premium&&<Card style={{padding:"16px",textAlign:"center"}}><div style={{fontSize:28,marginBottom:8}}>⭐</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,textTransform:"uppercase",color:"var(--sg-ink)"}}>Premium Actif</div><div style={{fontSize:11,color:"var(--sg-mid)",marginTop:3}}>30 jours · 2 îles · Alertes push</div></Card>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ BEACH DETAIL SHEET
// ═══════════════════════════════════════════════════════════════════════════════
function BeachDetail({beach,isFav,onFavToggle,premium,onXP,sargassumData,localBeachImages={}}){
  const lang=useLang()
  const L=T[lang]||T.fr
  const [tab,setTab]=useState("prev")
  const [choice,setChoice]=useState(null)
  const [comment,setComment]=useState("")
  const [genning,setGenning]=useState(false)
  const [reported,setReported]=useState(false)
  const {w,loading:wLoad,error:wErr}=useWeather(beach.lat,beach.lng,beach.island==="gp"?"America/Guadeloupe":"America/Martinique")
  const sc=scoreB(beach.afai,w)
  const st=ST[beach.status]
  const forecast=useMemo(()=>getForecast(beach,sargassumData,lang),[beach?.id, beach?.afai, sargassumData?.weekly, lang])
  const drift=sargassumData?.weekly?.[beach.id]

  const CHOICES=[{k:"none",e:"✅",l:"Rien",xp:15},{k:"few",e:"⚠️",l:"Quelques",xp:10},{k:"heavy",e:"🚫",l:"Beaucoup",xp:10},{k:"alert",e:"🆘",l:"Massif",xp:50}]
  const FALLBACK_MSGS={none:"RAS ce matin, eau cristalline 🌊",few:"Quelques sargasses côté gauche ⚠️",heavy:"Beaucoup aujourd'hui, je déconseille 🚫",alert:"Banc massif en approche, évitez absolument 🆘"}

  async function pick(k){
    setChoice(k);setGenning(true);setComment("")
    await new Promise(r=>setTimeout(r,300))
    setComment(FALLBACK_MSGS[k])
    setGenning(false)
  }
  function doReport(){
    if(!choice) return
    setReported(true)
    const xpGain=CHOICES.find(c=>c.k===choice)?.xp||10
    onXP("report")
    const st2=g("sg_stats",{reports:0,chats:0,views:0})
    s("sg_stats",{...st2,reports:st2.reports+1})
  }

  return(
    <div style={{fontFamily:"'Syne',sans-serif"}}>
      {/* Hero image — photo prioritaire, puis satellite, placeholder si échec */}
      <div style={{width:"100%",height:160,background:"var(--sg-card)",overflow:"hidden",flexShrink:0}}>
        <img referrerPolicy="no-referrer" src={(localBeachImages[beach?.id] ? getBaseUrl().replace(/\/$/, "") + "/beaches/" + localBeachImages[beach.id] : null) || getBeachPhoto(beach) || getBeachSatelliteImage(beach,{width:640,height:160})} alt={beach?.name ? `Plage ${beach.name}, ${beach.commune} — sargasses` : "Plage — état sargasses"} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{const img=e.target;if(img.dataset.fallback) { img.src=BEACH_IMG_PLACEHOLDER; img.onerror=null; return } img.dataset.fallback="1"; img.src=getBeachSatelliteImage(beach,{width:640,height:160})||getBeachPhoto(beach)||BEACH_IMG_PLACEHOLDER; img.onerror=ev=>{ev.target.onerror=null;ev.target.src=BEACH_IMG_PLACEHOLDER}}}/>
      </div>
      {/* Hero */}
      <div style={{padding:"15px 16px 12px",background:`linear-gradient(135deg,${st.bg},transparent)`,borderBottom:`1px solid var(--sg-border)`}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:23,textTransform:"uppercase",color:"var(--sg-ink)",lineHeight:1}}>{beach.name}</div>
            <div style={{fontSize:12,color:"var(--sg-mid)",marginTop:3,fontWeight:500}}>{beach.commune}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Chip status={beach.status}/>
            <button onClick={()=>{onFavToggle();onXP("fav")}} style={{width:34,height:34,borderRadius:"50%",border:"none",background:isFav?"rgba(176,27,27,.1)":"rgba(0,0,0,.05)",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .18s cubic-bezier(.34,1.56,.64,1)"}}>{isFav?"❤️":"🤍"}</button>
          </div>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(0,0,0,.05)",borderRadius:9,padding:"4px 11px"}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:sc>=7?C.green:sc>=5?C.amber:C.red}}>{sc}</span>
            <span style={{fontSize:11,color:"var(--sg-mid)",fontWeight:700}}>/10</span>
          </div>
          {w&&<><div style={{background:"rgba(0,0,0,.05)",borderRadius:8,padding:"4px 9px",fontSize:11,fontWeight:700,color:"var(--sg-ink)",display:"flex",alignItems:"center",gap:4}}><span>💨</span>{w.wind}km/h</div><div style={{background:"rgba(0,0,0,.05)",borderRadius:8,padding:"4px 9px",fontSize:11,fontWeight:700,color:"var(--sg-ink)",display:"flex",alignItems:"center",gap:4}}><span>☀️</span>UV {w.uv}</div></>}
          {beach.status==="avoid"&&<div style={{display:"flex",alignItems:"center",gap:5,background:C.redBg,borderRadius:10,padding:"6px 12px",fontSize:13,fontWeight:700,color:C.red,border:`1px solid ${C.red}22`}}><span>☣️</span>Risque H2S</div>}
          {beach.kids&&<div style={{background:C.tealBg,borderRadius:10,padding:"6px 12px",fontSize:13,fontWeight:700,color:C.teal}}>🧒 Enfants</div>}
          {beach.snorkel&&<div style={{background:C.tealBg,borderRadius:10,padding:"6px 12px",fontSize:13,fontWeight:700,color:C.teal}}>🤿 Snorkeling</div>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid var(--sg-border)`}}>
        {[{id:"prev",l:"Prévisions"},{id:"meteo",l:"Météo"},{id:"signal",l:"Signaler"},{id:"aller",l:"Y aller"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"11px 4px",border:"none",background:"none",fontSize:11,fontWeight:tab===t.id?700:500,cursor:"pointer",color:tab===t.id?C.gold:C.mid,borderBottom:`2px solid ${tab===t.id?C.gold:"transparent"}`,transition:"all .2s",fontFamily:"'Syne',sans-serif"}}>{t.l}</button>
        ))}
      </div>

      <div style={{padding:"16px 15px 70px",overflowY:"auto",maxHeight:"52vh"}}>
        {/* Prévisions */}
        {tab==="prev"&&<div style={{animation:"up .3s ease both"}}>
          <div style={{background:`linear-gradient(145deg,${C.night},${C.night2})`,borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"12px 15px 8px",borderBottom:"1px solid rgba(255,255,255,.05)"}}><div style={{fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"rgba(255,255,255,.3)",marginBottom:2}}>7 prochains jours</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"white",textTransform:"uppercase"}}>{beach.name}</div></div>
            <div style={{display:"flex",padding:"8px 4px"}}>
              {forecast.map((d,i)=>{const locked=!premium&&i>=2;const ds=ST[d.status];return(
                <div key={i} style={{flex:1,padding:"7px 2px",textAlign:"center",filter:locked?"blur(2.5px)":"none",opacity:locked?.18:1}}>
                  <div style={{fontSize:"7.5px",fontWeight:700,color:"rgba(255,255,255,.3)",marginBottom:3}}>{d.day}</div>
                  <div style={{fontSize:15,marginBottom:2}}>{ds.e}</div>
                  <div style={{width:"60%",height:2,borderRadius:2,background:ds.c,margin:"0 auto"}}/>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginTop:2}}>{Math.round(d.afai*100)}%</div>
                </div>
              )})}
            </div>
            {!premium&&<div style={{padding:"6px 14px 11px",fontSize:10,color:"rgba(255,255,255,.3)",textAlign:"center"}}>🔒 J+3 → J+7 avec Premium · 4,99€ 30 jours</div>}
            {drift&&(drift.driftLabel!=="Stable")&&<div style={{padding:"8px 14px 11px",borderTop:"1px solid rgba(255,255,255,.06)",fontSize:10,color:"rgba(255,255,255,.5)",display:"flex",alignItems:"center",gap:6}}><span>{drift.drift==="up"?"📈":"📉"}</span><span>{drift.driftLabel}</span><span style={{opacity:.7}}>(Δ {drift.driftValue>0?"+":""}{Math.round(drift.driftValue*100)}% sur 7j)</span></div>}
          </div>
        </div>}

        {/* Météo */}
        {tab==="meteo"&&<div style={{animation:"up .3s ease both",display:"flex",flexDirection:"column",gap:8}}>
          {wLoad&&[1,2,3,4].map(i=><div key={i} className="sk" style={{height:40}}/>)}
          {!wLoad&&wErr&&!w&&<div style={{padding:"14px",background:"var(--sg-cardS)",borderRadius:11,border:"1px solid var(--sg-border)",fontSize:12,color:"var(--sg-mid)"}}>📡 Météo indisponible (vérifiez la connexion).</div>}
          {w&&[{l:L.vent,v:`${w.wind} km/h`,i:"💨"},{l:L.direction,v:`${w.dir}°`,i:"🧭"},{l:L.uv,v:w.uv,i:"☀️"},{l:L.temp,v:`${w.temp}°C`,i:"🌡️"}].map(r=>(
            <div key={r.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 13px",background:"var(--sg-cardS)",borderRadius:11,border:"1px solid var(--sg-borderM)",fontSize:12}}>
              <span style={{display:"flex",alignItems:"center",gap:7,color:"var(--sg-ink)",opacity:0.9,fontWeight:500}}><span>{r.i}</span>{r.l}</span>
              <span style={{fontWeight:700,color:"var(--sg-ink)"}}>{r.v}</span>
            </div>
          ))}
          {w&&<div style={{padding:"11px 13px",background:"var(--sg-cardS)",borderRadius:11,border:"1px solid var(--sg-borderM)",borderLeft:"3px solid "+C.teal,fontSize:11,color:"var(--sg-ink)",lineHeight:1.65,fontWeight:500}}>💡 {w.wind>25?L.ventFort:w.uv>8?L.uvEleve:L.conditionsFav}</div>}
        </div>}

        {/* Signaler */}
        {tab==="signal"&&!reported&&<div style={{animation:"up .3s ease both"}}>
          <p style={{fontSize:13,color:"var(--sg-ink)",marginBottom:14,lineHeight:1.7,opacity:.8}}>Tu es sur place ? Dis-nous en 2 secondes.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {CHOICES.map(c=>{const cs=ST[c.k==="none"?"clean":c.k==="few"?"moderate":"avoid"];return(
              <button key={c.k} onClick={()=>pick(c.k)} style={{padding:"13px 8px",borderRadius:13,border:choice===c.k?`2px solid ${cs.c}60`:`1px solid var(--sg-border)`,cursor:"pointer",textAlign:"center",background:choice===c.k?cs.bg:"rgba(0,0,0,.025)",transition:"all .15s",color:"var(--sg-ink)"}}>
                <div style={{fontSize:24,marginBottom:3}}>{c.e}</div>
                <div style={{fontSize:11,fontWeight:700,color:choice===c.k?cs.c:C.mid}}>{c.l}</div>
                <div style={{fontSize:9,color:C.gold,fontWeight:700,marginTop:2}}>⭐ +{c.xp} XP</div>
              </button>
            )})}
          </div>
          {(genning||comment)&&<div style={{marginBottom:14}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--sg-mid)",marginBottom:6,display:"flex",alignItems:"center",gap:6}}>Commentaire <span style={{background:C.greenBg,color:C.green,padding:"2px 7px",borderRadius:100,fontSize:8,fontWeight:700}}>IA ✨</span></div>
            {genning?<div style={{padding:"11px 13px",borderRadius:11,background:C.goldBg,display:"flex",gap:5,alignItems:"center",border:`1px solid ${C.gold}22`}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.goldL,animation:`dotT 1.2s ease ${i*.15}s infinite`}}/>)}<span style={{fontSize:11,color:C.gold}}>Génération…</span></div>
            :<textarea value={comment} onChange={e=>setComment(e.target.value)} rows={2} style={{width:"100%",padding:"11px 13px",fontSize:12,lineHeight:1.5,border:`1.5px solid ${C.gold}33`,borderRadius:11,background:"var(--sg-bg)",color:"var(--sg-ink)",resize:"none",outline:"none",boxSizing:"border-box"}}/>}
          </div>}
          <GBtn full sm onClick={doReport}>Signaler{choice?` +${CHOICES.find(c=>c.k===choice)?.xp} XP`:""} →</GBtn>
        </div>}
        {tab==="signal"&&reported&&<div style={{textAlign:"center",padding:"32px 0",animation:"up .3s ease both"}}><div style={{fontSize:52,marginBottom:10}}>🎉</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,textTransform:"uppercase",color:"var(--sg-ink)",marginBottom:5}}>Merci !</div><div style={{fontSize:12,color:"var(--sg-mid)",lineHeight:1.6}}>Ton signalement est en ligne sur {beach.name}.</div></div>}

        {/* Y aller */}
        {tab==="aller"&&<div style={{animation:"up .3s ease both",display:"flex",flexDirection:"column",gap:9}}>
          {[{h:`https://maps.google.com/?q=${beach.lat},${beach.lng}&travelmode=driving`,i:"🗺️",t:"Itinéraire voiture",s:"Google Maps"},{h:`https://www.waze.com/ul?ll=${beach.lat}%2C${beach.lng}&navigate=yes`,i:"📡",t:"Ouvrir Waze",s:"Navigation temps réel"},{h:`https://www.windy.com/${beach.lat}/${beach.lng}?wind`,i:"🌬️",t:"Voir sur Windy",s:"Vents et courants"}].map(l=>(
            <a key={l.t} href={l.h} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:13,padding:"14px 15px",background:"var(--sg-card)",borderRadius:14,border:"1px solid var(--sg-border)",textDecoration:"none",transition:"all .18s",boxShadow:"0 2px 8px var(--sg-card-shadow, rgba(0,0,0,.042))"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
              <div style={{width:40,height:40,borderRadius:11,background:"var(--sg-rowHover)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{l.i}</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)"}}>{l.t}</div><div style={{fontSize:10,color:"var(--sg-mid)",marginTop:1}}>{l.s}</div></div>
              <span style={{fontSize:12,color:"var(--sg-mid)"}}>→</span>
            </a>
          ))}
        </div>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ HEADER + NAV
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_ALL_FR=[{id:"accueil",icon:"🏠",label:"Accueil"},{id:"jeu",icon:"🎮",label:"Jeu"},{id:"arena",icon:"🌊",label:"Arena"},{id:"chat",icon:"🤖",label:"IA"},{id:"liste",icon:"🌊",label:"Plages"},{id:"carte",icon:"🗺️",label:"Carte"},{id:"premium",icon:"⭐",label:"Premium"},{id:"profil",icon:"👤",label:"Profil"}]
const NAV_ALL_EN=[{id:"accueil",icon:"🏠",label:"Home"},{id:"jeu",icon:"🎮",label:"Game"},{id:"arena",icon:"🌊",label:"Arena"},{id:"chat",icon:"🤖",label:"AI"},{id:"liste",icon:"🌊",label:"Beaches"},{id:"carte",icon:"🗺️",label:"Map"},{id:"premium",icon:"⭐",label:"Premium"},{id:"profil",icon:"👤",label:"Profile"}]
// Bottom nav : 5 items max pour mobile, sidebar : tous
const NAV_BOTTOM_IDS=["accueil","liste","carte","jeu","profil"]
function getNAV(lang){ return lang==="en"?NAV_ALL_EN:NAV_ALL_FR }
function getBottomNAV(lang){ const all=getNAV(lang); return all.filter(t=>NAV_BOTTOM_IDS.includes(t.id)) }

function AppHeader({live,clean,xp,onGPS,island,onIslandChange,copernicusCheck,isDark,onThemeToggle}){
  const level=getLevel(xp)
  const nextLevel=LEVELS[LEVELS.indexOf(level)+1]
  const xpPct=Math.min(100,Math.round(((xp-level.min)/((nextLevel?.min||level.min+1)-level.min))*100))

  return(
    <div style={{padding:"10px 16px 8px",background:"var(--sg-glass)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid var(--sg-border)",flexShrink:0,zIndex:50}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,background:"conic-gradient(from -10deg,#FFE898 0deg 30deg,#C4830A 30deg 70deg,#FFD040 70deg 115deg,#9A6500 115deg 160deg,#FFE07A 160deg 200deg,#C07800 200deg 245deg,#EDA000 245deg 290deg,#8A5800 290deg 330deg,#FFE898 330deg)",animation:"spinR 18s linear infinite",boxShadow:"0 2px 9px rgba(196,131,10,.32)"}}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,letterSpacing:".07em",color:"var(--sg-ink)"}}>SARGASSES</span>
            <div style={{display:"flex",borderRadius:100,overflow:"hidden",border:"1px solid var(--sg-border)",background:"var(--sg-bg)"}}>
              <button onClick={()=>onIslandChange("mq")} style={{padding:"3px 9px",fontSize:9,fontWeight:700,fontFamily:"'Syne',sans-serif",border:"none",cursor:"pointer",background:island==="mq"?(isDark?C.goldL:"var(--sg-ink)"):"transparent",color:island==="mq"?(isDark?"#0B0A08":"white"):"var(--sg-mid)",borderRadius:100}}>MQ</button>
              <button onClick={()=>onIslandChange("gp")} style={{padding:"3px 9px",fontSize:9,fontWeight:700,fontFamily:"'Syne',sans-serif",border:"none",cursor:"pointer",background:island==="gp"?(isDark?C.goldL:"var(--sg-ink)"):"transparent",color:island==="gp"?(isDark?"#0B0A08":"white"):"var(--sg-mid)",borderRadius:100}}>GP</button>
            </div>
            <span style={{fontSize:9,color:level.color,fontWeight:800,background:`${level.color}18`,borderRadius:100,padding:"2px 8px"}}>{level.e} {level.label}</span>
          </div>
          {/* XP mini bar */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
            <div style={{flex:1,height:3,background:"var(--sg-border)",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${xpPct}%`,background:`linear-gradient(90deg,${C.goldLL},${C.goldL})`,borderRadius:2,transition:"width .8s cubic-bezier(.16,1,.3,1)"}}/>
            </div>
            <span style={{fontSize:9,color:C.gold,fontWeight:700,whiteSpace:"nowrap"}}>{xp} XP</span>
            <span style={{fontSize:10,color:"var(--sg-mute)"}}>·</span>
            <span style={{color:C.green,fontWeight:700,fontSize:9}}>{clean} propres</span>
            <span style={{fontSize:10,color:"var(--sg-mute)"}}>·</span>
            <span style={{color:C.teal,fontWeight:700,fontSize:9}}>{live} 🟢</span>
            {copernicusCheck!=null&&<><span style={{fontSize:10,color:"var(--sg-mute)"}}>·</span><span style={{fontSize:9,fontWeight:700,color:copernicusCheck.ok?C.green:C.amber}} title={copernicusCheck.message}>Copernicus {copernicusCheck.ok?"✓":"—"}</span></>}
          </div>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          <button onClick={onThemeToggle} style={{width:30,height:30,borderRadius:"50%",border:"1px solid var(--sg-border)",background:"var(--sg-card)",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}} aria-label={isDark?"Mode clair":"Mode sombre"}>{isDark?"☀️":"🌙"}</button>
          <button onClick={onGPS} style={{width:30,height:30,borderRadius:"50%",border:"1px solid var(--sg-border)",background:"var(--sg-card)",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>📍</button>
          <div style={{display:"flex",alignItems:"center",gap:5,background:C.tealBg,border:`1px solid rgba(0,150,136,.18)`,borderRadius:100,padding:"4px 10px"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.tealL,animation:"pulse 2s ease-in-out infinite"}}/>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:8,letterSpacing:".1em",color:C.teal}}>LIVE</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function BottomNav({active,onChange,alerts,isDark}){
  const lang=useLang()
  const nav=getBottomNAV(lang)
  return(
    <div className="bn" style={{position:"absolute",bottom:0,left:0,right:0,background:"var(--sg-glass)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid var(--sg-border)",display:"flex",paddingBottom:"env(safe-area-inset-bottom)",zIndex:100}}>
      {nav.map(t=>{
        const on=t.id===active
        return(
          <button key={t.id} onClick={()=>onChange(t.id)} style={{flex:1,padding:"9px 2px 7px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,border:"none",background:"none",cursor:"pointer",position:"relative",fontFamily:"'Syne',sans-serif",transition:"transform .15s cubic-bezier(.34,1.56,.64,1)",transform:on?"scale(1.07)":"scale(1)"}}>
            {t.id==="accueil"&&alerts>0&&<div style={{position:"absolute",top:4,left:"calc(50% + 5px)",width:14,height:14,borderRadius:"50%",background:C.red,color:"white",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid var(--sg-bg)"}}>{alerts}</div>}
            <span style={{fontSize:on?20:17,transition:"font-size .2s"}}>{t.icon}</span>
            <span style={{fontSize:11,fontWeight:on?700:600,textTransform:"uppercase",color:on?(isDark?"var(--sg-ink)":C.gold):"var(--sg-mute)",transition:"color .2s"}}>{t.label}</span>
            {on&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:18,height:2,borderRadius:1,background:isDark?"var(--sg-mid)":`linear-gradient(90deg,${C.goldLL},${C.goldL})`}}/>}
          </button>
        )
      })}
    </div>
  )
}

function Sidebar({active,onChange,alerts,xp,clean,live,island,onIslandChange,isDark,onThemeToggle}){
  const lang=useLang()
  const nav=getNAV(lang)
  const L=T[lang]||T.fr
  const level=getLevel(xp)
  return(
    <div className="sidebar" style={{padding:"20px 0",position:"relative"}}>
      <div style={{padding:"0 20px 20px",borderBottom:"1px solid var(--sg-border)",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"conic-gradient(from -10deg,#FFE898 0deg 30deg,#C4830A 30deg 70deg,#FFD040 70deg 115deg,#9A6500 115deg 160deg,#FFE07A 160deg 200deg,#C07800 200deg 245deg,#EDA000 245deg 290deg,#8A5800 290deg 330deg,#FFE898 330deg)",animation:"spinR 18s linear infinite",flexShrink:0}}/>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,letterSpacing:".07em",color:"var(--sg-ink)"}}>SARGASSES</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{display:"flex",borderRadius:100,overflow:"hidden",border:"1px solid var(--sg-border)",background:"var(--sg-bg)"}}>
            <button onClick={()=>onIslandChange("mq")} style={{padding:"5px 12px",fontSize:11,fontWeight:700,fontFamily:"'Syne',sans-serif",border:"none",cursor:"pointer",background:island==="mq"?(isDark?C.goldL:"var(--sg-ink)"):"transparent",color:island==="mq"?(isDark?"#0B0A08":"white"):"var(--sg-mid)",borderRadius:100}}>Martinique</button>
            <button onClick={()=>onIslandChange("gp")} style={{padding:"5px 12px",fontSize:11,fontWeight:700,fontFamily:"'Syne',sans-serif",border:"none",cursor:"pointer",background:island==="gp"?(isDark?C.goldL:"var(--sg-ink)"):"transparent",color:island==="gp"?(isDark?"#0B0A08":"white"):"var(--sg-mid)",borderRadius:100}}>Guadeloupe</button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
          <span style={{fontSize:9,color:level.color,fontWeight:800,background:`${level.color}18`,borderRadius:100,padding:"2px 8px"}}>{level.e} {level.label}</span>
        </div>
        <div style={{height:3,background:"var(--sg-border)",borderRadius:2,overflow:"hidden",marginBottom:4}}>
          <div style={{height:"100%",width:`${Math.min(100,Math.round(((xp-level.min)/((LEVELS[LEVELS.indexOf(level)+1]?.min||level.min+1)-level.min))*100))}%`,background:`linear-gradient(90deg,${C.goldLL},${C.goldL})`,borderRadius:2,transition:"width 1s"}}/>
        </div>
        <div style={{fontSize:10,color:"var(--sg-mid)"}}><span style={{color:C.green,fontWeight:700}}>{clean} {L.propres}</span> · <span style={{color:C.teal,fontWeight:700}}>{live} {L.enLigne}</span></div>
      </div>
      {nav.map(t=>{
        const on=t.id===active
        return(
          <button key={t.id} onClick={()=>onChange(t.id)} style={{width:"100%",padding:"11px 20px",display:"flex",alignItems:"center",gap:12,border:"none",background:on?(isDark?"var(--sg-accent)":C.goldBgL):"none",cursor:"pointer",position:"relative",fontFamily:"'Syne',sans-serif",transition:"all .18s"}}
          onMouseEnter={e=>{if(!on)e.currentTarget.style.background="var(--sg-rowHover)"}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background="none"}}>
            {on&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:22,borderRadius:2,background:isDark?"var(--sg-mid)":C.goldL}}/>}
            <span style={{fontSize:20}}>{t.icon}</span>
            <span style={{fontSize:13,fontWeight:on?700:500,color:on?(isDark?"var(--sg-ink)":C.gold):"var(--sg-mid)"}}>{t.label}</span>
            {t.id==="accueil"&&alerts>0&&<span style={{marginLeft:"auto",width:18,height:18,borderRadius:"50%",background:C.red,color:"white",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{alerts}</span>}
          </button>
        )
      })}
      <div style={{position:"absolute",bottom:20,left:0,right:0,padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
        <button onClick={onThemeToggle} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:10,border:"1px solid var(--sg-border)",background:"var(--sg-card)",cursor:"pointer",fontFamily:"'Syne',sans-serif",fontSize:11,color:"var(--sg-ink)"}} aria-label={isDark?L.modeClair:L.modeSombre}>{isDark?"☀️ "+L.modeClair:"🌙 "+L.modeSombre}</button>
        <div style={{fontSize:10,color:"var(--sg-mute)",lineHeight:1.6}}>
          <div style={{marginBottom:4,fontWeight:700,color:"var(--sg-mid)"}}>Liens utiles</div>
          <a href="/carte-sargasses/" style={{color:"var(--sg-mute)",textDecoration:"none"}}>Carte sargasses</a><span style={{margin:"0 4px"}}>·</span>
          <a href="/previsions/" style={{color:"var(--sg-mute)",textDecoration:"none"}}>Prévisions 7j</a><span style={{margin:"0 4px"}}>·</span>
          <a href="/en/" style={{color:"var(--sg-mute)",textDecoration:"none"}}>English</a><span style={{margin:"0 4px"}}>·</span>
          <a href="/mentions-legales.html" style={{color:"var(--sg-mute)",textDecoration:"none"}}>Mentions légales</a><span style={{margin:"0 4px"}}>·</span>
          <a href="/confidentialite.html" style={{color:"var(--sg-mute)",textDecoration:"none"}}>Confidentialité</a>
        </div>
        <div style={{fontSize:10,color:"var(--sg-mute)",lineHeight:1.8}}>
          <a href="https://sargasses-martinique.com/" style={{color:"var(--sg-mute)",textDecoration:"none"}}>sargasses-martinique.com</a><br/>
          <a href="https://sargasses-guadeloupe.com/" style={{color:"var(--sg-mute)",textDecoration:"none"}}>sargasses-guadeloupe.com</a>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ░░ APP ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const lang = getLang()
  const [screen,  setScreen]  = useState("onboarding")
  const [tab,     setTab]     = useState(()=>{
    if(typeof window!=="undefined"){
      const p=window.location.pathname
      if(p.includes("carte-sargasses")) return "carte"
      if(p.includes("previsions")) return "accueil"
    }
    return "accueil"
  })
  const [favs,    setFavs]    = useState(()=>g("sg_favs",["grande-anse","tartane"]))
  const [sheet,   setSheet]   = useState(null)
  const [premium, setPremium] = useState(()=>g("sg_premium",false))
  const [island, setIsland] = useState(()=>{
    try {
      if(typeof window!=="undefined"&&/guadeloupe/.test(window.location.hostname)) return "gp"
    } catch(e){}
    return g("sg_island","mq")
  })
  const [confetti,setConfetti]= useState(false)
  const [live,    setLive]    = useState(38)
  const [gps,     setGps]     = useState(null)
  const [chatQ,   setChatQ]   = useState(null)
  const [xp,      setXP]      = useState(()=>g("sg_xp",0))
  const [xpToast, setXpToast] = useState(null)
  const [xpVisible,setXpVis] = useState(false)
  const [copernicusCheck, setCopernicusCheck] = useState(null) // { ok, message } après GET /api/copernicus/check
  const [sargassumData, setSargassumData] = useState(null)     // { source, updatedAt, levels } après GET /api/copernicus/sargassum
  const [historyData, setHistoryData] = useState(null)         // { history, changes } depuis history.json
  const [allBeaches, setAllBeaches] = useState(BEACHES)         // liste complète (étendue via /data/beaches-list.json si dispo)
  const [localBeachImages, setLocalBeachImages] = useState({}) // id → filename (depuis /data/beaches-images.json) pour vignettes liste
  const [isDark, setIsDark] = useState(()=>{
    try {
      const v = localStorage.getItem("sg_theme")
      if (v !== null) return v === "dark"
      if (typeof window !== "undefined" && window.matchMedia) return window.matchMedia("(prefers-color-scheme: dark)").matches
    } catch {}
    return false
  })

  const online = useOnline()

  useEffect(()=>{
    try { localStorage.setItem("sg_theme", isDark ? "dark" : "light") } catch {}
    document.documentElement.classList.toggle("theme-dark", isDark)
  }, [isDark])

  // SEO : titre dynamique "en temps réel" (quick win GSC)
  useEffect(()=>{
    if(screen!=="app") return
    if(lang==="en"){
      document.title = island==="gp" ? "Sargassum Guadeloupe real-time · Map & beaches today" : "Sargassum Martinique real-time · Map & beaches today"
    } else {
      const base = island==="mq" ? "Sargasses Martinique en temps réel" : "Sargasses Guadeloupe en temps réel"
      document.title = `${base} · Carte et plages aujourd'hui`
    }
  }, [screen, island, lang])

  // Données sargasses récentes (dernier jeu Copernicus ou référence)
  useEffect(() => {
    if (screen !== 'app' || !online) return
    let cancelled = false
    fetch(import.meta.env.DEV ? '/api/copernicus/sargassum' : '/api/copernicus/sargassum.json')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.levels)) setSargassumData({ source: d.source || 'reference', updatedAt: d.updatedAt, levels: d.levels, weekly: d.weekly || null })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [screen, online])

  // Historique sargasses (30 jours)
  useEffect(() => {
    if (screen !== 'app' || !online) return
    let cancelled = false
    fetch(import.meta.env.DEV ? '/api/copernicus/history' : '/api/copernicus/history.json')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d) setHistoryData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [screen, online])

  // Vérification Copernicus : en dev appel API, en prod (FTP) déduire du fichier sargassum.json
  useEffect(()=>{
    if(screen!=="app"||!online) return
    let cancelled=false
    if(import.meta.env.DEV){
      fetch("/api/copernicus/check").then(r=>r.json()).then(d=>{ if(!cancelled) setCopernicusCheck({ ok: d.ok, message: d.message || (d.ok ? "OK" : d.error || "—") }) }).catch(()=>{ if(!cancelled) setCopernicusCheck({ ok: false, message: "Indisponible" }) })
    }
    return ()=> { cancelled=true }
  },[screen, online])

  // En production (FTP statique) : afficher Copernicus ✓ si sargassum.json a source "copernicus"
  useEffect(() => {
    if (import.meta.env.DEV) return
    if (sargassumData?.source === 'copernicus') setCopernicusCheck({ ok: true, message: 'Données du jour' })
    else if (sargassumData != null) setCopernicusCheck({ ok: false, message: 'Données de référence' })
  }, [sargassumData])

  // Liste plages étendue (carte complète) — charge /data/beaches-list.json si dispo
  useEffect(() => {
    if (screen !== "app") return
    let cancelled = false
    fetch(getBaseUrl().replace(/\/$/, "") + "/data/beaches-list.json")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!cancelled && Array.isArray(d) && d.length > 0) setAllBeaches(d)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [screen])

  // Images locales des plages (liste) — pour afficher les vignettes en ligne même si Esri est bloqué
  useEffect(() => {
    if (screen !== "app") return
    let cancelled = false
    fetch(getBaseUrl().replace(/\/$/, "") + "/data/beaches-images.json")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!cancelled && d && typeof d === "object") setLocalBeachImages(d)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [screen])

  // Live counter
  useEffect(()=>{const iv=setInterval(()=>setLive(n=>Math.max(26,Math.min(70,n+(Math.random()>.5?1:-1)))),2800);return()=>clearInterval(iv)},[])

  // Retour Stripe : ?premium=1 dans l'URL → activer premium (configurer success_url dans le lien Stripe)
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    if(params.get("premium")==="1"){
      setPremium(true);setConfetti(true);s("sg_premium",true);addXP("premium")
      setTimeout(()=>setConfetti(false),3200)
      window.history.replaceState({},"",window.location.pathname||"/")
    }
  },[])

  // Streak
  useEffect(()=>{
    const today=new Date().toDateString(),last=g("sg_last_day","")
    if(last!==today){const y=new Date();y.setDate(y.getDate()-1);const str=last===y.toDateString()?g("sg_streak",1)+1:1;s("sg_streak",str);s("sg_last_day",today)}
    if(g("sg_onboarded",false)) setScreen("app")
  },[])

  // XP handler
  const addXP=useCallback((action)=>{
    const gain=xpForAction(action)
    setXP(prev=>{const next=prev+gain;s("sg_xp",next);return next})
    setXpToast(gain);setXpVis(true)
    setTimeout(()=>setXpVis(false),1600)
  },[])

  function toggleFav(id){
    const next=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id]
    setFavs(next);s("sg_favs",next)
  }
  function openBeach(b){
    setSheet(b)
    const v=g("sg_views",{});v[b.id]=(v[b.id]||0)+1;s("sg_views",v)
    const r=g("sg_recent",[]);s("sg_recent",[b.id,...r.filter(id=>id!==b.id)].slice(0,10))
    const st=g("sg_stats",{reports:0,chats:0,views:0});s("sg_stats",{...st,views:st.views+1})
  }
  function getGPS(){navigator.geolocation?.getCurrentPosition(p=>setGps({lat:p.coords.latitude,lng:p.coords.longitude}),()=>{})}
  function finishOnboarding(){s("sg_onboarded",true);setScreen("app");addXP("open")}
  function activatePremium(){setPremium(true);setConfetti(true);setTimeout(()=>setConfetti(false),3200);addXP("premium")}
  function goTab(t){setTab(t);if(t!=="chat")setChatQ(null)}
  function askChat(q){setChatQ(q);setTab("chat")}
  function setIslandAndSave(i){setIsland(i);s("sg_island",i)}

  const effectiveBeaches=useMemo(()=>{
    const levels = sargassumData?.levels
    if (!levels?.length) return allBeaches
    const byId = Object.fromEntries(levels.map(l=>[l.id, l]))
    return allBeaches.map(b=>{
      const l = byId[b.id]
      if (!l || (l.afai == null && l.status == null)) return b
      return { ...b, afai: l.afai ?? b.afai, status: l.status ?? b.status }
    })
  },[sargassumData, allBeaches])
  const beachesFilteredWithSargassum=useMemo(()=>effectiveBeaches.filter(b=>b.island===island),[effectiveBeaches, island])
  const alerts=beachesFilteredWithSargassum.filter(b=>b.status==="avoid"&&favs.includes(b.id)).length
  const clean=beachesFilteredWithSargassum.filter(b=>b.status==="clean").length

  if(screen==="onboarding") return(
    <LangContext.Provider value={lang}>
    <div className={"theme-" + (isDark ? "dark" : "light")} style={{width:"100%",minHeight:"100vh",maxWidth:"100%",margin:"0 auto",overflow:"hidden",position:"relative"}}>
      <style>{CSS}</style>
      <Onboarding onDone={finishOnboarding}/>
    </div>
    </LangContext.Provider>
  )

  return(
    <LangContext.Provider value={lang}>
    <div className={"shell theme-" + (isDark ? "dark" : "light")} style={{width:"100%",minHeight:"100vh",maxWidth:"100%",margin:"0 auto",display:"flex",flexDirection:"column",position:"relative",overflow:"hidden",fontFamily:"'Syne',sans-serif",background:"var(--sg-bg)"}}>
      <style>{CSS}</style>
      {!online&&(
        <div style={{position:"sticky",top:0,zIndex:500,background:C.amber,color:"var(--sg-ink)",padding:"8px 14px",fontSize:11,fontWeight:700,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span>📡</span> Vous êtes hors ligne — météo et assistant temporairement indisponibles.
        </div>
      )}
      <Confetti on={confetti}/>
      <XPToast xp={xpToast} visible={xpVisible}/>

      {/* Desktop sidebar */}
      <Sidebar active={tab} onChange={goTab} alerts={alerts} xp={xp} clean={clean} live={live} island={island} onIslandChange={setIslandAndSave} isDark={isDark} onThemeToggle={()=>setIsDark(d=>!d)}/>

      {/* Main column */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {tab!=="jeu"&&tab!=="arena"&&<AppHeader live={live} clean={clean} xp={xp} onGPS={getGPS} island={island} onIslandChange={setIslandAndSave} copernicusCheck={copernicusCheck} isDark={isDark} onThemeToggle={()=>setIsDark(d=>!d)}/>}

        {/* H2S banner */}
        {alerts>0&&tab!=="jeu"&&tab!=="arena"&&<div style={{padding:"8px 16px",background:"rgba(176,27,27,.07)",borderBottom:`1px solid rgba(176,27,27,.12)`,display:"flex",alignItems:"center",gap:9}}>
          <span style={{fontSize:13,flexShrink:0}}>☣️</span>
          <span style={{fontSize:11,fontWeight:700,color:C.red,flex:1}}>Risque H2S sur {alerts} plage{alerts>1?"s":""} favorite{alerts>1?"s":""}</span>
          <button onClick={()=>goTab("accueil")} style={{background:"none",border:"none",fontSize:9,color:C.red,cursor:"pointer",fontWeight:700,fontFamily:"'Syne',sans-serif"}}>Voir →</button>
        </div>}

        {/* Screens */}
        <div style={{flex:1,position:"relative",overflowY:"auto",overflowX:"hidden",minHeight:0,paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
          {tab==="accueil"&&<AccueilScreen beaches={beachesFilteredWithSargassum} island={island} favs={favs} onFavToggle={toggleFav} onOpenBeach={openBeach} onAskChat={askChat} gps={gps} onGPS={getGPS} premium={premium} onGoToPremium={()=>goTab("premium")} onXP={addXP} sargassumData={sargassumData} historyData={historyData}/>}
          {tab==="jeu"&&<div style={{position:"absolute",inset:0,overflow:"hidden"}}><SargassesGame island={island}/></div>}
          {tab==="arena"&&(
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",minHeight:0}}>
              <a href="/neptunes_fury.html" target="_blank" rel="noopener noreferrer" style={{flexShrink:0,padding:"6px 12px",fontSize:11,fontWeight:700,color:C.gold,background:"rgba(0,0,0,.5)",textAlign:"center",textDecoration:"none",fontFamily:"'Syne',sans-serif"}}>Ouvrir Neptune's Fury en plein écran →</a>
              <iframe title="Neptune's Fury" src="/neptunes_fury.html" style={{flex:1,width:"100%",minHeight:0,border:"none",display:"block",background:"#000"}}/>
            </div>
          )}
          {tab==="chat"&&<ChatScreen beaches={beachesFilteredWithSargassum} favs={favs} onFavToggle={toggleFav} onOpenBeach={openBeach} initQ={chatQ} onXP={addXP} sargassumData={sargassumData} island={island}/>}
          {tab==="liste"&&<ListeScreen beaches={beachesFilteredWithSargassum} favs={favs} onFavToggle={toggleFav} onOpenBeach={openBeach} gps={gps} onXP={addXP} localBeachImages={localBeachImages}/>}
          {tab==="carte"&&<CarteScreen beaches={beachesFilteredWithSargassum} island={island} favs={favs} onOpenBeach={openBeach} gps={gps} onGPS={getGPS} onXP={addXP}/>}
          {tab==="premium"&&<PremiumScreen premium={premium} onActivate={activatePremium}/>}
          {tab==="profil"&&<ProfilScreen beaches={allBeaches} favs={favs} onFavToggle={toggleFav} onOpenBeach={openBeach} premium={premium} onActivatePremium={activatePremium} xp={xp} onXP={addXP}/>}
          {/* Footer liens internes + cross-site (SEO, crawlable) */}
          <footer style={{padding:"12px 16px 16px",borderTop:"1px solid var(--sg-border)",background:"var(--sg-card)",display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"center",gap:6,fontSize:10,color:"var(--sg-mute)"}} aria-label="Liens utiles">
            <a href="/carte-sargasses/" style={{color:"var(--sg-mid)",textDecoration:"none",fontWeight:600}}>Carte sargasses</a>
            <span>·</span>
            <a href="/previsions/" style={{color:"var(--sg-mid)",textDecoration:"none",fontWeight:600}}>Prévisions 7 jours</a>
            <span>·</span>
            <a href="/en/" style={{color:"var(--sg-mid)",textDecoration:"none",fontWeight:600}}>English</a>
            <span>·</span>
            <a href="/mentions-legales.html" style={{color:"var(--sg-mid)",textDecoration:"none",fontWeight:600}}>Mentions légales</a>
            <span>·</span>
            <a href="/confidentialite.html" style={{color:"var(--sg-mid)",textDecoration:"none",fontWeight:600}}>Confidentialité</a>
            <span>·</span>
            <a href="https://sargasses-martinique.com/" style={{color:"var(--sg-mute)",textDecoration:"none"}}>Martinique</a>
            <span>·</span>
            <a href="https://sargasses-guadeloupe.com/" style={{color:"var(--sg-mute)",textDecoration:"none"}}>Guadeloupe</a>
          </footer>
        </div>

        <BottomNav active={tab} onChange={goTab} alerts={alerts} isDark={isDark}/>
      </div>

      {/* Beach detail sheet */}
      <Sheet open={!!sheet} onClose={()=>setSheet(null)}>
        {sheet&&<BeachDetail beach={sheet} isFav={favs.includes(sheet.id)} onFavToggle={()=>toggleFav(sheet.id)} premium={premium} onXP={addXP} sargassumData={sargassumData} localBeachImages={localBeachImages}/>}
      </Sheet>

      {/* Premium toast */}
      {confetti&&<div style={{position:"fixed",top:76,left:"50%",transform:"translateX(-50%)",background:C.night,border:`1px solid rgba(237,160,0,.22)`,borderRadius:14,padding:"10px 18px",display:"flex",alignItems:"center",gap:10,zIndex:500,boxShadow:"0 8px 32px rgba(0,0,0,.25)",whiteSpace:"nowrap",fontFamily:"'Syne',sans-serif",animation:"up .3s ease both"}}>
        <span style={{fontSize:20}}>⭐</span>
        <div><div style={{fontSize:11,fontWeight:800,color:C.goldL}}>Premium activé !</div>        <div style={{fontSize:9,color:"rgba(255,255,255,.4)"}}>30 jours · 2 îles · Alertes push</div></div>
      </div>}
    </div>
    </LangContext.Provider>
  )
}
