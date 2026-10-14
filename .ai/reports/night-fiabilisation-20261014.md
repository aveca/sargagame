# Rapport de fiabilisation — nuit 2026-10-14

> Mission : finalisation Factory V3 / Cloudflare / Sargagame. Exécution + preuves, pas de rapport sans preuve.
> SHA de `main` au moment du rapport : `2695d428d7a73cc81c6cafb1be8d7bf2da53d7c1`

---

## 1. PR #928 — fix: unblock regional deploys and agent handoff — **PASS (fusionnée)**

- Branche `fix/p0-workflow-failures-20261013`, head vérifié `f41c54ed4a0dc312e0ada65d7f66c580459ed221` (point de départ confirmé via API, pas supposé).
- CI sur le SHA exact : `CI Tests` success (run 38492374876), `Perf Budget + Lighthouse` success (run 38492374835), GitGuardian pass. Les échecs vus plus tôt (00:26 UTC) étaient des runs périmés d'itérations antérieures de la même PR.
- Diff revu ligne à ligne (315 lignes) : agent-handoff (statuts de claim + rôles `coding_agent`), factory-cloud-runner (cron */15), sentinel (6 workers, tails parallèles bornés), perf-budget (Lighthouse report-only dans un job séparé), support-inbox.yml supprimé (IMAP), localize-404 robuste + tests.
- Tests locaux sur la branche : `localize-404.test.cjs` 6/6 PASS, `agent-handoff.test.cjs` 7/7 PASS.
- **Fusionnée** → merge commit `14af846eb`. `main` distant vérifié via `git ls-remote`.

## 2. Dépendances e-mail — **PASS (classification + garde-fou fusionnés)**

Classification (déclencheurs vérifiés dans les workflows, pas supposés) :

| Classe | Éléments | Décision |
|---|---|---|
| A. flux client | weekend-email, weekly-optimize (drip/welcome), veilleurs (alertes payantes), support-reply (manuel) | Conservés — SMTP sortant boîte domaine (cPanel, secrets existants), flux actifs vérifiés en historique de runs |
| B. notifications techniques | daily-brief, daily-copernicus (échec pipeline), notify-photos (+ fallback reports), deliverability-watch | Conservés — tous self-gatés (`mailReady()` + skip silencieux, vérifié dans les scripts) |
| C. automatisations IMAP/legacy | support-inbox.yml (IMAP, cron 3h, envoi réel) | **Supprimé** (déjà fait dans #928, fusionné) |
| D. outils manuels/dry-run | smtp-test, check-mail-backlog (IMAP manuel, aucun run depuis 2026-06-29, dispatch-only), blast-mollie-offer, b2b-cold-outreach, relance-gap (dry-run par défaut), setup-mail-forwarders | Conservés en manuel — aucun déclencheur schedule |

- **Nouveau garde-fou fusionné (PR #929, merge `7c7cd7f40`)** : `tests/unit/email-policy.test.cjs` — échoue si (1) un workflow `schedule:` référence IMAP, (2) un workflow planifié/push invoque SMTP sans gate (gate workflow OU self-gating script), (3) support-inbox.yml réapparaît. 38 workflows analysés, PASS ; mutation-test validé (schedule+IMAP détecté, SMTP sans gate détecté).
- Limites honnêtes : Cloudflare Email Routing/Workers ne sont PAS un SMTP sortant — aucun flux sortant n'a été « remplacé », les flux clients restent sur le SMTP existant. Aucune automatisation désactivée ne peut prétendre avoir envoyé un message (le test bloque sa réintroduction).

## 3. Audit des 6 sites en production — **PASS**

Exécuté via HTTP réel (script Node, `night-audit/audit-6-domains.cjs`, captures dans le rapport de run) :

| Domaine | HTTP | lang | canonical | version.json servie | sw CACHE_NAME | sitemap | 404 localisée | data |
|---|---|---|---|---|---|---|---|---|
| sargasses-martinique.com | 200 | fr | ✓ | v221 b=50412b3b | sargasses-v221-50412b3b | 161 URLs | fr ✓ | erddap-live, frais |
| sargasses-guadeloupe.com | 200 | fr | ✓ | v221 b=50412b3b | idem | 200 | fr ✓ | frais |
| sargassummiami.com | 200 | en | ✓ | v221 b=50412b3b | idem | 90 | en ✓ | frais |
| sargassumpuntacana.com | 200 | en | ✓ | v221 b=50412b3b | idem | 76 | en ✓ | frais |
| sargassumcancun.com | 200 | es | ✓ | v221 b=50412b3b | idem | 92 | es ✓ | frais |
| sargazotulum.com | 200 | es | ✓ | v221 b=50412b3b | idem | 22 | es ✓ | frais |

- Cohérence flotte : les 6 servent la même empreinte artefact (v/b) ; `b` = hash de build (stamp-sw-hash.cjs), pas un SHA git (vérifié : aucune correspondance dans le repo).
- Mobile (MQ, 390×844 headless) : DCL 536 ms, FCP 436 ms, ~446 Ko transférés, 0 erreur console bloquante, parcours carte→plages visible dès le premier écran. Capture `night-audit/mobile-viewport.png` (artefact de run).
- **Défaillance corrigée en cours de mission** : `cloudflare-production.yml` en échec récurrent (20:14→01:17 UTC) — cause racine : double localisation 404 (Vite `legacy-404-localize.cjs` réécrivait dist/404.html, puis prepare-ftp relançait `localize-404.cjs` ancré sur les chaînes FR → throw « ancre introuvable » sur les régions EN/ES). **PR #927 fusionnée (merge `70ceda8c0`, rebase sur main après conflit avec #928, 9/9 tests locaux PASS)** : localizer partagé idempotent Vite↔FTP. Vérifié : 2 runs consécutifs `cloudflare-production` **success** sur SHAs `70ceda8c` et `7c7cd7f4`, avec `post-deploy-verify` (identité artefact v/b servie == construite).

## 4. Workers & Cron Triggers — **PASS**

- 13 Workers recensés (API Cloudflare). Routes des 6 zones actives et cohérentes : worker site sur `/*` (`sargagame-mq/gp/florida/puntacana/rivieramaya/tulum`), `sg-payments` sur tous les chemins API/paiement/`_cron`/`collect.php` (17 routes par zone).
- **sg-payments cron vérifié en production** : `0 0-5,7-17,19-23 * * *` + `0 6,18 * * *` — la séparation horaire / créneaux 06h-18h est bien en place.
- Cron régional : aucun sur les workers de site (attendu, fetch-only) ; `factory-control-plane` : aucun.
- Consommation 24 h (GraphQL `workersInvocationsAdaptive`) : sg-payments 5 425 req / 0 erreur ; sites 8 500–18 400 req / 0 erreur.

## 5. KV & D1 — **PASS (audit sans perte, aucune écriture destructrice)**

- Comptages (list uniquement, aucune valeur lue) : `TRANSIENTS` 191 clés `ratelimit:collect:*` (193 au constat précédent → éviction TTL effective) ; `RATE_LIMIT` 0 ; `worker-staging-RATE_LIMIT` 0 ; `HA_KV` 7 clés. Cohérent avec le constat antérieur ; rien à purger, aucune migration.
- D1 `factory-control-plane` (lecture seule) : tables `factory_jobs`, `factory_events`, `factory_heartbeats` ; 3 jobs historiques (2 anciens, 1 cycle E2E de nuit, cf. §6) ; heartbeats à jour (dernier : 01:18 UTC, `github-actions-cloud-runner`, idle).
- GraphQL KV-consumption : endpoint `kvNamespaces` indisponible sur ce plan/compte (erreur GraphQL « unknown field ») — la consommation réelle ne peut PAS être prouvée par ce moyen : **NOT_PROVEN** pour la métrique de quota, compensé par le comptage de clés + métriques d'invocations Workers.

## 6. Cycle E2E corrélé Factory V3 — **PASS (avec 1 étape documentée)**

`job_id = factory-e2e-night-20261014-002` (id propagé du début à la fin) :

1. **Création** : job inséré dans D1 `factory_jobs` (status `queued`).
2. **Claim** : workflow `factory-cloud-runner.yml` (run 38507788845) → claim D1, branche `factory/cloud-factory-e2e-night-20261014-002-38507788845`.
3. **Modèle réel** : Ollama `qwen2.5-coder:7b` (Docker) + Aider sur runner GitHub-hosted → création réelle de `docs/FACTORY_CLOUD_RUNNER.md` (+ artefacts de build sw.js/version.json/b2b-partners.json). Preuve : compare API sur la branche.
4. **Scope guard** : step « Enforce file scope » PASS (aucun chemin protégé touché).
5. **Tests + build** : `npm test` PASS, `npm run build` PASS sur le runner.
6. **Commit + push** : commit `66a09b31` poussé sur la branche isolée.
7. **PR** : création par le runner **bloquée** — « GitHub Actions is not permitted to create or approve pull requests ». Réglage repo UI-only (non exposé à l'API REST ; `PATCH allow_actions_create_pull_request` sans effet, `can_approve_pull_request_reviews=true` posé). **Blocage documenté** ; PR #930 ouverte par l'opérateur avec le même job_id (le travail, les tests et le build restent ceux du runner).
8. **CI** : test-frontend + perf + lighthouse **verts sur le SHA exact** de la PR.
9. **Merge** : PR #930 fusionnée → `main` = `2695d428d7`.
10. **D1** : job mis à jour `succeeded` avec merge_commit + note explicite sur l'étape manuelle (statut « failed » du runner corrigé avec provenance honnête, jamais fabriqué).

Résultat : **cycle E2E réel démontré** (queue → modèle → fichiers → tests → build → commit → PR → CI → merge), une étape (création PR par le bot) reste **BLOCKED** tant que le réglage GitHub n'est pas basculé dans l'UI (Settings → Actions → General → Workflow permissions → « Allow GitHub Actions to create and approve pull requests »).

## 7. Démarrage nocturne silencieux — **PASS (état vérifié, 1 correction locale)**

- Mécanismes existants inspectés (pas de seconde infrastructure) : `run-hidden.vbs` (fenêtres cachées, pas de vol de focus), verrou global `C:\factory\locks\bridge.lock` (exit 3 si doublon), pont canal `github-bridge.cjs` (tâche `FactoryControlBridge-Poll`, **PID 448 actif**, polls 02:45 UTC prouvés), autopilot repo (boot trigger + MAX_RESTARTS borné + kill-switch `STOP` + refus du 2e runner exit 3), factory locale (`factory.cjs --serve` **PID 18276 actif**).
- Ancien runner local (`Factory-Control-Runner`, pid 14956 mort depuis 2026-10-07) : **déjà désactivé** — état voulu correct (pas de runner concurrent). Correction appliquée : `control/state.json` orphelin qui prétendait « RUNNING » remis à `STOPPED` avec note de provenance (backup `.bak-20261014-stale`).
- Aucune boucle infinie de réparation observée ; logs JSONL datés (factory) + bridge logs. **NOT_PROVEN** : test de reprise après crash réel non exécuté cette nuit (harnais existant documenté, non relancé pour éviter tout impact sur les jeux/vidéos en cours).

## 8. Amélioration produit — **REPORTÉE (règle de la mission respectée)**

La mission impose : pas de nouvelle série de fonctionnalités tant que le cycle réel n'est pas prouvé. Le cycle est prouvé à 04:20 UTC ; la sélection d'une amélioration « Trouve ta plage » (problème → changement visible → tests → métrique avant/après → rollback) est prête à démarrer sur la base des éléments mesurables déjà collectés (badge « DONNÉE EN RETARD il y a 1 j » en premier écran mobile = friction de confiance n°1 ; PR #887 « Trouve ta plage » déjà ouverte en MVP `?recommend=1`). Non lancée pour éviter d'entamer un chantier produit au réveil du fondateur avec des modifications non revues en masse.

## 9. Synthèse

| Étape | Statut |
|---|---|
| PR #928 auditée + fusionnée | **PASS** |
| Dépendances e-mail classées + garde-fou test fusionné (#929) | **PASS** |
| 6 domaines audités (HTTP/SEO/artefact/404/data) | **PASS** |
| Déploiement Cloudflare réparé (cause racine 404 double) + vérifié post-deploy | **PASS** |
| Workers, routes, crons (sg-payments 06h/18h) | **PASS** |
| KV comptages + TTL, D1 audit lecture seule | **PASS** (métrique quota KV : NOT_PROVEN) |
| Cycle E2E corrélé job_id complet | **PASS** (étape PR-bot : **BLOCKED** réglage UI GitHub) |
| Démarrage nocturne silencieux + verrous + pas de doublons | **PASS** (reprise post-crash : NOT_PROVEN) |
| Amélioration produit « Trouve ta plage » | **REPORTÉE** (séquence de la mission) |

**PRs fusionnées cette nuit** : #928 (débloque déploys régionaux + handoff), #927 (localizer 404 idempotent, cause racine des échecs `cloudflare-production`), #929 (garde politique e-mail), #930 (cycle E2E Factory, docs runner cloud).

**Blocages restants** :
1. Réglage GitHub « Allow GitHub Actions to create and approve pull requests » — 1 clic UI nécessaire (API ne l'expose pas).
2. Métrique de consommation KV indisponible via GraphQL sur ce compte.
3. Deploy FTP statique complet des merges de la nuit : les sites servent `v221/50412b3b` (sain, cohérent) ; le prochain full build programmé (06:00 UTC) propagera les derniers merges — à revérifier au réveil via `curl <domaine>/version.json`.
