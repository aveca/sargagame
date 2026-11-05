'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const config = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
const entry = config.match(/\{ path: 'saison-sargasses-martinique', enPath: 'en\x2fsargassum-season', esPath: 'es\x2ftemporada-sargazo', title: '([^']+)', desc: '([^']+)' \}/)

assert.ok(entry, 'Martinique season editorial route remains configured')
const [, title, description] = entry

assert.equal(title, 'Période des sargasses en Martinique : quand en 2026 ?')
assert.equal(description, 'En Martinique, la saison des sargasses va généralement d’avril à octobre, avec un pic de mai à août. Calendrier mensuel pour choisir vos dates.')
assert.ok(title.length <= 60, 'title stays within the selected SERP length budget')
assert.ok(description.length <= 158, 'description stays within the selected SERP length budget')
assert.match(description, /d’avril à octobre/)
assert.match(description, /pic de mai à août/)
assert.doesNotMatch(description, /temps réel|en direct|live|updated daily|4\s*[×x]\s*(?:par jour|daily|a day)/i, 'snippet does not promise an unsupported live or refresh cadence')

console.log('MARTINIQUE_SEASON_SERP_COPY PASS (route, locale pair, query intent, seasonal range, freshness wording, length)')
