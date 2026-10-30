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

  const assets = path.join(root, "dist", "assets");
  if (fs.existsSync(assets)) {
    const stack = [assets];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(target);
        else if (/\.(?:m?js|cjs|html|map)$/i.test(entry.name)) {
          const content = fs.readFileSync(target, "utf8");
          assert.doesNotMatch(content, /api_secret|google-analytics\.com\/mp\/collect/i,
            "built client asset contains no Measurement Protocol secret marker: " + path.relative(root, target));
        }
      }
    }
  }

  console.log("PASS: no client GA4 Measurement Protocol secret; frustration telemetry is PII-minimized");
})().catch(error => { console.error(error); process.exit(1); });
