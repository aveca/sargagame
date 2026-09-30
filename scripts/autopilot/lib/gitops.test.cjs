const assert = require('assert');
const { git, gitSafe, analyzeConflict, resolveKeepOurs, worktreeAddRecovery } = require('./gitops.cjs');

const root = git(['rev-parse', '--show-toplevel']);
assert.ok(typeof root === 'string' && root.length > 0, 'git() must return stdout as a string');

const quiet = git(['diff', '--quiet', 'HEAD', 'HEAD'], undefined, { pipeOut: false });
assert.strictEqual(quiet, '', 'git(pipeOut=false) must return an empty string, never null');

const captured = git(['rev-parse', '--show-toplevel']);
assert.ok(captured.length > 0, 'default git() must still capture stdout');

// NOTE : `git rev-parse --<option-inconnue>` ne convient PAS comme sonde
// d'échec — rev-parse répercute les opérandes inconnus sur stdout avec exit 0.
// `--verify` sur une ref inexistante échoue réellement (exit != 0, stdout vide).
assert.strictEqual(gitSafe(['rev-parse', '--verify', 'refs/heads/definitely-not-a-branch-xyz']), null);

// Test analyzeConflict - both-modified with substantive changes (unsafe)
{
  const content = `<<<<<<< HEAD
new line from agent
=======
new line from main
>>>>>>> main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'both-modified', 'both-modified detection');
  assert.strictEqual(result.safeToKeepOurs, false, 'both-modified with substantive changes is unsafe');
}

// Test analyzeConflict - both-modified unsafe (both have substantive changes)
{
  const content = `<<<<<<< HEAD
function foo() { return 1; }
=======
function foo() { return 2; }
>>>>>>> main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'both-modified', 'both-modified detection');
  assert.strictEqual(result.safeToKeepOurs, false, 'both-modified with substantive changes is unsafe');
}

// Test analyzeConflict - theirs is whitespace only (safe to keep ours)
{
  const content = `<<<<<<< HEAD
function foo() { return 1; }
// new comment
=======

// just whitespace and comment
>>>>>>> main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'both-modified', 'both-modified detection');
  assert.strictEqual(result.safeToKeepOurs, true, 'theirs whitespace only -> safe to keep ours');
}

// Test resolveKeepOurs
{
  const content = `<<<<<<< HEAD
our version
=======
their version
>>>>>>> main`;
  const resolved = resolveKeepOurs(content);
  assert.ok(resolved.includes('our version'), 'keeps our version');
  assert.ok(!resolved.includes('their version'), 'removes their version');
  assert.ok(!resolved.includes('<<<<<<<'), 'removes conflict markers');
  assert.ok(!resolved.includes('======='), 'removes separator');
  assert.ok(!resolved.includes('>>>>>>>'), 'removes end marker');
}

// Test resolveKeepOurs - multiline
{
  const content = `line before
<<<<<<< HEAD
our line 1
our line 2
=======
their line 1
their line 2
>>>>>>> main
line after`;
  const resolved = resolveKeepOurs(content);
  assert.ok(resolved.includes('our line 1'), 'keeps our line 1');
  assert.ok(resolved.includes('our line 2'), 'keeps our line 2');
  assert.ok(!resolved.includes('their line 1'), 'removes their line 1');
  assert.ok(resolved.includes('line before'), 'keeps context before');
  assert.ok(resolved.includes('line after'), 'keeps context after');
}

// Test worktreeAddRecovery - path exists but not registered = retry-aside
{
  const result = worktreeAddRecovery({ pathExists: true, registered: false });
  assert.strictEqual(result, 'retry-aside', 'orphan worktree -> retry-aside');
}

// Test worktreeAddRecovery - path exists and registered = throw
{
  const result = worktreeAddRecovery({ pathExists: true, registered: true });
  assert.strictEqual(result, 'throw', 'registered worktree -> throw');
}

// Test worktreeAddRecovery - path doesn't exist = throw
{
  const result = worktreeAddRecovery({ pathExists: false, registered: false });
  assert.strictEqual(result, 'throw', 'missing path -> throw');
}

console.log('GITOPS null-stdout contract: PASS');
console.log('GITOPS conflict analysis tests: PASS');
console.log('GITOPS resolveKeepOurs tests: PASS');
console.log('GITOPS worktreeAddRecovery tests: PASS');
