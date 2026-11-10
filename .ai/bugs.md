# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

---

## 🟥 Non résolus

### BUG-2026-014 — « Around me » : la carte recouvre le panneau, « Me localiser » est incliquable (mobile)

- **Date** : 2026-11-10 · **Sévérité** : MEDIUM (fonctionnalité **flaggée** `?world_around_me=1`, donc hors funnel par défaut — mais **inutilisable** quand le flag est actif)
- **Fichiers** : `src/world/AroundMeController.jsx:96-108` (racine du panneau : `position:"relative"`, `zIndex:20`) · `src/WorldMapView.jsx:1355-1367` (racine de la carte : `position:"fixed"`, `zIndex:1020`, `inset:0`)
- **Description** : dans la vue « carte monde », le panneau « Around me » est rendu **avant** `<LazyWorldMapView>` (cf. `src/Sargasses_PROD.jsx:14813-14824`). La carte est un overlay `position:fixed; inset:0; z-index:1020` : elle **peint par-dessus** le panneau (`z-index:20`) et **intercepte le clic**. Conséquence réelle : le bouton « Me localiser » n'est pas cliquable sur mobile — la fonctionnalité ne peut pas être utilisée. Le `toBeVisible()` de Playwright passe pourtant (il vérifie la boîte, pas la superposition), d'où une fausse impression de couverture.
- **Reproduction** : `npx playwright test tests/e2e/around-me.spec.ts` → **7 échecs**, tous avec la même cause : `<svg role="img" data-sg-live="1" …> from <div data-sg-live="1" class="sg-onink-scope"> subtree intercepts pointer events`. Sonde directe (iPhone 12, 390×844) : `document.elementFromPoint(cx, cy)` au centre du bouton → renvoie le `<svg>` de la carte, **pas** le bouton.
- **Preuve** : capture `test-results/around-me-probe.png` + mesures de la sonde (bouton à `top:186px`, dans le viewport ; contrôleur `z-index:20` ; wrapper carte `z-index:1020`).
- **Plan** : sortir le contrôleur du flux normal et le poser **au-dessus** de la carte (`position:fixed`/`absolute`, `z-index ≥ 1021`, `pointer-events:auto`), puis rejouer les 10 tests `around-me`. **HORS périmètre du PR « chemin argent »** (fonctionnalité flaggée, domaine UI) → tâche UI dédiée. Correctif harnais déjà appliqué dans le PR courant : la spec vise le bon serveur, le bon gate (`?world_around_me=1`) et referme le bandeau cookies — elle échoue désormais sur le **vrai** bug au lieu d'une illusion de test.

### BUG-2026-013 — Boucle Factory : le modèle local corrompt les chemins et écrit à côté de la cible

- **Date** : 2026-11-08 · **Sévérité** : HIGH (bloque la production de PR par l'agent)
- **Fichier** : `.ai/ux-agent/opencode-auto.cjs` (modèle sélectionné par `scripts/autopilot/local-model-router.cjs`)
- **Description** : le modèle local installé sur le PC du fondateur (`tripolskypetr/qwen3.5-uncensored-aggressive:9b`) **corrompt les chemins de fichiers** à la tokenisation. Preuve par sonde contrôlée : l'agent appelle bien son outil d'écriture (« Wrote file successfully »), mais écrit dans `tests/u nit/.agent-probe.txt` au lieu de `tests/unit/.agent-probe.txt`. L'écriture part donc à côté de la cible : le diff du worktree reste vide et le scope-guard refuse le no-op — **correctement**, mais la boucle ne produit aucune PR.
- **Reproduction** : `node .ai/ux-agent/opencode-auto.cjs run "Cree le fichier tests/unit/.agent-probe.txt avec le contenu PROBE-OK-1234"` (avec les credentials cloud retirés) → le fichier est créé sous `tests/u nit/`.
- **Correctif APPLIQUÉ dans le dépôt** : le harness ne perd plus l'information — `implement.cjs` conserve stdout **et** stderr (le CLI écrit les appels d'outils sur stderr) et le motif de parcage porte un extrait de la trace de l'agent. Le scope-guard reste inchangé : **ce qu'il refuse reste refusé**.
- **Plan** : installer sur le PC un modèle `*-coder` (par ex. `qwen2.5-coder:7b`) — le routeur local préfère **déjà** `qwen3-coder:30b` > `qwen2.5-coder:32b` > `*-coder` > premier modèle, donc **aucune modification de code** n'est nécessaire. À défaut, passer le runner sur un modèle cloud dédié. Le modèle « uncensored aggressive » n'est pas adapté à l'édition de fichiers.

### BUG-2026-010 — Boucle Factory : l'agent local n'a pas de provider `ollama` dans OpenCode

- **Date** : 2026-11-08 · **Sévérité** : HIGH (bloque toute implémentation autonome)
- **Fichier** : `.ai/ux-agent/opencode-auto.cjs`, `~/.config/opencode/opencode.json` (config **globale du fondateur**)
- **Description** : OpenCode 1.18.34 n'expose **aucun** provider `ollama` intégré sur cette machine. `opencode models ollama` → `Provider not found: ollama`, et l'agent échouait avec une erreur opaque (`Unexpected server error`) alors que le modèle local répondait parfaitement (Ollama sert une API compatible OpenAI sur `/v1`). **Cause exacte** : la config globale déclare `provider.ollama` **sans `npm`** et avec `models: {}` → le provider n'est pas enregistré. Retirer l'override ne suffit pas (testé) : il faut le **déclarer** avec `npm: "@ai-sdk/openai-compatible"`.
- **Reproduction** : `opencode models ollama` → `Provider not found: ollama` ; `opencode run --model ollama/tripolskypetr/qwen3.5-uncensored-aggressive:9b "ping"` → `ProviderModelNotFoundError`.
- **Correctif APPLIÉ dans le dépôt** : l'adaptateur écrit une déclaration de provider à l'exécution et l'exporte via `OPENCODE_CONFIG` — **fusionnée** avec la config globale (permissions `edit`/`bash: allow` conservées), **jamais** écrasée. **Vérifié** : `exit 0`, le modèle local répond.
- **Plan** : la config globale du fondateur reste inchangée (c'est son outil quotidien). Si une config **projet** (`opencode.json` à la racine du dépôt) est souhaitée, elle doit être validée à part : elle s'applique à toutes les sessions opencode du dépôt.

### BUG-2026-011 — Boucle Factory : le garde-fou visuel compare toujours « match »

- **Date** : 2026-11-08 · **Sévérité** : MEDIUM (un gate de non-régression ne surveille plus rien)
- **Fichier** : `scripts/autopilot/visual-qa.cjs`, `package.json`
- **Description** : `visual-qa.cjs` lance un script fils (`cwd = racine du dépôt`) qui fait `require('pngjs')` et `require('pixelmatch')`. Ces deux paquets **ne sont pas** dans `package.json` ni `package-lock.json` → sur un `npm ci` propre, la comparaison échoue en silence et le gate visuel devient un **toujours-pass**.
- **Reproduction** : `npm ci` dans un checkout propre puis `node -e "require.resolve('pngjs')"` → `MODULE_NOT_FOUND`.
- **Contournement local** : `npm install pngjs pixelmatch --no-save` dans `C:\Users\user\sargagame-runner` (package.json / lock **intouchés**).
- **Plan** : PR **dédiée** pour ajouter les dépendances — les ajouter déclencherait `cloudflare-production.yml` au merge, donc hors périmètre d'une PR d'outillage.

### BUG-2026-012 — Boucle Factory : missions AUTOPILOT parquées « Scope fichiers manquant »

- **Date** : 2026-11-08 · **Sévérité** : MEDIUM
- **Fichier** : `scripts/autopilot/multi-repo-bridge.cjs` (contrat), `scripts/autopilot/ux-hypothesis.cjs` (validation)
- **Description** : les missions #1345, #1338, #1337, #1336 ne déclarent pas `filesToModify` → l'hypothèse UX est rejetée (« Scope fichiers manquant ») et la mission est parquée. **Comportement VOLONTAIRE** : le pont n'invente pas de périmètre, car c'est la base de la `denyGlobs` et du scope-guard. Mais une mission sans périmètre n'est pas exécutable.
- **Reproduction** : commentaire `blocked` « UX hypothesis invalid: Scope fichiers manquant » sur l'issue correspondante.
- **Plan** : soit compléter les missions (côté ChatGPT), soit définir une inférence de périmètre **prudente** par type d'opportunité, validée par le scope-guard existant.

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

### BUG-2026-021 — Boucle Factory : heartbeat muet pendant les cycles longs + échec d'agent non diagnostiquable

- **Date** : 2026-11-08 · **Fix** : PR #1364 (@coding_agent) — défauts #11 et #12, reproduits sur le PC réel.
- **Détail** :
  1. **Heartbeat muet** : heartbeat du lock, instantané `status.json` et ping healthchecks n'étaient rafraîchis qu'aux frontières de cycle. Un cycle exécutant l'agent dure jusqu'à 25 min → `status.json` affichait un `lastHeartbeat` vieux de **674 s** (mesuré) et le dead-man's switch ne recevait aucun ping. Un opérateur pouvait arrêter le runner au moment où il produisait du travail. Le lock n'était jamais en danger (`lib/lock.cjs` fail-closed sur pid vivant) : le défaut était dans le signal. Correctif : `writeStatusSnapshot()` factorisé + gardien de vie par cycle (60 s), arrêté en `finally`.
  2. **Échec d'agent non diagnostiquable** : le parcage ne disait que `FAIL_TARGET_UNCHANGED: no files modified by agent`. `implement.cjs` ne conservait que stdout, alors que le CLI OpenCode écrit les appels d'outils sur **stderr** ; et le motif de parcage ne mentionnait jamais l'agent. Correctif : `agentLog` conserve stdout **et** stderr, et le motif de parcage porte un extrait de la trace. Le scope-guard reste inchangé.
- **Garde-fous** : 6 assertions sur l'invariant « le heartbeat bat pendant le cycle » (`autopilot-clean-checkout-runnable.test.cjs`), 3 sur l'invariant « un agent sans changement reste diagnostiquable » (`autopilot-local-agent-contract.test.cjs`). Le garde du heartbeat a été **prouvé** capable de détecter sa régression.

### BUG-2026-020 — Boucle Factory : 10 défauts d'exécution découverts le 2026-11-08

- **Date** : 2026-11-08 · **Fix** : PR #1364 (@coding_agent) — tous reproduits sur le PC réel, corrigés **et** verrouillés par des garde-fous.
- **Détail** :
  1. `lib/notify.cjs` **jamais commité** (`require` ajouté par `efdcde9da` sans le fichier) → `MODULE_NOT_FOUND` avant le premier cycle sur tout checkout propre.
  2. Trace du runner **perdue** : `cmd.exe` tient `runner.log` en mode exclusif → `EBUSY` sur chaque append, avalé par un `catch` vide → la factory tournait sans trace observable.
  3. `C.paths.statusFile` **inexistant** → l'instantané d'état n'était jamais écrit (erreur avalée par un `catch` vide).
  4. `manualOpencodeSessionActive()` **appelée mais jamais exportée** → `TypeError` à chaque cycle.
  5. Contrat de mission **non normalisé** (pas de `type`) → toutes les missions importées parquées avant dispatch.
  6. `expectedImpact: 'n/a'` (3 caractères, minimum 20) → missions parquées « AHA insuffisamment défini ».
  7. Instantané d'état **mensonger** : `autoMergeEnabled` codé en dur à `true` (config : `false`) ; `cycleSuccess` **structurellement toujours `false`**.
  8. Code de sortie non nul de l'orchestrateur **non compté** → ni alerte Discord, ni pause de sécurité (boucle infinie silencieuse possible).
  9. **Boucle infinie** : opportunités d'analyse/découverte jamais persistées → `parkTask()` NO-OP → même candidat re-sélectionné toutes les 30 s, **0 travail produit**.
  10. **Agent local jamais démarré** (`exit 3`) : credentials cloud hérités dans l'env du spawn + provider `ollama` absent d'OpenCode 1.18.34.
- **Garde-fous** : `tests/unit/autopilot-clean-checkout-runnable.test.cjs`, `tests/unit/autopilot-queue-persistence-loop.test.cjs`, `tests/unit/autopilot-local-agent-contract.test.cjs` (+ extension du test de câblage, 44 assertions).

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