# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

---

## Récemment complété

- [x] P1 - Inventaire migration Supabase complet + infrastructure : 10 onglets identifiés depuis Code.js (emails, feedback, payments, subscription_events, email_log, digest_log, email_tracking, email_events, beach_reports, analytics_events), colonnes connues, volumes partiels (22 paiements, 639 emails, 1 feedback, 260 envoyés). Blocages documentés (SUPABASE_SERVICE_KEY, Supabase MCP OAuth, Google Sheets accès, Cloudflare token). `docs/migration-google-sheets/MIGRATION-STATUS.md` créé. `scripts/automation/migrate-sheets-to-supabase.cjs` créé (runner idempotent, dry-run OK, journal de migration). Export script read-only déployé (`AKfycbxMVorrZ8Z_...`, nécessite consentement OAuth). (@coding_agent, 2026-11-15, branche feat/sargagame-supabase-google-migration)
- [x] P1 - Journal durable webhook Mollie + réconciliation avec backoff : webhook_journal_write() intégré dans mollie-webhook.php (3 blocs : subscription.created/updated, subscription.paid, payment.paid b2b_annual), script scripts/automation/webhook-reconcile.cjs avec retry backoff exponentiel (cap 300s), data/webhook-events/ dans .gitignore (PII) (@coding_agent, 2026-11-15, branche agent/coding/verify-subscription-b2b-pro, commit 61a1ab9df) — PR non créée (gh CLI indisponible), SUPABASE_SERVICE_KEY non défini → skip propre
- [x] P1 - verify_subscription b2b_pro + CORS whitelist b2b-create-checkout : mol_b2b_grant_once() étendu avec paramètre $email, verify_subscription distingue type=eq.b2c_pass vs type=eq.b2b_pro via paramètre kind, CORS whitelist sur b2b-create-checkout.php (@coding_agent, 2026-11-15, branche agent/coding/verify-subscription-b2b-pro, commit 673494c43) — PR non créée (gh CLI indisponible), SUPABASE_SERVICE_KEY non défini → lookup_failed en best-effort
- [x] P1 - Webhook Mollie b2b_first + plans annuels centralisés + b2b-create-checkout CORS whitelist + 31 tests B2B payment flow : b2b_first traité comme b2b_annual (grant pro 365j), mol_b2b_plans() ajoute pro_annual (690€) et brief_annual (290€), b2b-create-checkout.php créé (CORS whitelist, source b2b_first mensuel / b2b_annual annuel), tests 31/31 (@coding_agent, 2026-11-15, branche feat/sargagame-supabase-google-migration, commit 72ea7ccd1, poussée sur origin)
- [x] P0 - Cycle 2/3 fulfillment recovery : webhook Mollie → RPC sg_upsert_payment_grant, alias p7→trip7 durci (coupure 2026-08-01), logs sans PII (cid opaque), 21 tests, backfill DRY RUN audité, branche publiée sur origin (@coding_agent, 2026-11-04, branche fix/p0-mollie-fulfillment, commit 747af8376d972c9bd4712abb7b02b7f614f00b9c) — PR à créer, routage/backfill en attente approbation
- [x] P0 - Refonte UX visible : CTA « Trouve ta plage » accueil + bannière consent + SOS or (@ui_agent, 2026-10-14, branche agent/ui/p0-first-screen-20261014)
- [x] P0 - Transformation AI-native du repo (@CTO_agent, 2026-07-31)
- [x] P0 - Mollie payment flow fixes (@coding_agent, 2026-07-30)
- [x] P0 - PremiumModal error msg bug (@coding_agent, 2026-07-31)
- [x] P1 - B2B recurring Mollie (#210, @coding_agent)
- [x] P0 - Production release cleanup & validation (@release_engineer, 2026-07-31)

---

## P0 — Bloquant / urgent

### TASK-P0-001 Configurer webhook secret Mollie en prod
- **Priorité** : P0
- **Rôle** : coding_agent
- **Description** : `mollie-config.php` a `webhook_secret` commenté → signature webhook non vérifiée. Doit être configuré sur chaque serveur FTP après deploy.
- **Estimation** : 30 min
- **Statut** : [~] TASK-P0-001 ?" in_progress by coding_agent_agent code_ready, [ ] deployed_to_prod

- [x] P0 - Fix mol_supabase_mirror autonome (supprime dépendance `global $cfg`) + doc BUG-2026-012 (SUPABASE_SERVICE_KEY → lookup_failed) + Checklist fondateur P3 (5 secrets manquants) par coding_agent (2026-11-15, branche feat/sargagame-supabase-google-migration) — `php -l` OK, `b2b-payment-flow.test.cjs` 31/31, webhook fail-closed vérifié (aucun accès Pro sur redirection navigateur seule). SUPABASE_SERVICE_KEY toujours absent localement en attente secret fondateur.

---

## P1 — Haute priorité

### TASK-P1-001 Purger les A/B tests morts
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : ~50 flags `abVariant()` dans `Sargasses_PROD.jsx` diluent le trafic et compliquent les changements UX. Garder les flags avec résultats sig., supprimer le reste.
- **Comment** : `grep abVariant src/Sargasses_PROD.jsx` → lister → identifier ceux validés → supprimer les perdants
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent

### TASK-P1-002 Tests E2E Playwright du funnel payant
- **Priorité** : P1
- **Rôle** : QA_agent
- **Description** : Créer des scénarios Playwright couvrant le parcours critique : carte → verdict → paywall → paiement → premium.
- **Estimation** : 4h
- **Statut** : [x] done by QA_agent

### TASK-P1-003 Paywall comic compléter (header variants)
- **Priorité** : P1
- **Rôle** : coding_agent + UX_agent
- **Description** : Terminer le paywall BD en ajoutant les variants d'entête (scene/constel/beat) + vérifier les transitions
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent

### TASK-P1-004 Migration Google Sheets/Apps Script → Supabase (Phase 1 : inventaire)
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : Inventaire complet des Google Sheets, Apps Script, triggers, déploiements et automatisations Node.js ; documentation Phase 1 livrée.
- **Estimation** : 4h
- **Statut** : [x] done by coding_agent — branche `feat/sargagame-supabase-google-migration`, commit `12e1959ef`
- **Suivant** : Phase 2 (audit Supabase) requiert SUPABASE_SERVICE_KEY ; Phase 1.5 (clasp login) requise pour triggers/déployements/versions

### TASK-P1-005 Migration Google Sheets/Apps Script → Supabase (Phase 3 : modèle de données cible)
- **Priorité** : P1
- **Rôle** : coding_agent + architect_agent
- **Description** : Proposer le modèle de données cible Supabase pour remplacer les 13 onglets Google Sheets + 3 projets Apps Script. 10 tables cibles, mapping source→cible, RLS strict, règles de déduplication, clés sources préservées.
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent — `docs/migration-google-sheets/target-data-model.md` + `scripts/supabase-schema-target.sql`, branche `feat/sargagame-supabase-google-migration`, commit `ad4dd269e`
- **Suivant** : Valider avec architect_agent ; Phase 2 (audit Supabase) requiert SUPABASE_SERVICE_KEY ; Phase 4 (import données) ensuite

---

## P2 — Backlog normal

### TASK-P2-001 Spliter PremiumModal.jsx (~3 352, lignes)
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Extraire en sous-composants : doSubscribe (logique Silver), ErrorModal, PayGatewayHandler (Apple/Google)
- **Estimation** : 4h
- **Statut** : [~] TASK-P2-001 — in_progress by coding_agent

### TASK-P2-002 BCD reccurring → expose entièrement
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Les plans `mol_b2b_plans()` dans `mollie-lib.php` ont les montants; il faut exposer le CTA sur `/pro/` + auto-émission token essai 30j.
- **Estimation** : 4h
- **Statut** : [x] TASK-P2-002 done by coding_agent — liens de paiement B2B par hôtel avec attribution (hotel_id, prospect_id, offer_type) sur mollie.php, b2b-create-checkout.php, webhook 500 fix, générateur b2b-hotel-paylinks.cjs, registre b2b-sales-tracking.json. Branche `agent/coding/phase8-b2b-hotel-sales`, commit `3ac2886c7`, poussée sur origin.

### TASK-P2-003 Pages dédiée payment succès/erreur
- **Priorité** : P2
- **Rôle** : coding_agent + UX_agent
- **Description** : Aujourd'hui via query params; les pages dédiées `/payement/good` et `/payment/error` seraient plus propres.
- **Estimation** : 3h
- **Statut** : [~] TASK-P2-003 — in_progress by coding_agent

### TASK-P2-004. Transitions « case BD » entre écrans
- **Priorité** : P2
- **Rple** : coding_agent + UX_agent
- **Description** : Animation compose BD (slide les bolting) pour transitions top niveau: echoin Euro ∈ payer from cert to
- **Estimation** : 3h
- **Statut** : [ ] pending

---

## P3 — Améliorations
- [ ] Spliter paywall comic/plan B en composants séparés
- [ ] Améliorer PrenderDelivery légères des Mails monitoring de la
- [ ] Ajouter le sinning de Sílbano dans un scratch
- [x] Checklist fondateur P3 — secrets manquants (Mollie API key, webhook secret, Supabase service_role, Resend key, Stripe legacy) par coding_agent (2026-11-15, dans .ai/bugs.md)

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
