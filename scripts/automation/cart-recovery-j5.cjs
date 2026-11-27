#!/usr/bin/env node
/**
 * Cart Recovery J+5 — Dernier rappel
 * Usage: node scripts/automation/cart-recovery-j5.cjs [--dry] [--hold] [--send] [--cap=N]
 *  --dry   : dry-run (log only, no send)
 *  --hold  : write outbox JSON only (no SMTP send) — DÉFAUT
 *  --send  : envoi réel via SMTP (nécessite SMTP_PASS en env)
 *  --cap=N : plafond d'envois (défaut 50)
 *
 * 2026-11-27 — deux corrections (aucun impact live : ce script n'est appelé
 * par AUCUN workflow, le chemin vivant est sales-lifecycle-emails.yml →
 * recover-abandoned-cart.cjs) :
 *   1. PRIX : l'email promettait « 12,99 € au lieu de 14,99 € » avec
 *      PROMO_PRICE_EUR_CENTS = 1299. AUCUN serveur ne facture 12,99 €
 *      (grille réelle = 14,99 € / 16,99 $ depuis le 2026-11-09). Le prix
 *      affiché vient de lib/pass-price.cjs, verrouillé par
 *      tests/unit/price-parity.test.cjs.
 *   2. LIEN : `?promo=sejour_promo_eur` n'est lu par AUCUNE route (src/,
 *      workers/, public/api/), et `/checkout` n'existe pas. Le CTA utilise le
 *      deep-link vivant `/?paywall=1&pass=p30`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createTransport } = require('nodemailer');
const { passPrice, paywallUrl } = require('./lib/pass-price.cjs');

const OUTBOX_DIR = path.join(__dirname, 'data', 'outbox');
const SENT_MARKER = path.join(__dirname, 'data', 'cart-recovery-j5-sent.json');
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbx.../exec';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CAP_DEFAULT = 50;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const HOLD = args.includes('--hold') || (!args.includes('--send') && !DRY);
const SEND = args.includes('--send');
const CAP = parseInt((args.find(a => a.startsWith('--cap=')) || '--cap=' + CAP_DEFAULT).split('=')[1], 10);

if (!fs.existsSync(OUTBOX_DIR)) fs.mkdirSync(OUTBOX_DIR, { recursive: true });

function log(...a) { console.log('[cart-recovery-j5]', new Date().toISOString(), ...a); }

async function fetchAbandonedCartsJ5() {
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY manquant');
  const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

  const url = `${SUPABASE_URL}/rest/v1/analytics_events?select=email,region,beach_id,beach_name,created_at&event_type=eq.checkout_started&created_at=gte.${since}&created_at=lt.${until}&order=created_at.desc`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchConvertedEmails() {
  if (!SUPABASE_SERVICE_KEY) return new Set();
  const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/analytics_events?select=email&event_type=eq.payment_success&created_at=gte.${since}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) return new Set();
  const rows = await res.json();
  return new Set(rows.map(r => r.email?.toLowerCase()).filter(Boolean));
}

async function fetchSentJ1J3J5() {
  if (!fs.existsSync(SENT_MARKER)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(SENT_MARKER, 'utf-8'));
    return new Set(Object.keys(data).filter(k => data[k]?.sentAt));
  } catch { return new Set(); }
}

async function fetchSentJ5() {
  if (!fs.existsSync(SENT_MARKER)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(SENT_MARKER, 'utf-8'));
    return new Set(Object.keys(data).filter(k => data[k]?.day === 5));
  } catch { return new Set(); }
}

function buildPromoLink(email, region, beachId) {
  // 2026-11-27 : le paramètre `promo` n'est lu par aucune route (aucun
  // rabais appliqué) et `/checkout` n'existe pas. On pointe vers le
  // deep-link vivant, comme le workflow de relance en production.
  return paywallUrl(region, 'j5');
}

function renderEmail({ email, beachName, region, promoLink, unsubscribeLink }) {
  const p = passPrice(region);
  const subject = `Dernier rappel : ton pass 30 jours t'attend — ${p.price}`;
  const regionLabel = region === 'mq' ? 'Martinique' : region === 'gp' ? 'Guadeloupe' : region === 'florida' ? 'Floride' : region === 'puntacana' ? 'Punta Cana' : 'Riviera Maya';
  const beachLabel = beachName || 'ta plage';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; line-height: 1.6; }
    .wrapper { max-width: 480px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 32px 24px; }
    .badge { display: inline-block; background: #ffc72c; color: #0d1117; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; margin-bottom: 16px; }
    h1 { font-family: 'Anton', sans-serif; font-size: 28px; line-height: 1.2; margin: 0 0 16px; color: #ffc72c; }
    .price-row { display: flex; align-items: baseline; gap: 12px; margin: 16px 0; }
    .price-old { text-decoration: line-through; color: #8b949e; font-size: 18px; }
    .price-new { font-family: 'Anton', sans-serif; font-size: 32px; color: #ffc72c; }
    .cta { display: inline-block; background: #ffc72c; color: #0d1117; font-weight: 700; font-size: 16px; padding: 16px 28px; border-radius: 12px; text-decoration: none; margin-top: 24px; }
    .cta:hover { background: #ffd04a; }
    .deadline { background: #1f2937; border: 1px solid #374151; border-radius: 10px; padding: 16px; margin-top: 24px; text-align: center; color: #9ca3af; font-size: 14px; }
    .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #30363d; font-size: 12px; color: #8b949e; text-align: center; }
    .unsub { color: #8b949e; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <span class="badge">DERNIER RAPPEL</span>
      <h1>Ton pass t'attend toujours pour <span style="color:#e6edf3">${beachLabel}</span></h1>
      <p>Tu as regardé le verdict pour <strong>${beachLabel}</strong> (${regionLabel}) il y a 5 jours. La mer n'a pas changé d'avis — et le prix non plus.</p>
      <div class="price-row">
        <span class="price-new">${p.price}</span>
      </div>
      <p style="margin:16px 0; color:#9ca3af; font-size:14px;">30 jours de verdicts et d'alertes, paiement unique — <strong>${p.price}</strong>, rien de plus.</p>
      <a href="${promoLink}" class="cta">Récupérer mon pass à ${p.price}</a>
      <div class="deadline">
        Paiement unique · ${p.days} jours d'accès · sans abonnement — <a href="${promoLink}" style="color:#ffc72c; text-decoration:underline;">je récupère mon pass maintenant</a>
      </div>
      <p style="margin-top:24px; font-size:13px; color:#8b949e;">Pas d'abonnement, pas de renouvellement auto. Un paiement unique, ${p.days} jours d'accès aux verdicts jour par jour.</p>
    </div>
    <div class="footer">
      <p>Sargasses — <em>Il regarde la mer, jamais vos clients.</em></p>
      <p><a href="${unsubscribeLink}" class="unsub">Se désabonner</a> · <a href="https://sargasses-martinique.com/a-propos/" class="unsub">Mentions légales</a></p>
    </div>
  </div>
</body>
</html>`;

  const text = `Ton pass 30 jours t'attend toujours — ${p.price}

Tu as regardé le verdict pour ${beachLabel} (${regionLabel}) il y a 5 jours. La mer n'a pas changé d'avis.

30 jours de verdicts et d'alertes, paiement unique : ${p.price}.

Récupérer mon pass : ${promoLink}

—
Sargasses — Il regarde la mer, jamais vos clients.
Se désabonner : ${unsubscribeLink}`;

  return { subject, html, text };
}

async function sendEmail(transporter, { to, subject, html, text }) {
  return transporter.sendMail({
    from: '"Sargasses" <alerte@sargasses-martinique.com>',
    to,
    subject,
    html,
    text
  });
}

async function logToAppsScript(payload) {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cart_recovery_j5', ...payload })
    });
  } catch (e) {
    log('Apps Script log failed:', e.message);
  }
}

async function main() {
  log(`Starting J+5 cart recovery (dry=${DRY}, hold=${HOLD}, send=${SEND}, cap=${CAP})`);

  const [abandoned, converted, sentAll, sentJ5] = await Promise.all([
    fetchAbandonedCartsJ5(),
    fetchConvertedEmails(),
    fetchSentJ1J3J5(),
    fetchSentJ5()
  ]);

  log(`Abandoned J+5: ${abandoned.length}, Converted: ${converted.size}, Already sent (any day): ${sentAll.size}, Already sent J5: ${sentJ5.size}`);

  const candidates = abandoned.filter(row => {
    const email = row.email?.toLowerCase();
    if (!email) return false;
    if (converted.has(email)) return false;
    if (sentJ5.has(email)) return false;
    return true;
  }).slice(0, CAP);

  log(`Eligible after filters: ${candidates.length}`);

  if (candidates.length === 0) {
    log('No eligible recipients. Done.');
    return;
  }

  let transporter = null;
  if (SEND) {
    if (!process.env.SMTP_PASS) throw new Error('SMTP_PASS manquant pour --send');
    transporter = createTransport({
      host: 'smtp.mail.infomaniak.com',
      port: 465,
      secure: true,
      auth: { user: 'alerte@sargasses-martinique.com', pass: process.env.SMTP_PASS }
    });
    await transporter.verify();
    log('SMTP verified');
  }

  const sentMarker = fs.existsSync(SENT_MARKER) ? JSON.parse(fs.readFileSync(SENT_MARKER, 'utf-8')) : {};
  let sentCount = 0;

  for (const row of candidates) {
    const email = row.email.toLowerCase();
    const region = row.region || 'mq';
    const beachName = row.beach_name || 'ta plage';
    const beachId = row.beach_id || '';
    const promoLink = buildPromoLink(email, region, beachId);
    const unsubscribeLink = `https://sargasses-martinique.com/unsub?email=${encodeURIComponent(email)}`;

    const { subject, html, text } = renderEmail({ email, beachName, region, promoLink, unsubscribeLink });

    const outboxPath = path.join(OUTBOX_DIR, `cart_recovery_j5_${email.replace('@', '_at_')}_${Date.now()}.json`);
    const payload = {
      to: email,
      subject,
      html,
      text,
      meta: { day: 5, region, beachId, beachName, promoLink, sentAt: new Date().toISOString() }
    };

    fs.writeFileSync(outboxPath, JSON.stringify(payload, null, 2));
    log(`Outbox written: ${outboxPath}`);

    if (SEND) {
      try {
        await sendEmail(transporter, { to: email, subject, html, text });
        sentMarker[email] = { day: 5, sentAt: new Date().toISOString(), region, beachId };
        sentCount++;
        log(`SENT to ${email}`);
        await logToAppsScript({ email, region, beachId, beachName, promoLink, sentAt: new Date().toISOString() });
      } catch (e) {
        log(`SEND FAILED ${email}:`, e.message);
      }
    } else {
      sentMarker[email] = { day: 5, sentAt: null, region, beachId, held: true };
      log(`HELD (dry/hold) ${email}`);
    }

    if (sentCount >= CAP) break;
  }

  fs.writeFileSync(SENT_MARKER, JSON.stringify(sentMarker, null, 2));
  log(`Done. Sent: ${sentCount}, Held: ${candidates.length - sentCount}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });