export async function onRequest(context) {
  const { request, env } = context;
  
  let url;
  try {
    url = new URL(request.url);
  } catch(e) {
    return new Response('Bad URL', { status: 400 });
  }
  
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

  // API routes — mapper vers fichiers JSON
  if (pathname.startsWith('/api/')) {
    // Laisser passer les routes Worker
    if (pathname.startsWith('/api/mollie') || pathname.startsWith('/api/widget-token') ||
        pathname.startsWith('/api/track-') || pathname.startsWith('/api/copernicus/forecast') ||
        pathname.startsWith('/api/b2b-') || pathname.startsWith('/api/create-checkout')) {
      return env.ASSETS.fetch(request);
    }

    // Mapper /api/pois → /api/pois.json
    const apiMap = {
      '/api/pois': '/api/pois.json',
      '/api/beaches': '/api/beaches.json',
      '/api/regions': '/api/regions.json',
    };

    if (apiMap[pathname]) {
      try {
        const fileResponse = await env.ASSETS.fetch(
          new Request(new URL(apiMap[pathname], url.origin))
        );
        if (fileResponse.ok) {
          return new Response(await fileResponse.text(), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch(e) {}
    }

    // Fallback: essayer pathname + .json
    try {
      const jsonPath = pathname + '.json';
      const jsonResponse = await env.ASSETS.fetch(
        new Request(new URL(jsonPath, url.origin))
      );
      if (jsonResponse.ok) {
        return new Response(await jsonResponse.text(), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch(e) {}

    return new Response(JSON.stringify({ error: 'Not found', path: pathname }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Widget
  if (pathname.startsWith('/widget')) {
    return env.ASSETS.fetch(request);
  }

  // track-click.php → redirect 302
  if (pathname === '/track-click.php' || pathname.startsWith('/track-click')) {
    try {
      const targetUrl = url.searchParams.get('url') || '/';
      const target = new URL(targetUrl, url.origin).toString();
      return Response.redirect(target, 302);
    } catch(e) {
      return Response.redirect(url.origin + '/', 302);
    }
  }

  // SPA fallback — servir index.html
  try {
    const indexResponse = await env.ASSETS.fetch(
      new Request(new URL('/index.html', url.origin), { method: 'GET' })
    );
    if (indexResponse.ok) {
      const body = await indexResponse.text();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, must-revalidate'
        }
      });
    }
  } catch(e) {}

  // Dernier recours : redirect vers / (JAMAIS de "Sargassum monitoring")
  return Response.redirect(url.origin + '/', 302);
}
