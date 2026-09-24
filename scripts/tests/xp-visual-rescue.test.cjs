#!/usr/bin/env node
/**
 * xp-visual-rescue.test.cjs — UI VISUAL RESCUE (2026-09-18).
 *
 * Régressions prouvées Playwright (local + prod, mobile + desktop) :
 *  R1. Texte des cartes XP invisible : `card` (fond #fff) sans `color` → le texte
 *      nu héritait le ink-papier du shell (#FFFDF6) → contraste 1.02 (nom, commune,
 *      score sur Accueil + Plages + Ma Plage). Symptôme mission : « /plages délavé ».
 *  R2. Collision `.theme-comic button !important` : CTA or repeints en blanc +
 *      états actifs des filtres/tri indiscernables (11/11 chips blancs). Fix = armure
 *      doublé-classe (pattern repo .sg-mapchip/.sg-fchip), PAS .sg-onink-scope
 *      (son `background:unset!important` rendrait les boutons transparents).
 *  R3. CTA sticky du paywall rogné ~22px à 390px (label flex:1 sans min-width:0).
 *
 * Composant live prouvé : PlagesExplorer (ExperienceReset.jsx, view="plages") —
 * BeachListView (Sargasses_PROD.jsx) est monté en dessous (overlay z900) et
 * BeachCards.jsx n'est importé NULLE PART (dead code, ne pas "corriger").
 *
 * Preuves : C:\Users\user\AppData\Local\Temp\opencode\visual-audit\ (hors repo).
 * Rollbacks : ?newia=0 (R1+R2, tout l'XP off), ?nosticky=0 (R3, barre off).
 * Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

function main() {
  const XP = read('src/components/ExperienceReset.jsx')
  const PROD = read('src/Sargasses_PROD.jsx')
  const PO = read('src/PassOffer.jsx')

  // ── R1 : encre ancrée sur les cartes blanches ──
  ok(/const card = \{[^}]*color:\s*INK/.test(XP), 'R1 : `card` ancre color:INK (texte lisible sur fond #fff)')
  ok(/la seule carte sombre[\s\S]{0,120}color:#fff explicite/.test(XP), 'R1 : exception carte sombre documentée (hero HomeDashboard)')

  // ── R2 : armure thème ──
  ok(XP.includes('const XP_ARMOR'), 'R2 : bloc XP_ARMOR présent')
  ok(XP.includes('.xp-gold.xp-gold') && XP.includes('background:#FFC72C!important'), 'R2 : armure .xp-gold (fond or exact inline)')
  ok(XP.includes('.xp-dark.xp-dark') && XP.includes('background:#0d0b14!important'), 'R2 : armure .xp-dark (bouton J’y vais)')
  ok(XP.includes('.xp-seg-on.xp-seg-on'), 'R2 : armure .xp-seg-on (filtres actifs INK)')
  ok(XP.includes('.xp-sort-on.xp-sort-on'), 'R2 : armure .xp-sort-on (tri actif GOLD)')
  const goldSpreads = (XP.match(/\.\.\.btnGold/g) || []).length // style={{ ...btnGold, ... }}
  const goldDirect = (XP.match(/style=\{btnGold\}/g) || []).length // style={btnGold}
  const goldArmored = (XP.match(/className="xp-gold xp-gold"/g) || []).length
  ok(goldSpreads + goldDirect > 0 && goldSpreads + goldDirect === goldArmored, `R2 : tous les boutons btnGold armurés (armure ${goldArmored}/N, usages ${goldSpreads + goldDirect} — parité, plus de quota figé)`)
  ok(XP.includes("className=\"xp-dark xp-dark\""), 'R2 : bouton noir J’y vais armuré')
  ok(/sort === id \? 'xp-sort-on xp-sort-on'/.test(XP), 'R2 : tri actif câblé (classe conditionnelle)')
  ok(/onlyFav \? 'xp-sort-on xp-sort-on'/.test(XP), 'R2 : toggle Suivies câblé (classe conditionnelle)')
  ok(/f === id \? 'xp-seg-on xp-seg-on'/.test(XP), 'R2 : filtre statut actif câblé (classe conditionnelle)')
  ok(/act === id \? 'xp-seg-on xp-seg-on'/.test(XP), 'R2 : filtre activité actif câblé (classe conditionnelle)')
  // Les 2 boutons sans color inline avant le fix (sort + Suivies) : déterministes sans thème.
  ok(/background: sort === id \? GOLD : '#fff', color: INK/.test(XP), 'R2 : boutons tri ont color:INK explicite')
  ok(/background: onlyFav \? GOLD : '#fff', color: INK/.test(XP), 'R2 : bouton Suivies a color:INK explicite')
  // Noms sans "cta" (échappent au catch-all .theme-comic [class*="cta"]).
  const armorBlock = (XP.match(/const XP_ARMOR = `([\s\S]*?)`/) || [])[1] || ''
  ok(!/cta/.test(armorBlock), 'R2 : aucune classe armure ne contient "cta"')
  // 4 racines XP montent l'armure.
  const armorMounts = (XP.match(/<style>\{XP_ARMOR\}<\/style>/g) || []).length
  ok(armorMounts === 4, `R2 : armure montée sur les 4 racines XP (home/plages/suivi/compare) — trouvé ${armorMounts}`)

  // ── Hypothèse G : le composant live est PlagesExplorer ──
  ok(PROD.includes('view="plages"'), 'G : Sargasses_PROD monte ExperienceReset view="plages" (live)')
  ok(!PROD.includes('BeachCards'), 'G : BeachCards.jsx non importé (dead code — ne pas corriger)')

  // ── R3 : sticky paywall ──
  ok(/<span className="sg-sticky-label" style=\{\{ flex: 1, fontSize: 11\.5/.test(PO), 'R3 : label sticky inline d’origine (desktop strict, wrap via lot 10 ≤480px)')
  ok(PO.includes('sg-sticky-wrap') && PO.includes('sg-sticky-label') && PO.includes('sg-sticky-buy'), 'R3 : classes wrap/label/cta posées (2 lignes ≤480px)')
  const CSS = read('src/app-runtime.css')
  ok(/sg-sticky-wrap\.sg-sticky-wrap\.sg-sticky-wrap\{flex-wrap:wrap !important/.test(CSS), 'R3 : lot 10 wrap ≤480px (triple-classe)')
  ok(/sg-sticky-label\.sg-sticky-label\{flex:1 1 100% !important;min-width:0\}/.test(CSS), 'R3 : lot 10 label pleine ligne')
  ok(/sg-sticky-buy\.sg-sticky-buy\{flex:1 1 100% !important/.test(CSS), 'R3 : lot 10 CTA pleine largeur')
  const stickyCls = ['sg-sticky-wrap', 'sg-sticky-label', 'sg-sticky-buy']
  ok(stickyCls.every(c => !c.includes('cta')), 'R3 : aucune classe sticky ne contient "cta" (catch-all theme)')
  ok(PO.includes('?nosticky=0'), 'R3 : rollback ?nosticky=0 documenté')

  console.log(failures === 0 ? '\nXP-VISUAL-RESCUE TESTS: ALL PASS' : `\nXP-VISUAL-RESCUE TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
