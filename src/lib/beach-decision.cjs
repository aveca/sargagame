/**
 * Beach Decision Engine — Enhanced verdicts & 3-alternative recommendations
 * 
 * P0 Priority: Replace single nearestCleanAlt with 3 ranked alternatives
 * including distance, risk, confidence, freshness, and human-readable reason.
 */

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

/**
 * Verdict labels — human-readable, honest, i18n-ready
 */
function getVerdictLabel(status, afai, confidence, lang = 'fr') {
  const _t = (fr, en, es) => {
    switch (lang) {
      case 'en': return en;
      case 'es': return es;
      default: return fr;
    }
  };

  // High confidence clean
  if (status === 'clean' && afai < 0.15 && confidence >= 70) {
    return _t(
      'BON CHOIX AUJOURD\'HUI',
      'GOOD CHOICE TODAY',
      'BUENA ELECCIÓN HOY'
    );
  }
  // Clean but lower confidence or some AFAI
  if (status === 'clean' && afai < 0.15) {
    return _t(
      'PROPRE — VERDIT CONFIANCE MOYENNE',
      'CLEAN — MEDIUM CONFIDENCE',
      'LIMPIA — CONFIANZA MEDIA'
    );
  }
  // Moderate
  if (status === 'moderate') {
    return _t(
      'RISQUE MODÉRÉ',
      'MODERATE RISK',
      'RIESGO MODERADO'
    );
  }
  // Avoid
  if (status === 'avoid') {
    return _t(
      'PLAGE À ÉVITER ACTUELLEMENT',
      'AVOID THIS BEACH TODAY',
      'PLAYA A EVITAR HOY'
    );
  }
  // Loading/unknown
  return _t(
    'DONNÉES EN COURS',
    'DATA LOADING',
    'DATOS CARGANDO'
  );
}

/**
 * Get verdict detail with confidence/freshness context
 */
function getVerdictDetail(beach, lang = 'fr') {
  const _t = (fr, en, es) => {
    switch (lang) {
      case 'en': return en;
      case 'es': return es;
      default: return fr;
    }
  };

  const { status, afai, confidence, score, updatedAt, erddapTimestamp } = beach;
  const label = getVerdictLabel(status, afai, confidence, lang);
  
  // Freshness
  let freshness = null;
  const ts = erddapTimestamp || updatedAt;
  if (ts) {
    const hoursAgo = (Date.now() - new Date(ts).getTime()) / 3.6e6;
    if (hoursAgo >= 0 && hoursAgo < 12) {
      freshness = _t(
        `EN DIRECT · il y a ${Math.max(1, Math.round(hoursAgo))} h`,
        `LIVE · ${Math.max(1, Math.round(hoursAgo))}h ago`,
        `EN VIVO · hace ${Math.max(1, Math.round(hoursAgo))} h`
      );
    } else if (hoursAgo < 24) {
      freshness = _t(
        `Dernière mise à jour il y a ${Math.round(hoursAgo)} h`,
        `Last updated ${Math.round(hoursAgo)}h ago`,
        `Actualizado hace ${Math.round(hoursAgo)} h`
      );
    } else {
      freshness = _t(
        `Données de ${Math.round(hoursAgo / 24)} jour(s)`,
        `Data from ${Math.round(hoursAgo / 24)} day(s) ago`,
        `Datos de hace ${Math.round(hoursAgo / 24)} día(s)`
      );
    }
  }

  // Confidence label
  let confidenceLabel = '';
  if (confidence >= 80) confidenceLabel = _t('Très fiable', 'Very reliable', 'Muy fiable');
  else if (confidence >= 60) confidenceLabel = _t('Fiable', 'Reliable', 'Fiable');
  else if (confidence >= 40) confidenceLabel = _t('Confiance moyenne', 'Medium confidence', 'Confianza media');
  else confidenceLabel = _t('Faible confiance', 'Low confidence', 'Baja confianza');

  // Reason from breakdown or status
  let reason = beach.reason || '';
  if (!reason) {
    switch (status) {
      case 'clean':
        reason = _t(
          'Zéro sargasses détectées au satellite',
          'Zero sargassum detected by satellite',
          'Cero sargazo detectado por satélite'
        );
        break;
      case 'moderate':
        reason = _t(
          'Présence modérée — conditions variables selon l\'heure',
          'Moderate presence — conditions vary by time of day',
          'Presencia moderada — condiciones variables según la hora'
        );
        break;
      case 'avoid':
        reason = _t(
          'Forte concentration détectée — évitez cette zone',
          'High concentration detected — avoid this area',
          'Alta concentración detectada — evite esta zona'
        );
        break;
    }
  }

  return {
    label,
    status,
    score: score ?? null,
    afai: afai ?? null,
    confidence,
    confidenceLabel,
    freshness,
    reason,
    updatedAt: ts,
    erddapTimestamp,
    stale: beach.stale === true
  };
}

/**
 * Find up to 3 best alternatives for a beach
 * Returns alternatives ranked by: proximity, coast type (sheltered preferred), status (clean preferred), confidence
 */
function findAlternatives(beach, allBeaches, options = {}) {
  if (!beach || !allBeaches || !allBeaches.length || beach.lat == null || beach.lng == null) {
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
    if (!b.lat || !b.lng) return false;
    if (sameIslandOnly && b.island !== beach.island) return false;
    
    const distance = haversineKm(beach.lat, beach.lng, b.lat, b.lng);
    if (distance > maxDistanceKm) return false;
    
    // Only clean beaches, or clean + moderate if option enabled
    if (includeModerate) {
      return b.status === 'clean' || b.status === 'moderate';
    }
    return b.status === 'clean';
  });

  // Score each candidate
  const scored = candidates.map(c => {
    const distance = haversineKm(beach.lat, beach.lng, c.lat, c.lng);
    
    // Base score: closer is better (inverse distance)
    let score = 1000 / (distance + 1);
    
    // Boost sheltered coasts (more reliable)
    if (c.coast === 'sheltered') score += 200;
    
    // Boost clean status
    if (c.status === 'clean') score += 300;
    else if (c.status === 'moderate') score += 100;
    
    // Boost higher confidence
    if (c.confidence >= 70) score += 100;
    else if (c.confidence >= 50) score += 50;
    
    // Boost beaches with amenities
    if (c.kids) score += 20;
    if (c.snorkel) score += 20;
    if (c.parking) score += 10;

    // Generate human-readable reason
    let reason = '';
    if (c.coast === 'sheltered' && c.status === 'clean') {
      reason = 'Côte abritée — reçoit rarement les sargasses';
    } else if (c.status === 'clean') {
      reason = 'Propre aujourd\'hui — bonne alternative';
    } else if (c.status === 'moderate') {
      reason = 'Risque modéré — surveillez l\'évolution';
    }

    const driveMinutes = Math.round(distance / 50 * 60); // ~50 km/h average

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
      driveMinutes: driveMinutes < 1 ? '< 1 min' : `${driveMinutes} min`,
      reason,
      matchScore: Math.round(score)
    };
  });

  // Sort by match score descending
  scored.sort((a, b) => b.matchScore - a.matchScore);

  return scored.slice(0, maxAlternatives);
}

/**
 * Build complete beach decision object
 */
function buildBeachDecision(beach, allBeaches, lang = 'fr') {
  const verdict = getVerdictDetail(beach, lang);
  const alternatives = findAlternatives(beach, allBeaches);
  
  // Determine if alternatives should be shown
  const showAlternatives = verdict.status === 'avoid' || verdict.status === 'moderate';
  
  return {
    beach: {
      id: beach.id,
      name: beach.name,
      commune: beach.commune || '',
      lat: beach.lat,
      lng: beach.lng,
      island: beach.island
    },
    verdict,
    alternatives: showAlternatives ? alternatives : [],
    hasAlternatives: alternatives.length > 0,
    timestamp: new Date().toISOString()
  };
}

/**
 * Get all clean beaches in region (for CleanList/alternatives)
 */
function getCleanBeaches(allBeaches, island) {
  return allBeaches.filter(b => 
    b.island === island && 
    b.status === 'clean' && 
    b.lat != null && 
    b.lng != null
  );
}

/**
 * Get best beach in region (highest score among clean)
 */
function getBestBeach(allBeaches, island) {
  const clean = getCleanBeaches(allBeaches, island);
  if (!clean.length) return null;
  return clean.reduce((best, b) => (b.score > best.score ? b : best), clean[0]);
}

module.exports = {
  getVerdictLabel,
  getVerdictDetail,
  findAlternatives,
  buildBeachDecision,
  getCleanBeaches,
  getBestBeach
};