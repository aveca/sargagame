# B2B freshness and scientific-copy correction — 2026-10-30

## Verified defects on main `d189368aa67f4f2b0167635b2dcbac424567fa8c`
- The four B2B hotel/authority pages and the pricing page rendered public track-record percentages without checking the record's freshness, generation time or regional scope.
- The two authority pages derived observation labels from `updatedAt` and displayed score/verdict values without validating `erddapTimestamp`.
- Customer-facing pages still carried an unqualified 70% ±3-day benchmark, a 76–79% range, or four-times-daily AFAI observation wording.
- The pricing page repeated the cadence claim and its proof widget did not enforce regional scope. No price or offer decision was made.
- The API glossary expanded AFAI as “Algae Floating Area Index”; the verified NOAA/AOML dataset metadata uses “Alternate Floating Algae Index”.

## Changes
- Add a dependency-free shared browser/CommonJS freshness contract.
- Fail closed on missing, invalid, future or older-than-36-hour observation timestamps.
- Render validation percentages only when the public record explicitly says it is fresh, was generated within 36 hours, has a valid window/sample size, and includes MQ in its declared scope, including the pricing-page proof widget.
- Keep stale/incomplete/out-of-scope records visible only as dated metadata; never render their accuracy percentage.
- Gate authority-page score/verdict values on `erddapTimestamp`.
- Remove unsupported accuracy/cadence claims and distinguish pipeline polling from new AFAI observations.
- Correct the AFAI glossary term.
- Add deterministic Node tests for timestamp handling, record scope/freshness and page contracts.

## Safety
No prices, tiers, offer names, CTA destinations, payment/checkout code, observations, model equations, freshness thresholds, Worker runtime settings, DNS, secrets, production data/schema, emails or notifications are changed. Canonical Pro price strings are asserted unchanged.

## Validation
The repository test runner discovers all `*.test.cjs` files. The new test will run in CI on the PR head. No local PC execution is claimed.

## Deployment
Code/content-only. The six-region production freshness gate remains unchanged and must not be bypassed. No deployment is initiated by this PR.
