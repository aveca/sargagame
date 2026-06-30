#!/usr/bin/env node
/**
 * aggregate-climatology.cjs — CLIMATOLOGIE OBSERVÉE par côte/mois (le moat = honnêteté).
 *
 * POURQUOI : pour le voyageur qui planifie ses vacances à 2-4 semaines, on ne peut PAS faire
 * un verdict jour-par-jour honnête au-delà de ~7 j. La SEULE forme honnête = ce qu'on a
 * RÉELLEMENT OBSERVÉ au satellite sur cette côte à cette période — « observé », jamais
 * « prédit ». Ce script agrège l'historique (public/api/copernicus/history.json) en taux
 * propre/modéré/à-éviter par {île, côte, mois}, AUDITABLE comme /fiabilite/.
 *
 * GARDE-FOUS (zéro fabrication) :
 *  - granularité CÔTE (pas plage : N trop faible) — atlantique-au-vent vs sous-le-vent.
 *  - GATE N≥60 jours-plage par cellule : en-dessous on n'écrit RIEN (section saute).
 *  - on stocke n_samples + n_beaches + la couverture (1ʳᵉ/dernière date, nb de mois distincts)
 *    → le front affiche « observé · juin · n=… », et le bloc planner « état B » ne s'allume
 *    que quand la donnée est là (flag de présence). Tant que l'historique est court, peu de
 *    cellules passent le gate — c'est VOULU (on préfère le vide à un faux).
 *
 * Sortie : scripts/automation/data/climatology-monthly.json (JSON committé, modèle backtest).
 * Idempotent / pur (relit l'historique complet à chaque run). À câbler en step cron
 * (daily-copernicus.yml, schedule only). AUCUN secret requis.
 */
const fs = require('fs')
const path = require('path')

const HISTORY = path.join(__dirname, '../../public/api/copernicus/history.json')
const OUT = path.join(__dirname, 'data/climatology-monthly.json')
const MIN_SAMPLES = 60 // jours-plage minimum par cellule côte-mois pour publier

// Carte plage → {island, coast} (source : scripts/fetch-sargassum-live.cjs, BEACHES).
const BEACH_META = {
  'grande-anse':{island:'mq',coast:'atlantic'}, 'tartane':{island:'mq',coast:'atlantic'},
  'diamant':{island:'mq',coast:'atlantic'}, 'pt-marin':{island:'mq',coast:'atlantic'},
  'sainte-anne':{island:'mq',coast:'atlantic'}, 'les-salines':{island:'mq',coast:'atlantic'},
  'vauclin':{island:'mq',coast:'atlantic'}, 'precheur':{island:'mq',coast:'atlantic'},
  'anse-mitan':{island:'mq',coast:'sheltered'}, 'anse-noire':{island:'mq',coast:'sheltered'},
  'anse-madame':{island:'mq',coast:'sheltered'},
  'gp-sainte-anne':{island:'gp',coast:'atlantic'}, 'gp-pt-chateaux':{island:'gp',coast:'atlantic'},
  'gp-gosier':{island:'gp',coast:'atlantic'}, 'gp-caravelle':{island:'gp',coast:'atlantic'},
  'gp-bas-du-fort':{island:'gp',coast:'atlantic'}, 'gp-moule':{island:'gp',coast:'atlantic'},
  'gp-vieux-fort':{island:'gp',coast:'atlantic'},
  'gp-grande-anse':{island:'gp',coast:'sheltered'}, 'gp-malendure':{island:'gp',coast:'sheltered'},
  'gp-deshaies':{island:'gp',coast:'sheltered'},
}

function main(){
  let history = []
  try { const raw = JSON.parse(fs.readFileSync(HISTORY, 'utf-8')); history = raw.history || raw || [] }
  catch (e) { console.error('[climatology] lecture history.json impossible:', e.message); process.exit(0) }
  if (!Array.isArray(history) || !history.length) { console.log('[climatology] historique vide — skip'); return }

  // stats[`${island}|${coast}|${month}`] = {clean,moderate,avoid,total,beaches:Set,dates:Set}
  const stats = {}
  for (const entry of history) {
    if (!entry || !entry.date || !Array.isArray(entry.levels)) continue
    const month = parseInt(String(entry.date).split('-')[1], 10)
    if (!(month >= 1 && month <= 12)) continue
    for (const lvl of entry.levels) {
      const meta = BEACH_META[lvl && lvl.id]; if (!meta) continue
      const st = lvl.status; if (st !== 'clean' && st !== 'moderate' && st !== 'avoid') continue
      const k = `${meta.island}|${meta.coast}|${month}`
      const s = stats[k] || (stats[k] = { clean:0, moderate:0, avoid:0, total:0, beaches:new Set(), dates:new Set() })
      s[st]++; s.total++; s.beaches.add(lvl.id); s.dates.add(entry.date)
    }
  }

  const cells = []
  let published = 0, skipped = 0
  for (const [k, s] of Object.entries(stats)) {
    const [island, coast, month] = k.split('|')
    if (s.total < MIN_SAMPLES) { skipped++; continue }
    const dates = [...s.dates].sort()
    cells.push({
      island, coast, month: parseInt(month, 10),
      clean_rate: Math.round(s.clean / s.total * 100),
      moderate_rate: Math.round(s.moderate / s.total * 100),
      avoid_rate: Math.round(s.avoid / s.total * 100),
      n_samples: s.total, n_beaches: s.beaches.size,
      first_date: dates[0], last_date: dates[dates.length - 1],
    })
    published++
  }
  cells.sort((a,b)=> a.island.localeCompare(b.island) || a.coast.localeCompare(b.coast) || a.month-b.month)

  const out = {
    note: 'OBSERVÉ au satellite (pas prédit). Taux par côte/mois, gate N>=' + MIN_SAMPLES + ' jours-plage. Auditable comme /fiabilite/.',
    min_samples: MIN_SAMPLES,
    history_span: history.length ? { first: history[0].date, last: history[history.length-1].date, days: history.length } : null,
    cells,
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`[climatology] ${published} cellule(s) publiée(s), ${skipped} sous le gate (N<${MIN_SAMPLES}). → ${path.relative(process.cwd(), OUT)}`)
}

main()
