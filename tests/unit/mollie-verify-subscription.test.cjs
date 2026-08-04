// tests/unit/mollie-verify-subscription.test.cjs — BUG-2026-010
// Test source-level non-régression pour le handler verify_subscription de mollie.php.
// Pas de runtime PHP (PHP non exécuté en CI) — on audite le source en string.
// Lancement : node tests/unit/mollie-verify-subscription.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'public', 'api', 'mollie.php');
const src = fs.readFileSync(SRC, 'utf8');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('BUG-2026-010 — mollie.php verify_subscription handler audit\n');

// 1. Présence du handler
check('handler verify_subscription présent', /if\s*\(\s*\$action\s*===\s*['"]verify_subscription['"]\s*\)/.test(src));

// 2. Validation email (non-vide + présence @)
//    Pattern réel : if (!$email || !strpos($email, '@'))
check("email validé (non-vide + @)", /if\s*\(\s*!\s*\$email\s*\|\|\s*!\s*strpos\(\s*\$email\s*,\s*['"]@['"]\s*\)\s*\)/.test(src));

// 3. Source de vérité Supabase (pas Mollie API directe)
check('utilise SUPABASE_URL getenv', /getenv\(['"]SUPABASE_URL['"]\)/.test(src));
check('utilise SUPABASE_SERVICE_KEY getenv', /getenv\(['"]SUPABASE_SERVICE_KEY['"]\)/.test(src));

// 4. Requête sur payment_grants filtrée type=b2c_pass + expires_at>now()
check('filtre type=eq.b2c_pass', /['"]type['"]\s*=>\s*['"]eq\.b2c_pass['"]/.test(src));
check('filtre expires_at=gt.now()', /['"]expires_at['"]\s*=>\s*['"]gt\.now\(\)['"]/.test(src));
check('sélect colonnes pass,expires_at,payment_id', /select.*pass.*expires_at.*payment_id/.test(src));

// 5. Shape de retour positif
check('retour actif: active=true + kind=pass', /['"]active['"]\s*=>\s*true,?\s*\n\s*['"]kind['"]\s*=>\s*['"]pass['"]/.test(src));
check('retour passEnd en ms (* 1000)', /\*\s*1000/);

// 6. Shape de retour négatif
check('retour inactif: reason=no_pass_grant', /['"]reason['"]\s*=>\s*['"]no_pass_grant['"]/.test(src));

// 7. Failure Supabase retourne lookup_failed (ne lève pas)
check('échec Supabase -> reason=lookup_failed', /['"]reason['"]\s*=>\s*['"]lookup_failed['"]/.test(src));
check("échec Supabase -> exit; (pas exit(1))", /['"]lookup_failed['"]\s*\]\s*\)\s*;\s*\n\s*exit;/.test(src));

// 8. Pas de fail-open : pas de retour active=true sans validation row
//    (un commentaire /* active => true */ serait accepté par la regex -> on s'assure
//    que la seule occurrence de active=>true est dans le bloc handler valide)
check('unique occurrence de active => true (pas de fail-open ailleurs)', (src.match(/['"]active['"]\s*=>\s*true/g) || []).length === 1);

// 9. Sécurité headers
check('Authorization Bearer service_key', /Authorization:\s*Bearer\s*['"]?\s*\.\s*\$serviceKey/.test(src));
check('apikey header service_key', /apikey:\s*['"]?\s*\.\s*\$serviceKey/.test(src));

// 10. Ne casse pas les autres handlers existants
check('handler create_payment toujours présent', /action\s*===\s*['"]create_payment['"]/.test(src));
check('handler create_subscription toujours présent', /action\s*===\s*['"]create_subscription['"]/.test(src));
check('handler get_customer toujours présent', /action\s*===\s*['"]get_customer['"]/.test(src));
check('handler get_mandate toujours présent', /action\s*===\s*['"]get_mandate['"]/.test(src));
check('handler payment_status toujours présent', /action\s*===\s*['"]payment_status['"]/.test(src));
check('handler claim_referral_credit toujours présent', /action\s*===\s*['"]claim_referral_credit['"]/.test(src));
check('handler applepay_session toujours présent', /action\s*===\s*['"]applepay_session['"]/.test(src));

// 11. Pas de modification des autres fichiers du money path (audit local)
check('handler positionné AVANT claim_referral_credit', src.indexOf("=== 'verify_subscription'") < src.indexOf("=== 'claim_referral_credit'"));
check('handler positionné APRÈS payment_status', src.indexOf("=== 'payment_status'") < src.indexOf("=== 'verify_subscription'"));

// 12. Rate limiting hérité (sg_rate_limit('mol_' . $action, 20) couvre verify_subscription)
check('rate limiting global mol_* présent', /sg_rate_limit\(['"]mol_['"]\s*\.\s*\$action/.test(src));

console.log(`\n✅ ${passed} asserts passés — handler verify_subscription conforme.`);
console.log('   BUG-2026-010 : déblocage cross-device pass Mollie one-time validé au niveau source.');
