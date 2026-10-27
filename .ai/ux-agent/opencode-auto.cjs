#!/usr/bin/env node
/**
 * opencode-auto.cjs — OpenCode adapter with local-first, explicit cloud opt-in.
 *
 * Local Ollama remains the default and never inherits cloud API credentials.
 * NVIDIA cloud execution requires BOTH --cloud and SARGA_CLOUD_ENABLED=1,
 * plus an explicit SARGA_CLOUD_MODEL (or --model) and NVIDIA_API_KEY.
 * Cloud calls are never selected automatically by this adapter.
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TASK_TYPES = new Set(['coding', 'vision', 'fast', 'strong', 'review']);
const CLOUD_KEY_NAMES = [
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'COHERE_API_KEY',
  'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY',
  'TOGETHER_API_KEY', 'FIREWORKS_API_KEY', 'CEREBRAS_API_KEY', 'XAI_API_KEY',
  'PERPLEXITY_API_KEY', 'HF_TOKEN'
];

function cliError(message, exitCode) {
  const error = new Error(message);
  error.exitCode = exitCode || 2;
  return error;
}

function parseCliArgs(argv) {
  if (!Array.isArray(argv) || argv[0] !== 'run') {
    throw cliError('Usage: node .ai/ux-agent/opencode-auto.cjs run "<prompt>" [--model <provider/model>] [--cloud] [--vision] [--task-type coding|vision|fast|strong|review]', 2);
  }

  let mode = 'local';
  let modeWasSet = false;
  let model = null;
  let taskType = null;
  let isVision = false;
  const promptParts = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cloud' || arg === '--local') {
      const requested = arg === '--cloud' ? 'cloud' : 'local';
      if (modeWasSet && mode !== requested) {
        throw cliError('Use either --cloud or --local, not both.', 2);
      }
      mode = requested;
      modeWasSet = true;
    } else if (arg === '--model') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        throw cliError('--model requires a model ID.', 2);
      }
      model = argv[++i].trim();
    } else if (arg === '--task-type') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        throw cliError('--task-type requires a value.', 2);
      }
      taskType = argv[++i].trim();
      if (!TASK_TYPES.has(taskType)) {
        throw cliError('Unsupported task type: ' + taskType, 2);
      }
    } else if (arg === '--vision') {
      isVision = true;
    } else if (arg.startsWith('--')) {
      throw cliError('Unknown adapter option: ' + arg, 2);
    } else {
      promptParts.push(arg);
    }
  }

  const prompt = promptParts.join(' ').trim();
  if (!prompt) throw cliError('A non-empty prompt is required.', 2);
  return {
    mode,
    model,
    isVision,
    taskType: taskType || (isVision ? 'vision' : 'coding'),
    prompt
  };
}

function resolveExecutionPlan(options, env) {
  const sourceEnv = env || process.env;
  if (options.mode === 'cloud') {
    if (sourceEnv.SARGA_CLOUD_ENABLED !== '1') {
      throw cliError('Cloud execution is disabled. Set SARGA_CLOUD_ENABLED=1 explicitly before using --cloud.', 11);
    }
    if (!sourceEnv.NVIDIA_API_KEY) {
      throw cliError('Cloud execution requested but NVIDIA_API_KEY is not configured.', 12);
    }
    const model = String(options.model || sourceEnv.SARGA_CLOUD_MODEL || '').trim();
    if (!/^nvidia\/[^/\s]+$/.test(model)) {
      throw cliError('Cloud execution is restricted to an NVIDIA model ID such as nvidia/model-name.', 13);
    }
    return { mode: 'cloud', model, taskType: options.taskType };
  }

  const localModel = options.model
    ? String(options.model).replace(/^ollama\//, '').trim()
    : null;
  if (options.model && !localModel) {
    throw cliError('Local --model value is empty.', 2);
  }
  return { mode: 'local', model: localModel, taskType: options.taskType };
}

function buildChildEnv(parentEnv, mode, ollamaBase) {
  const childEnv = { ...(parentEnv || process.env) };
  for (const key of CLOUD_KEY_NAMES) delete childEnv[key];

  if (mode === 'cloud') {
    // The pinned NVIDIA model is the only cloud provider allowed through.
    delete childEnv.SARGA_LOCAL_ONLY;
    childEnv.SARGA_CLOUD_ENABLED = '1';
    childEnv.SARGA_CLOUD_MODEL = childEnv.SARGA_CLOUD_MODEL || '';
    if (!(parentEnv || process.env).NVIDIA_API_KEY) {
      delete childEnv.NVIDIA_API_KEY;
    }
  } else {
    delete childEnv.NVIDIA_API_KEY;
    childEnv.SARGA_LOCAL_ONLY = '1';
    childEnv.OLLAMA_HOST = ollamaBase || String(childEnv.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  }
  return childEnv;
}

async function main(argv, env) {
  const sourceEnv = env || process.env;
  let options;
  let plan;
  try {
    options = parseCliArgs(argv || process.argv.slice(2));
    plan = resolveExecutionPlan(options, sourceEnv);
  } catch (error) {
    console.error('[agent] ' + error.message);
    return error.exitCode || 2;
  }

  let selectedModel = plan.model;
  if (plan.mode === 'local' && !selectedModel) {
    try {
      const { routeModel } = require(path.join(ROOT, 'scripts', 'autopilot', 'local-model-router.cjs'));
      const routeResult = await routeModel(plan.taskType);
      if (!routeResult.ok) {
        console.error('[local-agent] No local model available for task type: ' + plan.taskType);
        console.error('[local-agent] Hardware:', JSON.stringify(routeResult.hardware, null, 2));
        console.error('[local-agent] Available models:', routeResult.availableModels);
        return 4;
      }
      selectedModel = routeResult.model;
      console.log('[local-agent] Local model selected:', selectedModel, '(tier:', routeResult.tier + ')');
      console.log('[local-agent] Hardware:', JSON.stringify(routeResult.hardware));
    } catch (error) {
      console.error('[local-agent] Local model routing failed: ' + error.message);
      return 4;
    }
  }

  if (plan.mode === 'cloud') {
    selectedModel = plan.model;
    console.log('[agent] Explicit NVIDIA cloud mode; model=' + selectedModel + ' (single attempt; no automatic fallback)');
  } else {
    console.log('[local-agent] Local model selected:', selectedModel);
  }

  const appData = sourceEnv.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const candidates = process.platform === 'win32'
    ? [path.join(appData, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'), 'opencode.cmd', 'opencode.exe', 'opencode']
    : ['opencode'];
  let command = null;
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { cwd: process.cwd(), stdio: 'ignore', timeout: 10000, env: sourceEnv, windowsHide: true });
      command = candidate;
      break;
    } catch (_) {}
  }
  if (!command) {
    console.error('[agent] OpenCode CLI not found.');
    return 7;
  }

  const ollamaBase = String(sourceEnv.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const childEnv = buildChildEnv(sourceEnv, plan.mode, ollamaBase);
  const providerModel = plan.mode === 'cloud' ? selectedModel : 'ollama/' + selectedModel;
  const opencodeArgs = ['run', '--model', providerModel, '--auto', options.prompt];

  console.log('[agent] OpenCode starting; mode=' + plan.mode + ', task=' + options.taskType);
  return await new Promise(resolve => {
    const child = spawn(command, opencodeArgs, {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    child.stdout?.on('data', data => process.stdout.write(data));
    child.stderr?.on('data', data => process.stderr.write(data));
    child.on('error', error => {
      console.error('[agent] OpenCode spawn failed: ' + error.message);
      resolve(8);
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        console.error('[agent] OpenCode terminated by ' + signal);
        resolve(9);
      } else {
        resolve(code == null ? 1 : code);
      }
    });
  });
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error('[agent] fatal: ' + (error.stack || error.message));
    process.exitCode = 10;
  });
}

module.exports = { parseCliArgs, resolveExecutionPlan, buildChildEnv, main };
