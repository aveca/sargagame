#!/usr/bin/env node
/**
 * orientation.test.cjs — auto-découvert par scripts/run-tests.cjs (lancé en CI via
 * `npm test`). Garde-fou ANTI-RÉGRESSION du moat honnêteté sur l'orientation moyen
 * terme : on ne doit JAMAIS habiller du bruit en « tendance ».
 *
 * Invariants testés :
 *   1. Le gate de bruit refuse une tendance sur une série qui zigzague.
 *   2. Le gate ACCEPTE une tendance sur une série monotone franche.
 *   3. Sur les 5 régions LIVE aujourd'hui (historique ~19-31 j, très bruité), la
 *      direction sort à null partout — preuve que le gate tient sur la vraie donnée.
 *   4. L'orientation plage respecte l'exposition (abritée vs exposée) et n'invente
 *      rien sans donnée d'exposition.
 *   5. La phase saisonnière reste ordinale et sourcée (pas de fabrication).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const O = require('./orientation.cjs');
const { phaseForRegion, PHASES } = require('./season-climatology.cjs');

let n = 0;
function test(name, fn) { n++; try { fn(); console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const mkSeries = arr => arr.map((mean, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, mean }));

// ── 1. zigzag bruité → pas de tendance ───────────────────────────────────────
test('gate refuse une série en zigzag (bruit)', () => {
  const noisy = mkSeries([0.05, 0.12, 0.04, 0.13, 0.05, 0.14, 0.06, 0.12, 0.05, 0.13, 0.04, 0.12, 0.05, 0.13]);
  const t = O.trendUnderNoiseGate(noisy);
  assert.strictEqual(t.direction, null, `attendu null, eu ${t.direction} (rev=${t.reversals})`);
});

// ── 2. montée monotone franche → hausse ──────────────────────────────────────
test('gate accepte une montée monotone franche → hausse', () => {
  const rising = mkSeries([0.05, 0.06, 0.07, 0.09, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.28]);
  const t = O.trendUnderNoiseGate(rising);
  assert.strictEqual(t.direction, 'hausse', `attendu hausse, eu ${t.direction} (net=${t.net} swing=${t.maxDaySwing} rev=${t.reversals})`);
});

test('gate accepte une baisse monotone franche → baisse', () => {
  const falling = mkSeries([0.28, 0.26, 0.24, 0.22, 0.20, 0.18, 0.16, 0.14, 0.12, 0.10, 0.09, 0.07, 0.06, 0.05]);
  const t = O.trendUnderNoiseGate(falling);
  assert.strictEqual(t.direction, 'baisse', `attendu baisse, eu ${t.direction}`);
});

test('série trop courte → pas de tendance (null)', () => {
  const t = O.trendUnderNoiseGate(mkSeries([0.05, 0.06, 0.07]));
  assert.strictEqual(t.direction, null);
});

// ── 3. données LIVE : direction null partout (gate tient sur le réel) ─────────
test('les 5 régions live renvoient direction=null aujourd\'hui (historique court/bruité)', () => {
  const regions = { mq: '', gp: 'gp', florida: 'florida', puntacana: 'puntacana', rivieramaya: 'rivieramaya' };
  const base = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus');
  let checked = 0;
  for (const [r, dir] of Object.entries(regions)) {
    const hp = dir ? path.join(base, dir, 'history.json') : path.join(base, 'history.json');
    const bp = dir ? path.join(base, dir, 'sargassum-banks.json') : path.join(base, 'sargassum-banks.json');
    let hist, banks = {};
    try { hist = JSON.parse(fs.readFileSync(hp, 'utf8')); } catch { continue; }
    try { banks = JSON.parse(fs.readFileSync(bp, 'utf8')); } catch {}
    const o = O.regionOrientation(r, hist, banks, '2026-06-29');
    assert.strictEqual(o.direction, null, `${r}: attendu null sur historique court, eu ${o.direction}`);
    assert.ok(PHASES.includes(o.phase), `${r}: phase invalide ${o.phase}`);
    checked++;
  }
  assert.ok(checked >= 4, `attendu ≥4 régions vérifiées, eu ${checked}`);
});

// ── 4. orientation plage : exposition respectée ──────────────────────────────
test('plage abritée en pleine saison → risque-faible ; exposée → risque-eleve', () => {
  const hist = { history: [] };
  const abritee = O.beachOrientation({ id: 'x', coast: 'sheltered' }, 'mq', hist, '2026-07-15');
  const exposee = O.beachOrientation({ id: 'y', coast: 'atlantic' }, 'mq', hist, '2026-07-15');
  assert.strictEqual(abritee.outlook, 'risque-faible');
  assert.strictEqual(exposee.outlook, 'risque-eleve');
});

test('plage sans donnée d\'exposition → pas d\'orientation plage (null, on n\'invente pas)', () => {
  const o = O.beachOrientation({ id: 'z' }, 'mq', { history: [] }, '2026-07-15');
  assert.strictEqual(o, null);
});

test('hors-saison : plage exposée → risque-faible, plage abritée → epargnee', () => {
  const exposee = O.beachOrientation({ id: 'y', coast: 'atlantic' }, 'mq', { history: [] }, '2026-01-15');
  const abritee = O.beachOrientation({ id: 'x', coast: 'sheltered' }, 'mq', { history: [] }, '2026-01-15');
  assert.strictEqual(exposee.outlook, 'risque-faible');
  assert.strictEqual(abritee.outlook, 'epargnee');
});

// ── 4bis. repère de saison plage (B2C fiche) : 2 entrées réelles, jamais d'exposition ─
test('beachSeasonRepere : clean en pleine saison → tone reassure', () => {
  const r = O.beachSeasonRepere({ id: 'b', status: 'clean' }, 'mq', '2026-07-15');
  assert.strictEqual(r.tone, 'reassure');
  assert.strictEqual(r.measuredStatus, 'clean');
  assert.ok(!('exposure' in r), 'ne doit JAMAIS exposer de clé exposition');
});

test('beachSeasonRepere : avoid en pleine saison → tone check (jamais alarme)', () => {
  const r = O.beachSeasonRepere({ id: 'b', status: 'avoid' }, 'mq', '2026-07-15');
  assert.strictEqual(r.tone, 'check');
});

test('beachSeasonRepere : hors-saison → tone calm quel que soit le statut', () => {
  const clean = O.beachSeasonRepere({ id: 'b', status: 'clean' }, 'mq', '2026-01-15');
  const avoid = O.beachSeasonRepere({ id: 'b', status: 'avoid' }, 'mq', '2026-01-15');
  assert.strictEqual(clean.tone, 'calm');
  assert.strictEqual(avoid.tone, 'calm');
});

test('beachSeasonRepere : statut absent → null (on n\'invente pas)', () => {
  assert.strictEqual(O.beachSeasonRepere({ id: 'b' }, 'mq', '2026-07-15'), null);
  assert.strictEqual(O.beachSeasonRepere({ id: 'b', status: 'wat' }, 'mq', '2026-07-15'), null);
});

test('beachSeasonRepere : porte la source climatologie (preuve : sourcé, pas inventé)', () => {
  const r = O.beachSeasonRepere({ id: 'b', status: 'clean' }, 'florida', '2026-06-15');
  assert.ok(r.source && r.source.length > 10, 'source manquante');
});

// ── 5. climatologie sourcée + ordinale ───────────────────────────────────────
test('phaseForRegion renvoie une phase ordinale + une source non vide', () => {
  for (const r of ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'barbados']) {
    const p = phaseForRegion(r, '2026-06-29');
    assert.ok(PHASES.includes(p.phase), `${r}: phase ${p.phase}`);
    assert.ok(p.source && p.source.length > 10, `${r}: source manquante`);
  }
});

console.log(`\n${n} assertions orientation OK`);
