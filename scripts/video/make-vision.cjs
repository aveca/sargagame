// « Le Veilleur » — vidéo de vision de marque (manifeste, PAS un brief
// quotidien data-driven). Script figé par panel adverse (4 frameworks
// narratifs × 2 personas sceptiques × synthèse, 2026-07-02) — respecte les
// 6 temps canoniques + règles dures de CLAUDE.md (zéro chiffre inventé,
// zéro "100%" nu, promesse toujours positive, honnêteté auditée = preuve,
// CTA doux sans prix ni domaine, signature de marque verbatim).
// Usage : node scripts/video/make-vision.cjs
// Sortie : scripts/video/out/vision-fondateur.mp4 (1080×1920, 30 fps)
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const FPS = 30
const VOICE = 'fr-FR-HenriNeural'
const ROOT = path.resolve(__dirname, '../..')
const RPROJ = path.join(ROOT, 'video-remotion')
const CACHE = path.join(RPROJ, 'public', 'cache')
const OUT = path.join(__dirname, 'out')
fs.mkdirSync(CACHE, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

const ffprobeDur = f => parseFloat(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
const toMs = ts => { const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4]) }

// ── Script figé (synthèse du panel, cf. justification complète en session) ──
const SCENES = [
  {
    id: 's1_constat', type: 'photo', minDur: 5.5,
    img: path.join(ROOT, 'public/beaches/gplace-mq001.jpg'),
    overlay: { overline: 'VOUS REGARDEZ LES SALINES', title: 'Demain,\nle vent tourne.', sub: 'Une plage. Une date. Une question simple.' },
    vo: "Vous regardez Les Salines pour demain. Le vent est en train de tourner, et vous ne le savez pas encore.",
  },
  {
    id: 's2_le_veilleur', type: 'card', minDur: 4.5, glyph: true,
    card: { overline: 'CHAQUE MATIN', title: "Quelqu'un\nregarde la mer" },
    vo: "Chaque matin, quelqu'un regarde la mer avant vous. Pas pour vous surveiller — pour vous prévenir.",
  },
  {
    id: 's3_cadeau', type: 'card', minDur: 4.5,
    card: { overline: 'AVANT TOUTE CHOSE', title: 'Le verdict\nest gratuit.', sub: 'Chaque jour, chaque plage, sans rien demander en retour.' },
    vo: "Ce qu'il voit, il vous le donne : le verdict du jour, gratuit, avant qu'on vous demande quoi que ce soit.",
  },
  {
    id: 's4_douleur', type: 'photo', minDur: 5, dark: true,
    img: path.join(ROOT, 'public/beaches/gplace-mq014.jpg'),
    overlay: { overline: 'LA SERVIETTE DÉJÀ POSÉE', title: "Personne n'aime\nla surprise." },
    vo: "Personne n'aime découvrir les algues une fois la serviette posée, les enfants déjà dans l'eau.",
  },
  {
    id: 's5_statut', type: 'card', minDur: 5,
    card: { overline: 'CELUI QUI SAIT DÉJÀ', title: 'Un temps\nd’avance.', sub: 'Un statut, pas un abonnement.' },
    vo: "Devenez celui qui connaît la fin de l'histoire avant les autres — le copain qui, étrangement, choisit toujours la bonne crique.",
  },
  {
    id: 's6_preuve', type: 'card', minDur: 6,
    card: { overline: 'ON PUBLIE NOS ERREURS', title: 'Mesuré au satellite,\npas deviné.', sub: 'Entre 76 et 79 % selon la saison, daté, vérifié — aucun sponsor ne choisit la couleur du jour.' },
    vo: "Rien n'est deviné : tout est mesuré au satellite. On publie nos propres erreurs, prévision par prévision, pour que vous puissiez vérifier avant de nous croire.",
  },
  {
    id: 's7_offre', type: 'card', minDur: 4,
    card: { overline: 'SANS RENDEZ-VOUS', title: "Un coup d'oeil.\nC'est tout.", sub: 'Self-serve, sans complication.' },
    vo: "Pas de rendez-vous, pas de complication : juste un coup d'oeil, et vous savez. C'est aussi simple que ça.",
  },
  {
    id: 's8_signature', type: 'card', minDur: 4, glyph: true,
    card: { overline: 'LE VEILLEUR', title: 'On regarde la mer\npour vous.' },
    vo: "On regarde la mer pour vous.",
  },
]

// ── TTS par scène + copie des assets ──
console.log(`[1/3] voix (edge-tts ${VOICE}) + assets…`)
for (const s of SCENES) {
  const mp3 = path.join(CACHE, `vo-vision-${s.id}.mp3`)
  const srt = path.join(CACHE, `vo-vision-${s.id}.srt`)
  execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate=+12%', '--text', s.vo,
    '--write-media', mp3, '--write-subtitles', srt], { stdio: 'ignore' })
  s.voDur = ffprobeDur(mp3)
  s.dur = Math.max(s.minDur || 4, s.voDur + 0.5)
  s._voice = `cache/vo-vision-${s.id}.mp3`
  s._srt = srt
  console.log(`   ${s.id}: vo ${s.voDur.toFixed(1)}s → scène ${s.dur.toFixed(1)}s`)
  if (s.img) {
    const dest = `cache/img-vision-${s.id}${path.extname(s.img)}`
    fs.copyFileSync(s.img, path.join(RPROJ, 'public', dest))
    s._img = dest
  }
}

// ── Props (scènes en frames + cues sous-titres globaux) ──
const scenes = []
const cues = []
let fromF = 0
for (const s of SCENES) {
  const durF = Math.round(s.dur * FPS)
  scenes.push({
    id: s.id, type: s.type, durF,
    voice: s._voice || null, img: s._img || null,
    dark: !!s.dark, glyph: !!s.glyph,
    overlay: s.overlay || null, card: s.card || null,
  })
  if (s._srt && fs.existsSync(s._srt)) {
    const blocks = fs.readFileSync(s._srt, 'utf8').split(/\r?\n\r?\n/).filter(b => b.trim())
    for (const b of blocks) {
      const ls = b.split(/\r?\n/)
      const tm = ls.find(l => l.includes('-->'))
      if (!tm) continue
      const [a, bb] = tm.split('-->').map(x => toMs(x.trim()))
      const text = ls.slice(ls.indexOf(tm) + 1).join(' ').trim()
      if (!text) continue
      const endMs = Math.min(bb, (s.dur - 0.1) * 1000)
      cues.push({
        startF: fromF + Math.round(a / 1000 * FPS),
        endF: fromF + Math.round(endMs / 1000 * FPS),
        text,
      })
    }
  }
  fromF += durF
}
const props = { scenes, cues }
const propsPath = path.join(CACHE, 'props-vision.json')
fs.writeFileSync(propsPath, JSON.stringify(props))
console.log(`[2/3] props : ${scenes.length} scènes, ${cues.length} cues, ${fromF} frames (${(fromF / FPS).toFixed(1)}s)`)

// ── Rendu Remotion + loudnorm ──
console.log('[3/3] rendu Remotion…')
const finalName = 'vision-fondateur.mp4'
const raw = path.join(OUT, finalName.replace('.mp4', '-raw.mp4'))
execFileSync('npx', ['remotion', 'render', 'Vision', raw, `--props=${propsPath}`, '--crf=28', '--log=error'],
  { cwd: RPROJ, stdio: 'inherit', shell: process.platform === 'win32' })
execFileSync('ffmpeg', ['-y', '-i', raw, '-c:v', 'copy',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', path.join(OUT, finalName)], { stdio: 'ignore' })
fs.unlinkSync(raw)

const fin = path.join(OUT, finalName)
console.log(`\n✓ ${finalName} — ${ffprobeDur(fin).toFixed(1)}s, ${(fs.statSync(fin).size / 1048576).toFixed(1)} Mo`)
