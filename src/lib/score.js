/**
 * Beach Score Engine — v1 (browser ESM build)
 *
 * Mirrors scripts/lib/score.cjs so client and pipeline stay in sync.
 * Pure, no I/O. Import: `import { computeScore } from './lib/score.js'`
 *
 * Year-round relevance: sargassum is one of 7 factors (30% max weight).
 * Keep the two files byte-identical in logic when updating.
 */

export const WEIGHTS = {
  sargassum: 30,
  wave: 20,
  wind: 15,
  sst: 10,
  cloud: 10,
  uv: 10,
  tide: 5,
}

function scoreSargassum(afai) {
  if (afai == null) return 18
  if (afai < 0.15) return 30
  if (afai < 0.25) return 22
  if (afai < 0.40) return 12
  if (afai < 0.60) return 4
  return 0
}

function scoreWave(h) {
  if (h == null) return 12
  if (h < 0.4) return 20
  if (h < 0.8) return 17
  if (h < 1.2) return 12
  if (h < 1.6) return 7
  if (h < 2.2) return 3
  return 0
}

function scoreWind(s) {
  if (s == null) return 9
  if (s < 8) return 15
  if (s < 14) return 13
  if (s < 20) return 9
  if (s < 26) return 4
  return 0
}

function scoreSst(t) {
  if (t == null) return 6
  if (t >= 27) return 10
  if (t >= 25.5) return 9
  if (t >= 24) return 7
  if (t >= 22) return 4
  return 1
}

function scoreCloud(c) {
  if (c == null) return 6
  if (c < 20) return 10
  if (c < 40) return 8
  if (c < 60) return 5
  if (c < 80) return 2
  return 0
}

function scoreUV(u) {
  if (u == null) return 6
  if (u < 3) return 5
  if (u < 6) return 10
  if (u < 8) return 8
  if (u < 11) return 5
  return 2
}

function scoreTide(r) {
  if (r == null) return 3
  return 3 + Math.round(2 * (1 - Math.abs(r - 0.5) * 2))
}

// i18n des raisons : fr (MQ/GP, défaut historique), en (puntacana/florida), es (rivieramaya).
const STRENGTHS = {
  fr: { sargassum: 'zéro sargasses', wave: 'mer plate', wind: 'vent calme', sst: 'eau chaude', cloud: 'ciel dégagé', uv: 'soleil parfait', tide: 'marée idéale' },
  en: { sargassum: 'zero sargassum', wave: 'flat sea', wind: 'calm wind', sst: 'warm water', cloud: 'clear sky', uv: 'perfect sun', tide: 'ideal tide' },
  es: { sargassum: 'cero sargazo', wave: 'mar plano', wind: 'viento en calma', sst: 'agua cálida', cloud: 'cielo despejado', uv: 'sol perfecto', tide: 'marea ideal' },
}
const REASON_T = {
  fr: { but: 'Mais', neutral: 'Conditions moyennes sur tous les facteurs.' },
  en: { but: 'But', neutral: 'Average conditions across all factors.' },
  es: { but: 'Pero', neutral: 'Condiciones promedio en todos los factores.' },
}

function weakness(factor, snap, lang = 'fr', imperial = false) {
  const L = {
    fr: { alert: a => `alerte sargasses (AFAI ${a})`, present: a => `sargasses présentes (AFAI ${a})`, trace: a => `trace de sargasses (AFAI ${a})`, wave: h => `houle ${h} m`, wind: w => `vent ${w} km/h`, sst: s => `eau fraîche ${s} °C`, cloud: 'ciel couvert', uvHigh: 'UV extrême', uvLow: 'UV faible' },
    en: { alert: a => `sargassum alert (AFAI ${a})`, present: a => `sargassum present (AFAI ${a})`, trace: a => `trace of sargassum (AFAI ${a})`, wave: h => `${h} m swell`, wind: w => `${w} km/h wind`, sst: s => `cool water ${s} °C`, cloud: 'overcast sky', uvHigh: 'extreme UV', uvLow: 'low UV' },
    es: { alert: a => `alerta de sargazo (AFAI ${a})`, present: a => `sargazo presente (AFAI ${a})`, trace: a => `rastro de sargazo (AFAI ${a})`, wave: h => `oleaje de ${h} m`, wind: w => `viento de ${w} km/h`, sst: s => `agua fresca ${s} °C`, cloud: 'cielo nublado', uvHigh: 'UV extremo', uvLow: 'UV bajo' },
  }[lang] || null
  let l = L || { alert: a => `alerte sargasses (AFAI ${a})` }
  // Régions US (Floride) : unités impériales — mêmes conversions que score.cjs
  if (imperial && lang === 'en') {
    l = { ...l, wave: h => `${h} ft swell`, wind: w => `${w} mph wind`, sst: s => `cool water ${s} °F` }
  }
  const imp = imperial && lang === 'en'
  switch (factor) {
    case 'sargassum': {
      const a = snap.afai?.toFixed(2) ?? '?'
      if (snap.afai >= 0.60) return l.alert(a)
      if (snap.afai >= 0.40) return l.present(a)
      return l.trace(a)
    }
    case 'wave':
      return l.wave(snap.wave_height != null ? (imp ? (snap.wave_height * 3.28084).toFixed(1) : snap.wave_height.toFixed(1)) : '?')
    case 'wind':
      return l.wind(snap.wind_speed != null ? Math.round(imp ? snap.wind_speed * 0.621371 : snap.wind_speed) : '?')
    case 'sst':
      return l.sst(snap.sst != null ? (imp ? Math.round(snap.sst * 9 / 5 + 32) : snap.sst.toFixed(1)) : '?')
    case 'cloud':
      return l.cloud
    case 'uv':
      return snap.uv_index >= 11 ? l.uvHigh : l.uvLow
    default:
      return null
  }
}

export function labelFor(score) {
  if (score >= 90) return { label: 'EXCEPTIONNEL', color: '#00B086' }
  if (score >= 80) return { label: 'SUPER', color: '#1EC8B0' }
  if (score >= 70) return { label: 'BON', color: '#6AC15A' }
  if (score >= 55) return { label: 'MOYEN', color: '#E8A800' }
  if (score >= 40) return { label: 'PASSABLE', color: '#E87B1E' }
  if (score >= 25) return { label: 'ÉVITER', color: '#E8512A' }
  return { label: 'NON', color: '#C93A1E' }
}

export function computeScore(snapshot = {}, lang = 'fr', imperial = false) {
  const breakdown = {
    sargassum: scoreSargassum(snapshot.afai),
    wave: scoreWave(snapshot.wave_height),
    wind: scoreWind(snapshot.wind_speed),
    sst: scoreSst(snapshot.sst),
    cloud: scoreCloud(snapshot.cloud_cover),
    uv: scoreUV(snapshot.uv_index),
    tide: scoreTide(snapshot.tide_ratio),
  }
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
  const { label, color } = labelFor(score)
  const SL = STRENGTHS[lang] || STRENGTHS.fr
  const RT = REASON_T[lang] || REASON_T.fr

  const strengths = []
  const weaknesses = []
  for (const [factor, pts] of Object.entries(breakdown)) {
    const max = WEIGHTS[factor]
    const ratio = pts / max
    if (ratio >= 0.9) strengths.push(SL[factor])
    else if (ratio <= 0.3) {
      const w = weakness(factor, snapshot, lang, imperial)
      if (w) weaknesses.push(w)
    }
  }

  let reason
  if (strengths.length && weaknesses.length) {
    reason = `${strengths.slice(0, 2).join(', ')}. ${RT.but} ${weaknesses.slice(0, 2).join(', ')}.`
  } else if (strengths.length) {
    reason = `${strengths.slice(0, 3).join(', ')}.`
  } else if (weaknesses.length) {
    reason = `${weaknesses.slice(0, 2).join(', ')}.`
  } else {
    reason = RT.neutral
  }
  reason = reason.charAt(0).toUpperCase() + reason.slice(1)

  return { score, breakdown, label, color, reason, strengths, weaknesses }
}
