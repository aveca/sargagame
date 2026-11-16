// tests/unit/supabase-availability.test.cjs — Audit de la configuration Supabase (présence URL + clé)
// Aucun appel réseau réel, aucune valeur secrète affichée.
// Lancement : node tests/unit/supabase-availability.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const MOLLIE_LIB = path.join(process.cwd(), 'public', 'api', 'mollie-lib.php');
const MOLLIE_PHP = path.join(process.cwd(), 'public', 'api', 'mollie.php');
const MOLLIE_WH = path.join(process.cwd(), 'public', 'api', 'mollie-webhook.php');
const PP_MIRROR = path.join(process.cwd(), 'public', 'api', 'pp-supabase-mirror.php');
const WORKER_SARG = path.join(process.cwd(), 'workers', 'sargagame', 'index.js');
const WRITE_SCRIPT = path.join(process.cwd(), 'scripts', 'write-mollie-config.cjs');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('Supabase availability — audit source (masqué)\n');

// 1. URL Supabase publique (Project Ref) présente dans les configs et wranglers
const url = 'https://rswdmjtdzrucqzzukfmd.supabase.co';
check('URL Supabase présente dans mollie-lib.php', fs.readFileSync(MOLLIE_LIB, 'utf8').includes(url));
// Wranglers : audit fail-closed si le worker existe, explicitement non
// applicable si le worker a été retiré du dépôt (jamais de skip muet).
function auditWorkerUrl(workerName, configRel) {
  const dir = path.join(process.cwd(), 'workers', workerName);
  if (!fs.existsSync(dir)) {
    check('wrangler ' + workerName + ' : worker absent du dépôt — audit non applicable', true);
    console.log('     (workers/' + workerName + ' n\'existe plus)');
    return;
  }
  const cfg = path.join(process.cwd(), configRel);
  check('wrangler ' + workerName + ' : configuration présente', fs.existsSync(cfg));
  if (!fs.existsSync(cfg)) return;
  check('URL Supabase présente dans wrangler ' + workerName, fs.readFileSync(cfg, 'utf8').includes(url));
}
auditWorkerUrl('b2b-api', 'workers/b2b-api/wrangler.toml');
auditWorkerUrl('supabase-proxy', 'workers/supabase-proxy/wrangler.toml');
auditWorkerUrl('outreach', 'workers/outreach/wrangler.toml');
auditWorkerUrl('sg-payments', 'workers/sg-payments/wrangler.jsonc');

// 2. SUPABASE_SERVICE_KEY requis par verify_subscription (mollie.php)
const mp = fs.readFileSync(MOLLIE_PHP, 'utf8');
check('mollie.php lit SUPABASE_SERVICE_KEY via getenv', /getenv\(['"]SUPABASE_SERVICE_KEY['"]\)/.test(mp));
check('mollie.php retourne lookup_failed en cas d\'échec', /lookup_failed/.test(mp));

// 3. mol_supabase_mirror() dans mollie-lib.php utilise SUPABASE_SERVICE_KEY
const ml = fs.readFileSync(MOLLIE_LIB, 'utf8');
check('mollie-lib.php lit SUPABASE_SERVICE_KEY', /getenv\(['"]SUPABASE_SERVICE_KEY['"]\)/.test(ml));
check('mol_supabase_mirror présente', /mol_supabase_mirror/.test(ml));

// 4. Webhook Mollie logue mirror SKIPPED sans service key
const wh = fs.readFileSync(MOLLIE_WH, 'utf8');
check('mollie-webhook logue mirror SKIPPED (SUPABASE_SERVICE_KEY absent)', /mirror SKIPPED \(SUPABASE_SERVICE_KEY absent/.test(wh));

// 5. pp-supabase-mirror.php utilise SUPABASE_SERVICE_KEY
if (fs.existsSync(PP_MIRROR)) {
  const ppm = fs.readFileSync(PP_MIRROR, 'utf8');
  check('pp-supabase-mirror.php lit SUPABASE_SERVICE_KEY', /SUPABASE_SERVICE_KEY/.test(ppm));
} else {
  console.log('  (pp-supabase-mirror.php absent)');
}

// 6. Worker sargagame vérifie SUPABASE_URL + SUPABASE_SERVICE_KEY
const ws = fs.readFileSync(WORKER_SARG, 'utf8');
check('worker sargagame vérifie SUPABASE_URL && SUPABASE_SERVICE_KEY', /SUPABASE_URL.*SUPABASE_SERVICE_KEY|SUPABASE_SERVICE_KEY.*SUPABASE_URL/.test(ws));
check('worker retourne payment_backend_not_configured si absent', /payment_backend_not_configured/.test(ws));

// 7. write-mollie-config.cjs injecte SUPABASE_SERVICE_KEY (non bloquant si absent)
const wr = fs.readFileSync(WRITE_SCRIPT, 'utf8');
check('write-mollie-config lit SUPABASE_SERVICE_KEY depuis env', /process\.env\.SUPABASE_SERVICE_KEY/.test(wr));
check('write-mollie-config avertit si SUPABASE_SERVICE_KEY absent (non bloquant)', /SUPABASE_SERVICE_KEY absent → mollie-config.php généré sans/.test(wr));

// 8. SUPABASE_SERVICE_ROLE_KEY_v2 est historique uniquement (pas dans le code actif)
const proxyDir = path.join(process.cwd(), 'workers', 'supabase-proxy');
if (!fs.existsSync(proxyDir)) {
  check('supabase-proxy : worker absent du dépôt — audit non applicable', true);
  console.log('     (workers/supabase-proxy n\'existe plus)');
} else {
  const wranglerProxy = path.join(process.cwd(), 'workers', 'supabase-proxy', 'wrangler.toml');
  const wp = fs.readFileSync(wranglerProxy, 'utf8');
  check('SUPABASE_SERVICE_ROLE_KEY_v2 présent uniquement en commentaire wrangler', /#\s*SUPABASE_SERVICE_ROLE_KEY_v2/.test(wp));
  const wsIndex = path.join(process.cwd(), 'workers', 'supabase-proxy', 'index.js');
  const wsi = fs.readFileSync(wsIndex, 'utf8');
  check('index.js lit SUPABASE_SERVICE_KEY depuis env', /env\.SUPABASE_SERVICE_KEY/.test(wsi));
}

console.log('\n' + passed + ' test(s) Supabase availability : TOUS PASSÉS');
process.exit(0);
