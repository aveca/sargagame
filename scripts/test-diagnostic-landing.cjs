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
  ['b2b capture helper', h.includes('b2b-capture.js')],
  ['real endpoint (not placeholder)', !h.includes('AKfycbw-placeholder')],
  ['real endpoint present', h.includes('AKfycbwkV1tQSEmrZ')],
  ['sgB2BCapture call', h.includes('sgB2BCapture')],
  ['form-started tracking', h.includes('sg_diagnostic_form_start')],
  ['form-submit tracking', h.includes('sg_diagnostic_form_submit')],
  ['capture confirmed tracking', h.includes('sg_diagnostic_capture_confirmed')],
  ['double-submit prevention', h.includes('submitted = false') || h.includes('if(submitted) return')],
  ['email validation', h.includes('indexOf(\'@\')')],
  ['fiabilite link', h.includes('fiabilite')],
];
let pass = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (ok) pass++;
}
console.log('\n' + pass + '/' + checks.length + ' checks passed');
console.log('SIZE: ' + h.length + ' bytes');
process.exit(pass === checks.length ? 0 : 1);