#!/usr/bin/env node
/**
 * lib.cjs — helpers partagés des Veilleurs (orchestrateur cloud GitHub Actions).
 * Lecture SEULE de la donnée déjà commitée dans le repo : aucun secret requis,
 * aucun effet de bord. Le repo root est déduit depuis scripts/veilleurs/.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const rel = (...p) => path.join(ROOT, ...p)
const loadJSON = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const today = () => new Date().toISOString().slice(0, 10)
const dow = () => new Date().getUTCDay() // 0=dim .. 6=sam (UTC, comme le cron)

function registry() {
  return (loadJSON(rel('scripts', 'veilleurs', 'registry.json'), { veilleurs: [] }).veilleurs) || []
}

/** Photo du jour depuis la donnée repo (verdict + business), best-effort. */
function situation() {
  const s = loadJSON(rel('public', 'api', 'copernicus', 'sargassum.json'), {}) || {}
  const metrics = loadJSON(rel('scripts', 'automation', 'data', 'daily-metrics.json'), []) || []
  const arr = Array.isArray(metrics) ? metrics : []
  const last = arr.length ? arr[arr.length - 1] : null
  const stripeEntry = [...arr].reverse().find(x => x && x.stripe && x.stripe.active != null)
  const st = stripeEntry && stripeEntry.stripe
  return {
    date: today(),
    pipeline: {
      source: s.source || null,
      updatedAt: s.updatedAt || null,
      erddapTimestamp: s.erddapTimestamp || null,
      stale: !!s.stale,
    },
    metrics: last ? { date: last.date, payments: last.payments ?? null, emails: last.emails ?? null, feedbacks: last.feedbacks ?? null } : null,
    mrr: st ? { eur: (st.mrr && (st.mrr.eur ?? st.mrr)) ?? null, active: st.active ?? null, pastDue: st.pastDue ?? null } : null,
  }
}

module.exports = { fs, path, ROOT, rel, loadJSON, today, dow, registry, situation }
