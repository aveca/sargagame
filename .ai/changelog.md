# .ai/changelog.md — Historique des changements agents

> Chaque agent ajoute une entrée après toute modification du code côté produit.

---

## 2026-08-11 — coding_agent (OpenCode)

**fix(payment): BUG-2026-016 PassOffer passCtxRef perdu post-split + byte NUL WorldPaywall.jsx**

Le split `PremiumModal` (commits `5b87b8b4` + `6020ae78`) avait perdu toute la plomberie de paiement :
- Refs/états créés en interne étaient juste passés en prop venant de nulle part (Sargasses_PROD.jsx n'envoie ni `passCtxRef`, ni `payPlanRef`, ni `payEmailRef`, ni `payBusy`, etc.)
- `WorldPaywall` câblait `onBuy={doSubscribe}` : `doSubscribe` lisait `passCtxRef.current = undefined` → partait sur le chemin abonnement au lieu du pass one-time → `POST /api/mollie.php` `action=create_subscription` au lieu de `action=create_payment` → erreur Mollie → bouton "Commencer maintenant →" cassé.

Fix :
- `PremiumModal.jsx` recrée toutes les refs/états de paiement en interne (miroir ancien monolithe ~ligne 1739) :
  `passCtxRef`, `payPlanRef`, `payEmailRef`, `payReadyRef`, `elementsRef`, `stripeRef`, `setupSecretRef`, `mollieRef`, `payBusy`, `payError`, `payRedirecting`, `paySuccess`, `payStep`, `consentOk`, `pwToast`, `pwSocialProof`.
- Bridge `onPassBuy` :
  ```js
  const onPassBuy = (item) => {
    track("sg_pass_cta", {pass:item.pass, cents:item.c, source, onsite:1, ...})
    passCtxRef.current = {pass:item.pass, cents:item.c, days:item.days||..., cur:PAY_CUR}
    if(item.method && item.method !== "card"){ payWithWallet(item.method); return }
    doSubscribe()
  }
  ```
- `WorldPaywall.jsx:304` → `onBuy={onPassBuy}` (était `onBuy={doSubscribe}`)
- `ComicPaywall.jsx` reçoit aussi les nouvelles props (`setConsentOk`, `setPwToast`, `onPassBuy`) pour cohérence, même s'il n'a pas de PassOffer monté.
- Bonus : troncation du byte NUL `\x00` en offset 14789 de `WorldPaywall.jsx` qui cassait le build (`esbuild: Unexpected "\x00"`), réécriture propre de `export default WorldPaywall\n`.

### Fichiers modifiés
- `src/PremiumModal.jsx` — Refs/états paiement créés en interne + bridge `onPassBuy` + propagation aux paywalls
- `src/PremiumModal/WorldPaywall.jsx` — `onBuy={onPassBuy}`, nouvelle props (`setConsentOk`, `setPwToast`, `onPassBuy`) + clear byte NUL
- `src/PremiumModal/ComicPaywall.jsx` — Props ajoutées (`setConsentOk`, `setPwToast`, `onPassBuy`) pour cohérence
- `.ai/bugs.md` — BUG-2026-016 + BUG-2026-016b documentés
- `.ai/changelog.md` — ce bloc

### Tests réalisés
- [x] `npm run build` → exit 0 (3.89s)
- [x] `check-bundle-budget.cjs` → 189.7 Ko ≤ 210 Ko ✓
- [x] `php -l` → OK (mollie.php, mollie-lib.php, mollie-webhook.php, create-checkout.php)
- [x] `ux-smoke.mjs` → 4 tokens OK (`FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`)
- [x] `playwright test tests/e2e/funnel-payment.spec.ts` → 8 passent, 5 échouent (inchangé vs main HEAD sans mon fix — coquille modale `.sg-modal-panel` perdue post-split, sera adressée dans TASK-P1-002)

### Risques / rollback
- **Risque minimal** : les refs sont créés en interne dans `PremiumModal.jsx`, aucune prop externe n'est attendue depuis `Sargasses_PROD.jsx`. Le comportement est identique à l'ancien `PremiumModal` monolithique.
- **Rollback** : `git revert HEAD --no-edit` (le fix ne touche ni `dist/`, ni `mollie*.php`, ni logic de paiement backend — juste la plomberie React du paywall).
- **Régression zéro** : les 5 tests Playwright qui échouent le faisaient déjà avant le fix (vérifié via `git stash`).

### Prochaine action recommandée
1. **TASK-P1-002 Playwright E2E funnel payant** — restaurer la coquille modale (`.sg-modal-panel`, backdrop, role="dialog") qui a été perdue post-split → 5 tests actuellement failing (pré-existants à ce fix).
2. **TASK-P2-001 Spliter PremiumModal.jsx** — le fichier source `PremiumModal.jsx` est propre maintenant (176 lignes), mais `Sargasses_PROD.jsx` fait 14813 lignes.
3. Audit UX post-fix : vérifier en prod que le clic Pass 30j déclenche bien `POST /api/mollie.php action=create_payment` (network tab) au lieu de `create_subscription`.

### Branche / PR
- Branche : `agent/coding/BUG-2026-016-passctxref-fix`
- PR : à créer
- Commit head : à créer

---

## 2026-08-08 — coding_agent (OpenCode)

**fix: TASK-P2-002 done + agent-handoff.cjs header-format support**

- `scripts/agent-handoff.cjs` — claim/complete functions now handle both checkbox format (`- [ ] TASK-PX-XXX`) and header format (`### TASK-PX-XXX` with `**Statut**` lines). parseTasks() now reads `**Statut** : [x/~]` from header tasks. Added `--ship` command (push + PR auto-create). All tested via `--status`.
- `.ai/tasks.md` — TASK-P2-002 marked `[x] done` (B2B recurring flow already fully implemented: mol_b2b_plans(), /pro/pricing/ trial forms, b2b-trial.php auto-token, mollie.php create_subscription, b2b-paylinks.json annual links).

---

## 2026-08-08 — ui_ux_agent (OpenCode)

**feat: TASK-P2-004 — Transitions « case BD » entre écrans + audit design system :**

- `app-runtime.css:107-112` — Nouvelles keyframes `sgPwBackdrop` (fade-in teinté) et
  `sgPwPanel` (slide-up + overshoot comic cubic-bezier(1.4) → effet « page qui claque »)
  câblées sur `.sg-pwenter .backdrop` et `.sg-pwenter .sg-modal-panel`.
  Pures GPU (transform/opacity), reduced-motion = saut 1ms (plancher dur bible).
  Rollback : `?sgpwenter=0`.
- `Sargasses_PROD.jsx:12424-12438` — Nouvel état `pwWipeOn` (flag opt-out) + `pwEntering`
  (mount-time 420ms) qui pose la classe `sg-pwenter` au montage du `PremiumModal`.
  Pattern identique à `wipe`/`navDive` (matchMedia skip = JAMAIS sous reduced-motion).
- `Sargasses_PROD.jsx:14368-14400` — `PremiumModal` wrappé dans un `<div className="sg-pwenter">`
  (`display:contents` → layout fixed/portal intact, sélecteurs CSS matchent le sous-arbre).
  Build + bundle + smoke OK (190.5 Ko, +0.1 Ko). Aucune friction sur fermeture/tracking.
- Audit design system : `--sg-*` runtime (Themes.css + app-runtime.css) résolvent les
  tokens LIGHT d'index.html sous `.theme-comic` (DETTE-TOKENS-INERTES confirmée, non
  touchée — plancher dur). Palette golden-hour `["#0B2230","#155A5A","#C97E3A","#F2B05E"]`
  conforme (SCENE_TOKENS HeroScene L9224). Fonts : Anton (titres) + Bricolage Grotesque
  (body) + JetBrains Mono (chiffres) = 3 max (4e INTERDITE confirmée).
- Copyright/branding 5 régions : `mentions-legales.html`, `cgv.html`, `confidentialite.html`,
  `a-propos/index.html`, `offres/index.html` mentionnent les 5 domaines + © 2026 97TECH +
  TVA FR40882370703. Mascotte « Le Veilleur » via `miVeil()` (L1371) et `BrandIcon satellite`
  (L8994) partout cohérente. Statut OK, aucune correction nécessaire.
- Transitions existantes auditées : `SceneWipe` (L9151 — accueil→carte, déjà câblée),
  `DiveTransition` (carte→fiche, OFF par défaut — navDive KO arm mort), `.sheet-exit`/
  `.backdrop-exit` (sortie bottom-sheet), `.view-enter`/`.view-exit` (entrées vues).
  Transition BD manquante IDÉNTIFIÉE et implémentée : verdict→paywall (moment critique
  funnel). Carte↔liste laissé en cut sec (intentionnel : économie de rendu, vidéo exit).

---

## 2026-08-07 — coding_agent (OpenCode)

**fix: P2 hardening — PayPal curl + transient guards + Stripe prewarm cleanup :**

- `pp_token()` and `pp_api()` now check `curl_errno` — returns 502 on network failure instead of null
- `paypal-webhook.php` token fetch now checks `curl_errno`
- `get_transient()` and `set_transient()` now suppress file I/O errors (payment path resilience)
- Stripe prewarm useEffect: added AbortController + cleanup function + `cancelled` flag
- Removed `passCtxRef.current` from useEffect deps (refs don't trigger re-renders)
- Gate de ship: build 190.4 Ko, PHP lint OK, ux-smoke 4 tokens OK
- Commit: 60665315

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
