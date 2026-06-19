#!/usr/bin/env node
/**
 * Supprime les pages SEO cross-domain résiduelles des serveurs FTP LIVE.
 *
 * Contexte : prepare-ftp.cjs retire les MQ_ONLY du build GP et les GP_ONLY du
 * build MQ, mais le deploy FTP n'efface jamais ce qui est DÉJÀ sur le serveur.
 * Un slug passé mono-domaine après un premier déploiement reste orphelin sur
 * l'autre île (éditorial swappé + canonical auto-référent = duplicate-content
 * cross-domain indexable). Ce script ferme la fenêtre côté serveur.
 *
 * Lecture des creds : mêmes variables d'env que manual-ftp-deploy.cjs
 *   FTP_HOST_<ID> | FTP_SERVER_<ID>, FTP_USER_<ID> | FTP_USERNAME_<ID>,
 *   FTP_PASS_<ID> | FTP_PASSWORD_<ID>   (<ID> = MQ, GP, …) ; .env auto-chargé.
 *
 * Usage :
 *   node scripts/purge-cross-domain-residues.cjs            # DRY-RUN (liste)
 *   node scripts/purge-cross-domain-residues.cjs --apply    # supprime live
 *   ONLY=gp node scripts/purge-cross-domain-residues.cjs --apply
 *
 * Seules les régions avec des drops (mq, gp) sont concernées ; les autres sont
 * ignorées. Idempotent : un dossier absent = no-op silencieux.
 */
const { loadProjectEnv } = require('./lib/load-project-env.cjs')
const { getAllRegions } = require('../regions/index.cjs')
const { crossDomainDropsFor } = require('./lib/cross-domain-drops.cjs')
const { purgeRegionResidues } = require('./lib/purge-cross-domain.cjs')

loadProjectEnv()
const env = (k) => process.env[k]

function buildTargets() {
  return getAllRegions().map((r) => {
    const ID = r.id.toUpperCase()
    const user = env(`FTP_USER_${ID}`) || env(`FTP_USERNAME_${ID}`)
    const pass = env(`FTP_PASS_${ID}`) || env(`FTP_PASSWORD_${ID}`)
    const host =
      env(`FTP_HOST_${ID}`) ||
      env(`FTP_SERVER_${ID}`) ||
      (user && pass ? env('FTP_HOST') || env('FTP_SERVER') : undefined)
    return { key: r.id, label: r.name, host, user, pass, domain: r.domain }
  })
}

async function main() {
  const apply = process.argv.includes('--apply')
  const only = process.env.ONLY
  let picked = buildTargets().filter((t) => crossDomainDropsFor(t.key).length > 0)
  if (only) picked = picked.filter((t) => t.key === only)
  if (!picked.length) {
    console.error('Aucune région concernée (régions avec drops : mq, gp).' + (only ? ` ONLY=${only} ne matche pas.` : ''))
    process.exit(1)
  }

  console.log(`${apply ? '🧹 PURGE' : '🔍 DRY-RUN'} résidus cross-domain → ${picked.map((t) => t.key).join(', ')}`)
  let totalFound = 0
  let totalRemoved = 0
  let totalErrors = 0
  let deployedCreds = 0
  for (const t of picked) {
    const res = await purgeRegionResidues(t, { apply })
    if (res.skipped === 'no-creds') continue
    deployedCreds++
    totalFound += res.found || 0
    totalRemoved += res.removed || 0
    totalErrors += res.errors || 0
  }
  console.log(
    `\nBilan : ${totalFound} résidu(s) trouvé(s), ${apply ? totalRemoved + ' supprimé(s)' : 'aucun supprimé (dry-run)'}, ${totalErrors} erreur(s).`,
  )
  if (!deployedCreds) {
    console.error('Aucune région avec creds FTP — rien vérifié.')
    process.exit(1)
  }
  process.exit(totalErrors > 0 ? 1 : 0)
}

if (require.main === module) main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
