#!/usr/bin/env node
/**
 * localize-404.cjs — Localisation de la page 404 par langue primaire de région.
 *
 * Contexte (tâche sargagame-ux-repair-404-i18n-20261011-001) : le bloc
 * « 404.html région-aware » de scripts/prepare-ftp.cjs remplaçait des chaînes
 * qui n'existent plus dans public/404.html (« Page introuvable », libellés
 * « >Carte< »…) → les 404 EN restaient à moitié en français, et les régions
 * ES (rivieramaya, tulum) recevaient de l'anglais. Aucun test ne couvrait ça.
 *
 * Ce module centralise les dictionnaires EN/ES ancrés sur les chaînes RÉELLES
 * de public/404.html, avec garde fail-loud : si la source évolue, le build
 * échoue au lieu de livrer un mélange silencieux FR/EN.
 *
 * Comportement FR strictement inchangé (un seul remplacement du nom de site,
 * comme avant) pour ne pas modifier la 404 MQ/GP en production.
 */
'use strict'

const FR = {
  langAttr: '<html lang="fr">',
  title: 'Le Veilleur a perdu celle-ci · Sargasses Martinique & Guadeloupe',
  h1: 'Même le satellite a perdu celle-ci',
  p: 'Cette page n’existe pas (ou a glissé au large). Pas grave — la mer, elle, est toujours là. Le Veilleur la regarde 4×/jour, baie par baie. Choisis une plage propre vérifiée ce matin, ou ouvre la carte.',
  cta: '>Voir la carte des sargasses<',
  planB: 'Le Plan B :',
  mapLink: '>la carte du jour<',
  forecastLink: '>Prévisions 7 jours<',
  legalLink: '>Mentions légales<',
  privacyLink: '>Confidentialité<',
  siteName: 'Sargasses Martinique & Guadeloupe'
}

const EN = {
  langAttr: '<html lang="en">',
  title: 'The Watcher lost this one · Sargassum {TITLE}',
  h1: 'Even the satellite lost this one',
  p: 'This page does not exist (or drifted offshore). No worries — the sea is still there. The Watcher checks it 4×/day, bay by bay. Pick a clean beach verified this morning, or open the map.',
  cta: '>See the sargassum map<',
  planB: 'Plan B:',
  mapLink: ">today's map<",
  forecastLink: '>7-day forecast<',
  legalLink: '>Legal<',
  privacyLink: '>Privacy<'
}

const ES = {
  langAttr: '<html lang="es">',
  title: 'El Vigía perdió esta · Sargazo {TITLE}',
  h1: 'Hasta el satélite perdió esta',
  p: 'Esta página no existe (o derivó mar adentro). No pasa nada — el mar sigue ahí. El Vigía lo revisa 4×/día, bahía por bahía. Elige una playa limpia verificada esta mañana o abre el mapa.',
  cta: '>Ver el mapa de sargazo<',
  planB: 'Plan B:',
  mapLink: '>el mapa de hoy<',
  forecastLink: '>Pronóstico 7 días<',
  legalLink: '>Avisos legales<',
  privacyLink: '>Privacidad<'
}

function replaceHtmlLang(html, value, lang) {
  // HTML minifiers/build plugins may reorder attributes or add attributes.
  // Match the actual lang attribute rather than requiring the exact literal
  // '<html lang="fr">', which caused regional builds to fail.
  const tag = /<html\b[^>]*>/i
  const match = String(html).match(tag)
  if (!match || !/\blang\s*=\s*(["'])[^"']*\1/i.test(match[0])) {
    throw new Error(\`404-i18n: attribut lang introuvable (lang=\${lang}) — public/404.html a changé ?\`)
  }
  const nextTag = match[0].replace(/(\blang\s*=\s*)(["'])[^"']*\2/i, \`$1\${JSON.stringify(value).slice(0, -1).slice(1)}\`)
  return String(html).replace(match[0], nextTag)
}

function replaceOnce(html, anchor, value, lang) {
  if (!html.includes(anchor)) {
    throw new Error(`404-i18n: ancre introuvable (lang=${lang}) : ${JSON.stringify(anchor.slice(0, 80))} — public/404.html a changé ?`)
  }
  return html.split(anchor).join(value)
}

/**
 * Localise le HTML de la 404.
 * @param {string} html - contenu de dist/404.html (issu de public/404.html)
 * @param {object} region - région (regions/<id>.json) avec primaryLang
 * @param {string} title - region.name (ex: « Tulum »)
 * @returns {string} HTML localisé. FR = inchangé sauf nom de site (comportement historique).
 */
function localize404(html, region, title) {
  const lang = region && region.primaryLang === 'es' ? 'es' : region && region.primaryLang === 'fr' ? 'fr' : 'en'
  const brand = lang === 'es' ? `Sargazo ${title}` : `Sargassum ${title}`
  // FR : historique — seul le nom de site est remplacé (le titre porte l'ancre).
  if (lang === 'fr') return replaceOnce(String(html), FR.siteName, brand, lang)
  // EN/ES : le titre complet (qui contient le nom de site) est remplacé en
  // premier via FR.title — aucun remplacement siteName séparé (ancre consommée).
  let out = String(html)
  const dict = lang === 'es' ? ES : EN
  const pairs = [

    [FR.title, dict.title.split('{TITLE}').join(title)],
    [FR.h1, dict.h1],
    [FR.p, dict.p],
    [FR.cta, dict.cta],
    [FR.planB, dict.planB],
    [FR.mapLink, dict.mapLink],
    [FR.forecastLink, dict.forecastLink],
    [FR.legalLink, dict.legalLink],
    [FR.privacyLink, dict.privacyLink]
  ]
  out = replaceHtmlLang(out, lang, lang)\n  for (const [anchor, value] of pairs) out = replaceOnce(out, anchor, value, lang)
  return out
}

module.exports = { localize404, FR, EN, ES }
