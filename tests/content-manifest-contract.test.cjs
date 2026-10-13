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

console.log('4) Determinisme du validateur (pas de la generation)');
{
  // Ce test prouve que LE VALIDATEUR est deterministe (memes erreurs a
  // chaque passe). La garantie octet-par-octet du GENERATEUR releve de la
  // Phase C.2 (tri + cles triees), pas de ce contrat.
  const m = base([beach, home]);
  const e1 = validateManifest(m);
  const e2 = validateManifest(JSON.parse(JSON.stringify(m)));
  assert(JSON.stringify(e1) === JSON.stringify(e2) && e1.length === 0, 'validateur deterministe (entree desordonnee acceptee, 0 erreur)');
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

console.log('7) Cles inconnues (racine + imbriquees)');
{
  const r = base([home]);
  r.extra = 1;
  assert(validateManifest(r).some((e) => e.includes('cle inconnue')), 'cle racine inconnue -> erreur');
  const h = JSON.parse(JSON.stringify(home));
  h.hreflang = [{ lang: 'en', href: 'https://sargasses-martinique.com/en/', x: 1 }];
  assert(validateManifest(base([h])).some((e) => e.includes('hreflang')), 'cle hreflang inconnue -> erreur');
  const im = JSON.parse(JSON.stringify(beach));
  im.images = [{ src: 'https://sargasses-martinique.com/i.jpg', alt: 'a', w: 3 }];
  assert(validateManifest(base([im])).some((e) => e.includes('images')), 'cle image inconnue -> erreur');
  const okRoot = { version: '1', domain: 'sargasses-martinique.com', region: 'mq', generatedAt: '2026-10-13T18:00:00.000Z', pages: [home] };
  assert(validateManifest(okRoot).length === 0, 'generatedAt ISO racine optionnelle acceptee');
  const okPage = JSON.parse(JSON.stringify(home));
  okPage.generatedAt = '2026-10-13T18:00:00.000Z';
  assert(validateManifest(base([okPage])).some((e) => e.includes('cle inconnue')), 'generatedAt au niveau page -> erreur (racine uniquement)');
  const badGen = { version: '1', domain: 'sargasses-martinique.com', region: 'mq', generatedAt: 'hier', pages: [home] };
  assert(validateManifest(badGen).some((e) => e.includes('generatedAt')), 'generatedAt non-ISO -> erreur');
}

console.log('8) Coherence manifest.domain/region vs pages');
{
  const d = JSON.parse(JSON.stringify(home));
  d.domain = 'sargasses-guadeloupe.com';
  assert(validateManifest(base([d])).some((e) => e.includes('incoherent')), 'domain page != manifest -> erreur');
  const g = JSON.parse(JSON.stringify(home));
  g.region = 'gp';
  assert(validateManifest(base([g])).some((e) => e.includes('incoherente')), 'region page != manifest -> erreur');
}

console.log('9) Query string et fragments refuses a l emission');
{
  for (const bad of ['https://sargasses-martinique.com/cgv?x=1', 'https://sargasses-martinique.com/cgv#ancre']) {
    const e = JSON.parse(JSON.stringify(legal));
    e.url = bad;
    e.canonical = bad;
    assert(validateManifest(base([e])).some((x) => x.includes('query ni fragment')), 'query/fragment emis -> erreur (' + bad + ')');
  }
}

console.log('10) Dates calendaires strictes');
{
  for (const [d, ok] of [['2024-02-29', true], ['2023-02-29', false], ['2026-02-30', false], ['2026-13-01', false], ['2026-00-10', false], ['2026-04-31', false], ['2026-12-31', true], ['1999-01-01', true]]) {
    const e = JSON.parse(JSON.stringify(legal));
    e.lastmod = d;
    const errs = validateManifest(base([e]));
    assert(ok ? errs.length === 0 : errs.some((x) => x.includes('lastmod')), 'lastmod ' + d + ' -> ' + (ok ? 'acceptee' : 'rejetee'));
  }
}

console.log('11) Route /pass (segment exact, sans faux positifs)');
{
  for (const bad of ['https://sargasses-martinique.com/pass', 'https://sargasses-martinique.com/pass/', 'https://sargasses-martinique.com/pro/PASS']) {
    const e = JSON.parse(JSON.stringify(home));
    e.url = bad;
    e.canonical = bad;
    assert(validateManifest(base([e])).some((x) => x.includes('paiement')), '/pass-like refuse (' + bad + ')');
  }
  for (const good of ['https://sargasses-martinique.com/compass', 'https://sargasses-martinique.com/passage-du-nord/']) {
    const e = JSON.parse(JSON.stringify(home));
    e.url = good;
    e.canonical = good;
    assert(validateManifest(base([e])).length === 0, 'mot contenant pass accepte (' + good + ')');
  }
}

console.log('12) Doublons normalises + clusters robustes');
{
  const a = JSON.parse(JSON.stringify(legal));
  const b = JSON.parse(JSON.stringify(legal));
  b.url = 'https://sargasses-martinique.com/cgv/';
  b.canonical = 'https://sargasses-martinique.com/cgv/';
  assert(validateManifest(base([a, b])).some((e) => e.includes('doublon normalise')), '/cgv + /cgv/ -> doublon normalise');
  assert(JSON.stringify(canonicalClusters(null)) === '[]', 'clusters(null) -> [] sans throw');
  assert(JSON.stringify(canonicalClusters([{ no: 1 }, null, 'x'])) === '[]', 'clusters(malforme) -> [] sans throw');
  assert(JSON.stringify(canonicalClusters([{ domain: 'd', pages: [{ url: ':::', canonical: 42 }] }])) === '[]', 'clusters(entrees invalides) -> [] sans throw');
}

console.log('13) Query/fragment dans ogImage et videos[]');
{
  const o = JSON.parse(JSON.stringify(home));
  o.ogImage = 'https://sargasses-martinique.com/og.png?v=2';
  assert(validateManifest(base([o])).some((e) => e.includes('ogImage')), 'ogImage avec query -> erreur');
  const v = JSON.parse(JSON.stringify(home));
  v.videos = ['https://sargasses-martinique.com/v.mp4#t=3'];
  assert(validateManifest(base([v])).some((e) => e.includes('videos')), 'video avec fragment -> erreur');
  const ok = JSON.parse(JSON.stringify(home));
  ok.videos = ['https://sargasses-martinique.com/v.mp4'];
  assert(validateManifest(base([ok])).length === 0, 'video propre acceptee');
}

console.log('14) generatedAt ISO-8601 stricte');
{
  for (const g of ['2026-10-13T18:00:00.000Z', '2026-10-13T18:00:00Z', '2026-10-13T18:00:00+02:00', '2024-02-29T12:00:00Z']) {
    const m = { version: '1', domain: 'sargasses-martinique.com', region: 'mq', generatedAt: g, pages: [home] };
    assert(validateManifest(m).length === 0, 'generatedAt acceptee (' + g + ')');
  }
  for (const g of ['hier', '2026-10-13', '2026-10-13T18:00', 'Oct 13 2026', '2026-02-30T00:00:00Z', '2023-02-29T00:00:00Z', '2026-10-13T25:00:00Z', '2026-10-13T18:00:00+25:00']) {
    const m = { version: '1', domain: 'sargasses-martinique.com', region: 'mq', generatedAt: g, pages: [home] };
    assert(validateManifest(m).some((e) => e.includes('generatedAt')), 'generatedAt rejetee (' + g + ')');
  }
}

console.log('15) Hote page.url == domaine manifeste (www tolere, etranger refuse)');
{
  const w = JSON.parse(JSON.stringify(home));
  w.url = 'https://www.sargasses-martinique.com/cgv';
  w.canonical = 'https://www.sargasses-martinique.com/cgv';
  assert(validateManifest(base([w])).length === 0, 'www. tolere');
  const f = JSON.parse(JSON.stringify(home));
  f.url = 'https://other.example/x';
  f.canonical = 'https://other.example/x';
  assert(validateManifest(base([f])).some((e) => e.includes('hors manifeste')), 'domaine etranger refuse');
  const c = JSON.parse(JSON.stringify(home));
  c.url = 'https://sargasses-martinique.com/x';
  c.canonical = 'https://other.example/y';
  assert(validateManifest(base([c])).length === 0, 'canonical externe toujours permis');
}

console.log(failures ? '\n' + failures + ' echec(s)' : '\nOK — contrat content-manifest v1 valide (+ durcissements C.1.1/C.1.2)');
process.exit(failures ? 1 : 0);
