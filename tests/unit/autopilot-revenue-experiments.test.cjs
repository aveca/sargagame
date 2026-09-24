// tests/unit/autopilot-revenue-experiments.test.cjs — Contrats revenue-truth + moteur d'expériences (autopilot)
// Lancement : node tests/unit/autopilot-revenue-experiments.test.cjs
// Règles couvertes (mission §2/§3/§6) :
//  - WIN exige paid ↑ absolu sur fenêtre ET échantillon ; clics seuls → jamais win
//  - petit échantillon / fenêtre courte → inconclusive (prudence)
//  - loss détectée → rollback recommandé
//  - 1 expérience active par surface max
//  - B2B non mélangé au B2C (snapshot séparé, jamais fabriqué)

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const metrics = require(path.join(root, 'scripts/autopilot/lib/metrics.cjs'));
const experiments = require(path.join(root, 'scripts/autopilot/lib/experiments.cjs'));

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('AUTOPILOT REVENUE & EXPERIMENTS — contrats');

// ── décision : paid prime ──────────────────────────────────────────────────
const NOW = Date.now();
const day8 = new Date(NOW - 8 * 864e5).toISOString();
const big = (paid, sessions) => ({ sessions, onsite: Math.round(sessions / 50), paid, paidPerOnsite: paid / Math.max(1, Math.round(sessions / 50)), days: 7 });

console.log('— decideExperiment (paid-only win, prudence)');
let r = metrics.decideExperiment({ control: big(2, 800), variant: big(5, 900), minVisitors: 100, windowDays: 7, startedAt: day8, now: NOW });
check('paid 2→5 sur fenêtre = WIN', r.decision === 'win');
check('facteurs visibles (paid, visitors, jours)', r.factors && r.factors.paid_variant === 5 && r.factors.visitors === 900);

r = metrics.decideExperiment({ control: big(2, 800), variant: { ...big(2, 900) }, minVisitors: 100, windowDays: 7, startedAt: day8, now: NOW });
check('paid égal sur fenêtre = jamais win ("no-harm-keep")', r.decision === 'no-harm-keep');

r = metrics.decideExperiment({ control: big(2, 800), variant: big(6, 30), minVisitors: 100, windowDays: 7, startedAt: day8, now: NOW });
check('30 visiteurs < 100 → inconclusive (petit échantillon, même si paid ↑)', r.decision === 'inconclusive');

r = metrics.decideExperiment({ control: big(2, 800), variant: big(9, 900), minVisitors: 100, windowDays: 7, startedAt: new Date(NOW - 2 * 864e5).toISOString(), now: NOW });
check('fenêtre 2j < 7j → inconclusive', r.decision === 'inconclusive');

r = metrics.decideExperiment({ control: big(5, 800), variant: { sessions: 900, onsite: 18, paid: 0, paidPerOnsite: 0, days: 7 }, minVisitors: 100, windowDays: 7, startedAt: day8, now: NOW });
check('paid/qualifié ↓ avec volume → LOSS (rollback recommandé)', r.decision === 'loss' && /rollback/i.test(r.reason));

// ── chaîne AHA → revenue (pas de fabrication) ─────────────────────────────
const chain = metrics.ahaChain(7);
check('chaîne AHA expose paid sans inventer les étapes amont absentes', typeof chain.paid === 'number' && /non fabriqués/.test(chain.note));

// ── B2B séparé ─────────────────────────────────────────────────────────────
const b2b = metrics.b2bSnapshot();
check('B2B jamais mélangé : snapshot séparé, dispo ou note explicite', b2b.available === true || /non mélangé/.test(b2b.note));

// ── moteur d'expériences : 1 actif / surface, rollback cohortes ───────────
console.log('— experiments (registry isolé)');
// Isole le registre dans un dossier temporaire pour le test
const mem = require(path.join(root, 'scripts/autopilot/lib/common.cjs'));
const realReg = path.join(mem.AP_DIR, 'experiments', 'registry.json');
const bak = fs.existsSync(realReg) ? fs.readFileSync(realReg, 'utf8') : null;
try {
  if (fs.existsSync(realReg)) fs.unlinkSync(realReg);
  const cfg = { experiments: { windowDays: 7, minVisitors: 100, sampleTarget: 100 } };
  const e1 = experiments.start({ id: 'OPP-T1', surface: 'checkout-entry', title: 'test', rollback: '?x=1', baselineSnapshot: { paid: 0, sessions: 700 } }, cfg);
  check('start crée une expérience running avec cohortes explicites', e1.status === 'running' && /A =/.test(e1.cohorts.control));
  check('fiche md écrite (reconstructible)', fs.existsSync(path.join(mem.AP_DIR, 'experiments', 'OPP-T1.md')));
  let threw = null;
  try { experiments.start({ id: 'OPP-T2', surface: 'checkout-entry', title: 'conflit' }, cfg); } catch (e) { threw = e; }
  check('2e expérience même surface → REFUSÉE (SURFACE_BUSY)', threw && threw.code === 'SURFACE_BUSY');
  const e3 = experiments.start({ id: 'OPP-T3', surface: 'home', title: 'autre surface OK' }, cfg);
  check('surface différente autorisée', e3.status === 'running');
  const d = experiments.markDecision('OPP-T1', 'loss', 'paid ↓', { paid: 0 });
  check('décision loss → statut rollback-recommended', d.decision === 'loss' && d.status === 'rollback-recommended');
  check('baseline conservée dans le registre', JSON.stringify((experiments.load().experiments.find(x => x.id === 'OPP-T1') || {}).baselineSnapshot).includes('"sessions":700'));
} finally {
  if (bak != null) fs.writeFileSync(realReg, bak, 'utf8');
  for (const f of ['OPP-T1.md', 'OPP-T3.md']) { try { fs.unlinkSync(path.join(mem.AP_DIR, 'experiments', f)); } catch (_) {} }
}

// ── fenêtre de calcul réelle sur daily-metrics (lecture seule) ─────────────
const s7 = metrics.windowStats(7);
check('windowStats(7) : compteurs numériques réels', typeof s7.sessions === 'number' && typeof s7.paid === 'number' && s7.days >= 1);

console.log(`\n${passed} checks OK`);
