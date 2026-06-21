#!/usr/bin/env node
/**
 * auto-outreach.cjs — Automated backlink outreach
 *
 * Pipeline:
 *   1. Scrape Google News for new articles about sargassum (FR, + US/MX/DR
 *      when OUTREACH_INTL=1), tagging each target with its market.
 *   2. Find contact emails on target sites
 *   3. Send a market-aware outreach email via SMTP (boîte alerte@). FR pitches
 *      the MQ/GP maps; US/MX/DR pitch the region site + the free-to-cite /press/
 *      kit, in the local language. The From DISPLAY name stays per-market
 *      ("Sargassum Florida"…) but the address is normalised to
 *      alerte@sargasses-martinique.com (SPF/DKIM), and replies route to
 *      contact@sargasses-martinique.com — everything goes out from the FR domain.
 *   4. Track contacted sites to never re-email
 *
 * Safety: max 5 emails per run. Dedup by domain. Professional tone. Intl is
 * gated on OUTREACH_INTL=1; intl send-failures are NOT recorded, so targets
 * retry next week. DRY_RUN never writes the log (no target gets burned).
 *
 * Cron: 1x/semaine (Mardi 10h UTC) via weekly-outreach.yml
 *
 * Usage:
 *   node scripts/automation/auto-outreach.cjs
 *   DRY_RUN=1 node scripts/automation/auto-outreach.cjs
 *   DRY_RUN=1 OUTREACH_INTL=1 node scripts/automation/auto-outreach.cjs
 */
'use strict'

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, mailReady, normalizeFrom } = require('./lib/email-send.cjs')

const DRY_RUN = process.env.DRY_RUN === '1'
const MAX_EMAILS_PER_RUN = 5
// Réponses : tout l'outreach part désormais du domaine FR (boîte alerte@), donc on
// route les réponses vers une boîte FR réelle plutôt qu'un support@ intl non créé.
const OUTREACH_REPLY_TO = 'contact@sargasses-martinique.com'

const DATA_DIR = resolve(__dirname, 'data')
const OUTREACH_LOG = resolve(DATA_DIR, 'outreach-log.json')
const FROM = 'Sargasses Martinique <alerte@sargasses-martinique.com>'

// International outreach (US/MX/DR) is gated: it only sends when OUTREACH_INTL=1,
// because each non-FR market sends from its own domain and those domains must be
// verified as Resend senders first. Default OFF keeps the historical FR-only run.
const OUTREACH_INTL = process.env.OUTREACH_INTL === '1'

// Per-market config. `from` must be a verified Resend sender for that domain.
// `pitch` drives the email language + which site(s) and press kit we offer.
const MARKETS = {
  fr: {
    lang: 'fr', from: FROM, replyTo: 'contact@sargasses-martinique.com',
    sites: [['Martinique', 'https://sargasses-martinique.com/'], ['Guadeloupe', 'https://sargasses-guadeloupe.com/']],
    press: null, widget: 'https://sargasses-martinique.com/widget/', intl: false,
  },
  us: {
    lang: 'en', from: 'Sargassum Florida <alerte@sargassummiami.com>', replyTo: 'support@sargassummiami.com',
    region: 'Florida', sites: [['Florida', 'https://sargassummiami.com/']],
    press: 'https://sargassummiami.com/press/', widget: 'https://sargassummiami.com/widget/', intl: true,
  },
  mx: {
    lang: 'es', from: 'Sargazo Cancún <alerte@sargassumcancun.com>', replyTo: 'support@sargassumcancun.com',
    region: 'la Riviera Maya', regionEN: 'the Riviera Maya', sites: [['Cancún & Riviera Maya', 'https://sargassumcancun.com/']],
    press: 'https://sargassumcancun.com/press/', widget: 'https://sargassumcancun.com/widget/', intl: true,
  },
  dr: {
    lang: 'en', from: 'Sargassum Punta Cana <alerte@sargassumpuntacana.com>', replyTo: 'support@sargassumpuntacana.com',
    region: 'Punta Cana', sites: [['Punta Cana', 'https://sargassumpuntacana.com/']],
    press: 'https://sargassumpuntacana.com/press/', widget: 'https://sargassumpuntacana.com/widget/', intl: true,
  },
}
// Our own domains — never email ourselves (any market).
const OWN_DOMAINS = ['sargasses-martinique', 'sargasses-guadeloupe', 'sargassummiami', 'sargassumcancun', 'sargassumpuntacana']

// ── Seed targets (from competitor research 2026-04-09) ────────
const SEED_TARGETS = [
  { domain: 'jumbocar-martinique.com', url: 'https://www.jumbocar-martinique.com/blog-voyage/informations-pratiques/sargasses-martinique', reason: 'Rang #1 "sargasses martinique 2026", recommande de vérifier carte satellite sans linker' },
  { domain: 'jumbocar-guadeloupe.com', url: 'https://www.jumbocar-guadeloupe.com/visitez-la-guadeloupe/informations-pratiques/sargasses', reason: 'Rang #1 "sargasses guadeloupe 2026", recommande carte satellite sans linker' },
  { domain: 'chrissandvoyage.com', url: 'https://www.chrissandvoyage.com/sargasses', reason: 'Promet carte plages sans sargasses mais en a pas' },
  { domain: 'lagons-plages.com', url: 'https://www.lagons-plages.com/sargasses-caraibes.php', reason: 'Article sargasses complet, aucun lien vers outil suivi' },
  { domain: 'chouetteworld.com', url: 'https://chouetteworld.com/plus-belles-plages-de-martinique/', reason: 'Blog famille voyage Martinique, pas de mention sargasses temps réel' },
  { domain: 'zotcar.com', url: 'https://www.zotcar.com/blog/plus-belle-plage-martinique/', reason: 'Loueur voiture, blog plages MQ, pas de lien sargasses' },
  { domain: 'voyage-martinique.fr', url: 'https://www.voyage-martinique.fr/sargasse.html', reason: 'Article sargasses avec données 2024 périmées' },
  { domain: 'couleurvoyage.com', url: 'https://www.couleurvoyage.com/martinique-avis-complet-dun-voyageur-ce-quil-faut-vraiment-savoir/', reason: 'Avis voyage Martinique 2026, mentionne sargasses' },
  { domain: 'evazeo.com', url: 'https://www.evazeo.com/blog/top-10-des-plus-belles-plages-de-martinique/', reason: 'Top 10 plages, pas de vérification sargasses' },
  { domain: 'generationvoyage.fr', url: 'https://generationvoyage.fr/plus-belles-plages-guadeloupe/', reason: 'Top plages GP, pas de mention sargasses' },
  { domain: 'toploc.com', url: 'https://toploc.com/blog/amerique/plages-guadeloupe', reason: 'Top plages GP, location entre particuliers' },
  { domain: 'antilleslocation.com', url: 'https://www.antilleslocation.com/blog-voyage/les-plus-belles-plages-de-la-guadeloupe.html', reason: 'Location Antilles, article plages' },
  { domain: 'espaces.ca', url: 'https://www.espaces.ca/articles/destinations/25273-les-7-plus-belles-plages-de-la-martinique', reason: 'Mag plein air québécois, public nord-américain francophone' },
  { domain: 'airvacances.fr', url: 'https://www.airvacances.fr/sargasses-guadeloupe-martinique-periodes-eviter/', reason: 'Article "quand partir sans sargasses", pas de lien outil temps réel' },
  // GP-focused boost (2026-04-17 data-driven — GP trails MQ 45% in clicks)
  { domain: 'lesilesdeguadeloupe.com', url: 'https://www.lesilesdeguadeloupe.com/', reason: 'Office du tourisme officiel GP — audience #1 requête destination' },
  { domain: 'karukera-guadeloupe.com', url: 'https://www.karukera-guadeloupe.com/guadeloupe/plages.html', reason: 'Guide plages GP, pas de lien état sargasses temps réel' },
  { domain: 'guadeloupe-fr.com', url: 'https://www.guadeloupe-fr.com/plages-de-guadeloupe/', reason: 'Répertoire plages GP, sans outil temps réel' },
  { domain: 'tourisme-guadeloupe.fr', url: 'https://www.tourisme-guadeloupe.fr/', reason: 'Portail tourisme GP, public actuel sans data sargasses' },
  { domain: 'guideguadeloupe.com', url: 'https://www.guideguadeloupe.com/plages-guadeloupe.html', reason: 'Guide voyage GP, pas de mention sargasses' },

  // ── International seeds (only emailed when OUTREACH_INTL=1). `market` picks the
  //    press kit / region; `lang` is the email language (can differ — e.g. an
  //    English-language outlet covering Cancún uses the MX kit in English).
  //    Curated real outlets that regularly cover Caribbean/Mexico/Florida sargassum.
  // Florida (US press kit, English)
  { domain: 'keysweekly.com', url: 'https://keysweekly.com/', market: 'us', lang: 'en', reason: 'Florida Keys Weekly — local news, covers sargassum landings in the Keys' },
  { domain: 'floridatoday.com', url: 'https://www.floridatoday.com/', market: 'us', lang: 'en', reason: 'Florida Today (Space Coast) — beach + sargassum coverage' },
  // Cancún & Riviera Maya (MX press kit)
  { domain: 'thecancunsun.com', url: 'https://thecancunsun.com/', market: 'mx', lang: 'en', reason: 'The Cancun Sun — English news, heavy sargazo coverage for travelers' },
  { domain: 'riviera-maya-news.com', url: 'https://www.riviera-maya-news.com/', market: 'mx', lang: 'en', reason: 'Riviera Maya News — English, regular sargassum reporting' },
  { domain: 'theyucatantimes.com', url: 'https://www.theyucatantimes.com/', market: 'mx', lang: 'en', reason: 'The Yucatan Times — English regional paper, sargassum stories' },
  { domain: 'sipse.com', url: 'https://sipse.com/', market: 'mx', lang: 'es', reason: 'SIPSE / Novedades Quintana Roo — Spanish, cobertura constante del sargazo' },
  // Punta Cana (DR press kit, English)
  { domain: 'dominicantoday.com', url: 'https://dominicantoday.com/', market: 'dr', lang: 'en', reason: 'Dominican Today — English DR news, Punta Cana sargassum coverage' },

  // ════════════════════════════════════════════════════════════════════════
  // Expansion 2026-06-21 (recherche vérifiée). Cibles qui publient déjà du
  // contenu sargasses/plages mais ne linkent AUCUN outil de suivi temps réel.
  // ── FR Martinique (market fr) — pages sargasses sans carte live d'abord :
  { domain: 'wlaps.com', url: 'https://wlaps.com/plages-sargasses-en-martinique/', reason: 'Guide « plages sans sargasses » MQ, ne cite que le bulletin officiel, pas de carte live' },
  { domain: 'ile-tropicale.fr', url: 'https://www.ile-tropicale.fr/martinique-quelles-plages-sont-epargnees-par-les-sargasses/', reason: 'Article « plages épargnées » MQ, renvoie aux prévisions gov sans carte intégrée' },
  { domain: 'beyondthebeach.fr', url: 'https://www.beyondthebeach.fr/366-sargasses-martinique-un-moyen-sur-pour-les-eviter/', reason: '« Comment éviter les sargasses » MQ, ne mentionne que la carte DEAL' },
  { domain: 'lechotouristique.com', url: 'https://www.lechotouristique.com/article/martinique-les-plages-sans-sargasses-a-conseiller-a-vos-clients', reason: 'Presse trade voyage : quelles plages conseiller aux clients — exactement notre intel' },
  { domain: 'fairmoove.fr', url: 'https://www.fairmoove.fr/blog/iles-paradisiaques/plages-belles-martinique', reason: 'Blog plus belles plages MQ, pas de vérif sargasses temps réel' },
  { domain: 'carnetdetipiment.com', url: 'https://carnetdetipiment.com/2018/11/17/guide-complet-des-plus-belles-plages-de-martinique/', reason: 'Guide complet plages MQ, sans état sargasses' },
  { domain: 'bestjobersblog.com', url: 'https://www.bestjobersblog.com/que-faire-en-martinique-itineraire-conseils/', reason: 'Itinéraire/conseils MQ, public voyageur sans data sargasses' },
  { domain: 'leslovetrotteurs.com', url: 'https://leslovetrotteurs.com/martinique/', reason: 'Blog voyage MQ, guide plages sans outil sargasses' },
  { domain: 'la-poze-travel.com', url: 'https://www.la-poze-travel.com/martinique-nos-incontournables/', reason: 'Incontournables MQ, pas de mention sargasses temps réel' },
  { domain: 'rci.fm', url: 'https://rci.fm/martinique/infos', reason: 'Radio Caraïbes Intl — publie régulièrement les échouages MQ, autorité régionale' },
  { domain: 'outremers360.com', url: 'https://www.outremers360.com/', reason: 'Média Outre-mer, couverture récurrente sargasses bassin atlantique (forte autorité)' },
  { domain: 'madinin-art.net', url: 'https://www.madinin-art.net/sargasses-des-echouements-records-en-2025-dans-les-antilles/', reason: 'Mag culture/actu MQ, dossiers sargasses' },
  // ── FR Guadeloupe (market fr) — GP traîne MQ, on pousse :
  { domain: 'piedsdanslesable.fr', url: 'https://www.piedsdanslesable.fr/plage-guadeloupe/sans-sargasses/', reason: '« Plages sans sargasses » GP, ne linke que le bulletin Météo-France' },
  { domain: '1monde.net', url: 'https://1monde.net/ou-se-baigner-en-guadeloupe-sans-sargasse/', reason: '« Où se baigner sans sargasse » GP, conseils généraux sans tracker' },
  { domain: 'vacances-aux-antilles.com', url: 'https://www.vacances-aux-antilles.com/guadeloupe/sargasses/', reason: 'Page sargasses GP dédiée + pages par plage, sans carte live' },
  { domain: 'karibinfo.com', url: 'https://www.karibinfo.com/news/', reason: 'Actu Caraïbe, articles fréquents « où se baigner en GP » sargasses' },
  { domain: 'we-love-guadeloupe.com', url: 'https://www.we-love-guadeloupe.com/', reason: 'Guide GP rédigé par une résidente, pages plages sans état sargasses' },
  { domain: 'lagon-travel.com', url: 'https://www.lagon-travel.com/blog-voyage/', reason: 'Blog voyage GP, location, sans outil sargasses' },
  { domain: 'trotteurs-addict.com', url: 'https://trotteurs-addict.com/guadeloupe/', reason: 'Blog voyage GP, guide plages sans data sargasses' },
  { domain: 'noscoeursvoyageurs.fr', url: 'https://www.noscoeursvoyageurs.fr/les-plages-de-guadeloupe/', reason: 'Article plages GP, pas de vérif sargasses' },
  { domain: 'rentiles.fr', url: 'https://www.rentiles.fr/blog-voyage/idee-itineraire-10-jours-guadeloupe.html', reason: 'Loueur + blog voyage GP, public direct sans data sargasses' },
  { domain: 'heures-saines.com', url: 'https://www.heures-saines.com/', reason: 'Centre de plongée Malendure/Bouillante (côte sous-le-vent = zone épargnée à conseiller)' },
  { domain: 'pisquettes.com', url: 'https://www.pisquettes.com/', reason: 'Centre de plongée Les Saintes, oriente ses clients vers les criques propres' },

  // ── International (envoyé seulement si OUTREACH_INTL=1) ──
  // US Florida (us press kit) :
  { domain: 'floridarambler.com', url: 'https://www.floridarambler.com/beaches/sargassum-seaweed-florida-beaches/', market: 'us', lang: 'en', reason: 'Continuously-updated sargassum status page, no dedicated live tracker — ideal fit' },
  { domain: 'wlrn.org', url: 'https://www.wlrn.org/environment', market: 'us', lang: 'en', reason: 'South Florida NPR, recurring sargassum environment beat' },
  { domain: 'local10.com', url: 'https://www.local10.com/news/local/', market: 'us', lang: 'en', reason: 'WPLG Miami, seasonal sargassum beach stories' },
  { domain: 'nbcmiami.com', url: 'https://www.nbcmiami.com/news/local/', market: 'us', lang: 'en', reason: 'NBC6 Miami, affected-vs-clear beach coverage' },
  { domain: 'cbs12.com', url: 'https://cbs12.com/news/local', market: 'us', lang: 'en', reason: 'WPEC Palm Beach / Treasure Coast sargassum coverage' },
  { domain: 'mynews13.com', url: 'https://www.mynews13.com/fl/orlando/news', market: 'us', lang: 'en', reason: 'Spectrum News 13, Space Coast/Brevard sargassum' },
  { domain: 'spacecoastdaily.com', url: 'https://spacecoastdaily.com/', market: 'us', lang: 'en', reason: 'Brevard local outlet, beach wrack/seaweed stories' },
  { domain: 'keywestislandnews.com', url: 'https://keywestislandnews.com/', market: 'us', lang: 'en', reason: 'Independent Key West news, link-friendly sargassum season posts' },
  { domain: 'theinvadingsea.com', url: 'https://www.theinvadingsea.com/', market: 'us', lang: 'en', reason: 'FAU-affiliated environment news, mission-aligned with a public data tool' },
  { domain: 'keywestpaddle.com', url: 'https://keywestpaddle.com/blog/', market: 'us', lang: 'en', reason: 'Key West tour operator « avoid the seaweed » tips' },
  // MX Cancún / Riviera Maya (mx press kit) :
  { domain: 'everythingplayadelcarmen.com', url: 'https://www.everythingplayadelcarmen.com/sargassum-forecast/', market: 'mx', lang: 'en', reason: 'Seaweed-forecast page links only USF/FB — clean upgrade gap' },
  { domain: 'govisitcancun.com', url: 'https://www.govisitcancun.com/blog/how-to-avoid-sargassum-in-cancun-in-2026/', market: 'mx', lang: 'en', reason: '« How to avoid sargassum » links only own cams' },
  { domain: 'playadelcarmen.com', url: 'https://www.playadelcarmen.com/blog/seaweed-playa-del-carmen/', market: 'mx', lang: 'en', reason: 'High-authority PdC portal, multiple seaweed posts, no live tracker' },
  { domain: 'playadelcarmenvacation.com', url: 'https://www.playadelcarmenvacation.com/daily-sargassum-sargasso-seaweed-report/', market: 'mx', lang: 'en', reason: 'Maintains a daily sargassum report page — obvious widget home' },
  { domain: 'stingrayvilla.com', url: 'https://www.stingrayvilla.com/sargassum-seaweed-in-cozumel/', market: 'mx', lang: 'en', reason: 'Cozumel rental villa, evergreen seaweed guide' },
  { domain: 'topmexicorealestate.com', url: 'https://www.topmexicorealestate.com/blog/tag/sargassum-riviera-maya/', market: 'mx', lang: 'en', reason: 'Recurring « sargassum update » series with tag archive' },
  { domain: 'cancun-adventure.com', url: 'https://www.cancun-adventure.com/en/blog/sargassum-cancun', market: 'mx', lang: 'en', reason: 'Tour operator pre-trip planning content' },
  { domain: 'poresto.com', url: 'https://www.poresto.com/quintana-roo/', market: 'mx', lang: 'es', reason: 'Por Esto! QR — frecuente « playas sin sargazo hoy »' },
  { domain: '24horasqroo.mx', url: 'https://24horasqroo.mx/', market: 'mx', lang: 'es', reason: 'Publica el semáforo del sargazo de Quintana Roo' },
  { domain: 'laverdadnoticias.com', url: 'https://laverdadnoticias.com/quintanaroo/', market: 'mx', lang: 'es', reason: 'Periodismo de servicio « dónde ir sin sargazo este fin de semana »' },
  // DR Punta Cana / Bávaro (dr press kit) :
  { domain: 'bavarodigital.net', url: 'https://bavarodigital.net/', market: 'dr', lang: 'es', reason: 'Medio local Bávaro/Punta Cana, reportes de sargazo playa por playa' },
  { domain: 'bavaronews.com', url: 'https://bavaronews.com/', market: 'dr', lang: 'es', reason: 'Periódico digital Bávaro-Verón-Punta Cana' },
  { domain: 'drsimplified.com', url: 'https://drsimplified.com/what-to-know-about-sargassum-in-the-dominican-republic/', market: 'dr', lang: 'en', reason: 'Expat guide, « what to know about sargassum in the DR »' },
  { domain: 'puntacanatravelblog.com', url: 'https://puntacanatravelblog.com/general-information-faq/seaweed-punta-cana-sargassum/', market: 'dr', lang: 'en', reason: 'Punta Cana travel blog, dedicated seaweed/sargassum FAQ' },
  { domain: 'everythingpuntacana.com', url: 'https://www.everythingpuntacana.com/punta-cana-seaweed-guide/', market: 'dr', lang: 'en', reason: 'Punta Cana seaweed guide, no live tracker' },
  { domain: 'godominicantravel.com', url: 'https://godominicantravel.com/sargassum-or-seaweed-in-punta-cana/', market: 'dr', lang: 'en', reason: 'DR travel guide, sargassum/seaweed explainer' },
  { domain: 'puntacanard.com', url: 'https://puntacanard.com/travel-tips/sargassum-in-punta-cana-what-to-know-before-your-trip/', market: 'dr', lang: 'en', reason: 'Punta Cana travel tips, pre-trip sargassum advice' },
  { domain: 'boattripspuntacana.com', url: 'https://boattripspuntacana.com/seaweed-in-punta-cana/', market: 'dr', lang: 'en', reason: 'Punta Cana tour operator, 2026 seaweed guide' },
]

// ── Helpers ──────────────────────────────────────────────────

function readJSON(p) {
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

function writeJSON(p, data) {
  mkdirSync(resolve(p, '..'), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function emailDomain(email) {
  const at = String(email).lastIndexOf('@')
  return at > -1 ? String(email).slice(at + 1).trim().toLowerCase() : ''
}

// RGPD : outreach-log.json ne stocke plus d'email en clair — uniquement
// emailHash (+ emailDomain pour le reporting B2B). Les entrées legacy
// (champ `email` contenant '@') sont converties en mémoire à la lecture ;
// le fichier est réécrit hashé à la prochaine sauvegarde.
function sanitizeContacted(contacted) {
  for (const rec of Object.values(contacted || {})) {
    if (rec && typeof rec.email === 'string' && rec.email.includes('@')) {
      rec.emailHash = emailHash(rec.email)
      rec.emailDomain = emailDomain(rec.email)
      delete rec.email
    }
  }
  return contacted || {}
}

// ── Step 1: Find new targets from Google ──────────────────────

async function scrapeNewTargets() {
  // Each query carries its market + the Google News locale that surfaces the
  // right-language press/travel sites. FR always runs; US/MX/DR only when intl
  // is enabled (so we don't discover targets we're not allowed to email yet).
  const QUERIES = [
    { q: 'sargasses martinique plage 2026', market: 'fr', loc: 'hl=fr&gl=FR&ceid=FR:fr' },
    { q: 'sargasses guadeloupe carte 2026', market: 'fr', loc: 'hl=fr&gl=FR&ceid=FR:fr' },
    { q: 'meilleure plage martinique sargasses', market: 'fr', loc: 'hl=fr&gl=FR&ceid=FR:fr' },
    { q: 'plage guadeloupe sans sargasses', market: 'fr', loc: 'hl=fr&gl=FR&ceid=FR:fr' },
    { q: 'sargassum florida beach 2026', market: 'us', loc: 'hl=en-US&gl=US&ceid=US:en' },
    { q: 'sargassum miami beach forecast', market: 'us', loc: 'hl=en-US&gl=US&ceid=US:en' },
    { q: 'sargazo cancún playa 2026', market: 'mx', loc: 'hl=es-419&gl=MX&ceid=MX:es-419' },
    { q: 'sargassum punta cana 2026', market: 'dr', loc: 'hl=en-US&gl=US&ceid=US:en' },
  ]
  const pool = QUERIES.filter(x => OUTREACH_INTL || x.market === 'fr')
  const newTargets = []
  // Pick one query per run (rotate by day across the active pool)
  const { q, market, loc } = pool[Math.floor(Date.now() / 86400000) % pool.length]

  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const xml = await res.text()
    const linkRegex = /<link>(https?:\/\/[^<]+)<\/link>/g
    let match
    while ((match = linkRegex.exec(xml)) !== null) {
      const link = match[1]
      if (link.includes('news.google.com')) continue
      const domain = extractDomain(link)
      if (domain && !OWN_DOMAINS.some(d => domain.includes(d))) {
        newTargets.push({ domain, url: link, market, reason: `Found via Google News for "${q}"` })
      }
    }
  } catch (e) {
    console.warn(`  Scrape failed: ${e.message}`)
  }

  return newTargets
}

// ── Step 2: Find contact email on a site ──────────────────────

async function findContactEmail(siteUrl) {
  const domain = extractDomain(siteUrl)
  const contactPaths = ['/contact', '/contact/', '/contactez-nous', '/a-propos', '/about', '/mentions-legales']

  // Try contact pages first
  for (const path of contactPaths) {
    try {
      const base = `https://www.${domain}`
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        redirect: 'follow',
      })
      if (!res.ok) continue
      const html = await res.text()
      const emails = extractEmails(html, domain)
      if (emails.length > 0) return emails[0]
    } catch { /* continue */ }
  }

  // Try main page
  try {
    const res = await fetch(siteUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      redirect: 'follow',
    })
    if (res.ok) {
      const html = await res.text()
      const emails = extractEmails(html, domain)
      if (emails.length > 0) return emails[0]
    }
  } catch { /* continue */ }

  // Fallback: try common patterns
  return `contact@${domain}`
}

function extractEmails(html, domain) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const found = new Set()
  let match
  while ((match = emailRegex.exec(html)) !== null) {
    const email = match[0].toLowerCase()
    // Skip tracking pixels, CDN, framework emails
    if (email.includes('example.com')) continue
    if (email.includes('sentry.io')) continue
    if (email.includes('w3.org')) continue
    if (email.includes('schema.org')) continue
    if (email.includes('googleusercontent')) continue
    if (email.endsWith('.png') || email.endsWith('.jpg')) continue
    found.add(email)
  }
  // Prioritize: contact@ > info@ > others
  const sorted = [...found].sort((a, b) => {
    if (a.startsWith('contact@')) return -1
    if (b.startsWith('contact@')) return 1
    if (a.startsWith('info@')) return -1
    if (b.startsWith('info@')) return 1
    return 0
  })
  return sorted
}

// ── Step 3: Build outreach email ──────────────────────────────

const wrap = inner => `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
${inner}
</body></html>`

function buildEmailFR(target) {
  const isSargasseArticle = target.url.includes('sargass')
  const hook = isSargasseArticle
    ? `J'ai lu votre article sur les sargasses et je l'ai trouvé très utile pour les voyageurs.`
    : `Votre article sur les plages est une super ressource pour les voyageurs qui préparent leur séjour aux Antilles.`
  const value = isSargasseArticle
    ? `Nous avons développé <strong>la seule carte satellite en temps réel</strong> dédiée aux sargasses en Martinique et Guadeloupe — mise à jour 4 fois par jour avec les données Copernicus Marine (indice AFAI par plage).`
    : `Un conseil que vos lecteurs apprécieraient : vérifier l'état des sargasses avant de partir à la plage. Nous proposons <strong>une carte satellite gratuite</strong> mise à jour 4x/jour qui montre quelles plages sont propres aujourd'hui.`
  return wrap(`<p>Bonjour,</p>
<p>${hook}</p>
<p>${value}</p>
<p>Voici ce qu'elle offre :</p>
<ul>
  <li>135 plages surveillées (Martinique + Guadeloupe)</li>
  <li>Prévisions 7 jours par plage</li>
  <li>Alertes H2S (qualité de l'air)</li>
  <li>100% gratuit, pas de pub</li>
</ul>
<p><strong>Seriez-vous ouvert(e) à ajouter un lien vers notre carte dans votre article ?</strong></p>
<p>
  → Martinique : <a href="https://sargasses-martinique.com/">sargasses-martinique.com</a><br>
  → Guadeloupe : <a href="https://sargasses-guadeloupe.com/">sargasses-guadeloupe.com</a>
</p>
<p>Nous proposons aussi un <a href="https://sargasses-martinique.com/widget/">widget embarquable gratuit</a> si vous préférez intégrer directement l'état d'une plage sur votre site.</p>
<p>Merci pour votre travail,<br>
<strong>L'équipe Sargasses Martinique</strong><br>
<span style="color:#888;font-size:13px">Données satellite Copernicus Marine · sargasses-martinique.com</span></p>`)
}

function buildEmailEN(target, m) {
  const site = m.sites[0][1]
  const region = m.regionEN || m.region
  const isSarg = (target.url || '').includes('sargass')
  const opener = isSarg
    ? `Thanks for covering sargassum around ${region} — it's exactly what travelers need to know before they go.`
    : `Travelers planning a trip to ${region} increasingly ask one thing before they go: will the beach be clear of sargassum that day?`
  return wrap(`<p>Hi,</p>
<p>${opener}</p>
<p>We publish <strong>live, per-beach sargassum status for ${region}</strong> from Copernicus and NOAA satellite data — refreshed four times a day, with a 0–100 score and a 7-day forecast for each beach. It's <strong>free to cite with attribution</strong>, and we keep a press page with the data and a suggested citation:</p>
<p>→ Press kit &amp; data: <a href="${m.press}">${m.press.replace('https://', '')}</a><br>
→ Live map: <a href="${site}">${site.replace('https://', '').replace(/\/$/, '')}</a></p>
<p><strong>If it's a fit, a link to the live map (or any beach's status) would give your readers today's conditions instead of a seasonal average.</strong> We're also happy to provide beach-level data or a quick comment for a story.</p>
<p>There's a free <a href="${m.widget}">embeddable widget</a> too, if you'd rather show a beach's live status directly on your page.</p>
<p>Thanks for your work,<br>
<strong>The ${region} Sargassum team</strong><br>
<span style="color:#888;font-size:13px">Copernicus/NOAA satellite data · ${site.replace('https://', '').replace(/\/$/, '')}</span></p>`)
}

function buildEmailES(target, m) {
  const site = m.sites[0][1]
  const isSarg = (target.url || '').includes('sargass') || (target.url || '').includes('sargazo')
  const opener = isSarg
    ? `Gracias por cubrir el sargazo en ${m.region} — es justo lo que los viajeros necesitan saber antes de ir.`
    : `Quienes planean un viaje a ${m.region} se hacen cada vez más una pregunta antes de ir: ¿estará la playa libre de sargazo ese día?`
  return wrap(`<p>Hola,</p>
<p>${opener}</p>
<p>Publicamos el <strong>estado del sargazo en vivo, playa por playa, en ${m.region}</strong> a partir de datos satelitales de Copernicus y NOAA — actualizado cuatro veces al día, con un score de 0 a 100 y un pronóstico de 7 días por playa. Es <strong>libre de citar con atribución</strong>, y mantenemos una página de prensa con los datos y una cita sugerida:</p>
<p>→ Kit de prensa y datos: <a href="${m.press}">${m.press.replace('https://', '')}</a><br>
→ Mapa en vivo: <a href="${site}">${site.replace('https://', '').replace(/\/$/, '')}</a></p>
<p><strong>Si encaja, un enlace al mapa en vivo (o al estado de cualquier playa) le daría a sus lectores las condiciones de hoy en lugar de un promedio de temporada.</strong> También con gusto facilitamos datos por playa o un comentario para un reportaje.</p>
<p>Hay además un <a href="${m.widget}">widget gratuito</a> para mostrar el estado en vivo de una playa directamente en su sitio.</p>
<p>Gracias por su trabajo,<br>
<strong>El equipo de Sargazo ${m.region}</strong><br>
<span style="color:#888;font-size:13px">Datos satelitales Copernicus/NOAA · ${site.replace('https://', '').replace(/\/$/, '')}</span></p>`)
}

// A target's language can differ from its market's default (e.g. an English
// outlet covering Cancún: market 'mx' for the press kit, but lang 'en').
function langFor(target) {
  const m = MARKETS[target.market] || MARKETS.fr
  return target.lang || m.lang
}

function buildEmailHTML(target) {
  const m = MARKETS[target.market] || MARKETS.fr
  const lang = langFor(target)
  if (lang === 'fr') return buildEmailFR(target)
  if (lang === 'es') return buildEmailES(target, m)
  return buildEmailEN(target, m)
}

function buildSubject(target) {
  const m = MARKETS[target.market] || MARKETS.fr
  const lang = langFor(target)
  const isSarg = (target.url || '').includes('sargass') || (target.url || '').includes('sargazo')
  if (lang === 'fr') return isSarg ? `Votre article sargasses + notre carte satellite temps réel ?` : `Carte sargasses gratuite pour vos lecteurs ?`
  if (lang === 'es') return `Datos de sargazo libres de citar para su cobertura de ${m.region}`
  // Drop a leading article so "your <region> coverage" reads cleanly.
  const subjReg = (m.regionEN || m.region).replace(/^the /i, '')
  return `Free-to-cite sargassum data for your ${subjReg} coverage`
}

// ── Step 4: Send via SMTP (boîte alerte@) ─────────────────────

async function sendOutreachEmail(resend, to, target) {
  const m = MARKETS[target.market] || MARKETS.fr
  const subject = buildSubject(target)
  const html = buildEmailHTML(target)

  if (DRY_RUN) {
    console.log(`  [DRY RUN] (${target.market || 'fr'}) Would send to: ${logId(to)}`)
    console.log(`  From: ${normalizeFrom(m.from)} · reply-to: ${OUTREACH_REPLY_TO}`)
    console.log(`  Subject: ${subject}`)
    return { sent: true, dry: true }
  }

  try {
    const { data, error } = await sendEmail({
      from: m.from,
      to,
      subject,
      html,
      replyTo: OUTREACH_REPLY_TO,
    })
    if (error) {
      console.error(`  Failed: ${error.message}`)
      return { sent: false, error: error.message }
    }
    console.log(`  Sent to ${logId(to)} (id: ${data?.id})`)
    return { sent: true, id: data?.id }
  } catch (e) {
    console.error(`  Error: ${e.message}`)
    return { sent: false, error: e.message }
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`=== Auto-Outreach ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  if (!mailReady() && !DRY_RUN) {
    console.error('SMTP_PASS not set.')
    process.exit(0)
  }

  console.log(`International markets (US/MX/DR): ${OUTREACH_INTL ? 'ON' : 'off (set OUTREACH_INTL=1)'}`)
  const resend = null

  // Load outreach log (tracks contacted domains) — emails stored as hashes (RGPD)
  const log = readJSON(OUTREACH_LOG) || { contacted: {}, lastRun: null }
  const contacted = sanitizeContacted(log.contacted)

  // Step 1: Gather targets
  console.log('--- Step 1: Gathering targets ---')
  const scraped = await scrapeNewTargets()
  console.log(`  Scraped ${scraped.length} new potential targets`)

  // Seeds default to the FR market; scraped targets carry their query's market.
  const allTargets = [...SEED_TARGETS, ...scraped].map(t => ({ ...t, market: t.market || 'fr' }))

  // Filter out already-contacted domains + intl markets when intl is disabled.
  const fresh = allTargets.filter(t => !contacted[t.domain] && (OUTREACH_INTL || !MARKETS[t.market]?.intl))
  console.log(`  ${fresh.length} fresh targets (${Object.keys(contacted).length} already contacted)\n`)

  if (fresh.length === 0) {
    console.log('No new targets to contact.')
    log.lastRun = new Date().toISOString()
    if (!DRY_RUN) writeJSON(OUTREACH_LOG, log)
    return
  }

  // Step 2: Find emails and send (max MAX_EMAILS_PER_RUN)
  let sent = 0
  for (const target of fresh.slice(0, MAX_EMAILS_PER_RUN + 3)) { // try a few extra in case emails fail
    if (sent >= MAX_EMAILS_PER_RUN) break

    console.log(`--- Target: ${target.domain} ---`)
    console.log(`  URL: ${target.url}`)
    console.log(`  Reason: ${target.reason}`)

    // Find email
    const email = await findContactEmail(target.url)
    console.log(`  Email: ${logId(email)}`)

    if (!email) {
      console.log('  Skipped: no email found')
      contacted[target.domain] = { date: new Date().toISOString(), status: 'no-email' }
      continue
    }

    // Send
    const result = await sendOutreachEmail(resend, email, target)

    // Don't burn an intl target on a send failure: the most likely cause early
    // on is the market's Resend sender domain not being verified yet. Leave it
    // un-logged so it retries next week once the domain is verified.
    if (!result.sent && MARKETS[target.market]?.intl) {
      console.log(`  Send failed for intl target (${target.market}) — not recording, will retry: ${result.error || ''}`)
      console.log('')
      continue
    }

    contacted[target.domain] = {
      date: new Date().toISOString(),
      emailHash: emailHash(email),
      emailDomain: emailDomain(email),
      status: result.sent ? 'sent' : 'failed',
      error: result.error || null,
      url: target.url,
      market: target.market,
    }

    if (result.sent) sent++
    console.log('')
  }

  // Save log (dry runs never mutate state — they must not burn targets)
  log.contacted = contacted
  log.lastRun = new Date().toISOString()
  log.totalSent = Object.values(contacted).filter(c => c.status === 'sent').length
  if (!DRY_RUN) writeJSON(OUTREACH_LOG, log)

  console.log(`\n=== Done: ${sent} emails sent (${log.totalSent} total all-time) ===`)
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[auto-outreach] Fatal: ${err.message}`)
    process.exit(0)
  })
}

module.exports = { buildEmailHTML, buildSubject, MARKETS }
