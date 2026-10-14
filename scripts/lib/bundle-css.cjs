'use strict'
// Sélection du CSS principal Vite (/assets/index-*.css) dans un index.html buildé.
// Ne JAMAIS prendre « le premier .css » : /fonts/fonts.css le précède désormais
// (régression GP-NO-BUNDLE-CSS, 14/10/2026 — GP servi sans son CSS applicatif).
const BUNDLE_CSS_RE = /href="(\/assets\/[^"]*\.css)"/

function pickBundleCss(html) {
  const m = String(html).match(BUNDLE_CSS_RE)
  return m ? m[1] : ''
}

function hasBundleCss(cssSrcs) {
  return (cssSrcs || []).some(s => /^\/assets\/[^?#]*\.css(?:[?#].*)?$/.test(String(s)))
}

module.exports = { pickBundleCss, hasBundleCss, BUNDLE_CSS_RE }
