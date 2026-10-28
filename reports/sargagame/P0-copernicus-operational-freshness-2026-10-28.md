# P0 Copernicus operational freshness — 2026-10-28

**Evidence captured:** 2026-10-28T20:15:44.952Z  
**Repository:** aveca/sargagame  
**Main observed at capture:** ec7597c7a1041bbdff8508a0e7bb096c7c00c8f6  
**Remediation PR:** [#1113](https://github.com/aveca/sargagame/pull/1113)

## Verified production evidence

- Latest source observation in the root and regional payloads: 2026-10-27T12:00:00Z.
- Computed observation age at capture: **1935.75 minutes**.
- Operational SLA: 900 minutes; breach: **1035.75 minutes**.
- Last published dataAgeMinutes is approximately 1,770–1,774 minutes, a frozen publication-time value rather than a live clock.
- Public stale=false remains consistent with the separate 2,160-minute display threshold; it does **not** establish operational freshness.
- [Latest Sentinel run #40751271140](https://github.com/aveca/sargagame/actions/runs/40751271140) completed successfully but reported LIVE_HEALTH=OK, zero incidents, and HTTP 200 for all six domains while its artifact recorded satellite age 1,868 minutes.
- [Latest production deployment #40736303225](https://github.com/aveca/sargagame/actions/runs/40736303225) completed, with final stage DEPLOYED_PENDING_VERIFICATION.
- The public [Miami Beach page](https://sargassummiami.com/beaches/miami-beach/) still displays a LIVE satellite badge and claims four refreshes daily. The page's displayed observation time does not match the current JSON source timestamp; CDN/cache causality is not yet proven.

## Root causes addressed in PR #1113

1. verify-ftp-ready.cjs now applies a strict 900-minute gate to the root payload and the six deployed regions, using erddapTimestamp, not updatedAt.
2. The six production regions are required; additional catalog payloads retain their existing source validation but cannot block the six-site SLA solely because an experimental region is old.
3. Both Copernicus workflows require successful ERDDAP fetch and successful freshness/integrity verification before dispatching production.
4. The production workflow gates all six prepared builds and rechecks each regional artifact immediately before Worker and Pages deployment.
5. The Sentinel reports OPERATIONAL_SLA_BREACHED / LIVE_HEALTH=DEGRADED separately from HTTP/Worker incidents. Freshness-only degradation does not create a new issue or send an external notification. HTTP 200 with malformed JSON fails closed.
6. Tests cover the 900/901-minute boundary, missing/invalid/future timestamps, all six production regions, workflow dispatch conditions, deployment gate ordering, and malformed JSON.

## CI evidence

At head 4aa7eeef33d5f8e668f825e4ac9a315fab42023b:

- [CI Tests #40761406226](https://github.com/aveca/sargagame/actions/runs/40761406226): **SUCCESS**, 86/86 test files; DEPLOY_TRIGGER_CONTRACT_TESTS PASS, LIVE_SATELLITE_FRESHNESS_SENTINEL_TESTS PASS (23 assertions), PREDEPLOY_SATELLITE_FRESHNESS_TESTS PASS (29 assertions), smoke ERRORS=[].
- [Perf Budget + Lighthouse #40761406314](https://github.com/aveca/sargagame/actions/runs/40761406314): **in progress at report capture**. Re-check the exact final head before merge.
- No local-PC execution is claimed.

## Separate unresolved risks

- The production source remains outside SLA. The new gate is fail-closed; no timestamp is fabricated and no data is marked fresh.
- The public pages still contain unsupported four-times-daily copy and some regional source files still contain the obsolete 3.5-day beach half-life claim. Correct source templates/content and a narrowly proven code-only release path are the next SEO task.
- All six latest Workers still report raw_run_worker_first=false and serve_directly=true. The actual Wrangler asset manifest still needs package-level proof. No Worker security change was made.
- Tulum DNS currently has an active proxied CNAME to sargagame-tulum.pages.dev; direct page verification through the available web reader failed, so current public reachability is not independently certified in this report.
- Tulum's seven-day Supabase aggregate (event counts, not unique users) shows sessions and beach opens through 2026-10-28 20:07 UTC, but paywall/modal events last occurred 2026-10-23 19:48 UTC and no CTA/checkout events appear in the window. Riviera Maya still records CTA/checkout events.
- No B2B price was selected; no payment, checkout, production schema, secret, DNS or Worker security change was made.

## Release rule

Do not treat this report or a green CI run as production certification. Merge only after all checks pass on the exact final head and the intended failure mode is understood. After merge, verify that the stale-data gate blocks before any Worker/Pages deploy. Do not close issue #1109 until the real source observation is within SLA and post-deploy verification is complete.
