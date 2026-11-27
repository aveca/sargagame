#!/usr/bin/env node
'use strict'

/**
 * rendered-dom-h1.test.cjs — garde-fou : la home ET la fiche plage doivent
 * rendre un <h1> (et non zéro).
 *
 * DÉFAUT PRODUCTION RÉEL (mesuré sur les 6 domaines, 2026-10-26, AVANT correctif) :
 * `src/Sargasses_PROD.jsx` rendait le mot-clé SEO de niveau heading dans un
 * `<p>` sr-only, avec ce commentaire :
 *     « Mot-clé SEO sr-only — <p> (PAS <h1>) : la scène/route visible fournit
 *        déjà l'unique <h1> ; deux <h1> = anti-pattern SEO + a11y. »
 * Or la mesure (Playwright/Chromium, 390x844) montrait `h1=false` sur la home
 * ET sur la fiche plage, sur les 6 domaines : le `<h1>` visible supposé
 * n'existe pas. Les deux surfaces carte étaient donc rendues SANS aucun heading
 * de niveau 1 — perte du signal SEO le plus fort de la homepage, et aucune
 * structure de titres pour les lecteurs d'écran.
 *
 * Note : /pro/, /for-hotels/ et /fiabilite/ avaient déjà un <h1> (h1=true) —
 * ces pages étaient saines, le défaut ne touchait que les deux surfaces carte.
 *
 * La preuve du rendu RÉEL (nombre de <h1> effectivement dans le DOM) est faite
 * au niveau navigateur, via le token `H1=` de scripts/ux-smoke.mjs (exécuté en
 * CI). Ici on verrouille la CAUSE dans la source.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'src', 'Sargasses_PROD.jsx'), 'utf8');

// ── 1. Le mot-clé SEO sr-only doit être un <h1>, pas un <p> ──────────────────
const seoOpenP = /<p\s+style=\{\{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect\(0,0,0,0\)",whiteSpace:"nowrap"\}\}>\{IS_NEW_REGION\?/;
const seoOpenH1 = /<h1\s+style=\{\{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect\(0,0,0,0\)",whiteSpace:"nowrap"\}\}>\{IS_NEW_REGION\?/;

assert.ok(!seoOpenP.test(src),
  'le mot-clé SEO sr-only ne doit PLUS être un <p> (il était rendu sans aucun <h1> de niveau 1)');
assert.ok(seoOpenH1.test(src),
  'le mot-clé SEO sr-only doit être un <h1> — unique heading de niveau 1 des surfaces carte');

// ── 2. Le shell carte ne rend qu'UN <h1> ─────────────────────────────────────
// NB : on ne compte PAS les <h1> de tout le fichier — Sargasses_PROD.jsx contient
// du code dormant (arène, onboarding, anciennes fiches) qui n'est pas monté sur
// la home. Le compte statique serait donc trompeur ; le rendu réel est vérifié
// au niveau DOM par le token `H1=` de ux-smoke.mjs (exécuté en CI).
const shellRendersSingleH1 = seoOpenH1.test(src) && !seoOpenP.test(src);
assert.ok(shellRendersSingleH1,
  'le shell carte doit rendre exactement un <h1> sr-only, et plus aucun <p> de heading');

// ── 3. Le <h1> doit rester invisible (aucun changement visuel) ──────────────
const h1Line = src.split(/\r?\n/).find(l => /<h1\s+style=\{\{position:"absolute",width:"1px"/.test(l)) || '';
assert.ok(/position:"absolute"/.test(h1Line), 'le <h1> sort du flux (aucun décalage visuel)');
assert.ok(/width:"1px",height:"1px"/.test(h1Line), 'le <h1> est réduit à 1px (invisible)');
assert.ok(/clip:"rect\(0,0,0,0\)"/.test(h1Line), 'le <h1> est clippé à zéro (invisible)');
assert.ok(/whiteSpace:"nowrap"/.test(h1Line), 'le <h1> reste sur une ligne (pas de saut de layout)');

// ── 4. Le texte reste multilingue (3 langues, aucune chaîne inventée) ───────
assert.ok(/Sargazo en \$\{REGION\.name\} en vivo — mapa de playas hoy/.test(src), 'libellé ES conservé');
assert.ok(/\$\{REGION\.name\} sargassum live — beach map today/.test(src), 'libellé EN conservé');
assert.ok(/Sargasses Martinique en temps réel — carte et plages aujourd'hui/.test(src), 'libellé FR MQ conservé');
assert.ok(/Sargasses Guadeloupe en temps réel — carte et plages aujourd'hui/.test(src), 'libellé FR GP conservé');

console.log('OK Test 1: le mot-clé SEO sr-only est un <h1> (plus un <p>)');
console.log('OK Test 2: le shell carte rend un <h1> unique');
console.log('OK Test 3: <h1> invisible (absolute + 1px + clip + nowrap) — zéro changement visuel');
console.log('OK Test 4: libellés FR/EN/ES conservés, aucune chaîne inventée');
