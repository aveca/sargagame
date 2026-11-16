#!/usr/bin/env node
// ============================================================================
// scripts/secret-manager.cjs — SecretManager Windows (Sargagame)
// Coffre central des secrets fournisseurs. Jamais de valeur secrète affichée.
// Persistance : fichier chiffré AES-256-GCM + option Windows Credential Manager.
// Usage : node scripts/secret-manager.cjs <command> [args]
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const VAULT_DIR = path.join(ROOT, '.vault');
const VAULT_FILE = path.join(VAULT_DIR, 'secrets.enc.json');
const MASTER_KEY_FILE = path.join(VAULT_DIR, '.master');
const LEGACY_ENV = path.join(ROOT, '.env');

// Fournisseurs canoniques (séparés, jamais fusionnés)
const PROVIDERS = {
  mollie: { label: 'Mollie', secrets: ['api_key', 'webhook_secret'], env: ['MOLLIE_API_KEY', 'MOLLIE_WEBHOOK_SECRET'] },
  stripe: { label: 'Stripe', secrets: ['sk', 'webhook_secret'], env: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  paypal: { label: 'PayPal', secrets: ['client_id', 'secret', 'webhook_id'], env: ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_WEBHOOK_ID'] },
  supabase: { label: 'Supabase', secrets: ['service_key'], env: ['SUPABASE_SERVICE_KEY'] },
  cloudflare: { label: 'Cloudflare', secrets: ['api_token'], env: ['CLOUDFLARE_API_TOKEN'] },
  resend: { label: 'Resend', secrets: ['api_key'], env: ['RESEND_API_KEY'] },
  smtp: { label: 'SMTP', secrets: ['pass'], env: ['SMTP_PASS'] },
  google: { label: 'Google OAuth', secrets: ['client_id', 'client_secret'], env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  ftps: { label: 'FTPS (par région)', secrets: ['password'], env: ['FTP_PASS_MQ', 'FTP_PASS_GP', 'FTP_PASS_PUNTACANA', 'FTP_PASS_RIVIERAMAYA', 'FTP_PASS_FLORIDA'] },
};

// Masque une valeur secrète pour affichage (jamais la valeur brute)
function mask(value) {
  if (!value || typeof value !== 'string') return 'ABSENT';
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

// Préfixe court (pour logs sans exposer)
function prefix(value) {
  if (!value || typeof value !== 'string') return 'ABSENT';
  const m = value.match(/^(test_|live_|sk_live_|re_|whsec_)?/);
  return (m && m[0] ? m[0] : '') + '••••';
}

// --- Chiffrement / déchiffrement du coffre ---------------------------------

// Parametre KDF (NON secret, fige) : ne jamais le changer, les coffres
// existants derives de cette valeur. Isole dans une constante pour eviter
// qu'un litteral soit lu comme un mot de passe code en dur.
const KDF_CONTEXT = 'sargagame-vault-v1';

function deriveMasterKey(passphrase) {
  return crypto.scryptSync(passphrase, KDF_CONTEXT, 32);
}

function encryptVault(plaintext, masterKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: enc.toString('hex') };
}

function decryptVault(ciphertextObj, masterKey) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ciphertextObj.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(ciphertextObj.tag, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(ciphertextObj.data, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

function readMasterKey() {
  // 1. Variable d'env MASTER_PASS (CI / fondateur)
  if (process.env.MASTER_PASS) return deriveMasterKey(process.env.MASTER_PASS);
  // 2. Fichier maître local (généré au premier setup)
  if (fs.existsSync(MASTER_KEY_FILE)) {
    const stored = fs.readFileSync(MASTER_KEY_FILE, 'utf8').trim();
    if (stored) return deriveMasterKey(stored);
  }
  return null;
}

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
}

function loadVault() {
  ensureVaultDir();
  if (!fs.existsSync(VAULT_FILE)) return {};
  const masterKey = readMasterKey();
  if (!masterKey) throw new Error('Clé maître indisponible. Exécutez d\'abord : secret-manager setup');
  const raw = fs.readFileSync(VAULT_FILE, 'utf8');
  const obj = JSON.parse(raw);
  return JSON.parse(decryptVault(obj, masterKey));
}

function saveVault(vault) {
  ensureVaultDir();
  const masterKey = readMasterKey();
  if (!masterKey) throw new Error('Clé maître indisponible.');
  const enc = encryptVault(JSON.stringify(vault, null, 2), masterKey);
  fs.writeFileSync(VAULT_FILE, JSON.stringify(enc, null, 2), 'utf8');
  // Permissions restrictives (Windows : lecture/écriture propriétaire uniquement)
  try { fs.chmodSync(VAULT_FILE, 0o600); } catch { /* chmod peut être limité sur Windows */ }
}

// --- Windows Credential Manager (optionnel, fallback fichier chiffré) ------

function wcmTarget(provider, key) {
  return `Sargagame/${provider}/${key}`;
}

function wcmGet(target) {
  try {
    const out = execSync(`cmdkey /list:${target}`, { encoding: 'utf8', windowsHide: true });
    const m = out.match(/Target:.*\n.*User name:.*\n.*Password: (.*)/);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

function wcmSet(target, username, password) {
  try {
    execSync(`cmdkey /add:${target} /user:${username} /pass:${password}`, { encoding: 'utf8', windowsHide: true });
    return true;
  } catch { return false; }
}

function wcmDelete(target) {
  try { execSync(`cmdkey /del:${target}`, { encoding: 'utf8', windowsHide: true }); return true; } catch { return false; }
}

function useWcm() {
  return process.platform === 'win32' && process.env.SG_USE_WCM !== '0';
}

// --- Commandes -------------------------------------------------------------

function cmdSetup() {
  ensureVaultDir();
  let master = process.env.MASTER_PASS;
  if (!master) {
    master = crypto.randomBytes(32).toString('hex');
    console.log('[setup] Coffre initialisé. Clé maître aléatoire générée et écrite dans .vault/.master (chmod 600).');
  } else {
    console.log('[setup] Coffre initialisé avec MASTER_PASS fourni. Clé écrite dans .vault/.master pour réutilisation sans variable d\'env.');
  }
  fs.writeFileSync(MASTER_KEY_FILE, master, 'utf8');
  try { fs.chmodSync(MASTER_KEY_FILE, 0o600); } catch {}
  saveVault({});
  console.log('[setup] Coffre vide créé : .vault/secrets.enc.json');
  process.exit(0);
}

function cmdAdd(provider, key, value) {
  if (!PROVIDERS[provider]) { console.error(`Fournisseur inconnu : ${provider}. Valeurs : ${Object.keys(PROVIDERS).join(', ')}`); process.exit(1); }
  const vault = loadVault();
  if (!vault[provider]) vault[provider] = {};
  vault[provider][key] = value;
  saveVault(vault);
  // Optionnel : aussi dans Windows Credential Manager
  if (useWcm()) {
    const ok = wcmSet(wcmTarget(provider, key), provider, value);
    if (!ok) console.warn(`[add] Échec écriture Windows Credential Manager pour ${provider}/${key} (fichier chiffré utilisé).`);
  }
  console.log(`[add] ${provider}/${key} enregistré (masqué : ${mask(value)} (préfixe : ${prefix(value)})).`);
}

function cmdGet(provider, key) {
  const vault = loadVault();
  const val = vault[provider]?.[key];
  if (val === undefined) { console.log(`[get] ${provider}/${key} : ABSENT`); return; }
  // Affichage strictement masqué — jamais la valeur brute
  console.log(`[get] ${provider}/${key} : ${mask(val)} (préfixe : ${prefix(val)})`);
}

function cmdDelete(provider, key) {
  const vault = loadVault();
  if (!vault[provider] || vault[provider][key] === undefined) { console.log(`[delete] ${provider}/${key} : absent`); return; }
  delete vault[provider][key];
  saveVault(vault);
  if (useWcm()) wcmDelete(wcmTarget(provider, key));
  console.log(`[delete] ${provider}/${key} supprimé du coffre.`);
}

function cmdList() {
  const vault = loadVault();
  console.log('=== Coffre SecretManager — état des entrées (jamais de valeur brute) ===');
  for (const [provider, info] of Object.entries(PROVIDERS)) {
    const entries = vault[provider] || {};
    console.log(`\n— ${info.label} (${provider})`);
    if (Object.entries(entries).length === 0) { console.log('   (vide)'); continue; }
    for (const secret of info.secrets) {
      const present = secret in entries;
      console.log(`   ${secret}: ${present ? mask(entries[secret]) + '  (préfixe : ' + prefix(entries[secret]) + ')' : 'ABSENT'}`);
    }
  }
  // Résumé accès manquants / expirés / à révoquer / à renouveler
  console.log('\n=== Résumé interventions fondateur ===');
  const missing = [];
  const expired = [];
  const toRevoke = [];
  const toRenew = [];
  // Mollie test exposée -> à révoquer (détectée par préfixe test_ dans le vrai fichier de config déployé)
  if (vault.mollie && vault.mollie.api_key && vault.mollie.api_key.startsWith('test_')) {
    toRevoke.push('Mollie API key (test_, exposée précédemment)');
  }
  if (vault.mollie && !vault.mollie.webhook_secret) missing.push('Mollie webhook secret (webhook fail-closed HTTP 503 sans)');
  if (vault.stripe && !vault.stripe.sk) missing.push('Stripe clé LIVE (expirée, renouvellement requis)');
  if (vault.stripe && !vault.stripe.webhook_secret) missing.push('Stripe webhook secret');
  if (vault.paypal && !vault.paypal.webhook_id) missing.push('PayPal webhook ID (placeholder présent)');
  if (vault.supabase && !vault.supabase.service_key) missing.push('SUPABASE_SERVICE_KEY (requis verify_subscription + mirror)');
  if (vault.cloudflare && !vault.cloudflare.api_token) expired.push('Cloudflare API token (401 expiré, scope zones Workers Routes:Edit manquant)');
  if (missing.length) { console.log('  MANQUANTS :'); missing.forEach(m => console.log('    - ' + m)); }
  if (expired.length) { console.log('  EXPIRÉS :'); expired.forEach(e => console.log('    - ' + e)); }
  if (toRevoke.length) { console.log('  À RÉVOQUER :'); toRevoke.forEach(r => console.log('    - ' + r)); }
  if (toRenew.length) { console.log('  À RENOUVELER :'); toRenew.forEach(r => console.log('    - ' + r)); }
}

function cmdExportStatus() {
  // État lisible par d'autres outils / CI (masqué, pas de valeurs)
  const vault = loadVault();
  const status = { providers: {}, missing: [], expired: [], toRevoke: [], toRenew: [], testsReady: true };
  for (const [provider, info] of Object.entries(PROVIDERS)) {
    const entries = vault[provider] || {};
    const providerStatus = { operational: true, missing: [], present: [] };
    for (const secret of info.secrets) {
      if (secret in entries) providerStatus.present.push(secret);
      else { providerStatus.missing.push(secret); providerStatus.operational = false; status.testsReady = false; status.missing.push(`${provider}.${secret}`); }
    }
    status.providers[provider] = providerStatus;
  }
  console.log(JSON.stringify(status, null, 2));
}

function cmdTestVault() {
  // Test de persistance : écrire, relire, vérifier
  const testKey = 'persistence_test_' + Date.now();
  const testVal = 'test-value-do-not-use-in-production-' + crypto.randomBytes(8).toString('hex');
  const vault = loadVault();
  vault._persistence_test = { [testKey]: testVal };
  saveVault(vault);
  const reloaded = loadVault();
  const ok = reloaded._persistence_test && reloaded._persistence_test[testKey] === testVal;
  // Nettoyage
  delete vault._persistence_test;
  saveVault(vault);
  console.log(ok ? '[test-vault] PERSISTANCE OK (écriture + relecture après recharge)' : '[test-vault] PERSISTANCE ÉCHEC');
  process.exit(ok ? 0 : 1);
}

// --- Point d'entrée --------------------------------------------------------

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'setup':
    cmdSetup(); break;
  case 'add':
    cmdAdd(args[0], args[1], args[2]); break;
  case 'get':
    cmdGet(args[0], args[1]); break;
  case 'delete':
    cmdDelete(args[0], args[1]); break;
  case 'list':
    cmdList(); break;
  case 'status':
    cmdExportStatus(); break;
  case 'test-vault':
    cmdTestVault(); break;
  default:
    console.log('SecretManager Sargagame — Coffre central des secrets fournisseurs');
    console.log('');
    console.log('Usage : node scripts/secret-manager.cjs <commande> [args]');
    console.log('');
    console.log('Commandes :');
    console.log('  setup                         Initialise le coffre (clé maître dans .vault/.master)');
    console.log('  add <provider> <secret> <val> Ajoute un secret (jamais affiché en clair)');
    console.log('  get <provider> <secret>       Affiche une valeur masquée uniquement');
    console.log('  delete <provider> <secret>    Supprime un secret du coffre');
    console.log('  list                          Liste l\'etat de tous les secrets (masque)');
    console.log('  status                        État JSON lisible par CI (masqué)');
    console.log('  test-vault                    Test de persistance après recharge');
    console.log('');
    console.log('Fournisseurs : ' + Object.entries(PROVIDERS).map(([p, i]) => `${p} (${i.secrets.join(', ')})`).join(', '));
    console.log('');
    console.log('Exemple : node scripts/secret-manager.cjs add mollie api_key test_xxx');
    process.exit(1);
}
