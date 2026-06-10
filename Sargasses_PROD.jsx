/**
 * SARGASSES — Reboot from scratch (4 avril 2026)
 * "Cette fois, tu seras prévenu."
 *
 * Architecture : Map-first, data-driven (Clarity — 25% clics = carte)
 * Stack : React 18 · Leaflet · Bricolage Grotesque + Anton · Open-Meteo
 */
import React,{useState,useEffect,useRef,useMemo,useCallback,createContext,useContext,Component,Suspense,lazy}from"react"
import {computeScore as _computeBeachScore} from "./src/lib/score.js"

const LazyMapView=lazy(()=>import("./src/MapView"))

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

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXT
   ═══════════════════════════════════════════════════════════════════════════ */
const LangCtx=createContext("fr")
export function useLang(){return useContext(LangCtx)||"fr"}
function getLang(){try{const _d=IS_NEW_REGION?REGION.primaryLang:"fr";if(typeof window==="undefined")return _d;const p=window.location.pathname;if(p.startsWith("/es"))return"es";if(p.startsWith("/en"))return"en";return _d}catch{return IS_NEW_REGION?REGION.primaryLang:"fr"}}
/* i18n inline helper — returns fr/en/es string based on current lang */
function _t(lang,fr,en,es){return lang==="es"?es:lang==="en"?en:fr}

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
    clean:"Limpia",moderate:"Moderado",avoid:"Alerta",
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
    forecastDisclaimer:anyArrival
      ?"Banc detecte pres des plages voisines — risque de derive."
      :"Interpolation des plages voisines surveillees.",
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
  const dateStr=updatedAt?new Date(updatedAt).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"numeric",month:"short"}):null
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
          <div style={{marginTop:4,opacity:.7,fontSize:10}}>{lang==="en"?"Method":"Méthode"} · {methodLabel}</div>
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
      <span>🛰️ {LL.sciFooter}</span>
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
  const lockCTA=lang==="en"?"Unlock forecast":"Débloquer"
  const lockSub=lang==="en"?"+ morning brief & alerts · 7 days free":"+ brief matin & alertes · 7j gratuit"
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
                {d.day}
              </span>
              {fConf!=null&&!isLocked&&<span style={{fontSize:8,color:"var(--sg-mid,#999)",fontWeight:600}}>{fConf}%</span>}
            </div>
          )
        })}
      </div>
      <div style={{fontSize:9,color:"var(--sg-mid,#999)",textAlign:"center",padding:"4px 0 0",lineHeight:1.3}}>
        {lang==="en"
          ?`Reliable up to 4 days. ${Math.round(firstConf)}% confidence tomorrow.`
          :`Fiable jusqu'a 4 jours. Fiabilite ${Math.round(firstConf)}% demain.`}
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
          {lang==="en"?"Next days:":"Jours suivants :"}
        </span>
        <div style={{display:"flex",gap:6,flex:1}}>
          {lockedDays.map((d,i)=>{
            const st=ST[d.status]||ST._loading
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:3,filter:"blur(3px)",opacity:.65,pointerEvents:"none"}}>
                <div style={{width:7,height:7,borderRadius:2,background:st.c,flexShrink:0}}/>
                <span style={{fontSize:9,fontWeight:700,color:st.c}}>{d.day}</span>
              </div>
            )
          })}
        </div>
        <span style={{fontSize:10,fontWeight:700,color:"var(--sg-mid,#686868)",flexShrink:0}}>
          {lang==="en"?"Unlock →":"Voir →"}
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
            {counts.rawTotal||Math.round(total)} {lang==="en"?"report"+((counts.rawTotal||total)>1?"s":""):"signalement"+((counts.rawTotal||total)>1?"s":"")}
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
      if(h<1)return lang==="en"?"just now":"à l'instant"
      if(h<24)return (lang==="en"?`${h}h ago`:`il y a ${h}h`)
      const days=Math.round(h/24)
      return lang==="en"?`${days}d ago`:`il y a ${days}j`
    }catch{return""}
  }
  return(
    <div style={{margin:"14px 0 4px",padding:"12px 14px",borderRadius:14,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
        <span>📷</span>
        {lang==="en"?`${posts.length} recent visitor ${posts.length>1?"reports":"report"} (Facebook)`:`${posts.length} retour${posts.length>1?"s":""} visiteur${posts.length>1?"s":""} récent${posts.length>1?"s":""} (Facebook)`}
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
              💬 {p.commentSample}{p.commentCount>1?` · +${p.commentCount-1} ${lang==="en"?"more":"autres"}`:""}
            </div>
          )}
          <a href={p.sourceUrl} target="_blank" rel="noopener nofollow" style={{
            display:"inline-block",marginTop:6,fontSize:10,color:"var(--sg-mid)",textDecoration:"none",
            borderBottom:"1px dashed rgba(0,0,0,.15)"}}>
            {lang==="en"?"view on Facebook →":"voir sur Facebook →"}
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
function BeachSheet({beach,onClose,favorites,onToggleFav,lang,allBeaches,imageMap,onBeachClick,onPremiumClick,isPremium,historyData,sargData,dataSource,userPos,communityReports,fbPosts}){
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

  // Escape key to close
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose()}
    document.addEventListener("keydown",h)
    return()=>document.removeEventListener("keydown",h)
  },[onClose])

  const wazeUrl=`https://waze.com/ul?ll=${beach.lat},${beach.lng}&navigate=yes`

  return(
    <>
      <div className="backdrop" onClick={onClose}/>
      <div className="sheet" ref={sheetRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet-handle"/>

        {/* Photo hero — immersive */}
        <div style={{height:"min(300px, 38vh)",background:`url(${bgImage}) center 40%/cover`,
          borderRadius:"0",position:"relative",overflow:"hidden"}}>
          {/* Cinematic gradient overlay */}
          <div style={{position:"absolute",inset:0,
            background:"linear-gradient(180deg, rgba(0,0,0,.15) 0%, transparent 30%, transparent 50%, var(--sg-card,#fff) 100%)"}}/>
          {/* Status glow — colored ambient light based on beach status */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",
            background:`radial-gradient(ellipse at 50% 100%, ${(ST[beach.status]||ST._loading).c}22 0%, transparent 70%)`,
            pointerEvents:"none"}}/>
          {/* Close button */}
          <button onClick={onClose} aria-label={lang==="en"?"Close":"Fermer"} style={{position:"absolute",top:12,right:12,
            width:44,height:44,borderRadius:22,
            background:"rgba(0,0,0,.3)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,.15)",color:"#fff",fontSize:16,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          {/* Fav button on photo */}
          <button onClick={e=>{onToggleFav(beach.id);e.currentTarget.classList.remove("heart-pop");void e.currentTarget.offsetWidth;e.currentTarget.classList.add("heart-pop")}}
            aria-label={isFav?(lang==="en"?"Remove from favourites":"Retirer des favoris"):(lang==="en"?"Add to favourites":"Ajouter aux favoris")}
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
              {lang==="en"?(ST[beach.status]||ST._loading).le:(ST[beach.status]||ST._loading).l}
            </span>
          </div>
        </div>

        <div style={{padding:"0 20px calc(70px + env(safe-area-inset-bottom,12px))"}}>
          {/* Name — large, no duplicate status badge (already on photo) */}
          <h2 className="anton" style={{fontSize:"clamp(24px,6vw,30px)",margin:"0 0 4px",lineHeight:1.15,
            color:"var(--sg-ink)"}}>{beach.name}</h2>
          <p style={{fontSize:13,color:"var(--sg-mid,#686868)",margin:"0 0 12px",
            display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span>{beach.commune}</span>
            <span style={{width:3,height:3,borderRadius:2,background:"var(--sg-mid,#999)",opacity:.5}}/>
            <span>{beach.drive} {LL.drive}</span>
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
                <div style={{position:"relative",width:80,height:80,flexShrink:0}}>
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
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="anton" style={{fontSize:21,lineHeight:1.05,color:beach.scoreColor,
                    letterSpacing:"-.015em",textTransform:"uppercase"}}>
                    {beach.scoreLabel}
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

          {/* Email capture — above the fold, before forecast teaser */}
          <InlineEmailCapture lang={lang}/>

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
                  {lang==="en"?"Tomorrow forecast":"Prévision demain"}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>
                    {beach.name}
                  </span>
                  <span style={{filter:"blur(6px)",userSelect:"none",fontSize:13,fontWeight:700,
                    color:ST[forecast[1].status]?.c||"#999"}}>{lang==="en"?ST[forecast[1].status]?.le:ST[forecast[1].status]?.l||"?"}</span>
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:4}}>
                  {lang==="en"?"Unlock with free trial":"Débloquer · 7 jours gratuit"}
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
              if(navigator.share){track("sg_share",{beach_id:beach.id,method:"native",has_referral:isRef});navigator.share({title:beach.name+" — Sargasses",text:(ST[beach.status]||ST._loading).l+" aujourd'hui",url}).catch(()=>{})}
              else{navigator.clipboard?.writeText(url);track("sg_share",{beach_id:beach.id,has_referral:isRef})}
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
                  {lang==="en"?"Tap to compare":"Compare"}
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
                          backdropFilter:"blur(4px)"}}>{nst.e} {lang==="en"?nst.le:nst.l}</span>
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

          {/* Forecast confidence + source (credibility) */}
          {weeklyData&&<ForecastCredibility weeklyData={weeklyData} lang={lang} sargData={sargData}/>}

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
          {lang==="en"?`beaches · ${nClean} clean`:`plages · ${nClean} propres`}
        </span>
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
                  {b.commune} · {b.drive} {LL.drive}
                </div>
                <div style={{fontSize:10,fontWeight:800,marginTop:4,letterSpacing:".03em",
                  textTransform:"uppercase",color:scoreColor}}>
                  {hasScore?(b.scoreLabel||(lang==="en"?st.le:st.l)):(lang==="en"?st.le:st.l)}
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
                {IS_NEW_REGION?`${REGION.beaches.length} beaches`:isMQ?"53 plages":"82 plages"}
              </em> {lang==="en"?"monitored live":"surveillées en temps réel"}
            </span>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(20px,5.5vw,26px)",lineHeight:1,
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
      const isl=window.location.hostname.includes("guadeloupe")?"GP":"MQ"
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
    if(top._arrivalDetected&&top.status==="clean")return lang==="en"?"Clean · bank approaching":"Propre · banc en approche"
    if(top._fc1&&top._fc1.status&&top._fc1.status!=="clean"&&top.status==="clean"){
      return lang==="en"?`Clean today, ${top._fc1.status} tomorrow`:`Propre aujourd'hui, ${top._fc1.status==="moderate"?"modéré":"alerte"} demain`
    }
    if(top.beachMemory)return lang==="en"?"Recent beaching — verify":"Mémoire échouage — vérifie"
    if(top.status==="clean")return lang==="en"?"Clean & stable":"Propre et stable"
    if(top.status==="moderate")return lang==="en"?"Moderate — best option today":"Modéré — meilleure option du jour"
    return lang==="en"?"Best compromise today":"Meilleur compromis aujourd'hui"
  })()

  // Distance & drive labels
  const distLbl=top._dist!=null
    ?(top._dist<1?`${Math.round(top._dist*1000)} m`:`${Math.round(top._dist)} km`)
    :null
  const driveLbl=typeof top.drive==="number"?`${top.drive} min`:null

  const greet=(()=>{
    const h=new Date().getHours()
    if(h<12)return lang==="en"?"This morning":"Ce matin"
    if(h<18)return lang==="en"?"Right now":"Maintenant"
    return lang==="en"?"Tonight":"Ce soir"
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
    if(diffMin<60)return lang==="en"?`${diffMin} min ago`:`il y a ${diffMin} min`
    const h=Math.round(diffMin/60)
    if(h<24)return lang==="en"?`${h}h ago`:`il y a ${h}h`
    return lang==="en"?"today":"aujourd'hui"
  })()
  const coverageLbl=withScore.length>0
    ?(lang==="en"?`${withScore.length} beaches`:`${withScore.length} plages`)
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
          <span>{lang==="en"?`Updated ${freshLbl}`:`MAJ ${freshLbl}`}</span>
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
        aria-label={heroCollapsed?(lang==="en"?"Expand":"Déplier"):(lang==="en"?"Collapse":"Réduire")}
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
        /* Peek mode — compact single row, ~70px tall. Everything else hidden
           so the map gets ~240px back. Tap opens the beach sheet (same contract
           as expanded main button). */
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
            {lang==="en"?"Take me →":"J'y vais →"}
          </span>
        </button>
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
            {withScore.length} {lang==="en"?"analyzed":"analysées"} · Δ{variance}
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
          {lang==="en"?"Go →":"Voir →"}
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
            {lang==="en"?"Skip":"Évite"}
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
            placeholder={lang==="en"?"email — daily pick at 7am":"ton@email — ma reco à 7h"}
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
            ✓ {lang==="en"?"You're in! First pick tomorrow 7am.":"C'est fait ! Ta reco demain à 7h."}
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
              {lang==="en"?"Want live alerts too? See Premium →":"Alertes en direct aussi ? Voir Premium →"}
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
      return lang==="en"?"Clean now — sargassum bank approaching":"Propre mais banc en approche"
    }
    // v3.1: if we have a unified score reason (FR only for now), use it
    if(top.scoreReason&&lang==="fr"&&!top.beachMemory&&top.status==="clean"){
      return top.scoreReason
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
              ?(lang==="en"?`Best beach today · ${top.scoreLabel||""}`:`Meilleure plage aujourd'hui · ${top.scoreLabel||""}`)
              :(lang==="en"?"Best beach now":"Ta meilleure plage maintenant")}
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
  const _cleanCount=_islandLvls.filter(b=>b.score>=70).length
  const _totalCount=_islandLvls.length
  const _topBeach=[..._islandLvls].sort((a,b)=>b.score-a.score)[0]
  const _topName=_topBeach?.id?.replace(/^gp-/,"").split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")||null
  const _topScore=_topBeach?.score||null
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
  const[plan,setPlan]=useState("monthly")
  const headline=lang==="en"?"Your daily pick every morning at 7am":"Ta reco chaque matin à 7h"
  // effectivePlan is what we ship to Stripe on CTA click. Fallback chain:
  //   pro → annual → monthly, only if Stripe Link is configured for that tier.
  const effectivePlan=
    (plan==="pro"&&hasPro)?"pro"
    :(plan==="annual"&&hasAnnual)?"annual"
    :"monthly"
  const stripeLinkFor={monthly:LINK_MONTHLY,annual:LINK_ANNUAL,pro:LINK_PRO}
  // A/B test pw_cta_order KILLED 2026-06-09 (scheduled ab-evaluate run).
  // Hypothesis (sample-first reduces the 85% paywall dismiss) was falsified:
  // sg_sample_start fired 0 times across 10,738 sessions over ~7 weeks, with
  // sampleAvailable=true for every fresh visitor. The sample CTA was shown and
  // ignored. Hardcoded to control (paid-first, original) — removes the unused
  // sample button (clutter) and stops fragmenting traffic. sample_first JSX
  // branches below now render nothing; dead-code cleanup deferred to a session
  // where the paywall modal can be visually verified.
  const ctaOrder="control"
  const sampleAvailable=!localStorage.getItem("sg_sample_used")&&!localStorage.getItem("sg_sample_until")
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
    const fmt=d=>d.toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"numeric",month:"long"})
    return{remind:fmt(remindDate),charge:fmt(chargeDate)}
  })()
  // Seasonal urgency — sargassum season is April-September
  const now=new Date()
  const seasonStart=new Date(now.getFullYear(),3,20) // ~20 April
  const daysToSeason=Math.max(0,Math.ceil((seasonStart-now)/(1000*60*60*24)))
  const seasonMsg=daysToSeason>0
    ?(lang==="en"?`Season starts in ${daysToSeason} days`:`La saison commence dans ${daysToSeason} jours`)
    :(lang==="en"?"Sargassum season is here":"La saison des sargasses est là")
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
          aria-label={lang==="en"?"Close":"Fermer"}
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
              aria-label={lang==="en"?"Back":"Retour"}
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
              aria-label={lang==="en"?"Close":"Fermer"}
              onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"prelude_close"});onClose()}}
              style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.08)",
                border:"none",color:"rgba(255,255,255,.85)",fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"inherit"}}>×</button>
          </div>

          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10.5,color:"#14C4B0",
            letterSpacing:".18em",textTransform:"uppercase",marginBottom:8}}>
            {lang==="en"?"Before we redirect you":"Avant de te rediriger"}
          </div>
          <h2 style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1.05,letterSpacing:"-.01em",color:"#fff",margin:"0 0 14px"}}>
            {lang==="en"?<>Here's exactly<br/>what happens.</>:<>Voilà exactement<br/>ce qui se passe.</>}
          </h2>

          {/* Plan summary card */}
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:16,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,
              paddingBottom:12,borderBottom:"1px solid rgba(255,255,255,.08)",marginBottom:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>
                  {effectivePlan==="annual"?(lang==="en"?"Annual · 7 days free":"Annuel · 7 jours offerts"):(lang==="en"?"Monthly · 7 days free":"Mensuel · 7 jours offerts")}
                </div>
                <div style={{fontWeight:500,color:"rgba(255,255,255,.55)",fontSize:11,marginTop:2}}>
                  {effectivePlan==="annual"?(REGION_PAY?`Then ${PRICE_YR}/yr · cancel anytime`:lang==="en"?"Then €39.99/yr · cancel anytime":"Puis 39,99 €/an · annule en 1 clic"):(REGION_PAY?`Then ${PRICE_MO}/mo · cancel anytime`:lang==="en"?"Then €4.99/mo · cancel anytime":"Puis 4,99 €/mois · annule en 1 clic")}
                </div>
              </div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"#FFC72C",letterSpacing:"-.01em",textAlign:"right"}}>
                {REGION_PAY?"$0":"0 €"}
                <div style={{fontFamily:"inherit",fontWeight:500,fontSize:11,color:"rgba(255,199,44,.7)",marginTop:2,letterSpacing:0}}>
                  {lang==="en"?"today":"aujourd'hui"}
                </div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12.5}}>
              {[
                {k:lang==="en"?"Today":"Aujourd'hui",v:REGION_PAY?"$0 · 7-day trial starts":lang==="en"?"€0 · 7-day trial starts":"0 € · tu testes 7 jours"},
                {k:_preludeDates.remind,v:lang==="en"?"Reminder · 2 days before first charge":"Rappel · 2 jours avant la 1re charge"},
                {k:_preludeDates.charge,v:effectivePlan==="annual"?(REGION_PAY?`${PRICE_YR} · unless you cancel`:lang==="en"?"€39.99 · unless you cancel":"39,99 € · sauf si tu annules"):(REGION_PAY?`${PRICE_MO} · unless you cancel`:lang==="en"?"€4.99 · unless you cancel":"4,99 € · sauf si tu annules")},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:"rgba(255,255,255,.72)"}}>{r.k}</span>
                  <span style={{color:"#fff",fontWeight:600,textAlign:"right"}}>{r.v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                paddingTop:8,borderTop:"1px dashed rgba(255,255,255,.12)",marginTop:2}}>
                <span style={{color:"rgba(255,255,255,.72)"}}>{lang==="en"?"Due today":"À payer aujourd'hui"}</span>
                <span style={{color:"#22C55E",fontFamily:"'Anton',sans-serif",fontSize:15,letterSpacing:"-.01em"}}>{REGION_PAY?"$0.00":"0,00 €"}</span>
              </div>
            </div>
          </div>

          {/* Trust row 3 columns */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
            {[
              {icon:"🛡",title:"Stripe",sub:REGION_PAY?"Secure payment":lang==="en"?"EU secure payment":"Paiement sécurisé EU"},
              {icon:"⏱",title:lang==="en"?"30 days":"30 jours",sub:lang==="en"?"Money-back":"Satisfait ou remboursé"},
              {icon:"✕",title:lang==="en"?"1 click":"1 clic",sub:lang==="en"?"Cancel anytime":"Annule quand tu veux"},
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

          {/* Continue to Stripe CTA — THE actual redirect */}
          <button onClick={()=>{
            const link=stripeLinkFor[effectivePlan]||LINK_MONTHLY
            track("sg_checkout_redirect",{plan:effectivePlan,source:source||"unknown",destination:"payment_link",via:"prelude"})
            setTimeout(()=>{window.location.href=link},0)
          }} className="gbtn" style={{width:"100%",padding:14,borderRadius:14,border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,lineHeight:1.15,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {lang==="en"?"Continue to Stripe":"Continuer vers Stripe"} →
          </button>
          <div style={{textAlign:"center",fontSize:10.5,color:"rgba(255,255,255,.48)",marginTop:10}}>
            {lang==="en"?"You can always come back.":"Tu pourras toujours revenir en arrière."}
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

        <h2 className="anton" style={{fontSize:"clamp(22px,6vw,28px)",color:"#fff",marginBottom:18,lineHeight:1.1,letterSpacing:"-.015em"}}>
          {lang==="en"?(<>Your <span style={{background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",color:"transparent"}}>daily pick</span> every morning at 7am</>)
                      :(<>Ta <span style={{background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",color:"transparent"}}>reco</span> chaque matin à 7h</>)}
        </h2>

        {/* Sample-first variant swap: lean bullets in place of value cards.
            Hypothesis (Design v1): users arriving at the paywall because they hit
            a soft lock may not need to be SOLD the features — they need permission
            to try for free without fear of a card/email trap. Tight 3-bullet list
            removes 150px of "product pitch" and reinforces zero-friction framing.
            Control variant keeps the 3 value cards (product pitch). */}
        {ctaOrder==="sample_first"&&sampleAvailable&&(
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
          {[
            {emoji:"🎁",bold:lang==="en"?"24h free":"24h offertes",tail:lang==="en"?" · no card, no email trap":" · sans carte, sans email piège"},
            {emoji:"📬",bold:null,tail:lang==="en"?"Email tomorrow at 7:57 am":"Email demain matin à 7h57"},
            {emoji:"🔓",bold:null,tail:lang==="en"?"Cancel in 1 tap if you don't like it":"Annule en 1 tap si tu n'aimes pas"},
          ].map((b,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:13,
              color:"rgba(255,255,255,.85)",padding:"6px 0"}}>
              <span style={{fontSize:17,width:22,display:"inline-block",textAlign:"center"}}>{b.emoji}</span>
              <span>{b.bold&&<b style={{color:"#fff",fontWeight:700}}>{b.bold}</b>}{b.tail}</span>
            </div>
          ))}
        </div>
        )}

        {/* Value cards stack (control variant only) — wrapped in a relative
            container so we can lay a soft gold halo behind all 3 cards. Why:
            the dark modal needs one warm focal area to anchor the eye on the
            promise. */}
        {(ctaOrder!=="sample_first"||!sampleAvailable)&&(
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
                {lang==="en"?"EVERY MORNING · 7AM":"CHAQUE MATIN · 7H"}
              </div>
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {_topName
                  ?(lang==="en"?`Your best beach today: ${_topName}`:`Ta meilleure plage : ${_topName}`)
                  :(lang==="en"?"Your best beach today: Anse Dufour":"Ta meilleure plage : Anse Dufour")}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {_topScore
                  ?(lang==="en"?`Score ${_topScore}/100 · satellite-verified`:`Score ${_topScore}/100 · satellite`)
                  :(lang==="en"?"Clean · 12 min drive · calm sea":"Propre · 12 min · mer calme")}
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
                {lang==="en"?"INSTANT ALERT":"ALERTE INSTANTANÉE"}
              </div>
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {lang==="en"?"Sainte-Anne status changed":"Sainte-Anne a changé"}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {lang==="en"?"Clean → Moderate — switch to Les Salines":"Propre → Modéré — va aux Salines"}
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
                {lang==="en"?"WEEKEND FORECAST":"LE WEEKEND"}
              </div>
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {lang==="en"?"Best for Saturday: Grande Anse":"Samedi : Grande Anse"}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {lang==="en"?"Clean all weekend · ideal for kids":"Propre tout le weekend · idéal enfants"}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Sample-first: high-signal social proof block (Design v1 spec).
            Addresses the 0 sample_start leak by giving the 24h-free path
            permission to exist: "N people did this, no card needed".
            Only shows in variant B (sample_first) AND when sample still available. */}
        {ctaOrder==="sample_first"&&sampleAvailable&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
          borderRadius:12,background:"rgba(255,199,44,.08)",
          border:"1px solid rgba(255,199,44,.18)",
          color:"rgba(255,255,255,.9)",fontSize:12.5,lineHeight:1.4,marginBottom:14}}>
          <span style={{display:"inline-flex",flexShrink:0}}>
            {["M","J","+"].map((l,i)=>(
              <span key={i} style={{width:22,height:22,borderRadius:"50%",
                background:"linear-gradient(135deg,#FFE47A,#E8A800)",
                border:"2px solid #0A1714",marginRight:i<2?-8:0,
                fontFamily:"'Anton',sans-serif",fontSize:10,color:"#0D1E1C",
                display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{l}</span>
            ))}
          </span>
          <span>
            <b style={{color:"#FFC72C",fontWeight:800}}>
              {_cleanCount>0?`${Math.max(7,_cleanCount*3)} ${lang==="en"?"people":island==="gp"?"Guadeloupéens":"Martiniquais"}`:(lang==="en"?"127 people":island==="gp"?"127 Guadeloupéens":"127 Martiniquais")}
            </b>{" "}
            {lang==="en"?"got their morning pick today. Try 24h — no card.":"ont reçu leur reco ce matin. Essaie 24h — sans carte."}
          </span>
        </div>
        )}

        {/* Live clean count — kept for non-sample_first variants as lighter proof */}
        {(ctaOrder!=="sample_first"||!sampleAvailable)&&(
        <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:16}}>
          {_cleanCount>0
            ?(lang==="en"?`${_cleanCount}/${_totalCount} beaches clean right now · satellite 24/7`:`${_cleanCount}/${_totalCount} plages propres en ce moment · satellite 24/7`)
            :(lang==="en"?"135 beaches monitored · 24/7 satellite data":"135 plages surveillées · données satellite 24/7")}
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
            <div>{lang==="en"?"Monthly":"Mensuel"}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{REGION_PAY?PRICE_MO:lang==="en"?"€4.99":"4,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{lang==="en"?"mo":"mois"}</span></div>
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
            <div>{lang==="en"?"Annual":"Annuel"}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{REGION_PAY?PRICE_YR:lang==="en"?"€39.99":"39,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{lang==="en"?"yr":"an"}</span></div>
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
            <div>{lang==="en"?"Pro":"Pro"}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{lang==="en"?"€9.99":"9,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{lang==="en"?"mo":"mois"}</span></div>
          </button>
          )}
        </div>
        )}
        {/* Pro tier perks — only shown when Pro is selected and configured.
            Enables: WhatsApp instant alerts, 14-day forecast (vs 7), 90-day
            history, API access for power users (hoteliers, surfers, fishermen). */}
        {plan==="pro"&&hasPro&&(
        <div style={{background:"rgba(255,100,100,.05)",border:"1px solid rgba(255,100,100,.15)",
          borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:"rgba(255,255,255,.75)"}}>
          <div style={{fontWeight:700,color:"#ff8a8a",marginBottom:4}}>
            {lang==="en"?"What's in Pro":"Dans Pro"}
          </div>
          <div>• {lang==="en"?"Instant WhatsApp alerts when a beach flips":"Alertes WhatsApp instantanées dès qu'une plage change"}</div>
          <div>• {lang==="en"?"14-day forecast (vs 7-day standard)":"Prévisions 14 jours (vs 7 standard)"}</div>
          <div>• {lang==="en"?"90-day history + full API access":"Historique 90 jours + accès API complet"}</div>
        </div>
        )}

        {/* Paid CTA + zero-friction sample. Order depends on ctaOrder A/B variant.
            control: paid first (original), sample_first: sample first (new variant). */}
        {(() => {
          // Nouvelle région sans Payment Links → pas de CTA payant (jamais de redirect EUR).
          if(!PAYWALL_READY)return(
            <div key="paid" style={{width:"100%",textAlign:"center",fontSize:13,padding:"16px 24px",
              borderRadius:14,border:"1px dashed rgba(255,255,255,.25)",color:"rgba(255,255,255,.7)"}}>
              Premium launches here soon — beach alerts &amp; morning brief.
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
              const link=stripeLinkFor[effectivePlan]||LINK_MONTHLY
              track("sg_checkout_redirect",{plan:effectivePlan,source:source||"unknown",destination:"payment_link"})
              // Defer navigation by one macrotask so both sendBeacon calls above flush
              // before unload (see project_funnel_cta_redirect_leak.md).
              setTimeout(()=>{window.location.href=link},0)
            }}
            className="gbtn" style={{width:"100%",textAlign:"center",fontSize:17,
              padding:"16px 24px",display:"block",border:"none",cursor:"pointer",fontFamily:"inherit",lineHeight:1.2,
              // When sample is the primary above, de-emphasise the paid CTA visually
              ...(ctaOrder==="sample_first"&&sampleAvailable?{marginTop:10,opacity:.95}:null)}}>
              <div>{lang==="en"?"Start my daily pick — 7 days free":"Activer ma reco — 7 jours offerts"}</div>
              <div style={{fontSize:12,opacity:.8,fontWeight:400,marginTop:4}}>
                {REGION_PAY?`Then ${effectivePlan==="annual"?PRICE_YR+"/yr":PRICE_MO+"/mo"} · cancel in 1 click`:lang==="en"?"Then €4.99/mo · cancel in 1 click":"Puis 4,99 €/mois · annule en 1 clic"}
              </div>
            </button>
          )
          // "Essayer 24h · sans carte" RETIRÉ avant expansion : sg_sample_start = 0
          // sur 10 738 sessions (~7 sem) — feature morte + clutter. On garde le CTA payant seul.
          return paidCTA
        })()}

        {/* Trust foot — Design v1 spec: 2 lines, first is a tagline with
            interpunct separators, second is a badge row (guarantee + Stripe).
            The Stripe badge is the key addition — addresses 50% redirect→payment
            leak by signaling WHERE the money goes BEFORE the tab redirect. */}
        <div style={{textAlign:"center",marginTop:12,fontSize:10.5,
          color:"rgba(255,255,255,.48)",letterSpacing:".01em"}}>
          {lang==="en"?"No ads · No commitment · Cancel in 1 click":"Sans pub · Sans engagement · Annule en 1 clic"}
        </div>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",
          gap:8,marginTop:8}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:4,
            fontSize:10,color:"rgba(255,255,255,.7)",fontWeight:500}}>
            <span>🛡</span>{lang==="en"?"30-day money-back":"Satisfait ou remboursé 30 j"}
          </span>
          <span style={{color:"rgba(255,255,255,.4)"}}>·</span>
          <span style={{display:"inline-flex",alignItems:"center",gap:4,
            fontSize:10,color:"rgba(255,255,255,.7)",fontWeight:500}}>
            <span>🔒</span>Stripe
          </span>
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

        <button onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts});onClose()}} style={{
          width:"100%",padding:"12px",marginTop:8,background:"none",
          border:"1px solid rgba(255,255,255,.15)",borderRadius:16,
          color:"#8b949e",fontSize:13,cursor:"pointer",fontFamily:"inherit",
        }}>{LL.close}</button>
        </div>{/* end sticky CTA section */}
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
function Header({island,onIslandChange,lang,onLangToggle,theme,onThemeToggle,beachCount,dataSource,updatedAt}){
  const LL=T[lang]||T.fr
  const isLive=dataSource==="erddap-live"
  const srcLabel=isLive?"LIVE":(lang==="en"?"Estimation":"Estimation")
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
        <button onClick={onLangToggle} aria-label={lang==="fr"?"Switch to English":lang==="en"?"Cambiar a español":"Passer en français"} style={{
          width:40,height:"100%",border:"none",
          background:"transparent",cursor:"pointer",
          fontFamily:"'Anton',sans-serif",fontSize:13,fontWeight:400,
          letterSpacing:".03em",color:"var(--sg-ink)",
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>{lang==="fr"?"EN":lang==="en"?"ES":"FR"}</button>
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
    const island=window.location.hostname.includes("guadeloupe")?"GP":"MQ"
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
      {lang==="en"?"You're in! First email in 3 days.":"C'est fait ! Premier email dans 3 jours."}
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
          {lang==="en"?"FREE":"GRATUIT"}
        </div>
        <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>
          {em1V==="curiosity"
            ?(lang==="en"?"Where's the cleanest beach today?":"Où est la plus belle plage aujourd'hui ?")
            :SARGASSES_SEASON==="high"
              ?(lang==="en"?"Beaches are changing fast":"Les plages changent tous les jours")
              :(lang==="en"?"Know before you go":"Sois prévenu avant de partir")}
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:12,lineHeight:1.4}}>
          {em1V==="curiosity"
            ?(lang==="en"?"We tell you every morning. Free.":"On te le dit chaque matin. Gratuit.")
            :SARGASSES_SEASON==="high"
              ?(lang==="en"?"Get alerted when your beach status changes. Free.":"Reçois une alerte quand ta plage change de statut. Gratuit.")
              :(lang==="en"?"Weekly beach status + alerts if things change. Free.":"Bilan hebdo + alerte si ça change. Gratuit.")}
        </div>
        <form onSubmit={handleSubmit} style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="email" inputMode="email" autoComplete="email" placeholder={lang==="en"?"your@email.com":"ton@email.com"}
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
            {lang==="en"?"Go":"OK"}
          </button>
        </form>
        <button onClick={()=>{setDismissed(true);s("sg_email_prompt",true);track("sg_email_dismiss")}} style={{
          display:"block",margin:"8px auto 0",background:"none",border:"none",
          cursor:"pointer",color:"rgba(255,255,255,.3)",fontSize:11,padding:0}}>
          {lang==="en"?"Not now":"Plus tard"}
        </button>
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
      <button onClick={()=>{setVisible(false);s("sg_feedback_done",true)}} aria-label="Fermer"
        style={{position:"absolute",top:4,right:4,background:"none",border:"none",
          color:"var(--sg-mid)",cursor:"pointer",fontSize:16,
          width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
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
          {lang==="en"?"Added to favorites":"Ajouté aux favoris"}
        </div>
        {!isPremium&&(
          <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:2}}>
            {lang==="en"?"Get alerts when conditions change":"Reçois une alerte quand ça change"}
          </div>
        )}
      </div>
      {!isPremium&&(
        <button onClick={()=>{track("sg_fav_toast_premium_click");onPremiumClick("fav_toast");setVisible(false)}}
          style={{flexShrink:0,background:C.gold,color:C.ink,border:"none",borderRadius:8,
            padding:"6px 12px",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",
            whiteSpace:"nowrap"}}>
          {lang==="en"?"Alerts":"Alertes"}
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
        <button onClick={dismiss} aria-label={lang==="en"?"Close":"Fermer"}
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
  const[fbPosts,setFbPosts]=useState({})
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
              const r=_computeBeachScore(snap)
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
  const toggleLang=useCallback(()=>setLang(l=>l==="fr"?"en":l==="en"?"es":"fr"),[])
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
      <h1 style={{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap"}}>{IS_NEW_REGION?`${REGION.name} sargassum live — beach map today`:island==="mq"?"Sargasses Martinique en temps réel — carte et plages aujourd'hui":"Sargasses Guadeloupe en temps réel — carte et plages aujourd'hui"}</h1>
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
              ?(lang==="en"?"Beaches are changing fast. You almost had Premium — finish now.":"Les plages bougent vite. Tu étais presque Premium — termine maintenant.")
              :(lang==="en"?"You were almost Premium! Pick up where you left off.":"Tu étais presque Premium\u00a0! Reprends où tu en étais.")}</span>
            <button onClick={()=>{
              track("sg_checkout_recovery_click",{island})
              setShowRecoveryBanner(false)
              openPremium("recovery_banner")
            }} style={{background:"#E8A800",color:"#0A1714",border:"none",borderRadius:8,
              padding:"6px 14px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",
              whiteSpace:"nowrap",flexShrink:0}}>
              {lang==="en"?"Go Premium":"Passer Premium"}
            </button>
            <button onClick={()=>{
              track("sg_checkout_recovery_dismiss",{island})
              setShowRecoveryBanner(false)
              localStorage.removeItem("sg_checkout_abandoned")
            }} style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",
              cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px",flexShrink:0}}
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
            onPremiumClick={openPremium} track={track}
            searchActive={search.trim().length>=2&&filtered.length>0}/>
          </Suspense></ErrBound>
        </div>
        <div style={{position:"absolute",inset:0,opacity:view==="list"?1:0,
          pointerEvents:view==="list"?"auto":"none",transition:"opacity .25s ease"}}>
          <BeachListView beaches={filtered} onBeachClick={onBeachClick}
            favorites={favorites} lang={lang} imageMap={imageMap}/>
        </div>

        {/* TOP FLOATING — Header pill only. Transparent over map so the full
            viewport reads as the map. Chrome is capped at 600px centered. */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:700,
          padding:`calc(max(12px, env(safe-area-inset-top)) + ${showRecoveryBanner?64:0}px) 16px 0`,
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
              updatedAt={sargData?.updatedAt||sargData?.erddapTimestamp}/>
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
                    {lang==="en"?"is clean":"est propre"}
                  </span>
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid,#686868)",marginTop:1}}>
                  {nextSuggestion.dist} km {lang==="en"?"away":"d'ici"}
                </div>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:C.green,flexShrink:0}}>
                {lang==="en"?"View":"Voir"}
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
              <div>{lang==="en"?"Recommended by a friend":"Recommandé par un ami"}</div>
              <div style={{fontSize:10,fontWeight:400,opacity:.85,marginTop:2}}>
                {lang==="en"?"Tap to start your free premium trial":"Appuie pour essayer premium gratuitement"}
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
              <div>Premium activé !</div>
              <div style={{fontSize:11,fontWeight:400,opacity:.85,marginTop:2}}>Brief matin + alertes + reco du jour.</div>
              <a href="?manage=1" onClick={e=>{e.stopPropagation();track("sg_manage_click")}} style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:3,display:"inline-block"}}>Gérer mon abonnement</a>
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
