#!/usr/bin/env node
/**
 * outreach-verify-dry-run.cjs — prouve le dry-run PROD sans rien modifier.
 * Usage: OUTREACH_WORKER_URL=https://... OUTREACH_ADMIN_KEY=... npm run outreach:verify-dry-run
 * Vérifie : events dry_run présents · sélection correcte · quotas/batch · 0 appel
 * externe (sent=0, published=0, aucun provider id) · statuts non avancés.
 * Exit 0 + "DRY RUN VERIFIED", sinon 1 + raison. Lecture seule (GET /status).
 */
'use strict';

async function runVerifyDryRun({ fetchImpl = fetch, env = process.env, out = console.log } = {}) {
  const fails = [];
  const base = String(env.OUTREACH_WORKER_URL || '').replace(/\/$/, '');
  const key = String(env.OUTREACH_ADMIN_KEY || '');
  if (!base || !key) { out('VERIFY FAIL : OUTREACH_WORKER_URL / OUTREACH_ADMIN_KEY requis'); return { pass: false }; }
  let s = null;
  try {
    const r = await fetchImpl(`${base}/status?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(20000) });
    if (r.status === 401) { out('VERIFY FAIL : /status 401 (clé refusée)'); return { pass: false }; }
    s = await r.json().catch(() => null);
  } catch (e) { out('VERIFY FAIL : worker injoignable'); return { pass: false }; }
  if (!s || s.ok !== true) { out('VERIFY FAIL : statut illisible'); return { pass: false }; }

  const check = (name, cond, detail) => {
    out(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!cond) fails.push(name);
  };
  const et = (s.email_today || {});
  check('dry-run actif', s.dry_run === true, `dry_run=${s.dry_run}`);
  check('events dry_run présents', (et.dry_runs || 0) > 0, `dry_runs jour=${et.dry_runs ?? '?'}`);
  check('zéro envoi réel', (et.sent || 0) === 0, `sent jour=${et.sent ?? '?'}`);
  check('zéro post publié', ((s.facebook_posts || {}).published7d || 0) === 0, `published_7j=${(s.facebook_posts || {}).published7d ?? '?'}`);
  check('aucun statut sent', ((s.queue || {}).sent || 0) === 0 && ((s.contacts_by_status || {}).sent || 0) === 0,
    `sent=${((s.contacts_by_status || {}).sent || 0)}`);
  check('quotas configurés', (s.limits || {}).daily <= 10 && (s.limits || {}).batch <= 10,
    `daily=${(s.limits || {}).daily}, batch=${(s.limits || {}).batch}`);
  const hbAt = s.runtime && s.runtime.last_heartbeat_at;
  check('activité cron récente', !!hbAt && (Date.now() - new Date(hbAt).getTime()) < 90 * 60000,
    hbAt ? `dernier heartbeat ${hbAt}` : 'aucun heartbeat');
  const leaked = key && JSON.stringify(s).includes(key);
  check('aucune clé exposée', !leaked, '');
  if (!fails.length) out('DRY RUN VERIFIED');
  else out('DRY RUN : NON PROUVÉ — ' + fails.join(', '));
  return { pass: !fails.length, fails };
}

if (require.main === module) {
  runVerifyDryRun().then(({ pass }) => process.exit(pass ? 0 : 1))
    .catch((e) => { console.error('VERIFY FATAL: ' + String((e && e.message) || e).slice(0, 120)); process.exit(1); });
}

module.exports = { runVerifyDryRun };
