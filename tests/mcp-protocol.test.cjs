#!/usr/bin/env node
// Test de protocole MCP REEL : client officiel @modelcontextprotocol/client
// (Streamable HTTP) contre le handler workers/sargagame/mcp.js servi par un
// harness HTTP local. Valide handshake, tools/list, appels valides/invalides,
// erreurs, fraicheur, refus transport (405/403/413/400) et perimetre regional.
// Les donnees servies sont les VRAIS fichiers du repo (sargassum.json,
// beaches-list.json) + un sitemap de fixture minimal.
//
// Requiert les devDeps MCP (CI : npm ci). Auto-executant : exit 0/1.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  OK ' + msg); } else { failures++; console.error('  FAIL ' + msg); }
}
const textOf = (res) => {
  const t = res.content && res.content[0] && res.content[0].text;
  try { return JSON.parse(t); } catch { return { _raw: t }; }
};

(async () => {
  const SARGASSUM = fs.readFileSync(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'), 'utf8');
  const BEACHES = fs.readFileSync(path.join(ROOT, 'public', 'data', 'beaches-list.json'), 'utf8');
  const { handleMcp } = await import('../workers/sargagame/mcp.js');
  const { Client } = await import('@modelcontextprotocol/client');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');

  let port = 0;
  const pages = () => ({
    '/': '<!doctype html><html lang="fr"><head><title>Accueil Test</title>' +
      '<meta name="description" content="Page d accueil fixture."/>' +
      '<link rel="canonical" href="http://127.0.0.1:' + port + '/"/>' +
      '<meta property="og:image" content="http://127.0.0.1:' + port + '/og.png"/>' +
      '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' +
      '</head><body>home</body></html>',
    '/cgv': '<!doctype html><html lang="fr"><head><title>CGV Fixture</title>' +
      '<meta name="description" content="CGV fixture."/>' +
      '<link rel="canonical" href="http://127.0.0.1:' + port + '/cgv"/>' +
      '</head><body>cgv</body></html>',
    '/en/': '<!doctype html><html lang="en"><head><title>Home EN</title></head><body>en</body></html>',
  });
  const sitemap = () => '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ['/', '/cgv', '/mentions-legales', '/en/', '/es/mapa', '/plages/plage-des-salines/', '/fiabilite/', '/pro/', '/a-propos/', '/carte-sargasses/']
      .map((p) => `  <url><loc>http://127.0.0.1:${port}${p}</loc><lastmod>2026-10-13</lastmod></url>`)
      .join('\n') + '\n</urlset>';

  const server = http.createServer(async (req, res) => {
    const send = (status, headers, body) => {
      res.writeHead(status, headers);
      res.end(body);
    };
    try {
      if (req.url === '/mcp' || req.url === '/mcp/') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          const webReq = new Request('http://127.0.0.1:' + port + '/mcp', {
            method: req.method,
            headers: { ...req.headers, host: '127.0.0.1:' + port },
            body: ['POST'].includes(req.method) ? Buffer.concat(chunks) : undefined,
            duplex: 'half',
          });
          const webRes = await handleMcp(webReq, { allowLocalHost: '127.0.0.1:' + port });
          const outHeaders = {};
          webRes.headers.forEach((v, k) => { outHeaders[k] = v; });
          send(webRes.status, outHeaders, Buffer.from(await webRes.arrayBuffer()));
        });
        return;
      }
      if (req.url === '/api/copernicus/sargassum.json') return send(200, { 'content-type': 'application/json' }, SARGASSUM);
      if (req.url === '/data/beaches-list.json') return send(200, { 'content-type': 'application/json' }, BEACHES);
      if (req.url === '/sitemap.xml') return send(200, { 'content-type': 'application/xml' }, sitemap());
      const pg = pages()[req.url];
      if (pg) return send(200, { 'content-type': 'text/html' }, pg);
      send(404, { 'content-type': 'text/plain' }, 'nf');
    } catch (e) {
      send(500, { 'content-type': 'text/plain' }, 'harness_error');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  global.__mcpSrv = server;

  const raw = async (method, path, { headers, body } = {}) => {
    const r = await fetch('http://127.0.0.1:' + port + path, { method, headers, body, redirect: 'manual', duplex: 'half' });
    return { status: r.status, headers: r.headers, text: await r.text() };
  };

  console.log('1) Transport : methodes et preflight');
  {
    const g = await raw('GET', '/mcp');
    assert(g.status === 405, 'GET /mcp -> 405 (pas de flux SSE)');
    const o = await raw('OPTIONS', '/mcp', { headers: { Origin: 'https://sargasses-martinique.com' } });
    assert(o.status === 204, 'OPTIONS /mcp -> 204');
    const p = await raw('PUT', '/mcp');
    assert(p.status === 405, 'PUT /mcp -> 405');
    const bad = await raw('POST', '/mcp', { headers: { 'content-type': 'application/json', Origin: 'https://evil.example' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
    assert(bad.status === 403, 'Origin hostile -> 403 (DNS rebinding)');
    const ij = await raw('POST', '/mcp', { headers: { 'content-type': 'application/json' }, body: '{nope' });
    assert(ij.status === 400 && ij.text.includes('invalid_json'), 'JSON invalide -> 400 invalid_json');
    const bigBody = 'x'.repeat(600 * 1024);
    const big = await raw('POST', '/mcp', { headers: { 'content-type': 'application/json' }, body: bigBody });
    assert(big.status === 413, 'corps declare >512Ko -> 413');
    async function* chunked() { yield Buffer.from('{"jsonrpc":"2.0","id":1,"method":"ping"'); yield Buffer.alloc(600 * 1024, 48); }
    const big2 = await raw('POST', '/mcp', { headers: { 'content-type': 'application/json' }, body: chunked() });
    assert(big2.status === 413, 'corps strobe >512Ko sans longueur declaree -> 413');
  }

  console.log('2) Handshake MCP reel (client officiel)');
  const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:' + port + '/mcp'));
  const client = new Client({ name: 'sargagame-mcp-test', version: '1.0.0' });
  await client.connect(transport);
  assert(true, 'connect() + initialize : handshake OK');

  console.log('3) Decouverte des outils');
  const listed = await client.listTools();
  const names = (listed.tools || []).map((t) => t.name).sort();
  const expected = ['get_beach_forecast', 'get_beach_status', 'get_page_metadata', 'list_public_categories', 'list_regions', 'search_beaches', 'search_public_pages'].sort();
  assert(JSON.stringify(names) === JSON.stringify(expected), '7 outils attendus (vus : ' + names.join(',') + ')');
  assert((listed.tools || []).every((t) => t.inputSchema && t.description), 'chaque outil a description + inputSchema');

  const call = (name, args) => client.callTool({ name, arguments: args });
  console.log('4) Outils valides (donnees reelles du repo)');
  {
    const r = textOf(await call('list_regions', {}));
    assert(Array.isArray(r.regions) && r.regions.length === 6, 'list_regions : 6 regions');
    assert(r.regions.every((x) => x.domain && x.primaryLang && x.currency), 'regions : domain/lang/currency');
    assert(!JSON.stringify(r).match(/stripe|MOLLIE|SUPABASE|SECRET|onesignal/i), 'regions : aucun secret');
  }
  {
    const r = textOf(await call('search_beaches', { query: 'salines' }));
    assert(!r.error && r.beaches.some((b) => b.id === 'mq001'), 'search_beaches "salines" -> mq001');
    const f = textOf(await call('search_beaches', { island: 'florida', limit: 5 }));
    assert(f.count === 5 && f.beaches.every((b) => b.island === 'florida'), 'search_beaches island=florida limite 5');
    const e = textOf(await call('search_beaches', {}));
    assert(e.error === 'query_required', 'search_beaches sans filtre -> query_required (isError)');
  }
  {
    const r = textOf(await call('get_beach_status', { beachId: 'mq001' }));
    assert(r.live === true && typeof r.status === 'string', 'get_beach_status mq001 : live + statut');
    assert(r.freshness && typeof r.freshness.updatedAt === 'string', 'fraicheur explicite (updatedAt)');
    assert(typeof r.freshness.stale === 'boolean', 'fraicheur explicite (stale)');
    const n = textOf(await call('get_beach_status', { beachId: 'zz-nope-99' }));
    assert(n.error === 'beach_not_found', 'plage inconnue -> beach_not_found (jamais invente)');
    const i = textOf(await call('get_beach_status', { beachId: '../secret' }));
    assert(i.error === 'invalid_beach_id', 'beachId malforme -> invalid_beach_id');
  }
  {
    const r = textOf(await call('get_beach_forecast', { beachId: 'mq001', days: 2 }));
    assert(Array.isArray(r.forecast) && r.forecast.length === 2, 'forecast mq001 days=2 -> 2 entrees');
    assert(r.horizon && r.horizon.available >= 2, 'horizon explicite');
    assert(r.forecast.every((f) => f.date && f.type), 'entrees datees + typees (observation/tendance)');
  }
  {
    const r = textOf(await call('list_public_categories', {}));
    assert(r.total === 10 && Array.isArray(r.categories), 'categories : total 10 (fixture)');
    assert(r.categories.some((c) => c.category === '_root'), 'categorie _root presente');
  }
  {
    const r = textOf(await call('search_public_pages', { query: 'cgv' }));
    assert(r.count >= 1 && r.pages[0].url.endsWith('/cgv'), 'search_public_pages "cgv"');
    const l = textOf(await call('search_public_pages', { query: '/', lang: 'en' }));
    assert(l.pages.every((p) => p.lang === 'en'), 'filtre lang=en respecte');
  }
  {
    const r = textOf(await call('get_page_metadata', { path: '/cgv' }));
    assert(r.title === 'CGV Fixture' && r.canonical && r.jsonLdBlocks === 0, 'metadata /cgv (titre/canonical)');
    assert(r.indexed === true && r.fetchedAt, 'indexed + fetchedAt');
    const n = textOf(await call('get_page_metadata', { path: '/nulle-part' }));
    assert(n.error === 'page_not_indexed', 'hors sitemap -> page_not_indexed (aucun fetch)');
    const t = textOf(await call('get_page_metadata', { path: '/../secret' }));
    assert(t.error === 'invalid_path', 'traversal -> invalid_path');
  }

  console.log("5) Erreurs protocole (client officiel)");
  {
    let threw = false;
    try { await call('outil_inexistant', {}); } catch (e) { threw = true; }
    assert(threw, 'outil inconnu -> erreur protocole levee par le client');
    const bad = await call('search_beaches', { query: 'x', limit: 999 });
    const badText = (bad.content && bad.content[0] && bad.content[0].text) || '';
    assert(bad.isError === true && badText.includes('Input validation error') && badText.includes('<=50'),
      'argument hors schema (limit 999) -> rejete par validation zod (isError)');
  }

  try { await client.close(); } catch {}
  try { await transport.close(); } catch {}
  try { server.closeAllConnections(); } catch {}
  await new Promise((r) => server.close(r));
  console.log(failures ? '\n' + failures + ' echec(s)' : '\nOK — protocole MCP reel valide de bout en bout');
  process.exit(failures ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL protocole MCP :', (e && e.message) || e);
  try { if (global.__mcpSrv) { global.__mcpSrv.closeAllConnections(); await new Promise((r) => global.__mcpSrv.close(r)); } } catch {}
  await new Promise((r) => setTimeout(r, 100));
  process.exit(1);
});
