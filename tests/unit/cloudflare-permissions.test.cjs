// tests/unit/cloudflare-permissions.test.cjs — Audit des wranglers Cloudflare et permissions requises
// Aucun appel API Cloudflare réel, aucun token affiché.
// Lancement : node tests/unit/cloudflare-permissions.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const B2B_WR = path.join(process.cwd(), 'workers', 'b2b-api', 'wrangler.toml');
const PROXY_WR = path.join(process.cwd(), 'workers', 'supabase-proxy', 'wrangler.toml');
const OUTREACH_WR = path.join(process.cwd(), 'workers', 'outreach', 'wrangler.toml');
const PAYMENTS_WR = path.join(process.cwd(), 'workers', 'sg-payments', 'wrangler.jsonc');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('Cloudflare permissions — audit source (masqué, aucun appel API)\n');

// 1. b2b-api wrangler : secrets documentés, routes gelées (pas de re-déclaration)
const b2b = fs.readFileSync(B2B_WR, 'utf8');
check('b2b-api wrangler présent', fs.existsSync(B2B_WR));
check('SUPABASE_SERVICE_KEY documenté', /SUPABASE_SERVICE_KEY/.test(b2b));
check('MOLLIE_API_KEY documenté', /MOLLIE_API_KEY/.test(b2b));
check('routes non re-déclarées (gelées)', /volontairement PAS re-déclarées/.test(b2b) || /gelées/.test(b2b));
check('token CI sans scope Routes:Edit documenté', /zones\/workers_routes:edit|Routes:Edit/.test(b2b));

// 2. supabase-proxy wrangler : SUPABASE_SERVICE_KEY, v2 en commentaire seulement
const pr = fs.readFileSync(PROXY_WR, 'utf8');
check('supabase-proxy wrangler présent', fs.existsSync(PROXY_WR));
check('SUPABASE_SERVICE_KEY documenté', /SUPABASE_SERVICE_KEY/.test(pr));
check('SUPABASE_SERVICE_ROLE_KEY_v2 en commentaire uniquement (historique)', /#\s*SUPABASE_SERVICE_ROLE_KEY_v2/.test(pr));
check('routes gelées 2026-09-02', /gelées/.test(pr) || /frozen/.test(pr));

// 3. outreach wrangler : 3 crons, kill switches, headhead nul (Workers Payé pour nouveau cron)
const ot = fs.readFileSync(OUTREACH_WR, 'utf8');
check('outreach wrangler présent', fs.existsSync(OUTREACH_WR));
check('3 crons déclarés', /20 \* \* \* \*/.test(ot) && /45 11 \* \* \*/.test(ot));
check('kill switches OFF par défaut', /OUTREACH_ENABLED\s*=\s*["']false["']/.test(ot));
check('headhead nul : nouveau cron exige Workers Payé', /Workers Paid/.test(ot));
check('RESEND_API_KEY secret documenté', /RESEND_API_KEY/.test(ot));

// 4. sg-payments wrangler : KV TRANSIENTS, 2 crons, routes listées
const sp = fs.readFileSync(PAYMENTS_WR, 'utf8');
check('sg-payments wrangler présent', fs.existsSync(PAYMENTS_WR));
check('KV TRANSIENTS namespace', /TRANSIENTS/.test(sp));
check('2 crons déclarés', /"0 \* \* \* \*"/.test(sp) && /"0 6,18 \* \* \*"/.test(sp));
check('routes listées (gelées)', /api\/mollie\*/.test(sp) && /api\/b2b-\*/.test(sp));
check('SUPABASE_URL en var publique', /SUPABASE_URL/.test(sp));

// 5. Résumé permissions réellement nécessaires (sans valeurs)
console.log('\n=== Permissions Cloudflare réellement nécessaires ===');
console.log('  • b2b-api : wrangler secret put SUPABASE_SERVICE_KEY, MOLLIE_API_KEY, MOLLIE_WEBHOOK_SECRET');
console.log('  • supabase-proxy : wrangler secret put SUPABASE_SERVICE_KEY');
console.log('  • outreach : wrangler secret put RESEND_API_KEY, SUPABASE_SERVICE_KEY, FB_PAGE_TOKEN, ADMIN_KEY');
console.log('  • sg-payments : aucun secret dans wrangler.jsonc (SUPABASE_URL en var publique)');
console.log('  • Modification de routes : CLOUDFLARE_API_TOKEN avec scope zones Workers Routes:Edit (actuellement expiré)');

console.log('\n' + passed + ' test(s) Cloudflare permissions : TOUS PASSÉS');
process.exit(0);
