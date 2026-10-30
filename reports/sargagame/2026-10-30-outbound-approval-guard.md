# Outbound and destructive-automation approval guard — 2026-10-30

## Evidence from the scheduled run

Run: [Daily Copernicus + Deploy #41051511726](https://github.com/aveca/sargagame/actions/runs/41051511726), 2026-10-30 11:55 UTC.

- `push-winback.cjs --send` was invoked. Both MQ and GP were skipped by the 14-day cadence; no accepted push is shown.
- `incident-apology.cjs` reported no pending incident recipients; no email send is shown.
- SMTP-backed watch alerts failed with SMTP 535 authentication errors; no successful SMTP delivery is confirmed.
- Apps Script `clean_bounces` was called and returned `removed: 0` (10 bounced rows reported).
- `purge-analytics.cjs` ran with `dry=false`; it counted 302 eligible rows but logged `0 ligne(s) supprimée(s) en 0 lot(s)`. No deletion is confirmed, but the scheduled workflow attempted the destructive path without a per-run approval.
- The `email-automation` job is `continue-on-error: true`, so step failures do not reliably make the job fail.

## Proposed guard in this PR

- Add `workflow_dispatch` inputs `authorize_outbound` and `authorize_data_cleanup`, both defaulting to false.
- Scheduled win-back and SMTP watch scripts run without `--send` (dry-run); actual sends require a manual dispatch with `authorize_outbound=true`.
- Incident apologies use `--dry-run` on schedule; actual sends require the same manual approval.
- `notify-failure.cjs` gains a `--dry-run` mode that exits before SMTP.
- Apps Script bounced-email cleanup is skipped on schedule and requires `authorize_data_cleanup=true`.
- Analytics purge runs with `--dry` on schedule; destructive deletion requires `authorize_data_cleanup=true`.
- The missing `scripts/automation/ux-daily.cjs` step is skipped until that file exists.
- Payment-link JSON files `public/api/b2b-paylinks.json` and `public/api/mollie-passlinks.json` are excluded from the automatic email-state commit.

## Safety and scope

This PR changes workflow/code guards only. It does not send an email or push, delete production analytics, clean the external subscriber sheet, modify payment links, change checkout, or touch secrets. It is intentionally a draft pending CI and operator review. No production action was triggered by this PR.

The guard covers `.github/workflows/daily-copernicus.yml` and its failure-notification path. Other independent notification workflows (for example, visitor-photo/report notifications) still require separate verification before claiming all outbound paths are approval-gated.

## Additional root cause found during review

The first draft did not cover two SMTP paths in the same workflow:

- The `health-check.cjs` step inside `email-automation` received `SMTP_PASS` and called `sendEmail()` without an approval gate.
- The separate `notify-failure` job invoked `notify-failure.cjs` without `--dry-run`, so a scheduled failure could send an email even though the other watch steps were dry-run.

The PR branch now:
- makes `health-check.cjs` require explicit `--send` (dry-run by default);
- passes SMTP credentials only for a manually dispatched run with `authorize_outbound=true`;
- runs the health-check email path with `--dry-run` on schedule;
- runs failure notifications with `--dry-run` on schedule and `--send` only for the approved manual dispatch;
- adds regression assertions for both callers and the script-level guard.

This remains a draft and is not merged or activated in production.