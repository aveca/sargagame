#!/usr/bin/env node
'use strict'
/**
 * code-only-invariance.test.cjs — preuve que la « code-only release » ne
 * modifie AUCUNE surface scientifique, commerciale, Worker ou sécurité
 * (mission P0.118 §9).
 *
 * Le test délègue à scripts/verify-code-only-release.cjs, qui compare
 * l'arbre de travail à un manifeste SHA-256 tiré du BASELINE PRODUCTION
 * exact (164d70fd). Il ne dépend pas de git à l'exécution : le manifeste est
 * versionné, donc la preuve tient en CI comme en local.
 */

const assert = require('node:assert/strict')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

function main() {
  let out = ''
  let exitCode = 0
  try {
    out = execFileSync('node', [path.join(ROOT, 'scripts', 'verify-code-only-release.cjs')], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    exitCode = error.status == null ? 1 : error.status
    out = String(error.stdout || '') + String(error.stderr || '')
  }
  process.stdout.write(out)

  t(exitCode === 0, 'le vérificateur d\'invariance passe (exit 0)')
  t(/CODE_ONLY_INVARIANCE : \d+\/\d+ contrôles OK/.test(out), 'le rapport d\'invariance est complet')
  t(/aucun fichier sensible modifié dans le commit \(0\)/.test(out), 'aucun fichier sensible modifié (observations, scores, prévisions, prix, checkout, paiement, Worker, routes)')
  t(/aucun fichier sensible absent du commit \(0\)/.test(out), 'aucun fichier sensible absent')
  t(/aucune dérive hors artefacts de build/.test(out), 'aucune dérive des fichiers sensibles dans l\'arbre de travail hors artefacts de build')
  t(/OBSERVATION inchangée après rebuild/.test(out), 'l\'observation (erddapTimestamp) est inchangée après rebuild')
  t(/levels inchangés après rebuild/.test(out), 'les levels sont inchangés après rebuild')
  t(/scores inchangés après rebuild/.test(out), 'les scores sont inchangés après rebuild')
  t(/weekly forecasts inchangés après rebuild/.test(out), 'les weekly forecasts sont inchangés après rebuild')
  t(/aucun fichier sensible ajouté/.test(out), 'aucun fichier sensible ajouté')
  t(/diff vs baseline limité aux chemins autorisés/.test(out), 'le diff vs baseline ne contient que les chemins autorisés')
  t(/seuil PUBLIC inchangé à 36 h/.test(out), 'le seuil public 36 h est inchangé')
  t(/SLA opérationnel à 900 min, jamais abaissé/.test(out), 'le SLA opérationnel reste à 900 minutes')

  console.log(`\nCODE_ONLY_INVARIANCE_TESTS PASS (${n} assertions)`)
}

main()
