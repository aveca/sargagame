# NEXT_SESSION — sargagame

> **🎯 2026-11-06 — P0.46 : ALERTES B2C FAIL-CLOSED + IDEMPOTENCE DURABLE (PR #1294, Draft)**

### 2026-11-06 — P0.46 — Moteur d'alertes B2C fail-closed (234 abonnés actifs)

#### Ce qui a été fait
1. **§2 Filtres vides** — filtre plage `NULL` / vide / IDs inconnus / région absente / sans correspondance ⇒ **aucune alerte**. Double garde (`runB2CAlerts` + `b2cSelectedAlertLevels`). Un tableau vide n'est **jamais** « toutes les plages ». Aucun abonnement modifié.
2. **§3 Contrat API réel** — seules `levels`, `weekly`, `erddapTimestamp`, `stale` sont lues. **Plus de `fc.beaches`, plus de `fc.data`, plus de recherche textuelle JSON.** Une plage présente **uniquement dans `weekly`** ne notifie pas (il faut une observation de niveau plage explicite).
3. **§4 Porte scientifique** — `erddapTimestamp` valide, **non futur**, âge réel ≤ **900 min**, `stale === false` **strict**. **`updatedAt` et `dataAgeMinutes` ne sont jamais des substituts.** Données manquantes/invalides ⇒ **aucun email**.
4. **§6 Idempotence durable** — le manque réel était l'**absence de marqueur de livraison**. Correction : table **dédiée** `public.b2c_alert_deliveries` (PK `(subscription_id, observation_ts, beaches_hash)`) + RPC atomique `public.sg_claim_b2c_alert_delivery`, **claim AVANT envoi**. Marqueur indisponible ⇒ **fail-closed (zéro envoi)** ; marqueur déjà pris ⇒ doublon **supprimé**. **Aucune PII**, `b2c_alerts` **jamais modifiée**, KV best-effort **refusé**.
5. **§5 Tests** — 18 assertions fail-closed + 19 assertions d'idempotence. Le `fetch` est intercepté en mode **STRICT** : **le test échoue** si un provider d'email réel ou un hôte inattendu est contacté. Mutation-testes A2/C/B ⇒ échec attendu (les tests mordent).

#### Branche / PR
- Branche : `feature/p0-mollie-durable-fulfillment-20261105`
- PR : **#1294 (Draft, OPEN)** — https://github.com/aveca/sargagame/pull/1294
- Commit head : **commit de handoff P0.46** (tête de branche) — code P0.46 : `02c58177efeb0cdc3a6db4eedf391dcb36dcd663` — sync `main` n°1 : `cc93a2202` — sync `main` n°2 : `1ac1563c0a139c9a6f826ea1dd3bd21f00d6c0c6` — merge des commits sécurité concurrents : `2e0da8f80` (**pas de rebase, pas de force push**)
- Divergence vs `origin/main` (`f3b085b76`) : **0 behind**

#### Tests
- `npm ci` ✅ · `npm test` **167/167** ✅ · `npm run build` ✅ · bundle **206.5/210 Ko** (`211462/215040`) ✅
- B2C fail-closed **18/18** · B2C idempotence **19/19** · Mollie worker **6/6** · payment regression **7/7** · regional contract **11/11** · private guard **2/2**
- CI GitHub → **4/4 PASS** sur la tête finale `19be8adbf` : `test-frontend` (2m11s, run `42174963431`) · `perf` (23s) · `lighthouse-report` (3m21s, run `42174963404`) · `GitGuardian Security Checks` (23s) — **4/4 PASS aussi sur le SHA de code `02c58177e`**

#### Reste à faire (hors périmètre P0.46)
- [ ] **Migration `005_b2c_alert_delivery_markers.sql` PRÉPARÉE MAIS NON APPLIQUÉE** ⇒ **pré-condition de déploiement** : sans elle, le moteur reste fail-closed (**zéro alerte**). Autorisation requise.
- [ ] **Déploiement de `sg-payments`** (dernier déploiement live `2026-10-02T04:11:44Z`) : le code fail-closed **n'est pas en prod** tant que la PR n'est ni mergée ni déployée.
- [ ] `BUG-2026-127` — allowlist Tulum : `sargazotulum.com` absent de `ALLOWED_HOSTS` et `ALLOWED_ORIGINS` (webhook Mollie + CORS). PR dédiée.
- [ ] `BUG-2026-128` — mapping `B2B_PLANS` → `b2b_subscriptions.plan` (`free`/`alert`/`dashboard`/`enterprise`) : échec fermé, mapping à trancher.
- [ ] Aucun email réel, aucun cron exécuté, aucun déploiement, aucun merge — **PR #1294 maintenue Draft**.

---

> **🎯 2026-07-30 — PAYMENT FLOW FIX + UI IMPROVEMENTS**

### 2026-07-30 — Mollie payment flow fixes and checkout UI improvements

#### Bugs fixed
1. **mollie.php `payment_status` action** — Added `terminal` field to response for canceled/expired/failed statuses. Previously only `paid`/`settled` was handled; other statuses fell through silently.
2. **PremiumModal.jsx doSubscribe error classification** — Added user-friendly error messages for common Mollie API errors: Unauthorized (API key issues), price tampering, double checkout, and generic failures. Previously raw error strings were shown to users.
3. **PremiumModal.jsx walletRedirect error classification** — Same error classification applied to wallet redirect path (Apple Pay fallback, Google Pay).
4. **PremiumModal.jsx terminal status handling** — Added proper handling for Mollie terminal statuses (canceled, expired, failed) in both doSubscribe non-3DS path and walletRedirect path. Users now see specific messages like "Paiement annulé" instead of generic "Paiement impossible".
5. **Sargasses_PROD.jsx mollie_return handler** — Added terminal status detection in the payment polling loop. If Mollie reports a terminal failure status (canceled/expired/failed) during polling, the flow immediately redirects to `?payment_failed=1` instead of waiting for all 3 retry attempts.
6. **PremiumModal.jsx redirecting UI** — Added visual "redirecting to Mollie" overlay with spinner and "Ne ferme pas cette page" message when `payRedirecting` state is true.

#### UI improvements
- **Better error messages**: Mollie API errors are now classified and shown as user-friendly French/English/Spanish messages instead of raw technical strings
- **Redirecting feedback**: Visual indicator when user is being redirected to Mollie hosted checkout
- **Terminal status handling**: Users see specific messages for canceled/expired/failed payments instead of generic errors
- **Consistent error classification**: Same error taxonomy applied to doSubscribe, walletRedirect, and applePay paths

#### Files modified
- `public/api/mollie.php` — Added `terminal` field to payment_status response
- `src/PremiumModal.jsx` — Error classification, terminal status handling, redirecting UI
- `src/Sargasses_PROD.jsx` — Terminal status detection in mollie_return handler

#### Tests
- `npm run build` ✅
- `node scripts/check-bundle-budget.cjs` ✅ (202.6 Ko gzip ≤ 210 Ko)
- `php -l public/api/mollie.php` ✅
- `php -l public/api/mollie-lib.php` ✅
- `php -l public/api/mollie-webhook.php` ✅
- `php -l public/api/create-checkout.php` ✅
- `node scripts/ux-smoke.mjs` ✅ (FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[])
- `node scripts/run-tests.cjs` ✅ (38+38+16+14 regions/orientation pass, 0 fail)

#### Remaining issues
- **webhook_secret not configured**: `mollie-config.php` has `webhook_secret` commented out → webhook signature verification is fail-open. Needs to be set in the server config via `mollie-config.php` on the FTP deploy.
- **Live API key in config**: `mollie-config.php` contains `live_H6BUh7uxdUkFKAnBQhz3tRVsuerNPs` — this is gitignored and only exists on the server, but should be verified it's not committed anywhere in git history.
- **PremiumModal.jsx complexity**: The file is now ~3353 lines with many A/B test variants. Consider splitting into smaller modules for long-term maintainability.
- **No dedicated payment success/cancel/error pages**: The app uses query parameters and generic error handling. Dedicated pages would improve the UX.
- **Playwright E2E testing**: Could not run Playwright tests locally (preview server not persistent in this environment). Should be run in CI or locally with `npx playwright test`.
- **Florida region test warning**: `[regions] ⚠️ florida.json ignorée (invalide, non-core)` — appears to be a stale warning from a previous data format; all 20 Florida beaches currently have correct `island: "florida"`.

#### 2026-07-31 — Payment flow error classification bug fix

#### Bugs fixed
1. **PremiumModal.jsx `doSubscribe` error fallback (line 1709)** — `msg` was undefined in the `doSubscribe` try-block scope (it only exists in the `catch(e)` block). The `else` branch for unknown Mollie API errors unconditionally fell through to the generic "Paiement impossible" French message instead of showing the actual server error. Fixed by replacing `msg` with `errMsg` so the real server error is shown as fallback. This affects users who see a non-matching Mollie API error — they now get the actual error string instead of a misleading generic message.

#### Previous session history

### Previous ROOT CAUSES (documented in prior sessions)
- mollie.php PHP fatal from `$payment->id` before creation
- retryCtx crash in B2BModal
- Mollie PHP SDK not installed on server
- Server config array vs constants mismatch
- getCheckoutUrl property vs method
- Wallet payment fixes (cur field, paymentMethod, subscriptionId)
- `msg` undefined in doSubscribe error fallback (2026-07-31)

### Deploy status
- Martinique ✅ fast deploy — build v218
- Guadeloupe ✅ fast deploy — build v218
- Florida / Punta Cana / Riviera Maya — FTP fallback (slow, incomplete)
- Barbados — no FTP credentials configured