/**
 * ShareBeachCard — golden-hour SVG shareable card for any beach.
 * Design matches POSTE_OBSERVATION.md §5 and SCENE_TOKENS.
 * Premium feature: non-premium users see a watermark/upsell.
 */
import React, { useRef, useCallback, useMemo } from "react"
import { _t } from "./Sargasses_PROD.jsx"

/* ── Golden-hour palette (SCENE_TOKENS.phases.golden) ── */
const SKY = ["#0B2230","#155A5A","#C97E3A","#F2B05E"]
const SEA_TOP = "#1A5852"
const SEA_BOT = "#08251F"
const SAND = "#1C1712"
const RIM = "#FFD884"
const GLIT = "#FFD884"
const GOLD = "#FFC72C"
const INK = "#0D0D0D"

/* ── Status colors ── */
const ST_COLORS = {
  clean: { c: "#27c46b", bg: "rgba(39,196,107,.18)" },
  moderate: { c: "#B87A00", bg: "rgba(184,122,0,.18)" },
  avoid: { c: "#e8322a", bg: "rgba(232,50,42,.18)" },
}
const ST_LABELS = {
  clean: { fr: "Propre", en: "Clean", es: "Limpia" },
  moderate: { fr: "Modéré", en: "Moderate", es: "Moderado" },
  avoid: { fr: "À éviter", en: "Avoid", es: "Evitar" },
}

/* ── Sizes ── */
const SIZE = {
  story: { w: 1080, h: 1920, vb: "0 0 1080 1920" },
  square: { w: 1080, h: 1080, vb: "0 0 1080 1080" },
  landscape: { w: 1920, h: 1080, vb: "0 0 1920 1080" },
}

/* ── i18n helpers for this component ── */
const TI = (lang, fr, en, es) => _t(lang, fr, en, es)

/* ── Forecast day label ── */
const DAY_ABBR = {
  fr: ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],
  en: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
  es: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],
}

/* ── Get status label ── */
function statusLabel(status, lang) {
  const s = ST_LABELS[status] || ST_LABELS.moderate
  return s[lang] || s.fr
}

/* ── Format freshness ── */
function freshnessLabel(hours, lang) {
  if (hours < 1.5) return TI(lang, "À l'instant", "Just now", "Ahora")
  const h = Math.round(hours)
  return TI(lang, `Il y a ${h}h`, `${h}h ago`, `Hace ${h}h`)
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG Scene builders
   ═══════════════════════════════════════════════════════════════════════ */

function SkyGradient(id) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={SKY[0]} />
        <stop offset=".35" stopColor={SKY[1]} />
        <stop offset=".7" stopColor={SKY[2]} />
        <stop offset="1" stopColor={SKY[3]} />
      </linearGradient>
      <linearGradient id="sg-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={SEA_TOP} />
        <stop offset="1" stopColor={SEA_BOT} />
      </linearGradient>
    </defs>
  )
}

function Sun() {
  return (
    <g>
      <circle cx="540" cy="480" r="160" fill={GLIT} opacity=".06" />
      <circle cx="540" cy="480" r="90" fill={GLIT} opacity=".1" />
      <path d="M470 482 a70 70 0 0 1 140 0 Z" fill={GLIT} opacity=".85" />
      {[-60,-30,0,30,60].map((a,i) => (
        <path key={i} d="M540 480 L526 240 L554 240 Z" fill={GLIT} opacity=".08" transform={`rotate(${a} 540 480)`} />
      ))}
    </g>
  )
}

function Clouds() {
  return (
    <g>
      <path d="M180 180 q18 -34 62 -34 q22 -22 56 -16 q38 -10 54 18 q32 4 36 32 Z" fill="#10333E" opacity=".75" />
      <path d="M182 181 h198" stroke={RIM} strokeWidth="2" opacity=".24" />
      <path d="M720 130 q16 -28 54 -28 q22 -18 52 -12 q32 -10 48 16 q28 2 34 24 Z" fill="#10333E" opacity=".65" />
      <path d="M722 131 h144" stroke={RIM} strokeWidth="2" opacity=".2" />
    </g>
  )
}

function LeVeilleurSatellite({x=720,y=160,size=1}) {
  return (
    <g transform={`translate(${x},${y}) scale(${size})`}>
      <path d="M0 0 L-48 290 L48 290 Z" fill={GLIT} opacity=".08" />
      <rect x="-18" y="-4" width="12" height="8" rx="2" fill={RIM} opacity=".8" />
      <rect x="10" y="-4" width="12" height="8" rx="2" fill={RIM} opacity=".8" />
      <rect x="-8" y="-9" width="16" height="16" rx="4" fill="#5b3a8e" />
      <rect x="-8" y="-9" width="16" height="5" rx="4" fill={GOLD} />
      <circle cx="0" cy="1.5" r="4" fill="#07201E" />
      <circle cx="0" cy="1.5" r="2.8" fill={GLIT} />
    </g>
  )
}

function WavePattern({w=1080,seaTop=380}) {
  const waves = []
  for (let i = 0; i < 5; i++) {
    const y = seaTop + 20 + i * 28
    const amp = 18 + i * 4
    const freq = 120 + i * 30
    const d = []
    d.push(`M0 ${y}`)
    for (let x = 0; x <= w; x += 20) {
      const py = y + Math.sin((x + i * 40) / freq) * amp * 0.6 + Math.sin((x + i * 20) / (freq * 0.6)) * amp * 0.4
      d.push(`L${x} ${py}`)
    }
    waves.push(
      <path key={i} d={d.join(" ")} fill="none" stroke={i < 2 ? GLIT : RIM} strokeWidth={1.6 - i * 0.25} opacity={0.35 - i * 0.05} />
    )
  }
  return <g>{waves}</g>
}

function ScoreCircle({score=70,cx=540,cy=820,r=88,status="moderate",lang="fr"}) {
  const st = ST_COLORS[status] || ST_COLORS.moderate
  const circum = 2 * Math.PI * r
  const offset = circum * (1 - Math.min(100, Math.max(0, score)) / 100)
  const label = statusLabel(status, lang)
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 12} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={st.c} strokeWidth="10" strokeDasharray={circum}
        strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="central"
        fontFamily="'Anton',sans-serif" fontSize="64" fill="#fff" fontWeight="400">
        {score}
      </text>
      <text x={cx} y={cy + 56} textAnchor="middle" dominantBaseline="central"
        fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="18" fill={st.c} fontWeight="700">
        /100
      </text>
      <text x={cx} y={cy + 96} textAnchor="middle" dominantBaseline="central"
        fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="22" fill={st.c} fontWeight="700">
        {label}
      </text>
    </g>
  )
}

function BeachName({name, cx=540, y=1140}) {
  const words = (name || "").toUpperCase().split(" ")
  const lines = []
  let line = ""
  // rough char count per line (Anton 96px monospace-ish ~44ch at 1080px width)
  for (const w of words) {
    const t = line ? line + " " + w : w
    if (t.length > 18 && line) { lines.push(line); line = w }
    else line = t
  }
  if (line) lines.push(line)
  const slice = lines.slice(0, 3)
  return (
    <g>
      {slice.map((l, i) => (
        <text key={i} x={cx} y={y + i * 110} textAnchor="middle" dominantBaseline="central"
          fontFamily="'Anton',sans-serif" fontSize="86" fill="#fff" fontWeight="400" letterSpacing="2">
          {l}
        </text>
      ))}
    </g>
  )
}

function ForecastDots({weekly=[], lang="fr", cx=540, y=1380}) {
  if (!weekly || !weekly.length) return null
  const n = Math.min(weekly.length, 7)
  const gap = 70
  const startX = cx - ((n - 1) * gap) / 2
  const now = new Date()
  return (
    <g>
      {weekly.slice(0, n).map((d, i) => {
        const st = ST_COLORS[d.status] || ST_COLORS.moderate
        const dayDate = new Date(now)
        dayDate.setDate(dayDate.getDate() + i)
        const dayLabel = d.day || DAY_ABBR[lang]?.[dayDate.getDay()] || ""
        const x = startX + i * gap
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="18" fill={st.c} opacity=".85" />
            <text x={x} y={y + 44} textAnchor="middle" dominantBaseline="central"
              fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="14" fill="rgba(255,255,255,.7)" fontWeight="600">
              {dayLabel}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function FreshnessBadge({hours, lang="fr", x=40, y=80, align="start"}) {
  const label = freshnessLabel(hours, lang)
  const anchor = align === "end" ? "end" : "start"
  const xPos = align === "end" ? 1040 : x
  return (
    <g>
      <rect x={align === "end" ? 1040 - 190 : x} y={y - 16} width="200" height="32" rx="16"
        fill="rgba(0,0,0,.35)" />
      <text x={xPos + (align === "end" ? 95 : 100)} y={y + 1} textAnchor="middle" dominantBaseline="central"
        fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="13" fill="rgba(255,255,255,.8)" fontWeight="600">
        {"🛰️ " + label}
      </text>
    </g>
  )
}

function Branding({lang="fr", x=540, y=1840}) {
  const tagline = TI(lang,
    "il regarde la mer, jamais ses clients",
    "He watches the sea, never his clients",
    "Mira el mar, nunca a sus clientes")
  return (
    <g>
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontFamily="'Anton',sans-serif" fontSize="16" fill={GOLD} fontWeight="400" letterSpacing="3" opacity=".6">
        S A R G A S S E S
      </text>
      <text x={x} y={y + 34} textAnchor="middle" dominantBaseline="central"
        fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="13" fill="rgba(255,255,255,.45)" fontWeight="500" fontStyle="italic">
        {tagline}
      </text>
    </g>
  )
}

/* ── Premium watermark overlay ── */
function PremiumWatermark({lang="fr"}) {
  const msg = TI(lang,
    "Premium — débloque le partage",
    "Premium — unlock sharing",
    "Premium — desbloquea compartir")
  return (
    <g>
      <rect x="0" y="0" width="1080" height="1920" fill="rgba(0,0,0,.55)" />
      <g transform="translate(540,960)">
        <rect x="-180" y="-70" width="360" height="140" rx="20" fill="rgba(255,199,44,.12)" stroke={GOLD} strokeWidth="2" />
        <text x="0" y="-6" textAnchor="middle" dominantBaseline="central"
          fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="22" fill={GOLD} fontWeight="700">
          ⭐ {msg}
        </text>
        <text x="0" y="30" textAnchor="middle" dominantBaseline="central"
          fontFamily="'Bricolage Grotesque',system-ui,sans-serif" fontSize="14" fill="rgba(255,255,255,.6)" fontWeight="500">
          {TI(lang, "Passe Premium pour partager", "Go Premium to share", "Hazte Premium para compartir")}
        </text>
      </g>
    </g>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Main SVG card
   ═══════════════════════════════════════════════════════════════════════ */

function ShareCardSVG({beach, weekly, lang="fr", premium=false, size="story"}) {
  const dim = SIZE[size] || SIZE.story
  const vb = dim.vb
  const cx = dim.w / 2
  const score = typeof beach?.score === "number" ? beach.score : null
  const status = beach?.status || "moderate"
  const seaTop = dim.h * 0.2
  const sandTop = dim.h * 0.52
  const scoreY = dim.h * 0.38
  const nameY = dim.h * 0.6
  const forecastY = dim.h * 0.76
  const brandingY = dim.h * 0.94
  const satelliteY = dim.h * 0.08
  const w = dim.w
  const hours = beach?.dataAgeMinutes != null ? beach.dataAgeMinutes / 60 : null

  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block", background: SKY[0] }}>
      <SkyGradient id="sg-sky" />
      <rect x="0" y="0" width={w} height={seaTop} fill="url(#sg-sky)" />
      <Sun />
      <Clouds />
      <LeVeilleurSatellite x={w * 0.85} y={satelliteY} size={w > 1500 ? 1.4 : 1.1} />
      <rect x="0" y={seaTop} width={w} height={sandTop - seaTop} fill="url(#sg-sea)" />
      <WavePattern w={w} seaTop={seaTop} />
      <line x1="0" y1={seaTop} x2={w} y2={seaTop} stroke={RIM} strokeWidth="2" opacity=".3" />
      <path d={`M0 ${sandTop} Q${w*0.25} ${sandTop - 20} ${w*0.5} ${sandTop - 6} Q${w*0.75} ${sandTop + 10} ${w} ${sandTop - 8} L${w} ${dim.h} L0 ${dim.h} Z`} fill={SAND} />
      <path d={`M0 ${sandTop} Q${w*0.25} ${sandTop - 20} ${w*0.5} ${sandTop - 6} Q${w*0.75} ${sandTop + 10} ${w} ${sandTop - 8}`} fill="none" stroke={RIM} strokeWidth="2.5" opacity=".3" />
      {score != null && <ScoreCircle score={score} cx={cx} cy={scoreY} status={status} lang={lang} />}
      <BeachName name={beach?.name} cx={cx} y={nameY} />
      {premium && weekly && <ForecastDots weekly={weekly} lang={lang} cx={cx} y={forecastY} />}
      {hours != null && <FreshnessBadge hours={hours} lang={lang} x={40} y={60} />}
      <Branding lang={lang} x={cx} y={brandingY} />
      {!premium && <PremiumWatermark lang={lang} />}
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   React component wrapper
   ═══════════════════════════════════════════════════════════════════════ */

export default function ShareBeachCard({beach, sargData, lang="fr", premium=false, size="story", onShare}) {
  const svgRef = useRef(null)
  const dim = SIZE[size] || SIZE.story

  const weekly = useMemo(() => {
    if (!sargData?.weekly) return null
    return sargData.weekly.slice(0, 7)
  }, [sargData])

  const handleShare = useCallback(async () => {
    if (onShare) { onShare(); return }
    try {
      const slug = beach?.slug || ""
      const url = `${window.location.origin}${window.location.pathname}?ref=share&beach=${slug}`
      const shareTxt = TI(lang,
        `${beach?.name || "Ma plage"} aujourd'hui — vu par le Veilleur 🛰️`,
        `${beach?.name || "My beach"} today — seen by the Watchman 🛰️`,
        `${beach?.name || "Mi playa"} hoy — visto por el Vigía 🛰️`)
      if (navigator.share) {
        try { await navigator.share({ title: shareTxt, url }) }
        catch (e) { if (e?.name !== "AbortError") throw e }
      } else {
        try { await navigator.clipboard.writeText(url) } catch (_) {}
      }
    } catch (_) {}
  }, [beach, lang, onShare])

  const handleDownload = useCallback(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    const clone = svgEl.cloneNode(true)
    const s = new XMLSerializer()
    const str = s.serializeToString(clone)
    const blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `plage-${beach?.slug || "partage"}.svg`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, [beach])

  const premiumLabel = TI(lang,
    premium ? "⭐ Premium" : "⭐ Premium — partagez cette plage",
    premium ? "⭐ Premium" : "⭐ Premium — share this beach",
    premium ? "⭐ Premium" : "⭐ Premium — comparte esta playa")

  return (
    <div style={{
      width: "100%", maxWidth: dim.w + "px", margin: "0 auto",
      fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
    }}>
      <div style={{
        position: "relative", width: "100%", aspectRatio: `${dim.w}/${dim.h}`,
        borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,.3)",
      }}>
        <div ref={svgRef} style={{ width: "100%", height: "100%" }}>
          <ShareCardSVG beach={beach} weekly={weekly} lang={lang} premium={premium} size={size} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={handleShare} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "12px 24px", borderRadius: 100,
          border: "none", background: GOLD, color: INK,
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
          boxShadow: "0 4px 16px rgba(255,199,44,.3)",
        }}>
          {TI(lang, "Partager", "Share", "Compartir")}
        </button>
        <button onClick={handleDownload} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "12px 24px", borderRadius: 100,
          border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)",
          color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
          fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
        }}>
          {TI(lang, "Télécharger", "Download", "Descargar")}
        </button>
      </div>
      <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "rgba(255,255,255,.5)", fontWeight: 500 }}>
        {premiumLabel}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   getShareImage — returns SVG string for external use (e.g. email, save)
   ═══════════════════════════════════════════════════════════════════════ */

export function getShareImage(beach, lang="fr", premium=false, size="story") {
  const dim = SIZE[size] || SIZE.story
  const cx = dim.w / 2
  const seaTop = dim.h * 0.2
  const sandTop = dim.h * 0.52
  const scoreY = dim.h * 0.38
  const nameY = dim.h * 0.6
  const forecastY = dim.h * 0.76
  const brandingY = dim.h * 0.94
  const satelliteY = dim.h * 0.08
  const score = typeof beach?.score === "number" ? beach.score : null
  const status = beach?.status || "moderate"
  const hours = beach?.dataAgeMinutes != null ? beach.dataAgeMinutes / 60 : null
  const weekly = beach?.weekly || []
  const w = dim.w

  const sunObj = `<circle cx="${w*0.5}" cy="${seaTop + 80}" r="${Math.round(w*0.148)}" fill="${GLIT}" opacity=".06"/>
<circle cx="${w*0.5}" cy="${seaTop + 80}" r="${Math.round(w*0.083)}" fill="${GLIT}" opacity=".1"/>
<path d="M${cx - 70} ${seaTop + 82} a70 70 0 0 1 140 0 Z" fill="${GLIT}" opacity=".85"/>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="${dim.vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="${dim.w}" height="${dim.h}">
  <defs>
    <linearGradient id="sgs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="${SKY[0]}"/>
      <stop offset=".35" stopColor="${SKY[1]}"/>
      <stop offset=".7" stopColor="${SKY[2]}"/>
      <stop offset="1" stopColor="${SKY[3]}"/>
    </linearGradient>
    <linearGradient id="sgse" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="${SEA_TOP}"/>
      <stop offset="1" stopColor="${SEA_BOT}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${seaTop}" fill="url(#sgs)"/>
  ${sunObj}
  <rect x="0" y="${seaTop}" width="${w}" height="${sandTop - seaTop}" fill="url(#sgse)"/>
  <line x1="0" y1="${seaTop}" x2="${w}" y2="${seaTop}" stroke="${RIM}" strokeWidth="2" opacity=".3"/>
  <path d="M0 ${sandTop} Q${w*0.25} ${sandTop - 20} ${w*0.5} ${sandTop - 6} Q${w*0.75} ${sandTop + 10} ${w} ${sandTop - 8} L${w} ${dim.h} L0 ${dim.h} Z" fill="${SAND}"/>
  <path d="M0 ${sandTop} Q${w*0.25} ${sandTop - 20} ${w*0.5} ${sandTop - 6} Q${w*0.75} ${sandTop + 10} ${w} ${sandTop - 8}" fill="none" stroke="${RIM}" strokeWidth="2.5" opacity=".3"/>
  ${score != null ? `<circle cx="${cx}" cy="${scoreY + 12}" r="100" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2"/>
<circle cx="${cx}" cy="${scoreY + 12}" r="88" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10"/>
<circle cx="${cx}" cy="${scoreY + 12}" r="88" fill="none" stroke="${ST_COLORS[status].c}" strokeWidth="10" stroke-dasharray="552.92" stroke-dashoffset="${552.92 * (1 - Math.min(100, Math.max(0, score)) / 100)}" stroke-linecap="round" transform="rotate(-90 ${cx} ${scoreY + 12})"/>
<text x="${cx}" y="${scoreY + 18}" text-anchor="middle" dominant-baseline="central" font-family="'Anton',sans-serif" font-size="64" fill="#fff" font-weight="400">${score}</text>
<text x="${cx}" y="${scoreY + 66}" text-anchor="middle" dominant-baseline="central" font-family="'Bricolage Grotesque',system-ui,sans-serif" font-size="18" fill="${ST_COLORS[status].c}" font-weight="700">/100</text>` : ""}
  <text x="${cx}" y="${nameY}" text-anchor="middle" dominant-baseline="central" font-family="'Anton',sans-serif" font-size="86" fill="#fff" font-weight="400" letter-spacing="2">${(beach?.name || "").toUpperCase()}</text>
  ${hours != null ? `<rect x="40" y="44" width="200" height="32" rx="16" fill="rgba(0,0,0,.35)"/><text x="140" y="61" text-anchor="middle" dominant-baseline="central" font-family="'Bricolage Grotesque',system-ui,sans-serif" font-size="13" fill="rgba(255,255,255,.8)" font-weight="600">🛰️ ${freshnessLabel(hours, lang)}</text>` : ""}
  ${premium && weekly.length ? weekly.slice(0, 7).map((d, i) => {
    const gap = 70, n = Math.min(weekly.length, 7)
    const sx = cx - ((n - 1) * gap) / 2
    return `<circle cx="${sx + i * gap}" cy="${forecastY}" r="18" fill="${ST_COLORS[d.status || "moderate"].c}" opacity=".85"/>
<text x="${sx + i * gap}" y="${forecastY + 44}" text-anchor="middle" dominant-baseline="central" font-family="'Bricolage Grotesque',system-ui,sans-serif" font-size="14" fill="rgba(255,255,255,.7)" font-weight="600">${d.day || ""}</text>`
  }).join("\n  ") : ""}
  <text x="${cx}" y="${brandingY}" text-anchor="middle" dominant-baseline="central" font-family="'Anton',sans-serif" font-size="16" fill="${GOLD}" font-weight="400" letter-spacing="2" opacity=".6">S A R G A S S E S</text>
  <text x="${cx}" y="${brandingY + 34}" text-anchor="middle" dominant-baseline="central" font-family="'Bricolage Grotesque',system-ui,sans-serif" font-size="13" fill="rgba(255,255,255,.35)" font-weight="500" font-style="italic">
    ${lang === "en" ? "He watches the sea" : lang === "es" ? "Mira el mar" : "il regarde la mer"}
  </text>
  ${!premium ? `<rect x="0" y="0" width="${dim.w}" height="${dim.h}" fill="rgba(0,0,0,.55)"/>` : ""}
</svg>`
}
