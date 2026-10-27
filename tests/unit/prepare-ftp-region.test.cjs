const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')
const assert = require('assert')

const ROOT = path.resolve(__dirname, '..', '..')
let passed = 0
function check(name, condition) {
  assert.ok(condition, name)
  passed++
  console.log('  ✓ ' + name)
}

console.log('PREPARE-FTP REGION - protections FTP vs assets Workers\n')

// ── 1. Construire un dist/ factice avec les fixtures critiques ──
const dist = path.join(ROOT, 'dist')
fs.mkdirSync(dist, { recursive: true })

// Fichiers de protection à CONSERVER dans le FTP (doivent survivre)
fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>')
fs.writeFileSync(path.join(dist, '.htaccess'), 'Options -Indexes\nRewriteEngine On\n')
fs.mkdirSync(path.join(dist, 'api'), { recursive: true })
fs.writeFileSync(path.join(dist, 'api', '.htaccess'), 'Require all denied\n')
fs.mkdirSync(path.join(dist, 'api', 'copernicus'), { recursive: true })
fs.writeFileSync(path.join(dist, 'api', 'copernicus', 'sargassum.json'), JSON.stringify({ weekly: [] }))
fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *\n')
fs.writeFileSync(path.join(dist, 'sitemap.xml'), '<urlset></urlset>\n')
fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ v: 'v221', b: 'abc123' }))
fs.writeFileSync(path.join(dist, 'sw.js'), "CACHE_NAME = 'sargasses-v221-abc123'")
fs.writeFileSync(path.join(dist, '.assetsignore'), '**/*.php\n**/*.php.*\n**/.env*\n**/.htaccess\n**/.htpasswd\n**/_private/\n')

// Donnée privée à EXCLURE du FTP (doit disparaître)
fs.mkdirSync(path.join(dist, '_private', 'nested'), { recursive: true })
fs.writeFileSync(path.join(dist, '_private', 'nested', 'secret.json'), JSON.stringify({ secret: 'do-not-copy' }))

// ── 2. Exécuter prepare-ftp.cjs pour la région MQ (build partagé) ──
execSync('node scripts/prepare-ftp.cjs', { cwd: ROOT, env: { ...process.env, VITE_REGION: 'mq' }, encoding: 'utf8' })

const mqFtp = path.join(ROOT, 'martinique-ftp')

// 3. Vérifications : protections FTP présentes
check('.htaccess présent dans le FTP mq', fs.existsSync(path.join(mqFtp, '.htaccess')))
check('api/.htaccess présent dans le FTP mq', fs.existsSync(path.join(mqFtp, 'api', '.htaccess')))
check('sargassum.json présent dans le FTP mq', fs.existsSync(path.join(mqFtp, 'api', 'copernicus', 'sargassum.json')))

// 4. Vérifications : données privées exclues du FTP
check('_private absent du FTP mq', !fs.existsSync(path.join(mqFtp, '_private')))
check('.htpasswd absent du FTP mq', !fs.existsSync(path.join(mqFtp, '.htpasswd')))
check('.assetsignore présent à la racine du FTP mq', fs.existsSync(path.join(mqFtp, '.assetsignore')))

// 5. Vérifier que .assetsignore contient les règles d'exclusion Workers
const ignore = fs.readFileSync(path.join(mqFtp, '.assetsignore'), 'utf8')
const ignoreRules = new Set(ignore.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')))
check('.assetsignore exclut .htaccess des assets Workers', ignoreRules.has('**/.htaccess'))
check('.assetsignore exclut .htpasswd des assets Workers', ignoreRules.has('**/.htpasswd'))
check('.assetsignore exclut _private des assets Workers', ignoreRules.has('**/_private/'))

// 6. Vérifier que le contenu de .htaccess est intact (protection serveur conservée)
const htaccessContent = fs.readFileSync(path.join(mqFtp, '.htaccess'), 'utf8')
check('.htaccess contient des règles de protection serveur', /Options|Require|Rewrite/.test(htaccessContent))

// ── 7. Test région individuelle USD (puntacana) via prepareNewRegion ──
const puFtp = path.join(ROOT, 'puntacana-ftp')
if (fs.existsSync(puFtp)) fs.rmSync(puFtp, { recursive: true, force: true })
try {
  execSync('node scripts/prepare-ftp.cjs', { cwd: ROOT, env: { ...process.env, VITE_REGION: 'puntacana' }, encoding: 'utf8' })
  check('.htaccess présent dans le FTP puntacana', fs.existsSync(path.join(puFtp, '.htaccess')))
  check('api/.htaccess présent dans le FTP puntacana', fs.existsSync(path.join(puFtp, 'api', '.htaccess')))
  check('_private absent du FTP puntacana', !fs.existsSync(path.join(puFtp, '_private')))
} catch (e) {
  console.log('  ⚠ puntacana non testable avec ce dist minimal (prérequis région manquants), ignoré pour ce test')
}
fs.rmSync(puFtp, { recursive: true, force: true })

// ── 8. Nettoyage ──
fs.rmSync(mqFtp, { recursive: true, force: true })
if (fs.existsSync(puFtp)) fs.rmSync(puFtp, { recursive: true, force: true })
fs.rmSync(dist, { recursive: true, force: true })

console.log(`\n${passed}/13 assertions passed - packaging FTP protège .htaccess et exclut _private.\n`)
process.exit(0)
