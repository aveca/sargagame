#!/usr/bin/env node
/**
 * Vérifie qu'aucune paire de plages de beaches-list.json n'est à moins de
 * MIN_DIST mètres (pastilles empilées sur la carte = impossibles à ouvrir
 * sans zooms de désambiguïsation successifs).
 *
 * Usage : node scripts/check-beach-proximity.cjs [seuil_en_metres]
 * Exit 1 si au moins une paire est sous le seuil.
 */
const fs = require('fs')
const path = require('path')

const MIN_DIST = Number(process.argv[2]) || 150
const FILE = path.join(__dirname, '..', 'public', 'data', 'beaches-list.json')
const beaches = JSON.parse(fs.readFileSync(FILE, 'utf8'))

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const pairs = []
for (let i = 0; i < beaches.length; i++) {
  for (let j = i + 1; j < beaches.length; j++) {
    const m = haversine(beaches[i].lat, beaches[i].lng, beaches[j].lat, beaches[j].lng)
    if (m < MIN_DIST) pairs.push({ a: beaches[i], b: beaches[j], m: Math.round(m) })
  }
}

pairs.sort((x, y) => x.m - y.m)
for (const p of pairs) {
  console.log(`${p.m}m | ${p.a.id} ${p.a.name} (${p.a.commune}) <-> ${p.b.id} ${p.b.name} (${p.b.commune})`)
}
console.log(`${beaches.length} plages, ${pairs.length} paire(s) < ${MIN_DIST}m`)
process.exit(pairs.length ? 1 : 0)
