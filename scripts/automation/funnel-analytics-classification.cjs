/**
 * Shared attribution contract for Supabase funnel reports.
 *
 * Only exact, configured Sargagame production domains and stable production
 * Pages aliases qualify as production. Local/preview/unknown hosts remain
 * visible as data-quality diagnostics but never enter production conversion
 * counts. This module deliberately emits aggregate classifications only.
 */
const { getAllRegions } = require('../../regions/index.cjs')

const REGION_ALIASES = {
  mq: 'mq', martinique: 'mq',
  gp: 'gp', guadeloupe: 'gp',
  fl: 'florida', florida: 'florida', miami: 'florida',
  pc: 'puntacana', puntacana: 'puntacana', 'punta-cana': 'puntacana',
  rm: 'rivieramaya', rivieramaya: 'rivieramaya', 'riviera-maya': 'rivieramaya', cancun: 'rivieramaya',
  tu: 'tulum', tulum: 'tulum',
}

const PRODUCTION_HOSTS = new Map()
for (const region of getAllRegions()) {
  const host = normalizeHost(region.domain)
  if (host) PRODUCTION_HOSTS.set(host, region.id)
}

// Cloudflare Pages stable production aliases. Branch/commit preview aliases
// are intentionally not included and are classified as preview.
const STABLE_PAGES_HOSTS = {
  'sargagame.pages.dev': 'mq',
  'sargagame-mq.pages.dev': 'mq',
  'sargagame-gp.pages.dev': 'gp',
  'sargagame-florida.pages.dev': 'florida',
  'sargagame-puntacana.pages.dev': 'puntacana',
  'sargagame-rivieramaya.pages.dev': 'rivieramaya',
  'sargagame-tulum.pages.dev': 'tulum',
}
for (const [host, region] of Object.entries(STABLE_PAGES_HOSTS)) {
  PRODUCTION_HOSTS.set(host, region)
}

function parseEventParams(params) {
  let source = params
  if (typeof source === 'string') {
    try { source = JSON.parse(source) } catch (_) { source = {} }
  }
  source = source && typeof source === 'object' && !Array.isArray(source) ? source : {}

  let embedded = {}
  const raw = source.d
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) embedded = raw
  else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) embedded = parsed
    } catch (_) {}
  }
  return { ...embedded, ...source }
}

function normalizeHost(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null

  let host = raw
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'http://' + raw
    host = new URL(candidate).hostname.toLowerCase()
  } catch (_) {
    host = raw.split(/[/?#]/)[0]
  }

  host = host.replace(/^\[|\]$/g, '').replace(/^www\./, '')
  return host || null
}

function normalizeEvent(event) {
  return String(event || '').trim().replace(/^sg_/, '')
}

function normalizeRegion(island, params) {
  const p = parseEventParams(params)
  const host = normalizeHost(p.hostname || p.host || p.domain)
  if (host && PRODUCTION_HOSTS.has(host)) return PRODUCTION_HOSTS.get(host)

  const raw = String(p.region || island || '').trim().toLowerCase()
  const rawHost = normalizeHost(raw)
  if (rawHost && PRODUCTION_HOSTS.has(rawHost)) return PRODUCTION_HOSTS.get(rawHost)
  return REGION_ALIASES[raw] || raw || 'unknown'
}

function isLocalHost(host) {
  if (!host) return false
  return host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host === '0.0.0.0' ||
    host === 'host.docker.internal' ||
    host.endsWith('.local') ||
    host.endsWith('.test') ||
    host.endsWith('.invalid') ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
}

function isPreviewHost(host) {
  if (!host) return false
  return host.endsWith('.pages.dev') ||
    host.endsWith('.workers.dev') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.trycloudflare.com')
}

function classifyAnalyticsHost(params, island) {
  const p = parseEventParams(params)
  const host = normalizeHost(p.hostname || p.host || p.domain)
  const fallbackRegion = normalizeRegion(island, p)

  if (host && PRODUCTION_HOSTS.has(host)) {
    return { hostClass: 'production', host, region: PRODUCTION_HOSTS.get(host) }
  }
  if (isLocalHost(host)) {
    return { hostClass: 'local_test', host, region: fallbackRegion }
  }
  if (isPreviewHost(host)) {
    return { hostClass: 'preview', host, region: fallbackRegion }
  }
  return { hostClass: 'unknown_host', host: null, region: fallbackRegion }
}

function sessionIdFromParams(params) {
  const p = parseEventParams(params)
  const value = p.sid || p.session_id || p.sessionId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

module.exports = {
  PRODUCTION_HOSTS,
  parseEventParams,
  normalizeHost,
  normalizeEvent,
  normalizeRegion,
  classifyAnalyticsHost,
  sessionIdFromParams,
}
