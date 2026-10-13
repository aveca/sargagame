#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const {
  hash, fingerprintForDefect, uniqueDefects, severity, titleFor,
  incidentBody, missionBody, labelsFor, factoryQueueGate, clean,
} = require('../../scripts/automation/user-journey-notify.cjs');

let n = 0;
function t(value, label) { n++; assert.ok(value, label); console.log('OK  ' + label); }

const a = { domain: 'https://example.com', step: 'detail', type: 'nav-broken', detail: 'button did not close', dedupKey: 'https://example.com|detail|nav-broken|button did not close' };
const b = { ...a };
const c = { ...a, domain: 'https://other.example', dedupKey: 'https://other.example|detail|nav-broken|button did not close' };

t(fingerprintForDefect(a) === fingerprintForDefect(b), 'incident fingerprint is deterministic');
t(fingerprintForDefect(a) !== fingerprintForDefect(c), 'different domain has its own fingerprint');
t(hash('abc') === hash('abc'), 'batch fingerprint is stable');
t(uniqueDefects([a,b,c]).length === 2, 'duplicate findings collapse by stable key');
t(severity(a) === 'blocking', 'navigation failure classified as blocking');
t(severity({ type: 'console-error' }) === 'ux', 'non-blocking signal classified as UX');
t(titleFor(a).startsWith('[E2E-BLOCKING]'), 'blocking incident title is explicit');
t(labelsFor(a).includes('autopilot-blocking'), 'blocking issue gets blocking label');
t(labelsFor({type:'console-error'}).includes('autopilot-ux'), 'UX issue gets UX label');

const report = {
 generatedAt:'2026-10-13T12:00:00.000Z',
 summary:{runs:1,defects:1,blocking:1,ux:0}, domains:['example.com'],
 runs:[{domain:'https://example.com',viewport:'mobile',version:{v:'v1',b:'1234abcd'},defects:[a]}], defects:[a]
};
const body = incidentBody(report,a,{GITHUB_SERVER_URL:'https://github.com',GITHUB_REPOSITORY:'aveca/sargagame',GITHUB_RUN_ID:'123'});
t(body.includes('user-journey-fingerprint:'), 'incident body has dedup marker');
t(body.includes('b=1234abcd'), 'incident body includes bundle fingerprint');
t(body.includes('/actions/runs/123'), 'incident links source workflow run');
t(!clean('Bearer abc123 secret=xyz').includes('abc123'), 'credential-like text is redacted');

const mission = missionBody(report,[a],'1234567890abcdef',{GITHUB_SERVER_URL:'https://github.com',GITHUB_REPOSITORY:'aveca/sargagame',GITHUB_RUN_ID:'123'});
t(mission.includes('user-journey-factory-fingerprint:'), 'Factory mission includes stable marker');
t(mission.includes('"targeted-repair"') && mission.includes('"type": "repair"'), 'Factory mission uses permitted repair category');
t(mission.includes('"type": "repair"'), 'Factory mission uses allowlisted job type');
t(!mission.includes('ciGreenOnExactSha'), 'Factory mission never fabricates delivery evidence');

const now = Date.parse('2026-10-13T12:00:00.000Z');
const issue=(number,labels,created_at,state='open')=>({number,labels:labels.map(name=>({name})),created_at,state});
t(!factoryQueueGate([issue(1,['factory:queued','mission'],'2026-10-13T11:00:00Z')],now).allowed,'pending queue defers another mission');
t(!factoryQueueGate([issue(1,['mission'],'2026-10-13T11:00:00Z'),issue(2,['mission'],'2026-10-13T10:00:00Z')],now).allowed,'daily mission cap enforced');
t(!factoryQueueGate([issue(1,['mission'],'2026-10-13T08:00:00Z')],now).allowed,'six-hour cooldown enforced');
t(factoryQueueGate([issue(1,['mission'],'2026-10-13T05:00:00Z')],now).allowed,'mission allowed after cooldown and below cap');
t(factoryQueueGate([issue(1,['mission'],'2026-10-13T05:00:00Z','closed')],now).allowed,'closed historical mission is not pending');

console.log('\nUSER_JOURNEY_NOTIFY_TESTS PASS ('+n+' assertions)');
