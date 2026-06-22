import React,{useState,useEffect} from "react";

/* ARENA ONBOARDING — flow 3 étapes comic fidèle à /themes-lab/arena.html (écrans 2-4) :
   Bienvenue → Le satellite scanne → Choisis ton terrain. Plein cadre, première visite.
   N'altère ni le moteur ni le paywall. Palette ink/yel/blu/grn/red/paper. */
const L=(o,lang)=>(o&&(o[lang]||o.fr))||"";

export default function ArenaOnboarding({onDone,onSkip,lang="fr",track,region=null}){
  const [step,setStep]=useState(0);
  // Instrumentation : sans elle, on est aveugle sur le premier écran que voient TOUS
  // les nouveaux visiteurs (« les clients en disent rien » → seul le comportement parle).
  // sg_arena_onb_step (1→3) = entonnoir de complétion ; _skip = abandon (avec l'étape) ;
  // _done = a fini les 3 écrans. Permet de mesurer si l'onboarding forcé aide ou fait fuir.
  const T=(e,p)=>{ try{ track&&track(e,p||{}); }catch(_){} };
  useEffect(()=>{ T("sg_arena_onb_step",{step:step+1}); },[step]); // eslint-disable-line
  const next=()=>{ if(step<2) setStep(step+1); else done(); };
  const done=()=>{ T("sg_arena_onb_done",{}); try{onDone&&onDone();}catch(_){} };
  const skip=()=>{ T("sg_arena_onb_skip",{from_step:step+1}); try{(onSkip||onDone)&&(onSkip||onDone)();}catch(_){} };

  const t={
    skip:{fr:"Passer ›",en:"Skip ›",es:"Saltar ›"},
    step:{fr:"Étape",en:"Step",es:"Paso"},
    // étape 1
    welcome:{fr:["BIENVENUE,","CHASSEUR DE PLAGES"],en:["WELCOME,","BEACH HUNTER"],es:["BIENVENIDO,","CAZADOR DE PLAYAS"]},
    p1a:{fr:"Le Veilleur scrute la côte martiniquaise depuis l'espace.",en:"The Watcher scans the Martinique coast from space.",es:"El Vigía escruta la costa de Martinica desde el espacio."},
    p1b:{fr:"Chaque plage devient une <b>carte</b>. Son score sur 100, ce sont ses <b>points de vie</b>. Collectionne les plages PROPRES, fuis les ⚠️ À ÉVITER.",en:"Each beach becomes a <b>card</b>. Its score out of 100 is its <b>hit points</b>. Collect CLEAN beaches, flee the ⚠️ AVOID ones.",es:"Cada playa es una <b>carta</b>. Su puntuación sobre 100 son sus <b>puntos de vida</b>. Colecciona las playas LIMPIAS, huye de las ⚠️ EVITAR."},
    r1a:{fr:"<b>10 plages suivies</b> en temps réel, données Copernicus Marine.",en:"<b>10 beaches tracked</b> in real time, Copernicus Marine data.",es:"<b>10 playas seguidas</b> en tiempo real, datos Copernicus Marine."},
    r1b:{fr:"<b>Verdict du jour</b> + prévision 7 jours sur ta plage.",en:"<b>Daily verdict</b> + 7-day forecast on your beach.",es:"<b>Veredicto del día</b> + previsión 7 días en tu playa."},
    cta1:{fr:"Commencer l'aventure",en:"Start the adventure",es:"Empezar la aventura"},
    cta1s:{fr:"Gratuit · aucune carte demandée",en:"Free · no card required",es:"Gratis · sin tarjeta"},
    // étape 2
    scan:{fr:["LE SATELLITE","SCANNE."],en:["THE SATELLITE","SCANS."],es:["EL SATÉLITE","ESCANEA."]},
    scanSub:{fr:"Indice AFAI · données Copernicus Marine",en:"AFAI index · Copernicus Marine data",es:"Índice AFAI · datos Copernicus Marine"},
    s1:{fr:"<b>Copernicus mesure</b> les radeaux de sargasses au large.",en:"<b>Copernicus measures</b> the sargassum rafts offshore.",es:"<b>Copernicus mide</b> las balsas de sargazo mar adentro."},
    s2:{fr:"On croise <b>7 facteurs</b> : sargasses, houle, vent, eau, ciel, UV, marée.",en:"We cross <b>7 factors</b>: sargassum, swell, wind, water, sky, UV, tide.",es:"Cruzamos <b>7 factores</b>: sargazo, oleaje, viento, agua, cielo, UV, marea."},
    s3:{fr:"Ta plage reçoit un <b>score / 100</b> et un statut clair.",en:"Your beach gets a <b>score / 100</b> and a clear status.",es:"Tu playa recibe una <b>puntuación / 100</b> y un estado claro."},
    cta2:{fr:"Suivant",en:"Next",es:"Siguiente"},
    cta2s:{fr:"Plus qu'une étape",en:"One step left",es:"Queda un paso"},
    // étape 3
    terrain:{fr:["CHOISIS","TON TERRAIN"],en:["CHOOSE","YOUR TURF"],es:["ELIGE","TU TERRENO"]},
    terrainSub:{fr:"Où le Veilleur doit-il monter la garde ?",en:"Where should the Watcher stand guard?",es:"¿Dónde debe vigilar el Vigía?"},
    chosen:{fr:"✓ Choisie",en:"✓ Chosen",es:"✓ Elegida"},
    soon:{fr:"🔒 Bientôt",en:"🔒 Soon",es:"🔒 Pronto"},
    cta3:{fr:"Entrer en Martinique",en:"Enter Martinique",es:"Entrar en Martinica"},
    cta3s:{fr:"Tu pourras changer dans Réglages",en:"You can change in Settings",es:"Podrás cambiar en Ajustes"},
    cleanPill:{fr:"PROPRES",en:"CLEAN",es:"LIMPIAS"},
    modPill:{fr:"MODÉRÉ",en:"MODERATE",es:"MODERADO"},
    avoidPill:{fr:"À ÉVITER",en:"AVOID",es:"EVITAR"},
  };
  // Régionalisation : Martinique (region=null) garde les chaînes legacy À L'IDENTIQUE
  // (zéro régression sur le domaine principal). Sinon on injecte le bon marché — GP et
  // les domaines internationaux affichaient « Martinique » sur le 1er écran (bug cohérence).
  const RL = region && region.label ? String(region.label) : null;
  const p1a = RL
    ? {fr:`Le Veilleur scrute la côte de ${RL} depuis l'espace.`,en:`The Watcher scans the ${RL} coast from space.`,es:`El Vigía escruta la costa de ${RL} desde el espacio.`}
    : t.p1a;
  const cta3 = RL
    ? {fr:`Entrer · ${RL}`,en:`Enter ${RL}`,es:`Entrar · ${RL}`}
    : t.cta3;
  const regBeaches = region && Array.isArray(region.beaches) ? region.beaches.filter(Boolean).slice(0,3) : [];
  const bg = step===1 ? "night" : "sky";

  return (
    <div className={"arena-onb bg-"+bg} role="dialog" aria-modal="true">
      <style>{`
        .arena-onb{position:fixed;inset:0;z-index:2900;overflow-y:auto;-webkit-overflow-scrolling:touch;
          font-family:"Comic Neue",system-ui,sans-serif;color:#fff;
          padding:max(18px,env(safe-area-inset-top)) 16px max(22px,env(safe-area-inset-bottom));
          display:flex;flex-direction:column;animation:arenaOnbIn .35s ease}
        @keyframes arenaOnbIn{from{opacity:0}to{opacity:1}}
        .arena-onb.bg-sky{background:
          radial-gradient(rgba(13,11,20,.13) 1.2px,transparent 1.3px) 0 0/8px 8px,
          radial-gradient(rgba(13,11,20,.13) 1.2px,transparent 1.3px) 4px 4px/8px 8px,
          linear-gradient(170deg,#2e1a5e,#6a2f9e 34%,#ffc187 72%,#ff944a)}
        .arena-onb.bg-night{background:
          radial-gradient(rgba(255,255,255,.06) 1.2px,transparent 1.3px) 0 0/8px 8px,
          linear-gradient(180deg,#10202b,#0c2a3a 60%,#3a2a18)}
        .arena-onb .top{display:flex;justify-content:space-between;align-items:center}
        .arena-onb .eyebrow{font:800 10px/1 "Bricolage Grotesque",sans-serif;background:#ffd23f;color:#0d0b14;
          border:2px solid #0d0b14;border-radius:4px;padding:3px 8px;transform:rotate(-2deg);
          box-shadow:2px 2px 0 #0d0b14;text-transform:uppercase;letter-spacing:.4px}
        .arena-onb .skip{background:none;border:none;color:#fff;font:800 13px/1 "Bricolage Grotesque";
          text-shadow:1px 1px 0 rgba(0,0,0,.5);cursor:pointer;padding:6px}
        .arena-onb h1{font:400 30px/1 "AntonLC","Anton",sans-serif;color:#fff;
          text-shadow:3px 3px 0 #0d0b14;transform:rotate(-2deg);letter-spacing:.5px;margin:14px 0 0}
        .arena-onb .sub{margin-top:6px;font-weight:700;font-size:13px;text-shadow:1px 1px 0 rgba(0,0,0,.5)}
        .arena-onb .panel{background:#fdf6e3;border:3px solid #0d0b14;border-radius:14px;padding:12px;
          box-shadow:4px 4px 0 #0d0b14;color:#241f30}
        .arena-onb .row{display:flex;align-items:center;gap:10px;background:#fdf6e3;border:3px solid #0d0b14;
          border-radius:10px;padding:9px;box-shadow:3px 3px 0 rgba(13,11,20,.5);color:#241f30}
        .arena-onb .txt{font-size:13px;line-height:1.3}
        .arena-onb .num{flex:none;width:26px;height:26px;border-radius:50%;border:2.5px solid #0d0b14;
          color:#fff;display:grid;place-items:center;font:400 15px/1 "Anton",sans-serif}
        .arena-onb .btn{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;
          border:3px solid #0d0b14;border-radius:12px;padding:12px;color:#fdf6e3;background:#0d0b14;
          box-shadow:4px 4px 0 rgba(13,11,20,.5);font:400 18px/1 "Anton",sans-serif;cursor:pointer;
          letter-spacing:.4px;text-align:center}
        .arena-onb .btn small{font:700 11px/1.2 "Bricolage Grotesque";opacity:.82;letter-spacing:0}
        .arena-onb .btn.yel{background:linear-gradient(180deg,#ffe06a,#ffd23f);color:#0d0b14;text-shadow:1px 1px 0 #fff}
        .arena-onb .btn:active{transform:translate(4px,4px);box-shadow:0 0 0 #0d0b14}
        .arena-onb .pow{display:inline-block;background:#e8322a;border:3px solid #0d0b14;border-radius:8px;
          padding:2px 10px;color:#fff;font:400 15px/1 "Anton",sans-serif;transform:rotate(-3deg);box-shadow:2px 2px 0 #0d0b14}
        .arena-onb .pill{display:inline-flex;align-items:center;gap:5px;font:800 11px/1 "Bricolage Grotesque";
          border:2px solid #0d0b14;border-radius:20px;padding:4px 9px;background:#fff;color:#0d0b14}
        .arena-onb .dot{width:8px;height:8px;border-radius:50%;flex:none}
        .arena-onb .spacer{flex:1;min-height:14px}
        .arena-onb .stack{display:flex;flex-direction:column;gap:10px;margin-top:14px}
        .arena-onb .dots{display:flex;gap:6px;justify-content:center;margin-top:12px}
        .arena-onb .dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.4);border:1.5px solid #0d0b14}
        .arena-onb .dots i.on{background:#ffd23f}
        @media(min-height:760px){.arena-onb{justify-content:center}}
      `}</style>

      <div className="top">
        <span className="eyebrow">{L(t.step,lang)} {step+1} / 3</span>
        <button className="skip" onClick={skip}>{L(t.skip,lang)}</button>
      </div>

      {step===0 && (<>
        <div style={{textAlign:"center",marginTop:18,filter:"drop-shadow(3px 4px 0 rgba(0,0,0,.35))"}}>
          <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" style={{display:'block',margin:"0 auto"}}>
            <g stroke="#0d0b14" strokeWidth="2.5"><rect x="6" y="50" width="20" height="22" rx="2" fill="#5b3a8e"/><rect x="94" y="50" width="20" height="22" rx="2" fill="#5b3a8e"/><line x1="26" y1="61" x2="40" y2="61"/><line x1="94" y1="61" x2="80" y2="61"/></g>
            <circle cx="60" cy="62" r="34" fill="#fdf6e3" stroke="#0d0b14" strokeWidth="3"/>
            <line x1="60" y1="28" x2="60" y2="14" stroke="#0d0b14" strokeWidth="3"/>
            <circle cx="60" cy="11" r="5" fill="#ffd23f" stroke="#0d0b14" strokeWidth="2.5"/>
            <circle cx="60" cy="62" r="20" fill="#0d0b14"/>
            <circle cx="60" cy="62" r="14" fill="#27c46b"/>
            <circle cx="60" cy="62" r="6" fill="#0d0b14"/>
            <circle cx="64" cy="58" r="2.5" fill="#fff"/>
            <path d="M44 40 Q60 34 76 40" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
            <path d="M50 86 Q60 92 70 86" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 style={{textAlign:"center"}}>{L(t.welcome,lang)[0]}<br/>{L(t.welcome,lang)[1]}</h1>
        <div style={{textAlign:"center",marginTop:8}}><span className="pow">PROPRE!</span></div>
        <div className="stack">
          <div className="panel">
            <div className="txt" style={{fontWeight:800}} dangerouslySetInnerHTML={{__html:L(p1a,lang)}}/>
            <div className="txt" style={{marginTop:8}} dangerouslySetInnerHTML={{__html:L(t.p1b,lang)}}/>
          </div>
          <div className="row"><span style={{fontSize:26}}>🌊</span><span className="txt" style={{flex:1}} dangerouslySetInnerHTML={{__html:L(t.r1a,lang)}}/></div>
          <div className="row"><span style={{fontSize:26}}>🎴</span><span className="txt" style={{flex:1}} dangerouslySetInnerHTML={{__html:L(t.r1b,lang)}}/></div>
        </div>
        <div className="spacer"/>
        <button className="btn yel" onClick={next}>{L(t.cta1,lang)}<small>{L(t.cta1s,lang)}</small></button>
      </>)}

      {step===1 && (<>
        <h1>{L(t.scan,lang)[0]}<br/>{L(t.scan,lang)[1]}</h1>
        <div className="sub">{L(t.scanSub,lang)}</div>
        <div style={{position:"relative",marginTop:16,height:150,border:"4px solid #0d0b14",borderRadius:16,
          background:"radial-gradient(circle at 50% 22%,rgba(95,208,255,.45),transparent 60%),linear-gradient(180deg,#0c2a3a,#10202b)",
          overflow:"hidden",boxShadow:"5px 5px 0 #0d0b14"}}>
          <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",filter:"drop-shadow(2px 2px 0 rgba(0,0,0,.5))"}}>
            <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true" style={{display:'block'}}>
              <g stroke="#0d0b14" strokeWidth="2.5"><rect x="6" y="50" width="20" height="22" rx="2" fill="#5b3a8e"/><rect x="94" y="50" width="20" height="22" rx="2" fill="#5b3a8e"/><line x1="26" y1="61" x2="40" y2="61"/><line x1="94" y1="61" x2="80" y2="61"/></g>
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
          </div>
          <div style={{position:"absolute",top:50,left:"50%",width:2,height:60,transform:"translateX(-50%)",background:"linear-gradient(180deg,#27c46b,transparent)"}}/>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:46,background:"repeating-linear-gradient(90deg,#1d6b3f,#1d6b3f 10px,#27c46b 10px,#27c46b 20px)"}}/>
          <div style={{position:"absolute",bottom:30,right:14}}><span className="pow" style={{background:"#ffd23f",color:"#0d0b14"}}>BIP BIP!</span></div>
        </div>
        <div className="panel" style={{marginTop:14,display:"flex",flexDirection:"column",gap:9}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}><span className="num" style={{background:"#e8322a"}}>1</span><span className="txt" style={{flex:1}} dangerouslySetInnerHTML={{__html:L(t.s1,lang)}}/></div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}><span className="num" style={{background:"#ffd23f",color:"#0d0b14"}}>2</span><span className="txt" style={{flex:1}} dangerouslySetInnerHTML={{__html:L(t.s2,lang)}}/></div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}><span className="num" style={{background:"#27c46b"}}>3</span><span className="txt" style={{flex:1}} dangerouslySetInnerHTML={{__html:L(t.s3,lang)}}/></div>
        </div>
        <div className="spacer"/>
        <button className="btn" onClick={next}>{L(t.cta2,lang)}<small>{L(t.cta2s,lang)}</small></button>
      </>)}

      {step===2 && (<>
        <h1>{L(t.terrain,lang)[0]}<br/>{L(t.terrain,lang)[1]}</h1>
        <div className="sub">{L(t.terrainSub,lang)}</div>
        <div className="stack">
          <div className="panel" style={{padding:0,overflow:"hidden",position:"relative",borderWidth:4}}>
            <div style={{background:"linear-gradient(90deg,#3e2470,#0f7d72)",padding:"10px 12px",display:"flex",alignItems:"center",gap:8,borderBottom:"3px solid #0d0b14"}}>
              <span style={{fontSize:30}}>🏝️</span>
              <span style={{flex:1}}>
                <span style={{display:"block",fontFamily:"Anton",color:"#fff",fontSize:18,textShadow:"1.5px 1.5px 0 #0d0b14"}}>{RL?RL.toUpperCase():"MARTINIQUE"}</span>
                <span style={{display:"block",font:"800 10px/1.2 'Bricolage Grotesque'",color:"#d8fff6"}}>{RL?(regBeaches.length?regBeaches.join(", ")+"…":RL):"10 plages · Le Diamant, Les Salines…"}</span>
              </span>
              <span className="pill" style={{background:"#27c46b",color:"#fff",borderWidth:2.5}}>{L(t.chosen,lang)}</span>
            </div>
            <div style={{padding:"10px 12px",display:"flex",gap:7,flexWrap:"wrap",background:"#fdf6e3"}}>
              <span className="pill"><span className="dot" style={{background:"#27c46b"}}/>{RL?L(t.cleanPill,lang):"6 PROPRES"}</span>
              <span className="pill"><span className="dot" style={{background:"#ffd23f"}}/>{RL?L(t.modPill,lang):"2 MODÉRÉ"}</span>
              <span className="pill"><span className="dot" style={{background:"#e8322a"}}/>{RL?L(t.avoidPill,lang):"2 À ÉVITER"}</span>
            </div>
            <div className="pow" style={{position:"absolute",top:-10,right:8,background:"#ffd23f",color:"#0d0b14"}}>YEAH!</div>
          </div>
          {!RL && <div className="panel" style={{padding:0,overflow:"hidden",opacity:.85,borderStyle:"dashed"}}>
            <div style={{background:"linear-gradient(90deg,#6b6577,#403b4d)",padding:"10px 12px",display:"flex",alignItems:"center",gap:8,borderBottom:"3px solid #0d0b14"}}>
              <span style={{fontSize:30}}>🦋</span>
              <span style={{flex:1}}>
                <span style={{display:"block",fontFamily:"Anton",color:"#fff",fontSize:18,textShadow:"1.5px 1.5px 0 #0d0b14"}}>GUADELOUPE</span>
                <span style={{display:"block",font:"800 10px/1.2 'Bricolage Grotesque'",color:"#e9e6f0"}}>Grande-Terre &amp; Basse-Terre</span>
              </span>
              <span className="pill" style={{background:"#ffd23f",borderWidth:2.5}}>{L(t.soon,lang)}</span>
            </div>
          </div>}
        </div>
        <div className="spacer"/>
        <button className="btn yel" onClick={done}>{L(cta3,lang)}<small>{L(t.cta3s,lang)}</small></button>
      </>)}

      <div className="dots" aria-hidden="true">
        <i className={step===0?"on":""}/><i className={step===1?"on":""}/><i className={step===2?"on":""}/>
      </div>
    </div>
  );
}
