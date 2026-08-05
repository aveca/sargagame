#!/usr/bin/env node
/**
 * cart-recovery-j3.cjs — J+3 Cart Recovery Email (Retention Agent)
 * Usage: node scripts/automation/cart-recovery-j3.cjs [--dry] [--day=1|3|5]
 * 
 * J+3 = "Dernier rappel : ton pass 30j à 12,99€ expire" — urgence douce, preuve fiabilité
 * Condition: pas de conversion J+1, pas d'email J+3 déjà envoyé (sg_cart_recovery_j3_sent)
 * Merge J+1/J+3/J+5 via --day param (future-proof)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createTransport } = require('nodemailer');

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');
const DAY = (() => {
  const m = process.argv.find(a => a.startsWith('--day='));
  return m ? parseInt(m.split('=')[1], 10) : 3;
})();

const DAY_CONFIG = {
  1: { subject: 'Ton pass 30j à 12,99€ t\'attend encore 🌊', tone: 'doux', marker: 'sg_cart_recovery_j1_sent', templateFile: 'cart-recovery-j1-template.md' },
  3: { subject: 'Dernier rappel : ton pass 30j à 12,99€ expire', tone: 'urgence_douce', marker: 'sg_cart_recovery_j3_sent', templateFile: 'cart-recovery-j3-template.md' },
  5: { subject: 'Dernière chance : ton pass 30j à 12,99€ expire demain', tone: 'urgence_finale', marker: 'sg_cart_recovery_j5_sent', templateFile: 'cart-recovery-j5-template.md' }
};

const CFG = DAY_CONFIG[DAY] || DAY_CONFIG[3];
const MARKER = CFG.marker;
const SUBJECT = CFG.subject;
const TONE = CFG.tone;
const TEMPLATE_FILE = path.join(ROOT, 'scripts', 'automation', CFG.templateFile);

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER || 'alerte@sargasses-martinique.com';
const SMTP_PASS = process.env.SMTP_PASS;
const FROM = `"Le Veilleur • Sargasses" <${SMTP_USER}>`;

const SENT_LOG = path.join(ROOT, 'scripts', 'automation', 'data', `cart-recovery-j${DAY}-sent.json`);
const ABANDONED_LOG = path.join(ROOT, 'scripts', 'automation', 'data', 'abandoned-checkouts.json');

const FIABILITE_URL = 'https://sargasses-martinique.com/fiabilite/';
const PASS_URL = 'https://sargasses-martinique.com/#pass';
const UNSUB_URL = 'https://sargasses-martinique.com/unsubscribe/';

function loadJSON(p, fallback = []) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}
function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function loadTemplate() {
  try {
    return fs.readFileSync(TEMPLATE_FILE, 'utf-8');
  } catch {
    return `{{#if tone_urgence_douce}}
Dernier rappel : ton pass 30j à 12,99€ expire bientôt.

Tu as regardé les plages, tu as vu le verdict. Le pass 30 jours à 12,99€ t'attend encore — mais plus pour longtemps.

On publie notre fiabilité sur {{fiabilite_url}} : 76-79% selon la saison, mesuré au satellite, pas deviné. C'est la seule prévision qui publie ses erreurs.

{{cta}}

Si tu changes d'avis, on sera là. La mer, elle, n'attend pas.
{{/if}}`;
  }
}

function renderTemplate(tpl, ctx) {
  return tpl
    .replace(/{{fiabilite_url}}/g, ctx.fiabiliteUrl)
    .replace(/{{pass_url}}/g, ctx.passUrl)
    .replace(/{{unsub_url}}/g, ctx.unsubUrl)
    .replace(/{{tone_urgence_douce}}/g, ctx.tone === 'urgence_douce')
    .replace(/{{tone_urgence_finale}}/g, ctx.tone === 'urgence_finale')
    .replace(/{{tone_doux}}/g, ctx.tone === 'doux')
    .replace(/{{cta}}/g, `<p style="text-align:center;margin:24px 0;"><a href="${ctx.passUrl}" style="background:#FFC72C;color:#0d1117;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-family:Bricolage Grotesque,sans-serif;display:inline-block;">Activer mon pass 30j — 12,99€</a></p>`);
}

async function sendEmail(to, subject, html) {
  if (DRY) {
    console.log(`[DRY] → ${to} | ${subject}`);
    return { accepted: [to] };
  }
  const transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter.sendMail({ from: FROM, to, subject, html });
}

async function main() {
  console.log(`[cart-recovery-j${DAY}] ${DRY ? '[DRY] ' : ''}start`);

  if (!SMTP_PASS) {
    console.error('SMTP_PASS manquant');
    process.exit(1);
  }

  const abandoned = loadJSON(ABANDONED_LOG);
  const sentLog = loadJSON(SENT_LOG);
  const sentEmails = new Set(sentLog.map(e => e.email));
  const template = loadTemplate();

  let sent = 0;
  let skipped = 0;

  for (const cart of abandoned) {
    const email = cart.email?.toLowerCase().trim();
    if (!email) continue;

    if (sentEmails.has(email)) {
      skipped++;
      continue;
    }

    const localMarker = `sg_cart_recovery_j${DAY}_sent`;
    if (cart[localMarker]) {
      skipped++;
      continue;
    }

    if (DAY > 1) {
      const prevMarker = `sg_cart_recovery_j${DAY - 1}_sent`;
      if (!cart[prevMarker]) {
        skipped++;
        continue;
      }
    }

    const html = renderTemplate(template, {
      fiabiliteUrl: FIABILITE_URL,
      passUrl: PASS_URL,
      unsubUrl: UNSUB_URL,
      tone: TONE
    });

    try {
      await sendEmail(email, SUBJECT, html);
      sentLog.push({ email, date: new Date().toISOString(), day: DAY, subject: SUBJECT });
      cart[localMarker] = true;
      sent++;
      console.log(`[cart-recovery-j${DAY}] sent → ${email}`);
    } catch (e) {
      console.error(`[cart-recovery-j${DAY}] ERROR ${email}:`, e.message);
    }
  }

  saveJSON(SENT_LOG, sentLog);
  saveJSON(ABANDONED_LOG, abandoned);

  console.log(`[cart-recovery-j${DAY}] done: sent=${sent}, skipped=${skipped}, total=${abandoned.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });