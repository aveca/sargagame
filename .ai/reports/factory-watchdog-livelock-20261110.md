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
| `scripts/autopilot/lib/mission-watchdog.cjs` | **plafond de reprises appliqué** (`cfg.mission.maxAttempts`) : au plafond, la mission passe en `failed` (terminal) et n'est jamais reprise ; **état durable fait autorité** (défense en profondeur) ; **mission neutralisée par le garde-fou jamais réarmée** (fail-open corrigé) ; publication `failed` unique. |
| `scripts/autopilot/multi-repo-bridge.cjs` | les **commentaires de statut de la boucle** (`<!-- autopilot-status:… -->`, `<!-- SARGAGAME-CYCLE-STATUS -->`) sont **écartés du scan de sécurité** (ce ne sont pas des instructions, et l'écho du verdict ne doit pas se re-déclencher) ; **levée d'un blocage de sécurité devenu sans objet** (verdict courant sain + marqueur `safety.blocked`) ; la trace `blockedSafety` est purgée. |
| `scripts/autopilot/orchestrator.cjs` | le health check **confirme** la panne : `cfg.health.confirmAttempts` (défaut 3) tentatives consécutives par domaine requis avant de déclarer un domaine « down ». Un timeout isolé ne tue plus la boucle. |
| `scripts/autopilot/runner.cjs` | `status.json` porte **`alive: false`** à l'arrêt (arrêt propre **et** `process.on('exit')`, donc y compris sur crash non rattrape) + `stopReason` / `stoppedAt`. Le snapshot ne peut plus annoncer un runner vivant dont le PID est disparu. |
| `.ai/autopilot/config.json` | `health.confirmAttempts: 3` explicite. |
| `scripts/autopilot/lib/mission-watchdog.test.cjs` | **nouveau** : 7 scénarios (plafond, terminal durable, neutralisation sécurité, anti-livelock sur 10 cycles, nominal, garde-fou et faux positif reproduit). |

### Preuve du correctif anti-livelock

`10` cycles consécutifs du watchdog sur une mission coincée ⇒ **3**
publications `retrying` (bornées par `maxAttempts`) puis **1** `failed`
terminal. Avant : 242 `retrying` sans fin.

---

## 6. Tests

- `node scripts/autopilot/lib/mission-watchdog.test.cjs` → **OK (0 échec)**
- `node scripts/autopilot/lib/mission-lifecycle.test.cjs` → OK
- `node scripts/autopilot/multi-repo-bridge.test.cjs` → OK
- `node scripts/autopilot/multi-repo-bridge-e2e.test.cjs` → OK
- `node scripts/autopilot/lib/safety-guard.test.cjs` → OK
- `npm test` (suite complète) → **190/190 fichiers OK** (après `npm run build` :
  le seul échec initial, `sitemap-guard-beach-pages`, est un **ordre de build**)
- `node --check` sur les 4 fichiers `.cjs` modifiés → exit 0
- `git diff --check` → exit 0

## 7. Suite proposée (hors périmètre de cette PR)

1. **État runner** : `status.json` doit annoncer `alive:false` (PID 29568
   disparu) ; le blocage de sécurité de #1384 doit être **levé** (faux positif
   documenté) et la mission remise en file **une seule fois**.
2. **Reprise de la mission B2B Punta Cana** : elle touche
   `workers/sg-payments/index.js`, **le même fichier que la PR #1406
   (ouverte, non mergée)** ⇒ elle ne doit pas démarrer avant le merge de
   #1406, pour éviter un conflit sur le chemin de paiement.
3. Le runner local (`C:\Users\user\sargagame-runner`, branche
   `runner/factory-local`, arbre de travail très dégradé) doit recevoir les
   fichiers corrigés **sans écraser son WIP** : les copies locales de
   `mission-watchdog.cjs` / `mission-lifecycle.cjs` sont **non suivies** par
   Git alors qu'elles sont identiques à `origin/main`.
