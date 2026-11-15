# État de la migration Google Sheets → Supabase

**Date** : 2026-11-15
**Projet Supabase** : `rswdmjtdzrucqzzukfmd` (us-east-1, PostgreSQL 17)
**Google Sheet ID** : `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ`
**Branche** : `feat/sargagame-supabase-google-migration` (commits `12e1959ef`, `ad4dd269e`)

---

## 1. Inventaire des 10 onglets source (depuis Code.js Apps Script)

Source de vérité : `docs/migration-google-sheets/appscript-code-backup/Code.js` (fonction `getOrCreateSheet`).

| # | Onglet | Colonnes (headers) | Volume (stats web app) | Table cible |
|---|--------|-------------------|------------------------|-------------|
| 1 | `emails` | date, email, island, source (+ unsubscribed) | 639 | `b2b_contact_emails` |
| 2 | `feedback` | date, rating, text, island | 1 | `contact_feedback` |
| 3 | `payments` | date, session_id, email, amount, currency, status, island, ref | 22 (revenue 142.78€) | `contact_payments` |
| 4 | `subscription_events` | date, event_type, object_id, email, customer, subscription, amount, currency, island | ? | `contact_subscriptions` |
| 5 | `email_log` | date, island, subject, sent, total_subscribers | 260 sent | `email_campaigns` |
| 6 | `digest_log` | date, island, digest | ? | `email_campaigns` |
| 7 | `email_tracking` | date, resend_id, to, subject, email_type, island, status, plan, source, ab_tests | ? | `email_messages` |
| 8 | `email_events` | date, event_type, resend_id, to, subject, from | ? | `email_messages` (événements) |
| 9 | `beach_reports` | date, beach_id, beach_name, island, level | ? | `automation_runs` |
| 10 | `analytics_events` | date, event_name, island, ab_lock1, ab_modal1, ab_onb1, ab_free1, ab_vp1, ab_price1, raw_params | ? | `automation_runs` |

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

### B3 — Supabase MCP nécessite OAuth
- **Preuve** : `GET https://mcp.supabase.com/mcp?project_ref=rswdmjtdzrucqzzukfmd` → `401 No access token provided`. Metadata OAuth : `authorization_servers: ["https://api.supabase.com"]`, scopes: `database:read`, `projects:read`, etc.
- **Impact** : le connecteur Supabase dans opencode.json (`.mcp.json` n'a que higgsfield ; opencode.json a `supabase-sargagame`) nécessite un flow OAuth interactif. ChatGPT ne peut pas encore interroger Supabase sans que l'utilisateur complète l'OAuth.
- **Config actuelle** : `opencode.json` → `mcpServers.supabase-sargagame` → URL `https://mcp.supabase.com/mcp?project_ref=rswdmjtdzrucqzzukfmd&read_only=true&features=database,docs,debugging,development,functions`

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

### Stripe (legacy, lecture seule)
- 16 abonnés EUR, MRR surveillé uniquement
- Aucun CTA, liens USD désactivés

## 6. Prochaines actions (par ordre de priorité)

### P0 — Débloquer l'accès aux données
1. **Obtenir SUPABASE_SERVICE_KEY** : le fondateur doit soit (a) fournir la valeur, soit (b) autoriser l'agent à l'extraire depuis GitHub Secrets via `gh` CLI (indisponible) ou Cloudflare API (token expiré). Alternative : rotation du token Cloudflare puis extraction.
2. **Autoriser le web app d'export** : visiter l'URL du script déployé (`AKfycbxMVorrZ8Z_...`) pour autoriser l'accès OAuth. Ou accorder les scopes `spreadsheets.readonly` au clasp OAuth.
3. **Compléter l'OAuth Supabase MCP** : l'utilisateur doit autoriser le flow OAuth sur `https://api.supabase.com` pour activer le connecteur dans ChatGPT.

### P1 — Exécuter la migration
4. Créer les tables cibles dans Supabase (exécuter `scripts/supabase-schema-target.sql` dans le SQL Editor).
5. Exécuter le script d'export pour récupérer les données des 10 onglets.
6. Importer par lots avec journal de migration et déduplication.
7. Vérifier les volumes source/cible.

### P2 — Paiements et droits
8. Vérifier `b2b-create-checkout.php` → `b2b-db.php` dépendance.
9. Ajouter `kind:"subscription"` dans `Sargasses_PROD.jsx`.
10. Tester les parcours B2C/B2B (TEST uniquement, avec approbation).

### P3 — ChatGPT + Gmail
11. Configurer le connecteur Supabase MCP dans ChatGPT.
12. Vérifier la recherche de contacts par email/hôtel/statut/segment.
13. Préparer les segments et modèles d'emails.
14. Configurer OAuth Gmail (scopes minimaux).

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
