# Unified analytics ingestion — credentials setup

`scripts/automation/pull-all-analytics.cjs` merges every analytics plane into a
single file the design loop reads:

    scripts/automation/data/analytics-snapshot.json   (GITIGNORED — never committed)

Each plane degrades **independently**. A missing credential only nulls its own
section (`freshness.<section>.ok = false`) and prints a clear `SKIPPED` line —
the script never throws and never blocks the others. The script is also
**deterministic**: it makes no wall-clock call; the `generated` field comes from
`SNAP_TS` (or the literal `'unset'`), so the caller stamps the time.

## Where creds live

All secrets live in `.env` at the repo root (gitignored, line 20) **or** in
GitHub Actions secrets injected as env vars. The script reads `process.env` first
(CI), then falls back to a manual `.env` parse (no `dotenv` dependency). Secrets
are **never** committed.

This is **one-time** setup: drop the values once and every future run picks them up.

---

## 1. `GOOGLE_SERVICE_ACCOUNT_JSON` — unlocks BOTH `gsc` + `ga4`  (REQUIRED for SEO/traffic)

- **What:** the full JSON of a Google Cloud service-account key, as a **single line**
  (the entire `{...}` object, not a file path). Read verbatim by the script:
  `JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)` — same pattern as
  `scripts/automation/lib/google-auth.cjs`.
- **Where to get it:** Google Cloud Console → IAM & Admin → Service Accounts →
  (the project's automation SA) → Keys → **Add key → Create new key → JSON**.
  Download the JSON, then paste its contents as one line.
- **Grant the SA access (auth succeeding does NOT imply property access):**
  - **GSC:** Search Console → each property → Settings → Users and permissions →
    add the SA email (the `client_email` from the JSON), Restricted is enough.
    Properties: `sc-domain:sargasses-martinique.com`, `sc-domain:sargasses-guadeloupe.com`
    (domain properties — `sc-domain:` prefix, no scheme).
  - **GA4:** each GA4 property → Admin → Property Access Management → add the SA
    email as **Viewer**.
- **`.env` line** (wrap in single quotes, keep ONE line so the escaped `\n` in
  `private_key` stay intact):

      GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@...iam.gserviceaccount.com", ...}'

- **CI:** store as GitHub secret `GOOGLE_SERVICE_ACCOUNT_JSON`, inject in the
  workflow step's `env:`.
- **If absent:** `gsc` + `ga4` sections stay `null` (`ok:false`,
  `note:"missing GOOGLE_SERVICE_ACCOUNT_JSON"`). SEO/traffic blind; everything else still runs.

### GA4 property ids (needed for the `ga4` section to populate)

    GA4_PROPERTY_ID_MQ=123456789      # numeric Martinique property id
    GA4_PROPERTY_ID_GP=123456789      # numeric Guadeloupe property id

Find them in GA4 → Admin → Property Settings → **Property ID** (numeric).
If the SA JSON is present but these ids are absent, the `ga4` section is skipped
with `note:"no GA4 property ids ..."`.

---

## 2. `CLARITY_API_TOKEN` — OPTIONAL (corroborating section only)

- **What:** Microsoft Clarity Data Export API token (JWT, project-scoped to
  `w4o6w9aenv`).
- **Where to get it:** Clarity → project → **Settings → Data Export → Generate
  new API token** (admin only).
- **`.env` line:**

      CLARITY_API_TOKEN=eyJ...

- **If absent:** `clarity` section `null` (`note:"missing CLARITY_API_TOKEN"`).
  This is **expected and fine** — the first-party heatmap is the primary
  behaviour signal; Clarity only ever corroborates and is hard-limited (last 3
  days, 10 calls/day). Safe to leave unset.

---

## 3. First-party stats key — ALREADY WIRED (no new cred)

The live `stats.php` aggregate is key-gated. The key is **not** in the repo; it is
fetched server-side over FTPS using the **existing** deploy creds already in `.env`:

    FTP_HOST_MQ / FTP_USER_MQ / FTP_PASS_MQ

`scripts/tmp-wf-results/fetch-stats.cjs` downloads `sg-data/.statskey`, persists it
to `scripts/automation/data/stats-keys.json` (gitignored, line 87), then
`pull-all-analytics.cjs` reads `stats-keys.json` `.mq` and GETs
`https://sargasses-martinique.com/stats.php?key=<key>&days=14`, copying the JSON
verbatim into `firstParty`.

- **Refresh the key when needed:** `node scripts/tmp-wf-results/fetch-stats.cjs`
- **If `stats-keys.json` missing:** `firstParty` section `null`
  (`note:"missing stats-keys.json (mq key) ..."`); screens/heatmap/bored unavailable.

---

## 4. Funnel — ALWAYS, no cred

Public Apps Script web app, no auth:

    https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel

> ⚠️ `funnel.payments_real` / `funnel.revenue_real` are **KNOWN-MISLEADING** — never
> report them as revenue. Stripe is the revenue source of truth.

---

## Running

    # production (caller stamps the time):
    SNAP_TS="2026-06-15T12:00:00Z" node scripts/automation/pull-all-analytics.cjs

    # PowerShell:
    $env:SNAP_TS = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"); node scripts/automation/pull-all-analytics.cjs

    # without SNAP_TS → generated:"unset" (still writes the snapshot)
    node scripts/automation/pull-all-analytics.cjs

## npm deps

- `googleapis` (`^171.4.0`) — already in `package.json`. Powers both GSC and GA4
  (the script reuses `google.searchconsole` / `google.analyticsdata`).
- `@google-analytics/data` — **not** required (the GA4 puller uses `googleapis`,
  not the standalone `BetaAnalyticsDataClient`). Do **not** install it.

## Minimum to light up the loop's PRIMARY signal (behaviour)

`FTP_*_MQ` (already present) → run `fetch-stats.cjs` once → `firstParty` =
screens + heatmap + bored. Add `GOOGLE_SERVICE_ACCOUNT_JSON` (+ GA4 ids) for
SEO + traffic. `CLARITY_API_TOKEN` is purely optional.
