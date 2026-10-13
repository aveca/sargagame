#!/usr/bin/env node
// content-manifest-validate.cjs — validateur pur du contrat
// docs/content-manifest.contract.md (v1). Sans dependances, sans I/O :
// validateManifest(obj) -> [] si valide, sinon liste d'erreurs (strings).
// Reutilisable tel quel par le futur generateur (pas de seconde source).
'use strict';

const DOMAINS = new Set([
  'sargasses-martinique.com', 'sargasses-guadeloupe.com', 'sargassummiami.com',
  'sargassumpuntacana.com', 'sargassumcancun.com', 'sargazotulum.com',
]);
const REGIONS = new Set(['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']);
const LANGS = new Set(['fr', 'en', 'es']);
const KINDS = new Set(['home', 'beach', 'hub', 'editorial', 'legal', 'pro', 'tool', 'data', 'other']);
const REASONS = new Set(['noindex', 'redirect', 'private', 'canonical-externe', 'excluded']);

const SECRET_PATTERNS = [/secret/i, /token/i, /api[_-]?key/i, /BEGIN PRIVATE KEY/, /sk_live/, /sb_secret/];
const PRIVATE_PATH_PATTERNS = [/\/_private\//, /\.php($|[?#])/, /\.htaccess($|[?#])/, /\.env($|[?#.])/, /(^|\/)\.[^/]*$/];
const PAYMENT_PATH_PATTERNS = [/\/api\/mollie/, /widget-token/, /b2b-trial/, /mollie_return/, /checkout/, /payment/];

const ENTRY_KEYS = new Set([
  'url', 'canonical', 'domain', 'region', 'lang', 'hreflang', 'kind',
  'title', 'description', 'lastmod', 'images', 'ogImage', 'videos',
  'indexable', 'indexableReason', 'listedInSitemap', 'inlinks',
]);

function normUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return null;
    x.hostname = x.hostname.toLowerCase();
    x.hash = '';
    x.search = '';
    return x.toString().replace(/\/$/, '') || x.origin;
  } catch {
    return null;
  }
}
function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function validateEntry(e, i) {
  const errs = [];
  const at = `pages[${i}]`;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return [`${at} : entree invalide`];
  for (const k of Object.keys(e)) {
    if (!ENTRY_KEYS.has(k)) errs.push(`${at} : cle inconnue "${k}"`);
  }
  if (typeof e.url !== 'string' || !normUrl(e.url)) errs.push(`${at} : url absolue https requise`);
  if (!(e.canonical === null || (typeof e.canonical === 'string' && normUrl(e.canonical)))) {
    errs.push(`${at} : canonical null ou URL absolue requise`);
  }
  if (!DOMAINS.has(e.domain)) errs.push(`${at} : domain inconnu (${e.domain})`);
  if (!REGIONS.has(e.region)) errs.push(`${at} : region inconnue (${e.region})`);
  if (!(e.lang === null || LANGS.has(e.lang))) errs.push(`${at} : lang fr|en|es|null requise`);
  if (e.hreflang !== undefined) {
    if (!Array.isArray(e.hreflang) || e.hreflang.some((h) => !h || !LANGS.has(h.lang) || typeof h.href !== 'string' || !normUrl(h.href))) {
      errs.push(`${at} : hreflang [{lang, href absolu}] invalide`);
    }
  }
  if (!KINDS.has(e.kind)) errs.push(`${at} : kind inconnu (${e.kind})`);
  if (!(e.title === null || typeof e.title === 'string')) errs.push(`${at} : title string|null requis`);
  if (!(e.description === null || typeof e.description === 'string')) errs.push(`${at} : description string|null requise`);
  if (!isDate(e.lastmod)) errs.push(`${at} : lastmod AAAA-MM-JJ requise (date contenu, jamais build)`);
  if (e.images !== undefined) {
    if (!Array.isArray(e.images) || e.images.some((im) => !im || typeof im.src !== 'string' || !normUrl(im.src) || (im.alt !== undefined && im.alt !== null && typeof im.alt !== 'string'))) {
      errs.push(`${at} : images [{src absolu, alt?}] invalides`);
    }
  }
  if (!(e.ogImage === null || e.ogImage === undefined || (typeof e.ogImage === 'string' && normUrl(e.ogImage)))) {
    errs.push(`${at} : ogImage URL absolue ou null requise`);
  }
  if (e.videos !== undefined && (!Array.isArray(e.videos) || e.videos.some((v) => typeof v !== 'string' || !normUrl(v)))) {
    errs.push(`${at} : videos [URL absolues] invalides`);
  }
  if (typeof e.indexable !== 'boolean') errs.push(`${at} : indexable booleen requis`);
  if (e.indexable === false && !REASONS.has(e.indexableReason)) {
    errs.push(`${at} : indexableReason requise (noindex|redirect|private|canonical-externe|excluded)`);
  }
  if (typeof e.listedInSitemap !== 'boolean') errs.push(`${at} : listedInSitemap booleen requis`);
  if (e.indexable === false && e.listedInSitemap === true) {
    errs.push(`${at} : indexable=false mais listedInSitemap=true (anomalie a corriger cote generation)`);
  }
  if (!(e.inlinks === null || (Number.isInteger(e.inlinks) && e.inlinks >= 0))) {
    errs.push(`${at} : inlinks int>=0|null requis (graphe existant)`);
  }
  // Invariants de securite : balaye la serialisation de l'entree.
  const blob = JSON.stringify(e);
  for (const re of SECRET_PATTERNS) {
    if (re.test(blob)) errs.push(`${at} : motif sensible interdit (${re})`);
  }
  const paths = [e.url, e.canonical].filter(Boolean).map((u) => { try { return new URL(u).pathname; } catch { return ''; } });
  for (const p of paths) {
    for (const re of PRIVATE_PATH_PATTERNS) {
      if (re.test(p)) errs.push(`${at} : chemin prive/interne interdit (${p})`);
    }
    for (const re of PAYMENT_PATH_PATTERNS) {
      if (re.test(p)) errs.push(`${at} : route paiement/compte interdite (${p})`);
    }
  }
  return errs;
}

function validateManifest(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['manifeste : objet requis'];
  if (obj.version !== '1') errs.push('manifeste : version "1" requise');
  if (!DOMAINS.has(obj.domain)) errs.push('manifeste : domain inconnu');
  if (!REGIONS.has(obj.region)) errs.push('manifeste : region inconnue');
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) errs.push('manifeste : pages[] non vide requis');
  if (Array.isArray(obj.pages)) {
    const seen = new Set();
    obj.pages.forEach((e, i) => {
      errs.push(...validateEntry(e, i));
      if (e && typeof e.url === 'string') {
        if (seen.has(e.url)) errs.push(`pages : doublon ${e.url}`);
        seen.add(e.url);
      }
    });
  }
  return errs;
}

// Clusters canonical inter-domaines : signale, ne corrige jamais.
function canonicalClusters(manifests) {
  const byCanon = new Map();
  for (const m of manifests) {
    for (const e of (m && m.pages) || []) {
      if (!e || !e.canonical) continue;
      const n = normUrl(e.canonical);
      if (!n) continue;
      if (!byCanon.has(n)) byCanon.set(n, []);
      byCanon.get(n).push(`${m.domain}${new URL(e.url).pathname}`);
    }
  }
  return [...byCanon.entries()].filter(([, urls]) => urls.length > 1)
    .map(([canonical, urls]) => ({ canonical, urls: urls.sort() }));
}

module.exports = { validateManifest, validateEntry, canonicalClusters, normUrl };
