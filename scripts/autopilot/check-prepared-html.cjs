#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getRegion } = require('../../regions/index.cjs');
const { extractHtmlFingerprint } = require('./html-integrity.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const regionId = process.env.VITE_REGION || process.argv.find(a => a.startsWith('--region='))?.slice('--region='.length);
if (!regionId) {
  console.error('Usage: VITE_REGION=<id> node scripts/autopilot/check-prepared-html.cjs');
  process.exit(2);
}

const region = getRegion(regionId);
const dir = path.resolve(ROOT, region.ftpDir);
const indexPath = path.join(dir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('PREPARED HTML FAIL: missing ' + path.relative(ROOT, indexPath));
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const fingerprint = extractHtmlFingerprint(html, region.domain);
if (!fingerprint.ok) {
  console.error('PREPARED HTML FAIL (' + regionId + '): ' + fingerprint.reason);
  process.exit(1);
}

if (!require('../lib/bundle-css.cjs').hasBundleCss(fingerprint.cssSrcs)) {
  console.error('PREPARED HTML FAIL (' + regionId + '): CSS applicatif /assets/*.css absent de index.html (vu: ' +
    (fingerprint.cssSrcs.join(', ') || 'aucun') + ')');
  process.exit(1);
}

const refs = [...new Set([fingerprint.moduleSrc, ...fingerprint.cssSrcs])];
for (const ref of refs) {
  const url = new URL(ref, 'https://' + region.domain + '/');
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const assetPath = path.resolve(dir, relative);
  if (!assetPath.startsWith(dir + path.sep) || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    console.error('PREPARED HTML FAIL (' + regionId + '): référencé mais absent: ' + ref);
    process.exit(1);
  }
}

console.log('PREPARED HTML PASS (' + regionId + '): CSP avec Open-Meteo, module ' + fingerprint.moduleSrc +
  ', ' + fingerprint.cssSrcs.length + ' CSS local(s), tous les assets référencés existent.');
