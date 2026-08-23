#!/usr/bin/env node
/**
 * build-citizen-accuracy.cjs — Accuracy VALIDÉE CITOYEN (report-vs-prédiction). Sprint #3.
 *
 * Le moat « sell the track record » a une 2e validation, plus crédible que le satellite seul :
 * comparer nos PRÉVISIONS (jour-0 publié, figé dans forecast-archive.json) aux SIGNALEMENTS
 * communautaires réels datés (reports-log.json, recent24h). C'est la méthode NOAA/Epicollect :
 * la vérité-terrain citoyenne voit AUSSI le sargasse déjà échoué sur le sable que le satellite
 * ne voit pas. Personne d'autre (USF / Météo-France / CLS) ne publie ça pour le grand public.
 *
 * HONNÊTETÉ (doctrine projet) : on ne publie un % QUE si l'échantillon est suffisant (N >= MIN_N) ;
 * sinon statut = "validating" (« en cours, N=… »). Toujours lié à sa fenêtre. forecast-archive et
 * reports-log sont append-only → aucun chiffre rétro-ajustable.
 *
 * Entrées : public/api/community/reports-log.json  (journal daté des signalements, append-only)
 *           public/api/copernicus/forecast-archive.json (snapshots de prévisions figés)
 * Sortie  : public/api/copernicus/citizen-accuracy.json
 *
 * Usage : node scripts/automation/build-citizen-accuracy.cjs
 */
const fs = require('fs')
const path = require('path')

const LOG = path.join(__dirname, '..', '..', 'public', 'api', 'community', 'reports-log.json')
const ARCHIVE = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus', 'forecast-archive.json')
const OUT = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus', 'citizen-accuracy.json')
const MIN_N = 30 // sous ce seuil : pas de % publié, statut "validating"

const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }

function main() {
  const log = load(LOG, { logByDate: {} })
  const arch = load(ARCHIVE, { snapshots: [] })

  // Index : pour une date D, le statut PRÉVU jour-0 par plage (depuis le snapshot émis le jour D —
  // ce qu'on affichait CE jour-là). C'est notre nowcast publié, à confronter au signalement du jour.
  const predByDate = {}
  for (const snap of (arch.snapshots || [])) {
    const d = snap.date
    if (!d) continue
    const m = predByDate[d] || (predByDate[d] = {})
    for (const [id, f] of Object.entries(snap.forecasts || {})) {
      const series = f.forecast || []
      const day0 = series.find(x => x.date === d) || series[0]
      if (day0 && day0.status) m[id] = day0.status
    }
  }

  // Match signalement daté ↔ prévision du jour
  let hit = 0, n = 0
  const dates = []
  const byStatus = { clean: { hit: 0, n: 0 }, moderate: { hit: 0, n: 0 }, avoid: { hit: 0, n: 0 } }
  for (const [date, beaches] of Object.entries(log.logByDate || {})) {
    const pred = predByDate[date]
    if (!pred) continue
    for (const [id, rep] of Object.entries(beaches)) {
      const ps = pred[id]
      if (!ps || !rep || !rep.status) continue
      n++
      const ok = ps === rep.status
      if (ok) hit++
      dates.push(date)
      const b = byStatus[rep.status]
      if (b) { b.n++; if (ok) b.hit++ }
    }
  }
  const sorted = [...new Set(dates)].sort()
  const window = sorted.length ? { from: sorted[0], to: sorted[sorted.length - 1], days: sorted.length } : null
  const pct = a => (a.n ? Math.round((a.hit / a.n) * 100) : null)

  const out = {
    _comment: 'Accuracy VALIDÉE CITOYEN : nos prévisions (jour-0 publié, forecast-archive append-only) vs les SIGNALEMENTS communautaires datés (reports-log, recent24h). Vérité-terrain qui voit aussi le sargasse échoué. Lié à fenêtre + N, jamais un global nu. Publié seulement si N>=' + MIN_N + '.',
    method: 'Chaque signalement frais (dernières 24h) est comparé au statut que nous AFFICHIONS ce jour-là (mer propre / modéré / éviter). Le taux = % de concordance prévision↔signalement réel.',
    updatedAt: new Date().toISOString(),
    n,
    hitRate: n ? Math.round((hit / n) * 100) : null,
    byStatus: { clean: { n: byStatus.clean.n, rate: pct(byStatus.clean) }, moderate: { n: byStatus.moderate.n, rate: pct(byStatus.moderate) }, avoid: { n: byStatus.avoid.n, rate: pct(byStatus.avoid) } },
    window,
    minSample: MIN_N,
    publishable: n >= MIN_N,
    status: n >= MIN_N ? 'published' : 'validating',
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1))
  console.log(`[citizen-accuracy] N=${n} hit=${hit} → ${out.hitRate == null ? '(aucune donnée)' : out.hitRate + '%'} | ${out.status}${window ? ' | ' + window.from + '→' + window.to : ''}`)
}

main()
