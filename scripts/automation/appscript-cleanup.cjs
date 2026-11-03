#!/usr/bin/env node
/**
 * appscript-cleanup.cjs — Pont Node unique vers l'action Apps Script mutante
 * `clean_bounces` (suppression des adresses en rebond dans la Sheet).
 *
 * Mission P0.23 / issue #1157 : les workflows appelaient cette action par un
 * `curl` shell direct, ce qui contournait totalement le contrat d'autorisation
 * (defaut de review F de la PR #1200). Tout passe desormais par ce module :
 *
 *   - AUCUN appel reseau a l'import du module (defaut de review H)
 *   - DRY-RUN par defaut : sans `--send`, on DECRIT l'action sans l'executer
 *   - `--send` est une DEMANDE, pas une autorisation : l'autorisation reelle
 *     vient de `authorizeActionAsync('apps_script_cleanup')`
 *   - un declencheur `schedule`/`push` ne peut JAMAIS obtenir l'autorisation
 *   - l'URL cible vient de l'environnement (APPS_SCRIPT_URL) ou du deploiement
 *     documente ; sans URL, on echoue en mode ferme (pas de succes silencieux)
 *
 * Remplace, dans .github/workflows :
 *   RESULT=$(curl -sL "$URL?action=clean_bounces")
 *
 * Usage :
 *   node scripts/automation/appscript-cleanup.cjs           # simulation
 *   node scripts/automation/appscript-cleanup.cjs --send    # demande reelle (soumise au contrat)
 */
'use strict'

const { authorizeActionAsync, describeDecision } = require('../lib/outbound-authorization.cjs')

/** Deploiement Apps Script documente (meme cible que l'ancien curl). */
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

const ACTION = 'clean_bounces'

function targetUrl() {
  const fromEnv = (process.env.APPS_SCRIPT_URL || '').trim()
  const base = fromEnv || DEFAULT_APPS_SCRIPT_URL
  const sep = base.includes('?') ? '&' : '?'
  return base + sep + 'action=' + ACTION
}

async function main() {
  const requested = process.argv.includes('--send')
  const url = targetUrl()

  // Autorisation resolue immediatement avant l'appel, jamais a l'import.
  const decision = await authorizeActionAsync('apps_script_cleanup', { requested })
  console.log(describeDecision(decision))

  if (!decision.execute) {
    console.log(`[appscript-cleanup] SIMULATION : appellerait ${ACTION} sur ${url.replace(/\/s\/[^/]+/, '/s/***')} - aucun appel effectue.`)
    return { executed: false, decision }
  }

  console.log(`[appscript-cleanup] Appel autorise de ${ACTION}...`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    const body = await res.text()
    console.log(`[appscript-cleanup] HTTP ${res.status} - ${body.slice(0, 500)}`)
    if (!res.ok) {
      console.error(`[appscript-cleanup] ECHEC : HTTP ${res.status}`)
      process.exitCode = 1
      return { executed: true, decision, status: res.status, ok: false }
    }
    return { executed: true, decision, status: res.status, ok: true }
  } catch (err) {
    console.error(`[appscript-cleanup] ECHEC reseau : ${err && err.message ? err.message : String(err)}`)
    process.exitCode = 1
    return { executed: true, decision, ok: false, error: String(err && err.message ? err.message : err) }
  } finally {
    clearTimeout(timer)
  }
}

// Point d'entree explicite : importer ce module (ex: dans un test) n'appelle
// jamais Apps Script.
if (require.main === module) {
  main().catch((err) => {
    console.error('[appscript-cleanup] ERREUR inattendue :', err)
    process.exit(1)
  })
}

module.exports = { main, targetUrl, DEFAULT_APPS_SCRIPT_URL }
