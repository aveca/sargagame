#!/usr/bin/env node
/**
 * Build Track Record — artefact PUBLIC et auditable du palmarès des prévisions.
 *
 * Le moat B2B = « sell the track record, not the map ». Un hôtel ou une
 * collectivité n'achète pas la carte (les cartes grossières gratuites existent),
 * il achète la PREUVE datée que nos prévisions par-plage se vérifient.
 *
 * Ce script est un PUR TRANSFORM de la sortie interne du backtest
 * (scripts/automation/data/backtest-results.json — SOURCE UNIQUE des chiffres,
 * jamais recalculés ici) vers un artefact servable, honnête, par-plage et
 * par-régime : public/api/copernicus/track-record.json.
 *
 * Honnêteté (doctrine projet) : on ne publie JAMAIS un global seul — il masque
 * que les ALERTES de saison calme sont moins fiables que les « mer propre ». On
 * lie toujours le chiffre à sa fenêtre + sa taille d'échantillon. La source
 * (forecast-archive.json) est append-only → aucun chiffre rétro-ajustable.
 *
 * Usage : node scripts/automation/build-track-record.cjs
 */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, 'data/backtest-results.json')
const OUT = path.join(__dirname, '../../public/api/copernicus/track-record.json')

// Les 20 plages réellement suivies (prévision + historique) = miroir de
// BEACHES_META dans backtest-forecast.cjs. C'est le set VENDABLE : un hôtel
// proche de l'une d'elles dispose d'un palmarès daté. Libellés humains FR.
// Si une plage est ajoutée/déplacée là-bas, la refléter ici (sinon l'id brut
// est servi tel quel — dégradation gracieuse, jamais de crash).
const BEACH_LABELS = {
  'grande-anse':    { name: "Grande Anse d'Arlet",        island: 'mq' },
  'anse-mitan':     { name: 'Anse Mitan',                 island: 'mq' },
  'anse-noire':     { name: 'Anse Noire',                 island: 'mq' },
  'tartane':        { name: 'Tartane (Caravelle)',        island: 'mq' },
  'anse-madame':    { name: 'Anse Madame',                island: 'mq' },
  'diamant':        { name: 'Le Diamant',                 island: 'mq' },
  'pt-marin':       { name: 'Pointe Marin (Sainte-Anne)', island: 'mq' },
  'sainte-anne':    { name: 'Sainte-Anne',                island: 'mq' },
  'les-salines':    { name: 'Les Salines',                island: 'mq' },
  'vauclin':        { name: 'Le Vauclin',                 island: 'mq' },
  'gp-grande-anse': { name: 'Grande Anse (Trois-Rivières)', island: 'gp' },
  'gp-malendure':   { name: 'Malendure (Bouillante)',     island: 'gp' },
  'gp-sainte-anne': { name: 'Sainte-Anne',                island: 'gp' },
  'gp-pt-chateaux': { name: 'Pointe des Châteaux',        island: 'gp' },
  'gp-gosier':      { name: 'Le Gosier',                  island: 'gp' },
  'gp-caravelle':   { name: 'Plage de la Caravelle',      island: 'gp' },
  'gp-bas-du-fort': { name: 'Bas du Fort',                island: 'gp' },
  'gp-deshaies':    { name: 'Deshaies',                   island: 'gp' },
  'gp-moule':       { name: 'Le Moule',                   island: 'gp' },
  'gp-vieux-fort':  { name: 'Vieux-Fort',                 island: 'gp' },
}

function main() {
  let bt
  try {
    bt = JSON.parse(fs.readFileSync(SRC, 'utf-8'))
  } catch {
    console.log("Pas de backtest-results.json — track record sauté (s'accumule sur les runs).")
    return
  }

  if (!bt.byBeach || !Object.keys(bt.byBeach).length) {
    console.log('Backtest sans byBeach (pas assez de paires prévision/observation) — track record sauté.')
    return
  }

  const win = bt.dateRange || {}
  const days = win.archiveFrom && win.archiveTo
    ? Math.round((new Date(win.archiveTo) - new Date(win.archiveFrom)) / 864e5) + 1
    : null

  // byHorizon → tableau J+1..J+6 (justesse qui décroît puis remonte = la
  // persistance gagne aux horizons longs en saison calme ; on publie tel quel).
  const byHorizon = Object.entries(bt.byHorizon || {})
    .map(([k, v]) => ({ day: parseInt(k.replace('day', ''), 10), hitRatePct: v.statusHitRate, pairs: v.pairs }))
    .filter(h => h.day >= 1)
    .sort((a, b) => a.day - b.day)

  // byBeach → libellés humains + tri (île, puis justesse décroissante).
  const byBeach = Object.entries(bt.byBeach)
    .map(([id, v]) => {
      const meta = BEACH_LABELS[id] || {}
      return {
        id,
        name: meta.name || id,
        island: meta.island || null,
        samples: v.pairs,
        hitRatePct: v.statusHitRate,
        afaiMAE: v.afaiMAE,
      }
    })
    .sort((a, b) => (a.island || '').localeCompare(b.island || '') || b.hitRatePct - a.hitRatePct)

  // Régimes : on reprend le bloc honnête DÉJÀ calculé par le backtest
  // (jamais un global masquant ; chaque régime split clean/alerte).
  const regimes = (bt.regimeReliability && bt.regimeReliability.regimes) || {}

  const out = {
    _note: "Palmarès PUBLIC et auditable des prévisions sargasses. Source : forecast-archive.json (snapshots figés à la date d'émission, append-only) comparés aux observations satellite (history.json). Aucun chiffre n'est rétro-ajustable.",
    generatedAt: new Date().toISOString(),
    window: { from: win.archiveFrom || null, to: win.archiveTo || null, days },
    sampleSize: bt.totalPairs || null,
    regions: ['mq', 'gp'],
    method: "Chaque jour, la prévision J+1→J+6 émise est figée. On la compare ensuite à l'observation satellite réelle à l'échéance. Le « taux de justesse » = % de jours où le statut prévu (mer propre / modéré / éviter) correspond à l'observé.",
    overall: {
      statusHitRatePct: (bt.overall || {}).statusHitRate ?? null,
      afaiMAE: (bt.overall || {}).afaiMAE ?? null,
      caveat: "Chiffre global, tous régimes confondus — fourni pour transparence, mais un global masque que les ALERTES de saison calme sont moins fiables que les prévisions « mer propre ». Voir byRegime.",
    },
    byHorizon,
    byRegime: regimes,
    headline: (bt.regimeReliability || {}).headline || null,
    byBeach,
    disclaimer: "Au-delà de J+3 la fiabilité décroît (prévision indicative). Les alertes (sargasses attendues) sont émises à confiance prudente tant que la donnée satellite ne les confirme pas. La période couverte est dans « window » ; les chiffres sont recalculés à chaque mise à jour de l'archive.",
    source: { mq: 'https://sargasses-martinique.com', gp: 'https://sargasses-guadeloupe.com' },
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`Track record écrit : ${OUT}`)
  console.log(`  Fenêtre ${out.window.from} → ${out.window.to} (${days}j) | ${out.sampleSize} paires | ${byBeach.length} plages`)
  if (out.headline?.fr) console.log(`  Headline FR: ${out.headline.fr.slice(0, 90)}...`)
}

main()
