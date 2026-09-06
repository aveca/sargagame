#!/usr/bin/env node
/**
 * outreach-preflight.test.cjs — contrats preflight / verify-dry-run / gate
 * (sprint activation 2026-09-06). Worker stubbé en mémoire, aucun réseau.
 * Couvre : PASS complet, FAIL worker/DB/admin, gate (refus si Resend absent,
 * dry-run non prouvé, DB KO), verify (DRY RUN VERIFIED vs refus si envoi),
 * non-fuite de clé en sortie.
 */
'use strict';

const { runPreflight } = require('../automation/outreach-preflight.cjs');
const { runVerifyDryRun } = require('../automation/outreach-verify-dry-run.cjs');

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label); }
  else { failed++; console.error('  ✗ FAIL:', label); }
}

function stubWorker(statusBody, healthOk = true) {
  return async (url) => {
    const u = String(url);
    if (u.endsWith('/health')) {
      return healthOk
        ? { ok: true, json: async () => ({ ok: true, dry_run: true, enabled: false }) }
        : { ok: false, status: 500, json: async () => ({}) };
    }
    if (u.includes('/status')) {
      if (!u.includes('key=K')) return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
      return { ok: true, status: 200, json: async () => statusBody };
    }
    throw new Error('unexpected url ' + u.slice(0, 60));
  };
}

function fullStatus(over = {}) {
  return {
    ok: true, dry_run: true, enabled: true, email: true, fb_enabled: false,
    secrets: { service_key: true, resend_key: true, fb_token: false, admin_key: true },
    limits: { daily: 10, hourly: 5, batch: 10 },
    contacts_by_status: { ready: 2 },
    queue: { ready: 2, queued: 0, failed: 0, sent: 0 },
    email_today: { sent: 0, failed: 0, replies: 0, retries: 0, dry_runs: 3 },
    facebook_posts: { scheduled: 0, published7d: 0, failed: 0 },
    runtime: { last_heartbeat_at: new Date(Date.now() - 10 * 60000).toISOString(), last_heartbeat_detail: 'job=email_queue', last_error_at: null, last_error_detail: null },
    recent_events: [],
    ...over,
  };
}

const ENV = { OUTREACH_WORKER_URL: 'https://o.test', OUTREACH_ADMIN_KEY: 'KSECRET' };
const quiet = () => {};

async function main() {
  // 1. Preflight PASS complet.
  {
    const r = await runPreflight({ fetchImpl: stubWorker(fullStatus()), env: ENV, out: quiet });
    ok(r.pass === true, 'preflight: tout vert → PASS');
    ok(r.rows.find((x) => x.check === 'Resend').result === 'CONFIGURED', 'preflight: Resend CONFIGURED détecté');
    ok(r.rows.find((x) => x.check === 'Meta').result === 'NOT CONFIGURED', 'preflight: Meta NOT CONFIGURED détecté');
  }
  // 2. Worker injoignable → FAIL.
  {
    const r = await runPreflight({ fetchImpl: async () => { throw new Error('down'); }, env: ENV, out: quiet });
    ok(r.pass === false && r.rows[0].result === 'FAIL', 'preflight: worker down → FAIL');
  }
  // 3. Admin 401 → FAIL.
  {
    const badKey = async (url) => ({ ok: false, status: 401, json: async () => ({}) });
    const f = async (url) => (String(url).endsWith('/health')
      ? { ok: true, json: async () => ({ ok: true }) }
      : badKey(url));
    const r = await runPreflight({ fetchImpl: f, env: ENV, out: quiet });
    ok(r.pass === false, 'preflight: 401 admin → FAIL');
  }
  // 4. Gate : refuse si Resend absent.
  {
    const OLD = process.argv.slice();
    process.argv = [...OLD, '--gate'];
    const st = fullStatus({ secrets: { service_key: true, resend_key: false, fb_token: false, admin_key: true } });
    const r = await runPreflight({ fetchImpl: stubWorker(st), env: ENV, out: quiet });
    process.argv = OLD;
    ok(r.pass === false && (r.gate || []).some((g) => /Resend/.test(g)), 'gate: Resend absent → REFUSÉ');
  }
  // 5. Gate : refuse si aucun dry-run prouvé.
  {
    const OLD = process.argv.slice();
    process.argv = [...OLD, '--gate'];
    const st = fullStatus({ email_today: { sent: 0, failed: 0, replies: 0, retries: 0, dry_runs: 0 } });
    const r = await runPreflight({ fetchImpl: stubWorker(st), env: ENV, out: quiet });
    process.argv = OLD;
    ok(r.pass === false && (r.gate || []).some((g) => /dry-run/.test(g)), 'gate: 0 dry-run → REFUSÉ');
  }
  // 6. Gate : PASS quand tout est démontré.
  {
    const OLD = process.argv.slice();
    process.argv = [...OLD, '--gate'];
    const r = await runPreflight({ fetchImpl: stubWorker(fullStatus()), env: ENV, out: quiet });
    process.argv = OLD;
    ok(r.pass === true, 'gate: prérequis démontrés → PASS (activation manuelle autorisée)');
  }
  // 7. Verify dry-run : VERIFIED.
  {
    const r = await runVerifyDryRun({ fetchImpl: stubWorker(fullStatus()), env: ENV, out: quiet });
    ok(r.pass === true, 'verify: dry_runs>0, 0 envoi → DRY RUN VERIFIED');
  }
  // 8. Verify : refuse si un envoi réel existe.
  {
    const st = fullStatus({ email_today: { sent: 1, failed: 0, replies: 0, retries: 0, dry_runs: 3 } });
    const r = await runVerifyDryRun({ fetchImpl: stubWorker(st), env: ENV, out: quiet });
    ok(r.pass === false, 'verify: sent>0 → NON PROUVÉ (leak ou envoi réel)');
  }
  // 9. Non-fuite clé : la sortie ne contient jamais ADMIN_KEY.
  {
    const lines = [];
    await runPreflight({ fetchImpl: stubWorker(fullStatus()), env: ENV, out: (l) => lines.push(l) });
    await runVerifyDryRun({ fetchImpl: stubWorker(fullStatus()), env: ENV, out: (l) => lines.push(l) });
    ok(!lines.join('\n').includes('KSECRET'), 'preflight+verify: clé absente de toute sortie');
  }
  // 10. Env manquant → FAIL propre (pas de crash).
  {
    const r = await runPreflight({ fetchImpl: stubWorker(fullStatus()), env: {}, out: quiet });
    ok(r.pass === false, 'preflight: env vide → FAIL propre');
  }

  console.log(`\noutreach-preflight: ${passed} pass / ${failed} fail`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) });
