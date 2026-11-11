#!/usr/bin/env node
/**
 * mission-watchdog.test.cjs — tests de la REPRISE sans doublon.
 *
 * Hors-ligne. L'état durable est redirigé vers un fichier temporaire
 * (SARGA_MISSION_STATE_FILE) : aucun état réel n'est touché.
 *
 * Ces tests verrouillent les corrections du 2026-11-10 (mission #1384,
 * 242 reprises / 242 commentaires `retrying`) :
 *   1. le plafond `mission.maxAttempts` est APPLIQUÉ (il existait dans la
 *      configuration mais n'était jamais lu) ;
 *   2. l'ÉTAT DURABLE fait autorité : une mission terminale n'est jamais
 *      relancée, même si la queue la réarme ;
 *   3. une mission neutralisée par le garde-fou de sécurité n'est jamais
 *      réarmée (fail-open corrigé) ;
 *   4. la boucle NE SE RELANCE PAS ELLE-MÊME : le nombre de publications
 *      `retrying` est borné par le plafond.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), `sarga-watchdog-${process.pid}.json`);
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

/** Fabrique une queue + un module mémoire injectable. */
function harness(opps) {
  const queue = { opportunities: opps };
  const patches = [];
  const published = [];
  const mem = {
    loadQueue: () => queue,
    updateOpportunity: (id, patch) => {
      patches.push({ id, patch });
      const o = queue.opportunities.find(x => x.id === id);
      if (o) Object.assign(o, patch);
      return o;
    },
  };
  return {
    queue,
    patches,
    published,
    mem,
    run(cfg, schedulerState) {
      return watchdog.runMissionWatchdog({
        cfg: cfg || { mission: { watchdogStaleSeconds: 60, maxAttempts: 3 } },
        log: () => {},
        publish: (repo, issue, status, detail) => {
          published.push({ repo, issue, status, detail });
          return true;
        },
        mem,
        schedulerState: schedulerState || { claimedIds: [] },
      });
    },
  };
}

function staleMission(taskId, issue, extra = {}) {
  lifecycle.upsert({
    taskId,
    repo: 'aveca/sargagame',
    issue,
    state: 'started',
    lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    pid: null,
    ...extra,
  });
}

// ── 1. Plafond de reprises (maxAttempts) ────────────────────────────────────

console.log('=== 1. plafond de reprises ===');
{
  const h = harness([
    { id: 'T-CAP', status: 'picked', repository_full_name: 'aveca/sargagame', issue_number: 91 },
  ]);
  staleMission('T-CAP', 91, { attempts: 3 }); // déjà au plafond
  const res = h.run();
  check('mission au plafond NON reprise', res.resumed === 0, JSON.stringify(res));
  check('plafond comptabilisé', res.exhausted === 1, JSON.stringify(res));
  check('état durable → failed', lifecycle.findByTaskId('T-CAP').state === 'failed',
    lifecycle.findByTaskId('T-CAP').state);
  check('opportunité rendue terminale',
    h.queue.opportunities[0].status === 'rejected', h.queue.opportunities[0].status);
  check('publication `failed` (une fois)', h.published.filter(p => p.status === 'failed').length === 1,
    JSON.stringify(h.published.map(p => p.status)));
  check('aucune publication `retrying`', !h.published.some(p => p.status === 'retrying'),
    JSON.stringify(h.published.map(p => p.status)));
}

// ── 2. Second passage : la mission terminale n'est plus relancée ────────────

console.log('=== 2. mission terminale non relancée (2e passage) ===');
{
  const h = harness([
    { id: 'T-CAP', status: 'rejected', repository_full_name: 'aveca/sargagame', issue_number: 91 },
  ]);
  const res = h.run();
  check('aucune reprise', res.resumed === 0, JSON.stringify(res));
  check('aucune publication', h.published.length === 0, JSON.stringify(h.published.map(p => p.status)));
}

// ── 3. L'état DURABLE fait autorité (queue réarmée à tort) ──────────────────

console.log('=== 3. état durable terminal fait autorité ===');
{
  const h = harness([
    // queue réarmée 'picked' alors que l'état durable dit 'blocked'
    { id: 'T-DURABLE', status: 'picked', repository_full_name: 'aveca/sargagame', issue_number: 92 },
  ]);
  staleMission('T-DURABLE', 92, { state: 'blocked', reason: 'garde-fou' });
  const res = h.run();
  check('mission terminale (durable) NON reprise', res.resumed === 0, JSON.stringify(res));
  check('jamais même examinée (stale() exclut les états terminaux)', res.checked === 0, JSON.stringify(res));
  check('la queue N\'EST PAS réarmée',
    !h.patches.some(p => p.id === 'T-DURABLE' && p.patch.status === 'picked'),
    JSON.stringify(h.patches));
  check('aucune publication `retrying`', !h.published.some(p => p.status === 'retrying'));
  check('état durable conservé (blocked)', lifecycle.findByTaskId('T-DURABLE').state === 'blocked',
    lifecycle.findByTaskId('T-DURABLE').state);
}

// ── 3b. Défense en profondeur : l'état durable terminal fait autorité ───────
//
// Même si `stale()` exposait une mission terminale (implémentation de
// lifecycle injectée, évolution future), le watchdog ne doit PAS la relancer.

console.log('=== 3b. état durable terminal fait autorité (défense en profondeur) ===');
{
  const h = harness([
    { id: 'T-TERM', status: 'picked', repository_full_name: 'aveca/sargagame', issue_number: 96 },
  ]);
  const fakeLifecycle = Object.assign(Object.create(Object.getPrototypeOf(lifecycle)), lifecycle, {
    stale: () => ([{
      taskId: 'T-TERM', repo: 'aveca/sargagame', issue: 96, fingerprint: 'fp-term',
      state: 'failed', attempts: 1, lastHeartbeatAt: null, pid: null,
    }]),
    patch: (taskId, repo, issue, fields) => { patched.push({ taskId, fields }); return null; },
  });
  const patched = [];
  const res = watchdog.runMissionWatchdog({
    cfg: { mission: { watchdogStaleSeconds: 60, maxAttempts: 3 } },
    log: () => {},
    publish: (repo, issue, status) => { h.published.push({ status }); return true; },
    mem: h.mem,
    lifecycle: fakeLifecycle,
  });
  check('mission terminale NON relancée', res.resumed === 0, JSON.stringify(res));
  check('ignorée', res.skipped === 1, JSON.stringify(res));
  check('état durable aligné sur le terminal', patched.some(p => p.fields.state === 'failed'),
    JSON.stringify(patched));
  check('aucune publication `retrying`', !h.published.some(p => p.status === 'retrying'));
}

// ── 4. Garde-fou de sécurité sur le chemin de REPRISE (fail-open corrigé) ───

console.log('=== 4. mission neutralisée par le garde-fou ===');
{
  const h = harness([
    {
      id: 'T-SAFE',
      status: 'picked',
      repository_full_name: 'aveca/sargagame',
      issue_number: 93,
      safety: { blocked: true, reason: 'déploiement en production [production-deploy]' },
    },
  ]);
  staleMission('T-SAFE', 93);
  const res = h.run();
  check('mission neutralisée NON reprise', res.resumed === 0, JSON.stringify(res));
  check('opportunité rebloquée',
    h.queue.opportunities[0].status === 'blocked', h.queue.opportunities[0].status);
  check('état durable → blocked', lifecycle.findByTaskId('T-SAFE').state === 'blocked',
    lifecycle.findByTaskId('T-SAFE').state);
  check('aucune publication `retrying`', !h.published.some(p => p.status === 'retrying'));
}

// ── 5. Anti-livelock : la boucle ne se relance pas elle-même ────────────────

console.log('=== 5. anti-livelock (bornage des reprises) ===');
{
  const h = harness([
    { id: 'T-LOOP', status: 'picked', repository_full_name: 'aveca/sargagame', issue_number: 94 },
  ]);
  staleMission('T-LOOP', 94, { attempts: 0 });
  const cfg = { mission: { watchdogStaleSeconds: 60, maxAttempts: 3 } };
  // 10 cycles consécutifs : c'est exactement ce que la boucle faisait sur #1384.
  for (let i = 0; i < 10; i++) h.run(cfg);
  const retrying = h.published.filter(p => p.status === 'retrying').length;
  const failed = h.published.filter(p => p.status === 'failed').length;
  check('reprises bornées par maxAttempts', retrying === 3, 'retrying=' + retrying);
  check('un seul `failed` terminal', failed === 1, 'failed=' + failed);
  check('état durable final = failed', lifecycle.findByTaskId('T-LOOP').state === 'failed',
    lifecycle.findByTaskId('T-LOOP').state);
  check('opportunité finale terminale', h.queue.opportunities[0].status === 'rejected',
    h.queue.opportunities[0].status);
}

// ── 6. Le comportement nominal reste intact ─────────────────────────────────

console.log('=== 6. reprise nominale ===');
{
  const h = harness([
    { id: 'T-OK', status: 'picked', repository_full_name: 'aveca/sargagame', issue_number: 95 },
  ]);
  staleMission('T-OK', 95, { attempts: 0 });
  const res = h.run();
  check('mission reprise', res.resumed === 1, JSON.stringify(res));
  check('statut `retrying` publié', h.published.some(p => p.status === 'retrying'),
    JSON.stringify(h.published.map(p => p.status)));
  check('opportunité remise en file',
    h.patches.some(p => p.id === 'T-OK' && p.patch.status === 'new'), JSON.stringify(h.patches));
  check('état durable → retrying', lifecycle.findByTaskId('T-OK').state === 'retrying');
  check('tentative incrémentée', lifecycle.findByTaskId('T-OK').attempts === 1,
    String(lifecycle.findByTaskId('T-OK').attempts));
}

// ── 6b. Une mission DÉJÀ CLAIMÉE par le scheduler repart en `picked` ────────

console.log('=== 6b. reprise d\'une mission déjà claimée → picked ===');
{
  const h = harness([
    { id: 'T-CLAIMED', status: 'picked', repository_full_name: 'aveca/sargagame', issue_number: 97 },
  ]);
  staleMission('T-CLAIMED', 97, { attempts: 0 });
  const res = h.run({ mission: { watchdogStaleSeconds: 60, maxAttempts: 3 } }, { claimedIds: ['T-CLAIMED'] });
  check('mission reprise', res.resumed === 1, JSON.stringify(res));
  check('statut `picked` (déjà claimée : pas re-exposée au pool)',
    h.patches.some(p => p.id === 'T-CLAIMED' && p.patch.status === 'picked'), JSON.stringify(h.patches));
}

// ── 7. Le garde-fou ignore les commentaires de STATUT de la boucle ─────────

console.log('=== 7. garde-fou : les échos de statut ne bloquent pas ===');
{
  const bridge = require('../multi-repo-bridge.cjs');
  const safety = require('./safety-guard.cjs');
  const machine = [
    { body: '<!-- autopilot-status:SARG-X:blocked -->\nmotif : déploiement en production [production-deploy]' },
    { body: '<!-- SARGAGAME-CYCLE-STATUS -->\n- Vérifier PR, CI sur SHA exact, merge, déploiement et LIVE comme étapes distinctes' },
  ];
  const kept = bridge.safetyRelevantComments(machine);
  check('les commentaires machine sont écartés', kept.length === 0, JSON.stringify(kept.map(c => c.body.slice(0, 40))));

  const human = [{ body: 'Merci de déployer en production dès que possible.' }];
  check('un commentaire humain reste scanné',
    bridge.safetyRelevantComments(human).length === 1);

  // Le corps de la mission seul ne déclenche rien (déjà vérifié en prod)…
  const bodyOnly = safety.evaluateMissionSafety({
    title: 'accusé serveur après persistance Punta Cana',
    body: 'Laisser la PR en DRAFT; aucune fusion ni release dans cette mission.',
    comments: bridge.safetyRelevantComments(machine).map(c => c.body).join('\n'),
    task: { title: 'accusé serveur', constraints: ['aucun POST réel', 'aucun envoi d\'email'] },
  });
  check('mission propre non bloquée', bodyOnly.blocked === false, bodyOnly.reason);
  // … mais avec les commentaires machine AVANT correction, elle l'était.
  const withMachine = safety.evaluateMissionSafety({
    title: 'accusé serveur après persistance Punta Cana',
    body: 'Laisser la PR en DRAFT; aucune fusion ni release dans cette mission.',
    comments: machine.map(c => c.body).join('\n'),
    task: { title: 'accusé serveur' },
  });
  check('le faux positif est bien reproduit (preuve du défaut)', withMachine.blocked === true,
    withMachine.reason);
}

try { fs.unlinkSync(TMP); } catch (_) {}

console.log(failures === 0 ? 'MISSION-WATCHDOG TESTS : OK (0 échec)' : `MISSION-WATCHDOG TESTS : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
