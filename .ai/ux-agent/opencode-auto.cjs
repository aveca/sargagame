#!/usr/bin/env node
/**
 * opencode-auto.cjs — local-first OpenCode/Ollama adapter with cloud fallback.
 *
 * The Autopilot worker runs on the founder's PC. It prefers local Ollama models
 * for privacy and zero cost. When the selected local model lacks native tool_calls
 * support (e.g. qwen2.5-coder:7b) AND a cloud API key is configured, it falls
 * back to a cloud model that supports tool_calls — without downloading anything.
 *
 * Resilience features:
 *  - Pre-flight check: probe cloud provider reachability before launching OpenCode
 *  - Retry with exponential backoff: up to MAX_RETRIES attempts on transient failures
 *  - Circuit breaker: if cloud fails CIRCUIT_THRESHOLD times consecutively, skip cloud
 *    and fall back to local model with an explicit warning (tool_calls unavailable)
 *  - Fallback chain: try configured cloud models in order until one works
 *  - Graceful degradation: local-only mode remains available when no cloud key exists
 *
 * OpenCode remains the execution engine.
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // .ai/ux-agent -> repo root
const args = process.argv.slice(2);
if (args[0] !== 'run' || !args[1]) {
  console.error('Usage: node .ai/ux-agent/opencode-auto.cjs run "<prompt>" [--vision] [--task-type coding|vision|fast|strong] [--cloud] [--no-retry]');
  process.exit(2);
}

const prompt = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
const isVision = args.includes('--vision');
const forceCloud = args.includes('--cloud');
const noRetry = args.includes('--no-retry');
const taskType = (() => {
  const idx = args.indexOf('--task-type');
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : (isVision ? 'vision' : 'coding');
})();

const ollamaBase = String(process.env.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const model = String(process.env.SARGA_OLLAMA_MODEL || '').trim();

// Resilience constants
const MAX_RETRIES = noRetry ? 0 : 3;
const RETRY_BASE_DELAY_MS = 2000;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60000; // 1 minute before trying cloud again
const CIRCUIT_STATE_FILE = path.join(os.tmpdir(), 'sarga-opencode-circuit.json');

// Cloud models known to support native tool_calls (no local download required)
// Ordered by preference: first matching a configured provider key is used.
const CLOUD_MODELS = [
  { id: 'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b', key: 'NVIDIA_API_KEY' },
  { id: 'nvidia/nvidia/nemotron-3.5-lightning-30b-a3b', key: 'NVIDIA_API_KEY' },
  { id: 'openrouter-free/nvidia/nemotron-3.5-lightning:free', key: 'OPENROUTER_API_KEY' },
  { id: 'openrouter-free/nvidia/nemotron-3.5-super-vl:free', key: 'OPENROUTER_API_KEY' }
];

const LOCAL_MODELS_WITHOUT_TOOL_CALLS = [
  'qwen2.5-coder:7b'
];

// ── Circuit breaker state ───────────────────────────────────────────

function readCircuitState() {
  try {
    const raw = fs.readFileSync(CIRCUIT_STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { failures: 0, lastFailureAt: 0, blockedUntil: 0 };
  }
}

function writeCircuitState(state) {
  try {
    fs.writeFileSync(CIRCUIT_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (_) {
    // Best-effort; circuit state is non-critical
  }
}

function recordCloudFailure() {
  const state = readCircuitState();
  state.failures += 1;
  state.lastFailureAt = Date.now();
  if (state.failures >= CIRCUIT_THRESHOLD) {
    state.blockedUntil = Date.now() + CIRCUIT_RESET_MS;
    console.error('[local-agent] Circuit breaker OPEN: cloud skipped for', CIRCUIT_RESET_MS / 1000, 's');
  }
  writeCircuitState(state);
}

function recordCloudSuccess() {
  const state = readCircuitState();
  state.failures = 0;
  state.blockedUntil = 0;
  writeCircuitState(state);
}

function isCircuitOpen() {
  const state = readCircuitState();
  if (state.blockedUntil === 0) return false;
  if (Date.now() > state.blockedUntil) {
    // Reset circuit after timeout
    state.failures = 0;
    state.blockedUntil = 0;
    writeCircuitState(state);
    return false;
  }
  return true;
}

// ── Cloud provider selection ─────────────────────────────────────────

function selectCloudModel() {
  // Prefer NVIDIA if its key is configured
  if (process.env.NVIDIA_API_KEY) {
    const m = CLOUD_MODELS.find(cm => cm.key === 'NVIDIA_API_KEY');
    if (m) return m;
  }
  if (process.env.OPENROUTER_API_KEY) {
    const m = CLOUD_MODELS.find(cm => cm.key === 'OPENROUTER_API_KEY');
    if (m) return m;
  }
  // Fallback: any model whose key is present
  for (const cm of CLOUD_MODELS) {
    if (process.env[cm.key]) return cm;
  }
  return null;
}

// ── Pre-flight probe: is the cloud provider reachable? ───────────────

async function probeCloudReachable(modelId) {
  // Quick DNS/TCP check without sending secrets.
  // We resolve the provider hostname; OpenCode handles auth.
  const hostname = modelId.startsWith('openrouter-') ? 'openrouter.ai' : 'build.nvidia.com';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('probe timeout')), 5000);
      const req = require('http').request(
        { hostname, port: 443, method: 'HEAD', path: '/', timeout: 5000 },
        () => { clearTimeout(timeout); resolve(true); }
      );
      req.on('error', (e) => { clearTimeout(timeout); reject(e); });
      req.on('timeout', () => { clearTimeout(timeout); req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
    return true;
  } catch (e) {
    console.error('[local-agent] Cloud probe failed for', modelId, ':', e.message);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  // 1. Select model via local router first (to know what local model would be used)
  const { routeModel } = require(path.join(ROOT, 'scripts', 'autopilot', 'local-model-router.cjs'));
  const routeResult = await routeModel(taskType);

  const localSelected = routeResult.ok ? routeResult.model : null;

  // Decide local vs cloud
  const localLacksToolCalls = Boolean(localSelected && LOCAL_MODELS_WITHOUT_TOOL_CALLS.includes(localSelected));
  const hasCloudKey = Boolean(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );

  let useCloud = false;
  let selectedCloudModel = null;

  if (forceCloud) {
    if (!hasCloudKey) {
      console.error('[local-agent] --cloud requested but no cloud API key found in environment.');
      process.exit(3);
    }
    useCloud = true;
  } else if (localLacksToolCalls && hasCloudKey) {
    useCloud = true;
  } else if (!routeResult.ok) {
    console.error('[local-agent] No local model available for task type:', taskType);
    console.error('[local-agent] Hardware:', JSON.stringify(routeResult.hardware, null, 2));
    console.error('[local-agent] Available models:', routeResult.availableModels);
    process.exit(4);
  } else {
    console.log('[local-agent] Local model selected:', localSelected, '(tier:', routeResult.tier + ')');
    console.log('[local-agent] Hardware:', JSON.stringify(routeResult.hardware));
  }

  // 2. If cloud is chosen, resolve which model and check circuit breaker / reachability
  if (useCloud) {
    selectedCloudModel = selectCloudModel();
    if (!selectedCloudModel) {
      console.error('[local-agent] Cloud fallback requested but no configured provider key matched a known cloud model.');
      console.error('[local-agent] Configured keys:', Object.keys(process.env).filter(k => /API_KEY|TOKEN/i.test(k)).join(', '));
      process.exit(3);
    }

    if (isCircuitOpen()) {
      console.error('[local-agent] Circuit breaker OPEN — skipping cloud, falling back to local model:', localSelected);
      console.error('[local-agent] WARNING: local model', localSelected, 'does NOT support native tool_calls.');
      useCloud = false;
    } else {
      // Pre-flight probe is advisory only: OpenCode handles the real connection.
      // A probe failure does NOT block cloud usage — it just warns.
      const reachable = await probeCloudReachable(selectedCloudModel.id);
      if (!reachable) {
        console.error('[local-agent] Cloud probe warning: provider may be unreachable, but attempting anyway.');
      }
      console.log('[local-agent] Local model', localSelected, 'lacks native tool_calls → falling back to cloud model:', selectedCloudModel.id);
    }
  }

  // 3. Find OpenCode CLI
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const candidates = process.platform === 'win32'
    ? [path.join(appData, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'), 'opencode.cmd', 'opencode.exe', 'opencode']
    : ['opencode'];
  let command = null;
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { cwd: ROOT, stdio: 'ignore', timeout: 10000 });
      command = c;
      break;
    } catch (_) {}
  }
  if (!command) {
    console.error('[local-agent] OpenCode CLI not found.');
    process.exit(7);
  }

  // 4. Prepare environment
  const env = { ...process.env };
  if (useCloud) {
    // Keep cloud keys so OpenCode can authenticate with the provider
    console.log('[local-agent] Cloud mode: provider keys preserved for authentication.');
  } else {
    // Local-only: strip cloud keys to enforce Ollama-only execution
    delete env.OPENAI_API_KEY;
    delete env.ANTHROPIC_API_KEY;
    delete env.GOOGLE_API_KEY;
    delete env.NVIDIA_API_KEY;
    delete env.COHERE_API_KEY;
    delete env.MISTRAL_API_KEY;
    env.SARGA_LOCAL_ONLY = '1';
  }
  env.OLLAMA_HOST = ollamaBase;

  // 5. Launch OpenCode with retries
  const opencodeArgs = useCloud
    ? ['run', '--model', selectedCloudModel.id, '--auto', prompt]
    : ['run', '--model', 'ollama/' + localSelected, '--auto', prompt];

  console.log('[local-agent]', useCloud ? 'Cloud model' : 'Ollama', 'OK · model=' + (useCloud ? selectedCloudModel.id : localSelected));
  console.log('[local-agent] OpenCode worker starting…');
  console.log('[local-agent] Task type:', taskType, isVision ? '(vision)' : '');

  let lastError = null;
  const maxAttempts = useCloud ? MAX_RETRIES + 1 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 2);
      console.log(`[local-agent] Retry ${attempt}/${maxAttempts} in ${delayMs}ms…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const result = await launchOpenCode(command, opencodeArgs, env, cwd);

    if (result.ok) {
      recordCloudSuccess();
      process.exit(result.code);
    }

    lastError = result.error;
    console.error(`[local-agent] Attempt ${attempt}/${maxAttempts} failed:`, result.error);

    if (useCloud && attempt < maxAttempts) {
      recordCloudFailure();
      // Before retrying, re-probe; if still unreachable, stop retrying
      const stillReachable = await probeCloudReachable(selectedCloudModel.id);
      if (!stillReachable) {
        console.error('[local-agent] Cloud still unreachable — stopping retries.');
        break;
      }
    }
  }

  // All attempts exhausted
  if (useCloud) {
    console.error('[local-agent] All cloud attempts failed. Falling back to local model:', localSelected);
    console.error('[local-agent] WARNING: local model', localSelected, 'does NOT support native tool_calls.');
    // Retry once with local model as final fallback
    const localArgs = ['run', '--model', 'ollama/' + localSelected, '--auto', prompt];
    const localResult = await launchOpenCode(command, localArgs, { ...env, OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, GOOGLE_API_KEY: undefined, NVIDIA_API_KEY: undefined, COHERE_API_KEY: undefined, MISTRAL_API_KEY: undefined, SARGA_LOCAL_ONLY: '1', OLLAMA_HOST: ollamaBase }, cwd);
    if (localResult.ok) {
      process.exit(localResult.code);
    }
    console.error('[local-agent] Local fallback also failed:', localResult.error);
    process.exit(localResult.code == null ? 1 : localResult.code);
  }

  console.error('[local-agent] OpenCode failed:', lastError);
  process.exit(lastError && lastError.code ? lastError.code : 8);
}

const cwd = process.cwd();

function launchOpenCode(command, args, env, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutMs = 120000;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch (_) {}
      resolve({ ok: false, error: `OpenCode timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout?.on('data', (d) => { stdout += d.toString(); process.stdout.write(d); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); process.stderr.write(d); });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `OpenCode spawn failed: ${e.message}` });
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (signal) {
        resolve({ ok: false, error: `OpenCode terminated by ${signal}` });
        return;
      }
      if (timedOut) return; // already resolved by timeout
      if (code === 0) {
        resolve({ ok: true, code: 0 });
      } else {
        resolve({ ok: false, error: `OpenCode exited with code ${code}:\n${stderr.slice(-500)}` });
      }
    });
  });
}

main().catch((e) => {
  console.error('[local-agent] fatal: ' + e.stack);
  process.exit(10);
});
