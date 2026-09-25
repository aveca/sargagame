#!/usr/bin/env node
/**
 * memory.cjs — persistance de la mémoire autopilot (.ai/autopilot/).
 * Queue, opportunités, décisions (anti-répétition), rapports de run.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { AP_DIR, paths, readJSON, writeJSON, runId, nowIso } = require('./common.cjs');

// ── Queue ────────────────────────────────────────────────────────────────────
function loadQueue() {
  return readJSON(paths.queue, { opportunities: [] });
}
function saveQueue(q) { writeJSON(paths.queue, q); }

function updateOpportunity(id, patch) {
  const q = loadQueue();
  const o = (q.opportunities || []).find(x => x.id === id);
  if (!o) return null;
  Object.assign(o, patch, { updatedAt: nowIso() });
  saveQueue(q);
  return o;
}

// ── Décisions / anti-répétition ──────────────────────────────────────────────
function loadRejected() {
  return readJSON(paths.rejected, { rejected: [] });
}
function isRejected(fingerprint) {
  const { rejected } = loadRejected();
  const now = Date.now();
  return (rejected || []).find(r =>
    r.fingerprint === fingerprint && (!r.revisitAfter || now < new Date(r.revisitAfter).getTime())
  ) || null;
}
function reject(fingerprint, reason, revisitDays = 30) {
  const d = loadRejected();
  d.rejected = d.rejected || [];
  if (!d.rejected.some(r => r.fingerprint === fingerprint)) {
    d.rejected.push({
      fingerprint, reason, at: nowIso(),
      revisitAfter: new Date(Date.now() + revisitDays * 864e5).toISOString(),
    });
    writeJSON(paths.rejected, d);
  }
}

// ── Écriture des fiches ──────────────────────────────────────────────────────
function writeOpportunityFile(opp) {
  const p = path.join(paths.opportunities, `${opp.id}.md`);
  const md = `# ${opp.id} — ${opp.title}\n\n` +
    `- **source** : ${opp.source}\n- **sévérité** : ${opp.severity} · **confiance** : ${opp.confidence}\n` +
    `- **actionable** : ${opp.actionable}${opp.recipe ? ` (recette \`${opp.recipe}\`)` : ''}\n` +
    `- **preuve** : ${opp.evidence || 'n/a'}\n- **impact attendu** : ${opp.expectedImpact || 'n/a'}\n` +
    `- **rollback** : ${opp.rollback || 'revert du commit'}\n- **statut** : ${opp.status}\n\n_Généré par l'autopilot le ${nowIso()}_\n`;
  fs.mkdirSync(paths.opportunities, { recursive: true });
  fs.writeFileSync(p, md, 'utf8');
  return p;
}

function writeRegression(id, details) {
  const p = path.join(paths.regressions, `${id}.md`);
  fs.mkdirSync(paths.regressions, { recursive: true });
  fs.writeFileSync(p, `# Régression / échec — ${id}\n\n${details}\n\n_${nowIso()}_\n`, 'utf8');
  return p;
}

// ── Rapports de run (mission : sections OBSERVED → NEXT) ─────────────────────
/**
 * report = { id, startedAt, sections: {OBSERVED:[], RESEARCHED:[], FOUND:[],
 *  IMPLEMENTED:[], TESTED:[], FAILED:[], FIXED:[], PR:[], NEXT:[]}, stopped, stopReason }
 */
function writeRunReport(report) {
  fs.mkdirSync(paths.runs, { recursive: true });
  const secs = ['OBSERVED', 'REVENUE', 'RESEARCHED', 'FOUND', 'MEASURED', 'IMPLEMENTED', 'TESTED', 'FAILED', 'FIXED', 'PR', 'NEXT'];
  const lines = [];
  lines.push(`# Autopilot run ${report.id}`);
  lines.push('');
  lines.push(`- Début : ${report.startedAt} · Fin : ${nowIso()} · Durée : ${report.durationMin ?? '?'} min`);
  lines.push(`- Statut : ${report.stopped ? `⛔ STOP — ${report.stopReason}` : report.prUrl ? `✅ cycle complet — PR ${report.prUrl}` : '✅ cycle complet (sans PR)'}`);
  lines.push('');
  for (const s of secs) {
    lines.push(`## ${s}`);
    const items = (report.sections && report.sections[s]) || [];
    if (!items.length) lines.push('- _(rien)_');
    else for (const it of items) lines.push(`- ${it}`);
    lines.push('');
  }
  const md = lines.join('\n');
  fs.writeFileSync(path.join(paths.runs, `${report.id}.md`), md, 'utf8');
  fs.writeFileSync(paths.latestMd, md, 'utf8'); // le fichier unique que le fondateur ouvre
  return path.join(paths.runs, `${report.id}.md`);
}

function newReport(id) {
  return {
    id, startedAt: nowIso(), stopped: false, stopReason: null,
    sections: { OBSERVED: [], REVENUE: [], RESEARCHED: [], FOUND: [], MEASURED: [], IMPLEMENTED: [], TESTED: [], FAILED: [], FIXED: [], PR: [], NEXT: [] },
  };
}

function listRuns(limit = 10) {
  try {
    return fs.readdirSync(paths.runs).filter(f => f.endsWith('.md')).sort().slice(-limit);
  } catch (_) { return []; }
}

module.exports = {
  loadQueue, saveQueue, updateOpportunity,
  loadRejected, isRejected, reject,
  writeOpportunityFile, writeRegression,
  newReport, writeRunReport, listRuns,
};
