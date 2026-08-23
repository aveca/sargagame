/**
 * Garde-fou serveur : retire les pages cross-domain (cf. cross-domain-drops.cjs)
 * du serveur FTP LIVE d'une région. Le deploy FTP (manual-ftp-deploy.cjs) ne fait
 * qu'uploader — il n'efface jamais ce qui a déjà été retiré du build. Un slug
 * passé en MQ_ONLY/GP_ONLY après avoir été déployé reste donc orphelin sur
 * l'autre domaine (éditorial swappé + canonical auto-référent = duplicate-content
 * indexable). Ce module supprime ces dossiers côté serveur après le deploy.
 *
 * Best-effort par conception : un dossier absent (cas normal — la majorité ne
 * sont jamais montés sur l'autre île) ou un removeDir qui échoue est LOGGÉ, pas
 * jeté. Ne doit jamais faire échouer un deploy.
 *
 * ⚠️ Détection d'existence = lister le PARENT et chercher le nom du dossier.
 * NE PAS faire list(<chemin>) : sur ce Pure-FTPd mutualisé, lister un chemin
 * ABSENT renvoie parfois une liste vide SANS erreur (faux positif → on croit le
 * résidu présent et on tente un removeDir voué à l'échec à chaque deploy).
 * Lister le parent et tester l'appartenance est fiable (vérifié 2026-06-19).
 */
const { Client } = require('basic-ftp')
const { crossDomainDropsFor } = require('./cross-domain-drops.cjs')

async function connect(t) {
  const client = new Client(undefined, 120000)
  client.ftp.verbose = false
  await client.access({
    host: t.host,
    user: t.user,
    password: t.pass,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  })
  return client
}

// Normalise un slug relatif ('en/best-beaches-martinique') en chemin FTP absolu
// ('/en/best-beaches-martinique'). Le home FTP = racine web du domaine.
function remotePathFor(rel) {
  return ('/' + String(rel).replace(/^\/+/, '')).replace(/\/{2,}/g, '/')
}

// Coupe un chemin absolu en { parent, base } : '/en/x' → {'/en','x'} ; '/x' → {'/','x'}.
function splitRemote(remote) {
  const i = remote.lastIndexOf('/')
  return { parent: i <= 0 ? '/' : remote.slice(0, i), base: remote.slice(i + 1) }
}

/**
 * Purge les résidus cross-domain d'UNE région sur son serveur live.
 * @param t  cible { key, label, host, user, pass } (forme manual-ftp-deploy)
 * @param opts.apply  true = supprime ; false (défaut) = dry-run (liste seulement)
 * @param opts.client client basic-ftp déjà connecté à réutiliser (sinon on en ouvre un)
 * @param opts.log    logger (défaut console.log)
 * @returns { region, drops, found, removed, errors, skipped? }
 */
async function purgeRegionResidues(t, opts = {}) {
  const { apply = false, log = console.log } = opts
  const label = t.label || t.key
  const drops = crossDomainDropsFor(t.key)
  if (!drops.length) return { region: t.key, drops: 0, found: 0, removed: 0, errors: 0, skipped: 'no-drops' }
  if (!t.host || !t.user || !t.pass) {
    log(`[${label}] purge cross-domain ignorée — identifiants FTP manquants`)
    return { region: t.key, drops: drops.length, found: 0, removed: 0, errors: 0, skipped: 'no-creds' }
  }

  const ownClient = !opts.client
  const client = opts.client || (await connect(t))
  let found = 0
  let removed = 0
  let errors = 0
  try {
    // Cache des listings de parents : Set des noms de DOSSIERS présents, ou null
    // si le parent lui-même est absent. Fiable (cf. avertissement en tête).
    const parentCache = new Map()
    const listParentDirs = async (parent) => {
      if (parentCache.has(parent)) return parentCache.get(parent)
      let set = null
      try {
        const entries = await client.list(parent)
        set = new Set(entries.filter((e) => e.isDirectory).map((e) => e.name))
      } catch (_) {
        set = null // parent absent → aucun enfant
      }
      parentCache.set(parent, set)
      return set
    }

    for (const rel of drops) {
      const remote = remotePathFor(rel)
      const { parent, base } = splitRemote(remote)
      const siblings = await listParentDirs(parent)
      if (!siblings || !siblings.has(base)) continue // absent = état attendu
      found++
      // Le dossier EXISTE → lister son contenu est fiable (preuve avant suppression).
      let suffix = ''
      try { const inner = await client.list(remote); suffix = ` (${inner.length} entrées)` } catch (_) {}
      if (!apply) {
        log(`  [${label}] DRY-RUN résidu présent: ${remote}${suffix}`)
        continue
      }
      try {
        await client.removeDir(remote)
        removed++
        log(`  [${label}] ✓ supprimé ${remote}${suffix}`)
      } catch (err) {
        errors++
        log(`  [${label}] ⚠ échec removeDir ${remote}: ${err.message}`)
      }
    }
  } finally {
    if (ownClient) { try { client.close() } catch (_) {} }
  }
  if (found === 0) log(`  [${label}] aucun résidu cross-domain (${drops.length} chemins vérifiés)`)
  return { region: t.key, drops: drops.length, found, removed, errors, apply }
}

module.exports = { purgeRegionResidues, connect, remotePathFor, splitRemote }
