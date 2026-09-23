#!/usr/bin/env node
/**
 * revenue-report.cjs — REVENUE IGNITION 2026-09-23.
 * Un seul rapport cash first-party : lit les JSON existants (aucunecollecte
 * nouvelle, aucune PII). Vérités séparées : Mollie = paiement, Supabase = funnel.
 * Usage: node scripts/revenue-report.cjs
 */
const fs = require('fs');
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; }; };
const snap = J('scripts/automation/data/funnel-snapshot.json') || {};
const daily = J('scripts/automation/data/funnel-daily-report.json') || {};
const b2b = J('scripts/automation/data/b2b-funnel.json') || {};
const c = snap.counts || {};
const pct = (a, b) => (b > 0 ? ((100 * a / b).toFixed(1) + '%') : '—');
const row = (k, v) => console.log(('  ' + k).padEnd(34) + String(v));
console.log('== SARGAGAME REVENUE — ' + new Date().toISOString().slice(0, 10) + ' ==');
console.log('— B2C funnel 7j (funnel-snapshot.json, depuis ' + (snap.since || '?').slice(0, 10) + ') —');
row('sessions', c.session_start || 0);
row('beach opens', c.beach_open || 0);
row('premium opens', c.premium_modal_open || 0);
row('offer CTA (pass_cta)', c.pass_cta || 0);
row('checkout opened (onsite)', c.onsite_checkout_opened || 0);
row('paid (conversion)', c.conversion || 0);
row('payment failed', c.payment_failed || c.pay_onsite_error || 0);
row('modal→CTA', pct(c.pass_cta, c.premium_modal_open));
row('CTA→checkout', pct(c.onsite_checkout_opened, c.pass_cta));
row('checkout→paid', pct(c.conversion, c.onsite_checkout_opened));
console.log('— B2C 24h (funnel-daily-report.json) —');
row('events 24h', daily.total_events || 0);
const fc = daily.funnel || [];
fc.forEach(s => row(s.key, s.count));
console.log('— B2B (b2b-funnel.json, ' + (b2b.updatedAt || '?').slice(0, 10) + ') —');
const bc = b2b.counts || {};
row('discovered/contacted/lead/paid', [bc.discovered, bc.contacted, bc.lead, bc.paid].map(v => v ?? '?').join(' / '));
console.log('— Vérités —');
console.log('  Paiement = Mollie (dashboard). Funnel = Supabase/Apps Script. Jamais mélangés.');
console.log('  Offre live: Pass 30j 14,99 EUR (MQ/GP) / $11,99→$13,79 USD saison (PASS_CENTS).');
