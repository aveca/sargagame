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
const SARGAGAME_REPO = 'aveca/sargagame';
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
    body: JSON.stringify({ title: titleFor(d), body: incidentBody(report, d, env), labels: labelsFor(d), assignees: ['aveca'] }),
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


const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || 'abf2b92cf718313567b4b38eb9dda17f';
const CF_D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID || '3e7179cd-8058-4881-9eea-c58527dfb3a3';
const CF_D1_QUERY_URL = 'https://api.cloudflare.com/client/v4/accounts/' +
  CF_ACCOUNT_ID + '/d1/database/' + CF_D1_DATABASE_ID + '/query';

/** Pure queue gate for the Cloudflare-D1 fallback. Enforces one active job,
 * at most two journey-repair jobs in any rolling 24h, and a 6h minimum gap. */
function d1QueueDecision(activeJob, recentJobs, nowMs = Date.now()) {
  if (activeJob) {
    return { allowed: false, reason: 'file D1 occupée par ' + String(activeJob.id || 'un job') +
      ' (' + String(activeJob.status || 'status inconnu') + ')' };
  }
  const recent = Array.isArray(recentJobs) ? recentJobs : [];
  if (recent.length >= MAX_MISSIONS_24H) {
    return { allowed: false, reason: 'plafond de deux missions D1 user-journey sur 24 h atteint' };
  }
  if (recent.length) {
    const lastAt = Date.parse(recent[0].created_at || '');
    if (!Number.isFinite(lastAt)) {
      return { allowed: false, reason: 'date de la dernière mission D1 illisible — refus prudent' };
    }
    if (nowMs - lastAt < MIN_GAP_HOURS * 60 * 60 * 1000) {
      return { allowed: false, reason: 'délai de six heures depuis la dernière mission D1 non écoulé' };
    }
  }
  return { allowed: true, reason: 'file libre et quotas respectés' };
}

function buildD1RepairJob(report, defects, env = process.env, nowMs = Date.now()) {
  const list = uniqueDefects(defects).slice(0, 15);
  const fp = hash(list.map(defectKey).sort().join('\n'));
  const rawDate = Date.parse(report.generatedAt || '');
  const jobDate = new Date(Number.isFinite(rawDate) ? rawDate : nowMs).toISOString().slice(0, 10).replace(/-/g, '');
  const id = 'journey-ux-' + fp.slice(0, 12) + '-' + jobDate;
  const findings = list.map(d =>
    '- [' + severity(d).toUpperCase() + '] ' + clean(d.domain) + ' / ' +
    clean(d.step) + ' / ' + clean(d.type) + ': ' + clean(d.detail)
  ).join('\n');
  const prompt = [
    'MISSION AUTONOME — CORRECTION CIBLÉE DES PARCOURS UTILISATEUR SARGAGAME',
    '',
    'Source : audit Playwright récurrent des six domaines Sargagame.',
    'Job ID : ' + id,
    'Fingerprint : ' + fp,
    'Run source : ' + (runUrl(env) || 'voir le workflow user-journey-audit'),
    '',
    'Défauts observés (dédupliqués) :',
    findings || '- Aucun défaut exploitable ; vérifier le rapport source.',
    '',
    'Procédure obligatoire :',
    '1. Reproduire chaque défaut à partir du rapport, du code source et du build avant modification.',
    '2. Ne corriger que les causes racines effectivement reproductibles ; ignorer un faux positif avec une preuve écrite.',
    '3. Périmètre exclusif : UX, contenu utile, navigation, lisibilité et performances de Sargagame.',
    '4. Ajouter ou corriger des tests de régression. Exécuter npm test et npm run build.',
    '5. Garder le diff minimal et sous le budget bundle existant. Ne jamais masquer une erreur ou falsifier un état.',
    '6. Ne pas modifier paiement, prix, authentification, secrets, permissions, infrastructure, Worker bindings, migrations ou workflows.',
    '7. Créer une branche et une PR ciblée. Ne pas fusionner, déployer ni prétendre que la livraison est terminée depuis cette tâche.',
    '8. Le statut D1 doit rester traçable par ce même job_id. Laisser CI et le contrôle post-déploiement prouver la suite.',
    '',
    'Si aucune correction sûre et démontrable n’est justifiée, ne fabrique pas de changement produit ; explique précisément le signal non reproductible dans la PR.'
  ].join('\n').slice(0, 11500);
  return {
    id,
    repo: SARGAGAME_REPO,
    task_type: 'QUICK_CHANGE',
    created_at: new Date(nowMs).toISOString(),
    payload: {
      prompt,
      source: 'user-journey-audit',
      source_fingerprint: fp,
      source_report_at: report.generatedAt || null,
      source_run_url: runUrl(env) || null,
      defect_count: list.length,
      defects: list.map(d => ({
        domain: clean(d.domain), step: clean(d.step), type: clean(d.type), detail: clean(d.detail),
        severity: severity(d),
      })),
    },
  };
}

async function d1Query(token, sql, params = [], fetchFn = fetch) {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN absent');
  const response = await fetchFn(CF_D1_QUERY_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params: params.map(v => String(v)) }),
  });
  let body = {};
  try { body = await response.json(); } catch (_) {}
  if (!response.ok || body.success !== true) {
    const detail = Array.isArray(body.errors) ? body.errors.map(e => e.message || e.code || 'erreur').join('; ') : 'réponse D1 invalide';
    throw new Error('Cloudflare D1 HTTP ' + response.status + ': ' + clean(detail).slice(0, 180));
  }
  const first = body.result && body.result[0];
  if (!first || first.success !== true) {
    throw new Error('Cloudflare D1 query refusée : ' + clean(JSON.stringify(first || body)).slice(0, 180));
  }
  return first;
}

/**
 * Repli d'autonomie quand le secret cross-repo FACTORY_CONTROL_TOKEN n'existe
 * pas. Utilise le token Cloudflare déjà présent dans les workflows de livraison
 * pour écrire dans la file D1 existante ; ne crée pas de second runner.
 */
async function handoffD1Repair(token, report, defects, env = process.env, deps = {}) {
  if (!Array.isArray(defects) || defects.length === 0) return { status: 'not-needed', reason: 'aucun défaut observé' };
  if (!token) return { status: 'blocked', reason: 'FACTORY_CONTROL_TOKEN absent et CLOUDFLARE_API_TOKEN absent' };
  const fetchFn = deps.fetchFn || fetch;
  const nowMs = Number.isFinite(deps.nowMs) ? deps.nowMs : Date.now();
  const query = (sql, params) => d1Query(token, sql, params, fetchFn);

  const activeResult = await query(
    "SELECT id,status,created_at FROM factory_jobs WHERE repo=? AND status IN ('queued','running') ORDER BY created_at ASC LIMIT 1",
    [SARGAGAME_REPO],
  );
  const active = activeResult.results?.[0] || null;
  const cutoff = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const recentResult = await query(
    "SELECT id,status,created_at FROM factory_jobs WHERE repo=? AND task_type=? AND created_at>=? AND payload LIKE ? ORDER BY created_at DESC LIMIT 10",
    [SARGAGAME_REPO, 'QUICK_CHANGE', cutoff, '%"source":"user-journey-audit"%'],
  );
  const recent = recentResult.results || [];
  const decision = d1QueueDecision(active, recent, nowMs);
  if (!decision.allowed) return { status: 'deferred', reason: decision.reason };

  const job = buildD1RepairJob(report, defects, env, nowMs);
  const serialized = JSON.stringify(job.payload).slice(0, 12000);
  const inserted = await query(
    'INSERT OR IGNORE INTO factory_jobs (id,created_at,updated_at,repo,task_type,status,payload,attempts) VALUES (?,?,?,?,?,?,?,0)',
    [job.id, job.created_at, job.created_at, job.repo, job.task_type, 'queued', serialized],
  );
  if (Number(inserted.meta?.changes || 0) !== 1) {
    const existingResult = await query(
      'SELECT id,status,created_at FROM factory_jobs WHERE id=? LIMIT 1',
      [job.id],
    );
    const existing = existingResult.results?.[0];
    if (existing) return { status: 'existing', job_id: existing.id, reason: 'job déterministe déjà présent (' + existing.status + ')' };
    throw new Error('INSERT OR IGNORE sans insertion et job existant introuvable');
  }

  try {
    await query(
      'INSERT OR IGNORE INTO factory_events (id,ts,source,event_type,repo,status,payload) VALUES (?,?,?,?,?,?,?)',
      [
        'journey-enqueue-' + job.id, job.created_at, 'github-actions-user-journey',
        'task_queued_from_journey', SARGAGAME_REPO, 'queued',
        JSON.stringify({ job_id: job.id, source_run: runUrl(env), fingerprint: job.payload.source_fingerprint, defect_count: job.payload.defect_count }),
      ],
    );
  } catch (_) {
    // La tâche reste en file : l'event est une trace complémentaire, pas un motif
    // pour déclarer le job absent après une insertion D1 déjà confirmée.
  }
  return {
    status: 'created',
    job_id: job.id,
    task_type: job.task_type,
    reason: 'job D1 ajouté à la file existante ; runner cloud le prendra au prochain poll',
    fingerprint: job.payload.source_fingerprint,
  };
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
  const factoryControlToken = process.env.FACTORY_CONTROL_TOKEN || '';
  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN || '';
  try {
    result.factoryHandoff = await handoffFactory(factoryControlToken, report, defects);
    if (result.factoryHandoff.status === 'blocked' && cloudflareToken && defects.length) {
      const fallback = await handoffD1Repair(cloudflareToken, report, defects);
      result.factoryHandoff = { ...fallback, fallback_from: result.factoryHandoff.reason };
    }
  } catch (e) {
    if (cloudflareToken && defects.length) {
      try {
        const fallback = await handoffD1Repair(cloudflareToken, report, defects);
        result.factoryHandoff = { ...fallback, fallback_from: clean(e.message || e) };
      } catch (fallbackError) {
        result.factoryHandoff = { status: 'blocked', reason: 'handoff GitHub et fallback D1 échoués : ' + clean(fallbackError.message || fallbackError) };
      }
    } else {
      result.factoryHandoff = { status: 'blocked', reason: clean(e.message || e) };
    }
  }
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
  d1QueueDecision, buildD1RepairJob, d1Query, handoffD1Repair,
};
