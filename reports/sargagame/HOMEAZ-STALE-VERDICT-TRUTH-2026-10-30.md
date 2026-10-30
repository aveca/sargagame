# HomeAZ stale-verdict and source-truth correction — 2026-10-30

## Evidence

Current main payload at the time of work:
- `erddapTimestamp=2026-10-27T12:00:00Z`
- `dataAgeMinutes=1770`
- `stale=false`
- `updatedAt=2026-10-28T17:29:52.717Z`

At approximately 2026-10-30 03:50 UTC, the observation was about 3,830 minutes old. The stored age was stale and materially understated the actual elapsed time.

HomeAZ already derived its badge from `erddapTimestamp`, but its stale branch still:
- colored `#vTxt` using the original clean/moderate/avoid color;
- populated `#vScore` with the numeric score;
- rendered top-three status colors and scores;
- attributed the generic `source: "erddap-live"` payload to Copernicus in the eyebrow/footer;
- used “LIVE / EN DIRECT” and “this morning” copy for observations under 12 hours, including observations nearly 12 hours old.

The B2B hotel freshness correction in PR #1137 did not cover HomeAZ.

## Changes on this branch

Branch: `fix/homeaz-stale-verdict-truth-20261030`

Base: `main@68d59a33aed871b3d3f937355d42588594a1d360`

- Stale/unknown HomeAZ verdicts are explicitly labelled as the last observed status.
- Stale/unknown hero and top-three numeric scores are suppressed; the complete hero score capsule (label and denominator included) is hidden.
- Stale/unknown verdict styling is neutral rather than green/amber status coloring.
- Fresh (<12h) copy now says “recent observation”, not “LIVE / EN DIRECT”.
- “This morning” and “today” labels were removed from the observation status.
- Generic ERDDAP payloads are labelled neutrally as satellite observations; no unsupported Copernicus attribution is emitted.
- Existing 12h/15h freshness boundaries and observation timestamp semantics are preserved.

## Tests

- `tests/unit/home-az-freshness.test.cjs`: updated copy/score/source assertions.
- `scripts/homeaz-freshness-smoke.mjs`: real built-app Playwright checks at 390×844 and 1440×900; asserts recent label, historical stale verdict, suppressed hero/top-three scores, and no Copernicus attribution.

## Safety

No observation, forecast, beach status, score input, track record, price, checkout/payment code, Worker runtime, Supabase schema, secret or production data was changed.

## Validation

PR checks must run on the report-inclusive exact head. Do not claim production delivery until the six Pages projects confirm the new code. The current production Pages projects were still on `164d70fd5a494c638c4a804a093381e28fc393de` at the time this branch was created.
