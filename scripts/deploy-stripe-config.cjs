#!/usr/bin/env node
/**
 * One-shot FTP uploader pour les fichiers Stripe de public/api/ → les sites.
 * Historique : poussait uniquement stripe-config.php (rotation de clés "go
 * public"). Étendu (Phase 4 webhook) : pousse aussi stripe-webhook.php et
 * api/data/.htaccess (marqueurs d'idempotence + logs non servis par HTTP)
 * vers Martinique, Guadeloupe et Punta Cana, sans rebuilder le site.
 * Reads creds from env or racine/.env (mêmes noms que les secrets GitHub).
 */
const { Client } = require("basic-ftp");
const fs = require("fs");
const path = require("path");
const { loadProjectEnv } = require("./lib/load-project-env.cjs");

loadProjectEnv();

const API_DIR = path.join(__dirname, "..", "public", "api");

// optional: true → absent en local = on saute (stripe-config.php est gitignoré,
// présent uniquement sur les postes qui détiennent les clés).
const FILES = [
  { local: path.join(API_DIR, "stripe-config.php"), remote: "api/stripe-config.php", optional: true },
  { local: path.join(API_DIR, "stripe-webhook.php"), remote: "api/stripe-webhook.php" },
  { local: path.join(API_DIR, "data", ".htaccess"), remote: "api/data/.htaccess" },
];

// optional: true → creds absents = skip sans erreur (hébergement pas encore
// provisionné). MQ/GP restent obligatoires (prod live).
const targets = [
  {
    label: "Martinique",
    host: process.env.FTP_HOST_MQ || process.env.FTP_SERVER_MQ,
    user: process.env.FTP_USER_MQ || process.env.FTP_USERNAME_MQ,
    pass: process.env.FTP_PASS_MQ || process.env.FTP_PASSWORD_MQ,
  },
  {
    label: "Guadeloupe",
    host: process.env.FTP_HOST_GP || process.env.FTP_SERVER_GP,
    user: process.env.FTP_USER_GP || process.env.FTP_USERNAME_GP,
    pass: process.env.FTP_PASS_GP || process.env.FTP_PASSWORD_GP,
  },
  {
    label: "Punta Cana",
    host: process.env.FTP_HOST_PUNTACANA || process.env.FTP_SERVER_PUNTACANA,
    user: process.env.FTP_USER_PUNTACANA || process.env.FTP_USERNAME_PUNTACANA,
    pass: process.env.FTP_PASS_PUNTACANA || process.env.FTP_PASSWORD_PUNTACANA,
    optional: true,
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
    for (const f of FILES) {
      if (!fs.existsSync(f.local)) {
        if (f.optional) {
          console.log(`[${t.label}] ~ ${path.basename(f.local)} absent en local, sauté`);
          continue;
        }
        throw new Error(`fichier local manquant: ${f.local}`);
      }
      await client.ensureDir(path.posix.dirname(f.remote));
      await client.cd("/");
      await client.uploadFrom(f.local, f.remote);
      console.log(`[${t.label}] ✓ ${f.remote} uploaded`);
    }
  } finally {
    client.close();
  }
}

(async () => {
  for (const t of targets) {
    if (!t.host || !t.user || !t.pass) {
      if (t.optional) {
        console.log(`[${t.label}] ~ pas de creds FTP (FTP_HOST_PUNTACANA…), cible sautée`);
        continue;
      }
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
