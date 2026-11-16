# Runbook — « Diagnostic Sargasses Express » 49 € TTC (P0, attente autorisation fondateur)

> **Ce document n'exécute rien.** Rien dans ce fichier n'a été exécuté par l'agent : ni création de checkout Mollie, ni migration SQL, ni `wrangler deploy`, ni `wrangler secret put`, ni paiement réel, ni email. Ce runbook est le paquet d'autorisation à lire, compléter et signer avant toute mise en production.

## 0. Ce que ce parcours change

| Élément | Détail |
|---|---|
| Offre | `diagnostic_express` — Diagnostic Sargasses Express, **49,00 € TTC**, EUR, non récurrent, one-shot |
| Cible | Village de la Pointe / Pointe Faula (Martinique), beach `vauclin` (mq044) |
| Parcours | commande (checkout Mollie) → paiement → webhook `/api/mollie-webhook.php` → production PDF (Playwright Chromium) → livraison email (Resend, dry_run par défaut) → état `delivered` + trace `diagnostic_deliveries` |
| États commande | `pending_payment` → `paid` → `processing` → `ready` → `delivered` | `manual_review` (blocage) | `refunded` |
| Contrat montant | 49,00 € exact, comparaison `Number()` (PostgREST numeric), tolérance ±0,02 € (2 centimes) |
| Email/sector/establishment | requis dans les metadata Mollie |
| Webhook | `/api/mollie-webhook.php` (checkout) ; redirect `/?diagnostic_paid=1` |
| Idempotence | `deliveryIdempotencyKey(paymentId, documentSha)` = `diag-<paymentId>-<sha[:16]>` ; reprise auto et manuelle idempotente |
| Secrets | jamais lus/affichés/loggés ; transmis au process enfant par variable d'environnement uniquement |

## 1. Prérequis (tous bloquants, action fondateur)

- [ ] **Secret Worker `MOLLIE_API_KEY` resynchronisé** (LIVE, côté fondateur — jamais via l'agent). Preuve actuelle : `/api/mollie-mode` → `{"ok":true,"mode":"live","api_mode":"unauthorized"}` → 401 Mollie.
- [ ] **Aucun checkout 49 € vivant** : le checkout client `tr_V6ArjVDcsoDQwCgMHZNZJ` est `expired`, sans webhook, sans metadata → **recréation nécessaire** (action fondateur/autorisation).
- [ ] **Table `diagnostic_orders` absente en prod** : migration `009` à appliquer (autorisation fondateur) avant tout déploiement Worker.
- [ ] **Clé webhook Mollie configurée** sur le dashboard Mollie (URL `https://sargasses-martinique.com/api/mollie-webhook.php`, événements `payments.paid`, `payments.refunded`).

## 2. Fichiers livrés (non déployés, non mergés)

| Fichier | Rôle | Statut |
|---|---|---|
| `scripts/diagnostic/lib/order-state.mjs` | Machine à états pure, `validateDiagnosticPayment`, `decideDiagnosticWebhook`, `validateOrderRow`, `validateDiagnosticAmount`, `canTransition`, `nextProductionStatus`, `classifyDiagnosticKind` | testé (38 scénarios) |
| `scripts/diagnostic/lib/fulfillment.mjs` | Orchestration production/livraison idempotente (`fulfillOrder`) | testé (38 scénarios) |
| `scripts/diagnostic/lib/data-source.mjs` | `extractSnapshot`, `statusFromAfai`, seuils vigilance, fraîcheur 15 h | testé (38 scénarios) |
| `scripts/diagnostic/lib/mailer.mjs` | `createMailer` (Resend, `dryRun=true` par défaut), `buildDeliveryText`, `deliveryIdempotencyKey` | testé (38 scénarios) |
| `scripts/diagnostic/build-report.mjs` | Production PDF (Playwright Chromium, polices embarquées) | testé par CLI séparément |
| `scripts/diagnostic/create-checkout.mjs` | Création checkout Mollie 49 € + commande `pending_payment` (dry-run par défaut ; `--execute` exige `--confirm-live` en mode live ; annule le paiement si l'insertion Supabase échoue) | testé par `node --check` |
| `scripts/diagnostic/fulfill-order.mjs` | CLI production/livraison d'une commande | testé par `node --check` |
| `scripts/migrations/009_diagnostic_orders.sql` | Migration commande + livraison (PK `order_id`, RLS service_role uniquement, `unique(payment_id)`, check `amount = 49.00`) | **préparé, NON appliqué** |
| `tests/unit/diagnostic-express.test.cjs` | 38 scénarios (12 exigés + livraison unique + contrat artifact) | **38/38 OK** |
| `tests/unit/fixtures/diagnostic-express-snapshot.json` | Fixture réelle vauclin/Pointe Faula (afai 0.06, clean, confidence 75, score 88) | — |
| `workers/sg-payments/index.js` | Artifact live v411 (SHA `351DA951…`), catalogue `DIAGNOSTIC_PRODUCTS.diagnostic_express` = {49, EUR}, `validateDiagnosticAmount`, `validatePaymentForFulfillment`, `fulfillDiagnosticOrder` | commité dans `3872de344` (branche `agent/coding/sg-payments-live-411`), non déployé en production ; voir PROVENANCE.md §9 |

## 3. Procédure de déploiement (quand autorisée)

### 3.1 Migration 009 (base de données, avant tout déploiement Worker)

```bash
# Appliquer UNIQUEMENT sur fenêtre autorisée, après backup
# psql $DATABASE_URL < scripts/migrations/009_diagnostic_orders.sql
```

Vérification : `diagnostic_orders` existe, PK `order_id`, `unique(payment_id)`, check `amount = 49.00`, RLS activée (service_role uniquement).

### 3.2 Création du checkout 49 €

```bash
# Mode test (défaut) — aucun paiement, aucun secret affiché
node scripts/diagnostic/create-checkout.mjs \
  --email client@example.test \
  --establishment "Village de la Pointe" \
  --sector "Pointe Faula" \
  --island Martinique \
  --client-name "M. Test"

# Mode LIVE (exige --confirm-live ; crée un vrai paiement Mollie 49,00 €)
node scripts/diagnostic/create-checkout.mjs --execute --confirm-live \
  --email ... --establishment ... --sector ... --island ... --client-name ...
```

### 3.3 Déploiement Worker `sg-payments` (live v411)

```bash
# Déploiement manuel, jamais `--route`, jamais de secret en CLI
wrangler deploy --keep-vars
```

Le worker live v411 (SHA `351DA951…`, 175 082 o) porte le catalogue `diagnostic_express` et les garde-fous P1→P6/P8. Le repo `origin/main` est à SHA `11CD7F8E…` (180 083 o) ; le diff live↔dépôt est documenté dans `workers/sg-payments/PROVENANCE.md` §9.

### 3.4 Sondes HTTP + 6 domaines (post-déploiement)

| Sonde | URL attendue | Résultat OK |
|---|---|---|
| Mode Mollie | `https://<domaine>/api/mollie-mode` | `{"ok":true,"mode":"live",...}` (401 si clé non resync) |
| Création paiement | `POST /api/mollie-pay?pass=diagnostic_express` | 200, checkout 49,00 €, metadata présente |
| Webhook secret | configuré côté Mollie | réception `payments.paid` / `payments.refunded` |
| 6 domaines | `sargasses-martinique.com`, `sargasses-guadeloupe.com`, `sargassummiami.com`, `sargassumpuntacana.com`, `sargassumcancun.com`, `sargazotulum.com` | HTTP 200, bundle à jour |

## 4. Rollback

```bash
git revert <mauvais-commit> --no-edit
git push origin main
# Déclenche re-deploy auto → rollback en prod < 15 min
```

Pour le Worker uniquement : redéployer la version précédente (`wrangler deploy --keep-vars` sur le SHA de rollback). Les secrets ne sont jamais touchés par un rollback de code.

## 5. Reprise (idempotente)

- **Reprise automatique** : le webhook dupliqué sur une commande déjà `delivered` → `fulfill` idempotent, pas de second envoi (trace `diagnostic_deliveries` consultée avant envoi).
- **Reprise manuelle** : `node scripts/diagnostic/fulfill-order.mjs --payment-id <tr_…>` — régénère le PDF si absent, renvoie l'email une seule fois (clé d'idempotence stable), passe en `delivered` ou `manual_review` si blocage.
- **Paiement jamais perdu** : un paiement confirmé reste en `paid`/`processing`/`ready` jusqu'à livraison ; un échec PDF ou email bascule en `manual_review` (pas de perte, pas de double livraison).

## 6. Rapport final A→J — verdict

| Jalon | Statut |
|---|---|
| Tests unitaires 38/38 (aucun réseau/email/secret) | ✅ |
| Build `npm run build` exit 0 | ✅ |
| Budget bundle 206,9 Ko ≤ 210 Ko gzip | ✅ |
| Régions valides | ✅ |
| Smoke FUNNEL_REACHED | ✅ |
| Smoke ERRORS=[] | ⚠️ pré-existant (STALE_MAP_DECISION_LEAK + H1, défauts prod 2026-10-26, non liés) |
| Secret `MOLLIE_API_KEY` LIVE resynchronisé | ❌ bloquant (fondateur) |
| Migration 009 appliquée | ❌ bloquant (fondateur) |
| Checkout 49 € vivant (webhook + metadata) | ❌ bloquant (fondateur) |
| **Verdict final A→J** | **NOT READY** (3 blocages fondateur à lever avant tout déploiement/paiement/email) |

## 7. Opérations de lancement A–H (prêtes à exécuter dès levée des blocages)

> Rien de cette section n'a été exécuté par l'agent. Chaque étape précise la commande exacte, le résultat attendu et la méthode de rollback. Aucun secret n'est jamais affiché, loggué ni passé en CLI.

| Étape | Action | Commande exacte | Résultat attendu | Rollback |
|-------|--------|-----------------|------------------|----------|
| **A** | Vérifier le secret Mollie LIVE (sans afficher sa valeur) | `curl -s https://sargasses-martinique.com/api/mollie-mode` | `{"ok":true,"mode":"live","api_mode":"authorized"}` (jamais `"unauthorized"` ni 401) | Si 401/unauthorized : ne rien déployer, action fondateur pour re-provisionner `MOLLIE_API_KEY` |
| **B** | Appliquer la migration 009 (base, avant tout déploiement Worker) | `psql $DATABASE_URL < scripts/migrations/009_diagnostic_orders.sql` (fenêtre autorisée, après backup) | Table `diagnostic_orders` créée : PK `order_id`, `unique(payment_id)`, check `amount = 49.00`, RLS service_role uniquement | Restauration du backup / `DROP TABLE diagnostic_orders;` |
| **C** | Vérifier le webhook Mollie | Vérifier dashboard Mollie : URL `https://sargasses-martinique.com/api/mollie-webhook.php` ; `curl -s https://sargasses-martinique.com/api/mollie-webhook.php` | Endpoint joignable, URL configurée côté Mollie | Désactiver/supprimer l'URL webhook côté dashboard Mollie |
| **D** | Configurer les événements webhook | Dashboard Mollie : activer `payments.paid` et `payments.refunded` sur le webhook | Les deux événements actifs | Décocher les événements côté dashboard Mollie |
| **E** | Créer le checkout 49 € | Test (aucun paiement) : `node scripts/diagnostic/create-checkout.mjs --email test@example.test --establishment "Village de la Pointe" --sector "Pointe Faula" --island Martinique --client-name "M. Test"`<br>Live (fondateur uniquement) : `node scripts/diagnostic/create-checkout.mjs --execute --confirm-live --email … --establishment … --sector … --island … --client-name …` | Checkout 49,00 € EUR ; metadata `offer_kind=diagnostic_express`, `product=diagnostic_express`, `webhookUrl=/api/mollie-webhook.php`, `redirectUrl=/?diagnostic_paid=1` ; commande `pending_payment` insérée | Annuler le checkout côté Mollie (si créé) ; supprimer la commande de test en `pending_payment` |
| **F** | Déployer le Worker `sg-payments` (live v411) | `wrangler deploy --keep-vars` (jamais `--route`, jamais de secret en CLI) | Worker déployé avec catalogue `diagnostic_express` (v411, SHA `351DA951…`) | Redéployer la version précédente (`wrangler deploy --keep-vars` sur le SHA de rollback) |
| **G** | Vérifier HTTP endpoints + 6 domaines | `curl -s <domaine>/api/mollie-mode` et `curl -s -X POST <domaine>/api/mollie-pay?pass=diagnostic_express` pour chacun des 6 domaines | HTTP 200, `"mode":"live"`, checkout 49,00 € avec metadata ; bundle à jour | Voir étape F (redéployer version précédente) |
| **H** | Tester génération PDF, livraison idempotente, email | `node scripts/diagnostic/fulfill-order.mjs --payment-id <tr_…>` (email Resend en `dryRun=true` par défaut : aucun email réel) | PDF généré ; email en dry_run uniquement ; état `delivered` ; trace `diagnostic_deliveries` ; reprise sur le même `payment-id` = un seul envoi (idempotent) | Remettre la commande en `paid`/`processing` si nécessaire ; aucun email réel n'est envoyé (dry_run) |

## 8. Blocages fondateur (lever AVANT toute étape A–H)

| # | Blocage | Détail | Qui |
|---|---------|--------|-----|
| 1 | Secret `MOLLIE_API_KEY` LIVE désynchronisé | `/api/mollie-mode` → `api_mode: unauthorized`, 401 Mollie | Fondateur (re-provisionner le secret, jamais via l'agent) |
| 2 | Aucun checkout 49 € vivant | `tr_V6ArjVDcsoDQwCgMHZNZJ` expiré, sans webhook, sans metadata | Fondateur / autorisation (recréer le checkout) |
| 3 | Table `diagnostic_orders` absente en prod | Migration 009 à appliquer avant déploiement Worker | Fondateur (autorisation) avant étape B |

**Règles absolues** : aucun merge, aucun déploiement prod, aucun paiement réel, aucun remboursement, aucune bascule TEST/LIVE, aucun changement de prix sans autorisation, aucun email réel, aucun secret lu/affiché/loggé, jamais le client réel comme adresse de test. PR #1474 reste inspectable, non mergée.
