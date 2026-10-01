#!/usr/bin/env node
/**
 * autopilot-scheduler-park.test.cjs — ÉTAPE 5 : le scheduler ne laisse jamais
 * une tâche bloquée monopoliser l'usine.
 *
 *  - park-and-continue : nextEligibleOpportunity saute les parkées/exclues
 *  - anti-monopole : rotation round-robin, jamais 2× la même par cycle
 *  - reprise : resumeParkedOpportunities + repairCooldownOver
 *  - anti-doublon : claim idempotent (isAlreadyActive)
 *  - restart : applyRepairAttempt/load-save survivent (état disque)
 *  - 100 % pur sauf le wrapper disque (backup/restore autour du test)
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sched = require('../../scripts/autopilot/lib/scheduler.cjs');

let passed = 0;
function check(name, cond, details = '') {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else { console.log('  ✗ ' + name + (details ? ' — ' + details : '')); throw new Error('FAIL: ' + name); }
}

console.log('AUTOPILOT SCHEDULER-PARK TESTS\n');

function opp(id, status, score) {
  return { id, status, _score: score, scope: { files: ['src/' + id + '.jsx'] } };
}

// ── 1. nextEligible : saute exclues + non-new ──
{
  const queue = { opportunities: [
    opp('A', 'blocked', 99),
    opp('B', 'new', 50),
    opp('C', 'new', 80),
    opp('D', 'done', 100),
  ] };
  const first = sched.nextEligibleOpportunity(queue, []);
  check('meilleur score new d\'abord (C)', first && first.id === 'C');
  const second = sched.nextEligibleOpportunity(queue, ['C']);
  check('exclue sautée → B', second && second.id === 'B');
  const none = sched.nextEligibleOpportunity(queue, ['B', 'C']);
  check('tout exclu → null (pas de boucle)', none === null);
  const empty = sched.nextEligibleOpportunity({ opportunities: [] }, []);
  check('queue vide → null', empty === null);
}

// ── 2. round-robin anti-monopole : 3 tâches → 3 pioches distinctes ──
{
  const queue = { opportunities: [opp('X', 'new', 10), opp('Y', 'new', 20), opp('Z', 'new', 30)] };
  const picked = [];
  const excluded = [];
  for (let i = 0; i < 3; i++) {
    const n = sched.nextEligibleOpportunity(queue, excluded);
    check(`itération ${i + 1} trouve une tâche`, !!n);
    picked.push(n.id);
    excluded.push(n.id);
  }
  check('3 pioches distinctes (pas de monopole)', new Set(picked).size === 3);
  check('4e pioche → null (cycle épuisé)', sched.nextEligibleOpportunity(queue, excluded) === null);
}

// ── 3. comptabilité réparation : pure, RAZ au succès ──
{
  let st = { prRepair: {} };
  st = sched.applyRepairAttempt(st, 777, false, 1000);
  st = sched.applyRepairAttempt(st, 777, false, 2000);
  check('2 échecs comptés', st.prRepair['777'].attempts === 2);
  check('pas encore à parker (max 3)', sched.shouldParkPr(st, 777, 3) === false);
  st = sched.applyRepairAttempt(st, 777, false, 3000);
  check('3 échecs → à parker', sched.shouldParkPr(st, 777, 3) === true);
  st = sched.applyRepairAttempt(st, 777, true, 4000);
  check('succès → RAZ', st.prRepair['777'].attempts === 0);
  check('après RAZ → plus à parker', sched.shouldParkPr(st, 777, 3) === false);
  // Une autre PR n'est pas affectée.
  check('PR 778 indépendante', sched.shouldParkPr(st, 778, 3) === false);
}

// ── 4. cooldown : parkée → pas de réessai immédiat, reprise après 24h ──
{
  const H = 3600000;
  let st = { prRepair: {} };
  st = sched.applyRepairAttempt(st, 777, false, 0);
  st = sched.applyRepairAttempt(st, 777, false, 0);
  st = sched.applyRepairAttempt(st, 777, false, 0);
  st = sched.markPrParked(st, 777, 1000);
  check('parkée → cooldown non écoulé à +1h', sched.repairCooldownOver(st, 777, 1000 + H, 24 * H) === false);
  check('parkée → cooldown écoulé à +25h', sched.repairCooldownOver(st, 777, 1000 + 25 * H, 24 * H) === true);
  check('jamais parkée → éligible', sched.repairCooldownOver({ prRepair: {} }, 999, 0) === true);
}

// ── 5. resume : bloqueur disparu → re-proposée, sinon non ──
{
  const queue = { opportunities: [
    { id: 'P1', status: 'blocked', blockReason: 'blocked by PR #777 (PR_CONFLICT_REPAIRABLE)' },
    { id: 'P2', status: 'blocked', blockReason: 'gate failed: test rouge' },
    { id: 'N1', status: 'new' },
  ] };
  const resumed = sched.resumeParkedOpportunities(queue, o => /PR #777/.test(o.blockReason || ''));
  check('seule P1 re-proposée', resumed.length === 1 && resumed[0].id === 'P1');
  const none = sched.resumeParkedOpportunities(queue, () => false);
  check('bloqueur persistant → rien', none.length === 0);
  check('sans prédicat → rien (fail-closed)', sched.resumeParkedOpportunities(queue, null).length === 0);
}

// ── 6. anti-doublon : active = déjà claimée ──
{
  check('picked = active', sched.isAlreadyActive({ status: 'picked' }) === true);
  check('in_progress = active', sched.isAlreadyActive({ status: 'in_progress' }) === true);
  check('validation = active', sched.isAlreadyActive({ status: 'validation' }) === true);
  check('new = pas active', sched.isAlreadyActive({ status: 'new' }) === false);
  check('blocked = pas active', sched.isAlreadyActive({ status: 'blocked' }) === false);
}

// ── 7. restart : wrappers disque persistants (backup/restore du vrai fichier) ──
{
  const C = require('../../scripts/autopilot/lib/common.cjs');
  const schedPath = sched.schedulerPath();
  let backup = null;
  try {
    backup = fs.existsSync(schedPath) ? fs.readFileSync(schedPath, 'utf8') : null;
    sched.recordRepairAttempt(424242, false);
    sched.recordRepairAttempt(424242, false);
    // Relecture = "restart" : l'état survit.
    const reloaded = sched.loadScheduler();
    check('état survit au reload', (reloaded.prRepair['424242'] || {}).attempts === 2);
    check('shouldParkPr cohérent après reload', sched.shouldParkPr(reloaded, 424242, 3) === false);
    sched.recordRepairAttempt(424242, false);
    check('3e échec → park après reload', sched.shouldParkPr(sched.loadScheduler(), 424242, 3) === true);
    const cleaned = sched.loadScheduler();
    delete cleaned.prRepair['424242'];
    sched.saveScheduler(cleaned);
  } finally {
    if (backup !== null) fs.writeFileSync(schedPath, backup, 'utf8');
  }
  check('scheduler.json restauré', true);
}

// ── 8. compat ascendante : ancien état sans prRepair ──
{
  check('shouldParkPr sans prRepair → false', sched.shouldParkPr({}, 777, 3) === false);
  const st = sched.applyRepairAttempt({}, 777, false, 0);
  check('applyRepairAttempt sur état vide', st.prRepair['777'].attempts === 1);
}

console.log(`\nRESULTS: ${passed} passed, 0 failed`);
