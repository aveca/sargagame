'use strict';

// Read-only ERDDAP capture-window monitor contract tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SLA_MINUTES,
  dataBboxFor,
  buildErddapUrl,
  parseErddapTable,
  evaluateObservation,
  probeDataset,
} = require('../../scripts/probe-erddap-capture-window.cjs');

const ROOT = path.resolve(__dirname, '../..');

function pathsIgnore(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*paths-ignore:\s*$/.test(line));
  if (start < 0) return [];
  const keyIndent = lines[start].match(/^\s*/)[0].length;
  const itemIndent = keyIndent + 2;
  const entries = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent < itemIndent) break;
    const value = line.trim();
    if (value.startsWith('#')) continue;
    const match = value.match(/^-\s*(.+)$/);
    if (!match) break;
    entries.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return entries;
}

assert.equal(SLA_MINUTES, 900, 'the probe must keep the operational SLA at 900 minutes');

const mq = { id: 'mq', bbox: [-61.3, 14.3, -60.7, 14.9] };
assert.deepEqual(dataBboxFor(mq), {
  latMin: 13.5,
  latMax: 15.7,
  lngMin: -62,
  lngMax: -59.5,
});

const url = buildErddapUrl('https://example.test/dataset.json', dataBboxFor(mq));
assert.match(url, /AFAI\[\(last\)\]/);
assert.match(url, /\(13\.5\):\(15\.7\)/);
assert.match(url, /\(-62\):\(-59\.5\)/);

const table = {
  table: {
    columnNames: ['time', 'latitude', 'longitude', 'AFAI'],
    rows: [['2026-11-05T12:00:00Z', 14.5, -60.5, 0.01]],
  },
};
assert.deepEqual(parseErddapTable(table), {
  ok: true,
  timestamp: '2026-11-05T12:00:00Z',
  timestampMs: Date.parse('2026-11-05T12:00:00Z'),
});
assert.equal(parseErddapTable({ table: { columnNames: ['latitude'], rows: [[14.5]] } }).reason, 'missing-time-column');
assert.equal(parseErddapTable({ table: { columnNames: ['time'], rows: [] } }).reason, 'missing-time-value');
assert.equal(parseErddapTable({ table: { columnNames: ['time'], rows: [['not-a-date']] } }).reason, 'invalid-time-value');

const boundaryNow = Date.parse('2026-11-06T03:00:00Z');
assert.deepEqual(evaluateObservation('2026-11-05T12:00:00Z', boundaryNow), {
  ok: true,
  ageMinutes: 900,
  withinSla: true,
  status: 'WITHIN_SLA',
});
assert.equal(evaluateObservation('2026-11-05T12:00:00Z', boundaryNow + 1).status, 'OUTSIDE_SLA');
assert.equal(evaluateObservation('not-a-date', boundaryNow).status, 'UNKNOWN');
assert.equal(evaluateObservation('2026-11-06T04:00:00Z', boundaryNow).status, 'UNKNOWN');

(async () => {
  let requestedUrl = '';
  const mocked = await probeDataset(
    { id: 'AFAI_7D', url: 'https://example.test/afai.json' },
    mq,
    {
      nowMs: boundaryNow,
      fetchImpl: async (requestUrl, options) => {
        requestedUrl = requestUrl;
        assert.equal(options.method, 'GET');
        return { ok: true, status: 200, json: async () => table };
      },
    },
  );
  assert.equal(mocked.status, 'WITHIN_SLA');
  assert.match(requestedUrl, /AFAI\[\(last\)\]/);

  const workflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/erddap-capture-window-monitor.yml'),
    'utf8',
  );
  const daily = fs.readFileSync(
    path.join(ROOT, '.github/workflows/daily-copernicus.yml'),
    'utf8',
  );
  const production = fs.readFileSync(
    path.join(ROOT, '.github/workflows/cloudflare-production.yml'),
    'utf8',
  );
  const probeSource = fs.readFileSync(
    path.join(ROOT, 'scripts/probe-erddap-capture-window.cjs'),
    'utf8',
  );

  assert.match(workflow, /cron:\s*['"]\*\/15 0-5 \* \* \*['"]/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.doesNotMatch(workflow, /secrets\.|workflow_run|cloudflare-production|trigger-production-deploy|manual-ftp-deploy/);
  assert.doesNotMatch(probeSource, /writeFileSync|appendFileSync|git push|trigger-production-deploy|manual-ftp-deploy/);

  const probeWorkflowPath = '.github/workflows/erddap-capture-window-monitor.yml';
  const probeTestPath = 'tests/unit/erddap-capture-window-monitor.test.cjs';
  const probeScriptPath = 'scripts/probe-erddap-capture-window.cjs';
  for (const [name, source] of [['daily-copernicus.yml', daily], ['cloudflare-production.yml', production]]) {
    const ignored = pathsIgnore(source);
    assert.ok(ignored.includes(probeWorkflowPath), name + ' must ignore the read-only monitor workflow on push');
    assert.ok(ignored.includes(probeTestPath), name + ' must ignore the monitor guard test on push');
    assert.ok(ignored.includes(probeScriptPath), name + ' must ignore the read-only probe script on push');
  }

  console.log('PASS: ERDDAP probe is read-only, keeps the 900-minute SLA, and cannot trigger production deployment.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
