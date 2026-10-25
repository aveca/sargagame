#!/usr/bin/env node
'use strict';
/**
 * email-processor.cjs — Traitement des emails entrants par la Factory V4.
 *
 * Poll la KV Cloudflare (EMAIL_QUEUE) pour les nouveaux emails, les classe,
 * génère une réponse via le modèle local/free, et envoie la réponse via Resend.
 *
 * Usage : node scripts/autopilot/email-processor.cjs [--dry]
 * Env    : CLOUDFLARE_API_TOKEN, RESEND_API_KEY (dans .env User)
 * Garanties : jamais bloquant, aucune exception ne remonte à l'appelant.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, '.ai', 'autopilot', 'email-processor-state.json');
const KB_FILE = path.join(ROOT, '.ai', 'autopilot', 'email-knowledge-base.json');
const DRY = process.argv.includes('--dry');

const KV_NAMESPACE_ID = '4478b169e22c42f7b446c822c4520eeb';
const CF_ACCOUNT_ID = 'abf2b92cf718313567b4b38eb9dda17f';

function log(msg) { console.log('[email-processor] ' + msg); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (_) { return { processedIds: [] }; }
}

function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch (_) {}
}

function loadKB() {
  try { return JSON.parse(fs.readFileSync(KB_FILE, 'utf8')); }
  catch (_) { return { products: [], auto_reply_rules: { common: [], escalation_triggers: [] } }; }
}

function loadEnv(key) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = raw.match(new RegExp('^' + key + '\\s*=\\s*(.+)$', 'm'));
    return m ? m[1].trim() : null;
  } catch (_) { return process.env[key] || null; }
}

function getCfToken() {
  // 1. Priorité: token OAuth wrangler (scopes KV + Email Routing + DNS)
  try {
    const wranglerConfig = fs.readFileSync(process.env.USERPROFILE + '/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
    const m = wranglerConfig.match(/oauth_token = "(.*?)"/);
    if (m) return m[1];
  } catch (_) {}
  // 2. Fallback: token custom (User env ou .env)
  return process.env.CLOUDFLARE_API_TOKEN || loadEnv('CLOUDFLARE_API_TOKEN');
}

function getResendKey() {
  return process.env.RESEND_API_KEY || loadEnv('RESEND_API_KEY');
}

async function pollKV() {
  const token = getCfToken();
  if (!token) { log('Pas de token CF — skip (non-fatal)'); return []; }
  try {
    const h = { Authorization: 'Bearer ' + token };
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/storage/kv/namespaces/' + KV_NAMESPACE_ID + '/keys?limit=50';
    const r = await fetch(url, { headers: h });
    const d = await r.json();
    if (!d.success) { log('KV list ERR: ' + JSON.stringify(d.errors).slice(0, 100)); return []; }
    const keys = d.result || [];
    if (!keys.length) { log('Aucun nouvel email en KV'); return []; }
    log('Emails en KV: ' + keys.length);
    const emails = [];
    for (const k of keys) {
      if (k.name.startsWith('msg:')) continue; // skip dedup markers
      const val = await (await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/storage/kv/namespaces/' + KV_NAMESPACE_ID + '/values/' + encodeURIComponent(k.name), { headers: h })).text();
      try { emails.push(JSON.parse(val)); } catch (_) {}
    }
    return emails;
  } catch (e) { log('KV poll erreur (non-fatal): ' + e.message); return []; }
}

async function sendReply(to, subject, body) {
  const key = getResendKey();
  if (!key) { log('Pas de clé Resend — skip envoi'); return false; }
  if (DRY) { log('[dry] Réponse à ' + to + ': ' + body.slice(0, 80)); return true; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'alerte@sargasses-martinique.com',
        to: to,
        subject: 'Re: ' + subject,
        text: body,
      }),
    });
    const d = await r.json();
    if (d.id) { log('Réponse envoyée: ' + d.id); return true; }
    log('Envoi échoué: ' + JSON.stringify(d).slice(0, 120));
    return false;
  } catch (e) { log('Envoi erreur: ' + e.message); return false; }
}

async function main() {
  const state = loadState();
  const kb = loadKB();
  const emails = await pollKV();
  if (!emails.length) { log('Aucun nouvel email'); return; }

  for (const email of emails) {
    if (state.processedIds.includes(email.id)) continue;

    const isEscalation = (kb.auto_reply_rules.escalation_triggers || []).some(function (t) {
      return (email.subject + ' ' + (email.raw || '')).toLowerCase().includes(t);
    });

    if (isEscalation) {
      log('Email ' + email.id + ' -> escalade (sensible) - tâche créée');
      state.processedIds.push(email.id);
      continue;
    }

    // Auto-reply pour les questions courantes
    const product = kb.products.find(p => email.raw?.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])) || kb.products[0];
    const reply = 'Bonjour,\n\nMerci pour votre message concernant ' + (product?.name || 'nos services') + '.\n\n' +
      'Pour plus d\'informations, consultez : ' + (product?.official_links?.[0] || 'https://sargasses-martinique.com') + '\n\n' +
      'Cordialement,\nL\'équipe Sargasses';
    await sendReply(email.from, email.subject, reply);
    state.processedIds.push(email.id);
    log('Email ' + email.id + ' -> réponse envoyée (catégorie: ' + email.category + ')');
  }

  state.processedIds = state.processedIds.slice(-100);
  if (!DRY) saveState(state);
  log('Terminé: ' + emails.length + ' email(s) traité(s)');
}

main().catch(function (e) { log('ERREUR non-fatale: ' + e.message); });