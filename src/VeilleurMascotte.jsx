import { h } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'

const MOOD_COLORS = {
  calm: { primary: '#22C55E', glow: 'rgba(34,197,94,.3)', label: 'calme' },
  scan: { primary: '#FFC72C', glow: 'rgba(255,199,44,.3)', label: 'scan' },
  alert: { primary: '#E8522A', glow: 'rgba(232,82,42,.3)', label: 'alerte' },
}

const VeilleurMascotte = ({ score, cursorPos, dataFreshness, size = 48, mood: moodProp }) => {
  const mood = moodProp || (score >= 70 ? 'calm' : score >= 40 ? 'scan' : 'alert')
  const c = MOOD_COLORS[mood]
  const fresh = dataFreshness !== undefined && dataFreshness < 12
  const rotate = cursorPos ? Math.atan2(cursorPos.y, cursorPos.x) * (180 / Math.PI) * 0.15 : 0

  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <style>{`
        @keyframes vmb{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
        @keyframes vmbFast{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
        @keyframes vmLens{0%,95%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}
        @keyframes vmGlow{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.7;transform:scale(1.1)}}
        @media(prefers-reduced-motion:reduce){.vm-a{animation:none!important}}
      `}</style>
      {/* Halo — data freshness glow */}
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
        {fresh && (
          <circle cx="50" cy="50" r="42" fill="none" stroke={c.primary} strokeWidth="2"
            opacity=".25" className="vm-a"
            style={{ animation: 'vmGlow 3s ease-in-out infinite' }} />
        )}
      </svg>
      {/* Satellite SVG */}
      <svg width={size} height={size} viewBox="0 0 100 100"
        className="vm-a"
        style={{
          position: 'relative', zIndex: 1,
          animation: mood === 'alert' ? 'vmbFast 2s ease-in-out infinite' : 'vmb 4s ease-in-out infinite',
        }}>
        <g transform={`rotate(${rotate}, 50, 50)`}>
          {/* Solar panels */}
          <rect x="18" y="30" width="12" height="6" rx="1" fill="#FFC72C" />
          <rect x="18" y="50" width="12" height="6" rx="1" fill="#FFC72C" />
          <rect x="70" y="30" width="12" height="6" rx="1" fill="#FFC72C" />
          <rect x="70" y="50" width="12" height="6" rx="1" fill="#FFC72C" />
          {/* Panel connectors */}
          <line x1="30" y1="33" x2="38" y2="33" stroke="#5A5A5A" strokeWidth="2" />
          <line x1="30" y1="53" x2="38" y2="53" stroke="#5A5A5A" strokeWidth="2" />
          <line x1="62" y1="33" x2="70" y2="33" stroke="#5A5A5A" strokeWidth="2" />
          <line x1="62" y1="53" x2="70" y2="53" stroke="#5A5A5A" strokeWidth="2" />
          {/* Body */}
          <rect x="38" y="24" width="24" height="40" rx="6" fill="#0d1117" stroke={c.primary} strokeWidth="1.5" />
          {/* Antenna */}
          <line x1="50" y1="12" x2="50" y2="24" stroke="#5A5A5A" strokeWidth="2" />
          <circle cx="50" cy="10" r="3" fill={c.primary} className="vm-a"
            style={{ animation: mood === 'alert' ? 'vmGlow 1.5s ease-in-out infinite' : 'none' }} />
          {/* Lens / eye */}
          <ellipse cx="50" cy="42" rx="6" ry="4" fill={c.primary} opacity=".6"
            className="vm-a" style={{ animation: 'vmLens 6s ease-in-out infinite' }} />
          {/* Decorative line */}
          <line x1="42" y1="56" x2="58" y2="56" stroke={c.primary} strokeWidth="1.5" opacity=".4" />
        </g>
      </svg>
    </div>
  )
}

export default VeilleurMascotte
