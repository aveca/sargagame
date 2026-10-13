#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BLOCKING = new Set(['fatal-js', 'blank-page', 'nav-broken', 'misleading-state', 'primary-cta-dead']);
const INCIDENT_LABEL = 'autopilot-journey-alert';
const BLOCKING_LABEL = 'autopilot-blocking';
const UX_LABEL = 'autopilot-ux';
const FACTORY_REPO = 'aveca/factory-control';
const MAX_MISSIONS_24H = 2;
const MIN_GAP_HOURS = 6;

function clean(value) {
  return String(value || '')
    .replace(/Bearer\s+\S+/ig, 'Bearer [REDACTED]')
    .replace(/\b(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?/ig, raw => {
      try { const u = new URL(raw); return u.origin + u.pathname; } catch (_) { return '[url]'; }
    })
    .replace(/\s+/g, ' ').trim().slice(0, 700);
}
function defectKey(d) {
  return String(d && d.dedupKey ? d.dedupKey : [d?.domain, d?.step, d?.type, d?.detail].join('|'))
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16); }
function fingerprintForDefect(d) { return hash(defectKey(d)); }
function uniqueDefects(defects) {
  const seen = new Map();
  for (const d of Array.isArray(defects) ? defects : []) {
    const k = defectKey(d);
    if (k && k !== '|||') if (!seen.has(k)) seen.set(k, { ...d, dedupKey: k });
  }
  return [...seen.values()];
}
function severity(d) { return BLOCKING.has(String(d?.type || '')) ? 'blocking' : 'ux'; }
function runUrl(env = process.env) {
  const run = String(env.GITHUB_RUN_ID || '').trim();
  if (!run) return '';
  return String(env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '') + '/' +
    String(env.GITHUB_REPOSITORY || 'aveca/sargagame') + '/actions/runs/' + encodeURIComponent(run);
}
function affectedRuns(report, d) {
  return (report.runs || []).filter(r => r.domain === d.domain && Array.isArray(r.defects) &&
    r.defects.some(x => defectKey(x) === defectKey(d)));
}
function labelsFor(d) { return [INCIDENT_LABEL, severity(d) === 'blocking' ? BLOCKING_LABEL : UX_LABEL]; }
function titleFor(d) {
  const kind = severity(d) === 'blocking' ? 'E2E-BLOCKING' : 'E2E-UX';
  const domain = String(d.domain || 'domain-inconnu').replace(/^https?:\/\//, '').split('/')[0];
  return '[' + kind + '] ' + domain + ' / ' + String(d.step || 'étape-inconnue') + ' — ' +
    clean(d.detail || d.type || 'défaut observé').slice(0, 130);
}
function incidentBody(report, d, env = process.env) {
  const fp = fingerprintForDefect(d);
  const runs = affectedRuns(report, d);
  const viewports = [...new Set(runs.map(r => r.viewport).filter(Boolean))];
  const versions = [...new Set(runs.map(r => {
    const v = r.version || {};
    return String(v.v || 'version inconnue') + ' / ' + (v.b ? 'b=' + v.b : 'bundle inconnu');
  }))];
  return [
    '<!-- user-journey-fingerprint: ' + fp + ' -->',
    '## Défaut observé par un parcours Playwright',
    '',
    '- **Gravité :** ' + (severity(d) === 'blocking' ? 'BLOQUANT' : 'UX / non bloquant'),
    '- **Domaine :** ' + clean(d.domain || 'inconnu'),
    '- **Étape :** ' + clean(d.step || 'inconnue'),
    '- **Type :** ' + clean(d.type || 'non classé'),
    '- **Viewport(s) :** ' + (viewports.join(', ') || 'non fourni'),
    '- **Version(s) :** ' + (versions.map(clean).join('; ') || 'non disponible'),
    '- **Détail :** ' + clean(d.detail || 'aucun détail fourni'),
    '- **Rapport généré :** ' + clean(report.generatedAt || 'inconnu'),
    '- **Run :** ' + (runUrl(env) || 'lien workflow indisponible'),
    '',
    '## Critère de correction',
    severity(d) === 'blocking'
      ? 'Reproduire le parcours, corriger la cause racine, ajouter un test de régression et rejouer le parcours après livraison.'
      : 'Reproduire le signal UX, confirmer son impact, proposer une correction ciblée et un critère d’acceptation mesurable.',
    '',
    'Aucun achat ou paiement réel. Une CI verte seule ne clôt pas cet incident ; le résultat doit être vérifié en production.',
  ].join('\n');
}
function appendSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + text + '\n', 'utf8');
}

async function api(token, repo, endpoint, options = {}) {
  if (!token) throw new Error('jeton absent');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch('https://api.github.com/repos/' + repo + endpoint, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: 'Bearer ' + token,
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } finally { clearTimeout(timer); }
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { message: 'non-JSON response' }; }
  if (!response.ok) throw new Error('GitHub API ' + String(options.method || 'GET') + ' ' + repo +
    endpoint.split('?')[0] + ' HTTP ' + response.status + ': ' + clean(data.message || 'request failed').slice(0, 160));
  return data;
}
async function allIssues(token, repo, state = 'open') {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api(token, repo, '/issues?state=' + state + '&per_page=100&page=' + page);
    if (!Array.isArray(batch)) throw new Error('format issues API invalide pour ' + repo);
    all.push(...batch.filter(x => !x.pull_request));
    if (batch.length < 100) return all;
  }
  throw new Error('plus de 1000 issues ; refus fail-closed pour déduplication incomplète');
}
async function ensureLabel(token, repo, name, color, description) {
  try { await api(token, repo, '/labels/' + encodeURIComponent(name)); }
  catch (error) {
    if (!/HTTP 404/.test(error.message)) throw error;
    try {
      await api(token, repo, '/labels', { method: 'POST', body: JSON.stringify({ name, color, description }) });
    } catch (createError) {
      if (!/HTTP 422/.test(createError.message)) throw createError;
      await api(token, repo, '/labels/' + encodeURIComponent(name));
    }
  }
}
async function ensureIncidentLabels(token, repo) {
  await ensureLabel(token, repo, INCIDENT_LABEL, '7057ff', 'Défauts observés par les parcours Playwright récurrents');
  await ensureLabel(token, repo, BLOCKING_LABEL, 'd73a4a', 'Parcours utilisateur bloqué ou donnée trompeuse');
  await ensureLabel(token, repo, UX_LABEL, 'fbca04', 'Signal UX issu des parcours automatisés');
}
async function upsertIncident(token, repo, report, d, env = process.env) {
  const fp = fingerprintForDefect(d);
  const marker = '<!-- user-journey-fingerprint: ' + fp + ' -->';
  const existing = (await allIssues(token, repo, 'open')).find(x => String(x.body || '').includes(marker));
  if (existing) {
    const age = Date.now() - Date.parse(existing.updated_at || existing.created_at || 0);
    if (age >= 6 * 60 * 60 * 1000) {
      await api(token, repo, '/issues/' + existing.number + '/comments', {
        method: 'POST',
        body: JSON.stringify({ body: '## Nouvelle preuve E2E\n\n' + incidentBody(report, d, env) + '\n\nMême fingerprint : aucun doublon créé.' }),
      });
    }
    return { status: 'existing', number: existing.number, fingerprint: fp };
  }
  const issue = await api(token, repo, '/issues', {
    method: 'POST',
    body: JSON.stringify({ title: titleFor(d), body: incidentBody(report, d, env), labels: labelsFor(d) }),
  });
  return { status: 'created', number: issue.number, url: issue.html_url, fingerprint: fp };
}
function missionMarker(fp) { return '<!-- user-journey-factory-fingerprint: ' + fp + ' -->'; }
function missionBody(report, defects, fp, env = process.env) {
  const hasBlocking = defects.some(d => severity(d) === 'blocking');
  const date = new Date(report.generatedAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
  const jobId = 'journey-ux-' + fp.slice(0, 12) + '-' + date;
  const findings = defects.slice(0, 15).map(d =>
    '- [' + severity(d).toUpperCase() + '] ' + clean(d.domain) + ' / ' + clean(d.step) + ' / ' + clean(d.type) + ': ' + clean(d.detail)
  ).join('\n');
  const description = [
    'Réparer uniquement les défauts observés et reproductibles du parcours E2E.',
    'Rapport : ' + (runUrl(env) || 'voir le workflow qui a créé cette mission'),
    'Fingerprint du lot : ' + fp,
    'Défauts uniques : ' + defects.length,
    findings,
    'Ajouter des tests de régression et vérifier les parcours après livraison.',
  ].join('\n').slice(0, 1800);
  const config = {
    type: 'repair', project: 'sargagame', job_id: jobId,
    params: {
      severity: hasBlocking ? 'high' : 'medium',
      categories: ['targeted-repair'],
      description,
      requirements: [
        'reproduire la preuve E2E avant modification',
        'corriger uniquement les causes racines confirmées, sans masquer les erreurs',
        'ajouter tests de régression et exécuter npm test + npm run build',
        'PR ciblée, CI verte sur le SHA exact et audit indépendant GO sur le même SHA',
        'respecter delivery-policy v2 ; aucun booléen d’issue ne prouve une livraison',
        'vérification live post-déploiement, captures, empreintes et rollback documenté',
        'aucun achat réel ; aucun changement paiements/prix/auth/secrets/infrastructure',
      ],
    },
  };
  const fence = String.fromCharCode(96).repeat(3);
  return [
    missionMarker(fp),
    '## Mission déclenchée par les parcours E2E',
    '',
    'Lot de défauts observés ; une seule mission groupée pour limiter le bruit.',
    'Run source : ' + (runUrl(env) || 'voir workflow source'),
    '',
    '### Défauts observés', findings, '', '### Config',
    fence + 'json', JSON.stringify(config, null, 2), fence,
    '',
    'Travail autorisé dans le périmètre targeted-repair ; livraison conditionnée aux preuves réelles sur le SHA exact.',
  ].join('\n');
}
function factoryQueueGate(issues, nowMs = Date.now()) {
  const names = issue => Array.isArray(issue.labels)
    ? issue.labels.map(l => typeof l === 'string' ? l : l.name).filter(Boolean) : [];
  const pending = issues.filter(issue => issue.state === 'open' && names(issue)
    .some(label => ['factory:queued', 'factory:claimed', 'factory:running'].includes(label)));
  if (pending.length) return { allowed: false, reason: 'file Factory déjà occupée : ' + pending.slice(0, 5).map(i => '#' + i.number).join(', ') };
  const recent = issues.filter(issue => names(issue).includes('mission') &&
    Date.parse(issue.created_at || 0) >= nowMs - 24 * 60 * 60 * 1000);
  if (recent.length >= MAX_MISSIONS_24H) return { allowed: false, reason: 'plafond de deux missions sur 24 h atteint' };
  const last = [...recent].sort((a,b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
  if (last && nowMs - Date.parse(last.created_at) < MIN_GAP_HOURS * 60 * 60 * 1000) {
    return { allowed: false, reason: 'délai minimal de six heures depuis la dernière mission non écoulé' };
  }
  return { allowed: true, reason: 'file visible libre et quotas respectés' };
}
async function handoffFactory(token, report, defects, env = process.env) {
  if (!defects.length) return { status: 'not-needed', reason: 'aucun défaut observé' };
  if (!token) return { status: 'blocked', reason: 'FACTORY_CONTROL_TOKEN absent : notification possible, création cross-repo non autorisée' };
  const issues = await allIssues(token, FACTORY_REPO, 'all');
  const fp = hash(defects.map(defectKey).sort().join('\n'));
  const marker = missionMarker(fp);
  const existing = issues.find(x => String(x.body || '').includes(marker));
  if (existing && existing.state === 'open') return { status: 'existing', number: existing.number, url: existing.html_url, fingerprint: fp };
  const gate = factoryQueueGate(issues);
  if (!gate.allowed) return { status: 'deferred', reason: gate.reason, fingerprint: fp };
  await ensureLabel(token, FACTORY_REPO, 'factory:queued', '78aee8', 'Mission prête à être traitée par Factory V3');
  await ensureLabel(token, FACTORY_REPO, 'mission', '663399', 'Factory V3 lifecycle');
  if (existing && existing.state === 'closed') {
    await api(token, FACTORY_REPO, '/issues/' + existing.number, {
      method: 'PATCH', body: JSON.stringify({ state: 'open', labels: ['factory:queued', 'mission'] }),
    });
    await api(token, FACTORY_REPO, '/issues/' + existing.number + '/comments', {
      method: 'POST', body: JSON.stringify({ body: 'Défauts toujours présents dans le run ' + runUrl(env) + '. Réouverture après vérification des quotas. Fingerprint : ' + fp }),
    });
    return { status: 'reopened', number: existing.number, url: existing.html_url, fingerprint: fp };
  }
  const issue = await api(token, FACTORY_REPO, '/issues', {
    method: 'POST',
    body: JSON.stringify({
      title: '[Mission] user-journey-autofix-' + fp.slice(0, 10) + ' — corriger défauts E2E confirmés',
      body: missionBody(report, defects, fp, env),
      labels: ['factory:queued', 'mission'],
    }),
  });
  return { status: 'created', number: issue.number, url: issue.html_url, fingerprint: fp, gate: gate.reason };
}

async function main() {
  const arg = process.argv.indexOf('--report');
  const reportPath = arg >= 0 ? process.argv[arg + 1] : path.join(process.cwd(), 'user-journey-report.json');
  if (!reportPath || !fs.existsSync(reportPath)) throw new Error('rapport de parcours absent');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!report || !Array.isArray(report.runs) || !Array.isArray(report.defects) || !report.summary ||
      !Number.isFinite(Number(report.summary.runs))) throw new Error('format du rapport de parcours invalide');
  const defects = uniqueDefects(report.defects);
  const repo = String(process.env.GITHUB_REPOSITORY || 'aveca/sargagame');
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const result = {
    generatedAt: new Date().toISOString(), sourceReportAt: report.generatedAt || null,
    sourceRun: runUrl(), repo, uniqueDefects: defects.length, incidents: [], factoryHandoff: null,
  };
  if (!token) result.incidentError = 'GITHUB_TOKEN absent : impossible de notifier les incidents';
  else {
    try {
      await ensureIncidentLabels(token, repo);
      for (const d of defects.slice(0, 40)) result.incidents.push(await upsertIncident(token, repo, report, d));
      result.incidentOverflow = Math.max(0, defects.length - 40);
    } catch (e) { result.incidentError = clean(e.message || e); }
  }
  try { result.factoryHandoff = await handoffFactory(process.env.FACTORY_CONTROL_TOKEN || '', report, defects); }
  catch (e) { result.factoryHandoff = { status: 'blocked', reason: clean(e.message || e) }; }
  const out = path.resolve(process.cwd(), 'user-journey-notification.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
  const created = result.incidents.filter(x => x.status === 'created').length;
  const existing = result.incidents.filter(x => x.status === 'existing').length;
  appendSummary([
    '## User journey notifications + Factory handoff', '',
    '- Défauts uniques : **' + defects.length + '**',
    '- Incidents créés : **' + created + '** ; incidents existants dédupliqués : **' + existing + '**',
    '- Handoff Factory : **' + String(result.factoryHandoff?.status || 'unknown').toUpperCase() + '**',
    '- Détail handoff : ' + clean(result.factoryHandoff?.reason || result.factoryHandoff?.url || result.factoryHandoff?.status || 'aucun défaut'),
    result.incidentError ? '- **Erreur notification :** ' + result.incidentError : '',
    result.incidentOverflow ? '- Défauts non matérialisés (plafond 40/run) : ' + result.incidentOverflow : '',
    '', 'Rapport structuré : user-journey-notification.json (artefact du workflow).',
  ].filter(Boolean).join('\n'));
  console.log(JSON.stringify({
    uniqueDefects: defects.length, incidentCreated: created, incidentExisting: existing,
    incidentError: result.incidentError || null, factoryHandoff: result.factoryHandoff, output: out,
  }, null, 2));
  if (result.incidentError) process.exitCode = 1;
  if (['blocked','deferred'].includes(result.factoryHandoff?.status)) console.log('::warning::Handoff Factory non effectué ; consulter résumé et artefact.');
}
if (require.main === module) main().catch(error => {
  const message = clean(error.message || error);
  console.error('USER_JOURNEY_NOTIFY_FAILED=' + message);
  appendSummary('## User journey notification — ÉCHEC\n\n' + message);
  process.exit(1);
});
module.exports = {
  BLOCKING, INCIDENT_LABEL, BLOCKING_LABEL, UX_LABEL, defectKey, hash, fingerprintForDefect,
  uniqueDefects, severity, runUrl, titleFor, incidentBody, labelsFor, missionBody, factoryQueueGate, clean,
};
