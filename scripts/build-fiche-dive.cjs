#!/usr/bin/env node
/**
 * build-fiche-dive.cjs — Extractor for design/proto-plage-plongee.html
 * Mirrors build-homeaz.cjs structure.
 * 
 * Usage: node scripts/build-fiche-dive.cjs
 * Output: scripts/lib/fiche-dive-assets.cjs (CJS, imported by vite.config.js)
 *
 * NEVER EDIT THE OUTPUT FILE — re-run this script when the proto changes.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const postcss = require('postcss')

const ROOT = path.resolve(__dirname, '..')
const SRC  = path.join(ROOT, 'design', 'proto-plage-plongee.html')
const OUT  = path.join(ROOT, 'scripts', 'lib', 'fiche-dive-assets.cjs')

const SCOPE = '#sg-fiche-dive'
const KF_PREFIX = 'sgfd-'

// ── CSS scoper ──────────────────────────────────────────────────────────────
// The proto CSS uses bare selectors (body, :root, .scroller, .viewport, #sp0…)
// that MUST NOT leak into the SPA — the <style> ships on EVERY beach page,
// including the 50% control group, so unscoped `body{…}` / `.viewport{…}` would
// repaint the whole site. We scope every rule under `#sg-fiche-dive`:
//   • html / body / :root            → the wrapper itself
//   • .x / #y / svg.scene / .a .b    → `#sg-fiche-dive <sel>` (descendant)
//   • @media / @supports             → recurse, scope inner rules, keep the query
//   • @keyframes name                → renamed `sgfd-name` (+ animation refs)
//                                       so they can't clobber an SPA keyframe.
function scopeSelector (sel) {
  const s = sel.trim()
  if (/^(html|body|:root)$/i.test(s)) return SCOPE
  // strip a leading standalone html/body/:root (followed by space or end)
  const stripped = s.replace(/^(html|body|:root)(?=\s|$)/i, '').trim()
  if (stripped === '') return SCOPE
  if (stripped === s && (s === SCOPE || s.indexOf(SCOPE + ' ') === 0)) return s
  return SCOPE + ' ' + stripped
}

function scopeCss (css) {
  const root = postcss.parse(css)
  const kfMap = {}
  // 1) rename keyframes + collect old→new
  root.walkAtRules(/^(-\w+-)?keyframes$/i, at => {
    const oldN = at.params.trim()
    if (!kfMap[oldN]) kfMap[oldN] = KF_PREFIX + oldN
    at.params = kfMap[oldN]
  })
  // 2) rewrite animation / animation-name references (whole-word)
  const kfNames = Object.keys(kfMap)
  if (kfNames.length) {
    root.walkDecls(/^(-\w+-)?animation(-name)?$/i, decl => {
      kfNames.forEach(oldN => {
        const re = new RegExp('\\b' + oldN.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'g')
        decl.value = decl.value.replace(re, kfMap[oldN])
      })
    })
  }
  // 3) prefix every style-rule selector (skip @keyframes step selectors)
  root.walkRules(rule => {
    const p = rule.parent
    if (p && p.type === 'atrule' && /keyframes$/i.test(p.name)) return
    rule.selectors = rule.selectors.map(scopeSelector)
  })
  return root.toString()
}

// Required anchor IDs from the proto engine (guard against regressions)
const REQUIRED_ANCHORS = [
  'scroller', 'viewport', 'cam', 'scene', 'gPose',
  'bc0', 'bc1', 'bc2', 'bc3', 'bc4', 'bc5',
  'nearbyHalos', 'fcStrip', 'regimeBox', 'factors'
]

function extract () {
  if (!fs.existsSync(SRC)) {
    console.error('ERROR: proto not found:', SRC)
    process.exit(1)
  }
  const html = fs.readFileSync(SRC, 'utf-8')

  // ── 1. CSS ──────────────────────────────────────────────────────────────
  const cssM = html.match(/<style>([\s\S]*?)<\/style>/i)
  if (!cssM) { console.error('CSS not found'); process.exit(1) }
  let CSS = cssM[1].trim()

  // ── 2. MARKUP (body content between <body> and last <script>) ───────────
  const bodyStart = html.indexOf('<body>') + 6
  const firstScript = html.lastIndexOf('<script>')
  if (bodyStart < 6 || firstScript < 0) { console.error('body/script markers not found'); process.exit(1) }
  let MARKUP = html.slice(bodyStart, firstScript).trim()

  // Remove debug toast (proto-only)
  MARKUP = MARKUP.replace(/<div id="trackToast"[\s\S]*?<\/div>\s*/i, '')
  // Remove sr-only h1 (shell provides the real <h1>)
  MARKUP = MARKUP.replace(/<h1 class="sr-only">[\s\S]*?<\/h1>\s*/i, '')

  // ── 3. ENGINE (content of the last <script>…</script>) ──────────────────
  const engineStart = firstScript + 8 // length of '<script>'
  const engineEnd   = html.lastIndexOf('</script>')
  if (engineEnd < engineStart) { console.error('engine end not found'); process.exit(1) }
  let ENGINE = html.slice(engineStart, engineEnd).trim()

  // Patch: replace the proto's DEBUG track() with a real one wired to the shell.
  // The proto track() writes to a #trackToast element that we strip from MARKUP
  // (debug toast removal above) — so the un-patched version throws
  // `null.textContent` on every track() call. Match the function body up to its
  // 2-space-indented closing brace (inner blocks are deeper/inline). The earlier
  // /* === ANALYTICS …/ regex never matched (proto comment says "TRACKING"), so
  // the debug version silently survived; the guard below now catches that.
  ENGINE = ENGINE.replace(
    /function track\([^)]*\)\s*\{[\s\S]*?\n  \}/,
    `function track(ev, params) {
    try { if (typeof window.__sgTrack === 'function') window.__sgTrack(ev, params); } catch(e) {}
  }`
  )

  // Patch: replace openPremium() to navigate via deep-link (SPA reads ?paywall=1)
  // NB: the proto declares the param as `source` — match any param name, and use a
  // single-line-greedy body ([^\n]*\}) so the inner object-literal `}` doesn't end
  // the match prematurely (that non-greedy bug mangled onShowMap into invalid JS).
  ENGINE = ENGINE.replace(
    /function openPremium\(\w*\)\s*\{[^\n]*\}/,
    `function openPremium(src) {
    track('sg_premium_modal_open', { source: 'fiche_' + (src||''), beach: DATA.beach && DATA.beach.id });
    window.location.href = '/?paywall=1&utm_source=' + encodeURIComponent('fiche_' + (src||''));
  }`
  )

  // Patch: replace onShowMap() to navigate
  ENGINE = ENGINE.replace(
    /function onShowMap\(\)\s*\{[^\n]*\}/,
    `function onShowMap() { window.location.href = '/carte-sargasses/'; }`
  )

  // Patch: remove MOCK data block (will be provided by window.__SG_BEACH__ injection)
  // Keep the DATA = {...} line that reads from INJ first, MOCK as fallback is fine for resilience

  // ── 4. Guard checks ─────────────────────────────────────────────────────
  const missing = REQUIRED_ANCHORS.filter(id => !MARKUP.includes(`id="${id}"`))
  if (missing.length) {
    console.error('ANCHOR MISSING in markup:', missing.join(', '))
    process.exit(1)
  }
  if (MARKUP.includes('trackToast')) {
    console.error('trackToast still present in MARKUP after removal — fix the extractor')
    process.exit(1)
  }
  // Guard: the conversion patches must actually have applied (catches proto param
  // renames that would silently leave the function un-patched).
  if (!ENGINE.includes("window.location.href = '/carte-sargasses/'")) {
    console.error('onShowMap patch did NOT apply — check the regex vs proto signature')
    process.exit(1)
  }
  if (!ENGINE.includes("?paywall=1")) {
    console.error('openPremium patch did NOT apply — check the regex vs proto signature')
    process.exit(1)
  }
  // Guard: the debug track() (writes to the stripped #trackToast) must be gone,
  // else every track() call throws null.textContent and kills the engine mid-scroll.
  if (/toast\.textContent/.test(ENGINE)) {
    console.error('track() patch did NOT apply — proto debug toast write still present')
    process.exit(1)
  }
  // Guard: the patched engine must be syntactically valid. vm.Script compiles the
  // source (without running it) and throws SyntaxError on malformed JS — this is
  // what would have caught the stray `});` that blanked every beach page.
  try {
    new (require('vm').Script)(ENGINE, { filename: 'fiche-dive-engine.js' })
  } catch (e) {
    console.error('ENGINE has a SyntaxError after patching — refusing to write:', e.message)
    process.exit(1)
  }

  // ── 4b. Scope the CSS under #sg-fiche-dive ───────────────────────────────
  // This is what makes the dive actually render in-app: the spans get their
  // vh heights (so sizeScroller() has something to scroll through) and the
  // journal/viewport/cam are styled — all WITHOUT touching the SPA or control.
  let CSS_SCOPED
  try {
    CSS_SCOPED = scopeCss(CSS)
  } catch (e) {
    console.error('CSS scoping failed — refusing to write:', e.message)
    process.exit(1)
  }
  // Guards: the load-bearing rules must survive scoping, or the dive is frozen/blank.
  const cssGuards = [
    ['#sg-fiche-dive .scroller', /#sg-fiche-dive\s+\.scroller\b/],
    ['#sg-fiche-dive .viewport', /#sg-fiche-dive\s+\.viewport\b/],
    ['#sg-fiche-dive #sp0 span-height', /#sg-fiche-dive\s+#sp0\b/],
    ['keyframes prefixed', /@keyframes\s+sgfd-/]
  ]
  for (const [label, re] of cssGuards) {
    if (!re.test(CSS_SCOPED)) {
      console.error(`CSS scope guard FAILED (${label}) — refusing to write`)
      process.exit(1)
    }
  }
  // No bare body/:root rule may remain (would leak to the SPA + control group).
  if (/(^|\})\s*(body|html|:root)\s*\{/.test(CSS_SCOPED)) {
    console.error('CSS scope guard FAILED — a bare body/html/:root rule leaked through')
    process.exit(1)
  }

  // ── 5. Write output ─────────────────────────────────────────────────────
  const banner = `// GENERATED by scripts/build-fiche-dive.cjs — DO NOT EDIT MANUALLY
// Source: design/proto-plage-plongee.html
// Re-generate: node scripts/build-fiche-dive.cjs
// Generated: ${new Date().toISOString()}
`
  const out = `${banner}
'use strict'

const FICHE_DIVE_CSS = ${JSON.stringify(CSS)}

const FICHE_DIVE_CSS_SCOPED = ${JSON.stringify(CSS_SCOPED)}

const FICHE_DIVE_MARKUP = ${JSON.stringify(MARKUP)}

const FICHE_DIVE_ENGINE = ${JSON.stringify(ENGINE)}

module.exports = { FICHE_DIVE_CSS, FICHE_DIVE_CSS_SCOPED, FICHE_DIVE_MARKUP, FICHE_DIVE_ENGINE }
`
  fs.writeFileSync(OUT, out, 'utf-8')
  console.log('   fiche-dive assets extracted → scripts/lib/fiche-dive-assets.cjs')
  console.log('   CSS:',        (CSS.length / 1024).toFixed(1), 'KB')
  console.log('   CSS_SCOPED:', (CSS_SCOPED.length / 1024).toFixed(1), 'KB')
  console.log('   MARKUP:',     (MARKUP.length / 1024).toFixed(1), 'KB')
  console.log('   ENGINE:',     (ENGINE.length / 1024).toFixed(1), 'KB')
  console.log('   Anchors OK:', REQUIRED_ANCHORS.join(', '))
}

extract()
