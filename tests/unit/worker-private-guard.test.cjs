// tests/unit/worker-private-guard.test.cjs — garde _private fail-closed
// Contexte : /api/copernicus/_private/forecast-full.json (premium J+2-7) a été
// servi en clair sur *.workers.dev (constaté 2026-10-04). Le contrat actuel
// utilise run_worker_first sélectif : API Copernicus publique + chemins premium.
// Tous les autres assets restent asset-first. .assetsignore exclut les fichiers
// privés du paquet ; la garde Worker renvoie aussi un 404 neutre si un chemin
// premium atteint le Worker.
// Lancement : node tests/unit/worker-private-guard.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'workers', 'sargagame', 'index.js'), 'utf8');
const TPL = fs.readFileSync(path.join(ROOT, 'wrangler.template.jsonc'), 'utf8');
const IGNORE = fs.readFileSync(path.join(ROOT, 'public', '.assetsignore'), 'utf8');
const DATA_REFRESH = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'data-refresh.yml'), 'utf8');
const DAILY_COPERNICUS = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'daily-copernicus.yml'), 'utf8');

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

// 5. Worker-first sélectif : freshness API + garde premium, sans Worker-first global.
check('wrangler.template Worker-first sélectif', /"run_worker_first"\s*:\s*\[/.test(TPL));
check('Worker-first route Copernicus publique', /"\/api\/copernicus\/sargassum\.json"/.test(TPL));
check('Worker-first route premium racine', /"\/api\/copernicus\/_private\/\*"/.test(TPL));
check('Worker-first routes premium régionales', /"\/api\/copernicus\/\*\/_private\/\*"/.test(TPL));
check('aucun Worker-first global', !/"run_worker_first"\s*:\s*true/.test(TPL));

// 6. Garde assets: règles exactes, pas une simple présence du mot "_private".
const IGNORE_RULES = new Set(IGNORE.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')));
const REQUIRED_IGNORE_RULES = ['**/*.php', '**/*.php.*', '**/.env*', '**/.htaccess', '**/.htpasswd', '**/_private/'];
for (const rule of REQUIRED_IGNORE_RULES) check('.assetsignore contient la règle exacte ' + rule, IGNORE_RULES.has(rule));

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const privateForecastPaths = tracked.filter((file) => /^public\/api\/copernicus\/(?:[^/]+\/)?_private\/forecast-full\.json$/.test(file));
check('aucun forecast-full privé suivi par Git', privateForecastPaths.length === 0);
check('data-refresh stages and activates private forecasts through FTPS', DATA_REFRESH.includes('PRIVATE_FORECAST_FTP_MODE: stage') && DATA_REFRESH.includes('PRIVATE_FORECAST_FTP_MODE: activate'));
check('daily-copernicus stages and activates private forecasts through FTPS', DAILY_COPERNICUS.includes('PRIVATE_FORECAST_FTP_MODE: stage') && DAILY_COPERNICUS.includes('PRIVATE_FORECAST_FTP_MODE: activate'));
check('data-refresh does not stage forecast-full.json in Git', !DATA_REFRESH.includes('forecast-full.json'));
check('daily-copernicus does not stage forecast-full.json in Git', !DAILY_COPERNICUS.includes('forecast-full.json'));
check('both refresh workflows invoke the private FTPS handoff', DATA_REFRESH.includes('scripts/upload-private-forecasts-ftp.cjs') && DAILY_COPERNICUS.includes('scripts/upload-private-forecasts-ftp.cjs'));
const dataRefreshGroup = DATA_REFRESH.match(/^\s*group:\s*(.+)$/m)?.[1]?.trim();
const dailyCopernicusGroup = DAILY_COPERNICUS.match(/^\s*group:\s*(.+)$/m)?.[1]?.trim();
check('both workflows serialize on the same cross-workflow publication lock', dataRefreshGroup === dailyCopernicusGroup && dataRefreshGroup === 'copernicus-publication-${{ github.ref }}');

console.log('\n' + passed + ' checks passed — private endpoint fail-closed, no public Git payload, FTPS handoff required.');
