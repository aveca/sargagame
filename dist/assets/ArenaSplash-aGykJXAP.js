import{d as f,y as x}from"./react-vendor-CLzekduW.js";import{u as e}from"./index-C7A0uGfg.js";function b({onDone:r,lang:n="fr",track:s,wordmark:o="SARGASSES MARTINIQUE"}){const[d,l]=f(!1);x(()=>{try{s&&s("sg_arena_splash_view",{})}catch{}const a=setTimeout(()=>l(!0),1500),p=setTimeout(()=>{try{r&&r()}catch{}},2050);return()=>{clearTimeout(a),clearTimeout(p)}},[r]);const t={eyebrow:{fr:"Copernicus Marine · Live",en:"Copernicus Marine · Live",es:"Copernicus Marine · Live"},tagline:{fr:"« mesuré au satellite, pas deviné »",en:"« measured by satellite, not guessed »",es:"« medido por satélite, no adivinado »"},loading:{fr:"chargement de la côte…",en:"loading the coast…",es:"cargando la costa…"}},i=a=>t[a]&&t[a][n]||t[a].fr;return e("div",{className:"arena-splash"+(d?" leaving":""),role:"status","aria-label":"Chargement",children:[e("style",{children:`
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
          border:5px solid #0d0b14;background:linear-gradient(160deg,#8a6cff,#5b3a8e);
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
      `}),e("div",{className:"glow","aria-hidden":"true"}),e("div",{className:"eyebrow",children:i("eyebrow")}),e("div",{className:"orbe","aria-hidden":"true",children:[e("svg",{viewBox:"0 0 120 120",width:"120",height:"120","aria-hidden":"true",style:{display:"block"},children:[e("g",{stroke:"#0d0b14",strokeWidth:"2.5",children:[e("rect",{x:"6",y:"50",width:"20",height:"22",rx:"2",fill:"#1c7fb0"}),e("rect",{x:"94",y:"50",width:"20",height:"22",rx:"2",fill:"#1c7fb0"}),e("line",{x1:"26",y1:"61",x2:"40",y2:"61"}),e("line",{x1:"94",y1:"61",x2:"80",y2:"61"})]}),e("circle",{cx:"60",cy:"62",r:"34",fill:"#fdf6e3",stroke:"#0d0b14",strokeWidth:"3"}),e("line",{x1:"60",y1:"28",x2:"60",y2:"14",stroke:"#0d0b14",strokeWidth:"3"}),e("circle",{cx:"60",cy:"11",r:"5",fill:"#ffd23f",stroke:"#0d0b14",strokeWidth:"2.5"}),e("circle",{cx:"60",cy:"62",r:"20",fill:"#0d0b14"}),e("circle",{cx:"60",cy:"62",r:"14",fill:"#ffd23f"}),e("circle",{cx:"60",cy:"62",r:"6",fill:"#0d0b14"}),e("circle",{cx:"64",cy:"58",r:"2.5",fill:"#fff"}),e("path",{d:"M44 40 Q60 34 76 40",fill:"none",stroke:"#0d0b14",strokeWidth:"3",strokeLinecap:"round"}),e("path",{d:"M50 86 Q60 92 70 86",fill:"none",stroke:"#0d0b14",strokeWidth:"3",strokeLinecap:"round"})]}),e("span",{className:"pow",children:"SCAN!"})]}),e("h1",{children:"LE VEILLEUR"}),e("div",{className:"wm",children:o}),e("div",{className:"tag",children:i("tagline")}),e("div",{className:"bar","aria-hidden":"true",children:e("i",{})}),e("div",{className:"stat",children:i("loading")})]})}export{b as default};
