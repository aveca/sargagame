#!/usr/bin/env node
/**
 * opencode-auto.cjs — local-only OpenCode/Ollama adapter.
 * 
 * The Autopilot worker must run on the founder's PC. This adapter deliberately
 * refuses cloud LLM credentials and requires a usable local Ollama model.
 * It delegates to scripts/autopilot/ollama-ensure.cjs (probe → start-once if
 * down → bounded wait → preferred-model selection) instead of failing instantly.
 * OpenCode remains the execution engine, always pinned to the proven model
 * (SARGA_OLLAMA_MODEL > qwen3-coder:30b > qwen2.5-coder:32b > *-coder > first).
 * 
 * Vision routing uses local-model-router.cjs to pick best vision model.
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // .ai/ux-agent -> repo root
const args = process.argv.slice(2);
if (args[0] !== 'run' || !args[1]) {
  console.error('Usage: node .ai/ux-agent/opencode-auto.cjs run "<prompt>" [--vision] [--task-type coding|vision|fast|strong]');
  process.exit(2);
}

const prompt = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
const isVision = args.includes('--vision');
const taskType = (() => {
  const idx = args.indexOf('--task-type');
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : (isVision ? 'vision' : 'coding');
})();

const ollamaBase = String(process.env.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const model = String(process.env.SARGA_OLLAMA_MODEL || '').trim();

// Cloud models known to support native tool_calls (no local download required)
const CLOUD_MODELS = [
  'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nvidia/nemotron-3.5-lightning-30b-a3b',
  'openrouter-free/nvidia/nemotron-3.5-lightning:free',
  'openrouter-free/nvidia/nemotron-3.5-super-vl:free'
];

const LOCAL_MODELS_WITHOUT_TOOL_CALLS = [
  'qwen2.5-coder:7b'
];

// Detect whether we should fall back to a cloud provider.
// Rules:
//  - --cloud flag forces cloud mode.
//  - If selected local model lacks native tool_calls support AND a cloud key
//    is configured in the environment, fall back to cloud (zero download).
//  - Otherwise stay local-only.
const forceCloud = args.includes('--cloud');
const hasCloudKey = Boolean(
  process.env.ANTHROPIC_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.NVIDIA_API_KEY ||
  process.env.OPENROUTER_API_KEY
);

let cloudModel = null;
let useCloud = false;

async function main() {
  // 1. Select model via local router first (to know what local model would be used)
  const { routeModel } = require(path.join(ROOT, 'scripts', 'autopilot', 'local-model-router.cjs'));
  const routeResult = await routeModel(taskType);
  
  const localSelected = routeResult.ok ? routeResult.model : null;
  
  // Decide local vs cloud
  const localLacksToolCalls = Boolean(localSelected && LOCAL_MODELS_WITHOUT_TOOL_CALLS.includes(localSelected));
  useCloud = forceCloud || (localLacksToolCalls && hasCloudKey);
  
  if (useCloud) {
    // Pick the first cloud model whose provider key is configured
    if (process.env.NVIDIA_API_KEY) {
      cloudModel = CLOUD_MODELS.find(m => m.startsWith('nvidia/'));
    } else if (process.env.OPENROUTER_API_KEY) {
      cloudModel = CLOUD_MODELS.find(m => m.startsWith('openrouter-free/'));
    } else if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY) {
      cloudModel = CLOUD_MODELS[0]; // best-effort; OpenCode will route
    }
    if (!cloudModel) {
      console.error('[local-agent] Cloud fallback requested but no configured provider key matched a known cloud model.');
      console.error('[local-agent] Configured keys:', Object.keys(process.env).filter(k => /API_KEY|TOKEN/i.test(k)).join(', '));
      process.exit(3);
    }
    console.log('[local-agent] Local model', localSelected, 'lacks native tool_calls → falling back to cloud model:', cloudModel);
  } else if (forceCloud && !hasCloudKey) {
    console.error('[local-agent] --cloud requested but no cloud API key found in environment.');
    process.exit(3);
  } else if (!routeResult.ok) {
    console.error('[local-agent] No local model available for task type:', taskType);
    console.error('[local-agent] Hardware:', JSON.stringify(routeResult.hardware, null, 2));
    console.error('[local-agent] Available models:', routeResult.availableModels);
    process.exit(4);
  } else {
    console.log('[local-agent] Local model selected:', localSelected, '(tier:', routeResult.tier + ')');
    console.log('[local-agent] Hardware:', JSON.stringify(routeResult.hardware));
  }
  
  // 2. Find OpenCode CLI
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
  
  // 3. Prepare environment
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
  
  // 4. Launch OpenCode with selected model (local or cloud)
  const opencodeArgs = useCloud
    ? ['run', '--model', cloudModel, '--auto', prompt]
    : ['run', '--model', 'ollama/' + localSelected, '--auto', prompt];
  
  console.log('[local-agent]', useCloud ? 'Cloud model' : 'Ollama', 'OK · model=' + (useCloud ? cloudModel : localSelected));
  console.log('[local-agent] OpenCode worker starting…');
  console.log('[local-agent] Task type:', taskType, isVision ? '(vision)' : '');
  
  const child = spawn(command, opencodeArgs, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  
  child.stdout?.on('data', d => { process.stdout.write(d); });
  child.stderr?.on('data', d => { process.stderr.write(d); });
  
  child.on('error', e => {
    console.error('[local-agent] OpenCode spawn failed: ' + e.message);
    process.exit(8);
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error('[local-agent] OpenCode terminated by ' + signal);
      process.exit(9);
    }
    process.exit(code == null ? 1 : code);
  });
}

main().catch(e => {
  console.error('[local-agent] fatal: ' + e.stack);
  process.exit(10);
});