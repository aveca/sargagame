#!/usr/bin/env node
// Runner de tests sans framework : découvre tous les *.test.cjs du repo et lance
// chacun dans son propre process node. Échec global (exit 1) dès qu'un fichier
// sort != 0. Les tests existants (fb-gate, fb-review-gate) sont des scripts node
// natifs auto-exécutants ; tout nouveau *.test.cjs est pris automatiquement.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SKIP = new Set(['node_modules', 'dist', '.git', 'martinique-ftp', 'guadeloupe-ftp'])

function findTests(dir) {
  let out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue
      out = out.concat(findTests(path.join(dir, e.name)))
    } else if (/\.test\.cjs$/.test(e.name)) {
      out.push(path.join(dir, e.name))
    }
  }
  return out
}

const tests = findTests(ROOT)
if (!tests.length) { console.log('Aucun fichier *.test.cjs trouvé.'); process.exit(0) }

let failed = 0
for (const t of tests) {
  const rel = path.relative(ROOT, t)
  console.log(`\n▶ ${rel}`)
  try {
    execFileSync('node', [t], { stdio: 'inherit' })
  } catch (e) {
    failed++
    console.error(`✗ ÉCHEC : ${rel}`)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} fichier(s) de test OK`)
process.exit(failed ? 1 : 0)
