#!/usr/bin/env node
/**
 * Budget bundle — garde-fou anti-régression du chemin critique JS.
 *
 * Mesure la taille GZIP réelle du JS chargé EAGER au premier paint (le <script
 * type="module"> d'entrée + tous les <link rel="modulepreload">) dans dist/index.html,
 * et échoue (exit 1) si elle dépasse le budget. C'est la vraie métrique « combien
 * d'octets le navigateur doit télécharger+parser avant de pouvoir monter l'app ».
 *
 * Pourquoi gzip et pas le `chunkSizeWarningLimit` de Vite : Vite mesure le RAW
 * (non compressé) → ~3× la taille transférée, donc non corrélé à ce que vit le
 * mobile sur 4G. Ici on gzip chaque chunk eager comme le ferait le serveur.
 *
 * Budget réglable : BUNDLE_BUDGET_KB (défaut 195). Au moment de l'ajout, l'eager
 * réel ≈ 177 Ko gzip → ~10 % de marge pour absorber les ajouts mineurs sans rougir,
 * assez serré pour attraper une régression (ex. un chunk lazy redevenu eager).
 *
 * Usage : node scripts/check-bundle-budget.cjs   (après `vite build`)
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const DIST = path.resolve(__dirname, '..', 'dist')
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB || 195)
const indexPath = path.join(DIST, 'index.html')

if (!fs.existsSync(indexPath)) {
  console.error('✗ dist/index.html introuvable — lance `vite build` d\'abord.')
  process.exit(1)
}

const html = fs.readFileSync(indexPath, 'utf-8')

// Chunks EAGER = entry module + modulepreload (chargés avant le mount, pas les import() lazy).
const eager = new Set()
const entry = html.match(/<script[^>]+type="module"[^>]+src="(\/assets\/[^"]+\.js)"/)
if (entry) eager.add(entry[1])
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="(\/assets\/[^"]+\.js)"/g)) {
  eager.add(m[1])
}

if (eager.size === 0) {
  console.error('✗ Aucun chunk eager détecté dans dist/index.html — format inattendu.')
  process.exit(1)
}

let totalGzip = 0
const rows = []
for (const rel of eager) {
  const abs = path.join(DIST, rel)
  if (!fs.existsSync(abs)) {
    console.error('✗ Chunk référencé mais absent :', rel)
    process.exit(1)
  }
  const buf = fs.readFileSync(abs)
  const gz = zlib.gzipSync(buf, { level: 9 }).length
  totalGzip += gz
  rows.push({ rel, raw: buf.length, gz })
}

const kb = (n) => (n / 1024).toFixed(1) + ' Ko'
rows.sort((a, b) => b.gz - a.gz)
console.log('Budget bundle — JS eager (chemin critique) :')
for (const r of rows) console.log(`  ${kb(r.gz).padStart(9)} gzip  (${kb(r.raw)} raw)  ${r.rel}`)
const totalKb = totalGzip / 1024
console.log(`  ─────────`)
console.log(`  ${kb(totalGzip).padStart(9)} gzip TOTAL  /  budget ${BUDGET_KB} Ko`)

if (totalKb > BUDGET_KB) {
  console.error(`\n✗ ÉCHEC budget : ${totalKb.toFixed(1)} Ko > ${BUDGET_KB} Ko gzip.`)
  console.error('  → Un chunk lazy est-il redevenu eager ? Une grosse dép a-t-elle été ajoutée au chemin critique ?')
  process.exit(1)
}
console.log(`\n✓ OK : ${totalKb.toFixed(1)} Ko ≤ ${BUDGET_KB} Ko gzip.`)
