#!/usr/bin/env node
/**
 * Regression P1 — canonical des pages PARTAGEES sur les domaines USD.
 *
 * Constat mesure en production 2026-10-22 : /about/, /research/, /investigacion/
 * et /for-hotels/ sont des pages statiques de public/ dont le HTML code en dur
 * l hote MQ (canonical, og:url, og:image, hreflang). Livrees telles quelles sur
 * sargassummiami.com / sargassumpuntacana.com / sargassumcancun.com /
 * sargazotulum.com, chaque page declarait un canonical martinique : Google
 * consolidait la copie cote MQ et le domaine USD n etait jamais indexe.
 *
 * Ce test verrouille, sur un faux livrable, le comportement de
 * scripts/lib/rewrite-shared-seo.cjs (appele par prepareNewRegion) :
 *   1. les 4 routes partagees passent en self-canonical (hote = domaine region) ;
 *   2. aucun canonical martinique ne subsiste sur ces 4 routes ;
 *   3. les hreflang dont la cible n est pas livree sont supprimes ;
 *   4. les pages NON partagees (FR heritees) gardent leur canonical MQ
 *      (c est ce qui les tient hors du sitemap regional) ;
 *   5. prepare-ftp appelle bien le module pour une nouvelle region.
 *
 * Auto-executant : exit 0 = OK, exit 1 = echec.
 */
"use strict"
const fs = require("fs")
const os = require("os")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const { rewriteSharedSeoHost, SHARED_PATHS } = require(path.join(ROOT, "scripts/lib/rewrite-shared-seo.cjs"))
const { getAllRegions } = require(path.join(ROOT, "regions/index.cjs"))

let failures = 0
function assert(cond, msg) {
  if (cond) console.log("  ok   " + msg)
  else { failures++; console.error("  FAIL " + msg) }
}
const HTML_SHARED = (slug) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<link rel="canonical" href="https://sargasses-martinique.com/${slug}/"/>
<meta property="og:url" content="https://sargasses-martinique.com/${slug}/"/>
<meta property="og:image" content="https://sargasses-martinique.com/og-image.png"/>
<link rel="alternate" hreflang="fr" href="https://sargasses-martinique.com/a-propos/"/>
<link rel="alternate" hreflang="es" href="https://sargasses-martinique.com/sobre/"/>
<link rel="alternate" hreflang="x-default" href="https://sargasses-martinique.com/${slug}/"/>
<title>${slug}</title></head><body>x</body></html>
`

const HTML_LEGACY = (slug) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/>
<link rel="canonical" href="https://sargasses-martinique.com/${slug}/"/>
<meta property="og:url" content="https://sargasses-martinique.com/${slug}/"/>
<title>${slug}</title></head><body>x</body></html>
`

console.log("1) Allowlist des routes partagees")
for (const p of ["about", "research", "investigacion", "for-hotels"]) {
  assert(SHARED_PATHS.includes(p), "route partagee whitelistee : /" + p + "/")
}
assert(!SHARED_PATHS.includes("agir") && !SHARED_PATHS.includes("recherche"),
  "pages FR heritees NON whitelistees (canonical MQ conserve)")

console.log("2) Comportement reel sur un faux livrable (region tulum)")
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "canon-"))
  const region = getAllRegions().find((r) => r.id === "tulum")
  for (const p of SHARED_PATHS) {
    fs.mkdirSync(path.join(tmp, p), { recursive: true })
    fs.writeFileSync(path.join(tmp, p, "index.html"), HTML_SHARED(p))
  }
  for (const p of ["agir", "recherche"]) {
    fs.mkdirSync(path.join(tmp, p), { recursive: true })
    fs.writeFileSync(path.join(tmp, p, "index.html"), HTML_LEGACY(p))
  }
  const res = rewriteSharedSeoHost(tmp, region)
  assert(res.files === SHARED_PATHS.length, "exactement les " + SHARED_PATHS.length + " fichiers partages reecrits (vu " + res.files + ")")

  for (const p of SHARED_PATHS) {
    const h = fs.readFileSync(path.join(tmp, p, "index.html"), "utf8")
    const c = (h.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/) || [])[1]
    assert(c === "https://" + region.domain + "/" + p + "/", "/" + p + "/ canonical self -> " + c)
    const og = (h.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/) || [])[1]
    assert(og === "https://" + region.domain + "/" + p + "/", "/" + p + "/ og:url -> " + og)
    const img = (h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || [])[1]
    assert(img === "https://" + region.domain + "/og-image.png", "/" + p + "/ og:image -> " + img)
    assert(!h.includes("sargasses-martinique.com"), "/" + p + "/ aucun hote martinique residuel")
    const alts = [...h.matchAll(/<link rel="alternate"[^>]*href="([^"]+)"/g)].map((m) => m[1])
    assert(alts.every((a) => a.startsWith("https://" + region.domain + "/")), "/" + p + "/ alternates sur l hote region")
  }

  const about = fs.readFileSync(path.join(tmp, "about", "index.html"), "utf8")
  assert(!about.includes("a-propos"), "/about/ hreflang orphelin /a-propos/ supprime")
  assert(!about.includes("/sobre/"), "/about/ hreflang orphelin /sobre/ supprime")
  assert(res.droppedAlts >= 2, "au moins 2 alternates orphelins retires (vu " + res.droppedAlts + ")")

  for (const p of ["agir", "recherche"]) {
    const h = fs.readFileSync(path.join(tmp, p, "index.html"), "utf8")
    const c = (h.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/) || [])[1]
    assert(c === "https://sargasses-martinique.com/" + p + "/", "/" + p + "/ canonical MQ inchange -> " + c)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log("3) Cablage dans prepare-ftp (chemin nouvelles regions uniquement)")
{
  const prep = fs.readFileSync(path.join(ROOT, "scripts/prepare-ftp.cjs"), "utf8")
  assert(prep.indexOf("rewriteSharedSeoHost(out, region)") >= 0, "prepare-ftp appelle rewriteSharedSeoHost")
  const start = prep.indexOf("function prepareNewRegion(region) {")
  const end = prep.indexOf("\nfunction ", start + 10)
  const body = prep.slice(start, end)
  assert(body.indexOf("rewriteSharedSeoHost(out, region)") >= 0, "appel situe dans prepareNewRegion (pas dans le chemin MQ/GP)")
}

console.log(failures ? "\n" + failures + " echec(s)" : "\nOK — canonical des pages partagees coherent avec le domaine de la region")
process.exit(failures ? 1 : 0)
