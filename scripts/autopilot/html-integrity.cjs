'use strict';

const crypto = require('node:crypto');

const REQUIRED_OPEN_METEO = [
  'https://api.open-meteo.com',
  'https://marine-api.open-meteo.com',
];

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] !== undefined ? match[1] : match[2]) : null;
}

function localAssetPath(ref, baseUrl) {
  try {
    const url = new URL(ref, baseUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin) return { ok: false, reason: 'asset externe ou origine incorrecte: ' + url.origin };
    return { ok: true, path: url.pathname + url.search };
  } catch {
    return { ok: false, reason: 'référence asset invalide: ' + String(ref) };
  }
}

/**
 * Extrait l'empreinte des éléments HTML critiques du build réellement préparé.
 * Aucune donnée distante ni fixture fabriquée n'est utilisée.
 */
function extractHtmlFingerprint(html, domain) {
  const source = String(html || '');
  const baseUrl = 'https://' + domain + '/';
  if (source.length < 500) return { ok: false, reason: 'HTML absent ou trop court' };

  const metas = [...source.matchAll(/<meta\b[^>]*>/gi)]
    .map(m => m[0])
    .filter(tag => /\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag));
  if (metas.length !== 1) return { ok: false, reason: 'meta CSP compte=' + metas.length + ', attendu exactement 1' };
  const csp = attr(metas[0], 'content');
  if (!csp) return { ok: false, reason: 'contenu de meta CSP absent' };
  const connectSrc = (csp.split(';').map(s => s.trim()).find(s => /^connect-src\s/i.test(s)) || '').split(/\s+/).slice(1);
  const missingOrigins = REQUIRED_OPEN_METEO.filter(origin => !connectSrc.includes(origin));
  if (missingOrigins.length) return { ok: false, reason: 'connect-src sans origines requises: ' + missingOrigins.join(', ') };

  const scriptTags = [...source.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);
  const moduleTags = scriptTags.filter(tag => /\btype\s*=\s*["']module["']/i.test(tag));
  const moduleTag = moduleTags.find(tag => attr(tag, 'src'));
  if (!moduleTag) return { ok: false, reason: 'script module d’entrée absent' };
  const module = localAssetPath(attr(moduleTag, 'src'), baseUrl);
  if (!module.ok) return { ok: false, reason: module.reason };

  const cssPaths = [];
  const linkTags = [...source.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  for (const tag of linkTags) {
    if (!/\brel\s*=\s*["'][^"']*stylesheet[^"']*["']/i.test(tag)) continue;
    const href = attr(tag, 'href');
    if (!href || !/\.css(?:[?#]|$)/i.test(href)) continue;
    const css = localAssetPath(href, baseUrl);
    if (!css.ok) {
      // Remote stylesheets (e.g. Google Fonts) are not build assets.
      try { if (new URL(href, baseUrl).origin !== new URL(baseUrl).origin) continue; } catch {}
      return { ok: false, reason: css.reason };
    }
    cssPaths.push(css.path);
  }
  cssPaths.sort();

  return {
    ok: true,
    cspSha256: crypto.createHash('sha256').update(csp, 'utf8').digest('hex'),
    moduleSrc: module.path,
    cssSrcs: cssPaths,
  };
}

/** Compare le HTML live à l'empreinte locale créée depuis le dossier préparé. */
function compareHtmlFingerprint(liveHtml, expected, domain) {
  const actual = extractHtmlFingerprint(liveHtml, domain);
  if (!actual.ok) return { ok: false, reason: 'HTML live invalide: ' + actual.reason, actual };
  if (!expected || !/^[a-f0-9]{64}$/i.test(String(expected.cspSha256 || '')) || !expected.moduleSrc) {
    return { ok: false, reason: 'empreinte HTML construite absente/invalide', actual };
  }
  const differences = [];
  if (actual.cspSha256 !== expected.cspSha256) differences.push('CSP live différente du HTML préparé');
  if (actual.moduleSrc !== expected.moduleSrc) differences.push('bundle module live=' + actual.moduleSrc + ' attendu=' + expected.moduleSrc);
  const expectedCss = Array.isArray(expected.cssSrcs) ? [...expected.cssSrcs].sort() : [];
  if (JSON.stringify(actual.cssSrcs) !== JSON.stringify(expectedCss)) differences.push('bundles CSS live différents du HTML préparé');
  return {
    ok: differences.length === 0,
    reason: differences.length ? differences.join('; ') : 'CSP et références bundle JS/CSS identiques au build préparé',
    actual,
  };
}

module.exports = { REQUIRED_OPEN_METEO, extractHtmlFingerprint, compareHtmlFingerprint };
