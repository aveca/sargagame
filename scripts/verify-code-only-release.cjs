#!/usr/bin/env node
'use strict'
/**
 * verify-code-only-release.cjs â€” preuve d'INVARIANCE Â« code-only release Â»
 * (mission P0.118 Â§9).
 *
 * Une Â« code-only release Â» est une branche qui part du BASELINE PRODUCTION
 * exact et n'y ajoute QUE le correctif fail-closed (la garde satellite). Elle
 * ne doit RIEN modifier :
 *
 *   observations Â· levels Â· scores Â· weekly forecasts Â· history Â· banks Â·
 *   grid Â· private forecasts Â· pricing Â· offers Â· checkout Â· payment logic Â·
 *   Worker source Â· bindings Â· secrets Â· routes Â· DNS Â· security config
 *
 * Ce script produit et vÃ©rifie un MANIFESTE SHA-256 de tous les fichiers
 * sensibles, pris tel quel dans le baseline de production. La vÃ©rification
 * compare l'ARBRE DE TRAVAIL au manifeste : elle ne dÃ©pend pas de git et
 * tourne donc en CI comme en local.
 *
 * Usage :
 *   node scripts/verify-code-only-release.cjs            â†’ vÃ©rifie
 *   node scripts/verify-code-only-release.cjs --write    â†’ (re)gÃ©nÃ¨re le manifeste
 *   SG_CODE_ONLY_BASELINE=<sha> node ... --write        â†’ autre baseline
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const BASELINE = process.env.SG_CODE_ONLY_BASELINE || '164d70fd5a494c638c4a804a093381e28fc393de'
const MANIFEST_PATH = path.join(ROOT, 'tests', 'fixtures', 'code-only-release-invariance.json')

// Groupes de fichiers dont l'octet doit Ãªtre identique au baseline production.
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

// Fichiers AUTORISÃ‰S Ã  diffÃ©rer du baseline (le correctif lui-mÃªme).
const ALLOWED_CHANGED = new Set([
  'src/lib/format-freshness.mjs',              // garde fail-closed (7a4c6a21)
  'src/ChasseHome.jsx',                        // garde fail-closed (7a4c6a21)
  'scripts/automation/user-journey-audit.cjs',  // garde + correctif du sÃ©lecteur
  'scripts/lib/satellite-freshness.cjs',        // SLA opÃ©rationnel 900 min reportÃ©
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

// Fichiers rÃ©gÃ©nÃ©rÃ©s par `npm run build` : leur contenu dans l'arbre de
// travail peut diffÃ©rer du commit sans que cela soit un changement de la
// release (date de gÃ©nÃ©ration, fraÃ®cheur recalculÃ©e, phase de saison).
const BUILD_ARTIFACTS = new Set([
  'public/api/b2b-partners.json',
  'public/data/b2b-partners.json',
  'public/version.json',
  'public/api/copernicus/sargassum.json',
  'public/api/copernicus/_private/forecast-full.json',
])

// Un chemin est autorisÃ© Ã  diffÃ©rer du baseline s'il est dans la liste
// ci-dessous ou s'il commence par un des prÃ©fixes (preuves versionnÃ©es).
const ALLOWED_PREFIXES = [
  'scripts/automation/data/journeys/code-only-',
]

function isAllowedChanged(file) {
  if (ALLOWED_CHANGED.has(file)) return true
  return ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))
}

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
  ok(manifest.baseline === BASELINE, `manifestealignÃ© sur le baseline ${BASELINE}`)

  // 1. Chaque fichier sensible est identique Ã€ L'IDENTIQUE dans le COMMIT.
  //    On compare le contenu commitÃ© (git show HEAD:<f>) et non l'arbre de
  //    travail : un build local rÃ©gÃ©nÃ¨re certains artefacts (sargassum.json
  //    re-sÃ©rialisÃ©, b2b-partners.json, version.json) sans que cela soit un
  //    changement de la release. La dÃ©rive de l'arbre de travail est
  //    contrÃ´lÃ©e sÃ©parÃ©ment au point 2 (dÃ©rive SÃ‰MANTIQUE interdite).
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
  ok(mismatches === 0, `aucun fichier sensible modifiÃ© dans le commit (${mismatches})`)

  // 2. DÃ©rive de l'ARBRE DE TRAVAIL : uniquement les ARTEFACTS DE BUILD
  //    attendus (ils sont rÃ©gÃ©nÃ©rÃ©s Ã  chaque `npm run build` : date de
  //    gÃ©nÃ©ration, mÃ©tadonnÃ©es de fraÃ®cheur recalculÃ©es depuis la mÃªme
  //    observation, phase de saison dÃ©rivÃ©e de la date du jour). Tout autre
  //    fichier sensible modifiÃ© dans l'arbre de travail = dÃ©rive interdite.
  const drifted = git(['diff', '--name-only', 'HEAD', '--']).split(/\r?\n/).filter(Boolean)
  const unexpectedDrift = drifted.filter((file) => {
    if (isAllowedChanged(file)) return false
    if (BUILD_ARTIFACTS.has(file)) return false
    return file in manifest.sha256
  })
  ok(unexpectedDrift.length === 0, `aucune dÃ©rive hors artefacts de build (${unexpectedDrift.slice(0, 5).join(', ')})`)

  // 2bis. Le payload scientifique racine : le build ne doit modifier QUE la
  //      fraÃ®cheur recalculÃ©e et la phase de saison (dÃ©rivÃ©e de la date).
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
      ok(live.erddapTimestamp === committed.erddapTimestamp, 'OBSERVATION inchangÃ©e aprÃ¨s rebuild (erddapTimestamp)')
      ok(live.updatedAt === committed.updatedAt, 'timestamp de publication inchangÃ© aprÃ¨s rebuild (updatedAt)')
      ok(same(live.levels, committed.levels), 'levels inchangÃ©s aprÃ¨s rebuild')
      ok(same(live.weekly, committed.weekly), 'weekly forecasts inchangÃ©s aprÃ¨s rebuild')
      ok(same(live.scores, committed.scores), 'scores inchangÃ©s aprÃ¨s rebuild')
      ok(same(live.weather, committed.weather), 'mÃ©tÃ©o inchangÃ©e aprÃ¨s rebuild')
    }
  }

  // 2. Aucun fichier sensible AJOUTÃ‰ (une apparition silencieuse serait un
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
  ok(extras.length === 0, `aucun fichier sensible ajoutÃ© (${extras.slice(0, 5).join(', ')})`)

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

  // 3. Le diff du COMMIT vs baseline ne contient QUE les chemins autorisÃ©s.
  //    (On compare commit Ã  commit : la dÃ©rive de l'arbre de travail due au
  //    build local est traitÃ©e au point 2.)
  const changed = git(['diff', '--name-only', BASELINE, 'HEAD', '--']).split(/\r?\n/).filter(Boolean)
  const unauthorized = changed.filter((f) => !isAllowedChanged(f) && !f.startsWith('.ai/'))
  ok(unauthorized.length === 0, `diff vs baseline limitÃ© aux chemins autorisÃ©s (${unauthorized.slice(0, 5).join(', ')})`)

  // 4. Les seuils de fraÃ®cheur ne sont pas abaissÃ©s.
  const fresh = require(path.join(ROOT, 'scripts', 'lib', 'satellite-freshness.cjs'))
  ok(fresh.SAT_STALE_HOURS === 36, `seuil PUBLIC inchangÃ© Ã  36 h (reÃ§u ${fresh.SAT_STALE_HOURS})`)
  ok(fresh.OPERATIONAL_SLA_MINUTES === 900, `SLA opÃ©rationnel Ã  900 min, jamais abaissÃ© (reÃ§u ${fresh.OPERATIONAL_SLA_MINUTES})`)

  // 5. La garde fail-closed est bien prÃ©sente.
  const chasse = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8')
  const fmt = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'format-freshness.mjs'), 'utf8')
  ok(/const satelliteDecisionCurrent=/.test(chasse), 'la garde satelliteDecisionCurrent est prÃ©sente')
  ok(/data-testid="lc-detail-score-paused"/.test(chasse), 'la garde masque le score courant')
  ok(/data-testid="lc-detail-forecast-paused"/.test(chasse), 'la garde suspend la prÃ©vision')
  ok(/payloadCurrent/.test(fmt), 'le libellÃ© de fraÃ®cheur distingue courant / historique')

  for (const c of checks) console.log((c.ok ? 'OK  ' : 'âœ—   ') + c.label)
  console.log(`\nCODE_ONLY_INVARIANCE : ${checks.filter(c => c.ok).length}/${checks.length} contrÃ´les OK (${manifest.total} fichiers sensibles, baseline ${BASELINE})`)
  return problems.length === 0
}

function main() {
  if (process.argv.includes('--write')) {
    const manifest = buildManifest()
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true })
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    console.log(`Manifeste Ã©crit : ${MANIFEST_PATH} (${manifest.total} fichiers, baseline ${BASELINE})`)
    for (const [name, files] of Object.entries(manifest.groups)) {
      console.log(`  ${name.padEnd(28)} ${files.length} fichiers`)
    }
    return
  }
  if (!verify()) process.exit(1)
}

main()
