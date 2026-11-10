# `workers/sg-payments` — provenance et contrat

Ce dossier contient la **source canonique** de la Worker Cloudflare `sg-payments`.
Elle a été **récupérée depuis la source live** (pas réécrite de mémoire, pas
reconstituée) puis durcie par la mission P0.118 §5/§6/§7.

> ⚠️ **Source courante = source live du 2026-11-09 (§8).** Le 2026-11-09, le
> fichier du dépôt était en RETARD sur la production : la version live avait
> reçu les corrections de l'offre B2C (prix à jour, suppression de la surcharge
> USD saisonnière, refus 410 du pass « SOS » retiré) et 7 helpers absents du
> dépôt. Le dépôt a été **resynchronisé sur le live** (SHA-256 identique,
> §8), puis les garde-fous de la mission P0 ont été ré-appliqués par-dessus
> (§8.2). Vérification : **aucune fonction du durcissement P0.118 §5/§6/§7
> n'a été perdue** lors de la resynchronisation (voir §8.3).

## Provenance de la source

| Élément | Valeur |
|---|---|
| Script | `sg-payments` |
| Version live récupérée (source COURANTE) | **live au 2026-11-09** (§8) |
| SHA-256 de la source live courante | `C478F18890E0BDF6A8F9FCF2C85741379BCDE1E36AF07560ADE65104AB8CFA1A` |
| Taille de la source live courante | **137 457 octets** |
| Version live récupérée (import initial) | **381** |
| Version ID (import initial) | `36fa827a-a39c-4156-9359-30fc383eb6c5` |
| Compte | `abf2b92cf718313567b4b38eb9dda17f` |
| Récupéré le | 2026-11-04T15:20:58Z (import initial) · 2026-11-09 (resync) |
| Méthode | `GET /accounts/{account_id}/workers/scripts/sg-payments/content/v2` (multipart/form-data) |
| Trafic | 100 % |
| Taille de la source live (import initial) | **85 851 octets** |
| SHA-256 de la source live (import initial) | `74c1a56a1e669ab00519b02b280f46362eaaaf1b3bc4c0ec2492a9458c3d2791` |
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
- `grantOnboardingAuto` : l'accès lecture seule au schéma live a révélé un contrat incompatible. Le CHECK `b2b_subscriptions.plan` accepte `free`, `alert`, `dashboard`, `enterprise`, alors que les clés Worker sont `pro_monthly`, `brief_monthly` et variantes USD. **Aucun mapping/prix n'est choisi** : l'onboarding renvoie 409 et n'écrit aucune ligne/n'envoie aucun email tant que le contrat commercial et le schéma ne sont pas approuvés. Les anciens noms de colonnes `company_email` et `domain` ont été retirés.
- Révocation B2B/B2C : expiration du grant via `expires_at` (colonne réelle).
  La version live faisait `PATCH { status: "revoked" }` alors que
  `public.payment_grants` **n'a pas de colonne `status`** → la révocation
  n'arrivait jamais.
- `userEntitlements` et `verify_subscription` : le `user_id` est lu dans
  `metadata` (jsonb) et non dans une colonne inexistante.

### Journalisation et limites restantes

- Les logs génériques d'envoi et le drip B2B n'exposent plus les adresses email.
- Le drip B2B revendique désormais chaque prospect atomiquement (`status=new` → `processing`), vérifie la réponse fournisseur et écrit `contacted_at` uniquement après acceptation. Les claims expirés et les livraisons non confirmées passent en `manual_review`; aucun email n'est relancé automatiquement après un résultat ambigu.
- Le contenu du drip renvoie vers l'observation AFAI disponible et son horodatage, sans promettre une cadence satellite fixe.
- Livraison ambiguë : le Worker distingue désormais un rejet explicite (identifiants absents ou réponse HTTP 4xx) d'un résultat de livraison inconnu (timeout, erreur réseau, HTTP 408/5xx ou réponse de succès non confirmée). Un rejet explicite peut passer au provider suivant. Un résultat inconnu arrête immédiatement le fallback : le B2B passe en manual_review et le marqueur B2C durable empêche un rejeu de la même observation. Il n'existe toujours pas de clé d'idempotence commune aux fournisseurs ; la mitigation est donc fail-closed et ne tente jamais un second provider après une acceptation potentielle.

### §8 — Resynchronisation sur la source live (2026-11-09)

**Constat.** Le fichier du dépôt était en retard sur la production : le worker
live avait été mis à jour (offre B2C, retrait du SOS, helpers d'authentification
Google/Apple Pay, `normalizePlanKey`, `fulfillPaidPayment`, `handleMollieReturn`,
`handleMolliePayPage`, `handleLegacyCheckout`, `B2C_SUB_PLANS`, `PLAN_ALIASES`,
`ALLOWED_HOSTS` à 6 domaines) sans que le dépôt soit resynchronisé. Un
déploiement de la version du dépôt aurait donc **régressé** la production.

**Décision.** Resynchronisation à l'identique de la source live
(`content/v2`, SHA-256 `C478F188…CFA1A`, 137 457 o), puis ré-application des
garde-fous par-dessus. Aucune réécriture de mémoire : le code live est la
**source de vérité serveur**.

#### §8.1 — Offre B2C (identique au live, sans surcharge saisonnière)

| pass | EUR | USD |
|---|---|---|
| `trip7` | 7,99 € | $8.99 |
| `p30` | 14,99 € | $16.99 |
| `season` | 24,99 € | $27.99 |
| `monthly` (abo B2C legacy) | 4,99 € | $4.99 |
| `annual` (abo B2C legacy) | 49 € | $49 |

La surcharge USD de haute saison (+15 %, juin→novembre) **n'existe plus** :
le serveur live facture le montant affiché. C'est ce qui explique que le
bundle live EUR affichait déjà 7,99 € pour `trip7` alors que le dépôt
annonçait 4,99 €.

#### §8.2 — Garde-fous ré-appliqués par-dessus la source live

- `FULFILL_PRICES` : grille de **LIVRAISON** distincte de la grille de
  **CRÉATION** (`PASS_PRICES`). `sos` (1,00 €) y figure pour livrer un
  paiement **déjà encaissé** — encaisser sans livrer serait un trou de
  confiance. La CRÉATION de `sos` reste refusée en **410**
  `offre_indisponible` (contrat live).
- `HISTORICAL_PASS_PRICES` + `OFFER_CUTOFF_DATE` (`2026-11-09T00:00:00Z`) :
  les montants de l'ancienne offre (trip7 4,99 € / $5.99, p30 11,99 $,
  season 19,99 €) sont acceptés **uniquement** pour un paiement créé avant
  la coupure (date de création vérifiable). Un paiement **nouveau** à l'ancien
  tarif reste refusé.
- `create_payment` **fail-closed** : un `pass` inconnu ne passe dans aucune
  branche → aucun contrôle de prix n'était appliqué (montant libre encaissable
  sans délivrance). Refus explicite « Prix invalide ».
- `create_payment` : un refus de **prix** renvoie **400** (erreur client),
  pas 500 (panne serveur).
- `payment_status` : format d'identifiant Mollie contrôlé (`tr_…`), contrôle
  du **propriétaire** (403 `payment_owner_mismatch` si l'email fourni n'est pas
  celui du paiement) et `passEnd` (fin d'accès servie au client).
- `PASS_DURATIONS` : `sos: 1` ajouté (cohérent avec la livraison).

#### §8.3 — Contrôle de non-régression du durcissement P0.118

Comparaison automatique HEAD(#1383) ↔ LIVE ↔ fichier courant :

- **0 fonction** du durcissement P0.118 §5/§6/§7 absente du live
  (`normalizeMollieSignature`, `parseMollieWebhook`, `validateMollieAmount`,
  `validateB2BAmount`, `validatePaymentForFulfillment`, `grantB2C`, `grantB2B`,
  `grantOnboardingAuto`, `userEntitlements`, `verifySubscription`…).
- Tous les marqueurs de durcissement présents dans les trois versions :
  signature **fail-closed** (503 secret absent / 403 signature invalide),
  adapter Next-gen (`entityId` / `eventId`), idempotence RPC
  `sg_upsert_payment_grant` (`ON CONFLICT`), marqueur KV posé **après**
  l'écriture, révocation sur `payment.refunded` / état terminal négatif.
- Seule variable ajoutée par #1383 et absente du live : `FULFILL_PRICES`
  → ré-appliquée en §8.2.

**Conclusion : aucune régression du durcissement. Le dépôt est désormais en
avance de version par rapport au live, et aligné sur l'offre validée.**

## Fichiers annexes
- `scripts/migrations/002_payment_grant_search_path.sql` — durcissement
  `SET search_path = ''` de la fonction RPC (**préparé, non appliqué**).
- `scripts/migrations/003_b2b_leads_least_privilege.sql` — moindre privilège
  sur `public.b2b_leads`, suppression de la policy `PUBLIC ALL` constatée et
  révocation des privilèges PUBLIC/anon/authenticated (**préparé, non appliqué**).
- `scripts/migrations/004_b2b_lead_drip_claims.sql` — colonnes de claim,
  tentatives et erreur non-PII pour le drip B2B (**préparé, non appliqué**).

## Rappel de déploiement

Ce code **n'est pas déployé** (aucun workflow CI ne mentionne `sg-payments` :
le déploiement de ce worker reste une action manuelle et approuvée). Depuis le
2026-11-09, le fichier du dépôt est **en avance** sur le live (live + garde-fous
§8.2) : le merger sur `main` **ne change rien en production** tant que le
worker n'est pas redéployé, et un redéploiement de la version du dépôt serait
**plus sûr** que le live (mêmes prix, refus fail-closed, contrôle propriétaire).

Toute mise en production suppose :

1. application préalable de `002_payment_grant_search_path.sql` (la fonction
   RPC doit exister avec la signature exacte) ;
2. application préalable de `003_b2b_leads_least_privilege.sql` et
   `004_b2b_lead_drip_claims.sql` sur une fenêtre autorisée ;
3. ajout du secret `NAMECHEAP_MAIL_TOKEN` si le relais Namecheap doit rester
   actif ;
4. vérification que la clé Mollie utilisée est une clé **live** : un
   paiement en `mode=test` ne crée **plus** de droit (le test est explicite
   et l'ancien code honorait les paiements de test) ;
5. relecture du diff `live ↔ dépôt` (la source live du 2026-11-09 est
   l'archive de référence : SHA-256 `C478F188…CFA1A`).
