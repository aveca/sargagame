/**
 * h2s.cjs — INDICE DE RISQUE H2S par plage (source unique, comme reliability-data.cjs).
 *
 * ⚠️ HONNÊTETÉ : c'est un RISQUE DÉRIVÉ, jamais une mesure de gaz. Aucun capteur H2S
 * terrain. Le H2S (odeur d'œuf pourri) vient de la sargasse ACCUMULÉE qui POURRIT —
 * on le dérive de signaux first-party déjà produits par le pipeline :
 *   - mass       : masse en décomposition = max(afai effectif, peakDecayed) (demi-vie 3,5j)
 *   - consecDays : jours consécutifs récents à AFAI ≥ 0,15 (frais ~1j → peu de gaz ; 4-5j = putréfaction)
 *   - sheltered  : baie peu ventilée (le gaz stagne) — optionnel
 *   - windSpeed  : vent faible <8 km/h (dispersion mauvaise) — optionnel
 *
 * Le VOLUME porte, la DÉCOMPOSITION amplifie, la STAGNATION majore. Plage propre
 * (mass < 0,15) → 0, jamais d'alarme inventée (cf. forecast_floor_ban / overprediction calme).
 * Mêmes valeurs que le proto vérifié design/proto-h2s-health-index.html
 * (calme 0,09/1j = 0 · modéré 0,34/3j/ouvert = 44 · élevé 0,58/5j/baie/vent6 = 100).
 */
'use strict';

const CLEAN_FLOOR = 0.15; // sous ce seuil AFAI : plage propre, risque nul

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/**
 * @param {{mass:number, consecDays:number, sheltered?:boolean, windSpeed?:number}} s
 * @returns {{score:number, level:'low'|'moderate'|'high', signals:object}}
 */
function deriveH2S(s) {
  const mass = Number(s && s.mass) || 0;
  const consecDays = Math.max(0, Number(s && s.consecDays) || 0);
  const sheltered = !!(s && s.sheltered);
  const windSpeed = (s && s.windSpeed != null) ? Number(s.windSpeed) : null;

  // Plage propre = aucun risque (pas de masse à pourrir).
  if (mass < CLEAN_FLOOR) {
    return { score: 0, level: 'low', signals: { mass: round2(mass), consecDays, sheltered, windSpeed, vol: 0, rot: 0, trap: 0 } };
  }

  const vol = clamp((mass - CLEAN_FLOOR) / 0.40, 0, 1);     // volume présent (0,15→0,55 = 0→1)
  const rot = clamp((consecDays - 1) / 4, 0, 1);            // degré de décomposition (1j→5j)
  const lowWind = windSpeed != null && windSpeed < 8;
  const trap = 0.20 * (sheltered ? 1 : 0) + 0.12 * (lowWind ? 1 : 0); // stagnation (majoration)

  const score = Math.round(clamp((vol * 0.55 + rot * 0.35) * (1 + trap), 0, 1) * 100);
  const level = score < 25 ? 'low' : score < 60 ? 'moderate' : 'high';

  return {
    score,
    level,
    signals: { mass: round2(mass), consecDays, sheltered, windSpeed, vol: round2(vol), rot: round2(rot), trap: round2(trap) },
  };
}

function round2(v) { return Math.round(v * 100) / 100; }

module.exports = { deriveH2S, CLEAN_FLOOR };

// ── Test offline (node scripts/lib/h2s.cjs) — doit matcher le proto vérifié ──
if (require.main === module) {
  const cases = [
    ['calme   ', { mass: 0.09, consecDays: 1 }, 0, 'low'],
    ['modéré  ', { mass: 0.34, consecDays: 3, sheltered: false }, 44, 'moderate'],
    ['élevé   ', { mass: 0.58, consecDays: 5, sheltered: true, windSpeed: 6 }, 100, 'high'],
    ['frais-lourd (1j ventilé)', { mass: 0.50, consecDays: 1, sheltered: false, windSpeed: 20 }, null, null],
    ['vieux-léger (6j baie)   ', { mass: 0.16, consecDays: 6, sheltered: true, windSpeed: 5 }, null, null],
  ];
  let ok = true;
  for (const [name, input, expScore, expLevel] of cases) {
    const r = deriveH2S(input);
    const pass = expScore == null || (r.score === expScore && r.level === expLevel);
    if (!pass) ok = false;
    console.log(`${pass ? '✓' : '✗'} ${name}  score=${r.score} level=${r.level}${expScore != null ? `  (attendu ${expScore}/${expLevel})` : ''}`);
  }
  console.log(ok ? '\nTOUS LES CAS ATTENDUS PASSENT' : '\n✗ ÉCHEC');
  process.exit(ok ? 0 : 1);
}
