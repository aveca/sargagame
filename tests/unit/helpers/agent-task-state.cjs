/**
 * Helper partagé pour les tests du contrat d'état des tâches.
 * Résout l'interpréteur Node (la repo est pure Node) et exécute le contrat.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const SCRIPT = path.join(ROOT, 'scripts', 'automation', 'agent-task-state.cjs')
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'agent-handoff.yml')
const LIVE_TASKS = path.join(ROOT, '.ai', 'tasks.md')

function runContract (args, opts) {
  const options = opts || {}
  const cwd = options.cwd || ROOT
  const res = execFileSync('node', [SCRIPT].concat(args), {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return JSON.parse(res)
}

function runContractRaw (args, opts) {
  const options = opts || {}
  const cwd = options.cwd || ROOT
  const res = execFileSync('node', [SCRIPT].concat(args), {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return res
}

function makeTempDir () {
  const os = require('os')
  const tmpRoot = path.join(os.tmpdir(), 'opencode')
  try { fs.mkdirSync(tmpRoot, { recursive: true }) } catch (_) {}
  return fs.mkdtempSync(path.join(tmpRoot, 'sg-claim-'))
}

function writeFile (dir, name, content) {
  const p = path.join(dir, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf8')
  return p
}

module.exports = { ROOT, SCRIPT, WORKFLOW, LIVE_TASKS, runContract, runContractRaw, makeTempDir, writeFile }
