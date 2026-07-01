'use strict'
/**
 * sanitizeNote — filtre DÉTERMINISTE (zéro LLM, offline, auditable) de la note texte libre
 * d'un signalement terrain. Renvoie la note nettoyée, ou `null` si elle doit être écartée
 * (« incompréhensible » au sens du panel 2026-07-01 : URL/spam, PII, charabia, insulte).
 *
 * Le SENS d'un signalement (beaching/cleanup) est un enum de boutons, jamais du texte libre :
 * une note nullifiée n'annule donc JAMAIS la voix de consensus, seul le texte est censuré.
 *
 * Utilisé par auto-moderate-reports.cjs (re-check défensif avant publication). Peut aussi être
 * transposé côté Edge Function submit-report (nullify à l'insert) — logique identique.
 */
const fs = require('fs')
const path = require('path')

let BLOCK = []
try {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'note-blocklist.json'), 'utf8'))
  BLOCK = Array.isArray(j.words) ? j.words : []
} catch (_) { /* pas de blocklist → on saute juste le filtre insulte */ }

const deaccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')

function sanitizeNote(note) {
  if (note == null) return null
  let s = String(note).trim()
  if (!s) return null
  if (s.length > 280) s = s.slice(0, 280)

  // 1) URL / spam publicitaire
  if (/(https?:\/\/|www\.|\.(com|net|org|xyz|ru|top|info|io|biz)\b)/i.test(s)) return null
  // 2) PII (RGPD : zéro donnée de tiers persistée) — email, téléphone, IBAN
  if (/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(s)) return null
  if (/(?:\+?\d[\s.\-]?){7,}/.test(s)) return null
  if (/\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b/.test(s)) return null
  // 3) Charabia : trop court, trop peu d'alphanumérique, ou une lettre répétée en rafale
  const alnum = (s.match(/[a-zA-Z0-9À-ſ]/g) || []).length
  if (s.length < 3 || alnum / s.length < 0.5) return null
  if (/(.)\1{4,}/.test(s)) return null
  // 4) Insulte (blocklist FR/EN/ES, insensible casse + accents, en sous-chaîne)
  const flat = deaccent(s.toLowerCase())
  for (const w of BLOCK) {
    if (w && flat.includes(deaccent(String(w).toLowerCase()))) return null
  }
  return s
}

module.exports = { sanitizeNote }
