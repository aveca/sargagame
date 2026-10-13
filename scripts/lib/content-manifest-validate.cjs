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
// Route /pass (premium/paiement) : segment exact uniquement, pour ne jamais
// rejeter une page publique legitime contenant "pass" (ex. /compass).
function paymentPathHit(pathname) {
  if (PAYMENT_PATH_PATTERNS.some((re) => re.test(pathname))) return true;
  return hasPassSegment(pathname);
}

const ENTRY_KEYS = new Set([
  'url', 'canonical', 'domain', 'region', 'lang', 'hreflang', 'kind',
  'title', 'description', 'lastmod', 'images', 'ogImage', 'videos',
  'indexable', 'indexableReason', 'listedInSitemap', 'inlinks',
]);
// Racine du manifeste : strict aussi (generatedAt = meta du fichier, optionnelle).
const ROOT_KEYS = new Set(['version', 'domain', 'region', 'generatedAt', 'pages']);

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
  // Date calendaire STRICTE : pas de roulement (2026-02-30 invalide),
  // mois 01-12, annees bissextiles respectees. Plage d'annees volontairement
  // non bornee (un contenu legal peut predater le site).
  if (typeof s !== 'string') return false;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}
// Segment de chemin EXACTEMENT "pass" (insensible a la casse) : route
// premium/paiement. Volontairement strict-segment : "passe", "passage",
// "compass" restent acceptes (calibre : 0 occurrence dans les 641 URL live).
function hasPassSegment(pathname) {
  return String(pathname || '').split('/').some((s) => s.toLowerCase() === 'pass');
}
// Query string ou fragment dans une URL emise : refuse (le manifeste ne
// decrit que des URL finales canoniques ; la normalisation ne sert qu'aux
// comparaisons internes).
function hasQueryOrFragment(u) {
  return /[?#]/.test(String(u || ''));
}
// ISO-8601 STRICT pour generatedAt (meta du fichier manifeste) :
// YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±HH:mm) — ni date seule (jour ambigu, fuseau
// absent), ni heure sans fuseau, ni format local ("Oct 13 2026"), ni date
// calendaire invalide. Documente dans le contrat §2.
function isStrictIsoDateTime(s) {
  if (typeof s !== 'string') return false;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d > dim) return false;
  if (h > 23 || mi > 59 || sec > 60) return false;
  const tz = m[8];
  if (tz !== 'Z') {
    const tm = tz.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!tm || Number(tm[2]) > 23 || Number(tm[3]) > 59) return false;
  }
  return true;
}
// Hote de page.url : doit etre le domaine du manifeste, avec tolerance
// explicite d'un unique prefixe "www." (forme publiee toleree). Tout autre
// hote = domaine etranger = refuse. Les canonicals externes restent permis
// (cohérence §5) ; les hotes des assets (images/videos/ogImage) et des
// hreflang ne sont pas contraints ici (CDN et alternates possibles).
function hostMatchesManifest(urlStr, domain) {
  let host = '';
  try {
    host = new URL(urlStr).hostname.toLowerCase();
  } catch {
    return false;
  }
  const d = String(domain || '').toLowerCase();
  return host === d || host === 'www.' + d;
}

function validateEntry(e, i, manifestDomain) {
  const errs = [];
  const at = `pages[${i}]`;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return [`${at} : entree invalide`];
  for (const k of Object.keys(e)) {
    if (!ENTRY_KEYS.has(k)) errs.push(`${at} : cle inconnue "${k}"`);
  }
  if (typeof e.url !== 'string' || !normUrl(e.url)) errs.push(`${at} : url absolue https requise`);
  else if (hasQueryOrFragment(e.url)) errs.push(`${at} : url sans query ni fragment requise`);
  if (!(e.canonical === null || (typeof e.canonical === 'string' && normUrl(e.canonical)))) {
    errs.push(`${at} : canonical null ou URL absolue requise`);
  } else if (typeof e.canonical === 'string' && hasQueryOrFragment(e.canonical)) {
    errs.push(`${at} : canonical sans query ni fragment requis`);
  }
  if (!DOMAINS.has(e.domain)) errs.push(`${at} : domain inconnu (${e.domain})`);
  if (!REGIONS.has(e.region)) errs.push(`${at} : region inconnue (${e.region})`);
  if (!(e.lang === null || LANGS.has(e.lang))) errs.push(`${at} : lang fr|en|es|null requise`);
  if (e.hreflang !== undefined) {
    const HL_KEYS = new Set(['lang', 'href']);
    if (!Array.isArray(e.hreflang) || e.hreflang.some((h) =>
      !h || typeof h !== 'object' || Array.isArray(h) ||
      Object.keys(h).some((k) => !HL_KEYS.has(k)) ||
      !LANGS.has(h.lang) || typeof h.href !== 'string' || !normUrl(h.href) || hasQueryOrFragment(h.href))) {
      errs.push(`${at} : hreflang [{lang, href absolu}] invalide (cles strictes, sans query/fragment)`);
    }
  }
  if (!KINDS.has(e.kind)) errs.push(`${at} : kind inconnu (${e.kind})`);
  if (!(e.title === null || typeof e.title === 'string')) errs.push(`${at} : title string|null requis`);
  if (!(e.description === null || typeof e.description === 'string')) errs.push(`${at} : description string|null requise`);
  if (!isDate(e.lastmod)) errs.push(`${at} : lastmod AAAA-MM-JJ requise (date contenu, jamais build)`);
  if (e.images !== undefined) {
    const IM_KEYS = new Set(['src', 'alt']);
    if (!Array.isArray(e.images) || e.images.some((im) =>
      !im || typeof im !== 'object' || Array.isArray(im) ||
      Object.keys(im).some((k) => !IM_KEYS.has(k)) ||
      typeof im.src !== 'string' || !normUrl(im.src) || hasQueryOrFragment(im.src) ||
      (im.alt !== undefined && im.alt !== null && typeof im.alt !== 'string'))) {
      errs.push(`${at} : images [{src absolu, alt?}] invalides (cles strictes, sans query/fragment)`);
    }
  }
  if (!(e.ogImage === null || e.ogImage === undefined ||
      (typeof e.ogImage === 'string' && normUrl(e.ogImage) && !hasQueryOrFragment(e.ogImage)))) {
    errs.push(`${at} : ogImage URL absolue sans query/fragment, ou null, requise`);
  }
  if (e.videos !== undefined && (!Array.isArray(e.videos) || e.videos.some((v) =>
      typeof v !== 'string' || !normUrl(v) || hasQueryOrFragment(v)))) {
    errs.push(`${at} : videos [URL absolues sans query/fragment] invalides`);
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
    if (paymentPathHit(p)) errs.push(`${at} : route paiement/compte interdite (${p})`);
  }
  return errs;
}

function validateManifest(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['manifeste : objet requis'];
  for (const k of Object.keys(obj)) {
    if (!ROOT_KEYS.has(k)) errs.push(`manifeste : cle inconnue "${k}"`);
  }
  if (obj.version !== '1') errs.push('manifeste : version "1" requise');
  if (!DOMAINS.has(obj.domain)) errs.push('manifeste : domain inconnu');
  if (!REGIONS.has(obj.region)) errs.push('manifeste : region inconnue');
  if (obj.generatedAt !== undefined && !isStrictIsoDateTime(obj.generatedAt)) {
    errs.push('manifeste : generatedAt ISO-8601 stricte requise si presente (AAAA-MM-JJTHH:mm:ss[.sss](Z|±HH:mm))');
  }
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) errs.push('manifeste : pages[] non vide requis');
  if (Array.isArray(obj.pages)) {
    // Doublons selon la normalisation convenue (§5) : /x et /x/ (ou casse
    // d'hote) designent la meme ressource. L'ORDRE des pages n'est PAS
    // verifie ici : le tri est un devoir du generateur (Phase C.2).
    const seen = new Map();
    obj.pages.forEach((e, i) => {
      errs.push(...validateEntry(e, i, obj.domain));
      if (e && typeof e === 'object') {
        if (e.domain !== undefined && e.domain !== obj.domain) {
          errs.push(`pages[${i}] : domain "${e.domain}" incoherent avec manifeste "${obj.domain}"`);
        }
        if (e.region !== undefined && e.region !== obj.region) {
          errs.push(`pages[${i}] : region "${e.region}" incoherente avec manifeste "${obj.region}"`);
        }
      }
      if (e && typeof e.url === 'string') {
        const n = normUrl(e.url);
        if (n) {
          if (!hostMatchesManifest(e.url, obj.domain)) {
            errs.push(`pages[${i}] : hote de l'url hors manifeste (attendu ${obj.domain}, www. tolere)`);
          }
          if (seen.has(n)) errs.push(`pages : doublon normalise ${e.url} (vu : ${seen.get(n)})`);
          else seen.set(n, e.url);
        }
      }
    });
  }
  return errs;
}

// Clusters canonical inter-domaines : signale, ne corrige jamais.
// Robuste aux entrees malformees (objets non-tableau, pages non-objets,
// url/canonical non-strings : ignores, jamais de throw).
function canonicalClusters(manifests) {
  const byCanon = new Map();
  for (const m of Array.isArray(manifests) ? manifests : []) {
    if (!m || typeof m !== 'object') continue;
    const pages = Array.isArray(m.pages) ? m.pages : [];
    for (const e of pages) {
      try {
        if (!e || typeof e !== 'object') continue;
        if (typeof e.canonical !== 'string' || typeof e.url !== 'string') continue;
        const n = normUrl(e.canonical);
        const p = new URL(e.url).pathname;
        if (!n) continue;
        if (!byCanon.has(n)) byCanon.set(n, []);
        byCanon.get(n).push(`${typeof m.domain === 'string' ? m.domain : '?'}${p}`);
      } catch {
        continue;
      }
    }
  }
  return [...byCanon.entries()].filter(([, urls]) => urls.length > 1)
    .map(([canonical, urls]) => ({ canonical, urls: urls.sort() }));
}

module.exports = { validateManifest, validateEntry, canonicalClusters, normUrl };
