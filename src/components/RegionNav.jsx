import React, { useState, useEffect } from "react"
import { track, _t } from "../Sargasses_PROD.jsx"
import { RegionCode } from "./ComicIcons.jsx"

// SPRINT 2 R1 : flags emoji OS → pastilles code (RegionCode). Champs `flag`
// conservés en donnée morte (revert instantané), jamais rendus.
//
// Statuts LIVE vérifiés par probe réel 2026-09-15 (API /api/copernicus/sargassum.json
// × domaine) : les 6 domaines pleins servent une donnée fraîche (<12h, 200).
// HT/LC/BB = SANS pipeline live propre (leur json = 404, pages d'expansion sans NDD)
// → rendu « bientôt » explicite (opacité réduite + mention), jamais confusionnels
// avec les territoires opérationnels. Rollback visuel : ?sguxlot6=0 (inchangé).
const REGIONS = [
  { domain: 'sargasses-martinique.com', label: 'Martinique', code: 'MQ', flag: '🇲🇶', live: true },
  { domain: 'sargasses-guadeloupe.com', label: 'Guadeloupe', code: 'GP', flag: '🇬🇵', live: true },
  { domain: 'sargassumcancun.com', label: 'Cancún', code: 'RM', flag: '🇲🇽', live: true },
  { domain: 'sargazotulum.com', label: 'Tulum', code: 'TL', flag: '🇲🇽', live: true },
  { domain: 'sargassumpuntacana.com', label: 'Punta Cana', code: 'PC', flag: '🇩🇴', live: true },
  { domain: 'sargassummiami.com', label: 'Miami', code: 'FL', flag: '🇺🇸', live: true },
  // expansion sans NDD (pages marketing hébergées sur puntacana.com)
  { domain: 'sargassumpuntacana.com/haiti', label: 'Haïti', code: 'HT', flag: '🇭🇹', live: false },
  { domain: 'sargassumpuntacana.com/sainte-lucie', label: 'Sainte-Lucie', code: 'LC', flag: '🇱🇨', live: false },
  { domain: 'sargassumpuntacana.com/barbade', label: 'Barbade', code: 'BB', flag: '🇧🇧', live: false },
]

const VISITED_KEY = "sg_visited_regions"
const CROSS_SELL_DISMISSED_KEY = "sg_cross_sell_dismissed"

export default function RegionNav({inline=false}) {
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
  // Lot 6 — grille compacte ≤480px. Rollback ?sguxlot6=0.
  const uxLot6 = (()=>{try{return !/[?&]sguxlot6=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()

  const baseStyle = {
    background: 'linear-gradient(135deg, var(--sg-teal-deep,#0a5c4a), var(--sg-teal-deep-2,#0d7f63))',
    padding: '4px 8px',
    display: 'flex',
    gap: 6,
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
    minHeight: 34,
  }

  const wrapperStyle = inline ? baseStyle : {
    ...baseStyle,
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    borderBottom: '1px solid rgba(255,255,255,.07)'
  }

  return (
    <>
      <div style={wrapperStyle}>
        <span className={uxLot6?"sg-regionnav-title":undefined} style={{fontSize: 10, color: '#b8f0dd', whiteSpace: 'nowrap', fontWeight: 600, flexShrink: 0}} aria-hidden="true">SargaGame —</span>
        <div className={uxLot6?"sg-regionnav-chips":undefined} style={{display: 'flex', gap: 5, flexWrap: 'nowrap', alignItems: 'center'}}>
          {REGIONS.map(r => {
            const isCurrent = r.domain === current
            const isLive = r.live !== false
            return (
              <a key={r.domain} href={`https://${r.domain}`}
                aria-current={isCurrent ? 'page' : undefined}
                title={isLive ? r.label : `${r.label} — ${_t(lang, 'suivi satellite en préparation', 'satellite tracking in prep', 'seguimiento en preparación')}`}
                onClick={() => handleRegionClick(r.domain)}
                data-live={isLive ? 'yes' : 'soon'}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  color: isLive ? 'white' : 'rgba(255,255,255,0.62)',
                  textDecoration: 'none',
                  background: isCurrent ? 'rgba(255,255,255,0.32)' : isLive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
                  border: isLive ? '1px solid transparent' : '1px dashed rgba(255,255,255,0.35)',
                  fontWeight: isCurrent ? 700 : isLive ? 500 : 400,
                  pointerEvents: isCurrent ? 'none' : 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = isLive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)' }}
              >
                <RegionCode code={r.code} />{r.label}{isCurrent ? ` ${_t(lang,'(ici)','(here)','(aquí)')}` : ''}{!isLive && <span style={{fontSize: 9, fontStyle: 'italic', opacity: .85}}>&nbsp;{_t(lang, 'bientôt', 'soon', 'pronto')}</span>}
              </a>
            )
          })}
        </div>
      </div>

      {showCrossSell && (
        <div style={{
          position: 'relative',
          margin: '4px auto 0',
          maxWidth: 560,
          padding: '8px 12px',
          background: 'linear-gradient(180deg, var(--sg-brand-soft,#FFE47A), var(--sg-brand-strong,#FFC72C))',
          border: '2px solid #0D0D0D',
          borderRadius: 12,
          boxShadow: '3px 3px 0 #0D0D0D',
          color: '#0D0D0D',
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          textAlign: 'center',
          animation: 'slideDown .2s ease'
        }}>
          <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap'}}>
            <span style={{fontSize: 16}} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg></span>
            <span style={{font: '600 13px/1.3 "Bricolage Grotesque"', flex: 1, minWidth: 200}}>
              {_t(lang, "Vous consultez plusieurs régions? Découvrez notre plan multi-région Enterprise →", "Checking multiple regions? Discover our multi-region Enterprise plan →", "¿Consultas varias regiones? Descubre nuestro plan multi-región Enterprise →")}
            </span>
            <a href="/b2b" onClick={(e) => { track("sg_cross_sell_click", { from: current, visited: JSON.parse(localStorage.getItem(VISITED_KEY) || '[]') }) }} style={{
              padding: '6px 14px', borderRadius: 8, border: '2.5px solid #0D0D0D',
              background: '#0D0D0D', color: '#FFC72C',
              font: '700 12px/1 "Bricolage Grotesque"', textDecoration: 'none', whiteSpace: 'nowrap'
            }}>
              {_t(lang, "Voir l'offre →", "See offer →", "Ver oferta →")}
            </a>
            <button onClick={dismissCrossSell} aria-label={_t(lang, "Fermer", "Close", "Cerrar")} style={{
              background: 'transparent', border: '2px solid #0D0D0D', color: '#0D0D0D',
              borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
            }}>✕</button>
          </div>
        </div>
      )}
    </>
  )
}
