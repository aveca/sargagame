import React from "react"
/* SPRINT 2 « game icon pass » — set SVG mono-trait ink (DS : JAMAIS d'emoji OS).
   24×24, stroke=currentColor, round caps. Usage : <ComicIcon name="flame" size={14} />
   Couleur via prop `color` (défaut currentColor = hérite du texte parent).
   Rollback : git revert par fichier (aucun flag, visuel seul, zéro logique). */
const P = {
  check: <path d="M5 13l4 4L19 7"/>,
  cross: <path d="M6 6l12 12M18 6L6 18"/>,
  half: <><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/></>,
  flame: <path d="M12 2.8c1.3 3.4 5.8 5.7 5.8 10.4a5.8 5.8 0 0 1-11.6 0c0-2 .9-3.5 2-4.9.4 1.4 1.2 2.2 2.4 2.4C10.2 8.4 11 5.4 12 2.8z"/>,
  star: <path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.2l-5.7 3.1 1.1-6.3L2.8 9.5l6.4-.9z"/>,
  target: <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></>,
  wave: <><path d="M2 9.5c2.8-2.8 5.6-2.8 8.4 0s5.6 2.8 8.4 0"/><path d="M2 15.5c2.8-2.8 5.6-2.8 8.4 0s5.6 2.8 8.4 0"/></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M12 9v11M4 13.5h16"/><path d="M12 9C10 9 5.8 9.5 5.8 6.9c0-1.8 1.5-2.3 2.7-1.6C9.8 6.1 11 9 12 9zM12 9c2 0 6.2-.5 6.2-2.1 0-1.8-1.5-2.3-2.7-1.6C14.2 6.1 13 9 12 9z"/></>,
  bell: <><path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.6 2.5H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/></>,
  pin: <><path d="M12 21.3s-6.8-5.9-6.8-10.6a6.8 6.8 0 0 1 13.6 0c0 4.7-6.8 10.6-6.8 10.6z"/><circle cx="12" cy="10.7" r="2.4"/></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></>,
  orbit: <><circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(-20 12 12)"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></>,
  eye: <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></>,
  mask: <><path d="M3.5 12.5h12.5l-1.6 4.5H5.1z"/><path d="M18.5 12.5V6H21"/><circle cx="9" cy="14.2" r="1" fill="currentColor" stroke="none"/></>,
  baby: <><circle cx="12" cy="12.5" r="7.5"/><path d="M12 5c.6-1.6 2.1-2.1 3.1-1.5"/><circle cx="9.3" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="11.5" r="1" fill="currentColor" stroke="none"/><path d="M9 15.2c1.8 1.3 4.2 1.3 6 0"/></>,
  fish: <><path d="M6.5 12c2-2.9 4.8-4.6 7.9-4.6 2.3 0 4.2 1.5 5.6 4.6-1.4 3.1-3.3 4.6-5.6 4.6-3.1 0-5.9-1.7-7.9-4.6z"/><path d="M6.5 12L3.2 9.4M6.5 12l-3.3 2.6"/><circle cx="16.3" cy="11" r="1" fill="currentColor" stroke="none"/></>,
  mega: <><path d="M4 10.5v3h2.5L14 18V6l-7.5 4.5z"/><path d="M17 9.2a4.3 4.3 0 0 1 0 5.6M19.4 7a7.8 7.8 0 0 1 0 10"/></>,
  person: <><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c1.2-3.8 3.8-5.6 7-5.6s5.8 1.8 7 5.6"/></>,
  hotel: <><path d="M5 20.5V6.2L12 3.5l7 2.7v14.3"/><path d="M5 20.5h14"/><path d="M9.5 10.2h1.6M12.9 10.2h1.6M9.5 13.4h1.6M12.9 13.4h1.6"/><path d="M11 20.5v-2.8h2v2.8"/></>,
  zap: <path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z"/>,
  trophy: <><path d="M8 4h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H4.6a.6.6 0 0 0-.6.6c0 2.9 1.9 4.8 4.4 5M16 5.5h3.4a.6.6 0 0 1 .6.6c0 2.9-1.9 4.8-4.4 5"/><path d="M12 12.5V16M8.5 20h7M9.7 16.5h4.6"/></>,
  party: <><path d="M6.5 20L13.5 8.5 9.2 6.3z"/><path d="M15 3.5V7M18.3 5l-2.3 2.3M20.5 9.5h-3.2"/><circle cx="18.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="17.5" r="1.1" fill="currentColor" stroke="none"/></>,
  car: <><path d="M4.5 14.5l1.4-4.3a1.5 1.5 0 0 1 1.4-1h9.4a1.5 1.5 0 0 1 1.4 1l1.4 4.3"/><rect x="3.5" y="14.5" width="17" height="4" rx="1.2"/><circle cx="7.5" cy="18.7" r="1.5"/><circle cx="16.5" cy="18.7" r="1.5"/></>,
  skull: <><path d="M12 3.5a7 7 0 0 0-7 7c0 2.6 1.4 4.5 3.3 5.6v2.4a1 1 0 0 0 1 1h5.4a1 1 0 0 0 1-1v-2.4c1.9-1.1 3.3-3 3.3-5.6a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="11" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.7" cy="11" r="1.3" fill="currentColor" stroke="none"/><path d="M12 13.6v2.2"/></>,
  palm: <><path d="M12 21v-7.5"/><path d="M12 13.5c-3 0-6-1.6-7.5-4.2 2.9-.3 5.6.6 7.5 2.2 1.9-1.6 4.6-2.5 7.5-2.2-1.5 2.6-4.5 4.2-7.5 4.2z"/><circle cx="10.4" cy="14.8" r="1" fill="currentColor" stroke="none"/><circle cx="13.6" cy="14.8" r="1" fill="currentColor" stroke="none"/></>,
  wind: <><path d="M3 8.2h9.3a2.5 2.5 0 1 0-2.4-3.1"/><path d="M3 12.2h13.3a2.8 2.8 0 1 1-2.6 3.7"/><path d="M3 16.2h6.5"/></>,
  parking: <><rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M10 17V7h3.4a3.1 3.1 0 0 1 0 6.2H10"/></>,
  camera: <><rect x="3.5" y="7.5" width="17" height="12" rx="2"/><circle cx="12" cy="13.5" r="3.2"/><path d="M8.5 7.5L10 5h4l1.5 2.5"/></>,
  chat: <path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-5 4z"/>,
  odor: <><path d="M8.5 4c-1.6 2-1.6 4.2 0 6.2s1.6 4.2 0 6.2"/><path d="M13.5 4c-1.6 2-1.6 4.2 0 6.2s1.6 4.2 0 6.2"/></>,
  deck: <><rect x="6" y="3.5" width="12" height="17" rx="2.5"/><path d="M12 8l1.8 2.7L12 13.4l-1.8-2.7z" fill="currentColor" stroke="none"/></>,
  compass: <><circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2.3 4.7-4.7 2.3 2.3-4.7z" fill="currentColor" stroke="none"/></>,
  map: <><path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/></>,
  crown: <><path d="M4 17.5h16"/><path d="M4 17.5L3 9.5l4.7 3L12 6l4.3 6.5L21 9.5l-1 8z"/></>,
  burst: <path d="M12 2.5l1.7 4 4.3-.7-.7 4.3 3.9 2.1-3.9 2.1.7 4.3-4.3-.7-1.7 4-1.7-4-4.3.7.7-4.3-3.9-2.1 3.9-2.1-.7-4.3 4.3.7z"/>,
  unlock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.8-1.2"/></>,
  mail: <><rect x="3.5" y="6" width="17" height="13" rx="2"/><path d="M4.5 7.5L12 13l7.5-5.5"/></>,
  rainbow: <><path d="M4 18a8 8 0 0 1 16 0"/><path d="M7 18a5 5 0 0 1 10 0"/><circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none"/></>,
  hourglass: <><path d="M6.5 3.5h11M6.5 20.5h11"/><path d="M8 3.5c0 5 8 5.5 8 8.5s-8 3.5-8 8.5"/></>,
  chart: <><path d="M4 20h16"/><path d="M7.5 20v-6M12 20V8M16.5 20v-9"/></>,
  ladder: <><path d="M8 3.5V21M16 3.5V21"/><path d="M8 8h8M8 12.5h8M8 17h8"/></>,
  bank: <><path d="M3.5 9L12 4l8.5 5"/><path d="M5 9.5V18M9.5 9.5V18M14.5 9.5V18M19 9.5V18"/><path d="M3.5 18.5h17"/></>,
  sun: <><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/></>,
  butterfly: <><ellipse cx="8" cy="9" rx="4" ry="5.5" transform="rotate(-20 8 9)"/><ellipse cx="16" cy="9" rx="4" ry="5.5" transform="rotate(20 16 9)"/><ellipse cx="9" cy="17" rx="3" ry="4" transform="rotate(-25 9 17)"/><ellipse cx="15" cy="17" rx="3" ry="4" transform="rotate(25 15 17)"/><path d="M12 6v13"/></>,
  card: <><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.2h19"/><path d="M6 15h4"/></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z"/>,
}
export default function ComicIcon({name="check",size=14,color="currentColor",sw=2.3,style}){
  return(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{flexShrink:0,...(style||{})}}>{P[name]||P.check}</svg>)
}
/* Pastille code région (R1) — remplace les flags emoji OS dans les navs.
   currentColor = blanc sur barre teal, ink sur fond clair. */
export function RegionCode({code}){
  return(<span aria-hidden="true" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",font:"800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",letterSpacing:".02em",border:"1.5px solid currentColor",borderRadius:6,padding:"2px 4px",marginRight:6,opacity:.95}}>{code}</span>)
}
