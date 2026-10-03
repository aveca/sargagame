#!/usr/bin/env node
/**
 * opencode-auto.cjs — local-only OpenCode/Ollama adapter.
 *
 * The Autopilot worker must run on the founder's PC. This adapter deliberately
 * refuses cloud LLM credentials and requires a reachable local Ollama daemon.
 * OpenCode remains the execution engine; its local provider/model config may be
 * supplied through the normal OpenCode config or SARGA_OLLAMA_MODEL.
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const args = process.argv.slice(2);
if (args[0] !== 'run' || !args[1]) {
  console.error('Usage: node .ai/ux-agent/opencode-auto.cjs run "<prompt>"');
  process.exit(2);
}

const prompt = args.slice(1).join(' ');
const ollamaBase = String(process.env.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const model = String(process.env.SARGA_OLLAMA_MODEL || '').trim();

if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
  console.error('[local-agent] Refusing cloud LLM credentials: local Ollama mode is required.');
  process.exit(3);
}

function jsonFetch(url) {
  return fetch(url, { signal: AbortSignal.timeout(5000) });
}

async function main() {
  let tags;
  try {
    const r = await jsonFetch(ollamaBase + '/api/tags');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    tags = await r.json();
  } catch (e) {
    console.error('[local-agent] Ollama unavailable at ' + ollamaBase + ': ' + e.message);
    process.exit(4);
  }

  const models = Array.isArray(tags.models) ? tags.models.map(m => m && m.name).filter(Boolean) : [];
  if (!models.length) {
    console.error('[local-agent] Ollama is reachable but has no installed model.');
    process.exit(5);
  }

  const selected = model || models[0];
  if (!models.includes(selected) && !models.some(m => m.split(':')[0] === selected.split(':')[0])) {
    console.error('[local-agent] Requested Ollama model is not installed: ' + selected);
    process.exit(6);
  }

  const isWin = process.platform === 'win32';
  let command = isWin ? 'opencode.exe' : 'opencode';
  try {
    execFileSync(command, ['--version'], { cwd: ROOT, stdio: 'ignore', timeout: 10000 });
  } catch (_) {
    command = isWin ? 'opencode' : 'opencode';
    try {
      execFileSync(command, ['--version'], { cwd: ROOT, stdio: 'ignore', timeout: 10000 });
    } catch (e) {
      console.error('[local-agent] OpenCode CLI not found. Install/configure OpenCode locally; no cloud fallback is allowed.');
      process.exit(7);
    }
  }

  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  env.SARGA_LOCAL_ONLY = '1';
  env.OLLAMA_HOST = ollamaBase;

  const opencodeArgs = ['run'];
  // OpenCode accepts provider/model in --model. Only force it when the founder
  // explicitly selected SARGA_OLLAMA_MODEL; otherwise preserve local OpenCode config.
  if (model) opencodeArgs.push('--model', 'ollama/' + selected);
  opencodeArgs.push(prompt);

  console.log('[local-agent] Ollama OK · model=' + selected);
  console.log('[local-agent] OpenCode local worker starting…');

  const child = spawn(command, opencodeArgs, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    windowsHide: false,
  });

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
