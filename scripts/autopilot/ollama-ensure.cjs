#!/usr/bin/env node
/**
 * ollama-ensure.cjs — garantit un Ollama local utilisable avant tout appel modèle.
 *
 * - Sonde /api/tags (rapide). Si OK : sélectionne le modèle préféré et sort 0.
 * - Si KO et --start (défaut) : lance `ollama serve` UNE fois (re-sonde d'abord
 *   pour ne jamais dupliquer un serveur), attend jusqu'à --wait-ms, re-sélectionne.
 * - Ne télécharge JAMAIS de modèle, ne supprime JAMAIS de blob, ne tue rien.
 * - Sortie machine : `OLLAMA_OK model=<nom> url=<base>` (stdout). Erreurs : stderr.
 * - Codes : 0 ok · 4 Ollama indisponible après attente (même code que l'adapter,
 *   qui échoue honnêtement et laisse la factory continuer sur la tâche suivante).
 *
 * Usage :
 *   node scripts/autopilot/ollama-ensure.cjs [--wait-ms 120000] [--no-start]
 *   node scripts/autopilot/ollama-ensure.cjs --check   # sonde seule, sans démarrage
 *
 * Env : SARGA_OLLAMA_URL (défaut http://127.0.0.1:11434), SARGA_OLLAMA_MODEL
 *       (priorité exacte), SARGA_OLLAMA_WAIT_MS (budget d'attente).
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
const base = String(process.env.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const wanted = String(process.env.SARGA_OLLAMA_MODEL || '').trim();
const waitMs = Math.max(0, Number(process.env.SARGA_OLLAMA_WAIT_MS || 120000) || 0);
const cliWait = (() => { const i = argv.indexOf('--wait-ms'); return i >= 0 ? Math.max(0, Number(argv[i + 1]) || 0) : null; })();
const BUDGET = cliWait !== null ? cliWait : waitMs;
const NO_START = argv.includes('--no-start') || argv.includes('--check');
const QUIET = argv.includes('--quiet');
const INTERVAL = 5000;

const log = (...a) => { if (!QUIET) console.log(...a); };
const err = (...a) => console.error(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ordre de préférence : sélection explicite > qwen3-coder:30b > qwen2.5-coder:32b
// > tout modèle *-coder > premier modèle listé (jamais de tirage exotique).
const PREFERRED = [wanted, 'qwen3-coder:30b', 'qwen2.5-coder:32b'].filter(Boolean);

function pickModel(models) {
  for (const p of PREFERRED) {
    if (models.includes(p)) return p;
    const stem = p.split(':')[0];
    const hit = models.find((m) => m.split(':')[0] === stem);
    if (hit) return hit;
  }
  const coder = models.find((m) => /coder/i.test(m));
  if (coder) return coder;
  return models[0] || null;
}

async function probe(timeoutMs = 5000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(base + '/api/tags', { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    const models = Array.isArray(j.models) ? j.models.map((m) => m && m.name).filter(Boolean) : [];
    return models;
  } catch (_) {
    return null;
  }
}

function findOllamaExe() {
  if (process.env.SARGA_OLLAMA_BIN && fs.existsSync(process.env.SARGA_OLLAMA_BIN)) {
    return process.env.SARGA_OLLAMA_BIN;
  }
  const cands = process.platform === 'win32'
    ? [
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
        'ollama.exe',
        'ollama',
      ]
    : ['/usr/local/bin/ollama', '/usr/bin/ollama', 'ollama'];
  for (const c of cands) {
    try {
      if (path.isAbsolute(c)) { if (fs.existsSync(c)) return c; continue; }
      execFileSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio: 'ignore', windowsHide: true });
      return c;
    } catch (_) {}
  }
  return null;
}

async function main() {
  // 1. Sonde immédiate (cas nominal : serveur déjà up).
  let models = await probe();
  if (models && models.length) {
    const sel = pickModel(models);
    if (!sel) { err('[ollama-ensure] reachable but no usable model.'); process.exit(5); }
    log(`OLLAMA_OK model=${sel} url=${base}`);
    process.exit(0);
  }

  if (NO_START) {
    // Même sans démarrage : attendre le budget (un démon peut être en cours
    // de lancement par ailleurs) au lieu d'échouer instantanément.
    const start = Date.now();
    for (;;) {
      await sleep(INTERVAL);
      models = await probe();
      if (models && models.length) {
        const sel = pickModel(models);
        if (!sel) { err('[ollama-ensure] reachable but no usable model.'); process.exit(5); }
        log(`OLLAMA_OK model=${sel} url=${base} waited_ms=${Date.now() - start}`);
        process.exit(0);
      }
      if (Date.now() - start >= BUDGET) break;
    }
    err(`[ollama-ensure] Ollama unreachable at ${base} after ${BUDGET}ms (--no-start: not launching).`);
    process.exit(4);
  }

  // 2. Démarrage unique : re-sonder juste avant (anti-doublon en cas de
  //    démarrage concurrent), puis lancer détaché. Un 2e `ollama serve`
  //    sortirait de toute façon seul sur "address already in use".
  models = await probe(2000);
  if (!models) {
    const exe = findOllamaExe();
    if (!exe) { err('[ollama-ensure] ollama executable not found; install Ollama locally.'); process.exit(7); }
    try {
      const child = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      log('[ollama-ensure] launched `ollama serve` (pid ' + child.pid + '), waiting…');
    } catch (e) {
      err('[ollama-ensure] cannot launch ollama serve: ' + e.message);
      process.exit(7);
    }
  } else {
    log('[ollama-ensure] server appeared concurrently, no launch needed.');
  }

  // 3. Attente bornée (pas d'échec immédiat : le modèle 30B peut être lent
  //    au premier chargement — la factory attend au lieu d'abandonner).
  const start = Date.now();
  for (;;) {
    await sleep(INTERVAL);
    models = await probe();
    if (models && models.length) {
      const sel = pickModel(models);
      if (!sel) { err('[ollama-ensure] reachable but no usable model.'); process.exit(5); }
      log(`OLLAMA_OK model=${sel} url=${base} waited_ms=${Date.now() - start}`);
      process.exit(0);
    }
    if (Date.now() - start >= BUDGET) {
      err(`[ollama-ensure] Ollama still unreachable at ${base} after ${BUDGET}ms — honest failure, factory continues with next task.`);
      process.exit(4);
    }
  }
}

main().catch((e) => { console.error('[ollama-ensure] fatal: ' + (e && e.stack || e)); process.exit(10); });
