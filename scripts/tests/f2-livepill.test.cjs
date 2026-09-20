#!/usr/bin/env node
/**
 * f2-livepill.test.cjs — F2 whiteness audit (2026-09-20, PR dédiée).
 *
 * La pill EN DIRECT (A.sg-seg.sg-live) portait un fond rgba(0,158,142,.12) :
 * ancêtres 100 % transparents jusqu'à BODY → le texte ink dépendait de la carte
 * derrière (worst-case mesuré CR 1.41, Playwright local mobile+desktop).
 * Fix visuel seul : fond OPAQUE même teinte (#e6f4f1) → label 17.28, age 6.1.
 * Ni layout, ni href, ni tracking, ni dot/halo. F3/F4/E11 intouchés.
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
  const CSS = read('src/app-runtime.css')

  // 1. Fond pill opaque (plus de canal alpha → plus de dépendance au fond carte).
  const m = CSS.match(/\.sg-live\{[^}]*background:([^;}!]+)/)
  ok(!!m, 'règle .sg-live avec background présent')
  const bg = (m && m[1].trim().toLowerCase()) || ''
  ok(/^#[0-9a-f]{6}$/.test(bg), `fond pill opaque (hex, sans alpha) : ${bg}`)
  ok(!/rgba?\([^)]*0\.(0[1-9]|1[0-9])[^)]*\)/.test(m ? m[0] : ''), 'aucune translucidité résiduelle dans la règle')

  // 2. Paires label/age ≥ WCAG AA 4.5 sur le fond pillar (resolved comic : ink #000000 ;
  //    fallback #0d0b14 ; age #5A5A5A — on exige AA sur les trois).
  const pill = bg.slice(1)
  for (const [name, fg] of [['label ink #000000', '000000'], ['label fallback #0d0b14', '0d0b14'], ['age #5A5A5A', '5a5a5a']]) {
    const cr = contrast(fg, pill)
    ok(cr >= 4.5, `${name} sur ${bg} : CR ${cr.toFixed(2)} ≥ 4.5`)
  }

  // 3. Règle scopée : dot/halo/label/age/tracking/href non embarqués dans le changement.
  ok(CSS.includes('.sg-live .sg-live-dot i'), 'pastille dot intacte')
  ok(CSS.includes('.sg-live .sg-live-lbl'), 'règle label intacte')
  ok(CSS.includes('.sg-live .sg-live-age'), 'règle age intacte')

  console.log(failures === 0 ? '\nF2-LIVEPILL TESTS: ALL PASS' : `\nF2-LIVEPILL TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()
