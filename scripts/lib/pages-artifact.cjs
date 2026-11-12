'use strict'
/**
 * pages-artifact.cjs — construction et INVENTAIRE de l'artefact Pages
 * (publication Cloudflare Pages) à partir de l'artefact régional FTP.
 *
 * POURQUOI (défaut mesuré le 2026-11-07)
 * --------------------------------------
 * Constat live : les six projets `*.pages.dev` servaient le CODE SOURCE PHP
 * en clair (`content-type: application/x-httpd-php`, HTTP 200) sur 24/36
 * endpoints testés — `/api/mollie.php`, `/api/widget-token.php`,
 * `/api/b2b-trial.php`, `/api/mollie-lib.php`, etc.
 *
 * Cause structurelle :
 *   1. `scripts/prepare-ftp.cjs` ne excluait que `api/stripe-config.php` ; les
 *      23 autres `.php` restaient dans l'artefact régional ;
 *   2. le fichier `.assetsignore` (règle « deux astérisques, slash, .php ») n'est
 *      honoré QUE par les assets statiques **Worker** — `wrangler pages deploy
 *      <dir>` publie TOUT ce qui se trouve dans `<dir>`, y compris les sources
 *      PHP.
 *
 * AUCUN secret de service n'était exposé (`mollie-config.php` et
 * `_deploy-secret.php` sont absents du dépôt → 404 ; `_deploy.php` reste
 * fail-closed). L'exposition était une divulgation de CODE APPLICATIF, pas de
 * credentials — mais c'est une divulgation, et elle est évitable.
 *
 * POURQUOI UN ARTEFACT DISTINCT (et pas un simple nettoyage du dossier FTP)
 * --------------------------------------------------------------------------
 * Le dossier régional `<region>-ftp/` a une DOUBLE FONCTION :
 *   - il est téléversé tel quel sur l'hébergeur FTP historique (Apache/PHP) ;
 *     les endpoints PHP y sont la money path (Mollie, PayPal, Stripe, B2B) ;
 *   - il sert de dossier d'assets au Worker Cloudflare (`__ASSETS_DIR__`).
 * Supprimer les `.php` du dossier FTP casserait le fonctionnement FTP
 * historique (les endpoints de paiement ne seraient plus jamais mis à jour).
 * On construit donc un ARTEFACT PAGES DISTINCT, sans PHP, et on laisse le
 * dossier FTP strictement inchangé.
 */

const fs = require('fs')
const path = require('path')

/**
 * Fichiers qui ne doivent JAMAIS être publiés sur Pages.
 * - `*.php` et `*.php.*` : sources serveur (le code n'est pas exécuté par
 *   Pages, il est renvoyé tel quel) ;
 * - `.htaccess` / `.htpasswd` : configuration Apache (le fichier de mots de
 *   passe ne doit jamais devenir un asset public).
 */
const PAGES_PUBLISH_BLOCKLIST = Object.freeze([
  /\.php$/i,
  /\.php\./i,
  /(^|\/)\.htaccess$/i,
  /(^|\/)\.htpasswd$/i
])

/**
 * Nom du dossier d'artefact Pages dérivé du dossier FTP régional.
 * `martinique-ftp` -> `martinique-ftp-pages`
 */
function pagesArtifactDirName(ftpDir) {
  return String(ftpDir).replace(/\/+$/, '') + '-pages'
}

/**
 * Un chemin (relatif, POSIX) est-il interdit de publication ?
 * @param {string} relativePath
 */
function isBlockedForPages(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/')
  return PAGES_PUBLISH_BLOCKLIST.some(re => re.test(rel))
}

/**
 * Liste les fichiers bloqués présents sous `dir` (chemins relatifs POSIX).
 * @param {string} dir
 * @returns {string[]}
 */
function listBlockedFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  const walk = (current, rel) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const childAbs = path.join(current, entry.name)
      if (entry.isDirectory()) walk(childAbs, childRel)
      else if (isBlockedForPages(childRel)) out.push(childRel)
    }
  }
  walk(dir, '')
  return out.sort()
}

/**
 * Compte les fichiers PHP (servis en source) présents sous `dir`.
 * @param {string} dir
 */
function countPhpFiles(dir) {
  return listBlockedFiles(dir).filter(p => /\.php(\.|$)/i.test(p)).length
}

/**
 * Copie `sourceDir` vers `targetDir` en EXCLUANT les fichiers interdits de
 * publication Pages. Le dossier FTP source n'est jamais modifié.
 *
 * @param {{sourceDir: string, targetDir: string}} options
 * @returns {{copied: number, removed: string[], targetDir: string}}
 */
function buildPagesArtifact({ sourceDir, targetDir }) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`[pages-artifact] source introuvable : ${sourceDir}`)
  }
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })

  const removed = []
  let copied = 0
  const sourceAbs = path.resolve(sourceDir)
  const targetAbs = path.resolve(targetDir)
  // Garde-fou : la cible ne doit jamais être à l'intérieur de la source
  // (la copie récurserait alors dans elle-même jusqu'au dépassement de pile).
  if (targetAbs === sourceAbs || targetAbs.startsWith(sourceAbs + path.sep)) {
    throw new Error(`[pages-artifact] la cible ne peut pas être à l'intérieur de la source : ${targetAbs}`)
  }
  const walk = (current, rel, dest) => {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const childAbs = path.join(current, entry.name)
      const childDest = path.join(dest, entry.name)
      if (path.resolve(childAbs) === targetAbs) continue
      if (entry.isDirectory()) {
        walk(childAbs, childRel, childDest)
      } else if (isBlockedForPages(childRel)) {
        removed.push(childRel)
      } else {
        fs.copyFileSync(childAbs, childDest)
        copied++
      }
    }
  }
  walk(sourceAbs, '', targetAbs)

  // Garde-fou final : l'artefact produit ne doit contenir AUCUN fichier bloqué.
  const leftovers = listBlockedFiles(targetDir)
  if (leftovers.length) {
    throw new Error(`[pages-artifact] l'artefact contient encore des fichiers interdits : ${leftovers.join(', ')}`)
  }
  return { copied, removed, targetDir }
}

module.exports = {
  PAGES_PUBLISH_BLOCKLIST,
  pagesArtifactDirName,
  isBlockedForPages,
  listBlockedFiles,
  countPhpFiles,
  buildPagesArtifact
}
