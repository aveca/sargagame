# `workers/sg-payments` — provenance et contrat

Ce dossier contient la **source canonique** de la Worker Cloudflare `sg-payments`.
Elle a été **récupérée depuis la source live** (pas réécrite de mémoire, pas
reconstituée) puis durcie par la mission P0.118 §5/§6/§7.

## Provenance de la source

| Élément | Valeur |
|---|---|
| Script | `sg-payments` |
| Version live récupérée | **381** |
| Version ID | `36fa827a-a39c-4156-9359-30fc383eb6c5` |
| Compte | `abf2b92cf718313567b4b38eb9dda17f` |
| Récupéré le | 2026-11-04T15:20:58Z |
| Méthode | `GET /accounts/{account_id}/workers/scripts/sg-payments` (multipart/form-data) |
| Trafic | 100 % |
| Taille de la source live | **85 851 octets** |
| SHA-256 de la source live | `74c1a56a1e669ab00519b02b280f46362eaaaf1b3bc4c0ec2492a9458c3d2791` |
| Routes live conservées | **102** (inchangées) |
| Runtime | `compatibility_date 2026-08-19`, handlers `fetch` + `scheduled` |

### Bindings live (inchangés — aucun binding ajouté, supprimé ou modifié)

| Nom | Type |
|---|---|
| `MOLLIE_API_KEY` | secret_text |
| `MOLLIE_PROFILE_ID` | secret_text |
| `MOLLIE_WEBHOOK_SECRET` | secret_text |
| `RESEND_API_KEY` | secret_text |
| `SUPABASE_SERVICE_KEY` | secret_text |
| `SUPABASE_URL` | plain_text |
| `TRANSIENTS` | kv_namespace (`528c05c792e046029a84e2fdb84f4ae6`) |

> **`NAMECHEAP_MAIL_TOKEN` n'existe PAS parmi les bindings live.** C'est
> exactement pourquoi la version live portait un bearer figé en dur
> (`NAMECHEAP_BEARER = "[REDACTED]"`). Le correctif §5 supprime ce
> bearer : tant que le secret `NAMECHEAP_MAIL_TOKEN` n'est pas ajouté aux
> bindings (action **hors périmètre d'approbation**, cf. §12), le relais
> Namecheap est **ignoré** et la chaîne de secours
> `sendpulse → brevo → resend` prend le relais. Aucun secret n'est deviné,
> aucun n'est inventé, aucun secret n'est réintroduit en dur.

## Différences avec la source live

Toutes les modifications sont listées ci-dessous. **Aucune route, aucun
binding, aucun secret, aucun prix, aucun plan, aucun montant, aucune donnée
scientifique et aucune logique de création de paiement n'ont été modifiés.**

### §5 — Namecheap fail-safe

- Suppression de `var NAMECHEAP_BEARER = "[REDACTED]"`.
- `sendViaNamecheap` exige désormais `env.NAMECHEAP_MAIL_TOKEN` ; en son
  absence elle lève une erreur, ce qui fait passer le runner d'e-mails au
  provider suivant. **Plus aucun credential en dur dans le dépôt.**

### §6 — Adapters de webhook Mollie

- `normalizeMollieSignature` : retire le préfixe `sha256=` (format officiel
  Next-gen) et normalise la casse ; refuse tout ce qui n'est pas 64 hex.
  La version live comparait la signature **brute** → **403 sur tout webhook
  officiel Next-gen**.
- `parseMollieWebhook` : distingue **Classique**
  (`application/x-www-form-urlencoded`, `id` + `event`) et **Next-gen**
  (JSON, `resource` / `id` / `type` / `entityId`). La version live faisait
  `JSON.parse()` sur un corps Classique → exception → **500, paiement jamais
  honoré**.
- **Identifiant d'événement ≠ identifiant d'entité** : la récupération
  porte sur `entityId` (`tr_…` / `sub_…`), l'idempotence sur l'identifiant
  d'événement (`event_…`).
- `validateMollieAmount`, `validateB2BAmount`, `validatePaymentForFulfillment` :
  contrôle du **mode**, du **statut autoritaire** (`paid`/`settled` + `paidAt`),
  du **montant**, de la **devise**, des **métadonnées** et du **SKU**.
- Le statut présent dans le corps du webhook n'est **jamais** lu : l'état
  provient toujours de l'API Mollie.
- Un **événement inconnu** ne crée aucun grant et **n'est pas marqué comme
  traité** (la version live posait un marqueur KV pour tout type inconnu).
- `payment.refunded` : l'accès est retiré (grant expiré + clef KV supprimée).

### §7 — Fulfillment durable

- `grantB2C` appelle la fonction SQL `public.sg_upsert_payment_grant` avec
  ses **7 arguments exacts**, **relit** la ligne créée, **compare**
  `type`/`pass`/`email`/`currency`, et **seulement ensuite** pose le marqueur
  KV. La version live posait le marqueur KV **avant** l'écriture et
  écrivait des colonnes **inexistantes** (`session_id`, `user_id`).
- `grantB2B` écrit les **colonnes réelles** de `public.payment_grants`
  (`subscription_id`, `type`, `plan`, `customer_id`, `expires_at`,
  `granted_at`, `metadata`), **vérifie** l'écriture, puis pose le jeton KV
  d'accès (la version live faisait l'inverse).
- `grantOnboardingAuto` : écriture `b2b_subscriptions` **vérifiée** et
  **idempotente** (un abonnement actif existant est réutilisé), le résultat
  de l'envoi d'e-mail est **explicitement** reported (`email: sent|failed`).
- Révocation B2B/B2C : expiration du grant via `expires_at` (colonne réelle).
  La version live faisait `PATCH { status: "revoked" }` alors que
  `public.payment_grants` **n'a pas de colonne `status`** → la révocation
  n'arrivait jamais.
- `userEntitlements` et `verify_subscription` : le `user_id` est lu dans
  `metadata` (jsonb) et non dans une colonne inexistante.

## Fichiers annexes

- `scripts/migrations/002_payment_grant_search_path.sql` — durcissement
  `SET search_path = ''` de la fonction RPC (**préparé, non appliqué**).
- `scripts/migrations/003_b2b_leads_least_privilege.sql` — moindre privilège
  sur `public.b2b_leads` (**préparé, non appliqué**).

## Rappel de déploiement

Ce code **n'est pas déployé**. Toute mise en production suppose :

1. application préalable de `002_payment_grant_search_path.sql` (la fonction
   RPC doit exister avec la signature exacte) ;
2. ajout du secret `NAMECHEAP_MAIL_TOKEN` si le relais Namecheap doit rester
   actif ;
3. vérification que la clé Mollie utilisée est une clé **live** : un
   paiement en `mode=test` ne crée **plus** de droit (le test est explicite
   et l'ancien code honorait les paiements de test).
