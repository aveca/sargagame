/**
 * SARGASSES — Reboot from scratch (4 avril 2026)
 * "Cette fois, tu seras prévenu."
 *
 * Architecture : Map-first, data-driven (Clarity — 25% clics = carte)
 * Stack : React 18 · Leaflet · Bricolage Grotesque + Anton · Open-Meteo
 */
import React,{useState,useEffect,useRef,useMemo,useCallback,createContext,useContext,Component,Suspense,lazy}from"react"
import {computeScore as _computeBeachScore} from "./lib/score.js"
import { COAST_ZONES } from "../scripts/lib/coast-zones.cjs"
import { getCanonicalSlug } from "./lib/slug-resolver.js"
import { useSwipeClose } from "./useSwipeClose.js"
import PassOffer from "./PassOffer.jsx"
import BeachPhotos from "./BeachPhotos.jsx"
import { uploadBeachPhoto, submitBeachReport, fetchApprovedReports, supabaseConfigured } from "./supabasePhotos.js"
import "./Themes.css"
import "./app-runtime.css"

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
// Carte Leaflet RETIRÉE (2026-06-21) — app full-SVG (WorldMapView/ArchipelView) : plus de
// fallback ?nav=map, plus de dépendance leaflet (~146 Ko). Une vieille version (carte à tuiles,
// menu « Toute l'île » à droite) flashait au lancement via un cache PWA → suppression propre.
// Scènes HORS first-paint (rendues derrière des flags false par défaut / events) :
// splash, onboarding, hero veilleur, transition plongée. Lazy → sorties du chunk
// critique (perf LCP). DOIVENT être rendues sous <Suspense>.
const ArenaSplash=lazyWithRetry(()=>import("./ArenaSplash.jsx"))
const ArenaOnboarding=lazyWithRetry(()=>import("./ArenaOnboarding.jsx"))
const VeilleurHero=lazyWithRetry(()=>import("./VeilleurHero.jsx"))
const DiveTransition=lazyWithRetry(()=>import("./DiveTransition.jsx"))
// Accueil A→Z (bras A/B `home_az`) — design validé porté en Shadow DOM.
const LazyHomeAZ=lazyWithRetry(()=>import("./HomeAZ"))
// Accueil « LA CHASSE » (bras A/B `arena_loop`) — boucle de jeu TCG comic.
const LazyChasse=lazyWithRetry(()=>import("./ChasseHome"))
// Carte SVG monde golden-hour (bras A/B `map_world`) — port proto-map-v2, region-aware.
const LazyWorldMapView=lazyWithRetry(()=>import("./WorldMapView"))
// Détail plage « monde comic » (ChasseDetail) ouvert au tap d'un pin carte — garde le
// joueur dans l'univers arène au lieu de l'éjecter vers la fiche data « scroll satellite »
// (PRODUCT.md §8 ⭐). Default ON, rollback ?mapdetail=0. Lazy → DOIT être sous Suspense.
const LazyComicDetail=lazyWithRetry(()=>import("./ComicDetail"))
// Fiche plage « en PLONGÉE » (bras A/B `pw_beach_dive`) — port proto-plage-plongee,
// Shadow DOM, region-aware. Alternative additive à BeachSheet (control intact).
// Onboarding GUIDÉ des nouveaux clients PAYANTS (bras A/B `pw_onboard`) — remplace
// le toast 5s par un mini-setup (favoris→notif→brief). Lazy → DOIT être sous Suspense.
const LazyPaidOnboarding=lazyWithRetry(()=>import("./PaidOnboarding"))
// Accueil premium VERDICT-FIRST « Le Poste de Veille » (panel 2026-06-30) — remplace le tunnel
// PaidOnboarding. Rollback ?poste=0 → retombe sur le tunnel linéaire.
const LazyWelcomePoste=lazyWithRetry(()=>import("./WelcomePoste"))
const POSTE_OFF=(()=>{try{return /[?&]poste=0/.test(window.location.search)}catch(_){return false}})()
// CleanList — /plages-sans-sargasses/ A/B `clean_list` (port proto-planb-clean-nearby)
const LazyCleanList=lazyWithRetry(()=>import("./CleanList"))
// Conditions — /conditions/<slug>/ A/B `pw_conditions`
const LazyConditions=lazyWithRetry(()=>import("./Conditions"))


class ErrBound extends Component{
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return{err:e}}
  componentDidCatch(e){console.error("CAUGHT:",e.message,e.stack);try{this.props.onError&&this.props.onError(e)}catch(_){}}
  render(){if(this.state.err)return this.props.fallback!==undefined?this.props.fallback:React.createElement("pre",{style:{color:"red",padding:20,whiteSpace:"pre-wrap"}},this.state.err.message+"\n\n"+this.state.err.stack);return this.props.children}
}

/* ═══════════════════════════════════════════════════════════════════════════
   RÉGION ACTIVE (injectée au build via __REGION__)
   Build dédié à une NOUVELLE région (id != mq/gp) → __REGION__ fait foi.
   MQ/GP = build partagé déployé sur 2 domaines → détection hostname historique
   (REGION reste null → toutes les branches MQ/GP sont strictement inchangées).
   ═══════════════════════════════════════════════════════════════════════════ */
const __R = (typeof __REGION__ !== "undefined" && __REGION__) || null
// Fiabilité honnête par régime injectée au build (cf. vite.config.js __RELIABILITY__).
export const __REL = (typeof __RELIABILITY__ !== "undefined" && __RELIABILITY__) || null
// Taille communauté (plancher honnête leads email) injectée au build — preuve sociale paywall.
export const __COMM = (typeof __COMMUNITY__ !== "undefined" && Number(__COMMUNITY__)) || 0
export const IS_NEW_REGION = !!(__R && __R.id !== "mq" && __R.id !== "gp")
export const REGION = IS_NEW_REGION ? __R : null
// Email support région-aware (MQ/GP : littéral historique inchangé)
export const SUPPORT_EMAIL = IS_NEW_REGION ? (REGION.emails?.support || ("support@" + REGION.domain)) : "alerte@sargasses-martinique.com"
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
export function _t(lang,fr,en,es){return lang==="es"?es:lang==="en"?en:fr}
/* Prix d'un pass one-time formaté selon la DEVISE du pass (pas la langue) :
   USD ("$5.99") pour les régions touristes, EUR ("5,99 €"/"€5.99") pour MQ/GP.
   cur vient de passCtxRef ('usd'|'eur') ; lang ne pilote que le séparateur EUR. */
export function fmtPassPrice(cents,cur,lang){
  if(cur==="usd")return "$"+(cents/100).toFixed(2)
  return lang==="en"?"€"+(cents/100).toFixed(2):(cents/100).toFixed(2).replace(".",",")+" €"
}
/* stripe.js partagé — chargé à l'idle de l'app (recommandation Stripe : inclure
   Stripe.js sur toutes les pages) car ce réseau (Caraïbe → CDN Stripe) le charge
   en ~15s : au moment du paywall il doit déjà être en cache. */
let _stripeJsPromise=null
export function loadStripeJs(){
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
// Pont paiement Mollie : charge js.mollie.com/v1/mollie.js (Components on-site).
let _mollieJsPromise=null
export function loadMollieJs(){
  if(typeof window!=="undefined"&&window.Mollie)return Promise.resolve()
  if(_mollieJsPromise)return _mollieJsPromise
  _mollieJsPromise=new Promise((res,rej)=>{
    const sc=document.createElement("script")
    sc.src="https://js.mollie.com/v1/mollie.js"
    sc.onload=res
    sc.onerror=(e)=>{_mollieJsPromise=null;rej(e)}
    document.head.appendChild(sc)
  })
  return _mollieJsPromise
}
// Disponibilité wallets (Apple Pay / Google Pay) — détection légère, sans charger
// de SDK. Apple Pay : API native fiable (Safari/Apple uniquement). Google Pay :
// pas de détection fiable sans pay.js → heuristique UA (Android, ou Chrome desktop),
// jamais en même temps qu'Apple Pay (évite 2 wallets concurrents sur iOS). Si on se
// trompe, le checkout hébergé Mollie propose de toute façon la carte en repli.
export function walletAvail(){
  try{
    if(typeof window==="undefined")return {apple:false,google:false}
    const ua=navigator.userAgent||""
    const apple=!!(window.ApplePaySession&&window.ApplePaySession.canMakePayments&&window.ApplePaySession.canMakePayments())
    const google=!apple&&(/Android/i.test(ua)||(/Chrome/.test(ua)&&!/Edg|OPR/.test(ua)))
    return {apple,google}
  }catch(_){return {apple:false,google:false}}
}
// Styles partagés des champs carte Mollie (thème SOMBRE premium). MOL_FIELD = la div
// sombre qui héberge l'iframe Mollie (porte la bordure + le fond visible) ; MOL_LABEL =
// nos libellés clairs rendus HORS iframe (le composant combiné les rendait illisibles).
export const MOL_FIELD={width:"100%",boxSizing:"border-box",minHeight:46,padding:"4px 13px",
  borderRadius:11,marginBottom:13,border:"1px solid rgba(255,255,255,.14)",
  // Fond SOLIDE (matche le backgroundColor posé sur l'input Mollie dans l'iframe) :
  // l'input opaque tue le blanc d'autofill iOS sans laisser de couture de teinte.
  background:"#241837",display:"flex",alignItems:"center"}
export const MOL_LABEL={display:"block",fontSize:11.5,fontWeight:600,color:"rgba(255,255,255,.62)",marginBottom:6,letterSpacing:".01em"}
// PayPal SDK (bouton abo) : vault + intent=subscription. Le client-id détermine
// l'environnement (sandbox vs live) — pas de flag séparé.
let _ppSdkPromise=null
export function loadPayPalSdk(clientId){
  if(typeof window!=="undefined"&&window.paypal)return Promise.resolve()
  if(_ppSdkPromise)return _ppSdkPromise
  _ppSdkPromise=new Promise((res,rej)=>{
    const sc=document.createElement("script")
    // intent=subscription : PAS de &currency (défini par le plan) — l'ajouter peut casser le bouton d'abo.
    sc.src="https://www.paypal.com/sdk/js?client-id="+encodeURIComponent(clientId)+"&vault=true&intent=subscription&components=buttons"
    sc.onload=res
    sc.onerror=(e)=>{_ppSdkPromise=null;rej(e)}
    document.head.appendChild(sc)
  })
  return _ppSdkPromise
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
export const C={
  bg:"#FDFCF7",bgD:"#F7F5EF",card:"#FFFFFF",cardS:"#FAFAFA",
  ink:"#0D0D0D",mid:"#5A5A5A",mute:"#5A5A5A",
  border:"rgba(0,0,0,.04)",borderM:"rgba(0,0,0,.08)",
  gold:"#E8A800",goldL:"#FFC72C",goldLL:"#FFE47A",
  goldBg:"rgba(232,168,0,.07)",goldBgL:"rgba(255,199,44,.15)",
  // Accents « teal » REPRIS en néon magenta/violet (branding sunset Le Veilleur).
  // Noms conservés (consommés partout) ; seules les valeurs changent → cascade.
  teal:"#156a96",tealL:"#1c7fb0",tealBg:"rgba(28,127,176,.1)",
  green:"#27c46b",greenL:"#1ea75a",greenBg:"rgba(39,196,107,.1)",
  amber:"#B87A00",amberBg:"rgba(184,122,0,.1)",
  red:"#e8322a",redBg:"rgba(232,50,42,.1)",
  sarg:"#8B6914",sargL:"#A67C1A",sargBg:"rgba(139,105,20,.12)",
  night:"#190c2c",night2:"#120821",ocean:"#014F86",
}

/* ═══ SOCLE DESIGN (LOT 0 consolidation 14/06) — source de vérité golden-hour.
   Additif : étend C + tokens partagés. Aucun consommateur au LOT 0 (0 risque
   visuel) ; les écrans s'y branchent aux LOTs suivants. NB: clé 'inkD' (PAS
   'ink' — C.ink='#0D0D0D' déjà utilisé sur surfaces claires) ; 'RAD' (PAS 'R' —
   shadow du rayon haversine). Voir memory reference_refonte_screens.md. ═══ */
Object.assign(C,{
  inkD:"#160a26",card2:"#241246",
  orCTA:"#FFC72C",orLink:"#E8A800",orPale:"#FFE08A",orGlit:"#FFD884",
  tealS:"#6a2f9e",tealL2:"#1c7fb0",
  seaD:"#08251F",seaM:"#1A5852",skyInk:"#0B2230",
  sargD:"#5d400e",sargM:"#7a5c14",sargL2:"#8a6c1c",sargV:"#a8862a",
  stClean:"#27c46b",stMod:"#ffb02e",stAvoid:"#e8322a",stAvoidL:"#F4845F",
  gradClean:["#27c46b","#1ea75a"],gradMod:["#ffb02e","#d98a00"],gradAvoid:["#e8322a","#b8281f"],
  satBody:"#5b3a8e",satTop:"#FFC72C",satWing:"#5b3a8e",moonCol:"#c9a0ff",
})
/* ═══ SCENE_TOKENS — design-system golden-hour, SOURCE UNIQUE de la scène SVG
   (notre valeur). Extrait de BEACH_PHASE (vérifié byte-identique) + sable inline +
   C.sarg + C.sat. BEACH_PHASE en DÉRIVE (l.~410, zéro drift) ; index.html émet ces
   valeurs en --sg-* → l'app ET les 136 pages SEO partagent la même source ;
   REGION.sceneTheme peut surcharger par marché (scalable/réplicable). Additif. ═══ */
const SCENE_TOKENS={
  phases:{
    dawn:  {sky:["#141B33","#3A4A6B","#B86E7E","#F2A968"],seaT:"#235862",seaB:"#0A2630",sand:"#C9A86A",sandNight:"#15110D",rim:"#F2A968",sun:"set", glit:"#F2A968"},
    day:   {sky:["#1A6FA8","#3E9BC4","#7BC8D8","#AEE0E6"],seaT:"#15706A",seaB:"#0B3A34",sand:"#C9A86A",sandNight:"#15110D",rim:"#FFFFFF",sun:"high",glit:"#FDFCF7"},
    golden:{sky:["#0B2230","#155A5A","#C97E3A","#F2B05E"],seaT:"#1A5852",seaB:"#08251F",sand:"#1C1712",sandNight:"#15110D",rim:"#FFD884",sun:"set", glit:"#FFD884"},
    night: {sky:["#040B16","#0A1B2E","#10303B","#16424A"],seaT:"#0A2E2E",seaB:"#04140F",sand:"#15110D",sandNight:"#15110D",rim:"#9ADCD4",sun:"moon",glit:"#9ADCD4"},
  },
  sargasse:{base:"#7a5c14",dark:"#5d400e",light:"#8a6c1c",glint:"#a8862a",strand:"#6b4a12"},
  sat:{body:"#5b3a8e",top:"#FFC72C",lens:"#07201E"},
}
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

// ── Primitives « Le Veilleur » (direction 14/06, workflow 11 agents) ──────────
// Le satellite de HeroScene promu MASCOTTE : 3 humeurs pilotées par la donnée
// réelle. Sobre/premium (satellite-caméra à 1 œil-objectif), JAMAIS visage
// cartoon (= antidote au rejet « Adibou enfantin »). Réutilisable trans-écran.
export const VEILLEUR_MOOD={
  // Veilleur canonique (BIBLE marque) : boîtier ENCRE, accents teal/vert de marque, antenne or.
  // Humeurs lisibles couleur+forme : calme=teal/vert, scan=or, vigilant=ambre-marque, alerte=corail.
  serein:{wing:"#009E8E",halo:"#1EC8B0",lens:"#22C55E",ant:"#FFC72C",tilt:0,ring:null},
  vigilant:{wing:"#B87A00",halo:"#B87A00",lens:"#FFD27A",ant:"#FFD27A",tilt:0,ring:null},
  alerte:{wing:"#E8522A",halo:"#E8522A",lens:"#F4845F",ant:"#F4845F",tilt:-8,ring:"#E8522A"},
  scan:{wing:"#009E8E",halo:"#1EC8B0",lens:"#FFC72C",ant:"#FFC72C",tilt:0,ring:null},
}
// Chemin de la page « fiabilité » selon la région/langue : MQ/GP → /fiabilite/,
// nouvelles régions → /reliability/ (EN) ou /fiabilidad/ (ES). Évite les 404 sur
// les domaines US (la page n'existe qu'aux slugs régionaux, jamais /fiabilite/).
function reliabilityHref(lang){return IS_NEW_REGION?(lang==="es"?"/fiabilidad/":"/reliability/"):"/fiabilite/"}
function moodFromScore(score){return typeof score!=="number"?"scan":score>=70?"serein":score>=40?"vigilant":"alerte"}
export function moodFromStatus(s){return s==="clean"?"serein":s==="moderate"?"vigilant":s==="avoid"?"alerte":"scan"}
// Verdict doublé texte+couleur+forme+emoji (jamais couleur seule — a11y). FR/EN/ES.
function verdictMeta(status,lang){
  const M={
    clean:{color:"#22C55E",emoji:"😎",verb:_t(lang,"Vas-y","Go","Adelante")},
    moderate:{color:"#F59E0B",emoji:"😐",verb:_t(lang,"Prudence","Careful","Cuidado")},
    avoid:{color:"#E8522A",emoji:"🚫",verb:_t(lang,"Pas aujourd'hui","Not today","Hoy no")},
  }
  return M[status]||{color:"#1c7fb0",emoji:"🛰️",verb:_t(lang,"Le veilleur scanne","Scanning","Escaneando")}
}
// Carte de partage SPOILER-FREE (recherche valeur) — image golden-hour SANS lien (effet Wordle
// = portée max sur les réseaux). Canvas PUR (réutilise les fonts déjà chargées), zéro dépendance.
// navigator.share({files}) sur mobile, download sinon. Identité virale : la plage + le verdict du jour.
async function shareBeachCard(beach,lang,forecast){
  try{
    const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H
    const x=cv.getContext("2d");if(!x)return false
    const RR=(xx,yy,w,h,r)=>{x.beginPath();if(x.roundRect)x.roundRect(xx,yy,w,h,r);else x.rect(xx,yy,w,h)}
    const g=x.createLinearGradient(0,0,0,H);[[0,"#0B2230"],[.5,"#155A5A"],[.82,"#C97E3A"],[1,"#F2B05E"]].forEach(s=>g.addColorStop(s[0],s[1]));x.fillStyle=g;x.fillRect(0,0,W,H)
    x.fillStyle="rgba(255,216,132,.26)";x.beginPath();x.arc(W/2,820,320,0,7);x.fill()
    x.fillStyle="rgba(255,216,132,.5)";x.beginPath();x.arc(W/2,820,150,0,7);x.fill()
    x.textAlign="center"
    x.fillStyle="rgba(255,255,255,.82)";x.font="400 36px 'Anton',system-ui,sans-serif";x.fillText("S A R G A S S E S",W/2,118)
    x.save();x.translate(W/2,258)
    x.fillStyle="rgba(95,211,201,.16)";x.beginPath();x.arc(0,0,78,0,7);x.fill()
    x.fillStyle="#5b3a8e";RR(-84,-18,44,36,8);x.fill();RR(40,-18,44,36,8);x.fill()
    x.strokeStyle="#3fd07f";x.lineWidth=6;x.lineCap="round";x.beginPath();x.moveTo(0,-42);x.lineTo(0,-68);x.stroke();x.fillStyle="#3fd07f";x.beginPath();x.arc(0,-72,8,0,7);x.fill()
    x.fillStyle="#5b3a8e";RR(-40,-40,80,80,20);x.fill();x.fillStyle="#FFC72C";RR(-40,-40,80,26,20);x.fill()
    x.fillStyle="#07201E";x.beginPath();x.arc(0,8,24,0,7);x.fill();x.fillStyle="#3fd07f";x.beginPath();x.arc(0,8,16,0,7);x.fill();x.fillStyle="#EAFBF8";x.beginPath();x.arc(-6,2,6,0,7);x.fill()
    x.restore()
    x.fillStyle="#fff";x.font="400 96px 'Anton',system-ui,sans-serif"
    const words=(beach.name||"").toUpperCase().split(" ");let line="";const lines=[]
    for(const w of words){const t=line?line+" "+w:w;if(x.measureText(t).width>W-150&&line){lines.push(line);line=w}else line=t}
    if(line)lines.push(line);const L=lines.slice(0,3)
    let ny=560-(L.length-1)*52;for(const l of L){x.fillText(l,W/2,ny);ny+=104}
    const vm=verdictMeta(beach.status,lang);x.fillStyle=vm.color;x.font="800 56px 'Bricolage Grotesque',system-ui,sans-serif"
    const sc=typeof beach.score==="number"?"  "+beach.score+"/100":""
    x.fillText(vm.verb.toUpperCase()+sc,W/2,ny+44)
    const days=(forecast||[]).slice(0,3)
    if(days.length){const cw=150,sx=W/2-(days.length*cw)/2+cw/2,dy=H-310
      days.forEach((d,i)=>{x.fillStyle=verdictMeta(d.status,lang).color;x.beginPath();x.arc(sx+i*cw,dy,32,0,7);x.fill();x.fillStyle="rgba(255,255,255,.72)";x.font="600 28px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText((d.day||"").slice(0,5),sx+i*cw,dy+74)})}
    const ds=new Date().toLocaleDateString(lang==="en"?"en-GB":lang==="es"?"es-ES":"fr-FR",{day:"numeric",month:"long"})
    x.fillStyle="rgba(255,255,255,.72)";x.font="500 32px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(ds+"  ·  "+_scDomain(),W/2,H-86)
    const blob=await new Promise(r=>cv.toBlob(r,"image/png",.92));if(!blob)return false
    const file=new File([blob],"ma-plage.png",{type:"image/png"})
    const text=_t(lang,beach.name+" aujourd'hui — vu par le Veilleur 🛰️",beach.name+" today — seen by the Watchman 🛰️",beach.name+" hoy — visto por el Vigía 🛰️")
    try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text});return true}}catch(_){}
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="ma-plage.png";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return true
  }catch(e){return false}
}
// Domaine de marque par région (share-card config-driven → scalable multi-marché).
function _scDomain(){try{if(typeof IS_NEW_REGION!=="undefined"&&IS_NEW_REGION&&typeof REGION!=="undefined"&&REGION&&REGION.domain)return REGION.domain}catch(_){}
  try{return (location.hostname||"").includes("guadeloupe")?"sargasses-guadeloupe.com":"sargasses-martinique.com"}catch(_){return "sargasses-martinique.com"}}
// buildShareCard(opts) — générateur de cartes virales multi-variant. 'beach'
// délègue à shareBeachCard (historique, intact). 'streak' = VEILLE-CARD DE SÉRIE :
// le "Wordle de la mer" — la série du Veilleur en grille de pastilles, SANS lien
// (portée max). Canvas pur, fonts déjà chargées, domaine du region-config.
async function buildShareCard(opts){
  opts=opts||{};const variant=opts.variant||"beach",lang=opts.lang||"fr"
  if(variant==="top")return _scTopCard(opts,lang)
  if(variant==="missed")return _scMissedCard(opts,lang)
  if(variant!=="streak")return shareBeachCard(opts.beach,lang,opts.forecast)
  try{
    const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H
    const x=cv.getContext("2d");if(!x)return false
    const RR=(xx,yy,w,h,r)=>{x.beginPath();if(x.roundRect)x.roundRect(xx,yy,w,h,r);else x.rect(xx,yy,w,h)}
    const g=x.createLinearGradient(0,0,0,H);[[0,"#0B2230"],[.5,"#155A5A"],[.82,"#C97E3A"],[1,"#F2B05E"]].forEach(s=>g.addColorStop(s[0],s[1]));x.fillStyle=g;x.fillRect(0,0,W,H)
    x.fillStyle="rgba(255,216,132,.26)";x.beginPath();x.arc(W/2,820,320,0,7);x.fill()
    x.fillStyle="rgba(255,216,132,.5)";x.beginPath();x.arc(W/2,820,150,0,7);x.fill()
    x.textAlign="center"
    x.fillStyle="rgba(255,255,255,.82)";x.font="400 36px 'Anton',system-ui,sans-serif";x.fillText("S A R G A S S E S",W/2,118)
    x.save();x.translate(W/2,250)
    x.fillStyle="rgba(95,211,201,.16)";x.beginPath();x.arc(0,0,78,0,7);x.fill()
    x.fillStyle="#5b3a8e";RR(-84,-18,44,36,8);x.fill();RR(40,-18,44,36,8);x.fill()
    x.strokeStyle="#3fd07f";x.lineWidth=6;x.lineCap="round";x.beginPath();x.moveTo(0,-42);x.lineTo(0,-68);x.stroke();x.fillStyle="#3fd07f";x.beginPath();x.arc(0,-72,8,0,7);x.fill()
    x.fillStyle="#5b3a8e";RR(-40,-40,80,80,20);x.fill();x.fillStyle="#FFC72C";RR(-40,-40,80,26,20);x.fill()
    x.fillStyle="#07201E";x.beginPath();x.arc(0,8,24,0,7);x.fill();x.fillStyle="#3fd07f";x.beginPath();x.arc(0,8,16,0,7);x.fill();x.fillStyle="#EAFBF8";x.beginPath();x.arc(-6,2,6,0,7);x.fill()
    x.restore()
    const n=Math.max(0,opts.streak||0),best=opts.best||n,gap=96
    x.fillStyle="#FFD884";x.font="400 130px 'Anton',system-ui,sans-serif";x.fillText("🔥 "+n,W/2,500)
    x.fillStyle="#fff";x.font="400 58px 'Anton',system-ui,sans-serif";x.fillText(_t(lang,"JOURS DE VEILLE","DAYS ON WATCH","DÍAS DE VIGÍA"),W/2,584)
    const dots=Math.min(n,21),per=7
    for(let i=0;i<dots;i++){const row=Math.floor(i/per),col=i%per,cnt=Math.min(dots-row*per,per),sx=W/2-((cnt-1)*gap)/2;x.fillStyle="#22C55E";x.beginPath();x.arc(sx+col*gap,690+row*86,32,0,7);x.fill()}
    x.fillStyle="rgba(255,255,255,.92)";x.font="800 44px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(_t(lang,"Tu fais mieux ?","Beat my streak?","¿Me superas?"),W/2,H-210)
    if(best>n){x.fillStyle="rgba(255,255,255,.6)";x.font="600 30px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText("⭐ "+_t(lang,"record "+best,"best "+best,"récord "+best),W/2,H-160)}
    const ds=new Date().toLocaleDateString(lang==="en"?"en-GB":lang==="es"?"es-ES":"fr-FR",{day:"numeric",month:"long"})
    x.fillStyle="rgba(255,255,255,.72)";x.font="500 32px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(ds+"  ·  "+_scDomain(),W/2,H-86)
    const blob=await new Promise(r=>cv.toBlob(r,"image/png",.92));if(!blob)return false
    const file=new File([blob],"ma-serie.png",{type:"image/png"})
    const text=_t(lang,"Ma série de veille des plages 🛰️🔥 — tu fais mieux ?","My beach-watch streak 🛰️🔥 — beat it?","Mi racha de vigía 🛰️🔥 — ¿me superas?")
    try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text});return true}}catch(_){}
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="ma-serie.png";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return true
  }catch(e){return false}
}
// Chrome partagé des share-cards (gradient golden-hour + halos + wordmark + glyphe
// Veilleur) — factorisé pour les variantes 'top'/'missed' (beach/streak gardent
// leur chrome inline historique). Canvas pur, fonts déjà chargées.
function _scChrome(x,W,H,RR,glyphY){
  const g=x.createLinearGradient(0,0,0,H);[[0,"#0B2230"],[.5,"#155A5A"],[.82,"#C97E3A"],[1,"#F2B05E"]].forEach(s=>g.addColorStop(s[0],s[1]));x.fillStyle=g;x.fillRect(0,0,W,H)
  x.fillStyle="rgba(255,216,132,.26)";x.beginPath();x.arc(W/2,820,320,0,7);x.fill()
  x.fillStyle="rgba(255,216,132,.5)";x.beginPath();x.arc(W/2,820,150,0,7);x.fill()
  x.textAlign="center"
  x.fillStyle="rgba(255,255,255,.82)";x.font="400 36px 'Anton',system-ui,sans-serif";x.fillText("S A R G A S S E S",W/2,118)
  x.save();x.translate(W/2,glyphY||258)
  x.fillStyle="rgba(95,211,201,.16)";x.beginPath();x.arc(0,0,78,0,7);x.fill()
  x.fillStyle="#5b3a8e";RR(-84,-18,44,36,8);x.fill();RR(40,-18,44,36,8);x.fill()
  x.strokeStyle="#3fd07f";x.lineWidth=6;x.lineCap="round";x.beginPath();x.moveTo(0,-42);x.lineTo(0,-68);x.stroke();x.fillStyle="#3fd07f";x.beginPath();x.arc(0,-72,8,0,7);x.fill()
  x.fillStyle="#5b3a8e";RR(-40,-40,80,80,20);x.fill();x.fillStyle="#FFC72C";RR(-40,-40,80,26,20);x.fill()
  x.fillStyle="#07201E";x.beginPath();x.arc(0,8,24,0,7);x.fill();x.fillStyle="#3fd07f";x.beginPath();x.arc(0,8,16,0,7);x.fill();x.fillStyle="#EAFBF8";x.beginPath();x.arc(-6,2,6,0,7);x.fill()
  x.restore()
}
function _scFooter(x,W,H,lang){const ds=new Date().toLocaleDateString(lang==="en"?"en-GB":lang==="es"?"es-ES":"fr-FR",{day:"numeric",month:"long"});x.textAlign="center";x.fillStyle="rgba(255,255,255,.72)";x.font="500 32px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(ds+"  ·  "+_scDomain(),W/2,H-86)}
async function _scShip(cv,filename,text){const blob=await new Promise(r=>cv.toBlob(r,"image/png",.92));if(!blob)return false;const file=new File([blob],filename,{type:"image/png"});try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text});return true}}catch(_){}const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return true}
// Variante 'top' — LA PLAGE DU JOUR : une reco positive « vas-y aujourd'hui »,
// spoiler-free (une seule plage nommée + verdict + raison + 3 jours), zéro lien.
async function _scTopCard(opts,lang){
  try{
    const beach=opts.beach;if(!beach)return false
    const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H
    const x=cv.getContext("2d");if(!x)return false
    const RR=(xx,yy,w,h,r)=>{x.beginPath();if(x.roundRect)x.roundRect(xx,yy,w,h,r);else x.rect(xx,yy,w,h)}
    _scChrome(x,W,H,RR,258);x.textAlign="center"
    RR(W/2-210,360,420,64,32);x.fillStyle="rgba(255,216,132,.16)";x.fill();x.strokeStyle="#FFD884";x.lineWidth=2;x.stroke()
    x.fillStyle="#FFD884";x.font="800 30px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(_t(lang,"★ LA PLAGE DU JOUR","★ BEACH OF THE DAY","★ LA PLAYA DEL DÍA"),W/2,403)
    x.fillStyle="#fff";x.font="400 96px 'Anton',system-ui,sans-serif"
    const words=(beach.name||"").toUpperCase().split(" ");let line="";const lines=[]
    for(const w of words){const t=line?line+" "+w:w;if(x.measureText(t).width>W-150&&line){lines.push(line);line=w}else line=t}
    if(line)lines.push(line);const L=lines.slice(0,3)
    let ny=560-(L.length-1)*52;for(const l of L){x.fillText(l,W/2,ny);ny+=104}
    const vm=verdictMeta(beach.status,lang);x.fillStyle=vm.color;x.font="800 56px 'Bricolage Grotesque',system-ui,sans-serif"
    const sc=typeof beach.score==="number"?"  "+beach.score+"/100":""
    x.fillText(vm.verb.toUpperCase()+sc,W/2,ny+24)
    const why=beach.status==="clean"?_t(lang,"eau claire, signal satellite faible","clear water, low satellite signal","agua clara, señal baja"):beach.status==="moderate"?_t(lang,"présence éparse, à surveiller","scattered, keep an eye out","presencia dispersa, vigila"):_t(lang,"forte présence aujourd'hui","strong presence today","fuerte presencia hoy")
    x.fillStyle="rgba(255,255,255,.82)";x.font="600 30px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(why,W/2,ny+78)
    const days=(opts.forecast||beach.forecast||[]).slice(0,3)
    if(days.length){const cw=150,sx=W/2-(days.length*cw)/2+cw/2,dy=H-330;days.forEach((d,i)=>{x.fillStyle=verdictMeta(d.status,lang).color;x.beginPath();x.arc(sx+i*cw,dy,30,0,7);x.fill();x.fillStyle="rgba(255,255,255,.72)";x.font="600 26px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText((d.day||"").slice(0,5),sx+i*cw,dy+66)})}
    x.fillStyle="rgba(255,255,255,.9)";x.font="700 30px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(beach.commune?("🚗 "+beach.commune):_t(lang,"Cap sur cette plage","Head here today","Vamos a esta playa"),W/2,H-180)
    _scFooter(x,W,H,lang)
    return await _scShip(cv,"plage-du-jour.png",_t(lang,"La plage du jour selon le Veilleur 🛰️☀️","Beach of the day per the Watchman 🛰️☀️","La playa del día según el Vigía 🛰️☀️"))
  }catch(e){return false}
}
// Variante 'missed' — DÉFI DU VEILLEUR raté : carte ludique « la mer m'a eu »
// (loss-aversion = viral). SPOILER-FREE STRICT : on dessine SEULEMENT le choix du
// joueur (barré si faux), JAMAIS le vrai statut → ne gâche pas le défi du jour.
async function _scMissedCard(opts,lang){
  try{
    const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H
    const x=cv.getContext("2d");if(!x)return false
    const RR=(xx,yy,w,h,r)=>{x.beginPath();if(x.roundRect)x.roundRect(xx,yy,w,h,r);else x.rect(xx,yy,w,h)}
    _scChrome(x,W,H,RR,250);x.textAlign="center"
    const correct=!!opts.correct
    x.font="400 120px 'Anton',system-ui,sans-serif";x.fillText(correct?"🎯":"🌊🤷",W/2,470)
    x.fillStyle="#fff";x.font="400 92px 'Anton',system-ui,sans-serif";x.fillText(correct?_t(lang,"J'AI EU L'ŒIL","NAILED THE CALL","TUVE OJO"):_t(lang,"LA MER M'A EU","THE SEA FOOLED ME","EL MAR ME ENGAÑÓ"),W/2,600)
    x.fillStyle="#FFD884";x.font="800 46px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(correct?_t(lang,"J'ai deviné le verdict du jour","I called today's verdict","Adiviné el veredicto de hoy"):_t(lang,"J'ai mal deviné le verdict du jour","I misread today's verdict","Fallé el veredicto de hoy"),W/2,672)
    const chips=[{s:"clean",e:"😎",c:"#22C55E"},{s:"moderate",e:"😐",c:"#F59E0B"},{s:"avoid",e:"🚫",c:"#E8522A"}]
    const cw=210,gap=24,total=chips.length*cw+(chips.length-1)*gap,sx=W/2-total/2,cy=812
    chips.forEach((ch,i)=>{const cx=sx+i*(cw+gap),picked=ch.s===opts.guess
      RR(cx,cy,cw,96,20);x.fillStyle=picked?ch.c+"33":"rgba(255,255,255,.06)";x.fill();x.strokeStyle=picked?ch.c:"rgba(255,255,255,.18)";x.lineWidth=picked?4:2;x.stroke()
      x.fillStyle=picked?"#fff":"rgba(255,255,255,.5)";x.font="400 52px 'Anton',system-ui,sans-serif";x.fillText(ch.e,cx+cw/2,cy+64)
      if(picked&&!correct){x.strokeStyle="#fff";x.lineWidth=7;x.lineCap="round";x.beginPath();x.moveTo(cx+20,cy+20);x.lineTo(cx+cw-20,cy+96-20);x.stroke()}})
    const streak=Math.max(0,opts.streak||0)
    if(!correct&&streak>0){x.fillStyle="rgba(255,255,255,.7)";x.font="600 30px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText("🔥 "+_t(lang,"série interrompue à "+streak,"streak broke at "+streak,"racha rota en "+streak),W/2,988)}
    x.fillStyle="#fff";x.font="800 44px 'Bricolage Grotesque',system-ui,sans-serif";x.fillText(correct?_t(lang,"Tu lis la mer aussi bien ?","Read the sea as well?","¿Lees el mar igual?"):_t(lang,"Tu lis mieux la mer que moi ?","Read the sea better than me?","¿Lees mejor el mar?"),W/2,H-200)
    _scFooter(x,W,H,lang)
    return await _scShip(cv,"defi-veilleur.png",correct?_t(lang,"J'ai eu l'œil du Veilleur 🛰️🎯 — tu fais mieux ?","Got the Watchman's eye 🛰️🎯 — beat it?","Tuve el ojo del Vigía 🛰️🎯 — ¿me superas?"):_t(lang,"Le défi du Veilleur m'a eu 😅 — tu fais mieux ? 🛰️","The Watchman's Challenge fooled me 😅 — beat it? 🛰️","El Desafío del Vigía me engañó 😅 — ¿me superas? 🛰️"))
  }catch(e){return false}
}
function Veilleur({mood="serein",size=44}){
  const m=VEILLEUR_MOOD[mood]||VEILLEUR_MOOD.serein
  return(
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{display:"block",overflow:"visible"}}>
      {/* Veilleur FIGÉ au repos (doctrine calme) — la vie vient de l'interaction, pas d'un bob idle */}
      <g transform="translate(32,33)"><g className="sgv-bob"><g transform={`rotate(${m.tilt})`}>
        <circle r="22" fill={m.halo} opacity=".15"/>
        <circle r="14" fill={m.lens} opacity=".12"/>
        <rect x="-27" y="-5" width="13" height="11" rx="2.5" fill={m.wing}/>
        <rect x="14" y="-5" width="13" height="11" rx="2.5" fill={m.wing}/>
        <rect x="-11" y="-11" width="22" height="22" rx="6" fill="#0A1714"/>
        <rect x="-11" y="-11" width="22" height="7" rx="6" fill={m.lens}/>
        <line x1="0" y1="-11" x2="0" y2="-19" stroke={m.ant} strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="0" cy="-20" r="1.9" fill={m.ant}/>
        {m.ring&&<circle cx="0" cy="2" r="6.6" fill="none" stroke={m.ring} strokeWidth="1"/>}
        <circle cx="0" cy="2" r="5.4" fill="#0A1714"/>
        <circle cx="0" cy="2" r="4" fill={m.lens}/>
        <circle cx="-1.4" cy=".5" r="1.4" fill="#EAFBF8"/>
      </g></g></g>
    </svg>
  )
}
// Squircle candy du score 0-100 — réutilise l'esprit SG_BLOB du funnel.
function ScoreBlob({score,color,size=84}){
  return(
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{display:"block"}}>
      <path d="M50 7 C79 7 93 21 93 50 C93 79 79 93 50 93 C21 93 7 79 7 50 C7 21 21 7 50 7 Z" fill={color}/>
      <ellipse cx="37" cy="29" rx="25" ry="15" fill="#fff" opacity=".16"/>
      <text x="50" y="59" fontFamily="'Anton',sans-serif" fontSize="40" fill="#fff" textAnchor="middle">{score}</text>
      <text x="50" y="75" fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="11" fontWeight="800" fill="#fff" textAnchor="middle" opacity=".82">/100</text>
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST CANONIQUE (.sg-toast) — source UNIQUE de marque (bible États & micro-copy).
   Remplace les alert() OS + les toasts ad-hoc bleu-pirate. Singleton module-level
   (event emitter) → n'importe quel composant appelle sgToast(...) sans threader de
   prop ; un seul <SgToastHost/> monté au root rend la pile. Le Veilleur porte
   l'humeur (calme/scan/alerte). i18n via _t. ✕ en SVG, jamais Unicode.
   ═══════════════════════════════════════════════════════════════════════════ */
let _sgToastSeq=0
const _sgToastSubs=new Set()
let _sgToasts=[]
function _sgEmit(){for(const fn of _sgToastSubs)fn(_sgToasts)}
// sgToast({title,msg,tone:'info'|'error'|'success',mood,duration,action}) → id
export function sgToast(opts){
  const o=typeof opts==="string"?{msg:opts}:(opts||{})
  const id=++_sgToastSeq
  const tone=o.tone||"info"
  // mood par défaut déduit du ton (alerte=corail, succès/info=calme)
  const mood=o.mood||(tone==="error"?"alerte":tone==="success"?"serein":"scan")
  const duration=o.duration!=null?o.duration:(tone==="error"?7000:4200)
  _sgToasts=[..._sgToasts,{id,title:o.title||"",msg:o.msg||"",tone,mood,action:o.action||null}]
  _sgEmit()
  if(duration>0)setTimeout(()=>sgDismissToast(id),duration)
  return id
}
function sgDismissToast(id){
  if(!_sgToasts.some(t=>t.id===id))return
  _sgToasts=_sgToasts.filter(t=>t.id!==id);_sgEmit()
}
// ✕ SVG canonique (jamais Unicode ✕)
function SgClose({onClick,lang}){
  return(
    <button type="button" className="sg-toast__x" aria-label={_t(lang||"fr","Fermer","Close","Cerrar")} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    </button>
  )
}
function SgToastHost({lang="fr"}){
  const[list,setList]=useState(_sgToasts)
  useEffect(()=>{const fn=l=>setList([...l]);_sgToastSubs.add(fn);setList([..._sgToasts]);return()=>{_sgToastSubs.delete(fn)}},[])
  if(!list.length)return null
  return(
    <div className="sg-toast-host" role="region" aria-live="polite" aria-label={_t(lang,"Notifications","Notifications","Notificaciones")}>
      {list.map(t=>{
        const isErr=t.tone==="error"
        return(
          <div key={t.id} className={"sg-toast sg-toast--"+t.tone} role={isErr?"alert":"status"}>
            <span className="sg-toast__bar"/>
            <span className="sg-toast__veil" aria-hidden="true"><Veilleur mood={t.mood} size={34}/></span>
            <div className="sg-toast__body">
              {t.title?<div className="sg-toast__title">{t.title}</div>:null}
              {t.msg?<div className="sg-toast__msg">{t.msg}</div>:null}
              {t.action?(
                <button type="button" className="sg-toast__act" onClick={()=>{try{t.action.onClick&&t.action.onClick()}finally{sgDismissToast(t.id)}}}>{t.action.label}</button>
              ):null}
            </div>
            <SgClose lang={lang} onClick={()=>sgDismissToast(t.id)}/>
          </div>
        )
      })}
    </div>
  )
}
// API canonique exposée (QA + call-sites éventuels hors composant), comme sgArchetypeOf/sgHasUnlock.
try{if(typeof window!=="undefined"){window.sgToast=sgToast;window.sgDismissToast=sgDismissToast}}catch(_){}

// ── PRNG DÉTERMINISTE (BeachScene v2, spec wdiiae0wd) — une plage = TOUJOURS la même
//    scène (seed depuis beach.id). FNV-1a 32-bit + mulberry32. JAMAIS Math.random/Date.now
//    (sinon la scène se re-randomise à chaque render + casse SSR). Tirages dans un ordre fixe.
function hashSeed(str){let h=2166136261>>>0;str=String(str==null?"":str);for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h>>>0}
function rng(seed){let a=seed>>>0;return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function pick(rnd,arr){return arr[Math.floor(rnd()*arr.length)]}
function rangeR(rnd,a,b){return a+(b-a)*rnd()}
function intR(rnd,a,b){return Math.floor(a+(b-a+1)*rnd())}
function chance(rnd,p){return rnd()<p}

// ── archetypeOf — choisit l'archétype visuel d'une plage depuis ses données (spec wdiiae0wd).
//    Ordre : du plus spécifique au défaut. READ-ONLY (jamais renommer une plage, slug=SEO).
//    Élargit beachLandmark (gardé en fallback). USD (fl/pc/rm) dégradent vers OPEN_SHORE.
const _ARCH_BLACK=/noire|dufour|c[ée]ron|couleuvre|grand.?rivi|anse l[ae]vau/i
const _ARCH_CLIFF=/caravelle|tartane|presqu|tombolo|ch[aâ]teaux|pointe|\bcap\b/i
const _ARCH_REEF=/[iî]let|petite[ -]?terre|caret|fajou|gosier/i
const _ARCH_RIVER=/rivi[èe]re|embouchure|gal[io]n|figuier|mangrove/i
const _ARCH_MARINA=/bourg|marina|ponton|fran[çc]aise/i
const _ARCH_OPEN=/salines?|grande[ -]anse/i
const _MARINA_COMMUNES=["sainte-anne","le gosier","le marin","fort-de-france","saint-françois","saint-francois"]
function archetypeOf(beach){
  if(!beach)return "MORNE_COAST"
  const k=((beach.id||"")+" "+(beach.name||"")+" "+(beach.commune||"")).toLowerCase()
  const isl=beach.island
  if(/diamant/.test(k))return "ICONIC_ROCK"
  if(_ARCH_BLACK.test(k))return "VOLCANIC_BLACK"
  // CLIFF & RIVER : tester le NOM seul (pas la commune) — sinon Pointe-à-Pitre→CLIFF
  // et Grande Anse @ Rivière-Pilote→RIVER (faux positifs vus au dump des 136).
  if(_ARCH_CLIFF.test(beach.name||""))return "CLIFF_HEADLAND"
  if(isl==="gp"&&_ARCH_REEF.test(k))return "REEF_ISLET"
  if(_ARCH_RIVER.test(beach.name||""))return "RIVER_MANGROVE"
  let coast=beach.coast
  try{if(!coast&&typeof classifyBeachCoast==="function")coast=classifyBeachCoast(beach.lat,beach.lng,isl)}catch(_){}
  if(coast==="sheltered"&&beach.parking===true&&(_ARCH_MARINA.test(k)||_MARINA_COMMUNES.includes((beach.commune||"").toLowerCase())))return "MARINA_URBAN"
  if(_ARCH_OPEN.test(k)||isl==="fl"||isl==="pc"||isl==="rm"||(coast==="atlantic"&&(beach.drive||0)>=40))return "OPEN_SHORE"
  if(coast==="sheltered")return "SHELTERED_BAY"
  return "MORNE_COAST"
}
try{if(typeof window!=="undefined")window.sgArchetypeOf=archetypeOf}catch(_){}

// ── Relief & palmiers PROCÉDURAUX seedés (BeachScene v2, INCRÉMENT 3 spec wdiiae0wd).
//    Géométrie SEULE (déterministe, sans couleur) ; le thème (phase) s'applique au rendu.
//    Horizon à y=340. Tirages r() dans un ORDRE FIXE → scène stable par beach.id.
function mornePath(r,n,h0,h1,fromLeft){
  const baseY=340,x0=fromLeft?-40:840,dir=fromLeft?1:-1,span=380
  let d="M"+x0+" "+baseY
  for(let i=0;i<n;i++){
    const px=Math.round(x0+dir*span*(i+0.5)/n)
    const py=Math.round(baseY-rangeR(r,h0,h1))
    const ex=Math.round(x0+dir*span*(i+1)/n)
    const ey=Math.round(baseY-rangeR(r,2,14))
    d+=" Q"+px+" "+py+" "+ex+" "+ey
  }
  d+=" L"+Math.round(x0+dir*span)+" "+baseY+" Z"
  return d
}
const _PALM_N={OPEN_SHORE:[2,4],SHELTERED_BAY:[2,3],VOLCANIC_BLACK:[2,3],MORNE_COAST:[1,3],MARINA_URBAN:[0,1],REEF_ISLET:[1,2],RIVER_MANGROVE:[0,1],CLIFF_HEADLAND:[0,2],ICONIC_ROCK:[1,1]}
function palmPlan(r,arch){
  const c=_PALM_N[arch]||[1,2],k=intR(r,c[0],c[1]),palms=[]
  for(let i=0;i<k;i++)palms.push({x:Math.round(rangeR(r,120,680)),s:+rangeR(r,0.72,1.12).toFixed(2),tilt:+rangeR(r,-7,7).toFixed(1),fr:intR(r,4,6)})
  return palms
}
function buildBeachScene(beach){
  const arch=archetypeOf(beach)
  const r=rng(hashSeed((beach&&beach.id)||"x"))
  const fromLeft=r()<0.5
  let relief
  if(arch==="ICONIC_ROCK")relief={type:"diamond"}
  else if(arch==="CLIFF_HEADLAND")relief={type:"cliff",cut:Math.round(rangeR(r,232,262)),second:r()<0.5,fromLeft}
  else if(arch==="REEF_ISLET")relief={type:"islet",x:Math.round(rangeR(r,160,640))}
  else if(arch==="MARINA_URBAN")relief={type:"marina",boats:intR(r,1,2),fromLeft}
  else if(arch==="VOLCANIC_BLACK")relief={type:"morne",d:mornePath(r,intR(r,2,3),84,126,fromLeft),tall:true}
  else if(arch==="RIVER_MANGROVE")relief={type:"morne",d:mornePath(r,2,30,56,fromLeft)}
  else if(arch==="SHELTERED_BAY")relief={type:"morne",d:mornePath(r,intR(r,1,2),28,56,fromLeft)}
  else if(arch==="OPEN_SHORE")relief={type:"morne",d:mornePath(r,1,12,30,fromLeft),flat:true}
  else relief={type:"morne",d:mornePath(r,intR(r,3,6),44,90,fromLeft)}
  const palms=palmPlan(r,arch)
  const galets=arch==="VOLCANIC_BLACK"?Array.from({length:intR(r,3,5)},()=>({x:Math.round(rangeR(r,180,640)),y:Math.round(rangeR(r,500,540)),rx:+rangeR(r,5,11).toFixed(1)})):[]
  return {arch,fromLeft,relief,palms,galets}
}
// teinte d'eau pilotée par l'AFAI RÉEL (vire vers vert-brun seulement si l'algue est là).
// afai=0.2 placeholder → ~0 changement (eau turquoise honnête sur les plages clean). INCRÉMENT 4.
function _mixHex(a,b,k){a=a.replace("#","");b=b.replace("#","");const p=(s,i)=>parseInt(s.slice(i,i+2),16),m=x=>("0"+Math.round(x).toString(16)).slice(-2);return "#"+m(p(a,0)+(p(b,0)-p(a,0))*k)+m(p(a,2)+(p(b,2)-p(a,2))*k)+m(p(a,4)+(p(b,4)-p(a,4))*k)}
function waterTint(seaT,afai){const a=typeof afai==="number"?afai:0.2,inten=Math.max(0,Math.min(1,(a-0.15)/0.63));return inten<=0.03?seaT:_mixHex(seaT,"#6E5A1E",inten*0.55)}

// ── VisitPlan — le PLAN par plage (spec wdiiae0wd), ancré aux PROBLÈMES RÉELS des
//    habitants/sociétés. Logique PURE data→conseil (i18n). Vit DANS la fiche (pas un popup
//    flottant — feedback_no_ui_in_ui). H2S seulement si afai haut ET amas vieillissant (anti faux-loup).
function nearestCleanAlt(beach,allBeaches){
  if(!beach||!allBeaches||!allBeaches.length||beach.lat==null)return null
  const cand=allBeaches.filter(b=>b.id!==beach.id&&b.island===beach.island&&b.lat!=null&&(b.coast==="sheltered"||b.status==="clean"))
  let best=null,bd=1e9
  for(const b of cand){const d=haversine(beach.lat,beach.lng,b.lat,b.lng)-(b.coast==="sheltered"?3:0)-(b.status==="clean"?2:0);if(d<bd){bd=d;best=b}}
  return best
}
function buildBeachPlan(beach,lang,allBeaches,weeklyData){
  if(!beach)return{sections:[]}
  const _=(fr,en,es)=>_t(lang,fr,en,es)
  const st=beach.status,afai=typeof beach.afai==="number"?beach.afai:0.2
  const coast=beach.coast||(typeof classifyBeachCoast==="function"?classifyBeachCoast(beach.lat,beach.lng,beach.island):"atlantic")
  const aging=!!(weeklyData&&weeklyData.arrivalDetected)||!!beach.beachMemory
  const s=[]
  if(st==="clean"&&afai<0.3)s.push({tone:"clean",title:_("Meilleur moment","Best time","Mejor momento"),body:_("Bon toute la journée — golden hour 17-19h pour la photo.","Good all day — golden hour 5-7pm for photos.","Bueno todo el día — hora dorada 17-19h para la foto.")})
  else s.push({tone:"warn",title:_("Meilleur moment","Best time","Mejor momento"),body:_("Vas-y tôt le matin : l'odeur monte avec la chaleur de l'après-midi.","Go early morning: the smell rises with afternoon heat.","Ve temprano: el olor sube con el calor de la tarde.")})
  if(st==="avoid"){const alt=nearestCleanAlt(beach,allBeaches);if(alt){const dr=alt.drive?" ("+alt.drive+" min)":"";s.push({tone:"alt",title:_("Plutôt ailleurs","Go elsewhere","Mejor en otro lugar"),body:_("Plutôt "+alt.name+dr+", côte abritée presque toujours propre.","Try "+alt.name+dr+" instead, sheltered coast almost always clear.","Mejor "+alt.name+dr+", costa protegida casi siempre limpia.")})}}
  if(afai>=0.40&&aging)s.push({tone:"avoid",title:_("Santé & famille","Health & family","Salud y familia"),body:beach.kids
    ?_("Algues en décomposition = gaz (H2S). Déconseillé aux enfants, asthmatiques, femmes enceintes. Reste à l'écart des tas bruns.","Rotting seaweed releases gas (H2S). Not advised for kids, asthma, pregnancy. Keep clear of the brown piles.","Algas en descomposición liberan gas (H2S). No recomendado a niños, asmáticos, embarazadas. Aléjate de los montones marrones.")
    :_("Algues en décomposition = gaz (H2S). Si tu sens l'œuf pourri, éloigne-toi du tas et remonte au vent.","Rotting seaweed releases gas (H2S). If you smell rotten eggs, move away and upwind.","Algas en descomposición liberan gas (H2S). Si hueles a huevo podrido, aléjate y ponte a barlovento.")})
  if(beach.snorkel&&st==="clean"&&afai<0.3)s.push({tone:"clean",title:_("Sur place","On site","En el lugar"),body:_("Masque-tuba recommandé ici.","Bring your snorkel mask.","Trae tu máscara de snorkel.")})
  if(beach.parking===false)s.push({tone:"info",title:_("Stationnement","Parking","Estacionamiento"),body:_("Pas de parking aménagé : viens tôt ou en 2-roues.","No real parking: come early or on two wheels.","Sin estacionamiento: llega temprano o en moto.")})
  const com=(beach.commune||"").toLowerCase()
  const fishing=["saint-franç","saint-franc","le robert","le vauclin","sainte-anne","le marin"].some(c=>com.includes(c))
  if(fishing&&afai>=0.30)s.push({tone:"info",title:_("Côté pêcheurs","For fishermen","Para pescadores"),body:_("Nappes en mer = moteurs et hélices menacés, sorties perturbées.","Offshore mats threaten motors and propellers.","Las manchas amenazan motores y hélices.")})
  else if(coast==="sheltered"&&st==="clean")s.push({tone:"clean",title:_("Bon à savoir","Good to know","Bueno saber"),body:_("Côte abritée : reçoit rarement les sargasses, valeur sûre.","Sheltered coast: rarely gets sargassum, a safe bet.","Costa protegida: rara vez recibe sargazo, apuesta segura.")})
  return{sections:s}
}
function VisitPlan({beach,lang,allBeaches,weeklyData}){
  const plan=useMemo(()=>buildBeachPlan(beach,lang,allBeaches,weeklyData),[beach&&beach.id,beach&&beach.status,beach&&beach.afai,lang])
  if(!plan.sections.length)return null
  const tones={clean:"#22C55E",warn:"#F59E0B",avoid:"#E8522A",alt:"#5b3a8e",info:"#3fd07f"}
  return(<div style={{margin:"14px 0 6px"}}>
    <div style={{fontSize:11,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"var(--sg-mid,#8AA09B)",marginBottom:6}}>{_t(lang,"Le plan du Veilleur","The Watcher's plan","El plan del Vigía")}</div>
    {plan.sections.map((sec,i)=>(<div key={i} style={{display:"flex",gap:10,padding:"9px 0",borderTop:i?"1px solid rgba(120,140,135,.16)":"none"}}>
      <div style={{width:3,borderRadius:3,background:tones[sec.tone]||"#3fd07f",flexShrink:0,alignSelf:"stretch"}}/>
      <div><div style={{fontSize:13.5,fontWeight:800,color:tones[sec.tone]||"var(--sg-text,#1A2B27)"}}>{sec.title}</div><div style={{fontSize:13,lineHeight:1.42,color:"var(--sg-text,#33433F)",marginTop:1}}>{sec.body}</div></div>
    </div>))}
  </div>)
}

// ── BeachScene — CHAQUE plage a SA scène SVG (directive 14/06 : « notre valeur
//    est sur le svg » + « représente le diamant en svg, chaque plage avec sa
//    particularité »). Landmark réel + sable + statut + phase de l'heure locale.
//    Auto-contenue (sa propre CSS) : ne dépend d'aucun <style> externe. ────────
// BEACH_PHASE DÉRIVE de SCENE_TOKENS (clés scène sky/seaT/seaB/glit/sun/rim) +
// clés non-scène inline (cloud/rock/rockLit/trunk/frond, propres à chaque phase).
// Sortie byte-identique à l'ancien littéral (vérifié) — source unique, zéro drift.
const BEACH_PHASE=Object.fromEntries(Object.entries({
  dawn:  {cloud:"#1A2440",rock:"#1b2a33",rockLit:"#F2A968",trunk:"#14100C",frond:"#1a2e26"},
  day:   {cloud:"#EAF6F6",rock:"#5d6f62",rockLit:"#A8C6AE",trunk:"#3A2E1A",frond:"#3F6B52"},
  golden:{cloud:"#10333E",rock:"#16242A",rockLit:"#FFD884",trunk:"#120F0A",frond:"#16120C"},
  night: {cloud:"#0A1622",rock:"#0c171b",rockLit:"#9ADCD4",trunk:"#0A0806",frond:"#0C0A06"},
}).map(([k,ex])=>{const t=SCENE_TOKENS.phases[k];return[k,{sky:t.sky,seaT:t.seaT,seaB:t.seaB,glit:t.glit,sun:t.sun,rim:t.rim,...ex}]}))
function beachLandmark(beach){
  const k=((beach&&beach.id||"")+" "+(beach&&beach.name||"")+" "+(beach&&beach.slug||"")).toLowerCase()
  if(/diamant/.test(k))return "diamondRock"          // le Rocher du Diamant
  if(/caravelle|tartane|presqu|tombolo|chateaux|château/.test(k))return "cliff"  // falaise/presqu'île
  if(/salines|saline|grande anse|bourg/.test(k))return "open"  // longue plage ouverte
  return "morne"                                      // baie + morne vert (défaut antillais)
}
function BeachScene({beach,reveal}){
  const ph=(()=>{try{if(HERO_PH_OVERRIDE)return HERO_PH_OVERRIDE;const h=new Date().getHours();return h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"}catch(_){return "golden"}})()
  const t=BEACH_PHASE[ph]||BEACH_PHASE.golden
  const scene=useMemo(()=>buildBeachScene(beach),[beach&&beach.id])
  const black=scene.arch==="VOLCANIC_BLACK"
  const sand=black?(ph==="day"?"#3A352F":"#0F0D0B"):(ph==="day"?"#C9A86A":t.rock==="#16242A"?"#1C1712":"#15110D")
  const showRafts=beach&&(beach.status==="moderate"||beach.status==="avoid")
  // palmier paramétrique seedé : tronc courbe + couronne de frondes en éventail
  const palm=(p,i)=>{const bx=p.x,by=556,h=118*p.s,tx=bx+p.tilt*3.2,ty=by-h
    const trunk="M"+bx+" "+by+" Q"+Math.round(bx+(tx-bx)*0.45)+" "+Math.round(by-h*0.55)+" "+Math.round(tx)+" "+Math.round(ty)
    const fr=[],n=p.fr
    for(let f=0;f<n;f++){const a=(-150+120*(n>1?f/(n-1):0.5))*Math.PI/180
      const ex=Math.round(tx+Math.cos(a)*48*p.s),ey=Math.round(ty+Math.sin(a)*42*p.s)
      const mx=Math.round(tx+Math.cos(a)*26*p.s),my=Math.round(ty+Math.sin(a)*22*p.s-5)
      fr.push("M"+Math.round(tx)+" "+Math.round(ty)+" Q"+mx+" "+my+" "+ex+" "+ey)}
    return(<g key={i}><path d={trunk} stroke={t.trunk} strokeWidth={Math.max(5,12*p.s)} fill="none" strokeLinecap="round"/><g fill="none" stroke={t.frond} strokeWidth={Math.max(4,8*p.s)} strokeLinecap="round">{fr.map((d,j)=>(<path key={j} d={d}/>))}</g></g>)}
  return(
    <div aria-hidden="true" className={reveal?"bsc-reveal":undefined} style={{position:"absolute",inset:0}}>
      <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
        {/* CALME (INCRÉMENT 0 spec wdiiae0wd) : au repos la scène est un TABLEAU. On tue les 11
            boucles idle (glit/raft/rake/net/swim/bird/shim/sat/beam/rays/moonp) — éléments figés à
            leur opacité de repos. Seuls les 2 nuages très lents subsistent. La vie viendra de `reveal`. */}
        <style>{`.bsc-cloud{animation:bscCloud 80s ease-in-out infinite alternate}@keyframes bscCloud{to{transform:translateX(-46px)}}.bsc-cloud2{animation:bscCloud2 110s ease-in-out infinite alternate-reverse}@keyframes bscCloud2{to{transform:translateX(40px)}}.bsc-beam{opacity:.1}.bsc-shim{opacity:.5}.bsc-moonp{opacity:.34}@keyframes bscReveal{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}.bsc-reveal{animation:bscReveal .85s cubic-bezier(.22,1,.36,1) both;transform-origin:50% 60%}@media(prefers-reduced-motion:reduce){.bsc-cloud,.bsc-cloud2,.bsc-reveal{animation:none}}`}</style>
        <defs>
          <linearGradient id="bscSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.sky[0]}/><stop offset=".52" stopColor={t.sky[1]}/><stop offset=".84" stopColor={t.sky[2]}/><stop offset="1" stopColor={t.sky[3]}/></linearGradient>
          <linearGradient id="bscSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={waterTint(t.seaT,beach&&beach.afai)}/><stop offset="1" stopColor={t.seaB}/></linearGradient>
        </defs>
        <rect width="800" height="360" fill="url(#bscSky)"/>
        {t.sun==="set"&&<><circle cx="400" cy="330" r="120" fill={t.glit} opacity=".08"/><circle cx="400" cy="330" r="64" fill={t.glit} opacity=".12"/><path d="M340 332 a60 60 0 0 1 120 0 Z" fill={t.glit} opacity=".9"/></>}
        {t.sun==="high"&&<><circle cx="300" cy="98" r="52" fill="#FDFCF7" opacity=".2"/><circle cx="300" cy="98" r="30" fill="#FFF4D6"/></>}
        {/* Rayons de soleil — la lumière cinématique de la home, sur chaque plage */}
        {t.sun==="set"&&<g className="bsc-rays">{[-52,-26,0,26,52].map((a,i)=>(<path key={i} d="M400 330 L390 150 L410 150 Z" fill={t.glit} opacity=".1" transform={"rotate("+a+" 400 330)"}/>))}</g>}
        {t.sun==="high"&&<g className="bsc-rays">{[-46,-22,2,26,50].map((a,i)=>(<path key={i} d="M300 98 L291 300 L309 300 Z" fill="#FFF4D6" opacity=".09" transform={"rotate("+a+" 300 98)"}/>))}</g>}
        {t.sun==="moon"&&<><circle cx="320" cy="96" r="40" fill="#9ADCD4" opacity=".08"/><circle cx="320" cy="96" r="20" fill="#E6F2EF"/><circle cx="313" cy="90" r="3.6" fill="#C2D8D2" opacity=".7"/></>}
        {ph==="night"&&[[90,60],[220,90],[380,50],[540,82],[680,56],[150,150],[470,140],[620,120]].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.1" fill="#fff" opacity=".5"/>))}
        <g className="bsc-cloud"><path d="M120 128 q14 -26 48 -26 q18 -18 46 -12 q30 -8 44 12 q26 2 30 26 Z" fill={t.cloud} opacity=".9"/><path d="M122 129 h162" stroke={t.rim} strokeWidth="2" opacity=".32"/></g>
        <g className="bsc-cloud2"><path d="M512 92 q12 -22 42 -22 q16 -13 40 -9 q26 -7 38 11 q22 2 26 20 Z" fill={t.cloud} opacity=".78"/><path d="M514 93 h140" stroke={t.rim} strokeWidth="1.7" opacity=".26"/></g>
        {ph!=="night"&&<g className="bsc-bird" opacity=".55" stroke={ph==="day"?"#2A5566":t.rim} strokeWidth="2.4" fill="none" strokeLinecap="round"><path d="M712 138 q5.5 -6.5 11 0 q5.5 -6.5 11 0"/><path d="M754 124 q4.5 -5 9 0 q4.5 -5 9 0"/><path d="M648 156 q5 -6 10 0 q5 -6 10 0"/><path d="M576 128 q4 -5 8 0 q4 -5 8 0"/><path d="M620 122 q4.5 -5.5 9 0 q4.5 -5.5 9 0"/></g>}
        <rect x="-40" y="330" width="880" height="200" fill="url(#bscSea)"/>
        {t.sun==="moon"&&<path className="bsc-moonp" d="M302 332 L338 332 L356 474 Q320 486 284 474 Z" fill="#9ADCD4"/>}
        {scene.relief.type==="diamond"&&<g>
          <path d="M468 340 Q481 284 509 252 Q525 234 534 253 Q560 292 570 340 Z" fill={t.rock}/>
          <path d="M509 252 Q525 234 534 253 Q560 292 570 340 L534 340 Z" fill="#000" opacity=".22"/>
          <path d="M509 252 Q481 284 468 340 L509 340 Z" fill={t.rockLit} opacity=".26"/>
          <path d="M468 340 Q519 351 570 340 L570 349 Q519 360 468 349 Z" fill={t.rock} opacity=".45"/>
        </g>}
        {scene.relief.type==="cliff"&&(()=>{const cut=scene.relief.cut,fl=scene.relief.fromLeft
          const main=fl?("M-40 340 L-40 "+cut+" Q120 "+(cut-38)+" 236 "+(cut+8)+" L266 340 Z"):("M840 340 L840 "+cut+" Q680 "+(cut-38)+" 564 "+(cut+8)+" L534 340 Z")
          const edge=fl?("M-40 "+cut+" Q120 "+(cut-38)+" 236 "+(cut+8)):("M840 "+cut+" Q680 "+(cut-38)+" 564 "+(cut+8))
          return(<g><path d={main} fill={t.rock}/><path d={edge} fill="none" stroke={t.rockLit} strokeWidth="3" opacity=".25"/>{scene.relief.second&&<path d={fl?"M840 340 L840 288 Q772 272 714 302 L692 340 Z":"M-40 340 L-40 288 Q28 272 86 302 L108 340 Z"} fill={t.rock} opacity=".8"/>}</g>)})()}
        {scene.relief.type==="islet"&&(()=>{const x=scene.relief.x
          return(<g><path d="M-40 366 Q400 358 840 368" fill="none" stroke={t.rim} strokeWidth="2" strokeDasharray="5 9" opacity=".38"/><path d={"M"+(x-46)+" 340 Q"+x+" 300 "+(x+46)+" 340 Z"} fill={t.rock} opacity=".9"/><path d={"M"+(x-46)+" 340 Q"+x+" 300 "+(x+46)+" 340"} fill="none" stroke={t.rockLit} strokeWidth="2" opacity=".22"/></g>)})()}
        {scene.relief.type==="marina"&&(()=>{const fl=scene.relief.fromLeft
          return(<g><rect x={fl?40:524} y="334" width="172" height="6" fill={t.trunk} opacity=".8"/><g stroke={t.trunk} strokeWidth="4.5" opacity=".7" strokeLinecap="round">{[0,1,2,3,4].map(i=>{const px=(fl?64:548)+i*30;return(<line key={i} x1={px} y1="338" x2={px+8} y2="372"/>)})}</g>{Array.from({length:scene.relief.boats}).map((_,i)=>{const bx=372+i*84;return(<g key={i} transform={"translate("+bx+",348)"}><ellipse rx="22" ry="6.5" fill={t.rock}/><line x1="-2" y1="-3" x2="-2" y2="-28" stroke={t.rock} strokeWidth="2.4"/><path d="M-2 -26 L16 -7 L-2 -7 Z" fill={t.rockLit} opacity=".55"/></g>)})}</g>)})()}
        {scene.relief.type==="morne"&&<g><path d={scene.relief.d} fill={t.rock} opacity={scene.relief.flat?".72":".95"}/><path d={scene.relief.d} fill="none" stroke={t.rockLit} strokeWidth="2.4" opacity=".2"/></g>}
        <line className="bsc-glit" x1="-40" y1="356" x2="840" y2="356" stroke={t.glit} strokeWidth="2.2" strokeDasharray="3 13" opacity=".5"/>
        <line className="bsc-glit" x1="-40" y1="386" x2="840" y2="386" stroke={t.glit} strokeWidth="1.8" strokeDasharray="2 17" opacity=".3" style={{animationDelay:"-3s"}}/>
        <line className="bsc-glit" x1="-40" y1="420" x2="840" y2="420" stroke={t.glit} strokeWidth="1.6" strokeDasharray="2 23" opacity=".18" style={{animationDelay:"-5s"}}/>
        <g fill={t.glit}><circle className="bsc-shim" cx="372" cy="372" r="1.9"/><circle className="bsc-shim" cx="392" cy="398" r="1.5" style={{animationDelay:"-1s"}}/><circle className="bsc-shim" cx="356" cy="410" r="1.6" style={{animationDelay:"-2s"}}/><circle className="bsc-shim" cx="412" cy="384" r="1.4" style={{animationDelay:"-1.6s"}}/></g>
        {/* « Le Veilleur veille » — satellite qui scanne, faisceau qui balaie la mer (signature home, sur chaque plage) */}
        <g className="bsc-sat">
          <path className="bsc-beam" d="M482 82 L424 372 L548 372 Z" fill={t.glit}/>
          <g transform="translate(482,80)">
            <rect x="-17" y="-3" width="9" height="6.5" rx="1.5" fill={t.rim} opacity=".85"/>
            <rect x="8" y="-3" width="9" height="6.5" rx="1.5" fill={t.rim} opacity=".85"/>
            <rect x="-6.5" y="-6.5" width="13" height="13" rx="3.2" fill="#5b3a8e"/>
            <rect x="-6.5" y="-6.5" width="13" height="4.2" rx="3.2" fill="#FFC72C"/>
            <circle cx="0" cy="1.4" r="3.2" fill="#07201E"/><circle cx="0" cy="1.4" r="2.2" fill={t.glit}/>
          </g>
        </g>
        {beach&&beach.status==="clean"&&<g>
          {/* NICKEL : des baigneurs dans une eau claire */}
          <g className="bsc-swim"><circle cx="372" cy="392" r="6" fill="#0D2B26"/><path d="M360 398 q12 -8 24 0" stroke="#0D2B26" strokeWidth="3.4" fill="none" strokeLinecap="round"/></g>
          <g className="bsc-swim" style={{animationDelay:"-2.1s"}}><circle cx="452" cy="404" r="5" fill="#0D2B26"/><path d="M442 409 q10 -7 20 0" stroke="#0D2B26" strokeWidth="3" fill="none" strokeLinecap="round"/></g>
          <path d="M348 396 h8 M396 398 h7 M462 410 h8" stroke={t.rim} strokeWidth="1.6" opacity=".5" strokeLinecap="round"/>
        </g>}
        {beach&&beach.status==="moderate"&&<g>
          {/* EN COLLECTE : un filet posé (bouées dorées) + un ramasseur qui râtelle */}
          <g className="bsc-net"><path d="M286 372 Q360 382 434 374" fill="none" stroke="#CDEBE6" strokeWidth="1.2" strokeDasharray="1.5 4" opacity=".6"/><circle cx="300" cy="374" r="3" fill="#FFC72C"/><circle cx="344" cy="378" r="2.6" fill="#FFC72C"/><circle cx="388" cy="375" r="2.6" fill="#FFC72C"/><circle cx="432" cy="374" r="3" fill="#FFC72C"/></g>
          <g className="bsc-raft" transform="translate(330,388) scale(.62)" opacity=".8"><ellipse rx="22" ry="7" fill="#7a5c14"/><ellipse cx="-10" cy="-3" rx="9" ry="4" fill="#8a6c1c"/></g>
          <g transform="translate(458,502)"><g transform="translate(-20,12) scale(.5)" opacity=".7"><ellipse rx="22" ry="7" fill="#7a5c14"/></g><g fill="#0E1F1A"><circle cx="0" cy="-27" r="5"/><path d="M-5 -22 q5 -4 10 0 l-1.5 19 h-7 Z"/><path d="M-4 -4 l-3 12 M4 -4 l3 12" stroke="#0E1F1A" strokeWidth="2.4" strokeLinecap="round" fill="none"/></g><g className="bsc-rake" stroke="#3A2A14" strokeWidth="2.2" fill="none" strokeLinecap="round"><line x1="2" y1="-19" x2="20" y2="8"/><path d="M13 6 h13 M15 3 v7 M19 2 v8.5 M23 2 v8"/></g></g>
        </g>}
        {beach&&beach.status==="avoid"&&<g>
          {/* PLEINE : nappes en mer (qui dérivent) + amas échoués sur le sable */}
          <g className="bsc-raft"><g transform="translate(300,372)"><ellipse rx="24" ry="8" fill="#7a5c14"/><ellipse cx="-12" cy="-4" rx="10" ry="5" fill="#8a6c1c"/><ellipse cx="12" cy="-3" rx="11" ry="5" fill="#5d400e"/></g><g transform="translate(470,390) scale(.9)"><ellipse rx="22" ry="7" fill="#7a5c14"/><ellipse cx="8" cy="-3" rx="9" ry="4" fill="#8a6c1c"/></g><g transform="translate(386,360) scale(.55)"><ellipse rx="22" ry="7" fill="#6b4a12"/></g></g>
          <g><ellipse cx="318" cy="502" rx="72" ry="14" fill="#5d400e"/><ellipse cx="288" cy="496" rx="34" ry="10" fill="#7a5c14"/><ellipse cx="472" cy="514" rx="60" ry="12" fill="#6b4a12"/><ellipse cx="492" cy="508" rx="28" ry="8" fill="#8a6c1c"/></g>
        </g>}
        <path d="M-40 472 Q200 434 430 448 Q640 460 840 502 L840 620 L-40 620 Z" fill={sand}/>
        <path d="M-40 472 Q200 434 430 448 Q640 460 840 502" fill="none" stroke={t.rim} strokeWidth="2.4" opacity=".3"/>
        {scene.galets.map((gp,i)=>(<ellipse key={"g"+i} cx={gp.x} cy={gp.y} rx={gp.rx} ry={gp.rx*0.5} fill="#1a1714" opacity=".7"/>))}
        {scene.palms.map(palm)}
      </svg>
    </div>
  )
}

// ── StoryEngine — LE MOTEUR (directive 14/06 : « un moteur landing/page/scroll/
//    explication/jeu/découverte à travers l'UI pour scaler la home partout »).
//    Mécanique scrollytelling éprouvée (issue de ScrollStory : sticky golden-hour,
//    scroll→opacités de beats pilotées par l'ÉTAT (jamais vide), CSS auto-contenue,
//    capture sur document, analytics par beat). GÉNÉRIQUE sur une config `beats` :
//    chaque surface = une config, plus de recodage. ────────────────────────────
function StoryEngine({beats,lang,accent="#FFC72C",ev="sg_engine_beat",onCTA,onBeat}){
  const boxRef=useRef(null)
  const [beat,setBeat]=useState(0)
  const beatRef=useRef(-1)
  const [rm]=useState(()=>{try{return window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){return false}})
  const N=Math.max(1,beats.length)
  useEffect(()=>{
    const box=boxRef.current;if(!box)return
    const st=box.style
    if(rm){for(let i=0;i<N;i++)st.setProperty(`--e${i}`,i===N-1?"1":"0");setBeat(N-1);return}
    let raf=0
    const upd=()=>{
      raf=0
      const r=box.getBoundingClientRect()
      const vh=window.innerHeight||1
      const total=Math.max(1,r.height-vh)
      const p=Math.max(0,Math.min(1,-r.top/total))
      st.setProperty("--gp",p.toFixed(4))
      const span=N>1?1/(N-1):1
      for(let i=0;i<N;i++){
        const c=N>1?i/(N-1):.5
        const o=Math.max(0,Math.min(1,1-Math.abs(p-c)/(span*.85)))
        st.setProperty(`--e${i}`,o.toFixed(3))
        // progression INTERNE du beat i (0→1 quand on le traverse) → anime la
        // scène pendant le scroll (l'« enchaînement des animations » de l'accueil).
        st.setProperty(`--p${i}`,Math.max(0,Math.min(1,p*(N-1)-(i-.5))).toFixed(3))
      }
      const b=Math.max(0,Math.min(N-1,Math.round(p*(N-1))))
      const vis=r.top<vh&&r.bottom>0
      if(vis&&b!==beatRef.current){beatRef.current=b;setBeat(b);try{track(ev,{b:b+1,n:N})}catch(_){}try{onBeat&&onBeat(b,N)}catch(_){}}
    }
    const onScroll=()=>{if(!raf)raf=requestAnimationFrame(upd)}
    document.addEventListener("scroll",onScroll,{passive:true,capture:true})
    window.addEventListener("resize",onScroll)
    upd()
    return()=>{document.removeEventListener("scroll",onScroll,{capture:true});window.removeEventListener("resize",onScroll);if(raf)cancelAnimationFrame(raf)}
  },[N,rm])
  const baseVars={"--gp":(N>1?beat/(N-1):0)}
  for(let i=0;i<N;i++){baseVars[`--e${i}`]=(beat===i?1:0);baseVars[`--p${i}`]=(i<beat?1:i===beat?.5:0)}
  const last=beats[N-1]
  return(
    <section ref={boxRef} aria-label={beats[0]&&beats[0].heading} style={{position:"relative",height:rm?"auto":`${Math.max(2,N)*100}vh`,background:"#120821",...baseVars}}>
      <style>{`.se-vp{height:100vh}@supports(height:100svh){.se-vp{height:100svh}}`}</style>
      <div className="se-vp" style={{position:rm?"relative":"sticky",top:0,overflow:"hidden",background:"#120821",height:rm?"min(82vh,640px)":undefined}}>
        <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
          {beats.map((bt,i)=>(<g key={i} style={{opacity:`var(--e${i})`,"--p":`var(--p${i})`}}>{bt.scene}</g>))}
        </svg>
        <div style={{position:"absolute",left:0,right:0,bottom:0,top:0,pointerEvents:"none"}}>
          {beats.map((bt,i)=>(
            <div key={i} style={{position:"absolute",left:0,right:0,bottom:0,padding:"0 22px calc(36px + env(safe-area-inset-bottom))",opacity:`var(--e${i})`}}>
              <div style={{maxWidth:560,margin:"0 auto"}}>
                {bt.eyebrow&&<div style={{fontSize:11,fontWeight:700,letterSpacing:".16em",color:accent,textTransform:"uppercase",marginBottom:8}}>{bt.eyebrow}</div>}
                <h2 className="anton" style={{fontWeight:400,fontSize:"clamp(26px,6.6vw,42px)",lineHeight:1.02,textTransform:"uppercase",margin:0,color:"#fff"}}>{bt.heading}</h2>
                {bt.sub&&<p style={{fontSize:14,color:"rgba(255,255,255,.74)",marginTop:10,lineHeight:1.5,maxWidth:440}}>{bt.sub}</p>}
                {i===N-1&&onCTA&&last&&last.cta&&<button onClick={onCTA} style={{pointerEvents:"auto",marginTop:18,cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,padding:"15px 26px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>{last.cta}</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
// ── PanelStoryEngine — JUMEAU du StoryEngine pour les PANNEAUX CLIPPÉS (.sheet,
//    .sg-modal-panel : position:fixed;overflow:auto;max-height:85vh). Le moteur
//    prod lit la géométrie FENÊTRE (faux ici) ; celui-ci lit le scroll du
//    CONTENEUR (scrollRef.scrollTop) → scrub correct. Tailles posées en JS
//    (vp = hauteur visible du conteneur ; section = N×). Catch cohérence 14/06.
function PanelStoryEngine({beats,lang,accent="#FFC72C",ev="sg_panel_beat",onCTA,scrollRef}){
  const boxRef=useRef(null)
  const vpRef=useRef(null)
  const [beat,setBeat]=useState(0)
  const beatRef=useRef(-1)
  const [rm]=useState(()=>{try{return window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){return false}})
  const N=Math.max(1,beats.length)
  useEffect(()=>{
    const box=boxRef.current,vp=vpRef.current,cont=scrollRef&&scrollRef.current
    if(!box||!vp||!cont)return
    const st=box.style
    if(rm){box.style.height="auto";vp.style.height="min(72vh,560px)";for(let i=0;i<N;i++){st.setProperty(`--e${i}`,i===N-1?"1":"0");st.setProperty(`--p${i}`,"1")}setBeat(N-1);return}
    const setSizes=()=>{const ch=cont.clientHeight||1;vp.style.height=ch+"px";box.style.height=(N*ch)+"px"}
    setSizes()
    let raf=0
    const upd=()=>{
      raf=0
      const ch=cont.clientHeight||1
      const total=Math.max(1,(N-1)*ch)
      const p=Math.max(0,Math.min(1,(cont.scrollTop-box.offsetTop)/total))
      st.setProperty("--gp",p.toFixed(4))
      const span=N>1?1/(N-1):1
      for(let i=0;i<N;i++){
        const c=N>1?i/(N-1):.5
        st.setProperty(`--e${i}`,Math.max(0,Math.min(1,1-Math.abs(p-c)/(span*.85))).toFixed(3))
        st.setProperty(`--p${i}`,Math.max(0,Math.min(1,p*(N-1)-(i-.5))).toFixed(3))
      }
      const b=Math.max(0,Math.min(N-1,Math.round(p*(N-1))))
      if(b!==beatRef.current){beatRef.current=b;setBeat(b);try{track(ev,{b:b+1,n:N})}catch(_){}}
    }
    const onScroll=()=>{if(!raf)raf=requestAnimationFrame(upd)}
    const onResize=()=>{setSizes();onScroll()}
    cont.addEventListener("scroll",onScroll,{passive:true})
    window.addEventListener("resize",onResize)
    upd()
    return()=>{cont.removeEventListener("scroll",onScroll);window.removeEventListener("resize",onResize);if(raf)cancelAnimationFrame(raf)}
  },[N,rm,scrollRef])
  const baseVars={"--gp":(N>1?beat/(N-1):0)}
  for(let i=0;i<N;i++){baseVars[`--e${i}`]=(beat===i?1:0);baseVars[`--p${i}`]=(i<beat?1:i===beat?.5:0)}
  const last=beats[N-1]
  return(
    <section ref={boxRef} style={{position:"relative",background:"#120821",...baseVars}}>
      <div ref={vpRef} style={{position:rm?"relative":"sticky",top:0,overflow:"hidden",background:"#120821"}}>
        <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
          {beats.map((bt,i)=>(<g key={i} style={{opacity:`var(--e${i})`,"--p":`var(--p${i})`}}>{bt.scene}</g>))}
        </svg>
        <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
          {beats.map((bt,i)=>(
            <div key={i} style={{position:"absolute",left:0,right:0,bottom:0,padding:"0 22px calc(26px + env(safe-area-inset-bottom))",opacity:`var(--e${i})`}}>
              <div style={{maxWidth:560,margin:"0 auto"}}>
                {bt.eyebrow&&<div style={{fontSize:11,fontWeight:700,letterSpacing:".16em",color:accent,textTransform:"uppercase",marginBottom:8}}>{bt.eyebrow}</div>}
                <h2 className="anton" style={{fontWeight:400,fontSize:"clamp(24px,6.2vw,38px)",lineHeight:1.04,textTransform:"uppercase",margin:0,color:"#fff"}}>{bt.heading}</h2>
                {bt.sub&&<p style={{fontSize:14,color:"rgba(255,255,255,.74)",marginTop:9,lineHeight:1.5,maxWidth:440}}>{bt.sub}</p>}
                {i===N-1&&onCTA&&last&&last.cta&&<button onClick={onCTA} style={{pointerEvents:"auto",marginTop:16,cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,padding:"15px 26px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>{last.cta}</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Config DÉCOUVERTE (éducatif SVG, « svg simple propriétaire instructif » :
// la grande ceinture → la dérive → l'échouage/H2S → les solutions recyclage/tri).
function discoveryBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return[
    {eyebrow:T("LA SOURCE","THE SOURCE","EL ORIGEN"),heading:T("Une ceinture de 8000 km","An 8,000 km belt","Un cinturón de 8000 km"),sub:T("Chaque année, une nappe d'algues traverse l'Atlantique, de l'Afrique aux Caraïbes.","Every year a raft of seaweed crosses the Atlantic, from Africa to the Caribbean.","Cada año una masa de algas cruza el Atlántico, de África al Caribe."),
      scene:<><rect width="800" height="600" fill="#06211E"/><circle cx="400" cy="300" r="240" fill="#0A2E2A"/><circle cx="400" cy="300" r="240" fill="none" stroke="#1A5852" strokeWidth="2"/><path d="M170 380 Q400 300 630 360" fill="none" stroke="#7a5c14" strokeWidth="22" strokeLinecap="round" opacity=".85"/><path d="M170 380 Q400 300 630 360" fill="none" stroke="#a8862a" strokeWidth="8" strokeLinecap="round" strokeDasharray="4 14" opacity=".7"/><text x="246" y="372" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB">{T("Afrique","Africa","África")}</text><text x="560" y="348" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB">{T("Caraïbes","Caribbean","Caribe")}</text></>},
    {eyebrow:T("LA DÉRIVE","THE DRIFT","LA DERIVA"),heading:T("Le vent décide","The wind decides","El viento decide"),sub:T("Courants et alizés poussent les bancs vers certaines plages — pas toutes, pas en même temps.","Currents and trade winds push the rafts onto some beaches — not all, not at once.","Las corrientes y los vientos empujan los bancos a ciertas playas."),
      scene:<><rect width="800" height="600" fill="url(#bscSea)"/><rect width="800" height="600" fill="#0A2E2A"/>{[160,260,360].map((y,i)=>(<path key={i} d={`M-40 ${y} q60 -16 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0`} fill="none" stroke="#1A5852" strokeWidth="2" opacity=".5"/>))}<g><path d="M120 250 L520 250" stroke="#FFC72C" strokeWidth="2" strokeDasharray="6 8" opacity=".7"/><path d="M520 250 l-16 -8 0 16 Z" fill="#FFC72C"/></g><g transform="translate(150,250)"><ellipse rx="26" ry="9" fill="#7a5c14"/><ellipse cx="-12" cy="-4" rx="11" ry="5" fill="#8a6c1c"/></g><g transform="translate(560,420)"><path d="M-40 0 Q200 -30 430 0 L430 180 L-40 180 Z" fill="#1C1712"/></g></>},
    {eyebrow:T("LE RISQUE","THE RISK","EL RIESGO"),heading:T("En décomposition, ça pique","Rotting, it stings","Al descomponerse, irrita"),sub:T("Les algues échouées libèrent du H2S (odeur d'œuf). On surveille pour t'éviter ça.","Stranded seaweed releases H2S (egg smell). We watch so you avoid it.","Las algas varadas liberan H2S (olor a huevo). Vigilamos para evitártelo."),
      scene:<><rect width="800" height="600" fill="#0B2230"/><rect y="300" width="800" height="300" fill="#1C1712"/><g transform="translate(400,330)"><ellipse rx="180" ry="34" fill="#5d400e"/><ellipse cx="-90" cy="-12" rx="60" ry="20" fill="#7a5c14"/><ellipse cx="80" cy="-10" rx="70" ry="22" fill="#6b4a12"/></g><g fill="#E8522A" opacity=".55"><circle cx="330" cy="280" r="4"/><circle cx="360" cy="250" r="3"/><circle cx="430" cy="262" r="3.5"/><circle cx="470" cy="238" r="2.6"/></g><text x="400" y="250" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="20" fill="#E8522A">H₂S</text></>},
    {eyebrow:T("LES SOLUTIONS","THE SOLUTIONS","LAS SOLUCIONES"),heading:T("Barrer, récolter, recycler","Block, collect, recycle","Frenar, recoger, reciclar"),sub:T("Barrages flottants, ramassage rapide, et valorisation : engrais, bioplastique, énergie.","Floating booms, fast collection, and reuse: fertiliser, bioplastic, energy.","Barreras, recogida rápida y reciclaje: abono, bioplástico, energía."),cta:T("Voir ma plage du jour →","See my beach today →","Ver mi playa de hoy →"),
      scene:<><rect width="800" height="600" fill="#06211E"/><rect y="320" width="800" height="280" fill="#1A5852" opacity=".5"/><g><circle cx="170" cy="320" r="10" fill="#FFC72C"/><circle cx="230" cy="320" r="10" fill="#FFC72C"/><circle cx="290" cy="320" r="10" fill="#FFC72C"/><circle cx="350" cy="320" r="10" fill="#FFC72C"/><line x1="160" y1="332" x2="360" y2="332" stroke="#E8A800" strokeWidth="3"/></g><g transform="translate(470,300)"><path d="M-30 20 L30 20 L22 36 L-22 36 Z" fill="#16282C" stroke="#FFC72C" strokeWidth="1.5"/><rect x="-8" y="-6" width="16" height="26" rx="2" fill="#0A1714"/></g><g transform="translate(620,360)"><path d="M0 -26 A26 26 0 1 1 -18 44" fill="none" stroke="#22C55E" strokeWidth="6"/><path d="M-18 30 l0 16 l16 -4 Z" fill="#22C55E"/></g><text x="620" y="368" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="13" fill="#9FE1CB">RE</text></>},
  ]
}
function DiscoveryStory({lang,onClose,onShowMap}){
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Comprendre les sargasses","Understand sargassum","Entender el sargazo")} style={{position:"absolute",inset:0,zIndex:1060,background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"fixed",top:"calc(12px + env(safe-area-inset-top))",right:12,zIndex:30,width:42,height:42,borderRadius:21,background:"rgba(10,23,20,.55)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:16,cursor:"pointer"}}>✕</button>
      <StoryEngine beats={discoveryBeats(lang)} lang={lang} ev="sg_discovery_beat" onCTA={onShowMap}/>
    </div>
  )
}

function comprendreBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const d = discoveryBeats(lang)
  if(d.length > 0) {
    d[d.length - 1].cta = T("Voir les plages →", "See the beaches →", "Ver las playas →")
  }
  return d
}

function satelliteBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return [
    {
      eyebrow: T("SURVEILLANCE", "SURVEILLANCE", "VIGILANCIA"),
      heading: T("On regarde d'en haut", "Looking from above", "Mirando desde arriba"),
      sub: T("Le satellite Sentinel-3 scanne l'Atlantique en continu pour détecter la signature lumineuse des algues.", "The Sentinel-3 satellite continuously scans the Atlantic to detect the light signature of the algae.", "El satélite Sentinel-3 escanea continuamente el Atlántico para detectar la firma luminosa de las algas."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06121A"/>
          {[120,90,300,70,520,110,680,80,420,150,600,180].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.3" fill="#fff" opacity=".5"/>))}
          <circle cx="400" cy="380" r="160" fill="#155A5A" opacity=".3"/>
          <path d="M400 150 L240 380 L560 380 Z" fill="#3fd07f" opacity="0.12"/>
          {miVeil(400, 150, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("L'INDICE AFAI", "THE AFAI INDEX", "EL ÍNDICE AFAI"),
      heading: T("L'indice de détection", "The detection index", "El índice de detección"),
      sub: T("L'indice AFAI mesure la concentration d'algues flottantes. En dessous de 0.15 la mer est propre, au-dessus de 0.40 l'alerte est maximale.", "The AFAI index measures floating algae concentration. Below 0.15 the sea is clean, above 0.40 it is a high alert.", "El índice AFAI mide la concentración de algas flotantes. Por debajo de 0.15 el mar está limpio, por encima de 0.40 la alerta es máxima."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0A2E2A"/>
          {[160,260,360].map((y,i)=>(<path key={i} d={`M-40 ${y} q60 -16 120 0 t120 0 t120 0`} fill="none" stroke="#5b3a8e" strokeWidth="2" opacity=".4"/>))}
          <path d="M400 50 L100 550 L700 550 Z" fill="#3fd07f" opacity="0.08"/>
          <g transform="translate(320,380)"><ellipse rx="60" ry="14" fill="#7a5c14" opacity=".85"/><ellipse cx="-30" cy="-6" rx="35" ry="9" fill="#8a6c1c" opacity=".85"/></g>
          <g transform="translate(480,420)"><ellipse rx="80" ry="18" fill="#5d400e" opacity=".85"/><ellipse cx="20" cy="-4" rx="40" ry="10" fill="#7a5c14" opacity=".85"/></g>
          <line x1="0" y1="400" x2="800" y2="400" stroke="#FFC72C" strokeWidth="3" opacity="0.8"/>
          <text x="400" y="370" fontFamily="ui-monospace,monospace" fontSize="14" fill="#FFC72C" textAnchor="middle">AFAI SCAN</text>
        </g>
      )
    },
    {
      eyebrow: T("RÉSOLUTIONS & FRÉQUENCE", "RESOLUTION & FREQUENCY", "RESOLUCIÓN Y FRECUENCIA"),
      heading: T("Scan toutes les 3 heures", "Scan every 3 hours", "Escaneo cada 3 horas"),
      sub: T("La grille de détection a une précision de 300 mètres, actualisée plusieurs fois par jour pour anticiper les arrivées.", "The detection grid has a 300-meter precision, updated several times a day to anticipate arrivals.", "La cuadrícula de detección tiene una precisión de 300 metros, actualizada varias veces al día para anticipar llegadas."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          {Array.from({length:9}).map((_,i)=>(<line key={`v${i}`} x1={80+i*80} y1="100" x2={80+i*80} y2="500" stroke="#1A5852" strokeWidth="1" opacity=".5"/>))}
          {Array.from({length:6}).map((_,i)=>(<line key={`h${i}`} x1="80" y1={100+i*80} x2="720" y2={100+i*80} stroke="#1A5852" strokeWidth="1" opacity=".5"/>))}
          <rect x="320" y="260" width="80" height="80" fill="#FFE08A" opacity="0.25" stroke="#FFC72C" strokeWidth="2"/>
          <text x="360" y="305" fontFamily="ui-monospace,monospace" fontSize="16" fill="#FFC72C" textAnchor="middle">300m</text>
          {miVeil(600, 180, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("TEMPS RÉEL", "REAL TIME", "TIEMPO REAL"),
      heading: T("Ce que voit ta plage", "What your beach sees", "Lo que ve tu playa"),
      sub: T("Grâce aux données satellite croisées en direct, tu sais si l'eau devant ta plage préférée est propre maintenant.", "Thanks to cross-referenced live satellite data, you know if the water in front of your favorite beach is clean right now.", "Gracias a los datos satelitales cruzados en vivo, sabes si el agua de tu playa favorita está limpia ahora."),
      cta: T("Voir la carte en direct →", "See the live map →", "Ver el mapa en vivo →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0B2230"/>
          <path d="M0 380 Q400 350 800 380 L800 600 L0 600 Z" fill="#1C1712"/>
          <path d="M0 380 Q400 370 800 380" fill="none" stroke="#FFE47A" strokeWidth="2" opacity=".4"/>
          {miVeil(400, 200, "#5b3a8e", "#3fd07f")}
          <g transform="translate(400,430)">
            <ellipse rx="120" ry="24" fill="#22C55E" opacity=".8"/>
            <text y="8" fontFamily="system-ui,sans-serif" fontSize="18" fontWeight="800" fill="#fff" textAnchor="middle">PROPRE / CLEAN</text>
          </g>
        </g>
      )
    }
  ]
}

function h2sBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return [
    {
      eyebrow: T("DANGER SANTE", "HEALTH HAZARD", "RIESGO DE SALUD"),
      heading: T("Ça pourrit, ça pique", "It rots, it stings", "Se pudre, irrita"),
      sub: T("En séchant au soleil, les algues sargasses échouées pourrissent et libèrent du sulfure d'hydrogène (H₂S), un gaz toxique qui sent l'œuf pourri.", "As they dry in the sun, stranded sargassum seaweed rots and releases hydrogen sulfide (H₂S), a toxic gas that smells of rotten eggs.", "Al secarse al sol, las algas de sargazo varadas se pudren y liberan sulfuro de hidrógeno (H₂S), un gas tóxico que huele a huevo podrido."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0B2230"/>
          <rect y="320" width="800" height="280" fill="#1C1712"/>
          <g transform="translate(400,350)">
            <ellipse rx="180" ry="34" fill="#5d400e"/>
            <ellipse cx="-90" cy="-12" rx="60" ry="20" fill="#7a5c14"/>
            <ellipse cx="80" cy="-10" rx="70" ry="22" fill="#6b4a12"/>
          </g>
          <g fill="#CC28FF" opacity=".6">
            <circle cx="330" cy="270" r="5"/>
            <circle cx="360" cy="230" r="3.5"/>
            <circle cx="430" cy="242" r="4"/>
            <circle cx="470" cy="218" r="3"/>
          </g>
          <text x="400" y="220" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="26" fill="#CC28FF">H₂S</text>
        </g>
      )
    },
    {
      eyebrow: T("POPULATIONS SENSIBLES", "SENSITIVE GROUPS", "GRUPOS SENSIBLES"),
      heading: T("Qui est vulnérable ?", "Who is vulnerable?", "¿Quién es vulnerable?"),
      sub: T("Les émanations de H₂S sont particulièrement irritantes pour les nourrissons, les femmes enceintes, et les personnes asthmatiques ou fragiles.", "H₂S fumes are particularly irritating for infants, pregnant women, and people with asthma or weak lungs.", "Las emanaciones de H₂S sont particulièrement irritantes pour nourrissons, femmes enceintes, et asthmatiques."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06121A"/>
          <g transform="translate(400,220)">
            <polygon points="0,-60 -60,40 60,40" fill="#E8522A" stroke="#EAF7F4" strokeWidth="2"/>
            <text x="0" y="24" fontFamily="'Anton',sans-serif" fontSize="56" fill="#fff" textAnchor="middle">!</text>
          </g>
          <text x="400" y="340" fontFamily="system-ui,sans-serif" fontSize="16" fill="#3fd07f" textAnchor="middle">{T("Asthme · Nourrissons · Grossesse", "Asthma · Infants · Pregnancy", "Asma · Lactantes · Embarazo")}</text>
        </g>
      )
    },
    {
      eyebrow: T("SEUILS & PRÉVENTION", "THRESHOLDS & CARE", "UMBRALES Y CUIDADO"),
      heading: T("Aérer et s'éloigner", "Ventilate and stay away", "Ventilar y alejarse"),
      sub: T("Au-dessus du seuil d'alerte, évitez de stationner près des échouages et fermez les fenêtres si vous habitez en bord de mer.", "Above the warning threshold, avoid staying near seaweed accumulations and close windows if you live by the coast.", "Por encima del umbral de alerta, evite permanecer cerca de las algas varadas y cierre las ventanas si vive en la costa."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          <g transform="translate(400,280)">
            <path d="M-60 40 L-60 -20 L0 -60 L60 -20 L60 40 Z" fill="none" stroke="#3fd07f" strokeWidth="3"/>
            <rect x="-20" y="-10" width="40" height="30" fill="none" stroke="#3fd07f" strokeWidth="2"/>
            <line x1="0" y1="-10" x2="0" y2="20" stroke="#3fd07f" strokeWidth="1"/>
          </g>
          <path d="M100 240 Q220 220 280 250" fill="none" stroke="#E8522A" strokeWidth="3" opacity=".6"/>
          <path d="M520 240 Q620 220 700 250" fill="none" stroke="#E8522A" strokeWidth="3" opacity=".6"/>
        </g>
      )
    },
    {
      eyrow: T("ALERTE VEILLEUR", "WATCHMAN ALERTS", "ALERTA DEL VIGÍA"),
      heading: T("Sois prévenu à temps", "Get warned in time", "Recibe alertas a tiempo"),
      sub: T("Ne te laisse plus surprendre par l'odeur. Notre veilleur surveille les risques H₂S devant tes plages préférées.", "Never get caught off guard by the smell again. Our Watchman monitors H₂S risks in front of your favorite beaches.", "No te dejes sorprender por el olor. Nuestro Vigía monitorea los riesgos de H₂S frente a tus playas."),
      cta: T("Activer Le Veilleur →", "Activate the Watcher →", "Activar el Vigía →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#120821"/>
          {miVeil(400, 200, "#E8522A", "#F4845F")}
          <circle cx="400" cy="200" r="140" fill="none" stroke="#E8522A" strokeWidth="2" strokeDasharray="6 8" opacity="0.4"/>
          <text x="400" y="380" fontFamily="system-ui,sans-serif" fontSize="18" fontWeight="800" fill="#E8522A" textAnchor="middle">ALERT H₂S ENABLED</text>
        </g>
      )
    }
  ]
}

function nettoyerBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return [
    {
      eyebrow: T("L'ACTION", "ACTION", "ACCIÓN"),
      heading: T("Récolter avant le sable", "Collect before the sand", "Recoger antes de la arena"),
      sub: T("La récolte des algues en mer est 10 fois plus écologique car elle préserve le sable et évite la dégradation en gaz toxique.", "Collecting seaweed at sea is 10 times more ecological because it preserves sand and avoids degradation into toxic gas.", "Recoger el alga en el mar es 10 veces más ecológico porque conserva la arena y evita los gases tóxicos."),
      scene: (
        <g>
          <rect width="800" height="360" fill="#120821"/>
          <rect y="360" width="800" height="240" fill="#08251F"/>
          <g transform="translate(400,430)">
            <ellipse rx="150" ry="12" fill="#7a5c14"/>
          </g>
          <g transform="translate(350,340)"><path d="M-60 20 L60 20 L48 40 L-48 40 Z" fill="#1A5852" stroke="#3fd07f" strokeWidth="2"/></g>
        </g>
      )
    },
    {
      eyebrow: T("LE TRI", "THE SORTING", "LA CLASIFICACIÓN"),
      heading: T("Séparer pour valoriser", "Sort to value", "Clasificar para valorizar"),
      sub: T("L'algue récoltée passe par un système de tri mécanique pour séparer le sable et l'eau salée de la matière organique valorisable.", "The harvested algae goes through mechanical sorting to separate sand and saltwater from usable organic matter.", "El alga cosechada pasa por una clasificación mecánica para separar la arena y el agua de la materia orgánica."),
      scene: <SolSortScene lang={lang}/>
    },
    {
      eyebrow: T("LA TRANSFORMATION", "TRANSFORMATION", "TRANSFORMACIÓN"),
      heading: T("Engrais, briques, énergie", "Fertilizer, bricks, energy", "Abono, ladrillos, energía"),
      sub: T("Une fois triée et rincée, l'algue sargasse se transforme en compost agricole, en briques de construction ou en biogaz.", "Once sorted and rinsed, sargassum is transformed into agricultural compost, construction bricks or biogas.", "Una vez clasificada y enjuagada, el sargazo se transforma en compost agrícola, ladrillos o biogás."),
      scene: <SolTransformScene lang={lang}/>
    },
    {
      eyebrow: T("VALORISATION", "RECYCLING", "RECICLAJE"),
      heading: T("Agir pour le climat", "Act for the climate", "Actuar por el clima"),
      sub: T("Chaque tonne valorisée évite l'émanation de méthane en décomposition. Découvre toutes les initiatives locales.", "Each ton recycled avoids methane emissions from decomposition. Discover all local initiatives.", "Cada tonelada reciclada evita las emisiones de metano por descomposición. Descubre las iniciativas locales."),
      cta: T("Voir les solutions →", "See the solutions →", "Ver las soluciones →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          <circle cx="400" cy="260" r="100" fill="none" stroke="#22C55E" strokeWidth="8"/>
          <path d="M380 230 L400 210 L420 230" fill="none" stroke="#22C55E" strokeWidth="8" strokeLinecap="round"/>
          <text x="400" y="275" fontFamily="'Anton',sans-serif" fontSize="48" fill="#22C55E" textAnchor="middle">CO₂</text>
        </g>
      )
    }
  ]
}

function methodeBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const relPct = (__REL && typeof __REL.cleanPct === "number") ? __REL.cleanPct : 79
  const relReg = (__REL && __REL.regime === "high") ? T("saison haute", "high season", "temporada alta") : T("saison calme", "calm season", "temporada tranquila")
  const relRateStr = T(`fiabilité de ${relPct}% sur nos prévisions « mer propre » vérifiées (${relReg})`, `accuracy of ${relPct}% on our verified “clean water” forecasts (${relReg})`, `fiabilidad del ${relPct}% en pronósticos “agua limpia” verificados (${relReg})`)
  return [
    {
      eyebrow: T("NOTRE MÉTHODE", "OUR METHOD", "NUESTRO MÉTODO"),
      heading: T("D'où vient la couleur ?", "Where does the color come from?", "¿De dónde viene el color?"),
      sub: T("L'indice de couleur de nos cartes (propre, modéré, à éviter) provient de l'analyse automatisée de la signature satellite de l'océan.", "The color index on our maps (clean, moderate, avoid) comes from automated satellite signature analysis of the ocean.", "El índice de color de nuestros mapas (limpio, moderado, evitar) proviene del análisis automatizado de la firma satelital."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0A2E2A"/>
          <path d="M150 180 Q400 240 650 180" fill="none" stroke="#22C55E" strokeWidth="48" strokeLinecap="round" opacity="0.45"/>
          <path d="M150 280 Q400 340 650 280" fill="none" stroke="#E8A800" strokeWidth="48" strokeLinecap="round" opacity="0.45"/>
          <path d="M150 380 Q400 440 650 380" fill="none" stroke="#E8522A" strokeWidth="48" strokeLinecap="round" opacity="0.45"/>
          {miVeil(400, 150, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("VALIDATION TERRAIN", "GROUND TRUTH", "VALIDACIÓN DE CAMPO"),
      heading: T("On croise les données", "Cross-referencing data", "Cruzando datos"),
      sub: T("Les signalements terrain de nos veilleurs locaux et les capteurs valident quotidiennement les prévisions satellites pour éliminer les faux positifs.", "Ground reports from our local watchers and sensors daily validate satellite forecasts to eliminate false positives.", "Los informes de campo de nuestros vigías locales y sensores validan diariamente los pronósticos satelitales."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06121A"/>
          <rect y="360" width="800" height="240" fill="#1C1712"/>
          {[200,400,600].map((x,i)=>(
            <g key={i} transform={`translate(${x},340)`}>
              <circle r="12" fill="#22C55E"/>
              <path d="M-6 0 L-2 4 L6 -4" fill="none" stroke="#fff" strokeWidth="2.5"/>
            </g>
          ))}
          {miVeil(400, 140, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("FIABILITÉ", "ACCURACY", "FIABILIDAD"),
      heading: T("Transparence totale", "Total transparency", "Transparencia total"),
      sub: T("Notre modèle affiche une " + relRateStr + ". Le taux est recalibré chaque semaine pour rester digne de confiance.", "Our model shows " + relRateStr + ". The rate is recalibrated every week to remain trustworthy.", "Nuestro modelo muestra una " + relRateStr + "."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          <g transform="translate(400,260)">
            <circle r="80" fill="none" stroke="#3fd07f" strokeWidth="8"/>
            <text x="0" y="15" fontFamily="'Anton',sans-serif" fontSize="48" fill="#3fd07f" textAnchor="middle">{relPct}%</text>
          </g>
          <text x="400" y="380" fontFamily="system-ui,sans-serif" fontSize="14" fill="#9FE1CB" textAnchor="middle">{T("Indice de confiance mis à jour", "Confidence index updated", "Índice de confianza actualizado")}</text>
        </g>
      )
    },
    {
      eyebrow: T("LA CARTE", "THE MAP", "EL MAPA"),
      heading: T("Prêt pour la plage ?", "Ready for the beach?", "¿Listo para la playa?"),
      sub: T("Ouvre la carte interactive pour voir l'état exact de tes plages aujourd'hui et planifier ta semaine en Martinique et Guadeloupe.", "Open the interactive map to see the exact state of your beaches today and plan your week in Martinique and Guadeloupe.", "Abre el mapa interactivo para ver el estado exacto de tus playas hoy y planificar tu semana."),
      cta: T("Ouvrir la carte →", "Open the map →", "Abrir el mapa →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0B2230"/>
          <path d="M100 250 Q400 220 700 250" fill="none" stroke="#FFE47A" strokeWidth="4" opacity=".5"/>
          <g transform="translate(400,280)">
            <path d="M0 -30 C-20 -30 -20 0 0 30 C20 0 20 -30 0 -30 Z" fill="#E8522A" stroke="#fff" strokeWidth="2"/>
            <circle cx="0" cy="-10" r="10" fill="#fff"/>
          </g>
        </g>
      )
    }
  ]
}

const STATION_BEATS = {
  "comprendre-sargasses":      comprendreBeats,
  "detection-satellite-sargasses": satelliteBeats,
  "danger-sargasses-h2s":      h2sBeats,
  "nettoyer-sargasses":        nettoyerBeats,
  "methode-carte":             methodeBeats,
  "en/understanding-sargassum":      comprendreBeats,
  "en/satellite-sargassum-detection": satelliteBeats,
}

function StationStory({slug,lang,onExit,onCTA}){
  const beatsFn = STATION_BEATS[slug] || discoveryBeats
  const accent = slug.includes("h2s") ? "#CC28FF" : slug.includes("nettoyer") ? "#3fd07f" : "#FFC72C"
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={slug} style={{position:"absolute",inset:0,zIndex:1060,background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
      <button onClick={onExit} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"fixed",top:"calc(12px + env(safe-area-inset-top))",right:12,zIndex:30,width:42,height:42,borderRadius:21,background:"rgba(10,23,20,.55)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:16,cursor:"pointer"}}>✕</button>
      <StoryEngine beats={beatsFn(lang)} lang={lang} accent={accent}
        ev="sg_station_beat" onCTA={onCTA}
        onBeat={(b,n)=>{try{track("sg_station_beat",{slug,b:b+1,n})}catch(_){}}}/>
    </div>
  )
}


// ── SolutionsStory — pages SVG sur les SOLUTIONS sargasses (mandat nuit 14/06) :
//    problème global → on voit (satellite) → on agit (barrages+ramassage) → on
//    transforme (recyclage+carburant) → on sort (escapable, jamais infernal).
//    Scrollytelling via StoryEngine. Faits sûrs en v1, enrichis par recherche.
// Scène INTERACTIVE (clic) du beat transformation : touche une ressource -> un fait.
function SolTransformScene({lang}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const[sel,setSel]=useState(null)
  const items=[
    {e:"🌱",x:230,y:210,l:T("Engrais","Fertilizer","Abono"),f:T("Riche en potassium : il nourrit les sols agricoles.","Potassium-rich: it feeds farm soils.","Rico en potasio: nutre los suelos.")},
    {e:"🧱",x:400,y:182,l:T("Briques","Bricks","Ladrillos"),f:T("Sargablock : de vraies maisons bâties au Mexique.","Sargablock: real houses built in Mexico.","Sargablock: casas reales en México.")},
    {e:"⚡",x:570,y:210,l:T("Biogaz","Biogas","Biogás"),f:T("Méthanisation : l'algue devient électricité.","Anaerobic digestion: the algae becomes electricity.","Digestión: el alga se vuelve electricidad.")},
    {e:"📄",x:312,y:392,l:T("Papier","Paper","Papel"),f:T("Ses fibres font papier et carton.","Its fibres make paper and card.","Sus fibras hacen papel y cartón.")},
    {e:"🧴",x:488,y:392,l:T("Bioplastique","Bioplastic","Bioplástico"),f:T("Des emballages compostables.","Compostable packaging.","Envases compostables.")},
  ]
  return(<g><defs><linearGradient id="sol4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#sol4)"/>
    <g transform="translate(400,300)"><ellipse rx="46" ry="16" fill="#6b7a1c" style={{opacity:"calc(1 - var(--p5)*.7)"}}/></g>
    {items.map((o,i)=>(
      <g key={i} transform={"translate("+o.x+","+o.y+")"} role="button" tabIndex={0} aria-label={o.l} onClick={()=>{const ns=sel===i?null:i;setSel(ns);if(ns!=null){try{track("sg_sol_tap",{beat:"transforme",item:["engrais","briques","biogaz","papier","bioplastique"][i]})}catch(_){}}}} style={{cursor:"pointer",opacity:"calc(var(--p5)*1.4 - "+(i*0.16)+")",transformBox:"fill-box",transformOrigin:"center"}}>
        <circle r="34" fill="#0A1714" stroke={sel===i?"#FFD884":"#1EC8B0"} strokeWidth={sel===i?2.6:1.4}/><text y="10" fontSize="30" textAnchor="middle">{o.e}</text><text y="56" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB" textAnchor="middle">{o.l}</text>
      </g>))}
    {sel==null
      ? <text x="400" y="104" fontFamily="ui-monospace,monospace" fontSize="13" fill="#1EC8B0" textAnchor="middle" style={{opacity:"var(--p5)"}}>👆 {T("touche une ressource","tap a resource","toca un recurso")}</text>
      : <g><rect x="120" y="70" width="560" height="62" rx="14" fill="rgba(7,32,30,.94)" stroke="#FFD884" strokeWidth="1.4"/><text x="400" y="97" fontFamily="system-ui,sans-serif" fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle">{items[sel].e+"  "+items[sel].l}</text><text x="400" y="119" fontFamily="system-ui,sans-serif" fontSize="12.5" fill="rgba(255,255,255,.85)" textAnchor="middle">{items[sel].f}</text></g>}
  </g>)
}
// Scène INTERACTIVE « ON TRIE » : un convoyeur amène l'algue vers 3 bacs triés (engin
// de chantier qui trie, demande fondateur). Tap un bac -> un fait. --p4 = remplissage.
function SolSortScene({lang}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const[sel,setSel]=useState(null)
  const bins=[
    {e:"♻️",x:300,c:"#22C55E",l:T("Valorisable","Reusable","Útil"),f:T("L'algue propre : engrais, biogaz, biochar.","Clean algae: fertilizer, biogas, biochar.","Alga limpia: abono, biogás, biochar.")},
    {e:"🌊",x:400,c:"#3E9BC4",l:T("Eau & sel","Water & salt","Agua y sal"),f:T("Pressée, l'eau salée repart à la mer.","Pressed out, the brine returns to the sea.","Prensada, el agua vuelve al mar.")},
    {e:"🪨",x:500,c:"#9AA08A",l:T("Sable & résidus","Sand & residue","Arena y residuo"),f:T("Le sable rendu à la plage, les déchets écartés.","Sand returned to the beach, waste removed.","La arena vuelve a la playa.")},
  ]
  return(<g><defs><linearGradient id="solSort" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient>
    <style>{`@keyframes solBelt{to{stroke-dashoffset:-40}}.sol-belt{animation:solBelt 1.5s linear 1 both}@media(prefers-reduced-motion:reduce){.sol-belt{animation:none}}`}</style></defs>
    <rect width="800" height="600" fill="url(#solSort)"/>
    {/* convoyeur incliné */}
    <path d="M110 220 L460 330" stroke="#0A1714" strokeWidth="26" strokeLinecap="round"/>
    <path className="sol-belt" d="M110 220 L460 330" stroke="#1EC8B0" strokeWidth="3" strokeDasharray="6 16" opacity=".55"/>
    {[150,232,314,396].map((x,i)=>{const y=220+(x-110)*(110/350);return <ellipse key={i} cx={x} cy={y-16} rx="13" ry="6" fill="#8a6c1c" style={{opacity:"calc(var(--p4)*1.3 - "+(i*0.18)+")"}}/>})}
    {/* tête de tri (l'engin) */}
    <g transform="translate(470,300)"><rect x="-20" y="-24" width="48" height="32" rx="6" fill="#155A5A"/><rect x="-10" y="-36" width="22" height="14" rx="3" fill="#0A1714"/><circle cx="1" cy="-42" r="3.6" fill="#1EC8B0"/></g>
    {/* 3 bacs triés, cliquables, remplis par --p4 */}
    {bins.map((b,i)=>(
      <g key={i} transform={"translate("+b.x+",430)"} role="button" tabIndex={0} aria-label={b.l} onClick={()=>{const ns=sel===i?null:i;setSel(ns);if(ns!=null){try{track("sg_sol_tap",{beat:"tri",item:["valorisable","eau_sel","sable"][i]})}catch(_){}}}} style={{cursor:"pointer"}}>
        <clipPath id={"binc"+i}><path d="M-32 2 L32 2 L27 66 L-27 66 Z"/></clipPath>
        <rect x="-32" y="6" width="64" height="60" fill={b.c} opacity=".4" clipPath={"url(#binc"+i+")"} style={{transform:"scaleY(var(--p4))",transformBox:"fill-box",transformOrigin:"center bottom"}}/>
        <path d="M-32 2 L32 2 L27 66 L-27 66 Z" fill="none" stroke={sel===i?"#FFD884":b.c} strokeWidth={sel===i?2.6:1.6}/>
        <text y="42" fontSize="24" textAnchor="middle">{b.e}</text>
        <text y="88" fontFamily="ui-monospace,monospace" fontSize="11" fontWeight="700" fill="#0A1714" textAnchor="middle" paintOrder="stroke" stroke="rgba(255,240,210,.6)" strokeWidth="2.4">{b.l}</text>
      </g>))}
    {sel==null
      ? <text x="400" y="120" fontFamily="ui-monospace,monospace" fontSize="13" fill="#1EC8B0" textAnchor="middle" style={{opacity:"var(--p4)"}}>👆 {T("touche un bac de tri","tap a sort bin","toca un contenedor")}</text>
      : <g><rect x="140" y="96" width="520" height="58" rx="14" fill="rgba(7,32,30,.94)" stroke="#FFD884" strokeWidth="1.4"/><text x="400" y="120" fontFamily="system-ui,sans-serif" fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle">{bins[sel].e+"  "+bins[sel].l}</text><text x="400" y="140" fontFamily="system-ui,sans-serif" fontSize="12.5" fill="rgba(255,255,255,.85)" textAnchor="middle">{bins[sel].f}</text></g>}
  </g>)
}
// LE DÉBAT (main d'œuvre / aides / argent) — 5 voix sur LA MÊME anse + vote diégétique
// « où va l'argent ». Non-clivant : pas "qui a raison" mais "que finance-t-on". Click-driven,
// mobile-safe (bande centrale). La donnée satellite = le point commun qui réconcilie tous.
function SolDebateScene({lang}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const[vi,setVi]=useState(0)
  const[votes,setVotes]=useState(()=>{try{return JSON.parse(localStorage.getItem("sg_debate_votes")||"[3,5,2,4]")}catch(_){return[3,5,2,4]}})
  const[voted,setVoted]=useState(false)
  const V=[
    {e:"🏠",n:T("Habitant","Resident","Vecino"),s:T("Ramassée vite, l'algue ne sent pas le H₂S près de l'école.","Collected fast, no H₂S smell near the school.","Recogida rápido, sin H₂S junto a la escuela.")},
    {e:"🏖️",n:T("Tourisme","Tourism","Turismo"),s:T("Mes clients réservent si je promets une plage propre.","Guests book if I can promise a clean beach.","Reservan si prometo playa limpia.")},
    {e:"🏛️",n:T("Collectivité","Public","Municipio"),s:T("La donnée dit OÙ ramasser : j'emploie là où c'est utile.","Data says WHERE to collect: I hire where it counts.","El dato dice DÓNDE recoger.")},
    {e:"♻️",n:T("Recycleur","Recycler","Reciclador"),s:T("Captée fraîche et triée, l'algue vaut de l'or (engrais, biogaz).","Fresh & sorted, the algae is gold (fertilizer, biogas).","Fresca y clasificada, vale oro.")},
    {e:"💶",n:T("Financier","Funder","Financiero"),s:T("Je finance ce qui se MESURE : la précision satellite horodatée.","I fund what's MEASURED: timestamped accuracy.","Financio lo que se MIDE.")},
  ]
  const O=[T("Collecte quartier","Local collect","Recogida"),T("Alerte H₂S","H₂S alert","Alerta H₂S"),T("Dashboard hôtels","Hotel dashboard","Panel hoteles"),T("Recyclage","Recycling","Reciclaje")]
  const vote=i=>{if(voted)return;setVotes(v=>{const n=v.slice();n[i]=(n[i]||0)+1;try{localStorage.setItem("sg_debate_votes",JSON.stringify(n))}catch(_){}return n});setVoted(true);try{track("sg_debate_vote",{choice:i})}catch(_){}}
  const tot=Math.max(1,votes.reduce((a,b)=>a+b,0)),v=V[vi]
  return(<g><defs><linearGradient id="solDeb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#solDeb)"/>
    <circle cx="400" cy="250" r="58" fill="#FFD884" opacity=".5"/>
    <rect y="372" width="800" height="228" fill="#10403A"/>
    <path d="M120 466 Q400 440 680 466 L680 600 L120 600 Z" fill="#C9A86A"/>
    <g opacity={vi===0?1:.45}><rect x="300" y="420" width="34" height="40" fill="#13302A"/><path d="M296 420 l21 -16 l21 16 Z" fill="#0A1714"/><rect x="344" y="428" width="28" height="32" fill="#13302A"/></g>
    <g opacity={vi===0?1:.45}><rect x="440" y="416" width="46" height="44" fill="#0A1714"/><line x1="463" y1="416" x2="463" y2="398" stroke="#FFD884" strokeWidth="2"/><path d="M463 398 l14 5 l-14 5 Z" fill="#E8522A"/></g>
    <g opacity={vi===1||vi===3?1:.35} transform="translate(520,452)"><path d="M-24 0 l48 0 l-8 14 l-32 0 Z" fill="#13302A"/></g>
    {vi===0&&<g><ellipse cx="317" cy="404" rx="34" ry="11" fill="#9AA08A" opacity=".4"/><text x="317" y="384" fontSize="13" textAnchor="middle">💨</text></g>}
    {vi===4&&<g stroke="#FFD884" strokeWidth="2" fill="none" opacity=".7"><path d="M250 200 Q330 330 400 430"/><path d="M400 190 Q400 310 400 430"/><path d="M550 200 Q470 330 400 430"/></g>}
    {miVeil(400,150,"#0A1714","#1EC8B0")}
    {/* sélecteur de voix (bande centrale, mobile-safe) */}
    <g role="button" tabIndex={0} aria-label="prev" onClick={()=>{const n=(vi+4)%5;setVi(n);try{track("sg_sol_tap",{beat:"debat",item:"voix_"+n})}catch(_){}}} style={{cursor:"pointer"}}><circle cx="272" cy="232" r="17" fill="rgba(7,32,30,.7)" stroke="rgba(95,211,201,.4)"/><text x="272" y="238" fontSize="16" fill="#fff" textAnchor="middle">‹</text></g>
    <g role="button" tabIndex={0} aria-label="next" onClick={()=>{const n=(vi+1)%5;setVi(n);try{track("sg_sol_tap",{beat:"debat",item:"voix_"+n})}catch(_){}}} style={{cursor:"pointer"}}><circle cx="528" cy="232" r="17" fill="rgba(7,32,30,.7)" stroke="rgba(95,211,201,.4)"/><text x="528" y="238" fontSize="16" fill="#fff" textAnchor="middle">›</text></g>
    <g><rect x="298" y="206" width="204" height="56" rx="14" fill="rgba(7,32,30,.92)" stroke="#FFD884" strokeWidth="1.3"/><text x="400" y="228" fontSize="13.5" fontWeight="800" fill="#FFD884" textAnchor="middle">{v.e+" "+v.n}</text><text x="400" y="248" fontSize="10.5" fill="rgba(255,255,255,.85)" textAnchor="middle">{v.s.length>52?v.s.slice(0,50)+"…":v.s}</text></g>
    <text x="400" y="288" fontSize="10" fill="rgba(255,255,255,.5)" textAnchor="middle">{(vi+1)+"/5 · "+T("‹ › les 5 regards","‹ › the 5 views","‹ › las 5 miradas")}</text>
    {/* vote 2×2 (safe band) ou résultat */}
    {!voted
      ? <g><text x="400" y="312" fontSize="13.5" fontWeight="800" fill="#fff" textAnchor="middle">{T("Toi, où doit aller l'argent ?","You — where should the money go?","¿A dónde va el dinero?")}</text>
          {O.map((o,i)=>{const cx=i%2===0?336:464,cy=i<2?340:376;return(<g key={i} transform={"translate("+cx+","+cy+")"} role="button" tabIndex={0} aria-label={o} onClick={()=>vote(i)} style={{cursor:"pointer"}}><rect x="-62" y="-13" width="124" height="28" rx="9" fill="rgba(255,255,255,.08)" stroke="#1EC8B0" strokeWidth="1.1"/><text x="0" y="5" fontSize="10.5" fontWeight="700" fill="#fff" textAnchor="middle">{o}</text></g>)})}
        </g>
      : <g><text x="400" y="306" fontSize="12.5" fontWeight="800" fill="#FFD884" textAnchor="middle">{T("Le quartier a voté — l'argent suit la donnée :","The community voted — money follows data:","La comunidad votó:")}</text>
          {O.map((o,i)=>{const pct=Math.round(100*(votes[i]||0)/tot),y=324+i*19;return(<g key={i} transform={"translate(290,"+y+")"}><text x="0" y="9" fontSize="10" fill="rgba(255,255,255,.85)" textAnchor="end">{o}</text><rect x="8" y="0" width="170" height="11" rx="5.5" fill="rgba(255,255,255,.1)"/><rect x="8" y="0" width={Math.max(5,170*pct/100)} height="11" rx="5.5" fill="#1EC8B0"/><text x="186" y="9" fontSize="10" fontWeight="700" fill="#1EC8B0">{pct+"%"}</text></g>)})}
        </g>}
  </g>)
}
function solutionsBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const SKY=id=>(<linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient>)
  const SEA=id=>(<linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/></linearGradient>)
  return[
    // 0 — LE PROBLÈME : la ceinture atlantique qui dérive
    {eyebrow:T("LE PROBLÈME","THE PROBLEM","EL PROBLEMA"),heading:T("Une ceinture de 8 000 km","An 8,000 km belt","Un cinturón de 8.000 km"),
      sub:T("Depuis 2011, une marée d'algues traverse l'Atlantique, de l'Afrique aux Caraïbes. En 2025, un record : 38 millions de tonnes — le double de 2022.","Since 2011 a tide of algae crosses the Atlantic, Africa to the Caribbean. In 2025 a record: 38 million tonnes — double 2022.","Desde 2011 una marea cruza el Atlántico. En 2025 un récord: 38 millones de toneladas — el doble que 2022."),
      scene:<g><defs>{SKY("sol0")}</defs><rect width="800" height="600" fill="url(#sol0)"/>
        <ellipse cx="400" cy="320" rx="320" ry="170" fill="#08251F" opacity=".55"/>
        <g style={{transform:"translateX(calc(var(--p0)*70px - 35px))"}}>{[200,258,316,374,432,490,548,606].map((x,i)=>(<ellipse key={i} cx={x} cy={310+Math.sin(i*1.3)*16} rx="24" ry="8.5" fill="#8a6c1c" opacity=".82"/>))}</g>
        <circle cx="170" cy="312" r="9" fill="#1EC8B0"/><text x="170" y="346" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB" textAnchor="middle">{T("Afrique","Africa","África")}</text>
        <circle cx="636" cy="312" r="9" fill="#FFD884"/><text x="636" y="346" fontFamily="ui-monospace,monospace" fontSize="12" fill="#FFD884" textAnchor="middle">{T("Caraïbes","Caribbean","Caribe")}</text>
        <text x="400" y="150" fontFamily="'Anton',sans-serif" fontSize="40" fill="#fff" textAnchor="middle" opacity=".9">2011 →</text>
      </g>},
    // 1 — ON VOIT TOUT : le satellite scanne (notre moat)
    {eyebrow:T("ON VOIT TOUT","WE SEE IT ALL","LO VEMOS TODO"),heading:T("Lue depuis l'espace","Read from space","Leída desde el espacio"),
      sub:T("Le Veilleur lit la signature des algues en mer (satellites NASA/Copernicus) et prévient ta plage 2 à 5 jours avant l'arrivée — recoupé chaque jour au satellite.","The Watcher reads the algae's signature at sea (Copernicus/NOAA satellites) and warns your beach 2-5 days ahead — cross-checked daily against satellite.","El Vigía lee la firma de las algas en el mar (satélites NASA/Copernicus) y avisa tu playa 2-5 días antes — contrastado a diario con satélite."),
      scene:<g><defs>{SEA("sol1")}</defs><rect width="800" height="600" fill="#06121A"/>
        {[[120,90],[300,70],[520,110],[680,80],[420,150],[600,180]].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.3" fill="#fff" opacity=".5"/>))}
        <rect y="360" width="800" height="240" fill="url(#sol1)"/>
        <path className="bsc-beam" d="M400 150 L300 360 L500 360 Z" fill="#1EC8B0" opacity={"calc(.08 + var(--p1)*.16)"}/>
        <g style={{transform:"translateX(calc(var(--p1)*120px - 60px))"}}>{miVeil(400,140,"#0A1714","#1EC8B0")}</g>
        {[330,400,470].map((x,i)=>(<circle key={i} cx={x} cy="400" r="7" fill="#FFD884" style={{opacity:"calc(var(--p1) - "+(i*0.18)+")"}}/>))}
        <text x="400" y="470" fontFamily="ui-monospace,monospace" fontSize="13" fill="#1EC8B0" textAnchor="middle" style={{opacity:"var(--p1)"}}>{T("Algues en mer · scan","Algae at sea · scan","Algas en el mar · scan")}</text>
      </g>},
    // 2 — ON ARRÊTE EN MER : barrages flottants + bateau collecteur
    {eyebrow:T("ON AGIT EN MER","WE ACT AT SEA","ACTUAMOS EN EL MAR"),heading:T("Stopper avant la plage","Stop it before the beach","Detenerla antes de la playa"),
      sub:T("Des barrages flottants dévient l'algue, des bateaux la collectent au large. En 2025, le Mexique a posé 9 630 m de barrages et collecté 92 783 tonnes — avant le sable, avant l'odeur.","Floating booms divert the algae, boats collect it offshore. In 2025 Mexico laid 9,630 m of booms and collected 92,783 tonnes — before the sand, before the smell.","Barreras flotantes desvían el alga; barcos la recogen mar adentro. México: 9.630 m de barreras y 92.783 t en 2025."),
      scene:<g><defs>{SKY("sol2s")}{SEA("sol2")}</defs><rect width="800" height="360" fill="url(#sol2s)"/>
        <path d="M348 250 a52 52 0 0 1 104 0 Z" fill="#FFD884" opacity=".85"/>
        <rect y="360" width="800" height="240" fill="url(#sol2)"/>
        <path d="M250 520 Q400 500 560 518 L820 512 L820 620 L250 620 Z" fill="#C9A86A"/>
        {/* barrage flottant (boom) — se remplit avec --p2 */}
        <g><line x1="200" y1="408" x2="600" y2="408" stroke="#FFC72C" strokeWidth="4" strokeDasharray="10 6"/>{[230,290,350,410,470,530].map((x,i)=>(<circle key={i} cx={x} cy="408" r="6" fill="#FFC72C"/>))}</g>
        <g style={{opacity:"var(--p2)"}}>{[260,330,400,470,540].map((x,i)=>(<ellipse key={i} cx={x} cy="392" rx="18" ry="6" fill="#7a5c14"/>))}</g>
        {/* bateau collecteur arrive avec --p2 */}
        <g style={{transform:"translateX(calc(var(--p2)*180px - 40px))"}}><path d="M120 388 l70 0 l-12 22 l-46 0 Z" fill="#13302A"/><rect x="142" y="368" width="26" height="20" fill="#0A1714"/><circle cx="155" cy="360" r="4" fill="#1EC8B0"/></g>
      </g>},
    // 3 — ON RAMASSE VITE : fenêtre 24-48h avant le H2S
    {eyebrow:T("ON RAMASSE VITE","WE COLLECT FAST","RECOGEMOS RÁPIDO"),heading:T("48 heures, pas plus","48 hours, no more","48 horas, no más"),
      sub:T("Ramassée dans les 24-48 h, l'algue reste une ressource propre. Trop tard, elle pourrit et dégage le H₂S — l'odeur d'œuf. Le timing change tout.","Collected within 24-48 h it stays a clean resource. Too late, it rots and releases H₂S — the egg smell. Timing is everything.","Recogida en 24-48 h sigue siendo limpia. Tarde, se pudre y libera H₂S."),
      scene:<g><defs>{SKY("sol3")}</defs><rect width="800" height="360" fill="url(#sol3)"/>
        <rect y="360" width="800" height="240" fill="#C9A86A"/>
        {/* tas d'algues fraiches -> machine qui ramasse avec --p3 */}
        <g style={{opacity:"calc(1 - var(--p3)*.85)"}}>{[300,360,420,480].map((x,i)=>(<ellipse key={i} cx={x} cy="430" rx="40" ry="14" fill="#6b7a1c"/>))}</g>
        <g style={{transform:"translateX(calc(var(--p3)*260px - 120px))"}}><rect x="120" y="396" width="60" height="36" rx="6" fill="#155A5A"/><circle cx="138" cy="436" r="12" fill="#120821"/><circle cx="168" cy="436" r="12" fill="#120821"/><path d="M180 412 l40 -10 l0 22 l-40 6 Z" fill="#FFC72C"/></g>
        {/* horloge / compte a rebours */}
        <g transform="translate(620,150)" style={{opacity:"calc(.5 + var(--p3)*.5)"}}><circle r="40" fill="none" stroke="#FFD884" strokeWidth="4"/><line x1="0" y1="0" x2="0" y2="-26" stroke="#FFD884" strokeWidth="4" strokeLinecap="round" style={{transformBox:"fill-box",transformOrigin:"0px 0px",transform:"rotate(calc(var(--p3)*300deg))"}}/><text x="0" y="64" fontFamily="ui-monospace,monospace" fontSize="13" fill="#FFD884" textAnchor="middle">48h</text></g>
      </g>},
    // 4 — ON TRIE : convoyeur + 3 bacs (l'engin de chantier qui trie, demande fondateur)
    {eyebrow:T("ON TRIE","WE SORT","SE CLASIFICA"),heading:T("Chaque chose à sa place","Everything in its place","Cada cosa en su sitio"),
      sub:T("Avant d'être valorisée, l'algue passe au tri : la matière propre d'un côté, l'eau salée et le sable de l'autre. Touche un bac pour voir ce qu'il devient.","Before being reused, the algae is sorted: clean matter on one side, brine and sand on the other. Tap a bin to see what it becomes.","Antes de valorizarla, el sargazo se clasifica. Toca un contenedor."),
      scene:<SolSortScene lang={lang}/>},
    // 5 — LE PROBLÈME DEVIENT RESSOURCE : recyclage + carburant
    {eyebrow:T("ON TRANSFORME","WE TRANSFORM","TRANSFORMAMOS"),heading:T("Le problème devient ressource","The problem becomes a resource","El problema se vuelve recurso"),
      sub:T("Engrais, briques, biochar, bioplastique, papier — et de l'énergie (biogaz). Captée fraîche, elle évite aussi le méthane qu'elle dégage en pourrissant (28× plus réchauffant que le CO₂).","Fertilizer, bricks, biochar, bioplastic, paper — and energy (biogas). Caught fresh, it also avoids the methane it releases when rotting (28× worse than CO₂).","Abono, ladrillos, biochar, bioplástico, papel — y energía (biogás). Recogida fresca evita el metano (28× peor que el CO₂)."),
      scene:<SolTransformScene lang={lang}/>},
    // 6 — LE DÉBAT : main d'œuvre / aides / argent (5 voix + vote)
    {eyebrow:T("LE DÉBAT","THE DEBATE","EL DEBATE"),heading:T("Qui ramasse ? Où va l'argent ?","Who collects? Where's the money?","¿Quién recoge? ¿A dónde va el dinero?"),
      sub:T("Habitant, tourisme, collectivité, recycleur, financier : 5 regards sur la même plage. Pas « qui a raison » mais « que finance-t-on ? ». La donnée satellite dit où ramasser — touche les 5 voix, puis vote.","Resident, tourism, public, recycler, funder: 5 views on the same beach. Not who's right but what we fund. Tap the 5 voices, then vote.","Vecino, turismo, municipio, reciclador, financiero: 5 miradas. Toca las 5 voces y vota."),
      scene:<SolDebateScene lang={lang}/>},
    // 7 — ESPOIR + SORTIE (escapable, jamais infernal)
    {eyebrow:T("MAINTENANT","NOW","AHORA"),heading:T("Vue, arrêtée, transformée","Seen, stopped, transformed","Vista, detenida, transformada"),
      sub:T("Vue de l'espace, arrêtée en mer, ramassée à temps, transformée en ressource. Le Veilleur garde un œil — toi, va profiter de la plage.","Seen from space, stopped at sea, collected in time, turned into a resource. The Watcher keeps an eye — you, go enjoy the beach.","Vista desde el espacio, detenida, transformada. El Vigía vigila — tú, ve a la playa."),
      cta:T("Sortir & voir les plages →","Exit & see the beaches →","Salir y ver las playas →"),
      scene:<g><defs>{SKY("sol5s")}{SEA("sol5")}</defs><rect width="800" height="360" fill="url(#sol5s)"/>
        <path d="M340 230 a60 60 0 0 1 120 0 Z" fill="#FFD884"/>
        <g style={{opacity:"calc(.5 + var(--p7)*.5)"}}>{[-52,-26,0,26,52].map((a,i)=>(<path key={i} d="M400 230 L391 90 L409 90 Z" fill="#FFD884" opacity=".1" transform={"rotate("+a+" 400 230)"}/>))}</g>
        <rect y="360" width="800" height="240" fill="url(#sol5)"/>
        <line x1="-40" y1="392" x2="840" y2="392" stroke="#FFD884" strokeWidth="2.2" strokeDasharray="3 13" opacity=".5"/>
        <path d="M250 500 Q400 478 560 498 L820 492 L820 620 L250 620 Z" fill="#C9A86A"/>
        <g style={{transform:"translateY(calc(var(--p7)*-10px))"}}>{miVeil(400,150,"#0A1714","#1EC8B0")}</g>
      </g>},
  ]
}
function SolutionsStory({lang,onClose,onExit}){
  // JEU data-unlock (INC2) : avancer dans le cycle DÉVERROUILLE nos données, palier par palier.
  // Niveau monotone (ne décroît JAMAIS — pré-révélé au retour), reduced-motion = tout d'office.
  const beats=solutionsBeats(lang),N=beats.length
  const rm=(()=>{try{return window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){return false}})()
  const[unlocked,setUnlocked]=useState(()=>{try{return rm?N:Math.max(0,parseInt(g("sg_sol_lvl",0))||0)}catch(_){return 0}})
  const onBeat=(b)=>{const lvl=Math.min(N,b+1);if(lvl>unlocked){setUnlocked(lvl);try{s("sg_sol_lvl",lvl)}catch(_){}try{sgUnlock("sol_p"+lvl)}catch(_){}}}
  const pct=Math.round(100*Math.min(unlocked,N)/N)
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Les solutions sargasses","Sargassum solutions","Soluciones al sargazo")} style={{position:"absolute",inset:0,zIndex:1065,background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"fixed",top:"calc(12px + env(safe-area-inset-top))",right:12,zIndex:31,width:42,height:42,borderRadius:21,background:"rgba(10,23,20,.55)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:16,cursor:"pointer"}}>✕</button>
      {/* HUD : barre de déblocage de NOS données (jamais décroît). Pas un popup — fin bandeau chrome. */}
      <div aria-hidden style={{position:"fixed",top:"calc(15px + env(safe-area-inset-top))",left:14,right:66,zIndex:30,pointerEvents:"none"}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:".04em",color:"#1EC8B0",textShadow:"0 1px 4px rgba(0,0,0,.6)"}}>{unlocked}/{N} · {_t(lang,"données débloquées","data unlocked","datos desbloqueados")}</div>
        <div style={{height:5,borderRadius:3,background:"rgba(255,255,255,.13)",overflow:"hidden",marginTop:4}}><div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg,#009E8E,#22C55E)",borderRadius:3,transition:"width .55s cubic-bezier(.22,1,.36,1)"}}/></div>
      </div>
      {/* sol_exit_cta : le dernier CTA ouvre le premium (intent chaud post-éducation) */}
      <StoryEngine beats={beats} lang={lang} accent="#1EC8B0" ev="sg_solutions_beat" onCTA={onExit||onClose} onBeat={onBeat}/>
    </div>
  )
}

// ── MapIntroStory — landing SVG d'intro de la CARTE (design workflow 14/06).
//    Overlay plein écran (le seul contexte où le moteur prod scrub bien) : le
//    Veilleur présente la côte → compteurs RÉELS → comment lire un pin → ouvre
//    la carte. Show-once + skippable, zéro route Stripe. Anim en transform/
//    opacity uniquement (calc sur attrs SVG géométriques = instable iOS). ─────
export function miVeil(cx,cy,wing,lens){
  return(<g transform={`translate(${cx},${cy})`}>
    <circle r="30" fill={wing} opacity=".14"/>
    <rect x="-30" y="-7" width="16" height="14" rx="3" fill={wing}/><rect x="14" y="-7" width="16" height="14" rx="3" fill={wing}/>
    <line x1="0" y1="-14" x2="0" y2="-25" stroke={lens} strokeWidth="2" strokeLinecap="round"/><circle cx="0" cy="-27" r="2.4" fill={lens}/>
    <rect x="-14" y="-14" width="28" height="28" rx="8" fill="#0A1714"/><rect x="-14" y="-14" width="28" height="9" rx="8" fill="#FFC72C"/>
    <circle cx="0" cy="3" r="8" fill="#07201E"/><circle cx="0" cy="3" r="5.5" fill={lens}/><circle cx="-2" cy="1" r="2" fill="#EAFBF8"/>
  </g>)
}
function mapIntroBeats(lang,counts){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const c=counts||{clean:0,watch:0,avoid:0,total:1}
  const serene=c.avoid===0
  return[
    {eyebrow:T("LE VEILLEUR SCANNE","THE WATCHER SCANS","EL VIGÍA ESCANEA"),heading:T("Ta côte, vue du ciel","Your coast, from above","Tu costa, desde el cielo"),
      sub:T("Chaque jour, le satellite balaie le littoral. Le Veilleur lit l'eau pour toi.","Every day the satellite sweeps the coast. The Watcher reads the water for you.","Cada día el satélite barre la costa."),
      scene:<g>
        <defs><linearGradient id="mi0sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient><linearGradient id="mi0sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/></linearGradient></defs>
        <rect width="800" height="600" fill="url(#mi0sky)"/>
        <path d="M348 300 a57 57 0 0 1 114 0 Z" fill="#FFD884" opacity=".85"/>
        <rect y="360" width="800" height="240" fill="url(#mi0sea)"/>
        <line x1="-40" y1="388" x2="840" y2="388" stroke="#FFD884" strokeWidth="2.2" strokeDasharray="3 13" opacity=".5"/><line x1="-40" y1="420" x2="840" y2="420" stroke="#3fd07f" strokeWidth="1.6" strokeDasharray="2 17" opacity=".3"/>
        <path d="M250 472 Q390 444 530 468 Q630 484 820 460 L820 620 L250 620 Z" fill="#13302A"/>
        <g style={{transform:"translateX(calc(var(--p0)*170px - 30px))"}}>{miVeil(330,250,"#5b3a8e","#3fd07f")}</g>
      </g>},
    {eyebrow:T("TON LITTORAL AUJOURD'HUI","YOUR COAST TODAY","TU COSTA HOY"),heading:`${c.clean} ${T("propres","clean","limpias")} · ${c.avoid} ${T("à éviter","to avoid","a evitar")}`,
      sub:T("L'état du jour, plage par plage. Le vert respire, le corail prévient.","Today's status, beach by beach. Green breathes, coral warns.","El estado de hoy, playa por playa."),
      scene:<g>
        <rect width="800" height="600" fill="#120821"/><rect width="800" height="600" fill="#241246" opacity=".55"/>
        <g style={{opacity:"calc(.3 + var(--p1)*.7)",transformBox:"fill-box",transformOrigin:"center",transform:"scale(calc(.92 + var(--p1)*.08))"}}>
          <g transform="translate(300,296)"><rect x="-60" y="-42" width="120" height="84" rx="16" fill="#241246" stroke="#22C55E" strokeWidth="1.6"/><circle cx="-32" cy="-9" r="9" fill="#22C55E"/><text x="6" y="3" fontFamily="'Anton',sans-serif" fontSize="36" fill="#fff" textAnchor="middle">{c.clean}</text><text x="0" y="27" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB" textAnchor="middle">{T("PROPRES","CLEAN","LIMPIAS")}</text></g>
          <g transform="translate(500,296)"><rect x="-60" y="-42" width="120" height="84" rx="16" fill="#241246" stroke="#E8522A" strokeWidth="1.6"/><circle cx="-32" cy="-9" r="9" fill="#E8522A"/><text x="6" y="3" fontFamily="'Anton',sans-serif" fontSize="36" fill="#fff" textAnchor="middle">{c.avoid}</text><text x="0" y="27" fontFamily="ui-monospace,monospace" fontSize="12" fill="#F4845F" textAnchor="middle">{T("À ÉVITER","AVOID","EVITAR")}</text></g>
        </g>
        <text x="400" y="420" fontFamily="ui-monospace,monospace" fontSize="13" fill="#7AADC4" textAnchor="middle" opacity=".8">{c.watch} {T("à surveiller","to watch","a vigilar")}</text>
      </g>},
    {eyebrow:T("COMMENT LIRE LA CARTE","HOW TO READ THE MAP","CÓMO LEER EL MAPA"),heading:T("Appuie sur une plage","Tap a beach","Toca una playa"),
      sub:T("Vert : vas-y. Ambre : vérifie. Corail : reporte. Touche un point pour le verdict.","Green: go. Amber: check. Coral: skip. Tap a dot for the verdict.","Verde: ve. Ámbar: revisa. Coral: evita."),
      scene:<g>
        <rect width="800" height="600" fill="#08201C"/>
        <g opacity=".2" stroke="#1E4640" strokeWidth="1"><path d="M250 170 L560 170 M250 290 L560 290 M250 410 L560 410 M320 110 L320 470 M405 110 L405 470 M490 110 L490 470"/></g>
        <circle cx="344" cy="220" r="11" fill="#22C55E"/><circle cx="476" cy="180" r="11" fill="#F59E0B"/><circle cx="510" cy="320" r="11" fill="#E8522A"/><circle cx="386" cy="372" r="11" fill="#22C55E"/>
        <g style={{transformBox:"fill-box",transformOrigin:"405px 250px",transform:"scale(calc(1 + var(--p2)*.9))",opacity:"calc(1 - var(--p2)*.6)"}}><circle cx="405" cy="250" r="16" fill="none" stroke="#FFE08A" strokeWidth="2"/></g>
        <circle cx="405" cy="250" r="13" fill="#22C55E"/><circle cx="405" cy="250" r="13" fill="none" stroke="#120821" strokeWidth="2"/>
        <g style={{opacity:"var(--p2)"}}><g transform="translate(430,232)"><rect width="150" height="56" rx="12" fill="#241246" stroke="#22C55E" strokeWidth="1.5"/><circle cx="24" cy="20" r="8" fill="#22C55E"/><text x="42" y="26" fontFamily="'Anton',sans-serif" fontSize="17" fill="#fff">{T("VAS-Y","GO","¡VE!")}</text><text x="16" y="44" fontFamily="ui-monospace,monospace" fontSize="11" fill="#9FE1CB">{T("verdict du jour →","today's verdict →","veredicto →")}</text></g></g>
        <g transform="translate(414,300)" style={{transform:"translate(414px,300px) translateY(calc(var(--p2)*-12px))"}}><path d="M0 0 q-7 -22 6 -30 q14 -8 13 8 l-2 26 Z" fill="#FFE08A"/><circle cx="2" cy="2" r="4" fill="#FFC72C"/></g>
      </g>},
    {eyebrow:T("LA CARTE EST PRÊTE","THE MAP IS READY","EL MAPA ESTÁ LISTO"),heading:T("Ouvre ta carte live","Open your live map","Abre tu mapa en vivo"),
      sub:T("Touche, zoome, compare. Le Veilleur reste serein tant que ton eau l'est.","Tap, zoom, compare. The Watcher stays calm while your water is.","Toca, acerca, compara."),
      cta:T("Ouvrir la carte live →","Open the live map →","Abrir el mapa →"),
      scene:<g>
        <defs><linearGradient id="mi3sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".55" stopColor="#11463E"/><stop offset="1" stopColor="#FFC72C"/></linearGradient></defs>
        <rect width="800" height="600" fill="url(#mi3sky)"/>
        <g style={{opacity:"calc(.25 + var(--p3)*.55)"}} stroke="#5b3a8e" strokeWidth="1"><path d="M250 160 L560 160 M250 260 L560 260 M250 360 L560 360 M320 110 L320 420 M405 110 L405 420 M490 110 L490 420"/></g>
        <g style={{opacity:"var(--p3)"}}><circle cx="340" cy="220" r="8" fill="#22C55E"/><circle cx="470" cy="300" r="8" fill="#22C55E"/><circle cx="420" cy="380" r="8" fill={serene?"#22C55E":"#F59E0B"}/></g>
        {miVeil(405,260,serene?"#3fd07f":"#F59E0B",serene?"#3fd07f":"#FFD27A")}
      </g>},
  ]
}
function MapIntroStory({lang,counts,onEnterMap}){
  return(
    <div role="dialog" aria-modal="true" aria-label={_t(lang,"Présentation de la carte","Map intro","Intro del mapa")} style={{position:"absolute",inset:0,zIndex:1050,background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
      <button onClick={()=>{track("sg_map_intro_skip",{});onEnterMap()}} style={{position:"fixed",top:"calc(12px + env(safe-area-inset-top))",right:12,zIndex:30,padding:"8px 14px",borderRadius:20,background:"rgba(10,23,20,.6)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",color:"rgba(255,255,255,.85)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{_t(lang,"Passer","Skip","Saltar")} →</button>
      <StoryEngine beats={mapIntroBeats(lang,counts)} lang={lang} ev="sg_map_beat" onCTA={()=>{track("sg_map_intro_enter",{});onEnterMap()}}/>
    </div>
  )
}

// ── beachStoryBeats — LA FICHE qui EST le ScrollStory (directive « toute l'UX
//    scrolling, le contenu = le scroll »). 3 temps data-driven : ① VERDICT du
//    jour (le Veilleur dérive, le score se révèle, scène par statut) ② DEMAIN
//    (5 points de prévision réelle s'allument) ③ TON VEILLEUR (CTA). Anim en
//    transform/opacity. Monté via PanelStoryEngine (scroll du conteneur sheet). ─
function beachStoryBeats(beach,forecast,lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const vm=verdictMeta(beach.status,lang)
  const mood=moodFromScore(beach.score)
  const mwing=mood==="serein"?"#5b3a8e":mood==="vigilant"?"#F59E0B":"#E8522A"
  const mlens=mood==="serein"?"#3fd07f":mood==="vigilant"?"#FFD27A":"#F4845F"
  const fc=forecast||[]
  const RANK={clean:0,moderate:1,avoid:2}
  let turn=null
  for(let i=1;i<=3&&i<fc.length;i++){if((RANK[fc[i]&&fc[i].status]||0)>(RANK[fc[0]&&fc[0].status]||0)){turn=fc[i];break}}
  const dotColor=s=>s==="clean"?"#22C55E":s==="moderate"?"#F59E0B":s==="avoid"?"#E8522A":"#3D6880"
  return[
    {eyebrow:`${T("AUJOURD'HUI","TODAY","HOY")} · ${beach.name}`,heading:`${vm.verb} ${vm.emoji}`,sub:beach.scoreReason||"",
      scene:<g>
        <defs><linearGradient id="bsv0s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient><linearGradient id="bsv0e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/></linearGradient></defs>
        <rect width="800" height="600" fill="url(#bsv0s)"/>
        <path d="M348 300 a57 57 0 0 1 114 0 Z" fill="#FFD884" opacity=".85"/>
        <rect y="360" width="800" height="240" fill="url(#bsv0e)"/>
        <line x1="-40" y1="388" x2="840" y2="388" stroke="#FFD884" strokeWidth="2.2" strokeDasharray="3 13" opacity=".5"/>
        <path d="M250 472 Q390 444 530 468 Q630 484 820 460 L820 620 L250 620 Z" fill="#13302A"/>
        {beach.status==="clean"&&<g style={{transform:"translateY(calc(var(--p0)*-3px))"}}><circle cx="372" cy="404" r="6" fill="#0D2B26"/><path d="M360 410 q12 -8 24 0" stroke="#0D2B26" strokeWidth="3.2" fill="none" strokeLinecap="round"/><circle cx="446" cy="412" r="5" fill="#0D2B26"/></g>}
        {beach.status==="moderate"&&<g style={{transform:"translateX(calc(var(--p0)*8px))"}}><circle cx="300" cy="378" r="3" fill="#FFC72C"/><circle cx="344" cy="380" r="2.6" fill="#FFC72C"/><circle cx="388" cy="378" r="2.6" fill="#FFC72C"/><circle cx="432" cy="379" r="3" fill="#FFC72C"/></g>}
        {beach.status==="avoid"&&<g style={{transform:"translateX(calc(var(--p0)*10px))"}}><ellipse cx="320" cy="384" rx="24" ry="8" fill="#7a5c14"/><ellipse cx="470" cy="396" rx="20" ry="7" fill="#6b4a12"/></g>}
        <g style={{transform:"translateX(calc(var(--p0)*104px - 16px))"}}>{miVeil(298,248,mwing,mlens)}</g>
        {typeof beach.score==="number"&&<g style={{opacity:"var(--p0)",transformBox:"fill-box",transformOrigin:"center",transform:"scale(calc(.72 + var(--p0)*.28))"}}><path d="M500 206 C526 206 544 224 544 250 C544 276 526 294 500 294 C474 294 456 276 456 250 C456 224 474 206 500 206 Z" fill={beach.scoreColor||vm.color}/><text x="500" y="263" fontFamily="'Anton',sans-serif" fontSize="38" fill="#fff" textAnchor="middle">{beach.score}</text></g>}
      </g>},
    {eyebrow:T("LA SUITE","WHAT'S NEXT","LO QUE VIENE"),heading:`${turn?T("Ça se dégrade","It's turning","Empeora"):T("Demain, ça tient","Tomorrow holds","Mañana aguanta")} ${turn?"⚠️":"☀️"}`,sub:T("5 jours d'avance, plage par plage. Le satellite a déjà regardé.","5 days ahead, beach by beach. The satellite already looked.","5 días por delante."),
      scene:<g>
        <rect width="800" height="600" fill="#06211E"/><circle cx="400" cy="206" r="132" fill="#0A2E2A"/>
        <g style={{transform:"translateX(calc(var(--p1)*70px - 35px))"}}><line x1="250" y1="206" x2="560" y2="206" stroke="#FFC72C" strokeWidth="2" strokeDasharray="5 8" opacity=".55"/></g>
        {miVeil(405,206,"#5b3a8e","#3fd07f")}
        {[0,1,2,3,4].map(i=>(<g key={i} style={{opacity:`calc(var(--p1)*1.5 - ${i*0.2})`}}><circle cx={300+i*50} cy="372" r="11" fill={dotColor((fc[i]&&fc[i].status)||beach.status)}/></g>))}
        <text x="400" y="424" fontFamily="ui-monospace,monospace" fontSize="12" fill="#7AADC4" textAnchor="middle" opacity=".7">{T("auj","now","hoy")} → +5j</text>
      </g>},
    {eyebrow:T("TON VEILLEUR","YOUR WATCHER","TU VIGÍA"),heading:beach.status==="avoid"?T("On trouve mieux","Let's find better","Buscamos mejor"):T("C'est ta journée","It's your day","Es tu día"),sub:T("Je surveille ta plage et je te préviens la veille où elle se trouble.","I watch your beach and warn you the day before it turns.","Vigilo tu playa y te aviso la víspera."),cta:T("Mon veilleur →","My watcher →","Mi vigía →"),
      scene:<g>
        <defs><linearGradient id="bsv2s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230"/><stop offset=".55" stopColor="#11463E"/><stop offset="1" stopColor="#FFC72C"/></linearGradient></defs>
        <rect width="800" height="600" fill="url(#bsv2s)"/>
        <g style={{opacity:"var(--p2)"}}><circle cx="405" cy="250" r="62" fill="none" stroke="#FFE08A" strokeWidth="2" opacity=".4"/></g>
        <g style={{transformBox:"fill-box",transformOrigin:"405px 250px",transform:"scale(calc(.9 + var(--p2)*.18))"}}>{miVeil(405,250,mwing,mlens)}</g>
      </g>},
  ]
}

const ST={
  _loading:{c:"#666",bg:"rgba(100,100,100,.1)",l:"Chargement…",le:"Loading…",les:"Cargando…",e:"⏳",h2s:false,
    desc:"Données en cours de chargement…",descEn:"Loading data…",descEs:"Cargando datos…"},
  clean:{c:C.green,bg:C.greenBg,l:"Propre",le:"Clean",les:"Limpia",e:"✅",h2s:false,
    desc:"Peu ou pas de sargasses détectées par satellite au large.",
    descEn:"Little to no sargassum detected by satellite offshore.",
    descEs:"Poco o nada de sargazo detectado por satélite en alta mar."},
  moderate:{c:C.stMod,bg:C.amberBg,l:"Modéré",le:"Moderate",les:"Moderado",e:"⚠️",h2s:false,
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
export const T={
  fr:{
    days:["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],today:"Auj.",tomorrow:"Dem.",
    clean:"Propre",moderate:"Modéré",avoid:"Alerte",
    search:"Rechercher une plage…",
    filters:["Toutes","Propres","Favoris","Alertes"],
    filtersIcon:["🌊","✅","❤️","🚫"],
    navMap:"Carte",navList:"Plages",navGame:"Jeu",navPremium:"Premium",
    verdictGo:"Tu peux y aller",verdictModerate:"À surveiller — à toi de voir",verdictAvoid:"À éviter aujourd'hui",verdictUnknown:"Le Veilleur scanne encore",
    forecast:"Prévisions",weather:"Météo",directions:"Y aller",
    fav:"Favori",addFav:"Ajouter aux favoris",removeFav:"Retirer des favoris",
    wind:"Vent",uv:"UV",temp:"Température",drive:"min",
    kids:"Enfants",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"Ton veilleur sargasses : brief matin, alertes plages favorites, reco du jour.",
    premiumPrice:"4,99 €/mois",premiumCta:"Activer Premium — 4,99 €/mois",
    premiumFeatures:["Accès complet immédiat — 4,99 €/mois, annulable en 2 clics","Brief matin : ta meilleure plage, chaque jour","Alertes push avant que les sargasses arrivent","Sans pub · Sans engagement · Paiement unique"],
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
    verdictGo:"Go for it",verdictModerate:"Worth a check — your call",verdictAvoid:"Skip it today",verdictUnknown:"The Watchman's still scanning",
    forecast:"Forecast",weather:"Weather",directions:"Directions",
    fav:"Favourite",addFav:"Add to favourites",removeFav:"Remove from favourites",
    wind:"Wind",uv:"UV",temp:"Temperature",drive:"min",
    kids:"Kids",snorkel:"Snorkeling",parking:"Parking",
    premium:"Premium",premiumDesc:"Your sargassum watchman: morning brief, favourite-beach alerts, daily pick.",
    premiumPrice:"€4.99/mo",premiumCta:"Activate Premium — €4.99/mo",
    premiumFeatures:["Full immediate access to the 7-day forecast and alerts","Morning brief: your best beach, every day","Push alerts before sargassum hits your favourites","No ads · One-time payment · Instant access"],
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
    verdictGo:"Puedes ir",verdictModerate:"A vigilar — tú decides",verdictAvoid:"Evita hoy",verdictUnknown:"El Vigía sigue escaneando",
    forecast:"Pronóstico",weather:"Clima",directions:"Cómo llegar",
    fav:"Favorita",addFav:"Agregar a favoritas",removeFav:"Quitar de favoritas",
    wind:"Viento",uv:"UV",temp:"Temperatura",drive:"min",
    kids:"Niños",snorkel:"Snorkel",parking:"Estacionamiento",
    premium:"Premium",premiumDesc:"Tu vigía del sargazo: resumen matutino, alertas de playas favoritas, recomendación del día.",
    premiumPrice:"4,99 €/mes",premiumCta:"Activar Premium — 4,99 €/mes",
    premiumFeatures:["Acceso completo inmediato a la previsión de 7 días y las alertas","Resumen matutino: tu mejor playa, cada día","Alertas push antes de que llegue el sargazo","Sin anuncios · Pago único · Acceso inmediato"],
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
export const BEACHES_FALLBACK=[
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
export const SARG_TO_BEACH={"grande-anse":"mq014","anse-mitan":"mq011","anse-noire":"mq012","tartane":"mq034","anse-madame":"mq024","diamant":"mq016","pt-marin":"mq008","sainte-anne":"mq004","les-salines":"mq001","vauclin":"mq044","precheur":"mq033","gp-grande-anse":"gp021","gp-malendure":"gp031","gp-sainte-anne":"gp010","gp-pt-chateaux":"gp005","gp-gosier":"gp012","gp-caravelle":"gp009","gp-bas-du-fort":"gp014","gp-deshaies":"gp024","gp-moule":"gp080","gp-vieux-fort":"gp042"}
export const BEACH_TO_SARG=Object.fromEntries(Object.entries(SARG_TO_BEACH).map(([k,v])=>[v,k]))

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

// 2026-06-17 — Payment Links OFF-SITE retirés : checkout 100% on-site (Stripe
// Payment Element via /api/create-checkout.php). Plus AUCUN redirect buy.stripe.com.
// Constantes vidées (conservées vides pour compat des refs aval + PAYWALL_READY).
const STRIPE_LINK_MONTHLY=""
const STRIPE_LINK_ANNUAL=""
// Pro tier — activate by creating a new Stripe Payment Link @ 9.99 EUR/mo
// (dashboard.stripe.com/payment-links) then paste the URL below. When empty,
// the Pro tier is not shown anywhere in the UI. See `hasPro` flag below.
const STRIPE_LINK_PRO=""   // TODO: 9.99 EUR/mo + 7d trial — Pro tier (WhatsApp alerts + 14d forecast + API)
const STRIPE_BUY_BTN_PRO=""  // TODO: Buy Button ID for Pro tier
export const STRIPE_PK="pk_live_51PW2TGP9RK8Orx516Nx5mGUixrk2ozE8ppOcygq9Wkb1Tz5CkozRcRFcPAv53uNOmuVCHakWAse09I7KXuUiAb5r00CKYHh9zE"
// ── Pont paiement réversible (flag PAY_PROVIDER) ─────────────────────────────
// TEST-FIRST : PayPal est LIVE (creds + plans live) mais le DÉFAUT reste non-PayPal
// (→ prod = capture freemium) tant que le fondateur n'a pas validé un vrai paiement via
// ?pay=paypal. Une fois le test OK : passer ce défaut à 'paypal' = abo live pour TOUS.
// 'mollie'/'stripe' en fallback. ⚠️ fulfillment serveur (confirm_subscription/webhook)
// = paypal-config.php live à déployer (FTP/secret) avant le go-live général.
export const PAY_PROVIDER=(()=>{try{const q=window.location.search;if(/[?&]pay=stripe/.test(q))return"stripe";if(/[?&]pay=mollie/.test(q))return"mollie";if(/[?&]pay=paypal/.test(q))return"paypal"}catch(_){}return"mollie"})()
// Libellé processeur affiché dans les badges « paiement sécurisé ». Source unique
// pour ne plus jamais hardcoder « Stripe » (mort) — bascule auto au go-live Mollie.
export const PAY_LABEL=PAY_PROVIDER==="mollie"?"Mollie":PAY_PROVIDER==="paypal"?"PayPal":"Stripe"
export const MOLLIE_PROFILE="pfl_t8KCk4Cm2C"  // profil Mollie du compte (test & live partagent le même pfl_). Source de vérité du front (le profile_id de mollie-config.php n.est pas réinjecté ici).
export const MOLLIE_TESTMODE=(()=>{try{return /[?&]mollie_test=1/.test(window.location.search)}catch(_){return false}})() // défaut LIVE (faux) ; ?mollie_test=1 force le mode test pour la QA (clé test_ dans mollie-config.php).
// PayPal abo via bouton — LIVE (client_id public + plans régénérés par scripts/create-paypal-plans.cjs).
// Le SDK PayPal déduit l'environnement du client-id.
export const PAYPAL_CLIENT_ID="AadXarqTbu1KiLVh89ESKJ9tIXn-RZ_2U43fDU8lnQ3TgzChda6ZPVZKbpyqO70ySqerJIDXLUyFukSI"
export const PAYPAL_PLANS={monthly:"P-68F60416PW205280SNI474LI",annual:"P-2B698370FU622014SNI474LI"}
// ── Mode CAPTURE (paiements indisponibles) ───────────────────────────────────
// Stripe bloqué + carte Mollie en revue (~4-7j) → AUCUN processeur ne peut charger
// pour l'instant. Le CTA paywall CAPTURE l'email (waitlist, source 'mollie_waitlist')
// au lieu d'ouvrir le paiement ; on relance ces leads dès la réouverture. Rouvrir le
// paiement = repasser à false (ou ?pay_capture=0 pour QA quand un processeur est prêt).
// DÉFAUT (aucun param) = capture (aucun processeur ne charge encore en prod). Forcer
// un vrai provider via ?pay=paypal|mollie|stripe DÉSACTIVE la capture (test/go-live).
// Go-live PayPal = passer ce défaut à false (+ creds live + plans live).
// Régions avec une caisse Mollie ACTIVE (miroir du backend $CUR_BY_ISLAND). USD
// touristes vérifiés (Floride/Punta Cana/Cancún — test paiement réel OK 2026-06-26).
// Barbados (sargassumbarbados.com) N'EST PAS câblé côté Mollie → reste en capture.
const MOLLIE_LIVE_USD=new Set(["florida","puntacana","rivieramaya"])
// GO-LIVE Mollie : paiements RÉELS ouverts sur EUR (MQ/GP) ET USD câblés (Floride/
// Punta Cana/Cancún, 2026-06-26 après validation d'un vrai paiement USD). défaut =
// false (live) partout SAUF les régions USD sans caisse (barbados) qui restent en
// capture. Kill-switch : ?pay_capture=1 force la capture ; ?pay_capture=0 / ?pay=... force le live (QA).
export const PAY_CAPTURE_ONLY=(()=>{try{const q=window.location.search;
  if(/[?&]pay_capture=1/.test(q))return true;
  if(/[?&]pay_capture=0/.test(q)||/[?&]pay=(paypal|mollie|stripe)/.test(q))return false;
}catch(_){}return IS_NEW_REGION&&!MOLLIE_LIVE_USD.has(REGION.id)})()
// Buy Button IDs — creer sur dashboard.stripe.com/buy-buttons puis coller ici
const STRIPE_BUY_BTN_MONTHLY="buy_btn_1TJLdoP9RK8Orx514zzwL1B4" // 4.99€/mois + trial 7j + taxes
const STRIPE_BUY_BTN_ANNUAL="buy_btn_1TJLcjP9RK8Orx51JDzUFge3"
/* ── Paywall région-aware — nouvelles régions UNIQUEMENT (MQ/GP : constantes EUR
   ci-dessus inchangées). REGION.paymentLinks={monthly,yearly} en devise locale.
   Liens absents → CTA paywall masqué (waitlist), JAMAIS de fallback vers l'EUR. ── */
export const REGION_PAY=IS_NEW_REGION?(REGION.paymentLinks||{}):null
// Devise de paiement front (miroir du backend mollie.php $CUR_BY_ISLAND). USD pour
// les régions touristes (Floride/Punta Cana/Cancún), EUR pour MQ/GP. Pilote PassOffer
// (prix $), l'écran de paiement (passCtxRef.cur) et la feuille native Apple/Google Pay.
export const PAY_CUR=(IS_NEW_REGION&&REGION&&REGION.currency==="USD")?"usd":"eur"
// EUR (MQ/GP, REGION_PAY null) : plans dispo ON-SITE → marqueur truthy "onsite"
// (PAS une URL) qui alimente hasMonthly/hasAnnual/PAYWALL_READY sans réintroduire
// le moindre lien off-site. Aucun code ne navigue plus vers LINK_* (stripeLinkFor
// est mort depuis le retrait des redirects) : ces consts ne sont que des drapeaux.
export const LINK_MONTHLY=REGION_PAY?(REGION_PAY.monthly||""):"onsite"
export const LINK_ANNUAL=REGION_PAY?(REGION_PAY.yearly||""):"onsite"
export const LINK_PRO=REGION_PAY?"":STRIPE_LINK_PRO
export const PAYWALL_READY=!REGION_PAY||!!LINK_MONTHLY
// EUR (MQ/GP, REGION_PAY null) : fallback de prix non-null OBLIGATOIRE — depuis
// le passage no-trial global, les branches "accès immédiat" consomment PRICE_MO/
// PRICE_YR à nu (avant, elles ne tournaient que pour l'USD). getLang() est défini
// au module (l.81) → libellé localisé fr/en. Sans ça : "null/mois", "Payer null".
export const PRICE_MO=REGION_PAY?(REGION.pricing?.monthly||"$9.99"):(getLang()==="en"?"€4.99":"4,99 €")
// EUR (MQ/GP) : annuel porté de 39,99 € → 49 € (offre miroir de l'US $79/an).
// Le serveur résout prices['annual'] depuis stripe-config.php — le price ID
// 'annual' EUR doit refléter 49 €/an (action fondateur).
export const PRICE_YR=REGION_PAY?(REGION.pricing?.yearly||"$79"):(getLang()==="en"?"€49":"49 €")
// Prix/jour dérivé du mensuel (devise-aware) — pour l'ancrage « moins qu'un café »
// dans la fiche. USD → "$0.33", EUR → "0,16 €". Null si non-parsable (fallback).
function pricePerDay(){
  try{
    const mo=String(PRICE_MO)
    const num=parseFloat(mo.replace(',','.').replace(/[^0-9.]/g,''))
    if(!isFinite(num)||num<=0)return null
    const d=num/30
    return /\$/.test(mo)?`$${d.toFixed(2)}`:`${d.toFixed(2).replace('.',',')} €`
  }catch(_){return null}
}
// Trip Pass (USD A/B pw_trippass) : accès UNIQUE 7 jours, paiement one-time —
// aligné sur la durée d'un séjour, pas d'abonnement. Inerte tant que
// REGION.paymentLinks.tripPass n'existe pas (le lien Stripe one-time est créé
// par create-region-payment-links.cjs). Jamais branché sur effectivePlan /
// stripeLinkFor (chemin funnel protégé) : chemin de checkout séparé.
const LINK_TRIP=REGION_PAY?(REGION_PAY.tripPass||""):""
export const PRICE_TRIP=REGION_PAY?(REGION.pricing?.tripPass||"$5.99"):null
// Montant du Trip Pass en cents, dérivé du prix région ("$5.99" → 599). Doit
// matcher l'allowlist serveur create-checkout.php action:pay_once ($USD_ISLANDS
// → [599]). 0 si non-parsable → startTripPass devient inerte (jamais d'appel
// avec un montant hors allowlist qui se ferait rejeter 400).
export const TRIP_CENTS=(()=>{const n=parseFloat(String(PRICE_TRIP||"").replace(/[^\d.]/g,""));return Number.isFinite(n)&&n>0?Math.round(n*100):0})()
// ── Offres EUR (MQ/GP) en MIROIR de l'US — Trip Pass 7j + Annuel ──────────────
// MQ/GP = build PARTAGÉ → REGION=null (détection hostname). Les prix d'affichage
// sont donc des CONSTANTES en dur, comme PRICE_MO/PRICE_YR ci-dessus (REGION.pricing
// n'est lisible que pour les NOUVELLES régions). Les valeurs miroir du bloc
// `pricing` ajouté à regions/mq.json + gp.json (source de vérité config).
//
// TRIP PASS EUR : accès UNIQUE 7 jours, 4,99 € one-time (miroir du tripPass USD
// $5.99). Chemin de checkout SÉPARÉ de l'abo (passCtxRef + action:pay_once),
// devise EUR. 499¢ DOIT être dans l'allowlist serveur pay_once EUR
// (create-checkout.php → [499, 799, ...]). EUR uniquement (!IS_NEW_REGION).
export const EUR_TRIP_CENTS=499
export const PRICE_TRIP_EUR=getLang()==="en"?"€4.99":"4,99 €"
// ANNUEL EUR : 49 €/an (miroir du yearly USD $79). DÉJÀ entièrement câblé côté
// code (hasAnnual=true pour EUR → toggle annuel, défaut=annuel, serveur 'subscribe'
// résout prices['annual'] depuis stripe-config.php). Seul l'affichage du prix
// annuel restait à 39,99 € : PRICE_YR ci-dessus le porte désormais à 49 € (sans
// toucher la copy sous A/B). Le vrai price ID 'annual' EUR doit exister dans
// stripe-config.php (action fondateur — price_REPLACE_ME_STRIPE_EUR_yearly_49).
// 2026-06-17 — Essai gratuit retiré PARTOUT : paiement IMMÉDIAT (USD + EUR, MQ/GP
// inclus). Le serveur (create-checkout.php $noTrial=true) facture immédiatement ;
// cette constante bascule toute la copy front en mode "accès immédiat". Le
// renversement de risque s'appuie sur « paiement unique, sans abonnement » (la
// garantie 30j volontaire a été RETIRÉE le 2026-06-29 : accès numérique consommé
// immédiatement). Réversible : repasser à une logique par-région si besoin d'A/B.
export const NO_TRIAL=true

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */
const g=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const s=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}

/* ═══════════════════════════════════════════════════════════════════════════
   A/B TESTING + ANALYTICS
   ═══════════════════════════════════════════════════════════════════════════ */
export function abVariant(testId,variants,weights){
  const ab=g("sg_ab",{})
  if(ab[testId]!=null&&ab[testId]<variants.length)return variants[ab[testId]]
  const r=Math.random();let cum=0,pick=0
  for(let i=0;i<weights.length;i++){cum+=weights[i];if(r<cum){pick=i;break}}
  ab[testId]=pick;s("sg_ab",ab)
  return variants[pick]
}

const TRACK_QUEUE_KEY="sg_track_queue"
const APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
export function track(event,params={}){
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
    ||event==="sg_email_submit"||event==="sg_forecast_lock_click"||event==="sg_session_start"||event==="sg_friction"
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
  // Tracking FIRST-PARTY indépendant (sans GA/Sheets) : capture l'event dans le résumé de session.
  try{sgCollectEvent(event,p)}catch(e){}
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

// Envoi RÉSILIENT d'un lead capturé vers la liste (Apps Script). L'ancien
// fetch fire-and-forget était silencieusement perdu si la page naviguait pendant
// la requête (capture = levier #1, on ne peut PAS perdre un email saisi) ou si
// Apps Script était froid. sendBeacon survit à l'unload ; fallback fetch keepalive.
export function submitLead(email,source){
  try{
    const island=IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ"
    const body=JSON.stringify({email,island,source,date:new Date().toISOString()})
    if(navigator.sendBeacon){try{if(navigator.sendBeacon(APPS_SCRIPT_URL,body))return}catch{}}
    fetch(APPS_SCRIPT_URL,{method:"POST",mode:"no-cors",keepalive:true,headers:{"Content-Type":"text/plain"},body}).catch(()=>{})
  }catch{}
}

// ── ENGAGEMENT CONTINU — le produit "se voit penser" : on mesure l'ENNUI/le BLOCAGE, pas
//    seulement les clics. Par écran : temps passé, nb d'actions, plus longue inactivité, scroll,
//    flag `bored` (entré, rien fait, resté / longue inactivité). Émis vers GA4 via track() à
//    chaque changement d'écran + quand l'onglet se cache. C'est la donnée pour adapter ("réfléchir").
const _eng={screen:null,t0:0,acts:0,last:0,idleMax:0,maxScroll:0,inited:false,dirty:false}
function engFlush(reason){
  if(!_eng.screen||!_eng.t0||!_eng.dirty)return // dirty = activité/visite non encore remontée (anti-doublon hide)
  const now=Date.now(),dwell=now-_eng.t0
  if(dwell<400)return
  const idleMax=Math.max(_eng.idleMax,_eng.last?now-_eng.last:0)
  const bored=(_eng.acts===0&&dwell>6000)||idleMax>20000
  _eng.dirty=false
  try{track("sg_engagement",{screen:_eng.screen,dwell_ms:Math.round(dwell),actions:_eng.acts,idle_max_ms:Math.round(idleMax),max_scroll:_eng.maxScroll,bored:bored?1:0,reason})}catch(e){}
}
function engScreen(screen){
  if(!screen||_eng.screen===screen)return
  engFlush("switch")
  const now=Date.now();_eng.screen=screen;_eng.t0=now;_eng.acts=0;_eng.last=now;_eng.idleMax=0;_eng.maxScroll=0;_eng.dirty=true
}
function engInit(){
  if(_eng.inited||typeof window==="undefined")return;_eng.inited=true
  const act=()=>{const n=Date.now();if(_eng.last)_eng.idleMax=Math.max(_eng.idleMax,n-_eng.last);_eng.last=n;_eng.acts++;_eng.dirty=true}
  try{
    window.addEventListener("pointerdown",act,{passive:true})
    window.addEventListener("keydown",act,{passive:true})
    window.addEventListener("wheel",act,{passive:true})
    let _scRaf=0 // throttle rAF : lit scrollHeight/clientHeight (layout) AU PLUS 1×/frame, pas par event
    window.addEventListener("scroll",()=>{if(_scRaf)return;_scRaf=requestAnimationFrame(()=>{_scRaf=0;const h=document.documentElement,sc=h.scrollHeight-h.clientHeight;if(sc>0){const p=Math.round(h.scrollTop/sc*100);if(p>_eng.maxScroll)_eng.maxScroll=p}})},{passive:true})
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")engFlush("hide")})
    window.addEventListener("pagehide",()=>engFlush("pagehide"))
    // FRICTION temps réel : rage-click (≥3 clics rapprochés au même endroit) =
    //   "ça marche pas / je suis bloqué". Émis first-party (sg_friction) → nourrit
    //   l'alerte analyze-ux.cjs pour qu'on construise le fix (svg/marketing/code).
    let _rc=[]
    const _ric=window.requestIdleCallback||(f=>setTimeout(f,0))
    window.addEventListener("click",e=>{
      // Heatmap/dead-click hors chemin critique du tap (getComputedStyle = reflow synchrone) :
      // on capture un snapshot léger puis on agrège en idle → protège l'INP (mesuré 464-496ms).
      const snap={target:e.target,clientX:e.clientX,clientY:e.clientY}
      _ric(()=>{try{sgCollectClick(snap)}catch(_){}})
      const n=Date.now();_rc=_rc.filter(c=>n-c.t<900);_rc.push({t:n,x:e.clientX,y:e.clientY})
      if(_rc.length>=3){const a=_rc[0],b=_rc[_rc.length-1];if(Math.hypot(b.x-a.x,b.y-a.y)<44){_rc=[];try{track("sg_friction",{type:"rage",screen:_eng.screen||"?",el:_sgElDesc(snap.target)})}catch(_){}}}
    },{passive:true})
  }catch(e){}
}

// ── TRACKING FIRST-PARTY INDÉPENDANT (sans GA / sans Sheets / sans tiers) ──────────────
//    L'app POST en SAME-ORIGIN un RÉSUMÉ DE SESSION (events + engagement par écran) vers
//    /collect.php sur NOTRE hébergeur. Bufferisé en localStorage, beaconé au masquage de
//    l'onglet. Si l'endpoint n'existe pas (404, dev) → tout reste en local, rien ne casse.
//    Aucune PII (sid/cid anonymes). C'est notre source de vérité, on ne dépend de personne.
const SG_COLLECT_URL="/collect.php"
const _sgc={sid:null,buf:null,dirty:false,started:false,lastSend:0}
function _sgcRand(n){try{return Date.now().toString(36)+Math.random().toString(36).slice(2,2+n)}catch(_){return "x"+n}}
function _sgcSid(){try{let s=sessionStorage.getItem("sg_sid");if(!s){s=_sgcRand(6);sessionStorage.setItem("sg_sid",s)}return s}catch(_){return "x"}}
function _sgcCid(){try{let c=localStorage.getItem("sg_cid");if(!c){c=_sgcRand(8);localStorage.setItem("sg_cid",c)}return c}catch(_){return "x"}}
// ── Parrainage : code stable par device (REF-XXXXXX) + attribution filleul ──────
// Mon code = dérivé du cid (stable, idempotent). sgReferredBy() = code du parrain
// si présent, valide, dans la fenêtre 30j, et ≠ mon propre code (anti-auto-parrainage).
export function sgMyReferralCode(){try{let c=localStorage.getItem("sg_referral_code");if(!c){c="REF-"+hashSeed(_sgcCid()+":ref").toString(36).toUpperCase().slice(0,6);localStorage.setItem("sg_referral_code",c)}return c}catch(_){return ""}}
// Vérif d'abonnement cross-device (PWA iOS = localStorage séparé, lien email).
// Interroge LES DEUX backends : Mollie (provider actif au go-live) ET Stripe legacy
// (16 abos historiques). Retourne la réponse du backend actif (préserve trialEnd/
// status pour les appelants). Avant : 100% Stripe → tout abonné Mollie échouait.
export async function sgVerifySub(email){
  const one=(url)=>fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verify_subscription",email})}).then(r=>r.json()).catch(()=>({active:false}))
  const[m,s]=await Promise.all([one("/api/mollie.php"),one("/api/create-checkout.php")])
  if(m&&m.active)return m
  if(s&&s.active)return s
  return m||s||{active:false}
}
export function sgReferredBy(){try{const raw=localStorage.getItem("sg_referred_by");if(!raw)return "";let code="",ts=0;try{const o=JSON.parse(raw);code=o.code||"";ts=o.ts||0}catch(_){code=raw}/* rétro-compat string legacy */if(!/^REF-[A-Z0-9]{6}$/.test(code))return "";if(ts&&Date.now()-ts>30*86400000)return ""/* attribution expirée */;if(code===sgMyReferralCode())return ""/* anti-auto-parrainage */;return code}catch(_){return ""}}

// ── Gating J+2→J+7 (le verdict J+0/J+1 reste 100% gratuit) ─────────────────────
// Le JSON public ne sert que J+0/J+1 ; la série complète vit derrière forecast.php
// (auth email/pass/abo/comp OU token widget Pro). Flag rollback front `?gating=0`
// → on n'appelle pas l'endpoint (le front se contente du public, sans tenter le merge).
export const GATING=(()=>{try{return !/[?&]gating=0/.test(window.location.search)}catch(_){return true}})()
// Récupère la prévision COMPLÈTE si on a une credential serveur-vérifiable (token
// widget ?k= OU email payeur en localStorage). Retourne la map {beachId:[7j]} ou
// null. Lecture seule, n'encaisse rien ; 403 propre si pas d'accès → null.
export async function fetchFullForecast(){
  try{
    if(!GATING)return null
    let k="";try{k=new URLSearchParams(window.location.search).get("k")||""}catch(_){}
    // Token signé ?k= (lien pass marketing/manuel OU widget Pro) : on le PERSISTE
    // → il survit à la navigation/reload, donc un premium par lien signé (sans
    // sg_email) garde J+2-7 sans avoir le ?k= à chaque visite. URL gagne (refresh),
    // sinon on retombe sur le token stocké.
    try{
      if(k)localStorage.setItem("sg_fc_token",k)
      else k=localStorage.getItem("sg_fc_token")||""
    }catch(_){}
    if(k){
      const r=await fetch(`/api/copernicus/forecast.php?k=${encodeURIComponent(k)}`)
      if(r.ok){const j=await r.json();if(j&&j.ok&&j.weekly)return j.weekly}
    }
    // sg_email OU sg_premium_email : un accès par lien/comp (?premium_email) pose
    // sg_premium_email même quand sg_email est absent (ex. pass anonyme upgradé). On
    // tente les deux — la SÉCURITÉ est côté serveur (forecast.php → mol_access_for_email
    // → 403 pour un non-payeur), pas côté client : un email gratuit posé par une
    // inscription newsletter renvoie 403 et reste gaté, aucune fuite.
    let email="";try{email=localStorage.getItem("sg_email")||localStorage.getItem("sg_premium_email")||""}catch(_){}
    if(email){
      const r=await fetch("/api/copernicus/forecast.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})})
      if(r.ok){const j=await r.json();if(j&&j.ok&&j.weekly)return j.weekly}
    }
  }catch(_){}
  return null
}
function _sgcEnsureBuf(){
  if(_sgc.buf)return
  const region=(typeof IS_NEW_REGION!=="undefined"&&IS_NEW_REGION&&typeof REGION!=="undefined")?REGION.id:(location.hostname.includes("guadeloupe")?"gp":"mq")
  let lang="fr";try{if(typeof getLang==="function")lang=getLang()}catch(_){}
  _sgc.buf={v:1,sid:_sgcSid(),cid:_sgcCid(),region,lang,ts:Date.now(),ref:(document.referrer||"").slice(0,180),ab:g("sg_ab",{}),ev:[],scr:{},clk:{},de:{}}
}
// Mini-heatmap FIRST-PARTY (remplace Clarity, 100% organique) : chaque clic est bucket-quantifié
// par écran (grille 16×24, coords NORMALISÉES → résolution-agnostique, AUCUNE coord brute, zéro PII)
// + dead-click (clic sur un non-interactif = frustration). Agrégé client-side → payload minuscule.
// Descripteur COMPACT et SANS PII d'un élément (tag + #id|.classe + [role]), pour NOMMER
// le coupable d'un dead/rage-click — Clarity ne donne que la PAGE (target vide), la heatmap
// que le bucket. Zéro texte libre, zéro .value → aucune donnée utilisateur, juste l'identité
// du nœud UI. Transforme « 5653 dead-clicks sur / » en « 5653 dead-clicks sur <l'élément> ».
function _sgElDesc(t){
  try{
    if(!t||t.nodeType!==1)return "?"
    let s=(t.tagName||"?").toLowerCase()
    if(t.id&&typeof t.id==="string")s+="#"+t.id.slice(0,24)
    else if(typeof t.className==="string"&&t.className.trim()){const c=t.className.trim().split(/\s+/)[0];if(c)s+="."+c.slice(0,24)}
    try{const role=t.getAttribute&&t.getAttribute("role");if(role)s+="[role="+String(role).slice(0,16)+"]"}catch(_){}
    return s.slice(0,48)
  }catch(_){return "?"}
}
// e = event OU snapshot léger {target,clientX,clientY} (appelé en requestIdleCallback →
// getComputedStyle sort du chemin critique du tap, protège l'INP mesuré 464-496ms mobile).
function sgCollectClick(e){
  try{
    _sgcEnsureBuf();if(!_sgc.buf||!_sgc.buf.clk)return
    const scr=(typeof _eng!=="undefined"&&_eng&&_eng.screen)||"?"
    const W=window.innerWidth||1,H=window.innerHeight||1
    const gx=Math.max(0,Math.min(15,Math.floor((e.clientX/W)*16))),gy=Math.max(0,Math.min(23,Math.floor((e.clientY/H)*24)))
    const k=gx+"_"+gy
    let dead=true;const tgt=e.target
    try{const t=tgt
      if(t&&t.closest&&t.closest('button,a,input,select,textarea,label,[role="button"],.leaflet-marker-icon,[data-beach]'))dead=false
      else if(t&&t.nodeType===1){const cs=getComputedStyle(t);if(cs&&cs.cursor==="pointer")dead=false}
    }catch(_){dead=false}
    const o=_sgc.buf.clk[scr]||(_sgc.buf.clk[scr]={b:{},d:{},n:0})
    if(o.b[k]==null&&Object.keys(o.b).length>=240)return // cap buckets/écran (anti-abus payload)
    o.b[k]=(o.b[k]||0)+1;if(dead)o.d[k]=(o.d[k]||0)+1;o.n++;_sgc.dirty=true
    // NOMME le coupable du dead-click (élément, pas juste bucket) → fix ciblé, plus de devinette.
    if(dead&&tgt){const de=_sgc.buf.de||(_sgc.buf.de={});const m=de[scr]||(de[scr]={});const dk=_sgElDesc(tgt)
      if(m[dk]!=null||Object.keys(m).length<24)m[dk]=(m[dk]||0)+1}
  }catch(_){}
}
function sgCollectEvent(event,params){
  try{
    _sgcEnsureBuf()
    if(event==="sg_engagement"){
      const s=(params&&params.screen)||"?"
      const o=_sgc.buf.scr[s]||(_sgc.buf.scr[s]={dwell:0,acts:0,bored:0,maxScroll:0,n:0})
      o.dwell+=(params&&params.dwell_ms)||0;o.acts+=(params&&params.actions)||0;o.bored+=(params&&params.bored)?1:0
      o.maxScroll=Math.max(o.maxScroll,(params&&params.max_scroll)||0);o.n++
    }else if(_sgc.buf.ev.length<120){
      _sgc.buf.ev.push({e:event,t:Date.now()-_sgc.buf.ts})
    }
    _sgc.dirty=true
  }catch(_){}
}
function _sgcStash(body){try{const q=JSON.parse(localStorage.getItem("sg_collect_q")||"[]");q.push(body);if(q.length>30)q.splice(0,q.length-30);localStorage.setItem("sg_collect_q",JSON.stringify(q))}catch(_){}}
// ── SCREENS_V2 #27 — file hors-ligne des SIGNALEMENTS plage (zéro perte) ───────
//    Un signalement émis hors-ligne (plage = mauvais réseau) était perdu (.catch
//    vide). On le met en file localStorage + on le rejoue au boot et au retour du
//    réseau. Best-effort, no-cors (réponse opaque → on ne peut détecter que l'échec
//    réseau = hors-ligne). Cap 30. Purement additif, zéro logique paiement.
const SG_REPORT_URL="https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
// Capture photo visiteur (BeachReport) — backend SUPABASE (mobile-friendly, voir
// src/supabasePhotos.js). S'active AUTOMATIQUEMENT dès que SUPABASE_URL + ANON_KEY
// sont renseignés (sinon no-op). Détails : docs/visitor-photos-runbook.md.
const PHOTO_UPLOAD_ENABLED=supabaseConfigured()
// Événements terrain (échouement / ramassage) — capture Supabase `beach_reports`,
// SIGNAL AFFICHÉ modéré à côté du verdict (ne touche PAS la couleur = 100 % data
// ERDDAP ; panel adverse 2026-07-01). Flag rollback : ?ramassage=0 → OFF. Inerte
// tant que Supabase pas configuré (no-op), comme les photos.
const RAMASSAGE_ENABLED=supabaseConfigured()&&!(typeof location!=="undefined"&&/[?&]ramassage=0/.test(location.search||""))
// Vrai PENDANT la capture photo (caméra/sélecteur ouverts → page en arrière-plan).
// Ouvrir la caméra émet `visibilitychange:hidden` ; sans ce garde, l'exit-intent
// monterait un overlay plein écran (ExitVeilleurCard) PAR-DESSUS la fiche au retour
// = UI gelée. Prendre une photo n'est PAS « quitter le site ». Cf. fire()/onVis ci-dessous.
let _sgCapturingPhoto=false
function _sgReportStash(body){try{const q=JSON.parse(localStorage.getItem("sg_report_q")||"[]");q.push(body);if(q.length>30)q.splice(0,q.length-30);localStorage.setItem("sg_report_q",JSON.stringify(q))}catch(_){}}
function _sgReportFlush(){try{const q=JSON.parse(localStorage.getItem("sg_report_q")||"[]");if(!q.length)return;localStorage.removeItem("sg_report_q");q.forEach(body=>{try{fetch(SG_REPORT_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},body}).catch(()=>_sgReportStash(body))}catch(_){_sgReportStash(body)}})}catch(_){}}
function sgCollectFlush(reason){
  try{
    if(!_sgc.buf||!_sgc.dirty)return
    _sgc.dirty=false;_sgc.lastSend=Date.now()
    const body=JSON.stringify({..._sgc.buf,dur:Date.now()-_sgc.buf.ts,reason})
    let ok=false
    try{ok=navigator.sendBeacon&&navigator.sendBeacon(SG_COLLECT_URL,new Blob([body],{type:"application/json"}))}catch(_){}
    if(!ok){try{fetch(SG_COLLECT_URL,{method:"POST",body,headers:{"Content-Type":"application/json"},keepalive:true}).then(r=>{if(!r.ok)_sgcStash(body)}).catch(()=>_sgcStash(body))}catch(_){_sgcStash(body)}}
  }catch(_){}
}
function sgCollectInit(){
  if(_sgc.started||typeof window==="undefined")return;_sgc.started=true
  // rejoue la file d'une session précédente (best-effort, beacon)
  try{const q=JSON.parse(localStorage.getItem("sg_collect_q")||"[]");if(q.length){localStorage.removeItem("sg_collect_q");q.forEach(b=>{try{navigator.sendBeacon&&navigator.sendBeacon(SG_COLLECT_URL,new Blob([b],{type:"application/json"}))}catch(_){}})}}catch(_){}
  // #27 : rejoue les signalements plage en attente (boot + retour réseau)
  try{_sgReportFlush()}catch(_){}
  try{window.addEventListener("online",_sgReportFlush)}catch(_){}
  try{
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")sgCollectFlush("hide")})
    window.addEventListener("pagehide",()=>sgCollectFlush("pagehide"))
    setInterval(()=>{if(_sgc.dirty&&Date.now()-_sgc.lastSend>25000)sgCollectFlush("interval")},25000)
  }catch(_){}
}

// ── DÉBLOCAGE PROGRESSIF + CAPTURE D'INTENTION (fondation funnel-wide, nuit 2) ──────────
//    Générique, réutilisable par le jeu Solutions ET chaque étape du funnel : l'engagement
//    déverrouille des clés d'accès à NOS données (persistées localStorage), et chaque interaction
//    émet un event d'INTENTION via track() → /collect.php (first-party) → KPI. Anti-slop, mesurable.
function sgUnlockState(){try{return JSON.parse(localStorage.getItem("sg_unlocks")||'{"keys":[],"v":1}')}catch(_){return{keys:[],v:1}}}
function sgHasUnlock(k){try{return sgUnlockState().keys.indexOf(k)>=0}catch(_){return false}}
function sgUnlock(k,meta){try{const s=sgUnlockState();if(s.keys.indexOf(k)<0){s.keys.push(k);localStorage.setItem("sg_unlocks",JSON.stringify(s));try{track("sg_unlock",{key:k,total:s.keys.length,...(meta||{})})}catch(e){}}return true}catch(_){return false}}
function sgUnlockCount(){try{return sgUnlockState().keys.length}catch(_){return 0}}
// Capture d'intention : QUEL problème/solution/plage intéresse l'user, où il s'attarde → KPI (stats.php).
function sgIntent(name,params){try{track("sg_intent",{intent:name,...(params||{})})}catch(_){}}
try{if(typeof window!=="undefined"){window.sgHasUnlock=sgHasUnlock;window.sgUnlockCount=sgUnlockCount}}catch(_){}

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
 * isImmuneBay — distingue une baie RÉELLEMENT fermée (arrivée physiquement quasi-
 * impossible → vert confiant SANS réserve) d'une côte « sous-le-vent » qui est
 * rarement touchée MAIS peut l'être en régime exceptionnel (côte caraïbe nord MQ
 * type Prêcheur/Grand'Rivière/Anse Céron/Anse Couleuvre — observé le 2026-06-29).
 * Sur ces côtes lee on n'a AUCUNE sentinelle satellite : un « propre » interpolé est
 * une lecture INDIRECTE → il doit porter la réserve d'honnêteté (_satBlind), jamais
 * un vert affirmé. Seules les baies vraiment fermées restent sans réserve.
 * MQ : Baie de Fort-de-France (Trois-Îlets/Schoelcher) + Anses d'Arlet nord.
 * GP : pas de baie fermée équivalente — la côte ouest Basse-Terre est une façade lee.
 */
function isImmuneBay(lat,lng,island){
  if(island==="mq"){
    // Baie de Fort-de-France (Trois-Îlets, Schoelcher) : baie fermée, immune réelle
    if(lat>14.54&&lat<14.68&&lng<-61.02&&lng>-61.16)return true
    // Anses d'Arlet nord (Anse Noire, Anse Dufour) : poche sud-ouest très abritée
    if(lat>14.52&&lat<14.55&&lng<-61.08)return true
    // NB : la côte nord-ouest (lat>14.78) est une côte sous-le-vent, PAS une baie
    // fermée → volontairement absente ici (elle doit porter la réserve _satBlind).
    return false
  }
  return false
}

/**
 * padForecast — PERSISTANCE HONNÊTE : complète une série de prévision courte (souvent
 * 2 jours quand forecast.php n'a pas répondu) jusqu'à `len` jours, en REPORTANT le
 * dernier jour MESURÉ : on réutilise son afai RÉEL (jamais un afai inventé), on dérive
 * le statut de cet afai, et on fait DÉCROÎTRE la confiance (×0.78/jour, plancher 8) en
 * marquant type:'horizon' + _persisted:true. C'est une vraie méthode (persistance, cf.
 * scripts/lib/forecast.cjs) → aucune surface (carte/fiche/graphe) n'affiche plus de gris
 * muet à un premium qui a payé ; l'incertitude reste VISIBLE (confiance basse + 'horizon').
 * Réutilise la même formule que WorldMapView.jsx (cohérence inter-surfaces). Rollback : ?persist=0.
 */
function padForecast(fc, len = 7) {
  if (!Array.isArray(fc) || !fc.length || fc.length >= len) return fc
  try { if (/[?&]persist=0/.test(window.location.search)) return fc } catch (_) {}
  const out = fc.slice()
  const lastReal = out.length - 1
  const last = out[lastReal]
  const _DOW = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
  for (let d = out.length; d < len; d++) {
    const conf = Math.max(8, Math.round((last.confidence != null ? last.confidence : 35) * Math.pow(0.78, d - lastReal)))
    let date = last.date, day = last.day
    try { if (last.date) { const dd = new Date(last.date + "T00:00:00Z"); dd.setUTCDate(dd.getUTCDate() + (d - lastReal)); date = dd.toISOString().slice(0, 10); day = _DOW[dd.getUTCDay()] } } catch (_) {}
    out.push({ day, date, afai: last.afai, status: last.status, confidence: conf, type: 'horizon', regime: last.regime, sources: ['persistence'], _persisted: true })
  }
  return out
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

/* Vignette golden-hour de marque — remplace les photos externes (Google Places)
   et les tuiles satellite qui juraient avec le design « 100% nos assets ».
   Dégradé ciel→soleil→mer (SCENE_TOKENS) teinté par l'état réel de la plage. */
function beachThumbBg(beach){
  const c=(ST[beach?.status]||ST._loading).c
  return`radial-gradient(120% 78% at 50% 14%, ${c}3a 0%, transparent 58%), linear-gradient(168deg, #2e1a5e 0%, #6a2f9e 30%, #C97E3A 56%, #F2B05E 70%, #6a2f9e 84%, #1a1140 100%)`
}

/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL STYLES (injected once)
   ═══════════════════════════════════════════════════════════════════════════ */


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
        color:active?"rgba(26,18,0,.75)":"var(--sg-mid,#5A5A5A)",
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
        <span style={{fontSize:10,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",minWidth:52,letterSpacing:".03em",textTransform:"uppercase"}}>{LL.reliabilityLabel}</span>
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
        <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginBottom:6,lineHeight:1.5,
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
      fontSize:9,color:"var(--sg-mid,#5A5A5A)",letterSpacing:".02em",lineHeight:1.5,
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
      <p style={{margin:0,fontSize:13.5,lineHeight:1.65,color:"var(--sg-mid,#5A5A5A)"}}>
        <span style={{fontWeight:800,color:accent||"var(--sg-ink,#0D0D0D)"}}>{label}</span>
        <span style={{opacity:.4,margin:"0 4px"}}>·</span>
        {rest}
      </p>
    )
  }
  return <p style={{margin:0,fontSize:13.5,lineHeight:1.65,color:"var(--sg-mid,#5A5A5A)"}}>{text}</p>
}

function LearnView({lang,onBack,onGoMap}){
  const LL=T[lang]||T.fr
  return(
    <div className="view-enter" style={{position:"absolute",inset:0,zIndex:750,
      background:"var(--sg-bg,#FDFCF7)",overflowY:"auto",overflowX:"hidden",
      WebkitOverflowScrolling:"touch"}}>
      {/* Ambient gradient glow */}
      <div style={{position:"absolute",top:-80,left:"50%",transform:"translateX(-50%)",
        width:420,height:420,borderRadius:"50%",
        background:`radial-gradient(circle,${C.teal}18 0%,${C.teal}00 60%)`,
        pointerEvents:"none",filter:"blur(20px)"}}/>
      {/* Floating particles */}
      <div style={{position:"absolute",top:60,left:"20%",fontSize:20,opacity:.15,
        animation:"floatParticle 8s ease-in-out 1 both",pointerEvents:"none"}}>🌊</div>
      <div style={{position:"absolute",top:120,right:"15%",fontSize:16,opacity:.12,
        animation:"floatParticle 10s ease-in-out 1 both .5s",pointerEvents:"none"}}>🌿</div>

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

function BottomNav({view,onChangeView,lang,premiumOpen,glass=false,isPremium=false}){
  const LL=T[lang]||T.fr
  // Le jeu reste un EASTER EGG (toast d'inactivité), jamais un onglet de menu
  // (directive user 14/06 : « j'aimais bien le jeu en petit easter egg pas en menu »).
  // Pictos SVG mono-trait ink (plus d'emoji OS). currentColor suit l'état actif/inactif.
  const ICON={
    map:(<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6.5 9 4l6 2.5 6-2.5V17.5L15 20 9 17.5 3 20z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"/>
      <path d="M9 4v13.5M15 6.5V20" stroke="currentColor" strokeWidth="2"/></svg>),
    list:(<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>),
    premium:(<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z" fill="#E8A800" stroke="#0d0b14" strokeWidth="1.6" strokeLinejoin="round"/></svg>),
  }
  let tabs=[
    {id:"map",label:LL.navMap,icon:ICON.map},
    {id:"list",label:LL.navList,icon:ICON.list},
    {id:"premium",label:LL.navPremium,icon:ICON.premium},
  ]
  if(isPremium) tabs=tabs.filter(t=>t.id!=="premium")
  if(!glass) return(
    <nav className="sg-bottom-nav" style={{
      position:"fixed",bottom:0,left:0,right:0,zIndex:800,
      display:"flex",justifyContent:"space-around",alignItems:"stretch",
      background:"var(--sg-card,#fff)",
      borderTop:"2.5px solid var(--sg-ink,#0d0b14)",
      boxShadow:"0 -4px 0 -1px var(--sg-ink,#0d0b14)",
      padding:"8px 4px max(12px,env(safe-area-inset-bottom))",
    }}>
      {tabs.map(t=>{
        const active=t.id==="premium"?premiumOpen:(view===t.id)
        const isPrem=t.id==="premium"
        return(
        <button key={t.id} onClick={()=>onChangeView(t.id)} style={{
          display:"flex",flexDirection:"column",alignItems:"center",gap:3,
          background:"none",border:"none",cursor:"pointer",
          color:active?"var(--sg-ink,#0d0b14)":"var(--sg-mid,#5A5A5A)",
          fontFamily:"'Bricolage Grotesque',sans-serif",
          fontSize:12,fontWeight:active?800:600,letterSpacing:0,
          transition:"color .2s",padding:"4px 16px",position:"relative",
          minHeight:44,justifyContent:"center",
        }}>
          {active&&<div style={{position:"absolute",top:-2,width:24,height:3,
            borderRadius:2,background:C.gold}}/>}
          {/* Premium : pastille OR pop-1 (PAS un 2e CTA pop-3 ; le CTA premium des écrans reste seul) */}
          <span style={isPrem?{
            width:30,height:30,borderRadius:999,display:"flex",alignItems:"center",justifyContent:"center",
            background:active?"linear-gradient(135deg,#FFC72C,#E8A800)":"#FFE47A",
            border:"2px solid var(--sg-ink,#0d0b14)",boxShadow:"2px 2px 0 var(--sg-ink,#0d0b14)",
          }:{
            width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",
            transition:"transform .34s cubic-bezier(.34,1.56,.64,1)",transform:active?"scale(1.12)":"scale(1)",
          }}>
            <span style={isPrem?{width:18,height:18,display:"flex"}:{width:22,height:22,display:"flex"}}>{t.icon}</span>
          </span>
          <span>{t.label}</span>
        </button>
      )})}
    </nav>
  )
  // VARIANTE glass : pill sombre flottant golden-hour, mobile + desktop
  return(
    <nav className="sg-bottom-nav sg-dock-glass" style={{
      position:"fixed",zIndex:800,
      display:"flex",alignItems:"center",gap:4,padding:5,
    }}>
      {tabs.map(t=>{
        const active=t.id==="premium"?premiumOpen:(view===t.id)
        return(
        <button key={t.id} onClick={()=>onChangeView(t.id)} style={{
          display:"flex",flexDirection:"row",alignItems:"center",gap:6,
          background:active?"rgba(255,199,44,.18)":"none",
          border:"none",cursor:"pointer",
          color:active?"#FFC72C":"rgba(255,255,255,.7)",
          fontSize:12,fontWeight:active?700:500,fontFamily:"inherit",
          transition:"all .2s",padding:"9px 15px",
          borderRadius:999,minHeight:44,justifyContent:"center",
        }}>
          <span style={{fontSize:18,transition:"transform .34s cubic-bezier(.34,1.56,.64,1)",
            transform:active?"scale(1.18)":"scale(1)"}}>{t.icon}</span>
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
  // pw_beat (backlog #4) : l'intention CHAUDE forecast-lock = un BEAT du scroll IN-SCÈNE
  // (golden-hour + Veilleur + 1 promesse positive + 1 preuve chiffrée + 1 CTA), PAS un
  // modal posé. Le CTA mène ENSUITE au checkout (onPremiumClick, inchangé). ?pwbeat=1/0.
  // control = comportement actuel (lock → modal direct). Additif, zéro contact paiement.
  // (hooks AVANT l'early-return ci-dessous = règle des hooks respectée.)
  // PROMU EN DÉFAUT (verdict design fondateur : « paywall = un BEAT du scroll, PAS un
  // modal posé ») → 85% révèlent le beat golden-hour inline, 15% holdout (modal direct).
  const pwBeat=(()=>{try{const q=window.location.search;if(/[?&]pwbeat=1/.test(q))return true;if(/[?&]pwbeat=0/.test(q))return false;return abVariant("pw_beat",["control","beat"],[.15,.85])==="beat"}catch(_){return false}})()
  const[beatOpen,setBeatOpen]=useState(false)
  const openLock=via=>{try{track("sg_forecast_lock_click",{variant:via,beat:pwBeat?1:0})}catch(_){};if(pwBeat)setBeatOpen(true);else onPremiumClick("forecast")}
  if(!forecast||!forecast.length)return null
  const LL=T[lang]||T.fr
  // v3: cap visible days at J+3 (horizon beyond that is unreliable per backtest)
  // Memory beaches: show only J+1 reliably
  const reliableHorizon=weeklyData?.reliableHorizon||3
  const targetDays=Math.max(4,reliableHorizon+1)
  const visible=forecast.slice(0,targetDays)
  // Gating J+2→J+7 : le JSON public ne porte que J+0/J+1. Pour le NON-premium on
  // complète l'aperçu jusqu'à targetDays avec des barres CADENAS NEUTRES (status
  // _loading gris, afai null — JAMAIS une valeur fabriquée). Le détail réel J+2-6
  // se débloque côté premium (forecast complet servi par forecast.php). Premium
  // sans merge (rare : pass local sans email) → on n'invente rien, on montre le réel.
  if(!isPremium&&visible.length<targetDays){
    const _DOW=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]
    const last=forecast[forecast.length-1]
    const lastDate=last&&last.date?last.date:null
    for(let i=visible.length;i<targetDays;i++){
      let date=null,day=null
      if(lastDate){const dd=new Date(lastDate+"T00:00:00Z");dd.setUTCDate(dd.getUTCDate()+(i-(forecast.length-1)));date=dd.toISOString().slice(0,10);day=_DOW[dd.getUTCDay()]}
      visible.push({date,day,afai:null,status:"_loading",confidence:null,type:"horizon",_ph:true})
    }
  }
  const visibleDays=visible.length
  // Guard: a single NaN/undefined afai would poison max → NaN heights (React warning)
  const max=Math.max(...visible.map(d=>d.afai).filter(Number.isFinite),.1)
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
          const afai=Number.isFinite(d.afai)?d.afai:0
          const h=Math.max(10,(afai/max)*74)
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
              {dayTemp!=null&&<span style={{fontSize:9,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",
                letterSpacing:".01em"}}>{dayTemp}°</span>}
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,lineHeight:1,
                letterSpacing:"-.01em",color:st.c}}>
                {Math.round(afai*100)}%
              </span>
              <div className="fc-bar" style={{width:"100%",height:h,
                background:`linear-gradient(180deg, ${st.c}, ${st.c}cc)`,
                borderRadius:"6px 6px 2px 2px",
                boxShadow:`0 -4px 14px -6px ${st.c}88, inset 0 1px 0 rgba(255,255,255,.3)`}}/>
              <span className="anton" style={{fontSize:11,lineHeight:1,letterSpacing:".02em",
                color:"var(--sg-mid,#5A5A5A)",textTransform:"uppercase",marginTop:2}}>
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
      {!isPremium&&lockedCount>0&&<div onClick={()=>openLock("control")}
        style={{position:"absolute",top:0,right:0,bottom:0,width:`${(lockedCount/visibleDays*100).toFixed(1)}%`,
        display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
        background:"linear-gradient(90deg,transparent,var(--sg-bg,#FDFCF7) 25%)",
        borderRadius:8}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <button className="gbtn" style={{
            padding:"10px 20px",fontSize:13,fontWeight:700,
            fontFamily:"'Anton',sans-serif",letterSpacing:".04em",textTransform:"uppercase",
          }}>
            🔒 {lockCTA}
          </button>
          <span style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",fontWeight:500,textAlign:"center",maxWidth:160}}>
            {lockSub}
          </span>
        </div>
      </div>}
    </div>
    {/* Locked-days teaser strip — outside the chart overlay so always visible */}
    {lockedDays.length>0&&(
      <div onClick={()=>openLock("strip")}
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
        <span style={{fontSize:10,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",flexShrink:0}}>
          {_t(lang,"Voir →","Unlock →","Ver →")}
        </span>
      </div>
    )}
    {/* pw_beat — BEAT golden-hour in-scène (pas un modal). L'horizon prévu de CETTE
        plage : 1 marque/jour, statut réel coloré, near-term net / lointain estompé
        (honnête, jamais sur-vendu). Veilleur humeur data-driven. 1 promesse positive,
        1 preuve chiffrée (confiance J+1), 1 CTA → checkout. Reveal one-shot, calme. */}
    {pwBeat&&beatOpen&&(()=>{
      const mood=VEILLEUR_MOOD[moodFromStatus(visible[0]?.status||"clean")]||VEILLEUR_MOOD.serein
      const allClean=visible.every(d=>d.status==="clean")
      const stCol=s=>s==="clean"?"#3fd07f":s==="moderate"?"#FFD27A":s==="avoid"?"#F4845F":"#8a8f93" // _loading/placeholder gaté → gris neutre (jamais "avoid" fabriqué)
      const G={background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",color:"transparent"}
      const promiseEl=allClean
        ?(lang==="es"?(<>Tu costa está limpia. <span style={G}>Mañana</span>, el Vigía ya lo ha visto.</>):lang==="en"?(<>Your coast is clear. <span style={G}>Tomorrow</span>, the Watchman has already seen it.</>):(<>Ta côte est propre. <span style={G}>Demain</span>, le Veilleur l'a déjà vu.</>))
        :(lang==="es"?(<>El Vigía vigila tu costa <span style={G}>cada día</span>, antes que tú.</>):lang==="en"?(<>The Watcher watches your coast <span style={G}>every day</span>, before you.</>):(<>Le Veilleur garde ta côte <span style={G}>chaque jour</span>, avant toi.</>))
      const proof=_t(lang,`Fiable à ${Math.round(firstConf)}% demain · vérifié satellite`,`${Math.round(firstConf)}% confidence tomorrow · satellite-verified`,`${Math.round(firstConf)}% de confianza mañana · verificado por satélite`)
      return(
        <div className="pw-beat-in" style={{marginTop:10,borderRadius:16,overflow:"hidden",border:"1px solid rgba(0,0,0,.06)",background:"#190c2c"}}>
          <style>{`@keyframes pwBeatIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.pw-beat-in{animation:pwBeatIn .34s cubic-bezier(.22,1,.36,1) both}@media(prefers-reduced-motion:reduce){.pw-beat-in{animation:none}}`}</style>
          <svg viewBox="0 0 400 116" preserveAspectRatio="xMidYMid slice" style={{width:"100%",height:108,display:"block"}} aria-hidden="true">
            <defs>
              <linearGradient id="pbSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient>
              <linearGradient id="pbSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/></linearGradient>
            </defs>
            <rect width="400" height="116" fill="url(#pbSky)"/>
            <circle cx="330" cy="84" r="40" fill="#FFD884" opacity=".2"/><circle cx="330" cy="84" r="22" fill="#FFD884" opacity=".4"/>
            <rect y="84" width="400" height="32" fill="url(#pbSea)"/>
            <line x1="0" y1="84" x2="400" y2="84" stroke="#FFD884" strokeWidth="1" opacity=".5"/>
            {visible.map((d,i)=>{const x=44+i*(312/Math.max(1,visible.length-1));const op=i<=2?.95:.45;const h=d.status==="clean"?4:d.status==="moderate"?9:13;return(<g key={i} opacity={op}><path d={"M"+(x-9).toFixed(0)+" 84 Q"+x.toFixed(0)+" "+(84-h)+" "+(x+9).toFixed(0)+" 84"} fill="none" stroke={stCol(d.status)} strokeWidth="1.4" opacity=".75"/><circle cx={x.toFixed(0)} cy="84" r={i===0?4.5:3.2} fill={stCol(d.status)}/><text x={x.toFixed(0)} y="104" fontFamily="ui-monospace,monospace" fontSize="8" fill="rgba(255,255,255,.6)" textAnchor="middle">{fcDay(d,lang).slice(0,3)}</text></g>)})}
            <g>{miVeil(92,40,mood.wing,mood.lens)}</g>
          </svg>
          <div style={{padding:"12px 16px 16px",textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#fff",lineHeight:1.3}}>{promiseEl}</div>
            <div style={{fontSize:11.5,color:"rgba(255,255,255,.55)",marginTop:5,fontFamily:"ui-monospace,monospace"}}>{proof}</div>
            <button onClick={()=>{try{track("sg_beat_cta",{conf:Math.round(firstConf)})}catch(_){};onPremiumClick("forecast_beat")}} className="gbtn" style={{display:"block",width:"100%",marginTop:13,padding:"13px",borderRadius:13,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15}}>
              {_t(lang,"Voir la prévision de ma côte","See my coast's forecast","Ver el pronóstico de mi costa")}
            </button>
            <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginTop:9}}>{lockSub}</div>
          </div>
        </div>
      )})()}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORECAST LANDING — /previsions/ golden-hour (A/B `prev_az`, bras az)
   Barre HomeAZ : Veilleur serein + freshness réelle + ForecastChart existant.
   ═══════════════════════════════════════════════════════════════════════════ */
function computeBestForecastDay(forecast,weeklyData){
  if(!forecast?.length)return null
  const reliableHorizon=weeklyData?.reliableHorizon||3
  const visibleDays=Math.min(forecast.length,Math.max(4,reliableHorizon+1))
  const slice=forecast.slice(0,visibleDays)
  const cleanDays=slice.filter(d=>d.status==="clean")
  if(!cleanDays.length)return null
  return cleanDays.reduce((best,d)=>!best||(Number.isFinite(d.afai)&&d.afai<(best.afai??Infinity))?d:best,null)
}
function ForecastLanding({beach,lang,island,sargData,isPremium,onPremium,onOpenBeach,onShowMap,trackFn,exiting}){
  const weather=useWeather(beach)
  const sargId=IS_NEW_REGION?beach?.id:BEACH_TO_SARG[beach?.id]
  const enriched=sargData?._enrichedWeekly||sargData?.weekly
  const activeWeekly=sargId&&enriched?enriched[sargId]:null
  const forecast=activeWeekly?.forecast||null
  const mood=moodFromStatus(beach?.status||"clean")
  const freshLbl=(()=>{
    const fr=formatFreshness(sargData?.updatedAt,lang)
    if(fr)return fr
    return _t(lang,"vérification en cours","verification in progress","verificación en curso")
  })()
  const isLive=sargData?.source==="erddap-live"&&!!formatFreshness(sargData?.updatedAt,lang)
  const bestDay=computeBestForecastDay(forecast,activeWeekly)
  useEffect(()=>{
    try{
      if(sessionStorage.getItem("sg_prev_landing_seen"))return
      sessionStorage.setItem("sg_prev_landing_seen","1")
      trackFn("sg_previsions_landing_view",{beach:beach?.id,status:beach?.status})
    }catch(_){}
  },[beach?.id,beach?.status,trackFn])
  const vm=verdictMeta(beach?.status,lang)
  return(
    <div style={{position:"fixed",inset:0,zIndex:1050,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",
      background:"var(--sg-bg,#FDFCF7)",opacity:exiting?0:1,transform:exiting?"scale(.98)":"scale(1)",
      transition:"opacity .3s ease,transform .3s ease",pointerEvents:exiting?"none":"auto"}}>
      {/* Hero golden-hour */}
      <div style={{position:"relative",minHeight:220,background:"linear-gradient(180deg,#0B2230 0%,#155A5A 50%,#C97E3A 84%,#F2B05E 100%)",padding:"max(16px,env(safe-area-inset-top)) 20px 28px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Veilleur mood={mood} size={36}/>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:".08em",color:"rgba(255,255,255,.55)",textTransform:"uppercase"}}>
                {_t(lang,"Le Veilleur","The Watcher","El Vigía")}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                {isLive&&<span style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",flexShrink:0}}/>}
                <span style={{fontSize:11,fontWeight:700,color:isLive?"#3fd07f":"rgba(255,255,255,.6)"}}>
                  {isLive?_t(lang,"EN DIRECT","LIVE","EN DIRECTO"):freshLbl}
                </span>
                {isLive&&freshLbl&&<span style={{fontSize:10,color:"rgba(255,255,255,.45)"}}>· {freshLbl}</span>}
              </div>
            </div>
          </div>
          <button onClick={onShowMap} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{
            width:40,height:40,borderRadius:"50%",background:"rgba(4,9,11,.45)",border:"1px solid rgba(255,255,255,.22)",
            color:"#fff",fontSize:16,cursor:"pointer",backdropFilter:"blur(8px)"}}>✕</button>
        </div>
        <h1 style={{fontFamily:"'Anton',sans-serif",fontSize:38,lineHeight:.95,textTransform:"uppercase",
          color:"#fff",letterSpacing:"-.02em",margin:0}}>
          {_t(lang,"Prévisions 7 jours","7-day forecast","Pronóstico 7 días")}
        </h1>
        <p style={{fontSize:14,color:"rgba(255,255,255,.72)",margin:"10px 0 0",lineHeight:1.45,maxWidth:420}}>
          {_t(lang,"Cette semaine, plage par plage. Mesuré au satellite, pas deviné — et quand on se trompe, on l'écrit.","This week, beach by beach. Measured by satellite, not guessed — and when we're wrong, we say so.","Esta semana, playa por playa. Medido por satélite, no adivinado — y cuando nos equivocamos, lo escribimos.")}
        </p>
      </div>
      {/* Corps — chart + meilleur jour */}
      <div style={{padding:"20px 16px calc(100px + env(safe-area-inset-bottom))",maxWidth:520,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:14}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:".06em",color:"var(--sg-mid,#5A5A5A)",textTransform:"uppercase"}}>
              {_t(lang,"Plage modèle","Sample beach","Playa modelo")}
            </div>
            <button onClick={()=>onOpenBeach(beach)} style={{background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"var(--sg-ink,#0D0D0D)",marginTop:2}}>{beach?.name}</div>
              <div style={{fontSize:13,fontWeight:600,color:vm.color,marginTop:2}}>{vm.emoji} {vm.verb}{typeof beach?.score==="number"?` · ${beach.score}/100`:""}</div>
            </button>
          </div>
        </div>
        {forecast?.length
          ?<ForecastChart forecast={forecast} lang={lang}
              onPremiumClick={src=>onPremium(src||"previsions_landing")}
              isPremium={isPremium} weatherDaily={weather?.daily||null} weeklyData={activeWeekly}/>
          :<div style={{padding:16,borderRadius:14,background:"var(--sg-bgD,#F7F5EF)",fontSize:13,color:"var(--sg-mid,#5A5A5A)"}}>
              {_t(lang,"Vérification en cours, reviens demain.","Verification in progress, check back tomorrow.","Verificación en curso, vuelve mañana.")}
            </div>}
        <div style={{marginTop:16,padding:"14px 16px",borderRadius:14,background:"var(--sg-card,#fff)",
          border:"1px solid var(--sg-border,rgba(0,0,0,.06))",boxShadow:"0 2px 12px rgba(0,0,0,.04)"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:".05em",color:"var(--sg-mid,#5A5A5A)",textTransform:"uppercase",marginBottom:6}}>
            {_t(lang,"Ton meilleur jour cette semaine","Your best day this week","Tu mejor día esta semana")}
          </div>
          {bestDay
            ?<div style={{fontSize:15,fontWeight:700,color:ST.clean.c}}>
                {fcDay(bestDay,lang)}{bestDay.confidence!=null?` · ${Math.round(bestDay.confidence)}%`:``}
                <span style={{display:"block",fontSize:12,fontWeight:500,color:"var(--sg-mid,#5A5A5A)",marginTop:4}}>
                  {_t(lang,"Le meilleur créneau de l'horizon fiable. Le Veilleur regarde la mer pour toi — au-delà, on estompe plutôt que d'inventer.","The best window within the reliable horizon. The Watcher looks at the sea for you — beyond it, we fade the days rather than fake them.","La mejor ventana del horizonte fiable. El Vigía mira el mar por ti — más allá, lo difuminamos en vez de inventarlo.")}
                </span>
              </div>
            :<div style={{fontSize:13,color:"var(--sg-mid,#5A5A5A)",lineHeight:1.45}}>
                {_t(lang,"Vérification en cours, reviens demain.","Verification in progress, check back tomorrow.","Verificación en curso, vuelve mañana.")}
              </div>}
        </div>
        <button onClick={onShowMap} style={{display:"block",width:"100%",marginTop:18,padding:"14px 18px",borderRadius:14,
          border:"1.5px solid var(--sg-border,rgba(0,0,0,.08))",background:"var(--sg-card,#fff)",cursor:"pointer",
          fontFamily:"inherit",fontSize:14,fontWeight:700,color:"var(--sg-ink,#0D0D0D)"}}>
          {_t(lang,"Ouvrir la carte en direct →","Open the live map →","Abrir el mapa en directo →")}
        </button>
        <div style={{textAlign:"center",marginTop:10,fontSize:11,color:"var(--sg-mid,#999)"}}>
          {_t(lang,"Ta côte est complexe pour de vrai : on la connaît baie par baie. Choisis une autre plage sur la carte.","Your coast is genuinely complex — we know it bay by bay. Pick another beach on the map.","Tu costa es realmente compleja: la conocemos bahía por bahía. Elige otra playa en el mapa.")}
        </div>
      </div>
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
    {open&&<div style={{fontSize:10,color:"var(--sg-mid,#5A5A5A)",marginTop:4,padding:"6px 10px",
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
  const[queued,setQueued]=useState(false)  // #27 : signalement mis en file hors-ligne
  // Photo visiteur (preuve du présent). Optionnelle, indépendante du vote de niveau.
  const fileRef=useRef(null)
  const[photo,setPhoto]=useState(null)   // data URL JPEG redimensionnée
  const[photoState,setPhotoState]=useState("idle") // idle|busy|sent|error
  const onPickPhoto=async(e)=>{
    const f=e.target.files&&e.target.files[0]; if(f)try{e.target.value=""}catch(_){}
    if(!f)return
    setPhotoState("busy")
    try{
      const {fileToResizedJpeg}=await import("./imageResize.js")
      const dataUrl=await fileToResizedJpeg(f,{maxDim:1280,quality:0.8})
      setPhoto(dataUrl);setPhotoState("idle")
    }catch(_){setPhoto(null);setPhotoState("error")}
  }
  const sendPhoto=()=>{
    if(!photo||photoState==="sent"||photoState==="busy")return
    try{track("sg_beach_photo",{beach_id:beach.id,level:voted||null,island:beach.island})}catch(_){}
    setPhotoState("busy")
    // Upload Supabase (Storage + ligne `photos` status 'pending', cf. supabasePhotos.js).
    uploadBeachPhoto(beach,voted||null,photo)
      .then(ok=>setPhotoState(ok?"sent":"error"))
      .catch(()=>setPhotoState("error"))
  }
  // ── Événements terrain (échouement / ramassage) — signal AFFICHÉ modéré, ne
  //    touche PAS la couleur du verdict (100 % data ERDDAP ; panel 2026-07-01).
  const evtKey="sg_bevent_"+beach.id
  const[evtDone,setEvtDone]=useState(()=>{
    const last=g("sg_bevent_t_"+beach.id,0)
    return(last&&Date.now()-last<12*3600*1000)?g(evtKey,null):null
  })
  const[approvedEvents,setApprovedEvents]=useState(null)
  const[evtBusy,setEvtBusy]=useState(false)
  const[evtErr,setEvtErr]=useState(false)
  useEffect(()=>{
    if(!RAMASSAGE_ENABLED||!beach||!beach.id)return
    let alive=true
    fetchApprovedReports(beach.id).then(list=>{if(alive)setApprovedEvents(list||[])}).catch(()=>{})
    return()=>{alive=false}
  },[beach&&beach.id])
  // Honnête : on ne confirme QUE si l'insert a réellement réussi. Si le backend
  // n'est pas prêt (table absente) ou hors-ligne → pas de faux « Merci », le
  // bouton reste actif. (0 fabrication, loi du moat.)
  const sendEvent=(event)=>{
    if(evtDone||evtBusy)return
    setEvtBusy(true);setEvtErr(false)
    try{track("sg_beach_event",{beach_id:beach.id,event,satellite_status:beach.status,island:beach.island})}catch(_){}
    submitBeachReport({beach,event}).then(ok=>{
      setEvtBusy(false)
      if(ok){setEvtDone(event);s(evtKey,event);s("sg_bevent_t_"+beach.id,Date.now())}
      else setEvtErr(true)
    }).catch(()=>{setEvtBusy(false);setEvtErr(true)})
  }
  const _recentEvents=(approvedEvents||[]).filter(e=>{try{return Date.now()-new Date(e.ts).getTime()<48*3600*1000}catch(_){return false}})
  const cleanupCount=_recentEvents.filter(e=>e.event==="cleanup").length
  const beachingCount=_recentEvents.filter(e=>e.event==="beaching").length
  const counts=communityReports[beach.id]||communityReports[BEACH_TO_SARG[beach.id]]||{clean:0,moderate:0,avoid:0,total:0}
  const total=counts.total||0
  const LEVELS=[
    {id:"clean",l:"Propre",le:"Clean",les:"Limpia",c:C.green,bg:C.greenBg},
    {id:"moderate",l:"Modéré",le:"Moderate",les:"Moderado",c:C.stMod,bg:C.amberBg},
    {id:"avoid",l:"Beaucoup",le:"Heavy",les:"Mucho",c:C.red,bg:C.redBg},
  ]
  const submit=(level)=>{
    if(voted)return
    setVoted(level);s(key,level);s(cooldownKey,Date.now())
    track("sg_beach_report",{beach_id:beach.id,level,satellite_status:beach.status,island:beach.island})
    const body=JSON.stringify({type:"beach_report",beach_id:BEACH_TO_SARG[beach.id]||beach.id,beach_name:beach.name,level,island:beach.island,date:new Date().toISOString()})
    // #27 : hors-ligne → file localStorage rejouée au retour du réseau (zéro perte)
    if(typeof navigator!=="undefined"&&navigator.onLine===false){_sgReportStash(body);setQueued(true);return}
    try{fetch(SG_REPORT_URL,{
      method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},body
    }).catch(()=>{_sgReportStash(body);setQueued(true)})}catch{_sgReportStash(body);setQueued(true)}
  }
  // Community consensus (mode of reports)
  const consensus=total>=3?(counts.avoid>=counts.moderate&&counts.avoid>=counts.clean?"avoid":counts.moderate>=counts.clean?"moderate":"clean"):null
  return(
    <div style={{margin:"12px 0",padding:"12px 14px",borderRadius:14,
      background:"var(--sg-bgD,#F7F5EF)",border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
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
            display:"flex",alignItems:"center",justifyContent:"center",gap:5,
          }}><ComicStatusGlyph status={lv.id} size={13} color={voted===lv.id?lv.c:"var(--sg-ink)"}/>{lang==="es"?lv.les:lang==="en"?lv.le:lv.l}</button>
        ))}
      </div>
      {queued&&(
        <div style={{marginTop:8,fontSize:11,fontWeight:600,color:"var(--sg-mid,#7a7768)",display:"flex",alignItems:"center",gap:6}}>
          <span aria-hidden="true">📡</span>{_t(lang,"Hors-ligne — ton signalement partira au retour du réseau.","Offline — your report will send when you're back online.","Sin conexión — tu reporte se enviará al volver la red.")}
        </div>
      )}
      {RAMASSAGE_ENABLED&&(
        <div style={{marginTop:10}}>
          <div style={{fontSize:11,fontWeight:600,color:"var(--sg-mid,#7a7768)",marginBottom:6}}>
            {_t(lang,"Un changement depuis hier ?","A change since yesterday?","¿Un cambio desde ayer?")}
          </div>
          <div style={{display:"flex",gap:8}}>
            {[{id:"beaching",e:"🌊",l:"Algues arrivées",le:"Sargassum arrived",les:"Llegó sargazo",c:C.stMod,bg:C.amberBg},
              {id:"cleanup",e:"🧹",l:"Ramassé",le:"Cleaned up",les:"Recogido",c:C.green,bg:C.greenBg}].map(ev=>(
              <button key={ev.id} type="button" onClick={()=>sendEvent(ev.id)} disabled={!!evtDone||evtBusy} style={{
                flex:1,padding:"10px 8px",borderRadius:12,border:"none",cursor:(evtDone||evtBusy)?"default":"pointer",
                background:evtDone===ev.id?ev.bg:"var(--sg-card,#fff)",
                color:evtDone===ev.id?ev.c:"var(--sg-ink)",fontSize:12,fontWeight:600,fontFamily:"inherit",transition:"all .2s",
                boxShadow:evtDone===ev.id?"inset 0 0 0 1.5px "+ev.c:"0 1px 4px rgba(0,0,0,.04)",
                opacity:((evtDone&&evtDone!==ev.id)||evtBusy)?.4:1,
                display:"flex",alignItems:"center",justifyContent:"center",gap:5,
              }}><span aria-hidden="true">{ev.e}</span>{lang==="es"?ev.les:lang==="en"?ev.le:ev.l}</button>
            ))}
          </div>
          {evtDone&&<div style={{marginTop:6,fontSize:11,color:C.green,textAlign:"center",fontWeight:500}}>
            {_t(lang,"Merci ! Ton signalement sera vérifié.","Thanks! Your report will be reviewed.","¡Gracias! Tu reporte será revisado.")}
          </div>}
          {evtErr&&!evtDone&&<div style={{marginTop:6,fontSize:11,color:"var(--sg-mid,#7a7768)",textAlign:"center",fontWeight:500}}>
            {_t(lang,"Signalement indisponible pour l'instant — réessaie plus tard.","Reporting unavailable right now — try again later.","Reporte no disponible ahora — reinténtalo más tarde.")}
          </div>}
        </div>
      )}
      {RAMASSAGE_ENABLED&&(cleanupCount>0||beachingCount>0)&&(
        <div style={{marginTop:10,padding:"9px 12px",borderRadius:12,
          background:cleanupCount>=beachingCount?C.greenBg:C.amberBg,border:"1px solid var(--sg-border,rgba(0,0,0,.04))"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",display:"flex",alignItems:"center",gap:6}}>
            {cleanupCount>=beachingCount
              ?<><span aria-hidden="true">🧹</span>{_t(lang,`Ramassage signalé par ${cleanupCount} visiteur${cleanupCount>1?"s":""}`,`Cleanup reported by ${cleanupCount} visitor${cleanupCount>1?"s":""}`,`Recogida reportada por ${cleanupCount} visitante${cleanupCount>1?"s":""}`)}</>
              :<><span aria-hidden="true">🌊</span>{_t(lang,`Échouement signalé par ${beachingCount} visiteur${beachingCount>1?"s":""}`,`Sargassum arrival reported by ${beachingCount} visitor${beachingCount>1?"s":""}`,`Llegada reportada por ${beachingCount} visitante${beachingCount>1?"s":""}`)}</>}
          </div>
          <div style={{marginTop:3,fontSize:10,color:"var(--sg-mid)"}}>
            {_t(lang,"Signalé au sol · 48 h · le verdict reste mesuré au satellite","Reported on-site · 48h · the verdict stays satellite-measured","Reportado in situ · 48h · el veredicto sigue medido por satélite")}
          </div>
        </div>
      )}
      {PHOTO_UPLOAD_ENABLED&&(
        <div style={{marginTop:10}}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPickPhoto} style={{display:"none"}}/>
          {!photo&&photoState!=="sent"&&(
            <button type="button" onClick={()=>{_sgCapturingPhoto=true;fileRef.current&&fileRef.current.click()}} disabled={photoState==="busy"} style={{
              width:"100%",padding:"10px 8px",borderRadius:12,border:"1px dashed var(--sg-border,rgba(0,0,0,.18))",
              background:"var(--sg-card,#fff)",color:"var(--sg-ink)",fontSize:12,fontWeight:600,fontFamily:"inherit",
              cursor:photoState==="busy"?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              📷 {photoState==="busy"?_t(lang,"Préparation…","Preparing…","Preparando…"):_t(lang,"Ajoute une photo","Add a photo","Añade una foto")}
            </button>
          )}
          {photo&&photoState!=="sent"&&(
            <div>
              <div style={{position:"relative",width:"100%",borderRadius:12,overflow:"hidden",background:"#000",marginBottom:8}}>
                <img src={photo} alt="" style={{width:"100%",maxHeight:200,objectFit:"cover",display:"block"}}/>
                <button type="button" onClick={()=>setPhoto(null)} aria-label="x" style={{position:"absolute",top:6,right:6,width:26,height:26,borderRadius:"50%",border:"none",background:"rgba(0,0,0,.55)",color:"#fff",fontSize:14,cursor:"pointer"}}>✕</button>
              </div>
              <button type="button" onClick={sendPhoto} style={{
                width:"100%",padding:"10px 8px",borderRadius:12,border:"none",background:C.green,color:"#fff",
                fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>
                {_t(lang,"Envoyer la photo","Send photo","Enviar foto")}
              </button>
              <div style={{marginTop:5,fontSize:10,color:"var(--sg-mid)",textAlign:"center"}}>
                {_t(lang,"Localisation retirée · publiée après modération","Location stripped · published after review","Ubicación eliminada · publicada tras revisión")}
              </div>
            </div>
          )}
          {photoState==="sent"&&(
            <div style={{fontSize:11,color:C.green,textAlign:"center",fontWeight:600}}>
              {_t(lang,"Merci ! Ta photo sera publiée après modération.","Thanks! Your photo will appear after review.","¡Gracias! Tu foto aparecerá tras revisión.")}
            </div>
          )}
          {photoState==="error"&&(
            <div style={{fontSize:11,color:C.red,textAlign:"center",fontWeight:600}}>
              {_t(lang,"Image illisible — réessaie.","Unreadable image — try again.","Imagen ilegible — reintenta.")}
            </div>
          )}
        </div>
      )}
      {total>0&&(
        <div style={{marginTop:8}}>
          <div style={{display:"flex",height:4,borderRadius:2,overflow:"hidden",background:"var(--sg-border,rgba(0,0,0,.06))"}}>
            {counts.clean>0&&<div style={{flex:counts.clean,background:C.green}}/>}
            {counts.moderate>0&&<div style={{flex:counts.moderate,background:C.stMod}}/>}
            {counts.avoid>0&&<div style={{flex:counts.avoid,background:C.red}}/>}
          </div>
          <div style={{marginTop:4,fontSize:11,color:"var(--sg-mid)",textAlign:"center"}}>
            {counts.rawTotal||Math.round(total)} {lang==="es"?"reporte"+((counts.rawTotal||total)>1?"s":""):lang==="en"?"report"+((counts.rawTotal||total)>1?"s":""):"signalement"+((counts.rawTotal||total)>1?"s":"")}
            {counts.trend&&counts.trend!=="stable"&&<span style={{marginLeft:4,color:counts.trend==="worsening"?C.red:C.green}}>
              {counts.trend==="worsening"?"↗":"↘"}</span>}
            {consensus&&<> · {_t(lang,"Consensus : ","Consensus: ","Consenso: ")}<span style={{fontWeight:700,color:ST[consensus].c,display:"inline-flex",alignItems:"center",gap:4,verticalAlign:"middle"}}><ComicStatusGlyph status={consensus} size={12} color={ST[consensus].c}/>{lang==="es"?ST[consensus].les:lang==="en"?ST[consensus].le:ST[consensus].l}</span></>}
          </div>
        </div>
      )}
      {voted&&<div style={{marginTop:6,fontSize:11,color:C.green,textAlign:"center",fontWeight:500}}>
        {_t(lang,"Merci pour ton signalement !","Thanks for your report!","¡Gracias por tu reporte!")}
      </div>}
      <BeachPhotos beach={beach} lang={lang}/>
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
          {/* Photos communauté retirées (vision 100% SVG / nos assets) — le TÉMOIGNAGE
              texte reste comme preuve "vérifié au sol". Lien source conservé si besoin. */}
          {p.photos&&p.photos.length>0&&(
            <a href={p.sourceUrl} target="_blank" rel="noopener nofollow" style={{display:"inline-block",marginBottom:p.commentSample?8:4,fontSize:11,fontWeight:700,color:"var(--sg-mid)"}}>
              📷 {p.photos.length} {_t(lang,"photo(s) au sol","on-site photo(s)","foto(s) in situ")} →
            </a>
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
/* ════════════════════════════════════════════════════════════════════════════
   PLAN-B « OÙ ALLER MAINTENANT » (feature SARGASSES #2, levier revenu) —
   porté du design validé design/proto-planb-clean-nearby.html. Surface : la
   fiche NEAR (BeachSheet) quand CETTE plage est chargée (avoid/moderate). Montre
   les plages PROPRES les plus proches (data RÉELLE : status clean + haversine +
   score 0-100), CTA « M'y emmener » → onBeachClick. Réduit l'angoisse « journée
   gâchée ». A/B `pw_planb`. Vignette SVG déterministe (zéro innerHTML, zéro IA).
   ════════════════════════════════════════════════════════════════════════════ */
function PlanBThumb({i}){
  const palms=i%3===0?2:i%2===0?1:0
  const pos=[{x:46,y:48},{x:120,y:46}]
  return(
    <svg viewBox="0 0 172 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
      style={{width:"100%",height:"100%",display:"block"}}>
      <rect width="172" height="90" fill="#FFE9B0"/>
      <circle cx="132" cy="22" r="13" fill="#FFF1C4"/>
      <rect y="34" width="172" height="34" fill="#1c7fb0"/>
      <rect y="33" width="172" height="2" fill="#fff" opacity=".5"/>
      <path d="M0,62 Q86,56 172,62 L172,90 L0,90 Z" fill="#F2D9A0"/>
      {Array.from({length:palms}).map((_,k)=>(
        <g key={k} transform={`translate(${pos[k].x},${pos[k].y})`}>
          <path d="M0,0 q-2,-14 -1,-26" stroke="#13514c" strokeWidth="3" fill="none"/>
          <path d="M-1,-26 q-12,-2 -20,4 M-1,-26 q12,-2 20,4 M-1,-26 q-6,-9 -14,-12 M-1,-26 q6,-9 14,-12"
            stroke="#1a6b5f" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
        </g>
      ))}
    </svg>
  )
}
// Soft-ask géoloc CONTEXTUEL (échelle « molo ») — puce discrète déclenchée AU TAP,
// jamais au load. Affichée seulement quand on n'a pas encore la position ET qu'elle a
// une valeur évidente ici (distance d'une fiche, tri par proximité). Le prompt natif
// du navigateur ne se déclenche qu'au clic (onAsk → requestGeo). i18n + region-agnostic.
function GeoSoftAsk({lang,onAsk,label,src,style}){
  if(typeof navigator!=="undefined"&&!navigator.geolocation)return null
  return(
    <button type="button" onClick={e=>{e.stopPropagation();try{onAsk&&onAsk(src||"softask")}catch(_){}}}
      style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:999,
        border:"1px solid var(--sg-border,rgba(13,13,13,.14))",background:"var(--sg-card,rgba(255,255,255,.55))",
        color:"var(--sg-mid,#5A5A5A)",fontSize:12,fontWeight:600,fontFamily:"inherit",cursor:"pointer",lineHeight:1.1,...(style||{})}}>
      📍 {label||_t(lang,"Voir la distance","Show distance","Ver distancia")}
    </button>
  )
}
function PlanBPanel({beach,allBeaches,userPos,lang,sargData,onBeachClick,onClose,onRequestGeo}){
  // plages PROPRES proches : on prend les 3 plus PROCHES (ou meilleur score sans
  // géoloc), puis on met la meilleure note en carte #1 (ruban « le + sûr »).
  const clean=useMemo(()=>{
    if(!beach||!allBeaches)return[]
    const geo=!!(userPos&&beach.lat)
    let list=allBeaches
      .filter(b=>b.id!==beach.id&&b.island===beach.island&&b.status==="clean"&&b.lat&&b.lng)
      .map(b=>({...b,_dist:geo?haversine(userPos.lat,userPos.lng,b.lat,b.lng):null}))
    list.sort((a,b)=> geo ? (a._dist-b._dist) : ((b.score||0)-(a.score||0)))
    list=list.slice(0,3)
    list.sort((a,b)=>(b.score||0)-(a.score||0)) // best-first dans le rail
    return list
  },[beach?.id,allBeaches,userPos])
  if(!clean.length)return null
  const fresh=(()=>{try{const ts=sargData?.updatedAt||sargData?.erddapTimestamp;if(!ts)return null;const h=(Date.now()-new Date(ts).getTime())/3.6e6;if(!(h>=0&&h<12))return null;return _t(lang,"EN DIRECT · il y a "+Math.max(1,Math.round(h))+" h","LIVE · "+Math.max(1,Math.round(h))+"h ago","EN VIVO · hace "+Math.max(1,Math.round(h))+" h")}catch(_){return null}})()
  const card={scrollSnapAlign:"start",flex:"0 0 158px",borderRadius:14,overflow:"hidden",cursor:"pointer",
    background:"var(--sg-card,#fff)",border:"1px solid var(--sg-border,rgba(13,13,13,.10))",
    padding:0,textAlign:"left",fontFamily:"inherit",position:"relative",
    boxShadow:"0 6px 18px -12px rgba(13,13,13,.4)"}
  return(
    <div style={{margin:"6px 0 16px",padding:"13px 13px 4px",borderRadius:18,
      background:"linear-gradient(180deg,rgba(232,82,42,.07),rgba(232,82,42,.02))",
      border:"1px solid rgba(232,82,42,.18)"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6,
        fontSize:11,fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"#E8522A"}}>
        <span style={{width:8,height:8,borderRadius:4,background:"#E8522A",animation:"pulse 2.6s ease-out infinite"}}/>
        {_t(lang,"Sargasses sur ta plage aujourd'hui","Sargassum on your beach today","Sargazo en tu playa hoy")}
      </div>
      <h3 className="anton" style={{margin:"0 0 2px",fontSize:"clamp(19px,5vw,23px)",lineHeight:1.05,color:"var(--sg-ink)"}}>
        {_t(lang,"Pas grave — ","It's ok — ","Tranquilo — ")}
        <span style={{color:"#E8A800"}}>{_t(lang,clean.length+" plages propres",clean.length+" clean beaches",clean.length+" playas limpias")}</span>
        {_t(lang," près de toi"," near you"," cerca de ti")}
      </h3>
      {fresh&&<div style={{fontSize:11.5,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",margin:"0 0 10px"}}>{fresh}</div>}
      {/* Soft-ask géoloc : sans position, le rail est trié par score → on propose de
          trier par proximité (prompt natif au tap seulement). */}
      {!userPos&&onRequestGeo&&<div style={{margin:"0 0 10px"}}>
        <GeoSoftAsk lang={lang} onAsk={onRequestGeo} src="planb"
          label={_t(lang,"Trier par distance","Sort by distance","Ordenar por distancia")}/>
      </div>}
      <div style={{display:"flex",gap:11,overflowX:"auto",scrollSnapType:"x mandatory",
        padding:"2px 0 10px",margin:"0 -2px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        {clean.map((b,i)=>(
          <button key={b.id} style={{...card}} aria-label={`${b.name} ${b.commune||""}, ${_t(lang,"propre","clean","limpia")}, score ${b.score}/100`}
            onClick={()=>{track("sg_planb_pick",{from:beach.id,to:b.id,rank:i,dist:b._dist!=null?Math.round(b._dist):null});onBeachClick(b)}}>
            <div style={{position:"relative",height:74,background:"#FFE9B0"}}>
              <PlanBThumb i={i}/>
              <span style={{position:"absolute",top:7,left:7,fontSize:9,fontWeight:800,letterSpacing:".06em",
                color:"#120821",background:"#22C55E",borderRadius:6,padding:"3px 6px"}}>{_t(lang,"PROPRE","CLEAN","LIMPIA")}</span>
              {i===0&&<span style={{position:"absolute",top:7,right:7,fontSize:9,fontWeight:800,letterSpacing:".04em",
                color:"#1A2B26",background:"#FFC72C",borderRadius:6,padding:"3px 6px"}}>{_t(lang,"le + sûr","best pick","mejor")}</span>}
            </div>
            <div style={{padding:"9px 11px 11px"}}>
              <div style={{fontSize:13.5,fontWeight:800,color:"var(--sg-ink)",lineHeight:1.15}}>{b.name}</div>
              {b.commune&&<div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:2}}>{b.commune}</div>}
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginTop:8}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--sg-mid,#5A5A5A)"}}>
                  {b._dist!=null?_t(lang,"vers "+Math.round(b._dist)+" km","~"+Math.round(b._dist)+" km away","a "+Math.round(b._dist)+" km")
                    :(typeof b.drive==="number"?_t(lang,"env. "+b.drive+" min","~"+b.drive+" min","~"+b.drive+" min"):"")}
                </span>
                {typeof b.score==="number"&&<span style={{fontWeight:800,color:"#22C55E",fontSize:13}}>{b.score}<span style={{fontSize:10,opacity:.7,fontWeight:700}}>/100</span></span>}
              </div>
              <div style={{marginTop:9,fontSize:12,fontWeight:800,color:"#156a96"}}>{_t(lang,"M'y emmener","Take me there","Llévame")} →</div>
            </div>
          </button>
        ))}
        <button style={{...card,flex:"0 0 120px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,
          background:"transparent",border:"1px dashed rgba(13,13,13,.2)",boxShadow:"none",color:"var(--sg-mid,#5A5A5A)"}}
          onClick={()=>{track("sg_planb_more",{from:beach.id});onClose&&onClose()}}>
          <span style={{fontSize:22}}>🗺️</span>
          <span style={{fontSize:11.5,fontWeight:700,textAlign:"center",padding:"0 8px"}}>{_t(lang,"Voir sur la carte","See on the map","Ver en el mapa")}</span>
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   BADGE INDICE SANTÉ / H2S (feature SARGASSES #4, le standout) — porté du design
   validé design/proto-h2s-health-index.html. La sargasse ACCUMULÉE qui POURRIT
   dégage du H2S (œuf pourri) → risque respiratoire (asthme, bébés, grossesse,
   seniors). Badge LIBRE toujours visible + panneau dépliable (pourquoi + conseils
   riverains/visiteurs/sensibles), CTA alerte santé = Premium.
   ⚠️ HONNÊTE : indice DÉRIVÉ (sargasse accumulée + décompo demi-vie 3,5j), JAMAIS
   une mesure de gaz (aucun capteur). Source niveau : beach.h2s (pipeline, même
   formule que scripts/lib/h2s.cjs) sinon repli sur le statut (avoid→élevé), jamais
   sous-estimé pour la santé. A/B `pw_h2s`.
   ════════════════════════════════════════════════════════════════════════════ */
const H2S_LV={low:{w:["faible","low","bajo"],c:"#22C55E",soft:"rgba(34,197,94,.16)",frac:.14},
  mod:{w:["modéré","moderate","moderado"],c:"#E8A800",soft:"rgba(232,168,0,.18)",frac:.5},
  high:{w:["élevé","high","alto"],c:"#E8522A",soft:"rgba(232,82,42,.20)",frac:.86}}
function H2SBadge({beach,lang,weather,onPremiumClick}){
  const [open,setOpen]=useState(false)
  const panelRef=useRef(null)
  // niveau : beach.h2s (pipeline) prioritaire ; sinon repli HONNÊTE sur le statut.
  const h2s=beach&&beach.h2s&&typeof beach.h2s==="object"?beach.h2s:null
  const rawLvl=h2s?h2s.level:null
  const level=rawLvl==="high"?"high":rawLvl==="moderate"||rawLvl==="mod"?"mod":rawLvl==="low"?"low"
    :(beach.status==="avoid"?"high":beach.status==="moderate"?"mod":"low")
  const score=h2s&&typeof h2s.score==="number"?h2s.score:null
  const mass=h2s&&h2s.signals&&typeof h2s.signals.mass==="number"?h2s.signals.mass:(typeof beach.afai==="number"?beach.afai:0)
  const consecDays=h2s&&h2s.signals&&typeof h2s.signals.consecDays==="number"?h2s.signals.consecDays:null
  const sheltered=(()=>{try{const c=beach.coast||classifyBeachCoast(beach.lat,beach.lng,beach.island);return c==="sheltered"}catch(_){return false}})()
  const windSpeed=(()=>{try{return weather&&(weather.wind!=null?weather.wind:weather.windSpeed!=null?weather.windSpeed:weather.current&&weather.current.wind)}catch(_){return null}})()
  const L=H2S_LV[level]
  const frac=Math.max(0.08,score!=null?score/100:L.frac)
  const ARC=2*Math.PI*22
  const word=L.w[lang==="en"?1:lang==="es"?2:0]
  const oneLine=level==="low"?_t(lang,"Plage propre — aucune odeur attendue aujourd'hui.","Clean beach — no odour expected today.","Playa limpia — sin olores previstos hoy.")
    :level==="mod"?_t(lang,"Algues qui se décomposent — odeur possible par moments.","Decomposing seaweed — occasional odour possible.","Algas en descomposición — posible olor por momentos.")
    :_t(lang,"Forte accumulation en décomposition — odeur d'œuf pourri probable.","Heavy decomposing build-up — rotten-egg smell likely.","Fuerte acumulación en descomposición — probable olor a huevo podrido.")
  const why=[]
  why.push({ic:"algae",
    main:mass>=0.40?_t(lang,"Forte accumulation d'algues","Heavy seaweed build-up","Fuerte acumulación de algas"):mass>=0.15?_t(lang,"Algues présentes sur la plage","Seaweed on the beach","Algas en la playa"):_t(lang,"Très peu d'algues","Very little seaweed","Muy pocas algas"),
    meta:mass>=0.15?_t(lang,"indice de présence "+mass.toFixed(2),"presence index "+mass.toFixed(2),"índice de presencia "+mass.toFixed(2)):_t(lang,"rien à décomposer","nothing to decompose","nada que descomponer")})
  if(consecDays!=null&&consecDays>=2) why.push({ic:"clock",main:_t(lang,"Présentes depuis "+consecDays+" jours","Present for "+consecDays+" days","Presentes desde hace "+consecDays+" días"),meta:_t(lang,"décomposition avancée = plus de gaz","advanced decomposition = more gas","descomposición avanzada = más gas")})
  else why.push({ic:"clock",main:_t(lang,"Échouage récent / frais","Recent / fresh landing","Llegada reciente / fresca"),meta:_t(lang,"peu de décomposition pour l'instant","little decomposition so far","poca descomposición por ahora")})
  why.push(sheltered?{ic:"wind",main:_t(lang,"Baie peu ventilée","Poorly ventilated bay","Bahía poco ventilada"),meta:_t(lang,"l'air se renouvelle mal, le gaz stagne","air renews poorly, gas lingers","el aire se renueva mal, el gas se estanca")}
    :{ic:"wind",main:_t(lang,"Côte ouverte, bien ventilée","Open, well-ventilated coast","Costa abierta, bien ventilada"),meta:_t(lang,"l'air disperse les odeurs","air disperses odours","el aire dispersa los olores")})
  const WHO={tous:_t(lang,"Tous","All","Todos"),sens:_t(lang,"Sensibles","Sensitive","Sensibles"),riv:_t(lang,"Riverains","Residents","Residentes"),vis:_t(lang,"Visiteurs","Visitors","Visitantes")}
  const tips=level==="low"?[
      {who:WHO.tous,t:_t(lang,"Rien à signaler côté air. Bonne journée plage.","Nothing to report air-wise. Enjoy the beach.","Nada que señalar en el aire. Disfruta la playa.")},
      {who:WHO.sens,t:_t(lang,"Asthme, bébés, femmes enceintes, seniors : conditions favorables aujourd'hui.","Asthma, babies, pregnancy, seniors: favourable conditions today.","Asma, bebés, embarazo, mayores: condiciones favorables hoy.")}]
    :level==="mod"?[
      {who:WHO.riv,t:_t(lang,"Aère tôt le matin, garde les fenêtres fermées l'après-midi si l'odeur monte.","Air out early, keep windows shut in the afternoon if odour rises.","Ventila temprano, cierra ventanas por la tarde si sube el olor.")},
      {who:WHO.vis,t:_t(lang,"Préfère une zone dégagée, à l'écart des amas bruns.","Pick an open spot, away from the brown piles.","Elige una zona despejada, lejos de los montones marrones.")},
      {who:WHO.sens,t:_t(lang,"Asthme, bébés, femmes enceintes, seniors : limite le temps près des algues.","Asthma, babies, pregnancy, seniors: limit time near the seaweed.","Asma, bebés, embarazo, mayores: limita el tiempo cerca de las algas.")}]
    :[
      {who:WHO.riv,t:_t(lang,"Ferme les fenêtres côté mer, fais tourner la ventilation, évite l'effort dehors près du rivage.","Close sea-facing windows, run ventilation, avoid exertion near the shore.","Cierra ventanas hacia el mar, ventila, evita el esfuerzo cerca de la orilla.")},
      {who:WHO.vis,t:_t(lang,"Reporte ou choisis une autre plage : l'odeur et l'irritation seront fortes près des amas.","Postpone or pick another beach: odour and irritation will be strong near the piles.","Pospón o elige otra playa: el olor y la irritación serán fuertes cerca de los montones.")},
      {who:WHO.sens,t:_t(lang,"Asthme, bébés, femmes enceintes, seniors : évite la plage aujourd'hui par prudence.","Asthma, babies, pregnancy, seniors: avoid the beach today as a precaution.","Asma, bebés, embarazo, mayores: evita la playa hoy por precaución.")}]
  const adviceLbl=level==="high"?_t(lang,"À faire aujourd'hui","What to do today","Qué hacer hoy"):_t(lang,"Conseil riverains & visiteurs","For residents & visitors","Para residentes y visitantes")
  const ctaK=level==="high"?_t(lang,"Préviens-moi avant le prochain pic d'odeur","Warn me before the next odour peak","Avísame antes del próximo pico de olor"):_t(lang,"Sois alerté quand l'air se dégrade","Get alerted when the air worsens","Recibe alerta cuando el aire empeore")
  useEffect(()=>{if(panelRef.current){try{if(window.matchMedia("(prefers-reduced-motion:reduce)").matches){panelRef.current.style.maxHeight=open?"none":"0";return}panelRef.current.style.maxHeight=open?panelRef.current.scrollHeight+"px":"0"}catch(_){}}},[open,level,lang])
  const iconPath=n=>n==="algae"?<path d="M7 13c0-4 1.5-6 .5-9M7 13c2.5 0 4-2 3.5-5M7 13c-2.4 0-4-2-3.5-4.5" fill="none" stroke="var(--sg-mid,#5A5A5A)" strokeWidth="1.4" strokeLinecap="round"/>
    :n==="clock"?<g fill="none" stroke="var(--sg-mid,#5A5A5A)" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="5.4"/><path d="M7 4v3.2l2 1.2"/></g>
    :<path d="M2 5.5h6.5a1.8 1.8 0 1 0-1.8-1.8M2 9h9a1.8 1.8 0 1 1-1.8 1.8" fill="none" stroke="var(--sg-mid,#5A5A5A)" strokeWidth="1.4" strokeLinecap="round"/>
  return(
    <div style={{margin:"4px 0 14px"}}>
      <button onClick={()=>{setOpen(o=>!o);track("sg_h2s_expand",{beach_id:beach.id,level,open:!open})}} aria-expanded={open}
        style={{display:"flex",alignItems:"center",gap:13,width:"100%",cursor:"pointer",textAlign:"left",fontFamily:"inherit",
          background:"var(--sg-card,#fff)",border:"1px solid "+L.soft,borderLeft:"4px solid "+L.c,borderRadius:16,padding:"13px 15px",
          boxShadow:"0 8px 22px -14px "+L.c+"66"}}>
        <span style={{flex:"0 0 auto"}}>
          <svg width="52" height="52" viewBox="0 0 56 56" aria-hidden="true">
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(13,13,13,.10)" strokeWidth="6"/>
            <circle cx="28" cy="28" r="22" fill="none" stroke={L.c} strokeWidth="6" strokeLinecap="round" transform="rotate(-90 28 28)" strokeDasharray={ARC} strokeDashoffset={ARC*(1-frac)}/>
            <g transform="translate(28 28)" stroke={L.c} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".95">
              <path d="M -5 4 q -3 -3 0 -6 q 3 -3 0 -6"/><path d="M 0 5 q -3 -3.5 0 -7 q 3 -3.5 0 -7"/><path d="M 5 4 q -3 -3 0 -6 q 3 -3 0 -6"/>
            </g>
          </svg>
        </span>
        <span style={{flex:"1 1 auto",minWidth:0}}>
          <span style={{display:"block",fontSize:10.5,fontWeight:800,letterSpacing:".14em",textTransform:"uppercase",color:"var(--sg-mid,#5A5A5A)"}}>{_t(lang,"Indice santé · air","Health · air quality","Salud · calidad del aire")}</span>
          <span className="anton" style={{display:"block",fontSize:21,lineHeight:1.02,marginTop:2,color:"var(--sg-ink)"}}>{_t(lang,"Risque H2S","H2S risk","Riesgo H2S")} <b style={{color:L.c}}>{word}</b></span>
          <span style={{display:"block",fontSize:12.5,color:"var(--sg-mid,#5A5A5A)",lineHeight:1.35,marginTop:4}}>{oneLine}</span>
        </span>
        <span aria-hidden="true" style={{flex:"0 0 auto",color:"var(--sg-mid,#999)",transform:open?"rotate(180deg)":"none",transition:"transform .35s cubic-bezier(.22,1,.36,1)"}}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </button>
      <div ref={panelRef} role="region" aria-label={_t(lang,"Détail indice santé H2S","H2S health index detail","Detalle índice de salud H2S")} style={{overflow:"hidden",maxHeight:0,transition:"max-height .5s cubic-bezier(.22,1,.36,1)"}}>
        <div style={{marginTop:9,background:"rgba(13,13,13,.03)",border:"1px solid var(--sg-border,rgba(13,13,13,.08))",borderRadius:16,padding:"16px 15px 14px"}}>
          <div style={{fontSize:10,fontWeight:800,letterSpacing:".14em",textTransform:"uppercase",color:"#B87A00",marginBottom:9}}>{_t(lang,"Pourquoi ce niveau","Why this level","Por qué este nivel")}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {why.map((w,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:"var(--sg-ink)"}}>
                <span style={{flex:"0 0 26px",height:26,borderRadius:8,display:"grid",placeItems:"center",background:"rgba(13,13,13,.04)",border:"1px solid var(--sg-border,rgba(13,13,13,.08))"}}>
                  <svg width="15" height="15" viewBox="0 0 14 14">{iconPath(w.ic)}</svg>
                </span>
                <span><b style={{fontWeight:700}}>{w.main}</b><span style={{display:"block",fontSize:11,color:"var(--sg-mid,#888)",marginTop:1}}>{w.meta}</span></span>
              </div>
            ))}
          </div>
          <div style={{marginTop:15,borderTop:"1px solid var(--sg-border,rgba(13,13,13,.08))",paddingTop:13}}>
            <div style={{fontSize:10,fontWeight:800,letterSpacing:".14em",textTransform:"uppercase",color:"#B87A00",marginBottom:8}}>{adviceLbl}</div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {tips.map((tp,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",fontSize:13,lineHeight:1.4,color:"var(--sg-ink)"}}>
                  <span style={{flex:"0 0 auto",marginTop:6,width:7,height:7,borderRadius:4,background:L.c}}/>
                  <span><span style={{display:"inline-block",fontSize:10,fontWeight:800,letterSpacing:".05em",textTransform:"uppercase",color:"#1A2B26",background:"#FFC72C",borderRadius:6,padding:"1px 6px",marginRight:6,verticalAlign:1}}>{tp.who}</span>{tp.t}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation();onPremiumClick&&onPremiumClick("h2s_health_alert")}}
            style={{display:"flex",alignItems:"center",gap:12,width:"100%",marginTop:15,cursor:"pointer",textAlign:"left",border:0,fontFamily:"inherit",color:"#1a1300",
              background:"linear-gradient(158deg,#FFE47A 0%,#FFC72C 42%,#E89400 100%)",boxShadow:"0 8px 24px rgba(232,148,0,.34),inset 0 1px 0 rgba(255,255,255,.55)",borderRadius:14,padding:"12px 15px"}}>
            <span style={{flex:"1 1 auto"}}>
              <span style={{display:"block",fontSize:14,fontWeight:800,lineHeight:1.15}}>{ctaK}</span>
              <span style={{display:"block",fontSize:11.5,fontWeight:600,opacity:.8,marginTop:1}}>{_t(lang,"Alerte santé Premium — la veille, sur TA plage","Premium health alert — the day before, on YOUR beach","Alerta de salud Premium — la víspera, en TU playa")}</span>
            </span>
            <span style={{flex:"0 0 auto",fontWeight:800,fontSize:18}}>→</span>
          </button>
          <p style={{marginTop:13,fontSize:11,lineHeight:1.45,color:"var(--sg-mid,#888)",borderLeft:"3px solid rgba(232,168,0,.4)",padding:"2px 0 2px 11px"}}>
            {_t(lang,
              "Indice de risque calculé à partir de la sargasse accumulée et de sa décomposition (demi-vie 3,5 j) — ce n'est pas une mesure de gaz. Aucun capteur H2S sur place ; suis toujours les consignes des autorités sanitaires (HCSP/ARS).",
              "Risk index derived from accumulated seaweed and its decomposition (3.5-day half-life) — this is not a gas measurement. No on-site H2S sensor; always follow public-health guidance.",
              "Índice de riesgo derivado del sargazo acumulado y su descomposición (vida media 3,5 d) — no es una medición de gas. Sin sensor de H2S en sitio; sigue siempre las indicaciones sanitarias.")}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEACH SHEET « COMIC POP » — fiche plage verdict-first (refonte 2026-06-21)
   ---------------------------------------------------------------------------
   Direction validée : univers coucher-de-soleil néon + style comic (contours
   noirs, aplats vifs, cartes crème, ombres dures, titres Anton, CTA or) —
   cohérent avec le hero « Le Veilleur ». Remplace le long scroll BeachDive.

   Hiérarchie pilotée par la recherche conversion (verdict-first, gate-the-future,
   prévisions floutées teaser, CTA collant unique, loss-aversion + sans-engagement
   + prix/jour + preuve sociale, X visible). Sources : NN/g, Surfline, AllTrails,
   RevenueCat, Stormy AI (4 500+ A/B).
   ═══════════════════════════════════════════════════════════════════════════ */
export const COMIC={
  // Palette alignée BIBLE v1 (22/06) : trio statut EXCLUSIF + encre/mid/teal/or de marque.
  // Pirates purgées → clean #27c46b→#22C55E · moderate orange→ambre #B87A00 (R3 : jamais l'or
  // sur un statut) · avoid #e8322a→corail #E8522A · sub #6b6478→mid #5A5A5A · blue→teal #009E8E.
  cream:"#fdf6e3", ink:"#0d0b14", sub:"#5A5A5A",
  clean:"#22C55E", moderate:"#B87A00", avoid:"#E8522A", loading:"#9a93a8",
  orange:"#B87A00", blue:"#009E8E", violet:"#5b3a8e",
  sunset:"radial-gradient(120% 75% at 82% 6%, rgba(255,138,77,.55), rgba(255,138,77,0) 50%), linear-gradient(168deg,#ff8a4d 0%,#8a4a8e 26%,#3e2470 58%,#1a1140 100%)",
  gold:"linear-gradient(180deg,#FFE47A,#FFC72C)",
}
function comicStatusColor(st){return st==="clean"?COMIC.clean:st==="moderate"?COMIC.moderate:st==="avoid"?COMIC.avoid:COMIC.loading}
// Statut = couleur + FORME-SVG + MOT (BIBLE trio). Forme en <path> (jamais l'Unicode ●/◐) :
// ✓ propre (vert) · ◐ modéré (ambre) · ✕ alerte (corail). 2px ink → lisibilité <15px.
function ComicStatusGlyph({status,size=12,color="#fff"}){
  const s=size,c=size/2
  if(status==="clean")return(<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M5 13l4 4L19 7"/></svg>)
  if(status==="avoid")return(<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" aria-hidden="true" style={{flexShrink:0}}><path d="M6 6l12 12M18 6 6 18"/></svg>)
  if(status==="moderate")return(<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" style={{flexShrink:0}}><circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.6"/><path d="M12 3a9 9 0 0 0 0 18z" fill={color}/></svg>)
  return(<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" aria-hidden="true" style={{flexShrink:0}}><circle cx="12" cy="12" r="9"/></svg>)
}
function comicVerdict(status,lang,daypart){
  // daypart : 'matin' | 'aprem' | 'soir'
  const when={fr:{matin:"ce matin",aprem:"cet après-midi",soir:"ce soir"},en:{matin:"this morning",aprem:"this afternoon",soir:"tonight"},es:{matin:"esta mañana",aprem:"esta tarde",soir:"esta noche"}}
  const w=(when[lang]||when.fr)[daypart]||(when[lang]||when.fr).matin
  if(status==="clean")return{big:_t(lang,"Baignade OK","Safe to swim","Baño OK"),when:w,hl:_t(lang,"OK","OK","OK")}
  if(status==="moderate")return{big:_t(lang,"À vérifier","Check first","A verificar"),when:w,hl:_t(lang,"PRUDENCE","CAREFUL","CUIDADO")}
  if(status==="avoid")return{big:_t(lang,"Évite l'eau","Skip the swim","Evita el agua"),when:w,hl:_t(lang,"ALERTE","ALERT","ALERTA")}
  return{big:_t(lang,"Le Veilleur scanne","Scanning","Escaneando"),when:w,hl:"…"}
}
function BeachSheetComic({beach,onClose,favorites,onToggleFav,lang,allBeaches,onBeachClick,onPremiumClick,isPremium,sargData,userPos,forecast:forecastProp,track:trackProp,communityReports={},onRequestGeo}){
  const trk=(n,p)=>{try{(trackProp||track)(n,p)}catch(_){}}
  const weather=useWeather(beach)
  const sheetRef=useRef(null), backdropRef=useRef(null), startY=useRef(0), dragY=useRef(0), closingRef=useRef(false)
  const [showProof,setShowProof]=useState(false)

  // ── Forecast réel (même résolution que BeachSheet : weekly réel → interpolé → généré)
  const forecast=useMemo(()=>{
    if(forecastProp&&forecastProp.length)return forecastProp
    if(!beach)return null
    const sargId=IS_NEW_REGION?beach.id:BEACH_TO_SARG[beach.id]
    let w=(sargId&&sargData?.weekly?.[sargId])||sargData?._enrichedWeekly?.[`_interp_${beach.id}`]||null
    let fc=w?.forecast||null
    if(!fc)fc=generateForecast(beach?.afai,lang)
    return fc
  },[beach?.id,sargData,forecastProp,lang])

  const status=beach?.status||"_loading"
  const sc=comicStatusColor(status)
  const hasScore=typeof beach?.score==="number"
  const daypart=(()=>{try{const h=new Date().getHours();return h<12?"matin":h<18?"aprem":"soir"}catch(_){return "matin"}})()
  const V=comicVerdict(status,lang,daypart)

  // ── Score count-up « tally » cartoon — anime 0 → score à l'ouverture de la fiche
  const [scoreAnim,setScoreAnim]=useState(0)
  useEffect(()=>{
    if(typeof beach?.score!=="number"){setScoreAnim(0);return}
    let reduce=false;try{reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){}
    const target=beach.score
    if(reduce){setScoreAnim(target);return}
    let raf,start=null
    const tick=t=>{if(start==null)start=t;const p=Math.min(1,(t-start)/620);const e=1-Math.pow(1-p,3);setScoreAnim(Math.round(target*e));if(p<1)raf=requestAnimationFrame(tick)}
    raf=requestAnimationFrame(tick)
    return()=>{try{cancelAnimationFrame(raf)}catch(_){}}
  },[beach?.id,beach?.score])

  // ── Fraîcheur satellite (confiance) — preuve « mesuré, pas deviné »
  const satAge=(()=>{try{const ts=sargData?.erddapTimestamp||sargData?.updatedAt;if(!ts)return null;const h=(Date.now()-new Date(ts).getTime())/3.6e6;return h>=0&&h<240?h:null}catch(_){return null}})()
  const satLabel=satAge==null?_t(lang,"Satellite récent","Recent satellite","Satélite reciente")
    :satAge<1?_t(lang,"Satellite il y a <1 h","Satellite <1h ago","Satélite hace <1 h")
    :_t(lang,`Satellite il y a ${Math.round(satAge)} h`,`Satellite ${Math.round(satAge)}h ago`,`Satélite hace ${Math.round(satAge)} h`)

  // ── Distance / lieu
  const distKm=(()=>{try{if(!userPos||!beach)return null;return haversine(userPos.lat,userPos.lng,beach.lat,beach.lng)}catch(_){return null}})()
  const locLine=[beach?.commune||null, distKm!=null?_t(lang,`à ${Math.round(distKm)} km`,`${Math.round(distKm)} km away`,`a ${Math.round(distKm)} km`):null].filter(Boolean).join(" · ")

  // ── Facteurs (data réelle, langage simple — pas un tableau d'expert)
  const chips=useMemo(()=>{
    const out=[]
    // Pastilles facteurs : palette resserrée 2 états (vert = OK / orange = à surveiller)
    // + bleu pour l'info neutre (température). Plus de rainbow vert/ambre/rouge sous le
    // bandeau verdict (retour fondateur « trop de couleurs sur la carte plage »).
    const sgLvl=status==="clean"?{t:_t(lang,"Sargasses faibles","Low sargassum","Sargazo bajo"),c:COMIC.clean}:status==="moderate"?{t:_t(lang,"Sargasses modérées","Moderate sargassum","Sargazo moderado"),c:COMIC.orange}:status==="avoid"?{t:_t(lang,"Sargasses fortes","Heavy sargassum","Sargazo fuerte"),c:COMIC.orange}:null
    if(sgLvl)out.push(sgLvl)
    if(weather){
      if(weather.waveHeight!=null){const w=weather.waveHeight;out.push({t:w<.6?_t(lang,"Houle calme","Calm swell","Mar calmo"):w<1.2?_t(lang,"Houle modérée","Moderate swell","Mar moderado"):_t(lang,"Houle forte","Strong swell","Mar fuerte"),c:w<.6?COMIC.clean:COMIC.orange})}
      if(weather.wind!=null){const v=weather.wind;out.push({t:v<20?_t(lang,"Vent léger","Light wind","Viento leve"):v<35?_t(lang,"Vent modéré","Moderate wind","Viento moderado"):_t(lang,"Vent fort","Strong wind","Viento fuerte"),c:v<20?COMIC.clean:COMIC.orange})}
      if(weather.temp!=null)out.push({t:_t(lang,`Eau ${weather.temp}°`,`Water ${weather.temp}°`,`Agua ${weather.temp}°`),c:COMIC.blue})
    }
    return out.slice(0,4)
  },[status,weather,lang])

  // ── Plan B : si avoid/moderate, plages PROPRES proches (réduit la frustration + maille SEO)
  const planB=useMemo(()=>{
    if(!beach||!allBeaches||status==="clean"||status==="_loading")return[]
    // Plafond de distance : « plutôt y aller » n'a de sens que si c'est ATTEIGNABLE.
    // Sur un grand marché (Floride : plages à 390 km), suggérer une plage à l'autre
    // bout de l'État est inutile → on cache au-delà de 60 km (les petites îles MQ/GP
    // restent toutes < 60 km, comportement inchangé).
    return allBeaches.filter(b=>b.id!==beach.id&&b.island===beach.island&&b.status==="clean")
      .map(b=>({...b,_d:haversine(beach.lat,beach.lng,b.lat,b.lng)}))
      .filter(b=>b._d<=60)
      .sort((a,b)=>a._d-b._d).slice(0,3)
  },[beach?.id,allBeaches,status])

  const requestClose=()=>{
    if(closingRef.current)return; closingRef.current=true
    try{sheetRef.current&&(sheetRef.current.style.transition="transform .26s cubic-bezier(.4,0,1,1)",sheetRef.current.style.transform="translateY(102%)")
      backdropRef.current&&(backdropRef.current.style.transition="opacity .26s ease",backdropRef.current.style.opacity="0")}catch(_){}
    setTimeout(()=>{closingRef.current=false;onClose&&onClose()},250)
  }
  useEffect(()=>{const h=e=>{if(e.key==="Escape")requestClose()};document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h)},[])
  // Drag-to-dismiss (seuil 10% hauteur écran — recherche Reanimated) + rubber-band
  // _swBlock : ne pas armer le swipe-close si un champ est focus (email/note) — fix
  // régression data-loss (audit UX) ; + garde scrollTop>5 (ne fight pas le scroll contenu).
  const _swBlock=()=>{const a=typeof document!=="undefined"&&document.activeElement;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))}
  const onTouchStart=e=>{startY.current=e.touches[0].clientY;dragY.current=0;if(sheetRef.current)sheetRef.current.style.transition=""}
  const onTouchMove=e=>{if(_swBlock())return;if(sheetRef.current&&sheetRef.current.scrollTop>5)return;const dy=e.touches[0].clientY-startY.current;if(dy<=0)return;dragY.current=dy;if(sheetRef.current)sheetRef.current.style.transform=`translateY(${dy}px)`}
  const onTouchEnd=()=>{if(_swBlock()){if(sheetRef.current)sheetRef.current.style.transform="";return}if(sheetRef.current&&sheetRef.current.scrollTop>5){sheetRef.current.style.transform="";return}const dy=dragY.current;const thr=Math.max(90,(window.innerHeight||700)*0.1)
    if(dy>thr)return requestClose()
    if(sheetRef.current){sheetRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";sheetRef.current.style.transform="";setTimeout(()=>{if(sheetRef.current)sheetRef.current.style.transition=""},300)}}

  if(!beach)return null
  const isFav=favorites&&favorites.includes(beach.id)
  const fcDays=(forecast||[]).slice(0,7)
  // Gating J+2→J+7 : la prévision publique ne porte que J+0/J+1. Le header annonce
  // « 7 jours » → pour le NON-premium on complète avec des barres CADENAS NEUTRES
  // (status _loading, déjà floutées car i>0) ; jamais de couleur/valeur fabriquée.
  if(!isPremium&&fcDays.length>0&&fcDays.length<7){
    const _DOW=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]
    const _realLen=fcDays.length
    const _last=fcDays[_realLen-1]
    const _ld=_last&&_last.date?_last.date:null
    for(let i=_realLen;i<7;i++){
      let day=null
      if(_ld){const dd=new Date(_ld+"T00:00:00Z");dd.setUTCDate(dd.getUTCDate()+(i-(_realLen-1)));day=_DOW[dd.getUTCDay()]}
      fcDays.push({day,status:"_loading",afai:null,_ph:true})
    }
  }

  // CTA — region-aware social proof (chiffres modestes & réels)
  const socialN=200
  const ctaLabel=isPremium?_t(lang,"Voir mes alertes","My alerts","Mis alertas"):_t(lang,"Activer mon alerte","Turn on my alert","Activar mi alerta")
  const onCTA=()=>{trk("sg_beach_cta",{beach_id:beach.id,status,premium:!!isPremium});isPremium?onClose&&onClose():onPremiumClick&&onPremiumClick("beach_sheet")}

  return(
    <>
      <style>{`
        @keyframes bscUp{from{transform:translateY(102%)}to{transform:translateY(0)}}
        @keyframes bscFade{from{opacity:0}to{opacity:1}}
        @keyframes bscPop{0%{transform:scale(.82);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes bscChip{0%{transform:scale(.55) translateY(8px);opacity:0}65%{transform:scale(1.08) translateY(0)}100%{transform:scale(1);opacity:1}}
        @keyframes bscBar{0%{transform:scaleY(.05);opacity:0}70%{transform:scaleY(1.12)}100%{transform:scaleY(1);opacity:1}}
        @keyframes bscRow{0%{transform:translateX(-14px);opacity:0}100%{transform:translateX(0);opacity:1}}
        .bsc-card{background:#fff;border:3px solid ${COMIC.ink};border-radius:16px;box-shadow:3px 3px 0 ${COMIC.ink}}
        .bsc-chip{font:800 12px/1 'Bricolage Grotesque',sans-serif;color:${COMIC.ink};background:#fff;border:2.5px solid ${COMIC.ink};border-radius:999px;padding:7px 11px;display:inline-flex;align-items:center;gap:6px;animation:bscChip .42s cubic-bezier(.16,1,.3,1) both}
        .bsc-bar{transform-origin:bottom;animation:bscBar .5s cubic-bezier(.16,1,.3,1) both}
        .bsc-row{animation:bscRow .4s cubic-bezier(.16,1,.3,1) both}
        /* Classe SANS « cta » dans le nom : esquive le skin forcé .theme-comic
           [class*="cta"] qui imposait Anton+letter-spacing sur ce bouton. BIBLE : un
           SEUL Anton/écran = le nom de plage ; le CTA reste Bricolage 800. */
        .bsc-gobtn{width:100%;text-align:center;font:800 17px/1 'Bricolage Grotesque',sans-serif;padding:16px;border-radius:16px;border:3px solid ${COMIC.ink};box-shadow:3px 3px 0 ${COMIC.ink};background:${COMIC.gold};color:${COMIC.ink};cursor:pointer;transition:transform .08s ease}
        .bsc-gobtn:active{transform:translate(3px,3px);box-shadow:0 0 0 ${COMIC.ink}}
        /* iOS WebKit peint un fond BLANC natif sur tout <button> sans reset → fini le « blanc chelou » */
        .bsc-sheet button{-webkit-appearance:none;appearance:none;font-family:inherit}
        @media (prefers-reduced-motion:reduce){.bsc-chip,.bsc-bar,.bsc-row{animation:none!important}}
      `}</style>
      {/* Backdrop — assombrit la carte (élévation z, recherche Mobbin/LogRocket) */}
      <div ref={backdropRef} onClick={requestClose}
        style={{position:"fixed",inset:0,zIndex:1049,background:"rgba(11,7,22,.46)",backdropFilter:"blur(1.5px)",WebkitBackdropFilter:"blur(1.5px)",animation:"bscFade .25s ease both"}}/>
      {/* Sheet */}
      <div ref={sheetRef} className="bsc-sheet" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{position:"fixed",left:0,right:0,bottom:0,zIndex:1050,maxHeight:"92svh",overflowY:"auto",overflowX:"hidden",
          background:COMIC.cream,backgroundImage:`radial-gradient(${COMIC.ink}0d 1.3px,transparent 1.5px)`,backgroundSize:"11px 11px",
          borderTop:`4px solid ${COMIC.ink}`,borderRadius:"26px 26px 0 0",boxShadow:"0 -12px 44px rgba(0,0,0,.42)",
          padding:"10px 16px calc(20px + env(safe-area-inset-bottom))",WebkitOverflowScrolling:"touch",
          animation:"bscUp .42s cubic-bezier(.16,1,.3,1) both",fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}>
        {/* Grip + X visible (NN/g : jamais handle seul) */}
        <div style={{width:44,height:5,borderRadius:5,background:COMIC.ink,opacity:.32,margin:"2px auto 8px"}}/>
        <button onClick={requestClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
          style={{position:"absolute",top:14,right:14,width:34,height:34,borderRadius:"50%",border:`2.5px solid ${COMIC.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${COMIC.ink}`,color:COMIC.ink,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>

        {/* En-tête : nom + badge statut */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,paddingRight:34}}>
          <div style={{minWidth:0}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:23,lineHeight:.96,color:COMIC.ink,textTransform:"uppercase",letterSpacing:"-.3px",wordBreak:"break-word"}}>{beach.name}</div>
            {locLine&&<div style={{font:"700 11.5px/1.2 'Bricolage Grotesque'",color:COMIC.sub,marginTop:4,display:"flex",alignItems:"center",gap:5}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>{locLine}{!userPos&&beach?.lat&&onRequestGeo&&<GeoSoftAsk lang={lang} onAsk={onRequestGeo} src="beach_dive" style={{padding:"2px 8px",fontSize:11,marginLeft:2}}/>}</div>}
          </div>
          <span style={{font:"800 11px/1 'Bricolage Grotesque'",padding:"7px 11px",borderRadius:999,border:`2.5px solid ${COMIC.ink}`,boxShadow:`2px 2px 0 ${COMIC.ink}`,background:sc,color:status==="avoid"?"#fff":COMIC.ink,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}><ComicStatusGlyph status={status} size={13} color={status==="avoid"?"#fff":COMIC.ink}/>{(ST[status]||ST._loading)[lang==="en"?"le":lang==="es"?"les":"l"]}</span>
        </div>

        {/* VERDICT — bandeau couleur haute lisibilité (traffic-light + mot, le pattern
            le plus scannable de la recherche). Fini le blanc-sur-crème illisible :
            mot sombre net sur aplat de couleur = la réponse se lit en 0,2 s. */}
        <div style={{display:"flex",alignItems:"center",gap:13,padding:"14px 16px",margin:"14px 0 12px",
          background:sc,border:`3px solid ${COMIC.ink}`,borderRadius:18,boxShadow:`4px 4px 0 ${COMIC.ink}`,
          animation:"bscPop .5s .1s cubic-bezier(.16,1,.3,1) both"}}>
          <div aria-hidden style={{flexShrink:0}}><Veilleur mood={hasScore?moodFromScore(beach.score):"scan"} size={52}/></div>
          <div style={{minWidth:0}}>
            {/* Verdict-line en Bricolage 800 (BIBLE : un SEUL Anton/écran = le nom de plage). */}
            <div style={{font:"800 26px/.95 'Bricolage Grotesque'",textTransform:"uppercase",letterSpacing:"-.3px",color:COMIC.ink}}>{V.big}</div>
            <div style={{font:"800 12.5px/1 'Bricolage Grotesque'",color:COMIC.ink,opacity:.8,marginTop:5,textTransform:"uppercase",letterSpacing:".6px"}}>{V.when} · {(beach._satBlind&&status==="clean"&&!beach._communityOverride)
              ? _t(lang,"estimé · pas de lecture directe ici","estimated · no direct read here","estimado · sin lectura directa aquí")
              : _t(lang,"mesuré au satellite","measured by satellite","medido por satélite")}</div>
          </div>
        </div>

        {/* Honnêteté couverture satellite — côte exposée non observée directement.
            Le satellite voit le large, pas l'échoué : on ne dit pas « propre » sans réserve. */}
        {beach._satBlind&&status==="clean"&&!beach._communityOverride&&(
          <div style={{display:"flex",gap:9,padding:"11px 13px",margin:"0 0 12px",background:COMIC.cream,border:`2.5px solid ${COMIC.ink}`,borderRadius:14,boxShadow:`3px 3px 0 ${COMIC.ink}`}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COMIC.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0,marginTop:1}}><path d="M5 13l-2-2a2.8 2.8 0 0 1 0-4l2-2a2.8 2.8 0 0 1 4 0l2 2a2.8 2.8 0 0 1 0 4l-2 2a2.8 2.8 0 0 1-4 0z"/><path d="M11 11l4 4M13 7l4 4a2.8 2.8 0 0 1 0 4M9 17a2.8 2.8 0 0 1-4 0"/></svg>
            <div style={{font:"700 11.5px/1.45 'Bricolage Grotesque'",color:COMIC.ink}}>{_t(lang,
              "Vu du ciel, rien au large ici. Mais le sargasse déjà échoué sur le sable ne se voit pas du satellite — si tu y es, signale-le pour les autres.",
              "From the sky, nothing offshore here. But sargassum already on the sand isn't visible by satellite — if you're there, report it for others.",
              "Desde el cielo, nada mar adentro aquí. Pero el sargazo ya varado no se ve por satélite — si estás ahí, repórtalo para los demás.")}</div>
          </div>
        )}

        {/* Score + facteurs (carte) */}
        <div className="bsc-card" style={{display:"flex",alignItems:"center",gap:14,padding:"13px 15px",marginBottom:12}}>
          {hasScore&&<div style={{flexShrink:0,textAlign:"center"}}>
            {/* Score-vedette en JetBrains Mono (BIBLE : Mono pour tous les chiffres). */}
            <div style={{fontFamily:"'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace",fontWeight:700,fontSize:38,lineHeight:.85,letterSpacing:"-1px",fontVariantNumeric:"tabular-nums",color:COMIC.ink}}>{scoreAnim}<span style={{fontSize:14,color:COMIC.sub}}>/100</span></div>
            <div style={{font:"800 8.5px/1 'Bricolage Grotesque'",color:COMIC.sub,letterSpacing:".5px",marginTop:2}}>{_t(lang,"INDICE","SCORE","ÍNDICE")}</div>
          </div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {chips.length?chips.map((c,i)=><span key={i} className="bsc-chip" style={{animationDelay:(.18+i*.07)+"s"}}><i style={{width:8,height:8,borderRadius:"50%",background:c.c,display:"inline-block"}}/>{c.t}</span>)
              :<span style={{font:"600 12px/1.4 'Bricolage Grotesque'",color:COMIC.sub}}>{_t(lang,"Conditions en cours de lecture…","Reading conditions…","Leyendo condiciones…")}</span>}
          </div>
        </div>

        {/* Preuve fraîcheur satellite */}
        <div style={{display:"flex",alignItems:"center",gap:7,font:"700 11.5px/1 'Bricolage Grotesque'",color:COMIC.sub,margin:"0 2px 14px"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:COMIC.clean,boxShadow:`0 0 0 3px ${COMIC.clean}33`}}/>{satLabel} · {_t(lang,"donnée vérifiée","verified data","dato verificado")}
        </div>

        {/* PRÉVISIONS 7 j — la « valeur future » : aujourd'hui visible, le reste FLOUTÉ/verrouillé (teaser gate) */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
            <div style={{font:"800 12px/1 'Bricolage Grotesque'",color:COMIC.ink,letterSpacing:".3px"}}>{_t(lang,"7 PROCHAINS JOURS","NEXT 7 DAYS","PRÓXIMOS 7 DÍAS")}</div>
            {!isPremium&&<span style={{font:"800 9.5px/1 'Bricolage Grotesque'",color:COMIC.ink,background:COMIC.gold,border:`2px solid ${COMIC.ink}`,borderRadius:999,padding:"4px 8px",display:"inline-flex",alignItems:"center",gap:4}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>{_t(lang,"PREMIUM","PREMIUM","PREMIUM")}</span>}
          </div>
          <div style={{display:"flex",gap:5,position:"relative"}}>
            {fcDays.map((d,i)=>{const gated=!isPremium&&i>0;return(
              <div key={i} style={{flex:1,textAlign:"center",filter:gated?"blur(3px)":"none",opacity:gated?.65:1}}>
                <div className="bsc-bar" style={{height:34,borderRadius:7,border:`2.5px solid ${COMIC.ink}`,background:comicStatusColor(d.status),animationDelay:(.32+i*.05)+"s"}}/>
                <span style={{display:"block",font:"800 9px/1 'Bricolage Grotesque'",color:COMIC.sub,marginTop:4}}>{i===0?_t(lang,"Auj","Now","Hoy"):(d.day||"").slice(0,3)}</span>
              </div>)})}
            {!isPremium&&fcDays.length>1&&<button onClick={onCTA} style={{position:"absolute",right:0,top:0,bottom:18,left:"15%",border:"none",background:"transparent",cursor:"pointer"}} aria-label={_t(lang,"Débloquer les prévisions","Unlock forecast","Desbloquear pronóstico")}/>}
          </div>
        </div>

        {/* Plan B — où aller maintenant (avoid/moderate) */}
        {planB.length>0&&<div className="bsc-card" style={{padding:"12px 14px",marginBottom:14,background:COMIC.cream}}>
          <div style={{font:"800 12px/1 'Bricolage Grotesque'",color:COMIC.ink,marginBottom:9,display:"flex",alignItems:"center",gap:6}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={COMIC.clean} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M12 22V12"/><path d="M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z"/><path d="M12 12c2-2 5-2 7 0M12 12c-2-2-5-2-7 0"/></svg>{_t(lang,"Plutôt y aller maintenant","Go here instead","Mejor ve aquí ahora")}</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {planB.map((b,i)=><button key={b.id} className="bsc-row" onClick={()=>{trk("sg_planb_pick",{from:beach.id,to:b.id,rank:i});onBeachClick&&onBeachClick(b)}}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 12px",borderRadius:12,border:`2.5px solid ${COMIC.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${COMIC.ink}`,cursor:"pointer",font:"800 13px/1 'Bricolage Grotesque'",color:COMIC.ink,textAlign:"left",animationDelay:(.1+i*.08)+"s"}}>
              <span style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}><i style={{width:9,height:9,borderRadius:"50%",background:COMIC.clean,flexShrink:0}}/><span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</span></span>
              <span style={{color:COMIC.sub,font:"700 11px/1 'Bricolage Grotesque'",whiteSpace:"nowrap"}}>{Math.round(b._d)} km →</span></button>)}
          </div>
        </div>}

        {/* Signaler — l'utilisateur sur place corrige le satellite (l'échoué n'est pas vu du ciel).
            Alimente _communityOverride (« terrain prime », seuil ≥3). */}
        <BeachReport beach={beach} lang={lang} communityReports={communityReports}/>

        {/* CTA collant — décision unique, or */}
        <div style={{position:"sticky",bottom:0,paddingTop:8,marginTop:4,background:`linear-gradient(to top, ${COMIC.cream} 72%, transparent)`}}>
          <button className="bsc-gobtn sg-paygold" onClick={onCTA} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8}}><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{flexShrink:0}}><path d="M12 2.6l2.6 6.1 6.6.6-5 4.3 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.3 6.6-.6z"/></svg>{ctaLabel} →</button>
          {!isPremium&&<>
            <div style={{font:"600 11.5px/1.4 'Bricolage Grotesque'",color:COMIC.sub,textAlign:"center",margin:"9px 8px 0"}}>{_t(lang,"Ne découvre plus les algues une fois sur place. Sois prévenu·e la veille.","Stop discovering the seaweed once you're there. Get warned the day before.","Deja de descubrir el sargazo al llegar. Te avisamos la víspera.")}</div>
            <div style={{font:"700 11px/1.3 'Bricolage Grotesque'",color:COMIC.sub,textAlign:"center",marginTop:6}}>≈ {pricePerDay()||"0,16 €"} / {_t(lang,"jour","day","día")} · {_t(lang,"Pass unique, sans abonnement · rien à résilier","One-time pass, no subscription · nothing to cancel","Pase único, sin suscripción · nada que cancelar")}</div>
            {!IS_NEW_REGION&&<div style={{font:"800 11px/1.3 'Bricolage Grotesque'",color:COMIC.ink,textAlign:"center",marginTop:6,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><svg width="12" height="12" viewBox="0 0 24 24" fill="#E8A800" aria-hidden="true" style={{flexShrink:0}}><path d="M12 2.6l2.6 6.1 6.6.6-5 4.3 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.3 6.6-.6z"/></svg>{_t(lang,`Rejoint par ${socialN}+ vacanciers`,`Joined by ${socialN}+ beachgoers`,`${socialN}+ veraneantes ya dentro`)}</div>}
          </>}
          <button onClick={()=>{setShowProof(v=>!v);trk("sg_beach_proof",{beach_id:beach.id,open:!showProof})}}
            style={{display:"block",margin:"12px auto 0",background:"none",border:"none",color:COMIC.ink,font:"800 12.5px/1 'Bricolage Grotesque'",textDecoration:"underline",cursor:"pointer"}}>{_t(lang,"Voir la preuve · comment on mesure","See the proof · how we measure","Ver la prueba · cómo medimos")}</button>
          {showProof&&<div style={{font:"600 12px/1.5 'Bricolage Grotesque'",color:COMIC.sub,textAlign:"center",margin:"10px 6px 0"}}>{_t(lang,
            "Chaque jour, on lit les images satellite Sentinel/MODIS (algues en mer) au large de chaque plage, puis on projette la dérive sur 7 jours. C'est de la mesure, pas une estimation à la louche.",
            "Every day we read Sentinel/MODIS satellite imagery (seaweed at sea) offshore of each beach, then project the drift over 7 days. It's measurement, not a rough guess.",
            "Cada día leemos imágenes satelitales Sentinel/MODIS (algas en el mar) frente a cada playa, y proyectamos la deriva a 7 días. Es medición, no una estimación.")}</div>}
        </div>
      </div>
    </>
  )
}

function BeachSheet({beach,onClose,favorites,onToggleFav,lang,allBeaches,imageMap,onBeachClick,onPremiumClick,isPremium,historyData,sargData,dataSource,userPos,communityReports,fbPosts,onRequestGeo}){
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
  // A/B « la fiche EST le ScrollStory » (pw_beach_story) : story = PanelStoryEngine
  // (verdict→demain→vas-y) sous le hero À LA PLACE du bloc score/verdict ; control =
  // liste actuelle intacte. ?beachstory=1/0 force en QA. CTA premium inchangé.
  const beachStory=(()=>{try{const s=window.location.search;if(/[?&]beachstory=1/.test(s))return true;if(/[?&]beachstory=0/.test(s))return false;return abVariant("pw_beach_story",["control","story"],[.5,.5])==="story"}catch(_){return false}})()
  // A/B « Verdict du Jour » (pw_verdict_guess) : Devine-puis-Révèle DANS la fiche —
  // l'user devine le statut de CETTE plage avant de voir la donnée (engagement +
  // série). Additif (control = fiche inchangée), une fois par plage par jour.
  // ?verdictguess=1/0 force en QA. Funnel premium en aval segmentable par bras.
  const verdictGuess=(()=>{try{const q=window.location.search;if(/[?&]verdictguess=1/.test(q))return true;if(/[?&]verdictguess=0/.test(q))return false;return abVariant("pw_verdict_guess",["control","guess"],[.5,.5])==="guess"}catch(_){return false}})()
  // A/B `pw_planb` : feature #2 « où aller maintenant » — quand CETTE plage est
  // chargée (avoid/moderate), rail des plages PROPRES proches (data réelle).
  // Additif (control = fiche inchangée), ?planb=1/0 force en QA. Réduit l'angoisse
  // « journée gâchée » au moment vécu ; chaque pick = sg_planb_pick (segmentable).
  const pwPlanb=(()=>{try{const q=window.location.search;if(/[?&]planb=1/.test(q))return true;if(/[?&]planb=0/.test(q))return false;return abVariant("pw_planb",["control","planb"],[.5,.5])==="planb"}catch(_){return false}})()
  // A/B `pw_h2s` : badge Indice santé/H2S GRADUÉ (feature #4, le standout) — libre,
  // toujours visible, panneau dépliable + alerte santé Premium. Remplace le warning
  // binaire (control = warning sur avoid uniquement). ?h2s=1/0 force en QA.
  const pwH2s=(()=>{try{const q=window.location.search;if(/[?&]h2s=1/.test(q))return true;if(/[?&]h2s=0/.test(q))return false;return abVariant("pw_h2s",["control","badge"],[.5,.5])==="badge"}catch(_){return false}})()
  // A/B `fc_position` : ForecastChart remonté sous le verdict (valeur payante visible tôt)
  // vs control (en bas après VisitPlan). ?fcup=1/0 force en QA.
  const fcUp=(()=>{try{const q=window.location.search;if(/[?&]fcup=1/.test(q))return true;if(/[?&]fcup=0/.test(q))return false;return abVariant("fc_position",["control","top"],[.5,.5])==="top"}catch(_){return false}})()

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

  // Hero 100% scène vectorielle golden-hour (BeachScene, auto-phase sur l'heure
  // locale). Les photos externes ont été retirées — elles juraient avec le design.
  const heroPh=(()=>{try{if(HERO_PH_OVERRIDE)return HERO_PH_OVERRIDE;const h=new Date().getHours();return h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"}catch(_){return "day"}})()

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
        // ARCHIPEL (carte SVG par défaut) : pastille [data-beach] sous le backdrop → switch direct
        // de plage (remplace la dépendance aux marqueurs Leaflet pour le cohort world).
        try{
          const g=document.elementsFromPoint(x,y).map(el=>el.closest&&el.closest("[data-beach]")).find(Boolean)
          if(g){const nb=allBeaches&&allBeaches.find(b=>b.id===g.getAttribute("data-beach"))
            if(nb&&nb.id!==beach.id){track("sg_sheet_pin_switch",{via:"archipel"});onClose();setTimeout(()=>onBeachClick&&onBeachClick(nb),50);return}}
        }catch(_){}
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

        {/* Hero — photo le jour, scène vectorielle golden-hour personnalisée par
            l'heure sinon (cf. useVectorHero). Immersif, tap pour scanner. */}
        <div onClick={e=>{if(!e.target.closest("button")){setPhotoScanOpen(v=>!v);track("sg_photo_scan",{beach_id:beach.id,open:!photoScanOpen,hero:"vector",ph:heroPh,status:beach.status})}}}
          style={{height:(()=>{try{const q=window.location.search;if(/[?&]heroh=1/.test(q))return "min(480px, 46svh)";if(/[?&]heroh=0/.test(q))return "min(600px, 70svh)";return abVariant("aw_hero_height",["control","short"],[.6,.4])==="short"?"min(480px, 46svh)":"min(600px, 70svh)"}catch(_){return "min(600px, 70svh)"}})(),background:"#0B2230",
          borderRadius:"0",position:"relative",overflow:"hidden",cursor:"pointer"}}>
          {/* SVG D'ABORD (directive 14/06 : « les images dépendent du jour,
              remplace par du svg perso par heure/lieu, pas ce qu'on voit en
              premier »). Scène vectorielle propre à la plage + personnalisée par
              l'heure ET l'ÉTAT (nickel / en collecte / pleine, animé). La vraie
              photo est reléguée « en cool » plus bas. */}
          <BeachScene beach={beach} reveal/>
          {/* Cinematic gradient overlay */}
          <div style={{position:"absolute",inset:0,
            background:"linear-gradient(180deg, rgba(0,0,0,.15) 0%, transparent 30%, transparent 50%, var(--sg-card,#fff) 100%)"}}/>
          {/* Le Veilleur veille sur CETTE plage — humeur = état RÉEL du jour : le
              « veilleur personnel » incarné dès le hero (pas juste une image). */}
          <div aria-hidden="true" style={{position:"absolute",top:"43%",left:0,right:0,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
            <Veilleur mood={moodFromScore(beach.score)} size={82}/>
          </div>
          {/* Status glow — colored ambient light based on beach status */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",
            background:`radial-gradient(ellipse at 50% 100%, ${(ST[beach.status]||ST._loading).c}22 0%, transparent 70%)`,
            pointerEvents:"none"}}/>
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
              animation:beach.status==="clean"?"none":"pulse 2s ease-in-out 2"}}/>
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

        <div style={{padding:"0 20px calc(70px + env(safe-area-inset-bottom,12px))"}}>
          {/* Name — large, no duplicate status badge (already on photo) */}
          <h2 className="anton" style={{fontSize:"clamp(24px,6vw,30px)",margin:"0 0 4px",lineHeight:1.15,
            color:"var(--sg-ink)"}}>{beach.name}</h2>
          <p style={{fontSize:13,color:"var(--sg-mid,#5A5A5A)",margin:"0 0 12px",
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
            {/* Pas encore de position → soft-ask contextuel : la distance a une valeur
                évidente ici (prompt natif au tap seulement, jamais au load). */}
            {!userPos&&beach.lat&&onRequestGeo&&<>
              <span style={{width:3,height:3,borderRadius:2,background:"var(--sg-mid,#999)",opacity:.5}}/>
              <GeoSoftAsk lang={lang} onAsk={onRequestGeo} src="beach_sheet"
                style={{padding:"2px 8px",fontSize:11.5}}/>
            </>}
          </p>

          {/* PLAN-B « où aller maintenant » — quand CETTE plage est chargée
              (avoid/moderate), rail des plages propres proches. A/B pw_planb. */}
          {pwPlanb&&(beach.status==="avoid"||beach.status==="moderate")&&(
            <PlanBPanel beach={beach} allBeaches={allBeaches} userPos={userPos} lang={lang}
              sargData={sargData} onBeachClick={onBeachClick} onClose={onClose} onRequestGeo={onRequestGeo}/>
          )}

          {/* v3.1 Beach Score 0-100 — editorial aurora card echoing the home hero.
              Masqué dans le bras story (absorbé par le beat ① VERDICT du ScrollStory). */}
          {!beachStory&&typeof beach.score==="number"&&(
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
                <div role="button" aria-label={`${beach.score}/100, ${scoreLabelFor(beach.scoreLabel,lang)}. ${_t(lang,"Comprendre ce score","Understand this score","Entender este puntaje")}`}
                  onClick={()=>{setScoreOpen(v=>!v);track("sg_score_learn",{beach_id:beach.id,open:!scoreOpen})}}
                  style={{position:"relative",width:84,height:84,flexShrink:0,cursor:"pointer"}}>
                  <ScoreBlob score={beach.score} color={beach.scoreColor} size={84}/>
                  {/* Le Veilleur perché, humeur = score RÉEL : le « veilleur personnel »
                      rendu tangible AVANT le paywall (data pilote le visuel). */}
                  <div style={{position:"absolute",top:-14,left:-13,pointerEvents:"none"}}>
                    <Veilleur mood={moodFromScore(beach.score)} size={36}/>
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
                  <div style={{fontSize:12,color:"var(--sg-mid,#5A5A5A)",marginTop:5,lineHeight:1.4}}>
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

          {/* Verdict line — glanceable "can I go today?" answer (design-scout 2026-04-12).
              Masquée dans le bras story (absorbée par le beat ① du ScrollStory). */}
          {!beachStory&&ST[beach.status]&&(() => {
            const verdictKey = beach.status==="clean"?"verdictGo":beach.status==="moderate"?"verdictModerate":beach.status==="avoid"?"verdictAvoid":"verdictUnknown"
            const verdictText = LL[verdictKey]||LL.verdictUnknown
            const verdictColor = ST[beach.status].c
            return (
              <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 14px",flexWrap:"wrap"}}>
                <span aria-hidden="true" style={{width:4,height:24,borderRadius:2,background:verdictColor,flexShrink:0}}/>
                <span className="anton" style={{fontSize:"clamp(18px,4.6vw,22px)",lineHeight:1.1,color:verdictColor,letterSpacing:"-.01em",textTransform:"uppercase"}}>
                  {verdictText}
                </span>
                <span aria-hidden="true" style={{fontSize:20,lineHeight:1,flexShrink:0}}>{verdictMeta(beach.status,lang).emoji}</span>
                {beach.status==="clean"&&__REL&&typeof __REL.cleanPct==="number"&&(
                  <span style={{fontSize:10.5,fontWeight:700,padding:"3px 9px",borderRadius:100,
                    background:"rgba(34,197,94,.12)",color:"#16A34A",border:"1px solid rgba(34,197,94,.25)",
                    whiteSpace:"nowrap",flexShrink:0}}>
                    ✓ {__REL.cleanPct}% {_t(lang,"fiables","reliable","fiables")}
                  </span>
                )}
              </div>
            )
          })()}
          {/* Freshness chip — satellite timestamp sous le verdict */}
          {!beachStory&&(()=>{try{const ts=sargData?.updatedAt||sargData?.erddapTimestamp;if(!ts)return null;const h=(Date.now()-new Date(ts).getTime())/3.6e6;if(!(h>=0&&h<72))return null;const label=h<1?_t(lang,"À l'instant","Just now","Ahora mismo"):h<12?_t(lang,"il y a "+Math.round(h)+" h",Math.round(h)+"h ago","hace "+Math.round(h)+" h"):_t(lang,"vérif. en cours","checking","verificando");return(<div style={{display:"flex",alignItems:"center",gap:5,margin:"-10px 0 14px",opacity:.72}}><span style={{fontSize:11}}>🛰️</span><span style={{fontSize:10.5,fontWeight:600,color:"var(--sg-mid,#5A5A5A)",letterSpacing:".02em"}}>{_t(lang,"Satellite","Satellite","Satélite")} · {label}</span></div>)}catch(_){return null}})()}
          {/* Verdict du Jour — Devine-puis-Révèle (A/B pw_verdict_guess). Rendu
              dans LES DEUX bras (additif) quand le vrai statut est connu. */}
          {verdictGuess&&ST[beach.status]&&<VerdictDuJourCard beach={beach} lang={lang}/>}
          {/* La fiche EST le ScrollStory (bras story) : verdict → demain → vas-y.
              Moteur panel-scroll (lit sheetRef.scrollTop). CTA premium INCHANGÉ. */}
          {beachStory&&forecast&&forecast.length>=2&&(
            <div style={{margin:"6px -20px 0"}}>
              <PanelStoryEngine beats={beachStoryBeats(beach,forecast,lang)} scrollRef={sheetRef} lang={lang}
                accent={verdictMeta(beach.status,lang).color} ev="sg_beach_beat"
                onCTA={()=>{track("sg_beach_story_cta",{beach_id:beach.id,status:beach.status});onPremiumClick&&onPremiumClick("beach_story")}}/>
              {/* PONT golden-hour : on FOND le monde immersif (gold du dernier beat)
                  dans le détail clair — zéro couture dark→light, un seul flux continu. */}
              <div aria-hidden style={{height:56,marginTop:-1,background:"linear-gradient(180deg,#11463E 0%,#C97E3A 42%,#FFE08A 74%,var(--sg-card,#fff) 100%)"}}/>
            </div>
          )}
          <AfaiChip beach={beach} lang={lang}/>
          {/* A/B fc_position="top" : ForecastChart remonte sous le verdict (avant les info-filler) */}
          {fcUp&&forecast&&(<>
            {weeklyData?.arrivalDetected&&<div style={{padding:"10px 12px",marginBottom:10,borderRadius:12,background:"linear-gradient(135deg,rgba(232,143,42,.12),rgba(232,82,42,.08))",border:"1px solid rgba(232,143,42,.35)",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:20}}>⚠</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#b35818"}}>{_t(lang,"Banc de sargasses en approche","Sargassum mat approaching","Banco de sargazo en camino")}</div><div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:2}}>{_t(lang,"Le satellite détecte un banc dérivant vers cette plage (1–3 jours).","Satellite shows a mat drifting toward this beach (1–3 days).","El satélite detecta un banco derivando hacia esta playa (1–3 días).")}</div></div></div>}
            <ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick} isPremium={isPremium} weatherDaily={weather?.daily||null} weeklyData={weeklyData}/>
          </>)}

          {/* rel_hot_cta : badge fiabilité → openPremium (trust signal après ForecastChart en A/B).
              Gating !isPremium && fcUp : n'empile PAS avec forecast_teaser dans le bras contrôle,
              et n'affiche pas aux abonnés un bouton d'achat. */}
          {!isPremium&&fcUp&&<button onClick={()=>{track("sg_reliability_open",{from:"beach_badge",hot:true});onPremiumClick("rel_hot_cta")}}
            style={{display:"flex",alignItems:"center",gap:9,margin:"10px 0 2px",padding:"9px 12px",borderRadius:12,
            background:"rgba(34,197,94,.10)",border:"1px solid rgba(34,197,94,.26)",textDecoration:"none",cursor:"pointer",
            width:"100%",fontFamily:"inherit",textAlign:"left"}}>
            <span aria-hidden="true" style={{fontSize:15,lineHeight:1}}>✅</span>
            <span style={{flex:1,fontSize:12.5,fontWeight:700,color:"var(--sg-ink,#13241F)",lineHeight:1.3}}>
              {(()=>{
                // Chiffre RÉEL injecté au build (__RELIABILITY__, même source que /fiabilite/).
                // On publie le clean-rate par régime (jamais le global %, cf. regimeReliability.note).
                if(__REL&&typeof __REL.cleanPct==="number"){
                  const reg=__REL.regime==="high"?_t(lang,"saison haute","high season","temporada alta"):_t(lang,"saison calme","calm season","temporada tranquila")
                  const n=(__REL.cleanN||0).toLocaleString(lang==="fr"?"fr-FR":lang==="es"?"es-ES":"en-US")
                  return _t(lang,
                    `${__REL.cleanPct}% de nos prévisions « mer propre » vérifiées · ${reg} (${n})`,
                    `${__REL.cleanPct}% of our “clean water” forecasts proved correct · ${reg} (${n})`,
                    `${__REL.cleanPct}% de pronósticos “agua limpia” verificados · ${reg} (${n})`)
                }
                if(__REL&&typeof __REL.global==="number"){
                  return _t(lang,
                    `Prévisions recoupées au satellite — ${__REL.global}% justes (30 j)`,
                    `Forecasts cross-checked with satellite — ${__REL.global}% accurate (30 d)`,
                    `Pronósticos contrastados con satélite — ${__REL.global}% exactos (30 d)`)
                }
                return _t(lang,"Prévisions recoupées au satellite, backtest quotidien","Forecasts cross-checked with satellite, daily backtest","Pronósticos contrastados con satélite, backtest diario")
              })()}
            </span>
            <span aria-hidden="true" style={{fontSize:13,fontWeight:800,color:"#16A34A",flexShrink:0}}>→</span>
          </button>}

          {/* Photo externe retirée (juraient avec le design) — la scène vectorielle
              golden-hour du hero porte déjà l'identité de la plage. */}

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

          {/* INDICE SANTÉ / H2S — badge gradué (A/B pw_h2s, feature #4) ; sinon
              warning binaire historique (control, sur avoid uniquement). */}
          {pwH2s
            ? <H2SBadge beach={beach} lang={lang} weather={weather} onPremiumClick={onPremiumClick}/>
            : (ST[beach.status]?.h2s&&(
                <div style={{padding:"10px 14px",borderRadius:12,background:C.redBg,
                  color:C.red,fontSize:13,fontWeight:600,marginBottom:12,
                  display:"flex",alignItems:"center",gap:8}}>
                  ⚠️ {LL.h2sWarn}
                </div>
              ))}

          {/* Email capture — above the fold, before forecast teaser */}
          <InlineEmailCapture lang={lang} beachName={beach.name}/>

          {/* Forecast teaser — masqué en fc_position=top (ForecastChart déjà visible) */}
          {!isPremium&&!fcUp&&forecast&&forecast[1]&&(
            <div onClick={()=>{track("sg_forecast_teaser_click",{beach_id:beach.id,tomorrow:forecast[1].status});onPremiumClick("forecast_teaser")}}
              style={{padding:"14px 16px",borderRadius:16,marginBottom:12,cursor:"pointer",
                background:"linear-gradient(135deg,#190c2c,#142824)",
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
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <a href={wazeUrl} target="_blank" rel="noopener" className="gbtn"
              style={{flex:1,textDecoration:"none",textAlign:"center",
                display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                padding:"14px 10px",borderRadius:16,background:"#0D0D0D",color:"#fff",fontSize:14,fontWeight:700}}>
              <span style={{fontSize:16}}>🚗</span> {LL.directions}
            </a>
            <a href={`/plages/${getCanonicalSlug(beach.name)}/`} target="_blank" rel="noopener"
              style={{flex:1,textDecoration:"none",textAlign:"center",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                padding:"14px 10px",borderRadius:16,border:"1.5px solid var(--sg-border)",
                background:"var(--sg-card)",color:"var(--sg-ink)",fontSize:14,fontWeight:700}}>
              <span style={{fontSize:16}}>📄</span> {LL.fullSheet}
            </a>
            <button onClick={async()=>{
              // PRIMAIRE : carte-image spoiler-free SANS lien (effet Wordle = portée max). Recherche valeur.
              track("sg_share",{beach_id:beach.id,method:"card",status:beach.status})
              if(await shareBeachCard(beach,lang,forecast))return
              // FALLBACK (partage de fichier indispo) : texte + lien (référral si premium).
              const slug=getCanonicalSlug(beach.name)
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
            }} style={{flex:0,padding:"14px 18px",borderRadius:16,
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
                <span style={{fontSize:11,fontWeight:500,color:"var(--sg-mid,#5A5A5A)"}}>
                  {_t(lang,"Compare","Tap to compare","Toca para comparar")}
                </span>
              </h3>
              <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,
                scrollbarWidth:"none",WebkitOverflowScrolling:"touch",margin:"0 -20px",padding:"0 20px 4px"}}>
                {nearby.map(nb=>{
                  const nst=ST[nb.status]||ST._loading
                  return(
                    <button key={nb.id} onClick={()=>{track("sg_nearby_click",{from:beach.id,to:nb.id,status:nb.status});onBeachClick(nb)}} style={{
                      flex:"0 0 auto",width:140,padding:0,
                      borderRadius:14,border:"1px solid var(--sg-border)",overflow:"hidden",
                      background:"var(--sg-card,#fff)",cursor:"pointer",
                      textAlign:"left",fontFamily:"inherit",
                      boxShadow:"0 2px 8px rgba(0,0,0,.06)",
                    }}>
                      <div style={{height:80,background:beachThumbBg(nb),
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

          {/* LE PLAN DU VEILLEUR — ce qu'il faut faire ICI (data→conseil ancré aux problèmes
              réels). DANS la fiche, pas un popup (feedback_no_ui_in_ui). */}
          <VisitPlan beach={beach} lang={lang} allBeaches={allBeaches} weeklyData={weeklyData}/>

          {/* Forecast (days 4-7 locked) — control only; "top" variant renders above */}
          {!fcUp&&<h3 style={{fontSize:15,fontWeight:700,marginBottom:8}}>{LL.forecast}</h3>}
          {/* v3: Arrival banner — strongest signal the app provides */}
          {!fcUp&&weeklyData?.arrivalDetected&&(
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
                <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:2}}>
                  {_t(lang,"Le satellite détecte un banc dérivant vers cette plage (1–3 jours).","Satellite shows a mat drifting toward this beach (1–3 days).","El satélite detecta un banco derivando hacia esta playa (1–3 días).")}
                </div>
              </div>
            </div>
          )}
          {!fcUp&&<ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick} isPremium={isPremium}
            weatherDaily={weather?.daily||null} weeklyData={weeklyData}/>}
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
      fontSize:12,fontWeight:500,color:"var(--sg-mid,#5A5A5A)"}}>
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
      <div style={{fontSize:10,color:"var(--sg-mid,#5A5A5A)",marginTop:2,fontWeight:500,
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
          <span style={{fontSize:8,color:"var(--sg-mid,#5A5A5A)",fontWeight:600}}>/10</span>
        </div>
      </div>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:st.color}}>{label}</div>
        <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)"}}>{(T[lang]||T.fr).beachScore}</div>
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
  const lineColor=last.status==="avoid"?C.red:last.status==="moderate"?C.stMod:C.stClean

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
            const dotColor=c.status==="avoid"?C.red:c.status==="moderate"?C.stMod:C.stClean
            return <circle key={i} cx={c.x} cy={c.y} r={i===coords.length-1?3.5:2} fill={dotColor} stroke="#fff" strokeWidth={1}/>
          })}
        </svg>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
          <span style={{fontSize:10,color:"var(--sg-mid,#5A5A5A)"}}>{firstDate}</span>
          <span style={{fontSize:10,color:"var(--sg-mid,#5A5A5A)",fontWeight:600}}>
            {LL.historyDays.replace("{n}",points.length)}
          </span>
          <span style={{fontSize:10,color:"var(--sg-mid,#5A5A5A)"}}>{lastDate}</span>
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
  const INK="#0D0D0D",MID="#5A5A5A",GOLD="#E8A800"
  return(
    <div style={{position:"relative"}}>
      {/* Recette .sg-field comic unique : bord 2.5 ink + ombre dure bas-droite, loupe
          SVG mono-trait (or au focus), ring or au focus. Tokens thème (comic + dark). */}
      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
            color:focused?GOLD:MID,transition:"color .15s",flexShrink:0,pointerEvents:"none"}}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4"/>
          <path d="M16.5 16.5 L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        </svg>
        <input type="search" value={value} onChange={e=>onChange(e.target.value)}
          placeholder={_t(lang,"Chercher une plage…","Search a beach…","Buscar una playa…")}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          enterKeyHint="search"
          onFocus={()=>setFocused(true)}
          onBlur={()=>setFocused(false)}
          style={{
            width:"100%",minHeight:48,padding:"13px 14px 13px 42px",borderRadius:12,
            border:`2.5px solid ${INK}`,
            background:"var(--sg-card,#fff)",
            color:`var(--sg-ink,${INK})`,fontSize:16,fontWeight:600,letterSpacing:0,
            fontFamily:"inherit",outline:"none",boxSizing:"border-box",
            boxShadow:focused?`2px 2px 0 ${INK}, 0 0 0 3px rgba(255,199,44,.20)`:`2px 2px 0 ${INK}`,
            transition:"box-shadow .12s",
          }}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEACH LIST VIEW — alternative to map (tab Plages)
   ═══════════════════════════════════════════════════════════════════════════ */
function BeachListView({beaches,onBeachClick,favorites,lang,imageMap,sargData,onPremiumClick,isPremium,userPos,onRequestGeo}){
  const LL=T[lang]||T.fr
  const [q,setQ]=useState("")
  const [qFocus,setQFocus]=useState(false)
  const [chip,setChip]=useState(null)
  // TRI explicite (contrôle discret) — best (défaut, ordre data déjà classé) / near / az.
  // "near" = gracieux : haversine si géoloc, sinon temps de route (drive), sinon best.
  const [sort,setSort]=useState("best")
  const listFclock=useMemo(()=>{try{const q=window.location.search;if(/[?&]listfclock=1/.test(q))return true;if(/[?&]listfclock=0/.test(q))return false;return abVariant("list_fclock",["control","lock"],[.5,.5])==="lock"}catch(_){return false}},[])

  const filtered=useMemo(()=>{
    let r=beaches
    if(q){const lq=q.toLowerCase();r=r.filter(b=>(b.name+" "+b.commune).toLowerCase().includes(lq))}
    if(chip==="clean")r=r.filter(b=>b.status==="clean")
    if(chip==="fav")r=r.filter(b=>favorites.includes(b.id))
    if(chip==="avoid")r=r.filter(b=>b.status==="avoid")
    // TRI : "best" garde l'ordre data d'entrée (déjà classé) → ne pas re-trier.
    if(sort!=="best"){
      r=r.slice()
      if(sort==="az"){
        r.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),lang||"fr"))
      }else if(sort==="near"){
        // distance réelle si géoloc accordée, sinon fallback temps de route, sinon en queue
        const dist=b=>{
          if(userPos&&typeof b.lat==="number"&&typeof b.lng==="number")return haversine(userPos.lat,userPos.lng,b.lat,b.lng)
          if(typeof b.drive==="number")return b.drive
          return Infinity
        }
        r.sort((a,b)=>dist(a)-dist(b))
      }
    }
    return r
  },[beaches,q,chip,favorites,sort,userPos,lang])
  const nClean=filtered.filter(b=>b.status==="clean").length
  const bestToday=useMemo(()=>beaches.filter(b=>b.status==="clean"&&typeof b.score==="number").sort((a,bb)=>bb.score-a.score)[0]||null,[beaches])
  /* ── BIBLE DE MARQUE (tokens locaux, 1 rôle = 1 valeur) ──
     Statut = trio EXCLUSIF couleur + FORME-SVG + MOT. Jamais l'or sur un statut.
     Or = action premium RARE (1 seul CTA pop-3). Mono = chiffres (score). */
  const SG={gold:"#E8A800",goldL:"#FFC72C",goldLL:"#FFE47A",teal:"#009E8E",tealL:"#1EC8B0",
    clean:"#22C55E",moderate:"#B87A00",avoid:"#E8522A",ink:"#0D0D0D",mid:"#5A5A5A"}
  const MONO="'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace"
  // Couleur du trio statut depuis un status app → token bible (purge des verts pirates)
  const stColor=s=>s==="clean"?SG.clean:s==="moderate"?SG.moderate:s==="avoid"?SG.avoid:SG.mid
  // Pastille verdict : couleur + FORME SVG inline (✓ / ◐ / ✕, jamais l'Unicode tofu) + MOT
  const StatusForm=({status,size=13})=>{
    const c="#0D0D0D"
    if(status==="clean")return(<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0}}><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>)
    if(status==="moderate")return(<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0}}><circle cx="8" cy="8" r="6" fill="none" stroke="#fff" strokeWidth="2"/><path d="M8 2 A6 6 0 0 1 8 14 Z" fill="#fff"/></svg>)
    return(<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0}}><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/></svg>)
  }
  // Pastille complète (réutilisée strip + cartes) : couleur+forme+mot
  const StatusPill=({status,word})=>(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,border:`2px solid ${SG.ink}`,borderRadius:999,
      padding:"3px 9px",fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:".02em",
      boxShadow:`2px 2px 0 ${SG.ink}`,whiteSpace:"nowrap",
      background:stColor(status),color:status==="clean"?SG.ink:"#fff"}}>
      <StatusForm status={status}/>{word}
    </span>
  )
  const chips=[
    {id:"clean",label:_t(lang,"Propres","Clean","Limpias"),c:SG.clean,fg:SG.ink},
    {id:"fav",label:_t(lang,"Favoris","Favourites","Favoritas"),c:SG.teal,fg:"#fff"},
    {id:"avoid",label:_t(lang,"Éviter","Avoid","Evitar"),c:SG.avoid,fg:"#fff"},
  ]
  // Compteurs par chip (P10) : combien de plages chaque filtre donnerait, en respectant
  // la recherche q mais indépendamment du chip actif → l'utilisateur voit où il y a des
  // résultats avant de cliquer.
  const qBase=useMemo(()=>{if(!q)return beaches;const lq=q.toLowerCase();return beaches.filter(b=>(b.name+" "+b.commune).toLowerCase().includes(lq))},[beaches,q])
  const chipCount=id=>id==="fav"?qBase.filter(b=>favorites.includes(b.id)).length:qBase.filter(b=>b.status===id).length
  return(
    <div style={{height:"100%",overflowY:"auto",overflowX:"hidden",
      paddingTop:"calc(var(--sg-header-offset,108px) + env(safe-area-inset-top,0px))",paddingBottom:"calc(70px + env(safe-area-inset-bottom,12px))",
      background:"radial-gradient(120% 78% at 72% 0%, rgba(201,126,58,.28), rgba(242,176,94,.08) 42%, transparent 66%), linear-gradient(180deg,#0B2230 0%,#103029 40%,#120821 100%)",
      color:"#fff",maxWidth:600,margin:"0 auto"}}>
      {/* Editorial kicker — couleurs via tokens thème (lisible papier comic + sombre) */}
      <div style={{padding:"10px 20px 8px",display:"flex",alignItems:"baseline",gap:8}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1,
          letterSpacing:"-.02em",color:"var(--sg-ink,#fff)"}}>
          {filtered.length}
        </span>
        <span style={{fontSize:12,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase",
          color:"var(--sg-mute,rgba(255,255,255,.6))"}}>
          {_t(lang,`plages · ${nClean} propres`,`beaches · ${nClean} clean`,`playas · ${nClean} limpias`)}
        </span>
      </div>
      {/* Strip meilleur aujourd'hui — best clean beach card (no filter active, has candidate) */}
      {!q&&!chip&&bestToday&&(
        <button onClick={()=>onBeachClick(bestToday)}
          style={{display:"flex",alignItems:"center",gap:12,width:"calc(100% - 32px)",margin:"0 16px 12px",
            padding:14,borderRadius:16,border:`2.5px solid ${SG.ink}`,
            background:"radial-gradient(circle at 1px 1px, rgba(232,168,0,.10) 1.4px, transparent 1.6px) 0 0/7px 7px, linear-gradient(135deg,#15433A,#0E2B25)",
            cursor:"pointer",textAlign:"left",fontFamily:"inherit",color:"#fff",
            boxShadow:`4px 4px 0 ${SG.ink}`}}>
          <div style={{width:54,height:54,flexShrink:0,borderRadius:12,border:`2px solid ${SG.ink}`,
            background:beachThumbBg(bestToday),position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.12)"}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase",
              color:"var(--sg-mute,#FFE47A)",marginBottom:3}}>{_t(lang,"Meilleure aujourd'hui","Best today","Mejor hoy")}</div>
            <div className="anton" style={{fontSize:20,lineHeight:1.08,textTransform:"uppercase",color:"var(--sg-ink,#fff)",
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{bestToday.name}</div>
            <div style={{fontSize:12,color:"var(--sg-mute,rgba(255,255,255,.92))",marginTop:3,fontWeight:600}}>
              {bestToday.commune} · <span style={{fontFamily:MONO,fontVariantNumeric:"tabular-nums"}}>{bestToday.score}</span><span style={{fontFamily:MONO}}>/100</span>
            </div>
          </div>
          <StatusPill status="clean" word={_t(lang,"Propre","Clean","Limpia")}/>
        </button>
      )}
      {/* Search + filter chips + TRI — recette .sg-field comic unique (bord 2.5 ink,
          ombre dure, loupe SVG mono-trait, focus ring or). Tokens thème → comic + dark. */}
      <div style={{padding:"0 16px 12px"}}>
        <div style={{position:"relative",display:"flex",alignItems:"center",gap:8,
          background:"var(--sg-card,#fff)",
          borderRadius:12,padding:"0 14px",height:48,marginBottom:12,
          border:`2.5px solid ${SG.ink}`,
          boxShadow:qFocus?`2px 2px 0 ${SG.ink}, 0 0 0 3px rgba(255,199,44,.20)`:`2px 2px 0 ${SG.ink}`,
          transition:"box-shadow .12s"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flexShrink:0,transition:"color .15s",color:qFocus?SG.gold:SG.mid}}>
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4"/>
            <path d="M16.5 16.5 L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          <input value={q} onChange={e=>setQ(e.target.value)} type="search"
            onFocus={()=>setQFocus(true)} onBlur={()=>setQFocus(false)}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search"
            placeholder={_t(lang,"Chercher une plage…","Search a beach…","Buscar una playa…")}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:16,color:"var(--sg-ink,"+SG.ink+")",fontFamily:"inherit",fontWeight:600,letterSpacing:0,minWidth:0}}/>
          {q&&<button onClick={()=>setQ("")} aria-label={_t(lang,"Effacer","Clear","Borrar")} className="sg-field-clear">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
          </button>}
        </div>
        {/* CHIPS — pill comic. Active = fond statut PLEIN (clean/teal/avoid). Le thème comic
            force le fond des boutons → on peint l'actif via classes `!important` scopées. */}
        <style>{`
          .sg-field-clear{display:flex!important;align-items:center;justify-content:center;width:36px;height:36px;padding:0!important;flex-shrink:0;
            background:none!important;border:none!important;box-shadow:none!important;border-radius:999px!important;color:${SG.mid}!important;cursor:pointer;text-shadow:none!important}
          .sg-fchip{display:inline-flex!important;align-items:center;gap:6px;min-height:36px;font-size:12px;font-weight:800!important;
            text-transform:uppercase;letter-spacing:.02em;padding:6px 12px!important;border-radius:999px!important;
            border:2.5px solid ${SG.ink}!important;box-shadow:2px 2px 0 ${SG.ink}!important;cursor:pointer;font-family:inherit!important;
            white-space:nowrap;background:var(--sg-card,#fff)!important;color:var(--sg-ink,${SG.ink})!important;text-shadow:none!important;transform:none}
          .sg-fchip.is-on{box-shadow:1px 1px 0 ${SG.ink}!important;transform:translate(2px,2px)}
          .sg-fchip.is-on .sg-fchip-ct{color:inherit!important}
          .sg-fchip-clean.is-on{background:${SG.clean}!important;color:${SG.ink}!important}
          .sg-fchip-fav.is-on{background:${SG.teal}!important;color:#fff!important}
          .sg-fchip-avoid.is-on{background:${SG.avoid}!important;color:#fff!important}
          .sg-fchip-ct{font-family:${MONO};font-variant-numeric:tabular-nums;font-weight:700;opacity:.7;color:${SG.mid}}
        `}</style>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {chips.map(ch=>{
            const active=chip===ch.id
            return(
              <button key={ch.id} onClick={()=>setChip(active?null:ch.id)}
                aria-pressed={active}
                className={`sg-fchip sg-fchip-${ch.id}`+(active?" is-on":"")}>
                {ch.label} <span className="sg-fchip-ct">{chipCount(ch.id)}</span>
              </button>
            )
          })}
        </div>
        {/* TRI — segmented discret (plus léger que les chips : sans ombre dure, zéro or).
            Câblé sur l'état `sort` ci-dessus. "Plus proches" = fallback gracieux sans géoloc.
            ⚠️ Le thème comic force `.theme-comic button{background:var(--sg-card)!important}` →
            on neutralise les styles encrés via classes `!important` scopées (sinon l'actif
            est invisible). C'est pourquoi ce contrôle utilise des classes, pas du inline. */}
        <style>{`
          .sg-sortseg{display:inline-flex;border:2px solid ${SG.ink};border-radius:999px;overflow:hidden;max-width:100%;background:var(--sg-card,#fff)}
          .sg-sortseg .sg-sortbtn{appearance:none!important;border:none!important;border-right:2px solid ${SG.ink}!important;border-radius:0!important;
            box-shadow:none!important;cursor:pointer;min-height:38px;padding:0 13px!important;
            font-family:inherit!important;font-weight:800!important;font-size:12px;text-transform:uppercase;letter-spacing:.04em;
            background:var(--sg-card,#fff)!important;color:var(--sg-mute,rgba(255,255,255,.7))!important;
            transition:background .1s,color .1s;white-space:nowrap;text-shadow:none!important}
          .sg-sortseg .sg-sortbtn:last-child{border-right:none!important}
          .sg-sortseg .sg-sortbtn.is-on{background:${SG.ink}!important;color:var(--sg-card,#fff)!important}
        `}</style>
        <div style={{marginTop:12}}>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:".10em",textTransform:"uppercase",
            color:"var(--sg-mute,rgba(255,255,255,.6))",marginBottom:7}}>
            {_t(lang,"Trier par","Sort by","Ordenar por")}
          </div>
          <div className="sg-sortseg" role="tablist" aria-label={_t(lang,"Trier les plages","Sort beaches","Ordenar playas")}>
            {[
              {id:"best",label:_t(lang,"Meilleures","Best","Mejores")},
              {id:"near",label:_t(lang,"Plus proches","Nearest","Cercanas")},
              {id:"az",label:_t(lang,"A–Z","A–Z","A–Z")},
            ].map((s,i)=>{
              const on=sort===s.id
              return(
                <button key={s.id} role="tab" aria-selected={on}
                  className={"sg-sortbtn"+(on?" is-on":"")}
                  onClick={()=>{setSort(s.id);try{track("sg_list_sort",{sort:s.id})}catch(_){}
                    // « Plus proches » sans position → soft-ask contextuel (tri par
                    // distance réelle dès que la permission est accordée ; sinon repli drive).
                    if(s.id==="near"&&!userPos&&onRequestGeo)onRequestGeo("list_near")}}>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── CTA OR PREMIUM — le SEUL pop-3 / seule surface or de l'écran (conversion) ──
          className "sg-cta" : sous le thème comic global (100% site), c'est la règle
          `.theme-comic .sg-cta` qui peint le DORÉ golden-hour (sinon le bouton hérite du
          papier crème générique). Hors thème, le style inline or sert de fallback. */}
      {!isPremium&&(
        <button className="sg-cta sg-paygold" onClick={()=>{try{track("sg_beach_list_premium_cta")}catch(_){}; onPremiumClick("beach_list")}}
          style={{margin:"4px 16px 16px",border:`2.5px solid ${SG.ink}`,borderRadius:16,boxShadow:`6px 6px 0 ${SG.ink}`,
            background:"radial-gradient(circle at 1px 1px, rgba(13,13,13,.10) 1.3px, transparent 1.5px) 0 0/7px 7px, linear-gradient(135deg,"+SG.goldL+","+SG.gold+")",
            color:SG.ink,padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",
            width:"calc(100% - 32px)",fontFamily:"inherit"}}>
          <svg width="42" height="42" viewBox="0 0 40 40" aria-hidden="true" style={{flexShrink:0}}>
            <rect x="9" y="11" width="22" height="15" rx="6" fill="#0D0D0D"/>
            <rect x="11" y="13" width="18" height="11" rx="4" fill="#FFC72C"/>
            <circle cx="16" cy="18" r="3" fill="#0D0D0D"/><circle cx="15" cy="17.5" r="1.1" fill="#FFE47A"/>
            <path d="M31 18 L37 15 M31 20 L37 22" stroke="#0D0D0D" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:".10em",color:"#5c4500"}}>
              {_t(lang,"Le Veilleur","The Watcher","El Vigía")}
            </div>
            <div style={{fontSize:15,fontWeight:800,lineHeight:1.3,marginTop:2,color:SG.ink}}>
              {_t(lang,"7 jours d'avance · alerte dès qu'une plage change","7 days ahead · alert the moment a beach changes","7 días de adelanto · alerta en cuanto cambia una playa")}
            </div>
          </div>
          <span style={{flexShrink:0,width:30,height:30,borderRadius:"50%",background:SG.ink,color:SG.goldL,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800}}>→</span>
        </button>
      )}
      {filtered.length===0?(
        <div className="sg-empty" style={{padding:"60px 32px"}}>
          <div className="sg-empty__veil"><Veilleur mood="serein" size={64}/></div>
          <div className="sg-empty__title">
            {_t(lang,"Aucune plage trouvée","No beaches match","No se encontraron playas")}
          </div>
          <div className="sg-empty__sub">
            {_t(lang,"Essaie un autre filtre — je garde l'œil sur la mer, baie par baie.","Try another filter — I'm watching the sea, bay by bay.","Prueba otro filtro — vigilo el mar, bahía por bahía.")}
          </div>
        </div>
      ):(
      <div style={{padding:"6px 16px",display:"flex",flexDirection:"column",gap:11}}>
        {filtered.map(b=>{
          const st=ST[b.status]||ST._loading
          const hasScore=typeof b.score==="number"
          // statut du trio aligné sur le SCORE affiché (pas le status brut) → couleur+forme+mot cohérents
          const band=hasScore?(b.score>=70?"clean":b.score>=40?"moderate":"avoid"):b.status
          const railC=stColor(band)
          // MOT : label éditorial data-driven si présent, sinon le mot du trio
          const word=(hasScore&&scoreLabelFor(b.scoreLabel,lang))||(lang==="es"?st.les:lang==="en"?st.le:st.l)
          const isFav=favorites.includes(b.id)
          const sargId=BEACH_TO_SARG?.[b.id]
          const fcDays=(listFclock&&isFav&&!isPremium&&sargData)
            ?(sargData?.weekly?.[sargId]?.forecast||null)
            :null
          const colFc=s=>stColor(s)
          const hFc=s=>s==="clean"?20:s==="moderate"?28:36
          return(
            <button key={b.id} onClick={()=>onBeachClick(b)} style={{
              position:"relative",
              display:"flex",flexDirection:fcDays?"column":"row",alignItems:fcDays?"stretch":"center",
              gap:fcDays?0:13,padding:0,
              borderRadius:16,border:`2.5px solid ${SG.ink}`,
              background:"linear-gradient(180deg,#16322B,#0E2620)",
              cursor:"pointer",textAlign:"left",fontFamily:"inherit",width:"100%",color:"#fff",
              boxShadow:isFav&&fcDays?`6px 6px 0 ${SG.ink}`:`4px 4px 0 ${SG.ink}`,
              overflow:"hidden",
            }}>
              {/* Top row (always) */}
              <div style={{display:"flex",alignItems:"center",gap:13,position:"relative"}}>
              {/* Score-colored left rail — static (doctrine calme, pas de glow) */}
              <div aria-hidden="true" style={{position:"absolute",left:0,top:0,bottom:0,width:5,
                background:railC}}/>
              {/* Photo thumbnail */}
              <div style={{width:74,height:74,flexShrink:0,position:"relative",marginLeft:7,borderRadius:12,
                border:`2px solid ${SG.ink}`,background:beachThumbBg(b)}}/>
              <div style={{flex:1,minWidth:0,padding:"13px 4px 13px 0"}}>
                {/* Couleurs via tokens thème (--sg-ink/--sg-mute) avec fallback scène sombre :
                    lisible sur le papier crème du thème comic global ET sur fond sombre. */}
                <div className="anton" style={{fontSize:20,lineHeight:1.08,letterSpacing:".005em",
                  textTransform:"uppercase",color:"var(--sg-ink,#fff)",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {isFav?<span style={{color:SG.teal}}>♥ </span>:null}{b.name}
                </div>
                <div style={{fontSize:12,color:"var(--sg-mute,rgba(255,255,255,.85))",marginTop:3,fontWeight:600,
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {b.commune}{typeof b.drive==="number"?<>{" · "}<span style={{fontFamily:MONO,fontVariantNumeric:"tabular-nums"}}>{b.drive}</span>{` ${LL.drive}`}</>:""}
                </div>
                <div style={{marginTop:8}}>
                  <StatusPill status={band} word={word}/>
                </div>
              </div>
              {/* Score badge — JetBrains Mono numeral, trio-coloré (lisible papier+sombre) */}
              {hasScore&&(
                <div style={{flexShrink:0,padding:"0 16px 0 0",display:"flex",flexDirection:"column",
                  alignItems:"flex-end",justifyContent:"center"}}>
                  <span style={{fontFamily:MONO,fontVariantNumeric:"tabular-nums",fontSize:28,fontWeight:800,lineHeight:.95,
                    letterSpacing:"-.01em",color:railC}}>
                    {b.score}
                  </span>
                  <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:"var(--sg-mute,rgba(255,255,255,.7))",
                    letterSpacing:".02em",marginTop:1}}>/100</span>
                </div>
              )}
              </div>
              {/* Forecast lock strip — fav only, !isPremium, A/B list_fclock */}
              {fcDays&&(
                <div onClick={e=>{e.stopPropagation();track("sg_list_fclock_click",{beach_id:b.id});onPremiumClick("list_forecast_lock")}}
                  style={{margin:"0 14px 13px",padding:"12px 14px",borderRadius:12,
                    background:"rgba(232,168,0,.10)",
                    border:`2px solid ${SG.gold}`,cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"var(--sg-ink,#FFC72C)"}}>
                        <svg width="13" height="13" viewBox="0 0 40 40" aria-hidden="true" style={{flexShrink:0}}>
                          <rect x="9" y="11" width="22" height="15" rx="6" fill="#0D0D0D"/>
                          <rect x="11" y="13" width="18" height="11" rx="4" fill="#FFC72C"/>
                          <path d="M31 18 L37 15 M31 20 L37 22" stroke="#0D0D0D" strokeWidth="3" strokeLinecap="round"/>
                        </svg>
                        {_t(lang,"Prévisions 4 jours","4-day Forecast","Pronóstico 4 días")}
                      </div>
                      <div style={{fontSize:12,color:"var(--sg-mute,rgba(255,255,255,.9))",marginTop:3,fontWeight:600}}>
                        {_t(lang,"J+2 · J+3 réservés aux Veilleurs","J+2 · J+3 for Watchers","J+2 · J+3 para Vigías")}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-end",gap:8,flexShrink:0}}>
                      {[0,1].map(i=>{
                        const day=fcDays[i]
                        const c=colFc(day?.status||b.status)
                        const h=hFc(day?.status||b.status)
                        return(
                          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                            <div style={{width:22,height:h,borderRadius:5,border:`2px solid ${SG.ink}`,background:c}}/>
                            <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.85)",letterSpacing:".02em"}}>
                              {i===0?_t(lang,"AUJ","TODAY","HOY"):"J+1"}
                            </span>
                          </div>
                        )
                      })}
                      {["J+2","J+3"].map(lbl=>(
                        <div key={lbl} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                          <div style={{width:22,height:28,borderRadius:5,border:`2px dashed ${SG.goldL}`,
                            background:"rgba(255,199,44,.12)",display:"flex",alignItems:"center",
                            justifyContent:"center"}}>
                            <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke={SG.goldL} strokeWidth="2"/>
                              <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke={SG.goldL} strokeWidth="2"/>
                            </svg>
                          </div>
                          <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:SG.goldL,letterSpacing:".02em"}}>{lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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
              animation:"dot-pulse 2s ease-in-out 1 both"}}/>
            <span style={{fontSize:12,fontWeight:700,color:C.ink}}>
              <em style={{fontStyle:"normal",color:C.amber,fontWeight:700}}>
                {IS_NEW_REGION?(REGION.primaryLang==="es"?`${REGION.beaches.length} playas`:`${REGION.beaches.length} beaches`):isMQ?"53 plages":"83 plages"}
              </em> {_t(lang,"surveillées en temps réel","monitored live","monitoreadas en vivo")}
            </span>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(20px,5.5vw,26px)",lineHeight:1,
            textTransform:"uppercase",color:C.ink,marginBottom:8}}>
            <span style={{color:C.stClean}}>{_t(lang,"Vert","Green","Verde")}</span> = {_t(lang,"propre","clean","limpia")}.{" "}
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
            <span style={{color:C.stMod}}>●</span>{" "}
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
      background:"linear-gradient(180deg,#190c2c 0%,#120821 100%)",
      animation:"fadeIn .3s ease",overflowX:"hidden",overflowY:"auto",
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
            animation:"spin 20s linear 1 both",
            boxShadow:"0 2px 10px rgba(232,168,0,.35)",
          }}/>
          <span style={{fontSize:13,fontWeight:700,letterSpacing:".06em",color:"#fff",
            fontFamily:"'Anton',sans-serif",textTransform:"uppercase"}}>
            {IS_NEW_REGION?`SARGASSUM ${REGION.name.toUpperCase()}`:`SARGASSES.${isMQ?"MQ":"GP"}`}
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#22C55E",
            animation:"dot-pulse 2s ease-in-out 1 both"}}/>
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
            animation:"satellite-scan 3s ease-in-out 1 both"}}/>
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
                  border:`2px solid ${st.c}30`,animation:"pin-pulse 2.5s ease-out 1 both"}}/>
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
            fontSize:18,color:"var(--sg-mid,#5A5A5A)",cursor:"pointer",
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

  // Capture email mini — PARTAGÉE peek + expanded. Bug historique : elle ne vivait que
  // dans la branche expanded (hero replié par défaut → invisible ~100% des sessions,
  // capture 0,2%). Rendue dans LES DEUX états pour les visiteurs non captés (décision
  // fondateur 21/06 : capture email = surface PAR DÉFAUT sur la carte). Dismiss = 1×.
  const heroEmailBlock=(<>
    {!heroEmailHidden&&!heroEmailSent&&(
      <div style={{
        position:"relative",
        borderTop:"2px solid #0D0D0D",
        padding:"10px 12px",
        background:"#FFE47A",
        display:"flex",alignItems:"center",gap:7,
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}>
          <rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 7l9 6 9-6"/>
        </svg>
        <input
          type="email" inputMode="email" autoComplete="email"
          placeholder={_t(lang,"ton@email — ma reco à 7h","email — daily pick at 7am","tu@email — tu playa del día a las 7")}
          value={heroEmail}
          onChange={e=>setHeroEmail(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")submitHeroEmail()}}
          onClick={e=>e.stopPropagation()}
          style={{
            flex:1,minWidth:0,
            padding:"8px 10px",borderRadius:9,
            border:"2px solid #0D0D0D",
            fontSize:16,fontFamily:"inherit",
            background:"#fff",
            color:"#0D0D0D",outline:"none",
          }}
        />
        <button
          onClick={submitHeroEmail}
          disabled={!heroEmail||!heroEmail.includes("@")}
          style={{
            padding:"8px 15px",borderRadius:9,
            border:"2px solid #0D0D0D",
            background:(heroEmail&&heroEmail.includes("@"))?"linear-gradient(135deg,#FFC72C,#E8A800)":"rgba(13,13,13,.07)",
            boxShadow:(heroEmail&&heroEmail.includes("@"))?"2px 2px 0 #0D0D0D":"none",
            color:(heroEmail&&heroEmail.includes("@"))?"#0D0D0D":"rgba(13,13,13,.32)",
            fontSize:14,fontWeight:800,
            cursor:(heroEmail&&heroEmail.includes("@"))?"pointer":"not-allowed",
            fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0,
          }}
        >OK</button>
        <button
          onClick={()=>{
            try{localStorage.setItem("sg_hero_email_dismiss","1")}catch{}
            setHeroEmailHidden(true)
            track("sg_hero_email_dismiss")
          }}
          aria-label="dismiss"
          style={{
            background:"none",border:"none",cursor:"pointer",
            color:"rgba(13,13,13,.5)",padding:"4px 2px",
            fontFamily:"inherit",flexShrink:0,display:"flex",alignItems:"center",
          }}
        ><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>
      </div>
    )}
    {heroEmailSent&&(
      <div style={{
        position:"relative",
        borderTop:"2px solid #0D0D0D",
        padding:"10px 14px",textAlign:"center",
        background:"rgba(34,197,94,.12)",
      }}>
        <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}>
            <circle cx="12" cy="12" r="9" stroke="#0D0D0D" strokeWidth="2.2"/><path d="M8 12.5l2.5 2.5L16 9.5"/>
          </svg>
          <span>{_t(lang,"C'est fait ! Ta reco demain à 7h.","You're in! First pick tomorrow 7am.","¡Listo! Tu playa del día mañana a las 7.")}</span>
        </div>
        {onPremiumClick&&(
          <button
            onClick={e=>{e.stopPropagation();onPremiumClick("hero_email_success")}}
            style={{
              marginTop:6,background:"none",border:"none",
              color:"var(--sg-mid,#5A5A5A)",fontSize:11,fontWeight:600,
              cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",
              textDecorationColor:"rgba(0,0,0,.2)",textUnderlineOffset:2,
            }}
          >
            {_t(lang,"Alertes en direct aussi ? Voir Premium →","Want live alerts too? See Premium →","¿Quieres alertas en vivo también? Ver Premium →")}
          </button>
        )}
      </div>
    )}
  </>)

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
        color:"var(--sg-mid,#5A5A5A)",
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
              color:"#156a96",opacity:.85,marginBottom:1,
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
                <span style={{color:"var(--sg-mid,#5A5A5A)",fontWeight:600,flexShrink:0}}>{distLbl}</span>
              </>)}
            </div>
          </div>
          <span style={{
            fontSize:12,fontWeight:800,color:"#fff",
            flexShrink:0,whiteSpace:"nowrap",
            padding:"10px 18px",borderRadius:100,
            background:"linear-gradient(135deg,#00C2B0 0%,#156a96 100%)",
            boxShadow:"0 6px 18px rgba(0,158,142,.45), inset 0 1px 0 rgba(255,255,255,.35)",
            letterSpacing:".03em",
          }}>
            {_t(lang,"J'y vais →","Take me →","Vamos →")}
          </span>
        </button>
        {/* Capture email 1-ligne EN MODE PEEK (état par défaut) — le levier #1 enfin
            visible sans déplier. Bloc partagé, dismissable 1×. */}
        {heroEmailBlock}
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
            color:"var(--sg-mid,#5A5A5A)",
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
                <span style={{fontSize:9,fontWeight:800,marginTop:1,color:"var(--sg-mid,#5A5A5A)",letterSpacing:".08em"}}>/100</span>
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
            fontSize:11,color:"var(--sg-mid,#5A5A5A)",
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
                  <div style={{fontSize:10,color:"var(--sg-mid,#5A5A5A)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
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

      {/* Capture email — bloc partagé (voir heroEmailBlock plus haut) */}
      {heroEmailBlock}
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
              <span style={{fontSize:7,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",letterSpacing:".04em"}}>/100</span>
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
          <div style={{fontSize:9.5,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",letterSpacing:".05em",
            textTransform:"uppercase",marginBottom:2}}>
            {typeof top.score==="number"
              ?_t(lang,`Meilleure plage aujourd'hui · ${scoreLabelFor(top.scoreLabel,lang)||""}`,`Best beach today · ${scoreLabelFor(top.scoreLabel,lang)||""}`,`Mejor playa hoy · ${scoreLabelFor(top.scoreLabel,lang)||""}`)
              :_t(lang,"Ta meilleure plage maintenant","Best beach now","Tu mejor playa ahora")}
          </div>
          <div style={{fontSize:15,fontWeight:700,color:"var(--sg-ink,#0D0D0D)",lineHeight:1.2,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {top.name}
          </div>
          <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:2,
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
          maxHeight:200,overflowY:"auto",overflowX:"hidden",
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
                  <div style={{fontSize:10.5,color:"var(--sg-mid,#5A5A5A)"}}>
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
// ── B2BModal — capture PRO (hôtels / collectivités). Point d'entrée discret depuis
//    le paywall. Alimente le drip B2B DÉJÀ construit (drip-b2b-email.cjs) via
//    submitLead(email, 'b2b_hotel_request'|'b2b_collectivite_request'). Aucune
//    logique de paiement : on capte un lead, un humain recontacte (ton consultatif).
/* ── PAYWALL (PremiumModal + WorldPaywall + ComicPaywall + B2BModal) extrait dans
   src/PremiumModal.jsx et chargé en LAZY (chunk séparé hors first-paint) — perf #173.
   AUCUNE logique de paiement modifiée : code déplacé tel quel, deps importées via
   exports nommés de ce module (cf. import statique côté PremiumModal.jsx). ── */
const PremiumModal=lazyWithRetry(()=>import("./PremiumModal.jsx"))
const B2BModal=lazyWithRetry(()=>import("./PremiumModal.jsx").then(m=>({default:m.B2BModal})))


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
  // Kill-switch anti-fake-freshness : données >12h = stale, ne pas afficher un horodatage
  // précis qui suggèrerait « presque en direct » (cf. Phase 0 REFONTE-MASTER).
  if(h>=12)return null
  return lang==="en"?`${h}h ago`:lang==="es"?`hace ${h}h`:`il y a ${h}h`
}
function Header({island,onIslandChange,lang,onLangToggle,theme,onThemeToggle,beachCount,dataSource,updatedAt,onHome,onEnableNotif,onAccess,isPremium}){
  const LL=T[lang]||T.fr
  // « Mon accès » — entrée toujours visible (statut Pass + restauration self-serve, HORS
  // paywall). Répond au « aucun tracking de mon paiement sur le site ». Flag rollback
  // ?monacces=0 → masque l'entrée (comportement d'avant).
  const showAccess=!!onAccess&&!(/[?&]monacces=0/.test(typeof window!=="undefined"?window.location.search:""))
  // EN DIRECT canonique : vivant SEULEMENT si source live ET fraîcheur réelle <12h
  // (formatFreshness retourne null au-delà → on bascule sur « vérification en cours »).
  const fresh=formatFreshness(updatedAt,lang)
  const isLive=dataSource==="erddap-live"&&!!fresh
  const liveLbl=isLive
    ?_t(lang,"EN DIRECT","LIVE","EN DIRECTO")
    :_t(lang,"vérification en cours","verification in progress","verificación en curso")
  // Recette comic : segments via classes scopées .sg-seg/.sg-live/.sg-iso/.sg-util
  // (contour ink 2.5px + pop-1 dure, 0 blur) — bat le thème comic !important.
  return(
    <div className="sg-header-row sg-rail">
      {/* Accueil — logo dé-doré (ink + teal, sobre) : ne dilue plus le signal de conversion.
          Ramène à l'atterrissage (directive user 12/06 « toujours revenir vers l'accueil »). */}
      {onHome&&<button onClick={onHome} aria-label={lang==="es"?"Inicio":lang==="en"?"Home":"Accueil"} className="sg-seg sg-seg-home">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#0A1714"/>
          <path d="M4 13.5 Q8 11 12 12.5 T20 12" stroke="#1EC8B0" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M4 16.5 Q8 14.2 12 15.6 T20 15" stroke="#009E8E" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <circle cx="16.5" cy="8" r="2.4" fill="#FFC72C" stroke="#0d0b14" strokeWidth="1.4"/>
        </svg>
      </button>}
      {/* Island toggle MQ/GP — SEULE surface or pleine (or RARE). Bricolage 800 (Anton retiré).
          Masqué pour les nouvelles régions (build mono-région). */}
      {!IS_NEW_REGION && (<div className="sg-seg sg-iso" role="group" aria-label={_t(lang,"Région","Region","Región")}>
        <span aria-hidden className="sg-iso-knob" style={{
          transform:island==="mq"?"translateX(3px)":"translateX(calc(100% + 3px))"}}/>
        {["mq","gp"].map(id=>(
          <button key={id} onClick={()=>{onIslandChange(id);track("sg_island_switch",{to:id})}}
            style={{color:island===id?"#0d0b14":"var(--sg-mid,#5A5A5A)"}}>{id==="mq"?"MQ":"GP"}</button>
        ))}
      </div>)}

      {/* Pill EN DIRECT — composant canonique .sg-live : teal #009E8E (plus le corail qui
          collisionnait avec « éviter »), label ENCRE (AA), fraîcheur en Mono branchée
          sur l'âge RÉEL (isLive ← updatedAt <12h, sinon « vérification en cours »). */}
      <a href="https://marine.copernicus.eu" target="_blank" rel="noopener noreferrer"
        onClick={()=>track("sg_live_badge_click",{source:dataSource})}
        className="sg-seg sg-live" aria-label={_t(lang,"Données en direct","Live data","Datos en vivo")}>
          <span className="sg-live-dot" aria-hidden="true">
            {isLive&&<span className="sg-live-halo"/>}
            <i/>
          </span>
          <span className="sg-live-lbl">{liveLbl}</span>
          {isLive&&fresh&&<span className="sg-live-age">· {fresh}</span>}
        </a>

      {/* Cloche alertes — opt-in push TOUJOURS accessible (avant : seulement le primer
          d'inactivité, manquable). Tap = geste utilisateur → prompt natif (marche iOS). */}
      <div className="sg-seg sg-util" role="group" aria-label={_t(lang,"Préférences","Preferences","Preferencias")}>
        {onEnableNotif&&(()=>{
          const perm=(typeof Notification!=="undefined")?Notification.permission:"default"
          const on=perm==="granted"
          const iosBrowser=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!(window.navigator.standalone===true||window.matchMedia("(display-mode: standalone)").matches)
          return(<button aria-label={_t(lang,"Activer les alertes sargasses","Enable sargassum alerts","Activar alertas de sargazo")}
            onClick={()=>{
              if(on){try{sgToast({tone:"success",msg:_t(lang,"Le Veilleur t'écrit déjà chaque matin 🔔","The Watchman already writes you each morning 🔔","El Vigía ya te escribe cada mañana 🔔")})}catch(_){}; return}
              if(perm==="denied"){try{sgToast({tone:"info",title:_t(lang,"Notifications bloquées","Notifications blocked","Notificaciones bloqueadas"),msg:_t(lang,"Réactive-les dans les réglages de ton téléphone/navigateur.","Re-enable them in your phone/browser settings.","Reactívalas en los ajustes de tu teléfono/navegador.")})}catch(_){}; return}
              if(iosBrowser){try{sgToast({tone:"info",title:_t(lang,"Ajoute l'app à ton écran d'accueil","Add the app to your home screen","Añade la app a tu pantalla de inicio"),msg:_t(lang,"Partager → « Sur l'écran d'accueil », puis active les alertes.","Share → 'Add to Home Screen', then enable alerts.","Compartir → 'A pantalla de inicio', luego activa las alertas.")})}catch(_){}; return}
              try{track("sg_push_header_cta",{})}catch(_){}
              onEnableNotif()
            }}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9.5a6 6 0 0 1 12 0c0 4.4 1.8 5.5 1.8 5.5H4.2S6 13.9 6 9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill={on?"currentColor":"none"}/>
              <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>)
        })()}
        {showAccess&&(
          <button onClick={onAccess} aria-label={_t(lang,"Mon accès","My access","Mi acceso")}
            title={_t(lang,"Mon accès","My access","Mi acceso")}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="2"/>
              <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              {isPremium&&<circle cx="18" cy="6" r="2.4" fill="#FFC72C" stroke="#0d0b14" strokeWidth="1.2"/>}
            </svg>
          </button>
        )}
        <button onClick={onThemeToggle} aria-label={theme==="dark"?"Light mode":"Dark mode"}>
          {theme==="dark"
            ?<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
               <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
             </svg>
            :<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
               <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2"/>
               <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                 <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/>
               </g>
             </svg>}
        </button>
        {(()=>{/* Label = langue CIBLE. Nouvelles régions : bascule 2 langues primary↔secondary. MQ/GP : cycle fr→en→es inchangé. */
        const langTarget=IS_NEW_REGION?(lang===REGION.primaryLang?(REGION.secondaryLangs?.[0]||"en"):REGION.primaryLang):(lang==="fr"?"en":lang==="en"?"es":"fr")
        return(<button onClick={onLangToggle} className="sg-lang" aria-label={langTarget==="en"?"Switch to English":langTarget==="es"?"Cambiar a español":"Passer en français"}>{langTarget.toUpperCase()}</button>)})()}
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
      <div style={{fontSize:10,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",
        textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>
        {T3("Mesure satellite Copernicus","Copernicus satellite reading","Medición satélite Copernicus")}
      </div>
      {/* AFAI bar */}
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,
          color:"var(--sg-mid,#5A5A5A)",marginBottom:4}}>
          <span>{T3("Propre","Clean","Limpia")} ← AFAI</span>
          <span style={{fontWeight:700,color:zoneColor}}>
            {T3("Mesuré :","Read:","Medido:")} {afai.toFixed(3)}
          </span>
          <span>→ {T3("Alerte","Alert","Alerta")}</span>
        </div>
        <div style={{height:8,borderRadius:99,overflow:"hidden",position:"relative",
          background:"linear-gradient(90deg,#16A34A 0%,#16A34A 18.75%,#E07800 18.75%,#E07800 50%,#E8522A 50%)"}}>
          <div style={{position:"absolute",top:-2,bottom:-2,width:3,borderRadius:2,
            background:"#120821",left:`calc(${pct.toFixed(1)}% - 1px)`,
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
        <span style={{fontSize:11,fontWeight:700,color:"var(--sg-mid,#5A5A5A)",
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

/* ═══════════════════════════════════════════════════════════════════════════
   CAPTURE GATE MODAL — bras A/B `capture_gate` (50/50).
   Intercepte openPremium("forecast_*") quand aucun email capturé.
   Pitch : email → rapport matin + prévision J+2-J+7. Après submit → PremiumModal.
   ═══════════════════════════════════════════════════════════════════════════ */
function CaptureGateModal({lang,onSubmit,onClose,onPay,beach}){
  const[email,setEmail]=useState(()=>{try{return localStorage.getItem("sg_email")||""}catch{return ""}})
  const[sent,setSent]=useState(false)
  const[err,setErr]=useState(false)

  function submit(e){
    e.preventDefault()
    if(!email||!email.includes("@")){setErr(true);return}
    setSent(true)
    onSubmit(email)
  }

  const hasBeach=!!(beach?.name)
  
  return(
    <div style={{position:"fixed",inset:0,zIndex:1055,background:"rgba(2,9,7,.85)",
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(12px)"}}
      role="dialog" aria-modal="true"
      aria-label={hasBeach?_t(lang,`Débloque ${beach.name}`,`Unlock ${beach.name}`,`Desbloquea ${beach.name}`):_t(lang,"Reçois le brief sargasses","Get the sargassum brief","Recibe el informe de sargazo")}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{width:"90%",maxWidth:480,borderRadius:PAY_CAPTURE_ONLY?20:24,
        background:PAY_CAPTURE_ONLY?"#fdf6e3":"rgba(10,23,20,.65)",border:PAY_CAPTURE_ONLY?"3px solid #0d0b14":"1px solid rgba(255,255,255,.08)",
        padding:"40px 24px",boxShadow:PAY_CAPTURE_ONLY?"6px 6px 0 #0d0b14":"0 20px 60px rgba(0,0,0,.6)",forcedColorAdjust:"none",
        display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center"}}>
        
        {!sent?(<>
          <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(95,211,201,.15)",
            display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20}}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3fd07f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </div>
          
          <h2 style={{fontSize:26,fontWeight:800,color:PAY_CAPTURE_ONLY?"#0d0b14":"#fff",lineHeight:1.2,margin:"0 0 12px 0",fontFamily:"Bricolage Grotesque,sans-serif"}}>
            {hasBeach 
              ? _t(lang,`Débloque la météo de ${beach.name} pour demain.`,`Unlock tomorrow's forecast for ${beach.name}.`,`Desbloquea el clima de ${beach.name} para mañana.`)
              : _t(lang,"Reçois le rapport sargasses chaque matin.","Get the sargassum report every morning.","Recibe el informe de sargazo cada mañana.")}
          </h2>
          
          {__REL&&typeof __REL.cleanPct==="number"&&(()=>{
            const reg=__REL.regime==="high"?_t(lang,"saison haute","high season","temporada alta"):_t(lang,"saison calme","calm season","temporada tranquila")
            return <a href={reliabilityHref(lang)} onClick={()=>{try{track("sg_reliability_open",{from:"capture_gate"})}catch(_){}}}
              style={{display:"inline-flex",alignItems:"center",gap:7,margin:"0 0 16px",padding:"7px 13px",borderRadius:999,
                background:"rgba(34,197,94,.12)",border:`1px solid rgba(34,197,94,${PAY_CAPTURE_ONLY?".4":".24"})`,textDecoration:"none",
                fontSize:12,fontWeight:600,color:PAY_CAPTURE_ONLY?"#1B7A4B":"#8FE3B0",cursor:IS_NEW_REGION?"default":"pointer"}}>
              <span aria-hidden="true">✅</span>
              <span>{_t(lang,`${__REL.cleanPct}% de nos prévisions « mer propre » vérifiées · ${reg}`,`${__REL.cleanPct}% of our “clean water” forecasts verified · ${reg}`,`${__REL.cleanPct}% de nuestros pronósticos “agua limpia” verificados · ${reg}`)}{!IS_NEW_REGION&&<span style={{opacity:.65}}>  →</span>}</span>
            </a>
          })()}
          <p style={{fontSize:15,color:PAY_CAPTURE_ONLY?"#4a4636":"rgba(255,255,255,.6)",margin:"0 0 22px 0",lineHeight:1.5}}>
            {onPay
              ?_t(lang,"Reçois le brief par email — gratuit. Ou débloque tout de suite par carte.","Get the brief by email — free. Or unlock everything now by card.","Recibe el informe por email — gratis. O desbloquéalo ya con tarjeta.")
              :_t(lang,"Reçois le brief par email — gratuit, sans carte.","Get the brief by email — free, no card.","Recibe el informe por email — gratis, sin tarjeta.")}
          </p>

          <form onSubmit={submit} style={{width:"100%",position:"relative",marginBottom:16}}>
            <input type="email" inputMode="email" autoComplete="email"
              placeholder={_t(lang,"ton@email.com","your@email.com","tu@email.com")}
              value={email} onChange={e=>{setEmail(e.target.value);setErr(false)}}
              style={{width:"100%",boxSizing:"border-box",padding:"16px 64px 16px 20px",borderRadius:999,
                border:`2px solid ${err?"#E8522A":PAY_CAPTURE_ONLY?"#0d0b14":"rgba(255,255,255,.15)"}`,
                fontSize:16,fontFamily:"inherit",background:PAY_CAPTURE_ONLY?"#fff":"rgba(255,255,255,.05)",
                outline:"none",color:PAY_CAPTURE_ONLY?"#0d0b14":"#fff",transition:"border 0.2s ease"}}/>
            <button type="submit" className="sg-paygold" style={{
              position:"absolute",right:6,top:6,bottom:6,
              width:44,borderRadius:999,border:PAY_CAPTURE_ONLY?"2px solid #0d0b14":"none",cursor:"pointer",
              background:PAY_CAPTURE_ONLY?"#ffd23f":"linear-gradient(135deg,#3fd07f,#5b3a8e)",
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:PAY_CAPTURE_ONLY?"2px 2px 0 #0d0b14":"0 2px 10px rgba(59,167,160,.4)"}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#061210" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </form>

          <div style={{fontSize:12,color:PAY_CAPTURE_ONLY?"#6b6658":"rgba(255,255,255,.4)",display:"flex",alignItems:"center",gap:6,marginBottom:16}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            {_t(lang,"Sans spam. Désinscription en 1 clic.","No spam. 1-click unsubscribe.","Sin spam. Baja en 1 clic.")}
          </div>

          {onPay&&(<>
          <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",margin:"2px 0 14px",color:"rgba(255,255,255,.3)",fontSize:11,fontWeight:700,letterSpacing:".1em"}}>
            <div style={{flex:1,height:1,background:"rgba(255,255,255,.12)"}}/>{_t(lang,"OU","OR","O")}<div style={{flex:1,height:1,background:"rgba(255,255,255,.12)"}}/>
          </div>
          <button type="button" onClick={onPay} className="gbtn" style={{width:"100%",padding:"13px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:14.5,marginBottom:7}}>
            {_t(lang,`Débloquer tout par carte — ${PRICE_MO}/mois`,`Unlock everything by card — ${PRICE_MO}/mo`,`Desbloquéalo todo con tarjeta — ${PRICE_MO}/mes`)}
          </button>
          <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:14,lineHeight:1.35}}>
            {_t(lang,"Alertes + reco du jour + prévision 7 jours · accès immédiat · annule en 2 clics","Alerts + daily pick + 7-day forecast · instant access · cancel in 2 clicks","Alertas + playa del día + pronóstico 7 días · acceso inmediato · cancela en 2 clics")}
          </div>
          </>)}
          
          <div style={{textAlign:"center", width:"100%"}}>
            <button type="button" onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
              color:PAY_CAPTURE_ONLY?"#6b6658":"rgba(255,255,255,.3)",fontSize:12,padding:"8px",fontFamily:"inherit"}}>
              {_t(lang,"Non merci, fermer","No thanks, close","No gracias, cerrar")}
            </button>
          </div>
        </>):(<>
          <div style={{fontSize:48,marginBottom:16}}>✅</div>
          <h3 style={{fontSize:24,color:"#fff",margin:"0 0 10px 0"}}>{_t(lang,"La veille est lancée.","Your watch is on.","La vigilancia empezó.")}</h3>
          <p style={{fontSize:15,color:"rgba(255,255,255,.65)",lineHeight:1.5,margin:"0 0 20px"}}>
            {_t(lang,"On t'envoie le brief sargasses par email — ta meilleure plage, les jours propres, et une alerte si ça se dégrade.","We'll email you the sargassum brief — your best beach, clean days, and an alert if it worsens.","Te enviamos el informe de sargazo por email — tu mejor playa, los días limpios y una alerta si empeora.")}
          </p>
          {onPay&&<button onClick={onPay} style={{background:"none",border:"1px solid rgba(255,255,255,.25)",borderRadius:999,color:"rgba(255,255,255,.8)",fontSize:13,fontWeight:600,padding:"11px 20px",cursor:"pointer",fontFamily:"inherit"}}>
            {_t(lang,"Ou débloque tout maintenant →","Or unlock everything now →","O desbloquéalo todo ahora →")}
          </button>}
        </>)}
      </div>
    </div>
  )
}

// Bande de capture email de SORTIE (A/B exitcap). Data-backed : montre la vraie
// meilleure plage du jour + score (jamais affichée si exitcapPick=null). submitLead
// résilient (sendBeacon). Même langage visuel que le SargaCatch toast (pas d'UI dans l'UI).
function ExitEmailBand({lang,pick,onClose,trigger="exitcap"}){
  const[email,setEmail]=useState("")
  const[done,setDone]=useState(false)
  const submit=e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    s("sg_email",email)
    submitLead(email,"exit_intent")
    track("sg_exitcap_submit",{trigger,beach_id:pick&&pick.id,score:pick&&pick.score})
    setDone(true)
  }
  return(
    <div style={{pointerEvents:"auto",display:"flex",alignItems:"center",gap:10,
      background:"rgba(10,23,20,.96)",border:"1px solid rgba(255,199,44,.45)",borderRadius:16,
      padding:"11px 14px",maxWidth:400,boxShadow:"0 8px 24px rgba(0,0,0,.5)",
      animation:"slideUp .35s cubic-bezier(.22,1,.36,1)"}}>
      {done?(
        <div style={{flex:1,fontSize:12.5,fontWeight:700,color:C.green,textAlign:"center",padding:"3px 0"}}>
          <span style={{fontSize:18,marginRight:6}}>✅</span>
          {_t(lang,"C'est noté — Le Veilleur t'écrit demain matin : le verdict de ta plage, mesuré au satellite cette nuit.","Done — the Watchman writes tomorrow morning: your beach's verdict, measured by satellite overnight.","Listo — el Vigía te escribe mañana: el veredicto de tu playa, medido por satélite esta noche.")}
        </div>
      ):(<>
        <span style={{width:9,height:9,borderRadius:5,background:C.green,flexShrink:0,boxShadow:"0 0 8px "+C.green,marginTop:3,alignSelf:"flex-start"}}/>
        <form onSubmit={submit} style={{flex:1,display:"flex",flexDirection:"column",gap:7,minWidth:0}}>
          <div style={{fontSize:12.5,color:"#fff",lineHeight:1.3}}>
            <b>{pick&&pick.name}</b>{pick&&pick.score!=null&&<span style={{color:C.green}}> · {pick.score}/100</span>}<br/>
            <span style={{color:"rgba(255,255,255,.65)"}}>{_t(lang,"Reçois la prévision de demain matin par email.","Get tomorrow morning's forecast by email.","Recibe el pronóstico de mañana por email.")}</span>
          </div>
          <div style={{display:"flex",gap:7}}>
            <input type="email" inputMode="email" autoComplete="email" placeholder={_t(lang,"ton@email.com","your@email.com","tu@email.com")}
              value={email} onChange={e=>setEmail(e.target.value)}
              style={{flex:1,padding:"9px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.14)",
                fontSize:16,fontFamily:"inherit",background:"rgba(255,255,255,.07)",outline:"none",minWidth:0,color:"#fff"}}/>
            <button type="submit" style={{padding:"9px 13px",borderRadius:10,border:"none",cursor:"pointer",
              background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",color:C.ink,fontSize:12.5,fontWeight:800,whiteSpace:"nowrap",fontFamily:"inherit"}}>
              {_t(lang,"Recevoir →","Get it →","Recibir →")}
            </button>
          </div>
        </form>
        <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
          style={{background:"none",border:"none",color:"rgba(255,255,255,.8)",fontSize:20,lineHeight:1,cursor:"pointer",
            padding:0,alignSelf:"flex-start",width:32,height:32,flexShrink:0}}>×</button>
      </>)}
    </div>
  )
}

// Glyphe canonique du Veilleur (œil-satellite golden-hour, porté de VeilleurHero en JSX) —
// défs préfixées evc* pour éviter toute collision si VeilleurHero est monté.
function VeilleurGlyph(){
  // BIBLE : boîtier scene-ink, capteur TEAL, balise OR, regard mi-clos vers la MER (bas),
  // jamais l'utilisateur. Faisceau de veille descendant = désigne le CTA. Aucun violet.
  return(
    <svg viewBox="-96 -106 192 184" width="112" height="107" style={{display:"block"}} aria-hidden="true">
      <defs>
        <radialGradient id="evcHalo" cx="50%" cy="44%" r="55%">
          <stop offset="0" stopColor="#1EC8B0" stopOpacity=".55"/><stop offset=".6" stopColor="#009E8E" stopOpacity=".16"/><stop offset="1" stopColor="#009E8E" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="evcIris" cx="42%" cy="34%" r="74%">
          <stop offset="0" stopColor="#aaffe0"/><stop offset=".5" stopColor="#1EC8B0"/><stop offset="1" stopColor="#0A6F63"/>
        </radialGradient>
        <linearGradient id="evcBeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE47A" stopOpacity=".5"/><stop offset="1" stopColor="#FFE47A" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <circle r="84" fill="url(#evcHalo)"/>
      {/* faisceau de veille descendant vers la mer / le CTA */}
      <path d="M-15 30 L15 30 L42 86 L-42 86 Z" fill="url(#evcBeam)"/>
      <g stroke="#0A1714" strokeWidth="6.5" strokeLinejoin="round" strokeLinecap="round">
        {/* panneaux solaires */}
        <rect x="-78" y="-14" width="26" height="34" rx="5" fill="#009E8E" transform="rotate(-10 -65 3)"/>
        <rect x="52" y="-14" width="26" height="34" rx="5" fill="#0A6F63" transform="rotate(10 65 3)"/>
        <line x1="-52" y1="3" x2="-34" y2="3"/><line x1="52" y1="3" x2="34" y2="3"/>
        {/* corps */}
        <ellipse cx="0" cy="2" rx="38" ry="36" fill="#FDFCF7"/>
      </g>
      {/* capteur/lentille teal, tourné vers la mer (regard mi-clos, serein) */}
      <circle cx="0" cy="6" r="19" fill="url(#evcIris)" stroke="#0D0D0D" strokeWidth="5.5"/>
      <path d="M-12 6 a12 10 0 0 1 24 0" fill="none" stroke="#0A1714" strokeWidth="4.5" strokeLinecap="round"/>
      <circle cx="6" cy="2" r="4" fill="#EAFFF8"/>
      {/* antenne + balise OR */}
      <path d="M0 -34 q8 -18 -3 -32" stroke="#0D0D0D" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <circle cx="-3" cy="-70" r="10" fill="#FFC72C" stroke="#0D0D0D" strokeWidth="4"/>
    </svg>
  )
}

// Pop-up d'INTENTION DE SORTIE « Ta semaine est prête » (A/B exit_veilleur, variant).
// Le Veilleur tend au partant son calendrier 7 jours : AUJ+DEM = vraies pastilles de
// statut (preuve), 5 jours verrouillés → l'email les ouvre + brief 7h + alerte J-1.
// Données RÉELLES (forecast = sargData.weekly[sargId].forecast). Cadenas = protège de
// vrais services existants, JAMAIS de fausse rareté. onClose(reason) : "dismiss" = snooze.
function ExitVeilleurCard({lang,pick,forecast,onClose,trigger="exit"}){
  const[email,setEmail]=useState("")
  const[done,setDone]=useState(false)
  // Swipe down pour fermer (guardInput : ne ferme pas si le champ email est focus).
  const sw=useSwipeClose(()=>onClose&&onClose("dismiss"),{guardInput:true,threshold:70})
  const INK="#0D0D0D"
  // BIBLE : purge pirates — clean #22C55E, modéré #B87A00 (jamais l'or), avoid #E8522A.
  const STC={clean:"#22C55E",moderate:"#B87A00",avoid:"#E8522A"}
  const now=new Date()
  const WD=lang==="en"?["SUN","MON","TUE","WED","THU","FRI","SAT"]:lang==="es"?["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"]:["DIM","LUN","MAR","MER","JEU","VEN","SAM"]
  const dayLabel=i=>i===0?_t(lang,"AUJ","TODAY","HOY"):i===1?_t(lang,"DEM","TMRW","MAÑ"):WD[new Date(now.getFullYear(),now.getMonth(),now.getDate()+i).getDay()]
  const dateNum=i=>new Date(now.getFullYear(),now.getMonth(),now.getDate()+i).getDate()
  const statusAt=i=>i===0?((forecast&&forecast[0])||(pick&&pick.status)):(forecast&&forecast[i])||null
  const submit=e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    s("sg_email",email)
    submitLead(email,"exit_intent")
    track("sg_exitcap_submit",{trigger,beach_id:pick&&pick.id,score:pick&&pick.score,variant:"veilleur"})
    setDone(true)
    setTimeout(()=>{try{onClose&&onClose("submitted")}catch(_){}}, 2300)
  }
  const hl={background:"#FFC72C",borderRadius:6,padding:"0 .12em"}
  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose&&onClose("dismiss")}}
      style={{position:"fixed",inset:0,zIndex:1098,display:"flex",alignItems:"center",justifyContent:"center",padding:16,
        background:"radial-gradient(135% 105% at 50% 12%, rgba(13,30,28,.42), rgba(13,30,28,.62) 70%)",
        animation:"fadeIn .2s ease both"}}>
      <div style={{position:"relative",width:430,maxWidth:"96%"}}>
        <div aria-hidden="true" style={{position:"absolute",top:-72,left:"50%",transform:"translateX(-50%)",zIndex:0,width:112,pointerEvents:"none"}}>
          <VeilleurGlyph/>
        </div>
        <div ref={sw.ref} onTouchStart={sw.onTouchStart} onTouchMove={sw.onTouchMove} onTouchEnd={sw.onTouchEnd}
          style={{position:"relative",zIndex:1,background:"#FDFCF7",border:"2.6px solid "+INK,borderRadius:20,
          boxShadow:"6px 6px 0 "+INK,padding:"46px 22px 18px",overflow:"hidden",
          animation:"slideUp .38s cubic-bezier(.34,1.56,.64,1) both"}}>
          <div aria-hidden="true" style={{position:"absolute",top:0,left:0,right:0,height:12,background:"linear-gradient(90deg,#155A5A,#C97E3A 55%,#F2B05E)"}}/>
          <div aria-hidden="true" style={{position:"absolute",top:20,left:"50%",transform:"translateX(-50%)",width:42,height:5,borderRadius:3,background:"rgba(13,13,13,.18)"}}/>
          <button onClick={()=>onClose&&onClose("dismiss")} aria-label={_t(lang,"Fermer","Close","Cerrar")}
            style={{position:"absolute",top:14,right:14,width:26,height:26,borderRadius:"50%",border:"2px solid "+INK,background:"#FDFCF7",color:INK,cursor:"pointer",fontSize:15,lineHeight:1,padding:0}}>×</button>
          {done?(
            <div style={{textAlign:"center",padding:"6px 0"}}>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:13}}>
                {[0,1,2,3,4,5,6].map(i=>(
                  <div key={i} style={{width:30,height:30,borderRadius:8,border:"2px solid "+INK,boxShadow:"2px 2px 0 "+INK,background:STC[statusAt(i)]||"#CFC4A6"}}/>
                ))}
              </div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:23,color:INK,textTransform:"uppercase",lineHeight:1,marginBottom:6}}>
                {_t(lang,"C'est verrouillé. Je veille.","Locked in. I'm watching.","Listo. Yo vigilo.")}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:13.5,color:"#3a2f1a"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={STC.clean} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}>
                  <circle cx="12" cy="12" r="9" stroke={INK} strokeWidth="2.2"/><path d="M8 12.5l2.5 2.5L16 9.5"/>
                </svg>
                <span>{_t(lang,"Demain 7h, le bon plan arrive.","Tomorrow 7am, your plan lands.","Mañana 7h llega tu plan.")}</span>
              </div>
            </div>
          ):(<>
            <div style={{display:"inline-block",background:INK,color:"#FDFCF7",fontFamily:"'Bricolage Grotesque',sans-serif",fontWeight:700,fontSize:11,letterSpacing:".08em",textTransform:"uppercase",padding:"4px 11px",borderRadius:7,marginBottom:11}}>
              {_t(lang,"Le Veilleur a préparé ta semaine","The Watcher prepped your week","El Vigía preparó tu semana")}
            </div>
            <div style={{fontFamily:"'Anton',sans-serif",color:INK,fontSize:28,lineHeight:.94,letterSpacing:"-.015em",textTransform:"uppercase",marginBottom:13}}>
              {_t(lang,<>Ta <span style={hl}>semaine</span> de plages propres est prête.</>,<>Your <span style={hl}>week</span> of clean beaches is ready.</>,<>Tu <span style={hl}>semana</span> de playas limpias está lista.</>)}
            </div>
            {pick&&pick.score!=null&&(
              <div style={{display:"flex",alignItems:"center",gap:9,background:"#fff",border:"1.6px solid "+INK,borderRadius:11,padding:"8px 11px",marginBottom:13}}>
                <span style={{width:11,height:11,borderRadius:"50%",background:STC[pick.status]||"#9aa0a8",border:"1.5px solid "+INK,flexShrink:0}}/>
                <span style={{flex:1,fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:13,color:"#3a2f1a",lineHeight:1.2,minWidth:0}}>
                  {_t(lang,"Aujourd'hui la plus propre","Today's cleanest","La más limpia hoy")} : <b>{pick.name}</b>
                </span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:16,color:STC[pick.status]||INK,whiteSpace:"nowrap"}}>{pick.score}<span style={{fontSize:10,color:"#6b6478"}}>/100</span></span>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:7}}>
              {[0,1,2,3,4,5,6].map(i=>{
                const unlocked=i<=1
                const c=unlocked?(STC[statusAt(i)]||"#9aa0a8"):"#CFC4A6"
                return(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,color:unlocked?INK:"#9a8f7a",marginBottom:3}}>{dayLabel(i)}</div>
                    <div style={{height:38,borderRadius:9,border:"2px solid "+INK,boxShadow:unlocked?"2px 2px 0 "+INK:"none",background:c,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {unlocked?<span style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"#0D0D0D",textShadow:"0 1px 0 rgba(255,255,255,.55)"}}>{dateNum(i)}</span>:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b5f3f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0"/></svg>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:11.5,color:"#6b6478",marginBottom:12}}>
              {_t(lang,"5 jours déverrouillés par e-mail · confiance affichée honnêtement","5 days unlocked by email · confidence shown honestly","5 días por email · confianza mostrada con honestidad")}
            </div>
            <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:14,color:"#3a2f1a",lineHeight:1.35,marginBottom:12}}>
              {_t(lang,<>Demain ce sera peut-être une <b>autre</b> plage. Reçois le bon plan chaque matin à <b style={{...hl,color:"#0D0D0D"}}>7h</b>.</>,<>Tomorrow it may be a <b>different</b> beach. Get the plan every morning at <b style={{...hl,color:"#0D0D0D"}}>7am</b>.</>,<>Mañana quizá sea <b>otra</b> playa. Recibe el plan cada mañana a las <b style={{...hl,color:"#0D0D0D"}}>7h</b>.</>)}
            </div>
            <form onSubmit={submit}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"2px solid "+INK,borderRadius:12,padding:"3px 4px 3px 12px",marginBottom:10}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A5A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}>
                  <rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 7l9 6 9-6"/>
                </svg>
                <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder={_t(lang,"ton@email.com","your@email.com","tu@email.com")}
                  style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:16,color:INK,padding:"9px 0"}}/>
              </div>
              <button type="submit" className="sg-paygold" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                background:"linear-gradient(158deg,#FFE47A,#FFC72C 40%,#E89400)",color:"#1a1300",border:"2.4px solid "+INK,borderRadius:100,
                boxShadow:"5px 5px 0 "+INK,fontFamily:"'Anton',sans-serif",fontSize:17,textTransform:"uppercase",padding:"12px 18px",cursor:"pointer"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1300" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}>
                  <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.5"/>
                </svg>
                {_t(lang,"Déverrouille ma semaine","Unlock my week","Desbloquea mi semana")}
              </button>
            </form>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:11.5,color:"#6b6478",marginTop:11}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b6478" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}>
                <path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>
              </svg>
              <span>{_t(lang,"Alerte la veille · 1 brief/matin à 7h · stop quand tu veux","Day-before alert · 1 brief each morning at 7am · stop anytime","Aviso la víspera · 1 brief cada mañana a las 7h · cancela cuando quieras")}</span>
            </div>
            <div style={{textAlign:"center",marginTop:9}}>
              <button onClick={()=>onClose&&onClose("dismiss")} style={{background:"none",border:"none",fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:12,color:"#9a8f7a",textDecoration:"underline",textUnderlineOffset:2,cursor:"pointer"}}>
                {_t(lang,"Non merci, je pars sans","No thanks, I'll leave without it","No gracias, me voy sin él")}
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

function InlineEmailCapture({lang,beachName,source="inline_beach"}){
  const[email,setEmail]=useState("")
  const[submitted,setSubmitted]=useState(false)
  const[dismissed,setDismissed]=useState(false)
  const tracked=useRef(false)
  // Show from first visit (was visit 2+). Already subscribed → hide définitivement
  // (sg_email_prompt, posé au submit). "Plus tard" → snooze 14j (sg_email_snooze),
  // pas un kill perma. Le garde NE masque PAS quand submitted : sinon l'état succès
  // (timeline em2) ne rendait jamais — handleSubmit pose sg_email_prompt avant le
  // re-render, ce qui court-circuitait la confirmation au tout premier render post-submit.
  if(!submitted&&(dismissed||g("sg_email_prompt",false)||g("sg_email_snooze",0)>Date.now()))return null
  // em1 test: control (loss-frame "know before you go") vs curiosity ("where's the best beach today?")
  const em1V=abVariant("em1",["control","curiosity"],[.5,.5])
  // em2 test (capture = levier #1 funnel, mesuré 0,35%) : control vs "progressive" —
  // vend le déblocage de valeur GRATUITE jour après jour (drip réel : confirmation →
  // plages propres J+3 → récap hebdo + alerte). État de succès multi-étapes ("plein de
  // state") qui matérialise la progression. Copy honnête (jamais plus que ce que le drip envoie).
  const em2V=abVariant("em2",["control","progressive"],[.4,.6])
  if(!tracked.current){tracked.current=true;track("sg_smart_email_trigger",{visit_count:g("sg_visit_count",0)});track("sg_email_view")}

  const handleSubmit=e=>{
    e.preventDefault()
    if(!email||!email.includes("@"))return
    track("sg_email_submit",{source,variant:em1V})
    s("sg_email",email)
    s("sg_email_prompt",true)
    setSubmitted(true)
    submitLead(email,source)
  }

  if(submitted&&em2V==="progressive"){
    // "Plein de state" : on matérialise la veille gratuite qui se déroule jour après
    // jour. Chaque ligne = un envoi RÉEL du drip (pas de promesse fictive).
    const watch=beachName||_t(lang,"ta plage","your beach","tu playa")
    const steps=[
      {d:_t(lang,"Maintenant","Now","Ahora"), t:_t(lang,`On commence à veiller ${watch}.`,`We start watching ${watch}.`,`Empezamos a vigilar ${watch}.`)},
      {d:_t(lang,"Dans 3 jours","In 3 days","En 3 días"), t:_t(lang,"Les plages propres de la semaine, par email.","This week's clean beaches, by email.","Las playas limpias de la semana, por email.")},
      {d:_t(lang,"Chaque semaine","Every week","Cada semana"), t:_t(lang,"Ton récap + une alerte si ça se dégrade.","Your recap + an alert if it worsens.","Tu resumen + una alerta si empeora.")},
    ]
    return(
      <div style={{margin:"0 0 12px",padding:"16px",borderRadius:16,
        background:"linear-gradient(135deg,#190c2c,#142824)",border:"1px solid rgba(255,199,44,.18)"}}>
        <div style={{fontSize:13.5,fontWeight:800,color:C.green,marginBottom:12,display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:18}}>✅</span>{_t(lang,"La veille est lancée.","Your watch is on.","La vigilancia empezó.")}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {steps.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:11,alignItems:"flex-start",paddingBottom:i<steps.length-1?12:0}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                <div style={{width:11,height:11,borderRadius:6,marginTop:2,
                  background:i===0?"linear-gradient(180deg,#FFE47A,#E8A800)":"rgba(255,255,255,.18)"}}/>
                {i<steps.length-1&&<div style={{width:2,flex:1,minHeight:18,background:"rgba(255,255,255,.12)",marginTop:3}}/>}
              </div>
              <div style={{paddingTop:0}}>
                <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:i===0?"#FFC72C":"rgba(255,255,255,.4)"}}>{s.d}</div>
                <div style={{fontSize:12.5,color:"rgba(255,255,255,.8)",lineHeight:1.4,marginTop:1}}>{s.t}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if(submitted)return(
    <div style={{margin:"0 0 12px",padding:"14px 16px",borderRadius:16,
      background:"linear-gradient(135deg,#190c2c,#142824)",
      textAlign:"center",fontSize:13,fontWeight:600,color:C.green}}>
      <span style={{fontSize:20,display:"block",marginBottom:4}}>✅</span>
      {_t(lang,"C'est fait ! Premier email dans 3 jours.","You're in! First email in 3 days.","¡Listo! Primer email en 3 días.")}
    </div>
  )

  if(em2V==="progressive"){
    const chips=[
      _t(lang,"Auj. : c'est lancé","Today: it's on","Hoy: ya está"),
      _t(lang,"J+3 : plages propres","Day 3: clean beaches","Día 3: playas limpias"),
      _t(lang,"Hebdo : récap + alerte","Weekly: recap + alert","Semanal: resumen + alerta"),
    ]
    return(
      <div style={{margin:"0 0 12px",padding:"15px 16px",borderRadius:16,
        background:"linear-gradient(135deg,#190c2c,#142824)",
        border:"1px solid rgba(255,199,44,.2)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-60%",right:"-15%",width:"55%",height:"220%",
          background:"radial-gradient(ellipse,rgba(255,199,44,.08) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:10,fontWeight:800,color:"#FFC72C",textTransform:"uppercase",letterSpacing:".09em",marginBottom:6}}>
            {_t(lang,"Gratuit · sans carte","Free · no card","Gratis · sin tarjeta")}
          </div>
          <div style={{fontSize:14.5,fontWeight:800,color:"#fff",marginBottom:4,lineHeight:1.25}}>
            {beachName
              ?_t(lang,`Fais veiller ${beachName} pour toi`,`Have ${beachName} watched for you`,`Haz que vigilen ${beachName} por ti`)
              :_t(lang,"Fais veiller ta plage pour toi","Have your beach watched for you","Haz que vigilen tu playa por ti")}
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginBottom:11,lineHeight:1.4}}>
            {_t(lang,"La veille démarre tout de suite, et la valeur arrive jour après jour.",
                    "The watch starts now, and value lands day after day.",
                    "La vigilancia empieza ya, y el valor llega día tras día.")}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
            {chips.map((c,i)=>(
              <span key={i} style={{fontSize:10.5,fontWeight:700,color:"rgba(255,255,255,.75)",
                background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                borderRadius:8,padding:"4px 9px"}}>{c}</span>
            ))}
          </div>
          <form onSubmit={handleSubmit} style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="email" inputMode="email" autoComplete="email" placeholder={_t(lang,"ton@email.com","your@email.com","tu@email.com")}
              value={email} onChange={e=>setEmail(e.target.value)}
              style={{flex:1,padding:"10px 14px",borderRadius:12,border:"1px solid rgba(255,255,255,.12)",
                fontSize:16,fontFamily:"inherit",background:"rgba(255,255,255,.06)",outline:"none",minWidth:0,color:"#fff"}}/>
            <button type="submit" style={{padding:"10px 16px",borderRadius:12,border:"none",cursor:"pointer",
              background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",color:C.ink,fontSize:13,fontWeight:800,
              whiteSpace:"nowrap",fontFamily:"inherit",boxShadow:"0 2px 12px rgba(232,168,0,.3)"}}>
              {_t(lang,"Commencer →","Start →","Empezar →")}
            </button>
          </form>
          <button onClick={()=>{setDismissed(true);s("sg_email_snooze",Date.now()+12096e5);track("sg_email_dismiss")}} style={{
            display:"block",margin:"8px auto 0",background:"none",border:"none",cursor:"pointer",
            color:"rgba(255,255,255,.3)",fontSize:11,padding:0}}>
            {_t(lang,"Plus tard","Not now","Ahora no")}
          </button>
        </div>
      </div>
    )
  }
  return(
    <div style={{margin:"0 0 12px",padding:"14px 16px",borderRadius:16,
      background:"linear-gradient(135deg,#190c2c,#142824)",
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
        <button onClick={()=>{setDismissed(true);s("sg_email_snooze",Date.now()+12096e5);track("sg_email_dismiss")}} style={{
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
  const mountedRef=useRef(true)
  useEffect(()=>()=>{mountedRef.current=false},[]) // garde anti setState-après-unmount

  useEffect(()=>{
    if(g("sg_feedback_done",false))return
    const visits=g("sg_visits",0)+1
    s("sg_visits",visits)
    if(visits<3)return
    const t=setTimeout(()=>{if(mountedRef.current)setVisible(true)},30000) // 30s after 3rd visit
    return ()=>clearTimeout(t) // sinon le timer fire sur un composant démonté
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
    setTimeout(()=>{if(mountedRef.current)setVisible(false)},2000)
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
              padding:"8px 10px",fontSize:16,fontFamily:"inherit",resize:"none",
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
          <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:2}}>
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
    // « Pas d'un coup, au bon moment » (philosophie molo, directive fondateur) : on ne
    // montre PLUS le prompt à froid. Le chemin principal = 2 plages vues (engagement).
    // Le fallback (1 plage vue mini) ne se déclenche qu'à 45s — jamais au load nu.
    const fallback=setTimeout(()=>{
      if(visible)return
      const seen=parseInt(sessionStorage.getItem("sg_beach_views")||"0")
      if(seen>=1)showPrompt(isIos?"ios-engaged":"android-fallback")
    },45000)
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
            padding:"28px 24px 40px",maxHeight:"70vh",overflowX:"hidden",overflowY:"auto",
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
      "Premium, c'est ton veilleur personnel : la plage recommandée chaque matin dans ta boîte, une alerte si TA plage change, et la prévision 7 jours plage par plage. "+(PAY_CAPTURE_ONLY?"En ce moment c'est offert 7 jours, juste ton email.":"Annulable en 2 clics."),
      "Premium is your personal watchman: the recommended beach in your inbox every morning, an alert when YOUR beach changes, and the 7-day forecast beach by beach. "+(PAY_CAPTURE_ONLY?"Right now it's 7 days on us, just your email.":"Cancel in 2 clicks."),
      "Premium es tu vigía personal: la playa recomendada cada mañana en tu correo, una alerta si TU playa cambia, y el pronóstico de 7 días playa por playa. "+(PAY_CAPTURE_ONLY?"Ahora son 7 días gratis, solo tu email.":"Cancela en 2 clics.")),
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
    <div role="dialog" aria-modal="true" aria-label="Assistant" style={{position:"fixed",right:0,bottom:0,left:0,zIndex:1090,display:"flex",justifyContent:"flex-end",pointerEvents:"none"}}>
      <div className="sg-onink-scope" style={{pointerEvents:"auto",width:"100%",maxWidth:420,margin:"0 10px calc(10px + env(safe-area-inset-bottom))",
        background:"#120821",border:"1px solid rgba(255,255,255,.12)",borderRadius:20,overflow:"hidden",
        boxShadow:"0 18px 60px rgba(0,0,0,.55)",display:"flex",flexDirection:"column",maxHeight:"min(72vh,560px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",
          borderBottom:"1px solid rgba(255,255,255,.10)"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
            {/* Le Veilleur miniature (satellite, seul personnage) — humeur calme teal, veille la mer */}
            <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true" style={{flexShrink:0,display:"block"}}>
              <g transform="translate(32,33)">
                <circle r="20" fill="#009E8E" opacity=".18"/>
                <rect x="-26" y="-5" width="12" height="11" rx="2.5" fill="#0A1714"/>
                <rect x="14" y="-5" width="12" height="11" rx="2.5" fill="#0A1714"/>
                <rect x="-11" y="-11" width="22" height="22" rx="6" fill="#0A1714"/>
                <rect x="-11" y="-11" width="22" height="6" rx="6" fill="#1EC8B0"/>
                <line x1="0" y1="-11" x2="0" y2="-18" stroke="#009E8E" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="0" cy="-19" r="2" fill="#009E8E"/>
                <circle cx="0" cy="2" r="5" fill="#07201E"/>
                <circle cx="0" cy="2" r="3.4" fill="#1EC8B0"/>
                <circle cx="-1.3" cy=".6" r="1.2" fill="#EAFBF8"/>
              </g>
            </svg>
            <div style={{minWidth:0}}>
              <strong style={{fontSize:13.5,color:"#fff",lineHeight:1.2,display:"block"}}>{t("Le Veilleur","The Watchman","El Vigía")}</strong>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:2,fontSize:10.5,fontWeight:800,letterSpacing:".04em",color:"#1EC8B0",textTransform:"uppercase"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#009E8E"}}/>{t("En direct","Live","En vivo")}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{background:"none",border:"none",color:"rgba(255,255,255,.6)",
            fontSize:18,cursor:"pointer",padding:4}}>✕</button>
        </div>
        <div ref={bodyRef} style={{overflowY:"auto",overflowX:"hidden",padding:"14px 12px",display:"flex",flexDirection:"column",gap:10}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{alignSelf:m.who==="me"?"flex-end":"flex-start",maxWidth:"86%",
              background:m.who==="me"?"#FFC72C":"rgba(255,255,255,.07)",color:m.who==="me"?"#120821":"#fff",
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
        style={{flex:1,minWidth:0,padding:"11px 13px",borderRadius:14,fontSize:16,fontFamily:"inherit",
          border:"1px solid var(--sg-line,rgba(0,0,0,.15))",background:"var(--sg-card,#fff)",color:"var(--sg-ink,#1A2B26)"}}/>
      <button type="submit" style={{flexShrink:0,background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",
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
      background:"linear-gradient(180deg,#0C1D21 0%,#120821 100%)"}}>
      <svg viewBox="0 0 560 300" style={{display:"block",width:"100%",height:"auto"}}>
        <style>{`
.sgms-sat{animation:sgmsOrbit 26s linear 1 both}
@keyframes sgmsOrbit{from{transform:translateX(-90px)}to{transform:translateX(650px)}}
.sgms-beam{animation:sgmsBeam 3.2s ease-in-out 1 both}
@keyframes sgmsBeam{0%,100%{opacity:.07}50%{opacity:.2}}
.sgms-w1{animation:sgmsDrift 13s linear 1 both}
.sgms-w2{animation:sgmsDrift 21s linear 1 both reverse}
@keyframes sgmsDrift{from{transform:translateX(0)}to{transform:translateX(-560px)}}
.sgms-raft1{animation:sgmsRaft 38s linear 1 both}
.sgms-raft2{animation:sgmsRaft 52s linear 1 both;animation-delay:-26s}
@keyframes sgmsRaft{from{transform:translateX(620px)}to{transform:translateX(-160px)}}
.sgms-boat{animation:sgmsBob 4.2s ease-in-out 1 both}
@keyframes sgmsBob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(3.5px) rotate(-1.2deg)}}
.sgms-palm{animation:sgmsSway 5.5s ease-in-out 1 both;transform-origin:468px 218px}
@keyframes sgmsSway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.8deg)}}
.sgms-rake{animation:sgmsRake 1.9s ease-in-out 1 both;transform-origin:402px 232px}
@keyframes sgmsRake{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(7deg)}}
.sgms-ping{animation:sgmsPing 2.6s ease-out 1 both;transform-origin:497px 96px}
@keyframes sgmsPing{0%{transform:scale(.4);opacity:.8}70%,100%{transform:scale(1.8);opacity:0}}
.sgms-link{stroke-dasharray:3 5;animation:sgmsFlow 1.4s linear 1 both}
@keyframes sgmsFlow{from{stroke-dashoffset:16}to{stroke-dashoffset:0}}
.sgms-echo1{animation:sgmsEcho 2.4s ease-out 1 both;transform-origin:316px 214px}
.sgms-echo2{animation:sgmsEcho 2.4s ease-out 1 both;animation-delay:1.2s;transform-origin:316px 214px}
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
            <rect x="-26" y="-3" width="14" height="6" rx="1" fill="#5b3a8e"/>
            <rect x="12" y="-3" width="14" height="6" rx="1" fill="#5b3a8e"/>
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
        <circle className="sgms-echo1" cx="316" cy="214" r="9" fill="none" stroke="#5b3a8e" strokeWidth="1.6"/>
        <circle className="sgms-echo2" cx="316" cy="214" r="9" fill="none" stroke="#5b3a8e" strokeWidth="1.3"/>
        <g transform="translate(316,182)">
          <rect x="-29" y="-10" width="58" height="17" rx="8.5" fill="rgba(10,23,20,.88)" stroke="#5b3a8e" strokeWidth="1"/>
          <text x="0" y="3" textAnchor="middle" fontFamily="ui-monospace,monospace" fontSize="9.5" fontWeight="700" fill="#3fd07f">AFAI 0.42</text>
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
          <path d="M487 96 L494 102 L508 89" stroke="#120821" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
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
      background:"linear-gradient(180deg,#0C1D21 0%,#120821 100%)"}}>
      <svg viewBox="0 0 560 240" style={{display:"block",width:"100%",height:"auto"}}>
        <style>{`
.sgas-notif{animation:sgasNotif 9s cubic-bezier(.22,1,.36,1) 1 both}
@keyframes sgasNotif{0%,6%{opacity:0;transform:translateY(14px)}12%,100%{opacity:1;transform:translateY(0)}}
.sgas-raft{animation:sgasRaft 9s linear 1 both}
@keyframes sgasRaft{0%{transform:translateX(46px)}100%{transform:translateX(-30px)}}
.sgas-route{stroke-dasharray:4 6;animation:sgasRoute 9s linear 1 both}
@keyframes sgasRoute{0%,18%{opacity:0}26%,100%{opacity:1}}
.sgas-dot{animation:sgasDot 9s cubic-bezier(.45,.05,.4,1) 1 both}
@keyframes sgasDot{0%,24%{offset-distance:0%;opacity:0}30%{opacity:1}62%,100%{offset-distance:100%;opacity:1}}
.sgas-ok{animation:sgasOk 9s ease-out 1 both;transform-origin:468px 96px}
@keyframes sgasOk{0%,60%{transform:scale(.4);opacity:0}68%{transform:scale(1.25);opacity:1}74%,100%{transform:scale(1);opacity:1}}
.sgas-sun{animation:sgasSun 9s ease-in-out 1 both}
@keyframes sgasSun{0%,8%{transform:translateY(16px);opacity:.4}30%,100%{transform:translateY(0);opacity:.9}}
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
          <path d="M461 96 L466 101 L476 90" stroke="#120821" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
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
        <span style={{width:6,height:6,borderRadius:"50%",background:"#5b3a8e",boxShadow:"0 0 7px #5b3a8e"}}/>
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
  useEffect(()=>{const t=setTimeout(onDone,860);return()=>clearTimeout(t)},[])
  return(
    <div aria-hidden style={{position:"absolute",inset:0,zIndex:1095,pointerEvents:"none",overflow:"hidden"}}>
      <style>{`
@keyframes sgwScene{0%{opacity:0}18%{opacity:1}80%{opacity:1}100%{opacity:0}}
@keyframes sgwBeam{0%{transform:translateX(-16vw)}100%{transform:translateX(116vw)}}
@keyframes sgwSat{0%{transform:translateY(-22vh) scale(.65);opacity:0}22%{opacity:1}100%{transform:translateY(82vh) scale(1.35);opacity:0}}
@keyframes sgwLab{0%,20%{opacity:0;transform:translateY(8px)}38%,80%{opacity:1;transform:none}100%{opacity:0}}
      `}</style>
      {/* LE PLAN : descente orbite → golden-hour (le monde se révèle, pas un cut sec) */}
      <div style={{position:"absolute",inset:0,animation:"sgwScene .86s ease-out forwards",
        background:"linear-gradient(180deg,#04090B 0%,#120821 24%,#155A5A 56%,#C97E3A 84%,#F2B05E 100%)"}}>
        <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
          {[[80,60],[220,92],[360,50],[540,80],[680,56],[150,150],[470,120],[620,100],[300,180]].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.4" fill="#fff" opacity=".5"/>))}
          <line x1="-40" y1="438" x2="840" y2="438" stroke="#FFD884" strokeWidth="2" strokeDasharray="3 13" opacity=".4"/>
          <line x1="-40" y1="470" x2="840" y2="470" stroke="#FFD884" strokeWidth="1.5" strokeDasharray="2 18" opacity=".25"/>
        </svg>
      </div>
      {/* LE VEILLEUR DESCEND (du satellite à l'eau) — le mouvement de caméra */}
      <div style={{position:"absolute",left:"50%",top:0,marginLeft:-30,animation:"sgwSat .86s cubic-bezier(.4,0,.3,1) forwards"}}>
        <svg width="60" height="60" viewBox="0 0 64 64" style={{display:"block",overflow:"visible"}}>{miVeil(32,32,"#5b3a8e","#3fd07f")}</svg>
      </div>
      {/* faisceau qui balaie */}
      <div style={{position:"absolute",top:0,bottom:0,left:0,width:"13vw",
        animation:"sgwBeam .58s cubic-bezier(.55,.06,.35,1) forwards",
        background:"linear-gradient(90deg,rgba(255,199,44,0) 0%,rgba(255,199,44,.13) 55%,rgba(255,199,44,.8) 97%,#FFC72C 100%)"}}/>
      {/* la légende ENSEIGNE la destination */}
      <div style={{position:"absolute",left:16,right:16,bottom:"16%",textAlign:"center",animation:"sgwLab .86s ease-out forwards"}}>
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
    const scroller=box.closest('[role="dialog"][aria-modal="true"]')
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
        {/* TABLEAU CALME (mandat fondateur) : au repos rien ne clignote. On garde UNIQUEMENT
            la dérive très lente des nuages (mouvement naturel qui repose les yeux). Tout le reste
            (râteau, respiration, poisson, scintillements, vagues-traits, avion, marche) est figé.
            Le poisson et l'élément "arrivée" n'existaient que pendant leur anim → masqués. */}
        <style>{`
.sgh-cloud1{animation:sghDrift 110s ease-in-out infinite alternate}
.sgh-cloud2{animation:sghDrift 150s ease-in-out infinite alternate-reverse}
@keyframes sghDrift{from{transform:translateX(0)}to{transform:translateX(-44px)}}
.sgh-shim{opacity:.5}
.sgh-star{opacity:.5}
.sgh-fish,.sgh-arrive{opacity:0}
@media (prefers-reduced-motion:reduce){.sgh-cloud1,.sgh-cloud2{animation:none}}
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
            <rect x="-26" y="-3" width="15" height="7" rx="1.5" fill="#5b3a8e"/>
            <rect x="11" y="-3" width="15" height="7" rx="1.5" fill="#5b3a8e"/>
            <rect x="-10" y="-9" width="20" height="17" rx="2.5" fill="#5b3a8e"/>
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
              <circle cx="452" cy="334" r="11" fill="none" stroke="#5b3a8e" strokeWidth="1.5"/>
            </g>
            <g className="sgst-ring2" style={{transformBox:"fill-box",transformOrigin:"center"}}>
              <circle cx="452" cy="334" r="11" fill="none" stroke="#5b3a8e" strokeWidth="1.2"/>
            </g>
          </g>
          {/* un banc de sargasse arrive du large — repéré par le satellite (jour + golden) */}
          {t.boat&&<g className="sgh-arrive">
            <g transform="translate(498,328) scale(.62)" opacity=".9"><use href="#sghSarg"/></g>
            <g transform="translate(536,320) scale(.44)" opacity=".7"><use href="#sghSarg"/></g>
            <g className="sgst-ring" style={{transformBox:"fill-box",transformOrigin:"center"}}><circle cx="498" cy="328" r="13" fill="none" stroke="#5b3a8e" strokeWidth="1.4"/></g>
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
            <g transform="translate(414,340)"><g className="sgh-fish"><path d="M-8 0 Q0 -5 8 0 Q0 5 -8 0 Z" fill="#6FD8CC"/><path d="M8 0 l5 -4 0 8 Z" fill="#5b3a8e"/><circle cx="3" cy="-1.4" r=".9" fill="#120821"/></g></g>
            <g transform="translate(356,350) scale(.82)"><g className="sgh-fish" style={{animationDelay:"-2.4s"}}><path d="M-8 0 Q0 -5 8 0 Q0 5 -8 0 Z" fill="#8AE4D8"/><path d="M8 0 l5 -4 0 8 Z" fill="#5b3a8e"/></g></g>
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
            <rect x="320" y="504" width="26" height="8" rx="3" transform="rotate(-6 320 504)" fill="#5b3a8e" opacity=".85"/>
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
      // la sticky n'est pas epinglee) — sinon le storyvp affiche son fond #120821
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
    // capture sur document : on attrape le scroll quel que soit l'élément qui
    // défile (dialog, wrapper interne, window) — sinon sur iOS le listener sur le
    // seul dialog ne se déclenchait pas → upd() jamais rappelé → storyvp vide.
    document.addEventListener("scroll",onScroll,{passive:true,capture:true})
    window.addEventListener("resize",onScroll)
    upd()
    return()=>{document.removeEventListener("scroll",onScroll,{capture:true});window.removeEventListener("resize",onScroll);if(raf)cancelAnimationFrame(raf)}
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
  // Variables d'animation pilotées par l'ÉTAT `beat` (pas des littéraux figés) :
  // au repos / après re-render / si le listener de scroll ne se rattache pas
  // (iOS), l'inline style affiche TOUJOURS le bon temps — jamais le fond #120821
  // nu (bug "scroll mobile vide", screenshot user 14/06). Le rAF lisse les fondus
  // PENDANT le scroll par-dessus (DOM setProperty, hors du style React).
  const sv=on=>on?1:0
  const baseVars=rm
    ?{"--b1":1,"--b2":1,"--b3":1,"--b4":1,"--b5":1,"--b1o":0,"--b2o":0,"--b3o":0,"--b4o":0,"--b5o":1,"--b4s":1}
    :{"--b1":sv(beat>=1),"--b2":sv(beat>=2),"--b3":sv(beat>=3),"--b4":sv(beat>=4),"--b5":sv(beat>=4),
      "--b1o":sv(beat===0),"--b2o":sv(beat===1),"--b3o":sv(beat===2),"--b4o":sv(beat===3),"--b5o":sv(beat>=4),"--b4s":beat>=4?1:.4}
  return(
    <section ref={boxRef} aria-label={T("La méthode","The method","El método")} style={{position:"relative",
      height:rm?"auto":"430vh",...baseVars}}>
      {/* CSS embarquée : ScrollStory est monté dans 2 bras A/B (control ET game).
          La hauteur .sg-storyvp ne vivait QUE dans le <style> du bras control →
          dans le bras game le viewport sticky avait height:0 → scène vide
          (screenshots user 14/06). On rapatrie ici TOUT le CSS requis. */}
      <style>{`.sg-storyvp{height:100vh}@supports(height:100svh){.sg-storyvp{height:100svh}}
.sgst-ring{animation:sgstRing 2.6s ease-out 1 both}.sgst-ring2{animation:sgstRing 2.6s ease-out 1 both;animation-delay:1.3s}
@keyframes sgstRing{0%{transform:scale(.3);opacity:.85}78%,100%{transform:scale(2.3);opacity:0}}
.sgst-bob{animation:sgstBob 3.4s ease-in-out 1 both}@keyframes sgstBob{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
.sg-flow{stroke-dasharray:4 6;animation:sgFlowY 1.2s linear 1 both}@keyframes sgFlowY{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){.sgst-ring,.sgst-ring2,.sgst-bob,.sg-flow{animation:none}}`}</style>
      <div className="sg-storyvp" style={{position:rm?"relative":"sticky",top:0,overflow:"hidden",background:"#120821",
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
              <stop offset="0" stopColor="#120821"/><stop offset="1" stopColor="#143029"/>
            </linearGradient>
          </defs>

          {/* ════ B1 — L'ORBITE : espace, limbe terrestre, le satellite passe ════ */}
          <g style={{opacity:"var(--b1o)"}}>
            <rect width="800" height="600" fill="#04090B"/>
            {[[64,48,1.3,.5],[178,108,.9,.32],[300,52,1.1,.45],[430,128,.8,.3],[558,66,1.4,.5],[688,118,.9,.35],[748,40,1.1,.4],[118,210,.8,.25],[372,224,1,.3],[642,232,.8,.28],[230,160,.7,.22],[506,180,.9,.3]].map((s,i)=>(
              <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} fill="#fff" opacity={s[3]}/>
            ))}
            <circle cx="400" cy="1460" r="1010" fill="#07211D"/>
            <circle cx="400" cy="1460" r="1010" fill="none" stroke="#5b3a8e" strokeWidth="2.5" opacity=".5"/>
            <circle cx="400" cy="1460" r="1022" fill="none" stroke="#5b3a8e" strokeWidth="9" opacity=".1"/>
            {/* trace orbitale */}
            <path d="M40 232 Q400 168 760 232" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.4" strokeDasharray="2 7"/>
            {/* le satellite (gabarit Sentinel-6 : corps or, ailes teal) */}
            <g style={{transform:"translate(calc(610px - var(--b1)*330px),calc(160px + var(--b1)*36px))"}}>
              <polygon className="sgst-beamP" points="-7,12 7,12 34,300 -34,300" fill="url(#sgstBeam)" opacity=".55"/>
              <g className="sgst-ring" style={fb}><circle r="30" fill="none" stroke="#5b3a8e" strokeWidth="1.6"/></g>
              <g className="sgst-ring2" style={fb}><circle r="30" fill="none" stroke="#5b3a8e" strokeWidth="1.3"/></g>
              <rect x="-30" y="-4" width="18" height="9" rx="1.5" fill="#5b3a8e"/>
              <rect x="12" y="-4" width="18" height="9" rx="1.5" fill="#5b3a8e"/>
              <rect x="-13" y="-11" width="26" height="22" rx="3" fill="#5b3a8e"/>
              <rect x="-13" y="-11" width="26" height="7" rx="3" fill="#FFC72C"/>
              <circle cx="0" cy="16" r="3.2" fill="#E8EDF2"/>
            </g>
          </g>

          {/* ════ B2 — LE SCAN : l'océan vu d'en haut, le faisceau balaie, détection ════ */}
          <g style={{opacity:"var(--b2o)"}}>
            <rect width="800" height="600" fill="#06211E"/>
            {/* trame raster satellite */}
            {[80,160,240,320,400,480,520].map((y,i)=>(
              <line key={"h"+i} x1="0" y1={y+40} x2="800" y2={y+40} stroke="#5b3a8e" strokeWidth=".6" opacity=".07"/>
            ))}
            {[100,240,380,520,660].map((x,i)=>(
              <line key={"v"+i} x1={x} y1="0" x2={x} y2="600" stroke="#5b3a8e" strokeWidth=".6" opacity=".07"/>
            ))}
            {/* houle (3 rangées, parallaxe au scroll) */}
            <g style={{transform:"translateX(calc(var(--b2)*-46px))"}} opacity=".3">
              {[120,300,470].map((y,i)=>(
                <path key={i} d={`M-60 ${y} q40 -10 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0`} fill="none" stroke="#5b3a8e" strokeWidth="1.6"/>
              ))}
            </g>
            <g style={{transform:"translateX(calc(var(--b2)*34px))"}} opacity=".18">
              {[200,390,545].map((y,i)=>(
                <path key={i} d={`M-80 ${y} q40 -9 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0`} fill="none" stroke="#3fd07f" strokeWidth="1.3"/>
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
              <g className="sgst-ring" style={fb}><circle cx="430" cy="330" r="13" fill="none" stroke="#5b3a8e" strokeWidth="1.8"/></g>
              <g className="sgst-ring2" style={fb}><circle cx="430" cy="330" r="13" fill="none" stroke="#5b3a8e" strokeWidth="1.4"/></g>
              <line x1="430" y1="296" x2="430" y2="318" stroke="#5b3a8e" strokeWidth="1.4" strokeDasharray="3 4"/>
              <rect x="398" y="270" width="64" height="20" rx="10" fill="rgba(10,23,20,.9)" stroke="#5b3a8e" strokeWidth="1.1"/>
              <text x="430" y="284" textAnchor="middle" fontFamily={mono} fontSize="10.5" fontWeight="700" fill="#3fd07f">AFAI 0.42</text>
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
              <path d="M180 97 h138" stroke="#5b3a8e" strokeWidth="1.6" opacity=".3"/>
            </g>
            <g style={{transform:"translateX(calc(var(--b3)*-50px))"}} opacity=".4">
              <path d="M486 66 q10 -18 34 -18 q14 -11 32 -7 q21 -6 30 9 q18 2 21 16 Z" fill="#16322B"/>
            </g>
            <g opacity=".4" stroke="#3fd07f" strokeWidth="1.8" fill="none" strokeLinecap="round">
              <path d="M250 168 q6 -7 12 0 q6 -7 12 0"/><path d="M298 156 q5 -6 10 0 q5 -6 10 0"/>
            </g>
            {/* le satellite plane au-dessus du banc et le garde dans son faisceau (continuité B1/B2) */}
            <g style={{transform:"translate(calc(96px + var(--b3)*424px),88px)"}}>
              <polygon points="-7,12 7,12 26,232 -26,232" fill="url(#sgstBeam)" opacity=".4"/>
              <g className="sgst-ring" style={fb}><circle r="20" fill="none" stroke="#5b3a8e" strokeWidth="1.4"/></g>
              <rect x="-22" y="-3" width="13" height="7" rx="1.5" fill="#5b3a8e"/>
              <rect x="9" y="-3" width="13" height="7" rx="1.5" fill="#5b3a8e"/>
              <rect x="-10" y="-8" width="20" height="16" rx="2.5" fill="#5b3a8e"/>
              <rect x="-10" y="-8" width="20" height="5" rx="2.5" fill="#FFC72C"/>
            </g>
            {/* mer en coupe */}
            <rect x="0" y="330" width="800" height="270" fill="#0E2E2A"/>
            <path d="M0 330 q50 -8 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" fill="none" stroke="#5b3a8e" strokeWidth="2" opacity=".5"/>
            {/* courant marin : la dérive (flèches → vers la côte, le « comment ça arrive ») */}
            <g opacity=".28" stroke="#3fd07f" strokeWidth="1.6" fill="none" strokeLinecap="round">
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
                <g className="sgst-ring" style={fb}><circle cx="96" cy="318" r="14" fill="none" stroke="#5b3a8e" strokeWidth="1.4"/></g>
              </g>
            </g>
            {/* vent/courant */}
            <g opacity=".35" stroke="#3fd07f" strokeWidth="2" fill="none" strokeLinecap="round">
              <path d="M70 130 q26 -10 52 0 M96 142 q22 -8 44 0"/>
              <path d="M180 100 q24 -9 48 0"/>
            </g>
          </g>

          {/* ════ B4 — LE VERDICT : 06:00, l'alerte tombe, la pastille claque ════ */}
          <g style={{opacity:"var(--b4o)"}}>
            <rect width="800" height="600" fill="#120821"/>
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
              <text x="8" y="7" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="19" fill="#120821" letterSpacing=".02">
                {T("PROPRE","CLEAN","LIMPIA")}</text>
              <path d="M-48 0 l8 8 14 -16" stroke="#120821" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
          </g>

          {/* ════ B5 — LE CHOIX : la carte, l'itinéraire bascule vers la plage propre ════ */}
          <g style={{opacity:"var(--b5o)"}}>
            <rect width="800" height="600" fill="#120821"/>
            {/* côtes stylisées */}
            <path d="M-40 470 Q120 420 240 452 T520 470 T820 440" fill="none" stroke="#5b3a8e" strokeWidth="2" opacity=".22"/>
            <path d="M-40 520 Q200 480 430 510 T820 500" fill="none" stroke="#5b3a8e" strokeWidth="1.4" opacity=".14"/>
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
              <span style={{width:5,height:5,borderRadius:"50%",background:"#5b3a8e",boxShadow:"0 0 6px #5b3a8e"}}/>
              {T("LE VRAI — NASA/JPL","THE REAL ONE — NASA/JPL","EL REAL — NASA/JPL")}
            </span>
          </div>
        </div>

        {/* le récit, temps par temps */}
        {beats.map((b,i)=>(
          <div key={i} aria-hidden={!rm&&beat!==i} style={{position:"absolute",left:"6%",right:"6%",
            bottom:"max(112px,15%)",opacity:`var(${b.o})`,pointerEvents:"none"}}>
            <div style={{fontFamily:mono,fontSize:11,fontWeight:700,letterSpacing:".24em",color:"#5b3a8e",marginBottom:9}}>{b.k}</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,5.6vw,52px)",lineHeight:1.02,
              letterSpacing:".01em",textTransform:"uppercase",color:"#fff",maxWidth:560,
              textShadow:"0 2px 26px rgba(0,0,0,.45)"}}>{b.h}</div>
          </div>
        ))}

        {/* CTA du dernier temps */}
        <div style={{position:"absolute",left:"6%",bottom:"max(38px,5.5%)",opacity:"var(--b5o)",
          pointerEvents:beat===4?"auto":"none"}}>
          <button onClick={onShowMap} className="gbtn" style={{background:"#FFC72C",color:"#120821",border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,padding:"14px 22px",borderRadius:999,
            boxShadow:"0 8px 28px rgba(255,199,44,.3)"}}>
            <BrandIcon name="map" size={15} accent="#120821" style={{verticalAlign:"-2px",marginRight:7,display:"inline-block"}}/>
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
    <div role="dialog" aria-modal="true" aria-label={T("Trouve ta plage","Find your beach","Encuentra tu playa")} style={{position:"absolute",inset:0,zIndex:1050,
      background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",animation:"fadeIn .35s ease-out",
      opacity:exiting?0:1,transform:exiting?"scale(1.04)":"none",
      transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}}>
      <style>{`
.gf-cam{transition:transform .64s cubic-bezier(.34,1.56,.64,1)}
.gf-chip{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),box-shadow .2s ease}
.gf-chip:active{transform:scale(.94)}
.gf-card{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),border-color .2s ease}
.gf-card:active{transform:scale(.975)}
.gf-pulse{animation:gfPulse 2.6s ease-in-out 1 both}
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
.gf-ring{animation:gfRing 6s linear 1 both}
@keyframes gfArrive{0%{transform:translateX(36px)}100%{transform:translateX(-8px)}}
.gf-arrive{animation:gfArrive 5s ease-in-out 1 both alternate}
@keyframes gfArrowDash{to{stroke-dashoffset:-24}}
.gf-arrow{animation:gfArrowDash 1.8s linear 1 both}
@keyframes gfAlertPulse{0%{transform:scale(.5);opacity:.7}100%{transform:scale(2.1);opacity:0}}
.gf-alertpulse{animation:gfAlertPulse 2.2s ease-out 1 both}
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
          ?"linear-gradient(180deg,rgba(5,18,24,.72) 0%,rgba(8,30,40,.4) 36%,rgba(10,23,20,.86) 70%,#120821 100%)"
          :stage==="verdict"
          ?"linear-gradient(180deg,rgba(10,23,20,.45) 0%,rgba(10,23,20,.1) 28%,rgba(10,23,20,.5) 50%,rgba(10,23,20,.9) 76%,#120821 100%)"
          :stage==="alert"
          ?"linear-gradient(180deg,rgba(4,11,22,.86) 0%,rgba(4,11,22,.62) 38%,rgba(6,16,18,.9) 72%,#120821 100%)"
          :stage==="coast"
          ?"linear-gradient(180deg,rgba(10,23,20,.5) 0%,rgba(10,23,20,.22) 24%,rgba(10,23,20,.86) 62%,#120821 100%)"
          :"linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 30%,rgba(10,23,20,.8) 74%,#120821 100%)"}}/>
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
            <rect x="-30" y="-4" width="19" height="8" rx="1.5" fill="#5b3a8e"/>
            <rect x="11" y="-4" width="19" height="8" rx="1.5" fill="#5b3a8e"/>
            <rect x="-12" y="-11" width="24" height="21" rx="3" fill="#5b3a8e"/>
            <rect x="-12" y="-11" width="24" height="7" rx="3" fill="#FFC72C"/>
          </g>
          {/* la ligne de scan balaie la baie */}
          <rect className="gf-scanline" x="-40" width="880" height="3" rx="1.5" fill="#3fd07f"/>
          {/* les pixels de la côte s'allument en cascade (teinte vers le statut) */}
          <g>
            {[...Array(15)].map((_,i)=>{
              const col=i%5,row=Math.floor(i/5)
              const c=["#5b3a8e","#5b3a8e","#FFC72C","#FFC72C","#F59E0B"][col]
              return <rect key={i} className="gf-px" x={326+col*30} y={272+row*30} width="22" height="22" rx="5" fill={c}
                style={{"--d":`${(row*5+col)*55}ms`}}/>
            })}
          </g>
          {/* médaillon-preuve : Sentinel-6 / NASA-JPL / Copernicus */}
          <g className="gf-medal" transform="translate(400,408)">
            <circle r="34" fill="#08251F" stroke="#FFC72C" strokeWidth="2"/>
            <circle r="34" fill="none" stroke="#5b3a8e" strokeWidth="1" strokeDasharray="3 6" opacity=".65"/>
            <g transform="scale(.7)">
              <rect x="-26" y="-3" width="15" height="6" rx="1.2" fill="#5b3a8e"/>
              <rect x="11" y="-3" width="15" height="6" rx="1.2" fill="#5b3a8e"/>
              <rect x="-9" y="-8" width="18" height="15" rx="2" fill="#5b3a8e"/>
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
          <circle cx="400" cy="306" r="106" fill="none" stroke="#5b3a8e" strokeWidth="1.2" strokeDasharray="3 9" opacity=".32" className="gf-ring"/>
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
              <span className="gf-pulse" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#5b3a8e",boxShadow:"0 0 10px #5b3a8e",flexShrink:0}}/>
              <span style={{fontSize:13,color:"rgba(255,255,255,.74)",fontWeight:600}}>
                {T("J'ai scanné tes côtes ce matin. Dis-moi ton envie.","I scanned your coast this morning. Tell me your mood.","Escaneé tu costa esta mañana. Dime tu plan.")}
              </span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:9}}>
              {VIBES.map(v=>(
                <button key={v.k} className="gf-chip" onClick={()=>pickVibe(v)}
                  style={{cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,color:"#120821",
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
              <span className="gf-pulse" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#3fd07f",boxShadow:"0 0 10px #3fd07f",flexShrink:0}}/>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:"#3fd07f",textTransform:"uppercase"}}>
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
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,
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
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,
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
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,
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
        <div style={{background:"linear-gradient(145deg,#10231E,#120821)",border:"1px solid rgba(255,199,44,.25)",borderRadius:20,padding:"24px 20px",textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:23,color:"#fff",letterSpacing:".02em",textTransform:"uppercase",marginBottom:6}}>{T("Ton veilleur personnel","Your personal watcher","Tu vigía personal")}</div>
          <div style={{fontSize:13.5,color:"rgba(255,255,255,.66)",marginBottom:16,lineHeight:1.45}}>{T("Je surveille ta plage et je te préviens la veille où elle se trouble.","I watch your beach and warn you the day before it turns.","Vigilo tu playa y te aviso la víspera de que cambie.")}</div>
          <button onClick={()=>onPremium&&onPremium("funnel_scroll")} className="gf-chip" style={{display:"block",width:"100%",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
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
    <div ref={wrapRef} role="dialog" aria-modal="true" aria-label={beach.name} style={{position:"absolute",inset:0,zIndex:1050,
      background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",
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
.sg-flow{stroke-dasharray:4 6;animation:sgFlowY 1.2s linear 1 both}
@keyframes sgFlowY{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
.sg-storyvp{height:100vh}
@supports(height:100svh){.sg-storyvp{height:100svh}}
.sgst-ring{animation:sgstRing 2.6s ease-out 1 both}
.sgst-ring2{animation:sgstRing 2.6s ease-out 1 both;animation-delay:1.3s}
@keyframes sgstRing{0%{transform:scale(.3);opacity:.85}78%,100%{transform:scale(2.3);opacity:0}}
.sgst-bob{animation:sgstBob 3.4s ease-in-out 1 both}
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
          <button onClick={onShowMap} style={{flexShrink:0,background:"#FFC72C",color:"#120821",border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:13,padding:"9px 16px",borderRadius:999}}>
            <BrandIcon name="map" size={15} accent="#120821" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte","Open the map","Abrir el mapa")}
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
        background:"linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 26%,rgba(10,23,20,0) 42%,rgba(10,23,20,.88) 78%,#120821 100%)"}}/>
      {/* Bandeau haut : décoratif (wordmark + LIVE) mais AU-DESSUS du voile cliquable
          → sans handler il avalait le tap (dead-clicks home). On lui donne le même
          tap = ouvrir la fiche, pour récupérer ces clics morts. */}
      <div onClick={()=>{track("sg_hero_tap",{t:"topbar"});onOpenBeach&&onOpenBeach(beach)}} style={{position:"absolute",top:0,left:0,right:0,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",
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
          <div onClick={()=>{track("sg_hero_tap",{t:"near"});onOpenBeach&&onOpenBeach(beach)}} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,letterSpacing:".05em",
            color:"#FFC72C",marginBottom:8,cursor:"pointer"}}>
            📍 {_t(lang,"LA PLUS PROCHE DE TOI","CLOSEST TO YOU","LA MÁS CERCA DE TI")}
          </div>
        )}
        <div onClick={()=>{track("sg_hero_tap",{t:"date"});onOpenBeach&&onOpenBeach(beach)}} style={{fontSize:11,fontWeight:600,letterSpacing:".14em",color:"rgba(255,255,255,.62)",marginBottom:6,textTransform:"uppercase",cursor:"pointer"}}>
          {dateLong} · {_t(lang,"SATELLITE COPERNICUS","COPERNICUS SATELLITE","SATÉLITE COPERNICUS")}
        </div>
        <h1 onClick={()=>{track("sg_hero_tap",{t:"title"});onOpenBeach&&onOpenBeach(beach)}} style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(44px,12vw,72px)",lineHeight:.96,
          letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 14px",color:"#fff",cursor:"pointer",
          textShadow:"0 2px 24px rgba(0,0,0,.35)"}}>
          {beach.name}
        </h1>
        <div onClick={()=>{track("sg_hero_tap",{t:"verdict"});onOpenBeach&&onOpenBeach(beach)}} style={{display:"inline-flex",alignItems:"center",gap:10,background:verdictBg,color:"#120821",
          fontWeight:800,fontSize:15,letterSpacing:".02em",padding:"9px 16px",borderRadius:999,marginBottom:8,cursor:"pointer"}}>
          {verdictTxt}
          {beach.score!=null&&<span style={{fontFamily:"'Anton',sans-serif",fontSize:17,letterSpacing:".03em"}}>{beach.score}/100</span>}
        </div>
        {sub&&<div onClick={()=>{track("sg_hero_tap",{t:"sub"});onOpenBeach&&onOpenBeach(beach)}} style={{fontSize:13,color:"rgba(255,255,255,.62)",marginBottom:18,cursor:"pointer"}}>{sub}</div>}
        {/* Desktop (≥900px) : la carte est un bouton de PREMIER rang à côté du
            CTA — GSC 2026-06 : intent "carte" = 7% (MQ) / 2% (GP) des clics
            home vs 72-98% "état maintenant", mais sur grand écran les
            map-seekers doivent voir leur sortie sans chercher. Mobile : lien
            discret sous le CTA (écran étroit, status-first). */}
        {(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(min-width:900px)").matches)?(
          <div style={{display:"flex",gap:10}}>
            <button onClick={onOpen} className="gbtn" style={{flex:1.5,textAlign:"center",
              background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",
              fontWeight:800,fontSize:17,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.32)"}}>
              {_t(lang,"Voir cette plage","See this beach","Ver esta playa")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.75,marginTop:3}}>
                {_t(lang,"état complet · météo · prévisions 7 jours","full status · weather · 7-day forecast","estado completo · clima · pronóstico 7 días")}
              </span>
            </button>
            <button onClick={onShowMap} style={{flex:1,textAlign:"center",cursor:"pointer",fontFamily:"inherit",
              background:"rgba(10,23,20,.45)",color:"#fff",border:"1.5px solid rgba(255,255,255,.35)",
              fontWeight:700,fontSize:15,padding:"16px 18px",borderRadius:18,backdropFilter:"blur(6px)"}}>
              <BrandIcon name="map" size={15} accent="#120821" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte live","Open the live map","Abrir el mapa en vivo")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.7,marginTop:3}}>
                {_t(lang,"toutes les plages, en direct","every beach, real time","todas las playas, en directo")}
              </span>
            </button>
          </div>
        ):(
          <>
            <button onClick={onOpen} className="gbtn" style={{display:"block",width:"100%",textAlign:"center",
              background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",
              fontWeight:800,fontSize:17,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.32)"}}>
              {_t(lang,"Voir cette plage","See this beach","Ver esta playa")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.75,marginTop:3}}>
                {_t(lang,"état complet · météo · prévisions 7 jours","full status · weather · 7-day forecast","estado completo · clima · pronóstico 7 días")}
              </span>
            </button>
            <button onClick={()=>{track("sg_hero_map_cta",{src:"mobile"});onShowMap()}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",
              marginTop:10,background:"rgba(10,23,20,.45)",color:"#fff",
              border:"1.5px solid rgba(255,255,255,.35)",fontFamily:"inherit",fontWeight:700,fontSize:14,
              padding:"14px 20px",borderRadius:18,backdropFilter:"blur(6px)",cursor:"pointer"}}>
              <BrandIcon name="map" size={14} accent="#FFC72C" style={{verticalAlign:"-2px",display:"inline-block"}}/>{_t(lang,"Toutes les plages sur la carte","All beaches on the map","Todas las playas en el mapa")}
            </button>
          </>
        )}
        {/* Invitation au scroll (un seul chevron, modèle SpaceX) */}
        <button onClick={scrollNext} aria-label={_t(lang,"Découvrir","Discover","Descubrir")}
          style={{display:"block",margin:"6px auto 0",background:"none",border:"none",cursor:"pointer",
            color:"rgba(255,255,255,.55)",fontSize:22,lineHeight:1,padding:6}}>
          <span className="sg-hero-chev" style={{display:"inline-block",animation:"sgHeroBob 1.8s ease-in-out 1 both"}}>⌄</span>
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
                  <BeachScene beach={b}/>
                  <span style={{position:"absolute",top:8,left:8,zIndex:2,background:statusCol(b),color:"#120821",
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
              {/* Recette .sg-field comic unique : loupe SVG mono-trait + bord 2.5 ink +
                  ombre dure. input ≥16px (anti-zoom iOS). Tokens thème (comic + dark). */}
              <div style={{position:"relative",display:"flex",alignItems:"center",marginBottom:10}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                  style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
                    color:"#5A5A5A",flexShrink:0,pointerEvents:"none"}}>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4"/>
                  <path d="M16.5 16.5 L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
                </svg>
                <input value={pickQ} onChange={e=>{setPickQ(e.target.value)}}
                  type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search"
                  onFocus={()=>track("sg_landing_pick_search",{})}
                  placeholder={_t(lang,"Chercher une plage…","Search a beach…","Buscar una playa…")}
                  style={{width:"100%",minHeight:48,boxSizing:"border-box",background:"var(--sg-card,#fff)",
                    border:"2.5px solid #0D0D0D",borderRadius:12,padding:"13px 14px 13px 42px",
                    color:"var(--sg-ink,#0D0D0D)",fontSize:16,fontWeight:600,fontFamily:"inherit",outline:"none",
                    boxShadow:"2px 2px 0 #0D0D0D"}}/>
              </div>
              <div style={{maxHeight:312,overflowY:"auto",overflowX:"hidden",display:"flex",flexDirection:"column",gap:6,
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
                  <div className="sg-empty" style={{padding:"18px 8px"}}>
                    <div className="sg-empty__veil"><Veilleur mood="serein" size={44}/></div>
                    <div className="sg-empty__title" style={{fontSize:15}}>{_t(lang,"Aucune plage trouvée","No beach found","Ninguna playa encontrada")}</div>
                    <div className="sg-empty__sub">{_t(lang,"Essaie une autre recherche — je veille sur le reste.","Try another search — I'm watching the rest.","Prueba otra búsqueda — vigilo el resto.")}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
        <button onClick={onShowMap} className="sg-rv" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          width:"100%",background:"rgba(10,23,20,.45)",color:"#fff",border:"1.5px solid rgba(255,255,255,.3)",
          cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:15,padding:"15px 18px",borderRadius:18,marginTop:14}}>
          <BrandIcon name="map" size={15} accent="#120821" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte live","Open the live map","Abrir el mapa en vivo")}
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
            background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",
            fontWeight:800,fontSize:16,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.25)"}}>
            {_t(lang,"Découvrir Premium","Discover Premium","Descubrir Premium")}
          </button>
        )}
        <div className="sg-rv" style={{textAlign:"center",fontSize:11.5,color:"rgba(255,255,255,.45)",marginTop:10}}>
          {PAY_CAPTURE_ONLY?_t(lang,"Sans carte — juste ton email","No card — just your email","Sin tarjeta — solo tu email"):_t(lang,"Paiement unique — sans abonnement, rien à résilier","One-time payment — no subscription, nothing to cancel","Pago único — sin suscripción, nada que cancelar")}
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
          {/* /press/ existe pour les régions USD (kit média = backlinks/E-E-A-T) */}
          {IS_NEW_REGION && <>{" · "}<a href="/press/" style={{color:"rgba(255,255,255,.38)"}}>
            {_t(lang,"Presse","Press","Prensa")}
          </a></>}
          {!IS_NEW_REGION && <>{" · "}<a href="/widget/" style={{color:"rgba(255,255,255,.38)"}}>
            {_t(lang,"Pro : widget gratuit","Pro: free widget","Pro: widget gratis")}
          </a></>}
        </div>
        {/* Liens société/légaux — MQ/GP uniquement (pages 100% FR). Accessibles
            partout pour les visiteurs : offres, fiabilité, CGV, mentions. */}
        {!IS_NEW_REGION && (
          <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:9,lineHeight:1.8}}>
            <a href="/offres/" style={{color:"rgba(255,255,255,.38)"}}>Offres</a>{" · "}
            <a href="/fiabilite/" style={{color:"rgba(255,255,255,.38)"}}>Fiabilité</a>{" · "}
            <a href="/cgv.html" style={{color:"rgba(255,255,255,.3)"}}>CGV</a>{" · "}
            <a href="/remboursement.html" style={{color:"rgba(255,255,255,.3)"}}>Remboursement</a>{" · "}
            <a href="/confidentialite.html" style={{color:"rgba(255,255,255,.3)"}}>Confidentialité</a>{" · "}
            <a href="/mentions-legales.html" style={{color:"rgba(255,255,255,.3)"}}>Mentions légales</a>
            <div style={{marginTop:6,color:"rgba(255,255,255,.26)"}}>97TECH · SAS · RCS Paris 882&nbsp;370&nbsp;703</div>
          </div>
        )}
        {/* Liens société/légaux — régions USD/ES (pages générées EN/ES, slugs
            localisés). Identité opérateur 97TECH visible partout, comme MQ/GP. */}
        {IS_NEW_REGION && (() => {
          const sl = lang==="es"?{t:"terminos",p:"privacidad",r:"reembolso",rel:"fiabilidad"}:{t:"terms",p:"privacy",r:"refund",rel:"reliability"}
          const ls={color:"rgba(255,255,255,.38)"}, lsd={color:"rgba(255,255,255,.3)"}
          return (
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:9,lineHeight:1.8}}>
              <a href={`/${sl.rel}/`} style={ls}>{_t(lang,"Fiabilité","Reliability","Fiabilidad")}</a>{" · "}
              <a href={`/${sl.t}/`} style={lsd}>{_t(lang,"CGV","Terms","Términos")}</a>{" · "}
              <a href={`/${sl.p}/`} style={lsd}>{_t(lang,"Confidentialité","Privacy","Privacidad")}</a>{" · "}
              <a href={`/${sl.r}/`} style={lsd}>{_t(lang,"Remboursement","Refund","Reembolso")}</a>
              <div style={{marginTop:6,color:"rgba(255,255,255,.26)"}}>{_t(lang,"Édité par","Operated by","Operado por")} 97TECH · SAS · RCS Paris 882&nbsp;370&nbsp;703</div>
            </div>
          )
        })()}
      </footer>
    </div>
  )
}

// AlertHub — /alertes/ page view (hub Premium = le veilleur personnel)
function AlertHub({lang,island,beach,onPremium,onShowMap,onClose}){
  const [email,setEmail]=useState("")
  const [submitted,setSubmitted]=useState(false)
  const [busy,setBusy]=useState(false)

  // Verify if already subscribed
  const isSubscribed = (() => {
    try {
      return !!localStorage.getItem("sg_email")
    } catch (_) {
      return false
    }
  })()

  const dateLong=new Date().toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long",day:"numeric",month:"long"})
  const beachName = beach ? beach.name : (lang === "en" ? "your beach" : lang === "es" ? "tu playa" : "ta plage")

  const handleSubmit = e => {
    e.preventDefault()
    if (!email || !email.includes("@")) return
    setBusy(true)
    track("sg_email_submit", { source: "alertes" })
    try {
      localStorage.setItem("sg_email", email)
    } catch (_) {}

    const islandCode = IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ"
    fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec", {
      method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ email, island: islandCode, source: "alertes", date: new Date().toISOString() })
    })
    .then(() => {
      setSubmitted(true)
      setBusy(false)
    })
    .catch(() => {
      setSubmitted(true)
      setBusy(false)
    })
  }

  useEffect(() => {
    track("sg_alerts_view", { variant: "hub", lang })
  }, [lang])

  return (
    <div style={{minHeight:"100svh",background:"linear-gradient(180deg,#0C1D21 0%,#120821 100%)",color:"#fff",position:"relative",padding:"40px 16px 60px",fontFamily:"inherit"}}>
      {/* Croix de fermeture */}
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
        style={{position:"absolute",top:"calc(12px + env(safe-area-inset-top, 0px))",right:16,zIndex:10,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.85)",width:34,height:34,borderRadius:"50%",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
        &times;
      </button>

      <div style={{maxWidth:560,margin:"0 auto",display:"flex",flexDirection:"column",alignItems:"stretch"}}>
        {/* Pli 1 — Promesse + Veilleur */}
        <div style={{textAlign:"center",marginBottom:20,marginTop:20}}>
          <div style={{fontSize:10.5,fontWeight:800,color:"#156a96",letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>
            {dateLong} · {_t(lang,"LE VEILLEUR PERSONNEL","YOUR PERSONAL WATCHER","TU VIGÍA PERSONAL")}
          </div>
          <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,6.5vw,42px)",lineHeight:1.02,letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 16px",color:"#fff"}}>
            {_t(lang,"On surveille ta plage pendant que tu dors.","We watch your beach while you sleep.","Vigilamos tu playa mientras duermes.")}
          </h1>
          <div style={{display:"flex",justifyContent:"center",margin:"12px 0 16px"}}>
            <Veilleur mood="serein" size={64} />
          </div>
          <p style={{fontSize:14,lineHeight:1.4,color:"rgba(255,255,255,.7)",maxWidth:460,margin:"0 auto"}}>
            {_t(lang,`Tu n'ouvres l'app que le jour où l'état de ${beachName} change. Le reste du temps, profite.`,`You only open the app the day ${beachName}'s status changes. The rest of the time, enjoy.`,`Solo abres la aplicación el día que el estado de ${beachName} cambie. El resto del tiempo, disfruta.`)}
          </p>
        </div>

        {/* Pli 2 — AlertScene */}
        <div style={{marginBottom:28,borderRadius:20,overflow:"hidden"}}>
          <AlertScene />
        </div>

        {/* Pli 3 — Capture email */}
        <div style={{background:"linear-gradient(135deg,#190c2c,#142824)",border:"1px solid rgba(255,255,255,.08)",borderRadius:18,padding:"18px 20px",marginBottom:28,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:"-50%",left:"-20%",width:"60%",height:"200%",background:"radial-gradient(ellipse, rgba(34,197,94,.06) 0%, transparent 70%)",pointerEvents:"none"}}/>
          <div style={{position:"relative"}}>
            {submitted ? (
              <div style={{textAlign:"center",fontSize:14,fontWeight:600,color:"#1c7fb0"}}>
                <span style={{fontSize:22,display:"block",marginBottom:6}}>✅</span>
                {_t(lang,"C'est fait ! Le verdict du matin arrive dans ta boîte.","You're in! The morning verdict will arrive in your inbox.","¡Listo! El veredicto matutino llegará a tu bandeja.")}
              </div>
            ) : isSubscribed ? (
              <div style={{textAlign:"center",fontSize:13.5,fontWeight:600,color:"rgba(255,255,255,.85)"}}>
                <span style={{fontSize:18,marginRight:6}}>✓</span>
                {_t(lang,"Tu es déjà inscrit aux alertes quotidiennes.","You are already subscribed to daily alerts.","Ya estás suscrito a las alertas diarias.")}
                <button onClick={() => onPremium("alertes_subscribed")}
                  style={{display:"block",margin:"10px auto 0",background:"none",border:"none",color:"#FFC72C",fontWeight:800,fontSize:13,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
                  {_t(lang,"Gérer mes alertes Premium →","Manage my Premium alerts →","Gestionar mis alertas Premium →")}
                </button>
              </div>
            ) : (
              <>
                <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>
                  {_t(lang,"GRATUIT","FREE","GRATIS")}
                </div>
                <div style={{fontSize:14.5,fontWeight:700,color:"#fff",marginBottom:6}}>
                  {_t(lang,`Reçois le verdict du matin sur ${beachName}`,`Get the morning verdict for ${beachName}`,`Recibe el veredicto matutino sobre ${beachName}`)}
                </div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:14,lineHeight:1.4}}>
                  {_t(lang,"Bilan matinal chaque jour + alerte immédiate si le statut change.","Daily morning brief + immediate alert if status changes.","Resumen matinal diario + alerta inmediata si el estado cambia.")}
                </div>
                <form onSubmit={handleSubmit} style={{display:"flex",gap:10,alignItems:"center"}}>
                  <input type="email" inputMode="email" autoComplete="email" required placeholder={_t(lang,"ton@email.com","your@email.com","tu@email.com")}
                    value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}
                    style={{flex:1,padding:"12px 14px",borderRadius:12,border:"1px solid rgba(255,255,255,.12)",fontSize:16,fontFamily:"inherit",background:"rgba(255,255,255,.06)",outline:"none",minWidth:0,color:"#fff"}}/>
                  <button type="submit" disabled={busy}
                    style={{background:"#1c7fb0",color:"#06231d",border:"none",borderRadius:12,padding:"12px 18px",fontSize:14.5,fontWeight:800,cursor:"pointer",fontFamily:"inherit",opacity:busy?.7:1}}>
                    {busy ? "..." : _t(lang,"S'inscrire","Subscribe","Suscribirme")}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Pli 4 — Preuve de valeur Premium */}
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:32,padding:"0 4px"}}>
          {[
            ["bell", _t(lang,"Alerte la VEILLE quand les sargasses approchent de ta plage","Alert the DAY BEFORE sargassum approaches your beach","Alerta la VÍSPERA cuando el sargazo se acerque a tu playa")],
            ["brief", _t(lang,"Le brief complet du matin : ta meilleure plage du jour","The morning brief: your best clean beach today","El brief matinal: tu mejor playa limpia hoy")],
            ["cal7", _t(lang,"Les 7 jours de prévisions complets, plage par plage","The 7-day forecast, beach by beach","Los 7 días de pronóstico, playa por playa")]
          ].map(([ic,txt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,fontSize:13.5,fontWeight:600,color:"rgba(255,255,255,.85)",lineHeight:1.35}}>
              <BrandIcon name={ic} size={20} style={{color:"rgba(255,255,255,.92)",marginTop:1}} />
              <span>{txt}</span>
            </div>
          ))}
        </div>

        {/* Pli 5 — CTA conversion UNIQUE */}
        <button onClick={() => onPremium("alertes")} className="gbtn"
          style={{display:"block",width:"100%",textAlign:"center",background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.25)",marginBottom:10}}>
          {_t(lang,"Découvrir Premium","Discover Premium","Descubrir Premium")}
        </button>
        <div style={{textAlign:"center",fontSize:11.5,color:"rgba(255,255,255,.45)",marginBottom:36}}>
          {PAY_CAPTURE_ONLY?_t(lang,"Sans carte — juste ton email","No card — just your email","Sin tarjeta — solo tu email"):_t(lang,"Paiement unique — sans abonnement, rien à résilier","One-time payment — no subscription, nothing to cancel","Pago único — sin suscripción, nada que cancelar")}
        </div>

        {/* Pli 6 — Sorties */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,borderTop:"1px solid rgba(255,255,255,.07)",paddingTop:24}}>
          <button onClick={onShowMap}
            style={{background:"none",border:"none",color:"#1c7fb0",fontWeight:700,fontSize:13.5,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
            {_t(lang,"Voir l'état des plages maintenant →","See beach status now →","Ver el estado de las playas ahora →")}
          </button>
          {!IS_NEW_REGION&&<a href="/previsions/"
            style={{color:"rgba(255,255,255,.5)",fontWeight:600,fontSize:13,textDecoration:"underline",fontFamily:"inherit"}}>
            {_t(lang,"Comment marchent nos prévisions →","How our forecasts work →","Cómo funcionan nuestros pronósticos →")}
          </a>}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */
// ── LE MONDE SVG : le feed vertical des plages (LA FONDATION, direction 14/06) ──
// « app B2C style TikTok scrolling avec du SVG sur les plages ». ZÉRO photo —
// chaque plage = BeachScene (notre monde golden-hour) + NOTRE data en scène
// (Veilleur-score, verdict, jauge AFAI satellite, précision cliquable). Snap,
// loopé, JAMAIS bloqué. Réutilise BeachScene/Veilleur/ScoreBlob/verdictMeta (le
// 90% existant). Perf : BeachScene rendu seulement pour la carte active±1.
// Additif (z 1005) : la fiche (1010) et le paywall (1100+) s'ouvrent AU-DESSUS.
function WorldAfaiGauge({afai,lang}){
  // La science, simplement : l'échelle AFAI satellite avec un marqueur à la valeur réelle.
  const v=Math.max(0,Math.min(0.5,typeof afai==="number"?afai:0.1))
  const pct=Math.round((v/0.5)*100)
  return(
    <div style={{margin:"12px 0 2px"}}>
      <div aria-hidden="true" style={{height:8,borderRadius:999,background:"linear-gradient(90deg,#22C55E 0%,#22C55E 30%,#F59E0B 30%,#F59E0B 80%,#E8522A 80%)"}}/>
      <div style={{position:"relative",height:0}}>
        <div className="wf-mark" style={{position:"absolute",top:-13,left:"calc("+pct+"% - 6px)",width:12,height:12,borderRadius:"50%",background:"#fff",border:"2px solid #07201E",boxShadow:"0 1px 6px rgba(0,0,0,.5)"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:9,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.72)",letterSpacing:".04em"}}>
        <span>{_t(lang,"Propre","Clean","Limpia")}</span>
        <span>{_t(lang,"Algues fortes","Heavy algae","Algas fuertes")}</span>
      </div>
    </div>
  )
}
// Hotspot jouable « clic ici » posé sur la scène SVG.
function WorldHotspot({x,y,label,onClick,delay}){
  return(
    <button onClick={onClick} aria-label={label} style={{position:"absolute",left:x,top:y,transform:"translate(-50%,-50%)",zIndex:3,width:38,height:38,borderRadius:"50%",border:"none",background:"none",cursor:"pointer",padding:0}}>
      <span className="wf-hot" style={{display:"block",width:14,height:14,margin:"0 auto",borderRadius:"50%",background:"rgba(255,255,255,.95)",animationDelay:(delay||0)+"s"}}/>
    </button>
  )
}
function WorldCard({beach,lang,active,index,onCarnet,phaseGrad}){
  const status=beach.status||"clean"
  const vm=verdictMeta(status,lang)
  const hasScore=typeof beach.score==="number"
  const mood=hasScore?moodFromScore(beach.score):moodFromStatus(status)
  const afai=typeof beach.afai==="number"?beach.afai:null
  const[tip,setTip]=useState(null)
  const TIPS={
    sky:{t:_t(lang,"☀️ Le saviez-vous ?","☀️ Did you know?","☀️ ¿Sabías?"),b:_t(lang,"La ceinture de sargasses traverse l'Atlantique sur près de 8 000 km — visible depuis l'espace.","The sargassum belt crosses the Atlantic for nearly 8,000 km — visible from space.","El cinturón de sargazo cruza el Atlántico casi 8.000 km — visible desde el espacio.")},
    sea:{t:_t(lang,"🛰️ Les algues, vues du ciel","🛰️ Algae from space","🛰️ Algas desde el cielo"),b:(afai!=null?"AFAI "+afai.toFixed(2)+" — ":"")+(status==="clean"?_t(lang,"signal faible : eau claire aujourd'hui.","low signal: clear water today.","señal baja: agua clara hoy."):status==="moderate"?_t(lang,"signal modéré : présence éparse, prudence.","moderate signal: scattered presence.","señal moderada: presencia dispersa."):_t(lang,"signal fort : échouage probable, évite.","strong signal: likely beaching.","señal fuerte: varazón probable."))},
    veilleur:{t:_t(lang,"Le verdict du Veilleur","The Watchman's verdict","El veredicto del Vigía"),b:vm.verb+" — "+(hasScore?_t(lang,"score "+beach.score+"/100, ","score "+beach.score+"/100, ","puntuación "+beach.score+"/100, "):"")+_t(lang,"d'après le scan satellite du jour, recoupé sur 30 jours.","from today's satellite scan, cross-checked over 30 days.","según el escaneo de hoy, contrastado 30 días.")},
  }
  const show=k=>{setTip(TIPS[k]);try{track("sg_world_hotspot",{zone:k,beach_id:beach.id})}catch(_){}}
  const vtRef=useRef(0)
  const tapVeilleur=()=>{vtRef.current+=1;if(vtRef.current>=5){vtRef.current=0;setTip({t:_t(lang,"🛰️✨ Tu as réveillé le Veilleur !","🛰️✨ You woke the Watchman!","🛰️✨ ¡Despertaste al Vigía!"),b:_t(lang,"Il te fait un clin d'œil. Reviens chaque jour : la mer change, et lui aussi.","He winks at you. Come back each day: the sea changes, and so does he.","Te guiña. Vuelve cada día: el mar cambia, y él también.")});try{track("sg_world_easter",{egg:"veilleur5",beach_id:beach.id})}catch(_){}}else show("veilleur")}
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",scrollSnapStop:"always",overflow:"hidden",background:phaseGrad}}>
      {active?<BeachScene beach={beach}/>:<div aria-hidden="true" style={{position:"absolute",inset:0,background:phaseGrad}}/>}
      <div aria-hidden="true" style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(4,9,11,0) 36%,rgba(4,9,11,.34) 64%,rgba(4,9,11,.84) 100%)"}}/>
      {/* HOTSPOTS jouables — touche la scène, la data se révèle in-world (pas un popup) */}
      {active&&<><WorldHotspot x="24%" y="19%" label={TIPS.sky.t} onClick={()=>show("sky")} delay={0}/><WorldHotspot x="66%" y="49%" label={TIPS.sea.t} onClick={()=>show("sea")} delay={.9}/></>}
      <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:4,padding:"0 22px calc(118px + env(safe-area-inset-bottom)) 22px",color:"#fff",maxWidth:560,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:4}}>
          {hasScore&&<ScoreBlob score={beach.score} color={beach.scoreColor||vm.color} size={64}/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:800,color:vm.color}}><span>{vm.emoji}</span><span>{vm.verb}</span></div>
            <h2 style={{margin:"2px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:30,lineHeight:1.02,letterSpacing:".01em",textShadow:"0 2px 14px rgba(0,0,0,.5)"}}>{beach.name}</h2>
            {beach.commune&&<div style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,.8)"}}>{beach.commune}</div>}
          </div>
          <button onClick={tapVeilleur} aria-label={TIPS.veilleur.t} style={{background:"none",border:"none",padding:0,cursor:"pointer"}}><Veilleur mood={mood} size={42}/></button>
        </div>
        <WorldAfaiGauge afai={beach.afai} lang={lang}/>
        <a href={reliabilityHref(lang)} onClick={e=>{e.stopPropagation();try{track("sg_reliability_open",{from:"world_card"})}catch(_){}}}
          style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:10,fontSize:11.5,fontWeight:700,color:"rgba(255,255,255,.92)",textDecoration:"none"}}>
          🛰️ <span>{_t(lang,"Scan satellite • recoupé chaque jour","Satellite scan • cross-checked daily","Escaneo satélite • contrastado a diario")}</span> <span style={{color:"#3fd07f"}}>→</span>
        </a>
        <button onClick={()=>{try{track("sg_world_carnet",{beach_id:beach.id,status})}catch(_){}; onCarnet&&onCarnet(beach)}}
          style={{display:"block",width:"100%",marginTop:14,padding:"14px",borderRadius:16,border:"none",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:15,fontWeight:800,color:"#07201E",
          background:"linear-gradient(180deg,#FFD884,#F2B05E)",boxShadow:"0 8px 24px rgba(0,0,0,.35)"}}>
          {_t(lang,"Le carnet du Veilleur →","The Watchman's log →","El cuaderno del Vigía →")}
        </button>
      </div>
      {index===0&&!tip&&<div className="wf-hint" aria-hidden="true" style={{position:"absolute",left:0,right:0,bottom:"calc(94px + env(safe-area-inset-bottom))",zIndex:4,textAlign:"center",color:"rgba(255,255,255,.85)",fontSize:12,fontWeight:800,letterSpacing:".07em"}}>
        👆 {_t(lang,"TOUCHE LA SCÈNE · SCROLLE ↓","TAP THE SCENE · SCROLL ↓","TOCA LA ESCENA · DESLIZA ↓")}
      </div>}
      {tip&&<button onClick={()=>setTip(null)} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"absolute",inset:0,zIndex:8,display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"rgba(4,9,11,.42)",border:"none",cursor:"pointer"}}>
        <div className="wf-pop" style={{maxWidth:332,background:"rgba(7,32,30,.95)",border:"1px solid rgba(95,211,201,.42)",borderRadius:18,padding:"18px 20px",textAlign:"left",boxShadow:"0 14px 44px rgba(0,0,0,.55)"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#3fd07f",marginBottom:7}}>{tip.t}</div>
          <div style={{fontSize:14.5,lineHeight:1.5,color:"#fff"}}>{tip.b}</div>
          <div style={{marginTop:12,fontSize:11,color:"rgba(255,255,255,.5)"}}>{_t(lang,"Touche pour fermer","Tap to close","Toca para cerrar")}</div>
        </div>
      </button>}
    </section>
  )
}
// Infos SVG INTERCALÉES entre les plages (la découverte, pas que du scroll).
const WORLD_FACTS=[
  {emoji:"🌊",t:l=>_t(l,"8 000 km d'algues","8,000 km of algae","8.000 km de algas"),b:l=>_t(l,"La grande ceinture atlantique relie l'Afrique au Brésil. On la suit par satellite, chaque jour.","The great Atlantic belt links Africa to Brazil. We track it by satellite, every day.","El gran cinturón atlántico une África y Brasil. Lo seguimos por satélite, cada día.")},
  {emoji:"🛰️",t:l=>_t(l,"L'œil dans l'espace","The eye in space","El ojo en el espacio"),b:l=>_t(l,"Le Veilleur lit l'indice AFAI des satellites et le recoupe chaque jour : prévisions vérifiées au satellite.","The Watchman reads the satellites' AFAI index, cross-checked daily against satellite.","El Vigía lee el índice AFAI, contrastado a diario con satélite.")},
  {emoji:"💨",t:l=>_t(l,"Le H₂S, c'est quoi ?","What is H₂S?","¿Qué es el H₂S?"),b:l=>_t(l,"En se décomposant, les sargasses dégagent du sulfure d'hydrogène — l'odeur d'œuf. On te prévient avant.","Decomposing sargassum releases hydrogen sulfide — the egg smell. We warn you first.","Al descomponerse libera sulfuro de hidrógeno — olor a huevo. Te avisamos antes.")},
  {emoji:"♻️",t:l=>_t(l,"Une ressource ?","A resource?","¿Un recurso?"),b:l=>_t(l,"Ramassées tôt, les sargasses deviennent engrais, bioplastique ou énergie. Le timing change tout.","Collected early, sargassum becomes fertilizer, bioplastic or energy. Timing is everything.","Recogido a tiempo, el sargazo se vuelve fertilizante o energía. El tiempo lo es todo.")},
]
function WorldInfoCard({fact,lang}){
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",overflow:"hidden",
      background:"radial-gradient(120% 80% at 50% 20%,#11463E 0%,#0B2230 55%,#04090B 100%)",color:"#fff"}}>
      <div className="wf-fact" style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 30px calc(120px + env(safe-area-inset-bottom))",maxWidth:540,margin:"0 auto",textAlign:"center"}}>
        <div style={{fontSize:54,lineHeight:1}}>{fact.emoji}</div>
        <h2 style={{margin:"16px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:32,lineHeight:1.05}}>{fact.t(lang)}</h2>
        <p style={{margin:"12px 0 0",fontSize:15,lineHeight:1.55,color:"rgba(255,255,255,.88)"}}>{fact.b(lang)}</p>
        <div style={{marginTop:22,fontSize:11.5,fontWeight:700,letterSpacing:".08em",color:"rgba(255,255,255,.55)"}}>{_t(lang,"CONTINUE ↓","CONTINUE ↓","SIGUE ↓")}</div>
      </div>
    </section>
  )
}
// LE DÉFI DU VEILLEUR — mini-jeu intercalé (blueprint « Place Your Bets ») : devine
// le verdict AVANT le reveal, sur de la data réelle. Récompense + teach-back en boucle,
// rejouable = passe-temps, nourrit la série 🔥 (raison de revenir / easter egg returning).
// ── Verdict du Jour (Devine-puis-Révèle DANS la fiche) ────────────────────────
// L'user devine le statut de CETTE plage avant de voir la donnée → engagement +
// série. CALME : au repos = tableau ; seule anim = un reveal one-shot (scale .96→1
// + opacity, ≤240ms, transform/opacity = iOS-safe) ; reduced-motion = swap instant.
// Sévérité par couleur statique + emoji + texte (jamais de clignotement, WCAG 2.3.1).
// Une fois/plage/jour (lock localStorage). Série en clés DÉDIÉES (sg_vdj_*) pour ne
// PAS clobber le jeu scroll (sg_world_streak). Réutilise verdictMeta/ScoreBlob/why.
function VerdictDuJourCard({beach,lang}){
  const real=beach.status||"clean"
  const vm=verdictMeta(real,lang)
  const hasScore=typeof beach.score==="number"
  const afai=typeof beach.afai==="number"?beach.afai:null
  const dayKey="sg_vdj_"+beach.id+"_"+new Date().toISOString().slice(0,10)
  const prior=g(dayKey,null)
  const[guess,setGuess]=useState(prior?prior.guess:null)
  const[best]=useState(()=>g("sg_vdj_best",0)||0)
  const cachedRef=useRef(!!prior)
  useEffect(()=>{if(cachedRef.current){try{track("sg_verdict_cached_view",{beach_id:beach.id})}catch(_){}}},[])// eslint-disable-line
  const correct=guess===real
  const opts=[
    {s:"clean",e:"😎",l:_t(lang,"Propre","Clean","Limpia"),c:"#22C55E"},
    {s:"moderate",e:"😐",l:_t(lang,"Prudence","Careful","Cuidado"),c:"#F59E0B"},
    {s:"avoid",e:"🚫",l:_t(lang,"Évite","Avoid","Evita"),c:"#E8522A"},
  ]
  const why=(afai!=null?"AFAI "+afai.toFixed(2)+" — ":"")+(real==="clean"
    ?_t(lang,"signal satellite faible, eau claire.","low satellite signal, clear water.","señal baja, agua clara.")
    :real==="moderate"?_t(lang,"signal modéré, présence éparse.","moderate signal, scattered.","señal moderada.")
    :_t(lang,"signal fort, échouage probable.","strong signal, likely beaching.","señal fuerte."))
  const pick=status=>{
    if(guess)return
    cachedRef.current=false
    setGuess(status)
    s(dayKey,{guess:status})
    const ok=status===real
    try{track("sg_verdict_guess",{beach_id:beach.id,guess:status,correct:ok})}catch(_){}
    let ns=0
    try{ns=ok?(g("sg_vdj_streak",0)||0)+1:0;s("sg_vdj_streak",ns);if(ns>(g("sg_vdj_best",0)||0))s("sg_vdj_best",ns)}catch(_){}
    try{track("sg_verdict_reveal",{beach_id:beach.id,correct:ok,status:real,streak:ns})}catch(_){}
  }
  return(
    <div style={{margin:"0 0 14px",padding:"14px 16px",borderRadius:16,background:"rgba(255,255,255,.62)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",border:"1px solid rgba(0,0,0,.06)"}}>
      <style>{`@keyframes vdjPop{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}.vdj-pop{animation:vdjPop .22s cubic-bezier(.34,1.56,.64,1) both}@media(prefers-reduced-motion:reduce){.vdj-pop{animation:none}}`}</style>
      <div style={{fontSize:11.5,fontWeight:800,letterSpacing:".06em",color:"#C97E3A"}}>🎯 {_t(lang,"VERDICT DU JOUR","TODAY'S VERDICT","VEREDICTO DE HOY")}{best>0?" · 🔥 "+best:""}</div>
      {!guess?(
        <div>
          <p style={{margin:"8px 0 10px",fontSize:14,fontWeight:700,color:"var(--sg-ink,#13241F)"}}>{_t(lang,"À ton avis, c'est comment ici aujourd'hui ?","Your call for this beach today?","¿Cómo crees que está hoy aquí?")}</p>
          <div style={{display:"flex",gap:8}}>
            {opts.map(o=>(<button key={o.s} onClick={()=>pick(o.s)} aria-label={o.l} style={{flex:1,padding:"12px 6px",borderRadius:13,cursor:"pointer",border:"1px solid "+o.c+"55",background:o.c+"12",color:"var(--sg-ink,#13241F)",fontWeight:800,fontSize:12,display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontFamily:"inherit"}}>
              <span aria-hidden="true" style={{fontSize:22}}>{o.e}</span>{o.l}</button>))}
          </div>
        </div>
      ):(
        <div className={cachedRef.current?"":"vdj-pop"}>
          <div style={{fontSize:15,fontWeight:800,margin:"8px 0 10px",color:correct?"#16A34A":"#C97E3A"}}>{correct?_t(lang,"Bravo ! 🎉","Nailed it! 🎉","¡Bien! 🎉"):_t(lang,"Le vrai verdict :","The real verdict:","El veredicto:")}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {hasScore&&<ScoreBlob score={beach.score} color={beach.scoreColor||vm.color} size={54}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:800,color:vm.color}}>{vm.emoji} {vm.verb}</div>
              <div style={{fontSize:12,lineHeight:1.4,color:"var(--sg-mid,#5A5A5A)"}}>{why}</div>
            </div>
          </div>
          {!correct&&<button onClick={async()=>{try{track("sg_share",{variant:"missed",beach_id:beach.id,guess})}catch(_){};try{await buildShareCard({variant:"missed",guess,streak:g("sg_vdj_streak",0)||0,lang})}catch(_){}}}
            style={{display:"block",width:"100%",marginTop:12,padding:"11px",borderRadius:12,border:"1px solid rgba(201,126,58,.4)",cursor:"pointer",background:"rgba(201,126,58,.08)",color:"#C97E3A",fontWeight:800,fontSize:13,fontFamily:"inherit"}}>
            🌊 {_t(lang,"La mer m'a eu — tu ferais mieux ?","The sea fooled me — beat it?","El mar me engañó — ¿lo haces mejor?")}</button>}
          <div style={{marginTop:10,fontSize:11.5,fontWeight:700,color:"var(--sg-mid,#9a9a9a)"}}>↓ {_t(lang,"Le détail ci-dessous","Full data below","Detalle abajo")}</div>
        </div>
      )}
    </div>
  )
}
function WorldChallengeCard({beach,lang,active,phaseGrad,onGuess,streak}){
  const real=beach.status||"clean"
  const vm=verdictMeta(real,lang)
  const hasScore=typeof beach.score==="number"
  const afai=typeof beach.afai==="number"?beach.afai:null
  const[guess,setGuess]=useState(null)
  const correct=guess===real
  const opts=[
    {s:"clean",e:"😎",l:_t(lang,"Propre","Clean","Limpia"),c:"#22C55E"},
    {s:"moderate",e:"😐",l:_t(lang,"Prudence","Careful","Cuidado"),c:"#F59E0B"},
    {s:"avoid",e:"🚫",l:_t(lang,"Évite","Avoid","Evita"),c:"#E8522A"},
  ]
  const pick=s=>{if(guess)return;setGuess(s);try{track("sg_world_guess",{beach_id:beach.id,guess:s,correct:s===real})}catch(_){}; onGuess&&onGuess(s===real)}
  const why=(afai!=null?"AFAI "+afai.toFixed(2)+" — ":"")+(real==="clean"?_t(lang,"signal satellite faible, eau claire.","low satellite signal, clear water.","señal baja, agua clara."):real==="moderate"?_t(lang,"signal modéré, présence éparse.","moderate signal, scattered.","señal moderada."):_t(lang,"signal fort, échouage probable.","strong signal, likely beaching.","señal fuerte."))
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",scrollSnapStop:"always",overflow:"hidden",background:phaseGrad}}>
      {active?<BeachScene beach={beach}/>:<div aria-hidden="true" style={{position:"absolute",inset:0,background:phaseGrad}}/>}
      <div aria-hidden="true" style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(4,9,11,.15) 0%,rgba(4,9,11,.2) 40%,rgba(4,9,11,.86) 100%)"}}/>
      <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:4,padding:"0 22px calc(120px + env(safe-area-inset-bottom)) 22px",color:"#fff",maxWidth:560,margin:"0 auto"}}>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:".08em",color:"#FFD884"}}>🎯 {_t(lang,"DÉFI DU VEILLEUR","WATCHMAN'S CHALLENGE","DESAFÍO DEL VIGÍA")}{streak>0?" · 🔥 "+streak:""}</div>
        <h2 style={{margin:"4px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:28,lineHeight:1.04,textShadow:"0 2px 14px rgba(0,0,0,.5)"}}>{beach.name}</h2>
        {beach.commune&&<div style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,.8)"}}>{beach.commune}</div>}
        {!guess?(
          <div className="wf-pop">
            <p style={{margin:"14px 0 10px",fontSize:15,fontWeight:700}}>{_t(lang,"À ton avis, c'est comment aujourd'hui ?","Your call for today?","¿Cómo está hoy?")}</p>
            <div style={{display:"flex",gap:8}}>
              {opts.map(o=>(<button key={o.s} onClick={()=>pick(o.s)} style={{flex:1,padding:"13px 6px",borderRadius:14,border:"1px solid "+o.c+"66",cursor:"pointer",background:"rgba(255,255,255,.08)",color:"#fff",fontWeight:800,fontSize:12.5,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:24}}>{o.e}</span>{o.l}</button>))}
            </div>
          </div>
        ):(
          <div className="wf-pop">
            <div style={{fontSize:16,fontWeight:800,color:correct?"#22C55E":"#FFD884",margin:"14px 0 10px"}}>{correct?_t(lang,"Bravo ! 🎉 +1 série","Nailed it! 🎉 +1 streak","¡Bien! 🎉 +1 racha"):_t(lang,"Raté ! Le vrai verdict :","Missed! The real verdict:","¡Fallaste! El veredicto:")}</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              {hasScore&&<ScoreBlob score={beach.score} color={beach.scoreColor||vm.color} size={58}/>}
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:16,fontWeight:800,color:vm.color}}>{vm.emoji} {vm.verb}</div><div style={{fontSize:12.5,lineHeight:1.4,color:"rgba(255,255,255,.84)"}}>{why}</div></div>
            </div>
            {!correct&&<button onClick={async()=>{try{track("sg_share",{variant:"missed",beach_id:beach.id,guess})}catch(_){};try{await buildShareCard({variant:"missed",guess,streak,lang})}catch(_){}}}
              style={{display:"block",width:"100%",marginTop:12,padding:"12px",borderRadius:14,border:"1px solid rgba(255,216,132,.5)",cursor:"pointer",background:"rgba(255,216,132,.1)",color:"#FFD884",fontWeight:800,fontSize:13.5,fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}>
              🌊 {_t(lang,"La mer m'a eu — tu ferais mieux ?","The sea fooled me — beat it?","El mar me engañó — ¿lo haces mejor?")}</button>}
            <div style={{marginTop:14,fontSize:12,fontWeight:700,letterSpacing:".06em",color:"rgba(255,255,255,.6)"}}>↓ {_t(lang,"PLAGE SUIVANTE","NEXT BEACH","SIGUIENTE")}</div>
          </div>
        )}
      </div>
    </section>
  )
}
// BONUS débloqué par la série (jeu -> conversion) : célébration + une vraie reco
// premium OFFERTE (la plage la plus propre maintenant = la "reco du jour" payante),
// puis CTA Premium. Le jeu nourrit le funnel : data -> jeu -> vente. In-world.
function WorldBonus({level,topBeach,lang,onPremium,onClose}){
  const vm=topBeach?verdictMeta(topBeach.status||"clean",lang):null
  return(
    <div role="dialog" aria-modal="true" aria-label={_t(lang,"Bonus débloqué","Bonus unlocked","Bono")} style={{position:"absolute",inset:0,zIndex:25,display:"flex",alignItems:"center",justifyContent:"center",padding:26,
      background:"radial-gradient(120% 90% at 50% 28%,rgba(17,70,62,.96),rgba(4,9,11,.97))",animation:"wfBonusIn .4s cubic-bezier(.22,1,.36,1) both"}}>
      <div className="wf-pop" style={{maxWidth:360,width:"100%",textAlign:"center",color:"#fff"}}>
        <div style={{fontSize:48,lineHeight:1}}>🎁</div>
        <div style={{marginTop:6,fontSize:12,fontWeight:800,letterSpacing:".08em",color:"#FFD884"}}>🔥 {_t(lang,"SÉRIE DE","STREAK OF","RACHA DE")} {level} · {_t(lang,"BONUS DÉBLOQUÉ","BONUS UNLOCKED","BONO DESBLOQUEADO")}</div>
        <h2 style={{margin:"8px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:30,lineHeight:1.06}}>{_t(lang,"Tu as l'œil du Veilleur","You've got the Watchman's eye","Tienes el ojo del Vigía")}</h2>
        {topBeach&&<div style={{margin:"16px 0 0",padding:"14px 16px",borderRadius:16,background:"rgba(255,255,255,.07)",border:"1px solid rgba(95,211,201,.35)",textAlign:"left"}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:".06em",color:"#3fd07f",textTransform:"uppercase"}}>🎁 {_t(lang,"Offert : ta reco du moment","Free: your pick right now","Gratis: tu recomendación")}</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:8}}>
            {typeof topBeach.score==="number"&&<ScoreBlob score={topBeach.score} color={topBeach.scoreColor||vm.color} size={52}/>}
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:16,fontWeight:800}}>{topBeach.name}</div><div style={{fontSize:12.5,color:"rgba(255,255,255,.82)"}}>{topBeach.commune?topBeach.commune+" · ":""}{vm.emoji} {vm.verb}</div></div>
          </div>
          <button onClick={async()=>{try{track("sg_share",{variant:"top",beach_id:topBeach.id,score:topBeach.score})}catch(_){};try{await buildShareCard({variant:"top",beach:topBeach,forecast:topBeach.forecast,lang})}catch(_){}}}
            style={{display:"block",width:"100%",marginTop:12,padding:"10px",borderRadius:12,border:"1px solid rgba(255,216,132,.5)",cursor:"pointer",background:"rgba(255,216,132,.1)",color:"#FFD884",fontWeight:800,fontSize:13,fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}>
            ☀️ {_t(lang,"Partager la plage du jour","Share beach of the day","Compartir la playa del día")}</button>
        </div>}
        {/* Veille-Card de Série AVANT le CTA premium : le partage frappe au pic
            émotionnel (le "Wordle de la mer", actif d'acquisition organique). */}
        <button onClick={async()=>{try{track("sg_share",{variant:"streak",level})}catch(_){}; let best=level;try{best=parseInt(localStorage.getItem("sg_world_best")||String(level))||level}catch(_){}; try{await buildShareCard({variant:"streak",streak:level,best,lang})}catch(_){}}}
          style={{display:"block",width:"100%",marginTop:16,padding:"14px",borderRadius:16,border:"1px solid rgba(95,211,201,.5)",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:14.5,fontWeight:800,color:"#3fd07f",background:"rgba(95,211,201,.08)"}}>
          🔥 {_t(lang,"Partager ma série","Share my streak","Compartir mi racha")}
        </button>
        <button onClick={()=>{try{track("sg_world_bonus_premium",{level})}catch(_){}; onPremium&&onPremium("world_bonus")}}
          style={{display:"block",width:"100%",marginTop:10,padding:"15px",borderRadius:16,border:"none",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:15.5,fontWeight:800,color:"#07201E",
          background:"linear-gradient(180deg,#FFD884,#F2B05E)",boxShadow:"0 8px 28px rgba(0,0,0,.4)"}}>
          {_t(lang,"Le Veilleur veille pour toi chaque jour →","The Watchman watches for you daily →","El Vigía vigila para ti cada día →")}
        </button>
        <button onClick={onClose} style={{marginTop:14,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.7)",fontSize:13,fontWeight:700}}>
          {_t(lang,"Continuer à jouer","Keep playing","Seguir jugando")}
        </button>
      </div>
    </div>
  )
}
// Le CARNET in-world (remplace le popup du bas) : data profonde + nudge premium, immersif.
function WorldCarnet({beach,lang,onClose,onPremium}){
  const status=beach.status||"clean"
  const vm=verdictMeta(status,lang)
  const hasScore=typeof beach.score==="number"
  const mood=hasScore?moodFromScore(beach.score):moodFromStatus(status)
  return(
    <div role="dialog" aria-modal="true" aria-label={beach.name} style={{position:"absolute",inset:0,zIndex:20,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",
      background:"linear-gradient(180deg,#04090B 0%,#0B2230 50%,#11463E 100%)",animation:"wfCarnetIn .32s cubic-bezier(.22,1,.36,1) both"}}>
      <button onClick={onClose} style={{position:"sticky",top:"calc(12px + env(safe-area-inset-top))",marginLeft:14,zIndex:3,padding:"8px 14px",borderRadius:999,
        background:"rgba(4,9,11,.5)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",backdropFilter:"blur(8px)"}}>← {_t(lang,"Retour","Back","Volver")}</button>
      <div style={{padding:"8px 22px calc(60px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto",color:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:6}}>
          <Veilleur mood={mood} size={58}/>
          <div style={{flex:1,minWidth:0}}>
            <h2 style={{margin:0,fontFamily:"'Anton',system-ui,sans-serif",fontSize:28,lineHeight:1.04}}>{beach.name}</h2>
            {beach.commune&&<div style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,.78)"}}>{beach.commune}</div>}
          </div>
          {hasScore&&<ScoreBlob score={beach.score} color={beach.scoreColor||vm.color} size={58}/>}
        </div>
        <div style={{marginTop:14,padding:"14px 16px",borderRadius:16,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)"}}>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:".06em",color:vm.color,textTransform:"uppercase"}}>{_t(lang,"Aujourd'hui · gratuit","Today · free","Hoy · gratis")}</div>
          <div style={{marginTop:6,fontSize:16,fontWeight:800}}>{vm.emoji} {vm.verb}</div>
          <WorldAfaiGauge afai={beach.afai} lang={lang}/>
        </div>
        <button onClick={()=>{try{track("sg_world_carnet_premium",{beach_id:beach.id})}catch(_){}; onPremium&&onPremium("world_carnet")}}
          style={{display:"block",width:"100%",marginTop:14,padding:"16px",borderRadius:16,border:"1px solid rgba(255,216,132,.4)",cursor:"pointer",textAlign:"left",
          background:"linear-gradient(135deg,rgba(255,216,132,.14),rgba(242,176,94,.08))",color:"#fff"}}>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:".06em",color:"#FFD884"}}>🔒 {_t(lang,"AVEC LE VEILLEUR","WITH THE WATCHMAN","CON EL VIGÍA")}</div>
          <div style={{marginTop:6,fontSize:15,fontWeight:700,lineHeight:1.4}}>{_t(lang,"Prévision 14 jours, historique, brief matin & alertes sur cette plage →","14-day forecast, history, morning brief & alerts for this beach →","Pronóstico 14 días, historial, resumen y alertas →")}</div>
        </button>
        <a href={reliabilityHref(lang)} onClick={()=>{try{track("sg_reliability_open",{from:"world_carnet"})}catch(_){}}}
          style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:16,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.82)",textDecoration:"none"}}>
          🛰️ {_t(lang,"Comment on prévoit : notre fiabilité →","How we forecast: our reliability →","Cómo pronosticamos: nuestra fiabilidad →")}
        </a>
      </div>
    </div>
  )
}
function WorldPremiumCard({lang,onPremium,onRestart}){
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",overflow:"hidden",
      background:"linear-gradient(180deg,#04090B 0%,#0B2230 46%,#155A5A 100%)",color:"#fff"}}>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px calc(110px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto",textAlign:"center"}}>
        <Veilleur mood="serein" size={74}/>
        <h2 style={{margin:"16px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:34,lineHeight:1.05}}>{_t(lang,"Va plus loin que le verdict","Beyond the verdict","Más allá del veredicto")}</h2>
        <p style={{margin:"10px 0 0",fontSize:14.5,lineHeight:1.5,color:"rgba(255,255,255,.86)"}}>
          {_t(lang,"Prévision 14 jours, historique, brief matin et alertes sur tes plages favorites — toute notre science, pour toi.","14-day forecast, history, morning brief and alerts on your favourite beaches — all our science, for you.","Pronóstico 14 días, historial, resumen matutino y alertas en tus playas favoritas — toda nuestra ciencia, para ti.")}
        </p>
        <button onClick={()=>{try{track("sg_world_premium",{})}catch(_){}; onPremium&&onPremium("world")}}
          style={{marginTop:20,padding:"14px 26px",borderRadius:16,border:"none",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:16,fontWeight:800,color:"#07201E",
          background:"linear-gradient(180deg,#FFD884,#F2B05E)",boxShadow:"0 8px 28px rgba(0,0,0,.4)"}}>
          {_t(lang,"Activer le Veilleur →","Activate the Watchman →","Activar el Vigía →")}
        </button>
        <button onClick={onRestart} style={{marginTop:16,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.72)",fontSize:13,fontWeight:700}}>
          ↻ {_t(lang,"Revoir les plages","See beaches again","Ver playas otra vez")}
        </button>
      </div>
    </section>
  )
}
function WorldFeed({beaches,lang,onPremium,onClose,island}){
  const scrollRef=useRef(null)
  const[active,setActive]=useState(0)
  const[carnet,setCarnet]=useState(null)
  // Série 🔥 — passe-temps + raison de revenir (persistée, easter egg returning).
  const[streak,setStreak]=useState(()=>{try{return parseInt(localStorage.getItem("sg_world_streak")||"0")||0}catch(_){return 0}})
  const[best,setBest]=useState(()=>{try{return parseInt(localStorage.getItem("sg_world_best")||"0")||0}catch(_){return 0}})
  const[bonus,setBonus]=useState(null) // palier de série atteint -> bonus débloqué (jeu -> conversion)
  const onGuess=correct=>{const ns=correct?streak+1:0;setStreak(ns);try{localStorage.setItem("sg_world_streak",String(ns))}catch(_){};if(ns>best){setBest(ns);try{localStorage.setItem("sg_world_best",String(ns))}catch(_){}};if(correct&&(ns===3||ns===7||ns===14||ns===30))setBonus(ns);try{track("sg_world_guess_result",{correct,streak:ns})}catch(_){}}
  const phaseGrad=useMemo(()=>{
    let ph="golden";try{if(typeof HERO_PH_OVERRIDE!=="undefined"&&HERO_PH_OVERRIDE)ph=HERO_PH_OVERRIDE;else{const h=new Date().getHours();ph=h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"}}catch(_){}
    const t=BEACH_PHASE[ph]||BEACH_PHASE.golden
    return "linear-gradient(180deg,"+t.sky[0]+","+t.sky[2]+" 60%,"+t.seaB+")"
  },[])
  const list=useMemo(()=>(beaches||[]).filter(b=>b&&b.id&&b.name&&(!island||b.island===island)).slice(0,16),[beaches,island])
  // La meilleure plage maintenant (data réelle) = la reco premium offerte par le bonus.
  const topBeach=useMemo(()=>{const c=list.filter(b=>b.status==="clean"&&typeof b.score==="number").sort((a,b)=>b.score-a.score);return c[0]||list.slice().sort((a,b)=>(b.score||0)-(a.score||0))[0]||null},[list])
  // Items intercalés : 1 carte science toutes les 4 plages (info entre les plages).
  const items=useMemo(()=>{
    const out=[];let fi=0
    list.forEach((b,i)=>{out.push({type:"beach",beach:b,bi:i})
      if((i+1)%4===0&&i<list.length-1){out.push({type:"info",fact:WORLD_FACTS[fi%WORLD_FACTS.length]});fi++}
      if((i+1)%5===0&&list.length>3){out.push({type:"challenge",beach:list[(i+3)%list.length]})}
    })
    out.push({type:"premium"})
    return out
  },[list])
  useEffect(()=>{
    const root=scrollRef.current;if(!root)return
    const io=new IntersectionObserver(es=>{
      es.forEach(e=>{if(e.isIntersecting){const i=parseInt(e.target.getAttribute("data-wf-card"));if(!isNaN(i))setActive(i)}})
    },{root,threshold:0.55})
    root.querySelectorAll("[data-wf-card]").forEach(c=>io.observe(c))
    return()=>io.disconnect()
  },[items.length])
  useEffect(()=>{try{track("sg_world_open",{count:list.length})}catch(_){}},[])// eslint-disable-line
  const restart=()=>{try{scrollRef.current&&scrollRef.current.scrollTo({top:0,behavior:"smooth"})}catch(_){}}
  return(
    <div role="region" aria-label={_t(lang,"Monde Sargasses","Sargassum World","Mundo Sargazo")} style={{position:"fixed",inset:0,zIndex:1005,background:"#04090B"}}>
      <style>{`@keyframes wfHint{0%,100%{transform:translateY(0);opacity:.72}50%{transform:translateY(5px);opacity:1}}.wf-hint{animation:wfHint 1.8s ease-in-out 1 both}@keyframes wfMark{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}.wf-mark{animation:wfMark 2.4s ease-in-out 1 both}@keyframes wfHot{0%{box-shadow:0 0 0 0 rgba(95,211,201,.5),0 2px 8px rgba(0,0,0,.5)}70%{box-shadow:0 0 0 14px rgba(95,211,201,0),0 2px 8px rgba(0,0,0,.5)}100%{box-shadow:0 0 0 0 rgba(95,211,201,0),0 2px 8px rgba(0,0,0,.5)}}.wf-hot{animation:wfHot 2.2s ease-out 1 both}@keyframes wfPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}.wf-pop{animation:wfPop .24s cubic-bezier(.34,1.56,.64,1) both}@keyframes wfFact{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}.wf-fact{animation:wfFact .5s ease both}@keyframes wfCarnetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes wfBonusIn{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.wf-hint,.wf-mark,.wf-hot,.wf-pop,.wf-fact{animation:none}}`}</style>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
        style={{position:"absolute",top:"calc(12px + env(safe-area-inset-top))",right:14,zIndex:30,width:40,height:40,borderRadius:"50%",
        background:"rgba(4,9,11,.55)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:17,cursor:"pointer",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>✕</button>
      {streak>0&&<div aria-label={_t(lang,"Série","Streak","Racha")} style={{position:"absolute",top:"calc(15px + env(safe-area-inset-top))",left:14,zIndex:30,padding:"6px 12px",borderRadius:999,
        background:"rgba(4,9,11,.55)",border:"1px solid rgba(255,216,132,.45)",color:"#FFD884",fontSize:12.5,fontWeight:800,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>🔥 {streak}{best>streak?" · ⭐"+best:""}</div>}
      <div ref={scrollRef} style={{position:"absolute",inset:0,overflowY:"auto",overflowX:"hidden",scrollSnapType:"y mandatory",WebkitOverflowScrolling:"touch"}}>
        {items.map((it,idx)=>(
          <div key={idx} data-wf-card={idx}>
            {it.type==="beach"&&<WorldCard beach={it.beach} index={it.bi} active={Math.abs(idx-active)<=1} lang={lang} onCarnet={setCarnet} phaseGrad={phaseGrad}/>}
            {it.type==="info"&&<WorldInfoCard fact={it.fact} lang={lang}/>}
            {it.type==="challenge"&&<WorldChallengeCard beach={it.beach} active={Math.abs(idx-active)<=1} lang={lang} phaseGrad={phaseGrad} onGuess={onGuess} streak={streak}/>}
            {it.type==="premium"&&<WorldPremiumCard lang={lang} onPremium={onPremium} onRestart={restart}/>}
          </div>
        ))}
      </div>
      {carnet&&<WorldCarnet beach={carnet} lang={lang} onClose={()=>setCarnet(null)} onPremium={onPremium}/>}
      {bonus&&<WorldBonus level={bonus} topBeach={topBeach} lang={lang} onPremium={onPremium} onClose={()=>setBonus(null)}/>}
    </div>
  )
}

// ── L'ARCHIPEL DU VEILLEUR — le monde SVG LIBRE pan/zoom (tournoi gagnant 14/06).
// Plan unique : chaque plage placee a sa VRAIE lat/lng, camera translate+scale en
// rAF (transforms-only, pattern --gp). PRINCIPE : la decision est gratuite et
// immediate (on atterrit MID-zoom sur SA cote, verdict <1s), l'exploration est un
// bonus libre par-dessus. v0 = pan + zoom (wheel/pinch/double-tap) + atterrissage +
// tap->BeachSheet existante (funnel INTACT). Pas de dive/momentum/LOD (slices 2-4).
function ArchipelView({beaches,island,userPos,lang,onOpenBeach,onClose,onSolutions,onPremium,rootMode,updatedAt,initialZone,onRequestGeo}){
  const wrapRef=useRef(null),gRef=useRef(null),camRef=useRef({cx:0,cy:0,cz:0.8}),rafRef=useRef(0)
  const pendingCenterRef=useRef(false) // P6 « Près de moi » : centrer dès que la géoloc arrive
  const ptrs=useRef(new Map()),movedRef=useRef(false),pinchRef=useRef(null),lastTap=useRef(0)
  const velRef=useRef({x:0,y:0}),inertRaf=useRef(0),pannedRef=useRef(false)
  // Drag rigolo du Veilleur : on l'attrape, son radar/faisceau suivent, il rebondit au lâcher.
  const satGRef=useRef(null),satHitRef=useRef(null),satDragRef=useRef(false),satOffRef=useRef({x:0,y:0}),satVRef=useRef({x:0,y:0}),satSprRaf=useRef(0)
  const[satGrab,setSatGrab]=useState(false)
  const[satSay,setSatSay]=useState(null) // bulle de dialogue du Veilleur quand on l'attrape
  const sayIdxRef=useRef(0),sayTimerRef=useRef(0)
  const skyRef=useRef(null),camBaseRef=useRef(null) // parallaxe douce du fond au pan
  const SAT_SAY={fr:["Hé ! Je bosse, là 🛰️","Repose-moi, je scanne !","Doucement… je veille.","Oh ! Tu m'as eu 😄","Eh, je travaille, moi !"],en:["Hey! I'm working 🛰️","Put me back, I'm scanning!","Easy… I'm on watch.","Oh! You got me 😄","Hey, I'm on duty!"],es:["¡Eh! Estoy trabajando 🛰️","¡Suéltame, escaneo!","Tranqui… estoy vigilando.","¡Oh! Me pillaste 😄","¡Eh, que trabajo!"]}
  const veilleurSpeak=()=>{const arr=SAT_SAY[lang]||SAT_SAY.fr;setSatSay(arr[sayIdxRef.current%arr.length]);sayIdxRef.current++;if(sayTimerRef.current)clearTimeout(sayTimerRef.current)}
  const[ready,setReady]=useState(false)
  const SPAN_PX=1000,MID=0.82,FAR=0.32,NEAR=2.6
  const{proj,count}=useMemo(()=>{
    const list=(beaches||[]).filter(b=>b&&b.lat!=null&&b.lng!=null&&(!island||b.island===island))
    if(!list.length)return{proj:[],count:0}
    let mLa=9e9,xLa=-9e9,mLn=9e9,xLn=-9e9
    for(const b of list){mLa=Math.min(mLa,b.lat);xLa=Math.max(xLa,b.lat);mLn=Math.min(mLn,b.lng);xLn=Math.max(xLn,b.lng)}
    const cLat=(mLa+xLa)/2,cLng=(mLn+xLn)/2,span=(Math.max(xLa-mLa,xLn-mLn)*1.3)||0.5
    const proj=list.map(b=>({b,x:((b.lng-cLng)/span+0.5)*SPAN_PX,y:((cLat-b.lat)/span+0.5)*SPAN_PX}))
    return{proj,count:list.length}
  },[beaches,island])
  const myIdx=useMemo(()=>{
    if(!proj.length)return 0
    if(userPos){let bi=0,bd=9e9;proj.forEach((p,i)=>{const d=haversine(userPos.lat,userPos.lng,p.b.lat,p.b.lng);if(d<bd){bd=d;bi=i}});return bi}
    let bi=0,bd=9e9;proj.forEach((p,i)=>{const d=(p.x-SPAN_PX/2)**2+(p.y-SPAN_PX/2)**2;if(d<bd){bd=d;bi=i}});return bi
  },[proj,userPos])
  const writeCam=()=>{const g=gRef.current;if(!g)return;const c=camRef.current;g.setAttribute("transform","translate("+c.cx.toFixed(1)+" "+c.cy.toFixed(1)+") scale("+c.cz.toFixed(4)+")")
    // parallaxe DOUCE du fond : le ciel suit le pan à ~10% → sentiment de profondeur, le monde
    // bouge d'un bloc (cohésion). Calme : aucune animation, juste le geste de l'utilisateur.
    const sk=skyRef.current;if(sk){if(!camBaseRef.current)camBaseRef.current={cx:c.cx,cy:c.cy};const b=camBaseRef.current;const px=Math.max(-58,Math.min(58,(c.cx-b.cx)*0.1)),py=Math.max(-58,Math.min(58,(c.cy-b.cy)*0.1));sk.style.transform="translate("+px.toFixed(1)+"px,"+py.toFixed(1)+"px)"}}
  // Veilleur drag : viewBox 800x600 slice -> échelle écran ; transform = offset, ressort de retour (rebond rigolo).
  const satScale=()=>{const el=wrapRef.current;return el?Math.max(el.clientWidth/800,el.clientHeight/600):1}
  const satWrite=()=>{const g=satGRef.current;if(g)g.setAttribute("transform","translate("+satOffRef.current.x.toFixed(1)+" "+satOffRef.current.y.toFixed(1)+")")}
  const satSpringHome=()=>{if(satSprRaf.current)return;const step=()=>{const o=satOffRef.current,v=satVRef.current;v.x+=(-o.x*0.22-v.x*0.5);v.y+=(-o.y*0.22-v.y*0.5);o.x+=v.x;o.y+=v.y;satWrite();if(Math.abs(o.x)<0.4&&Math.abs(o.y)<0.4&&Math.abs(v.x)<0.4&&Math.abs(v.y)<0.4){o.x=0;o.y=0;v.x=0;v.y=0;satWrite();satSprRaf.current=0;return}satSprRaf.current=requestAnimationFrame(step)};satSprRaf.current=requestAnimationFrame(step)}
  const schedule=()=>{if(rafRef.current)return;rafRef.current=requestAnimationFrame(()=>{rafRef.current=0;writeCam()})}
  const clampZ=z=>Math.max(FAR*0.75,Math.min(NEAR*1.25,z))
  const centerOn=(i,cz)=>{const el=wrapRef.current;if(!el||!proj[i])return;const z=clampZ(cz||camRef.current.cz),W=el.clientWidth,H=el.clientHeight;camRef.current={cz:z,cx:W/2-proj[i].x*z,cy:H/2-proj[i].y*z};schedule()}
  // P6 : la géoloc demandée au clic « Près de moi » arrive de façon asynchrone → quand
  // userPos est posé, myIdx recalcule la plage la plus proche et on recentre dessus.
  useEffect(()=>{if(userPos&&pendingCenterRef.current){pendingCenterRef.current=false;try{centerOn(myIdx,MID)}catch(_){}}},[userPos,myIdx])
  const zoomAt=(f,px,py)=>{const c=camRef.current,nz=clampZ(c.cz*f),wx=(px-c.cx)/c.cz,wy=(py-c.cy)/c.cz;c.cz=nz;c.cx=px-wx*nz;c.cy=py-wy*nz;schedule()}
  // ── PAN INERTIE + BORDS ÉLASTIQUES (#49) ──────────────────────────────────
  // Le pan libre coast après le relâché (déccélération = continuation du geste,
  // pas une boucle idle → conforme à la doctrine calme) et les bords résistent
  // (overscroll borné pendant le drag, ressort de retour au relâché). Le monde
  // ne peut JAMAIS être lancé hors écran (anti « bloqué »/cul-de-sac visuel).
  // prefers-reduced-motion : vélocité=0 → pas de coast, juste recentrage des bords.
  const panBounds=()=>{const el=wrapRef.current;if(!el)return null;const W=el.clientWidth,H=el.clientHeight,z=camRef.current.cz,M=Math.min(W,H)*0.38;
    // normalise min<=max : si le monde (SPAN_PX*z) tient dans le viewport utile,
    // l'intervalle s'inverserait → on le collapse au centre (sinon l'inertie ne
    // settle jamais sur aspect ratio extrême au zoom min → boucle rAF perpétuelle).
    let minX=M-SPAN_PX*z,maxX=W-M,minY=M-SPAN_PX*z,maxY=H-M
    if(minX>maxX){minX=maxX=(minX+maxX)/2}if(minY>maxY){minY=maxY=(minY+maxY)/2}
    return{minX,maxX,minY,maxY}}
  const panClampDrag=c=>{const b=panBounds();if(!b)return;const el=wrapRef.current,ov=(el?Math.min(el.clientWidth,el.clientHeight):360)*0.22;c.cx=Math.max(b.minX-ov,Math.min(b.maxX+ov,c.cx));c.cy=Math.max(b.minY-ov,Math.min(b.maxY+ov,c.cy))}
  const stopInertia=()=>{if(inertRaf.current){cancelAnimationFrame(inertRaf.current);inertRaf.current=0}}
  const startInertia=()=>{stopInertia();let reduce=false;try{reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){}if(reduce){velRef.current.x=0;velRef.current.y=0}
    const step=()=>{const c=camRef.current,v=velRef.current,b=panBounds();c.cx+=v.x;c.cy+=v.y;v.x*=0.92;v.y*=0.92
      if(b){if(c.cx<b.minX){c.cx+=(b.minX-c.cx)*0.2;v.x*=0.55}else if(c.cx>b.maxX){c.cx+=(b.maxX-c.cx)*0.2;v.x*=0.55}
        if(c.cy<b.minY){c.cy+=(b.minY-c.cy)*0.2;v.y*=0.55}else if(c.cy>b.maxY){c.cy+=(b.maxY-c.cy)*0.2;v.y*=0.55}}
      writeCam();const slow=Math.hypot(v.x,v.y)<0.12,inB=!b||(c.cx>=b.minX-0.5&&c.cx<=b.maxX+0.5&&c.cy>=b.minY-0.5&&c.cy<=b.maxY+0.5)
      if(slow&&inB){inertRaf.current=0;return}inertRaf.current=requestAnimationFrame(step)}
    inertRaf.current=requestAnimationFrame(step)}
  useEffect(()=>{
    let centered = false
    if(initialZone){
      const zoneObj = (COAST_ZONES[island] || []).find(z => z.slug === initialZone)
      if(zoneObj){
        const zoneBeaches = proj.filter(p => zoneObj.communes.includes(p.b.commune))
        if(zoneBeaches.length){
          let avgX = 0, avgY = 0
          for(const p of zoneBeaches){
            avgX += p.x
            avgY += p.y
          }
          avgX /= zoneBeaches.length
          avgY /= zoneBeaches.length
          const el = wrapRef.current
          if(el){
            const z = MID
            const W = el.clientWidth
            const H = el.clientHeight
            camRef.current = {
              cz: z,
              cx: W / 2 - avgX * z,
              cy: H / 2 - avgY * z
            }
            schedule()
            centered = true
            try { track("sg_zone_click", { zone: initialZone }) } catch(_) {}
          }
        }
      }
    }
    if(!centered){
      centerOn(myIdx,MID)
    }
    setReady(true)
    try{track("sg_archipel_open",{beaches:count})}catch(_){}
  },[initialZone])// eslint-disable-line
  // SCROLL / molette / swipe / flèches = VISITE plage-à-plage (doctrine #24 : le
  //   scroll pilote la VISITE, JAMAIS le zoom — zoom = pincer/double-tap). La caméra
  //   glisse vers la plage suivante/précédente. Fin de liste = BOUCLE (jamais bloqué,
  //   PAS de cul-de-sac Solutions). Début + haut = sortie (exitTour). Escapable
  //   molette ET clavier (ArrowUp/Down/Escape), gardé contre la saisie de champ.
  useEffect(()=>{const el=wrapRef.current;if(!el)return;let wl=0
    const step=dir=>{const now=Date.now();if(now-wl<240)return;wl=now
      if(tourRef.current==null){if(dir>0)startTour();else centerOn(myIdx,MID);return}
      const nx=tourRef.current+dir
      if(nx<0){exitTour();return}
      if(nx>tourOrder.length-1){tourGo(0);return}
      tourGo(nx)}
    const onWheel=e=>{e.preventDefault();step(e.deltaY>0?1:-1)}
    const onKey=e=>{const t=e.target;if(t&&(/^(input|textarea|select)$/i.test(t.tagName)||t.isContentEditable))return;if(document.querySelector('[role="dialog"][aria-modal="true"]'))return;if(e.key==="ArrowDown"){e.preventDefault();step(1)}else if(e.key==="ArrowUp"){e.preventDefault();step(-1)}else if(e.key==="Escape"&&tourRef.current!=null)exitTour()}
    el.addEventListener("wheel",onWheel,{passive:false});window.addEventListener("keydown",onKey)
    return()=>{el.removeEventListener("wheel",onWheel);window.removeEventListener("keydown",onKey)}
  },[])// eslint-disable-line
  const rel=e=>{const r=wrapRef.current.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  const onDown=e=>{movedRef.current=false;stopInertia();velRef.current={x:0,y:0};pannedRef.current=false
    // attrape le Veilleur (drag rigolo) si le doigt tombe dessus
    if(!satDragRef.current&&satHitRef.current){const r=satHitRef.current.getBoundingClientRect(),pad=16;if(e.clientX>=r.left-pad&&e.clientX<=r.right+pad&&e.clientY>=r.top-pad&&e.clientY<=r.bottom+pad){satDragRef.current=true;if(satSprRaf.current){cancelAnimationFrame(satSprRaf.current);satSprRaf.current=0}satVRef.current={x:0,y:0};setSatGrab(true);veilleurSpeak();try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}ptrs.current.set(e.pointerId,rel(e));try{track("sg_archipel_sat_grab",{})}catch(_){};return}}
    // PAS de setPointerCapture ici : sinon le `click` est re-routé vers le wrap et
    // les onClick des points/boutons ne se déclenchent JAMAIS. On capture seulement
    // quand un vrai drag/pinch démarre (dans onMove) → un simple tap reste un clic.
    ptrs.current.set(e.pointerId,rel(e));swipeY.current=rel(e).y;swipeX.current=rel(e).x;if(ptrs.current.size===2){try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}const[a,b]=[...ptrs.current.values()];pinchRef.current={d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2}}}
  const onMove=e=>{if(!ptrs.current.has(e.pointerId))return;const prev=ptrs.current.get(e.pointerId),p=rel(e);ptrs.current.set(e.pointerId,p)
    if(satDragRef.current){const sc=satScale();satOffRef.current.x+=(p.x-prev.x)/sc;satOffRef.current.y+=(p.y-prev.y)/sc;satWrite();movedRef.current=true;return}
    if(ptrs.current.size>=2&&pinchRef.current){const[a,b]=[...ptrs.current.values()];const d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;const c=camRef.current;if(pinchRef.current.d>0){const f=d/pinchRef.current.d;const nz=clampZ(c.cz*f),wx=(mx-c.cx)/c.cz,wy=(my-c.cy)/c.cz;c.cz=nz;c.cx=mx-wx*nz;c.cy=my-wy*nz}c.cx+=mx-pinchRef.current.mx;c.cy+=my-pinchRef.current.my;pinchRef.current={d,mx,my};movedRef.current=true;schedule();return}
    if(tourRef.current!=null){const dx2=p.x-prev.x,dy2=p.y-prev.y;if(Math.abs(dx2)+Math.abs(dy2)>2)movedRef.current=true;return}
    const dx=p.x-prev.x,dy=p.y-prev.y;if(Math.abs(dx)+Math.abs(dy)>2){if(!movedRef.current){try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}}movedRef.current=true;clearPress()}const c=camRef.current;c.cx+=dx;c.cy+=dy;panClampDrag(c);velRef.current={x:dx*0.55+velRef.current.x*0.45,y:dy*0.55+velRef.current.y*0.45};pannedRef.current=true;schedule()}
  const onUp=e=>{clearPress();if(satDragRef.current){satDragRef.current=false;setSatGrab(false);satSpringHome();ptrs.current.delete(e.pointerId);try{e.currentTarget.releasePointerCapture(e.pointerId)}catch(_){}if(sayTimerRef.current)clearTimeout(sayTimerRef.current);sayTimerRef.current=setTimeout(()=>setSatSay(null),1700);try{track("sg_archipel_sat_drop",{})}catch(_){};return}
    if(tourRef.current!=null&&swipeY.current!=null&&ptrs.current.size===1){const dy=rel(e).y-swipeY.current;if(dy<-44){tourGo(tourRef.current>=tourOrder.length-1?0:tourRef.current+1)}else if(dy>44){if(tourRef.current<=0)exitTour();else tourGo(tourRef.current-1)}}
    else if(tourRef.current==null&&ptrs.current.size===1&&!pinchRef.current){
      // FLICK vertical vers le haut, hors visite = ENTRER dans la visite (parité molette,
      //   doctrine #24 : le scroll PILOTE la visite). Gardé par la vélocité : un pan lent
      //   d'exploration reste un pan ; seul un vrai flick rapide & dominant-vertical entre.
      const dy=swipeY.current!=null?rel(e).y-swipeY.current:0,dx=swipeX.current!=null?rel(e).x-swipeX.current:0
      const flickUp=dy<-50&&Math.abs(dy)>Math.abs(dx)*1.3&&Math.abs(velRef.current.y)>3
      if(flickUp){stopInertia();startTour();try{track("sg_archipel_swipe_enter",{})}catch(_){}}
      else if(pannedRef.current){startInertia()}
    }
    ptrs.current.delete(e.pointerId);if(ptrs.current.size<2)pinchRef.current=null;swipeY.current=null;swipeX.current=null}
  // Double-tap = bascule entre paliers NOMMÉS (vue côte MID ↔ rivage NEAR) au point
  // tapé, au lieu de magic numbers. zoomAt borne via clampZ. (workflow step 3)
  const onTap=e=>{if(tourRef.current!=null)return;const now=Date.now();if(now-lastTap.current<300&&!movedRef.current){const r=wrapRef.current.getBoundingClientRect(),c=camRef.current;zoomAt(c.cz<(MID+NEAR)/2?NEAR/c.cz:MID/c.cz,e.clientX-r.left,e.clientY-r.top)}
    else if(!movedRef.current&&!mapTapHintOff&&!diving){ // tap simple sur la mer vide (pas double, pas pan, aucune plongée en cours) → indice éphémère
      try{if(!sessionStorage.getItem("sg_maptaphint")){sessionStorage.setItem("sg_maptaphint","1");try{track("sg_map_tap_hint")}catch(_){};setTapHint(true);setTimeout(()=>setTapHint(false),2400)}}catch(_){}
    }
    lastTap.current=now}
  // ── MODE VISITE : scroll/swipe de plage en plage, la caméra glisse, une fiche-info
  //    par plage (« quand on scroll down ça passe de plage en plage avec des infos »).
  const[tour,setTour]=useState(null) // null=exploration libre ; sinon position dans l'ordre
  // Dead-click carte : un tap simple sur la mer vide (hors pin) ne répondait pas → indice
  // ÉPHÉMÈRE « touche une plage 📍 » (1×/session, pointerEvents:none, auto-dismiss). Ne change
  // NI le pan NI la sélection (zéro sémantique de geste modifiée). Rollback : ?maptap=0.
  const mapTapHintOff=(()=>{try{return /[?&]maptap=0/.test(window.location.search)}catch(_){return false}})()
  const[tapHint,setTapHint]=useState(false)
  const tourRef=useRef(null),twRaf=useRef(0),twTarget=useRef(null),swipeY=useRef(null),swipeX=useRef(null)
  const FOCUS=1.6
  const tourOrder=useMemo(()=>{if(!proj.length)return[];const m=proj[myIdx];return proj.map((_,i)=>i).sort((a,b)=>((proj[a].x-m.x)**2+(proj[a].y-m.y)**2)-((proj[b].x-m.x)**2+(proj[b].y-m.y)**2))},[proj,myIdx])
  const runTween=()=>{if(twRaf.current)return;const step=()=>{const t=twTarget.current,c=camRef.current;if(!t){twRaf.current=0;return}c.cx+=(t.cx-c.cx)*0.2;c.cy+=(t.cy-c.cy)*0.2;c.cz+=(t.cz-c.cz)*0.2;writeCam();if(Math.hypot(t.cx-c.cx,t.cy-c.cy)<0.6&&Math.abs(t.cz-c.cz)<0.003){c.cx=t.cx;c.cy=t.cy;c.cz=t.cz;writeCam();twTarget.current=null;twRaf.current=0;return}twRaf.current=requestAnimationFrame(step)};twRaf.current=requestAnimationFrame(step)}
  const focusBeach=i=>{const el=wrapRef.current;if(!el||!proj[i])return;const z=FOCUS,W=el.clientWidth,H=el.clientHeight;twTarget.current={cz:z,cx:W/2-proj[i].x*z,cy:H/2-proj[i].y*z-H*0.16};runTween()}
  // ── LA MARÉE (incrément #1, gate de la thèse) — A/B nav_maree : taper un dot
  //    = dolly-in CONTINU vers le RIVAGE (NEAR) pendant que la BeachScene de la
  //    plage se fond plein écran sur le MÊME golden-hour → la fiche s'ouvre comme
  //    la culmination, PAS une téléportation. reduced-motion + control = ouverture
  //    directe (snap, zéro pop). Override QA : ?pwtide=1/0. Réutilise runTween.
  const mareeOn=useMemo(()=>{try{const q=window.location.search;if(/[?&]pwtide=1/.test(q))return true;if(/[?&]pwtide=0/.test(q))return false;if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return false;return abVariant("nav_maree",["control","maree"],[.85,.15])==="maree"}catch(_){return false}},[])
  const[diving,setDiving]=useState(null)
  const diveTimers=useRef([])
  const[pressed,setPressed]=useState(null) // verdict-au-toucher : id du SEUL point pressé vivant
  const pressedRef=useRef(null),pressStartRef=useRef(0)
  const clearPress=()=>{if(pressedRef.current!==null){pressedRef.current=null;setPressed(null)}}
  const diveBeach=(i,b)=>{
    try{track("sg_archipel_tap",{beach_id:b.id,status:b.status,maree:mareeOn?1:0})}catch(_){}
    if(!mareeOn||!proj[i]){onOpenBeach&&onOpenBeach(b);return}
    diveTimers.current.forEach(clearTimeout);diveTimers.current=[]
    setDiving(b)
    const el=wrapRef.current,W=el?el.clientWidth:0,H=el?el.clientHeight:0
    twTarget.current={cz:NEAR,cx:W/2-proj[i].x*NEAR,cy:H/2-proj[i].y*NEAR};runTween()
    diveTimers.current.push(setTimeout(()=>{onOpenBeach&&onOpenBeach(b)},520))
    diveTimers.current.push(setTimeout(()=>{setDiving(null);try{centerOn(myIdx,MID)}catch(_){}},900))
  }
  useEffect(()=>()=>{diveTimers.current.forEach(clearTimeout);stopInertia()},[])
  // Dock "Toutes" = le monde dézoomé au FAR (la liste est une PROFONDEUR, pas un
  // autre écran) — centre le centroïde de la projection (≈SPAN_PX/2).
  const fitAll=()=>{const el=wrapRef.current;if(!el)return;const W=el.clientWidth,H=el.clientHeight,z=FAR;camRef.current={cz:z,cx:W/2-(SPAN_PX/2)*z,cy:H/2-(SPAN_PX/2)*z};schedule()}
  const tourGo=pos=>{if(!tourOrder.length)return;const p=Math.max(0,Math.min(tourOrder.length-1,pos));tourRef.current=p;setTour(p);focusBeach(tourOrder[p]);try{track("sg_archipel_tour",{pos:p,beach_id:proj[tourOrder[p]].b.id})}catch(_){}}
  const startTour=()=>tourGo(0)
  const exitTour=()=>{tourRef.current=null;setTour(null);twTarget.current=null;centerOn(myIdx,MID)}
  const my=proj[myIdx]&&proj[myIdx].b,myVm=my&&verdictMeta(my.status,lang)
  // LECTURE DU JOUR — le Veilleur narre la situation RÉELLE du jour (counts live).
  // Saison calme (tout propre) = état DÉSIRABLE, pas une absence (fix critic #1) :
  // l'app ne s'éteint jamais, même quand 20/20 sont verts.
  const lecture=useMemo(()=>{
    const list=(beaches||[]).filter(b=>b&&b.status&&(!island||b.island===island))
    const n=list.length;if(!n)return null
    const clean=list.filter(b=>b.status==="clean").length
    const avoid=list.filter(b=>b.status==="avoid").length
    const mod=n-clean-avoid
    if(avoid===0&&mod<=1)return{mood:"clean",text:_t(lang,`Tout est calme — ${clean}/${n} plages propres. Profite.`,`All calm — ${clean}/${n} beaches clean. Enjoy.`,`Todo en calma — ${clean}/${n} playas limpias. Disfruta.`)}
    if(avoid>0)return{mood:"avoid",text:_t(lang,`${clean} propres · ${avoid} à éviter aujourd'hui.`,`${clean} clean · ${avoid} to avoid today.`,`${clean} limpias · ${avoid} a evitar hoy.`)}
    return{mood:"moderate",text:_t(lang,`${clean}/${n} propres · ${mod} à surveiller.`,`${clean}/${n} clean · ${mod} to watch.`,`${clean}/${n} limpias · ${mod} a vigilar.`)}
  },[beaches,island,lang])
  const ph=(()=>{try{if(typeof HERO_PH_OVERRIDE!=="undefined"&&HERO_PH_OVERRIDE)return HERO_PH_OVERRIDE;const h=new Date().getHours();return h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"}catch(_){return "golden"}})()
  const sky=BEACH_PHASE[ph]||BEACH_PHASE.golden
  // GROUNDING de la carte (fix « elle est un peu vide ») : socle de côte douce + halos
  //   de rivage golden-hour, dessinés LÀ où sont les plages (concave, gère les baies,
  //   AUCUNE fake-île — la lumière = exactement les plages surveillées). Statique = calme.
  //   A/B pw_mapground (override ?mapground=1/0). Filter-free → zéro re-raster au zoom.
  const groundOn=useMemo(()=>{try{const q=window.location.search;if(/[?&]mapground=1/.test(q))return true;if(/[?&]mapground=0/.test(q))return false;return abVariant("pw_mapground",["control","ground"],[.18,.82])==="ground"}catch(_){return true}},[])
  // VERDICT AU TOUCHER (fix dead-clicks #1 : la carte = surface la + tapée-sans-réponse,
  //   2021+2451 dead-clicks). pointerdown sur un point au repos = il fleurit son verdict
  //   RÉEL (couleur scoreColor + nom + verbe) DANS la scène, 1 seul vivant. Tap court =
  //   plongée ; appui maintenu (>280ms) = peek sans plonger. Zéro anim idle (one-shot).
  //   A/B aw_press_verdict (override ?pv=1/0). PAS de setPointerCapture (piège click).
  const pv=useMemo(()=>{try{const q=window.location.search;if(/[?&]pv=1/.test(q))return true;if(/[?&]pv=0/.test(q))return false;return abVariant("aw_press_verdict",["control","press"],[.5,.5])==="press"}catch(_){return false}},[])
  // CARTE-FOG + STREAK DE VEILLE (brief #5, rétention « payer = habitude », Zenly).
  // veille = série de jours consécutifs où l'user ouvre l'app (habitude). consultedRef
  // = plages déjà ouvertes (fog sur les autres). Le fog NE voile JAMAIS la couleur de
  // statut (mémoire) : juste un dim + anneau pointillé « à explorer ». Calme, first-party.
  const veille=useMemo(()=>{try{
    const today=new Date().toISOString().slice(0,10),last=localStorage.getItem("sg_veille_day")
    let streak=parseInt(localStorage.getItem("sg_veille_streak")||"0")||0,best=parseInt(localStorage.getItem("sg_veille_best")||"0")||0
    if(last!==today){const y=new Date(Date.now()-864e5).toISOString().slice(0,10);streak=last===y?streak+1:1;best=Math.max(best,streak)
      try{localStorage.setItem("sg_veille_day",today);localStorage.setItem("sg_veille_streak",String(streak));localStorage.setItem("sg_veille_best",String(best))}catch(_){}
      try{track("sg_veille",{streak,best})}catch(_){}}
    return{streak,best}}catch(_){return{streak:0,best:0}}},[])
  const consultedRef=useRef(null)
  if(consultedRef.current===null){try{consultedRef.current=new Set(JSON.parse(localStorage.getItem("sg_consulted")||"[]"))}catch(_){consultedRef.current=new Set()}}
  const[,setFogTick]=useState(0)
  const fogOn=(()=>{try{return !/[?&]fog=0/.test(window.location.search)}catch(_){return true}})()
  // Dead-click : la carte « lecture du jour » (haut de l'archipel) montre le verdict de TA côte
  // et invite le tap → on la rend tapable (plonge dans la plage). Additif. Rollback : ?lecturetap=0.
  const lectureTapOn=(()=>{try{return !/[?&]lecturetap=0/.test(window.location.search)}catch(_){return true}})()
  const markConsulted=id=>{if(id&&!consultedRef.current.has(id)){consultedRef.current.add(id);try{localStorage.setItem("sg_consulted",JSON.stringify([...consultedRef.current].slice(-400)))}catch(_){};setFogTick(v=>v+1)}}
  return(
    <div ref={wrapRef} role="region" aria-label={_t(lang,"Archipel du Veilleur","The Watcher's Archipelago","Archipiélago del Vigía")} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={onTap}
      style={{position:"fixed",inset:0,zIndex:1006,background:"#04090B",touchAction:"none",overflow:"hidden",cursor:satGrab?"grabbing":"grab"}}>
      {/* LA MARÉE : couche de plongée — la BeachScene de la plage tapée se fond
          plein écran (opacity 0→1) PENDANT que la caméra dolly-in, sur le même
          golden-hour → dissolution continue monde→rivage, puis la fiche monte. */}
      {diving&&(<>
        <style>{`@keyframes mareeDive{from{opacity:0}to{opacity:1}}.maree-dive{animation:mareeDive .46s ease-out both}@media(prefers-reduced-motion:reduce){.maree-dive{animation:none}}`}</style>
        <div className="maree-dive" aria-hidden="true" style={{position:"absolute",inset:0,zIndex:40,pointerEvents:"none"}}>
          <BeachScene beach={diving}/>
        </div>
      </>)}
      {/* CIEL-MONDE immersif (golden-hour vivant) derriere la constellation — le "fond" qui manquait */}
      <svg ref={skyRef} viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{position:"absolute",top:"-7%",left:"-7%",width:"114%",height:"114%",display:"block",pointerEvents:"none",willChange:"transform"}} aria-hidden="true">
        {/* CALME au repos : aucun clignotement. Seulement 2 mouvements TRÈS lents et naturels
            (nuages, Veilleur qui flotte en orbite). La vraie vie vient de l'interaction. */}
        <style>{`@keyframes awsettle{from{transform:translateY(-7px);opacity:.4}to{transform:translateY(0);opacity:1}}.aw-cl{animation:none}.aw-sat{animation:awsettle .8s ease-out 1}@media(prefers-reduced-motion:reduce){.aw-sat{animation:none}}`}</style>
        <defs><linearGradient id="awSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky.sky[0]}/><stop offset=".5" stopColor={sky.sky[1]}/><stop offset=".82" stopColor={sky.sky[2]}/><stop offset="1" stopColor={sky.sky[3]}/></linearGradient>
        <linearGradient id="awSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky.seaT}/><stop offset="1" stopColor={sky.seaB}/></linearGradient></defs>
        <rect width="800" height="600" fill="url(#awSky)"/>
        {/* LA MER golden-hour : le monde N'EST PLUS des points abstraits — c'est la
            scène satellite+mer (signature HeroScene) reproduite ICI, les plages =
            des points qui scintillent sur l'eau. Horizon ~y360, reflet du soleil. */}
        <rect y="360" width="800" height="240" fill="url(#awSea)"/>
        <rect y="358" width="800" height="3" fill={sky.rim} opacity=".42"/>
        {sky.sun==="set"&&<><circle cx="400" cy="250" r="150" fill={sky.glit} opacity=".06"/><circle cx="400" cy="250" r="78" fill={sky.glit} opacity=".10"/><circle cx="400" cy="250" r="46" fill={sky.glit} opacity=".5"/><path d="M376 360 L424 360 L462 600 L338 600 Z" fill={sky.glit} opacity=".09"/></>}
        {sky.sun==="high"&&<path d="M232 360 L268 360 L300 600 L200 600 Z" fill={sky.glit} opacity=".06"/>}
        {sky.sun==="high"&&<><circle cx="250" cy="120" r="60" fill="#FDFCF7" opacity=".16"/><circle cx="250" cy="120" r="32" fill="#FFF4D6"/></>}
        {sky.sun==="moon"&&<><circle cx="280" cy="120" r="46" fill="#9ADCD4" opacity=".07"/><circle cx="280" cy="120" r="22" fill="#E6F2EF"/></>}
        {ph==="night"&&[[80,70],[180,120],[320,60],[470,100],[600,70],[700,140],[150,200],[540,170],[660,210],[400,150]].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.2" fill="#fff" opacity=".45"/>))}
        <g className="aw-cl"><path d="M90 150 q16 -30 54 -28 q20 -20 50 -12 q34 -8 48 14 q28 4 30 28 Z" fill={sky.cloud} opacity=".55"/></g>
        <g className="aw-cl" style={{animationDelay:"-40s"}}><path d="M540 110 q12 -22 40 -20 q16 -14 38 -8 q26 -6 36 12 Z" fill={sky.cloud} opacity=".45"/></g>
        {/* satGRef = offset de DRAG (rigolo : on attrape le Veilleur, son radar suit, il rebondit) */}
        <g ref={satGRef}>
          {/* aw-sat = dérive idle, FIGÉE pendant qu'on le tient pour un drag net */}
          <g className={satGrab?"":"aw-sat"} style={satGrab?{transition:"none"}:undefined}>
            {/* halo de veille STATIQUE : un cône de lumière doux + une lueur, AUCUNE animation
                (le Veilleur observe sans clignoter). La vie n'arrive qu'au contact. */}
            <path d="M560 96 L508 432 L612 432 Z" fill={sky.glit} opacity=".05"/>
            <circle cx="560" cy="92" r="30" fill={sky.glit} opacity=".07"/>
            {/* halo « attrapé » quand on le tient + le Veilleur lui-même */}
            {satGrab&&<circle cx="560" cy="90" r="58" fill={sky.glit} opacity=".18"/>}
            {miVeil(560,90,ph==="day"?"#2A6B66":"#5b3a8e","#3fd07f")}
            {/* bulle de dialogue : le Veilleur râle gentiment quand on l'attrape (ancrée à lui) */}
            {satSay&&<g>
              <path d="M541 60 L557 82 L533 65 Z" fill="rgba(7,32,30,.95)"/>
              <rect x="352" y="25" width="200" height="40" rx="13" fill="rgba(7,32,30,.95)" stroke="rgba(95,211,201,.5)" strokeWidth="1.5"/>
              <text x="452" y="50" textAnchor="middle" fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="15" fontWeight="800" fill="#EAF7F4">{satSay}</text>
            </g>}
            {/* cercle invisible : repère de hit pour le drag (suit dérive + offset) */}
            <circle ref={satHitRef} cx="560" cy="90" r="46" fill="none" pointerEvents="none"/>
          </g>
        </g>
        <line x1="-40" y1="470" x2="840" y2="470" stroke={sky.glit} strokeWidth="2" strokeDasharray="3 16" opacity=".18"/>
        <line x1="-40" y1="520" x2="840" y2="520" stroke={sky.glit} strokeWidth="1.6" strokeDasharray="2 22" opacity=".12"/>
      </svg>
      <svg width="100%" height="100%" style={{position:"absolute",inset:0,display:"block"}} aria-hidden="true">
        <style>{`.aw-pvb{animation:awPvb .14s ease-out both}@keyframes awPvb{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.aw-pvb{animation:none}}`}</style>
        <g ref={gRef}>
          {groundOn&&<g aria-hidden="true">
            <defs>
              <radialGradient id="awGround" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#16383A" stopOpacity=".82"/><stop offset=".6" stopColor="#123031" stopOpacity=".46"/><stop offset="1" stopColor="#123031" stopOpacity="0"/></radialGradient>
              <radialGradient id="awShoreGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFE6A8" stopOpacity=".36"/><stop offset=".55" stopColor="#3fd07f" stopOpacity=".10"/><stop offset="1" stopColor="#3fd07f" stopOpacity="0"/></radialGradient>
            </defs>
            {/* SOCLE DE CÔTE : la terre douce LÀ où sont les plages — concave (gère les baies),
                zéro fake-île. + HALOS de rivage golden-hour (« les plages scintillent sur l'eau »). */}
            <g>{proj.map(p=>(<circle key={"gr"+p.b.id} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="46" fill="url(#awGround)"/>))}</g>
            <g style={{mixBlendMode:"screen"}}>{proj.map(p=>(<circle key={"hl"+p.b.id} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="50" fill="url(#awShoreGlow)"/>))}</g>
          </g>}
          {proj.map((p,i)=>{const b=p.b,col=b.scoreColor||verdictMeta(b.status,lang).color,sc=typeof b.score==="number"?b.score:null,me=i===myIdx,r=sc!=null?5+sc/15:6,fog=fogOn&&!me&&!consultedRef.current.has(b.id)
            return(<g key={b.id} data-beach={b.id} transform={"translate("+p.x.toFixed(1)+" "+p.y.toFixed(1)+")"} style={{cursor:"pointer"}}
              onPointerDown={pv?(()=>{pressStartRef.current=Date.now();pressedRef.current=b.id;setPressed(b.id)}):undefined}
              onClick={ev=>{ev.stopPropagation();if(movedRef.current)return;if(pv&&pressStartRef.current&&Date.now()-pressStartRef.current>280)return;markConsulted(b.id);diveBeach(i,b)}}>
              {me
                ?<g><circle r="40" fill={col} opacity=".14"/><circle r="29" fill={col} opacity=".10"/><circle r="23" fill="#241246" stroke={col} strokeWidth="2.4"/>{sc!=null&&<text y="7" fontFamily="'Anton',sans-serif" fontSize="20" fill="#fff" textAnchor="middle">{sc}</text>}<text y="46" fontFamily="ui-monospace,monospace" fontSize="11" fontWeight="700" fill="#FFD884" textAnchor="middle">{b.name}</text></g>
                :(pv&&pressed===b.id
                  ?(()=>{const vm=verdictMeta(b.status,lang),vb=(vm.verb||"").toUpperCase();return(<g className="aw-pvb">
                      <circle r={r*2.5} fill={col} opacity=".12"/>
                      <circle r={r*2.5} fill="none" stroke={col} strokeWidth="1.6" opacity=".55"/>
                      <circle r={r*1.45} fill={col} opacity=".96"/>
                      <circle r={r*1.45} fill="none" stroke="#03110F" strokeWidth="1.4"/>
                      <circle r={r*0.5} cy={-r*0.28} fill="#fff" opacity=".4"/>
                      <text y={-(r*2.5+9)} textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="16" fill="#EAF7F4" paintOrder="stroke" stroke="#03110F" strokeWidth="3.4" strokeLinejoin="round">{b.name}</text>
                      <text y={r*2.5+21} textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="17" fill={col} paintOrder="stroke" stroke="#03110F" strokeWidth="3.4" strokeLinejoin="round">{vb}</text>
                    </g>)})()
                  :<><circle r={r} fill={col} opacity={fog?.66:.92}/><circle r={r} fill="none" stroke="#06121A" strokeWidth="1.2"/>{fog&&<circle r={r+3.6} fill="none" stroke={col} strokeWidth="1" strokeDasharray="2 3.2" opacity=".4"/>}</>)}
            </g>)})}
        </g>
      </svg>
      {/* rootMode (navWorld) : le monde EST l'app → pas de ✕ qui fermerait sur du vide
          (Leaflet retiré). En fallback ?nav=map, le ✕ ferme vers la carte Leaflet. */}
      {!rootMode&&<button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"absolute",top:"calc(12px + env(safe-area-inset-top))",right:14,zIndex:5,width:40,height:40,borderRadius:"50%",background:"rgba(4,9,11,.55)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:17,cursor:"pointer",backdropFilter:"blur(8px)"}}>✕</button>}
      {ready&&(lecture||my)&&tour==null&&<div {...(lectureTapOn&&my?{role:"button",tabIndex:0,"aria-label":_t(lang,"Voir "+my.name,"See "+my.name,"Ver "+my.name),onClick:e=>{e.stopPropagation();try{track("sg_lecture_tap",{beach_id:my.id})}catch(_){};markConsulted(my.id);diveBeach(myIdx,my)},onKeyDown:e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();try{track("sg_lecture_tap",{beach_id:my.id})}catch(_){};markConsulted(my.id);diveBeach(myIdx,my)}}}:{})} style={{position:"absolute",top:"calc(13px + env(safe-area-inset-top))",left:14,right:64,zIndex:5,display:"flex",alignItems:"center",gap:9,padding:"8px 12px",borderRadius:14,background:"rgba(4,9,11,.5)",border:"1px solid rgba(255,255,255,.14)",backdropFilter:"blur(8px)",color:"#fff",cursor:(lectureTapOn&&my)?"pointer":"default"}}>
        <Veilleur mood={moodFromStatus((lecture&&lecture.mood)||(my&&my.status)||"clean")} size={26}/>
        <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:".05em",color:"rgba(255,255,255,.6)",textTransform:"uppercase"}}>{_t(lang,"Le Veilleur · lecture du jour","The Watcher · today's reading","El Vigía · lectura del día")}</div>
          <div style={{fontSize:13.5,fontWeight:800,whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>{lecture?lecture.text:(<><span style={{color:myVm.color}}>{myVm.emoji} {myVm.verb}</span> · {my.name}</>)}</div>
          {lecture&&my&&<div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.72)",whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>{_t(lang,"Ta côte","Your coast","Tu costa")} · <span style={{color:myVm.color}}>{myVm.verb}</span> · {my.name}</div>}
        </div>
      </div>}
      {/* STREAK DE VEILLE (habitude « payer = revenir ») + progression de découverte
          (Carte-Fog). Calme, statique. rootMode = le monde EST l'app (place du ✕ libre). */}
      {rootMode&&tour==null&&veille.streak>0&&<div aria-label={_t(lang,"Série de veille","Watch streak","Racha")} style={{position:"absolute",top:"calc(13px + env(safe-area-inset-top))",right:14,zIndex:6,display:"flex",alignItems:"center",gap:6,padding:"7px 11px",borderRadius:14,background:"rgba(4,9,11,.5)",border:"1px solid rgba(255,216,132,.34)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>
        <span style={{fontSize:13.5,fontWeight:800,color:"#FFD884",whiteSpace:"nowrap"}}>🔥 {veille.streak}</span>
        {proj.length>0&&<span style={{fontSize:9.5,fontWeight:700,color:"rgba(255,255,255,.55)",whiteSpace:"nowrap"}}>{consultedRef.current.size}/{proj.length}</span>}
      </div>}
      {/* Indice éphémère « touche une plage » (dead-click mer vide). pointerEvents:none = ne capte rien. */}
      {tapHint&&tour==null&&<div aria-hidden="true" style={{position:"absolute",bottom:"calc(84px + env(safe-area-inset-bottom))",left:0,right:0,zIndex:31,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
        <div style={{padding:"8px 14px",borderRadius:999,background:"rgba(4,9,11,.72)",border:"1px solid rgba(95,211,201,.34)",color:"#EAF7F4",fontSize:12.5,fontWeight:700,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",boxShadow:"0 6px 20px rgba(0,0,0,.4)"}}>📍 {_t(lang,"Touche une plage pour son verdict","Tap a beach for its verdict","Toca una playa para su veredicto")}</div>
      </div>}
      {tour==null
        ?<div style={{position:"absolute",bottom:"calc(18px + env(safe-area-inset-bottom))",left:0,right:0,zIndex:30,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
          {/* DOCK IMMORTEL (#3) : nav toujours atteignable depuis le monde — tue le
              cul-de-sac (BottomNav z800 enterrée sous le monde z1006). 3 entrées,
              tout reste DANS le monde : "Toutes" = dézoom (la liste = une profondeur). */}
          <div style={{display:"flex",alignItems:"center",gap:3,padding:"5px 6px",borderRadius:999,background:"rgba(4,9,11,.66)",border:"1px solid rgba(95,211,201,.22)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",boxShadow:"0 8px 28px rgba(0,0,0,.45)",pointerEvents:"auto"}}>
            <button onClick={e=>{e.stopPropagation();try{track("sg_dock",{tab:"near"})}catch(_){}; if(userPos){centerOn(myIdx,MID)}else{pendingCenterRef.current=true;onRequestGeo?onRequestGeo():centerOn(myIdx,MID)}}} style={{padding:"9px 14px",borderRadius:999,background:"transparent",border:"none",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>⌖ {_t(lang,"Près de moi","Near me","Cerca")}</button>
            <button onClick={e=>{e.stopPropagation();try{track("sg_dock",{tab:"all"})}catch(_){}; fitAll()}} style={{padding:"9px 14px",borderRadius:999,background:"transparent",border:"none",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>▦ {_t(lang,"Toutes","All","Todas")}</button>
            {onPremium&&<button onClick={e=>{e.stopPropagation();try{track("sg_dock",{tab:"premium"})}catch(_){}; onPremium()}} style={{padding:"9px 16px",borderRadius:999,background:"linear-gradient(180deg,#FFD884,#F2B05E)",border:"none",color:"#07201E",fontSize:13,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>✦ {_t(lang,"Veilleur","Watcher","Vigía")}</button>}
          </div>
        </div>
        :(()=>{const i=tourOrder[tour],b=proj[i]&&proj[i].b;if(!b)return null;const vm=verdictMeta(b.status,lang),sc=typeof b.score==="number"?b.score:null,afai=typeof b.afai==="number"?b.afai:null
          // A/B pw_freshness (geste Watch Duty : « vérifié il y a 2h » lève l'objection screenshot-périmé). Override ?fresh=1/0.
          const freshLbl=(()=>{try{if(!updatedAt)return null;const q=window.location.search;const on=/[?&]fresh=1/.test(q)?true:/[?&]fresh=0/.test(q)?false:abVariant("pw_freshness",["control","fresh"],[.3,.7])==="fresh";if(!on)return null;const fr=formatFreshness(updatedAt,lang);return fr?(_t(lang,"vérifié","verified","verificado")+" "+fr):null}catch(_){return null}})()
          return(<div onClick={e=>e.stopPropagation()} style={{position:"absolute",left:0,right:0,bottom:0,zIndex:7,padding:"0 12px calc(14px + env(safe-area-inset-bottom))"}}>
            <div style={{maxWidth:520,margin:"0 auto",background:"rgba(7,32,30,.94)",border:"1px solid rgba(95,211,201,.32)",borderRadius:18,padding:"14px 16px",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",color:"#fff",boxShadow:"0 -6px 34px rgba(0,0,0,.5)"}}>
              <div style={{display:"flex",alignItems:"center",gap:11}}>
                {sc!=null&&<ScoreBlob score={sc} color={b.scoreColor||vm.color} size={50}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".06em",color:"rgba(255,255,255,.5)"}}>{(tour+1)+" / "+tourOrder.length} · {_t(lang,"VISITE","TOUR","VISITA")}</div>
                  <div style={{fontSize:17,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</div>
                  <div style={{fontSize:13,fontWeight:700,color:vm.color}}>{vm.emoji} {vm.verb}{b.commune?" · "+b.commune:""}</div>
                  {freshLbl&&<div style={{fontSize:10.5,fontWeight:700,color:"#3fd07f",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>🛰️ {freshLbl}</div>}
                </div>
                <Veilleur mood={moodFromStatus(b.status)} size={34}/>
              </div>
              <div style={{margin:"9px 0 0",fontSize:12.5,lineHeight:1.45,color:"rgba(255,255,255,.82)"}}>🛰️ {afai!=null?"AFAI "+afai.toFixed(2)+" — ":""}{b.status==="clean"?_t(lang,"le satellite voit une eau claire aujourd'hui.","satellite sees clear water today.","el satélite ve agua clara hoy."):b.status==="moderate"?_t(lang,"présence d'algues modérée repérée par satellite.","moderate algae seen by satellite.","presencia moderada vista por satélite."):_t(lang,"échouage repéré par satellite — évite aujourd'hui.","beaching seen by satellite — avoid today.","varazón vista por satélite — evita hoy.")}</div>
              <WorldAfaiGauge afai={b.afai} lang={lang}/>
              <div style={{display:"flex",gap:8,marginTop:11,alignItems:"center"}}>
                <button onClick={()=>tourGo(tour-1)} aria-label={_t(lang,"Précédente","Previous","Anterior")} style={{width:44,height:44,borderRadius:14,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:18,cursor:tour===0?"default":"pointer",opacity:tour===0?.4:1}}>↑</button>
                <button onClick={()=>{try{track("sg_archipel_tour_open",{beach_id:b.id})}catch(_){}; onOpenBeach&&onOpenBeach(b)}} style={{flex:1,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:14.5,fontWeight:800,color:"#07201E",background:"linear-gradient(180deg,#FFD884,#F2B05E)"}}>{_t(lang,"Découvrir cette plage →","Explore this beach →","Descubrir esta playa →")}</button>
                <button onClick={()=>tourGo(tour+1)} aria-label={_t(lang,"Suivante","Next","Siguiente")} style={{width:44,height:44,borderRadius:14,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:18,cursor:tour>=tourOrder.length-1?"default":"pointer",opacity:tour>=tourOrder.length-1?.4:1}}>↓</button>
              </div>
              <div style={{textAlign:"center",marginTop:8,fontSize:11,color:"rgba(255,255,255,.45)"}}>{_t(lang,"↕ scrolle ou swipe pour changer de plage","↕ scroll or swipe to change beach","↕ desliza para cambiar")}</div>
              <div style={{display:"flex",justifyContent:"center",gap:18,marginTop:8}}>
                <button onClick={exitTour} style={{background:"none",border:"none",color:"rgba(255,255,255,.6)",fontSize:12.5,fontWeight:700,cursor:"pointer"}}>← {_t(lang,"Explorer librement","Explore freely","Explorar libre")}</button>
              </div>
            </div>
          </div>)})()}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE JOURNAL DU VEILLEUR — accueil "nouveautés" des visiteurs qui reviennent.
   Montré 1×/release (clé sg_rel_seen) à un visiteur CONNU, JAMAIS au tout 1er
   passage. NON destructif : aucun reload (le nouveau bundle est déjà servi en
   network-first) — c'est une scène golden-hour plein écran, fermable, qui
   "rattrape" ce qu'on a publié en son absence puis le repose sur sa plage live.
   Contenu = public/release-notes.json. Gated A/B `wn1`. Conversion-aware.
   ═══════════════════════════════════════════════════════════════════════════ */
function WhatsNewJournal({lang,title,items,releaseV,releaseDate,allowDeepLinks,isPremium,mood="scan",onClose,onExplore,onPremium}){
  useEffect(()=>{try{track("sg_whatsnew_view",{v:releaseV,items:items.length})}catch(_){}},[])// eslint-disable-line
  const L=(it)=>it[lang]||it.fr
  const ttl=title?(title[lang]||title.fr):_t(lang,"Pendant ton absence","While you were away","Mientras no estabas")
  const go=(href)=>{try{track("sg_whatsnew_item",{v:releaseV,href})}catch(_){};try{s("sg_rel_seen",releaseV)}catch(_){};try{window.location.href=href}catch(_){}}
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Nouveautés","What's new","Novedades")}
      style={{position:"fixed",inset:0,zIndex:1072,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",
        background:"linear-gradient(180deg,#0B2230 0%,#155A5A 38%,#C97E3A 76%,#F2B05E 100%)",
        animation:"viewFadeIn .4s cubic-bezier(.22,1,.36,1) both"}}>
      <div aria-hidden style={{position:"absolute",left:"50%",bottom:"-22%",width:"140%",height:"62%",transform:"translateX(-50%)",
        background:"radial-gradient(closest-side,rgba(255,216,132,.5),rgba(255,216,132,0))",pointerEvents:"none"}}/>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
        style={{position:"fixed",top:"calc(12px + env(safe-area-inset-top))",right:12,zIndex:6,width:42,height:42,borderRadius:21,
          background:"rgba(7,32,30,.5)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
          border:"1px solid rgba(255,255,255,.2)",color:"#fff",fontSize:16,cursor:"pointer"}}>✕</button>

      <div style={{position:"relative",maxWidth:460,margin:"0 auto",minHeight:"100%",display:"flex",flexDirection:"column",
        justifyContent:"center",padding:"max(40px,11vh) 22px max(26px,env(safe-area-inset-bottom)) 22px",boxSizing:"border-box"}}>
        {/* Humeur du Veilleur branchée sur l'état RÉEL du littoral (jamais 'serein' figé). */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:6}}><Veilleur mood={mood} size={70}/></div>
        <div style={{textAlign:"center",fontSize:11.5,fontWeight:800,letterSpacing:".16em",textTransform:"uppercase",color:"#FFD884",marginBottom:7}}>
          {_t(lang,"Content de te revoir","Good to see you back","Qué bueno verte")}
        </div>
        <h2 style={{margin:"0 0 8px",textAlign:"center",fontFamily:"'Anton',Impact,Haettenschweiler,'Arial Narrow',sans-serif",fontWeight:400,
          textTransform:"uppercase",letterSpacing:"-.02em",lineHeight:1.02,color:"#fff",
          fontSize:"clamp(30px,8vw,42px)",textShadow:"0 2px 24px rgba(0,0,0,.35)"}}>{ttl}</h2>
        <p style={{margin:"0 auto 20px",textAlign:"center",maxWidth:360,fontSize:14,lineHeight:1.5,color:"rgba(255,255,255,.82)"}}>
          {_t(lang,"On a continué à veiller pendant que tu n'étais pas là. Voilà ce qui a changé.",
                  "We kept watch while you were gone. Here's what changed.",
                  "Seguimos vigilando mientras no estabas. Esto fue lo que cambió.")}
        </p>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {items.map((it,i)=>{
            const clickable=allowDeepLinks&&it.href&&it.href.startsWith("/")
            return(
            <div key={i} onClick={clickable?()=>go(it.href):undefined}
              style={{display:"flex",alignItems:"center",gap:13,padding:"13px 15px",borderRadius:16,
                background:"rgba(255,252,247,.95)",border:"1px solid rgba(255,255,255,.5)",
                boxShadow:"0 8px 26px rgba(7,32,30,.22)",cursor:clickable?"pointer":"default",
                animation:`viewFadeIn .5s cubic-bezier(.22,1,.36,1) ${(0.06*i+0.12).toFixed(2)}s both`}}>
              <div style={{flexShrink:0,width:40,height:40,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:21,background:"linear-gradient(180deg,#FFE47A,#F2B05E)"}}>{it.emoji||"✨"}</div>
              <div style={{flex:1,fontSize:13.5,lineHeight:1.42,fontWeight:600,color:"#15110A"}}>{L(it)}</div>
              {clickable&&<div style={{flexShrink:0,color:"#B87A00",fontSize:18,fontWeight:800}}>→</div>}
            </div>)
          })}
        </div>

        <button onClick={onExplore}
          style={{marginTop:22,width:"100%",padding:"16px",borderRadius:16,border:"none",cursor:"pointer",
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:16,fontWeight:800,color:"#0D0D0D",
            background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E8A800)",boxShadow:"0 10px 30px rgba(232,168,0,.4)"}}>
          {_t(lang,"Voir ma plage en direct →","See my beach live →","Ver mi playa en vivo →")}
        </button>

        {!isPremium&&(
          // Lien premium DISCRET mais bien cliquable (→ openPremium). Posé sur le BAS golden
          // clair du dégradé → texte ENCRE (#0D0D0D ≈8:1 sur #F2B05E), pas blanc (le blanc y
          // tombait à ~1.9:1, le text-shadow ne compte pas WCAG). Picto SVG ink (plus de 🛰️ OS).
          <button onClick={onPremium} style={{marginTop:13,background:"none",border:"none",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:7,
            color:"#0D0D0D",fontSize:13,fontWeight:800,fontFamily:"inherit",textAlign:"center",width:"100%",
            textShadow:"none"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{flexShrink:0}}>
              <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#07201E"/>
              <circle cx="12" cy="12" r="1.1" fill="#FFE47A"/>
              <path d="M9 11 4.4 8M15 11 19.6 8" stroke="#07201E" strokeWidth="1.6" strokeLinecap="round" opacity=".9"/>
              <rect x="3" y="6.2" width="3" height="3.4" rx=".7" fill="#07201E" opacity=".9"/>
              <rect x="18" y="6.2" width="3" height="3.4" rx=".7" fill="#07201E" opacity=".9"/>
            </svg>
            {_t(lang,"Le Veilleur personnel veille TA plage pour toi →",
                      "Your personal Watcher keeps an eye on YOUR beach →",
                      "El Vigía personal cuida TU playa por ti →")}
          </button>
        )}
        <div style={{textAlign:"center",marginTop:14,fontSize:10.5,color:"rgba(13,13,13,.65)"}}>{releaseV}{releaseDate?" · "+releaseDate:""}</div>
      </div>
    </div>
  )
}

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
  const[diveBeach,setDiveBeach]=useState(null) // overlay plongée carte→plage (1×/session, flag nav_dive)
  const[diveFail,setDiveFail]=useState(null) // id de la plage dont la fiche plongée a KO → fallback BeachSheet (jamais "rien")
  const[initialZone,setInitialZone]=useState(null)

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
  // Ancien coachmark désactivé : remplacé par ArenaOnboarding (flow 3 étapes plein cadre).
  const[showOnboarding,setShowOnboarding]=useState(false)
  const[showPremium,setShowPremium]=useState(false)
  const[showChat,setShowChat]=useState(false) // assistant guidé (SargaChat)
  const[premiumSource,setPremiumSource]=useState(null)
  const[showCaptureGate,setShowCaptureGate]=useState(false)
  const[captureGateSrc,setCaptureGateSrc]=useState("")
  // Journal du Veilleur (nouveautés pour visiteurs qui reviennent) : null OU
  // {v,date,title,items}. Rempli par l'effet release-notes (gated A/B wn1) ci-dessous.
  const[whatsNew,setWhatsNew]=useState(null)
  const[showFavToast,setShowFavToast]=useState(false)
  const[isPremium,setIsPremium]=useState(()=>{
    // ?pass= RÉ-ARME TOUJOURS l'accueil onboarding, MÊME pour un premium de retour (sinon les
    // early-returns ci-dessous — sg_premium / sg_premium_pass_end actifs — sautaient le bloc qui
    // pose sg_premium_welcome → l'onboarding « ne faisait rien » au 2e chargement du lien). Bug
    // fondateur. Le flag est consommé par le useState showWelcome plus bas.
    try{ const pp=new URLSearchParams(window.location.search).get("pass"); if(pp&&(pp==="trip"||/^p\d{1,3}$/.test(pp))) s("sg_premium_welcome",true) }catch(_){}
    if(g("sg_premium",false))return true
    // Zero-friction 24h sample: local trial, no card required. Used at most once per device.
    try{
      const sampleUntil=parseInt(localStorage.getItem("sg_sample_until")||"0")
      if(sampleUntil>Date.now())return true
    }catch{}
    // Trip Pass (USD) : accès TIME-BOXÉ 7 jours, séparé du flag sg_premium
    // permanent (un paiement one-time NE DOIT PAS donner un accès à vie).
    try{
      const passEnd=parseInt(localStorage.getItem("sg_premium_pass_end")||"0")
      if(passEnd>Date.now())return true
    }catch{}
    try{
      const params=new URLSearchParams(window.location.search)
      // Stripe redirect: ?premium=1 OR ?session_id=cs_xxx
      const sessionId=params.get("session_id")
      // Trip Pass one-time : ?pass=trip → pose une expiration 7j AU LIEU du flag
      // permanent. DOIT être testé AVANT le bloc générique (qui, lui, lit
      // session_id et poserait sg_premium=1 à vie). Revenu loggé pareil (le
      // webhook gère checkout.session.completed pour les sessions mode=payment).
      // Pass one-time TIME-BOXÉ : ?pass=trip (7j, rétrocompat) OU ?pass=pNN (NN jours,
      // ex pass vacances p30). Pose une expiration AU LIEU du flag premium permanent.
      const passParam=params.get("pass")
      if(passParam&&(passParam==="trip"||/^p\d{1,3}$/.test(passParam))){
        const days=passParam==="trip"?7:Math.min(120,Math.max(1,parseInt(passParam.slice(1),10)||7))
        const end=Date.now()+days*86400000
        try{localStorage.setItem("sg_premium_pass_end",String(end))}catch{}
        s("sg_premium_welcome",true)
        track("sg_conversion",{session_id:sessionId||"pass",plan:passParam,pass_days:days})
        if(sessionId){
          try{fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec",{
            method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},
            body:JSON.stringify({type:"checkout.session.completed",data:{object:{id:sessionId,payment_status:"paid",
              metadata:{island:IS_NEW_REGION?REGION.id.toUpperCase():window.location.hostname.includes("guadeloupe")?"GP":"MQ",plan:passParam}}}})
          }).catch(()=>{})}catch(ex){}
        }
        // Ne retire QUE les params de paiement (sinon b=, r=, utm_* co-occurrents
        // sont perdus → on casse le deeplink/contexte du payeur). Pattern aligné
        // sur les autres replaceState (manage/premium_email).
        params.delete("pass");params.delete("session_id");params.delete("premium");params.delete("success")
        {const qs=params.toString();window.history.replaceState({},"",window.location.pathname+(qs?"?"+qs:""))}
        return true
      }
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
        params.delete("premium");params.delete("success");params.delete("session_id");params.delete("pass")
        {const qs=params.toString();window.history.replaceState({},"",window.location.pathname+(qs?"?"+qs:""))}
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
  // Gating J+2→J+7 : re-déclenche le fetch principal (donc fetchFullForecast +
  // recalcul de l'interpolation) quand l'utilisateur DEVIENT premium en cours de
  // session (paiement/restauration) → il voit J+2-6 sans recharger. Pas de double
  // run au mount pour un premium déjà connu (garde par ref).
  const[premiumTick,setPremiumTick]=useState(0)
  const fcRetryRef=useRef(0) // retry borné (1) de la prévision étendue si premium + forecast.php KO transitoire
  const _premWasTrue=useRef(isPremium) // snapshot initial (premium déjà connu au mount)
  useEffect(()=>{
    if(isPremium&&!_premWasTrue.current){ _premWasTrue.current=true; setPremiumTick(t=>t+1) }
  },[isPremium])
  // « Premium activé » — confirmation EXPLICITE + robuste (non-lazy) AVANT l'onboarding.
  // Sans elle, le client qui vient de payer atterrit sur « choisis tes plages » et croit que
  // « ça fait rien » → panique/remboursement. zÉRO logique paiement, réversible ?paidsplash=0.
  const paidSplashOn=useMemo(()=>{try{return !/[?&]paidsplash=0(?:&|$)/.test(window.location.search)}catch(_){return true}},[])
  const[splashDone,setSplashDone]=useState(false)
  // A/B `pw_onboard` : onboarding guidé payant (favoris→notif→brief) vs toast 5s (control).
  // ACTIVÉ 100% ([0,1]) le 18/06 (feu vert fondateur « lance ») — vu le faible volume de
  // payeurs un A/B serait trop lent à lire ; tout nouveau payeur a le setup guidé. Override
  // ?onboard=0 re-force le toast (sécurité). RÉCOLTÉ 2026-06-19 (loop ab-eval) : le poids [0,1]
  // renvoyait déjà toujours "onboard" → abVariant retiré (ne servait qu'à injecter le bruit
  // ab_pw_onboard dans track() + polluer l'eval). Réversible : restaurer abVariant("pw_onboard",["control","onboard"],[.5,.5]).
  const pwOnboard=useMemo(()=>{try{const q=window.location.search;if(/[?&]onboard=1/.test(q))return"onboard";if(/[?&]onboard=0/.test(q))return"control";return"onboard"}catch(_){return"control"}},[])
  // Toast 5s : auto-dismiss UNIQUEMENT en control. En onboarding, l'overlay reste jusqu'à onDone.
  useEffect(()=>{if(showWelcome&&pwOnboard!=="onboard"){track("sg_welcome_toast_view");const t=setTimeout(()=>setShowWelcome(false),5000);return()=>clearTimeout(t)}},[showWelcome,pwOnboard])

  // ── Retour 3DS Mollie (?mollie_return=1) : confirme le paiement côté serveur
  // (source de vérité), pose le premium en localStorage, puis reload propre. ───
  useEffect(()=>{
    try{
      if(new URLSearchParams(window.location.search).get("mollie_return")!=="1")return
      let ctx=null;try{ctx=JSON.parse(sessionStorage.getItem("sg_mollie_pending")||"null")}catch(_){}
      const clean=()=>{try{sessionStorage.removeItem("sg_mollie_pending")}catch(_){}try{window.location.replace(window.location.pathname)}catch(_){}}
      if(!ctx||!ctx.paymentId){clean();return}
      fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"payment_status",paymentId:ctx.paymentId})})
        .then(r=>r.json()).then(d=>{
          if(d&&d.paid){
            try{localStorage.setItem("sg_email",ctx.email||"")
              if(ctx.pass){localStorage.setItem("sg_premium_pass_end",String(Date.now()+((ctx.days||7)*86400000)))}
              else{localStorage.setItem("sg_premium","1");if(ctx.email)localStorage.setItem("sg_premium_email",ctx.email)}
              // Le reload (clean()) perd l'état mémoire onActivated → poser le flag pour
              // que showWelcome déclenche splash « Premium activé » + PaidOnboarding,
              // comme le chemin inline. Sinon le payeur 3DS atterrit sans confirmation.
              localStorage.setItem("sg_premium_welcome","1")
            }catch(_){}
            track("sg_conversion",{session_id:ctx.paymentId,method:ctx.pass?"mollie_pass":"mollie",plan:ctx.pass||ctx.plan})
          }
          clean()
        }).catch(async()=>{
          // payment_status injoignable (réseau) : le paiement a pu réussir côté
          // serveur (webhook). Avant d'abandonner, on tente la vérif d'abo par email
          // → évite de perdre un vrai payeur sur un blip réseau au retour 3DS.
          try{const v=ctx.email?await sgVerifySub(ctx.email):null
            if(v&&v.active){localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",ctx.email);localStorage.setItem("sg_premium_welcome","1");track("sg_conversion",{session_id:ctx.paymentId,method:"mollie_3ds_fallback",plan:ctx.plan})}
          }catch(_){}
          clean()
        })
    }catch(_){}
  },[])
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
      // Gestion abo, provider-aware. On route vers le provider où vit RÉELLEMENT
      // l'abonnement, PAS le provider de checkout courant (PAY_PROVIDER) : tous les
      // abos récurrents B2C sont sur Stripe legacy, Mollie B2C = pass-only (zéro abo
      // récurrent — le chemin Mollie reste dormant). On honore d'abord ?prov= (posé
      // par l'email de bienvenue qui CONNAÎT le provider du payeur), sinon défaut
      // Stripe (Customer Portal hébergé : résilier, changer de carte, voir les
      // factures). Avant ce fix, le défaut PAY_PROVIDER='mollie' envoyait tout abonné
      // Stripe vers un cancel Mollie → 404 « no subscription » → cul-de-sac « écris-moi ».
      const prov=(params.get("prov")||"").toLowerCase()
      const doManage=(addr)=>{
        if(prov==="paypal"){
          if(!window.confirm(_t(lang,"Annuler ton abonnement Premium ? Tu gardes l'accès jusqu'à la fin de la période déjà payée.","Cancel your Premium subscription? You keep access until the end of the paid period.","¿Cancelar tu suscripción Premium? Conservas el acceso hasta el final del período pagado.")))return
          track("sg_manage_cancel_click",{provider:"paypal"})
          fetch("/api/paypal.php",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"cancel_subscription",email:addr})
          }).then(r=>r.json()).then(d=>{
            if(d.cancelled){track("sg_manage_cancel_ok");sgToast({tone:"success",title:_t(lang,"Abonnement annulé","Subscription cancelled","Suscripción cancelada"),msg:_t(lang,"Tu gardes l'accès jusqu'à la fin de la période payée.","You keep access until the end of the paid period.","Conservas el acceso hasta el final del período pagado.")})}
            else{track("sg_manage_cancel_error",{error:d.error||"not_cancelled"});sgToast({tone:"error",title:_t(lang,"Annulation impossible","Couldn't cancel","No se pudo cancelar"),msg:_t(lang,"Écris-moi à "+SUPPORT_EMAIL+" et je m'en occupe.","Write to me at "+SUPPORT_EMAIL+" and I'll handle it.","Escríbeme a "+SUPPORT_EMAIL+" y me encargo.")})}
          }).catch(e=>{track("sg_manage_cancel_error",{error:e?.message||"network"});sgToast({tone:"error",title:_t(lang,"Connexion impossible","Connection failed","Sin conexión"),msg:_t(lang,"Réessaie dans un instant.","Try again in a moment.","Inténtalo de nuevo en un momento.")})})
          return
        }
        if(prov==="mollie"){
          if(!window.confirm(_t(lang,"Annuler ton abonnement Premium ? Tu gardes l'accès jusqu'à la fin de la période déjà payée.","Cancel your Premium subscription? You keep access until the end of the paid period.","¿Cancelar tu suscripción Premium? Conservas el acceso hasta el final del período pagado.")))return
          track("sg_manage_cancel_click",{provider:"mollie"})
          fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"cancel_subscription",email:addr})
          }).then(r=>r.json()).then(d=>{
            if(d.cancelled){track("sg_manage_cancel_ok");sgToast({tone:"success",title:_t(lang,"Abonnement annulé","Subscription cancelled","Suscripción cancelada"),msg:_t(lang,"Tu gardes l'accès jusqu'à la fin de la période payée.","You keep access until the end of the paid period.","Conservas el acceso hasta el final del período pagado.")})}
            else{track("sg_manage_cancel_error",{error:d.error||"not_cancelled"});sgToast({tone:"error",title:_t(lang,"Annulation impossible","Couldn't cancel","No se pudo cancelar"),msg:_t(lang,"Écris-moi à "+SUPPORT_EMAIL+" et je m'en occupe.","Write to me at "+SUPPORT_EMAIL+" and I'll handle it.","Escríbeme a "+SUPPORT_EMAIL+" y me encargo.")})}
          }).catch(e=>{track("sg_manage_cancel_error",{error:e?.message||"network"});sgToast({tone:"error",title:_t(lang,"Connexion impossible","Connection failed","Sin conexión"),msg:_t(lang,"Réessaie dans un instant.","Try again in a moment.","Inténtalo de nuevo en un momento.")})})
          return
        }
        track("sg_manage_portal_open")
        fetch("/api/create-checkout.php",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"portal",email:addr})
        }).then(r=>r.json()).then(d=>{
          if(d.url){window.location.href=d.url;return}
          track("sg_manage_portal_error",{error:d.error||"no_url"})
          sgToast({tone:"error",title:d.error||_t(lang,"Gestion indisponible","Management unavailable","Gestión no disponible"),msg:_t(lang,"Écris-moi à "+SUPPORT_EMAIL+".","Write to me at "+SUPPORT_EMAIL+".","Escríbeme a "+SUPPORT_EMAIL+".")})
        }).catch(e=>{track("sg_manage_portal_error",{error:e?.message||"network"});sgToast({tone:"error",title:_t(lang,"Connexion impossible","Connection failed","Sin conexión"),msg:_t(lang,"Réessaie dans un instant.","Try again in a moment.","Inténtalo de nuevo en un momento.")})})
      }
      if(em){
        if(urlEmail)localStorage.setItem("sg_premium_email",urlEmail)
        doManage(em)
      }else{
        const promptEmail=prompt(_t(lang,"Entre ton email pour gerer ton abonnement :","Enter your email to manage your subscription:","Introduce tu email para gestionar tu suscripción:"))
        if(promptEmail&&promptEmail.includes("@")){
          localStorage.setItem("sg_premium_email",promptEmail)
          doManage(promptEmail)
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
      sgVerifySub(pEmail).then(d=>{
        if(d.active){
          // Pass one-time : accès TIME-BOXÉ (passEnd en ms) → sg_premium_pass_end, pas
          // le flag permanent sg_premium. isPremium dérive du pass_end → setIsPremium(true) OK.
          if(d.passEnd&&d.kind==="pass"){
            localStorage.setItem("sg_premium_pass_end",String(d.passEnd))
            localStorage.setItem("sg_premium_email",pEmail)
            localStorage.setItem("sg_email",pEmail)
          }else{
            localStorage.setItem("sg_premium","1")
            localStorage.setItem("sg_premium_email",pEmail)
            localStorage.setItem("sg_email",pEmail) // canonique : fetchFullForecast + lead capture lisent sg_email
            if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
          }
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

  // « Retrouver mon accès » — logique réutilisable (deep-link ?restore=1 ET entrée Header
  // « Mon accès »). Invite l'e-mail de paiement → sgVerifySub → débloque (gère le Pass
  // time-boxé via passEnd, comme ?premium_email=). Pour tout acheteur ayant perdu son accès
  // (cross-device / migration). Jamais de cul-de-sac : email introuvable → toast + contact.
  const openAccessCheck=useCallback((src)=>{
    try{
      // Abonné RÉCURRENT actif (flag sg_premium="1", PAS un Pass time-boxé qui ne fait
      // qu'expirer) : « Mon accès » devient GÉRER / RÉSILIER, à tout moment et 100 %
      // self-serve (le client résilie seul, sans nous écrire — conformité + zéro SAV).
      // On déclenche le flux ?manage=1 (Customer Portal Stripe : résilier, carte,
      // factures). Rollback ?manageaccess=0 → ancien comportement « restaurer » partout.
      const manageOff=/[?&]manageaccess=0/.test(window.location.search)
      const subEmail=localStorage.getItem("sg_premium_email")||localStorage.getItem("sg_email")||""
      const isRecurringSub=localStorage.getItem("sg_premium")==="1"&&!localStorage.getItem("sg_premium_pass_end")
      if(!manageOff&&isRecurringSub&&subEmail.includes("@")){
        track("sg_manage_open_from_access",{src:src||"header"})
        const u=new URL(window.location.href)
        u.searchParams.set("manage","1");u.searchParams.set("email",subEmail);u.searchParams.set("prov","stripe")
        window.location.assign(u.pathname+u.search)
        return
      }
      const em=window.prompt(_t(lang,"Entre l'e-mail utilisé pour ton paiement :","Enter the email used for your payment:","Introduce el email usado para tu pago:"))
      if(em&&em.includes("@")){
        const addr=em.trim()
        sgVerifySub(addr).then(d=>{
          if(d.active){
            if(d.passEnd&&d.kind==="pass"){
              localStorage.setItem("sg_premium_pass_end",String(d.passEnd))
              localStorage.setItem("sg_premium_email",addr);localStorage.setItem("sg_email",addr)
            }else{
              localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",addr)
              if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
            }
            setIsPremium(true);setShowWelcome(true)
            try{sgToast({tone:"success",title:_t(lang,"Accès retrouvé ✅","Access restored ✅","Acceso recuperado ✅"),msg:_t(lang,"Ton Pass est de nouveau actif sur cet appareil.","Your Pass is active again on this device.","Tu Pase vuelve a estar activo en este dispositivo.")})}catch(_){}
            track("sg_premium_unlock_from_email",{status:d.status||"restore_link",src:src||"restore_link"})
          }else{
            try{sgToast({tone:"info",title:_t(lang,"Accès introuvable","Access not found","Acceso no encontrado"),msg:_t(lang,"Aucun accès actif pour cet e-mail. Écris à alerte@sargasses-martinique.com et on règle ça.","No active access for this email. Email alerte@sargasses-martinique.com and we'll sort it.","Sin acceso activo para este email. Escribe a alerte@sargasses-martinique.com y lo resolvemos.")})}catch(_){}
            track("sg_premium_unlock_failed",{reason:d.reason||d.error||"inactive",src:src||"restore_link"})
          }
        }).catch(e=>track("sg_premium_unlock_failed",{reason:e?.message||"network",src:src||"restore_link"}))
      }
    }catch{}
  },[lang])

  // Deep-link ?restore=1 (app / accusé de réception / email de bienvenue) → openAccessCheck.
  // Rollback ?restore=0.
  useEffect(()=>{
    if(isPremium)return
    try{
      const q=window.location.search
      if(!/[?&]restore=1/.test(q)||/[?&]restore=0/.test(q))return
      openAccessCheck("restore_link")
      const params=new URLSearchParams(q);params.delete("restore")
      const qs=params.toString();window.history.replaceState({},"",window.location.pathname+(qs?"?"+qs:""))
    }catch{}
  },[])

  // Analytics: session start
  useEffect(()=>{track("sg_session_start",{island,is_premium:isPremium,is_returning:!!g("sg_seen",0)});s("sg_seen",1)},[])

  // Redirect old query params to new narrative stations
  useEffect(()=>{
    try{
      const q=window.location.search
      if(/[?&]decouverte(=[^&]*)?/.test(q)){
        const l=getLang()
        const target=l==="en"?"/en/understanding-sargassum/":"/comprendre-sargasses/"
        window.location.replace(target)
        return
      }
      if(/[?&]solutions(=[^&]*)?/.test(q)){
        window.location.replace("/nettoyer-sargasses/")
        return
      }
    }catch(_){}
  },[])


  // stripe.js à l'idle (3s post-load) : la 1re connexion js.stripe.com mesurée
  // 15-22s à froid (TLS 9s) sur réseau Caraïbe — preconnect (index.html) + charge
  // tôt pour qu'il soit en cache AVANT que l'utilisateur ouvre le paywall.
  // GATE provider : le PSP par défaut est Mollie → ~tous les sessions n'ouvrent
  // JAMAIS un checkout Stripe. On ne préchauffe donc js.stripe.com QUE si le
  // provider actif est Stripe (?pay=stripe). Le chemin on-demand (ouverture du
  // paywall) charge toujours Stripe.js au besoin — zéro impact checkout.
  useEffect(()=>{
    if(PAY_PROVIDER!=="stripe")return
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

  // INTENTION EXPLICITE (cloche header, bouton onboarding « Activer les alertes ») : on FORCE.
  // Bug corrigé : le one-shot guard `sg_push_loaded_once` rendait la cloche MUETTE (no-op
  // silencieux) si OneSignal avait déjà été chargé une fois sans abonnement réel — l'utilisateur
  // tapait, rien ne se passait, aucun prompt « à aucun moment ». Ici on bypasse le guard ET on
  // re-pousse requestPermission via OneSignalDeferred (iOS PWA exige un geste : le re-push depuis
  // le tap remet la demande en contexte ; un 2e essai à 1,5 s couvre le chargement async du SDK).
  const forceEnablePush=useCallback((trigger)=>{
    try{
      pushLoadedRef.current=true
      try{s("sg_push_loaded_once",1)}catch(_){}
      window.loadOneSignal?.()
      const ask=()=>{ try{ window.OneSignalDeferred=window.OneSignalDeferred||[]; window.OneSignalDeferred.push(function(O){ try{ O&&O.Notifications&&O.Notifications.requestPermission&&O.Notifications.requestPermission() }catch(_){} }) }catch(_){} }
      ask(); setTimeout(ask,1500)
      try{sgToast({tone:"info",msg:_t(lang,"On prépare tes alertes — accepte la demande qui s'affiche 🔔","Setting up your alerts — accept the prompt that appears 🔔","Preparando tus alertas — acepta el aviso que aparece 🔔")})}catch(_){}
      try{track("sg_push_force_enable",{trigger})}catch(_){}
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
      // Jamais de soft-ask à FROID : exiger un vrai signal d'engagement
      // (≥1 fiche plage ouverte OU ≥1 favori). Sinon on promet des alertes sur
      // des « favoris » inexistants au 1er paint et on brûle le cooldown 7j.
      const opened=parseInt(sessionStorage.getItem("sg_beach_views")||"0",10)>0
      const favs=g("sg_fav",[])
      const hasFav=Array.isArray(favs)&&favs.length>0
      if(!opened&&!hasFav)return
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
  // Diffe contre le dernier set synchronisé pour RETIRER les tags des favoris
  // supprimés : sans ça les fav_<id> s'accumulaient (toggleFav couvrait le retrait
  // unitaire, mais pas les changements batch/programmatiques) → push sur des
  // plages que l'utilisateur ne suit plus.
  const syncedFavsRef=useRef([])
  useEffect(()=>{
    try{
      if(!window.OneSignalDeferred)return
      window.OneSignalDeferred.push(function(O){
        if(isPremium)O.User.addTag("sg_premium","1")
        else O.User.removeTag("sg_premium")
        O.User.addTag("sg_island",island)
        const cur=Array.isArray(favorites)?favorites:[]
        for(const fid of syncedFavsRef.current){ if(!cur.includes(fid))O.User.removeTag("fav_"+fid) }
        for(const fid of cur)O.User.addTag("fav_"+fid,"1")
        syncedFavsRef.current=cur
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
        localStorage.setItem("sg_referred_by",JSON.stringify({code:refCode,ts:Date.now()}))
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

  // Parrainage — RÉCOMPENSE PARRAIN : l'app réclame les jours de pass gagnés quand un
  // filleul a payé (crédit serveur par code, ledger Mollie). On étend le pass local +
  // toast. Throttle 12h (sg_refclaim_ts), idempotent serveur (remis à 0 au claim).
  // Réversible ?refrewards=0. C'est le moteur viral du modèle pass-only : partager = gagner.
  useEffect(()=>{
    try{
      if(new URLSearchParams(window.location.search).get("refrewards")==="0")return
      const last=parseInt(localStorage.getItem("sg_refclaim_ts")||"0")
      if(last&&Date.now()-last<12*3600000)return
      const code=sgMyReferralCode()
      if(!/^REF-[A-Z0-9]{6}$/.test(code))return
      const t=setTimeout(()=>{
        try{localStorage.setItem("sg_refclaim_ts",String(Date.now()))}catch(_){}
        fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"claim_referral_credit",code})})
          .then(r=>r.json()).then(d=>{
            const days=Math.max(0,Math.min(365,parseInt(d&&d.days)||0))
            if(days<=0)return
            const cur=parseInt(localStorage.getItem("sg_premium_pass_end")||"0")
            const end=Math.max(Date.now(),cur||0)+days*86400000
            try{localStorage.setItem("sg_premium_pass_end",String(end))}catch(_){}
            try{setIsPremium(true)}catch(_){}
            track("sg_referral_reward_claimed",{days})
            try{sgToast({tone:"success",title:_t(lang,"Merci d'avoir partagé 🌊","Thanks for sharing 🌊","Gracias por compartir 🌊"),msg:_t(lang,`Un filleul a pris un pass — +${days} jours de Veilleur pour toi.`,`A friend got a pass — +${days} Watchman days for you.`,`Un amigo tomó un pase — +${days} días de Vigía para ti.`)})}catch(_){}
          }).catch(()=>{})
      },2500)
      return()=>clearTimeout(t)
    }catch(_){}
  },[])

  // Checkout abandonment recovery: show banner if user left mid-checkout within last 24h
  const[showRecoveryBanner,setShowRecoveryBanner]=useState(false)
  // Hauteur RÉELLE de la bannière du haut (recovery/pass-expiré) — mesurée pour décaler
  // le header d'autant (sinon, sur 2-3 lignes en haute saison, le titre était CROPPÉ).
  const[bannerH,setBannerH]=useState(0)
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

  // Relance in-app à l'EXPIRATION du pass 7j offert (capture) : sans ça l'accès se
  // termine en SILENCE (aucune relance, aucun « N jours restants ») → conversion
  // ratée au moment exact où l'utilisateur a goûté la valeur. Un seul affichage
  // (sg_pass_expired_seen). Gated PAY_CAPTURE_ONLY → réversible ; au go-live Mollie
  // le CTA openPremium route vers le vrai paiement (cohérent).
  const[showPassExpired,setShowPassExpired]=useState(false)
  useEffect(()=>{
    if(!PAY_CAPTURE_ONLY||isPremium)return
    try{
      if(localStorage.getItem("sg_pass_expired_seen"))return
      const passEnd=parseInt(localStorage.getItem("sg_premium_pass_end")||"0")
      if(passEnd>0&&passEnd<=Date.now()){
        setShowPassExpired(true)
        track("sg_pass_expired_eligible",{island})
      }
    }catch(_){}
  },[])
  // Funnel mort réarmé (audit widget-factory) : à l'activation premium, (a) on
  //   efface le panier abandonné (anti-stale), (b) on GÉNÈRE le code de parrainage
  //   — il était LU (share l.3082) + détecté en landing (?ref=) mais JAMAIS écrit
  //   → canal d'acquisition entier mort. Code stable par device (cid). Double-face.
  useEffect(()=>{
    if(!isPremium)return
    try{localStorage.removeItem("sg_checkout_abandoned")}catch(_){}
    try{if(!localStorage.getItem("sg_referral_code"))localStorage.setItem("sg_referral_code","REF-"+hashSeed(_sgcCid()+":ref").toString(36).toUpperCase().slice(0,6))}catch(_){}
  },[isPremium])

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
  const[beachesWeather,setBeachesWeather]=useState({})
  const[hasActiveThreat,setHasActiveThreat]=useState(false)

  // Hero Verdict — home "/" uniquement (jamais les deep-links/landings SEO),
  // 1×/session (sessionStorage), jamais pendant une activation premium.
  const[showHero,setShowHero]=useState(()=>{
    try{
      // COHÉRENCE : on atterrit sur la CARTE (l'utilitaire qui répond « où me baigner
      // aujourd'hui »), pas sur le jeu. Le jeu reste à 1 tap via le bouton « 🎴 Jouer ».
      // ?hero=1 force l'arène (QA / A-B). Avant : l'arène prenait l'accueil 1ʳᵉ visite.
      if(/[?&]hero=1/.test(window.location.search)) return true
      return false
    }catch(_){return false}
  })
  // Découverte éducative (StoryEngine). Gate URL ?decouverte=1 pour QA ; entrée UI dédiée.
  const[showDiscovery,setShowDiscovery]=useState(()=>{try{return /[?&]decouverte=1/.test(window.location.search)}catch(_){return false}})
  // A/B stations : sur une URL de station, le variant ouvre le StoryEngine golden-hour.
  const stationSlug = (()=>{try{
    const seg = window.location.pathname.replace(/^\/|\/$/g,"")   // "detection-satellite-sargasses" ou "en/satellite-sargassum-detection"
    return STATION_BEATS[seg] ? seg : null
  }catch(_){return null}})()
  const stationOn = (()=>{try{
    if(!stationSlug) return false
    const q=window.location.search
    if(/[?&]stations=1/.test(q)) return true
    if(/[?&]stations=0/.test(q)) return false
    return abVariant("stations",["control","story"],[.5,.5])==="story"
  }catch(_){return false}})()
  const [showStation,setShowStation] = useState(()=>stationOn)
  // MONDE SVG — feed vertical infini des plages (fondation, direction 14/06). Zéro
  // photo : chaque plage = un plein-écran SVG qui met NOTRE data en scène, cliquable,
  // snap, loopé, jamais bloqué. Additif derrière ?world=1 ; A-B nav à venir.
  const[showWorld,setShowWorld]=useState(()=>{try{return /[?&]world=1/.test(window.location.search)}catch(_){return false}})
  // Solutions sargasses (SVG scrollytelling éducatif, escapable). ?solutions=1 QA + entrée chip.
  const[showSolutions,setShowSolutions]=useState(()=>{try{return /[?&]solutions=1/.test(window.location.search)}catch(_){return false}})
  // L'Archipel du Veilleur (monde SVG libre pan/zoom, tournoi gagnant). QA ?archipel=1.
  const[showArchipel,setShowArchipel]=useState(()=>{try{return /[?&]archipel=1/.test(window.location.search)}catch(_){return false}})
  // A/B nav_world : le cohort "world" ATTERRIT dans l'Archipel par defaut (le monde
  // DEVIENT le produit principal, plus un flag cache). 50/50, control = carte actuelle.
  // App full-SVG : le MONDE (WorldMapView/ArchipelView) EST la carte pour TOUS. La carte Leaflet
  // a été RETIRÉE (2026-06-21, demande fondateur : une vieille version flashait au lancement via un
  // cache PWA). navWorld reste une constante=true (encore référencée par rootMode + l'auto-open map).
  const navWorld=true
  const archAutoRef=useRef(false)
  // Intro carte (MapIntroStory) — DÉSACTIVÉE par défaut 2026-06-19 (audit live : le
  // prélude « LE VEILLEUR SCANNE » enterrait la carte [3-4 taps] et son overlay #mi3sky
  // interceptait les clics → dock bloqué). La CARTE = le cœur produit (« carte sargasses »)
  // → taper Carte ouvre la carte DIRECT. Opt-in debug ?mapintro=1.
  const[showMapIntro,setShowMapIntro]=useState(()=>{try{return /[?&]mapintro=1/.test(window.location.search)}catch(_){return false}})
  // A/B `prev_az` : landing golden-hour sur /previsions/ (ForecastChart + meilleur jour)
  // vs control (carte brute actuelle). 50/50. Override ?prev_az=1/0. Pathname-gated.
  const isPrevisions=(()=>{try{return /^\/previsions\/?$/.test(window.location.pathname)||/^\/_gp\/previsions\/?$/.test(window.location.pathname)}catch(_){return false}})()
  const[prevAZ]=useState(()=>{try{const q=window.location.search;if(/[?&]prev_az=1/.test(q))return true;if(/[?&]prev_az=0/.test(q))return false;return isPrevisions&&abVariant("prev_az",["control","az"],[.5,.5])==="az"}catch(_){return false}})
  const[showPrevLanding,setShowPrevLanding]=useState(prevAZ)
  const[prevExiting,setPrevExiting]=useState(false)
  const dismissPrevLanding=useCallback(action=>{
    setPrevExiting(true)
    setTimeout(()=>{setShowPrevLanding(false);setPrevExiting(false)},300)
    try{track("sg_previsions_dismiss",{action})}catch(_){}
  },[])

  // SYSTÈME MULTI-THÈMES (skins UI, fun/jeu) — CSS dans Themes.css (scopé body.theme-*).
  // Sélection : ?theme=<id> (ou alias ?comic=1) > A/B "ui_theme" > "golden" (contrôle, app d'origine).
  // ROLLOUT PRUDENT : l'A/B ne distribue que des variantes "soft" pour l'instant ; un picker
  // flottant laisse TOUT LE MONDE essayer les skins en live (vibe jeu). Modal premium/paiement
  // restylé en visuel only → pas de casse. id "golden" = aucune classe = app d'origine.
  const THEMES = useMemo(()=>([
    {id:"golden", label:"Golden hour",  emoji:"🌅"},
    {id:"comic",  label:"Comic / TCG",  emoji:"🎴"},
    {id:"soft",   label:"Soft Modern",  emoji:"🫧"},
    // manga/arcade/sticker RETIRÉS 22/06 (fondateur) : illisibles (audit contraste w71fbv5el,
    // ~1:1 en manga) → sortis du picker. Quiconque était dessus retombe sur le défaut (comic).
  ]),[])
  const initialTheme = useMemo(()=>{
    try{
      const q=window.location.search;
      const m=q.match(/[?&]theme=([a-z]+)/i);
      if(m && THEMES.some(t=>t.id===m[1].toLowerCase())) return m[1].toLowerCase();
      if(/[?&]comic=1/.test(q)) return "comic";
      const saved=localStorage.getItem("sg_ui_theme");
      if(saved && THEMES.some(t=>t.id===saved)) return saved;
      // COMIC 100% sur tout le site (décision fondateur). Plus d'A/B skin, plus de golden.
      //   Le thème 'soft' reste dispo via ?theme=soft mais n'est plus servi par défaut.
      //   Paywall (.sg-modal-panel) toujours exclu du thème → revenu protégé.
      return "comic";
    }catch(_){ return "comic"; }
  },[THEMES])
  const[uiTheme,setUiTheme]=useState(initialTheme)
  useEffect(()=>{
    const cls = uiTheme && uiTheme!=="golden" ? "theme-"+uiTheme : null;
    if(cls){ document.body.classList.add(cls); }
    try{ if(uiTheme) localStorage.setItem("sg_ui_theme", uiTheme); }catch(_){}
    return ()=>{ if(cls) document.body.classList.remove(cls); };
  },[uiTheme])
  // Picker flottant (DOM vanilla isolé) — switch live entre tous les thèmes. ACTIVÉ POUR TOUS :
  // les thèmes sont OPT-IN (défaut golden = app intacte → aucun skin forcé sur le paywall),
  // le picker 🎨 invite à jouer (vibe jeu). ?themes=0 = masquer.
  // A/B `theme_nudge` (control vs nudge) : le FAB "pulse" 1× pour mesurer l'ADOPTION des thèmes
  // sans rien forcer. Events trackés : ui_theme_view (exposition) + ui_theme_pick (choix).
  // Résolution à ~24h via scripts/resolve-theme-ab.cjs (cf. design/themes-lab-src/AB-THEMES.md).
  // 🎨 PICKER RETIRÉ (demande fondateur : "ça sert à rien, on fait LE thème"). Pas de sélecteur.
  // Le thème est appliqué directement via l'A/B (comic vs arena2). theme_nudge abandonné.
  // useEffect retiré volontairement.

  // A/B `clean_list` : /plages-sans-sargasses/ scene golden-hour + rail clean beaches.
  // Override ?clean_list=1/0. Control = app/carte generique (comportement actuel).
  const isCleanListPath=(()=>{try{return /^\/(?:plages-sans-sargasses|en\/best-beaches-no-sargassum|es\/mejores-playas-sin-sargazo)\/?$/.test(window.location.pathname)}catch(_){return false}})()
  const[cleanListAZ]=useState(()=>{try{const q=window.location.search;if(/[?&]clean_list=1/.test(q))return true;if(/[?&]clean_list=0/.test(q))return false;return isCleanListPath&&abVariant("clean_list",["control","scene"],[.5,.5])==="scene"}catch(_){return false}})
  const[showCleanList,setShowCleanList]=useState(cleanListAZ)
  const[cleanListExiting,setCleanListExiting]=useState(false)
  const dismissCleanList=useCallback(action=>{
    setCleanListExiting(true)
    setTimeout(()=>{setShowCleanList(false);setCleanListExiting(false)},300)
    try{track("sg_clean_list_dismiss",{action})}catch(_){}
  },[])
  // Hub Premium /alertes/ (+ EN/ES). Comme showHero : pathname-gated, 1× au mount.
  const ALERT_PATHS = /^\/(?:alertes|en\/sargassum-alerts|es\/alertas-sargazo)\/?$/
  const[alertHubVariant]=useState(()=>{
    try{const q=window.location.search
      if(/[?&]pw_alertes=1/.test(q))return"hub"
      if(/[?&]pw_alertes=0/.test(q))return"control"
      return abVariant("pw_alertes",["control","hub"],[.5,.5])
    }catch(_){return"control"}
  })
  const[showAlertHub,setShowAlertHub]=useState(()=>{
    try{
      if(!ALERT_PATHS.test(window.location.pathname))return false
      if(window.location.search.includes("premium"))return false // deeplink paywall direct
      return alertHubVariant==="hub"
    }catch(_){return false}
  })
  // A/B `pw_conditions` : /conditions/<slug>/ (et /conditions/) scene golden-hour + filter logic.
  const isConditionsPath = (() => {
    try {
      return /^\/conditions(?:\/.*)?\/?$/.test(window.location.pathname)
    } catch (_) {
      return false
    }
  })()
  const [conditionsVariant] = useState(() => {
    try {
      const q = window.location.search
      if (/[?&]pw_conditions=1/.test(q)) return "conditions"
      if (/[?&]pw_conditions=0/.test(q)) return "control"
      return abVariant("pw_conditions", ["control", "conditions"], [.7, .3])
    } catch (_) {
      return "control"
    }
  })
  const [showConditions, setShowConditions] = useState(() => {
    try {
      if (!isConditionsPath) return false
      return conditionsVariant === "conditions"
    } catch (_) {
      return false
    }
  })
  const [conditionsExiting, setConditionsExiting] = useState(false)
  const dismissConditions = useCallback(action => {
    setConditionsExiting(true)
    setTimeout(() => { setShowConditions(false); setConditionsExiting(false) }, 300)
    try { track("sg_conditions_dismiss", { action }) } catch (_) {}
  }, [])
  // Cohort world : ouvre l'Archipel par defaut quand la landing se pose (hero+mapintro
  // dismisses, beaches pretes), UNE fois. Escapable (la croix renvoie a la carte control).
  useEffect(()=>{
    if(!navWorld||archAutoRef.current)return
    if(showHero||showMapIntro||showPrevLanding||showCleanList||showAlertHub||selectedBeach||showPremium||showSolutions||showWorld||showArchipel||showStation)return
    if(view!=="map"||!(allBeaches&&allBeaches.length>=3))return
    archAutoRef.current=true;setShowArchipel(true);try{track("sg_archipel_open",{from:"nav_world_default"})}catch(_){}
  },[navWorld,showHero,showMapIntro,showPrevLanding,showCleanList,showAlertHub,view,allBeaches,selectedBeach,showPremium,showSolutions,showWorld,showArchipel,showStation])
  // ENGAGEMENT CONTINU : à chaque changement d'écran, on clôt la mesure du précédent
  // (temps/actions/inactivité/scroll/ennui) → GA4. C'est la donnée qui fait "réfléchir" le produit
  // (où ça bloque, où ça s'ennuie), à chaque étape. Voir engInit/engScreen/engFlush.
  useEffect(()=>{
    engInit();sgCollectInit()
    const screen=showStation?("station_"+stationSlug):showPremium?"premium":selectedBeach?"beach":showSolutions?"solutions":showArchipel?"world":showMapIntro?"mapintro":showPrevLanding?"previsions":showCleanList?"clean_list":showConditions?"conditions":showAlertHub?"alertes":showHero?"hero":showWorld?"worldfeed":("map_"+(view||"map"))
    engScreen(screen)
  },[showStation,stationSlug,showPremium,selectedBeach,showSolutions,showArchipel,showMapIntro,showPrevLanding,showCleanList,showConditions,showAlertHub,showHero,showWorld,view])
  // Bras A/B du landing : control = HeroVerdict (éprouvé), game = GameFunnel
  // (funnel-jeu immersif, tranche verticale 13/06). Mesuré contre le landing
  // prouvé, jamais imposé ; ?lf=game force en QA. La conversion (paywall/trial/
  // A-B pw_prelude) reste strictement intacte — GameFunnel ne fait que la nourrir.
  const[landingFunnel]=useState(()=>LF_OVERRIDE||abVariant("landing_funnel",["control","game"],[.7,.3]))
  // Bras A/B `home_az` : accueil A→Z (funnel scroll 5 beats + Le Veilleur
  // satellite v2 rassure≠surveille + yole + perso H1 daté EN DIRECT), porté du
  // design VALIDÉ (src/HomeAZ.jsx, monté en Shadow DOM = isolation CSS totale).
  // Prioritaire sur le hero quand actif ; ADDITIF, control (GameFunnel/Hero
  // Verdict) intact. Override ?home_az=1/0. La conversion (openPremium/Stripe/
  // pw_*) reste strictement la même porte. Reduced-motion : HomeAZ a son plancher.
  // L'arène « LA CHASSE » devient L'ACCUEIL UNIQUE (décision produit 2026-06-19 :
  // fin de la mosaïque d'A/B sur l'accueil — un seul parcours fluide, monde comic
  // de bout en bout). home_az désactivé pour ne pas se superposer à l'arène.
  // Override debug : ?home_az=1 pour ré-essayer l'ancien accueil A→Z.
  const[homeAZ]=useState(()=>{try{return /[?&]home_az=1/.test(window.location.search)}catch(_){return false}})
  // Accueil « LA CHASSE » par défaut pour TOUS (override debug ?chasse=0 pour
  // retomber sur HeroVerdict). Conversion (onOpen/onOpenBeach/onPremium) inchangée.
  const[chasse]=useState(()=>{try{return !/[?&]chasse=0/.test(window.location.search)}catch(_){return true}})
  // A/B `dock_glass` retiré avec la BottomNav (la barre Carte/Liste/Premium n'existe plus).
  // A/B `map_world` : carte SVG monde golden-hour (vraie géo OSM + golden-hour + scrub)
  // vs ArchipelView (bounding-box simple, control). 50/50. Override ?map_world=1/0.
  // Additif : control = ArchipelView intact, Leaflet = fallback ?nav=map (jamais touché).
  const mapWorld=useMemo(()=>{try{return /[?&]map_world=0/.test(window.location.search)?"control":"world"}catch(_){return"world"}},[])
  // Carte monde RÉCHAUFFÉE golden-hour pour TOUS (décision produit 19/06 : un seul
  // monde comic cohérent, fin de la base teal froide). Override debug ?mapwarm=0.
  const mapWarm=useMemo(()=>{try{return /[?&]mapwarm=0/.test(window.location.search)?"control":"warm"}catch(_){return"warm"}},[])
  // A/B `pw_beach_dive` : fiche plage « en PLONGÉE » (scène SVG plein écran, 6 stages,
  // Le Veilleur v2, scrub prévision verrouillé J2-7) vs BeachSheet (control intact).
  // pw_beach_dive PROMU 2026-06-19 (GO fondateur) : variante `dive` gagnante +84% @95% (n=416/469, 28j).
  // Hardcodé `dive` (BeachDive) pour 100%. ?beachdive=0 force encore le control (BeachSheet) — rollback/preview.
  // Réversible : restaurer abVariant("pw_beach_dive",["control","dive"],[.5,.5])==="dive".
  // nav_dive RETIRÉ 2026-06-18 (loop ab-eval 28j) : bras mort n=46 @0% conv vs control n=358 @1.4%.
  // Inliné au control — la plongée 1×/session ajoutait une friction sans conversion. ?navdive=1 force
  // encore l'aperçu. Réversible : restaurer abVariant("nav_dive",["control","dive"],[.85,.15])==="dive".
  const navDive=useMemo(()=>{try{const q=window.location.search;if(/[?&]navdive=1/.test(q))return true;if(/[?&]navdive=0/.test(q))return false;return false}catch(_){return false}},[])
  // A/B `capture_gate` : gate email avant le paywall sur intent forecast.
  // 2026-06-28 — COUPÉ (défaut OFF). L'audit business a prouvé que ce gate détournait
  // ~85% de l'intention d'ACHAT vers une collecte d'email → fabrique des leads, pas des
  // ventes (cohérent avec « 246 emails, 0 vente »). L'intent d'achat va maintenant
  // DIRECT au paywall. Override QA conservé : ?capture_gate=1 force le gate.
  const captureGate=useMemo(()=>{try{const q=window.location.search;if(/[?&]capture_gate=1/.test(q))return true;return false}catch(_){return false}},[])
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
  // Plage modèle pour /previsions/ (prev_az) : meilleure propre ou meilleur score, sans exiger imageMap.
  const prevHeroPick=useMemo(()=>{
    if(!showPrevLanding||!allBeaches?.length||!sargData?.weekly)return null
    const cands=allBeaches.filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.lat&&b.lng)
    if(!cands.length)return null
    const cleans=cands.filter(b=>b.status==="clean")
    let pick
    if(userPos&&cleans.length){
      pick=cleans.map(b=>({...b,_d:haversine(userPos.lat,userPos.lng,b.lat,b.lng)})).sort((a,b)=>a._d-b._d)[0]
    }else{
      const pool=cleans.length?cleans:cands
      pick=[...pool].sort((a,b)=>(b.score||0)-(a.score||0))[0]
    }
    return pick||null
  },[showPrevLanding,allBeaches,sargData,island,userPos])
  // Capture de sortie (exit-intent) : meilleure plage propre du jour, SANS le gate
  // showPrevLanding (prevHeroPick est toujours null au moment du tir). null = pas de
  // bande (règle « pas de popup sans données »).
  const exitcapPick=useMemo(()=>{
    if(!allBeaches?.length||!sargData?.weekly)return null
    const cands=allBeaches.filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.lat&&b.lng)
    if(!cands.length)return null
    const cleans=cands.filter(b=>b.status==="clean")
    let pick
    if(userPos&&cleans.length){
      pick=cleans.map(b=>({...b,_d:haversine(userPos.lat,userPos.lng,b.lat,b.lng)})).sort((a,b)=>a._d-b._d)[0]
    }else{
      const pool=cleans.length?cleans:cands
      pick=[...pool].sort((a,b)=>(b.score||0)-(a.score||0))[0]
    }
    return pick||null
  },[allBeaches,sargData,island,userPos])

  // SargaCatch toast — recycle le trafic en partance (validé user 2026-06-10).
  // Donnée qui justifie (règle "pas de popup sans donnée") : 45 s d'inactivité
  // totale = bounce statistique ; le toast ne coûte rien au funnel. Gates :
  // vue carte, hero fermé, pas de fiche/paywall ouvert, pas premium, 1×/session.
  const[showGameToast,setShowGameToast]=useState(false)
  const[showGameFull,setShowGameFull]=useState(false)
  // Swipe down pour fermer le jeu : le jeu est un <iframe> qui avale les touches →
  // une poignée en haut (hors iframe) porte le geste, tout l'overlay glisse (ref = overlay).
  const gameSwipe=useSwipeClose(()=>{setShowGameFull(false);track("sg_game_full_close",{from:"swipe"})},{threshold:64})
  const[showExitCap,setShowExitCap]=useState(false)
  const[showExitVeilleur,setShowExitVeilleur]=useState(false)
  // A/B exitcap : capture email de sortie (50/50, override ?exitcap=1/0)
  const exitcapOn=useMemo(()=>{try{const q=window.location.search;if(/[?&]exitcap=1/.test(q))return true;if(/[?&]exitcap=0/.test(q))return false;return abVariant("exitcap",["control","email"],[.5,.5])==="email"}catch(_){return false}},[])
  // Carte Veilleur de sortie = FEATURE PRINCIPALE, pas un A/B (décision fondateur 22/06 :
  // « c'est une main feature, on l'ab test pas »). ON pour 100% des partants éligibles ;
  // ?exit_veilleur=0 la désactive (holdout/test ponctuel), ?exit_veilleur=1 reste un no-op ON.
  const exitVeilleurOn=useMemo(()=>{try{return !/[?&]exit_veilleur=0/.test(window.location.search)}catch(_){return true}},[])
  // Calendrier 7 jours RÉEL pour la carte Veilleur : statuts forecast de exitcapPick.
  const exitcapForecast=useMemo(()=>{
    if(!exitcapPick||!sargData?.weekly)return null
    const sargId=IS_NEW_REGION?exitcapPick.id:BEACH_TO_SARG[exitcapPick.id]
    const w=sargId&&sargData.weekly[sargId]
    if(!w||!Array.isArray(w.forecast))return null
    return w.forecast.slice(0,7).map(f=>f&&f.status)
  },[exitcapPick,sargData])
  const gameGateRef=useRef({})
  useEffect(()=>{gameGateRef.current={sheet:!!selectedBeach,premium:showPremium||isPremium,view,hero:showHero||showPrevLanding,exitcapPick,exitcapOn,exitVeilleurOn}})
  // Preview/QA : ?exit_veilleur=preview force la carte Veilleur à l'écran (bypass
  // email/snooze/session/trigger). Ne nécessite que les données (exitcapPick). Permet de
  // montrer le pop-up à la demande même pour un user déjà capté (sg_email présent).
  useEffect(()=>{try{if(/[?&]exit_veilleur=preview/.test(window.location.search)&&exitcapPick)setShowExitVeilleur(true)}catch(_){}},[exitcapPick])
  useEffect(()=>{
    let idleT=null
    const fire=trigger=>{
      // Capture photo en cours → le `hidden` vient de la caméra, pas d'un départ. Ne pas
      // monter d'overlay (sinon il recouvre la fiche au retour = freeze signalé).
      if(trigger==="hidden"&&_sgCapturingPhoto)return
      const gate=gameGateRef.current
      if(gate.sheet||gate.premium||gate.hero||gate.view!=="map")return
      // HARMONIE par intention (décision fondateur 22/06) :
      // • EXIT-INTENT (exit/hidden/scrollup) + pas encore d'email → carte Veilleur
      //   « ta semaine est prête » (feature 100%, off via ?exit_veilleur=0) : le partant
      //   est sinon perdu à 100%, on le capte avec un vrai cadeau (calendrier 7j + brief).
      // • IDLE/AFK, ou partant déjà capté → SargaCatch (le jeu).
      const isExit=trigger!=="idle"
      if(isExit&&gate.exitVeilleurOn&&gate.exitcapPick&&!g("sg_email",null)&&g("sg_exitcap_snooze",0)<=Date.now()){
        try{if(sessionStorage.getItem("sg_exitcap"))return;sessionStorage.setItem("sg_exitcap","1")}catch(_){return}
        setShowGameToast(false);setShowExitVeilleur(true);track("sg_exitcap_open",{trigger,variant:"veilleur"});return
      }
      // AFK (idle 45s) → LANCE le jeu DIRECTEMENT (overlay plein écran fermable) au lieu
      // d'un toast « envie de jouer ? » (décision fondateur 22/06). Fermable d'1 tap →
      // si l'idle s'est déclenché sur un simple temps de lecture, retour carte immédiat.
      if(trigger==="idle"){
        // AVANT : lançait un IFRAME /jeu/ PLEIN ÉCRAN direct sur idle. Sur PWA standalone
        // iOS, l'écran d'intro du jeu PIÉGEAIT l'utilisateur (clics inertes, focus champ
        // email, ✕ inaccessible — « je ne peux ni cliquer ni fermer »). Retour au TOAST
        // « petit easter egg » NON-bloquant (pointerEvents:none, fermable) : on PROPOSE le
        // jeu, l'utilisateur l'ouvre par choix (lien → page /jeu/), jamais piégé.
        try{if(sessionStorage.getItem("sg_game_toast"))return;sessionStorage.setItem("sg_game_toast","1")}catch(_){return}
        setShowGameToast(true)
        track("sg_game_toast_shown",{trigger:"idle"})
        return
      }
      // Autres déclencheurs (partant déjà capté qui n'a pas la carte) → toast soft.
      try{
        if(sessionStorage.getItem("sg_game_toast"))return
        sessionStorage.setItem("sg_game_toast","1")
      }catch(_){return}
      setShowGameToast(true)
      track("sg_game_toast_shown",{trigger})
    }
    const reset=()=>{_sgCapturingPhoto=false;clearTimeout(idleT);idleT=setTimeout(()=>fire("idle"),45000)}
    const acts=["pointerdown","keydown","touchstart","wheel"]
    acts.forEach(a=>window.addEventListener(a,reset,{passive:true}))
    reset()
    // Exit-intent desktop : souris qui sort par le haut de la fenêtre
    const exitH=e=>{if(e.clientY<=0&&window.matchMedia("(min-width:900px)").matches)fire("exit")}
    document.addEventListener("mouseleave",exitH)
    // Exit-intent desktop RENFORCÉ : remontée de la souris vers le sommet (flick) AVANT de
    // franchir le bord → rattrape les partants qui filent vers les onglets / le ×. Seuils
    // ASSOUPLIS (un élan vers le haut suffit, plus besoin d'un flick frénétique) ; la
    // vélocité min reste pour exclure une montée lente vers la barre de recherche. fire() =
    // 1×/session.
    let _mvy=0,_mvt=0
    const exitFlick=e=>{
      if(!window.matchMedia("(min-width:900px)").matches)return
      const now=Date.now(),dy=e.clientY-_mvy,dt=now-_mvt
      if(dt>0&&dt<180&&dy<-6&&(-dy/dt)>0.55&&e.clientY<160)fire("exit")
      _mvy=e.clientY;_mvt=now
    }
    document.addEventListener("mousemove",exitFlick,{passive:true})
    // Bascule d'onglet / alt-tab (desktop ET mobile) = signal de départ fort : la carte est
    // prête au retour. fire() la garde 1×/session + snooze 14j au dismiss → jamais spammy.
    const onVis=()=>{if(document.visibilityState==="hidden")fire("hidden");else _sgCapturingPhoto=false}
    document.addEventListener("visibilitychange",onVis)
    let downAcc=0,lastY=0,lastT=0
    const onScroll=()=>{
      if(!window.matchMedia("(max-width:899px)").matches)return
      const y=window.scrollY||document.documentElement.scrollTop||0,now=Date.now(),dy=y-lastY
      if(dy>0)downAcc+=dy
      if(downAcc>400&&dy<0&&-dy>120&&now-lastT<300){downAcc=0;fire("scrollup")}
      lastY=y;lastT=now
    }
    window.addEventListener("scroll",onScroll,{passive:true})
    return()=>{clearTimeout(idleT);acts.forEach(a=>window.removeEventListener(a,reset));document.removeEventListener("mouseleave",exitH);document.removeEventListener("mousemove",exitFlick);document.removeEventListener("visibilitychange",onVis);window.removeEventListener("scroll",onScroll)}
  },[])

  // Deep-link: /plages/:slug → auto-open beach sheet OR zoom to zone MID
  useEffect(()=>{
    if(!allBeaches.length)return
    const p=window.location.pathname
    
    // 1) Handle explicit FAR routes (carte, pres-de-moi, aujourdhui, clean-list fallback)
    const isFarRoute = /^\/(?:carte|carte-sargasses|map|mapa|sargasses-pres-de-moi|sargasses-aujourdhui|en\/sargassum-near-me|es\/sargazo-cerca-de-mi|en\/sargassum-today|es\/sargazo-hoy)\/?$/.test(p)
    if(isFarRoute) {
      setShowHero(false)
      setShowPrevLanding(false)
      setShowAlertHub(false)
      setSelectedBeach(null)
      setShowArchipel(true) // flyTo(FAR)
      try { track("sg_map_open", { source: "deeplink_far" }) } catch(_) {}
      return
    }

    // 2) Handle /plages/:slug
    const m=p.match(/^\/(?:plages|beaches|playas)\/([^/]+)/)
    if(!m)return
    const slug=m[1]
    const match=allBeaches.find(b=>getCanonicalSlug(b)===slug)
    if(match){
      setSelectedBeach(match)
      track("sg_beach_open",{beach_id:match.id,status:match.status,source:"deeplink"})
    } else {
      // Check if it's a zone slug (MID zoom)
      const isZone = Object.values(COAST_ZONES).flat().some(z => z.slug === slug)
      if(isZone){
        setInitialZone(slug) // flyTo(MID)
        setShowHero(false)
        setShowPrevLanding(false)
        setShowCleanList(false)
        setShowAlertHub(false)
        setSelectedBeach(null)
        setShowArchipel(true)
        try { track("sg_zone_open", { zone: slug, source: "deeplink" }) } catch(_) {}
      }
    }
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
      fetch("/api/weather/beaches-weather.json").then(r=>r.json()).catch(()=>null),
      // SIGNALEMENTS (local, rapide) DANS le fetch principal → les pins affichent leur VRAI statut
      // (escaladé par les signalements) dès le 1er rendu, au lieu de flasher vert→rouge/jaune.
      // app-reports.json = snapshot des reports IN-APP (le live Apps Script ~2,5 s reste en différé
      // pour la fraîcheur) ; fb-reports.json = signaux Facebook scrapés. On fusionne les deux.
      fetch("/api/community/app-reports.json").then(r=>r.json()).catch(()=>null),
      fetch("/api/community/fb-reports.json").then(r=>r.json()).catch(()=>null),
      // Gating J+2→J+7 : si on a une credential (token widget / email payeur), on
      // récupère la prévision COMPLÈTE EN PARALLÈLE → merge AVANT l'interpolation
      // ci-dessous (sinon les plages interpolées n'auraient pas leurs J+2-6).
      fetchFullForecast()
    ]).then(([beachData,sargResult,beachWx,appReports,fbReports,fcFull])=>{
      const perBeachWx=beachWx?.beaches||{}
      setBeachesWeather(perBeachWx)
      // Merge prévision complète (premium/abonné/widget) dans sargResult.weekly
      // AVANT toute interpolation. Non-premium ou 403 → fcFull null → reste gaté.
      if(sargResult&&sargResult.weekly&&fcFull){
        for(const id in sargResult.weekly){
          const full=fcFull[id]
          if(Array.isArray(full)&&full.length>2){
            sargResult.weekly[id]={...sargResult.weekly[id],forecast:full,gated:false}
          }
        }
      }
      // PERSISTANCE (cause racine du « gris ») : TOUTE série encore courte (forecast.php
      // KO, premium pass-only, etc.) est complétée à 7 jours par report honnête AVANT
      // l'interpolation → les sentinelles ET les plages interpolées héritent de 7 jours.
      // Plus aucune surface n'affiche de gris muet à un premium. Rollback : ?persist=0.
      if(sargResult&&sargResult.weekly){
        for(const id in sargResult.weekly){
          const w=sargResult.weekly[id]
          if(w&&Array.isArray(w.forecast)&&w.forecast.length>0&&w.forecast.length<7){
            sargResult.weekly[id]={...w,forecast:padForecast(w.forecast,7)}
          }
        }
      }
      // Retry borné (1×) HORS chemin critique : un premium actif dont forecast.php a
      // échoué transitoirement (fcFull null) → on re-déclenche UN fetch après délai SANS
      // bloquer le rendu du verdict (déjà affiché). Si ça re-échoue → reste gris (honnête),
      // jamais de couleur fabriquée. Le gratuit (pas de credential) ne retry jamais.
      try{
        const _premActive=!!localStorage.getItem("sg_premium")||(parseInt(localStorage.getItem("sg_premium_pass_end")||"0")>Date.now())
        const _hasCred=!!(localStorage.getItem("sg_email")||localStorage.getItem("sg_premium_email")||localStorage.getItem("sg_fc_token"))
        if(_premActive&&_hasCred&&!fcFull&&fcRetryRef.current<1){ fcRetryRef.current++; setTimeout(()=>setPremiumTick(t=>t+1),1500) }
      }catch(_){}
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
          // Rollback : ?leeblind=0 → revient à l'ancien comportement (réserve sur côte
          // ATLANTIQUE seule ; la côte caraïbe nord redevient « propre » sans réserve).
          let _leeBlindOff=false
          try{_leeBlindOff=/[?&]leeblind=0/.test(window.location.search)}catch(_){}
          for(let i=0;i<beaches.length;i++){
            if(beaches[i]._src==="live")continue
            const same=sentinels.filter(s=>
              (beaches[i].island==="mq"&&s.lat<15.5)||(beaches[i].island==="gp"&&s.lat>=15.5))
            const interp=interpolateIDW(beaches[i],same.length>0?same:sentinels)
            if(interp!==null){
              // Honnêteté couverture satellite : l'AFAI voit les radeaux AU LARGE, pas le
              // sargasse déjà échoué ni piégé dans les baies. Un statut « propre » obtenu par
              // interpolation (pas une lecture directe) ne peut PAS garantir l'état du rivage —
              // ni sur la côte ATLANTIQUE exposée, ni sur la côte CARAÏBE sous-le-vent
              // (Prêcheur/Grand'Rivière/Anse Céron/Anse Couleuvre, touchée le 2026-06-29 alors
              // qu'on l'affichait verte sans réserve). On le flagge pour ne plus affirmer
              // « propre » sans réserve. SEULES les baies vraiment fermées (Baie de FDF, Anses
              // d'Arlet nord) restent sans réserve, via isImmuneBay().
              let _coast=beaches[i].coast
              try{if(!_coast)_coast=classifyBeachCoast(beaches[i].lat,beaches[i].lng,beaches[i].island)}catch(_){_coast="atlantic"}
              const _satBlind=_leeBlindOff
                ? _coast==="atlantic"
                : !isImmuneBay(beaches[i].lat,beaches[i].lng,beaches[i].island)
              beaches[i]={...beaches[i],afai:interp,status:statusFromAfai(interp),_src:"interpolated",_satBlind}
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
      // Escalade signalements (IN-APP + FB) AVANT le 1er rendu (anti-flash vert→rouge/jaune). Même
      // merge + même règle que l'overlay différé : on SOMME les sources, et on ne fait QU'escalader
      // (consensus pire que le satellite), jamais adoucir → le statut signalé s'affiche d'emblée.
      {
        const _cr={}
        const _merge=src=>{if(!src||!src.reports)return;for(const id in src.reports){const r=src.reports[id];if(!_cr[id])_cr[id]={avoid:0,moderate:0,clean:0,total:0};_cr[id].avoid+=r.avoid||0;_cr[id].moderate+=r.moderate||0;_cr[id].clean+=r.clean||0;_cr[id].total+=r.total||0}}
        _merge(appReports);_merge(fbReports)
        const _RANK={clean:0,moderate:1,avoid:2}
        for(let i=0;i<beaches.length;i++){
          const b=beaches[i]; if(!b.status)continue
          const r=_cr[b.id]||_cr[BEACH_TO_SARG[b.id]]
          if(!r||!r.total||r.total<2)continue
          const consensus=r.avoid>=r.moderate&&r.avoid>=r.clean?"avoid":r.moderate>=r.clean?"moderate":"clean"
          if(_RANK[consensus]>_RANK[b.status])beaches[i]={...b,status:consensus,_communityOverride:true,_communityTotal:r.total}
        }
      }
      setAllBeaches(beaches)
    })
  },[premiumTick]) // re-run sur upgrade premium (gating : récupère J+2-6 + ré-interpole)

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

  // P6 — géoloc À LA DEMANDE (clic « Près de moi ») : c'est le rung #2 du molo_ladder
  // (soft-ask contextuel, user-initiated) → n'interfère PAS avec l'auto-prompt A/B.
  const requestGeo=useCallback((src="near_me")=>{
    const _src=typeof src==="string"?src:"near_me"
    if(!navigator.geolocation){try{sgToast({tone:"error",msg:_t(lang,"Géolocalisation indisponible sur cet appareil.","Geolocation unavailable on this device.","Geolocalización no disponible en este dispositivo.")})}catch(_){}; return}
    try{track("sg_geo_request",{src:_src})}catch(_){}
    // « Près de moi » = action EXPLICITE → fix FRAIS HAUTE PRÉCISION (enableHighAccuracy
    // + maximumAge:0). L'ancien réglage (low-accuracy + cache 5 min) renvoyait souvent une
    // position IP/wifi à des dizaines de km → « la plage la plus proche » était fausse.
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude,lng=pos.coords.longitude
      setUserPos({lat,lng})
      const gpsIsland=lat>15.5?"gp":"mq"
      setIsland(prev=>{const saved=g("sg_island",null);return saved?prev:gpsIsland})
    },err=>{
      // Échec SILENCIEUX avant → l'utilisateur ne comprenait pas pourquoi « près de moi »
      // ne marchait pas. On l'explique (refus = code 1, sinon réseau/timeout).
      try{track("sg_geo_denied",{src:_src,code:err&&err.code})}catch(_){}
      try{sgToast({tone:"error",title:_t(lang,"Position indisponible","Location unavailable","Ubicación no disponible"),
        msg:err&&err.code===1
          ?_t(lang,"Autorise la localisation pour voir les plages près de toi.","Allow location to see beaches near you.","Permite la ubicación para ver playas cerca de ti.")
          :_t(lang,"Réessaie dans un instant.","Try again in a moment.","Inténtalo de nuevo en un momento.")})}catch(_){}
    },{enableHighAccuracy:true,timeout:12000,maximumAge:0})
  },[lang])

  // Geolocation — MOLO À 100 % (A/B molo_ladder TRANCHÉ le 2026-06-26 : molo bat
  // control de +201 % sur le checkout-redirect Martinique, significatif à 99 %, et
  // baisse l'ennui 13 %→11 %. GP non-significatif. Verdict : on retire DÉFINITIVEMENT
  // le prompt géoloc À FROID au load — anti-pattern (~14 % d'opt-in à froid, intrusif).
  // ZÉRO prompt au chargement. La position précise s'acquiert ensuite via soft-ask
  // CONTEXTUEL au tap (requestGeo : « Près de moi », distance fiche, tri Plan B…).
  // SEULE exception non-intrusive : si le navigateur a DÉJÀ accordé la permission, on
  // récupère la position en silence (aucun prompt) pour que les habitués voient les
  // distances tout de suite. Fallback gracieux sinon : estimation passive
  // (timezone/hostname) — rankBeaches gère userPos=null.
  useEffect(()=>{
    if(!navigator.geolocation||!navigator.permissions||!navigator.permissions.query)return
    navigator.permissions.query({name:"geolocation"}).then(p=>{
      if(p.state!=="granted")return // jamais de prompt au load ; on attend un soft-ask contextuel
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
    }).catch(()=>{})
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

  // ── JOURNAL DU VEILLEUR — "voilà ce qu'on a construit en ton absence" ──────
  // Détecte le visiteur qui REVIENT (sg_visit_count≥2) et lui montre, 1×/release,
  // les nouveautés publiées depuis sa dernière version vue (sg_rel_seen). Source :
  // public/release-notes.json. NON destructif (aucun reload — le bundle frais est
  // déjà servi network-first). Gated A/B `wn1` (80% journal / 20% holdout) pour
  // mesurer l'effet sur ré-engagement + conversion (verdict via ab-eval).
  useEffect(()=>{
    if(abVariant("wn1",["journal","off"],[0.8,0.2])!=="journal")return
    let cancelled=false
    const numOf=(v)=>parseInt(String(v||"").replace(/^v/,""),10)||0
    const run=async()=>{
      try{
        const res=await fetch("/release-notes.json",{cache:"no-store"})
        if(!res.ok)return
        const data=await res.json()
        if(cancelled||!data||!data.current||!Array.isArray(data.releases)||!data.releases.length)return
        const cur=data.current
        const seen=g("sg_rel_seen",null)
        if(seen===cur)return // déjà à jour
        const returning=g("sg_visit_count",0)>=2 // compteur déjà incrémenté ce mount
        let releasesToShow
        if(!seen){
          // Jamais vu le Journal : un NOUVEAU visiteur pose juste la baseline en
          // silence (il n'a rien manqué). Un visiteur qui REVIENT voit la release courante.
          if(!returning){s("sg_rel_seen",cur);return}
          releasesToShow=[data.releases[0]]
        }else{
          // A déjà une baseline : montrer toutes les releases plus récentes que la sienne.
          const sN=numOf(seen)
          releasesToShow=data.releases.filter(r=>numOf(r.v)>sN)
          if(!releasesToShow.length){s("sg_rel_seen",cur);return}
        }
        const items=[]
        for(const r of releasesToShow)for(const it of (r.items||[]))items.push(it)
        if(!items.length){s("sg_rel_seen",cur);return}
        const head=releasesToShow[0]
        if(!cancelled)setWhatsNew({v:cur,date:head.date||data.date||"",title:head.title||null,items})
      }catch(_){}
    }
    // Léger délai : laisser le 1er paint / le hero se poser avant d'accueillir.
    const t=setTimeout(run,1400)
    return()=>{cancelled=true;clearTimeout(t)}
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
    // Marée du Veilleur : plongée carte→plage 1×/session au 1er ouverture (skippable, reduced-motion off).
    try{if(navDive&&b.status&&!sessionStorage.getItem("sg_dove")&&!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)){sessionStorage.setItem("sg_dove","1");setDiveBeach(b);track("sg_dive_play",{beach_id:b.id})}}catch(_){}
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
  // ⭐ Pins carte → DÉTAIL COMIC (ChasseDetail in-world) au lieu de la fiche data
  // « scroll satellite » (PRODUCT.md §8). Default ON ; rollback instantané ?mapdetail=0.
  // PAS un nouveau flag A/B (récolte : 51 flags conversion déjà dilués) — feature flag
  // réversible. Le détail comic réutilise openPremium (porte conversion unique intacte),
  // "Fiche complète" (onFull) reste un pont vers la fiche data pour qui veut la profondeur.
  const mapDetail=useMemo(()=>{try{return !/[?&]mapdetail=0/.test(window.location.search)}catch(_){return true}},[])
  const [comicBeach,setComicBeach]=useState(null)
  const openComicBeach=useCallback(b=>{
    if(!b||!b.id)return
    setComicBeach(b);track("sg_beach_open",{beach_id:b.id,status:b.status,via:"comic_map"})
    try{window.dispatchEvent(new Event("sg:value_moment"))}catch(e){}
    if(showOnboarding){setShowOnboarding(false);s("sg_onb",1)}
    try{const v=parseInt(sessionStorage.getItem("sg_beach_views")||"0")+1;sessionStorage.setItem("sg_beach_views",String(v))}catch(_){}
  },[showOnboarding])
  // Handler routé aux pins de la carte/archipel : détail comic si flag ON, sinon fiche data.
  const onMapBeach=useCallback(b=>{ if(mapDetail)openComicBeach(b); else onBeachClick(b) },[mapDetail,openComicBeach,onBeachClick])
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

  const FORECAST_GATE_SRCS=["forecast_lock","forecast_cta","forecast_scrub","forecast_beat","forecast_scrub_premium","whisper_veilleur"]
  const openPremium=useCallback((src)=>{
    const s=src||"nav"
    // capture_gate : intercept si A/B actif + source forecast + pas encore d'email
    if(captureGate&&FORECAST_GATE_SRCS.includes(s)){
      let hasEm=false;try{hasEm=!!localStorage.getItem("sg_email")}catch(_){}
      if(!hasEm){setCaptureGateSrc(s);setShowCaptureGate(true);track("sg_capture_gate_view",{src:s});return}
    }
    setPremiumSource(s);setShowPremium(true);track("sg_premium_modal_open",{source:s})
  },[captureGate])
  // onChangeView déclaré APRÈS openPremium pour pouvoir l'appeler directement (évite la stale closure).
  // Les bug fixes (source correcte + capture gate) s'appliquent aux deux bras A/B.
  const onChangeView=useCallback(v=>{
    track("sg_nav_change",{tab:v})
    if(v==="premium")openPremium("nav")
    else {setShowPremium(false);setView(v)} // close paywall when navigating away → fixes ⭐ tab staying lit on map/list
  },[openPremium])
  // Deep-link OUVRE le paywall (≠ ?premium=1 qui ACCORDE premium — piège). Utilisé par
  // la page de confiance /a-propos/ dont les CTA étaient href="#" morts. source = utm_source.
  // /alertes/ = landing page hot-intent (cherché "alertes sargasses") → ouvre paywall direct.
  // Distinct du general auto-open désactivé L11319 (intention tiède) : ici l'intention est CHAUDE.
  // Capture B2B PRO (self-serve, sans appel) — joignable en deep-link ?pro=1
  // depuis l'email d'outreach B2B. Brief quotidien gratuit, drip automatique.
  const [showProB2B,setShowProB2B]=useState(false)
  useEffect(()=>{try{
    const p=new URLSearchParams(window.location.search)
    if(p.get("paywall")==="1"){
      // Préselection depuis /offres/ : ?plan=monthly|annual pré-coche le bon toggle.
      // Capturé AVANT le replaceState (qui efface la querystring) ; consommé par le
      // useState de PremiumModal. (?offer=trip : ouvre le paywall premium pour l'instant.)
      const dp=p.get("plan");if(dp==="monthly"||dp==="annual"){try{sessionStorage.setItem("sg_deep_plan",dp)}catch(_){}}
      const u=p.get("utm_source");openPremium(u?("deeplink_"+u).slice(0,40):"deeplink");window.history.replaceState({},"",window.location.pathname)}
    else if(p.get("pro")==="1"){setShowProB2B(true);
      // Tracking funnel PAR PROSPECT : le token b= (hash8 du destinataire, posé dans
      // les emails B2B) + la campagne → on sait QUI a cliqué (b2b-funnel lit ce signal).
      try{track("sg_b2b_open",{source:"deeplink_pro"})}catch(_){}
      try{const b=p.get("b");if(b)track("sg_b2b_visit",{b,campaign:p.get("utm_campaign")||"",medium:p.get("utm_medium")||""})}catch(_){}
      window.history.replaceState({},"",window.location.pathname)}
    else if(/\/(alertes|sargassum-alerts|alertas-sargazo)\/?$/.test(window.location.pathname)){openPremium("alertes_landing")}
  }catch(_){}},[openPremium])

  // Engagement trigger: modal open rate is 1.72% of sessions — most users never hit a paywall gate.
  // Show modal only to IDLE returning users (no beach-sheet interaction for 50s on visit 2+).
  // Was hijacking active explorers mid-flow, reading as "the app keeps bugging on my 3rd click".
  useEffect(()=>{
    // DÉSACTIVÉ (audit widget-factory 2026-06-15) : même gated sur value_moment,
    // l'auto-open ouvrait le paywall sur intention TIÈDE → ~0% CTA + gonflait le
    // dénominateur modal_open (cause directe de la fuite modal→CTA 2,2%) + modal
    // interruptif = anti-doctrine calme. Le mur ne s'ouvre PLUS que sur intention
    // CHAUDE (forecast-lock, CTA, dock Veilleur). Réversible (retirer ce return).
    return // eslint-disable-line
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

  const [showSplash,setShowSplash]=useState(()=>{
    try{
      if(typeof window==="undefined") return false;
      const q=window.location.search||"";
      if(/[?&]splash=0/.test(q)) return false;
      if(/[?&]splash=1/.test(q)) return true;
      // FLUIDITÉ : plus de splash 2s par défaut — on atterrit DIRECT sur la carte.
      // (?splash=1 pour le revoir.) La marque est déjà sur la carte elle-même.
      return false;
      // eslint-disable-next-line no-unreachable
      const path=window.location.pathname;
      if(!(path==="/"||path===""||path==="/index.html")) return false;
      if(sessionStorage.getItem("sg_splash_seen")) return false;
      sessionStorage.setItem("sg_splash_seen","1");
      return true;
    }catch(_){ return false; }
  });

  const [showArenaOnb,setShowArenaOnb]=useState(()=>{
    try{
      // COHÉRENCE : l'onboarding « collectionne les plages-cartes » parlait du JEU, pas
      // de la carte utilitaire sur laquelle on atterrit → incohérent. Désactivé par défaut.
      // ?onb=1 le force (QA / réintroduction d'un vrai onboarding produit plus tard).
      if(/[?&]onb=1/.test(window.location.search)) return true;
      return false;
    }catch(_){ return false; }
  });
  const finishArenaOnb=useCallback(()=>{ try{localStorage.setItem("sg_onb","1");}catch(_){} setShowArenaOnb(false); },[]);
  // Marché de l'onboarding : Martinique → null (chaînes legacy intactes). GP + régions
  // internationales recevaient « Martinique » sur le 1er écran (bug cohérence corrigé).
  const _onbRegion=useMemo(()=>{
    try{
      if(typeof IS_NEW_REGION!=="undefined"&&IS_NEW_REGION&&typeof REGION!=="undefined"&&REGION)
        return {label:REGION.name,beaches:(REGION.beaches||[]).slice(0,3).map(b=>b&&b.name).filter(Boolean)};
      if(typeof location!=="undefined"&&location.hostname&&location.hostname.includes("guadeloupe"))
        return {label:"Guadeloupe",beaches:["Grande Anse","Plage de la Caravelle"]};
    }catch(_){}
    return null;
  },[]);
  // Wordmark du splash : international = « SARGASSUM <nom> », FR = « SARGASSES <NOM> ».
  const _onbWordmark=useMemo(()=>{
    try{
      if(typeof IS_NEW_REGION!=="undefined"&&IS_NEW_REGION&&typeof REGION!=="undefined"&&REGION)
        return "SARGASSUM "+String(REGION.name||"").toUpperCase();
      if(typeof location!=="undefined"&&location.hostname&&location.hostname.includes("guadeloupe"))
        return "SARGASSES GUADELOUPE";
    }catch(_){}
    return "SARGASSES MARTINIQUE";
  },[]);

  // HERO CINÉMATIQUE « GTA sunset » — 1er atterrissage sur la racine, 1×/session,
  // ATTERRISSAGE DIRECT SUR LA CARTE (décision fondateur : « la map direct au début »).
  // L'intro plein écran ajoutait une friction avant l'utilitaire ; l'identité « Le
  // Veilleur » est désormais FUSIONNÉE dans l'en-tête de la carte (mascotte + wordmark).
  // L'intro cinématique reste accessible en QA/marketing via ?vh=1. ?vh=0 = no-op.
  const [showVeilleurHero,setShowVeilleurHero]=useState(()=>{
    try{ return /[?&]vh=1/.test(window.location.search||""); }catch(_){ return false; }
  });
  const dismissVeilleurHero=useCallback(()=>{ try{sessionStorage.setItem("sg_vh_seen","1");track("sg_vh_enter",{})}catch(_){}; setShowVeilleurHero(false); },[track]);

  return(
    <LangCtx.Provider value={lang}>
      {(showVeilleurHero||showSplash||showArenaOnb)&&<ErrBound fallback={null}><Suspense fallback={null}>
        {showVeilleurHero&&<VeilleurHero lang={lang} onEnter={dismissVeilleurHero}/>}
        {showSplash&&<ArenaSplash lang={lang} track={track} wordmark={_onbWordmark} onDone={()=>setShowSplash(false)}/>}
        {showArenaOnb&&<ArenaOnboarding lang={lang} track={track} region={_onbRegion} onDone={finishArenaOnb} onSkip={finishArenaOnb}/>}
      </Suspense></ErrBound>}
      {/* JEU RETIRÉ DU PRODUIT (décision fondateur : « c'est pas un plus, c'est nul »).
          L'arène/collection n'est plus accessible depuis l'UX — produit utilitaire pur
          (carte → fiche → alerte). Code dormant conservé, joignable seulement via ?hero=1
          pour une éventuelle réintroduction ; aucun bouton « Jouer » en prod. */}
      <AbDebug/>
      {/* Mot-clé SEO sr-only — <p> (PAS <h1>) : la scène/route visible fournit déjà
          l'unique <h1> ; deux <h1> = anti-pattern SEO + a11y. Texte reste crawlable. */}
      <p style={{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap"}}>{IS_NEW_REGION?(REGION.primaryLang==="es"?`Sargazo en ${REGION.name} en vivo — mapa de playas hoy`:`${REGION.name} sargassum live — beach map today`):island==="mq"?"Sargasses Martinique en temps réel — carte et plages aujourd'hui":"Sargasses Guadeloupe en temps réel — carte et plages aujourd'hui"}</p>
      <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>

        {/* CHECKOUT RECOVERY BANNER */}
        {showRecoveryBanner&&(
          <div ref={el=>setBannerH(el?el.offsetHeight:0)} style={{position:"fixed",top:0,left:0,right:0,zIndex:1500,
            background:"linear-gradient(90deg,#120821 0%,#1a2f28 100%)",
            borderBottom:"1px solid rgba(232,168,0,.3)",
            padding:"10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left))",
            paddingTop:"max(10px, calc(10px + env(safe-area-inset-top)))",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            flexWrap:"wrap",
            fontSize:13,color:"#e6edf3",fontFamily:"inherit"}}>
            <span style={{opacity:.9,flex:"1 1 180px",minWidth:0,textAlign:"center"}}>{PAY_CAPTURE_ONLY?_t(lang,"Tes 7 jours offerts t'attendent — juste ton email.","Your 7 free days are waiting — just your email.","Tus 7 días gratis te esperan — solo tu email."):SARGASSES_SEASON==="high"
              ?_t(lang,"Les plages bougent vite. Tu étais presque Premium — termine maintenant.","Beaches are changing fast. You almost had Premium — finish now.","Las playas cambian rápido. Casi tenías Premium — termina ahora.")
              :_t(lang,"Tu étais presque Premium ! Reprends où tu en étais.","You were almost Premium! Pick up where you left off.","¡Casi tenías Premium! Retoma donde te quedaste.")}</span>
            <button onClick={()=>{
              track("sg_checkout_recovery_click",{island})
              setShowRecoveryBanner(false)
              openPremium("recovery_banner")
            }} style={{background:"#E8A800",color:"#120821",border:"none",borderRadius:8,
              padding:"6px 14px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",
              whiteSpace:"nowrap",flexShrink:0}}>
              {PAY_CAPTURE_ONLY?_t(lang,"Débloquer 7 jours","Unlock 7 days","Desbloquear 7 días"):_t(lang,"Passer Premium","Go Premium","Hazte Premium")}
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

        {/* PASS 7J EXPIRÉ — relance capture (un seul affichage, après les overlays prioritaires) */}
        {showPassExpired&&!showRecoveryBanner&&!showHero&&!showPremium&&!showCaptureGate&&!showWelcome&&!selectedBeach&&(
          <div ref={el=>setBannerH(el?el.offsetHeight:0)} style={{position:"fixed",top:0,left:0,right:0,zIndex:1500,
            background:"linear-gradient(90deg,#120821 0%,#1a2f28 100%)",
            borderBottom:"1px solid rgba(232,168,0,.3)",
            padding:"10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left))",
            paddingTop:"max(10px, calc(10px + env(safe-area-inset-top)))",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            flexWrap:"wrap",fontSize:13,color:"#e6edf3",fontFamily:"inherit"}}>
            <span style={{opacity:.9,flex:"1 1 180px",minWidth:0,textAlign:"center"}}>
              {_t(lang,"Ton accès 7 jours est terminé — reprends-le, juste ton email.","Your 7-day access has ended — get it back, just your email.","Tu acceso de 7 días terminó — recupéralo, solo tu email.")}</span>
            <button onClick={()=>{
              track("sg_pass_expired_click",{island})
              try{localStorage.setItem("sg_pass_expired_seen","1")}catch(_){}
              setShowPassExpired(false)
              openPremium("pass_expired")
            }} style={{background:"#E8A800",color:"#120821",border:"none",borderRadius:8,
              padding:"6px 14px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",
              whiteSpace:"nowrap",flexShrink:0}}>
              {_t(lang,"Reprendre 7 jours","Get 7 days back","Recuperar 7 días")}</button>
            <button onClick={()=>{
              track("sg_pass_expired_dismiss",{island})
              try{localStorage.setItem("sg_pass_expired_seen","1")}catch(_){}
              setShowPassExpired(false)
            }} style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",
              cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px",flexShrink:0}}
              aria-label={_t(lang,"Fermer","Close","Cerrar")}>&times;</button>
          </div>
        )}

        {/* MAP, LIST or GAME — both rendered, visibility toggled for instant switch */}
        <div style={{position:"absolute",inset:0,opacity:view==="map"?1:0,
          transform:view==="map"?"scale(1)":"scale(1.03)",transformOrigin:"50% 42%",
          pointerEvents:view==="map"?"auto":"none",transition:"opacity .28s ease, transform .42s cubic-bezier(.34,1.56,.64,1)"}}>
          {/* Intro carte SVG (MapIntroStory) — landing show-once, skippable, par-dessus
              la map. Démontée à l'entrée → ne vole jamais un clic pin. Jamais pendant
              hero/découverte/fiche/paywall ; bypass si <3 plages (jamais d'écran vide). */}
          {showMapIntro&&view==="map"&&!showHero&&!showPrevLanding&&!showCleanList&&!showDiscovery&&!selectedBeach&&!showPremium&&!showWorld&&filtered.length>=3&&(
            <MapIntroStory lang={lang}
              counts={{clean:filtered.filter(b=>b.status==="clean").length,watch:filtered.filter(b=>b.status==="moderate").length,avoid:filtered.filter(b=>b.status==="avoid").length,total:filtered.length}}
              onEnterMap={()=>{setShowMapIntro(false);try{localStorage.setItem("sg_map_intro_v1","1")}catch(_){}}}/>
          )}
          {/* Carte Leaflet RETIRÉE 2026-06-21 — l'app est full-SVG : la vraie carte
              (WorldMapView/ArchipelView) est montée plus bas via showArchipel. Plus de
              fallback ?nav=map, plus de chunk leaflet. */}
        </div>
        <div style={{position:"absolute",inset:0,opacity:view==="list"?1:0,
          transform:view==="list"?"translateY(0)":"translateY(14px)",
          pointerEvents:view==="list"?"auto":"none",transition:"opacity .28s ease, transform .42s cubic-bezier(.34,1.56,.64,1)"}}>
          {view==="list"&&<BeachListView beaches={filtered} onBeachClick={onBeachClick}
            favorites={favorites} lang={lang} imageMap={imageMap}
            sargData={sargData} onPremiumClick={openPremium} isPremium={isPremium} userPos={userPos}
            onRequestGeo={requestGeo}/>}
        </div>

        {/* HERO VERDICT — premier écran au-dessus de la carte (z 1050 : couvre
            header z700 + contrôles MapView z1000 ["Toute l'île"/Caraïbe],
            sous paywall z1100+). La carte charge derrière pendant la
            lecture → plus de "vide bleu nuit" au premier paint. */}
        {showHero&&heroPick&&(chasse?(
          /* BRAS A/B `arena_loop` — accueil « LA CHASSE » (boucle de jeu TCG).
             Additif : control = HomeAZ/GameFunnel/HeroVerdict, intact. ?chasse=1/0. */
          <ErrBound><Suspense fallback={null}>
          <LazyChasse beach={heroPick} lang={lang} island={island} sargData={sargData} userPos={userPos} isPremium={isPremium} captureMode={PAY_CAPTURE_ONLY} favorites={favorites} onToggleFav={toggleFav} onOpenPro={()=>{ try{track("sg_b2b_open",{source:"space"})}catch(_){}; setShowProB2B(true) }}
            pickBeaches={(allBeaches||[]).filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.score!=null)
              .sort((a,b)=>(b.score||0)-(a.score||0))}
            track={track}
            onOpen={()=>{
              dismissHero("chasse_cta")
              setSelectedBeach(heroPick)
              fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour","0-100 score · updated 4×/day","Score 0-100 · actualizado 4×/día"))
              track("sg_beach_open",{beach_id:heroPick.id,status:heroPick.status,source:"chasse"})
            }}
            onOpenBeach={b=>{
              dismissHero("chasse_card")
              setSelectedBeach(b)
              fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour","0-100 score · updated 4×/day","Score 0-100 · actualizado 4×/día"))
              track("sg_beach_open",{beach_id:b.id,status:b.status,source:"chasse_coll"})
            }}
            onPremium={src=>{dismissHero("chasse_premium");openPremium(src||"chasse")}}
            onCaptureEmail={em=>{ try{ submitLead(em,"chasse") }catch(_){} }}
            onShowMap={()=>{
              dismissHero("chasse_map")
              fireWipe(_t(lang,"Chaque pastille = la mesure du matin","Every dot = this morning's measurement","Cada punto = la medición de la mañana"))
            }}
            exiting={heroExiting}/>
          </Suspense></ErrBound>
        ):homeAZ?(
          /* BRAS A/B `home_az` — accueil A→Z (design validé, Shadow DOM).
             Additif : control = GameFunnel/HeroVerdict, intact. ?home_az=1/0. */
          <ErrBound><Suspense fallback={null}>
          <LazyHomeAZ beach={heroPick} lang={lang} island={island} sargData={sargData} userPos={userPos}
            topBeaches={(allBeaches||[]).filter(b=>(IS_NEW_REGION||b.island===island)&&b.status&&b.score!=null
                &&imageMap?.[b.id]&&!String(imageMap[b.id]).startsWith("sat-"))
              .sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,3)
              .map(b=>({...b,_img:"/beaches/"+imageMap[b.id]}))}
            track={track}
            onOpen={()=>{
              dismissHero("home_az_cta")
              setSelectedBeach(heroPick)
              fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour","0-100 score · updated 4×/day","Score 0-100 · actualizado 4×/día"))
              track("sg_beach_open",{beach_id:heroPick.id,status:heroPick.status,source:"home_az"})
            }}
            onOpenBeach={b=>{
              dismissHero("home_az_card")
              setSelectedBeach(b)
              fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour","0-100 score · updated 4×/day","Score 0-100 · actualizado 4×/día"))
              track("sg_beach_open",{beach_id:b.id,status:b.status,source:"home_az_top3"})
            }}
            onPremium={src=>{dismissHero("home_az_premium");openPremium(src||"landing")}}
            onShowMap={()=>{
              dismissHero("home_az_map")
              fireWipe(_t(lang,"Chaque pastille = la mesure du matin","Every dot = this morning's measurement","Cada punto = la medición de la mañana"))
            }}
            exiting={heroExiting}/>
          </Suspense></ErrBound>
        ):landingFunnel==="game"?(
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

        {/* PREVISIONS LANDING — /previsions/ A/B `prev_az` (golden-hour + ForecastChart).
            Control = carte brute inchangée (showPrevLanding false). ?prev_az=1/0. */}
        {showPrevLanding&&prevHeroPick&&sargData?.weekly&&(
          <ForecastLanding beach={prevHeroPick} lang={lang} island={island} sargData={sargData}
            isPremium={isPremium}
            onPremium={src=>openPremium(src||"previsions_landing")}
            onOpenBeach={b=>{
              dismissPrevLanding("beach")
              setSelectedBeach(b)
              track("sg_beach_open",{beach_id:b.id,status:b.status,source:"previsions"})
            }}
            onShowMap={()=>dismissPrevLanding("map")}
            trackFn={track}
            exiting={prevExiting}/>
        )}

        {/* CLEAN LIST — /plages-sans-sargasses/ A/B `clean_list` (golden-hour + rail clean). */}
        {showCleanList&&allBeaches?.length>=1&&(
          <ErrBound><Suspense fallback={null}>
          <LazyCleanList lang={lang} sargData={sargData}
            cleanBeaches={rankBeaches(allBeaches,island,userPos,sargData,communityReports).filter(b=>b.status==="clean").slice(0,8)}
            userPos={userPos}
            track={track}
            onOpenBeach={b=>{
              dismissCleanList("beach")
              setSelectedBeach(b)
              track("sg_beach_open",{beach_id:b.id,status:b.status,source:"clean_list"})
            }}
            onShowMap={()=>dismissCleanList("map")}/>
          </Suspense></ErrBound>
        )}

        {/* CONDITIONS PAGES — /conditions/<slug>/ A/B `pw_conditions` */}
        {showConditions && allBeaches?.length >= 1 && (
          <ErrBound><Suspense fallback={null}>
            <LazyConditions
              lang={lang}
              sargData={sargData}
              allBeaches={allBeaches}
              beachesWeather={beachesWeather}
              userPos={userPos}
              onOpenBeach={b => {
                dismissConditions("beach")
                setSelectedBeach(b)
                track("sg_beach_open", { beach_id: b.id, status: b.status, source: "conditions" })
              }}
              onShowMap={() => dismissConditions("map")}
              onPremium={src => openPremium(src || "conditions")}
              track={track}
            />
          </Suspense></ErrBound>
        )}

        {/* ALERTS HUB — /alertes/ page view (hub Premium = le veilleur personnel). */}
        {showAlertHub&&allBeaches?.length>=1&&(
          <div style={{position:"fixed",inset:0,zIndex:1006,overflowY:"auto",overflowX:"hidden",background:"#120821"}}>
            <AlertHub
              lang={lang} island={island}
              beach={heroPick}
              onPremium={src=>openPremium(src||"alertes")}
              onShowMap={()=>{setShowAlertHub(false);track("sg_alerts_to_map",{})}}
              onClose={()=>{setShowAlertHub(false);track("sg_alerts_close",{})}}
            />
          </div>
        )}

        {/* TRANSITION PHASÉE accueil → écran suivant (z 1095 : au-dessus du hero, sous paywall) */}
        {wipe&&<SceneWipe label={wipe} onDone={()=>setWipe(null)}/>}

        {/* CAPTURE EMAIL DE SORTIE (A/B exitcap) — même position/z que le toast,
            un seul s'affiche par bras. Data-backed (exitcapPick) ou rien. */}
        {showExitCap&&!showHero&&!showPrevLanding&&!selectedBeach&&!showPremium&&view==="map"&&exitcapPick&&(
          <div style={{position:"absolute",bottom:"calc(170px + env(safe-area-inset-bottom, 0px))",left:0,right:0,zIndex:1090,display:"flex",
            justifyContent:"center",pointerEvents:"none",padding:"0 16px"}}>
            <ExitEmailBand lang={lang} pick={exitcapPick}
              onClose={()=>{setShowExitCap(false);s("sg_exitcap_snooze",Date.now()+12096e5);track("sg_exitcap_dismiss",{})}}/>
          </div>
        )}
        {/* CARTE VEILLEUR D'INTENTION DE SORTIE — « ta semaine est prête » (A/B
            exit_veilleur). Capture email-cadeau pour les partants ; le jeu reste l'idle. */}
        {showExitVeilleur&&!showHero&&!showPrevLanding&&!selectedBeach&&!showPremium&&view==="map"&&exitcapPick&&(
          <ExitVeilleurCard lang={lang} pick={exitcapPick} forecast={exitcapForecast} trigger="exit"
            onClose={reason=>{setShowExitVeilleur(false);if(reason!=="submitted"){s("sg_exitcap_snooze",Date.now()+12096e5);track("sg_exitcap_dismiss",{})}}}/>
        )}
        {/* SARGACATCH PLEIN ÉCRAN — lancé direct sur AFK (idle). Le jeu /jeu/ (page
            autonome) en iframe par-dessus la carte ; × pour revenir. z1099 (sous paywall). */}
        {showGameFull&&!showHero&&!showPrevLanding&&!selectedBeach&&!showPremium&&view==="map"&&(
          <div ref={gameSwipe.ref} style={{position:"fixed",inset:0,zIndex:1099,background:"#0d2230",animation:"fadeIn .25s ease both"}}>
            <iframe src="/jeu/?utm_source=app&utm_medium=afk" title="SargaCatch"
              style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none",display:"block"}}/>
            {/* Poignée de fermeture (hors iframe) : swipe down OU tap pour fermer. */}
            <div onTouchStart={gameSwipe.onTouchStart} onTouchMove={gameSwipe.onTouchMove} onTouchEnd={gameSwipe.onTouchEnd}
              onClick={()=>{setShowGameFull(false);track("sg_game_full_close",{from:"handle"})}}
              role="button" aria-label={_t(lang,"Fermer le jeu","Close game","Cerrar juego")}
              style={{position:"fixed",top:0,left:0,right:0,height:"calc(34px + env(safe-area-inset-top))",zIndex:1101,
                display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:6,
                background:"linear-gradient(180deg,rgba(10,23,20,.55),rgba(10,23,20,0))",touchAction:"none",cursor:"pointer"}}>
              <div aria-hidden="true" style={{width:46,height:5,borderRadius:3,background:"rgba(255,255,255,.55)"}}/>
            </div>
            <button onClick={()=>{setShowGameFull(false);track("sg_game_full_close",{})}}
              aria-label={_t(lang,"Fermer le jeu","Close game","Cerrar juego")}
              style={{position:"fixed",top:"calc(10px + env(safe-area-inset-top))",right:12,zIndex:1101,
                width:38,height:38,borderRadius:"50%",background:"rgba(10,23,20,.72)",border:"1px solid rgba(255,255,255,.35)",
                color:"#fff",fontSize:20,lineHeight:1,cursor:"pointer",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)"}}>×</button>
          </div>
        )}
        {/* SARGACATCH TOAST — petit, coin bas, jamais bloquant (z 1090 :
            au-dessus des contrôles carte, sous le paywall z1100). */}
        {showGameToast&&!showHero&&!showPrevLanding&&!selectedBeach&&!showPremium&&view==="map"&&(
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
                style={{background:"#FFC72C",color:"#120821",fontWeight:800,fontSize:12.5,
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
            viewport reads as the map. Chrome is capped at 600px centered.
            Masqué pendant le paywall premium (ComicPaywall = takeover plein écran
            type ChasseDetail) : sinon le rail gris MQ/GP fuite AU-DESSUS du panel
            bottom-sheet (header z700 < backdrop semi-transparent z1005) et casse
            l'immersion BD au moment exact de la conversion. Réaffiché à la fermeture. */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:700,
          padding:`${(showRecoveryBanner||showPassExpired)?((bannerH||96)+8)+"px":"calc(max(12px, env(safe-area-inset-top)) + "+(showPushPrimer?58:0)+"px)"} 16px 0`,
          pointerEvents:"none",
          transition:"padding-top .25s ease",
          display:showPremium?"none":undefined,
        }}>
          {/* Header chrome follows the same pattern as sg-map-chrome:
              wrapper pe:none so the empty band between pill-items passes
              clicks to the map, and only direct children (the pills) absorb
              clicks. The previous inline-block+width:100% wrapper was a
              460×88 click-blocker covering the top of the map, making pins
              in that band unclickable on both mobile and desktop. */}
          <div className="sg-header-chrome" style={{maxWidth:460,margin:"0 auto",pointerEvents:"none"}}>
            <style>{`.sg-header-chrome .sg-header-row{pointer-events:none}.sg-header-chrome .sg-header-row > *{pointer-events:auto}`}</style>
            <Header island={island} onIslandChange={(id)=>{setIsland(id);setSelectedBeach(null)}}
              lang={lang} onLangToggle={toggleLang}
              theme={theme} onThemeToggle={toggleTheme}
              beachCount={allBeaches.length} dataSource={dataSource}
              updatedAt={sargData?.updatedAt||sargData?.erddapTimestamp}
              onHome={()=>{
                try{sessionStorage.removeItem("sg_hero_seen")}catch(_){}
                setSelectedBeach(null);setShowHero(true)
                track("sg_landing_replay",{})
              }}
              isPremium={isPremium}
              onAccess={()=>{
                // Premium → montre le statut (Pass actif + échéance si connue). Sinon →
                // invite de restauration (jamais de cul-de-sac). Flag rollback ?monacces=0.
                if(isPremium){
                  let until=""
                  try{const pe=parseInt(localStorage.getItem("sg_premium_pass_end")||"0",10)
                    if(pe&&pe>Date.now())until=new Date(pe).toLocaleDateString(lang==="en"?"en-GB":lang==="es"?"es-ES":"fr-FR",{day:"numeric",month:"long",year:"numeric"})}catch(_){}
                  try{sgToast({tone:"success",title:_t(lang,"Pass actif","Pass active","Pase activo"),msg:until?_t(lang,"Actif jusqu'au "+until,"Active until "+until,"Activo hasta el "+until):_t(lang,"Premium actif sur cet appareil.","Premium active on this device.","Premium activo en este dispositivo.")})}catch(_){}
                  try{track("sg_access_status_view",{has_end:!!until})}catch(_){}
                }else{
                  try{track("sg_access_check_open",{src:"header"})}catch(_){}
                  openAccessCheck("header")
                }
              }}
              onEnableNotif={()=>forceEnablePush("header")}/>
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
                  maxHeight:"min(280px,40vh)",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain"}}>
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
                          <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)"}}>{b.commune}</div>
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
                animation:"dot-pulse 2s ease-in-out 1 both"}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--sg-ink)",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {nextSuggestion.beach.name}
                  <span style={{fontWeight:500,color:C.green,marginLeft:6}}>
                    {_t(lang,"est propre","is clean","está limpia")}
                  </span>
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:1}}>
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

        {/* BOTTOM NAV RETIRÉE (décision fondateur) — la barre Carte/Liste/Premium
            faisait doublon avec le dock carte (Près de moi/Toutes/Veilleur) et alourdissait
            le chargement. Navigation = carte (cœur produit) ; Premium reste accessible via
            le dock « Veilleur », les CTA des fiches, les locks prévision. La vue Liste n'est
            plus montée (économie de rendu). */}

        {/* BOTTOM SHEET (beach detail) — refonte « Comic Pop » verdict-first (2026-06-21).
            Remplace l'ancien split BeachSheet/BeachDive : une seule fiche, cohérente
            avec le hero Le Veilleur (coucher de soleil néon + comic), pilotée par la
            recherche conversion. ErrBound → ancienne BeachSheet en filet de sécurité,
            on ne montre JAMAIS "rien" sur un clic de plage. */}
        {selectedBeach&&(()=>{
          const _sid=IS_NEW_REGION?selectedBeach.id:BEACH_TO_SARG[selectedBeach.id]
          const _fc=(_sid&&sargData?.weekly?.[_sid]?.forecast)||sargData?._enrichedWeekly?.[`_interp_${selectedBeach.id}`]?.forecast||null
          const _fallback=(
            <BeachSheet beach={selectedBeach} onClose={closeSheet}
              favorites={favorites} onToggleFav={toggleFav} lang={lang}
              allBeaches={allBeaches} imageMap={imageMap}
              onBeachClick={onBeachClick} onPremiumClick={openPremium} isPremium={isPremium}
              historyData={historyData} sargData={sargData}
              dataSource={dataSource} userPos={userPos} communityReports={communityReports} fbPosts={fbPosts}
              onRequestGeo={requestGeo}/>
          )
          return(
            <ErrBound key={selectedBeach.id} fallback={_fallback}>
              <BeachSheetComic beach={selectedBeach} onClose={closeSheet}
                favorites={favorites} onToggleFav={toggleFav} lang={lang}
                allBeaches={allBeaches} onBeachClick={onBeachClick}
                onPremiumClick={openPremium} isPremium={isPremium}
                sargData={sargData} userPos={userPos} forecast={_fc} track={track}
                communityReports={communityReports} onRequestGeo={requestGeo}/>
            </ErrBound>
          )
        })()}

        {/* CAPTURE GATE — A/B capture_gate · intercept forecast intent avant PremiumModal */}
        {showCaptureGate&&<CaptureGateModal lang={lang} beach={selectedBeach||null}
          onSubmit={em=>{
            try{localStorage.setItem("sg_email",em);localStorage.setItem("sg_email_prompt","true")}catch(_){}
            submitLead(em,"capture-gate")
            track("sg_capture_gate_submit",{src:captureGateSrc,variant:"gate"})
            // CAPTURE : tenir la promesse du titre (« Débloque la météo de {plage}
            // pour demain ») → débloquer RÉELLEMENT 7j premium, comme la branche
            // gap_freemium (doSubscribe 7822-7833). Le lead est déjà capturé ci-dessus
            // (un seul submitLead « capture-gate » : pas de double-comptage, attribution
            // funnel préservée). 100% réversible : au go-live Mollie (PAY_CAPTURE_ONLY
            // =false) onPay est redéfini (cf. plus bas) et cette branche ne tourne plus.
            if(PAY_CAPTURE_ONLY){
              try{localStorage.setItem("sg_premium_pass_end",String(Date.now()+7*86400000))}catch(_){}
              try{track("sg_gap_freemium_unlock",{source:"capture_gate"})}catch(_){}
              setIsPremium(true)
              setShowCaptureGate(false)
              setShowWelcome(true)
            }
            // (Hors capture : porte EMAIL = lead seul ; la CB reste via le bouton onPay.)
          }}
          onPay={PAY_CAPTURE_ONLY?undefined:()=>{
            setShowCaptureGate(false)
            track("sg_capture_gate_pay",{src:captureGateSrc})
            setPremiumSource("gate_cb");setShowPremium(true);track("sg_premium_modal_open",{source:"gate_cb"})
          }}
          onClose={()=>{
            setShowCaptureGate(false)
            track("sg_capture_gate_dismiss",{src:captureGateSrc})
          }}/>}

        {/* PREMIUM MODAL */}
        {showPremium&&<ErrBound><Suspense fallback={null}><PremiumModal onClose={()=>setShowPremium(false)} lang={lang} source={premiumSource}
          onActivated={()=>{setIsPremium(true);setShowWelcome(true)}} sargData={sargData} island={island}
          beach={selectedBeach||null}/></Suspense></ErrBound>}

        {/* B2B PRO (self-serve) — deep-link ?pro=1 depuis l'outreach B2B */}
        {showProB2B&&<ErrBound><Suspense fallback={null}><B2BModal lang={lang} onClose={()=>setShowProB2B(false)}/></Suspense></ErrBound>}

        {/* JOURNAL DU VEILLEUR — nouveautés pour visiteurs qui reviennent (gated wn1).
            Garde-fous : jamais par-dessus le hero/onboarding/paywall/fiche ouverte. */}
        {whatsNew&&!showHero&&!showPrevLanding&&!showOnboarding&&!showPremium&&!showCaptureGate&&!showWelcome&&!selectedBeach&&(
          <WhatsNewJournal lang={lang} title={whatsNew.title} items={whatsNew.items}
            releaseV={whatsNew.v} releaseDate={whatsNew.date} allowDeepLinks={!IS_NEW_REGION} isPremium={isPremium}
            mood={(()=>{const[,clean,,avoid]=filterCounts;return avoid>0?(avoid>=2?"alerte":"vigilant"):clean>0?"serein":"scan"})()}
            onClose={()=>{try{s("sg_rel_seen",whatsNew.v)}catch(_){};track("sg_whatsnew_dismiss",{v:whatsNew.v});setWhatsNew(null)}}
            onExplore={()=>{
              try{s("sg_rel_seen",whatsNew.v)}catch(_){};track("sg_whatsnew_cta",{v:whatsNew.v})
              setWhatsNew(null);setShowPremium(false);setView("map")
              if(myBeach)onBeachClick(myBeach) // atterrissage personnel : sa plage en direct
            }}
            onPremium={()=>{try{s("sg_rel_seen",whatsNew.v)}catch(_){};track("sg_whatsnew_premium",{v:whatsNew.v});setWhatsNew(null);openPremium("whatsnew")}}/>
        )}

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
        {diveBeach&&<ErrBound fallback={null}><Suspense fallback={null}><DiveTransition beach={diveBeach} lang={lang} onDone={()=>setDiveBeach(null)}/></Suspense></ErrBound>}

        {/* SARGACHAT — assistant guidé statique (réponses = donnée live, arbre fermé) */}
        {!showHero&&!showPrevLanding&&!showPremium&&!showChat&&(
          <button onClick={()=>{setShowChat(true);track("sg_chat_open",{})}} aria-label={_t(lang,"Demander au Veilleur","Ask the Watchman","Preguntar al Vigía")}
            className="sg-fab"
            style={{position:"fixed",right:14,bottom:"calc(166px + env(safe-area-inset-bottom))",zIndex:960,
              width:46,height:46,borderRadius:"50%",background:"#190c2c",border:"2.5px solid #0d0b14",
              cursor:"pointer",boxShadow:"2px 2px 0 #0d0b14",display:"flex",
              alignItems:"center",justifyContent:"center",
              animation:"viewFadeIn .35s cubic-bezier(.22,1,.36,1) both"}}>
            {/* Assistant = mini Le Veilleur (satellite, seul personnage autorisé) — plus de 💬 */}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.4" fill="#FFC72C" stroke="#FDFCF7" strokeWidth="1.3"/>
              <circle cx="12" cy="12" r="1.1" fill="#0A1714"/>
              <path d="M9.2 11 4.5 8.2M14.8 11 19.5 8.2" stroke="#FFC72C" strokeWidth="1.6" strokeLinecap="round"/>
              <rect x="3" y="6.4" width="3" height="3.4" rx=".7" fill="#1EC8B0" stroke="#FDFCF7" strokeWidth="1.1"/>
              <rect x="18" y="6.4" width="3" height="3.4" rx=".7" fill="#1EC8B0" stroke="#FDFCF7" strokeWidth="1.1"/>
              <path d="M8 18 Q12 16 16 18" stroke="#1EC8B0" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        {showChat&&<SargaChat lang={lang} allBeaches={allBeaches} island={island} sargData={sargData}
          onOpenBeach={onBeachClick} onPremium={()=>openPremium("chat")} onClose={()=>setShowChat(false)}/>}

        {/* DÉCOUVERTE — moteur StoryEngine (éducatif SVG). Entrée chip + overlay. */}
        {!showHero&&!showPrevLanding&&!showPremium&&!showChat&&!showDiscovery&&!selectedBeach&&view==="map"&&(
          <button onClick={()=>{setShowDiscovery(true);track("sg_discovery_open",{})}} aria-label={_t(lang,"Comprendre les sargasses","Understand sargassum","Entender el sargazo")}
            className="sg-fab"
            style={{position:"fixed",right:14,bottom:"calc(220px + env(safe-area-inset-bottom))",zIndex:960,
              width:46,height:46,borderRadius:"50%",background:"#190c2c",border:"2.5px solid #0d0b14",
              cursor:"pointer",boxShadow:"2px 2px 0 #0d0b14",display:"flex",alignItems:"center",justifyContent:"center",
              animation:"viewFadeIn .35s cubic-bezier(.22,1,.36,1) both"}}>
            {/* Comprendre = œil dans l'espace (orbite) — plus de 🛰️ OS */}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <ellipse cx="12" cy="12" rx="10" ry="4.6" stroke="#1EC8B0" strokeWidth="1.7" transform="rotate(-28 12 12)"/>
              <circle cx="12" cy="12" r="4" fill="none" stroke="#FDFCF7" strokeWidth="1.8"/>
              <circle cx="12" cy="12" r="1.7" fill="#FFC72C"/>
            </svg>
          </button>
        )}
        {showDiscovery&&<DiscoveryStory lang={lang} onClose={()=>setShowDiscovery(false)} onShowMap={()=>setShowDiscovery(false)}/>}

        {showStation && stationSlug && (
          <StationStory slug={stationSlug} lang={lang}
            onExit={()=>{ setShowStation(false); track("sg_station_exit",{slug:stationSlug}) }}
            onCTA={()=>{
              track("sg_station_cta",{slug:stationSlug})
              setShowStation(false)
              // TODO map_world: flyTo(nearestCleanBeach)
              if(stationSlug.includes("h2s")){ openPremium("station_h2s") }
              else if(stationSlug.includes("nettoyer")){ setShowSolutions(true) }
              else { setView("map") }
            }}/>
        )}

        {/* SOLUTIONS — pages SVG (problème→on voit→on agit→on transforme→on sort). Escapable. */}
        {!showHero&&!showPrevLanding&&!showPremium&&!showChat&&!showDiscovery&&!showSolutions&&!showWorld&&!selectedBeach&&view==="map"&&(
          <button onClick={()=>{setShowSolutions(true);track("sg_solutions_open",{})}} aria-label={_t(lang,"Les solutions sargasses","Sargassum solutions","Soluciones al sargazo")}
            className="sg-fab"
            style={{position:"fixed",right:14,bottom:"calc(328px + env(safe-area-inset-bottom))",zIndex:960,
              width:46,height:46,borderRadius:"50%",background:"#190c2c",border:"2.5px solid #0d0b14",
              cursor:"pointer",boxShadow:"2px 2px 0 #0d0b14",display:"flex",alignItems:"center",justifyContent:"center",
              animation:"viewFadeIn .35s cubic-bezier(.22,1,.36,1) both"}}>
            {/* Solutions = ampoule (idée/agir) — plus de 💡 OS */}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.45.9 1 .9 1.7V16h5.4v-.5c0-.7.3-1.25.9-1.7A6 6 0 0 0 12 3z" stroke="#1EC8B0" strokeWidth="1.7" fill="none" strokeLinejoin="round"/>
              <path d="M9.6 18.5h4.8M10.4 21h3.2" stroke="#FFC72C" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        {showSolutions&&<SolutionsStory lang={lang} onClose={()=>{setShowSolutions(false);track("sg_solutions_close",{})}}
          onExit={()=>{setShowSolutions(false);track("sg_solutions_exit_cta",{});openPremium("solutions_exit")}}/>}

        {/* L'ARCHIPEL DU VEILLEUR — monde SVG libre pan/zoom (tournoi gagnant). v0 QA. */}
        {!showHero&&!showPrevLanding&&!showPremium&&!showChat&&!showDiscovery&&!showSolutions&&!showWorld&&!showArchipel&&!selectedBeach&&view==="map"&&(
          <button onClick={()=>{setShowArchipel(true);track("sg_archipel_open",{from:"fab"})}} aria-label={_t(lang,"L'archipel du Veilleur","The Watcher's archipelago","El archipiélago")}
            className="sg-fab"
            style={{position:"fixed",right:14,bottom:"calc(382px + env(safe-area-inset-bottom))",zIndex:960,
              width:46,height:46,borderRadius:"50%",background:"#190c2c",border:"2.5px solid #0d0b14",
              cursor:"pointer",boxShadow:"2px 2px 0 #0d0b14",display:"flex",alignItems:"center",justifyContent:"center",
              animation:"viewFadeIn .35s cubic-bezier(.22,1,.36,1) both"}}>
            {/* Archipel = boussole (explorer) — plus de 🧭 OS */}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="#1EC8B0" strokeWidth="1.7"/>
              <path d="M15.5 8.5 10.5 10.5 8.5 15.5 13.5 13.5z" fill="#FFC72C" stroke="#FDFCF7" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        {showArchipel&&(mapWorld==="world"
          ?<ErrBound><Suspense fallback={<div style={{position:"fixed",inset:0,background:"#072019",zIndex:1020}}/>}>
              <LazyWorldMapView
                beaches={allBeaches} island={island} updatedAt={sargData?.erddapTimestamp||sargData?.updatedAt||null}
                lang={lang} onOpenBeach={onMapBeach} onPremium={openPremium} isPremium={isPremium}
                rootMode={navWorld} track={track} initialZone={initialZone} warm={mapWarm==="warm"}
                arrivals={(()=>{const m={};try{for(const b of (allBeaches||[])){const sid=IS_NEW_REGION?b.id:BEACH_TO_SARG[b.id];const w=sid&&sargData?.weekly?.[sid];if(w&&(w.arrivalDetected||w.arrivalDay!=null))m[b.id]={s:w.arrivalStrength||0.1,d:w.arrivalDay};}}catch(_){}return m})()}
                forecastByBeach={(()=>{const m={};try{for(const b of (allBeaches||[])){const sid=IS_NEW_REGION?b.id:BEACH_TO_SARG[b.id];const wk=(sid&&sargData?.weekly?.[sid])||sargData?._enrichedWeekly?.[`_interp_${b.id}`];const fc=wk&&wk.forecast;if(fc&&fc.length){m[b.id]={d:fc.slice(0,6).map(d=>({st:d.status,c:d.confidence,date:d.date})),drift:wk.drift||null,arrivalDay:(wk.arrivalDetected&&wk.arrivalDay!=null)?wk.arrivalDay:null};}}}catch(_){}return m})()}
                onCaptureEmail={em=>{try{submitLead(em,"map_world")}catch(_){}}}
                onShare={shareBeachCard}
                seasonOutlook={sargData?.seasonOutlook||null}
                topInset={(showRecoveryBanner||showPassExpired)?(bannerH||96):0}
                onOpenPro={()=>{try{track("sg_b2b_open",{source:"map"})}catch(_){}; setShowProB2B(true)}}
                onAccess={()=>openAccessCheck("map")} onEnableNotif={()=>loadPushNow("map")}
                onClose={()=>{setShowArchipel(false);track("sg_archipel_close",{source:"map_world"})}}/>
            </Suspense></ErrBound>
          :<ArchipelView beaches={allBeaches} island={island} userPos={userPos} lang={lang} onOpenBeach={onMapBeach} onSolutions={()=>{setShowSolutions(true);track("sg_archipel_to_solutions",{})}} onPremium={()=>openPremium("archipel")} rootMode={navWorld} updatedAt={sargData?.erddapTimestamp||sargData?.updatedAt||null} onClose={()=>{setShowArchipel(false);track("sg_archipel_close",{})}} initialZone={initialZone} onRequestGeo={requestGeo}/>

        )}

        {/* ⭐ DÉTAIL COMIC depuis la carte (PRODUCT.md §8) — pin tapé → ChasseDetail
            in-world (verdict+score+facts+7j+H2S+Plan-B+voisines) au lieu de la fiche
            data. Suspense+ErrBound : si le chunk/rendu échoue → fallback fiche data
            (onBeachClick). onFull = pont explicite vers la fiche data. */}
        {comicBeach&&(
          <ErrBound fallback={null} onError={()=>{const b=comicBeach;setComicBeach(null);try{track("sg_comic_detail_fail",{beach_id:b&&b.id})}catch(_){}; if(b)onBeachClick(b)}}>
            <Suspense fallback={<div style={{position:"fixed",inset:0,background:"#2e1a5e",zIndex:1200}}/>}>
              <LazyComicDetail
                beach={comicBeach} lang={lang} track={track} pool={allBeaches} isPremium={isPremium}
                onClose={()=>{setComicBeach(null);track("sg_comic_detail_close",{beach_id:comicBeach.id})}}
                onPremium={(src)=>{const b=comicBeach;setComicBeach(null);openPremium(src||"comic_map")}}
                onFull={()=>{const b=comicBeach;setComicBeach(null);track("sg_comic_detail_full",{beach_id:b&&b.id});if(b)onBeachClick(b)}}
                onRelated={(b)=>{if(b&&b.id)setComicBeach(b)}}
                communityReports={communityReports} ReportComp={BeachReport}/>
            </Suspense>
          </ErrBound>
        )}

        {/* MONDE SVG — la fondation : feed vertical des plages, zéro photo, data en
            scène, cliquable, loopé. Additif (z1005) ; fiche+paywall s'ouvrent au-dessus. */}
        {showWorld&&<WorldFeed beaches={allBeaches} island={island} lang={lang}
          onPremium={openPremium} onClose={()=>{setShowWorld(false);track("sg_world_close",{})}}/>}
        {/* FAB 🌊 World-feed RETIRÉ (IA unifiée 14/06) : l'Archipel 🧭 le supersède
            (carte + visite scroll). WorldFeed reste accessible en QA via ?world=1. */}

        {/* REFERRAL LANDING BANNER — hidden if Welcome toast is showing to avoid overlap */}
        {showReferralBanner&&!showWelcome&&(
          <div onClick={()=>{openPremium("referral_banner");setShowReferralBanner(false)}} style={{position:"fixed",bottom:"calc(104px + env(safe-area-inset-bottom, 0px))",left:"50%",transform:"translateX(-50%)",
            zIndex:1300,background:"linear-gradient(135deg,#7C3AED,#A855F7)",color:"#fff",
            padding:"12px 20px",borderRadius:14,fontSize:13,fontWeight:600,
            boxShadow:"0 8px 24px rgba(124,58,237,.35)",cursor:"pointer",
            display:"flex",alignItems:"center",gap:10,maxWidth:"min(90vw, 460px)",boxSizing:"border-box",
            animation:"slideUp .4s ease"}}>
            <span style={{fontSize:20}}>🌊</span>
            <div>
              <div>{_t(lang,"Un ami t'a passé le relais 🌊","A friend passed you the watch 🌊","Un amigo te pasó el relevo 🌊")}</div>
              <div style={{fontSize:10,fontWeight:400,opacity:.85,marginTop:2}}>
                {_t(lang,"Touche : le verdict satellite de ta plage, ce matin — mesuré, pas deviné. Gratuit.","Tap: your beach's satellite verdict this morning — measured, not guessed. Free.","Toca: el veredicto satelital de tu playa, esta mañana — medido, no adivinado. Gratis.")}
              </div>
            </div>
            <button aria-label="Close" onClick={e=>{e.stopPropagation();setShowReferralBanner(false)}} style={{
              background:"rgba(255,255,255,.2)",border:"none",color:"#fff",
              borderRadius:12,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",fontSize:16,marginLeft:8}}>✕</button>
          </div>
        )}

        {/* PREMIUM WELCOME TOAST */}
        {/* Onboarding payant guidé (A/B pw_onboard) — remplace le toast. Lazy sous Suspense+ErrBound,
            fallback = fermer (le control toast n'est pas re-render ici, donc échec = pas de "rien" bloquant). */}
        {showWelcome&&paidSplashOn&&!splashDone&&(
          <div role="status" aria-live="polite" style={{position:"fixed",inset:0,zIndex:1500,
            background:"radial-gradient(120% 90% at 75% -10%, rgba(255,199,44,.28), rgba(255,199,44,0) 55%), linear-gradient(168deg,#0B2230 0%,#0D1E1C 58%,#0A1714 100%)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 24px",textAlign:"center"}}>
            <span aria-hidden="true" style={{width:66,height:66,borderRadius:"50%",background:"#FFC72C",
              display:"flex",alignItems:"center",justifyContent:"center",marginBottom:18,boxShadow:"0 0 0 8px rgba(255,199,44,.16)"}}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0B2230" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </span>
            <div style={{fontFamily:"'Anton',sans-serif",fontWeight:400,textTransform:"uppercase",fontSize:34,letterSpacing:".01em",lineHeight:1.05,color:"#fff",textShadow:"0 2px 0 rgba(0,0,0,.35)"}}>
              {_t(lang,"Premium activé","Premium activated","Premium activado")}</div>
            <div style={{fontSize:15,lineHeight:1.5,color:"rgba(255,255,255,.72)",marginTop:12,maxWidth:"30ch"}}>
              {PAY_CAPTURE_ONLY?_t(lang,"7 jours premium offerts. Tes prévisions 7 jours et tes alertes sont débloquées.","7 days premium on us. Your 7-day forecast and alerts are unlocked.","7 días premium gratis. Tu pronóstico de 7 días y tus alertas están desbloqueados."):_t(lang,"Paiement validé. Tes prévisions 7 jours et tes alertes sont débloquées.","Payment confirmed. Your 7-day forecast and alerts are unlocked.","Pago confirmado. Tu pronóstico de 7 días y tus alertas están desbloqueados.")}</div>
            <button type="button" onClick={()=>{try{track("sg_premium_confirm_continue")}catch(_){};setSplashDone(true)}}
              style={{marginTop:26,background:"#FFC72C",color:"#0B2230",border:"none",borderRadius:13,padding:"14px 30px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit",boxShadow:"3px 3px 0 rgba(0,0,0,.35)"}}>
              {_t(lang,"Continuer →","Continue →","Continuar →")}</button>
          </div>
        )}
        {showWelcome&&(!paidSplashOn||splashDone)&&pwOnboard==="onboard"&&(
          <ErrBound fallback={null}>
            <Suspense fallback={<div style={{position:"fixed",inset:0,background:"#02060A",zIndex:1450}}/>}>
              {POSTE_OFF
                ? <LazyPaidOnboarding lang={lang} allBeaches={allBeaches} favorites={favorites}
                    onToggleFav={toggleFav} onEnableNotif={()=>forceEnablePush("onboard")}
                    onDone={()=>setShowWelcome(false)} island={island} userPos={userPos} track={track}/>
                : <LazyWelcomePoste lang={lang} allBeaches={allBeaches} favorites={favorites}
                    onToggleFav={toggleFav} onEnableNotif={()=>forceEnablePush("onboard")}
                    onSaveEmail={em=>{try{localStorage.setItem("sg_premium_email",em)}catch(_){}; try{submitLead(em,"onboard_premium")}catch(_){}}}
                    onDone={()=>setShowWelcome(false)} island={island} userPos={userPos} track={track}/>}
            </Suspense>
          </ErrBound>
        )}
        {showWelcome&&(!paidSplashOn||splashDone)&&pwOnboard!=="onboard"&&(
          /* « Premium activé » — recette canonique de marque (plus de bleu pirate).
             Papier crème, liseré ink, ombre dure, Veilleur calme, titre Anton, ✕ SVG. */
          <div className="sg-toast sg-toast--success" role="status" style={{
            position:"fixed",bottom:"calc(104px + env(safe-area-inset-bottom, 0px))",left:"50%",
            transform:"translateX(-50%)",zIndex:1400,width:"min(92vw,460px)",
            boxShadow:"6px 6px 0 var(--sg-ink,#0d0d0d)"}}>
            <span className="sg-toast__bar"/>
            <span className="sg-toast__veil" aria-hidden="true"><Veilleur mood="serein" size={38}/></span>
            <div className="sg-toast__body">
              <div style={{fontFamily:"'Anton',sans-serif",fontWeight:400,textTransform:"uppercase",
                fontSize:22,letterSpacing:"-.01em",lineHeight:1.1,color:"var(--sg-ink,#0d0d0d)"}}>
                {_t(lang,"Premium activé","Premium activated","Premium activado")}</div>
              <div className="sg-toast__msg">{_t(lang,"Brief matin · alertes · reco du jour.","Morning brief · alerts · daily pick.","Brief matinal · alertas · pick del día.")}</div>
              {!PAY_CAPTURE_ONLY&&<a href="?manage=1" onClick={e=>{e.stopPropagation();track("sg_manage_click")}}
                style={{display:"inline-block",marginTop:8,fontSize:14,fontWeight:800,color:"var(--sg-teal,#009E8E)",textDecoration:"none"}}>
                {_t(lang,"Gérer mon abonnement","Manage my subscription","Gestionar mi suscripción")}</a>}
            </div>
            <SgClose lang={lang} onClick={()=>setShowWelcome(false)}/>
          </div>
        )}
        {/* Toasts de marque — remplace les alert() OS (singleton sgToast(...)) */}
        <SgToastHost lang={lang}/>
      </div>
    </LangCtx.Provider>
  )
}
