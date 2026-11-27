'use strict'

// tests/unit/autopilot-queue-persistence-loop.test.cjs
//
// GARDE-FOU : la boucle Factory doit CONVERGER, pas boucler a l'infini.
//
// RÉGRESSION RÉELLE (constatée le 2026-11-08 sur le PC du fondateur) :
// les opportunités issues de l'ANALYSE (observations) et de la DÉCOUVERTE
// autonome n'existaient qu'en mémoire — elles n'étaient jamais écrites dans
// `.ai/autopilot/queue.json`. Or `parkTask()` appelle
// `mem.updateOpportunity()`, qui renvoie `null` sur une opportunité absente
// de la queue : le parcage était donc un NO-OP.
//
// Conséquence observable : la factory consommait un cycle toutes les 30 s,
// re-sélectionnait LE MÊME candidat, le re-parquait, et ne produisait AUCUN
// travail — indéfiniment. Le runner était « vivant », le heartbeat frais,
// les statuts GitHub publiés… et rien n'avançait.
//
// Ce test verrouille trois propriétés :
//   1. `memory.cjs` expose `upsertOpportunity()` ;
//   2. l'orchestrateur persiste l'opportunité AVANT tout parcage (et jamais en
//      mode `--dry`, qui ne doit rien muter) ;
//   3. fonctionnellement : après insertion, `updateOpportunity()` trouve
//      réellement l'entrée (c'est exactement ce qui manquait) et l'insertion
//      est idempotente.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const AUTOPILOT = path.join(ROOT, 'scripts', 'autopilot')
const MEMORY = path.join(AUTOPILOT, 'lib', 'memory.cjs')
const ORCHESTRATOR = path.join(AUTOPILOT, 'orchestrator.cjs')
const COMMON = path.join(AUTOPILOT, 'lib', 'common.cjs')

// ── 1. L'API de persistance existe ──────────────────────────────────────────

const memorySource = fs.readFileSync(MEMORY, 'utf8')
assert.ok(
  /function\s+upsertOpportunity\s*\(/.test(memorySource),
  'scripts/autopilot/lib/memory.cjs must define upsertOpportunity() — a candidate that only lives in memory can never be parked, so the loop re-selects it forever',
)
assert.ok(
  /module\.exports\s*=\s*\{[^}]*upsertOpportunity/.test(memorySource.replace(/\r?\n/g, ' ')),
  'scripts/autopilot/lib/memory.cjs must export upsertOpportunity()',
)

// ── 2. L'orchestrateur persiste AVANT de parquer ───────────────────────────

const orchestratorSource = fs.readFileSync(ORCHESTRATOR, 'utf8')
const processIdx = orchestratorSource.indexOf('async function processOpportunity')
assert.ok(processIdx > 0, 'orchestrator.cjs must define processOpportunity()')

const body = orchestratorSource.slice(processIdx, processIdx + 3000)
// Les commentaires sont retires : ils nomment eux-memes `parkTask()` et
// `upsertOpportunity()`, et fausseraient l'ordre des appels.
const bodyCode = body
  .split(/\r?\n/)
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')

const upsertIdx = bodyCode.indexOf('upsertOpportunity')
const parkIdx = bodyCode.indexOf('parkTask(')

assert.ok(upsertIdx > 0, 'processOpportunity() must persist the opportunity (upsertOpportunity) before it can be parked')
assert.ok(parkIdx > 0, 'processOpportunity() must be able to park a task')
assert.ok(
  upsertIdx < parkIdx,
  'processOpportunity() must persist the opportunity BEFORE calling parkTask() — otherwise the park is a no-op and the candidate is re-selected every cycle',
)

// Le mode `--dry` ne doit RIEN muter : l'upsert est donc conditionne.
assert.ok(
  /if\s*\(\s*!DRY\s*\)/.test(bodyCode.slice(0, upsertIdx)),
  'the queue upsert must be skipped in --dry mode — a dry run must never mutate the queue',
)

// ── 3. Test FONCTIONNEL sur une queue isolée ────────────────────────────────
//
// `memory.cjs` dérive ses chemins de `common.cjs` via `ROOT = <dossier>/../
// ..`. On recopie donc les deux modules dans une arborescence factice : la
// queue visée est alors celle du dossier temporaire, jamais celle du dépôt.

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sarga-queue-'))
try {
  const libDir = path.join(tmpRoot, 'scripts', 'autopilot', 'lib')
  fs.mkdirSync(libDir, { recursive: true })
  fs.copyFileSync(MEMORY, path.join(libDir, 'memory.cjs'))
  fs.copyFileSync(COMMON, path.join(libDir, 'common.cjs'))

  const mem = require(path.join(libDir, 'memory.cjs'))
  const isolatedCommon = require(path.join(libDir, 'common.cjs'))

  assert.equal(
    typeof mem.upsertOpportunity,
    'function',
    'upsertOpportunity() must be callable',
  )
  assert.ok(
    isolatedCommon.paths.queue.startsWith(tmpRoot),
    'the isolated queue must live inside the temporary directory (test isolation)',
  )

  const candidate = {
    id: 'OPP-DISC-test-loop',
    fingerprint: 'console-error|mq|/test',
    type: 'console-error',
    region: 'mq',
    route: '/test',
    title: 'console-error on mq//test',
    severity: 'medium',
    actionable: 'agent',
    evidence: 'Uncaught TypeError: x is not a function',
    expectedImpact: 'supprimer les erreurs JavaScript qui bloquent l interaction',
    metric: 'console errors count',
    rollback: 'revert du commit',
    status: 'new',
    scope: { files: ['src/Sargasses_PROD.jsx'] },
  }

  const inserted = mem.upsertOpportunity(candidate)
  assert.ok(inserted, 'upsertOpportunity() must return the inserted opportunity')
  assert.equal(inserted.id, candidate.id)

  // C'est LE point du correctif : `updateOpportunity()` (donc `parkTask()`)
  // doit maintenant RETROUVER l'opportunite.
  const patched = mem.updateOpportunity(candidate.id, { status: 'blocked', blockReason: '[blocked] test' })
  assert.ok(
    patched,
    'updateOpportunity() must find the persisted opportunity — this is exactly what was missing and what made parkTask() a no-op',
  )
  assert.equal(patched.status, 'blocked')

  const queue = mem.loadQueue()
  const stored = (queue.opportunities || []).find((o) => o.id === candidate.id)
  assert.ok(stored, 'the opportunity must be readable back from the queue file')
  assert.equal(stored.status, 'blocked')

  // Idempotence : re-inserer ne doit PAS dupliquer l'entree.
  mem.upsertOpportunity(candidate)
  const after = mem.loadQueue()
  const matches = (after.opportunities || []).filter((o) => o.id === candidate.id)
  assert.equal(matches.length, 1, 'upsertOpportunity() must not duplicate an opportunity already in the queue')

  // Une opportunite absente ou sans id est refusee sans rien ecrire.
  assert.equal(mem.upsertOpportunity(null), null)
  assert.equal(mem.upsertOpportunity({}), null)
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}

console.log(
  'PASS: the Factory loop converges (an opportunity is persisted before being parked, the park is therefore effective, the upsert is idempotent, and --dry never mutates)',
)
