# Inventaire des fonctions Apps Script

## Projet 1 — Code.js (Sargasses Backend, ~1075 lignes)

### Handlers HTTP (doPost / doGet)

| Fonction | Type | Rôle | Données Sheet |
|----------|------|------|---------------|
| `doPost(e)` | HTTP POST | Dispatch principal — route par `payload.type` | Tous les onglets |
| `doGet(e)` | HTTP GET | Lecture/stats — route par `e.parameter.action` | Tous les onglets (lecture seule) |

### Types doPost gérés

| type | Fonction implicite | Onglet cible | Description |
|------|-------------------|--------------|-------------|
| `email_signup` | (dans doPost) | `emails` | Inscription email nouvel abonné |
| `feedback` | (dans doPost) | `feedback` | Retour utilisateur (note + texte) |
| `checkout.session.completed` | (dans doPost) | `payments` | Webhook Stripe — paiement complété |
| `invoice.payment_succeeded` | (dans doPost) | `subscription_events` | Renouvellement abonnement |
| `customer.subscription.deleted` | (dans doPost) | `subscription_events` | Churn abonnement |
| `invoice.payment_failed` | (dans doPost) | `subscription_events` | Échec paiement (dunning) |
| `weekend_email` | (dans doPost) | `emails`, `email_log` | Envoi email weekend à tous les abonnés d'une île |
| `beach_report` | (dans doPost) | `beach_reports` | Signalement niveau sargasse par plage |
| `send_welcome_email` | (dans doPost) | `email_tracking` | Email de bienvenue après essai (fallback) |
| `email_tracking` | (dans doPost) | `email_tracking` | Tracking Resend (envoi, ouverture, clic, rebond) |
| `analytics_event` | (dans doPost) | `analytics_events` | Événement analytics (fallback GA4) |
| `email.*` | (dans doPost) | `email_events` | Webhooks Resend (delivered, opened, clicked, bounced, complained) |
| `WEEKLY_DIGEST` | (dans doPost) | `digest_log` | Log digest hebdomadaire (legacy) |

### Actions doGet gérées

| action | Fonction implicite | Onglet cible | Description |
|--------|-------------------|--------------|-------------|
| `stats` | (dans doGet) | `payments`, `emails`, `feedback`, `email_log` | Métriques clés (paiements, revenus, emails, feedbacks) |
| `emails` | (dans doGet) | `emails` | Liste emails par île |
| `feedback` | (dans doGet) | `feedback` | Derniers 20 retours |
| `beach_reports` | (dans doGet) | `beach_reports` | Rapports plages agrégés avec pondération temps |
| `email_stats` | (dans doGet) | `email_events`, `email_tracking` | Taux delivery/open/click/bounce |
| `funnel` | (dans doGet) | `analytics_events`, `payments` | Entonnoir de conversion (28j) + A/B variants |
| `referral` | (dans doGet) | `analytics_events` | Parrainage (share/landing/convert par code) |
| `feedback_request` | → `sendFeedbackRequest()` | `feedback_requests`, `payments` | Envoi feedback aux clients payants |
| `drip_check` | → `runDripEmails()` | `emails`, `drip_log` | Séquences nurture (j3, j7, j14) |
| `clean_bounces` | → `cleanBouncedEmails()` | `emails`, `email_events` | Nettoyage emails en rebond |
| `unsubscribe` | (dans doGet) | `emails` | Désabonnement (marque `unsubscribed=yes`) |

### Fonctions utilitaires et métier

| Fonction | Ligne | Rôle |
|----------|-------|------|
| `getOrCreateSheet(name, headers)` | ~22 | Ouvre ou crée un onglet avec en-têtes |
| `jsonResponse(obj)` | — | Retour JSON avec CORS headers |
| `htmlResponse(body)` | ~851 | Retour HTML pour `unsubscribe` |
| `runDripEmails()` | ~912 | Envoie séquences drip (j3, j7, j14) avec déduplication |
| `sendFeedbackRequest()` | ~977 | Envoie email feedback aux clients payants (dédup par email) |
| `cleanBouncedEmails()` | ~1022 | Supprime emails en rebond de l'onglet `emails` |
| `emailHash_(email)` | ~1068 | Hash SHA-256 tronqué 128 bits (trim+lowercase) |

### Séquences drip (DRIP_SEQUENCES)

| ID | Jour | Sujet | Cible |
|----|------|-------|-------|
| `drip_j3` | 3 | "{clean} plages propres cette semaine" | Tous abonnés |
| `drip_j7` | 7 | "Sache samedi dès lundi ☀️" | Upsell Pass 7 jours |
| `drip_j14` | 14 | "Ton weekend sans surprise 🏖️" | Upsell Premium |

---

## Projet 2 — stripe-webhook.gs (Stripe Webhook + Premium Verification)

| Fonction | Type | Rôle |
|----------|------|------|
| `doPost(e)` | HTTP POST | Reçoit `checkout.session.completed` de Stripe → écrit dans `payments` |
| `doGet(e)` | HTTP GET | `?verify=SESSION_ID` → `{valid: true/false}` vérification paiement client |

---

## Projet 3 — apps-script-digest.gs (Weekly Email Digest)

| Fonction | Rôle |
|----------|------|
| `getSubscribers()` | Lit tous les emails depuis onglet `emails` |
| `fetchSargassumData()` | Récupère données sargassum depuis API Copernicus (MQ + GP) |
| `buildDigestHtml(levels, island)` | Construit le HTML du digest hebdo (plages propres/modérées/à éviter) |
| `sendWeeklyDigest()` | Point d'entrée — envoie digest à tous les abonnés (trigger lundi 8h) |
| `testDigest()` | Envoie un digest de test à `alerte@sargasses-martinique.com` |

---

## Services Google Apps Script utilisés

| Service | Usage dans le code |
|---------|-------------------|
| `SpreadsheetApp` | Lecture/écriture tous les onglets du Sheet principal |
| `MailApp` | Envoi emails (weekend, welcome, drip, feedback) |
| `GmailApp` | Envoi emails (weekly digest uniquement) |
| `HtmlService` | Réponse HTML pour `unsubscribe` |
| `ContentService` | Réponse JSON pour webhooks Stripe |
| `Utilities.computeDigest` | Hash SHA-256 pour RGPD (emails) |
| `UrlFetchApp` | Fetch API sargassum (dans digest.gs) |
| `Logger` | Logs d'exécution |

---

## Déduplication et règles métier critiques

1. **weekend_email** : Refus si déjà envoyé aujourd'hui pour la même île (vérifie `email_log`).
2. **send_welcome_email** : Skip si email "welcome" déjà envoyé dans les 24h (vérifie `email_tracking`).
3. **runDripEmails** : Dédup par `email:drip_id` dans `drip_log`; fenêtre d'envoi ±2 jours autour du jour cible.
4. **subscription_events** : Dédup par `(event_type, object_id)` avant insertion.
5. **cleanBouncedEmails** : Suppression définitive des emails dont le hash correspond aux bounces connus.
6. **unsubscribe** : Marque `unsubscribed=yes` dans l'onglet `emails` (pas de suppression).
