const assert = require('assert');
const { git, gitSafe } = require('./gitops.cjs');

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

console.log('GITOPS null-stdout contract: PASS');
