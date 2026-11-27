'use strict';

/**
 * observer.cjs — Observateur local indépendant de Factory V3.
 *
 * Objectif : capter ce qui se passe réellement sur le poste sans attendre un
 * commit ni une publication, en combinant :
 *   - des événements `fs.watch` (réactivité),
 *   - une réconciliation Git périodique (verrité),
 *   - un état structuré persistant (CURRENT_STATE, LOCAL_CHANGES, WORKLOG,
 *     TEST_RESULTS, BLOCKERS, NEXT_ACTIONS).
 *
 * L'observateur est indépendant du cycle de vie de la session OpenCode et du
 * runner Factory. Il peut être relancé sans perdre l'historique.
 *
 * Sécurité : ce module ne lit ni ne publie aucun secret. Les valeurs sensibles
 * ne sont pas intentionnellement chargées ici, et les fichiers de configuration
 * locaux ne sont pas exportés.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.tmp',
  'coverage',
]);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeJsonAtomic(file, data) {
  ensureDir(file);
  const tmp = `${file}.${process.pid}.${Date.now()}.${crypto
    .randomBytes(3)
    .toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function appendJsonl(file, entry) {
  ensureDir(file);
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
}

function readJsonl(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_) {
          return { ts: null, event: 'JSONL_PARSE_ERROR', raw: line.slice(0, 500) };
        }
      });
  } catch (_) {
    return [];
  }
}

function normalizePath(rootDir, target) {
  const absolute = path.resolve(rootDir, target);
  const root = path.resolve(rootDir);
  let relative = path.relative(root, absolute);
  if (!relative) relative = '.';
  return relative.replace(/\\/g, '/');
}

function withinIgnoredDir(rootDir, target) {
  const relative = normalizePath(rootDir, target);
  const parts = relative.split('/');
  if (relative === '.' || relative === '..') return true;
  return parts.some((part) => DEFAULT_IGNORED_DIRS.has(part));
}

function runGit(rootDir, args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10_000,
      windowsHide: true,
      ...options,
    });
  } catch (error) {
    const reason = new Error(`GIT_OBSERVER_FAILED: git ${args.join(' ')}`);
    reason.code = 'GIT_OBSERVER_FAILED';
    reason.cause = error;
    throw reason;
  }
}

function parseStatusHeader(header) {
  // Exemples réels :
  //   ## agent/devops/factory-v3-model-failover...origin/agent/devops/factory-v3-model-failover [ahead 1]
  //   ## main
  const withoutMarker = String(header).replace(/^##\s+/, '');
  const tracking = withoutMarker.match(/^([^\s]+)\.\.\.([^\s\[]+)/);
  const branch = (tracking ? tracking[1] : withoutMarker.split(/\s+/)[0]) || null;
  const upstream = tracking ? tracking[2] : null;
  const counts = { ahead: 0, behind: 0 };
  const bracket = withoutMarker.match(/\[(.*?)\]/);
  if (bracket) {
    const ahead = bracket[1].match(/ahead\s+(\d+)/);
    const behind = bracket[1].match(/behind\s+(\d+)/);
    if (ahead) counts.ahead = Number(ahead[1]);
    if (behind) counts.behind = Number(behind[1]);
  }
  return { branch, upstream, ahead: counts.ahead, behind: counts.behind };
}

function classifyStatus(x, y) {
  if (x === '?' || y === '?') return 'untracked';
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'M' || y === 'M' || x === 'C' || y === 'C') return 'modified';
  return 'modified';
}

function readGitState(rootDir) {
  const output = runGit(rootDir, ['status', '--porcelain=v1', '-b']);
  const lines = output.split(/\r?\n/).filter(Boolean);
  const header = lines.length ? lines[0] : '##';
  const headerInfo = parseStatusHeader(header);

  const files = [];
  for (const line of lines.slice(1)) {
    const x = line.slice(0, 1) || ' ';
    const y = line.slice(1, 2) || ' ';
    let body = line.slice(3);
    if (x === 'R' || y === 'R') {
      const rename = body.split(' -> ');
      if (rename.length === 2) body = rename[1];
    }
    const entryPath = body.trim().replace(/^"(.*)"$/, '$1');
    files.push({
      x,
      y,
      path: entryPath,
      status: classifyStatus(x, y),
    });
  }

  const head = runGit(rootDir, ['rev-parse', 'HEAD']).trim();
  let remoteHead = null;
  let ahead = headerInfo.ahead;
  let behind = headerInfo.behind;
  if (headerInfo.upstream) {
    try {
      remoteHead = runGit(rootDir, ['rev-parse', '--verify', headerInfo.upstream]).trim();
      const counts = runGit(rootDir, ['rev-list', '--left-right', '--count', `${head}...${remoteHead}`]);
      const [aheadRaw, behindRaw] = counts.trim().split(/\s+/);
      ahead = Number(aheadRaw) || 0;
      behind = Number(behindRaw) || 0;
    } catch (_) {
      // Pas d'upstream valide : l'état local reste affiché honnêtement.
      remoteHead = null;
    }
  }

  const lastCommitAt = (() => {
    try {
      return runGit(rootDir, ['show', '-s', '--format=%cI', 'HEAD']).trim();
    } catch (_) {
      return null;
    }
  })();

  const remoteUrl = (() => {
    try {
      return runGit(rootDir, ['remote', 'get-url', 'origin']).trim();
    } catch (_) {
      return null;
    }
  })();

  return {
    rootDir: path.resolve(rootDir),
    branch: headerInfo.branch,
    upstream: headerInfo.upstream,
    head,
    remoteHead,
    ahead,
    behind,
    remoteUrl,
    lastCommitAt,
    files,
    counts: {
      total: files.length,
      added: files.filter((f) => f.status === 'added').length,
      modified: files.filter((f) => f.status === 'modified').length,
      deleted: files.filter((f) => f.status === 'deleted').length,
      renamed: files.filter((f) => f.status === 'renamed').length,
      untracked: files.filter((f) => f.status === 'untracked').length,
    },
    clean: files.length === 0,
  };
}

function createObserver({
  rootDir,
  stateDir,
  watchSubDirs = null,
  debounceMs = 400,
  maxEvents = 5000,
  now = () => new Date(),
  logger = null,
} = {}) {
  const root = path.resolve(rootDir || process.cwd());
  const stateRoot = path.resolve(stateDir || path.join(root, 'state', 'observer'));
  fs.mkdirSync(stateRoot, { recursive: true });

  const files = {
    events: path.join(stateRoot, 'events.jsonl'),
    state: path.join(stateRoot, 'state.json'),
    currentState: path.join(stateRoot, 'CURRENT_STATE.json'),
    localChanges: path.join(stateRoot, 'LOCAL_CHANGES.json'),
    worklog: path.join(stateRoot, 'WORKLOG.jsonl'),
    testResults: path.join(stateRoot, 'TEST_RESULTS.json'),
    blockers: path.join(stateRoot, 'BLOCKERS.json'),
    nextActions: path.join(stateRoot, 'NEXT_ACTIONS.json'),
  };

  const eventCounts = new Map(); // `${kind}:${target}` -> { at, count }
  let watcher = null;
  let reconciling = false;
  let stopped = false;
  let debounceTimer = null;

  function shouldIgnore(target) {
    if (!target) return true;
    const relative = path.relative(root, path.resolve(root, target));
    if (!relative) return true;
    if (withinIgnoredDir(root, target)) return true;
    // L'état de l'observateur ne doit jamais polluer l'état du dépôt observé.
    const relativeToStateRoot = path.relative(stateRoot, path.resolve(target));
    if (relativeToStateRoot && !relativeToStateRoot.startsWith('..') && path.isAbsolute(relativeToStateRoot) === false) {
      return true;
    }
    return false;
  }

  function recordEvent(kind, target, meta = {}) {
    if (shouldIgnore(target)) return false;
    const key = `${kind}:${normalizePath(root, target)}`;
    const ts = now().toISOString();
    const existing = eventCounts.get(key);
    const identicalWindow = existing && Date.now() - existing.at.getTime() <= debounceMs;
    if (identicalWindow) {
      existing.count += 1;
      return false;
    }
    if (eventCounts.size > maxEvents) eventCounts.clear();
    eventCounts.set(key, { at: now(), count: 1 });
    appendJsonl(files.events, {
      ts,
      kind,
      target: normalizePath(root, target),
      ...meta,
    });
    return true;
  }

  function readState() {
    const raw = readJson(files.state, null);
    if (!isObject(raw)) return null;
    return raw;
  }

  function stripObserverState(gitState) {
    const files = gitState.files.filter((file) => {
      const target = path.resolve(root, file.path);
      const relativeToStateRoot = path.relative(stateRoot, target);
      const relativeFromTargetToStateRoot = path.relative(target, stateRoot);
      const insideStateRoot = relativeToStateRoot !== '' && !relativeToStateRoot.startsWith('..');
      const ancestorOfStateRoot = relativeFromTargetToStateRoot !== '' && !relativeFromTargetToStateRoot.startsWith('..');
      return !(insideStateRoot || ancestorOfStateRoot);
    });
    const counts = {
      total: files.length,
      added: files.filter((f) => f.status === 'added').length,
      modified: files.filter((f) => f.status === 'modified').length,
      deleted: files.filter((f) => f.status === 'deleted').length,
      renamed: files.filter((f) => f.status === 'renamed').length,
      untracked: files.filter((f) => f.status === 'untracked').length,
    };
    return { ...gitState, files, counts, clean: files.length === 0 };
  }

  function currentTestResults() {
    return readJson(files.testResults, { completedAt: null, results: [] });
  }

  function currentBlockers() {
    return readJson(files.blockers, { updatedAt: null, blockers: [] });
  }

  function currentNextActions() {
    return readJson(files.nextActions, { updatedAt: null, actions: [] });
  }

  function currentWorklog() {
    return readJsonl(files.worklog);
  }

  function buildSnapshot(gitState, previous) {
    const generatedAt = now().toISOString();
    const previousGit = previous && previous.git ? previous.git : null;
    const previousFiles = previous && previous.files ? previous.files : null;

    const fileSignatures = gitState.files
      .map((f) => `${f.status}:${f.path}`)
      .sort()
      .join('\n');
    const previousFileSignatures = previousFiles
      ? previousFiles.files.map((f) => `${f.status}:${f.path}`).sort().join('\n')
      : '';

    const changes = {
      branchChanged: Boolean(previousGit && previousGit.branch !== gitState.branch),
      commitChanged: Boolean(previousGit && previousGit.head !== gitState.head),
      upstreamChanged: Boolean(previousGit && previousGit.upstream !== gitState.upstream),
      pushedChanged: Boolean(
        previousGit
          && (previousGit.ahead !== gitState.ahead || previousGit.behind !== gitState.behind),
      ),
      localChangesChanged: fileSignatures !== previousFileSignatures,
    };

    return {
      version: 1,
      generatedAt,
      repository: {
        rootDir: gitState.rootDir,
        remoteUrl: gitState.remoteUrl,
      },
      git: gitState,
      changes,
      counts: {
        localChanges: gitState.counts.total,
        worklog: readJsonl(files.worklog).length,
        events: readJsonl(files.events).length,
        testResults: currentTestResults().results.length,
        blockers: currentBlockers().blockers.length,
        nextActions: currentNextActions().actions.length,
      },
      process: {
        pid: process.pid,
        hostname: require('os').hostname(),
        uptimeS: Math.round(process.uptime()),
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    };
  }

  function reconcile() {
    if (reconciling) return { skipped: true, reason: 'already-running' };
    reconciling = true;
    try {
      const previous = readState();
      const gitState = stripObserverState(readGitState(root));
      const snapshot = buildSnapshot(gitState, previous);

      // Historique compact : on garde au plus une fenêtre bornée pour éviter
      // une croissance illimitée.
      const historyFile = path.join(stateRoot, 'history.jsonl');
      const history = readJsonl(historyFile);
      history.push({ ts: snapshot.generatedAt, event: 'RECONCILE', changes: snapshot.changes });
      if (history.length > 1000) history.splice(0, history.length - 1000);
      ensureDir(historyFile);
      fs.writeFileSync(historyFile, history.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');

      // Logs structurés pour les changements réels.
      if (snapshot.changes.branchChanged) {
        appendJsonl(files.events, {
          ts: snapshot.generatedAt,
          kind: 'branch_changed',
          from: previous.git.branch,
          to: snapshot.git.branch,
        });
      }
      if (snapshot.changes.commitChanged) {
        appendJsonl(files.events, {
          ts: snapshot.generatedAt,
          kind: 'commit_changed',
          from: previous.git.head,
          to: snapshot.git.head,
        });
      }
      if (snapshot.changes.pushedChanged) {
        appendJsonl(files.events, {
          ts: snapshot.generatedAt,
          kind: 'push_state_changed',
          ahead: snapshot.git.ahead,
          behind: snapshot.git.behind,
        });
      }
      if (snapshot.changes.localChangesChanged) {
        appendJsonl(files.events, {
          ts: snapshot.generatedAt,
          kind: 'local_changes_changed',
          counts: snapshot.git.counts,
        });
      }

      writeJsonAtomic(files.state, snapshot);
      writeJsonAtomic(files.currentState, {
        generatedAt: snapshot.generatedAt,
        repository: snapshot.repository,
        branch: snapshot.git.branch,
        head: snapshot.git.head,
        remoteHead: snapshot.git.remoteHead,
        ahead: snapshot.git.ahead,
        behind: snapshot.git.behind,
        lastCommitAt: snapshot.git.lastCommitAt,
        localChanges: snapshot.git.counts,
        process: snapshot.process,
      });
      writeJsonAtomic(files.localChanges, {
        generatedAt: snapshot.generatedAt,
        files: snapshot.git.files,
        counts: snapshot.git.counts,
        clean: snapshot.git.clean,
      });
      writeJsonAtomic(files.testResults, currentTestResults());
      writeJsonAtomic(files.blockers, currentBlockers());
      writeJsonAtomic(files.nextActions, currentNextActions());

      return { snapshot, changed: snapshot.changes };
    } finally {
      reconciling = false;
    }
  }

  function start() {
    if (stopped) return null;
    const watchRoots = watchSubDirs
      ? watchSubDirs.map((dir) => path.resolve(root, dir))
      : [root];
    watcher = fs.watch(root, { recursive: true }, (kind, target) => {
      if (!target) return;
      const absolute = path.resolve(root, target);
      if (shouldIgnore(absolute)) return;
      const exists = fs.existsSync(absolute);
      const eventKind = exists ? 'file_event' : 'file_missing';
      const changed = recordEvent(eventKind, absolute, { watchKind: kind });
      if (changed) {
        scheduleReconcile();
        if (logger) logger('FILE_EVENT', { kind: eventKind, target: normalizePath(root, absolute) });
      }
    });
    return { watchRoots };
  }

  function scheduleReconcile() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      try {
        reconcile();
      } catch (error) {
        appendJsonl(files.events, {
          ts: now().toISOString(),
          kind: 'reconcile_error',
          error: String(error && error.message || error),
        });
      }
    }, Math.max(50, Number(debounceMs) || 400));
  }

  function stop() {
    stopped = true;
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function appendWorklog({ action, result, files: touchedFiles = [], agent = null, meta = {} }) {
    const entry = {
      ts: now().toISOString(),
      action,
      result,
      files: Array.isArray(touchedFiles) ? touchedFiles : [touchedFiles],
      agent,
      ...meta,
    };
    appendJsonl(files.worklog, entry);
    reconcile();
    return entry;
  }

  function recordTestResult({ command, ok, durationMs = null, errors = [], untested = [] }) {
    const current = currentTestResults();
    const results = Array.isArray(current.results) ? current.results : [];
    const result = {
      ts: now().toISOString(),
      command,
      ok: Boolean(ok),
      durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
      errors: Array.isArray(errors) ? errors : [],
      untested: Array.isArray(untested) ? untested : [],
    };
    results.push(result);
    if (results.length > 200) results.splice(0, results.length - 200);
    writeJsonAtomic(files.testResults, {
      generatedAt: result.ts,
      completedAt: result.ts,
      results,
    });
    reconcile();
    return result;
  }

  function recordBlocker({ id, reason, severity = 'P1', action = null, resolved = false }) {
    const current = currentBlockers();
    const blockers = Array.isArray(current.blockers) ? current.blockers : [];
    const entry = {
      id,
      ts: now().toISOString(),
      reason,
      severity,
      action,
      resolved: Boolean(resolved),
    };
    const filtered = blockers.filter((b) => b.id !== id);
    filtered.push(entry);
    writeJsonAtomic(files.blockers, {
      generatedAt: entry.ts,
      updatedAt: entry.ts,
      blockers: filtered,
    });
    reconcile();
    return entry;
  }

  function recordNextAction({ task, priority = 'P0', estimate = null, dependencies = [] }) {
    const current = currentNextActions();
    const actions = Array.isArray(current.actions) ? current.actions : [];
    const entry = {
      ts: now().toISOString(),
      task,
      priority,
      estimate,
      dependencies,
    };
    actions.push(entry);
    if (actions.length > 100) actions.splice(0, actions.length - 100);
    writeJsonAtomic(files.nextActions, {
      generatedAt: entry.ts,
      updatedAt: entry.ts,
      actions,
    });
    reconcile();
    return entry;
  }

  function paths() {
    return { ...files, history: path.join(stateRoot, 'history.jsonl') };
  }

  return {
    start,
    stop,
    reconcile,
    recordEvent,
    appendWorklog,
    recordTestResult,
    recordBlocker,
    recordNextAction,
    readState,
    paths,
  };
}

function loadObserverState(stateDir) {
  const stateRoot = path.resolve(stateDir);
  return {
    state: readJson(path.join(stateRoot, 'state.json'), null),
    currentState: readJson(path.join(stateRoot, 'CURRENT_STATE.json'), null),
    localChanges: readJson(path.join(stateRoot, 'LOCAL_CHANGES.json'), null),
    worklog: readJsonl(path.join(stateRoot, 'WORKLOG.jsonl')),
    testResults: readJson(path.join(stateRoot, 'TEST_RESULTS.json'), null),
    blockers: readJson(path.join(stateRoot, 'BLOCKERS.json'), null),
    nextActions: readJson(path.join(stateRoot, 'NEXT_ACTIONS.json'), null),
    events: readJsonl(path.join(stateRoot, 'events.jsonl')),
  };
}

module.exports = {
  createObserver,
  loadObserverState,
  readGitState,
  readJson,
  writeJsonAtomic,
  appendJsonl,
  readJsonl,
};
