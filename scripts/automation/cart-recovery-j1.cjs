#!/usr/bin/env node
/**
 * Cart Recovery J+1 — Abandoned cart recovery email at J+1
 * DRY-RUN by default (logs only). Set DRY_RUN=0 to send.
 *
 * Reads sg_pass_cta events from Supabase analytics_events (last 24-48h)
 * Filters out sessions with subsequent sg_conversion
 * Sends recovery email via SMTP using brandHeader + template
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, SMTP_*, DRY_RUN=1|0
 */

const { createClient } = require('@supabase/supabase-js');
const { createTransport } = require('nodemailer');
const { brandHeader } = require('./lib/email-send.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN = process.env.DRY_RUN !== '0';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function getPassUrl(region) {
  const regionKey = (region || 'eur').toLowerCase().startsWith('us') ? 'usd' : 'eur';
  if (regionKey === 'usd') {
    return 'https://payment-links.mollie.com/payment/your-sejour-usd-link';
  }
  return 'https://payment-links.mollie.com/payment/your-sejour-eur-link';
}

function buildEmail({ email, firstName, region, ctaUrl, subject }) {
  const preheader = 'Ton pass 30 jours t\'attend — 12,99 €';
  const headerHtml = brandHeader({ preheader });

  const bodyHtml = `
    <div style="font-family: 'Bricolage Grotesque', system-ui, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 24px 16px;">
      ${headerHtml}

      <p style="margin: 0 0 16px; font-size: 16px;">Salut ${firstName || 'là-bas'},</p>

      <p style="margin: 0 0 16px; font-size: 16px;">Tu as regardé le verdict de ta plage hier. Le satellite a confirmé : l'eau est propre <strong>aujourd'hui</strong>.</p>

      <p style="margin: 0 0 16px; font-size: 16px;">Notre prévision « mer propre » est <strong>auditée à ~76 %</strong> toutes saisons confondues (voir <a href="https://sargasses-martinique.com/fiabilite/" style="color:#0066cc;">/fiabilité/</a>).</p>

      <p style="margin: 0 0 16px; font-size: 16px;">Ton pass 30 jours t'attend à <strong>12,99 €</strong> (ou 11,99 $ selon ta région). Pas d'abonnement, pas de carte mémorisée.</p>

      <p style="margin: 0 0 24px; font-size: 16px;">Si tu veux le corriger toi-même, le verdict gratuit d'aujourd'hui est <a href="https://sargasses-martinique.com/" style="color:#0066cc;">ici</a>.</p>

      <p style="text-align: center; margin: 32px 0;">
        <a href="${ctaUrl}" style="display:inline-block; background:#FFC72C; color:#0d1117; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none; font-size:16px; font-family:'Anton',sans-serif; letter-spacing:0.5px;">
          Récupérer mon pass 30j — 12,99 €
        </a>
      </p>

      <p style="margin: 24px 0 0; font-size: 13px; color: #666; text-align:center;">
        On regarde la mer pour toi. Pas de spam, désabonnement 1 clic.<br>
        <a href="https://sargasses-martinique.com/unsubscribe/?email=${encodeURIComponent(email)}" style="color:#666;">Se désabonner</a>
      </p>
    </div>
  `;

  return { subject, html: bodyHtml };
}

async function fetchAbandonedCarts() {
  const now = Date.now();
  const windowStart = now - 48 * 60 * 60 * 1000; // 48h ago
  const windowEnd = now - 24 * 60 * 60 * 1000;   // 24h ago

  const { data: events, error } = await supabase
    .from('analytics_events')
    .select('event_name, session_id, email, region, timestamp, props')
    .in('event_name', ['sg_pass_cta', 'sg_conversion'])
    .gte('timestamp', new Date(windowStart).toISOString())
    .lte('timestamp', new Date(windowEnd).toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('❌ Supabase query error:', error.message);
    return [];
  }

  // Group by session_id
  const sessions = new Map();
  for (const e of events) {
    if (!sessions.has(e.session_id)) {
      sessions.set(e.session_id, { events: [], email: e.email, region: e.region });
    }
    sessions.get(e.session_id).events.push(e);
  }

  const abandoned = [];
  for (const [sessionId, { events, email, region }] of sessions) {
    const hasCta = events.some(e => e.event_name === 'sg_pass_cta');
    const hasConversion = events.some(e => e.event_name === 'sg_conversion');
    const ctaEvent = events.find(e => e.event_name === 'sg_pass_cta');

    if (hasCta && !hasConversion && email && ctaEvent) {
      abandoned.push({
        email,
        region: region || (ctaEvent.props?.region) || 'eur',
        firstName: ctaEvent.props?.firstName || '',
        sessionId,
        ctaAt: ctaEvent.timestamp,
      });
    }
  }

  return abandoned;
}

async function sendRecoveryEmail({ email, region, firstName, ctaUrl, subject }) {
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const { subject: subj, html } = buildEmail({ email, region, firstName, ctaUrl, subject });

  if (DRY_RUN) {
    console.log('🔍 DRY-RUN — Would send to:', email);
    console.log('   Subject:', subj);
    console.log('   CTA:', ctaUrl);
    console.log('   Region:', region);
    return { dryRun: true };
  }

  const info = await transporter.sendMail({
    from: `"Sargasses" <${process.env.SMTP_FROM || 'alerte@sargasses-martinique.com'}>`,
    to: email,
    subject: subj,
    html,
  });

  console.log('✅ Sent to', email, '| MessageId:', info.messageId);
  return { sent: true, messageId: info.messageId };
}

async function main() {
  console.log('🔍 Cart Recovery J+1 — DRY_RUN:', DRY_RUN);
  console.log('📊 Fetching abandoned carts (sg_pass_cta 24-48h ago, no sg_conversion)...');

  const abandoned = await fetchAbandonedCarts();
  console.log(`📋 Found ${abandoned.length} abandoned cart(s)`);

  if (abandoned.length === 0) {
    console.log('✅ No abandoned carts to recover');
    return;
  }

  const subject = 'Ton pass 30j t\'attend — 12,99 €';

  for (const cart of abandoned) {
    const ctaUrl = getPassUrl(cart.region);

    console.log(`\n📧 Processing ${cart.email} (${cart.region}) → ${ctaUrl}`);

    try {
      await sendRecoveryEmail({
        email: cart.email,
        region: cart.region,
        firstName: cart.firstName,
        ctaUrl,
        subject,
      });
    } catch (err) {
      console.error('❌ Failed to send to', cart.email, err.message);
    }
  }

  console.log('\n✅ Cart recovery J+1 complete');
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});