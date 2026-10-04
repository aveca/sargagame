// tests/unit/worker-private-guard.test.cjs — garde _private fail-closed
// Contexte : /api/copernicus/_private/forecast-full.json (premium J+2-7) a été
// servi en clair sur *.workers.dev (constaté 2026-10-04). Cause racine : avec
// run_worker_first=false (défaut), les assets existants contournent le handler
// (même /api/.htaccess était lisible). Double barrière exigée :
//   1. public/.assetsignore exclut _private des uploads,
//   2. workers/sargagame/index.js refuse en code + wrangler.template.jsonc met
//      run_worker_first=true (sinon la garde ne s'exécute jamais).
// Lancement : node tests/unit/worker-private-guard.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'workers', 'sargagame', 'index.js'), 'utf8');
const TPL = fs.readFileSync(path.join(ROOT, 'wrangler.template.jsonc'), 'utf8');
const IGNORE = fs.readFileSync(path.join(ROOT, 'public', '.assetsignore'), 'utf8');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('WORKER-PRIVATE-GUARD — fail-closed _private/dotfiles/php\n');

// 1. Barrière code : refus /_private/
check('worker refuse /_private/', /\/_private\//.test(WORKER));

// 2. Refus dotfiles / .htaccess / .env / .php non migrés
check('worker refuse les dotfiles', /\\\.\[\^\/\]/.test(WORKER) || /\/\\\./.test(WORKER));
check('worker refuse .htaccess', /\.htaccess/.test(WORKER));
check('worker refuse .env', /\.env/.test(WORKER));
check('worker refuse .php non migré', /\\.php\$/.test(WORKER));

// 3. Refus neutre (pas de fuite d'info : pas de path renvoyé par la garde)
check('garde placée avant ASSETS.fetch', WORKER.indexOf('/_private/') < WORKER.lastIndexOf('env.ASSETS.fetch'));
check('refus neutre 404 (not_found, sans path)', /not_found/.test(WORKER));

// 3b. Allowlist statique publique (run_worker_first oblige : sans elle, les
// JSON publics casseraient — constaté : sargassum.json 404 après le 1er fix)
check('allowlist JSON publics via ASSETS', WORKER.includes('\\.json$'));
check('allowlist apple-pay-domain-association', WORKER.includes('/api/apple-pay-domain-association'));
check('allowlist placée avant le 404 api_route_not_migrated',
  WORKER.indexOf('\\.json$') < WORKER.indexOf('api_route_not_migrated'));

// 4. Handlers migrés préservés (le premium autorisé continue de fonctionner)
check('handler mollie.php POST préservé', /\/api\/mollie\.php/.test(WORKER));
check('handler mollie-webhook préservé', /mollie-webhook/.test(WORKER));
check('handler widget-token préservé', /widget-token/.test(WORKER));
check('handler b2b-trial préservé', /b2b-trial/.test(WORKER));
check('/api/ non migré toujours 404 explicite', /api_route_not_migrated/.test(WORKER));

// 5. run_worker_first=true (SANS ÇA, LA GARDE EST MORTE pour les assets existants)
check('wrangler.template run_worker_first=true', /"run_worker_first"\s*:\s*true/.test(TPL));

// 6. Barrière upload : _private exclu des assets
check('.assetsignore exclut _private', /^.*_private.*$/m.test(IGNORE));

console.log(`\n${passed} checks passed — private endpoint fail-closed, public paths intact.`);
