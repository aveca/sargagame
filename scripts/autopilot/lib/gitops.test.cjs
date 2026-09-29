const assert = require('assert');
const { git, gitSafe } = require('./gitops.cjs');

const root = git(['rev-parse', '--show-toplevel']);
assert.ok(typeof root === 'string' && root.length > 0, 'git() must return stdout as a string');

const quiet = git(['diff', '--quiet', 'HEAD', 'HEAD']);
assert.strictEqual(quiet, '', 'git() must safely handle commands with no stdout');

assert.strictEqual(gitSafe(['rev-parse', '--definitely-invalid-option']), null);

console.log('GITOPS null-stdout contract: PASS');
