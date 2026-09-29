const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'lib', 'dedicated-pages.cjs'), 'utf8');
const start = src.indexOf('function shareWithUTM');
assert.ok(start >= 0, 'shareWithUTM template must exist');
const end = src.indexOf('</script>', start);
assert.ok(end > start, 'shareWithUTM script terminator must exist');
const script = src.slice(start, end);
assert.doesNotThrow(function () { new Function(script); }, 'generated shareWithUTM script must parse');
['whatsapp', 'facebook', 'twitter', 'email', 'copy'].forEach(function (channel) {
  assert.ok(script.indexOf(channel + ':') >= 0, 'missing share channel: ' + channel);
});
console.log('SHARE-UTM contract: PASS');