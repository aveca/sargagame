/**
 * region-langs.cjs — Source UNIQUE de la politique multilingue des pages SEO
 * régionales (nouvelles régions USD uniquement — MQ/GP n'utilisent jamais ce code).
 *
 * Une région déclare `primaryLang` + `secondaryLangs` dans regions/<id>.json. Le
 * jeu de pages SEO de la langue PRIMAIRE vit à la racine (préfixe ''), chaque
 * langue SECONDAIRE sous /<lang>/ (ex. Riviera Maya : ES à la racine, EN sous /en/).
 *
 * Trois consommateurs DOIVENT s'accorder sur « quelles langues une région émet » :
 *   1. region-seo-pages.cjs  — génère les pages,
 *   2. vite.config.js (transformIndexHtml) — hreflang de la home,
 *   3. prepare-ftp.cjs       — garde le dossier /<lang>/ au déploiement.
 * D'où ce module partagé : une langue secondaire n'est émise QUE si son fichier
 * de contenu existe (regions/seo-content/<id>.<lang>.json). FL/PC déclarent
 * secondaryLangs:["es"] SANS fichier es → ils restent mono-langue (EN à la racine),
 * inchangés. Le jour où florida.es.json est écrit, /es/ s'active tout seul.
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')

// Seules deux langues secondaires possibles sur ces marchés : en / es.
const normLang = l => (l === 'es' ? 'es' : 'en')

// Fichier de contenu SEO d'une langue : primaire = <id>.json (inchangé, toutes
// les régions existantes l'utilisent), secondaire = <id>.<lang>.json.
function seoContentPath(regionId, lang, isPrimary) {
  return path.join(ROOT, 'regions', 'seo-content', isPrimary ? `${regionId}.json` : `${regionId}.${normLang(lang)}.json`)
}

// Langues réellement émises, primaire d'abord. Une secondaire n'est retenue que
// si son fichier de contenu existe (sinon on n'émet rien — jamais de page vide).
function emittedLangs(region) {
  if (!region) return []
  const primary = normLang(region.primaryLang)
  const langs = [primary]
  for (const raw of region.secondaryLangs || []) {
    const l = normLang(raw)
    if (l === primary || langs.includes(l)) continue
    if (fs.existsSync(seoContentPath(region.id, l, false))) langs.push(l)
  }
  return langs
}

// Préfixe d'URL/chemin d'une langue : '' pour la primaire, '/<lang>' sinon.
function langPrefix(region, lang) {
  return normLang(lang) === normLang(region.primaryLang) ? '' : `/${normLang(lang)}`
}

// Dossiers de langue secondaire effectivement générés (pour prepare-ftp : garder
// /en/ ou /es/ régional, sans embarquer la landing statique MQ public/en/).
function secondaryLangDirs(region) {
  const primary = normLang(region && region.primaryLang)
  return emittedLangs(region).filter(l => l !== primary)
}

module.exports = { normLang, seoContentPath, emittedLangs, langPrefix, secondaryLangDirs }
