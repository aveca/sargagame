export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ─── API ───────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Routes normally owned by sg-payments Worker.
    // When its explicit route is active, Cloudflare invokes the Worker first.
    // This guard keeps the Pages Function safe if invoked directly in another context.
    if (pathname.startsWith('/api/mollie') ||
        pathname.startsWith('/api/widget-token') ||
        pathname.startsWith('/api/track-') ||
        pathname.startsWith('/api/copernicus/forecast') ||
        pathname.startsWith('/api/b2b-') ||
        pathname.startsWith('/api/create-checkout')) {
      return env.ASSETS.fetch(request);
    }

    // /api/health
    if (pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    // Canonical extensionless API aliases -> static JSON assets.
    const apiMap = {
      '/api/pois': '/api/pois.json',
      '/api/beaches': '/api/beaches.json',
      '/api/regions': '/api/regions.json',
    };

    if (apiMap[pathname]) {
      const fileResponse = await env.ASSETS.fetch(
        new Request(new URL(apiMap[pathname], request.url))
      );
      if (fileResponse.ok) {
        const body = await fileResponse.text();
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // Generic extensionless -> .json fallback.
    // This intentionally does not apply to existing routes ending in .json,
    // which are handled below as static assets.
    const jsonPath = pathname + '.json';
    const jsonResponse = await env.ASSETS.fetch(
      new Request(new URL(jsonPath, request.url))
    );
    if (jsonResponse.ok) {
      const body = await jsonResponse.text();
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found', path: pathname }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  // ─── Static assets ────────────────────────────────────────────────
  if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|webp|avif|map|json|webmanifest)$/)) {
    return env.ASSETS.fetch(request);
  }

  // ─── Widget ───────────────────────────────────────────────────────
  if (pathname.startsWith('/widget')) {
    return env.ASSETS.fetch(request);
  }

  // ─── SPA fallback ─────────────────────────────────────────────────
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
