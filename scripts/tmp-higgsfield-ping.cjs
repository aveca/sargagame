// Ping API Higgsfield : GET /v1/motions (lecture seule, zéro crédit).
// Valide les clés .env + liste les presets caméra utiles pour les héros.
const fs = require('fs')
const path = require('path')
const https = require('https')

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
const KEY = (env.match(/^HIGGSFIELD_API_KEY=(.+)$/m) || [])[1]?.trim()
const SEC = (env.match(/^HIGGSFIELD_SECRET=(.+)$/m) || [])[1]?.trim()
if (!KEY || !SEC) { console.log('Clés absentes de .env'); process.exit(1) }

const get = p => new Promise((res, rej) => {
  https.get({ host: 'platform.higgsfield.ai', path: p, headers: { 'hf-api-key': KEY, 'hf-secret': SEC } }, r => {
    let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b }))
  }).on('error', rej)
})

get('/v1/motions').then(({ status, body }) => {
  console.log('HTTP', status)
  if (status !== 200) { console.log(body.slice(0, 300)); process.exit(1) }
  const d = JSON.parse(body)
  const list = Array.isArray(d) ? d : d.items || d.motions || []
  console.log('motions disponibles:', list.length)
  for (const m of list.slice(0, 15)) console.log(' -', m.id || m.name, '|', (m.name || m.description || '').slice(0, 60))
}).catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
