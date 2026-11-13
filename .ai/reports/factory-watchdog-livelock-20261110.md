# Boucle Factory — diagnostic et correction du livelock « heartbeat expiré » (#1384)

**Date** : 2026-11-10 · **Périmètre** : `scripts/autopilot/**` (boucle autonome 24/7 du runner local) · **Aucun code produit, aucun paiement, aucun déploiement, aucun merge.**

Ce rapport est un **fichier neuf** : il documente la réparation de la boucle
sans toucher à `.ai/current_state.md` / `.ai/changelog.md` / `.ai/tasks.md`,
qui sont modifiés par ailleurs sur la branche du PR « chemin argent » (#1406)
— on évite ainsi un conflit de fusion sur `main` pour un PR argent.

---

## 1. Symptôme

L'issue `aveca/sargagame#1384` (mission `SARG-B2B-LEAD-ACK-20261109`) publiait
en continu des commentaires :

```
🔁 Autopilot — statut : **retrying**
- motif : reprise automatique : heartbeat expiré
```

**Mesures réelles** (analyse des 254 commentaires de l'issue) :

| marqueur | nombre |
|---|---|
| `imported` | **1** (2026-11-09T22:35:26Z) |
| `retrying` | **242** |
| `blocked` | **1** (2026-11-10T11:45:54Z) |
| sans marqueur (humain / agent) | 10 |

`mission-state.json` : `state = "blocked"`, **`attempts = 242`**,
`lastHeartbeatAt = null`.

Le runner (PID 29568) est **mort** ; `status.json` annonçait encore
`alive: true`, `pid: 29568` et un heartbeat figé à `2026-11-10T12:28:08Z`
(≈ 10 h de silence). Dernier cycle : `STOP — production outage: sargazotulum.com (timeout)` —
alors que le domaine répond **200** (86–457 ms sur `/`, `/premium/`,
`/api/mollie-health`).

---

## 2. Cause racine n°1 — le plafond de reprises n'existait pas

`.ai/autopilot/config.json` portait déjà :

```json
"mission": { "heartbeatSeconds": 300, "watchdogStaleSeconds": 900, "maxAttempts": 3 }
```

…mais `scripts/autopilot/lib/mission-watchdog.cjs` **ne lisait jamais
`maxAttempts`**. La boucle était donc **auto-soutenue** :

1. le watchdog marquait la mission `retrying` (état **non terminal**) et
   incrémentait `attempts` ;
2. au cycle suivant, `lifecycle.stale()` la déclarait « périmée » (heartbeat
   jamais émis ⇒ `!hb` ⇒ expirée) ;
3. le watchdog la reprenait, republiait `retrying`, réécrivait `retrying`…

⇒ **reprise infinie de la mission par elle-même** : 242 reprises, 242
commentaires, 242 lancements d'agent, sans qu'aucun travail n'avance.

## 3. Cause racine n°2 — le garde-fou se déclenchait sur ses propres échos

Le garde-fou (`scripts/autopilot/lib/safety-guard.cjs`) scanne
**titre + corps + commentaires**. La mission #1384 est **propre** :

```
evaluateMissionSafety({title, body, task}) → blocked: false
```

…mais un **commentaire de statut** publié le 2026-11-10T11:39:16Z
(« … merge, déploiement et LIVE comme étapes distinctes » — une *description*
de protocole) déclenchait `production-deploy`. Le bloc de sécurité étant
inscrit dans la trace durable (`queue.blockedSafety`), la mission restait
bloquée indéfiniment, sur une trace devenue fausse. Le commentaire `blocked`
du garde-fou **ré-déclenchait** en outre le garde-fou au cycle suivant
(auto-amplification).

## 4. Cause racine n°3 — un timeout transitoire tuait la boucle 24/7

`orchestrator.cjs → healthCheck()` faisait **une seule** requête par domaine :
un timeout isolé sur `sargazotulum.com` suffisait à déclencher
`FACTORY_STOP` et à arrêter toute la boucle, alors que le domaine était
joignable.

---

## 5. Corrections

| Fichier | Correction |
|---|---|
| `scripts/autopilot/lib/mission-watchdog.cjs` | **plafond de reprises appliqué** (`cfg.mission.maxAttempts`) : au plafond, la mission passe en `failed` (terminal) et n'est jamais reprise ; **état durable fait autorité** (défense en profondeur) ; **mission neutralisée par le garde-fou jamais réarmée** (fail-open corrigé) ; publication `failed` unique ; **remise en file via la règle unique `scheduler.resumableStatus()`** ; **opportunités `actionable: 'human'` jamais reprises** (ni `retrying` trompeur, ni `failed` mensonger). |
| `scripts/autopilot/lib/scheduler.cjs` | **`resumableStatus(oppId, schedulerState)`** — règle **unique** de reprise : mission jamais claimée → `new` (sélectionnable par `analyze`), mission déjà claimée → `picked` (le scheduler la restaure). Sans elle, une mission libérée est *libérée mais invisible* : `analyze.cjs` ne sélectionne que `new`, `persistClaimed` traite `picked` comme déjà claimée, et `restoreSelected` ne restaure que l'opportunité référencée par le scheduler. |
| `scripts/autopilot/multi-repo-bridge.cjs` | les **commentaires de statut de la boucle** (`<!-- autopilot-status:… -->`, `<!-- SARGAGAME-CYCLE-STATUS -->`) sont **écartés du scan de sécurité** (ce ne sont pas des instructions, et l'écho du verdict ne doit pas se re-déclencher) ; **levée d'un blocage de sécurité devenu sans objet** (verdict courant sain + marqueur `safety.blocked`) ; la trace `blockedSafety` est purgée ; le **compteur de tentatives est remis à zéro** (les 242 tentatives étaient un artefact) ; application de `scheduler.resumableStatus()`. |
| `scripts/autopilot/orchestrator.cjs` | le health check **confirme** la panne : `cfg.health.confirmAttempts` (défaut 3) tentatives consécutives par domaine requis avant de déclarer un domaine « down ». Un timeout isolé ne tue plus la boucle. |
| `scripts/autopilot/runner.cjs` | `status.json` porte **`alive: false`** à l'arrêt (arrêt propre **et** `process.on('exit')`, donc y compris sur crash non rattrape) + `stopReason` / `stoppedAt`. Le snapshot ne peut plus annoncer un runner vivant dont le PID est disparu. |
| `.ai/autopilot/config.json` | `health.confirmAttempts: 3` explicite. |
| `scripts/autopilot/lib/mission-watchdog.test.cjs` | **nouveau** : 9 scénarios (plafond, terminal durable, neutralisation sécurité, anti-livelock sur 10 cycles, nominal, reprise `new` vs `picked`, mission `actionable: human`, garde-fou et faux positif reproduit). |
| `scripts/autopilot/multi-repo-bridge.test.cjs` | **isolation de l'état durable** : `SARGA_MISSION_STATE_FILE` redirigé **avant** le `require` (le module capture la variable au chargement). Sans cela, un `npm test` injectait 3 missions fictives dans l'état durable **réel** de la factory 24/7. |
| `scripts/autopilot/multi-repo-bridge-e2e.test.cjs` | étapes **11d** (levée du faux blocage #1384 → `new`, compteur à 0) et **11e** (mission déjà claimée → `picked`). |

### Preuve du correctif anti-livelock

`10` cycles consécutifs du watchdog sur une mission coincée ⇒ **3**
publications `retrying` (bornées par `maxAttempts`) puis **1** `failed`
terminal. Avant : 242 `retrying` sans fin.

---

## 6. Tests

- `node scripts/autopilot/lib/mission-watchdog.test.cjs` → **OK (0 échec)** — 9 scénarios
- `node scripts/autopilot/lib/mission-lifecycle.test.cjs` → OK
- `node scripts/autopilot/multi-repo-bridge.test.cjs` → OK
- `node scripts/autopilot/multi-repo-bridge-e2e.test.cjs` → OK (étapes 11d + 11e)
- `node scripts/autopilot/lib/safety-guard.test.cjs` → OK
- `npm test` (suite complète) → **190/190 fichiers OK** (après `npm run build` :
  le seul échec initial, `sitemap-guard-beach-pages`, est un **ordre de build**)
- `node --check` sur les 6 fichiers `.cjs` modifiés → exit 0
- `git diff --check` → exit 0

## 7. Suite proposée — EXÉCUTÉE (voir §8 pour les mesures)

1. **État runner** : `status.json` rectifié (`alive:false`, `pid:null`) puis
   boucle relancée par la tâche planifiée officielle `SargagameAutopilot` ;
   blocage de sécurité de #1384 **levé** (faux positif documenté) et mission
   remise en file **une seule fois**. → **fait** (§8).
2. **Reprise de la mission B2B Punta Cana** : elle touche
   `workers/sg-payments/index.js`, **le même fichier que la PR #1406
   (ouverte, non mergée)** ⇒ elle ne doit pas démarrer avant le merge de
   #1406, pour éviter un conflit sur le chemin de paiement.
   → **fait** : le watchdog ignore désormais les opportunités
   `actionable: 'human'` (§8) ; la mission reste `new` / `imported` /
   `attempts: 0`, en attente d'un traitement humain.
3. Le runner local (`C:\Users\user\sargagame-runner`, branche
   `runner/factory-local`, arbre de travail très dégradé) doit recevoir les
   fichiers corrigés **sans écraser son WIP** : les copies locales de
   `mission-watchdog.cjs` / `mission-lifecycle.cjs` sont **non suivies** par
   Git alors qu'elles sont identiques à `origin/main`. → **fait** (§8).

---

## 8. Exécution réelle (runner du fondateur, 2026-11-11)

Les correctifs ont été déployés dans `C:\Users\user\sargagame-runner`
(**6 + 4 fichiers**, convention EOL de chaque cible préservée, WIP local
intact — divergence EOL vérifiée octet par octet avant copie), puis la
boucle a été relancée par le mécanisme officiel (tâche planifiée
Windows `SargagameAutopilot` → `autopilot-service.cmd` → `autopilot-live.cmd`
→ `run.cjs --live --continuous` → `runner.cjs`).

### 8.1 Mesures

| Fait | Mesure |
|---|---|
| Faux blocage #1384 | **levé** à `2026-11-11T00:31:03.991Z` — `safety.blocked=false`, trace `blockedSafety` purgée |
| Compteur de tentatives | remis à **0** (les 242 tentatives étaient un artefact du livelock, pas du travail réel : `startedAt`, `branch` et `commit` étaient `null`) |
| Statut de reprise | mission rendue **sélectionnable** (`new`) — sans cela elle était *libérée mais invisible* (`analyze.cjs` ne sélectionne que `new`) |
| Doublon | **1 seule entrée** en queue pour `SARG-B2B-LEAD-ACK-20261109` |
| Mission `actionable: human` | watchdog journalise `actionnable=human — non relancée par l'agent` à `2026-11-11T01:12:13.852Z` ; ni `retrying` trompeur, ni `failed` mensonger |
| Livelock | **arrêté** : 0 nouveau commentaire autopilot depuis `2026-11-11T01:08:03Z` |
| Plafond déjà actif en production | `SARG-P0-VEILLEURS-PATHS-IGNORE-20261109` (707 tentatives) passée `failed` / `rejected` |
| Boucle 24/7 | **vivante** : hôte `DESKTOP-HG0O76B`, PID `2968`, lock token `ec6c2f3116cb4038`, démarrée `2026-11-11T01:10:19.572Z` |
| `status.json` à l'arrêt | affiche enfin `alive:false`, `pid:null`, `stopReason:"process exit"`, `stoppedAt` — avant : `alive:true` avec le PID d'un processus disparu |
| Pollution de l'état durable | 3 missions fictives (`T-SARG`, `T-IDEM`, `T-FAIL`) injectées par la suite de tests : ** purgées** (écriture atomique), mission #1384 vérifiée **intacte** avant et après |

### 8.2 Tests re-exécutés DANS le runner

`mission-watchdog.test.cjs`, `mission-lifecycle.test.cjs`,
`multi-repo-bridge.test.cjs`, `multi-repo-bridge-e2e.test.cjs`,
`safety-guard.test.cjs` → **5/5 OK**, et **état durable réel inchangé**
(SHA-256 de `mission-state.json` identique avant/après).

### 8.3 Reste à décider (founder)

- Merge de la PR #1407 (touche l'orchestrateur autonome) — revue requise.
- Merge de la PR #1406 (chemin argent) — autorisation explicite requise sur
  le SHA `8f97a2e5f73747eb8c9a8a34309f03853d286211`. **Aucun merge effectué.**
- PR #1404 (draft Factory en échec, `FAIL_TARGET_UNCHANGED`) : le gate
  « PR draft ⇒ observation only » maintient la boucle en observation seule.
  **Fermer cette PR ?**
- Mission #1384 : périmètre `workers/sg-payments/index.js` interdit par
  `policy.denyGlobs` (`workers/**` = chemin de paiement) → traitement humain
  après le merge de #1406 (même fichier), ou exécution automatique autorisée ?
