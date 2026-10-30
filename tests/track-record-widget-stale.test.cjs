const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const htmlPath = path.join(__dirname, '..', 'public', 'pro', 'widget-sargasses-hotel', 'index.html')
const html = fs.readFileSync(htmlPath, 'utf8')
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
assert.ok(inlineScripts.length > 0, 'widget page must retain its inline behavior script')
const script = inlineScripts[inlineScripts.length - 1]

async function runWidget(trackRecord, options = {}) {
  const nowMs = options.nowMs ?? Date.parse('2026-10-24T05:03:00.000Z')
  const elements = new Map()
  const makeElement = () => {
    const classes = new Set()
    return {
      textContent: '',
      setAttribute() {},
      addEventListener() {},
      classList: {
        add(...names) { names.forEach(name => classes.add(name)) },
        remove(...names) { names.forEach(name => classes.delete(name)) },
        contains(name) { return classes.has(name) }
      }
    }
  }
  for (const id of [
    'demo-frame', 'snip', 'copy', 'fmt-full', 'fmt-compact',
    'fresh', 'freshpill', 'tr-clean', 'tr-headline'
  ]) elements.set(id, makeElement())
  elements.get('tr-clean').textContent = '—'
  elements.get('tr-headline').textContent = 'Chargement du palmarès en direct…'

  const FakeDate = class extends Date {
    static now() { return nowMs }
  }
  const fetch = url => {
    if (String(url).endsWith('/api/copernicus/sargassum.json')) {
      if (options.sargassumNetworkError) return Promise.reject(new Error('simulated sargassum network error'))
      return Promise.resolve({
        ok: options.sargassumHttpOk !== false,
        status: options.sargassumHttpStatus ?? 200,
        json: () => Promise.resolve({
          erddapTimestamp: options.sargassumErddapTimestamp ?? options.sargassumUpdatedAt ?? new Date(nowMs).toISOString(),
          updatedAt: options.sargassumUpdatedAt ?? new Date(nowMs).toISOString()
        })
      })
    }
    if (String(url).endsWith('/api/copernicus/track-record.json')) {
      if (options.networkError) return Promise.reject(new Error('simulated network error'))
      return Promise.resolve({
        ok: options.httpOk !== false,
        status: options.httpStatus ?? 200,
        json: () => Promise.resolve(trackRecord)
      })
    }
    return Promise.reject(new Error('Unexpected fetch URL: ' + url))
  }

  vm.runInNewContext(script, {
    Date: FakeDate,
    Promise,
    Number,
    Math,
    String,
    fetch,
    document: {
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, makeElement())
        return elements.get(id)
      }
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    setTimeout,
    clearTimeout
  })

  await new Promise(resolve => setTimeout(resolve, 0))
  return {
    metric: elements.get('tr-clean').textContent,
    headline: elements.get('tr-headline').textContent,
    freshnessLabel: elements.get('fresh').textContent,
    freshnessState: ['is-fresh', 'is-stale', 'is-unavailable'].find(state => elements.get('freshpill').classList.contains(state)) || null
  }
}

function record(overrides = {}) {
  return {
    generatedAt: '2026-10-24T04:03:00.000Z',
    window: { from: '2026-10-08', to: '2026-10-21' },
    sampleSize: 1323,
    freshness: { stale: false },
    overall: { statusHitRatePct: 76 },
    byRegime: { calm: { cleanReliabilityPct: 100, cleanSamples: 780 } },
    ...overrides
  }
}

;(async () => {
  {
    const result = await runWidget(record({
      generatedAt: '2026-08-05T02:37:06.845Z',
      sampleSize: 819,
      overall: { statusHitRatePct: 96 },
      freshness: { stale: false }
    }))
    assert.equal(result.metric, '—', 'old data must never remain visible as current proof')
    assert.match(result.headline, /périmé/i)
  }

  {
    const result = await runWidget(record())
    assert.equal(result.metric, '76%')
    assert.match(result.headline, /tous régimes confondus/)
    assert.match(result.headline, /1[\u202f ]323|1323/)
  }

  {
    const result = await runWidget(record({
      overall: { statusHitRatePct: null },
      sampleSize: 0
    }))
    assert.equal(result.metric, '100%')
    assert.match(result.headline, /prévisions « mer propre »/)
    assert.match(result.headline, /saison calme/)
    assert.doesNotMatch(result.headline, /tous régimes confondus/)
  }

  {
    const result = await runWidget(record({ freshness: { stale: true } }))
    assert.equal(result.metric, '—', 'explicit stale flag must override a recent timestamp')
    assert.match(result.headline, /périmé/i)
  }

  {
    const result = await runWidget(record({
      overall: { statusHitRatePct: 0 },
      sampleSize: 12
    }))
    assert.equal(result.metric, '0%', 'zero is a valid measured rate and must not fall through to another regime')
    assert.match(result.headline, /12 comparaisons/)
  }

  {
    const result = await runWidget(record(), { networkError: true })
    assert.equal(result.metric, '—')
    assert.match(result.headline, /indisponible/i)
  }

  {
    const result = await runWidget(record(), { sargassumErddapTimestamp: 'invalid-date' })
    assert.equal(result.freshnessState, 'is-unavailable')
    assert.match(result.freshnessLabel, /horodatage satellite invalide/i)
  }

  {
    const result = await runWidget(record(), {
      sargassumUpdatedAt: '2026-10-30T12:26:00.000Z',
      sargassumErddapTimestamp: '2026-10-23T15:03:00.000Z'
    })
    assert.equal(result.freshnessState, 'is-stale',
      'a recent publication timestamp cannot make an old satellite observation fresh')
    assert.match(result.freshnessLabel, /vérification en cours/i)
  }
  {
    const result = await runWidget(record(), {
      sargassumUpdatedAt: '2026-10-24T05:02:00.000Z',
      sargassumErddapTimestamp: '2026-10-23T15:03:00.000Z'
    })
    assert.equal(result.freshnessState, 'is-stale',
      'a recent publication timestamp must not override an older ERDDAP observation')
    assert.match(result.freshnessLabel, /vérification en cours/i)
  }


  {
    const result = await runWidget(record(), {
      sargassumErddapTimestamp: '2026-10-24T06:03:00.000Z'
    })
    assert.equal(result.freshnessState, 'is-unavailable')
    assert.match(result.freshnessLabel, /horodatage satellite incohérent/i)
  }

  {
    const result = await runWidget(record(), { sargassumHttpOk: false, sargassumHttpStatus: 503 })
    assert.equal(result.freshnessState, 'is-unavailable')
    assert.match(result.freshnessLabel, /fraîcheur satellite indisponible/i)
  }

  {
    const result = await runWidget(record(), { sargassumNetworkError: true })
    assert.equal(result.freshnessState, 'is-unavailable')
    assert.match(result.freshnessLabel, /fraîcheur satellite indisponible/i)
  }

  console.log('OK: track-record freshness plus satellite freshness success, stale timestamp, invalid/future timestamp, HTTP failure and network failure')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
