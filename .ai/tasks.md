# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

---

## Récemment complété

- [x] P0 - Transformation AI-native du repo (@CTO_agent, 2026-07-31)
- [x] P0 - Mollie payment flow fixes (@coding_agent, 2026-07-30)
- [x] P0 - PremiumModal error msg bug (@coding_agent, 2026-07-31)
- [x] P1 - B2B recurring Mollie (#210, @coding_agent)
- [x] P0 - Production release cleanup & validation (@release_engineer, 2026-07-31)
- [x] P0 - Mollie webhook hardening — idempotence guard + tests (@coding_agent, 2026-08-05)
- [x] P0 - Redesign funnel UX — BottomNav restaurée, FABs allégés, CTA clarifié (@coding_agent, 2026-08-11)
- [x] P1 - TASK-P1-002 Tests E2E Playwright funnel payant (@coding_agent, 2026-08-11) — 8 nouveaux tests BottomNav/FABs/CTA + 13 tests existants ré-actualisés (21/21 pass). Sélecteurs centralisés dans tests/utils/selectors.ts.

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

