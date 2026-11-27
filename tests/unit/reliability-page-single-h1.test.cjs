#!/usr/bin/env node
'use strict'

/**
 * reliability-page-single-h1.test.cjs — /fiabilite/ doit rendre UN SEUL <h1>.
 *
 * DÉFAUT MESURÉ (2026-10-26, Playwright/Chromium sur les 6 domaines) :
 * `/fiabilite/` retournait `h1=2`, deux fois le même texte
 * « Nos prévisions, vérifiées ».
 *
 * Cause : la page porte DEUX variants de héros — `.control-only` (fallback) et
 * `.v2 .hero` (actif) — et chacun rendait son propre `<h1>`. Le variant inactif
 * est masqué par CSS (`.rel-control .v2` / `.rel-v2 .control-only`,
 * `display:none !important`) et choisi côté client (A/B `ab.rel_v2`).
 * Un seul `<h1>` est donc VISIBLE, mais DEUX restent dans le HTML servi, crawlé
 * et indexé : anti-pattern SEO + structure de titres ambiguë.
 *
 * Correctif : le style du titre est extrait dans une classe partagée `.r-h1`.
 * Le variant ACTIF reste `<h1 class="r-h1">` ; le fallback devient
 * `<p class="r-h1">` — rendu identique, un seul heading de niveau 1.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'scripts', 'lib', 'reliability-page.cjs'), 'utf8');

// ── 1. Un seul <h1> dans le markup (hors commentaires CSS) ──────────────────
const markup = src.replace(/\/\*[\s\S]*?\*\//g, '');
const h1Tags = markup.match(/<h1[\s>]/g) || [];
assert.strictEqual(h1Tags.length, 1,
  'la page /fiabilite/ ne doit rendre qu un seul <h1> (il y en avait deux)');

// ── 2. Les deux variants existent toujours (aucun contenu supprimé) ─────────
assert.ok(/<div class="control-only">/.test(src), 'le variant fallback .control-only doit être conservé');
assert.ok(/<div class="hero">/.test(src), 'le variant actif .v2 .hero doit être conservé');
assert.ok(/<div class="v2">/.test(src), 'le conteneur .v2 doit être conservé');
// Le fallback porte encore le titre, mais en <p> (rendu identique via .r-h1)
assert.ok(/<p class="r-h1">\$\{esc\(t\.h1a\)\} <em>\$\{esc\(t\.h1b\)\}<\/em><\/p>/.test(src),
  'le fallback doit conserver le meme texte de titre, en <p class="r-h1">');
// Le variant actif reste le <h1>
assert.ok(/<h1 class="r-h1">\$\{esc\(t\.h1a\)\} <em>\$\{esc\(t\.h1b\)\}<\/em><\/h1>/.test(src),
  'le variant actif doit rester <h1 class="r-h1">');

// ── 3. Le style est partagé : zéro changement visuel ────────────────────────
assert.ok(/\.r-h1\{font-family:var\(--font-display\);font-size:clamp\(32px,7\.5vw,46px\)/.test(src),
  'la classe .r-h1 doit porter le style du titre (taille responsive conservée)');
assert.ok(/\.r-h1 em\{font-style:normal;color:var\(--gold-d\)\}/.test(src),
  'la classe .r-h1 em doit conserver la couleur or du fragment');
// Les anciennes règles ciblant la balise h1 ne doivent plus exister
assert.ok(!/^\s{2}h1\{/m.test(src), 'ancienne regle `h1{...}` supprimee (remplacee par .r-h1)');
assert.ok(!/^\s{2}h1 em\{/m.test(src), 'ancienne regle `h1 em{...}` supprimee (remplacee par .r-h1 em)');
// Les deux variants restent masqués l un par l autre (A/B intacte)
assert.ok(/\.rel-control \.v2 \{ display: none !important; \}/.test(src), 'A/B : masquage .v2 conserve');
assert.ok(/\.rel-v2 \.control-only \{ display: none !important; \}/.test(src), 'A/B : masquage .control-only conserve');

console.log('OK Test 1: un seul <h1> dans le markup de /fiabilite/ (il y en avait deux)');
console.log('OK Test 2: les deux variants A/B et leurs textes sont conserves');
console.log('OK Test 3: style partage via .r-h1, zero changement visuel, A/B intacte');
