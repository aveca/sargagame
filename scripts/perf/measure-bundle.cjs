#!/usr/bin/env node
/**
 * Bundle baseline — raw + gzip size per built asset, sorted, with totals.
 *
 * Reproducible CWV/perf baseline: run before AND after each optimization to
 * prove the byte delta on the mobile critical path. Reads dist/assets/ (run
 * `npm run build` first). No deps — uses zlib.gzipSync for the same number the
 * CDN ships over the wire.
 *
 * Usage: node scripts/perf/measure-bundle.cjs [distDir]
 */
const { readFileSync, readdirSync, statSync, existsSync } = require('fs')
const { gzipSync } = require('zlib')
const { resolve, join, extname } = require('path')

const DIST = resolve(process.argv[2] || resolve(__dirname, '..', '..', 'dist'))
const ASSETS = join(DIST, 'assets')

function kb(n) { return (n / 1024).toFixed(1) + ' KB' }

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function main() {
  const root = existsSync(ASSETS) ? ASSETS : DIST
  if (!existsSync(root)) { console.error('No dist/ — run `npm run build` first.'); process.exit(1) }
  const files = walk(root).filter(f => /\.(js|css)$/.test(f))
  const rows = files.map(f => {
    const buf = readFileSync(f)
    return { name: f.replace(DIST + require('path').sep, ''), ext: extname(f), raw: buf.length, gz: gzipSync(buf, { level: 9 }).length }
  }).sort((a, b) => b.gz - a.gz)

  const totJs = rows.filter(r => r.ext === '.js').reduce((s, r) => s + r.gz, 0)
  const totCss = rows.filter(r => r.ext === '.css').reduce((s, r) => s + r.gz, 0)

  console.log('=== Bundle baseline (gzip / raw) ===\n')
  for (const r of rows) {
    console.log(`${kb(r.gz).padStart(10)} gz  ${kb(r.raw).padStart(10)} raw  ${r.name}`)
  }
  console.log('\n--- totals (gzip) ---')
  console.log(`JS  : ${kb(totJs)}`)
  console.log(`CSS : ${kb(totCss)}`)
  console.log(`ALL : ${kb(totJs + totCss)}`)
}

main()
