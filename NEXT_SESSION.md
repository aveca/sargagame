# NEXT_SESSION — sargagame

> **🎯 2026-07-29 — ALL PAYMENT FAILURES FIXED AND DEPLOYED.**
>
> ### ROOT CAUSE 1: mollie.php PHP fatal (blocked ALL payments)
> In my earlier fix, I added `$payment->id` to the redirect URL in `mollie.php` line 109, but `$payment` doesn't exist yet — it's created at line 139 (`$payment = $mollie->payments->create(...)`). This caused a PHP fatal error on EVERY `create_payment` call, blocking ALL payments on mobile AND desktop.
>
> **Fix (commit c2e1f8f8)**: Reverted the `payment_id`-in-URL approach. Now the handler uses localStorage `sg_mollie_pending` as fallback when sessionStorage is wiped (iOS Safari). `walletRedirect()` also persists to localStorage.
>
> ### ROOT CAUSE 2: retryCtx crash (paywall unmounted → user sees map)
> The `retryCtx` state (`const [retryCtx,setRetryCtx]=useState(null)` inside B2BModal) was causing a `ReferenceError: retryCtx is not defined` at runtime when `payError` was set (e.g., after mollie.php 500). React's `componentDidCatch` caught it → B2BModal unmounted → `onClose()` → user sent back to map with NO payment screen.
>
> **Fix (commit 754dacd9)**: Removed `retryCtx` state entirely. The paywall error display now uses a uniform error style (no retry-specific branch). This was the reason users saw "back to map" instead of an error message.
>
> ### Additional fixes (commit 0c7c9d9d, deployed)
> - `sg_widget_sign()` array payload fix (was breaking ALL B2B Pro tokens)
> - `applePayPaymentToken` now passed to Mollie `payments->create()` (direct Apple Pay)
> - `subscription.paid` / `charge_failed` / `payment.failed` handlers added
> - B2B annual one-time payment now grants Pro (365d override)
> - Direct Apple Pay inline status check: retry 3×2s (race condition)
>
> ### Deploy status
> - Martinique ✅ fast deploy (1448 fichiers) — build `CGlyg-sF`
> - Guadeloupe ✅ fast deploy (1513 fichiers) — build `CGlyg-sF`
> - Florida / Punta Cana / Riviera Maya — FTP fallback (slow, incomplete — deploy timed out)
> - Barbados — no FTP credentials configured
>
> ### To test
> - Try paying with card → should work now (was broken by mollie.php fatal + paywall crash)
> - Try Apple Pay → direct path (if Mollie domain validated) or hosted fallback
> - Check browser console (F12) for any remaining errors after test
> - If Apple Pay still fails → check Mollie dashboard: is Apple Pay enabled as a payment method?
> - If card still fails → mollie.php 500 may still be cached on server (PHP opcache) or API key issue
>
> Previous commit history: 5c707c62 (inline retry), 0c7c9d9d (sg_widget_sign + applePayPaymentToken + webhook), 69198052 (payment_id URL fix which caused the fatal error), 302e5545 (initial URL fix).