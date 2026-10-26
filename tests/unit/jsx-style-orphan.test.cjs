'use strict';

/**
 * jsx-style-orphan.test.cjs — garde-fou anti-fuite de code source à l'écran.
 *
 * BUG PRODUIT RÉEL (reproduit sur les 6 domaines, 2026-10-26) :
 * `src/WorldMapView.jsx` avait perdu l'ouverture de la balise
 * « Colonne de reflet solaire descendant sur la mer » :
 *
 *     {/* Colonne de reflet solaire descendant sur la mer *​/}
 *       pointerEvents:"none",zIndex:0,opacity:.42,mixBlendMode:"screen",
 *       background:"radial-gradient(40% 100% at 50% 0%, …)"}}/>
 *
 * Ce JSX reste VALIDE : les props ne sont plus interprétées comme un `style`,
 * elles deviennent du texte → 183 caractères de code brut peints en noir
 * (16px, opacity 1, visible, z-index 1020) sur la carte, sur les 6 domaines,
 * en 390×844 et 1440×900. Silencieux : build vert, aucune exception JS.
 *
 * Détection : une ligne qui COMMENCE par une prop de style React
 * (`pointerEvents:`, `mixBlendMode:`, `zIndex:` …) alors que la ligne
 * significative précédente ne peut pas la continuer (elle ne finit pas par
 * `{`, `,` ou `(`) ⇒ la balise ouvrante a été perdue.
 * Le scanner neutralise commentaires (bloc, ligne, JSX) et littéraux de
 * chaîne pour ne produire aucun faux positif.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLE_PROPS = [
  'pointerEvents', 'mixBlendMode', 'zIndex', 'backdropFilter', 'WebkitBackdropFilter',
  'userSelect', 'contentVisibility', 'overscrollBehavior', 'WebkitOverflowScrolling',
  'transformOrigin', 'forcedColorAdjust', 'backgroundBlendMode',
];

function walkJsx(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJsx(p, acc);
    else if (/\.jsx$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/**
 * Normalise un fichier ligne à ligne.
 * - comments: état courant (bloc/ligne)
 * - text: contenu utile, commentaires et littéraux de chaîne remplacés par des espaces
 *          (préserve les offsets → pas de faux marqueur de commentaire dans une chaîne)
 */
function normalize(src) {
  const out = [];
  let state = 'code'; // code | block | line | quote(' " `)
  let quote = '';
  const lines = src.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    let text = '';
    let inCommentThisLine = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i], n = raw[i + 1] || '';
      if (state === 'block') {
        text += ' ';
        if (c === '*' && n === '/') { state = 'code'; i++; }
        inCommentThisLine = true;
        continue;
      }
      if (state === 'line') { text += ' '; inCommentThisLine = true; continue; }
      if (state === 'quote') {
        text += ' ';
        if (c === '\\') { text += ' '; i++; continue; }
        if (c === quote) state = 'code';
        continue;
      }
      // state === 'code'
      if (c === '/' && n === '/') { state = 'line'; text += '  '; inCommentThisLine = true; i++; continue; }
      if (c === '/' && n === '*') { state = 'block'; text += '  '; inCommentThisLine = true; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { state = 'quote'; quote = c; text += ' '; continue; }
      text += c;
    }
    if (state === 'line') state = 'code';
    out.push({ raw, text, commentOnly: inCommentThisLine && text.trim() === '' });
  }
  return out;
}

const ROOT = path.resolve(__dirname, '..', '..');
const files = walkJsx(path.join(ROOT, 'src'));
const orphans = [];
let scanned = 0;

for (const f of files) {
  const lines = normalize(fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < lines.length; i++) {
    // Ignore les lignes sans contenu utile (commentaire, ou intérieur d'une chaîne
    // multi-ligne) : elles ne peuvent ni ouvrir ni continuer une liste de props.
    if (lines[i].commentOnly || lines[i].text.trim() === '') continue;
    if (!new RegExp(`^\\s*(${STYLE_PROPS.join('|')})\\s*:`).test(lines[i].raw)) continue;
    // ligne significative précédente
    let j = i - 1;
    while (j >= 0 && (lines[j].commentOnly || lines[j].text.trim() === '')) j--;
    if (j < 0) continue;
    const prev = lines[j].text.replace(/\s+$/, '');
    // Une continuation de props doit suivre une ouverture `{`, une virgule, ou un appel.
    if (!/[{(,]\s*$/.test(prev)) {
      orphans.push({
        file: path.relative(ROOT, f), line: i + 1,
        prev: lines[j].raw.trim().slice(0, 70),
        text: lines[i].raw.trim().slice(0, 70),
      });
    }
  }
  scanned++;
}

assert.deepStrictEqual(orphans, [],
  'Fuite JSX détectée : des props de style sont rendues comme TEXTE (balise ouvrante perdue) :\n' +
  orphans.map(o => `  ${o.file}:${o.line}\n    prev: ${o.prev}\n    text: ${o.text}`).join('\n'));

// ---- Assertions ciblées : le décor fautif est de nouveau une balise formée ----
const wm = fs.readFileSync(path.join(ROOT, 'src', 'WorldMapView.jsx'), 'utf8');
assert.ok(
  /\{\/\* Colonne de reflet solaire descendant sur la mer \*\/\}\s*\r?\n\s*<div style=\{\{position:"absolute",top:"4%",right:"14%",width:"22%",height:"66%",/.test(wm),
  '« Colonne de reflet solaire » doit être un <div style={{…}}> bien formé'
);
// Géométrie EXACTE du commit créateur 47fcc27 — aucune invention de design.
assert.ok(wm.includes('top:"4%",right:"14%",width:"22%",height:"66%"'),
  'géométrie d’origine restaurée (top:4% right:14% w:22% h:66%)');
// Le gradient du décor fuité doit apparaître EXACTEMENT une fois (une copie
// supplémentaires = collage partiel) et le bloc doit se refermer sur `}}/>`.
const gradHits = wm.match(/radial-gradient\(40% 100% at 50% 0%, rgba\(255,228,168,\.7\)/g) || [];
assert.strictEqual(gradHits.length, 1, 'une seule occurrence du décor « colonne de reflet solaire »');
assert.ok(wm.includes('background:"radial-gradient(40% 100% at 50% 0%, rgba(255,228,168,.7), rgba(255,210,140,.18) 46%, transparent 78%)"}}/>'),
  'le bloc restauré doit se refermer sur `}}/>`');

console.log(`✓ Test 1: ${scanned} fichiers .jsx scannés, 0 props de style orpheline`);
console.log('✓ Test 2: « Colonne de reflet solaire » = <div style={{…}}> bien formé, géométrie d’origine restaurée');
console.log('✓ Test 3: décor « colonne de reflet solaire » unique et bloc refermé sur }}>/>');
