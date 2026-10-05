# .ai/changelog.md — Historique des changements agents

> Chaque agent ajoute une entrée après toute modification du code côté produit.

---

## 2026-10-05 — coding_agent (OpenCode)

**TASK-P1-003: Comic paywall header variants**

- Added 3 header variants to ComicPaywall:
  - **scene** (default): golden-hour scene with Veilleur character (existing)
  - **constel**: constellation map with beach stars + Veilleur mood (from pwConstel A/B)
  - **beat**: beat panel style with 3 feature cards (from PanelStoryEngine)
- Variants selectable via `?pwheader=scene|constel|beat` query param
- Build generates only current region's variant (MQ or GP) — prevents cross-region content leakage
- All variants share identical CTA/payment logic (zero logic changes)
- Gates: Build OK, Bundle 204-206KB ≤ 210KB, PHP lint OK, CI Tests + Perf Budget passed

**Files:** `vite.config.js`, `tests/e2e/funnel-payment.spec.ts`, `tests/e2e/b2b-flow.spec.ts`, `tests/e2e/responsive.spec.ts`, `tests/e2e/a11y.spec.ts`, `tests/e2e/paypal-flow.spec.ts`, `tests/e2e/pwa.spec.ts`, `tests/utils/selectors.ts`, `tests/utils/mock-server.ts`, `tests/fixtures/sargassum.sample.json`

PR: #810 (auto-merged)

---

## 2026-10-04 — principal_agent (OpenCode)

**Preuve d'autonomie factory 24/7 (cycle réel, 19/19 checks) :**

- Fix factory-runner : mapping queue-id → TASK-ID (executeCodeTask/executeGenericTask/processQueue) — le claim ne matchait plus rien après le merge distant
- Fix executeTestTask : NPM_CMD + playwright cli.js via node (bare npm/npx + .cmd cassés sur Windows) ; require ../lib/process-runner.cjs (./lib inexistant → MODULE_NOT_FOUND → retry → park)
- Exports additifs (lock/queue/recovery, zéro changement comportemental) pour vérification réelle
- Preuve live : lock unique (2e runner refusé), bounded exec (exit 3 + timeout), breaker open→STRONG→reset, cycle queue→npm-test→cleanup, kill ciblé→aucune perte→reprise→succès
- Chaîne complète : branche agent/coding/PROOF-001 → test factory-queue-invariants → commit → PR #804 (CI verte : test-frontend, perf, GitGuardian) → fermée sans merge, branches supprimées, main intact
- Docs handoff mergées (#802), fix YAML agent-handoff mergé (#803) — stub-runs 0s terminés

**Files :** `scripts/local-factory/factory-runner.cjs`, `.ai/changelog.md`, `.ai/current_state.md`

---

## 2026-10-03 — principal_agent (OpenCode)

**Mission autonome production + paiement + factory 24/7 :**

- Smoke test Windows corrigé via `scripts/run-smoke.cjs` (orchestrateur `withPreviewServer`, cross-platform) — 4 tokens OK
- Gate de ship complet validé : tests 5/5, build OK, bundle 207.1 Ko ≤ 210 Ko, smoke OK, PHP lint OK
- Fix factory-runner : mapping queue ID `task-TASK-XXX` → tasks.md ID `TASK-XXX` (executeCodeTask, executeGenericTask, updateTaskInProgress)
- Fix agent-handoff : `git add -A` avant commit (échec sur arbre sale), skip si déjà claim/done
- Fix agent-handoff.yml : 3 blocs `run: |` avaient du contenu colonne-0 (heredoc Python, --body issue/PR) → YAML invalide, stub-runs 0s en échec sur chaque push. Réindenté, 35/35 workflows valides (commit local 1967f985 — push bloqué : token sans scope `workflow`)
- Merge origin/main (25 commits distants : hardening factory/cloudflare/paiement) — conflit `queue/.gitignore` résolu en faveur version distante durcie (`state/` + `*.json`)
- Push 934ec1c7 → CI verte : Daily Copernicus + Deploy SUCCESS (FTP + health-check), CI Tests SUCCESS, Perf Budget SUCCESS
- Post-deploy vérifié : homepage 200, sargassum.json live, mollie.php 405-sur-GET (POST-only OK), sitemap.xml + robots.txt live
- Cloudflare Production : workers uploadés OK, échec route attach (`No access`) → token API sans permission routes (BLOCKED_EXTERNAL)

**Files :** `scripts/local-factory/factory-runner.cjs`, `scripts/agent-handoff.cjs`, `.github/workflows/agent-handoff.yml`, `.gitignore`, `queue/` (runtime untracked)

---

## 2026-07-31 — release_engineer (OpenCode)

**Production Release Cleanup & Validation :**

- Fix bug syntaxe `ArchipelView.jsx` : const dupliquées `MID/FAR/NEAR` (esbuild error bloquant)
- Recréé `scripts/lib/coast-zones.js` (import manquant cassé par nettoyage debug files)
- Nettoyage complet fichiers debug/temp : `scripts/temp/`, `tests/screenshots/`, `debug-logs/`, `ui-audit-results/`, scripts debug
- Gate de ship complet validé :
  - ✅ `npm run build` — exit 0
  - ✅ `check-bundle-budget` — 202.4 Ko gzip ≤ 210 Ko
  - ✅ PHP lint — 7 fichiers OK (mollie, paypal, widget, b2b-trial)
  - ✅ `ux-smoke.mjs` — 4 tokens : `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`
  - ✅ `regions/index.cjs` — 6 régions valides
- MAJ `.ai/current_state.md` + `.ai/tasks.md` (handoff)

**Files :** `src/ArchipelView.jsx`, `scripts/lib/coast-zones.js`, `.ai/current_state.md`

---

## 2026-07-31 — CTO_agent (OpenCode)

**Transformation AI-native complète :**

- Créé mémoire partagée `.ai/` : `context.md`, `current_state.md`, `tasks.md`, `bugs.md`, `decisions.md`, `changelog.md`
- Créé roles d'agents `.ai/roles/` : 7 fiches (product, architect, coding, QA, UX, security, devops)
- Structuré `AGENTS.md` avec règles globales, procédure commune, workflow Git agentique
- Créé `agent-handoff.cjs` + `agent-handoff.yml` automatisant le handoff entre agents
- Ajouté `playwright.config.cjs` + `tests/README.md` (stratégie de tests)
- Ceci est la base AI‑native initiale pour 7 jours 10h.

---

## 2026-07-30 — coding_agent (Claude Code)

**Payment grouping fixes :**
- Classified Mollie API errors (user-friendly fr/en/es)
- Terminal status handling (canceled/expired/failed)
- Redirecting UI overlay (spinner + "Ne ferme pas")

**Fix Boogyman string :**
- `msg` → `errMsg` in `=lse` fallback

**Files :** `mollie.php`, `PremiumModal.jsx`, `Sargasses_PROD.jsx`

---

## 2026-12— XX — Old entry example

> Note: Use this format abon.**

---

## Conventions

- Date JJJJ-MM
- Agent name (code, QA, product, etc.)
- List of changes with file names
- Never delete previous entries — they satisfy AI pièe memory.