# Factory V3 — Orchestrateur autonome, bascule de modèle et quota autopilot

Ce dossier contient le **système d'exécution réel** de la Factory V3 : un
dispatcher persistant qui détecte une mission, choisit un agent **réel**, fait
exécuter le travail par OpenCode, contrôle les gates de livraison et ne
déclare **jamais** de succès sans preuve.

> Zéro simulation. Zéro faux succès. Toute affirmation de ce dossier est
> adossée à un fichier de preuve (`state/evidence/*.json`, `state/logs/*.jsonl`).

---

## 1. Architecture

```
scripts/factory-v3/
├── run.cjs                  Orchestrateur central (queue, lock, gates, verdicts)
├── dashboard.cjs            Tableau de bord modèles / quotas / agents
├── test-real-failover.cjs   Test réel du failover (OpenCode authentique)
├── proofs/                  Preuves réelles versionnées (JSON)
├── install-scheduled-task.ps1 / uninstall-scheduled-task.ps1   Autonomie 24/7
└── lib/
    ├── failover.cjs         Moteur retry + bascule (orchestration des tentatives)
    ├── inventory.cjs        Découverte dynamique des modèles (via OpenCode)
    ├── model-registry.cjs   Mémoire quotas / cache / breaker fournisseur+modèle
    ├── error-classifier.cjs Classification quota / 429 / safety / provider / code
    ├── retry-policy.cjs     Backoff + jitter + Retry-After strict
    └── exec.cjs             Exécution de processus robuste (timeout, kill d'arbre)
```

Un **seul** orchestrateur : `run.cjs` délègue l'exécution des modèles à
`lib/failover.cjs`. Il n'existe pas de second orchestrateur parallèle.

---

## 2. Cycle de vie d'un job

```
PENDING → (claim atomique) → RUNNING → agent (failover) → gates → verdict
                                  ↑                                │
                                  └──── reprise après crash ──────┘
```

| Verdict | Signification |
|---|---|
| `VERIFIED` | agent OK + gates verts + commit SHA réel |
| `DONE_NO_CHANGE` | aucune modification nécessaire (légitime) + gates verts |
| `BLOCKED_UNCOMMITTED` | l'agent a modifié des fichiers sans committer |
| `FAILED` | échec honnête (erreur de code, gates rouges, modèle mort) |
| `WAIT_QUOTA` | **tous** les modèles sont en cooldown → job reprogrammé, **sans** consommer de tentative |
| `PARKED` | budget de tentatives épuisé → intervention requise |

---

## 3. Bascule automatique de modèle (mission P0)

### 3.1 Détection

`lib/error-classifier.cjs` distingue :

| Catégorie | Signatures | Retry même modèle ? | Bascule ? | Cooldown |
|---|---|---|---|---|
| `DAILY_QUOTA_EXHAUSTED` | `Daily free messages exhausted`, `daily quota exceeded`, `insufficient quota` | non | oui (autre modèle du provider) | reset connu, sinon progressif ≤ 1 h |
| `RATE_LIMITED` | `HTTP 429`, `rate limit`, `too many requests` | oui (≤ 3) | oui (autre provider) | `Retry-After` respecté, sinon exponentiel ≤ 30 min |
| `QUOTA_CREDIT` | `HTTP 402`, `payment required`, `insufficient credit` | non | oui (autre provider) | 24 h (jamais de modèle payant) |
| `PROVIDER_UNAVAILABLE` | `provider unavailable`, `model overloaded`, `5xx`, `ECONNRESET` | oui (≤ 3) | oui (autre provider) | 10 min puis breaker 1 h |
| `CONTENT_SAFETY_UNAVAILABLE` | safety / moderation / screening indisponible | **une seule fois** | oui | 2 min |
| `AUTH_ERROR` | `401`, `403`, provider non authentifié | non | oui (autre provider) | sans retry |
| `TIMEOUT` | aucune sortie / délai dépassé | oui (≤ 3) | oui | 10 min |
| `MODEL_INVALID` | `model not found`, `unknown model` | non | oui | 10 min |
| `CODE_ERROR` | `SyntaxError`, `npm ERR!`, `test failed`, `ENOENT` | non | **NON** | 0 |

> Une simple erreur de code **ne change jamais de modèle** : le job échoue
> honnêtement (`FAILED`) au lieu de consommer du quota. Un contrôle de sécurité
> n'est **jamais désactivé** : le safety screening indisponible provoque une
> seule reprise différée, puis un failover.

### 3.2 Retry intelligent (`lib/retry-policy.cjs`)

* Backoff de base : **2 s → 5 s → 10 s → 20 s → 60 s maximum**, avec jitter
  additif (0 à +25 %, jamais sous la valeur de base).
* **3 tentatives maximum sur le même modèle** pour une erreur transitoire.
* `Retry-After` (secondes ou date HTTP) est lu dans l'erreur OpenCode et
  respecté **strictement** : il ne peut jamais être raccourci, même s'il
  dépasse le plafond de 60 s du backoff.
* Quota épuisé : aucun retry immédiat ; cooldown jusqu'au reset connu. Sans
  reset communiqué : cooldown progressif borné, sans boucle infinie.
* Safety screening indisponible : **une seule** reprise différée, puis
  failover. Authentification et modèle inexistant : aucun retry.
* Chaque tentative et chaque failover est persisté dans le registre et dans
  `state/context/<jobId>.json`.

### 3.3 Circuit breaker, cache et concurrence fournisseur

Le registre `state/model-registry.json` distingue :

* le breaker **modèle** (3 échecs → 1 h) ;
* le breaker **fournisseur** (`closed` / `open` / `half_open`) ;
* un cache de disponibilité par modèle (évite les sondes répétitives) ;
* des slots de concurrence **leased** par fournisseur : Nvidia/OpenCode 2,
  Ollama local 1, défaut 2. Les bails expirés récupèrent un runner crashé.

À l'expiration d'un cooldown fournisseur, le circuit passe en `half_open` :
**une seule sonde** est autorisée. Un succès referme le circuit ; un échec le
rouvre. La sélection privilégie alors un autre fournisseur, ce qui empêche
plusieurs agents de marteler simultanément un fournisseur en erreur.

### 3.4 Inventaire dynamique

L'inventaire n'est **jamais** écrit en dur :

```bash
opencode auth list                  # fournisseurs réellement authentifiés
opencode models <provider> --verbose # catalogue + coûts + capacités
ollama list                          # modèles locaux réellement installés
```

Seuls sont retenus : statut `active`, sortie texte, support des outils et
**coût entrée = sortie = cache = 0** (un modèle payant est exclu tant que
`paidAllowed` est false). Pour Ollama, l'inventaire est recoupé avec
`ollama list` : un modèle catalogue mais non installé n'est pas proposé.

### 3.5 Priorité (mission)

1. Meilleurs modèles **Nvidia gratuits** via OpenCode
2. Autres modèles **gratuits** accessibles via OpenCode
3. Autres fournisseurs gratuits déjà configurés
4. Modèles **locaux** (Ollama) réellement installés
5. Autres modèles installés et autorisés

Implémentation : `scoreModel()` (fournisseur, gratuité, raisonnement, outils,
contexte, famille, validité par usage réel). La liste `models` de la
configuration (priorité mission) domine le classement : son bonus (100 par
rang) reste supérieur à **tous** les bonus de capacité réunis (≤ 50).

### 3.6 Continuité de session

À chaque bascule :

* la **session OpenCode** est conservée (`opencode run --session <id> -m <nouveau>`) ;
* un bloc `REPRISE APRÈS BASCULE DE MODÈLE` est injecté dans le prompt :
  mission, raison de l'échec, dernier commit confirmé, fichiers déjà modifiés
  (`git status --porcelain -uall`), session à poursuivre ;
* le contexte est **persisté** dans `state/context/<jobId>.json` : il survit
  au redémarrage du runner. Au démarrage d'une nouvelle tentative, la session
  et l'historique des tentatives sont relus avant tout appel ;
* le travail déjà fait n'est **jamais** annulé (`git checkout`/`reset` absents
  du moteur).

### 3.7 Vérification du modèle réellement utilisé

Le runner lance OpenCode avec `--print-logs --log-level INFO` et parse :

```
message=stream providerID=<provider> modelID=<model> session.id=<session>
```

Le modèle observé est comparé au modèle demandé (`modelVerified`). La preuve
est conservée dans l'évidence du job.

### 3.8 Mémoire des quotas et circuit breaker

`state/model-registry.json` (écriture atomique + **verrou de fichier** pour les
agents concurrents) conserve pour chaque modèle : fournisseur, nature du quota,
heure de détection, heure de réinitialisation estimée, dernière tentative,
dernier résultat, échecs consécutifs, cooldown courant, numéro de
failovers/reprises, dépense cumulée.

* 3 échecs consécutifs → `circuit_open` (cooldown d'1 h).
* À l'expiration du cooldown → **réintégration automatique** (`MODEL_REINSTATED`).
* `ALL_MODELS_IN_COOLDOWN` → verdict `WAIT_QUOTA` → le job est reprogrammé à
  l'heure de la première réinitialisation, **sans** consommer de tentative.

### 3.9 Dépense

`paidAllowed: false` par défaut. Le coût réel remonté par OpenCode
(`step_finish.cost`) est cumulé dans le registre et affiché par le tableau de
bord. **Dépense observée : 0.**

### 3.10 Vérification du résultat réellement produit

Un modèle peut répondre « j'ai créé le fichier et commité » **sans l'avoir
fait** (observé le 2026-11-14 avec un petit modèle local : appels d'outils
émis en texte, aucun fichier créé). Un job peut donc porter un **contrat de
résultat** :

```js
job.verify = {
  requiredFiles: [{ path: 'factory-real-proof.txt', contains: 'FACTORY_REAL_OK' }],
  requireCommit: true,
  requireCleanTree: false,
};
```

Si le contrat n'est pas satisfait, la tentative est classée
`RESULT_NOT_PRODUCED` → **ce n'est pas un succès** → le moteur bascule vers le
modèle suivant. Sans ce contrat, `DONE_NO_CHANGE` reste possible (une tâche
qui n'exige aucun changement est légitime).

### 3.11 Sondes de bascule (`probeModels`)

Une **sonde** est un modèle volontairement appelé **en premier** pour éprouver
la mécanique de bascule sur une **vraie** erreur de fournisseur :

* soit elle est **absente de l'inventaire** → OpenCode répond « model not
  found » (aucun token consommé, coût 0) ;
* soit elle est **connue** → elle doit être **gratuite**, sinon elle est
  **REFUSÉE** avant tout appel (`paidAllowed=false`).

```js
failover: { probeModels: ['nvidia/nvidia/model-quota-probe-introuvable'] }
```

Les sondes servent à la preuve et au test de la chaîne de secours ; en
production, la chaîne est découverte par l'inventaire dynamique. Une sonde
déjà en cooldown n'est **plus re-sondée** ; son état est lu dans le registre
et dans le cache de disponibilité.

---

## 4. Correction du bug de hang (preuve : job `job-1794676119497-1f224f`)

Constat du 2026-11-14 : le runner restait bloqué indéfiniment (41 min, CPU
0,1 s). Cause : avec `stdio: 'pipe'`, un petit-fils (`opencode.exe`) hérite
des handles stdout du powershell parent ; même après la mort du parent, le
pipe reste ouvert et l'événement `close` de Node ne se déclenche jamais.

Correctifs (`lib/exec.cjs`) :

1. stdout/stderr redirigés vers des **fichiers** (aucun handle hérité) ;
2. le timeout **résout la promesse immédiatement** (sans attendre `close`) ;
3. `taskkill /PID <pid> /T /F` systématique (arbre complet) ;
4. **timeout d'inactivité** distinct du timeout total (hang fournisseur) ;
5. résolution unique garantie (guard).

Test de non-régression : `tests/unit/factory-v3-failover.test.cjs` (cas 15).

---

## 5. Observabilité

```bash
node scripts/factory-v3/run.cjs --dashboard          # tableau de bord texte
node scripts/factory-v3/run.cjs --dashboard --json   # même chose en JSON
node scripts/factory-v3/run.cjs --inventory          # redécouvre les modèles réels
node scripts/factory-v3/run.cjs --models             # classement courant
node scripts/factory-v3/run.cjs --status             # queue, lock, heartbeat
```

Le tableau de bord affiche : modèle courant par agent, fournisseur, statut de
disponibilité, quota épuisé ou non, nombre de bascules, dernier changement de
modèle, modèle de secours, tâches reprises automatiquement, agents bloqués et
dépense (0 sans autorisation).

Journal type :

```
[19:30] OpenCode — Nvidia/MiniMax-M3.1-Flash
[19:30] DAILY_FREE_QUOTA_EXHAUSTED
[19:30] Modèle placé en cooldown
[19:31] Recherche d'un modèle alternatif
[19:31] Nvidia/Nemotron-… disponible
[19:31] Changement de modèle effectué
[19:31] Session vérifiée
[19:32] Reprise de la mission
```

Événements structurés (JSONL) : `MODEL_ATTEMPT_START`,
`MODEL_RETRY_SCHEDULED`, `MODEL_ATTEMPT_FAILED`, `MODEL_FAILOVER`,
`MODEL_ATTEMPT_SUCCESS`, `MODEL_REINSTATED`, `INVENTORY_REFRESHED`,
`FAILOVER_CANDIDATES`, `INTERRUPTED_BUT_COMMITTED`, `JOB_QUOTA_WAIT`.

Les marqueurs humains obligatoires sont également écrits tels quels :

```text
[MODEL] requested=nvidia/nvidia/nemotron-…
[MODEL] resolved=nvidia/nemotron-…
[FAILOVER] reason=HTTP_429
[FAILOVER] provider=nvidia unavailable
[FAILOVER] next_model=opencode/…
[MODEL] execution_resumed=true
```

Chaque tentative conserve : modèle demandé, modèle observé, fournisseur,
catégorie, code HTTP, `Retry-After`, nombre de tentatives, modèle de
remplacement, résultat et durée. Le résultat global contient en plus la durée
totale et la dépense cumulée.

---

## 6. Procédures de récupération

| Symptôme | Action |
|---|---|
| Tous les modèles en cooldown | le job attend seul (`WAIT_QUOTA`) ; `--models` pour inspecter, `--inventory` pour redécouvrir |
| Modèle en cooldown à tort | `node scripts/factory-v3/run.cjs --recover` puis réinitialiser le cooldown dans `state/model-registry.json` |
| Runner bloqué (hang) | `taskkill /PID <pid> /T /F` ; le job `RUNNING` orphelin est repris automatiquement (`--recover`) |
| Inventaire obsolète | `--inventory` (refresh natif via `opencode models --verbose`) |
| Job `PARKED` | inspecter `state/evidence/<jobId>.json`, corriger, `--recover` |
| Dépense constatée > 0 | anomalie : vérifier `paidAllowed` (doit rester `false`) et `state/model-registry.json` |

Rollback du système : `git revert <commit>` (le runner précédent reste dans
l'historique) + `powershell -File scripts\factory-v3\uninstall-scheduled-task.ps1`
pour retirer la tâche planifiée.

---

## 7. Tests

```bash
node --test tests/unit/factory-v3-failover.test.cjs       # 20 cas (failover, quotas, concurrence, hang, faux succès)
node --test tests/unit/factory-v3-resilience.test.cjs     # 11 cas (9 scénarios P0 + restart + Retry-After strict)
node --test tests/unit/factory-v3-runner.test.cjs         # 9 cas (runner, lock, queue, verdicts)
node scripts/factory-v3/test-real-failover.cjs            # test RÉEL (OpenCode, vrais modèles)
```

Le test réel utilise le **vrai** CLI OpenCode, en deux phases :

* **Phase A — disponibilité** : au moins **deux** modèles gratuits sont
  réellement appelés ; pour chacun on conserve l'ID de session, le modèle
  **observé** dans les logs serveur, les tokens et le coût ;
* **Phase B — bascule** : une **sonde** (modèle inexistant chez un vrai
  fournisseur) provoque une **vraie** erreur, le moteur la classe et bascule,
  puis un **vrai** modèle gratuit exécute réellement la mission (fichier créé
  + commit) ; le contrat `job.verify` garantit que la réponse n'est pas un
  faux succès.

La preuve complète est écrite dans `state/evidence/real-failover-*.json` (runtime
éphémère, non versionné) ou directement dans le dossier versionné via
`--proof-dir scripts/factory-v3/proofs`.

**Résultat réel du 2026-11-14 après durcissement résilience**
(`proofs/real-failover-1794691007644.json`) :

| Phase | Résultat |
|---|---|
| Inventaire | 135 modèles découverts, 38 éligibles, 59 gratuits, **9 fournisseurs authentifiés** |
| Phase A | `ollama/qwen2.5-coder:7b` **vérifié** (24 s, coût 0) · `nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b` **vérifié** (8 s, coût 0) |
| Phase B | sonde réelle `nvidia/nvidia/model-quota-probe-introuvable` → erreur OpenCode réelle → **aucun retry inutile** → **bascules = 1**, **reprises = 1** → Nvidia Nemotron réussit (26 s) |
| Preuve de résultat | fichier `factory-real-proof.txt` = `FACTORY_REAL_OK`, **commit réel `8473e6dd5886822f104c2134d4cbacbeb02a9a76`** |
| Transparence | logs `[MODEL] requested/resolved/execution_resumed=true` et `[FAILOVER] reason/next_model` dans la preuve |
| Dépense | **0** |
