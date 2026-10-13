#!/usr/bin/env node
// Validation du contrat docs/content-manifest.contract.md (v1) via
// scripts/lib/content-manifest-validate.cjs. Fixtures minimales inline,
// aucune donnee de production. Auto-executant : exit 0 = OK, exit 1 = echec.
'use strict';
const { validateManifest, canonicalClusters } = require('../scripts/lib/content-manifest-validate.cjs');

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  OK ' + msg); } else { failures++; console.error('  FAIL ' + msg); }
}

const home = {
  url: 'https://sargasses-martinique.com/', canonical: 'https://sargasses-martinique.com/',
  domain: 'sargasses-martinique.com', region: 'mq', lang: 'fr',
  hreflang: [{ lang: 'en', href: 'https://sargasses-martinique.com/en/' }],
  kind: 'home', title: 'Accueil', description: 'D1', lastmod: '2026-10-01',
  images: [], ogImage: 'https://sargasses-martinique.com/og-image.png', videos: [],
  indexable: true, listedInSitemap: true, inlinks: 12,
};
const beach = {
  url: 'https://sargasses-martinique.com/plages/plage-des-salines/', canonical: 'https://sargasses-martinique.com/plages/plage-des-salines/',
  domain: 'sargasses-martinique.com', region: 'mq', lang: 'fr', kind: 'beach',
  title: 'Plage des Salines', description: null, lastmod: '2026-09-15',
  images: [{ src: 'https://sargasses-martinique.com/images/salines.jpg', alt: 'Salines' }],
  ogImage: null, indexable: true, listedInSitemap: true, inlinks: 3,
};
const legal = {
  url: 'https://sargasses-martinique.com/cgv', canonical: 'https://sargasses-martinique.com/cgv',
  domain: 'sargasses-martinique.com', region: 'mq', lang: 'fr', kind: 'legal',
  title: 'CGV', description: null, lastmod: '2026-06-21',
  ogImage: null, indexable: true, listedInSitemap: true, inlinks: 0,
};
const base = (pages) => ({ version: '1', domain: 'sargasses-martinique.com', region: 'mq', pages });

console.log('1) Conformite schema (manifeste valide)');
assert(validateManifest(base([home, beach, legal])).length === 0, 'manifeste minimal valide, 0 erreur');

console.log('2) noindex listee = anomalie bloquante');
{
  const bad = JSON.parse(JSON.stringify(home));
  bad.url = 'https://sargasses-martinique.com/comic-cartes.html';
  bad.kind = 'other';
  const errs = validateManifest(base([bad]));
  assert(errs.length === 0, '...sans le flag : valide (prealable)');
  const nox = JSON.parse(JSON.stringify(bad));
  nox.indexable = false;
  nox.indexableReason = 'noindex';
  nox.listedInSitemap = true;
  const errs2 = validateManifest(base([nox]));
  assert(errs2.some((e) => e.includes('listedInSitemap')), 'noindex + listedInSitemap=true -> erreur explicite');
}

console.log('3) Normalisation URL + champs manquants');
{
  const bad = JSON.parse(JSON.stringify(home));
  bad.url = 'not-an-url';
  assert(validateManifest(base([bad])).length > 0, 'url non absolue -> erreur');
  const miss = JSON.parse(JSON.stringify(home));
  delete miss.lastmod;
  assert(validateManifest(base([miss])).some((e) => e.includes('lastmod')), 'lastmod absente -> erreur');
  const wl = JSON.parse(JSON.stringify(home));
  wl.lastmod = '13/10/2026';
  assert(validateManifest(base([wl])).some((e) => e.includes('lastmod')), 'lastmod non-ISO -> erreur');
  const unk = JSON.parse(JSON.stringify(home));
  unk.foo = 1;
  assert(validateManifest(base([unk])).some((e) => e.includes('inconnue')), 'cle inconnue -> erreur');
}

console.log('4) Dates deterministes (meme objet -> meme serialisation)');
{
  const a = JSON.stringify(base([home, beach]));
  const b = JSON.stringify(base([home, beach]));
  assert(a === b, 'serialisation deterministe');
}

console.log('5) Absence de donnees privees');
{
  const s = JSON.parse(JSON.stringify(home));
  s.description = 'contact sk_live_abc123';
  assert(validateManifest(base([s])).length > 0, 'secret -> erreur');
  const p = JSON.parse(JSON.stringify(home));
  p.url = 'https://sargasses-martinique.com/api/_private/x';
  p.canonical = p.url;
  assert(validateManifest(base([p])).length > 0, 'chemin _private -> erreur');
  const pay = JSON.parse(JSON.stringify(home));
  pay.url = 'https://sargasses-martinique.com/api/mollie-webhook';
  pay.canonical = pay.url;
  assert(validateManifest(base([pay])).length > 0, 'route paiement -> erreur');
}

console.log('6) indexable vs listedInSitemap vs canonical');
{
  const ext = JSON.parse(JSON.stringify(home));
  ext.url = 'https://sargazotulum.com/confidentialite/';
  ext.canonical = 'https://sargasses-martinique.com/confidentialite/';
  ext.domain = 'sargazotulum.com';
  ext.region = 'tulum';
  ext.indexable = false;
  ext.indexableReason = 'canonical-externe';
  ext.listedInSitemap = false;
  const errs = validateManifest({ version: '1', domain: 'sargazotulum.com', region: 'tulum', pages: [ext] });
  assert(errs.length === 0, 'canonical externe declare (sans le modifier) : valide');
  const clusters = canonicalClusters([
    base([home]),
    { version: '1', domain: 'sargazotulum.com', region: 'tulum', pages: [Object.assign({}, home, {
      url: 'https://sargazotulum.com/confidentialite/', canonical: 'https://sargasses-martinique.com/',
      domain: 'sargazotulum.com', region: 'tulum',
    })] },
  ]);
  assert(clusters.length === 1 && clusters[0].urls.length === 2, 'cluster canonical inter-domaines signale (2 URL)');
}

console.log(failures ? '\n' + failures + ' echec(s)' : '\nOK — contrat content-manifest v1 valide');
process.exit(failures ? 1 : 0);
