#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MAX_AGE_MINUTES,
  PUBLIC_STALE_MINUTES,
  MAX_PUBLISHABLE_MINUTES,
  evaluateObservation,
  evaluatePublicationEligibility,
  evaluateFleetPublicationEligibility
} = require('../../scripts/autopilot/check-predeploy-satellite-freshness.cjs');

let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

const now = Date.parse('2026-11-09T22:30:00.000Z');
check(MAX_AGE_MINUTES === 900, 'operational SLA stays 900 minutes');
check(PUBLIC_STALE_MINUTES === 2160, 'public stale marker stays 36 hours');
check(MAX_PUBLISHABLE_MINUTES === MAX_AGE_MINUTES, 'publication ceiling is exactly the strict 900-minute SLA');

const timestampAtAge = ageMinutes => new Date(now - ageMinutes * 60_000).toISOString();
const at899 = evaluatePublicationEligibility(timestampAtAge(899), { now });
const at900 = evaluatePublicationEligibility(timestampAtAge(900), { now });
const at901 = evaluatePublicationEligibility(timestampAtAge(901), { now });
check(at899.publishable && at899.withinOperationalSla, '899-minute observation is publishable');
check(at900.publishable && at900.withinOperationalSla, '900-minute boundary is publishable');
check(!at901.publishable && !at901.withinOperationalSla, '901-minute observation is blocked');

const overSla = evaluateObservation('2026-11-08T12:00:00.000Z', now);
check(!overSla.ok && overSla.ageMinutes > 900, '34.5h observation is classified outside the operational SLA');

const better = evaluatePublicationEligibility('2026-11-08T12:00:00.000Z', {
  now,
  previousTimestamp: '2026-11-05T12:00:00.000Z'
});
check(!better.publishable && !better.withinOperationalSla, 'a newer-than-committed observation is still blocked after 15h');
check(better.isNewerThanPrevious === true, 'eligibility still reports the candidate is newer than the committed observation');
check(better.reason.includes('observation hors SLA'), 'over-SLA candidates retain the stale classification used by workflows');

const same = evaluatePublicationEligibility('2026-11-09T22:30:00.000Z', {
  now,
  previousTimestamp: '2026-11-09T22:30:00.000Z'
});
check(same.publishable, 'the same fresh observation already in the repo remains eligible (no-op commit)');

const older = evaluatePublicationEligibility('2026-11-09T21:00:00.000Z', {
  now,
  previousTimestamp: '2026-11-09T21:30:00.000Z'
});
check(!older.publishable && older.isNewerThanPrevious === false, 'a fresh observation older than the committed reference is rejected');

const ancient = evaluatePublicationEligibility('2026-10-01T12:00:00.000Z', { now });
check(!ancient.publishable, 'observations older than the 900-minute SLA are not publishable');

const fresh = evaluatePublicationEligibility('2026-11-09T18:00:00.000Z', { now });
check(fresh.publishable && fresh.withinOperationalSla, 'a fresh observation inside the SLA is publishable');

const labeled = evaluatePublicationEligibility(timestampAtAge(901), { now, allowLabeledStale: true });
check(labeled.publishable && labeled.labeledStale === true && labeled.withinOperationalSla === false, 'a 901-minute observation can be published only as labeled not-current data');
const labeledOld = evaluatePublicationEligibility('2026-10-01T12:00:00.000Z', { now, allowLabeledStale: true });
check(!labeledOld.publishable, 'an observation older than 7 days stays blocked even with the label');
const labeledRegression = evaluatePublicationEligibility('2026-11-09T18:00:00.000Z', {
  now,
  previousTimestamp: '2026-11-09T20:00:00.000Z',
  allowLabeledStale: true
});
check(!labeledRegression.publishable, 'a labeled observation older than the published one is rejected');

const sixFreshRegions = Array.from({ length: 6 }, (_, index) => ({
  regionId: `region-${index + 1}`,
  publishable: true
}));
check(evaluateFleetPublicationEligibility(sixFreshRegions).publishable, 'all six eligible regions permit fleet publication');
const oneStaleRegion = sixFreshRegions.map((region, index) =>
  index === 4 ? { ...region, publishable: false } : region
);
const blockedFleet = evaluateFleetPublicationEligibility(oneStaleRegion);
check(!blockedFleet.publishable && blockedFleet.blockedRegions.includes('region-5'), 'one over-SLA region blocks all six-domain publication');
check(!evaluateFleetPublicationEligibility(sixFreshRegions.slice(0, 5)).publishable, 'a missing regional result also blocks the six-domain fleet');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const alerts = read('scripts/automation/send-b2c-morning-alerts.cjs');
check(alerts.includes("morning-digest|"), 'morning digest hash is namespaced away from Worker alert fingerprints');
check(alerts.includes('/unsubscribe?token='), 'morning email includes unsubscribe URL');
check(alerts.includes('utm_campaign=pass30'), 'morning email includes a 30-day pass CTA');
check(alerts.includes('pass=p30'), 'morning CTA opens the 30-day pass');
check(alerts.includes("currency === 'USD' ? '$16.99' : '14,99 €'"), 'morning CTA prices the 30-day pass at 14,99 € / $16.99');
check(alerts.includes('voir le pass 30 jours — ${price}'), 'French morning CTA shows the price');
check(alerts.includes('see the 30-day pass — ${price}'), 'English morning CTA shows the price');
check(!alerts.includes('$5.99') && !alerts.includes('$11.99') && !alerts.includes('11,99'), 'morning email does not quote a retired price');
check(alerts.includes('DO_SEND = args.includes(\'--send\')'), 'morning alerts stay dry-run without --send');
check(alerts.includes('status=eq.active'), 'morning alerts only load opted-in subscribers');
check(!/b2b-cold-outreach/.test(alerts), 'morning script does not send B2B cold outreach');

const digest = read('scripts/automation/send-b2b-weekly-digest.cjs');
check(digest.includes("const FOUNDER = 'yacovassaraf@gmail.com'"), 'B2B digest is locked to the founder');
check(digest.includes('Never emails prospects') || digest.includes('never emails prospects') || digest.includes('Never emails prospects, hotels'), 'digest documents no prospect emails');
check(digest.includes("to: FOUNDER"), 'digest sends only to the founder constant');

const workflow = read('.github/workflows/sales-lifecycle-emails.yml');
check(workflow.includes('send-b2c-morning-alerts.cjs --send'), 'scheduled morning alerts run with --send');
check(workflow.includes('recover-abandoned-cart.cjs'), 'abandoned checkout recovery is wired');
check(workflow.includes('--once --max=40'), 'abandoned checkout is one reminder and rate-limited');
check(workflow.includes("MOLLIE_CART_RECOVERY: '1'"), 'live Mollie checkouts are included in recovery');
check(workflow.includes('pass-expiry-winback.cjs'), 'pass expiry renewal reminder is wired');
check(workflow.includes('welcome-paid-mollie.cjs'), 'paid welcome is wired');
check(workflow.includes('send-b2b-weekly-digest.cjs --send'), 'weekly B2B digest is wired');
check(!workflow.includes('b2b-cold-outreach.cjs'), 'no cold B2B outreach script in the sales workflow');
check(!workflow.includes('send-b2b-followup.cjs'), 'no automatic prospect follow-up in the sales workflow');
check(workflow.includes('github.event.inputs.send'), 'manual dispatch stays dry-run unless send is set');
const cart = read('scripts/automation/recover-abandoned-cart.cjs');
check(cart.includes("const ONCE = args.includes('--once')"), 'cart recovery can be limited to one touch');
check(cart.includes("region.currency === 'USD' ? '$16.99' : '14,99 €'"), 'cart CTA uses the live 30-day price');
check(!cart.includes("'$5.99'") && !cart.includes("'7,99 €'"), 'cart CTA no longer quotes the retired entry price');
const winback = read('scripts/automation/pass-expiry-winback.cjs');
check(winback.includes('14,99 €') && winback.includes('$16.99') && winback.includes('pass=p30'), 'expiry reminder CTA uses the 30-day pass price');

const verify = read('scripts/verify-ftp-ready.cjs');
check(verify.includes('evaluateObservation(data.erddapTimestamp)'), 'publication gate still evaluates the operational SLA');
check(verify.includes('evaluatePublicationEligibility'), 'publication gate applies the strict eligibility contract');
check(verify.includes('evaluateFleetPublicationEligibility'), 'one ineligible region blocks the entire six-domain fleet');
const predeploy = read('scripts/autopilot/check-predeploy-satellite-freshness.cjs');
check(predeploy.includes('evaluatePublicationEligibility'), 'predeploy gate uses the same strict publication contract');
check(!predeploy.includes('operational SLA exceeded but deploy allowed'), 'predeploy gate has no over-SLA deployment warning');

const dataRefresh = read('.github/workflows/data-refresh.yml');
check(dataRefresh.includes("steps.publish.outputs.changed == 'true'"), 'data-refresh only dispatches deploy when data actually changed');
check(dataRefresh.includes('[ "$rc" -ne 0 ] && grep -q \'observation hors SLA\''), 'a strict over-SLA rejection is classified as BLOCKED_STALE_SOURCE');
const daily = read('.github/workflows/daily-copernicus.yml');
check(daily.includes('[ "$rc" -ne 0 ] && grep -q \'observation hors SLA\''), 'daily-copernicus uses the same exit-code gate');
check(!verify.includes('publication autorisée, ce n\'est pas une régression'), 'the publication gate contains no over-SLA allowance warning');

console.log(`PUBLICATION_ELIGIBILITY_AND_SALES_EMAIL_TESTS PASS (${assertions} assertions)`);
