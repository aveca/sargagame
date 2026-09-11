/**
 * Enhanced Alternatives Panel — 3 alternatives with distance, risk, confidence, reason
 * Replaces the simple planB list in BeachSheet and BeachSheetComic
 */

import { useMemo } from 'react';
import { findAlternatives, buildVerdictDetail, getVerdictLabel } from '../lib/beach-decision.js';

const _t = (lang, fr, en, es) => {
  switch (lang) {
    case 'en': return en;
    case 'es': return es;
    default: return fr;
  }
};

/**
 * Enhanced alternatives panel with full metadata
 * Shows up to 3 alternatives with distance, drive time, confidence, freshness, reason
 */
export function EnhancedAlternativesPanel({ 
  beach, 
  allBeaches, 
  lang = 'fr', 
  onBeachClick, 
  track,
  status,
  compact = false 
}) {
  const alternatives = useMemo(() => {
    if (!beach || !allBeaches?.length) return [];
    // Show alternatives for avoid/moderate, or when explicitly requested
    const showAlts = status === 'avoid' || status === 'moderate';
    if (!showAlts) return [];
    return findAlternatives(beach, allBeaches, { lang, maxAlternatives: 3 });
  }, [beach, allBeaches, lang, status]);

  if (alternatives.length === 0) {
    // Honest fallback — no clean/moderate alternative nearby
    if (status === 'avoid' || status === 'moderate') {
      return (
        <div className="enhanced-alts-fallback" style={{
          padding: '12px 14px',
          marginBottom: 14,
          background: '#FFF8E1',
          border: '2px solid #F59E0B',
          borderRadius: 12,
          fontFamily: "'Bricolage Grotesque',sans-serif"
        }}>
          <div style={{ 
            font: '800 12px/1 "Bricolage Grotesque"', 
            color: '#92400E', 
            marginBottom: 6 
          }}>
            {_t(lang, 'Pas d\'alternative propre à proximité aujourd\'hui', 'No clean alternative nearby today', 'Sin alternativa limpia cerca hoy')}
          </div>
          <div style={{ 
            font: '12px/1.4 "Bricolage Grotesque"', 
            color: '#B45309' 
          }}>
            {_t(lang, 
              'Toutes les plages proches ont un risque. Revenez plus tard ou élargissez la zone de recherche.',
              'All nearby beaches have risk. Check back later or widen your search area.',
              'Todas las playas cercanas tienen riesgo. Vuelve más tarde o amplía la zona de búsqueda.'
            )}
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="enhanced-alts-panel" style={{
      marginTop: compact ? 8 : 14,
      fontFamily: "'Bricolage Grotesque',sans-serif"
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: compact ? 8 : 12,
        fontSize: compact ? 13 : 14,
        fontWeight: 800,
        color: '#1A2B27'
      }}>
        <span style={{
          width: 4,
          height: 16,
          background: '#5B3A8E',
          borderRadius: 2
        }} />
        {_t(lang, 'Où aller plutôt ?', 'Where to go instead?', '¿A dónde ir en su lugar?')}
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#8AA09B',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          {_t(lang, 'jusqu\'à 3 recommandées', 'up to 3 recommended', 'hasta 3 recomendadas')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>
        {alternatives.map((alt, idx) => (
          <EnhancedAlternativeRow
            key={alt.beach.id}
            alt={alt}
            rank={idx + 1}
            lang={lang}
            onBeachClick={onBeachClick}
            track={track}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single alternative row with full metadata
 */
function EnhancedAlternativeRow({ alt, rank, lang, onBeachClick, track, compact }) {
  const { beach, distanceKm, driveMinutes, reason, matchScore } = alt;
  const statusColor = beach.status === 'clean' ? '#22C55E' : '#F59E0B';
  const statusLabel = beach.status === 'clean' 
    ? _t(lang, 'PROPRE', 'CLEAN', 'LIMPIA')
    : _t(lang, 'MODÉRÉE', 'MODERATE', 'MODERADA');

  const handleClick = (e) => {
    e.stopPropagation();
    if (track) track('sg_planb_pick', { 
      from: beach.id,  // Note: beach is the current beach, not alt.beach
      to: alt.beach.id, 
      rank: idx 
    });
    if (onBeachClick) onBeachClick(alt.beach);
  };

  // We need access to the current beach for tracking - passed via context or closure
  // For now, we'll use a simplified tracking
  const onClick = (e) => {
    e.stopPropagation();
    if (track) track('sg_planb_pick', { 
      to: alt.beach.id, 
      rank: rank - 1 
    });
    if (onBeachClick) onBeachClick(alt.beach);
  };

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 10 : 12,
        padding: compact ? '10px 12px' : '12px 14px',
        background: '#FDFBF6',
        border: `2px solid ${statusColor}`,
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'transform 0.08s ease, box-shadow 0.08s ease',
        boxShadow: '2px 2px 0 rgba(0,0,0,0.08)'
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px,2px)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'translate(0,0)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'translate(0,0)'}
    >
      {/* Rank badge */}
      <div style={{
        flexShrink: 0,
        width: compact ? 24 : 28,
        height: compact ? 24 : 28,
        borderRadius: '50%',
        background: statusColor,
        color: '#fff',
        font: `800 ${compact ? 11 : 12}px/1 "Anton",sans-serif`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 2px 4px ${statusColor}40`
      }}>
        {rank}
      </div>

      {/* Beach info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 2 : 4
        }}>
          <span style={{
            font: `800 ${compact ? 13 : 14}px/1.2 "Bricolage Grotesque",sans-serif`,
            color: '#1A2B27',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {alt.beach.name}
          </span>
          {alt.beach.commune && (
            <span style={{
              font: `500 ${compact ? 10 : 11}px/1 "Bricolage Grotesque",sans-serif`,
              color: '#8AA09B',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {alt.beach.commune}
            </span>
          )}
          <span style={{
            flexShrink: 0,
            font: `700 ${compact ? 10 : 11}px/1 "Bricolage Grotesque",sans-serif`,
            color: statusColor,
            background: `${statusColor}15`,
            padding: '2px 8px',
            borderRadius: 999,
            border: `1px solid ${statusColor}40`
          }}>
            {statusLabel}
          </span>
        </div>

        {/* Distance + drive time + reason */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 8 : 12,
          flexWrap: 'wrap',
          fontSize: compact ? 11 : 12,
          lineHeight: 1.4,
          color: '#4A5A55'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#8AA09B'}}>
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/>
              <circle cx="12" cy="10" r="2.5"/>
            </svg>
            {_t(lang, `${distanceKm} km`, `${distanceKm} km`, `${distanceKm} km`)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#8AA09B'}}>
              <path d="M12 2a10 10 0 0 1 10 10c0 4.4-3.3 8-7.5 9-.9.2-1.8.3-2.7.3s-1.8-.1-2.7-.3C5.3 20 2 16.4 2 12a10 10 0 0 1 10-10z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            {driveMinutes}
          </span>
          {reason && (
            <span style={{ 
              flex: 1, 
              minWidth: 120,
              fontStyle: 'italic',
              color: '#6B7B76'
            }}>
              {reason}
            </span>
          )}
        </div>

        {/* Confidence + freshness indicators (compact mode hides these) */}
        {!compact && alt.beach.confidence != null && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
            paddingTop: 6,
            borderTop: '1px solid rgba(138,160,155,0.15)',
            fontSize: 11,
            color: '#6B7B76'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              {_t(lang, 'Confiance : ', 'Confidence: ', 'Confianza: ')}
              <strong>{alt.beach.confidence}%</strong>
            </span>
            <span style={{ opacity: 0.6 }}>
              {_t(lang, 'Score match', 'Match score', 'Puntuación coincidencia')}: {alt.matchScore}
            </span>
          </div>
        )}
      </div>

      {/* Chevron */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: '#8AA09B', flexShrink: 0}}>
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </button>
  );
}

/**
 * Enhanced verdict badge — replaces simple status display
 */
export function EnhancedVerdictBadge({ beach, lang = 'fr', size = 'normal' }) {
  const verdict = useMemo(() => beach ? buildVerdictDetail(beach, lang) : null, [beach, lang]);
  
  if (!verdict) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'large' ? '12px 16px' : '8px 12px',
        borderRadius: 999,
        background: 'rgba(138,160,155,0.15)',
        color: '#8AA09B',
        font: `600 ${size === 'large' ? 14 : 12}px/1 "Bricolage Grotesque",sans-serif`
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#8AA09B'
        }} />
        {_t(lang, 'DONNÉES EN COURS', 'DATA LOADING', 'DATOS CARGANDO')}
      </div>
    );
  }

  const statusColors = {
    clean: { bg: '#22C55E15', border: '#22C55E', text: '#166534', icon: '#22C55E' },
    moderate: { bg: '#F59E0B15', border: '#F59E0B', text: '#92400E', icon: '#F59E0B' },
    avoid: { bg: '#E8522A15', border: '#E8522A', text: '#991B1B', icon: '#E8522A' },
    _loading: { bg: 'rgba(138,160,155,0.15)', border: '#8AA09B', text: '#8AA09B', icon: '#8AA09B' }
  };

  const colors = statusColors[verdict.status] || statusColors._loading;

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      gap: size === 'large' ? 4 : 2,
      padding: size === 'large' ? '12px 16px' : '8px 12px',
      borderRadius: size === 'large' ? 16 : 999,
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      color: colors.text,
      fontFamily: "'Bricolage Grotesque',sans-serif"
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontWeight: 800,
        fontSize: size === 'large' ? 14 : 12,
        lineHeight: 1.2
      }}>
        <span style={{
          width: size === 'large' ? 10 : 8,
          height: size === 'large' ? 10 : 8,
          borderRadius: '50%',
          background: colors.icon,
          flexShrink: 0
        }} />
        {verdict.label}
      </div>
      
      {(verdict.freshness || verdict.confidenceLabel) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: size === 'large' ? 11 : 10,
          fontWeight: 500,
          opacity: 0.85,
          flexWrap: 'wrap'
        }}>
          {verdict.freshness && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 0 1 10 10c0 4.4-3.3 8-7.5 9-.9.2-1.8.3-2.7.3s-1.8-.1-2.7-.3C5.3 20 2 16.4 2 12a10 10 0 0 1 10-10z"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              {verdict.freshness}
            </span>
          )}
          {verdict.confidenceLabel && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              {verdict.confidenceLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { getVerdictLabel, buildVerdictDetail, findAlternatives };