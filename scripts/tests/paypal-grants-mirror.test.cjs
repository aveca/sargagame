#!/usr/bin/env node
/**
 * paypal-grants-mirror.test.cjs — Test G3 (mirror grants PayPal → Supabase).
 *
 * Contexte : avant G3, les grants PayPal ne vivaient que dans des fichiers
 * (pass one-time : rien côté serveur ; abos : api/data/paypal-subs/*.json).
 * Ce test verrouille le mirror vers public.payment_grants.
 *
 * Partie A — audits de source (convention repo pour le PHP) :
 *  1. paypal.php require le helper + mirror aux 3 points (capture_order,
 *     confirm_subscription, lookup fallback).
 *  2. verify_subscription garde le check PayPal LIVE comme seul juge (le
 *     mirror ne sert qu'à retrouver le mapping).
 *  3. webhook : ACTIVATED mirror, CANCELLED/EXPIRED expire, SALE.COMPLETED
 *     prolonge, CAPTURE.* explicitement ignoré (anti-doublon), 200 AVANT mirror.
 *  4. forward Apps Script intact (aucun flux existant modifié).
 *  5. Lignes mirror = colonnes du schéma payment_grants UNIQUEMENT (parse
 *     supabase/schema.sql — 'island'/'status' top-level = 400 PostgREST).
 *  6. Gardes skip-sans-clé AVANT tout appel curl (best-effort, jamais de 500).
 *
 * Partie B — runtime PHP réel (php CLI, SANS curl, SANS secrets) :
 *  7. pp_pass_days : p30=30, trip7=7, season=210, inconnu=30.
 *  8. pp_b2c_pass_row / pp_sub_row : forme exacte, durées, préfixe pp_,
 *     metadata.provider=paypal, expiry math à $now fixé.
 *  9. pp_supabase_cfg : retourne {url, key} (forme, jamais de valeur loggée).
 *
 * Aucun appel réseau, aucune écriture prod. Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

function schemaColumns() {
  const sql = read('supabase/schema.sql')
  const m = sql.match(/create table if not exists public\.payment_grants \(([\s\S]*?)\n\);/)
  if (!m) return null
  return m[1].split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => /^[a-z_]+$/.test(c))
}

function rowKeys(helper, fn) {
  const m = helper.match(new RegExp(`function ${fn}[\\s\\S]*?return \\[([\\s\\S]*?)\\];`))
  if (!m) return null
  const top = m[1].replace(/'metadata'\s*=>\s*\[[^\]]*\]/, "'metadata' => []")
  return [...top.matchAll(/'([a-z_]+)'\s*=>/g)].map((x) => x[1])
}

function guardBeforeCurl(helper, fn) {
  const m = helper.match(new RegExp(`function ${fn}[\\s\\S]*?\\n\\}`))
  if (!m) return false
  const body = m[0]
  const guard = body.indexOf("if (!$cfg['key']) return true;")
  const altGuard = body.indexOf("if (!$cfg['key']) return null;")
  const curl = body.indexOf('curl_init')
  const g = guard !== -1 ? guard : altGuard
  return g !== -1 && (curl === -1 || g < curl)
}

async function runPhpHarness() {
  const helper = path.join(ROOT, 'public', 'api', 'pp-supabase-mirror.php')
  const harness = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ppg3-')), 'h.cjs')
  void harness
  const phpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ppg3php-')), 'h.php')
  const php = `<?php
require ${JSON.stringify(helper)};
$fail = 0;
function chk($c, $l) { global $fail; echo ($c ? '  ✓ ' : '  ✗ ') . $l . "\\n"; if (!$c) $fail++; }
// durées (même map que mol_b2c_pass_grant)
chk(pp_pass_days('p30') === 30, "pp_pass_days p30=30");
chk(pp_pass_days('trip7') === 7, "pp_pass_days trip7=7");
chk(pp_pass_days('season') === 210, "pp_pass_days season=210");
chk(pp_pass_days('xyz') === 30, "pp_pass_days inconnu=30");
// ligne one-time à $now fixé
$now = 1787000000;
$r = pp_b2c_pass_row('ORD1', 'trip7', 'a@b.c', 'eur', 'mq', 'card', 799, $now);
chk($r['payment_id'] === 'pp_ORD1', 'one-time payment_id pp_ préfixé');
chk($r['type'] === 'b2c_pass' && $r['pass'] === 'trip7', 'one-time type/pass');
chk($r['email'] === 'a@b.c' && $r['currency'] === 'EUR', 'one-time email/currency upper');
chk($r['expires_at'] === date('c', $now + 7 * 86400), 'one-time expires +7j');
chk($r['granted_at'] === date('c', $now), 'one-time granted_at');
chk(($r['metadata']['provider'] ?? '') === 'paypal' && ($r['metadata']['island'] ?? '') === 'mq', 'one-time metadata provider/island');
chk(!array_key_exists('island', $r) && !array_key_exists('status', $r), 'one-time SANS island/status top-level');
// ligne abo monthly/annual
$m = pp_sub_row('I-ABC', 'monthly', 'a@b.c', 'gp', $now);
chk($m['subscription_id'] === 'I-ABC' && $m['plan'] === 'pp_monthly', 'sub monthly plan/id');
chk($m['expires_at'] === date('c', $now + 30 * 86400), 'sub monthly +30j');
$a = pp_sub_row('I-ABC', 'annual', 'a@b.c', 'gp', $now);
chk($a['plan'] === 'pp_annual' && $a['expires_at'] === date('c', $now + 365 * 86400), 'sub annual +365j');
// config : forme {url, key} — valeurs jamais affichées
$c = pp_supabase_cfg();
chk(is_array($c) && array_key_exists('url', $c) && array_key_exists('key', $c), 'pp_supabase_cfg forme {url,key}');
chk(strpos($c['url'], 'https://') === 0, 'pp_supabase_cfg url https');
echo $fail === 0 ? "PHP-HARNESS ALL PASS\\n" : "PHP-HARNESS $fail FAIL\\n";
exit($fail ? 1 : 0);
`;
  fs.writeFileSync(phpFile, php)
  const env = { ...process.env }
  delete env.SUPABASE_SERVICE_KEY
  delete env.SUPABASE_URL
  return new Promise((resolve) => {
    execFile('php', [phpFile], { env, encoding: 'utf8', timeout: 60000 }, (err, stdout, stderr) => {
      try { fs.rmSync(path.dirname(phpFile), { recursive: true, force: true }) } catch {}
      resolve({ exit: err ? 1 : 0, out: (stdout || '') + (stderr || '') })
    })
  })
}

async function main() {
  console.log('Partie A : audits de source')
  const pp = read('public/api/paypal.php')
  const wh = read('public/api/paypal-webhook.php')
  const helper = read('public/api/pp-supabase-mirror.php')

  ok(pp.includes("require_once __DIR__ . '/pp-supabase-mirror.php'"), 'paypal.php require le helper G3')
  ok(/capture_order[\s\S]*?pp_mirror_grant\(pp_b2c_pass_row\(/.test(pp), 'capture_order mirror le pass one-time')
  ok(/confirm_subscription[\s\S]*?pp_mirror_grant\(pp_sub_row\(/.test(pp), 'confirm_subscription mirror abo actif')
  ok(pp.includes('pp_find_sub_by_email($email)'), 'pp_lookup_sub fallback Supabase')
  ok(pp.includes("pp_api('GET', '/v1/billing/subscriptions/'"), 'verify_subscription garde le check PayPal LIVE')
  ok((pp.match(/pp_forward_fulfillment\(/g) || []).length >= 2, 'forward Apps Script intact (capture + confirm)')

  ok(wh.includes("require_once __DIR__ . '/pp-supabase-mirror.php'"), 'webhook require le helper G3')
  ok(wh.includes('BILLING.SUBSCRIPTION.ACTIVATED') && wh.includes('pp_mirror_grant(pp_sub_row('), 'webhook ACTIVATED mirror')
  ok(wh.includes('pp_expire_sub_mirror($ppSubId)'), 'webhook CANCELLED/EXPIRED expire la ligne')
  ok(wh.includes("pp_extend_sub_mirror($ppAgreement, 30)"), 'webhook SALE.COMPLETED prolonge 30j')
  ok(/CAPTURE\.\* → RIEN/.test(wh), 'webhook CAPTURE.* explicitement ignoré (anti-doublon)')
  const echoPos = wh.indexOf("echo json_encode(['received' => true]);")
  const mirrorPos = wh.indexOf('pp_mirror_grant(pp_sub_row(')
  ok(echoPos !== -1 && mirrorPos !== -1 && echoPos < mirrorPos, 'webhook répond 200 AVANT tout mirror')

  const cols = schemaColumns()
  ok(Array.isArray(cols) && cols.includes('payment_id') && cols.includes('subscription_id'), 'schéma payment_grants parsé')
  for (const fn of ['pp_b2c_pass_row', 'pp_sub_row']) {
    const keys = rowKeys(helper, fn)
    const bad = (keys || []).filter((k) => !cols.includes(k))
    ok(keys && keys.length > 0 && bad.length === 0, `${fn} colonnes schéma uniquement${bad.length ? ' (ILLÉGALES: ' + bad.join(',') + ')' : ''}`)
  }
  ok(helper.includes('/rest/v1/payment_grants'), 'helper POST la table payment_grants')
  for (const fn of ['pp_mirror_grant', 'pp_find_sub_by_email', 'pp_expire_sub_mirror', 'pp_extend_sub_mirror']) {
    ok(guardBeforeCurl(helper, fn), `${fn} garde skip-sans-clé AVANT curl`)
  }
  ok(helper.includes("mollie-config.php"), 'helper réutilise les creds Supabase existants (zéro nouveau secret)')

  console.log('Partie B : runtime PHP réel (sans curl, sans secrets)')
  const r = await runPhpHarness()
  console.log(r.out.trim().split('\n').map((l) => '  ' + l).join('\n'))
  ok(r.exit === 0, 'harness PHP exit 0')

  console.log(failures === 0 ? '\nPAYPAL-GRANTS-MIRROR TESTS: ALL PASS' : `\nPAYPAL-GRANTS-MIRROR TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
})
