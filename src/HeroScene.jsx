import React, { useState, useRef, useEffect } from "react"
import { HERO_PH_OVERRIDE } from "./Sargasses_PROD"

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

export default HeroScene
