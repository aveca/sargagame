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
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // .ai/ux-agent -> repo root
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

async function main() {
  // Self-healing : ollama-ensure.cjs sonde, démarre le démon UNE fois si
  // down, attend (budget SARGA_OLLAMA_WAIT_MS) et sélectionne le modèle
  // prioritaire (SARGA_OLLAMA_MODEL > qwen3-coder:30b > qwen2.5-coder:32b >
  // *-coder > premier). Pas d'échec instantané : un 30B peut être lent au
  // premier chargement. Échec honnête (même codes) si toujours down après
  // l'attente — l'appelant (implement.cjs) marque la tentative ratée et la
  // factory continue sur la tâche suivante, jamais de faux succès.
  const ensurePath = path.join(ROOT, 'scripts', 'autopilot', 'ollama-ensure.cjs');
  const waitBudget = Number(process.env.SARGA_OLLAMA_WAIT_MS || 120000) || 120000;
  let selected = '';
  try {
    const out = execFileSync(process.execPath, [ensurePath], {
      cwd: ROOT, encoding: 'utf8', timeout: waitBudget + 30000,
    });
    const m = String(out).match(/^OLLAMA_OK model=(\S+)/m);
    if (!m) throw new Error('ensure returned no OLLAMA_OK line');
    selected = m[1];
  } catch (e) {
    console.error('[local-agent] Ollama unavailable after wait: ' + (e.message || e));
    process.exit(typeof e.status === 'number' && e.status ? e.status : 4);
  }

  // Windows: pas de opencode.exe sur le PATH (seulement des shims .cmd/.ps1,
  // inexécutables sans shell). Résoudre le vrai binaire npm en premier.
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
    console.error('[local-agent] OpenCode CLI not found. Install/configure OpenCode locally; no cloud fallback is allowed.');
    process.exit(7);
  }

  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  env.SARGA_LOCAL_ONLY = '1';
  env.OLLAMA_HOST = ollamaBase;

  const opencodeArgs = ['run'];
  // Modèle imposé = celui prouvé par ollama-ensure (priorité mission :
  // qwen3-coder:30b d'abord). Déterministe sur toutes les machines.
  opencodeArgs.push('--model', 'ollama/' + selected);
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
