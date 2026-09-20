#!/usr/bin/env node
/**
 * secret-scan-scope.test.cjs — gate secret-scan couvre .ai/plans/* (2026-09-20).
 *
 * Contexte : `.ai/plans/security/plan.md` contenait une clé live Mollie,
 * invisible du gate à cause de l'exclusion `':(exclude).ai/plans/*`
 * (ajoutée en 59d630b7b contre des faux positifs historiques).
 * Fix : exclusion retirée + valeur purgée du worktree.
 * Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

function main() {
  const WF = read('.github/workflows/secret-scan.yml')
  const plans = read('.ai/plans/security/plan.md')

  // 1. `.ai/plans/*` n'est plus exclu du gate.
  ok(!WF.includes("':(exclude).ai/plans/*'"), "gate : exclusion '.ai/plans/*' retirée")

  // 2. Le reste est intact (exclusions prouvées contre faux positifs).
  ok(WF.includes("':(exclude)*-config.example.php'"), 'gate : exclusion *-config.example.php conservée')
  ok(WF.includes("':(exclude)NEXT_SESSION.md'"), 'gate : exclusion NEXT_SESSION.md conservée')
  ok(WF.includes("':(exclude)src/*.jsx'"), 'gate : exclusion src/*.jsx conservée')
  ok(WF.includes("'pk_(live|test)_'") || WF.includes('pk_(live|test)_'), 'gate : garde pk_live/pk_test (clés publisables) conservé')
  ok(WF.includes('sk_live_'), 'gate : pattern sk_live_ conservé')
  ok(WF.includes('live_[A-Za-z0-9]'), 'gate : pattern live_* conservé')

  // 3. Aucune clé live résiduelle sous .ai/plans/ (mêmes patterns que le gate).
  const stripped = plans.replace(/pk_(live|test)_[A-Za-z0-9_]+/g, '')
  ok(!/sk_live_[A-Za-z0-9]{20,}/.test(stripped) && !/live_[A-Za-z0-9]{20,}/.test(stripped),
    '.ai/plans/security/plan.md : zéro motif live_* (hors pk_ publisables)')

  // 4. Commande exacte du gate, rejouée en local : zéro hit.
  let hits = ''
  try {
    hits = execSync(
      `git grep -I -n -E 'sk_live_[A-Za-z0-9]{20,}|live_[A-Za-z0-9]{20,}' -- . ':(exclude)*-config.example.php' ':(exclude)NEXT_SESSION.md' ':(exclude)src/*.jsx' | grep -v -E 'pk_(live|test)_' || true`,
      { cwd: ROOT, encoding: 'utf8', shell: '/bin/bash' }
    )
  } catch (e) {
    try {
      hits = execSync(
        'git grep -I -n -E "sk_live_[A-Za-z0-9]{20,}|live_[A-Za-z0-9]{20,}" -- . ":(exclude)*-config.example.php" ":(exclude)NEXT_SESSION.md" ":(exclude)src/*.jsx"',
        { cwd: ROOT, encoding: 'utf8' }
      )
      hits = hits.split('\n').filter(l => !/pk_(live|test)_/.test(l)).join('\n').trim()
    } catch { hits = '' }
  }
  ok(hits.trim() === '', `gate rejoué en local : 0 hit${hits.trim() ? ' — ' + hits.trim().slice(0, 200) : ''}`)

  console.log(failures === 0 ? '\nSECRET-SCAN-SCOPE TESTS: ALL PASS' : `\nSECRET-SCAN-SCOPE TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
