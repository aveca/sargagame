// tests/unit/secret-manager.test.cjs — SecretManager : tests de coffre (sans valeurs secrètes)
// Lancement : node tests/unit/secret-manager.test.cjs
// Prérequis : .vault/ initialisé (secret-manager setup) ou MASTER_PASS défini

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const assert = require('node:assert');

const SM = path.join(process.cwd(), 'scripts', 'secret-manager.mjs');
const VAULT_DIR = path.join(process.cwd(), '.vault');
const VAULT_FILE = path.join(VAULT_DIR, 'secrets.enc.json');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

function runSM(args, env) {
  const fullEnv = { ...process.env, ...(env || {}) };
  try {
    const out = execSync('node ' + SM + ' ' + args.join(' '), { encoding: 'utf8', env: fullEnv, windowsHide: true });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: e.stdout ? e.stdout.toString() : '', err: e.stderr ? e.stderr.toString() : '' };
  }
}

console.log('SecretManager — tests de coffre (masqué, aucune valeur brute)\n');

// --- 1. Setup / initialisation du coffre -----------------------------------
console.log('1. Initialisation du coffre');
const rSetup = runSM(['setup'], { MASTER_PASS: 'test-master-pass-sm' });
check('setup exit 0', rSetup.code === 0);
check('setup crée .vault/secrets.enc.json', fs.existsSync(VAULT_FILE));
check('setup crée .vault/.master', fs.existsSync(path.join(VAULT_DIR, '.master')));

// --- 2. Ajout / lecture masquée (jamais de valeur brute) -------------------
console.log('\n2. Ajout et lecture masquée');
const rAdd = runSM(['add', 'mollie', 'api_key', 'test_provision_only_do_not_use']);
check('add exit 0', rAdd.code === 0);
check('add affiche masqué (pas de valeur brute)', !rAdd.out.includes('test_provision_only_do_not_use'));
check('add affiche préfixe', rAdd.out.includes('test_'));

const rGet = runSM(['get', 'mollie', 'api_key']);
check('get exit 0', rGet.code === 0);
check('get affiche masqué', rGet.out.includes('••••••••'));
check('get ne révèle jamais la valeur brute', !rGet.out.includes('test_provision_only_do_not_use'));

// --- 3. Liste (état masqué) -----------------------------------------------
console.log('\n3. Liste des entrées (masqué)');
const rList = runSM(['list']);
check('list exit 0', rList.code === 0);
check('list affiche mollie', rList.out.includes('mollie'));
check('list affiche api_key masqué', rList.out.includes('api_key'));

// --- 4. Suppression --------------------------------------------------------
console.log('\n4. Suppression d\'entrée');
const rDel = runSM(['delete', 'mollie', 'api_key']);
check('delete exit 0', rDel.code === 0);
const rGetAfter = runSM(['get', 'mollie', 'api_key']);
check('get après delete -> ABSENT', rGetAfter.out.includes('ABSENT'));

// --- 5. Persistance après recharge (simule redémarrage) -------------------
console.log('\n5. Persistance après recharge (simule redémarrage)');
const rTestVault = runSM(['test-vault']);
check('test-vault exit 0', rTestVault.code === 0);
check('test-vault rapporte PERSISTANCE OK', rTestVault.out.includes('PERSISTANCE OK'));

// --- 6. Status JSON (CI-lisible, masqué) ----------------------------------
console.log('\n6. Status JSON (masqué, CI-lisible)');
const rStatus = runSM(['status']);
check('status exit 0', rStatus.code === 0);
const status = JSON.parse(rStatus.out.trim());
check('status a une clé providers', typeof status.providers === 'object');
check('status a une clé missing', Array.isArray(status.missing));
check('status ne contient aucune valeur brute', !/test_provision_only_do_not_use/.test(rStatus.out));

// --- 7. Aucun secret durci dans le script lui-même ------------------------
console.log('\n7. Hygiène du script SecretManager');
const src = fs.readFileSync(SM, 'utf8');
check('pas de valeur secrète en dur dans le script', !/(sk_live_[A-Za-z0-9]{20,}|live_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{16,}|test_[A-Za-z0-9]{20,})/.test(src));

console.log(`\n${passed} test(s) SecretManager : TOUS PASSÉS`);
process.exit(0);
