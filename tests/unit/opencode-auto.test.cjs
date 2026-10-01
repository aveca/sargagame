// Test for opencode-auto.cjs functions
process.env.TEST_MODE = '1';
const {
  loadModelMetrics,
  classifyTaskType,
  calculateBackendScore,
  sortBackendsByTaskType
} = require('../../.ai/ux-agent/opencode-auto.cjs');
const assert = require('assert');
const { test } = require('node:test');

test('loadModelMetrics returns an array', () => {
  const metrics = loadModelMetrics();
  assert(Array.isArray(metrics));
});

test('classifyTaskType classifies coding tasks', () => {
  assert.strictEqual(classifyTaskType(['write', 'a', 'function']), 'coding');
  assert.strictEqual(classifyTaskType(['create', 'a', 'class']), 'coding');
  assert.strictEqual(classifyTaskType(['implement', 'feature']), 'coding');
});

test('classifyTaskType classifies debugging tasks', () => {
  assert.strictEqual(classifyTaskType(['fix', 'a', 'bug']), 'debugging');
  assert.strictEqual(classifyTaskType(['debug', 'issue']), 'debugging');
  assert.strictEqual(classifyTaskType(['error', 'problem']), 'debugging');
});

test('classifyTaskType classifies analysis tasks', () => {
  assert.strictEqual(classifyTaskType(['analyze', 'the', 'code']), 'analysis');
  assert.strictEqual(classifyTaskType(['review', 'the', 'patch']), 'analysis');
  assert.strictEqual(classifyTaskType(['check', 'for', 'errors']), 'analysis');
});

test('classifyTaskType returns etc for unknown tasks', () => {
  assert.strictEqual(classifyTaskType(['unknown', 'task']), 'etc');
  assert.strictEqual(classifyTaskType([]), 'etc');
});

test('calculateBackendScore returns neutral score when no metrics', () => {
  const score = calculateBackendScore('kimi', 'coding', []);
  assert.strictEqual(score, 0.5);
});

test('calculateBackendScore computes score based on success rate and latency', () => {
  const metrics = [
    { backendId: 'kimi', taskType: 'coding', successRate: 0.8, latencyMs: 200 },
    { backendId: 'kimi', taskType: 'coding', successRate: 0.9, latencyMs: 100 }
  ];
  const score = calculateBackendScore('kimi', 'coding', metrics);
  // avgSuccessRate = (0.8+0.9)/2 = 0.85
  // avgLatency = (200+100)/2 = 150
  // normalizedLatency = Math.max(0, Math.min(1, 1 - (150-1000)/4000)) = 1 - (-850)/4000 = 1 + 0.2125 = 1.2125 -> clamped to 1
  // score = 0.7*0.85 + 0.3*1 = 0.595 + 0.3 = 0.895
  assert.closeTo(score, 0.895, 0.001);
});

test('sortBackendsByTaskType sorts backends by score descending', () => {
  const backends = [
    { id: 'kimi', model: 'nvidia/moonshotai/kimi-k3', kind: 'nvidia' },
    { id: 'deepseek', model: 'nvidia/deepseek-ai/deepseek-v4-flash-0731', kind: 'nvidia' },
    { id: 'nemotron', model: 'nvidia/nvidia/nemotron-3-super-120b-a12b', kind: 'nvidia' },
    { id: 'ollama', model: 'ollama/qwen2.5-coder:14b', kind: 'ollama' }
  ];
  const metrics = [
    { backendId: 'kimi', taskType: 'coding', successRate: 0.9, latencyMs: 100 },
    { backendId: 'deepseek', taskType: 'coding', successRate: 0.8, latencyMs: 200 },
    { backendId: 'nemotron', taskType: 'coding', successRate: 0.7, latencyMs: 300 },
    { backendId: 'ollama', taskType: 'coding', successRate: 0.6, latencyMs: 400 }
  ];
  const sorted = sortBackendsByTaskType(backends, 'coding', metrics);
  assert.strictEqual(sorted[0].id, 'kimi');
  assert.strictEqual(sorted[1].id, 'deepseek');
  assert.strictEqual(sorted[2].id, 'nemotron');
  assert.strictEqual(sorted[3].id, 'ollama');
});

console.log('All tests passed');