const assert = require('assert');
const { git, gitSafe } = require('./gitops.cjs');

const root = git(['rev-parse', '--show-toplevel']);
assert.ok(typeof root === 'string' && root.length > 0, 'git() must return stdout as a string');

const quiet = git(['diff', '--quiet', 'HEAD', 'HEAD'], undefined, { pipeOut: false });
assert.strictEqual(quiet, '', 'git(pipeOut=false) must return an empty string, never null');

const captured = git(['rev-parse', '--show-toplevel']);
assert.ok(captured.length > 0, 'default git() must still capture stdout');

assert.strictEqual(gitSafe(['rev-parse', '--definitely-invalid-option']), null);

console.log('GITOPS null-stdout contract: PASS');
