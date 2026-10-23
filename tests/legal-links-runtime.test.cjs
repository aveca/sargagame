#!/usr/bin/env node
/**
 * Régression P0 — liens légaux in-app vers des pages réellement livrées.
 *
 * Constat live 2026-10-22 (audit Playwright des 6 domaines) :
 *   - bannière cookies → /en/privacy/ = 404 sur florida, puntacana,
 *     rivieramaya, tulum (/es/privacy/ = 404 sur rivieramaya + tulum) : la
 *     table codée en dur préfixait par la langue, alors que legal-pages.cjs
 *     écrit des slugs RACINE localisés (/privacy/, /privacidad/).
 *   - paywall → /cgv = 404 sur les 4 régions USD (page CGV FR = MQ/GP only) :
 *     lien cassé sur le chemin de conversion.
 *   - pied de page régional → /terms/ /privacy/ /refund/ = 404 sur tulum
 *     (tulum n'émet que l'espagnol : emittedLangs = ['es']).
 *
 * Ce test verrouille la correction : la table injectée au runtime
 * (scripts/lib/legal-links-table.cjs) ne doit contenir QUE des pages que le
 * générateur écrit réellement, et le helper runtime doit replier sur la langue
 * primaire de la région (jamais de 404).
 *
 * Auto-exécutant : exit 0 = OK, exit 1 = échec.
 */
"use strict"
const fs = require("fs")
const os = require("os")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const { buildLegalLinks } = require(path.join(ROOT, "scripts/lib/legal-links-table.cjs"))
const { getAllRegions } = require(path.join(ROOT, "regions/index.cjs"))
const { generateLegalPages } = require(path.join(ROOT, "scripts/lib/legal-pages.cjs"))
const { SLUGS } = require(path.join(ROOT, "scripts/lib/legal-pages.cjs"))
const { emittedLangs } = require(path.join(ROOT, "scripts/lib/region-langs.cjs"))

const KINDS = ["terms", "privacy", "refund"]
const isNew = (r) => r && r.id !== "mq" && r.id !== "gp"
let failures = 0
function assert(cond, msg) {
  if (cond) console.log("  ok   " + msg)
  else { failures++; console.error("  FAIL " + msg) }
}

async function loadHelper(table) {
  globalThis.__LEGAL_LINKS__ = table
  const { pathToFileURL } = require("url")
  const mod = await import(pathToFileURL(path.join(ROOT, "src/lib/legal-links.js")).href)
  return mod
}

;(async () => {
  const regions = getAllRegions()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "legal-links-"))

  console.log("1) Parite table runtime <-> generateur (regions USD, fichiers reels)")
  for (const r of regions) {
    if (!isNew(r)) continue
    const dir = path.join(tmp, r.id)
    fs.mkdirSync(dir, { recursive: true })
    generateLegalPages(r, dir)
    const table = buildLegalLinks(r)
    assert(!!table, r.id + " : table non vide")
    if (!table) continue
    const langs = emittedLangs(r)
    assert(Object.keys(table.pages).sort().join(",") === langs.slice().sort().join(","),
      r.id + " : langues table == langues emises [" + langs.join(",") + "]")
    for (const k of KINDS) {
      const urls = langs.map(l => "/" + SLUGS[k][l] + "/")
      for (const l of langs) {
        const href = table.pages[l][k]
        assert(urls.includes(href), r.id + " " + l + " " + k + " -> " + href + " (slug generateur)")
        const file = path.join(dir, href.replace(/^\//, "").replace(/\/$/, ""), "index.html")
        assert(fs.existsSync(file), r.id + " " + l + " " + k + " : page generee " + href)
      }
    }
  }

  console.log("2) MQ/GP : table = pages statiques FR existantes + /en/privacy/")
  for (const r of regions) {
    if (isNew(r)) continue
    const table = buildLegalLinks(r)
    assert(!!table, r.id + " : table non vide")
    for (const k of KINDS) {
      const href = table.pages.fr[k]
      assert(fs.existsSync(path.join(ROOT, "public", href)),
        r.id + " fr " + k + " -> " + href + " existe dans public/")
    }
    assert(fs.existsSync(path.join(ROOT, "public/en/privacy/index.html")),
      r.id + " en privacy -> /en/privacy/ existe dans public/en/")
    assert(table.pages.en.terms === undefined, r.id + " : pas d'entree EN fantome terms")
    assert(table.pages.es === undefined, r.id + " : pas d'entree ES fantome (404 aujourd'hui)")
  }

  console.log("3) Helper runtime : langue courante, repli langue primaire, jamais de 404")
  for (const r of regions) {
    const table = buildLegalLinks(r)
    const mod = await loadHelper(table)
    const emitted = Object.keys(table.pages)
    const primary = table.primary
    for (const l of ["fr", "en", "es"]) {
      for (const k of KINDS) {
        const href = mod.legalHref(k, l)
        // null = aucun lien rendu (sûr) ; sinon l'URL doit exiger une page réelle.
        // L'URL est réelle si : page de CETTE langue (émise), repli sur la langue
        // primaire, ou fichier statique public/ (MQ/GP).
        const variants = [table.pages[l] && table.pages[l][k], table.pages[primary] && table.pages[primary][k]]
        const rel = href.replace(/^\//, "").replace(/\/$/, "")
        const inPublic = fs.existsSync(path.join(ROOT, "public", rel, "index.html")) || fs.existsSync(path.join(ROOT, "public", rel + ".html"))
        assert(variants.includes(href) || inPublic,
          r.id + " " + l + " " + k + " -> " + href + " pointe une page reelle")
      }
    }
    // Repli : une langue NON émise par la région doit retomber sur la primaire.
    const absent = ["fr", "en", "es"].find(l => !emitted.includes(l))
    if (absent) {
      const lg = mod.legalLinks(absent)
      for (const k of KINDS) {
        if (table.pages[primary][k]) assert(lg[k] === table.pages[primary][k],
          r.id + " : langue absente " + absent + " -> repli " + k + " sur " + primary)
      }
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(failures ? "\n" + failures + " echec(s)" : "\nOK — liens legaux in-app coherents avec les pages livrees")
  process.exit(failures ? 1 : 0)
})()
