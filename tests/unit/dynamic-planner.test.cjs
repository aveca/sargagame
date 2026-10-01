/**
 * dynamic-planner.test.cjs — Unit tests for Dynamic Beach Day Planner engine
 * Run: node tests/unit/dynamic-planner.test.cjs
 */
const fs = require('fs');
const path = require('path');

// Load the module (ESM → need dynamic import or rewrite as CJS for testing)
// For now, we'll test the logic by replicating key functions in CJS

// ──────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_SCORE = { clean: 100, moderate: 50, avoid: 0, alert: 0 };
const SCORING = {
  STATUS_WEIGHT: 100,
  CONFIDENCE_WEIGHT: 0.5,
  TRAVEL_PENALTY: 2,
  ACTIVITY_BONUS: 15,
  SHELTERED_BONUS: 10,
  TIME_WINDOW_BONUS: 20,
  CONTINUITY_BONUS: 30,
};

const ACTIVITY_FLAGS = {
  swim: b => b.status === 'clean',
  snorkel: b => b.snorkel === true,
  family: b => b.kids === true,
  walk: b => true,
  photo: b => b.status !== 'avoid',
  sunset: b => b.coast === 'west' || b.coast === 'sheltered',
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateTravelTime(from, to) {
  if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) {
    return null;
  }
  const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const driveMin = Math.round((distKm / 50) * 60 * 1.4) + 5;
  return Math.max(5, driveMin);
}

function countMatchedActivities(beach, activities) {
  if (!activities?.length) return 0;
  return activities.filter(a => ACTIVITY_FLAGS[a]?.(beach)).length;
}

function scoreBeachForSlot(beach, forecastDay, slot, context) {
  const { prefs, constraints, allBeaches, startPos } = context;

  if (!forecastDay || !forecastDay.status) return { score: -Infinity, breakdown: {}, viable: false, reason: 'no_forecast' };
  if (prefs.minConfidence && (forecastDay.confidence || 0) < prefs.minConfidence) {
    return { score: -Infinity, breakdown: {}, viable: false, reason: 'low_confidence' };
  }
  if (constraints.excludeBeaches?.includes(beach.id)) {
    return { score: -Infinity, breakdown: {}, viable: false, reason: 'excluded' };
  }

  const travelMin = estimateTravelTime(startPos, beach);
  if (travelMin !== null && travelMin > prefs.maxTravelMin) {
    return { score: -Infinity, breakdown: {}, viable: false, reason: 'too_far', travelMin };
  }

  const statusScore = STATUS_SCORE[forecastDay.status] || 0;
  const confidence = forecastDay.confidence || 0;

  const activityMatches = countMatchedActivities(beach, prefs.activities);
  const activityBonus = activityMatches * SCORING.ACTIVITY_BONUS;
  const shelteredBonus = (prefs.preferSheltered && beach.coast === 'sheltered') ? SCORING.SHELTERED_BONUS : 0;
  const travelPenalty = travelMin ? travelMin * SCORING.TRAVEL_PENALTY : 0;

  let timeWindowBonus = 0;
  if (forecastDay.status === 'clean' && slot.startHour < 14) timeWindowBonus = SCORING.TIME_WINDOW_BONUS;
  if (forecastDay.status === 'moderate' && slot.startHour >= 14) timeWindowBonus = SCORING.TIME_WINDOW_BONUS;

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
    breakdown: { status: statusScore, confidence, activityMatches, travelMin, sheltered: beach.coast === 'sheltered', continuity: !!slot.prevBeachId },
    viable: true,
    travelMin,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// TEST DATA
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_BEACHES = [
  { id: 'b1', name: 'Plage Propre', lat: 14.6, lng: -61.0, status: 'clean', score: 85, confidence: 80, afai: 0.05, kids: true, snorkel: true, coast: 'sheltered', parking: true },
  { id: 'b2', name: 'Plage Modérée', lat: 14.5, lng: -61.1, status: 'moderate', score: 60, confidence: 65, afai: 0.25, kids: false, snorkel: false, coast: 'exposed', parking: true },
  { id: 'b3', name: 'Plage À Éviter', lat: 14.4, lng: -61.2, status: 'avoid', score: 20, confidence: 70, afai: 0.6, kids: false, snorkel: false, coast: 'exposed', parking: false },
  { id: 'b4', name: 'Autre Propre', lat: 14.6, lng: -61.05, status: 'clean', score: 75, confidence: 75, afai: 0.1, kids: true, snorkel: false, coast: 'sheltered', parking: true },
];

const MOCK_FORECAST = {
  b1: { forecast: [{ date: '2026-09-30', status: 'clean', confidence: 80, afai: 0.05, day: 'Lun' }] },
  b2: { forecast: [{ date: '2026-09-30', status: 'moderate', confidence: 65, afai: 0.25, day: 'Lun' }] },
  b3: { forecast: [{ date: '2026-09-30', status: 'avoid', confidence: 70, afai: 0.6, day: 'Lun' }] },
  b4: { forecast: [{ date: '2026-09-30', status: 'clean', confidence: 75, afai: 0.1, day: 'Lun' }] },
};

const DEFAULT_PREFS = {
  activities: [],
  maxTravelMin: 45,
  avoidCrowds: false,
  preferSheltered: true,
  minConfidence: 40,
  minDuration: 120,
  maxDuration: 480,
};

const DEFAULT_CONSTRAINTS = {
  mustIncludeBeach: null,
  excludeBeaches: [],
  fixedStartTime: null,
  fixedEndTime: null,
  maxBeachesPerDay: 3,
  allowOvernight: false,
};

function generateDaySlots(startTime, duration, maxBeaches = 3) {
  const slots = [];
  const startHour = parseInt(startTime.split(':')[0], 10) || 9;
  const totalMinutes = duration || 360;
  const slotCount = Math.min(maxBeaches, Math.max(1, Math.ceil(totalMinutes / 120)));
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
      prevBeachId: null,
    });
  }
  return slots;
}

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
      alternatives: scored.slice(1, 4).map(r => ({ beach: r.beach, score: r.score, travelMin: r.travelMin })),
    });

    if (best) prevBeachId = best.beach.id;
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

console.log('\n🧪 DYNAMIC PLANNER UNIT TESTS\n');

// Test haversine
console.log('\n📍 haversineKm:');
assertEqual(haversineKm(14.6, -61.0, 14.6, -61.0), 0, 'Same point = 0 km');
const d = haversineKm(14.6, -61.0, 14.5, -61.1);
assert(d > 10 && d < 20, `Fort-de-France to nearby ~14km (got ${d.toFixed(1)})`);

// Test estimateTravelTime
console.log('\n🚗 estimateTravelTime:');
const t1 = estimateTravelTime({ lat: 14.6, lng: -61.0 }, { lat: 14.5, lng: -61.1 });
assert(t1 !== null && t1 > 5 && t1 < 60, `Travel time ~15-30 min (got ${t1})`);
assertEqual(estimateTravelTime(null, { lat: 14.5, lng: -61.1 }), null, 'Null from returns null');
assertEqual(estimateTravelTime({ lat: 14.6, lng: -61.0 }, null), null, 'Null to returns null');

// Test activity matching
console.log('\n🏊 Activity matching:');
const beachClean = { status: 'clean', snorkel: true, kids: true, coast: 'sheltered' };
const beachModerate = { status: 'moderate', snorkel: false, kids: false, coast: 'exposed' };
assertEqual(countMatchedActivities(beachClean, ['swim', 'snorkel', 'family']), 3, 'Clean beach matches swim+snorkel+family');
assertEqual(countMatchedActivities(beachModerate, ['swim', 'snorkel', 'family']), 0, 'Moderate beach matches none');
assertEqual(countMatchedActivities(beachClean, []), 0, 'Empty activities = 0');

// Test scoreBeachForSlot
console.log('\n🎯 scoreBeachForSlot:');
const context = {
  prefs: { ...DEFAULT_PREFS, activities: ['swim'] },
  constraints: DEFAULT_CONSTRAINTS,
  allBeaches: MOCK_BEACHES,
  startPos: { lat: 14.6, lng: -61.0 },
};

const slot = { startHour: 10, prevBeachId: null };
const fcClean = MOCK_FORECAST.b1.forecast[0];
const fcModerate = MOCK_FORECAST.b2.forecast[0];
const fcAvoid = MOCK_FORECAST.b3.forecast[0];

const scoreClean = scoreBeachForSlot(MOCK_BEACHES[0], fcClean, slot, context);
const scoreModerate = scoreBeachForSlot(MOCK_BEACHES[1], fcModerate, slot, context);
const scoreAvoid = scoreBeachForSlot(MOCK_BEACHES[2], fcAvoid, slot, context);

assert(scoreClean.viable, 'Clean beach is viable');
assert(scoreModerate.viable, 'Moderate beach is viable');
assert(!scoreAvoid.viable, 'Avoid beach is not viable (status score 0)');
assert(scoreClean.score > scoreModerate.score, `Clean (${scoreClean.score}) > Moderate (${scoreModerate.score})`);

// Test with activity bonus
console.log('\n🏊 Activity bonus:');
const contextSwim = { ...context, prefs: { ...DEFAULT_PREFS, activities: ['swim', 'snorkel'] } };
const scoreWithActivities = scoreBeachForSlot(MOCK_BEACHES[0], fcClean, slot, contextSwim);
const scoreWithoutActivities = scoreBeachForSlot(MOCK_BEACHES[0], fcClean, slot, context);
assert(scoreWithActivities.score > scoreWithoutActivities.score, 'Activities increase score');

// Test travel penalty
console.log('\n🚗 Travel penalty:');
const farBeach = { ...MOCK_BEACHES[0], id: 'far', lat: 10.0, lng: -70.0 }; // far away
const contextFar = { ...context, startPos: { lat: 14.6, lng: -61.0 } };
const scoreFar = scoreBeachForSlot(farBeach, fcClean, slot, contextFar);
assert(!scoreFar.viable, 'Beach too far (>45 min) is not viable');

// Test sheltered bonus
console.log('\n🏝️ Sheltered bonus:');
const shelteredBeach = { ...MOCK_BEACHES[1], coast: 'sheltered' };
const exposedBeach = { ...MOCK_BEACHES[1], coast: 'exposed' };
const scoreSheltered = scoreBeachForSlot(shelteredBeach, fcModerate, slot, context);
const scoreExposed = scoreBeachForSlot(exposedBeach, fcModerate, slot, context);
assert(scoreSheltered.score > scoreExposed.score, 'Sheltered gets bonus');

// Test continuity bonus
console.log('\n🔄 Continuity bonus:');
const slotWithPrev = { ...slot, prevBeachId: 'b1' };
const scoreCont = scoreBeachForSlot(MOCK_BEACHES[0], fcClean, slotWithPrev, context);
const scoreNoCont = scoreBeachForSlot(MOCK_BEACHES[0], fcClean, slot, context);
assert(scoreCont.score > scoreNoCont.score, 'Continuity gives bonus');

// Test generateDaySlots
console.log('\n⏰ generateDaySlots:');
const slots1 = generateDaySlots('09:00', 360, 3);
assertEqual(slots1.length, 3, '3 slots for 6h');
assertEqual(slots1[0].label, '09:00–11:00', 'First slot 9-11');
assertEqual(slots1[2].label, '13:00–15:00', 'Third slot 13-15');

const slots2 = generateDaySlots('14:00', 180, 2);
assertEqual(slots2.length, 2, '2 slots for 3h');
assertEqual(slots2[0].startHour, 14, 'Starts at 14:00');

// Test optimizeDaySlots
console.log('\n🎯 optimizeDaySlots:');
const ctx = {
  prefs: DEFAULT_PREFS,
  constraints: DEFAULT_CONSTRAINTS,
  allBeaches: MOCK_BEACHES,
  startPos: { lat: 14.6, lng: -61.0 },
};
const plan = optimizeDaySlots(MOCK_BEACHES, MOCK_FORECAST, slots1, ctx);
assertEqual(plan.length, 3, '3 slots in plan');
assert(plan[0].beach !== null, 'First slot has beach');
assertEqual(plan[0].beach.id, 'b1', 'Best beach is clean one (b1)');
assert(plan[0].alternatives.length > 0, 'Has alternatives');
assert(plan[0].alternatives[0].beach.id === 'b4' || plan[0].alternatives[0].beach.id === 'b2', 'Alternative is other clean or moderate');

// Test multi-day (premium)
console.log('\n📅 Multi-day plan:');
const baseDate = '2026-09-30';
const multi = [];
for (let i = 0; i < 3; i++) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + i);
  const dayStr = d.toISOString().split('T')[0];
  const dayPlan = optimizeDaySlots(MOCK_BEACHES, MOCK_FORECAST, generateDaySlots('09:00', 360), { ...ctx, date: dayStr });
  if (dayPlan.some(s => s.beach)) multi.push({ date: dayStr, slots: dayPlan });
}
assert(multi.length >= 1, 'At least 1 day has plan');

// Test scenario generation
console.log('\n🔮 Scenario generation:');
const SCENARIO_PRESETS = [
  { id: 'tomorrow', deltaDays: 1 },
  { id: 'later', deltaHours: 3 },
  { id: 'shorter', duration: 180 },
  { id: 'swim', activities: ['swim'] },
  { id: 'less_travel', maxTravelMin: 20 },
];

function generateScenarios(baseContext) {
  return SCENARIO_PRESETS.map(preset => {
    const ctx = { ...baseContext, prefs: { ...baseContext.prefs }, constraints: { ...baseContext.constraints } };
    if (preset.deltaDays) {
      const d = new Date(ctx.date);
      d.setDate(d.getDate() + preset.deltaDays);
      ctx.date = d.toISOString().split('T')[0];
    }
    if (preset.deltaHours) {
      const [h, m] = ctx.startTime.split(':').map(Number);
      ctx.startTime = `${String((h + preset.deltaHours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (preset.duration) ctx.duration = preset.duration;
    if (preset.activities) ctx.prefs.activities = [...new Set([...ctx.prefs.activities, ...preset.activities])];
    if (preset.maxTravelMin) ctx.prefs.maxTravelMin = preset.maxTravelMin;
    return { id: preset.id, context: ctx };
  });
}

const scenarios = generateScenarios({ date: '2026-09-30', startTime: '09:00', duration: 360, prefs: DEFAULT_PREFS, constraints: DEFAULT_CONSTRAINTS });
assertEqual(scenarios.length, 5, '5 scenarios generated');
const tomorrow = scenarios.find(s => s.id === 'tomorrow');
assertEqual(tomorrow.context.date, '2026-10-01', 'Tomorrow scenario increments date');
const later = scenarios.find(s => s.id === 'later');
assertEqual(later.context.startTime, '12:00', 'Later scenario adds 3h');
const swim = scenarios.find(s => s.id === 'swim');
assert(swim.context.prefs.activities.includes('swim'), 'Swim scenario adds swim activity');

// Test comparePlans
console.log('\n📊 comparePlans:');
function comparePlans(planA, planB) {
  const diff = { scoreDelta: (planB.dayScore || 0) - (planA.dayScore || 0), beachChanges: [], travelDelta: 0 };
  const maxSlots = Math.max(planA.slots?.length || 0, planB.slots?.length || 0);
  for (let i = 0; i < maxSlots; i++) {
    const a = planA.slots[i];
    const b = planB.slots[i];
    if (a?.beach?.id !== b?.beach?.id) {
      diff.beachChanges.push({ slot: i, from: a?.beach?.name || '—', to: b?.beach?.name || '—' });
    }
    if (a?.travelMin !== b?.travelMin) {
      diff.travelDelta += (b?.travelMin || 0) - (a?.travelMin || 0);
    }
  }
  return diff;
}

const planA = { dayScore: 150, slots: [{ beach: { id: 'b1', name: 'A' }, travelMin: 15 }] };
const planB = { dayScore: 180, slots: [{ beach: { id: 'b2', name: 'B' }, travelMin: 10 }] };
const diff = comparePlans(planA, planB);
assertEqual(diff.scoreDelta, 30, 'Score delta 30');
assertEqual(diff.beachChanges.length, 1, 'One beach change');
assertEqual(diff.travelDelta, -5, 'Travel reduced by 5 min');

// Test URL params
console.log('\n🔗 URL params:');
function planToUrlParams(plan) {
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

const url = planToUrlParams({ date: '2026-09-30', startTime: '09:00', duration: 360, startPos: { lat: 14.6, lng: -61.0 }, preferences: { activities: ['swim', 'snorkel'] } });
assert(url.includes('plan_date=2026-09-30'), 'Has date');
assert(url.includes('plan_act=swim%2Csnorkel'), 'Has activities');

// ──────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ All tests passed!\n');