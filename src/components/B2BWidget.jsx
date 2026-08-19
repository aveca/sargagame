/**
 * B2BWidget — Widget embeddable pour hôtels partenaires.
 * Usage : <iframe src="https://sargagame.com/widget?beach=XXX&theme=light">
 * Affiche : nom plage + score du jour + verdict + logo Le Veilleur
 * 
 * Props (via URL params) :
 *   - beach: beach ID (obligatoire)
 *   - theme: 'light' | 'dark' (défaut: 'dark')
 *   - lang: 'fr' | 'en' | 'es' (défaut: détecté via navigator)
 * 
 * Ne contient PAS de logique de paiement — widget gratuit (vitrine B2B).
 * Fetch le score depuis /api/score.php?beach=beachId
 */
import React, { useState, useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'

const VERDICT = {
  clean: { fr: 'PROPRE', en: 'CLEAN', es: 'LIMPIA', color: '#22C55E', emoji: '✅' },
  moderate: { fr: 'MODÉRÉ', en: 'MODERATE', es: 'MODERADO', color: '#B87A00', emoji: '⚠️' },
  avoid: { fr: 'SARGASSES', en: 'SARGASSUM', es: 'SARGAZO', color: '#E8522A', emoji: '🚫' },
  _loading: { fr: 'EN COURS', en: 'LOADING', es: 'CARGANDO', color: '#8b949e', emoji: '⏳' }
}

const STATUS_LABEL = {
  clean: { fr: 'Mer propre', en: 'Clean sea', es: 'Mar limpio' },
  moderate: { fr: 'Sargasses modérées', en: 'Moderate sargassum', es: 'Sargazo moderado' },
  avoid: { fr: 'Évitez l\'eau', en: 'Avoid the water', es: 'Evita el agua' },
  _loading: { fr: 'Chargement…', en: 'Loading…', es: 'Cargando…' }
}

function t(lang, fr, en, es) {
  if (lang === 'es') return es
  if (lang === 'en') return en
  return fr
}

function B2BWidget({ beachId, theme = 'dark', lang = 'fr' }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const palette = useMemo(() => ({
    dark: { bg: '#0d1117', card: '#161b22', text: '#e6edf3', muted: '#8b949e', border: '#30363d', gold: '#FFC72C' },
    light: { bg: '#ffffff', card: '#f6f8fa', text: '#1f2328', muted: '#656d76', border: '#d0d7de', gold: '#E8A800' }
  })[theme])

  useEffect(() => {
    if (!beachId) return
    const controller = new AbortController()
    fetch(`/api/score.php?beach=${encodeURIComponent(beachId)}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error('Score not found')
        return r.json()
      })
      .then(d => setData(d))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [beachId])

  if (!data) {
    const loading = VERDICT._loading
    return (
      <div style={{
        width: '100%', minWidth: 280, maxWidth: 360,
        fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
        background: palette.card, border: `1px solid ${palette.border}`,
        borderRadius: 12, padding: 16,
        color: palette.text, boxShadow: '0 4px 12px rgba(0,0,0,.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${loading.color}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
          @keyframes spin { to { transform: rotate(360deg); } }
          <span style={{ color: palette.muted, fontSize: 13 }}>{t(lang, 'Chargement…', 'Loading…', 'Cargando…')}</span>
        </div>
        <div style={{ fontSize: 11, color: palette.muted, textAlign: 'center' }}>
          {t(lang, 'Données Le Veilleur', 'Data by Le Veilleur', 'Datos de El Vigía')}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        width: '100%', minWidth: 280, maxWidth: 360,
        fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
        background: palette.card, border: `1px solid ${palette.border}`,
        borderRadius: 12, padding: 16,
        color: palette.text, boxShadow: '0 4px 12px rgba(0,0,0,.15)',
        textAlign: 'center'
      }}>
        <span style={{ fontSize: 24 }}>⚠️</span>
        <div style={{ marginTop: 8, fontWeight: 600 }}>{t(lang, 'Données indisponibles', 'Data unavailable', 'Datos no disponibles')}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: palette.muted }}>{error}</div>
        <a href={`https://sargagame.com/plages/${beachId}/`} target="_blank" rel="noopener" style={{ display: 'inline-block', marginTop: 12, color: palette.gold, textDecoration: 'underline', fontSize: 12 }}>
          {t(lang, 'Voir sur Sargagame →', 'View on Sargagame →', 'Ver en Sargagame →')}
        </a>
      </div>
    )
  }

  const verdict = VERDICT[data.status] || VERDICT._loading
  const label = STATUS_LABEL[data.status] || STATUS_LABEL._loading

  return (
    <div style={{
      width: '100%', minWidth: 280, maxWidth: 360,
      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
      background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: 12, overflow: 'hidden',
      color: palette.text, boxShadow: '0 4px 12px rgba(0,0,0,.15)'
    }}>
      {/* Header with Le Veilleur */}
      <div style={{
        background: `linear-gradient(135deg, ${palette.gold}22, ${palette.gold}08)`,
        borderBottom: `1px solid ${palette.border}`,
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: palette.gold }}>
          <circle cx="12" cy="12" r="10" stroke={palette.gold} strokeWidth="2" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke={palette.gold} strokeWidth="2" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="4s" repeatCount="indefinite" />
          </path>
        </svg>
        <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', color: palette.gold }}>
          Le Veilleur
        </span>
      </div>

      {/* Beach name + score */}
      <div style={{ padding: '14px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.2, fontFamily: "'Anton', sans-serif" }}>
            {data.name}
          </h3>
          {typeof data.score === 'number' && (
            <span style={{
              background: palette.gold, color: '#0d1117',
              fontWeight: 800, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
              padding: '2px 8px', borderRadius: 6
            }}>
              {data.score}/100
            </span>
          )}
        </div>

        {/* Verdict */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%',
            background: verdict.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: verdict.color === '#22C55E' ? '#0d1117' : '#fff', fontWeight: 700
          }}>
            {verdict.emoji}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: verdict.color }}>
              {verdict[lang]}
            </div>
            <div style={{ fontSize: 11, color: palette.muted, marginTop: 2 }}>
              {label[lang]}
            </div>
          </div>
        </div>

        {/* Date / freshness */}
        {data.updatedAt && (
          <div style={{ marginTop: 10, fontSize: 11, color: palette.muted }}>
            {t(lang, 'Mis à jour', 'Updated', 'Actualizado')}: {new Date(data.updatedAt).toLocaleString(lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <a
        href={`https://sargagame.com/plages/${beachId}/`}
        target="_blank" rel="noopener"
        style={{
          display: 'block', width: '100%', textAlign: 'center',
          background: `linear-gradient(135deg, ${palette.gold}, #E8A800)`,
          color: '#0d1117', textDecoration: 'none',
          fontWeight: 800, fontSize: 13, padding: '10px 12px',
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          borderRadius: '0 0 12px 12px', marginTop: 'auto'
        }}
      >
        {t(lang, 'Voir le détail →', 'View details →', 'Ver detalle →')}
      </a>
    )
  )
}

export default B2BWidget

// Auto-mount si script chargé en standalone (iframe direct)
if (typeof window !== 'undefined' && document.getElementById('b2b-widget-root')) {
  const params = new URLSearchParams(window.location.search)
  const beachId = params.get('beach')
  const theme = params.get('theme') || 'dark'
  const lang = params.get('lang') || (navigator.language.startsWith('es') ? 'es' : navigator.language.startsWith('en') ? 'en' : 'fr')
  
  if (beachId) {
    createRoot(document.getElementById('b2b-widget-root')).render(
      <B2BWidget beachId={beachId} theme={theme} lang={lang} />
    )
  }
}