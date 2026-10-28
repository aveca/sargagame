const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const { homeAzFreshness, formatObservationTimestamp, nextHomeAzFreshnessBoundaryDelayMs } = await import("../../src/lib/format-freshness.mjs");
  const now = Date.parse("2026-10-28T21:50:00.000Z");
  let count = 0;
  const ok = (condition, message) => { count++; assert.ok(condition, message); };

  const republishedOldObservation = {
    updatedAt: "2026-10-28T21:45:00.000Z",
    erddapTimestamp: "2026-10-27T12:00:00.000Z",
  };
  const stale = homeAzFreshness(republishedOldObservation, "en", now);
  assert.equal(stale.state, "stale", "recent republication must not hide an old observation");
  assert.equal(stale.live, false);
  assert.equal(stale.badge, "SATELLITE DELAYED");
  assert.match(stale.label, /delayed/i);
  count += 4;

  const live = homeAzFreshness({ erddapTimestamp: "2026-10-28T20:00:00.000Z" }, "fr", now);
  assert.equal(live.state, "live");
  assert.equal(live.live, true);
  assert.equal(live.badge, "EN DIRECT");
  count += 3;

  const twelveHours = homeAzFreshness({ erddapTimestamp: "2026-10-28T09:50:00.000Z" }, "fr", now);
  assert.equal(twelveHours.state, "recent", "12 h is no longer labeled LIVE");
  assert.equal(twelveHours.live, false);
  assert.equal(twelveHours.badge, "MESURE SATELLITE");
  count += 3;

  const fifteenHours = homeAzFreshness({ erddapTimestamp: "2026-10-28T06:50:00.000Z" }, "es", now);
  assert.equal(fifteenHours.state, "stale", "15 h reaches the operational delay threshold");
  assert.equal(fifteenHours.badge, "SATÉLITE ATRASADO");
  count += 2;

  for (const value of [undefined, null, "", "not-a-date", "2026-10-28T22:00:00.000Z"]) {
    const unknown = homeAzFreshness({ erddapTimestamp: value, updatedAt: "2026-10-28T21:49:00.000Z" }, "en", now);
    assert.equal(unknown.state, "unknown", `unproven timestamp must fail closed: ${String(value)}`);
    assert.equal(unknown.live, false);
    count += 2;
  }

  const observationLabel = formatObservationTimestamp("2026-10-28T17:29:52.717Z", "en");
  ok(/17:29/.test(observationLabel), "hero timestamp includes the actual source hour and minute");
  ok(/UTC/.test(observationLabel), "hero timestamp explicitly labels UTC");
  ok(nextHomeAzFreshnessBoundaryDelayMs({erddapTimestamp: new Date(now - (12 * 3600000 - 1000)).toISOString()}, now) === 1050,
    "fresh state schedules a recheck just after the 12h boundary");
  ok(nextHomeAzFreshnessBoundaryDelayMs({erddapTimestamp: new Date(now - 12 * 3600000).toISOString()}, now) === 3 * 3600000 + 50,
    "at 12h the next recheck targets the 15h boundary");
  ok(nextHomeAzFreshnessBoundaryDelayMs({erddapTimestamp: new Date(now - 15 * 3600000).toISOString()}, now) === null,
    "at 15h no further timer is needed because the state is terminally stale");
  ok(nextHomeAzFreshnessBoundaryDelayMs({erddapTimestamp: new Date(now + 60000).toISOString()}, now) === null,
    "future timestamps do not schedule a transition to LIVE");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "src", "HomeAZ.jsx"), "utf8");
  ok(source.includes('import {homeAzFreshness, formatObservationTimestamp, nextHomeAzFreshnessBoundaryDelayMs} from "./lib/format-freshness.mjs"'), "HomeAZ consumes shared freshness helpers");
  ok(source.includes("erddapTimestamp: (sargData&&sargData.erddapTimestamp) || null"), "HomeAZ passes the source observation timestamp");
  ok(!source.includes("sargData.updatedAt||sargData.erddapTimestamp"), "HomeAZ never prefers publication time over observation time");
  ok(source.includes("var live=fresh.badge;"), "hero badge follows verified freshness state");
  ok(source.includes('$("liveTxt").textContent=fresh.badge'), "secondary live pill follows verified freshness state");
  ok(source.includes('fresh.live ? T.s0[LANG] : fresh.label'), "hero supporting copy is gated by observation freshness");
  ok(source.includes('fresh.live ? T.s1[LANG] : statusNote'), "secondary supporting copy avoids a false live claim");
  ok(source.includes('fresh.live ? st[LANG][0] : stLabel(HOME.status)+" · "+fresh.badge'), "status pill is explicitly marked when not live");
  ok(!/4 fois par jour|4 times a day|4 pasadas al día|mise à jour en direct|updated live|actualizado en directo/.test(source), "HomeAZ does not promise an unsupported refresh frequency or live update");
  ok(source.includes('Data: Copernicus Marine · observation time shown'), "footer identifies observation time instead of claiming live updates");
  ok(source.includes("scheduleFreshnessRefresh();"), "HomeAZ schedules freshness revalidation independently of animation");
  ok(source.includes("nextHomeAzFreshnessBoundaryDelayMs"), "HomeAZ uses tested 12h/15h boundary calculation");
  ok(source.includes("formatObservationTimestamp(HOME.erddapTimestamp, LANG)"), "HomeAZ formats the source timestamp rather than publication/current date");
  ok(source.includes('on(document,"visibilitychange",function(){ if(!document.hidden) applyCopy(); });'), "HomeAZ rechecks freshness when a throttled tab becomes visible");
  ok(source.includes("clearTimeout(freshnessTimer)"), "HomeAZ cancels the freshness timer on reschedule and teardown");
  ok(source.includes('dt.textContent=fresh.state==="unknown" ? _t("INCONNU","UNKNOWN","DESCONOCIDO") : observationDateLabel();'), "the hero timestamp is sourced from erddapTimestamp in every verified state");
  ok(!source.includes('dt.textContent=fresh.live ? dateLabel()'), "HomeAZ never substitutes the current date for the satellite observation date");

  console.log(`OK home-az-freshness: ${count} assertions`);
})().catch(error => { console.error(error); process.exit(1); });
