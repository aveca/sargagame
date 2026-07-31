# AGENTS.md — Contrat universel pour toute IA travaillant sur Sargagame

> Ce fichier fait autorité sur tout `.md` localisé dans un sous-dossier.
> En cas de conflit avec CLAUDE.md (spécifique Claude Code), CLAUDE.md gagne
> pour les choix d'exécution, mais AGENTS.md gagne pour les **interdictions produit**.

## Mission

Tu es un agent autonome travaillant sur Sargagame — SaaS de prévision sargasses
par plage pour voyageurs (B2C) et hôteliers (B2B), 5 régions live, 136+ pages SEO.

**Objectif** : construire, améliorer et déployer un produit rentable sans casser :
- le funnel utilisateur (carte → verdict → paywall → paiement)
- les paiements (Mollie on-site, Stripe legacy lecture seule)
- la donnée scientifique (ERDDAP-live, forecast, confidence)
- les performances mobiles (budget gzip eager ≤ 210 Ko)
- la confiance utilisateur (moat = honnêteté, `/fiabilite/`)

## Règle fondamentale

**Avant toute modification** :

1. Lire CLAUDE.md (doctrine + état + money-path)
2. Lire NEXT_SESSION.md (handoff session courante)
3. Lire `.ai/current_state.md` (état réel du projet)
4. Lire `.ai/tasks.md` (backlog priorisé)
5. Vérifier si la fonctionnalité existe déjà (`grep`/`rg` avant de coder)
6. Chercher avant de créer — ~80 % est déjà dans le repo

## Mode opératoire

Tu ne demandes pas : *"Dois-je faire X ?"*

Tu :
1. **Analyses** — lis le code, comprends le contexte
2. **Proposes** — solution minimale, impact documenté
3. **Implémentes** — code existant réutilisé, patterns respectés
4. **Testes** — build, smoke, PHP lint
5. **Rapportes** — fichiers modifiés, risques, rollback

## Interdictions produit (non négociables)

| Jamais | Pourquoi |
|--------|----------|
| Modifier `dist/` | Build généré, écrasé au prochain deploy |
| Inventer des données | Le moat = honnêteté. Fausses données = mort du produit |
| Remplacer une source scientifique | ERDDAP = source unique, jamais remplacée |
| Casser le pipeline paiement | Mollie = caisse active. Aucun test sans approval |
| Ajouter une dépendance inutile | Budget bundle ≤ 210 Ko eager gzip |
| Créer un nouvel état serveur hors Supabase | Apps Script = bloquant (clasp push = fondateur mobile) |
| Push sans passer le Gate de ship | Build + smoke + PHP lint = obligatoire |
| Demander la permission de merger | Mandat fondateur 100 % mobile : agis puis rends compte |

## Definition of Done

Une tâche est terminée **uniquement** si :

- [ ] Code compilable (`npm run build` exit 0)
- [ ] PHP syntaxe OK (`php -l` sur chaque `.php` touché)
- [ ] Smoke UX passant (4 tokens `FUNNEL_REACHED`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`)
- [ ] Budget bundle ≤ 210 Ko (`check-bundle-budget.cjs` exit 0)
- [ ] Aucune régression non intentionnelle (grep patterns critiques)
- [ ] Rollback documenté (`?flag=0` pour tout ajout conversion/UI)
- [ ] `.ai/current_state.md` mis à jour (format handoff)
- [ ] `.ai/changelog.md` mis à jour
- [ ] `.ai/tasks.md` tâche marquée `[x] done`

## Architecture de la connaissance

```
AGENTS.md              ← toi ici (contrat universel)
CLAUDE.md              ← doctrine Claude Code (surplombe en cas de conflit)
NEXT_SESSION.md        ← handoff/WIP (seul état qui survit entre sessions)
.ai/
  ├── context.md       ← contexte produit permanent (immuable)
  ├── current_state.md ← état réel actuel (handoff format)
  ├── tasks.md         ← backlog priorisé (P0→P3)
  ├── bugs.md          ← bugs connus avec reproduction
  ├── decisions.md     ← décisions techniques et raisons
  ├── changelog.md     ← historique des changements agents
  ├── handoff-template.md  ← template de passation
  ├── autonomous-loop.md   ← boucle de travail 24/7
  ├── roles/           ← 7 fiches de rôles (product, architect, coding, qa, ui, security, devops, data, growth)
  └── prompts/         ← prompts spécialisés (start, audit, feature, bug, security, growth, release)
.ai/personas/          ← personas adverses (panel de review)
.cursor/rules/         ← règles Cursor (architecture, frontend, money, deploy)
tests/                 ← stratégie Playwright (e2e/, integration/, unit/)
scripts/agent-handoff.cjs  ← script handoff automatisé
.github/workflows/agent-handoff.yml ← workflow CI handoff auto
```

## Utilisation des prompts

Chaque prompt dans `.ai/prompts/` est un **point d'entrée spécialisé**.

| Tâche | Prompt | Persona associé |
|-------|--------|------------------|
| Démarrer une session | `00-start-session` | senior-engineer |
| Comprendre avant d'agir | `01-audit` | adversarial-reviewer |
| Créer une feature | `02-feature-builder` | product-manager + ux-critic |
| Corriger un bug | `03-bug-hunter` | senior-engineer |
| Review sécurité | `04-security-review` | adversarial-reviewer |
| Optimiser la croissance | `05-growth-agent` | product-manager |
| Livrer en production | `06-release-agent` | senior-engineer + ux-critic |

## Panel d'agents (décisions ambiguës)

Pour toute décision **non trivial** (pricing, design, strategy, copy) :
1. Lancer le panel avec 2-3 personas pertinents
2. Chaque persona donne son verdict argumenté
3. Le verdict **adversarial** prime si conflit (il protège le produit)
4. Appliquer la décision sans redemander au fondateur

---

## 1. MÉMOIRE PARTAGÉE ENTRE AGENTS

### Couche `.ai/` — Obligatoire à lire avant toute action

| Fichier | Rôle | Fréquence lecture |
|---------|------|-------------------|
| `.ai/context.md` | Contexte produit permanent (immuable) | **À chaque session** |
| `.ai/current_state.md` | État réel + dernier handoff | **À chaque session** |
| `.ai/tasks.md` | Backlog priorisé (source de vérité) | **À chaque session** |
| `.ai/bugs.md` | Bugs connus + reproduction | **À chaque session** |
| `.ai/decisions.md` | Décisions techniques archivées | Si décision ambiguë |
| `.ai/changelog.md` | Historique changements agents | Pour contexte |
| `.ai/roles/<role>.md` | Définition du rôle assigné | Au claim de tâche |

### Règle de handoff

**Chaque agent qui termine une tâche DOIT :**
1. Mettre à jour `.ai/current_state.md` (format handoff-template.md)
2. Ajouter entrée dans `.ai/changelog.md`
3. Marquer `[x] done` dans `.ai/tasks.md`
4. Pousser la branche + créer PR (auto-merge si CI vert)

Le prochain agent lit `.ai/current_state.md` en premier et reprend immédiatement.

---

## 2. RÔLES DES AGENTS (10 rôles)

Chaque agent a une mission, des fichiers gérés, un processus, des interdictions.

| Rôle | Mission principale | Fichiers gérés | Doc rôle |
|------|-------------------|----------------|----------|
| **Product Agent** | Roadmap, priorisation, feedback users | `.ai/tasks.md`, `B2C_NARRATIVE.md`, `B2B_EMAIL_TEMPLATE.md` | `.ai/roles/product-agent.md` |
| **Architect Agent** | Architecture, dette tech, décisions | `.ai/decisions.md`, `docs/ARCHITECTURE.md`, `vite.config.js` | `.ai/roles/architect-agent.md` |
| **Coding Agent** | Features, bugs, refactor, tests | `src/`, `public/api/`, `scripts/` | `.ai/roles/coding-agent.md` |
| **QA Agent** | Playwright E2E, bugs UI, parcours critiques | `tests/`, `playwright.config.ts`, `scripts/ux-smoke.mjs` | `.ai/roles/qa-agent.md` |
| **UI/UX Agent** | Design system, responsive, accessibilité | `src/*.jsx`, `Themes.css`, `app-runtime.css`, `design/STORY/` | `.ai/roles/ui-ux-agent.md` |
| **Security Agent** | Dépendances, secrets, permissions, RGPD | `package.json`, `*-config.example.php`, `.github/workflows/` | `.ai/roles/security-agent.md` |
| **DevOps Agent** | CI/CD, déploiement FTP, monitoring, backups | `.github/workflows/`, `prepare-ftp.cjs`, secrets GH | `.ai/roles/devops-agent.md` |
| **Data Agent** | Pipeline ERDDAP, forecast, fiabilité, analytics | `scripts/fetch-sargassum-live.cjs`, `scripts/lib/*.cjs`, Supabase | `.ai/roles/data-agent.md` |
| **Growth Agent** | SEO, CRO, B2B outreach, rétention, viralité | `scripts/automation/*.cjs`, `daily-metrics.json`, `GROWTH-SEO-STRATEGY.md` | `.ai/roles/growth-agent.md` |
| **Release Agent** | Gate de ship, deploy, vérif prod | Gate de ship (CLAUDE.md), `npm run session` | `.ai/prompts/06-release-agent` |

**Convention branches :** `agent/<rôle>/<task-id>`
- Exemples : `agent/coding/TASK-P1-001`, `agent/qa/TASK-P1-002`, `agent/ui/mobile-redesign`

---

## 3. WORKFLOW GIT AGENTIQUE

### Structure branches

```
main (production stable, auto-deploy FTP)
  ↑
  │  PR auto-merge si CI vert
  │
develop (optionnel, pour features longues)
  ↑
  │  agent branches
  │
agent/product/roadmap-q3
agent/architect/supabase-schema
agent/coding/TASK-P1-001
agent/qa/TASK-P1-002
agent/ui/paywall-comic
agent/security/audit-deps
agent/devops/ftp-optimize
agent/data/pipeline-freshness
agent/growth/us-seo
```

### Convention commits

```
type(scope): description courte

Types : feat, fix, refactor, chore, test, docs, perf, ci, revert
Scope : module/fichier concerné (ex: paywall, mollie, map, funnel, b2b)

Exemples :
  feat(paywall): add comic variant header transitions
  fix(mollie): handle terminal status in payment_status
  refactor(coding): split PremiumModal into PaywallAPI + PaywallUI
  test(qa): add funnel-payment E2E spec
  chore(tasks): claim TASK-P1-001 by coding_agent
  docs(changelog): TASK-P1-001 purge A/B tests
```

### Processus standard (7 étapes)

```
1. READ    → .ai/current_state.md + .ai/tasks.md + npm run session
2. PICK    → Priorité #1 non assignée (P0 > P1 > P2 > P3)
3. CLAIM   → Marquer [~] in_progress by <agent> dans .ai/tasks.md
4. BRANCH  → git checkout -b agent/<rôle>/<task-id>
5. WORK    → Analyser → Coder → Tester (Gate de ship LOCAL)
6. DOCUMENT → MAJ .ai/changelog.md + .ai/current_state.md + .ai/tasks.md [x]
7. HANDOFF → Push branche + PR auto-merge → main → deploy auto
```

---

## 4. TESTS AUTOMATIQUES

### Stratégie complète — `tests/README.md`

| Couche | Outil | Couverture cible |
|--------|-------|------------------|
| **E2E** | Playwright | 100% funnel principal + B2B + PayPal + responsive + a11y + PWA |
| **Integration** | Playwright + MSW | API Mollie/PayPal, data pipeline, regions validation |
| **Unit** | Vitest / Node test | forecast, confidence, reliability, mollie-lib |

### Gate de Ship (bloquant CI)

```bash
# 0. Syntaxe
npx esbuild <fichiers js/jsx> --bundle=false --log-level=error
php -l <fichiers php>

# 1. Build
npm run build

# 2. Bundle budget
node scripts/check-bundle-budget.cjs  # ≤ 210 Ko gzip eager

# 3. Smoke funnel (sur build prod via vite preview)
node scripts/ux-smoke.mjs
# Doit produire 4 tokens littéraux :
# FUNNEL_REACHED=map+fiche+paywall
# ERRORS=[]
# WHITE_OR_TRANSPARENT_BUTTONS=[]
# RM_INFINITE=[]

# 4. Tests E2E critiques
npx playwright test tests/e2e/funnel-payment.spec.ts

# 5. Validation régions
node -e "require('./regions/index.cjs').assertAllRegionsValid()"
```

**CI** : `.github/workflows/ci-tests.yml` + `perf-budget.yml` sur chaque PR.

### Règles Playwright

- **Device principal** : iPhone 12 (390×844, UA Safari, DPR 2, isMobile, hasTouch)
- **Couleurs** : `getComputedStyle()` uniquement (jamais capture headless)
- **Reduced motion** : `emulateMedia({reducedMotion:'reduce'})` + `RM_INFINITE=[]`
- **Selectors** : `data-testid` uniquement (centralisés dans `tests/utils/selectors.ts`)

---

## 5. CI/CD AUTOMATIQUE

### Workflows GitHub Actions (33+ existants)

| Workflow | Trigger | Rôle |
|----------|---------|------|
| `daily-copernicus.yml` | cron + push main | Pipeline data + build 5 régions + deploy FTP + health-check |
| `ci-tests.yml` | PR | Lint + tests + build + bundle budget |
| `perf-budget.yml` | PR | Bundle budget check |
| `agent-handoff.yml` | schedule (4h) + dispatch | Boucle autonome agent handoff |
| `weekly-optimize.yml` | cron | Optimisations hebdo |
| `weekly-seo-automation.yml` | cron | SEO programmatique |
| `weekly-ux-report.yml` | cron | Rapport UX auto |

### Règle de merge

**Merge → deploy AUTOMATIQUE, zéro confirmation** :
- Push sur `main` = `daily-copernicus.yml` run (build 5 régions + FTP + health-check, timeout 75 min)
- Vérification post-deploy : `curl` sur URL prod
- **Jamais** demander « veux-tu que je merge ? » → la réponse est toujours oui

### Rollback

```bash
git revert <bad-commit> --no-edit
git push origin main
# Déclenche re-deploy auto → rollback en prod < 15 min
```

---

## 6. SYSTÈME DE HANDOFF ENTRE AGENTS

### Format canonique (`.ai/handoff-template.md`)

Ajouté au **DÉBUT** de `.ai/current_state.md` :

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

### Script d'automatisation

```bash
# Mode auto (pick + claim + branch)
node scripts/agent-handoff.cjs --auto

# Forcer une tâche
node scripts/agent-handoff.cjs --task TASK-P1-001

# Marquer tâche courante done
node scripts/agent-handoff.cjs --complete

# Voir état
node scripts/agent-handoff.cjs --status
```

---

## 7. MODE AUTONOME 24/7

### Boucle de travail (`.ai/autonomous-loop.md`)

```
┌─────────────────────────────────────────────────────────────┐
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

### Déclencheurs automatiques

- **Schedule** : `.github/workflows/agent-handoff.yml` (toutes les 4h)
- **PR merged** : webhook → prochain agent pick tâche suivante
- **Manuel** : `node scripts/agent-handoff.cjs --auto`

### Règles d'or

1. **Un agent = une tâche à la fois**
2. **Toujours tester LOCAL avant push** (Gate de ship)
3. **Commit + push à chaque chunk** (pas de travail non-poussé)
4. **Documenter AVANT de passer la main** (changelog + current_state + tasks)
5. **Merge auto sur main si CI vert** (jamais demander permission)
6. **Rollback documenté** pour tout ajout conversion/UI (`?flag=0`)
7. **Ne jamais ignorer une erreur** — corriger ou documenter comme known issue

### Agent Timebox (garde-fou autonomie)

Une tâche doit produire un résultat vérifiable **< 90 minutes**.

Si bloqué :
1. Documenter le blocage dans `.ai/current_state.md`
2. Créer entrée `.ai/bugs.md` si nécessaire
3. Passer à la tâche suivante

**Interdit :**
- Boucler sur une erreur > 3 tentatives
- Refactor global sans TASK dédiée
- Modifier plusieurs domaines critiques simultanément (paiement + funnel + data)

---

## 8. OBSERVABILITÉ

### Logs & Monitoring

| Source | Outil | Fréquence |
|--------|-------|-----------|
| Pipeline data | `public/api/copernicus/sargassum.json` (`updatedAt`, `erddapTimestamp`, `stale`) | `npm run session` check 1 |
| Métriques business | `scripts/automation/data/daily-metrics.json` | `npm run session` check 2 |
| MRR Stripe | Bloc `stripe` de `daily-metrics.json` | `npm run session` check 3 |
| GH Actions | `gh run list` / MCP `actions_list` | `npm run session` check 4 |
| Erreurs JS | `scripts/ux-smoke.mjs` → `ERRORS=[]` | Gate de ship |
| Bundle size | `check-bundle-budget.cjs` | Gate de ship + CI |

### Rapports automatiques

- **Daily** : `npm run session` → 5 lignes max dans terminal
- **Weekly** : `weekly-ux-report.yml` + `weekly-seo-automation.yml` + `weekly-optimize.yml`
- **Changelog** : `.ai/changelog.md` mis à jour à chaque tâche

---

## 9. CRITÈRES DE FIN — REPO PRÊT POUR ÉQUIPE AGENTS IA

Le repo est considéré prêt quand :

✅ Un nouvel agent comprend le projet en 5 minutes (lit `.ai/context.md` + `.ai/current_state.md`)
✅ Plusieurs agents peuvent travailler sans conflit (branches `agent/<rôle>/<task>`, handoff documenté)
✅ Chaque changement est traçable (`.ai/changelog.md` + git commits conventionnels)
✅ Chaque fonctionnalité critique est testée (Playwright E2E + smoke + integration + unit)
✅ Les bugs sont documentés avec reproduction (`.ai/bugs.md` format standard)
✅ L'état du projet est toujours connu (`.ai/current_state.md` mis à jour à chaque handoff)
✅ Le déploiement est automatisé (push main → build → FTP → health-check, zero touch)
✅ La boucle 24/7 tourne (`agent-handoff.yml` schedule + script `agent-handoff.cjs`)

---

## 10. DÉMARRAGE RAPIDE POUR NOUVEL AGENT

```bash
# 1. Clone + install
git clone <repo> && cd sargagame && npm ci

# 2. Lire la mémoire (OBLIGATOIRE)
cat .ai/context.md
cat .ai/current_state.md
cat .ai/tasks.md
cat .ai/bugs.md

# 3. Choisir tâche
node scripts/agent-handoff.cjs --status
# → montre prochaine tâche prioritaire

# 4. Auto-pick + claim + branch
node scripts/agent-handoff.cjs --auto

# 5. Travailler...
# (coder, tester localement avec Gate de ship)

# 6. Compléter
node scripts/agent-handoff.cjs --complete
# → guide pour MAJ changelog + current_state + tasks

# 7. Push + PR (auto-merge si CI vert)
git push origin agent/<role>/<task-id>
gh pr create --title "<task>: <description>" --base main
```

---

**Rappel** : Ce fichier (AGENTS.md) fait autorité pour les interdictions produit.
Pour la doctrine d'exécution détaillée → `CLAUDE.md`.
Pour l'état de la session courante → `NEXT_SESSION.md` (tête) + `.ai/current_state.md` (handoffs historiques).