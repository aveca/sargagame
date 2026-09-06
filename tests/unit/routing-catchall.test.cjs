#!/usr/bin/env node
/**
 * routing-catchall.test.cjs — contrat du routage Pages Functions (BUG-2026-032).
 * sitemap.xml / robots.txt (et tout .xml/.txt) doivent être servis depuis ASSETS,
 * JAMAIS via le fallback SPA (index.html 200 qui rendait le sitemap invisible et
 * le SEO Guard rouge quotidiennement). Les pages SEO et la racine gardent le
 * fallback SPA. Les chemins /api/*.* restent délégués à ASSETS (les routes
 * Workers priment en prod de toute façon).
 * Aucun réseau : env.ASSETS stubbé.
 */
'use strict';

const path = require('path');

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label); }
  else { failed++; console.error('  ✗ FAIL:', label); }
}

async function main() {
  const modPath = path.join(__dirname, '..', '..', 'functions', '[[path]].js');
  const { onRequest } = await import('file:///' + modPath.replace(/\\/g, '/'));
  ok(typeof onRequest === 'function', 'catch-all exporte onRequest');

  const FILES = {
    '/sitemap.xml': { ok: true, body: '<?xml version="1.0"?><urlset></urlset>', type: 'application/xml' },
    '/robots.txt': { ok: true, body: 'User-agent: *\nAllow: /', type: 'text/plain' },
    '/index.html': { ok: true, body: '<html>APP</html>', type: 'text/html' },
  };
  const env = {
    ASSETS: {
      fetch: async (req) => {
        const p = new URL(req.url).pathname;
        const f = FILES[p];
        if (!f) return new Response('no asset', { status: 404 });
        return new Response(f.body, { status: 200, headers: { 'Content-Type': f.type } });
      },
    },
  };
  async function get(pathname) {
    const r = await onRequest({ request: new Request('https://x.test' + pathname), env });
    return { status: r.status, body: await r.text(), type: r.headers.get('Content-Type') };
  }

  let r = await get('/sitemap.xml');
  ok(r.status === 200 && r.body.includes('<urlset>'), 'sitemap.xml servi en XML (pas de SPA)');
  r = await get('/robots.txt');
  ok(r.status === 200 && r.body.includes('User-agent'), 'robots.txt servi en texte (pas de SPA)');
  r = await get('/');
  ok(r.status === 200 && r.body.includes('<html>APP</html>'), 'racine toujours SPA fallback');
  r = await get('/une-plage-quelconque/');
  ok(r.status === 200 && r.body.includes('<html>APP</html>'), 'page SEO toujours SPA fallback');
  r = await get('/api/b2b-paylinks.json');
  ok(r.body === 'no asset', 'chemin api/*.json délégué à ASSETS (pas de 404 handler)');

  // _routes.json : les extensions statiques ne doivent pas atteindre Functions.
  const fs = require('fs');
  const routes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'functions', '_routes.json'), 'utf8'));
  const excl = (routes.exclude || []).join(' ');
  ok(excl.includes('*.xml') && excl.includes('*.txt'), '_routes.json exclut *.xml et *.txt des Functions');

  console.log(`\nrouting-catchall: ${passed} pass / ${failed} fail`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
