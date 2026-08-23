// SargaClip — générateur vidéo 100% local « Le Bulletin Sargasses »
// Photos du repo + TTS edge-tts (gratuit) + ffmpeg. Données LIVE : le clip se
// régénère chaque jour avec la vraie urgence du forecast et la vraie plage
// propre. Sortie : MP4 1080×1920 (9:16) + .srt + thumbnail + chapitres.
//
// Usage : node scripts/video/build-clip.cjs [--region mq|gp] [--lang fr|en|es]
// Prérequis : ffmpeg sur PATH, pip install edge-tts, fonts Windows (Impact).
const { execFileSync, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '../..')
const CACHE = path.join(__dirname, 'cache')
const OUT = path.join(__dirname, 'out')
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const REGION = arg('region', 'mq')
const LANG = arg('lang', REGION === 'gp' || REGION === 'mq' ? 'fr' : REGION === 'rivieramaya' ? 'es' : 'en')
const W = 1080, H = 1920, FPS = 30
// ffmpeg 8 + Windows : les ':' des chemins cassent le parseur de filtres quel
// que soit le quoting → on travaille en chemins RELATIFS depuis cache/ (cwd du
// rendu) : polices copiées localement, textfiles par nom.
for (const f of ['impact.ttf', 'seguibl.ttf']) {
  const dst = path.join(CACHE, f)
  if (!fs.existsSync(dst)) fs.copyFileSync('C:/Windows/Fonts/' + f, dst)
}
const FONT_HEAD = 'impact.ttf'
const FONT_SUB = 'seguibl.ttf'
const VOICE = { fr: 'fr-FR-HenriNeural', en: 'en-US-GuyNeural', es: 'es-MX-JorgeNeural' }[LANG]
const DOMAIN = { mq: 'sargasses-martinique.com', gp: 'sargasses-guadeloupe.com', puntacana: 'sargassumpuntacana.com', florida: 'sargassummiami.com', rivieramaya: 'sargassumcancun.com' }[REGION]
const REGION_NAME = { mq: 'Martinique', gp: 'Guadeloupe', puntacana: 'Punta Cana', florida: 'Miami', rivieramaya: 'Cancún' }[REGION]
const SARG_TO_BEACH = { 'grande-anse': 'mq014', 'anse-mitan': 'mq011', 'anse-noire': 'mq012', 'tartane': 'mq034', 'anse-madame': 'mq024', 'diamant': 'mq016', 'pt-marin': 'mq008', 'sainte-anne': 'mq004', 'les-salines': 'mq001', 'vauclin': 'mq044', 'gp-grande-anse': 'gp021', 'gp-malendure': 'gp031', 'gp-sainte-anne': 'gp010', 'gp-pt-chateaux': 'gp005', 'gp-gosier': 'gp012', 'gp-caravelle': 'gp009', 'gp-bas-du-fort': 'gp014', 'gp-deshaies': 'gp024', 'gp-moule': 'gp080', 'gp-vieux-fort': 'gp042' }
const j = p => JSON.parse(fs.readFileSync(p, 'utf8'))

// ── 1. Données live ──────────────────────────────────────────
const isMQGP = REGION === 'mq' || REGION === 'gp'
const sarg = j(path.join(ROOT, 'public/api/copernicus', isMQGP ? '' : REGION, 'sargassum.json'))
const imgs = j(path.join(ROOT, 'public/data/beaches-images.json'))
const qual = (() => { try { return j(path.join(ROOT, 'public/data/beaches-images-quality.json')) } catch (_) { return {} } })()
const list = isMQGP ? j(path.join(ROOT, 'public/data/beaches-list.json')) : (j(path.join(ROOT, 'regions', REGION + '.json')).beaches || [])
let lvls = sarg.levels.filter(l => isMQGP ? (REGION === 'gp' ? String(l.id).startsWith('gp-') : !String(l.id).startsWith('gp-')) : true)
const imgIdOf = id => isMQGP ? SARG_TO_BEACH[id] : id
const beachOf = id => list.find(x => x.id === (isMQGP ? SARG_TO_BEACH[id] : id))
const nameOf = id => { const b = beachOf(id); return b ? b.name : id }
const communeOf = id => { const b = beachOf(id); return (b && b.commune) || '' }
const photoOf = id => { const f = imgs[imgIdOf(id)]; return f && !String(f).startsWith('sat-') ? path.join(ROOT, 'public/beaches', f) : null }
const qOf = id => qual[imgIdOf(id)] || 0
const STATUS_RANK = { clean: 0, moderate: 1, avoid: 2 }
// Dégradations réelles J+1..J+3 (même définition que le drip J3)
let degraded = 0
for (const l of lvls) {
  const fc = (sarg.weekly[l.id] || {}).forecast || []
  const today = STATUS_RANK[(fc[0] || {}).status] ?? STATUS_RANK[l.status] ?? 0
  for (let i = 1; i <= 3 && i < fc.length; i++) {
    const r = STATUS_RANK[(fc[i] || {}).status]
    if (r != null && r > today) { degraded++; break }
  }
}
// Meilleure plage : propre, J+1 propre de préférence, photo la plus belle à score proche
const cleans = lvls.filter(l => l.status === 'clean' && photoOf(l.id))
const sorted = [...cleans].sort((a, b) => (b.score || 0) - (a.score || 0))
const near = sorted.filter(l => (sorted[0]?.score || 0) - (l.score || 0) <= 8)
const best = near.sort((a, b) => qOf(b.id) - qOf(a.id))[0] || sorted[0]
if (!best) { console.error('Aucune plage propre avec photo — clip annulé (jamais de fausse donnée).'); process.exit(2) }
// Pire plage AVEC photo pour le hook (la plus dégradée demain, sinon la moins bien notée)
const withPhoto = lvls.filter(l => photoOf(l.id) && l.id !== best.id)
const worst = [...withPhoto].sort((a, b) => (STATUS_RANK[b.status] - STATUS_RANK[a.status]) || ((a.score || 99) - (b.score || 99)))[0] || best
console.log(`Région ${REGION} | dégradées J+1-3: ${degraded} | best: ${nameOf(best.id)} ${best.score}/100 (photo q${qOf(best.id)}) | hook: ${nameOf(worst.id)} ${worst.status}`)

// ── 2. Script (texte = vraie donnée uniquement) ──────────────
const n = degraded
const bestName = nameOf(best.id), bestCommune = communeOf(best.id), score = best.score || ''
const L = {
  fr: [
    n > 0 ? `Demain, ${n} plage${n > 1 ? 's' : ''} touchée${n > 1 ? 's' : ''} en ${REGION_NAME}.` : `Les sargasses bougent chaque jour en ${REGION_NAME}.`,
    `Le satellite, lui, voit tout. Quatre passages par jour, plage par plage.`,
    `${bestName}${bestCommune ? ', à ' + bestCommune : ''} : propre aujourd'hui. ${score} sur 100.`,
    `${DOMAIN.replace('.com', ' point com')}. Chaque matin. Gratuit.`,
  ],
  en: [
    n > 0 ? `Tomorrow, sargassum reaches ${n} ${REGION_NAME} beach${n > 1 ? 'es' : ''}.` : `Sargassum moves every day in ${REGION_NAME}.`,
    `The satellite sees it all. Four passes a day, beach by beach.`,
    `${bestName}: clean today. ${score} out of 100.`,
    `${DOMAIN.replace('.com', ' dot com')}. Every morning. Free.`,
  ],
  es: [
    n > 0 ? `Mañana, el sargazo llega a ${n} playa${n > 1 ? 's' : ''} de ${REGION_NAME}.` : `El sargazo se mueve cada día en ${REGION_NAME}.`,
    `El satélite lo ve todo. Cuatro pasadas al día, playa por playa.`,
    `${bestName}: limpia hoy. ${score} sobre 100.`,
    `${DOMAIN.replace('.com', ' punto com')}. Cada mañana. Gratis.`,
  ],
}[LANG]
const HEAD = {
  fr: [n > 0 ? `DEMAIN\n${n} PLAGES\nTOUCHÉES` : `LES SARGASSES\nBOUGENT`, `LE SATELLITE\nVOIT TOUT`, `${bestName.toUpperCase()}\nPROPRE · ${score}/100`, `CHAQUE MATIN\nGRATUIT`],
  en: [n > 0 ? `TOMORROW\n${n} BEACHES\nHIT` : `SARGASSUM\nMOVES DAILY`, `THE SATELLITE\nSEES IT ALL`, `${bestName.toUpperCase()}\nCLEAN · ${score}/100`, `EVERY MORNING\nFREE`],
  es: [n > 0 ? `MAÑANA\n${n} PLAYAS\nAFECTADAS` : `EL SARGAZO\nSE MUEVE`, `EL SATÉLITE\nLO VE TODO`, `${bestName.toUpperCase()}\nLIMPIA · ${score}/100`, `CADA MAÑANA\nGRATIS`],
}[LANG]

// ── 3. TTS par ligne (cache par hash) + durées ───────────────
const voParts = L.map((text, i) => {
  const hash = crypto.createHash('md5').update(VOICE + text).digest('hex').slice(0, 10)
  const mp3 = path.join(CACHE, `vo-${hash}.mp3`)
  if (!fs.existsSync(mp3)) {
    execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate', '+8%', '--text', text, '--write-media', mp3], { stdio: 'pipe' })
  }
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString())
  return { text, mp3, dur }
})

// ── 4. Visuels par scène ─────────────────────────────────────
// Scène 2 = screenshot LIVE de notre carte (vrai produit à l'écran)
const mapShot = path.join(CACHE, `map-${REGION}.png`)
try {
  execFileSync('node', [path.join(__dirname, 'shoot-map.cjs'), DOMAIN, mapShot], { stdio: 'pipe', timeout: 90000 })
} catch (e) { console.log('  (screenshot carte indisponible — fallback photo)') }
const scenes = [
  { img: photoOf(worst.id), grade: 'eq=saturation=0.42:brightness=-0.06:contrast=1.06', zoom: 'in' },
  // precrop : retire le chrome de l'app (barre de jours en haut, recherche/dock en bas)
  { img: fs.existsSync(mapShot) ? mapShot : photoOf(best.id), grade: 'eq=saturation=1.0', zoom: 'out', precrop: fs.existsSync(mapShot) ? 'crop=iw:ih-430:0:150' : null },
  { img: photoOf(best.id), grade: 'eq=saturation=1.18:contrast=1.04', zoom: 'out' },
  { img: null, grade: null, zoom: null }, // carte CTA générée
]

// ── 5. Timeline ──────────────────────────────────────────────
const PAD_IN = 0.35, PAD_OUT = 0.55, XFADE = 0.45
const scDur = voParts.map(v => Math.max(2.6, PAD_IN + v.dur + PAD_OUT))
const total = scDur.reduce((a, b) => a + b, 0) - XFADE * 3
console.log('Durées scènes:', scDur.map(d => d.toFixed(1)).join(' + '), '≈', total.toFixed(1) + 's')

// ── 6. Fichiers texte (drawtext) + SRT + chapitres ───────────
const tf = (name, content) => { const p = path.join(CACHE, name); fs.writeFileSync(p, content.replace(/\r/g, ''), 'utf8'); return p }
// ffmpeg 8 drawtext rend le \n des textfiles comme un glyphe "tofu" →
// UN drawtext PAR LIGNE (titres) + wrap manuel des sous-titres (pas d'auto-wrap).
const wrap = (t, max) => {
  const out = []; let line = ''
  for (const w of t.split(' ')) {
    if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w }
    else line += ' ' + w
  }
  if (line.trim()) out.push(line.trim())
  return out
}
const headLines = HEAD.map((t, i) => t.split('\n').map((l, k) => tf(`head-${LANG}-${i}-${k}.txt`, l)))
const subLines = L.map((t, i) => wrap(t, 34).map((l, k) => tf(`sub-${LANG}-${i}-${k}.txt`, l)))
const fmtSrt = s => { const ms = Math.round(s * 1000); const hh = String(Math.floor(ms / 3600000)).padStart(2, '0'), mm = String(Math.floor(ms % 3600000 / 60000)).padStart(2, '0'), ss = String(Math.floor(ms % 60000 / 1000)).padStart(2, '0'), mss = String(ms % 1000).padStart(3, '0'); return `${hh}:${mm}:${ss},${mss}` }
let srt = '', tCur = 0
const CHAP_TITLES = { fr: ['Demain', 'Le satellite', 'La plage du jour', 'Gratuit'], en: ['Tomorrow', 'The satellite', "Today's beach", 'Free'], es: ['Mañana', 'El satélite', 'La playa de hoy', 'Gratis'] }[LANG]
let meta = ';FFMETADATA1\ntitle=Le Bulletin Sargasses — ' + REGION_NAME + '\n'
voParts.forEach((v, i) => {
  const sceneStart = tCur
  srt += `${i + 1}\n${fmtSrt(sceneStart + PAD_IN)} --> ${fmtSrt(sceneStart + PAD_IN + v.dur)}\n${v.text}\n\n`
  meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(sceneStart * 1000)}\nEND=${Math.round((sceneStart + scDur[i]) * 1000)}\ntitle=${CHAP_TITLES[i]}\n`
  tCur += scDur[i] - (i < 3 ? XFADE : 0)
})
const date = new Date().toISOString().slice(0, 10)
const base = `sargaclip-${REGION}-${LANG}-${date}`
fs.writeFileSync(path.join(OUT, base + '.srt'), srt, 'utf8')
const metaFile = tf('chapters.txt', meta)

// ── 7. Filtre ffmpeg ─────────────────────────────────────────
const zp = (mode, d) => {
  const frames = Math.round(d * FPS)
  return mode === 'in'
    ? `zoompan=z='1+0.10*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`
    : `zoompan=z='1.10-0.10*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`
}
const headTxt = (i, size) => headLines[i].map((f, k) =>
  `drawtext=fontfile=${FONT_HEAD}:textfile=${path.basename(f)}:fontsize=${size}:fontcolor=white:borderw=4:bordercolor=black@0.55:x=(w-text_w)/2:y=h*0.20+${k * Math.round(size * 1.18)}`
).join(',')
const subTxt = i => subLines[i].map((f, k) =>
  `drawtext=fontfile=${FONT_SUB}:textfile=${path.basename(f)}:fontsize=44:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=16:x=(w-text_w)/2:y=h*0.72+${k * 78}:enable='gte(t,${PAD_IN.toFixed(2)})'`
).join(',')
const goldBar = `drawbox=x=0:y=ih*0.165:w=iw:h=8:color=0xFFC72C@0.9:t=fill`
const fc = []
const inputs = []
scenes.forEach((s, i) => {
  if (s.img) { inputs.push('-loop', '1', '-t', String(scDur[i] + 1), '-i', s.img) }
  else { inputs.push('-f', 'lavfi', '-t', String(scDur[i] + 1), '-i', `color=c=0x0A1714:s=${W}x${H}:r=${FPS}`) }
})
scenes.forEach((s, i) => {
  const chain = []
  if (s.img) {
    if (s.precrop) chain.push(s.precrop)
    chain.push(`scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`, `crop=${W * 2}:${H * 2}`, zp(s.zoom, scDur[i]))
    if (s.grade) chain.push(s.grade)
  } else {
    chain.push(`fps=${FPS}`)
  }
  chain.push(headTxt(i, i === 2 ? 86 : 96))
  if (i !== 3) chain.push(goldBar)
  if (i === 3) chain.push(`drawtext=fontfile=${FONT_SUB}:text='${DOMAIN}':fontsize=54:fontcolor=0xFFC72C:x=(w-text_w)/2:y=h*0.48`)
  chain.push(subTxt(i))
  chain.push(`format=yuv420p,setsar=1`)
  fc.push(`[${i}:v]${chain.join(',')}[v${i}]`)
})
// xfade en chaîne
let off = scDur[0] - XFADE
fc.push(`[v0][v1]xfade=transition=fade:duration=${XFADE}:offset=${off.toFixed(2)}[x1]`)
off += scDur[1] - XFADE
fc.push(`[x1][v2]xfade=transition=fade:duration=${XFADE}:offset=${off.toFixed(2)}[x2]`)
off += scDur[2] - XFADE
fc.push(`[x2][v3]xfade=transition=fade:duration=${XFADE}:offset=${off.toFixed(2)}[vid]`)
// Audio : VO positionnées sur la timeline + océan synthétique dessous
let aIn = scenes.length
voParts.forEach((v, i) => { inputs.push('-i', v.mp3) })
let tAcc = 0
voParts.forEach((v, i) => {
  fc.push(`[${aIn + i}:a]adelay=${Math.round((tAcc + PAD_IN) * 1000)}|${Math.round((tAcc + PAD_IN) * 1000)},apad[a${i}]`)
  tAcc += scDur[i] - (i < 3 ? XFADE : 0)
})
inputs.push('-f', 'lavfi', '-t', String(total + 0.5), '-i', `anoisesrc=color=brown:amplitude=0.045,lowpass=f=420,tremolo=f=0.11:d=0.7`)
fc.push(`[${aIn + 4}:a]volume=0.8[waves]`)
fc.push(`[a0][a1][a2][a3][waves]amix=inputs=5:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5,atrim=0:${total.toFixed(2)}[aud]`)

const outMp4 = path.join(OUT, base + '.mp4')
const args = [...inputs, '-i', metaFile,
  '-filter_complex', fc.join(';'),
  '-map', '[vid]', '-map', '[aud]', '-map_metadata', String(aIn + 5),
  '-t', total.toFixed(2), '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', '-y', outMp4]
console.log('Rendu ffmpeg…')
try {
  execFileSync('ffmpeg', args, { stdio: 'pipe', cwd: CACHE })
} catch (e) {
  const err = String(e.stderr)
  fs.writeFileSync(path.join(CACHE, 'ffmpeg-err.log'), err)
  console.error('--- lignes d\'erreur ffmpeg ---')
  err.split(/\r?\n/).filter(l => /error|invalid|unable|no such|cannot|failed|not found/i.test(l)).slice(0, 12).forEach(l => console.error(l.slice(0, 220)))
  process.exit(1)
}
// Thumbnail = frame du reveal
execFileSync('ffmpeg', ['-ss', String((scDur[0] + scDur[1] - 2 * XFADE + scDur[2] / 2).toFixed(2)), '-i', outMp4, '-frames:v', '1', '-y', path.join(OUT, base + '-thumb.jpg')], { stdio: 'pipe' })
const sz = (fs.statSync(outMp4).size / 1048576).toFixed(1)
console.log(`OK → ${outMp4} (${sz} Mo, ${total.toFixed(1)}s) + .srt + thumb`)
