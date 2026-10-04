#!/usr/bin/env node
/**
 * bridge.cjs — pont ChatGPT/automation → queue locale autopilot.
 *
 * Entrée distante : issues GitHub ouvertes avec le titre "[AUTOPILOT]".
 * Entrée locale : .ai/autopilot/queue.json.
 *
 * Une tâche humanGate/moneyPath n'est jamais importée pour exécution automatique.
 * Elle reste visible dans GitHub pour intervention humaine.
 */
'use strict';

const { execFileSync } = require('child_process');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');

const PRIORITY = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
const CONFIDENCE = new Set(['proven', 'observed', 'inferred']);
const FENCE = String.fromCharCode(96).repeat(3);

function gh(args, cwd = C.ROOT) {
  const isWin = process.platform === 'win32';
  const primary = isWin ? 'C:\\\\Program Files\\\\GitHub CLI\\\\gh.exe' : '/usr/local/bin/gh';
  const fallback = isWin ? 'gh.exe' : 'gh';

  try {
    return execFileSync(primary, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
      windowsHide: true,
    }).trim();
  } catch (primaryError) {
    console.log(`[bridge] gh primary path (${primary}) failed: ${primaryError.message}. Trying fallback.`);
    try {
      return execFileSync(fallback, args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
        windowsHide: true,
      }).trim();
    } catch (fallbackError) {
      console.log(`[bridge] gh fallback (${fallback}) also failed: ${fallbackError.message}`);
      throw primaryError;
    }
  }
}

function extractTask(body = '') {
  const marker = FENCE + 'json';
  const markerAt = body.indexOf('AUTOPILOT_TASK');
  const from = markerAt >= 0 ? markerAt : 0;
  const start = body.indexOf(marker, from);
  if (start < 0) return null;
  const contentStart = start + marker.length;
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
  return PRIORITY[String(value || '').toLowerCase()] || 'medium';
}

function inferPersona(task) {
  if (task.persona) return String(task.persona);
  const text = String(task.title || '') + ' ' + normalizeFiles(task.filesToModify).join(' ');
  if (/seo|sitemap|canonical|hreflang|robots/i.test(text)) return 'seo';
  if (/performance|bundle|lcp|vite/i.test(text)) return 'perf';
  return 'ui-ux';
}

function toOpportunity(task, issue) {
  const humanGate = Boolean(task.humanGate || task.moneyPath);
  const hasRecipe = Boolean(task.recipe);
  let actionable = 'agent';
  if (humanGate) actionable = 'human';
  else if (task.mode === 'auto' && hasRecipe) actionable = 'auto';

  const issueRef = {
    number: Number(issue.number),
    url: issue.url || null,
    title: issue.title || null,
  };

  return {
    id: String(task.id),
    fingerprint: 'chatgpt-issue|' + String(issue.number) + '|' + String(task.id),
    title: String(task.title),
    source: String(task.source || 'chatgpt') + ' issue #' + String(issue.number),
    severity: priorityToSeverity(task.priority),
    confidence: CONFIDENCE.has(task.confidence) ? task.confidence : 'observed',
    actionable,
    evidence: String(task.evidence || task.diagnostic || 'n/a'),
    rollback: String(task.rollback || 'revert du commit'),
    expectedImpact: String(task.metric || task.expectedImpact || 'n/a'),
    status: 'new',
    createdAt: issue.createdAt || C.nowIso(),
    scope: { files: normalizeFiles(task.filesToModify) },
    persona: inferPersona(task),
    sourceIssue: issueRef,
    task: {
      ...task,
      filesToRead: normalizeFiles(task.filesToRead),
      filesToModify: normalizeFiles(task.filesToModify),
      humanGate,
    },
  };
}

function loadOpenAutopilotIssues() {
  const out = gh([
    'issue', 'list',
    '--state', 'open',
    '--limit', '100',
    '--json', 'number,title,body,url,createdAt',
  ]);
  const issues = JSON.parse(out || '[]');
  return issues.filter(i => String(i.title || '').startsWith('[AUTOPILOT]'));
}

function commentImported(issue, opp) {
  const body = [
    '🤖 Autopilot local : tâche importée dans .ai/autopilot/queue.json.',
    '',
    '- opportunity: ' + opp.id,
    '- mode: ' + opp.actionable,
    '- humanGate: ' + Boolean(opp.task && opp.task.humanGate),
    '',
    'L’issue reste ouverte comme trace source. Aucun merge automatique.',
  ].join('\n');
  try {
    gh(['issue', 'comment', String(issue.number), '--body', body]);
  } catch (_) {
    // La trace est utile mais ne doit jamais bloquer le cycle.
  }
}

function ingestOpenIssues({ dry = false, log = console.log } = {}) {
  C.ensureDirs();
  const issues = loadOpenAutopilotIssues();
  const queue = mem.loadQueue();
  queue.opportunities = queue.opportunities || [];
  const existing = new Set(queue.opportunities.map(o => o.id));
  let imported = 0;
  let ignored = 0;

  for (const issue of issues) {
    const task = extractTask(issue.body || '');
    if (!task) {
      ignored++;
      log('[bridge] issue #' + issue.number + ' ignorée : AUTOPILOT_TASK invalide/absent');
      continue;
    }

    if (existing.has(String(task.id))) continue;

    const opp = toOpportunity(task, issue);

    if (opp.actionable === 'human') {
      ignored++;
      log('[bridge] HUMAN #' + issue.number + ' ' + opp.id + ' laissée dans GitHub');
      continue;
    }

    queue.opportunities.push(opp);
    existing.add(opp.id);
    imported++;
    log('[bridge] import #' + issue.number + ' → ' + opp.id + ' (' + opp.actionable + ')');

    if (!dry) {
      mem.writeOpportunityFile(opp);
      commentImported(issue, opp);
    }
  }

  if (imported && !dry) mem.saveQueue(queue);
return { issues: issues.length, imported, ignored };
}
function ghHealthCheck(log = console.log) {
  try {
    const version = gh(['--version']);
    log(`[bridge] Health check: gh version: ${version}`);
    return true;
  } catch (e) {
    log(`[bridge] Health check failed: ${e.message}`);
    return false;
  }
}

if (require.main === module) {
  try {
    ghHealthCheck();
    const dry = process.argv.includes('--dry');
    const result = ingestOpenIssues({ dry, log: console.log });
    console.log('BRIDGE ' + (dry ? 'DRY' : 'PASS') + ' · issues=' + result.issues + ' imported=' + result.imported + ' ignored=' + result.ignored);
  } catch (e) {
    console.error('BRIDGE ERROR: ' + e.message);
    process.exit(1);
  }
}

module.exports = {
  extractTask,
  normalizeFiles,
  inferPersona,
  toOpportunity,
  ingestOpenIssues,
  priorityToSeverity,
};
