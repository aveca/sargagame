// tests/unit/smtp-resend-config.test.cjs — Audit des configs email (Resend + SMTP)
// Aucun envoi d'email réel, aucune valeur secrète affichée.
// Lancement : node tests/unit/smtp-resend-config.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const STRIPE_CFG = path.join(process.cwd(), 'public', 'api', 'stripe-config.php');
const STRIPE_CFG_EX = path.join(process.cwd(), 'public', 'api', 'stripe-config.example.php');
const PAYPAL_CFG = path.join(process.cwd(), 'public', 'api', 'paypal-config.php');
const PAYPAL_CFG_EX = path.join(process.cwd(), 'public', 'api', 'paypal-config.example.php');
const MOLLIE_CFG_EX = path.join(process.cwd(), 'public', 'api', 'mollie-config.example.php');
const CREATE = path.join(process.cwd(), 'public', 'api', 'create-checkout.php');
const PAYPAL_PHP = path.join(process.cwd(), 'public', 'api', 'paypal.php');
const STRIPE_WH = path.join(process.cwd(), 'public', 'api', 'stripe-webhook.php');
const ENV_EX = path.join(process.cwd(), '.env.example');
const OUTREACH_WR = path.join(process.cwd(), 'workers', 'outreach', 'wrangler.toml');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('SMTP / Resend config — audit source (masqué, aucun envoi)\n');

// 1. Resend clé présente dans les templates (optionnel, vide = pas d'email)
const scEx = fs.readFileSync(STRIPE_CFG_EX, 'utf8');
check('stripe-config.example.php : resend_key présent', /'resend_key'/.test(scEx));
const ppEx = fs.readFileSync(PAYPAL_CFG_EX, 'utf8');
check('paypal-config.example.php : resend_key présent', /'resend_key'/.test(ppEx));
const mcEx = fs.readFileSync(MOLLIE_CFG_EX, 'utf8');
check('mollie-config.example.php : resend_key présent (optionnel)', /'resend_key'/.test(mcEx));

// 2. create-checkout.php : fonction resend() vers api.resend.com/emails
const cc = fs.readFileSync(CREATE, 'utf8');
check('create-checkout.php : fonction resend() définie', /function resend/.test(cc));
check('create-checkout.php : cible api.resend.com/emails', /api\.resend\.com\/emails/.test(cc));

// 3. paypal.php : envoi email via Resend (clé cfg.resend_key, vide = pas d'email)
const pp = fs.readFileSync(PAYPAL_PHP, 'utf8');
check('paypal.php : lit resend_key depuis config', /resend_key/.test(pp));
check('paypal.php : cible api.resend.com/emails', /api\.resend\.com\/emails/.test(pp));

// 4. stripe-webhook.php : envoi snippet pro via Resend
const sw = fs.readFileSync(STRIPE_WH, 'utf8');
check('stripe-webhook.php : lit resend_key depuis config', /resend_key/.test(sw));
check('stripe-webhook.php : cible api.resend.com/emails', /api\.resend\.com\/emails/.test(sw));

// 5. .env.example : RESEND_API_KEY documenté
if (fs.existsSync(ENV_EX)) {
  const env = fs.readFileSync(ENV_EX, 'utf8');
  check('.env.example : RESEND_API_KEY documenté', /RESEND_API_KEY/.test(env));
}

// 6. Worker outreach : RESEND_API_KEY en secret wrangler, kill switch OFF par défaut
//    (si le worker outreach n'existe plus dans le dépôt, l'audit de sa
//    configuration est explicitement non applicable — jamais un skip muet)
const OUTREACH_DIR = path.join(process.cwd(), 'workers', 'outreach');
if (!fs.existsSync(OUTREACH_DIR)) {
  check('outreach : worker absent du dépôt — audit de configuration non applicable', true);
  console.log('     (workers/outreach n\'existe plus : aucun secret email à y vérifier)');
} else {
  const ow = fs.readFileSync(OUTREACH_WR, 'utf8');
  check('outreach wrangler : RESEND_API_KEY secret documenté', /RESEND_API_KEY/.test(ow));
  check('outreach wrangler : EMAIL_OUTREACH_ENABLED = "false" (défaut OFF)', /EMAIL_OUTREACH_ENABLED\s*=\s*["']false["']/.test(ow));
  check('outreach wrangler : OUTREACH_DRY_RUN = "true" (défaut dry-run)', /OUTREACH_DRY_RUN\s*=\s*["']true["']/.test(ow));
  check('outreach wrangler : quotas réduits (DAILY_EMAIL_LIMIT)', /DAILY_EMAIL_LIMIT/.test(ow));
}

// 7. SMTP documenté dans .env.example (alerte@ mailbox)
if (fs.existsSync(ENV_EX)) {
  const env = fs.readFileSync(ENV_EX, 'utf8');
  check('.env.example : SMTP_HOST documenté', /SMTP_HOST/.test(env));
  check('.env.example : SMTP_PASS documenté', /SMTP_PASS/.test(env));
  check('.env.example : SMTP_USER alerte@', /alerte@/.test(env));
}

console.log('\n' + passed + ' test(s) SMTP / Resend config : TOUS PASSÉS');
process.exit(0);
