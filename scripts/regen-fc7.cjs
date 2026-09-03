#!/usr/bin/env node
/**
 * regen-fc7 — réaligne les fichiers publics fc7/<id>.json sur les séries privées
 * `_private/forecast-full.json` COMMITÉES (miroir exact de la génération faite par
 * writePrivateForecastFile dans fetch-sargassum-live.cjs).
 *
 * Usage : suite à un commit de data pipeline qui a mis à jour les séries privées
 * sans régénérer fc7 (détecté par scripts/lib/fc7-alignment.test.cjs).
 * Déterministe : aucune donnée nouvelle inventée, simple recopie de l'existant.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const BASE = path.join(__dirname, '..', 'public', 'api', 'copernicus')
const dirs = ['.'].concat(
  fs.readdirSync(BASE, { withFileTypes: true })
    .filter((d) => { try { return d.isDirectory() && d.name !== 'fc7' && !d.name.startsWith('_') } catch { return false } })
    .map((d) => d.name)
)

let total = 0, purged = 0
for (const d of dirs) {
  const baseDir = path.join(BASE, d)
  const privPath = path.join(baseDir, '_private', 'forecast-full.json')
  if (!fs.existsSync(privPath)) continue
  const priv = JSON.parse(fs.readFileSync(privPath, 'utf-8'))
  const forecasts = priv.weekly || {}
  const updatedAt = priv.updatedAt
  const fc7Dir = path.join(baseDir, 'fc7')
  fs.mkdirSync(fc7Dir, { recursive: true })
  // Purge orphelins (miroir de la règle pipeline)
  for (const f of fs.readdirSync(fc7Dir)) {
    if (!f.endsWith('.json')) continue
    if (!forecasts[f.slice(0, -5)]) { try { fs.unlinkSync(path.join(fc7Dir, f)); purged++ } catch { /* noop */ } }
  }
  for (const [id, fc] of Object.entries(forecasts)) {
    if (!Array.isArray(fc) || fc.length < 2) continue
    fs.writeFileSync(path.join(fc7Dir, `${id}.json`), JSON.stringify({ ok: true, id, updatedAt, forecast: fc }), 'utf-8')
    total++
  }
  console.log(`${d} → ${Object.keys(forecasts).length} séries fc7`)
}
console.log(`\nfc7 régénérés : ${total} fichiers (+${purged} purgés)`)
