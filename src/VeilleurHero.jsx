/**
 * VeilleurHero — accueil cinématique « GTA sunset » du Veilleur.
 * Hero plein écran : œil-satellite néon dans un coucher de soleil tropical saturé
 * (god rays, voilier, palmiers rim-lit, grain + scanlines). CTA → entre dans la carte.
 * Animable, 100% SVG/CSS. Montré au 1er atterrissage (1×/session), skippable.
 * onEnter() : ferme le hero et révèle la carte (l'utilitaire qui répond à l'intention).
 */
import React, { useEffect } from "react"

const SCENE = `
<svg viewBox="0 0 390 844" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;display:block">
  <defs>
    <linearGradient id="vhSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2e1a5e"/><stop offset=".16" stop-color="#6b257e"/>
      <stop offset=".34" stop-color="#c33a82"/><stop offset=".50" stop-color="#ff5e6b"/>
      <stop offset=".64" stop-color="#ff8a4d"/><stop offset=".76" stop-color="#ffc15e"/><stop offset="1" stop-color="#ffe39a"/></linearGradient>
    <linearGradient id="vhSea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd789"/><stop offset=".12" stop-color="#ff7e8e"/>
      <stop offset=".42" stop-color="#b83a86"/><stop offset=".74" stop-color="#5e2680"/><stop offset="1" stop-color="#241246"/></linearGradient>
    <radialGradient id="vhSun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8e6"/><stop offset=".28" stop-color="#ffe7a0"/><stop offset=".6" stop-color="#ff9a5e" stop-opacity=".7"/><stop offset="1" stop-color="#ff5e8e" stop-opacity="0"/></radialGradient>
    <radialGradient id="vhHalo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4dffe0" stop-opacity=".85"/><stop offset=".5" stop-color="#2effd0" stop-opacity=".25"/><stop offset="1" stop-color="#2effd0" stop-opacity="0"/></radialGradient>
    <radialGradient id="vhIris" cx="40%" cy="34%" r="74%"><stop offset="0" stop-color="#aaffe0"/><stop offset=".5" stop-color="#34e0b0"/><stop offset="1" stop-color="#0c7a52"/></radialGradient>
    <linearGradient id="vhLit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0d4"/><stop offset="1" stop-color="#ffc59a"/></linearGradient>
    <filter id="vhbS"><feGaussianBlur stdDeviation="11"/></filter><filter id="vhbM"><feGaussianBlur stdDeviation="3.5"/></filter>
    <filter id="vhGlow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="vhVig" cx="50%" cy="42%" r="74%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0b0716" stop-opacity=".6"/></radialGradient>
  </defs>
  <rect width="390" height="548" fill="url(#vhSky)"/>
  <g opacity=".18" filter="url(#vhbM)"><g fill="#fff7d8" transform="translate(200 452)">
    <path d="M0 0 L-180 -380 L-120 -390Z"/><path d="M0 0 L-60 -420 L-20 -424Z"/><path d="M0 0 L60 -420 L20 -424Z"/><path d="M0 0 L180 -380 L120 -390Z"/></g></g>
  <g filter="url(#vhbS)"><ellipse cx="80" cy="105" rx="140" ry="18" fill="#8c3580" opacity=".55"/><ellipse cx="320" cy="150" rx="130" ry="16" fill="#d75986" opacity=".5"/><ellipse cx="60" cy="205" rx="130" ry="14" fill="#ff8466" opacity=".45"/></g>
  <circle cx="200" cy="452" r="210" fill="url(#vhSun)" class="vh-sun"/><circle cx="200" cy="452" r="60" fill="#fff6d8"/><circle cx="200" cy="452" r="60" fill="#ffe89a" opacity=".4"/>
  <g fill="#3a1c52" opacity=".55"><rect x="6" y="430" width="9" height="42"/><rect x="20" y="416" width="7" height="56"/><rect x="32" y="438" width="11" height="34"/><rect x="350" y="424" width="9" height="48"/><rect x="364" y="436" width="11" height="36"/><rect x="378" y="416" width="8" height="56"/></g>
  <rect y="470" width="390" height="374" fill="url(#vhSea)"/>
  <path d="M186 470 q16 100 -12 374 l52 0 q24 -286 0 -374Z" fill="#ffd27a" filter="url(#vhbM)" opacity=".5"/>
  <g stroke="#ffe6b0" stroke-width="1.4" opacity=".3"><line x1="44" y1="500" x2="120" y2="500"/><line x1="252" y1="512" x2="346" y2="512"/><line x1="120" y1="544" x2="240" y2="544"/></g>
  <g fill="#2a1240" opacity=".9"><path d="M298 522 l0 -34 l22 30Z"/><path d="M296 522 l26 0 l-5 9 l-16 0Z"/></g>
  <g transform="translate(266 196)" class="vh-eye">
    <circle r="86" fill="url(#vhHalo)"/>
    <g stroke="#120821" stroke-width="6.5" stroke-linejoin="round">
      <rect x="-78" y="-14" width="26" height="34" rx="5" fill="#1c5a78" transform="rotate(-10 -65 3)"/>
      <rect x="52" y="-14" width="26" height="34" rx="5" fill="#123f55" transform="rotate(10 65 3)"/>
      <line x1="-52" y1="3" x2="-34" y2="3"/><line x1="52" y1="3" x2="34" y2="3"/>
      <ellipse cx="0" cy="2" rx="50" ry="48" fill="#5a2f73"/>
      <path d="M-50 2 a50 48 0 0 1 34 -44 q26 -6 44 14 q-30 -16 -78 30Z" fill="url(#vhLit)" stroke="none"/>
      <path d="M-50 2 a50 48 0 0 1 30 -42" fill="none" stroke="#ffb24d" stroke-width="4"/>
    </g>
    <g filter="url(#vhGlow)"><circle cx="0" cy="2" r="33" fill="#0d0b14"/><circle cx="2" cy="2" r="22" fill="url(#vhIris)"/><circle cx="9" cy="9" r="10" fill="#08121f"/><circle cx="13" cy="-4" r="4.5" fill="#eafff8"/></g>
    <path d="M0 -46 q8 -22 -3 -36" stroke="#120821" stroke-width="6" fill="none"/><circle cx="-3" cy="-86" r="11" fill="#ffd23f" stroke="#120821" stroke-width="4"/>
  </g>
  <path d="M0 720 q110 -64 226 -34 q92 24 164 4 L390 844 L0 844Z" fill="#190c2c"/>
  <path d="M0 720 q110 -64 226 -34" fill="none" stroke="#ff6f8e" stroke-width="2.4" opacity=".6"/>
  <g>
    <path d="M56 844 C 58 760, 74 706, 64 648" fill="none" stroke="#140a24" stroke-width="13" stroke-linecap="round"/>
    <g fill="#140a24">
      <path d="M64 646 C 26 632, 6 640, -10 660 C 22 636, 48 636, 66 654Z"/><path d="M64 646 C 98 628, 124 634, 142 654 C 110 632, 80 634, 62 654Z"/>
      <path d="M64 646 C 40 612, 12 600, -8 600 C 26 614, 48 626, 66 652Z"/><path d="M64 646 C 88 612, 116 602, 138 604 C 104 614, 80 626, 62 652Z"/>
      <path d="M64 646 C 60 612, 62 596, 70 580 C 72 606, 70 628, 66 650Z"/></g>
    <path d="M64 646 C 98 628, 124 634, 142 654" fill="none" stroke="#ff8a5e" stroke-width="2.4" opacity=".7"/>
    <circle cx="64" cy="648" r="5" fill="#ffd23f"/>
  </g>
  <g>
    <path d="M340 844 C 334 766, 324 716, 334 672" fill="none" stroke="#140a24" stroke-width="10" stroke-linecap="round"/>
    <g fill="#140a24"><path d="M334 670 C 302 658, 284 664, 270 680 C 298 660, 320 662, 336 676Z"/><path d="M334 670 C 366 656, 388 662, 402 678 C 374 658, 350 662, 332 676Z"/>
      <path d="M334 670 C 314 642, 292 632, 274 632 C 302 644, 320 656, 336 674Z"/><path d="M334 670 C 354 642, 378 634, 396 636 C 368 644, 348 656, 332 674Z"/></g>
    <path d="M334 670 C 366 656, 388 662, 402 678" fill="none" stroke="#ff8a5e" stroke-width="2" opacity=".55"/>
  </g>
  <rect width="390" height="844" fill="url(#vhVig)"/>
</svg>`

export default function VeilleurHero({ onEnter, lang }){
  const t=(fr,en,es)=> lang==="es"?es: lang==="en"?en: fr
  useEffect(()=>{ try{ document.body.style.overflow="hidden" }catch(_){}; return ()=>{ try{ document.body.style.overflow="" }catch(_){} } },[])
  return (
    <div role="dialog" aria-label="Le Veilleur" style={{
      position:"fixed",inset:0,zIndex:3000,overflow:"hidden",background:"#0b0716",
      fontFamily:'"Anton","Arial Black",Impact,sans-serif'}}>
      <style>{`
        @keyframes vhSunP{0%,100%{opacity:.95}50%{opacity:1;transform:scale(1.02)}}
        @keyframes vhBob{0%,100%{transform:translate(266px,196px)}50%{transform:translate(266px,186px)}}
        @keyframes vhUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
        .vh-eye{transform-box:view-box;transform-origin:266px 196px;animation:vhBob 5s ease-in-out infinite}
        .vh-sun{transform-box:fill-box;transform-origin:center;animation:vhSunP 7s ease-in-out infinite}
        .vh-skip{position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;z-index:6;
          background:rgba(13,7,22,.4);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:999px;
          padding:8px 14px;font:800 11px/1 ui-monospace,monospace;letter-spacing:1px;cursor:pointer;backdrop-filter:blur(6px)}
        .vh-grain{position:absolute;inset:0;opacity:.07;mix-blend-mode:overlay;pointer-events:none}
        .vh-scan{position:absolute;inset:0;pointer-events:none;opacity:.05;background:repeating-linear-gradient(0deg,#000 0 1px,transparent 1px 3px)}
        .vh-wm{position:absolute;left:0;right:0;bottom:122px;text-align:center;z-index:6;padding:0 16px;animation:vhUp .7s .25s both}
        .vh-wm h1{margin:0;font-size:62px;line-height:.82;letter-spacing:-2px;color:#fff;text-transform:uppercase;
          text-shadow:0 2px 0 rgba(0,0,0,.35),0 0 36px rgba(255,140,90,.7),0 0 70px rgba(255,60,160,.4)}
        .vh-wm h1 b{color:#ffd27a}
        .vh-wm p{margin:14px 0 0;font:800 12px/1 ui-monospace,monospace;letter-spacing:5px;color:#ffe0bf}
        .vh-cta{position:absolute;left:22px;right:22px;bottom:50px;z-index:6;text-align:center;cursor:pointer;
          background:linear-gradient(180deg,#ffe07a,#ffb338);color:#2a1230;border:0;border-radius:18px;padding:17px;
          font:900 17px/1 system-ui;letter-spacing:.3px;box-shadow:0 14px 36px rgba(255,140,60,.5),0 0 0 1px rgba(255,255,255,.3) inset;animation:vhUp .7s .4s both}
        @media (prefers-reduced-motion:reduce){.vh-eye,.vh-sun,.vh-wm,.vh-cta{animation:none}}
      `}</style>
      <div style={{position:"absolute",inset:0}} dangerouslySetInnerHTML={{__html:SCENE}}/>
      <div className="vh-grain" style={{backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,backgroundSize:"cover"}}/>
      <div className="vh-scan"/>
      <button className="vh-skip" onClick={onEnter}>{t("Passer ›","Skip ›","Saltar ›")}</button>
      <div className="vh-wm"><h1>LE <b>VEILLEUR</b></h1><p>{t("OÙ TE BAIGNER · AUJOURD'HUI","WHERE TO SWIM · TODAY","DÓNDE BAÑARTE · HOY")}</p></div>
      <button className="vh-cta" onClick={onEnter}>🛟 {t("Voir les plages propres →","See the clean beaches →","Ver las playas limpias →")}</button>
    </div>
  )
}
