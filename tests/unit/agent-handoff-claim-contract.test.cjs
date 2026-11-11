/**
 * Agent Handoff — contrat d'état des tâches (single source of truth).
 *
 * Ces tests exercent le CONTRAT RÉEL (scripts/automation/agent-task-state.cjs),
 * pas une copie réimplémentée : c'est précisément cette réimplémentation qui a
 * laissé passer le défaut « Status line not found » (pick et claim n'avaient
 * pas le même contrat). Chaque test tourne sur des fixtures hermétiques.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const H = require('./helpers/agent-task-state.cjs')
const { runContract, runContractRaw, makeTempDir, writeFile } = H

const P0 = (status = '[ ] pending') => [
  '### TASK-P0-000. Test hermétique P0',
  '- **Priorité** : P0',
  '- **Rôle** : coding_agent',
  `- **Statut** : ${status}`,
  '- **Description** : entrée de test — jamais exécutée.',
  '',
  '### TASK-P9-900 Sentinelle de fin de fixture'
].join('\n')

const P1_DEVOPS = [
  '### TASK-P1-004. Remplacer les routes Cloudflare',
  '- **Priorité** : P1',
  '- **Rôle** : devops_agent + qa_agent',
  '- **Statut** : [ ] **BLOQUÉ par le déploiement** (gate satellite) — script prêt et vérifié en `plan`, **aucune écriture effectuée**',
  '- **Description** : mapping live prouvé.',
  '',
  '### TASK-P9-900 Sentinelle'
].join('\n')

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

// ── Contrat pick/claim ──────────────────────────────────────────────────────

test('pick retourne un statut [ ] sans texte (cause exacte du P1 « Status line not found »)', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', P0('[ ]'))
  const r = runContract(['pick', '--tasks', f])
  assert.strictEqual(r.taskId, 'TASK-P0-000', 'la tâche doit être sélectionnée')
  assert.strictEqual(r.agentType, 'coding', 'le rôle doit être normalisé')
  // le claim doit réussir sans lever « Status line not found »
  const cr = runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'coding'])
  assert.strictEqual(cr.ok, true)
})

test('le claim NE supprime PAS la ligne suivante (bug de franchissement de \\n)', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P0-000. Ligne suivante',
    '- **Priorité** : P0',
    '- **Rôle** : coding_agent',
    '- **Statut** : [ ] pending',
    '- **Description** : LIGNE IMPORTANTE A PRESERVER',
    '',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'coding'])
  const after = fs.readFileSync(f, 'utf8')
  assert.ok(after.includes('- **Description** : LIGNE IMPORTANTE A PRESERVER'),
    'la ligne suivante a été supprimée (régression du \\s* qui traverse le \\n)')
  assert.ok(after.includes('- **Statut** : [~] TASK-P0-000 — in_progress by coding_agent'))
})

test('pick normalise le vocabulaire : devops_agent -> devops, QA_agent -> qa, UX_agent -> ui, coding-agent -> coding', () => {
  for (const [role, expected] of [['devops_agent', 'devops'], ['QA_agent', 'qa'], ['UX_agent', 'ui'], ['coding-agent', 'coding']]) {
    const dir = makeTempDir()
    const content = [
      '### TASK-P0-000. Normalisation',
      '- **Priorité** : P0',
      `- **Rôle** : ${role}`,
      '- **Statut** : [ ] pending',
      '',
      '### TASK-P9-900 Sentinelle'
    ].join('\n')
    const f = writeFile(dir, 'tasks.md', content)
    const r = runContract(['pick', '--tasks', f])
    assert.strictEqual(r.agentType, expected, `${role} devrait devenir ${expected}`)
  }
})

test('pick saute une tâche dont le rôle n\'est pas dispatchable (pas de fausse sélection)', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P0-000. Rôle inconnu',
    '- **Priorité** : P0',
    '- **Rôle** : marketing',
    '- **Statut** : [ ] pending',
    '',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert.strictEqual(r.taskId, '', 'aucune tâche ne doit être sélectionnée')
  assert.strictEqual(r.reason, 'no_candidate')
})

test('pick saute une tâche avec plusieurs lignes de statut (fail-closed sur l\'ambiguïté)', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P0-000. Ambiguë',
    '- **Priorité** : P0',
    '- **Rôle** : coding_agent',
    '- **Statut** : [ ] pending',
    '- **Statut** : [x] done',
    '',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert.strictEqual(r.taskId, '', 'une tâche ambiguë ne doit pas être sélectionnée')
  const skipped = (r.skipped || []).find(s => s.taskId === 'TASK-P0-000')
  assert.ok(skipped, 'la tâche doit être listée dans les ignorées')
  assert.strictEqual(skipped.reason, 'ambiguous_status_lines')
})

test('pick saute une tâche sans ligne de statut, même si « [ ] » apparaît ailleurs (plus de repli)', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P0-000. Sans statut',
    '- **Priorité** : P0',
    '- **Rôle** : coding_agent',
    '- **Description** : contient un - [ ] dans le corps',
    '',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert.strictEqual(r.taskId, '', 'la tâche sans statut ne doit pas être sélectionnée via le repli')
  const skipped = (r.skipped || []).find(s => s.taskId === 'TASK-P0-000')
  assert.ok(skipped && skipped.reason === 'no_status_line')
})

test('pick est déterministe : même entrée -> même sortie', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', P0('[ ]'))
  const a = runContractRaw(['pick', '--tasks', f])
  const b = runContractRaw(['pick', '--tasks', f])
  assert.strictEqual(a, b, 'pick doit être déterministe')
})

test('pick ordonne par priorité puis par id (P0 avant P1)', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P2-001. Basse priorité en premier',
    '- **Rôle** : coding_agent',
    '- **Statut** : [ ] pending',
    '',
    '### TASK-P1-001. Haute priorité en second',
    '- **Rôle** : coding_agent',
    '- **Statut** : [ ] pending',
    '',
    '### TASK-P0-001. Critique en dernier',
    '- **Rôle** : coding_agent',
    '- **Statut** : [ ] pending',
    '',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const r = runContract(['pick', '--tasks', f])
  assert.strictEqual(r.taskId, 'TASK-P0-001', 'le P0 doit être sélectionné avant le P1/P2')
})

// ── Release (restauration exacte) ───────────────────────────────────────────

test('release restaure EXACTEMENT la ligne de statut d\'origine', () => {
  const dir = makeTempDir()
  const original = '- **Statut** : [ ] **BLOQUÉ par le déploiement** (gate satellite) — script prêt et vérifié en `plan`'
  const content = [
    '### TASK-P1-004. Remplacer les routes',
    '- **Priorité** : P1',
    '- **Rôle** : devops_agent + qa_agent',
    original,
    '- **Description** : mapping live.',
    '',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const stateFile = path.join(dir, 'state.json')
  runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P1-004', '--agent-type', 'devops', '--state-file', stateFile])
  const claimed = fs.readFileSync(f, 'utf8')
  assert.ok(claimed.includes('- **Statut** : [~] TASK-P1-004 — in_progress by devops_agent'))
  const rr = runContract(['release', '--tasks', f, '--out', f, '--state-file', stateFile])
  assert.strictEqual(rr.released, true, 'la restauration doit réussir')
  const restored = fs.readFileSync(f, 'utf8')
  assert.ok(restored.includes(original), 'la ligne d\'origine doit être restaurée au caractère près')
  assert.ok(!restored.includes('- **Statut** : [~] TASK-P1-004 — in_progress by devops_agent'),
    'le claim ne doit plus apparaître')
})

test('release est un no-op si la ligne de statut n\'est plus celle de CE claim', () => {
  const dir = makeTempDir()
  const content = [
    '### TASK-P1-004. Remplacer les routes',
    '- **Priorité** : P1',
    '- **Rôle** : devops_agent + qa_agent',
    '- **Statut** : [ ] pending_deploy',
    '',
    '### TASK-P9-900 Sentinelle'
  ].join('\n')
  const f = writeFile(dir, 'tasks.md', content)
  const stateFile = path.join(dir, 'state.json')
  // État fictif dont claimedLine ne correspond à rien dans le fichier
  fs.writeFileSync(stateFile, JSON.stringify({
    taskId: 'TASK-P1-004',
    agentType: 'devops',
    agentLabel: 'devops_agent',
    previousLine: '- **Statut** : [ ] pending_deploy',
    claimedLine: '- **Statut** : [~] TASK-P1-004 — in_progress by devops_agent (autre run)'
  }), 'utf8')
  const before = fs.readFileSync(f, 'utf8')
  const rr = runContract(['release', '--tasks', f, '--out', f, '--state-file', stateFile])
  assert.strictEqual(rr.released, false, 'la restauration doit être un no-op')
  assert.strictEqual(rr.reason, 'claim_not_ours')
  const after = fs.readFileSync(f, 'utf8')
  assert.strictEqual(after, before, 'le fichier ne doit pas être modifié')
})

test('claim rejette un rôle inconnu (évite le « Unknown agent type » du dispatch)', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', P0('[ ]'))
  let threw = false
  let msg = ''
  try {
    runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'marketing'])
  } catch (e) {
    threw = true
    msg = e && e.stderr ? e.stderr.toString() : (e.message || '')
  }
  assert.ok(threw, 'claim doit échouer pour un rôle inconnu')
  assert.ok(msg.includes('Unknown agent type'), 'message attendu « Unknown agent type »')
})

test('claim rejette une tâche déjà réclamée', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', P0('[ ]'))
  runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'coding'])
  let threw = false
  let msg = ''
  try {
    runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P0-000', '--agent-type', 'qa'])
  } catch (e) {
    threw = true
    msg = e && e.stderr ? e.stderr.toString() : (e.message || '')
  }
  assert.ok(threw)
  assert.ok(msg.includes('already claimed'))
})

test('claim rejette une tâche inexistante', () => {
  const dir = makeTempDir()
  const f = writeFile(dir, 'tasks.md', P0('[ ]'))
  let threw = false
  let msg = ''
  try {
    runContract(['claim', '--tasks', f, '--out', f, '--task-id', 'TASK-P3-999', '--agent-type', 'coding'])
  } catch (e) {
    threw = true
    msg = e && e.stderr ? e.stderr.toString() : (e.message || '')
  }
  assert.ok(threw)
  assert.ok(msg.includes('not found'))
})

// ── Garde-fous statiques sur le workflow ─────────────────────────────────────

test('le workflow délègue pick/claim/release au contrat (plus de copie inline)', () => {
  const wf = fs.readFileSync(H.WORKFLOW, 'utf8')
  // délégation effective
  assert.ok(wf.includes('agent-task-state.cjs pick'), 'pick doit appeler le contrat')
  assert.ok(wf.includes('agent-task-state.cjs claim'), 'claim doit appeler le contrat')
  assert.ok(wf.includes('agent-task-state.cjs" release') || wf.includes("agent-task-state.cjs' release") || wf.includes('agent-task-state.cjs release'),
    'release doit appeler le contrat')
  // plus de copie inline du parsing de statut : on retire les lignes de code
  // (hors commentaires) qui réimplémentaient le motif ou le « Status line not found ».
  const codeLines = wf.split(/\r?\n/).filter(l => !/^\s*#/.test(l)).join('\n')
  assert.ok(!/status_pattern\s*=/.test(codeLines), 'le motif inline status_pattern ne doit plus exister')
  assert.ok(!/status_match\s*=\s*re\.search/.test(codeLines), 'le parsing inline status_match ne doit plus exister')
  assert.ok(!/raise SystemExit\(f'Status line not found/.test(codeLines), 'le « Status line not found » inline ne doit plus exister')
})

test('le workflow contient une étape de release sur échec (if: failure())', () => {
  const wf = fs.readFileSync(H.WORKFLOW, 'utf8')
  assert.ok(/if:\s*\$\{\{\s*failure\(\)\s*&&/.test(wf), 'une étape doit être conditionnée sur failure()')
  assert.ok(/Release claim on failure/.test(wf), 'l\'étape de release doit être présente')
})

test('le vocabulaire du dispatch du workflow == le vocabulaire du contrat (pas de dérive)', () => {
  const wf = fs.readFileSync(H.WORKFLOW, 'utf8')
  // Extrait la section case "$AGENT_TYPE" in ... esac
  const start = wf.indexOf('case "$AGENT_TYPE" in')
  const end = wf.indexOf('esac', start)
  assert.ok(start >= 0 && end > start, 'bloc case introuvable')
  const block = wf.slice(start, end)
  // Labels : lignes « label) » ou « a|b|c) »
  const labels = new Set()
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_|-]+)\)\s*$/)
    if (!m) continue
    for (const part of m[1].split('|')) {
      const norm = part.trim().toLowerCase().replace(/-/g, '_')
      const stripped = norm.endsWith('_agent') ? norm.slice(0, -'_agent'.length) : norm
      const alias = stripped === 'ux' ? 'ui' : stripped
      if (alias && alias !== '*') labels.add(alias)
    }
  }
  const contract = new Set(H.runContract(['vocabulary']).roles)
  // toutes les étiquettes du workflow doivent être dans le contrat
  for (const l of labels) {
    assert.ok(contract.has(l), `étiquette du workflow « ${l} » absente du contrat`)
  }
  // toutes les rôles du contrat doivent être couverts par le workflow
  for (const r of contract) {
    assert.ok(labels.has(r), `rôle du contrat « ${r} » absent du dispatch du workflow`)
  }
})

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
