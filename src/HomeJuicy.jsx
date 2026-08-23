import React,{useState,useEffect,useRef,useMemo,useCallback} from "react"

/* ============================================================
   HOME JUICY — "Le tampon qui claque" (bras A/B `home_juicy`)
   Port fidèle de design/proto-home-veilleur.html (jury home-page-juicy-hero,
   2026-07-03, gagnant). Le verdict HONNÊTE = un tampon BD qui CLAQUE
   (squash-&-stretch au mount + re-squish au tap), TOUJOURS au-dessus de
   l'ambiance golden-hour SVG (illustration, jamais lue comme mesure).
   Grille "Le Veilleur veille chaque crique" = reveal staggéré sur de
   VRAIES plages (statuts/scores réels, pas d'archétype inventé).

   100 % DATA-DRIVEN : verdict/score/fraîcheur/AFAI viennent de `beach` +
   `sargData` ; la grille vient de `pickBeaches` (vraies plages triées).
   0 fabrication. Additif : control = HeroVerdict/GameFunnel/HomeAZ/Chasse,
   intacts. Override debug ?home=1 (prioritaire), rollback implicite
   (retirer le paramètre). Lazy chunk, hors budget eager.

   Pattern repris de BriefMatin.jsx (plain React + CSS scopée par préfixe,
   pas de Shadow DOM) : plus simple/sûr qu'un moteur impératif pour une
   scène majoritairement statique. reduced-motion = plancher dur.
   ============================================================ */

const VCOL={clean:"#22C55E",moderate:"#B87A00",avoid:"#E8522A"}

const STR={
  fr:{live:"EN DIRECT",map:"Voir la carte",
      kicker:"Ton équipe qui ne dort jamais",h2:"Le Veilleur veille chaque crique",
      sub:"Pendant que tu dors, il lit la mer plage par plage. Voici ta côte, ce matin.",
      verd:{clean:["Propre","aujourd'hui"],moderate:["Modéré","aujourd'hui"],avoid:["À éviter","aujourd'hui"]},
      pill:{clean:"PROPRE",moderate:"MODÉRÉ",avoid:"ÉVITE"},
      say:"La mesure de ce matin — pas une supposition. Demain, Le Veilleur regarde pour toi.",
      cta:"Deviens celui qui connaît la fin de l'histoire",
      ctaSub:"Pass — paiement unique, dès 7,99 €",
      beat1:n=>["Tu regardes ",n,". Demain, le vent peut tourner — et personne ne te préviendra."],
      beat2:"Sauf lui. Chaque matin, le verdict de ta plage, gratuit — et les criques propres les plus proches.",
      beat3:"Personne n'aime découvrir les algues une fois la serviette posée.",
      beat4:"Deviens le copain qui ne se trompe jamais de crique.",
      honest:"Mesuré au satellite, pas deviné. On se trompe parfois — ",honestLink:"va voir ce qu'on vaut vraiment →",
      offerBig:"Une plage. Un verdict. Zéro mauvaise surprise.",
      offerCta:"Commencer maintenant",sig:"« il regarde la mer, jamais vos clients »",
      measured:h=>"MESURÉ "+h+" UTC",afai:v=>"AFAI "+v},
  en:{live:"LIVE",map:"See the map",
      kicker:"Your team that never sleeps",h2:"The Watchman watches every cove",
      sub:"While you sleep, he reads the sea beach by beach. Here's your coast, this morning.",
      verd:{clean:["Clean","today"],moderate:["Moderate","today"],avoid:["Avoid","today"]},
      pill:{clean:"CLEAN",moderate:"MODERATE",avoid:"AVOID"},
      say:"This morning's reading — not a guess. Tomorrow, the Watchman looks out for you.",
      cta:"Become the one who knows how the story ends",
      ctaSub:"One-time Pass, from $5.99",
      beat1:n=>["You're checking ",n,". Tomorrow the wind can turn — and no one will warn you."],
      beat2:"Except him. Every morning, your beach's verdict, free — plus the nearest clean coves.",
      beat3:"Nobody likes finding the sargassum after the towel's down.",
      beat4:"Become the friend who never picks the wrong cove.",
      honest:"Measured by satellite, not guessed. We're sometimes wrong — ",honestLink:"see what we're really worth →",
      offerBig:"One beach. One verdict. Zero bad surprises.",
      offerCta:"Get started now",sig:"“he watches the sea, never your guests”",
      measured:h=>"MEASURED "+h+" UTC",afai:v=>"AFAI "+v},
  es:{live:"EN DIRECTO",map:"Ver el mapa",
      kicker:"Tu equipo que nunca duerme",h2:"El Vigía vigila cada cala",
      sub:"Mientras duermes, él lee el mar playa por playa. Aquí tu costa, esta mañana.",
      verd:{clean:["Limpia","hoy"],moderate:["Moderada","hoy"],avoid:["Evitar","hoy"]},
      pill:{clean:"LIMPIA",moderate:"MODERADA",avoid:"EVITAR"},
      say:"La medición de esta mañana — no una suposición. Mañana, el Vigía mira por ti.",
      cta:"Conviértete en quien conoce el final de la historia",
      ctaSub:"Pass único, desde $5.99",
      beat1:n=>["Estás mirando ",n,". Mañana el viento puede cambiar — y nadie te avisará."],
      beat2:"Excepto él. Cada mañana, el veredicto de tu playa, gratis — y las calas limpias más cercanas.",
      beat3:"A nadie le gusta descubrir el sargazo con la toalla ya puesta.",
      beat4:"Conviértete en quien nunca se equivoca de cala.",
      honest:"Medido por satélite, no adivinado. A veces nos equivocamos — ",honestLink:"mira lo que realmente valemos →",
      offerBig:"Una playa. Un veredicto. Cero malas sorpresas.",
      offerCta:"Empezar ahora",sig:"«mira el mar, nunca a tus clientes»",
      measured:h=>"MEDIDO "+h+" UTC",afai:v=>"AFAI "+v}
}

function clockUTC(ts){
  try{
    const d=new Date(ts)
    if(!isFinite(d.getTime()))return null
    const h=String(d.getUTCHours()).padStart(2,"0"),m=String(d.getUTCMinutes()).padStart(2,"0")
    return h+":"+m
  }catch(_){return null}
}

/* mascotte "Le Veilleur" — même marque simple que les autres protos (regarde la mer) */
function VeilleurMark({size=44}){
  return(
    <svg width={size} height={size} viewBox="-52 -30 104 84" aria-hidden="true">
      <rect x="-46" y="-14" width="26" height="28" rx="5" fill="#E8A800" stroke="#0D0D0D" strokeWidth="3"/>
      <rect x="20" y="-14" width="26" height="28" rx="5" fill="#E8A800" stroke="#0D0D0D" strokeWidth="3"/>
      <rect x="-18" y="-22" width="36" height="44" rx="9" fill="#FFC72C" stroke="#0D0D0D" strokeWidth="3.5"/>
      <circle cx="0" cy="4" r="11" fill="#0d1117"/><circle cx="3" cy="7" r="4.4" fill="#1EC8B0"/>
      <path d="M0 22 L-8 40 L8 40 Z" fill="#009E8E" opacity=".5"/>
    </svg>
  )
}

/* carte grille — statut+score RÉELS, ambiance golden-hour générique (pas d'archétype inventé) */
function GridCard({b,lang,idx,onOpen,revealRef}){
  const L=STR[lang]||STR.fr
  const grad=b.status==="clean"?["#123047","#C97E3A"]:b.status==="moderate"?["#0B2230","#6a4a2a"]:["#141026","#B85A2A"]
  const gid="hj-cg"+idx
  return(
    <div ref={revealRef} className="hj-card" role="button" tabIndex={0}
      onClick={onOpen} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpen()}}}>
      <svg viewBox="0 0 400 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={grad[0]}/><stop offset="1" stopColor={grad[1]}/>
        </linearGradient></defs>
        <rect width="400" height="96" fill={"url(#"+gid+")"}/>
        <circle cx="210" cy="54" r="30" fill="#FFD884" opacity=".85"/>
        <rect y="62" width="400" height="30" fill="#0e3a35"/>
        <path d="M0 78 Q200 70 400 78 L400 90 L0 90 Z" fill="#1C1712"/>
      </svg>
      <div className="hj-lab">
        <span className="hj-nm">{b.name}</span>
        <span className={"hj-pill hj-pill-"+b.status}>{L.pill[b.status]||"—"}</span>
      </div>
    </div>
  )
}

export default function HomeJuicy(props){
  const{beach,lang="fr",sargData,pickBeaches,onOpen,onOpenBeach,onPremium,onShowMap,track,exiting}=props
  const L=STR[lang]||STR.fr
  const reduce=useMemo(()=>{try{return matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){return false}},[])
  const st=(beach&&(beach.status==="moderate"||beach.status==="avoid"))?beach.status:"clean"
  const color=VCOL[st]

  const stampRef=useRef(null)
  const cardRefs=useRef([])
  const emit=useCallback((ev,p)=>{try{track&&track(ev,p||{})}catch(_){}},[track])

  /* tampon : CLAC au mount (respecte reduced-motion) */
  useEffect(()=>{
    const el=stampRef.current;if(!el||reduce)return
    el.classList.add("hj-land")
    const onEnd=()=>el.classList.remove("hj-land")
    el.addEventListener("animationend",onEnd)
    return()=>el.removeEventListener("animationend",onEnd)
  },[reduce])
  const squish=useCallback(()=>{
    const el=stampRef.current;if(!el||reduce)return
    el.classList.remove("hj-squish");void el.offsetWidth;el.classList.add("hj-squish")
  },[reduce])

  /* grille : diversité réelle (clean/moderate/avoid), 4 max, jamais la plage héro */
  const grid=useMemo(()=>{
    const pool=(pickBeaches||[]).filter(b=>b&&(!beach||b.id!==beach.id))
    const buckets={clean:[],moderate:[],avoid:[]}
    for(const b of pool){if(buckets[b.status])buckets[b.status].push(b)}
    const picked=[],seen=new Set()
    const takeFrom=(arr,n)=>{for(const b of arr){if(picked.length>=4)break;if(seen.has(b.id))continue;seen.add(b.id);picked.push(b);if(--n<=0)break}}
    takeFrom(buckets.clean,2);takeFrom(buckets.moderate,1);takeFrom(buckets.avoid,1)
    if(picked.length<4)takeFrom(pool,4-picked.length)
    return picked
  },[pickBeaches,beach])

  /* reveal staggéré (IntersectionObserver) — reduced-motion = tout visible d'emblée */
  useEffect(()=>{
    const els=cardRefs.current.filter(Boolean)
    if(!els.length)return
    if(reduce){els.forEach(el=>el.classList.add("hj-in"));return}
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          const i=els.indexOf(e.target)
          e.target.style.transitionDelay=(Math.max(0,i)*70)+"ms"
          e.target.classList.add("hj-in")
          io.unobserve(e.target)
        }
      })
    },{rootMargin:"0px 0px -8% 0px"})
    els.forEach(el=>io.observe(el))
    return()=>io.disconnect()
  },[grid,reduce])

  useEffect(()=>{emit("sg_hero_shown",{beach:beach&&beach.name,score:beach&&beach.score,status:st,variant:"home_juicy"})},[]) // eslint-disable-line

  const measuredAt=(sargData&&(sargData.erddapTimestamp||sargData.updatedAt))||null
  const clock=measuredAt?clockUTC(measuredAt):null
  const afai=(beach&&typeof beach.afai==="number")?beach.afai.toFixed(2):null
  const beachName=(beach&&beach.name)||"—"
  const score=(beach&&beach.score!=null)?Math.round(beach.score):null

  const onCta=(src)=>{emit("sg_home_juicy_cta",{source:src,beach:beach&&beach.id,status:st});onPremium&&onPremium(src)}
  const onOpenHero=()=>{emit("sg_home_juicy_tap",{el:"stamp"});onOpen&&onOpen()}
  const onCard=(b)=>{emit("sg_home_juicy_tap",{el:"grid_card",beach:b.id,status:b.status});onOpenBeach&&onOpenBeach(b)}
  const onMap=()=>{emit("sg_home_juicy_tap",{el:"map"});onShowMap&&onShowMap()}

  const beat1=L.beat1(beachName)

  return(
    <div className="sg-onink-scope hj-root" data-sg-live="1" role="dialog" aria-label={beachName}
      style={{position:"fixed",inset:0,zIndex:1050,overflowY:"auto",overflowX:"hidden",
        forcedColorAdjust:"none",background:"#FDFCF7",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",
        opacity:exiting?0:1,transform:exiting?"scale(1.04)":"none",
        transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}}>
      <style>{HJ_CSS}</style>

      <section className="hj-hero">
        <svg className="hj-scene" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="hjSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0B2230"/><stop offset=".42" stopColor="#155A5A"/>
              <stop offset=".72" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/>
            </linearGradient>
            <linearGradient id="hjSea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/>
            </linearGradient>
            <radialGradient id="hjSun" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#FFF3CE"/><stop offset=".5" stopColor="#FFD884"/>
              <stop offset="1" stopColor="#FFD884" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <rect width="800" height="600" fill="url(#hjSky)"/>
          <circle cx="410" cy="250" r="150" fill="url(#hjSun)"/>
          <circle cx="410" cy="292" r="46" fill="#FFF1C4"/>
          <rect y="316" width="800" height="200" fill="url(#hjSea)"/>
          <path d="M0 452 Q120 436 240 448 Q360 460 470 446 L500 486 Q300 498 120 492 Q50 490 0 496 Z" fill="#3a3f22" opacity=".9"/>
          <path d="M0 470 Q140 458 280 470 Q380 478 480 468 L480 520 L0 520 Z" fill="#2c3019" opacity=".92"/>
          <rect y="500" width="800" height="100" fill="#1C1712"/>
          <path d="M0 500 Q200 490 400 500 T800 500 L800 508 L0 508 Z" fill="#FFD884" opacity=".3"/>
          <g transform="translate(600 138)">
            <rect x="-46" y="-14" width="26" height="28" rx="5" fill="#E8A800" stroke="#0D0D0D" strokeWidth="3"/>
            <rect x="20" y="-14" width="26" height="28" rx="5" fill="#E8A800" stroke="#0D0D0D" strokeWidth="3"/>
            <rect x="-18" y="-22" width="36" height="44" rx="9" fill="#FFC72C" stroke="#0D0D0D" strokeWidth="3.5"/>
            <circle cx="0" cy="4" r="11" fill="#0d1117"/><circle cx="3" cy="7" r="4.4" fill="#1EC8B0"/>
            <path d="M0 22 L-8 40 L8 40 Z" fill="#009E8E" opacity=".5"/>
          </g>
        </svg>

        <span className="hj-chip hj-chip-live"><span className="hj-dot"/>{L.live}{clock?(" · "+clock):""}</span>
        <button type="button" className="hj-chip hj-chip-map hj-chip-map" onClick={onMap}>{L.map} →</button>

        <div ref={stampRef} className={"hj-stamp hj-stamp-"+st} role="button" tabIndex={0}
          aria-label={L.verd[st].join(" ")}
          onPointerDown={squish}
          onClick={onOpenHero}
          onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();squish();onOpenHero()}}}>
          <div className="hj-verdict" style={{color}}>{L.verd[st][0]}<br/>{L.verd[st][1]}</div>
          <div className="hj-beach"><b>{beachName}</b>{score!=null?(" · score "+score+"/100"):""}</div>
        </div>

        <div className="hj-proof">
          <div className="hj-src">{clock?L.measured(clock):"—"}{afai?(" · "+L.afai(afai)):""}</div>
          <p className="hj-say">{L.say}</p>
          <button type="button" className="hj-cta hj-cta" onClick={()=>onCta("home_juicy_stamp")}>
            {L.cta}<small>{L.ctaSub}</small>
          </button>
        </div>
      </section>

      {grid.length>0&&(
        <section className="hj-gridsec">
          <div className="hj-kicker">{L.kicker}</div>
          {/* div role=heading, PAS <h2> : le skin .theme-comic force `.sg-onink-scope h2{color:#fff!important}`
              (pensé pour les surfaces sombres plein-écran) — invisible sur notre section papier claire. */}
          <div className="hj-h2" role="heading" aria-level="2">{L.h2}</div>
          <p className="hj-sub">{L.sub}</p>
          <div className="hj-grid">
            {grid.map((b,i)=>(
              <GridCard key={b.id} b={b} lang={lang} idx={i}
                onOpen={()=>onCard(b)}
                revealRef={el=>{cardRefs.current[i]=el}}/>
            ))}
          </div>
        </section>
      )}

      <section className="hj-story">
        <div className="hj-beat"><div className="hj-n">1</div><p>{beat1[0]}<b>{beat1[1]}</b>{beat1[2]}</p></div>
        <div className="hj-beat"><div className="hj-n">2</div><p>{L.beat2}</p></div>
        <div className="hj-beat"><div className="hj-n">3</div><p>{L.beat3}</p></div>
        <div className="hj-beat"><div className="hj-n">4</div><p><b>{L.beat4}</b></p></div>
        <p className="hj-honest">{L.honest}<a href="#" onClick={e=>{e.preventDefault();emit("sg_home_juicy_reliability",{});props.onReliability&&props.onReliability()}}>{L.honestLink}</a></p>
      </section>

      <section className="hj-offer">
        <div className="hj-veilmark"><VeilleurMark size={40}/></div>
        <div className="hj-big">{L.offerBig}</div>
        <div className="hj-price">{L.ctaSub}</div>
        <button type="button" className="hj-cta hj-cta" style={{marginTop:14}} onClick={()=>onCta("home_juicy_offer")}>{L.offerCta}</button>
        <div className="hj-sig">{L.sig}</div>
      </section>
    </div>
  )
}

/* ============================================================
   CSS scopée .hj-* — racine .sg-onink-scope : le skin .theme-comic
   forcerait les <button> → boutons re-spécifiés .hj-root button.hj-cta.hj-cta
   / .hj-chip-map.hj-chip-map (spécificité 0,3,x) + !important pour battre
   .theme-comic .sg-onink-scope button{…!important} (0,2,1). Palette en
   DUR (jamais var(--sg-*) — tokens comic inertes sous ce thème).
   ============================================================ */
const HJ_CSS=`
.hj-root{font-family:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0D0D0D;-webkit-font-smoothing:antialiased}
.hj-hero{position:relative;min-height:min(86vh,720px);overflow:hidden;border-bottom:3px solid #0D0D0D}
.hj-scene{position:absolute;inset:0;width:100%;height:100%;display:block}
.hj-chip{position:absolute;z-index:6;display:inline-flex;align-items:center;gap:6px;
  font:800 12px/1 "Bricolage Grotesque",sans-serif;letter-spacing:.02em;color:#0D0D0D;background:#FFE47A;
  border:2px solid #0D0D0D;border-radius:999px;padding:7px 11px;box-shadow:2px 2px 0 #0D0D0D;min-height:34px}
.hj-chip-live{top:14px;left:14px;background:#0d1117;color:#FFE47A;border-color:#0d1117}
.hj-dot{width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 3px rgba(34,197,94,.3);display:inline-block}
.hj-root button.hj-chip-map.hj-chip-map{top:14px;right:14px;cursor:pointer;color:#0D0D0D!important;background:#FFE47A!important;border:2px solid #0D0D0D!important;border-radius:999px!important;box-shadow:2px 2px 0 #0D0D0D!important}
.hj-chip:active,.hj-root button.hj-chip-map.hj-chip-map:active{transform:scale(.96)}

.hj-stamp{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%) rotate(-3.5deg);
  z-index:5;text-align:center;transform-origin:center bottom;cursor:pointer;
  background:#FDFCF7;border:3px solid #0D0D0D;border-radius:14px;padding:14px 22px 12px;
  box-shadow:5px 6px 0 #0D0D0D;will-change:transform}
.hj-verdict{font:400 clamp(30px,10vw,52px)/.9 Anton,Impact,Haettenschweiler,"Arial Narrow",system-ui,sans-serif;letter-spacing:.01em;text-transform:uppercase}
.hj-beach{margin-top:8px;font:700 13px/1.2 "JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;color:#0D0D0D}
.hj-beach b{color:#111;background:#FFE47A;padding:1px 6px;border-radius:5px}
.hj-stamp.hj-land{animation:hj-tampon-land .72s cubic-bezier(.22,1.4,.36,1) both}
.hj-stamp.hj-squish{animation:hj-tampon-squish .38s cubic-bezier(.22,1.4,.36,1)}
@keyframes hj-tampon-land{
  0%{transform:translate(-50%,-140%) rotate(-3.5deg) scale(.6);opacity:0}
  60%{transform:translate(-50%,-50%) rotate(-3.5deg) scale(1.14,.82);opacity:1}
  78%{transform:translate(-50%,-50%) rotate(-3.5deg) scale(.94,1.08)}
  100%{transform:translate(-50%,-50%) rotate(-3.5deg) scale(1)}
}
@keyframes hj-tampon-squish{
  0%{transform:translate(-50%,-50%) rotate(-3.5deg) scale(1)}
  45%{transform:translate(-50%,-50%) rotate(-3.5deg) scale(.9,1.12)}
  100%{transform:translate(-50%,-50%) rotate(-3.5deg) scale(1)}
}

.hj-proof{position:absolute;left:0;right:0;bottom:0;z-index:5;padding:16px 18px 18px;
  background:linear-gradient(0deg,rgba(6,20,16,.92),rgba(6,20,16,.55) 60%,transparent);color:#fff}
.hj-src{font:700 11px/1.4 "JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;color:#FFE47A;letter-spacing:.02em}
.hj-say{margin:6px 0 0;font:700 clamp(14px,4.2vw,17px)/1.35 "Bricolage Grotesque",sans-serif;color:#fff}
.hj-root button.hj-cta.hj-cta{display:block;width:100%;margin:14px 0 0;text-align:center;cursor:pointer;
  font:800 clamp(15px,4.6vw,18px)/1 "Bricolage Grotesque",sans-serif;color:#0D0D0D!important;background:#FFC72C!important;
  border:3px solid #0D0D0D!important;border-radius:14px!important;padding:15px;box-shadow:4px 5px 0 #0D0D0D!important;min-height:52px}
.hj-root button.hj-cta.hj-cta:active{transform:scale(.985)}
.hj-root button.hj-cta.hj-cta small{display:block;margin-top:5px;font:700 11px/1 "JetBrains Mono",monospace;opacity:.75}

.hj-gridsec{padding:26px 16px 10px}
.hj-kicker{font:700 12px/1 "JetBrains Mono",monospace;color:#009E8E;letter-spacing:.08em;text-transform:uppercase}
.hj-h2{margin:8px 0 4px;font:400 clamp(24px,7vw,34px)/.98 Anton,Impact,Haettenschweiler,"Arial Narrow",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.01em}
.hj-sub{margin:0 0 16px;font:500 14px/1.45 "Bricolage Grotesque",sans-serif;color:#5A5A5A}
.hj-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hj-card{border:2.5px solid #0D0D0D;border-radius:14px;overflow:hidden;background:#0b3b38;
  box-shadow:3px 3px 0 #0D0D0D;opacity:0;transform:translateY(26px) scale(.96);
  transition:transform .5s cubic-bezier(.22,1.4,.36,1),opacity .4s ease;cursor:pointer}
.hj-card.hj-in{opacity:1;transform:translateY(0) scale(1)}
.hj-card:active{transform:scale(.96)}
.hj-card svg{display:block;width:100%;height:96px}
.hj-lab{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;background:#FDFCF7}
.hj-nm{font:800 13px/1.1 "Bricolage Grotesque",sans-serif;color:#0D0D0D}
.hj-pill{font:800 10px/1 "JetBrains Mono",monospace;padding:4px 7px;border-radius:999px;border:2px solid #0D0D0D}
.hj-pill-clean{background:#22C55E;color:#06210f} .hj-pill-moderate{background:#B87A00;color:#fff} .hj-pill-avoid{background:#E8522A;color:#fff}

.hj-story{padding:24px 16px 8px}
.hj-beat{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:2px dashed rgba(13,13,13,.14)}
.hj-beat:first-child{border-top:0}
.hj-n{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#0D0D0D;color:#FFE47A;
  font:400 18px/34px Anton,Impact,Haettenschweiler,"Arial Narrow",system-ui,sans-serif;text-align:center}
.hj-beat p{margin:0;font:500 14.5px/1.42 "Bricolage Grotesque",sans-serif;color:#222}
.hj-beat p b{color:#0D0D0D}
.hj-honest{margin:10px 0 0;font:700 13px/1.4 "Bricolage Grotesque",sans-serif}
.hj-honest a{color:#009E8E;cursor:pointer}

.hj-offer{margin:20px 16px 30px;padding:20px;border:3px solid #0D0D0D;border-radius:18px;
  background:#0d1117;color:#fff;box-shadow:6px 7px 0 #FFC72C;text-align:center}
.hj-veilmark{display:flex;justify-content:center;margin-bottom:6px;opacity:.9}
.hj-big{font:400 clamp(20px,6vw,28px)/1.05 Anton,Impact,Haettenschweiler,"Arial Narrow",system-ui,sans-serif;text-transform:uppercase;color:#FFE47A}
.hj-price{margin:8px 0 2px;font:800 15px/1 "JetBrains Mono",monospace;color:#fff}
.hj-sig{margin:12px 0 0;font:600 12px/1.4 "Bricolage Grotesque",sans-serif;color:rgba(255,255,255,.7)}

@media (prefers-reduced-motion:reduce){
  .hj-stamp.hj-land,.hj-stamp.hj-squish{animation:none!important}
  .hj-card{opacity:1!important;transform:none!important;transition:none!important}
}
`
