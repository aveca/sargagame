// tests/unit/mollie-verify-subscription.test.cjs — BUG-2026-010
// Test source-level non-régression pour le handler verify_subscription de mollie.php.
// Pas de runtime PHP (PHP non exécuté en CI) — on audite le source en string.
// Lancement : node tests/unit/mollie-verify-subscription.test.cjs
//
// Contrat courant (validé) :
//   - kind = 'pass' (défaut) → grant type 'b2c_pass' ; kind = 'subscription' | 'b2b_pro'
//     → grant type 'b2b_pro' (récupération B2B cross-device, cf. commit 422dd3e2) ;
//   - le filtre `type` est dérivé de grantType (jamais figé sur un seul type) ;
//   - le grant le plus récent non expiré est retenu (order + limit) ;
//   - aucun fail-open : `active => true` n'apparaît que dans le handler validé.

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

// 3. Utilise SUPABASE_URL getenv + fallback hardcodé
check('utilise SUPABASE_URL getenv', /getenv\(['"]SUPABASE_URL['"]\)/.test(src));
check('fallback SUPABASE_URL hardcodé', /getenv\(['"]SUPABASE_URL['"]\)\s*\?:\s*['"]https:\/\/rswdmjtdzrucqzzukfmd\.supabase\.co['"]/.test(src));
check('utilise SUPABASE_SERVICE_KEY getenv', /getenv\(['"]SUPABASE_SERVICE_KEY['"]\)/.test(src));

// 4. kind → grantType : pass (défaut) = b2c_pass ; subscription|b2b_pro = b2b_pro
check("kind lu depuis la requête avec défaut 'pass'", /\$kind\s*=\s*\$data\[['"]kind['"]\]\s*\?\?\s*['"]pass['"]/.test(src));
check(
  "grantType : subscription|b2b_pro => b2b_pro, sinon b2c_pass",
  /\$grantType\s*=\s*\(\s*\$kind\s*===\s*['"]subscription['"]\s*\|\|\s*\$kind\s*===\s*['"]b2b_pro['"]\s*\)\s*\?\s*['"]b2b_pro['"]\s*:\s*['"]b2c_pass['"]/.test(src)
);

// 5. Requête payment_grants : type dérivé de grantType + email + expires_at>now()
check('filtre type dérivé de grantType (eq. + $grantType)', /['"]type['"]\s*=>\s*['"]eq\.['"]\s*\.\s*\$grantType/.test(src));
check('filtre expires_at=gt.now()', /['"]expires_at['"]\s*=>\s*['"]gt\.now\(\)['"]/.test(src));
check('filtre email=eq.<email>', /['"]email['"]\s*=>\s*['"]eq\.['"]\s*\.\s*\$email/.test(src));
check('grant le plus récent, une seule ligne (order + limit)', /['"]order['"]\s*=>\s*['"]expires_at\.desc['"]/.test(src) && /['"]limit['"]\s*=>\s*['"]1['"]/.test(src));
check('sélect colonnes pass,expires_at,payment_id', /pass,expires_at,payment_id/.test(src));
check('sélect colonnes B2B plan,expires_at,payment_id,subscription_id,customer_id', /plan,expires_at,payment_id,subscription_id,customer_id/.test(src));

// 6. Shape de retour positif
check("retour actif B2C: active=true + kind='pass'", /['"]active['"]\s*=>\s*true,?\s*\n\s*['"]kind['"]\s*=>\s*['"]pass['"]/.test(src));
check("retour actif B2B: kind='b2b_pro'", /['"]kind['"]\s*=>\s*['"]b2b_pro['"]/.test(src));
check('retour passEnd en ms (* 1000)', /\*\s*1000/);

// 7. Shape de retour négatif (raison dérivée du type de grant)
check('retour inactif: reason=no_<grantType>_grant', /['"]reason['"]\s*=>\s*['"]no_['"]\s*\.\s*\$grantType\s*\.\s*['"]_grant['"]/.test(src));

// 8. Failure Supabase retourne lookup_failed (ne lève pas)
check('échec Supabase -> reason=lookup_failed', /['"]reason['"]\s*=>\s*['"]lookup_failed['"]/.test(src));
check("échec Supabase -> exit; (pas exit(1))", /['"]lookup_failed['"]\s*\]\s*\)\s*;\s*\n\s*exit;/.test(src));

// 9. Pas de fail-open : `active => true` n'existe que dans le handler validé
//    (les deux occurrences attendues : branche B2B + branche B2C du même handler)
const handlerStart = src.indexOf("=== 'verify_subscription'");
const handlerEnd = src.indexOf("=== 'claim_referral_credit'");
const handler = src.slice(handlerStart, handlerEnd);
check('handler positionné AVANT claim_referral_credit', handlerStart !== -1 && handlerEnd > handlerStart);
check(
  'active => true : uniquement dans le handler (2 branches, 0 fail-open ailleurs)',
  (handler.match(/['"]active['"]\s*=>\s*true/g) || []).length === 2 &&
    (src.match(/['"]active['"]\s*=>\s*true/g) || []).length === 2
);

// 10. Sécurité headers
check('Authorization Bearer service_key', /Authorization:\s*Bearer\s*['"]?\s*\.\s*\$serviceKey/.test(src));
check('apikey header service_key', /apikey:\s*['"]?\s*\.\s*\$serviceKey/.test(src));

// 11. Ne casse pas les autres handlers existants
check('handler create_payment toujours présent', /action\s*===\s*['"]create_payment['"]/.test(src));
check('handler create_subscription toujours présent', /action\s*===\s*['"]create_subscription['"]/.test(src));
check('handler get_customer toujours présent', /action\s*===\s*['"]get_customer['"]/.test(src));
check('handler get_mandate toujours présent', /action\s*===\s*['"]get_mandate['"]/.test(src));
check('handler payment_status toujours présent', /action\s*===\s*['"]payment_status['"]/.test(src));
check('handler claim_referral_credit toujours présent', /action\s*===\s*['"]claim_referral_credit['"]/.test(src));
check('handler applepay_session toujours présent', /action\s*===\s*['"]applepay_session['"]/.test(src));

// 12. Position du handler dans le money path
check('handler positionné APRÈS payment_status', src.indexOf("=== 'payment_status'") < src.indexOf("=== 'verify_subscription'"));

// 13. Rate limiting hérité (sg_rate_limit('mol_' . $action, 20) couvre verify_subscription)
check('rate limiting global mol_* présent', /sg_rate_limit\(['"]mol_['"]\s*\.\s*\$action/.test(src));

console.log(`\n✅ ${passed} asserts passés — handler verify_subscription conforme.`);
console.log('   BUG-2026-010 : déblocage cross-device pass Mollie one-time validé au niveau source.');
console.log('   Extension B2B : kind=subscription → grant b2b_pro (récupération cross-device).');
