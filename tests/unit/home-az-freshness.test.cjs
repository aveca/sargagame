const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const { homeAzFreshness } = await import("../../src/lib/format-freshness.mjs");
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

  const source = fs.readFileSync(path.join(__dirname, "..", "..", "src", "HomeAZ.jsx"), "utf8");
  ok(source.includes('import {homeAzFreshness} from "./lib/format-freshness.mjs"'), "HomeAZ consumes shared freshness helper");
  ok(source.includes("erddapTimestamp: (sargData&&sargData.erddapTimestamp) || null"), "HomeAZ passes the source observation timestamp");
  ok(!source.includes("sargData.updatedAt||sargData.erddapTimestamp"), "HomeAZ never prefers publication time over observation time");
  ok(source.includes("var live=fresh.badge;"), "hero badge follows verified freshness state");
  ok(source.includes('$("liveTxt").textContent=freshness().badge'), "secondary live pill follows verified freshness state");

  console.log(`OK home-az-freshness: ${count + 5} assertions`);
})().catch(error => { console.error(error); process.exit(1); });
