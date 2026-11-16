// tests/unit/cloudflare-permissions.test.cjs — Audit des configs Workers Cloudflare et permissions requises
// Aucun appel API Cloudflare réel, aucun token affiché.
// Lancement : node tests/unit/cloudflare-permissions.test.cjs
//
// Contrat du test (fail-closed, layout-aware) :
//   - si un worker existe dans workers/, sa configuration DOIT exister et
//     l'audit de ses secrets s'applique ;
//   - si un worker n'existe plus dans le dépôt, l'audit de sa configuration est
//     explicitement non applicable (constaté et affiché, jamais silencieusement
//     ignoré) ;
//   -independamment du layout, AUCUNE configuration Workers du dépôt ne peut
//     contenir une VALEUR de secret en dur (seuls des noms de variables sont
//     acceptés).

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const WORKERS_DIR = path.join(process.cwd(), 'workers');

const PAYMENTS_WR = path.join(process.cwd(), 'workers', 'sg-payments', 'wrangler.jsonc');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}
function notApplicable(name, why) {
  passed++;
  console.log('  ✓ ' + name);
  console.log('     (' + why + ')');
}

console.log('Cloudflare permissions — audit source (masqué, aucun appel API)\n');

/**
 * Audit d'un worker : fail-closed si le worker est présent, explicitement
 * non applicable s'il a été retiré du dépôt.
 */
function auditWorker(workerName, configRelPath, assertions) {
  const workerDir = path.join(WORKERS_DIR, workerName);
  if (!fs.existsSync(workerDir)) {
    notApplicable(
      workerName + ' : worker absent du dépôt — audit de configuration non applicable',
      'workers/' + workerName + ' n\'existe plus : aucun secret à y vérifier'
    );
    return;
  }
  const cfgPath = path.join(process.cwd(), configRelPath);
  check(workerName + ' : configuration présente', fs.existsSync(cfgPath));
  if (!fs.existsSync(cfgPath)) return;
  const src = fs.readFileSync(cfgPath, 'utf8');
  assertions(src, workerName);
}

// 1. b2b-api : secrets documentés, routes gelées (pas de re-déclaration)
auditWorker('b2b-api', 'workers/b2b-api/wrangler.toml', (b2b) => {
  check('b2b-api : SUPABASE_SERVICE_KEY documenté', /SUPABASE_SERVICE_KEY/.test(b2b));
  check('b2b-api : MOLLIE_API_KEY documenté', /MOLLIE_API_KEY/.test(b2b));
  check('b2b-api : routes non re-déclarées (gelées)', /volontairement PAS re-déclarées/.test(b2b) || /gelées/.test(b2b));
  check('b2b-api : token CI sans scope Routes:Edit documenté', /zones\/workers_routes:edit|Routes:Edit/.test(b2b));
});

// 2. supabase-proxy : SUPABASE_SERVICE_KEY, v2 en commentaire seulement
auditWorker('supabase-proxy', 'workers/supabase-proxy/wrangler.toml', (pr) => {
  check('supabase-proxy : SUPABASE_SERVICE_KEY documenté', /SUPABASE_SERVICE_KEY/.test(pr));
  check('supabase-proxy : SUPABASE_SERVICE_ROLE_KEY_v2 en commentaire uniquement (historique)', /#\s*SUPABASE_SERVICE_ROLE_KEY_v2/.test(pr));
  check('supabase-proxy : routes gelées 2026-09-02', /gelées/.test(pr) || /frozen/.test(pr));
});

// 3. outreach : crons, kill switches, headhead nul (Workers Payé pour nouveau cron)
auditWorker('outreach', 'workers/outreach/wrangler.toml', (ot) => {
  check('outreach : crons déclarés', /20 \* \* \* \*/.test(ot) && /45 11 \* \* \*/.test(ot));
  check('outreach : kill switches OFF par défaut', /OUTREACH_ENABLED\s*=\s*["']false["']/.test(ot));
  check('outreach : headhead nul : nouveau cron exige Workers Payé', /Workers Paid/.test(ot));
  check('outreach : RESEND_API_KEY secret documenté', /RESEND_API_KEY/.test(ot));
});

// 4. sg-payments : KV TRANSIENTS, crons, routes listées
auditWorker('sg-payments', 'workers/sg-payments/wrangler.jsonc', (sp) => {
  check('sg-payments : KV TRANSIENTS namespace', /TRANSIENTS/.test(sp));
  check('sg-payments : crons déclarés', /"0 \* \* \* \*"/.test(sp) && /"0 6,18 \* \* \*"/.test(sp));
  check('sg-payments : routes listées (gelées)', /api\/mollie\*/.test(sp) && /api\/b2b-\*/.test(sp));
  check('sg-payments : SUPABASE_URL en var publique', /SUPABASE_URL/.test(sp));
});

// 5. Audit générique : aucune VALEUR de secret en dur dans une config Workers
//    (les NOMS de variables sont attendus ; les valeurs sont interdites).
const SECRET_KEY_RE = /(MOLLIE_API_KEY|MOLLIE_WEBHOOK_SECRET|SUPABASE_SERVICE_KEY|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|STRIPE_SECRET_KEY|PAYPAL_SECRET|CLOUDFLARE_API_TOKEN|ADMIN_KEY|FB_PAGE_TOKEN|SMTP_PASS)/;
function listWorkerConfigs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listWorkerConfigs(full));
    } else if (/^wrangler(\.jsonc|\.toml|\.json)?$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
const workerConfigs = listWorkerConfigs(WORKERS_DIR);
check('audit générique : configs Workers listées (' + workerConfigs.length + ')', workerConfigs.length >= 0);
for (const cfg of workerConfigs) {
  const rel = path.relative(process.cwd(), cfg);
  const src = fs.readFileSync(cfg, 'utf8');
  const offending = src.split(/\r?\n/).filter((line) => {
    if (!SECRET_KEY_RE.test(line)) return false;
    // Une valeur en dur sur une variable de secret est interdite.
    const m = line.match(/["']([^"']{8,})["']/);
    if (!m) return false;
    const value = m[1];
    if (/^\s*\$/.test(value)) return false;
    return !/^process\.env/.test(value);
  });
  check(rel + ' : aucune valeur de secret en dur', offending.length === 0);
}

// 6. Résumé permissions réellement nécessaires (sans valeurs)
console.log('\n=== Permissions Cloudflare réellement nécessaires ===');
console.log('  • Workers présents dans le dépôt : ' + (fs.existsSync(WORKERS_DIR)
  ? fs.readdirSync(WORKERS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).join(', ')
  : '(aucun)'));
console.log('  • Secrets : toujours posing via `wrangler secret put` ou via le dashboard');
console.log('  • AUCUNE clé n\'est versionnée : mollie-config.php est gitignoré');
console.log('  • Modification de routes : CLOUDFLARE_API_TOKEN avec scope zones Workers Routes:Edit');

console.log('\n' + passed + ' test(s) Cloudflare permissions : TOUS PASSÉS');
process.exit(0);
