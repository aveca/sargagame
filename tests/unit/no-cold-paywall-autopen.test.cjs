#!/usr/bin/env node
'use strict'

/**
 * no-cold-paywall-autopen.test.cjs — le paywall ne s'ouvre plus jamais À FROID.
 *
 * DÉFAUT RÉEL, MESURÉ SUR LE LIVE (2026-11-26, lecture seule, aucun paiement) :
 *   `https://sargasses-martinique.com/alertes/` ouvrait le paywall tout seul à la
 *   première visite (source `alertes_landing`, src/Sargasses_PROD.jsx:13719) et son
 *   overlay (z=1100) recouvrait tout le viewport. La page /alertes/ n'a que 3 <a>,
 *   dont un seul atteignable, et il est DANS la modale (« Avant de payer, voyez nos
 *   erreurs → » vers /fiabilite/) : le visiteur ne lisait pas la page, il voyait un mur.
 *
 *   Funnel `?action=funnel`, 28 j : `alertes_landing` = 305 ouvertures pour
 *   `premium_modal_cta` = 0 — contre beach_sheet 34/2 (5,9 %) et chasse_detail 158/2
 *   (1,3 %), les sources où le mur s'ouvre sur une intention réelle. 305 visiteurs
 *   interrompus sans un seul clic.
 *
 * POURQUOI CE N'ÉTAIT PAS UN BON DÉFAUT DE CONVERSION MAIS UN BUG DE DOCTRINE :
 *   le même fichier désactive, 15 lignes plus bas, l'auto-open « engagement 50 s »
 *   par un `return` commenté : « l'auto-open ouvrait le paywall sur intention TIÈDE →
 *   ~0 % CTA + gonflait le dénominateur modal_open … + modal interruptif =
 *   anti-doctrine calme. Le mur ne s'ouvre PLUS que sur intention CHAUDE. »
 *   La branche /alertes/ contredisait ce contrat : elle ouvrait sur intention NULLE
 *   (simple arrivée sur l'URL), sans même exiger un scroll ou un clic.
 *
 * CONTRAT VERROUILLÉ ICI :
 *   1. aucun `openPremium` n'est appelé automatiquement sur un chemin d'atterrissage
 *      d'alertes (source `alertes_landing` supprimée, regex de pathname supprimée) ;
 *   2. les entrées EXPLICITES restent ouvertes — `?paywall=1|cancel` (retour paiement
 *      ou clic CTA) et `?pro=1` (B2B) : elles servent un visiteur qui a déjà agi ;
 *   3. l'auto-open « engagement 50 s » reste désactivé (early return) : aucun timer
 *      ne peut ouvrir le mur sur une session tiède ;
 *   4. l'entrée nommée de /alertes/ reste le deep-link
 *      `/?paywall=1&utm_source=alertes_noscript` (le CLIC reste l'intention).
 *
 * Aucun prix touché, aucun parcours de paiement modifié, aucun déploiement ici.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const app = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')

// ── 1. plus aucune ouverture automatique sur les chemins d'alertes ───────────
// Commentaires retirés : seule la règle en CODE compte ici (les commentaires
// documentent la suppression, ils ne doivent pas compter comme une réintroduction).
const codeOnly = app
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
assert.ok(!/openPremium\(\s*"alertes_landing"\s*\)/.test(codeOnly),
  'l ouverture automatique du paywall sur /alertes/, /en/sargassum-alerts/ et ' +
    '/es/alertas-sargazo/ (source `alertes_landing`) doit rester supprimée : ' +
    '305 ouvertures / 0 CTA sur 28 j, overlay couvrant tout le viewport')

// Le bloc deeplink (paywall / pro) est le SEUL endroit où le montage peut ouvrir
// le mur : il ne doit contenir aucune condition de pathname.
const deeplinkBlock = app.slice(app.indexOf('const proB2BSrc=useRef("app")'), app.indexOf('const [showProB2B,setShowProB2B]=useState(false)'))
const effectBlock = app.slice(
  app.indexOf('const p=new URLSearchParams(window.location.search)'),
  app.indexOf('// Engagement trigger')
)
assert.ok(effectBlock.length > 200, 'effet deeplink (?paywall / ?pro) introuvable')
assert.ok(
  !/openPremium\([^)]*\bfile/.test(effectBlock) &&
  !/(?:pathname|ALERT_PATHS|isCleanListPath)\s*[=!]/.test(effectBlock),
  'l effet de montage ne doit plus décider d ouvrir le paywall d après le CHEMIN ' +
    'de l URL : un chemin d atterrissage n est pas une intention d achat'
)

// ── 2. les entrées explicites restent ouvertes (pas de régression) ───────────
assert.ok(/paywall"\)=="cancel"/.test(effectBlock) || /paywall"\)==="cancel"/.test(effectBlock),
  'le retour paiement annulé (?paywall=cancel) doit continuer à rouvrir le paywall')
assert.ok(/"deeplink_"\+u/.test(effectBlock) || /"deeplink_" \+ u/.test(effectBlock),
  'le deep-link ?paywall=1&utm_source=… doit rester ouvert (entrée explicite, ' +
    'notamment /?paywall=1&utm_source=alertes_noscript depuis la page /alertes/)')
assert.ok(/setShowProB2B\(true\)/.test(effectBlock),
  'le deep-link B2B ?pro=1 doit rester ouvert (outreach email)')

// ── 3. aucun timer ne peut rouvrir le mur sur session tiède ──────────────────
const engagementBlock = app.slice(app.indexOf('// Engagement trigger'), app.indexOf('const [showSplash,setShowSplash]'))
const body = engagementBlock.slice(engagementBlock.indexOf('useEffect(()=>{') + 'useEffect(()=>{'.length)
const lines = body.split('\n')
const firstStatement = lines.find((l) => l.trim() && !l.trim().startsWith('//'))
assert.ok(/^\s*return\b/.test(firstStatement),
  'l effet engagement 50 s doit rester neutralisé par un early return AVANT tout ' +
    'autre instruction : aucun timer ne peut ouvrir le mur sur intention tiède ' +
    `(première instruction trouvée : ${firstStatement?.trim()?.slice(0, 60)})`)

// ── 4. l'entrée honnête de /alertes/ reste le deep-link, pas l'auto-open ─────
const vite = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')
assert.ok(vite.includes('paywall=1&utm_source=alertes_noscript'),
  'le CTA explicite de la page /alertes/ (contenu noscript, vite.config.js) doit ' +
    'rester : /alertes/ garde une entée de vente par CLIC')

console.log('OK : aucun paywall ouvert à froid — la source alertes_landing (305 ouvertures / 0 CTA) est supprimée')
console.log('OK : les entrées explicites restent ouvertes (?paywall=1|cancel, ?pro=1, deep-link /alertes/)')
console.log('OK : aucun timer ne peut rouvrir le mur sur session tiède (engagement 50 s neutralisé)')