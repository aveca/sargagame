/**
 * swim-surf-score.cjs — Spike deterministe Riviera Maya
 * Inputs : beaches-weather.json + sargassum.json
 * Output : status déterministe Baignade / Surf / Éviter
 * Garde-fous : pas de prédiction, pas de modèle, score explicable
 */

function isOnshore(windDir, beachId) {
  // Spike simplifié : onshore = vent E/NE/SE pour Riviera Maya (côte ouest)
  const onshore = new Set(['E','NE','SE','ESE','ENE']);
  if (!windDir) return false;
  return onshore.has(String(windDir).toUpperCase());
}

function confidenceFromFreshness(updatedAtISO, erddapTimestampISO) {
  try {
    const now = Date.now();
    const w = new Date(updatedAtISO).getTime();
    const s = new Date(erddapTimestampISO).getTime();
    const ageW = (now - w) / 3.6e6;
    const ageS = (now - s) / 3.6e6;
    if (ageW > 24 || ageS > 24) return 'low';
    if (ageW > 12 || ageS > 12) return 'medium';
    return 'high';
  } catch {
    return 'low';
  }
}

function swimSurfScore(beachId, sargData, weatherData) {
  const levels = Array.isArray(sargData.levels) ? sargData.levels : [];
  const level = levels.find(l => l.id === beachId) || {};
  const afaiStatus = level.status || 'unknown';

  const beaches = sargData._beaches || weatherData.beaches || {};
  const w = beaches[beachId] || {};
  const waveHeight = typeof w.waveHeight === 'number' ? w.waveHeight : null;
  const windSpeed = typeof w.windSpeed === 'number' ? w.windSpeed : null;
  const windDir = w.windDir || null;

  const data = {
    afaiStatus,
    afai: typeof level.afai === 'number' ? level.afai : null,
    waveHeight,
    windSpeed,
    windDir,
  };

  const isAvoid =
    afaiStatus === 'avoid' ||
    (waveHeight !== null && waveHeight >= 1.5) ||
    (windSpeed !== null && windSpeed >= 35);

  if (isAvoid) {
    return {
      beachId,
      status: 'eviter',
      data,
      score: 'déterministe',
      confidence: confidenceFromFreshness(sargData.updatedAt, sargData.erddapTimestamp),
      reason: 'Règle Éviter déclenchée',
    };
  }

  const isSurf =
    waveHeight !== null && windSpeed !== null && windDir !== null &&
    waveHeight >= 0.8 && waveHeight <= 2.0 &&
    windSpeed >= 12 && windSpeed <= 25 &&
    isOnshore(windDir, beachId);

  if (isSurf) {
    return {
      beachId,
      status: 'surf',
      data,
      score: 'déterministe',
      confidence: confidenceFromFreshness(sargData.updatedAt, sargData.erddapTimestamp),
      reason: 'Règle Surf déclenchée',
    };
  }

  const isSwim =
    waveHeight !== null && windSpeed !== null &&
    (afaiStatus === 'clean' || afaiStatus === 'moderate') &&
    waveHeight < 0.8 &&
    windSpeed < 35;

  if (isSwim) {
    return {
      beachId,
      status: 'baignade',
      data,
      score: 'déterministe',
      confidence: confidenceFromFreshness(sargData.updatedAt, sargData.erddapTimestamp),
      reason: 'Règle Baignade déclenchée',
    };
  }

  return {
    beachId,
    status: 'eviter',
    data,
    score: 'déterministe',
    confidence: 'low',
    reason: 'Données insuffisantes → prudence',
  };
}

module.exports = { swimSurfScore, isOnshore, confidenceFromFreshness };

