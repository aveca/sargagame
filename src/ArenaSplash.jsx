import React,{useEffect,useState} from "react";

/* ARENA SPLASH — écran de lancement comic fidèle à /themes-lab/arena.html (écran 1).
   Overlay plein cadre affiché brièvement au démarrage à froid (gated par sessionStorage,
   uniquement sur l'entrée app — pas les pages SEO). N'altère ni le moteur ni le paywall.
   Palette : ink #0d0b14, yel #ffd23f, blu #27a9e3, grn #27c46b, paper #fdf6e3. */
export default function ArenaSplash({onDone,lang="fr",track}){
  const [leaving,setLeaving]=useState(false);
  useEffect(()=>{
    // Dénominateur de l'entonnoir première visite (entrées app à froid qui voient le splash).
    try{ track&&track("sg_arena_splash_view",{}); }catch(_){}
    const t1=setTimeout(()=>setLeaving(true),1500);
    const t2=setTimeout(()=>{ try{onDone&&onDone();}catch(_){} },2050);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[onDone]);// eslint-disable-line
  const T={
    eyebrow:{fr:"Copernicus Marine · Live",en:"Copernicus Marine · Live",es:"Copernicus Marine · Live"},
    tagline:{fr:"« mesuré au satellite, pas deviné »",en:"« measured by satellite, not guessed »",es:"« medido por satélite, no adivinado »"},
    loading:{fr:"chargement de la côte…",en:"loading the coast…",es:"cargando la costa…"},
  };
  const L=s=>(T[s]&&T[s][lang])||T[s].fr;
  return (
    <div className={"arena-splash"+(leaving?" leaving":"")} role="status" aria-label="Chargement">
      <style>{`
        .arena-splash{position:fixed;inset:0;z-index:3000;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:14px;padding:24px;
          font-family:"Comic Neue",system-ui,sans-serif;color:#fff;
          background:
            radial-gradient(rgba(255,255,255,.06) 1.2px,transparent 1.3px) 0 0/8px 8px,
            linear-gradient(180deg,#10202b,#0c2a3a 60%,#3a2a18);
          opacity:1;transition:opacity .5s ease}
        .arena-splash.leaving{opacity:0;pointer-events:none}
        .arena-splash .glow{position:absolute;top:14%;left:8%;width:130px;height:130px;border-radius:50%;
          background:radial-gradient(rgba(255,210,63,.35),transparent 70%);filter:blur(2px)}
        .arena-splash .eyebrow{font:800 10px/1 "Bricolage Grotesque",sans-serif;background:#ffd23f;
          color:#0d0b14;border:2px solid #0d0b14;border-radius:4px;padding:3px 8px;
          transform:rotate(-2deg);box-shadow:2px 2px 0 #0d0b14;text-transform:uppercase;letter-spacing:.4px}
        .arena-splash .orbe{position:relative;width:148px;height:148px;border-radius:50%;
          border:5px solid #0d0b14;background:linear-gradient(160deg,#5fd0ff,#27a9e3);
          box-shadow:0 8px 0 rgba(0,0,0,.5),inset 0 0 0 4px #fff;transform:rotate(-3deg);
          display:grid;place-items:center;animation:arenaBob 2.4s ease-in-out infinite}
        .arena-splash .orbe .pow{position:absolute;top:-12px;right:-10px;background:#e8322a;
          border:3px solid #0d0b14;border-radius:8px;padding:2px 9px;color:#fff;
          font:400 15px/1 "Anton",sans-serif;transform:rotate(6deg);box-shadow:2px 2px 0 #0d0b14}
        .arena-splash h1{margin:8px 0 0;font:400 32px/1 "AntonLC","Anton",sans-serif;
          color:#fff;text-shadow:3px 3px 0 #0d0b14;transform:rotate(-2deg);letter-spacing:.5px}
        .arena-splash .wm{font:400 16px/1 "Anton",sans-serif;color:#ffd23f;letter-spacing:1px;
          text-shadow:2px 2px 0 #0d0b14;transform:rotate(1deg)}
        .arena-splash .tag{font-style:italic;font-size:13px;color:#fff;text-shadow:1px 1px 0 rgba(0,0,0,.5);opacity:.92}
        .arena-splash .bar{width:180px;height:14px;border:3px solid #0d0b14;border-radius:20px;
          background:#fff;overflow:hidden;box-shadow:3px 3px 0 rgba(0,0,0,.5);margin-top:4px}
        .arena-splash .bar>i{display:block;height:100%;width:0;animation:arenaLoad 1.5s ease-out forwards;
          background:repeating-linear-gradient(45deg,#27c46b,#27c46b 6px,#1ea857 6px,#1ea857 12px)}
        .arena-splash .stat{font-weight:700;font-size:12px;letter-spacing:.5px;text-shadow:1px 1px 0 rgba(0,0,0,.5)}
        @keyframes arenaLoad{0%{width:0}100%{width:92%}}
        @keyframes arenaBob{0%,100%{transform:rotate(-3deg) translateY(0)}50%{transform:rotate(-3deg) translateY(-7px)}}
        @media (prefers-reduced-motion:reduce){.arena-splash .orbe{animation:none}.arena-splash .bar>i{animation-duration:.4s}}
      `}</style>
      <div className="glow" aria-hidden="true"></div>
      <div className="eyebrow">{L("eyebrow")}</div>
      <div className="orbe" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" style={{display:'block'}}>
          <g stroke="#0d0b14" strokeWidth="2.5"><rect x="6" y="50" width="20" height="22" rx="2" fill="#27a9e3"/><rect x="94" y="50" width="20" height="22" rx="2" fill="#27a9e3"/><line x1="26" y1="61" x2="40" y2="61"/><line x1="94" y1="61" x2="80" y2="61"/></g>
          <circle cx="60" cy="62" r="34" fill="#fdf6e3" stroke="#0d0b14" strokeWidth="3"/>
          <line x1="60" y1="28" x2="60" y2="14" stroke="#0d0b14" strokeWidth="3"/>
          <circle cx="60" cy="11" r="5" fill="#ffd23f" stroke="#0d0b14" strokeWidth="2.5"/>
          <circle cx="60" cy="62" r="20" fill="#0d0b14"/>
          <circle cx="60" cy="62" r="14" fill="#ffd23f"/>
          <circle cx="60" cy="62" r="6" fill="#0d0b14"/>
          <circle cx="64" cy="58" r="2.5" fill="#fff"/>
          <path d="M44 40 Q60 34 76 40" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
          <path d="M50 86 Q60 92 70 86" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
        </svg>
        <span className="pow">SCAN!</span>
      </div>
      <h1>LE VEILLEUR</h1>
      <div className="wm">SARGASSES MARTINIQUE</div>
      <div className="tag">{L("tagline")}</div>
      <div className="bar" aria-hidden="true"><i></i></div>
      <div className="stat">{L("loading")}</div>
    </div>
  );
}
