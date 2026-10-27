'use strict';

const assert = require('node:assert/strict');
const adapter = require('../../.ai/ux-agent/opencode-auto.cjs');
const executor = require('./local-agent-executor.cjs');

const MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const TEST_KEY = 'test-only-invalid-key';

function test(name, fn) {
  fn();
  console.log('PASS ' + name);
}

// Local remains the default even when a cloud key exists in the parent environment.
test('local is the default provider and bounded retries remain local-only', () => {
  const provider = executor.resolveAgentProvider({
    NVIDIA_API_KEY: TEST_KEY,
    SARGA_CLOUD_ENABLED: '1',
    SARGA_CLOUD_MODEL: MODEL
  });
  assert.equal(provider.ok, true);
  assert.equal(provider.provider, 'local');
  assert.equal(provider.maxAttempts, 3);
});

// Cloud cannot be selected by environment alone unless the provider flag and explicit enable flag agree.
test('cloud provider requires an explicit provider and enable flag', () => {
  assert.equal(executor.resolveAgentProvider({ SARGA_AUTOPILOT_PROVIDER: 'nvidia' }).ok, false);
  assert.equal(executor.resolveAgentProvider({
    SARGA_AUTOPILOT_PROVIDER: 'nvidia',
    SARGA_CLOUD_ENABLED: '1',
    SARGA_CLOUD_MODEL: MODEL
  }).ok, false);
  const selected = executor.resolveAgentProvider({
    SARGA_AUTOPILOT_PROVIDER: 'nvidia',
    SARGA_CLOUD_ENABLED: '1',
    NVIDIA_API_KEY: TEST_KEY,
    SARGA_CLOUD_MODEL: MODEL
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.provider, 'nvidia');
  assert.equal(selected.model, MODEL);
  assert.equal(selected.maxAttempts, 1);
});

// Cloud is a single attempt to avoid multiplying API requests during outages.
test('cloud provider is single-shot and rejects unsupported providers/models', () => {
  assert.equal(executor.resolveAgentProvider({
    SARGA_AUTOPILOT_PROVIDER: 'nvidia',
    SARGA_CLOUD_ENABLED: '1',
    NVIDIA_API_KEY: TEST_KEY,
    SARGA_CLOUD_MODEL: 'openai/gpt-something'
  }).ok, false);
  assert.equal(executor.resolveAgentProvider({
    SARGA_AUTOPILOT_PROVIDER: 'openrouter',
    SARGA_CLOUD_ENABLED: '1',
    NVIDIA_API_KEY: TEST_KEY,
    SARGA_CLOUD_MODEL: MODEL
  }).ok, false);
});

// Adapter CLI validation is testable without executing OpenCode or contacting any provider.
test('adapter parses an explicit cloud invocation', () => {
  const options = adapter.parseCliArgs([
    'run', '--cloud', '--model', MODEL, 'native tool calling', 'probe'
  ]);
  assert.deepEqual(options, {
    mode: 'cloud',
    model: MODEL,
    isVision: false,
    taskType: 'coding',
    prompt: 'native tool calling probe'
  });
  const plan = adapter.resolveExecutionPlan(options, {
    SARGA_CLOUD_ENABLED: '1',
    NVIDIA_API_KEY: TEST_KEY,
    SARGA_CLOUD_MODEL: MODEL
  });
  assert.equal(plan.mode, 'cloud');
  assert.equal(plan.model, MODEL);
});

// No actual API calls are made by this test.
test('adapter rejects cloud when disabled, missing key, or non-NVIDIA model', () => {
  const options = adapter.parseCliArgs(['run', '--cloud', '--model', MODEL, 'no-network test']);
  assert.throws(() => adapter.resolveExecutionPlan(options, { NVIDIA_API_KEY: TEST_KEY }), /Cloud execution is disabled/);
  assert.throws(() => adapter.resolveExecutionPlan(options, { SARGA_CLOUD_ENABLED: '1' }), /NVIDIA_API_KEY is not configured/);
  assert.throws(() => adapter.resolveExecutionPlan(
    { ...options, model: 'openai/other-model' },
    { SARGA_CLOUD_ENABLED: '1', NVIDIA_API_KEY: TEST_KEY }
  ), /restricted to an NVIDIA model/);
});

// Local mode strips cloud keys before OpenCode starts.
test('local child environment strips cloud credentials and pins local-only mode', () => {
  const env = adapter.buildChildEnv({
    NVIDIA_API_KEY: TEST_KEY,
    OPENAI_API_KEY: TEST_KEY,
    OPENROUTER_API_KEY: TEST_KEY,
    SARGA_LOCAL_ONLY: '',
    SARGA_CLOUD_ENABLED: '1'
  }, 'local', 'http://127.0.0.1:11434');
  assert.equal(env.NVIDIA_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.SARGA_LOCAL_ONLY, '1');
  assert.equal(env.OLLAMA_HOST, 'http://127.0.0.1:11434');
});

// Cloud mode passes exactly the selected NVIDIA credential/model and doesn't carry conflicting local-only mode.
test('cloud child environment preserves only the NVIDIA provider credential among cloud keys', () => {
  const env = adapter.buildChildEnv({
    NVIDIA_API_KEY: TEST_KEY,
    OPENAI_API_KEY: TEST_KEY,
    OPENROUTER_API_KEY: TEST_KEY,
    SARGA_LOCAL_ONLY: '1',
    SARGA_CLOUD_ENABLED: '1',
    SARGA_CLOUD_MODEL: MODEL
  }, 'cloud', 'http://127.0.0.1:11434');
  assert.equal(env.NVIDIA_API_KEY, TEST_KEY);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.SARGA_LOCAL_ONLY, undefined);
  assert.equal(env.SARGA_CLOUD_ENABLED, '1');
  assert.equal(env.SARGA_CLOUD_MODEL, MODEL);
});

// Verify the orchestration layer passes --cloud only in explicit cloud mode.
test('executor constructs cloud args only for selected NVIDIA provider', () => {
  assert.deepEqual(executor.buildOpenCodeArgs('probe', { provider: 'nvidia' }, MODEL), [
    require('node:path').resolve(__dirname, '../../.ai/ux-agent/opencode-auto.cjs'),
    'run', '--cloud', '--model', MODEL, 'probe'
  ]);
  assert.deepEqual(executor.buildOpenCodeArgs('probe', { provider: 'local' }, 'qwen2.5-coder:7b'), [
    require('node:path').resolve(__dirname, '../../.ai/ux-agent/opencode-auto.cjs'),
    'run', '--model', 'ollama/qwen2.5-coder:7b', 'probe'
  ]);
});

test('executor cloud environment retains NVIDIA key but local removes it', () => {
  const cloudEnv = executor.buildAgentChildEnv({
    NVIDIA_API_KEY: TEST_KEY,
    OPENAI_API_KEY: TEST_KEY,
    SARGA_LOCAL_ONLY: '1'
  }, { provider: 'nvidia' }, MODEL);
  assert.equal(cloudEnv.NVIDIA_API_KEY, TEST_KEY);
  assert.equal(cloudEnv.OPENAI_API_KEY, undefined);
  assert.equal(cloudEnv.SARGA_LOCAL_ONLY, undefined);
  assert.equal(cloudEnv.SARGA_CLOUD_ENABLED, '1');
  assert.equal(cloudEnv.SARGA_CLOUD_MODEL, MODEL);

  const localEnv = executor.buildAgentChildEnv({
    NVIDIA_API_KEY: TEST_KEY,
    OPENAI_API_KEY: TEST_KEY
  }, { provider: 'local' }, 'qwen2.5-coder:7b');
  assert.equal(localEnv.NVIDIA_API_KEY, undefined);
  assert.equal(localEnv.OPENAI_API_KEY, undefined);
  assert.equal(localEnv.SARGA_LOCAL_ONLY, '1');
});

console.log('All OpenCode cloud-mode policy tests passed. No provider requests were made.');
