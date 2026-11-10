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
  evaluatePublicationEligibility
} = require('../../scripts/autopilot/check-predeploy-satellite-freshness.cjs');

let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

const now = Date.parse('2026-11-09T22:30:00.000Z');
check(MAX_AGE_MINUTES === 900, 'operational SLA stays 900 minutes');
check(PUBLIC_STALE_MINUTES === 2160, 'public stale marker stays 36 hours');
check(MAX_PUBLISHABLE_MINUTES === 10080, 'hard publication ceiling is 7 days');

const overSla = evaluateObservation('2026-11-08T12:00:00.000Z', now);
check(!overSla.ok && overSla.ageMinutes > 900, '34.5h observation is still classified outside the operational SLA');

const better = evaluatePublicationEligibility('2026-11-08T12:00:00.000Z', {
  now,
  previousTimestamp: '2026-11-05T12:00:00.000Z'
});
check(better.publishable, 'a newer-than-committed observation remains publishable after 15h');
check(better.isNewerThanPrevious === true, 'eligibility reports the candidate is newer than the committed observation');

const same = evaluatePublicationEligibility('2026-11-05T12:00:00.000Z', {
  now,
  previousTimestamp: '2026-11-05T12:00:00.000Z'
});
check(same.publishable, 'the same observation already in the repo remains publishable (no-op commit)');

const older = evaluatePublicationEligibility('2026-10-27T12:00:00.000Z', {
  now,
  previousTimestamp: '2026-11-05T12:00:00.000Z'
});
check(!older.publishable, 'a regression versus the committed observation is rejected');

const ancient = evaluatePublicationEligibility('2026-10-01T12:00:00.000Z', { now });
check(!ancient.publishable, 'observations older than 7 days are not publishable');

const fresh = evaluatePublicationEligibility('2026-11-09T18:00:00.000Z', { now });
check(fresh.publishable && fresh.withinOperationalSla, 'a fresh observation inside the SLA is publishable');

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
check(verify.includes('evaluatePublicationEligibility'), 'publication gate uses eligibility to avoid blocking a newer observation');

const dataRefresh = read('.github/workflows/data-refresh.yml');
check(dataRefresh.includes("steps.publish.outputs.changed == 'true'"), 'data-refresh only dispatches deploy when data actually changed');
check(dataRefresh.includes('[ "$rc" -ne 0 ] && grep -q \'observation hors SLA\''), 'an allowed over-SLA warning cannot classify the run as blocked');
const daily = read('.github/workflows/daily-copernicus.yml');
check(daily.includes('[ "$rc" -ne 0 ] && grep -q \'observation hors SLA\''), 'daily-copernicus uses the same exit-code gate');
check(!/console\.warn\([\s\S]{0,280}observation hors SLA/.test(verify), 'the allowed-publication warning does not contain the blocking phrase');

console.log(`PUBLICATION_ELIGIBILITY_AND_SALES_EMAIL_TESTS PASS (${assertions} assertions)`);
