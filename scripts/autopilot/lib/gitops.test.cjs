const assert = require('assert');
// Marqueurs de conflit CONSTRUITS (jamais litteraux en debut de ligne) :
// `git diff --check` les confondrait avec un vrai conflit non resolu.
const M7 = '<'.repeat(7), E7 = '='.repeat(7), G7 = '>'.repeat(7);
const { git, gitSafe, analyzeConflict, splitHunks, resolveKeepOurs, resolveKeepTheirs, worktreeAddRecovery, prepareRepairWorktree } = require('./gitops.cjs');
const gen = require('./generated-files.cjs');

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

// Test analyzeConflict - both sides substantive (UNSAFE, abort propre)
{
  const content = `${M7} HEAD
new line from agent
${E7}
new line from main
${G7} main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'both-modified', 'both-modified detection');
  assert.strictEqual(result.safe, false, 'both substantive sides = unsafe');
}

// Test analyzeConflict - both substantive (UNSAFE)
{
  const content = `${M7} HEAD
function foo() { return 1; }
${E7}
function foo() { return 2; }
${G7} main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'both-modified', 'both-modified detection');
  assert.strictEqual(result.safe, false, 'both substantive = unsafe');
}

// Test analyzeConflict - ours-only (safe, garde ours)
{
  const content = `${M7} HEAD
function foo() { return 1; }
// new comment
${E7}

${G7} main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'ours-only', 'ours-only detection');
  assert.strictEqual(result.safe, true, 'ours-only -> safe');
  assert.strictEqual(result.strategy, 'ours', 'ours-only -> keep ours');
}

// Test analyzeConflict - theirs-only (safe, garde theirs)
{
  const content = `${M7} HEAD

${E7}
function bar() { return 2; }
${G7} main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'theirs-only', 'theirs-only detection');
  assert.strictEqual(result.safe, true, 'theirs-only -> safe');
  assert.strictEqual(result.strategy, 'theirs', 'theirs-only -> keep theirs');
}

// Test analyzeConflict - whitespace-only des deux côtés (safe, garde ours)
{
  const content = `${M7} HEAD


${E7}

${G7} main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.type, 'whitespace-only', 'whitespace-only detection');
  assert.strictEqual(result.safe, true, 'whitespace-only -> safe');
  assert.strictEqual(result.strategy, 'ours', 'whitespace-only -> keep ours');
}

// Test analyzeConflict - même contenu modulo espaces (safe, garde ours)
{
  const content = `${M7} HEAD
function foo()  {  return 1; }
${E7}
function foo() { return 1; }
${G7} main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.safe, true, 'whitespace-equivalent -> safe');
  assert.strictEqual(result.strategy, 'ours', 'whitespace-equivalent -> keep ours');
}

// Test analyzeConflict - multi-hunks : UN hunk unsafe = tout unsafe
{
  const content = `line 0
${M7} HEAD
only ours here
${E7}

${G7} main
line middle
${M7} HEAD
agent change
${E7}
main change
${G7} main`;
  const result = analyzeConflict(content);
  assert.strictEqual(result.safe, false, 'one unsafe hunk poisons the file');
  assert.strictEqual(splitHunks(content).length, 2, 'two hunks detected');
}

// Test resolveKeepOurs
{
  const content = `${M7} HEAD
our version
${E7}
their version
${G7} main`;
  const resolved = resolveKeepOurs(content);
  assert.ok(resolved.includes('our version'), 'keeps our version');
  assert.ok(!resolved.includes('their version'), 'removes their version');
  assert.ok(!resolved.includes('<<<<<<<'), 'removes conflict markers');
  assert.ok(!resolved.includes('======='), 'removes separator');
  assert.ok(!resolved.includes('>>>>>>>'), 'removes end marker');
}

// Test resolveKeepTheirs
{
  const content = `${M7} HEAD
our version
${E7}
their version
${G7} main`;
  const resolved = resolveKeepTheirs(content);
  assert.ok(resolved.includes('their version'), 'keeps their version');
  assert.ok(!resolved.includes('our version'), 'removes our version');
  assert.ok(!resolved.includes('<<<<<<<'), 'removes conflict markers');
}

// Test resolveKeepOurs - multiline
{
  const content = `line before
${M7} HEAD
our line 1
our line 2
${E7}
their line 1
their line 2
${G7} main
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

// Test prepareRepairWorktree exports and basic structure
{
  assert.strictEqual(typeof prepareRepairWorktree, 'function', 'prepareRepairWorktree is exported as function');
}

// Test GENERATED_FILES via le module central (source unique — ÉTAPE 3)
{
  assert.strictEqual(gen.isGeneratedFile('public/data/media-manifest.json'), true, 'media-manifest is generated');
  assert.strictEqual(gen.isGeneratedFile('public/api/copernicus/sargassum.json'), true, 'sargassum.json is generated');
  assert.strictEqual(gen.isGeneratedFile('public/version.json'), true, 'version.json is generated');
  assert.strictEqual(gen.isGeneratedFile('dist/some/file.js'), true, 'dist files are generated');
  assert.strictEqual(gen.isGeneratedFile('node_modules/foo/bar.js'), true, 'node_modules are generated');
  // ÉTAPE 3 : les deux JSON partenaires sont des artefacts de build.
  assert.strictEqual(gen.isGeneratedFile('public/api/b2b-partners.json'), true, 'b2b-partners.json is generated');
  assert.strictEqual(gen.isGeneratedFile('src/lib/partners-catalog.json'), true, 'partners-catalog.json is generated');
  assert.strictEqual(gen.isGeneratedFile('src/something.js'), false, 'src files are NOT generated');
  assert.strictEqual(gen.isGeneratedFile('tests/unit/test.cjs'), false, 'test files are NOT generated');
  // Anti-faux-positif préfixe : 'dist' ne doit pas matcher 'distx'.
  assert.strictEqual(gen.isGeneratedFile('distx/file.js'), false, 'distx is NOT dist/');
  assert.strictEqual(gen.classifyRepairFile('public/api/b2b-partners.json'), 'generated', 'partners -> generated');
  assert.strictEqual(gen.classifyRepairFile('src/Sargasses_PROD.jsx'), 'unknown', 'produit -> unknown (préservé)');
  assert.strictEqual(gen.classifyRepairFile('.ai/autopilot/runs/x.md'), 'autopilot-temp', 'runs -> autopilot-temp');
  assert.ok(gen.listGeneratedPatterns().length >= 7, 'liste explicite >= 7 entrées');
}

// Test AUTOPILOT_TEMP_FILES via le module central
{
  assert.strictEqual(gen.isAutopilotTempFile('.ai/autopilot/observations/latest.json'), true, 'latest.json is autopilot temp');
  assert.strictEqual(gen.isAutopilotTempFile('.ai/autopilot/queue.json'), true, 'queue.json is autopilot temp');
  assert.strictEqual(gen.isAutopilotTempFile('.ai/autopilot/scheduler.json'), true, 'scheduler.json is autopilot temp');
  assert.strictEqual(gen.isAutopilotTempFile('.ai/autopilot/latest.md'), true, 'latest.md is autopilot temp');
  assert.strictEqual(gen.isAutopilotTempFile('.ai/autopilot/runs/some-run.md'), true, 'runs/ files are autopilot temp');
  assert.strictEqual(gen.isAutopilotTempFile('.ai/autopilot/regressions/some.txt'), true, 'regressions/ files are autopilot temp');
  assert.strictEqual(gen.isAutopilotTempFile('src/something.js'), false, 'src files are NOT autopilot temp');
  assert.strictEqual(gen.isAutopilotTempFile('public/data/media-manifest.json'), false, 'media-manifest is NOT autopilot temp');
}

console.log('GITOPS null-stdout contract: PASS');
console.log('GITOPS conflict analysis tests: PASS');
console.log('GITOPS resolveKeepOurs tests: PASS');
console.log('GITOPS worktreeAddRecovery tests: PASS');
console.log('GITOPS prepareRepairWorktree classification tests: PASS');
