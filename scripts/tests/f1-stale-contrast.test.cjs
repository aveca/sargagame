#!/usr/bin/env node
/**
 * f1-stale-contrast.test.cjs — F1 whiteness audit (2026-09-18, PR dédiée).
 *
 * Le span date du pill carte (« il y a 1 j », WorldMapView.jsx, branche stale)
 * rendait #B87A00 sur pastille #fdf6e3 → CR 3.34 < WCAG AA 4.5 (mesuré Playwright
 * local+prod, mobile+desktop). Fix visuel seul : #8a5a00 (encre moderate déjà en
 * palette) → CR 5.49. Ni layout, ni copy, ni comportement.
 * Scope strict : F1 uniquement (F2/F3/F4 intouchés, voir .ai/whiteness-audit.md).
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

function lum(hex) {
  const c = [0, 2, 4].map(i => parseInt(hex.substr(i, 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrast(a, b) {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function main() {
  const WMV = read('src/WorldMapView.jsx')

  // 1. La branche stale utilise une couleur explicite (ternaire intact = comportement intact).
  const m = WMV.match(/color:updatedAt&&stale\?"(#[0-9a-fA-F]{6})":"(#[0-9a-fA-F]{6})"/)
  ok(!!m, 'ternaire stale/fresh du span date intact (comportement inchangé)')
  const stale = (m && m[1].slice(1)) || ''
  const fresh = (m && m[2].slice(1)) || ''

  // 2. Stale ≥ WCAG AA 4.5 sur la pastille (hypothèse de pairing verrouillée en 3).
  const PILL = 'fdf6e3'
  const crStale = contrast(stale, PILL)
  ok(crStale >= 4.5, `stale #${stale} sur #${PILL} : CR ${crStale.toFixed(2)} ≥ 4.5 (était 3.34)`)
  ok(stale.toLowerCase() !== 'b87a00', 'ancien doré #B87A00 purgé de la branche stale')

  // 3. Hypothèses de pairing : pastille crème + branche fresh intactes.
  ok(WMV.includes('background:"#fdf6e3"'), 'pastille #fdf6e3 intacte (pairing du calcul)')
  const crFresh = contrast(fresh, PILL)
  ok(fresh.toLowerCase() === '00786c', 'branche fresh #00786C intacte (hors scope F1)')
  ok(crFresh >= 4.5, `fresh #${fresh} sur #${PILL} : CR ${crFresh.toFixed(2)} ≥ 4.5 (inchangé)`)

  console.log(failures === 0 ? '\nF1-STALE-CONTRAST TESTS: ALL PASS' : `\nF1-STALE-CONTRAST TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
