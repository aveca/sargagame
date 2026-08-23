# Boucle de Travail Autonome 24/7 — Sargagame

> Ce document définit la boucle que chaque agent suit en autonomie.
> Déclenchée par : cron GH Actions, webhook PR merged, ou agent manuel.

## Principe

```
┌─────────────────────────────────────────────────────────────┐
│                    BOUCLE AUTONOME                          │
├─────────────────────────────────────────────────────────────┤
│  1. READ    → .ai/current_state.md + .ai/tasks.md           │
│  2. PICK    → Priorité #1 non assignée (P0 > P1 > P2 > P3)  │
│  3. CLAIM   → Marquer [~] in_progress by <agent>            │
│  4. BRANCH  → git checkout -b agent/<type>/<task-id>        │
│  5. WORK    → Analyser → Coder → Tester → Commit            │
│  6. VALIDATE → Gate de ship (build + smoke + bundle + PHP)  │
│  7. DOCUMENT → MAJ .ai/current_state.md + .ai/changelog.md  │
│  8. HANDOFF → Push branche + créer PR + MAJ task [x] done   │
│  9. LOOP    → Retour à 1                                    │
└─────────────────────────────────────────────────────────────┘
```

## Étapes détaillées

### 1. READ — Lire l'état courant
```bash
# Obligatoire au début de CHAQUE session
cat .ai/current_state.md
cat .ai/tasks.md
npm run session  # métriques jour + fraîcheur pipeline
```

### 2. PICK — Choisir la tâche
- Lire `.ai/tasks.md`
- Filtrer : `[ ]` (non commencé) + priorité max (P0 > P1 > P2 > P3)
- Si plusieurs même priorité : ordre FIFO (plus haut dans le fichier)
- **Jamais** prendre 2 tâches en même temps

### 3. CLAIM — Revendiquer la tâche
```markdown
# Dans .ai/tasks.md, modifier la ligne :
- [ ] TASK-P1-001 Purger les A/B tests morts
# En :
- [~] TASK-P1-001 Purger les A/B tests morts — in_progress by coding_agent
```
Commit immédiat : `chore(tasks): claim TASK-P1-001`

### 4. BRANCH — Créer la branche de travail
```bash
git checkout -b agent/coding/TASK-P1-001
# Convention : agent/<rôle>/<task-id>
# Rôles : product, architect, coding, qa, ui, security, devops, data, growth
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

### 8. HANDOFF — Passer la main

```bash
# Push branche
git push origin agent/coding/TASK-P1-001

# Créer PR via GitHub CLI ou MCP
gh pr create --title "TASK-P1-001: Purge A/B tests morts" \
  --body "Closes TASK-P1-001. Purge 23 non-significant abVariant flags. Gate passed." \
  --base main

# OU via MCP github__create_pull_request
```

**Merge auto** : Si CI vert → merge direct sur `main` (pas de demande permission)
- Déclenche `daily-copernicus.yml` → build 5 régions + deploy FTP + health-check
- Vérification post-deploy : `curl` sur URL prod

### 9. LOOP — Recommencer
Retour à l'étape 1 pour la prochaine tâche.

---

## Automatisation GitHub Actions

Le workflow `.github/workflows/agent-handoff.yml` peut :
- Déclencher la boucle sur schedule (ex: toutes les 4h)
- Créer une issue "Agent handoff" avec la tâche pickée
- Assigner un runner auto-hébergé pour exécuter le travail

## Gestion des conflits

Si 2 agents pickent la même tâche :
- Le premier à pusher sa branche gagne
- L'autre voit le conflit au `git push` → relit `.ai/tasks.md` → pick suivant

## Arrêt d'urgence

Si une tâche casse `main` :
```bash
git revert <bad-commit> --no-edit
git push origin main
# Déclenche re-deploy auto → rollback en prod < 15 min
```
Documenter dans `.ai/changelog.md` + `.ai/bugs.md`

---

## Règles d'or

1. **Un agent = une tâche à la fois**
2. **Toujours tester LOCAL avant push** (Gate de ship)
3. **Commit + push à chaque chunk** (pas de travail non-poussé)
4. **Documenter AVANT de passer la main** (changelog + current_state + tasks)
5. **Merge auto sur main si CI vert** (jamais demander permission)
6. **Rollback documenté** pour tout ajout conversion/UI (`?flag=0`)
7. **Ne jamais ignorer une erreur** — corriger ou documenter comme known issue