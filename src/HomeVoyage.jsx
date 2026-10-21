/**
 * HomeVoyage — accueil « interface produit » (bras A/B `voyage`).
 *
 * P1.5 — Design lead « L'Aube du Veilleur » (2026-10-21) : identité visuelle
 * martiniquaise (golden hour), photo réelle en grand en hero, hiérarchie
 * VOIR → COMPRENDRE → CHOISIR → AGIR. Devenait la page d'entrée PAR DÉFAUT,
 * sans supprimer l'accueil précédent (arène TCG `chasse`).
 *
 * Philosophie : un produit de marque, pas une démonstration de composants.
 * Aucune illustration factice, aucune statistique inventée, aucun témoignage
 * fabriqué. Seules les vraies données du pipeline, les vraies photos et les
 * vraies limites des prévisions sont affichées.
 *
 * ADDITIF / RÉVERSIBLE :
 *   - `?voyage=0`  → retombe sur l'accueil précédent (bras `chasse`) ;
 *   - `?chasse=1`  → force l'ancien accueil (contrôle intact) ;
 *   - `?hero=0`    → carte-first pur (ancien défaut).
 * Aucun état serveur, aucun montant, aucune route touchée.
 *
 * CSS : design system `sg-travel-3.0.css` (déjà présent, jamais utilisé) +
 * bloc additionnel scopé `.vg-` (zéro fuite). Chunk lazy → zéro impact budget
 * JS eager (209,4/210 Ko). Aucune animation infinie (reduced-motion respecté).
 */
import React,{useState,useEffect,useRef,useMemo,useCallback} from "react"
import { isSatelliteStale36h, isSatelliteFresh12h, satelliteAgeHours, lcDetailFreshnessLabel } from "./lib/format-freshness.mjs"
import { resolveBeachPhoto } from "./lib/beach-photo.js"
import "./sg-travel-3.0.css"

/* ---- couleurs de verdict : IDENTIQUES au reste du produit (inter-surfaces) ---- */
const V_COL={clean:"#FFC72C",moderate:"#F59E0B",avoid:"#E8522A"}

/* ---- palette « L'Aube du Veilleur » : or / sable / océan / encre ---- */
const P={gold:"#FFC72C",sand:"#F4E7C8",ocean:"#06222E",sea:"#0E4A5A",ink:"#0d0b14",
  paper:"#FFFDF6",tropical:"#00B086",sunset:"#FF9E5E",line:"rgba(255,253,246,.14)"}

/* ---- i18n local (même pattern que les autres bras d'accueil) ---- */
function mkT(lang){ const _t=(o)=>o&&(o[lang]!=null?o[lang]:o.fr); return _t }

/* ---- distance réelle (haversine) — utilisée seulement si userPos existe ---- */
function kmBetween(a,b,c,d){
  const R=6371,p=Math.PI/180
  const dl=(c-a)*p,dg=(d-b)*p
  const h=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a*p)*Math.cos(c*p)*Math.sin(dg/2)*Math.sin(dg/2)
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))
}

/* ---- photo réelle de la plage (même source et cache que les autres écrans) ---- */
let PHOTO_MAP=null, PHOTO_P=null
function photoMap(){
  if(PHOTO_MAP)return Promise.resolve(PHOTO_MAP)
  if(!PHOTO_P){
    PHOTO_P=fetch("/data/beaches-images.json",{cache:"force-cache",credentials:"same-origin"})
      .then(r=>r.ok?r.json():{}).then(m=>{PHOTO_MAP=(m&&typeof m==="object"&&!Array.isArray(m))?m:{};return PHOTO_MAP})
      .catch(()=>{PHOTO_MAP={};return PHOTO_MAP})
  }
  return PHOTO_P
}

/* ---- libellés des compteurs : jamais « aujourd'hui » si la donnée n'est pas fraîche ---- */
function cleanLabel(lang,ctx){
  if(ctx.fresh) return lang==="es"?"sin sargazo hoy":lang==="en"?"sargassum-free today":"sans sargasse aujourd'hui"
  if(ctx.stale) return lang==="es"?"sin sargazo (dato antiguo)":lang==="en"?"sargassum-free (old data)":"sans sargasse (donnée ancienne)"
  if(ctx.unknown) return lang==="es"?"sin sargazo (sin dato)":lang==="en"?"sargassum-free (no data)":"sans sargasse (sans donnée)"
  const h=Math.round(ctx.ageH)
  return lang==="es"?`sin sargazo (${h} h)`:lang==="en"?`sargassum-free (${h}h ago)`:`sans sargasse (${h} h)`
}
function avoidLabel(lang,ctx){
  if(ctx.fresh) return lang==="es"?"a evitar hoy":lang==="en"?"to avoid today":"à éviter aujourd'hui"
  if(ctx.stale) return lang==="es"?"a evitar (dato antiguo)":lang==="en"?"to avoid (old data)":"à éviter (donnée ancienne)"
  if(ctx.unknown) return lang==="es"?"a evitar (sin dato)":lang==="en"?"to avoid (no data)":"à éviter (sans donnée)"
  const h=Math.round(ctx.ageH)
  return lang==="es"?`a evitar (${h} h)`:lang==="en"?`to avoid (${h}h ago)`:`à éviter (${h} h)`
}

/* ---- « pourquoi cette plage » = caractéristiques RÉELLES de la plage ---- */
function traits(b,lang){
  const o=[]
  if(b.snorkel) o.push(lang==="es"?"Snorkel":lang==="en"?"Snorkelling":"Snorkeling")
  if(b.kids) o.push(lang==="es"?"Familias":lang==="en"?"Family-friendly":"Familles")
  if(b.parking) o.push(lang==="es"?"Parking":lang==="en"?"Parking":"Parking")
  if(b.drive!=null&&isFinite(b.drive)) o.push(lang==="es"?"a "+b.drive+" min":"à "+b.drive+" min")
  return o.slice(0,3)
}

/* ---- contexte de fraîcheur : observation satellite UNIQUEMENT (jamais updatedAt) ---- */
function freshnessCtx(sargData, lang){
  const ageH = satelliteAgeHours(sargData)
  const fresh = isSatelliteFresh12h(sargData)      // < 12 h : observation actuelle
  const stale = isSatelliteStale36h(sargData)       // >= 36 h : observation en retard
  const unknown = ageH == null                      // absent / invalide / futur
  const recent = !fresh && !stale && !unknown       // 12–36 h : âge visible, pas « aujourd'hui »
  return { ageH, fresh, stale, unknown, recent }
}

/* ---- verdict avec fraîcheur : ne JAMAIS prétendre « aujourd'hui » si la mesure n'est pas fraîche ---- */
function verdictTxt(b, lang, ctx){
  if(!b)return""
  const word = b.status==="clean"?(lang==="es"?"PROPRE":lang==="en"?"CLEAN":"PROPRE")
    : b.status==="moderate"?(lang==="es"?"MODERADA":lang==="en"?"MODERATE":"MODÉRÉ")
    : (lang==="es"?"EVITAR":lang==="en"?"AVOID":"À ÉVITER")
  if(ctx.fresh) return word + (lang==="es"?" HOY":lang==="en"?" TODAY":" AUJOURD'HUI")
  if(ctx.stale) return word + (lang==="es"?" (dato antiguo)":lang==="en"?" (old data)":" (donnée ancienne)")
  if(ctx.unknown) return word + (lang==="es"?" (sin dato)":lang==="en"?" (no data)":" (sans donnée)")
  const h = Math.round(ctx.ageH)
  return word + (lang==="es"?` (${h} h)`:lang==="en"?` (${h}h ago)`:` (${h} h)`)
}

/* ---- libellé de statut court (mot seul, sans « aujourd'hui ») ---- */
function statusShort(b,lang){
  return b.status==="clean"?(lang==="es"?"Limpia":lang==="en"?"Clean":"Propre")
    : b.status==="moderate"?(lang==="es"?"Moderada":lang==="en"?"Moderate":"Modéré")
    : (lang==="es"?"Evitar":lang==="en"?"Avoid":"À éviter")
}

/* ---- CSS additionnel, scopé .vg- (injecté une fois) — kebab-case volontaire ---- */
const VG_CSS = `
.vg-root{position:fixed;inset:0;z-index:1050;background:var(--t3-ocean);overflow-y:auto;overflow-x:hidden;
  overscroll-behavior:contain;-webkit-overflow-scrolling:touch;color:var(--t3-paper);outline:none}
.vg-wrap{max-width:1000px;margin:0 auto;padding:0 16px 110px}
.vg-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;
  padding:calc(10px + env(safe-area-inset-top)) 16px 10px;background:rgba(6,34,46,.92);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:1px solid var(--t3-line)}
.vg-mark{font-family:var(--t3-display);font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--t3-paper);opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.vg-pill{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;padding:6px 11px;border-radius:999px;
  font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:1px solid transparent}
.vg-pill.ok{background:rgba(0,176,134,.16);color:#7FE7C8;border-color:rgba(127,231,200,.4)}
.vg-pill.warn{background:rgba(245,158,11,.16);color:#FCD34D;border-color:rgba(252,211,77,.4)}
.vg-pill.bad{background:rgba(232,82,42,.16);color:#FFA78F;border-color:rgba(255,167,143,.4)}
.vg-topbtn{flex:0 0 auto;min-height:40px;padding:8px 16px;border-radius:999px;border:1.5px solid var(--t3-line);
  background:rgba(255,253,246,.1);color:var(--t3-paper);font-family:inherit;font-size:13px;font-weight:800;cursor:pointer}
.vg-topbtn:hover{background:rgba(255,253,246,.18)}

/* ---- HERO : photo réelle en grand, titre, CTA, compteurs ---- */
.vg-hero{position:relative;margin:0 -16px;padding:calc(16px + env(safe-area-inset-top)) 16px 24px;
  background:linear-gradient(165deg,var(--t3-ocean) 0%,var(--t3-sea) 55%,rgba(201,126,58,.18) 100%);
  box-shadow:var(--t3-shadow-2)}
.vg-hero .inner{max-width:1000px;margin:0 auto}
.vg-hero-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 40%;z-index:1}
.vg-hero-shade{position:absolute;inset:0;pointer-events:none;z-index:2;
  background:linear-gradient(180deg,rgba(6,34,46,.35) 0%,rgba(6,34,46,0) 35%,rgba(6,34,46,.72) 100%)}
.vg-hero-body{position:relative;z-index:3;padding:0}
.vg-date{margin:0;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#FFE08A}
.vg-title{font-family:var(--t3-display);font-weight:400;font-size:clamp(30px,8.2vw,50px);line-height:1.0;
  letter-spacing:.2px;margin:8px 0 12px;color:var(--t3-paper);text-wrap:balance}
.vg-lead{margin:0 0 20px;font-size:15px;line-height:1.5;color:rgba(255,253,246,.9);max-width:46ch}
.vg-cta{margin-top:0;width:100%;min-height:56px;display:flex;align-items:center;justify-content:center;gap:8px;
  background:var(--t3-gold);color:var(--t3-ink);border:none;border-radius:16px;font-family:inherit;
  font-size:16.5px;font-weight:800;cursor:pointer;box-shadow:0 4px 16px rgba(232,168,0,.32)}
.vg-cta:hover{background:#FFD451}
.vg-cta:active{transform:translateY(1px)}
.vg-anchor{margin-top:10px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,253,246,.08);
  border:1px solid rgba(255,253,246,.28);border-radius:12px;color:#FFE08A;font-family:inherit;
  font-size:13.5px;font-weight:700;cursor:pointer;padding:10px 14px;min-height:40px;text-decoration:none}
.vg-anchor:hover{background:rgba(255,253,246,.16);color:#FFF3C4}
.vg-anchor.vg-inline{margin-top:0;padding:2px 0;min-height:24px;background:none;border:none;text-decoration:underline}
.vg-stats{display:grid;grid-template-columns:1fr;gap:8px;margin-top:20px}
.vg-stat{background:rgba(6,34,46,.5);border:1px solid var(--t3-line);border-radius:12px;padding:10px 12px}
.vg-stat b{display:block;font-family:var(--t3-display);font-weight:400;font-size:26px;line-height:1;color:var(--t3-paper)}
.vg-stat span{display:block;margin-top:4px;font-size:11.5px;line-height:1.3;color:rgba(255,253,246,.78)}

/* ---- sections ---- */
.vg-sec{margin-top:30px}
.vg-h2{font-family:var(--t3-display);font-weight:400;font-size:clamp(19px,5.2vw,24px);line-height:1.08;
  letter-spacing:.2px;margin:0 0 6px;color:var(--t3-paper);text-transform:uppercase}
.vg-sub{margin:0 0 16px;font-size:12.5px;line-height:1.5;color:rgba(255,253,246,.72)}

/* ---- Le choix du jour (carte avec photo réelle) ---- */
.vg-pick{background:var(--t3-paper);color:var(--t3-ink);border-radius:var(--t3-r-card);overflow:hidden;
  box-shadow:var(--t3-shadow-card)}
.vg-pick-media{position:relative;aspect-ratio:16/10;background:var(--t3-sea);overflow:hidden}
.vg-pick-media img{width:100%;height:100%;object-fit:cover;display:block}
.vg-pick-nophoto{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;font-weight:700;
  color:rgba(255,253,246,.7);background:linear-gradient(150deg,#0B2A38,#0E4A5A)}
.vg-badge{position:absolute;left:12px;top:12px;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;
  border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0D1117;
  box-shadow:0 2px 8px rgba(0,0,0,.28)}
.vg-pick-body{padding:16px 18px 18px}
.vg-pick-name{font-family:var(--t3-display);font-weight:400;font-size:clamp(21px,5.6vw,27px);line-height:1.05;
  margin:0;color:var(--t3-ink)}
.vg-pick-meta{margin:8px 0 0;font-size:13px;line-height:1.45;color:rgba(13,11,20,.72)}
.vg-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.vg-chip{padding:5px 10px;border-radius:999px;background:rgba(13,11,20,.07);font-size:11.5px;font-weight:700;
  color:rgba(13,11,20,.8)}
.vg-score{margin-top:14px;display:flex;align-items:center;gap:10px}
.vg-bar{flex:1;height:9px;border-radius:99px;background:rgba(13,11,20,.12);overflow:hidden}
.vg-bar>i{display:block;height:100%;border-radius:99px}
.vg-score b{font-size:13px;font-weight:800;color:var(--t3-ink);white-space:nowrap}
.vg-btn{margin-top:16px;width:100%;min-height:52px;border-radius:14px;border:none;background:var(--t3-sea);
  color:var(--t3-paper);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer}
.vg-btn:hover{background:#12606F}
.vg-btn:active{transform:translateY(1px)}

/* ---- Alternatives : grilles de cartes photo ---- */
.vg-alt{display:grid;gap:10px}
.vg-altcard{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:10px;border-radius:14px;
  border:1px solid var(--t3-line);background:rgba(6,34,46,.5);color:var(--t3-paper);cursor:pointer;
  font-family:inherit;min-height:74px}
.vg-altcard:hover{background:rgba(6,34,46,.75);border-color:rgba(255,253,246,.3)}
.vg-altcard img,.vg-altcard .ph{width:54px;height:54px;border-radius:10px;object-fit:cover;flex:0 0 auto;
  background:var(--t3-sea)}
.vg-altcard .ph{display:grid;place-items:center;font-size:10px;font-weight:800;color:rgba(255,253,246,.6)}
.vg-altcard .nm{display:block;font-size:14px;font-weight:800;color:var(--t3-paper);line-height:1.2}
.vg-altcard .sb{display:block;margin-top:3px;font-size:11.5px;font-weight:700;color:rgba(255,253,246,.72)}
.vg-altcard .dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;margin-left:auto}

/* ---- Niveaux de risque ---- */
.vg-risk{display:grid;gap:8px}
.vg-riskrow{display:flex;align-items:flex-start;gap:11px;padding:12px;border-radius:14px;
  border:1px solid var(--t3-line);background:rgba(6,34,46,.5)}
.vg-riskrow .dot{width:11px;height:11px;border-radius:50%;flex:0 0 auto;margin-top:4px}
.vg-riskrow .lb{display:block;font-size:13.5px;font-weight:800;color:var(--t3-paper)}
.vg-riskrow .df{display:block;margin-top:3px;font-size:12px;line-height:1.45;color:rgba(255,253,246,.76)}
.vg-riskrow .ct{margin-left:auto;flex:0 0 auto;font-size:12px;font-weight:800;color:#FFE08A;white-space:nowrap}

/* ---- Fraîcheur + limites (moat = honnêteté) ---- */
.vg-trust{border-radius:16px;border:1px solid var(--t3-line);background:rgba(6,34,46,.55);padding:16px}
.vg-trust dl{margin:0;display:grid;gap:14px}
.vg-trust dt{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#FFE08A}
.vg-trust dd{margin:3px 0 0;font-size:12.5px;line-height:1.5;color:rgba(255,253,246,.84)}
.vg-links{display:grid;gap:8px;margin-top:16px}
.vg-link{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;border-radius:14px;
  border:1px solid var(--t3-line);background:rgba(255,253,246,.06);color:var(--t3-paper);text-decoration:none;
  font-family:inherit;font-size:13.5px;font-weight:700;min-height:48px}
.vg-link:hover{background:rgba(255,253,246,.12);border-color:rgba(255,253,246,.3)}

/* ---- pied de page ---- */
.vg-foot{margin-top:30px;font-size:11px;line-height:1.5;color:rgba(255,253,246,.5);text-align:center}
.vg-root :focus-visible{outline:3px solid var(--t3-gold);outline-offset:2px;border-radius:8px}
.vg-root *:focus:not(:focus-visible){outline:none}

/* responsive */
@media (min-width:520px){.vg-stats{grid-template-columns:repeat(3,1fr)}}
@media (min-width:760px){
  .vg-wrap{max-width:820px}
  .vg-hero{margin:0;padding:calc(20px + env(safe-area-inset-top)) 24px 28px}
  .vg-hero .inner{max-width:820px;display:grid;grid-template-columns:1.15fr .85fr;gap:30px;align-items:end}
  .vg-alt{grid-template-columns:repeat(3,1fr)}
  .vg-links{grid-template-columns:repeat(2,1fr)}
}
@media (min-width:1080px){
  .vg-wrap{max-width:1000px}
  .vg-hero .inner{max-width:1000px;gap:38px}
}
@media (prefers-reduced-motion:reduce){
  .vg-cta,.vg-btn,.vg-link,.vg-altcard,.vg-topbtn,.vg-pill{transition:none}
  .vg-cta:active,.vg-btn:active{transform:none}
}

/* ECHAPPATOIRE skin de theme — .theme-comic button{background/color/border !important} repeignait TOUS
   les <button> en carte claire (texte invisible). html body .classe (0,1,2) + !important bat le skin. */
html body .vg-btn{background:var(--t3-sea)!important;color:var(--t3-paper)!important;
  -webkit-text-fill-color:var(--t3-paper)!important;border:none!important;box-shadow:none!important;
  border-radius:14px!important;text-shadow:none!important}
html body .vg-btn:hover{background:#12606F!important}
html body .vg-topbtn{background:rgba(255,253,246,.1)!important;color:var(--t3-paper)!important;
  -webkit-text-fill-color:var(--t3-paper)!important;border:1.5px solid var(--t3-line)!important;
  box-shadow:none!important;border-radius:999px!important;text-shadow:none!important}
html body .vg-topbtn:hover{background:rgba(255,253,246,.18)!important}
html body .vg-altcard{background:rgba(6,34,46,.5)!important;color:var(--t3-paper)!important;
  -webkit-text-fill-color:var(--t3-paper)!important;border:1px solid var(--t3-line)!important;
  box-shadow:none!important;border-radius:14px!important;text-shadow:none!important}
html body .vg-altcard:hover{background:rgba(6,34,46,.75)!important}
html body .vg-altcard .nm{color:var(--t3-paper)!important;-webkit-text-fill-color:var(--t3-paper)!important}
html body .vg-altcard .sb{color:rgba(255,253,246,.72)!important;-webkit-text-fill-color:rgba(255,253,246,.72)!important}
html body .vg-anchor{background:rgba(255,253,246,.08)!important;color:#FFE08A!important;
  -webkit-text-fill-color:#FFE08A!important;border:1px solid rgba(255,253,246,.28)!important;
  box-shadow:none!important;border-radius:12px!important;text-shadow:none!important}
html body .vg-anchor.vg-inline{background:none!important;border:none!important;border-radius:0!important;
  box-shadow:none!important;text-decoration:underline!important}`

export default function HomeVoyage(props){
  const {beach,lang="fr",sargData,pickBeaches=[],regionName,userPos,onOpen,onOpenBeach,onPremium,
         onShowMap,onCaptureEmail,track,exiting,isPremium=false,favorites=[],onToggleFav,onOpenPro,captureMode=false}=props
  const _t=useMemo(()=>mkT(lang),[lang])
  const rootRef=useRef(null)

  /* ---- données réelles : pool de plages réellement notées ---- */
  const pool=useMemo(()=>(pickBeaches||[]).filter(b=>b&&b.id&&b.status&&b.score!=null),[pickBeaches])
  const counts=useMemo(()=>({
    total:pool.length,
    clean:pool.filter(b=>b.status==="clean").length,
    moderate:pool.filter(b=>b.status==="moderate").length,
    avoid:pool.filter(b=>b.status==="avoid").length
  }),[pool])

  /* ---- classement : par proximité si la position est connue, sinon par score ---- */
  const ranked=useMemo(()=>{
    const hasPos=!!(userPos&&userPos.lat!=null&&userPos.lng!=null)
    const arr=pool.map(b=>({...b,_s:+b.score||0,
      _km:(hasPos&&b.lat!=null&&b.lng!=null)?kmBetween(userPos.lat,userPos.lng,b.lat,b.lng):null}))
    return arr.sort((a,b)=> (a._km!=null&&b._km!=null) ? (a._km-b._km||b._s-a._s) : b._s-a._s)
  },[pool,userPos])

  const top=useMemo(()=>[...ranked].sort((a,b)=>b._s-a._s).slice(0,3),[ranked])
  const alts=useMemo(()=>ranked.filter(b=>b.status==="clean").slice(0,3),[ranked])

  /* ---- fraîcheur : observation satellite UNIQUEMENT (jamais updatedAt) ---- */
  const freshLabel=useMemo(()=>{try{return lcDetailFreshnessLabel(sargData,lang)}catch(_){return null}},[sargData,lang])
  const ctx=useMemo(()=>freshnessCtx(sargData,lang),[sargData,lang])
  const fresh12=ctx.fresh
  const stale=ctx.stale

  /* ---- photo de la plage vedette (réelle, jamais une illustration inventée) ---- */
  const [heroSrc,setHeroSrc]=useState(()=>(beach&&beach._heroImg)?beach._heroImg:null)
  useEffect(()=>{
    let ok=true
    if(beach&&beach._heroImg){ setHeroSrc(beach._heroImg); return()=>{ok=false} }
    if(!beach||!beach.id){ setHeroSrc(null); return()=>{ok=false} }
    photoMap().then(m=>{ if(ok)setHeroSrc(resolveBeachPhoto(beach.id,m)) })
    return()=>{ok=false}
  },[beach])

  /* ---- photos des listes (même map, une seule requête) ---- */
  const [listSrc,setListSrc]=useState({})
  useEffect(()=>{
    let ok=true
    const want=[...top,...alts].filter(b=>b&&b.id&&!b._heroImg).map(b=>b.id)
    if(!want.length)return
    photoMap().then(m=>{ if(!ok)return
      const o={};want.forEach(id=>{o[id]=resolveBeachPhoto(id,m)});setListSrc(o) })
    return()=>{ok=false}
  },[top,alts])

  const dateLong=useMemo(()=>{try{
    return new Date().toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",
      {weekday:"long",day:"numeric",month:"long"})
  }catch(_){return""}},[lang])
  const year=useMemo(()=>{try{return new Date().getFullYear()}catch(_){return ""}},[])

  /* ---- tracking d'exposition (1× au mount) ---- */
  useEffect(()=>{ if(track)try{ track("sg_voyage_shown",{beach:beach?beach.id:null,score:beach?beach.score:null,
    status:beach?beach.status:null,total:counts.total,clean:counts.clean,variant:"voyage"}) }catch(_){} },[]) // eslint-disable-line

  /* ---- Escape referme l'accueil (retour carte) + focus initial ---- */
  useEffect(()=>{
    const k=e=>{ if(e.key==="Escape"){ e.stopPropagation(); try{onShowMap&&onShowMap()}catch(_){} } }
    window.addEventListener("keydown",k)
    return()=>window.removeEventListener("keydown",k)
  },[onShowMap])
  useEffect(()=>{ try{ rootRef.current&&rootRef.current.focus() }catch(_){} },[])

  const scrollToPick=useCallback(()=>{
    if(track)try{track("sg_voyage_pick_scroll",{})}catch(_){}
    try{ const el=rootRef.current&&rootRef.current.querySelector("#vg-pick")
      if(el&&el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"start"}) }catch(_){}
  },[track])

  const openCta=useCallback(()=>{
    if(track)try{track("sg_voyage_find",{source:"hero_cta"})}catch(_){}
    try{ onShowMap&&onShowMap() }catch(_){}
  },[onShowMap,track])

  const openBeach=useCallback((b,src)=>{
    if(!b)return
    if(track)try{track("sg_beach_open",{beach_id:b.id,status:b.status,source:src||"voyage"})}catch(_){}
    try{ onOpenBeach&&onOpenBeach(b) }catch(_){}
  },[onOpenBeach,track])

  const pill=stale?"bad":(fresh12?"ok":"warn")
  const pillTxt=stale
    ? _t({fr:"Mesure en retard",en:"Reading delayed",es:"Medición atrasada"})
    : fresh12? _t({fr:"Satellite à jour",en:"Satellite current",es:"Satélite al día"})
    : _t({fr:"Vérification",en:"Verifying",es:"Verificando"})

  const pick=beach||top[0]||null
  const pickSrc=heroSrc||(pick&&pick._heroImg)||(pick?listSrc[pick.id]:null)||null
  const altForPick=ctx.fresh&&(pick&&pick.status!=="clean")?(alts.find(a=>a.id!==pick.id)||null):null
  const distTxt=b=> (b&&b._km!=null)
    ? (lang==="en" ? " · "+Math.max(1,Math.round(b._km*0.621))+" mi" : " · "+Math.max(1,Math.round(b._km))+" km")
    : ""

  return (
    <div ref={rootRef} className="vg-root" role="dialog" aria-modal="true" tabIndex={-1}
      aria-label={_t({fr:"Accueil Sargagame",en:"Sargagame home",es:"Inicio Sargagame"})}
      style={{opacity:exiting?0:1,transform:exiting?"scale(1.03)":"none",
        transition:"opacity .28s ease, transform .34s ease"}}>
      <style>{VG_CSS}</style>

      {/* ---- barre haute : fraîcheur réelle + retour carte ---- */}
      <div className="vg-top">
        <span className="vg-mark">{regionName||_t({fr:"Sargagame",en:"Sargagame",es:"Sargagame"})}</span>
        <span className={"vg-pill "+pill} aria-live="polite">{pillTxt}</span>
        <button type="button" className="vg-topbtn" onClick={openCta}>
          {_t({fr:"Carte",en:"Map",es:"Mapa"})}
        </button>
      </div>

      <div className="vg-hero">
        <div className="inner">
          <p className="vg-date">{dateLong}</p>
          <h2 className="vg-title">{_t({fr:"Quelle plage aujourd'hui ?",en:"Which beach today?",es:"¿Qué playa hoy?"})}</h2>
          <p className="vg-lead">{ctx.fresh?_t({
            fr:"Sargasses, houle, vent, soleil et température de l'eau, plage par plage. Le verdict du jour vient de la mesure satellite — et on te dit où aller si ta plage est touchée.",
            en:"Sargassum, swell, wind, sun and water temperature, beach by beach. Today's verdict comes from the satellite reading — and we tell you where to go if your beach is hit.",
            es:"Sargazo, oleaje, viento, sol y temperatura del agua, playa por playa. El veredicto del día viene de la medición satelital — y te decimos a dónde ir si tu playa está afectada."}):_t({
            fr:"Les données proviennent d'une mesure satellite. Le verdict reflète la dernière observation disponible — vérifiez sa fraîcheur ci-dessus.",
            en:"Data comes from a satellite reading. The verdict reflects the latest available observation — check its freshness above.",
            es:"Los datos provienen de una medición satelital. El veredicto refleja la última observación disponible — comprueba su frescura más arriba."})}</p>

          <button type="button" className="vg-cta" onClick={openCta}>
            {_t({fr:"Trouve ta plage",en:"Find my beach",es:"Encuentra tu playa"})}
          </button>
          <button type="button" className="vg-anchor" onClick={scrollToPick}>
            {_t({fr:"Voir le choix du jour",en:"See today's pick",es:"Ver la elección del día"})} →
          </button>

          {/* ---- compteurs RÉELS (aucun chiffre inventé) ---- */}
          <div className="vg-stats">
            <div className="vg-stat"><b>{counts.total}</b><span>{_t({fr:"plages notées",en:"beaches scored",es:"playas puntuadas"})}</span></div>
            <div className="vg-stat"><b>{counts.clean}</b><span>{cleanLabel(lang,ctx)}</span></div>
            <div className="vg-stat"><b>{counts.avoid}</b><span>{avoidLabel(lang,ctx)}</span></div>
          </div>
        </div>
      </div>

      <div className="vg-wrap">

        {/* ---- LE CHOIX DU JOUR ---- */}
        {pick&&(
          <section className="vg-sec" id="vg-pick" aria-labelledby="vg-pick-h">
            <h3 className="vg-h2" id="vg-pick-h">{_t({fr:"Le choix du jour",en:"Today's pick",es:"La elección del día"})}</h3>
            <p className="vg-sub">{_t({
              fr:"La meilleure plage notée de la région, toutes mesures confondues.",
              en:"The region's top-scoring beach across every measure.",
              es:"La playa mejor puntuada de la región en todas las medidas."})}</p>
            <article className="vg-pick">
              <div className="vg-pick-media">
                {pickSrc
                  ? <img src={pickSrc} alt={pick.name||""} loading="lazy" decoding="async" width="800" height="500"/>
                  : <div className="vg-pick-nophoto">{_t({fr:"Photo à venir",en:"Photo coming",es:"Foto pendiente"})}</div>}
                <span className="vg-badge" style={{background:V_COL[pick.status]||V_COL.clean}}>
                  {verdictTxt(pick,lang,ctx)}
                </span>
              </div>
              <div className="vg-pick-body">
                <h4 className="vg-pick-name">{pick.name}</h4>
                <p className="vg-pick-meta">
                  {statusShort(pick,lang)}
                  {pick.commune? " · "+pick.commune : ""}
                  {distTxt(pick)}
                </p>
                {traits(pick,lang).length>0&&(
                  <div className="vg-chips">
                    {traits(pick,lang).map((t,i)=><span className="vg-chip" key={i}>{t}</span>)}
                  </div>
                )}
                <div className="vg-score">
                  <span className="vg-bar"><i style={{width:Math.max(4,Math.min(100,+pick.score||0))+"%",background:V_COL[pick.status]||V_COL.clean}}/></span>
                  <b>{Math.round(pick.score||0)}/100</b>
                </div>
                {freshLabel&&<p className="vg-pick-meta" style={{marginTop:10}}>{freshLabel}</p>}
                {altForPick&&(
                  <p className="vg-pick-meta" style={{marginTop:8}}>
                    {_t({fr:"Alternative plus sûre :",en:"Safer alternative:",es:"Alternativa más segura:"})}{" "}
                    <button type="button" className="vg-anchor vg-inline"
                      onClick={()=>openBeach(altForPick,"voyage_alt_pick")}>{altForPick.name} →</button>
                  </p>
                )}
                <button type="button" className="vg-btn" onClick={()=>openBeach(pick,"voyage_pick")}>
                  {_t({fr:"Ouvrir la fiche plage",en:"Open the beach sheet",es:"Abrir la ficha de playa"})}
                </button>
              </div>
            </article>
          </section>
        )}

        {/* ---- ALTERNATIVES : la vraie réponse à « où aller » ---- */}
        {alts.length>0&&(
          <section className="vg-sec" aria-labelledby="vg-alt-h">
            <h3 className="vg-h2" id="vg-alt-h">{_t({fr:"Où aller aujourd'hui",en:"Where to go today",es:"A dónde ir hoy"})}</h3>
            <p className="vg-sub">{_t({
              fr:"Les plages sans sargasse, classées selon ce qui est le plus utile pour toi.",
              en:"The sargassum-free beaches, ordered by what is most useful to you.",
              es:"Las playas sin sargazo, ordenadas según lo más útil para ti."})}</p>
            <div className="vg-alt">
              {alts.map(b=>{
                const src=b._heroImg||listSrc[b.id]||null
                return (
                  <button type="button" className="vg-altcard" key={b.id} onClick={()=>openBeach(b,"voyage_alt")}>
                    {src? <img src={src} alt="" loading="lazy" decoding="async"/> : <span className="ph">—</span>}
                    <span>
                      <span className="nm">{b.name}</span>
                      <span className="sb">{Math.round(b.score||0)}/100{distTxt(b)}</span>
                    </span>
                    <span className="dot" style={{background:V_COL[b.status]||V_COL.clean}} aria-hidden="true"/>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ---- NIVEAUX DE RISQUE : légende honnête ---- */}
        <section className="vg-sec" aria-labelledby="vg-risk-h">
          <h3 className="vg-h2" id="vg-risk-h">{_t({fr:"Comment lire le risque",en:"How to read the risk",es:"Cómo leer el riesgo"})}</h3>
          <p className="vg-sub">{ctx.unknown?_t({fr:"Trois niveaux — donnée satellite indisponible.",en:"Three levels — satellite data unavailable.",es:"Tres niveles — datos satelitales no disponibles."}):ctx.fresh?_t({fr:"Trois niveaux, décomptés sur les plages réellement notées aujourd'hui.",en:"Three levels, counted across the beaches actually scored today.",es:"Tres niveles, contados sobre las playas realmente puntuadas hoy."}):_t({fr:"Trois niveaux, décomptés sur les plages notées d'après la dernière mesure satellite.",en:"Three levels, counted across the beaches scored from the latest satellite reading.",es:"Tres niveles, contados sobre las playas puntuadas según la última medición satelital."})}</p>
          <div className="vg-risk">
            <div className="vg-riskrow">
              <span className="dot" style={{background:V_COL.clean}} aria-hidden="true"/>
              <span>
                <span className="lb">{_t({fr:"Propre",en:"Clean",es:"Limpia"})}</span>
                <span className="df">{_t({fr:"Aucun banc de sargasse détecté au large par la dernière mesure satellite.",en:"No sargassum mat detected offshore in the latest satellite reading.",es:"Ningún banco de sargazo detectado mar adentro en la última medición satelital."})}</span>
              </span>
              <span className="ct">{counts.clean}</span>
            </div>
            <div className="vg-riskrow">
              <span className="dot" style={{background:V_COL.moderate}} aria-hidden="true"/>
              <span>
                <span className="lb">{_t({fr:"Modéré",en:"Moderate",es:"Moderada"})}</span>
                <span className="df">{_t({fr:"Présence mesurée ou en approche : la baignade reste possible, l'état peut changer dans la journée.",en:"Sargassum measured or approaching: swimming stays possible, conditions can change within the day.",es:"Sargazo medido o en aproximación: el baño sigue siendo posible, las condiciones pueden cambiar en el día."})}</span>
              </span>
              <span className="ct">{counts.moderate}</span>
            </div>
            <div className="vg-riskrow">
              <span className="dot" style={{background:V_COL.avoid}} aria-hidden="true"/>
              <span>
                <span className="lb">{_t({fr:"À éviter",en:"Avoid",es:"Evitar"})}</span>
                <span className="df">{_t({fr:"Banc mesuré sur la plage : choisis d'abord une alternative propre.",en:"A mat measured on the beach: pick a clean alternative first.",es:"Banco medido en la playa: elige primero una alternativa limpia."})}</span>
              </span>
              <span className="ct">{counts.avoid}</span>
            </div>
          </div>
        </section>

        {/* ---- FRAÎCHEUR + LIMITES : le moat, on le dit ---- */}
        <section className="vg-sec" aria-labelledby="vg-trust-h">
          <h3 className="vg-h2" id="vg-trust-h">{_t({fr:"D'où vient ce verdict",en:"Where this verdict comes from",es:"De dónde sale este veredicto"})}</h3>
          <div className="vg-trust">
            <dl>
              <div>
                <dt>{_t({fr:"Fraîcheur réelle",en:"Real freshness",es:"Frescura real"})}</dt>
                <dd>
                  {freshLabel||_t({fr:"Vérification en cours — aucun âge annoncé sans preuve.",en:"Verification in progress — no age claimed without proof.",es:"Verificación en curso — no se anuncia edad sin prueba."})}
                  {ageH!=null&&ageH>=36&&<strong style={{color:"#FFA78F"}}>{" · "+_t({fr:"mesure ancienne : à confirmer sur place.",en:"old reading: confirm on site.",es:"lectura antigua: confírmalo en el lugar."})}</strong>}
                </dd>
              </div>
              <div>
                <dt>{_t({fr:"Source",en:"Source",es:"Fuente"})}</dt>
                <dd>{_t({fr:"Satellite Copernicus Marine (indice AFAI), combiné à la houle, au vent, au soleil et à la température de l'eau. Score 0-100 mis à jour 4 fois par jour.",en:"Copernicus Marine satellite (AFAI index), combined with swell, wind, sun and water temperature. 0-100 score updated 4 times a day.",es:"Satélite Copernicus Marine (índice AFAI), combinado con oleaje, viento, sol y temperatura del agua. Puntuación 0-100 actualizada 4 veces al día."})}</dd>
              </div>
              <div>
                <dt>{_t({fr:"Ce que ça ne dit pas",en:"What it does not tell you",es:"Lo que no dice"})}</dt>
                <dd>{_t({fr:"Entre deux passages satellite, une plage peut se couvrir ou se nettoyer. Le verdict est une indication mesurée, pas une certification : vérifie sur place avant de partir loin.",en:"Between two satellite passes a beach can get covered or clear up. The verdict is a measured indication, not a certification: check on site before travelling far.",es:"Entre dos pasadas del satélite una playa puede cubrirse o limpiarse. El veredicto es una indicación medida, no una certificación: compruébalo en el lugar antes de ir lejos."})}</dd>
              </div>
            </dl>
            <div className="vg-links">
              <a className="vg-link" href={lang==="en"?"/reliability/":lang==="es"?"/fiabilidad/":"/fiabilite/"}>
                {_t({fr:"Notre fiabilité mesurée",en:"Our measured reliability",es:"Nuestra fiabilidad medida"})} <span aria-hidden="true">→</span>
              </a>
              <a className="vg-link" href="/carte-sargasses/">
                {_t({fr:"Carte des sargasses",en:"Sargassum map",es:"Mapa de sargazo"})} <span aria-hidden="true">→</span>
              </a>
              <a className="vg-link" href="/previsions/">
                {_t({fr:"Prévisions 7 jours",en:"7-day forecast",es:"Previsión 7 días"})} <span aria-hidden="true">→</span>
              </a>
              <a className="vg-link" href="/alertes/">
                {_t({fr:"Alertes push gratuites",en:"Free push alerts",es:"Alertas push gratuitas"})} <span aria-hidden="true">→</span>
              </a>
              <a className="vg-link" href="/plages-sans-sargasses/">
                {_t({fr:"Plages sans sargasses",en:"Sargassum-free beaches",es:"Playas sin sargazo"})} <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        <p className="vg-foot">
          {regionName? regionName+" · " : ""}{_t({fr:"Données satellite Copernicus Marine",en:"Copernicus Marine satellite data",es:"Datos satelitales Copernicus Marine"})}{year?" · "+year:""}
        </p>
      </div>
    </div>
  )
}
