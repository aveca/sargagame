#!/usr/bin/env node
/**
 * multi-repo-bridge.cjs �?" extension multi-d�p�t du bridge ChatGPT/autopilot.
 *
 * Etend scripts/autopilot/bridge.cjs pour accepter les deux d�p�ts autoris�s
 * (aveca/bot-wow, aveca/sargagame) avec routage strict, d�eduplication par
 * repository + issue number + task id, et publication de statuts GitHub.
 *
 * Contrat obligatoire de chaque t�che import�e :
 *   repository_full_name, issue_number, task_id, priority, source, mode,
 *   humanGate, moneyPath, acceptance, rollback.
 *
 * R�gles :
 *   - Un d�p�t non list� dans ALLOWED_REPOS est rejet� (jamais import�).
 *   - humanGate/moneyPath => actionable 'human', jamais ex�cut� automatiquement.
 *   - Les commentaires GitHub ordinaires ne d�clenchent jamais d'ex�cution.
 *   - Seul un format de mission explicitement autoris� ([AUTOPILOT] + bloc JSON
 *     AUTOPILOT_TASK d�limit�) peut �tre import�.
 *
 * Statuts publi�s sur l'issue de mission : imported, started, heartbeat,
 * blocked, completed, failed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');

const ALLOWED_REPOS = ['aveca/bot-wow', 'aveca/sargagame'];
const FENCE = String.fromCharCode(96).repeat(3);
const AUTOPILOT_PREFIX = '[AUTOPILOT]';

// ���� gh (reutilise la m�me r�solution d'ex�cutable que bridge.cjs)
function gh(args, cwd = C.ROOT) {
  const isWin = process.platform === 'win32';
  const primary = isWin ? 'C:\\\\Program Files\\\\GitHub CLI\\\\gh.exe' : '/usr/local/bin/gh';
  const fallback = isWin ? 'gh.exe' : 'gh';
  try {
    return execFileSync(primary, args, {
      cwd, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000, windowsHide: true,
    }).trim();
  } catch (primaryError) {
    try {
      return execFileSync(fallback, args, {
        cwd, encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000, windowsHide: true,
      }).trim();
    } catch (fallbackError) {
      throw primaryError;
    }
  }
}

// ���� Contrat obligatoire : v�rifie la pr�sence et le type des champs requis.
function requiredContract(task) {
  const required = [
    'repository_full_name', 'issue_number', 'task_id', 'priority', 'source',
    'mode', 'humanGate', 'moneyPath', 'acceptance', 'rollback',
  ];
  const missing = [];
  for (const field of required) {
    if (task[field] === undefined || task[field] === null) missing.push(field);
  }
  return { ok: missing.length === 0, missing };
}

// ���� D�p�t autoris� ?
function isAllowedRepo(repoFullName) {
  return ALLOWED_REPOS.includes(String(repoFullName));
}

// ���� Fingerprint de d�eduplication : repository + issue number + task id.
function fingerprint(repoFullName, issueNumber, taskId) {
  return 'chatp-issue|' + String(repoFullName) + '|' + String(issueNumber) + '|' + String(taskId);
}

// ���� Lire les issues [AUTOPILOT] ouvertes d'un d�p�t donn�.
function loadOpenAutopilotIssuesForRepo(repoFullName) {
  const out = gh([
    'issue', 'list', '--repo', repoFullName,
    '--state', 'open', '--limit', '100',
    '--json', 'number,title,body,url,createdAt',
  ]);
  const issues = JSON.parse(out || '[]');
  return issues.filter(i => String(i.title || '').startsWith(AUTOPILOT_PREFIX));
}

// ���� Extraire le bloc JSON AUTOPILOT_TASK du corps d'issue (m�me logique que bridge.cjs).
function extractTask(body = '') {
  const markerAt = body.indexOf('AUTOPILOT_TASK');
  const from = markerAt >= 0 ? markerAt : 0;
  const start = body.indexOf(FENCE + 'json', from);
  if (start < 0) return null;
  const contentStart = start + (FENCE + 'json').length;
  const end = body.indexOf(FENCE, contentStart);
  if (end < 0) return null;
  try {
    const task = JSON.parse(body.slice(contentStart, end).trim());
    if (!task || typeof task !== 'object') return null;
    if (!task.id || !task.title || !['agent', 'auto'].includes(task.mode)) return null;
    return task;
  } catch (_) {
    return null;
  }
}

function normalizeFiles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
}

function priorityToSeverity(value) {
  const PRIORITY = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
  return PRIORITY[String(value || '').toLowerCase()] || 'medium';
}

const CONFIDENCE = new Set(['proven', 'observed', 'inferred']);

function toOpportunity(task, issue, repoFullName) {
  if (!isAllowedRepo(repoFullName)) {
    return { rejected: true, reason: 'repository_not_allowed: ' + repoFullName };
  }

  const contract = requiredContract(task);
  if (!contract.ok) {
    return { rejected: true, reason: 'missing_contract_fields: ' + contract.missing.join(', ') };
  }

  const humanGate = Boolean(task.humanGate || task.moneyPath);
  const hasRecipe = Boolean(task.recipe);
  let actionable = 'agent';
  if (humanGate) actionable = 'human';
  else if (task.mode === 'auto' && hasRecipe) actionable = 'auto';

  const issueRef = {
    number: Number(issue.number),
    url: issue.url || null,
    title: issue.title || null,
    repository_full_name: repoFullName,
  };

  return {
    id: String(task.task_id || task.id),
    fingerprint: fingerprint(repoFullName, issue.number, task.task_id || task.id),
    title: String(task.title),
    repository_full_name: repoFullName,
    issue_number: Number(issue.number),
    source: String(task.source || 'chatgpt') + ' issue #' + String(issue.number) + ' (' + repoFullName + ')',
    severity: priorityToSeverity(task.priority),
    confidence: CONFIDENCE.has(task.confidence) ? task.confidence : 'observed',
    actionable,
    evidence: String(task.evidence || task.diagnostic || 'n/a'),
    rollback: String(task.rollback || 'revert du commit'),
    expectedImpact: String(task.metric || task.expectedImpact || 'n/a'),
    status: 'new',
    createdAt: issue.createdAt || new Date().toISOString(),
    scope: { files: normalizeFiles(task.filesToModify) },
    task: {
      ...task,
      repository_full_name: repoFullName,
      issue_number: Number(issue.number),
      filesToRead: normalizeFiles(task.filesToRead),
      filesToModify: normalizeFiles(task.filesToModify),
      humanGate,
    },
    sourceIssue: issueRef,
    acceptance: task.acceptance || 'n/a',
  };
}

// ���� Publier un statut sur l'issue de mission (commentaire GitHub).
function publishStatus(repoFullName, issueNumber, status, details = '') {
  const labels = {
    imported: 'imported',
    started: 'started',
    heartbeat: 'heartbeat',
    blocked: 'blocked',
    completed: 'completed',
    failed: 'failed',
  };
  const emoji = { imported: '📥', started: '🔄', heartbeat: '❤️', blocked: '🚫', completed: '✅', failed: '❌' };
  const body = [
    emoji[status] + ' Autopilot multi-repo — statut : **' + labels[status] + '**',
    '',
    '- d�p�t : ' + repoFullName,
    '- issue : #' + issueNumber,
    '- statut : ' + status,
    details ? '- d�tail : ' + details : '',
    '',
    '_G�n�r� automatiquement par multi-repo-bridge.cjs — pas d intervention manuelle requise pour ce statut._',
  ].filter(Boolean).join('\n');
  try {
    gh(['issue', 'comment', String(issueNumber), '--repo', repoFullName, '--body', body]);
  } catch (_) {
    // Le statut est utile mais ne doit jamais bloquer le cycle.
  }
}

// ���� Ingestion multi-d�p�t : lit les issues [AUTOPILOT] de tous les d�p�ts autoris�s.
function ingestMultiRepo({ dry = false, log = console.log } = {}) {
  C.ensureDirs();
  const queue = mem.loadQueue();
  queue.opportunities = queue.opportunities || [];
  const existing = new Set(queue.opportunities.map(o => o.fingerprint));

  let imported = 0;
  let ignored = 0;
  let rejected = 0;
  const perRepo = {};

  for (const repoFullName of ALLOWED_REPOS) {
    perRepo[repoFullName] = { issues: 0, imported: 0, ignored: 0, rejected: 0 };
    let issues;
    try {
      issues = loadOpenAutopilotIssuesForRepo(repoFullName);
    } catch (e) {
      log('[bridge] d�p�t inaccessible ' + repoFullName + ': ' + e.message);
      perRepo[repoFullName].rejected = 1;
      rejected++;
      continue;
    }
    perRepo[repoFullName].issues = issues.length;

    for (const issue of issues) {
      const task = extractTask(issue.body || '');
      if (!task) {
        ignored++;
        perRepo[repoFullName].ignored++;
        log('[bridge] ' + repoFullName + ' issue #' + issue.number + ' ignor�e : AUTOPILOT_TASK invalide/absent');
        continue;
      }

      const opp = toOpportunity(task, issue, repoFullName);
      if (opp.rejected) {
        rejected++;
        perRepo[repoFullName].rejected++;
        log('[bridge] ' + repoFullName + ' issue #' + issue.number + ' rejet�e : ' + opp.reason);
        continue;
      }

      if (existing.has(opp.fingerprint)) {
        ignored++;
        perRepo[repoFullName].ignored++;
        continue;
      }

      queue.opportunities.push(opp);
      existing.add(opp.fingerprint);
      imported++;
      perRepo[repoFullName].imported++;
      log('[bridge] import ' + repoFullName + ' #' + issue.number + ' → ' + opp.id + ' (' + opp.actionable + ')');

      if (!dry) {
        mem.writeOpportunityFile(opp);
        try { publishStatus(repoFullName, issue.number, 'imported', 'opportunité ' + opp.id + ' (' + opp.actionable + ')'); } catch (_) {}
      }
    }
  }

  if (imported && !dry) mem.saveQueue(queue);
  return { imported, ignored, rejected, perRepo };
}

if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const result = ingestMultiRepo({ dry, log: console.log });
  console.log('MULTI-REPO-BRIDGE ' + (dry ? 'DRY' : 'PASS') +
    ' · imported=' + result.imported + ' ignored=' + result.ignored + ' rejected=' + result.rejected);
  for (const [repo, stats] of Object.entries(result.perRepo)) {
    console.log('   ' + repo + ' : issues=' + stats.issues + ' imported=' + stats.imported + ' ignored=' + stats.ignored + ' rejected=' + stats.rejected);
  }
}

module.exports = {
  ALLOWED_REPOS,
  requiredContract,
  isAllowedRepo,
  fingerprint,
  loadOpenAutopilotIssuesForRepo,
  extractTask,
  toOpportunity,
  publishStatus,
  ingestMultiRepo,
};
