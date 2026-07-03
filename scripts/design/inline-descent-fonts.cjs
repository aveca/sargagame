#!/usr/bin/env node
/* ============================================================
   Inline les polices (base64) dans design/proto-ecoscene-descent.html
   → un fichier HTML UNIQUE, 100 % hors-ligne, ZÉRO requête réseau
   (rend à l'identique en file://, sur clé USB, en pièce jointe, ou servi).

   Idempotent : relit public/fonts et réécrit le `src` de CHAQUE @font-face
   du bloc <style id="offline-fonts"> (qu'il contienne un placeholder
   __XXX__ ou déjà un data:URI). Aucune police tierce ; les libellés « mono »
   retombent sur une monospace système côté CSS.

   Usage : node scripts/design/inline-descent-fonts.cjs
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..', '..');
const HTML  = path.join(ROOT, 'design', 'proto-ecoscene-descent.html');
const FONTS = path.join(ROOT, 'public', 'fonts');

// famille × sous-ensemble → fichier woff2 auto-hébergé (cf. public/fonts/fonts.css)
const MAP = {
  'anton|latin'    : 'anton-1Ptgg87LROyAm3Kz-C8.woff2',
  'anton|ext'      : 'anton-1Ptgg87LROyAm3K9-C8QSw.woff2',
  'bricolage|latin': 'bricolagegrotesque-3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGIInE.woff2',
  'bricolage|ext'  : 'bricolagegrotesque-3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGGInHEVA.woff2',
  'jetbrains|latin': 'jetbrainsmono-latin-500.woff2',
};

function dataUri(file) {
  const buf = fs.readFileSync(path.join(FONTS, file));
  return 'data:font/woff2;base64,' + buf.toString('base64');
}

let html = fs.readFileSync(HTML, 'utf8');
let faces = 0, bytes = 0;

function rewriteBlock(id) {
  const re = new RegExp('<style id="' + id + '">([\\s\\S]*?)<\\/style>');
  const block = html.match(re);
  if (!block) { console.error(`ERREUR : bloc <style id="${id}"> introuvable.`); process.exit(1); }
  const rewritten = block[1].replace(/@font-face\{[\s\S]*?\}/g, (rule) => {
    const fam = /JetBrains/.test(rule) ? 'jetbrains' : /Bricolage/.test(rule) ? 'bricolage' : /Anton/.test(rule) ? 'anton' : null;
    const sub = /U\+0100-02BA/.test(rule) ? 'ext' : /U\+0000-00FF/.test(rule) ? 'latin' : null;
    if (!fam || !sub) return rule;
    const file = MAP[fam + '|' + sub];
    if (!file) return rule;
    const uri = dataUri(file);
    bytes += fs.statSync(path.join(FONTS, file)).size;
    faces++;
    // ne remplace QUE l'url() (base64 sans parenthèses), garde ` format('woff2')`
    return rule.replace(/src:url\([^)]*\)/, 'src:url(' + uri + ')');
  });
  html = html.replace(re, '<style id="' + id + '">' + rewritten + '</style>');
}

rewriteBlock('offline-fonts');
rewriteBlock('offline-fonts-mono');

if (faces !== Object.keys(MAP).length) {
  console.error(`ERREUR : ${faces}/${Object.keys(MAP).length} @font-face reconnues — abandon.`);
  process.exit(1);
}

fs.writeFileSync(HTML, html);

const kb = (n) => (n / 1024).toFixed(1) + ' Ko';
console.log(`OK — ${faces} polices inlinées (${kb(bytes)} binaire → base64 dans le HTML).`);
console.log('Le fichier est désormais autonome : aucune requête réseau au rendu.');
