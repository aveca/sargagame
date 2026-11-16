'use strict';

/**
 * Tests de continuité Factory V3 (node:test).
 * Aucun mock de logique : le "fournisseur" est un VRAI processus (stub CLI)
 * lancé par le module, et le registre/lock/journal sont de vrais fichiers.
 * Run : node --test tests/unit/factory-v3-continuity.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const continuity = require('../../scripts/factory-v3/lib/continuity.cjs');
const { CATEGORY, buildClassification } = require('../../scripts/factory-v3/lib/error-classifier.cjs');
const { emptyRegistry, writeRegistry, recordFailure } = require('../../scripts/factory-v3/lib/model-registry.cjs');

const STUB = path.join(__dirname, '..', 'fixtures', 'factory-v3-continuity-stub.cjs');

function tmpStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'factory-v3-continuity-'));
}

function sessionFixture(overrides = {}) {
  return Object.assign({
    id: 'ses_test_1',
    title: 'Mission Sargagame',
    directory: process.cwd(),
    model: { id: 'nvidia/minimaxai/minimax-m3.1-flash', providerID: 'nvidia' },
    updated: Date.now() - 60 * 60 * 1000, // silence d'une heure => périmée
  }, overrides);
}

test('continuity: detectStuckSessions signale une session périmée et ignore une session active', () => {
  const nowMs = Date.now();
  const stuck = continuity.detectStuckSessions({
    nowMs,
    sessions: [
      sessionFixture(),
      sessionFixture({ id: 'ses_active', updated: nowMs - 1000 }),
      sessionFixture({ id: 'ses_wrecent', updated: nowMs - 60 * 1000 }),
    ],
  });
  const ids = stuck.map((s) => s.id);
  assert.ok(ids.includes('ses_test_1'), 'session périmée détectée');
  assert.ok(!ids.includes('ses_active'), 'session active ignorée');
  assert.ok(!ids.includes('ses_wrecent'), 'session récemment active ignorée');
  const target = stuck.find((s) => s.id === 'ses_test_1');
  assert.equal(target.stale, true);
  assert.equal(target.modelRef, 'nvidia/minimaxai/minimax-m3.1-flash');
});

test('continuity: classifySessionFailure identifie un 429 fournisseur (rate limit)', () => {
  const { classification } = continuity.classifySessionFailure({
    stderr: 'Provider request failed with HTTP 429: {"status":429,"title":"Too Many Requests"}',
  });
  assert.equal(classification.category, CATEGORY.RATE_LIMITED);
  assert.equal(classification.providerLimited, true);
  assert.equal(classification.httpStatus, 429);
});

test('continuity: selectFallbackModel change de fournisseur sur 429 et écarte les cooldowns', () => {
  const registry = emptyRegistry();
  const classification = buildClassification(CATEGORY.RATE_LIMITED, {
    providerLimited: true,
    reason: 'quota fournisseur épuisé',
    cooldownMs: 120000,
    resetAt: new Date(Date.now() + 120000).toISOString(),
  });
  const candidates = [
    { ref: 'nvidia/minimaxai/minimax-m3.1-flash', provider: 'nvidia' },
    { ref: 'ollama/qwen2.5-coder:7b', provider: 'ollama' },
    { ref: 'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b', provider: 'nvidia' },
  ];
  const picked = continuity.selectFallbackModel({
    registry, currentModel: 'nvidia/minimaxai/minimax-m3.1-flash', classification, candidates,
  });
  assert.ok(picked, 'un secours est choisi');
  assert.equal(picked.ref, 'ollama/qwen2.5-coder:7b', 'un AUTRE fournisseur est préféré');

  // Le modèle en cooldown est écarté même s'il est le seul secours valide.
  const registry2 = emptyRegistry();
  recordFailure(registry2, 'ollama/qwen2.5-coder:7b', classification, {});
  const picked2 = continuity.selectFallbackModel({
    registry: registry2, currentModel: 'nvidia/minimaxai/minimax-m3.1-flash', classification, candidates,
  });
  assert.equal(picked2.ref, 'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b');
});

test('continuity: buildContinuityPrompt conserve le contexte et rédige les secrets', () => {
  const prompt = continuity.buildContinuityPrompt({
    mission: 'Reprendre la mission Sargagame',
    checkpoint: { lastValidated: 'commit abc123', step: 'tests verts' },
    errorText: 'HTTP 429 Too Many Requests',
    modelRef: 'ollama/qwen2.5-coder:7b',
    providerID: 'ollama',
  });
  assert.ok(prompt.includes('[FACTORY-V3 CONTINUITE]'));
  assert.ok(prompt.includes('Reprendre la mission Sargagame'));
  assert.ok(prompt.includes('abc123'), 'dernier point validé conservé');
  assert.ok(prompt.includes('429'), 'erreur constatée conservée');
  assert.ok(prompt.includes('REPRISE APRES BASCULE DE MODELE'));

  const secretPrompt = continuity.buildContinuityPrompt({
    mission: 'clé sk-ABCDEF1234567890 et Bearer abcdefghijklmn',
  });
  assert.ok(!secretPrompt.includes('ABCDEF1234567890'), 'clé sk- rédaction');
  assert.ok(!secretPrompt.includes('abcdefghijklmn'), 'Bearer rédaction');
});

test('continuity: checkpoint et journal sont persistés, append-only et sans secret', () => {
  const stateDir = tmpStateDir();
  const saved = continuity.saveCheckpoint(stateDir, 'ses_test_1', {
    currentModel: 'ollama/qwen2.5-coder:7b',
    lastValidated: 'phase 0.7 checklist',
  });
  assert.ok(saved.updatedAt);
  const loaded = continuity.loadCheckpoint(stateDir, 'ses_test_1');
  assert.equal(loaded.lastValidated, 'phase 0.7 checklist');

  continuity.journalContinuity(stateDir, { event: 'TEST', note: 'clé sk-SECRETSECRETSECRET' });
  continuity.journalContinuity(stateDir, { event: 'TEST2', note: 'deuxième ligne' });
  const journal = continuity.readContinuityJournal(stateDir, 10);
  assert.equal(journal.length, 2);
  assert.equal(journal[0].event, 'TEST');
  assert.equal(journal[1].event, 'TEST2');
  assert.ok(!JSON.stringify(journal).includes('SECRETSECRETSECRET'), 'aucun secret journalisé');
});

test('continuity: le verrou empêche deux opérations concurrentes', () => {
  const stateDir = tmpStateDir();
  const first = continuity.acquireContinuityLock(stateDir);
  assert.equal(first.ok, true);
  const second = continuity.acquireContinuityLock(stateDir, { timeoutMs: 200 });
  assert.equal(second.ok, false, 'deuxième acquisition refusée');
  continuity.releaseContinuityLock(stateDir, first.token);
  const third = continuity.acquireContinuityLock(stateDir, { timeoutMs: 500 });
  assert.equal(third.ok, true, 'verrou libéré puis ré-acquis');
  continuity.releaseContinuityLock(stateDir, third.token);
});

test('continuity: resumeSession + verifyResume prouvent la reprise réelle (stub CLI)', async () => {
  const stateDir = tmpStateDir();
  const result = await continuity.resumeSession({
    repoDir: process.cwd(),
    sessionId: 'ses_test_1',
    modelRef: 'ollama/qwen2.5-coder:7b',
    prompt: 'reprends ici',
    opencodeBin: process.execPath,
    opencodePrefixArgs: [STUB],
    timeoutMs: 30000,
    idleTimeoutMs: 0,
  });
  assert.equal(result.exitCode, 0);
  const verification = continuity.verifyResume({
    result, sessionId: 'ses_test_1', modelRef: 'ollama/qwen2.5-coder:7b',
  });
  assert.equal(verification.verified, true, 'modèle + fournisseur + session prouvés');
  assert.equal(verification.ok, true);
  assert.equal(verification.textEvents, 1);
  assert.equal(verification.errorEvents, 0);
});

test('continuity: verifyResume refuse une preuve portant un autre modèle', async () => {
  const previous = process.env.FACTORY_CONTINUITY_STUB_MODE;
  process.env.FACTORY_CONTINUITY_STUB_MODE = 'mismatch';
  try {
    const result = await continuity.resumeSession({
      repoDir: process.cwd(),
      sessionId: 'ses_stub_mismatch',
      modelRef: 'ollama/qwen2.5-coder:7b',
      prompt: 'reprends ici',
      opencodeBin: process.execPath,
      opencodePrefixArgs: [STUB],
      timeoutMs: 30000,
      idleTimeoutMs: 0,
    });
    const verification = continuity.verifyResume({
      result, sessionId: 'ses_stub_mismatch', modelRef: 'ollama/qwen2.5-coder:7b',
    });
    assert.equal(verification.verified, false);
    assert.equal(verification.ok, false);
  } finally {
    if (previous === undefined) delete process.env.FACTORY_CONTINUITY_STUB_MODE;
    else process.env.FACTORY_CONTINUITY_STUB_MODE = previous;
  }
});

test('continuity: une erreur 429 réelle est classée RATE_LIMITED par le stub', async () => {
  const previous = process.env.FACTORY_CONTINUITY_STUB_MODE;
  process.env.FACTORY_CONTINUITY_STUB_MODE = '429';
  try {
    const result = await continuity.resumeSession({
      repoDir: process.cwd(),
      sessionId: 'ses_stub_429',
      modelRef: 'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b',
      prompt: 'reprends ici',
      opencodeBin: process.execPath,
      opencodePrefixArgs: [STUB],
      timeoutMs: 30000,
      idleTimeoutMs: 0,
    });
    assert.equal(result.exitCode, 1);
    const { classification } = continuity.classifySessionFailure({
      stdout: result.stdout, stderr: result.stderr, events: result.events,
    });
    assert.equal(classification.category, CATEGORY.RATE_LIMITED);
    assert.equal(classification.providerLimited, true);
  } finally {
    if (previous === undefined) delete process.env.FACTORY_CONTINUITY_STUB_MODE;
    else process.env.FACTORY_CONTINUITY_STUB_MODE = previous;
  }
});

test('continuity: runContinuity reprend la session, bascule le modèle et journalise', async () => {
  const stateDir = tmpStateDir();
  const registryFile = path.join(stateDir, 'model-registry.json');
  writeRegistry(registryFile, emptyRegistry());
  continuity.saveCheckpoint(stateDir, 'ses_test_1', { lastValidated: 'point validé A' });

  const report = await continuity.runContinuity({
    stateDir,
    session: sessionFixture({ updated: Date.now() - 3600_000 }),
    repoDir: process.cwd(),
    mission: 'Terminer la Phase 0.7',
    candidates: ['nvidia/minimaxai/minimax-m3.1-flash', 'ollama/qwen2.5-coder:7b'],
    stderr: 'Provider request failed with HTTP 429: {"status":429,"title":"Too Many Requests"}',
    opencodeBin: process.execPath,
    opencodePrefixArgs: [STUB],
    timeoutMs: 30000,
    idleTimeoutMs: 0,
  });

  assert.equal(report.classification.category, CATEGORY.RATE_LIMITED);
  assert.equal(report.fallbackUsed, 'ollama/qwen2.5-coder:7b');
  assert.equal(report.resumed, true);
  assert.equal(report.verified, true, 'reprise vérifiée factuellement');

  const checkpoint = continuity.loadCheckpoint(stateDir, 'ses_test_1');
  assert.equal(checkpoint.currentModel, 'ollama/qwen2.5-coder:7b');
  assert.equal(checkpoint.previousModel, 'nvidia/minimaxai/minimax-m3.1-flash');
  assert.equal(checkpoint.verified, true);

  const journal = continuity.readContinuityJournal(stateDir, 10);
  const entry = journal.find((e) => e.event === 'CONTINUITY_RESUME');
  assert.ok(entry, 'journal de reprise présent');
  assert.equal(entry.verified, true);
  assert.equal(entry.to, 'ollama/qwen2.5-coder:7b');
});
