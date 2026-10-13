#!/usr/bin/env node
// tests/unit/data-publish-idempotence.test.cjs — régression publication données
// (sessions 13/10/2026 : daily-copernicus schedule échouait à "Commit + push des
// données" et Data Freshness échouait systématiquement en fin de run ALORS QUE
// le push des données avait réussi). Causes prouvées par les logs :
//   1. `gh workflow run cloudflare-production.yml` => HTTP 403 systématique
//      (GITHUB_TOKEN sans actions:write) APRÈS un push réussi — échec garanti.
//   2. Exécutions concurrentes (schedule + dispatch + veilleurs) : le même
//      refresh est commité/poussé par plusieurs runs ; le perdant de la course
//      échouait au lieu de reconnaître que les données étaient publiées.
// Ce test verrouille :
//   1. Aucun dispatch `gh workflow run cloudflare-production` dans data-refresh.yml
//      ni dans daily-copernicus.yml (le GITHUB_TOKEN ne peut pas le faire ; la
//      publication est couverte par le cron et les triggers du workflow de prod).
//   2. La garde d'idempotence existe dans les 4 boucles de push concernées
//      (fetch-data x2 fichiers, email state, data-refresh) : après rebase réussi,
//      si les données sont déjà sur main, le run est vert (publication acquise).
//   3. Aucune logique de publication supprimée par erreur : garde « rien à commit »
//      (exit 0), boucle de push avec rebase -X theirs, échec après 5 tentatives
//      UNIQUEMENT si divergence réelle non poussable, alerte conservée.
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const ROOT = path.resolve(__dirname, '..', '..')

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const dr = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'data-refresh.yml'), 'utf8')
const dc = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'daily-copernicus.yml'), 'utf8')

// 1. Dispatch interdit absent des deux fichiers.
t(!/gh workflow run\s+cloudflare-production(\.yml)?/.test(dr), 'data-refresh : aucun dispatch cloudflare-production (échec 403 garanti supprimé)')
t(!/gh workflow run\s+cloudflare-production(\.yml)?/.test(dc), 'daily-copernicus : aucun dispatch cloudflare-production (échec 403 garanti supprimé)')

// 2. Garde d'idempotence présente dans les 4 boucles.
t(/Donn[ée]es d[ée]j[àa] publi[ée]es par une ex[ée]cution concurrente/.test(dr), 'data-refresh : garde idempotence (publication acquise en cas de doublon)')
t((dc.match(/Donn[ée]es d[ée]j[àa] publi[ée]es par une ex[ée]cution concurrente/g) || []).length >= 1, 'daily-copernicus (fetch-data) : garde idempotence')
t(/[ÉE]tat email d[ée]j[àa] publi[ée] par une ex[ée]cution concurrente/.test(dc), 'daily-copernicus (email state) : garde idempotence')

// 3. Logique de publication préservée (rien d'autre n'a été retiré).
for (const [name, src] of [['data-refresh', dr], ['daily-copernicus', dc]]) {
  t(/git diff --cached --quiet/.test(src), `${name} : garde « rien à commit » conservée`)
  t(/git rebase -X theirs/.test(src), `${name} : rebase -X theirs conservé`)
  t(/git push a [ée]chou[ée] apr[èe]s 5 tentatives/.test(src), `${name} : échec après 5 tentatives conservé (divergence réelle)`)
}
t(/Alerte/.test(dr), 'data-refresh : étape d alerte conservée')
t(/Alerte/.test(dc), 'daily-copernicus : étape d alerte conservée')

console.log(`\nDATA_PUBLISH_IDEMPOTENCE_TESTS PASS (${n} assertions)`)
