# Scénarios de paiement test Phase 0.7 — Mollie mode test (aucun argent réel)

> Objectif : valider le flux bout-en-bout « hôtel souscrit → paie → accès Pro → cross-device → expiration/révocation ».
> Mode : Mollie test (clé `test_`), aucun paiement réel, aucun déploiement en production.

## Scénario A — Pro mensuel 79 €/mois (abonnement récurrent)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| A1 | Front : utilisateur choisit Pro 79€/mois → `payOf("pro")` → lien annuel OU `create_subscription(plan=pro_monthly)` | `checkoutUrl` Mollie retourné, `subscriptionId` créé, statut `pending`/`active` |
| A2 | Utilisateur paie sur checkout Mollie (mode test, carte de test) | Webhook `subscription.created` ou `subscription.paid` reçu par `/api/mollie-webhook.php` |
| A3 | Webhook valide signature HMAC (`webhook_secret`) | 200 si valide, 403 si invalide, 503 si secret absent |
| A4 | Webhook grant Pro : `mol_b2b_grant_once(customerId, "pro_monthly", subscriptionId, null, email)` | Token Pro généré, TTL 30j, stored in transient + Supabase `payment_grants` (type=b2b_pro) |
| A5 | Idempotence : re-post du même webhook `subscription.paid` | `already_granted`, pas de double token, pas de double Supabase write |
| A6 | Cross-device : nouvel appareil, `verify_subscription?email=<hotel>&kind=b2b_pro` | `{active:true, kind:"b2b_pro", plan:"pro_monthly", passEnd:<ms>, status:"paid"}` |
| A7 | Accès Pro sur redirection navigateur seule | **REFUSÉ** — grant uniquement côté webhook serveur-à-serveur, jamais sur `?mollie_return=1` |
| A8 | Annulation : webhook `subscription.canceled` | `mol_b2b_revoke(subscriptionId)`, transient supprimé, token invalide |
| A9 | Vérification post-révocation : `verify_subscription` | `{active:false, reason:"no_b2b_pro_grant"}` ou token rejeté par `sg_widget_verify` |

## Scénario B — Pro annuel 690 €/an (paiement one-shot)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| B1 | Front : utilisateur choisit Pro annuel 690€ → `b2b-create-checkout.php` (offer_type=pro_annual, source=b2b_annual) | `checkoutUrl` + `subscriptionId` + `customerId` |
| B2 | Utilisateur paie sur checkout Mollie (mode test) | Webhook `payment.paid` avec `metadata.source=b2b_annual` |
| A3 | Webhook grant : `mol_b2b_grant_once(email, "pro_monthly", paymentId, 365, email)` | Token Pro 365j, Supabase `payment_grants` (type=b2b_pro, plan=pro_monthly) |
| B4 | Cross-device : `verify_subscription?email=<hotel>&kind=b2b_pro` | `{active:true, kind:"b2b_pro", plan:"pro_monthly", passEnd:<+365j>}` |
| B5 | Expiration : après 365j (simuler avec date future) | `verify_subscription` → `{active:false}` (expires_at <= now) |

## Scénario C — Fiabilité et sécurité

| ID | Scénario | Résultat attendu |
|----|----------|-----------------|
| C1 | Webhook sans `webhook_secret` configuré | HTTP 503, `webhook_unavailable` |
| C2 | Webhook avec signature invalide | HTTP 403, `invalid_signature` |
| C3 | Webhook `id` aléatoire (pas de paiement Mollie réel) | Rejeté (Mollie API `get` échoue → 500, pas de grant) |
| C4 | Double attribution (même subscriptionId, 2 webhooks) | 2e → `already_granted`, pas de double grant |
| C5 | `verify_subscription` sans `SUPABASE_SERVICE_KEY` | `{active:false, reason:"lookup_failed"` (fail-open, pas de crash) |
| C6 | `mol_supabase_mirror` sans `supabase_service_key` | Skip silencieux, `mirror_ok=false`, pas de blocage |
| C7 | Webhook répété (même event/id) 3 fois | 1er grant, 2e/3e `already_granted`, cohérent |
| C8 | Cohérence Mollie vs payment_grants | Tout grant dans Supabase correspond à un webhook `paid`/`settled`/`subscription.paid` |
| C9 | Pas d'accès Pro sur simple redirection navigateur (`?mollie_return=1`) | Aucun grant côté navigateur ; grant uniquement webhook S2S |

## Scénario D — Prix cohérents (pas de changement)

| Plan | Montant | Intervalle | Source |
|------|---------|------------|--------|
| Pro mensuel | 79 € | 1 month | `mol_b2b_plans()` `pro_monthly.amount = 79.00` |
| Pro annuel | 690 € | 1 year | `mol_b2b_plans()` `pro_annual.amount = 690.00` |
| Brief mensuel | 29 € | 1 month | `mol_b2b_plans()` `brief_monthly.amount = 29.00` |
| Brief annuel | 290 € | 1 year | `mol_b2b_plans()` `brief_annual.amount = 290.00` |

Vérification : `payOf(tier)` → `/api/b2b-paylinks.json` → prix cohérents avec `mol_b2b_plans()`.

## Critères de succès (tous doivent être verts)

- [ ] Aucun paiement réel (Mollie mode test uniquement)
- [ ] Aucun déploiement en production
- [ ] Aucun merge sans approbation
- [ ] Webhook fail-closed (503 sans secret, 403 signature invalide)
- [ ] Grant uniquement sur `paid`/`settled`/`subscription.paid`
- [ ] Révocation sur `canceled`/`expired`
- [ ] Idempotent via transient (`mollie_grant_<subscriptionId>`)
- [ ] Aucun accès Pro sur redirection navigateur seule
- [ ] `php -l` OK sur tous les fichiers PHP modifiés
- [ ] `npm run build` exit 0, bundle ≤ 210 Ko
- [ ] `tests/unit/b2b-payment-flow.test.cjs` → 31/31
