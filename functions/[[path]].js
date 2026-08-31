export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. Endpoint /api/health
  if (pathname === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Laisser passer les routes API (gérées par Workers)
  if (pathname.startsWith('/api/')) {
    return env.ASSETS.fetch(request);
  }

  // 3. Laisser passer les assets statiques
  if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|webp|avif|map|json|webmanifest)$/)) {
    return env.ASSETS.fetch(request);
  }

  // 4. Laisser passer /widget
  if (pathname.startsWith('/widget')) {
    return env.ASSETS.fetch(request);
  }

  // 5. SPA fallback : servir index.html
  return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
}