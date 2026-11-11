#!/usr/bin/env node
/**
 * check-next-session-freshness.cjs — détecte un NEXT_SESSION.md obsolète.
 *
 * NEXT_SESSION.md est le point d'entrée de session pour le fondateur (CLAUDE.md
 * demande de le lire en tête de session). Il n'est mis à jour par aucun agent
 * automatiquement : c'est un artefact manuel, et il pourrit silencieusement
 * (constaté le 2026-11-11 : contenu 2026-07-30 alors que .ai/current_state.md
 * atteint 2026-11-10).
 *
 * Ce script compare la date la plus récente mentionnée dans NEXT_SESSION.md avec
 * celle de .ai/current_state.md (la source de vérité maintenue par les agents).
 * Il sort en code 1 si NEXT_SESSION.md est en retard, 0 sinon, 2 en cas
 * d'erreur d'entrée. Il est déterministe (pas d'horloge) et n'écrit rien.
 *
 * Usage :
 *   node scripts/automation/check-next-session-freshness.cjs
 *   node scripts/automation/check-next-session-freshness.cjs --json
 *   node scripts/automation/check-next-session-freshness.cjs --next-session F --current-state F
 *
 * Activation comme garde-fou (à faire APRÈS avoir rafraîchi NEXT_SESSION.md) :
 *   - dans .github/workflows/ci-tests.yml, ajouter un step
 *       - name: NEXT_SESSION freshness
 *         run: node scripts/automation/check-next-session-freshness.cjs
 *     (sans `continue-on-error` une fois le doc à jour).
 */
'use strict'
const fs = require('fs')
const path = require('path')

function parseArgs (argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) { out._.push(token); continue }
    const eq = token.indexOf('=')
    if (eq !== -1) { out[token.slice(2, eq)] = token.slice(eq + 1); continue }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) { out[key] = true; continue }
    out[key] = next
    i++
  }
  return out
}

function readText (p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { throw new Error(`Cannot read ${p}: ${e.message}`) }
}

function maxDate (text) {
  const matches = text.match(/20\d{2}-\d{2}-\d{2}/g)
  if (!matches || !matches.length) return null
  return matches.slice().sort().pop()
}

function main () {
  const args = parseArgs(process.argv.slice(2))
  const nextPath = args['next-session'] || path.join(process.cwd(), 'NEXT_SESSION.md')
  const statePath = args['current-state'] || path.join(process.cwd(), '.ai', 'current_state.md')
  let nextText, stateText
  try {
    nextText = readText(nextPath)
    stateText = readText(statePath)
  } catch (e) {
    console.error('check-next-session-freshness: ' + e.message)
    return 2
  }
  const nextMax = maxDate(nextText)
  const stateMax = maxDate(stateText)
  if (!nextMax || !stateMax) {
    console.error('check-next-session-freshness: aucune date ISO (YYYY-MM-DD) trouvée dans l\'un des fichiers.')
    return 2
  }
  const stale = nextMax < stateMax
  const result = { stale, nextSessionMaxDate: nextMax, currentStateMaxDate: stateMax, lagDays: null }
  const lag = (Date.parse(stateMax) - Date.parse(nextMax)) / 86400000
  result.lagDays = Math.round(lag)
  if (args.json) {
    console.log(JSON.stringify(result))
  } else if (stale) {
    console.error(`NEXT_SESSION.md OBSOLÈTE : dernière date ${nextMax}, alors que .ai/current_state.md atteint ${stateMax} (${result.lagDays} jour(s) de retard).`)
    console.error('Rafraîchir NEXT_SESSION.md depuis .ai/current_state.md avant de merger.')
  } else {
    console.log(`NEXT_SESSION.md à jour : ${nextMax} >= ${stateMax}.`)
  }
  return stale ? 1 : 0
}

process.exit(main())
