/**
 * rewrite-shared-seo.cjs — hote SEO des pages PARTAGEES livrees sur les
 * nouveaux domaines (regions USD/ES).
 *
 * PROBLEME (mesure en production 2026-10-22) : `public/about/`, `public/research/`,
 * `public/investigacion/` et `public/for-hotels/` sont des pages statiques dont le
 * HTML code en dur l hote MQ :
 *     <link rel="canonical" href="https://sargasses-martinique.com/about/">
 *     <meta property="og:url" content="https://sargasses-martinique.com/about/">
 *     <link rel="alternate" hreflang="fr" href="https://sargasses-martinique.com/a-propos/">
 * Livrees telles quelles sur sargassummiami.com / sargassumpuntacana.com /
 * sargassumcancun.com / sargazotulum.com, elles declaraient un canonical
 * Martinique : Google consolidait la copie cote MQ et le domaine USD n etait
 * jamais indexe sur sa propre URL.
 *
 * CORRECTIF applique a la SOURCE du pipeline (appele par prepare-ftp, pas dans
 * du HTML deja compile) :
 *   1. reecriture de l hote de la SEO metadata (canonical, og:url, og:image,
 *      hreflang alternates) vers le domaine de la region -> self-canonical,
 *      conforme a la strategie regionale (chaque domaine sert ses pages) ;
 *   2. suppression des <link rel="alternate"> dont la cible n existe PAS dans le
 *      dossier deploye (/a-propos/ et /sobre/ ne sont pas livres sur les regions
 *      USD -> hreflang mort, pire que pas de hreflang).
 *
 * Volontairement NON reecrit : les liens de navigation et les URL d API
 * (track-record.json, reliability.json) — reecrire l API casserait un fetch qui
 * fonctionne aujourd hui depuis MQ. MQ/GP : ce module n est pas appele.
 */
const fs = require("fs")
const path = require("path")

const MQ_HOST = "https://sargasses-martinique.com"

// Routes partagees livrees sur les regions USD (app footer + pages de confiance).
// Allowlist volontairement ETROITE : les autres pages livrees (FR heritees de
// public/ : /agir/, /recherche/, /veilleur/, /sargasses-aujourdhui/,
// /sargasses-pres-de-moi/, /confidentialite/) doivent GARDER leur canonical
// martinique — c est ce qui les exclut du sitemap regional (filtre
// _pageBelongsToRegion dans prepare-ftp.cjs). Les passer en self-canonical les
// ferait reindexer comme contenu regional sur un domaine EN/ES (regression du
// correctif sitemap du 23/10/2026).
const SHARED_PATHS = ["about", "research", "investigacion", "for-hotels"]

/** true si `<dir>/<slug>/index.html` (ou `<dir>/<slug>.html`) existe dans le livrable. */
function pageExists(out, slug) {
  const rel = slug.replace(/^\//, "").replace(/\/$/, "")
  if (!rel) return fs.existsSync(path.join(out, "index.html"))
  return fs.existsSync(path.join(out, rel, "index.html")) || fs.existsSync(path.join(out, rel + ".html"))
}
/**
 * Reecrit l hote de la SEO metadata des pages partagees vers `region.domain`,
 * puis purge les hreflang alternates orphelins.
 * Retourne { files, rewritten, droppedAlts } pour les logs et les tests.
 */
function rewriteSharedSeoHost(out, region) {
  const host = "https://" + region.domain
  let files = 0
  let rewritten = 0
  let droppedAlts = 0
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.html?$/i.test(entry.name)) continue
      const rel = path.relative(out, full).replace(/\\/g, "/")
      const top = rel.split("/")[0].replace(/\.html?$/i, "")
      if (!SHARED_PATHS.includes(top)) continue
      let html = fs.readFileSync(full, "utf8")
      if (!html.includes(MQ_HOST)) continue
      const before = html
      // 1) canonical + og:url + og:image + hreflang : hote -> domaine de la region
      html = html.replace(/(<link[^>]+rel="canonical"[^>]+href=")https:\/\/sargasses-martinique\.com/g, "$1" + host)
      html = html.replace(/(<meta[^>]+property="og:url"[^>]+content=")https:\/\/sargasses-martinique\.com/g, "$1" + host)
      html = html.replace(/(<meta[^>]+property="og:image"[^>]+content=")https:\/\/sargasses-martinique\.com/g, "$1" + host)
      html = html.replace(/(<link[^>]+rel="alternate"[^>]+href=")https:\/\/sargasses-martinique\.com/g, "$1" + host)
      // 2) hreflang orphelins : la cible doit exister dans le livrable de la region
      html = html.replace(/[ \t]*<link[^>]+rel="alternate"[^>]+href="([^"]+)"[^>]*>[ \t]*\r?\n?/g, (m, href) => {
        let slug = href
        try { slug = new URL(href).pathname } catch (_) { return m }
        if (pageExists(out, slug)) return m
        droppedAlts++
        return ""
      })
      if (html !== before) {
        fs.writeFileSync(full, html, "utf8")
        files++
        if (html.replace(/\r\n/g, "\n") !== before.replace(/\r\n/g, "\n")) rewritten++
      }
    }
  }
  if (fs.existsSync(out)) walk(out)
  return { files, rewritten, droppedAlts }
}

module.exports = { rewriteSharedSeoHost, pageExists, SHARED_PATHS, MQ_HOST }
