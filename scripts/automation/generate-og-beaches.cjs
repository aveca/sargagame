#!/usr/bin/env node
/**
 * generate-og-beaches.cjs
 * Génère les images OG des plages sans présenter une observation ancienne comme actuelle.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib/share-card.cjs')
const sceneSvg = require('../lib/scene-svg.cjs')

const OUT_DIR = path.join(L.ROOT, 'public', 'images', 'og')
const OPERATIONAL_SLA_MINUTES = 900

function parseObservationTimestamp(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value ?? ''))
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

/**
 * A social card is a durable, shareable artifact. It may be viewed long after
 * generation, so it must carry the source observation time and never say "today".
 * The source timestamp is authoritative; updatedAt and dataAgeMinutes are ignored.
 */
function getOgObservationState(payload, level, now = Date.now()) {
  const timestamp = parseObservationTimestamp(payload?.erddapTimestamp)
  const validClock = Number.isFinite(now) && now > 0
  const timestampValid = timestamp !== null && validClock && timestamp <= now
  const ageMs = timestampValid ? now - timestamp : null
  const ageMinutes = ageMs === null ? null : ageMs / 60000
  const sourceLive = payload?.source === 'erddap-live'
  const staleFlagClear = payload?.stale === false
  const statusValid = Boolean(level && Object.prototype.hasOwnProperty.call(L.STATUS, level.status))
  const fresh = sourceLive && staleFlagClear && timestampValid &&
    ageMinutes < OPERATIONAL_SLA_MINUTES && statusValid

  let reason = 'fresh'
  if (!sourceLive) reason = 'non-live-source'
  else if (!validClock) reason = 'invalid-clock'
  else if (timestamp === null) reason = 'invalid-timestamp'
  else if (timestamp > now) reason = 'future-timestamp'
  else if (!staleFlagClear) reason = 'stale-flag'
  else if (ageMinutes >= OPERATIONAL_SLA_MINUTES) reason = 'outside-operational-sla'
  else if (!level) reason = 'missing-level'
  else if (!statusValid) reason = 'invalid-level-status'

  return {
    fresh,
    status: fresh ? level.status : null,
    score: fresh && Number.isFinite(level.score) ? level.score : null,
    afai: fresh && Number.isFinite(level.afai) ? level.afai : null,
    observedAt: sourceLive && timestampValid ? new Date(timestamp).toISOString() : null,
    ageMinutes: ageMinutes === null ? null : Math.floor(ageMinutes),
    reason,
  }
}

function formatObservationTimestamp(iso) {
  if (!iso) return null
  return String(iso).slice(0, 10) + ' ' + String(iso).slice(11, 16) + ' UTC'
}

function buildOgSvg(beach, state) {
  const status = state?.fresh ? state.status : 'unknown'
  const statusStr = state?.fresh && L.STATUS[status]
    ? L.STATUS[status].fr.toLocaleUpperCase('fr-FR')
    : 'À VÉRIFIER'
  const statusColor = state?.fresh && L.STATUS[status]
    ? L.STATUS[status].color
    : L.PALETTE.gold
  const islandName = beach.island === 'mq' ? 'Martinique' : 'Guadeloupe'
  const observedAt = formatObservationTimestamp(state?.observedAt)
  const observationLabel = state?.fresh
    ? 'Observation du ' + observedAt + ' · ' + statusStr
    : observedAt
      ? 'Observation du ' + observedAt + ' · ' + (state?.reason === 'missing-level' || state?.reason === 'invalid-level-status' ? 'STATUT INDISPONIBLE' : 'RETARDÉE')
      : 'Observation satellite à vérifier'

  // Never fall back to beaches-list.json status/AFAl when the live observation
  // is stale or missing. The neutral scene is illustrative only, not a verdict.
  const sceneBeach = state?.fresh
    ? { ...beach, status, afai: state.afai, score: state.score }
    : { ...beach, status: 'unknown', afai: undefined, score: undefined }
  const liveLevel = state?.fresh
    ? { status, score: state.score, afai: state.afai }
    : { status: 'unknown' }

  // No updatedAt is passed: scene-svg must not inject its LIVE publication badge.
  const rawSvg = sceneSvg.buildHeroSvg(sceneBeach, liveLevel, {}, { phase: 'golden' })
  const innerContentMatch = rawSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
  const innerContent = innerContentMatch ? innerContentMatch[1] : ''

  const W = 1200
  const H = 630
  const scale = 1.5
  const dy = -100

  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${L.PALETTE.ink}"/>
    <g transform="translate(0, ${dy}) scale(${scale})">
      ${innerContent}
    </g>
    <rect x="0" y="${H - 240}" width="${W}" height="240" fill="url(#bottomGrad)"/>
    <defs>
      <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${L.PALETTE.ink}" stop-opacity="0"/>
        <stop offset="1" stop-color="${L.PALETTE.ink}" stop-opacity="0.9"/>
      </linearGradient>
    </defs>
    <text x="60" y="${H - 120}" font-family="${L.FONT}" font-size="52" font-weight="900" fill="${L.PALETTE.white}">${L.esc(beach.name)}</text>
    <text x="60" y="${H - 60}" font-family="${L.FONT}" font-size="30" font-weight="600" fill="${L.PALETTE.mut}">Sargasses en ${islandName} · <tspan fill="${statusColor}" font-weight="800">${L.esc(observationLabel)}</tspan></text>
    <text x="${W - 60}" y="${H - 60}" text-anchor="end" font-family="${L.FONT}" font-size="28" font-weight="800" fill="${L.PALETTE.gold}">LE VEILLEUR</text>
  </svg>`
  return ogSvg
}

async function generateOg(beach, state) {
  const ogSvg = buildOgSvg(beach, state)
  const outPath = path.join(OUT_DIR, `${beach.slug}.png`)
  await L.renderSVG(ogSvg, outPath)
  return outPath
}

async function run() {
  const sarg = L.loadSarg()
  const listPath = path.join(L.ROOT, 'public', 'data', 'beaches-list.json')
  const beaches = JSON.parse(fs.readFileSync(listPath, 'utf-8'))
  const levels = new Map((Array.isArray(sarg?.levels) ? sarg.levels : []).map(level => [level.id, level]))

  console.log(`Generating freshness-aware OG images for ${beaches.length} beaches...`)
  let count = 0
  let unverified = 0
  for (const beach of beaches) {
    const sargId = L.PIPELINE_BEACHES[beach.id] ? beach.id : (beach.slug || beach.id)
    const level = levels.get(sargId)
    const state = getOgObservationState(sarg, level)
    if (!state.fresh) unverified++
    await generateOg(beach, state)
    count++
    if (count % 20 === 0) console.log(`  ... ${count}/${beaches.length}`)
  }

  console.log(`✓ Generated ${count} OG images; ${unverified} carry a neutral/unverified observation label.`)
}

if (require.main === module) {
  run().catch(e => {
    console.error('FAIL', e)
    process.exit(1)
  })
}

module.exports = {
  OPERATIONAL_SLA_MINUTES,
  getOgObservationState,
  formatObservationTimestamp,
  buildOgSvg,
  generateOg,
  run,
}
