'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  NORMALIZED_STATES,
  normalizeJob,
  normalizeSession,
  buildRegistry,
  persistRegistry,
  loadRegistry,
} = require('../../scripts/factory-v3/lib/session-registry.cjs');

const NOW = Date.parse('2026-11-15T12:00:00.000Z');

function uniqueTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function baseJob(overrides = {}) {
  return {
    jobId: 'job-1',
    repo: 'sargagame',
    task: 'une mission de test assez longue',
    branch: 'agent/factory/job-1',
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 3,
    nextRetryAt: null,
    evidence: null,
    createdAt: '2026-11-15T11:00:00.000Z',
    updatedAt: '2026-11-15T11:00:00.000Z',
    ...overrides,
  };
}

test('session-registry: états normalisés imposés', () => {
  assert.deepEqual(
    [...NORMALIZED_STATES],
    ['PLANNING', 'RUNNING', 'WAITING', 'BLOCKED', 'RECOVERING', 'VERIFYING', 'COMPLETED', 'FAILED'],
  );
});

test('session-registry: mapping complet des états de job', () => {
  // PLANNING : en file, jamais claimé
  assert.deepEqual(
    normalizeJob(baseJob(), { nowMs: NOW }),
    { state: 'PLANNING', reason: 'en file, non encore claimé' },
  );

  // WAITING : quota
  assert.equal(
    normalizeJob(baseJob({ quotaWait: true }), { nowMs: NOW }).state,
    'WAITING',
  );
  // WAITING : fournisseur
  assert.equal(
    normalizeJob(baseJob({ providerWait: true }), { nowMs: NOW }).state,
    'WAITING',
  );
  // WAITING : retry programmé après échec
  assert.equal(
    normalizeJob(baseJob({ attempts: 1, nextRetryAt: '2026-11-15T12:30:00.000Z' }), { nowMs: NOW }).state,
    'WAITING',
  );

  // RUNNING : agent en exécution
  assert.deepEqual(
    normalizeJob(baseJob({ status: 'RUNNING', evidence: { agent: { ok: false } } }), { nowMs: NOW }),
    { state: 'RUNNING', reason: 'agent en exécution' },
  );

  // RECOVERING : failover récent dans la preuve
  assert.deepEqual(
    normalizeJob(
      baseJob({
        status: 'RUNNING',
        evidence: { agent: { ok: false, failovers: [{ at: '2026-11-15T11:55:00.000Z', to: 'opencode/x' }] } },
      }),
      { nowMs: NOW },
    ),
    { state: 'RECOVERING', reason: 'failover modèle/fournisseur récent — reprise en cours' },
  );

  // VERIFYING : agent réussi, gates pas encore enregistrées
  assert.deepEqual(
    normalizeJob(baseJob({ status: 'RUNNING', evidence: { agent: { ok: true } } }), { nowMs: NOW }),
    { state: 'VERIFYING', reason: 'agent réussi — gates de livraison en cours' },
  );

  // COMPLETED : verdict vérifié uniquement
  assert.equal(
    normalizeJob(baseJob({ status: 'DONE', evidence: { verdict: 'VERIFIED' } }), { nowMs: NOW }).state,
    'COMPLETED',
  );

  // FAILED : DONE sans verdict vérifié — fail-closed
  assert.equal(
    normalizeJob(baseJob({ status: 'DONE', evidence: { verdict: 'FAILED' } }), { nowMs: NOW }).state,
    'FAILED',
  );
  assert.equal(
    normalizeJob(baseJob({ status: 'DONE', evidence: null }), { nowMs: NOW }).state,
    'FAILED',
  );

  // BLOCKED : parké hors quota
  assert.equal(
    normalizeJob(baseJob({ status: 'PARKED', attempts: 3, evidence: { verdict: 'FAILED', reason: 'gates en échec' } }), { nowMs: NOW }).state,
    'BLOCKED',
  );

  // WAITING : parké sur quota répété (reprise auto restera programmée)
  assert.equal(
    normalizeJob(baseJob({ status: 'PARKED', evidence: { verdict: 'WAIT_QUOTA' } }), { nowMs: NOW }).state,
    'WAITING',
  );

  // BLOCKED : statut inconnu
  assert.equal(normalizeJob(baseJob({ status: 'BIZARRE' }), { nowMs: NOW }).state, 'BLOCKED');
});

test('session-registry: session récente → RUNNING, silence → WAITING, jamais BLOCKED du silence', () => {
  const nowMs = NOW;
  const active = { id: 'ses_1', title: 't', updated: nowMs - 60_000 };
  assert.equal(normalizeSession(active, { nowMs }).state, 'RUNNING');

  const stalled = { id: 'ses_2', title: 't', updated: nowMs - 10 * 60_000 };
  const normalized = normalizeSession(stalled, { nowMs });
  assert.equal(normalized.state, 'WAITING');
  assert.equal(normalized.stale, false);

  const veryStale = { id: 'ses_3', title: 't', updated: nowMs - 90 * 60_000 };
  const stale = normalizeSession(veryStale, { nowMs });
  assert.equal(stale.state, 'WAITING');
  assert.equal(stale.stale, true);
  assert.ok(stale.stallSeconds >= 5400);
});

test('session-registry: fusion jobs + sessions, dédoublonnage par sessionId', () => {
  const jobs = [
    baseJob({
      status: 'RUNNING',
      evidence: {
        agent: {
          ok: false,
          sessionId: 'ses_job',
          requestedModel: 'nvidia/a',
          resolvedModel: 'nvidia/a',
          provider: 'nvidia',
          spend: 0,
          committedSha: null,
          dirtyFiles: ['f.txt'],
        },
      },
      worktree: 'C:/wt/x',
      updatedAt: '2026-11-15T11:59:00.000Z',
    }),
  ];
  const sessions = [
    { id: 'ses_job', title: 'mission', updated: NOW - 60_000, directory: 'C:/wt/x', projectId: 'p' },
    { id: 'ses_free', title: 'autre', updated: NOW - 2 * 60_000, directory: 'C:/y', projectId: 'p' },
  ];
  const registry = buildRegistry({ jobs, sessions, nowMs: NOW });

  assert.equal(registry.entries.length, 2, 'session déjà portée par un job ne doit pas être dupliquée');
  assert.equal(registry.sources.jobs, 1);
  assert.equal(registry.sources.sessions, 2);
  assert.equal(registry.sources.sessionsMergedIntoJobs, 1);

  const jobEntry = registry.entries.find((e) => e.kind === 'job');
  assert.equal(jobEntry.state, 'RUNNING');
  assert.equal(jobEntry.sessionId, 'ses_job');
  assert.equal(jobEntry.provider, 'nvidia');
  assert.equal(jobEntry.spend, 0);
  assert.equal(jobEntry.dirtyFiles, 1);

  const sessionEntry = registry.entries.find((e) => e.kind === 'session');
  assert.equal(sessionEntry.id, 'ses_free');
  assert.equal(sessionEntry.state, 'RUNNING');

  assert.equal(registry.counts.RUNNING, 2);
  assert.equal(registry.counts.PLANNING, 0);
});

test('session-registry: failover récent signalé par les logs → RECOVERING', () => {
  const jobs = [baseJob({ status: 'RUNNING', evidence: { agent: { ok: false } } })];
  const registry = buildRegistry({
    jobs,
    sessions: [],
    failoverJobIds: new Set(['job-1']),
    nowMs: NOW,
  });
  assert.equal(registry.entries[0].state, 'RECOVERING');
  assert.equal(registry.counts.RECOVERING, 1);
});

test('session-registry: persistance, transitions horodatées et reprise sans perte', () => {
  const stateDir = uniqueTempDir('factory-v3-session-registry');
  const jobs = [baseJob()];
  const sessions = [];

  let registry = buildRegistry({ jobs, sessions, nowMs: NOW });
  let persisted = persistRegistry({ stateDir, registry });
  assert.equal(persisted.transitions.length, 1);
  assert.equal(persisted.transitions[0].to, 'PLANNING');

  let loaded = loadRegistry(stateDir);
  assert.equal(loaded.entries[0].state, 'PLANNING');

  // Le job passe RUNNING → transition enregistrée, historique conservé.
  jobs[0] = baseJob({ status: 'RUNNING', evidence: { agent: { ok: false } }, updatedAt: '2026-11-15T12:01:00.000Z' });
  registry = buildRegistry({ jobs, sessions, nowMs: NOW + 60_000 });
  persisted = persistRegistry({ stateDir, registry });
  assert.equal(persisted.transitions.length, 1);
  assert.equal(persisted.transitions[0].from, 'PLANNING');
  assert.equal(persisted.transitions[0].to, 'RUNNING');

  // L'entrée disparaît → transition ABSENT enregistrée (aucune perte silencieuse).
  registry = buildRegistry({ jobs: [], sessions: [], nowMs: NOW + 120_000 });
  persisted = persistRegistry({ stateDir, registry });
  const absent = persisted.transitions.find((t) => t.to === 'ABSENT');
  assert.ok(absent, 'la disparition doit être tracée');
  assert.equal(absent.id, 'job-1');

  const history = fs.readFileSync(persisted.historyFile, 'utf8').trim().split(/\r?\n/);
  assert.equal(history.length, 3, 'trois transitions doivent être dans l\'historique');

  loaded = loadRegistry(stateDir);
  assert.equal(loaded.entries.length, 0);
});

test('session-registry: plafond d\'historique respecté', () => {
  const stateDir = uniqueTempDir('factory-v3-session-registry-cap');
  const jobs = [baseJob({ jobId: 'job-cap' })];
  const registry = buildRegistry({ jobs, sessions: [], nowMs: NOW });

  // On écrit manuellement un historique au-delà du plafond.
  const observerDir = path.join(stateDir, 'observer');
  fs.mkdirSync(observerDir, { recursive: true });
  const filler = Array.from({ length: 5200 }, (_, i) => JSON.stringify({ ts: '2026-11-14T00:00:00.000Z', id: `x${i}`, kind: 'job', from: 'PLANNING', to: 'PLANNING', reason: 'filler' }));
  fs.writeFileSync(path.join(observerDir, 'SESSION_HISTORY.jsonl'), filler.join('\n') + '\n', 'utf8');

  const persisted = persistRegistry({ stateDir, registry });
  const lines = fs.readFileSync(persisted.historyFile, 'utf8').trim().split(/\r?\n/);
  assert.ok(lines.length <= 4100, `l'historique doit être compacté (reçu ${lines.length})`);
  assert.ok(lines[lines.length - 1].includes('job-cap'));
});
