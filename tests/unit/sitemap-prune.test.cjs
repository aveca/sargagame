#!/usr/bin/env node
/**
 * sitemap-prune.test.cjs — contrat du filtre sitemap domaines morts (BUG-2026-032).
 * Le dist/ partagé sert 6 projets Pages : aucune URL d'un domaine sans DNS
 * (regions/*.json "seoIndex": false) ne doit rester dans sitemap*.xml, sinon
 * crawl errors + SEO Guard rouge. Idempotent : re-run = 0 suppression.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pruneDeadDomains, deadDomains, pruneForeignDomains } = require('../../scripts/lib/sitemap-prune.cjs');

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label); }
  else { failed++; console.error('  ✗ FAIL:', label); }
}

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sargasses-martinique.com/plages/</loc><lastmod>2026-09-06</lastmod></url>
  <url><loc>https://sargassumbarbados.com/beach/bathsheba/</loc><lastmod>2026-09-06</lastmod></url>
  <url><loc>https://sargassumbarbados.com/region/barbados/</loc><lastmod>2026-09-06</lastmod></url>
  <url><loc>https://sargasses-martinique.com/carte-sargasses/</loc><lastmod>2026-09-06</lastmod></url>
</urlset>
`;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smdist-'));
  const reg = fs.mkdtempSync(path.join(os.tmpdir(), 'smreg-'));
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), SITEMAP, 'utf-8');
  fs.writeFileSync(path.join(reg, 'barbados.json'), JSON.stringify({ id: 'barbados', domain: 'sargassumbarbados.com', seoIndex: false }));
  fs.writeFileSync(path.join(reg, 'mq.json'), JSON.stringify({ id: 'mq', domain: 'sargasses-martinique.com' }));
  return { dir, reg };
}

const { dir, reg } = setup();
ok(JSON.stringify(deadDomains(reg)) === JSON.stringify(['sargassumbarbados.com']), 'deadDomains lit seoIndex:false (défaut = indexé)');
let r = pruneDeadDomains(dir, reg);
ok(r.removed === 2 && r.kept === 2, `prune retire 2 mortes, garde 2 vivantes (got ${r.removed}/${r.kept})`);
const after = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf-8');
ok(after.indexOf('sargassumbarbados.com') < 0, 'aucune URL morte restante');
ok((after.match(/<loc>/g) || []).length === 2, 'sitemap toujours valide (2 loc)');
ok(after.indexOf('<?xml') === 0 && after.indexOf('</urlset>') > 0, 'enveloppe XML intacte');
r = pruneDeadDomains(dir, reg);
ok(r.removed === 0 && r.kept === 2, 'idempotent : re-run = 0 suppression');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(reg, { recursive: true, force: true });

// Fichier réel du repo : barbados doit être le seul domaine exclu.
const realDead = deadDomains(path.join(__dirname, '..', '..', 'regions'));
ok(realDead.length === 1 && realDead[0] === 'sargassumbarbados.com', `seul barbados exclu en prod (got ${JSON.stringify(realDead)})`);

// Filtre territorial (constat LIVE 2026-09-10 : sitemap MQ listait 91 GP + 27
// Miami + 20 PC + 27 Cancun + 16 Tulum — la boucle Sprint #25 écrit les pages
// de toutes les régions, mais chaque sitemap ne doit lister que son domaine).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smfor-'));
  fs.writeFileSync(path.join(dir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>https://sargasses-martinique.com/plages/</loc></url>\n` +
    `  <url><loc>https://sargasses-guadeloupe.com/plages/</loc></url>\n` +
    `  <url><loc>https://sargassummiami.com/beach/miami-beach/</loc></url>\n` +
    `  <url><loc>https://sargasses-martinique.com/beach/anse-mitan/</loc></url>\n` +
    `</urlset>\n`, 'utf-8');
  const r = pruneForeignDomains(dir, 'sargasses-martinique.com');
  ok(r.removed === 2 && r.kept === 2, `prune étranger retire 2, garde 2 (got ${r.removed}/${r.kept})`);
  const after2 = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf-8');
  ok(after2.indexOf('sargasses-guadeloupe.com') < 0 && after2.indexOf('sargassummiami.com') < 0, 'aucune URL étrangère restante');
  ok((after2.match(/<loc>/g) || []).length === 2, 'sitemap toujours valide (2 loc)');
  const r2 = pruneForeignDomains(dir, 'sargasses-martinique.com');
  ok(r2.removed === 0 && r2.kept === 2, 'idempotent : re-run = 0 suppression');
  const r3 = pruneForeignDomains(dir, '');
  ok(r3.removed === 0 && r3.kept === 0, 'domaine vide = no-op de sécurité');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nsitemap-prune: ${passed} pass / ${failed} fail`);
process.exit(failed ? 1 : 0);
