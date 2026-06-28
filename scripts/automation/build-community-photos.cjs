#!/usr/bin/env node
/**
 * build-community-photos.cjs — bake des PHOTOS VISITEURS approuvées → fichier statique.
 *
 * POURQUOI : les visiteurs uploadent une photo dans l'app (BeachReport → Apps Script
 * type:"beach_photo" → Drive + sheet `beach_photos`, status "pending"). La MODÉRATION
 * se fait dans la sheet (passer le status à "approved" ; voir docs/visitor-photos-runbook.md).
 * Ce script fetch UNIQUEMENT les photos approuvées (?action=beach_photos ne renvoie que
 * status=approved) et les bake dans public/api/community/photos.json, lu par BeachPhotos.jsx.
 *
 * Lancé en CI avant le build (continue-on-error). Non bloquant : si l'endpoint échoue ou
 * est vide, on GARDE le fichier existant (jamais d'écrasement par du vide).
 *
 * Usage: node scripts/automation/build-community-photos.cjs
 */
const fs = require('fs')
const path = require('path')

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=beach_photos'
const OUT = path.join(__dirname, '..', '..', 'public', 'api', 'community', 'photos.json')

async function main() {
  let data
  try {
    const res = await fetch(ENDPOINT, { redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (!res.ok) { console.warn(`[photos] HTTP ${res.status} — on garde le fichier existant`); return }
    data = await res.json()
  } catch (e) {
    console.warn('[photos] fetch échoué — on garde le fichier existant:', e.message)
    return
  }
  if (!data || !data.photos || typeof data.photos !== 'object') {
    console.warn('[photos] réponse sans .photos — on garde l\'existant')
    return
  }
  // Garde-fous : ne garder que des entrées bien formées (url http(s), ts présent).
  const beaches = {}
  let n = 0
  for (const [bid, arr] of Object.entries(data.photos)) {
    if (!Array.isArray(arr)) continue
    const clean = arr.filter((p) => p && typeof p.url === 'string' && /^https?:\/\//.test(p.url) && p.ts)
      .map((p) => ({ url: p.url, ts: p.ts, level: p.level || '' }))
    if (clean.length) { beaches[bid] = clean.slice(0, 12); n += clean.length }
  }
  const out = {
    _comment: 'Photos visiteurs APPROUVÉES par plage (preuve du présent). Régénéré par build-community-photos.cjs depuis Apps Script (?action=beach_photos, status=approved). Format : beaches[beachId]=[{url,ts,level}].',
    source: 'app',
    updatedAt: new Date().toISOString(),
    beachCount: Object.keys(beaches).length,
    beaches,
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out))
  console.log(`[photos] écrit ${n} photo(s) sur ${out.beachCount} plage(s) → ${path.relative(process.cwd(), OUT)}`)
}

main()
