#!/usr/bin/env node
/**
 * Drip B2B Follow-up Script
 * Query Supabase for new leads older than 1 hour
 * Send email via Resend
 * Update lead status to 'contacted'
 */

const { createClient } = require('@supabase/supabase-js');

// Config from environment
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_KEY environment variable');
  process.exit(1);
}

if (!RESEND_API_KEY) {
  console.error('❌ Missing RESEND_API_KEY environment variable');
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendEmail(to, subject, html) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Sargasses Pro <alerte@sargasses-martinique.com>',
        to: [to],
        subject: subject,
        html: html,
      }),
    });
    return true;
  } catch (e) {
    console.error(`❌ Failed to send email to ${to}:`, e.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Querying b2b_leads for new leads > 1 hour old...');

  const { data: leads, error } = await supa
    .from('b2b_leads')
    .select('*')
    .eq('status', 'new')
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if (error) {
    console.error('❌ Supabase query error:', error);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('ℹ️ No new leads to process.');
    process.exit(0);
  }

  console.log(`📧 Found ${leads.length} leads to process.`);

  for (const lead of leads) {
    const { email, region, name, island } = lead;
    const reg = region || 'Martinique';
    const plan = 'brief_monthly'; // default plan

    // Determine plan based on region or lead data
    const planLabels = {
      mq: 'brief_monthly',
      gp: 'brief_monthly',
      florida: 'brief_monthly',
      puntacana: 'brief_monthly',
      rivieramaya: 'brief_monthly',
    };

    const planKey = planLabels[island || 'mq'] || 'brief_monthly';
    const planAmount = planKey === 'brief_monthly' ? 29 : 79;
    const regName = reg === 'mq' ? 'Martinique' : reg === 'gp' ? 'Guadeloupe' : reg;

    const subject = `Alerte sargassum pour ${regName} — statut actuel`;

    const html = `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;padding:40px 20px;color:#1a1a1a">
        <h2 style="margin:0 0 20px;color:#0D1E1C">Alerte sargassum pour ${regName}</h2>
        <p>Bonjour ${name || 'Professionnel'},</p>
        <p>Voici le statut actuel des sargasses pour ${regName} :</p>
        <p>Un nouveau lead B2B a été détecté dans votre région. Notre système de surveillance satellite détecte actuellement ${lead.status || 'une présence'}</sargassum> sur vos plages.</p>
        <p>Nous vous invitons à découvrir nos offres professionnelles :</p>
        <div style="text-align:center;margin:30px 0">
          <a href="https://sargasses-${regName.toLowerCase()}.com/b2b" 
             style="display:inline-block;background:linear-gradient(135deg,#FFC72C,#E8A800);color:#0D1E1C;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:16px">
            Choisir mon plan →
          </a>
        </div>
        <p>Notre équipe est disponible pour répondre à vos questions et vous aider à choisir le plan adapté à vos besoins.</p>
        <p>Cordialement,<br/>L'équipe SargaGame</p>
      </div>
    `;

    // Send email
    const sent = await sendEmail(email, subject, html);

    // Update status to 'contacted'
    await supa
      .from('b2b_leads')
      .update({ status: 'contacted' })
      .eq('id', lead.id);

    if (sent) {
      console.log(`✅ Email sent to ${email}, status updated to 'contacted'`);
    } else {
      console.warn(`⚠️ Email failed for ${email}, status still updated to 'contacted'`);
    }
  }

  console.log('✅ Drip follow-up completed.');
}

main().catch(e => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});