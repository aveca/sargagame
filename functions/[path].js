export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // /api/health
  if (pathname === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Assets statiques
  if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|webp|avif|map|json|webmanifest)$/)) {
    return env.ASSETS.fetch(request);
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    return env.ASSETS.fetch(request);
  }

  // Widget
  if (pathname.startsWith('/widget')) {
    return env.ASSETS.fetch(request);
  }

  // 5. SPA fallback — servir index.html avec 200 GARANTI pour TOUTES les routes
  try {
    const indexRequest = new Request(new URL('/index.html', request.url), { method: 'GET' });
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    if (!indexResponse.ok) throw new Error('Assets fetch failed');
    const body = await indexResponse.text();
    return new Response(body, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate'
      }
    });
  } catch (err) {
    // Fallback: create index.html inline
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sargasses</title></head><body><p>Sargassum monitoring</p></body></html>';
    return new Response(html, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate'
      }
    });
  }
}