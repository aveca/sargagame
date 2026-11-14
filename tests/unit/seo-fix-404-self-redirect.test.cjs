'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  isSelfRedirect,
  validateHtaccess,
} = require('../../scripts/automation/lib/safety.cjs')

const root = path.resolve(__dirname, '..', '..')
const htaccess = fs.readFileSync(path.join(root, 'public', '.htaccess'), 'utf8')
const fixer = fs.readFileSync(path.join(root, 'scripts', 'automation', 'seo-fix-404.cjs'), 'utf8')

// Slash-only variants are the same URL for the generated optional-slash rule.
assert.equal(isSelfRedirect('/plages/anse-rodrigue/', '/plages/anse-rodrigue/'), true)
assert.equal(isSelfRedirect('/plages/anse-rodrigue', '/plages/anse-rodrigue/'), true)
assert.equal(isSelfRedirect('/plages/foo?utm_source=test', '/plages/foo/'), true)

// Real redirects must remain allowed.
assert.equal(isSelfRedirect('/plages/ancienne-anse/', '/plages/nouvelle-anse/'), false)
assert.equal(isSelfRedirect('/ancienne-route/', '/'), false)

// The validator must reject a literal self-redirect before it can be written.
const invalid = validateHtaccess('RewriteRule ^plages/demo/?$ /plages/demo/ [R=301,L]')
assert.ok(invalid.some(message => message.includes('self-redirect')))

// Current .htaccess must contain no self-redirecting 301 rules.
assert.deepEqual(validateHtaccess(htaccess), [])

// The scheduled fixer must apply the guard before adding a new rule.
assert.match(fixer, /isSelfRedirect\(path,\s*target\)/)

console.log('SEO_FIX_404_SELF_REDIRECT_TESTS PASS')
