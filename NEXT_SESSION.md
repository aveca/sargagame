# NEXT_SESSION — sargagame

> **🎯 2026-07-29 — ALL MONEY-PATH BUGS FIXED, COMMITTED & DEPLOYED (Martinique + Guadeloupe fast deploy ✅).** 3 commits in sequence.
>
> ### Commits
> - `5c707c62` — direct Apple Pay inline status race condition fix (retry 3×2s)
> - `0c7c9d9d` — sg_widget_sign array fix + applePayPaymentToken pass-through + webhook renewal+failure + B2B annual grant
> - `69198052` — hosted checkout redirect payment_id+email in URL + handler retry pending + email fallback
>
> ### Bugs found and fixed (7 total)
> | Bug | Where | Fix |
> |-----|-------|-----|
> | `sg_widget_sign()` array→string cast → ALL B2B Pro tokens broken (`h:"Array"`) | `widget-token.php` | Now accepts array payload with explicit `exp` |
> | `applePayPaymentToken` ignored in `create_payment` → direct Apple Pay silent fail | `mollie.php` | Passed through to Mollie `payments->create()` |
> | Direct Apple Pay inline status check: no retry → Mollie hasn't settled yet → immediate "not paid" cancel | `PremiumModal.jsx` onpaymentauthorized | Retry loop 3×2s |
> | iOS Safari wipes sessionStorage after Apple Pay redirect → hosted checkout handler loses context | `mollie.php` + `Sargasses_PROD.jsx` | payment_id+email in URL; handler reads URL if sessionStorage empty; polls pending 3×; email fallback |
> | `subscription.paid` missing → renewals never extend Pro access | `mollie-webhook.php` | Added handler re-grants Pro |
> | `subscription.charge_failed` / `payment.failed` missing → failed payments never revoke | `mollie-webhook.php` + `mollie-lib.php` | Added handlers + new `mol_b2c_pass_revoke()` |
> | B2B annual `payment.paid` → no grant (just logged) | `mollie-webhook.php` | Now calls `mol_b2b_grant_once(365d override)` |
>
> ### Deploy status
> - Martinique ✅ fast deploy (1448 fichiers, 321 Mo)
> - Guadeloupe ✅ fast deploy (1513 fichiers, 370 Mo)
> - Punta Cana / Riviera Maya / Florida — fallback FTP still syncing (smaller assets)
> - Barbados — skipped (no FTP credentials)
> - Apps Script: `clasp push` = founder mobile only (AGENTS.md rule)
>
> ### What Apple Pay looks like now
> - **Direct path** (domain validated in Mollie): Apple Pay sheet → instant payment → inline status (retry 3×2s) → premium activated immediately. No redirect, no sessionStorage.
> - **Hosted fallback** (domain not validated): Mollie hosted checkout → user pays → Mollie redirects to `?mollie_return=1&payment_id=xxx&email=yyy` → handler reads URL → polls pending → premium activated.
> - Both paths now have proper retry logic.
>
> ### Verify with user
> - If Apple Pay still fails, test: direct Apple Pay path → if Mollie domain not validated, fallback to hosted redirect → check browser console for errors
> - Also ask: does the **credit card** flow work (it goes through `doSubscribe` → same `mollie_return=1` handler now fixed)
>
> **🎯 2026-07-28 — MASTER_AUDIT + 30-DAY BATTLE PLAN COMPLETED.** See earlier notes.
> **🎯 2026-07-28 — PAYWALL SIMPLIFIÉ.** See earlier notes.