# Phase 1 — Inventaire complet Google (Sheets + Apps Script)

**Projet** : Sargagame  
**Date** : 2026-11-15  
**Statut** : 🔄 En cours — basé sur le code source local (clasp non authentifié)

---

## A. Google Sheet principal — identifié

| Champ | Valeur |
|-------|--------|
| **Sheet ID** | `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ` |
| **URL** | https://docs.google.com/spreadsheets/d/1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ/edit |
| **Type** | Single spreadsheet avec plusieurs onglets (tabs) |
| **Utilisé par** | `scripts/appscript/Code.js`, `scripts/stripe-webhook.gs`, `scripts/apps-script-digest.gs`, `scripts/automation/fetch-subscribers.cjs`, `scripts/automation/fetch-payers.cjs`, `scripts/automation/referral-from-sheet.cjs`, `scripts/automation/ab-fetch-ga4.cjs` |

---

## B. Onglets (tabs) identifiés dans le Sheet principal

Les noms d'onglets sont déduits du code source. Chaque onglet est créé à la demande par `getOrCreateSheet(name, headers)` dans `Code.js`.

| Onglet | Colonnes (en-têtes) | Utilisé par | Description |
|--------|---------------------|-------------|-------------|
| `emails` | `date, email, island, source[, unsubscribed]` | Code.js (email_signup, weekend_email, unsubscribe, drip, feedback_request), apps-script-digest.gs (getSubscribers), fetch-subscribers.cjs, fetch-payers.cjs, referral-from-sheet.cjs | Liste des abonnés B2C, avec île et source d'inscription. Colonne `unsubscribed` ajoutée dynamiquement par l'action `unsubscribe`. |
| `feedback` | `date, rating, text, island` | Code.js (type="feedback", doGet action="feedback") | Retours utilisateurs (note + texte libre). |
| `payments` | `date, session_id, email, amount, currency, status, island` | Code.js (Stripe webhook checkout.session.completed, doGet stats/funnel), stripe-webhook.gs (doPost), fetch-payers.cjs, referral-from-sheet.cjs | Paiements Stripe/Mollie enregistrés (session_id, montant, devise, statut, île). |
| `subscription_events` | `date, event_type, object_id, email, customer, subscription, amount, currency, island` | Code.js (invoice.payment_succeeded, customer.subscription.deleted, invoice.payment_failed), fetch-payers.cjs, referral-from-sheet.cjs | Cycle de vie des abonnements (renouvellements, churn, échecs). Dedup par (type, object_id). |
| `email_log` | `date, island, subject, sent, total_subscribers` | Code.js (weekend_email dispatch log) | Historique des envois d'emails weekend (déduplication jour par île). |
| `beach_reports` | `date, beach_id, beach_name, island, level` | Code.js (type="beach_report", doGet action="beach_reports") | Signalements utilisateurs de niveau sargasse par plage (level: clean/moderate/avoid), avec pondération temps (0.95^jours). |
| `email_tracking` | `date, resend_id, to, subject, email_type, island, status, plan, source, ab_tests` | Code.js (type="email_tracking", doGet email_stats), cleanBouncedEmails() | Tracking des emails envoyés via Resend (id, destinataire, type, statut, plan, source, tests A/B). |
| `analytics_events` | `date, event_name, island, ab_lock1, ab_modal1, ab_onb1, ab_free1, ab_vp1, ab_price1, raw_params` | Code.js (type="analytics_event", doGet action="funnel", action="referral") | Événements analytics/front (fallback quand GA4 indisponible). Colonnes A/B dédiées + raw_params JSON. |
| `drip_log` | `date, email, drip_id, island, status` | Code.js (runDripEmails()) | Log des séquences d'email nurture (j3, j7, j14) envoyées, avec déduplication email:drip_id. |
| `feedback_requests` | `date, email, status` | Code.js (sendFeedbackRequest(), doGet action="feedback_request") | Demandes de feedback envoyées aux clients payants (déduplication par email). |
| `email_events` | `date, event_type, resend_id, to, subject, from` | Code.js (type="email.*" webhook events: email.delivered, opened, clicked, bounced, complained) | Webhooks Resend d'événements email (livraison, ouverture, clic, rebond, plainte). |
| `digest_log` | `date, island, digest` | Code.js (payload.email === 'WEEKLY_DIGEST') | Log des digests hebdomadaires envoyés (legacy). |

**Nombre total d'onglets identifiés** : 13

---

## C. Autres Google Sheets reliés au système

Après analyse du code source local, **aucun autre Google Sheet** n'a été identifié :

- Aucun `IMPORTRANGE` trouvé dans le code.
- Aucun script n'ouvre un autre spreadsheet par ID (tous utilisent `SHEET_ID = '1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ'`).
- Le `referral-from-sheet.cjs` lit via l'URL publique CSV du même Sheet (`gviz/tq?tqx=out:csv&sheet=`).
- **Référence externe** : `scripts/automation/data/revenue-analytics-report.md` mentionne `sheet-payments.csv` et `sheet-subscription_events.csv` comme fichiers d'export dérivés (non confirmés comme fichiers Google Sheets distincts).

**Conclusion Phase 1.B** : Un seul Google Sheet centralise toutes les données. Pas de feuille secondaire, pas de liens inter-feuilles, pas d'IMPORTRANGE.

---

## D. Projets Apps Script identifiés

### Projet 1 — Sargasses Backend (principal)

| Champ | Valeur |
|-------|--------|
| **Fichier local** | `scripts/appscript/Code.js` (~1075 lignes, 52 Ko) |
| **Sauvegarde** | `docs/migration-google-sheets/appscript-code-backup/Code.js` |
| **Sheet ID** | `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ` |
| **Déploiement** | Web App (Execute as: Me, Access: Anyone) — URL non connue localement (clasp non authentifié) |
| **Handlers doPost** | `email_signup`, `feedback`, `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `invoice.payment_failed`, `weekend_email`, `beach_report`, `send_welcome_email`, `email_tracking`, `analytics_event`, `email.*` (Resend webhooks), `WEEKLY_DIGEST` |
| **Handlers doGet** | `stats`, `emails`, `feedback`, `beach_reports`, `email_stats`, `funnel`, `referral`, `feedback_request`, `drip_check`, `clean_bounces`, `unsubscribe` |
| **Fonctions principales** | `getOrCreateSheet()`, `jsonResponse()`, `htmlResponse()`, `runDripEmails()`, `sendFeedbackRequest()`, `cleanBouncedEmails()`, `emailHash_()` |
| **Séquences drip** | `drip_j3` (jour 3), `drip_j7` (jour 7), `drip_j14` (jour 14) — fenêtre d'envoi ±2 jours |
| **Services avancés** | `SpreadsheetApp`, `MailApp`, `GmailApp`, `HtmlService`, `ContentService`, `Utilities` (SHA-256 hash) |
| **RGPD** | `emailHash_()` = SHA-256 tronqué 128 bits, trim+lowercase — aligné sur `scripts/automation/lib/email-hash.cjs`. Jamais d'email en clair dans les logs publics. |

### Projet 2 — Stripe Webhook + Premium Verification (séparé)

| Champ | Valeur |
|-------|--------|
| **Fichier local** | `scripts/stripe-webhook.gs` (81 lignes) |
| **Sauvegarde** | `docs/migration-google-sheets/appscript-code-backup/stripe-webhook.gs` |
| **Sheet ID** | `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ` (onglet `payments`) |
| **Projet Apps Script** | Non connu (création séparée recommandée dans le code) |
| **Déploiement** | Web App (Execute as: Me, Access: Anyone) — URL non connue localement |
| **doPost** | `checkout.session.completed` → écrit dans onglet `payments` |
| **doGet** | `?verify=SESSION_ID` → vérifie si session payée (`{valid: true/false}`) |
| **Usage** | URL configurée dans Stripe Dashboard webhooks + `STRIPE_WEBHOOK_URL` dans `Sargasses_PROD.jsx` |

### Projet 3 — Weekly Email Digest

| Champ | Valeur |
|-------|--------|
| **Fichier local** | `scripts/apps-script-digest.gs` (195 lignes) |
| **Sauvegarde** | `docs/migration-google-sheets/appscript-code-backup/apps-script-digest.gs` |
| **Project ID** | `1v23rVvp2Oa7bergwETnODYRf-kRbxRiIvGtY3bKonNtxp6ZR1UfpAsRV` |
| **Sheet ID** | `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ` |
| **Déploiement** | Dans le même projet Apps Script (à confirmer via clasp) |
| **Trigger** | Time-driven : `sendWeeklyDigest()` tous les lundis 8:00 (à confirmer via clasp) |
| **Fonctions** | `getSubscribers()`, `fetchSargassumData()`, `buildDigestHtml()`, `sendWeeklyDigest()`, `testDigest()` |
| **Sources de données** | `emails` sheet (abonnés), `https://sargasses-martinique.com/api/copernicus/sargassum.json`, `https://sargasses-guadeloupe.com/api/copernicus/sargassum.json` |
| **Plages** | 21 plages identifiées (12 MQ + 9 GP) dans `BEACH_NAMES` |

---

## E. Automatisations tierces (Node.js) lisant le Google Sheet

| Script | Sheet(s) lues | Authentification | Fréquence | Usage |
|--------|--------------|------------------|-----------|-------|
| `scripts/automation/fetch-subscribers.cjs` | `emails!A:E` | `GOOGLE_SERVICE_ACCOUNT_JSON` (googleapis) | CI (daily-copernicus.yml) | Construit `data/subscribers.json` pour welcome-email |
| `scripts/automation/fetch-payers.cjs` | `payments!A:G`, `subscription_events!A:I`, `emails!A:E` | `GOOGLE_SERVICE_ACCOUNT_JSON` (googleapis) | CI | Construit `data/payers.json` (segment clients payants, exclu désabos+bounces) |
| `scripts/automation/referral-from-sheet.cjs` | `emails`, `payments`, `subscription_events` (CSV public) | Aucun (URL publique) | À la demande | Rapport parrainage (share/landing/convert) |
| `scripts/automation/ab-fetch-ga4.cjs` | `SHEET_ID` (lecture sheets) | `GOOGLE_SERVICE_ACCOUNT_JSON` (googleapis) | À la demande | Données A/B depuis GA4 + Sheet (ligne 129-146) |

**Workflow GitHub utilisant Apps Script** : `.github/workflows/daily-copernicus.yml` appelle `clean_bounces` via curl sur l'URL du web app Apps Script (ligne 201).

---

## F. Dépendances et services externes

| Service | Usage | Secret requis | Exposé dans Git ? |
|---------|-------|---------------|-------------------|
| Google Sheets API | Lecture/écriture données | `GOOGLE_SERVICE_ACCOUNT_JSON` | Non (env var) |
| GmailApp / MailApp | Envoi emails (drip, weekend, welcome, feedback, digest) | Compte Google du deployeur | Non |
| Resend | Webhooks email tracking (email.delivered, opened, clicked, bounced, complained) | Resend API key | Non |
| Stripe | Webhooks checkout.session.completed | Stripe webhook secret | Non |
| Mollie | Paiements B2C (webhook secret à configurer — BUG-2026-001) | `MOLLIE_WEBHOOK_SECRET` | Non |
| Copernicus / ERDDAP | Données sargassum (API JSON publique) | Aucun | Non |

---

## G. Risques et comportements particuliers

1. **Déduplication côté Apps Script** : `weekend_email` refuse si déjà dispatché aujourd'hui pour l'île ; `send_welcome_email` skip si déjà envoyé dans les 24h ; `runDripEmails` dédup par `email:drip_id` ; `subscription_events` dédup par `(type, object_id)`.
2. **Bounce cleanup** : `cleanBouncedEmails()` supprime définitivement des emails de l'onglet `emails` (itération arrière). Hashes SHA-256 tronqués stockés en dur dans le code (6 hashes connus).
3. **Pas de secret en dur** : Le code ne contient pas de clé API, token ou secret. Les secrets sont gérés via variables d'environnement (CI) ou compte Google du deployeur.
4. **Fallback graceful** : `stripe-webhook.gs` doGet retourne `valid: true, fallback: true` si la sheet est inaccessible.
5. **Analytics fallback** : `analytics_event` type sert de fallback quand GA4 retourne 503.
6. **clasp non authentifié** : Impossible de lister les triggers installés, les déploiements actifs, les versions ou les bibliothèques sans `clasp login`.

---

## H. Ce qui nécessite une authentification Google (clasp)

Les éléments suivants n'ont pas pu être inventoriés localement car clasp n'est pas authentifié :

- [ ] Liste complète des déclencheurs installés (time-driven, onEdit, onChange, onFormSubmit)
- [ ] Liste des déploiements actifs et leurs versions
- [ ] Historique des versions (clasp list-versions)
- [ ] URL des web apps déployées
- [ ] Bibliothèques (libraries) associées aux projets
- [ ] Propriétés de script et de document (ScriptProperties, DocumentProperties, UserProperties)
- [ ] Services avancés activés dans chaque projet

**Action requise** : `clasp login` (authentification Google via navigateur) puis `clasp list-scripts`, `clasp list-deployments`, `clasp list-versions` sur chaque projet.

---

## I. Preuves de vérification (Phase 1)

- [x] Sheet ID capturé : `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ`
- [x] 13 onglets identifiés via analyse statique du code
- [x] 3 projets Apps Script identifiés (1 principal + 1 stripe-webhook + 1 digest)
- [x] 4 scripts Node.js d'automatisation lisant le Sheet identifiés
- [x] Tous les fichiers Apps Script sauvegardés dans `docs/migration-google-sheets/appscript-code-backup/`
- [ ] clasp authentification — EN ATTENTE (action manuelle requise)
- [ ] Inventaire des triggers, déploiements, versions — EN ATTENTE (clasp requis)
