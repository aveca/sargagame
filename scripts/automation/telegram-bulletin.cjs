#!/usr/bin/env node
/**
 * Telegram Weekend Bulletin — Sargasses MQ/GP
 *
 * Sends a formatted weekend forecast to Telegram channels every Friday at 17h.
 * Also sends daily status change alerts.
 *
 * Setup:
 * 1. Create a Telegram bot via @BotFather → get BOT_TOKEN
 * 2. Create 2 channels: @sargasses_martinique + @sargasses_guadeloupe
 * 3. Add the bot as admin to both channels
 * 4. Set GitHub Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_MQ, TELEGRAM_CHANNEL_GP
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHANNEL_MQ=@sargasses_mq TELEGRAM_CHANNEL_GP=@sargasses_gp node scripts/automation/telegram-bulletin.cjs
 *   Add --daily for daily alerts (not just weekend)
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHANNEL_MQ = process.env.TELEGRAM_CHANNEL_MQ || '@sargasses_martinique'
const CHANNEL_GP = process.env.TELEGRAM_CHANNEL_GP || '@sargasses_guadeloupe'
const IS_DAILY = process.argv.includes('--daily')

const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const HISTORY_PATH = path.join(__dirname, '../../public/api/copernicus/history.json')

const SARG_TO_BEACH = {
  "grande-anse":"mq014","anse-mitan":"mq011","anse-noire":"mq012","tartane":"mq034",
  "anse-madame":"mq024","diamant":"mq016","pt-marin":"mq008","sainte-anne":"mq004",
  "les-salines":"mq001","vauclin":"mq044",
  "gp-grande-anse":"gp021","gp-malendure":"gp031","gp-sainte-anne":"gp010",
  "gp-pt-chateaux":"gp005","gp-gosier":"gp012","gp-caravelle":"gp009",
  "gp-bas-du-fort":"gp014","gp-deshaies":"gp024","gp-moule":"gp080","gp-vieux-fort":"gp042"
}

function statusEmoji(s) { return s === 'clean' ? '🟢' : s === 'moderate' ? '🟠' : '🔴' }
function statusLabel(s) { return s === 'clean' ? 'Propre' : s === 'moderate' ? 'Modéré' : 'Alerte' }

function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) { console.log(`[DRY RUN] ${chatId}:\n${text}\n`); return Promise.resolve() }
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        if (res.statusCode === 200) { resolve() }
        else { console.warn(`Telegram ${res.statusCode}: ${data.slice(0, 200)}`); resolve() }
      })
    })
    req.on('error', e => { console.warn(`Telegram error: ${e.message}`); resolve() })
    req.write(payload)
    req.end()
  })
}

async function main() {
  console.log(`=== Telegram Bulletin ${IS_DAILY ? '(daily)' : '(weekend)'} ===`)

  let sargData, beaches, history
  try { sargData = JSON.parse(fs.readFileSync(SARG_PATH, 'utf-8')) } catch { console.error('No sargassum.json'); return }
  try { beaches = JSON.parse(fs.readFileSync(BEACHES_PATH, 'utf-8')) } catch { beaches = [] }
  try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')) } catch { history = { changes: [] } }

  const beachMap = {}
  for (const b of beaches) beachMap[b.id] = b

  const isLive = sargData.source === 'erddap-live'
  const updated = sargData.updatedAt?.slice(0, 16).replace('T', ' ') || 'inconnu'

  for (const island of ['mq', 'gp']) {
    const channelId = island === 'mq' ? CHANNEL_MQ : CHANNEL_GP
    const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
    const domain = island === 'mq' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

    // Get beaches for this island
    const islandBeaches = beaches.filter(b => b.island === island)
    const clean = islandBeaches.filter(b => b.status === 'clean')
    const moderate = islandBeaches.filter(b => b.status === 'moderate')
    const avoid = islandBeaches.filter(b => b.status === 'avoid')

    // Weekend forecast — find Saturday data
    const now = new Date()
    const dayOfWeek = now.getDay()
    const isFriday = dayOfWeek === 5
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    if (!IS_DAILY && !isFriday) {
      console.log(`Not Friday (day ${dayOfWeek}), skipping weekend bulletin for ${islandName}`)
      continue
    }

    // Build weekend forecast section
    let weekendSection = ''
    if (sargData.weekly) {
      const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7
      const satIdx = Math.min(daysUntilSat, 6)
      let cleanSat = 0, moderateSat = 0, avoidSat = 0
      const topClean = []

      for (const [sargId, w] of Object.entries(sargData.weekly)) {
        const beachId = SARG_TO_BEACH[sargId]
        if (!beachId || !beachMap[beachId]) continue
        const b = beachMap[beachId]
        if (b.island !== island) continue
        const fc = w.forecast?.[satIdx]
        if (!fc) continue
        if (fc.afai < 0.15) { cleanSat++; topClean.push(b.name) }
        else if (fc.afai < 0.40) moderateSat++
        else avoidSat++
      }

      weekendSection = `\n\n📅 <b>Ce weekend</b>\n`
      weekendSection += `🟢 ${cleanSat} plages propres`
      if (moderateSat > 0) weekendSection += ` · 🟠 ${moderateSat} modérées`
      if (avoidSat > 0) weekendSection += ` · 🔴 ${avoidSat} en alerte`
      if (topClean.length > 0) {
        weekendSection += `\n\n✅ <b>Recommandées :</b>\n${topClean.slice(0, 5).map(n => `  → ${n}`).join('\n')}`
      }
    }

    // Status changes today
    const today = new Date().toISOString().slice(0, 10)
    const todayChanges = (history.changes || []).filter(c => c.date === today && SARG_TO_BEACH[c.beach])
      .filter(c => {
        const beachId = SARG_TO_BEACH[c.beach]
        return beachMap[beachId]?.island === island
      })

    let changesSection = ''
    if (todayChanges.length > 0) {
      changesSection = `\n\n⚡ <b>Changements aujourd'hui</b>\n`
      for (const c of todayChanges) {
        const beachId = SARG_TO_BEACH[c.beach]
        const name = beachMap[beachId]?.name || c.beach
        changesSection += `${statusEmoji(c.from)} → ${statusEmoji(c.to)} ${name}\n`
      }
    }

    // Build message
    const header = IS_DAILY
      ? `🌊 <b>Sargasses ${islandName}</b> — ${today}`
      : `🏖️ <b>Weekend Sargasses ${islandName}</b>`

    const summary = `\n\n📊 <b>Aujourd'hui</b>\n🟢 ${clean.length} propres · 🟠 ${moderate.length} modérées · 🔴 ${avoid.length} alertes`

    const footer = `\n\n🗺️ <a href="https://${domain}">Carte en temps réel</a>`
      + `\n📡 ${isLive ? 'Données satellite NOAA' : 'Estimation'} · ${updated}`

    const message = header + summary + weekendSection + changesSection + footer

    console.log(`\n--- ${islandName} ---`)
    console.log(message.replace(/<[^>]+>/g, ''))

    await sendTelegram(channelId, message)
    console.log(`Sent to ${channelId}`)
  }

  console.log('\nDone.')
}

main().catch(e => console.error(e))
