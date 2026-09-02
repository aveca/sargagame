'use strict'
// Cohérence free tier : public/api/copernicus[/<region>]/fc7/<id>.json doit être
// STRICTEMENT issu de _private/forecast-full.json (même série, même updatedAt).
// Détecte : fichier fc7 divergent de la source, id orphelin (plage sortie de
// couverture non purgée), série privée sans fichier public.
// Exécuté par run-tests.cjs. Échoue si la génération fc7 est cassée.

const fs = require('fs')
const path = require('path')

const BASE = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus')
let fails = 0
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { fails++; console.error('  ✗ ' + msg) } }

const dirs = fs.readdirSync(BASE).filter(d => {
  try { return fs.statSync(path.join(BASE, d)).isDirectory() && d !== 'fc7' } catch { return false }
})

let totalBeaches = 0
for (const d of ['', ...dirs]) {
  const priv = path.join(BASE, d, '_private', 'forecast-full.json')
  const fc7dir = path.join(BASE, d, 'fc7')
  if (!fs.existsSync(priv)) continue
  const data = JSON.parse(fs.readFileSync(priv, 'utf-8'))
  const weekly = data.weekly || {}
  const label = d || '(root)'

  // Chaque plage de la série privée a son fichier public fc7
  let missing = 0, divergent = 0
  for (const [id, fc] of Object.entries(weekly)) {
    if (!Array.isArray(fc) || fc.length < 2) continue
    const f = path.join(fc7dir, id + '.json')
    if (!fs.existsSync(f)) { missing++; continue }
    totalBeaches++
    const pub = JSON.parse(fs.readFileSync(f, 'utf-8'))
    if (pub.ok !== true || pub.id !== id || JSON.stringify(pub.forecast) !== JSON.stringify(fc)) divergent++
  }
  ok(missing === 0, `${label} : toutes les séries privées ont leur fc7 public (${missing} manquant)`)
  ok(divergent === 0, `${label} : fc7 === série privée, zéro divergence (${divergent})`)

  // Aucun orphelin : un fichier fc7 sans série privée correspondante
  if (fs.existsSync(fc7dir)) {
    const orphans = fs.readdirSync(fc7dir).filter(f => f.endsWith('.json'))
      .filter(f => !weekly[f.slice(0, -5)])
    ok(orphans.length === 0, `${label} : aucun fc7 orphelin (${orphans.length})`)
  }
}

ok(totalBeaches > 150, `couverture globale : ${totalBeaches} plages avec série 7 j gratuite (>150 attendu)`)
process.exit(fails ? 1 : 0)
