/**
 * dynamic-planner.js — DYNAMIC BEACH DAY PLANNER ENGINE
 *
 * Core planning algorithm: computes optimal beach day(s) given context.
 * Pure module, deterministic, zero side effects, fully testable.
 *
 * Input: { date, startTime, duration, startPos, beaches[], forecastById, allBeaches, preferences, constraints }
 * Output: { days[], scenarios[], metadata }
 *
 * Rollback: ?dynamicplan=0 → legacy TripPlanner
 */
import { haversineKm } from "./beach-decision.js";
import { findAlternatives } from "./beach-decision.js";

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURATION & CONSTANTS
// ──────────────────────────────────────────────────────────────────────────────

const SCORING = {
  // Base weights for multi-objective scoring
  STATUS_WEIGHT: 100,        // clean=100, moderate=50, avoid=0
  CONFIDENCE_WEIGHT: 0.5,    // per confidence point
  TRAVEL_PENALTY: 2,         // per minute travel
  ACTIVITY_BONUS: 15,        // per matched activity
  SHELTERED_BONUS: 10,       // sheltered coast bonus
  TIME_WINDOW_BONUS: 20,     // fits in preferred window
  CONTINUITY_BONUS: 30,      // same beach across slots
};

const STATUS_SCORE = { clean: 100, moderate: 50, avoid: 0, alert: 0 };

const DEFAULT_PREFS = {
  activities: [],           // ['swim', 'snorkel', 'family', 'walk', 'photo']
  maxTravelMin: 45,         // max one-way travel time
  avoidCrowds: false,       // prefer less popular (no data yet)
  preferSheltered: true,    // prefer sheltered coasts
  minConfidence: 40,        // minimum confidence threshold
  minDuration: 120,         // minimum beach stay (minutes)
  maxDuration: 480,         // maximum beach stay (minutes)
};

const DEFAULT_CONSTRAINTS = {
  mustIncludeBeach: null,   // beachId that must be in plan
  excludeBeaches: [],       // beachIds to exclude
  fixedStartTime: null,     // if set, overrides startTime
  fixedEndTime: null,       // if set, overrides startTime+duration
  maxBeachesPerDay: 3,      // max different beaches in one day
  allowOvernight: false,    // allow plans crossing midnight
};

// ──────────────────────────────────────────────────────────────────────────────
// TRAVEL TIME ESTIMATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Estimate travel time between two points.
 * Uses haversine distance + road factor (1.4× for coastal roads) + parking buffer.
 * @param {Object} from - {lat, lng} or beach object
 * @param {Object} to - {lat, lng} or beach object
 * @returns {number} travel time in minutes (rounded)
 */
export function estimateTravelTime(from, to) {
  if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) {
    return null;
  }
  const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  // Coastal road factor ~1.4, avg speed 50 km/h + 5 min parking/access
  const driveMin = Math.round((distKm / 50) * 60 * 1.4) + 5;
  return Math.max(5, driveMin); // minimum 5 min
}

/**
 * Estimate travel time from user position (or zone center) to beach.
 * @param {Object} startPos - {lat, lng} or null for zone center
 * @param {Object} beach - beach object
 * @param {Array} allBeaches - for zone center fallback
 * @returns {number|null} travel time in minutes
 */
export function estimateTravelFromStart(startPos, beach, allBeaches = []) {
  if (startPos && startPos.lat != null && startPos.lng != null) {
    return estimateTravelTime(startPos, beach);
  }
  // Fallback: use island/zone center (first beach of same island)
  if (beach.island) {
    const zoneBeach = allBeaches.find(b => b.island === beach.island && b.lat != null);
    if (zoneBeach) return estimateTravelTime(zoneBeach, beach);
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTIVITY MATCHING
// ──────────────────────────────────────────────────────────────────────────────

const ACTIVITY_FLAGS = {
  swim: b => b.status === 'clean',           // clean water = swim OK
  snorkel: b => b.snorkel === true,          // snorkel flag
  family: b => b.kids === true,              // kids-friendly flag
  walk: b => true,                           // all beaches walkable
  photo: b => b.status !== 'avoid',          // avoid = poor photo conditions
  sunset: b => b.coast === 'west' || b.coast === 'sheltered', // west-facing or sheltered
};

function countMatchedActivities(beach, activities) {
  if (!activities?.length) return 0;
  return activities.filter(a => ACTIVITY_FLAGS[a]?.(beach)).length;
}

// ──────────────────────────────────────────────────────────────────────────────
// BEACH SLOT SCORING (core algorithm)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Score a single beach for a specific time slot.
 * Higher = better fit.
 * @returns {Object} { score, breakdown, viable }
 */
function scoreBeachForSlot(beach, forecastDay, slot, context) {
  const { startTime, duration, startPos, prefs, constraints, allBeaches } = context;

  // Hard filters
  if (!forecastDay || !forecastDay.status) return { score: -Infinity, breakdown: {}, viable: false, reason: 'no_forecast' };
  if (prefs.minConfidence && (forecastDay.confidence || 0) < prefs.minConfidence) {
    return { score: -Infinity, breakdown: {}, viable: false, reason: 'low_confidence' };
  }
  if (constraints.excludeBeaches?.includes(beach.id)) {
    return { score: -Infinity, breakdown: {}, viable: false, reason: 'excluded' };
  }

  const travelMin = estimateTravelFromStart(startPos, beach, allBeaches);
  if (travelMin !== null && travelMin > prefs.maxTravelMin) {
    return { score: -Infinity, breakdown: {}, viable: false, reason: 'too_far', travelMin };
  }

  // Base status score
  const statusScore = STATUS_SCORE[forecastDay.status] || 0;
  const confidence = forecastDay.confidence || 0;
  const afai = forecastDay.afai ?? 1;

  // Activity match bonus
  const activityMatches = countMatchedActivities(beach, prefs.activities);
  const activityBonus = activityMatches * SCORING.ACTIVITY_BONUS;

  // Sheltered coast bonus
  const shelteredBonus = (prefs.preferSheltered && beach.coast === 'sheltered') ? SCORING.SHELTERED_BONUS : 0;

  // Travel penalty
  const travelPenalty = travelMin ? travelMin * SCORING.TRAVEL_PENALTY : 0;

  // Time window fit (simplified: prefer morning for clean, afternoon for moderate)
  let timeWindowBonus = 0;
  if (forecastDay.status === 'clean' && slot.startHour < 14) timeWindowBonus = SCORING.TIME_WINDOW_BONUS;
  if (forecastDay.status === 'moderate' && slot.startHour >= 14) timeWindowBonus = SCORING.TIME_WINDOW_BONUS;

  // Continuity bonus (same beach as previous slot)
  let continuityBonus = 0;
  if (slot.prevBeachId && slot.prevBeachId === beach.id) {
    continuityBonus = SCORING.CONTINUITY_BONUS;
  }

  const score =
    statusScore * SCORING.STATUS_WEIGHT / 100 +
    confidence * SCORING.CONFIDENCE_WEIGHT +
    activityBonus +
    shelteredBonus -
    travelPenalty +
    timeWindowBonus +
    continuityBonus;

  return {
    score: Math.round(score * 10) / 10,
    breakdown: {
      status: statusScore,
      confidence,
      activityMatches,
      travelMin,
      sheltered: beach.coast === 'sheltered',
      continuity: !!slot.prevBeachId,
    },
    viable: true,
    travelMin,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// PLAN GENERATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate time slots for a day based on start time and duration.
 * @returns {Array} slots [{index, startHour, endHour, label, prevBeachId}]
 */
function generateDaySlots(startTime, duration, maxBeaches = 3) {
  const slots = [];
  const startHour = parseInt(startTime.split(':')[0], 10) || 9;
  const totalMinutes = duration || 360; // default 6h
  const slotCount = Math.min(maxBeaches, Math.max(1, Math.ceil(totalMinutes / 120))); // ~2h per beach
  const slotDuration = Math.floor(totalMinutes / slotCount);

  for (let i = 0; i < slotCount; i++) {
    const sh = startHour + Math.floor((i * slotDuration) / 60);
    const sm = (startHour * 60 + i * slotDuration) % 60;
    const eh = startHour + Math.floor(((i + 1) * slotDuration) / 60);
    const em = (startHour * 60 + (i + 1) * slotDuration) % 60;
    slots.push({
      index: i,
      startHour: sh,
      startMinute: sm,
      endHour: eh,
      endMinute: em,
      duration: slotDuration,
      label: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}–${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
      prevBeachId: i > 0 ? null : null, // will be filled during optimization
    });
  }
  return slots;
}

/**
 * Find best beach for each slot using greedy + lookahead optimization.
 * @returns {Array} selected beaches for each slot
 */
function optimizeDaySlots(beaches, forecastById, slots, context) {
  const results = [];
  let prevBeachId = null;

  for (let i = 0; i < slots.length; i++) {
    const slot = { ...slots[i], prevBeachId };
    const scored = beaches
      .map(b => {
        const fc = forecastById[b.id];
        const dayFc = fc?.forecast?.find(d => d.date === slots[i]?.date) || fc?.forecast?.[0];
        return { beach: b, ...scoreBeachForSlot(b, dayFc, slot, context) };
      })
      .filter(r => r.viable)
      .sort((a, b) => b.score - a.score);

    const best = scored[0] || null;
    results.push({
      slot: slots[i],
      beach: best?.beach || null,
      forecast: best ? (forecastById[best.beach.id]?.forecast?.find(d => d.date === slots[i]?.date) || forecastById[best.beach.id]?.forecast?.[0]) : null,
      score: best?.score || 0,
      travelMin: best?.travelMin || null,
      alternatives: scored.slice(1, 4).map(r => ({
        beach: r.beach,
        score: r.score,
        travelMin: r.travelMin,
      })),
    });

    if (best) prevBeachId = best.beach.id;
  }

  return results;
}

/**
 * Generate backup plan (alternative day structure).
 */
function generateBackupPlan(beaches, forecastById, slots, context, primaryPlan) {
  // Find best alternative for each slot that isn't the primary
  const usedBeachIds = new Set(primaryPlan.filter(p => p.beach).map(p => p.beach.id));
  const backupSlots = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = { ...slots[i], prevBeachId: null };
    const scored = beaches
      .map(b => {
        if (usedBeachIds.has(b.id)) return { score: -Infinity, viable: false };
        const fc = forecastById[b.id];
        const dayFc = fc?.forecast?.find(d => d.date === slots[i]?.date) || fc?.forecast?.[0];
        return { beach: b, ...scoreBeachForSlot(b, dayFc, slot, context) };
      })
      .filter(r => r.viable)
      .sort((a, b) => b.score - a.score);

    const best = scored[0] || null;
    if (best) {
      backupSlots.push({
        slot: slots[i],
        beach: best.beach,
        forecast: forecastById[best.beach.id]?.forecast?.find(d => d.date === slots[i]?.date) || forecastById[best.beach.id]?.forecast?.[0],
        score: best.score,
        travelMin: best.travelMin,
      });
      usedBeachIds.add(best.beach.id);
    }
  }

  return backupSlots.length ? backupSlots : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO GENERATION
// ──────────────────────────────────────────────────────────────────────────────

const SCENARIO_PRESETS = [
  { id: 'tomorrow', label: { fr: 'Et si j\'y vais demain ?', en: 'What if I go tomorrow?', es: '¿Y si voy mañana?' }, deltaDays: 1 },
  { id: 'later', label: { fr: 'Et si je pars plus tard ?', en: 'What if I leave later?', es: '¿Y si salgo más tarde?' }, deltaHours: 3 },
  { id: 'shorter', label: { fr: 'Et si je n\'ai que 3h ?', en: 'What if I only have 3h?', es: '¿Y si solo tengo 3h?' }, duration: 180 },
  { id: 'swim', label: { fr: 'Et si je veux surtout nager ?', en: 'What if I want to swim?', es: '¿Y si quiero nadar?' }, activities: ['swim'] },
  { id: 'snorkel', label: { fr: 'Et si je veux faire du snorkeling ?', en: 'What if I want to snorkel?', es: '¿Y si quiero hacer snorkel?' }, activities: ['snorkel'] },
  { id: 'family', label: { fr: 'Et si je suis avec des enfants ?', en: 'What if I\'m with kids?', es: '¿Y si voy con niños?' }, activities: ['family', 'swim'] },
  { id: 'less_travel', label: { fr: 'Et si je veux réduire les trajets ?', en: 'What if I want less travel?', es: '¿Y si quiero menos viaje?' }, maxTravelMin: 20 },
  { id: 'two_beaches', label: { fr: 'Et si je veux 2 plages différentes ?', en: 'What if I want 2 different beaches?', es: '¿Y si quiero 2 playas distintas?' }, maxBeachesPerDay: 2 },
];

/**
 * Generate "what if" scenarios from current plan context.
 */
export function generateScenarios(baseContext, _t) {
  return SCENARIO_PRESETS.map(preset => {
    const ctx = { ...baseContext, prefs: { ...baseContext.prefs }, constraints: { ...baseContext.constraints } };
    if (preset.deltaDays) ctx.date = new Date(new Date(ctx.date).getTime() + preset.deltaDays * 86400000).toISOString().split('T')[0];
    if (preset.deltaHours) {
      const [h, m] = ctx.startTime.split(':').map(Number);
      ctx.startTime = `${String((h + preset.deltaHours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (preset.duration) ctx.duration = preset.duration;
    if (preset.activities) ctx.prefs.activities = [...new Set([...ctx.prefs.activities, ...preset.activities])];
    if (preset.maxTravelMin) ctx.prefs.maxTravelMin = preset.maxTravelMin;
    if (preset.maxBeachesPerDay) ctx.constraints.maxBeachesPerDay = preset.maxBeachesPerDay;

    return {
      id: preset.id,
      label: _t(preset.label.fr, preset.label.en, preset.label.es),
      context: ctx,
      preview: null, // filled lazily when user opens scenario
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY: computePlan
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute a dynamic beach day plan.
 * @param {Object} input
 * @returns {Object} plan result
 */
export function computePlan(input) {
  const {
    date = new Date().toISOString().split('T')[0],
    startTime = '09:00',
    duration = 360, // 6 hours default
    startPos = null, // {lat, lng} or null
    beaches = [],
    forecastById = {},
    allBeaches = [],
    preferences = {},
    constraints = {},
    lang = 'fr',
  } = input;

  const _t = (fr, en, es) => (lang === 'en' ? en : lang === 'es' ? es : fr);

  const prefs = { ...DEFAULT_PREFS, ...preferences };
  const ctx = { date, startTime, duration, startPos, beaches, forecastById, allBeaches, prefs, constraints: { ...DEFAULT_CONSTRAINTS, ...constraints } };

  // Filter beaches to those with forecast data for the date
  const candidateBeaches = beaches.filter(b => {
    const fc = forecastById[b.id];
    return fc?.forecast?.some(d => d.date === date);
  });

  if (!candidateBeaches.length) {
    return { days: [], scenarios: [], metadata: { error: 'no_forecast_for_date', date } };
  }

  const slots = generateDaySlots(startTime, duration, ctx.constraints.maxBeachesPerDay);
  slots.forEach((s, i) => { s.date = date; });

  const primaryPlan = optimizeDaySlots(candidateBeaches, forecastById, slots, ctx);
  const backupPlan = generateBackupPlan(candidateBeaches, forecastById, slots, ctx, primaryPlan);

  // Compute day score
  const dayScore = primaryPlan.reduce((sum, p) => sum + (p.score || 0), 0) / Math.max(1, primaryPlan.length);

  // Generate scenarios
  const scenarios = generateScenarios(ctx, _t);

  return {
    date,
    startTime,
    duration,
    startPos,
    slots: primaryPlan,
    backupPlan,
    dayScore: Math.round(dayScore * 10) / 10,
    scenarios,
    metadata: {
      generatedAt: new Date().toISOString(),
      candidateCount: candidateBeaches.length,
      prefs,
      constraints: ctx.constraints,
    },
  };
}

/**
 * Compute multi-day plan (for premium).
 */
export function computeMultiDayPlan(input, maxDays = 7) {
  const { date, ...rest } = input;
  const baseDate = new Date(date);
  const days = [];

  for (let i = 0; i < maxDays; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const dayStr = d.toISOString().split('T')[0];
    const dayPlan = computePlan({ ...rest, date: dayStr });
    if (dayPlan.slots?.some(s => s.beach)) {
      days.push(dayPlan);
    }
  }

  return { days, metadata: { generatedAt: new Date().toISOString(), dayCount: days.length } };
}

// ──────────────────────────────────────────────────────────────────────────────
// COMPARISON UTILITIES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compare two plans and return diff summary.
 */
export function comparePlans(planA, planB, _t) {
  const diff = {
    scoreDelta: (planB.dayScore || 0) - (planA.dayScore || 0),
    beachChanges: [],
    timeChanges: [],
    travelDelta: 0,
    summary: '',
  };

  const maxSlots = Math.max(planA.slots?.length || 0, planB.slots?.length || 0);
  for (let i = 0; i < maxSlots; i++) {
    const a = planA.slots[i];
    const b = planB.slots[i];
    if (a?.beach?.id !== b?.beach?.id) {
      diff.beachChanges.push({
        slot: i,
        from: a?.beach?.name || _t('—', '—', '—'),
        to: b?.beach?.name || _t('—', '—', '—'),
      });
    }
    if (a?.travelMin !== b?.travelMin) {
      diff.travelDelta += (b?.travelMin || 0) - (a?.travelMin || 0);
    }
  }

  diff.travelDelta = Math.round(diff.travelDelta);

  if (diff.scoreDelta > 5) diff.summary = _t('Meilleur plan global', 'Better overall plan', 'Mejor plan global');
  else if (diff.scoreDelta < -5) diff.summary = _t('Plan moins bon', 'Worse plan', 'Plan peor');
  else diff.summary = _t('Plan équivalent', 'Similar plan', 'Plan similar');

  return diff;
}

// ──────────────────────────────────────────────────────────────────────────────
// PERSISTENCE / SHARING
// ──────────────────────────────────────────────────────────────────────────────

const PLAN_STORAGE_KEY = 'sg_dynamic_plan';

export function savePlan(plan) {
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({
      ...plan,
      savedAt: new Date().toISOString(),
    }));
    return true;
  } catch { return false; }
}

export function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearPlan() {
  try { localStorage.removeItem(PLAN_STORAGE_KEY); } catch {}
}

export function planToUrlParams(plan) {
  const params = new URLSearchParams();
  params.set('plan_date', plan.date);
  params.set('plan_time', plan.startTime);
  params.set('plan_dur', String(plan.duration));
  if (plan.startPos) {
    params.set('plan_lat', String(plan.startPos.lat));
    params.set('plan_lng', String(plan.startPos.lng));
  }
  if (plan.preferences?.activities?.length) {
    params.set('plan_act', plan.preferences.activities.join(','));
  }
  return params.toString();
}

export function planFromUrlParams(search) {
  const params = new URLSearchParams(search);
  if (!params.has('plan_date')) return null;
  return {
    date: params.get('plan_date'),
    startTime: params.get('plan_time') || '09:00',
    duration: parseInt(params.get('plan_dur') || '360', 10),
    startPos: params.has('plan_lat') && params.has('plan_lng')
      ? { lat: parseFloat(params.get('plan_lat')), lng: parseFloat(params.get('plan_lng')) }
      : null,
    preferences: {
      activities: params.get('plan_act')?.split(',').filter(Boolean) || [],
    },
  };
}

export { SCORING, STATUS_SCORE, DEFAULT_PREFS, DEFAULT_CONSTRAINTS, SCENARIO_PRESETS };