'use strict';
/**
 * Tests de non-régression — Factory V3 : bascule automatique de modèle + quota autopilot.
 *
 * Les 10 scénarios exigés par la mission P0 sont couverts :
 *   1. épuisement du quota journalier
 *   2. erreur HTTP 429
 *   3. modèle temporairement indisponible
 *   4. plusieurs modèles successivement indisponibles
 *   5. reprise du travail après changement de modèle
 *   6. préservation du contexte
 *   7. retour automatique au modèle initial après réinitialisation
 *   8. absence de bascule vers un modèle payant
 *   9. absence de boucle infinie
 *  10. plusieurs agents simultanés rencontrant des quotas épuisés
 *
 * + non-régression du bug de hang réel (2026-11-14) et du classifieur d'erreurs.
 *
 * Run : node --test tests/unit/factory-v3-failover.test.cjs
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
const { classifyFailure, CATEGORY } = require('../../scripts/factory-v3/lib/error-classifier.cjs');
const { runProcess } = require('../../scripts/factory-v3/lib/exec.cjs');

const STUB = path.resolve(__dirname, '../fixtures/factory-v3-opencode-stub.cjs');

function tmpDir(prefix = 'factory-v3-fo-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t.local', '-c', 'user.name=T', ...args], { stdio: 'ignore' });
  git('init');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo test factory v3\n');
  git('add', '-A');
  git('commit', '-m', 'init');
  return dir;
}

/** Inventaire factice mais conforme au format réel (version 2). */
function seedInventory(stateDir, models) {
  const file = path.join(stateDir, 'inventory.json');
  fs.writeFileSync(file, JSON.stringify({
    version: inventoryLib.INVENTORY_VERSION,
    updatedAt: new Date().toISOString(),
    authProviders: ['nvidia', 'opencode', 'ollama'],
    installedOllama: ['qwen2.5-coder:7b'],
    models,
    eligibleModels: models.filter((m) => m.eligible).map((m) => m.ref),
    errors: [],
    counts: { discovered: models.length, eligible: models.filter((m) => m.eligible).length, free: models.filter((m) => m.free).length },
  }, null, 2));
}

function model(ref, opts = {}) {
  const provider = ref.split('/')[0];
  const free = opts.free !== false;
  return {
    ref,
    id: ref.split('/').slice(1).join('/'),
    provider,
    name: ref,
    status: opts.status || 'active',
    free,
    eligible: (opts.status || 'active') === 'active' && (free || opts.paidAllowed),
    cost: free ? { input: 0, output: 0, cache: { read: 0, write: 0 } } : { input: 3, output: 15, cache: { read: 0, write: 0 } },
    capabilities: { reasoning: !!opts.reasoning, toolcall: true, output: { text: true } },
    limit: { context: opts.context || 32768, output: 4096 },
    family: opts.family || null,
    installed: provider === 'ollama' ? (opts.installed !== false) : null,
  };
}

const FREE_A = 'nvidia/nvidia/nemotron-free-a';
const FREE_B = 'nvidia/nvidia/minimax-free-b';
const FREE_C = 'opencode/free-c';
const LOCAL = 'ollama/qwen2.5-coder:7b';
const PAID = 'openai/gpt-paid';

function defaultInventory() {
  return [
    model(FREE_A, { reasoning: true, context: 131072, family: 'nemotron' }),
    model(FREE_B, { family: 'minimax' }),
    model(FREE_C),
    model(LOCAL, { family: 'qwen', installed: true }),
    model(PAID, { free: false }),
  ];
}

function makePlan(stateDir, models) {
  const file = path.join(stateDir, 'plan.json');
  fs.writeFileSync(file, JSON.stringify({ models, default: { behavior: 'success' } }, null, 2));
  return file;
}

function makeCfg(overrides = {}) {
  return Object.assign({
    models: [FREE_A, FREE_B, FREE_C, LOCAL],
    opencodeBin: process.execPath,
    opencodePrefixArgs: [STUB],
    paidAllowed: false,
    failover: {
      maxModelSwitches: 4,
      agentTimeoutMs: 15000,
      agentIdleTimeoutMs: 2500,
      inventoryMaxAgeMs: 30 * 60 * 1000,
      circuitThreshold: 3,
      cooldowns: { dailyMs: 86400000, hourlyMs: 3600000, rateMs: 120000, providerMs: 600000, technicalMs: 120000 },
    },
  }, overrides);
}

function makeJob(id = 'job-test-1') {
  return { jobId: id, repo: 'sargagame', task: 'Ajouter une entrée factuelle de test dans le journal du projet', severity: 2, branch: 'test/branch', attempts: 0 };
}

/** Exécute le moteur de failover avec un plan de stub donné. */
async function runFailover({ plan, cfg = makeCfg(), job = makeJob(), inventory = defaultInventory() } = {}) {
  const stateDir = tmpDir();
  const repoDir = initRepo(path.join(stateDir, 'repo'));
  seedInventory(stateDir, inventory);
  const planFile = makePlan(stateDir, plan || {});
  const logFile = path.join(stateDir, 'stub-calls.jsonl');
  process.env.FACTORY_STUB_PLAN = planFile;
  process.env.FACTORY_STUB_LOG = logFile;

  const logs = [];
  const sleeps = [];
  const clock = { value: Date.now() };
  const result = await failover.executeJobWithFailover({
    stateDir,
    cfg,
    job,
    repoCfg: { local: repoDir, gates: [] },
    log: (e, d) => logs.push({ e, d }),
    now: () => clock.value,
    // Les délais de retry sont vérifiés sans réellement attendre ; l'horloge
    // injectée avance exactement du délai pour respecter les deadlines partagées.
    sleep: async (ms) => { sleeps.push(Number(ms)); clock.value += Number(ms) || 0; },
  });

  const calls = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const registry = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  return { stateDir, repoDir, result, calls, registry, logFile, logs, sleeps };
}

// ===========================================================================
// 1. Épuisement du quota journalier → bascule
// ===========================================================================
test('1. quota journalier épuisé → bascule automatique vers un autre modèle gratuit', async () => {
  const { result, calls, registry, logs } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'quota_daily' },
      [FREE_B]: { behavior: 'success' },
    },
  });
  assert.equal(result.ok, true, 'le job doit réussir via le modèle de secours');
  assert.equal(result.model, FREE_B, 'le modèle de secours doit être utilisé');
  assert.equal(result.failovers, 1, 'une bascule doit être comptabilisée');
  assert.equal(calls.length, 2, 'exactement 2 appels de modèle');
  const entry = registry.models[FREE_A];
  assert.ok(entry, 'le modèle en échec doit être enregistré au registre');
  assert.equal(entry.quota.type, 'daily', 'la nature du quota est mémorisée');
  assert.ok(entry.cooldownUntil, 'un cooldown est posé sur le modèle épuisé');
  assert.equal(registry.models[FREE_B].verifiedByUse, true, 'le modèle de secours est validé par usage');
});

// ===========================================================================
// 2. HTTP 429 → rate limit
// ===========================================================================
test('2. HTTP 429 → classé rate limit, bascule avec cooldown court', async () => {
  const { result, calls, registry } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'rate_limit', message: 'Rate limit exceeded (HTTP 429). Too many requests.' },
      [FREE_B]: { behavior: 'success' },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.failovers, 1);
  const entry = registry.models[FREE_A];
  assert.equal(entry.lastFailureCategory, CATEGORY.RATE_LIMITED);
  assert.equal(entry.quota.type, 'short_term');
  const cooldownMs = Date.parse(entry.cooldownUntil) - Date.parse(entry.quota.detectedAt);
  assert.ok(cooldownMs <= 30 * 60 * 1000, 'le cooldown d’un rate limit reste court');
  assert.equal(calls.length, 4, '3 tentatives sur le modèle 429 puis un fournisseur différent');
  assert.equal(result.model, FREE_C, 'un fournisseur différent prend le relais après le 429');
  assert.equal(result.attempts.filter((a) => a.ref === FREE_A).length, 3, 'retry borné à 3 tentatives');
  assert.ok(result.attempts[0].httpStatus === 429, 'code HTTP mémorisé');
});

// ===========================================================================
// 3. Modèle temporairement indisponible
// ===========================================================================
test('3. fournisseur indisponible → bascule vers un autre modèle', async () => {
  const { result, registry } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'provider_unavailable', message: 'Provider temporarily unavailable (503). Please retry.' },
      [FREE_B]: { behavior: 'success' },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(registry.models[FREE_A].lastFailureCategory, CATEGORY.PROVIDER_UNAVAILABLE);
  assert.equal(registry.models[FREE_A].quota.type, 'none');
  assert.ok(registry.models[FREE_A].cooldownUntil, 'cooldown posé même sans quota');
});

// ===========================================================================
// 4. Plusieurs modèles successivement indisponibles
// ===========================================================================
test('4. tous les modèles en échec → échec HONNÊTE, aucune boucle infinie', async () => {
  const { result, calls, registry } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'quota_daily' },
      [FREE_B]: { behavior: 'rate_limit' },
      [FREE_C]: { behavior: 'provider_unavailable' },
      [LOCAL]: { behavior: 'quota_daily' },
    },
    cfg: makeCfg({ models: [FREE_A, FREE_B, FREE_C, LOCAL], failover: { maxModelSwitches: 4, agentTimeoutMs: 15000, agentIdleTimeoutMs: 2500, inventoryMaxAgeMs: 1800000, circuitThreshold: 3 } }),
  });
  assert.equal(result.ok, false, 'aucun faux succès');
  assert.match(result.error, /ALL_MODELS_PROVIDER_UNAVAILABLE/);
  assert.equal(calls.length, 8, '2 échecs non transitoires + 2 échecs transitoires × 3 tentatives');
  assert.ok(registry.models[FREE_A].cooldownUntil);
  assert.ok(registry.models[FREE_B].cooldownUntil);
  assert.ok(registry.models[FREE_C].cooldownUntil);
});

// ===========================================================================
// 5. Reprise du travail après changement de modèle
// ===========================================================================
test('5. le travail partiellement fait survit à la bascule (fichiers modifiés conservés)', async () => {
  const { result, repoDir } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'partial_then_quota', writeFile: 'notes/partial.md', content: 'travail partiel\n' },
      [FREE_B]: { behavior: 'success', writeFile: 'notes/final.md', content: 'travail final\n' },
    },
  });
  assert.equal(result.ok, true);
  assert.ok(fs.existsSync(path.join(repoDir, 'notes/partial.md')), 'le fichier du modèle en échec est conservé');
  assert.ok(fs.existsSync(path.join(repoDir, 'notes/final.md')), 'le modèle de secours continue le travail');
});

// ===========================================================================
// 6. Préservation du contexte
// ===========================================================================
test('6. le contexte (mission, raison d\'échec, fichiers modifiés) est transmis au modèle suivant', async () => {
  const { calls } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'partial_then_quota', writeFile: 'notes/partial.md', content: 'x\n' },
      [FREE_B]: { behavior: 'success' },
    },
  });
  const second = calls.find((c) => c.model === FREE_B);
  assert.ok(second, 'le second modèle a été appelé');
  assert.match(second.prompt, /Ajouter une entrée factuelle de test/, 'la mission est conservée');
  assert.match(second.prompt, /REPRISE APRÈS BASCULE DE MODÈLE/, 'le bloc de reprise est présent');
  assert.match(second.prompt, /notes\/partial\.md/, 'les fichiers déjà modifiés sont listés');
  assert.match(second.prompt, /quota|Daily/i, 'la raison de l\'échec est transmise');
  assert.match(second.prompt, /NE PAS recommencer/, 'l\'instruction de non-reprise est explicite');
});

// ===========================================================================
// 7. Retour automatique au modèle initial après réinitialisation
// ===========================================================================
test('7. le modèle initial redevient prioritaire après expiration de son cooldown', async () => {
  const first = await runFailover({
    plan: { [FREE_A]: { behavior: 'quota_daily' }, [FREE_B]: { behavior: 'success' } },
  });
  assert.equal(first.result.model, FREE_B, 'première passe : le secours prend le relais');

  // Cooldown expiré (simulation d'un reset de quota) → réintégration automatique.
  const regFile = path.join(first.stateDir, 'model-registry.json');
  const reg = registryLib.readRegistry(regFile);
  reg.models[FREE_A].cooldownUntil = new Date(Date.now() - 1000).toISOString();
  reg.models[FREE_A].notBefore = new Date(Date.now() - 1000).toISOString();
  registryLib.writeRegistry(regFile, reg);

  const plan2 = makePlan(first.stateDir, { [FREE_A]: { behavior: 'success' }, [FREE_B]: { behavior: 'success' } });
  process.env.FACTORY_STUB_PLAN = plan2;
  const res = await failover.executeJobWithFailover({
    stateDir: first.stateDir,
    cfg: makeCfg(),
    job: makeJob('job-test-retry'),
    repoCfg: { local: first.repoDir, gates: [] },
    log: () => {},
  });
  assert.equal(res.ok, true);
  assert.equal(res.model, FREE_A, 'le modèle initial est réintégré automatiquement');
  const reg2 = registryLib.readRegistry(regFile);
  assert.equal(reg2.models[FREE_A].status, 'available', 'le registre le réintègre');
  assert.equal(reg2.models[FREE_A].cooldownUntil, null);
  assert.ok(plan2);
});

// ===========================================================================
// 8. Absence de bascule vers un modèle payant
// ===========================================================================
test('8. aucun modèle payant n\'est jamais sélectionné (dépense = 0)', async () => {
  const inv = defaultInventory();
  const paid = inv.find((m) => m.ref === PAID);
  paid.eligible = true; // présent dans l'inventaire, mais payant
  const { result, calls, registry } = await runFailover({
    plan: { [FREE_A]: { behavior: 'quota_daily' }, [FREE_B]: { behavior: 'success' } },
    inventory: inv,
    cfg: makeCfg({ models: [PAID, FREE_A, FREE_B] }), // le payant est prioritaire dans la config
  });
  assert.equal(result.ok, true);
  assert.ok(!calls.some((c) => c.model === PAID), 'le modèle payant n\'a jamais été appelé');
  assert.equal(result.spend, 0, 'dépense = 0');
  assert.equal(registry.stats.spend, 0, 'registre : dépense 0');
});

// ===========================================================================
// 9. Absence de boucle infinie
// ===========================================================================
test('9. le nombre de bascules est borné (circuit breaker de job)', async () => {
  const { result, calls } = await runFailover({
    plan: { [FREE_A]: { behavior: 'quota_daily' }, [FREE_B]: { behavior: 'quota_daily' }, [FREE_C]: { behavior: 'quota_daily' }, [LOCAL]: { behavior: 'success' } },
    cfg: makeCfg({ models: [FREE_A, FREE_B, FREE_C, LOCAL], failover: { maxModelSwitches: 2, agentTimeoutMs: 15000, agentIdleTimeoutMs: 2500, inventoryMaxAgeMs: 1800000, circuitThreshold: 3 } }),
  });
  assert.equal(result.ok, false, 'la boucle s\'arrête : pas de succès simulé');
  assert.equal(calls.length, 2, 'exactement 2 tentatives (limite respectée)');
  assert.ok(result.attempts.length <= 2);
});

// ===========================================================================
// 10. Plusieurs agents simultanés
// ===========================================================================
test('10. plusieurs agents simultanés : chacun bascule, le registre reste cohérent', async () => {
  const stateDir = tmpDir();
  const repoA = initRepo(path.join(stateDir, 'repoA'));
  const repoB = initRepo(path.join(stateDir, 'repoB'));
  seedInventory(stateDir, defaultInventory());
  const planFile = makePlan(stateDir, {
    [FREE_A]: { behavior: 'quota_daily' },
    [FREE_B]: { behavior: 'success', commit: true, commitMessage: 'chore(stub): travail' },
  });
  const logFile = path.join(stateDir, 'stub-calls.jsonl');
  process.env.FACTORY_STUB_PLAN = planFile;
  process.env.FACTORY_STUB_LOG = logFile;

  const cfg = makeCfg();
  const [r1, r2] = await Promise.all([
    failover.executeJobWithFailover({ stateDir, cfg, job: makeJob('job-sim-1'), repoCfg: { local: repoA, gates: [] }, log: () => {} }),
    failover.executeJobWithFailover({ stateDir, cfg, job: makeJob('job-sim-2'), repoCfg: { local: repoB, gates: [] }, log: () => {} }),
  ]);
  assert.equal(r1.ok, true, 'agent 1 réussit via le secours');
  assert.equal(r2.ok, true, 'agent 2 réussit via le secours');
  assert.equal(r1.failovers, 1);
  assert.equal(r2.failovers, 1);
  const reg = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  assert.ok(reg.models[FREE_A], 'le registre contient le modèle en échec');
  assert.ok(reg.models[FREE_B], 'le registre contient le modèle de secours');
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, 'model-registry.json'), 'utf8')).version, registryLib.REGISTRY_VERSION);
});

// ===========================================================================
// 11. Une erreur de code NE déclenche PAS de changement de modèle
// ===========================================================================
test('11. erreur de programmation → aucun changement de modèle (contrat P0)', async () => {
  const { result, calls } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'code_error', stderr: 'SyntaxError: Unexpected token in test build output\n' },
      [FREE_B]: { behavior: 'success' },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, CATEGORY.CODE_ERROR);
  assert.equal(calls.length, 1, 'le second modèle ne doit PAS être appelé pour une erreur de code');
});

// ===========================================================================
// 12. Hang fournisseur (timeout d'inactivité) → bascule
// ===========================================================================
test('12. modèle muet (hang fournisseur) → timeout d\'activité puis bascule', async () => {
  const { result, calls } = await runFailover({
    plan: { [FREE_A]: { behavior: 'timeout', sleepMs: 30000 }, [FREE_B]: { behavior: 'success' } },
  });
  assert.equal(result.ok, true, 'la bascule doit permettre la poursuite');
  assert.equal(calls.length, 4, '3 tentatives de timeout bornées puis bascule');
  assert.equal(result.attempts[0].category, CATEGORY.TIMEOUT);
  assert.ok(result.attempts[0].idleTimedOut || result.attempts[0].timedOut);
});

test('12b. preuve modèle/fournisseur/session : les trois faits doivent être sur la même ligne', () => {
  const split = failover.verifyModelUsed(
    'modelID=nvidia/model-a\nproviderID=nvidia\nsession.id=ses_same_line\n',
    'nvidia/model-a',
    'ses_same_line',
    'nvidia',
  );
  assert.equal(split.verified, false, 'des lignes séparées ne constituent pas une preuve');
  assert.equal(split.evidenceRecord, null);

  const bound = failover.verifyModelUsed(
    'timestamp=2026-11-15T00:00:00Z level=INFO message=stream providerID=nvidia modelID=nvidia/model-a session.id=ses_same_line\n',
    'nvidia/model-a',
    'ses_same_line',
    'nvidia',
  );
  assert.equal(bound.verified, true);
  assert.match(bound.evidenceRecord, /providerID=nvidia/);
  assert.match(bound.evidenceRecord, /modelID=nvidia\/model-a/);
  assert.match(bound.evidenceRecord, /session\.id=ses_same_line/);
});

// ===========================================================================
// 13. Classifieur : signatures attendues
// ===========================================================================
test('13. classifieur : quotas / rate limit / provider / code', () => {
  const daily = classifyFailure({ events: [{ type: 'error', error: { name: 'ProviderError', data: { message: 'Daily free messages exhausted' } } }] });
  assert.equal(daily.category, CATEGORY.DAILY_QUOTA_EXHAUSTED);
  assert.equal(daily.switchModel, true);
  assert.ok(daily.resetAt, 'une heure de reset est calculée');

  const rate = classifyFailure({ events: [{ type: 'error', error: { data: { message: 'HTTP 429 Too Many Requests' } } }] });
  assert.equal(rate.category, CATEGORY.RATE_LIMITED);

  const provider = classifyFailure({ events: [{ type: 'error', error: { data: { message: 'Provider temporarily unavailable' } } }] });
  assert.equal(provider.category, CATEGORY.PROVIDER_UNAVAILABLE);

  const credit = classifyFailure({ events: [{ type: 'error', error: { data: { message: 'HTTP 402 Payment required: insufficient credit' } } }] });
  assert.equal(credit.category, CATEGORY.QUOTA_CREDIT);

  const code = classifyFailure({ stderr: 'SyntaxError: Unexpected token' });
  assert.equal(code.category, CATEGORY.CODE_ERROR);
  assert.equal(code.switchModel, false, 'une erreur de code ne doit jamais provoquer de bascule');

  const codeOnStdout = classifyFailure({ stdout: 'SyntaxError: Unexpected token in test build output' });
  assert.equal(codeOnStdout.category, CATEGORY.CODE_ERROR, 'stdout porte aussi les erreurs de code');
  assert.equal(codeOnStdout.switchModel, false, 'stdout ne doit jamais autoriser une bascule');
});

// ===========================================================================
// 14. Inventaire : parsing réel + filtre gratuit + priorité
// ===========================================================================
test('14. inventaire : parsing du format réel, filtre gratuit, priorité Nvidia', () => {
  const sample = [
    'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b',
    '{ "id": "nvidia/nemotron-3.5-super-vl-120b-a12b", "providerID": "nvidia", "status": "active", "name": "Nemotron",',
    '  "capabilities": { "reasoning": false, "toolcall": true, "output": { "text": true } },',
    '  "cost": { "input": 0, "output": 0, "cache": { "read": 0, "write": 0 } },',
    '  "limit": { "context": 131072, "output": 8192 }, "family": "nemotron" }',
    'openai/gpt-x',
    '{ "id": "gpt-x", "providerID": "openai", "status": "active", "cost": { "input": 3, "output": 15, "cache": { "read": 0, "write": 0 } } }',
  ].join('\n');
  const parsed = inventoryLib.parseVerboseModels(sample);
  assert.equal(parsed.length, 2, 'deux modèles parsés');
  assert.equal(parsed[0].ref, 'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b');
  assert.equal(parsed[0].provider, 'nvidia');
  assert.equal(inventoryLib.isFree(parsed[0]), true);
  assert.equal(inventoryLib.isFree(parsed[1]), false, 'un modèle payant est détecté');

  const ranked = inventoryLib.rankModels({
    models: [
      Object.assign(model(FREE_A), { eligible: true, free: true }),
      Object.assign(model(PAID, { free: false }), { eligible: true }),
      Object.assign(model(LOCAL), { eligible: true, free: true }),
    ],
    installedOllama: ['qwen2.5-coder:7b'],
  }, { preferred: [FREE_A] });
  assert.ok(!ranked.some((r) => r.ref === PAID), 'le modèle payant est exclu du classement');
  assert.equal(ranked[0].ref, FREE_A, 'le modèle prioritaire Nvidia passe en tête');
});

// ===========================================================================
// 15. Non-régression du bug de hang (héritage de handles) — 2026-11-14
// ===========================================================================
test('15. exécution : le petit-fils qui hérite des handles ne bloque plus le runner', async () => {
  const script = "const {spawn}=require('child_process');spawn(process.execPath,['-e','setTimeout(()=>{},120000)'],{stdio:'inherit'});setTimeout(()=>{},120000);";
  const started = Date.now();
  const r = await runProcess({
    file: process.execPath,
    args: ['-e', script],
    timeoutMs: 3000,
  });
  const elapsed = Date.now() - started;
  assert.ok(r.timedOut, 'le timeout doit être signalé');
  assert.ok(elapsed < 20000, `la résolution doit être immédiate (${elapsed} ms) — pas de hang`);
  assert.equal(r.exitCode, null);
});

// ===========================================================================
// 17. Parsing de `opencode auth list` (sortie ANSI réelle)
// ===========================================================================
test('17. inventaire : parsing ANSI de opencode auth list → fournisseurs réels', () => {
  // Sortie RÉELLE capturée le 2026-11-14 (codes ANSI +Credentials+Environment)
  const raw = '\u001b[90m┌\u001b[39m  Credentials \u001b[90m~\\.local\\share\\opencode\\auth.json\n'
    + '\u001b[90m│\u001b[39m\n'
    + '\u001b[34m●\u001b[39m  OpenCode Go \u001b[90mapi\n'
    + '\u001b[90m│\u001b[39m\n'
    + '\u001b[34m●\u001b[39m  Ollama Cloud \u001b[90mapi\n'
    + '\u001b[90m│\u001b[39m\n'
    + '\u001b[34m●\u001b[39m  Nvidia \u001b[90mapi\n'
    + '\u001b[90m│\u001b[39m\n'
    + '\u001b[34m●\u001b[39m  MiniMax (minimax.io) \u001b[90mapi\n'
    + '\u001b[90m│\u001b[39m\n'
    + '\u001b[34m●\u001b[39m  openrouter-free \u001b[90mapi\n'
    + '\u001b[90m└\u001b[39m  5 credentials\n';
  const parsed = inventoryLib.parseAuthProviders(raw);
  assert.ok(parsed.providers.includes('nvidia'), 'Nvidia détecté');
  assert.ok(parsed.providers.includes('opencode'), '"OpenCode Go" normalisé en "opencode"');
  assert.ok(parsed.providers.includes('ollama'), '"Ollama Cloud" normalisé en "ollama"');
  assert.ok(parsed.providers.includes('minimax'), '"MiniMax (minimax.io)" normalisé en "minimax"');
  assert.ok(parsed.providers.includes('openrouter'), '"openrouter-free" normalisé en "openrouter"');
  assert.equal(parsed.credentials.length, 5, '5 credentials analysées');
  assert.equal(parsed.credentials[0].type, 'api');
});

// ===========================================================================
// 18. Sonde de bascule : modèle hors inventaire tenté en rang 1
// ===========================================================================
test('18. sonde hors inventaire → échec réel → bascule vers le modèle gratuit', async () => {
  const PROBE = 'nvidia/nvidia/model-quota-probe-introuvable';
  const { result, calls, registry } = await runFailover({
    plan: {
      [PROBE]: { behavior: 'provider_unavailable', message: 'Provider returned an error (model not found).' },
      [FREE_B]: { behavior: 'success' },
    },
    cfg: makeCfg({
      models: [FREE_B],
      probeModels: [PROBE],
      failover: Object.assign({}, makeCfg().failover, { allowUnknownCostProbeRefs: [PROBE] }),
    }),
  });
  assert.equal(result.ok, true, 'la bascule doit réussir');
  assert.equal(result.failovers, 1, 'une bascule comptabilisée');
  assert.equal(calls[0].model, PROBE, 'la sonde est tentée EN PREMIER');
  assert.equal(calls[1].model, FREE_B, 'le modèle de secours prend le relais');
  assert.ok(registry.models[PROBE], 'la sonde est mémorisée au registre');
});

// ===========================================================================
// 19. Une sonde payante connue est REFUSÉE (jamais de dépense)
// ===========================================================================
test('19. sonde payante → refusée avant tout appel (dépense 0)', async () => {
  const inv = defaultInventory();
  const paid = inv.find((m) => m.ref === PAID);
  paid.eligible = true;
  const { result, calls } = await runFailover({
    plan: { [PAID]: { behavior: 'success' }, [FREE_B]: { behavior: 'success' } },
    inventory: inv,
    cfg: makeCfg({ models: [FREE_B], probeModels: [PAID] }),
  });
  assert.equal(result.ok, true);
  assert.ok(!calls.some((c) => c.model === PAID), 'le modèle payant n\'est JAMAIS appelé');
  assert.equal(result.spend, 0);
});

// ===========================================================================
// 20. Un modèle qui RÉPOND mais n'EXÉCUTE pas → pas de faux succès
// ===========================================================================
test('20. réponse sans résultat réel → bascule (RESULT_NOT_PRODUCED)', async () => {
  const { result, calls } = await runFailover({
    plan: {
      // FREE_A répond « c'est fait » sans créer le fichier (faux succès)
      [FREE_A]: { behavior: 'success', text: "C'est fait, j'ai créé le fichier et commité." },
      [FREE_B]: { behavior: 'success', writeFile: 'factory-real-proof.txt', content: 'FACTORY_REAL_OK\n' },
    },
    job: Object.assign(makeJob('job-verify-1'), {
      verify: { requiredFiles: [{ path: 'factory-real-proof.txt', contains: 'FACTORY_REAL_OK' }] },
    }),
  });
  assert.equal(result.ok, true, 'le job doit réussir via le modèle qui EXÉCUTE');
  assert.equal(result.failovers, 1, 'la bascule doit être déclenchée par la vérification');
  assert.equal(calls.length, 2);
  assert.equal(result.attempts[0].category, 'RESULT_NOT_PRODUCED', 'catégorie explicite');
  assert.equal(result.attempts[0].outcome, 'failed', 'pas de faux succès');
  assert.equal(result.attempts[1].outcome, 'success');
});

test('20b. contrat job-level: le résultat produit avant failover satisfait le job complet', async () => {
  const { result, calls } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'partial_then_quota', writeFile: 'factory-job-proof.txt', content: 'FACTORY_JOB_OK\n' },
      [FREE_B]: { behavior: 'success' },
    },
    job: Object.assign(makeJob('job-verify-job-level'), {
      verify: { requiredFiles: [{ path: 'factory-job-proof.txt', contains: 'FACTORY_JOB_OK' }] },
    }),
  });
  assert.equal(result.ok, true, 'le contrat est évalué sur le job, pas sur une tentative isolée');
  assert.equal(result.model, FREE_B, 'le failover a bien eu lieu');
  assert.equal(calls.length, 2);
  assert.ok(result.attempts[1].resultCheck.checks.find((check) => check.id === 'file:factory-job-proof.txt').ok,
    'le fichier produit par la première tentative est reconnu au niveau job');
});

// ===========================================================================
// 21. Registre : circuit breaker et réintégration
// ===========================================================================
test('16. registre : circuit breaker après N échecs, réintégration à l\'expiration', () => {
  const reg = registryLib.emptyRegistry();
  const cls = { category: CATEGORY.RATE_LIMITED, quotaType: 'short_term', cooldownMs: 1000, resetAt: new Date(Date.now() + 1000).toISOString(), reason: 'x' };
  registryLib.recordFailure(reg, 'x/model', cls, { circuitThreshold: 3 });
  registryLib.recordFailure(reg, 'x/model', cls, { circuitThreshold: 3 });
  assert.notEqual(reg.models['x/model'].status, 'circuit_open');
  registryLib.recordFailure(reg, 'x/model', cls, { circuitThreshold: 3 });
  assert.equal(reg.models['x/model'].status, 'circuit_open', 'circuit ouvert après 3 échecs consécutifs');
  assert.ok(reg.models['x/model'].cooldownUntil);
  reg.models['x/model'].cooldownUntil = new Date(Date.now() - 1).toISOString();
  const restored = registryLib.expireCooldowns(reg, Date.now());
  assert.deepEqual(restored, ['x/model'], 'le modèle est réintégré automatiquement');
  assert.equal(reg.models['x/model'].status, 'available');
  assert.equal(reg.models['x/model'].consecutiveFailures, 3, 'le compteur reste pour que la prochaine sonde rouvre le breaker');
  registryLib.recordFailure(reg, 'x/model', cls, { circuitThreshold: 3 });
  assert.equal(reg.models['x/model'].status, 'circuit_open', 'une nouvelle défaillance rouvre immédiatement le breaker');
});

// ===========================================================================
// 22. Coût observé non nul → COST_VIOLATION terminal et comptabilisé
// ===========================================================================
test('22. coût observé non nul → aucun faux succès, aucun retry/failover, dépense comptabilisée', async () => {
  const { result, calls, registry } = await runFailover({
    plan: {
      [FREE_A]: { behavior: 'success', cost: 0.25 },
      [FREE_B]: { behavior: 'success' },
    },
  });
  assert.equal(result.ok, false, 'un coût non nul refuse le succès');
  assert.equal(result.errorCategory, CATEGORY.COST_VIOLATION);
  assert.equal(calls.length, 1, 'aucun autre appel après la violation de coût');
  assert.equal(result.failovers, 0, 'aucun failover payant');
  assert.equal(result.spend, 0.25, 'le coût observé reste comptabilisé dans le résultat');
  assert.equal(registry.stats.spend, 0.25, 'le coût observé reste comptabilisé dans le registre');
  assert.equal(result.attempts[0].cost, 0.25, 'le coût est lu depuis part.cost');
  assert.equal(result.attempts[0].category, CATEGORY.COST_VIOLATION);
});

// ===========================================================================
// 23. paidAllowed=true est refusé avant tout appel
// ===========================================================================
test('23. paidAllowed=true → refus immédiat avant tout fournisseur', async () => {
  await assert.rejects(
    () => failover.executeJobWithFailover({
      stateDir: tmpDir(),
      cfg: makeCfg({ paidAllowed: true }),
      job: makeJob('job-paid-forbidden'),
      repoCfg: { local: tmpDir(), gates: [] },
      log: () => {},
    }),
    (error) => error && error.code === 'PAID_MODELS_FORBIDDEN',
  );
});

// ===========================================================================
// 24. Sonde de coût inconnu : allowlist exacte obligatoire
// ===========================================================================
test('24. sonde inconnue sans allowlist exacte → refusée avant tout appel', async () => {
  const PROBE = 'nvidia/nvidia/model-quota-probe-introuvable';
  const { result, calls } = await runFailover({
    plan: {
      [PROBE]: { behavior: 'provider_unavailable' },
      [FREE_B]: { behavior: 'success' },
    },
    cfg: makeCfg({
      models: [FREE_B],
      probeModels: [PROBE],
      failover: Object.assign({}, makeCfg().failover, { allowUnknownCostProbeRefs: [] }),
    }),
  });
  assert.equal(result.ok, true, 'le modèle gratuit reste utilisable');
  assert.ok(!calls.some((c) => c.model === PROBE), 'la sonde sans allowlist exacte n\'est jamais appelée');
  assert.ok(result.skipped.some((s) => s.ref === PROBE && s.state === 'UNKNOWN_COST_REFUSED'));
});
