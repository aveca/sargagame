'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  createObserver,
} = require('../../scripts/factory-v3/lib/observer.cjs');

const {
  readBundle,
  buildIssueBody,
  redactText,
} = require('../../scripts/factory-v3/publish-observer-state.cjs');

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

test('publisher: un diff local non suivi est capturé et expurgé', () => {
  const root = uniqueTempDir('factory-v3-observer-publish');
  const stateDir = path.join(root, 'state', 'observer');
  initRepo(root);

  fs.writeFileSync(path.join(root, 'local-change.txt'), 'local change\n', 'utf8');
  const observer = createObserver({ rootDir: root, stateDir, debounceMs: 1 });
  observer.reconcile();
  observer.stop();

  const bundle = readBundle(stateDir, root);
  assert.equal(bundle.localChanges.diff.length > 0, true);
  assert.ok(bundle.localChanges.diff.includes('local-change.txt'));
  const body = buildIssueBody(bundle);
  assert.ok(body.includes('local-change.txt'));
  assert.ok(body.includes('local change'));
});

test('publisher: les motifs de secrets sont expurgés', () => {
  assert.equal(redactText('Bearer ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'Bearer [REDACTED]');
  assert.equal(redactText('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'), '[REDACTED]');
  assert.equal(redactText('email: someone@example.com'), 'email: [REDACTED]');
});
