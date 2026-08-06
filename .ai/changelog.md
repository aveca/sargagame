# .ai/changelog.md — Historique des changements agents

> Chaque agent ajoute une entrée après toute modification du code côté produit.

---

## 2026-08-05 — coding_agent (OpenCode)

**TASK-P0-001 — Mollie webhook hardening (idempotence guard) :**

- Ajout garde idempotente sur `event_id` dans `mollie-webhook.php` (marqueur fichier `api/data/mollie_<event_id>`)
- Protection contre replay webhook Mollie (HTTP 200 + `duplicate: true` si déjà traité)
- Pattern aligné sur `stripe-webhook.php` (file-based markers dans `api/data/` protégé par .htaccess)
- Préfixe `mollie_` évite collision avec marqueurs Stripe
- Fail-closed existant confirmé : webhook_secret manquant → 503 (config), signature invalide → 403
- Idempotence métier déjà présente via `mol_b2b_grant_once()` / `mol_b2c_pass_grant()` (subscriptionId / paymentId)
- Tests unitaires créés : `tests/integration/mollie-webhook.test.php`
- Gate de ship validé :
  - ✅ `npm run build` — exit 0
  - ✅ `check-bundle-budget` — 207.2 Ko gzip ≤ 210 Ko
  - ✅ PHP lint — `mollie-webhook.php`, `mollie-lib.php` OK
  - ✅ `ux-smoke.mjs` — 4 tokens : `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`
  - ✅ Playwright E2E funnel-payment — 4/4 tests pass

**Files :** `public/api/mollie-webhook.php`, `tests/integration/mollie-webhook.test.php`, `.ai/current_state.md`, `.ai/changelog.md`, `.ai/tasks.md`

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