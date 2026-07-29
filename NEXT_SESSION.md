# NEXT_SESSION — sargagame

> **🎯 2026-07-29 — ALL MONEY-PATH BUGS FIXED AND COMMITTED.**
> - Fix 1 (CRITICAL): `sg_widget_sign()` in `widget-token.php` — called with an array from `mol_b2b_grant_once()`, PHP cast to "Array" string → ALL B2B Pro tokens were forged (h:"Array", 400 days default). Fixed: `sg_widget_sign()` now accepts array payload with explicit `exp`.
> - Fix 2 (CRITICAL): `applePayPaymentToken` was never passed to Mollie API in `create_payment` → direct Apple Pay silently failed. Fixed: `mollie.php` now passes `applePayPaymentToken` to `payments->create()`.
> - Fix 3 (iOS): sessionStorage wipe after Apple Pay redirect on iOS Safari → `?mollie_return=1` handler lost context → premium never activated. Fixed: redirect URL now carries `payment_id+email` as URL params; handler reads from URL if sessionStorage empty; polls `pending` 3×; email fallback.
> - Fix 4: Webhook missing events — `subscription.paid` (recurring renewal) → Pro now extends on each renewal; `subscription.charge_failed` → logged; `payment.failed` → B2C pass revoked via new `mol_b2c_pass_revoke()`; B2B annual one-time `payment.paid` → Pro grant (365d override).
> - Commit `0c7c9d9d` — all fixes together. Build ✅ · PHP lint ✅ · Bundle 201KB ≤ 210KB ✅
> - Deploy still needed — use Apps Script deploy script or `clasp push` as per deploy workflow.
>
> **Full Mollie audit notes:** 2 distinct bugs found in Apple Pay flow: direct path (applePayPaymentToken ignored) + hosted fallback (sessionStorage iOS wipe). Both fixed. Webhook had 4 missing event handlers. sg_widget_sign was broken for B2B. All now fixed.
>
> **🎯 2026-07-28 — MASTER_AUDIT + 30-DAY BATTLE PLAN COMPLETED.** 7 audits parallèles → `MASTER_AUDIT.md` + `30DAY_BATTLE_PLAN.md`.
> - Audit #0–#7 summary, CRO quick wins partially applied.
> - Suite: Week 1 P0 tasks from `30DAY_BATTLE_PLAN.md`.
>
> **🎯 2026-07-28 — PAYWALL SIMPLIFIÉ.** PassOffer réécrit (1 produit, 1 prix, 1 CTA). PremiumModal allégé (-2171 lignes).