#!/usr/bin/env node
// scripts/autopilot/live-production-sentinel.cjs — Sentinel production.
//
// Changements tracés (mission factory-control#46 — sentinel-false-positives-20261013) :
//   1. Santé live ≠ santé CI : un échec GitHub Actions est un rapport séparé
//      (`report.ciFailures`), JAMAIS un incident live.
//   2. Empreinte obsolète (>FINGERPRINT_MAX_AGE_H sans revalidation récente) : ni
//      recyclage aveugle ni réutilisation de l'ancienne issue — le workflow la
//      compare avec `updatedAt`.
//   3. Rapport sensor absent/échoué → `NOT_PROVEN` documenté (cause + étape),
//      pas un incident live. La permission `wrangler tail` manquante est signalée.
//   4. Garde-fou inchangé : tout incident live réel reste HIGH severity, avec
//      domaine, preuve et empreinte horodatée.
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { evaluateObservation, MAX_AGE_MINUTES } = require('./check-predeploy-satellite-freshness.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const REPO = 'aveca/sargagame'
const OUT = path.join(ROOT, '.ai', 'autopilot', 'observations', 'live-production-latest.json')
// Fenêtre de validation de l'empreinte dédupliquée (heures). Au-delà, l'issue
// existante n'est plus considérée comme l'incident courant — une nouvelle issue
// est créée au lieu de commenter l'ancienne (réapparition, pas recyclage).
const FINGERPRINT_MAX_AGE_H = 48
const EXPECTED_TAIL_WORKERS = [
  'sargagame-mq',
  'sargagame-gp',
  'sargagame-florida',
  'sargagame-puntacana',
  'sargagame-rivieramaya',
  'sargagame-tulum',
]

function nowIso() { return new Date().toISOString() }
function safeError(e) { return String(e?.message || e).replace(/Bearer\s+\S+/ig, 'Bearer [REDACTED]').slice(0, 500) }
function fingerprintOf(text) {
  return require('crypto').createHash('sha256').update(String(text)).digest('hex').slice(0, 16)
}

async function fetchCheck(url) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'sg-sentinel/2' } })
    return { ok: res.status === 200, status: res.status, body: await res.text() }
  } catch (e) { return { ok: false, status: 0, error: safeError(e) } }
  finally { clearTimeout(timeout) }
}

async function checkDomain(domain) {
  const d = { domain, checks: [], errors: [] }
  for (const p of ['/', '/version.json', '/api/copernicus/sargassum.json']) {
    const r = await fetchCheck('https://' + domain + p)
    d.checks.push({ path: p, status: r.status, ok: r.ok })
    if (!r.ok) d.errors.push(p + '=' + (r.status || r.error || 'network'))
    if (p.endsWith('sargassum.json') && r.ok) {
      try {
        const data = JSON.parse(r.body)
        // Publication time is diagnostic metadata only; it cannot prove or
        // disprove the age of the satellite observation.
        const updatedAt = Date.parse(String(data.updatedAt || ''))
        d.publicationTimestampValid = Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt <= Date.now()
        d.publicationAgeMinutes = d.publicationTimestampValid
          ? Math.round((Date.now() - updatedAt) / 60000)
          : null

        // Publication age and observation age are separate contracts.
        const satellite = evaluateObservation(data.erddapTimestamp)
        if (satellite.ageMinutes == null || satellite.ageMinutes < 0) {
          d.operationalFreshness = {
            ok: false,
            status: 'NOT_PROVEN',
            reason: satellite.reason,
            limitMinutes: MAX_AGE_MINUTES,
          }
        } else {
          d.satelliteAgeMinutes = Math.round(satellite.ageMinutes)
          d.operationalFreshness = {
            ok: satellite.ok,
            status: satellite.ok ? 'WITHIN_SLA' : 'OPERATIONAL_SLA_BREACHED',
            reason: satellite.reason,
            limitMinutes: MAX_AGE_MINUTES,
          }
        }
      } catch (error) {
        d.errors.push('sargassum.json JSON invalide: ' + safeError(error))
      }
    }
  }
  d.httpOk = d.errors.length === 0
  d.ok = d.httpOk && d.operationalFreshness?.ok !== false
  d.ts = nowIso()
  return d
}

function collectWorkflowFailures() {
  const r = spawnSync(process.platform === 'win32' ? 'gh.exe' : 'gh',
    ['run', 'list', '-R', REPO, '--limit', '25', '--json', 'databaseId,name,workflowName,status,conclusion,headBranch,createdAt,updatedAt'],
    { cwd: ROOT, encoding: 'utf8', timeout: 30000, windowsHide: true })
  if (r.status !== 0) return { ok: false, error: safeError(r.stderr || r.stdout || 'gh run list failed'), failures: [] }
  try {
    const runs = JSON.parse(r.stdout || '[]')
    return { ok: true, failures: runs.filter(x => x.conclusion === 'failure').slice(0, 10) }
  } catch (e) { return { ok: false, error: safeError(e), failures: [] } }
}

function parseTailDir(dir) {
  const result = { errors: [], missing: [], total: 0, commandErrors: [], commandStatuses: [] }
  if (!dir || !fs.existsSync(dir)) {
    result.missing.push(dir || 'tail-dir')
    return result
  }

  const statusPath = path.join(dir, 'tail-status.txt')
  const errorPath = path.join(dir, 'tail-errors.txt')
  const statusByWorker = new Map()

  if (!fs.existsSync(statusPath)) {
    result.missing.push('tail-status.txt')
  } else {
    const statusText = fs.readFileSync(statusPath, 'utf8')
    for (const line of statusText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      const match = line.match(/^([A-Za-z0-9_-]+)=(-?\d+)$/)
      if (!match) {
        result.commandErrors.push({ worker: null, exitCode: null, detail: 'invalid tail-status line' })
        continue
      }
      statusByWorker.set(match[1], Number(match[2]))
    }
  }

  for (const worker of EXPECTED_TAIL_WORKERS) {
    if (!statusByWorker.has(worker)) {
      result.missing.push('status:' + worker)
      continue
    }
    const exitCode = statusByWorker.get(worker)
    const outcome = exitCode === 0 ? 'completed' : exitCode === 124 ? 'bounded-timeout' : 'command-error'
    result.commandStatuses.push({ worker, exitCode, outcome })
    // Exit 124 is the expected end of the bounded 35-second tail window.
    // Every other non-zero exit means the capture was not proven.
    if (exitCode !== 0 && exitCode !== 124) result.commandErrors.push({ worker, exitCode, detail: 'wrangler tail failed' })
  }

  if (!fs.existsSync(errorPath)) {
    result.missing.push('tail-errors.txt')
  } else {
    const errorText = fs.readFileSync(errorPath, 'utf8')
    for (const line of errorText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      const match = line.match(/^TAIL_COMMAND_ERROR=([A-Za-z0-9_-]+)\s+exit=(-?\d+)$/)
      if (!match) {
        result.commandErrors.push({ worker: null, exitCode: null, detail: 'unparsed tail command error' })
        continue
      }
      const worker = match[1]
      const exitCode = Number(match[2])
      if (!result.commandErrors.some(x => x.worker === worker && x.exitCode === exitCode)) {
        result.commandErrors.push({ worker, exitCode, detail: 'workflow recorded tail command error' })
      }
    }
  }

  for (const worker of EXPECTED_TAIL_WORKERS) {
    const name = worker + '.jsonl'
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) {
      result.missing.push(name)
      continue
    }
    result.total++
    const content = fs.readFileSync(file, 'utf8')
    // An empty file is a valid no-event window only when the bounded command
    // itself completed or timed out as expected. Exit failures are recorded above.
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const j = JSON.parse(line)
        if (j?.outcome === 'error' || (j?.logs && j.logs.length) || (j?.exceptions && j.exceptions.length)) {
          result.errors.push({ scriptName: worker, exceptions: (j.exceptions || []).length, logs: (j.logs || []).length })
        }
      } catch {
        // CLI failures are detected from exit codes and tail-errors.txt. Do not
        // silently treat non-JSON output containing an error as a proven capture.
        const exitCode = statusByWorker.get(worker)
        if ((exitCode === 0 || exitCode === 124 || exitCode === undefined) &&
          /\b(error|failed|unauthorized|forbidden|permission denied|not authorized)\b/i.test(line)) {
          result.commandErrors.push({ worker, exitCode: exitCode ?? null, detail: 'error text in non-JSON tail output' })
        }
      }
    }
  }

  result.commandErrors = result.commandErrors.filter((item, index, all) =>
    all.findIndex(x => x.worker === item.worker && x.exitCode === item.exitCode && x.detail === item.detail) === index
  )
  return result
}

function buildReport(input) {
  const { domains, ciFailures, tail, localErrors, at } = input
  const incidents = []
  for (const d of domains) {
    if ((d.errors || []).length > 0) incidents.push({ severity: 'high', subsystem: 'production-http', domain: d.domain, message: d.errors.join('; '), at: d.ts })
  }
  for (const x of tail.errors) {
    incidents.push({ severity: 'high', subsystem: 'cloudflare-worker', scriptName: x.scriptName, message: JSON.stringify(x).slice(0, 600), at })
  }
  for (const x of (localErrors || [])) {
    incidents.push({ severity: 'high', subsystem: 'local-runner', file: x.file, message: String(x.line).slice(0, 600), at })
  }
  const operationalSlaBreaches = domains.filter(d => d.operationalFreshness?.status === 'OPERATIONAL_SLA_BREACHED').length
  const operationalFreshnessUnverified = domains.filter(d => d.operationalFreshness?.status === 'NOT_PROVEN').length
  const domainFailures = domains.filter(d => d.ok === false).length
  const ok = incidents.length === 0 &&
    domainFailures === 0 &&
    operationalSlaBreaches === 0 &&
    operationalFreshnessUnverified === 0
  return {
    at,
    repo: REPO,
    ok,
    // Empreinte = incidents live uniquement (messages exacts) — jamais les échecs CI.
    fingerprint: fingerprintOf(incidents.map(x => x.subsystem + '|' + String(x.message).split('|')[0]).join('\n')),
    domains,
    domainFailures,
    operationalFreshness: {
      limitMinutes: MAX_AGE_MINUTES,
      breaches: operationalSlaBreaches,
      unverified: operationalFreshnessUnverified,
      status: operationalSlaBreaches > 0 ? 'OPERATIONAL_SLA_BREACHED' : operationalFreshnessUnverified > 0 ? 'NOT_PROVEN' : 'WITHIN_SLA',
    },
    incidents,
    // CI distinct : rapportée dans `ciFailures`, jamais dans `incidents`.
    ciFailures: ciFailures || { ok: false, error: 'not-collected', failures: [] },
    // Sondes sensor : visibles (notamment une permission manquante) mais JAMAIS
    // un incident live — l'absence complète est un NOT_PROVEN, pas une alarme.
    sensor: {
      ok: tail.missing.length === 0 && (tail.commandErrors || []).length === 0,
      status: tail.missing.length === 0 && (tail.commandErrors || []).length === 0 ? 'PROVEN' : 'NOT_PROVEN',
      missing: tail.missing,
      commandErrors: tail.commandErrors || [],
      commandStatuses: tail.commandStatuses || [],
      tailDirErrors: tail.errors.length,
      proven: tail.missing.length === 0 && (tail.commandErrors || []).length === 0,
    },
    localErrors: localErrors || [],
  }
}

async function main() {
  const domains = []
  for (const domain of ['sargasses-martinique.com', 'sargasses-guadeloupe.com', 'sargassummiami.com', 'sargassumpuntacana.com', 'sargassumcancun.com', 'sargazotulum.com']) {
    domains.push(await checkDomain(domain))
  }
  const ciFailures = collectWorkflowFailures()
  const tailDir = process.env.SG_TAIL_DIR || '/tmp/sg-tail'
  const tail = parseTailDir(tailDir)
  const localErrors = process.argv.includes('--skip-local') ? [] : []
  const report = buildReport({ domains, ciFailures, tail, localErrors, at: nowIso() })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    LIVE_HEALTH: report.incidents.length > 0 ? 'FAIL' : report.ok ? 'OK' : 'DEGRADED',
    fingerprint: report.fingerprint,
    domains: report.domains.length,
    incidents: report.incidents.length,
    operationalSlaBreaches: report.operationalFreshness.breaches,
    operationalFreshnessUnverified: report.operationalFreshness.unverified,
    operationalFreshnessStatus: report.operationalFreshness.status,
    // CI rapportée séparément — plus jamais mélangée avec les incidents live.
    ciFailures: report.ciFailures.failures.length,
    sensorOk: report.sensor.ok,
    sensorMissing: report.sensor.missing.length,
    sensorErrors: report.sensor.tailDirErrors,
    sensorCommandErrors: report.sensor.commandErrors.length,
    sensorStatus: report.sensor.status,
    localErrors: report.localErrors.length,
    output: OUT,
  }, null, 2))
  // The scheduled workflow uses this exit code to decide whether to open/update
  // a confirmed live-incident issue. Freshness degradation is represented by
  // report.ok=false and LIVE_HEALTH=DEGRADED, but must not create a new issue
  // comment every ten minutes while the same source observation remains stale.
  process.exitCode = report.incidents.length > 0 ? 2 : 0
}

// Export testable : main() ne s'exécute QUE via l'entrée directe, jamais via require.
module.exports = { buildReport, fingerprintOf, checkDomain, collectWorkflowFailures, parseTailDir, FINGERPRINT_MAX_AGE_H, EXPECTED_TAIL_WORKERS }

if (require.main === module) main().catch(e => { console.error('LIVE_SENTINEL_FATAL=' + safeError(e)); process.exitCode = 3 })
