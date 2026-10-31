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
assert.ok(verifierSource.includes('/api/b2b-partners.json'),
  'post-deploy verification must request the public B2B partner endpoint');
assert.ok(verifierSource.includes("set('b2b_partners_api'"),
  'the endpoint result must participate in the per-domain verification stage');
assert.ok(verifierSource.includes('checkB2BPartnersPayload(b2bPayload)'),
  'the live response must be validated, not only fetched');

console.log('B2B_PARTNERS_POSTDEPLOY_TESTS PASS (12 assertions)');
