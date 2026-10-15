#!/usr/bin/env node
/**
 * Test de régression — exécution silencieuse des processus enfants sous Windows.
 *
 * Contexte : les tâches planifiées (SargaFactory/SargaFactory-Serve) lancent node
 * via wscript run-hidden.vbs → parent SANS console. Tout enfant console créé sans
 * windowsHide:true alloue sa propre console = fenêtre CMD/PowerShell visible qui
 * vole le focus (régression rapportée 2026-10-11).
 *
 * Partie A (statique) : tout appel child_process dans les scripts exécutables en
 * arrière-plan DOIT contenir windowsHide:true (Node → CREATE_NO_WINDOW).
 * Partie B (dynamique) : chaque signature (execSync/spawnSync/execFileSync/spawn)
 * avec windowsHide:true capture stdout et termine avec exit 0.
 * Partie C (dynamique, Windows) : simulation du lanceur de production — wscript
 * (parent sans console) → node → cmd /c echo → le pipeline termine et capture.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
let fail = 0
const ok = (cond, label) => { if (cond) console.log(`OK  ${label}`); else { console.error(`FAIL ${label}`); fail++ } }

// ── Partie A : scan statique ────────────────────────────────────────────────
const IN_SCOPE = [
  'scripts/local-factory/', 'scripts/factory-v3/', 'scripts/autopilot/',
  'scripts/video/', 'scripts/automation/pulse.cjs', 'scripts/agent-handoff.cjs',
  'scripts/run-tests.cjs', 'scripts/run-smoke.cjs',
  'scripts/lib/process-runner.cjs', 'scripts/lib/certification-gate.cjs',
]
// Faux positifs documentés : variable options contenant déjà windowsHide:true,
// ou wrappers internes couvrant windowsHide dans leur propre execFileSync.
const ALLOW = new Set([
  'scripts/autopilot/local-agent-executor.cjs:spawnSync:517','scripts/autopilot/local-agent-executor.cjs:execFileSync:519','scripts/autopilot/pr-automation.cjs:exec:33','scripts/autopilot/pr-automation.cjs:exec:38',
])

const CALL_RE = /(?:(?<![\w$.])|(?<=\bcp\.)|(?<=\bchild_process\.))(execFileSync|execSync|execFile|exec|spawnSync|spawn)\s*\(/g
function scan(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const lines = src.split('\n')
  const out = []
  let m
  CALL_RE.lastIndex = 0
  while ((m = CALL_RE.exec(src))) {
    const lineNo = src.slice(0, m.index).split('\n').length
    if (/function\s*$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue
    if (/^\s*\/\//.test(lines[lineNo - 1])) continue
    // corps de l'appel par equilibrage des parentheses
    const openIdx = src.indexOf('(', m.index + m[1].length)
    let depth = 0, end = -1, inStr = null, esc = false
    for (let i = openIdx; i < src.length; i++) {
      const c = src[i]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
      if (c === '(') depth++
      else if (c === ')') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) { out.push({ line: lineNo, call: m[1], why: 'parse' }); continue }
    const body = src.slice(m.index, end + 1)
    if (!/windowsHide\s*:\s*true/.test(body)) out.push({ line: lineNo, call: m[1], why: 'no-windowsHide' })
  }
  return out
}

const { readdirSync, statSync } = fs
function listFiles() {
  const files = []
  const walk = (dwell) => {
    for (const e of readdirSync(dwell, { withFileTypes: true })) {
      const p = path.join(dwell, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(cjs|mjs)$/.test(e.name)) files.push(p)
    }
  }
  for (const dir of ['scripts/local-factory', 'scripts/factory-v3', 'scripts/autopilot', 'scripts/video']) walk(path.join(ROOT, dir))
  for (const f of ['scripts/automation/pulse.cjs', 'scripts/agent-handoff.cjs', 'scripts/run-tests.cjs', 'scripts/run-smoke.cjs', 'scripts/lib/process-runner.cjs', 'scripts/lib/certification-gate.cjs']) files.push(path.join(ROOT, f))
  return files.map(p => path.relative(ROOT, p).replace(/\\/g, '/'))
}

const offenders = []
for (const rel of listFiles()) {
  for (const hit of scan(rel)) {
    const key = `${rel}:${hit.call}:${hit.line}`
    if (!ALLOW.has(key)) offenders.push(key + (hit.why === 'parse' ? ' [parse-intacte]' : ''))
  }
}
ok(offenders.length === 0, `statique: aucun appel child_process sans windowsHide:true dans le perimetre (${offenders.length} restant)${offenders.length ? ' :: ' + offenders.join(' ; ') : ''}`)

// ── Partie B : signatures dynamiques ────────────────────────────────────────
const r1 = cp.execSync('node -e "console.log(\'PING_SYNC\')"', { encoding: 'utf8', windowsHide: true }).trim()
ok(r1 === 'PING_SYNC', 'dynamique: execSync(.cmd-resolu par shell) + windowsHide → capture OK')
const r2 = cp.spawnSync(process.execPath, ['-e', 'process.stdout.write(\'PING_ARGV\')'], { encoding: 'utf8', windowsHide: true })
ok(r2.status === 0 && r2.stdout === 'PING_ARGV', 'dynamique: spawnSync(exe direct) + windowsHide → exit 0 + stdout')
const r3 = cp.execFileSync('node', ['-e', 'console.log(\'PING_FILE\')'], { encoding: 'utf8', windowsHide: true }).trim()
ok(r3 === 'PING_FILE', 'dynamique: execFileSync + windowsHide → capture OK')
if (process.platform === 'win32') {
  const r4 = cp.spawnSync('cmd.exe', ['/c', 'echo PING_SHELL'], { encoding: 'utf8', windowsHide: true })
  ok(r4.status === 0 && /PING_SHELL/.test(r4.stdout || ''), 'dynamique: cmd.exe /c + windowsHide → termine sans blocage')
} else {
  console.log('SKIP cmd.exe /c (non-Windows)')
}

// ── Partie C : chaine console-less (wscript, meme mecanisme que SargaFactory) ──
if (process.platform === 'win32') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-child-'))
  const marker = path.join(tmp, 'proof.txt')
  const childJs = path.join(tmp, 'child.js')
  const vbs = path.join(tmp, 'launch.vbs')
  fs.writeFileSync(childJs, [
    `const { spawnSync } = require('child_process')`,
    `const fs = require('fs')`,
    `const r = spawnSync('cmd.exe', ['/c', 'echo SILENT_OK'], { encoding: 'utf8', windowsHide: true })`,
    `fs.writeFileSync(${JSON.stringify(marker)}, 'exit=' + r.status + '|out=' + String(r.stdout).trim())`,
  ].join('\n'))
  fs.writeFileSync(vbs, [
    'Dim sh: Set sh = CreateObject("WScript.Shell")',
    `sh.Run "node ""${childJs.replace(/\\/g, '\\\\')}""", 0, True`,
  ].join('\r\n'))
  const lr = cp.spawnSync('wscript.exe', [vbs], { timeout: 60000, windowsHide: true })
  ok(lr.status === 0 && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').includes('SILENT_OK'),
    `dynamique: wscript(parent sans console) → node → cmd /c → termine, sortie capturee (${fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : 'marker absent'})`)
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (_) {}
} else {
  console.log('SKIP dynamique wscript (non-Windows)')
}

process.exit(fail ? 1 : 0)
