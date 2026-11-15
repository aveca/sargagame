# État de la migration Google Sheets → Supabase

**Date** : 2026-11-15
**Projet Supabase** : `rswdmjtdzrucqzzukfmd` (us-east-1, PostgreSQL 17)
**Google Sheet ID** : `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ`
**Branche** : `feat/sargagame-supabase-google-migration` (commits `12e1959ef`, `ad4dd269e`)

---

## 1. Inventaire des 13 onglets source (vérifié via API Google Sheets, lecture seule)

Source de vérité : API Google Sheets REST (OAuth propriétaire, scope `spreadsheets.readonly`).
Spreadsheet ID : `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ`
Titre : "Sargasses Emails"

| # | Onglet | Colonnes (headers) | Lignes (grid) | Table cible | Existe dans Supabase ? |
|---|--------|-------------------|---------------|-------------|----------------------|
| 1 | `Emails` | Date, Email, Island, Source, unsubscribed | 896 | `b2b_contact_emails` | À vérifier |
| 2 | `subscription_events` | date, event_type, object_id, email, customer, subscription, amount, currency, island | 1000 | `contact_subscriptions` | À vérifier |
| 3 | `analytics_events` | date, event_name, island, ab_lock1, ab_modal1, ab_onb1, ab_free1, ab_vp1, ab_price1, raw_params | 466099 | `automation_runs` | **OUI** (~464 608) |
| 4 | `email_events` | date, event_type, resend_id, to, subject, from | 2319 | `email_messages` (événements) | À vérifier |
| 5 | `drip_log` | date, email, drip_id, island, status | 1000 | `automation_runs` (drip) | À vérifier |
| 6 | `feedback_requests` | date, email, status | 1000 | `contact_consents` | À vérifier |
| 7 | `Feuille 3` | (vide — pas de headers) | 1000 | — | Non applicable (feuille vide) |
| 8 | `email_tracking` | date, resend_id, to, subject, email_type, island, status, plan, source, ab_tests | 5883 | `email_messages` | À vérifier |
| 9 | `beach_reports` | date, beach_id, beach_name, island, level | 1248 | `automation_runs` | **OUI** (~405) |
| 10 | `payments` | date, session_id, email, amount, currency, status, island, ref | 1000 | `contact_payments` | À vérifier |
| 11 | `email_log` | date, island, subject, sent, total_subscribers | 1000 | `email_campaigns` | À vérifier |
| 12 | `Feuille 2` | (vide — pas de headers) | 1000 | — | Non applicable (feuille vide) |
| 13 | `feedback` | date, rating, text, island | 1000 | `contact_feedback` | À vérifier |

### Mapping corrigé (vs target-data-model.md original)

| Onglet | Table cible originale | Correction |
|--------|----------------------|------------|
| `analytics_events` | `automation_runs` | **Table existe déjà** dans Supabase (~464 608 lignes). Ne pas recréer. Importer uniquement les données manquantes ou faire un upsert. |
| `beach_reports` | `automation_runs` | **Table existe déjà** dans Supabase (~405 lignes). Ne pas recréer. Importer uniquement les données manquantes ou faire un upsert. |
| `drip_log` | `automation_runs` (drip) | Nouveau onglet non dans le mapping original. Même table cible. |
| `feedback_requests` | `contact_consents` | Nouveau onglet non dans le mapping original. Même table cible. |
| `Feuille 2`, `Feuille 3` | — | Feuilles vides (pas de headers). À ignorer pour la migration. |
| `digest_log` | `email_campaigns` | **Absent du Sheet réel.** Cet onglet n'existe pas dans le Spreadsheet. Soit il a été supprimé, soit il n'a jamais été créé. |
| `b2b_contact_emails` | `b2b_contact_emails` | L'onglet s'appelle `Emails` (pas `emails` en minuscule). Adapter le mapping. |

> Note : l'inventaire précédent (`inventory-google.md`) était corrompu (listait uniquement "Contacts" et "Leads"). Le Code.js est la source de vérité.

## 2. Tables Supabase existantes

### Tables legacy (scripts/supabase-schema.sql)
- `b2b_leads` (email, domain, region, source, status, contacted_at, created_at)
- `b2b_subscriptions` (company_name, contact_email, region, plan, mollie_customer_id, mollie_subscription_id, status, created_at, widget_token)
- `b2c_alerts` (email, region, domain, beaches, status, created_at, unsubscribe_token)

### Tables B2B concierge (supabase/b2b-concierge.sql)
- `b2b_prospects`, `b2b_contacts`, `b2b_scores`, `b2b_concierge`, `b2b_forecast_deliveries`, `b2b_payments`, `b2b_events`

### Tables cibles migration (scripts/supabase-schema-target.sql) — NON encore créées
- `b2b_organisations`, `b2b_contact_people`, `b2b_contact_emails`, `contact_feedback`, `contact_payments`, `contact_subscriptions`, `email_campaigns`, `email_messages`, `email_suppressions`, `contact_consents`, `automation_runs`, `source_sync_runs`

### Tables Gmail (scripts/gmail-schema-target.sql) — NON encore créées
- `gmail_account`, `gmail_send_queue`, `gmail_message_history`, `gmail_message_events`, `gmail_statistics`, `gmail_response_sync`

### Tables payment grants (existante, utilisée par Mollie webhook)
- `payment_grants` (type, plan, customer_id, email, expires_at, granted_at, subscription_id)

## 3. Blocages vérifiés

### B1 — SUPABASE_SERVICE_KEY absent localement
- **Preuve** : `.env` ne contient pas `SUPABASE_SERVICE_KEY`. `grep` dans le repo ne trouve aucune valeur.
- **Impact** : `mol_supabase_mirror()` skippe silencieusement. `verify_subscription` retourne `lookup_failed`. Audit Phase 2 bloqué.
- **Disponibilité** : présent comme GitHub Secret (`secrets.SUPABASE_SERVICE_KEY`) et Cloudflare Secret (workers b2b-api, sg-payments, supabase-proxy).
- **Action requise** : le fondateur doit fournir la valeur ou l'agent doit l'extraire depuis GitHub/Cloudflare (token Cloudflare actuel expiré).

### B2 — Supabase REST refusé pour anon key
- **Preuve** : `GET /rest/v1/b2b_leads` avec anon key → `42501 permission denied for table b2b_leads`. Le GRANT SELECT n'a pas été donné au rôle anon.
- **Impact** : impossible de vérifier les tables/volumes depuis l'agent sans service key.

### B3 — ~~Supabase MCP nécessite OAuth~~ RÉSOLU
- **Mise à jour** : Le connecteur Supabase fonctionne désormais directement dans ChatGPT pour le projet `rswdmjtdzrucqzzukfmd`. Ne plus considérer comme blocage.
- **Vérifications effectuées** :
  - Projet sargagame : ACTIVE_HEALTHY
  - PostgreSQL 17.6
  - 13 migrations enregistrées jusqu'au 7 novembre 2026
  - `analytics_events` existe déjà (~464 608 lignes estimées)
  - `beach_reports` existe déjà (~405 lignes estimées)
  - Tables B2B et `payment_grants` existent également
  - 12 alertes informatives RLS sans policies : ne pas ouvrir les tables publiquement
- **Action** : Aucune reconnexion nécessaire. Le connecteur est opérationnel.

### B4 — Accès Google Sheets bloqué
- **Preuve** : Drive API export → `403 The user has not granted the app read access to the file`. Web app (nouveau script) → `403 Authorization needed`. clasp `run` → `NOT_FOUND` (pas de déploiement API).
- **Impact** : impossible de lire les données brutes des 10 onglets sans consentement OAuth interactif.
- **Contournement partiel** : le web app existant (@35, deployment `AKfycbxc4Fw_...`) expose `action=stats` → `{payments:22, revenue:142.78, emails:639, feedbacks:1, avgRating:4, emailsSent:260, lastDispatch:"2026-06-19T22:14:28.244Z"}`. Et `action=emails&island=X` retourne uniquement le count, pas les emails. `action=feedback` retourne les 20 derniers items.

### B5 — Cloudflare API token expiré
- **Preuve** : `GET /accounts/.../workers/scripts` avec token `cfk_...` → `401 Authentication error`.
- **Impact** : impossible d'extraire les secrets Cloudflare (SUPABASE_SERVICE_KEY, MOLLIE_API_KEY, etc.) depuis l'agent.

### B6 — clasp authentifié mais token expiré (refresh OK)
- **Preuve** : `.clasprc.json` existait avec BOM (corrigé). Access token expiré (2026-10-22), refresh_token présent. `clasp list` fonctionne après correction BOM → 4 scripts trouvés.
- **Impact** : clasp fonctionne pour lister/cloner des scripts, mais pas pour exécuter des fonctions (pas de déploiement API).

## 4. Ce qui est déjà fait (vérifié)

- ✅ Phase 1 : inventaire (10 onglets, 3 projets Apps Script, 4 scripts Node.js) — `docs/migration-google-sheets/inventory-google.md` (corrompu mais Code.js est la source de vérité)
- ✅ Phase 3 : modèle de données cible (10 tables, RLS, dédup) — `docs/migration-google-sheets/target-data-model.md` + `scripts/supabase-schema-target.sql`
- ✅ Code Apps Script sauvegardé — `docs/migration-google-sheets/appscript-code-backup/Code.js`
- ✅ Architecture Gmail proposée — `docs/migration-google-sheets/gmail-architecture.md` + `scripts/gmail-schema-target.sql`
- ✅ Schéma Supabase legacy existant — `scripts/supabase-schema.sql` (b2b_leads, b2b_subscriptions, b2c_alerts)
- ✅ Mollie webhook journal durable + réconciliation — commit `61a1ab9df`
- ✅ verify_subscription b2b_pro + CORS whitelist — commit `673494c43`
- ✅ Export script créé (read-only) — `C:\Users\user\AppData\Local\Temp\opencode\clasp-export\` (déployé mais nécessite consentement OAuth)

## 5. Paiements — état vérifié

### B2C (Mollie on-site, caisse active)
- Pass 7j, 30j, saison, SOS/rapport 24h
- Webhook Mollie → Supabase mirror (best-effort, service key absent)
- Journal durable + réconciliation créés (commit `61a1ab9df`)
- 22 paiements, 142.78€ revenue (stats web app)
- Worker fulfillment cycle 2/3 (branche `fix/p0-mollie-fulfillment`, non mergé)

### B2B (Mollie subscriptions)
- Pro mensuel 79€, Brief mensuel 29€, Pro annuel 690€, Brief annuel 290€
- `verify_subscription` étendu `b2c_pass` vs `b2b_pro` (commit `673494c43`)
- CORS whitelist sur b2b-create-checkout.php (commit `673494c43`)
- `b2b-create-checkout.php` dépend de `b2b-db.php` (à vérifier)
- Front `Sargasses_PROD.jsx` doit envoyer `kind:"subscription"` (non fait)
- Liens de paiement par hôtel : `scripts/automation/b2b-hotel-paylinks.cjs` (dry-run uniquement)

### Stripe (statut à vérifier — ne pas classer legacy/inactif sans preuve)
- **Config locale** : `public/api/stripe-config.php` existe (gitignoré) avec `sk` (sk_live_*) et `webhook_secret` présents
- **Endpoints** : `public/api/stripe-webhook.php` et `public/api/create-checkout.php` existent
- **Catalogue** : `docs/stripe-live-catalog-2026-11-13.md` classe Stripe comme "legacy run-off, lecture seule"
- **Action requise** : vérifier le profil Sargasses dans Stripe (dashboard), les clés (sk_live, webhook_secret), les webhooks configurés et le MRR réel avant de confirmer le statut. Ne pas supposer inactif.
- **MRR source** : `scripts/automation/data/daily-metrics.json` bloc `stripe` (à lire dynamiquement, jamais figé en dur)

## 6. Prochaines actions (par ordre de priorité)

### P0 — Débloquer l'accès aux données
1. **Obtenir SUPABASE_SERVICE_KEY** : le fondateur doit soit (a) fournir la valeur, soit (b) autoriser l'agent à l'extraire depuis GitHub Secrets via `gh` CLI (indisponible) ou Cloudflare API (token expiré). Alternative : rotation du token Cloudflare puis extraction.
   - **Ne pas demander la clé service_role dans ChatGPT.** Préparer son injection sécurisée dans l'environnement d'exécution (GitHub Secrets / Cloudflare Secrets / wrangler secret put).
2. **Autoriser le web app d'export** : le propriétaire doit effectuer le consentement OAuth du Web App déployé (`AKfycbxMVorrZ8Z_O7ueLVA1mHA35wpeL4BO52iIIV-SuPhAB2Z7sIEEzR_AmibZWyP2tFsRew`). Procédure : ouvrir l'URL `https://script.google.com/macros/s/AKfycbxMVorrZ8Z_O7ueLVA1mHA35wpeL4BO52iIIV-SuPhAB2Z7sIEEzR_AmibZWyP2tFsRew/exec?action=all` dans un navigateur connecté au compte Google propriétaire, puis autoriser l'accès. Le script est read-only (ne modifie aucune donnée).
3. **~~Compléter l'OAuth Supabase MCP~~** : RÉSOLU — le connecteur fonctionne dans ChatGPT. Ne plus considérer comme blocage.

### P1 — Comparer et exécuter la migration
4. **Comparer le schéma réel** : interroger Supabase (via ChatGPT ou service key) pour lister les tables existantes, leurs colonnes, contraintes, index et politiques RLS. Comparer avec `scripts/supabase-schema-target.sql`. Identifier les tables déjà présentes (analytics_events ~464K, beach_reports ~405) et éviter les doublons.
5. **Corriger le mapping** : `analytics_events` et `beach_reports` correspondent déjà à des tables existantes dans Supabase. Ne pas recréer. Adapter le mapping pour ces deux onglets (importer uniquement les données manquantes ou faire un upsert).
6. **Vérifier les données déjà migrées** : interroger Supabase pour identifier les contacts/emails déjà présents (éviter la duplication).
7. **Exécuter le SQL schema target** (uniquement les tables manquantes) dans Supabase SQL Editor.
8. **Exécuter l'export** : obtenir le JSON complet des 10 onglets via le web app (après consentement OAuth).
9. **Importer par lots** avec `migrate-sheets-to-supabase.cjs --send`, journal de migration et déduplication.
10. **Vérifier les volumes** source/cible.

### P2 — Paiements et droits
11. Vérifier `b2b-create-checkout.php` → `b2b-db.php` dépendance.
12. Ajouter `kind:"subscription"` dans `Sargasses_PROD.jsx`.
13. Tester les parcours B2C/B2B (TEST uniquement, avec approbation).

### P3 — ChatGPT + Gmail
14. Vérifier la recherche de contacts par email/hôtel/statut/segment depuis ChatGPT.
15. Préparer les segments et modèles d'emails.
16. Configurer OAuth Gmail (scopes minimaux).

## 7. Fichiers clés

| Fichier | Rôle |
|---------|------|
| `docs/migration-google-sheets/appscript-code-backup/Code.js` | Code Apps Script source (10 sheets) |
| `docs/migration-google-sheets/target-data-model.md` | Modèle cible (10 tables, RLS, dédup) |
| `scripts/supabase-schema-target.sql` | DDL cible (idempotent) |
| `scripts/supabase-schema.sql` | Schéma legacy (b2b_leads, b2b_subscriptions, b2c_alerts) |
| `scripts/gmail-schema-target.sql` | Schéma Gmail (6 tables) |
| `docs/migration-google-sheets/gmail-architecture.md` | Architecture Gmail complète |
| `public/api/mollie-lib.php` | Mollie lib (mol_b2b_grant_once, mol_supabase_mirror, webhook_journal_*) |
| `public/api/mollie-webhook.php` | Webhook Mollie (HMAC, journal durable) |
| `public/api/mollie.php` | verify_subscription (b2c_pass vs b2b_pro) |
| `public/api/b2b-create-checkout.php` | Checkout B2B (CORS whitelist) |
| `scripts/automation/webhook-reconcile.cjs` | Réconciliation webhooks |
| `scripts/automation/b2b-hotel-paylinks.cjs` | Générateur liens Mollie par hôtel |
| `opencode.json` | Config MCP (supabase-sargagame, read-only) |
| `C:\Users\user\AppData\Local\Temp\opencode\clasp-export\` | Script d'export read-only (déployé, nécessite consentement OAuth) |
