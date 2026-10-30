# Client analytics secret and frustration telemetry privacy fix — 2026-10-30

## Verified findings

- `src/Sargasses_PROD.jsx` contained a browser-side GA4 Measurement Protocol beacon with literal credentials.
- A default-branch code search also found the same private Measurement Protocol pattern in three additional browser-delivered or browser-generating sources: `public/veille/index.html`, `public/a-propos/index.html`, and `scripts/lib/reliability-page.cjs`. The latter generates the regional reliability pages at build time.
- `src/useFrustrationDetection.js` read `sg_email` from localStorage and attempted a direct Supabase insert with `event_type/email/props`, which did not match the live `analytics_events(event, params, island, ts)` contract.
- The local-host remote-analytics guard is already merged in PR #1140.

## Changes

- Removed the browser-side GA4 Measurement Protocol beacon from the React application, both checked-in static HTML pages, and the reliability-page generator. No GA4 `api_secret` or Measurement Protocol endpoint remains in those current client sources.
- Preserved the existing Apps Script event transport in the static pages and generated reliability page; this change does not replace it with a new analytics provider.
- Replaced the frustration direct REST writer with the shared `logAnalyticsEvent` writer.
- Added a strict allowlist for frustration fields: event type, pathname without query/hash, timestamp and bounded numeric counters. Arbitrary DOM text, email and caller-supplied objects are not forwarded.
- Fixed first-party lead event persistence so it runs independently of whether Apps Script `sendBeacon` succeeds.
- Extended regression coverage to scan all three additional sources and the complete `dist/` output tree (HTML, JS and source maps), in addition to the main React source and frustration telemetry.

## Validation and limits

- The earlier PR head `dff3127af0e5880d1e2ef967a912f71b08a22ad0` passed CI; the expanded changes require fresh CI on the new head.
- No GA4 account access is exposed, so the affected properties, whether the credentials are still active, and current data collection cannot be verified here.
- No production analytics rows were changed. No live email, payment, secret, or deployment operation was performed.

## Approval boundary

The credential literals remain in Git history and may also exist in historical artifacts or external copies. Removing them from current source does not revoke them. An authorized operator must revoke/rotate the affected GA4 Measurement Protocol secrets and verify the relevant GA4 properties after explicit approval. No secret value is reproduced here.
