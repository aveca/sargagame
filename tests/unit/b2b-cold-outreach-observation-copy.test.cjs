#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { buildC0, buildC4 } = require('../../scripts/automation/b2b-cold-outreach.cjs')

const contacts = [
  { island: 'mq', name: 'Hotel Martinique', town: 'No matching commune', email: 'contact@mq-example.test' },
  { island: 'gp', name: 'Hotel Guadeloupe', town: 'No matching commune', email: 'contact@gp-example.test' },
  { island: 'florida', name: 'Florida Hotel', town: 'No matching commune', email: 'contact@fl-example.test' },
  { island: 'puntacana', name: 'Punta Cana Hotel', town: 'No matching commune', email: 'contact@pc-example.test' },
  { island: 'rivieramaya', name: 'Riviera Maya Hotel', town: 'No matching commune', email: 'contact@rm-example.test' },
]

const unsupportedPositiveClaims = /(?:four times a day|four times daily|4 times a day|every six hours|every 6 hours|every morning|each morning|daily satellite|4 fois par jour|quatre fois par jour|chaque matin|cuatro veces al dia|4 veces al dia|cada manana|real[- ]time|en temps reel|en direct|en vivo|en tiempo real|this morning|right now|clean today|today's clean|before the seaweed lands|alert arrives before|alert lands before|before the sargassum arrives|antes de que llegue el sargazo|alerta antes del desembarque|saison sargasses bat son plein|season is in full swing|temporada de sargazo esta en pleno apogeo)/i

function visibleText(message) {
  return [message.subject, message.preheader, message.html]
    .join(' ')
    .replace(/\sstyle="[^"]*"/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

let assertions = 0
for (const contact of contacts) {
  for (const [step, build] of [['c0', buildC0], ['c4', buildC4]]) {
    const message = build(contact, 'test-prospect')
    const text = visibleText(message)
    assert.doesNotMatch(text, unsupportedPositiveClaims, `${contact.island} ${step}: no unsupported cadence, live status, or advance-alert promise`)
    assert.match(text, /timestamp|horodatage|fecha/, `${contact.island} ${step}: observation date is explicit`)
    assert.match(text, /confidence|confiance|confianza/, `${contact.island} ${step}: confidence is explicit`)
    assert.match(message.html, new RegExp(`https://${contact.island === 'gp' ? 'sargasses-guadeloupe.com' : contact.island === 'florida' ? 'sargassummiami.com' : contact.island === 'puntacana' ? 'sargassumpuntacana.com' : contact.island === 'rivieramaya' ? 'sargassumcancun.com' : 'sargasses-martinique.com'}/pro/espace/`), `${contact.island} ${step}: regional Pro CTA route is preserved`)
    assertions += 4
  }
}

console.log(`B2B_COLD_OUTREACH_OBSERVATION_COPY PASS (${assertions} assertions; 5 regions × 2 sequence steps)`)
