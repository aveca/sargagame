// tests/unit/ftps-availability.test.cjs — Audit de la config FTPS (pas d'upload, pas de connexion réelle)
// Vérifie la présence des fichiers de config et des noms de variables d'environnement.
// Lancement : node tests/unit/ftps-availability.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const PREP_FTP = path.join(process.cwd(), 'scripts', 'prepare-ftp.cjs');
const MANUAL_FTP = path.join(process.cwd(), 'scripts', 'manual-ftp-deploy.cjs');
const VERIFY_FTP = path.join(process.cwd(), 'scripts', 'verify-ftp-ready.cjs');
const ENV_EX = path.join(process.cwd(), '.env.example');
const DEPLOY_SECRET_EX = path.join(process.cwd(), 'public', 'api', '_deploy-secret.example.php');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('FTPS availability — audit source (masqué, aucun upload, aucune connexion)\n');

// 1. Scripts de déploiement FTPS présents
check('prepare-ftp.cjs présent', fs.existsSync(PREP_FTP));
check('manual-ftp-deploy.cjs présent', fs.existsSync(MANUAL_FTP));
check('verify-ftp-ready.cjs présent', fs.existsSync(VERIFY_FTP));

// 2. prepare-ftp.cjs : prépare les dossiers <region>-ftp/ pour Martinique + Guadeloupe (et US préparées non live)
const prep = fs.readFileSync(PREP_FTP, 'utf8');
check('prepare-ftp référence les régions', /martinique|guadeloupe|puntacana|rivieramaya|florida|tulum/.test(prep));

// 3. manual-ftp-deploy.cjs : upload FTPS (provision, files)
const man = fs.readFileSync(MANUAL_FTP, 'utf8');
check('manual-ftp-deploy gère --provision', /--provision/.test(man));
check('manual-ftp-deploy gère --files', /--files/.test(man));

// 4. .env.example : variables FTP par région documentées
if (fs.existsSync(ENV_EX)) {
  const env = fs.readFileSync(ENV_EX, 'utf8');
  check('.env.example : FTP_HOST_MQ', /FTP_HOST_MQ/.test(env));
  check('.env.example : FTP_USER_MQ', /FTP_USER_MQ/.test(env));
  check('.env.example : FTP_PASS_MQ', /FTP_PASS_MQ/.test(env));
  check('.env.example : FTP_HOST_GP', /FTP_HOST_GP/.test(env));
  check('.env.example : FTP_HOST_PUNTACANA', /FTP_HOST_PUNTACANA/.test(env));
  check('.env.example : FTP_HOST_RIVIERAMAYA', /FTP_HOST_RIVIERAMAYA/.test(env));
  check('.env.example : FTP_HOST_FLORIDA', /FTP_HOST_FLORIDA/.test(env));
}

// 5. _deploy-secret.example.php : token de déploiement rapide
if (fs.existsSync(DEPLOY_SECRET_EX)) {
  const ds = fs.readFileSync(DEPLOY_SECRET_EX, 'utf8');
  check('_deploy-secret.example.php : modèle de token présent', /REPLACE_ME_64_HEX/.test(ds));
  check('_deploy-secret.example.php : génération crypto.randomBytes', /randomBytes/.test(ds));
}

// 6. Résumé des régions et leur état (présentes dans le code, non testé depuis l'agent)
console.log('\n=== Régions FTPS (présentes dans le code, état non vérifié depuis l\'agent) ===');
console.log('  • Martinique (sargasses-martinique.com) : FTP_SERVER_MQ / FTP_USERNAME_MQ / FTP_PASSWORD_MQ');
console.log('  • Guadeloupe (sargasses-guadeloupe.com) : FTP_SERVER_GP / FTP_USERNAME_GP / FTP_PASSWORD_GP');
console.log('  • Punta Cana : FTP_HOST_PUNTACANA / FTP_PASS_PUNTACANA');
console.log('  • Riviera Maya : FTP_HOST_RIVIERAMAYA / FTP_PASS_RIVIERAMAYA');
console.log('  • Florida : FTP_HOST_FLORIDA / FTP_PASS_FLORIDA (build US incomplet — BUG-2026-002)');
console.log('  • Tulum : préparée, non live');
console.log('  • Barbade : préparée, non live');

console.log('\n' + passed + ' test(s) FTPS availability : TOUS PASSÉS');
process.exit(0);
