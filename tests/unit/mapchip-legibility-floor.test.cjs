#!/usr/bin/env node
'use strict'

/**
 * mapchip-legibility-floor.test.cjs — garde-fou LISIBILITE (audit UI exhaustif
 * 2026-10-26, 6 domaines x 2 viewports).
 *
 * DEFAUT MESURE : les chips de carte (`.sg-mapchip`), dont le CTA
 * « Vous gerez un hotel ? », etaient rendues a font-size: 10.5px en inline
 * JSX — sur mobile (390) COMME sur desktop (1440). Mesure sur 36 des 46 pages
 * verifiees, sur les 6 domaines.
 *
 * Le repo a deja un plancher etabli (PR #1019, labels carte : 9px ->
 * clamp(11px, 2.9vw, 12px) = 11.31px mobile / 12px desktop). Ce correctif
 * applique le MEME plancher aux chips carte.
 *
 * Verification navigateur apres fix : 10.5px -> 11.31px (390) / 12px (1440),
 * 0 debordement horizontal, 0 erreur JS, carte inchangee (53 labels).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../../src/app-runtime.css'), 'utf8');

const ruleBlock = (css.match(/\.sg-mapchip\.sg-mapchip\.sg-mapchip\{[\s\S]*?\}/) || [''])[0];

// 1. La regle doit imposer un plancher de 11px
assert.ok(/font-size:\s*clamp\(11px,/.test(ruleBlock),
  'les chips carte doivent imposer font-size:clamp(11px,…) — l inline JSX porte 10.5px, trop petit');

// 2. Elle doit battre l'inline JSX et le skin de theme
assert.ok(/font-size:clamp\(11px[^;]*!important/.test(ruleBlock),
  'le font-size doit etre !important, sinon l inline 10.5px gagne');
assert.ok(/\.sg-mapchip\.sg-mapchip\.sg-mapchip\{/.test(css),
  'triple classe (0,3,0) requise pour battre l inline JSX et le skin .theme-X');

// 3. Aucune regression sur les recettes de lisibilite existantes
assert.ok(/background:#190c2c !important/.test(ruleBlock), 'fond opaque sombre des chips conserve');
assert.ok(/color:#fdfcf7 !important/.test(ruleBlock), 'texte blanc des chips conserve');
assert.ok(/-webkit-text-fill-color:#fdfcf7 !important/.test(ruleBlock), 'bloqueur de couleur iOS conserve');

// 4. Le plancher doit rester <= 12px (identique au fix labels carte PR #1019)
assert.ok(/clamp\(11px,2\.9vw,12px\)/.test(ruleBlock),
  'le clamp doit rester (11px,2.9vw,12px) — meme plancher que PR #1019');

console.log('OK Test 1: plancher font-size 11px impose sur les chips carte');
console.log('OK Test 2: !important + triple classe (bat inline JSX et skin de theme)');
console.log('OK Test 3: recettes de lisibilite existantes intactes');
console.log('OK Test 4: clamp identique au plancher de reference (PR #1019)');
