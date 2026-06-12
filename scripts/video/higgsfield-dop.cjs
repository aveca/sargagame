#!/usr/bin/env node
/**
 * higgsfield-dop.cjs — image-to-video cinématique via l'API Higgsfield (DOP).
 * Clés lues depuis .env (HIGGSFIELD_API_KEY/SECRET). Poll le job, télécharge le mp4.
 *
 * Usage:
 *   node scripts/video/higgsfield-dop.cjs <imageUrl> <motionId> "<prompt>" [outName]
 *
 * Motions utiles (GET /v1/motions) :
 *   Dolly In  81ca2cd2-05db-4222-9ba0-a32e5185adfb
 *   Crane Up  68af9add-43ea-4261-a706-16b640fdcff9
 *   FPV Drone 7673d9e0-208c-4cf8-8b72-fce5b0e92ecb
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const env = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
const KEY = (env.match(/^HIGGSFIELD_API_KEY=(.+)$/m) || [])[1]?.trim()
const SEC = (env.match(/^HIGGSFIELD_SECRET=(.+)$/m) || [])[1]?.trim()
if (!KEY || !SEC) { console.error('Clés Higgsfield absentes de .env'); process.exit(1) }

const HEADERS = { 'hf-api-key': KEY, 'hf-secret': SEC, 'Content-Type': 'application/json' }

function req(method, p, body) {
  return new Promise((res, rej) => {
    const r = https.request({ host: 'platform.higgsfield.ai', path: p, method, headers: HEADERS }, x => {
      let b = ''; x.on('data', c => b += c); x.on('end', () => {
        if (x.statusCode >= 300) return rej(new Error(`HTTP ${x.statusCode}: ${b.slice(0, 300)}`))
        try { res(JSON.parse(b)) } catch (e) { res(b) }
      })
    })
    r.on('error', rej)
    if (body) r.write(JSON.stringify(body))
    r.end()
  })
}

function download(url, dest) {
  return new Promise((res, rej) => {
    const f = fs.createWriteStream(dest)
    https.get(url, r => {
      if (r.statusCode >= 300 && r.headers.location) return download(r.headers.location, dest).then(res).catch(rej)
      r.pipe(f); f.on('finish', () => f.close(res))
    }).on('error', rej)
  })
}

async function main() {
  const [imageUrl, motionId, prompt, outName] = process.argv.slice(2)
  if (!imageUrl || !motionId || !prompt) {
    console.log('usage: node higgsfield-dop.cjs <imageUrl> <motionId> "<prompt>" [outName]')
    process.exit(1)
  }
  console.log('Génération DOP…\n  image:', imageUrl, '\n  motion:', motionId)
  const job = await req('POST', '/v1/image2video/dop', {
    params: {
      model: 'dop-turbo',
      prompt,
      enhance_prompt: true,
      input_images: [{ type: 'image_url', image_url: imageUrl }],
      motions: [{ id: motionId, strength: 0.6 }],
    },
  })
  const id = job.id || job.job_set_id
  console.log('  job_set:', id)

  // Poll jusqu'à completion (timeout 8 min)
  const t0 = Date.now()
  let last = ''
  while (Date.now() - t0 < 8 * 60e3) {
    await new Promise(r => setTimeout(r, 10e3))
    const st = await req('GET', `/v1/job-sets/${id}`)
    const jobs = st.jobs || []
    const states = jobs.map(j => j.status).join(',') || st.status || '?'
    if (states !== last) { console.log('  état:', states, `(${Math.round((Date.now() - t0) / 1000)}s)`); last = states }
    const done = jobs.find(j => j.status === 'completed')
    if (done) {
      const url = done.results?.raw?.url || done.results?.min?.url || done.result?.url
      if (!url) { console.log('  completed mais pas d URL:', JSON.stringify(done).slice(0, 400)); process.exit(1) }
      const outDir = path.join(__dirname, 'out', 'higgsfield')
      fs.mkdirSync(outDir, { recursive: true })
      const dest = path.join(outDir, (outName || `dop-${Date.now()}`) + '.mp4')
      await download(url, dest)
      const mb = (fs.statSync(dest).size / 1e6).toFixed(1)
      console.log(`\n✓ ${dest} (${mb} Mo)\n  source: ${url.slice(0, 100)}…`)
      return
    }
    if (jobs.length && jobs.every(j => j.status === 'failed')) {
      console.log('  ÉCHEC:', JSON.stringify(jobs[0]).slice(0, 400)); process.exit(1)
    }
  }
  console.log('Timeout 8 min — job_set', id, '(vérifier plus tard via GET /v1/job-sets/' + id + ')')
  process.exit(1)
}
main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
