#!/usr/bin/env node
// Regression test: noindex top-level pages must not enter fallback sitemaps.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const PREPARE = path.join(ROOT, 'scripts', 'prepare-ftp.cjs');
const COMIC_PAGE = path.join(ROOT, 'public', 'comic-cartes.html');

let failures = 0;
function assert(condition, message) {
  if (condition) console.log('  OK ' + message);
  else { failures++; console.error('  FAIL ' + message); }
}

function isNoindexHtml(html) {
  return /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])(?=[^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b)[^>]*>/i
    .test(String(html).slice(0, 8192));
}

function inspectSitemap(xml, root) {
  const noindex = [];
  const missing = [];
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    let pathname;
    try { pathname = new URL(match[1].trim()).pathname; }
    catch { missing.push(match[1]); continue; }
    const relativePath = pathname === '/'
      ? 'index.html'
      : pathname.endsWith('/')
        ? path.join(pathname.slice(1), 'index.html')
        : pathname.slice(1);
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(root + path.sep)) {
      missing.push(pathname);
      continue;
    }
    if (!fs.existsSync(target)) {
      missing.push(pathname);
      continue;
    }
    if (isNoindexHtml(fs.readFileSync(target, 'utf8'))) noindex.push(pathname);
  }
  return { noindex, missing };
}

console.log('1) Source Tulum: comic-cartes est effectivement noindex');
const prepareSource = fs.readFileSync(PREPARE, 'utf8');
const comicHtml = fs.readFileSync(COMIC_PAGE, 'utf8');
assert(isNoindexHtml(comicHtml), 'public/comic-cartes.html contient meta robots noindex');

console.log('2) Le fallback sitemap exclut la page noindex');
const declaration = prepareSource.match(/const SKIP_TOP_FILES\s*=\s*new Set\(\[([^\]]*)\]\)/);
assert(Boolean(declaration), 'SKIP_TOP_FILES du fallback trouvé dans prepare-ftp.cjs');
const skipTopFiles = new Set(
  declaration ? Array.from(declaration[1].matchAll(/['"]([^'"]+)['"]/g), m => m[1]) : []
);
assert(skipTopFiles.has('comic-cartes.html'), 'comic-cartes.html fait partie de SKIP_TOP_FILES');

console.log('3) Sitemap synthétique du fallback : inspection robots sur toutes les URL listées');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tulum-noindex-sitemap-'));
try {
  fs.writeFileSync(path.join(out, 'index.html'), '<html><head><title>Home</title></head><body></body></html>');
  fs.writeFileSync(path.join(out, 'about.html'), '<html><head><title>About</title></head><body></body></html>');
  fs.writeFileSync(path.join(out, 'comic-cartes.html'), comicHtml);
  fs.writeFileSync(path.join(out, '404.html'), '<html><head><meta name="robots" content="noindex"></head><body></body></html>');
  fs.writeFileSync(path.join(out, 'neptunes_fury.html'), '<html><head><meta name="robots" content="noindex"></head><body></body></html>');
  fs.writeFileSync(path.join(out, 'googleabcdef.html'), '<html><head><meta name="robots" content="noindex"></head><body></body></html>');

  const candidates = fs.readdirSync(out, { withFileTypes: true })
    .filter(f => f.isFile() && /\.html$/i.test(f.name) && !skipTopFiles.has(f.name))
    .filter(f => !/^google[0-9a-f]+\.html$/i.test(f.name))
    .map(f => ({ path: f.name === 'index.html' ? '/' : '/' + f.name }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const locs = candidates.map(u => '  <url><loc>https://tulum.test' + u.path + '</loc></url>');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n' + locs.join('\n') + '\n</urlset>\n';
  const result = inspectSitemap(xml, out);
  assert(!locs.some(loc => loc.includes('/comic-cartes.html')), 'le fallback n’émet pas comic-cartes.html');
  assert(result.noindex.length === 0, 'aucune URL listée ne pointe vers un HTML noindex');
  assert(result.missing.length === 0, 'toutes les URL listées ont un fichier cible');

  const injectedViolation = xml.replace('</urlset>', '  <url><loc>https://tulum.test/comic-cartes.html</loc></url>\n</urlset>');
  const detected = inspectSitemap(injectedViolation, out);
  assert(detected.noindex.includes('/comic-cartes.html'), 'le scanner détecte une URL noindex si elle est réintroduite');
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

if (failures) {
  console.error('\n' + failures + ' assertion(s) en échec');
  process.exit(1);
}
console.log('\nOK — sitemap de fallback Tulum sans URL noindex');
