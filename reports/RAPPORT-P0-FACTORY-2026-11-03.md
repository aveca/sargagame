# Rapport P0 — Factory Sargagame : « success » seulement si exécution réelle et résultat vérifiable

- **Mission** : rétablir la Factory locale (runner + superviseur + sémaphore OpenCode) en état réellement opérationnel.
- **Branche** : `fix/guard-false-success`
- **Portée** : `scripts/local-factory/` uniquement (+ registres `.ai/autopilot/` issus de l'audit). Aucun autre projet touché (`chatgpt-opencode-bridge`, `blackjack-vision`, worktree outbound-safety non modifiés).
- **Rédaction** : 2026-11-03 (local, UTC-4) / 2026-11-04 (UTC).

---

## 1. Cause racine (prouvée, pas supposée)

`executeCodeTask()` dans `factory-runner.cjs` retournait `{ requeued: true }` quand le sémaphore OpenCode était saturé — **sans lever d'erreur**. Le chemin nominal interprétait ce retour comme une exécution terminée :

1. `processQueue()` appelait `executeWithFallback(task)` ;
2. l'appel ne levait rien → `removeQueueItem(taskId)` + `log('task.success')` ;
3. la tâche disparaissait de la file, un succès était compté en télémétrie, **et aucune ligne de code n'avait été exécutée**.

Conséquence mesurée sur les historiques : **6 337 faux succès** pour 12 752 succès déclarés (registre `scripts/local-factory/state/false-success-audit.json`, généré le 2026-11-03T18:40:48Z par `scripts/local-factory/audit-false-success.cjs`). 47 tâches distinctes concernées.

Le sémaphore lui-même était inopérant : `count` était une variable désynchronisable (2 verrous abandonnés depuis 237,8 h et 69,8 h occupaient les 2 jetons, donc **toute** `code_task` suivante était refusée puis déclarée réussie).

---

## 2. Corrections livrées

### 2.1 Porte de preuve générique (runner)

Une tâche n'est déclarée `success` que si `verifyExecutionProof(task, type, result)` reconnaît une preuve d'exécution réelle. La porte est **générique** (pas de liste blanche par type) : `executeTask()` l'applique avant toute écriture de succès.

- `script_task` (nouveau type) : exécution bornée réelle via `runBounded`, allowlist `node` seule (`Commande non autorisee: …` sinon), preuve = `exitCode` de la commande réellement lancée.
- L'attente sémaphore est une **erreur typée** `SemaphoreWaitError` (`code = 'SEMAPHORE_WAIT'`) : jamais un succès, jamais une auto-guérison en `task.error`. La tâche retourne en file avec backoff **sans consommer de retry** (`task.semaphore_wait_requeue`).
- Marqueur `processing-<taskId>.json` falsifiable : PID mort ⇒ marqueur abandonnée retirée (pas respectée), PID vivant + < 30 min ⇒ tâche protégée (pas de double exécution).
- Garde `tasks.md` absente : `generateDiscoveryTasks()` et `updateTaskInProgress()` ne plantent plus tout le cycle (`log('tasks_file.absent')`).

### 2.2 Sémaphore durci (`semaphore.cjs`, module dédié)

- Chaque holder porte sa **preuve de vie** : `pid` + `hostname` + horodatage UTC.
- `count` n'est plus une variable : il est **dérivé** des holders (`writeSemaphore`), donc non désynchronisable.
- Classification : `active` | `orphan_dead_pid` | `orphan_expired` (TTL 2 h) ; le sweep ne libère **que** ce qui est prouvé abandonné.
- Écritures atomiques (tmp + rename) ; fichier corrompu mis en quarantaine `.corrupt-<ts>` (historique conservé).
- **Toute** action journalisée dans `state/semaphore-journal.jsonl` (`acquire`, `acquire.wait`, `acquire.duplicate_refused`, `release.orphan`, `release.reclaim`, `release.noop`). Libérations **idempotentes**.
- `reclaim` (libération admin) exige une preuve d'abandon ; sans preuve ⇒ **refus journalisé**, pas de effacement.
- CLI admin : `status|audit|sweep|release`.

### 2.3 Heartbeat (`heartbeat.cjs`, contrat partagé)

- Écrit par le runner au démarrage puis toutes les 15 s : `timestamp` UTC, `pid` réel, `state` (`starting|busy|running|idle`), `cycle`, `queueDepth`, `uptimeMs`, `currentTask` (contrat v2).
- `evaluateHeartbeat()` : validité + fraîcheur, avec **tolérance busy** (`BUSY_MAX_AGE_MS` = 45 min) — un runner occupé par une tâche longue n'est pas déclaré mort. PID vivant exigé : `busy` + PID mort ⇒ périmé.
- `evaluateProgress()` attrape les vrais blocages (cycle qui n'avance plus).

### 2.4 Superviseur réécrit (`supervisor.cjs`)

- Garde de verrou anti-double-lancement (`lockHeldByLiveProcess`) : si un runner vivant détient le verrou, **rien** n'est relancé.
- Fenêtre glissante de redémarrages (12/h), cooldown 5 min après une mort < 60 s — évite les boucles de relance.
- Récupération **explicite et observable** : `setRecovery()` persiste `{state, reason, at, pid, cycle}` dans `state/supervisor-persist.json`, statuts `ok | pending_start | pending_lock | blocked | restarted`.
- Runner lancé en mode **continu**, `detached: true` + `unref()`, sortie vers `state/runner.log` : le runner **survit** à la mort du superviseur (plus d'encrassement `--once`).
- `--check` (vérification unique) et `--restart` (forçage manuel, journalisé).

### 2.5 Réversibilité et isolation

- Chemins surchargeables sans changer le comportement production : `FACTORY_STATE_DIR`, `FACTORY_LOGS_DIR`, `FACTORY_QUEUE_DIR`, `FACTORY_TASKS_FILE`, `FACTORY_HEARTBEAT_MS`.
- Sauvegarde intégrale hors git avant toute modification : `C:\Users\user\AppData\Local\Temp\opencode\sargagame-factory-p0-backup-2026-11-03T13-23-08` (6 103 fichiers, 1,4 Go) + copies `.AVANT` ciblées dans `state/backups/`.
- Aucun historique effacé ; aucune tâche historique réexécutée.

---

## 3. Phase 2 — audit et reclassement des faux succès

| Constat | Valeur | Preuve |
|---|---|---|
| Succès déclarés (historique) | 12 752 | `state/false-success-audit.json` |
| Faux succès (sans exécution) | **6 337** | idem |
| Tâches distinctes concernées | 47 | `.ai/autopilot/needs-review.json` |
| Tâches reclassées `new`/`blocked` ⇒ `needs_review` | **17** | diff `.ai/autopilot/queue.json` |
| Verrous OpenCode abandonnés libérés | 2 | `state/semaphore-journal.jsonl` |
| Verrous occupés après assainissement | **0 / 2** | `node semaphore.cjs status` |

- Registre durable `.ai/autopilot/needs-review.json` (politique : *un succès déclaré sans preuve d'exécution est révoqué ⇒ `needs_review` ; aucune réexécution automatique*).
- Chaque reclassement porte sa preuve (fichier + numéros de ligne `semaphore_wait` → `task.success`) et l'action attendue : *relire la preuve puis repasser `status=new` pour exécution réelle*.
- `syncAutopilotQueue()` ne synchronise que `status === 'new'` : les 17 tâches `needs_review` ne seront **pas** réexécutées par la Factory.

---

## 4. Phase 4 — tests (9/9 verts)

Exécutés sur des **processus enfants réels** et dans un **état isolé** (`FACTORY_*_DIR`), donc sans rien écrire dans l'état de production ni réexécuter de tâche historique.

```
$ node --test --test-reporter=spec scripts/local-factory/tests/factory-p0.test.cjs
✔ 1. runner actif : heartbeat écrit avec timestamp/PID/état/cycle      (1544 ms)
✔ 2. runner bloqué ou mort : heartbeat invalide jamais déclaré vivant    (48 ms)
✔ 3. heartbeat absent au démarrage : jamais déclaré vivant              (156 ms)
✔ 4. verrou détenu par un processus actif : pas de libération sans preuve (32 ms)
✔ 5. verrou abandonné : balayé et libéré de façon idempotente            (55 ms)
✔ 6. attente sémaphore : remise en file et aucun task.success          (17964 ms)
✔ 7. échec réel : exitCode non nul jamais transformé en succès         (12104 ms)
✔ 8. succès réel : preuve vérifiable (exitCode 0 + artefact produit)    (8527 ms)
✔ 9. redémarrage runner : reprise, traçabilité, pas de double lancement (4782 ms)
ℹ pass 9   ℹ fail 0   ℹ duration_ms 45269
```

Journal d'exécution (UTF-8) : `C:\Users\user\AppData\Local\Temp\opencode\factory-p0-test-run-20261103-214757.log`

Points notables :

- **Test 6** utilise une `code_task` (seul type qui acquiert le sémaphore) saturée par deux processus **réellement vivants** : le cycle produit exactement `code_task.semaphore_wait` + `task.semaphore_wait_requeue`, la tâche reste en file (`retryCount` inchangé), `task_success`/`task_error` = 0 **pour cette tâche**, et le sémaphore journalise `acquire.wait`. Une `script_task` n'aurait pas éprouvé ce chemin (elle ne consomme pas de jeton OpenCode).
- **Test 8** vérifie la **contre-épreuve** : `verifyExecutionProof(...)` rejette un résultat sans exécution (`null`, etc.).
- **Test 5** démontre la désynchronisation détectée puis résorbée : `rawDeclaredCount` (déclaré) = 3 alors que `count` (preuves de vie) = 1, puis réalignement à 1 après sweep. Les holders abandonnés sont vieillis au-delà du TTL pour être opposables.
- Les assertions de télémétrie sont **par tâche** (via le journal factory), jamais globales : dans un même cycle, les tâches de découverte réussissent légitimement avec preuve réelle.

---

## 5. Phase 3 — validation réelle en production

Superviseur relancé (`supervisor.cjs --watch`), 2026-11-04T02:02:54Z → 2026-11-04T02:22:57Z.

| Contrôle | Résultat |
|---|---|
| Premier contrôle | heartbeat périmé (16 901 s > 120 s) ⇒ redémarrage légitime (#1), `recovery=restarted`, pid 23976 |
| Contrôles suivants | **17/17 `recovery=nominal`**, `status: ok`, **0 redémarrage** |
| Cycles réels | 1063 → 1082 (~60 s/cycle) |
| Tâche réellement exécutée | `gh-discovery-1793740874190` — `task.start` 02:02:54Z → `task.success` 02:03:18Z, **durée 24 028 ms**, `proof: ["candidates"]` |
| Récupération d'abandon | `recovery.orphaned` — marqueur `processing-` du pid mort 11168 retiré (pas respecté) |
| Exécution UX réelle | `ux_observer.complete` — `tasksGenerated: 10`, `findings: 11` |
| Verrouillage | un seul détenteur de verrou, pas de double lancement |
| Fenêtre de redémarrages | `restartCount: 1` (lancement initial uniquement, 12/h autorisés) |

Extrait du journal (`scripts/local-factory/logs/factory-2026-11-04.jsonl`) :

```json
{"t":"2026-11-04T02:02:54.707Z","event":"factory.start","mode":"continuous","interval":60000}
{"t":"2026-11-04T02:02:54.859Z","event":"recovery.orphaned","taskId":"gh-discovery-1793740874190","deadPid":11168}
{"t":"2026-11-04T02:02:54.863Z","event":"task.start","id":"gh-discovery-1793740874190","type":"github_discovery_candidate","worker":"FAST"}
{"t":"2026-11-04T02:03:18.891Z","event":"task.success","id":"gh-discovery-1793740874190","duration":24028,"proof":["candidates"]}
{"t":"2026-11-04T02:17:19.102Z","event":"ux_observer.complete","taskId":"ux-observer-1077","tasksGenerated":10,"findings":11}
```

Arrêt propre effectué après validation (superviseur puis runner via le verrou d'usine) ; aucun processus factory résiduel.

---

## 6. Critère d'acceptation final

> Une tâche n'est `success` que si son exécution est réelle et son résultat vérifiable.

C'est désormais imposé **dans le code** (`verifyExecutionProof`), plus seulement par convention. Les trois portes empêchant la réapparition du défaut :

1. `SemaphoreWaitError` — une attente n'est jamais un succès (ni une erreur d'exécution).
2. `verifyExecutionProof` — aucun résultat sans preuve d'exécution ne peut devenir `task.success`.
3. Marqueur `processing-` falsifiable — un travail abandonné n'est pas respecté, un travail vivant n'est pas dupliqué.

## 7. Reste à faire (hors périmètre de cette mission)

- Relire les 17 tâches `needs_review` (preuve manuelle) avant de les repasser `new`.
- 6 337 faux succès restent dans les historiques par choix (aucune réécriture d'historique) ; ils sont étiquetés par le registre.
- Verrouiller la Factory en surveillance continue (relance `supervisor.cjs --watch`) une fois la revue des 17 tâches faite.

---

## Fichiers

| Fichier | Nature |
|---|---|
| `scripts/local-factory/factory-runner.cjs` | porte de preuve, `script_task`, `SemaphoreWaitError`, heartbeat, sweep abandonnés, gardes `tasks.md` |
| `scripts/local-factory/semaphore.cjs` | **nouveau** — sémaphore durci + preuves de vie + journal + CLI admin |
| `scripts/local-factory/heartbeat.cjs` | **nouveau** — contrat heartbeat runner/superviseur |
| `scripts/local-factory/supervisor.cjs` | réécrit — garde de verrou, fenêtre de redémarrages, récupération observable, runner détaché |
| `scripts/local-factory/tests/factory-p0.test.cjs` | **nouveau** — 9 tests P0 |
| `scripts/local-factory/audit-false-success.cjs` | **nouveau** — audit des faux succès (preuve Phase 2) |
| `scripts/local-factory/reclassify-false-success.cjs` | **nouveau** — reclassement + registre |
| `scripts/lib/process-runner.cjs` | `STATE_DIR` surchargeable (isolation des tests) |
| `.ai/autopilot/queue.json` | 17 tâches reclassées `needs_review` (preuves incluses) |
| `.ai/autopilot/needs-review.json` | **nouveau** — registre durable du reclassement |
| `reports/RAPPORT-P0-FACTORY-2026-11-03.md` | ce rapport |
