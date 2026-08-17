/**
 * VeilleurMark — mascotte SVG inline de marque (Le Veilleur).
 * Source : design/wow-candidates/paywall-golden-pass.html (proto Bible v1).
 *
 * Règle marque : l'œil-capteur mi-clos regarde la mer (bas-droite),
 * JAMAIS l'utilisateur (Le Veilleur rassure, ne surveille pas).
 *
 * Motion : micro-respiration 3s amplitude 1.5px (calme-doctrine, pas jank).
 * prefers-reduced-motion = plancher dur (pause, mascotte figée lisible).
 *
 * 72×76px, gradients solar bleu + corps crème + antenne or + iris teal.
 * pointerEvents: none (décor pur, ne vole pas le tap du CTA).
 *
 * Props : { size = 72 } — passe la taille en px (largeur). Hauteur = size × 76/72.
 *
 * Usage :
 *   import { VeilleurMark } from "./VeilleurMark.jsx"
 *   <VeilleurMark />              // 72px (défaut)
 *   <VeilleurMark size={96} />    // plus grand
 *   <VeilleurMark size={48} />    // plus petit (icône)
 */
import React from "react"

export function VeilleurMark({ size = 72 }) {
  const w = size
  const h = Math.round(size * 76 / 72 * 100) / 100
  return (
    <svg width={w} height={h} viewBox="0 0 72 76" aria-hidden="true"
      style={{
        display: "block", margin: "0 auto 8px",
        filter: "drop-shadow(0 6px 0 rgba(0,0,0,.18))",
        pointerEvents: "none"
      }}>
      <rect x="0" y="0" width="72" height="76" fill="#FBF4DF" rx="12" />
      <defs>
        <radialGradient id="sgIris" cx="40%" cy="34%" r="74%">
          <stop offset="0" stopColor="#9af7d6" /><stop offset="1" stopColor="#0c7d72" />
        </radialGradient>
        <linearGradient id="sgSolar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2bc6e6" /><stop offset="1" stopColor="#1487c4" />
        </linearGradient>
        <style>{`
          @keyframes sgVeilBreathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
          @media (prefers-reduced-motion:reduce){
            [data-veilleur-mark]{animation:none!important}
          }
        `}</style>
      </defs>
      <g data-veilleur-mark="1" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" fillRule="evenodd">
        {/* ombre flottante au sol */}
        <ellipse cx="36" cy="72" rx="17" ry="3" fill="#0D0D0D" stroke="none" opacity=".2" />
        {/* panneaux solaires (cyan, hint de tech) */}
        <rect x="2" y="28" width="13" height="17" rx="2.5" fill="url(#sgSolar)" transform="rotate(-11 8 36.5)" />
        <path d="M4 32 L12 30 M4 38 L12 36 M8 29 L8 47" strokeWidth="1.4" transform="rotate(-11 8 36.5)" fill="none" />
        <rect x="57" y="28" width="13" height="17" rx="2.5" fill="url(#sgSolar)" transform="rotate(11 63.5 36.5)" />
        <path d="M59 30 L67 32 M59 36 L67 38 M63.5 29 L63.5 47" strokeWidth="1.4" transform="rotate(11 63.5 36.5)" fill="none" />
        <line x1="13" y1="37.5" x2="21" y2="39" />
        <line x1="58" y1="37.5" x2="50" y2="39" />
        {/* antenne (or) qui pointe vers le haut = veille */}
        <path d="M37 16 q3 -6 0 -11" strokeWidth="2" fill="none" />
        <circle cx="36.3" cy="5" r="3.3" fill="#FFC72C" />
        <circle cx="35.4" cy="4" r="0.9" fill="#fff" stroke="none" />
        {/* corps / tête satellite crème */}
        <rect x="17" y="19" width="38" height="35" rx="10" fill="#FBF4DF" />
        <path d="M18 45 a19 18 0 0 0 36 1 a19 18 0 0 1 -36 -1Z" fill="#ECE0C4" stroke="none" />
        {/* légères joues rosées pour vie */}
        <ellipse cx="25" cy="45" rx="3.3" ry="2.1" fill="#FF8F73" stroke="none" opacity=".45" />
        <ellipse cx="47" cy="45" rx="3.3" ry="2.1" fill="#FF8F73" stroke="none" opacity=".45" />
        {/* ŒIL-CAPTEUR mi-clos qui regarde la MER (bas-droite), JAMAIS l'utilisateur */}
        <ellipse cx="37" cy="35" rx="14" ry="12" fill="#0D0D0D" />
        <clipPath id="sgEye"><ellipse cx="37" cy="35" rx="12" ry="10.2" /></clipPath>
        <g clipPath="url(#sgEye)" stroke="none">
          {/* iris teal (= mer) */}
          <rect x="25" y="25" width="24" height="21" fill="url(#sgIris)" />
          {/* ciel golden-hour en haut de l'iris */}
          <rect x="25" y="25" width="24" height="7.8" fill="#FFD98A" />
          {/* reflet soleil */}
          <circle cx="45" cy="29.4" r="2.7" fill="#FFF3C0" />
          {/* mer teal au milieu */}
          <rect x="25" y="32.5" width="24" height="6" fill="#1EC8B0" />
          {/* sable doré en bas */}
          <path d="M25 38.4 q12 -2.7 24 0 V46 H25Z" fill="#FFE6A8" />
        </g>
        {/* pupille décalée vers la MER (bas-droite) = regarde l'eau, jamais l'utilisateur */}
        <circle cx="41.8" cy="37.8" r="4.5" fill="#0D0D0D" stroke="none" />
        {/* reflet pupille */}
        <circle cx="43.5" cy="36.2" r="1.5" fill="#fff" stroke="none" />
        {/* paupière mi-close sereine (jamais scanning HAL) */}
        <path d="M24 31.2 q13 -7.8 27 0 q-2.1 -6 -13.5 -6 q-11.4 0 -13.5 6Z" fill="#FBF4DF" />
        <path d="M24.3 31.5 q13 -6.6 26.4 0" strokeWidth="1.8" fill="none" />
        {/* petit sourire ami */}
        <path d="M31 50 q6 3.6 12 0.6" strokeWidth="1.7" fill="none" />
      </g>
    </svg>
  )
}

export default VeilleurMark
