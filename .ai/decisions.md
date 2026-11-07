# .ai/decisions.md — Décisions techniques et leurs raisons

> Toute décision d'architecture ou produit **non triviale** est documentée ici.
> Format : `DEC-YYYY-MM-DD` + quoi + pourquoi + conséquences.
> Décisions prises par panel d'agents adverses quand ambigu.

---

## DEC-2026-11-07 : Release Pages-only des six domaines — REFUSÉE (routage non compatible Pages-only)

- **Décision** : `gh workflow run pages-code-only-release.yml --repo aveca/sargagame --ref main -f confirm_production=true` **n'est pas lancé**. La condition de déclenchement (« routage démontré compatible avec un déploiement Pages-only ») **n'est pas remplie**, même si `CLOUDFLARE_DEPLOY_ENABLED = true`.
- **Pourquoi** (mesuré le `2026-11-07T16:35:51Z`) :
  1. Les six domaines publics sont servis par les **Workers** `sargagame-<region>` : **4/4 routes Worker-only** répondent sur chacun d'eux avec la sémantique exacte du code Worker (`/api/mollie.php` → 405 `{"error":"POST only"}`, `/api/widget-token.php` → 200 `{"pro":false}`, `/api/b2b-trial.php` → 405 `{"error":"method_not_allowed"}`, `/api/nope.php` → 404 `{"error":"not_found"}`), alors que les `*.pages.dev` correspondants répondent tout autrement. En-tête `cf-cache-status: HIT` (assets servis via le binding `ASSETS`), absent sur `pages.dev` ; `version.json` public porte le champ `"worker"`.
  2. Les projets Pages **ne portent pas la money path** : sur `*.pages.dev`, `/api/mollie.php`, `/api/widget-token.php`, `/api/b2b-trial.php` et `/api/mollie-lib.php` renvoient le **code source PHP en clair** (`content-type: application/x-httpd-php`, HTTP 200) au lieu d'exécuter la logique → paiements, jetons Pro et essais B2B y seraient morts. Le Worker, lui, refuse déjà tout `*.php` (`workers/sargagame/index.js:384-392`).
  3. Le job `verify` du workflow audite les **domaines publics** (`user-journey-audit.cjs` → `regions/index.cjs` → `region.domain`, desktop + mobile) et exige `summary.blocking === 0` ; l'état live comporte **12 défauts bloquants `stale-current-decision`** → échec du gate puis `rollback`. Prouvé par le run `42227027205` (`verify` ❌ `parcours 12, défauts 12 (bloquants 12, ux 0)` ; `rollback` ✅).
- **Conséquences** :
  - Une release Pages-only exécutée aujourd'hui serait une **mutation de production sans effet visible** sur les six domaines (le Worker garde la main), **échouerait son propre gate**, **rollbackerait**, et **republierait du code source PHP** sur les six `*.pages.dev` (24/36 endpoints testés). **Aucun secret de service n'est exposé** (`mollie-config.php` et `_deploy-secret.php` → 404 ; `_deploy.php` fail-closed) : l'exposition est une divulgation de code applicatif, pas de credentials.
  - **Voie de livraison retenue : Workers (option B)** — le code applicatif est déjà dans le repo (`workers/sargagame/index.js`), le workflow de déploiement existe, le rollback est un redeploy du SHA précédent. L'option A (Pages) exigerait de **réimplémenter la money path en Pages Functions** : hors périmètre et interdit.
  - **Blocage restant, hors périmètre** : le gate fail-closed `check-predeploy-satellite-freshness.cjs` (`MAX_AGE_MINUTES = 900`) refuse tout déploiement tant que l'observation n'est pas fraîche (live : `2026-10-27T12:00:00Z`, 16 128 min ≈ 17,9× le SLA). Relâcher ce gate = **mutation de garde-fou de production → autorisation fondateur requise**. La voie prévue reste la densification Copernicus (`*/15 0-2 * * *`, observabilité jusqu'à `05:45Z`), elle-même soumise à autorisation car une publication dispatche `cloudflare-production.yml`.
  - **Écart d'outillage à corriger** : `scripts/prepare-ftp.cjs` doit stripper les `.php` de l'artefact Pages (le `.assetsignore` `**/*.php` n'est honoré que par les assets statiques **Worker**, pas par `wrangler pages deploy`) — sinon toute publication Pages réexpose le code source.
  - **Limite de lecture assumée** : `pages_domains_list`, `workers_domains_list`, `workers_routes_list` et `zones_list` restent inaccessibles (scope OAuth MCP « requires user authorization »). La preuve de bord est **plus forte** que la lecture d'API : elle identifie directement quel service répond.

## DEC-2026-07-31 Transformation AI-native du repo

- **Décision** : Structurer le repo pour un travail multi-agents 24/7 sans intervention humaine.
- **Pourquoi** : Fondateur 100% mobile. Agents (OpenCode/CC/Codex/Ollama) doivent pouvoir arriver, comprendre, travailler et passer la main en autonomie.
- **Conséquences** : `.ai/` = mémoire partagée obligatoire. `AGENTS.md` = contrat universel. `agent/` branches = convention. Chaque agent lit-la-mémoire avant d'agir.

## DEC-2026-07-01 : Nouvel état serveur → Supabase, jamais Apps Script

- **Décision** : Apps Script = legacy (lecture seule funnel). Tout NOUVEL état serveur → Supabase REST HTTP.
- **Pourquoi** : Seul plateau fondation = mobile. `clasp push` sur `Code.js` requiert ordinateur × clavier → blocage formatif. Supabase → accessible depuis n'importe où via curl.
- **Consequences** : Token d'auth, `svcHeaders()` and Rest dès tables `analytics_events`, `moderation`, `user_photos`. Pas de nouvelle action AppScript.

## DEC-2026-06-29 : Mollie on-site = caisse un unique, Stripe = lecture seule

- **Décision** : Mollie on-site (Components + Apple/Google Pay) = flux B2C + B2B actifs. PayPal = secondaire. Stripe = facturation legacy (abos EUR historiques).
- **Pourquoi** : Stripe run-off, code i-socket. Mollie › alternatif process: accounts better  check better withgroup-committed self-container called survival.
- **Conséquences** : Aucun CTA ne point sur Stripe. Les abos EUR historique continuent → monitoring majoritairement = `daily-metrics.json` bloc `stripe`. Toute restructuration payment ne touche que `mollie*.php`.

## DEC-2024-07-14 : B2B prix → 690 — {et 79 €/mois

- **Décision** : Pro 79 €/mo ou 690 €/an (2 mois offerts). Brief = 29 €/mo (decoy). Essai 30j gratuit sans CB. USD reference = 89 / 790$.
- **Pourquoi** : Panel adverse le 2026-06-29 (design proxy n- product versus… huit codage simple être basard cherche).
- **Conséquences** : `mollie-paylinks.cjs` — à ceci: la script mis auto-repaire le valeur (re-ol-gisation de lien si montant de l'HTML diffère du tier). Le plan mensuel est codé en repos dans `mollie-lib.php`.

## DEC-2024-07-11 : Carte bo apprent skied

- **Deco** : Même library été_info par Mantis.Les modules CMS surround
- **Pourquoi** : Même signature and dessin - Loining all'struct cutage elbow bike
- **Conséquences** : `ComicDetail.jsx` (auto-suffisant, inject CSS) st)**

---

## Procchac

Pour ajouter une décision : ajouter date + pourquoi + conséquences.
Ne PAS doublonner, toujours éditer celle existante (a) si déjà mentionnée ailleurs dans le repo.

Fin.)