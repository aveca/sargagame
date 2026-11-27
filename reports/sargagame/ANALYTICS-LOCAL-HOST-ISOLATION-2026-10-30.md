# Analytics local-host isolation — 2026-10-30

## Objective

Prevent local development and CI browser previews from writing synthetic events into the production analytics sinks, without disabling analytics on the six real regional domains or removing first-party local session instrumentation.

## Verified evidence

Read-only queries against the connected Supabase project found:

- During 2026-10-30 02:45–03:00 UTC, nine rows each for `sg_sos_checkout_start`, `sg_sos_checkout_redirect`, `sg_sos_checkout_paid` and `sg_conversion`.
- Each event type had one distinct payload.
- The paid/conversion rows matched the mock session identifier used by the SOS Playwright fixture; redirect rows matched its mock payment identifier.
- The event window overlapped CI run [#40994050734](https://github.com/aveca/sargagame/actions/runs/40994050734), job [123862924696](https://github.com/aveca/sargagame/actions/runs/40994050734/job/123862924696).
- The 24-hour aggregate also contained 161 `sg_session_start` events from `127.0.0.1` and 45 from `localhost`.

These are local/test events, not qualified production traffic. The SOS fixture rows are not evidence of real Mollie transactions and must be excluded from conversion/revenue KPIs.

Source review confirmed:
- `src/supabasePhotos.js` writes directly to the production Supabase `analytics_events` REST endpoint.
- `src/Sargasses_PROD.jsx` sends remote Supabase, GA4 Measurement Protocol and Apps Script events.
- `src/useFrustrationDetection.js` contains a separate direct Supabase writer.

The SOS-only intercept added on PR #1136 was insufficient: other local browser checks continued to emit local-host events.

## Implementation on this branch

Branch: `fix/analytics-local-host-isolation-20261030`

Base: `main@0921b27e9f608874c69d64136c529ab558d9bf0d`

Changes:
1. Added `src/lib/remote-analytics.mjs` to identify localhost, `*.localhost`, IPv4 127/8, IPv6 loopback, `0.0.0.0`, and empty hosts.
2. Added a shared `isRemoteAnalyticsEnabled()` policy. Local remote analytics is off by default; explicit opt-in is available for controlled developer testing.
3. Guarded Supabase funnel writes.
4. Guarded GA4/Apps Script remote beacons and queued-event flushes while retaining first-party local event collection.
5. Guarded the separate frustration telemetry writer.
6. Added `tests/unit/remote-analytics-host.test.cjs` for loopback, production host and explicit opt-in behavior plus integration assertions.

## Safety

No production analytics rows were deleted or modified. No Supabase schema, real-domain analytics settings, payment behavior, price, Worker runtime, secret or production deployment was changed.

A separate issue tracks the client-side GA4 Measurement Protocol secret and email-bearing frustration telemetry: [#1139](https://github.com/aveca/sargagame/issues/1139). No secret values are reproduced or rotated.

## Validation

PR: [#1140](https://github.com/aveca/sargagame/pull/1140)

The CI Tests and Perf/Lighthouse workflows are running against the branch. Their final exact-head results must be checked on PR #1140 before merge. After CI completes, perform a read-only Supabase aggregate over the run window and verify that no new `localhost`/`127.0.0.1` analytics events were inserted.

## Remaining limitations

- No direct GA4, Clarity or OneSignal account access.
- No Mollie dashboard access.
- No local PC/worktree access.
- Supabase access used here was SELECT-only.
