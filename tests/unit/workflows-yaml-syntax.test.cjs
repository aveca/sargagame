#!/usr/bin/env node
// workflows-yaml-syntax.test.cjs — régression des workflows GitHub Actions.
// Défauts production 2026-10-13 : daily-copernicus.yml (l.324 `with: fetch-depth: 0`
// inline = YAML invalide, runs échouant sans jobs à chaque push) et agent-handoff.yml
// (steps dé-dédentés + heredoc Python à la colonne 1 = YAML invalide, cron 4h mort).
// Ce test valide TOUT workflow *.yml TRACKED du dépôt via PyYAML (présent sur les
// runners ubuntu-latest) : toute future régression de syntaxe casse la CI avant merge.
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const ROOT = path.resolve(__dirname, '..', '..')
const WF = path.join(ROOT, '.github', 'workflows')

let fail = 0
function check(cond, label) {
  if (cond) console.log(`OK  ${label}`)
  else { console.error(`FAIL ${label}`); fail++ }
}

// python3 + PyYAML requis (standard sur ubuntu-latest). Vérif amont claire :
let pyOk = false
try { execFileSync('python3', ['-c', 'import yaml'], { stdio: 'ignore', timeout: 15000 }); pyOk = true } catch (_) {}
if (!pyOk) {
  console.error('FAIL python3/PyYAML indisponible — impossible de valider les workflows')
  process.exit(1)
}

const files = fs.readdirSync(WF).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).sort()
check(files.length >= 10, `workflows présents (${files.length} fichiers)`)

for (const f of files) {
  const full = path.join(WF, f)
  // Un seul à la fois : nom + verdict, échec avec la première erreur du parseur.
  const script = [
    'import sys, yaml, io',
    'sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")',
    'sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")',
    `d = yaml.safe_load(open(${JSON.stringify(full)}, encoding="utf-8"))`,
    'assert isinstance(d, dict) and "jobs" in d, "pas de jobs"',
    'on = d.get(True, d.get("on"))',
    'assert on is not None, "pas de trigger"',
    'for jid, j in d["jobs"].items():',
    '    assert "runs-on" in j, jid + ": pas de runs-on"',
    '    for st in j.get("steps", []):',
    '        if isinstance(st, dict) and str(st.get("uses", "")).startswith("actions/checkout"):',
    '            w = st.get("with")',
    '            if w is not None: assert isinstance(w, dict), jid + ": checkout.with pas un mapping"',
    'print("VALID")'
  ].join('\n')
  let verdict = ''
  try {
    verdict = execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 30000 }).trim()
  } catch (e) {
    console.error(`FAIL ${f} — YAML invalide ou structure GitHub Actions incorrecte:`)
    console.error('    ' + String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 4).join('\n    ').slice(0, 600))
    fail++
    continue
  }
  check(verdict === 'VALID', `${f} — YAML valide, jobs + triggers + steps structurels OK`)
}

console.log(fail ? `\n${fail} ECHEC(S)` : `\nWORKFLOWS_YAML_TESTS PASS (${files.length} workflows)`)
process.exit(fail ? 1 : 0)
