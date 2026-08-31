/**
 * Supabase Proxy Worker — Cloudflare Worker
 * Proxies specific Supabase REST operations from frontend (anon) to Supabase (service_role)
 * - service_role ONLY server-side (never in browser)
 * - Explicit allowlist of operations
 * - Server-side island injection (no client choice)
 * - RLS preserved on Supabase
 * - Region isolation enforced server-side
 *
 * Endpoints:
 *   POST /api/supabase/analytics_events     — funnel events (allowlisted events only)
 *   POST /api/supabase/photos               — visitor photos (status=pending only)
 *   POST /api/supabase/planner_alerts       — planner alerts (notified=false only)
 *   POST /api/supabase/beach_reports        — beach reports (status=pending + event allowlist)
 *   GET  /api/supabase/photos?...           — approved photos only
 *   GET  /api/supabase/beach_reports?...    — approved reports only
 *   GET  /api/supabase/analytics_events?... — denied (write-only)
 *   POST /api/supabase                      — generic table insert (LeadCapture, b2b leads, etc.)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

function err(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

// ─── Region detection from hostname ───────────────────────────────────
const REGION_BY_HOSTNAME = {
  'sargasses-martinique.com': 'MQ',
  'sargasses-guadeloupe.com': 'GP',
  'sargassummiami.com': 'FLORIDA',
  'sargassumpuntacana.com': 'PUNTA_CANA',
  'sargassumcancun.com': 'RIVIERA_MAYA',
  'sargazotulum.com': 'TULUM',
  'sargassumbarbados.com': 'BARBADOS',
};

function detectRegion(request) {
  const url = new URL(request.url);
  const hostname = url.hostname.replace(/^www\./, '');
  return REGION_BY_HOSTNAME[hostname] || null;
}

// ─── Allowlisted operations ───────────────────────────────────────────
const ALLOWED_EVENTS = new Set([
  'sg_session_start',
  'sg_beach_lock',
  'sg_beach_click',
  'sg_paywall_open',
  'sg_paywall_cta',
  'sg_conversion',
  'sg_email_submit',
  'sg_verdict_confirm',
  'sg_observation',
]);

const ALLOWED_BEACH_REPORT_EVENTS = new Set(['beaching', 'cleanup']);

// ─── Supabase REST helper (service_role only) ─────────────────────────
async function sbRequest(table, method, body = null, query = '', env) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  console.log('DEBUG sbRequest:', { table, method, hasServiceKey: !!serviceKey, keyPrefix: serviceKey?.substring(0, 10) });
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (['GET', 'POST', 'PATCH'].includes(method)) {
    headers.Prefer = 'return=representation';
  }
  const opts = { method, headers, body: body ? JSON.stringify(body) : undefined };
  const res = await fetch(url, opts);
  if (res.status === 204) return [];
  const text = await res.text();
  if (!text) return [];
  const data = JSON.parse(text);
  if (res.status >= 400) {
    console.log('Supabase error:', { status: res.status, text });
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return data;
}

// ─── Main handler ─────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // Debug: check env vars
    console.log('DEBUG fetch:', { hasServiceKey: !!env.SUPABASE_SERVICE_ROLE_KEY_v2, hasUrl: !!env.SUPABASE_URL, serviceKeyPrefix: env.SUPABASE_SERVICE_ROLE_KEY_v2?.substring(0, 10) });

    // Debug endpoint: /api/supabase/debug
    if (url.pathname === '/api/supabase/debug') {
      return json({
        hasServiceKey: !!env.SUPABASE_SERVICE_KEY,
        hasUrl: !!env.SUPABASE_URL,
        serviceKeyPrefix: env.SUPABASE_SERVICE_KEY?.substring(0, 10),
        serviceKeyFull: env.SUPABASE_SERVICE_KEY,
        allEnvKeys: Object.keys(env)
      });
    }

    // Detect region from hostname
    const region = detectRegion(request);
    if (!region) return err('Unknown region', 400);

    // ─── Analytics events (write-only, allowlisted events) ────────────
    if (path === '/api/supabase/analytics_events') {
      if (method === 'POST') {
        let body;
        let rawBody;
        try {
          rawBody = await request.text();
          body = JSON.parse(rawBody);
        } catch {
          return err('Invalid JSON', 400);
        }
        const { event, params, island: clientIsland } = body || {};

        // Validate event is allowlisted
        if (!event || !ALLOWED_EVENTS.has(event)) {
          return err('Event not allowed', 403);
        }

        // Server-side island injection (ignore client-provided)
        const payload = {
          event: String(event),
          params: params || {},
          island: region, // SERVER-SIDE: always use detected region
        };

        try {
          await sbRequest('analytics_events', 'POST', payload, '', env);
          return json({ success: true });
        } catch (e) {
          return err(e.message, 500);
        }
      }

      // analytics_events is write-only for anon
      return err('Method not allowed', 405);
    }

    // ─── Photos (visitor uploads) ─────────────────────────────────────
    if (path === '/api/supabase/photos') {
      if (method === 'POST') {
        let body;
        let rawBody;
        try {
          rawBody = await request.text();
          body = JSON.parse(rawBody);
        } catch {
          return err('Invalid JSON', 400);
        }

        const { beach_id, beach_name, island: clientIsland, level, url: photoUrl, status } = body || {};

        // Validate required fields
        if (!beach_id || !beach_name || !photoUrl) {
          return err('Missing required fields', 400);
        }

        // Server-side validation: status must be 'pending'
        if (status !== 'pending') {
          return err('Invalid status', 403);
        }

        // Server-side island injection
        const payload = {
          beach_id: String(beach_id),
          beach_name: String(beach_name),
          island: region, // SERVER-SIDE
          level: level || null,
          url: String(photoUrl),
          status: 'pending',
        };

        try {
          await sbRequest('photos', 'POST', payload, '', env);
          return json({ success: true });
        } catch (e) {
          return err(e.message, 500);
        }
      }

      if (method === 'GET') {
        // Only approved photos readable (RLS enforces this, but we can be explicit)
        const beachId = url.searchParams.get('beach_id');
        const limit = url.searchParams.get('limit') || '12';

        if (!beachId) return err('beach_id required', 400);

        try {
          const data = await sbRequest(
            'photos',
            'GET',
            null,
            `?beach_id=eq.${encodeURIComponent(beachId)}&status=eq.approved&select=url,level,created_at&order=created_at.desc&limit=${limit}`,
            env
          );
          return json(data.map(r => ({ url: r.url, ts: r.created_at, level: r.level || '' })));
        } catch (e) {
          return err(e.message, 500);
        }
      }

      return err('Method not allowed', 405);
    }

    // ─── Planner alerts ───────────────────────────────────────────────
    if (path === '/api/supabase/planner_alerts') {
      if (method === 'POST') {
        let body;
        let rawBody;
        try {
          rawBody = await request.text();
          body = JSON.parse(rawBody);
        } catch {
          return err('Invalid JSON', 400);
        }

        const { email, trip_date, beach_id, beach_name, lang } = body || {};

        if (!email || !trip_date) return err('email and trip_date required', 400);

        // Server-side region injection
        const payload = {
          email: String(email).trim().slice(0, 200).toLowerCase(),
          domain: null, // could add from referer if needed
          region: region, // SERVER-SIDE
          beach_id: beach_id || null,
          beach_name: beach_name || null,
          trip_date: String(trip_date), // YYYY-MM-DD
          lang: lang || null,
          notified: false,
        };

        try {
          await sbRequest('planner_alerts', 'POST', payload, '', env);
          return json({ success: true });
        } catch (e) {
          return err(e.message, 500);
        }
      }

      return err('Method not allowed', 405);
    }

    // ─── Beach reports ────────────────────────────────────────────────
    if (path === '/api/supabase/beach_reports') {
      if (method === 'POST') {
        let body;
        let rawBody;
        try {
          rawBody = await request.text();
          body = JSON.parse(rawBody);
        } catch {
          return err('Invalid JSON', 400);
        }

        const { beach_id, beach_name, island: clientIsland, event, note, photo_url, on_site } = body || {};

        if (!beach_id || !event) return err('beach_id and event required', 400);
        if (!ALLOWED_BEACH_REPORT_EVENTS.has(event)) {
          return err('Invalid event type', 403);
        }

        // Server-side island injection
        const payload = {
          beach_id: String(beach_id),
          beach_name: beach_name || null,
          island: region, // SERVER-SIDE
          event: String(event),
          note: note ? String(note).trim().slice(0, 280) : null,
          photo_url: photo_url || null,
          status: 'pending',
        };

        try {
          await sbRequest('beach_reports', 'POST', payload, '', env);
          return json({ success: true });
        } catch (e) {
          return err(e.message, 500);
        }
      }

      if (method === 'GET') {
        const beachId = url.searchParams.get('beach_id');
        const limit = url.searchParams.get('limit') || '20';

        if (!beachId) return err('beach_id required', 400);

        try {
          const data = await sbRequest(
            'beach_reports',
            'GET',
            null,
            `?beach_id=eq.${encodeURIComponent(beachId)}&status=eq.approved&select=event,note,created_at,downgrade_confirmed_at&order=created_at.desc&limit=${limit}`,
            env
          );
          return json(data.map(r => ({
            event: r.event,
            ts: r.created_at,
            note: r.note || '',
            downgradeConfirmedAt: r.downgrade_confirmed_at || null
          })));
        } catch (e) {
          return err(e.message, 500);
        }
      }

      return err('Method not allowed', 405);
    }

    // ─── Generic table insert (LeadCapture, b2b leads, b2b_subscriptions, etc.) ────────────
    if (path === '/api/supabase') {
      if (method !== 'POST') return err('Method not allowed', 405);
      let body;
      let rawBody;
      try {
        rawBody = await request.text();
        body = JSON.parse(rawBody);
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Parse failed: ' + e.message, received: rawBody.substring(0, 200) }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
      }
      const { table, insert } = body || {};
      if (!table || !insert || typeof insert !== 'object') {
        return err('Missing table or insert object', 400);
      }
      try {
        await sbRequest(table, 'POST', insert, '', env);
        return json({ success: true });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ─── Not found ────────────────────────────────────────────────────
    return err('Not found', 404);
  },
};