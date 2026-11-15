# Phase 3 — Modèle de données cible (Supabase)

**Projet** : Sargagame  
**Date** : 2026-11-15  
**Statut** : 📝 Proposition (à valider par architect_agent)  
**Branche** : `feat/sargagame-supabase-google-migration`  
**Supabase** : `rswdmjtdzrucqzzukfmd` (us-east-1, PostgreSQL 17)

---

## A. Règles de conception (non négociables)

| Règle | Description |
|-------|-------------|
| R1 | **Aucune donnée B2C publique** : tables contenant des emails B2C (`b2b_contact_emails`, `email_messages`, `email_suppressions`, `contact_consents`) en RLS strict, pas d'accès `anon` |
| R2 | **Préserver les clés sources** : chaque ligne migrante garde `source_sheet`, `source_row_id`, `source_updated_at` pour traçabilité et réconciliation |
| R3 | **Aucune donnée inventée** : champs manquants dans la source = NULL, jamais de valeur par défaut fabriquée |
| R4 | **Déduplication préservée** : même logique que Apps Script (email:drip_id pour drip, type:object_id pour subscription_events, etc.) |
| R5 | **Immutabilité historique** : jamais de DELETE sur les tables historiques, uniquement des statuts (`status`, `unsubscribed`) |
| R6 | **Pas de clasp push** : le code Apps Script existant n'est jamais modifié pendant la migration |

---

## B. Mapping Source → Cible

| Onglet Sheet (source) | Table cible | Raisonnement |
|-----------------------|-------------|--------------|
| `emails` | `b2b_contact_emails` | Abonnés B2C, île, source, statut désabonnement |
| `feedback` | `contact_feedback` | Retours utilisateurs (note + texte) |
| `payments` | `contact_payments` | Paiements Stripe/Mollie (session_id, montant, statut) |
| `subscription_events` | `contact_subscriptions` | Cycle de vie abonnements (renouvellement, churn, échec) |
| `email_log` | `email_campaigns` | Envois d'emails weekend (un par envoi, par île) |
| `digest_log` | `email_campaigns` | Digests hebdomadaires (même type d'envoi) |
| `email_tracking` | `email_messages` | Tracking individuel (Resend: envoi, ouverture, clic, rebond) |
| `email_events` | `email_messages` (événements) | Webhooks Resend stockés comme événements liés au message |
| `drip_log` | `automation_runs` | Séquences drip nurture (j3, j7, j14) |
| `analytics_events` | `automation_runs` (événements analytics) | Événements front/GA4 fallback |
| `feedback_requests` | `contact_consents` | Demandes de feedback + statut consentement |
| — | `email_suppressions` | Unsubscribes + bounces (dérivé de `emails.unsubscribed` + `email_events.bounced`) |
| — | `source_sync_runs` | Audit trail des synchronisations Sheets → Supabase |

Tables B2B existantes (conservées, non modifiées) :
- `b2b_leads`, `b2b_subscriptions`, `b2c_alerts` (dans `scripts/supabase-schema.sql`)
- `b2b_prospects`, `b2b_contacts`, `b2b_scores`, `b2b_concierge`, `b2b_forecast_deliveries`, `b2b_payments`, `b2b_events` (dans `supabase/b2b-concierge.sql`)

---

## C. Schéma cible (SQL)

Voir `scripts/supabase-schema-target.sql` pour le DDL complet et idempotent.

Résumé des tables :

| Table | Clé primaire | Clés étrangères | RLS | Accès anon |
|-------|-------------|-----------------|-----|------------|
| `b2b_contact_emails` | id (uuid) | — | activé | INSERT uniquement (signup), SELECT service_role |
| `contact_feedback` | id (uuid) | email_id → b2b_contact_emails | activé | service_role uniquement |
| `contact_payments` | id (uuid) | email_id → b2b_contact_emails | activé | service_role uniquement |
| `contact_subscriptions` | id (uuid) | email_id → b2b_contact_emails | activé | service_role uniquement |
| `email_campaigns` | id (uuid) | — | activé | service_role uniquement |
| `email_messages` | id (uuid) | campaign_id → email_campaigns | activé | service_role uniquement |
| `email_suppressions` | id (uuid) | email_id → b2b_contact_emails | activé | service_role uniquement |
| `contact_consents` | id (uuid) | email_id → b2b_contact_emails | activé | service_role uniquement |
| `automation_runs` | id (uuid) | — | activé | service_role uniquement |
| `source_sync_runs` | id (uuid) | — | activé | service_role uniquement |

---

## D. Déduplication et contraintes

| Table | Règle de dédup | Contrainte |
|-------|---------------|------------|
| `b2b_contact_emails` | email + island (lowercase, trim) | UNIQUE(email_hash, island) — `email_hash` = SHA-256 tronqué |
| `contact_subscriptions` | (event_type, object_id) | UNIQUE(event_type, object_id) |
| `automation_runs` (drip) | email + drip_id | UNIQUE(email, drip_id, drip_day) |
| `email_messages` | resend_id | UNIQUE(resend_id) |
| `email_suppressions` | email | UNIQUE(email) |
| `source_sync_runs` | source_table + sync_started_at | UNIQUE(source_table, sync_started_at) |

---

## E. RLS policies (principe : service_role seulement pour les tables B2C)

- `anon` role : **aucun accès** aux tables B2C (lecture et écriture bloquées par défaut)
- `service_role` : accès complet (utilisé par les Edge Functions et endpoints server-side)
- `authenticated` : pas d'accès direct (les utilisateurs B2C ne sont pas authentifiés via Supabase Auth)

Exceptions :
- `b2b_contact_emails` : politique INSERT pour `anon` (inscription newsletter via formulaire public) avec CHECK sur email valide et island dans la liste autorisée

---

## F. Index de performance

- `b2b_contact_emails(email_hash)` — recherche rapide par email hashé
- `b2b_contact_emails(island, status)` — liste abonnés par île (weekend_email)
- `contact_subscriptions(email_id, event_type)` — cycle de vie par abonné
- `email_messages(campaign_id, status)` — stats par campagne
- `email_messages(resend_id)` — lookup webhook Resend
- `automation_runs(drip_id, created_at)` — séquences drip chronologiques
- `source_sync_runs(source_table, created_at)` — audit des syncs

---

## G. Preuves attendues (Phase 3)

- [ ] Fichier `scripts/supabase-schema-target.sql` créé et idempotent (CREATE IF NOT EXISTS)
- [ ] RLS activée sur toutes les tables B2C
- [ ] Politique `anon` INSERT sur `b2b_contact_emails` documentée
- [ ] Aucun secret en dur dans le SQL
- [ ] Mapping 13 onglets → tables cibles documenté
- [ ] Règles de dédup alignées sur le comportement Apps Script existant

---

## H. Suivant (Phase 4 : Migration des données)

Une fois ce modèle validé :
1. Créer les tables dans Supabase (via SQL Editor, nécessite `SUPABASE_SERVICE_KEY`)
2. Construire le script d'import reproductible (staging → production)
3. Réconciliation ligne par ligne (Phase 4)
4. Migration des automatisations (Phase 5)
