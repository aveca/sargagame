#!/usr/bin/env node
'use strict';

/**
 * compute-publication-slot.cjs — écrit le SLOT DE PUBLICATION du run courant
 * dans `$GITHUB_OUTPUT` (famille + caractère canonique).
 *
 * La décision elle-même vit dans `scripts/lib/copernicus-publication-slot.cjs`
 * (source unique, testée sans horloge) ; ce script n'est qu'un adaptateur
 * mince vers l'interface GitHub Actions.
 *
 * Usage :
 *   node scripts/automation/compute-publication-slot.cjs \
 *     --event-name "$GITHUB_EVENT_NAME" --schedule "${{ github.event.schedule }}"
 *
 * Sortie console (lisible dans les logs du run) :
 *   PUBLICATION_SLOT family=dense canonical=false minute=15 hour=0
 *
 * En mode `--now <ISO>` l'horodatage est forcé : c'est le mode utilisé par
 * les tests (aucune dépendance à l'horloge du runner).
 */

const fs = require('node:fs')
const {
  classifyPublicationSlot,
  FAMILIES,
  DENSE_SCHEDULE,
  CANONICAL_SCHEDULES
} = require('../lib/copernicus-publication-slot.cjs')

function parseArgs(argv) {
  const args = argv.slice(2)
  const A = (name) => {
    const i = args.indexOf('--' + name)
    if (i < 0) return null
    const value = args[i + 1]
    // Un flag suivi d'un AUTRE flag (ou de rien) vaut « absent » : sinon
    // `--schedule --now X` consommerait `--now` comme valeur du cron.
    if (value === undefined || value.startsWith('--')) return ''
    return value
  }
  return {
    eventName: A('event-name'),
    schedule: A('schedule'),
    now: A('now')
  }
}

function main() {
  const { eventName, schedule, now } = parseArgs(process.argv)
  const event = eventName != null ? eventName : (process.env.EVENT_NAME || '')
  const cron = schedule != null ? schedule : (process.env.SCHEDULE || '')
  const nowValue = now != null ? now : undefined

  const slot = classifyPublicationSlot({ eventName: event, schedule: cron, now: nowValue })

  const lines = [
    `family=${slot.family}`,
    `canonical=${slot.canonical ? 'true' : 'false'}`,
    `minute=${slot.minute === null ? '' : slot.minute}`,
    `hour=${slot.hour === null ? '' : slot.hour}`
  ]

  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath) {
    try {
      fs.appendFileSync(outputPath, lines.join('\n') + '\n', 'utf8')
    } catch (error) {
      // Fail-closed : sans $GITHUB_OUTPUT exploitable, le run ne doit pas
      // laisser croire qu'un slot canonique a été établi.
      console.error('::error::impossible d’écrire GITHUB_OUTPUT : ' + (error && error.message))
      process.exit(1)
    }
  }

  console.log(
    `PUBLICATION_SLOT family=${slot.family} canonical=${slot.canonical ? 'true' : 'false'} ` +
    `minute=${slot.minute === null ? '' : slot.minute} hour=${slot.hour === null ? '' : slot.hour} ` +
    `schedule=${JSON.stringify(slot.schedule)} event=${JSON.stringify(slot.eventName)}`
  )
  console.log(
    `PUBLICATION_SLOT_CONTRACT dense=${JSON.stringify(DENSE_SCHEDULE)} ` +
    `canonical_crons=${JSON.stringify(CANONICAL_SCHEDULES)} families=${JSON.stringify(Object.values(FAMILIES))}`
  )
}

if (require.main === module) main()

module.exports = { parseArgs, main }
