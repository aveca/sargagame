#!/usr/bin/env node
/**
 * widget-install-watch — détecte l'ADOPTION B2B du widget embarquable.
 *
 * Le widget (public/widget/embed) envoie un ping first-party anonyme à /collect.php
 * au 1er render (1×/session) avec le DOMAINE hôte qui l'embarque. stats.php agrège ça
 * dans son bloc `widget` (byHost). Ce script lit ce bloc pour MQ + GP, et dès qu'un
 * NOUVEAU domaine réel apparaît (= un hôtel a collé le widget sur son site), il prévient
 * le fondateur par email. Dédoublonné via un set committé → un domaine n'alerte qu'1×.
 *
 * Le fondateur ne touche à RIEN : tourne dans le pipeline daily (schedule-only).
 *   node scripts/automation/widget-install-watch.cjs          # dry-run (affiche)
 *   node scripts/automation/widget-install-watch.cjs --send   # envoie l'email
 *
 * Clés : env SG_STATS_KEY_MQ / SG_STATS_KEY_GP (CI), sinon scripts/automation/data/stats-keys.json (local).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SEEN_PATH = path.join(__dirname, 'data', 'widget-hosts-seen.json');
const KEYS_PATH = path.join(__dirname, 'data', 'stats-keys.json');
const DO_SEND = process.argv.includes('--send');
const FOUNDER_EMAIL = process.env.WIDGET_ALERT_TO || 'yacovassaraf@gmail.com';
const FROM = 'Sargasses <alerte@sargasses-martinique.com>';

// Hôtes à ignorer : direct (referrer vide), notre propre marqueur de test, nos propres domaines.
const IGNORE = new Set([
  '(direct)', 'selftest.sargasses', 'demo-hotel-exemple.fr', // marqueurs de test (chaîne vérifiée)
  'sargasses-martinique.com', 'sargasses-guadeloupe.com',
  'www.sargasses-martinique.com', 'www.sargasses-guadeloupe.com',
]);

const REGIONS = [
  { id: 'mq', host: 'sargasses-martinique.com', keyEnv: 'SG_STATS_KEY_MQ' },
  { id: 'gp', host: 'sargasses-guadeloupe.com', keyEnv: 'SG_STATS_KEY_GP' },
];

function envVal(n) {
  if (process.env[n]) return process.env[n].trim();
  try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); const m = t.match(new RegExp('^' + n + '=([^\\r\\n]+)', 'm')); return m ? m[1].trim() : null; } catch { return null; }
}
function keyFor(r) {
  if (process.env[r.keyEnv]) return process.env[r.keyEnv].trim();
  try { const k = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')); return k[r.id] || null; } catch { return null; }
}
function loadSeen() {
  try { const j = JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')); return new Set(j.hosts || []); } catch { return new Set(); }
}
function saveSeen(set) {
  fs.mkdirSync(path.dirname(SEEN_PATH), { recursive: true });
  fs.writeFileSync(SEEN_PATH, JSON.stringify({ hosts: [...set].sort(), updatedAt: new Date().toISOString() }, null, 0));
}

async function fetchWidget(r) {
  const key = keyFor(r);
  if (!key) return { region: r.id, hosts: {}, err: 'no-key' };
  try {
    const res = await fetch(`https://${r.host}/stats.php?key=${encodeURIComponent(key)}&days=30`);
    const j = await res.json();
    if (!j || j.error) return { region: r.id, hosts: {}, err: (j && j.error) || 'empty' };
    const w = j.widget || {};
    return { region: r.id, hosts: w.byHost || {}, beaches: w.byBeach || {}, total: w.total || 0 };
  } catch (e) { return { region: r.id, hosts: {}, err: e.message }; }
}

async function main() {
  const seen = loadSeen();
  const results = await Promise.all(REGIONS.map(fetchWidget));
  const newHosts = []; // {host, region, loads}
  for (const r of results) {
    if (r.err) { console.log(`  [${r.region}] ${r.err}`); continue; }
    console.log(`  [${r.region}] ${r.total} loads · ${Object.keys(r.hosts).length} hôtes`);
    for (const [host, loads] of Object.entries(r.hosts)) {
      const h = String(host).toLowerCase();
      if (IGNORE.has(h) || seen.has(h)) continue;
      newHosts.push({ host: h, region: r.region, loads });
    }
  }

  if (!newHosts.length) { console.log('Aucun nouvel hôte. Rien à signaler.'); return; }

  console.log('\n🏨 NOUVEAUX hôtes détectés :');
  newHosts.forEach(n => console.log(`   • ${n.host} (${n.region}, ${n.loads} chargements)`));

  // marque comme vus AVANT l'envoi (anti-spam : pas de double alerte si l'email échoue partiellement)
  newHosts.forEach(n => seen.add(n.host));
  saveSeen(seen);

  if (!DO_SEND) { console.log('\nDRY-RUN. --send pour envoyer l\'email au fondateur.'); return; }

  ;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => { if (!process.env[k]) { const v = envVal(k); if (v) process.env[k] = v } });
  const { sendEmail, mailReady } = require('./lib/email-send.cjs');
  if (!mailReady()) { console.error('SMTP_PASS absent — seen-set mis à jour mais email NON envoyé.'); return; }
  const resend = null;

  const list = newHosts.map(n => `<li><strong>${n.host}</strong> <span style="color:#686868">— ${n.region.toUpperCase()}, ${n.loads} chargement(s)</span></li>`).join('');
  const plural = newHosts.length > 1;
  const subject = plural
    ? `🏨 ${newHosts.length} sites affichent votre widget Sargasses`
    : `🏨 Un site affiche votre widget Sargasses : ${newHosts[0].host}`;
  const html = '<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#0D0D0D">'
    + '<p>Bonne nouvelle — votre widget « conditions en direct » vient d\'apparaître sur un site tiers (un hôtel, une location ou un blog a collé le code sur sa page) :</p>'
    + `<ul>${list}</ul>`
    + '<p>C\'est un signal d\'intérêt B2B concret : ce site vous met sous les yeux de ses visiteurs. Bon moment pour le contacter et lui proposer l\'offre Pro (alertes + widget à sa marque).</p>'
    + '<p style="color:#686868;font-size:13px">Détection automatique via le ping d\'install first-party · une alerte par domaine.</p></div>';

  try {
    const { data, error } = await sendEmail(resend, {
      from: FROM, to: FOUNDER_EMAIL, subject,
      html, preheader: 'Un site tiers affiche votre widget — signal d\'intérêt B2B.',
      replyTo: 'contact@sargasses-martinique.com',
    });
    if (error) console.error('❌ email:', error.message || JSON.stringify(error));
    else console.log('✅ alerte envoyée au fondateur · id', data && data.id);
  } catch (e) { console.error('❌ email:', e.message); }
}

main().catch(e => { console.error(e); process.exit(1); });
