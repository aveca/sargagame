#!/usr/bin/env node
'use strict';
/**
 * Daily morning briefing for opted-in B2C alert subscribers.
 *
 * Why this exists separately from workers/sg-payments:
 *   The Worker cron only emails when a selected beach is moderate/avoid/high
 *   AND the live observation is <= 900 minutes old. In Nov 2026 that meant
 *   zero deliveries: live data was 13 days old, and when data was fresh the
 *   beaches were often "clean" so no alert fired. Subscribers never received
 *   the daily "how is my beach?" they signed up for, nor a path to the 30-day
 *   pass.
 *
 * This script sends a status briefing for the subscriber's selected beaches
 * (including clean) with an honest observation date and a CTA to the 30-day
 * pass on their regional site. It does NOT touch sg-payments.
 *
 * Idempotence: claims public.sg_claim_b2c_alert_delivery with a
 * "morning-digest|" beaches hash so it cannot collide with the Worker's
 * alert-only fingerprints. Fail-closed if the marker cannot be claimed.
 *
 * DRY-RUN by default. Use --send to deliver. --only=email limits recipients
 * (used to test with yacovassaraf@gmail.com only).
 *
 * Env: SUPABASE_SERVICE_KEY, SMTP_PASS (and optional SMTP_HOST/USER/PORT,
 * SUPABASE_URL). Never logs full email addresses — hash8 only.
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs');

const args = process.argv.slice(2);
const DO_SEND = args.includes('--send');
const ONLY_RAW = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
const ONLY_EMAIL = ONLY_RAW ? ONLY_RAW.trim().toLowerCase() : null;
const MAX_EMAILS = Number((args.find((a) => a.startsWith('--max=')) || '--max=80').split('=')[1]) || 80;

const ROOT = path.resolve(__dirname, '..', '..');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

const REGION_CONFIG = {
  mq: { file: 'mq', domain: 'sargasses-martinique.com', label: 'Martinique', lang: 'fr', currency: 'EUR' },
  martinique: { file: 'mq', domain: 'sargasses-martinique.com', label: 'Martinique', lang: 'fr', currency: 'EUR' },
  gp: { file: 'gp', domain: 'sargasses-guadeloupe.com', label: 'Guadeloupe', lang: 'fr', currency: 'EUR' },
  guadeloupe: { file: 'gp', domain: 'sargasses-guadeloupe.com', label: 'Guadeloupe', lang: 'fr', currency: 'EUR' },
  us: { file: 'florida', domain: 'sargassummiami.com', label: 'Florida', lang: 'en', currency: 'USD' },
  florida: { file: 'florida', domain: 'sargassummiami.com', label: 'Florida', lang: 'en', currency: 'USD' },
  do: { file: 'puntacana', domain: 'sargassumpuntacana.com', label: 'Punta Cana', lang: 'en', currency: 'USD' },
  puntacana: { file: 'puntacana', domain: 'sargassumpuntacana.com', label: 'Punta Cana', lang: 'en', currency: 'USD' },
  mx: { file: 'rivieramaya', domain: 'sargassumcancun.com', label: 'Riviera Maya', lang: 'en', currency: 'USD' },
  rivieramaya: { file: 'rivieramaya', domain: 'sargassumcancun.com', label: 'Riviera Maya', lang: 'en', currency: 'USD' },
  tulum: { file: 'tulum', domain: 'sargazotulum.com', label: 'Tulum', lang: 'en', currency: 'USD' }
};

function pass30Price(region) {
  return region && region.currency === 'USD' ? '$16.99' : '14,99 €';
}

const STATUS_LABEL = {
  fr: { clean: 'propre', moderate: 'modéré', avoid: 'à éviter', high: 'fort', unknown: 'inconnu' },
  en: { clean: 'clean', moderate: 'moderate', avoid: 'avoid', high: 'heavy', unknown: 'unknown' }
};

function logId(email) {
  return createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex').slice(0, 8);
}

function beachesHash(ids) {
  const key = 'morning-digest|' + [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].sort().join('|');
  return createHash('sha256').update(key).digest('hex');
}

function loadRegionPayload(fileId) {
  const file = path.join(ROOT, 'public', 'api', 'copernicus', fileId, 'sargassum.json');
  const fallback = path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json');
  const target = fs.existsSync(file) ? file : fallback;
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function resolveRegion(sub) {
  const key = String(sub.region || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return REGION_CONFIG[key] || null;
}

async function supabase(pathname, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data, text };
}

async function claimDelivery(fingerprint) {
  const r = await supabase('/rest/v1/rpc/sg_claim_b2c_alert_delivery', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      p_subscription_id: fingerprint.subscriptionId,
      p_observation_ts: fingerprint.observationTs,
      p_beaches_hash: fingerprint.beachesHash,
      p_region: fingerprint.region
    }
  });
  if (!r.ok) return { claimed: false, error: `http_${r.status}:${String(r.text || '').slice(0, 160)}` };
  const claimed = r.data === true || r.data === 'true' || (Array.isArray(r.data) && (r.data[0] === true || r.data[0] === 'true'));
  return { claimed: claimed === true, error: null };
}

async function markDelivery(fingerprint, status) {
  const query = `?subscription_id=eq.${encodeURIComponent(fingerprint.subscriptionId)}` +
    `&observation_ts=eq.${encodeURIComponent(fingerprint.observationTs)}` +
    `&beaches_hash=eq.${encodeURIComponent(fingerprint.beachesHash)}`;
  await supabase(`/rest/v1/b2c_alert_deliveries${query}`, {
    method: 'PATCH',
    body: { status, provider: 'smtp', updated_at: new Date().toISOString() }
  });
}

function selectedLevels(sub, payload) {
  if (!Array.isArray(sub.beaches) || sub.beaches.length === 0) return [];
  if (!payload || !Array.isArray(payload.levels)) return [];
  const byId = new Map(payload.levels.filter((l) => l && l.id).map((l) => [l.id, l]));
  return sub.beaches.map((id) => String(id || '').trim()).filter(Boolean).map((id) => byId.get(id)).filter(Boolean);
}

function buildEmail(sub, region, payload, levels) {
  const lang = region.lang;
  const domain = String(sub.domain || region.domain).trim().toLowerCase() || region.domain;
  const unsubUrl = `https://${domain}/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;
  const price = pass30Price(region);
  const ctaUrl = `https://${domain}/?pass=p30&paywall=1&utm_source=email&utm_medium=alert&utm_campaign=pass30`;
  const observed = String(payload.erddapTimestamp || '').slice(0, 16).replace('T', ' ');
  const ageHours = payload.erddapTimestamp
    ? Math.max(0, Math.round((Date.now() - Date.parse(payload.erddapTimestamp)) / 3600000))
    : null;
  const labels = STATUS_LABEL[lang] || STATUS_LABEL.en;
  const rows = levels.map((l) => {
    const status = String(l.status || 'unknown').toLowerCase();
    return `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb">${escapeHtml(l.id)}</td>` +
      `<td style="padding:8px 12px;border:1px solid #e5e7eb">${escapeHtml(labels[status] || status)}</td></tr>`;
  }).join('');
  const staleNote = ageHours != null && ageHours >= 36
    ? (lang === 'fr'
      ? `<p style="color:#92400e">Observation satellite du ${escapeHtml(observed)} UTC (il y a ${ageHours} h). On t'affiche la dernière mesure disponible, pas une moyenne saisonnière.</p>`
      : `<p style="color:#92400e">Satellite observation from ${escapeHtml(observed)} UTC (${ageHours}h ago). This is the latest available measurement, not a seasonal average.</p>`)
    : '';
  if (lang === 'fr') {
    return {
      subject: `Tes plages aujourd'hui — ${region.label}`,
      unsubUrl,
      html: `${brandHeader('Alerte plage', 'Tes plages aujourd\'hui', region.label)}
        <p>Voici le point du matin pour tes plages suivies en ${escapeHtml(region.label)}.</p>
        <table style="border-collapse:collapse;margin:16px 0">${rows}</table>
        ${staleNote}
        <p>Le pass 30 jours est à ${price}, paiement unique : <a href="${ctaUrl}">voir le pass 30 jours — ${price}</a>.</p>
        <p style="font-size:12px;color:#6b7280">Tu reçois ce mail parce que tu t'es inscrit(e) aux alertes. <a href="${unsubUrl}">Se désabonner</a>.</p>`
    };
  }
  return {
    subject: `Your beaches today — ${region.label}`,
    unsubUrl,
    html: `${brandHeader('Beach alert', 'Your beaches today', region.label)}
      <p>Morning update for the beaches you follow in ${escapeHtml(region.label)}.</p>
      <table style="border-collapse:collapse;margin:16px 0">${rows}</table>
      ${staleNote}
      <p>The 30-day pass is ${price}, one-time: <a href="${ctaUrl}">see the 30-day pass — ${price}</a>.</p>
      <p style="font-size:12px;color:#6b7280">You receive this because you subscribed to alerts. <a href="${unsubUrl}">Unsubscribe</a>.</p>`
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

async function main() {
  console.log(`=== B2C morning alerts === mode=${DO_SEND ? 'SEND' : 'DRY-RUN'}${ONLY_EMAIL ? ' only=' + logId(ONLY_EMAIL) : ''}`);
  if (!SERVICE_KEY) {
    console.log('SUPABASE_SERVICE_KEY absent — no-op.');
    return;
  }
  if (DO_SEND && !mailReady()) {
    console.error('SMTP_PASS missing — cannot send.');
    process.exitCode = 1;
    return;
  }
  const listed = await supabase('/rest/v1/b2c_alerts?status=eq.active&select=id,email,region,domain,beaches,unsubscribe_token,status');
  if (!listed.ok || !Array.isArray(listed.data)) {
    console.error('Failed to load b2c_alerts:', listed.status, String(listed.text || '').slice(0, 160));
    process.exitCode = 1;
    return;
  }
  let sent = 0;
  let skipped = 0;
  let claimed = 0;
  for (const sub of listed.data) {
    if (sent >= MAX_EMAILS) break;
    const email = String(sub.email || '').trim().toLowerCase();
    if (ONLY_EMAIL && email !== ONLY_EMAIL) { skipped++; continue; }
    if (!email.includes('@') || /\s/.test(email)) { skipped++; continue; }
    if (typeof sub.unsubscribe_token !== 'string' || !sub.unsubscribe_token.trim()) { skipped++; continue; }
    const region = resolveRegion(sub);
    if (!region) { skipped++; continue; }
    const domain = String(sub.domain || '').trim().toLowerCase();
    if (domain && domain !== region.domain) { skipped++; continue; }
    let payload;
    try { payload = loadRegionPayload(region.file); } catch { skipped++; continue; }
    if (!payload || payload.source !== 'erddap-live' || !payload.erddapTimestamp) { skipped++; continue; }
    const levels = selectedLevels(sub, payload);
    if (levels.length === 0) { skipped++; continue; }
    const fingerprint = {
      subscriptionId: String(sub.id || '').trim(),
      observationTs: new Date(Date.parse(payload.erddapTimestamp)).toISOString(),
      beachesHash: beachesHash(levels.map((l) => l.id)),
      region: String(sub.region || '').trim().toLowerCase() || region.file
    };
    if (!fingerprint.subscriptionId) { skipped++; continue; }
    if (!DO_SEND) {
      console.log(`  ~ [dry] ${logId(email)} region=${region.file} beaches=${levels.length} observation=${fingerprint.observationTs}`);
      sent++;
      continue;
    }
    const claim = await claimDelivery(fingerprint);
    if (claim.error) {
      console.log(`  ! marker unavailable ${logId(email)}: ${claim.error}`);
      skipped++;
      continue;
    }
    if (!claim.claimed) {
      skipped++;
      continue;
    }
    claimed++;
    const mail = buildEmail(sub, region, payload, levels);
    const result = await sendEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      unsubUrl: mail.unsubUrl,
      trackingId: `b2c_morning:${fingerprint.observationTs.slice(0, 10)}:${logId(email)}`
    });
    if (result.error) {
      console.log(`  ! send failed ${logId(email)}: ${result.error.message || result.error}`);
      await markDelivery(fingerprint, 'failed');
      skipped++;
      continue;
    }
    await markDelivery(fingerprint, 'sent');
    sent++;
    console.log(`  + sent ${logId(email)} region=${region.file}`);
  }
  console.log(`Done. ${DO_SEND ? sent + ' sent' : sent + ' candidate(s) (dry-run)'} · ${skipped} skipped · ${claimed} claimed.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { REGION_CONFIG, beachesHash, resolveRegion, selectedLevels, buildEmail, logId, pass30Price };
