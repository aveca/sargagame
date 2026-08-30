import React, { useState, useEffect } from "react"
import { track, _t } from "../Sargasses_PROD.jsx"

const REGIONS = [
  { domain: 'sargasses-martinique.com', label: 'Martinique', flag: '🇲🇶' },
  { domain: 'sargasses-guadeloupe.com', label: 'Guadeloupe', flag: '🇬🇵' },
  { domain: 'sargassumcancun.com', label: 'Cancún', flag: '🇲🇽' },
  { domain: 'sargazotulum.com', label: 'Tulum', flag: '🇲🇽' },
  { domain: 'sargassumpuntacana.com', label: 'Punta Cana', flag: '🇩🇴' },
  { domain: 'sargassummiami.com', label: 'Miami', flag: '🇺🇸' },
]

const VISITED_KEY = "sg_visited_regions"
const CROSS_SELL_DISMISSED_KEY = "sg_cross_sell_dismissed"

export default function RegionNav() {
  const current = typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : ''
  const [showCrossSell, setShowCrossSell] = useState(false)

  useEffect(() => {
    try {
      const visited = JSON.parse(localStorage.getItem(VISITED_KEY) || '[]')
      if (!visited.includes(current) && current) {
        const updated = [...visited, current]
        localStorage.setItem(VISITED_KEY, JSON.stringify(updated))
      }
      const dismissed = localStorage.getItem(CROSS_SELL_DISMISSED_KEY)
      if (!dismissed && updated && updated.length >= 2) {
        setShowCrossSell(true)
      }
    } catch (_) {}
  }, [current])

  const handleRegionClick = (targetDomain) => {
    track("sg_region_nav_click", { from: current, to: targetDomain })
  }

  const dismissCrossSell = () => {
    try { localStorage.setItem(CROSS_SELL_DISMISSED_KEY, "1") } catch (_) {}
    setShowCrossSell(false)
  }

  const lang = (() => { try { const p = window.location.pathname; if (p.startsWith("/es")) return "es"; if (p.startsWith("/en")) return "en"; return "fr" } catch { return "fr" } })()

  return (
    <>
      <div style={{
        background: 'linear-gradient(135deg, #0a5c4a, #0d7f63)',
        padding: '10px 16px',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <span style={{fontSize: 13, color: '#b8f0dd', whiteSpace: 'nowrap', fontWeight: 600}}>🌍 SargaGame Network —</span>
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center'}}>
          {REGIONS.map(r => {
            const isCurrent = r.domain === current
            return (
              <a key={r.domain} href={`https://${r.domain}`}
                onClick={() => handleRegionClick(r.domain)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  fontSize: 13,
                  color: 'white',
                  textDecoration: 'none',
                  background: isCurrent ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)',
                  fontWeight: isCurrent ? 700 : 400,
                  pointerEvents: isCurrent ? 'none' : 'auto',
                }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
              >
                {r.flag} {r.label}{isCurrent ? ' (you are here)' : ''}
              </a>
            )
          })}
        </div>
      </div>

      {showCrossSell && (
        <div style={{
          position: 'relative',
          margin: '8px auto 0',
          maxWidth: 600,
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(124, 58, 237, 0.3)',
          color: 'white',
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          textAlign: 'center',
          animation: 'slideDown .3s ease'
        }}>
          <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap'}}>
            <span style={{fontSize: 16}}>🌍</span>
            <span style={{font: '600 13px/1.3 "Bricolage Grotesque"', flex: 1, minWidth: 200}}>
              {_t(lang, "Vous consultez plusieurs régions? Découvrez notre plan multi-région Enterprise →", "Checking multiple regions? Discover our multi-region Enterprise plan →", "¿Consultas varias regiones? Descubre nuestro plan multi-región Enterprise →")}
            </span>
            <a href="/b2b" onClick={(e) => { track("sg_cross_sell_click", { from: current, visited: JSON.parse(localStorage.getItem(VISITED_KEY) || '[]') }) }} style={{
              padding: '6px 14px', borderRadius: 8, border: '2px solid white',
              background: 'rgba(255,255,255,0.2)', color: 'white',
              font: '700 12px/1 "Bricolage Grotesque"', textDecoration: 'none', whiteSpace: 'nowrap'
            }}>
              {_t(lang, "Voir l'offre →", "See offer →", "Ver oferta →")}
            </a>
            <button onClick={dismissCrossSell} aria-label={_t(lang, "Fermer", "Close", "Cerrar")} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
              borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
            }}>✕</button>
          </div>
        </div>
      )}
    </>
  )
}