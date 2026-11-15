# Matrice des intégrations — Sargagame (Phase 0.6)

**Règle de lecture** : un fournisseur peut être **présent dans le code** sans être **opérationnel**.  
- `présent` = le code appelle ce fournisseur (fichier, import, endpoint).  
- `opérationnel` = les accès sont configurés, valides, et le flux fonctionne de bout en bout.  
- `manquant` = accès absent ou expiré → le flux est dégradé (fail-closed ou fallback silencieux).  
- `historique` = présent dans des commentaires / docs, plus utilisé.

Aucune valeur secrète n'apparaît dans ce document.

---

## 1. Paiements B2C — Mollie (caisse active, on-site)

| Fonctionnalité | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Création checkout on-site (passes p30/trip7/saison/p7/sos) | `public/api/mollie.php` | `MOLLIE_API_KEY` (clé test exposée → à révoquer/remplacer) | local / prod FTP | **Dégradé** | Clé test exposée, doit être révoquée puis remplacée. Webhook fail-closed sans `MOLLIE_WEBHOOK_SECRET`. |
| Webhook paiement (payment.paid → grant pass) | `public/api/mollie-webhook.php` | `MOLLIE_WEBHOOK_SECRET` (HMAC-SHA256, `X-Mollie-Signature`) | prod FTP | **Non opérationnel** | BUG-2026-001 / TASK-P0-001 : webhook_secret absent → HTTP 503. |
| Webhook paiement (b2b_annual / b2b_first → grant pro 365j) | `public/api/mollie-webhook.php` | `MOLLIE_API_KEY` + `MOLLIE_WEBHOOK_SECRET` + `SUPABASE_SERVICE_KEY` | prod FTP | **Non opérationnel** | Dépend du webhook secret + service key pour mirror Supabase. |
| verify_subscription (pass, type=b2c_pass) | `public/api/mollie.php` | `SUPABASE_SERVICE_KEY` | local / prod | **Dégradé** | Retourne `lookup_failed` sans service key (fallback Stripe préserve l'UX). |
| Widget token PRO (HMAC dérivé de webhook_secret) | `public/api/widget-token.php` | `webhook_secret` (via stripe-config) | local / prod | **Dégradé** | Dépend du webhook secret Mollie. |
| Rate limiting anti card-testing | `public/api/_ratelimit.php` | (dérivé de webhook_secret) | local / prod | **Dégradé** | Idem widget token. |

---

## 2. Paiements B2B — Mollie (abonnements mensuels + annuels)

| Fonctionnalité | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Création checkout B2B (source b2b_first mensuel / b2b_annual annuel) | `public/api/b2b-create-checkout.php` | `MOLLIE_API_KEY` | prod FTP | **Dégradé** | Clé test exposée. CORS whitelist déjà en place. |
| Webhook subscription (created/updated/paid → grant pro_monthly/brief_monthly) | `public/api/mollie-webhook.php` | `MOLLIE_API_KEY` + `MOLLIE_WEBHOOK_SECRET` + `SUPABASE_SERVICE_KEY` | prod FTP | **Non opérationnel** | Webhook secret absent → HTTP 503. Service key absent → mirror skip. |
| Plans B2B centralisés (pro_monthly 79€, brief_monthly 29€, pro_annual 690€, brief_annual 290€) | `public/api/mollie-lib.php` `mol_b2b_plans()` | — (code seulement) | — | **Présent, opérationnel (code)** | Aucune clé nécessaire pour la définition des plans. |
| Grant B2B (mol_b2b_grant_once + mol_supabase_mirror) | `public/api/mollie-lib.php` | `SUPABASE_SERVICE_KEY` | local / prod | **Dégradé** | Mirror skip silencieux sans service key. |
| Webhook journal + réconciliation (backoff exponentiel) | `scripts/automation/webhook-reconcile.cjs` | `MOLLIE_API_KEY` + `SUPABASE_SERVICE_KEY` | local / prod | **Dégradé** | Dépend des deux accès. |

---

## 3. Flux Stripe encore utilisés (legacy run-off, read-only)

| Fonctionnalité | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Checkout on-site Stripe (legacy) | `public/api/create-checkout.php` | `STRIPE_SECRET_KEY` (sk_live expirée) | local / prod | **Non opérationnel** | Clé live expirée ("Expired API Key provided"). Fondateur doit renouveler. |
| Webhook Stripe (signature v1 HMAC, idempotence) | `public/api/stripe-webhook.php` | `STRIPE_WEBHOOK_SECRET` (whsec_) | prod | **Non opérationnel** | Clé expirée + webhook secret à vérifier après renouvellement. |
| Rate limiting Stripe (Radar, anti card-testing) | `public/api/_ratelimit.php` | `webhook_secret` (dérivé) | local / prod | **Dégradé** | Dépend du webhook secret Stripe. |
| Widget token (dérivé de webhook_secret) | `public/api/widget-token.php` | `webhook_secret` (via stripe-config) | local / prod | **Dégradé** | Idem. |
| Emails bienvenue + snippet pro (Resend) | `public/api/create-checkout.php`, `stripe-webhook.php` | `RESEND_API_KEY` (re_) | prod | **Dégradé** | Clé Resend présente dans dist-*/docs/ mais vide dans mollie-config. |
| Payment Links par région (scripts) | `scripts/create-region-payment-links.cjs` | `STRIPE_SECRET_KEY` | local | **Non opérationnel** | Clé expirée. |
| Pass one-time EUR (scripts) | `scripts/create-pass-links.cjs` | `STRIPE_SECRET_KEY` | local | **Non opérationnel** | Idem. |

> **Note** : Stripe = 100% du MRR historiquement. Actuellement legacy run-off car clé expirée. Mollie = caisse active.

---

## 4. Flux PayPal (chemin parallèle, flag PAY_PROVIDER='paypal')

| Fonctionnalité | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Création commande / abonnement PayPal | `public/api/paypal.php` | `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` (live) | prod | **Présent, partiellement opérationnel** | client_id + secret configurés (mode live). |
| Webhook PayPal (signature API officielle) | `public/api/paypal-webhook.php` | `PAYPAL_WEBHOOK_ID` | prod | **Non opérationnel** | `webhook_id` = placeholder `'PAYPAL_WEBHOOK_ID'` (non créé). Fail-closed HTTP 500 si absent. |
| Mirror grants PayPal → Supabase | `public/api/pp-supabase-mirror.php` | `SUPABASE_SERVICE_KEY` | local / prod | **Dégradé** | Dépend du service key. |
| Mapping email → subscriptionId (verify cross-device) | `public/api/paypal.php` (data/paypal-subs/) | — (fichiers locaux) | — | **Présent** | Pas de secret serveur, mais fichiers JSON perdus au deploy. |
| Création plans PayPal (scripts) | `scripts/create-paypal-plans.cjs` | `PAYPAL_SECRET` | local | **Non opérationnel** | webhook_id manquant. |

---

## 5. Emails transactionnels (Resend)

| Fonctionnalité | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Email bienvenue post-paiement Stripe | `public/api/create-checkout.php`, `stripe-webhook.php` | `RESEND_API_KEY` | prod | **Dégradé** | Clé présente dans dist-*/docs/ (`re_dcpGouua...`) mais vide dans mollie-config.php. |
| Snippet intégration pro (jeton ?k= signé) | `public/api/stripe-webhook.php` | `RESEND_API_KEY` | prod | **Dégradé** | Idem. |
| Email B2B trial / meeting (hôtel) | `public/api/b2b-trial.php`, `b2b-meeting.php` | `RESEND_API_KEY` | prod | **Dégradé** | Idem. |
| Worker outreach (email queue) | `workers/outreach/index.js` | `RESEND_API_KEY` (wrangler secret) | Cloudflare | **Non opérationnel** | `OUTREACH_ENABLED = "false"`, `EMAIL_OUTREACH_ENABLED = "false"` (défaut OFF, dry-run). |

---

## 6. Emails commerciaux / outreach

| Fonctionnalité | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Campagne outreach B2B hôtels (email queue + relances + Facebook) | `workers/outreach/index.js` | `RESEND_API_KEY`, `FB_PAGE_TOKEN`, `ADMIN_KEY` | Cloudflare | **Désactivé par défaut** | Crons : `*/30 * * * *`, `20 * * * *`, `45 11 * * *`. Kill switches OFF. Quotas réduits (10 emails/jour). |
| Migration Sheets → Supabase (emails, feedback, payments…) | `scripts/migrate-sheets-to-supabase.cjs` | `SUPABASE_SERVICE_KEY` + OAuth Google | local | **Dry-run OK, réel bloqué** | Service key absent localement. Export script read-only déployé (nécessite consentement OAuth). |

---

## 7. Alertes et automatisations

| Fonctionnalité | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Auto-modération photos (NSFW) | `scripts/automation/auto-moderate-photos.cjs` | `SUPABASE_SERVICE_KEY` | local | **Skip si absent** | Logue et saute sans service key. |
| Auto-modération rapports | `scripts/automation/auto-moderate-reports.cjs` | `SUPABASE_SERVICE_KEY` | local | **Skip si absent** | Idem. |
| Recovery panier J+1 | `scripts/automation/cart-recovery-j1.cjs` | `SUPABASE_SERVICE_KEY` + `SMTP_*` | local | **Non opérationnel** | Requiert service key + SMTP. |
| Backfill grants Mollie | `scripts/automation/backfill-mollie-grants.cjs` | `MOLLIE_API_KEY` + `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | local | **Non opérationnel** | Requiert les trois accès. |
| Stats quotidiennes | `scripts/automation/daily-stats-check.cjs` | `SUPABASE_SERVICE_KEY` | local | **Skip si absent** | Idem. |
| SMTP alerte@ (mailbox) | `.env` (SMTP_HOST/PORT/USER/PASS) | `SMTP_PASS` | local | **Non configuré** | `smtp-relay.gmail.com` ou premium115.web-hosting.com. |

---

## 8. Déploiements FTPS (par région)

| Région | Fichier(s) | Secret requis | Environnement | État | Commentaire |
|---|---|---|---|---|---|
| Martinique (sargasses-martinique.com) | `scripts/prepare-ftp.cjs`, `manual-ftp-deploy.cjs` | `FTP_SERVER_MQ`, `FTP_USERNAME_MQ`, `FTP_PASSWORD_MQ` | prod | **Présent, non testé** | Déploy via `npm run martinique` + `ftp-deploy`. |
| Guadeloupe (sargasses-guadeloupe.com) | idem | `FTP_SERVER_GP`, `FTP_USERNAME_GP`, `FTP_PASSWORD_GP` | prod | **Présent, non testé** | Idem. |
| Punta Cana | idem | `FTP_PASS_PUNTACANA` | prod | **Présent, non testé** | Idem. |
| Riviera Maya | idem | `FTP_PASS_RIVIERAMAYA` | prod | **Présent, non testé** | Idem. |
| Florida | idem | `FTP_PASS_FLORIDA` | prod | **Présent, non testé** | Build US incomplet (BUG-2026-002). |
| Deploy token rapide | `public/api/_deploy-secret.php` | `DEPLOY_TOKEN` | prod | **Présent** | Token généré, bloqué par .htaccess. |

---

## 9. Workers Cloudflare

| Worker | Fichier(s) | Secrets requis | Routes | État | Commentaire |
|---|---|---|---|---|---|
| b2b-api | `workers/b2b-api/index.js` + `wrangler.toml` | `SUPABASE_SERVICE_KEY`, `MOLLIE_API_KEY`, `MOLLIE_WEBHOOK_SECRET` | `/api/mollie*`, `/api/b2b*` (6 zones) | **Dégradé** | Routes gelées (token CF expiré, pas de scope Routes:Edit). Secrets à poser via `wrangler secret put`. |
| supabase-proxy | `workers/supabase-proxy/index.js` + `wrangler.toml` | `SUPABASE_SERVICE_KEY` | `/api/supabase*` (6 zones) | **Dégradé** | `SUPABASE_SERVICE_ROLE_KEY_v2` = historique uniquement (commentaire). |
| sg-payments | `workers/sg-payments/src/index.ts` + `wrangler.jsonc` | (SUPABASE_URL en var, pas de secret requis dans le fichier) | `api/mollie*`, `api/widget-token*`, `api/track-*`, `api/copernicus/forecast*`, `api/b2b-*`, `collect.php`, etc. | **Dégradé** | CRONs `0 * * * *` et `0 6,18 * * *`. KV TRANSIENTS. |
| outreach | `workers/outreach/index.js` + `wrangler.toml` | `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `FB_PAGE_TOKEN`, `ADMIN_KEY` | workers.dev (pas de route custom) | **Désactivé** | 3 crons, kill switches OFF, headhead nul (Workers Payé requis pour nouveau cron). |
| sargagame (worker principal) | `workers/sargagame/index.js` | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | — | **Dégradé** | `verify_subscription` retourne `payment_backend_not_configured` sans service key. |

> **Cloudflare** : `CLOUDFLARE_API_TOKEN` expiré (401). Le token CI n'a pas le scope `zones Workers Routes:Edit`. Toute modification de routage = action fondateur (dashboard CF ou token à jour).

---

## 10. Accès Supabase (nouvel état serveur, REST HTTP)

| Élément | Valeur | Type | État | Commentaire |
|---|---|---|---|---|
| URL | `https://rswdmjtdzrucqzzukfmd.supabase.co` | Publique (Project Ref) | **OK** | Déjà présente dans tous les wranglers + configs. |
| Clé service (service_role, RLS bypass) | `SUPABASE_SERVICE_KEY` | SECRET, serveur uniquement | **MANQUANT** (local) | Absent localement → `verify_subscription` = `lookup_failed`, mirror skip. Présent comme GH Secret + CF secrets (non lisibles depuis l'agent). |
| Clé service_role v2 | `SUPABASE_SERVICE_ROLE_KEY_v2` | Historique uniquement | **Exclu** | Présent uniquement dans commentaires `wrangler.toml` + debug logging `index.js`. Non utilisé par le code actif. |
| Tables | payment_grants + 10 onglets Sheets migrés | — | **À créer** | Nécessite SUPABASE_SERVICE_KEY (éditeur SQL Supabase). |

---

## 11. Google OAuth et Apps Script

| Élément | État | Commentaire |
|---|---|---|
| Google OAuth (projet sargagame-sheets, client ID …3fbb8brlqa3qfgv9q4ss08jeuum5vag3) | **Fonctionnel** | Token dans Windows Credential Manager (target `SargagameGoogleOAuth`). Scopes `spreadsheets.readonly` + `drive.readonly`. Testeur `yacovassaraf@gmail.com`. |
| Apps Script (Code.js, clasp push) | **BLOQUÉ** | DEC-2026-06-29 : jamais de nouvelle action Apps Script. Tout nouvel état serveur → Supabase. |
| Export script read-only (déployé) | **Déployé** | Nécessite consentement OAuth. |
| `sg-payments` vars GOOGLE_CLIENT_ID / AUTH_SECRET | **Non configuré** | Bouton Google masqué si absent (feature-off propre). |

---

## 12. Synthèse : état opérationnel par domaine

| Domaine | Opérationnel | Dégradé | Non opérationnel | Principal blocage |
|---|---|---|---|---|
| Paiements B2C Mollie | Non | Oui (code présent) | Non (webhook) | Clé test exposée + webhook secret absent |
| Paiements B2B Mollie | Non | Oui (code présent) | Non (webhook + mirror) | Webhook secret + service key |
| Stripe (legacy) | Non | Non | Oui | Clé live expirée |
| PayPal | Partiel (création) | Non | Oui (webhook) | webhook_id manquant |
| Emails transactionnels (Resend) | Non | Oui (clé présente) | Non | Clé non injectée dans mollie-config |
| Emails commerciaux (outreach) | Non | Non | Oui | Kill switches OFF, dry-run |
| Supabase (état serveur) | Non | Non | Oui (tables) | SUPABASE_SERVICE_KEY manquant |
| Cloudflare Workers | Non | Oui (routes gelées) | Partiel | Token CF expiré, pas de scope Routes:Edit |
| FTPS déploiement | Non | Oui (présent) | Non | Accès FTP non testés depuis l'agent |
| Google OAuth | Oui | — | — | Fonctionnel |

---

## 13. Accès nécessitant une intervention fondateur (liste consolidée)

| # | Accès | Action | Pourquoi | Priorité |
|---|-------|--------|----------|----------|
| 1 | Clé API Mollie TEST | Révoquer l'ancienne, créer une nouvelle, mettre à jour `MOLLIE_API_KEY` (GH secret) | Clé exposée (`test_HR4K...`) | P0 — bloquant |
| 2 | Secret webhook Mollie | Créer dans dashboard Mollie, mettre à jour `MOLLIE_WEBHOOK_SECRET` (GH secret + `mollie-config.php` sur chaque FTP) | Webhook fail-closed HTTP 503 sans | P0 — bloquant |
| 3 | Clé live Stripe | Renouveler dans dashboard Stripe, mettre à jour `stripe-config.php` | Clé expirée, 100% du MRR historique | P0 — bloquant (fondateur) |
| 4 | Secret webhook Stripe | Vérifier/recréer endpoint webhook, mettre à jour `stripe-config.php` | Signature v1 requise | P1 |
| 5 | SUPABASE_SERVICE_KEY | Fournir la valeur (GH secret + CF workers + `mollie-config.php`) | verify_subscription + mirror bloqués | P0 — bloquant (fondateur) |
| 6 | Token API Cloudflare | Renouvrer (401) + scope `zones Workers Routes:Edit` si modification de routes | Routes gelées, déploiement bloqué | P1 |
| 7 | Webhook ID PayPal | Créer dans dashboard PayPal, renseigner `paypal-config.php` | Fail-closed HTTP 500 | P1 |
| 8 | Clé Resend | Vérifier/injecter dans `mollie-config.php` et wrangler outreach | Emails transactionnels désactivés | P2 |
| 9 | Accès FTPS (6 régions) | Fournir ou vérifier serveurs/user/pass | Déploiement FTP | P2 |
| 10 | SMTP | Configurer `SMTP_PASS` + host | Alertes et automatisations | P3 |

**Une seule intervention fondateur est requise pour débloquer P0 (1-5). Après cela, les tests automatisés peuvent s'exécuter et le travail reprend automatiquement.**
