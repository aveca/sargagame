'use strict'
// Tests du contrat de prévision partagé (scripts/lib/forecast-contract.cjs).
// Couvre : jours invalides/missing → null (jamais fabriqués), tendance réelle,
// détection du changement quotidien (boucle de retour).

const {
  normalizeForecastDay, normalizeForecast, hasDays,
  trendFromDays, localDayKey, dailyChange,
} = require('./forecast-contract.cjs')

let fails = 0
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg) }
  else { fails++; console.error('  ✗ ' + msg) }
}

console.log('forecast-contract — normalisation')
ok(normalizeForecastDay(null) === null, 'jour null → null')
ok(normalizeForecastDay({}) === null, 'jour sans status → null')
ok(normalizeForecastDay({ status: 'nope' }) === null, 'status inconnu → null')
{
  const d = normalizeForecastDay({ day: 'Auj.', date: '2026-09-02', afai: 0.05, status: 'clean', confidence: 60, type: 'observation' })
  ok(d && d.status === 'clean' && d.afai === 0.05 && d.confidence === 60, 'jour valide conservé')
}
{
  const d = normalizeForecastDay({ status: 'avoid', confidence: 999, afai: -3 })
  ok(d && d.confidence === 100 && d.afai === null, 'confidence clampée 0-100, afai négatif → null')
}
{
  const d = normalizeForecastDay({ status: 'clean', date: '02/09/2026' })
  ok(d && d.date === null, 'date non ISO → null (pas de valeur par défaut)')
}

console.log('forecast-contract — série')
ok(normalizeForecast('nope').length === 0, 'entrée non-tableau → []')
ok(normalizeForecast([{ status: 'nope' }, { status: 'plop' }]).length === 0, 'série 100% invalide → []')
{
  const s = normalizeForecast([
    { day: 'Auj.', date: '2026-09-02', afai: 0.05, status: 'clean', confidence: 60 },
    null,
    { day: 'Jeu', date: '2026-09-04', afai: 0.2, status: 'moderate', confidence: 50 },
  ])
  ok(s.length === 3 && s[1] === null, 'jour manquant → null positionnel (honest gap)')
  ok(hasDays(s, 1) && !hasDays(s, 2), 'hasDays respecte les trous')
  ok(normalizeForecast([{ status: 'clean' }].concat(Array(10).fill({ status: 'clean' }))).length === 7, 'tronqué à 7 jours')
}
ok(normalizeForecast([]).length === 0, 'série vide → [] (rendu "prévision indisponible", pas de fabrication)')

console.log('forecast-contract — tendance')
ok(trendFromDays(null) === null, 'pas de série → pas de tendance')
ok(trendFromDays([{ status: 'clean', afai: 0.05 }]) === null, '1 seul jour → null')
{
  const t = trendFromDays([{ status: 'clean', afai: 0.05 }, { status: 'clean', afai: 0.05 }, { status: 'avoid', afai: 0.5 }])
  ok(t && t.dir === 'up' && t.atIndex === 2, 'bascule clean→avoid à J+2 → dir=up')
}
{
  const t = trendFromDays([{ status: 'avoid', afai: 0.5 }, { status: 'moderate', afai: 0.3 }])
  ok(t && t.dir === 'down', 'amélioration → dir=down')
}
{
  const t = trendFromDays([{ status: 'clean', afai: 0.05 }, { status: 'clean', afai: 0.45 }])
  ok(t && t.dir === 'up', 'même statut mais afai ↑fort → up (signal réel)')
}
{
  const t = trendFromDays([{ status: 'clean', afai: 0.05 }, { status: 'clean', afai: 0.06 }])
  ok(t && t.dir === 'flat', 'afai stable → flat')
}

console.log('forecast-contract — boucle quotidienne')
ok(/^\d{4}-\d{2}-\d{2}$/.test(localDayKey()), 'localDayKey format ISO local')
ok(dailyChange(null, 'clean', '2026-09-02') === null, 'pas de snapshot → null')
ok(dailyChange({ day: '2026-09-01', status: 'clean' }, 'clean', '2026-09-02').changed === false, 'hier=auj → changed false')
{
  const r = dailyChange({ day: '2026-09-01', status: 'clean' }, 'moderate', '2026-09-02')
  ok(r && r.changed === true && r.from === 'clean' && r.to === 'moderate', 'situation changée depuis hier détectée')
}
ok(dailyChange({ day: '2026-09-02', status: 'clean' }, 'clean', '2026-09-02').changed === false, 'même jour → pas de changement')
ok(dailyChange({ day: '2026-09-01', status: 'clean' }, 'weird', '2026-09-02') === null, 'statut invalide → null')

process.exit(fails ? 1 : 0)
