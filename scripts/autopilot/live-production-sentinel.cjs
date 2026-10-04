#!/usr/bin/env node
/**
 * live-production-sentinel.cjs — production observability bridge
 *
 * Checks public production surfaces, recent GitHub Actions failures, local
 * runner logs, and bounded Cloudflare Wrangler Tail captures. Emits a stable
 * JSON incident report suitable for the autonomous factory bridge.
 *
 * No secrets are printed. HTTP bodies are never persisted in full.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const REPO = process.env.GITHUB_REPOSITORY || 'aveca/sargagame';
const CONFIG = path.join(ROOT, '.ai', 'autopilot', 'config.json');
const OUT = path.join(ROOT, '.ai', 'autopilot', 'observations', 'live-production-latest.json');

const args = new Set(process.argv.slice(2));
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const health = cfg.health || {};
const requiredDomains = health.requiredDomains || [];
const warnDomains = health.warnDomains || [];
const domains = [...new Set([...requiredDomains, ...warnDomains])];
const timeoutMs = Number(process.env.SG_SENTINEL_TIMEOUT_MS || health.timeoutMs || 10000);

function now() { return new Date().toISOString(); }
function safeError(e) { return String(e?.message || e).replace(/Bearer\s+\S+/ig, 'Bearer [REDACTED]').slice(0, 500); }
function fingerprint(text) {
  return require('crypto').createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}
async function fetchCheck(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'sargagame-live-sentinel/1.0', ...(opts.headers || {}) },
      ...opts,
    });
    const body = await res.text();
    return {
      url, status: res.status, ok: res.ok, latencyMs: Date.now() - started,
      contentType: res.headers.get('content-type') || '',
      bytes: Buffer.byteLength(body),
      bodySignals: body.slice(0, 5000),
    };
  } catch (e) {
    return { url, ok: false, status: 0, latencyMs: Date.now() - started, error: safeError(e) };
  } finally { clearTimeout(t); }
}
async function checkDomain(domain) {
  const out = { domain, checks: [], errors: [] };
  for (const pathName of ['/', '/robots.txt', '/sitemap.xml', '/version.json']) {
    const r = await fetchCheck('https://' + domain + pathName);
    out.checks.push({ path: pathName, status: r.status, ok: r.ok, latencyMs: r.latencyMs, bytes: r.bytes, error: r.error || null });
    if (!r.ok) out.errors.push(pathName + ' HTTP ' + r.status + (r.error ? ' ' + r.error : ''));
  }
  const pay = await fetchCheck('https://' + domain + '/api/mollie.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: '__payment_smoke__' }),
  });
  const paymentOk = pay.status === 400 && !/payment_backend_not_configured|api_route_not_migrated/i.test(pay.bodySignals || '');
  out.checks.push({ path: '/api/mollie.php', kind: 'payment-smoke', status: pay.status, ok: paymentOk, latencyMs: pay.latencyMs });
  if (!paymentOk) out.errors.push('/api/mollie.php payment-smoke status=' + pay.status);
  if (out.errors.length) out.ok = false; else out.ok = true;
  return out;
}
function ghRuns() {
  const r = spawnSync(process.platform === 'win32' ? 'gh.exe' : 'gh',
    ['run','list','-R',REPO,'--limit','25','--json','databaseId,name,workflowName,status,conclusion,headBranch,createdAt,updatedAt'],
    { cwd: ROOT, encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (r.status !== 0) return { ok: false, error: safeError(r.stderr || r.stdout || 'gh run list failed'), failures: [] };
  try {
    const runs = JSON.parse(r.stdout || '[]');
    return { ok: true, failures: runs.filter(x => x.conclusion === 'failure').slice(0, 10) };
  } catch (e) { return { ok: false, error: safeError(e), failures: [] }; }
}
function recentLocalErrors() {
  const files = [
    path.join(ROOT, '.ai', 'autopilot', 'runs', 'runner.log'),
    path.join(ROOT, '.ai', 'autopilot', 'observations', 'latest.log'),
  ];
  const patterns = /(ERROR|FAILED|EXCEPTION|TypeError|ReferenceError|Unhandled|ECONNREFUSED|ETIMEDOUT|429|5\\d\\d)/i;
  const hits = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\\r?\\n/).slice(-2500);
    for (const line of lines) if (patterns.test(line)) hits.push({ file: path.relative(ROOT, f), line: line.slice(0, 800) });
  }
  return hits.slice(-100);
}
function parseTailDir(dir) {
  const incidents = [];
  if (!dir || !fs.existsSync(dir)) return incidents;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(dir, name);
    for (const line of fs.readFileSync(file, 'utf8').split(/\\r?\\n/)) {
      if (!line.trim()) continue;
      try {
        const x = JSON.parse(line);
        const badOutcome = x.outcome === 'exception' || x.outcome === 'canceled';
        const badLogs = Array.isArray(x.logs) && x.logs.some(l => ['error','warn'].includes(String(l.level).toLowerCase()));
        const badExceptions = Array.isArray(x.exceptions) && x.exceptions.length > 0;
        if (badOutcome || badLogs || badExceptions) incidents.push({
          file: name, scriptName: x.scriptName || null, outcome: x.outcome || null,
          exceptions: x.exceptions || [], logs: x.logs || [], eventTimestamp: x.eventTimestamp || null
        });
      } catch (_) {}
    }
  }
  return incidents.slice(-100);
}
async function main() {
  const report = { at: now(), repo: REPO, domains: [], github: null, localErrors: [], cloudflareTail: [], incidents: [] };
  if (!args.has('--skip-sites')) {
    for (const d of domains) report.domains.push(await checkDomain(d));
  }
  if (!args.has('--skip-gh')) report.github = ghRuns();
  if (!args.has('--skip-local')) report.localErrors = recentLocalErrors();
  report.cloudflareTail = parseTailDir(process.env.SG_TAIL_DIR);
  for (const d of report.domains.filter(x => !x.ok)) {
    const sev = requiredDomains.includes(d.domain) ? 'high' : 'medium';
    report.incidents.push({ severity: sev, subsystem: 'production-http', domain: d.domain, message: d.errors.join('; ') });
  }
  for (const x of report.localErrors) report.incidents.push({ severity: 'high', subsystem: 'local-runner', file: x.file, message: x.line });
  for (const x of report.cloudflareTail) report.incidents.push({ severity: 'high', subsystem: 'cloudflare-worker', scriptName: x.scriptName, message: JSON.stringify(x.exceptions || x.logs).slice(0, 1000) });
  if (report.github?.failures?.length) {
    for (const x of report.github.failures) report.incidents.push({ severity: 'high', subsystem: 'github-actions', runId: x.databaseId, workflow: x.workflowName || x.name, message: 'workflow failure: ' + (x.conclusion || 'failure') });
  }
  report.ok = report.incidents.length === 0;
  report.fingerprint = fingerprint(report.incidents.map(x => x.subsystem + '|' + x.message).join('\n'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    LIVE_HEALTH: report.ok ? 'OK' : 'FAIL',
    fingerprint: report.fingerprint,
    domains: report.domains.length,
    incidents: report.incidents.length,
    cloudflareErrors: report.cloudflareTail.length,
    githubFailures: report.github?.failures?.length || 0,
    localErrors: report.localErrors.length,
    output: OUT,
  }, null, 2));
  process.exitCode = report.ok ? 0 : 2;
}
main().catch(e => { console.error('LIVE_SENTINEL_FATAL=' + safeError(e)); process.exitCode = 3; });
