/**
 * Beach Decision Engine — React hooks for frontend
 * 
 * Enhanced verdicts & 3-alternative recommendations with i18n
 */

import { useMemo } from 'react';

/**
 * Haversine distance in km
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// i18n helper
const _t = (lang, fr, en, es) => {
  switch (lang) {
    case 'en': return en;
    case 'es': return es;
    default: return fr;
  }
};

/**
 * Get verdict label — human-readable, honest
 */
export function getVerdictLabel(status, afai, confidence, lang = 'fr') {
  // High confidence clean
  if (status === 'clean' && afai < 0.15 && confidence >= 70) {
    return _t(lang, 'BON CHOIX AUJOURD\'HUI', 'GOOD CHOICE TODAY', 'BUENA ELECCIÓN HOY');
  }
  // Clean but lower confidence or some AFAI
  if (status === 'clean' && afai < 0.15) {
    return _t(lang, 'PROPRE — CONFIANCE MOYENNE', 'CLEAN — MEDIUM CONFIDENCE', 'LIMPIA — CONFIANZA MEDIA');
  }
  // Moderate
  if (status === 'moderate') {
    return _t(lang, 'RISQUE MODÉRÉ', 'MODERATE RISK', 'RIESGO MODERADO');
  }
  // Avoid
  if (status === 'avoid') {
    return _t(lang, 'PLAGE À ÉVITER ACTUELLEMENT', 'AVOID THIS BEACH TODAY', 'PLAYA A EVITAR HOY');
  }
  // Loading/unknown
  return _t(lang, 'DONNÉES EN COURS', 'DATA LOADING', 'DATOS CARGANDO');
}

/**
 * Get confidence label
 */
function getConfidenceLabel(confidence, lang) {
  if (confidence >= 80) return _t(lang, 'Très fiable', 'Very reliable', 'Muy fiable');
  if (confidence >= 60) return _t(lang, 'Fiable', 'Reliable', 'Fiable');
  if (confidence >= 40) return _t(lang, 'Confiance moyenne', 'Medium confidence', 'Confianza media');
  return _t(lang, 'Faible confiance', 'Low confidence', 'Baja confianza');
}

/**
 * Get freshness string
 */
function getFreshness(ts, lang) {
  if (!ts) return null;
  const hoursAgo = (Date.now() - new Date(ts).getTime()) / 3.6e6;
  if (hoursAgo >= 0 && hoursAgo < 12) {
    return _t(lang, `EN DIRECT · il y a ${Math.max(1, Math.round(hoursAgo))} h`, `LIVE · ${Math.max(1, Math.round(hoursAgo))}h ago`, `EN VIVO · hace ${Math.max(1, Math.round(hoursAgo))} h`);
  }
  if (hoursAgo < 24) {
    return _t(lang, `Dernière mise à jour il y a ${Math.round(hoursAgo)} h`, `Last updated ${Math.round(hoursAgo)}h ago`, `Actualizado hace ${Math.round(hoursAgo)} h`);
  }
  return _t(lang, `Données de ${Math.round(hoursAgo / 24)} jour(s)`, `Data from ${Math.round(hoursAgo / 24)} day(s) ago`, `Datos de hace ${Math.round(hoursAgo / 24)} día(s)`);
}

/**
 * Get reason from beach data
 */
function getReason(beach, lang) {
  const { status, reason } = beach;
  if (reason) return reason;
  switch (status) {
    case 'clean':
      return _t(lang, 'Zéro sargasses détectées au satellite', 'Zero sargassum detected by satellite', 'Cero sargazo detectado por satélite');
    case 'moderate':
      return _t(lang, 'Présence modérée — conditions variables selon l\'heure', 'Moderate presence — conditions vary by time of day', 'Presencia moderada — condiciones variables según la hora');
    case 'avoid':
      return _t(lang, 'Forte concentration détectée — évitez cette zone', 'High concentration detected — avoid this area', 'Alta concentración detectada — evite esta zona');
    default:
      return '';
  }
}

/**
 * Build verdict detail object
 */
export function buildVerdictDetail(beach, lang = 'fr') {
  const { status, afai, confidence, score, updatedAt, erddapTimestamp, stale } = beach;
  return {
    label: getVerdictLabel(status, afai, confidence, lang),
    status,
    score: score ?? null,
    afai: afai ?? null,
    confidence,
    confidenceLabel: getConfidenceLabel(confidence, lang),
    freshness: getFreshness(erddapTimestamp || updatedAt, lang),
    reason: getReason(beach, lang),
    updatedAt: erddapTimestamp || updatedAt,
    erddapTimestamp,
    stale: stale === true
  };
}

/**
 * Find up to 3 best alternatives for a beach
 */
export function findAlternatives(beach, allBeaches, options = {}) {
  if (!beach || !allBeaches?.length || beach.lat == null || beach.lng == null) {
    return [];
  }

  const {
    maxAlternatives = 3,
    maxDistanceKm = 60,
    sameIslandOnly = true,
    includeModerate = true
  } = options;

  const candidates = allBeaches.filter(b => {
    if (b.id === beach.id) return false;
    if (b.lat == null || b.lng == null) return false;
    if (sameIslandOnly && b.island !== beach.island) return false;
    
    const distance = haversineKm(beach.lat, beach.lng, b.lat, b.lng);
    if (distance > maxDistanceKm) return false;
    
    if (includeModerate) {
      return b.status === 'clean' || b.status === 'moderate';
    }
    return b.status === 'clean';
  });

  const scored = candidates.map(c => {
    const distance = haversineKm(beach.lat, beach.lng, c.lat, c.lng);
    
    let score = 1000 / (distance + 1);
    
    if (c.coast === 'sheltered') score += 200;
    if (c.status === 'clean') score += 300;
    else if (c.status === 'moderate') score += 100;
    
    if (c.confidence >= 70) score += 100;
    else if (c.confidence >= 50) score += 50;
    
    if (c.kids) score += 20;
    if (c.snorkel) score += 20;
    if (c.parking) score += 10;

    let reason = '';
    if (c.coast === 'sheltered' && c.status === 'clean') {
      reason = _t(lang, 'Côte abritée — reçoit rarement les sargasses', 'Sheltered coast — rarely gets sargassum', 'Costa protegida — rara vez recibe sargazo');
    } else if (c.status === 'clean') {
      reason = _t(lang, 'Propre aujourd\'hui — bonne alternative', 'Clean today — good alternative', 'Limpia hoy — buena alternativa');
    } else if (c.status === 'moderate') {
      reason = _t(lang, 'Risque modéré — surveillez l\'évolution', 'Moderate risk — monitor evolution', 'Riesgo moderado — vigile la evolución');
    }

    const driveMinutes = Math.round(distance / 50 * 60);

    return {
      beach: {
        id: c.id,
        name: c.name,
        commune: c.commune || '',
        lat: c.lat,
        lng: c.lng,
        island: c.island,
        status: c.status,
        afai: c.afai ?? null,
        confidence: c.confidence ?? null,
        score: c.score ?? null,
        kids: c.kids ?? false,
        snorkel: c.snorkel ?? false,
        parking: c.parking ?? false,
        coast: c.coast || 'unknown'
      },
      distanceKm: Math.round(distance * 10) / 10,
      driveMinutes: driveMinutes < 1 ? _t(lang, '< 1 min', '< 1 min', '< 1 min') : `${driveMinutes} min`,
      reason,
      matchScore: Math.round(score)
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, maxAlternatives);
}

/**
 * React hook for beach decision
 */
export function useBeachDecision(beach, allBeaches, lang = 'fr') {
  const verdict = useMemo(() => 
    beach ? buildVerdictDetail(beach, lang) : null, 
    [beach, lang]
  );
  
  const alternatives = useMemo(() => 
    (beach && (verdict?.status === 'avoid' || verdict?.status === 'moderate')) 
      ? findAlternatives(beach, allBeaches, { lang }) 
      : [], 
    [beach, allBeaches, lang, verdict]
  );

  return {
    verdict,
    alternatives,
    hasAlternatives: alternatives.length > 0,
    label: verdict?.label || _t(lang, 'DONNÉES EN COURS', 'DATA LOADING', 'DATOS CARGANDO')
  };
}

/**
 * Hook for clean beaches in region
 */
export function useCleanBeaches(allBeaches, island) {
  return useMemo(() => 
    allBeaches?.filter(b => 
      b.island === island && 
      b.status === 'clean' && 
      b.lat != null && 
      b.lng != null
    ) || [], 
    [allBeaches, island]
  );
}

/**
 * Hook for best beach in region
 */
export function useBestBeach(allBeaches, island) {
  return useMemo(() => {
    const clean = allBeaches?.filter(b => 
      b.island === island && 
      b.status === 'clean' && 
      b.lat != null && 
      b.lng != null
    ) || [];
    if (!clean.length) return null;
    return clean.reduce((best, b) => (b.score > best.score ? b : best), clean[0]);
  }, [allBeaches, island]);
}

export { _t };