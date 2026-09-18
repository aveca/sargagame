#!/usr/bin/env node
/**
 * ci-gate.test.cjs — Test G15 (CI gate : smoke exit-1 + budget check en CI).
 *
 * Le Gate de ship exige build + budget + smoke 4 tokens. Avant G15, le smoke
 * sortait TOUJOURS exit 0 : un `&&` ou une étape CI sans grep validait à tort.
 * Ce test verrouille :
 *  1. ux-smoke.mjs sort exit ≠ 0 quand un token du Gate échoue (décision sur
 *     les 4 tokens : reached littéral complet, realErrors, whiteOut, rmInfinite).
 *  2. Les 4 tokens littéraux sont toujours imprimés (compat grep CI existante).
 *  3. ci-tests.yml + ci-funnel.yml : budget (bloquant) + smoke + grep des 4 tokens.
 *  4. perf-budget.yml : budget bloquant (pas de continue-on-error).
 *  5. check-bundle-budget.cjs sait sortir exit 1 (dépassement).
 *  6. Aucun workflow n'exécute ux-smoke.mjs en `run:` sans grep des 4 tokens.
 *
 * Les preuves comportementales (smoke vert sur build réel / rouge sur cible
 * cassée / ancien code vert-silencieux sur cible cassée) sont exécutées à la
 * main (lourd : Playwright + preview) et consignées dans MASTER_AUDIT.md.
 * Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

const TOKENS = [
  'FUNNEL_REACHED=map+fiche+paywall',
  'ERRORS=[]',
  'WHITE_OR_TRANSPARENT_BUTTONS=[]',
  'RM_INFINITE=[]',
]

function main() {
  console.log('G15 : smoke exit code')
  const smoke = read('scripts/ux-smoke.mjs')
  ok(/process\.exitCode\s*=\s*1/.test(smoke), 'ux-smoke.mjs pose exitCode 1 en échec')
  ok(/reached\s*===\s*['"]map\+fiche\+paywall['"]/.test(smoke), 'gate : reached littéral complet exigé')
  ok(/realErrors\.length\s*===\s*0/.test(smoke) && /whiteOut\.length\s*===\s*0/.test(smoke) && /rmInfinite\.length\s*===\s*0/.test(smoke), 'gate : décision sur les 4 tokens (errors/blancs/RM)')
  for (const t of ['FUNNEL_REACHED=', 'WHITE_OR_TRANSPARENT_BUTTONS=', 'ERRORS=', 'RM_INFINITE=']) {
    ok(smoke.includes(`console.log('${t}'`), `token imprimé (grep-compat) : ${t}…`)
  }

  console.log('G15 : budget check')
  const budget = read('scripts/check-bundle-budget.cjs')
  ok(budget.includes('process.exit(1)'), 'check-bundle-budget.cjs sort exit 1 en dépassement')

  console.log('G15 : wiring CI')
  const wfDir = path.join(ROOT, '.github', 'workflows')
  const wf = Object.fromEntries(
    fs.readdirSync(wfDir).filter((f) => f.endsWith('.yml')).map((f) => [f, read(path.join('.github', 'workflows', f))])
  )
  for (const f of ['ci-tests.yml', 'ci-funnel.yml', 'perf-budget.yml']) {
    ok(wf[f].includes('node scripts/check-bundle-budget.cjs'), `${f} exécute le budget`)
  }
  ok(!/continue-on-error:\s*true[\s\S]{0,200}?node scripts\/check-bundle-budget\.cjs/.test(wf['perf-budget.yml']), 'perf-budget.yml : budget bloquant')
  for (const f of ['ci-tests.yml', 'ci-funnel.yml']) {
    ok(wf[f].includes('node scripts/ux-smoke.mjs'), `${f} exécute le smoke`)
    // Les grep YAML écrivent 'ERRORS=\[\]' (échappé shell) : on compare sans backslashes.
    const flat = wf[f].replace(/\\/g, '')
    for (const t of TOKENS) {
      ok(flat.includes(t), `${f} grep le token ${t}`)
    }
  }
  // Aucun `run:` smoke sans grep des 4 tokens dans le même fichier.
  for (const [f, content] of Object.entries(wf)) {
    const runsSmoke = content.split('\n').some((l) => /run:/.test(l) && l.includes('ux-smoke.mjs'))
    if (!runsSmoke) continue
    const flat = content.replace(/\\/g, '')
    const hasAll = TOKENS.every((t) => flat.includes(t))
    ok(hasAll, `${f} : run smoke toujours accompagné des 4 grep`)
  }

  console.log(failures === 0 ? '\nCI-GATE TESTS: ALL PASS' : `\nCI-GATE TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

try { main() } catch (e) {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
}
