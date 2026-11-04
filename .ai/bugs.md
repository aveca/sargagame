# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

---

## 🟥 Non résolus

### BUG-2026-001 Webhook secret Mollie pas configuré

- **Date** : 2026-07-30 · **Sévérité** : HIGH
- **Fichier** : `public/api/mollie-config.php`
- **Description** : `webhook_secret` est commenté/absent → `mollie-webhook.php` accepte n'importe quel appel sans vérifier le hash. À configurer manuellement sur chaque serveur FTP.
- **Reproduction** : Envoyer un POST à `/api/mollie-webhook.php` avec un `id` aléatoire → accepté.
- **Plan** : Ajouter le secret dans le flux de déploiement FTP (`prepare-ftp.cjs`).
- **Statut** : [ ] En attente provisioning serveur

### BUG-2026-002 — Florida + US builds incomplets unique

- **Date** : 2026-07-17 **Sévérité** : MEDIUM
- **Fichier** : `prepare-ftp.cjs`
- **Description** : Les US (Florida, Punta Cana, Riviera Maya) ne sont pas buildés comme région fullavant ; leur FTO-na schedule une route shallow.
- **Reproduction** : lancer `prepare-ftp.cjs` with `--regions florida` — plusieurs pages manquants.
- **Statut** : [ ] Dans le pipe

### BUG-2026-003 — Trop de flags A/B (>50) — dilue significativité

- **Date** : 2026-07-31 · **Sévérité** : LOW (pas visible/ser propose)
- **Fichier** : `src/Sargasses_PROD.jsx`
- **Description** : 50+ `abVariant()` dans la source créént un montage Statistical à mesure, à remettre UTILE que version pour obtenir un signal dans une évaluation valide; cela ralentit also les nouveaux
- **Plan** : `à résoudre comme partie` du Nettle P1 purge précnom.

---

## 🟩 Résolus
### BUG-2026-007 — Factory : succès déclaré sans exécution réelle (attente sémaphore)
- **Date** : 2026-11-03 — **Sévérité** : CRITIQUE — **Statut** : [x] corrigé (branche `fix/guard-false-success`)
- **Fichier** : `scripts/local-factory/factory-runner.cjs` (`executeCodeTask` → `processQueue`)
- **Description** : quand le sémaphore OpenCode était saturé, `executeCodeTask()` retournait `{requeued:true}` **sans lever d'erreur**. Le chemin nominal considérait l'appel comme terminé : la tâche était retirée de la file et un `task.success` était écrit et compté en télémétrie, alors qu'aucune ligne de code n'avait été exécutée. Le sémaphore étant par ailleurs bloqué par 2 verrous abandonnés, **toutes** les `code_task` concernées devenaient des faux succès.
- **Reproduction** : saturer `opencode-semaphore.json` (2 holders), déposer une `code_task`, exécuter `node scripts/local-factory/factory-runner.cjs --run --once` → `task.success` journalisé alors que la commande n'a jamais tourné.
- **Mesure** : 6 337 faux succès pour 12 752 succès déclarés, 47 tâches distinctes (`scripts/local-factory/state/false-success-audit.json`).
- **Correctif** : porte de preuve générique `verifyExecutionProof()` appelée avant tout `task.success` ; l'attente sémaphore est désormais l'erreur typée `SemaphoreWaitError` (requeue avec backoff sans consommer de retry, jamais un succès ni une auto-guérison). Régression éprouvée par `tests/factory-p0.test.cjs` (test 6 : aucun `task.success`, aucun `task.error`, tâche toujours en file).
- **Réparation des données** : 17 tâches reclassées `needs_review` dans `.ai/autopilot/queue.json` (registre `.ai/autopilot/needs-review.json`), aucun historique réécrit.

### BUG-2026-008 — Factory : cycle entier en échec si `.ai/tasks.md` est absent
- **Date** : 2026-11-03 — **Sévérité** : HAUTE — **Statut** : [x] corrigé (branche `fix/guard-false-success`)
- **Fichier** : `scripts/local-factory/factory-runner.cjs` (`generateDiscoveryTasks` ~l. 885, `updateTaskInProgress` ~l. 690)
- **Description** : `fs.readFileSync(TASKS_FILE)` en dur provoquait un `ENOENT` sur un `tasks.md` absent → **tout le cycle échouait** (`cycle.error`) puis le runner sortait en code 0 sans traiter aucune tâche. Dans un état isolé (tests) ou après nettoyage, la Factory semblait donc « tourner » sans rien faire.
- **Reproduction** : renommer `.ai/tasks.md`, lancer `--run --once` → `cycle.error` (ENOENT), 0 tâche traitée, code de sortie 0.
- **Correctif** : lecture gardée + `log('tasks_file.absent')` ; la génération des tâches de découverte se poursuit sans le fichier. Même garde ajoutée dans `updateTaskInProgress()`.
- **Tests** : `tests/factory-p0.test.cjs` crée un `tasks.md` dans chaque état isolé et les tests 6/7/8 exécutent un cycle complet réel.


### BUG-2026-004 Paiement Mollie monte fail (nothing"

- **Date** : 2026-07-29 done · **Fix** : soft via l'effet `preaurer

### BUG-2026-005 Error : msg nul; en bloc frib(La protection!)

- **Date** : 2026-07-31 done : réparé → `errMsg` au lieu de `msg` qui était undefined.    

### BUG-2026-006. terminé en regrouper: Mol duplicates et status.

- **Date** : 2026-07-30 done → and field to web.

---

## Flux agent

1. Bug détecté → ajouter au plan (haut faite)
2. Assigner → [coding_agent] or relevant
3. Fix → lien PR / commit → @move to résolu().

---

> ***Début de session : toujours scanner ce fichier.***