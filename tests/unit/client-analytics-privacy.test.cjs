const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const { sanitizeFrustrationAnalytics } = await import("../../src/lib/frustration-analytics.mjs");

  const safe = sanitizeFrustrationAnalytics(
    "rage click!",
    {
      timestamp: 1234,
      count: 3,
      element: 'button "Alice Example"',
      email: "private@example.invalid",
      arbitrary: "must not be forwarded",
    },
    "/beach/anse-mitan?email=private@example.invalid#contact",
    9999,
  );
  assert.deepEqual(safe, {
    type: "rage_click_",
    page: "/beach/anse-mitan",
    timestamp: 1234,
    count: 3,
  });
  assert.equal(Object.hasOwn(safe, "email"), false);
  assert.equal(Object.hasOwn(safe, "element"), false);
  assert.equal(Object.hasOwn(safe, "arbitrary"), false);

  const fallback = sanitizeFrustrationAnalytics("hesitation", { timestamp: "invalid", idleTime: -5, scrollCount: 1e20 }, "/home", 5000);
  assert.deepEqual(fallback, {
    type: "hesitation",
    page: "/home",
    timestamp: 5000,
    scrollCount: 10_000_000,
    idleTime: 0,
  });

  const epochNow = Date.UTC(2026, 9, 30, 5, 45, 0);
  const epochTimestamp = epochNow - 1234;
  const epochSafe = sanitizeFrustrationAnalytics(
    "rage-click",
    { timestamp: epochTimestamp, count: 2 },
    "/home",
    epochNow,
  );
  assert.equal(epochSafe.timestamp, epochTimestamp,
    "realistic Date.now() epoch milliseconds must not be clamped like interaction counters");
  assert.equal(epochSafe.count, 2);

  const futureTimestamp = sanitizeFrustrationAnalytics(
    "hesitation",
    { timestamp: epochNow + 60_000 },
    "/home",
    epochNow,
  );
  assert.equal(futureTimestamp.timestamp, epochNow,
    "future event timestamps must fall back to the trusted current timestamp");

  const app = fs.readFileSync(path.join(root, "src/Sargasses_PROD.jsx"), "utf8");
  const frustration = fs.readFileSync(path.join(root, "src/useFrustrationDetection.js"), "utf8");
  assert.doesNotMatch(app, /api_secret|google-analytics\.com\/mp\/collect/i,
    "browser source must not contain a GA4 Measurement Protocol secret or endpoint");
  assert.match(app, /window\.gtag\("event",event,p\)/,
    "configured Google tag path remains available");
  assert.match(app, /logAnalyticsEvent\(event,p,/,
    "first-party Supabase funnel path remains available");
  assert.match(frustration, /logAnalyticsEvent\('sg_frustration_detected', params, island\)/,
    "frustration telemetry uses the shared schema-compatible writer");
  assert.doesNotMatch(frustration, /sg_email|event_type:|email:|SUPABASE_ANON_KEY|fetch\(/,
    "frustration telemetry must not send email or use a direct ad-hoc writer");

  const staticClientPaths = [
    "public/veille/index.html",
    "public/a-propos/index.html",
    "scripts/lib/reliability-page.cjs",
    "vite.config.js",
  ];
  for (const relativePath of staticClientPaths) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.ok(!source.includes("api_secret") && !source.includes("google-analytics.com/mp/collect"),
      relativePath + " must not ship a GA4 Measurement Protocol secret or endpoint");
  }
  const veille = fs.readFileSync(path.join(root, "public/veille/index.html"), "utf8");
  const about = fs.readFileSync(path.join(root, "public/a-propos/index.html"), "utf8");
  const reliability = fs.readFileSync(path.join(root, "scripts/lib/reliability-page.cjs"), "utf8");
  const viteConfig = fs.readFileSync(path.join(root, "vite.config.js"), "utf8");
  assert.ok(veille.includes("navigator.sendBeacon&&navigator.sendBeacon(APPS,"),
    "veille landing must retain its Apps Script event transport");
  assert.ok(about.includes("navigator.sendBeacon(APPS_SCRIPT_URL"),
    "about page must retain its Apps Script event transport");
  assert.ok(reliability.includes("navigator.sendBeacon(APPS_SCRIPT_URL"),
    "generated reliability pages must retain their Apps Script event transport");
  assert.ok(viteConfig.includes('window.gtag("event",ev,params||{})'),
    "generated beach pages must use the consent-aware Google tag");

  const dist = path.join(root, "dist");
  if (fs.existsSync(dist)) {
    const stack = [dist];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(target);
        else if (/\.(?:m?js|cjs|html|map)$/i.test(entry.name)) {
          const content = fs.readFileSync(target, "utf8");
          assert.ok(!content.includes("api_secret") && !content.includes("google-analytics.com/mp/collect"),
            "built client output contains no Measurement Protocol secret marker: " + path.relative(root, target));
        }
      }
    }
  }

  console.log("PASS: no client GA4 Measurement Protocol secret; frustration telemetry is PII-minimized");
})().catch(error => { console.error(error); process.exit(1); });
