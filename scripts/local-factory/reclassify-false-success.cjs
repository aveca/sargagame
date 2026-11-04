#!/usr/bin/env node
/**
 * reclassify-false-success.cjs — Phase 2 : reclassement des faux succès
 *
 * À partir du registre produit par audit-false-success.cjs, ce script :
 *   1. sauvegarde .ai/autopilot/queue.json AVANT toute modification,
 *   2. reclasse en `needs_review` toute opportunité déjà déclarée « succès »
 *      sans exécution réelle (le succès est révoqué, la tâche n'est PAS
 *      réexécutée : elle attend une revue),
 *   3. écrit un registre durable .ai/autopilot/needs-review.json,
 *   4. journalise l'opération (état + log factory).
 *
 * Idempotent : réexécuter ne duplique rien et ne perd aucune information.
 * Aucune tâche historique n'est réexécutée, aucun historique n'est effacé.
 *
 * Usage : node scripts/local-factory/reclassify-false-success.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(path.dirname(__dirname));
const AI_DIR = path.join(ROOT, '.ai');
const STATE_DIR = process.env.FACTORY_STATE_DIR || path.join(__dirname, 'state');
const LOGS_DIR = process.env.FACTORY_LOGS_DIR || path.join(__dirname, 'logs');
const QUEUE_FILE = path.join(AI_DIR, 'autopilot', 'queue.json');
const AUDIT_FILE = path.join(STATE_DIR, 'false-success-audit.json');
const REGISTER_FILE = path.join(AI_DIR, 'autopilot', 'needs-review.json');
const BACKUP_DIR = path.join(STATE_DIR, 'backups');

const DRY_RUN = process.argv.includes('--dry-run');

function journal(event, data = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data }) + '\n';
  const file = path.join(LOGS_DIR, `factory-${new Date().toISOString().slice(0, 10)}.jsonl`);
  try { fs.appendFileSync(file, line); } catch (_) { /* logs absents : non bloquant */ }
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOGS_DIR, 'reclassification.log'), line);
  } catch (_) {}
  console.log(`[reclassify] ${event}`, data);
}

// Agrége le registre d'audit par taskId (complet, sans doublon)
function aggregate(audit) {
  const byTask = new Map();
  for (const f of audit.falseSuccesses) {
    const cur = byTask.get(f.taskId) || {
      taskId: f.taskId,
      falseDeclarations: 0,
      firstDeclaredAt: f.declaredAt,
      lastDeclaredAt: f.declaredAt,
      declaredBy: new Set(),
      reasons: new Set(),
      evidence: [],
    };
    cur.falseDeclarations++;
    if (f.declaredAt < cur.firstDeclaredAt) cur.firstDeclaredAt = f.declaredAt;
    if (f.declaredAt > cur.lastDeclaredAt) cur.lastDeclaredAt = f.declaredAt;
    cur.declaredBy.add(f.declaredBy);
    if (f.reason) cur.reasons.add(f.reason);
    if (cur.evidence.length < 3) cur.evidence.push(f.evidence);
    byTask.set(f.taskId, cur);
  }
  return [...byTask.values()].map(t => ({
    ...t,
    declaredBy: [...t.declaredBy],
    reasons: [...t.reasons],
  }));
}

function main() {
  if (!fs.existsSync(AUDIT_FILE)) {
    console.error('Registre d audit absent : lancez audit-false-success.cjs d abord.');
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
  const aggregated = aggregate(audit);
  const byTask = new Map(aggregated.map(t => [t.taskId, t]));

  if (!fs.existsSync(QUEUE_FILE)) {
    console.error('.ai/autopilot/queue.json absent — rien à reclasser.');
    process.exit(0);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (!DRY_RUN) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(QUEUE_FILE, path.join(BACKUP_DIR, `queue.json.${ts}.AVANT`));
    journal('reclassify.backup', { file: path.join(BACKUP_DIR, `queue.json.${ts}.AVANT`) });
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const reclassified = [];
  const already = [];

  for (const opp of queue.opportunities || []) {
    const rec = byTask.get(opp.id);
    if (!rec) continue;
    if (opp.status === 'needs_review') { already.push(opp.id); continue; }
    reclassified.push(opp.id);
    if (DRY_RUN) continue;
    const previousStatus = opp.status;
    opp.status = 'needs_review';
    opp.reviewReason = 'succès déclaré sans exécution réelle (attente sémaphore) — revue requise';
    opp.reclassification = {
      previousStatus,
      verdict: 'semaphore_wait -> task.success sans preuve d exécution',
      falseDeclarations: rec.falseDeclarations,
      firstDeclaredAt: rec.firstDeclaredAt,
      lastDeclaredAt: rec.lastDeclaredAt,
      detectedAt: new Date().toISOString(),
      evidence: rec.evidence,
      action: 'relire la preuve puis repasser status=new pour exécution réelle',
      source: 'state/false-success-audit.json (scripts/local-factory/audit-false-success.cjs)',
    };
  }

  // Registre durable : TOUTES les tâches à faux succès (pas seulement celles
  // encore présentes dans la file autopilot) — aucune trace n'est perdue.
  const register = {
    generatedAt: new Date().toISOString(),
    source: 'scripts/local-factory/audit-false-success.cjs',
    policy: 'Un succès déclaré sans preuve d exécution est révoqué = needs_review. Aucune réexécution automatique.',
    totalFalseSuccesses: audit.falseSuccesses.length,
    distinctTasks: aggregated.length,
    reclassifiedInQueue: reclassified,
    alreadyReview: already,
    tasks: aggregated,
  };

  if (DRY_RUN) {
    console.log('=== DRY RUN ===');
    console.log(`À reclasser : ${reclassified.length} -> ${reclassified.join(', ')}`);
    console.log(`Déjà needs_review : ${already.length}`);
    console.log(`Tâches distinctes à faux succès (registre) : ${aggregated.length}`);
    return;
  }

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  fs.writeFileSync(REGISTER_FILE, JSON.stringify(register, null, 2));

  journal('reclassify.complete', {
    reclassified: reclassified.length,
    alreadyReview: already.length,
    distinctTasks: aggregated.length,
    queueFile: path.relative(ROOT, QUEUE_FILE),
    register: path.relative(ROOT, REGISTER_FILE),
  });
  console.log(`Reclassées needs_review : ${reclassified.length} (${reclassified.join(', ')})`);
  console.log(`Registre : ${REGISTER_FILE}`);
}

main();
