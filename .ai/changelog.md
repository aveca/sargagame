# .ai/changelog.md — Historique des changements agents

> Chaque agent ajoute une entrée après toute modification du code côté produit.

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

## 2026-08-05 — ui_agent (OpenCode)

**Paywall key alignment + UI enhancement :**

- **CRITICAL FIX** : `PassOffer.jsx` émettait `key: "saison"` mais le backend
  (`mollie.php` allowlist L73, `mollie-webhook.php` L88) n'accepte que `"season"`.
  → Tous les paiements Mollie on-site étaient rejetés ("Prix invalide").
  → Corrigé : `"saison"` → `"season"`.
- `PassOffer.jsx` : rollout "Pass saison" (19,99€), TrustBadge (secure/no-card/no-commit),
  bannière saisonnière pic (Juin-Août), sticky CTA mobile via IntersectionObserver,
  animation pulse, copy bénéfice ("Protéger mes plages maintenant").
  - ⚠️ USD cents (1499 = $14.99) ≠ mollie-passlinks.json ($19.99) — en attente décision produit.
- `mollie-config.example.php` : `'saison'` → `'season'` (alignement template).
- `CLAUDE.md` : tier B2C 24,99 → 19,99€ (aligné mollie-passlinks.cjs commit bab4366a).
- `app-runtime.css` : `@keyframes sg-pulse-cta` + reduced-motion override.
- Gate de ship local : `php -l` ✓, `npx esbuild` ✓.

**Files :** `src/PassOffer.jsx`, `public/api/mollie-config.example.php`, `CLAUDE.md`, `src/app-runtime.css`
**PR :** #546 — `agent/ui/ux-pass-saison`

---

## 2026-08-05 — coding_agent (OpenCode)

**Supabase mirror hardening :**

- `mol_supabase_mirror()` : log CRITICAL + return `false` quand `SUPABASE_SERVICE_KEY` manquant
  (au lieu de `return true` silencieux). Déclenche webhook retry au lieu de perdre les grants.
- `Prefer: return=minimal,resolution=merge-duplicates` (upsert idempotent).
- Logs améliorés : table + key context.
- ⚠️ Risque : retry loop si clé manquante sur un serveur. Vérifier sur tous les serveurs FTP.

**Files :** `public/api/mollie-lib.php`
**PR :** #547 — `agent/coding/mollie-mirror`

---

## 2026-08-05 — qa_agent (OpenCode)

**Analytics tracking :**

- `PremiumModal.jsx` : track `sg_premium_modal_close` avec `via:"swipe_down"` + `time_spent`
  lors du swipe-to-close. Suit le schema existant (7 autres variants : escape, close_x,
  world_close, comic_close, hot_close, prelude_close, backdrop).
- Aucun changement UI/functional — analytics only.

**Files :** `src/PremiumModal.jsx`
**PR :** #548 — `agent/qa/analytics-swipe`

---

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