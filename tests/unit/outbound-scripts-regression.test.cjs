#!/usr/bin/env node
/**
 * outbound-scripts-regression.test.cjs — régression au niveau des SCRIPTS
 * (mission P0.23 / #1157).
 *
 * Principe vérifié, script par script, dans un processus enfant réel :
 *
 *   S1  Aucun script sortant n'effectue d'écriture EXTERNE quand il n'est pas
 *       autorisé. Le mock réseau (`tests/helpers/outbound-network-mock.cjs`)
 *       tue le processus (exit 99) au premier appel mutant — filet de sécurité
 *       indépendant du code du script.
 *
 *   S2  La PRÉSENCE DES SECRETS ne suffit JAMAIS : le même script est rejoué
 *       avec SMTP_PASS / SUPABASE_SERVICE_KEY / ONESIGNAL_* / MOLLIE_API_KEY /
 *       APPS_SCRIPT_URL / GITHUB_TOKEN renseignés, sur un déclencheur
 * AUTOMATIQUE (`schedule`) : toujours zéro écriture externe.
 *       (Corrige le défaut « clé de prod dans l'env = danger » de la PR #1200.)
 *
 *   S3  Une DEMANDE explicite sans preuve (`--send`, `--purge`, `--apply`)
 *       reste en simulation : elle n'ouvre aucun droit.
 *
 *   S4  `require()` d'un script sortant n'a AUCUN effet réseau (garde
 *       `require.main === module`) — les tests peuvent charger les modules sans
 *       déclencer d'envoi.
 *
 * Aucun réseau réel : le mock remplace fetch, nodemailer, basic-ftp et
 * ssh2-sftp-client. Aucun secret réel n'est utilisé (valeurs factices).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MOCK = path.join(ROOT, 'tests', 'helpers', 'outbound-network-mock.cjs');
const AUT = path.join(ROOT, 'scripts', 'automation');

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

// ── Environnement : JAMAIS de secret réel, jamais de jeton d'approbation ──────
/** Secrets FACTICES : leur présence ne doit RIEN autoriser (preuve S2). */
const FAKE_SECRETS = {
  SMTP_PASS: 'faketest-not-a-real-password',
  SUPABASE_URL: 'https://fake-project.supabase.co',
  SUPABASE_SERVICE_KEY: 'faketest-not-a-real-service-key',
  SUPABASE_ANON_KEY: 'faketest-not-a-real-anon-key',
  ONESIGNAL_APP_ID: 'fake-app-id',
  ONESIGNAL_REST_API_KEY: 'faketest-not-a-real-rest-key',
  MOLLIE_API_KEY: 'test_faketestNotARealKey',
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/FAKE/exec',
  GITHUB_TOKEN: 'ghs_faketestNotARealToken',
  GITHUB_REPOSITORY: 'aveca/sargagame',
  DEPLOY_TOKEN: 'faketest-not-a-real-deploy-token',
  FTP_HOST: 'ftp.invalid',
  FTP_USER: 'faketest',
  FTP_PASSWORD: 'faketest-not-a-real-password',
  FTP_SECURE: 'false',
  GOOGLE_SERVICE_ACCOUNT_JSON: '{"type":"service_account","project_id":"fake"}',
};

/** Environnement enfant déterministe : on repart d'une base propre. */
function childEnv(extra) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: os.tmpdir(),
    HOME: process.env.USERPROFILE || process.env.HOME,
    NODE_PATH: path.join(ROOT, 'node_modules'),
    // Déclencheur AUTOMATIQUE : aucun workflow planifié ne peut produire d'envoi.
    GITHUB_EVENT_NAME: 'schedule',
    GITHUB_REPOSITORY: 'aveca/sargagame',
    GITHUB_REF_NAME: 'main',
    // Aucun jeton d'approbation : la preuve manque donc l'opération est désactivée.
    OUTBOUND_APPROVAL_TOKEN: '',
    OUTBOUND_MOCK_FAIL_ON_WRITE: '1',
  };
  return Object.assign(env, extra || {});
}

/**
 * Exécute un script dans un enfant avec le mock réseau.
 * @returns {{ok:boolean, exit:number, log:string, mutated:string[], reason:string, stdout:string}}
 */
function runScript(script, args, envExtra, logFile) {
  const res = spawnSync(process.execPath, ['--require', MOCK, path.join(AUT, script)].concat(args || []), {
    cwd: ROOT,
    env: childEnv(Object.assign({ OUTBOUND_MOCK_LOG: logFile }, envExtra || {})),
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = (res.stdout || '') + (res.stderr || '');
  const mutated = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => {
        try { return JSON.parse(l); } catch (_) { return null; }
      }).filter(Boolean).filter((e) => e.kind !== 'fetch' || !['GET', 'HEAD'].includes(e.method))
    : [];
  const violation = stdout.indexOf('MOCK_VIOLATION') >= 0;
  return { ok: res.status === 99 || violation ? false : true, exit: res.status, mutated, violation, stdout };
}

// ── Scénarios : script, arguments, environnement ─────────────────────────────
const SCENARIOS = [
  // [libellé, script, args, avec secrets factices ?]
  ['purge-analytics sans argument (défaut simulation)', 'purge-analytics.cjs', [], false],
  ['purge-analytics --purge (demande réelle SANS preuve)', 'purge-analytics.cjs', ['--purge'], true],
  ['purge-analytics --purge sur planificateur', 'purge-analytics.cjs', ['--purge'], false],
  ['incident-apology (planificateur)', 'incident-apology.cjs', [], true],
  ['notify-new-photos (planificateur)', 'notify-new-photos.cjs', [], true],
  ['notify-new-reports (planificateur)', 'notify-new-reports.cjs', [], true],
  ['auto-outreach (planificateur)', 'auto-outreach.cjs', [], true],
  ['b2b-outreach (planificateur)', 'b2b-outreach.cjs', [], true],
  ['push-winback (planificateur)', 'push-winback.cjs', [], true],
  ['deliverability-watch (planificateur)', 'deliverability-watch.cjs', [], true],
  ['factory-heartbeat-watch (planificateur)', 'factory-heartbeat-watch.cjs', [], true],
  ['revenue-watch (planificateur)', 'revenue-watch.cjs', [], true],
  ['ux-watch (planificateur)', 'ux-watch.cjs', [], true],
  ['send-notifications (planificateur)', 'send-notifications.cjs', [], true],
  ['drip-email --daily-only (planificateur)', 'drip-email.cjs', ['--daily-only'], true],
  ['email-weekend (planificateur)', 'email-weekend.cjs', [], true],
  ['notify-failure (planificateur)', 'notify-failure.cjs', [], true],
  ['seo-outreach-curated (planificateur)', 'seo-outreach-curated.cjs', [], true],
  ['beached-calibrate --write (planificateur)', 'beached-calibrate.cjs', ['--write'], true],
  ['beached-calibrate --send (demande réelle SANS preuve)', 'beached-calibrate.cjs', ['--send'], true],
  ['user-journey-notify --send (demande réelle SANS preuve)', 'user-journey-notify.cjs', ['--send'], true],
  ['auto-moderate-photos (planificateur)', 'auto-moderate-photos.cjs', [], true],
  ['auto-moderate-reports (planificateur)', 'auto-moderate-reports.cjs', [], true],
  ['smtp-selftest (dispatch manuel SANS jeton)', 'smtp-selftest.cjs', [], true],
  ['support-reply (dispatch manuel SANS jeton)', 'support-reply.cjs', [], true],
  ['relance-gap-leads --send (demande réelle SANS preuve)', 'relance-gap-leads.cjs', ['--send'], true],
  ['revoke-pass (dispatch manuel SANS jeton)', 'revoke-pass.cjs', [], true],
  ['apply-supabase-schema sans argument (défaut simulation)', 'apply-supabase-schema.cjs', [], true],
  ['register-ga4-dimensions (dispatch manuel SANS jeton)', 'register-ga4-dimensions.cjs', [], true],
  ['trigger-production-deploy (planificateur)', 'trigger-production-deploy.cjs', [], true],
  ['appscript-cleanup (planificateur)', 'appscript-cleanup.cjs', [], true],
];

/**
 * Auto-nettoyage (mission P0.23 / #1157) : les scripts journalisent leur
 * simulation dans `scripts/automation/data/` (chemins résolus via `__dirname`,
 * donc DANS le repo). Un test ne doit jamais laisser l'arbre de travail sale :
 * on photographie l'état local avant la campagne et on le restaure ensuite,
 * suppressions comprises.
 */
const LOCAL_STATE_DIRS = [
  path.join(ROOT, 'scripts', 'automation', 'data'),
  path.join(ROOT, 'scripts', 'automation', 'data', 'seo-growth'),
];
const LOCAL_STATE_FILES = [
  path.join(ROOT, 'user-journey-report.json'),
  path.join(ROOT, 'user-journey-notification.json'),
];

function collectLocalFiles() {
  const out = [];
  const stack = LOCAL_STATE_DIRS.slice();
  const seen = new Set();
  while (stack.length) {
    const dir = stack.pop();
    if (seen.has(dir)) continue;
    seen.add(dir);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(fp);
      else out.push(fp);
    }
  }
  for (const f of LOCAL_STATE_FILES) if (fs.existsSync(f)) out.push(f);
  return out;
}

function snapshotLocalState() {
  const snap = new Map();
  for (const fp of collectLocalFiles()) {
    try { snap.set(fp, fs.readFileSync(fp)); } catch (_) { /* fichier volatil : ignoré */ }
  }
  return snap;
}

function restoreLocalState(snap) {
  for (const fp of collectLocalFiles()) {
    if (!snap.has(fp)) {
      try { fs.rmSync(fp); } catch (_) { /* déjà absent */ }
      continue;
    }
    const before = snap.get(fp);
    try {
      if (!fs.readFileSync(fp).equals(before)) fs.writeFileSync(fp, before);
    } catch (_) { /* fichier volatil : ignoré */ }
  }
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'outbound-reg-'));

  console.log('\nS1-S3 — zéro écriture externe en simulation / sans preuve :');

  for (let i = 0; i < SCENARIOS.length; i++) {
    const [label, script, args, withSecrets] = SCENARIOS[i];
    const log = path.join(tmp, `log-${i}.jsonl`);
    const res = runScript(script, args, withSecrets ? FAKE_SECRETS : null, log);
    const detail = [
      `exit=${res.exit}`,
      `ecritures=${res.mutated.length}`,
      res.mutated.length ? res.mutated.map((m) => `${m.kind}:${m.method}:${m.target.slice(0, 60)}`).join(' | ') : '',
    ].filter(Boolean).join(' ');
    record(`${label} => 0 écriture externe`, res.ok && res.mutated.length === 0, detail);
  }

  // S3 (renforcé) : même AVEC un jeton d'approbation FAUX, un déclencheur
  // automatique reste en simulation. Le secret présent ne prouve rien, et un
  // jeton recyclé hors Environment protégé non plus.
  {
    const log = path.join(tmp, 'log-token-schedule.jsonl');
    const res = runScript('push-winback.cjs', [], Object.assign({}, FAKE_SECRETS, {
      OUTBOUND_APPROVAL_TOKEN: 'sgappr_' + 'faketesttoken1234',
    }), log);
    record('S3b jeton factice + planificateur => 0 écriture externe', res.ok && res.mutated.length === 0, `exit=${res.exit}`);
  }

  // S2 (renforcé) : scénario « toutes les clés de production » réunies.
  {
    const log = path.join(tmp, 'log-all-keys.jsonl');
    const res = runScript('send-notifications.cjs', [], Object.assign({}, FAKE_SECRETS, {
      OUTBOUND_APPROVAL_TOKEN: 'sgappr_' + 'faketesttoken1234',
      DRY_RUN: '0',
    }), log);
    record('S2b clés complètes + DRY_RUN=0 + jeton factice => 0 écriture externe',
      res.ok && res.mutated.length === 0, `exit=${res.exit}`);
  }

  // ── S4 — import pur : require() ne déclenche aucun appel réseau ────────────
  console.log('\nS4 — `require()` d\'un script sortant = zéro appel réseau :');
  const MISSION_SCRIPTS = SCENARIOS
    .map((s) => s[1])
    .filter((v, i, a) => a.indexOf(v) === i);
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('appel réseau interdit à l\'import'); };
  try {
    for (const s of MISSION_SCRIPTS) {
      const p = path.join(AUT, s);
      if (!fs.existsSync(p)) continue;
      const before = fetchCalls;
      let imported = false;
      let err = null;
      try {
        require(p);
        imported = true;
      } catch (e) {
        err = e && e.message ? e.message : String(e);
      }
      record(`import ${s} => 0 appel réseau`, imported && fetchCalls === before,
        err || `fetch=${fetchCalls - before}`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }

  // ── Garde systématique : aucun script sortant sans `require.main` ──────────
  console.log('\nS4b — garde `require.main === module` sur chaque script :');
  for (const s of MISSION_SCRIPTS) {
    const p = path.join(AUT, s);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    record(`${s} protégé contre l'exécution à l'import`,
      /require\.main\s*===\s*module/.test(src));
  }

  // ── Autorisation présente AVANT chaque effet externe ──────────────────────
  console.log('\nS5 — chaque script sortant consomme le contrat central :');
  for (const s of MISSION_SCRIPTS) {
    const p = path.join(AUT, s);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const hasContract = /authorizeAction|assertEmailSendAllowed|assertPushSendAllowed|assertOutreachAllowed|assertAnalyticsDeleteAllowed|assertExternalWriteAllowed|assertAppsScriptCleanupAllowed/.test(src);
    record(`${s} passe par scripts/lib/outbound-authorization.cjs`, hasContract);
  }

  console.log(failures === 0
    ? '\nOUTBOUND_SCRIPTS_REGRESSION PASS'
    : `\nOUTBOUND_SCRIPTS_REGRESSION FAIL (${failures})`);
}

// `main()` appelle process.exit() dans certains scripts enfants, mais PAS ici :
// on restaure l'état local AVANT de sortir, sinon le test polluerait le repo.
const LOCAL_SNAPSHOT = snapshotLocalState();
try {
  main();
} finally {
  restoreLocalState(LOCAL_SNAPSHOT);
}
process.exit(failures === 0 ? 0 : 1);
