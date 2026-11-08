# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

---

## Récemment complété
- [x] P0 - Mission AUTOPILOT #1356 `SARG-P0-B2B-PROSPECTS-CONCIERGE-API-AUTH-20261107` : **revue de sécurité complète de la PR #1358** (`fix/p0-retire-unauthenticated-b2b-handlers`, head `27042c82e66f1cb0f1becc9ac087398bf2312fb0`) qui retire les handlers B2B `b2bProspects`/`b2bConcierge` non authentifiés du Worker `sg-payments` (diff : 2 fichiers, worker **+5/−77**, les deux routes → **HTTP 410 `endpoint_retired`**, `no-store`, sans CORS). **0 appelant** de `/api/b2b-prospects.php` et `/api/b2b-concierge.php` dans tout le dépôt (aucun script, aucun workflow, aucune vérification prod) → aucun flux légitime cassé. **6 flux régionaux** : routage `/api/b2b-*` → `sg-payments` documenté **vérifié live**, garde `*.php` → 404 conservée côté Worker régional, 410 uniforme sur les 6 zones. **Revalidation delta** : code **déployé** relu en lecture seule → le défaut est **toujours en production** (`endpoint_retired` = 0) ; correspondance SHA établie **par hash** (déployé = `origin/main` = `18cb16d7`, 123 556 o / FNV-1a `9f47d8dd`) → c'est le **déploiement** qui a changé, pas le code. Gate de ship local **vert** : build exit 0, budget **206,7/210 Ko**, `npm test` **180/180**, smoke **4 tokens**, `deploy-audit` PASSED, CI PR **4/4**. PR #1358 **laissée NON fusionnée et NON déployée** (garde de l'issue + `humanGate: true`). Aucun accès live, aucune PII lue, aucun email, aucun paiement, aucune mutation prod (@security_agent, 2026-11-08).
- [ ] P0 - **Déploiement de #1358 bloqué sur arbitrage propriétaire** : `workers/**` n'est **PAS** dans `on.push.paths-ignore` de `cloudflare-production.yml` → **un merge déclencherait `Deploy Worker` + `Configure Worker secrets` en production**, ce que #1356 interdit. Le défaut reste donc **présent en production** tant que le propriétaire n'a pas approuvé le SHA `27042c82e66f1cb0f1becc9ac087398bf2312fb0`. — sévérité **P0** — action : approbation explicite du SHA par le fondateur, puis merge + vérification post-déploiement.
- [ ] P0 - **B2B : 4 endpoints frères encore exposés sans authentification** — `b2b-contacts.php`, `b2b-events.php`, `b2b-scores.php`, `b2b-forecast-delivery.php` (GET `select=*` + POST/PATCH arbitraires via `service_role`, RLS contournée ; `b2b_contacts` contient de la PII). Même classe de défaut que `b2b_prospects`/`b2b_concierge`, **hors périmètre de #1356** → PR distincte à créer (@security_agent, 2026-11-08).
- [ ] P0 - **B2B : `b2b-create-checkout.php` non authentifié sur le chemin argent** — crée un **client + un abonnement Mollie réels** et écrit `b2b_payments`, sans contrôle d'identité ni vérification préalable du prospect/concierge. #1356 impose une **PR distincte** ; aucun appel live n'a été fait pour l'examiner (@security_agent, 2026-11-08).
- [x] P0 - **La boucle Factory PRODUIT** : premier agent local réellement exécuté (exit 0) + **2 défauts de supervision corrigés** (@coding_agent, 2026-11-08, branche `agent/coding/factory-multirepo-bridge-20261107`, PR **#1364** CI 4/4 verte sur le head `5cc35f23b`, NON mergée). Défaut #11 : **heartbeat muet pendant les cycles longs** — lock/`status.json`/healthchecks n'étaient rafraîchis qu'aux frontières de cycle, donc pendant les 25 min d'un cycle agent, `status.json` affichait un heartbeat vieux de **674 s** (mesuré) et le dead-man's switch ne recevait aucun ping (un opérateur pouvait arrêter le runner au moment où il produisait du travail) → `writeStatusSnapshot()` factorisé + **gardien de vie** par cycle (60 s), arrêté en `finally` ; le lock n'était jamais en danger (`lib/lock.cjs` fail-closed sur pid vivant). Défaut #12 : **échec d'agent non diagnostiquable** — `implement.cjs` ne gardait que stdout alors que le CLI OpenCode écrit les appels d'outils sur stderr, et le motif de parcage ne mentionnait pas l'agent → `agentLog` garde stdout **et** stderr, le parcage porte un extrait de la trace ; **scope-guard inchangé**. Limite honnête documentée (BUG-2026-013) : le modèle local `qwen3.5-uncensored-aggressive:9b` **corrompt les chemins** (`tests/u nit/` au lieu de `tests/unit/`) → écrire à côté de la cible, scope-guard refuse le no-op (correctement) ; le routeur préfère déjà `*-coder`, donc **installer un modèle `*-coder` suffit, sans modification de code**. Garde-fous : +6 assertions (heartbeat) et +3 (diagnostic) ; le garde du heartbeat **prouvé** capable de détecter sa régression (dépôt recopié, `runner.cjs` amputé, vrai test rejoué → échec sur l'assertion exacte). `npm test` **179/183** dont **4 échecs PRÉEXISTANTS** (identiques à `origin/main`). Neutralité production : fichiers **déjà** exclus file-by-file du `paths-ignore`.

- [x] P0 - **Boucle Factory V3 activée en PERSISTANCE sur le PC du fondateur** + **10 défauts d'exécution corrigés** (@coding_agent, 2026-11-08, branche `agent/coding/factory-multirepo-bridge-20261107`, PR **#1364** CI 4/4 verte, NON mergée). Activation sans droit admin via **`HKCU\...\Run`** (la tâche planifiée `SargagameAutopilot` est **impossible** : `Register-ScheduledTask` **et** `schtasks /create` → « Accès refusé », session non élevée) ; kill-switch `sargagame-autopilot-disable.cmd` ; checkout runner dédié `C:\Users\user\sargagame-runner`. **Prouvé en conditions réelles** : runner vivant + lock + heartbeat, `status.json` écrit, arrêt propre → redémarrage, statuts `imported/started/blocked` publiés sur #1362/#1357/#1345/#1338/#1341, agent local `exit 0`. Défauts corrigés : **`lib/notify.cjs` jamais commité** (MODULE_NOT_FOUND avant le 1er cycle) · **trace perdue** (verrou exclusif `cmd.exe` → EBUSY avalé) · **`paths.statusFile` inexistant** · **`manualOpencodeSessionActive()` absente** · **contrat de mission sans `type`** · **AHA `'n/a'`** · **instantané d'état mensonger** (`autoMergeEnabled` codé en dur, `cycleSuccess` toujours `false`) · **code de sortie non nul non compté** (`consecutiveErrors`) · **boucle infinie** (opportunités jamais persistées → parcage NO-OP → même candidat re-sélectionné toutes les 30 s, 0 travail) · **agent local jamais démarré** (credentials cloud hérités → refus `exit 3` ; provider `ollama` absent d'OpenCode 1.18.34). 3 nouveaux garde-fous dédiés ; `npm test` **179/183** dont **4 échecs PRÉEXISTANTS** (reproduits sur `origin/main` = feux rouges de la mission #1362). Neutralité production : `paths-ignore` strict fichier par fichier étendu. Aucun Worker/secret/paiement/prix/donnée/interface touché. **RESTE OUVERT** : PR #1364 à merger puis rebasculer le checkout runner sur `origin/main` ; missions parquées « Scope fichiers manquant » ; `pngjs`/`pixelmatch` absents de `package.json` (gate visuel degradait en toujours-pass) ; mission B2B P0/P1 non commencée dans ce cycle.

- [x] P0 - Pont multi-dépôt **réellement branché** dans la boucle Factory locale (`runner.cjs` charge `multi-repo-bridge.cjs` et appelle `ingestMultiRepo()` ; le pont livré en PR #1349 n'était **jamais exécuté**). Statuts de cycle de vie `started`/`completed`/`blocked`/`failed` publiés par l'orchestrateur **sur l'issue source** (jamais bloquants, jamais en `--dry`). **Défaut corrigé** : les missions relayées étaient re-relayées à chaque cycle (commentaires `imported` republiés en continu) → trace durable `queue.relayed` bornée à 200. `paths-ignore` strict étendu à `runner.cjs`/`orchestrator.cjs` → un push `main` ne redeploie pas le Worker. Preuves : 37 assertions déterministes (nouveau test), pont #1349 non-régressé, `npm test` **176/180** dont **4 échecs PRÉEXISTANTS** reproduits sur `origin/main` (les feux rouges de la mission #1362). **État PC vérifié** : runner mort depuis le 2026-10-22, tâche `SargagameAutopilot` absente, PID 15072 = superviseur Python `f3.py` (pas le poller de ce dépôt), `Factory-Control-Runner` = pont par labels du canal privé. Aucun Worker/secret/paiement/prix/donnée touché.

- [x] P0 - Mission AUTOPILOT #1337 `FACTORY-MULTIREPO-MISSION-RELAY-20261106` : pont autopilot **multi-dépôt** livré et fusionné (PR #1349, merge `87702066a79c03ff930500a2bad524df58c1f6f7`, head `8c34d6ce9`). Allowlist fermée `aveca/sargagame` + `aveca/bot-wow` ; **routage strict** (une mission de l'autre dépôt est **relayée**, jamais enfilée localement — symétrie prouvée : le même pont, dans le checkout BOT-WOW, y enfile les missions BOT-WOW) ; **idempotence** par `repo + issue + task_id` compatible avec la clé historique de `bridge.cjs` (aucun double import) ; statuts GitHub corrélés `imported/started/heartbeat/blocked/completed/failed` + CLI `--status` (échecs de publication **comptés**) ; 57 assertions déterministes sans réseau + mutation check des 5 garde-fous centraux ; dry-run bout-en-bout non mutant. **Neutralité production vérifiée** : exclusion `paths-ignore` stricte fichier par fichier (PAS de `scripts/autopilot/**` en bloc : la production appelle `check-predeploy-satellite-freshness.cjs`, `check-prepared-html.cjs`, `html-integrity.cjs`, `post-deploy-verify.cjs`) + garde-fou de non-regression ; **aucun run `cloudflare-production.yml` créé** (437 → 437). PR #1342 **fermée sans merge** (superseded), PR #1343 **laissée ouverte** (preuve de dry-run). Acks `imported`/`started`/`completed` publiés sur #1337 (le `completed` par la CLI livrée, depuis `main`).
- [x] P0 - Mission AUTOPILOT #1336 `SARG-PAGES-CODE-ONLY-RELEASE-20261106` : **terminée en `failed`** — la release code-only des six domaines est **impossible via Pages** (les 6 domaines publics sont servis par les **Workers** `sargagame-<region>`, les 6 projets Pages n'ont **aucun domaine personnalisé**). Gate de release corrigé et fusionné (#1339, #1340) ; re-déploiement Pages-only `42227027205` : `gate` ✅ / `prepare` ×6 ✅ / `deploy-pages` ×6 ✅ / **`verify` ❌ (12 défauts `stale-current-decision`)** / **rollback ✅** ; production vérifiée **intacte** (6/6 HTTP 200, `b: df18df5d`, payload scientifique identique, Workers non redéployés, secrets inchangés). **Cause racine Copernicus RECORRECTÉE** : ce n'est **pas** une latence de source (cellule jour D publiée **avant** l'échéance SLA, **prouvé 10 fois sur 10**, âge 840–900 min ≤ 900) mais la **cadence de sonde** (aucune livraison planifiée dans `D+1 00:00Z–03:00Z` du 28 oct au 6 nov ; exception unique le 3 nov à 00:49Z, âge 771 min → `FRESH_AND_PUBLISHED`, commit `1583c36d4`) → 14 échecs consécutifs. Correctif **préparé, chiffré, NON mergé** (une publication réussie dispatche `cloudflare-production.yml` → `Deploy Worker` + secrets). **SLA 900 min inchangé, gate fail-closed, ERDDAP = source unique jamais remplacée.**
- [x] P0 - Cycle 4 fulfillment Mollie : correction des défauts de revue (coupure historique `p7` serveur-side sur `createdAt`, logs sans paymentId via correlation id aléatoire, backfill fail-closed avec endpoint chargebacks paginé + rapport sans PII + APPLY à double confirmation) (@coding_agent, 2026-11-04, branche fix/p0-mollie-fulfillment-review, commits c294d11c8 + merge main, 71 nouveaux tests, PR #1274 **draft, non mergée**). RESTE OUVERT : routage Cloudflare, déploiement du Worker régional, exécution autorisée du backfill pour les 6 ventes encore non livrées.
- [!] P0 attribution funnel — PR #1255 Draft, head `f1648ac1d3f3f83bfa6123f8bd3aaaa0d0e19642`; implémentation consent-gated Supabase-only, mais CI bloquée à `215067/215040` bytes gzip (+27). Aucun merge/deploy tant que budget + revue privacy sont verts. Optimisation minimale demandée à Codex.
- [~] P0 mesure funnel — corrélation session anonyme sur les événements Supabase du parcours B2C Pass (réutilise `sg_sid` sessionStorage, payload Supabase only ; ne pas envoyer à GA4/Apps Script ; aucun changement checkout/prix). Branche `fix/funnel-session-correlation-20261104`, commits `312ec135` + `ccbb80e`. En attente CI (build + budget 210 Ko) et revue privacy/consent avant merge/deploy.

- [x] P0 (P0.67 §4) - Purge analytics fail-closed : le cron supprimait par défaut, sans identité ni preuve (@coding_agent, 2026-11-04, branche fix/outbound-purge-safety-20261104, Draft PR #1252, commit dff18e28f, CI 139/139, 22+17 assertions, falsification CAUGHT). Orchestration + script : dry-run par défaut, `--execute --approved-by=` exigé, `--days` plancher 90, `return=representation` recoupé `content-range`, re-comptage post-boucle.
- [x] P0 (P0.67 §1) - Garde-fou identifiants secrets : scanner 6 règles + 14 sondes, CI 139/139 scanned=971 findings=0 ; bug latent d'offset CRLF corrigé (@coding_agent, 2026-11-04, branche fix/payment-hardcoded-credential-guard-20261103, Draft PR #1247, head 3dc30d7e). Branche en retard sur main (2 fichiers de test absents) : rebase avant merge. RESTE OUVERT : source autoritaire sg-payments absente du dépôt.
- [x] P0 (P0.67 §5) - Fraîcheur avant paiement SOS : `handleBuy` n'émet plus track/POST mollie si `observationCurrent !== true` ; CTA maintenu actif + blocage explicite (@coding_agent, 2026-11-04, branche fix/sos-mollie-freshness-gate-20261103, Draft PR #1243, head 0fe85fb3, CI 4/4 SUCCESS, dernier run CI 139/139). Branche en retard sur main (2 fichiers de test absents) : rebase avant merge.
- [x] P0 (P0.67 §7) - Régression main : regex de chemin natif dans region-seo-methodology-scope.test.cjs (@coding_agent, 2026-11-03, branche fix/region-seo-native-path-regex-20261103, PR #1244 MERGEE, merge 7f0413d0).
- [ ] P0 (P0.67 §2/§3) - **BLOQUÉ, autorisation fondateur requise** : SLA de fraîcheur en rupture sur les 6 régions. **Cause racine mesurée et RECORRECTÉE le 2026-11-06** : ce n'est **PAS** une latence de la source mais la **cadence de sonde** — la cellule ERDDAP du jour D est publiée **avant** l'échéance SLA (D+1 03:00Z), **prouvé 10 fois sur 10** (19→27 oct, âge observé 840–900 min ≤ 900), mais **aucune livraison planifiée n'est tombée dans la fenêtre `D+1 00:00Z–03:00Z` du 28 oct au 6 nov** (exception unique le 3 nov à 00:49Z, âge 771 min → `FRESH_AND_PUBLISHED`, commit `1583c36d4`) → **14 échecs consécutifs**, dernier commit de données `1583c36d4`. Correctif proposé : densifier les crons sur `00:00Z–03:00Z` (`*/15 0-2 * * *`) + élargir l'observabilité à `03:00Z–06:00Z` (coût mesuré : 1 min de CI par run hors SLA) ; critère de succès : ≥ 8 jours de couverture sur 10. **SLA 900 min inchangé, gate fail-closed, aucune publication hors SLA, ERDDAP = source unique jamais remplacée.** Correctif **NON mergé** : une publication réussie dispatche `cloudflare-production.yml` en `workflow_dispatch` (non filtré par `paths-ignore`) → `Deploy Worker` + `Configure Worker secrets`, hors périmètre. Release code-only : **FAILED** (les 6 domaines publics sont servis par les **Workers**, pas par Pages — 0 domaine personnalisé sur les 6 projets Pages) ; **2 options d'arbitrage fondateur** : **A)** attacher les 6 domaines aux projets Pages + supprimer les 6 routes catch-all Workers, **B)** déployer les Workers régionaux via le job `deploy` de `cloudflare-production.yml`. **Le SLA de 900 min ne sera jamais abaissé.**
- [ ] P0 (P0.67 §4, suite) - Auditer puis durcir les autres points de sortie : `push-winback/revenue-watch/mollie-mrr/ux-watch/deliverability-watch/factory-heartbeat-watch/ux-daily` (`--send` sur cron), `provision-barbados --send`, SMTP (`daily-brief`, `weekend-email`, `smtp-test`), bounce cleanup Apps Script de `weekly-optimize`.
- [x] P0 - Mesure funnel checkout morte : `checkout.reached=0` alors que `paymentsReal=5` — cause = `sg_sos_checkout_start` absent de `SG_FUNNEL_EVENTS` (jamais envoyé à Supabase) + exclu de la file `critical`. Allowlist + critical corrigées (@mission_agent, 2026-10-26, PR #1064, MERGEE, deploye + verifie live bundle contient les 3 evenements)
- [x] P0 - CI rouge sur main : `reliability-page-satellite-timestamp.test.cjs` frontière introuvable → remplacée par la prochaine fonction de premier niveau, 13 assertions horodatage intactes (@mission_agent, 2026-10-26, meme PR #1064)
- [x] P2 - /fiabilite/ rendait deux <h1> identiques (variants A/B control-only / v2) : style extrait en classe .r-h1, fallback passé en <p> (@mission_agent, 2026-10-26, PR #1062, MERGEE, deploye + verifie live h1=1 6/6)
- [x] P1 - Home + fiche plage sans aucun <h1> dans le DOM rendu (mot-clé SEO sr-only en <p> sur hypothèse fausse) : devenu <h1> invisible + token smoke H1= (@mission_agent, 2026-10-26, PR #1061, MERGEE, deploye + verifie live h1=1 6/6, home+fiche+pro+hotels+fiab)
- [x] P1 - Fuite code source WorldMapView (décor solaire) : props style rendues comme texte sur les 6 domaines — restauration balise + test `jsx-style-orphan` + token smoke `RAW_CSS_TEXT` (@mission_agent, 2026-10-26, PR #1054, MERGEE, deploye + verifie live v221/2073d594, leaks=0 6/6)
- [x] P0 - Test CI bloquant `track-record-publication-workflow` : assertion fausse `stash<fetch` remplacee par l invariant reel `stash<rebase`, renforcee, mutation-tested (@mission_agent, 2026-10-26, PR #1057, MERGEE, CI Tests vert, #1049 fermee doublon)
- [x] P0 - Paywall ne s ouvrait pas (ReferenceError hasAnnual) sur les 6 domaines (@mission_agent, 2026-10-23, PR #1019, deploye + verifie live)
- [x] P1 - Canonicals martinique sur /about /research /investigacion /for-hotels des domaines USD (@mission_agent, 2026-10-23, PR #1019)
- [x] P2 - Lisibilite des puces de carte 9px -> 11.31px (mobile) / 12px (desktop) (@mission_agent, 2026-10-23, PR #1019)
- [x] P2 - Suite locale 57/57 : artefact CRLF de mollie-live-gate.test.cjs corrige (assertion inchangee) (@mission_agent, 2026-10-23, PR #1019)
- [x] P0 - Liens legaux in-app 404 (banniere cookies, paywall, pied de page) sur 4 regions + budget bundle 210.3>210 Ko (@mission_agent, 2026-10-23, branche agent/mission/v3-sargagame-20261022, PR #1016)
- [x] P1 - Sitemap de secours Tulum : pages FR/MQ/GP retirees, 8 URLs regionales (@mission_agent, 2026-10-23, meme branche)

- [x] P0 - PR #1045 CI build avant tests : `npm run build` deplace avant `npm test` dans `.github/workflows/ci-tests.yml` (commit dbf52e5d, push main)
- [x] P1 - PR #1043 Copernicus rebase stash : `git stash --include-untracked` avant fetch/rebase + `git stash pop` sur chemins succes/echec (commits 3576c354, c5374b7c, push main)
- [x] P1 - PR #1044 Protection verdicts stales HeroVerdict : masque verdict/score/compteur quand `isSatelliteFresh12h(sargData)`=false, affiche "Vérification en cours" (commit 95ea62e5, push main, tests 15/15 OK, bundle 208.0/210 Ko)

- [x] P0 - Refonte UX visible : CTA « Trouve ta plage » accueil + bannière consent + SOS or (@ui_agent, 2026-10-14, branche agent/ui/p0-first-screen-20261014)
- [x] P0 - Premier écran : chat d'hésitation n'occlut plus le premier écran sans interaction (@coding_agent, 2026-10-27, branche agent/coding/p0-first-screen-chat, commit abc721593)

- [x] P0 - Transformation AI-native du repo (@CTO_agent, 2026-07-31)
- [x] P0 - Mollie payment flow fixes (@coding_agent, 2026-07-30)
- [x] P0 - PremiumModal error msg bug (@coding_agent, 2026-07-31)
- [x] P1 - B2B recurring Mollie (#210, @coding_agent)
- [x] P0 - Production release cleanup & validation (@release_engineer, 2026-07-31)

---

## P0 — Bloquant / urgent

### TASK-P0-001 Configurer webhook secret Mollie en prod
- **Priorité** : P0
- **Rôle** : coding_agent
- **Description** : `mollie-config.php` a `webhook_secret` commenté → signature webhook non vérifiée. Doit être configuré sur chaque serveur FTP après deploy.
- **Estimation** : 30 min
- **Statut** : [~] TASK-P0-001 ?" in_progress by coding_agent_agent code_ready, [ ] deployed_to_prod

---

## P1 — Haute priorité

### TASK-P1-001 Purger les A/B tests morts
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : ~50 flags `abVariant()` dans `Sargasses_PROD.jsx` diluent le trafic et compliquent les changements UX. Garder les flags avec résultats sig., supprimer le reste.
- **Comment** : `grep abVariant src/Sargasses_PROD.jsx` → lister → identifier ceux validés → supprimer les perdants
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent

### TASK-P1-002 Tests E2E Playwright du funnel payant
- **Priorité** : P1
- **Rôle** : QA_agent
- **Description** : Créer des scénarios Playwright couvrant le parcours critique : carte → verdict → paywall → paiement → premium.
- **Estimation** : 4h
- **Statut** : [x] done by QA_agent

### TASK-P1-003 Paywall comic compléter (header variants)
- **Priorité** : P1
- **Rôle** : coding_agent + UX_agent
- **Description** : Terminer le paywall BD en ajoutant les variants d'entête (scene/constel/beat) + vérifier les transitions
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent

---

## P2 — Backlog normal

### TASK-P2-001 Spliter PremiumModal.jsx (~3 352, lignes)
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Extraire en sous-composants : doSubscribe (logique Silver), ErrorModal, PayGatewayHandler (Apple/Google)
- **Estimation** : 4h
- **Statut** : [~] TASK-P2-001 — in_progress by coding_agent

### TASK-P2-002 BCD reccurring → expose entièrement
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Les plans `mol_b2b_plans()` dans `mollie-lib.php` ont les montants; il faut exposer le CTA sur `/pro/` + auto-émission token essai 30j.
- **Estimation** : 4h
- **Statut** : [~] TASK-P2-002 — in_progress by coding_agent

### TASK-P2-003 Pages dédiée payment succès/erreur
- **Priorité** : P2
- **Rôle** : coding_agent + UX_agent
- **Description** : Aujourd'hui via query params; les pages dédiées `/payement/good` et `/payment/error` seraient plus propres.
- **Estimation** : 3h
- **Statut** : [~] TASK-P2-003 — in_progress by coding_agent

### TASK-P2-004. Transitions « case BD » entre écrans
- **Priorité** : P2
- **Rôle** : coding_agent + UX_agent
- **Description** : [À reformuler — texte source corrompu/illisible ; ne pas handoff avant clarification.]
- **Estimation** : 3h
- **Statut** : [x] blocked
- **Blocage** : description d'origine inexploitable ; aucune issue ni tâche agent ne doit être créée à partir de ce texte.

---

## P3 — Améliorations

- [ ] Spliter paywall comic/plan B en composants séparés
- [ ] Améliorer PrenderDelivery légères des Mails monitoring de la
- [ ] Ajouter le sinning de Sílbano dans un scratch

### Backlog futur / idées

- B2C abo Chrome (pas d'Vous voulez vous-en)
- widgets B2B OHPA en JS wash
- Business mobile iOS/Play/
- Mensueler Largues

---

## Règles pour les agents

1. **Lire** `.ai/current_state.md` avant tout
2. **Réclamer** une tâche : `[ ] ... → [~] in_progress by <agent>`
3. **Créer branche** : `agent/<nom>/<tache>`
4. **Commit** au fur et à mesure
5. **Marquer fini** : `[~] → [x] done by <agent>`
6. **MAJ** `.ai/current_state.md`

**Jamais** : prendre 2 tâches en même temps, skip le Gate de ship, merger sans test. 
