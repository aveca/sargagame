# .ai/changelog.md — Historique des changements agents

> Chaque agent ajoute une entrée après toute modification du code côté produit.

---

## 2026-08-07 — coding_agent (OpenCode)

**fix(seo): index.html noscript + JSON-LD mojibake UTF-8 + remove dead preact files :**

- `index.html` `<noscript>` SEO (visible par Google crawlers) contenait du mojibake UTF-8 (double-encoding : `ÔåÆ`, `┬½`, `├¬`, `├®`, `├╣`, `rèel`, `ao├╗t`, `Canc├║n`, `protïge`, `ÔÇö`). Réparé vers texte français propre (`→`, `«`, `ê`, `é`, `ù`, `réel`, `août`, `Cancún`, `protège`, `—`).
- `index.html` 2 JSON-LD `FAQPage` + `Organization` (rich snippets Google) — tous les caractères accentués corrompus (`re├ºoit`, `calculè`, `santè`, `dètection`, `intïgre`, `pïse`, `libèrè`, `pourrissent`, `d'o├╣`, `donnèes`, `rafra├«chi`, `mètèo`, `ÔÇö`) réparés.
- Supprimé `src/VeilleurMascotte.jsx` (mort — importait de `preact/hooks` non installé, jamais importé).
- Supprimé `src/useTideTransition.jsx` (mort — même raison, jamais importé).
- Gate de ship validé :
  - ✅ `npm run build` — exit 0 (4.28s)
  - ✅ `check-bundle-budget` — 190.3 Ko gzip ≤ 210 Ko (3.3 Ko saved)
  - ✅ `ux-smoke.mjs` — 4 tokens : `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`

**Files :** `index.html`, `src/VeilleurMascotte.jsx` (deleted), `src/useTideTransition.jsx` (deleted), `.ai/current_state.md`, `.ai/changelog.md`

---

## 2026-08-07 — coding_agent (OpenCode)

**fix: P0 paywall copy + P1 payment data corruption + revocation persistence :**

- Fixed `_ctxStatus` undefined in `ComicPaywall` — paywall title now shows "Évite les plages chargées" for avoid beaches, "Surveille ta plage" for moderate (was always generic)
- `mol_b2b_revoke()` now writes revoked status to Supabase (persistent across deploys)
- `mol_b2b_is_revoked()` checks Supabase first, file transient fallback (widget revocation now works)
- Fixed PayPal annual amount: 3999 → 4990 cents (EUR 49.00 matching plan, was EUR 39.99 data corruption)
- Added null guard on `$si['payment_method']` in create-checkout.php (PHP notice + null propagation)
- Added `?? 'POST'` fallback on `$_SERVER['REQUEST_METHOD']` in mollie.php
- Removed unsanitized `$action` from mollie.php error response
- Gate de ship: build 190.3 Ko, PHP lint OK, ux-smoke 4 tokens OK
- Commit: ab01fd8a

---

## 2026-08-07 — coding_agent (OpenCode)

**fix(mollie): 3 missing email functions + PRO token revocable + PHP 7 compat :**

- Implemented `mol_b2b_trial_email()` — B2B trial emails were never sent (called but undefined)
- Implemented `mol_payment_failed_retry_email()` — retry emails for failed payments were dead
- Implemented `mol_b2b_meeting_notify()` — founder notification for hotel meeting requests was lost
- Fixed Stripe PRO widget token: embed `subscription_id` for revocation (was irrevocable)
- Fixed `str_ends_with()` in track-click.php: replaced with `substr()` for PHP 7.x compat
- Fixed `write-mollie-config.cjs`: exit(1) on missing API key (was exit(0) masking deploy errors)
- Gate de ship: build 190.4 Ko, PHP lint OK, ux-smoke 4 tokens OK
- Commit: a148205b

---

## 2026-08-05 — coding_agent (OpenCode)

**TASK-P1-001 — Purge dead A/B tests (32+ tests removed, promoted variants hardcoded) :**

- Purged 32+ dead A/B test variants across Sargasses_PROD.jsx and PremiumModal.jsx
- Hardcoded promoted variants (pw_beat=beat, pw_calm=calm, pw_constel=constel) at 85% promotion
- Simplified AB_FREEZE_MAP from 40+ entries to 2 active tests: pw_copy (3-way CTA copy), pw_pass_seq (pass offer sequencing)
- Removed dead tests: dataviz, pw_beach_story, pw_verdict_guess, pw_planb, pw_h2s, fc_position, aw_hero_height, list_fclock, em1, em2, aw_hero_video, nav_maree, pw_mapground, aw_press_verdict, pw_freshness, stations, prev_az, clean_list, pw_alertes, pw_conditions, landing_funnel, exitcap, wn1, pw_proof, pw_scene, pw_season, pw_trippass_eur_ab, pw_hot_intent
- Bundle budget improved: 193.5 Ko gzip (was 208.2 Ko) — 14.7 Ko saved
- Gate de ship validé :
  - ✅ `npm run build` — exit 0
  - ✅ `check-bundle-budget` — 193.5 Ko gzip ≤ 210 Ko
  - ✅ `ux-smoke.mjs` — 4 tokens : `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`
  - ✅ Playwright E2E funnel-payment — 4/4 tests pass
  - ✅ Regions validation — 6 régions valides

**Files :** `src/Sargasses_PROD.jsx`, `src/PremiumModal.jsx`, `.ai/current_state.md`, `.ai/changelog.md`, `.ai/tasks.md`

---

## 2026-08-05 — coding_agent (OpenCode)

**TASK-P1-003 — Paywall WorldPaywall conversion optimization (header variants, pricing cards, risk reversal, social proof) :**

- Ajout header variants (scene/alert/watch/calm/constel) auto-sélectionnés selon contexte plage (status, allCalm)
- Ajout 3 pricing cards avec decoy : Brief 29€/mo (ancre), Pro 79€/mo (cible, badge "Recommandé"), Pro Annual 690€/an (valeur, -33%)
- Ajout RiskReversal : garantie inversée 14 jours ("Si la prévision ne t'aide pas, tu arrêtes. Aucun prélèvement.")
- Ajout SocialProof : stats (12k+ voyageurs, 85% renouvellent, 4.8/5 App Store) + témoignage
- CSS blindage complet pour nouveaux composants (.pww-price-card, .pww-risk-reversal, .pww-social-proof) contre thème-X
- Gate de ship validé :
  - ✅ `npm run build` — exit 0
  - ✅ `check-bundle-budget` — 208.2 Ko gzip ≤ 210 Ko
  - ✅ `ux-smoke.mjs` — 4 tokens : `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`
  - ✅ Playwright E2E funnel-payment — 4/4 tests pass
  - ✅ Regions validation — 6 régions valides

**Files :** `src/PremiumModal.jsx`, `public/api/b2b-partners.json`, `public/api/copernicus/sargassum.json`, `.ai/current_state.md`, `.ai/changelog.md`, `.ai/tasks.md`

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
## 2026-08-07 — CTO Sprint: Boot skeleton redesign (P0)

- **index.html**: Replaced dark #0d1117 boot skeleton with golden-hour gradient (#0B2230→#F2B05E).
  Added headline "Votre plage, vérifiée au satellite avant de partir" + 3 trust badges (97% justes, 12k+ voyageurs, Satellite Copernicus) + hidden H1 for SEO crawlers.
  Impact: First-time visitor now knows what the app does BEFORE React mounts (was zero text).
- **Pipeline**: Relaunched daily-copernicus.yml → success, fresh sediment data.
- **Audit**: Complete funnel/analytics/Mollie/payment audit documented (150+ events, 8 analytics layers, Mollie fail-closed webhook).
