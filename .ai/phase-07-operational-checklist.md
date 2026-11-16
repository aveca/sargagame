# Checklist opérationnelle Phase 0.7/0.9 — Encaissements hôteliers (Mollie + Supabase)

> Statut : **PRÉPARÉ — en attente action fondateur (secrets)**. Aucun secret n'est committer. Aucun déploiement en production. Aucun email envoyé. Aucun merge sans approbation.
>
> Branche : `fix/phase-0.7-mollie-supabase` @ `b59a84d53` — PR #1473 ouverte (non mergeée).

---

## 1. Secrets à provisionner (fondateur uniquement)

| # | Secret | Variable / emplacement | Où le récupérer | Environnement | Pourquoi nécessaire | Test de validation |
|---|--------|------------------------|-----------------|---------------|---------------------|-------------------|
| 1 | Mollie API key (test) | `api_key` dans `public/api/mollie-config.php` ou `MOLLIE_API_KEY` env | Mollie dashboard → Developers → API keys (préfixe `test_`) | Local + FTP prod | Créer paiements/abonnements B2B (79€/mois, 690€/an) sans argent réel | `mollie.php?action=create_subscription` → 2xx + `checkoutUrl` |
| 2 | Mollie webhook secret | `webhook_secret` dans `public/api/mollie-config.php` ou `MOLLIE_WEBHOOK_SECRET` env | Mollie dashboard → Webhooks → Secret (préfixe `whsec_`) | Local + FTP prod | Signature HMAC des webhooks (fail-closed) | POST `/api/mollie-webhook.php` → 503 si absent ; 403 si sig invalide ; 200 si valide |
| 3 | Supabase service_role key | `supabase_service_key` dans `mollie-config.php` ou `SUPABASE_SERVICE_KEY` env | Supabase dashboard → Settings → API → service_role key | Local + FTP prod | Persistance des grants Pro + verify_subscription cross-device | `verify_subscription?email=…&kind=b2b_pro` → `{active:true,…}` |
| 4 | Resend key | `resend_key` dans `mollie-config.php` | Resend dashboard → API Keys | Local + FTP prod | Emails confirmation essai B2B (best-effort) | Envoi email test → livré |
| 5 | Stripe LIVE key | legacy, hors périmètre P0 | Stripe dashboard | N/A | Lecture seule abonnements Stripe existants | N/A (hors périmètre P0) |

**Règle** : `public/api/mollie-config.php` est gitignoré (`**/mollie-config.php` dans `.gitignore`). Les valeurs réelles doivent être injectées par le fondateur sur chaque serveur (FTP) ou via les secrets de déploiement. Jamais de commit.

**Clé Mollie test exposée** : `<valeur retiree - cle compromise - empreinte sha256:33856ab241c9>` présente dans `mollie-config.php` (gitignoré, local uniquement). Fondateur doit révoquer/remplacer cette clé dans le dashboard Mollie avant toute utilisation en production.

---

## 2. Checklist par environnement

### Local (développement)
- [ ] `public/api/mollie-config.php` présent avec `api_key` (test), `webhook_secret`, `supabase_url`, `supabase_service_key` (vide acceptable en local)
- [ ] `SUPABASE_SERVICE_KEY` non requis en local (best-effort, skip silencieux)
- [ ] `php -l` OK sur `mollie-lib.php`, `mollie-webhook.php`, `mollie.php`, `b2b-create-checkout.php`
- [ ] `node tests/unit/b2b-payment-flow.test.cjs` → 31/31
- [ ] `npm run build` → exit 0
- [ ] `check-bundle-budget.cjs` → ≤ 210 Ko
- [ ] Webhook fail-closed : POST sans secret → 503 ; POST avec signature invalide → 403

### FTP prod (Martinique sargasses-martinique.com, puis GP, FL, PC, RM, Tulum)
- [ ] `mollie-config.php` déployé sur chaque domaine avec `api_key` (live ou test selon env), `webhook_secret`, `supabase_service_key`
- [ ] `webhook_secret` configuré dans le dashboard Mollie pour chaque webhook URL (`https://<domaine>/api/mollie-webhook.php`)
- [ ] `SUPABASE_SERVICE_KEY` injecté (env ou fichier config) sur chaque serveur
- [ ] Supabase table `payment_grants` créée (DDL idempotent : `scripts/supabase-schema-target.sql`)
- [ ] RLS : `anon` bloqué, `service_role` uniquement sur `payment_grants`
- [ ] Webhook test : POST signé depuis Mollie dashboard → 200 + grant créé
- [ ] Aucun paiement réel en mode test (Mollie test mode uniquement)

### Rollback (tout ajout conversion/UI)
- [ ] Flag `?flag=0` documenté pour tout ajout UI/conversion
- [ ] `git revert <bad-commit> --no-edit` + `git push origin main` → re-deploy auto < 15 min

---

## 3. Checklist par domaine (6 domaines)

| Domaine | URL webhook Mollie | Environnement Mollie | Statut |
|---------|-------------------|---------------------|--------|
| Martinique | `https://sargasses-martinique.com/api/mollie-webhook.php` | test → live | À provisionner |
| Guadeloupe | `https://sargasses-guadeloupe.com/api/mollie-webhook.php` | test → live | À provisionner |
| Florida | `https://sargassummiami.com/api/mollie-webhook.php` | test → live | À provisionner |
| Punta Cana | `https://sargassumpuntacana.com/api/mollie-webhook.php` | test → live | À provisionner |
| Riviera Maya | `https://sargassumcancun.com/api/mollie-webhook.php` | test → live | À provisionner |
| Tulum | (à confirmer) | test → live | À provisionner |

**CORS whitelist** (déjà en place dans `mollie.php`, `b2b-create-checkout.php`) :
```
https://sargasses-martinique.com
https://sargasses-guadeloupe.com
https://sargassumpuntacana.com
https://sargassummiami.com
https://sargassumcancun.com
```

---

## 4. Vérification post-provisioning (fondateur)

Après injection des secrets, exécuter :

1. `php -l public/api/mollie-lib.php public/api/mollie-webhook.php public/api/mollie.php public/api/b2b-create-checkout.php`
2. `node tests/unit/b2b-payment-flow.test.cjs` → 31/31
3. `npm run build` → exit 0
4. `node scripts/check-bundle-budget.cjs` → OK
5. Test webhook : POST signé sur `/api/mollie-webhook.php` → 200, grant créé dans Supabase
6. `verify_subscription?email=<hotel@test.com>&kind=b2b_pro` → `{active:true, kind:"b2b_pro", plan:"pro_monthly", ...}`
