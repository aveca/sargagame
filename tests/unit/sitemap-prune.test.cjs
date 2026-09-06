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
const { pruneDeadDomains, deadDomains } = require('../../scripts/lib/sitemap-prune.cjs');

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

console.log(`\nsitemap-prune: ${passed} pass / ${failed} fail`);
process.exit(failed ? 1 : 0);
