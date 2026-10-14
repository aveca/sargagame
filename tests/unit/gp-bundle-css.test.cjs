#!/usr/bin/env node
'use strict'
// Régression GP-NO-BUNDLE-CSS : writeRegionIndex() prenait le 1er .css (/fonts/fonts.css).
const assert = require('assert')
const { pickBundleCss, hasBundleCss } = require('../../scripts/lib/bundle-css.cjs')
const html = `<link rel="stylesheet" href="/fonts/fonts.css" media="print">
<noscript><link rel="stylesheet" href="/fonts/fonts.css" /></noscript>
<script type="module" crossorigin src="/assets/index-AbC123.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-DX5vsFeD.css">`
assert.strictEqual(pickBundleCss(html), '/assets/index-DX5vsFeD.css', 'bundle CSS choisi, pas fonts.css')
assert.strictEqual(pickBundleCss('<link href="/fonts/fonts.css">'), '', 'aucun bundle → vide')
assert.ok(hasBundleCss(['/fonts/fonts.css', '/assets/index-x.css']))
assert.ok(!hasBundleCss(['/fonts/fonts.css']), 'fonts.css seul ne suffit pas')
assert.ok(!hasBundleCss([]))
console.log('OK — gp-bundle-css (5 assertions)')
