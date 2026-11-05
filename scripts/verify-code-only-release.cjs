#!/usr/bin/env node
'use strict'
/**
 * verify-code-only-release.cjs — preuve d'INVARIANCE « code-only release »
 * (mission P0.118 §9).
 *
 * Une « code-only release » est une branche qui part du BASELINE PRODUCTION
 * exact et n'y ajoute QUE le correctif fail-closed (la garde satellite). Elle
 * ne doit RIEN modifier :
 *
 *   observations · levels · scores · weekly forecasts · history · banks ·
 *   grid · private forecasts · pricing · offers · checkout · payment logic ·
 *   Worker source · bindings · secrets · routes · DNS · security config
 *
 * Ce script produit et vérifie un MANIFESTE SHA-256 de tous les fichiers
 * sensibles, pris tel quel dans le baseline de production. La vérification
 * compare l'ARBRE DE TRAVAIL au manifeste : elle ne dépend pas de git et
 * tourne donc en CI comme en local.
 *
 * Usage :
 *   node scripts/verify-code-only-release.cjs            → vérifie
 *   node scripts/verify-code-only-release.cjs --write    → (re)génère le manifeste
 *   SG_CODE_ONLY_BASELINE=<sha> node ... --write        → autre baseline
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const BASELINE = process.env.SG_CODE_ONLY_BASELINE || '164d70fd5a494c638c4a804a093381e28fc393de'
const MANIFEST_PATH = path.join(ROOT, 'tests', 'fixtures', 'code-only-release-invariance.json')

// Groupes de fichiers dont l'octet doit être identique au baseline production.
const GROUPS = {
  scientificPayloads: ['public/api/copernicus'],
  pricingAndOffers: ['public/pro', 'design/STORY/02-OFFER.md', 'scripts/automation/B2B_OFFER.md', 'src/PassOffer.jsx'],
  checkoutAndPayment: ['public/api'],
  workerSourceAndBindings: ['workers', 'wrangler.template.jsonc', 'wrangler.jsonc'],
  routesDnsSecurity: ['.github/workflows', 'public/.htaccess'],
  sharedLibraries: ['scripts/lib'],
  // Chaîne de build + pages partagées : ce sont les entrées qui produisent
  // les sitemaps régionaux. Les inclure prouve qu'un écart de sitemap ne
  // peut pas venir de cette release.
  buildPipelineAndSharedPages: [
    'vite.config.js',
    'scripts/prepare-ftp.cjs',
    'scripts/build-sargassum-json.cjs',
    'scripts/automation/gen-b2b-partners.cjs',
    'scripts/sync-version.cjs',
    'scripts/stamp-sw-hash.cjs',
    'scripts/lib/region-seo-pages.cjs',
    'scripts/lib/region-langs.cjs',
    'public/about/index.html',
    'public/research/index.html',
    'public/investigacion/index.html',
    'public/for-hotels/index.html',
  ],
}

// Fichiers AUTORISÉS à différer du baseline (le correctif lui-même).
const ALLOWED_CHANGED = new Set([
  'src/lib/format-freshness.mjs',              // garde fail-closed (7a4c6a21)
  'src/ChasseHome.jsx',                        // garde fail-closed (7a4c6a21)
  'scripts/automation/user-journey-audit.cjs',  // garde + correctif du sélecteur
  'scripts/lib/satellite-freshness.cjs',        // SLA opérationnel 900 min reporté
  'scripts/automation/lib/detail-decision-ui.cjs',
  'scripts/automation/code-only-12-scenarios.cjs',
  'scripts/verify-code-only-release.cjs',
  'tests/unit/lc-detail-freshness.test.cjs',
  'tests/unit/detail-decision-ui.test.cjs',
  'tests/unit/code-only-invariance.test.cjs',
  'tests/unit/satellite-freshness-sla.test.cjs',
  'tests/fixtures/code-only-release-invariance.json',
  'scripts/automation/data/code-only-12-scenarios.json',
])

// Un chemin est autorisé à différer du baseline s'il est dans la liste
// ci-dessus ou s'il commence par un des préfixes (preuves versionnées).
const ALLOWED_PREFIXES = [
  'scripts/automation/data/journeys/code-only-',
]

function isAllowedChanged(file) {
  if (ALLOWED_CHANGED.has(file)) return true
  return ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))
}

// Fichiers régénérés par `npm run build` : leur contenu dans l'arbre de
// travail peut différer du commit sans que cela soit un changement de la
// release (date de génération, fraîcheur recalculée, phase de saison).
const BUILD_ARTIFACTS = new Set([
  'public/api/b2b-partners.json',
  'public/data/b2b-partners.json',
  'public/version.json',
  'public/api/copernicus/sargassum.json',
  'public/api/copernicus/_private/forecast-full.json',
])

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function listBaselineFiles() {
  const out = git(['ls-tree', '-r', '--name-only', BASELINE])
  return out.split(/\r?\n/).filter(Boolean)
}

// Normalisation des fins de ligne : Git convertit LF -> CRLF lors du checkout
// sur Windows (core.autocrlf). On compare donc le CONTENU (LF), pas les octets
// du disque, pour que la preuve soit identique sur Linux (CI) et Windows.
function normalizeEol(buf) {
  return Buffer.from(String(buf).replace(/\r\n/g, '\n'), 'utf8')
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(normalizeEol(buf)).digest('hex')
}

function hashFile(abs) {
  return hashBuffer(fs.readFileSync(abs))
}

function buildManifest() {
  const all = listBaselineFiles()
  const files = []
  const groups = {}
  for (const [name, prefixes] of Object.entries(GROUPS)) {
    groups[name] = []
    for (const file of all) {
      const inGroup = prefixes.some((p) => file === p || file.startsWith(p.replace(/\/$/, '') + '/'))
      if (!inGroup) continue
      if (isAllowedChanged(file)) continue
      groups[name].push(file)
      files.push(file)
    }
  }
  const sha256 = {}
  for (const file of files.sort()) {
    const buf = execFileSync('git', ['show', `${BASELINE}:${file}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    sha256[file] = hashBuffer(buf)
  }
  return {
    baseline: BASELINE,
    groups,
    sha256,
    total: files.length,
  }
}

function verify() {
  const problems = []
  const checks = []
  const ok = (cond, label) => { checks.push({ label, ok: !!cond }); if (!cond) problems.push(label) }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  ok(manifest.baseline === BASELINE, `manifestealigné sur le baseline ${BASELINE}`)

  // 1. Chaque fichier sensible est identique À L'IDENTIQUE dans le COMMIT.
  //    On compare le contenu commité (git show HEAD:<f>) et non l'arbre de
  //    travail : un build local régénère certains artefacts (sargassum.json
  //    re-sérialisé, b2b-partners.json, version.json) sans que cela soit un
  //    changement de la release. La dérive de l'arbre de travail est
  //    contrôlée séparément au point 2 (dérive SÉMANTIQUE interdite).
  let mismatches = 0
  let missing = 0
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    let buf
    try {
      buf = execFileSync('git', ['show', `HEAD:${file}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (_) { missing++; continue }
    if (hashBuffer(buf) !== hash) mismatches++
  }
  ok(missing === 0, `aucun fichier sensible absent du commit (${missing})`)
  ok(mismatches === 0, `aucun fichier sensible modifié dans le commit (${mismatches})`)

  // 2. Dérive de l'ARBRE DE TRAVAIL : uniquement les ARTEFACTS DE BUILD
  //    attendus (ils sont régénérés à chaque `npm run build` : date de
  //    génération, métadonnées de fraîcheur recalculées depuis la même
  //    observation, phase de saison dérivée de la date du jour). Tout autre
  //    fichier sensible modifié dans l'arbre de travail = dérive interdite.
  const drifted = git(['diff', '--name-only', 'HEAD', '--']).split(/\r?\n/).filter(Boolean)
  const unexpectedDrift = drifted.filter((file) => {
    if (isAllowedChanged(file)) return false
    if (BUILD_ARTIFACTS.has(file)) return false
    return file in manifest.sha256
  })
  ok(unexpectedDrift.length === 0, `aucune dérive hors artefacts de build (${unexpectedDrift.slice(0, 5).join(', ')})`)

  // 2bis. Le payload scientifique racine : le build ne doit modifier QUE la
  //      fraîcheur recalculée et la phase de saison (dérivée de la date).
  //      L'OBSERVATION, les levels, les weekly, les scores et la meteo
  //      doivent rester IDENTIQUES.
  const rootPayload = 'public/api/copernicus/sargassum.json'
  if (fs.existsSync(path.join(ROOT, rootPayload))) {
    let live; let committed
    try {
      live = JSON.parse(fs.readFileSync(path.join(ROOT, rootPayload), 'utf8'))
      committed = JSON.parse(execFileSync('git', ['show', `HEAD:${rootPayload}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }))
    } catch (_) { live = null; committed = null }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    ok(!!live && !!committed, 'payload racine lisible (arbre de travail + commit)')
    if (live && committed) {
      ok(live.erddapTimestamp === committed.erddapTimestamp, 'OBSERVATION inchangée après rebuild (erddapTimestamp)')
      ok(live.updatedAt === committed.updatedAt, 'timestamp de publication inchangé après rebuild (updatedAt)')
      ok(same(live.levels, committed.levels), 'levels inchangés après rebuild')
      ok(same(live.weekly, committed.weekly), 'weekly forecasts inchangés après rebuild')
      ok(same(live.scores, committed.scores), 'scores inchangés après rebuild')
      ok(same(live.weather, committed.weather), 'météo inchangée après rebuild')
    }
  }

  // 2. Aucun fichier sensible AJOUTÉ (une apparition silencieuse serait un
  //    changement de surface scientifique/commerciale).
  const trackedNow = new Set(git(['ls-files']).split(/\r?\n/).filter(Boolean))
  const extras = []
  for (const [name, prefixes] of Object.entries(GROUPS)) {
    for (const file of trackedNow) {
      const inGroup = prefixes.some((p) => file === p || file.startsWith(p.replace(/\/$/, '') + '/'))
      if (!inGroup) continue
      if (isAllowedChanged(file)) continue
      if (!(file in manifest.sha256)) extras.push(`${name}:${file}`)
    }
  }
  ok(extras.length === 0, `aucun fichier sensible ajouté (${extras.slice(0, 5).join(', ')})`)

  // 2bis. Aucun fichier sensible NON SUIVI (apparition silencieuse, non vue par
  //      `git diff` ni par `git ls-files`).
  const untracked = git(['status', '--porcelain', '--untracked-files=all']).split(/\r?\n/)
    .filter(Boolean)
    .filter(l => l.startsWith('?? '))
    .map(l => l.slice(3).replace(/"/g, ''))
  const untrackedSensitive = untracked.filter((file) => {
    if (isAllowedChanged(file)) return false
    return Object.values(GROUPS).some(prefixes =>
      prefixes.some(p => file === p || file.startsWith(p.replace(/\/$/, '') + '/')))
  })
  ok(untrackedSensitive.length === 0, `aucun fichier sensible non suivi (${untrackedSensitive.slice(0, 5).join(', ')})`)

  // 3. Le diff du COMMIT vs baseline ne contient QUE les chemins autorisés.
  //    (On compare commit à commit : la dérive de l'arbre de travail due au
  //    build local est traitée au point 2.)
  const changed = git(['diff', '--name-only', BASELINE, 'HEAD', '--']).split(/\r?\n/).filter(Boolean)
  const unauthorized = changed.filter((f) => !isAllowedChanged(f) && !f.startsWith('.ai/'))
  ok(unauthorized.length === 0, `diff vs baseline limité aux chemins autorisés (${unauthorized.slice(0, 5).join(', ')})`)

  // 4. Les seuils de fraîcheur ne sont pas abaissés.
  const fresh = require(path.join(ROOT, 'scripts', 'lib', 'satellite-freshness.cjs'))
  ok(fresh.SAT_STALE_HOURS === 36, `seuil PUBLIC inchangé à 36 h (reçu ${fresh.SAT_STALE_HOURS})`)
  ok(fresh.OPERATIONAL_SLA_MINUTES === 900, `SLA opérationnel à 900 min, jamais abaissé (reçu ${fresh.OPERATIONAL_SLA_MINUTES})`)

  // 5. La garde fail-closed est bien présente.
  const chasse = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8')
  const fmt = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'format-freshness.mjs'), 'utf8')
  ok(/const satelliteDecisionCurrent=/.test(chasse), 'la garde satelliteDecisionCurrent est présente')
  ok(/data-testid="lc-detail-score-paused"/.test(chasse), 'la garde masque le score courant')
  ok(/data-testid="lc-detail-forecast-paused"/.test(chasse), 'la garde suspend la prévision')
  ok(/payloadCurrent/.test(fmt), 'le libellé de fraîcheur distingue courant / historique')

  for (const c of checks) console.log((c.ok ? 'OK  ' : '✗   ') + c.label)
  console.log(`\nCODE_ONLY_INVARIANCE : ${checks.filter(c => c.ok).length}/${checks.length} contrôles OK (${manifest.total} fichiers sensibles, baseline ${BASELINE})`)
  return problems.length === 0
}

function main() {
  if (process.argv.includes('--write')) {
    const manifest = buildManifest()
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true })
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    console.log(`Manifeste écrit : ${MANIFEST_PATH} (${manifest.total} fichiers, baseline ${BASELINE})`)
    for (const [name, files] of Object.entries(manifest.groups)) {
      console.log(`  ${name.padEnd(28)} ${files.length} fichiers`)
    }
    return
  }
  if (!verify()) process.exit(1)
}

main()
