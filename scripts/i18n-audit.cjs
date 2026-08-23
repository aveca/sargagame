#!/usr/bin/env node
/**
 * i18n-audit — flague les chaînes user-facing HARDCODÉES (français) hors _t(),
 * pour scaler proprement en FR/EN/ES (MQ/GP, Punta Cana/Cancún, Florida).
 *
 * Heuristique : tout texte LITTÉRAL (qui ne commence pas par "{") dans
 *   - <text ...>TEXTE</text>  (SVG)
 *   - attributs aria-label / placeholder / title / alt = "TEXTE"
 * qui CONTIENT du français (accents OU mots FR) = non traduit. Les _t(lang,fr,en,es)
 * rendent "{_t(...)}" (donc "{...}", exclus) → pas de faux positif.
 *
 * Usage: node scripts/i18n-audit.cjs [--strict]   (--strict => sort 1 si trouvailles)
 */
const fs = require('fs')
const path = require('path')
const FILE = path.join(__dirname, '..', 'Sargasses_PROD.jsx')
const STRICT = process.argv.includes('--strict')

const FR_ACCENT = /[àâäéèêëïîôöùûüçœÀÂÄÉÈÊËÏÎÔÖÙÛÜÇŒ]/
const FR_WORDS = /\b(le|la|les|un|une|des|du|au|aux|ta|ton|tes|ma|mon|votre|notre|aujourd|plage|plages|côte|jour|argent|veilleur|propre|éviter|prudence|ramass\w*|trie?|solution|solutions|carte|monde|découvr\w*|visite|alerte|engrais|sable|barrage|recyclage|quartier|saison|prévision)\b/i
const NEUTRAL = /^(AFAI|LIVE|GPS|H2S|H₂S|NASA|ESA|NOAA|USF|SVG|MQ|GP|USD|EUR|OK)\b/

function isFrench(s){
  const t = (s || '').trim()
  if (t.length < 2) return false
  if (t.includes('{')) return false // contient une expression {_t(...)} -> deja traduit
  if (NEUTRAL.test(t)) return false
  return FR_ACCENT.test(t) || FR_WORDS.test(t)
}

const lines = fs.readFileSync(FILE, 'utf8').split('\n')
const reText = /<text\b[^>]*>([^<{][^<]*)<\/text>/g
const reAttr = /\b(aria-label|placeholder|title|alt)="([^"{][^"]*)"/g
const hits = []

lines.forEach((line, i) => {
  for (const m of line.matchAll(reText)) if (isFrench(m[1])) hits.push({ ln: i + 1, kind: 'text', s: m[1].trim().slice(0, 60) })
  for (const m of line.matchAll(reAttr)) if (isFrench(m[2])) hits.push({ ln: i + 1, kind: m[1], s: m[2].trim().slice(0, 60) })
})

if (!hits.length) {
  console.log('i18n-audit: OK — aucune chaine user-facing francaise hardcodee hors _t().')
  process.exit(0)
}
console.log('i18n-audit: ' + hits.length + ' chaine(s) hardcodee(s) a traduire (FR/EN/ES) :\n')
for (const h of hits) console.log('  L' + h.ln + '  [' + h.kind + ']  ' + h.s)
console.log('\n-> Remplacer par {_t(lang,"fr","en","es")}.')
process.exit(STRICT && hits.length ? 1 : 0)
