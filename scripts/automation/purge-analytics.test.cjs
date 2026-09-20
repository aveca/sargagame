#!/usr/bin/env node
/**
 * purge-analytics.test.cjs — Test de régression G2 (purge analytics_events > 90j).
 *
 * Stratégie : mock local du REST PostgREST/Supabase (vrai HTTP, vraies requêtes
 * GET/DELETE du script réel lancé en process enfant). AUCUN appel prod.
 *
 * Cas couverts :
 *  1. 2500 lignes périmées + 10 fraîches → purge réelle supprime TOUTES les
 *     périmées (régression : l'ancien offset DELETE croissant 0-999/1000-1999…
 *     sautait un lot sur deux après décalage, des lignes survivaient à jamais).
 *  2. --dry → 0 suppression, lignes intactes.
 *  3. Sans SUPABASE_SERVICE_KEY → skip propre (exit 0, 0 hit HTTP).
 *  4. Le cutoff envoyé ≈ now - 90j (tolérance 5 min).
 *
 * Usage : node scripts/automation/purge-analytics.test.cjs (exit 1 si échec).
 * Découvert automatiquement par scripts/run-tests.cjs (npm test).
 */
const http = require('http')
const { execFile } = require('child_process')
const path = require('path')

const SCRIPT = path.join(__dirname, 'purge-analytics.cjs')
const DAY = 86400000
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

function seedRows(staleCount, freshCount) {
  const now = Date.now()
  const rows = []
  for (let i = 0; i < staleCount; i++) {
    rows.push({ id: i + 1, ts: new Date(now - 100 * DAY).toISOString() }) // périmée (>90j)
  }
  for (let i = 0; i < freshCount; i++) {
    rows.push({ id: 100000 + i, ts: new Date(now - 1 * DAY).toISOString() }) // fraîche
  }
  return rows
}

// Mock PostgREST minimal : GET select=id & ts=lt.<cutoff> (+ Range) / DELETE ts=lt.<cutoff> (+ Range).
function startMock(rows, hits) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (!u.pathname.endsWith('/analytics_events')) {
      res.writeHead(404).end()
      return
    }
    const ltRaw = u.searchParams.get('ts') || '' // format "lt.<iso>"
    const cutoff = ltRaw.startsWith('lt.') ? ltRaw.slice(3) : ''
    hits.push({ method: req.method, cutoff, range: req.headers.range || '' })
    const stale = rows.filter((r) => r.ts < cutoff)
    const range = (req.headers.range || '0-999').split('-').map(Number)
    const slice = stale.slice(range[0], range[1] + 1)
    if (req.method === 'DELETE') {
      for (const r of slice) rows.splice(rows.indexOf(r), 1)
      res.writeHead(204, { 'Content-Range': `*/${slice.length}` }).end()
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(slice.map((r) => ({ id: r.id }))))
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function runScript(env, args) {
  return new Promise((resolve) => {
    execFile('node', [SCRIPT, ...args], { env, encoding: 'utf8', timeout: 60000 }, (err, stdout, stderr) => {
      resolve({ exit: err ? err.code || 1 : 0, out: (stdout || '') + (stderr || '') })
    })
  })
}

async function main() {
  // ── Cas 1 : purge réelle multi-lots (2500 périmées > cap 1000/requête) ──
  console.log('Cas 1 : purge réelle 2500 périmées + 10 fraîches')
  {
    const rows = seedRows(2500, 10)
    const hits = []
    const server = await startMock(rows, hits)
    const port = server.address().port
    const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_KEY: 'test-key' }
    const r = await runScript(env, [])
    server.close()
    ok(r.exit === 0, `exit 0 (got ${r.exit})`)
    ok(rows.length === 10, `10 fraîches restantes (got ${rows.length})`)
    ok(rows.every((x) => x.id >= 100000), 'aucune ligne fraîche supprimée')
    const deletes = hits.filter((h) => h.method === 'DELETE')
    ok(deletes.length >= 3, `≥3 DELETE par lots (got ${deletes.length})`)
    ok(deletes.every((h) => h.range === '0-999'), `tous les DELETE en tête de file 0-999 (got ${JSON.stringify([...new Set(deletes.map((h) => h.range))])})`)
    const cutoffMs = Date.parse(deletes[0] && deletes[0].cutoff)
    ok(Math.abs(cutoffMs - (Date.now() - 90 * DAY)) < 5 * 60000, 'cutoff ≈ now-90j')
    ok(/supprimée\(s\)/.test(r.out), 'stdout confirme la suppression')
  }

  // ── Cas 2 : --dry ne supprime rien ──
  console.log('Cas 2 : --dry')
  {
    const rows = seedRows(1500, 5)
    const hits = []
    const server = await startMock(rows, hits)
    const port = server.address().port
    const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_KEY: 'test-key' }
    const r = await runScript(env, ['--dry'])
    server.close()
    ok(r.exit === 0, `exit 0 (got ${r.exit})`)
    ok(rows.length === 1505, `0 suppression (got ${1505 - rows.length} supprimées)`)
    ok(hits.every((h) => h.method !== 'DELETE'), 'aucun DELETE émis en --dry')
    ok(/--dry/.test(r.out), 'stdout mentionne --dry')
  }

  // ── Cas 3 : sans clé → skip propre, 0 hit HTTP ──
  console.log('Cas 3 : sans SUPABASE_SERVICE_KEY')
  {
    const rows = seedRows(100, 0)
    const hits = []
    const server = await startMock(rows, hits)
    const port = server.address().port
    const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${port}` }
    delete env.SUPABASE_SERVICE_KEY
    const r = await runScript(env, [])
    server.close()
    ok(r.exit === 0, `exit 0 (got ${r.exit})`)
    ok(hits.length === 0, `0 hit HTTP (got ${hits.length})`)
    ok(rows.length === 100, 'lignes intactes')
  }

  console.log(failures === 0 ? '\nPURGE-ANALYTICS TESTS: ALL PASS' : `\nPURGE-ANALYTICS TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
})
