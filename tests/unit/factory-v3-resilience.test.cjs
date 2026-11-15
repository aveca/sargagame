'use strict';
/**
 * Tests de résilience Factory V3 — retry intelligent + failover fournisseur.
 *
 * Les 9 scénarios exigés par la mission P0 sont couverts de façon
 * déterministe :
 *   1. HTTP 429 avec Retry-After
 *   2. quota épuisé sans reset communiqué
 *   3. content safety screening unavailable
 *   4. timeout
 *   5. modèle inexistant
 *   6. fournisseur indisponible
 *   7. plusieurs fournisseurs successivement indisponibles
 *   8. reprise après cooldown (modèle + circuit fournisseur half-open)
 *   9. plusieurs agents confrontés simultanément au même 429
 *
 * Run : node --test tests/unit/factory-v3-resilience.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const failover = require('../../scripts/factory-v3/lib/failover.cjs');
const inventoryLib = require('../../scripts/factory-v3/lib/inventory.cjs');
const registryLib = require('../../scripts/factory-v3/lib/model-registry.cjs');
const retryPolicy = require('../../scripts/factory-v3/lib/retry-policy.cjs');
const { CATEGORY } = require('../../scripts/factory-v3/lib/error-classifier.cjs');

const STUB = path.resolve(__dirname, '../fixtures/factory-v3-opencode-stub.cjs');
const NVIDIA_A = 'nvidia/nvidia/nemotron-free-a';
const NVIDIA_B = 'nvidia/nvidia/minimax-free-b';
const OPENCODE_C = 'opencode/free-c';
const LOCAL = 'ollama/qwen2.5-coder:7b';

function tmpDir(prefix = 'factory-v3-resilience-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) => execFileSync(
    'git',
    ['-C', dir, '-c', 'user.email=t@t.local', '-c', 'user.name=T', ...args],
    { stdio: 'ignore' },
  );
  git('init');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo test factory v3 resilience\n');
  git('add', '-A');
  git('commit', '-m', 'init');
  return dir;
}

function model(ref, opts = {}) {
  const provider = ref.split('/')[0];
  const free = opts.free !== false;
  return {
    ref,
    id: ref.split('/').slice(1).join('/'),
    provider,
    name: ref,
    status: 'active',
    free,
    eligible: free,
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    capabilities: { reasoning: !!opts.reasoning, toolcall: true, output: { text: true } },
    limit: { context: 32768, output: 4096 },
    family: null,
    installed: provider === 'ollama' ? true : null,
  };
}

function defaultInventory() {
  const models = [
    model(NVIDIA_A, { reasoning: true }),
    model(NVIDIA_B),
    model(OPENCODE_C),
    model(LOCAL),
  ];
  return models;
}

function seedInventory(stateDir, models = defaultInventory()) {
  const file = path.join(stateDir, 'inventory.json');
  fs.writeFileSync(file, JSON.stringify({
    version: inventoryLib.INVENTORY_VERSION,
    updatedAt: new Date().toISOString(),
    authProviders: ['nvidia', 'opencode', 'ollama'],
    installedOllama: ['qwen2.5-coder:7b'],
    models,
    eligibleModels: models.map((m) => m.ref),
    errors: [],
    counts: { discovered: models.length, eligible: models.length, free: models.length },
  }, null, 2));
}

function makePlan(stateDir, models) {
  const file = path.join(stateDir, 'plan.json');
  fs.writeFileSync(file, JSON.stringify({ models, default: { behavior: 'success' } }, null, 2));
  return file;
}

function makeCfg(overrides = {}) {
  return Object.assign({
    models: [NVIDIA_A, NVIDIA_B, OPENCODE_C, LOCAL],
    opencodeBin: process.execPath,
    opencodePrefixArgs: [STUB],
    paidAllowed: false,
    failover: {
      maxModelSwitches: 4,
      maxSameModelAttempts: 3,
      agentTimeoutMs: 5000,
      agentIdleTimeoutMs: 200,
      inventoryMaxAgeMs: 30 * 60 * 1000,
      circuitThreshold: 3,
      providerSlotWaitMs: 1000,
      providerSlotLeaseMs: 10000,
      availabilityCacheMs: 30 * 60 * 1000,
      cooldowns: {
        dailyMs: 86400000,
        hourlyMs: 3600000,
        rateMs: 120000,
        providerMs: 600000,
        technicalMs: 120000,
      },
    },
  }, overrides);
}

function makeJob(id = 'job-resilience-1') {
  return {
    jobId: id,
    repo: 'sargagame',
    task: 'Ajouter une preuve factuelle de résilience dans le journal du projet',
    severity: 2,
    branch: 'test/resilience',
    attempts: 0,
  };
}

async function runFailover({ plan, cfg = makeCfg(), job = makeJob(), inventory = defaultInventory(), sleep: sleepOverride, contextSeed = null } = {}) {
  const stateDir = tmpDir();
  const repoDir = initRepo(path.join(stateDir, 'repo'));
  seedInventory(stateDir, inventory);
  makePlan(stateDir, plan || {});
  const logFile = path.join(stateDir, 'stub-calls.jsonl');
  process.env.FACTORY_STUB_PLAN = path.join(stateDir, 'plan.json');
  process.env.FACTORY_STUB_LOG = logFile;
  process.env.FACTORY_STUB_CONTEXT = failover.contextFile(stateDir, job.jobId);
  if (contextSeed) {
    failover.saveContext(stateDir, job.jobId, Object.assign({
      jobId: job.jobId,
      attempts: [],
      sessionId: null,
      failovers: 0,
      resumes: 0,
      replacementModel: null,
      spend: 0,
    }, contextSeed));
  }

  const logs = [];
  const sleeps = [];
  const clock = { value: Date.now() };
  const sleep = async (ms) => {
    sleeps.push(Number(ms));
    clock.value += Number(ms) || 0;
    if (sleepOverride) await sleepOverride(ms, clock);
  };
  const result = await failover.executeJobWithFailover({
    stateDir,
    cfg,
    job,
    repoCfg: { local: repoDir, gates: [] },
    log: (event, data) => logs.push({ event, data }),
    now: () => clock.value,
    sleep,
  });

  const calls = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const registry = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  return { stateDir, repoDir, result, calls, registry, logs, sleeps };
}

// ===========================================================================
// 1. HTTP 429 avec Retry-After
// ===========================================================================
test('1. HTTP 429 + Retry-After : délai respecté strictement puis retry borné', async () => {
  const { result, calls, sleeps, registry, logs } = await runFailover({
    plan: {
      [NVIDIA_A]: {
        sequence: [
          { behavior: 'rate_limit', retryAfter: 7, headers: { 'Retry-After': '7' } },
          { behavior: 'success' },
        ],
      },
    },
  });

  assert.equal(result.ok, true, 'le retry doit allowgir le job');
  assert.equal(result.model, NVIDIA_A, 'le même modèle réussit après le 429');
  assert.equal(calls.length, 2, 'un premier 429 puis un seul retry');
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 7000, 'Retry-After = 7 s est respecté à la milliseconde');
  assert.equal(result.attempts[0].httpStatus, 429);
  assert.equal(result.attempts[0].retryAfterMs, 7000);
  assert.equal(registry.stats.retries, 1);
  assert.ok(logs.some((l) => l.event === '[MODEL]' && l.data.message === 'execution_resumed=true')
    || logs.some((l) => l.event === 'MODEL_RETRY_SCHEDULED'), 'la reprise est tracée');
});

// ===========================================================================
// 2. Quota épuisé sans reset communiqué
// ===========================================================================
test('2. quota épuisé sans reset : aucun retry, cooldown progressif, failover', async () => {
  const { result, calls, sleeps, registry } = await runFailover({
    plan: {
      [NVIDIA_A]: { behavior: 'quota_daily' },
      [NVIDIA_B]: { behavior: 'success' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, NVIDIA_B, 'un autre modèle du même fournisseur prend le relais');
  assert.equal(calls.filter((c) => c.model === NVIDIA_A).length, 1, 'quota : pas de retry immédiat');
  assert.equal(sleeps.length, 0);
  const entry = registry.models[NVIDIA_A];
  assert.equal(entry.lastFailureCategory, CATEGORY.DAILY_QUOTA_EXHAUSTED);
  assert.equal(result.attempts[0].knownResetAt, null, 'le timestamp des logs n\'est pas un reset de quota');
  assert.ok(entry.cooldownUntil, 'cooldown posé');
  const cooldownMs = Date.parse(entry.cooldownUntil) - Date.parse(entry.quota.detectedAt);
  assert.ok(cooldownMs > 0 && cooldownMs <= 60 * 60 * 1000, 'cooldown progressif borné à 1 h');
});

// ===========================================================================
// 3. Content safety screening unavailable
// ===========================================================================
test('3. safety screening indisponible : UNE reprise différée puis failover', async () => {
  const { result, calls, sleeps, registry } = await runFailover({
    plan: {
      [NVIDIA_A]: { behavior: 'content_safety' },
      [OPENCODE_C]: { behavior: 'success' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, OPENCODE_C, 'le failover change de fournisseur après la reprise unique');
  assert.equal(calls.filter((c) => c.model === NVIDIA_A).length, 2, 'exactement une reprise');
  assert.equal(sleeps.length, 1, 'la reprise est différée');
  assert.equal(result.attempts[0].category, CATEGORY.CONTENT_SAFETY_UNAVAILABLE);
  assert.equal(result.attempts[1].category, CATEGORY.CONTENT_SAFETY_UNAVAILABLE);
  assert.equal(registry.models[NVIDIA_A].lastFailureCategory, CATEGORY.CONTENT_SAFETY_UNAVAILABLE);
});

// ===========================================================================
// 4. Timeout
// ===========================================================================
test('4. timeout : tentatives transitoires bornées puis failover', async () => {
  const { result, calls } = await runFailover({
    plan: {
      [NVIDIA_A]: { behavior: 'timeout', sleepMs: 30000 },
      [OPENCODE_C]: { behavior: 'success' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.filter((c) => c.model === NVIDIA_A).length, 3, 'maximum 3 tentatives');
  assert.equal(result.attempts.filter((a) => a.category === CATEGORY.TIMEOUT).length, 3);
  assert.equal(result.model, OPENCODE_C);
});

// ===========================================================================
// 5. Modèle inexistant
// ===========================================================================
test('5. modèle inexistant : aucun retry inutile, failover direct', async () => {
  const { result, calls, sleeps, registry } = await runFailover({
    plan: {
      [NVIDIA_A]: { behavior: 'model_invalid' },
      [OPENCODE_C]: { behavior: 'success' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2, 'une seule tentative par modèle');
  assert.equal(sleeps.length, 0);
  assert.equal(result.attempts[0].category, CATEGORY.MODEL_INVALID);
  assert.equal(registry.models[NVIDIA_A].lastFailureCategory, CATEGORY.MODEL_INVALID);
});

// ===========================================================================
// 6. Fournisseur indisponible
// ===========================================================================
test('6. fournisseur indisponible : retries bornés puis changement de fournisseur', async () => {
  const { result, calls, registry } = await runFailover({
    plan: {
      [NVIDIA_A]: { behavior: 'provider_unavailable' },
      [OPENCODE_C]: { behavior: 'success' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.filter((c) => c.model === NVIDIA_A).length, 3);
  assert.equal(result.model, OPENCODE_C);
  assert.equal(result.attempts[0].category, CATEGORY.PROVIDER_UNAVAILABLE);
  assert.equal(registry.providers.nvidia.lastFailureCategory, CATEGORY.PROVIDER_UNAVAILABLE);
});

// ===========================================================================
// 7. Plusieurs fournisseurs successivement indisponibles
// ===========================================================================
test('7. plusieurs fournisseurs indisponibles : la chaîne continue jusqu\'au modèle opérationnel', async () => {
  const { result, calls, registry } = await runFailover({
    plan: {
      [NVIDIA_A]: { behavior: 'provider_unavailable' },
      [OPENCODE_C]: { behavior: 'provider_unavailable' },
      [LOCAL]: { behavior: 'success' },
    },
    // Chaîne explicite : Nvidia → OpenCode → Ollama (aucun modèle de secours
    // Nvidia qui pourrait raccourcir la trajectoire).
    inventory: defaultInventory().filter((m) => m.ref !== NVIDIA_B),
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, LOCAL, 'le modèle local termine la chaîne');
  assert.equal(result.failovers, 2, 'deux bascules successives');
  assert.equal(calls.filter((c) => c.model === NVIDIA_A).length, 3);
  assert.equal(calls.filter((c) => c.model === OPENCODE_C).length, 3);
  assert.equal(calls.filter((c) => c.model === LOCAL).length, 1);
  assert.equal(registry.stats.failovers, 2);
});

// ===========================================================================
// 8. Reprise après cooldown
// ===========================================================================
test('8. reprise après cooldown : modèle réintégré + fournisseur half_open progressif', async () => {
  // Circuit fournisseur : 3 échecs → ouvert ; après expiration → half_open,
  // une seule sonde simultanée ; succès → fermeture complète.
  const registry = registryLib.emptyRegistry();
  const failure = { category: CATEGORY.PROVIDER_UNAVAILABLE, cooldownMs: 1000 };
  registryLib.recordProviderFailure(registry, 'nvidia', failure);
  registryLib.recordProviderFailure(registry, 'nvidia', failure);
  registryLib.recordProviderFailure(registry, 'nvidia', failure);
  assert.equal(registry.providers.nvidia.state, 'open');
  assert.ok(Date.parse(registry.providers.nvidia.cooldownUntil) - Date.now() >= 59 * 60 * 1000,
    'le breaker fournisseur ouvre sur 1 h au seuil');
  registry.providers.nvidia.cooldownUntil = new Date(Date.now() - 1).toISOString();
  registry.providers.nvidia.notBefore = new Date(Date.now() - 1).toISOString();
  const half = registryLib.providerStatus(registry, 'nvidia');
  assert.equal(half.state, 'half_open', 'réouverture progressive');
  const slot1 = registryLib.acquireProviderSlot(registry, 'nvidia', null, { token: 'probe-1' });
  const slot2 = registryLib.acquireProviderSlot(registry, 'nvidia', null, { token: 'probe-2' });
  assert.equal(slot1.ok, true);
  assert.equal(slot2.ok, false, 'une seule sonde half_open à la fois');
  registryLib.releaseProviderSlot(registry, 'nvidia', 'probe-1');
  registryLib.recordProviderSuccess(registry, 'nvidia');
  assert.equal(registry.providers.nvidia.state, 'closed');

  // Réintégration réelle d'un modèle dont le cooldown a expiré.
  const first = await runFailover({
    plan: { [NVIDIA_A]: { behavior: 'quota_daily' }, [NVIDIA_B]: { behavior: 'success' } },
  });
  assert.equal(first.result.model, NVIDIA_B);
  const regFile = path.join(first.stateDir, 'model-registry.json');
  const reg = registryLib.readRegistry(regFile);
  reg.models[NVIDIA_A].cooldownUntil = new Date(Date.now() - 1).toISOString();
  reg.models[NVIDIA_A].notBefore = new Date(Date.now() - 1).toISOString();
  registryLib.writeRegistry(regFile, reg);
  makePlan(first.stateDir, {
    [NVIDIA_A]: { behavior: 'success' },
    [NVIDIA_B]: { behavior: 'success' },
  });
  process.env.FACTORY_STUB_PLAN = path.join(first.stateDir, 'plan.json');
  process.env.FACTORY_STUB_LOG = path.join(first.stateDir, 'stub-calls.jsonl');
  const second = await failover.executeJobWithFailover({
    stateDir: first.stateDir,
    cfg: makeCfg(),
    job: makeJob('job-resilience-after-cooldown'),
    repoCfg: { local: first.repoDir, gates: [] },
    log: () => {},
    sleep: async () => {},
  });
  assert.equal(second.ok, true);
  assert.equal(second.model, NVIDIA_A, 'le modèle réintégré redevient prioritaire');
});

// ===========================================================================
// Reprise après interruption/restart du runner
// ===========================================================================
test('reprise après interruption : contexte et session persistés sont restaurés', async () => {
  const firstCfg = makeCfg();
  firstCfg.models = [NVIDIA_A];
  firstCfg.failover.maxModelSwitches = 1;
  const first = await runFailover({
    plan: {
      [NVIDIA_A]: { behavior: 'provider_unavailable' },
    },
    cfg: firstCfg,
    inventory: defaultInventory().filter((m) => m.ref === NVIDIA_A || m.ref === NVIDIA_B),
    job: makeJob('job-resilience-restart'),
  });
  assert.equal(first.result.ok, false, 'la première passe est honnêtement en échec');
  assert.ok(first.result.attempts.length >= 2);
  const persisted = failover.loadContext(first.stateDir, 'job-resilience-restart');
  assert.ok(persisted, 'contexte persisté');
  assert.ok(persisted.sessionId, 'session OpenCode persistée');
  assert.ok(persisted.attempts.length >= 2);

  const regFile = path.join(first.stateDir, 'model-registry.json');
  const reg = registryLib.readRegistry(regFile);
  for (const entry of Object.values(reg.models || {})) {
    if (entry.cooldownUntil) entry.cooldownUntil = new Date(Date.now() - 1).toISOString();
    if (entry.notBefore) entry.notBefore = new Date(Date.now() - 1).toISOString();
  }
  for (const provider of Object.values(reg.providers || {})) {
    if (provider.cooldownUntil) provider.cooldownUntil = new Date(Date.now() - 1).toISOString();
    if (provider.notBefore) provider.notBefore = new Date(Date.now() - 1).toISOString();
  }
  registryLib.writeRegistry(regFile, reg);
  makePlan(first.stateDir, {
    [NVIDIA_A]: { behavior: 'success' },
    [NVIDIA_B]: { behavior: 'success' },
  });
  process.env.FACTORY_STUB_PLAN = path.join(first.stateDir, 'plan.json');
  process.env.FACTORY_STUB_LOG = path.join(first.stateDir, 'stub-calls.jsonl');

  const logs = [];
  const second = await failover.executeJobWithFailover({
    stateDir: first.stateDir,
    cfg: makeCfg({ models: [NVIDIA_A, NVIDIA_B] }),
    job: makeJob('job-resilience-restart'),
    repoCfg: { local: first.repoDir, gates: [] },
    log: (event, data) => logs.push({ event, data }),
    sleep: async () => {},
  });
  assert.equal(second.ok, true);
  assert.equal(second.model, NVIDIA_B, 'le modèle déjà épuisé ne réinitialise pas son budget après restart');
  assert.ok(second.attempts.length > first.result.attempts.length, 'historique conservé et complété');
  assert.ok(logs.some((l) => l.event === '[MODEL]' && l.data.message === 'execution_resumed=true'),
    'la session persistée est réutilisée après restart');
});

test('write-ahead: la tentative est persistée avant l\'appel fournisseur', async () => {
  const { result, calls } = await runFailover({
    plan: { [NVIDIA_A]: { behavior: 'assert_write_ahead' } },
    cfg: makeCfg({ models: [NVIDIA_A] }),
  });
  assert.equal(result.ok, true, 'le stub a observé la tentative write-ahead avant de répondre');
  assert.equal(calls.length, 1);
});

test('write-ahead après crash: les tentatives in_progress consomment le budget', async () => {
  const job = makeJob('job-resilience-write-ahead-crash');
  const inProgress = [1, 2, 3].map((attemptNumber) => ({
    ref: NVIDIA_A,
    requestedModel: NVIDIA_A,
    provider: 'nvidia',
    attemptNumber,
    modelAttempt: attemptNumber,
    outcome: 'in_progress',
    startedAt: new Date().toISOString(),
  }));
  const { result, calls } = await runFailover({
    plan: { [NVIDIA_A]: { behavior: 'success' } },
    cfg: makeCfg({ models: [NVIDIA_A] }),
    inventory: defaultInventory().filter((entry) => entry.ref === NVIDIA_A),
    job,
    contextSeed: { attempts: inProgress },
  });
  assert.equal(result.ok, false, 'aucun quatrième appel après le crash');
  assert.equal(calls.length, 0, 'le budget write-ahead est respecté');
  assert.equal(result.attempts.length, 3, 'les trois tentatives persistées sont conservées');
  assert.ok(result.skipped.some((entry) => entry.ref === NVIDIA_A && entry.state === 'MODEL_BUDGET_EXHAUSTED'));
});

// ===========================================================================
// 9. Plusieurs agents confrontés simultanément au même 429
// ===========================================================================
test('9. plusieurs agents sur le même 429 : concurrence bornée, aucun martèlement', async () => {
  const stateDir = tmpDir('factory-v3-resilience-concurrent-');
  const repoA = initRepo(path.join(stateDir, 'repoA'));
  const repoB = initRepo(path.join(stateDir, 'repoB'));
  seedInventory(stateDir);
  const planFile = makePlan(stateDir, {
    [NVIDIA_A]: { behavior: 'rate_limit' },
    [OPENCODE_C]: { behavior: 'success' },
  });
  const logFile = path.join(stateDir, 'stub-calls.jsonl');
  process.env.FACTORY_STUB_PLAN = planFile;
  process.env.FACTORY_STUB_LOG = logFile;

  const cfg = makeCfg();
  const [r1, r2] = await Promise.all([
    failover.executeJobWithFailover({
      stateDir,
      cfg,
      job: makeJob('job-resilience-concurrent-1'),
      repoCfg: { local: repoA, gates: [] },
      log: () => {},
      sleep: async () => {},
    }),
    failover.executeJobWithFailover({
      stateDir,
      cfg,
      job: makeJob('job-resilience-concurrent-2'),
      repoCfg: { local: repoB, gates: [] },
      log: () => {},
      sleep: async () => {},
    }),
  ]);

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r1.model, OPENCODE_C);
  assert.equal(r2.model, OPENCODE_C);
  const calls = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(calls.filter((c) => c.model === NVIDIA_A).length, 2, 'le 429 partagé interdit les retries anticipés des deux agents');
  assert.equal(calls.filter((c) => c.model === OPENCODE_C).length, 2, 'chaque agent bascule vers le fournisseur disponible');
  const registry = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  assert.ok(registry.providers.nvidia.peakInFlight <= 2, 'jamais plus de 2 requêtes Nvidia simultanées');
  assert.equal(registry.providers.nvidia.inFlight, 0, 'tous les slots sont libérés');
  assert.ok(registry.providers.nvidia.notBefore, 'deadline fournisseur Retry-After partagée et persistée');
  assert.equal(registry.stats.retries, 2, 'un retry planifié par agent, sans appel anticipé');
});

// Test direct de la politique : un Retry-After > 60 s ne doit JAMAIS être raccourci.
test('policy. Retry-After > 60 s : le délai fournisseur reste strict', () => {
  const delay = retryPolicy.computeDelayMs({ attempt: 1, retryAfterMs: 120000 });
  assert.equal(delay, 120000);
});
