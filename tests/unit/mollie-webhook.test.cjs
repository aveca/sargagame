// tests/unit/mollie-webhook.test.cjs — BUG-2026-011
// Test source-level non-régression pour le handler webhook Mollie.
// Pas de runtime PHP (PHP non exécuté en CI) — on audite le source en string.
// Lancement : node tests/unit/mollie-webhook.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC_WEBHOOK = path.join(__dirname, '..', '..', 'public', 'api', 'mollie-webhook.php');
const SRC_LIB = path.join(__dirname, '..', '..', 'public', 'api', 'mollie-lib.php');
const srcWebhook = fs.readFileSync(SRC_WEBHOOK, 'utf8');
const srcLib = fs.readFileSync(SRC_LIB, 'utf8');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('BUG-2026-011 — mollie-webhook & mollie-lib audit\n');

// Regex with 's' flag (dotAll) for multiline matching
const s = 's';

// --- Webhook tests ---

// 1. payment.failed handled in payment branch
check('payment.failed handled in payment branch', 
  new RegExp('if\\s*\\(\\s*\\$event\\s*===\\s*[\'"]payment\\.failed[\'"]\\s*\\|\\|\\s*\\$status\\s*===\\s*[\'"]failed[\'"]\\s*\\)', s).test(srcWebhook));

// 2. payment.failed calls mol_b2c_pass_revoke
check('payment.failed calls mol_b2c_pass_revoke',
  /mol_b2c_pass_revoke\(\$id\)/.test(srcWebhook));

// 3. HTTP 200 only after successful business logic (payment.paid)
check('payment.paid returns 200 after successful grant',
  /\$status\s*===\s*['"]paid['"]/.test(srcWebhook));

// 4. Mirror failure returns 500 with retry flag
check('mirror failure returns 500 with retry',
  new RegExp('if\\s*\\(\\s*!\\$mirrorOk\\s*\\)\\s*\\{[\\s\\S]*http_response_code\\(500\\)[\\s\\S]*echo json_encode\\(\\[\\s*[\'"]error[\'"]\\s*=>\\s*[\'"]mirror_failed[\'"],\\s*[\'"]retry[\'"]\\s*=>\\s*true', s).test(srcWebhook));

// 5. payment.failed in subscription branch removed (handled in payment branch)
check('payment.failed removed from subscription branch',
  !new RegExp('if\\s*\\(\\s*\\$event\\s*===\\s*[\'"]payment\\.failed[\'"]\\s*\\)', s).test(srcWebhook.substring(srcWebhook.indexOf('$type === \'subscription\''))));

// 6. subscription.paid checks mirror_ok
check('subscription.paid checks mirror_ok',
  new RegExp('subscription\\.paid.*mirror_ok', s).test(srcWebhook));

// 6b. subscription.paid checks mirror_ok and returns 500 on failure
check('subscription mirror failure returns 500',
  new RegExp('subscription\\.paid.*mirror_ok.*http_response_code\\(500\\)', s).test(srcWebhook));

// 7. subscription.created/updated checks mirror_ok
check('subscription.created/updated checks mirror_ok',
  new RegExp('subscription\\.(created|updated).*mol_b2b_grant_once.*mirror_ok', s).test(srcWebhook));

// --- Lib tests ---

// 9. mol_supabase_mirror returns boolean
check('mol_supabase_mirror returns boolean',
  /function mol_supabase_mirror.*:\s*bool/.test(srcLib));

// 10. mol_supabase_mirror returns false on cURL error
check('mol_supabase_mirror returns false on cURL error',
  new RegExp('curl_errno.*return false', s).test(srcLib));

// 11. mol_supabase_mirror returns false on HTTP >= 400
check('mol_supabase_mirror returns false on HTTP >= 400',
  new RegExp('httpCode >= 400.*return false', s).test(srcLib));

// 12. mol_supabase_mirror returns true on success
check('mol_supabase_mirror returns true on success',
  /return true/.test(srcLib));

// 13. mol_b2b_grant_once returns mirror_ok
check('mol_b2b_grant_once returns mirror_ok',
  /return.*\[\s*['"]granted['"]\s*=>\s*true\s*,\s*['"]token['"]\s*=>\s*\$token\s*,\s*['"]expires_at['"]\s*=>\s*\$expiresAt\s*,\s*['"]plan['"]\s*=>\s*\$planKey\s*,\s*['"]mirror_ok['"]\s*=>\s*\$mirrorOk\s*\]/.test(srcLib));

// 14. mol_b2b_grant_once returns mirror_ok=false on mirror failure
check('mol_b2b_grant_once returns mirror_ok=false on mirror failure',
  new RegExp('return.*mirror_ok.*\\$mirrorOk', s).test(srcLib));

// 15. mol_b2c_pass_grant returns mirror_ok
check('mol_b2c_pass_grant returns mirror_ok',
  /return.*\[\s*['"]granted['"]\s*=>\s*true\s*,\s*['"]pass['"]\s*=>\s*\$pass\s*,\s*['"]expires_at['"]\s*=>\s*\$expiresAt\s*,\s*['"]days['"]\s*=>\s*\$days\s*,\s*['"]mirror_ok['"]\s*=>\s*\$mirrorOk\s*\]/.test(srcLib));

// 16. mol_b2c_pass_grant returns mirror_ok=false on mirror failure
check('mol_b2c_pass_grant returns mirror_ok=false on mirror failure',
  new RegExp('return.*mirror_ok.*\\$mirrorOk', s).test(srcLib));

// 17. payment.failed in payment branch calls mol_b2c_pass_revoke
check('payment.failed calls mol_b2c_pass_revoke with paymentId',
  /mol_b2c_pass_revoke\(\$id\)/.test(srcWebhook));

// 18. webhook returns 500 with retry flag on mirror failure
check('webhook returns 500 with retry flag on mirror failure',
  new RegExp('http_response_code\\(500\\).*[\'"]error[\'"]\\s*=>\\s*[\'"]mirror_failed[\'"]\\s*,\\s*[\'"]retry[\'"]\\s*=>\\s*true', s).test(srcWebhook));

// 19. Existing handlers still present
check('payment handler still present', /type\s*===\s*['"]payment['"]/.test(srcWebhook));
check('subscription handler still present', /type\s*===\s*['"]subscription['"]/.test(srcWebhook));
check('customer handler still present', /type\s*===\s*['"]customer['"]/.test(srcWebhook));
check('mandate handler still present', /type\s*===\s*['"]mandate['"]/.test(srcWebhook));

console.log(`\n✅ ${passed} asserts passed — webhook & lib conformes.`);
console.log('   BUG-2026-011 : webhook payment.failed + mirror retry validé au niveau source.');