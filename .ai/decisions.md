# .ai/decisions.md — Décisions techniques et leurs raisons

> Toute décision d'architecture ou produit **non triviale** est documentée ici.
> Format : `DEC-YYYY-MM-DD` + quoi + pourquoi + conséquences.
> Décisions prises par panel d'agents adverses quand ambigu.

---

## DEC-2026-08-27 — TASK-P2-008b collect.php sous Cloudflare Pages — Worker sg-payments (option B)

- **Date/Heure UTC** : 2026-08-27 07:00 UTC
- **Contexte** : La vérification LIVE de P2-008 (fix `.htaccess` `AddHandler`, PR #613) a démontré que **les 6 domaines de production sont servis par Cloudflare Pages** (statique). Preuves : `npx wrangler pages project list` → `sargagame`/`sargagame-gp`/`sargagame-florida`/`sargagame-rivieramaya`/`sargagame-puntacana`/`sargagame-tulum` avec les 6 custom domains, re-déployés par le step 78 du workflow daily. Effets observés : `GET /collect.php` → 200 `application/x-httpd-php` + **source PHP exposé** (asset statique copié de `public/` vers `dist/` par Vite) ; `POST /collect.php` → 405 vide (comportement natif Pages sur POST statique) ; `.htaccess` inertiel (pas de SPA fallback, pas de 301 sur MQ). **Donc P2-008 (Apache) ne peut pas fonctionner en prod.**
- **Audit des 3 options** :
  - **A. Pages Function `functions/collect.php.ts`** — viable officiellement, mais ajoute une 2ᵉ couche compute (6 projets Pages à configurer, secrets `SUPABASE_SERVICE_KEY` à dupliquer sur 6 projets, logs/surveillance fragmentés). Complexité de déploiement supérieure, maintenance ×6 projets.
  - **B. Route Worker `sg-payments`** — le Worker est **déjà en façade des 6 zones** (36 routes `/api/*` actives). Bindings déjà provisionnés : `TRANSIENTS` (KV, rate-limit existant via `rateLimit()`), `SUPABASE_SERVICE_KEY` (secret présent, vérifié via `wrangler secret list`) + helpers `supa()`/`cors()`. 1 seul codebase server, 1 seul déploiement (`wrangler deploy`), rollback = retirer 6 lignes de routes + 1 handler. Les routes Worker interceptent **avant** les assets Pages sur le même hostname → masquant l'asset statique (GET → 405 sans source) même en attendant le re-deploy Pages.
  - **C. Endpoint existant** — aucun endpoint actuel (`track-*`, `b2b-*`, `mollie*`) ne porte le contrat (POST-only, 204, beacon same-origin). Rejeté.
- **Décision** : **Option B retenue**. Route `<domaine>/collect.php` × 6 dans `workers/sg-payments/wrangler.jsonc` + handler `handleCollect()` dans `src/index.ts`. **`public/collect.php` supprimé** du repo (dead code : PHP jamais exécuté sous Pages ; sa présence = leak permanent sur les domaines ET sur `*.pages.dev` et les origines FTP legacy). Le contrat utile migre dans le Worker.
- **Contrat préservé (parité `collect.php` PHP)** :
  - POST-only : toute autre méthode → **405** vide, header `X-Content-Type-Options: nosniff`
  - Origin/Referer : host présent mais étranger → **403** ; absent des deux → toléré (parité PHP, ne jamais perdre une mesure légitime). Allowlist = 6 domaines (5 historiques **+ sargazotulum.com**, absent de l'allowlist PHP mais domaine live du produit — la collecte tulum était droppée 403 par le PHP, elle est restaurée)
  - Corps JSON capé **64 Ko** (au-delà → 204 drop silencieux ; PHP : lecture tronquée → decode KO → 204, sémantique équivalente)
  - `vh` = sha256( jourUTC | ip | ua )[:16] — anonymat quotidien inchangé (pas de sel serveur : la PHP n'en utilisait pas non plus pour le hash, le `.statskey` servait à `stats.php`)
  - Rate-limit **60 hits / 60 s / vh** via KV `TRANSIENTS` (remplace les compteurs fichiers `sg-data/rl/`) — drop silencieux **204** (jamais 4xx/429 : le client stash + rejoue sur non-2xx → éviter l'amplification)
  - Cap global ~quotidien (remplace le cap disque 25 Mo/j) : compteur KV `collect:day:<YYYY-MM-DD>` TTL 48 h, plafond **5000 inserts/j global** → 204 au-delà
  - Succès → **204 No Content** (fire-and-forget, jamais de body)
  - Stockage : insert Supabase `analytics_events` `{event:'sg_session', params:{vh, d:<payload>}, island:<region|host>}` via `ctx.waitUntil(supa(...))` — **doctrine respectée** (aucun état serveur hors Supabase ; purge >90j déjà assurée par le workflow)
- **Conséquences** :
  - Frontend **inchangé** (`SG_COLLECT_URL="/collect.php"` same-origin, sendBeacon POST + fetch fallback) — aucun impact bundle (0 octet)
  - Source leak : éliminé immédiatement après `wrangler deploy` (route intercepte) — et définitivement après re-deploy Pages (fichier supprimé)
  - **Effet de bord à documenter** : `public/stats.php`, `public/ground-truth.php`, `dist/_deploy.php` restent exposés en source sous Pages (hors scope P2-008b — à traiter dans une tâche sécurité dédiée)
  - Rollback : `git revert` + `wrangler deploy` (routes + handler) ; le fichier PHP est dans l'historique git
  - Dépendances : aucune nouvelle
  - Ancien sink `sg-data/` sur FTP : abandonné (Pages n'a pas de disque) ; la collecte Supabase est désormais la source unique — **le funnel Supabase (P1-013) n'est pas impacté** (sink séparé, `logAnalyticsEvent`)

---

## DEC-2026-08-28 — TASK-P1-014 FTPS / CI-CD — FAIL VISIBLE, SECRETS ROTATED

- **Date/Heure UTC** : 2026-08-28 14:25 UTC
- **Contexte** : Run 33038263230 (27/08) `FATAL: 530 Login authentication failed` sur MQ/GP/RM (secrets GH `FTP_*` périmés, last update 2026-04-13/2026-06-10) masqué par `continue-on-error: true` sur `Deploy FTPS toutes régions` → job `SUCCESS` à tort. Credentials `.env` locaux 5/5 `CONNECTED` (basic-ftp) prouvent que les secrets GH sont stale, pas l'infra FTP.
- **Audit workflow** : `daily-copernicus.yml` — FTPS `Deploy FTPS` = **critique** (5 régions live `live:true` MQ/GP/FL/PC/RM → `FAIL` doit faire `FAIL` le job) ; `Provision fast path` et `Deploy Pages` = **non critique** (`continue-on-error: true` conservé, idempotent/fallback). `health-check` final ne masque plus l'erreur (était `::warning` seul).
- **Décision** : (1) Retirer `continue-on-error: true` sur `Deploy FTPS` (commit `d50b32f3`/`b0b05f67` rebase) → `exit 1` visible ; (2) Ajouter step `Assert FTPS deploy succeeded for live regions` qui check `steps.ftp_deploy.outcome == failure → exit 1` (régions `live:false` barbados/tulum ignorées par `manual-ftp-deploy` `skip` → `exit 0`) ; (3) Rotation immédiate `15` GH secrets `FTP_*` depuis `.env` officiel (`tmp-rotate-ftp.cjs` `gh secret set` 15/15 OK, `gh secret list` 15/15 présents, `Tulum`/`Barbados` absents = non critique).
- **Conséquences** : `DEPLOY SUCCESS = tous les déploiements LIVE obligatoires ont réussi`. Un `530` ou timeout 120m (USD instable) → `FAIL` visible, `retry-on-failure` schedule-only (1 retry) reste. `health-check` final ne peut plus masquer. Prochain run `daily-copernicus` validera `5/5` FTPS + `5/5` Pages + Worker `a2d8512a`.
- **Rollback** : `git revert` du commit workflow + `gh secret set` depuis `.env` (re-rotation).

## DEC-2026-08-28 — TASK-P2-009 MQ DCL 3072ms — NO CODE CHANGE (NOT REPRODUCIBLE)

- **Date/Heure UTC** : 2026-08-28 15:00 UTC
- **Contexte** : Audit `22:30 UTC` 6 domaines `MQ 3072ms` `requestStart 2830` vs `GP 327` `99` — hypothèse `5 preloads as=fetch` en compétition avec module critique. Re-mesure `28/08` `tmp-perf-measure.cjs` (Playwright chromium, iPhone 12, `domContentLoaded` via `navigation` timing): sequential same-context MQ `3137` `2830` (1st nav cold) vs isolated fresh-browser MQ `372` `98`, GP `337`, 5 runs MQ `334-395` — variance normale. HTML size 35-41 Ko, `transfer 16Ko`, preloads 8 identiques (`sargassum`, `beaches-list`, `images`, `quality`, `weather`, 2 fonts, `region-outlines`), `fetchpriority` `null` tous.
- **Décision** : `NO CODE CHANGE` — anomalie non reproductible, pas de root cause code (cold-start / transient server STALE `33.8h` / deploy running vs `beaches-images→prefetch` non prouvé). Risque régression carte > gain hypothétique. Si récidive, mesurer en CI avec `web-vitals` + `performance` nav timing sur `origin/main` frais.
- **Conséquences** : `index.html` inchangé (5 fetch preloads), `vite.config.js` `region-outlines` inchangé, `build` `35.5 Ko` inchangé. Monitoring `DCL` via `playwright` fresh-browser si re-rapport.

## DEC-2026-08-27 — TASK-P1-013 Monitoring conversion post-fix #605 — WORKING BUT INSUFFICIENT SAMPLE

- **Date/Heure UTC** : 2026-08-27 04:00 UTC
- **Commit main utilisé** : `8016ffcdcb62982074ea289782f322f6c0819b39` (PR #608 merged, instrumentation `sg_session_id` live depuis 2026-08-27T03:17Z)
- **Fenêtre observée** : 2026-08-25T18:50Z (déploiement #605 `a2e2740e`) → 2026-08-26T20:03Z (dernier `daily-metrics.json`/`funnel-daily-report.json`). Distincte de P1-006 (fenêtre pré-25/08).
- **Fix #605** : `mollie.php:194-199` + `workers/b2b-api/index.js` : omettre `method` quand `cardToken` présent (avant : `method`+`cardToken` → rejet Mollie `method=null` → page sélection → expiry).
- **Volumes post-fix (réels, non estimés)** :
  - 2026-08-25 : CTA `75` (Supabase `pass_cta`), `onsite_checkout_opened` `69`, `mollie_checkout_redirect` `0`, `conversion` `0`, `payment_failed` `1` (24h `funnel-daily-report`), Mollie `paid {}` (30j), `lastPaidAt 2026-07-19T03:46:26Z` (38j sans paid)
  - 2026-08-26 : CTA `5`, onsite `5`, mollie `0`, conv `0`, paid `{}`
  - Cumul 25-26 : CTA `80`, onsite `74`, mollie `0`, conv `0`, paid `0`, grants `0` (Supabase `payment_grants` non interrogé direct, déduit via `daily-metrics.mollie.paid` + `funnel-snapshot` `total_rows 11260` / `since 2026-08-19`)
  - Taux : `CTA→onsite 92.5%` (74/80), `onsite→mollie 0%` (0/74), `mollie→paid 0%`, `CTA→conversion 0%`
- **Avant #605 (19-24/08)** : `funnel-snapshot` 7j (19-26) `pass_cta 150`, `onsite 74` (dont 74 post-fix), `mollie 0` ; `daily-metrics` 19-24 : CTA `4,18,4,0,48,0` (total 74), `onsite` non tracké (`None` avant 25/08), `mollie 0`, `paid {}`. Comparaison statistique sérieuse impossible : métrique `onsite` inexistante avant, fenêtre 25/08 straddle le déploiement (18:50 UTC), et 26/08 n'a que 5 CTA.
- **sg_session_id** : Instrumentation `sgUid()` → `analytics_events.params.sg_session_id` + `payment_grants.session_id` + `workers grantB2C session_id` livrée PR #608 (8016ffcd) **après** fenêtre 25-26 (merge 27/08 03:17Z). Donc `NULL` pour tous les événements 25-26 (`funnel-daily-report` 24h `since 2026-08-25T20:03Z` ne contient pas `sg_session_id`). Corrélation `analytics_events↔payment_grants` possible uniquement à partir du 27/08, volume post-merge encore `N/A` (0-5 CTA).
  - Limite : impossible de joindre `sg_pass_cta`→`grant` pour 25-26 ; diagnostic `onsite→Mollie` reste sur comptes agrégés, pas sur session.
- **Mollie evidence** :
  - Source primaire : `scripts/automation/data/daily-metrics.json:2026-08-26` `mollie: {windowDays:30, paid:{}, lastPaidAt:"2026-07-19", fetchedAt:"2026-08-26T20:03:09Z"}` (généré par `mollie-aggregate.cjs` via Mollie API `payments` filtré `status=paid`, 30j). 0 paid sur 30j = 0/80 CTA post-fix.
  - Secondaire : `funnel-snapshot 7j` `mollie_checkout_redirect 0`, `conversion 0`, `payment_failed 1` (1 échec onsite → Mollie non confirmé).
  - Non vérifié : logs `/api/mollie.php` `payment_status`, `payment_grants` direct Supabase (clé service non disponible localement) → `N/A — donnée indisponible` pour détail `paymentId`/`session_id` des tentatives 25/08.
- **Gate minimum (21 CTA + 1 Mollie onsite)** : 25/08 `75 CTA` ✔ mais `0 Mollie` ✘ → gate **non satisfait** pour `FUNNEL NO LONGER STRUCTURALLY ZERO`. 26/08 `5 CTA` ✘ → échantillon insuffisant.
- **Décision** : Verdict `WORKING BUT INSUFFICIENT SAMPLE` (pas `HEALTHY`, pas `STILL BROKEN` définitif). Code #605 correct (payload `method` omis quand `cardToken` — vérifié `git show a2e2740e` + `public/api/mollie.php:194`), mais fenêtre post-fix pleine (26/08) n'a que 5 CTA, trop peu pour prouver `0%` = panne structurelle vs drop-off normal. Le `0%` du 25/08 (75→0) est suspect et justifie **investigation ciblée** mais est contaminé par heures pré-fix.
- **Conséquences** :
  - Aucun code modifié (garde-fou Mollie on-site).
  - Créer tâche `TASK-P1-014` si une rupture est démontrée sur fenêtre 27-29/08 avec `sg_session_id` (investiguer chaîne `CTA→checkout→API→Mollie→paid→grant` pas à pas si `onsite_to_mollie` reste `0` malgré `≥21 CTA/j`).
  - Prochaine action : monitorer 27-29/08 avec `sg_session_id` (au moins 48h, ≥21 CTA cumulés) pour atteindre gate `B` ; si `onsite_to_mollie` reste `0` sur 2 jours pleins post-`sg_session_id`, passer en `D STILL BROKEN — INVESTIGATION REQUIRED` et localiser étape (frontend `cardToken`? `payReadyRef`? Worker `cardToken` forward? Mollie `paymentId`? webhook `grant`?).

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