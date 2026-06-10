// Storyboard du « Brief plage » quotidien — 100 % généré depuis la donnée live.
// Usage : const {buildStoryboard} = require('./storyboard.cjs'); buildStoryboard('mq')
// Régions : mq | gp | puntacana | florida | rivieramaya
// Aucun chiffre inventé : si la donnée manque, la scène saute.
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')

const SARG_TO_BEACH = { 'grande-anse': 'mq014', 'anse-mitan': 'mq011', 'anse-noire': 'mq012', 'tartane': 'mq034', 'anse-madame': 'mq024', 'diamant': 'mq016', 'pt-marin': 'mq008', 'sainte-anne': 'mq004', 'les-salines': 'mq001', 'vauclin': 'mq044', 'gp-grande-anse': 'gp021', 'gp-malendure': 'gp031', 'gp-sainte-anne': 'gp010', 'gp-pt-chateaux': 'gp005', 'gp-gosier': 'gp012', 'gp-caravelle': 'gp009', 'gp-bas-du-fort': 'gp014', 'gp-deshaies': 'gp024', 'gp-moule': 'gp080', 'gp-vieux-fort': 'gp042' }
const REGIONS = {
  mq: { lang: 'fr', name: 'Martinique', domain: 'sargasses-martinique.com', voice: 'fr-FR-HenriNeural', inRegion: 'en Martinique', wordmark: 'SARGASSES MARTINIQUE' },
  gp: { lang: 'fr', name: 'Guadeloupe', domain: 'sargasses-guadeloupe.com', voice: 'fr-FR-HenriNeural', inRegion: 'en Guadeloupe', wordmark: 'SARGASSES GUADELOUPE' },
  puntacana: { lang: 'en', name: 'Punta Cana', domain: 'sargassumpuntacana.com', voice: 'en-US-AndrewNeural', inRegion: 'in Punta Cana', wordmark: 'SARGASSUM PUNTA CANA' },
  florida: { lang: 'en', name: 'Miami & Florida', domain: 'sargassummiami.com', voice: 'en-US-AndrewNeural', inRegion: 'in Miami', wordmark: 'SARGASSUM MIAMI' },
  rivieramaya: { lang: 'es', name: 'Cancún', domain: 'sargassumcancun.com', voice: 'es-MX-JorgeNeural', inRegion: 'en Cancún', wordmark: 'SARGAZO CANCÚN' },
}
const STATUS_LOC = {
  fr: { clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter' },
  en: { clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid' },
  es: { clean: 'Limpia', moderate: 'Moderada', avoid: 'Evitar' },
}
const DAYS_FULL = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
}
const RANK = { clean: 0, moderate: 1, avoid: 2 }
const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return fb } }

function buildStoryboard(regionId) {
  const R = REGIONS[regionId]
  if (!R) throw new Error('région inconnue: ' + regionId)
  const isNew = !['mq', 'gp'].includes(regionId)
  const sarg = loadJSON(path.join(ROOT, 'public/api/copernicus', isNew ? regionId : '', 'sargassum.json'), null)
  if (!sarg || !Array.isArray(sarg.levels)) throw new Error('pas de sargassum.json pour ' + regionId)
  const imgs = loadJSON(path.join(ROOT, 'public/data/beaches-images.json'), {})
  const q = loadJSON(path.join(ROOT, 'public/data/beaches-images-quality.json'), {})
  const list = loadJSON(path.join(ROOT, 'public/data/beaches-list.json'), [])
  const regionCfg = isNew ? loadJSON(path.join(ROOT, 'regions', regionId + '.json'), {}) : null

  let lvls = sarg.levels
  if (!isNew) lvls = lvls.filter(l => regionId === 'gp' ? String(l.id).startsWith('gp-') : !String(l.id).startsWith('gp-'))
  const imgIdOf = id => isNew ? id : SARG_TO_BEACH[id]
  const nameOf = id => {
    if (isNew) { const b = (regionCfg.beaches || []).find(x => x.id === id); return b ? b.name : null }
    const b = list.find(x => x.id === SARG_TO_BEACH[id]); return b ? b.name : null
  }
  const communeOf = id => {
    if (isNew) { const b = (regionCfg.beaches || []).find(x => x.id === id); return (b && (b.commune || b.area)) || '' }
    const b = list.find(x => x.id === SARG_TO_BEACH[id]); return (b && b.commune) || ''
  }
  const photoOf = id => { const f = imgs[imgIdOf(id)]; return f && !String(f).startsWith('sat-') ? path.join(ROOT, 'public/beaches', f) : null }
  const qOf = id => q[imgIdOf(id)] || 0
  const fcOf = l => (sarg.weekly && sarg.weekly[l.id] && sarg.weekly[l.id].forecast) || []

  // Meilleure plage du jour : propre, score max, départage qualité photo (≤8 pts)
  const cleans = lvls.filter(l => l.status === 'clean' && photoOf(l.id) && nameOf(l.id))
  const pool = cleans.length ? cleans : lvls.filter(l => photoOf(l.id) && nameOf(l.id))
  if (!pool.length) throw new Error('aucune plage avec photo+nom pour ' + regionId)
  // Score composite état + beauté de photo (même formule que /jeu/ et le hero) :
  // sur 10 sentinelles, un départage à seuil exclut les belles photos — la
  // pondération directe choisit « propre ET cinégénique » (la vidéo EST l'image).
  const sorted = [...pool].sort((a, b) => ((b.score || 0) + qOf(b.id) * 0.6) - ((a.score || 0) + qOf(a.id) * 0.6))
  const best = sorted[0]
  const bestFc = fcOf(best)
  const bestJ1 = (bestFc[1] && bestFc[1].status) || null

  // Dégradations réelles J+1..J+3
  let degraded = []
  for (const l of lvls) {
    const fc = fcOf(l)
    const today = RANK[(fc[0] && fc[0].status)] ?? RANK[l.status] ?? 0
    for (let i = 1; i <= 3 && i < fc.length; i++) {
      const r = RANK[fc[i] && fc[i].status]
      if (r != null && r > today) { degraded.push({ l, date: fc[i].date }); break }
    }
  }
  let degradeDay = null, degradedSample = null
  if (degraded.length) {
    const byDate = {}
    for (const d of degraded) byDate[d.date] = (byDate[d.date] || 0) + 1
    const top = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0][0]
    degradeDay = DAYS_FULL[R.lang][new Date(top + 'T12:00:00Z').getUTCDay()]
    degradedSample = degraded.map(d => d.l).find(l => photoOf(l.id) && nameOf(l.id)) || null
  }
  // Alternative propre aujourd'hui ET demain (≠ best)
  const alt = sorted.find(l => l.id !== best.id && l.status === 'clean'
    && (((fcOf(l)[1] || {}).status || 'clean') === 'clean'))

  const cleanCount = lvls.filter(l => l.status === 'clean').length
  const total = lvls.length
  const sw = s => STATUS_LOC[R.lang][s] || s
  const t = (fr, en, es) => R.lang === 'es' ? es : R.lang === 'en' ? en : fr
  const now = new Date()
  const dateLong = now.toLocaleDateString(R.lang === 'es' ? 'es-MX' : R.lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const bestName = nameOf(best.id), altName = alt ? nameOf(alt.id) : null

  // ── Scènes ──
  const scenes = []
  scenes.push({
    id: 'title', type: 'card', minDur: 3.2, chapter: null,
    card: { overline: dateLong.toUpperCase(), title: t('LE BRIEF\nPLAGE', 'THE BEACH\nBRIEF', 'EL BRIEF\nDE PLAYA'), sub: R.wordmark },
    vo: t(`Le brief plage du ${dateLong}. ${cleanCount} plages propres sur ${total} ${R.inRegion}.`,
      `Your beach brief for ${dateLong}. ${cleanCount} of ${total} beaches are clean ${R.inRegion}.`,
      `Tu brief de playa del ${dateLong}. ${cleanCount} de ${total} playas limpias ${R.inRegion}.`),
  })
  scenes.push({
    id: 'best', type: 'photo', minDur: 6, img: photoOf(best.id), chapter: t('01 · LA PLAGE DU JOUR', '01 · BEACH OF THE DAY', '01 · LA PLAYA DEL DÍA'),
    overlay: { overline: t('TA MEILLEURE PLAGE AUJOURD’HUI', 'YOUR BEST BEACH TODAY', 'TU MEJOR PLAYA HOY'), title: bestName.toUpperCase(), pill: `${sw(best.status).toUpperCase()} · ${best.score != null ? best.score + '/100' : ''}`, pillColor: '#FFC72C', sub: communeOf(best.id) },
    vo: t(`Ta meilleure plage aujourd'hui : ${bestName}${communeOf(best.id) ? ', à ' + communeOf(best.id) : ''}. ${sw(best.status)}, ${best.score != null ? best.score + ' sur 100' : ''}. Vérifié par satellite ce matin.`,
      `Your best beach today: ${bestName}. ${sw(best.status)}, ${best.score != null ? best.score + ' out of 100' : ''}. Satellite-checked this morning.`,
      `Tu mejor playa hoy: ${bestName}. ${sw(best.status)}, ${best.score != null ? best.score + ' sobre 100' : ''}. Verificada por satélite esta mañana.`),
  })
  if (degradeDay && degradedSample) {
    const dn = nameOf(degradedSample.id)
    scenes.push({
      id: 'alert', type: 'photo', minDur: 6, img: photoOf(degradedSample.id), dark: true, chapter: t('02 · ÇA TOURNE', '02 · TURNING', '02 · CAMBIA'),
      overlay: { overline: t('PRÉVISION SATELLITE', 'SATELLITE FORECAST', 'PRONÓSTICO SATELITAL'), title: t(`${degraded.length} PLAGES\nTOUCHÉES ${degradeDay.toUpperCase()}`, `${degraded.length} BEACHES\nHIT BY ${degradeDay.toUpperCase()}`, `${degraded.length} PLAYAS\nAFECTADAS EL ${degradeDay.toUpperCase()}`), pill: '⚠️ ' + dn.toUpperCase(), pillColor: '#E8522A' },
      vo: t(`Attention : le satellite voit des bancs en approche. ${degraded.length} plages touchées d'ici ${degradeDay}, dont ${dn}.`,
        `Heads up: satellite shows mats on the way. ${degraded.length} beaches hit by ${degradeDay}, including ${dn}.`,
        `Atención: el satélite ve bancos en camino. ${degraded.length} playas afectadas para el ${degradeDay}, incluida ${dn}.`),
    })
  }
  if (altName && alt.id !== best.id) {
    scenes.push({
      id: 'tip', type: 'photo', minDur: 5.5, img: photoOf(alt.id), chapter: t('03 · LE PLAN B', '03 · PLAN B', '03 · EL PLAN B'),
      overlay: { overline: t('PROPRE AUJOURD’HUI ET DEMAIN', 'CLEAN TODAY AND TOMORROW', 'LIMPIA HOY Y MAÑANA'), title: altName.toUpperCase(), pill: `${sw('clean').toUpperCase()}${alt.score != null ? ' · ' + alt.score + '/100' : ''}`, pillColor: '#22C55E', sub: communeOf(alt.id) },
      vo: t(`Le plan B qui tient deux jours : ${altName}. Propre aujourd'hui, propre demain.`,
        `The plan B that holds two days: ${altName}. Clean today, clean tomorrow.`,
        `El plan B que aguanta dos días: ${altName}. Limpia hoy, limpia mañana.`),
    })
  }
  scenes.push({
    id: 'outro', type: 'card', minDur: 4.5, chapter: null,
    card: { overline: t('CHAQUE MATIN · GRATUIT', 'EVERY MORNING · FREE', 'CADA MAÑANA · GRATIS'), title: R.domain.replace('.com', '\n.com').toUpperCase(), sub: t('Carte live · 7 jours de prévision par plage', 'Live map · 7-day forecast per beach', 'Mapa en vivo · pronóstico 7 días por playa') },
    vo: t(`La carte complète et la prévision 7 jours plage par plage, c'est gratuit, sur ${R.domain.replace('.com', ' point com')}.`,
      `The full map and the 7-day beach-by-beach forecast are free at ${R.domain.replace('.com', ' dot com')}.`,
      `El mapa completo y el pronóstico de 7 días playa por playa, gratis, en ${R.domain.replace('.com', ' punto com')}.`),
  })

  return { region: regionId, lang: R.lang, voice: R.voice, wordmark: R.wordmark, domain: R.domain, date: now.toISOString().slice(0, 10), dateLong, scenes }
}
module.exports = { buildStoryboard, REGIONS }
if (require.main === module) {
  const sb = buildStoryboard(process.argv[2] || 'mq')
  console.log(JSON.stringify(sb, null, 1).slice(0, 3000))
  console.log('scènes:', sb.scenes.map(s => s.id).join(' → '))
}
