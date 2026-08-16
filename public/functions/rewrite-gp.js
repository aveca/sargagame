export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';

  // Only apply rewrite for Guadeloupe domain
  if (host.includes('sargasses-guadeloupe.com')) {
    // If path doesn't start with /gp/ and isn't already a static asset/api, rewrite to /gp/
    if (!url.pathname.startsWith('/gp/') && 
        !url.pathname.startsWith('/api/') &&
        !url.pathname.startsWith('/assets/') &&
        !url.pathname.startsWith('/fonts/') &&
        !url.pathname.startsWith('/images/') &&
        !url.pathname.startsWith('/videos/') &&
        !url.pathname.startsWith('/data/') &&
        !url.pathname.startsWith('/config/') &&
        !url.pathname.startsWith('/beaches/') &&
        !url.pathname.startsWith('/plages/') &&
        !url.pathname.startsWith('/en/') &&
        !url.pathname.startsWith('/es/') &&
        !url.pathname.startsWith('/fr/') &&
        url.pathname !== '/' &&
        !url.pathname.match(/\.(html|css|js|png|jpg|jpeg|gif|svg|ico|woff2|woff|json|xml|txt)$/)) {
      
      url.pathname = '/gp' + url.pathname;
      return new Response(null, {
        status: 302,
        headers: { 'Location': url.toString() }
      });
    }
  }

  return next();
}