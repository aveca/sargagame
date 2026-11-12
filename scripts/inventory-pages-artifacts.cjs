#!/usr/bin/env node
'use strict'
/**
 * inventory-pages-artifacts.cjs — INVENTAIRE de l'exposition PHP des six
 * artefacts de publication Cloudflare Pages.
 *
 * Usage :
 *   node scripts/inventory-pages-artifacts.cjs            (inventaire + code 1 si du PHP reste)
 *   node scripts/inventory-pages-artifacts.cjs --report   (JSON sur stdout)
 *   node scripts/inventory-pages-artifacts.cjs --only-existing
 *        (ne contrôle que les artefacts déjà construits — utile en CI, qui
 *         ne construit qu'une région à la fois ; les artefacts absents ne
 *         sont alors PAS comptés comme défaut)
 *   node scripts/inventory-pages-artifacts.cjs --region mq
 *        (contrôle STRICT d'UNE région : l'artefact absent = échec)
 *
 * Contexte (constat mesuré le 2026-11-07) : les six projets `*.pages.dev`
 * servaient le CODE SOURCE PHP en clair (24/36 endpoints testés). La cause
 * structurelle : `wrangler pages deploy <dir>` publie TOUT le contenu de
 * `<dir>` ; le `.assetsignore` n'est honoré que par les assets Worker, et
 * `prepare-ftp.cjs` n'excluait que `api/stripe-config.php`.
 *
 * Ce script PROUVE l'invariant : l'artefact publié sur Pages ne contient
 * AUCUN fichier PHP. Il affiche aussi, à titre de contrôle de non-régression
 * du FTP historique, le nombre de `.php` conservés dans le dossier FTP
 * (qui DOIVENT rester : c'est la money path de l'hébergeur historique).
 *
 * Sortie lisible (une ligne par région) :
 *   region=mq pages=martinique-ftp-pages php_pages=0 php_ftp=24 status=OK
 */

const fs = require('fs')
const path = require('path')
const { getAllRegions } = require('../regions/index.cjs')
const { pagesArtifactDirName, listBlockedFiles, countPhpFiles } = require('./lib/pages-artifact.cjs')

const ROOT = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const asJson = args.includes('--report')
const onlyExisting = args.includes('--only-existing')
const regionArgIndex = args.indexOf('--region')
const regionFilter = regionArgIndex >= 0 ? args[regionArgIndex + 1] : null

const regions = getAllRegions().filter(r => r.live !== false && (!regionFilter || r.id === regionFilter))
if (regionFilter && !regions.length) {
  console.error('[inventory-pages-artifacts] région inconnue ou hors-ligne : ' + regionFilter)
  process.exit(1)
}
const rows = []
let totalPagesPhp = 0
let missing = 0
let checked = 0

for (const region of regions) {
  const pagesDirName = pagesArtifactDirName(region.ftpDir)
  const pagesDir = path.join(ROOT, pagesDirName)
  const ftpDir = path.join(ROOT, region.ftpDir)
  const pagesExists = fs.existsSync(pagesDir)
  if (onlyExisting && !pagesExists) {
    rows.push({
      region: region.id,
      domain: region.domain,
      pagesDir: pagesDirName,
      pagesExists: false,
      checked: false,
      phpPages: 0,
      blockedFiles: [],
      phpFtp: fs.existsSync(ftpDir) ? countPhpFiles(ftpDir) : 0,
      status: 'SKIPPED'
    })
    continue
  }
  const blocked = pagesExists ? listBlockedFiles(pagesDir) : []
  const phpPages = pagesExists ? countPhpFiles(pagesDir) : 0
  const phpFtp = fs.existsSync(ftpDir) ? countPhpFiles(ftpDir) : 0
  totalPagesPhp += phpPages
  checked++
  if (!pagesExists) missing++
  rows.push({
    region: region.id,
    domain: region.domain,
    pagesDir: pagesDirName,
    pagesExists,
    checked: true,
    phpPages,
    blockedFiles: blocked,
    phpFtp,
    status: !pagesExists ? 'MISSING' : (blocked.length === 0 ? 'OK' : 'PHP_EXPOSED')
  })
}

const allOk = totalPagesPhp === 0 && missing === 0

if (asJson) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    regions: rows,
    summary: { regions: rows.length, totalPagesPhp, missing, ok: allOk }
  }, null, 2))
} else {
  console.log('INVENTAIRE ARTEFACTS PAGES (publication Cloudflare Pages) — ' + new Date().toISOString())
  for (const row of rows) {
    console.log(
      `  region=${String(row.region).padEnd(11)} pages=${String(row.pagesDir).padEnd(24)} ` +
      `php_pages=${row.phpPages} php_ftp=${row.phpFtp} status=${row.status}`
    )
    for (const file of row.blockedFiles) console.log(`      ⚠ bloque mais présent : ${file}`)
  }
  console.log('')
  console.log(`  régions live=${rows.length} contrôlées=${checked} artefacts_pages_manquants=${missing} php_dans_les_artefacts_pages=${totalPagesPhp}`)
  console.log('  (php_ftp > 0 est ATTENDU : les .php restent dans le dossier FTP historique = money path)')
  console.log('')
  console.log('PAGES_ARTIFACTS_PHP_FREE=' + (allOk ? 'true' : 'false'))
}

process.exit(allOk ? 0 : 1)
