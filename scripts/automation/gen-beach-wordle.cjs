#!/usr/bin/env node
/**
 * gen-beach-wordle.cjs — « Sargadle », le devine-puis-révèle quotidien.
 * Une question tirée de la donnée RÉELLE du jour, 4 plages à départager, puis
 * la révélation le soir. Mécanique double-emploi : acquisition (jeu partageable)
 * + entraînement de l'œil (prépare la contribution ground-truth).
 *
 * Puzzle du jour : « Quelle plage est LE meilleur spot aujourd'hui ? »
 *   - 4 options = la meilleure (score réel max) + 3 distracteurs, mélange seedé
 *     par la date (stable 24 h, identique pour tout le monde).
 *   - Réponse = plage au Beach Score réel le plus élevé.
 *   - Révélation = classement réel par score, gagnante mise en avant.
 *
 * GARDE-FOU : aucun lien sortant, domaine gravé dans l'image. Square 1080×1080.
 *
 * Sorties (scripts/automation/share-cards/out/, gitignoré) :
 *   wordle-<region>-<date>-q.png   carte énigme (à poster le matin)
 *   wordle-<region>-<date>-a.png   carte réponse (à poster le soir)
 *   wordle-<region>-<date>-r.png   carte résultat partageable (si --result)
 *   ../data/wordle-today.json      définition du puzzle (le moteur)
 *
 * Usage :
 *   node scripts/automation/gen-beach-wordle.cjs --region=mq
 *   node scripts/automation/gen-beach-wordle.cjs --region=mq --result=B --streak=4
 *
 * --result=<A|B|C|D|slug> : carte RÉSULTAT à partager. SANS spoiler — on montre
 *   seulement ✓/✗ et le streak, jamais la bonne réponse : le partageur se vante,
 *   le spectateur reste curieux et vient jouer. C'est l'objet viral.
 *   --streak=<N> : série de bonnes réponses (contrat first-party, optionnel).
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib/share-card.cjs')
const CR = require('./lib/creature.cjs')

const args = process.argv.slice(2)
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }

const W = 1080, H = 1080, PAD = 72
const EPOCH = '2026-06-01' // origine de la numérotation des puzzles
const LETTERS = ['A', 'B', 'C', 'D']

function puzzleNumber(dateISO) {
  const d0 = new Date(EPOCH + 'T00:00:00Z'), d = new Date(dateISO + 'T00:00:00Z')
  return Math.max(1, Math.round((d - d0) / 86400000) + 1)
}

/** Construit la définition du puzzle depuis la donnée réelle. */
function buildPuzzle(region, dateISO) {
  const sarg = L.loadSarg()
  const levels = L.levelsForRegion(sarg, region)
    .filter(l => typeof l.score === 'number')
    .map(l => ({ slug: l.id, name: L.beachName(l.id), score: l.score, status: l.status, reason: (sarg.scores?.[l.id]?.reason) || l.reason || '' }))
  if (levels.length < 4) return null

  const byScore = [...levels].sort((a, b) => b.score - a.score)
  const winner = byScore[0]
  // 3 distracteurs : on évite l'ex-aequo parfait pour garder un vrai gagnant
  const rand = L.seededRand(`${region}-${dateISO}`)
  const pool = byScore.slice(1).filter(b => b.score < winner.score)
  const distractors = L.shuffleSeeded(pool, rand).slice(0, 3)
  const options = L.shuffleSeeded([winner, ...distractors], rand)

  return {
    date: dateISO,
    n: puzzleNumber(dateISO),
    region,
    question: 'Quelle plage est LE meilleur spot baignade aujourd’hui ?',
    options: options.map(o => ({ slug: o.slug, name: o.name, score: o.score, status: o.status })),
    answerSlug: winner.slug,
    answerScore: winner.score,
    answerReason: winner.reason,
    generatedAt: new Date().toISOString(),
    source: 'beach-score-live',
  }
}

function header(n, dateISO, sub) {
  return `${L.wordmark(PAD, 110, 'SARGADLE', { size: 30 })}
    <text x="${W - PAD}" y="110" text-anchor="end" font-family="${L.FONT}" font-size="30" font-weight="900" fill="${L.PALETTE.gold}">#${n}</text>
    <text x="${PAD}" y="148" font-family="${L.FONT}" font-size="23" font-weight="600" letter-spacing="2" fill="${L.PALETTE.mut}">${L.esc(sub)}</text>`
}

/** Carte énigme : question + 4 options, AUCUN score révélé. */
function buildQuestionCard(p) {
  const reg = L.REGION[p.region]
  const qLines = L.wrapLines(p.question, 26)
  const qY = 235, lineH = 60
  const hintY = qY + qLines.length * lineH + 14
  const optY = hintY + 64
  const rowH = 92, gap = 16, x = PAD, w = W - PAD * 2

  let rows = ''
  p.options.forEach((o, i) => {
    const y = optY + i * (rowH + gap)
    rows += `<rect x="${x}" y="${y}" width="${w}" height="${rowH}" rx="22" fill="${L.PALETTE.card}" stroke="${L.PALETTE.cardLine}"/>
      <circle cx="${x + 54}" cy="${y + rowH / 2}" r="31" fill="${L.PALETTE.gold}" opacity="0.16"/>
      <text x="${x + 54}" y="${y + rowH / 2 + 15}" text-anchor="middle" font-family="${L.FONT}" font-size="40" font-weight="900" fill="${L.PALETTE.gold}">${LETTERS[i]}</text>
      <text x="${x + 108}" y="${y + rowH / 2 + 16}" font-family="${L.FONT}" font-size="42" font-weight="800" fill="${L.PALETTE.white}">${L.esc(o.name)}</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${L.commonDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 40}" cy="80" r="200" fill="${L.PALETTE.teal}" opacity="0.06"/>
  <rect width="${W}" height="${H}" fill="url(#vign)"/>
  ${header(p.n, `${L.dateLongFR(p.date)} · ${reg.label}`, '')}
  ${qLines.map((ln, i) => `<text x="${PAD}" y="${qY + i * lineH}" font-family="${L.FONT}" font-size="52" font-weight="900" fill="${L.PALETTE.white}" letter-spacing="-1">${L.esc(ln)}</text>`).join('')}
  <text x="${PAD}" y="${hintY}" font-family="${L.FONT}" font-size="25" font-weight="700" letter-spacing="1" fill="${L.PALETTE.teal}">Ton pari ? · La réponse ce soir.</text>
  ${rows}
  ${L.domainWatermark(W, H, reg.domain)}
</svg>`
}

/** Carte réponse : classement réel par score, gagnante mise en avant. */
function buildAnswerCard(p) {
  const reg = L.REGION[p.region]
  const ranked = [...p.options].sort((a, b) => b.score - a.score)
  const maxScore = ranked[0].score
  const y0 = 300, rowH = 110, gap = 20, x = PAD, w = W - PAD * 2
  const barMaxW = w - 360

  let rows = ''
  ranked.forEach((o, i) => {
    const y = y0 + i * (rowH + gap)
    const win = o.slug === p.answerSlug
    const barW = Math.max(40, Math.round((o.score / 100) * barMaxW))
    const col = win ? L.PALETTE.gold : L.PALETTE.teal
    rows += `<rect x="${x}" y="${y}" width="${w}" height="${rowH}" rx="24" fill="${win ? 'rgba(255,199,44,0.10)' : L.PALETTE.card}" stroke="${win ? L.PALETTE.gold : L.PALETTE.cardLine}" stroke-width="${win ? 2 : 1}"/>
      <text x="${x + 30}" y="${y + rowH / 2 + 14}" font-family="${L.FONT}" font-size="40" font-weight="900" fill="${win ? L.PALETTE.gold : L.PALETTE.mut2}">${win ? '★' : i + 1}</text>
      <text x="${x + 92}" y="${y + 46}" font-family="${L.FONT}" font-size="38" font-weight="800" fill="${L.PALETTE.white}">${L.esc(o.name)}</text>
      <rect x="${x + 92}" y="${y + 64}" width="${barMaxW}" height="20" rx="10" fill="rgba(255,255,255,0.06)"/>
      <rect x="${x + 92}" y="${y + 64}" width="${barW}" height="20" rx="10" fill="${col}"/>
      <text x="${x + w - 28}" y="${y + rowH / 2 + 16}" text-anchor="end" font-family="${L.FONT}" font-size="48" font-weight="900" fill="${col}">${o.score}</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${L.commonDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="60" cy="80" r="200" fill="${L.PALETTE.gold}" opacity="0.06"/>
  <rect width="${W}" height="${H}" fill="url(#vign)"/>
  ${header(p.n, `${L.dateLongFR(p.date)} · ${reg.label}`, '')}
  <text x="${PAD}" y="225" font-family="${L.FONT}" font-size="54" font-weight="900" fill="${L.PALETTE.white}" letter-spacing="-1">LA RÉPONSE : <tspan fill="${L.PALETTE.gold}">${L.esc(L.beachName(p.answerSlug))}</tspan></text>
  <text x="${PAD}" y="268" font-family="${L.FONT}" font-size="26" font-weight="600" fill="${L.PALETTE.mut}">Meilleur Beach Score du jour — ${p.answerScore}/100</text>
  ${rows}
  ${L.domainWatermark(W, H, reg.domain)}
</svg>`
}

/**
 * Carte résultat partageable — SANS spoiler. Montre ✓/✗ + le streak, jamais la
 * bonne réponse (sinon on divulgue le puzzle du jour à tout le monde).
 */
function buildResultCard(p, correct, streak) {
  const reg = L.REGION[p.region]
  const col = correct ? L.PALETTE.teal : L.STATUS.avoid.color
  const verdict = correct ? 'BIEN VU' : 'PRESQUE'
  const tagline = correct ? 'Le meilleur spot du jour, deviné au satellite.' : 'Le satellite avait un autre favori aujourd’hui.'
  const cx = W / 2

  // Hero = Le Sarga (mascotte), humeur selon le résultat → l'objet viral.
  const creature = CR.sargaCreature({ variant: correct ? 'happy' : 'panic', x: 350, y: 208, scale: 1.9 })

  // Badge ✓ / ✗ en accent, posé sur le coin de la créature.
  const bx = 712, byb = 290, br = 58
  const glyph = correct
    ? `<path d="M ${bx - 27} ${byb + 2} l 17 19 l 36 -40" fill="none" stroke="${L.PALETTE.ink2}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M ${bx - 22} ${byb - 22} l 44 44 M ${bx + 22} ${byb - 22} l -44 44" fill="none" stroke="${L.PALETTE.ink2}" stroke-width="12" stroke-linecap="round"/>`

  // Bandeau de série (squares verts) — uniquement si streak fourni
  let streakBlock = ''
  if (streak && streak > 0) {
    const n = Math.min(streak, 7), sq = 56, g = 16
    const totalW = n * sq + (n - 1) * g
    const sx = (W - totalW) / 2, sy = 724
    let cells = ''
    for (let i = 0; i < n; i++) cells += `<rect x="${sx + i * (sq + g)}" y="${sy}" width="${sq}" height="${sq}" rx="14" fill="${L.PALETTE.teal}"/>`
    streakBlock = `${cells}
      <text x="${cx}" y="${sy + sq + 52}" text-anchor="middle" font-family="${L.FONT}" font-size="34" font-weight="800" fill="${L.PALETTE.white}">${streak} jours de suite</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${L.commonDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="360" r="300" fill="${col}" opacity="0.06"/>
  <rect width="${W}" height="${H}" fill="url(#vign)"/>
  ${header(p.n, `${L.dateLongFR(p.date)} · ${reg.label}`, '')}
  ${creature}
  <circle cx="${bx}" cy="${byb}" r="${br}" fill="${col}"/>
  ${glyph}
  <text x="${cx}" y="600" text-anchor="middle" font-family="${L.FONT}" font-size="88" font-weight="900" letter-spacing="-1" fill="${col}">${verdict}</text>
  <text x="${cx}" y="652" text-anchor="middle" font-family="${L.FONT}" font-size="29" font-weight="600" fill="${L.PALETTE.mut}">${L.esc(tagline)}</text>
  ${streakBlock}
  ${L.domainWatermark(W, H, reg.domain)}
</svg>`
}

async function run() {
  const region = opt('region') || 'mq'
  if (!L.REGION[region]) { console.error('✗ région inconnue: ' + region); process.exit(1) }
  const date = L.todayISO()
  const p = buildPuzzle(region, date)
  if (!p) { console.error('✗ pas assez de plages notées — puzzle annulé (jamais de fausse donnée).'); process.exit(2) }

  // Mode résultat partageable : --result=<A|B|C|D|slug> (+ --streak=N)
  const resultArg = opt('result')
  if (resultArg) {
    const idx = /^[A-Da-d]$/.test(resultArg) ? LETTERS.indexOf(resultArg.toUpperCase()) : p.options.findIndex(o => o.slug === resultArg)
    if (idx < 0) { console.error('✗ --result invalide (A-D ou slug d’option): ' + resultArg); process.exit(1) }
    const correct = p.options[idx].slug === p.answerSlug
    const streak = parseInt(opt('streak'), 10) || 0
    const rOut = path.join(L.OUT_DIR, `wordle-${region}-${date}-r.png`)
    const rr = await L.renderSVG(buildResultCard(p, correct, streak), rOut)
    console.log(`✓ Sargadle #${p.n} ${region} — résultat ${correct ? 'BIEN VU' : 'raté'} (choix ${LETTERS[idx]}${streak ? `, streak ${streak}j` : ''}, sans spoiler)`)
    console.log(`  résultat → ${path.relative(L.ROOT, rr.path)} (${(rr.bytes / 1024).toFixed(0)} Ko)`)
    return
  }

  // Le moteur : définition du puzzle (consommable par l'app plus tard)
  const jsonOut = path.join(L.DATA_DIR, 'wordle-today.json')
  fs.writeFileSync(jsonOut, JSON.stringify(p, null, 2))

  const qOut = path.join(L.OUT_DIR, `wordle-${region}-${date}-q.png`)
  const aOut = path.join(L.OUT_DIR, `wordle-${region}-${date}-a.png`)
  const rq = await L.renderSVG(buildQuestionCard(p), qOut)
  const ra = await L.renderSVG(buildAnswerCard(p), aOut)

  console.log(`✓ Sargadle #${p.n} ${region} — ${p.options.map(o => o.name).join(' / ')}`)
  console.log(`  réponse : ${L.beachName(p.answerSlug)} (${p.answerScore}/100)`)
  console.log(`  énigme  → ${path.relative(L.ROOT, rq.path)} (${(rq.bytes / 1024).toFixed(0)} Ko)`)
  console.log(`  réponse → ${path.relative(L.ROOT, ra.path)} (${(ra.bytes / 1024).toFixed(0)} Ko)`)
  console.log(`  moteur  → ${path.relative(L.ROOT, jsonOut)}`)
}

run().catch(e => { console.error('FAIL', e.message); process.exit(1) })
