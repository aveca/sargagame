import{A as Ke,y as $e,g as Xt}from"./react-vendor-CLzekduW.js";const Wt=`
/* ============================================================
   IDENTITE — golden-hour côte (palette du repo, source de vérité)
   ============================================================ */
:host{
  --sky0:#0B2230; --sky1:#155A5A; --sky2:#C97E3A; --sky3:#F2B05E;
  --seaT:#1A5852; --seaB:#08251F; --glint:#FFD884; --sand:#1C1712;
  --ink:#EAF7F4; --gold:#E8A800; --goldL:#FFC72C; --goldS:#FFE47A;
  --teal:#009E8E; --tealL:#5FD3C9; --green:#22C55E; --amber:#B87A00; --coral:#E8522A;
  --mid:#9DB4B0; --rim:#FFD884;
  /* CSS vars pilotées par le scroll (le moteur) */
  --gp:0;        /* progression globale 0..1 */
  --p0:0; --p1:0; --p2:0; --p3:0; --p4:0;  /* progression interne de chaque beat */
  --e0:1; --e1:0; --e2:0; --e3:0; --e4:0;  /* opacité de chaque bloc de copy */
  --camS:1;      /* dolly camera scale */
  --camY:0;      /* dolly camera translateY (%) */
  --hs:0;        /* parallaxe HeroScene 0..1 */
  --alert:0;     /* teinte alerte (beat premium) 0..1 */
  /* couleur d'humeur du Veilleur (mutées par JS pour crossfades doux) */
  --mood:#1FB6A6; --moodHalo:#1FB6A6; --moodDot:#22C55E;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
:host{background:#02060A;color:var(--ink);
  font-family:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  overflow-x:hidden}
.anton{font-family:'Anton',"Haettenschweiler","Arial Narrow Bold","Impact",system-ui,sans-serif;font-weight:400;letter-spacing:-.02em;text-transform:uppercase}
.mono{font-family:'JetBrains Mono',monospace}

/* ============================================================
   STRUCTURE SCROLL — page haute + viewport STICKY
   ============================================================ */
.scroller{position:relative;width:100%}
.spans{position:absolute;inset:0;z-index:0;pointer-events:none}
.span{width:100%}
#sp0{height:118vh}  /* hero */
#sp1{height:130vh}  /* verdict */
#sp2{height:165vh}  /* méthode = le plus long (la preuve) */
#sp3{height:140vh}  /* premium */
#sp4{height:112vh}  /* footer — allongé pour donner au CTA footer un vrai temps de lecture */

.viewport{position:sticky;top:0;height:100svh;width:100%;overflow:hidden;z-index:1;
  background:var(--sky0)}

/* caméra dolly : avance dans l'univers (spring CSS, additif au scroll) */
.cam{position:absolute;inset:0;will-change:transform;
  transform:translateY(var(--camY)) scale(var(--camS));
  transform-origin:50% 64%;
  transition:transform .5s cubic-bezier(.34,1.4,.64,1)}

svg.scene{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y}

/* parallaxe des 3 couches (pilotée par --hs au scroll du hero) */
.lyr-sky{transform:translateY(calc(var(--hs) * -26px))}
.lyr-sea{transform:translateY(calc(var(--hs) * 8px)) scale(calc(1 + var(--hs)*0.10));transform-origin:50% 52%}
.lyr-sand{transform:translateY(calc(var(--hs) * 18px)) scale(calc(1 + var(--hs)*0.22));transform-origin:50% 100%}

/* voile de lisibilité bas d'écran */
.veil{position:absolute;inset:0;z-index:2;pointer-events:none;
  background:linear-gradient(180deg,
    rgba(7,18,15,0) 0%,
    rgba(7,18,15,calc(.10 + var(--gp)*.10)) 42%,
    rgba(7,18,15,calc(.46 + var(--p1)*.18 + var(--p3)*.10)) 70%,
    rgba(7,18,15,calc(.80 + var(--gp)*.12)) 100%)}
.alertwash{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:var(--alert);
  background:linear-gradient(180deg,rgba(232,82,42,.16) 0%,rgba(232,82,42,0) 34%)}

/* ============================================================
   CHROME persistant (pill LIVE + langue)
   ============================================================ */
.chrome{position:fixed;top:0;left:0;right:0;z-index:40;display:flex;justify-content:space-between;
  align-items:center;padding:14px 16px;max-width:560px;margin:0 auto;pointer-events:none}
.live{display:inline-flex;align-items:center;gap:7px;pointer-events:auto;
  padding:6px 12px 6px 10px;border-radius:999px;background:rgba(8,18,16,.5);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.14)}
.live .pulse{width:8px;height:8px;border-radius:50%;background:var(--coral);
  box-shadow:0 0 0 0 rgba(232,82,42,.6);animation:livepulse 2.4s ease-out infinite}
@keyframes livepulse{0%{box-shadow:0 0 0 0 rgba(232,82,42,.55)}70%{box-shadow:0 0 0 9px rgba(232,82,42,0)}100%{box-shadow:0 0 0 0 rgba(232,82,42,0)}}
.live .t{font:800 11px/1 "Bricolage Grotesque";letter-spacing:.08em;text-transform:uppercase;color:#fff}
.live .h{font:700 11px/1 'JetBrains Mono';color:var(--tealL);margin-left:2px}
.langs{display:flex;gap:4px;pointer-events:auto}
.langs button{border:1px solid rgba(255,255,255,.14);background:rgba(8,18,16,.5);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:var(--ink);
  font:800 11px/1 "Bricolage Grotesque";letter-spacing:.04em;padding:7px 9px;border-radius:9px;cursor:pointer}
.langs button[aria-pressed="true"]{background:var(--goldL);color:#1A2B26;border-color:transparent}

/* ============================================================
   OVERLAY DE COPY — 1 bloc par beat, épinglé bas, fade par --e{i}
   ============================================================ */
.copylayer{position:absolute;inset:0;z-index:6;pointer-events:none}
.beatcopy{position:absolute;left:0;right:0;bottom:0;padding:0 20px 40px;
  max-width:560px;margin:0 auto;will-change:opacity,transform;
  opacity:0;transform:translateY(14px);transition:opacity .25s linear}
/* #bc0 : padding-bas augmenté pour que le lien "Ouvrir la carte" dégage le
   .scrollhint centré (bottom:18px) — sinon la flèche → tape dans "DÉFILE"
   (overlap mesuré 13px). Override id>class, n'affecte que le hero. */
#bc0{opacity:var(--e0);padding-bottom:70px} #bc1{opacity:var(--e1)} #bc2{opacity:var(--e2)}
#bc3{opacity:var(--e3)} #bc4{opacity:var(--e4)}
.beatcopy.on{pointer-events:auto;transform:translateY(0)}

.eyebrow{font:800 11px/1.3 "Bricolage Grotesque";letter-spacing:.18em;text-transform:uppercase;
  color:var(--tealL);margin-bottom:9px;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.eyebrow .dt{color:var(--goldS)}
h1.head,h2.head{font-size:clamp(31px,8.4vw,50px);line-height:.98;color:#fff;margin:0 0 12px;
  text-shadow:0 2px 22px rgba(0,0,0,.55);max-width:13ch}
.head .b{color:var(--goldL)}
.head .pl{color:var(--goldS)}
.sub{font:600 14.5px/1.5 "Bricolage Grotesque";color:rgba(255,255,255,.82);
  margin:0 0 18px;max-width:38ch;text-shadow:0 1px 10px rgba(0,0,0,.5)}

/* CTA doré principal */
.cta{display:block;width:100%;border:none;cursor:pointer;font-family:inherit;text-align:center;
  border-radius:15px;padding:16px 18px;color:#1A2B26;
  background:linear-gradient(135deg,var(--goldS),var(--goldL) 40%,var(--gold));
  box-shadow:0 12px 34px rgba(232,168,0,.32),inset 0 1px 0 rgba(255,255,255,.5);transition:transform .12s ease}
.cta:active{transform:scale(.985)}
.cta .t{font:800 16.5px/1.1 "Bricolage Grotesque";letter-spacing:.005em}
.cta .s{font:600 12px/1.3 "Bricolage Grotesque";opacity:.78;margin-top:3px}
.linkcta{display:inline-flex;align-items:center;gap:6px;margin-top:13px;background:none;border:none;
  cursor:pointer;font:800 13px/1 "Bricolage Grotesque";color:var(--ink);opacity:.78;
  letter-spacing:.01em;padding:6px 0;text-decoration:none}
.linkcta:hover{opacity:1}
.linkcta .ar{color:var(--goldS)}
.reassure{text-align:center;margin-top:12px;font:600 11px/1.4 "Bricolage Grotesque";
  color:rgba(234,247,244,.55);letter-spacing:.015em}

/* badge VERDICT du jour (hero) */
.verdictbadge{display:inline-flex;align-items:center;gap:11px;margin-bottom:16px;cursor:pointer;
  padding:9px 15px 9px 11px;border-radius:14px;background:rgba(8,18,16,.42);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.13)}
.verdictbadge .vbar{width:5px;height:34px;border-radius:3px;background:var(--green)}
.verdictbadge .vtxt{font-family:'Anton',sans-serif;font-weight:400;letter-spacing:-.01em;text-transform:uppercase;
  font-size:18px;line-height:1;color:var(--green)}
.verdictbadge .vsc{font:700 13px/1 'JetBrains Mono';color:#fff;opacity:.92}
.verdictbadge .vsc b{color:var(--goldS)}

/* top-3 cartes plage (verdict) */
.top3{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;
  margin:0 -20px 14px;padding:2px 20px 8px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.top3::-webkit-scrollbar{display:none}
.pcard{scroll-snap-align:start;flex:0 0 158px;border-radius:14px;padding:13px 14px;cursor:pointer;
  background:rgba(8,18,16,.46);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.12);transition:transform .14s ease,border-color .14s ease}
.pcard:active{transform:scale(.97)}
.pcard .pn{font:800 13.5px/1.15 "Bricolage Grotesque";color:#fff;margin-bottom:6px}
.pcard .ps{display:inline-flex;align-items:center;gap:6px;font:800 11px/1 "Bricolage Grotesque";
  letter-spacing:.04em;text-transform:uppercase}
.pcard .ps .d{width:8px;height:8px;border-radius:50%}
.pcard .pf{font:700 11px/1 'JetBrains Mono';color:var(--mid);margin-top:7px}
.st-clean{color:var(--green)} .st-clean .d{background:var(--green)}
.st-mod{color:#E8B23A} .st-mod .d{background:#E8B23A}
.st-avoid{color:var(--coral)} .st-avoid .d{background:var(--coral)}

/* puces (méthode / premium) */
.bullets{display:flex;flex-direction:column;gap:9px;margin:2px 0 18px}
.bul{display:flex;gap:11px;align-items:flex-start;opacity:0;transform:translateY(10px);
  transition:opacity .5s ease,transform .5s ease}
.bul.rv{opacity:1;transform:none}
.bul .bi{flex:0 0 30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;
  font-size:15px;background:rgba(0,158,142,.16);border:1px solid rgba(95,211,201,.3)}
.bul .bt b{display:block;font:800 12.5px/1.25 "Bricolage Grotesque";color:#fff;letter-spacing:.01em;margin-bottom:2px}
.bul .bt span{font:600 12px/1.4 "Bricolage Grotesque";color:rgba(234,247,244,.74)}

/* footer */
.footwrap{text-align:left}
.wordmark{font-family:'Anton',sans-serif;font-size:40px;line-height:.9;color:#fff;text-transform:uppercase;letter-spacing:-.02em;margin-bottom:10px}
.foot-credit{font:600 12.5px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.7);margin-bottom:14px}
.foot-links{display:flex;gap:18px;align-items:center}
.foot-links a,.foot-links button{font:800 12.5px/1 "Bricolage Grotesque";color:var(--ink);opacity:.8;text-decoration:none;border:0;background:none;padding:0;cursor:pointer}
.foot-links a.prem,.foot-links button.prem{color:var(--goldS);text-decoration:underline;text-underline-offset:3px}

/* indicateur de scroll (hero) */
.scrollhint{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:7;
  display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;
  opacity:calc(1 - var(--gp)*7);transition:opacity .2s}
.scrollhint .lab{font:800 9.5px/1 "Bricolage Grotesque";letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.scrollhint .chev{width:22px;height:22px;border-right:2px solid rgba(255,255,255,.8);
  border-bottom:2px solid rgba(255,255,255,.8);transform:rotate(45deg);animation:bob 1.8s ease-in-out infinite}
@keyframes bob{0%,100%{transform:rotate(45deg) translate(0,0)}50%{transform:rotate(45deg) translate(3px,3px)}}

/* micro-légende in-scene (ancrée, pas un popup) */
.whisper{position:absolute;z-index:8;max-width:240px;padding:11px 13px;border-radius:13px;cursor:pointer;
  background:rgba(8,18,16,.78);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  border:1px solid rgba(255,216,132,.32);color:#fff;
  font:700 12px/1.4 "Bricolage Grotesque";opacity:0;transform:translateY(8px) scale(.97);
  transition:opacity .35s ease,transform .35s ease;pointer-events:none}
.whisper.on{opacity:1;transform:none;pointer-events:auto}
.whisper .ar{color:var(--goldS);font-weight:800}
.whisper small{display:block;margin-top:5px;font:700 11px/1.2 "Bricolage Grotesque";color:var(--goldS)}

/* hint d'interaction discret bas-gauche */
.touchhint{position:absolute;left:16px;bottom:16px;z-index:7;display:flex;align-items:center;gap:7px;
  pointer-events:none;opacity:0;transition:opacity .5s}
.touchhint.on{opacity:.62}
.touchhint .ring{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--tealL);
  animation:tap 2.6s ease-out infinite}
@keyframes tap{0%{transform:scale(.6);opacity:1}60%{transform:scale(1.5);opacity:0}100%{opacity:0}}
.touchhint span{font:700 10.5px/1 "Bricolage Grotesque";letter-spacing:.04em;color:var(--tealL);text-shadow:0 1px 4px #000}

/* ============================================================
   ELEMENTS SVG REACTIFS — au repos = TABLEAU (doctrine calme).
   Seuls les nuages + respiration soleil bougent (ambient lent).
   ============================================================ */
.sgh-cloud1{animation:cloud1 132s ease-in-out infinite alternate}
.sgh-cloud2{animation:cloud2 168s ease-in-out infinite alternate}
@keyframes cloud1{from{transform:translateX(0)}to{transform:translateX(60px)}}
@keyframes cloud2{from{transform:translateX(0)}to{transform:translateX(-46px)}}
#sunGlow{animation:sunBreath 11s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes sunBreath{0%,100%{opacity:.86;transform:scale(1)}50%{opacity:1;transform:scale(1.045)}}

.scanbeam{transition:opacity .4s ease}
.ring{opacity:0}
.ring.go{animation:ringgo 1.1s ease-out forwards}
@keyframes ringgo{0%{opacity:.7;transform:scale(.3)}100%{opacity:0;transform:scale(1.8)}}

.raft{transition:transform .8s ease,opacity .7s ease}
.boomgrp{opacity:0;transition:opacity .5s ease}
.boomgrp.on{opacity:1}
.glint-flash{opacity:0}
.glint-flash.go{animation:glintgo 1s ease-out forwards}
@keyframes glintgo{0%{opacity:.5;transform:scale(.6)}100%{opacity:0;transform:scale(1.6)}}

/* yole : voile qui prend doucement le vent (ambient lent, doctrine calme) */
#yoleSails{animation:yoleLuff 9s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:left bottom}
@keyframes yoleLuff{0%{transform:skewX(0deg)}100%{transform:skewX(-2deg)}}

.buoylabel{opacity:0;transition:opacity .4s ease}
.buoylabel.on{opacity:1}

.alertnotif{opacity:0;transition:opacity .45s ease}
.fcbar{transform:scaleY(0);transform-origin:bottom;transition:transform .5s cubic-bezier(.34,1.56,.64,1)}

/* ============================================================
   DESKTOP full-bleed : même UX, copy capée 560px centré
   ============================================================ */
@media(min-width:680px){
  .beatcopy{padding-bottom:54px}
  h1.head,h2.head{font-size:clamp(42px,5.2vw,60px)}
  .sub{font-size:16px}
}

/* ============================================================
   REDUCED-MOTION = PLANCHER DUR
   ============================================================ */
@media(prefers-reduced-motion:reduce){
  .sgh-cloud1,.sgh-cloud2,.live .pulse,.scrollhint .chev,.touchhint .ring,#sunGlow,#yoleSails{animation:none!important}
  .ring,.glint-flash{animation:none!important}
  .scroller{position:static}
  .spans{display:none}
  .viewport{position:relative;height:auto;min-height:auto}
  .cam{position:relative;transform:none!important;transition:none!important}
  svg.scene{position:relative;height:78vh}
  .veil,.alertwash{position:absolute}
  .copylayer{position:static;pointer-events:auto}
  .beatcopy{position:static;opacity:1!important;transform:none!important;max-width:620px;margin:0 auto;
    padding:34px 20px;border-top:1px solid rgba(255,255,255,.08);pointer-events:auto}
  .bul{opacity:1!important;transform:none!important}
  .scrollhint,.touchhint{display:none}
  .lyr-sky,.lyr-sea,.lyr-sand{transform:none!important}
}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
`,Kt=`<!-- ============================ CHROME persistant ============================ -->
<div class="chrome">
  <div class="live" id="livePill" role="button" tabindex="0" aria-label="Données en direct">
    <span class="pulse"></span>
    <span class="t" id="liveTxt">EN DIRECT</span>
    <span class="h" id="livePass"></span>
  </div>
  <div class="langs" role="group" aria-label="Langue">
    <button data-lang="fr" aria-pressed="true">FR</button>
    <button data-lang="en" aria-pressed="false">EN</button>
    <button data-lang="es" aria-pressed="false">ES</button>
  </div>
</div>

<!-- ============================ SCROLLER (page haute) ============================ -->
<div class="scroller" id="scroller">

  <div class="spans" id="spans">
    <div class="span" id="sp0"></div>
    <div class="span" id="sp1"></div>
    <div class="span" id="sp2"></div>
    <div class="span" id="sp3"></div>
    <div class="span" id="sp4"></div>
  </div>

  <!-- VIEWPORT STICKY : tient la scène SVG plein écran -->
  <div class="viewport" id="viewport">
    <div class="cam" id="cam">

      <!-- ===================== SCENE GOLDEN-HOUR (viewBox 800x600) ===================== -->
      <svg class="scene" id="scene" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
           xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Scène de plage golden-hour : ciel, mer, sable, une yole et Le Veilleur satellite qui veille la mer.">
        <defs>
          <!-- TRAME HALFTONE Ben-Day (points encrés, overlay BD léger) -->
          <pattern id="benDaySky" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(8)">
            <circle cx="3" cy="3" r="2" fill="#0d0b14"/>
          </pattern>
          <pattern id="benDaySea" patternUnits="userSpaceOnUse" width="11" height="11" patternTransform="rotate(-6)">
            <circle cx="2.6" cy="2.6" r="1.7" fill="#0d0b14"/>
          </pattern>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2bb6ef"/><stop offset=".4" stop-color="#62c8ee"/>
            <stop offset=".68" stop-color="#ffc187"/><stop offset="1" stop-color="#ff944a"/>
          </linearGradient>
          <linearGradient id="warmG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffc187" stop-opacity="0"/>
            <stop offset=".6" stop-color="#ff944a" stop-opacity=".24"/>
            <stop offset="1" stop-color="#ff944a" stop-opacity=".5"/>
          </linearGradient>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1f7d72"/><stop offset=".55" stop-color="#0f5f54"/>
            <stop offset="1" stop-color="#08362d"/>
          </linearGradient>
          <radialGradient id="sun" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#fdf6e3"/>
            <stop offset=".46" stop-color="#ffc187" stop-opacity=".72"/>
            <stop offset="1" stop-color="#ff944a" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3a2a18"/><stop offset="1" stop-color="#1c1308"/>
          </linearGradient>
          <radialGradient id="anchorGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#FFE6A8" stop-opacity=".5"/>
            <stop offset="1" stop-color="#FFE6A8" stop-opacity="0"/>
          </radialGradient>
          <!-- voile yole : dégradés chauds pour profondeur (pas un aplat « toc ») -->
          <linearGradient id="sailR" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e8522a"/><stop offset="1" stop-color="#c43d1c"/>
          </linearGradient>
          <linearGradient id="sailY" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e8a800"/><stop offset="1" stop-color="#c78f00"/>
          </linearGradient>
          <linearGradient id="hullG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#27c46b"/><stop offset="1" stop-color="#0f7a48"/>
          </linearGradient>
          <!-- LENTILLE œil du Veilleur (dégradé marque) -->
          <radialGradient id="lens" cx="38%" cy="32%" r="72%">
            <stop offset="0" stop-color="#d8f7ff"/>
            <stop offset=".4" stop-color="#1cc8d8"/>
            <stop offset="1" stop-color="#063838"/>
          </radialGradient>
          <radialGradient id="irisG" cx="42%" cy="38%" r="62%">
            <stop offset="0" stop-color="#0a3a39"/><stop offset="1" stop-color="#03100f"/>
          </radialGradient>
          <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#1b4763"/><stop offset="1" stop-color="#0B2230"/>
          </linearGradient>
          <linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2a4f49"/><stop offset=".55" stop-color="#16332d"/>
            <stop offset="1" stop-color="#0d0b14"/>
          </linearGradient>
          <radialGradient id="haloG" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="var(--moodHalo)" stop-opacity=".55"/>
            <stop offset=".5" stop-color="var(--moodHalo)" stop-opacity=".18"/>
            <stop offset="1" stop-color="var(--moodHalo)" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="beamGrad" cx="50%" cy="0%" r="100%">
            <stop offset="0" stop-color="var(--glint)" stop-opacity=".5"/>
            <stop offset=".7" stop-color="var(--glint)" stop-opacity=".12"/>
            <stop offset="1" stop-color="var(--glint)" stop-opacity="0"/>
          </radialGradient>
          <filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
          <filter id="softS" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
        </defs>

        <!-- ===== COUCHE CIEL (parallaxe lente) ===== -->
        <g class="lyr-sky">
          <rect x="-40" y="-40" width="880" height="420" fill="url(#sky)"/>
          <rect x="-40" y="-40" width="880" height="420" fill="url(#warmG)"/>
          <!-- trame Ben-Day ciel (overlay BD léger) -->
          <rect x="-40" y="-40" width="880" height="420" fill="url(#benDaySky)" opacity=".26"/>
          <!-- ligne d'horizon encrée -->
          <line x1="-40" y1="300" x2="840" y2="300" stroke="#0d0b14" stroke-width="3" opacity=".5"/>
          <!-- soleil bas + halo qui respire (monte d'un cran avec --p0 via JS sur #sunGroup) -->
          <g id="sunGroup">
            <circle id="sunGlow" cx="540" cy="300" r="150" fill="url(#sun)"/>
            <circle cx="540" cy="300" r="40" fill="#fdf6e3"/>
            <circle cx="540" cy="300" r="40" fill="none" stroke="#0d0b14" stroke-width="3" opacity=".55"/>
          </g>
          <!-- 2 nuages = SEUL ambient autorisé (doctrine calme) -->
          <g class="sgh-cloud1" opacity=".46">
            <ellipse cx="180" cy="118" rx="120" ry="13" fill="#10333E"/>
            <ellipse cx="250" cy="128" rx="64" ry="8" fill="#10333E" opacity=".7"/>
          </g>
          <g class="sgh-cloud2" opacity=".34">
            <ellipse cx="610" cy="92" rx="86" ry="9" fill="#0d2c36"/>
            <ellipse cx="556" cy="100" rx="44" ry="7" fill="#0d2c36" opacity=".7"/>
          </g>
          <!-- oiseaux lointains -->
          <path d="M700 132 q7 -6 14 0 q7 -6 14 0" fill="none" stroke="#0B2230" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>
          <path d="M120 150 q5 -4 10 0 q5 -4 10 0" fill="none" stroke="#0B2230" stroke-width="2" stroke-linecap="round" opacity=".4"/>
          <!-- presqu'île au loin (Le Diamant), figée -->
          <path d="M0 312 Q70 292 150 304 L210 312 Z" fill="#0E1F25" opacity=".75"/>
          <path d="M600 300 q26 -64 56 -4 q14 38 6 40 l-78 0 q-4 -18 16 -36 Z" fill="#12262B" opacity=".9"/>
        </g>

        <!-- ===== COUCHE MER (parallaxe + dolly) ===== -->
        <g class="lyr-sea">
          <rect x="-40" y="300" width="880" height="260" fill="url(#sea)"/>
          <!-- trame Ben-Day mer (overlay BD léger) -->
          <rect x="-40" y="300" width="880" height="260" fill="url(#benDaySea)" opacity=".30"/>
          <!-- bord supérieur de mer encré -->
          <line x1="-40" y1="300" x2="840" y2="300" stroke="#0d0b14" stroke-width="2.5" opacity=".6"/>
          <!-- grain raster satellite (révélé par --p1) -->
          <g id="rasterGrain" opacity="0">
            <line x1="0" y1="320" x2="800" y2="320" stroke="#5FD3C9" stroke-width="1"/>
            <line x1="0" y1="344" x2="800" y2="344" stroke="#5FD3C9" stroke-width="1"/>
            <line x1="0" y1="368" x2="800" y2="368" stroke="#5FD3C9" stroke-width="1"/>
            <line x1="0" y1="392" x2="800" y2="392" stroke="#5FD3C9" stroke-width="1"/>
            <line x1="0" y1="416" x2="800" y2="416" stroke="#5FD3C9" stroke-width="1"/>
            <line x1="0" y1="440" x2="800" y2="440" stroke="#5FD3C9" stroke-width="1"/>
            <line x1="0" y1="464" x2="800" y2="464" stroke="#5FD3C9" stroke-width="1"/>
          </g>
          <!-- ALLÉE SCINTILLANTE du soleil (reflets riches décroissants, calmes) -->
          <g id="sunPath" opacity=".92">
            <ellipse cx="540" cy="330" rx="80" ry="6" fill="#FFD884" opacity=".42"/>
            <ellipse cx="538" cy="350" rx="62" ry="5" fill="#FFD884" opacity=".34"/>
            <ellipse cx="535" cy="372" rx="48" ry="5" fill="#FFD884" opacity=".26"/>
            <ellipse cx="532" cy="396" rx="34" ry="4.5" fill="#FFD884" opacity=".19"/>
            <ellipse cx="528" cy="422" rx="24" ry="4" fill="#FFD884" opacity=".13"/>
          </g>
          <!-- houle douce (traits horizontaux discrets) -->
          <g stroke="#0c302b" stroke-width="2" stroke-linecap="round" opacity=".5">
            <line x1="70" y1="392" x2="160" y2="392"/>
            <line x1="232" y1="430" x2="320" y2="430"/>
            <line x1="430" y1="468" x2="540" y2="468"/>
            <line x1="110" y1="500" x2="220" y2="500"/>
          </g>

          <!-- ===== YOLE RONDE (Martinique) — vie + échelle + âme =====
               FIX MAJEUR (occlusion), placement MESURÉ au navigateur :
               la copy occupe la bande centrale viewBox ~[243..558] sur LES DEUX
               viewports → la seule eau libre est sur les CÔTÉS. Côté droit (x=610)
               = allée du soleil : pleinement visible et magnifique sur desktop
               (la yole vogue au large, claire de la colonne centrée) ; sur mobile
               portrait (bande [267..533]) elle est rognée en sliver propre au bord
               droit, PAS d'éclats triangulaires par-dessus le badge. Compromis
               retenu par la critique (« accepter côté droit comme sur desktop »). -->
          <g id="yole" transform="translate(610,356) scale(.72)" style="cursor:pointer">
            <!-- reflet sous la coque (sur l'eau) -->
            <ellipse cx="0" cy="30" rx="60" ry="8" fill="#06201c" opacity=".55"/>
            <ellipse cx="2" cy="40" rx="30" ry="4" fill="#FFD884" opacity=".18"/>
            <!-- voiles (groupe luff doux) : mât + grand-voile bandes rouge/jaune + foc -->
            <g id="yoleSails">
              <line x1="-2" y1="6" x2="-2" y2="-86" stroke="#0d0b14" stroke-width="3.4" stroke-linecap="round"/>
              <path d="M-2 -84 L-2 -6 L56 -6 Z" fill="url(#sailR)"/>
              <path d="M-2 -58 L-2 -6 L38 -6 Z" fill="url(#sailY)"/>
              <path d="M-2 -84 L-2 -6 L56 -6 Z" fill="none" stroke="#0d0b14" stroke-width="2.4" stroke-opacity=".6"/>
              <!-- pli d'ombre central : donne du galbe à la voile (pas un aplat) -->
              <path d="M-2 -78 Q12 -42 30 -8" fill="none" stroke="#9c2f17" stroke-width="1" stroke-opacity=".4"/>
              <!-- foc (petite voile avant) -->
              <path d="M-4 -70 L-4 -8 L-44 -8 Z" fill="#1cc8d8" opacity=".94"/>
              <path d="M-4 -70 L-4 -8 L-44 -8 Z" fill="none" stroke="#0d0b14" stroke-width="2" stroke-opacity=".6"/>
            </g>
            <!-- coque ronde bicolore + liseré + contour encré -->
            <path d="M-62 4 Q0 30 62 4 Q56 16 46 18 L-46 18 Q-56 16 -62 4 Z" fill="url(#hullG)"/>
            <path d="M-62 4 Q0 30 62 4 Q56 16 46 18 L-46 18 Q-56 16 -62 4 Z" fill="none" stroke="#0d0b14" stroke-width="3" stroke-opacity=".6"/>
            <path d="M-62 4 Q0 22 62 4" fill="none" stroke="#fdf6e3" stroke-width="2" stroke-opacity=".7"/>
            <path d="M-46 18 L46 18 Q40 24 0 24 Q-40 24 -46 18 Z" fill="#0d3f38"/>
            <!-- pêcheur (silhouette, échelle humaine) -->
            <circle cx="14" cy="-2" r="4.2" fill="#1a120b"/>
            <rect x="11" y="2" width="7" height="13" rx="3" fill="#1a120b"/>
          </g>

          <!-- BARRAGE anti-sargasses (1 seul, posé au clic) -->
          <g class="boomgrp" id="boom">
            <line id="boomLine" x1="320" y1="400" x2="480" y2="400" stroke="#009E8E" stroke-width="3" stroke-linecap="round"/>
            <g id="boomBuoys"></g>
          </g>

          <!-- RADEAUX de sargasse qui dérivent (cliquables = ramasser) -->
          <g class="raft" id="raft1" data-x="-180" style="cursor:pointer">
            <ellipse cx="120" cy="356" rx="34" ry="9" fill="#3a4a1e"/>
            <ellipse cx="138" cy="352" rx="22" ry="6" fill="#4d6326"/>
            <ellipse cx="104" cy="360" rx="16" ry="5" fill="#2f3d18"/>
          </g>
          <g class="raft" id="raft2" data-x="-120" style="cursor:pointer">
            <ellipse cx="470" cy="346" rx="40" ry="10" fill="#3a4a1e"/>
            <ellipse cx="452" cy="342" rx="24" ry="6" fill="#56702c"/>
            <ellipse cx="492" cy="350" rx="18" ry="5" fill="#2f3d18"/>
          </g>
          <g class="raft" id="raft3" data-x="-90" style="cursor:pointer">
            <ellipse cx="660" cy="372" rx="30" ry="8" fill="#3a4a1e"/>
            <ellipse cx="676" cy="368" rx="18" ry="5" fill="#4d6326"/>
          </g>

          <!-- BOUEES-PLAGE (tap = révèle mini-verdict live) -->
          <g class="buoy" id="buoyA" data-name-fr="Anse Dufour" data-name-en="Anse Dufour" data-name-es="Anse Dufour"
             data-status="clean" style="cursor:pointer">
            <circle cx="288" cy="420" r="34" fill="url(#anchorGlow)"/>
            <circle cx="288" cy="420" r="6.5" fill="#F4845F" stroke="#06121A" stroke-width="1.3"/>
            <circle class="ring ringA" cx="288" cy="420" r="12" fill="none" stroke="#FFE6A8" stroke-width="1.4" style="transform-origin:288px 420px"/>
            <g class="buoylabel" id="lblA">
              <rect x="304" y="404" width="124" height="34" rx="9" fill="#08120E" fill-opacity=".82" stroke="#22C55E" stroke-opacity=".45"/>
              <text x="314" y="419" font-family="Bricolage Grotesque,sans-serif" font-size="11.5" font-weight="800" fill="#fff">Anse Dufour</text>
              <text x="314" y="432" font-family="Bricolage Grotesque,sans-serif" font-size="10" font-weight="800" fill="#22C55E">● PROPRE · AUJOURD'HUI</text>
            </g>
          </g>
          <g class="buoy" id="buoyB" data-name-fr="Grande Anse" data-name-en="Grande Anse" data-name-es="Grande Anse"
             data-status="avoid" style="cursor:pointer">
            <circle cx="448" cy="452" r="34" fill="url(#anchorGlow)"/>
            <circle cx="448" cy="452" r="6.5" fill="#F4845F" stroke="#06121A" stroke-width="1.3"/>
            <circle class="ring ringB" cx="448" cy="452" r="12" fill="none" stroke="#FFE6A8" stroke-width="1.4" style="transform-origin:448px 452px"/>
            <g class="buoylabel" id="lblB">
              <rect x="268" y="436" width="174" height="34" rx="9" fill="#08120E" fill-opacity=".82" stroke="#E8522A" stroke-opacity=".5"/>
              <text x="278" y="451" font-family="Bricolage Grotesque,sans-serif" font-size="11.5" font-weight="800" fill="#fff">Grande Anse</text>
              <text x="278" y="464" font-family="Bricolage Grotesque,sans-serif" font-size="10" font-weight="800" fill="#E8522A">● À ÉVITER · AUJOURD'HUI</text>
            </g>
          </g>
        </g>

        <!-- ===== COUCHE SABLE (parallaxe forte + dolly) ===== -->
        <g class="lyr-sand">
          <path d="M-40 482 Q300 450 840 500 L840 600 L-40 600 Z" fill="url(#land)"/>
          <!-- bord de sable/relief encré -->
          <path d="M-40 482 Q300 450 840 500" fill="none" stroke="#0d0b14" stroke-width="3" opacity=".55"/>
          <path d="M-40 482 Q300 450 840 500" fill="none" stroke="#fdf6e3" stroke-width="1.6" opacity=".3"/>
          <!-- échouage du jour sur le sable (ramassable au beat méthode) -->
          <g class="raft" id="shoreMat" style="cursor:pointer">
            <ellipse cx="360" cy="524" rx="46" ry="9" fill="#3a3010"/>
            <ellipse cx="338" cy="520" rx="26" ry="6" fill="#56441a"/>
            <ellipse cx="384" cy="528" rx="20" ry="5" fill="#48390f"/>
          </g>
          <!-- ramasseur (rake) discret -->
          <g id="rake" opacity=".5">
            <line x1="300" y1="544" x2="300" y2="516" stroke="#2a2018" stroke-width="3" stroke-linecap="round"/>
            <line x1="290" y1="516" x2="310" y2="516" stroke="#2a2018" stroke-width="3" stroke-linecap="round"/>
          </g>
        </g>

        <!-- ============================================================
             LE VEILLEUR (satellite-mascotte v2) — STAR de la scène.
             halo (humeur) → gPose (posture: translate+rotate, pivot OK)
               → gLife (respiration/flottaison) → gBody (corps + œil expressif)
             Ancre EYE = (400, EYE_BASE+5.2). Faisceau émis du VRAI œil, vers la MER.
             ============================================================ -->
        <!-- halo veilleur DERRIÈRE le perso (couleur d'humeur, blur) -->
        <circle id="halo" cx="400" cy="200" r="120" fill="url(#haloG)" filter="url(#soft)" opacity=".5"/>

        <!-- faisceau de scan (pivote vers la cible, émis du VRAI œil) -->
        <g id="beamG">
          <polygon id="beam" points="0,0 -70,210 70,210" fill="url(#beamGrad)" opacity="0"/>
        </g>
        <ellipse id="scanRing" cx="400" cy="362" rx="40" ry="8" fill="none" stroke="var(--glint)" stroke-width="2" opacity="0"/>

        <g id="gPose" transform="translate(400 200)" style="cursor:pointer">
         <g id="gLife">
          <g id="gBody" transform="scale(1.30)">
            <!-- panneaux solaires -->
            <g>
              <rect x="-86" y="-8" width="56" height="30" rx="3" fill="url(#panel)" transform="rotate(-7 -58 7)"/>
              <rect x="30" y="-8" width="56" height="30" rx="3" fill="url(#panel)" transform="rotate(7 58 7)"/>
              <g stroke="#2f7390" stroke-width="1" opacity=".65">
                <line x1="-72" y1="-6" x2="-72" y2="24"/><line x1="-55" y1="-6" x2="-55" y2="24"/><line x1="-40" y1="-6" x2="-40" y2="24"/>
                <line x1="44" y1="-6" x2="44" y2="24"/><line x1="61" y1="-6" x2="61" y2="24"/><line x1="76" y1="-6" x2="76" y2="24"/>
              </g>
            </g>
            <!-- bras -->
            <rect x="-32" y="2" width="64" height="6" rx="3" fill="#0e2622"/>
            <!-- CORPS squircle (superellipse, joues > sommet = baby-schema) -->
            <path d="M0 -30 C20 -30 32 -20 32 0 C32 24 22 42 0 42 C-22 42 -32 24 -32 0 C-32 -20 -20 -30 0 -30 Z"
                  fill="url(#bodyG)" stroke="var(--rim)" stroke-width="1.3" stroke-opacity=".5"/>
            <!-- contour encré du corps (look BD) -->
            <path d="M0 -30 C20 -30 32 -20 32 0 C32 24 22 42 0 42 C-22 42 -32 24 -32 0 C-32 -20 -20 -30 0 -30 Z"
                  fill="none" stroke="#0d0b14" stroke-width="3" stroke-opacity=".6"/>
            <path d="M26 -16 C33 -10 33 22 22 32" fill="none" stroke="var(--rim)" stroke-width="2.4" stroke-opacity=".55" stroke-linecap="round"/>
            <!-- ===== ŒIL ===== -->
            <circle cx="0" cy="4" r="22" fill="url(#lens)"/>
            <circle id="lensTint" cx="0" cy="4" r="22" fill="var(--mood)" opacity=".42"/>
            <circle cx="0" cy="4" r="22" fill="none" stroke="var(--gold)" stroke-width="3"/>
            <circle cx="0" cy="4" r="22" fill="none" stroke="#06201f" stroke-width="1" stroke-opacity=".8"/>
            <circle cx="0" cy="4" r="16.5" fill="none" stroke="var(--gold)" stroke-width="1.1" stroke-opacity=".5"/>
            <g id="gIris">
              <circle id="iris" cx="0" cy="0" r="8" fill="url(#irisG)"/>
              <circle id="irisTint" cx="0" cy="0" r="8" fill="var(--mood)" opacity=".55"/>
              <circle id="pupil" cx="0" cy="0" r="3.4" fill="#02100f"/>
              <circle id="catchA" cx="-3" cy="-3.4" r="2.8" fill="#fff7e2"/>
              <circle id="catchB" cx="3.4" cy="2.6" r="1.3" fill="#dff6ff" opacity=".85"/>
            </g>
            <!-- PAUPIÈRES expressives -->
            <path id="lidTop" d="M-22 4 Q0 -20 22 4 L22 -20 L-22 -20 Z" fill="url(#bodyG)"/>
            <path id="lidBot" d="M-22 4 Q0 28 22 4 L22 28 L-22 28 Z" fill="url(#bodyG)"/>
            <circle cx="0" cy="4" r="22.2" fill="none" stroke="url(#bodyG)" stroke-width="6" opacity="1"/>
            <circle cx="0" cy="4" r="22" fill="none" stroke="var(--gold)" stroke-width="3"/>
            <!-- sourcil -->
            <path id="brow" d="M-15 -19 Q0 -25 15 -19" fill="none" stroke="#0a1f1c" stroke-width="3.4" stroke-linecap="round" opacity=".9"/>
            <!-- antenne (encrée BD) -->
            <line x1="0" y1="-30" x2="0" y2="-46" stroke="#0d0b14" stroke-width="3.2" stroke-opacity=".7"/>
            <circle id="antGlow" cx="0" cy="-49" r="10" fill="var(--moodDot)" opacity=".22" filter="url(#softS)"/>
            <circle id="ant" cx="0" cy="-49" r="4.6" fill="var(--moodDot)"/>
            <!-- anneau echo (tap) -->
            <circle class="ring ringV" cx="0" cy="4" r="30" fill="none" stroke="var(--moodHalo)" stroke-width="2" style="transform-origin:0px 4px"/>
          </g>
         </g>
        </g>

        <!-- ===== ALERTSCENE (beat premium) — montée par --p3 ===== -->
        <g id="alertScene" opacity="0">
          <!-- notif "TA plage change" qui éclot près du Veilleur (à gauche,
               pour rester dans la bande visible mobile portrait [266..534]) -->
          <g class="alertnotif" id="alertNotif" transform="translate(400,150)" style="cursor:pointer">
            <g transform="translate(-78,-92)">
              <rect x="0" y="0" width="156" height="44" rx="11" fill="#E8522A" fill-opacity=".94"/>
              <circle cx="18" cy="22" r="9" fill="#fff" fill-opacity=".92"/>
              <text x="18" y="26" text-anchor="middle" font-family="Bricolage Grotesque,sans-serif" font-size="12" font-weight="800" fill="#E8522A">!</text>
              <text x="34" y="19" font-family="Bricolage Grotesque,sans-serif" font-size="10.5" font-weight="800" fill="#fff" id="notifT1">TA PLAGE CHANGE</text>
              <text x="34" y="33" font-family="Bricolage Grotesque,sans-serif" font-size="9.5" font-weight="700" fill="#fff" fill-opacity=".85" id="notifT2">Sargasses prévues demain</text>
            </g>
          </g>
          <!-- barres de prévision 7 jours qui se dressent (sur le sable) -->
          <g id="fcBars" transform="translate(150,556)">
            <g class="fcbar"><rect x="0"   y="-40" width="20" height="40" rx="4" fill="#22C55E"/></g>
            <g class="fcbar"><rect x="30"  y="-52" width="20" height="52" rx="4" fill="#22C55E"/></g>
            <g class="fcbar"><rect x="60"  y="-36" width="20" height="36" rx="4" fill="#E8B23A"/></g>
            <g class="fcbar"><rect x="90"  y="-64" width="20" height="64" rx="4" fill="#E8522A"/></g>
            <g class="fcbar"><rect x="120" y="-48" width="20" height="48" rx="4" fill="#E8B23A"/></g>
            <g class="fcbar"><rect x="150" y="-30" width="20" height="30" rx="4" fill="#22C55E"/></g>
            <g class="fcbar"><rect x="180" y="-44" width="20" height="44" rx="4" fill="#22C55E"/></g>
          </g>
        </g>
      </svg>

    </div><!-- /.cam -->

    <div class="veil"></div>
    <div class="alertwash"></div>

    <!-- ===================== OVERLAY DE COPY (5 beats) ===================== -->
    <div class="copylayer" id="copylayer">

      <!-- BEAT 0 — HERO -->
      <div class="beatcopy" id="bc0">
        <div class="verdictbadge" id="verdictBadge" role="button" tabindex="0">
          <span class="vbar"></span>
          <span class="vtxt" id="vTxt">PROPRE AUJOURD'HUI</span>
          <span class="vsc">SCORE <b id="vScore">82</b>/100</span>
        </div>
        <div class="eyebrow" id="eb0"></div>
        <h1 class="head anton" id="h0"></h1>
        <p class="sub" id="s0"></p>
        <button class="cta" id="ctaHero" data-src="hero">
          <span class="t" id="ctaHeroT"></span>
          <span class="s" id="ctaHeroS"></span>
        </button>
        <a class="linkcta" id="mapLink"><span id="mapLinkT"></span> <span class="ar">→</span></a>
      </div>

      <!-- BEAT 1 — VERDICT -->
      <div class="beatcopy" id="bc1">
        <div class="eyebrow" id="eb1"></div>
        <h2 class="head anton" id="h1"></h2>
        <p class="sub" id="s1"></p>
        <div class="top3" id="top3">
          <div class="pcard" data-beach="Le Diamant" data-status="clean">
            <div class="pn">Le Diamant</div>
            <div class="ps st-clean"><span class="d"></span>Propre</div>
            <div class="pf">score 82</div>
          </div>
          <div class="pcard" data-beach="Les Salines" data-status="mod">
            <div class="pn">Les Salines</div>
            <div class="ps st-mod"><span class="d"></span>Modéré</div>
            <div class="pf">score 54</div>
          </div>
          <div class="pcard" data-beach="Grande Anse" data-status="avoid">
            <div class="pn">Grande Anse</div>
            <div class="ps st-avoid"><span class="d"></span>À éviter</div>
            <div class="pf">score 21</div>
          </div>
        </div>
        <button class="cta" id="ctaVerdict" data-src="verdict">
          <span class="t" id="ctaVerdictT"></span>
        </button>
      </div>

      <!-- BEAT 2 — METHODE -->
      <div class="beatcopy" id="bc2">
        <div class="eyebrow" id="eb2"></div>
        <h2 class="head anton" id="h2"></h2>
        <p class="sub" id="s2"></p>
        <div class="bullets" id="bullets2">
          <div class="bul"><span class="bi">🛰️</span><div class="bt"><b id="m2b1t"></b><span id="m2b1s"></span></div></div>
          <div class="bul"><span class="bi">📊</span><div class="bt"><b id="m2b2t"></b><span id="m2b2s"></span></div></div>
          <div class="bul"><span class="bi">📅</span><div class="bt"><b id="m2b3t"></b><span id="m2b3s"></span></div></div>
        </div>
        <button class="cta" id="ctaMethode" data-src="methode">
          <span class="t" id="ctaMethodeT"></span>
        </button>
      </div>

      <!-- BEAT 3 — PREMIUM (porte de conversion unique) -->
      <div class="beatcopy" id="bc3">
        <div class="eyebrow" id="eb3"></div>
        <h2 class="head anton" id="h3"></h2>
        <p class="sub" id="s3"></p>
        <div class="bullets" id="bullets3">
          <div class="bul"><span class="bi">🔔</span><div class="bt"><b id="p3b1t"></b><span id="p3b1s"></span></div></div>
          <div class="bul"><span class="bi">🌅</span><div class="bt"><b id="p3b2t"></b><span id="p3b2s"></span></div></div>
          <div class="bul"><span class="bi">📅</span><div class="bt"><b id="p3b3t"></b><span id="p3b3s"></span></div></div>
        </div>
        <button class="cta" id="ctaPremium" data-src="landing_premium">
          <span class="t" id="ctaPremiumT"></span>
        </button>
        <div class="reassure" id="reassure"></div>
      </div>

      <!-- BEAT 4 — FOOTER -->
      <div class="beatcopy" id="bc4">
        <div class="footwrap">
          <div class="eyebrow" id="eb4"></div>
          <div class="wordmark">SARGASSES</div>
          <div class="foot-credit" id="footCredit"></div>
          <div class="foot-links">
            <a href="/a-propos/" id="aboutLink"></a>
            <button type="button" class="prem" id="footPrem" data-src="footer"></button>
          </div>
        </div>
      </div>
    </div><!-- /.copylayer -->

    <div class="scrollhint" id="scrollHint">
      <span class="lab" id="scrollLab">DÉFILE</span>
      <span class="chev"></span>
    </div>

    <div class="touchhint" id="touchHint"><span class="ring"></span><span id="touchHintTxt"></span></div>

    <div class="whisper" id="whBoom"></div>
    <div class="whisper" id="whRaft"></div>

  </div><!-- /.viewport -->
</div><!-- /.scroller -->`;function $t(J,u,q){var pe=[];function h(e,t,a,r){e.addEventListener(t,a,r),pe.push(function(){e.removeEventListener(t,a,r)})}var M=!1,fe=0,ue=[];function Q(e,t){var a=setTimeout(function(){M||e()},t);return ue.push(a),a}var n=function(e){return J.querySelector("#"+e)};function Ae(e){return{beach:e.beach||"Le Diamant",beachDisplay:e.beachDisplay||null,score:e.score!=null?+e.score:82,status:e.status||"clean",region:e.region||"fr",updatedAt:e.updatedAt||null,freshLabel:e.freshLabel||null,top3:Array.isArray(e.top3)?e.top3:null}}var f=Ae(q.home||{}),o=q.lang||"fr";function x(e,t,a){return o==="en"?t:o==="es"?a:e}var p=q.hooks||{};function k(e,t){if(!M&&p.track)try{p.track(e,t||{})}catch{}}function v(e){!M&&p.openPremium&&p.openPremium(e)}function O(){!M&&p.onShowMap&&p.onShowMap()}function D(){!M&&p.onOpenHero&&p.onOpenHero()}function Fe(e){!M&&p.onOpenBeachIdx&&p.onOpenBeachIdx(e)}var G={clean:{fr:["PROPRE AUJOURD'HUI","CLEAN"],en:["CLEAN TODAY","CLEAN"],es:["LIMPIA HOY","CLEAN"],col:"var(--green)",cls:"st-clean"},mod:{fr:["MODÉRÉ AUJOURD'HUI","MOD"],en:["MODERATE TODAY","MOD"],es:["MODERADA HOY","MOD"],col:"#E8B23A",cls:"st-mod"},avoid:{fr:["À ÉVITER AUJOURD'HUI","AVOID"],en:["AVOID TODAY","AVOID"],es:["EVITAR HOY","AVOID"],col:"var(--coral)",cls:"st-avoid"}},i={live:{fr:"EN DIRECT",en:"LIVE",es:"EN DIRECTO"},eb0:{fr:["EN DIRECT · "," · SATELLITE COPERNICUS"],en:["LIVE · "," · COPERNICUS SATELLITE"],es:["EN DIRECTO · "," · SATÉLITE COPERNICUS"]},s0:{fr:"Le verdict sargasses du matin, mesuré au satellite — pas une supposition.",en:"This morning's sargassum verdict, measured by satellite — not a guess.",es:"El veredicto de sargazo de esta mañana, medido por satélite — no una suposición."},ctaHeroT:{fr:"Voir l'état maintenant",en:"See it right now",es:"Ver el estado ahora"},ctaHeroS:{fr:"verdict du jour · météo · 7 jours de prévisions",en:"today's verdict · weather · 7-day forecast",es:"veredicto de hoy · clima · pronóstico 7 días"},mapLinkT:{fr:"Ouvrir la carte en direct",en:"Open the live map",es:"Abrir el mapa en directo"},eb1:{fr:"CE MATIN, EN DIRECT",en:"THIS MORNING, LIVE",es:"ESTA MAÑANA, EN DIRECTO"},h1:{fr:[["LE VERDICT,"],["PLAGE PAR PLAGE"]],en:[["THE VERDICT,"],["BEACH BY BEACH"]],es:[["EL VEREDICTO,"],["PLAYA POR PLAYA"]]},s1:{fr:"Pas d'avis, pas de promesses : la mesure satellite de ce matin, plage par plage.",en:"No opinions, no promises: this morning's satellite reading, beach by beach.",es:"Sin opiniones ni promesas: la medición satelital de esta mañana, playa por playa."},ctaVerdictT:{fr:"Choisis ta plage",en:"Pick your beach",es:"Elige tu playa"},eb2:{fr:"COMMENT ON LE SAIT",en:"HOW WE KNOW",es:"CÓMO LO SABEMOS"},h2:{fr:[["ON VEILLE"],["LA MER POUR TOI"]],en:[["WE WATCH"],["THE SEA FOR YOU"]],es:[["VIGILAMOS"],["EL MAR POR TI"]]},s2:{fr:"Le satellite Copernicus passe 4 fois par jour : on traduit chaque passage en un verdict clair — mesuré, jamais deviné.",en:"The Copernicus satellite passes 4 times a day: we turn every pass into a clear verdict — measured, never guessed.",es:"El satélite Copernicus pasa 4 veces al día: convertimos cada pasada en un veredicto claro — medido, nunca adivinado."},m2b1t:{fr:"Satellite Copernicus",en:"Copernicus satellite",es:"Satélite Copernicus"},m2b1s:{fr:"4 passages par jour, chaque plage — la donnée du matin, pas d'hier.",en:"4 passes a day, every beach — this morning's data, not yesterday's.",es:"4 pasadas al día, cada playa — el dato de esta mañana, no el de ayer."},m2b2t:{fr:"Un score 0-100",en:"A 0-100 score",es:"Un puntaje 0-100"},m2b2s:{fr:"Recalculé à chaque passage : tu sais où ça en est, en temps réel.",en:"Recomputed on every pass: you know where it stands, in real time.",es:"Recalculado en cada pasada: sabes cómo está, en tiempo real."},m2b3t:{fr:"7 jours devant",en:"7 days ahead",es:"7 días por delante"},m2b3s:{fr:"7 jours de prévisions, baie par baie — et quand la confiance baisse, on te le dit.",en:"7-day forecast, bay by bay — and when confidence drops, we tell you.",es:"Pronóstico a 7 días, bahía por bahía — y cuando baja la confianza, te lo decimos."},eb3:{fr:"PREMIUM",en:"PREMIUM",es:"PREMIUM"},h3:{fr:[["SACHE-LE"],["LE JOUR MÊME"]],en:[["KNOW IT"],["THE SAME DAY"]],es:[["ENTÉRATE"],["EL MISMO DÍA"]]},p3b1t:{fr:"Alerte quand ta plage change",en:"Alert when your beach changes",es:"Alerta cuando tu playa cambia"},p3b1s:{fr:"Le jour où TA plage bascule, tu le sais avant d'avoir fait la route.",en:"The day YOUR beach flips, you know before you've made the drive.",es:"El día que TU playa cambia, lo sabes antes de hacer el viaje."},p3b2t:{fr:"Le brief du matin",en:"The morning brief",es:"El brief de la mañana"},p3b2s:{fr:"L'état du jour dans ta boîte mail, avant de partir à la plage.",en:"Today's status in your inbox, before you head out.",es:"El estado de hoy en tu correo, antes de salir."},p3b3t:{fr:"Les 7 jours, toutes les plages",en:"The 7 days, every beach",es:"Los 7 días, todas las playas"},p3b3s:{fr:"Choisis ton jour : la semaine de prévisions, sur toutes les plages.",en:"Pick your day: the week of forecasts, across every beach.",es:"Elige tu día: la semana de pronósticos, en todas las playas."},ctaPremiumT:{fr:"Activer mon veilleur",en:"Turn on my watcher",es:"Activar mi vigía"},reassure:{fr:"Pass unique, dès 7,99 € — pas d'abonnement, accès immédiat, rien à résilier.",en:"One-time Pass from $5.99 — no subscription, instant access, nothing to cancel.",es:"Pass único desde $5.99 — sin suscripción, acceso inmediato, nada que cancelar."},eb4:{fr:"MESURÉ, PAS DEVINÉ",en:"MEASURED, NOT GUESSED",es:"MEDIDO, NO ADIVINADO"},footCredit:{fr:"Données : Copernicus Marine · mise à jour en direct",en:"Data: Copernicus Marine · updated live",es:"Datos: Copernicus Marine · actualizado en directo"},aboutLink:{fr:"À propos",en:"About",es:"Acerca de"},footPrem:{fr:"Activer mon veilleur",en:"Turn on my watcher",es:"Activar mi vigía"},notifT1:{fr:"TA PLAGE CHANGE",en:"YOUR BEACH CHANGES",es:"TU PLAYA CAMBIA"},notifT2:{fr:"Sargasses prévues demain",en:"Sargassum expected tomorrow",es:"Sargazo previsto mañana"},scrollLab:{fr:"DÉFILE",en:"SCROLL",es:"DESLIZA"},touchHint:{fr:"Touche la mer",en:"Touch the sea",es:"Toca el mar"},whBoom:{fr:["Tu viens de protéger un bout de mer. Le Veilleur le fait pour TA plage, tous les jours.","Activer le Veilleur"],en:["You just shielded a stretch of sea. The Veilleur does it for YOUR beach, every day.","Turn on the Veilleur"],es:["Acabas de proteger un trozo de mar. El Veilleur lo hace por TU playa, cada día.","Activar el Veilleur"]},whRaft:{fr:["Et TA plage, propre aujourd'hui ?","Voir ma plage"],en:["And YOUR beach, clean today?","See my beach"],es:["Y TU playa, ¿limpia hoy?","Ver mi playa"]},whBuoyAvoid:{fr:["Le Veilleur t'aurait prévenu.","Activer l'alerte"],en:["The Veilleur would have warned you.","Turn on the alert"],es:["El Veilleur te habría avisado.","Activar la alerta"]},whYole:{fr:["Cette mer, on la lit chaque matin — pour TA plage.","Voir ma plage"],en:["We read this sea every morning — for YOUR beach.","See my beach"],es:["Leemos este mar cada mañana — para TU playa.","Ver mi playa"]}};function X(e){return e.replace(/^l['’]\s*/i,"").replace(/^(le|la|les)\s+/i,"")}function we(){return o==="fr"?f.beach:f.beachDisplay||X(f.beach)}function et(e){return e==="clean"?x("Propre","Clean","Limpia"):e==="mod"?x("Modéré","Moderate","Moderada"):x("À éviter","Avoid","Evitar")}function Bt(){if(f.freshLabel)return typeof f.freshLabel=="object"?f.freshLabel[o]||f.freshLabel.fr:f.freshLabel;if(f.updatedAt){var e=(Date.now()-new Date(f.updatedAt).getTime())/6e4;if(isFinite(e)&&e>=0&&e<12*60){if(e<60)return x("· il y a "+Math.max(1,Math.round(e))+" min","· "+Math.max(1,Math.round(e))+" min ago","· hace "+Math.max(1,Math.round(e))+" min");var t=Math.round(e/60);return x("· il y a "+t+" h","· "+t+"h ago","· hace "+t+" h")}}return x("· maj récente","· recently updated","· act. reciente")}function Ot(){var e=new Date,t=["JANV.","FÉVR.","MARS","AVR.","MAI","JUIN","JUIL.","AOÛT","SEPT.","OCT.","NOV.","DÉC."],a=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"],r=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"],s=o==="en"?a:o==="es"?r:t;return e.getDate()+" "+s[e.getMonth()]}function Ee(e,t){if(e){for(;e.firstChild;)e.removeChild(e.firstChild);for(var a=0;a<t.length;a++){a>0&&e.appendChild(document.createElement("br"));var r=t[a],s;r[1]==="b"||r[1]===!0?(s=document.createElement("span"),s.className="b",s.textContent=r[0],e.appendChild(s)):r[1]==="pl"?(s=document.createElement("span"),s.className="pl",s.textContent=r[0],e.appendChild(s)):e.appendChild(document.createTextNode(r[0]))}}}function Dt(e){var t;return(t=e.match(/^le\s+(.+)/i))?["SARGASSES AU ",t[1]]:(t=e.match(/^les\s+(.+)/i))?["SARGASSES AUX ",t[1]]:(t=e.match(/^la\s+(.+)/i))?["SARGASSES À LA ",t[1]]:(t=e.match(/^l['’]\s*(.+)/i))?["SARGASSES À L'",t[1]]:["SARGASSES À ",e]}function Gt(){var e=x("AUJOURD'HUI","TODAY","HOY"),t=x("EN DIRECT","LIVE","EN DIRECTO"),a=f.status||"clean",r;if(a==="clean"){var s=(o==="fr"?f.beach:we()).toUpperCase();r=[[s,"pl"],[x("PROPRE ","CLEAN ","LIMPIA ")+e+" — ",!1]]}else{var l,c;if(o==="fr"){var m=Dt(f.beach);l=m[0],c=m[1]}else l=x("SARGASSES À","SARGASSUM AT","SARGAZO EN")+" ",c=we();r=[[l],[c.toUpperCase(),"pl"],[e+" — ",!1]]}Ee(n("h0"),r);var w=n("h0");if(w){var y=document.createElement("span");y.className="b",y.textContent=t,w.appendChild(y)}}function It(){var e=n("eb0");if(e){for(var t=i.eb0[o];e.firstChild;)e.removeChild(e.firstChild);e.appendChild(document.createTextNode(t[0]));var a=document.createElement("span");a.className="dt",a.textContent=Ot(),e.appendChild(a),e.appendChild(document.createTextNode(t[1]))}}function Ft(){var e=n("top3");if(e){var t=f.top3;if(!t||!t.length){for(var a=e.querySelectorAll(".pcard"),r=0;r<a.length;r++){var s=a[r].getAttribute("data-status")||"clean",l=a[r].querySelector(".ps");l&&l.lastChild&&(l.lastChild.textContent=et(s))}return}for(;e.firstChild;)e.removeChild(e.firstChild);for(var c=0;c<Math.min(t.length,3);c++){var m=t[c],w=G[m.status]||G.clean,y=document.createElement("div");y.className="pcard",y.setAttribute("data-idx",String(c)),y.setAttribute("data-status",m.status||"clean");var E=document.createElement("div");E.className="pn",E.textContent=m.name||"";var T=document.createElement("div");T.className="ps "+w.cls;var g=document.createElement("span");g.className="d",T.appendChild(g),T.appendChild(document.createTextNode(et(m.status)));var S=document.createElement("div");S.className="pf",S.textContent="score "+(m.score!=null?m.score:"—"),y.appendChild(E),y.appendChild(T),y.appendChild(S),e.appendChild(y)}}}function ke(){var e=we();n("liveTxt")&&(n("liveTxt").textContent=i.live[o]),n("livePass")&&(n("livePass").textContent=" "+Bt()),It(),Gt(),n("s0")&&(n("s0").textContent=i.s0[o]),n("ctaHeroT")&&(n("ctaHeroT").textContent=i.ctaHeroT[o]),n("ctaHeroS")&&(n("ctaHeroS").textContent=i.ctaHeroS[o]),n("mapLinkT")&&(n("mapLinkT").textContent=i.mapLinkT[o]);var t=G[f.status]||G.clean;n("vTxt")&&(n("vTxt").textContent=t[o][0],n("vTxt").style.color=t.col);var a=n("verdictBadge");if(a){var r=a.querySelector(".vbar");r&&(r.style.background=t.col)}n("vScore")&&(n("vScore").textContent=f.score),n("eb1")&&(n("eb1").textContent=i.eb1[o]),Ee(n("h1"),i.h1[o]),n("s1")&&(n("s1").textContent=i.s1[o]),n("ctaVerdictT")&&(n("ctaVerdictT").textContent=i.ctaVerdictT[o]),n("eb2")&&(n("eb2").textContent=i.eb2[o]),Ee(n("h2"),i.h2[o]),n("s2")&&(n("s2").textContent=i.s2[o]),n("m2b1t")&&(n("m2b1t").textContent=i.m2b1t[o]),n("m2b1s")&&(n("m2b1s").textContent=i.m2b1s[o]),n("m2b2t")&&(n("m2b2t").textContent=i.m2b2t[o]),n("m2b2s")&&(n("m2b2s").textContent=i.m2b2s[o]),n("m2b3t")&&(n("m2b3t").textContent=i.m2b3t[o]),n("m2b3s")&&(n("m2b3s").textContent=i.m2b3s[o]),n("ctaMethodeT")&&(n("ctaMethodeT").textContent=x("Voir "+e+" en détail →","See "+e+" in detail →","Ver "+e+" en detalle →")),n("eb3")&&(n("eb3").textContent=i.eb3[o]),Ee(n("h3"),i.h3[o]),n("s3")&&(n("s3").textContent=x("Ton veilleur personnel surveille "+e+" et te prévient le matin où ça change.","Your personal watcher tracks "+e+" and tells you the morning it changes.","Tu vigía personal cuida "+e+" y te avisa la mañana en que cambia.")),n("p3b1t")&&(n("p3b1t").textContent=i.p3b1t[o]),n("p3b1s")&&(n("p3b1s").textContent=i.p3b1s[o]),n("p3b2t")&&(n("p3b2t").textContent=i.p3b2t[o]),n("p3b2s")&&(n("p3b2s").textContent=i.p3b2s[o]),n("p3b3t")&&(n("p3b3t").textContent=i.p3b3t[o]),n("p3b3s")&&(n("p3b3s").textContent=i.p3b3s[o]),n("ctaPremiumT")&&(n("ctaPremiumT").textContent=i.ctaPremiumT[o]),n("reassure")&&(n("reassure").textContent=i.reassure[o]),n("eb4")&&(n("eb4").textContent=i.eb4[o]),n("footCredit")&&(n("footCredit").textContent=i.footCredit[o]),n("aboutLink")&&(n("aboutLink").textContent=i.aboutLink[o]),n("footPrem")&&(n("footPrem").textContent=i.footPrem[o]),n("notifT1")&&(n("notifT1").textContent=i.notifT1[o]),n("notifT2")&&(n("notifT2").textContent=i.notifT2[o]),n("scrollLab")&&(n("scrollLab").textContent=i.scrollLab[o]),n("touchHintTxt")&&(n("touchHintTxt").textContent=i.touchHint[o]),Ft()}function C(e,t,a){return e+(t-e)*a}function L(e,t,a){return e<t?t:e>a?a:e}function Pe(e){return e<.5?2*e*e:1-Math.pow(-2*e+2,2)/2}function Ne(e){return e*e*(3-2*e)}function tt(e,t){return e+Math.random()*(t-e)}function nt(e){return e=e.replace("#",""),[parseInt(e.substr(0,2),16),parseInt(e.substr(2,2),16),parseInt(e.substr(4,2),16)]}function Pt(e,t,a){var r=nt(e),s=nt(t);return"rgb("+Math.round(C(r[0],s[0],a))+","+Math.round(C(r[1],s[1],a))+","+Math.round(C(r[2],s[2],a))+")"}function at(e){if(e=e.trim(),e[0]==="#")return e.length===4?"#"+e[1]+e[1]+e[2]+e[2]+e[3]+e[3]:e;var t=e.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);return t?"#"+[1,2,3].map(function(a){return("0"+parseInt(t[a]).toString(16)).slice(-2)}).join(""):"#1FB6A6"}function He(e){var t=getComputedStyle(u).getPropertyValue(e).trim();return t||"#1FB6A6"}function Ue(e,t,a){return Pt(at(e),at(t),a)}var A=u.style,Ce=n("scene");function qe(e,t){var a=Ce.getBoundingClientRect(),r=Math.max(a.width/800,a.height/600),s=800*r,l=600*r,c=(a.width-s)/2,m=(a.height-l)/2;return{x:(e-a.left-c)/r,y:(t-a.top-m)/r}}var W=n("gPose"),rt=n("gLife"),Le=n("gIris"),K=n("iris"),$=n("irisTint"),ee=n("pupil"),Ve=n("catchB"),ot=n("lidTop"),it=n("lidBot"),Te=n("brow"),Se=n("halo"),st=n("beamG"),Me=n("beam"),te=n("scanRing"),lt=n("ant"),Nt=window.matchMedia&&window.matchMedia("(min-width:680px)").matches,Re=Nt?176:200,R={x:400,y:Re+5.2},B={calm:{mood:"#1FB6A6",halo:"#1FB6A6",dot:"#22C55E",irisR:7.2,pose:0,lift:0,browLift:-1,lidTop:.08,lidBot:.24,beam:0},scan:{mood:"#FFC72C",halo:"#E8A800",dot:"#FFC72C",irisR:9.3,pose:4.5,lift:0,browLift:1.5,lidTop:.28,lidBot:0,beam:1},alert:{mood:"#E8522A",halo:"#E8522A",dot:"#E8522A",irisR:10.2,pose:-3.5,lift:-6,browLift:3.2,lidTop:-.18,lidBot:-.18,beam:.2}};function ne(e){var t={};for(var a in e)t[a]=e[a];return t}var d=ne(B.calm),b=ne(B.calm),ae="calm";function me(e){B[e]&&(b=ne(B[e]),ae=e)}function ct(e){e>=70?me("calm"):e>=40?me("scan"):me("alert")}function Ye(e){var t=4,a=L(d.lidTop+e,-.4,1),r=L(d.lidBot+e,-.4,1),s=C(-20,t+1,a),l=C(28,t-1,r);ot&&ot.setAttribute("d","M-22 "+t+" Q0 "+s+" 22 "+t+" L22 -22 L-22 -22 Z"),it&&it.setAttribute("d","M-22 "+t+" Q0 "+l+" 22 "+t+" L22 30 L-22 30 Z")}var re={x:R.x,y:430},V=R.x,Y=re.y,he=R.x,be=re.y,_e=!1,P=-1,ze=0,dt=-1e9,ge=-1,pt=180,ft=performance.now()+tt(2600,4200);function je(e){ge=performance.now(),pt=e||180,N()}var oe=[n("sp0"),n("sp1"),n("sp2"),n("sp3"),n("sp4")],ut=[n("bc0"),n("bc1"),n("bc2"),n("bc3"),n("bc4")],Ze=n("cam"),mt=n("viewport"),ie={verdict:!1,methode:!1,premium:!1},Be={2:!1,3:!1},ht=[{s:1,y:0,oy:"60%"},{s:1.14,y:-2,oy:"62%"},{s:1.04,y:0,oy:"48%"},{s:1.2,y:-3,oy:"38%"},{s:1,y:0,oy:"56%"}],_=!0;function bt(){for(var e=0,t=0;t<oe.length;t++)oe[t]&&(e+=oe[t].offsetHeight);var a=n("scroller");a&&(a.style.height=e+u.clientHeight+"px")}var Oe={A:!1,B:!1},gt=!1;function Ht(e){return e===0?f.status==="avoid"?"alert":f.status==="mod"?"scan":"calm":e===1?"scan":e===2?"calm":e===3?"alert":"calm"}function yt(){for(var e=u.scrollTop,t=[0,0,0,0,0],a=0,r=0;r<oe.length;r++){var s=oe[r]?oe[r].offsetHeight:1;t[r]=L((e-a)/s,0,1),a+=s}for(var l=0;l<5;l++)A.setProperty("--p"+l,Ne(t[l]).toFixed(4));for(var c=0,m=0;m<5;m++)t[m]>.001&&t[m]<.999&&(c=m);for(var w=0;w<4;w++)t[w]>=.999&&t[w+1]<=.001&&(c=w+1);t[4]>=.999&&(c=4);for(var y=t[c],E=c===3?.8:.88,T=c<4&&y>E?Ne((y-E)/(1-E)):0,g=0;g<5;g++){var S=0;g===c?S=1-T:g===c+1&&(S=T),A.setProperty("--e"+g,S.toFixed(3)),ut[g]&&ut[g].classList.toggle("on",S>.15)}var H=(c+t[c])/4;A.setProperty("--gp",L(H,0,1).toFixed(4)),A.setProperty("--hs",t[0].toFixed(4));var F=ht[c],ce=ht[Math.min(c+1,4)],de=Ne(t[c]),j=F.s+(ce.s-F.s)*de,Ge=F.y+(ce.y-F.y)*de;Ze&&(Ze.style.transformOrigin="50% "+(de<.5?F.oy:ce.oy),Ze.style.transform="translateY("+Ge.toFixed(3)+"%) scale("+j.toFixed(4)+")"),n("sunGroup")&&n("sunGroup").setAttribute("transform","translate(0,"+(-t[0]*26).toFixed(1)+")"),n("rasterGrain")&&(n("rasterGrain").style.opacity=(t[1]*.1).toFixed(3)),Ut(t[1]),t[1]>.55&&!Oe.A&&(Oe.A=!0,De("ringA")),t[1]>.78&&!Oe.B&&(Oe.B=!0,De("ringB")),n("alertScene")&&(n("alertScene").style.opacity=t[3].toFixed(3)),A.setProperty("--alert",L((t[3]-.1)/.5,0,1).toFixed(3)),n("alertNotif")&&(n("alertNotif").style.opacity=L((t[3]-.3)/.3,0,1).toFixed(3));for(var Ie=J.querySelectorAll("#fcBars .fcbar"),Z=0;Z<Ie.length;Z++)Ie[Z].style.transform=t[3]>.35+Z*.08?"scaleY(1)":"scaleY(0)";t[3]>.5&&!gt&&(gt=!0,wt(360,408,!0)),c===2&&t[2]>.25&&!Be[2]&&(Be[2]=!0,xt("bullets2")),c===3&&t[3]>.25&&!Be[3]&&(Be[3]=!0,xt("bullets3")),c===1&&t[1]>.2&&!ie.verdict&&(ie.verdict=!0,k("sg_landing_view",{s:"verdict"})),c===2&&t[2]>.2&&!ie.methode&&(ie.methode=!0,k("sg_landing_view",{s:"methode"})),c===3&&t[3]>.2&&!ie.premium&&(ie.premium=!0,k("sg_landing_view",{s:"premium"})),n("touchHint")&&n("touchHint").classList.toggle("on",c===0&&t[0]>.25&&t[0]<.85&&!_e);var Mt=Ht(c);Mt!==ae&&performance.now()-dt>2500&&me(Mt)}function xt(e){var t=n(e);if(t)for(var a=t.querySelectorAll(".bul"),r=0;r<a.length;r++)(function(s,l){Q(function(){s.classList.add("rv")},l)})(a[r],r*120)}var se=[n("raft1"),n("raft2"),n("raft3")],I=[{picked:!1,blocked:!1},{picked:!1,blocked:!1},{picked:!1,blocked:!1}];function Ut(e){for(var t=0;t<se.length;t++){var a=se[t];if(!(!a||I[t].picked)){var r=parseFloat(a.getAttribute("data-x"))||0,s,l;I[t].blocked?(s=r*(1-Math.min(e,.5)),l=Math.min(e,.5)*8):(s=r*(1-e),l=e*14*(t+1)*.4),a.style.transform="translate("+s.toFixed(1)+"px,"+l.toFixed(1)+"px)",e>.92&&!I[t].blocked&&!I[t].picked&&(I[t].picked=!0,a.style.opacity="0",a.style.transform+=" scale(.6)")}}}function vt(e,t){var a=t?n("shoreMat"):se[e];a&&(!t&&I[e].picked||t&&a.dataset.picked||(t?a.dataset.picked="1":I[e].picked=!0,a.style.transition="transform .7s ease, opacity .7s ease",a.style.opacity="0",k("sg_scene_tap",{el:"sargasse"}),t?a.style.transform="translate(-60px,18px) scale(.5)":(a.style.transform=(a.style.transform||"")+" scale(.55)",qt(se[e]),Je(se[e]),Qe("whRaft",i.whRaft[o],se[e].getBoundingClientRect(),function(){v("scene_sargasse")}))))}function qt(e){var t=e.querySelector("ellipse");if(t){var a=document.createElementNS("http://www.w3.org/2000/svg","ellipse");a.setAttribute("cx",t.getAttribute("cx")),a.setAttribute("cy",t.getAttribute("cy")),a.setAttribute("rx","20"),a.setAttribute("ry","6"),a.setAttribute("fill","#3fd07f"),a.setAttribute("class","glint-flash"),a.style.transformOrigin=t.getAttribute("cx")+"px "+t.getAttribute("cy")+"px",e.parentNode.appendChild(a),a.classList.add("go"),Q(function(){a.parentNode&&a.parentNode.removeChild(a)},1e3)}}function At(e,t){V=L(e,40,760),Y=L(t,330,560),ze=performance.now()+1400,P=performance.now(),N()}function Je(e){var t=e.getBoundingClientRect(),a=qe(t.left+t.width/2,t.top+t.height/2);At(a.x,a.y)}function wt(e,t,a){var r=n("boom"),s=n("boomBuoys"),l=n("boomLine");if(!(!r||!s||!l)){for(r.classList.remove("on");s.firstChild;)s.removeChild(s.firstChild);var c=80,m=4,w=e-c/2;l.setAttribute("x1",w),l.setAttribute("y1",t),l.setAttribute("x2",e+c/2),l.setAttribute("y2",t);for(var y=0;y<m;y++){var E=document.createElementNS("http://www.w3.org/2000/svg","circle");E.setAttribute("cx",w+c/(m-1)*y),E.setAttribute("cy",t),E.setAttribute("r","5"),E.setAttribute("fill","#156a96"),E.setAttribute("stroke","#06121A"),E.setAttribute("stroke-width","1.2"),s.appendChild(E)}requestAnimationFrame(function(){r.classList.add("on")});for(var T=0;T<I.length;T++)I[T].picked||(I[T].blocked=!0);a||(k("sg_scene_tap",{el:"barrage"}),At(e,t),je(170),Q(function(){var g=Ce.getBoundingClientRect(),S=Math.max(g.width/800,g.height/600),H=(g.width-800*S)/2,F=(g.height-600*S)/2;kt("whBoom",i.whBoom[o],g.left+H+e*S,g.top+F+t*S,function(){v("scene_barrage")})},1200))}}function Vt(){De("ringV"),je(150);var e=["calm","scan","alert"],t=(e.indexOf(ae)+1)%3;me(e[t]),P=performance.now(),dt=performance.now(),k("sg_scene_tap",{el:"veilleur"})}function Et(e){var t=n(e);if(t){var a=t.getAttribute("data-status"),r=e==="buoyA"?"ringA":"ringB",s=e==="buoyA"?"lblA":"lblB";De(r),n(s)&&n(s).classList.add("on"),Je(t),k("sg_scene_tap",{el:"bouee"}),n(s)&&(n(s).onclick=function(l){l.stopPropagation(),a==="avoid"?Qe("whRaft",i.whBuoyAvoid[o],t.getBoundingClientRect(),function(){v("scene_bouee")}):D()})}}function Yt(){var e=n("yole");e&&(k("sg_scene_tap",{el:"yole"}),Je(e),Qe("whRaft",i.whYole[o],e.getBoundingClientRect(),function(){D()}))}function De(e){for(var t=J.querySelectorAll("."+e),a=0;a<t.length;a++)(function(r){r.classList.remove("go"),r.offsetWidth,r.classList.add("go")})(t[a])}function _t(e,t){for(;e.firstChild;)e.removeChild(e.firstChild);if(e.appendChild(document.createTextNode(t[0]+" ")),t[1]){var a=document.createElement("span");a.className="ar",a.textContent="→",e.appendChild(a);var r=document.createElement("small");r.textContent=t[1],e.appendChild(r)}}function Qe(e,t,a,r){kt(e,t,a.left+a.width/2,a.top,r)}function kt(e,t,a,r,s){var l=n(e);if(!(!l||!mt)){_t(l,t);var c=mt.getBoundingClientRect();l.style.left=L(a-c.left-120,12,c.width-252)+"px",l.style.top=L(r-c.top-86,70,c.height-120)+"px",l.classList.add("on"),l.onclick=function(){l.classList.remove("on"),s&&s()},clearTimeout(l._t),l._t=Q(function(){l.classList.remove("on")},5200)}}function z(e,t){return e.closest&&e.closest(t)}Ce&&h(Ce,"click",function(e){var t=qe(e.clientX,e.clientY);if(z(e.target,"#gPose")){Vt();return}if(z(e.target,"#yole")){Yt();return}if(z(e.target,"#buoyA")){Et("buoyA");return}if(z(e.target,"#buoyB")){Et("buoyB");return}if(z(e.target,"#shoreMat")){vt(-1,!0);return}var a=z(e.target,".raft");if(a&&a.id&&a.id.indexOf("raft")===0){vt(parseInt(a.id.replace("raft",""),10)-1,!1);return}if(z(e.target,"#alertNotif")){v("scene_alert");return}if(t.y>=324&&t.y<=476&&t.x>=0&&t.x<=800){wt(t.x,t.y,!1);return}k("sg_scene_tap",{el:"empty",band:t.y<324?"sky":"sand",vy:Math.round(t.y)}),D()},{passive:!0});function zt(){n("ctaHero")&&h(n("ctaHero"),"click",function(){k("sg_hero_tap",{t:"title"}),D()}),n("mapLink")&&h(n("mapLink"),"click",function(t){t.preventDefault(),O()}),n("ctaVerdict")&&h(n("ctaVerdict"),"click",function(){D()}),n("ctaMethode")&&h(n("ctaMethode"),"click",function(){D()}),n("ctaPremium")&&h(n("ctaPremium"),"click",function(){v("landing_premium")}),n("footPrem")&&h(n("footPrem"),"click",function(t){t.preventDefault(),v("footer")}),n("aboutLink")&&h(n("aboutLink"),"click",function(){k("sg_nav",{to:"/a-propos/"})}),n("verdictBadge")&&h(n("verdictBadge"),"click",function(){k("sg_hero_tap",{t:"verdict"}),D()});var e=n("top3");e&&h(e,"click",function(t){var a=t.target.closest&&t.target.closest(".pcard");if(a){if(a.getAttribute("data-status")==="avoid"){v("verdict_card_avoid");return}var r=a.getAttribute("data-idx");r!=null?Fe(parseInt(r,10)):D()}}),n("livePill")&&h(n("livePill"),"click",function(){k("sg_scene_tap",{el:"live"})})}for(var U=J.querySelectorAll(".langs button"),Xe=0;Xe<U.length;Xe++)(function(e){h(e,"click",function(){o=e.getAttribute("data-lang");for(var t=0;t<U.length;t++)U[t].setAttribute("aria-pressed",U[t]===e?"true":"false");if(ke(),p.onLang)try{p.onLang(o)}catch{}})})(U[Xe]);h(window,"pointermove",function(e){if(e.pointerType!=="touch"){var t=qe(e.clientX,e.clientY);V=t.x,Y=t.y,_e=!0,P=performance.now(),ze=0,N()}},{passive:!0}),ke(),zt(),k("sg_hero_shown",{beach:f.beach,score:f.score,status:f.status,geoloc:!1,variant:"home_az"});var jt=window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches;if(jt)return A.setProperty("--p0","1"),n("sunGroup")&&n("sunGroup").setAttribute("transform","translate(0,-26)"),d=ne(B.calm),b=ne(B.calm),ae="calm",A.setProperty("--mood",B.calm.mood),A.setProperty("--moodHalo",B.calm.halo),A.setProperty("--moodDot",B.calm.dot),K&&K.setAttribute("r",B.calm.irisR),$&&$.setAttribute("r",B.calm.irisR),ee&&ee.setAttribute("r",(B.calm.irisR*.42).toFixed(2)),Ye(0),Te&&Te.setAttribute("d","M-15 -19 Q0 "+(-25+B.calm.browLift)+" 15 -19"),Se&&Se.setAttribute("opacity",".5"),Me&&Me.setAttribute("opacity","0"),te&&te.setAttribute("opacity","0"),Le&&Le.setAttribute("transform","translate(0 1.5)"),W&&W.setAttribute("transform","translate("+R.x+" "+Re+") rotate(0)"),{teardown:St,update:Lt,setLang:Tt};var ye=!1,xe=!1,Zt=2600,Jt=performance.now(),ve=!1,We=0;function le(){return performance.now()}function Qt(){return L((le()-Jt)/3600,0,1)}function N(){M||ye||xe||(ye=!0,fe=requestAnimationFrame(Ct))}h(u,"scroll",function(){_=!0,P=le(),N()},{passive:!0}),h(window,"resize",function(){bt(),_=!0,N()},{passive:!0}),h(document,"visibilitychange",function(){xe=document.hidden,xe||(_=!0,P=le(),N())});function Ct(){if(M){ye=!1;return}if(xe){ye=!1;return}var e=le(),t=!1,a=e-P<Zt||!ve;_&&(yt(),_=!1,t=!0);var r=.045,s=Math.abs(d.irisR-b.irisR)<.06;s?(d.irisR=b.irisR,d.pose=b.pose,d.lift=b.lift,d.browLift=b.browLift,d.lidTop=b.lidTop,d.lidBot=b.lidBot,d.beam=b.beam,A.setProperty("--mood",b.mood),A.setProperty("--moodHalo",b.halo),A.setProperty("--moodDot",b.dot)):(d.irisR=C(d.irisR,b.irisR,r),d.pose=C(d.pose,b.pose,r),d.lift=C(d.lift,b.lift,r),d.browLift=C(d.browLift,b.browLift,r),d.lidTop=C(d.lidTop,b.lidTop,r),d.lidBot=C(d.lidBot,b.lidBot,r),d.beam=C(d.beam,b.beam,r),A.setProperty("--mood",Ue(He("--mood"),b.mood,r)),A.setProperty("--moodHalo",Ue(He("--moodHalo"),b.halo,r)),A.setProperty("--moodDot",Ue(He("--moodDot"),b.dot,r)),t=!0),K&&K.setAttribute("r",d.irisR.toFixed(2)),$&&$.setAttribute("r",d.irisR.toFixed(2)),ee&&ee.setAttribute("r",(d.irisR*.42).toFixed(2)),_e&&e-P<1100||(e>ze?(V=C(V,re.x,.02),Y=C(Y,re.y,.02),(Math.abs(V-re.x)>.4||Math.abs(Y-re.y)>.4)&&(t=!0)):t=!0),he=C(he,V,.08),be=C(be,Y,.08),(Math.abs(he-V)>.15||Math.abs(be-Y)>.15)&&(t=!0);var l=L((he-R.x)/44,-4,4),c=L((be-R.y)/58,-3,4);Le&&Le.setAttribute("transform","translate("+l.toFixed(2)+" "+c.toFixed(2)+")"),Ve&&(Ve.setAttribute("cx",(3.4+l*.7).toFixed(2)),Ve.setAttribute("cy",(2.6+c*.7).toFixed(2)));var m,w;a?(m=Math.sin(e/3300)*2,w=Math.sin(e/5500)*.6,t=!0):(m=0,w=0),rt&&rt.setAttribute("transform","translate(0 "+m.toFixed(2)+") rotate("+w.toFixed(3)+")");var y=d.pose+w*.3;W&&W.setAttribute("transform","translate("+R.x.toFixed(1)+" "+(Re+d.lift).toFixed(1)+") rotate("+y.toFixed(2)+")");var E=0;if(ge>0){var T=(e-ge)/pt;T>=1?ge=-1:E=T<.5?Pe(T*2):Pe((1-T)*2),t=!0}a&&e>ft&&ge<0&&(je(180),ft=e+tt(3200,6500)),Ye(E);var g=d.browLift;Te&&Te.setAttribute("d","M-15 "+(-19+g*.2).toFixed(2)+" Q0 "+(-25+g).toFixed(2)+" 15 "+(-19+g*.2).toFixed(2)),Se&&Se.setAttribute("opacity",a?(.42+.12*Math.sin(e/3300)+.05).toFixed(3):"0.50");var S=Qt(),H=d.beam,F=0,ce=0;if(S<1&&!ve){if(S>.32){var de=L((S-.32)/.68,0,1);F=-14+26*Pe(de),ce=Math.sin(de*Math.PI)*.9}t=!0}else ve=!0;var j=Math.atan2(be-R.y,he-R.x)*180/Math.PI-90;j=L(j,-26,26),ve||(j=F),st&&st.setAttribute("transform","translate("+R.x+" "+R.y+") rotate("+j.toFixed(2)+")");var Ge=ve?H*.85:Math.max(ce,H*.85);Me&&Me.setAttribute("opacity",Ge.toFixed(3));var Ie=R.x+Math.tan(L(j,-26,26)*Math.PI/180)*(362-R.y);te&&(te.setAttribute("cx",L(Ie,40,760)),te.setAttribute("opacity",(Ge*.6).toFixed(3)),te.setAttribute("ry",(8+2*Math.abs(Math.sin(e/1700))*H).toFixed(2))),H>.05&&a&&(t=!0),lt&&lt.setAttribute("opacity",H>.4?(.8+.2*Math.abs(Math.sin(e/1700))).toFixed(2):"1");var Z=ae==="alert"?1:0;We=C(We,Z,.015),Math.abs(We-Z)>.01&&(t=!0),t&&!xe&&!M?fe=requestAnimationFrame(Ct):ye=!1}ct(f.score),d=ne(B[ae]),A.setProperty("--mood",d.mood),A.setProperty("--moodHalo",d.halo),A.setProperty("--moodDot",d.dot),K&&K.setAttribute("r",d.irisR),$&&$.setAttribute("r",d.irisR),ee&&ee.setAttribute("r",(d.irisR*.42).toFixed(2)),Ye(0),W&&W.setAttribute("transform","translate("+R.x+" "+Re+") rotate(0)"),bt(),yt(),_=!1,P=le(),N();function Lt(e){f=Ae(Object.assign({},f,e||{})),ke(),ct(f.score),_=!0,P=le(),N()}function Tt(e){if(!(!e||e===o)){o=e;for(var t=0;t<U.length;t++)U[t].setAttribute("aria-pressed",U[t].getAttribute("data-lang")===e?"true":"false");ke(),N()}}function St(){if(!M){M=!0;try{cancelAnimationFrame(fe)}catch{}for(var e=0;e<ue.length;e++)try{clearTimeout(ue[e])}catch{}for(var t=0;t<pe.length;t++)try{pe[t]()}catch{}}}return{teardown:St,update:Lt,setLang:Tt}}const Rt={clean:"clean",moderate:"mod",avoid:"avoid"};function tn(J){const{beach:u,lang:q,island:pe,sargData:h,topBeaches:M,onOpen:fe,onShowMap:ue,onPremium:Q,onOpenBeach:n,track:Ae,exiting:f}=J,o=Ke(null),x=Ke(null),p=Ke({});p.current={onOpen:fe,onShowMap:ue,onPremium:Q,onOpenBeach:n,track:Ae,topBeaches:M};function k(){return{beach:u&&u.name?u.name:"Le Diamant",beachDisplay:u&&u.displayName?u.displayName:null,score:u&&u.score!=null?u.score:82,status:u&&Rt[u.status]||"clean",region:pe==="gp"?"gp":"fr",updatedAt:h&&(h.updatedAt||h.erddapTimestamp)||null,top3:(M||[]).slice(0,3).map(v=>({name:v.name,status:Rt[v.status]||"clean",score:v.score}))}}return $e(()=>{const v=o.current;if(!v)return;const O=v.shadowRoot||v.attachShadow({mode:"open"});for(;O.firstChild;)O.removeChild(O.firstChild);const D=document.createElement("style");D.textContent=Wt,O.appendChild(D),O.appendChild(document.createRange().createContextualFragment(Kt));const Fe={track:(i,X)=>{try{p.current.track&&p.current.track(i,X)}catch{}},openPremium:i=>{p.current.onPremium&&p.current.onPremium(i)},onShowMap:()=>{p.current.onShowMap&&p.current.onShowMap()},onOpenHero:()=>{p.current.onOpen&&p.current.onOpen()},onOpenBeachIdx:i=>{const X=(p.current.topBeaches||[])[i];X&&p.current.onOpenBeach?p.current.onOpenBeach(X):p.current.onOpen&&p.current.onOpen()}};let G=null;try{G=$t(O,v,{home:k(),hooks:Fe,lang:q||"fr"})}catch(i){typeof console<"u"&&console.error("HomeAZ init:",i)}if(x.current=G,!G)try{p.current.onShowMap&&p.current.onShowMap()}catch{}return()=>{try{G&&G.teardown()}catch{}x.current=null;try{for(;O.firstChild;)O.removeChild(O.firstChild)}catch{}}},[]),$e(()=>{x.current&&x.current.update(k())},[u&&u.name,u&&u.score,u&&u.status,h&&(h.updatedAt||h.erddapTimestamp),(M||[]).map(v=>v&&v.id).join(",")]),$e(()=>{x.current&&x.current.setLang(q||"fr")},[q]),Xt.createElement("div",{ref:o,role:"dialog","aria-label":u&&u.name?u.name:"Sargasses",style:{position:"fixed",inset:0,zIndex:1050,overflowY:"auto",overflowX:"hidden",forcedColorAdjust:"none",background:"#0d0716",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",opacity:f?0:1,transform:f?"scale(1.04)":"none",transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}})}export{tn as default,$t as initHomeAZ};
