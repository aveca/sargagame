# Boucle de Travail Autonome 24/7 — Sargagame

> Ce document définit la boucle que chaque agent suit en autonomie.
> Déclenchée par : cron GH Actions, webhook PR merged, ou agent manuel.

## Principe — Boucle sérialisée RELEASE (2026-08-24)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BOUCLE AUTONOME SÉRIALISÉE (RELEASE)                  │
├─────────────────────────────────────────────────────────────────────────┤
│  0. FETCH   → git fetch origin --prune (OBLIGATOIRE avant tout)          │
│  1. READ    → .ai/current_state.md + .ai/tasks.md (sur origin/main)     │
│  2. GATE    → release-serialize: worktree clean, lock, PR unique, etc.  │
│  3. PICK    → Priorité #1 non assignée (P0 > P1 > P2 > P3)               │
│  4. CLAIM   → Marquer [~] in_progress by <agent> @<baseSha> (base SHA)   │
│  5. LOCK    → .agent-workspace.lock (90 min) + branche depuis baseSha    │
│  6. WORK    → Analyser → Coder → Tester → Commit (un seul worktree)      │
│  7. VALIDATE→ Gate de ship (build + smoke + bundle + PHP)                │
│  8. REBASE? → git fetch; si main avancé incompatible → abort + rebase    │
│  9. DOCUMENT→ MAJ .ai/current_state.md + .ai/changelog.md                │
│ 10. HANDOFF → Push branche + créer PR (une seule PR active/scope)        │
│ 11. MERGE   → CI 6/6 GREEN → squash merge → concurrency release           │
│ 12. DEPLOY  → daily-copernicus + Pages → health-check 6 domaines         │
│ 13. REBASE  → autres agents: git fetch origin && git rebase origin/main  │
│ 14. LOOP    → Retour à 0 (fetch)                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Sérialisation RELEASE — garanties (2026-08-24)

| Garantie | Implémentation | Fichier |
|----------|----------------|---------|
| **fetch obligatoire avant claim** | `git fetch origin --prune` en tête de `runReleaseGate()`, bloque si échec | `scripts/lib/release-serialize.cjs:fetchOrigin()` |
| **verrou de tâche** | `tasks.md` sur `origin/main` vérifié: si `[~]` ou `[x]` déjà, abort `ALREADY_CLAIMED/DONE` | `isTaskClaimedOrDoneOnMain()` |
| **base SHA enregistrée** | `git rev-parse origin/main` stocké dans claim `— in_progress by <agent> @abc123 (base:abc123)` | `claimTask(..., baseSha)` |
| **détection correctif déjà mergé** | `git log origin/main --grep=TASK-ID` + `tasks.md` `[x]` sur main → `ALREADY_MERGED` | `isFixAlreadyOnMain()` |
| **une seule PR active par scope** | `gh pr list --state open --json headRefName` → `agent/*` count >0 → bloque `PR_ACTIVE` | `hasActiveAgentPR()` + `concurrency: group: release-serialize` dans workflow |
| **arrêt auto si main avancé incompatible** | `git diff --name-only baseSha..origin/main` vs `baseSha..HEAD` overlap → `INCOMPATIBLE` | `checkIncompatibleAdvance()` |
| **aucun agent ne modifie même worktree** | `git diff --stat` + `git diff --cached --stat` + `.agent-workspace.lock` TTL 90 min | `checkWorktreeClean()`, `checkWorkspaceLock()` |
| **après merge/deploy, rebase** | post-merge step `git fetch origin` + message `rebase depuis nouveau main` | `.github/workflows/agent-handoff.yml` + `rebaseDecisionFromNewMain()` |

## Étapes détaillées — SÉRIALISÉES

### 0. FETCH — Obligatoire avant tout (sérialisation)
```bash
git fetch origin --prune
# Enregistrer base SHA pour tout le cycle
BASE_SHA=$(git rev-parse origin/main)
echo "base origin/main=$BASE_SHA"
# Vérifier gate sérialisé
node scripts/lib/release-serialize.cjs --check --task TASK-PX-XXX --agent coding --scope money
# Vérifier worktree clean + lock
node scripts/lib/release-serialize.cjs --check-worktree
node scripts/lib/release-serialize.cjs --check-lock
# Une seule PR active ? (gh pr list)
```

### 1. READ — Lire l'état courant (sur origin/main frais)
```bash
# Obligatoire au début de CHAQUE session — après FETCH
git show origin/main:.ai/current_state.md | head -80
git show origin/main:.ai/tasks.md | head -120
cat .ai/current_state.md
cat .ai/tasks.md
npm run session  # métriques jour + fraîcheur pipeline
```

### 2. PICK — Choisir la tâche (après FETCH + GATE)
- Lire `origin/main:.ai/tasks.md` (frais, pas le local stale)
- Filtrer : `[ ]` (non commencé) + priorité max (P0 > P1 > P2 > P3) — exclure les `[~]` déjà lockés et `[x]` déjà mergés
- Vérifier `node scripts/lib/release-serialize.cjs --check --task TASK-ID --agent <type>` → `ALREADY_MERGED/ALREADY_CLAIMED/PR_ACTIVE` → skip
- Si plusieurs même priorité : ordre FIFO (plus haut dans le fichier)
- **Jamais** prendre 2 tâches en même temps — une seule PR `agent/*` active à la fois (concurrency `release-serialize`)

### 3. CLAIM — Revendiquer la tâche (avec base SHA)
```markdown
# Dans .ai/tasks.md, modifier la ligne (après fetch, gate OK, lock acquis) :
- [ ] TASK-P1-001 Purger les A/B tests morts
# En :
- [~] TASK-P1-001 Purger les A/B tests morts — in_progress by coding_agent @abc1234 (base:abc1234)
# base: = origin/main SHA au moment du fetch
```
Commit immédiat : `chore(tasks): claim TASK-P1-001 by coding_agent @abc1234`
Verrou workspace: `node scripts/lib/release-serialize.cjs --lock --task TASK-P1-001 --base $BASE_SHA --agent coding` → `.agent-workspace.lock` (TTL 90 min)

### 4. BRANCH — Créer la branche de travail (depuis base SHA)
```bash
git checkout -b agent/coding/TASK-P1-001 $BASE_SHA
# ou: git checkout -b agent/coding/TASK-P1-001 origin/main (après fetch frais)
# Convention : agent/<rôle>/<task-id>
# Rôles : product, architect, coding, qa, ui, security, devops, data, growth
# Garantie: branche part toujours du dernier origin/main, jamais d'un main local stale
```

### 5. WORK — Travailler (cycle interne)

#### 5.1 Analyser (obligatoire avant tout code)
```bash
# Comprendre le code existant
grep -rn "pattern" src/ scripts/ public/
rg "symbol" --type js --type jsx --type php
# Lire les fichiers concernés
```

#### 5.2 Coder (petits changements, commits fréquents)
- Un commit par unité logique
- Message conventionnel : `type(scope): description`
- Types : `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `perf`, `ci`

#### 5.3 Tester (Gate de ship LOCAL avant push)
```bash
# 0. Syntaxe
for f in $(git diff --name-only --diff-filter=ACM | grep -E '\.(jsx?|mjs|cjs)$'); do
  npx esbuild "$f" --bundle=false --log-level=error --outfile=/dev/null || exit 1
done
for f in $(git diff --name-only --diff-filter=ACM | grep -E '\.php$'); do php -l "$f" || exit 1; done

# 1. Build
npm run build || exit 1

# 2. Bundle budget
node scripts/check-bundle-budget.cjs || exit 1

# 3. Serve build prod
npx vite preview --port 4173 &
PREVIEW_PID=$!

# 4. Playwright prêt
node -e "require('playwright').chromium.executablePath()" >/dev/null || npx playwright install chromium

# 5. Smoke funnel
node scripts/ux-smoke.mjs | tee /tmp/smoke.log
grep -q 'FUNNEL_REACHED=map+fiche+paywall' /tmp/smoke.log && \
grep -q 'ERRORS=\[\]' /tmp/smoke.log && \
grep -q 'WHITE_OR_TRANSPARENT_BUTTONS=\[\]' /tmp/smoke.log && \
grep -q 'RM_INFINITE=\[\]' /tmp/smoke.log || { echo "SMOKE FAIL"; kill $PREVIEW_PID; exit 1; }

kill $PREVIEW_PID
```

#### 5.4 Corriger si échec → retour 5.2

### 6. VALIDATE — Gate de ship passé
Tous les checks ci-dessus verts = prêt pour handoff.

### 7. DOCUMENT — Mettre à jour la mémoire

#### 7.1 `.ai/changelog.md` (ajouter au DÉBUT)
```markdown
## 2026-07-31 — coding_agent

**TASK-P1-001 : Purge A/B tests morts**
- Supprimé 23 flags `abVariant()` non significatifs
- Gardé 7 flags validés (fc7, ladder, badges, alerts, space, h2snote, streak7, partners, pwcomic)

**Fichiers modifiés :**
- `src/Sargasses_PROD.jsx` — lignes ~XXX-YYY
- `src/ChasseHome.jsx` — lignes ~XXX-YYY
```

#### 7.2 `.ai/current_state.md` (ajouter au DÉBUT — format handoff)
Utiliser le template `.ai/handoff-template.md`

#### 7.3 `.ai/tasks.md` (marquer done)
```markdown
- [x] TASK-P1-001 Purger les A/B tests morts — done by coding_agent (2026-07-31)
```

### 8. HANDOFF — Passer la main (avec vérif incompatibilité)

```bash
# Avant push, vérifier que main n'a pas avancé de manière incompatible
git fetch origin --prune
node scripts/lib/release-serialize.cjs --check --task TASK-P1-001 --agent coding
# Si INCOMPATIBLE (overlap fichiers) → abort + git rebase origin/main + restart

# Vérifier une seule PR active par scope (déjà fait au claim, re-vérifier)
gh pr list --state open --json headRefName | grep agent/

# Push branche
git push origin agent/coding/TASK-P1-001

# Créer PR via GitHub CLI
gh pr create --title "TASK-P1-001: Purge A/B tests morts" \
  --body "Closes TASK-P1-001. Purge 23 non-significant abVariant flags. Gate passed. Base: $BASE_SHA" \
  --base main
```

**Merge auto** : Si CI 6/6 GREEN (secret, funnel, CI, perf, playwright, branch-policy + `concurrency: release-serialize`) → squash merge → `origin/main` avance → `concurrency` libère le prochain agent
- Déclenche `daily-copernicus.yml` → build 5 régions + deploy FTP + health-check
- Vérification post-deploy : `curl` sur URL prod 6 domaines
- Lock `.agent-workspace.lock` libéré au `git push` (ou `--complete`)

### 9. LOOP — Recommencer (depuis nouveau main)
```bash
# Après merge d'un autre agent, TOUS les agents en attente doivent:
git fetch origin --prune
git rebase origin/main  # ou: git checkout main && git pull
# Puis relire origin/main:.ai/tasks.md pour re-pick (tâche déjà mergée → skip)
node scripts/lib/release-serialize.cjs --rebase-check
```
Retour à l'étape 0. FETCH pour la prochaine tâche.

---

## Automatisation GitHub Actions

Le workflow `.github/workflows/agent-handoff.yml` peut :
- Déclencher la boucle sur schedule (ex: toutes les 4h)
- Créer une issue "Agent handoff" avec la tâche pickée
- Assigner un runner auto-hébergé pour exécuter le travail

## Gestion des conflits — SÉRIALISÉE (2026-08-24)

- **Avant claim**: `git fetch origin` obligatoire + `release-serialize` gate. Si `origin/main` a déjà `[~]` ou `[x]` pour la tâche → `ALREADY_CLAIMED/ALREADY_MERGED` → abort, pick suivant.
- **Une seule PR active**: `gh pr list --state open --head agent/` → si >0, nouveau claim bloqué `PR_ACTIVE` (concurrency `release-serialize` côté GH Actions). Attendre merge de la PR active.
- **Si 2 agents claim simultanément** (race fetch→claim): le premier qui push son `chore(tasks): claim` gagne (fast-forward sur `origin/main`). Le second voit `git push` rejeté → `git fetch` → relit `origin/main:.ai/tasks.md` → pick suivant.
- **Si correctif déjà mergé**: `git log origin/main --grep=TASK-ID` ou fichier déjà présent → gate `ALREADY_MERGED` → marquer `[x] done` local et passer au suivant, sans créer de branche.
- **Après merge**: workflow post-merge `Rebase other agents` → `git fetch origin --prune` → les autres agents en cours doivent `git fetch && git rebase origin/main` ou abort si incompatible (fichiers overlap → `INCOMPATIBLE`).

## Arrêt d'urgence

Si une tâche casse `main` :
```bash
git revert <bad-commit> --no-edit
git push origin main
# Déclenche re-deploy auto → rollback en prod < 15 min
```
Documenter dans `.ai/changelog.md` + `.ai/bugs.md`

---

## Règles d'or — SÉRIALISÉES (2026-08-24)

1. **Un agent = une tâche à la fois + un seul worktree modifié** (`git diff` doit être clean avant claim, `.agent-workspace.lock` 90 min)
2. **fetch obligatoire avant claim** (`git fetch origin --prune` → `origin/main` SHA = base, enregistrée dans claim `@abc123`)
3. **Toujours tester LOCAL avant push** (Gate de ship: esbuild, build, bundle ≤210 Ko, smoke 4 tokens, PHP lint)
4. **Commit + push à chaque chunk** (pas de travail non-poussé) + vérifier `main` n'a pas avancé de manière incompatible avant push (`base..origin/main` overlap)
4. bis **Une seule PR active par scope** (`agent/*` global, concurrency `release-serialize` + `gh pr list` gate → `PR_ACTIVE`)
5. **Documenter AVANT de passer la main** (changelog + current_state + tasks → `[x] done`)
6. **Merge auto sur main si CI 6/6 GREEN** (secret, funnel, CI, perf, playwright, branch-policy) — jamais demander permission
7. **Après merge/deploy, rebase** (`git fetch origin && git rebase origin/main` ou `rebaseDecisionFromNewMain()`) avant prochain pick
8. **Rollback documenté** pour tout ajout conversion/UI (`?flag=0`) + détection `ALREADY_MERGED` évite les doublons
9. **Ne jamais ignorer une erreur** — corriger ou documenter comme known issue (`ALREADY_MERGED/INCOMPATIBLE/PR_ACTIVE` = arrêts normaux sérialisés)