#!/usr/bin/env node
/**
 * Regression P1 — sitemap de secours : n annoncer que les pages de la region.
 *
 * Constat live 2026-10-22 (sargazotulum.com) : le sitemap listait 21 URLs dont
 * des pages FR heritees de public/ (/sargasses-aujourdhui/, /recherche/,
 * /veilleur/, /confidentialite/), 2 articles d autres illes et une page de
 * redirection — 0 fiche regionale. Cause : regions/seo-content/tulum.json est
 * absent, donc region-seo-pages n ecrit pas dist/sitemap.xml et prepare-ftp
 * retombait sur un scan « toutes les pages du dossier » sans filtre.
 *
 * Correctif : _pageBelongsToRegion (canonical region + langue emise + pas de
 * redirection). Ce test verrouille le contrat.
 *
 * Auto-executant : exit 0 = OK, exit 1 = echec.
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
let failures = 0
function assert(cond, msg) {
  if (cond) console.log("  ok   " + msg)
  else { failures++; console.error("  FAIL " + msg) }
}

const prep = fs.readFileSync(path.join(ROOT, "scripts/prepare-ftp.cjs"), "utf8")

console.log("1) Filtre d appartenance present dans prepare-ftp.cjs")
assert(prep.indexOf("_pageBelongsToRegion") >= 0, "helper _pageBelongsToRegion defini")
assert(prep.indexOf("new URL(canon).host !== domain") >= 0, "rejet si canonical vers un autre domaine")
assert(prep.indexOf("http-equiv=") >= 0, "rejet des pages de redirection (meta refresh)")
assert(prep.indexOf("_regionLangs.has(String(lang).toLowerCase().slice(0, 2))") >= 0, "filtre de langue")

console.log("2) Le fallback utilise le filtre (pas de listing brut)")
assert(prep.indexOf("if (_pageBelongsToRegion(html)) urls.push") >= 0, "walk filtre par _pageBelongsToRegion")
console.log("3) Artefact tulum-ftp local (apres build+prepare-ftp) : aucune URL etrangere")
{
  const sm = path.join(ROOT, "tulum-ftp", "sitemap.xml")
  if (!fs.existsSync(sm)) {
    console.log("  --   tulum-ftp absent (build local non prepare) — contrat 1)/2) suffisant")
  } else {
    const xml = fs.readFileSync(sm, "utf8")
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    assert(urls.length >= 5, "sitemap tulum >= 5 URLs (veu: " + urls.length + ")")
    for (const u of urls) {
      const slug = u.replace("https://sargazotulum.com", "")
      // Pages FR heritees (canonical MQ conserve) : interdites dans le sitemap.
      // Les 4 routes PARTAGEES (/about /research /investigacion /for-hotels) sont
      // desormais autoreferencees sur le domaine de la region (voir
      // tests/region-canonical-rewrite.test.cjs) -> elles appartiennent au domaine.
      assert(!/(sargasses-aujourdhui|sargasses-pres-de-moi|recherche|veilleur|agir|confidentialite|a-propos|articles)/.test(slug),
        "URL regionale uniquement (pas de page FR heritee) : " + slug)
    }
    assert(!/\/fiabilite\//.test(xml), "pas de page de redirection /fiabilite/ dans le sitemap")
    for (const p of ["about", "research", "investigacion", "for-hotels"]) {
      assert(new RegExp("/" + p + "/").test(xml), "/" + p + "/ (page partagee autoreferencee) presente")
    }
    assert(/\/fiabilidad\//.test(xml), "/fiabilidad/ (generee region) conservee")
    assert(/\/privacidad\//.test(xml), "/privacidad/ (generee region) conservee")
    assert(/\/terminos\//.test(xml), "/terminos/ (generee region) conservee")
    assert(/\/reliability\//.test(xml), "/reliability/ (generee region) conservee")
  }
}

console.log(failures ? "\n" + failures + " echec(s)" : "\nOK — sitemap de secours limite aux pages de la region")
process.exit(failures ? 1 : 0)
