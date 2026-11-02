# Client analytics secret and frustration telemetry privacy fix — 2026-10-30

## Verified findings

- `src/Sargasses_PROD.jsx` contained a browser-side GA4 Measurement Protocol beacon with literal credentials.
- A default-branch code search found the same private Measurement Protocol pattern in browser-delivered or browser-generating sources: `public/veille/index.html`, `public/a-propos/index.html`, `scripts/lib/reliability-page.cjs`, and the generated beach-page injection in `vite.config.js`.
- The beach-page injection is especially important: it is copied into every generated `dist/plages/<slug>/index.html` page. The first expanded CI run caught this residual path in `dist/plages/vieux-fort-sainte-rose/index.html`.
- `src/useFrustrationDetection.js` read `sg_email` from localStorage and attempted a direct Supabase insert with `event_type/email/props`, which did not match the live `analytics_events(event, params, island, ts)` contract.
- The local-host remote-analytics guard is already merged in PR #1140.

## Changes

- Removed the browser-side Measurement Protocol beacon from the React application, both checked-in static HTML pages, the reliability-page generator, and the generated beach-page injection.
- Generated beach pages now send `sg_fiche_view` through the existing consent-aware `window.gtag('event', ...)` path. This preserves the event integration without bypassing the site's default-denied analytics consent.
- Preserved the existing Apps Script event transport in the static pages and generated reliability page; no new analytics provider was introduced.
- Replaced the frustration direct REST writer with the shared `logAnalyticsEvent` writer.
- Added a strict frustration-payload allowlist: event type, pathname without query/hash, timestamp and bounded numeric counters. Arbitrary DOM text, email and caller-supplied objects are not forwarded.
- Fixed first-party lead event persistence so it runs independently of whether Apps Script `sendBeacon` succeeds.
- Extended regression coverage to scan all relevant sources and the complete `dist/` output tree (HTML, JS and source maps).

## Validation and limits

- The initial expanded CI run on the intermediate head `ecc99ca3ba1841fe231859397dd2db28bfb3042e` failed for the correct reason: the generated beach-page HTML still contained the injected Measurement Protocol endpoint. That finding is now fixed in `vite.config.js`; the next exact-head CI run must confirm the generated output is clean.
- No GA4 account access is exposed, so the affected properties, whether the credentials are still active, and current data collection cannot be verified here.
- No production analytics rows were changed. No live email, payment, secret, or deployment operation was performed.

## Approval boundary

The credential literals remain in Git history and may also exist in historical artifacts or external copies. Removing them from current source does not revoke them. An authorized operator must revoke/rotate the affected GA4 Measurement Protocol secrets and verify the relevant GA4 properties after explicit approval. No secret value is reproduced here.
