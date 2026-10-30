# Client analytics secret and frustration telemetry privacy fix — 2026-10-30

## Verified findings

- `src/Sargasses_PROD.jsx` contained a browser-side GA4 Measurement Protocol beacon with literal credentials. Google documents the Measurement Protocol credential as private; client exposure can allow unauthorized event injection.
- `src/useFrustrationDetection.js` read `sg_email` from localStorage and attempted a direct Supabase insert with `event_type`, `email` and `props`. The connected `analytics_events` table exposes `event`, `params`, `island` and `ts`, so the ad-hoc payload was also inconsistent with the current table contract.
- The local-host remote-analytics guard is already merged in PR #1140; this change builds on that shared policy.

## Changes

- Removed the client-side Measurement Protocol beacon and its private credentials. The configured Google tag and first-party Supabase funnel remain in place.
- Replaced the frustration direct REST writer with the shared `logAnalyticsEvent` writer.
- Added a strict allowlist for frustration fields: event type, pathname without query/hash, timestamp and bounded numeric counters. Arbitrary DOM text, email and caller-supplied objects are not forwarded.
- Added source and built-bundle regression checks.

## Validation

CI must be evaluated on the exact PR head. No GA4 account access is available to verify the property or whether the historic credentials remain active. No production analytics rows were changed.

## Approval boundary

The literals remain in Git history. This PR removes them from current client source/bundles but does not revoke or rotate the GA4 credentials. Account-level revocation/rotation must be performed by an authorized operator after explicit approval. No credential value is reproduced here.
