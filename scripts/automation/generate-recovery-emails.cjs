#!/usr/bin/env node
/**
 * generate-recovery-emails.cjs - Generateur d'emails de relance pour paiements echoues
 * 
 * Genere des emails personnalises pour relancer les clients avec paiements echoues.
 * Les emails sont sauvegardes dans recovery-emails/ au format .eml (pret a copier-coller).
 * 
 * Usage:
 *   node generate-recovery-emails.cjs          # Genere tous les emails
 *   node generate-recovery-emails.cjs --send   # Genere et envoie (si SMTP configure)
 *   node generate-recovery-emails.cjs --test   # Mode test (affiche sans sauvegarder)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Liste des clients avec paiements echoues
const FAILED_PAYMENTS = [
  {
    email: 'egoursaud@wanadoo.fr',
    name: 'E. Goursaud',
    region: 'martinique',
    domain: 'sargasses-martinique.com',
    lang: 'fr',
    attemptCount: 2,
    amount: '14,99',
    currency: 'EUR',
    trackingId: `payment_retry:${new Date().toISOString().split('T')[0]}:${Math.random().toString(36).substr(2, 8)}`,
  },
  {
    email: 'jcroulier@gmail.com',
    name: 'J. Croulier',
    region: 'guadeloupe',
    domain: 'sargasses-guadeloupe.com',
    lang: 'fr',
    attemptCount: 2,
    amount: '14,99',
    currency: 'EUR',
    trackingId: `payment_retry:${new Date().toISOString().split('T')[0]}:${Math.random().toString(36).substr(2, 8)}`,
    isReturning: true,
  },
  {
    email: 'hamitchell62@gmail.com',
    name: 'H. Mitchell',
    region: 'puntacana',
    domain: 'sargassumpuntacana.com',
    lang: 'en',
    attemptCount: 2,
    amount: '$14.99',
    currency: 'USD',
    trackingId: `payment_retry:${new Date().toISOString().split('T')[0]}:${Math.random().toString(36).substr(2, 8)}`,
  },
];

// Templates d'emails
const TEMPLATES = {
  fr: {
    subject: 'Petit contretemps sur ton paiement',
    header: {
      title: 'Le Veilleur',
      subtitle: 'Ton acces est presque pret',
    },
    body: (name, attemptCount) => `
      <p>Bonjour ${name},</p>
      <p>On a vu que ta carte n'a pas passe a ${attemptCount > 1 ? 'deux reprises' : 'la premiere tentative'}. Pas d'inquietude - c'est souvent un refus temporaire de la banque.</p>
      <p>Tu peux reessayer avec une autre carte, ou utiliser Apple Pay / Google Pay directement depuis notre page :</p>
    `,
    cta: 'Finaliser mon achat',
    footer: 'Une question ? Reponds simplement a cet email.',
  },
  en: {
    subject: 'Small issue with your payment',
    header: {
      title: 'The Watchman',
      subtitle: 'Your access is almost ready',
    },
    body: (name, attemptCount) => `
      <p>Hello ${name},</p>
      <p>We noticed your card was declined ${attemptCount > 1 ? 'twice' : 'on the first attempt'}. Don't worry - this is often a temporary bank decline.</p>
      <p>You can try again with a different card, or use Apple Pay / Google Pay directly from our page:</p>
    `,
    cta: 'Complete my purchase',
    footer: 'Have a question? Simply reply to this email.',
  },
  es: {
    subject: 'Pequeño problema con tu pago',
    header: {
      title: 'El Vigia',
      subtitle: 'Tu acceso esta casi listo',
    },
    body: (name, attemptCount) => `
      <p>Hola ${name},</p>
      <p>Vimos que tu tarjeta no paso ${attemptCount > 1 ? 'en dos ocasiones' : 'en el primer intento'}. No te preocupes - suele ser un rechazo temporal del banco.</p>
      <p>Puedes intentar de nuevo con otra tarjeta, o usar Apple Pay / Google Pay directamente desde nuestra pagina:</p>
    `,
    cta: 'Completar mi compra',
    footer: 'Tienes una pregunta? Simplemente responde a este correo.',
  },
};

// Generer le HTML de l'email
function generateEmailHTML(payment, template) {
  const { email, name, domain, amount, currency, trackingId } = payment;
  const lang = payment.lang || 'fr';
  const t = TEMPLATES[lang] || TEMPLATES.fr;
  
  const safeName = name || email.split('@')[0];
  const displayAmount = amount ? `${amount} ${currency}` : '14,99 EUR';
  
  // Pour les clients recurrent
  const body = payment.isReturning
    ? t.body(safeName, payment.attemptCount).replace(
        /Pas d'inqui/, 'Ravi de te revoir ! Pas d\''
      )
    : t.body(safeName, payment.attemptCount);
  
  return `From: "${t.header.title}" <alerte@${domain}>
To: <${email}>
Subject: ${t.subject}
MIME-Version: 1.0
Content-Type: text/html; charset="UTF-8"
X-Tracking: ${trackingId}

<div style="background:linear-gradient(135deg,#FFC72C,#FFB347);padding:20px 24px;border-radius:12px 12px 0 0;text-align:center">
    <img src="https://${domain}/veilleur-logo-120.png" alt="${t.header.title}" style="width:60px;height:60px;border-radius:50%;border:3px solid #fff">
    <h1 style="margin:12px 0 4px;font-size:22px;color:#0d1117;font-weight:700">${t.header.title}</h1>
    <p style="margin:0;font-size:14px;color:#0d1117;opacity:.85">${t.header.subtitle}</p>
  </div>
  <div style="padding:30px 24px;font-size:15px;line-height:1.6;color:#1a1a1a">
    ${body}
    <a href="https://${domain}/?paywall=1&utm_source=email&utm_medium=payment_retry&tracking=${trackingId}" style="display:inline-block;background:#FFC72C;color:#0d1117;font-size:16px;font-weight:700;padding:14px 32px;border-radius:40px;text-decoration:none;margin:6px 0 20px">${t.cta} -></a>
    <p style="margin:18px 0 0;font-size:13px;color:#666">${t.footer}</p>
    <p style="margin:18px 0 0;font-size:11px;color:#999">Tracking: ${trackingId}</p>
  </div>
`;
}

// Sauvegarder l'email dans un fichier
function saveEmail(email, content) {
  const outputDir = path.join(__dirname, '..', '..', 'recovery-emails');
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Nettoyer le nom de fichier (remplacer @ par _at_)
  const safeFilename = email.replace(/@/g, '_at_').replace(/\./g, '_dot_') + '.eml';
  const filePath = path.join(outputDir, safeFilename);
  
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Fonction principale
async function main() {
  const args = process.argv.slice(2);
  const sendMode = args.includes('--send');
  const testMode = args.includes('--test');
  
  console.log('Generating recovery emails...');
  console.log(`Mode: ${testMode ? 'TEST' : sendMode ? 'SEND' : 'SAVE'}`);
  console.log('');
  
  for (const payment of FAILED_PAYMENTS) {
    const template = TEMPLATES[payment.lang] || TEMPLATES.fr;
    const html = generateEmailHTML(payment, template);
    
    if (testMode) {
      console.log(`--- Email for ${payment.email} ---`);
      console.log(html);
      console.log('');
    } else {
      const filePath = saveEmail(payment.email, html);
      console.log(`Generated: ${filePath}`);
    }
  }
  
  if (!testMode && !sendMode) {
    console.log('');
    console.log('All emails are ready in recovery-emails/');
    console.log('To send: copy-paste the content into your email client');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
