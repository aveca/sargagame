import { ModelRouter } from './router.js';
import { ModelBlacklist, HEALTH_STATES } from './blacklist.js';
import { QuotaManager } from './quotas.js';
import { FailureHistory } from './failure-history.js';
import { CostLedger, QueuePersistence } from './persistence.js';
import { ModelClient, createModelClient } from './clients.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MODEL_CONFIGS, TASK_TYPE_MAP, CRITICALITY_PROFILES, calculateConfidenceScore, estimateCost } from './models.js';

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${name}: ${e.message}`);
      failed++;
    }
  }

  await test('A) Blacklisted model cannot be selected', async () => {
    const router = new ModelRouter({ enableBlacklist: true, enableQuotas: false, enableFailureTracking: false, persistenceEnabled: false });
    router.registerClient('nemotron', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.registerClient('glm', { async call() { return { content: 'ok', tokens: 100 }; } });

    router.blacklist.add('nemotron', 60000, 'test');

    const selection = router.selectModel({ taskType: 'reasoning', criticality: 'P0' });
    assert(selection.modelId !== 'nemotron', 'Blacklisted model should not be selected');
    assert(selection.modelId === 'glm', 'Should select available model');
  });

  await test('B) P0 task selects most reliable available model', async () => {
    const router = new ModelRouter({ enableBlacklist: false, enableQuotas: false, enableFailureTracking: false, persistenceEnabled: false });
    router.registerClient('nemotron', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.registerClient('glm', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.registerClient('qwen-32b', { async call() { return { content: 'ok', tokens: 100 }; } });

    const selection = router.selectModel({ taskType: 'reasoning', criticality: 'P0' });
    assertEqual(selection.modelId, 'nemotron', 'P0 should select nemotron (highest reliability for reasoning)');
    assert(selection.confidence > 0.55, 'P0 selection should have reasonable confidence');
  });

  await test('C) P2 task with low budget selects cost-optimized option', async () => {
    const router = new ModelRouter({
      enableBlacklist: false,
      enableQuotas: false,
      enableFailureTracking: false,
      globalBudget: { maxCostPerHour: 0.01, maxCostPerDay: 0.1 },
      persistenceEnabled: false
    });
    router.registerClient('nemotron-mini', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.registerClient('qwen-7b', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.registerClient('qwen-14b', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.registerClient('nemotron', { async call() { return { content: 'ok', tokens: 100 }; } });

    const selection = router.selectModel({
      taskType: 'cost-optimized',
      criticality: 'P2',
      estimatedTokens: 1000,
      budget: 0.001
    });
    assert(['nemotron-mini', 'qwen-7b', 'qwen-14b'].includes(selection.modelId),
      'P2 cost-optimized should select a cheap model from TASK_TYPE_MAP.cost-optimized (no deepflash): ' + selection.modelId);
    assert(selection.estimatedCost < 0.01, 'Estimated cost should be low');
  });

  await test('D) Quota exceeded triggers fallback', async () => {
    const router = new ModelRouter({ enableQuotas: true, enableBlacklist: false, enableFailureTracking: false, persistenceEnabled: false });
    router.registerClient('nemotron', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.registerClient('glm', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.setQuota('nemotron', { requests: 1, tokens: 1000, windowMs: 3600000 });

    await router.call({ taskType: 'reasoning', messages: [{ role: 'user', content: 'test' }] });

    try {
      await router.call({ taskType: 'reasoning', messages: [{ role: 'user', content: 'test' }] });
      assert(false, 'Should have thrown quota exceeded');
    } catch (e) {
      assert(e.message.includes('quota') || e.message.includes('All models failed'), 'Should fail due to quota');
    }
  });

  await test('E) All primary models unavailable throws explicit error', async () => {
    const router = new ModelRouter({ enableBlacklist: true, enableQuotas: true, enableFailureTracking: false, persistenceEnabled: false });
    router.registerClient('nemotron', { async call() { return { content: 'ok', tokens: 100 }; } });
    router.blacklist.add('nemotron', 60000, 'test');
    router.unregisterClient('glm');
    router.unregisterClient('qwen-32b');
    router.unregisterClient('glm-deep');

    try {
      router.selectModel({ taskType: 'reasoning', criticality: 'P0' });
      assert(false, 'Should have thrown no available models');
    } catch (e) {
      assert(e.message.includes('No available models') || e.message.includes('candidates filtered out'), 'Should throw explicit error');
    }
  });

  await test('Confidence score calculation', () => {
    const score = calculateConfidenceScore('nemotron', 8000, 'reasoning', 'P0');
    assert(score > 0.55, 'Nemotron for reasoning P0 should have reasonable confidence');
  });

  await test('Cost estimation', () => {
    const cost = estimateCost('nemotron', 1000, 500);
    assert(cost > 0 && cost < 0.01, 'Cost should be reasonable');
  });

  await test('Criticality profiles exist', () => {
    assert(CRITICALITY_PROFILES.P0, 'P0 profile exists');
    assert(CRITICALITY_PROFILES.P1, 'P1 profile exists');
    assert(CRITICALITY_PROFILES.P2, 'P2 profile exists');
    assert(CRITICALITY_PROFILES.P3, 'P3 profile exists');
  });

  await test('Health states', () => {
    const blacklist = new ModelBlacklist();
    assertEqual(blacklist.getHealthState('unknown'), HEALTH_STATES.HEALTHY, 'Unknown model is healthy');
    blacklist.add('test-model', 60000, 'test');
    assertEqual(blacklist.getHealthState('test-model'), HEALTH_STATES.BLACKLISTED, 'Blacklisted model returns blacklisted');
    blacklist.remove('test-model');
    assertEqual(blacklist.getHealthState('test-model'), HEALTH_STATES.HEALTHY, 'Removed model is healthy');
  });

  await test('Global budget tracking (CostLedger)', () => {
    const tmpFile = 'C:\\Users\\user\\AppData\\Local\\Temp\\opencode\\test-cost-ledger.jsonl';
    const ledger = new CostLedger({ ledgerFile: tmpFile, dailyBudget: 10, hourlyBudget: 5 });
    ledger.record('test-model', 1000, 500, 0.005);
    ledger.flush();
    const status = ledger.getBudgetStatus();
    assert(status.hourly.used >= 0.005, 'Global spend tracked');
  });

  await test('Quota canConsume with estimatedTokens', () => {
    const quotas = new QuotaManager({ globalBudget: { maxCostPerHour: 10, maxCostPerDay: 50 } });
    quotas.setQuota('test-model', { requests: 100, tokens: 10000, windowMs: 3600000 });
    const check = quotas.canConsume('test-model', 1000, 5);
    assert(check.allowed, 'Should allow within budget');
    quotas.consume('test-model', 1000, 5);
    const quota = quotas.getQuota('test-model');
    assertEqual(quota.used.tokens, 1000, 'Tokens consumed tracked');
    assertEqual(quota.available.tokens, 9000, 'Available tokens calculated');
  });

  await test('Failure history health indicator', () => {
    const history = new FailureHistory({ unhealthyThreshold: 0.2 });
    for (let i = 0; i < 3; i++) {
      history.record('test-model', { error: 'fail', code: 'ERROR', attempt: 1 });
    }
    assertEqual(history.getHealthIndicator('test-model'), 'unhealthy', 'High failure rate = unhealthy');
    history.clear('test-model');
    history.record('test-model', { error: 'fail', code: 'ERROR', attempt: 6 });
    const rate = history.getFailureRate('test-model');
    assert(rate >= 0.15 && rate < 0.2, `Failure rate should be degraded (0.15-0.2), got ${rate}`);
    assertEqual(history.getHealthIndicator('test-model'), 'degraded', 'Medium failure rate = degraded');
    history.clear('test-model');
    assertEqual(history.getHealthIndicator('test-model'), 'healthy', 'No failures = healthy');
  });

  await test('Retry with exponential backoff', async () => {
    let attempts = 0;
    const client = {
      async call() {
        attempts++;
        if (attempts < 3) throw new Error('TEMP_ERROR');
        return { content: 'success', tokens: 100 };
      }
    };
    const router = new ModelRouter({ enableRetry: true, persistenceEnabled: false });
    router.registerClient('nemotron', client);
    const result = await router.call({
      taskType: 'reasoning',
      messages: [{ role: 'user', content: 'test' }],
      options: { timeout: 5000 },
      maxFallbackAttempts: 0
    });
    assertEqual(attempts, 3, 'Should retry 2 times then succeed');
    assertEqual(result.content, 'success', 'Should return success after retries');
  });

  await test('Auth error escalation instead of silent blacklist', async () => {
    const router = new ModelRouter({ enableBlacklist: true, persistenceEnabled: false });
    router.registerClient('nemotron', {
      async call() {
        const err = new Error('Invalid API key');
        err.code = 'AUTH_ERROR';
        throw err;
      }
    });
    router.registerClient('glm', {
      async call() { return { content: 'ok', tokens: 100 }; }
    });
    try {
      await router.call({
        taskType: 'reasoning',
        messages: [{ role: 'user', content: 'test' }],
        maxFallbackAttempts: 2
      });
      assert(false, 'Should have thrown auth error');
    } catch (e) {
      assert(e.code === 'AUTH_ERROR' || e.message.includes('API key'), 'Should escalate auth error: ' + e.message);
    }
  });

  await test('Fallback avoids same provider on RATE_LIMIT', async () => {
    const router = new ModelRouter({ enableFallback: true, enableBlacklist: true, persistenceEnabled: false });
    let nemotronMiniCalls = 0;
    router.registerClient('nemotron', {
      async call() {
        const err = new Error('Rate limited');
        err.code = 'RATE_LIMIT';
        throw err;
      }
    });
    router.registerClient('nemotron-mini', {
      async call() {
        nemotronMiniCalls++;
        const err = new Error('Rate limited');
        err.code = 'RATE_LIMIT';
        throw err;
      }
    });
    router.registerClient('glm', {
      async call() { return { content: 'ok', tokens: 100 }; }
    });

    const result = await router.call({
      taskType: 'reasoning',
      messages: [{ role: 'user', content: 'test' }],
      maxFallbackAttempts: 3
    });
    assertEqual(result.model, 'glm', 'Must fallback to a DIFFERENT provider (glm/zhipu), not nemotron-mini (same nvidia provider)');
    assert(nemotronMiniCalls === 0, 'nemotron-mini (same provider) must NOT be called when nemotron RATE_LIMITed');
  });

  await test('AbortSignal timeout works', async () => {
    const slowClient = {
      async call(messages, options) {
        if (options.signal) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve('done'), 100);
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
        return { content: 'ok', tokens: 100 };
      }
    };
    const router = new ModelRouter({ persistenceEnabled: false });
    router.registerClient('nemotron', slowClient);
    router.registerClient('glm', slowClient);
    router.registerClient('qwen-32b', slowClient);
    router.registerClient('glm-deep', slowClient);
    try {
      await router.call({
        taskType: 'reasoning',
        messages: [{ role: 'user', content: 'test' }],
        options: { timeout: 10 },
        maxFallbackAttempts: 0
      });
      assert(false, 'Should have timed out');
    } catch (e) {
      assert(e.message.includes('timeout') || e.message.includes('All models failed'), 'Should timeout with AbortSignal');
    }
  });

  await test('API key redaction (real)', () => {
    const client = createModelClient('nemotron', { apiKey: 'sk-test-secret-12345' });
    assertEqual(client.apiKey, '***REDACTED***', 'apiKey getter must redact');
    const err = client._handleError({ message: 'Bearer sk-test-secret-12345 invalid', status: 401 });
    assert(!err.message.includes('sk-test-secret-12345'), 'Error message must not leak key: ' + err.message);
    assert(err.message.includes('***REDACTED***'), 'Error message must contain redaction');
  });

  await test('HTTPS enforced on baseUrl', () => {
    let threw = false;
    try {
      createModelClient('nemotron', { apiKey: 'x', baseUrl: 'http://insecure.example.com' });
    } catch (e) {
      threw = true;
      assert(e.message.includes('HTTPS'), 'Error must mention HTTPS requirement');
    }
    assert(threw, 'HTTP baseUrl must throw');
  });

  await test('MODEL_ROLES aligned with AGENTS.md', () => {
    assertEqual(TASK_TYPE_MAP.reasoning[0], 'glm-deep', 'Supervisor = GLM Deep first');
    assert(TASK_TYPE_MAP.coding.includes('nemotron-mini'), 'Coding includes nemotron-mini fallback');
    assertEqual(TASK_TYPE_MAP.release[0], 'nemotron-mini', 'Release = nemotron-mini first');
  });

  await test('C4) Queue.jsonl real persistence (append-only)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-test-'));
    try {
      const queueFile = path.join(tmpDir, 'queue.jsonl');
      const stateFile = path.join(tmpDir, 'state.json');
      const lockDir = path.join(tmpDir, '.lock');
      const persistence = new QueuePersistence({ queueFile, stateFile, lockDir, flushInterval: 50 });
      for (let i = 0; i < 5; i++) persistence.append('test_event', { idx: i });
      persistence.flush();
      const content = fs.readFileSync(queueFile, 'utf8').trim().split('\n');
      assertEqual(content.length, 5, 'Should write 5 lines');
      for (const line of content) {
        const ev = JSON.parse(line);
        assert(ev.event === 'test_event' && typeof ev.timestamp === 'string', 'Each line valid JSON event');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test('C2) Atomic state.json write (tmp+rename, no partial file)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-test-'));
    try {
      const stateFile = path.join(tmpDir, 'state.json');
      const lockDir = path.join(tmpDir, '.lock');
      const persistence = new QueuePersistence({ stateFile, lockDir });
      const fakeBlacklist = { toPersistence: () => ({ entries: { m1: { until: Date.now() + 60000 } } }) };
      const fakeQuotas = { toPersistence: () => ({ quotas: { m1: { limit: { requests: 100, tokens: 1000 }, used: { requests: 5, tokens: 50 }, windowStart: Date.now(), windowMs: 3600000 } }, globalBudget: { maxCostPerHour: 10, maxCostPerDay: 50 } }) };
      const fakeFailureHistory = { toPersistence: () => ({ history: {} }) };
      persistence.saveState(fakeBlacklist, fakeQuotas, fakeFailureHistory);
      assert(!fs.existsSync(stateFile + '.tmp'), 'tmp file must be cleaned up');
      const loaded = persistence.loadState();
      assert(loaded && loaded.blacklist && loaded.quotas, 'State must be readable after atomic write');
      assertEqual(loaded.quotas.quotas.m1.used.requests, 5, 'Quota state preserved');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test('C1) Router lock prevents concurrent instances', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-lock-'));
    try {
      const lockDir = path.join(tmpDir, '.lock');
      const stateFile = path.join(tmpDir, 'state.json');
      const queueFile = path.join(tmpDir, 'queue.jsonl');
      const r1 = new ModelRouter({
        persistenceEnabled: true, queueFile, stateFile, lockDir,
        enableQuotas: false, enableBlacklist: false, enableFailureTracking: false,
      });
      let threw = false;
      try {
        const r2 = new ModelRouter({
          persistenceEnabled: true, queueFile, stateFile, lockDir,
          enableQuotas: false, enableBlacklist: false, enableFailureTracking: false,
        });
        r2.shutdown();
      } catch (e) {
        threw = true;
        assert(e.message.includes('lock'), 'Should fail with lock message: ' + e.message);
      }
      assert(threw, 'Second router instance must not acquire the lock');
      r1.shutdown();
      const r3 = new ModelRouter({
        persistenceEnabled: true, queueFile, stateFile, lockDir,
        enableQuotas: false, enableBlacklist: false, enableFailureTracking: false,
      });
      r3.shutdown();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test('C6) State recovery from state.json after restart', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-restart-'));
    try {
      const stateFile = path.join(tmpDir, 'state.json');
      const lockDir = path.join(tmpDir, '.lock');
      const queueFile = path.join(tmpDir, 'queue.jsonl');
      const ledgerFile = path.join(tmpDir, 'cost.jsonl');
      const r1 = new ModelRouter({
        persistenceEnabled: true, queueFile, stateFile, lockDir, costLedgerFile: ledgerFile,
        enableQuotas: true, enableBlacklist: true, enableFailureTracking: true,
      });
      r1.registerClient('nemotron', { async call() { return { content: 'ok', tokens: 100 }; } });
      r1.setQuota('nemotron', { requests: 100, tokens: 1000, windowMs: 3600000 });
      r1.quotas.consume('nemotron', 500, 0.01);
      r1._saveState();
      r1.shutdown();
      const r2 = new ModelRouter({
        persistenceEnabled: true, queueFile, stateFile, lockDir, costLedgerFile: ledgerFile,
        enableQuotas: true, enableBlacklist: true, enableFailureTracking: true,
      });
      const q = r2.quotas.getQuota('nemotron');
      assertEqual(q.used.tokens, 500, 'Tokens consumed must survive restart');
      assertEqual(q.used.requests, 1, 'Requests count must survive restart');
      r2.shutdown();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test('C7) Daily budget exceeded blocks selection', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-budget-'));
    try {
      const queueFile = path.join(tmpDir, 'queue.jsonl');
      const stateFile = path.join(tmpDir, 'state.json');
      const lockDir = path.join(tmpDir, '.lock');
      const ledgerFile = path.join(tmpDir, 'cost.jsonl');
      const router = new ModelRouter({
        persistenceEnabled: true, queueFile, stateFile, lockDir,
        costLedgerFile: ledgerFile,
        globalBudget: { maxCostPerHour: 0.001, maxCostPerDay: 0.001 },
        enableQuotas: true, enableBlacklist: false, enableFailureTracking: false,
        autoLock: false,
      });
      router.registerClient('nemotron', { async call() { return { content: 'ok', tokens: 100 }; } });
      router.setQuota('nemotron', { requests: 100, tokens: 10000, windowMs: 3600000 });
      router.quotas.consume('nemotron', 100, 0.005);
      router.costLedger.flush();
      const budget = router.costLedger.getBudgetStatus();
      assert(budget.daily.used >= 0.005, 'Daily spend must be tracked: ' + budget.daily.used);
      let threw = false;
      try {
        router.selectModel({ taskType: 'reasoning', criticality: 'P0', estimatedTokens: 500 });
      } catch (e) {
        threw = true;
        assert(e.message.includes('No available models') || e.message.includes('candidates filtered'),
          'Should block selection due to budget: ' + e.message);
      }
      assert(threw, 'Selection must be blocked when daily budget exceeded');
      router.shutdown();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test('C8) CostLedger persistence across instances (NOT a crash test)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-crash-'));
    try {
      const ledgerFile = path.join(tmpDir, 'cost.jsonl');
      const l1 = new CostLedger({ ledgerFile, dailyBudget: 50, hourlyBudget: 10 });
      l1.record('nemotron', 1000, 500, 0.005);
      l1.record('glm', 800, 200, 0.003);
      l1.flush();
      const l2 = new CostLedger({ ledgerFile, dailyBudget: 50, hourlyBudget: 10 });
      const status = l2.getBudgetStatus();
      assert(status.daily.used >= 0.008, 'Daily spend must be replayed from ledger: ' + status.daily.used);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test('C8b) SIGKILL with unflushed buffer LOSES data (documented limitation)', async () => {
    const { spawn } = await import('child_process');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-sigkill-'));
    try {
      const ledgerFile = path.join(tmpDir, 'cost.jsonl');
      const childScript = path.join(tmpDir, 'child.mjs');
      const persistencePath = path.resolve('.ai/runtime/model-router/persistence.js');
      fs.writeFileSync(childScript, `import { CostLedger } from ${JSON.stringify(persistencePath)};\nconst l = new CostLedger({ ledgerFile: ${JSON.stringify(ledgerFile)}, dailyBudget: 50, hourlyBudget: 10 });\nl.record('nemotron', 1000, 500, 0.005);\nl.record('glm', 800, 200, 0.003);\nl.record('qwen-7b', 500, 100, 0.002);\nsetTimeout(() => {}, 60000);\n`);
      const child = spawn('node', [childScript], { cwd: process.cwd(), stdio: 'ignore' });
      const exitPromise = new Promise((resolve) => child.on('exit', resolve));
      await new Promise((resolve) => child.on('spawn', resolve));
      await new Promise((r) => setTimeout(r, 500));
      try { process.kill(child.pid, 'SIGKILL'); } catch (e) {}
      await exitPromise;
      const content = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8') : '';
      assert(content === '', 'Unflushed CostLedger buffer MUST be LOST on SIGKILL (documented limitation): got ' + content.length + ' bytes');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test('C5) AUTH_ERROR is not retried (single call, not retryConfig.maxRetries+1)', async () => {
    let calls = 0;
    const client = {
      async call() {
        calls++;
        const err = new Error('Invalid API key');
        err.code = 'AUTH_ERROR';
        throw err;
      }
    };
    const router = new ModelRouter({ enableRetry: true, persistenceEnabled: false });
    router.registerClient('nemotron', client);
    router.registerClient('glm', {
      async call() {
        const err = new Error('Invalid API key');
        err.code = 'AUTH_ERROR';
        throw err;
      }
    });
    try {
      await router.call({
        taskType: 'reasoning',
        messages: [{ role: 'user', content: 'test' }],
        options: { timeout: 1000 },
        maxFallbackAttempts: 0,
      });
    } catch (e) {
      assert(e.code === 'AUTH_ERROR', 'Should escalate AUTH_ERROR');
    }
    assertEqual(calls, 1, 'AUTH_ERROR must NOT be retried on same model');
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests();