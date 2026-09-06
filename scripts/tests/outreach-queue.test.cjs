#!/usr/bin/env node
/**
 * outreach-queue.test.cjs — contrats du Worker outreach 0-PC (sprint 2026-09-06).
 * Bundle le VRAI worker (esbuild), Supabase simulé en mémoire, Resend/Meta mockés.
 * Couvre : enqueue/dequeue, idempotence, retry/backoff, stops (unsub/reply/bounce),
 * quotas/batch, timezone, FB schedule/dedupe, kill switch, dry-run, admin (sans PII),
 * unsubscribe, webhook, reply. AUCUN envoi réel (tout est mocké).
 */
'use strict'

const path = require('path')
const os = require('os')

let passed = 0, failed = 0
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label) }
  else { failed++; console.error('  ✗ FAIL:', label) }
}

// ─── Fake Supabase REST (sémantique minimale suffisante) ──────────────────
function makeSupa() {
  const db = { outreach_contacts: [], outreach_events: [], social_posts: [] };
  let seq = 1;
  const matches = (row, conds) => conds.every(([k, op, v]) => {
    const rv = row[k];
    if (op === 'eq') return String(rv ?? '') === v;
    if (op === 'in') return v.split(',').includes(String(rv ?? ''));
    if (op === 'is') return (v === 'null' && (rv === null || rv === undefined)) || String(rv) === v;
    if (op === 'lte') return rv != null && String(rv) <= v;
    if (op === 'gte') return rv != null && String(rv) >= v;
    if (op === 'ilike') {
      const pat = '^' + v.replace(/\./g, '\\.').replace(/%/g, '.*').replace(/\*/g, '.*') + '$';
      return new RegExp(pat, 'i').test(String(rv ?? ''));
    }
    return false;
  });
  // Filtres supportés : k=eq.v, k=in.(a,b), k=is.null, k=lte.v, k=gte.v, k=ilike.v, or=(a.is.null,a.lte.v)
  function parseFilter(qs, table) {
    const conds = [];
    let orGroups = [];
    for (const [k, v] of qs) {
      if (['select', 'order', 'limit'].includes(k)) continue;
      if (k === 'or') {
        orGroups = v.slice(1, -1).split(',').map((g) => {
          const m = g.match(/^(.+?)\.(is|lte|gte|eq)\.(.*)$/);
          return m ? [m[1], m[2], m[3]] : null;
        }).filter(Boolean);
        continue;
      }
      const m = String(v).match(/^(eq|in|is|lte|gte|ilike)\.(.*)$/s);
      if (!m) continue;
      let val = m[2];
      if (m[1] === 'in') val = val.slice(1, -1);
      conds.push([k, m[1], decodeURIComponent(val)]);
    }
    return (row) => {
      if (!matches(row, conds.map(([k, op, vv]) => [k, op, op === 'lte' || op === 'gte' ? decodeURIComponent(vv) : vv]))) return false;
      if (orGroups.length && !orGroups.some(([k, op, vv]) => matches(row, [[k, op, vv]]))) return false;
      return true;
    };
  }
  async function handle(url, method, body, headers) {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    const qs = [...u.searchParams.entries()];
    if (!(table in db)) return new Response('no table', { status: 404 });
    if (method === 'HEAD') {
      const pred = parseFilter(qs, table);
      const n = db[table].filter(pred).length;
      return new Response(null, { status: 200, headers: { 'Content-Range': `*/${n}` } });
    }
    if (method === 'GET') {
      const pred = parseFilter(qs, table);
      let rows = db[table].filter(pred);
      const ord = u.searchParams.get('order');
      if (ord) {
        const [k, dir] = ord.split('.');
        rows = rows.slice().sort((a, b) => {
          const av = a[k] ?? '', bv = b[k] ?? '';
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (dir === 'desc' ? -1 : 1) * (String(av) < String(bv) ? -1 : 1);
        });
      }
      const lim = parseInt(u.searchParams.get('limit') || '1000', 10);
      return Response.json(rows.slice(0, lim));
    }
    if (method === 'POST') {
      const row = { id: `id-${seq++}`, created_at: new Date().toISOString(), ...(body || {}) };
      db[table].push(row);
      return Response.json([row], { status: 201 });
    }
    if (method === 'PATCH') {
      const pred = parseFilter(qs, table);
      const rows = db[table].filter(pred);
      rows.forEach((r) => Object.assign(r, body || {}));
      return Response.json(rows);
    }
    return new Response('405', { status: 405 });
  }
  return { db, handle };
}

const FAKE_URL = 'http://fake-supa.test';
function baseEnv(over = {}) {
  return {
    SUPABASE_URL: FAKE_URL,
    SUPABASE_SERVICE_KEY: 'svc',
    RESEND_API_KEY: 're_test',
    RESEND_FROM: 'SargaGame <pro@example.com>',
    ADMIN_KEY: 'a'.repeat(64),
    OUTREACH_ENABLED: 'true',
    EMAIL_OUTREACH_ENABLED: 'true',
    FACEBOOK_OUTREACH_ENABLED: 'true',
    OUTREACH_DRY_RUN: 'false',
    DAILY_EMAIL_LIMIT: '10',
    HOURLY_EMAIL_LIMIT: '5',
    PER_DOMAIN_PER_DAY_LIMIT: '1',
    MAX_BATCH_SIZE: '10',
    MAX_RETRIES: '2',
    FOLLOWUP_DELAY_DAYS_1: '4',
    FOLLOWUP_DELAY_DAYS_2: '7',
    SEND_HOUR_START: '0',
    SEND_HOUR_END: '23',
    ENABLED_CAMPAIGNS: 'b2b-hotel-01',
    UNSUB_BASE: 'https://o.test',
    FB_MQ_PAGE_ID: '111',
    FB_GP_PAGE_ID: '222',
    FB_PAGE_TOKEN: 'tok',
    ...over,
  };
}

async function loadWorker() {
  const esbuild = require('esbuild');
  const out = path.join(os.tmpdir(), `outreach-test-${Date.now()}.mjs`);
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', '..', 'workers', 'outreach', 'index.js')],
    bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent',
  });
  const w = (await import('file:///' + out.replace(/\\/g, '/'))).default;
  try { require('fs').unlinkSync(out) } catch (_) {}
  return w;
}

function mkContact(over = {}) {
  return {
    hotel_name: 'Hotel Test', contact_name: 'Marie', email: 'marie@hotel-test-mq.com',
    country: 'MQ', region: 'MQ', language: 'fr', source: 'test',
    status: 'ready', campaign_id: 'b2b-hotel-01', current_step: 0,
    next_action_at: null, attempts: 0, ...over,
  };
}

async function main() {
  const worker = await loadWorker();
  ok(typeof worker.fetch === 'function' && typeof worker.scheduled === 'function', 'worker bundle OK (fetch + scheduled)');

  // Installateur de mocks par scénario.
  function install(supa, hooks = {}) {
    globalThis.fetch = async (input, init = {}) => {
      const url = String((input && input.url) || input);
      if (url.startsWith(FAKE_URL)) {
        let body = null;
        try { body = init.body ? JSON.parse(init.body) : null } catch (_) {}
        return supa.handle(url, (init.method || 'GET').toUpperCase(), body, init.headers || {});
      }
      if (url.startsWith('https://api.resend.com/')) {
        hooks.resendCalls = (hooks.resendCalls || 0) + 1;
        if (hooks.resend) return hooks.resend(url, init);
        return new Response(JSON.stringify({ id: 're_123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.startsWith('https://graph.facebook.com/')) {
        hooks.fbCalls = (hooks.fbCalls || 0) + 1;
        if (hooks.fb) return hooks.fb(url, init);
        return new Response(JSON.stringify({ id: 'post_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('unexpected fetch: ' + url.slice(0, 80));
    };
    return hooks;
  }
  const cron = (c) => ({ cron: c, scheduledTime: Date.now() });

  // ── 1. enqueue → dequeue → sent ──────────────────────────────────────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv());
    const c = supa.db.outreach_contacts[0];
    ok(c.status === 'sent', 'dequeue: ready → sent');
    ok(hooks.resendCalls === 1, 'dequeue: exactement 1 appel Resend');
    ok(c.next_action_at != null, 'dequeue: prochaine relance planifiée');
    ok(supa.db.outreach_events.some((e) => e.kind === 'sent' && e.dry_run === false), 'dequeue: event sent (non dry-run)');
  }

  // ── 2. idempotence : claim perdu + double run ────────────────────────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv());
    await worker.scheduled(cron('*/30 * * * *'), baseEnv());
    ok(hooks.resendCalls === 1, 'idempotence: 2 runs → 1 seul envoi (déjà sent)');
  }

  // ── 3a. retry transitoire puis abandon ───────────────────────────────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    hooks.resend = () => new Response(JSON.stringify({ message: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv());
    let c = supa.db.outreach_contacts[0];
    ok(c.status === 'queued' && c.attempts === 1 && !!c.next_action_at, 'retry: 500 → queued + backoff');
    ok(supa.db.outreach_events.some((e) => e.kind === 'retry'), 'retry: event retry loggé');
    // force l'échéance + épuise les retries
    c.next_action_at = new Date(Date.now() - 1000).toISOString();
    c.attempts = 5;
    await worker.scheduled(cron('*/30 * * * *'), baseEnv());
    c = supa.db.outreach_contacts[0];
    ok(c.status === 'failed', 'retry: au-delà MAX → failed (pas de boucle infinie)');
  }

  // ── 3b. bounce permanent : pas de retry ──────────────────────────────
  {
    const supa = makeSupa();
    install(supa);
    const hooks2 = {};
    globalThis.fetch = async (input, init = {}) => {
      const url = String((input && input.url) || input);
      if (url.startsWith(FAKE_URL)) {
        let body = null;
        try { body = init.body ? JSON.parse(init.body) : null } catch (_) {}
        return supa.handle(url, (init.method || 'GET').toUpperCase(), body, init.headers || {});
      }
      hooks2.n = (hooks2.n || 0) + 1;
      return new Response(JSON.stringify({ message: 'invalid mailbox' }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    };
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv());
    const c = supa.db.outreach_contacts[0];
    ok(c.status === 'bounced' && hooks2.n === 1, 'bounce: 422 → bounced, 1 seul appel');
  }

  // ── 4. stops : unsub / reply / bounced jamais envoyés ────────────────
  {
    for (const [st, extra] of [['unsubscribed', { unsubscribe_at: new Date().toISOString() }], ['sent', { reply_status: 'replied' }], ['bounced', {}]]) {
      const supa = makeSupa();
      const hooks = install(supa);
      supa.db.outreach_contacts.push({ id: 'c1', ...mkContact({ status: st, ...extra }) });
      // 'sent' sans next_action_at échu n'est pas dû ; forcer l'échéance pour le test reply :
      if (st === 'sent') supa.db.outreach_contacts[0].next_action_at = new Date(Date.now() - 1000).toISOString();
      await worker.scheduled(cron('20 * * * *'), { ...baseEnv(), SEND_HOUR_START: '0', SEND_HOUR_END: '23' });
      ok((hooks.resendCalls || 0) === 0, `stop: status=${st} → 0 envoi`);
    }
  }

  // ── 5. quotas : daily atteint → rien ne part ─────────────────────────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    for (let i = 0; i < 10; i++) supa.db.outreach_events.push({ id: `e${i}`, created_at: new Date().toISOString(), kind: 'sent', dry_run: false });
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv());
    ok((hooks.resendCalls || 0) === 0, 'quota: daily atteint → 0 envoi');
    ok(supa.db.outreach_events.some((e) => e.kind === 'skipped'), 'quota: skip loggé');
  }

  // ── 6. batch borné ──────────────────────────────────────────────────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    for (let i = 0; i < 15; i++) supa.db.outreach_contacts.push({ id: `c${i}`, ...mkContact({ email: `m${i}@h${i}-mq.com` }) });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv({ MAX_BATCH_SIZE: '10', PER_DOMAIN_PER_DAY_LIMIT: '99', HOURLY_EMAIL_LIMIT: '99', DAILY_EMAIL_LIMIT: '99' }));
    ok(hooks.resendCalls === 10, 'batch: 15 dus, MAX 10 → 10 envois');
  }

  // ── 7. timezone : fenêtre impossible → skip déterministe ─────────────
  {
    const supa = makeSupa();
    install(supa);
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv({ SEND_HOUR_START: '25', SEND_HOUR_END: '25' }));
    ok(supa.db.outreach_events.some((e) => e.kind === 'skipped'), 'timezone: fenêtre impossible → skipped (outside_window)');
  }

  // ── 8/9. FB : schedule → published, pas de double publication ───────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    supa.db.social_posts.push({ id: 'p1', platform: 'facebook', page_id: '111', region: 'MQ', content: 'hello', scheduled_at: new Date(Date.now() - 60000).toISOString(), status: 'scheduled', attempts: 0 });
    await worker.scheduled(cron('45 11 * * *'), baseEnv());
    await worker.scheduled(cron('45 11 * * *'), baseEnv());
    const p = supa.db.social_posts[0];
    ok(p.status === 'published' && p.provider_post_id === 'post_1', 'fb: scheduled dû → published + id');
    ok(hooks.fbCalls === 1, 'fb: 2 runs → 1 seule publication (pas de doublon)');
  }

  // ── 10. kill switch ─────────────────────────────────────────────────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    supa.db.social_posts.push({ id: 'p1', platform: 'facebook', page_id: '111', region: 'MQ', content: 'x', scheduled_at: new Date(Date.now() - 60000).toISOString(), status: 'scheduled', attempts: 0 });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv({ OUTREACH_ENABLED: 'false' }));
    await worker.scheduled(cron('45 11 * * *'), baseEnv({ OUTREACH_ENABLED: 'false' }));
    ok((hooks.resendCalls || 0) === 0 && (hooks.fbCalls || 0) === 0, 'kill switch: 0 appel externe');
    ok(supa.db.outreach_contacts[0].status === 'ready', 'kill switch: contact intact');
  }

  // ── 11. dry-run : logique exécutée, rien envoyé, rien avancé ────────
  {
    const supa = makeSupa();
    const hooks = install(supa);
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    await worker.scheduled(cron('*/30 * * * *'), baseEnv({ OUTREACH_DRY_RUN: 'true' }));
    const c = supa.db.outreach_contacts[0];
    ok((hooks.resendCalls || 0) === 0, 'dry-run: 0 appel Resend');
    ok(c.status !== 'sent', 'dry-run: statut non avancé');
    ok(supa.db.outreach_events.some((e) => e.kind === 'dry_run' && e.dry_run === true), 'dry-run: sélection loggée avec contexte');
  }

  // ── 12. admin status : agrégats SANS PII ────────────────────────────
  {
    const supa = makeSupa();
    install(supa);
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact() });
    const r = await worker.fetch(new Request('https://o.test/status?key=' + 'a'.repeat(64)), baseEnv());
    const j = await r.json();
    const s = JSON.stringify(j);
    ok(r.status === 200 && j.ok === true, 'admin: 200 avec clé');
    ok(!s.includes('marie@hotel-test-mq.com'), 'admin: aucun email en clair');
    ok(!s.includes('a'.repeat(64)), 'admin: aucun secret exposé');
    const r2 = await worker.fetch(new Request('https://o.test/status?key=nope'), baseEnv());
    ok(r2.status === 401, 'admin: 401 sans clé');
    const r3 = await worker.fetch(new Request('https://o.test/status?key='), { ...baseEnv(), ADMIN_KEY: '' });
    ok(r3.status === 401, 'admin: 401 si secret non provisionné (fail-closed, pas de bypass vide)');
  }

  // ── 13. unsubscribe : bon code → opt-out, mauvais → 403 ─────────────
  {
    const supa = makeSupa();
    install(supa);
    const env = baseEnv();
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact({ status: 'sent' }) });
    // calcule le code via le même endpoint (refusé sans code d'abord)
    const bad = await worker.fetch(new Request('https://o.test/unsubscribe?email=marie%40hotel-test-mq.com&code=0'), env);
    ok(bad.status === 403, 'unsubscribe: mauvais code → 403');
    // extrait un vrai code : rejoue la construction HMAC (même algo, clé connue du test)
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('unsub|marie@hotel-test-mq.com'));
    const code = [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const good = await worker.fetch(new Request(`https://o.test/unsubscribe?email=marie%40hotel-test-mq.com&code=${code}`), env);
    ok(good.status === 200, 'unsubscribe: bon code → 200');
    ok(supa.db.outreach_contacts[0].status === 'unsubscribed', 'unsubscribe: statut opt-out persisté');
  }

  // ── 14. webhook bounce + reply stop ─────────────────────────────────
  {
    const supa = makeSupa();
    install(supa);
    const env = baseEnv();
    supa.db.outreach_contacts.push({ id: 'c1', ...mkContact({ status: 'sent' }) });
    const noauth = await worker.fetch(new Request('https://o.test/api/outreach/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'bounced', email: 'marie@hotel-test-mq.com' }) }), env);
    ok(noauth.status === 401, 'webhook: sans clé → 401');
    const wh = await worker.fetch(new Request('https://o.test/api/outreach/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outreach-key': env.ADMIN_KEY }, body: JSON.stringify({ type: 'bounced', email: 'marie@hotel-test-mq.com' }) }), env);
    ok(wh.status === 200 && supa.db.outreach_contacts[0].status === 'bounced', 'webhook: bounce → statut bounced');
    supa.db.outreach_contacts.push({ id: 'c2', ...mkContact({ email: 'j@h2.com', status: 'sent', next_action_at: new Date(Date.now() - 1000).toISOString() }) });
    const rep = await worker.fetch(new Request(`https://o.test/api/outreach/reply?key=${env.ADMIN_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'j@h2.com', outcome: 'positive' }) }), env);
    const c2 = supa.db.outreach_contacts.find((c) => c.id === 'c2');
    ok(rep.status === 200 && c2.reply_status === 'positive' && c2.status === 'positive', 'reply: outcome persisté (stoppe la séquence)');
    const hooks = install(supa);
    await worker.scheduled(cron('20 * * * *'), baseEnv());
    ok((hooks.resendCalls || 0) === 0, 'reply: prospect répondu → plus aucun envoi');
  }

  console.log(`\noutreach-queue: ${passed} pass / ${failed} fail`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) });
