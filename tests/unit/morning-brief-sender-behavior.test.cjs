'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const senderPath = path.join(ROOT, 'scripts/automation/send-notifications.cjs');
let source = fs.readFileSync(senderPath, 'utf8');

const mainCall = source.lastIndexOf('\nmain().catch(');
assert.ok(mainCall > 0, 'sender CLI entry point must be present');
source = source.slice(0, mainCall);

const pickSignature = 'function pickTopForBrief(sargassum, island) {';
const messageSignature = "function buildBriefMessage(pick, islandName, lang = 'fr') {";
assert.ok(source.includes(pickSignature), 'beach picker must remain discoverable');
assert.ok(source.includes(messageSignature), 'message builder must remain discoverable');
source = source.replace(pickSignature, pickSignature + ' globalThis.__pickCalls += 1;');
source = source.replace(messageSignature, messageSignature + ' globalThis.__messageCalls += 1;');
source += '\nmodule.exports = { sendMorningBriefPush };\n';

const stalePayload = {
  source: 'erddap-live',
  erddapTimestamp: '2020-01-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
  dataAgeMinutes: 1,
  stale: false,
  levels: [{ id: 'mq001', name: 'Fixture beach', status: 'clean', score: 95 }],
  weekly: {},
};

const regions = [
  { id: 'florida', name: 'Florida', primaryLang: 'en', onesignalAppId: 'test-florida', domain: 'florida.invalid', beaches: [] },
  { id: 'puntacana', name: 'Punta Cana', primaryLang: 'en', onesignalAppId: 'test-puntacana', domain: 'puntacana.invalid', beaches: [] },
  { id: 'rivieramaya', name: 'Riviera Maya', primaryLang: 'es', onesignalAppId: 'test-rivieramaya', domain: 'rivieramaya.invalid', beaches: [] },
  { id: 'tulum', name: 'Tulum', primaryLang: 'es', onesignalAppId: 'test-tulum', domain: 'tulum.invalid', beaches: [] },
];

let networkCalls = 0;
const logs = [];
const fakeFs = {
  readFileSync(filePath) {
    if (String(filePath).endsWith(path.join('api', 'copernicus', 'florida', 'sargassum.json')) ||
        String(filePath).endsWith(path.join('api', 'copernicus', 'puntacana', 'sargassum.json')) ||
        String(filePath).endsWith(path.join('api', 'copernicus', 'rivieramaya', 'sargassum.json')) ||
        String(filePath).endsWith(path.join('api', 'copernicus', 'tulum', 'sargassum.json'))) {
      return JSON.stringify(stalePayload);
    }
    throw Object.assign(new Error('Unexpected file read: ' + filePath), { code: 'ENOENT' });
  },
  writeFileSync() {
    throw new Error('The Morning Brief freshness test must not write files');
  },
  mkdirSync() {
    throw new Error('The Morning Brief freshness test must not create directories');
  },
};
const fakeHttps = {
  request() {
    networkCalls += 1;
    throw new Error('Network access is forbidden in this test');
  },
};
const env = {
  ONESIGNAL_API_KEY_MQ: 'test-key-mq',
  ONESIGNAL_API_KEY_GP: 'test-key-gp',
  ONESIGNAL_API_KEY_FLORIDA: 'test-key-florida',
  ONESIGNAL_API_KEY_PUNTACANA: 'test-key-puntacana',
  ONESIGNAL_API_KEY_RIVIERAMAYA: 'test-key-rivieramaya',
  ONESIGNAL_API_KEY_TULUM: 'test-key-tulum',
};
const fakeRequire = (specifier) => {
  if (specifier === 'fs') return fakeFs;
  if (specifier === 'path') return path;
  if (specifier === 'https') return fakeHttps;
  if (specifier === '../lib/satellite-freshness.cjs') {
    return require('../../scripts/lib/satellite-freshness.cjs');
  }
  if (String(specifier).endsWith(path.join('regions', 'index.cjs'))) {
    return { getAllRegions: () => regions };
  }
  return require(specifier);
};

const moduleObject = { exports: {} };
const context = {
  require: fakeRequire,
  module: moduleObject,
  exports: moduleObject.exports,
  __dirname: path.dirname(senderPath),
  process: { env },
  console: {
    log: (...args) => logs.push(args.join(' ')),
    warn: (...args) => logs.push(args.join(' ')),
    error: (...args) => logs.push(args.join(' ')),
  },
  __pickCalls: 0,
  __messageCalls: 0,
};

vm.runInNewContext(source, context, { filename: senderPath, timeout: 2000 });

(async () => {
  const results = await context.module.exports.sendMorningBriefPush(stalePayload);
  const summaries = Array.from(results, (result) => ({
    island: result.island,
    sent: result.sent,
    reason: result.reason,
  }));

  assert.equal(results.length, 6, 'all six configured regions must be evaluated');
  assert.deepEqual(
    summaries.map((result) => result.island),
    ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum'],
    'the test must exercise all six regions',
  );
  for (const result of summaries) {
    assert.equal(result.sent, false, result.island + ' stale observation must not be sent');
    assert.equal(
      result.reason,
      'observation-not-operationally-fresh',
      result.island + ' must report the freshness skip reason',
    );
  }
  assert.equal(context.__pickCalls, 0, 'no beach may be selected from stale data');
  assert.equal(context.__messageCalls, 0, 'no customer message may be constructed from stale data');
  assert.equal(networkCalls, 0, 'no OneSignal/HTTP request may be attempted');
  assert.equal(
    logs.filter((line) => line.includes('skipped — observation-outside-operational-sla')).length,
    6,
    'all six regions must log the operational SLA block',
  );

  console.log('MORNING_BRIEF_SENDER_BEHAVIOR_TESTS PASS (six stale regions; zero message builds; zero network calls)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
