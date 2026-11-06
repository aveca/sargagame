#!/usr/bin/env node
/**
 * multi-repo-bridge.test.cjs �?" tests d�terministes (sans r�seau) du bridge
 * multi-d�p�t.
 *
 * Couvre :
 *   1. requiredContract : champs obligatoires pr�sents / manquants
 *   2. isAllowedRepo : d�p�t autoris� / rejet�
 *   3. fingerprint : d�terministe, int�gre le repo, diff�rent pour 2 d�p�ts
 *   4. toOpportunity : d�p�t inconnu (rejet), contrat incomplet (rejet),
 *      contrat valide (import, actionable, statut new)
 *   5. ingestMultiRepo mode dry : ne plante pas, n'�crit pas, retourne des
 *      z�ros quand aucun d�p�t n'a d'issue [AUTOPILOT].
 */
'use strict';

const assert = require('node:assert');
const cp = require('child_process');

// Mock de gh (pas d'appel r�seau) : retourne [] (aucune issue [AUTOPILOT]).
cp.execFileSync = () => '[]';

const bridge = require('./multi-repo-bridge.cjs');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) { console.log('  ok   ' + name); }
  else { failures += 1; console.log('  FAIL ' + name + ' ' + detail); }
}

console.log('=== 1. requiredContract ===');
{
  const full = { repository_full_name: 'aveca/bot-wow', issue_number: 1, task_id: 'T-1', priority: 'high', source: 'chatgpt', mode: 'agent', humanGate: false, moneyPath: false, acceptance: 'ok', rollback: 'revert' };
  const c1 = bridge.requiredContract(full);
  check('contrat complet valide', c1.ok === true, JSON.stringify(c1.missing));

  const partial = { repository_full_name: 'aveca/bot-wow', issue_number: 1 };
  const c2 = bridge.requiredContract(partial);
  check('contrat incomplet d�tect�', c2.ok === false, JSON.stringify(c2.missing));
  check('champs manquants list�s', c2.missing.includes('task_id') && c2.missing.includes('priority'));
}

console.log('=== 2. isAllowedRepo ===');
{
  check('aveca/bot-wow autoris�', bridge.isAllowedRepo('aveca/bot-wow') === true);
  check('aveca/sargagame autoris�', bridge.isAllowedRepo('aveca/sargagame') === true);
  check('d�p�t inconnu rejet�', bridge.isAllowedRepo('aveca/autre-repo') === false);
  check('cha�ne vide rejet�e', bridge.isAllowedRepo('') === false);
}

console.log('=== 3. fingerprint ===');
{
  const f1 = bridge.fingerprint('aveca/bot-wow', 1336, 'T-1');
  const f2 = bridge.fingerprint('aveca/bot-wow', 1336, 'T-1');
  const f3 = bridge.fingerprint('aveca/sargagame', 1336, 'T-1');
  const f4 = bridge.fingerprint('aveca/bot-wow', 1337, 'T-1');
  check('d�terministe', f1 === f2);
  check('int�gre le repository_full_name', f1 !== f3, 'm�me issue/task mais repo diff�rent');
  check('int�gre l issue number', f1 !== f4);
  check('format attendu', f1.startsWith('chatp-issue|aveca/bot-wow|1336|T-1'));
}

console.log('=== 4. toOpportunity ===');
{
  const issue = { number: 1336, url: 'https://github.com/aveca/bot-wow/issues/1336', title: '[AUTOPILOT] test', createdAt: '2026-11-06T00:00:00Z' };
  const taskValid = {
    task_id: 'T-1', id: 'T-1', title: 'T�che de test', mode: 'agent', source: 'chatgpt',
    priority: 'high', confidence: 'observed', evidence: 'preuve', rollback: 'revert du commit',
    humanGate: false, moneyPath: false, acceptance: 'crit�res ok',
    repository_full_name: 'aveca/bot-wow', issue_number: 1336,
    filesToModify: ['README.md'], filesToRead: [],
  };

  // D�p�t inconnu
  const o1 = bridge.toOpportunity(taskValid, issue, 'aveca/inconnu');
  check('d�p�t inconnu rejett�', o1.rejected === true, JSON.stringify(o1.reason));

  // Contrat incomplet
  const taskBad = { id: 'T-2', title: 'X', mode: 'agent' };
  const o2 = bridge.toOpportunity(taskBad, issue, 'aveca/bot-wow');
  check('contrat incomplet rejett�', o2.rejected === true, JSON.stringify(o2.reason));

  // Contrat valide -> import
  const o3 = bridge.toOpportunity(taskValid, issue, 'aveca/bot-wow');
  check('contrat valide import�', o3.rejected === undefined && o3.status === 'new', JSON.stringify(o3));
  check('repository_full_name pr�sent', o3.repository_full_name === 'aveca/bot-wow');
  check('issue_number pr�sent', o3.issue_number === 1336);
  check('actionable agent (pas humanGate)', o3.actionable === 'agent');
  check('fingerprint int�gre le repo', o3.fingerprint.startsWith('chatp-issue|aveca/bot-wow|1336|T-1'));
  check('acceptance pr�sente', o3.acceptance === 'crit�res ok');
  check('rollback pr�sent', o3.rollback === 'revert du commit');

  // humanGate => actionable human
  const taskHg = { ...taskValid, humanGate: true, id: 'T-HG' };
  const o4 = bridge.toOpportunity(taskHg, issue, 'aveca/sargagame');
  check('humanGate => actionable human', o4.actionable === 'human');
  check('d�p�t sargagame conserv�', o4.repository_full_name === 'aveca/sargagame');
}

console.log('=== 5. ingestMultiRepo (dry, pas d�criture) ===');
{
  // Avant : sauvegarder l'\u00e9tat de la queue pour v�rifier qu'elle n'est pas modifi�e en dry.
  const fs = require('fs');
  const path = require('path');
  const queuePath = path.join(process.cwd(), '.ai', 'autopilot', 'queue.json');
  const before = fs.existsSync(queuePath) ? fs.readFileSync(queuePath, 'utf8') : null;

  const result = bridge.ingestMultiRepo({ dry: true, log: () => {} });
  check('retour structur�', typeof result.imported === 'number' && typeof result.ignored === 'number' && typeof result.rejected === 'number');
  check('perRepo pr�sent pour les 2 d�p�ts', result.perRepo['aveca/bot-wow'] && result.perRepo['aveca/sargagame']);
  check('aucun import en dry (aucune issue AUTOPILOT)', result.imported === 0);
  check('queue non modifi�e en dry', before === null || fs.readFileSync(queuePath, 'utf8') === before);
}

console.log('');
if (failures === 0) {
  console.log('MULTI-REPO-BRIDGE TESTS : OK (' + failures + ' �chec)');
  process.exit(0);
} else {
  console.log('MULTI-REPO-BRIDGE TESTS : ' + failures + ' �CHEC(S)');
  process.exit(1);
}
