import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const _RUNTIME_DIR = path.join(_MODULE_DIR, '..'); // .ai/runtime
const _ROUTER_DIR = _MODULE_DIR; // .ai/runtime/model-router

const QUEUE_FILE = process.env.MODEL_ROUTER_QUEUE_FILE || path.join(_ROUTER_DIR, 'queue.jsonl');
const STATE_FILE = process.env.MODEL_ROUTER_STATE_FILE || path.join(_ROUTER_DIR, 'state.json');
const LOCK_DIR = process.env.MODEL_ROUTER_LOCK_DIR || path.join(_ROUTER_DIR, '.lock');
const LEDGER_FILE = process.env.MODEL_ROUTER_LEDGER_FILE || path.join(_ROUTER_DIR, 'cost-ledger.jsonl');
const LOCK_TTL_MS = 5 * 60 * 1000;
const RENAME_RETRIES = 3;
const RENAME_RETRY_DELAY_MS = 100;

class QueuePersistence {
  constructor(options = {}) {
    this.options = options;
    this.queueFile = options.queueFile || QUEUE_FILE;
    this.stateFile = options.stateFile || STATE_FILE;
    this.lockDir = options.lockDir || LOCK_DIR;
    this.lockOwner = null;
    this.lockAcquired = false;
    this.buffer = [];
    this.flushInterval = options.flushInterval || 1000;
    this.maxBufferSize = options.maxBufferSize || 100;
    this.timer = null;
    this.signalHandlersInstalled = false;
    this.ensureDir();
    this._installSignalHandlers();
  }

  ensureDir() {
    const dir = path.dirname(this.queueFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const stateDir = path.dirname(this.stateFile);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
  }

  acquireLock(ownerId) {
    const owner = ownerId || `router-${process.pid}-${Date.now()}`;
    try {
      fs.mkdirSync(this.lockDir, { recursive: false });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const stale = this._isLockStale();
      if (!stale) return { acquired: false, owner: null };
      try {
        fs.rmSync(this.lockDir, { recursive: true, force: true });
        fs.mkdirSync(this.lockDir, { recursive: false });
      } catch (e2) {
        console.error(`ModelRouter: cannot cleanup stale lock at ${this.lockDir}: ${e2.message}`);
        return { acquired: false, owner: null };
      }
    }
    fs.writeFileSync(path.join(this.lockDir, 'owner.txt'),
      JSON.stringify({ owner, pid: process.pid, ts: Date.now() }), 'utf8');
    this.lockOwner = owner;
    this.lockAcquired = true;
    return { acquired: true, owner };
  }

  releaseLock() {
    if (!this.lockAcquired) return;
    try {
      this.flush();
    } finally {
      try {
        fs.rmSync(this.lockDir, { recursive: true, force: true });
      } catch (e) { /* ignore */ }
      this.lockAcquired = false;
      this.lockOwner = null;
    }
  }

  _isLockStale() {
    try {
      const ownerFile = path.join(this.lockDir, 'owner.txt');
      if (!fs.existsSync(ownerFile)) return true;
      const data = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
      return Date.now() - data.ts > LOCK_TTL_MS;
    } catch (e) {
      return true;
    }
  }

  _installSignalHandlers() {
    if (this.signalHandlersInstalled) return;
    if (this.options.disableSignalHandlers) return;
    this.signalHandlersInstalled = true;
    const flushHandler = () => {
      try { this.flush(); } catch (e) { /* ignore */ }
    };
    const releaseHandler = () => {
      try { this.releaseLock(); } catch (e) { /* ignore */ }
    };
    process.on('beforeExit', () => { flushHandler(); releaseHandler(); });
    if (this.options.installProcessExitHandlers !== false) {
      process.on('SIGINT', () => { flushHandler(); releaseHandler(); process.exit(130); });
      process.on('SIGTERM', () => { flushHandler(); releaseHandler(); process.exit(143); });
    }
    if (this.options.installUncaughtHandler === true) {
      process.on('uncaughtException', (err) => {
        console.error('Uncaught exception in model-router:', err && err.message);
        flushHandler();
        releaseHandler();
        throw err;
      });
    }
  }

  append(event, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...data,
    };
    this.buffer.push(entry);
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;

    try {
      const lines = this.buffer.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.appendFileSync(this.queueFile, lines, 'utf8');
      this.buffer = [];
    } catch (error) {
      console.error('Failed to write to queue.jsonl:', error.message);
    }
  }

  saveState(blacklist, quotas, failureHistory) {
    const tmpFile = this.stateFile + '.tmp';
    try {
      if (fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      const state = {
        blacklist: blacklist?.toPersistence?.() || {},
        quotas: quotas?.toPersistence?.() || {},
        failureHistory: failureHistory?.toPersistence?.() || {},
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
      this._atomicRename(tmpFile, this.stateFile);
    } catch (error) {
      console.error('Failed to save state:', error.message);
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
    }
  }

  _atomicRename(src, dst) {
    for (let i = 0; i < RENAME_RETRIES; i++) {
      try {
        if (fs.existsSync(dst)) {
          try { fs.unlinkSync(dst); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        fs.renameSync(src, dst);
        return;
      } catch (e) {
        if (i === RENAME_RETRIES - 1) throw e;
        const end = Date.now() + RENAME_RETRY_DELAY_MS;
        while (Date.now() < end) { /* busy wait */ }
      }
    }
  }

  loadState() {
    try {
      if (!fs.existsSync(this.stateFile)) return null;
      const data = fs.readFileSync(this.stateFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load state:', error.message);
      return null;
    }
  }

  shutdown() {
    this.flush();
    this.releaseLock();
  }
}

class CostLedger {
  constructor(options = {}) {
    this.ledgerFile = options.ledgerFile || LEDGER_FILE;
    this.dailyBudget = options.dailyBudget || 50;
    this.hourlyBudget = options.hourlyBudget || 10;
    this.currency = options.currency || 'USD';
    this.buffer = [];
    this.ensureDir();
  }

  ensureDir() {
    const dir = path.dirname(this.ledgerFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  record(modelId, inputTokens, outputTokens, cost, metadata = {}) {
    const now = new Date();
    const entry = {
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      hour: now.getHours(),
      modelId,
      inputTokens,
      outputTokens,
      cost: Number(cost.toFixed(6)),
      currency: this.currency,
      ...metadata,
    };
    this.buffer.push(entry);
    if (this.buffer.length >= 10) {
      this.flush();
    }
  }

  flush() {
    if (this.buffer.length === 0) return;
    try {
      const lines = this.buffer.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.appendFileSync(this.ledgerFile, lines, 'utf8');
      this.buffer = [];
    } catch (error) {
      console.error('Failed to write cost-ledger:', error.message);
    }
  }

  getDailySpend(date = new Date().toISOString().split('T')[0]) {
    if (!fs.existsSync(this.ledgerFile)) return 0;
    const lines = fs.readFileSync(this.ledgerFile, 'utf8').trim().split('\n').filter(Boolean);
    let total = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.date === date) total += entry.cost || 0;
      } catch {}
    }
    return total;
  }

  getHourlySpend(hour = new Date().getHours()) {
    if (!fs.existsSync(this.ledgerFile)) return 0;
    const lines = fs.readFileSync(this.ledgerFile, 'utf8').trim().split('\n').filter(Boolean);
    let total = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.hour === hour) total += entry.cost || 0;
      } catch {}
    }
    return total;
  }

  getBudgetStatus() {
    const daily = this.getDailySpend();
    const hourly = this.getHourlySpend();
    return {
      daily: { used: daily, limit: this.dailyBudget, remaining: Math.max(0, this.dailyBudget - daily) },
      hourly: { used: hourly, limit: this.hourlyBudget, remaining: Math.max(0, this.hourlyBudget - hourly) },
      currency: this.currency,
    };
  }

  shutdown() {
    this.flush();
  }
}

export { QueuePersistence, CostLedger, QUEUE_FILE, STATE_FILE, LEDGER_FILE };
export default QueuePersistence;