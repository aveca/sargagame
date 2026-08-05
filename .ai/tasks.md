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

---

## P0 — Bloquant / urgent

### TASK-P0-001 Configurer webhook secret Mollie en prod
- **Priorité** : P0
- **Rôle** : coding_agent
- **Description** : `mollie-config.php` a `webhook_secret` commenté → signature webhook non vérifiée. Doit être configuré sur chaque serveur FTP après deploy.
- **Estimation** : 30 min
- **Statut** : [x] code_ready, [ ] deployed_to_prod

---

### TASK-P0-002 Réparer le funnel modal→CTA
- **Priorité** : P0
- **Rôle** : ui_agent + coding_agent
- **Description** : Le taux modal→CTA est de 1.5% (16,766 opens → 254 clicks). Les users ferment le modal sans cliquer. Refonte du paywall : CTA plus visible, copy plus engageant, preuve sociale, sticky CTA mobile.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 4h
- **Statut** : [ ] pending

### TASK-P0-003 Corriger le checkout (quasi-inexistant)
- **Priorité** : P0
- **Rôle** : coding_agent + qa_agent
- **Description** : 14 checkout views sur 16,766 modal opens = le lien vers le paiement est cassé ou invisible. Vérifier le redirect Mollie on-site, le bouton checkout dans le modal, et le flow complet.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 3h
- **Statut** : [ ] pending

---

## P1 — Haute priorité

### TASK-P1-004 Corriger tracking source "unknown" (27%)
- **Priorité** : P1
- **Rôle** : coding_agent + data_agent
- **Description** : 27% des sources modal sont "unknown" = perte de data analytique. Corriger le tracking des sources dans PremiumModal.jsx et Sargasses_PROD.jsx.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 2h
- **Statut** : [ ] pending

### TASK-P1-005 Solariser les A/B tests (45+ → 5 max)
- **Priorité** : P1
- **Rôle** : product_agent + coding_agent
- **Description** : 45+ variants A/B en parallèle = mosaïque incohérente et signal faible. PRODUCT.md §5 dit "On fige UN parcours". Réduire à max 5 concurrents. Fusionner les tests redondants.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 4h
- **Statut** : [ ] pending

### TASK-P1-006 Améliorer push primer (13% → >30%)
- **Priorité** : P1
- **Rôle** : ui_agent + growth_agent
- **Description** : Le push primer n'est accepté que à 13% (58/450). Le timing ou le copy est mauvais. Tester un primer différé (après 2ème visite) avec copy orienté valeur.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 2h
- **Statut** : [ ] pending

### TASK-P1-007 Investiguer friction (1,065 events)
- **Priorité** : P1
- **Rôle** : qa_agent + ui_agent
- **Description** : 1,065 events `sg_friction` = problème UX à identifier. Lire les logs, identifier les patterns (scroll bloqué, clic impossible, animation sans reduced-motion).
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 2h
- **Statut** : [ ] pending

### TASK-P1-001 Purger les A/B tests morts
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : ~50 flags `abVariant()` dans `Sargasses_PROD.jsx` diluent le trafic et compliquent les changements UX. Garder les flags avec résultats sig., supprimer le reste.
- **Comment** : `grep abVariant src/Sargasses_PROD.jsx` → lister → identifier ceux validés → supprimer les perdants
- **Estimation** : 2h
- **Statut** : [ ] pending

### TASK-P1-002 Tests E2E Playwright du funnel payant
- **Priorité** : P1
- **Rôle** : QA_agent
- **Description** : Créer des scénarios Playwright couvrant le parcours critique : carte → verdict → paywall → paiement → premium.
- **Estimation** : 4h
- **Statut** : [ ] pending

### TASK-P1-003 Paywall comic compléter (header variants)
- **Priorité** : P1
- **Rôle** : coding_agent + UX_agent
- **Description** : Terminer le paywall BD en ajoutant les variants d'entête (scene/constel/beat) + vérifier les transitions
- **Estimation** : 3h
- **Statut** : [ ] pending

---

## P2 — Backlog normal

### TASK-P2-005 Optimiser les régions USD (FL/PC/RM)
- **Priorité** : P2
- **Rôle** : growth_agent + coding_agent
- **Description** : Florida (7.5%), PuntaCana (3.4%), RivieraMaya (2.1%) ont du trafic mais pas de conversion visible. Vérifier le funnel par région, le pricing USD, et l'adaptation linguistique.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 3h
- **Statut** : [ ] pending

### TASK-P2-006 Améliorer le jeu (0.05% → >1% engagement)
- **Priorité** : P2
- **Rôle** : ui_agent + growth_agent
- **Description** : 70 starts / 144k sessions = 0.05% engagement. Le jeu est un levier de rétention potentiel. Améliorer la visibilité du CTA jeu, le onboarding, et la boucle de récompense.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 3h
- **Statut** : [ ] pending

### TASK-P2-007 Cleanup variants A/B non concluants
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Supprimer les A/B non conclusants identifiés dans le rapport. Garder uniquement les tests avec résultats significatifs. Complémentaire à TASK-P1-005.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 2h
- **Statut** : [ ] pending

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
- **Statut** : [ ] pending

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
- **Statut** : [ ] pending

---

## P3 — Améliorations

### TASK-P3-001 Email recovery (51 éligibles, 41% taux)
- **Priorité** : P3
- **Rôle** : growth_agent + coding_agent
- **Description** : 51 utilisateurs éligibles au checkout recovery, 21 clicks (41% taux). Câbler le drip email automatique pour les abandons checkout.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 3h
- **Statut** : [ ] pending

### TASK-P3-002 Preuve sociale dans le modal
- **Priorité** : P3
- **Rôle** : ui_agent + copy_agent
- **Description** : Ajouter des témoignages ou compteur de users satisfaits dans le paywall. Le rapport note l'absence de social proof comme frein à la conversion.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 2h
- **Statut** : [ ] pending

### TASK-P3-003 A/B pricing monthly vs annual vs season
- **Priorité** : P3
- **Rôle** : product_agent + coding_agent
- **Description** : Le plan monthly domine (9 ventes), annual sous-performant (1). Tester un pricing annual avec réduction plus agressive ou un season pass. Vérifier la cohérence avec `mol_b2b_plans()`.
- **Source** : Rapport analytics 178k events (2026-08-05)
- **Estimation** : 2h
- **Statut** : [ ] pending

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