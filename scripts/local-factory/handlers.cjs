'use strict'
/**
 * handlers.cjs — CATALOGUE FERMÉ de jobs exécutables par l'usine locale.
 * ---------------------------------------------------------------------------
 * SÉCURITÉ (poka-yoke, non négociable) : la file ne transporte QUE des jobs
 * NOMMÉS avec une payload de DONNÉES. Il n'existe AUCUN handler shell/exec/eval,
 * aucun champ « command/module/script ». Un type inconnu est refusé. => une URL
 * ou un commit ne peut PAS faire exécuter du code arbitraire (RCE non exprimable).
 *
 * JIDOKA (Toyota) : tout handler à sortie publiable hérite de withFreshnessGate()
 * → il s'auto-abstient sur donnée satellite périmée (le moat en machinerie).
 *
 * Ce fichier est la SEULE source de vérité des jobs runnables (importé par
 * factory.cjs --serve, et plus tard par le drain cloud) — ils ne peuvent pas
 * diverger sur ce qui est exécutable. Toute PR qui y ajoute un handler = revue
 * sécurité (un handler exec introduit ici = RCE-as-a-service).
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { publishFreshness } = require('../video/storyboard.cjs')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'scripts', 'video', 'out')
const REGIONS = ['mq', 'gp', 'puntacana', 'florida', 'rivieramaya']

// Garde-fou fraîcheur partagé : le job saute proprement si la donnée n'est pas publiable.
function withFreshnessGate(fn) {
  return (payload) => {
    const region = (payload && payload.region) || 'mq'
    const isNew = !['mq', 'gp'].includes(region)
    const p = path.join(ROOT, 'public/api/copernicus', isNew ? region : '', 'sargassum.json')
    let sarg = null
    try { sarg = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) {}
    const f = publishFreshness(sarg || {})
    if (!f.ok) return { skipped: 'stale', region, reason: f.reason }
    return fn(payload, { freshness: f })
  }
}

const todayStr = () => new Date().toISOString().slice(0, 10)

// ── Le catalogue. UNIQUEMENT des tâches nommées, jamais du code. ──────────────
const HANDLERS = {
  // Rend le Brief plage d'une région (idempotent : skip si déjà rendu aujourd'hui).
  render_brief: withFreshnessGate((payload) => {
    const region = (payload && payload.region) || 'mq'
    if (!REGIONS.includes(region)) throw new Error('région invalide: ' + region)
    const marker = path.join(OUT, `brief-${region}-${todayStr()}.mp4`)
    if (fs.existsSync(marker) && fs.statSync(marker).size > 100000) return { skipped: 'exists', region }
    const r = spawnSync('node', [path.join(ROOT, 'scripts', 'video', 'make-brief.cjs'), region],
      { cwd: ROOT, encoding: 'utf8', timeout: 8 * 60000 })
    const outStr = String(r.stdout || '') + String(r.stderr || '')
    if (/BRIEF_SKIPPED_STALE/.test(outStr)) return { skipped: 'stale', region }
    const done = fs.existsSync(marker) && fs.statSync(marker).size > 100000
    if (r.status === 0 && done) return { rendered: region, mb: +(fs.statSync(marker).size / 1e6).toFixed(2) }
    throw new Error('render échec ' + region + ' code=' + r.status + ' ' + outStr.trim().slice(-200))
  }),
}

module.exports = { HANDLERS, withFreshnessGate }
