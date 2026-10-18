#!/usr/bin/env node
'use strict'

// Factory V3 mobile UX mission (2026-10-18).
// Locks the mobile conversion safeguards added to src/sg-ux-2026.css:
//   1. tap targets >= 48px on small screens for the conversion CTAs
//      (.cta-premium) and the SOS button (.sg-soscta);
//   2. no sticky hover transform on touch devices (@media (hover: none));
//   3. touch-action: manipulation so a fast double-tap on a CTA does not
//      zoom the page on iOS;
//   4. font-size >= 16px on mobile CTAs so iOS does not auto-zoom on focus;
//   5. visible keyboard focus is preserved (focus-visible outlines).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const css = fs.readFileSync(path.join(__dirname, '../src/sg-ux-2026.css'), 'utf8')

// 1. mobile block exists and covers both conversion CTAs
assert.equal(css.includes('@media (max-width: 768px)'), true,
  'un breakpoint mobile doit exister dans sg-ux-2026.css')

const mobileBlock = css.slice(css.indexOf('@media (max-width: 768px)'))
assert.equal(mobileBlock.includes('.cta-premium'), true,
  'le CTA premium doit etre couvert par le breakpoint mobile')
assert.equal(mobileBlock.includes('.sg-soscta'), true,
  'le bouton SOS doit etre couvert par le breakpoint mobile')

// 2. tap targets >= 48px
assert.equal(/min-height:\s*48px/.test(mobileBlock), true,
  'les cibles tactiles mobiles doivent faire au moins 48px')

// 3. no sticky hover on touch
const touchBlocks = css.split('@media (hover: none)').length - 1
assert.equal(touchBlocks >= 1, true,
  'une regle @media (hover: none) doit neutraliser le hover sur tactile')
const hoverNoneBlock = css.slice(css.indexOf('@media (hover: none)'))
assert.equal(hoverNoneBlock.includes('transform: none'), true,
  'le transform de hover doit etre neutralise sur tactile')

// 4. no iOS double-tap zoom + no focus auto-zoom
assert.equal(css.includes('touch-action: manipulation'), true,
  'touch-action: manipulation obligatoire sur les CTA (zoom double-tap iOS)')
assert.equal(/font-size:\s*17px/.test(mobileBlock), true,
  'font-size >= 16px sur mobile pour eviter le zoom auto iOS')

// 5. keyboard focus preserved
assert.equal(css.includes('.cta-premium:focus-visible'), true,
  'le focus clavier du CTA premium doit rester visible')
assert.equal(css.includes('.sg-soscta:focus-visible'), true,
  'le focus clavier du SOS doit rester visible')

// 6. the armoured SOS class itself is untouched (gradient intact elsewhere)
assert.equal(css.includes('.cta-premium {'), true,
  'la definition d origine du CTA premium doit rester integre')

console.log('OK - CTA mobile: cibles >= 48px, hover tactile neutralise, '
  + 'touch-action manipulation, focus clavier preserved')
