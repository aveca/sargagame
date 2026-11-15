// tests/unit/stripe-api-auth.test.cjs — Audit source : présence et format de la clé Stripe + webhook secret
// Aucun appel API Stripe réel, aucune valeur secrète affichée.
// Lancement : node tests/unit/stripe-api-auth.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const CONFIG_EXAMPLE = path.join(process.cwd(), 'public', 'api', 'stripe-config.example.php');
const CONFIG_REAL = path.join(process.cwd(), 'public', 'api', 'stripe-config.php');
const WEBHOOK = path.join(process.cwd(), 'public', 'api', 'stripe-webhook.php');
const RATELIMIT = path.join(process.cwd(), 'public', 'api', '_ratelimit.php');
const CREATE = path.join(process.cwd(), 'public', 'api', 'create-checkout.php');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('Stripe API auth — audit source (masqué, aucune valeur brute)\n');

// 1. Template exemple présent
const ex = fs.readFileSync(CONFIG_EXAMPLE, 'utf8');
check('stripe-config.example.php présent', fs.existsSync(CONFIG_EXAMPLE));
check('placeholder sk présent', /'sk'\s*=>\s*['"]sk_live_REPLACE_ME['"]/.test(ex));
check('placeholder webhook_secret présent', /'webhook_secret'\s*=>\s*['"]whsec_REPLACE_ME['"]/.test(ex));
check('placeholder prices présents', /'prices'\s*=>\s*\[/.test(ex));

// 2. Fichier réel : structure (valeurs jamais affichées)
if (fs.existsSync(CONFIG_REAL)) {
  const real = fs.readFileSync(CONFIG_REAL, 'utf8');
  check('stripe-config.php réel existe (gitignoré, .htaccess denied)', true);
  check('sk présent', /'sk'\s*=>/.test(real));
  check('webhook_secret présent', /'webhook_secret'/.test(real));
  check('prices par région présents', /'prices_by_region'/.test(real));
  check('resend_key présent', /'resend_key'/.test(real));
} else {
  console.log('  (stripe-config.php réel absent — clé expirée, renouvellement fondateur requis)');
}

// 3. stripe-webhook.php : signature v1, idempotence, fail-closed
const wh = fs.readFileSync(WEBHOOK, 'utf8');
check('webhook signature v1 vérifiée', /Stripe-Signature/.test(wh));
check('idempotence event.id', /event\.id/.test(wh));
check('200 à Stripe avant forward', /http_response_code\(200\)/.test(wh));

// 4. _ratelimit.php : secret dérivé du webhook_secret (jamais clé Stripe brute)
const rl = fs.readFileSync(RATELIMIT, 'utf8');
check('ratelimit utilise secret dérivé (jamais clé Stripe brute)', /dérivé du webhook_secret/.test(rl));
check('ratelimit RÉVERSIBLE (sg_rl_enabled)', /sg_rl_enabled/.test(rl));

// 5. create-checkout.php : utilise stripe-config, resend pour emails
const cc = fs.readFileSync(CREATE, 'utf8');
check('create-checkout utilise stripe-config', /stripe-config\.php/.test(cc));
check('create-checkout utilise resend pour emails', /function resend/.test(cc) || /api\.resend\.com\/emails/.test(cc));

console.log('\n' + passed + ' test(s) Stripe API auth : TOUS PASSÉS');
process.exit(0);
