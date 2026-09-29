const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'scripts',
    'lib',
    'dedicated-pages.cjs'
  ),
  'utf8'
);

const i = src.indexOf('function shareWithUTM');

assert.ok(
  i >= 0,
  'shareWithUTM template must exist'
);

const end = src.indexOf('</script>', i);

assert.ok(
  end > i,
  'shareWithUTM script terminator must exist'
);

const script = src.slice(i, end);

assert.doesNotThrow(
  () => new Function(script),
  'generated shareWithUTM script must parse'
);

assert.match(
  script,
  /copy: async \(\) => \{[\s\S]*?\r?\n    \}\r?\n  \};/,
  'urls object must close after copy function'
);

for (const channel of [
  'whatsapp',
  'facebook',
  'twitter',
  'email',
  'copy'
]) {
  assert.ok(
    script.includes(channel + ':'),
    `missing share channel: ${channel}`
  );
}

console.log('SHARE-UTM contract: PASS');
