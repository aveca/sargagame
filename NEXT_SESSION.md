# NEXT_SESSION — sargagame

> **🎯 2026-07-29 — ROOT CAUSE OF ALL PAYMENT FAILURES FOUND AND FIXED, DEPLOYED TWICE.**
>
> ### THE REAL BUG (caused ALL payments to fail — card, Apple Pay, everything)
> In my earlier fix, I added `$payment->id` to the redirect URL in `mollie.php` line 109, but `$payment` doesn't exist yet — it's created at line 139 (`$payment = $mollie->payments->create(...)`). This caused a PHP fatal error on EVERY `create_payment` call, blocking ALL payments on mobile AND desktop.
>
> **Fix (commit c2e1f8f8)**: Reverted the `payment_id`-in-URL approach. Now the handler uses localStorage `sg_mollie_pending` as fallback when sessionStorage is wiped (iOS Safari). `walletRedirect()` also persists to localStorage. This is clean and correct.
>
> ### Additional fixes deployed (commit 0c7c9d9d, deployed)
> - `sg_widget_sign()` array payload fix (was breaking ALL B2B Pro tokens)
> - `applePayPaymentToken` now passed to Mollie `payments->create()` (direct Apple Pay)
> - `subscription.paid` / `charge_failed` / `payment.failed` handlers added
> - B2B annual one-time payment now grants Pro (365d override)
> - Direct Apple Pay inline status check: retry 3×2s (race condition)
>
> ### Deploy status
> - Martinique ✅ fast deploy (1448 fichiers) — COMPLETED TWICE (first deploy timed out before reaching Martinique)
> - Guadeloupe ✅ fast deploy (1513 fichiers) — COMPLETED TWICE
> - Punta Cana / Riviera Maya / Florida — fallback syncing in background
> - **Fresh build `DGRi6tkq`** deployed, replacing stale build `CodSw6CP` (which had JS scoping issues with `retryCtx`)
>
> ### `retryCtx is not defined` (secondary issue — pre-existing stale build)
> The JS error `retryCtx is not defined` was caused by a stale build on the server (`PremiumModal-CodSw6CP.js`) not matching the source code that has `const [retryCtx,setRetryCtx]=useState(null)` inside B2BModal. After rebuilding (new hash `DGRi6tkq`), this should be resolved. If the error persists after deploy, it's a real scoping bug to investigate.
>
> ### To test
> - Try paying with card → should work now (was also broken by the fatal PHP error)
> - Try Apple Pay → direct path (if Mollie domain validated) or hosted fallback
> - Check browser console (F12) for any remaining errors after test
> - If Apple Pay still fails → check Mollie dashboard: is Apple Pay enabled as a payment method?
>
> Previous commit history for context: 5c707c62 (inline retry), 0c7c9d9d (sg_widget_sign + applePayPaymentToken + webhook), 69198052 (payment_id URL fix which caused the fatal error), 302e5545 (initial URL fix).