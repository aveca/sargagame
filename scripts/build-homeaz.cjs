#!/usr/bin/env node
/**
 * build-homeaz.cjs — extrait le CSS + le markup SVG VERBATIM du proto validé
 * (design/proto-home-az.html) vers src/home-az-assets.js, pour les monter dans
 * un Shadow DOM (composant React HomeAZ, bras A/B `home_az`).
 *
 * Pourquoi : le proto = design validé navigateur. On garde son visuel
 * byte-identique (zéro transcription manuelle = zéro régression de tracé SVG).
 * Seule la logique (moteur scroll) est portée à la main dans src/HomeAZ.jsx.
 *
 * Adaptations Shadow DOM (le strict minimum, sur le CSS uniquement) :
 *   - `:root{`  -> `:host{`   (les variables CSS vivent sur l'hôte du shadow)
 *   - `body{`   -> `:host{`   (fond/typo/overflow portés par l'hôte)
 *   - `html{scroll-behavior:auto}` retiré (l'hôte scrolle)
 * Nettoyage markup : on retire le <h1 class="sr-only"> (l'app pose son aria sur
 * l'hôte) et le <div id="trackToast"> (debug du proto).
 *
 * Relancer après toute modif du proto : `node scripts/build-homeaz.cjs`
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "design", "proto-home-az.html");
const OUT = path.join(ROOT, "src", "home-az-assets.js");

const html = fs.readFileSync(SRC, "utf8");

/* ---- CSS : entre le 1er <style> et </style> ---- */
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

/* retirer le h1 sr-only (l'app gère l'aria sur l'hôte du dialog) */
markup = markup.replace(/<h1 class="sr-only">[\s\S]*?<\/h1>\s*/g, "");
/* retirer le toast de debug du proto */
markup = markup.replace(/<!--\s*bandeau d'événements[\s\S]*?id="trackToast"[\s\S]*?<\/div>\s*/g, "");

markup = markup.trim();

const banner =
`/* ⚠️ GÉNÉRÉ par scripts/build-homeaz.cjs — NE PAS ÉDITER À LA MAIN.
   Source de vérité = design/proto-home-az.html (design validé navigateur).
   CSS + markup SVG byte-identiques au proto, adaptés Shadow DOM.
   Relancer : node scripts/build-homeaz.cjs */`;

const out =
`${banner}
export const HOME_AZ_CSS = ${JSON.stringify(css)};
export const HOME_AZ_MARKUP = ${JSON.stringify(markup)};
`;

fs.writeFileSync(OUT, out);
console.log("✓ src/home-az-assets.js écrit");
console.log("  CSS   :", css.length, "chars");
console.log("  MARKUP:", markup.length, "chars");
/* garde-fous : le markup doit contenir les ancres du moteur */
const anchors = ["id=\"scroller\"", "id=\"viewport\"", "id=\"cam\"", "id=\"scene\"", "id=\"gPose\"", "id=\"bc0\"", "id=\"bc4\"", "id=\"yole\""];
const missing = anchors.filter(a => !markup.includes(a));
if (missing.length) { console.error("✗ ancres manquantes:", missing.join(", ")); process.exit(1); }
if (markup.includes("trackToast")) { console.error("✗ trackToast non retiré"); process.exit(1); }
console.log("✓ ancres OK");
