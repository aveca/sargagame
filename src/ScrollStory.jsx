// ScrollStory.jsx — scrollytelling golden-hour (écran 3 du hero, below-fold, 430vh).
// Extrait du monolithe → chunk lazy : sort ~4-5 Ko du bundle eager du 1er paint.
// Rendu sous <Suspense> par HeroVerdict/GameFunnel (placeholder 430vh = anti-CLS).
import React,{useState,useEffect,useRef}from"react"
import{_t,T,g,track,BrandIcon}from"./Sargasses_PROD.jsx"
export default function ScrollStory({lang,onShowMap}){
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
