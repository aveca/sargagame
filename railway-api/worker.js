/**
 * Cloudflare Worker - Reverse Proxy for Sargasse API
 * Routes /api/* requests to Railway PHP 8.3 backend
 * All other requests pass through to Cloudflare Pages (frontend)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = request.headers.get('host') || '';
    
    // Only proxy API routes to Railway
    if (url.pathname.startsWith('/api/')) {
      const targetUrl = new URL(request.url);
      targetUrl.hostname = 'sargasse-api.onrender.com';
      targetUrl.protocol = 'https:';
      
      // Preserve the original request
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow'
      });
      
      // Forward to Railway
      const response = await fetch(proxyRequest);
      
      // Return response with CORS headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }
    
    // All other requests pass through to Cloudflare Pages (frontend)
    return fetch(request);
  }
};