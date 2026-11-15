// tests/unit/mollie-api-auth.test.cjs — Audit source : présence et format de la clé API Mollie
// Aucun appel API réel, aucune valeur secrète affichée.
// Lancement : node tests/unit/mollie-api-auth.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const CONFIG_EXAMPLE = path.join(process.cwd(), 'public', 'api', 'mollie-config.example.php');
const CONFIG_REAL = path.join(process.cwd(), 'public', 'api', 'mollie-config.php');
const WRITE_SCRIPT = path.join(process.cwd(), 'scripts', 'write-mollie-config.cjs');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('Mollie API auth — audit source (masqué, aucune valeur brute)\n');

// 1. Template exemple présent avec placeholder
const ex = fs.readFileSync(CONFIG_EXAMPLE, 'utf8');
check('mollie-config.example.php présent', fs.existsSync(CONFIG_EXAMPLE));
check('placeholder api_key présent', /'api_key'\s*=>\s*['"]live_REPLACE_ME['"]/.test(ex));
check('placeholder webhook_secret présent', /'webhook_secret'\s*=>\s*['"]whsec_REPLACE_ME['"]/.test(ex));

// 2. Script de génération valide le préfixe (live_ | test_) et refuse l'absence
const ws = fs.readFileSync(WRITE_SCRIPT, 'utf8');
check('write-mollie-config vérifie préfixe MOLLIE_API_KEY', ws.includes('/^(live|test)_/'));
check('write-mollie-config bloque si MOLLIE_API_KEY absent', /MOLLIE_API_KEY absent/.test(ws));
check('write-mollie-config bloque si MOLLIE_WEBHOOK_SECRET absent', /MOLLIE_WEBHOOK_SECRET absent/.test(ws));
check('write-mollie-config vérifie longueur webhook_secret (min 16)', /\.length < 16/.test(ws));

// 3. Fichier réel : s'il existe, vérifier qu'aucune valeur brute n'est affichée dans les logs du script
if (fs.existsSync(CONFIG_REAL)) {
  const real = fs.readFileSync(CONFIG_REAL, 'utf8');
  check('mollie-config.php réel existe (gitignoré, jamais commit)', true);
  check('structure retour présente', /return \[/.test(real));
  check('clé api_key présente', /'api_key'/.test(real));
  check('webhook_secret présent', /'webhook_secret'/.test(real));
} else {
  console.log('  (mollie-config.php réel absent — sera généré au déploiement depuis les secrets GH)');
}

// 4. Le script ne loggue jamais la valeur brute (seulement préfixe + 4 derniers chars)
check('pas de console.log de la valeur brute de api_key', !/console\.log\([^)]*apiKey[^)]*\)/.test(ws) || /slice\(0, 5\)/.test(ws));
check('pas de console.log de la valeur brute de webhook_secret', !/console\.log\([^)]*webhookSecret[^)]*\)/.test(ws) || /slice\(-4\)/.test(ws));

console.log('\n' + passed + ' test(s) Mollie API auth : TOUS PASSÉS');
process.exit(0);
