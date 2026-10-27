// tests/unit/worker-private-guard.test.cjs — garde _private fail-closed
//
// Contexte : /api/copernicus/_private/forecast-full.json (premium J+2-7) a été
// servi en clair sur *.workers.dev (constaté 2026-10-04). Cause racine : avec
// run_worker_first=false (défaut actuel) : les assets statiques compatibles sont
// servis directement par Cloudflare sans invoquer Worker. La garde _private/
// du Worker ne s'applique donc PAS aux requêtes d'assets statiques. La seule
// barrière effective est .assetsignore (Wrangler) qui doit exclure ces fichiers
// du packaging des assets Worker.
//
// Lancement : node tests/unit/worker-private-guard.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'workers', 'sargagame', 'index.js'), 'utf8');
const TPL = fs.readFileSync(path.join(ROOT, 'wrangler.template.jsonc'), 'utf8');
const IGNORE_PATH = path.join(ROOT, 'public', '.assetsignore');
const IGNORE = fs.readFileSync(IGNORE_PATH, 'utf8');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('WORKER-PRIVATE-GUARD — fail-closed _private/dotfiles/php\n');

// ════════════════════════════════════════════════════════════════════════════
// 1. Barrière code : le Worker refuse /_private/
// ════════════════════════════════════════════════════════════════════════════
check('worker refuse /_private/', /\/_private\//.test(WORKER));

// 2. Refus dotfiles / .htaccess / .env / .php non migrés (garde runtime)
check('worker refuse les dotfiles', /\\\\[\^\/\\]/.test(WORKER) || /\/\\\./.test(WORKER));
check('worker refuse .htaccess', /\.htaccess/.test(WORKER));
check('worker refuse .env', /\.env/.test(WORKER));
check('worker refuse .php non migré', /\\.php\$/.test(WORKER));

// 3. Refus neutre (pas de fuite d'info : pas de path renvoyé par la garde)
check('garde placée avant ASSETS.fetch', WORKER.indexOf('/_private/') < WORKER.lastIndexOf('env.ASSETS.fetch'));
check('refus neutre 404 (not_found, sans path)', /not_found/.test(WORKER));

// 3b. Allowlist statique publique (run_worker_first oblige : sans elle,
//     les JSON publics casseraient — constaté : sargassum.json 404 après le 1er fix)
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

// 5. run_worker_first=false : les assets statiques sont servis par Cloudflare edge
check('wrangler.template run_worker_first=false', /"run_worker_first"\s*:\s*false/.test(TPL));

// ════════════════════════════════════════════════════════════════════════════
// 6. .assetsignore : règles exactes, pas une simple présence du mot "_private".
//    C'est LA barrière effective quand run_worker_first=false.
// ════════════════════════════════════════════════════════════════════════════
const IGNORE_RULES = new Set(IGNORE.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')));
const REQUIRED_IGNORE_RULES = ['**/*.php', '**/*.php.*', '**/.env*', '**/.htaccess', '**/.htpasswd', '**/_private/'];
for (const rule of REQUIRED_IGNORE_RULES) {
  check('.assetsignore contient la règle exacte ' + rule, IGNORE_RULES.has(rule));
}
check('.assetsignore présent à public/.assetsignore (consommé par Wrangler)', fs.existsSync(IGNORE_PATH));

// ════════════════════════════════════════════════════════════════════════════
// 7. Vérification effective de l'exclusion sur un artefact simulé.
//    run_worker_first=false ⇒ les fichiers sensibles ne doivent PAS survivre
//    au filtrage .assetsignore, sinon ils seraient servis en clair par l'edge.
// ════════════════════════════════════════════════════════════════════════════

// Minimatch simplifié adapté aux patterns .assetsignore utilisés ici.
// Prend en charge : ** (n'importe quel dossier), * (dans un segment), ? .
// Un pattern se terminant par / désigne un dossier : tout ce qu'il contient
// est exclu (le dossier lui-même ET ses descendants).
function patternToRegex(pattern) {
  const trailingSlash = pattern.endsWith('/');
  let p = trailingSlash ? pattern.slice(0, -1) : pattern;
  let regex = '^';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      // ** : correspond à zéro ou plus de dossiers (y compris chemin vide)
      regex += '(?:.*/)?';
      i += 2;
      if (p[i] === '/') i++;
    } else if (c === '*') {
      regex += '[^/]*';
      i++;
    } else if (c === '?') {
      regex += '[^/]';
      i++;
    } else if ('.+^(){}[]|$\\'.includes(c)) {
      regex += '\\' + c;
      i++;
    } else {
      regex += c;
      i++;
    }
  }
  if (trailingSlash) regex += '($|/.*)';
  else regex += '$';
  return new RegExp(regex);
}

const EXCLUDE_PATTERNS = [...IGNORE_RULES].map(p => patternToRegex(p));
function isExcluded(relPath) {
  return EXCLUDE_PATTERNS.some(re => re.test(relPath));
}

function buildFixtureArtifact(dir) {
  const sensitive = [
    'api/.htaccess',
    'api/mollie-config.php',
    'api/stripe-config.php',
    '.env',
    '.env.local',
    '.htpasswd',
    '_private/forecast-full.json',
    '_private/secret.json',
    '_private/nested/deep.key',
  ];
  const publicFiles = [
    'api/copernicus/sargassum.json',
    'api/reliability.json',
    'index.html',
    'assets/index.js',
    'sitemap.xml',
    'robots.txt',
    'plages/les-salines/index.html',
  ];
  const all = sensitive.concat(publicFiles);
  for (const f of all) fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  for (const f of sensitive) fs.writeFileSync(path.join(dir, f), 'sensitive');
  for (const f of publicFiles) fs.writeFileSync(path.join(dir, f), 'public');
  return { sensitive, public: publicFiles };
}

const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sargassum-artifact-'));
const { sensitive, public: publicFiles } = buildFixtureArtifact(artifactDir);

for (const f of sensitive) {
  check('.assetsignore exclut le fichier sensible ' + f + ' de l\'artefact', isExcluded(f));
}
for (const f of publicFiles) {
  check('.assetsignore NE EXCLUT PAS le fichier public ' + f, !isExcluded(f));
}

// 7b. Rollback sécurité : vérifier que dist/ (si buildé) ne contient aucun
//     fichier sensible (régression si un déploiement l'introduit).
const distDir = path.join(ROOT, 'dist');
if (fs.existsSync(distDir)) {
  let leaked = [];
  function walk(d, base = '') {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const rel = base ? base + '/' + name : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) { walk(full, rel); continue }
      if (isExcluded(rel)) leaked.push(rel);
    }
  }
  walk(distDir);
  check('dist/ ne contient aucun fichier sensible exclu par .assetsignore', leaked.length === 0, leaked);
} else {
  console.log('  ℹ dist/ absent : vérification d\'artefact réel reportée à `npm run build`.');
}

fs.rmSync(artifactDir, { recursive: true, force: true });

// ═══════════════════════════════════════════════════════════════════════════
// 8. Fixture malveillante : retirer une règle requise doit faire échouer le test.
//    Ceci prouve que la garde détecte une régression d'exclusion.
// ════════════════════════════════════════════════════════════════════════════
const tamperedRules = new Set(IGNORE_RULES);
tamperedRules.delete('**/.htaccess');
const tamperedPatterns = [...tamperedRules].map(p => patternToRegex(p));
function isExcludedTampered(relPath) { return tamperedPatterns.some(re => re.test(relPath)); }
const SENSITIVE_SAMPLES = {
  '**/*.php': 'api/mollie-config.php',
  '**/*.php.*': 'api/mollie-config.php.bak',
  '**/.env*': '.env.local',
  '**/.htaccess': 'api/.htaccess',
  '**/.htpasswd': '.htpasswd',
  '**/_private/': '_private/forecast-full.json',
};
let allIndispensable = true;
for (const [rule, sample] of Object.entries(SENSITIVE_SAMPLES)) {
  const without = new Set(IGNORE_RULES);
  without.delete(rule);
  const withoutPatterns = [...without].map(p => patternToRegex(p));
  const stillExcluded = withoutPatterns.some(re => re.test(sample));
  if (stillExcluded) {
    allIndispensable = false;
    console.log('  ✗ règle non indispensable : ' + rule + ' (échantillon ' + sample + ' reste exclu sans elle)');
  } else {
    check('règle indispensable : retrait de ' + rule + ' réexpose ' + sample, true);
  }
}
check('toutes les règles .assetsignore requises sont indispensables', allIndispensable);

console.log('\n' + passed + ' checks passed — private endpoint fail-closed, public paths intact, artefact exclusion verified.');
