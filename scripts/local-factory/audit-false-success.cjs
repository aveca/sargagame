#!/usr/bin/env node
/**
 * audit-false-success.cjs — Audit P0 : détection des « faux succès »
 *
 * Un faux succès = une tâche marquée `task.success` / `task_success` alors que
 * le dernier événement la concernant est un `code_task.semaphore_wait`
 * (attente sémaphore) : aucune exécution réelle n'a eu lieu.
 *
 * L'audit est en LECTURE STRICTE : il n'efface aucun historique, ne modifie
 * aucun fichier de log, ne réexécute aucune tâche. Il produit :
 *   - un rapport lisible (stdout)
 *   - un registre JSON horodaté dans state/ (source pour le reclassement)
 *
 * Usage :
 *   node scripts/local-factory/audit-false-success.cjs [--json-only]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.FACTORY_STATE_DIR || path.join(__dirname, 'state');
const LOGS_DIR = process.env.FACTORY_LOGS_DIR || path.join(__dirname, 'logs');
const REGISTRY_FILE = path.join(STATE_DIR, 'false-success-audit.json');

// Fenêtre de corrélation : un task.success dans les 10 s après un semaphore_wait
// pour la MÊME tâche, sans task.start intermédiaire, est un faux succès.
const CORRELATION_WINDOW_MS = 10_000;

function loadEvents() {
  if (!fs.existsSync(LOGS_DIR)) return [];
  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => /^factory-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort();
  const events = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8').split('\n').filter(Boolean);
    lines.forEach((line, i) => {
      try {
        const ev = JSON.parse(line);
        events.push({ ...ev, file: f, line: i + 1 });
      } catch (_) { /* ligne tronquée : ignorée, l'historique reste intact */ }
    });
  }
  events.sort((a, b) => new Date(a.t) - new Date(b.t));
  return events;
}

function audit() {
  const events = loadEvents();
  const perTask = new Map(); // id -> dernier événement vu
  const falseSuccesses = [];
  let realSuccess = 0;
  let realError = 0;
  let semaphoreWaits = 0;

  for (const ev of events) {
    const id = ev.id || ev.taskId;
    if (ev.event === 'code_task.semaphore_wait') semaphoreWaits++;
    if (ev.event === 'task.success' || ev.event === 'task_success') {
      const prev = perTask.get(id);
      const fresh = prev
        && prev.event === 'code_task.semaphore_wait'
        && new Date(ev.t) - new Date(prev.t) <= CORRELATION_WINDOW_MS;
      if (fresh) {
        falseSuccesses.push({
          taskId: id,
          declaredAt: ev.t,
          declaredBy: ev.event,
          durationMs: typeof ev.duration === 'number' ? ev.duration : null,
          waitDeclaredAt: prev.t,
          reason: prev.reason || null,
          evidence: `${prev.file}:${prev.line} (semaphore_wait) -> ${ev.file}:${ev.line} (${ev.event})`,
          verdict: 'semaphore_wait -> success sans exécution',
          reclassification: 'needs_review',
        });
      } else {
        realSuccess++;
      }
    } else if (ev.event === 'task.error' || ev.event === 'task_error') {
      realError++;
    }
    if (id) perTask.set(id, ev);
  }

  const byDay = {};
  for (const f of falseSuccesses) {
    const day = f.declaredAt.slice(0, 10);
    (byDay[day] = byDay[day] || []).push(f.taskId);
  }

  return { events, falseSuccesses, realSuccess, realError, semaphoreWaits, byDay };
}

const result = audit();

const report = {
  generatedAt: new Date().toISOString(),
  scope: {
    logsDir: LOGS_DIR,
    eventsRead: result.events.length,
    correlationWindowMs: CORRELATION_WINDOW_MS,
  },
  summary: {
    semaphoreWaits: result.semaphoreWaits,
    falseSuccesses: result.falseSuccesses.length,
    successesDeclared: result.falseSuccesses.length + result.realSuccess,
    successesWithExecutionEvidence: result.realSuccess,
    taskErrors: result.realError,
  },
  falseSuccessesByDay: Object.fromEntries(
    Object.entries(result.byDay).map(([day, ids]) => [day, { count: ids.length, taskIds: [...new Set(ids)] }])
  ),
  falseSuccesses: result.falseSuccesses,
};

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(REGISTRY_FILE, JSON.stringify(report, null, 2));

if (!process.argv.includes('--json-only')) {
  console.log('=== AUDIT FAUX SUCCÈS — FACTORY SARGAGAME (lecture seule) ===');
  console.log(`Logs analysés        : ${LOGS_DIR}`);
  console.log(`Événements lus       : ${result.events.length}`);
  console.log(`Attentes sémaphore   : ${result.semaphoreWaits}`);
  console.log(`Succès déclarés      : ${result.falseSuccesses.length + result.realSuccess}`);
  console.log(`  ↘ avec exécution   : ${result.realSuccess}`);
  console.log(`  ↘ FAUX (à revoir)  : ${result.falseSuccesses.length}`);
  console.log(`Erreurs réelles      : ${result.realError}`);
  console.log('--- faux succès par jour ---');
  for (const [day, info] of Object.entries(report.falseSuccessesByDay)) {
    console.log(`  ${day} : ${info.count} (${info.taskIds.slice(0, 6).join(', ')}${info.taskIds.length > 6 ? ', …' : ''})`);
  }
  console.log(`Registre écrit       : ${REGISTRY_FILE}`);
}

module.exports = { audit, REGISTRY_FILE };
