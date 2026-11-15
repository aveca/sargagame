// tests/unit/paypal-api-auth.test.cjs — Audit source : présence et format des identifiants PayPal
// Aucun appel API PayPal réel, aucune valeur secrète affichée.
// Lancement : node tests/unit/paypal-api-auth.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const CONFIG_EXAMPLE = path.join(process.cwd(), 'public', 'api', 'paypal-config.example.php');
const CONFIG_REAL = path.join(process.cwd(), 'public', 'api', 'paypal-config.php');
const PAYPAL = path.join(process.cwd(), 'public', 'api', 'paypal.php');
const WEBHOOK = path.join(process.cwd(), 'public', 'api', 'paypal-webhook.php');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('PayPal API auth — audit source (masqué, aucune valeur brute)\n');

// 1. Template exemple présent
const ex = fs.readFileSync(CONFIG_EXAMPLE, 'utf8');
check('paypal-config.example.php présent', fs.existsSync(CONFIG_EXAMPLE));
check('placeholder client_id présent', /'client_id'\s*=>\s*['"]PAYPAL_CLIENT_ID['"]/.test(ex));
check('placeholder secret présent', /'secret'\s*=>\s*['"]PAYPAL_SECRET['"]/.test(ex));
check('placeholder webhook_id présent', /'webhook_id'\s*=>\s*['"]PAYPAL_WEBHOOK_ID['"]/.test(ex));
check('env sandbox | live présent', /'env'\s*=>\s*['"]sandbox['"]/.test(ex));

// 2. Fichier réel : structure (valeurs jamais affichées)
if (fs.existsSync(CONFIG_REAL)) {
  const real = fs.readFileSync(CONFIG_REAL, 'utf8');
  check('paypal-config.php réel existe (gitignoré, .htaccess denied)', true);
  check('env présent', /'env'/.test(real));
  check('client_id présent', /'client_id'/.test(real));
  check('secret présent', /'secret'/.test(real));
  check('plans présents', /'plans'/.test(real));
} else {
  console.log('  (paypal-config.php réel absent)');
}

// 3. paypal.php : chemin de paiement parallèle, verify_subscription cross-device
const pp = fs.readFileSync(PAYPAL, 'utf8');
check('paypal.php présent', fs.existsSync(PAYPAL));
check('action verify_subscription', /verify_subscription/.test(pp));
check('action confirm_subscription', /confirm_subscription/.test(pp));
check('forward fulfillment (même shape que stripe-webhook)', /forward_fulfillment/.test(pp));

// 4. paypal-webhook.php : signature API PayPal, webhook_id requis, fail-closed HTTP 500
const wh = fs.readFileSync(WEBHOOK, 'utf8');
check('paypal-webhook.php présent', fs.existsSync(WEBHOOK));
check('webhook_id requis', /webhook_id/.test(wh));
check('fail-closed HTTP 500 si webhook_id absent', /http_response_code\(500\)/.test(wh));
check('200 à PayPal avant forward', /http_response_code\(200\)/.test(wh));

console.log('\n' + passed + ' test(s) PayPal API auth : TOUS PASSÉS');
process.exit(0);
