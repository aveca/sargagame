#!/usr/bin/env node
'use strict';
/**
 * Weekly B2B digest for the founder only (yacovassaraf@gmail.com).
 * Never emails prospects, hotels, or leads. Dry-run by default; --send delivers
 * only to the hardcoded founder address.
 */
const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs');

const FOUNDER = 'yacovassaraf@gmail.com';
const args = process.argv.slice(2);
const DO_SEND = args.includes('--send');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

function fmt(n) { return Number.isFinite(n) ? String(n) : 'n/a'; }

async function count(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id${query}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0'
    }
  });
  if (!res.ok) return null;
  const contentRange = res.headers.get('content-range') || '';
  const total = Number(contentRange.split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

async function main() {
  console.log(`=== B2B weekly digest === mode=${DO_SEND ? 'SEND' : 'DRY-RUN'} recipient=${FOUNDER}`);
  if (!SERVICE_KEY) {
    console.log('SUPABASE_SERVICE_KEY absent — no-op.');
    return;
  }
  if (DO_SEND && !mailReady()) {
    console.error('SMTP_PASS missing — cannot send.');
    process.exitCode = 1;
    return;
  }
  const [prospects, leads, events, deliveries, payments] = await Promise.all([
    count('b2b_prospects'),
    count('b2b_leads'),
    count('b2b_events'),
    count('b2b_forecast_deliveries'),
    count('b2b_payments')
  ]);
  const html = `${brandHeader('Sargasses Pro', 'Digest B2B de la semaine')}
    <p>Digest hebdo B2B (aucun email n'a été envoyé aux prospects).</p>
    <ul>
      <li>Prospects : ${fmt(prospects)}</li>
      <li>Leads : ${fmt(leads)}</li>
      <li>Événements enregistrés : ${fmt(events)}</li>
      <li>Livraisons de prévisions B2B : ${fmt(deliveries)}</li>
      <li>Paiements B2B : ${fmt(payments)}</li>
    </ul>
    <p>Pour relancer un hôtel, écris-lui depuis tes fils existants — ce digest ne contacte personne d'autre.</p>`;
  if (!DO_SEND) {
    console.log(`  ~ [dry] would send digest to ${FOUNDER} prospects=${prospects} leads=${leads}`);
    return;
  }
  const result = await sendEmail({
    to: FOUNDER,
    subject: `Digest B2B Sargasses — ${new Date().toISOString().slice(0, 10)}`,
    html,
    trackingId: `b2b_digest:${new Date().toISOString().slice(0, 10)}`
  });
  if (result.error) {
    console.error('Send failed:', result.error.message || result.error);
    process.exitCode = 1;
    return;
  }
  console.log(`  + sent digest to ${FOUNDER}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { FOUNDER };
