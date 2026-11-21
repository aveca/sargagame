'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  createObserver,
  loadObserverState,
  readGitState,
} = require('../../scripts/factory-v3/lib/observer.cjs');

function uniqueTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function git(rootDir, args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

function initRepo(rootDir) {
  git(rootDir, ['init', '-q']);
  git(rootDir, ['config', 'user.name', 'Factory Observer Test']);
  git(rootDir, ['config', 'user.email', 'factory-observer-test@example.invalid']);
  fs.writeFileSync(path.join(rootDir, 'base.txt'), 'base\n', 'utf8');
  git(rootDir, ['add', 'base.txt']);
  git(rootDir, ['commit', '-q', '-m', 'test: base commit']);
}

test('observer: état Git réel, branche, HEAD, état local et clean', () => {
  const root = uniqueTempDir('factory-v3-observer-git');
  initRepo(root);

  const before = readGitState(root);
  assert.equal(before.clean, true);
  assert.equal(before.counts.total, 0);
  assert.ok(before.branch, 'branch must be readable');
  assert.match(before.head, /^[0-9a-f]{40}$/);
  assert.ok(before.lastCommitAt, 'commit timestamp must be readable');

  fs.writeFileSync(path.join(root, 'changed.txt'), 'local change\n', 'utf8');
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\nmodified\n', 'utf8');
  const after = readGitState(root);
  assert.equal(after.clean, false);
  assert.equal(after.counts.untracked, 1);
  assert.equal(after.counts.modified, 1);
  assert.equal(after.counts.total, 2);
  assert.ok(after.files.some((f) => f.path === 'changed.txt' && f.status === 'untracked'));
  assert.ok(after.files.some((f) => f.path === 'base.txt' && f.status === 'modified'));
});

test('observer: réconciliation, état structuré et reprise après redémarrage', async () => {
  const root = uniqueTempDir('factory-v3-observer-state');
  const stateDir = path.join(root, 'state', 'observer');
  initRepo(root);

  const firstObserver = createObserver({ rootDir: root, stateDir, debounceMs: 1 });
  firstObserver.reconcile();

  let loaded = loadObserverState(stateDir);
  assert.equal(loaded.currentState.branch, firstObserver.readState().git.branch);
  assert.equal(loaded.localChanges.clean, true);

  fs.writeFileSync(path.join(root, 'uncommitted.txt'), 'real change\n', 'utf8');
  const reconciliation = firstObserver.reconcile();
  assert.equal(reconciliation.snapshot.git.counts.total, 1);
  assert.equal(reconciliation.snapshot.changes.localChangesChanged, true);

  firstObserver.appendWorklog({
    action: 'OBSERVER_TEST',
    result: 'OK',
    files: ['uncommitted.txt'],
    agent: 'devops',
  });
  firstObserver.recordTestResult({
    command: 'node --test tests/unit/factory-v3-observer.test.cjs',
    ok: true,
    durationMs: 1,
    errors: [],
  });
  firstObserver.recordBlocker({
    id: 'OBSERVER-TEST',
    reason: 'test blocker',
    severity: 'P2',
  });
  firstObserver.recordNextAction({
    task: 'observer next action test',
    priority: 'P0',
    estimate: '1 min',
    dependencies: [],
  });
  firstObserver.stop();

  const secondObserver = createObserver({ rootDir: root, stateDir, debounceMs: 1 });
  loaded = loadObserverState(stateDir);
  assert.ok(Array.isArray(loaded.worklog));
  assert.ok(loaded.worklog.some((entry) => entry.action === 'OBSERVER_TEST'));
  assert.ok(loaded.testResults.results.some((r) => r.ok === true));
  assert.ok(loaded.blockers.blockers.some((b) => b.id === 'OBSERVER-TEST'));
  assert.ok(loaded.nextActions.actions.some((a) => a.task === 'observer next action test'));

  // L'observateur relancé conserve son historique et ajoute une nouvelle
  // réconciliation sans effacer l'état précédent.
  const worklogBefore = loaded.worklog.length;
  secondObserver.appendWorklog({ action: 'OBSERVER_RESTART', result: 'OK', files: [] });
  loaded = loadObserverState(stateDir);
  assert.ok(loaded.worklog.length >= worklogBefore + 1);
  secondObserver.stop();
});

test('observer: les répertoires générés sont ignorés et la fonction est cohérente', async () => {
  const root = uniqueTempDir('factory-v3-observer-ignore');
  const stateDir = path.join(root, 'state', 'observer');
  initRepo(root);

  const observer = createObserver({ rootDir: root, stateDir, debounceMs: 1 });
  const ignoredTargets = [
    path.join(root, 'node_modules', 'dep', 'index.js'),
    path.join(root, 'dist', 'index.js'),
    path.join(root, '.git', 'HEAD'),
    path.join(root, 'state', 'observer', 'events.jsonl'),
  ];

  for (const target of ignoredTargets) {
    assert.equal(observer.recordEvent('file_event', target), false);
  }
  const validTarget = path.join(root, 'observable.txt');
  assert.equal(observer.recordEvent('file_event', validTarget), true);
  observer.stop();
});
