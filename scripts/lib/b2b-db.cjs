/**
 * b2b-db.cjs — Supabase REST helper for B2B concierge tables.
 * Minimal wrapper: insert, select, update. No ORM, no dependencies.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_KEY from env or .env.
 */

const fs = require('fs');
const path = require('path');

// Load .env if present
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SERVICE_KEY) {
  console.warn('[b2b-db] SUPABASE_SERVICE_KEY not set — writes will fail');
}

/**
 * Generic Supabase REST request.
 * @param {string} table
 * @param {string} method - GET | POST | PATCH | DELETE
 * @param {object} [body]
 * @param {string} [query] - query string (e.g. '?id=eq.xxx')
 * @returns {Promise<any>}
 */
async function request(table, method, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'GET') headers.Prefer = 'return=representation';
  if (method === 'POST') headers.Prefer = 'return=representation';
  if (method === 'PATCH') headers.Prefer = 'return=representation';

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${method} ${table}: ${resp.status} — ${text}`);
  }
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return null;
}

// ─── Prospects ────────────────────────────────────────────────────────

async function createProspect({ name, beach, island, phone, email, grade = 'A' }) {
  const rows = await request('b2b_prospects', 'POST', {
    name, beach, island, phone, email, grade,
  });
  return rows[0];
}

async function getProspect(id) {
  const rows = await request('b2b_prospects', 'GET', null, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

async function listProspects(status = null) {
  let q = '?select=*';
  if (status) q += `&status=eq.${status}`;
  q += '&order=created_at.desc';
  return request('b2b_prospects', 'GET', null, q);
}

async function updateProspectStatus(id, status) {
  const rows = await request('b2b_prospects', 'PATCH', { status }, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

// ─── Contacts ─────────────────────────────────────────────────────────

async function logContact({ prospect_id, channel, summary, raw_transcript }) {
  const rows = await request('b2b_contacts', 'POST', {
    prospect_id, channel, summary, raw_transcript,
  });
  return rows[0];
}

async function listContacts(prospect_id) {
  return request('b2b_contacts', 'GET', null,
    `?prospect_id=eq.${prospect_id}&select=*&order=created_at.desc`);
}

// ─── Scores ───────────────────────────────────────────────────────────

async function setScore({ prospect_id, problem_score, frequency_score, cost_score, willingness_score }) {
  const total = problem_score + frequency_score + cost_score + willingness_score;
  const rows = await request('b2b_scores', 'POST', {
    prospect_id, problem_score, frequency_score, cost_score, willingness_score,
    total_score: total,
  });
  return rows[0];
}

async function getScore(prospect_id) {
  const rows = await request('b2b_scores', 'GET', null,
    `?prospect_id=eq.${prospect_id}&select=*&order=computed_at.desc&limit=1`);
  return rows[0] || null;
}

// ─── Concierge ────────────────────────────────────────────────────────

async function startConcierge(prospect_id, start_date, end_date) {
  const rows = await request('b2b_concierge', 'POST', {
    prospect_id, start_date, end_date,
    status: 'active', current_day: 0,
  });
  return rows[0];
}

async function getActiveConcierge(prospect_id) {
  const rows = await request('b2b_concierge', 'GET', null,
    `?prospect_id=eq.${prospect_id}&status=eq.active&select=*&limit=1`);
  return rows[0] || null;
}

async function advanceConciergeDay(id, current_day) {
  const rows = await request('b2b_concierge', 'PATCH', { current_day }, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

async function completeConcierge(id) {
  const rows = await request('b2b_concierge', 'PATCH', { status: 'completed' }, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

async function markPaymentRequested(id) {
  const rows = await request('b2b_concierge', 'PATCH', { payment_requested: true }, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

async function markPaymentConfirmed(id) {
  const rows = await request('b2b_concierge', 'PATCH', { payment_confirmed: true, status: 'completed' }, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

// ─── Forecast Deliveries ──────────────────────────────────────────────

async function createForecastDelivery(data) {
  const rows = await request('b2b_forecast_deliveries', 'POST', data);
  return rows[0];
}

async function getForecastDelivery(id) {
  const rows = await request('b2b_forecast_deliveries', 'GET', null, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

async function getDeliveriesForConcierge(concierge_id) {
  return request('b2b_forecast_deliveries', 'GET', null,
    `?concierge_id=eq.${concierge_id}&select=*&order=day_number.asc`);
}

async function markDeliverySent(id) {
  const now = new Date().toISOString();
  const rows = await request('b2b_forecast_deliveries', 'PATCH',
    { status: 'sent', sent_at: now }, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

// ─── Payments ─────────────────────────────────────────────────────────

async function createPayment({ prospect_id, concierge_id, amount = 29.00 }) {
  const rows = await request('b2b_payments', 'POST', {
    prospect_id, concierge_id, amount,
  });
  return rows[0];
}

async function updatePaymentStatus(id, status, mollie_payment_id = null) {
  const update = { status };
  if (mollie_payment_id) update.mollie_payment_id = mollie_payment_id;
  const rows = await request('b2b_payments', 'PATCH', update, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

async function markPaymentPaid(id) {
  const now = new Date().toISOString();
  const rows = await request('b2b_payments', 'PATCH',
    { status: 'paid', paid_at: now }, `?id=eq.${id}&select=*`);
  return rows[0] || null;
}

// ─── Events (immutable log) ───────────────────────────────────────────

async function logEvent({ prospect_id, type, actor = 'system', metadata = {} }) {
  const rows = await request('b2b_events', 'POST', {
    prospect_id, type, actor, metadata,
  });
  return rows[0];
}

async function getEventsForProspect(prospect_id) {
  return request('b2b_events', 'GET', null,
    `?prospect_id=eq.${prospect_id}&select=*&order=created_at.asc`);
}

module.exports = {
  // Prospects
  createProspect,
  getProspect,
  listProspects,
  updateProspectStatus,
  // Contacts
  logContact,
  listContacts,
  // Scores
  setScore,
  getScore,
  // Concierge
  startConcierge,
  getActiveConcierge,
  advanceConciergeDay,
  completeConcierge,
  markPaymentRequested,
  markPaymentConfirmed,
  // Forecast Deliveries
  createForecastDelivery,
  getForecastDelivery,
  getDeliveriesForConcierge,
  markDeliverySent,
  // Payments
  createPayment,
  updatePaymentStatus,
  markPaymentPaid,
  // Events
  logEvent,
  getEventsForProspect,
};
