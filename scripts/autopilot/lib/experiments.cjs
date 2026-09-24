#!/usr/bin/env node
/**
 * experiments.cjs — moteur d'expérimentation prudent (mission §3/§5).
 *
 * Règles DURES :
 *  - UNE expérience active par surface (home | beach | premium | checkout-entry | b2b)
 *  - cohortes explicites : A = état antérieur (fenêtre pré-ship) · B = post-ship
 *    (rollback instantané = flag ?<flag>=1 documenté par l'opportunité)
 *  - baseline CONSERVÉE (snapshot metrics à l'activation) — reconstructible après coup
 *  - décision via metrics.decideExperiment — le paid prime, les clics jamais
 *  - 100/500/1000 = RAILS d'échantillonnage (minVisitors paliers), jamais 1000 variantes
 *
 * Registre : .ai/autopilot/experiments/registry.json + une fiche md par expérience.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { AP_DIR, readJSON, writeJSON, nowIso } = require('./common.cjs');

const REG = path.join(AP_DIR, 'experiments', 'registry.json');
const SURFACES = ['home', 'beach', 'premium', 'checkout-entry', 'b2b', 'misc'];

function load() { return readJSON(REG, { experiments: [] }); }
function save(reg) { writeJSON(REG, reg); }

function activeForSurface(surface, reg = load()) {
  return (reg.experiments || []).find(e => e.surface === surface && e.status === 'running') || null;
}

/**
 * Démarre une expérience (au ship/verified). Lève si surface déjà occupée.
 * experiment = {id (oppId), surface, hypothesis, variant, rollback, metric, startedAt,
 *   windowDays, sampleTarget, cohorts, baselineSnapshot, status:'running'}
 */
function start(exp, cfg) {
  const reg = load();
  if (!SURFACES.includes(exp.surface)) throw new Error(`surface inconnue : ${exp.surface}`);
  const active = activeForSurface(exp.surface, reg);
  if (active) {
    const err = new Error(`surface "${exp.surface}" occupée par ${active.id} (une expérience à la fois)`);
    err.code = 'SURFACE_BUSY'; err.holder = active; throw err;
  }
  const entry = {
    id: exp.id, surface: exp.surface,
    hypothesis: exp.hypothesis || exp.title || '',
    variant: 'B (post-ship, défaut)',
    cohorts: { control: 'A = fenêtre pré-ship', variant: 'B = post-ship (rollback ' + (exp.rollback || 'revert') + ')' },
    metric: exp.metric || 'paid (conversions) — vérité Mollie ; clics = signal secondaire jamais décisoire',
    sampleTarget: (cfg.experiments && cfg.experiments.sampleTarget) || 100,
    startedAt: exp.verifiedAt || nowIso(),
    windowDays: (cfg.experiments && cfg.experiments.windowDays) || 7,
    prUrl: exp.prUrl || null, branch: exp.branch || null, commit: exp.commit || null,
    rollback: exp.rollback || 'revert',
    baselineSnapshot: exp.baselineSnapshot || null,
    status: 'running', decision: null, decisionReason: null, evaluatedAt: null,
  };
  reg.experiments = reg.experiments || [];
  reg.experiments.push(entry);
  save(reg);
  fs.mkdirSync(path.join(AP_DIR, 'experiments'), { recursive: true });
  fs.writeFileSync(path.join(AP_DIR, 'experiments', exp.id + '.md'),
    `# Expérience ${exp.id} (${entry.surface})\n\n- hypothèse : ${entry.hypothesis}\n- cohortes : ${entry.cohorts.control} · ${entry.cohorts.variant}\n- métrique décisoire : ${entry.metric}\n- échantillon min : ${entry.sampleTarget} visiteurs · fenêtre ${entry.windowDays} j (depuis ${entry.startedAt})\n- PR : ${entry.prUrl} · rollback : ${entry.rollback}\n- baseline (7j pré-ship) : ${JSON.stringify(entry.baselineSnapshot)}\n`,
    'utf8');
  return entry;
}

function markDecision(id, decision, reason, snapshotAfter) {
  const reg = load();
  const e = (reg.experiments || []).find(x => x.id === id);
  if (!e) return null;
  e.status = decision === 'loss' ? 'rollback-recommended' : decision === 'win' ? 'kept' : decision === 'inconclusive' ? 'measuring' : 'kept-no-claim';
  e.decision = decision; e.decisionReason = reason;
  e.evaluatedAt = nowIso(); e.snapshotAfter = snapshotAfter || null;
  save(reg);
  return e;
}

function patch(id, p) { const reg = load(); const e = (reg.experiments || []).find(x => x.id === id); if (!e) return null; Object.assign(e, p); save(reg); return e; }
function due(now = Date.now(), cfg) {
  const wd = (cfg.experiments && cfg.experiments.windowDays) || 7;
  return (load().experiments || []).filter(e => e.status === 'running' && (now - new Date(e.startedAt).getTime()) >= wd * 864e5);
}
function failedOrRollback() { return (load().experiments || []).filter(e => e.status === 'rollback-recommended'); }

module.exports = { load, save, start, activeForSurface, markDecision, patch, due, failedOrRollback, SURFACES };
