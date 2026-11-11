/**
 * Agent Handoff Task Claiming Tests
 *
 * Ces tests exercent le CONTRAT RÉEL (scripts/automation/agent-task-state.cjs),
 * pas une copie réimplémentée : c'est précisément cette réimplémentation qui a
 * laissé passer le défaut « Status line not found » (pick et claim n'avaient
 * pas le même contrat). Les scénarios historiques sont conservés, mais ils
 * pilotent désormais le contrat via son CLI.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const nodeAssert = require('assert')

const H = require('./helpers/agent-task-state.cjs')
const { runContract, runContractRaw, makeTempDir, writeFile } = H

let passed = 0
let failed = 0
function test (name, fn) {
  try {
    fn()
    console.log('  ✓ ' + name)
    passed++
  } catch (e) {
    console.log('  ✗ ' + name + ' :: ' + (e && e.message ? e.message : e))
    failed++
  }
}

const FIXTURE_P0 = [
  '### TASK-P0-000. Test hermétique P0',
  '- **Priorité** : P0',
  '- **Rôle** : coding_agent',
  '- **Statut** : [ ] disponible',
  '- **Description** : entrée de test — jamais exécutée.',
  '',
  '### TASK-P9-900 Sentinelle de fin de fixture'
].join('\n')

// Test 1: Parse tasks and pick next available (entrée P0 synthétique)
test('Parse tasks and pick next available (entrée P0 synthétique)', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', FIXTURE_P0)
  const r = runContract(['pick', '--tasks', f])
  assert(r && r.taskId === 'TASK-P0-000', 'Next task should be TASK-P0-000 (P0 priority)')
})

// Test 2: Claim TASK-P0-000
test('Claim TASK-P0-000', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', FIXTURE_P0)
  runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'coding'])
  const after = fs.readFileSync(f, 'utf8')
  assert(after.includes('- **Statut** : [~] TASK-P0-000 — in_progress by coding_agent'),
    'Status should be updated to in_progress')
  assert(!after.includes('in_progress by coding_agent disponible'),
    'the original tail should not survive in the claim line')
})

// Test 3: Claim already claimed task should fail
test('Claim already claimed task should fail', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', FIXTURE_P0)
  runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'coding'])
  let threw = false, msg = ''
  try { runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'qa']) }
  catch (e) { threw = true; msg = (e && e.stderr ? e.stderr.toString() : (e.message || '')) }
  assert(threw, 'should have thrown for already claimed task')
  assert(msg.includes('already claimed'), 'wrong error: ' + msg)
})

// Test 4: Claim non-existent task should fail
test('Claim non-existent task should fail', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', FIXTURE_P0)
  let threw = false, msg = ''
  try { runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P3-999', '--agent-type', 'coding']) }
  catch (e) { threw = true; msg = (e && e.stderr ? e.stderr.toString() : (e.message || '')) }
  assert(threw, 'should have thrown for non-existent task')
  assert(msg.includes('not found'), 'wrong error: ' + msg)
})

// Test 5: Priority ordering (P0 before P1 before P2)
test('Priority ordering (P0 first)', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P2-001. Lower priority first',
    '- **Statut** : [ ] pending',
    '### TASK-P1-001. Higher priority second',
    '- **Statut** : [ ] pending',
    '### TASK-P0-001. Highest priority last',
    '- **Statut** : [ ] pending',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert(r && r.taskId === 'TASK-P0-001', 'Expected TASK-P0-001, got ' + (r && r.taskId))
})

// Test 6: Malformed task (missing status) should be skipped
test('Malformed task without status line should be skipped', () => {
  const dir = makeTempDir()
  const content = FIXTURE_P0 + '\n\n### TASK-P9-001\nNo status line here\n'
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert(r && r.taskId === 'TASK-P0-000', 'Malformed task affected selection')
})

// Test 7: Empty backlog returns null (no candidate)
test('Empty backlog returns no candidate', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', '# Backlog\n\n---\n')
  const r = runContract(['pick', '--tasks', f])
  assert(r && r.taskId === '', 'Expected no candidate, got ' + (r && r.taskId))
})

// Test 8: Punctuation after the task ID is accepted
test('Punctuated task header is parsed', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P2-004. Transitions',
    '- **Rôle** : coding',
    '- **Statut** : [ ] pending',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert(r && r.taskId === 'TASK-P2-004', 'Expected TASK-P2-004, got ' + (r && r.taskId))
})

// Test 9: Priority extraction and ordering (P0 selected ahead of P1/P2)
test('Priority extraction and ordering', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P2-001. Lower priority first',
    '- **Statut** : [ ] pending',
    '### TASK-P1-001: Higher priority second',
    '- **Statut** : [ ] pending',
    '### TASK-P0-001 — Highest priority last',
    '- **Statut** : [ ] pending',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert(r && r.taskId === 'TASK-P0-001', 'Expected TASK-P0-001, got ' + (r && r.taskId))
})

// Test 10: le format réel du backlog est parsable sans crash
test('Le backlog live .ai/tasks.md est parsable par le contrat', () => {
  const r = runContract(['pick', '--tasks', H.LIVE_TASKS])
  assert(r && typeof r.taskId === 'string', 'pick doit renvoyer un JSON valide')
  // Aucune tâche n'est réclamable sur le backlog courant (toutes claimées/done/bloquées)
  nodeAssert.strictEqual(r.taskId, '', 'aucune tâche ne doit être réclamable sur le backlog courant')
  nodeAssert.strictEqual(r.reason, 'no_candidate')
})

// Test 11: déterminisme de pick sur le backlog live
test('pick est déterministe sur le backlog live', () => {
  const a = runContractRaw(['pick', '--tasks', H.LIVE_TASKS])
  const b = runContractRaw(['pick', '--tasks', H.LIVE_TASKS])
  nodeAssert.strictEqual(a, b, 'pick doit être déterministe')
})

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)

function assert (cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}
