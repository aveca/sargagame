# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

---

## 🟥 Non résolus

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