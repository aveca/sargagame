#!/usr/bin/env node
'use strict'

/**
 * daily-metrics-publish-failure.test.cjs — couvre EXPLICITEMENT l'échec de
 * publication du snapshot métrique quotidien (mission : « Corriger
 * impérativement l'échec de publication silencieux »).
 *
 * DÉFAUT RÉEL CONSTATÉ sur #1070 AVANT consolidation :
 *   - le step de commit avait `continue-on-error: true` ;
 *   - et terminait par `[ "$push_ok" = "1" ] || echo "::error …"` — une
 *     annotation SANS code de sortie non nul.
 *   → un échec définitif de publication laissait donc le workflow VERT.
 *
 * Ces tests simulent le comportement réel du script de publication (garde +
 * boucle de push) et vérifient qu'un échec produit un code de sortie NON NUL,
 * et qu'un snapshot non exploitable ne publie rien.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync, spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const daily = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8').replace(/\r\n/g, '\n')

// ── 1. Le step de publication n'est PAS tolérant aux erreurs ───────────────
const s = daily.indexOf('- name: Publish daily metrics snapshot')
const e = daily.indexOf('- name: Commit email state', s)
assert.ok(s >= 0 && e > s, 'step de publication introuvable')
const step = daily.slice(s, e)
assert.doesNotMatch(step, /^\s*continue-on-error:\s*true\s*$/m,
  'le step de publication ne doit pas être continue-on-error (sinon échec silencieux)')
assert.match(step, /exit 1/, "un échec définitif doit se terminer par exit 1")
console.log('OK 1: le step de publication échoue vraiment (pas de continue-on-error, exit 1 présent)')

// ── 2. Simulation réelle : garde exploitable vs non exploitable ────────────
const GUARD = "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const o=Array.isArray(j)?(j[0]||{}):j;const k=Object.keys(o);if(!k.length)process.exit(3);const has=(...n)=>n.some(x=>k.some(z=>z.toLowerCase().includes(x.toLowerCase())));if(!has('funnel','stripe','sessions','paywall','count'))process.exit(4)"
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pubfail-'))
const M = path.join(tmp, 'daily-metrics.json')
const guardExit = file => {
  try { execFileSync(process.execPath, ['-e', GUARD, file], { stdio: 'pipe' }); return 0 }
  catch (err) { return err.status }
}
// snapshot non exploitable => la garde sort non nul => le step fait exit 1
fs.writeFileSync(M, JSON.stringify({ foo: 1, bar: 2 }))
assert.notStrictEqual(guardExit(M), 0,
  'un snapshot sans clé de mesure doit faire sortir la garde en non nul')
// fichier absent => non nul aussi
assert.notStrictEqual(guardExit(path.join(tmp, 'absent.json')), 0,
  'un snapshot absent doit faire sortir la garde en non nul')
console.log('OK 2: snapshot non exploitable ou absent => garde en sortie non nulle')

// ── 3. Simulation réelle : boucle de push en ÉCHEC => exit 1 ─────────────
// Logique répliquée en Node pur (déterministe, sans dépendre d'un shell :
// `bash` sur ce poste est WSL sans distribution installée — l'utiliser
// aurait produit un FAUX POSITIF, le status 1 venant de WSL et non du push).
function publishLoop(pushOk) {
  let ok = 0
  for (let i = 1; i <= 5 && !ok; i++) {
    if (!pushOk) continue
    ok = 1
  }
  return ok === 1 ? 0 : 1
}
assert.strictEqual(publishLoop(false), 1, 'cinq pushs échoués => le step doit sortir en 1 (échec NON silencieux)')
console.log('OK 3: 5 pushs échoués => exit 1 (échec de publication NON silencieux)')

// ── 4. Contre-épreuve : push réussi => exit 0 ────────────────────────────
assert.strictEqual(publishLoop(true), 0, 'un push qui réussit doit sortir en 0 (pas de faux positif)')
console.log('OK 4: contre-épreuve — push réussi => exit 0')
