# Plan de tests Phase 0.9 — Premier encaissement hôtelier validé

> Référence : scénarios détaillés dans `.ai/phase-07-test-scenarios.md` (A, B, C, D) — **préservés, non modifiés**. Ce plan en détaille l'exécution technique une fois les secrets provisionnés.
>
> **Contrainte** : aucun paiement réel, aucun déploiement en production, aucun email envoyé, aucun merge. Mode test Mollie uniquement.

## Prérequis (doivent être remplis avant tout test)

- [ ] `public/api/mollie-config.php` présent sur chaque domaine avec `api_key` (test), `webhook_secret`, `profile_id`, `supabase_service_key`
- [ ] `scripts/verify-mollie-config.php` → toutes les lignes `OK`
- [ ] Webhook déclaré dans le dashboard Mollie pour chaque domaine (événements `payments` + `subscriptions`)
- [ ] Table `payment_grants` créée dans Supabase, RLS : `anon` bloqué / `service_role` uniquement
- [ ] `SUPABASE_SERVICE_KEY` injecté (sinon `verify_subscription` → `lookup_failed`)

---

## Test 1 — Mollie mensuel (Pro 79 €/mois, abonnement récurrent)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1.1 | Front : choisir Pro 79€/mois → `payOf("pro")` → `create_subscription(plan=pro_monthly)` | `checkoutUrl` Mollie + `subscriptionId`, statut `pending`/`active` |
| 1.2 | Payer sur checkout Mollie (mode test, carte de test) | Webhook `subscription.created` / `subscription.paid` reçu |
| 1.3 | Webhook valide signature HMAC (`webhook_secret`) | 200 si valide |
| 1.4 | `mol_b2b_grant_once(customerId, "pro_monthly", subscriptionId, null, email)` | Token Pro généré, TTL 30j, stocké dans `payment_grants` (type=b2b_pro) |
| 1.5 | Idempotence : re-poster le même webhook `subscription.paid` | `already_granted`, pas de double token, pas de double écriture Supabase |
| 1.6 | Cross-device : nouvel appareil, `verify_subscription?email=<hotel>&kind=b2b_pro` | `{active:true, kind:"b2b_pro", plan:"pro_monthly", passEnd:<+30j>}` |
| 1.7 | Accès Pro sur redirection navigateur seule (`?mollie_return=1`) | **REFUSÉ** — grant uniquement côté webhook serveur-à-serveur |

---

## Test 2 — Mollie annuel (Pro 690 €/an, paiement one-shot)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 2.1 | Front : choisir Pro annuel 690€ → `b2b-create-checkout.php` (offer_type=pro_annual, source=b2b_annual) | `checkoutUrl` + `subscriptionId` + `customerId` |
| 2.2 | Payer sur checkout Mollie (mode test) | Webhook `payment.paid` avec `metadata.source=b2b_annual` |
| 2.3 | `mol_b2b_grant_once(email, "pro_monthly", paymentId, 365, email)` | Token Pro 365j, `payment_grants` (type=b2b_pro, plan=pro_monthly) |
| 2.4 | Cross-device : `verify_subscription?email=<hotel>&kind=b2b_pro` | `{active:true, kind:"b2b_pro", plan:"pro_monthly", passEnd:<+365j>}` |
| 2.5 | Expiration simulée (date future) | `verify_subscription` → `{active:false}` |

---

## Test 3 — Webhook, sécurité, idempotence

| ID | Scénario | Résultat attendu |
|----|----------|-----------------|
| 3.1 | Webhook sans `webhook_secret` configuré | HTTP 503 |
| 3.2 | Webhook avec signature invalide | HTTP 403 |
| 3.3 | Webhook `id` aléatoire (pas de paiement réel) | Rejeté, pas de grant |
| 3.4 | Même `subscriptionId` posté 3 fois | 1er grant, 2e/3e `already_granted` |
| 3.5 | Cohérence Mollie vs `payment_grants` | Tout grant correspond à un webhook `paid`/`settled`/`subscription.paid` |

---

## Test 4 — Révocation (annulation / expiration)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 4.1 | Webhook `subscription.canceled` | `mol_b2b_revoke(subscriptionId)`, token invalide |
| 4.2 | Post-révocation : `verify_subscription?email=<hotel>&kind=b2b_pro` | `{active:false}` ou token rejeté par `sg_widget_verify` |

---

## Test 5 — Supabase (persistance cross-device)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 5.1 | Grant créé via webhook → ligne dans `payment_grants` | Ligne présente, `revoked_at` NULL |
| 5.2 | `verify_subscription` depuis un autre appareil/domaine | Même résultat que l'appareil d'origine |
| 5.3 | `SUPABASE_SERVICE_KEY` absent (simulation) | `{active:false, reason:"lookup_failed"}` — pas de crash, fail-open |

---

## Critères de succès (tous doivent être verts)

- [ ] Aucun paiement réel (Mollie mode test uniquement)
- [ ] Aucun déploiement en production
- [ ] Aucun merge sans autorisation
- [ ] Webhook fail-closed (503 sans secret, 403 signature invalide)
- [ ] Grant uniquement sur `paid`/`settled`/`subscription.paid`
- [ ] Révocation sur `canceled`/`expired`
- [ ] Idempotent via transient `mollie_grant_<subscriptionId>`
- [ ] Aucun accès Pro sur redirection navigateur seule
- [ ] `php -l` OK sur tous les fichiers PHP
- [ ] `npm run build` exit 0, bundle ≤ 210 Ko
- [ ] `tests/unit/b2b-payment-flow.test.cjs` → 31/31

---

**Résultat visé** : un premier abonnement hôtelier techniquement validé (Pro mensuel 79€ et/ou Pro annuel 690€), prêt à être commercialisé.