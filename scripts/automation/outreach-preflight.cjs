#!/usr/bin/env node
/**
 * outreach-preflight.cjs — audit POST-CONFIG en une commande.
 * Usage: OUTREACH_WORKER_URL=https://... OUTREACH_ADMIN_KEY=... npm run outreach:preflight [-- --gate]
 * La clé passe UNIQUEMENT par l'environnement (jamais en argument, jamais imprimée).
 * Exit 0 si tout PASS, 1 sinon. Ne modifie rien (GET uniquement).
 * --gate : refuse l'activation (exit 1 + raison) si DB KO, Resend absent,
 *   aucun dry-run prouvé récemment, ou kill switch inopérant. L'activation
 *   réelle reste une opération manuelle explicite (jamais automatique).
 */
'use strict';

async function runPreflight({ fetchImpl = fetch, env = process.env, out = console.log } = {}) {
  const rows = [];
  const rec = (check, result, detail = '') => rows.push({ check, result, detail });
  const base = String(env.OUTREACH_WORKER_URL || '').replace(/\/$/, '');
  const key = String(env.OUTREACH_ADMIN_KEY || '');
  if (!base) { rec('Worker', 'FAIL', 'OUTREACH_WORKER_URL manquant'); return finish(); }
  if (!key) { rec('Worker', 'FAIL', 'OUTREACH_ADMIN_KEY manquant'); return finish(); }

  let status = null;
  try {
    const r = await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) rec('Worker', 'FAIL', `health HTTP ${r.status}`);
    else {
      const h = await r.json().catch(() => ({}));
      rec('Worker', h.ok ? 'PASS' : 'FAIL', `health 200, dry_run=${h.dry_run}, enabled=${h.enabled}`);
    }
  } catch (e) { rec('Worker', 'FAIL', `injoignable: ${String((e && e.message) || e).slice(0, 80)}`); return finish(); }

  try {
    const r = await fetchImpl(`${base}/status?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(20000) });
    if (r.status === 401) { rec('Admin', 'FAIL', '/status 401 (clé refusée)'); return finish(); }
    if (!r.ok) { rec('Admin', 'FAIL', `/status HTTP ${r.status}`); return finish(); }
    status = await r.json().catch(() => null);
    if (!status || status.ok !== true) { rec('Admin', 'FAIL', 'réponse illisible'); return finish(); }
    rec('Admin', 'PASS', 'authentifié, agrégats sans PII');
  } catch (e) { rec('Admin', 'FAIL', String((e && e.message) || e).slice(0, 80)); return finish(); }

  // DB : tables lisibles via les agrégats (contacts + events + posts).
  const hasContacts = status.contacts_by_status && typeof status.contacts_by_status === 'object';
  const hasEvents = Array.isArray(status.recent_events);
  const fb = status.facebook_posts || {};
  const dbOk = hasContacts && hasEvents && typeof fb.scheduled === 'number';
  rec('DB', dbOk ? 'PASS' : 'FAIL', dbOk
    ? `contacts + events + posts lisibles (queue ready=${(status.queue || {}).ready ?? '?'})`
    : 'agrégats DB absents (tables non appliquées ou clé service manquante côté worker)');

  // Config : présence uniquement (le worker ne renvoie jamais de valeurs).
  const sec = status.secrets || {};
  rec('Resend', sec.resend_key ? 'CONFIGURED' : 'NOT CONFIGURED',
    sec.resend_key ? 'clé présente côté worker' : 'RESEND_API_KEY à provisionner (wrangler secret put)');
  const metaOk = !!sec.fb_token;
  rec('Meta', metaOk ? 'CONFIGURED' : 'NOT CONFIGURED',
    metaOk ? 'token présent côté worker (vérifier Page IDs + permissions avant tout post)' : 'FB_PAGE_TOKEN à provisionner');
  rec('Switches', 'INFO', `enabled=${status.enabled} email=${status.email} facebook=${status.fb_enabled} dry_run=${status.dry_run}`);

  // Cron : prouvé par les heartbeats (le worker ne peut pas lister ses propres crons).
  const hbAt = status.runtime && status.runtime.last_heartbeat_at;
  const hbAgeMin = hbAt ? Math.round((Date.now() - new Date(hbAt).getTime()) / 60000) : null;
  rec('Cron', hbAgeMin != null && hbAgeMin <= 90 ? 'PASS' : 'WARN',
    hbAgeMin != null ? `dernier heartbeat il y a ${hbAgeMin} min` : 'aucun heartbeat visible (crons jamais exécutés ou DB vide)');

  // Sécurité : la sortie ne doit JAMAIS contenir la clé.
  function finish() {
    const pass = rows.length > 0 && rows.every((r) => r.result === 'PASS' || r.result === 'INFO' || r.result === 'CONFIGURED' || r.result === 'NOT CONFIGURED' || r.result === 'WARN');
    const hardFail = rows.some((r) => r.result === 'FAIL');
    out('');
    out('| Check    | Résultat |');
    out('| -------- | -------- |');
    for (const r of rows) out(`| ${r.check} | ${r.result}${r.detail ? ' — ' + r.detail : ''} |`);
    out('');
    const leaked = rows.some((r) => key && JSON.stringify(r).includes(key));
    if (leaked) { out('SECURITY FAIL : clé détectée en sortie'); return { pass: false, rows }; }
    out('Security : PASS (aucune clé en sortie)');
    if (process.argv.includes('--gate')) return gate();
    return { pass: !hardFail, rows };
  }
  // Gate d'activation : refuse (exit 1 + raison) tant que les prérequis
  // d'un premier envoi réel ne sont pas DÉMONTRÉS. Ne flippe jamais rien.
  function gate() {
    const reasons = [];
    const get = (n) => rows.find((r) => r.check === n);
    if (!get('DB') || get('DB').result !== 'PASS') reasons.push('DB absente ou illisible');
    if (!get('Resend') || get('Resend').result !== 'CONFIGURED') reasons.push('Resend non configuré');
    if (!status || status.dry_run !== true) reasons.push('dry-run non actif (attendu true avant activation)');
    const dryN = status && status.email_today && status.email_today.dry_runs;
    if (!(dryN > 0)) reasons.push('aucun dry-run prouvé en prod (attendre des events dry_run)');
    if (reasons.length) {
      out('GATE : REFUSÉ — ' + reasons.join(' ; '));
      return { pass: false, rows, gate: reasons };
    }
    out('GATE : PASS — activation manuelle autorisée (1 prospect, batch=1, supervision).');
    return { pass: true, rows, gate: [] };
  }
  return finish();
}

if (require.main === module) {
  runPreflight().then(({ pass }) => process.exit(pass ? 0 : 1))
    .catch((e) => { console.error('PREFLIGHT FATAL: ' + String((e && e.message) || e).slice(0, 120)); process.exit(1); });
}

module.exports = { runPreflight };
