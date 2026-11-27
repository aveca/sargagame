'use strict';
/**
 * Factory V3 — Exécution de processus robuste.
 *
 * Correction d'un bug réel observé le 2026-11-14 (job job-1794676119497-1f224f) :
 * avec `stdio: 'pipe'`, un petit-fils (opencode.exe) hérite des handles stdout
 * du powershell parent. Même après la mort du parent, le pipe reste ouvert →
 * l'événement 'close' de Node ne se déclenche JAMAIS → le runner reste bloqué
 * indéfiniment (constaté : 41 min de hang, runner PID 23100 CPU 0,1 s).
 *
 * Correctifs appliqués :
 *  1) stdout/stderr redirigés vers des FICHIERS (aucun handle hérité) ;
 *  2) le timeout résout la promesse IMMÉDIATEMENT (on n'attend pas 'close') ;
 *  3) kill de l'arbre Windows (`taskkill /PID <pid> /T /F`) systématique ;
 *  4) timeout d'INACTIVITÉ (aucune sortie) distinct du timeout total ;
 *  5) résolution unique garantie (guard) — pas de double résolution.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

/**
 * Résout l'exécutable OpenCode de façon fiable sous Windows.
 *
 * BUG RÉEL détecté par le test réel (2026-11-14) : `spawn('opencode', ...)`
 * depuis Node ne peut PAS exécuter le shim PowerShell/CMD installé par npm
 * (`opencode.ps1` / `opencode.cmd`) → l'inventaire revenait vide (0 modèle) et
 * aucune bascule n'était possible. On résout donc le VRAI binaire `opencode.exe`.
 *
 * Ordre : OPENCODE_BIN → installation npm globale connue → `where.exe` →
 * lecture du shim .cmd pour retrouver la cible .exe → nom simple.
 */
function resolveOpencodeBin(configured) {
  const name = configured || 'opencode';
  if (process.env.OPENCODE_BIN && (!configured || configured === 'opencode')) return process.env.OPENCODE_BIN;
  if (path.isAbsolute(name)) return name;
  if (process.platform !== 'win32') return name;

  const roots = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : null,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'npm') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'npm') : null,
  ].filter(Boolean);
  for (const root of roots) {
    const exe = path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
    if (fs.existsSync(exe)) return exe;
  }

  try {
    const out = execFileSync('where.exe', [name], { encoding: 'utf8' })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const p of out) if (/\.exe$/i.test(p) && fs.existsSync(p)) return p;
    for (const p of out) {
      if (!/\.(cmd|bat)$/i.test(p) || !fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, 'utf8');
      const m = content.match(/["']?([^\s"']*opencode[^"'\r\n]*\.exe)["']?/i);
      if (m) {
        const target = path.resolve(path.dirname(p), m[1]);
        if (fs.existsSync(target)) return target;
      }
    }
  } catch (_) { /* where indisponible */ }

  return name;
}

function killTree(pid) {
  if (!pid) return false;
  if (process.platform !== 'win32') {
    // Sous POSIX, le runner lance chaque commande dans son propre groupe.
    // kill(-pid) terminates le groupe (shell + petits-fils) sans laisser de
    // processus orphelin après un timeout.
    try {
      process.kill(-pid, 'SIGKILL');
      return true;
    } catch (_) {
      try {
        process.kill(pid, 'SIGKILL');
        return true;
      } catch (_) {
        return false;
      }
    }
  }
  try {
    const killed = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 20000 });
    return !!(killed && killed.status === 0);
  } catch (_) {
    return false;
  }
}

function tmpOutFile(prefix) {
  const dir = path.join(os.tmpdir(), 'factory-v3-exec');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.log`);
}

/**
 * Exécute un binaire et résout TOUJOURS (timeout compris).
 * @returns {Promise<{exitCode:number|null,timedOut:boolean,idleTimedOut:boolean,stdout:string,stderr:string,stdoutFile:string,stderrFile:string,durationMs:number,pid:number}>}
 */
function runProcess(opts = {}) {
  const file = opts.file;
  const args = opts.args || [];
  const cwd = opts.cwd || process.cwd();
  const timeoutMs = opts.timeoutMs || 60000;
  const idleTimeoutMs = opts.idleTimeoutMs || 0;
  const stdoutFile = opts.stdoutFile || tmpOutFile('out');
  const stderrFile = opts.stderrFile || tmpOutFile('err');
  const env = Object.assign({}, process.env, opts.env || {});

  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    let timedOut = false;
    let idleTimedOut = false;
    let child = null;

    const outFd = fs.openSync(stdoutFile, 'w');
    const errFd = fs.openSync(stderrFile, 'w');

    const readAll = (file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch (_) {
        return '';
      }
    };

    const settle = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      clearInterval(idleTimer);
      try { fs.closeSync(outFd); } catch (_) {}
      try { fs.closeSync(errFd); } catch (_) {}
      resolve({
        exitCode,
        timedOut,
        idleTimedOut,
        stdout: readAll(stdoutFile),
        stderr: readAll(stderrFile),
        stdoutFile,
        stderrFile,
        durationMs: Date.now() - start,
        pid: child ? child.pid : null,
      });
    };

    try {
      child = spawn(file, args, {
        cwd,
        env,
        windowsHide: true,
        // POSIX : groupe de processus dédié pour tuer toute la descendance.
        detached: process.platform !== 'win32',
        stdio: ['ignore', outFd, errFd], // FICHIERS : aucun handle hérité par les petits-fils
      });
    } catch (e) {
      try { fs.closeSync(outFd); } catch (_) {}
      try { fs.closeSync(errFd); } catch (_) {}
      resolve({
        exitCode: -1,
        timedOut: false,
        idleTimedOut: false,
        stdout: '',
        stderr: 'SPAWN_ERROR: ' + (e && e.message ? e.message : String(e)),
        stdoutFile,
        stderrFile,
        durationMs: Date.now() - start,
        pid: null,
      });
      return;
    }

    child.on('error', (e) => {
      try { fs.appendFileSync(stderrFile, '\nSPAWN_ERROR: ' + (e && e.message ? e.message : String(e))); } catch (_) {}
      settle(-1);
    });

    child.on('close', (code) => settle(code == null ? null : code));

    // Timeout total : kill de l'arbre puis résolution IMMÉDIATE (ne pas attendre 'close').
    const totalTimer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      settle(null);
    }, timeoutMs);

    // Timeout d'inactivité : le processus vit mais ne produit plus rien (hang fournisseur).
    let lastSize = 0;
    let lastChange = Date.now();
    const idleTimer = setInterval(() => {
      let size = 0;
      try { size = fs.statSync(stdoutFile).size + fs.statSync(stderrFile).size; } catch (_) {}
      if (size !== lastSize) {
        lastSize = size;
        lastChange = Date.now();
      } else if (idleTimeoutMs > 0 && Date.now() - lastChange > idleTimeoutMs) {
        idleTimedOut = true;
        killTree(child.pid);
        settle(null);
      }
    }, 2000);
  });
}

/** Exécute une commande shell — utilisé par les gates. */
function runShell(cmd, opts = {}) {
  // La production Factory est Windows (tâche planifiée), mais la CI Linux
  // doit exécuter les mêmes gates. On conserve PowerShell sous Windows et on
  // utilise un shell POSIX ailleurs.
  const windows = process.platform === 'win32';
  return runProcess({
    file: windows ? 'powershell.exe' : 'sh',
    args: windows
      ? ['-NoProfile', '-NonInteractive', '-Command', cmd]
      : ['-c', cmd],
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    idleTimeoutMs: opts.idleTimeoutMs,
    env: opts.env,
  });
}

/** Exécute une commande et renvoie stdout (utilitaire CLI). */
async function capture(file, args, opts = {}) {
  const r = await runProcess({ file, args, cwd: opts.cwd, timeoutMs: opts.timeoutMs || 60000 });
  return { ...r, text: r.stdout };
}

module.exports = { runProcess, runShell, capture, killTree, resolveOpencodeBin };
