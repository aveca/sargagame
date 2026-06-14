/**
 * SARGASSES — Reboot from scratch (4 avril 2026)
 * "Cette fois, tu seras prévenu."
 *
 * Architecture : Map-first, data-driven (Clarity — 25% clics = carte)
 * Stack : React 18 · Leaflet · Bricolage Grotesque + Anton · Open-Meteo
 */
import React,{useState,useEffect,useRef,useMemo,useCallback,createContext,useContext,Component,Suspense,lazy}from"react"
import {computeScore as _computeBeachScore} from "./src/lib/score.js"

// Import résilient : pendant la fenêtre FTP d'un deploy (~25 min), un index.html
// frais peut référencer un chunk pas encore uploadé → import() rejette et le
// Suspense affichait un spinner ÉTERNEL (« les sites loadent indéfiniment au
// moment de l'apparition de la map », user 2026-06-11). Récupération : retry à
// 1,5 s (l'upload du chunk peut aboutir entre-temps), puis UN reload de resync
// index↔chunks (garde sessionStorage anti-boucle), puis erreur réelle.
const lazyWithRetry=imp=>lazy(()=>imp()
  .then(m=>{try{sessionStorage.removeItem("sg_chunk_reload")}catch(_){}return m})
  .catch(()=>new Promise(r=>setTimeout(r,1500)).then(imp))
  .catch(err=>{
    try{
      if(!sessionStorage.getItem("sg_chunk_reload")){
        sessionStorage.setItem("sg_chunk_reload","1")
        window.location.reload()
        return new Promise(()=>{}) // reload en cours — ne pas rendre d'erreur
      }
    }catch(_){}
    throw err
  }))
const LazyMapView=lazyWithRetry(()=>import("./src/MapView"))

class ErrBound extends Component{
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return{err:e}}
  componentDidCatch(e){console.error("CAUGHT:",e.message,e.stack)}
  render(){if(this.state.err)return React.createElement("pre",{style:{color:"red",padding:20,whiteSpace:"pre-wrap"}},this.state.err.message+"\n\n"+this.state.err.stack);return this.props.children}
}

/* ═══════════════════════════════════════════════════════════════════════════
   RÉGION ACTIVE (injectée au build via __REGION__)
   Build dédié à une NOUVELLE région (id != mq/gp) → __REGION__ fait foi.
   MQ/GP = build partagé déployé sur 2 domaines → détection hostname historique
   (REGION reste null → toutes les branches MQ/GP sont strictement inchangées).
   ═══════════════════════════════════════════════════════════════════════════ */
const __R = (typeof __REGION__ !== "undefined" && __REGION__) || null
const IS_NEW_REGION = !!(__R && __R.id !== "mq" && __R.id !== "gp")
const REGION = IS_NEW_REGION ? __R : null
// Email support région-aware (MQ/GP : littéral historique inchangé)
const SUPPORT_EMAIL = IS_NEW_REGION ? (REGION.emails?.support || ("support@" + REGION.domain)) : "alerte@sargasses-martinique.com"
// Unités impériales pour les régions US (Floride) — MQ/GP et régions métriques inchangées
const US_UNITS = !!(IS_NEW_REGION && REGION.countryCode === "US")
const fmtTemp=c=>US_UNITS?`${Math.round(c*9/5+32)}°F`:`${c}°C`
const fmtWind=k=>US_UNITS?`${Math.round(k*0.621371)} mph`:`${k} km/h`
const fmtHeight=m=>US_UNITS?`${(m*3.28084).toFixed(1)} ft`:`${m}m`
const fmtRain=mm=>US_UNITS?`${(mm/25.4).toFixed(2)} in`:`${mm}mm`

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXT
   ═══════════════════════════════════════════════════════════════════════════ */
const LangCtx=createContext("fr")
export function useLang(){return useContext(LangCtx)||"fr"}
function getLang(){try{const _d=IS_NEW_REGION?REGION.primaryLang:"fr";if(typeof window==="undefined")return _d;const p=window.location.pathname;if(p.startsWith("/es"))return"es";if(p.startsWith("/en"))return"en";return _d}catch{return IS_NEW_REGION?REGION.primaryLang:"fr"}}
/* i18n inline helper — returns fr/en/es string based on current lang */
function _t(lang,fr,en,es){return lang==="es"?es:lang==="en"?en:fr}
/* stripe.js partagé — chargé à l'idle de l'app (recommandation Stripe : inclure
   Stripe.js sur toutes les pages) car ce réseau (Caraïbe → CDN Stripe) le charge
   en ~15s : au moment du paywall il doit déjà être en cache. */
let _stripeJsPromise=null
function loadStripeJs(){
  if(typeof window!=="undefined"&&window.Stripe)return Promise.resolve()
  if(_stripeJsPromise)return _stripeJsPromise
  _stripeJsPromise=new Promise((res,rej)=>{
    const sc=document.createElement("script")
    sc.src="https://js.stripe.com/v3"
    sc.onload=res
    sc.onerror=(e)=>{_stripeJsPromise=null;rej(e)}
    document.head.appendChild(sc)
  })
  return _stripeJsPromise
}
/* Labels jours du forecast : le pipeline émet du FR ('Auj.','Dem.','Ven'…) dans
   le JSON — remap au rendu pour en/es (MQ/GP fr : passthrough inchangé). */
const FC_DAY_MAP={
  en:{"Auj.":"Today","Dem.":"Tmrw",Dim:"Sun",Lun:"Mon",Mar:"Tue",Mer:"Wed",Jeu:"Thu",Ven:"Fri",Sam:"Sat"},
  es:{"Auj.":"Hoy","Dem.":"Mañ.",Dim:"Dom",Lun:"Lun",Mar:"Mar",Mer:"Mié",Jeu:"Jue",Ven:"Vie",Sam:"Sáb"},
}
const fcDay=(d,lang)=>lang==="fr"?d.day:((FC_DAY_MAP[lang]||{})[d.day]||d.day)
/* Beach Score labels arrive in FRENCH from src/lib/score.js — map to en/es at render */
const SCORE_LABEL_I18N={EXCEPTIONNEL:{en:"EXCEPTIONAL",es:"EXCEPCIONAL"},SUPER:{en:"GREAT",es:"GENIAL"},BON:{en:"GOOD",es:"BUENO"},MOYEN:{en:"AVERAGE",es:"REGULAR"},PASSABLE:{en:"FAIR",es:"PASABLE"},"ÉVITER":{en:"AVOID",es:"EVITAR"},NON:{en:"NO",es:"NO"}}
const scoreLabelFor=(label,lang)=>lang==="fr"?label:(SCORE_LABEL_I18N[label]?.[lang==="es"?"es":"en"]||label)

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

/* ═══ SOCLE DESIGN (LOT 0 consolidation 14/06) — source de vérité golden-hour.
   Additif : étend C + tokens partagés. Aucun consommateur au LOT 0 (0 risque
   visuel) ; les écrans s'y branchent aux LOTs suivants. NB: clé 'inkD' (PAS
   'ink' — C.ink='#0D0D0D' déjà utilisé sur surfaces claires) ; 'RAD' (PAS 'R' —
   shadow du rayon haversine). Voir memory reference_refonte_screens.md. ═══ */
Object.assign(C,{
  inkD:"#0A1714",card2:"#10231E",
  orCTA:"#FFC72C",orLink:"#E8A800",orPale:"#FFE08A",orGlit:"#FFD884",
  tealS:"#3BA7A0",tealL2:"#5FD3C9",
  seaD:"#08251F",seaM:"#1A5852",skyInk:"#0B2230",
  sargD:"#5d400e",sargM:"#7a5c14",sargL2:"#8a6c1c",sargV:"#a8862a",
  stClean:"#22C55E",stMod:"#F59E0B",stAvoid:"#E8522A",stAvoidL:"#F4845F",
  gradClean:["#22C55E","#16A34A"],gradMod:["#F59E0B","#B87A00"],gradAvoid:["#E8522A","#B83A1A"],
  satBody:"#C9971F",satTop:"#FFC72C",satWing:"#3BA7A0",moonCol:"#9ADCD4",
})
const TY={
  title:{fontFamily:"'Anton',sans-serif",fontWeight:400,letterSpacing:".01em",textTransform:"uppercase"},
  ui:{fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"},
  mono:{fontFamily:"ui-monospace,SFMono-Regular,'JetBrains Mono',monospace"},
  wordmark:{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:13,letterSpacing:".14em",textTransform:"uppercase"},
}
const RAD={sm:10,md:14,lg:16,xl:18,pill:999}
const SPRING={pop:"cubic-bezier(.34,1.56,.64,1)",snap:"cubic-bezier(.175,.885,.32,1.275)",sheet:"cubic-bezier(.32,.72,.33,1)"}
// Score-blob squircle (viewBox 800×600, centré 400,306) — partagé GameFunnel/fiche/share-card
const SG_BLOB_OUTER="M400 216 C442 216 494 268 494 306 C494 348 442 396 400 396 C358 396 306 348 306 306 C306 268 358 216 400 216 Z"
const SG_BLOB_INNER="M400 232 C436 232 478 270 478 306 C478 344 436 380 400 380 C364 380 322 344 322 306 C322 270 364 232 400 232 Z"
const SG_BLOB_SCORE_Y=318
const SG_BLOB_LEGEND_Y=346

const ST={
  _loading:{c:"#666",bg:"rgba(100,100,100,.1)",l:"Chargement…",le:"Loading…",les:"Cargando…",e:"⏳",h2s:false,
    desc:"Données en cours de chargement…",descEn:"Loading data…",descEs:"Cargando datos…"},
  clean:{c:C.green,bg:C.greenBg,l:"Propre",le:"Clean",les:"Limpia",e:"✅",h2s:false,
    desc:"Peu ou pas de sargasses détectées par satellite au large.",
    descEn:"Little to no sargassum detected by satellite offshore.",
    descEs:"Poco o nada de sargazo detectado por satélite en alta mar."},
  moderate:{c:C.amber,bg:C.amberBg,l:"Modéré",le:"Moderate",les:"Moderado",e:"⚠️",h2s:false,
    desc:"Présence modérée de sargasses détectée au large. Vérifiez sur place avant de vous baigner.",
    descEn:"Moderate sargassum detected offshore. Check conditions on site before swimming.",
    descEs:"Presencia moderada de sargazo detectada en alta mar. Verifique en el lugar antes de nadar."},
  avoid:{c:C.red,bg:C.redBg,l:"Alerte",le:"Alert",les:"Alerta",e:"🚫",h2s:true,
    desc:"Forte concentration de sargasses détectée au large. Échouages probables — vérifiez l'état de la plage sur place.",
    descEn:"High sargassum concentration detected offshore. Beaching likely — check beach conditions on site.",
    descEs:"Alta concentración de sargazo detectada en alta mar. Probable llegada a la playa — verifique las condiciones en el lugar."},
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
    verdictGo:"Tu peux y aller",verdictModerate:"Modéré, à toi de voir",verdictAvoid:"À éviter aujourd'hui",verdictUnknown:"État non confirmé",
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
    caribbeanView:"Vue Caraïbe",localView:"Vue locale",
    caribbeanLegendTitle:"Concentration AFAI",
    caribbeanLegendLow:"Faible",caribbeanLegendMod:"Modéré",caribbeanLegendHigh:"Fort",
    caribbeanSource:"Source : NOAA ERDDAP — Données satellite AFAI",
    caribbeanZoneSargasso:"Mer des Sargasses",caribbeanZoneNERR:"NERR",
    caribbeanZoneLesser:"Petites Antilles",caribbeanZoneGreater:"Grandes Antilles",
    caribbeanZoneGulf:"Golfe du Mexique",caribbeanZoneAfrica:"Côte Afrique Ouest",
    reliabilityHigh:"Haute",reliabilityMedium:"Moyenne",reliabilityLow:"Basse",
    reliabilityLabel:"Fiabilité",
    reliabilityHighDesc:"Données satellite récentes, modèle bien calibré pour cette zone.",
    reliabilityMediumDesc:"Données partielles ou interpolées. Vérifiez sur place.",
    reliabilityLowDesc:"Prévision incertaine (horizon lointain ou données manquantes).",
    sourceLabel:"Source",
    sciFooter:"Copernicus · NOAA/AOML SIR v1.4 · Wang & Hu 2016",
    sciUpdated:"Mis à jour toutes les 3h",
    navLearn:"Science",
    learnTitle:"Comprendre les sargasses",
    learnBack:"Retour",
    learnHero:"Du satellite à ta plage",
    learnHeroSub:"La science derrière la prévision",
    learnS1Title:"Qu'est-ce que les sargasses ?",
    learnS1P1:"Algues brunes pélagiques (Sargassum natans + fluitans) qui flottent grâce à de petites vésicules de gaz. Elles ne touchent jamais le fond.",
    learnS1P2:"Reproduction végétative : un fragment donne une nouvelle colonie. Population doublée tous les 18 jours en conditions favorables.",
    learnS1P3:"En 2018, découverte de la Grande Ceinture Atlantique (GASB) : plus de 20 millions de tonnes, de l'Afrique au Golfe du Mexique.",
    learnS2Title:"Pourquoi elles arrivent ?",
    learnS2P1:"Nutriments — Déforestation amazonienne, fleuve Congo, engrais agricoles. Azote + phosphore fertilisent l'océan.",
    learnS2P2:"Température — Hausse des SST qui accélère la croissance et élargit les zones favorables.",
    learnS2P3:"Courants — La NERR (North Equatorial Recirculation Region) transporte les bancs vers les Antilles.",
    learnS2P4:"Saison — Pic d'échouage avril à septembre, maximum en juin-juillet.",
    learnS3Title:"Impact",
    learnS3Eco:"Écologique — Étouffement des récifs, mortalité des tortues, poissons, oursins.",
    learnS3Health:"Sanitaire — H₂S (hydrogène sulfuré) + ammoniaque. Maux de tête, nausées, détresse respiratoire.",
    learnS3Econ:"Économique — Recul du tourisme, pêche perturbée. Coût de nettoyage : des dizaines de millions par an.",
    learnS4Title:"Comment on détecte",
    learnS4P1:"Satellites — MODIS (NASA) + Copernicus (ESA) mesurent l'indice AFAI par signature spectrale.",
    learnS4P2:"Seuils NOAA — < 0.15 propre · 0.15–0.40 modéré · > 0.40 alerte.",
    learnS4P3:"Notre méthode — Interpolation IDW + forecast par bancs dérivants + signal d'arrivée.",
    learnS4Sources:"Sources : Wang & Hu 2016 · NOAA/AOML SIR · USF Optical Oceanography Lab · Copernicus Marine Service.",
    learnCta:"Voir la carte des sargasses",
  },
  en:{
    days:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],today:"Today",tomorrow:"Tmrw",
    clean:"Clean",moderate:"Moderate",avoid:"Alert",
    search:"Search a beach…",
    filters:["All","Clean","Favourites","Alerts"],
    filtersIcon:["🌊","✅","❤️","🚫"],
    navMap:"Map",navList:"Beaches",navGame:"Game",navPremium:"Premium",
    verdictGo:"Go for it",verdictModerate:"Moderate, your call",verdictAvoid:"Skip it today",verdictUnknown:"Status unconfirmed",
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
    caribbeanView:"Caribbean View",localView:"Local View",
    caribbeanLegendTitle:"AFAI Concentration",
    caribbeanLegendLow:"Low",caribbeanLegendMod:"Moderate",caribbeanLegendHigh:"High",
    caribbeanSource:"Source: NOAA ERDDAP — AFAI Satellite Data",
    caribbeanZoneSargasso:"Sargasso Sea",caribbeanZoneNERR:"NERR",
    caribbeanZoneLesser:"Lesser Antilles",caribbeanZoneGreater:"Greater Antilles",
    caribbeanZoneGulf:"Gulf of Mexico",caribbeanZoneAfrica:"West Africa Coast",
    reliabilityHigh:"High",reliabilityMedium:"Medium",reliabilityLow:"Low",
    reliabilityLabel:"Reliability",
    reliabilityHighDesc:"Recent satellite data, model well-calibrated for this area.",
    reliabilityMediumDesc:"Partial or interpolated data. Check on site.",
    reliabilityLowDesc:"Uncertain forecast (far horizon or missing data).",
    sourceLabel:"Source",
    sciFooter:"Copernicus · NOAA/AOML SIR v1.4 · Wang & Hu 2016",
    sciUpdated:"Updated every 3h",
    navLearn:"Science",
    learnTitle:"Understanding sargassum",
    learnBack:"Back",
    learnHero:"From satellite to your beach",
    learnHeroSub:"The science behind the forecast",
    learnS1Title:"What is sargassum?",
    learnS1P1:"Pelagic brown algae (Sargassum natans + fluitans) that float via gas-filled bladders. They never touch the seabed.",
    learnS1P2:"Vegetative reproduction: one fragment grows a new colony. Population doubles every 18 days in favorable conditions.",
    learnS1P3:"In 2018, researchers discovered the Great Atlantic Sargassum Belt (GASB): over 20 million tonnes, from Africa to the Gulf of Mexico.",
    learnS2Title:"Why do they arrive?",
    learnS2P1:"Nutrients — Amazon deforestation, Congo river, agricultural fertilizers. Nitrogen + phosphorus feed the ocean.",
    learnS2P2:"Temperature — Rising SST accelerates growth and expands favorable zones.",
    learnS2P3:"Currents — The NERR (North Equatorial Recirculation Region) carries rafts toward the Caribbean.",
    learnS2P4:"Season — Peak beaching April to September, max in June–July.",
    learnS3Title:"Impact",
    learnS3Eco:"Ecological — Coral reef smothering, mortality of turtles, fish, sea urchins.",
    learnS3Health:"Health — H₂S (hydrogen sulfide) + ammonia. Headaches, nausea, respiratory distress.",
    learnS3Econ:"Economic — Tourism decline, disrupted fishing. Cleanup costs: tens of millions per year.",
    learnS4Title:"How we detect",
    learnS4P1:"Satellites — MODIS (NASA) + Copernicus (ESA) measure the AFAI index via spectral signature.",
    learnS4P2:"NOAA thresholds — < 0.15 clean · 0.15–0.40 moderate · > 0.40 alert.",
    learnS4P3:"Our method — IDW interpolation + drifting-raft forecast + arrival signal.",
    learnS4Sources:"Sources: Wang & Hu 2016 · NOAA/AOML SIR · USF Optical Oceanography Lab · Copernicus Marine Service.",
    learnCta:"See the sargassum map",
  },
  es:{
    days:["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],today:"Hoy",tomorrow:"Mañ.",
    clean:"Limpia",moderate:"Moderada",avoid:"Alerta",
    search:"Buscar una playa…",
    filters:["Todas","Limpias","Favoritas","Alertas"],
    filtersIcon:["🌊","✅","❤️","🚫"],
    navMap:"Mapa",navList:"Playas",navGame:"Juego",navPremium:"Premium",
    verdictGo:"Puedes ir",verdictModerate:"Moderado, tú decides",verdictAvoid:"Evita hoy",verdictUnknown:"Estado no confirmado",
    forecast:"Pronóstico",weather:"Clima",directions:"Cómo llegar",
    fav:"Favorita",addFav:"Agregar a favoritas",removeFav:"Quitar de favoritas",
    wind:"Viento",uv:"UV",temp:"Temperatura",drive:"min",
    kids:"Niños",snorkel:"Snorkel",parking:"Estacionamiento",
    premium:"Premium",premiumDesc:"Tu vigía del sargazo: resumen matutino, alertas de playas favoritas, recomendación del día.",
    premiumPrice:"4,99 €/mes",premiumCta:"Comenzar — 0€ hoy",
    premiumFeatures:["Prueba 7 días — 0€, cancela en 1 clic","Resumen matutino: tu mejor playa, cada día","Alertas push antes de que llegue el sargazo","Sin anuncios · Sin compromiso · Garantía de satisfacción"],
    h2sWarn:"Si el sargazo está varado y en descomposición, aléjese (riesgo de H₂S). Fuente: HCSP/ARS.",
    copernicus:"Copernicus Marine",live:"EN VIVO",
    nClean:"{n} limpias",island_mq:"Martinica",island_gp:"Guadalupe",
    reportThanks:"¡Gracias por tu reporte!",report:"Reportar",
    openWaze:"Abrir Waze",driftDown:"Dispersión esperada",driftUp:"Llegada posible",driftStable:"Estable",
    close:"Cerrar",nearby:"Playas cercanas",locked:"Premium",
    beachScore:"Puntuación playa",waves:"Olas",swell:"Oleaje",rain:"Lluvia",
    scoreExcellent:"Excelente",scoreGood:"Bueno",scoreMedium:"Regular",scoreBad:"Condiciones difíciles",
    marine:"Condiciones marinas",
    history:"Tendencia reciente",historyEmpty:"Sin historial aún",
    historyDays:"{n}d",
    caribbeanView:"Vista Caribe",localView:"Vista local",
    caribbeanLegendTitle:"Concentración AFAI",
    caribbeanLegendLow:"Baja",caribbeanLegendMod:"Moderada",caribbeanLegendHigh:"Alta",
    caribbeanSource:"Fuente: NOAA ERDDAP — Datos satelitales AFAI",
    caribbeanZoneSargasso:"Mar de los Sargazos",caribbeanZoneNERR:"NERR",
    caribbeanZoneLesser:"Antillas Menores",caribbeanZoneGreater:"Antillas Mayores",
    caribbeanZoneGulf:"Golfo de México",caribbeanZoneAfrica:"Costa África Occ.",
    reliabilityHigh:"Alta",reliabilityMedium:"Media",reliabilityLow:"Baja",
    reliabilityLabel:"Fiabilidad",
    reliabilityHighDesc:"Datos satelitales recientes, modelo bien calibrado para esta zona.",
    reliabilityMediumDesc:"Datos parciales o interpolados. Verifique en el lugar.",
    reliabilityLowDesc:"Pronóstico incierto (horizonte lejano o datos faltantes).",
    sourceLabel:"Fuente",
    sciFooter:"Copernicus · NOAA/AOML SIR v1.4 · Wang & Hu 2016",
    sciUpdated:"Actualizado cada 3h",
    navLearn:"Ciencia",
    learnTitle:"Entender el sargazo",
    learnBack:"Volver",
    learnHero:"Del satélite a tu playa",
    learnHeroSub:"La ciencia detrás del pronóstico",
    learnS1Title:"¿Qué es el sargazo?",
    learnS1P1:"Algas pardas pelágicas (Sargassum natans + fluitans) que flotan gracias a pequeñas vesículas de gas. Nunca tocan el fondo.",
    learnS1P2:"Reproducción vegetativa: un fragmento genera una nueva colonia. Población se duplica cada 18 días en condiciones favorables.",
    learnS1P3:"En 2018, descubrimiento del Gran Cinturón Atlántico (GASB): más de 20 millones de toneladas, de África al Golfo de México.",
    learnS2Title:"¿Por qué llegan?",
    learnS2P1:"Nutrientes — Deforestación amazónica, río Congo, fertilizantes agrícolas. Nitrógeno + fósforo fertilizan el océano.",
    learnS2P2:"Temperatura — Aumento de la SST que acelera el crecimiento y amplía las zonas favorables.",
    learnS2P3:"Corrientes — La NERR (North Equatorial Recirculation Region) transporta los bancos hacia el Caribe.",
    learnS2P4:"Temporada — Pico de llegada de abril a septiembre, máximo en junio-julio.",
    learnS3Title:"Impacto",
    learnS3Eco:"Ecológico — Asfixia de arrecifes, mortalidad de tortugas, peces, erizos.",
    learnS3Health:"Sanitario — H₂S (sulfuro de hidrógeno) + amoníaco. Dolores de cabeza, náuseas, dificultad respiratoria.",
    learnS3Econ:"Económico — Retroceso del turismo, pesca perturbada. Costo de limpieza: decenas de millones por año.",
    learnS4Title:"Cómo lo detectamos",
    learnS4P1:"Satélites — MODIS (NASA) + Copernicus (ESA) miden el índice AFAI por firma espectral.",
    learnS4P2:"Umbrales NOAA — < 0.15 limpia · 0.15–0.40 moderada · > 0.40 alerta.",
    learnS4P3:"Nuestro método — Interpolación IDW + pronóstico por bancos a la deriva + señal de llegada.",
    learnS4Sources:"Fuentes: Wang & Hu 2016 · NOAA/AOML SIR · USF Optical Oceanography Lab · Copernicus Marine Service.",
    learnCta:"Ver el mapa del sargazo",
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
  {id:"gp012",island:"gp",name:"Plage du Gosier",commune:"Le Gosier",lat:16.205254,lng:-61.4430474,kids:true,snorkel:true,parking:true,drive:12},
  {id:"gp031",island:"gp",name:"Plage de Malendure",commune:"Bouillante",lat:16.1720515,lng:-61.7767401,kids:true,snorkel:true,parking:true,drive:42},
  {id:"gp024",island:"gp",name:"Plage de Deshaies",commune:"Deshaies",lat:16.3053509,lng:-61.7950711,kids:true,snorkel:true,parking:true,drive:55},
  {id:"gp005",island:"gp",name:"Pointe des Châteaux",commune:"Saint-François",lat:16.2467983,lng:-61.1763633,kids:false,snorkel:false,parking:true,drive:52},
  {id:"gp015",island:"gp",name:"Porte d'Enfer",commune:"Anse-Bertrand",lat:16.4861861,lng:-61.4416828,kids:false,snorkel:false,parking:true,drive:55},
  {id:"gp045",island:"gp",name:"Plage Pain de Sucre",commune:"Terre-de-Haut (Les Saintes)",lat:15.8635,lng:-61.5988,kids:true,snorkel:true,parking:false,drive:60},
  {id:"gp001",island:"gp",name:"Plage de Saint-François",commune:"Saint-François",lat:16.2521,lng:-61.2644,kids:true,snorkel:true,parking:true,drive:48},
  {id:"gp010",island:"gp",name:"Plage de Sainte-Anne",commune:"Sainte-Anne",lat:16.2226,lng:-61.3828,kids:true,snorkel:false,parking:true,drive:38},
  {id:"gp021",island:"gp",name:"Plage de Grande Anse",commune:"Trois-Rivières",lat:15.9589717,lng:-61.6719389,kids:true,snorkel:true,parking:true,drive:45},
]

const ISLAND_CENTER={mq:[14.64,-61.02],gp:[16.22,-61.55]}
/* Nouvelles régions : centre injecté au build via __REGION__ (MQ/GP inchangés). */
if(IS_NEW_REGION&&REGION.center)ISLAND_CENTER[REGION.id]=[REGION.center.lat,REGION.center.lng]

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
// Pro tier — activate by creating a new Stripe Payment Link @ 9.99 EUR/mo
// (dashboard.stripe.com/payment-links) then paste the URL below. When empty,
// the Pro tier is not shown anywhere in the UI. See `hasPro` flag below.
const STRIPE_LINK_PRO=""   // TODO: 9.99 EUR/mo + 7d trial — Pro tier (WhatsApp alerts + 14d forecast + API)
const STRIPE_BUY_BTN_PRO=""  // TODO: Buy Button ID for Pro tier
const STRIPE_PK="pk_live_51PW2TGP9RK8Orx516Nx5mGUixrk2ozE8ppOcygq9Wkb1Tz5CkozRcRFcPAv53uNOmuVCHakWAse09I7KXuUiAb5r00CKYHh9zE"
// Buy Button IDs — creer sur dashboard.stripe.com/buy-buttons puis coller ici
const STRIPE_BUY_BTN_MONTHLY="buy_btn_1TJLdoP9RK8Orx514zzwL1B4" // 4.99€/mois + trial 7j + taxes
const STRIPE_BUY_BTN_ANNUAL="buy_btn_1TJLcjP9RK8Orx51JDzUFge3"
/* ── Paywall région-aware — nouvelles régions UNIQUEMENT (MQ/GP : constantes EUR
   ci-dessus inchangées). REGION.paymentLinks={monthly,yearly} en devise locale.
   Liens absents → CTA paywall masqué (waitlist), JAMAIS de fallback vers l'EUR. ── */
const REGION_PAY=IS_NEW_REGION?(REGION.paymentLinks||{}):null
const LINK_MONTHLY=REGION_PAY?(REGION_PAY.monthly||""):STRIPE_LINK_MONTHLY
const LINK_ANNUAL=REGION_PAY?(REGION_PAY.yearly||""):STRIPE_LINK_ANNUAL
const LINK_PRO=REGION_PAY?"":STRIPE_LINK_PRO
const PAYWALL_READY=!REGION_PAY||!!LINK_MONTHLY
const PRICE_MO=REGION_PAY?(REGION.pricing?.monthly||"$9.99"):null
const PRICE_YR=REGION_PAY?(REGION.pricing?.yearly||"$79"):null
// Régions SANS essai gratuit (regions/*.json noTrial:true — marchés touristes
// USD, prélèvement immédiat, décision 2026-06-10). MQ/GP gardent le trial
// (rétention post-trial 65% mesurée — réconciliation Stripe 2026-06-10) :
// toute la copy EUR reste BYTE-IDENTIQUE, les variantes no-trial ne
// s'activent que via ce flag. Le PHP (create-checkout.php) applique le même
// switch côté serveur par Origin.
const NO_TRIAL=IS_NEW_REGION&&!!REGION.noTrial

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
  // (MQ/GP uniquement : les nouvelles régions n'ont pas encore de propriété GA4 dédiée,
  //  et beaconner ici polluerait les stats MQ/GP)
  if(!IS_NEW_REGION)try{
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
    ||event==="sg_referral_share"
  if(critical){
    const entry={e:event,p,t:Date.now(),island:IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ"}
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
  const tests={em1:["control","curiosity"]}
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
    // FR-only fallback strings — the sheet maps forecastMethod to localized
    // copy at render time (EN/ES never see these raw strings).
    forecastDisclaimer:anyArrival
      ?"Banc détecté près des plages voisines — risque de dérive."
      :"Interpolation des plages voisines surveillées.",
  }
}

function getBeachPhoto(beach){
  if(!beach)return null
  return`/beaches/gplace-${beach.id}.jpg?v=3`
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
/* Pin score pills (divIcon) — nearest clean gets a soft gold halo that pulses */
.sg-pin{backface-visibility:hidden;will-change:transform}
.sg-pin:hover{transform:scale(1.12)!important}
.sg-pin-nearest{animation:sgPinNearest 2.4s ease-in-out infinite}
@keyframes sgPinNearest{
  0%,100%{box-shadow:0 0 0 2px #E8A800,0 0 0 6px rgba(232,168,0,.25),0 4px 12px rgba(0,0,0,.35)}
  50%{box-shadow:0 0 0 2px #E8A800,0 0 0 12px rgba(232,168,0,0),0 4px 12px rgba(0,0,0,.35)}
}
.sg-pin-selected{animation:sgPinSelected .5s cubic-bezier(.22,1,.36,1)}
@keyframes sgPinSelected{0%{transform:scale(.8)}60%{transform:scale(1.18)}100%{transform:scale(1.08)}}

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
  content:'';position:absolute;top:0;left:0;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);
  animation:shine 4.5s infinite;
  /* transform-only (GPU) : la version left:-100%→100% layoutait à chaque frame
     et pesait l'essentiel du CLS mobile mesuré (0,065 → ~0,02, audit 2026-06-11) */
  will-change:transform;
}
@keyframes shine{0%,70%{transform:translateX(-100%)}100%{transform:translateX(300%)}}

/* Bottom sheet */
.sheet{
  /* z 900→1010 : passe AU-DESSUS du chrome carte (radar z900, recenter z1000)
     qui flottait sur le backdrop pendant la lecture d'une fiche (audit 2026-06-11).
     Reste sous hero 1050 / toast 1090 / paywall 1100. */
  position:fixed;bottom:0;left:0;right:0;z-index:1010;
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
/* Sortie symétrique de l'entrée (audit 2026-06-11 : « les entrées sont animées,
   les sorties sont des démontages bruts » — le cœur du ressenti pas fluide) */
@keyframes sheetSlideDown{to{transform:translateY(100%)}}
.sheet-exit{animation:sheetSlideDown .28s cubic-bezier(.32,.72,0,1) forwards}
@keyframes sgFadeOut{to{opacity:0}}
.backdrop-exit{animation:sgFadeOut .25s ease forwards}
@media (prefers-reduced-motion:reduce){.sheet-exit,.backdrop-exit{animation-duration:.01s}}
.sheet-handle{width:48px;height:5px;border-radius:3px;background:var(--sg-handle,rgba(0,0,0,.2));margin:10px auto 6px;cursor:grab}

/* Backdrop */
.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1005;animation:fadeIn .25s ease-out;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);will-change:opacity}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}

/* ── ONBOARDING (removed full-screen overlay, now inline coachmark) ── */

@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes float-a{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes float-b{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes dot-pulse{0%,100%{box-shadow:0 0 0 2px rgba(34,197,94,.2)}50%{box-shadow:0 0 0 5px rgba(34,197,94,.07)}}
@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
@keyframes sgReveal{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
@keyframes sg-threat-slide{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
@keyframes sg-threat-glow{0%,100%{box-shadow:0 4px 20px rgba(232,82,42,.3)}50%{box-shadow:0 4px 30px rgba(232,82,42,.55)}}
@keyframes sg-dash-flow{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
@keyframes beachScanLine{0%{top:0;opacity:1}85%{top:100%;opacity:.8}100%{top:100%;opacity:0}}
.sg-drift-path{animation:sg-dash-flow 1.5s linear infinite}
@keyframes goldGlow{0%,100%{box-shadow:0 4px 20px rgba(232,168,0,.25)}50%{box-shadow:0 4px 30px rgba(232,168,0,.5)}}
@keyframes confirmPop{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes pin-pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.8);opacity:0}}
@keyframes beacon{0%,100%{box-shadow:0 0 0 0 rgba(232,82,42,.5)}60%{box-shadow:0 0 0 10px rgba(232,82,42,0)}}
@keyframes satellite-scan{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}

/* ── WOW TRANSITIONS ── */
@keyframes viewFadeIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes viewFadeOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.96)}}
.view-enter{animation:viewFadeIn .35s cubic-bezier(.22,1,.36,1) both}
.view-exit{animation:viewFadeOut .2s ease both}

/* Staggered card entrance */
@keyframes cardReveal{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.card-reveal{animation:cardReveal .4s cubic-bezier(.22,1,.36,1) both}
.card-reveal:nth-child(1){animation-delay:0s}
.card-reveal:nth-child(2){animation-delay:.06s}
.card-reveal:nth-child(3){animation-delay:.08s}
.card-reveal:nth-child(4){animation-delay:.12s}
.card-reveal:nth-child(5){animation-delay:.16s}

/* Number count-up shimmer */
@keyframes countShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.count-shimmer{background:linear-gradient(90deg,currentColor 40%,rgba(255,199,44,.8) 50%,currentColor 60%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:countShimmer 1.5s ease-in-out}

/* Glow badge pulse */
@keyframes glowPulse{0%,100%{box-shadow:0 0 8px rgba(0,158,142,.3)}50%{box-shadow:0 0 20px rgba(0,158,142,.6)}}
.glow-pulse{animation:glowPulse 2.5s ease-in-out infinite}

/* Ocean wave ambient */
@keyframes oceanWave{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
.ocean-gradient{background-size:200% 200%;animation:oceanWave 8s ease-in-out infinite}

/* Hero zoom in */
@keyframes heroZoom{from{transform:scale(1.08);opacity:.7}to{transform:scale(1);opacity:1}}
.hero-zoom{animation:heroZoom .8s cubic-bezier(.22,1,.36,1) both}

/* Floating particles for learn/science sections */
@keyframes floatParticle{0%,100%{transform:translateY(0) translateX(0);opacity:.3}25%{transform:translateY(-15px) translateX(5px);opacity:.6}50%{transform:translateY(-8px) translateX(-3px);opacity:.4}75%{transform:translateY(-20px) translateX(7px);opacity:.5}}

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

/* Header LIVE badge halo — soft breathing glow around the status dot */
@keyframes sg-live-halo{0%,100%{opacity:.35;transform:scale(.9)}50%{opacity:.85;transform:scale(1.35)}}

/* Sargassum bank animations */
.sg-bank{transition:fill-opacity .6s ease}
.sg-drift-dot{transition:all .6s ease}
@keyframes sg-eta-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.sg-eta-badge{animation:sg-eta-pulse 2s ease-in-out infinite}

/* Radar v2 — NAMED insight bubble entry */
@keyframes sgRadarInsightIn{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}

/* Shine for onboarding buttons */
@keyframes onb-shine{0%,100%{left:-75%}35%,65%{left:120%}}

/* Small screens — iPhone SE, Galaxy S5, etc. */
@media(max-width:360px){
  .gbtn{padding:12px 18px !important;font-size:14px !important}
  .sheet{border-radius:16px 16px 0 0 !important}
  .anton{letter-spacing:0 !important}
}

/* Tablets & desktop — keep the mobile app feel on every screen.
   Strategy: full-bleed map as ambient backdrop, app chrome (nav/sheet/panels)
   capped at ~520px centered. BottomNav becomes a floating dock pill.
   One simple rule set — no split-pane, no sidebar — works at every resolution. */
@media(min-width:768px){
  .sheet{max-width:520px;margin:0 auto !important}
  .sg-modal-panel{max-width:520px !important;margin:0 auto !important;left:50% !important;right:auto !important;transform:translateX(-50%) !important}
  .sg-float-panel{max-width:560px;margin:0 auto;left:50% !important;right:auto !important;transform:translateX(-50%)}

  /* BottomNav → floating dock pill, detached from bottom edge */
  .sg-bottom-nav{
    left:50% !important;
    right:auto !important;
    transform:translateX(-50%);
    bottom:18px !important;
    width:min(440px, calc(100vw - 48px));
    border-radius:999px !important;
    border:1px solid rgba(0,0,0,.08) !important;
    border-top:1px solid rgba(0,0,0,.08) !important;
    padding:10px 12px !important;
    box-shadow:0 12px 40px rgba(0,0,0,.14), 0 2px 10px rgba(0,0,0,.06);
    transition:transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease;
  }
  .sg-bottom-nav:hover{
    transform:translateX(-50%) translateY(-2px);
    box-shadow:0 16px 48px rgba(0,0,0,.18), 0 3px 12px rgba(0,0,0,.08);
  }

  /* Ambient radial backdrop on wide screens — the map fades into a soft halo
     at the edges so the app chrome reads as a floating card, not a browser frame */
  html,body,#root{background:radial-gradient(ellipse at center, #FDFCF7 0%, #F0ECE0 100%)}
}

/* Larger desktops — same behaviour, just a touch more breathing room */
@media(min-width:1200px){
  .sg-bottom-nav{bottom:24px !important}
  .sheet{max-width:540px}
}

/* Landscape — reduce vertical footprint */
@media(orientation:landscape) and (max-height:500px){
  .sheet{max-height:92dvh !important}
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
   WOW UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedNumber({value,duration=800,suffix="",prefix=""}){
  const[display,setDisplay]=useState(0)
  const ref=useRef(null)
  useEffect(()=>{
    const n=typeof value==="number"?value:parseFloat(value)||0
    const start=performance.now()
    const from=display
    const step=ts=>{
      const p=Math.min((ts-start)/duration,1)
      const ease=1-Math.pow(1-p,3) // easeOutCubic
      setDisplay(Math.round(from+(n-from)*ease))
      if(p<1)ref.current=requestAnimationFrame(step)
    }
    ref.current=requestAnimationFrame(step)
    return()=>cancelAnimationFrame(ref.current)
  },[value])
  return React.createElement("span",{className:"count-shimmer"},prefix+display+suffix)
}

function SectionReveal({children,delay=0,className=""}){
  const[visible,setVisible]=useState(false)
  const ref=useRef(null)
  useEffect(()=>{
    const el=ref.current;if(!el)return
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVisible(true);obs.disconnect()}},{threshold:.15})
    obs.observe(el)
    return()=>obs.disconnect()
  },[])
  return React.createElement("div",{ref,className:visible?`card-reveal ${className}`:className,
    style:{opacity:visible?1:0,animationDelay:`${delay}s`,transition:visible?"none":"opacity .01s"}},children)
}

/* ═══════════════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */
function StatusBadge({status,lang="fr"}){
  const st=ST[status]||ST._loading
  const label=lang==="es"?st.les:lang==="en"?st.le:st.l
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
  // Editorial chip: unified 40px rail, Anton count for display voice, frosted
  // inactive / gold aurora active. Icon becomes a status dot when active for
  // a tighter visual hierarchy with the header's colored-dot language.
  return(
    <button onClick={onClick} style={{
      display:"inline-flex",alignItems:"center",gap:7,padding:"0 14px 0 12px",height:40,minHeight:40,
      borderRadius:100,
      border:active?"1px solid rgba(232,168,0,.55)":"1px solid rgba(15,42,58,.08)",
      background:active
        ?"linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)"
        :"linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.6))",
      backdropFilter:active?"none":"blur(8px)",
      WebkitBackdropFilter:active?"none":"blur(8px)",
      color:active?"#1a1200":"var(--sg-ink,#0D0D0D)",
      fontSize:13,fontWeight:active?700:600,letterSpacing:".005em",
      cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",
      boxShadow:active
        ?"0 4px 14px -4px rgba(232,168,0,.4), inset 0 1px 0 rgba(255,255,255,.5)"
        :"0 2px 8px rgba(15,42,58,.06), inset 0 1px 0 rgba(255,255,255,.5)",
      transition:"all .25s cubic-bezier(.22,1,.36,1)",
    }}>
      <span style={{fontSize:14,lineHeight:1,filter:active?"none":"grayscale(.35)",opacity:active?1:.85}}>{icon}</span>
      <span>{label}</span>
      {count!=null&&<span style={{
        fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:".02em",lineHeight:1,
        color:active?"rgba(26,18,0,.75)":"var(--sg-mid,#686868)",
        background:active?"rgba(26,18,0,.1)":"rgba(15,42,58,.05)",
        borderRadius:100,padding:"3px 7px 2px",marginLeft:1}}>{count}</span>}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORECAST CREDIBILITY — confidence bar + source + method
   ═══════════════════════════════════════════════════════════════════════════ */
function ForecastCredibility({weeklyData,lang,sargData}){
  const LL=T[lang]||T.fr
  const[showTip,setShowTip]=useState(false)
  const avgConf=weeklyData?.forecast?.[0]?.confidence||40
  const level=avgConf>=50?"high":avgConf>=30?"medium":"low"
  const levelLabel=level==="high"?LL.reliabilityHigh:level==="medium"?LL.reliabilityMedium:LL.reliabilityLow
  const levelDesc=level==="high"?LL.reliabilityHighDesc:level==="medium"?LL.reliabilityMediumDesc:LL.reliabilityLowDesc
  const levelColor=level==="high"?C.green:level==="medium"?C.amber:C.red
  const barPct=Math.min(100,Math.max(8,avgConf))
  const updatedAt=sargData?.erddapTimestamp||sargData?.updatedAt||null
  const dateStr=updatedAt?new Date(updatedAt).toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{day:"numeric",month:"short"}):null
  const method=weeklyData?.forecastMethod||"persistence"
  const methodLabel=method==="arrival-banks"?"AFAI + Banks":method==="banks-persistence"?"AFAI + Persistence":method==="memory-decay"?"Memory decay":method==="interpolated"?"IDW":"Persistence + wind"
  return(
    <div style={{marginTop:10,padding:"10px 12px",borderRadius:12,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.06))"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:700,color:"var(--sg-mid,#686868)",minWidth:52,letterSpacing:".03em",textTransform:"uppercase"}}>{LL.reliabilityLabel}</span>
        <div style={{flex:1,height:5,borderRadius:3,background:"var(--sg-border,rgba(0,0,0,.08))",overflow:"hidden"}}>
          <div style={{width:`${barPct}%`,height:"100%",borderRadius:3,
            background:`linear-gradient(90deg,${levelColor},${levelColor}cc)`,
            transition:"width .8s cubic-bezier(.22,1,.36,1)",boxShadow:`0 0 8px ${levelColor}66`}}/>
        </div>
        <button onClick={()=>setShowTip(!showTip)} style={{
          background:"none",border:"none",cursor:"pointer",padding:0,
          fontSize:10,fontWeight:800,color:levelColor,display:"flex",alignItems:"center",gap:3,
          fontFamily:"inherit"}}>
          {levelLabel}
          <span style={{fontSize:9,opacity:.6}}>ⓘ</span>
        </button>
      </div>
      {showTip&&(
        <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginBottom:6,lineHeight:1.5,
          padding:"8px 10px",borderRadius:8,background:"var(--sg-card,#fff)",
          animation:"slideUp .25s cubic-bezier(.22,1,.36,1)"}}>
          {levelDesc}
          <div style={{marginTop:4,opacity:.7,fontSize:10}}>{_t(lang,"Méthode","Method","Método")} · {methodLabel}</div>
        </div>
      )}
      <div style={{fontSize:9.5,color:"var(--sg-mid,#999)",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
        <span>🛰️</span>
        <span style={{fontWeight:700}}>Copernicus OLCI</span>
        {dateStr&&<><span style={{opacity:.4}}>·</span><span>{dateStr}</span></>}
        <span style={{opacity:.4}}>·</span>
        <span>{methodLabel}</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCIENTIFIC FOOTER — floating on map view
   ═══════════════════════════════════════════════════════════════════════════ */
function SciFooter({lang}){
  const LL=T[lang]||T.fr
  return(
    <div style={{
      position:"fixed",bottom:68,left:"50%",transform:"translateX(-50%)",
      zIndex:699,maxWidth:560,width:"calc(100% - 32px)",
      padding:"6px 14px",borderRadius:100,
      background:"var(--sg-glass,rgba(255,255,255,.82))",
      backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
      border:"1px solid var(--sg-glassBorder,rgba(0,0,0,.04))",
      textAlign:"center",
      fontSize:9,color:"var(--sg-mid,#686868)",letterSpacing:".02em",lineHeight:1.5,
    }}>
      <span style={{display:"inline-flex",alignItems:"center",gap:6}}><BrandIcon name="satellite" size={14}/>{LL.sciFooter}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEARN VIEW — Educational section with wow design
   ═══════════════════════════════════════════════════════════════════════════ */
function LearnCard({icon,title,children,delay=0,accent=C.teal}){
  return(
    <SectionReveal delay={delay}>
      <div style={{background:"var(--sg-card,#fff)",borderRadius:20,
        border:"1px solid var(--sg-border,rgba(0,0,0,.06))",
        boxShadow:"0 4px 24px rgba(0,0,0,.06),0 1px 3px rgba(0,0,0,.04)",
        padding:"22px 20px",marginBottom:14,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,
          background:`linear-gradient(90deg,${accent},${accent}00)`}}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:44,height:44,borderRadius:14,
            background:`linear-gradient(135deg,${accent}20,${accent}08)`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
            border:`1px solid ${accent}20`}}>{icon}</div>
          <h3 style={{margin:0,fontSize:17,fontWeight:800,color:"var(--sg-ink,#0D0D0D)",fontFamily:"inherit",letterSpacing:"-.01em"}}>{title}</h3>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {children}
        </div>
      </div>
    </SectionReveal>
  )
}

function LearnParagraph({text,accent}){
  const dashIdx=text.indexOf(" — ")
  if(dashIdx>0&&dashIdx<40){
    const label=text.slice(0,dashIdx)
    const rest=text.slice(dashIdx+3)
    return(
      <p style={{margin:0,fontSize:13.5,lineHeight:1.65,color:"var(--sg-mid,#686868)"}}>
        <span style={{fontWeight:800,color:accent||"var(--sg-ink,#0D0D0D)"}}>{label}</span>
        <span style={{opacity:.4,margin:"0 4px"}}>·</span>
        {rest}
      </p>
    )
  }
  return <p style={{margin:0,fontSize:13.5,lineHeight:1.65,color:"var(--sg-mid,#686868)"}}>{text}</p>
}

function LearnView({lang,onBack,onGoMap}){
  const LL=T[lang]||T.fr
  return(
    <div className="view-enter" style={{position:"absolute",inset:0,zIndex:750,
      background:"var(--sg-bg,#FDFCF7)",overflowY:"auto",
      WebkitOverflowScrolling:"touch"}}>
      {/* Ambient gradient glow */}
      <div style={{position:"absolute",top:-80,left:"50%",transform:"translateX(-50%)",
        width:420,height:420,borderRadius:"50%",
        background:`radial-gradient(circle,${C.teal}18 0%,${C.teal}00 60%)`,
        pointerEvents:"none",filter:"blur(20px)"}}/>
      {/* Floating particles */}
      <div style={{position:"absolute",top:60,left:"20%",fontSize:20,opacity:.15,
        animation:"floatParticle 8s ease-in-out infinite",pointerEvents:"none"}}>🌊</div>
      <div style={{position:"absolute",top:120,right:"15%",fontSize:16,opacity:.12,
        animation:"floatParticle 10s ease-in-out infinite .5s",pointerEvents:"none"}}>🌿</div>

      <div style={{maxWidth:600,margin:"0 auto",position:"relative",
        padding:"max(16px,env(safe-area-inset-top)) 16px 110px"}}>

        {/* Header bar */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <button aria-label={LL.learnBack} onClick={onBack} style={{
            width:44,height:44,borderRadius:14,border:"1px solid var(--sg-border,rgba(0,0,0,.08))",
            background:"var(--sg-card,#fff)",cursor:"pointer",fontSize:20,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 2px 12px rgba(0,0,0,.06)",color:"var(--sg-ink,#0D0D0D)",fontFamily:"inherit",
          }}>←</button>
        </div>

        {/* Hero headline */}
        <SectionReveal>
          <div style={{marginBottom:28,position:"relative"}}>
            <div style={{display:"inline-block",fontSize:10,fontWeight:800,
              color:C.teal,letterSpacing:".12em",textTransform:"uppercase",
              padding:"4px 10px",borderRadius:100,
              background:`${C.teal}12`,border:`1px solid ${C.teal}22`,marginBottom:12}}>
              🔬 {LL.learnHeroSub}
            </div>
            <h1 className="anton" style={{margin:0,fontSize:"clamp(28px,7vw,38px)",
              fontWeight:900,color:"var(--sg-ink,#0D0D0D)",lineHeight:1.05,letterSpacing:"-.02em"}}>
              {LL.learnHero}
            </h1>
          </div>
        </SectionReveal>

        {/* Section 1 */}
        <LearnCard icon="🌿" title={LL.learnS1Title} delay={0} accent={C.teal}>
          <LearnParagraph text={LL.learnS1P1}/>
          <LearnParagraph text={LL.learnS1P2}/>
          <LearnParagraph text={LL.learnS1P3}/>
        </LearnCard>

        {/* Section 2 */}
        <LearnCard icon="🌊" title={LL.learnS2Title} delay={.05} accent={C.ocean}>
          <LearnParagraph text={LL.learnS2P1} accent={C.sargL}/>
          <LearnParagraph text={LL.learnS2P2} accent={C.red}/>
          <LearnParagraph text={LL.learnS2P3} accent={C.ocean}/>
          <LearnParagraph text={LL.learnS2P4} accent={C.amber}/>
        </LearnCard>

        {/* Section 3 */}
        <LearnCard icon="⚠️" title={LL.learnS3Title} delay={.1} accent={C.red}>
          <LearnParagraph text={LL.learnS3Eco} accent={C.green}/>
          <LearnParagraph text={LL.learnS3Health} accent={C.red}/>
          <LearnParagraph text={LL.learnS3Econ} accent={C.amber}/>
        </LearnCard>

        {/* Section 4 — the credibility moment */}
        <LearnCard icon="🛰️" title={LL.learnS4Title} delay={.15} accent={C.gold}>
          <LearnParagraph text={LL.learnS4P1}/>
          <LearnParagraph text={LL.learnS4P2}/>
          <LearnParagraph text={LL.learnS4P3}/>
          <p style={{margin:0,fontSize:11,lineHeight:1.6,color:"var(--sg-mute,#999)",
            fontStyle:"italic",paddingTop:10,borderTop:"1px solid var(--sg-border,rgba(0,0,0,.06))"}}>
            {LL.learnS4Sources}
          </p>
        </LearnCard>

        {/* CTA back to map — the tunnel moment */}
        <SectionReveal delay={.2}>
          <button onClick={onGoMap} className="gbtn" style={{width:"100%",marginTop:8,padding:"18px 28px",fontSize:15}}>
            🗺️ {LL.learnCta} →
          </button>
        </SectionReveal>

      </div>
    </div>
  )
}

function BottomNav({view,onChangeView,lang}){
  const LL=T[lang]||T.fr
  // Le jeu reste un EASTER EGG (toast d'inactivité), jamais un onglet de menu
  // (directive user 14/06 : « j'aimais bien le jeu en petit easter egg pas en menu »).
  const tabs=[
    {id:"map",label:LL.navMap,icon:"🗺️"},
    {id:"list",label:LL.navList,icon:"📋"},
    {id:"premium",label:LL.navPremium,icon:"⭐"},
  ]
  return(
    <nav className="sg-bottom-nav" style={{
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
          fontSize:11,fontWeight:active?700:500,fontFamily:"inherit",
          transition:"all .2s",padding:"6px 20px",position:"relative",
          minHeight:44,justifyContent:"center",
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
  // free1 A/B test ended: control (1 free day) 3.29% vs two_free 2.99% — 1 free day wins.
  const freeThreshold=1
  const lockedCount=visibleDays-freeThreshold
  // lock1 A/B test ended: control (simple CTA) 3.66% vs loss framing 2.35% — simple CTA wins.
  const inSeason=SARGASSES_SEASON==="high"
  const lockCTA=_t(lang,"Débloquer","Unlock forecast","Desbloquear")
  const lockSub=NO_TRIAL
    ?_t(lang,"+ brief matin & alertes","+ morning brief & alerts","+ brief matutino y alertas")
    :_t(lang,"+ brief matin & alertes · 7j gratuit","+ morning brief & alerts · 7 days free","+ brief matutino y alertas · 7 días gratis")
  const firstConf=visible[1]?.confidence||40
  // Compute locked-day status colors for teaser strip
  const lockedDays=!isPremium&&lockedCount>0?visible.slice(freeThreshold):[]
  return(
    <>
    <div style={{position:"relative"}}>
      <div style={{display:"flex",gap:8,alignItems:"flex-end",height:152,padding:"10px 0 4px"}}>
        {visible.map((d,i)=>{
          const h=Math.max(10,(d.afai/max)*74)
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
          const typeOpacity=fType==="observation"?1:fType==="tendance"?.9:.6
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              filter:isLocked?"blur(2px)":"none",opacity:isLocked?0.55:typeOpacity,
              pointerEvents:isLocked?"none":"auto"}}>
              {wxIcon&&<span style={{fontSize:13,lineHeight:1}}>{wxIcon}</span>}
              {dayTemp!=null&&<span style={{fontSize:9,fontWeight:700,color:"var(--sg-mid,#686868)",
                letterSpacing:".01em"}}>{dayTemp}°</span>}
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,lineHeight:1,
                letterSpacing:"-.01em",color:st.c}}>
                {Math.round(d.afai*100)}%
              </span>
              <div className="fc-bar" style={{width:"100%",height:h,
                background:`linear-gradient(180deg, ${st.c}, ${st.c}cc)`,
                borderRadius:"6px 6px 2px 2px",
                boxShadow:`0 -4px 14px -6px ${st.c}88, inset 0 1px 0 rgba(255,255,255,.3)`}}/>
              <span className="anton" style={{fontSize:11,lineHeight:1,letterSpacing:".02em",
                color:"var(--sg-mid,#686868)",textTransform:"uppercase",marginTop:2}}>
                {fcDay(d,lang)}
              </span>
              {fConf!=null&&!isLocked&&<span style={{fontSize:8,color:"var(--sg-mid,#999)",fontWeight:600}}>{fConf}%</span>}
            </div>
          )
        })}
      </div>
      <div style={{fontSize:9,color:"var(--sg-mid,#999)",textAlign:"center",padding:"4px 0 0",lineHeight:1.3}}>
        {_t(lang,
          `Fiable jusqu'à 4 jours. Fiabilité ${Math.round(firstConf)} % demain.`,
          `Reliable up to 4 days. ${Math.round(firstConf)}% confidence tomorrow.`,
          `Confiable hasta 4 días. ${Math.round(firstConf)}% de confianza mañana.`)}
      </div>
      {!isPremium&&lockedCount>0&&<div onClick={()=>{track("sg_forecast_lock_click",{variant:"control"});onPremiumClick("forecast")}}
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
    {/* Locked-days teaser strip — outside the chart overlay so always visible */}
    {lockedDays.length>0&&(
      <div onClick={()=>{track("sg_forecast_lock_click",{variant:"strip"});onPremiumClick("forecast")}}
        style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"9px 12px",
        background:"rgba(0,0,0,.04)",borderRadius:10,cursor:"pointer",border:"1px solid rgba(0,0,0,.06)"}}>
        <span style={{fontSize:10,color:"var(--sg-mid,#999)",fontWeight:600,flexShrink:0}}>
          {_t(lang,"Jours suivants :","Next days:","Próximos días:")}
        </span>
        <div style={{display:"flex",gap:6,flex:1}}>
          {lockedDays.map((d,i)=>{
            const st=ST[d.status]||ST._loading
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:3,filter:"blur(3px)",opacity:.65,pointerEvents:"none"}}>
                <div style={{width:7,height:7,borderRadius:2,background:st.c,flexShrink:0}}/>
                <span style={{fontSize:9,fontWeight:700,color:st.c}}>{fcDay(d,lang)}</span>
              </div>
            )
          })}
        </div>
        <span style={{fontSize:10,fontWeight:700,color:"var(--sg-mid,#686868)",flexShrink:0}}>
          {_t(lang,"Voir →","Unlock →","Ver →")}
        </span>
      </div>
    )}
    </>
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
    const tz=IS_NEW_REGION?(REGION.timezone||"America/Martinique"):"America/Martinique"
    const weatherUrl=`https://api.open-meteo.com/v1/forecast?latitude=${beach.lat}&longitude=${beach.lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index,precipitation&daily=temperature_2m_max,precipitation_sum,cloud_cover_mean,wind_speed_10m_max&timezone=${tz}`
    const marineUrl=`https://marine-api.open-meteo.com/v1/marine?latitude=${beach.lat}&longitude=${beach.lng}&current=wave_height,wave_direction,swell_wave_height&timezone=${tz}`
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
    {id:"clean",e:"✅",l:"Propre",le:"Clean",les:"Limpia",c:C.green,bg:C.greenBg},
    {id:"moderate",e:"⚠️",l:"Modéré",le:"Moderate",les:"Moderado",c:C.amber,bg:C.amberBg},
    {id:"avoid",e:"🚫",l:"Beaucoup",le:"Heavy",les:"Mucho",c:C.red,bg:C.redBg},
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
        {_t(lang,"Sur place ? Signale le niveau de sargasses","On the beach? Report sargassum level","¿Estás en la playa? Reporta el nivel de sargazo")}
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
          }}>{lv.e} {lang==="es"?lv.les:lang==="en"?lv.le:lv.l}</button>
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
            {counts.rawTotal||Math.round(total)} {lang==="es"?"reporte"+((counts.rawTotal||total)>1?"s":""):lang==="en"?"report"+((counts.rawTotal||total)>1?"s":""):"signalement"+((counts.rawTotal||total)>1?"s":"")}
            {counts.trend&&counts.trend!=="stable"&&<span style={{marginLeft:4,color:counts.trend==="worsening"?C.red:C.green}}>
              {counts.trend==="worsening"?"↗":"↘"}</span>}
            {consensus&&<> · {_t(lang,"Consensus : ","Consensus: ","Consenso: ")}<span style={{fontWeight:700,color:ST[consensus].c}}>{ST[consensus].e} {lang==="es"?ST[consensus].les:lang==="en"?ST[consensus].le:ST[consensus].l}</span></>}
          </div>
        </div>
      )}
      {voted&&<div style={{marginTop:6,fontSize:11,color:C.green,textAlign:"center",fontWeight:500}}>
        {_t(lang,"Merci pour ton signalement !","Thanks for your report!","¡Gracias por tu reporte!")}
      </div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FB POSTS STRIP — real visitor photos + quotes from public FB groups
   Displayed inside the beach sheet when fbPosts has entries for this beach.
   Hotlinks scontent CDN photos (legal: we don't re-host).
   ═══════════════════════════════════════════════════════════════════════════ */
function FbPostsStrip({beach,fbPosts,lang}){
  const posts=fbPosts?.[beach?.id]||fbPosts?.[BEACH_TO_SARG?.[beach?.id]]||[]
  if(!posts.length)return null
  const statusEmoji=(s)=>s==="avoid"?"🚫":s==="moderate"?"⚠️":s==="clean"?"✅":"💬"
  const timeAgo=(iso)=>{
    try{
      const d=Math.max(0,Date.now()-new Date(iso).getTime())
      const h=Math.round(d/3600000)
      if(h<1)return _t(lang,"à l'instant","just now","ahora")
      if(h<24)return _t(lang,`il y a ${h}h`,`${h}h ago`,`hace ${h}h`)
      const days=Math.round(h/24)
      return _t(lang,`il y a ${days}j`,`${days}d ago`,`hace ${days}d`)
    }catch{return""}
  }
  return(
    <div style={{margin:"14px 0 4px",padding:"12px 14px",borderRadius:14,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
        <span>📷</span>
        {lang==="es"?`${posts.length} reporte${posts.length>1?"s":""} reciente${posts.length>1?"s":""} de visitantes (Facebook)`:lang==="en"?`${posts.length} recent visitor ${posts.length>1?"reports":"report"} (Facebook)`:`${posts.length} retour${posts.length>1?"s":""} visiteur${posts.length>1?"s":""} récent${posts.length>1?"s":""} (Facebook)`}
      </div>
      {posts.map((p,i)=>(
        <div key={i} style={{marginBottom:i<posts.length-1?14:0,paddingBottom:i<posts.length-1?14:0,
          borderBottom:i<posts.length-1?"1px solid var(--sg-border,rgba(0,0,0,.05))":"none"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}>
            <span style={{fontSize:18,lineHeight:1}}>{statusEmoji(p.inferredStatus)}</span>
            <span style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)"}}>{p.author}</span>
            <span style={{fontSize:11,color:"var(--sg-mid)"}}>{timeAgo(p.scrapedAt)}</span>
          </div>
          {p.text&&(
            <div style={{fontSize:12,lineHeight:1.45,color:"var(--sg-ink)",marginBottom:p.photos?.length||p.commentSample?8:4}}>
              "{p.text}"{p.textTruncated?"…":""}
            </div>
          )}
          {p.photos&&p.photos.length>0&&(
            <div style={{display:"flex",gap:6,marginBottom:p.commentSample?8:4,overflowX:"auto",scrollbarWidth:"thin"}}>
              {p.photos.slice(0,6).map((url,j)=>(
                <a key={j} href={p.sourceUrl} target="_blank" rel="noopener nofollow" style={{flexShrink:0,lineHeight:0}}>
                  <img src={url} alt={`Photo ${j+1}`} loading="lazy" referrerPolicy="no-referrer"
                    style={{width:96,height:72,objectFit:"cover",borderRadius:8,
                      border:"1px solid var(--sg-border,rgba(0,0,0,.06))",
                      cursor:"pointer",transition:"transform .15s"}}
                    onError={(e)=>{e.target.parentNode.style.display="none"}}/>
                </a>
              ))}
            </div>
          )}
          {p.commentSample&&(
            <div style={{fontSize:11,color:"var(--sg-mid)",lineHeight:1.4,paddingLeft:10,borderLeft:"2px solid rgba(0,0,0,.08)"}}>
              💬 {p.commentSample}{p.commentCount>1?` · +${p.commentCount-1} ${_t(lang,"autres","more","más")}`:""}
            </div>
          )}
          <a href={p.sourceUrl} target="_blank" rel="noopener nofollow" style={{
            display:"inline-block",marginTop:6,fontSize:10,color:"var(--sg-mid)",textDecoration:"none",
            borderBottom:"1px dashed rgba(0,0,0,.15)"}}>
            {_t(lang,"voir sur Facebook →","view on Facebook →","ver en Facebook →")}
          </a>
        </div>
      ))}
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
    const month=new Date().toLocaleString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{month:"long"})
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
          {_t(lang,`Propre ${stats.pct}% du temps`,`Clean ${stats.pct}% of the time`,`Limpia el ${stats.pct}% del tiempo`)}
        </div>
        <div style={{fontSize:10,color:"var(--sg-mid)"}}>
          {_t(lang,`${stats.total} mesures en ${stats.month}`,`Based on ${stats.total} readings in ${stats.month}`,`${stats.total} mediciones en ${stats.month}`)}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOTTOM SHEET — beach detail with photo, forecast, weather, nearby
   ═══════════════════════════════════════════════════════════════════════════ */
function BeachSheet({beach,onClose,favorites,onToggleFav,lang,allBeaches,imageMap,onBeachClick,onPremiumClick,isPremium,historyData,sargData,dataSource,userPos,communityReports,fbPosts}){
  const LL=T[lang]||T.fr
  const weather=useWeather(beach)
  // Use REAL forecast, then interpolated, then fallback generated
  // If community reports override status, blend into forecast
  const weeklyData=useMemo(()=>{
    if(!beach||!sargData)return null
    // Nouvelles régions : weekly{} de la pipeline est keyé par l'id de plage
    // (pc001…) directement — BEACH_TO_SARG ne couvre que les 20 slugs MQ/GP.
    const sargId=IS_NEW_REGION?beach.id:BEACH_TO_SARG[beach.id]
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
  const [scoreOpen,setScoreOpen]=useState(false)
  const [photoScanOpen,setPhotoScanOpen]=useState(false)
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
    if(dy>60)requestClose()
    else if(sheetRef.current){sheetRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";sheetRef.current.style.transform="";setTimeout(()=>{if(sheetRef.current)sheetRef.current.style.transition=""},300)}
  }

  // Fermeture SYMÉTRIQUE de l'ouverture (audit fluidité 2026-06-11) : la sheet
  // glisse vers le bas + le backdrop fond, PUIS on démonte. L'animation .sheet-exit
  // (to{translateY(100%)}) part de l'état courant — y compris mi-swipe.
  const backdropRef=useRef(null)
  const closingRef=useRef(false)
  const requestClose=()=>{
    if(closingRef.current)return
    closingRef.current=true
    try{
      sheetRef.current&&sheetRef.current.classList.add("sheet-exit")
      backdropRef.current&&backdropRef.current.classList.add("backdrop-exit")
    }catch(_){}
    setTimeout(()=>{closingRef.current=false;onClose()},260)
  }

  // Escape key to close
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")requestClose()}
    document.addEventListener("keydown",h)
    return()=>document.removeEventListener("keydown",h)
  },[onClose])

  const wazeUrl=`https://waze.com/ul?ll=${beach.lat},${beach.lng}&navigate=yes`

  return(
    <>
      {/* Pass-through pin : si le tap tombe pile sur une pastille visible dans la
          bande de carte au-dessus de la fiche, on SWITCHE de plage au lieu de
          fermer — sinon le clic paraît « mort » (rapport user 2026-06-12).
          elementsFromPoint AVANT fermeture (voit sous le backdrop) ; fermeture
          sèche via onClose (le requestClose animé garderait un timer 260 ms qui
          refermerait la NOUVELLE fiche). */}
      <div className="backdrop" ref={backdropRef} onClick={(e)=>{
        const x=e.clientX,y=e.clientY
        let pin=null
        try{pin=document.elementsFromPoint(x,y).find(el=>el.classList&&el.classList.contains("leaflet-marker-icon"))}catch(_){}
        if(pin){
          track("sg_sheet_pin_switch",{})
          onClose()
          // Re-localiser le pin AU MOMENT du dispatch : la fermeture change
          // selectedBeach → les markers sont RECONSTRUITS (garde par signature)
          // → le nœud capturé ci-dessus est détaché. Boucle de frames le temps
          // que le backdrop démonte + que les markers réapparaissent.
          let tries=0
          const fire=()=>{try{
            const el=document.elementFromPoint(x,y)
            const p2=el&&el.closest&&el.closest(".leaflet-marker-icon")
            if(p2){p2.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y}));return}
            if(++tries<8)requestAnimationFrame(fire)
          }catch(_){}}
          requestAnimationFrame(fire)
          return
        }
        requestClose()
      }}/>
      <div className="sheet" ref={sheetRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet-handle"/>

        {/* Photo hero — immersive, tap to scan */}
        <div onClick={e=>{if(!e.target.closest("button")){setPhotoScanOpen(v=>!v);track("sg_photo_scan",{beach_id:beach.id,open:!photoScanOpen})}}}
          style={{height:"min(300px, 38vh)",background:`url(${bgImage}) center 40%/cover`,
          borderRadius:"0",position:"relative",overflow:"hidden",cursor:"pointer"}}>
          {/* Cinematic gradient overlay */}
          <div style={{position:"absolute",inset:0,
            background:"linear-gradient(180deg, rgba(0,0,0,.15) 0%, transparent 30%, transparent 50%, var(--sg-card,#fff) 100%)"}}/>
          {/* Status glow — colored ambient light based on beach status */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",
            background:`radial-gradient(ellipse at 50% 100%, ${(ST[beach.status]||ST._loading).c}22 0%, transparent 70%)`,
            pointerEvents:"none"}}/>
          {/* voile golden-hour sur la photo — rai de soleil + éclats (1er pas vers
              la fiche refaite "comme l'accueil" ; additif, mix-blend screen) */}
          <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",mixBlendMode:"screen",opacity:.42}}>
            <defs><linearGradient id={`bsray-${beach.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE6A0" stopOpacity=".55"/><stop offset="1" stopColor="#FFE6A0" stopOpacity="0"/></linearGradient></defs>
            <polygon points="296,-30 342,-30 248,300 172,300" fill={`url(#bsray-${beach.id})`}/>
            <g stroke="#FFD884" strokeLinecap="round"><line x1="0" y1="196" x2="400" y2="196" strokeWidth="1.6" strokeDasharray="3 17" opacity=".4"/><line x1="0" y1="226" x2="400" y2="226" strokeWidth="1.3" strokeDasharray="2 22" opacity=".28"/></g>
          </svg>
          {/* Close button */}
          <button onClick={requestClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"absolute",top:12,right:12,
            width:44,height:44,borderRadius:22,
            background:"rgba(0,0,0,.3)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,.15)",color:"#fff",fontSize:16,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          {/* Fav button on photo */}
          <button onClick={e=>{onToggleFav(beach.id);e.currentTarget.classList.remove("heart-pop");void e.currentTarget.offsetWidth;e.currentTarget.classList.add("heart-pop")}}
            aria-label={isFav?_t(lang,"Retirer des favoris","Remove from favourites","Quitar de favoritos"):_t(lang,"Ajouter aux favoris","Add to favourites","Agregar a favoritos")}
            style={{position:"absolute",top:12,left:12,
              width:44,height:44,borderRadius:22,
              background:isFav?"rgba(232,82,42,.2)":"rgba(0,0,0,.3)",
              backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
              border:isFav?"1px solid rgba(232,82,42,.4)":"1px solid rgba(255,255,255,.15)",
              color:"#fff",fontSize:18,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all .3s cubic-bezier(.22,1,.36,1)",
            }}>{isFav?"❤️":"🤍"}</button>
          {/* Floating status pill on photo */}
          <div style={{position:"absolute",bottom:60,left:20,
            display:"flex",alignItems:"center",gap:8,
            padding:"6px 14px 6px 10px",borderRadius:100,
            background:"rgba(0,0,0,.35)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,.12)"}}>
            <span style={{width:10,height:10,borderRadius:5,
              background:(ST[beach.status]||ST._loading).c,
              boxShadow:`0 0 8px ${(ST[beach.status]||ST._loading).c}`,
              animation:beach.status==="clean"?"none":"pulse 2s ease-in-out infinite"}}/>
            <span style={{fontSize:13,fontWeight:700,color:"#fff",letterSpacing:".01em"}}>
              {lang==="es"?(ST[beach.status]||ST._loading).les:lang==="en"?(ST[beach.status]||ST._loading).le:(ST[beach.status]||ST._loading).l}
            </span>
          </div>
          {/* Tap-to-scan HUD overlay */}
          {photoScanOpen&&<BeachPhotoScan beach={beach} lang={lang}/>}
          {/* Scan hint (when overlay closed) */}
          {!photoScanOpen&&<div style={{position:"absolute",bottom:14,right:14,
            display:"flex",alignItems:"center",gap:4,opacity:.55,pointerEvents:"none"}}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="6" r="4.5" stroke="#4ECDC4" strokeWidth="1"/>
              <line x1="6" y1="1.5" x2="6" y2="3" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
              <line x1="6" y1="9" x2="6" y2="10.5" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
              <line x1="1.5" y1="6" x2="3" y2="6" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
              <line x1="9" y1="6" x2="10.5" y2="6" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            <span style={{fontSize:9,color:"#4ECDC4",fontWeight:700,letterSpacing:".08em"}}>
              {lang==="en"?"SCAN":lang==="es"?"ESCANEAR":"ANALYSER"}
            </span>
          </div>}
        </div>

        <style>{`@keyframes bsRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.bs-reveal>*{animation:bsRise .5s cubic-bezier(.22,.61,.36,1) both}
.bs-reveal>*:nth-child(1){animation-delay:.02s}.bs-reveal>*:nth-child(2){animation-delay:.09s}.bs-reveal>*:nth-child(3){animation-delay:.16s}.bs-reveal>*:nth-child(4){animation-delay:.23s}.bs-reveal>*:nth-child(5){animation-delay:.3s}.bs-reveal>*:nth-child(6){animation-delay:.37s}.bs-reveal>*:nth-child(n+7){animation-delay:.44s}
.bs-glint{animation:bsGlint 5.5s linear infinite}@keyframes bsGlint{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.bs-reveal>*,.bs-glint{animation:none}}`}</style>
        <div className="bs-reveal" style={{padding:"0 20px calc(70px + env(safe-area-inset-bottom,12px))"}}>
          {/* Name — large, no duplicate status badge (already on photo) */}
          <h2 className="anton" style={{fontSize:"clamp(24px,6vw,30px)",margin:"0 0 4px",lineHeight:1.15,
            color:"var(--sg-ink)"}}>{beach.name}</h2>
          <p style={{fontSize:13,color:"var(--sg-mid,#686868)",margin:"0 0 12px",
            display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span>{beach.commune}</span>
            {typeof beach.drive==="number"&&<>
              <span style={{width:3,height:3,borderRadius:2,background:"var(--sg-mid,#999)",opacity:.5}}/>
              <span>{beach.drive} {LL.drive}</span>
            </>}
            {userPos&&beach.lat&&<>
              <span style={{width:3,height:3,borderRadius:2,background:"var(--sg-mid,#999)",opacity:.5}}/>
              <span>{Math.round(haversine(userPos.lat,userPos.lng,beach.lat,beach.lng))} km</span>
            </>}
          </p>

          {/* v3.1 Beach Score 0-100 — editorial aurora card echoing the home hero */}
          {typeof beach.score==="number"&&(
            <div style={{position:"relative",margin:"4px 0 14px"}}>
              <div aria-hidden="true" style={{position:"absolute",inset:-4,borderRadius:22,
                background:`radial-gradient(120% 100% at 0% 0%, ${beach.scoreColor}1f 0%, transparent 60%)`,
                filter:"blur(8px)",pointerEvents:"none"}}/>
              <div style={{position:"relative",display:"flex",alignItems:"center",gap:16,
                padding:"14px 16px",borderRadius:18,
                background:"linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.55))",
                backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",
                border:`1px solid ${beach.scoreColor}22`,
                boxShadow:`0 14px 34px -16px ${beach.scoreColor}3a, inset 0 1px 0 rgba(255,255,255,.5)`}}>
                <div role="button" aria-label={_t(lang,"Comprendre ce score","Understand this score","Entender este puntaje")}
                  onClick={()=>{setScoreOpen(v=>!v);track("sg_score_learn",{beach_id:beach.id,open:!scoreOpen})}}
                  style={{position:"relative",width:80,height:80,flexShrink:0,cursor:"pointer"}}>
                  <div aria-hidden="true" style={{position:"absolute",inset:-8,borderRadius:"50%",
                    background:`radial-gradient(closest-side, ${beach.scoreColor}2b, transparent 72%)`,
                    filter:"blur(2px)",pointerEvents:"none"}}/>
                  <div style={{position:"absolute",inset:4,borderRadius:"50%",
                    background:`conic-gradient(${beach.scoreColor} ${beach.score*3.6}deg, rgba(15,42,58,.06) ${beach.score*3.6}deg)`,
                    boxShadow:`inset 0 0 0 1px ${beach.scoreColor}22`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:60,height:60,borderRadius:"50%",
                      background:"linear-gradient(180deg,#fff,#FDFCF7)",
                      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                      boxShadow:"inset 0 1px 0 rgba(255,255,255,.9), 0 1px 4px rgba(15,42,58,.08)"}}>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:30,lineHeight:.95,
                        letterSpacing:"-.02em",color:beach.scoreColor}}>
                        {beach.score}
                      </span>
                      <span style={{fontSize:8,fontWeight:800,color:"var(--sg-mid,#686868)",
                        letterSpacing:".08em",marginTop:1}}>/100</span>
                    </div>
                  </div>
                  <div aria-hidden className="bs-glint" style={{position:"absolute",inset:4,borderRadius:"50%",pointerEvents:"none"}}>
                    <span style={{position:"absolute",top:-2,left:"50%",width:7,height:7,marginLeft:-3.5,borderRadius:"50%",background:"#fff",boxShadow:`0 0 7px 1px ${beach.scoreColor}`,opacity:.85}}/>
                  </div>
                  <div style={{position:"absolute",top:-2,right:-2,width:18,height:18,borderRadius:"50%",
                    background:beach.scoreColor,color:"#fff",fontSize:10,fontWeight:800,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}>{scoreOpen?"×":"?"}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="anton" style={{fontSize:21,lineHeight:1.05,color:beach.scoreColor,
                    letterSpacing:"-.015em",textTransform:"uppercase"}}>
                    {scoreLabelFor(beach.scoreLabel,lang)}
                  </div>
                  <div style={{fontSize:12,color:"var(--sg-mid,#686868)",marginTop:5,lineHeight:1.4}}>
                    {beach.scoreReason}
                  </div>
                  {((beach.scoreStrengths?.length||0)+(beach.scoreWeaknesses?.length||0))>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:8}}>
                      {(beach.scoreStrengths||[]).slice(0,3).map((s,i)=>(
                        <span key={`s${i}`} style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:100,
                          background:"rgba(34,197,94,.14)",color:"#16A34A",whiteSpace:"nowrap",letterSpacing:".01em"}}>
                          ✓ {s}
                        </span>
                      ))}
                      {(beach.scoreWeaknesses||[]).slice(0,2).map((w,i)=>(
                        <span key={`w${i}`} style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:100,
                          background:"rgba(224,120,0,.14)",color:"#E07800",whiteSpace:"nowrap",letterSpacing:".01em"}}>
                          ⚠ {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {scoreOpen&&<ScoreReveal beach={beach} lang={lang}/>}

          {/* Verdict line — glanceable "can I go today?" answer (design-scout 2026-04-12) */}
          {ST[beach.status]&&(() => {
            const verdictKey = beach.status==="clean"?"verdictGo":beach.status==="moderate"?"verdictModerate":beach.status==="avoid"?"verdictAvoid":"verdictUnknown"
            const verdictText = LL[verdictKey]||LL.verdictUnknown
            const verdictColor = ST[beach.status].c
            return (
              <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 14px"}}>
                <span aria-hidden="true" style={{width:4,height:24,borderRadius:2,background:verdictColor,flexShrink:0}}/>
                <span className="anton" style={{fontSize:"clamp(18px,4.6vw,22px)",lineHeight:1.1,color:verdictColor,letterSpacing:"-.01em",textTransform:"uppercase"}}>
                  {verdictText}
                </span>
              </div>
            )
          })()}
          <AfaiChip beach={beach} lang={lang}/>

          {/* Urgence-donnée : arrivage RÉEL prévu (weeklyData.forecast pipeline,
              JAMAIS le fallback generateForecast) → CTA alerte. L'urgence vraie
              est notre droit : c'est de l'info satellite, pas de la pression
              (anti-pattern Booking, engagements UE 2020 — capture_intelligence). */}
          {!isPremium&&(()=>{
            const fc=weeklyData?.forecast
            const RANK={clean:0,moderate:1,avoid:2}
            let hit=null
            if(fc&&fc.length>=2){
              const today=RANK[fc[0]?.status]??RANK[beach.status]??0
              for(let i=1;i<=3&&i<fc.length;i++){const r=RANK[fc[i]?.status];if(r!=null&&r>today){hit={i,d:fc[i]};break}}
            }
            const when=hit?(hit.i===1?_t(lang,"demain","tomorrow","mañana")
              :(()=>{try{return new Date((hit.d.date||"")+"T12:00:00Z").toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long"})}catch(_){return null}})()):null
            // Pas de dégradation prévue → capture email click-triggered (jamais
            // les deux bandeaux empilés : un seul message sous le verdict).
            if(!hit||!when)return <AlertCapture beach={beach} lang={lang}/>
            const worse=hit.d.status==="avoid"
            return(
              <button onClick={()=>{track("sg_urgency_banner_cta",{beach_id:beach.id,day:hit.i,to:hit.d.status});onPremiumClick("urgency_banner")}}
                style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",cursor:"pointer",
                  background:worse?"rgba(232,82,42,.10)":"rgba(224,120,0,.10)",
                  border:`1px solid ${worse?"rgba(232,82,42,.35)":"rgba(224,120,0,.35)"}`,
                  borderRadius:14,padding:"11px 13px",margin:"0 0 14px",fontFamily:"inherit"}}>
                <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
                <span style={{flex:1,minWidth:0,fontSize:12.5,lineHeight:1.45,color:"var(--sg-ink,#1A2B26)",fontWeight:600}}>
                  {_t(lang,
                    `Arrivage prévu ${when} sur cette plage (satellite). Sois prévenu si ça change.`,
                    `Sargassum forecast to arrive ${when} at this beach (satellite). Get notified if it changes.`,
                    `Llegada prevista ${when} en esta playa (satélite). Recibe el aviso si cambia.`)}
                </span>
                <span style={{flexShrink:0,fontSize:12,fontWeight:800,color:worse?"#E8522A":"#E07800"}}>
                  {_t(lang,"Activer l'alerte →","Set the alert →","Activar alerta →")}
                </span>
              </button>
            )
          })()}

          {/* Status description */}
          {ST[beach.status]&&(
            <p style={{fontSize:12,color:beach._communityOverride?C.gold:beach.beachMemory?C.sarg:ST[beach.status].c,fontWeight:500,margin:"0 0 12px",lineHeight:1.5,
              padding:"6px 10px",background:beach._communityOverride?C.goldBg:beach.beachMemory?C.sargBg:ST[beach.status].bg,borderRadius:8}}>
              {beach._communityOverride
                ?_t(lang,
                  `${beach._communityTotal} visiteurs signalent ce niveau sur place. Les signalements terrain priment sur les données satellite.`,
                  `${beach._communityTotal} visitors report this level on site. Community reports take priority over satellite data.`,
                  `${beach._communityTotal} visitantes reportan este nivel en el lugar. Los reportes en sitio tienen prioridad sobre los datos satelitales.`)
                :beach.beachMemory
                ?_t(lang,
                  "Le satellite ne détecte plus de sargasses au large, mais des échouages ont eu lieu ces derniers jours. Les algues peuvent persister sur la plage 7 à 14 jours sans ramassage.",
                  "Satellite no longer detects sargassum offshore, but beaching occurred in recent days. Algae can persist on the beach for 7 to 14 days without cleanup.",
                  "El satélite ya no detecta sargazo en alta mar, pero hubo llegadas en los últimos días. Las algas pueden permanecer en la playa de 7 a 14 días sin limpieza.")
                :lang==="es"?ST[beach.status].descEs:lang==="en"?ST[beach.status].descEn:ST[beach.status].desc}
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

          {/* Email capture — above the fold, before forecast teaser */}
          <InlineEmailCapture lang={lang} beachName={beach.name}/>

          {/* Forecast teaser — above the fold, every user sees it */}
          {!isPremium&&forecast&&forecast[1]&&(
            <div onClick={()=>{track("sg_forecast_teaser_click",{beach_id:beach.id,tomorrow:forecast[1].status});onPremiumClick("forecast_teaser")}}
              style={{padding:"14px 16px",borderRadius:16,marginBottom:12,cursor:"pointer",
                background:"linear-gradient(135deg,#0D1E1C,#142824)",
                border:"1px solid rgba(232,168,0,.2)",
                display:"flex",alignItems:"center",gap:14,
                boxShadow:"0 4px 20px rgba(0,0,0,.12)",
                transition:"transform .2s",position:"relative",overflow:"hidden"}}>
              {/* Ambient glow */}
              <div style={{position:"absolute",top:"-50%",right:"-20%",width:"60%",height:"200%",
                background:"radial-gradient(ellipse, rgba(232,168,0,.08) 0%, transparent 70%)",pointerEvents:"none"}}/>
              <div style={{flex:1,position:"relative"}}>
                <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",
                  textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>
                  {_t(lang,"Prévision demain","Tomorrow forecast","Pronóstico de mañana")}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>
                    {beach.name}
                  </span>
                  <span style={{filter:"blur(6px)",userSelect:"none",fontSize:13,fontWeight:700,
                    color:ST[forecast[1].status]?.c||"#999"}}>{lang==="es"?ST[forecast[1].status]?.les:lang==="en"?ST[forecast[1].status]?.le:ST[forecast[1].status]?.l||"?"}</span>
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:4}}>
                  {NO_TRIAL
                    ?_t(lang,"Débloquer les 7 jours","Unlock the 7-day forecast","Desbloquear los 7 días")
                    :_t(lang,"Débloquer · 7 jours gratuit","Unlock with free trial","Desbloquear · 7 días gratis")}
                </div>
              </div>
              <div style={{width:44,height:44,borderRadius:12,
                background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:20,flexShrink:0,
                boxShadow:"0 2px 12px rgba(232,168,0,.4)"}}>
                🔓
              </div>
            </div>
          )}

          {/* ── AXE 2: Beach Reports — 3-level user sargassum reports ── */}
          <BeachReport beach={beach} lang={lang} communityReports={communityReports}/>

          {/* ── FB POSTS: real visitor photos + quotes from public FB groups ── */}
          <FbPostsStrip beach={beach} fbPosts={fbPosts} lang={lang}/>

          {/* InlinePushCTA removed — OneSignal handles native push prompt */}

          {/* Amenities — tappable chips */}
          {(beach.kids||beach.snorkel||beach.parking)&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
              {beach.kids&&<Tag icon="👶" label={LL.kids}/>}
              {beach.snorkel&&<Tag icon="🤿" label={LL.snorkel}/>}
              {beach.parking&&<Tag icon="🅿️" label={LL.parking}/>}
            </div>
          )}

          {/* Actions — Waze + Share (Fav moved to photo hero) */}
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <a href={wazeUrl} target="_blank" rel="noopener" className="gbtn"
              style={{flex:1,textDecoration:"none",textAlign:"center",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span style={{fontSize:16}}>🚗</span> {LL.directions}
            </a>
            <button onClick={()=>{
              const slug=beach.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/-+$/,"")
              const refCode=isPremium?localStorage.getItem("sg_referral_code"):""
              const url=window.location.origin+"/plages/"+slug+(refCode?"?ref="+refCode:"")
              const isRef=!!refCode
              const _st=ST[beach.status]||ST._loading
              const _stl=lang==="es"?_st.les:lang==="en"?_st.le:_st.l
              const _sc=typeof beach.score==="number"?` ${beach.score}/100`:""
              const _txt=_t(lang,
                `☀️ ${beach.name} — ${_stl}${_sc} aujourd'hui. La plage du jour !`,
                `☀️ ${beach.name} — ${_stl}${_sc} today. Beach of the day!`,
                `☀️ ${beach.name} — ${_stl}${_sc} hoy. ¡La playa del día!`)
              if(navigator.share){track("sg_share",{beach_id:beach.id,method:"native",has_referral:isRef});navigator.share({title:beach.name+" — Sargasses",text:_txt,url}).catch(()=>{})}
              else{navigator.clipboard?.writeText(`${_txt} ${url}`);track("sg_share",{beach_id:beach.id,has_referral:isRef})}
            }} style={{flex:0,padding:"14px 20px",borderRadius:16,
              border:"1.5px solid var(--sg-border)",
              background:"var(--sg-card)",cursor:"pointer",fontSize:18,fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              📤
            </button>
          </div>

          {/* Nearby beaches — horizontal scroll carousel (above fold = browse loop) */}
          {nearby.length>0&&(
            <div style={{marginBottom:16}}>
              <h3 style={{fontSize:14,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                {LL.nearby}
                <span style={{fontSize:11,fontWeight:500,color:"var(--sg-mid,#686868)"}}>
                  {_t(lang,"Compare","Tap to compare","Toca para comparar")}
                </span>
              </h3>
              <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,
                scrollbarWidth:"none",WebkitOverflowScrolling:"touch",margin:"0 -20px",padding:"0 20px 4px"}}>
                {nearby.map(nb=>{
                  const nst=ST[nb.status]||ST._loading
                  const nbPhoto=getBeachPhoto(nb)
                  return(
                    <button key={nb.id} onClick={()=>{track("sg_nearby_click",{from:beach.id,to:nb.id,status:nb.status});onBeachClick(nb)}} style={{
                      flex:"0 0 auto",width:140,padding:0,
                      borderRadius:14,border:"1px solid var(--sg-border)",overflow:"hidden",
                      background:"var(--sg-card,#fff)",cursor:"pointer",
                      textAlign:"left",fontFamily:"inherit",
                      boxShadow:"0 2px 8px rgba(0,0,0,.06)",
                    }}>
                      <div style={{height:80,background:`url(${nbPhoto||satImg(nb.lat,nb.lng,140)}) center/cover`,
                        position:"relative"}}>
                        <span style={{position:"absolute",top:6,right:6,fontSize:9,fontWeight:700,
                          padding:"2px 6px",borderRadius:100,background:nst.bg,color:nst.c,
                          backdropFilter:"blur(4px)"}}>{nst.e} {lang==="es"?nst.les:lang==="en"?nst.le:nst.l}</span>
                      </div>
                      <div style={{padding:"8px 10px"}}>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nb.name}</div>
                        <div style={{fontSize:10,color:"var(--sg-mid)",marginTop:2}}>
                          {Math.round(nb.dist)} km
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
                  {_t(lang,"Banc de sargasses en approche","Sargassum mat approaching","Banco de sargazo en camino")}
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:2}}>
                  {_t(lang,"Le satellite détecte un banc dérivant vers cette plage (1–3 jours).","Satellite shows a mat drifting toward this beach (1–3 days).","El satélite detecta un banco derivando hacia esta playa (1–3 días).")}
                </div>
              </div>
            </div>
          )}
          <ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick} isPremium={isPremium}
            weatherDaily={weather?.daily||null} weeklyData={weeklyData}/>
          {/* Disclaimer : la clé machine forecastMethod (pipeline forecast.cjs +
              'interpolated' côté client) est mappée vers une copy localisée —
              ne JAMAIS rendre weeklyData.forecastDisclaimer brut (FR sans
              accents servi tel quel sur les sites EN/ES). Clé inconnue :
              fallback brut en FR uniquement, sinon rien. */}
          {(()=>{
            const m=weeklyData?.forecastMethod
            const txt=m==="memory-decay"?_t(lang,"Données reconstruites (épisode passé) — prévision par décroissance naturelle seulement.","Reconstructed data (past event) — forecast from natural decay only.","Datos reconstruidos (evento pasado) — pronóstico solo por disipación natural.")
              :m==="arrival-banks"?_t(lang,"Banc de sargasses détecté à proximité — arrivée possible dans 1-3 jours.","Sargassum mat detected nearby — possible arrival within 1-3 days.","Banco de sargazo detectado cerca — posible llegada en 1-3 días.")
              :m==="banks-persistence"?_t(lang,"Persistance + bancs satellite + vent. Fiabilité décroissante après J+3.","Persistence + satellite mats + wind. Reliability drops after day 3.","Persistencia + bancos satelitales + viento. La fiabilidad baja después del día 3.")
              :m==="persistence-wind"?_t(lang,"Persistance + vent Open-Meteo. Pas de banc détecté à proximité.","Persistence + Open-Meteo wind. No mat detected nearby.","Persistencia + viento de Open-Meteo. Ningún banco detectado cerca.")
              :m==="persistence"?_t(lang,"Persistance simple (demi-vie 3,5 j). Pas de signal externe.","Simple persistence (3.5-day half-life). No external signal.","Persistencia simple (vida media de 3,5 días). Sin señal externa.")
              :m==="interpolated"?_t(lang,"Interpolation des plages voisines surveillées.","Interpolated from monitored nearby beaches.","Interpolación de las playas vecinas monitoreadas.")
              :(lang==="fr"?weeklyData?.forecastDisclaimer:null)
            return txt?(
              <div style={{fontSize:10,color:"var(--sg-mid,#999)",marginTop:4,fontStyle:"italic"}}>
                {txt}
              </div>
            ):null
          })()}

          {/* Forecast confidence + source (credibility) */}
          {weeklyData&&<ForecastCredibility weeklyData={weeklyData} lang={lang} sargData={sargData}/>}

          {/* Weather */}
          {weather&&(
            <>
              <h3 style={{fontSize:15,fontWeight:700,margin:"20px 0 10px"}}>{LL.weather}</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <WeatherCard icon="🌡️" label={LL.temp} value={fmtTemp(weather.temp)}/>
                <WeatherCard icon="💨" label={LL.wind} value={fmtWind(weather.wind)}/>
                <WeatherCard icon="☀️" label={LL.uv} value={weather.uv}/>
              </div>
              {/* Marine — only when significant */}
              {(()=>{
                const cards=[]
                if(weather.waveHeight!=null&&weather.waveHeight>=1.5)cards.push(<WeatherCard key="w" icon="🌊" label={LL.waves} value={fmtHeight(weather.waveHeight)}/>)
                if(weather.swellHeight!=null&&weather.swellHeight>=1.5)cards.push(<WeatherCard key="s" icon="🏄" label={LL.swell} value={fmtHeight(weather.swellHeight)}/>)
                if(weather.precipitation>0)cards.push(<WeatherCard key="r" icon="💧" label={LL.rain} value={fmtRain(weather.precipitation)}/>)
                return cards.length>0?<div style={{display:"grid",gridTemplateColumns:`repeat(${cards.length},1fr)`,gap:10,marginTop:10}}>{cards}</div>:null
              })()}
            </>
          )}

          {/* Email capture removed from bottom — moved above forecast teaser */}
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
    <div style={{padding:"14px 12px",borderRadius:16,
      background:"var(--sg-bgD,#F7F5EF)",
      textAlign:"center",border:"1px solid var(--sg-border,rgba(0,0,0,.04))",
      transition:"transform .2s",position:"relative",overflow:"hidden"}}>
      {/* Subtle shimmer */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:"50%",
        background:"linear-gradient(180deg,rgba(255,255,255,.5),transparent)",
        borderRadius:"16px 16px 0 0",pointerEvents:"none"}}/>
      <div style={{fontSize:22,marginBottom:6,position:"relative"}}>{icon}</div>
      <div style={{fontSize:16,fontWeight:800,color:"var(--sg-ink)",position:"relative",letterSpacing:"-.02em"}}>{value}</div>
      <div style={{fontSize:10,color:"var(--sg-mid,#686868)",marginTop:2,fontWeight:500,
        textTransform:"uppercase",letterSpacing:".04em",position:"relative"}}>{label}</div>
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
    const sargId=IS_NEW_REGION?beachId:BEACH_TO_SARG[beachId]
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
  const[focused,setFocused]=useState(false)
  return(
    <div style={{position:"relative"}}>
      {/* Frosted halo — brightens on focus */}
      <div style={{position:"absolute",inset:-2,borderRadius:100,
        background:focused?"radial-gradient(80% 120% at 50% 50%, rgba(232,168,0,.22), transparent 72%)":"transparent",
        filter:"blur(6px)",transition:"background .3s",pointerEvents:"none"}}/>
      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",
            color:focused?C.gold:"var(--sg-mid,#686868)",transition:"color .2s",flexShrink:0}}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input type="search" value={value} onChange={e=>onChange(e.target.value)}
          placeholder={LL.search}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          enterKeyHint="search"
          onFocus={()=>setFocused(true)}
          onBlur={()=>setFocused(false)}
          style={{
            width:"100%",padding:"13px 16px 13px 42px",borderRadius:100,
            border:focused?"1.5px solid rgba(232,168,0,.55)":"1.5px solid rgba(15,42,58,.08)",
            background:"linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.65))",
            backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
            color:"var(--sg-ink)",fontSize:15,fontWeight:500,letterSpacing:".005em",
            fontFamily:"inherit",outline:"none",
            boxShadow:focused?"0 4px 16px rgba(232,168,0,.14), inset 0 1px 0 rgba(255,255,255,.6)":"0 2px 10px rgba(15,42,58,.06), inset 0 1px 0 rgba(255,255,255,.5)",
            transition:"all .25s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </div>
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
      paddingTop:"calc(var(--sg-header-offset,108px) + env(safe-area-inset-top,0px))",paddingBottom:"calc(70px + env(safe-area-inset-bottom,12px))",
      background:"var(--sg-bg,#FDFCF7)",maxWidth:600,margin:"0 auto"}}>
      {/* Editorial kicker — Anton count echoes the hero variance pill */}
      <div style={{padding:"10px 18px 6px",display:"flex",alignItems:"baseline",gap:8}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:20,lineHeight:1,
          letterSpacing:"-.02em",color:"var(--sg-ink)"}}>
          {beaches.length}
        </span>
        <span style={{fontSize:11,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",
          color:"var(--sg-mid,#686868)"}}>
          {_t(lang,`plages · ${nClean} propres`,`beaches · ${nClean} clean`,`playas · ${nClean} limpias`)}
        </span>
      </div>
      {beaches.length===0?(
        <div style={{padding:"60px 32px",textAlign:"center",animation:"fadeIn .3s ease"}}>
          <div style={{fontSize:48,marginBottom:12}}>🏖️</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--sg-ink)",marginBottom:6}}>
            {_t(lang,"Aucune plage trouvée","No beaches match","No se encontraron playas")}
          </div>
          <div style={{fontSize:13,color:"var(--sg-mid,#686868)",lineHeight:1.5}}>
            {_t(lang,"Essaie un autre filtre ou une autre recherche.","Try a different filter or search.","Prueba otro filtro u otra búsqueda.")}
          </div>
        </div>
      ):(
      <div style={{padding:"6px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {beaches.map(b=>{
          const photo=getBeachPhoto(b)
          const st=ST[b.status]||ST._loading
          const hasScore=typeof b.score==="number"
          const scoreColor=b.scoreColor||st.c
          return(
            <button key={b.id} onClick={()=>onBeachClick(b)} style={{
              position:"relative",
              display:"flex",alignItems:"center",gap:12,padding:0,
              borderRadius:16,border:`1px solid ${scoreColor}22`,
              background:"linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,.72))",
              backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
              cursor:"pointer",textAlign:"left",fontFamily:"inherit",width:"100%",
              boxShadow:`0 6px 18px -10px ${scoreColor}40, inset 0 1px 0 rgba(255,255,255,.55)`,
              transition:"all .25s cubic-bezier(.22,1,.36,1)",
              animation:"slideUp .3s cubic-bezier(.22,1,.36,1) backwards",
              animationDelay:`${Math.min(b._dist||0,10)*20}ms`,
              overflow:"hidden",
            }}>
              {/* Score-colored left rail — wider + gradient */}
              <div aria-hidden="true" style={{position:"absolute",left:0,top:0,bottom:0,width:4,
                background:`linear-gradient(180deg, ${scoreColor}, ${scoreColor}aa)`,
                boxShadow:`0 0 12px ${scoreColor}55`}}/>
              {/* Photo thumbnail */}
              <div style={{width:72,height:72,flexShrink:0,position:"relative",marginLeft:4,
                background:`url(${photo||satImg(b.lat,b.lng,144)}) center 40%/cover`}}>
                <span aria-hidden="true" style={{position:"absolute",bottom:5,right:5,width:10,height:10,borderRadius:5,
                  background:st.c,border:"2px solid #fff",
                  boxShadow:`0 0 6px ${st.c}66`}}/>
              </div>
              <div style={{flex:1,minWidth:0,padding:"12px 6px 12px 0"}}>
                <div className="anton" style={{fontSize:15,lineHeight:1.1,letterSpacing:"-.005em",
                  textTransform:"uppercase",color:"var(--sg-ink)",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {favorites.includes(b.id)?"♥ ":""}{b.name}
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:3,fontWeight:500,
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {b.commune}{typeof b.drive==="number"?` · ${b.drive} ${LL.drive}`:""}
                </div>
                <div style={{fontSize:10,fontWeight:800,marginTop:4,letterSpacing:".03em",
                  textTransform:"uppercase",color:scoreColor}}>
                  {hasScore?(scoreLabelFor(b.scoreLabel,lang)||(lang==="es"?st.les:lang==="en"?st.le:st.l)):(lang==="es"?st.les:lang==="en"?st.le:st.l)}
                </div>
              </div>
              {/* Score badge — Anton numeral, status-colored */}
              {hasScore&&(
                <div style={{flexShrink:0,padding:"0 14px 0 0",display:"flex",flexDirection:"column",
                  alignItems:"flex-end",justifyContent:"center"}}>
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:.95,
                    letterSpacing:"-.02em",color:scoreColor}}>
                    {b.score}
                  </span>
                  <span style={{fontSize:8,fontWeight:800,color:"var(--sg-mid,#686868)",
                    letterSpacing:".08em",marginTop:1}}>/100</span>
                </div>
              )}
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
      left:"max(12px, 3vw)",right:"max(12px, 3vw)",zIndex:750,pointerEvents:"none",
      maxWidth:520,margin:"0 auto"}}>

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
                {IS_NEW_REGION?(REGION.primaryLang==="es"?`${REGION.beaches.length} playas`:`${REGION.beaches.length} beaches`):isMQ?"53 plages":"83 plages"}
              </em> {_t(lang,"surveillées en temps réel","monitored live","monitoreadas en vivo")}
            </span>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(20px,5.5vw,26px)",lineHeight:1,
            textTransform:"uppercase",color:C.ink,marginBottom:8}}>
            <span style={{color:C.teal}}>{_t(lang,"Vert","Green","Verde")}</span> = {_t(lang,"propre","clean","limpia")}.{" "}
            <span style={{color:C.red}}>{_t(lang,"Rouge","Red","Rojo")}</span> = {_t(lang,"sargasses","sargassum","sargazo")}.
          </div>
          <p style={{fontSize:13,color:C.mid,margin:"0 0 12px",lineHeight:1.5}}>
            {_t(lang,"Touche une plage sur la carte pour voir son état en temps réel.","Tap a beach on the map to see real-time conditions.","Toca una playa en el mapa para ver su estado en tiempo real.")}
          </p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setStep(1)} style={{
              flex:1,padding:"11px",borderRadius:12,border:"none",cursor:"pointer",
              background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
              fontFamily:"inherit",fontSize:13,fontWeight:700,color:C.ink,
              boxShadow:"0 4px 16px rgba(232,168,0,.3)"}}>
              {_t(lang,"Compris","Got it","Entendido")}
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
            {_t(lang,"Touche un ","Tap a ","Toca un ")}{" "}
            <span style={{color:C.green}}>●</span>{" "}
            <span style={{color:C.amber}}>●</span>{" "}
            <span style={{color:C.red}}>●</span>{" "}
            {_t(lang,"pour voir les détails","to see details","para ver los detalles")}
          </span>
          <button onClick={dismiss} style={{
            background:"none",border:"none",color:C.mid,cursor:"pointer",
            fontSize:16,padding:8,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",
            marginLeft:"auto",flexShrink:0}}>✕</button>
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
            {IS_NEW_REGION?`SARGASSUM ${REGION.name.toUpperCase()}`:`SARGASSES.${isMQ?"MQ":"GP"}`}
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#22C55E",
            animation:"dot-pulse 2s ease-in-out infinite"}}/>
          <span style={{fontSize:10.5,fontWeight:600,color:"rgba(255,255,255,.5)"}}>{_t(lang,"En direct","Live","En vivo")}</span>
        </div>
      </div>

      {/* Headline */}
      <div style={{padding:"28px 22px 0"}}>
        <div style={{fontSize:12,fontStyle:"italic",color:"rgba(255,255,255,.4)",marginBottom:6}}>
          {_t(lang,"Sargasses ou pas — sache avant de partir.","Sargassum or not — know before you go.","Sargazo o no — entérate antes de ir.")}
        </div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:42,lineHeight:.9,
          textTransform:"uppercase",color:"#fff",letterSpacing:"-.02em"}}>
          {lang==="es"?<>¿Cuál es<br/><span style={{color:C.tealL}}>tu</span> playa?</>
            :lang==="en"?<>What's <span style={{color:C.tealL}}>your</span><br/>beach?</>
            :<>Quelle est<br/><span style={{color:C.tealL}}>ta</span> plage ?</>}
        </div>
        <p style={{fontSize:13.5,color:"rgba(255,255,255,.5)",margin:"8px 0 0",lineHeight:1.5}}>
          {_t(lang,"On te dit chaque jour si tu peux y aller.","We'll tell you every day if it's clear.","Te decimos cada día si puedes ir.")}
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
            {_t(lang,"Mis à jour aujourd'hui","Updated today","Actualizado hoy")}
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
                {lang==="es"?st.les:lang==="en"?st.le:st.l}
              </span>
            </button>
          )
        })}
      </div>

      {/* Micro proof footer */}
      <div style={{padding:"16px 22px max(20px,calc(env(safe-area-inset-bottom,12px) + 12px))",
        textAlign:"center",fontSize:10.5,color:"rgba(255,255,255,.25)",
        display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        {_t(lang,"Gratuit","Free","Gratis")}
        <span style={{width:3,height:3,borderRadius:"50%",background:"rgba(255,255,255,.15)"}}/>
        {_t(lang,"Sans inscription","No signup","Sin registro")}
        <span style={{width:3,height:3,borderRadius:"50%",background:"rgba(255,255,255,.15)"}}/>
        {_t(lang,"Mis à jour chaque jour","Updated daily","Actualizado a diario")}
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
          {_t(lang,"Sois pr\u00e9venu si tes plages favorites changent.","Get notified when your favorite beaches change.","Ent\u00e9rate si tus playas favoritas cambian.")}
        </div>
        <button onClick={onAccept} style={{
          background:"#16a34a",color:"#fff",border:"none",
          padding:"9px 14px",borderRadius:10,fontSize:13,fontWeight:700,
          cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",
          minHeight:36,
        }}>
          {_t(lang,"Activer","Activate","Activar")}
        </button>
        <button onClick={onDismiss} aria-label={_t(lang,"Plus tard","Dismiss","Ahora no")}
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

/* ═══════════════════════════════════════════════════════════════════════════
   rankBeaches — shared scoring used by HeroReco (top) + DailyRecoStrip (bottom).
   Signals: beach score + status + forecast + drift + arrival + community
            + memory + distance + amenities. See DailyRecoStrip for doc.
   Returns beaches sorted desc by _score with _dist/_fc1/_fc3/_drift/_conf added.
   ═══════════════════════════════════════════════════════════════════════════ */
function rankBeaches(allBeaches,island,userPos,sargData,communityReports){
  if(!allBeaches?.length)return[]
  const islandBeaches=allBeaches.filter(b=>b.island===island&&b.status&&b.status!=="_loading")
  if(!islandBeaches.length)return[]
  const scored=islandBeaches.map(b=>{
    const dist=userPos?haversine(userPos.lat,userPos.lng,b.lat,b.lng):null
    const sargId=IS_NEW_REGION?b.id:BEACH_TO_SARG[b.id]
    const weekly=sargId&&sargData?.weekly?.[sargId]
    const enriched=sargData?._enrichedWeekly?.[`_interp_${b.id}`]
    const activeWeekly=weekly||enriched
    const fc1=activeWeekly?.forecast?.[1]
    const fc3=activeWeekly?.forecast?.[3]
    const drift=activeWeekly?.drift||null
    const arrivalDetected=!!activeWeekly?.arrivalDetected
    const arrivalStrength=activeWeekly?.arrivalStrength||0
    let score=0
    if(typeof b.score==="number")score+=b.score*3
    if(b.status==="clean")score+=100
    else if(b.status==="moderate")score+=40
    else score-=50
    if(typeof b.afai==="number")score-=b.afai*60
    if(fc1){
      if(fc1.status==="avoid")score-=35
      else if(fc1.status==="moderate")score-=15
    }
    if(fc3){
      if(fc3.status==="avoid")score-=25
      else if(fc3.status==="moderate")score-=12
    }
    if(drift==="up")score-=20
    else if(drift==="down")score+=5
    if(arrivalDetected)score-=Math.round(arrivalStrength*200)
    const conf=(activeWeekly?.forecast?.[0]?.confidence)||60
    score=score*(0.6+Math.min(conf,100)/250)
    const cReports=communityReports?.[b.id]||communityReports?.[sargId]
    if(cReports&&cReports.total>=3){
      const avoidPct=cReports.avoid/cReports.total
      const modPct=cReports.moderate/cReports.total
      if(avoidPct>=0.5)score-=50
      else if(modPct>=0.5)score-=20
    }
    if(b.beachMemory)score-=25
    if(dist!=null)score-=Math.min(dist,50)*1.2
    else if(typeof b.drive==="number")score-=Math.min(b.drive,90)*0.6
    if(b.kids)score+=5
    if(b.parking)score+=3
    return{...b,_score:Math.round(score*10)/10,_dist:dist,_fc1:fc1,_fc3:fc3,_drift:drift,_conf:conf,_communityReports:cReports,_arrivalDetected:arrivalDetected,_arrivalStrength:arrivalStrength}
  })
  scored.sort((a,b)=>b._score-a._score)
  return scored
}

/* ═══════════════════════════════════════════════════════════════════════════
   HeroReco — BIG top card that delivers the aha moment in <2s.
   Shows #1 scored beach with score ring + name + verdict + distance,
   plus 2 inline alternatives. Replaces the abstract status-strip hero.
   Why: map tiles + aggregate counts don't answer "where do I go NOW" —
        one opinionated card does.
   ═══════════════════════════════════════════════════════════════════════════ */
function HeroReco({allBeaches,sargData,island,lang,userPos,onBeachClick,communityReports,onPremiumClick}){
  // Full sorted list — we derive top, alts, worst, and score variance all from it.
  const sorted=useMemo(
    ()=>rankBeaches(allBeaches,island,userPos,sargData,communityReports),
    [allBeaches,island,userPos,sargData,communityReports]
  )
  const picks=sorted.slice(0,3)
  const top=picks[0]

  // Count-up score animation on mount / when top changes — instant "wow, look at that number climb".
  const[animScore,setAnimScore]=useState(0)
  useEffect(()=>{
    if(!top||typeof top.score!=="number"){setAnimScore(0);return}
    let raf,start
    const target=top.score
    const dur=900
    const step=ts=>{
      if(!start)start=ts
      const t=Math.min(1,(ts-start)/dur)
      const eased=1-Math.pow(1-t,3)
      setAnimScore(Math.round(target*eased))
      if(t<1)raf=requestAnimationFrame(step)
    }
    raf=requestAnimationFrame(step)
    return()=>raf&&cancelAnimationFrame(raf)
  },[top?.id,top?.score])

  // Collapsible hero — map-first layout: default to peek mode so the user's
  // first sight is the map, not a 240px card. Tap the handle to expand the
  // full score + alternatives. Choice persisted so returning users get their
  // preferred state (only explicit "0" keeps it expanded).
  const[heroCollapsed,setHeroCollapsed]=useState(()=>{
    try{return localStorage.getItem("sg_hero_collapsed")!=="0"}catch{return true}
  })
  const toggleCollapse=e=>{
    e.stopPropagation()
    setHeroCollapsed(c=>{
      const next=!c
      try{localStorage.setItem("sg_hero_collapsed",next?"1":"0")}catch{}
      track(next?"sg_hero_collapse":"sg_hero_expand")
      return next
    })
  }

  // First-visit inline email capture (persisted via localStorage once submitted OR dismissed)
  const[heroEmail,setHeroEmail]=useState("")
  const[heroEmailSent,setHeroEmailSent]=useState(false)
  const[heroEmailHidden,setHeroEmailHidden]=useState(()=>{
    try{return !!localStorage.getItem("sg_email")||!!localStorage.getItem("sg_hero_email_dismiss")}catch{return false}
  })
  const submitHeroEmail=()=>{
    if(!heroEmail||!heroEmail.includes("@"))return
    track("sg_hero_email_submit",{beach_id:top?.id,score:top?.score})
    try{localStorage.setItem("sg_email",heroEmail)}catch{}
    try{
      const isl=IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ"
      fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
        method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
        body:JSON.stringify({email:heroEmail,island:isl,source:"hero_inline",date:new Date().toISOString()})
      }).catch(()=>{})
    }catch{}
    setHeroEmailSent(true)
  }

  if(!top)return null
  const topSt=ST[top.status]||ST._loading
  const alts=picks.slice(1,3)

  // Score variance across the island — the "WOW, we analyzed 130+ beaches" proof.
  const withScore=sorted.filter(b=>typeof b.score==="number")
  const minScore=withScore.length?Math.min(...withScore.map(b=>b.score)):null
  const maxScore=withScore.length?Math.max(...withScore.map(b=>b.score)):null
  const variance=(minScore!=null&&maxScore!=null)?maxScore-minScore:0
  // Worst pick for the "évite aussi" band — true min-score beach (not last-ranked,
  // since ranking blends status priority with score).
  const worst=withScore.length>=5
    ?withScore.reduce((m,b)=>(!m||b.score<m.score?b:m),null)
    :null
  const showWorst=worst&&typeof top.score==="number"&&(top.score-worst.score)>=12

  // Short verdict — clear & punchy (fuller text lives in beach sheet)
  const verdict=(()=>{
    if(top._arrivalDetected&&top.status==="clean")return _t(lang,"Propre · banc en approche","Clean · bank approaching","Limpia · banco en camino")
    if(top._fc1&&top._fc1.status&&top._fc1.status!=="clean"&&top.status==="clean"){
      return _t(lang,`Propre aujourd'hui, ${top._fc1.status==="moderate"?"modéré":"alerte"} demain`,`Clean today, ${top._fc1.status} tomorrow`,`Limpia hoy, ${top._fc1.status==="moderate"?"moderado":"alerta"} mañana`)
    }
    if(top.beachMemory)return _t(lang,"Mémoire échouage — vérifie","Recent beaching — verify","Llegada reciente — verifica")
    if(top.status==="clean")return _t(lang,"Propre et stable","Clean & stable","Limpia y estable")
    if(top.status==="moderate")return _t(lang,"Modéré — meilleure option du jour","Moderate — best option today","Moderado — la mejor opción hoy")
    return _t(lang,"Meilleur compromis aujourd'hui","Best compromise today","El mejor compromiso hoy")
  })()

  // Distance & drive labels
  const distLbl=top._dist!=null
    ?(top._dist<1?`${Math.round(top._dist*1000)} m`:`${Math.round(top._dist)} km`)
    :null
  const driveLbl=typeof top.drive==="number"?`${top.drive} min`:null

  const greet=(()=>{
    const h=new Date().getHours()
    if(h<12)return _t(lang,"Ce matin","This morning","Esta mañana")
    if(h<18)return _t(lang,"Maintenant","Right now","Ahora mismo")
    return _t(lang,"Ce soir","Tonight","Esta noche")
  })()
  // First-person pre-chewed decision — shifts the user from "browsing the map"
  // to "accepting a recommendation". Copy is ephemeral per hour-of-day.
  const myPickLead=lang==="en"?"My pick":lang==="es"?"Mi elección":"Ma reco"

  const strengthsList=(top.scoreStrengths||[]).slice(0,3)

  // Above-the-fold authority strip — Copernicus ESA source + freshness + coverage.
  // Why: first-visit users need a 1-second credibility signal that the score isn't
  // random. ESA is the strongest trust anchor we have (official EU satellite data,
  // cannot be faked), freshness kills the "stale screenshot" objection, and the
  // beach count signals coverage. All three answer the implicit "why should I trust
  // this number?" that gates every conversion downstream.
  const dataUpdatedAt=sargData?.erddapTimestamp||sargData?.updatedAt||null
  const freshLbl=(()=>{
    if(!dataUpdatedAt)return null
    const diffMin=Math.max(0,Math.round((Date.now()-new Date(dataUpdatedAt).getTime())/60000))
    if(diffMin<60)return _t(lang,`il y a ${diffMin} min`,`${diffMin} min ago`,`hace ${diffMin} min`)
    const h=Math.round(diffMin/60)
    if(h<24)return _t(lang,`il y a ${h}h`,`${h}h ago`,`hace ${h}h`)
    return _t(lang,"aujourd'hui","today","hoy")
  })()
  const coverageLbl=withScore.length>0
    ?_t(lang,`${withScore.length} plages`,`${withScore.length} beaches`,`${withScore.length} playas`)
    :null

  return(
    <div style={{
      marginTop:10,
      position:"relative",
      background:"var(--sg-card,#fff)",
      border:`1px solid ${topSt.c}33`,
      borderRadius:22,
      boxShadow:`0 18px 48px -14px ${topSt.c}38, 0 2px 8px rgba(0,0,0,.05)`,
      overflow:"hidden",
    }}>
      {/* Aurora backdrop — soft radial halo derived from status color.
          Sits behind all content (zIndex 0), absolutely positioned.
          Why: gives the hero card a "lit-from-within" feel instead of a flat tile. */}
      <div aria-hidden style={{
        position:"absolute",inset:0,
        background:`radial-gradient(120% 80% at 18% 38%, ${topSt.c}22 0%, ${topSt.c}0d 32%, transparent 62%), linear-gradient(180deg, ${topSt.c}0f 0%, transparent 100%)`,
        pointerEvents:"none",
      }}/>
      <div aria-hidden style={{
        position:"absolute",top:-18,right:-18,width:120,height:120,
        background:`radial-gradient(closest-side, ${topSt.c}1f 0%, transparent 70%)`,
        pointerEvents:"none",
      }}/>

      {/* Authority strip — Copernicus ESA + freshness + coverage. Always visible
          in both peek and expanded modes so the first second of eye contact lands
          on a trust anchor, not a sales pitch. */}
      <div style={{
        position:"relative",
        display:"flex",alignItems:"center",justifyContent:"center",gap:6,
        padding:"7px 14px 5px",
        fontSize:10,fontWeight:600,
        color:"var(--sg-mid,#686868)",
        letterSpacing:".01em",
        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
      }}>
        <span aria-hidden="true" style={{fontSize:11}}>🛰</span>
        <span style={{fontWeight:800,color:"#005A9E",letterSpacing:".02em"}}>Copernicus ESA</span>
        {freshLbl&&(<>
          <span aria-hidden style={{width:3,height:3,borderRadius:"50%",background:"currentColor",opacity:.4}}/>
          <span>{_t(lang,`MAJ ${freshLbl}`,`Updated ${freshLbl}`,`Act. ${freshLbl}`)}</span>
        </>)}
        {coverageLbl&&(<>
          <span aria-hidden style={{width:3,height:3,borderRadius:"50%",background:"currentColor",opacity:.4}}/>
          <span>{coverageLbl}</span>
        </>)}
      </div>

      {/* Collapse handle — iOS sheet grab-bar. Tap to toggle peek mode so the
          map gets its full vertical space back. */}
      <button
        onClick={toggleCollapse}
        aria-label={heroCollapsed?_t(lang,"Déplier","Expand","Expandir"):_t(lang,"Réduire","Collapse","Reducir")}
        aria-expanded={!heroCollapsed}
        style={{
          position:"relative",
          display:"flex",justifyContent:"center",alignItems:"center",
          width:"100%",padding:"8px 0 4px",
          background:"none",border:"none",cursor:"pointer",
          fontFamily:"inherit",
        }}
      >
        <span aria-hidden="true" style={{
          width:38,height:4,borderRadius:2,
          background:`rgba(15,42,58,${heroCollapsed?.28:.18})`,
          transition:"background .2s",
        }}/>
      </button>

      {heroCollapsed?(
        /* Peek mode — compact row + 1-ligne email. Le formulaire principal du
           landing était dans la branche expanded (repliée par défaut) → invisible
           pour 100% des sessions, capture à 0,2%. Ici : 1 ligne discrète,
           dismissable une fois, alignée sur la promesse premium (alertes). */
        <>
        <button
          onClick={()=>{
            track("sg_hero_reco_click",{beach_id:top.id,status:top.status,score:top.score,collapsed:1})
            onBeachClick(top)
          }}
          style={{
            position:"relative",
            display:"flex",alignItems:"center",gap:12,
            padding:"2px 14px 14px",
            background:"none",border:"none",width:"100%",
            cursor:"pointer",fontFamily:"inherit",textAlign:"left",
          }}
        >
          {typeof top.score==="number"&&(
            <div style={{
              position:"relative",width:60,height:60,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              <div style={{
                position:"relative",width:60,height:60,borderRadius:"50%",
                background:`conic-gradient(${top.scoreColor||topSt.c} ${top.score*3.6}deg, rgba(0,0,0,.05) ${top.score*3.6}deg)`,
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:`inset 0 0 0 1px ${top.scoreColor||topSt.c}33, 0 4px 14px ${topSt.c}44`,
              }}>
                <div style={{
                  width:46,height:46,borderRadius:"50%",
                  background:"linear-gradient(180deg,#fff 0%, #FDFCF7 100%)",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  lineHeight:.85,
                }}>
                  <span style={{
                    fontFamily:"'Anton',sans-serif",fontSize:26,
                    color:top.scoreColor||topSt.c,letterSpacing:"-.03em",
                  }}>{top.score}</span>
                  <span style={{
                    fontSize:7,fontWeight:700,letterSpacing:".08em",
                    color:"var(--sg-mid,#9a9a9a)",textTransform:"uppercase",marginTop:1,
                  }}>{lang==="en"?"score":lang==="es"?"nota":"note"}</span>
                </div>
              </div>
            </div>
          )}
          <div style={{flex:1,minWidth:0}}>
            <div style={{
              fontSize:9,fontWeight:800,
              letterSpacing:".14em",textTransform:"uppercase",
              color:"#009E8E",opacity:.85,marginBottom:1,
            }}>
              {myPickLead} · {greet}
            </div>
            <div style={{
              fontFamily:"'Anton',sans-serif",
              fontSize:18,textTransform:"uppercase",letterSpacing:"-.015em",
              color:"var(--sg-ink,#0D0D0D)",lineHeight:1.02,
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
            }}>
              {top.name}
            </div>
            <div style={{
              fontSize:11,fontWeight:700,color:topSt.c,
              letterSpacing:".01em",marginTop:3,
              display:"flex",alignItems:"center",gap:6,
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
            }}>
              <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{verdict}</span>
              {distLbl&&(<>
                <span aria-hidden style={{width:3,height:3,borderRadius:"50%",background:"currentColor",opacity:.4,flexShrink:0}}/>
                <span style={{color:"var(--sg-mid,#686868)",fontWeight:600,flexShrink:0}}>{distLbl}</span>
              </>)}
            </div>
          </div>
          <span style={{
            fontSize:12,fontWeight:800,color:"#fff",
            flexShrink:0,whiteSpace:"nowrap",
            padding:"10px 18px",borderRadius:100,
            background:"linear-gradient(135deg,#00C2B0 0%,#009E8E 100%)",
            boxShadow:"0 6px 18px rgba(0,158,142,.45), inset 0 1px 0 rgba(255,255,255,.35)",
            letterSpacing:".03em",
          }}>
            {_t(lang,"J'y vais →","Take me →","Vamos →")}
          </span>
        </button>
        </>
      ):(<>

      {/* Top bar — greeting + score-variance badge */}
      <div style={{
        position:"relative",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"12px 16px 0",gap:10,
      }}>
        <div style={{
          fontSize:10,fontWeight:800,
          letterSpacing:".1em",textTransform:"uppercase",
          color:topSt.c,opacity:.85,
        }}>
          ● {greet}
        </div>
        {variance>=12&&(
          <div style={{
            fontSize:9,fontWeight:700,
            padding:"3px 8px",borderRadius:100,
            background:"rgba(255,255,255,.7)",
            backdropFilter:"blur(6px)",
            border:"1px solid rgba(0,0,0,.05)",
            color:"var(--sg-mid,#686868)",
            letterSpacing:".02em",whiteSpace:"nowrap",
          }}>
            {withScore.length} {_t(lang,"analysées","analyzed","analizadas")} · Δ{variance}
          </div>
        )}
      </div>

      {/* Main row — tap opens sheet */}
      <button
        onClick={()=>{
          track("sg_hero_reco_click",{beach_id:top.id,status:top.status,score:top.score})
          onBeachClick(top)
        }}
        style={{
          position:"relative",
          display:"flex",alignItems:"center",gap:16,
          padding:"12px 16px 16px",
          background:"none",border:"none",width:"100%",
          cursor:"pointer",fontFamily:"inherit",textAlign:"left",
        }}
      >
        {/* XL score ring (108px) in a 132px halo box — dominant visual with soft outer glow.
            Why 108 not 96: the ring needs to out-compete the beach name typographically. */}
        {typeof top.score==="number"?(
          <div style={{
            position:"relative",
            width:112,height:112,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>
            {/* halo */}
            <div aria-hidden style={{
              position:"absolute",inset:-12,borderRadius:"50%",
              background:`radial-gradient(closest-side, ${top.scoreColor||topSt.c}33 0%, transparent 70%)`,
              filter:"blur(2px)",pointerEvents:"none",
            }}/>
            {/* conic ring */}
            <div style={{
              position:"relative",
              width:108,height:108,borderRadius:"50%",
              background:`conic-gradient(${top.scoreColor||topSt.c} ${animScore*3.6}deg, rgba(0,0,0,.055) ${animScore*3.6}deg)`,
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:`inset 0 0 0 1px ${top.scoreColor||topSt.c}22`,
              transition:"background 120ms linear",
            }}>
              <div style={{
                width:88,height:88,borderRadius:"50%",
                background:"linear-gradient(180deg,#fff 0%, #FDFCF7 100%)",
                display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",
                boxShadow:"0 2px 10px rgba(0,0,0,.08), inset 0 0 0 1px rgba(255,255,255,.9)",
              }}>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:44,lineHeight:.95,color:top.scoreColor||topSt.c,letterSpacing:"-.02em"}}>{animScore}</span>
                <span style={{fontSize:9,fontWeight:800,marginTop:1,color:"var(--sg-mid,#686868)",letterSpacing:".08em"}}>/100</span>
              </div>
            </div>
          </div>
        ):(
          <div style={{
            width:112,height:112,borderRadius:"50%",flexShrink:0,
            background:topSt.c,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>
            <div style={{width:16,height:16,borderRadius:8,background:"#fff"}}/>
          </div>
        )}

        <div style={{flex:1,minWidth:0,position:"relative"}}>
          <div style={{
            fontFamily:"'Anton',sans-serif",
            fontSize:22,fontWeight:400,
            textTransform:"uppercase",letterSpacing:"-.015em",
            color:"var(--sg-ink,#0D0D0D)",
            lineHeight:1.02,marginBottom:6,
            display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",
            overflow:"hidden",wordBreak:"break-word",
          }}>
            {top.name}
          </div>
          <div style={{
            fontSize:12,fontWeight:800,color:topSt.c,
            marginBottom:strengthsList.length>0?6:3,lineHeight:1.25,
            letterSpacing:".005em",
          }}>
            {verdict}
          </div>
          {strengthsList.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
              {strengthsList.map((s,i)=>(
                <span key={i} style={{
                  fontSize:10,fontWeight:700,
                  padding:"2px 7px",borderRadius:100,
                  background:"rgba(34,197,94,.12)",color:"#16A34A",
                  whiteSpace:"nowrap",
                }}>✓ {s}</span>
              ))}
            </div>
          )}
          <div style={{
            fontSize:11,color:"var(--sg-mid,#686868)",
            display:"flex",alignItems:"center",gap:8,
            whiteSpace:"nowrap",overflow:"hidden",
          }}>
            {driveLbl&&<span>🚗 {driveLbl}</span>}
            {distLbl&&<span>· {distLbl}</span>}
            {!distLbl&&!driveLbl&&top.commune&&<span>{top.commune}</span>}
          </div>
        </div>

        <span style={{
          fontSize:12,fontWeight:800,color:"#fff",
          flexShrink:0,whiteSpace:"nowrap",
          padding:"9px 15px",borderRadius:100,
          background:topSt.c,
          boxShadow:`0 2px 8px ${topSt.c}44`,
          letterSpacing:".02em",
        }}>
          {_t(lang,"Voir →","Go →","Ver →")}
        </span>
      </button>

      {/* "Évite aussi" strip — editorial counter-beat to the top pick */}
      {showWorst&&(
        <button
          onClick={()=>{
            track("sg_hero_worst_click",{beach_id:worst.id,score:worst.score})
            onBeachClick(worst)
          }}
          style={{
            position:"relative",
            display:"flex",alignItems:"center",gap:10,width:"100%",
            padding:"11px 14px 11px 12px",border:"none",
            borderTop:"1px solid rgba(224,120,0,.2)",
            background:"linear-gradient(90deg, rgba(224,120,0,.14) 0%, rgba(224,120,0,.05) 40%, rgba(224,120,0,.02) 100%)",
            cursor:"pointer",fontFamily:"inherit",textAlign:"left",
          }}
        >
          {/* Left rail — amber coaster stripe, signals inversion from green top */}
          <span aria-hidden="true" style={{
            width:3,alignSelf:"stretch",borderRadius:2,
            background:"linear-gradient(180deg, #E07800, #B45309)",
            boxShadow:"0 0 8px rgba(224,120,0,.35)",flexShrink:0,
          }}/>
          <span style={{
            fontSize:10,fontWeight:800,color:"#B45309",letterSpacing:".08em",
            textTransform:"uppercase",flexShrink:0,
          }}>
            {_t(lang,"Évite","Skip","Evita")}
          </span>
          <span style={{
            fontSize:12,fontWeight:700,color:"#7C3E03",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,
          }}>
            {worst.name}
          </span>
          <span style={{
            display:"inline-flex",alignItems:"baseline",gap:3,
            padding:"3px 9px 2px",borderRadius:100,
            background:"rgba(255,255,255,.75)",
            border:"1px solid rgba(224,120,0,.3)",
            boxShadow:"inset 0 1px 0 rgba(255,255,255,.7)",
            whiteSpace:"nowrap",flexShrink:0,
          }}>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:14,lineHeight:1,
              letterSpacing:"-.01em",color:"#E07800"}}>
              {worst.score}
            </span>
            <span style={{fontSize:9,fontWeight:800,color:"#B45309",letterSpacing:".04em"}}>
              /100
            </span>
            <span style={{fontSize:10,fontWeight:800,color:"#E07800",marginLeft:2,letterSpacing:".02em"}}>
              −{top.score-worst.score}
            </span>
          </span>
        </button>
      )}

      {/* Alternatives row — 2 more picks, inline, each with its own score */}
      {alts.length>0&&(
        <div style={{
          position:"relative",
          display:"flex",
          borderTop:"1px solid var(--sg-border,rgba(0,0,0,.06))",
          background:"linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.25))",
          backdropFilter:"blur(4px)",
        }}>
          {alts.map((alt,i)=>{
            const aSt=ST[alt.status]||ST._loading
            return(
              <button
                key={alt.id}
                onClick={()=>{
                  track("sg_hero_alt_click",{beach_id:alt.id,rank:i+2,status:alt.status})
                  onBeachClick(alt)
                }}
                style={{
                  flex:1,padding:"10px 12px",
                  background:"none",border:"none",
                  borderLeft:i>0?"1px solid var(--sg-border,rgba(0,0,0,.06))":"none",
                  cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                  display:"flex",alignItems:"center",gap:8,minWidth:0,
                }}
              >
                <div style={{width:8,height:8,borderRadius:4,background:aSt.c,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{
                    fontSize:11,fontWeight:700,color:"var(--sg-ink,#0D0D0D)",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                  }}>
                    {alt.name}
                  </div>
                  <div style={{fontSize:10,color:"var(--sg-mid,#686868)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {typeof alt.score==="number"?`${alt.score}/100`:""}
                    {(typeof alt.score==="number"&&(alt._dist!=null||typeof alt.drive==="number"||alt.commune))?" · ":""}
                    {alt._dist!=null
                      ?`${alt._dist<1?Math.round(alt._dist*1000)+" m":Math.round(alt._dist)+" km"}`
                      :(typeof alt.drive==="number"?`${alt.drive} min`:(alt.commune||""))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Inline email mini-capture — first visit only, dismissable */}
      {!heroEmailHidden&&!heroEmailSent&&(
        <div style={{
          position:"relative",
          borderTop:"1px solid var(--sg-border,rgba(0,0,0,.06))",
          padding:"10px 12px",
          background:"linear-gradient(90deg,rgba(255,199,44,.1),rgba(255,199,44,.18))",
          display:"flex",alignItems:"center",gap:7,
        }}>
          <span style={{fontSize:14,flexShrink:0}}>📬</span>
          <input
            type="email" inputMode="email" autoComplete="email"
            placeholder={_t(lang,"ton@email — ma reco à 7h","email — daily pick at 7am","tu@email — tu playa del día a las 7")}
            value={heroEmail}
            onChange={e=>setHeroEmail(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submitHeroEmail()}}
            onClick={e=>e.stopPropagation()}
            style={{
              flex:1,minWidth:0,
              padding:"7px 10px",borderRadius:8,
              border:"1px solid rgba(0,0,0,.1)",
              fontSize:13,fontFamily:"inherit",
              background:"var(--sg-card,#fff)",
              color:"var(--sg-ink,#0D0D0D)",outline:"none",
            }}
          />
          <button
            onClick={submitHeroEmail}
            disabled={!heroEmail||!heroEmail.includes("@")}
            style={{
              padding:"7px 13px",borderRadius:8,border:"none",
              background:(heroEmail&&heroEmail.includes("@"))?"linear-gradient(135deg,#FFE47A,#FFC72C)":"rgba(0,0,0,.07)",
              color:(heroEmail&&heroEmail.includes("@"))?"#0D0D0D":"rgba(0,0,0,.35)",
              fontSize:12,fontWeight:800,
              cursor:(heroEmail&&heroEmail.includes("@"))?"pointer":"not-allowed",
              fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0,
            }}
          >{lang==="en"?"OK":"OK"}</button>
          <button
            onClick={()=>{
              try{localStorage.setItem("sg_hero_email_dismiss","1")}catch{}
              setHeroEmailHidden(true)
              track("sg_hero_email_dismiss")
            }}
            aria-label="dismiss"
            style={{
              background:"none",border:"none",cursor:"pointer",
              color:"rgba(0,0,0,.35)",fontSize:16,padding:"4px 2px",
              fontFamily:"inherit",flexShrink:0,
            }}
          >×</button>
        </div>
      )}
      {heroEmailSent&&(
        <div style={{
          position:"relative",
          borderTop:"1px solid var(--sg-border,rgba(0,0,0,.06))",
          padding:"10px 14px",textAlign:"center",
          background:"rgba(34,197,94,.09)",
        }}>
          <div style={{fontSize:12,fontWeight:700,color:"#16A34A"}}>
            ✓ {_t(lang,"C'est fait ! Ta reco demain à 7h.","You're in! First pick tomorrow 7am.","¡Listo! Tu playa del día mañana a las 7.")}
          </div>
          {onPremiumClick&&(
            <button
              onClick={e=>{e.stopPropagation();onPremiumClick("hero_email_success")}}
              style={{
                marginTop:6,background:"none",border:"none",
                color:"var(--sg-mid,#686868)",fontSize:11,fontWeight:600,
                cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",
                textDecorationColor:"rgba(0,0,0,.2)",textUnderlineOffset:2,
              }}
            >
              {_t(lang,"Alertes en direct aussi ? Voir Premium →","Want live alerts too? See Premium →","¿Quieres alertas en vivo también? Ver Premium →")}
            </button>
          )}
        </div>
      )}
      </>)}
    </div>
  )
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
      const sargId=IS_NEW_REGION?b.id:BEACH_TO_SARG[b.id]
      const weekly=sargId&&sargData?.weekly?.[sargId]
      const enriched=sargData?._enrichedWeekly?.[`_interp_${b.id}`]
      const activeWeekly=weekly||enriched
      const fc1=activeWeekly?.forecast?.[1]
      const fc3=activeWeekly?.forecast?.[3]
      const drift=activeWeekly?.drift||null
      const arrivalDetected=!!activeWeekly?.arrivalDetected
      const arrivalStrength=activeWeekly?.arrivalStrength||0
      let score=0
      // 0. v3.1 unified Beach Score 0-100 (year-round multi-factor) — primary ranking signal
      // Heavily weighted (×3) so a 90/100 beach beats a clean beach with no weather data.
      if(typeof b.score==="number")score+=b.score*3
      // 1. Status today (dominant — legacy signal still contributes)
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
    // v3.1: arrival ALWAYS wins over scoreReason (actionable threat)
    if(top._arrivalDetected&&top.status==="clean"){
      return _t(lang,"Propre mais banc en approche","Clean now — sargassum bank approaching","Limpia pero con banco de sargazo en camino")
    }
    // v3.1: if we have a unified score reason (FR only for now), use it
    if(top.scoreReason&&lang==="fr"&&!top.beachMemory&&top.status==="clean"){
      return top.scoreReason
    }
    if(top._communityReports&&top._communityReports.total>=3){
      return _t(lang,`${top._communityReports.total} signalements visiteurs sur place`,`${top._communityReports.total} visitor reports on site`,`${top._communityReports.total} reportes de visitantes en el lugar`)
    }
    if(top.beachMemory)return _t(lang,"Mémoire échouage — vérifie sur place","Recent beaching — check on site","Llegada reciente — verifica en el lugar")
    if(top.status==="avoid")return _t(lang,"Conditions difficiles partout","Difficult conditions island-wide","Condiciones difíciles en toda la zona")
    if(top.status==="moderate")return _t(lang,"Modéré — vérifie sur place","Moderate — verify on site","Moderado — verifica en el lugar")
    // Top is clean — look ahead
    if(fc1&&fc1.status&&fc1.status!=="clean"){
      return _t(lang,`Propre aujourd'hui, ${statusFromAfai(fc1.afai)==="moderate"?"modéré":"alerte"} demain`,`Clean today but ${fc1.status} tomorrow`,`Limpia hoy, ${statusFromAfai(fc1.afai)==="moderate"?"moderado":"alerta"} mañana`)
    }
    if(fc3&&fc3.status&&fc3.status!=="clean"){
      return _t(lang,`Propre — ${statusFromAfai(fc3.afai)==="moderate"?"modéré":"alerte"} dans 3 jours`,`Clean now — ${fc3.status} in 3 days`,`Limpia — ${statusFromAfai(fc3.afai)==="moderate"?"moderado":"alerta"} en 3 días`)
    }
    if(drift==="up"){
      return _t(lang,"Propre mais sargasses en approche","Clean now but sargassum drifting in","Limpia pero con sargazo acercándose")
    }
    if(weather?.precipitation>5){
      return _t(lang,`Propre mais pluie ${Math.round(weather.precipitation)}mm aujourd'hui`,`Clean but rain ${Math.round(weather.precipitation)}mm today`,`Limpia pero con lluvia ${Math.round(weather.precipitation)}mm hoy`)
    }
    if(weather?.wind!=null&&weather.windDir!=null){
      const wd=windCompass(weather.windDir,lang)
      return _t(lang,`Vent ${wd} ${weather.wind}km/h · propre et stable`,`Wind ${wd} ${weather.wind}km/h · clean & stable`,`Viento ${wd} ${weather.wind}km/h · limpia y estable`)
    }
    return _t(lang,"Conditions stables","Stable conditions","Condiciones estables")
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
      left:"max(12px, 3vw)",right:"max(12px, 3vw)",zIndex:720,
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
        {typeof top.score==="number"?(
          <div style={{
            width:48,height:48,borderRadius:"50%",flexShrink:0,
            background:`conic-gradient(${top.scoreColor||topSt.c} ${top.score*3.6}deg, rgba(0,0,0,.06) ${top.score*3.6}deg)`,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>
            <div style={{width:38,height:38,borderRadius:"50%",background:"var(--sg-card,#fff)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:17,lineHeight:1,color:top.scoreColor||topSt.c}}>
                {top.score}
              </span>
              <span style={{fontSize:7,fontWeight:700,color:"var(--sg-mid,#686868)",letterSpacing:".04em"}}>/100</span>
            </div>
          </div>
        ):(
          <div style={{
            width:44,height:44,borderRadius:14,flexShrink:0,
            background:topSt.bg,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:22,
          }}>{topSt.e}</div>
        )}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9.5,fontWeight:700,color:"var(--sg-mid,#686868)",letterSpacing:".05em",
            textTransform:"uppercase",marginBottom:2}}>
            {typeof top.score==="number"
              ?_t(lang,`Meilleure plage aujourd'hui · ${scoreLabelFor(top.scoreLabel,lang)||""}`,`Best beach today · ${scoreLabelFor(top.scoreLabel,lang)||""}`,`Mejor playa hoy · ${scoreLabelFor(top.scoreLabel,lang)||""}`)
              :_t(lang,"Ta meilleure plage maintenant","Best beach now","Tu mejor playa ahora")}
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
          {_t(lang,"Y aller","Go there","Cómo llegar")}
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
                ?_t(lang,"Moins ▲","Less ▲","Menos ▲")
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
                  {lang==="es"?altSt.les:lang==="en"?altSt.le:altSt.l}
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
   PREMIUM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
/* StripeInlineCheckout was removed session 36: payV="link" was hardcoded after
   pay1 test ended (link=3, inline=0), so the inline form was unreachable dead
   code whose Stripe.js 4s timeout fallback produced fake sg_checkout_view/submit
   events that polluted the funnel. All paid conversion now flows through the
   Stripe Payment Link via same-tab redirect (window.location.href in the modal
   CTA) + dashboard-configured success_url that fires sg_conversion on return. */
function PremiumModal({onClose,lang,source,onActivated,sargData,island}){
  const LL=T[lang]||T.fr
  const hasAnnual=!!LINK_ANNUAL
  const hasPro=!!LINK_PRO
  // isPro = user has paid for the Pro tier (9.99€, unlocks WhatsApp alerts,
  // 14-day forecast, priority email support). Separate flag from sg_premium
  // so existing €4.99 subs keep their current access; Pro is strictly additive.
  const isPro=typeof window!=="undefined"&&localStorage.getItem("sg_premium_pro")==="1"
  // Real beach data from live sargassum.json — makes the "morning brief" preview genuine
  // levels is keyed by numeric index ("0","1",...); beach id is in b.id field
  const _lvls=Object.values(sargData?.levels||{})
  const _islandLvls=_lvls.filter(b=>island==="gp"?b.id?.startsWith("gp-"):!b.id?.startsWith("gp-"))
  // Même source que le header de liste (status==='clean') — l'ancien seuil
  // score>=70 contredisait le compte "{x}/{y} plages propres" affiché ailleurs.
  const _cleanCount=_islandLvls.filter(b=>b.status==="clean").length
  const _totalCount=_islandLvls.length
  const _topBeach=[..._islandLvls].sort((a,b)=>b.score-a.score)[0]
  // Nouvelles régions : ids opaques (pc001…) → nom réel depuis REGION.beaches.
  // MQ/GP : derivation slug historique inchangée.
  const _nameOf=lv=>(IS_NEW_REGION?REGION.beaches?.find(b=>b.id===lv?.id)?.name:null)
    ||lv?.id?.replace(/^gp-/,"").split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")||null
  const _topName=_nameOf(_topBeach)
  const _topScore=_topBeach?.score||null
  // Value card 02 : destination = vraie plage propre du jour calculée du live —
  // plus aucun nom de plage inventé ni changement d'état fabriqué.
  const _cleanTop=_islandLvls.filter(b=>b.status==="clean").sort((a,b)=>(b.score||0)-(a.score||0))[0]
  const _exSwitch=_nameOf(_cleanTop)||_topName||null
  // Value card 03 : vraie meilleure plage du samedi depuis le forecast hebdo.
  // Suffixe enfants UNIQUEMENT si kids:true dans la donnée région.
  const _kidsOf=lv=>{
    if(!lv)return false
    if(IS_NEW_REGION)return !!REGION.beaches?.find(b=>b.id===lv.id)?.kids
    return !!BEACHES_FALLBACK.find(b=>b.id===SARG_TO_BEACH[lv.id])?.kids
  }
  const _wkend=(()=>{
    const wk=sargData?.weekly||{}
    const ref=_islandLvls.map(lv=>wk[lv.id]?.forecast).find(f=>Array.isArray(f)&&f.length)
    if(!ref)return null
    let satIdx=-1,sunIdx=-1
    ref.forEach((f,i)=>{
      if(!f?.date)return
      const dow=new Date(f.date+"T12:00:00Z").getUTCDay()
      if(satIdx<0&&dow===6)satIdx=i
      if(sunIdx<0&&dow===0&&i>0)sunIdx=i
    })
    if(satIdx<0)return null
    const cand=_islandLvls.map(lv=>{
      const fc=wk[lv.id]?.forecast
      if(!fc?.[satIdx]?.status)return null
      return{lv,sat:fc[satIdx].status,sun:fc[sunIdx]?.status||null}
    }).filter(Boolean)
    if(!cand.length)return null
    const cleanSat=cand.filter(c=>c.sat==="clean").sort((a,b)=>(b.lv.score||0)-(a.lv.score||0))
    const pick=cleanSat[0]||[...cand].sort((a,b)=>(b.lv.score||0)-(a.lv.score||0))[0]
    const name=_nameOf(pick.lv)
    if(!name)return null
    return{name,sat:pick.sat,kids:_kidsOf(pick.lv),allClean:pick.sat==="clean"&&pick.sun==="clean"}
  })()
  const modalOpenedAt=useRef(Date.now())
  const panelRef=useRef(null)
  const startYRef=useRef(0)
  // Swipe-down to dismiss
  const onTouchStartModal=e=>{startYRef.current=e.touches[0].clientY}
  const onTouchMoveModal=e=>{
    if(panelRef.current&&panelRef.current.scrollTop>5)return
    const dy=e.touches[0].clientY-startYRef.current
    if(dy>0&&panelRef.current)panelRef.current.style.transform=`translateY(${dy}px)`
  }
  const onTouchEndModal=e=>{
    if(panelRef.current&&panelRef.current.scrollTop>5){if(panelRef.current)panelRef.current.style.transform="";return}
    const dy=(e.changedTouches[0]?.clientY||0)-startYRef.current
    if(dy>60)onClose()
    else if(panelRef.current){panelRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";panelRef.current.style.transform="";setTimeout(()=>{if(panelRef.current)panelRef.current.style.transition=""},300)}
  }
  // Escape key to close
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape"){const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts});onClose()}}
    document.addEventListener("keydown",h)
    return()=>document.removeEventListener("keydown",h)
  },[onClose,source])
  // Annuel par défaut (best practice SaaS : AOV +60%, churn plus bas, cash
  // upfront) quand un lien annuel existe — sinon mensuel. Le badge -33% et le
  // prix /mois équivalent vendent l'annuel sans forcer l'user à diviser.
  // USD (no-trial) : Mensuel par défaut — audit Starlink 2026-06-11 : leur 1er
  // contact prix est TOUJOURS mensuel ; un « $79 billed today » présélectionné
  // 60s après la découverte = le point de rupture probable. EUR inchangé (A/B).
  const[plan,setPlan]=useState(hasAnnual&&!NO_TRIAL?"annual":"monthly")
  // effectivePlan is what we ship to Stripe on CTA click. Fallback chain:
  //   pro → annual → monthly, only if Stripe Link is configured for that tier.
  const effectivePlan=
    (plan==="pro"&&hasPro)?"pro"
    :(plan==="annual"&&hasAnnual)?"annual"
    :"monthly"
  const stripeLinkFor={monthly:LINK_MONTHLY,annual:LINK_ANNUAL,pro:LINK_PRO}
  // Enrichit le Payment Link Stripe : prefilled_email (friction checkout -10/30%
  // selon Stripe, l'email est déjà en localStorage) + client_reference_id
  // (débloque l'attribution paiement→source/plan/région, aujourd'hui aveugle —
  // remonte dans le webhook + Stripe dashboard). buy.stripe.com = le processeur
  // de paiement choisi par l'user, pas un tiers : prefill standard et attendu.
  const stripeUrlWith=(link,plan)=>{
    if(!link)return link
    try{
      const u=new URL(link)
      const email=localStorage.getItem("sg_email")||""
      if(email)u.searchParams.set("prefilled_email",email)
      const ref=[IS_NEW_REGION?REGION.id:(island||"mq"),plan||effectivePlan,source||"unknown"].join("_").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,200)
      u.searchParams.set("client_reference_id",ref)
      return u.toString()
    }catch{return link}
  }
  // ── Checkout ON-SITE (Stripe Payment Element, design maison) ──────────────
  // Formulaire de paiement DANS le modal, aux couleurs de l'app : Payment
  // Element (carte+Link) + Express Checkout (Apple/Google Pay), thème sombre.
  // AUCUN redirect, AUCUNE iframe Checkout (l'embedded mesuré 12-27s le
  // 2026-06-10 a été retiré sur feedback utilisateur). Le SetupIntent +
  // js.stripe.com sont préchauffés à l'ouverture du paywall (~1s) ; au clic,
  // les Elements montent en <1s. confirmSetup (3DS en iframe, jamais de
  // redirect: types card+link only) → action subscribe (essai 7j, prix
  // région) → premium activé EN PLACE. Fallback intégral : Payment Link.
  const[payStep,_setPayStep]=useState(false)
  const payStepRef=useRef(false)
  const setPayStep=useCallback(v=>{payStepRef.current=v;_setPayStep(v)},[])
  const[payReady,setPayReady]=useState(false)
  const[payBusy,setPayBusy]=useState(false)
  const[payError,setPayError]=useState("")
  const stripeRef=useRef(null)
  const elementsRef=useRef(null)
  const setupSecretRef=useRef(null)
  const payPrewarmPromiseRef=useRef(null)
  const payMountedRef=useRef(false)
  const payPlanRef=useRef("monthly")
  const payReadyRef=useRef(false)
  const payEmailRef=useRef(null)
  const payDivRef=useRef(null)
  const expressDivRef=useRef(null)
  // Préchauffage COMPLET dès l'ouverture du paywall : SetupIntent + stripe.js
  // + Elements + MOUNT du Payment Element dans l'overlay caché. Mesuré
  // 2026-06-10 : stripe.js ~15s + boot de l'élément ~12s sur ce réseau — tout
  // doit booter PENDANT la lecture du paywall, pas au clic. Un SetupIntent
  // n'est pas lié au plan → un seul prewarm pour tout le modal.
  useEffect(()=>{
    if(!PAYWALL_READY)return
    payPrewarmPromiseRef.current=(async()=>{
      const[r]=await Promise.all([
        fetch("/api/create-checkout.php",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"setup"})}),
        loadStripeJs(),
      ])
      if(!r.ok)throw new Error("http "+r.status)
      const{clientSecret}=await r.json()
      if(!clientSecret)throw new Error("no clientSecret")
      setupSecretRef.current=clientSecret
      stripeRef.current=window.Stripe(STRIPE_PK)
      elementsRef.current=stripeRef.current.elements({
        clientSecret,
        appearance:{theme:"night",variables:{
          colorPrimary:"#FFC72C",colorBackground:"#13261F",colorText:"#e6edf3",
          colorDanger:"#E8522A",borderRadius:"12px",fontSizeBase:"15px",
        }},
      })
      // Pré-mount dans l'overlay caché (toujours rendu) — ready pendant la lecture
      if(!payMountedRef.current&&payDivRef.current){
        // Friction minimale : le champ telephone venait de l'enrolement Link —
        // Link retire du SetupIntent (card only) = plus de telephone. NE PAS
        // ajouter fields.billingDetails.phone:never ici : teste 2026-06-10, le
        // Payment Element ne boote plus (ready ne fire jamais) avec cette option.
        // business.name : sans lui le mandat Stripe affiche « you allow PAY to
        // charge your card » — entité sans nom à l'instant exact de la décision
        // (audit checkout 2026-06-11). defaultValues.country : le fallback était
        // « Martinique » (pays du compte) sur les sites USD — chaque visiteur US
        // devait corriger + signal site étranger. EUR : comportement inchangé.
        const brandName=IS_NEW_REGION
          ?((lang==="es"?"Sargazo ":"Sargassum ")+String(REGION.name||""))
          :"Sargasses Martinique"
        const pe=elementsRef.current.create("payment",{layout:"tabs",
          business:{name:brandName},
          ...(IS_NEW_REGION?{defaultValues:{billingDetails:{address:{country:REGION.countryCode||"US"}}}}:{}),
        })
        pe.mount(payDivRef.current)
        pe.on("ready",()=>{payReadyRef.current=true;setPayReady(true)})
        try{
          const ece=elementsRef.current.create("expressCheckout")
          ece.mount(expressDivRef.current)
          ece.on("confirm",(ev)=>{
            try{const em=ev?.billingDetails?.email;if(em&&payEmailRef.current&&!payEmailRef.current.value)payEmailRef.current.value=em}catch(_){}
            doSubscribeRef.current()
          })
        }catch(_){/* wallets indisponibles : la carte suffit */}
        payMountedRef.current=true
      }
    })()
    payPrewarmPromiseRef.current.catch(()=>{}) // l'échec est géré au clic (fallback)
  },[])
  const doSubscribe=useCallback(async()=>{
    const plan=payPlanRef.current
    if(payBusy)return
    const email=(payEmailRef.current?.value||"").trim()
    if(!email||!email.includes("@")||!email.includes(".")){
      setPayError(_t(lang,"Entre ton email pour recevoir ton accès.","Enter your email to receive your access.","Introduce tu email para recibir tu acceso."))
      return
    }
    setPayBusy(true);setPayError("")
    try{
      const{error:subErr}=await elementsRef.current.submit()
      if(subErr)throw subErr
      const{error,setupIntent}=await stripeRef.current.confirmSetup({
        elements:elementsRef.current,clientSecret:setupSecretRef.current,
        redirect:"if_required",
        confirmParams:{return_url:window.location.origin+"/?setup_return=1",payment_method_data:{billing_details:{email}}},
      })
      if(error)throw error
      const r=await fetch("/api/create-checkout.php",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"subscribe",email,plan,setupIntentId:setupIntent.id,lang,source:source||"unknown"})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok||d.error||!d.subscriptionId)throw new Error(d.error||"subscribe failed")
      // NO_TRIAL (USD) : la 1re facture part immédiatement — si la banque
      // exige une confirmation (3DS), on la joue ici, dans le même écran.
      if(d.paymentFailed)throw new Error(_t(lang,"Carte refusée. Essaie une autre carte ou continue sur Stripe.","Card declined. Try another card or continue on Stripe.","Tarjeta rechazada. Prueba otra o continúa en Stripe."))
      if(d.requiresAction&&d.piClientSecret){
        const{error:payErr,paymentIntent}=await stripeRef.current.confirmCardPayment(d.piClientSecret)
        if(payErr)throw payErr
        if(paymentIntent&&paymentIntent.status!=="succeeded"&&paymentIntent.status!=="processing"){
          throw new Error(_t(lang,"Paiement non confirmé. Réessaie ou continue sur Stripe.","Payment not confirmed. Retry or continue on Stripe.","Pago no confirmado. Reintenta o continúa en Stripe."))
        }
        track("sg_pay_onsite_3ds",{plan,status:paymentIntent?.status||"unknown"})
      }
      // SUCCÈS — premium activé en place, zéro redirect
      localStorage.setItem("sg_email",email)
      localStorage.setItem("sg_premium","1")
      localStorage.setItem("sg_premium_email",email)
      if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
      track("sg_conversion",{session_id:d.subscriptionId,method:"onsite",plan})
      setPayBusy(false)
      onActivated?.()
      onClose()
    }catch(e){
      setPayBusy(false)
      const msg=(e&&e.message)?String(e.message):""
      setPayError(msg||_t(lang,"Paiement impossible. Réessaie ou continue sur Stripe.","Payment failed. Retry or continue on Stripe.","Pago imposible. Reintenta o continúa en Stripe."))
      track("sg_pay_onsite_error",{plan,message:msg.slice(0,90)})
    }
  },[lang,source,payBusy,onActivated,onClose])
  const doSubscribeRef=useRef(doSubscribe)
  useEffect(()=>{doSubscribeRef.current=doSubscribe},[doSubscribe])
  const startCheckout=useCallback(async(plan,via)=>{
    const link=stripeUrlWith(stripeLinkFor[plan]||LINK_MONTHLY,plan)
    const goFallback=(why)=>{
      setPayStep(false)
      track("sg_checkout_redirect",{plan,source:source||"unknown",destination:"payment_link",via:via+"_"+why})
      setTimeout(()=>{window.location.href=link},0)
    }
    payPlanRef.current=plan
    track("sg_checkout_redirect",{plan,source:source||"unknown",destination:"onsite",via})
    setPayStep(true) // révèle l'étape (le formulaire pré-monté est déjà prêt ou boote)
    const t0=Date.now()
    try{
      // Le prewarm a déjà tout lancé à l'ouverture du modal. Budget large :
      // l'étape est visible avec spinner + bouton d'échappe vers Stripe.
      await Promise.race([
        payPrewarmPromiseRef.current||Promise.reject(new Error("no prewarm")),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error("prewarm timeout")),20000)),
      ])
      track("sg_pay_onsite_open",{plan,via,ms:Date.now()-t0,ready:payReadyRef.current})
      // L'élément monte (ou est monté) ; si jamais ready n'arrive pas, on bascule.
      setTimeout(()=>{
        if(payStepRef.current&&!payReadyRef.current&&payPlanRef.current===plan){
          try{console.error("sg_onsite_slow_element")}catch(_){}
          goFallback("slow")
        }
      },20000)
    }catch(e){
      try{console.error("sg_onsite_mount_fail",e)}catch(_){}
      goFallback("fallback")
    }
  },[source,lang])
  // A/B test pw_cta_order KILLED 2026-06-09 (scheduled ab-evaluate run):
  // sg_sample_start fired 0 times across 10,738 sessions over ~7 weeks. The
  // sample_first JSX branches + ctaOrder/sampleAvailable consts were removed
  // 2026-06-10 (dead-code cleanup) — paid-first (control) is the only layout.
  // Stripe Prelude A/B (pw_prelude): control=direct redirect (v1), prelude=2-step
  // micro-interstitial inside modal. Design v2 bet #2 — addresses the 50% drop
  // measured at redirect→payment by showing "exactly what happens" (plan summary,
  // timeline, trust row) before the tab navigates to buy.stripe.com.
  const preludeVariant=abVariant("pw_prelude",["direct","prelude"],[.5,.5])
  const[showPrelude,setShowPrelude]=useState(false)
  // Compute upcoming dates for the Prelude ledger
  const _preludeDates=(()=>{
    const today=new Date()
    const remindDate=new Date(today.getTime()+5*24*3600*1000)
    const chargeDate=new Date(today.getTime()+7*24*3600*1000)
    const fmt=d=>d.toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{day:"numeric",month:"long"})
    return{remind:fmt(remindDate),charge:fmt(chargeDate)}
  })()
  // Seasonal urgency — sargassum season is April-September
  const now=new Date()
  const seasonStart=new Date(now.getFullYear(),3,20) // ~20 April
  const daysToSeason=Math.max(0,Math.ceil((seasonStart-now)/(1000*60*60*24)))
  const seasonMsg=daysToSeason>0
    ?_t(lang,`La saison commence dans ${daysToSeason} jours`,`Season starts in ${daysToSeason} days`,`La temporada empieza en ${daysToSeason} días`)
    :_t(lang,"La saison des sargasses est là","Sargassum season is here","La temporada de sargazo ya está aquí")
  return(
    <>
      <div className="backdrop" onClick={(e)=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts});const x=e.clientX,y=e.clientY;onClose();/* pass-through : si le clic tombe pile sur un pin de la carte (sous le backdrop), ouvrir cette plage au lieu de juste fermer — sinon le clic paraît "mort" */requestAnimationFrame(()=>{try{const el=document.elementFromPoint(x,y);const pin=el&&el.closest&&el.closest(".leaflet-marker-icon");if(pin)pin.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y}))}catch(_){}})}}/>
      <div ref={panelRef} className="sg-modal-panel" onTouchStart={onTouchStartModal} onTouchMove={onTouchMoveModal} onTouchEnd={onTouchEndModal} style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:1100,
        background:"linear-gradient(145deg,#0D1E1C,#0A1714)",
        borderRadius:"24px 24px 0 0",padding:"28px 24px 20px",
        color:"#e6edf3",maxHeight:"85vh",overflow:"auto",
      }}>
        <div className="sheet-handle" style={{background:"rgba(255,255,255,.2)"}}/>
        {/* Close X top-right — resolves Design feedback "no close affordance
            visible, users dismiss by backdrop tap". Sticky so always reachable
            even when modal is scrolled. */}
        <button
          aria-label={_t(lang,"Fermer","Close","Cerrar")}
          onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"close_x"});onClose()}}
          style={{position:"absolute",top:14,right:14,width:30,height:30,
            borderRadius:"50%",background:"rgba(255,255,255,.08)",border:"none",
            color:"rgba(255,255,255,.7)",fontSize:18,cursor:"pointer",lineHeight:1,
            zIndex:5,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        <div style={{borderTop:`3px solid ${C.gold}`,borderRadius:"3px 3px 0 0",
          margin:"-8px -24px 20px",padding:0}}/>

        {/* ═══ STRIPE PRELUDE (Design v2 bet #2) ═══
            A/B variant "prelude": intercepts the paid CTA click and shows
            this 2nd screen INSIDE the modal — plan summary + dates timeline
            + 3 trust badges — before redirecting to Stripe. Addresses the
            50% drop measured at redirect→payment (users abandon when they
            see an unfamiliar buy.stripe.com URL after leaving the app).
            Back arrow returns to the paywall. Continue → actual redirect. */}
        {showPrelude&&(
        <div style={{position:"absolute",inset:0,zIndex:10,
          background:"linear-gradient(145deg,#0D1E1C,#0A1714)",
          borderRadius:"24px 24px 0 0",padding:"28px 24px 20px",overflow:"auto",
          display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <button
              aria-label={_t(lang,"Retour","Back","Atrás")}
              onClick={()=>{track("sg_prelude_back",{source:source||"unknown"});setShowPrelude(false)}}
              style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.08)",
                border:"none",color:"rgba(255,255,255,.85)",fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"inherit"}}>‹</button>
            <div style={{display:"flex",gap:4,flex:1}}>
              <span style={{flex:1,height:3,borderRadius:2,background:"rgba(255,199,44,.35)"}}/>
              <span style={{flex:1,height:3,borderRadius:2,background:"#FFC72C"}}/>
              <span style={{flex:1,height:3,borderRadius:2,background:"rgba(255,255,255,.12)"}}/>
            </div>
            <button
              aria-label={_t(lang,"Fermer","Close","Cerrar")}
              onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"prelude_close"});onClose()}}
              style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.08)",
                border:"none",color:"rgba(255,255,255,.85)",fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"inherit"}}>×</button>
          </div>

          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10.5,color:"#14C4B0",
            letterSpacing:".18em",textTransform:"uppercase",marginBottom:8}}>
            {/* USD : paiement on-site — « rediriger » serait faux (audit 2026-06-11).
                EUR : Payment Link = vraie redirection, copy d'origine (A/B intouchable). */}
            {NO_TRIAL
              ?_t(lang,"Avant de payer","Before you pay","Antes de pagar")
              :_t(lang,"Avant de te rediriger","Before we redirect you","Antes de redirigirte")}
          </div>
          <h2 style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1.05,letterSpacing:"-.01em",color:"#fff",margin:"0 0 14px"}}>
            {lang==="es"?<>Esto es exactamente<br/>lo que pasa.</>:lang==="en"?<>Here's exactly<br/>what happens.</>:<>Voilà exactement<br/>ce qui se passe.</>}
          </h2>

          {/* Plan summary card */}
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:16,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,
              paddingBottom:12,borderBottom:"1px solid rgba(255,255,255,.08)",marginBottom:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>
                  {NO_TRIAL
                    ?(effectivePlan==="annual"?_t(lang,"Annuel — accès immédiat","Annual — instant access","Anual — acceso inmediato"):_t(lang,"Mensuel — accès immédiat","Monthly — instant access","Mensual — acceso inmediato"))
                    :(effectivePlan==="annual"?_t(lang,"Annuel · 7 jours offerts","Annual · 7 days free","Anual · 7 días gratis"):_t(lang,"Mensuel · 7 jours offerts","Monthly · 7 days free","Mensual · 7 días gratis"))}
                </div>
                <div style={{fontWeight:500,color:"rgba(255,255,255,.55)",fontSize:11,marginTop:2}}>
                  {NO_TRIAL
                    ?(effectivePlan==="annual"?_t(lang,`${PRICE_YR}/an · annule en 2 clics`,`${PRICE_YR}/yr · cancel in 2 clicks`,`${PRICE_YR}/año · cancela en 2 clics`):_t(lang,`${PRICE_MO}/mois · annule en 2 clics`,`${PRICE_MO}/mo · cancel in 2 clicks`,`${PRICE_MO}/mes · cancela en 2 clics`))
                    :(effectivePlan==="annual"?(REGION_PAY?_t(lang,`Puis ${PRICE_YR}/an · annule en 1 clic`,`Then ${PRICE_YR}/yr · cancel anytime`,`Luego ${PRICE_YR}/año · cancela en 1 clic`):_t(lang,"Puis 39,99 €/an · annule en 1 clic","Then €39.99/yr · cancel anytime","Luego 39,99 €/año · cancela en 1 clic")):(REGION_PAY?_t(lang,`Puis ${PRICE_MO}/mois · annule en 1 clic`,`Then ${PRICE_MO}/mo · cancel anytime`,`Luego ${PRICE_MO}/mes · cancela en 1 clic`):_t(lang,"Puis 4,99 €/mois · annule en 1 clic","Then €4.99/mo · cancel anytime","Luego 4,99 €/mes · cancela en 1 clic")))}
                </div>
              </div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"#FFC72C",letterSpacing:"-.01em",textAlign:"right"}}>
                {NO_TRIAL?(effectivePlan==="annual"?PRICE_YR:PRICE_MO):(REGION_PAY?"$0":"0 €")}
                <div style={{fontFamily:"inherit",fontWeight:500,fontSize:11,color:"rgba(255,199,44,.7)",marginTop:2,letterSpacing:0}}>
                  {_t(lang,"aujourd'hui","today","hoy")}
                </div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12.5}}>
              {(NO_TRIAL?[
                {k:_t(lang,"Aujourd'hui","Today","Hoy"),v:_t(lang,`${effectivePlan==="annual"?PRICE_YR:PRICE_MO} · accès complet immédiat`,`${effectivePlan==="annual"?PRICE_YR:PRICE_MO} · full access right away`,`${effectivePlan==="annual"?PRICE_YR:PRICE_MO} · acceso completo ya`)},
                {k:_t(lang,"Chaque matin","Every morning","Cada mañana"),v:_t(lang,"Ta meilleure plage + alertes","Your best beach + alerts","Tu mejor playa + alertas")},
                {k:_t(lang,"Quand tu veux","Anytime","Cuando quieras"),v:_t(lang,"Annule en 2 clics","Cancel in 2 clicks","Cancela en 2 clics")},
              ]:[
                {k:_t(lang,"Aujourd'hui","Today","Hoy"),v:REGION_PAY?_t(lang,"$0 · tu testes 7 jours","$0 · 7-day trial starts","$0 · empieza tu prueba de 7 días"):_t(lang,"0 € · tu testes 7 jours","€0 · 7-day trial starts","0 € · empieza tu prueba de 7 días")},
                {k:_preludeDates.remind,v:_t(lang,"Rappel · 2 jours avant la 1re charge","Reminder · 2 days before first charge","Recordatorio · 2 días antes del primer cobro")},
                {k:_preludeDates.charge,v:effectivePlan==="annual"?(REGION_PAY?_t(lang,`${PRICE_YR} · sauf si tu annules`,`${PRICE_YR} · unless you cancel`,`${PRICE_YR} · a menos que canceles`):_t(lang,"39,99 € · sauf si tu annules","€39.99 · unless you cancel","39,99 € · a menos que canceles")):(REGION_PAY?_t(lang,`${PRICE_MO} · sauf si tu annules`,`${PRICE_MO} · unless you cancel`,`${PRICE_MO} · a menos que canceles`):_t(lang,"4,99 € · sauf si tu annules","€4.99 · unless you cancel","4,99 € · a menos que canceles"))},
              ]).map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:"rgba(255,255,255,.72)"}}>{r.k}</span>
                  <span style={{color:"#fff",fontWeight:600,textAlign:"right"}}>{r.v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                paddingTop:8,borderTop:"1px dashed rgba(255,255,255,.12)",marginTop:2}}>
                <span style={{color:"rgba(255,255,255,.72)"}}>{_t(lang,"À payer aujourd'hui","Due today","A pagar hoy")}</span>
                <span style={{color:"#22C55E",fontFamily:"'Anton',sans-serif",fontSize:15,letterSpacing:"-.01em"}}>{NO_TRIAL?(effectivePlan==="annual"?PRICE_YR:PRICE_MO):(REGION_PAY?"$0.00":"0,00 €")}</span>
              </div>
            </div>
          </div>

          {/* Trust row 3 columns */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
            {[
              {icon:"🛡",title:"Stripe",sub:REGION_PAY?_t(lang,"Paiement sécurisé","Secure payment","Pago seguro"):_t(lang,"Paiement sécurisé EU","EU secure payment","Pago seguro UE")},
              {icon:"⏱",title:_t(lang,"30 jours","30 days","30 días"),sub:_t(lang,"Satisfait ou remboursé","Money-back","Reembolso garantizado")},
              {icon:"✕",title:NO_TRIAL?_t(lang,"2 clics","2 clicks","2 clics"):_t(lang,"1 clic","1 click","1 clic"),sub:_t(lang,"Annule quand tu veux","Cancel anytime","Cancela cuando quieras")},
            ].map((t,i)=>(
              <div key={i} style={{padding:"10px 8px",borderRadius:10,
                background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
                display:"flex",flexDirection:"column",alignItems:"center",gap:4,textAlign:"center"}}>
                <span style={{fontSize:18,color:"#14C4B0"}}>{t.icon}</span>
                <b style={{fontSize:10.5,color:"#fff",fontWeight:700}}>{t.title}</b>
                <span style={{fontSize:9.5,color:"rgba(255,255,255,.55)",lineHeight:1.3}}>{t.sub}</span>
              </div>
            ))}
          </div>

          {/* Continue to Stripe CTA — checkout in-app (fallback Payment Link) */}
          <button onClick={()=>{
            startCheckout(effectivePlan,"prelude")
          }} className="gbtn" style={{width:"100%",padding:14,borderRadius:14,border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,lineHeight:1.15,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {NO_TRIAL
              ?_t(lang,"Continuer — paiement sécurisé","Continue to secure payment","Continuar — pago seguro")
              :_t(lang,"Continuer vers Stripe","Continue to Stripe","Continuar a Stripe")} →
          </button>
          <div style={{textAlign:"center",fontSize:10.5,color:"rgba(255,255,255,.48)",marginTop:10}}>
            {_t(lang,"Tu pourras toujours revenir en arrière.","You can always come back.","Siempre puedes volver atrás.")}
          </div>
        </div>
        )}

        {/* Seasonal eyebrow — Design v1 spec: gold dot + white text UPPERCASE tracking,
            replaces the old orange-on-dark badge which was unreadable (Design feedback #2).
            Pulsing dot = signal, text = fact. No box border competing with the card stack. */}
        <div style={{marginBottom:14,fontFamily:"'Anton',sans-serif",
          fontSize:10.5,color:"#FFC72C",letterSpacing:".14em",textTransform:"uppercase",
          display:"flex",alignItems:"center",gap:8}}>
          <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",
            background:"#FFC72C",boxShadow:"0 0 8px rgba(255,199,44,.8)",
            animation:"pwDot 1.6s ease-in-out infinite"}}/>
          <span>{seasonMsg}</span>
        </div>
        <style>{`@keyframes pwDot{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

        {/* Repositionnement (audit funnel) : le titre vendait "ta reco du matin"
            = exactement ce que le GRATUIT donne déjà (HeroReco) → cannibalisation,
            modal→CTA à 1,1%. On vend ce que le free n'a PAS : l'alerte AVANT que
            la plage tourne. La reco du matin reste listée dans les value-cards. */}
        <h2 className="anton" style={{fontSize:"clamp(22px,6vw,28px)",color:"#fff",marginBottom:18,lineHeight:1.1,letterSpacing:"-.015em"}}>
          {(()=>{const G={background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",color:"transparent"};
            return lang==="es"?(<><span style={G}>Entérate</span> antes de que tu playa cambie</>)
              :lang==="en"?(<><span style={G}>Know</span> before your beach turns</>)
              :(<>Sois <span style={G}>prévenu</span> avant que ta plage tourne</>)})()}
        </h2>

        {/* Value cards stack — wrapped in a relative container so we can lay
            a soft gold halo behind all 3 cards. Why: the dark modal needs one
            warm focal area to anchor the eye on the promise. (sample_first
            dead branches removed 2026-06-10 — A/B pw_cta_order killed.) */}
        <div style={{position:"relative",marginBottom:16}}>
          <div aria-hidden style={{
            position:"absolute",inset:"-8px -20px",borderRadius:24,
            background:"radial-gradient(60% 70% at 50% 0%, rgba(255,199,44,.09) 0%, transparent 70%)",
            pointerEvents:"none",
          }}/>

          {/* Card 01 — morning brief (gold accent, the hero promise) */}
          <div style={{position:"relative",
            background:"linear-gradient(180deg,rgba(255,199,44,.09),rgba(255,199,44,.04))",
            border:"1px solid rgba(255,199,44,.28)",
            borderRadius:18,padding:"14px 16px 14px 18px",marginBottom:10,
            boxShadow:"0 8px 24px -14px rgba(255,199,44,.3), inset 0 1px 0 rgba(255,255,255,.06)",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{
              fontFamily:"'Anton',sans-serif",fontSize:30,lineHeight:1,
              color:"transparent",
              background:"linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E89400)",
              WebkitBackgroundClip:"text",backgroundClip:"text",
              letterSpacing:"-.02em",flexShrink:0,width:30,textAlign:"center",
            }}>01</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:9.5,color:"rgba(255,199,44,.75)",marginBottom:4,fontWeight:800,letterSpacing:".08em"}}>
                {_t(lang,"CHAQUE MATIN · 7H","EVERY MORNING · 7AM","CADA MAÑANA · 7AM")}
              </div>
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {_topName
                  ?_t(lang,`Ta meilleure plage : ${_topName}`,`Your best beach today: ${_topName}`,`Tu mejor playa hoy: ${_topName}`)
                  :IS_NEW_REGION
                  ?_t(lang,`Ta meilleure plage : ${REGION.beaches?.[0]?.name||REGION.name}`,`Your best beach today: ${REGION.beaches?.[0]?.name||REGION.name}`,`Tu mejor playa hoy: ${REGION.beaches?.[0]?.name||REGION.name}`)
                  :_t(lang,"Ta meilleure plage : Anse Dufour","Your best beach today: Anse Dufour","Tu mejor playa hoy: Anse Dufour")}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {_topScore
                  ?_t(lang,`Score ${_topScore}/100 · satellite`,`Score ${_topScore}/100 · satellite-verified`,`Score ${_topScore}/100 · verificado por satélite`)
                  :_t(lang,"Propre · 12 min · mer calme","Clean · 12 min drive · calm sea","Limpia · a 12 min · mar tranquilo")}
              </div>
            </div>
          </div>

          {/* Card 02 — instant alert */}
          <div style={{position:"relative",
            background:"linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02))",
            border:"1px solid rgba(255,255,255,.1)",
            borderRadius:18,padding:"14px 16px 14px 18px",marginBottom:10,
            boxShadow:"inset 0 1px 0 rgba(255,255,255,.05)",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{
              fontFamily:"'Anton',sans-serif",fontSize:30,lineHeight:1,
              color:"rgba(255,255,255,.22)",
              letterSpacing:"-.02em",flexShrink:0,width:30,textAlign:"center",
            }}>02</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:9.5,color:"rgba(255,255,255,.42)",marginBottom:4,fontWeight:800,letterSpacing:".08em"}}>
                {_t(lang,"ALERTE INSTANTANÉE","INSTANT ALERT","ALERTA INSTANTÁNEA")}
              </div>
              {/* Titre générique (plus de changement d'état fabriqué sur une
                  plage nommée) ; destination = vraie plage propre du jour. */}
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {_t(lang,"Ta plage favorite a changé","Your saved beach just changed","Tu playa favorita cambió")}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {_exSwitch
                  ?_t(lang,`Propre → Modéré — va à ${_exSwitch}`,`Clean → Moderate — switch to ${_exSwitch}`,`Limpia → Moderada — mejor ve a ${_exSwitch}`)
                  :_t(lang,"Propre → Modéré","Clean → Moderate","Limpia → Moderada")}
              </div>
            </div>
          </div>

          {/* Card 03 — weekend daily pick */}
          <div style={{position:"relative",
            background:"linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02))",
            border:"1px solid rgba(255,255,255,.1)",
            borderRadius:18,padding:"14px 16px 14px 18px",
            boxShadow:"inset 0 1px 0 rgba(255,255,255,.05)",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{
              fontFamily:"'Anton',sans-serif",fontSize:30,lineHeight:1,
              color:"rgba(255,255,255,.22)",
              letterSpacing:"-.02em",flexShrink:0,width:30,textAlign:"center",
            }}>03</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:9.5,color:"rgba(255,255,255,.42)",marginBottom:4,fontWeight:800,letterSpacing:".08em"}}>
                {_t(lang,"LE WEEKEND","WEEKEND FORECAST","EL FIN DE SEMANA")}
              </div>
              {/* Vraie meilleure plage du samedi (forecast hebdo). "Propre tout
                  le weekend" seulement si sam+dim réellement clean ; suffixe
                  enfants seulement si kids:true dans la donnée région. */}
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {_wkend
                  ?_t(lang,`Samedi : ${_wkend.name}`,`Best for Saturday: ${_wkend.name}`,`El sábado: ${_wkend.name}`)
                  :_t(lang,"Samedi : ta meilleure plage","Best for Saturday: your top beach","El sábado: tu mejor playa")}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {_wkend
                  ?(_wkend.allClean
                    ?_t(lang,`Propre tout le weekend${_wkend.kids?" · idéal enfants":""}`,`Clean all weekend${_wkend.kids?" · great for kids":""}`,`Limpia todo el fin de semana${_wkend.kids?" · ideal con niños":""}`)
                    :_t(lang,`${LL[_wkend.sat]||_wkend.sat} samedi`,`${LL[_wkend.sat]||_wkend.sat} on Saturday`,`${LL[_wkend.sat]||_wkend.sat} el sábado`))
                  :_t(lang,"Calculée depuis la prévision 7 jours","From the 7-day forecast","Según el pronóstico de 7 días")}
              </div>
            </div>
          </div>
        </div>

        {/* Ligne de preuve — chiffres réels uniquement : compte clean live ou,
            à défaut, le nombre réel de plages suivies dans le JSON région
            (le "135 plages surveillées" inventé est sorti). Data absente → rien. */}
        {_totalCount>0&&(
        <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:16}}>
          {_cleanCount>0
            ?_t(lang,`${_cleanCount}/${_totalCount} plages propres en ce moment · satellite 24/7`,`${_cleanCount}/${_totalCount} beaches clean right now · satellite 24/7`,`${_cleanCount}/${_totalCount} playas limpias ahora mismo · satélite 24/7`)
            :_t(lang,`Copernicus Sentinel · 4 analyses satellite/jour · ${_totalCount} plages suivies · prévisions 7 jours`,`Copernicus Sentinel · 4 satellite updates a day · ${_totalCount} beaches tracked · 7-day forecast`,`Copernicus Sentinel · 4 análisis satelitales al día · ${_totalCount} playas monitoreadas · pronóstico de 7 días`)}
        </div>
        )}

        {/* Timeline d'essai (pattern Blinkist, LOT 1 value-prop) — 3 étapes,
            montants liés au plan sélectionné. Commune aux 2 variantes
            pw_prelude (ne touche ni au flow ni aux Payment Links).
            Masquée en NO_TRIAL (USD) : il n'y a pas d'essai à raconter. */}
        {PAYWALL_READY&&!NO_TRIAL&&(
        <div style={{margin:"0 0 14px",padding:"12px 14px",borderRadius:14,
          background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
          {[
            {k:_t(lang,"Aujourd'hui","Today","Hoy"),v:_t(lang,"reco du jour + alertes débloquées","daily pick + alerts unlocked","tu playa del día + alertas activadas"),gold:true},
            {k:_t(lang,"Jour 5","Day 5","Día 5"),v:_t(lang,"on te prévient par email avant la facturation","heads-up email before you're ever charged","te avisamos por email antes del cobro")},
            {k:_t(lang,"Jour 7","Day 7","Día 7"),v:(()=>{
              const pr=effectivePlan==="annual"
                ?(REGION_PAY?`${PRICE_YR}${_t(lang,"/an","/yr","/año")}`:_t(lang,"39,99 €/an","€39.99/yr","39,99 €/año"))
                :(REGION_PAY?`${PRICE_MO}${_t(lang,"/mois","/mo","/mes")}`:_t(lang,"4,99 €/mois","€4.99/mo","4,99 €/mes"))
              return _t(lang,`${pr}, annulable en 2 clics`,`${pr}, cancel in 2 clicks`,`${pr}, cancela en 2 clics`)
            })()},
          ].map((r,i,arr)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,position:"relative",
              paddingBottom:i<arr.length-1?10:0}}>
              <span style={{display:"flex",flexDirection:"column",alignItems:"center",alignSelf:"stretch",flexShrink:0,width:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",marginTop:4,
                  background:r.gold?"#FFC72C":"rgba(255,255,255,.25)",
                  boxShadow:r.gold?"0 0 8px rgba(255,199,44,.7)":"none"}}/>
                {i<arr.length-1&&<span style={{flex:1,width:1.5,background:"rgba(255,255,255,.12)",marginTop:2}}/>}
              </span>
              <span style={{fontSize:12,lineHeight:1.35,color:"rgba(255,255,255,.78)"}}>
                <b style={{color:r.gold?"#FFC72C":"#fff",fontWeight:700}}>{r.k}</b> — {r.v}
              </span>
            </div>
          ))}
        </div>
        )}

        {/* CTA section — sticky so it's always visible even if user hasn't scrolled.
            Solid #0A1714 bg + fade-in shadow ABOVE so card 03 doesn't bleed through
            (was: transparent→ink gradient that made WEEKEND card visible under the
            plan toggle per screenshot 05-paywall-control.png). */}
        <div style={{position:"sticky",bottom:0,background:"#0A1714",
          paddingTop:12,paddingBottom:12,marginLeft:-24,marginRight:-24,paddingLeft:24,paddingRight:24,
          boxShadow:"0 -12px 16px -8px rgba(10,23,20,.85)"}}>

        {/* Plan toggle — monthly + annual. Wrapped in a 4px-padded grouped
            container with 5% white bg (Design v1 spec) — visually says "pick one,
            they're grouped" instead of loose side-by-side pill look. */}
        {hasAnnual&&(
        <div style={{display:"flex",gap:8,marginBottom:14,padding:4,
          background:"rgba(255,255,255,.05)",borderRadius:14}}>
          <button onClick={()=>{setPlan("monthly");track("sg_plan_toggle",{plan:"monthly"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",
            background:plan==="monthly"?"rgba(255,199,44,.12)":"transparent",
            border:plan==="monthly"?"1.5px solid rgba(255,199,44,.4)":"1.5px solid transparent",
            color:plan==="monthly"?"#fff":"rgba(255,255,255,.7)",fontSize:13,fontWeight:600,
            transition:"all .2s"}}>
            <div>{_t(lang,"Mensuel","Monthly","Mensual")}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{REGION_PAY?PRICE_MO:lang==="en"?"€4.99":"4,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{_t(lang,"mois","mo","mes")}</span></div>
          </button>
          <button onClick={()=>{setPlan("annual");track("sg_plan_toggle",{plan:"annual"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",position:"relative",
            background:plan==="annual"?"rgba(255,199,44,.12)":"transparent",
            border:plan==="annual"?"1.5px solid rgba(255,199,44,.4)":"1.5px solid transparent",
            color:plan==="annual"?"#fff":"rgba(255,255,255,.7)",fontSize:13,fontWeight:600,
            transition:"all .2s"}}>
            <div style={{position:"absolute",top:-8,right:8,background:C.gold,color:C.ink,
              fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:100,letterSpacing:".02em"}}>
              -33%
            </div>
            <div>{_t(lang,"Annuel","Annual","Anual")}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{REGION_PAY?PRICE_YR:lang==="en"?"€39.99":"39,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{_t(lang,"an","yr","año")}</span></div>
            {(()=>{
              // Prix /mois équivalent : l'user n'a plus à diviser (ancre l'annuel).
              const raw=REGION_PAY?PRICE_YR:"39.99"
              const sym=(raw.match(/[€$£]/)||["€"])[0]
              const n=parseFloat(raw.replace(/[^0-9.,]/g,"").replace(",","."))
              if(!n)return null
              // Virgule décimale UNIQUEMENT en FR (le Mexique écrit $6.58) ;
              // FR : nombre PUIS symbole (soit 3,33 €/mois), EN/ES : symbole avant.
              const eq=(n/12).toFixed(2).replace(".",lang==="fr"?",":".")
              return <div style={{fontSize:9.5,fontWeight:500,color:"rgba(255,255,255,.55)",marginTop:1}}>
                {_t(lang,`soit ${eq} ${sym}/mois`,`${sym}${eq}/mo billed yearly`,`${sym}${eq}/mes facturado al año`)}
              </div>
            })()}
          </button>
          {hasPro&&(
          <button onClick={()=>{setPlan("pro");track("sg_plan_toggle",{plan:"pro"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",position:"relative",
            background:plan==="pro"?"rgba(255,100,100,.12)":"transparent",
            border:plan==="pro"?"1.5px solid rgba(255,100,100,.45)":"1.5px solid transparent",
            color:plan==="pro"?"#fff":"rgba(255,255,255,.7)",fontSize:13,fontWeight:600,
            transition:"all .2s"}}>
            <div style={{position:"absolute",top:-8,right:8,background:"#ff6464",color:"#fff",
              fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:100,letterSpacing:".02em"}}>
              PRO
            </div>
            <div>Pro</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{lang==="en"?"€9.99":"9,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{_t(lang,"mois","mo","mes")}</span></div>
          </button>
          )}
        </div>
        )}
        {/* Cadrage journalier — toujours dérivé du prix réel parsé (jamais en
            dur) : mensuel/30, annuel/365. Comparaison soda uniquement sur les
            marchés USD touristes ; en EUR rester sobre. */}
        {PAYWALL_READY&&(()=>{
          const raw=effectivePlan==="annual"?(REGION_PAY?PRICE_YR:"39,99 €"):(REGION_PAY?PRICE_MO:"4,99 €")
          const n=parseFloat(String(raw).replace(/[^0-9.,]/g,"").replace(",","."))
          if(!n)return null
          const sym=(String(raw).match(/[€$£]/)||["€"])[0]
          const perDay=effectivePlan==="annual"?n/365:n/30
          const usd=sym==="$"
          const amt=usd?`$${perDay.toFixed(2)}`
            :lang==="en"?`€${perDay.toFixed(2)}`
            :`${perDay.toFixed(2).replace(".",",")} €`
          const soda=usd&&effectivePlan!=="annual"
          return(
            <div style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:12}}>
              {usd
                ?_t(lang,`≈ ${amt}/jour${soda?" — moins qu'un soda à la plage":""}`,`about ${amt}/day${soda?" — less than a beach soda":""}`,`unos ${amt} al día${soda?" — menos que un refresco en la playa":""}`)
                :_t(lang,`soit ~${amt}/jour`,`about ${amt}/day`,`unos ${amt}/día`)}
            </div>
          )
        })()}
        {/* Pro tier perks — only shown when Pro is selected and configured.
            Enables: WhatsApp instant alerts, 14-day forecast (vs 7), 90-day
            history, API access for power users (hoteliers, surfers, fishermen). */}
        {plan==="pro"&&hasPro&&(
        <div style={{background:"rgba(255,100,100,.05)",border:"1px solid rgba(255,100,100,.15)",
          borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:"rgba(255,255,255,.75)"}}>
          <div style={{fontWeight:700,color:"#ff8a8a",marginBottom:4}}>
            {_t(lang,"Dans Pro","What's in Pro","Qué incluye Pro")}
          </div>
          <div>• {_t(lang,"Alertes WhatsApp instantanées dès qu'une plage change","Instant WhatsApp alerts when a beach flips","Alertas instantáneas por WhatsApp cuando una playa cambia")}</div>
          <div>• {_t(lang,"Prévisions 14 jours (vs 7 standard)","14-day forecast (vs 7-day standard)","Pronóstico a 14 días (vs 7 estándar)")}</div>
          <div>• {_t(lang,"Historique 90 jours + accès API complet","90-day history + full API access","Historial de 90 días + acceso API completo")}</div>
        </div>
        )}

        {/* Paid CTA — seul chemin de conversion (sample retiré, A/B pw_cta_order killed). */}
        {(() => {
          // Nouvelle région sans Payment Links → pas de CTA payant (jamais de redirect EUR).
          if(!PAYWALL_READY)return(
            <div key="paid" style={{width:"100%",textAlign:"center",fontSize:13,padding:"16px 24px",
              borderRadius:14,border:"1px dashed rgba(255,255,255,.25)",color:"rgba(255,255,255,.7)"}}>
              {_t(lang,"Premium arrive bientôt ici — alertes plages & brief matin.","Premium launches here soon — beach alerts & morning brief.","Premium llega pronto aquí — alertas de playas y brief matutino.")}
            </div>
          )
          const paidCTA = (
            <button key="paid" onClick={()=>{
              track("sg_premium_modal_cta",{plan:effectivePlan,source:source||"unknown",prelude_variant:preludeVariant})
              if(preludeVariant==="prelude"){
                // Stripe Prelude variant — show interstitial summary BEFORE redirect.
                // User clicks "Continuer vers Stripe" from the prelude = THEN we redirect.
                track("sg_prelude_opened",{plan:effectivePlan,source:source||"unknown"})
                setShowPrelude(true)
                return
              }
              // Checkout in-app (Embedded) — fallback Payment Link géré dedans
              startCheckout(effectivePlan,"direct")
            }}
            className="gbtn" style={{width:"100%",textAlign:"center",fontSize:17,
              padding:"16px 24px",display:"block",border:"none",cursor:"pointer",fontFamily:"inherit",lineHeight:1.2}}>
              <div>{NO_TRIAL
                ?_t(lang,"Activer ma reco maintenant","Get my daily pick — start now","Mi playa del día — empezar ya")
                :_t(lang,"Activer ma reco — 7 jours offerts","Start my daily pick — 7 days free","Activar mi playa del día — 7 días gratis")}</div>
              {/* Sous-ligne dynamique sur effectivePlan dans LES DEUX branches
                  (le fallback MQ/GP affichait 4,99 €/mois même avec Annuel
                  sélectionné). L'idée d'annulation vit UNE fois à l'écran,
                  dans la ligne de réassurance sous le CTA (dédup mobile MQ). */}
              <div style={{fontSize:12,opacity:.8,fontWeight:400,marginTop:4}}>
                {NO_TRIAL
                  ?_t(lang,`${effectivePlan==="annual"?PRICE_YR+"/an":PRICE_MO+"/mois"} · facturé aujourd'hui`,`${effectivePlan==="annual"?PRICE_YR+"/yr":PRICE_MO+"/mo"} · billed today`,`${effectivePlan==="annual"?PRICE_YR+"/año":PRICE_MO+"/mes"} · se cobra hoy`)
                  :REGION_PAY?_t(lang,`Puis ${effectivePlan==="annual"?PRICE_YR+"/an":PRICE_MO+"/mois"}`,`Then ${effectivePlan==="annual"?PRICE_YR+"/yr":PRICE_MO+"/mo"}`,`Luego ${effectivePlan==="annual"?PRICE_YR+"/año":PRICE_MO+"/mes"}`):_t(lang,`Puis ${effectivePlan==="annual"?"39,99 €/an":"4,99 €/mois"}`,`Then ${effectivePlan==="annual"?"€39.99/yr":"€4.99/mo"}`,`Luego ${effectivePlan==="annual"?"39,99 €/año":"4,99 €/mes"}`)}
              </div>
            </button>
          )
          // "Essayer 24h · sans carte" RETIRÉ avant expansion : sg_sample_start = 0
          // sur 10 738 sessions (~7 sem) — feature morte + clutter. On garde le CTA payant seul.
          return paidCTA
        })()}

        {/* Micro-réassurance — répond à LA peur n°1 documentée ("je vais
            oublier d'annuler"). "2 clics" = le portail Stripe réel ("1 clic"
            était invérifiable). Une seule occurrence de l'idée d'annulation
            sous le CTA (remplace l'ancien trust foot dupliqué). */}
        <div style={{textAlign:"center",marginTop:12,fontSize:10.5,
          color:"rgba(255,255,255,.48)",letterSpacing:".01em"}}>
          {NO_TRIAL
            ?_t(lang,"Sans engagement · Annulation en 2 clics · Paiement sécurisé Stripe","No commitment · Cancel in 2 clicks · Secure Stripe payment","Sin permanencia · Cancela en 2 clics · Pago seguro Stripe")
            :_t(lang,"Sans engagement · Annulation en 2 clics · Rappel avant facturation","No commitment · Cancel in 2 clicks · Reminder before you're billed","Sin permanencia · Cancela en 2 clics · Aviso antes del cobro")}
        </div>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",
          gap:8,marginTop:8}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:4,
            fontSize:10,color:"rgba(255,255,255,.7)",fontWeight:500}}>
            <span>🛡</span>{_t(lang,"Satisfait ou remboursé 30 j","30-day money-back","Reembolso garantizado 30 días")}
          </span>
          <span style={{color:"rgba(255,255,255,.4)"}}>·</span>
          <span style={{display:"inline-flex",alignItems:"center",gap:4,
            fontSize:10,color:"rgba(255,255,255,.7)",fontWeight:500}}>
            <span>🔒</span>Stripe
          </span>
        </div>
        {/* Lien "À propos" retiré du paywall (demande user 2026-06-11 — épuré).
            La page /a-propos/ reste accessible via le chat (branche fiabilité). */}

        {/* Already subscribed — for users who installed the PWA after paying.
            iOS PWA and Safari have separate localStorage, so the ?premium_email=
            link from the welcome email opens in Safari and never reaches the PWA.
            This button lets them re-validate their sub from INSIDE the PWA. */}
        <button onClick={()=>{
          track("sg_premium_already_click",{source:source||"unknown"})
          const em=prompt(_t(lang,"Entre l'email utilisé pour ton abonnement :","Enter the email used for your subscription:","Introduce el email usado para tu suscripción:"))
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
              alert(_t(lang,
                "Aucun abonnement actif trouvé pour cet email. Vérifie l'adresse ou contacte "+SUPPORT_EMAIL+".",
                "No active subscription found for this email. Check the address or contact "+SUPPORT_EMAIL+".",
                "No se encontró ninguna suscripción activa para este email. Verifica la dirección o contacta "+SUPPORT_EMAIL+"."))
            }
          }).catch(e=>{
            track("sg_premium_already_failed",{reason:e?.message||"network"})
            alert(_t(lang,"Connexion impossible. Réessaie dans un instant.","Connection issue. Try again in a moment.","No hay conexión. Inténtalo de nuevo en un momento."))
          })
        }} style={{
          width:"100%",padding:"10px",marginTop:10,background:"none",
          border:"1px dashed rgba(255,255,255,.2)",borderRadius:14,
          color:"rgba(255,255,255,.55)",fontSize:12,cursor:"pointer",fontFamily:"inherit",
        }}>{_t(lang,"J'ai déjà un abonnement","I already have a subscription","Ya tengo una suscripción")}</button>

        <button onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts});onClose()}} style={{
          width:"100%",padding:"12px",marginTop:8,background:"none",
          border:"1px solid rgba(255,255,255,.15)",borderRadius:16,
          color:"#8b949e",fontSize:13,cursor:"pointer",fontFamily:"inherit",
        }}>{LL.close}</button>
        </div>{/* end sticky CTA section */}
      </div>
      {/* Étape paiement ON-SITE — overlay sombre au-dessus du modal (z 1300),
          design maison : email + Apple/Google Pay + Payment Element (carte).
          TOUJOURS rendu (caché) pour que les Elements montés persistent. */}
      <div style={{position:"fixed",inset:0,zIndex:1300,background:"linear-gradient(145deg,#0D1E1C,#0A1714)",
        display:"flex",flexDirection:"column",overflow:"auto",
        // hors-écran (PAS visibility:hidden : les iframes Stripe ne bootent pas
        // dans un conteneur hidden — le pré-mount resterait gelé)
        transform:payStep?"none":"translateX(-200vw)",
        pointerEvents:payStep?"auto":"none"}}>
        <div style={{maxWidth:480,width:"100%",margin:"0 auto",padding:"16px 20px 28px",flex:1,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <button onClick={()=>{track("sg_pay_onsite_back",{plan:payPlanRef.current});setPayStep(false)}}
              style={{background:"none",border:"none",color:"rgba(255,255,255,.65)",fontSize:14,cursor:"pointer",
                fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,padding:"8px 0"}}>
              ← {_t(lang,"Retour","Back","Atrás")}
            </button>
            <span style={{fontSize:11,color:"rgba(255,255,255,.45)",display:"flex",alignItems:"center",gap:8}}>
              {/* Marque sur l'écran paiement (audit : full-screen sans aucun nom de site) */}
              {IS_NEW_REGION&&<span style={{fontFamily:"'Anton',sans-serif",fontSize:10.5,letterSpacing:".12em",color:"rgba(255,255,255,.8)"}}>
                {((lang==="es"?"SARGAZO ":"SARGASSUM ")+String(REGION.name||"")).toUpperCase()}
              </span>}
              🔒 Stripe
            </span>
          </div>
          <h3 className="anton" style={{fontSize:22,color:"#fff",margin:"0 0 4px",letterSpacing:"-.01em"}}>
            {NO_TRIAL
              ?_t(lang,"Active ta reco du jour","Activate your daily pick","Activa tu playa del día")
              :_t(lang,"Démarre ton essai gratuit","Start your free trial","Empieza tu prueba gratis")}
          </h3>
          <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginBottom:18}}>
            {NO_TRIAL
              ?<>{payPlanRef.current==="annual"
                  ?_t(lang,`${PRICE_YR}/an · facturé aujourd'hui`,`${PRICE_YR}/yr · billed today`,`${PRICE_YR}/año · se cobra hoy`)
                  :_t(lang,`${PRICE_MO}/mois · facturé aujourd'hui`,`${PRICE_MO}/mo · billed today`,`${PRICE_MO}/mes · se cobra hoy`)} · {_t(lang,"annule en 2 clics","cancel in 2 clicks","cancela en 2 clics")}</>
              :<>{_t(lang,"0 € aujourd'hui","$0 today","$0 hoy")} · {payPlanRef.current==="annual"
                  ?_t(lang,`puis ${REGION_PAY?PRICE_YR:"39,99 €"}/an dans 7 jours`,`then ${PRICE_YR||"$79"}/yr in 7 days`,`luego ${PRICE_YR||"$79"}/año en 7 días`)
                  :_t(lang,`puis ${REGION_PAY?PRICE_MO:"4,99 €"}/mois dans 7 jours`,`then ${PRICE_MO||"$9.99"}/mo in 7 days`,`luego ${PRICE_MO||"$9.99"}/mes en 7 días`)} · {_t(lang,"annule en 1 clic","cancel in 1 click","cancela en 1 clic")}</>}
          </div>
          <input ref={payEmailRef} type="email" inputMode="email" autoComplete="email"
            defaultValue={typeof localStorage!=="undefined"?(localStorage.getItem("sg_email")||""):""}
            placeholder={_t(lang,"ton@email.com","you@email.com","tu@email.com")}
            style={{width:"100%",boxSizing:"border-box",padding:"13px 14px",borderRadius:12,marginBottom:12,
              border:"1px solid rgba(255,255,255,.18)",background:"#13261F",color:"#e6edf3",
              fontSize:15,fontFamily:"inherit",outline:"none"}}/>
          <div ref={expressDivRef} style={{marginBottom:10}}/>
          <div ref={payDivRef} style={{minHeight:120}}/>
          {!payReady&&payStep&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"26px 0"}}>
              <div style={{width:22,height:22,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,.15)",
                borderTopColor:"#FFC72C",animation:"sgSpin .8s linear infinite"}}/>
              <span style={{fontSize:12.5,color:"rgba(255,255,255,.55)"}}>
                {_t(lang,"Paiement sécurisé…","Secure checkout…","Pago seguro…")}
              </span>
              <style>{`@keyframes sgSpin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {payError&&<div style={{color:"#FF8A65",fontSize:12.5,marginTop:10,lineHeight:1.4}}>{payError}</div>}
          <button onClick={()=>doSubscribe()} disabled={payBusy} className="gbtn"
            style={{width:"100%",padding:15,borderRadius:14,border:"none",marginTop:16,
              cursor:payBusy?"wait":"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15.5,
              opacity:payBusy?.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {payBusy
              ?_t(lang,"Activation…","Activating…","Activando…")
              :NO_TRIAL
              ?(payPlanRef.current==="annual"
                ?_t(lang,`Payer ${PRICE_YR} — activer maintenant`,`Pay ${PRICE_YR} — activate now`,`Pagar ${PRICE_YR} — activar ya`)
                :_t(lang,`Payer ${PRICE_MO} — activer maintenant`,`Pay ${PRICE_MO} — activate now`,`Pagar ${PRICE_MO} — activar ya`))
              :_t(lang,"Démarrer l'essai — 0 € aujourd'hui","Start trial — $0 today","Empezar prueba — $0 hoy")}
          </button>
          <div style={{textAlign:"center",marginTop:12,fontSize:10.5,color:"rgba(255,255,255,.4)"}}>
            {NO_TRIAL
              ?_t(lang,"Sans engagement · Annule en 2 clics · Stripe sécurisé","No commitment · Cancel in 2 clicks · Secured by Stripe","Sin compromiso · Cancela en 2 clics · Stripe seguro")
              :_t(lang,"Sans engagement · Rappel 2 jours avant la 1re charge","No commitment · Reminder 2 days before first charge","Sin compromiso · Recordatorio 2 días antes del primer cobro")}
          </div>
          <button onClick={()=>{
            const link=stripeUrlWith(stripeLinkFor[payPlanRef.current]||LINK_MONTHLY,payPlanRef.current)
            track("sg_checkout_redirect",{plan:payPlanRef.current,source:source||"unknown",destination:"payment_link",via:"onsite_escape"})
            setTimeout(()=>{window.location.href=link},0)
          }} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:11.5,
            cursor:"pointer",fontFamily:"inherit",marginTop:14,textDecoration:"underline"}}>
            {_t(lang,"Ou continuer sur la page Stripe →","Or continue on the Stripe page →","O continuar en la página de Stripe →")}
          </button>
        </div>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEADER — floating over map
   ═══════════════════════════════════════════════════════════════════════════ */
function formatFreshness(updatedAt,lang){
  if(!updatedAt)return null
  const ms=Date.now()-new Date(updatedAt).getTime()
  if(!isFinite(ms)||ms<0)return null
  const min=Math.floor(ms/60000)
  if(min<1)return lang==="en"?"just now":lang==="es"?"ahora":"à l'instant"
  if(min<60)return lang==="en"?`${min}m ago`:lang==="es"?`hace ${min}m`:`il y a ${min}m`
  const h=Math.floor(min/60)
  if(h<24)return lang==="en"?`${h}h ago`:lang==="es"?`hace ${h}h`:`il y a ${h}h`
  const d=Math.floor(h/24)
  return lang==="en"?`${d}d ago`:lang==="es"?`hace ${d}d`:`il y a ${d}j`
}
function Header({island,onIslandChange,lang,onLangToggle,theme,onThemeToggle,beachCount,dataSource,updatedAt,onHome}){
  const LL=T[lang]||T.fr
  const isLive=dataSource==="erddap-live"
  const srcLabel=isLive?"LIVE":(lang==="es"?"Estimación":"Estimation")
  const srcColor=isLive?C.green:C.amber
  const fresh=formatFreshness(updatedAt,lang)
  // Unified 40px-tall control rail. Three segments share the same shadow,
  // border token and height so the header reads as one cohesive status bar
  // instead of three disconnected widgets. Why: session 37 aurora + editorial
  // modal made the old header (3 different heights/shadows) feel cheap.
  const RAIL_H=40
  const RAIL_SHADOW="0 2px 10px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)"
  const RAIL_BORDER="1px solid var(--sg-border,rgba(0,0,0,.07))"
  return(
    <div className="sg-header-row" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",rowGap:8}}>
      {/* Accueil — le logo ramène à l'atterrissage (rejouer l'expérience,
          directive user 12/06 : « toujours pouvoir revenir vers l'accueil ») */}
      {onHome&&<button onClick={onHome} aria-label={lang==="es"?"Inicio":lang==="en"?"Home":"Accueil"} style={{
        width:RAIL_H,height:RAIL_H,borderRadius:14,border:RAIL_BORDER,flexShrink:0,
        background:"var(--sg-card,#fff)",boxShadow:RAIL_SHADOW,cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
        <span aria-hidden style={{width:20,height:20,borderRadius:"50%",display:"block",
          background:"conic-gradient(from -10deg,#FFE898 0deg 25deg,#E8A800 25deg 65deg,#FFD040 65deg 110deg,#B87A00 110deg 155deg,#FFE07A 155deg 195deg,#E09000 195deg 240deg,#FFC72C 240deg 285deg,#B07000 285deg 325deg,#FFE898 325deg 360deg)",
          animation:"spin 20s linear infinite",boxShadow:"0 2px 8px rgba(232,168,0,.35)"}}/>
      </button>}
      {/* Island toggle MQ/GP — masqué pour les nouvelles régions (build mono-région) */}
      {!IS_NEW_REGION && (<div style={{display:"flex",height:RAIL_H,borderRadius:14,overflow:"hidden",position:"relative",flexShrink:0,
        border:RAIL_BORDER,
        background:"var(--sg-card,#fff)",boxShadow:RAIL_SHADOW}}>
        <div style={{position:"absolute",top:3,bottom:3,width:"calc(50% - 3px)",borderRadius:12,
          background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
          transform:island==="mq"?"translateX(3px)":"translateX(calc(100% + 3px))",
          transition:"transform .3s cubic-bezier(.22,1,.36,1)",
          boxShadow:"0 3px 10px rgba(232,168,0,.35), inset 0 1px 0 rgba(255,255,255,.5)"}}/>
        {["mq","gp"].map(id=>(
          <button key={id} onClick={()=>{onIslandChange(id);track("sg_island_switch",{to:id})}} style={{
            padding:"0 16px",border:"none",cursor:"pointer",
            background:"transparent",position:"relative",zIndex:1,
            color:island===id?"#0D0D0D":"var(--sg-mid,#686868)",
            fontFamily:"'Anton',sans-serif",
            fontSize:15,fontWeight:400,
            letterSpacing:".02em",
            transition:"color .2s",
            display:"flex",alignItems:"center",
          }}>{id==="mq"?"MQ":"GP"}</button>
        ))}
      </div>)}

      {/* Live indicator — shows LIVE or Estimation based on data source.
          Halo pulse derived from srcColor, editorial feel. */}
      <a href="https://marine.copernicus.eu" target="_blank" rel="noopener noreferrer"
        onClick={()=>track("sg_live_badge_click",{source:dataSource})}
        style={{display:"flex",alignItems:"center",gap:7,height:RAIL_H,
          padding:"0 14px",borderRadius:100,flex:"1 1 auto",minWidth:0,
          maxWidth:"fit-content",
          background:"var(--sg-card,#fff)",
          boxShadow:RAIL_SHADOW,
          border:RAIL_BORDER,
          fontSize:11.5,fontWeight:700,color:isLive?C.teal:C.amber,
          textDecoration:"none",cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          <span style={{position:"relative",width:10,height:10,flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
            <span aria-hidden style={{position:"absolute",inset:-4,borderRadius:"50%",
              background:`radial-gradient(closest-side, ${srcColor}55 0%, transparent 70%)`,
              animation:isLive?"sg-live-halo 2.2s ease-in-out infinite":"none",pointerEvents:"none"}}/>
            <span className={isLive?"pulse":""} style={{position:"relative",width:8,height:8,borderRadius:4,background:srcColor,
              boxShadow:`0 0 0 2px ${srcColor}22`,flexShrink:0}}/>
          </span>
          <span style={{flexShrink:0,letterSpacing:".01em"}}>{srcLabel}</span>
          {fresh&&<span style={{opacity:.5,fontWeight:500,flexShrink:1,overflow:"hidden",textOverflow:"ellipsis"}}>· {fresh}</span>}
        </a>

      {/* Theme + Lang — grouped in a single rail segment for cohesion */}
      <div style={{display:"flex",height:RAIL_H,borderRadius:14,overflow:"hidden",
        border:RAIL_BORDER,background:"var(--sg-card,#fff)",boxShadow:RAIL_SHADOW,flexShrink:0}}>
        <button onClick={onThemeToggle} aria-label={theme==="dark"?"Light mode":"Dark mode"} style={{
          width:40,height:"100%",border:"none",borderRight:"1px solid var(--sg-border,rgba(0,0,0,.06))",
          background:"transparent",cursor:"pointer",fontSize:16,
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>{theme==="dark"?"☀️":"🌙"}</button>
        {(()=>{/* Label = langue CIBLE. Nouvelles régions : bascule 2 langues primary↔secondary. MQ/GP : cycle fr→en→es inchangé. */
        const langTarget=IS_NEW_REGION?(lang===REGION.primaryLang?(REGION.secondaryLangs?.[0]||"en"):REGION.primaryLang):(lang==="fr"?"en":lang==="en"?"es":"fr")
        return(<button onClick={onLangToggle} aria-label={langTarget==="en"?"Switch to English":langTarget==="es"?"Cambiar a español":"Passer en français"} style={{
          width:40,height:"100%",border:"none",
          background:"transparent",cursor:"pointer",
          fontFamily:"'Anton',sans-serif",fontSize:13,fontWeight:400,
          letterSpacing:".03em",color:"var(--sg-ink)",
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>{langTarget.toUpperCase()}</button>)})()}
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
      {_t(lang,"Alertes activées ! Tu seras notifié.","Alerts activated! You'll be notified.","¡Alertas activadas! Te avisaremos.")}
    </div>
  )

  return(
    <div style={{margin:"12px 0",padding:"12px 14px",borderRadius:14,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18,flexShrink:0}}>🔔</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)"}}>
            {_t(lang,"Sois prévenu avant d'aller à la plage","Know before you go","Entérate antes de ir a la playa")}
          </div>
          <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:1}}>
            {_t(lang,"On te prévient si ta plage change de statut. Gratuit.","We'll alert you if this beach changes status. Free.","Te avisamos si tu playa cambia de estado. Gratis.")}
          </div>
        </div>
        <button onClick={handleActivate} style={{
          padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",
          background:C.gold,color:"#fff",fontSize:12,fontWeight:700,
          fontFamily:"inherit",flexShrink:0,
          boxShadow:"0 2px 8px rgba(232,168,0,.25)"}}>
          {_t(lang,"Activer","Activate","Activar")}
        </button>
      </div>
      <button onClick={()=>{setDismissed(true);track("sg_push_dismiss",{beach_id:beachId||"unknown"})}} style={{
        display:"block",margin:"6px auto 0",background:"none",border:"none",
        cursor:"pointer",color:"var(--sg-mid)",fontSize:11,padding:0}}>
        {_t(lang,"Plus tard","Not now","Ahora no")}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   INLINE EMAIL CAPTURE — Smart visit-based trigger (visit 3+)
   ═══════════════════════════════════════════════════════════════════════════ */
/* ── BEACH PHOTO SCAN — tap la photo → HUD satellite cinématique */
function BeachPhotoScan({beach,lang}){
  const T3=(fr,en,es)=>lang==="en"?en:lang==="es"?es:fr
  const afai=beach.afai
  const zone=afai==null?"_":afai<0.15?"clean":afai<0.40?"moderate":"avoid"
  const zoneColor={clean:"#16A34A",moderate:"#E07800",avoid:"#E8522A","_":"#4ECDC4"}[zone]
  const lat=beach.lat,lng=beach.lng
  const latStr=lat!=null?`${Math.abs(lat).toFixed(4)}°${lat>=0?"N":"S"}`:null
  const lngStr=lng!=null?`${Math.abs(lng).toFixed(4)}°${lng>=0?"E":"O"}`:null
  return(
    <div style={{position:"absolute",inset:0,background:"rgba(0,6,15,.76)",
      backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
      animation:"sgReveal .22s ease",overflow:"hidden"}}>
      {/* Grid */}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.14}} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="bpGrid" x="0" y="0" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#4ECDC4" strokeWidth=".6"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bpGrid)"/>
      </svg>
      {/* Scan line */}
      <div style={{position:"absolute",left:0,right:0,height:2,
        background:"linear-gradient(90deg,transparent,#4ECDC4 20%,#4ECDC4 80%,transparent)",
        boxShadow:"0 0 12px #4ECDC4, 0 0 4px #4ECDC4",
        animation:"beachScanLine 1.6s ease-out forwards"}}/>
      {/* HUD corners */}
      {[[{top:10,left:10},{borderTop:"2px solid #4ECDC4",borderLeft:"2px solid #4ECDC4"}],
        [{top:10,right:10},{borderTop:"2px solid #4ECDC4",borderRight:"2px solid #4ECDC4"}],
        [{bottom:10,left:10},{borderBottom:"2px solid #4ECDC4",borderLeft:"2px solid #4ECDC4"}],
        [{bottom:10,right:10},{borderBottom:"2px solid #4ECDC4",borderRight:"2px solid #4ECDC4"}]
      ].map(([pos,border],i)=>(
        <div key={i} style={{position:"absolute",width:18,height:18,...pos,...border,opacity:.7}}/>
      ))}
      {/* Central data */}
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",gap:9}}>
        <div style={{fontSize:9,fontWeight:800,letterSpacing:".2em",color:"#4ECDC4",opacity:.8,
          animation:"sgReveal .3s ease .45s both"}}>
          {T3("ANALYSE SATELLITE","SATELLITE SCAN","ANÁLISIS SATELITAL")}
        </div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:19,color:"#fff",letterSpacing:"-.01em",
          textAlign:"center",padding:"0 24px",lineHeight:1.1,
          animation:"sgReveal .3s ease .6s both"}}>
          {beach.name.toUpperCase()}
        </div>
        {latStr&&lngStr&&(
          <div style={{fontSize:11,color:"rgba(255,255,255,.65)",fontFamily:"monospace",
            background:"rgba(78,205,196,.1)",border:"1px solid rgba(78,205,196,.25)",
            borderRadius:6,padding:"3px 10px",
            animation:"sgReveal .3s ease .75s both"}}>
            {latStr} · {lngStr}
          </div>
        )}
        {afai!=null&&(
          <div style={{display:"flex",alignItems:"center",gap:7,
            animation:"sgReveal .3s ease .9s both"}}>
            <span style={{fontSize:10,color:"rgba(255,255,255,.45)",letterSpacing:".04em"}}>AFAI</span>
            <div style={{width:72,height:4,borderRadius:2,background:"rgba(255,255,255,.12)",overflow:"hidden"}}>
              <div style={{width:`${Math.min(100,afai/0.8*100)}%`,height:"100%",
                background:zoneColor,borderRadius:2,boxShadow:`0 0 6px ${zoneColor}`}}/>
            </div>
            <span style={{fontSize:11,fontWeight:700,color:zoneColor,fontFamily:"monospace"}}>
              {afai.toFixed(3)}
            </span>
          </div>
        )}
        <div style={{fontSize:9,color:"rgba(255,255,255,.3)",letterSpacing:".06em",marginTop:2,
          animation:"sgReveal .3s ease 1.05s both"}}>
          MODIS NASA · COPERNICUS ESA
        </div>
      </div>
      <div style={{position:"absolute",bottom:12,right:14,fontSize:9,
        color:"rgba(255,255,255,.3)",letterSpacing:".05em",
        animation:"sgReveal .3s ease 1.2s both"}}>
        {T3("toucher pour fermer","tap to close","toca para cerrar")}
      </div>
    </div>
  )
}

/* ── SCORE REVEAL — tap le score pour apprendre d'où il vient */
function ScoreReveal({beach,lang}){
  const T3=(fr,en,es)=>lang==="en"?en:lang==="es"?es:fr
  const afai=beach.afai||0
  const pct=Math.min(100,afai/0.8*100)
  const zone=afai<0.15?"clean":afai<0.40?"moderate":"avoid"
  const zoneColor={clean:"#16A34A",moderate:"#E07800",avoid:"#E8522A"}[zone]
  return(
    <div style={{animation:"sgReveal .22s ease",background:"var(--sg-bgD,#F7F5EF)",
      borderRadius:14,padding:"14px 16px",marginBottom:14,marginTop:-8,
      border:"1px solid var(--sg-border,rgba(0,0,0,.06))"}}>
      <div style={{fontSize:10,fontWeight:700,color:"var(--sg-mid,#686868)",
        textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>
        {T3("Mesure satellite Copernicus","Copernicus satellite reading","Medición satélite Copernicus")}
      </div>
      {/* AFAI bar */}
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,
          color:"var(--sg-mid,#686868)",marginBottom:4}}>
          <span>{T3("Propre","Clean","Limpia")} ← AFAI</span>
          <span style={{fontWeight:700,color:zoneColor}}>
            {T3("Mesuré :","Read:","Medido:")} {afai.toFixed(3)}
          </span>
          <span>→ {T3("Alerte","Alert","Alerta")}</span>
        </div>
        <div style={{height:8,borderRadius:99,overflow:"hidden",position:"relative",
          background:"linear-gradient(90deg,#16A34A 0%,#16A34A 18.75%,#E07800 18.75%,#E07800 50%,#E8522A 50%)"}}>
          <div style={{position:"absolute",top:-2,bottom:-2,width:3,borderRadius:2,
            background:"#0A1714",left:`calc(${pct.toFixed(1)}% - 1px)`,
            boxShadow:"0 0 0 2px #fff"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,
          color:"var(--sg-mid,#999)",marginTop:3}}>
          <span>0</span><span>0.15</span><span>0.40</span><span>0.8+</span>
        </div>
      </div>
      {/* Factors */}
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
        {[
          {l:T3("Sargasses","Sargassum","Sargazo"),w:"40%"},
          {l:T3("Vent","Wind","Viento"),w:"20%"},
          {l:"UV",w:"20%"},
          {l:T3("Mer","Waves","Mar"),w:"20%"},
        ].map(f=>(
          <span key={f.l} style={{fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:100,
            background:"rgba(0,0,0,.06)",color:"var(--sg-ink,#1A2B26)"}}>
            {f.l} <span style={{opacity:.6}}>{f.w}</span>
          </span>
        ))}
      </div>
      <div style={{fontSize:10,color:"var(--sg-mid,#999)",fontStyle:"italic"}}>
        {T3("Mis à jour 4×/jour · MODIS NASA + Copernicus ESA","Updated 4×/day · MODIS NASA + Copernicus ESA","Actualizado 4×/día · MODIS NASA + Copernicus ESA")}
      </div>
    </div>
  )
}

/* ── AFAI CHIP — tap le verdict pour voir l'indice satellite brut */
function AfaiChip({beach,lang}){
  const [open,setOpen]=useState(false)
  const T3=(fr,en,es)=>lang==="en"?en:lang==="es"?es:fr
  const afai=beach.afai
  if(afai==null)return null
  const zone=afai<0.15?"clean":afai<0.40?"moderate":"avoid"
  const color={clean:"#16A34A",moderate:"#E07800",avoid:"#E8522A"}[zone]
  return(
    <div style={{marginBottom:14}}>
      <button onClick={()=>{setOpen(v=>!v);track("sg_afai_learn",{beach_id:beach.id})}}
        style={{background:"none",border:"none",cursor:"pointer",
          display:"inline-flex",alignItems:"center",gap:6,padding:"4px 0",fontFamily:"inherit"}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:color,
          boxShadow:`0 0 6px ${color}88`,display:"inline-block",flexShrink:0}}/>
        <span style={{fontSize:11,fontWeight:700,color:"var(--sg-mid,#686868)",
          textTransform:"uppercase",letterSpacing:".05em"}}>
          AFAI {afai.toFixed(3)}
        </span>
        <span style={{fontSize:11,color:"var(--sg-dim,#aaa)"}}>{open?"▲":"▾"}</span>
      </button>
      {open&&(
        <div style={{animation:"sgReveal .2s ease",
          background:"var(--sg-bgD,#F7F5EF)",borderRadius:12,padding:"10px 12px",
          fontSize:11,color:"var(--sg-ink,#1A2B26)",lineHeight:1.6,
          border:"1px solid var(--sg-border,rgba(0,0,0,.06))"}}>
          <strong>AFAI</strong> {T3(
            "= Floating Algae Index — signature spectrale mesurée par satellite. En-dessous de 0.15 = propre, 0.15–0.40 = modéré, au-delà = à éviter.",
            "= Floating Algae Index — spectral signature measured by satellite. Below 0.15 = clean, 0.15–0.40 = moderate, above = avoid.",
            "= Floating Algae Index — firma espectral medida por satélite. Menos de 0.15 = limpia, 0.15–0.40 = moderado, encima = evitar."
          )}
        </div>
      )}
    </div>
  )
}

function InlineEmailCapture({lang,beachName}){
  const[email,setEmail]=useState("")
  const[submitted,setSubmitted]=useState(false)
  const[dismissed,setDismissed]=useState(false)
  const tracked=useRef(false)
  // Show from first visit (was visit 2+). Already subscribed? hide.
  if(dismissed||g("sg_email_prompt",false))return null
  // em1 test: control (loss-frame "know before you go") vs curiosity ("where's the best beach today?")
  const em1V=abVariant("em1",["control","curiosity"],[.5,.5])
  if(!tracked.current){tracked.current=true;track("sg_smart_email_trigger",{visit_count:g("sg_visit_count",0)});track("sg_email_view")}

  const handleSubmit=e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    track("sg_email_submit",{source:"inline_beach",variant:em1V})
    s("sg_email",email)
    s("sg_email_prompt",true)
    setSubmitted(true)
    const island=IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({email,island,source:"inline-beach",date:new Date().toISOString()})
    }).catch(()=>{})}catch{}
  }

  if(submitted)return(
    <div style={{margin:"0 0 12px",padding:"14px 16px",borderRadius:16,
      background:"linear-gradient(135deg,#0D1E1C,#142824)",
      textAlign:"center",fontSize:13,fontWeight:600,color:C.green}}>
      <span style={{fontSize:20,display:"block",marginBottom:4}}>✅</span>
      {_t(lang,"C'est fait ! Premier email dans 3 jours.","You're in! First email in 3 days.","¡Listo! Primer email en 3 días.")}
    </div>
  )

  return(
    <div style={{margin:"0 0 12px",padding:"14px 16px",borderRadius:16,
      background:"linear-gradient(135deg,#0D1E1C,#142824)",
      border:"1px solid rgba(255,255,255,.08)",position:"relative",overflow:"hidden"}}>
      {/* Ambient glow */}
      <div style={{position:"absolute",top:"-50%",left:"-20%",width:"60%",height:"200%",
        background:"radial-gradient(ellipse, rgba(34,197,94,.06) 0%, transparent 70%)",pointerEvents:"none"}}/>
      <div style={{position:"relative"}}>
        <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",
          textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>
          {_t(lang,"GRATUIT","FREE","GRATIS")}
        </div>
        <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>
          {beachName
            ?_t(lang,`Verdict de ${beachName} — chaque matin`,`${beachName} — daily verdict`,`${beachName} — veredicto diario`)
            :em1V==="curiosity"
              ?_t(lang,"Où est la plus belle plage aujourd'hui ?","Where's the cleanest beach today?","¿Dónde está la mejor playa hoy?")
              :SARGASSES_SEASON==="high"
                ?_t(lang,"Les plages changent tous les jours","Beaches are changing fast","Las playas cambian todos los días")
                :_t(lang,"Sois prévenu avant de partir","Know before you go","Entérate antes de salir")}
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:12,lineHeight:1.4}}>
          {em1V==="curiosity"
            ?_t(lang,"On te le dit chaque matin. Gratuit.","We tell you every morning. Free.","Te lo decimos cada mañana. Gratis.")
            :SARGASSES_SEASON==="high"
              ?_t(lang,"Reçois une alerte quand ta plage change de statut. Gratuit.","Get alerted when your beach status changes. Free.","Recibe una alerta cuando tu playa cambie de estado. Gratis.")
              :_t(lang,"Bilan hebdo + alerte si ça change. Gratuit.","Weekly beach status + alerts if things change. Free.","Resumen semanal + alerta si algo cambia. Gratis.")}
        </div>
        <form onSubmit={handleSubmit} style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="email" inputMode="email" autoComplete="email" placeholder={_t(lang,"ton@email.com","your@email.com","tu@email.com")}
            value={email} onChange={e=>setEmail(e.target.value)}
            style={{flex:1,padding:"10px 14px",borderRadius:12,
              border:"1px solid rgba(255,255,255,.12)",
              fontSize:16,fontFamily:"inherit",background:"rgba(255,255,255,.06)",
              outline:"none",minWidth:0,color:"#fff"}}/>
          <button type="submit" style={{
            padding:"10px 18px",borderRadius:12,border:"none",cursor:"pointer",
            background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
            color:C.ink,fontSize:13,fontWeight:700,whiteSpace:"nowrap",fontFamily:"inherit",
            boxShadow:"0 2px 12px rgba(232,168,0,.3)"}}>
            {_t(lang,"OK","Go","OK")}
          </button>
        </form>
        <button onClick={()=>{setDismissed(true);s("sg_email_prompt",true);track("sg_email_dismiss")}} style={{
          display:"block",margin:"8px auto 0",background:"none",border:"none",
          cursor:"pointer",color:"rgba(255,255,255,.3)",fontSize:11,padding:0}}>
          {_t(lang,"Plus tard","Not now","Ahora no")}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEEDBACK WIDGET — appears after 3 visits, once only
   ═══════════════════════════════════════════════════════════════════════════ */
function FeedbackWidget(){
  const lang=getLang()
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
    const island=IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ"
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
      <button onClick={()=>{setVisible(false);s("sg_feedback_done",true)}} aria-label={_t(lang,"Fermer","Close","Cerrar")}
        style={{position:"absolute",top:4,right:4,background:"none",border:"none",
          color:"var(--sg-mid)",cursor:"pointer",fontSize:16,
          width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      {step===0&&(
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",marginBottom:10}}>
            {_t(lang,"Cette app t'est utile ?","Is this app useful to you?","¿Te resulta útil esta app?")}
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
            <span>{_t(lang,"Pas du tout","Not at all","Para nada")}</span><span>{_t(lang,"Indispensable","Essential","Imprescindible")}</span>
          </div>
        </div>
      )}
      {step===1&&(
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",marginBottom:8}}>
            {rating>=4?_t(lang,"Super ! Qu'est-ce qui te plait le plus ?","Great! What do you like the most?","¡Genial! ¿Qué es lo que más te gusta?"):_t(lang,"Qu'est-ce qui manque ?","What's missing?","¿Qué falta?")}
          </div>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            placeholder={rating>=4?_t(lang,"Ce que j'utilise le plus...","What I use the most...","Lo que más uso..."):_t(lang,"Ce qui me manque...","What I'm missing...","Lo que me falta...")}
            style={{width:"100%",height:60,borderRadius:10,border:"1.5px solid var(--sg-border)",
              padding:"8px 10px",fontSize:13,fontFamily:"inherit",resize:"none",
              background:"var(--sg-bgD)",color:"var(--sg-ink)"}}/>
          <button onClick={submit} style={{width:"100%",marginTop:8,padding:"10px",
            borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
            background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
            fontSize:13,fontWeight:700,color:C.ink}}>{_t(lang,"Envoyer","Send","Enviar")}</button>
        </div>
      )}
      {step===2&&(
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <span style={{fontSize:24}}>🙏</span>
          <div style={{fontSize:13,fontWeight:600,color:"var(--sg-ink)",marginTop:4}}>{_t(lang,"Merci pour ton retour !","Thanks for your feedback!","¡Gracias por tu opinión!")}</div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FAV TOAST — brief inline toast when user adds first favorite
   ═══════════════════════════════════════════════════════════════════════════ */
function FavToast({show,lang,onPremiumClick,isPremium}){
  const[visible,setVisible]=useState(false)
  useEffect(()=>{
    if(!show)return
    setVisible(true)
    const t=setTimeout(()=>setVisible(false),isPremium?3000:5000)
    return()=>clearTimeout(t)
  },[show,isPremium])
  if(!visible)return null
  return(
    <div style={{position:"fixed",bottom:"calc(74px + env(safe-area-inset-bottom, 0px))",left:"50%",transform:"translateX(-50%)",
      zIndex:805,background:"var(--sg-card,#fff)",color:"var(--sg-ink)",
      boxSizing:"border-box",
      padding:isPremium?"10px 18px":"12px 16px",borderRadius:14,
      boxShadow:"0 4px 20px rgba(0,0,0,.12),0 0 0 1px var(--sg-border)",
      display:"flex",alignItems:"center",gap:10,maxWidth:"calc(100vw - 32px)",
      animation:"slideUp .3s cubic-bezier(.22,1,.36,1)"}}>
      <span style={{color:C.green,fontSize:16}}>✓</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,whiteSpace:"nowrap"}}>
          {_t(lang,"Ajouté aux favoris","Added to favorites","Agregada a favoritos")}
        </div>
        {!isPremium&&(
          <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:2}}>
            {_t(lang,"Reçois une alerte quand ça change","Get alerts when conditions change","Recibe una alerta cuando cambie")}
          </div>
        )}
      </div>
      {!isPremium&&(
        <button onClick={()=>{track("sg_fav_toast_premium_click");onPremiumClick("fav_toast");setVisible(false)}}
          style={{flexShrink:0,background:C.gold,color:C.ink,border:"none",borderRadius:8,
            padding:"6px 12px",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",
            whiteSpace:"nowrap"}}>
          {_t(lang,"Alertes","Alerts","Alertas")}
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PWA INSTALL PROMPT — Android (beforeinstallprompt) + iOS (Safari tutorial)
   Best practice: show after 2nd beach view (value demonstrated), not on timer
   ═══════════════════════════════════════════════════════════════════════════ */
function InstallPrompt(){
  // lang était référencé plus bas sans être défini (ReferenceError au premier
  // render du prompt — crash furtif : le flag localStorage est posé avant).
  const lang=getLang()
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

  // Auto-hide 15s : la bannière flotte SUR la carte et rendait les pastilles
  // dessous incliquables tant qu'on ne la fermait pas (prouvé par test clic
  // exhaustif 2026-06-10). 15s suffisent pour agir ; elle ne s'affiche de
  // toute façon qu'une fois par appareil (flag posé au moment du show).
  // HOOK AVANT le early-return ci-dessous (sinon React #310 — ordre des hooks).
  useEffect(()=>{
    if(!visible||showIosTutorial)return
    const t=setTimeout(()=>{setVisible(false);setDismissed(true);track("sg_pwa_autohide",{platform:isIos?"ios":"android"})},15000)
    return()=>clearTimeout(t)
  },[visible,showIosTutorial])

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
            {isIos?_t(lang,"Ajoute l'app sur ton iPhone","Add the app to your iPhone","Añade la app a tu iPhone"):_t(lang,"Installer l'app","Install the app","Instalar la app")}
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginTop:1}}>
            {isIos?_t(lang,"Accès direct + alertes sargasses","Quick access + sargassum alerts","Acceso directo + alertas de sargazo"):_t(lang,"Accès direct, alertes push, hors-ligne","Quick access, push alerts, offline","Acceso directo, alertas push, sin conexión")}
          </div>
        </div>
        <button onClick={handleInstall} style={{background:"#fff",color:C.teal,border:"none",
          borderRadius:12,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",
          fontFamily:"inherit",flexShrink:0}}>{isIos?_t(lang,"Voir comment","See how","Ver cómo"):_t(lang,"Installer","Install","Instalar")}</button>
        <button onClick={dismiss} aria-label={_t(lang,"Fermer","Close","Cerrar")}
          style={{position:"absolute",top:2,right:2,background:"none",border:"none",
            color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:16,
            width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
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
              {_t(lang,"Ajoute Sargasses sur ton iPhone","Add the app to your iPhone","Añade la app a tu iPhone")}
            </h3>
            <p style={{fontSize:12,color:"var(--sg-mid)",marginBottom:16,lineHeight:1.5}}>
              {_t(lang,"En 3 secondes, tu auras l'app sur ton ecran d'accueil avec les alertes sargasses.","In 3 seconds you'll have the app on your home screen with sargassum alerts.","En 3 segundos tendrás la app en tu pantalla de inicio con alertas de sargazo.")}
            </p>

            {/* Step 1 */}
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
              <div style={{width:32,height:32,borderRadius:10,background:C.tealBg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                fontWeight:800,color:C.teal,flexShrink:0}}>1</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--sg-ink)"}}>
                  {_t(lang,"Appuie sur","Tap","Pulsa")} <span style={{display:"inline-flex",alignItems:"center",
                    padding:"2px 8px",background:"rgba(0,122,255,.1)",borderRadius:6,
                    fontSize:18,verticalAlign:"middle"}}>⬆️</span> {_t(lang,"en bas de Safari","at the bottom of Safari","abajo en Safari")}
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:2}}>{_t(lang,"Le bouton partager (carre avec fleche)","The share button (square with arrow)","El botón compartir (cuadrado con flecha)")}</div>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
              <div style={{width:32,height:32,borderRadius:10,background:C.tealBg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                fontWeight:800,color:C.teal,flexShrink:0}}>2</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--sg-ink)"}}>
                  {_t(lang,"Scroll et appuie sur","Scroll and tap","Desliza y pulsa")} <strong>{_t(lang,'"Sur l\'ecran d\'accueil"','"Add to Home Screen"','"Añadir a pantalla de inicio"')}</strong>
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:2}}>{_t(lang,"Icone + avec un carre","The + icon with a square","Icono + con un cuadrado")}</div>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:20}}>
              <div style={{width:32,height:32,borderRadius:10,background:C.tealBg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                fontWeight:800,color:C.teal,flexShrink:0}}>3</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--sg-ink)"}}>
                  {_t(lang,"Appuie","Tap","Pulsa")} <strong>{_t(lang,'"Ajouter"','"Add"','"Añadir"')}</strong> {_t(lang,"en haut a droite","top right","arriba a la derecha")}
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid)",marginTop:2}}>{_t(lang,"L'app apparait sur ton ecran d'accueil","The app appears on your home screen","La app aparece en tu pantalla de inicio")}</div>
              </div>
            </div>

            <button onClick={()=>{setShowIosTutorial(false);dismiss();track("sg_pwa_ios_tutorial_done")}}
              className="gbtn" style={{width:"100%",textAlign:"center",fontSize:15,padding:"14px 24px"}}>
              {_t(lang,"J'ai compris","Got it","Entendido")}
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
   HERO VERDICT — premier écran "1 photo, 1 verdict, 1 bouton"
   Remplace le premier paint carte (tuiles tierces lentes/cassées — audits
   2026-06-10 : critical sur les 5 sites) par la réponse instantanée à
   l'intent n°1 ("j'y vais aujourd'hui ?"). La carte reste à un geste
   (25 % des clics Clarity). S'affiche : home "/" uniquement, 1×/session,
   jamais sur les deep-links/landings SEO. Photo locale (~50-200 ko).
   ═══════════════════════════════════════════════════════════════════════════ */
// ── SargaChat — assistant guidé « style chat IA », 100% statique ──
// Arbre fermé (chips, pas de saisie libre) : les réponses sont calculées depuis
// la donnée LIVE déjà en mémoire (sargassum.json) → véridiques par construction,
// instantanées, zéro backend/LLM (recherche 2026-06-10 : hallucination sur un
// produit qui vend UN verdict fiable = inacceptable ; précédent Air Canada 2024).
// Chaque branche se termine sur une action : plage, carte, Premium, confiance.
function SargaChat({lang,allBeaches,island,sargData,onOpenBeach,onPremium,onClose}){
  const t=(fr,en,es)=>_t(lang,fr,en,es)
  const cands=useMemo(()=>(allBeaches||[]).filter(b=>(IS_NEW_REGION||b.island===island)&&b.status),[allBeaches,island])
  const cleans=useMemo(()=>cands.filter(b=>b.status==="clean").sort((a,b)=>(b.score||0)-(a.score||0)),[cands])
  const rootChips=[
    {k:"where",label:t("🏖 Où aller aujourd'hui ?","🏖 Where should I go today?","🏖 ¿Adónde voy hoy?")},
    {k:"tomorrow",label:t("📅 Et demain, ça tient ?","📅 Will it hold tomorrow?","📅 ¿Y mañana?")},
    {k:"premium",label:t("⭐ C'est quoi Premium ?","⭐ What's Premium?","⭐ ¿Qué es Premium?")},
    {k:"trust",label:t("🛰 C'est fiable ?","🛰 Is it reliable?","🛰 ¿Es confiable?")},
  ]
  const hello={who:"bot",text:t(
    "Salut ! Je réponds avec les données satellite du jour — rien d'inventé. Tu veux savoir quoi ?",
    "Hi! I answer with today's satellite data — nothing made up. What do you want to know?",
    "¡Hola! Respondo con los datos satelitales de hoy — nada inventado. ¿Qué quieres saber?"),chips:rootChips}
  const[msgs,setMsgs]=useState([hello])
  const[typing,setTyping]=useState(false)
  const bodyRef=useRef(null)
  useEffect(()=>{if(bodyRef.current)bodyRef.current.scrollTop=bodyRef.current.scrollHeight},[msgs,typing])
  const answer=k=>{
    if(k==="where"){
      if(cleans.length){
        const top=cleans.slice(0,3)
        return{text:t(
          `Aujourd'hui, ${cleans.length} plage${cleans.length>1?"s":""} propre${cleans.length>1?"s":""}. Mon top : ${top.map(b=>`${b.name}${b.score!=null?` (${b.score}/100)`:""}`).join(", ")}.`,
          `${cleans.length} clean beach${cleans.length>1?"es":""} today. My top picks: ${top.map(b=>`${b.name}${b.score!=null?` (${b.score}/100)`:""}`).join(", ")}.`,
          `Hoy hay ${cleans.length} playa${cleans.length>1?"s":""} limpia${cleans.length>1?"s":""}. Mi top: ${top.map(b=>`${b.name}${b.score!=null?` (${b.score}/100)`:""}`).join(", ")}.`),
          chips:[{k:"open:"+top[0].id,label:t("Ouvrir "+top[0].name+" →","Open "+top[0].name+" →","Abrir "+top[0].name+" →")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
      }
      const best=[...cands].sort((a,b)=>(b.score||0)-(a.score||0))[0]
      return{text:t(
        "Aucune plage 100% propre aujourd'hui — journée compliquée. La moins touchée reste "+(best?best.name:"…")+".",
        "No fully clean beach today — rough day. The least affected is "+(best?best.name:"…")+".",
        "Ninguna playa 100% limpia hoy — día difícil. La menos afectada es "+(best?best.name:"…")+"."),
        chips:[...(best?[{k:"open:"+best.id,label:t("Voir "+best.name+" →","See "+best.name+" →","Ver "+best.name+" →")}]:[]),{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    }
    if(k==="tomorrow"){
      const wk=sargData?.weekly||{}
      let stay=0,turn=0
      for(const b of cleans){
        const id=IS_NEW_REGION?b.id:BEACH_TO_SARG[b.id]
        const f=id?wk[id]?.forecast?.[1]?.status:null
        if(!f)continue
        if(f==="clean")stay++;else turn++
      }
      const has=stay+turn>0
      return{text:has?t(
        `Prévision satellite pour demain : ${stay} plage${stay>1?"s":""} propre${stay>1?"s":""} le reste${stay>1?"nt":""}${turn?`, ${turn} se dégrade${turn>1?"nt":""} ⚠️`:" — ça tient."}`,
        `Satellite forecast for tomorrow: ${stay} beach${stay>1?"es":""} stay${stay>1?"":"s"} clean${turn?`, ${turn} turn${turn>1?"":"s"} worse ⚠️`:" — holding."}`,
        `Pronóstico satelital para mañana: ${stay} playa${stay>1?"s":""} sigue${stay>1?"n":""} limpia${stay>1?"s":""}${turn?`, ${turn} empeora${turn>1?"n":""} ⚠️`:" — se mantiene."}`):t(
        "La prévision de demain est en cours de calcul (4 passages satellite par jour) — repasse dans quelques heures.",
        "Tomorrow's forecast is still computing (4 satellite passes a day) — check back in a few hours.",
        "El pronóstico de mañana se está calculando (4 pasadas satelitales al día) — vuelve en unas horas."),
        chips:[{k:"premium",label:t("⭐ Les 7 jours, plage par plage","⭐ The full 7 days, beach by beach","⭐ Los 7 días, playa por playa")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    }
    if(k==="premium")return{text:t(
      "Premium, c'est ton veilleur personnel : la plage recommandée chaque matin dans ta boîte, une alerte si TA plage change, et la prévision 7 jours plage par plage. Annulable en 2 clics.",
      "Premium is your personal watchman: the recommended beach in your inbox every morning, an alert when YOUR beach changes, and the 7-day forecast beach by beach. Cancel in 2 clicks.",
      "Premium es tu vigía personal: la playa recomendada cada mañana en tu correo, una alerta si TU playa cambia, y el pronóstico de 7 días playa por playa. Cancela en 2 clics."),
      chips:[{k:"cta",label:t("Voir l'offre ⭐","See the offer ⭐","Ver la oferta ⭐")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    if(k==="trust")return{text:t(
      "Données satellite Copernicus (programme spatial européen), actualisées 4×/jour, croisées avec la météo marine et les signalements locaux — plage par plage, pas de moyenne d'île. Quand on ne sait pas, on le dit.",
      "Copernicus satellite data (the EU space programme), refreshed 4×/day, cross-checked with marine weather and local reports — beach by beach, no island-wide averages. When we don't know, we say so.",
      "Datos del satélite Copernicus (programa espacial europeo), actualizados 4 veces al día, cruzados con meteo marina y reportes locales — playa por playa. Cuando no sabemos, lo decimos."),
      chips:[{k:"about",label:t("La page confiance →","The trust page →","La página de confianza →")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    return null
  }
  const onChip=c=>{
    const lbl=c.label.replace(/^← /,"")
    if(c.k==="root"){setMsgs(m=>[...m,{who:"me",text:lbl},hello]);return}
    if(c.k==="cta"){track("sg_chat_cta",{});onClose();onPremium();return}
    // USD : /about/ (EN/ES, shipped 2026-06-11) — /a-propos/ n'existe que MQ/GP
    // (pointer /a-propos/ sur USD = 404 avalé par le fallback SPA).
    if(c.k==="about"){track("sg_chat_branch",{branch:"about_page"});window.location.href=IS_NEW_REGION?"/about/":"/a-propos/";return}
    if(c.k.startsWith("open:")){
      const b=cands.find(x=>x.id===c.k.slice(5))
      if(b){track("sg_chat_branch",{branch:"open_beach"});onClose();onOpenBeach(b)}
      return
    }
    track("sg_chat_branch",{branch:c.k})
    setMsgs(m=>[...m,{who:"me",text:lbl}])
    setTyping(true)
    setTimeout(()=>{
      setTyping(false)
      const a=answer(c.k)
      if(a)setMsgs(m=>[...m,{who:"bot",text:a.text,chips:a.chips}])
    },650)
  }
  const last=msgs[msgs.length-1]
  return(
    <div role="dialog" aria-label="Assistant" style={{position:"fixed",right:0,bottom:0,left:0,zIndex:1090,display:"flex",justifyContent:"flex-end",pointerEvents:"none"}}>
      <div style={{pointerEvents:"auto",width:"100%",maxWidth:420,margin:"0 10px calc(10px + env(safe-area-inset-bottom))",
        background:"#0D1E1C",border:"1px solid rgba(255,255,255,.12)",borderRadius:20,overflow:"hidden",
        boxShadow:"0 18px 60px rgba(0,0,0,.55)",display:"flex",flexDirection:"column",maxHeight:"min(72vh,560px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",
          borderBottom:"1px solid rgba(255,255,255,.08)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 8px #22C55E"}}/>
            <strong style={{fontSize:13.5,color:"#fff"}}>{t("Assistant Sargasses","Sargassum Assistant","Asistente Sargazo")}</strong>
            <span style={{fontSize:10.5,color:"rgba(255,255,255,.45)"}}>{t("· données live","· live data","· datos en vivo")}</span>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{background:"none",border:"none",color:"rgba(255,255,255,.6)",
            fontSize:18,cursor:"pointer",padding:4}}>✕</button>
        </div>
        <div ref={bodyRef} style={{overflowY:"auto",padding:"14px 12px",display:"flex",flexDirection:"column",gap:10}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{alignSelf:m.who==="me"?"flex-end":"flex-start",maxWidth:"86%",
              background:m.who==="me"?"#FFC72C":"rgba(255,255,255,.07)",color:m.who==="me"?"#0A1714":"#fff",
              fontSize:13.5,lineHeight:1.5,padding:"10px 13px",
              borderRadius:m.who==="me"?"16px 16px 4px 16px":"16px 16px 16px 4px"}}>{m.text}</div>
          ))}
          {typing&&<div style={{alignSelf:"flex-start",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.7)",
            fontSize:13.5,padding:"10px 14px",borderRadius:"16px 16px 16px 4px",letterSpacing:2}}>•••</div>}
          {!typing&&last?.who==="bot"&&last.chips&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:2}}>
              {last.chips.map((c,i)=>(
                <button key={i} onClick={()=>onChip(c)} style={{background:"rgba(255,199,44,.1)",
                  border:"1px solid rgba(255,199,44,.45)",color:"#FFC72C",fontFamily:"inherit",fontWeight:700,
                  fontSize:12.5,padding:"9px 13px",borderRadius:999,cursor:"pointer",textAlign:"left"}}>{c.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── SCÈNE VIVANTE (WebGL) — demande user 2026-06-11 « une vraie scène, pas
   juste animer la photo ». Shader temps réel sur la photo réelle de la plage :
   l'eau ondule (déplacement sinusoïdal masqué sur le bas de l'image), reflets
   qui scintillent, parallaxe douce qui suit le pointeur (gaming/interactif).
   Rend à la résolution NATIVE de l'écran (cap DPR 2) → net en 4K, zéro mp4.
   Honnête par construction : c'est la photo réelle, animée — rien d'inventé.
   Fallbacks : pas de WebGL / reduced-motion / saveData → vidéo loop → photo. */
function SceneCanvas({src,focalY=0.38,onReady}){
  const ref=useRef(null)
  useEffect(()=>{
    const cv=ref.current;if(!cv)return
    let gl=null
    try{gl=cv.getContext("webgl",{antialias:false,alpha:false,powerPreference:"low-power"})}catch(_){}
    if(!gl)return
    let dead=false,raf=0,tex=null,prog=null,t0=performance.now()
    const parCur=[0,0],parTgt=[0,0]
    const VS="attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"
    const FS=`precision mediump float;
uniform sampler2D u_tex;uniform float u_t;uniform vec2 u_res;uniform vec2 u_img;uniform vec2 u_par;uniform float u_fy;
void main(){
  vec2 frag=gl_FragCoord.xy/u_res;          /* 0..1, y vers le haut */
  vec2 uv=vec2(frag.x,1.0-frag.y);          /* y vers le bas, comme l'image */
  /* cover-fit avec point focal vertical (équivalent object-fit:cover + position center u_fy) */
  float sc=max(u_res.x/u_img.x,u_res.y/u_img.y);
  vec2 vis=u_res/(u_img*sc);                /* fraction visible de l'image */
  vec2 off=vec2((1.0-vis.x)*0.5,(1.0-vis.y)*u_fy);
  vec2 iuv=off+uv*vis;
  /* masque eau en coordonnées ÉCRAN : avec le cadrage focal 38%, le bas du
     viewport = avant-plan mer/sable sur nos photos plage (un masque en coord
     image tombait sous le bloc texte mobile et figeait la scène visible) */
  float wm=smoothstep(0.42,0.72,uv.y);
  /* houle : 3 sinusoïdes lentes, subtiles mais visibles */
  float wy=sin(iuv.x*42.0+u_t*1.15)*0.0030+sin(iuv.x*19.0-u_t*0.85)*0.0022;
  float wx=sin(iuv.y*55.0+u_t*1.55)*0.0014;
  vec2 duv=iuv+vec2(wx,wy)*wm+u_par*vec2(0.010,0.007);
  vec3 c=texture2D(u_tex,duv).rgb;
  /* scintillement spéculaire discret sur l'eau */
  float sp=pow(max(0.0,sin(iuv.x*110.0+u_t*1.9)*sin(iuv.y*75.0-u_t*1.3)),24.0)*wm*0.10;
  /* vignette douce */
  float vg=1.0-0.16*length(frag-vec2(0.5,0.45));
  gl_FragColor=vec4((c+sp)*vg,1.0);
}`
    const mk=(ty,s)=>{const sh=gl.createShader(ty);gl.shaderSource(sh,s);gl.compileShader(sh);return sh}
    try{
      prog=gl.createProgram()
      gl.attachShader(prog,mk(gl.VERTEX_SHADER,VS));gl.attachShader(prog,mk(gl.FRAGMENT_SHADER,FS))
      gl.linkProgram(prog)
      if(!gl.getProgramParameter(prog,gl.LINK_STATUS))return
      gl.useProgram(prog)
      const buf=gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER,buf)
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW)
      const loc=gl.getAttribLocation(prog,"p")
      gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0)
    }catch(_){return}
    const uT=gl.getUniformLocation(prog,"u_t"),uRes=gl.getUniformLocation(prog,"u_res"),
      uImg=gl.getUniformLocation(prog,"u_img"),uPar=gl.getUniformLocation(prog,"u_par"),
      uFy=gl.getUniformLocation(prog,"u_fy")
    const img=new Image()
    img.crossOrigin="anonymous"
    img.onload=()=>{
      if(dead)return
      tex=gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D,tex)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img)
      gl.uniform2f(uImg,img.naturalWidth,img.naturalHeight)
      gl.uniform1f(uFy,focalY)
      onReady&&onReady()
      const size=()=>{
        const dpr=Math.min(2,window.devicePixelRatio||1)
        const w=Math.round(cv.clientWidth*dpr),h=Math.round(cv.clientHeight*dpr)
        if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;gl.viewport(0,0,w,h)}
        gl.uniform2f(uRes,cv.width,cv.height)
      }
      let last=0
      const loop=ts=>{
        if(dead)return
        raf=requestAnimationFrame(loop)
        if(document.hidden)return
        if(ts-last<33)return            /* cap ~30fps : fluide et sobre en batterie */
        last=ts
        size()
        parCur[0]+=(parTgt[0]-parCur[0])*0.06
        parCur[1]+=(parTgt[1]-parCur[1])*0.06
        gl.uniform1f(uT,(ts-t0)/1000)
        gl.uniform2f(uPar,parCur[0],parCur[1])
        gl.drawArrays(gl.TRIANGLES,0,3)
      }
      raf=requestAnimationFrame(loop)
    }
    img.src=src
    const onMove=e=>{
      const x=(e.touches?e.touches[0]:e).clientX,y=(e.touches?e.touches[0]:e).clientY
      parTgt[0]=(x/window.innerWidth-0.5)*2
      parTgt[1]=(y/window.innerHeight-0.5)*2
    }
    window.addEventListener("pointermove",onMove,{passive:true})
    return()=>{dead=true;cancelAnimationFrame(raf)
      window.removeEventListener("pointermove",onMove)
      try{tex&&gl.deleteTexture(tex);prog&&gl.deleteProgram(prog)}catch(_){}}
  },[src,focalY])
  return <canvas ref={ref} aria-hidden style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}/>
}

/* ── Capture click-triggered « 🔔 Être prévenu si ça change » — recherche
   orchestration 2026-06 : déclenchée PAR le clic utilisateur ≈ 54 % CVR vs
   ~3-4 % pour les popups. Sous le verdict de la fiche, non-premium, masquée
   si email déjà capturé. Promesse VRAIE par construction : ces leads entrent
   dans l'email verdict du matin (drip-email.cjs accepte source beach_alert). */
function AlertCapture({beach,lang}){
  const[open,setOpen]=useState(false)
  const[email,setEmail]=useState("")
  const[done,setDone]=useState(false)
  const[hidden]=useState(()=>{try{return !!localStorage.getItem("sg_email")}catch(_){return false}})
  if(hidden)return null
  const submit=e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    track("sg_email_submit",{source:"beach_alert",beach_id:beach.id})
    try{localStorage.setItem("sg_email",email)}catch(_){}
    const island=IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({email,island,source:"beach_alert",beach_id:beach.id,date:new Date().toISOString()})
    }).catch(()=>{})}catch(_){}
    setDone(true)
  }
  if(done)return(
    <div style={{display:"flex",alignItems:"center",gap:9,background:"rgba(46,204,113,.10)",
      border:"1px solid rgba(46,204,113,.35)",borderRadius:14,padding:"11px 13px",margin:"0 0 14px",
      fontSize:12.5,fontWeight:700,color:"#1F8A4C"}}>
      ✓ {_t(lang,"C'est noté — le verdict du matin arrive dans ta boîte. Désinscription en 1 clic.","Done — the morning verdict lands in your inbox. 1-click unsubscribe.","Listo — el veredicto de la mañana llega a tu correo. Baja en 1 clic.")}
    </div>
  )
  if(!open)return(
    <button onClick={()=>{setOpen(true);track("sg_alert_capture_open",{beach_id:beach.id})}}
      style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",cursor:"pointer",
        background:"var(--sg-soft,rgba(0,0,0,.04))",border:"1px solid var(--sg-line,rgba(0,0,0,.10))",
        borderRadius:14,padding:"11px 13px",margin:"0 0 14px",fontFamily:"inherit"}}>
      <span style={{fontSize:16,flexShrink:0}}>🔔</span>
      <span style={{flex:1,fontSize:12.5,fontWeight:600,color:"var(--sg-ink,#1A2B26)"}}>
        {_t(lang,"Être prévenu si ça change","Get notified if this changes","Avísame si cambia")}
      </span>
      <span aria-hidden style={{fontSize:14,fontWeight:800,color:"var(--sg-dim,#7A8A85)"}}>+</span>
    </button>
  )
  return(
    <form onSubmit={submit} style={{display:"flex",gap:8,margin:"0 0 14px"}}>
      <input type="email" inputMode="email" autoComplete="email" required autoFocus
        placeholder={_t(lang,"Ton email — verdict chaque matin","Your email — verdict every morning","Tu email — veredicto cada mañana")}
        value={email} onChange={e=>setEmail(e.target.value)}
        style={{flex:1,minWidth:0,padding:"11px 13px",borderRadius:14,fontSize:13,fontFamily:"inherit",
          border:"1px solid var(--sg-line,rgba(0,0,0,.15))",background:"var(--sg-card,#fff)",color:"var(--sg-ink,#1A2B26)"}}/>
      <button type="submit" style={{flexShrink:0,background:"#FFC72C",color:"#0A1714",border:"none",cursor:"pointer",
        fontFamily:"inherit",fontWeight:800,fontSize:13,padding:"11px 14px",borderRadius:14}}>OK</button>
    </form>
  )
}

/* ── CLIP SUR MESURE (SVG animé) — demande user 2026-06-11 : « création de
   clip pour mon produit, pas de l'édition vidéo ». Scène signature 100 %
   vectorielle (nette à toute résolution, ~8 Ko, zéro réseau) qui raconte le
   produit en une boucle : satellite qui scanne → radeaux de sargasses qui
   dérivent → bateau qui relève le filet → ramasseur au râteau → verdict ✓
   qui ping. Palette maison (encre/or/teal). Boucle CSS pure, stoppée par
   prefers-reduced-motion (frame statique lisible). */
function MethodScene(){
  return(
    <div aria-hidden style={{borderRadius:20,overflow:"hidden",border:"1px solid rgba(255,255,255,.09)",
      background:"linear-gradient(180deg,#0C1D21 0%,#0A1714 100%)"}}>
      <svg viewBox="0 0 560 300" style={{display:"block",width:"100%",height:"auto"}}>
        <style>{`
.sgms-sat{animation:sgmsOrbit 26s linear infinite}
@keyframes sgmsOrbit{from{transform:translateX(-90px)}to{transform:translateX(650px)}}
.sgms-beam{animation:sgmsBeam 3.2s ease-in-out infinite}
@keyframes sgmsBeam{0%,100%{opacity:.07}50%{opacity:.2}}
.sgms-w1{animation:sgmsDrift 13s linear infinite}
.sgms-w2{animation:sgmsDrift 21s linear infinite reverse}
@keyframes sgmsDrift{from{transform:translateX(0)}to{transform:translateX(-560px)}}
.sgms-raft1{animation:sgmsRaft 38s linear infinite}
.sgms-raft2{animation:sgmsRaft 52s linear infinite;animation-delay:-26s}
@keyframes sgmsRaft{from{transform:translateX(620px)}to{transform:translateX(-160px)}}
.sgms-boat{animation:sgmsBob 4.2s ease-in-out infinite}
@keyframes sgmsBob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(3.5px) rotate(-1.2deg)}}
.sgms-palm{animation:sgmsSway 5.5s ease-in-out infinite;transform-origin:468px 218px}
@keyframes sgmsSway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.8deg)}}
.sgms-rake{animation:sgmsRake 1.9s ease-in-out infinite;transform-origin:402px 232px}
@keyframes sgmsRake{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(7deg)}}
.sgms-ping{animation:sgmsPing 2.6s ease-out infinite;transform-origin:497px 96px}
@keyframes sgmsPing{0%{transform:scale(.4);opacity:.8}70%,100%{transform:scale(1.8);opacity:0}}
.sgms-link{stroke-dasharray:3 5;animation:sgmsFlow 1.4s linear infinite}
@keyframes sgmsFlow{from{stroke-dashoffset:16}to{stroke-dashoffset:0}}
.sgms-echo1{animation:sgmsEcho 2.4s ease-out infinite;transform-origin:316px 214px}
.sgms-echo2{animation:sgmsEcho 2.4s ease-out infinite;animation-delay:1.2s;transform-origin:316px 214px}
@keyframes sgmsEcho{0%{transform:scale(.35);opacity:.9}75%,100%{transform:scale(2.1);opacity:0}}
@media (prefers-reduced-motion:reduce){.sgms-sat,.sgms-beam,.sgms-w1,.sgms-w2,.sgms-raft1,.sgms-raft2,.sgms-boat,.sgms-palm,.sgms-rake,.sgms-ping,.sgms-link,.sgms-echo1,.sgms-echo2{animation:none}}
        `}</style>
        <defs>
          <linearGradient id="sgmsBeamG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFC72C" stopOpacity=".55"/><stop offset="1" stopColor="#FFC72C" stopOpacity="0"/>
          </linearGradient>
          <path id="sgmsWave" d="M0 200 Q35 192 70 200 T140 200 T210 200 T280 200 T350 200 T420 200 T490 200 T560 200 T630 200 T700 200 T770 200 T840 200 T910 200 T980 200 T1050 200 T1120 200 V260 H0 Z"/>
          <g id="sgmsSarg">
            <ellipse cx="0" cy="0" rx="16" ry="6" fill="#8a6a1a"/>
            <ellipse cx="-9" cy="-3" rx="8" ry="4" fill="#9a7a22"/>
            <ellipse cx="9" cy="-2" rx="9" ry="4" fill="#6b4a12"/>
            <circle cx="-12" cy="-6" r="2.2" fill="#b8962e"/><circle cx="-2" cy="-7" r="2" fill="#b8962e"/><circle cx="8" cy="-6" r="2.2" fill="#b8962e"/>
          </g>
        </defs>
        {/* ciel : soleil + étoile satellite */}
        <circle cx="78" cy="64" r="22" fill="#FFC72C" opacity=".85"/>
        <circle cx="78" cy="64" r="34" fill="#FFC72C" opacity=".12"/>
        {/* satellite + faisceau de scan (il balaie toute la mer) */}
        <g className="sgms-sat">
          <g transform="translate(0,34)">
            <rect x="-9" y="-5" width="18" height="10" rx="2" fill="#E8EDF2"/>
            <rect x="-26" y="-3" width="14" height="6" rx="1" fill="#3BA7A0"/>
            <rect x="12" y="-3" width="14" height="6" rx="1" fill="#3BA7A0"/>
            <polygon className="sgms-beam" points="-6,6 6,6 26,166 -26,166" fill="url(#sgmsBeamG)"/>
          </g>
        </g>
        {/* mer : 2 nappes de houle qui glissent (motif 560px répété ×2 = boucle parfaite) */}
        <g className="sgms-w2" opacity=".5"><use href="#sgmsWave" fill="#103833" transform="translate(0,-7)"/><use href="#sgmsWave" fill="#103833" transform="translate(560,-7)"/></g>
        <g className="sgms-w1"><use href="#sgmsWave" fill="#0E2E2A"/><use href="#sgmsWave" fill="#0E2E2A" transform="translate(560,0)"/></g>
        {/* radeaux de sargasses qui dérivent vers la plage */}
        <g className="sgms-raft1" transform="translate(0,206)"><use href="#sgmsSarg"/></g>
        <g className="sgms-raft2" transform="translate(0,196)"><use href="#sgmsSarg" transform="scale(.75)"/></g>
        {/* bateau de collecte + filet vers un radeau fixe */}
        <g className="sgms-boat">
          <g transform="translate(225,196)">
            <path d="M-34 0 L34 0 L24 14 L-26 14 Z" fill="#16282C" stroke="#FFC72C" strokeWidth="1.2"/>
            <line x1="0" y1="0" x2="0" y2="-26" stroke="#E8EDF2" strokeWidth="2"/>
            <polygon points="0,-26 16,-20 0,-14" fill="#FFC72C"/>
            <path className="sgms-link" d="M30 6 Q58 26 86 16" stroke="#FFC72C" strokeWidth="1.6" fill="none"/>
          </g>
        </g>
        <g transform="translate(316,214)"><use href="#sgmsSarg" transform="scale(.85)"/></g>
        {/* écho radar sur le radeau détecté (continuité avec le film Sentinel-6)
            + l'étiquette de mesure — la détection rendue visible */}
        <circle className="sgms-echo1" cx="316" cy="214" r="9" fill="none" stroke="#3BA7A0" strokeWidth="1.6"/>
        <circle className="sgms-echo2" cx="316" cy="214" r="9" fill="none" stroke="#3BA7A0" strokeWidth="1.3"/>
        <g transform="translate(316,182)">
          <rect x="-29" y="-10" width="58" height="17" rx="8.5" fill="rgba(10,23,20,.88)" stroke="#3BA7A0" strokeWidth="1"/>
          <text x="0" y="3" textAnchor="middle" fontFamily="ui-monospace,monospace" fontSize="9.5" fontWeight="700" fill="#5FD3C9">AFAI 0.42</text>
        </g>
        {/* plage : langue de sable + palmier + ramasseur au râteau */}
        <path d="M318 262 Q420 218 560 212 L560 300 L318 300 Z" fill="#1A2A23"/>
        <path d="M340 262 Q430 226 560 220" stroke="#FFC72C" strokeWidth="1.4" fill="none" opacity=".5"/>
        <g className="sgms-palm">
          <path d="M468 218 Q462 184 470 158" stroke="#2E4A3C" strokeWidth="5" fill="none" strokeLinecap="round"/>
          <g fill="none" stroke="#3F6B52" strokeWidth="4" strokeLinecap="round">
            <path d="M470 158 Q488 146 506 150"/><path d="M470 158 Q452 144 434 150"/>
            <path d="M470 158 Q484 138 498 132"/><path d="M470 158 Q456 136 444 130"/>
            <path d="M470 158 Q470 138 472 128"/>
          </g>
        </g>
        {/* ramasseur (silhouette or — le héros de la scène) */}
        <g fill="none" stroke="#FFC72C" strokeWidth="3" strokeLinecap="round">
          <circle cx="396" cy="206" r="5.5" fill="#FFC72C" stroke="none"/>
          <path d="M396 212 L396 232"/>
          <path d="M396 232 L388 248"/><path d="M396 232 L404 247"/>
        </g>
        <g className="sgms-rake">
          <line x1="402" y1="218" x2="424" y2="244" stroke="#FFC72C" strokeWidth="2.6" strokeLinecap="round"/>
          <path d="M418 246 L432 240 M421 249 L433 245 M424 251 L434 250" stroke="#FFC72C" strokeWidth="2" strokeLinecap="round"/>
        </g>
        {/* tas ramassé */}
        <g transform="translate(440,250)"><use href="#sgmsSarg" transform="scale(.7)"/></g>
        {/* verdict : pill ✓ qui ping, reliée au ciel (la donnée descend) */}
        <line className="sgms-link" x1="497" y1="40" x2="497" y2="82" stroke="#FFC72C" strokeWidth="1.6"/>
        <circle className="sgms-ping" cx="497" cy="96" r="16" fill="none" stroke="#FFC72C" strokeWidth="2"/>
        <g>
          <rect x="473" y="84" width="48" height="24" rx="12" fill="#FFC72C"/>
          <path d="M487 96 L494 102 L508 89" stroke="#0A1714" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
      </svg>
    </div>
  )
}

/* ── Scène 2 « L'Alerte » (même gabarit que MethodScene) — le moment de valeur
   Premium en une boucle 9s : 6h du matin, le téléphone reçoit l'alerte ⚠️
   (un banc arrive sur la plage prévue), l'itinéraire bascule en pointillés
   vers la plage ✓ propre. Séquencée en % d'une seule timeline CSS. */
function AlertScene(){
  return(
    <div aria-hidden style={{borderRadius:20,overflow:"hidden",border:"1px solid rgba(255,255,255,.09)",
      background:"linear-gradient(180deg,#0C1D21 0%,#0A1714 100%)"}}>
      <svg viewBox="0 0 560 240" style={{display:"block",width:"100%",height:"auto"}}>
        <style>{`
.sgas-notif{animation:sgasNotif 9s cubic-bezier(.22,1,.36,1) infinite}
@keyframes sgasNotif{0%,6%{opacity:0;transform:translateY(14px)}12%,88%{opacity:1;transform:translateY(0)}96%,100%{opacity:0;transform:translateY(14px)}}
.sgas-raft{animation:sgasRaft 9s linear infinite}
@keyframes sgasRaft{0%{transform:translateX(46px)}100%{transform:translateX(-30px)}}
.sgas-route{stroke-dasharray:4 6;animation:sgasRoute 9s linear infinite}
@keyframes sgasRoute{0%,18%{opacity:0}26%,90%{opacity:1}100%{opacity:0}}
.sgas-dot{animation:sgasDot 9s cubic-bezier(.45,.05,.4,1) infinite}
@keyframes sgasDot{0%,24%{offset-distance:0%;opacity:0}30%{opacity:1}62%,88%{offset-distance:100%;opacity:1}96%,100%{offset-distance:100%;opacity:0}}
.sgas-ok{animation:sgasOk 9s ease-out infinite;transform-origin:468px 96px}
@keyframes sgasOk{0%,60%{transform:scale(.4);opacity:0}68%{transform:scale(1.25);opacity:1}74%,88%{transform:scale(1);opacity:1}96%,100%{opacity:0}}
.sgas-sun{animation:sgasSun 9s ease-in-out infinite}
@keyframes sgasSun{0%,8%{transform:translateY(16px);opacity:.4}30%,90%{transform:translateY(0);opacity:.9}100%{transform:translateY(16px);opacity:.4}}
@media (prefers-reduced-motion:reduce){.sgas-notif,.sgas-raft,.sgas-route,.sgas-dot,.sgas-ok,.sgas-sun{animation:none}}
        `}</style>
        {/* aube : soleil qui se lève + heure */}
        <g className="sgas-sun"><circle cx="60" cy="52" r="16" fill="#FFC72C"/><circle cx="60" cy="52" r="26" fill="#FFC72C" opacity=".12"/></g>
        <text x="92" y="58" fontFamily="ui-monospace,monospace" fontSize="15" fontWeight="700" fill="rgba(255,255,255,.75)">06:00</text>
        {/* téléphone + notification */}
        <g>
          <rect x="36" y="84" width="118" height="128" rx="16" fill="#10231E" stroke="rgba(255,255,255,.16)"/>
          <rect x="78" y="92" width="34" height="5" rx="2.5" fill="rgba(255,255,255,.18)"/>
          <g className="sgas-notif">
            <rect x="46" y="108" width="98" height="44" rx="10" fill="#1A2F29" stroke="rgba(255,199,44,.45)"/>
            <text x="56" y="126" fontSize="13">⚠️</text>
            <rect x="76" y="118" width="58" height="5" rx="2.5" fill="rgba(255,255,255,.55)"/>
            <rect x="76" y="128" width="42" height="5" rx="2.5" fill="rgba(255,255,255,.28)"/>
            <rect x="56" y="138" width="50" height="7" rx="3.5" fill="#FFC72C"/>
          </g>
        </g>
        {/* plage ⚠️ (le banc arrive) */}
        <path d="M205 196 Q255 176 310 182 L310 240 L205 240 Z" fill="#1A2A23"/>
        <g className="sgas-raft" transform="translate(232,186)">
          <ellipse cx="0" cy="0" rx="14" ry="5" fill="#8a6a1a"/><ellipse cx="-8" cy="-2" rx="7" ry="3.5" fill="#9a7a22"/>
          <ellipse cx="8" cy="-2" rx="8" ry="3.5" fill="#6b4a12"/><circle cx="-4" cy="-5" r="1.8" fill="#b8962e"/><circle cx="6" cy="-4" r="1.8" fill="#b8962e"/>
        </g>
        <g transform="translate(258,160)">
          <circle cx="0" cy="0" r="11" fill="#E8522A"/>
          <text x="0" y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">!</text>
        </g>
        {/* itinéraire bascule : pointillés du téléphone vers la plage ✓ */}
        <path id="sgasPath" d="M160 150 Q300 70 440 116" fill="none" className="sgas-route" stroke="#FFC72C" strokeWidth="2.4"/>
        <circle className="sgas-dot" r="6" fill="#FFC72C" style={{offsetPath:"path('M160 150 Q300 70 440 116')"}}/>
        {/* plage ✓ propre */}
        <path d="M388 178 Q452 152 560 160 L560 240 L388 240 Z" fill="#1A2A23"/>
        <path d="M402 178 Q462 158 552 162" stroke="#FFC72C" strokeWidth="1.3" fill="none" opacity=".5"/>
        <g fill="none" stroke="#3F6B52" strokeWidth="3.4" strokeLinecap="round">
          <path d="M512 164 Q506 140 512 122"/>
          <path d="M512 122 Q524 112 538 114"/><path d="M512 122 Q500 110 488 112"/><path d="M512 122 Q514 106 518 100"/>
        </g>
        <g className="sgas-ok">
          <circle cx="468" cy="96" r="15" fill="#FFC72C"/>
          <path d="M461 96 L466 101 L476 90" stroke="#0A1714" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
      </svg>
    </div>
  )
}

/* ── BrandIcon — kit iconographique maison (MIROIR de scripts/lib/brand-icons.cjs,
   garder les paths synchronisés). Remplace les emojis OS sur les surfaces de
   marque : un emoji rend différemment par device et casse la cohérence avec
   les scènes SVG (audit design 2026-06-12). ── */
function BrandIcon({name,size=22,accent="#FFC72C",style}){
  const A={stroke:accent}
  const P={
    satellite:<><rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.2"/><path d="M7.5 9.5L5 7M16.5 14.5l2.5 2.5"/><rect x="1.6" y="2.6" width="5.2" height="3.6" rx="0.8" transform="rotate(45 4.2 4.4)"/><rect x="17.2" y="17.2" width="5.2" height="3.6" rx="0.8" transform="rotate(45 19.8 19)"/><path d="M14.5 7.5c1.6-1.6 4.6-1.4 6 0" {...A}/></>,
    score:<><path d="M5 19V12M10 19V7M15 19v-4"/><path d="M16.5 8.5l2 2L22 7" {...A}/></>,
    cal7:<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3.2v3.4M16 3.2v3.4"/><text x="12" y="17.4" textAnchor="middle" fontSize="7.5" fontWeight="800" stroke="none" fill="currentColor">7</text></>,
    bell:<><path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.6 2.2H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0" {...A}/></>,
    brief:<><rect x="3" y="8.5" width="14" height="11" rx="2"/><path d="M3.6 9.5L10 14.5l6.4-5"/><circle cx="19.5" cy="5.5" r="2.4" fill={accent} stroke="none"/><path d="M19.5 1.4v1M22.8 5.5h1M16.2 5.5h1" {...A}/></>,
    map:<><path d="M9 4.5L4 6.5v13l5-2 6 2 5-2v-13l-5 2z"/><path d="M9 4.5v13M15 6.5v13"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex:"none",...style}}>{P[name]||null}</svg>
}

/* ── SatelliteFilm — le film d'ouverture de la méthode (modèle SpaceX).
   Footage réel NASA/JPL-Caltech (domaine public) : Sentinel-6, mission
   Copernicus d'altimétrie, glisse au-dessus de l'océan en émettant ses
   impulsions radar — le geste exact que MethodScene traduit ensuite en
   verdict plage par plage (l'écho teal sur le radeau = la continuité).
   Poster JPEG seul tant que la bande n'approche pas ; la vidéo (16 s,
   ~4,5 Mo) ne se charge qu'à 200 px du viewport, se pause hors champ,
   jamais chargée si reduced-motion / saveData / 2G (même règle que le héros). ── */
function SatelliteFilm({lang}){
  const boxRef=useRef(null)
  const vRef=useRef(null)
  const seenRef=useRef(false)
  const [src,setSrc]=useState(null)
  const [on,setOn]=useState(false)
  useEffect(()=>{
    const el=boxRef.current;if(!el)return
    let allow=true
    try{
      if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)allow=false
      const c=navigator.connection
      if(c&&(c.saveData||/(^|-)2g/.test(c.effectiveType||"")))allow=false
    }catch(_){}
    if(!allow)return
    const io=new IntersectionObserver(es=>{for(const e of es){
      const v=vRef.current
      if(e.isIntersecting){setSrc(s=>s||"/videos/sentinel6.mp4");if(v&&v.paused)v.play().catch(()=>{})}
      else if(v&&!v.paused)v.pause()
    }},{rootMargin:"200px 0px"})
    io.observe(el)
    return()=>io.disconnect()
  },[])
  return(
    <figure ref={boxRef} aria-label="Sentinel-6 — Copernicus" style={{margin:"18px calc(50% - 50vw) 0",position:"relative",
      overflow:"hidden",background:"#04090B",height:"clamp(230px,56vw,520px)"}}>
      <img src="/videos/sentinel6-poster.jpg" alt="" loading="lazy"
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 40%"}}/>
      {src&&<video ref={vRef} src={src} autoPlay muted loop playsInline preload="auto" aria-hidden
        onPlaying={()=>{setOn(true);if(!seenRef.current){seenRef.current=true;track("sg_film_view",{})}}}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 40%",
          opacity:on?1:0,transition:"opacity .8s ease"}}/>}
      <div aria-hidden style={{position:"absolute",inset:0,pointerEvents:"none",
        background:"linear-gradient(180deg,rgba(10,23,20,.45) 0%,rgba(10,23,20,0) 30%,rgba(10,23,20,0) 62%,rgba(10,23,20,.78) 100%)"}}/>
      <span style={{position:"absolute",top:12,left:14,display:"inline-flex",alignItems:"center",gap:6,
        fontSize:10,fontWeight:700,letterSpacing:".1em",color:"#fff",background:"rgba(10,23,20,.5)",
        border:"1px solid rgba(255,255,255,.18)",padding:"4px 10px",borderRadius:999}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:"#3BA7A0",boxShadow:"0 0 7px #3BA7A0"}}/>
        SENTINEL-6 · COPERNICUS
      </span>
      <div style={{position:"absolute",left:14,right:14,bottom:10,display:"flex",alignItems:"flex-end",
        justifyContent:"space-between",gap:10}}>
        <span style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,.88)",textShadow:"0 1px 8px rgba(0,0,0,.5)",maxWidth:380}}>
          {_t(lang,"Il scanne l'océan en continu, impulsion par impulsion.","It scans the ocean nonstop, pulse by pulse.","Escanea el océano sin parar, pulso a pulso.")}
        </span>
        <span style={{fontSize:9.5,color:"rgba(255,255,255,.42)",whiteSpace:"nowrap"}}>NASA/JPL-Caltech</span>
      </div>
    </figure>
  )
}

/* ── SceneWipe — transition phasée entre l'accueil et l'écran suivant
   (directive user 12/06 nuit : « des phases précises en série entre chaque
   élément, interactif, instructif »). Trois temps en 720 ms : le faisceau
   satellite balaie l'écran, un voile s'estompe, la légende ENSEIGNE la
   grammaire de la destination (« chaque pastille = la mesure du matin »).
   pointer-events none (ne bloque jamais), jamais montée si reduced-motion. ── */
function SceneWipe({label,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,780);return()=>clearTimeout(t)},[])
  return(
    <div aria-hidden style={{position:"absolute",inset:0,zIndex:1095,pointerEvents:"none",overflow:"hidden"}}>
      <style>{`
@keyframes sgwBeam{0%{transform:translateX(-14vw)}100%{transform:translateX(114vw)}}
@keyframes sgwVeil{0%{opacity:0}26%{opacity:.5}100%{opacity:0}}
@keyframes sgwLab{0%,16%{opacity:0;transform:translateY(8px)}34%,76%{opacity:1;transform:none}100%{opacity:0}}
      `}</style>
      <div style={{position:"absolute",inset:0,background:"#0A1714",animation:"sgwVeil .74s ease-out forwards"}}/>
      <div style={{position:"absolute",top:0,bottom:0,left:0,width:"13vw",
        animation:"sgwBeam .56s cubic-bezier(.55,.06,.35,1) forwards",
        background:"linear-gradient(90deg,rgba(255,199,44,0) 0%,rgba(255,199,44,.13) 55%,rgba(255,199,44,.8) 97%,#FFC72C 100%)"}}/>
      <div style={{position:"absolute",left:16,right:16,bottom:"18%",textAlign:"center",animation:"sgwLab .74s ease-out forwards"}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(10,23,20,.8)",
          border:"1px solid rgba(255,199,44,.4)",color:"#fff",fontSize:12.5,fontWeight:700,
          letterSpacing:".04em",padding:"8px 14px",borderRadius:999,maxWidth:"100%"}}>
          <BrandIcon name="satellite" size={15} style={{flex:"none"}}/>{label}
        </span>
      </div>
    </div>
  )
}

/* Override QA de phase (?ph=dawn|day|golden|night) — capturé au chargement du
   module car les effets de l'app nettoient la query string avant le mount. */
const HERO_PH_OVERRIDE=(()=>{try{
  const o=new URLSearchParams(window.location.search).get("ph")
  return ["dawn","day","golden","night"].includes(o)?o:null
}catch(_){return null}})()

/* Override QA du bras de landing (?lf=game|control) — capturé au chargement du
   module (l'app nettoie la query string avant le mount, cf. ?ph). Permet de
   forcer le funnel-jeu en preview/QA sans dépendre du tirage A/B. */
const LF_OVERRIDE=(()=>{try{
  const o=new URLSearchParams(window.location.search).get("lf")
  return o==="game"||o==="control"?o:null
}catch(_){return null}})()

/* ── HeroScene — le hero en scène vectorielle (directive user 12/06 : plus de
   photo en hero home, « une expérience bluffante de bout en bout » — les
   photos réelles restent la matière des cards/fiches/SEO). Golden-hour
   Shinkai (gabarit approuvé du jeu) + le récit de marque : les sargasses
   dérivent à l'horizon, repérées depuis l'espace (satellite, faisceau,
   échos). Le scroll fait AVANCER dans la baie : dolly-in par couches
   (ciel < mer < plage) via la var CSS --hs recalculée en rAF. Time-anims
   douces (nuages, glitter, écume, oiseaux) ; reduced-motion = statique.
   Composition calée sur la bande visible du crop mobile (x 262-538). ── */
function HeroScene(){
  const boxRef=useRef(null)
  // Phase locale du visiteur → palette + vie de la scène (landing personnalisée,
  // directive user 12/06 soir). L'heure device ≈ l'heure de la plage (visiteurs
  // locaux/planificateurs). aube 5-8h / jour 8-17h / golden 17-20h / nuit.
  const [ph]=useState(()=>{try{
    if(HERO_PH_OVERRIDE)return HERO_PH_OVERRIDE
    const h=new Date().getHours();return h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"
  }catch(_){return "golden"}})
  const t={
    golden:{sky:["#0B2230","#155A5A","#C97E3A","#F2B05E"],seaT:"#1A5852",seaB:"#08251F",glit:"#FFD884",glitO:1,
      sun:"set",stars:1,cloud:"#10333E",rim:"#FFD884",sand:"#1C1712",trunk:"#120F0A",frond:"#16120C",
      boat:true,swim:false,beam:.3},
    dawn:{sky:["#141B33","#3A4A6B","#B86E7E","#F2A968"],seaT:"#235862",seaB:"#0A2630",glit:"#F2A968",glitO:.85,
      sun:"set",stars:.7,cloud:"#1A2440",rim:"#F2A968",sand:"#1E1812",trunk:"#14100C",frond:"#181410",
      boat:false,swim:false,beam:.34},
    day:{sky:["#1A6FA8","#3E9BC4","#7BC8D8","#AEE0E6"],seaT:"#15706A",seaB:"#0B3A34",glit:"#FDFCF7",glitO:.65,
      sun:"high",stars:0,cloud:"#F4FAFA",rim:"#FFFFFF",sand:"#A8895A",trunk:"#3A2E1A",frond:"#3F6B52",
      boat:true,swim:true,beam:.2},
    night:{sky:["#040B16","#0A1B2E","#10303B","#16424A"],seaT:"#0A2E2E",seaB:"#04140F",glit:"#9ADCD4",glitO:.6,
      sun:"moon",stars:2,cloud:"#0A1622",rim:"#9ADCD4",sand:"#0F0C08",trunk:"#0A0806",frond:"#0C0A06",
      boat:false,swim:false,beam:.5},
  }[ph]
  useEffect(()=>{
    const box=boxRef.current;if(!box)return
    try{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return}catch(_){}
    const scroller=box.closest('[role="dialog"]')
    if(!scroller)return
    let raf=0
    const upd=()=>{
      raf=0
      const vh=window.innerHeight||1
      const p=Math.max(0,Math.min(1,scroller.scrollTop/(vh*.92)))
      box.style.setProperty("--hs",(p*(2-p)).toFixed(4))
    }
    const onScroll=()=>{if(!raf)raf=requestAnimationFrame(upd)}
    scroller.addEventListener("scroll",onScroll,{passive:true})
    upd()
    return()=>{scroller.removeEventListener("scroll",onScroll);if(raf)cancelAnimationFrame(raf)}
  },[])
  return(
    <div ref={boxRef} aria-hidden style={{position:"absolute",inset:0,"--hs":0,background:"#0B2230"}}>
      <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
        style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
        <style>{`
.sgh-cloud1{animation:sghDrift 64s ease-in-out infinite alternate}
.sgh-cloud2{animation:sghDrift 90s ease-in-out infinite alternate-reverse}
@keyframes sghDrift{from{transform:translateX(0)}to{transform:translateX(-70px)}}
.sgh-glit{animation:sghGlit 7s linear infinite}
@keyframes sghGlit{to{stroke-dashoffset:-64}}
.sgh-foam{animation:sghFoam 16s linear infinite}
@keyframes sghFoam{to{stroke-dashoffset:96}}
.sgh-mat{animation:sghMat 14s ease-in-out infinite alternate}
@keyframes sghMat{from{transform:translateX(0)}to{transform:translateX(14px)}}
.sgh-bird{animation:sghBird 56s linear infinite}
@keyframes sghBird{from{transform:translateX(0)}to{transform:translateX(-900px)}}
.sgh-rake{animation:sghRake 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:2px -19px}
.sgh-rake2{animation:sghRake 2.4s ease-in-out infinite .9s;transform-box:fill-box;transform-origin:2px -19px}
@keyframes sghRake{0%,100%{transform:rotate(-8deg)}45%{transform:rotate(13deg)}}
.sgh-breathe{animation:sghBreathe 5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes sghBreathe{0%,100%{transform:scale(1) translateY(0)}50%{transform:scale(1.05) translateY(-1.5px)}}
.sgh-walk{animation:sghWalk 9s linear infinite}
@keyframes sghWalk{0%{transform:translateX(0)}100%{transform:translateX(20px)}}
.sgh-fish{animation:sghFish 4.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes sghFish{0%,68%{opacity:0;transform:translateY(9px) rotate(8deg)}74%{opacity:1;transform:translateY(-6px) rotate(-16deg)}82%{transform:translateY(-17px) rotate(-32deg)}90%{opacity:1;transform:translateY(-3px) rotate(-52deg)}96%{opacity:0;transform:translateY(11px) rotate(-66deg)}100%{opacity:0}}
.sgh-net{animation:sghNet 7s ease-in-out infinite alternate}
@keyframes sghNet{from{transform:translateX(0)}to{transform:translateX(7px)}}
.sgh-shim{animation:sghShim 3.2s ease-in-out infinite}
@keyframes sghShim{0%,100%{opacity:.15}50%{opacity:.95}}
.sgh-star{animation:sghStar 3.6s ease-in-out infinite}
@keyframes sghStar{0%,100%{opacity:.25}50%{opacity:.9}}
.sgh-plane{animation:sghPlane 24s linear infinite}
@keyframes sghPlane{0%{transform:translate(770px,60px)}100%{transform:translate(-140px,188px)}}
.sgh-arrive{animation:sghArrive 16s ease-in-out infinite}
@keyframes sghArrive{0%{transform:translate(40px,-8px);opacity:0}12%{opacity:.6}85%{transform:translate(-28px,54px);opacity:.85}100%{transform:translate(-34px,62px);opacity:0}}
@media (prefers-reduced-motion:reduce){.sgh-cloud1,.sgh-cloud2,.sgh-glit,.sgh-foam,.sgh-mat,.sgh-bird,.sgh-rake,.sgh-rake2,.sgh-breathe,.sgh-walk,.sgh-fish,.sgh-net,.sgh-shim,.sgh-star,.sgh-plane,.sgh-arrive{animation:none}}
        `}</style>
        <defs>
          <linearGradient id="sghSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.sky[0]}/><stop offset=".52" stopColor={t.sky[1]}/>
            <stop offset=".84" stopColor={t.sky[2]}/><stop offset="1" stopColor={t.sky[3]}/>
          </linearGradient>
          <linearGradient id="sghSea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.seaT}/><stop offset="1" stopColor={t.seaB}/>
          </linearGradient>
          <linearGradient id="sghCol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.glit} stopOpacity=".5"/><stop offset="1" stopColor={t.glit} stopOpacity="0"/>
          </linearGradient>
          <g id="sghSarg">
            <ellipse cx="0" cy="0" rx="14" ry="5" fill="#7a5c14"/>
            <ellipse cx="-8" cy="-2" rx="7" ry="3.5" fill="#8a6c1c"/>
            <ellipse cx="8" cy="-2" rx="8" ry="3.5" fill="#5d400e"/>
            <circle cx="-10" cy="-4" r="1.8" fill="#a8862a"/><circle cx="6" cy="-5" r="1.8" fill="#a8862a"/>
          </g>
        </defs>

        {/* ciel + soleil + satellite (couche lente) */}
        <g style={{transform:"translateY(calc(var(--hs)*26px))"}}>
          <rect width="800" height="340" fill="url(#sghSky)"/>
          {t.stars>0&&[[96,46,1.1,.4],[238,84,.8,.28],[388,38,1.2,.4],[542,72,.9,.3],[692,52,1,.35]].map((s,i)=>(
            <circle key={i} className="sgh-star" cx={s[0]} cy={s[1]} r={s[2]} fill="#fff" opacity={Math.min(1,s[3]*t.stars)} style={{animationDelay:`${i*.6}s`}}/>
          ))}
          {t.stars>1.5&&[[150,140,.9,.5],[320,170,.8,.4],[470,150,1,.55],[600,180,.8,.4],[700,120,1.1,.5],[60,200,.8,.35]].map((s,i)=>(
            <circle key={"n"+i} className="sgh-star" cx={s[0]} cy={s[1]} r={s[2]} fill="#fff" opacity={s[3]} style={{animationDelay:`${.3+i*.5}s`}}/>
          ))}
          {/* l'astre de la phase : soleil couché/levant, plein jour, ou lune */}
          {t.sun==="set"&&<>
            <circle cx="400" cy="318" r="150" fill={t.glit} opacity=".07"/>
            <circle cx="400" cy="318" r="88" fill={t.glit} opacity=".12"/>
            <path d="M354 312 a46 46 0 0 1 92 0 Z" fill={t.glit}/>
          </>}
          {t.sun==="high"&&<>
            <circle cx="316" cy="98" r="58" fill="#FDFCF7" opacity=".2"/>
            <circle cx="316" cy="98" r="30" fill="#FFF4D6"/>
          </>}
          {t.sun==="moon"&&<>
            <circle cx="330" cy="92" r="42" fill="#9ADCD4" opacity=".08"/>
            <circle cx="330" cy="92" r="21" fill="#E6F2EF"/>
            <circle cx="323" cy="86" r="4" fill="#C2D8D2" opacity=".7"/>
            <circle cx="336" cy="98" r="3" fill="#C2D8D2" opacity=".6"/>
            <circle cx="338" cy="84" r="2" fill="#C2D8D2" opacity=".5"/>
          </>}
          {/* nuages plats Shinkai (2 tons + liseré or) */}
          <g className="sgh-cloud1">
            <path d="M120 120 q14 -26 48 -26 q18 -18 46 -12 q30 -8 44 12 q26 2 30 26 Z" fill={t.cloud}/>
            <path d="M122 121 h162" stroke={t.rim} strokeWidth="2" opacity=".4"/>
          </g>
          <g className="sgh-cloud2">
            <path d="M520 86 q12 -22 42 -22 q16 -14 40 -9 q26 -7 38 11 q22 2 26 20 Z" fill={t.cloud} opacity=".9"/>
            <path d="M522 87 h140" stroke={t.rim} strokeWidth="1.8" opacity=".35"/>
          </g>
          {/* oiseaux (pas la nuit) */}
          {t.sun!=="moon"&&<g className="sgh-bird" opacity=".5" stroke={ph==="day"?"#1A4A5E":"#0B1B22"} strokeWidth="2.2" fill="none" strokeLinecap="round">
            <path d="M714 142 q5 -6 10 0 q5 -6 10 0"/>
            <path d="M752 128 q4 -5 8 0 q4 -5 8 0"/>
            <path d="M520 116 q4.5 -5.5 9 0 q4.5 -5.5 9 0"/>
            <path d="M566 102 q3.5 -4.5 7 0 q3.5 -4.5 7 0"/>
            <path d="M612 128 q4 -5 8 0 q4 -5 8 0"/>
            <path d="M488 138 q3 -4 6 0 q3 -4 6 0"/>
          </g>}
          {/* un avion en approche d'atterrissage traverse le ciel (jour + golden) */}
          {t.sun!=="moon"&&<g className="sgh-plane">
            <g transform="rotate(13)">
              <line x1="-7" y1="3" x2="-66" y2="2" stroke="#FDFCF7" strokeWidth="1.6" strokeDasharray="2 6" opacity=".35"/>
              <path d="M0 0 L30 0 L41 3 L30 6 L0 6 L-7 3 Z" fill="#EAF0F4"/>
              <path d="M9 1 L1 -9 L6 -9 L17 1 Z" fill="#C4D0D8"/>
              <path d="M9 5 L2 14 L7 14 L17 5 Z" fill="#AEBBC4"/>
              <path d="M-3 0 L-9 -7 L-5 -7 L0 0 Z" fill="#C4D0D8"/>
            </g>
          </g>}
          {/* le satellite veille (continuité ScrollStory) */}
          <g transform="translate(474,78) scale(.62)">
            <rect x="-26" y="-3" width="15" height="7" rx="1.5" fill="#3BA7A0"/>
            <rect x="11" y="-3" width="15" height="7" rx="1.5" fill="#3BA7A0"/>
            <rect x="-10" y="-9" width="20" height="17" rx="2.5" fill="#C9971F"/>
            <rect x="-10" y="-9" width="20" height="6" rx="2.5" fill="#FFC72C"/>
          </g>
          <polygon points="470,90 478,90 452,318 420,318" fill="url(#sghCol)" opacity={t.beam}/>
        </g>

        {/* mer + sargasses à l'horizon (couche moyenne) */}
        <g style={{transformOrigin:"400px 600px",transform:"scale(calc(1 + var(--hs)*.1))"}}>
          <rect x="-40" y="312" width="880" height="170" fill="url(#sghSea)"/>
          {/* colonne de lumière du soleil sur l'eau */}
          <rect x="376" y="312" width="48" height="150" fill="url(#sghCol)" opacity=".4"/>
          {/* glitter */}
          <line className="sgh-glit" x1="-40" y1="334" x2="840" y2="334" stroke={t.glit} strokeWidth="2.2" strokeDasharray="3 13" opacity={.5*t.glitO}/>
          <line className="sgh-glit" x1="-40" y1="362" x2="840" y2="362" stroke={t.glit} strokeWidth="1.8" strokeDasharray="2 17" opacity={.3*t.glitO} style={{animationDelay:"-3s"}}/>
          <line className="sgh-glit" x1="-40" y1="402" x2="840" y2="402" stroke={t.glit} strokeWidth="1.6" strokeDasharray="2 23" opacity={.18*t.glitO} style={{animationDelay:"-5s"}}/>
          {/* les nappes arrivent — celle de droite est repérée (échos teal) */}
          <g className="sgh-mat"><g transform="translate(318,338) scale(.5)" opacity=".85"><use href="#sghSarg"/></g></g>
          <g className="sgh-mat" style={{animationDelay:"-7s"}}><g transform="translate(372,330) scale(.38)" opacity=".7"><use href="#sghSarg"/></g></g>
          <g className="sgh-mat" style={{animationDelay:"-3.5s"}}>
            <g transform="translate(452,334) scale(.55)" opacity=".9"><use href="#sghSarg"/></g>
            <g className="sgst-ring" style={{transformBox:"fill-box",transformOrigin:"center"}}>
              <circle cx="452" cy="334" r="11" fill="none" stroke="#3BA7A0" strokeWidth="1.5"/>
            </g>
            <g className="sgst-ring2" style={{transformBox:"fill-box",transformOrigin:"center"}}>
              <circle cx="452" cy="334" r="11" fill="none" stroke="#3BA7A0" strokeWidth="1.2"/>
            </g>
          </g>
          {/* un banc de sargasse arrive du large — repéré par le satellite (jour + golden) */}
          {t.boat&&<g className="sgh-arrive">
            <g transform="translate(498,328) scale(.62)" opacity=".9"><use href="#sghSarg"/></g>
            <g transform="translate(536,320) scale(.44)" opacity=".7"><use href="#sghSarg"/></g>
            <g className="sgst-ring" style={{transformBox:"fill-box",transformOrigin:"center"}}><circle cx="498" cy="328" r="13" fill="none" stroke="#3BA7A0" strokeWidth="1.4"/></g>
          </g>}
          {/* le bateau de collecte travaille (jour + golden) */}
          {t.boat&&<g className="sgst-bob">
            <g transform="translate(300,354) scale(.8)">
              <path d="M-30 0 L30 0 L21 12 L-23 12 Z" fill="#16282C" stroke="#FFC72C" strokeWidth="1.3"/>
              <line x1="0" y1="0" x2="0" y2="-24" stroke="#E8EDF2" strokeWidth="2"/>
              <polygon points="0,-24 15,-18 0,-13" fill="#FFC72C"/>
            </g>
            <path className="sg-flow" d="M312 350 Q316 344 318 340" stroke="#FFC72C" strokeWidth="1.4" fill="none" opacity=".7"/>
          </g>}
          {/* baigneurs (plein jour) */}
          {t.swim&&<g>
            <circle cx="478" cy="398" r="3.4" fill="#0D2B26"/>
            <path d="M470 402 q8 -6 16 0" stroke="#0D2B26" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
            <circle cx="536" cy="406" r="3" fill="#0D2B26"/>
            <path d="M529 410 q7 -5 14 0" stroke="#0D2B26" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
            <path d="M462 404 h6 M492 405 h5 M524 412 h5 M552 410 h6" stroke="#FDFCF7" strokeWidth="1.6" opacity=".5" strokeLinecap="round"/>
          </g>}
          {/* le bateau pose son filet — maille + bouées dorées qui dérivent (jour + golden) */}
          {t.boat&&<g className="sgh-net">
            <path d="M286 358 Q330 367 372 360 Q410 354 444 363" fill="none" stroke="#CDEBE6" strokeWidth="1" strokeDasharray="1.5 4" opacity=".5"/>
            <circle cx="300" cy="360" r="2.2" fill="#FFC72C" opacity=".85"/><circle cx="344" cy="364" r="2" fill="#FFC72C" opacity=".7"/><circle cx="388" cy="358" r="2" fill="#FFC72C" opacity=".7"/><circle cx="432" cy="362" r="2.2" fill="#FFC72C" opacity=".85"/>
          </g>}
          {/* reflet du soleil renforcé — éclats qui scintillent sous l'astre */}
          <g className="sgh-shim" fill={t.glit}>
            <circle cx="392" cy="348" r="1.7"/><circle cx="410" cy="374" r="1.4"/><circle cx="384" cy="396" r="1.5"/><circle cx="416" cy="410" r="1.3"/>
          </g>
          {/* poissons qui sautent hors de l'eau (jour + golden) */}
          {t.boat&&<>
            <g transform="translate(414,340)"><g className="sgh-fish"><path d="M-8 0 Q0 -5 8 0 Q0 5 -8 0 Z" fill="#6FD8CC"/><path d="M8 0 l5 -4 0 8 Z" fill="#3BA7A0"/><circle cx="3" cy="-1.4" r=".9" fill="#0A1714"/></g></g>
            <g transform="translate(356,350) scale(.82)"><g className="sgh-fish" style={{animationDelay:"-2.4s"}}><path d="M-8 0 Q0 -5 8 0 Q0 5 -8 0 Z" fill="#8AE4D8"/><path d="M8 0 l5 -4 0 8 Z" fill="#3BA7A0"/></g></g>
          </>}
        </g>

        {/* plage + palmier + écume (couche avant, la plus rapide) */}
        <g style={{transformOrigin:"400px 640px",transform:"scale(calc(1 + var(--hs)*.22)) translateY(calc(var(--hs)*10px))"}}>
          <path d="M-40 470 Q200 432 430 446 Q640 458 840 500 L840 620 L-40 620 Z" fill={t.sand}/>
          <path d="M-40 470 Q200 432 430 446 Q640 458 840 500" fill="none" stroke={t.rim} strokeWidth="2.4" opacity=".3"/>
          <path className="sgh-foam" d="M-40 478 Q200 440 430 454 Q640 466 840 508" fill="none" stroke="#FDFCF7" strokeWidth="2.6" strokeDasharray="12 16" opacity=".4"/>
          {/* palmier silhouette (droite, penché dans la baie) */}
          <path d="M586 612 Q570 520 538 470 Q524 448 502 436" stroke={t.trunk} strokeWidth="13" fill="none" strokeLinecap="round"/>
          {/* parasol + serviette (plein jour : la plage vit) */}
          {t.swim&&<g>
            <line x1="300" y1="466" x2="306" y2="508" stroke="#7A4A1E" strokeWidth="3.5"/>
            <path d="M268 472 A36 36 0 0 1 334 464 Z" fill="#E8522A"/>
            <path d="M268 472 L334 464" stroke="#B83A1A" strokeWidth="2"/>
            <rect x="320" y="504" width="26" height="8" rx="3" transform="rotate(-6 320 504)" fill="#3BA7A0" opacity=".85"/>
          </g>}
          <g fill="none" stroke={t.frond} strokeWidth="9" strokeLinecap="round">
            <path d="M502 436 Q466 416 428 422"/><path d="M502 436 Q472 400 440 392"/>
            <path d="M502 436 Q506 396 522 372"/><path d="M502 436 Q538 404 576 402"/>
            <path d="M502 436 Q540 432 570 448"/>
          </g>
          {/* échouage du jour : une nappe sur le sable (honnêteté du produit) */}
          <g transform="translate(252,486) scale(.62)" opacity=".55"><use href="#sghSarg"/></g>
          {/* le ramasseur nettoie le sable — il râtelle la nappe échouée (jour + golden) */}
          {t.boat&&<g transform="translate(360,484)">
            <g transform="translate(-21,11) scale(.46)" opacity=".68"><use href="#sghSarg"/></g>
            <g fill="#0E1F1A"><circle cx="0" cy="-27" r="5"/><path d="M-5 -22 q5 -4 10 0 l-1.5 19 h-7 Z"/><path d="M-4 -4 l-3 12 M4 -4 l3 12" stroke="#0E1F1A" strokeWidth="2.4" strokeLinecap="round" fill="none"/></g>
            <g className="sgh-rake" stroke="#3A2A14" strokeWidth="2.2" fill="none" strokeLinecap="round">
              <line x1="2" y1="-19" x2="20" y2="8"/>
              <path d="M13 6 h13 M15 3 v7 M19 2 v8.5 M23 2 v8"/>
            </g>
          </g>}
        </g>
      </svg>
    </div>
  )
}

/* ── ScrollStory — la méthode en scrollytelling (directive user 12/06 :
   « interface entièrement construite, branding focus, bluffant au scroll »,
   référence Zenly). Une seule scène vectorielle épinglée (sticky) pendant
   ~430vh ; le scroll pilote la timeline via des variables CSS (--b1..--b5 +
   fenêtres d'opacité --bNo) recalculées en rAF — transforms/opacity
   uniquement, zéro layout write, scroll natif (jamais de scroll-jacking).
   5 temps : l'orbite → le scan (médaillon preuve : footage NASA réel) → la
   dérive J+1→J+3 → le verdict 06:00 → le choix (CTA carte). Reduced-motion :
   pas de pin, pas de listener, frame finale statique. ── */
function ScrollStory({lang,onShowMap}){
  const boxRef=useRef(null)
  const vidRef=useRef(null)
  const vid2Ref=useRef(null)
  const srcSetRef=useRef(false)
  const srcSet2Ref=useRef(false)
  const beatRef=useRef(-1)
  const [vidSrc,setVidSrc]=useState(null)
  const [vidSrc2,setVidSrc2]=useState(null)
  const [beat,setBeat]=useState(0)
  const [rm]=useState(()=>{try{return window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){return false}})
  const allowVid=(()=>{try{
    if(rm)return false
    const c=navigator.connection
    if(c&&(c.saveData||/(^|-)2g/.test(c.effectiveType||"")))return false
    return true
  }catch(_){return true}})()
  useEffect(()=>{
    const box=boxRef.current;if(!box)return
    const st=box.style
    const SEG=(p,a,b)=>Math.max(0,Math.min(1,(p-a)/(b-a)))
    const WIN=(p,ia,ib,oa,ob)=>Math.min(SEG(p,ia,ib),1-SEG(p,oa,ob))
    const BACK=t=>{const c1=1.70158,c3=c1+1,u=t-1;return 1+c3*u*u*u+c1*u*u}
    if(rm){
      ;["--b1","--b2","--b3","--b4","--b5","--b5o"].forEach(v=>st.setProperty(v,"1"))
      ;["--b1o","--b2o","--b3o","--b4o"].forEach(v=>st.setProperty(v,"0"))
      st.setProperty("--b4s","1");setBeat(4)
      return
    }
    const scroller=box.closest('[role="dialog"]')
    let raf=0
    const upd=()=>{
      raf=0
      const r=box.getBoundingClientRect()
      const vh=window.innerHeight||1
      const total=Math.max(1,r.height-vh)
      const p=Math.max(0,Math.min(1,-r.top/total))
      st.setProperty("--b1",SEG(p,0,.20).toFixed(4))
      st.setProperty("--b2",SEG(p,.18,.42).toFixed(4))
      st.setProperty("--b3",SEG(p,.42,.66).toFixed(4))
      st.setProperty("--b4",SEG(p,.64,.84).toFixed(4))
      st.setProperty("--b5",SEG(p,.82,1).toFixed(4))
      // beat 1 reste plein pendant l'ENTREE de la section (p clampe a 0 tant que
      // la sticky n'est pas epinglee) — sinon le storyvp affiche son fond #0A1714
      // SANS contenu = "fond vert avec rien" signale par le user. b1o=1 a p=0.
      st.setProperty("--b1o",(1-SEG(p,.17,.23)).toFixed(3))
      st.setProperty("--b2o",WIN(p,.17,.23,.39,.45).toFixed(3))
      st.setProperty("--b3o",WIN(p,.39,.45,.62,.68).toFixed(3))
      st.setProperty("--b4o",WIN(p,.62,.68,.80,.86).toFixed(3))
      st.setProperty("--b5o",SEG(p,.80,.88).toFixed(3))
      st.setProperty("--b4s",(.4+.6*BACK(SEG(p,.68,.78))).toFixed(4))
      const b=p<.18?0:p<.42?1:p<.64?2:p<.82?3:4
      // tout (tracking, chargement médaillons, lecture) est conditionné à la
      // visibilité réelle de la section — sinon le mount du landing chargeait
      // les clips et trackait beat 1 pour tout le monde
      const vis=r.top<vh&&r.bottom>0
      if(vis&&b!==beatRef.current){
        beatRef.current=b;setBeat(b)
        track("sg_story_beat",{b:b+1})
        if(b===0&&allowVid&&!srcSet2Ref.current){srcSet2Ref.current=true;setVidSrc2("/videos/sentinel6-orbit.mp4")}
        if(b===1&&allowVid&&!srcSetRef.current){srcSetRef.current=true;setVidSrc("/videos/sentinel6.mp4")}
      }
      const v=vidRef.current
      if(v){if(vis&&b===1){if(v.paused)v.play().catch(()=>{})}else if(!v.paused)v.pause()}
      const v2=vid2Ref.current
      if(v2){if(vis&&b===0){if(v2.paused)v2.play().catch(()=>{})}else if(!v2.paused)v2.pause()}
    }
    const onScroll=()=>{if(!raf)raf=requestAnimationFrame(upd)}
    const tgt=scroller||window
    tgt.addEventListener("scroll",onScroll,{passive:true})
    window.addEventListener("resize",onScroll)
    upd()
    return()=>{tgt.removeEventListener("scroll",onScroll);window.removeEventListener("resize",onScroll);if(raf)cancelAnimationFrame(raf)}
  },[])
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const beats=[
    {o:"--b1o",k:T("L'ORBITE","THE ORBIT","LA ÓRBITA"),h:T("Un satellite veille sur vos plages","A satellite watches over your beaches","Un satélite vigila tus playas")},
    {o:"--b2o",k:T("LE SCAN","THE SCAN","EL ESCANEO"),h:T("Il mesure l'océan, pixel par pixel","It measures the ocean, pixel by pixel","Mide el océano, píxel a píxel")},
    {o:"--b3o",k:T("LA DÉRIVE","THE DRIFT","LA DERIVA"),h:T("Chaque banc est suivi, 7 jours devant","Every raft is tracked, 7 days ahead","Cada banco se sigue, 7 días por delante")},
    {o:"--b4o",k:T("LE VERDICT","THE VERDICT","EL VEREDICTO"),h:T("Le verdict tombe avant 6h du matin","The verdict lands before 6 am","El veredicto llega antes de las 6")},
    {o:"--b5o",k:T("VOTRE JOURNÉE","YOUR DAY","TU DÍA"),h:T("Vous choisissez la bonne plage","You pick the right beach","Eliges la playa correcta")},
  ]
  const fb={transformBox:"fill-box",transformOrigin:"center"}
  const mono="ui-monospace,SFMono-Regular,monospace"
  return(
    <section ref={boxRef} aria-label={T("La méthode","The method","El método")} style={{position:"relative",
      height:rm?"auto":"430vh",
      "--b1":0,"--b2":0,"--b3":0,"--b4":0,"--b5":0,"--b1o":0,"--b2o":0,"--b3o":0,"--b4o":0,"--b5o":0,"--b4s":.4}}>
      <div className="sg-storyvp" style={{position:rm?"relative":"sticky",top:0,overflow:"hidden",background:"#0A1714",
        height:rm?"min(72vh,560px)":undefined}}>
        <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
          <defs>
            <g id="sgstSarg">
              <ellipse cx="0" cy="0" rx="16" ry="6" fill="#8a6a1a"/>
              <ellipse cx="-9" cy="-3" rx="8" ry="4" fill="#9a7a22"/>
              <ellipse cx="9" cy="-2" rx="9" ry="4" fill="#6b4a12"/>
              <circle cx="-12" cy="-6" r="2.2" fill="#b8962e"/><circle cx="-2" cy="-7" r="2" fill="#b8962e"/><circle cx="8" cy="-6" r="2.2" fill="#b8962e"/>
            </g>
            <linearGradient id="sgstBeam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFC72C" stopOpacity=".5"/><stop offset="1" stopColor="#FFC72C" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="sgstDawn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0A1714"/><stop offset="1" stopColor="#143029"/>
            </linearGradient>
          </defs>

          {/* ════ B1 — L'ORBITE : espace, limbe terrestre, le satellite passe ════ */}
          <g style={{opacity:"var(--b1o)"}}>
            <rect width="800" height="600" fill="#04090B"/>
            {[[64,48,1.3,.5],[178,108,.9,.32],[300,52,1.1,.45],[430,128,.8,.3],[558,66,1.4,.5],[688,118,.9,.35],[748,40,1.1,.4],[118,210,.8,.25],[372,224,1,.3],[642,232,.8,.28],[230,160,.7,.22],[506,180,.9,.3]].map((s,i)=>(
              <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} fill="#fff" opacity={s[3]}/>
            ))}
            <circle cx="400" cy="1460" r="1010" fill="#07211D"/>
            <circle cx="400" cy="1460" r="1010" fill="none" stroke="#3BA7A0" strokeWidth="2.5" opacity=".5"/>
            <circle cx="400" cy="1460" r="1022" fill="none" stroke="#3BA7A0" strokeWidth="9" opacity=".1"/>
            {/* trace orbitale */}
            <path d="M40 232 Q400 168 760 232" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.4" strokeDasharray="2 7"/>
            {/* le satellite (gabarit Sentinel-6 : corps or, ailes teal) */}
            <g style={{transform:"translate(calc(610px - var(--b1)*330px),calc(160px + var(--b1)*36px))"}}>
              <polygon className="sgst-beamP" points="-7,12 7,12 34,300 -34,300" fill="url(#sgstBeam)" opacity=".55"/>
              <g className="sgst-ring" style={fb}><circle r="30" fill="none" stroke="#3BA7A0" strokeWidth="1.6"/></g>
              <g className="sgst-ring2" style={fb}><circle r="30" fill="none" stroke="#3BA7A0" strokeWidth="1.3"/></g>
              <rect x="-30" y="-4" width="18" height="9" rx="1.5" fill="#3BA7A0"/>
              <rect x="12" y="-4" width="18" height="9" rx="1.5" fill="#3BA7A0"/>
              <rect x="-13" y="-11" width="26" height="22" rx="3" fill="#C9971F"/>
              <rect x="-13" y="-11" width="26" height="7" rx="3" fill="#FFC72C"/>
              <circle cx="0" cy="16" r="3.2" fill="#E8EDF2"/>
            </g>
          </g>

          {/* ════ B2 — LE SCAN : l'océan vu d'en haut, le faisceau balaie, détection ════ */}
          <g style={{opacity:"var(--b2o)"}}>
            <rect width="800" height="600" fill="#06211E"/>
            {/* trame raster satellite */}
            {[80,160,240,320,400,480,520].map((y,i)=>(
              <line key={"h"+i} x1="0" y1={y+40} x2="800" y2={y+40} stroke="#3BA7A0" strokeWidth=".6" opacity=".07"/>
            ))}
            {[100,240,380,520,660].map((x,i)=>(
              <line key={"v"+i} x1={x} y1="0" x2={x} y2="600" stroke="#3BA7A0" strokeWidth=".6" opacity=".07"/>
            ))}
            {/* houle (3 rangées, parallaxe au scroll) */}
            <g style={{transform:"translateX(calc(var(--b2)*-46px))"}} opacity=".3">
              {[120,300,470].map((y,i)=>(
                <path key={i} d={`M-60 ${y} q40 -10 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0`} fill="none" stroke="#3BA7A0" strokeWidth="1.6"/>
              ))}
            </g>
            <g style={{transform:"translateX(calc(var(--b2)*34px))"}} opacity=".18">
              {[200,390,545].map((y,i)=>(
                <path key={i} d={`M-80 ${y} q40 -9 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0`} fill="none" stroke="#5FD3C9" strokeWidth="1.3"/>
              ))}
            </g>
            {/* radeaux dans le champ */}
            <g transform="translate(208,196) scale(.8)" opacity=".75"><use href="#sgstSarg"/></g>
            <g transform="translate(610,420) scale(.7)" opacity=".7"><use href="#sgstSarg"/></g>
            {/* le faisceau de scan balaie l'écran */}
            <g style={{transform:"translateX(calc(var(--b2)*470px - 60px))"}}>
              <rect x="0" y="0" width="120" height="600" fill="#FFC72C" opacity=".07"/>
              <line x1="60" y1="0" x2="60" y2="600" stroke="#FFC72C" strokeWidth="1.6" opacity=".55" strokeDasharray="6 8"/>
            </g>
            {/* la détection : radeau cible + échos + mesure */}
            <g transform="translate(430,330)"><use href="#sgstSarg"/></g>
            <g style={{opacity:"calc(var(--b2)*4 - 2.2)"}}>
              <g className="sgst-ring" style={fb}><circle cx="430" cy="330" r="13" fill="none" stroke="#3BA7A0" strokeWidth="1.8"/></g>
              <g className="sgst-ring2" style={fb}><circle cx="430" cy="330" r="13" fill="none" stroke="#3BA7A0" strokeWidth="1.4"/></g>
              <line x1="430" y1="296" x2="430" y2="318" stroke="#3BA7A0" strokeWidth="1.4" strokeDasharray="3 4"/>
              <rect x="398" y="270" width="64" height="20" rx="10" fill="rgba(10,23,20,.9)" stroke="#3BA7A0" strokeWidth="1.1"/>
              <text x="430" y="284" textAnchor="middle" fontFamily={mono} fontSize="10.5" fontWeight="700" fill="#5FD3C9">AFAI 0.42</text>
            </g>
          </g>

          {/* ════ B3 — LA DÉRIVE : coupe mer→plage, le banc avance sur la prévision ════ */}
          <g style={{opacity:"var(--b3o)"}}>
            <rect width="800" height="600" fill="url(#sgstDawn)"/>
            {/* ── ciel vivant : lueur d'aube, nuages dérivants, oiseaux ── */}
            <circle cx="140" cy="128" r="160" fill="#FFC72C" opacity=".05"/>
            <circle cx="140" cy="128" r="76" fill="#FFC72C" opacity=".06"/>
            <g style={{transform:"translateX(calc(var(--b3)*-28px))"}} opacity=".5">
              <path d="M178 96 q12 -22 42 -22 q16 -14 40 -9 q26 -7 38 11 q22 2 26 20 Z" fill="#16322B"/>
              <path d="M180 97 h138" stroke="#3BA7A0" strokeWidth="1.6" opacity=".3"/>
            </g>
            <g style={{transform:"translateX(calc(var(--b3)*-50px))"}} opacity=".4">
              <path d="M486 66 q10 -18 34 -18 q14 -11 32 -7 q21 -6 30 9 q18 2 21 16 Z" fill="#16322B"/>
            </g>
            <g opacity=".4" stroke="#5FD3C9" strokeWidth="1.8" fill="none" strokeLinecap="round">
              <path d="M250 168 q6 -7 12 0 q6 -7 12 0"/><path d="M298 156 q5 -6 10 0 q5 -6 10 0"/>
            </g>
            {/* le satellite plane au-dessus du banc et le garde dans son faisceau (continuité B1/B2) */}
            <g style={{transform:"translate(calc(96px + var(--b3)*424px),88px)"}}>
              <polygon points="-7,12 7,12 26,232 -26,232" fill="url(#sgstBeam)" opacity=".4"/>
              <g className="sgst-ring" style={fb}><circle r="20" fill="none" stroke="#3BA7A0" strokeWidth="1.4"/></g>
              <rect x="-22" y="-3" width="13" height="7" rx="1.5" fill="#3BA7A0"/>
              <rect x="9" y="-3" width="13" height="7" rx="1.5" fill="#3BA7A0"/>
              <rect x="-10" y="-8" width="20" height="16" rx="2.5" fill="#C9971F"/>
              <rect x="-10" y="-8" width="20" height="5" rx="2.5" fill="#FFC72C"/>
            </g>
            {/* mer en coupe */}
            <rect x="0" y="330" width="800" height="270" fill="#0E2E2A"/>
            <path d="M0 330 q50 -8 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" fill="none" stroke="#3BA7A0" strokeWidth="2" opacity=".5"/>
            {/* courant marin : la dérive (flèches → vers la côte, le « comment ça arrive ») */}
            <g opacity=".28" stroke="#5FD3C9" strokeWidth="1.6" fill="none" strokeLinecap="round">
              <path d="M60 384 h58 M110 378 l10 6 -10 6"/>
              <path d="M36 426 h66 M94 420 l10 6 -10 6"/>
              <path d="M168 406 h52 M212 400 l10 6 -10 6"/>
            </g>
            {/* d'autres bancs au large, suivis aussi (parallaxe + bob) */}
            <g style={{transform:"translateX(calc(var(--b3)*-58px))"}} opacity=".55">
              <g className="sgst-bob"><g transform="translate(286,356) scale(.6)"><use href="#sgstSarg"/></g></g>
            </g>
            <g style={{transform:"translateX(calc(var(--b3)*-88px))"}} opacity=".4">
              <g className="sgst-bob"><g transform="translate(636,378) scale(.5)"><use href="#sgstSarg"/></g></g>
            </g>
            {/* la plage à droite (bord visible dès le crop mobile : x≥500) */}
            <path d="M500 600 L572 388 Q610 358 800 346 L800 600 Z" fill="#1A2A23"/>
            <path d="M560 402 Q620 370 790 358" stroke="#FFC72C" strokeWidth="1.4" fill="none" opacity=".5"/>
            {/* palmier */}
            <path d="M716 366 Q710 330 718 306" stroke="#2E4A3C" strokeWidth="5" fill="none" strokeLinecap="round"/>
            <g fill="none" stroke="#3F6B52" strokeWidth="4" strokeLinecap="round">
              <path d="M718 306 Q736 294 754 298"/><path d="M718 306 Q700 292 682 298"/>
              <path d="M718 306 Q732 286 746 280"/><path d="M718 306 Q702 284 692 278"/>
            </g>
            {/* trajectoire prévue : pointillés + jalons J+1/J+2/J+3 */}
            <path d="M90 318 C250 300 400 302 540 322" fill="none" stroke="rgba(255,199,44,.4)" strokeWidth="1.6" strokeDasharray="3 8"/>
            {[[250,306,"J+1",.18],[390,302,"J+2",.48],[510,316,"J+3",.78]].map((t,i)=>(
              <g key={i} style={{opacity:`calc((var(--b3) - ${t[3]})*5)`}}>
                <line x1={t[0]} y1={t[1]-12} x2={t[0]} y2={t[1]+10} stroke="#FFC72C" strokeWidth="1.6"/>
                <text x={t[0]} y={t[1]-20} textAnchor="middle" fontFamily={mono} fontSize="12" fontWeight="700" fill="#FFC72C">
                  {lang==="es"?"D+"+(i+1):lang==="en"?"D+"+(i+1):t[2]}</text>
              </g>
            ))}
            {/* le banc suivi (bob temporel + avancée au scroll) */}
            <g style={{transform:"translateX(calc(var(--b3)*424px))"}}>
              <g className="sgst-bob">
                <g transform="translate(96,318)"><use href="#sgstSarg"/></g>
                <g className="sgst-ring" style={fb}><circle cx="96" cy="318" r="14" fill="none" stroke="#3BA7A0" strokeWidth="1.4"/></g>
              </g>
            </g>
            {/* vent/courant */}
            <g opacity=".35" stroke="#5FD3C9" strokeWidth="2" fill="none" strokeLinecap="round">
              <path d="M70 130 q26 -10 52 0 M96 142 q22 -8 44 0"/>
              <path d="M180 100 q24 -9 48 0"/>
            </g>
          </g>

          {/* ════ B4 — LE VERDICT : 06:00, l'alerte tombe, la pastille claque ════ */}
          <g style={{opacity:"var(--b4o)"}}>
            <rect width="800" height="600" fill="#0A1714"/>
            <circle cx="120" cy="118" r="26" fill="#FFC72C" opacity=".9"/>
            <circle cx="120" cy="118" r="44" fill="#FFC72C" opacity=".1"/>
            <text x="166" y="126" fontFamily={mono} fontSize="22" fontWeight="700" fill="rgba(255,255,255,.8)">06:00</text>
            {/* le fil de la donnée descend dans le téléphone */}
            <line className="sg-flow" x1="400" y1="0" x2="400" y2="170" stroke="#FFC72C" strokeWidth="2"/>
            {/* téléphone */}
            <g transform="translate(310,176)">
              <rect width="180" height="250" rx="22" fill="#10231E" stroke="rgba(255,255,255,.18)" strokeWidth="1.4"/>
              <rect x="64" y="12" width="52" height="7" rx="3.5" fill="rgba(255,255,255,.18)"/>
              <g style={{opacity:"calc(var(--b4)*2.4 - .3)",transform:"translateY(calc((1 - var(--b4))*-26px))"}}>
                <rect x="14" y="36" width="152" height="64" rx="13" fill="#1A2F29" stroke="rgba(255,199,44,.5)" strokeWidth="1.2"/>
                <path d="M30 64 v-7a8 8 0 0 1 16 0v7l2.5 3.5H27.5z M35 71a3.4 3.4 0 0 0 6 0" fill="none" stroke="#FFC72C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="58" y="48" width="92" height="7" rx="3.5" fill="rgba(255,255,255,.6)"/>
                <rect x="58" y="62" width="64" height="7" rx="3.5" fill="rgba(255,255,255,.3)"/>
                <rect x="30" y="80" width="78" height="9" rx="4.5" fill="#FFC72C"/>
              </g>
              <rect x="14" y="116" width="152" height="46" rx="13" fill="rgba(255,255,255,.05)"/>
              <rect x="14" y="170" width="152" height="46" rx="13" fill="rgba(255,255,255,.05)"/>
            </g>
            {/* la pastille verdict claque sur le brief (overshoot --b4s ; x≤530 : safe mobile) */}
            <g style={{transform:"translate(466px,420px) scale(var(--b4s))"}}>
              <circle r="46" fill="none" stroke="#FFC72C" strokeWidth="1.4" opacity=".35"/>
              <rect x="-66" y="-21" width="132" height="42" rx="21" fill="#FFC72C"/>
              <text x="8" y="7" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="19" fill="#0A1714" letterSpacing=".02">
                {T("PROPRE","CLEAN","LIMPIA")}</text>
              <path d="M-48 0 l8 8 14 -16" stroke="#0A1714" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
          </g>

          {/* ════ B5 — LE CHOIX : la carte, l'itinéraire bascule vers la plage propre ════ */}
          <g style={{opacity:"var(--b5o)"}}>
            <rect width="800" height="600" fill="#0A1714"/>
            {/* côtes stylisées */}
            <path d="M-40 470 Q120 420 240 452 T520 470 T820 440" fill="none" stroke="#3BA7A0" strokeWidth="2" opacity=".22"/>
            <path d="M-40 520 Q200 480 430 510 T820 500" fill="none" stroke="#3BA7A0" strokeWidth="1.4" opacity=".14"/>
            {[[110,150],[688,128],[206,84],[560,70]].map((s,i)=>(
              <circle key={i} cx={s[0]} cy={s[1]} r="1" fill="#fff" opacity=".25"/>
            ))}
            {/* plage ⚠ (banc arrivé) — x≥280 : safe crop mobile */}
            <g transform="translate(292,368)">
              <g transform="translate(0,16) scale(.8)"><use href="#sgstSarg"/></g>
              <circle r="13" fill="#E8522A"/>
              <text y="5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="inherit">!</text>
            </g>
            {/* plage ✓ (la bonne) — x≤530 : safe crop mobile */}
            <g transform="translate(508,272)">
              <path d="M0 -34 a22 22 0 1 1 .01 0 M0 -12 L0 6" stroke="#FFC72C" strokeWidth="3" fill="none"/>
              <circle cy="-23" r="8" fill="#FFC72C"/>
              <g className="sgst-ring" style={{...fb,opacity:"calc(var(--b5)*5 - 3.6)"}}>
                <circle cy="-23" r="22" fill="none" stroke="#FFC72C" strokeWidth="1.8"/>
              </g>
            </g>
            {/* l'itinéraire (point qui voyage au scroll) */}
            <path d="M310 354 Q400 222 498 260" fill="none" stroke="rgba(255,199,44,.5)" strokeWidth="2.2" strokeDasharray="5 8"/>
            <circle r="7" fill="#FFC72C" style={{offsetPath:"path('M310 354 Q400 222 498 260')",offsetDistance:"calc(var(--b5)*100%)"}}/>
          </g>
        </svg>

        {/* médaillon orbite (B1) : la glisse réelle dans l'espace — NASA */}
        <div aria-hidden style={{position:"absolute",top:"max(60px,8%)",left:"5%",width:"min(36vw,300px)",
          borderRadius:18,overflow:"hidden",border:"1px solid rgba(255,255,255,.16)",
          boxShadow:"0 18px 50px rgba(0,0,0,.5)",opacity:"var(--b1o)",
          transform:"translateY(calc((1 - var(--b1))*40px))",pointerEvents:"none"}}>
          <div style={{position:"relative",aspectRatio:"16/9",background:"#04090B"}}>
            <img src="/videos/sentinel6-orbit-poster.jpg" alt="" loading="lazy"
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
            {vidSrc2&&<video ref={vid2Ref} src={vidSrc2} autoPlay muted loop playsInline preload="auto" aria-hidden
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}
            <span style={{position:"absolute",top:8,left:10,display:"inline-flex",alignItems:"center",gap:5,
              fontSize:8.5,fontWeight:700,letterSpacing:".09em",color:"#fff",background:"rgba(10,23,20,.55)",
              border:"1px solid rgba(255,255,255,.18)",padding:"3px 8px",borderRadius:999}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#FFC72C",boxShadow:"0 0 6px #FFC72C"}}/>
              {T("EN ORBITE — NASA/JPL","IN ORBIT — NASA/JPL","EN ÓRBITA — NASA/JPL")}
            </span>
          </div>
        </div>

        {/* médaillon preuve (B2) : le vrai Sentinel-6, footage NASA */}
        <div aria-hidden style={{position:"absolute",top:"max(60px,8%)",right:"5%",width:"min(36vw,300px)",
          borderRadius:18,overflow:"hidden",border:"1px solid rgba(255,255,255,.16)",
          boxShadow:"0 18px 50px rgba(0,0,0,.5)",opacity:"var(--b2o)",
          transform:"translateY(calc((1 - var(--b2))*54px))",pointerEvents:"none"}}>
          <div style={{position:"relative",aspectRatio:"16/9",background:"#04090B"}}>
            <img src="/videos/sentinel6-poster.jpg" alt="" loading="lazy"
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
            {vidSrc&&<video ref={vidRef} src={vidSrc} autoPlay muted loop playsInline preload="auto" aria-hidden
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}
            <span style={{position:"absolute",top:8,left:10,display:"inline-flex",alignItems:"center",gap:5,
              fontSize:8.5,fontWeight:700,letterSpacing:".09em",color:"#fff",background:"rgba(10,23,20,.55)",
              border:"1px solid rgba(255,255,255,.18)",padding:"3px 8px",borderRadius:999}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#3BA7A0",boxShadow:"0 0 6px #3BA7A0"}}/>
              {T("LE VRAI — NASA/JPL","THE REAL ONE — NASA/JPL","EL REAL — NASA/JPL")}
            </span>
          </div>
        </div>

        {/* le récit, temps par temps */}
        {beats.map((b,i)=>(
          <div key={i} aria-hidden={!rm&&beat!==i} style={{position:"absolute",left:"6%",right:"6%",
            bottom:"max(112px,15%)",opacity:`var(${b.o})`,pointerEvents:"none"}}>
            <div style={{fontFamily:mono,fontSize:11,fontWeight:700,letterSpacing:".24em",color:"#3BA7A0",marginBottom:9}}>{b.k}</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,5.6vw,52px)",lineHeight:1.02,
              letterSpacing:".01em",textTransform:"uppercase",color:"#fff",maxWidth:560,
              textShadow:"0 2px 26px rgba(0,0,0,.45)"}}>{b.h}</div>
          </div>
        ))}

        {/* CTA du dernier temps */}
        <div style={{position:"absolute",left:"6%",bottom:"max(38px,5.5%)",opacity:"var(--b5o)",
          pointerEvents:beat===4?"auto":"none"}}>
          <button onClick={onShowMap} className="gbtn" style={{background:"#FFC72C",color:"#0A1714",border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,padding:"14px 22px",borderRadius:999,
            boxShadow:"0 8px 28px rgba(255,199,44,.3)"}}>
            <BrandIcon name="map" size={15} accent="#0A1714" style={{verticalAlign:"-2px",marginRight:7,display:"inline-block"}}/>
            {T("Ouvrir la carte live","Open the live map","Abrir el mapa en vivo")}
          </button>
        </div>

        {/* progression discrète (droite) */}
        {!rm&&<div aria-hidden style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
          display:"flex",flexDirection:"column",gap:7}}>
          {beats.map((_,i)=>(
            <span key={i} style={{width:5,height:beat===i?22:5,borderRadius:99,transition:"all .35s ease",
              background:beat===i?"#FFC72C":"rgba(255,255,255,.22)"}}/>
          ))}
        </div>}
      </div>
    </section>
  )
}

/* ── GameFunnel — la « page de départ » jeu-funnel (directive user 13/06 :
   « UX SVG 3D immersive de bout en bout, impliquer l'user comme un JV avec
   des choix graphiques », réf Zenly pré-2022 candy/vivant). Couche ADDITIVE
   posée DEVANT la machinerie existante (HeroScene / paywall / trial / A-B) :
   bras A/B `landing_funnel=game` mesuré contre HeroVerdict (control), zéro
   refonte de la conversion. Tranche verticale shippée : Beat 0 (monde
   golden-hour + jeton-preuve donnée réelle <5s + question + chips d'envie) →
   choix tactile (squish ressort) → DOLLY-IN (le monde grossit, on entre dans
   la baie) → Beat 1 (la sélection RÉELLE classée pour l'envie, pins qui
   s'allument en cascade) → tap = fiche réelle (AHA + déclencheurs premium
   existants). Tout est skippable (« montre-moi la carte »). transforms/opacity
   only, 2 ressorts CSS nommés, reduced-motion = panneaux en fondu, complétable. ── */
function GameFunnel({beach,lang,island,sargData,userPos,pickBeaches,onOpenBeach,onShowMap,onFav,onPremium,exiting}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const [stage,setStage]=useState("vibe") // vibe → coast (sélection) → scan (LE SCAN, beat 2)
  const [vibe,setVibe]=useState(null)
  const [chosenBeach,setChosenBeach]=useState(null)
  const [rm]=useState(()=>{try{return window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){return false}})
  useEffect(()=>{track("sg_hero_shown",{beach_id:beach.id,status:beach.status,geoloc:!!userPos,funnel:"game"})},[])
  // Jeton-preuve : la plus PROPRE maintenant (donnée réelle, score qui monte 0→N)
  const proof=(pickBeaches&&pickBeaches[0])||beach
  const [cnt,setCnt]=useState(()=>rm?(proof?.score??0):0)
  useEffect(()=>{
    if(rm)return
    const target=proof?.score??0
    let raf=0,start=0
    const step=ts=>{if(!start)start=ts;const k=Math.min(1,(ts-start)/900);setCnt(Math.round(target*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(step)}
    raf=requestAnimationFrame(step)
    return()=>cancelAnimationFrame(raf)
  },[proof&&proof.id])
  // Beat 2 LE SCAN : animations CSS pures (keyframes) déclenchées au montage de
  // la scène — JAMAIS de rAF/var pilotée (un rAF throttlé rendrait la scène
  // invisible). reduced-motion = état final statique (cf. <style>).
  const upd=(()=>{try{
    const ts=sargData?.updatedAt||sargData?.erddapTimestamp
    return ts?new Date(ts).toLocaleTimeString(lang==="fr"?"fr-FR":lang==="es"?"es-MX":"en-US",{hour:"2-digit",minute:"2-digit"}):""
  }catch(_){return""}})()
  const dateLong=new Date().toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long",day:"numeric",month:"long"})
  const wordmark=IS_NEW_REGION
    ?((lang==="es"?"SARGAZO ":"SARGASSUM ")+String(REGION.name||"").toUpperCase())
    :(island==="gp"?"SARGASSES GUADELOUPE":"SARGASSES MARTINIQUE")
  const VIBES=[
    {k:"swim",label:T("Nager","Swim","Nadar"),g:["#2BB7C4","#0E6E78"]},
    {k:"photo",label:T("Photos & Reels","Photos & Reels","Fotos & Reels"),g:["#F2B860","#C97E3A"]},
    {k:"meet",label:T("Rencontrer","Meet up","Conocer"),g:["#F2A968","#D9646E"]},
    {k:"family",label:T("Famille","Family","Familia"),g:["#7FC3A6","#2E8B6B"]},
    {k:"escape",label:T("S'évader","Escape","Evadir"),g:["#9B8BE0","#5B4B9E"]},
  ]
  const vibeLabel=(VIBES.find(v=>v.k===vibe)||{}).label||""
  const statusCol=b=>b.status==="clean"?"#FFC72C":b.status==="moderate"?"#F59E0B":"#E8522A"
  const statusShort=b=>b.status==="clean"?T("Propre","Clean","Limpia"):b.status==="moderate"?T("Modéré","Moderate","Moderada"):T("À éviter","Avoid","Evitar")
  // Sélection RÉELLE pondérée par l'envie (champs réels : score, snorkel, kids,
  // parking, drive, côte) — chaque envie donne un gagnant genuinement différent
  // (jamais de fausse personnalisation, garde-fou du concept).
  const ranked=useMemo(()=>{
    const list=(pickBeaches||[]).filter(b=>b.status&&b.score!=null&&b.lat)
    const sh=b=>{try{return classifyBeachCoast(b.lat,b.lng,b.island)==="sheltered"}catch(_){return false}}
    const w=b=>{
      let s=(b.score||0)
      if(vibe==="swim")s+=(b.snorkel?6:0)+(sh(b)?8:0)
      else if(vibe==="photo")s+=(sh(b)?4:0)+((b.score||0)>=80?6:0)
      else if(vibe==="meet")s+=(b.parking?6:0)+((b.drive!=null&&b.drive<25)?9:0)
      else if(vibe==="family")s+=(b.kids?12:0)+(b.parking?5:0)+(sh(b)?6:0)
      else if(vibe==="escape")s+=((b.drive!=null&&b.drive>35)?10:0)+(b.snorkel?4:0)
      return s
    }
    return [...list].sort((a,b)=>w(b)-w(a)).slice(0,5)
  },[pickBeaches,vibe])
  const pickVibe=v=>{setVibe(v.k);track("sg_funnel_vibe",{vibe:v.k});setStage("coast")}
  const openBeach=b=>{track("sg_funnel_pick",{beach_id:b.id,vibe:vibe||"_",score:b.score});onOpenBeach&&onOpenBeach(b)}
  // Beat 2 LE SCAN : taper une plage classée n'ouvre plus la fiche d'un coup —
  // on entre d'abord dans le scan (le satellite analyse CETTE plage), puis « Voir
  // le résultat » ouvre la vraie fiche. Garde tout le parcours actuel intact.
  const goScan=b=>{setChosenBeach(b);setFaved(false);track("sg_funnel_scan_view",{beach_id:b.id,vibe:vibe||"_"});setStage("scan")}
  // Beat 3 LE VERDICT : actions de capture photogéniques (partage social) +
  // appropriation (favori = pont vers le veilleur). Partage = donnée publique.
  const [faved,setFaved]=useState(false)
  const shareBeach=b=>{
    const txt=`${b.name} ${b.score}/100 · ${statusShort(b)} ${T("aujourd'hui","today","hoy")} ☀️`
    const url=(typeof window!=="undefined"&&window.location&&window.location.origin)||""
    track("sg_share",{beach_id:b.id,method:"funnel"})
    try{if(navigator.share){navigator.share({title:b.name,text:txt,url}).catch(()=>{});return}}catch(_){}
    try{navigator.clipboard&&navigator.clipboard.writeText(`${txt} ${url}`.trim())}catch(_){}
  }
  // toggleFav (onFav) gère DÉJÀ sg_fav_add/sg_fav_remove — ici un event funnel
  // distinct pour l'attribution, sans double-fire ni event contradictoire.
  const favBeach=b=>{setFaved(v=>!v);track("sg_funnel_fav",{beach_id:b.id});onFav&&onFav(b)}
  // Beat 4 — honnêteté FTC/DSA : l'alerte n'existe QUE si le forecast J+1..J+2 de
  // la plage choisie se dégrade VRAIMENT (jamais de fausse urgence). Sinon null →
  // pas de pitch d'alerte, le verdict mène direct à la fiche.
  const j2info=useMemo(()=>{
    if(!chosenBeach)return null
    const wkId=IS_NEW_REGION?chosenBeach.id:BEACH_TO_SARG[chosenBeach.id]
    const fc=sargData&&sargData.weekly&&sargData.weekly[wkId]&&sargData.weekly[wkId].forecast
    if(!fc||!fc.length)return null
    const RANK={clean:0,moderate:1,avoid:2}
    const today=(RANK[fc[0]&&fc[0].status]!=null?RANK[fc[0].status]:RANK[chosenBeach.status])||0
    for(let i=1;i<=2&&i<fc.length;i++){
      const r=RANK[fc[i]&&fc[i].status]
      if(r!=null&&r>today)return{day:i,date:fc[i].date,status:fc[i].status}
    }
    return null
  },[chosenBeach,sargData])
  const dayName=j2info?(()=>{try{return new Date(j2info.date+"T12:00:00Z").toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long"})}catch(_){return""}})():""
  const distTxt=b=>{if(!userPos||!b.lat)return b.drive!=null?`${b.drive} min`:"";const km=haversine(userPos.lat,userPos.lng,b.lat,b.lng);return US_UNITS?`${Math.max(1,Math.round(km*0.621))} mi`:`${Math.max(1,Math.round(km))} km`}
  return(
    <div role="dialog" aria-label={T("Trouve ta plage","Find your beach","Encuentra tu playa")} style={{position:"absolute",inset:0,zIndex:1050,
      background:"#0A1714",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",animation:"fadeIn .35s ease-out",
      opacity:exiting?0:1,transform:exiting?"scale(1.04)":"none",
      transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}}>
      <style>{`
.gf-cam{transition:transform .64s cubic-bezier(.34,1.56,.64,1)}
.gf-chip{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),box-shadow .2s ease}
.gf-chip:active{transform:scale(.94)}
.gf-card{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),border-color .2s ease}
.gf-card:active{transform:scale(.975)}
.gf-pulse{animation:gfPulse 2.6s ease-in-out infinite}
@keyframes gfPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:.7}}
.gf-panel{animation:gfRise .5s cubic-bezier(.22,.61,.36,1) both}
@keyframes gfRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes gfIgnite{from{opacity:0;transform:translateY(14px) scale(.86)}to{opacity:1;transform:none}}
@keyframes gfPx{from{opacity:0;transform:scale(.5)}to{opacity:.9;transform:none}}
.gf-px{animation:gfPx .55s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--d,0ms);transform-box:fill-box;transform-origin:center}
@keyframes gfScanGlow{0%,100%{opacity:.3}50%{opacity:.75}}
@keyframes gfSweep{from{transform:translateY(140px)}to{transform:translateY(452px)}}
.gf-scanline{animation:gfScanGlow 1.4s ease-in-out infinite,gfSweep 2.4s ease-in-out both}
@keyframes gfSatDrop{from{transform:translate(400px,24px)}to{transform:translate(400px,142px)}}
.gf-sat{animation:gfSatDrop 2.4s cubic-bezier(.4,0,.2,1) both}
@keyframes gfFade{from{opacity:0}to{opacity:1}}
.gf-scanfx{animation:gfFade .45s ease-out both}
.gf-medal{animation:gfFade .5s ease-out .9s both}
@keyframes gfBlobIn{from{transform:scale(.55)}to{transform:scale(1)}}
.gf-blob{animation:gfBlobIn .6s cubic-bezier(.34,1.56,.64,1) both;transform-box:fill-box;transform-origin:center}
@keyframes gfDotIn{from{transform:scale(.3)}to{transform:scale(1)}}
.gf-dot{animation:gfDotIn .5s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--dd,0ms);transform-box:fill-box;transform-origin:center}
@keyframes gfRing{to{stroke-dashoffset:-48}}
.gf-ring{animation:gfRing 6s linear infinite}
@keyframes gfArrive{0%{transform:translateX(36px)}100%{transform:translateX(-8px)}}
.gf-arrive{animation:gfArrive 5s ease-in-out infinite alternate}
@keyframes gfArrowDash{to{stroke-dashoffset:-24}}
.gf-arrow{animation:gfArrowDash 1.8s linear infinite}
@keyframes gfAlertPulse{0%{transform:scale(.5);opacity:.7}100%{transform:scale(2.1);opacity:0}}
.gf-alertpulse{animation:gfAlertPulse 2.2s ease-out infinite}
@media (prefers-reduced-motion:reduce){.gf-cam{transition:none}.gf-panel,.gf-chip,.gf-card{animation:none!important}.gf-pulse,.gf-scanline,.gf-sat,.gf-medal,.gf-scanfx,.gf-blob,.gf-dot,.gf-ring,.gf-arrive,.gf-arrow,.gf-alertpulse{animation:none!important}.gf-px{animation:none!important;opacity:.9}.gf-medal,.gf-scanfx{opacity:1}.gf-sat{transform:translate(400px,142px)}.gf-scanline{transform:translateY(300px)}.gf-blob,.gf-dot{transform:scale(1)}}
      `}</style>
      {/* PREMIER ÉCRAN (100svh) : le funnel-jeu. On peut ensuite SCROLLER dans le
          même monde (méthode + veilleur) — le scroll-SVG est rebranché. */}
      <section style={{position:"relative",height:"100svh",overflow:"hidden"}}>
      {/* LE MONDE — dolly-in : il grossit quand on entre dans la sélection */}
      <div className="gf-cam" aria-hidden style={{position:"absolute",inset:0,transformOrigin:"50% 64%",
        transform:stage==="scan"?"scale(1.22) translateY(-4%)":stage==="verdict"?"scale(1.2) translateY(-3%)":stage==="coast"?"scale(1.16) translateY(-2%)":"scale(1)"}}>
        <HeroScene/>
      </div>
      <div aria-hidden style={{position:"absolute",inset:0,pointerEvents:"none",transition:"background .5s ease",
        background:stage==="scan"
          ?"linear-gradient(180deg,rgba(5,18,24,.72) 0%,rgba(8,30,40,.4) 36%,rgba(10,23,20,.86) 70%,#0A1714 100%)"
          :stage==="verdict"
          ?"linear-gradient(180deg,rgba(10,23,20,.45) 0%,rgba(10,23,20,.1) 28%,rgba(10,23,20,.5) 50%,rgba(10,23,20,.9) 76%,#0A1714 100%)"
          :stage==="alert"
          ?"linear-gradient(180deg,rgba(4,11,22,.86) 0%,rgba(4,11,22,.62) 38%,rgba(6,16,18,.9) 72%,#0A1714 100%)"
          :stage==="coast"
          ?"linear-gradient(180deg,rgba(10,23,20,.5) 0%,rgba(10,23,20,.22) 24%,rgba(10,23,20,.86) 62%,#0A1714 100%)"
          :"linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 30%,rgba(10,23,20,.8) 74%,#0A1714 100%)"}}/>
      {/* BEAT 2 — LE SCAN : scène SVG (le satellite descend, faisceau, pixels de
          la côte qui s'allument, médaillon-preuve Sentinel-6). opacity pilotée
          par --gfs2 (rAF). Continuité du monde : même satellite/faisceau/teal
          que HeroScene + ScrollStory. */}
      {stage==="scan"&&(
        <svg aria-hidden viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <defs>
            <linearGradient id="gfBeam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFD884" stopOpacity=".5"/>
              <stop offset="1" stopColor="#FFD884" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* le satellite Sentinel-6 descend de l'orbite, faisceau vers la baie */}
          <g className="gf-sat">
            <polygon points="-8,16 8,16 44,330 -44,330" fill="url(#gfBeam)" opacity=".5"/>
            <rect x="-30" y="-4" width="19" height="8" rx="1.5" fill="#3BA7A0"/>
            <rect x="11" y="-4" width="19" height="8" rx="1.5" fill="#3BA7A0"/>
            <rect x="-12" y="-11" width="24" height="21" rx="3" fill="#C9971F"/>
            <rect x="-12" y="-11" width="24" height="7" rx="3" fill="#FFC72C"/>
          </g>
          {/* la ligne de scan balaie la baie */}
          <rect className="gf-scanline" x="-40" width="880" height="3" rx="1.5" fill="#5FD3C9"/>
          {/* les pixels de la côte s'allument en cascade (teinte vers le statut) */}
          <g>
            {[...Array(15)].map((_,i)=>{
              const col=i%5,row=Math.floor(i/5)
              const c=["#3BA7A0","#3BA7A0","#FFC72C","#FFC72C","#F59E0B"][col]
              return <rect key={i} className="gf-px" x={326+col*30} y={272+row*30} width="22" height="22" rx="5" fill={c}
                style={{"--d":`${(row*5+col)*55}ms`}}/>
            })}
          </g>
          {/* médaillon-preuve : Sentinel-6 / NASA-JPL / Copernicus */}
          <g className="gf-medal" transform="translate(400,408)">
            <circle r="34" fill="#08251F" stroke="#FFC72C" strokeWidth="2"/>
            <circle r="34" fill="none" stroke="#3BA7A0" strokeWidth="1" strokeDasharray="3 6" opacity=".65"/>
            <g transform="scale(.7)">
              <rect x="-26" y="-3" width="15" height="6" rx="1.2" fill="#3BA7A0"/>
              <rect x="11" y="-3" width="15" height="6" rx="1.2" fill="#3BA7A0"/>
              <rect x="-9" y="-8" width="18" height="15" rx="2" fill="#C9971F"/>
              <rect x="-9" y="-8" width="18" height="5" rx="2" fill="#FFC72C"/>
            </g>
          </g>
        </svg>
      )}
      {/* BEAT 3 — LE VERDICT : score-blob (squircle candy) de la plage choisie +
          les plages alternatives en orbite + glitter. SVG base-visible (jamais
          gated sur une anim) ; les anims = pop d'entrée (scale) + ring rotatif. */}
      {stage==="verdict"&&chosenBeach&&(()=>{
        const bc=statusCol(chosenBeach)
        const alts=ranked.filter(b=>b.id!==chosenBeach.id).slice(0,3)
        const POS=[[400,182],[520,388],[280,388]],RR=[20,16,14]
        return(
        <svg aria-hidden viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <circle cx="400" cy="306" r="106" fill="none" stroke="#3BA7A0" strokeWidth="1.2" strokeDasharray="3 9" opacity=".32" className="gf-ring"/>
          {alts.map((b,i)=>(
            <g key={b.id} transform={`translate(${POS[i][0]},${POS[i][1]})`}>
              <g className="gf-dot" style={{"--dd":`${320+i*90}ms`}}>
                <circle r={RR[i]} fill="#10231E" stroke="rgba(255,255,255,.14)" strokeWidth="1.5"/>
                <text x="0" y={RR[i]*.34} textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize={RR[i]*.95} fill={statusCol(b)}>{b.score}</text>
              </g>
            </g>
          ))}
          <g className="gf-blob">
            <path d="M400 216 C442 216 494 268 494 306 C494 348 442 396 400 396 C358 396 306 348 306 306 C306 268 358 216 400 216 Z" fill={bc} opacity=".16"/>
            <path d="M400 232 C436 232 478 270 478 306 C478 344 436 380 400 380 C364 380 322 344 322 306 C322 270 364 232 400 232 Z" fill="none" stroke={bc} strokeWidth="2.5" opacity=".7"/>
            <text x="400" y="318" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="78" fill={bc} letterSpacing=".02em">{chosenBeach.score}</text>
            <text x="400" y="346" textAnchor="middle" fontSize="12.5" fill="rgba(255,255,255,.5)" fontWeight="700" letterSpacing=".14em">/100</text>
          </g>
        </svg>
        )})()}
      {/* BEAT 4 — L'ALERTE J+2 : scène de nuit, le banc qui dérive vers la côte,
          flèche d'arrivée, notif téléphone. Honnête (seulement si vraie
          dégradation). SVG base-visible. */}
      {stage==="alert"&&chosenBeach&&(
        <svg aria-hidden viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <g opacity=".6">
            <circle cx="96" cy="60" r="1.1" fill="#fff" opacity=".5"/><circle cx="238" cy="100" r=".9" fill="#fff" opacity=".4"/>
            <circle cx="560" cy="84" r="1" fill="#fff" opacity=".45"/><circle cx="700" cy="120" r="1.1" fill="#fff" opacity=".5"/>
            <circle cx="430" cy="150" r=".8" fill="#9ADCD4" opacity=".4"/>
          </g>
          <path d="M-40 432 Q200 412 430 422 Q640 430 840 450 L840 600 L-40 600Z" fill="#0A1A16"/>
          <path d="M-40 432 Q200 412 430 422 Q640 430 840 450" fill="none" stroke="#1A4A44" strokeWidth="2" opacity=".55"/>
          <g className="gf-arrive">
            <g transform="translate(438,394) scale(.85)"><ellipse rx="14" ry="5" fill="#5a4410"/><ellipse cx="-8" cy="-2" rx="7" ry="3.5" fill="#6a5418"/><ellipse cx="8" cy="-2" rx="8" ry="3.5" fill="#3d2c08"/></g>
            <g transform="translate(486,378) scale(.6)"><ellipse rx="14" ry="5" fill="#5a4410"/><ellipse cx="-8" cy="-2" rx="7" ry="3.5" fill="#6a5418"/></g>
          </g>
          <path className="gf-arrow" d="M520 296 Q488 342 455 386" fill="none" stroke="#E8522A" strokeWidth="2.5" strokeDasharray="5 7" opacity=".75"/>
          <g transform="translate(300,248)">
            <circle className="gf-alertpulse" r="46" fill="none" stroke="#E8522A" strokeWidth="1.5" opacity=".5" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
            <rect x="-30" y="-54" width="60" height="108" rx="11" fill="#10231E" stroke="rgba(255,255,255,.22)" strokeWidth="1.5"/>
            <rect x="-23" y="-30" width="46" height="42" rx="7" fill="#1A3A2E"/>
            <path d="M0 -22 l9 16 h-18 z" fill="none" stroke="#FFC72C" strokeWidth="2" strokeLinejoin="round"/>
            <rect x="-.9" y="-12" width="1.8" height="6" rx=".9" fill="#FFC72C"/><circle cx="0" cy="-3.5" r="1.1" fill="#FFC72C"/>
            <text x="0" y="24" textAnchor="middle" fontSize="7.5" fill="#FFC72C" fontWeight="700" letterSpacing=".04em">BANC J+{j2info?j2info.day:2}</text>
          </g>
        </svg>
      )}
      {/* barre haute */}
      <div style={{position:"absolute",top:0,left:0,right:0,display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"calc(14px + env(safe-area-inset-top)) 18px 0",maxWidth:560,margin:"0 auto"}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:".14em",color:"#fff",opacity:.92}}>{wordmark}</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10.5,fontWeight:700,letterSpacing:".06em",
          background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",padding:"5px 10px",borderRadius:999}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 8px #22C55E"}}/>
          LIVE{upd?` · ${upd}`:""}
        </span>
      </div>
      {/* contenu bas */}
      <div style={{position:"absolute",left:0,right:0,bottom:0,padding:"0 20px calc(16px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto"}}>
        {stage==="vibe"&&(
          <div key="vibe" className="gf-panel">
            {proof&&(
              <div style={{display:"inline-flex",alignItems:"baseline",gap:8,marginBottom:14,
                background:"rgba(10,23,20,.42)",border:"1px solid rgba(255,199,44,.3)",borderRadius:999,padding:"7px 13px"}}>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:".07em",color:"#FFC72C",textTransform:"uppercase"}}>{T("Plus propre maintenant","Cleanest now","Más limpia ahora")}</span>
                <span style={{fontSize:12.5,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:130}}>{proof.name}</span>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:"#FFC72C",letterSpacing:".02em"}}>{cnt}<span style={{fontSize:11,opacity:.7}}>/100</span></span>
              </div>
            )}
            <div style={{fontSize:11,fontWeight:600,letterSpacing:".14em",color:"rgba(255,255,255,.6)",marginBottom:8,textTransform:"uppercase"}}>
              {dateLong} · {T("SATELLITE COPERNICUS","COPERNICUS SATELLITE","SATÉLITE COPERNICUS")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(34px,9vw,52px)",lineHeight:.98,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 10px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.35)"}}>
              {T("Pourquoi la plage aujourd'hui ?","Why the beach today?","¿Por qué la playa hoy?")}
            </h1>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <span className="gf-pulse" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#3BA7A0",boxShadow:"0 0 10px #3BA7A0",flexShrink:0}}/>
              <span style={{fontSize:13,color:"rgba(255,255,255,.74)",fontWeight:600}}>
                {T("J'ai scanné tes côtes ce matin. Dis-moi ton envie.","I scanned your coast this morning. Tell me your mood.","Escaneé tu costa esta mañana. Dime tu plan.")}
              </span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:9}}>
              {VIBES.map(v=>(
                <button key={v.k} className="gf-chip" onClick={()=>pickVibe(v)}
                  style={{cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,color:"#0A1714",
                    border:"none",borderRadius:999,padding:"13px 18px",
                    background:`linear-gradient(135deg,${v.g[0]},${v.g[1]})`,
                    boxShadow:`0 6px 18px ${v.g[1]}55,inset 0 1px 0 rgba(255,255,255,.4)`}}>
                  {v.label}
                </button>
              ))}
            </div>
            <button onClick={onShowMap} style={{display:"block",margin:"16px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.6)",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — montre-moi la carte","Skip — show me the map","Saltar — muéstrame el mapa")}
            </button>
          </div>
        )}
        {stage==="coast"&&(
          <div key="coast" className="gf-panel">
            <button onClick={()=>{setStage("vibe");setVibe(null)}} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Changer d'envie","Change mood","Cambiar plan")}
            </button>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:"#FFC72C",marginBottom:8,textTransform:"uppercase"}}>
              {T("Pour","For","Para")} {vibeLabel} · {T("aujourd'hui","today","hoy")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,7vw,42px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 14px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.4)"}}>
              {T("Tes plages, classées pour toi","Your beaches, ranked for you","Tus playas, en tu orden")}
            </h1>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {ranked.map((b,i)=>(
                <button key={b.id} className="gf-card" onClick={()=>goScan(b)}
                  style={{animation:rm?"none":"gfIgnite .5s cubic-bezier(.34,1.56,.64,1) both",animationDelay:rm?undefined:`${i*70}ms`,
                    display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",
                    background:"rgba(16,35,30,.92)",border:"1px solid rgba(255,255,255,.09)",borderRadius:15,
                    padding:"13px 15px",cursor:"pointer",fontFamily:"inherit"}}>
                  <span style={{width:12,height:12,flexShrink:0,borderRadius:6,background:statusCol(b),boxShadow:`0 0 10px ${statusCol(b)}`}}/>
                  <span style={{flex:1,minWidth:0}}>
                    <span style={{display:"block",fontWeight:800,fontSize:15,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</span>
                    <span style={{display:"block",fontSize:11.5,color:"rgba(255,255,255,.52)",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {statusShort(b)}{b.commune?` · ${b.commune}`:""}{distTxt(b)?` · ${distTxt(b)}`:""}
                    </span>
                  </span>
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:statusCol(b),letterSpacing:".02em",lineHeight:1}}>{b.score}</span>
                  <span style={{color:"rgba(255,255,255,.32)",fontSize:19,lineHeight:1}}>›</span>
                </button>
              ))}
            </div>
            <button onClick={onShowMap} style={{display:"block",margin:"14px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.6)",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {T("Voir toutes les plages sur la carte","See every beach on the map","Ver todas las playas en el mapa")}
            </button>
          </div>
        )}
        {stage==="scan"&&chosenBeach&&(
          <div key="scan" className="gf-panel">
            <button onClick={()=>setStage("coast")} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Retour","Back","Volver")}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span className="gf-pulse" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#5FD3C9",boxShadow:"0 0 10px #5FD3C9",flexShrink:0}}/>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:"#5FD3C9",textTransform:"uppercase"}}>
                {T("Le satellite scanne","Satellite scanning","El satélite escanea")}
              </span>
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,7vw,42px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 8px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.4)"}}>
              {chosenBeach.name}
            </h1>
            <div style={{fontSize:12,color:"rgba(255,255,255,.6)",fontFamily:"ui-monospace,SFMono-Regular,monospace",marginBottom:16}}>
              {T("Sentinel-6 analyse les nappes","Sentinel-6 reads the rafts","Sentinel-6 analiza las manchas")} · NASA/JPL · Copernicus
            </div>
            <button onClick={()=>setStage("verdict")} className="gf-chip" style={{display:"block",width:"100%",textAlign:"center",
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#0A1714",border:"none",borderRadius:16,
              padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
              {T("Voir le résultat →","See the result →","Ver el resultado →")}
            </button>
            <button onClick={onShowMap} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.55)",fontFamily:"inherit",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — montre-moi la carte","Skip — show me the map","Saltar — muéstrame el mapa")}
            </button>
          </div>
        )}
        {stage==="verdict"&&chosenBeach&&(
          <div key="verdict" className="gf-panel">
            <button onClick={()=>setStage("coast")} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Autres plages","Other beaches","Otras playas")}
            </button>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:".12em",color:"#FFC72C",marginBottom:8,textTransform:"uppercase"}}>
              {T("Ta journée de plage","Your beach day","Tu día de playa")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(30px,8vw,46px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 6px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.4)"}}>
              {chosenBeach.name}
            </h1>
            <div style={{fontSize:13.5,color:"rgba(255,255,255,.72)",fontWeight:600,marginBottom:16,lineHeight:1.4}}>
              {chosenBeach.status==="clean"?T("Eau claire, sable propre — c'est le bon jour.","Clear water, clean sand — today's the day.","Agua clara, arena limpia — es el día.")
               :chosenBeach.status==="moderate"?T("Correct aujourd'hui — surveille demain.","Okay today — keep an eye on tomorrow.","Bien hoy — ojo con mañana.")
               :T("Sargasses présentes — regarde les alternatives autour.","Sargassum present — check the alternatives around.","Sargazo presente — mira las alternativas.")}
            </div>
            {j2info&&(
              <button onClick={()=>{track("sg_funnel_alert_view",{beach_id:chosenBeach.id,day:j2info.day});setStage("alert")}}
                className="gf-chip" style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",cursor:"pointer",
                fontFamily:"inherit",borderRadius:14,padding:"12px 14px",marginBottom:10,
                background:"rgba(232,82,42,.12)",border:"1px solid rgba(232,82,42,.4)"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4845F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>
                <span style={{flex:1,minWidth:0}}>
                  <span style={{display:"block",fontWeight:800,fontSize:13.5,color:"#F4845F"}}>{T(`Sargasses prévues ${dayName}`,`Sargassum forecast ${dayName}`,`Sargazo previsto ${dayName}`)}</span>
                  <span style={{display:"block",fontSize:12,color:"rgba(255,255,255,.6)"}}>{T("Sois prévenu la veille →","Get warned the day before →","Te aviso la víspera →")}</span>
                </span>
              </button>
            )}
            <button onClick={()=>openBeach(chosenBeach)} className="gf-chip" style={{display:"block",width:"100%",textAlign:"center",
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#0A1714",border:"none",borderRadius:16,
              padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
              {T("Voir la fiche complète →","See the full report →","Ver la ficha completa →")}
            </button>
            <div style={{display:"flex",gap:10,marginTop:10}}>
              <button onClick={()=>shareBeach(chosenBeach)} className="gf-chip" style={{flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,
                cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:14,color:"#fff",borderRadius:14,padding:"12px 14px",
                background:"rgba(16,35,30,.92)",border:"1px solid rgba(255,255,255,.14)"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFC72C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
                {T("Partager","Share","Compartir")}
              </button>
              <button onClick={()=>favBeach(chosenBeach)} aria-pressed={faved} aria-label={T("Épingler","Pin","Fijar")} className="gf-chip" style={{flex:"none",width:52,display:"inline-flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",borderRadius:14,padding:"12px",background:faved?"rgba(255,199,44,.16)":"rgba(16,35,30,.92)",
                border:`1px solid ${faved?"rgba(255,199,44,.5)":"rgba(255,255,255,.14)"}`}}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill={faved?"#FFC72C":"none"} stroke={faved?"#FFC72C":"rgba(255,255,255,.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
              </button>
            </div>
            <button onClick={onShowMap} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.55)",fontFamily:"inherit",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — toutes les plages","Skip — all beaches","Saltar — todas las playas")}
            </button>
          </div>
        )}
        {stage==="alert"&&chosenBeach&&(
          <div key="alert" className="gf-panel">
            <button onClick={()=>setStage("verdict")} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Retour","Back","Volver")}
            </button>
            <div style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:11,fontWeight:700,letterSpacing:".1em",color:"#F4845F",marginBottom:8,textTransform:"uppercase"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F4845F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>
              {T("Prévision satellite","Satellite forecast","Pronóstico satelital")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,7.5vw,44px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 8px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.5)"}}>
              {T(`Un banc arrive ${dayName}`,`A raft lands ${dayName}`,`Llega un banco el ${dayName}`)}
            </h1>
            <div style={{fontSize:13.5,color:"rgba(255,255,255,.74)",fontWeight:600,marginBottom:18,lineHeight:1.45}}>
              {T(`Sur ${chosenBeach.name}, l'eau se trouble ${dayName}. Je te préviens la veille — à temps pour changer de plan.`,
                 `At ${chosenBeach.name}, the water turns ${dayName}. I warn you the day before — in time to change plans.`,
                 `En ${chosenBeach.name}, el agua empeora el ${dayName}. Te aviso la víspera — a tiempo para cambiar de plan.`)}
            </div>
            <button onClick={()=>onPremium&&onPremium("funnel_alert")} className="gf-chip" style={{display:"block",width:"100%",textAlign:"center",
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#0A1714",border:"none",borderRadius:16,
              padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
              {T("Sois prévenu la veille →","Get warned the day before →","Te aviso la víspera →")}
            </button>
            <button onClick={()=>openBeach(chosenBeach)} style={{display:"block",width:"100%",textAlign:"center",marginTop:10,
              cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:14,color:"#fff",borderRadius:14,padding:"12px 16px",
              background:"rgba(16,35,30,.92)",border:"1px solid rgba(255,255,255,.14)"}}>
              {T("Voir la fiche d'abord","See the report first","Ver la ficha primero")}
            </button>
            <button onClick={onShowMap} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.55)",fontFamily:"inherit",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — toutes les plages","Skip — all beaches","Saltar — todas las playas")}
            </button>
          </div>
        )}
      </div>
      </section>
      {/* INTÉGRATION fil rouge : le scroll-SVG revient — sous le funnel, on
          CONTINUE dans le même monde (méthode scrollytelling + veilleur) au lieu
          de s'arrêter au tap-funnel. Mobile retrouve son scroll ; le bras control
          (HeroVerdict) reste inchangé. */}
      <section style={{padding:"58px 22px 6px",maxWidth:560,margin:"0 auto"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:".16em",color:"#FFC72C",textTransform:"uppercase",marginBottom:10}}>
          {T("La méthode","The method","El método")}
        </div>
        <h2 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,6.5vw,40px)",lineHeight:1.02,letterSpacing:".01em",textTransform:"uppercase",margin:0,color:"#fff"}}>
          {T("On regarde la mer pour toi","We watch the sea for you","Miramos el mar por ti")}
        </h2>
      </section>
      <ScrollStory lang={lang} onShowMap={onShowMap}/>
      <section style={{padding:"28px 22px calc(40px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto"}}>
        <div style={{background:"linear-gradient(145deg,#10231E,#0A1714)",border:"1px solid rgba(255,199,44,.25)",borderRadius:20,padding:"24px 20px",textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:23,color:"#fff",letterSpacing:".02em",textTransform:"uppercase",marginBottom:6}}>{T("Ton veilleur personnel","Your personal watcher","Tu vigía personal")}</div>
          <div style={{fontSize:13.5,color:"rgba(255,255,255,.66)",marginBottom:16,lineHeight:1.45}}>{T("Je surveille ta plage et je te préviens la veille où elle se trouble.","I watch your beach and warn you the day before it turns.","Vigilo tu playa y te aviso la víspera de que cambie.")}</div>
          <button onClick={()=>onPremium&&onPremium("funnel_scroll")} className="gf-chip" style={{display:"block",width:"100%",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#0A1714",border:"none",borderRadius:16,padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
            {T("Découvrir le veilleur →","Meet the watcher →","Descubrir el vigía →")}
          </button>
          <button onClick={onShowMap} style={{display:"block",width:"100%",marginTop:10,background:"none",border:"none",color:"rgba(255,255,255,.6)",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            {T("Ou ouvrir la carte gratuite","Or open the free map","O abrir el mapa gratis")}
          </button>
        </div>
      </section>
    </div>
  )
}

function HeroVerdict({beach,lang,island,sargData,userPos,onOpen,onShowMap,onPremium,onOpenBeach,topBeaches,pickBeaches,exiting}){
  const [pickQ,setPickQ]=useState("")
  useEffect(()=>{track("sg_hero_shown",{beach_id:beach.id,status:beach.status,geoloc:!!userPos})},[])
  // Hero média = HeroScene (scène vectorielle, directive user 12/06). L'ancien
  // empilement photo/WebGL/loops DepthFlow est démonté du hero — SceneCanvas et
  // les loops (/videos/hero/, release depthflow-heroes) restent disponibles
  // pour un réemploi (fiches, about). LCP = plus aucun fetch média en hero.
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onShowMap()}
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)
  },[onShowMap])
  // Landing scrollable (modèle SpaceX, demande user 2026-06-11) : hero 100svh
  // puis sections — verdict du jour, méthode, premium — en scroll naturel.
  // Reveals à l'IntersectionObserver (root = ce conteneur), sticky bar quand
  // le hero sort du viewport, tout neutralisé par prefers-reduced-motion.
  const wrapRef=useRef(null)
  const heroRef=useRef(null)
  const [stuck,setStuck]=useState(false)
  useEffect(()=>{
    const root=wrapRef.current;if(!root)return
    const hero=heroRef.current
    const io1=hero?new IntersectionObserver(es=>setStuck(!es[0].isIntersecting),{root,threshold:.06}):null
    if(io1)io1.observe(hero)
    const seen={}
    const io2=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue
      e.target.classList.add("in")
      const s=e.target.getAttribute("data-s")
      if(s&&!seen[s]){seen[s]=1;track("sg_landing_view",{s})}
      io2.unobserve(e.target)}},{root,threshold:.18})
    root.querySelectorAll(".sg-rv").forEach(n=>io2.observe(n))
    return()=>{io1&&io1.disconnect();io2.disconnect()}
  },[])
  const scrollNext=()=>{try{wrapRef.current?.querySelector("#sg-s2")?.scrollIntoView({behavior:"smooth",block:"start"})}catch(_){}}
  const clean=beach.status==="clean"
  const verdictTxt=clean?_t(lang,"PROPRE AUJOURD'HUI","CLEAN TODAY","SIN SARGAZO HOY")
    :beach.status==="moderate"?_t(lang,"MODÉRÉ AUJOURD'HUI","MODERATE TODAY","MODERADA HOY")
    :_t(lang,"À ÉVITER AUJOURD'HUI","AVOID TODAY","EVITAR HOY")
  const verdictBg=clean?"#FFC72C":beach.status==="moderate"?"#F59E0B":"#E8522A"
  // J+1 réel quand résolvable (weekly keyé par id sarg pour MQ/GP, id direct
  // pour les nouvelles régions) — sinon pas de promesse.
  const wkId=IS_NEW_REGION?beach.id:BEACH_TO_SARG[beach.id]
  const j1=sargData?.weekly?.[wkId]?.forecast?.[1]?.status||null
  const sub=(()=>{
    const parts=[]
    if(clean&&j1&&j1!=="clean")parts.push(_t(lang,"⚠️ Banc prévu demain — on te dira où aller","⚠️ Mat forecast tomorrow — we'll tell you where to go","⚠️ Banco previsto mañana — te diremos adónde ir"))
    else if(clean&&j1==="clean")parts.push(_t(lang,"Propre aussi demain","Clean tomorrow too","Limpia también mañana"))
    if(beach.commune)parts.push(beach.commune)
    if(userPos&&beach.lat){
      const km=haversine(userPos.lat,userPos.lng,beach.lat,beach.lng)
      parts.push(US_UNITS?`${Math.max(1,Math.round(km*0.621))} mi`:`${Math.max(1,Math.round(km))} km`)
    }
    return parts.join(" · ")
  })()
  const upd=(()=>{try{
    const ts=sargData?.updatedAt||sargData?.erddapTimestamp
    return ts?new Date(ts).toLocaleTimeString(lang==="fr"?"fr-FR":lang==="es"?"es-MX":"en-US",{hour:"2-digit",minute:"2-digit"}):""
  }catch(_){return""}})()
  const dateLong=new Date().toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long",day:"numeric",month:"long"})
  const wordmark=IS_NEW_REGION
    ?((lang==="es"?"SARGAZO ":"SARGASSUM ")+String(REGION.name||"").toUpperCase())
    :(island==="gp"?"SARGASSES GUADELOUPE":"SARGASSES MARTINIQUE")
  const statusShort=b=>b.status==="clean"?_t(lang,"Propre","Clean","Limpia")
    :b.status==="moderate"?_t(lang,"Modéré","Moderate","Moderada"):_t(lang,"À éviter","Avoid","Evitar")
  const statusCol=b=>b.status==="clean"?"#FFC72C":b.status==="moderate"?"#F59E0B":"#E8522A"
  const ovl={fontSize:11,fontWeight:700,letterSpacing:".16em",color:"#FFC72C",textTransform:"uppercase",marginBottom:10}
  const h2s={fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,6.5vw,40px)",lineHeight:1.02,
    letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 10px",color:"#fff"}
  const secPad={padding:"68px 22px 8px",maxWidth:560,margin:"0 auto"}
  return(
    <div ref={wrapRef} role="dialog" aria-label={beach.name} style={{position:"absolute",inset:0,zIndex:1050,
      background:"#0A1714",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",
      /* PAS de fill-mode sur l'entrée : avec "both" l'animation épinglerait
         opacity:1 pour toujours et écraserait le fondu de sortie (inline) */
      animation:"fadeIn .35s ease-out",
      opacity:exiting?0:1,transform:exiting?"scale(1.04)":"none",
      transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}}>
      <style>{`@keyframes sgHeroBob{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
.sg-heroSec{position:relative;min-height:100vh}
@supports(min-height:100svh){.sg-heroSec{min-height:100svh}}
.sg-rv{opacity:0;transform:translateY(26px);transition:opacity .65s cubic-bezier(.22,.61,.36,1),transform .65s cubic-bezier(.22,.61,.36,1)}
.sg-rv.in{opacity:1;transform:none}
.sg-stick{position:fixed;top:0;left:0;right:0;z-index:30;transform:translateY(-105%);transition:transform .32s cubic-bezier(.32,.72,.33,1)}
.sg-stick.on{transform:translateY(0)}
.sg-l-cards{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 14px;scrollbar-width:none}
.sg-l-cards::-webkit-scrollbar{display:none}
.sg-l-card{scroll-snap-align:start;flex:0 0 200px;border-radius:18px;overflow:hidden;background:#10231E;
  border:1px solid rgba(255,255,255,.1);cursor:pointer;text-align:left;padding:0;font-family:inherit;
  transition:transform .25s ease,border-color .25s ease}
.sg-l-card:hover{transform:translateY(-3px);border-color:rgba(255,199,44,.45)}
.sg-flow{stroke-dasharray:4 6;animation:sgFlowY 1.2s linear infinite}
@keyframes sgFlowY{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
.sg-storyvp{height:100vh}
@supports(height:100svh){.sg-storyvp{height:100svh}}
.sgst-ring{animation:sgstRing 2.6s ease-out infinite}
.sgst-ring2{animation:sgstRing 2.6s ease-out infinite;animation-delay:1.3s}
@keyframes sgstRing{0%{transform:scale(.3);opacity:.85}78%,100%{transform:scale(2.3);opacity:0}}
.sgst-bob{animation:sgstBob 3.4s ease-in-out infinite}
@keyframes sgstBob{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@media (prefers-reduced-motion:reduce){.sg-hero-chev{animation:none!important}
.sg-rv{transition:none;opacity:1;transform:none}.sg-stick{transition:none}.sg-l-card{transition:none}.sg-flow{animation:none}
.sgst-ring,.sgst-ring2,.sgst-bob{animation:none}}`}</style>

      {/* STICKY BAR — apparaît quand le hero sort de l'écran (modèle SpaceX) */}
      <div className={"sg-stick"+(stuck?" on":"")} aria-hidden={!stuck}>
        <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"space-between",
          padding:"calc(8px + env(safe-area-inset-top)) 16px 8px",background:"rgba(10,23,20,.88)",
          backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:11.5,letterSpacing:".12em",color:"#fff",opacity:.92,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{wordmark}</span>
          <button onClick={onShowMap} style={{flexShrink:0,background:"#FFC72C",color:"#0A1714",border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:13,padding:"9px 16px",borderRadius:999}}>
            <BrandIcon name="map" size={15} accent="#0A1714" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte","Open the map","Abrir el mapa")}
          </button>
        </div>
      </div>

      {/* ── ÉCRAN 1 : le verdict plein cadre (vidéo) ── */}
      <section ref={heroRef} className="sg-heroSec">
      <HeroScene/>
      {/* Le voile média couvre la photo : c'est LUI qui reçoit les taps sur
          l'image. Clarity 2026-06 : 46 rage + 670 dead clicks home — les
          visiteurs tapent la photo/le nom en attendant la fiche. 1 tap = fiche. */}
      <div aria-hidden onClick={()=>{track("sg_hero_tap",{t:"media"});onOpenBeach&&onOpenBeach(beach)}} style={{position:"absolute",inset:0,cursor:"pointer",
        background:"linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 26%,rgba(10,23,20,0) 42%,rgba(10,23,20,.88) 78%,#0A1714 100%)"}}/>
      <div style={{position:"absolute",top:0,left:0,right:0,display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"calc(14px + env(safe-area-inset-top)) 18px 0",maxWidth:560,margin:"0 auto"}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:".14em",color:"#fff",opacity:.92}}>{wordmark}</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10.5,fontWeight:700,letterSpacing:".06em",
          background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",
          padding:"5px 10px",borderRadius:999}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 8px #22C55E"}}/>
          LIVE{upd?` · ${upd}`:""}
        </span>
      </div>
      <div style={{position:"absolute",left:0,right:0,bottom:0,padding:"0 20px calc(10px + env(safe-area-inset-bottom))",
        maxWidth:560,margin:"0 auto"}}>
        {userPos&&(
          <div style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,letterSpacing:".05em",
            color:"#FFC72C",marginBottom:8}}>
            📍 {_t(lang,"LA PLUS PROCHE DE TOI","CLOSEST TO YOU","LA MÁS CERCA DE TI")}
          </div>
        )}
        <div style={{fontSize:11,fontWeight:600,letterSpacing:".14em",color:"rgba(255,255,255,.62)",marginBottom:6,textTransform:"uppercase"}}>
          {dateLong} · {_t(lang,"SATELLITE COPERNICUS","COPERNICUS SATELLITE","SATÉLITE COPERNICUS")}
        </div>
        <h1 onClick={()=>{track("sg_hero_tap",{t:"title"});onOpenBeach&&onOpenBeach(beach)}} style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(44px,12vw,72px)",lineHeight:.96,
          letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 14px",color:"#fff",cursor:"pointer",
          textShadow:"0 2px 24px rgba(0,0,0,.35)"}}>
          {beach.name}
        </h1>
        <div onClick={()=>{track("sg_hero_tap",{t:"verdict"});onOpenBeach&&onOpenBeach(beach)}} style={{display:"inline-flex",alignItems:"center",gap:10,background:verdictBg,color:"#0A1714",
          fontWeight:800,fontSize:15,letterSpacing:".02em",padding:"9px 16px",borderRadius:999,marginBottom:8,cursor:"pointer"}}>
          {verdictTxt}
          {beach.score!=null&&<span style={{fontFamily:"'Anton',sans-serif",fontSize:17,letterSpacing:".03em"}}>{beach.score}/100</span>}
        </div>
        {sub&&<div style={{fontSize:13,color:"rgba(255,255,255,.62)",marginBottom:18}}>{sub}</div>}
        {/* Desktop (≥900px) : la carte est un bouton de PREMIER rang à côté du
            CTA — GSC 2026-06 : intent "carte" = 7% (MQ) / 2% (GP) des clics
            home vs 72-98% "état maintenant", mais sur grand écran les
            map-seekers doivent voir leur sortie sans chercher. Mobile : lien
            discret sous le CTA (écran étroit, status-first). */}
        {(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(min-width:900px)").matches)?(
          <div style={{display:"flex",gap:10}}>
            <button onClick={onOpen} className="gbtn" style={{flex:1.5,textAlign:"center",
              background:"#FFC72C",color:"#0A1714",border:"none",cursor:"pointer",fontFamily:"inherit",
              fontWeight:800,fontSize:17,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.32)"}}>
              {_t(lang,"Voir cette plage","See this beach","Ver esta playa")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.75,marginTop:3}}>
                {_t(lang,"état complet · météo · prévisions 7 jours","full status · weather · 7-day forecast","estado completo · clima · pronóstico 7 días")}
              </span>
            </button>
            <button onClick={onShowMap} style={{flex:1,textAlign:"center",cursor:"pointer",fontFamily:"inherit",
              background:"rgba(10,23,20,.45)",color:"#fff",border:"1.5px solid rgba(255,255,255,.35)",
              fontWeight:700,fontSize:15,padding:"16px 18px",borderRadius:18,backdropFilter:"blur(6px)"}}>
              <BrandIcon name="map" size={15} accent="#0A1714" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte live","Open the live map","Abrir el mapa en vivo")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.7,marginTop:3}}>
                {_t(lang,"toutes les plages, en direct","every beach, real time","todas las playas, en directo")}
              </span>
            </button>
          </div>
        ):(
          <>
            <button onClick={onOpen} className="gbtn" style={{display:"block",width:"100%",textAlign:"center",
              background:"#FFC72C",color:"#0A1714",border:"none",cursor:"pointer",fontFamily:"inherit",
              fontWeight:800,fontSize:17,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.32)"}}>
              {_t(lang,"Voir cette plage","See this beach","Ver esta playa")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.75,marginTop:3}}>
                {_t(lang,"état complet · météo · prévisions 7 jours","full status · weather · 7-day forecast","estado completo · clima · pronóstico 7 días")}
              </span>
            </button>
            <button onClick={onShowMap} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,width:"100%",
              background:"none",border:"none",color:"rgba(255,255,255,.66)",fontFamily:"inherit",fontSize:13,
              fontWeight:600,padding:"14px 0 0",cursor:"pointer"}}>
              🗺 {_t(lang,"Toutes les plages sur la carte","All beaches on the map","Todas las playas en el mapa")}
            </button>
          </>
        )}
        {/* Invitation au scroll (un seul chevron, modèle SpaceX) */}
        <button onClick={scrollNext} aria-label={_t(lang,"Découvrir","Discover","Descubrir")}
          style={{display:"block",margin:"6px auto 0",background:"none",border:"none",cursor:"pointer",
            color:"rgba(255,255,255,.55)",fontSize:22,lineHeight:1,padding:6}}>
          <span className="sg-hero-chev" style={{display:"inline-block",animation:"sgHeroBob 1.8s ease-in-out infinite"}}>⌄</span>
        </button>
      </div>
      </section>

      {/* ── ÉCRAN 2 : le verdict du jour, plage par plage ── */}
      <section id="sg-s2" style={{...secPad,scrollMarginTop:54}}>
        <div className="sg-rv" data-s="verdict">
          <div style={ovl}>{_t(lang,"Aujourd'hui","Today","Hoy")}</div>
          <h2 style={h2s}>{_t(lang,"Le verdict, plage par plage","The verdict, beach by beach","El veredicto, playa por playa")}</h2>
          <p style={{fontSize:14,lineHeight:1.55,color:"rgba(255,255,255,.62)",margin:"0 0 18px"}}>
            {_t(lang,"Pas d'avis, pas de promesses : la mesure satellite du matin.","No opinions, no promises: this morning's satellite measurement.","Sin opiniones ni promesas: la medición satelital de esta mañana.")}
            {upd?` · LIVE ${upd}`:""}
          </p>
        </div>
        {!!(topBeaches&&topBeaches.length)&&(
          <div className="sg-l-cards sg-rv">
            {topBeaches.map(b=>(
              <button key={b.id} className="sg-l-card" onClick={()=>onOpenBeach&&onOpenBeach(b)}>
                <div style={{position:"relative",height:124,overflow:"hidden"}}>
                  <img src={b._img} alt={b.name} loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  <span style={{position:"absolute",top:8,left:8,background:statusCol(b),color:"#0A1714",
                    fontWeight:800,fontSize:11,padding:"4px 9px",borderRadius:999}}>
                    {statusShort(b)}{b.score!=null?` · ${b.score}`:""}
                  </span>
                </div>
                <div style={{padding:"10px 12px 12px"}}>
                  <div style={{fontWeight:800,fontSize:14,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</div>
                  {b.commune&&<div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:2}}>{b.commune}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
        {/* SÉLECTEUR — choisis ta plage directement depuis l'accueil (recherche
            + liste live de toutes les plages, tap = fiche). Demande user 13/06. */}
        {!!(pickBeaches&&pickBeaches.length>3)&&(()=>{
          const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
          const nq=norm(pickQ)
          const list=pickBeaches.filter(b=>!nq||norm(b.name).includes(nq)||norm(b.commune).includes(nq)).slice(0,60)
          return(
            <div className="sg-rv" style={{marginTop:24}}>
              <div style={{...ovl,marginBottom:8}}>{_t(lang,"Ta plage","Your beach","Tu playa")}</div>
              <h3 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:21,letterSpacing:".01em",
                textTransform:"uppercase",color:"#fff",margin:"0 0 12px"}}>
                {_t(lang,"Choisis ta plage","Pick your beach","Elige tu playa")}
              </h3>
              <input value={pickQ} onChange={e=>{setPickQ(e.target.value)}}
                onFocus={()=>track("sg_landing_pick_search",{})}
                placeholder={_t(lang,`Rechercher parmi ${pickBeaches.length} plages…`,`Search ${pickBeaches.length} beaches…`,`Buscar entre ${pickBeaches.length} playas…`)}
                style={{width:"100%",boxSizing:"border-box",background:"#10231E",border:"1px solid rgba(255,255,255,.12)",
                  borderRadius:14,padding:"13px 16px",color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",marginBottom:10}}/>
              <div style={{maxHeight:312,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,
                WebkitOverflowScrolling:"touch",paddingRight:2}}>
                {list.map(b=>(
                  <button key={b.id} onClick={()=>onOpenBeach&&onOpenBeach(b)}
                    style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",
                      background:"#10231E",border:"1px solid rgba(255,255,255,.07)",borderRadius:12,
                      padding:"11px 14px",cursor:"pointer",fontFamily:"inherit"}}>
                    <span style={{width:10,height:10,borderRadius:5,flexShrink:0,background:statusCol(b),
                      boxShadow:`0 0 8px ${statusCol(b)}`}}/>
                    <span style={{flex:1,minWidth:0}}>
                      <span style={{display:"block",fontWeight:700,fontSize:14,color:"#fff",whiteSpace:"nowrap",
                        overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</span>
                      {b.commune&&<span style={{display:"block",fontSize:11.5,color:"rgba(255,255,255,.5)",
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.commune}{typeof b.drive==="number"?` · ${b.drive} min`:""}</span>}
                    </span>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:17,color:statusCol(b),letterSpacing:".02em"}}>{b.score}</span>
                    <span style={{color:"rgba(255,255,255,.3)",fontSize:18,lineHeight:1}}>›</span>
                  </button>
                ))}
                {!list.length&&(
                  <div style={{textAlign:"center",fontSize:13,color:"rgba(255,255,255,.45)",padding:"18px 0"}}>
                    {_t(lang,"Aucune plage trouvée","No beach found","Ninguna playa encontrada")}
                  </div>
                )}
              </div>
            </div>
          )
        })()}
        <button onClick={onShowMap} className="sg-rv" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          width:"100%",background:"rgba(10,23,20,.45)",color:"#fff",border:"1.5px solid rgba(255,255,255,.3)",
          cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:15,padding:"15px 18px",borderRadius:18,marginTop:14}}>
          <BrandIcon name="map" size={15} accent="#0A1714" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte live","Open the live map","Abrir el mapa en vivo")}
        </button>
      </section>

      {/* ── ÉCRAN 3 : la méthode — scrollytelling plein cadre (réf Zenly, 12/06) ── */}
      <section style={{...secPad,paddingBottom:6}}>
        <div className="sg-rv" data-s="methode">
          <div style={ovl}>{_t(lang,"La méthode","The method","El método")}</div>
          <h2 style={h2s}>{_t(lang,"On regarde la mer pour vous","We watch the sea for you","Miramos el mar por ti")}</h2>
        </div>
      </section>
      {/* Le film au scroll : l'orbite → le scan → la dérive → le verdict → le choix */}
      <ScrollStory lang={lang} onShowMap={onShowMap}/>
      <section style={{...secPad,paddingTop:26}}>
        <div className="sg-rv" style={{display:"flex",flexDirection:"column",gap:14,margin:"14px 0 20px"}}>
          {[
            ["satellite",_t(lang,"Satellite Copernicus — 4 passages par jour, chaque plage","Copernicus satellite — 4 passes a day, every beach","Satélite Copernicus — 4 pasadas al día, cada playa")],
            ["score",_t(lang,"Un score 0-100 recalculé à chaque passage","A 0-100 score recomputed on every pass","Un score 0-100 recalculado en cada pasada")],
            ["cal7",_t(lang,"Prévisions 7 jours, plage par plage","7-day forecast, beach by beach","Pronóstico de 7 días, playa por playa")],
          ].map(([ic,txt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,background:"#10231E",
              border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:"14px 16px"}}>
              <BrandIcon name={ic} size={22} style={{marginTop:1,color:"rgba(255,255,255,.92)"}}/>
              <span style={{fontSize:14,lineHeight:1.5,color:"rgba(255,255,255,.85)",fontWeight:600}}>{txt}</span>
            </div>
          ))}
        </div>
        <button onClick={onOpen} className="sg-rv" style={{display:"block",background:"none",border:"none",cursor:"pointer",
          fontFamily:"inherit",color:"#FFC72C",fontWeight:800,fontSize:15,padding:0}}>
          {_t(lang,`Voir ${beach.name} en détail →`,`See ${beach.name} in detail →`,`Ver ${beach.name} en detalle →`)}
        </button>
      </section>

      {/* ── ÉCRAN 4 : premium (le prix vit dans le paywall, source unique) ── */}
      <section style={{...secPad,paddingBottom:24}}>
        <div className="sg-rv" data-s="premium">
          <div style={ovl}>Premium</div>
          <h2 style={h2s}>{_t(lang,"Soyez prévenu avant tout le monde","Be the first to know","Entérate antes que nadie")}</h2>
        </div>
        <div className="sg-rv" style={{margin:"16px 0 6px"}}><AlertScene/></div>
        <div className="sg-rv" style={{display:"flex",flexDirection:"column",gap:10,margin:"14px 0 20px"}}>
          {[
            ["bell",_t(lang,"Une alerte quand VOTRE plage change d'état","An alert when YOUR beach changes","Una alerta cuando TU playa cambia")],
            ["brief",_t(lang,"Le brief du matin dans votre boîte mail","The morning brief in your inbox","El brief de la mañana en tu correo")],
            ["cal7",_t(lang,"Les 7 jours de prévisions, toutes les plages","The full 7-day forecast, every beach","Los 7 días de pronóstico, todas las playas")],
          ].map(([ic,txt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:11,fontSize:14,fontWeight:600,
              color:"rgba(255,255,255,.85)"}}>
              <BrandIcon name={ic} size={19} style={{color:"rgba(255,255,255,.92)"}}/>{txt}
            </div>
          ))}
        </div>
        {onPremium&&(
          <button onClick={onPremium} className="sg-rv gbtn" style={{display:"block",width:"100%",textAlign:"center",
            background:"#FFC72C",color:"#0A1714",border:"none",cursor:"pointer",fontFamily:"inherit",
            fontWeight:800,fontSize:16,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.25)"}}>
            {_t(lang,"Découvrir Premium","Discover Premium","Descubrir Premium")}
          </button>
        )}
        <div className="sg-rv" style={{textAlign:"center",fontSize:11.5,color:"rgba(255,255,255,.45)",marginTop:10}}>
          {_t(lang,"Sans engagement — annulable en 1 clic","No commitment — cancel anytime","Sin compromiso — cancela cuando quieras")}
        </div>
      </section>

      <footer style={{padding:"44px 22px calc(30px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto",
        textAlign:"center",borderTop:"1px solid rgba(255,255,255,.07)",marginTop:36}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:".14em",color:"rgba(255,255,255,.6)",marginBottom:6}}>{wordmark}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.38)"}}>
          🛰 {_t(lang,"Données : Copernicus Marine","Data: Copernicus Marine","Datos: Copernicus Marine")}{upd?` · LIVE ${upd}`:""}
          {" · "}
          <a href={IS_NEW_REGION?"/about/":"/a-propos/"} style={{color:"rgba(255,255,255,.38)"}}>
            {_t(lang,"À propos","About","Acerca de")}
          </a>
        </div>
      </footer>
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
    if(IS_NEW_REGION)return REGION.id   // build dédié : la région est fixe
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
  const[view,setView]=useState("map") // map | list | learn | premium
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
  const[showChat,setShowChat]=useState(false) // assistant guidé (SargaChat)
  const[premiumSource,setPremiumSource]=useState(null)
  const[showFavToast,setShowFavToast]=useState(false)
  const[isPremium,setIsPremium]=useState(()=>{
    if(g("sg_premium",false))return true
    // Zero-friction 24h sample: local trial, no card required. Used at most once per device.
    try{
      const sampleUntil=parseInt(localStorage.getItem("sg_sample_until")||"0")
      if(sampleUntil>Date.now())return true
    }catch{}
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
              metadata:{island:IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ"}}}})
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
          alert((d.error||_t(lang,"Erreur Stripe","Stripe error","Error de Stripe"))+"\n\n"+_t(lang,"Contacte "+SUPPORT_EMAIL+" si le probleme persiste.","Contact "+SUPPORT_EMAIL+" if the issue persists.","Contacta "+SUPPORT_EMAIL+" si el problema persiste."))
        }).catch(e=>{
          track("sg_manage_portal_error",{error:e?.message||"network"})
          alert(_t(lang,"Connexion impossible au portail Stripe. Réessaie dans un instant ou contacte "+SUPPORT_EMAIL+".","Could not reach the Stripe portal. Try again in a moment or contact "+SUPPORT_EMAIL+".","No se pudo conectar al portal de Stripe. Inténtalo de nuevo o contacta "+SUPPORT_EMAIL+"."))
        })
      }else{
        const promptEmail=prompt(_t(lang,"Entre ton email pour gerer ton abonnement :","Enter your email to manage your subscription:","Introduce tu email para gestionar tu suscripción:"))
        if(promptEmail&&promptEmail.includes("@")){
          localStorage.setItem("sg_premium_email",promptEmail)
          fetch("/api/create-checkout.php",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"portal",email:promptEmail})
          }).then(r=>r.json()).then(d=>{
            if(d.url){window.location.href=d.url;return}
            alert(d.error||_t(lang,"Email introuvable chez Stripe","Email not found in Stripe","Email no encontrado en Stripe"))
          }).catch(()=>alert(_t(lang,"Connexion impossible","Connection failed","Conexión imposible")))
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

  // stripe.js à l'idle (3s post-load) : la 1re connexion js.stripe.com mesurée
  // 15-22s à froid (TLS 9s) sur réseau Caraïbe — preconnect (index.html) + charge
  // tôt pour qu'il soit en cache AVANT que l'utilisateur ouvre le paywall.
  useEffect(()=>{
    const t=setTimeout(()=>{loadStripeJs().catch(()=>{})},3000)
    return()=>clearTimeout(t)
  },[])

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

    // Fallback sans moment de valeur : soft-ask (primer) UNIQUEMENT — jamais le
    // prompt natif à froid (refus natif = blocage permanent du domaine côté
    // navigateur) et respect du cooldown 7j post-dismiss.
    const FALLBACK_MS=isStandalone?30000:60000
    const t=setTimeout(()=>{
      if(pushLoadedRef.current||recentlyDismissed)return
      setShowPushPrimer(true)
      track("sg_push_primer_shown",{trigger:"fallback_timer"})
    },FALLBACK_MS)

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
  const[imageQ,setImageQ]=useState(null) // score qualité photo 0-100 (hero)
  const[heroVids,setHeroVids]=useState(null) // ids des boucles vidéo hero dispo
  const[sargData,setSargData]=useState(null)
  const[historyData,setHistoryData]=useState(null)
  const[dataSource,setDataSource]=useState("loading")
  const[userPos,setUserPos]=useState(null) // {lat,lng}
  const[communityReports,setCommunityReports]=useState({})
  const[fbPosts,setFbPosts]=useState({})
  const[hasActiveThreat,setHasActiveThreat]=useState(false)

  // Hero Verdict — home "/" uniquement (jamais les deep-links/landings SEO),
  // 1×/session (sessionStorage), jamais pendant une activation premium.
  const[showHero,setShowHero]=useState(()=>{
    try{
      return window.location.pathname==="/"
        &&!window.location.search.includes("premium")
        &&!sessionStorage.getItem("sg_hero_seen")
    }catch(_){return false}
  })
  // Bras A/B du landing : control = HeroVerdict (éprouvé), game = GameFunnel
  // (funnel-jeu immersif, tranche verticale 13/06). Mesuré contre le landing
  // prouvé, jamais imposé ; ?lf=game force en QA. La conversion (paywall/trial/
  // A-B pw_prelude) reste strictement intacte — GameFunnel ne fait que la nourrir.
  const[landingFunnel]=useState(()=>LF_OVERRIDE||abVariant("landing_funnel",["control","game"],[.7,.3]))
  // Transition phasée accueil → carte/plage (SceneWipe). Jamais si reduced-motion.
  const[wipe,setWipe]=useState(null)
  const fireWipe=useCallback(label=>{
    try{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return}catch(_){}
    setWipe(label)
  },[])
  // Sortie ANIMÉE du hero (audit fluidité 2026-06-11 : le cut brut en 20ms était
  // LE moment « pas fluide » de la 1re impression) : fondu+scale 300ms puis démontage.
  const[heroExiting,setHeroExiting]=useState(false)
  const dismissHero=useCallback(action=>{
    try{sessionStorage.setItem("sg_hero_seen","1")}catch(_){}
    setHeroExiting(true)
    setTimeout(()=>{setShowHero(false);setHeroExiting(false)},300)
    track("sg_hero_dismiss",{action})
  },[])
  // Plage du hero : la plus proche PROPRE si géoloc déjà accordée, sinon le
  // meilleur score du jour. Jamais sans photo réelle (imageMap) ni sans
  // statut live — pas de candidat → pas de hero (la carte reste le 1er écran).
  const heroPick=useMemo(()=>{
    if(!showHero||!allBeaches?.length||!imageMap)return null
    const cands=allBeaches.filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.lat&&b.lng
      &&imageMap[b.id]&&!String(imageMap[b.id]).startsWith("sat-"))
    if(!cands.length)return null
    const cleans=cands.filter(b=>b.status==="clean")
    let pick
    if(userPos&&cleans.length){
      pick=cleans.map(b=>({...b,_d:haversine(userPos.lat,userPos.lng,b.lat,b.lng)})).sort((a,b)=>a._d-b._d)[0]
    }else{
      const pool=cleans.length?cleans:cands
      const sorted=[...pool].sort((a,b)=>(b.score||0)-(a.score||0))
      // Départage « Beau » : à ≤8 pts du meilleur score, ROTATION QUOTIDIENNE
      // uniquement parmi les photos hero-grade (≥85) du peloton — un revenant
      // ne revoit pas le même fond, sans jamais montrer une photo médiocre
      // (vu fl006 resort q70 servi par la v1 de cette rotation). Sinon :
      // meilleure photo dispo, pas de rotation.
      if(imageQ){
        const near=sorted.filter(b=>(sorted[0].score||0)-(b.score||0)<=8)
        const byQ=[...near].sort((a,b)=>(imageQ[b.id]||0)-(imageQ[a.id]||0))
        const heroGrade=byQ.filter(b=>(imageQ[b.id]||0)>=85)
        // Privilégie les plages qui ONT une boucle vidéo (couverture garantie
        // par construction, sans générer 73 loops) ; fallback photo sinon.
        const withVid=heroVids?heroGrade.filter(b=>heroVids.includes(b.id)):[]
        const pool2=(withVid.length?withVid:heroGrade).slice(0,4)
        if(pool2.length>1){const day=Math.floor(Date.now()/864e5);pick=pool2[day%pool2.length]}
        else pick=pool2[0]||byQ[0]
      }else pick=sorted[0]
    }
    return pick?{...pick,_heroImg:"/beaches/"+imageMap[pick.id]}:null
  },[showHero,allBeaches,imageMap,imageQ,heroVids,island,userPos])

  // SargaCatch toast — recycle le trafic en partance (validé user 2026-06-10).
  // Donnée qui justifie (règle "pas de popup sans donnée") : 45 s d'inactivité
  // totale = bounce statistique ; le toast ne coûte rien au funnel. Gates :
  // vue carte, hero fermé, pas de fiche/paywall ouvert, pas premium, 1×/session.
  const[showGameToast,setShowGameToast]=useState(false)
  const gameGateRef=useRef({})
  useEffect(()=>{gameGateRef.current={sheet:!!selectedBeach,premium:showPremium||isPremium,view,hero:showHero}})
  useEffect(()=>{
    let idleT=null
    const fire=trigger=>{
      const g=gameGateRef.current
      if(g.sheet||g.premium||g.hero||g.view!=="map")return
      try{
        if(sessionStorage.getItem("sg_game_toast"))return
        sessionStorage.setItem("sg_game_toast","1")
      }catch(_){return}
      setShowGameToast(true)
      track("sg_game_toast_shown",{trigger})
    }
    const reset=()=>{clearTimeout(idleT);idleT=setTimeout(()=>fire("idle"),45000)}
    const acts=["pointerdown","keydown","touchstart","wheel"]
    acts.forEach(a=>window.addEventListener(a,reset,{passive:true}))
    reset()
    // Exit-intent desktop : souris qui sort par le haut de la fenêtre
    const exitH=e=>{if(e.clientY<=0&&window.matchMedia("(min-width:900px)").matches)fire("exit")}
    document.addEventListener("mouseleave",exitH)
    return()=>{clearTimeout(idleT);acts.forEach(a=>window.removeEventListener(a,reset));document.removeEventListener("mouseleave",exitH)}
  },[])

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

  // Fetch beaches-list.json + sargassum.json + beaches-weather.json in parallel.
  // beaches-weather.json gives per-beach waves/wind/UV/SST from Open-Meteo Marine,
  // refreshed daily by CI. Without it, all 136 beaches share one island-level
  // weather snapshot and the score engine produces identical results (the
  // "tous les scores à 73" bug). With it, the snap passed to computeScore
  // varies per beach, so ranking + label + reason actually differentiate.
  useEffect(()=>{
    Promise.all([
      fetch("/data/beaches-list.json").then(r=>r.json()).catch(()=>null),
      fetch("/api/copernicus/sargassum.json").then(r=>r.json()).catch(()=>null),
      fetch("/api/weather/beaches-weather.json").then(r=>r.json()).catch(()=>null)
    ]).then(([beachData,sargResult,beachWx])=>{
      const perBeachWx=beachWx?.beaches||{}
      // 1. Build full beach list (strip stale status/afai from JSON)
      let beaches=IS_NEW_REGION
        ?REGION.beaches.map(b=>({...b}))   // plages inline de la région (status placeholder jusqu'à la pipeline dédiée)
        :Array.isArray(beachData)&&beachData.length>0
        ?beachData.map(b=>{const{status,afai,...rest}=b;return rest})
        :[...BEACHES_FALLBACK]
      // 2a. Merge sargassum data — nouvelles régions : levels keyés par id de plage
      // (échantillonnage direct par plage par la pipeline multi-régions, pas de
      // mapping SARG_TO_BEACH ni d'interpolation inter-îles MQ/GP). Si le domaine
      // ne sert pas encore de sargassum.json région, sargResult est null → les
      // statuts inline du JSON région restent (placeholder assumé).
      if(sargResult&&IS_NEW_REGION&&Array.isArray(sargResult.levels)){
        const _byId={}
        for(const lvl of sargResult.levels)_byId[lvl.id]=lvl
        const _hasMatch=beaches.some(b=>_byId[b.id])
        if(_hasMatch){ // garde anti-données-étrangères (ex: vieux sargassum.json MQ servi par erreur)
          setSargData(sargResult)
          setDataSource(sargResult?.source||"reference")
          beaches=beaches.map(b=>{
            const lvl=_byId[b.id]
            if(!lvl)return b
            return{...b,afai:lvl.afai,status:statusFromAfai(lvl.afai),_src:"live",beachMemory:lvl.beachMemory||false,afaiSat:lvl.afaiSat}
          })
          // Beach Score 0-100 : météo niveau région (sargResult.weather[<region.id>]) +
          // per-beach weather si le fichier existe pour cette région
          if(sargResult.weather||Object.keys(perBeachWx).length){
            for(let i=0;i<beaches.length;i++){
              const islandW=sargResult.weather?.[beaches[i].island]||{}
              const bw=perBeachWx[beaches[i].id]
              const snap={
                afai:beaches[i].afai,
                wind_speed:bw?.windSpeed??islandW.wind_speed,
                cloud_cover:islandW.cloud_cover,
                uv_index:bw?.uvMax??islandW.uv_index,
                sst:bw?.sst??islandW.sst,
                wave_height:bw?.waveHeight??islandW.wave_height,
                tide_ratio:null,
              }
              if(snap.wave_height==null&&snap.wind_speed==null)continue
              // Raisons dans la langue de la région (en/es) — pas de FR brut sur
              // les sites EN/ES au point de conversion. US : unités impériales.
              const r=_computeBeachScore(snap,lang,US_UNITS)
              beaches[i]={...beaches[i],score:r.score,scoreLabel:r.label,scoreColor:r.color,scoreReason:r.reason,scoreBreakdown:r.breakdown,scoreStrengths:r.strengths||[],scoreWeaknesses:r.weaknesses||[]}
            }
          }
        }
      }
      // 2b. Merge sargassum data MQ/GP (chemin historique strictement inchangé)
      if(sargResult&&!IS_NEW_REGION){
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
          // Beach Score 0-100 — year-round multi-factor (pipeline v3.1+)
          // Per-beach weather from beaches-weather.json (136 unique Open-Meteo points)
          // takes priority; island-level snapshot is the fallback. This is what
          // makes the ranking non-degenerate during clean-ocean / low-AFAI days.
          if(sargResult.weather||Object.keys(perBeachWx).length){
            for(let i=0;i<beaches.length;i++){
              const islandW=sargResult.weather?.[beaches[i].island]||{}
              const bw=perBeachWx[beaches[i].id]
              const snap={
                afai:beaches[i].afai,
                wind_speed:bw?.windSpeed??islandW.wind_speed,
                cloud_cover:islandW.cloud_cover, // Open-Meteo Marine doesn't give cloud; island value stays
                uv_index:bw?.uvMax??islandW.uv_index,
                sst:bw?.sst??islandW.sst,
                wave_height:bw?.waveHeight??islandW.wave_height,
                tide_ratio:null,
              }
              if(snap.wave_height==null&&snap.wind_speed==null)continue
              const r=_computeBeachScore(snap)
              beaches[i]={...beaches[i],score:r.score,scoreLabel:r.label,scoreColor:r.color,scoreReason:r.reason,scoreBreakdown:r.breakdown,scoreStrengths:r.strengths||[],scoreWeaknesses:r.weaknesses||[]}
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

  // Fetch community beach reports (last 48h) — deferred 3s to not compete with critical data.
  // Merges two sources: (1) Apps Script /beach_reports (in-app user reports)
  // and (2) /api/community/fb-reports.json (scraped FB group signals via fb-to-reports.cjs).
  // FB signals are pre-aggregated and gated by a ≥3-reports threshold in rankBeaches to
  // prevent single posts from moving the hero pick.
  useEffect(()=>{
    const t=setTimeout(()=>{
      Promise.all([
        fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=beach_reports").then(r=>r.json()).catch(()=>null),
        fetch("/api/community/fb-reports.json").then(r=>r.json()).catch(()=>null),
        fetch("/api/community/fb-posts.json").then(r=>r.json()).catch(()=>null),
      ]).then(([userData,fbData,fbPostsData])=>{
        const merged={}
        const merge=(src)=>{
          if(!src?.reports)return
          for(const[id,r]of Object.entries(src.reports)){
            if(!merged[id]){merged[id]={avoid:0,moderate:0,clean:0,total:0,samples:[]}}
            merged[id].avoid+=r.avoid||0
            merged[id].moderate+=r.moderate||0
            merged[id].clean+=r.clean||0
            merged[id].total+=r.total||0
            if(r.samples)merged[id].samples.push(...r.samples.slice(0,2))
          }
        }
        merge(userData)
        merge(fbData)
        if(Object.keys(merged).length>0)setCommunityReports(merged)
        if(fbPostsData?.postsByBeach)setFbPosts(fbPostsData.postsByBeach)
      })
    },3000)
    return()=>clearTimeout(t)
  },[])

  // Fetch beaches-images.json — immédiat quand le Hero Verdict va s'afficher
  // (il a besoin de la photo), sinon différé (seulement utile à l'ouverture
  // d'une fiche).
  useEffect(()=>{
    const t=setTimeout(()=>{
      fetch("/data/beaches-images.json")
        .then(r=>r.json())
        .then(data=>{
          if(data&&typeof data==="object")setImageMap(data)
        })
        .catch(()=>{})
      // Score qualité photo (compute-photo-quality.cjs) — optionnel : le hero
      // fonctionne sans, il perd juste le départage « Beau ».
      fetch("/data/beaches-images-quality.json")
        .then(r=>r.json())
        .then(data=>{
          if(data&&typeof data==="object")setImageQ(data)
        })
        .catch(()=>{})
      // Manifest des boucles vidéo hero — optionnel : sans lui, hero photo.
      fetch("/videos/hero/manifest.json")
        .then(r=>r.ok?r.json():null)
        .then(m=>{
          if(m&&Array.isArray(m.ids))setHeroVids(m.ids)
        })
        .catch(()=>{})
    },showHero?0:1500)
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
        if(!rpt||!rpt.total||rpt.total<2)return b // weighted total: 2 = ~2 recent or ~4 week-old
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
      if(isAdding){
        setShowFavToast(true)
        setTimeout(()=>setShowFavToast(false),5500)
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
  const toggleLang=useCallback(()=>setLang(l=>IS_NEW_REGION?(l===REGION.primaryLang?(REGION.secondaryLangs?.[0]||"en"):REGION.primaryLang):(l==="fr"?"en":l==="en"?"es":"fr")),[])
  // Sync document.documentElement.lang when lang changes (SEO + a11y)
  useEffect(()=>{try{if(typeof document!=="undefined")document.documentElement.lang=lang}catch{}},[lang])

  // Filter beaches + sort by distance if GPS available
  const filtered=useMemo(()=>{
    let list=allBeaches.filter(b=>b.island===island)
    // Attach distance from user
    if(userPos){
      list=list.map(b=>({...b,_dist:haversine(userPos.lat,userPos.lng,b.lat,b.lng)}))
    }
    // Search (accent-folding so "sainte anne" matches "Sainte-Anne")
    if(search.trim()){
      const fold=v=>v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      const q=fold(search.trim())
      list=list.filter(b=>fold(b.name).includes(q)||fold(b.commune).includes(q))
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

  // "Next beach" suggestion state — drives browse loop after sheet close
  const[nextSuggestion,setNextSuggestion]=useState(null)
  const nextSuggestTimer=useRef(null)

  const onBeachClick=useCallback(b=>{
    if(!b||!b.id)return
    setSelectedBeach(b);track("sg_beach_open",{beach_id:b.id,status:b.status})
    setNextSuggestion(null) // clear any pending suggestion
    if(nextSuggestTimer.current)clearTimeout(nextSuggestTimer.current)
    // Signal to push auto-loader that user reached a value moment
    try{window.dispatchEvent(new Event("sg:value_moment"))}catch(e){}
    // Auto-dismiss onboarding coachmark on first beach interaction
    if(showOnboarding){setShowOnboarding(false);s("sg_onb",1)}
    // Track beach views for PWA install prompt timing
    const v=parseInt(sessionStorage.getItem("sg_beach_views")||"0")+1
    sessionStorage.setItem("sg_beach_views",String(v))
  },[showOnboarding])
  const closeSheet=useCallback(()=>{
    const closing=selectedBeach
    setSelectedBeach(null)
    // Find nearest CLEAN beach different from the one just closed
    if(closing&&allBeaches.length>0){
      const islandBeaches=allBeaches.filter(b=>b.id!==closing.id&&b.island===closing.island&&b.status==="clean")
      if(islandBeaches.length>0){
        const withDist=islandBeaches.map(b=>({...b,_d:haversine(closing.lat,closing.lng,b.lat,b.lng)}))
        withDist.sort((a,b)=>a._d-b._d)
        const best=withDist[0]
        if(best._d<30){
          setNextSuggestion({beach:best,dist:Math.round(best._d)})
          track("sg_next_suggest_show",{from:closing.id,to:best.id})
          if(nextSuggestTimer.current)clearTimeout(nextSuggestTimer.current)
          nextSuggestTimer.current=setTimeout(()=>setNextSuggestion(null),6000)
        }
      }
    }
  },[selectedBeach,allBeaches])

  const onChangeView=useCallback(v=>{
    track("sg_nav_change",{tab:v})
    if(v==="premium")setShowPremium(true)
    else setView(v)
  },[])

  const openPremium=useCallback((src)=>{const s=src||"nav";setPremiumSource(s);setShowPremium(true);track("sg_premium_modal_open",{source:s})},[])

  // Engagement trigger: modal open rate is 1.72% of sessions — most users never hit a paywall gate.
  // Show modal only to IDLE returning users (no beach-sheet interaction for 50s on visit 2+).
  // Was hijacking active explorers mid-flow, reading as "the app keeps bugging on my 3rd click".
  useEffect(()=>{
    if(isPremium)return
    if(g("sg_visit_count",0)<2)return
    try{if(sessionStorage.getItem("sg_eng_shown"))return}catch{}
    let t=null
    const arm=()=>{
      if(t)clearTimeout(t)
      t=setTimeout(()=>{
        if(document.querySelector(".sheet"))return // user is reading a beach right now
        try{sessionStorage.setItem("sg_eng_shown","1")}catch{}
        openPremium("engagement_50s")
      },50000)
    }
    // Arm ONLY after a real value moment (user opened a beach). Arming on mount
    // turned the modal into a parked-tab interrupt for zero-intent sessions —
    // funnel 2026-06-09: modal opens hit 21% of sessions but modal→CTA = 1%
    // (36 of 3694). Gating on engagement makes the soft upsell land right after
    // the user got value instead of on a cold map stare. Cold-open CTA rate ≈ 0%,
    // so this trims dead opens, not conversions. (feedback_ux_popups.)
    const reset=()=>arm()
    window.addEventListener("sg:value_moment",reset)
    return()=>{if(t)clearTimeout(t);window.removeEventListener("sg:value_moment",reset)}
  },[])

  return(
    <LangCtx.Provider value={lang}>
      <StyleInjector/>
      <AbDebug/>
      <h1 style={{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap"}}>{IS_NEW_REGION?(REGION.primaryLang==="es"?`Sargazo en ${REGION.name} en vivo — mapa de playas hoy`:`${REGION.name} sargassum live — beach map today`):island==="mq"?"Sargasses Martinique en temps réel — carte et plages aujourd'hui":"Sargasses Guadeloupe en temps réel — carte et plages aujourd'hui"}</h1>
      <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>

        {/* CHECKOUT RECOVERY BANNER */}
        {showRecoveryBanner&&(
          <div style={{position:"fixed",top:0,left:0,right:0,zIndex:1500,
            background:"linear-gradient(90deg,#0A1714 0%,#1a2f28 100%)",
            borderBottom:"1px solid rgba(232,168,0,.3)",
            padding:"10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left))",
            paddingTop:"max(10px, calc(10px + env(safe-area-inset-top)))",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            flexWrap:"wrap",
            fontSize:13,color:"#e6edf3",fontFamily:"inherit"}}>
            <span style={{opacity:.9,flex:"1 1 180px",minWidth:0,textAlign:"center"}}>{SARGASSES_SEASON==="high"
              ?_t(lang,"Les plages bougent vite. Tu étais presque Premium — termine maintenant.","Beaches are changing fast. You almost had Premium — finish now.","Las playas cambian rápido. Casi tenías Premium — termina ahora.")
              :_t(lang,"Tu étais presque Premium ! Reprends où tu en étais.","You were almost Premium! Pick up where you left off.","¡Casi tenías Premium! Retoma donde te quedaste.")}</span>
            <button onClick={()=>{
              track("sg_checkout_recovery_click",{island})
              setShowRecoveryBanner(false)
              openPremium("recovery_banner")
            }} style={{background:"#E8A800",color:"#0A1714",border:"none",borderRadius:8,
              padding:"6px 14px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",
              whiteSpace:"nowrap",flexShrink:0}}>
              {_t(lang,"Passer Premium","Go Premium","Hazte Premium")}
            </button>
            <button onClick={()=>{
              track("sg_checkout_recovery_dismiss",{island})
              setShowRecoveryBanner(false)
              localStorage.removeItem("sg_checkout_abandoned")
            }} style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",
              cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px",flexShrink:0}}
              aria-label={_t(lang,"Fermer","Close","Cerrar")}>&times;</button>
          </div>
        )}

        {/* MAP, LIST or GAME — both rendered, visibility toggled for instant switch */}
        <div style={{position:"absolute",inset:0,opacity:view==="map"?1:0,
          pointerEvents:view==="map"?"auto":"none",transition:"opacity .25s ease"}}>
          <ErrBound><Suspense fallback={<div style={{width:"100%",height:"100%",background:"#0A1714"}}/>}>
            <LazyMapView beaches={filtered} island={island} lang={lang}
            onBeachClick={onBeachClick} selectedBeach={selectedBeach} sargData={sargData} userPos={userPos}
            favorites={favorites} allBeaches={allBeaches} onThreatChange={setHasActiveThreat}
            onPremiumClick={openPremium} track={track}
            searchActive={search.trim().length>=2&&filtered.length>0}/>
          </Suspense></ErrBound>
        </div>
        <div style={{position:"absolute",inset:0,opacity:view==="list"?1:0,
          pointerEvents:view==="list"?"auto":"none",transition:"opacity .25s ease"}}>
          <BeachListView beaches={filtered} onBeachClick={onBeachClick}
            favorites={favorites} lang={lang} imageMap={imageMap}/>
        </div>

        {/* HERO VERDICT — premier écran au-dessus de la carte (z 1050 : couvre
            header z700 + contrôles MapView z1000 ["Toute l'île"/Caraïbe],
            sous paywall z1100+). La carte charge derrière pendant la
            lecture → plus de "vide bleu nuit" au premier paint. */}
        {showHero&&heroPick&&(landingFunnel==="game"?(
          <GameFunnel beach={heroPick} lang={lang} island={island} sargData={sargData} userPos={userPos}
            pickBeaches={(allBeaches||[]).filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.score!=null)
              .sort((a,b)=>(b.score||0)-(a.score||0))}
            onOpenBeach={b=>{
              dismissHero("funnel_pick")
              setSelectedBeach(b)
              fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour","0-100 score · updated 4×/day","Score 0-100 · actualizado 4×/día"))
              track("sg_beach_open",{beach_id:b.id,status:b.status,source:"funnel"})
            }}
            onShowMap={()=>{
              dismissHero("funnel_skip")
              fireWipe(_t(lang,"Chaque pastille = la mesure du matin","Every dot = this morning's measurement","Cada punto = la medición de la mañana"))
            }}
            onFav={b=>toggleFav(b.id)}
            onPremium={src=>{dismissHero("funnel");openPremium(src||"funnel_alert")}}
            exiting={heroExiting}/>
        ):(
          <HeroVerdict beach={heroPick} lang={lang} island={island} sargData={sargData} userPos={userPos}
            topBeaches={(allBeaches||[]).filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.score!=null
                &&imageMap?.[b.id]&&!String(imageMap[b.id]).startsWith("sat-"))
              .sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,3)
              .map(b=>({...b,_img:"/beaches/"+imageMap[b.id]}))}
            pickBeaches={(allBeaches||[]).filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.score!=null)
              .sort((a,b)=>(b.score||0)-(a.score||0))}
            onOpen={()=>{
              dismissHero("cta")
              setSelectedBeach(heroPick)
              fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour","0-100 score · updated 4×/day","Score 0-100 · actualizado 4×/día"))
              track("sg_beach_open",{beach_id:heroPick.id,status:heroPick.status,source:"hero"})
            }}
            onOpenBeach={b=>{
              dismissHero("landing_card")
              setSelectedBeach(b)
              fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour","0-100 score · updated 4×/day","Score 0-100 · actualizado 4×/día"))
              track("sg_beach_open",{beach_id:b.id,status:b.status,source:"landing_top3"})
            }}
            onPremium={()=>{dismissHero("premium");openPremium("landing")}}
            onShowMap={()=>{
              dismissHero("map")
              fireWipe(_t(lang,"Chaque pastille = la mesure du matin","Every dot = this morning's measurement","Cada punto = la medición de la mañana"))
            }}
            exiting={heroExiting}/>
        ))}

        {/* TRANSITION PHASÉE accueil → écran suivant (z 1095 : au-dessus du hero, sous paywall) */}
        {wipe&&<SceneWipe label={wipe} onDone={()=>setWipe(null)}/>}

        {/* SARGACATCH TOAST — petit, coin bas, jamais bloquant (z 1090 :
            au-dessus des contrôles carte, sous le paywall z1100). */}
        {showGameToast&&!showHero&&!selectedBeach&&!showPremium&&view==="map"&&(
          <div style={{position:"absolute",bottom:"calc(170px + env(safe-area-inset-bottom, 0px))",left:0,right:0,zIndex:1090,display:"flex",
            justifyContent:"center",pointerEvents:"none",padding:"0 16px"}}>
            <div style={{pointerEvents:"auto",display:"flex",alignItems:"center",gap:10,
              background:"rgba(10,23,20,.94)",border:"1px solid rgba(255,199,44,.4)",borderRadius:16,
              padding:"10px 14px",maxWidth:380,boxShadow:"0 8px 24px rgba(0,0,0,.45)",
              animation:"slideUp .35s cubic-bezier(.22,1,.36,1)"}}>
              <span style={{fontSize:20}}>🌊</span>
              <div style={{flex:1,fontSize:12.5,color:"#fff",lineHeight:1.35}}>
                <b>{_t(lang,"30 secondes à tuer ?","Got 30 seconds?","¿Tienes 30 segundos?")}</b><br/>
                {_t(lang,"Sauve la plage — bats le score du jour","Save the beach — beat today's score","Salva la playa — supera el récord de hoy")}
              </div>
              <a href="/jeu/?utm_source=app&utm_medium=toast" onClick={()=>track("sg_game_toast_click",{})}
                style={{background:"#FFC72C",color:"#0A1714",fontWeight:800,fontSize:12.5,
                  padding:"9px 13px",borderRadius:10,textDecoration:"none",whiteSpace:"nowrap"}}>
                {_t(lang,"Jouer","Play","Jugar")}
              </a>
              <button onClick={()=>{setShowGameToast(false);track("sg_game_toast_dismiss",{})}}
                aria-label={_t(lang,"Fermer","Close","Cerrar")}
                style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",
                  fontSize:17,lineHeight:1,cursor:"pointer",padding:"0 2px"}}>×</button>
            </div>
          </div>
        )}

        {/* TOP FLOATING — Header pill only. Transparent over map so the full
            viewport reads as the map. Chrome is capped at 600px centered. */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:700,
          padding:`calc(max(12px, env(safe-area-inset-top)) + ${showRecoveryBanner?64:(showPushPrimer?58:0)}px) 16px 0`,
          pointerEvents:"none",
          transition:"padding-top .25s ease",
        }}>
          {/* Header chrome follows the same pattern as sg-map-chrome:
              wrapper pe:none so the empty band between pill-items passes
              clicks to the map, and only direct children (the pills) absorb
              clicks. The previous inline-block+width:100% wrapper was a
              460×88 click-blocker covering the top of the map, making pins
              in that band unclickable on both mobile and desktop. */}
          <div className="sg-header-chrome" style={{maxWidth:460,margin:"0 auto",pointerEvents:"none"}}>
            <style>{`.sg-header-chrome .sg-header-row{pointer-events:none}.sg-header-chrome .sg-header-row > *{pointer-events:auto}`}</style>
            <Header island={island} onIslandChange={setIsland}
              lang={lang} onLangToggle={toggleLang}
              theme={theme} onThemeToggle={toggleTheme}
              beachCount={allBeaches.length} dataSource={dataSource}
              updatedAt={sargData?.updatedAt||sargData?.erddapTimestamp}
              onHome={()=>{
                try{sessionStorage.removeItem("sg_hero_seen")}catch(_){}
                setSelectedBeach(null);setShowHero(true)
                track("sg_landing_replay",{})
              }}/>
          </div>
        </div>

        {/* BOTTOM SHEET (over map) — search stack above the floating nav pill.
            Fixes 2026-04-17 (long-standing bug):
            (1) Bottom offset now `90px + ...` (was 60+12+12=84) so the search
                card clears the floating nav pill (itself at bottom:18 + ~55px
                tall = ~73 top) with a visible ~15-20px gap.
            (2) Inner container max-width 460px instead of 600 so the invisible
                pointerEvents:auto hitbox doesn't eat clicks on beach pins
                flanking the search zone (user screenshot confirmed pins beneath
                the search card were unclickable in some zones). */}
        {view==="map"&&(
          <div style={{
            position:"absolute",left:0,right:0,zIndex:700,
            bottom:"calc(90px + max(12px, env(safe-area-inset-bottom,0px)) + 8px)",
            padding:"0 16px",
            pointerEvents:"none",
            maxHeight:"calc(100vh - 140px)",
          }}>
            {/* Wrapper no longer has pointerEvents:auto — it would block
                clicks on pins flanking the search band horizontally even at
                460px. Only the visible child (search input / results dropdown)
                catches clicks via explicit pointerEvents:auto on each. */}
            <div className="sg-map-chrome" style={{maxWidth:460,margin:"0 auto",pointerEvents:"none",
              display:"flex",flexDirection:"column",gap:8}}>
              <style>{`.sg-map-chrome > *{pointer-events:auto}`}</style>
              {/* Search results dropdown — shown when typing, floats above the stack */}
              {search.trim().length>=2&&filtered.length>0&&(
                <div style={{background:"var(--sg-card,#fff)",borderRadius:14,
                  boxShadow:"0 12px 32px rgba(0,0,0,.18)",border:"1px solid var(--sg-border,rgba(0,0,0,.06))",
                  maxHeight:"min(280px,40vh)",overflowY:"auto",overscrollBehavior:"contain"}}>
                  {filtered.slice(0,8).map(b=>{
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
                        <span style={{fontSize:10,fontWeight:700,color:st.c}}>{lang==="es"?st.les:lang==="en"?st.le:st.l}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {/* Carte = map vivante + radar time-slider. Le pick hero vit sur l'onglet Plages.
                  Focal element = le slider temporel dans MapView.jsx (buildRadarFrames). */}
              <SearchBar value={search} onChange={setSearch} lang={lang}/>
            </div>
          </div>
        )}

        {/* PUSH PRIMER — contextual soft prompt before native OneSignal dialog.
            Triggered 1.5s after first beach_open. Dismissable. 7-day cooldown. */}
        {showPushPrimer&&(
          <PushPrimer lang={lang} onAccept={onPushPrimerAccept} onDismiss={onPushPrimerDismiss}/>
        )}

        {/* DAILY RECO STRIP — disabled 2026-04-12. HeroReco at the top now delivers the
            same value (top pick + 2 alts) without the bottom-of-screen duplication.
            Kept as component for potential per-view re-use but not rendered. */}

        {/* SeasonBanner removed — "saison active" doesn't help decide beach visit */}

        {/* NEXT BEACH SUGGESTION — browse loop after closing a beach sheet.
            Same bottom-offset fix as the search stack (2026-04-17): 60→90 so
            this pill clears the floating nav pill with a visible gap. */}
        {nextSuggestion&&!selectedBeach&&view==="map"&&(
          <div style={{position:"fixed",
            bottom:"calc(90px + max(12px, env(safe-area-inset-bottom,0px)) + 8px)",
            left:"max(12px, 3vw)",right:"max(12px, 3vw)",zIndex:710,
            maxWidth:480,margin:"0 auto",
            animation:"slideUp .35s cubic-bezier(.22,1,.36,1)"}}>
            <button onClick={()=>{
              track("sg_next_suggest_click",{beach_id:nextSuggestion.beach.id})
              const b=nextSuggestion.beach
              setNextSuggestion(null)
              onBeachClick(b)
            }} style={{
              display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
              background:"var(--sg-card,#fff)",borderRadius:16,width:"100%",
              border:"1.5px solid rgba(34,197,94,.25)",cursor:"pointer",
              boxShadow:"0 4px 20px rgba(0,0,0,.10)",fontFamily:"inherit",textAlign:"left",
            }}>
              <div style={{width:10,height:10,borderRadius:5,background:C.green,flexShrink:0,
                animation:"dot-pulse 2s ease-in-out infinite"}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {nextSuggestion.beach.name}
                  <span style={{fontWeight:500,color:C.green,marginLeft:6}}>
                    {_t(lang,"est propre","is clean","está limpia")}
                  </span>
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:1}}>
                  {nextSuggestion.dist} km {_t(lang,"d'ici","away","de aquí")}
                </div>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:C.green,flexShrink:0}}>
                {_t(lang,"Voir","View","Ver")}
              </span>
            </button>
            <button onClick={()=>setNextSuggestion(null)} style={{
              position:"absolute",top:-8,right:-4,width:28,height:28,borderRadius:14,
              background:"var(--sg-card,#fff)",border:"1px solid var(--sg-border)",
              cursor:"pointer",fontSize:12,color:"var(--sg-mid)",
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
              ✕
            </button>
          </div>
        )}

        {/* LEARN VIEW — educational tunnel */}
        {view==="learn"&&<LearnView lang={lang} onBack={()=>setView("map")} onGoMap={()=>setView("map")}/>}

        {/* BOTTOM NAV */}
        <BottomNav view={view} onChangeView={onChangeView} lang={lang}/>

        {/* BOTTOM SHEET (beach detail) */}
        {selectedBeach&&(
          <BeachSheet beach={selectedBeach} onClose={closeSheet}
            favorites={favorites} onToggleFav={toggleFav} lang={lang}
            allBeaches={allBeaches} imageMap={imageMap}
            onBeachClick={onBeachClick} onPremiumClick={openPremium} isPremium={isPremium}
            historyData={historyData} sargData={sargData}
            dataSource={dataSource} userPos={userPos} communityReports={communityReports} fbPosts={fbPosts}/>
        )}

        {/* PREMIUM MODAL */}
        {showPremium&&<PremiumModal onClose={()=>setShowPremium(false)} lang={lang} source={premiumSource}
          onActivated={()=>{setIsPremium(true);setShowWelcome(true)}} sargData={sargData} island={island}/>}

        {/* First-visit hint removed — the Hero peek card now carries the same
            affordance ("Plage de la Française · Voir →") without competing with
            it visually, and the toast was overlapping the peek at every
            breakpoint after the map-first layout shift. */}

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
        <FavToast show={showFavToast} lang={lang} onPremiumClick={openPremium} isPremium={isPremium}/>

        {/* SARGACHAT — assistant guidé statique (réponses = donnée live, arbre fermé) */}
        {!showHero&&!showPremium&&!showChat&&(
          <button onClick={()=>{setShowChat(true);track("sg_chat_open",{})}} aria-label={_t(lang,"Assistant","Assistant","Asistente")}
            style={{position:"fixed",right:14,bottom:"calc(166px + env(safe-area-inset-bottom))",zIndex:960,
              width:46,height:46,borderRadius:"50%",background:"#0D1E1C",border:"1.5px solid rgba(255,199,44,.55)",
              fontSize:19,cursor:"pointer",boxShadow:"0 6px 20px rgba(0,0,0,.4)",display:"flex",
              alignItems:"center",justifyContent:"center",
              animation:"viewFadeIn .35s cubic-bezier(.22,1,.36,1) both"}}>💬</button>
        )}
        {showChat&&<SargaChat lang={lang} allBeaches={allBeaches} island={island} sargData={sargData}
          onOpenBeach={onBeachClick} onPremium={()=>openPremium("chat")} onClose={()=>setShowChat(false)}/>}

        {/* REFERRAL LANDING BANNER — hidden if Welcome toast is showing to avoid overlap */}
        {showReferralBanner&&!showWelcome&&(
          <div onClick={()=>{openPremium("referral_banner");setShowReferralBanner(false)}} style={{position:"fixed",bottom:"calc(104px + env(safe-area-inset-bottom, 0px))",left:"50%",transform:"translateX(-50%)",
            zIndex:1300,background:"linear-gradient(135deg,#7C3AED,#A855F7)",color:"#fff",
            padding:"12px 20px",borderRadius:14,fontSize:13,fontWeight:600,
            boxShadow:"0 8px 24px rgba(124,58,237,.35)",cursor:"pointer",
            display:"flex",alignItems:"center",gap:10,maxWidth:"min(90vw, 460px)",boxSizing:"border-box",
            animation:"slideUp .4s ease"}}>
            <span style={{fontSize:20}}>🎁</span>
            <div>
              <div>{_t(lang,"Recommandé par un ami","Recommended by a friend","Recomendado por un amigo")}</div>
              <div style={{fontSize:10,fontWeight:400,opacity:.85,marginTop:2}}>
                {_t(lang,"Appuie pour essayer premium gratuitement","Tap to start your free premium trial","Toca para probar premium gratis")}
              </div>
            </div>
            <button aria-label="Close" onClick={e=>{e.stopPropagation();setShowReferralBanner(false)}} style={{
              background:"rgba(255,255,255,.2)",border:"none",color:"#fff",
              borderRadius:12,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",fontSize:16,marginLeft:8}}>✕</button>
          </div>
        )}

        {/* PREMIUM WELCOME TOAST */}
        {showWelcome&&(
          <div style={{position:"fixed",bottom:"calc(104px + env(safe-area-inset-bottom, 0px))",left:"50%",transform:"translateX(-50%)",
            zIndex:1400,background:"linear-gradient(135deg,#009E8E,#1EC8B0)",color:"#fff",
            padding:"14px 24px",borderRadius:16,fontSize:14,fontWeight:600,
            boxShadow:"0 8px 24px rgba(0,158,142,.35)",
            display:"flex",alignItems:"center",gap:10,maxWidth:"min(90vw, 460px)",boxSizing:"border-box",
            animation:"slideUp .4s ease"}}>
            <span style={{fontSize:22}}>🎉</span>
            <div>
              <div>{_t(lang,"Premium activé !","Premium activated!","¡Premium activado!")}</div>
              <div style={{fontSize:11,fontWeight:400,opacity:.85,marginTop:2}}>{_t(lang,"Brief matin + alertes + reco du jour.","Morning brief + alerts + daily pick.","Brief matinal + alertas + pick del día.")}</div>
              <a href="?manage=1" onClick={e=>{e.stopPropagation();track("sg_manage_click")}} style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:3,display:"inline-block"}}>{_t(lang,"Gérer mon abonnement","Manage my subscription","Gestionar mi suscripción")}</a>
            </div>
            <button aria-label="Close" onClick={()=>setShowWelcome(false)} style={{
              background:"rgba(255,255,255,.2)",border:"none",color:"#fff",
              borderRadius:12,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",fontSize:16,marginLeft:8}}>✕</button>
          </div>
        )}
      </div>
    </LangCtx.Provider>
  )
}
