#!/usr/bin/env node
/**
 * One-shot FTP uploader for public/api/stripe-config.php → both sites.
 * Used during the "go public" migration to push rotated Stripe/Resend keys
 * without rebuilding the whole site. Reads creds from env (passed inline).
 */
const { Client } = require("basic-ftp");
const path = require("path");

const LOCAL_FILE = path.join(__dirname, "..", "public", "api", "stripe-config.php");
const REMOTE_PATH = "api/stripe-config.php";

const targets = [
  {
    label: "Martinique",
    host: process.env.FTP_HOST_MQ,
    user: process.env.FTP_USER_MQ,
    pass: process.env.FTP_PASS_MQ,
  },
  {
    label: "Guadeloupe",
    host: process.env.FTP_HOST_GP,
    user: process.env.FTP_USER_GP,
    pass: process.env.FTP_PASS_GP,
  },
];

async function uploadOne(t) {
  const client = new Client(undefined, 30000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: t.host,
      user: t.user,
      password: t.pass,
      secure: true,
      secureOptions: { rejectUnauthorized: false },
    });
    await client.ensureDir("api");
    await client.cd("/");
    await client.uploadFrom(LOCAL_FILE, REMOTE_PATH);
    console.log(`[${t.label}] ✓ stripe-config.php uploaded`);
  } finally {
    client.close();
  }
}

(async () => {
  for (const t of targets) {
    if (!t.host || !t.user || !t.pass) {
      console.error(`[${t.label}] missing env vars, skipping`);
      process.exitCode = 1;
      continue;
    }
    try {
      await uploadOne(t);
    } catch (err) {
      console.error(`[${t.label}] FAILED:`, err.message);
      process.exitCode = 1;
    }
  }
})();
