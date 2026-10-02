'use strict';
/**
 * process-runner.cjs — Mécanisme partagé d'exécution de processus (Windows-safe)
 * 
 * Règles :
 * - Pas de shell: true (crée cmd.exe wrapper orphelin sur Windows)
 * - Serveurs long-running = spawn direct, PID capturé, unref() pour non-blocage
 * - Tests = processus bornés avec timeout explicite
 * - Nettoyage garanti : taskkill /T sur Windows, SIGTERM+SIGKILL sur Unix
 * - Retour de contrôle immédiat à l'agent
 * - Aucun DEP0190 warning
 * - Utilise les binaires locaux (node_modules/.bin) directement via node
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = os.platform() === 'win32';

// Resolve local bin scripts (works cross-platform, no .cmd wrapper)
// Returns array [node, script.js] for .js files so they can be executed directly
function resolveLocalBin(binName) {
  // Try node_modules/<pkg>/bin/<entry>.js first (direct node execution, no .cmd)
  const pkgBinJs = path.join(process.cwd(), 'node_modules', binName, 'bin', binName + '.js');
  if (fs.existsSync(pkgBinJs)) {
    // Return array for direct node execution - works on all platforms
    return [process.execPath, pkgBinJs];
  }
  
  // Try local node_modules/.bin (may be .cmd on Windows)
  const localBin = path.join(process.cwd(), 'node_modules', '.bin', binName + (IS_WIN ? '.cmd' : ''));
  if (fs.existsSync(localBin)) return localBin;
  
  // Fallback to global (may be .cmd on Windows)
  return binName;
}

// For vite preview, use local vite binary directly
const VITE_BIN = resolveLocalBin('vite');
// For npm, try global npm-cli.js
const GLOBAL_NPM_CLI = path.join(process.execPath.replace('node.exe', ''), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const NPM_CMD = fs.existsSync(GLOBAL_NPM_CLI) ? [process.execPath, GLOBAL_NPM_CLI] : (IS_WIN ? 'npm.cmd' : 'npm');

const STATE_DIR = path.join(__dirname, '..', 'local-factory', 'state');
fs.mkdirSync(STATE_DIR, { recursive: true });
const PID_FILE = path.join(STATE_DIR, 'preview-pids.json');

function loadPids() {
  try { return JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); } catch { return {}; }
}
function savePids(pids) { fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2)); }

/**
 * Kill a process and its children cross-platform.
 * Windows: taskkill /PID <pid> /T /F
 * Unix:    process.kill(-pid, signal) for process group, fallback to process.kill(pid)
 */
function killProcessTree(pid, signal = 'SIGTERM') {
  if (IS_WIN) {
    const { spawnSync } = require('child_process');
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
    return result.status === 0;
  } else {
    try {
      process.kill(-pid, signal);
      return true;
    } catch {
      try { process.kill(pid, signal); return true; } catch { return false; }
    }
  }
}

function waitForPort(port, host = 'localhost', timeoutMs = 30000, intervalMs = 500) {
  const net = require('net');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); retry(); });
      socket.once('error', () => { socket.destroy(); retry(); });
      socket.connect(port, host);
    }
    function retry() {
      if (Date.now() - start >= timeoutMs) { reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`)); return; }
      setTimeout(attempt, intervalMs);
    }
    attempt();
  });
}

function normalizeCommand(command, args) {
  // If command is array [node, script.js], keep as is
  // If command is string, use as is with args
  if (Array.isArray(command)) {
    return { cmd: command[0], cmdArgs: [...command.slice(1), ...args] };
  }
  return { cmd: command, cmdArgs: args };
}

async function startServer(command, args, options = {}) {
  const {
    cwd = process.cwd(),
    env = { ...process.env },
    port = 4173,
    host = 'localhost',
    readyTimeout = 30000,
    name = 'server'
  } = options;

  const { cmd, cmdArgs } = normalizeCommand(command, args);

  // Spawn WITHOUT shell - direct execution
  // For detached servers on Windows: stdio must be 'ignore' to prevent pipe blocking
  const child = spawn(cmd, cmdArgs, {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',  // Critical: prevents pipe blocking on detached Windows processes
    windowsHide: true
  });

  child.unref(); // Allow parent to exit independently

  const pid = child.pid;
  const pids = loadPids();
  pids[`${name}-${port}`] = { pid, command: cmd, args: cmdArgs.join(' '), startedAt: new Date().toISOString() };
  savePids(pids);

  try {
    await waitForPort(port, host, readyTimeout);
    return { 
      pid, 
      stop: () => stopServer(name, port),
      _child: child
    };
  } catch (e) {
    killProcessTree(pid, 'SIGKILL');
    delete pids[`${name}-${port}`];
    savePids(pids);
    throw e;
  }
}

async function waitForProcessDead(pid, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0);
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      if (e.code === 'ESRCH' || e.code === 'EPERM') return true;
      // EPERM on Windows can mean process is dying but not fully gone
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return false;
}

async function stopServer(name, port) {
  const pids = loadPids();
  const key = `${name}-${port}`;
  const entry = pids[key];
  if (!entry) return { stopped: false, reason: 'not found' };
  
  killProcessTree(entry.pid, 'SIGTERM');
  // Wait for process to actually die
  await waitForProcessDead(entry.pid, 5000);
  // Force kill if still alive
  killProcessTree(entry.pid, 'SIGKILL');
  await waitForProcessDead(entry.pid, 3000);
  
  delete pids[key];
  savePids(pids);
  return { stopped: true, pid: entry.pid };
}

async function stopAllServers() {
  const pids = loadPids();
  const results = [];
  for (const [key, entry] of Object.entries(pids)) {
    killProcessTree(entry.pid, 'SIGTERM');
    await waitForProcessDead(entry.pid, 5000);
    killProcessTree(entry.pid, 'SIGKILL');
    await waitForProcessDead(entry.pid, 3000);
    results.push({ key, pid: entry.pid, stopped: true });
  }
  savePids({});
  return results;
}

async function runBounded(command, args, options = {}) {
  const {
    cwd = process.cwd(),
    env = { ...process.env },
    timeout = 120000
  } = options;

  const { cmd, cmdArgs } = normalizeCommand(command, args);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { 
      cwd, 
      env, 
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    
    let stdout = '', stderr = '';
    child.stdout?.on('data', d => { stdout += d; });
    child.stderr?.on('data', d => { stderr += d; });

    const timer = setTimeout(() => {
      killProcessTree(child.pid, 'SIGKILL');
      reject(new Error(`Command timed out after ${timeout}ms: ${cmd} ${cmdArgs.join(' ')}`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      const result = { code, stdout, stderr };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`Command exited with code ${code}`), result));
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function withPreviewServer(testFn, options = {}) {
  const { 
    port = 4173, 
    host = 'localhost', 
    previewCmd = VITE_BIN,
    previewArgs = ['preview', '--port', String(port), '--host'],
    buildTimeout = 180000
  } = options;
  
  // Run build via npm (short-lived, bounded)
  await runBounded(NPM_CMD, ['run', 'build'], { cwd: process.cwd(), timeout: buildTimeout });
  
  // Start preview server with local vite binary (no npx wrapper)
  const server = await startServer(previewCmd, previewArgs, { port, host, name: 'vite-preview' });
  try {
    const baseUrl = `http://${host}:${port}`;
    return await testFn(baseUrl);
  } finally {
    await server.stop();
  }
}

module.exports = {
  startServer,
  stopServer,
  stopAllServers,
  runBounded,
  withPreviewServer,
  waitForPort,
  loadPids,
  killProcessTree,
  resolveLocalBin,
  VITE_BIN,
  NPM_CMD
};