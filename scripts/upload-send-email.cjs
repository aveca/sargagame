#!/usr/bin/env node
// Upload send-email.php via FTPS to each Namecheap cPanel domain root
const { Client } = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const { loadProjectEnv } = require('./lib/load-project-env.cjs');
loadProjectEnv();

const file = path.join(__dirname, '..', 'send-email.php');
if (!fs.existsSync(file)) { console.error('send-email.php missing'); process.exit(1); }

const targets = [
  { id: 'MQ', host: process.env.FTP_HOST_MQ, user: process.env.FTP_USER_MQ, pass: process.env.FTP_PASS_MQ },
  { id: 'GP', host: process.env.FTP_HOST_GP, user: process.env.FTP_USER_GP, pass: process.env.FTP_PASS_GP },
  { id: 'FLORIDA', host: process.env.FTP_HOST_FLORIDA, user: process.env.FTP_USER_FLORIDA, pass: process.env.FTP_PASS_FLORIDA },
  { id: 'PUNTACANA', host: process.env.FTP_HOST_PUNTACANA, user: process.env.FTP_USER_PUNTACANA, pass: process.env.FTP_PASS_PUNTACANA },
  { id: 'RIVIERAMAYA', host: process.env.FTP_HOST_RIVIERAMAYA, user: process.env.FTP_USER_RIVIERAMAYA, pass: process.env.FTP_PASS_RIVIERAMAYA },
];

async function uploadOne(t) {
  if (!t.host || !t.user || !t.pass) { console.log(`[${t.id}] skip — missing creds`); return 'skipped'; }
  const client = new Client(60000);
  client.ftp.verbose = false;
  try {
    await client.access({ host: t.host, user: t.user, password: t.pass, secure: true, secureOptions: { rejectUnauthorized: false } });
    await client.uploadFrom(file, 'send-email.php');
    console.log(`[${t.id}] send-email.php ✓ uploaded to ${t.host} as ${t.user}`);
    client.close();
    return true;
  } catch (e) {
    console.error(`[${t.id}] FAILED: ${e.message}`);
    try { client.close(); } catch {}
    return false;
  }
}

(async () => {
  const results = [];
  for (const t of targets) {
    const r = await uploadOne(t);
    results.push({ id: t.id, ok: r });
  }
  const ok = results.filter(r => r.ok === true).length;
  console.log(`\nUpload done: ${ok}/${targets.length} succeeded (skipped excluded)`);
  if (ok === 0) console.log('Note: cPanel mail() will be unavailable until uploaded; fallback providers will handle email.');
})();
