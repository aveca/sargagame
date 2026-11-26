#!/usr/bin/env node
/**
 * mission-lifecycle.test.cjs — tests du cycle de vie durable + watchdog.
 *
 * Hors-ligne. Le fichier d'état est redirigé vers un fichier temporaire
 * (variable d'environnement SARGA_MISSION_STATE_FILE) : aucun état réel n'est
 * touché.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), `sarga-mission-state-${process.pid}.json`);
process.env.SARGA_MISSION_STATE_FILE = TMP;

const lifecycle = require('./mission-lifecycle.cjs');
const watchdog = require('./mission-watchdog.cjs');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + ' ' + detail);
  }
}

try { fs.unlinkSync(TMP); } catch (_) {}

// ── 1. Persistance ───────────────────────────────────────────────────────────

console.log('=== 1. persistance ===');
{
  const m = lifecycle.upsert({
    taskId: 'T-1', repo: 'aveca/sargagame', issue: 42, fingerprint: 'fp-1', state: 'imported',
  });
  check('état créé', !!m && m.state === 'imported');
  check('clé qualifiée par dépôt+issue', lifecycle.keyOf('aveca/sargagame', 42, 'T-1') === 'aveca/sargagame#42|T-1');
  const reloaded = lifecycle.load();
  check('état relu du disque', !!(reloaded.missions && reloaded.missions['aveca/sargagame#42|T-1']));
}
{
  lifecycle.upsert({ taskId: 'T-1', repo: 'aveca/sargagame', issue: 42, state: 'started', agent: 'opencode', branch: 'b1' });
  const m = lifecycle.findByTaskId('T-1');
  check('mise à jour sans écraser le reste', m.state === 'started' && m.agent === 'opencode' && m.fingerprint === 'fp-1', JSON.stringify(m));
}

// ── 2. Watchdog : mission au heartbeat expiré ───────────────────────────────

console.log('=== 2. watchdog (heartbeat expiré) ===');
{
  lifecycle.upsert({
    taskId: 'T-STALE', repo: 'aveca/sargagame', issue: 77, state: 'started',
    lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), pid: null,
  });
  const stale = lifecycle.stale({ staleAfterMs: 60 * 1000 });
  check('mission périmée détectée', stale.some(m => m.taskId === 'T-STALE'), JSON.stringify(stale.map(m => m.taskId)));
}
{
  lifecycle.upsert({
    taskId: 'T-FRESH', repo: 'aveca/sargagame', issue: 78, state: 'started',
    lastHeartbeatAt: new Date().toISOString(), pid: process.pid,
  });
  const stale = lifecycle.stale({ staleAfterMs: 60 * 1000 });
  check('mission vivante NON périmée', !stale.some(m => m.taskId === 'T-FRESH'));
}

// ── 3. Watchdog : reprise sans doublon + mission terminale jamais relancée ───

console.log('=== 3. watchdog (reprise + non-relance) ===');
{
  const queue = {
    opportunities: [
      { id: 'T-STALE', status: 'picked', repository_full_name: 'aveca/sargagame', issue_number: 77 },
      { id: 'T-DONE', status: 'ready-to-merge', repository_full_name: 'aveca/sargagame', issue_number: 79 },
    ],
  };
  const patches = [];
  const published = [];
  const mem = {
    loadQueue: () => queue,
    updateOpportunity: (id, patch) => { patches.push({ id, patch }); const o = queue.opportunities.find(x => x.id === id); if (o) Object.assign(o, patch); return o; },
  };
  lifecycle.upsert({
    taskId: 'T-DONE', repo: 'aveca/sargagame', issue: 79, state: 'completed',
    lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const res = watchdog.runMissionWatchdog({
    cfg: { mission: { watchdogStaleSeconds: 60 } },
    log: () => {},
    publish: (repo, issue, status, detail) => { published.push({ repo, issue, status, detail }); return true; },
    mem,
  });
  check('une mission reprise', res.resumed === 1, JSON.stringify(res));
  check('la mission terminale est ignorée', res.skipped === 1, JSON.stringify(res));
  check('statut retrying publié', published.some(p => p.status === 'retrying' && p.issue === 77), JSON.stringify(published));
  check('la mission terminale n\'est pas republiée', !published.some(p => p.issue === 79));
  // Statut de reprise : `new` quand le scheduler n'a jamais claimé la mission
  // (seul statut sélectionnable par `analyze.cjs`) — cf.
  // `scheduler.resumableStatus`.
  check('opportunité remise en file (sans doublon)', patches.some(p => p.id === 'T-STALE' && p.patch.status === 'new'), JSON.stringify(patches));
  check('opportunité terminale non modifiée', !patches.some(p => p.id === 'T-DONE'));
  check('état durable repassé à retrying', lifecycle.findByTaskId('T-STALE').state === 'retrying');
}

// ── 3b. Watchdog : l'état terminal REFLETTE la réalité (jamais de faux `completed`) ─
//
// Défaut réel du 2026-11-09 (mission #1376) : le watchdog écrivait
// `completed` pour TOUTE opportunité terminale. Une mission bloquée par une
// PR ouverte était donc annoncée « completed » — un faux succès, sans
// commit ni PR dans l'état durable.

console.log('=== 3b. watchdog — état terminal reflété ===');
{
  const queue = {
    opportunities: [
      { id: 'T-BLOCKED', status: 'blocked', repository_full_name: 'aveca/sargagame', issue_number: 81 },
      { id: 'T-REJECTED', status: 'rejected', repository_full_name: 'aveca/sargagame', issue_number: 82 },
      { id: 'T-READY', status: 'ready-to-merge', repository_full_name: 'aveca/sargagame', issue_number: 83 },
    ],
  };
  const mem = {
    loadQueue: () => queue,
    updateOpportunity: () => null,
  };
  for (const [id, issue] of [['T-BLOCKED', 81], ['T-REJECTED', 82], ['T-READY', 83]]) {
    lifecycle.upsert({
      taskId: id, repo: 'aveca/sargagame', issue, state: 'started',
      lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
  }
  watchdog.runMissionWatchdog({
    cfg: { mission: { watchdogStaleSeconds: 60 } },
    log: () => {},
    publish: () => true,
    mem,
  });
  check('mission bloquée → état `blocked` (PAS completed)',
    lifecycle.findByTaskId('T-BLOCKED').state === 'blocked',
    lifecycle.findByTaskId('T-BLOCKED').state);
  check('mission rejetée → état `failed`',
    lifecycle.findByTaskId('T-REJECTED').state === 'failed',
    lifecycle.findByTaskId('T-REJECTED').state);
  check('mission prête à merger → état `completed`',
    lifecycle.findByTaskId('T-READY').state === 'completed',
    lifecycle.findByTaskId('T-READY').state);
}

// ── 4. Bornage de l'historique ───────────────────────────────────────────────

console.log('=== 4. bornage ===');
{
  for (let i = 0; i < 260; i++) {
    lifecycle.upsert({ taskId: `T-B${i}`, repo: 'aveca/sargagame', issue: 1000 + i, state: 'completed' });
  }
  const all = Object.keys(lifecycle.load().missions || {}).length;
  check('historique borné', all <= 200, String(all));
}

try { fs.unlinkSync(TMP); } catch (_) {}

console.log(failures === 0 ? 'MISSION-LIFECYCLE TESTS : OK (0 échec)' : `MISSION-LIFECYCLE TESTS : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
