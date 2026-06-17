import React, { useEffect, useRef } from "react"

// i18n local (le _t de l'app n'est pas exporté) — même signature (fr/en/es).
const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)

/**
 * DiveTransition — « La Marée du Veilleur » : plongée golden-hour carte → plage.
 *
 * Jouée 1× PAR SESSION au 1er ouverture de plage (cf onBeachClick + flag nav_dive),
 * pas à chaque fois → délice d'ouverture, zéro friction répétée. Rapide (~0.95s),
 * SKIPPABLE (tap n'importe où), `prefers-reduced-motion` = onDone immédiat (plancher
 * dur). CALME : une seule passe, pas d'idle. 100 % CSS keyframes (robuste, GPU).
 * La fiche plage est déjà montée dessous (selectedBeach) → l'overlay se fond pour la révéler.
 */
export default function DiveTransition({ beach, lang = "fr", onDone }) {
  const doneRef = useRef(false)
  const finish = () => { if (doneRef.current) return; doneRef.current = true; if (onDone) onDone() }
  useEffect(() => {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); return }
    } catch (_) {}
    const t = setTimeout(finish, 950)
    return () => clearTimeout(t)
  }, [])

  const name = (beach && beach.name) || ""
  const st = (beach && beach.status) || "clean"
  const stCol = st === "clean" ? "#22C55E" : st === "moderate" ? "#E8A800" : "#E8522A"
  const lbl = st === "clean"
    ? _t(lang, "propre aujourd'hui", "clean today", "limpia hoy")
    : st === "moderate" ? _t(lang, "modéré", "moderate", "moderada") : _t(lang, "à éviter", "avoid", "evitar")

  return (
    <div onClick={finish} aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 1090, overflow: "hidden", cursor: "pointer", animation: "sgDiveOut .95s ease-in forwards" }}>
      <style>{`
        @keyframes sgDiveOut{0%{opacity:0}9%{opacity:1}80%{opacity:1}100%{opacity:0}}
        @keyframes sgDiveDots{0%{opacity:1}52%{opacity:0}100%{opacity:0}}
        @keyframes sgDiveSat{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-64px);opacity:.4}}
        @keyframes sgDiveRays{0%{opacity:0}50%{opacity:.5}100%{opacity:0}}
        @keyframes sgDiveBeach{0%{transform:translateY(360px);opacity:0}50%{opacity:.25}100%{transform:translateY(0);opacity:1}}
        @keyframes sgDiveCap{0%{opacity:0;transform:translateY(14px)}60%{opacity:0}100%{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){.sgDiveLayer,.sgDiveCapBox{animation:none!important}}
      `}</style>
      <svg viewBox="0 0 390 680" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
        <defs>
          <linearGradient id="dtSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230" /><stop offset=".42" stopColor="#155A5A" /><stop offset=".72" stopColor="#C97E3A" /><stop offset="1" stopColor="#F2B05E" /></linearGradient>
          <linearGradient id="dtSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852" /><stop offset="1" stopColor="#08251F" /></linearGradient>
          <radialGradient id="dtSun" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFE6A8" stopOpacity=".95" /><stop offset=".4" stopColor="#FFD884" stopOpacity=".5" /><stop offset="1" stopColor="#FFD884" stopOpacity="0" /></radialGradient>
          <linearGradient id="dtRay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE6A8" stopOpacity=".55" /><stop offset="1" stopColor="#FFE6A8" stopOpacity="0" /></linearGradient>
          <linearGradient id="dtSand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1C3138" /><stop offset="1" stopColor="#13242A" /></linearGradient>
        </defs>
        <rect x="0" y="0" width="390" height="680" fill="url(#dtSky)" />
        <circle cx="110" cy="300" r="135" fill="url(#dtSun)" /><circle cx="110" cy="300" r="26" fill="#FFE6A8" />
        <rect x="0" y="330" width="390" height="350" fill="url(#dtSea)" />
        <g className="sgDiveLayer" style={{ animation: "sgDiveRays .95s ease-in-out forwards" }}>
          <path d="M120 120 L150 120 L120 360 L98 360 Z" fill="url(#dtRay)" />
          <path d="M210 120 L232 120 L222 360 L196 360 Z" fill="url(#dtRay)" />
          <path d="M290 120 L318 120 L308 360 L274 360 Z" fill="url(#dtRay)" />
        </g>
        <g className="sgDiveLayer" style={{ animation: "sgDiveDots .95s ease-in forwards" }}>
          <g><circle cx="70" cy="392" r="13" fill="#22C55E" opacity=".25" /><circle cx="70" cy="392" r="5" fill="#22C55E" /></g>
          <g><circle cx="232" cy="404" r="12" fill="#E8A800" opacity=".25" /><circle cx="232" cy="404" r="5" fill="#E8A800" /></g>
          <g><circle cx="312" cy="446" r="12" fill="#22C55E" opacity=".25" /><circle cx="312" cy="446" r="5" fill="#22C55E" /></g>
          <g><circle cx="110" cy="476" r="12" fill="#E8522A" opacity=".25" /><circle cx="110" cy="476" r="5" fill="#E8522A" /></g>
          <g><circle cx="276" cy="492" r="12" fill="#22C55E" opacity=".25" /><circle cx="276" cy="492" r="5" fill="#22C55E" /></g>
        </g>
        <g className="sgDiveLayer" style={{ animation: "sgDiveSat .95s ease-in forwards" }}>
          <path d="M300 96 L322 96 L150 348 L120 338 Z" fill="#FFE6A8" opacity=".22" />
          <g transform="translate(300,90)">
            <rect x="-9" y="-7" width="18" height="14" rx="3" fill="#0E2A2E" stroke="#5FD3C9" strokeWidth="1.4" />
            <rect x="-26" y="-4" width="13" height="8" rx="1.5" fill="#173B40" stroke="#2A6B66" strokeWidth="1" />
            <rect x="13" y="-4" width="13" height="8" rx="1.5" fill="#173B40" stroke="#2A6B66" strokeWidth="1" />
            <circle cx="0" cy="0" r="3.4" fill="#FFE6A8" />
          </g>
        </g>
        <g className="sgDiveLayer" style={{ animation: "sgDiveBeach .95s ease-out forwards" }}>
          <path d="M0 520 Q150 496 390 528 L390 680 L0 680 Z" fill="url(#dtSand)" />
          <path d="M0 520 Q150 496 390 528" fill="none" stroke="#FFD884" strokeWidth="1.6" opacity=".30" />
          <path d="M0 540 Q160 520 390 548 L390 566 Q160 540 0 560 Z" fill="#FFB87A" opacity=".14" />
          <g transform="translate(338,540)" fill="#0C1410">
            <path d="M6 0 q-30 -8 -50 10 l5 5 q16 -15 44 -9 z" />
            <path d="M6 -2 q-10 -26 -38 -30 l-1 8 q22 4 32 24 z" />
            <path d="M8 0 q18 -24 36 -22 l3 7 q-15 0 -32 19 z" />
            <path d="M7 -3 q2 -26 20 -38 l6 6 q-15 11 -18 34 z" />
            <path d="M8 0 q28 -10 42 2 l-2 7 q-13 -9 -36 -3 z" />
            <path d="M4 -2 l9 -1 q14 64 9 130 l-12 0 q6 -64 -6 -128 z" />
          </g>
        </g>
      </svg>
      {name && (
        <div className="sgDiveCapBox" style={{ position: "absolute", left: 0, right: 0, bottom: "calc(48px + env(safe-area-inset-bottom))", textAlign: "center", animation: "sgDiveCap .95s ease-out forwards" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "800 17px 'Bricolage Grotesque',system-ui,sans-serif", color: "#EAF7F4", textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: stCol, boxShadow: `0 0 0 3px ${stCol}33` }} />
            {name}<span style={{ fontSize: 12.5, fontWeight: 600, opacity: .72 }}>· {lbl}</span>
          </span>
        </div>
      )}
    </div>
  )
}
