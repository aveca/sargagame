/**
 * Alert Engine — React hooks for frontend
 * 
 * Alert state machine, favorites, and notification management
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  findAlternatives, 
  getVerdictLabel,
  haversineKm 
} from './beach-decision.js';

/**
 * Alert trigger types
 */
export const ALERT_TRIGGERS = {
  VERDICT_CHANGE: 'verdict_change',
  SIGNIFICANT_RISK_SHIFT: 'significant_risk_shift',
  ALTERNATIVE_IMPROVEMENT: 'alternative_improvement',
  DATA_STALE: 'data_stale',
  DAILY_BRIEF: 'daily_brief',
};

const VERDICT_RANK = { clean: 0, moderate: 1, avoid: 2, _loading: -1 };

export function verdictChanged(prev, curr) {
  if (!prev || !curr) return false;
  if (prev === '_loading' || curr === '_loading') return false;
  return VERDICT_RANK[prev] !== VERDICT_RANK[curr];
}

export function significantRiskShift(prevScore, currScore, threshold = 15) {
  if (prevScore == null || currScore == null) return false;
  return Math.abs(currScore - prevScore) >= threshold;
}

/**
 * Get status label in language
 */
function getStatusLabel(status, lang) {
  const labels = {
    fr: { clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter', _loading: 'En cours' },
    en: { clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid', _loading: 'Loading' },
    es: { clean: 'Limpia', moderate: 'Moderado', avoid: 'Evitar', _loading: 'Cargando' }
  };
  return (labels[lang] || labels.fr)[status] || status;
}

/**
 * Check if alert cooldown has passed
 */
export function checkAlertCooldown(beachId, cooldownHours = 6) {
  try {
    const key = `sg_alert_cooldown_${beachId}`;
    const lastAlert = localStorage.getItem(key);
    if (!lastAlert) return true;
    const hoursSince = (Date.now() - parseInt(lastAlert)) / 3.6e6;
    return hoursSince >= cooldownHours;
  } catch {
    return true;
  }
}

/**
 * Set alert cooldown
 */
export function setAlertCooldown(beachId) {
  try {
    localStorage.setItem(`sg_alert_cooldown_${beachId}`, Date.now().toString());
  } catch {}
}

/**
 * Get favorite beach from localStorage
 */
export function getFavoriteBeach() {
  try {
    const favs = JSON.parse(localStorage.getItem('sg_fav') || '[]');
    return favs[0] || null;
  } catch {
    return null;
  }
}

/**
 * Add beach to favorites
 */
export function addFavoriteBeach(beachId) {
  try {
    const favs = JSON.parse(localStorage.getItem('sg_fav') || '[]');
    if (!favs.includes(beachId)) {
      favs.unshift(beachId);
      localStorage.setItem('sg_fav', JSON.stringify(favs.slice(0, 5)));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove beach from favorites
 */
export function removeFavoriteBeach(beachId) {
  try {
    const favs = JSON.parse(localStorage.getItem('sg_fav') || '[]');
    const filtered = favs.filter(id => id !== beachId);
    localStorage.setItem('sg_fav', JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if beach is favorite
 */
export function isFavoriteBeach(beachId) {
  try {
    const favs = JSON.parse(localStorage.getItem('sg_fav') || '[]');
    return favs.includes(beachId);
  } catch {
    return false;
  }
}

const _t = (lang, fr, en, es) => lang === 'en' ? en : lang === 'es' ? es : fr;

/**
 * Build alert payload
 */
function buildAlert(beach, prevBeach, trigger, alternatives = [], lang = 'fr') {
  const _t_local = (fr, en, es) => lang === 'en' ? en : lang === 'es' ? es : fr;
  
  return {
    id: `alert_${beach.id}_${Date.now()}`,
    beachId: beach.id,
    beachName: beach.name,
    beachCommune: beach.commune || '',
    island: beach.island,
    trigger,
    timestamp: new Date().toISOString(),
    current: {
      status: beach.status,
      score: beach.score ?? null,
      afai: beach.afai ?? null,
      confidence: beach.confidence ?? null,
      freshness: beach.updatedAt ? Math.round((Date.now() - new Date(beach.updatedAt).getTime()) / 3.6e6) : null
    },
    previous: prevBeach ? {
      status: prevBeach.status,
      score: prevBeach.score ?? null
    } : null,
    alternatives: alternatives.slice(0, 3).map((a, i) => ({
      rank: i + 1,
      beachId: a.beach.id,
      beachName: a.beach.name,
      distanceKm: a.distanceKm,
      driveMinutes: a.driveMinutes,
      status: a.beach.status,
      reason: a.reason
    })),
    message: generateAlertMessage(beach, prevBeach, trigger, alternatives, lang)
  };
}

function generateAlertMessage(beach, prevBeach, trigger, alternatives, lang) {
  const beachName = beach.name;
  
  switch (trigger) {
    case ALERT_TRIGGERS.VERDICT_CHANGE:
      if (!prevBeach) return _t(lang,
        `${beachName} : ${getStatusLabel(beach.status, lang)}`,
        `${beachName}: ${getStatusLabel(beach.status, lang)}`,
        `${beachName}: ${getStatusLabel(beach.status, lang)}`);
      const from = getStatusLabel(prevBeach.status, lang);
      const to = getStatusLabel(beach.status, lang);
      const direction = VERDICT_RANK[beach.status] > VERDICT_RANK[prevBeach.status] 
        ? _t(lang, 'dégradé', 'worsened', 'empeorado')
        : _t(lang, 'amélioré', 'improved', 'mejorado');
      return _t(lang,
        `${beachName} : risque ${direction} (${from} → ${to})`,
        `${beachName} : risk ${direction} (${from} → ${to})`,
        `${beachName} : riesgo ${direction} (${from} → ${to})`
      );
      
    case ALERT_TRIGGERS.SIGNIFICANT_RISK_SHIFT:
      return _t(lang,
        `${beachName} : variation significative du risque (score ${prevBeach?.score} → ${beach.score})`,
        `${beachName} : significant risk shift (score ${prevBeach?.score} → ${beach.score})`,
        `${beachName} : variación significativa del riesgo (puntuación ${prevBeach?.score} → ${beach.score})`
      );
      
    case ALERT_TRIGGERS.ALTERNATIVE_IMPROVEMENT:
      if (alternatives.length > 0) {
        const alt = alternatives[0].beach;
        return _t(lang,
          `${beachName} : meilleure alternative trouvée — ${alt.name} (${alternatives[0].distanceKm} km, ${getStatusLabel(alt.status, lang)})`,
          `${beachName} : better alternative found — ${alt.name} (${alternatives[0].distanceKm} km, ${getStatusLabel(alt.status, lang)})`,
          `${beachName} : mejor alternativa encontrada — ${alt.name} (${alternatives[0].distanceKm} km, ${getStatusLabel(alt.status, lang)})`
        );
      }
      return _t(lang,
        `${beachName} : alternative disponible`,
        `${beachName}: alternative available`,
        `${beachName}: alternativa disponible`);
      
    case ALERT_TRIGGERS.DATA_STALE:
      return _t(lang,
        `Données ${beachName} : plus de mise à jour depuis ${beach.current?.freshness}h`,
        `${beachName} data : no update for ${beach.current?.freshness}h`,
        `Datos ${beachName} : sin actualización desde hace ${beach.current?.freshness}h`
      );
      
    case ALERT_TRIGGERS.DAILY_BRIEF:
      return _t(lang,
        `Verdict du jour pour ${beachName} : ${getStatusLabel(beach.status, lang)}`,
        `Today's verdict for ${beachName} : ${getStatusLabel(beach.status, lang)}`,
        `Veredicto del día para ${beachName} : ${getStatusLabel(beach.status, lang)}`
      );
      
    default:
      return _t(lang,
        `${beachName} : ${getStatusLabel(beach.status, lang)}`,
        `${beachName}: ${getStatusLabel(beach.status, lang)}`,
        `${beachName}: ${getStatusLabel(beach.status, lang)}`);
  }
}

/**
 * Main hook for alert engine
 */
export function useAlertEngine(allBeaches, lang = 'fr') {
  const [alerts, setAlerts] = useState([]);
  const prevStatesRef = useRef({});
  
  // Check alerts for a specific beach
  const checkBeachAlerts = useCallback((beach) => {
    if (!beach || beach.status === '_loading') return null;
    
    const prevBeach = prevStatesRef.current[beach.id];
    
    // Check confidence threshold
    if (beach.confidence != null && beach.confidence < 40) {
      return null;
    }
    
    // No previous state = first check
    if (!prevBeach) {
      prevStatesRef.current[beach.id] = beach;
      return buildAlert(beach, null, ALERT_TRIGGERS.DAILY_BRIEF, findAlternatives(beach, allBeaches, { lang }), lang);
    }
    
    // Check verdict change
    if (verdictChanged(prevBeach.status, beach.status)) {
      const alternatives = findAlternatives(beach, allBeaches, { lang });
      const alert = buildAlert(beach, prevBeach, ALERT_TRIGGERS.VERDICT_CHANGE, alternatives, lang);
      prevStatesRef.current[beach.id] = beach;
      return alert;
    }
    
    // Check significant risk shift
    if (significantRiskShift(prevBeach.score, beach.score, 15)) {
      const alternatives = findAlternatives(beach, allBeaches, { lang });
      const alert = buildAlert(beach, prevBeach, ALERT_TRIGGERS.SIGNIFICANT_RISK_SHIFT, alternatives, lang);
      prevStatesRef.current[beach.id] = beach;
      return alert;
    }
    
    // Check for new better alternative
    const alternatives = findAlternatives(beach, allBeaches, { lang });
    const prevAlternatives = findAlternatives(prevBeach, allBeaches, { lang });
    
    if (alternatives.length > 0 && (!prevAlternatives.length || 
        alternatives[0].matchScore > (prevAlternatives[0]?.matchScore || 0) + 50)) {
      const alert = buildAlert(beach, prevBeach, ALERT_TRIGGERS.ALTERNATIVE_IMPROVEMENT, alternatives, lang);
      prevStatesRef.current[beach.id] = beach;
      return alert;
    }
    
    // Check data staleness
    if (beach.updatedAt) {
      const hoursSinceUpdate = (Date.now() - new Date(beach.updatedAt).getTime()) / 3.6e6;
      if (hoursSinceUpdate > 24) {
        const alert = buildAlert(beach, prevBeach, ALERT_TRIGGERS.DATA_STALE, [], lang);
        prevStatesRef.current[beach.id] = beach;
        return alert;
      }
    }
    
    // Update previous state
    prevStatesRef.current[beach.id] = beach;
    return null;
  }, [allBeaches, lang]);
  
  // Check all favorite beaches
  const checkAllFavorites = useCallback(() => {
    const favId = getFavoriteBeach();
    if (!favId) return [];
    
    const beach = allBeaches.find(b => b.id === favId);
    if (!beach) return [];
    
    const alert = checkBeachAlerts(beach);
    if (alert && checkAlertCooldown(alert.beachId)) {
      setAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10
      setAlertCooldown(alert.beachId);
      return [alert];
    }
    return [];
  }, [allBeaches, lang]);
  
  // Initialize previous states from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sg_alert_prev_states');
      if (saved) {
        prevStatesRef.current = JSON.parse(saved);
      }
    } catch {}
  }, []);
  
  // Save previous states periodically
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        localStorage.setItem('sg_alert_prev_states', JSON.stringify(prevStatesRef.current));
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
}, []);
  
  return {
    alerts,
    checkBeachAlerts,
    checkAllFavorites,
    dismissAlert: (id) => setAlerts(prev => prev.filter(a => a.id !== id)),
    clearAlerts: () => setAlerts([])
  };
}

/**
 * Hook for favorites management
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sg_fav') || '[]');
    } catch {
      return [];
    }
  });
  
  const toggleFavorite = useCallback((beachId) => {
    setFavorites(prev => {
      const next = prev.includes(beachId) 
        ? prev.filter(id => id !== beachId)
        : [beachId, ...prev.slice(0, 4)];
      try {
        localStorage.setItem('sg_fav', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  
  const isFavorite = useCallback((beachId) => favorites.includes(beachId), [favorites]);
  
  const getPrimaryFavorite = useCallback(() => favorites[0] || null, [favorites]);
  
  return { favorites, toggleFavorite, isFavorite, getPrimaryFavorite };
}

/**
 * Hook for "Ma Plage" view state
 */
export function useMyPlage(allBeaches, lang = 'fr') {
  const { getPrimaryFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favId = getPrimaryFavorite();
  const beach = useMemo(() => 
    favId ? allBeaches.find(b => b.id === favId) : null, 
    [allBeaches, favId]
  );
  
  const alternatives = useMemo(() => 
    beach && (beach.status === 'avoid' || beach.status === 'moderate') 
      ? findAlternatives(beach, allBeaches, { lang }) 
      : [], 
    [beach, allBeaches, lang]
  );
  
  const verdict = useMemo(() => 
    beach ? { label: getVerdictLabel(beach.status, beach.afai, beach.confidence, lang), ...beach } : null,
    [beach, lang]
  );
  
  return {
    beach,
    favId,
    isFavorite: favId ? isFavorite(favId) : false,
    toggleFavorite: () => favId ? toggleFavorite(favId) : null,
    alternatives,
    verdict,
    hasBeach: !!beach
  };
}

// Re-export for convenience
export { 
  findAlternatives,
  getStatusLabel,
  getVerdictLabel
};