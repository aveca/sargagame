#!/usr/bin/env node
/**
 * gen-media-manifest.cjs — media manifest v1 (2026-09-25D)
 *
 * Agrège UNIQUEMENT les assets réellement présents sur disque/catologues du
 * repo (photos réelles par beach id + vidéos hero réelles + score qualité) en
 * un seul `public/data/media-manifest.json` consommable par le front sans
 * re-scanner. RÈGLE D'OR : un id n'apparaît QUE si un asset réel l'existe —
 * sinon absent (jamais de placeholder générique présenté comme vrai média).
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const P = (...p) => path.join(ROOT, ...p)

const loadJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }

const imageMap = loadJSON(P('public', 'data', 'beaches-images.json')) || {}
const imageQual = loadJSON(P('public', 'data', 'beaches-images-quality.json')) || {}
const heroVids = (loadJSON(P('public', 'videos', 'hero', 'manifest.json')) || {}).ids || []

const beaches = {}
for (const [id, file] of Object.entries(imageMap)) {
  const photoPath = P('public', 'beaches', file)
  if (!fs.existsSync(photoPath)) continue // jamais d'entrée sans fichier réel
  beaches[id] = {
    photo: `/beaches/${file}`,
    quality: Number(imageQual[id]) || null,
    heroVideo: heroVids.includes(id) && fs.existsSync(P('public', 'videos', 'hero', `${id}.mp4`))
      ? `/videos/hero/${id}.mp4`
      : null,
    heroVideoWebShadow: heroVids.includes(id) && fs.existsSync(P('public', 'videos', 'hero', `${id}-w.mp4`))
      ? `/videos/hero/${id}-w.mp4`
      : null,
  }
}

const manifest = {
  v: 1,
  generated: new Date().toISOString(),
  rule: 'assets réels uniquement — id absent = pas de média réel (documenté, pas de placeholder)',
  counts: {
    beachesWithPhoto: Object.keys(beaches).length,
    beachesWithVideo: Object.values(beaches).filter(b => b.heroVideo).length,
  },
  beaches,
}
fs.writeFileSync(P('public', 'data', 'media-manifest.json'), JSON.stringify(manifest))
console.log(`[media-manifest] OK — ${manifest.counts.beachesWithPhoto} photos réelles, ${manifest.counts.beachesWithVideo} vidéos hero réelles`)
