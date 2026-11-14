#!/usr/bin/env node
'use strict'
/**
 * tests/unit/pages-artifact-php-inventory.test.cjs — NON-RÉGRESSION de
 * l'exposition PHP des artefacts de publication Cloudflare Pages.
 *
 * Constat mesuré le 2026-11-07 : les six projets `*.pages.dev` servaient le
 * CODE SOURCE PHP en clair (`content-type: application/x-httpd-php`, HTTP 200)
 * sur 24/36 endpoints testés (`/api/mollie.php`, `/api/widget-token.php`,
 * `/api/b2b-trial.php`, `/api/mollie-lib.php`, …).
 *
 * Cause structurelle :
 *   1. `scripts/prepare-ftp.cjs` n'excluait que `api/stripe-config.php` ;
 *   2. `wrangler pages deploy <dir>` publie TOUT le contenu de `<dir>` : le
 *      `.assetsignore` (règle « deux astérisques, slash, .php ») n'est honoré
 *      QUE par les assets statiques WORKER.
 *
 * Ce test verrouille :
 *   A. les règles de blocage (toutes les variantes PHP + .htaccess/.htpasswd) ;
 *   B. le constructeur d'artefact (copie fidèle, PHP retirés, source intacte) ;
 *   C. le câblage de `prepare-ftp.cjs` (les DEUX chemins : MQ/GP partagé et
 *      région isolée) + le mode `--pages-only` ;
 *   D. l'invariant mesuré sur les artefacts RÉELS présents (0 PHP dans tout
 *      artefact Pages) ET la non-régression du FTP historique (les `.php` du
 *      dossier FTP sont CONSERVÉS : c'est la money path de l'hébergeur
 *      historique) — vérifié au niveau du CODE de `prepare-ftp.cjs` et par
 *      exécution réelle du script d'inventaire, car les dossiers `<region>-ftp/`
 *      sont des artefacts GÉNÉRÉS (gitignorés) dont l'état dépend du dernier
 *      build local et peut être reconstruit par un autre test de la suite ;
 *   E. le workflow de release Pages : il publie l'artefact `-pages`, jamais le
 *      dossier FTP, et il refuse de publier si un PHP traîne.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..', '..')
const {
  isBlockedForPages,
  listBlockedFiles,
  countPhpFiles,
  buildPagesArtifact,
  pagesArtifactDirName
} = require('../../scripts/lib/pages-artifact.cjs')

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

// ── A. Règles de blocage ────────────────────────────────────────────────────
for (const blocked of [
  'api/mollie.php', 'api/widget-token.php', 'collect.php', 'api/_deploy.php',
  'api/mollie.php.bak', 'api/x.PHP', '.htaccess', 'api/.htaccess', '.htpasswd',
  'api/.htpasswd'
]) {
  t(isBlockedForPages(blocked), 'fichier interdit de publication : ' + blocked)
}
for (const allowed of [
  'index.html', 'api/copernicus/sargassum.json', 'assets/index-Dx1.js',
  'videos/hero/anse-1080.mp4', 'version.json', 'sw.js', 'api/apple-pay-domain-association'
]) {
  t(!isBlockedForPages(allowed), 'fichier autorisé : ' + allowed)
}

// ── B. Constructeur d'artefact (fixture réelle, hors dépôt) ────────────────
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-pages-'))
try {
  fs.mkdirSync(path.join(fixture, 'api', 'copernicus'), { recursive: true })
  fs.mkdirSync(path.join(fixture, 'videos'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'index.html'), '<!doctype html>')
  fs.writeFileSync(path.join(fixture, 'api', 'mollie.php'), '<?php // secret-ish code')
  fs.writeFileSync(path.join(fixture, 'api', 'copernicus', 'sargassum.json'), '{"levels":[]}')
  fs.writeFileSync(path.join(fixture, 'videos', 'hero.mp4'), 'binary')
  fs.writeFileSync(path.join(fixture, '.htaccess'), 'deny from all')

  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-pages-out-'))
  const result = buildPagesArtifact({ sourceDir: fixture, targetDir: path.join(target, 'artifact') })
  const artifact = path.join(target, 'artifact')

  t(result.copied === 3, 'les fichiers autorisés sont copiés (3)')
  t(result.removed.length === 2, 'les fichiers interdits sont retirés (2)')
  t(!fs.existsSync(path.join(artifact, 'api', 'mollie.php')), 'le .php n’est pas dans l’artefact')
  t(!fs.existsSync(path.join(artifact, '.htaccess')), 'le .htaccess n’est pas dans l’artefact')
  fs.writeFileSync(path.join(artifact, '.htaccess'), 'unexpected')
  t(listBlockedFiles(artifact).includes('.htaccess'), 'l’inventaire détecte un .htaccess réintroduit')
  fs.unlinkSync(path.join(artifact, '.htaccess'))
  t(fs.existsSync(path.join(artifact, 'index.html')), 'index.html est dans l’artefact')
  t(fs.existsSync(path.join(artifact, 'api', 'copernicus', 'sargassum.json')), 'la structure des répertoires est conservée')
  t(fs.existsSync(path.join(artifact, 'videos', 'hero.mp4')), 'les fichiers non-PHP sont conservés')
  t(fs.existsSync(path.join(fixture, 'api', 'mollie.php')), 'la SOURCE (dossier FTP) n’est jamais modifiée')
  t(countPhpFiles(artifact) === 0, 'l’artefact produit ne contient aucun PHP')
  t(listBlockedFiles(artifact).length === 0, 'l’artefact produit ne contient aucun fichier bloqué')

  // Garde-fous : le chevauchement est refusé AVANT toute suppression.
  const nestedTarget = path.join(fixture, 'nested', 'artifact')
  fs.mkdirSync(nestedTarget, { recursive: true })
  const nestedSentinel = path.join(nestedTarget, 'must-survive.txt')
  fs.writeFileSync(nestedSentinel, 'keep')
  let threw = false
  try {
    buildPagesArtifact({ sourceDir: fixture, targetDir: nestedTarget })
  } catch (_) { threw = true }
  t(threw, 'une cible imbriquée dans la source est refusée')
  t(fs.existsSync(nestedSentinel), 'le garde-fou ne supprime pas une cible existante dans la source')

  // Une cible parente de la source est tout aussi dangereuse (elle engloberait le FTP).
  const overlapBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-pages-overlap-'))
  try {
    const nestedSource = path.join(overlapBase, 'source')
    fs.mkdirSync(nestedSource, { recursive: true })
    const sourceSentinel = path.join(nestedSource, 'must-survive.txt')
    fs.writeFileSync(sourceSentinel, 'keep')
    let ancestorThrew = false
    try {
      buildPagesArtifact({ sourceDir: nestedSource, targetDir: overlapBase })
    } catch (_) { ancestorThrew = true }
    t(ancestorThrew, 'une cible parente de la source est refusée')
    t(fs.existsSync(sourceSentinel), 'une cible parente ne peut pas effacer le dossier FTP source')
  } finally {
    fs.rmSync(overlapBase, { recursive: true, force: true })
  }

  // Les liens symboliques pourraient copier un fichier extérieur dans l’artefact public.
  const symlinkBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-pages-symlink-'))
  try {
    const symlinkSource = path.join(symlinkBase, 'source')
    const outsideFile = path.join(symlinkBase, 'outside.txt')
    fs.mkdirSync(symlinkSource, { recursive: true })
    fs.writeFileSync(outsideFile, 'outside')
    let symlinkCreated = false
    try { fs.symlinkSync(outsideFile, path.join(symlinkSource, 'public-link.txt')); symlinkCreated = true } catch (_) {}
    if (symlinkCreated) {
      t(listBlockedFiles(symlinkSource).includes('public-link.txt'), 'l’inventaire signale les liens symboliques')
      let symlinkThrew = false
      try {
        buildPagesArtifact({ sourceDir: symlinkSource, targetDir: path.join(symlinkBase, 'artifact') })
      } catch (_) { symlinkThrew = true }
      t(symlinkThrew, 'le constructeur refuse de copier un lien symbolique')
    } else {
      console.log('SKIP liens symboliques : création non autorisée sur cette plateforme')
    }

    // La racine source elle-même peut être un lien : readdirSync la suivrait
    // avant que la boucle récursive ne voie les liens enfants.
    const sourceRootLink = path.join(symlinkBase, 'source-root-link')
    let rootLinkCreated = false
    try { fs.symlinkSync(symlinkSource, sourceRootLink, 'dir'); rootLinkCreated = true } catch (_) {}
    if (rootLinkCreated) {
      t(listBlockedFiles(sourceRootLink).includes('.'), 'l’inventaire bloque une racine source symbolique')
      let rootLinkThrew = false
      try {
        buildPagesArtifact({ sourceDir: sourceRootLink, targetDir: path.join(symlinkBase, 'root-link-artifact') })
      } catch (_) { rootLinkThrew = true }
      t(rootLinkThrew, 'le constructeur refuse une racine source symbolique')
    }

    // Une cible symbolique vers la source (ou un parent symbolique qui y
    // mène) doit être reconnue comme chevauchante AVANT toute suppression.
    const targetAlias = path.join(symlinkBase, 'target-alias')
    let targetAliasCreated = false
    try { fs.symlinkSync(symlinkSource, targetAlias, 'dir'); targetAliasCreated = true } catch (_) {}
    if (targetAliasCreated) {
      let targetAliasThrew = false
      try {
        buildPagesArtifact({ sourceDir: symlinkSource, targetDir: targetAlias })
      } catch (_) { targetAliasThrew = true }
      t(targetAliasThrew, 'une cible symbolique vers la source est refusée')
      t(fs.lstatSync(targetAlias).isSymbolicLink(), 'le refus conserve le lien cible symbolique')
    }

    const parentAlias = path.join(symlinkBase, 'parent-alias')
    let parentAliasCreated = false
    try { fs.symlinkSync(symlinkBase, parentAlias, 'dir'); parentAliasCreated = true } catch (_) {}
    if (parentAliasCreated) {
      let parentAliasThrew = false
      try {
        buildPagesArtifact({ sourceDir: symlinkSource, targetDir: path.join(parentAlias, 'source', 'artifact') })
      } catch (_) { parentAliasThrew = true }
      t(parentAliasThrew, 'un parent symbolique ne peut pas contourner le contrôle de chevauchement')
    }
  } finally {
    fs.rmSync(symlinkBase, { recursive: true, force: true })
  }
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}

// ── C. Câblage de prepare-ftp.cjs ───────────────────────────────────────────
const prepareSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'prepare-ftp.cjs'), 'utf8')
t(/require\('\.\/lib\/pages-artifact\.cjs'\)/.test(prepareSrc), 'prepare-ftp importe le module pages-artifact')
t(/buildPagesArtifacts\(legacyRegions\)/.test(prepareSrc), 'prepare-ftp construit l’artefact Pages pour MQ/GP (build partagé)')
t(/buildPagesArtifacts\(\[region\]\)/.test(prepareSrc), 'prepare-ftp construit l’artefact Pages pour une région isolée')
t(/--pages-only/.test(prepareSrc), 'prepare-ftp expose le mode --pages-only (rebuild après rafraîchissement du payload)')
t(/buildPagesArtifact/.test(prepareSrc), 'prepare-ftp utilise le constructeur d’artefact')
const pagesModuleSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'pages-artifact.cjs'), 'utf8')
t(/l'artefact contient encore des fichiers interdits/.test(pagesModuleSrc), 'le constructeur REFUSE un artefact qui contiendrait encore un fichier interdit')

// ── D. Invariant mesuré sur les artefacts réellement présents ──────────────
// Les dossiers `<region>-ftp/` et `<region>-ftp-pages/` sont des ARTEFACTS
// GÉNÉRÉS (gitignorés) : leur contenu dépend du dernier build local et peut
// être absent, partiel, ou reconstruit avec un dist factice par un autre
// test de la suite (cf. tests/unit/prepare-ftp-region.test.cjs). L'invariant
// est donc vérifié de deux façons DÉTERMINISTES :
//   (a) sur tout artefact Pages PRÉSENT : 0 PHP, 0 .htaccess/.htpasswd ;
//   (b) sur le CODE de prepare-ftp : le dossier FTP n'est JAMAIS amputé de
//       ses .php (money path historique intacte) et l'artefact Pages est
//       écrit dans un AUTRE dossier.
const regions = require(path.join(ROOT, 'regions', 'index.cjs')).getAllRegions().filter(r => r.live !== false)
t(regions.length === 6, '6 régions live dans la matrice officielle')

let checkedArtifacts = 0
for (const region of regions) {
  const pagesDir = path.join(ROOT, pagesArtifactDirName(region.ftpDir))
  if (!fs.existsSync(pagesDir)) continue
  checkedArtifacts++
  t(countPhpFiles(pagesDir) === 0, `artefact Pages ${region.id} : aucun fichier PHP (0 trouvé)`)
  t(listBlockedFiles(pagesDir).length === 0, `artefact Pages ${region.id} : aucun .htaccess/.htpasswd`)
}
if (checkedArtifacts === 0) {
  console.log('   (aucun artefact Pages construit dans ce checkout : l\'invariant est vérifié sur le code et sur le script d\'inventaire)')
}
t(true, 'artefacts Pages réellement présents contrôlés : ' + checkedArtifacts)

// (b) Non-régression de la money path FTP, au niveau du CODE.
const copySkipTop = /COPY_SKIP_TOP\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(prepareSrc)
t(!!copySkipTop, 'prepare-ftp déclare COPY_SKIP_TOP')
t(!!copySkipTop && !/\.php/i.test(copySkipTop[1]), 'COPY_SKIP_TOP n’exclut AUCUN fichier .php du dossier FTP')
t(/copyRecursive\(dist,\s*out,\s*COPY_SKIP_TOP\)/.test(prepareSrc), 'le dossier FTP est copié tel quel (COPY_SKIP_TOP)')
t(/targetDir:\s*path\.join\(root,\s*targetName\)/.test(prepareSrc), 'l’artefact Pages est écrit dans un AUTRE dossier que le dossier FTP')
t(pagesArtifactDirName('martinique-ftp') === 'martinique-ftp-pages' &&
  pagesArtifactDirName('martinique-ftp') !== 'martinique-ftp', 'le dossier Pages est distinct du dossier FTP')
t(!/unlinkSync\([^)]*\.php/.test(prepareSrc) && !/rmSync\([^)]*\.php/i.test(prepareSrc),
  'prepare-ftp ne supprime AUCUN fichier .php (ni du FTP, ni ailleurs)')

// (c) Preuve d'exécution : le script d'inventaire réel parcourt les 6 régions
//     et ne trouve JAMAIS de fichier bloqué dans un artefact présent.
const { spawnSync } = require('child_process')
const inventoryRun = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'inventory-pages-artifacts.cjs'), '--report'], {
  cwd: ROOT, encoding: 'utf8'
})
let inventory = null
try { inventory = JSON.parse(inventoryRun.stdout) } catch (_) { inventory = null }
t(!!inventory, 'le script d’inventaire émet un rapport JSON exploitable')
if (inventory) {
  t(inventory.regions.length === 6, 'l’inventaire couvre les 6 régions live')
  t(typeof inventory.summary.totalPagesPhp === 'number', 'l’inventaire publie le total de PHP dans les artefacts Pages')
  const exposed = inventory.regions.filter(r => r.pagesExists && r.blockedFiles.length > 0)
  t(exposed.length === 0, 'aucun artefact Pages présent ne contient de fichier interdit (exposition PHP = 0)')
  const missing = inventory.regions.filter(r => !r.pagesExists)
  console.log('   (' + missing.length + ' artefact(s) Pages absent(s) de ce checkout : non contrôlés, ' +
    'le mode --only-existing / --region les couvre en CI)')
}

// ── E. Workflow de release Pages ────────────────────────────────────────────
const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages-code-only-release.yml'), 'utf8')
t(/pages deploy \$\{\{ matrix\.pages_dir \}\}/.test(workflow), 'la release Pages publie l’artefact -pages (pas le dossier FTP)')
t(!/pages deploy \$\{\{ matrix\.ftp_dir \}\}/.test(workflow), 'la release Pages ne publie PLUS le dossier FTP (sinon : code PHP exposé)')
t(/prepare-ftp\.cjs --pages-only/.test(workflow), 'la release reconstruit l’artefact sans PHP après le rafraîchissement du payload')
t(/inventory-pages-artifacts\.cjs --region/.test(workflow), 'la release refuse de publier si un PHP traîne dans l’artefact')
for (const region of regions) {
  t(workflow.includes('pages_dir: ' + pagesArtifactDirName(region.ftpDir)),
    `matrice de la release : artefact Pages déclaré pour ${region.id}`)
}

// ── F. Script d'inventaire ──────────────────────────────────────────────────
t(fs.existsSync(path.join(ROOT, 'scripts', 'inventory-pages-artifacts.cjs')), 'le script d’inventaire existe')
const inventorySrc = fs.readFileSync(path.join(ROOT, 'scripts', 'inventory-pages-artifacts.cjs'), 'utf8')
t(/PAGES_ARTIFACTS_PHP_FREE/.test(inventorySrc), 'l’inventaire émet un token lisible (PAGES_ARTIFACTS_PHP_FREE)')
t(/blockedCount\s*===\s*0/.test(inventorySrc) && /row\.blockedFiles\.length/.test(inventorySrc),
  'l’inventaire échoue aussi sur .htaccess/.htpasswd et les liens symboliques, pas seulement PHP')

// ── G. .gitignore : les artefacts ne doivent jamais être commités ───────────
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
t(/^\*\/?-?ftp-pages\//m.test(gitignore) || /ftp-pages/.test(gitignore), 'les artefacts Pages sont ignorés par git')

console.log('\nPAGES_ARTIFACT_PHP_INVENTORY_TESTS PASS (' + n + ' assertions)')
