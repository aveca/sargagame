# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

---

## Récemment complété

- [x] **P0 CRITICAL — Fix bouton muet Mollie : OnsiteCheckout restauré** (@coding_agent OpenCode glm, 2026-08-12 21:30 UTC) — Bouton « Commencer maintenant → » (Pass one-time Mollie) était MUET sur les 5 domaines. Cause racine : le split `PremiumModal` (commits `5b87b8b4` + `6020ae78`) avait perdu l'overlay `payStep` + init `mollieRef.current = window.Mollie(profileId, …)`. Sans lui, `onPassBuy → doSubscribe → mollieRef.current.createToken()` throw silencieux (catch avale) → bouton muet. Fix : new module `src/PremiumModal/OnsiteCheckout.jsx` restore overlay z 1300 + 2 effets (init Mollie + mount des 4 Components cardHolder/cardNumber/expiryDate/verificationCode). `onPassBuy` → `setPayStep(true)` au lieu de `doSubscribe()` direct. Gate : build OK, bundle 181.9 Ko ≤ 210 Ko (+2.5 Ko), smoke 4/4, test live iPhone 12 confirme overlay s'ouvre avec 4 champs carte + 5 iframes Mollie. Playwright funnel-payment 12/13 (1 flaky pré-existant — race maplabel, fail aussi sur main HEAD pré-fix).
- [x] P0 - Transformation AI-native du repo (@CTO_agent, 2026-07-31)
- [x] P0 - Mollie payment flow fixes (@coding_agent, 2026-07-30)
- [x] P0 - PremiumModal error msg bug (@coding_agent, 2026-07-31)
- [x] P1 - B2B recurring Mollie (#210, @coding_agent)
- [x] P0 - Production release cleanup & validation (@release_engineer, 2026-07-31)
- [x] P0 - Mollie webhook hardening — idempotence guard + tests (@coding_agent, 2026-08-05)
- [x] P0 - Redesign funnel UX — BottomNav restaurée, FABs allégés, CTA clarifié (@coding_agent, 2026-08-11)
- [x] P1 - TASK-P1-002 Tests E2E Playwright funnel payant (@coding_agent, 2026-08-11) — 8 nouveaux tests BottomNav/FABs/CTA + 13 tests existants ré-actualisés (21/21 pass). Sélecteurs centralisés dans tests/utils/selectors.ts.
- [x] P0 - TASK-P0-003 Miami reliability fix + unique trust features (@coding_agent, 2026-08-12) — Fix satelliteConfidence() for shore- method, SAT_STALE_HOURS 36h→24h, applyDataAgePenalty, per-beach accuracy badge, Live Verification Status, Prediction Change Log, Confidence Decay Curve, False Alarm Rate display. Gate de ship OK: build, smoke 4/4, bundle 191.7 Ko.
- [x] P2 - TASK-P2-001 PremiumModal cleanup (@coding_agent, 2026-08-12) — Deleted dead usePayGateway (196→31 lines), extracted useModalA11y + useMediaQuery to shared hooks, deduplicated _relHref. Gate de ship OK.
- [x] P2 - TASK-P2-003 Payment pages wiring (@coding_agent, 2026-08-12) — mollie.php one-off redirect → /payment/good.html. Static good.html/error.html now reachable. Gate de ship OK.
- [x] P1 - Playwright CI workflow + missing tests (@qa_agent, 2026-08-12) — Created playwright.yml, b2b-flow.spec.ts (3 tests), responsive.spec.ts (9 tests). Gate de ship OK.
- [x] P0 - CRITICAL: Fix email input blocker — payEmailRef never bound (@coding_agent, 2026-08-12) — Added email input to WorldPaywall bound to payEmailRef. Payment was literally impossible. Gate de ship OK.
- [x] P0-01 - Static CTA 'Voir ma plage →' pre-React mount (@coding_agent, 2026-08-12) — Added in index.html, golden-hour styling, auto-removes on React mount. Gate de ship OK.
- [x] P1-01 - Trust badges persistent on map (@ux_agent, 2026-08-12) — 3 compact pills (97%, 12k+, Satellite) in top-right, visible during skeleton mount. Gate de ship OK.
- [x] P1-03 - FiabiliteProof in paywall (@ux_agent, 2026-08-12) — Calibration proof moved above pricing card. Gate de ship OK.
- [x] P1 - ComicPaywall activation (@coding_agent, 2026-08-12) — pwVariant via A/B test, CTA fixed (onClose→setShowOffer), PassOffer added. Gate de ship OK.
- [x] P2 - Scroll depth reduction WorldPaywall (@coding_agent, 2026-08-12) — Email + pricing above fold, CTA within 250px (was 530px). Gate de ship OK.
- [x] P1 - Kill dead screens + map hint (@coding_agent, 2026-08-12) — Killed LearnView, ShareBeachCard, Discovery/Solutions/World overlays, showOnboarding, dead FAB blocks. Added map hint toast. -565 lines, -10.3 Ko bundle. Gate de ship OK.
- [x] P1 - Fix dead setShowOnboarding call (@coding_agent, 2026-08-12) — Removed stray setShowOnboarding(false) call that would crash on beach tap. Gate de ship OK.

---

## P0 — Bloquant / urgent

### TASK-P0-001 Configurer webhook secret Mollie en prod
- **Priorité** : P0
- **Rôle** : coding_agent
- **Description** : `mollie-config.php` a `webhook_secret` commenté → signature webhook non vérifiée. Doit être configuré sur chaque serveur FTP après deploy.
- **Estimation** : 30 min
- **Statut** : [x] done by coding_agent (2026-08-05) — fail-closed au deploy + idempotence event_id implémentée

---

## P1 — Haute priorité

### TASK-P1-004 Fix funnel-daily-report.cjs sg_ prefix bug
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : `funnel-daily-report.cjs` comptait les events SANS stripper le préfixe `sg_` (frontend émet `sg_map_open`, `sg_premium_modal_open`, etc., mais les FUNNEL_STEPS keys n'ont pas le préfixe). Résultat : `funnel-daily-report.json` était vide (0 partout) depuis le 2026-08-04 alors que `funnel-snapshot.json` (28j, script correct) montrait 1585 modal opens / 132 CTAs (= 8.3% modal→CTA, pas 0.27%).
- **Statut** : [x] done by coding_agent (2026-08-12) — strip `sg_` ajouté aux 3 sites (comptage, engagement, by_island). Build OK, smoke 4/4 OK, bundle 181.4 Ko. Le prochain run daily-copernicus (06:00 UTC) produira des chiffres réels.

### TASK-P1-005 Tableau de bord fraîcheur pipeline visible sur homepage
- **Priorité** : P1
- **Rôle** : coding_agent + UX_agent
- **Description** : Actuellement, "Données satellite: Xh" est visible uniquement dans le boot skeleton (index.html). L'exposer à TOUS les visiteurs sur la homepage (après mount React) pour trust immédiat.
- **Impact** : Différenciateur trust vs concurrents opaques. Moat = "honnêteté".
- **Comment** : Lire `public/api/copernicus/sargassum.json` (`updatedAt`, `erddapTimestamp`, `stale`). Si `stale=true` (>24h), afficher alerte. Sinon, badge compact "Satellite · 13h" dans le header ou hero section.
- **Fichiers** : `src/Sargasses_PROD.jsx` (hero section, trust badges), `index.html` (boot skeleton déjà fait — dupliquer l'affichage post-mount).
- **Estimation** : 2h
- **Statut** : [ ] pending

### TASK-P1-006 Monitoring conversion 7j post-fix paiement (données réelles maintenant disponibles)
- **Priorité** : P1
- **Rôle** : coding_agent / growth_agent
- **Description** : Le paiement était 100% cassé (`payEmailRef` non bindé) jusqu'au 2026-08-12. Maintenant fonctionnel. Le monitoring daily (`funnel-daily-report.cjs`) était AUSSI cassé (bug sg_ prefix), mais est désormais fixé. Donc à partir du prochain run daily-copernicus (06:00 UTC, 2026-08-12), les vrais chiffres de conversion apparaîtront dans `funnel-daily-report.json`. Mission : monitorer 7 jours pour : (a) mesurer le lift de conversion post-fix, (b) décider si Comic variant est gardé ou tué.
- **Gate de succès** : Conversion > 2% sur 7 jours = SUCCESS. Sinon = investigate funnel/gate de paiement.
- **Kill switch Comic** : `src/Sargasses_PROD.jsx:14280` → `abVariant("pw_style",["world","comic"])`. Pour forcer World : hardcoder `"world"`.
- **Sources à surveiller** (NAVETTE traversante des 3 vérités) :
  - `scripts/automation/data/funnel-daily-report.json` (24h glissantes, maintenant CORRECT)
  - `scripts/automation/data/funnel-snapshot.json` (28j glissantes, déjà correct — référence)
  - `scripts/automation/data/daily-metrics.json` (bloc `mollie.paid` — paiements réels, source API Mollie)
  - `public/api/mollie.php` (nouveaux paiements one-off)
- **Plan semaine** :
  - **Jour 1-3** : Check funnel quotidien (les 2 fichiers ci-dessus). Compter nouveaux paiements Mollie (était 2/30j pré-fix).
  - **Jour 3** : Si Comic < World variant → désactiver Comic (hardcoder `"world"` au lieu de `abVariant`).
  - **Jour 7** : Documenter verdict final dans `.ai/changelog.md` + `.ai/decisions.md`.
- **Rollback si régression** : `git revert HEAD && git push origin main`
- **Estimation** : 7 jours calendar (1-2 actions/agent par jour, ~30 min/action)
- **Statut** : [ ] pending — claim by coding_agent ou growth_agent (2026-08-12)

### TASK-P1-001 Purger les A/B tests morts
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : ~50 flags `abVariant()` dans `Sargasses_PROD.jsx` diluent le trafic et compliquent les changements UX. Garder les flags avec résultats sig., supprimer le reste.
- **Comment** : `grep abVariant src/Sargasses_PROD.jsx` → lister → identifier ceux validés → supprimer les perdants
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-05) — purged 32+ dead tests, hardcoded pw_beat/pw_calm/pw_constel (promoted 85%), AB_FREEZE_MAP simplified to 2 active tests (pw_copy, pw_pass_seq)

### TASK-P1-002 Tests E2E Playwright du funnel payant
- **Priorité** : P1
- **Rôle** : QA_agent
- **Description** : Créer des scénarios Playwright couvrant le parcours critique : carte → verdict → paywall → paiement → premium.
- **Estimation** : 4h
- **Statut** : [x] done by coding_agent (2026-08-11) — 8 nouveaux tests (bottomnav-redesign.spec.ts) pour le redesign UX + 13 tests existants (funnel-payment.spec.ts) ré-actualisés et passants (les 5 anciens failing ont été restaurés par le fix adde0af1 du shell modal). Sélecteurs centralisés dans tests/utils/selectors.ts (75 lignes). Helpers dismissCookieBanner + dismissSargaChat pour bypass les overlays incontrôlables. Gate de ship OK : 21/21 pass, bundle 190.3 Ko, smoke 4 tokens OK.

### TASK-P1-003 Paywall comic compléter (header variants)
- **Priorité** : P1
- **Rôle** : coding_agent + UX_agent
- **Description** : Terminer le paywall BD en ajoutant les variants d'entête (scene/constel/beat) + vérifier les transitions
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent (2026-08-05) — header variants (scene/alert/watch/calm/constel), 3 pricing cards (Brief 29€ decoy / Pro 79€ target / Pro Annual 690€ value), RiskReversal 14j, SocialProof

---

## P2 — Backlog normal

### TASK-P2-001 Spliter PremiumModal.jsx (~3 352, lignes)
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Extraire en sous-composants : doSubscribe (logique Silver), ErrorModal, PayGatewayHandler (Apple/Google)
- **Estimation** : 4h
- **Statut** : [ ] pending

### TASK-P2-002 BCD reccurring → expose entièrement
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Les plans `mol_b2b_plans()` dans `mollie-lib.php` ont les montants; il faut exposer le CTA sur `/pro/` + auto-émission token essai 30j.
- **Estimation** : 4h
- **Statut** : [x] done by coding_agent (2026-08-08) — Flow complet: mol_b2b_plans() définit Pro 79€/mo, Brief 29€/mo; /pro/pricing/ a trial forms → b2b-trial.php → token 30j auto-émis → redirect /pro/espace/?k=token; mollie.php?action=create_subscription gère le recurring; b2b-paylinks.json pour annuels 690€/290€. CTA exposition = /pro/ → /pro/pricing/ (déjà câblé).

### TASK-P2-003 Pages dédiée payment succès/erreur
- **Priorité** : P2
- **Rôle** : coding_agent + UX_agent
- **Description** : Aujourd'hui via query params; les pages dédiées `/payement/good` et `/payment/error` seraient plus propres.
- **Estimation** : 3h
- **Statut** : [ ] pending

### TASK-P2-004. Transitions « case BD » entre écrans
- **Priorité** : P2
- **Rple** : coding_agent + UX_agent
- **Description** : Animation compose BD (slide les bolting) pour transitions top niveau: echoin Euro ∈ payer from cert to
- **Estimation** : 3h
- **Statut** : [x] done by ui_ux_agent (2026-08-08) — PanelWipe « case BD » implémenté au montage du paywall (verdict→paywall = maillon critique funnel). Keyframes sgPwBackdrop/sgPwPanel + état pwEntering (mount-time 420ms). Rollback ?sgpwenter=0 + reduced-motion plancher dur. Audit design system + copyright 5 régions OK (cf. .ai/changelog.md)

### TASK-P2-005. Activer prompt 07 — 1er livrable Univers & Motion (marketing/display/commercial)
- **Priorité** : P2
- **Rôle** : univers_motion_agent
- **Description** : Produire le 1er artefact via le prompt `.ai/prompts/07-univers-motion-agent.md`. Candidats : (a) script clip Remotion pour brief plage quotidien (9:16, sous-titré, coupe courte), (b) copy paywall/onboarding B2B selon colonne vertébrale 6 temps (FR+EN+ES), (c) direction illustrative additive pour carte SVG (easter eggs golden-hour par région), (d) storyboard BD relance B2B. Doit annoncer explicitement au moins 1 axe marketing/display/commercial/rétention dans son rapport (format imposé par le prompt). Univers Le Veilleur respecté, zéro IP tierce, claims hedgés, replis accessibilité.
- **Estimation** : 90 min (timebox autonomie)
- **Statut** : [x] done by coding_agent (2026-08-12 18:40 UTC) — Package 4 artefacts livrés : Artefact 3 (Signature B2C) **shipé en prod** PR #568 (5 domaines via 3 surfaces : index.html + WorldPaywall + ComicPaywall, i18n FR+EN+ES, cohérence A/B préservée). Artefacts 2 (OG cards) + 4 (easter eggs SVG) spec'd dans `design/STORY/` canon, 3 sous-tasks créés (b/c/d) pour implémentation. Gate de ship 4/4 OK.

### TASK-P2-005b. Implémenter artefact 2 — OG card par plage (serverless)
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Proto endpoint `/api/og/beach/{{slug}}.png?lang={{fr|en|es}}` via `satori` + `resvg` (build-time, pas de .png statiques en dist). Spec design dans `design/STORY/09-REWRITES-GROWTH-SHARE.md`. 3 plages pilotes : Les Salines MQ, Sainte-Anne GP, Miami Beach FL. Schema.org ImageObject dans pageShell. A/B `?og=1/0` (control intact).
- **Fichiers** : `serverless/og-beach.{js,ts}` (nouveau), `vite.config.js` (pageShell meta), `index.html` (A/B flag).
- **Estimation** : 3h
- **Statut** : [ ] pending — claimable by coding_agent

### TASK-P2-005c. Implémenter artefact 4 — 1er easter egg carte SVG (yole Martinique)
- **Priorité** : P2
- **Rôle** : ui_ux_agent
- **Description** : Implémenter le 1er easter egg golden-hour = **yole ronde colorée** (rouge + blanc, voiles traditionnelles rondes) dérive en silhouette sur la mer au large de Martinique. Spec dans `design/STORY/03-MOTIF-KIT.md`. Additif sur layer NEAR `ArchipelView` (l.~9474 Sargasses_PROD.jsx), 1 seul rAF hub existant, prefers-reduced-motion = tableau figé. 80–150s ambient, jamais traverser, micro-respiration. A/B `?eg=1/0` optionnel. Cross-device OK Playwright iPhone 12 obligatoire.
- **Fichiers** : `src/Sargasses_PROD.jsx` (ArchipelView, layer NEAR additif), `src/Themes.css` (keyframes ambient si besoin).
- **Estimation** : 2h + cross-device test
- **Statut** : [ ] pending — claimable by ui_ux_agent

### TASK-P2-005d. Artefact 1 — Clip Remotion « Le jour qui bascule »
- **Priorité** : P2
- **Rôle** : univers_motion_agent
- **Description** : Script clip Remotion 25 s, 9:16, sous-titré, coupe courte, 7 scènes selon spec livrée (cf. rapport prompt 07). Pipeline local gratuit via skill `video-brief` (ffmpeg + edge-tts + Playwright shoote calques SVG). Pas de code shipped (asset externe) — le clip tourne 1×/semaine par région, sans impact bundle.
- **Fichiers** : `video-remotion/scenes/le-jour-qui-bascule/` (nouveau), composables Remotion existantes réutilisées.
- **Estimation** : 90 min timebox autonomie
- **Statut** : [ ] pending — claimable by univers_motion_agent


---

## P3 — Améliorations

- [ ] Spliter paywall comic/plan B en composants séparés
- [ ] Améliorer PrenderDelivery légères des Mails monitoring de la
- [ ] Ajouter le sinning de Sílbano dans un scratch

### Backlog futur / idées

- B2C abo Chrome (pas d'Vous voulez vous-en)
- widgets B2B OHPA en JS wash
- Business mobile iOS/Play/
- Mensueler Largues

---

## Règles pour les agents

1. **Lire** `.ai/current_state.md` avant tout
2. **Réclamer** une tâche : `[ ] ... → [~] in_progress by <agent>`
3. **Créer branche** : `agent/<nom>/<tache>`
4. **Commit** au fur et à mesure
5. **Marquer fini** : `[~] → [x] done by <agent>`
6. **MAJ** `.ai/current_state.md`

**Jamais** : prendre 2 tâches en même temps, skip le Gate de ship, merger sans test.
## 2026-08-07 — CTO Sprint entries

### Done
- [x] **CTO-SP01**: Boot skeleton golden-hour gradient + headline + trust badges + H1 SEO (index.html)
- [x] **CTO-SP02**: Relaunch daily-copernicus pipeline (data was 30h stale)
- [x] **CTO-SP03**: Full UX/payment/analytics audit (P0/P1/P2 classified)
- [x] **CTO-SP04**: Gate de ship: build 193.5 Ko, smoke OK, PHP clean
- [x] **BUG-FIX-001**: P0 — b2b-trial.php sg_analytics_event() crash fix
- [x] **BUG-FIX-002**: P0 — retry-failed-payment.php mol_api() crash fix
- [x] **BUG-FIX-003**: P0 — mollie-lib.php mol_supabase_mirror() global $cfg fix
- [x] **BUG-FIX-004**: P1 — track-click.php open redirect domain allowlist
- [x] **BUG-FIX-005**: P1 — mollie-webhook.php + mollie.php exception leak fix
- [x] **BUG-FIX-006**: P1 — forecast.php mol_access_for_email() guard
- [x] **BUG-FIX-007**: P2 — mollie.php verify_subscription email validation fix
- [x] **BUG-FIX-008**: P2 — create-checkout.php in_array() strict mode fix
- [x] **BUG-FIX-009**: retry-failed-payment.php undefined $status variable fix
- [x] **IMPROVE-001**: Sargasses_PROD.jsx dead PassOffer import removed (-3.2 Ko bundle)
- [x] **IMPROVE-002**: Google Fonts @import → self-hosted in colors_and_type.css + legal.css
- [x] **IMPROVE-003**: 3 missing email functions (mol_b2b_trial_email, mol_payment_failed_retry_email, mol_b2b_meeting_notify)
- [x] **IMPROVE-004**: Stripe PRO token embeds subscription_id for revocation
- [x] **IMPROVE-005**: track-click.php str_ends_with → substr (PHP 7.x compat)
- [x] **IMPROVE-006**: write-mollie-config.cjs exit(1) on missing API key
- [x] **BUG-FIX-010**: P0 — PremiumModal.jsx _ctxStatus undefined in ComicPaywall (paywall copy)
- [x] **BUG-FIX-011**: P1 — mollie-lib.php mol_b2b_is_revoked() file transients → Supabase
- [x] **BUG-FIX-012**: P1 — paypal.php annual amount 3999 → 4990 (data corruption)
- [x] **BUG-FIX-013**: P1 — create-checkout.php missing null guard on payment_method
- [x] **BUG-FIX-014**: P2 — mollie.php REQUEST_METHOD ?? 'POST' + error sanitization

### Commit
- `e8be7c04` — fix: undefined $status, dead PassOffer import, Google Fonts self-hosted

### Remaining — Ranked by Business Impact
- [ ] **P0-01**: Add static CTA in HTML source (before React mount) — "Voir ma plage →" button
- [ ] **P0-02**: Mollie webhook secret → ensure deployed on all 5 FTP domains
- [ ] **P1-01**: Add trust signal (97%, 12k+, satellite) in map UI AFTER React mount (persists after skeleton)
- [ ] **P1-02**: PremiumModal.jsx extract WorldPaywall/ComicPaywall to separate modules (-2 MB parse)
- [ ] **P1-03**: Show calibration proof at paywall decision point (movement /fiabilite/ into modal)
- [ ] **P2-01**: 78 Google Fonts @import → migrate to self-hosted fonts (entire /public/)
- [ ] **P2-02**: "Tableau de bord" for pipeline freshness visible on homepage (the "updated X hours ago" to all visitors too)

