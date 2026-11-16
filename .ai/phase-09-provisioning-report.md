# Rapport de provisionnement Phase 0.9 — Variables à injecter par environnement et domaine

> **Règle absolue** : ce fichier ne contient **aucune valeur secrète**. Il liste uniquement les noms de variables, leurs emplacements, et les tests de validation attendus. Les valeurs réelles sont provisionnées par le fondateur, jamais committées, jamais affichées.

## 1. Variables à provisionner

| # | Variable | Emplacement | Injecté par | Environnement | Pourquoi | Test de validation (sans valeur) |
|---|----------|-------------|-------------|---------------|----------|----------------------------------|
| 1 | `MOLLIE_API_KEY` | `public/api/mollie-config.php` (clé `api_key`) ou variable d'env `MOLLIE_API_KEY` | Fondateur | Local + FTP prod (chaque domaine) | Créer paiements/abonnements B2B (79€/mois, 690€/an) en mode test Mollie | `mollie.php?action=create_subscription` → HTTP 2xx + `checkoutUrl` présent |
| 2 | `MOLLIE_WEBHOOK_SECRET` | `public/api/mollie-config.php` (clé `webhook_secret`) ou variable d'env `MOLLIE_WEBHOOK_SECRET` | Fondateur | Local + FTP prod (chaque domaine) | Signature HMAC des webhooks — fail-closed | POST signé sur `/api/mollie-webhook.php` → 200 ; POST sans secret → 503 ; POST signature invalide → 403 |
| 3 | `SUPABASE_SERVICE_KEY` | `public/api/mollie-config.php` (clé `supabase_service_key`) ou variable d'env `SUPABASE_SERVICE_KEY` | Fondateur | Local + FTP prod (chaque domaine) | Persistance des grants Pro + `verify_subscription` cross-device (service_role, RLS bypass) | `verify_subscription?email=<test>&kind=b2b_pro` → `{active: true|false}` (jamais `lookup_failed`) |
| 4 | `MOLLIE_PROFILE_ID` | `public/api/mollie-config.php` (clé `profile_id`) | Fondateur | FTP prod | Profil de paiement Mollie associé au domaine | `mollie.php` crée un checkout rattaché au bon profile |
| 5 | `RESEND_KEY` | `public/api/mollie-config.php` (clé `resend_key`) ou variable d'env | Fondateur | Local + FTP prod | Emails de confirmation essai B2B (best-effort) | Envoi email test → accepté par l'API Resend |

**`mollie-config.php` est gitignoré** (`.gitignore` ligne 43 : `**/mollie-config.php`). Seule `mollie-config.example.php` est committée (template sans valeurs).

## 2. Webhooks Mollie à déclarer par domaine

| # | Domaine | URL webhook à déclarer dans le dashboard Mollie | Environnement Mollie | Statut |
|---|---------|------------------------------------------------|----------------------|--------|
| 1 | Martinique | `https://sargasses-martinique.com/api/mollie-webhook.php` | test → live | À déclarer |
| 2 | Guadeloupe | `https://sargasses-guadeloupe.com/api/mollie-webhook.php` | test → live | À déclarer |
| 3 | Florida / Miami | `https://sargassummiami.com/api/mollie-webhook.php` | test → live | À déclarer |
| 4 | Punta Cana | `https://sargassumpuntacana.com/api/mollie-webhook.php` | test → live | À déclarer |
| 5 | Riviera Maya / Cancún | `https://sargassumcancun.com/api/mollie-webhook.php` | test → live | À déclarer |
| 6 | Tulum | (URL à confirmer) | test → live | À déclarer |

**Événements à activer sur chaque webhook** : `payments`, `subscriptions` (created, updated, paid, canceled, expired).

## 3. CORS whitelist (déjà en place — ne pas modifier sans sync)

Déjà présente et identique dans `public/api/mollie.php` et `public/api/b2b-create-checkout.php` :
- `https://sargasses-martinique.com`
- `https://sargasses-guadeloupe.com`
- `https://sargassumpuntacana.com`
- `https://sargassummiami.com`
- `https://sargassumcancun.com`

## 4. Supabase (à préparer par le fondateur)

| Élément | Détail |
|---------|--------|
| Table cible | `payment_grants` (DDL idempotent : `scripts/supabase-schema-target.sql`) |
| Clé | `supabase_service_key` (service_role, RLS bypass) |
| RLS | `anon` bloqué sur `payment_grants` ; `service_role` uniquement |
| Colonnes attendues | `id`, `email`, `kind`, `plan`, `provider_subscription_id`, `grant_token`, `expires_at`, `created_at`, `revoked_at` |

## 5. Rollback (tout ajout conversion/UI)

- Flag `?flag=0` documenté pour tout ajout UI/conversion
- `git revert <bad-commit> --no-edit` + `git push origin main` → re-deploy auto < 15 min

## 6. Critère de succès provisioning

Tous les points ci-dessus injectés + script `scripts/verify-mollie-config.php` → toutes les lignes `OK` sur chaque domaine + webhook test signé → 200 + grant créé dans Supabase.

---

*Ce fichier ne contient aucune valeur secrète. À conserver dans `.ai/` (non committé si nécessaire selon la politique du repo).*