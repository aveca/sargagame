#!/usr/bin/env node
/**
 * build-beachdive.cjs — extrait le CSS + le markup SVG VERBATIM du proto validé
 * (design/proto-plage-plongee.html) vers src/beach-dive-assets.js, pour les monter
 * dans un Shadow DOM (composant React BeachDiveView, bras A/B `pw_beach_dive`).
 *
 * Adaptations Shadow DOM (strict minimum sur le CSS uniquement) :
 *   - `:root{`  -> `:host{`   (CSS vars vivent sur l'hôte du shadow)
 *   - `body{`   -> `:host{`
 *   - `html{scroll-behavior:auto}` retiré
 * Nettoyage markup : retire <h1 sr-only> + <div id="trackToast"> (debug proto).
 *
 * Relancer après toute modif du proto : `node scripts/build-beachdive.cjs`
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC  = path.join(ROOT, "design", "proto-plage-plongee.html");
const OUT  = path.join(ROOT, "src", "beach-dive-assets.js");

const html = fs.readFileSync(SRC, "utf8");

/* ---- CSS : entre <style> et </style> ---- */
const cssM = html.match(/<style>([\s\S]*?)<\/style>/);
if (!cssM) { console.error("CSS introuvable dans le proto"); process.exit(1); }
let css = cssM[1];

/* adaptations Shadow DOM */
css = css
  .replace(/:root\{/g, ":host{")
  .replace(/\bhtml\{scroll-behavior:auto\}\s*/g, "")
  .replace(/\bbody\{/g, ":host{");

/* ---- MARKUP : entre <body> et <script> ---- */
const bodyM = html.match(/<body>([\s\S]*?)<script>/);
if (!bodyM) { console.error("Body introuvable dans le proto"); process.exit(1); }
let markup = bodyM[1];

/* retirer le h1 sr-only (l'app pose son aria sur l'hôte du dialog) */
markup = markup.replace(/<h1 class="sr-only">[\s\S]*?<\/h1>\s*/g, "");
/* retirer le toast de tracking (debug proto) */
markup = markup.replace(/<!--[^>]*toast[^>]*-->\s*<div id="trackToast"[\s\S]*?<\/div>\s*/g, "");
markup = markup.replace(/<div id="trackToast"[\s\S]*?<\/div>\s*/g, "");

markup = markup.trim();

const banner =
`/* ⚠️ GÉNÉRÉ par scripts/build-beachdive.cjs — NE PAS ÉDITER À LA MAIN.
   Source de vérité = design/proto-plage-plongee.html (design validé navigateur).
   CSS + markup SVG byte-identiques au proto, adaptés Shadow DOM.
   Relancer : node scripts/build-beachdive.cjs */`;

const out =
`${banner}
export const BEACH_DIVE_CSS = ${JSON.stringify(css)};
export const BEACH_DIVE_MARKUP = ${JSON.stringify(markup)};
`;

fs.writeFileSync(OUT, out, "utf8");
const lines = out.split("\n").length;
console.log("beach-dive-assets.js écrit : " + lines + " lignes (" + Math.round(out.length/1024) + " kB)");
