/**
 * supabase.mjs — Client REST minimal (service_role) pour les tables de commande.
 *
 * SÉCURITÉ
 *   - l'URL et la clé viennent de l'environnement du processus (jamais du CLI,
 *     jamais d'un fichier versionné, jamais affichées) ;
 *   - aucune valeur de secret n'est journalisée : les erreurs ne contiennent
 *     que le code HTTP et un extrait de réponse Supabase ;
 *   - service_role uniquement (les tables ont une policy RLS service_role).
 */

export function createSupabaseClient({ url, key } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const apiKey = String(key || '');
  const configured = Boolean(base && apiKey);

  async function request(method, table, { query = '', body = undefined } = {}) {
    if (!configured) {
      return { ok: false, status: 0, rows: [], data: null, error: 'supabase_not_configured' };
    }
    const url = `${base}/rest/v1/${table}${query}`;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          rows: [],
          data,
          error: `http_${res.status}:${text.slice(0, 160)}`,
        };
      }
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return { ok: true, status: res.status, rows, data, error: null };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        rows: [],
        data: null,
        error: `network:${String(e?.message || e).slice(0, 120)}`,
      };
    }
  }

  return {
    configured,

    async select(table, { filter = '', columns = '*', limit = 50, order = '' } = {}) {
      const query = `?select=${encodeURIComponent(columns)}${filter}${order ? `&order=${encodeURIComponent(order)}` : ''}&limit=${limit}`;
      return request('GET', table, { query });
    },

    async insert(table, row, { onConflict = '' } = {}) {
      const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
      return request('POST', table, { query, body: row });
    },

    async update(table, patch, { filter = '' } = {}) {
      return request('PATCH', table, { query: filter, body: patch });
    },

    async ping() {
      return request('GET', 'diagnostic_orders', { query: '?select=order_id&limit=1' });
    },
  };
}

/** Filtre PostgREST « eq. » sur une colonne. */
export function eqFilter(column, value) {
  return `${column}=eq.${encodeURIComponent(String(value))}`;
}

/** Filtre PostgREST « in. » (liste). */
export function inFilter(column, values) {
  const list = (Array.isArray(values) ? values : [values]).map((v) => encodeURIComponent(String(v)));
  return `${column}=in.(${list.join(',')})`;
}
