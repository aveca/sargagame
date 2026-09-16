# Matrice Agentique Finale — Sargagame

> Audit 2026-09-16. Basé sur l'existant réel vérifié dans le repo.
> Format : agent | modèle | rôle | skills | boot | offline | sync | handoff | worktree | deploy | data | payment

---

## Matrice Principale

| Agent | Modèle | Rôle (AGENTS.md) | Skills Principales | Boot Protocol | Mode Offline | Sync Mechanism | Handoff Format | Worktree | Déploye | Accès Données | Accès Paiement |
|-------|--------|------------------|-------------------|---------------|--------------|----------------|----------------|----------|---------|---------------|----------------|
| **Product Agent** | Opus/Claude | Roadmap, priorisation, feedback | `sg-session-startup`, `sargasses`, `funnel-review` | `npm run session` → read tasks.md → pick P0 | Partiel (lecture repo, analyse) | GitHub Issues + tasks.md | `NEXT_SESSION.md` (tête) + `.ai/current_state.md` | `agent/product/*` | ❌ | Supabase (lecture), daily-metrics.json | ❌ |
| **Architect Agent** | Opus/Claude | Architecture, dette tech, décisions | `cloudflare`, `workers-best-practices`, `agents-sdk`, `durable-objects` | `npm run session` → read decisions.md | ✅ (analyse archi locale) | PR + decisions.md | `.ai/current_state.md` (template) + decisions.md | `agent/architect/*` | ❌ | ❌ | ❌ |
| **Coding Agent** | Opus/Claude | Features, bugs, refactor, tests | `sg-design-system`, `sg-svg-scene`, `workers-best-practices`, `wrangler` | `npm run session` → gate → claim → branch | ✅ (code local, test local) | Git push + PR auto-merge | `.ai/current_state.md` (template) + changelog + tasks `[x]` | `agent/coding/*` | Via PR merge → daily-copernicus | Supabase (REST), regions/*.json | Mollie/PayPal (additif only, php -l) |
| **QA Agent** | Opus/Claude | Playwright E2E, bugs UI, parcours | `sg-ux-audit`, `web-perf`, `sg-session-startup` | `npm run session` → run tests | ❌ (Playwright requis) | CI `ci-tests.yml` + `perf-budget.yml` | `.ai/current_state.md` + bugs.md | `agent/qa/*` | ❌ | Test data seulement | Test sandbox seulement |
| **UI/UX Agent** | Opus/Claude | Design system, responsive, a11y | `sg-design-system`, `sg-svg-scene`, `sg-ux-audit`, `video-brief` | `npm run session` → audit visuel | ✅ (design tokens, specs) | PR + screenshots | `.ai/current_state.md` + screenshots | `agent/ui/*` | ❌ | ❌ | ❌ |
| **Security Agent** | Opus/Claude | Dépendances, secrets, RGPD | `workers-best-practices`, `cloudflare-one`, `turnstile-spin` | `npm run session` → audit deps | ✅ (audit local) | Secret scan GH Actions | `.ai/current_state.md` | `agent/security/*` | ❌ | ❌ | ❌ |
| **DevOps Agent** | Opus/Claude | CI/CD, FTP, monitoring, backups | `wrangler`, `cloudflare`, `cloudflare-email-service`, `sg-session-startup` | `npm run session` → gh run list | ❌ (Cloudflare API) | GH Actions workflows | `.ai/current_state.md` + run logs | `agent/devops/*` | ✅ (wrangler deploy, FTP) | Secrets GH, Supabase tokens | Secrets GH (MOLLIE_API_KEY) |
| **Data Agent** | Opus/Claude | Pipeline ERDDAP, forecast, analytics | `sargasses`, `web-perf`, `durable-objects` | `npm run session` → check pipeline | ❌ (ERDDAP, Supabase) | `daily-copernicus.yml` + daily-metrics.json | `.ai/current_state.md` + data logs | `agent/data/*` | ❌ | ✅ (Supabase, ERDDAP, analytics) | ❌ |
| **Growth Agent** | Opus/Claude | SEO, CRO, B2B outreach, rétention | `sargasses`, `funnel-review`, `video-brief`, `sg-design-system` | `npm run session` → check metrics | Partiel (analyse locale) | `weekly-seo-automation.yml`, `weekly-ux-report.yml` | `.ai/current_state.md` + outreach logs | `agent/growth/*` | ❌ | daily-metrics.json, GSC/GA4 | ❌ |
| **Release Agent** | Opus/Claude | Gate de ship, deploy, vérif prod | `sg-session-startup`, `wrangler`, `workers-best-practices`, `release-serialize.cjs` | `npm run session` → gate local complet | ❌ (deploy requis) | `release-serialize.cjs` + CI 6/6 | `.ai/current_state.md` + curl verification | `agent/release/*` | ✅ (merge → auto-deploy) | Health-check prod | Verify Mollie webhook prod |
| **Univers & Motion Agent** | Opus/Claude | Storytelling, copy, SVG, clips, B2B | `sg-design-system`, `sg-svg-scene`, `video-brief`, `sargasses` | `npm run session` → read STORY/ | ✅ (création locale) | PR + assets | `.ai/current_state.md` + STORY/ updates | `agent/univers/*` | ❌ | ❌ | ❌ |

---

## Modèles Supportés

| Modèle | Agents Compatibles | Notes |
|--------|-------------------|-------|
| **Claude Code (Opus/Sonnet)** | Tous | Modèle principal, mandat fondateur 100% mobile |
| **OpenCode** | Coding, QA, DevOps, Data | CLI agent, même permissions |
| **Codex** | Coding, Architect | GitHub-integrated |
| **Gemini** | Growth, Data | Analyse large context |
| **Local (Ollama)** | Coding, QA | Offline-first, pas de deploy |

> **Règle** : Le système est **model-agnostic**. Les instructions (AGENTS.md, CLAUDE.md, skills) sont portables. Le mandat fondateur s'applique quel que soit le modèle.

---

## Protocoles Standardisés

### BOOT (Début de Session)
```bash
# 1. Identifier rôle + repo + worktree + branche
# 2. Lire gouvernance
cat AGENTS.md CLAUDE.md
# 3. Lire état courant (source canonique)
cat NEXT_SESSION.md                    # Tête concise (survit cross-container)
cat .ai/current_state.md | head -80    # Dernière entrée détaillée
# 4. Lire décisions + tâche prioritaire
cat .ai/decisions.md
cat .ai/tasks.md | head -50
# 5. Inspecter Git
git fetch origin --prune
git status
# 6. Vérifier agents concurrents + locks
node scripts/lib/release-serialize.cjs --check-worktree
node scripts/lib/release-serialize.cjs --check-lock
# 7. Exécuter bootstrap métriques
npm run session   # 7 checks : pipeline, métriques, MRR, GH Actions, mémoire, auto-trigger
# 8. SEULEMENT ALORS commencer à agir
```

### SHUTDOWN (Fin de Session)
```bash
# 1. Gate de ship LOCAL (obligatoire)
npm run build
node scripts/check-bundle-budget.cjs
php -l sur .php touchés
node scripts/ux-smoke.mjs | grep -E 'FUNNEL_REACHED|ERRORS\=|WHITE_OR_TRANSPARENT_BUTTONS|RM_INFINITE'
# 2. Documenter AVANT de passer la main
#    - .ai/changelog.md (entrée au début)
#    - .ai/current_state.md (format handoff-template.md, au début)
#    - .ai/tasks.md → [x] done
#    - NEXT_SESSION.md (tête concise mise à jour)
# 3. Handoff
git push origin agent/<role>/<task-id>
gh pr create --base main
# 4. Indiquer prochaine action optimale dans handoff
```

### OFFLINE / ONLINE

| Phase | Actions OFFLINE-SAFE | Actions ONLINE-REQUIRED |
|-------|---------------------|------------------------|
| **Boot** | Lire repo, analyser, planifier | `git fetch`, `npm run session` (checks 4,6), `gh run list` |
| **Work** | Coder, tester local (build, smoke, PHP lint), documenter | ❌ |
| **Validate** | Gate de ship complet local | ❌ |
| **Handoff** | Préparer commit, handoff template | `git push`, `gh pr create`, `gh pr merge` |
| **Deploy** | ❌ | `daily-copernicus.yml` (auto), `curl` health-check |
| **Recovery** | Rebase local, lire handoff | `git fetch`, rebase `origin/main` |

### SYNC (Synchronisation)
- **Source vérité Git** : `origin/main` (toujours fetch avant claim)
- **Source vérité État** : `NEXT_SESSION.md` (tête) + `.ai/current_state.md` (historique)
- **Source vérité Tâches** : `.ai/tasks.md` sur `origin/main`
- **Source vérité Décisions** : `.ai/decisions.md`
- **Source vérité Métriques** : `daily-metrics.json` + `sargassum.json`
- **Mécanisme** : `release-serialize.cjs` (fetch + gate + lock + base SHA + PR unique + rebase check)
- **Conflit** : `INCOMPATIBLE` → abort + rebase ; `PR_ACTIVE` → attendre merge ; `ALREADY_MERGED` → skip

### HANDOFF (Passation)
Format canonique (`.ai/handoff-template.md`) ajouté au **DÉBUT** de `.ai/current_state.md` :
```
## YYYY-MM-DD HH:MM UTC · Agent: <NOM> (<TYPE>)

### Travail effectué
- **Résumé 1 ligne** : <ce qui a été fait>
- **Détails** : ...

### Fichiers modifiés
- `<chemin/fichier>` — <description>

### Tests réalisés
- [ ] npm run build → exit 0
- [ ] check-bundle-budget → ≤ 210 Ko
- [ ] php -l → OK
- [ ] ux-smoke → 4 tokens OK
- [ ] playwright test → <résultat>

### Problèmes restants
- [ ] <ID> : <description> — <sévérité> — <action>

### Prochaine action recommandée
1. <Action 1> — Rôle : <type>
2. <Action 2> — Rôle : <type>

### Branche / PR
- Branche : `agent/<type>/<task-id>`
- PR : #<numéro>
- Commit head : `<hash>`
```
**Règle** : Mettre à jour **les deux** `NEXT_SESSION.md` (tête) ET `.ai/current_state.md` (détail) à chaque fin de tâche.

### RECOVERY (Reprise après interruption)
1. `git fetch origin --prune`
2. Lire `NEXT_SESSION.md` (tête) → savoir où on en est
3. Lire `.ai/current_state.md` (dernière entrée) → détails complets
4. Lire `.ai/tasks.md` → quelle tâche était `[~]` in_progress
5. Vérifier `git status` → modifications non commitées ?
6. Vérifier `.agent-workspace.lock` → lock expiré ?
7. `node scripts/lib/release-serialize.cjs --rebase-check` → main a avancé ?
8. Reprendre : soit continuer la tâche, soit `agent-handoff.cjs --auto` pour pick suivant
9. **Jamais** considérer "fait" sans revalider (build + smoke + tests)

---

## Automatisations 24/7 (Vérifiées)

| Workflow | Trigger | Rôle | Sérialisation |
|----------|---------|------|---------------|
| `daily-copernicus.yml` | cron 06:00 + push main | Pipeline data + build 5 régions + deploy FTP + health-check | `concurrency: daily-copernicus` |
| `agent-handoff.yml` | cron 4h + dispatch | Boucle autonome agent handoff | `concurrency: release-serialize` (global) |
| `ci-tests.yml` | PR | Lint + tests + build + bundle budget | ❌ |
| `perf-budget.yml` | PR | Bundle budget check | ❌ |
| `weekly-optimize.yml` | cron | Optimisations hebdo | ❌ |
| `weekly-seo-automation.yml` | cron | SEO programmatique | `concurrency: weekly-seo` |
| `weekly-ux-report.yml` | cron | Rapport UX auto | ❌ |
| `apply-supabase-schema.yml` | push main | Schema Supabase auto | ❌ |
| `deploy-live.yml` | dispatch | Deploy manuel 6 domaines | ❌ |

---

## Contradictions Supprimées (Cet Audit)

1. ✅ **Release Agent manquant** → Créé `.ai/roles/release-agent.md`
2. ✅ **BUG-2026-038 doublet OPEN/FIXED** → Nettoyé `.ai/bugs.md` (note redondante supprimée, entrée FIXED conservée)
3. ✅ **Doublon TASK-MQ-BASELINE** → Supprimé dans `.ai/tasks.md` (lignes 221-225)
4. ✅ **Handoff dual ambigu** → Décision documentée `DEC-2026-09-16` : `NEXT_SESSION.md` = source canonique état courant (tête), `.ai/current_state.md` = historique détaillé
5. ✅ **Skills non classifiées** → Créé `.ai/skills-classification.md` avec 8 catégories standardisées

---

## Risques Résiduels / Incompatibilités

| Risque | Impact | Mitigation |
|--------|--------|------------|
| `sg-session-startup` check 3 (MRR) lit `daily-metrics.json` bloc `stripe` mais `NEXT_SESSION.md` section "Ce qui a changé" a des données 2026-07 | Confusion possible MRR | Décision `DEC-2026-09-16` clarifie : `npm run session` dérive MRR depuis `daily-metrics.json`, `NEXT_SESSION.md` = handoff narratif PAS source chiffres |
| `.claude/worktrees/` worktrees partagés → collisions concurrentes | Clobber fichiers | `release-serialize.cjs` check-worktree + lock 90min + `git add` ciblé (pas `git add -A`) |
| `agent-handoff.yml` concurrency `release-serialize` globale (tous agents) | Un seul agent à la fois | Désigné : sérialisation RELEASE intentionnelle pour éviter conflits money-path/funnel/data simultanés |
| `NEXT_SESSION.md` vs `.ai/current_state.md` duplication effort | Maintenance double | Accepté : têtes différentes (concise vs détaillé), même source de vérité pour l'agent qui démarre |
| Skills globales (`~/.agents/skills/`) non versionnées dans repo | Dépendance machine fondateur | Documentées dans `.ai/skills-classification.md` pour transparence ; repo skills dans `.claude/skills/` |

---

## Tests de Validation Post-Changements

```bash
# 1. Syntaxe
npx esbuild scripts/agent-handoff.cjs --bundle=false --log-level=error
npx esbuild .ai/roles/release-agent.md --bundle=false --log-level=error 2>&1 || true  # md non-js
php -l public/api/mollie.php  # vérifier qu'aucun PHP n'a été touché

# 2. Build + Budget
npm run build
node scripts/check-bundle-budget.cjs

# 3. Session startup (doit passer sans erreur)
npm run session

# 4. Agent handoff status (doit afficher état cohérent)
node scripts/agent-handoff.cjs --status

# 5. Release serialize gate (dry-run sur tâche existante)
node scripts/lib/release-serialize.cjs --check --task TASK-P1-001 --agent coding --scope money 2>&1 | head -20

# 6. Vérifier références Release Agent
grep -r "release-agent" .ai/ AGENTS.md CLAUDE.md --include="*.md" | grep -v "Binary"

# 7. Vérifier handoff template toujours valide
cat .ai/handoff-template.md | head -20
```