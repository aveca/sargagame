const fs = require('fs');
const h = fs.readFileSync('public/diagnostic-sargasses-express/index.html', 'utf8');
const checks = [
  ['<title>', h.includes('<title>')],
  ['meta description', h.includes('meta name="description"')],
  ['canonical', h.includes('link rel="canonical"')],
  ['structured data', h.includes('application/ld+json')],
  ['h1', h.includes('<h1')],
  ['price 49', h.includes('49')],
  ['form', h.includes('<form')],
  ['cta demande', h.includes('Demander mon diagnostic')],
  ['premium link', h.includes('premium/')],
  ['b2b capture', h.includes('sgB2BCapture') || h.includes('b2b-capture')],
];
let pass = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (ok) pass++;
}
console.log('\n' + pass + '/' + checks.length + ' checks passed');
console.log('SIZE: ' + h.length + ' bytes');
process.exit(pass === checks.length ? 0 : 1);