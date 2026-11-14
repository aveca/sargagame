#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  checkB2BPartnersPayload,
} = require('../../scripts/autopilot/post-deploy-verify.cjs');

const validPartner = {
  beachId: 'mq016',
  slug: 'diamant-les-bains',
  name: 'Hotel Diamant Les Bains',
  tagline: 'Residence hoteliere en bord de plage.',
  url: 'https://hotel.example/',
  area: 'Le Diamant',
  logo: null,
};
const validPayload = {
  updatedAt: '2026-10-31',
  partners: [],
  preview: [validPartner],
};

assert.equal(checkB2BPartnersPayload(validPayload).status, 'VERIFIED',
  'empty live partners with a valid preview catalogue are allowed');
assert.equal(checkB2BPartnersPayload({
  updatedAt: '2026-10-31', partners: [], preview: [],
}).status, 'VERIFIED', 'both empty arrays are a valid no-paid-partner state');

for (const [label, payload] of [
  ['missing payload', null],
  ['HTML/404 body', '<html>Not Found</html>'],
  ['missing updatedAt', { partners: [], preview: [] }],
  ['missing partners array', { updatedAt: '2026-10-31', preview: [] }],
  ['non-array preview', { updatedAt: '2026-10-31', partners: [], preview: {} }],
  ['missing partner name', {
    updatedAt: '2026-10-31', partners: [],
    preview: [{ ...validPartner, name: '' }],
  }],
  ['invalid partner URL', {
    updatedAt: '2026-10-31', partners: [],
    preview: [{ ...validPartner, url: 'javascript:alert(1)' }],
  }],
]) {
  assert.equal(checkB2BPartnersPayload(payload).status, 'FAILED',
    label + ' must fail closed');
}

const verifierSource = fs.readFileSync(
  path.join(__dirname, '../../scripts/autopilot/post-deploy-verify.cjs'),
  'utf8',
);
assert.ok(verifierSource.includes('/data/b2b-partners.json?pdv='),
  'post-deploy verification must request the root static B2B partner asset');
assert.ok(!verifierSource.includes('/api/b2b-partners.json'),
  'post-deploy verification must avoid the intercepted /api route');
assert.ok(verifierSource.includes("set('b2b_partners_api'"),
  'the endpoint result must participate in the per-domain verification stage');
assert.ok(verifierSource.includes('checkB2BPartnersPayload(b2bPayload)'),
  'the live response must be validated, not only fetched');

const appSource = fs.readFileSync(
  path.join(__dirname, '../../src/ChasseHome.jsx'),
  'utf8',
);
assert.ok(appSource.includes('fetch("/data/b2b-partners.json"'),
  'ChasseHome must consume the root static partner asset');
assert.ok(!appSource.includes('fetch("/api/b2b-partners.json"'),
  'ChasseHome must not use the intercepted /api route');

const generatorSource = fs.readFileSync(
  path.join(__dirname, '../../scripts/automation/gen-b2b-partners.cjs'),
  'utf8',
);
assert.ok(generatorSource.includes('path.join(ROOT, "public/data/b2b-partners.json")'),
  'the generator must create the canonical root asset');
assert.ok(generatorSource.includes('path.join(ROOT, "public/api/b2b-partners.json")'),
  'the generator must retain the legacy compatibility mirror');

const rootPayload = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../public/data/b2b-partners.json'),
  'utf8',
));
const legacyPayload = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../public/api/b2b-partners.json'),
  'utf8',
));
assert.ok(Array.isArray(rootPayload.partners) && Array.isArray(rootPayload.preview),
  'root static asset must expose both partner arrays');
assert.deepEqual(rootPayload, legacyPayload,
  'root and legacy assets must be identical; no partner data is lost');


const cloudflarePaymentRoutes = ['/api/b2b-*', '/b2b*'];
function routeMatches(pattern, pathname) {
  if (pattern === '/b2b*') return pathname.startsWith('/b2b');
  if (pattern === '/api/b2b-*') return pathname.startsWith('/api/b2b-');
  return false;
}
assert.ok(cloudflarePaymentRoutes.some(pattern => routeMatches(pattern, '/b2b-partners.json')),
  'verified live /b2b* route intercepts the proposed root filename');
assert.ok(cloudflarePaymentRoutes.some(pattern => routeMatches(pattern, '/api/b2b-partners.json')),
  'verified live /api/b2b-* route intercepts the legacy API filename');
assert.ok(!cloudflarePaymentRoutes.some(pattern => routeMatches(pattern, '/data/b2b-partners.json')),
  '/data/b2b-partners.json must bypass both verified sg-payments route prefixes');
assert.ok(!fs.existsSync(path.join(__dirname, '../../public/b2b-partners.json')),
  'do not publish an unused root file that is still intercepted by sg-payments');

console.log('B2B_PARTNERS_POSTDEPLOY_TESTS PASS');
