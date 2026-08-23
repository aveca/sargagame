#!/usr/bin/env node
/**
 * provision-gsc.cjs — Provision Google Search Console for the new regions,
 * sans navigateur : Site Verification API (méthode FILE) + upload FTPS du token.
 *
 * Pour chaque région passée en argument (défaut : puntacana florida rivieramaya) :
 *   1. getToken (FILE) → nom de fichier googleXXXX.html + contenu attendu
 *   2. upload du fichier à la racine du site via FTPS (creds FTP_*_<REGION> env)
 *   3. webResource.insert → le service account devient owner vérifié
 *   4. webResource.update → ajoute CO_OWNER humain (GSC_HUMAN_OWNER env, optionnel)
 *   5. searchconsole.sites.add (https://<domain>/) + sitemaps.submit
 *
 * Env requis : GOOGLE_SERVICE_ACCOUNT_JSON, FTP_SERVER_<ID>, FTP_USERNAME_<ID>,
 *              FTP_PASSWORD_<ID> (ID = PUNTACANA|FLORIDA|RIVIERAMAYA)
 * Optionnel : GSC_HUMAN_OWNER (email à ajouter comme co-owner)
 *
 * Idempotent : token FILE stable par (site, SA), re-insert d'un site déjà
 * vérifié = no-op, sites.add d'un site existant = no-op, re-submit sitemap OK.
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { google } = require('googleapis')
const { Client } = require('basic-ftp')
const { getRegion } = require('../../regions/index.cjs')

const REGION_IDS = process.argv.slice(2).filter(a => !a.startsWith('-'))
const TARGETS = REGION_IDS.length ? REGION_IDS : ['puntacana', 'florida', 'rivieramaya']
const HUMAN_OWNER = process.env.GSC_HUMAN_OWNER || ''

function log(...a) { console.log(...a) }

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) { console.error('✗ GOOGLE_SERVICE_ACCOUNT_JSON manquant'); process.exit(1) }
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: [
      'https://www.googleapis.com/auth/siteverification',
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/cloud-platform',
    ],
  })
}

// Active la Site Verification API dans le projet du SA si possible (SA Editor).
// Échec non-fatal : on logge l'URL 1-clic et on tente quand même la suite.
async function ensureApiEnabled(auth) {
  const projectId = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).project_id
  const su = google.serviceusage({ version: 'v1', auth })
  const name = `projects/${projectId}/services/siteverification.googleapis.com`
  try {
    const cur = await su.services.get({ name })
    if (cur.data.state === 'ENABLED') { log('Site Verification API: déjà activée'); return }
    log('Site Verification API: activation…')
    await su.services.enable({ name })
    // propagation
    await new Promise(r => setTimeout(r, 30_000))
    log('Site Verification API: activée ✅')
  } catch (e) {
    log(`⚠️ activation API impossible via SA (${e?.errors?.[0]?.message || e.message})`)
    log(`   → activer à la main (1 clic) : https://console.developers.google.com/apis/api/siteverification.googleapis.com/overview?project=${projectId}`)
  }
}

async function ftpUploadRoot(regionId, localFile, remoteName) {
  const ID = regionId.toUpperCase()
  const server = process.env[`FTP_SERVER_${ID}`]
  const user = process.env[`FTP_USERNAME_${ID}`]
  const pass = process.env[`FTP_PASSWORD_${ID}`]
  if (!server || !user || !pass) throw new Error(`creds FTP_*_${ID} manquants`)
  const client = new Client(30_000)
  try {
    await client.access({ host: server, user, password: pass, secure: true, secureOptions: { rejectUnauthorized: false } })
    await client.uploadFrom(localFile, remoteName) // home dir = docroot du domaine
  } finally {
    client.close()
  }
}

async function main() {
  const auth = getAuth()
  await ensureApiEnabled(auth)
  const sv = google.siteVerification({ version: 'v1', auth })
  const sc = google.searchconsole({ version: 'v1', auth })

  for (const id of TARGETS) {
    const region = getRegion(id)
    const site = { identifier: `https://${region.domain}/`, type: 'SITE' }
    log(`\n=== ${id} — ${region.domain} ===`)

    // 1. Token FILE
    const tok = await sv.webResource.getToken({
      requestBody: { site, verificationMethod: 'FILE' },
    })
    const fileName = tok.data.token // ex: google123abc.html
    const content = `google-site-verification: ${fileName}`
    log(`  token: ${fileName}`)

    // 2. Upload FTPS à la racine
    const tmp = path.join(os.tmpdir(), fileName)
    fs.writeFileSync(tmp, content)
    await ftpUploadRoot(id, tmp, fileName)
    fs.unlinkSync(tmp)
    // contrôle HTTP (cert pas forcément émis → on tolère l'insecure ici, Google vérifie en HTTP aussi)
    log(`  uploadé → https://${region.domain}/${fileName}`)

    // 3. Verify (insert)
    try {
      await sv.webResource.insert({
        verificationMethod: 'FILE',
        requestBody: { site },
      })
      log('  ✅ vérifié (service account owner)')
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e.message
      if (/already|exists/i.test(msg)) log('  ✅ déjà vérifié')
      else throw new Error(`verification failed: ${msg}`)
    }

    // 4. Co-owner humain (best effort) — l'id de la ressource vient de list(),
    //    pas de l'identifier encodé (l'API rejette ce dernier).
    if (HUMAN_OWNER) {
      try {
        const lst = await sv.webResource.list({})
        const item = (lst.data.items || []).find(w => w.site && w.site.identifier === site.identifier)
        if (!item) throw new Error('ressource introuvable dans webResource.list')
        const owners = new Set([...(item.owners || []), HUMAN_OWNER])
        await sv.webResource.update({ id: item.id, requestBody: { id: item.id, site: item.site, owners: [...owners] } })
        log(`  ✅ co-owner ajouté: ${HUMAN_OWNER}`)
      } catch (e) {
        log(`  ⚠️ co-owner non ajouté (${e?.errors?.[0]?.message || e.message}) — la propriété reste accessible via le SA`)
      }
    }

    // 5. Ajout propriété GSC + sitemap
    const siteUrl = site.identifier
    try {
      await sc.sites.add({ siteUrl })
      log('  ✅ propriété GSC ajoutée')
    } catch (e) {
      log(`  propriété GSC: ${e?.errors?.[0]?.message || e.message}`)
    }
    await sc.sitemaps.submit({ siteUrl, feedpath: `${siteUrl}sitemap.xml` })
    log(`  ✅ sitemap soumis: ${siteUrl}sitemap.xml`)
  }
  log('\nDone.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
