# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

---

## Récemment complété
- [x] P0 - Mesure funnel checkout morte : `checkout.reached=0` alors que `paymentsReal=5` — cause = `sg_sos_checkout_start` absent de `SG_FUNNEL_EVENTS` (jamais envoyé à Supabase) + exclu de la file `critical`. Allowlist + critical corrigées (@mission_agent, 2026-10-26, PR #1064, MERGEE, deploye + verifie live bundle contient les 3 evenements)
- [x] P0 - CI rouge sur main : `reliability-page-satellite-timestamp.test.cjs` frontière introuvable → remplacée par la prochaine fonction de premier niveau, 13 assertions horodatage intactes (@mission_agent, 2026-10-26, meme PR #1064)
- [x] P2 - /fiabilite/ rendait deux <h1> identiques (variants A/B control-only / v2) : style extrait en classe .r-h1, fallback passé en <p> (@mission_agent, 2026-10-26, PR #1062, MERGEE, deploye + verifie live h1=1 6/6)
- [x] P1 - Home + fiche plage sans aucun <h1> dans le DOM rendu (mot-clé SEO sr-only en <p> sur hypothèse fausse) : devenu <h1> invisible + token smoke H1= (@mission_agent, 2026-10-26, PR #1061, MERGEE, deploye + verifie live h1=1 6/6, home+fiche+pro+hotels+fiab)
- [x] P1 - Fuite code source WorldMapView (décor solaire) : props style rendues comme texte sur les 6 domaines — restauration balise + test `jsx-style-orphan` + token smoke `RAW_CSS_TEXT` (@mission_agent, 2026-10-26, PR #1054, MERGEE, deploye + verifie live v221/2073d594, leaks=0 6/6)
- [x] P0 - Test CI bloquant `track-record-publication-workflow` : assertion fausse `stash<fetch` remplacee par l invariant reel `stash<rebase`, renforcee, mutation-tested (@mission_agent, 2026-10-26, PR #1057, MERGEE, CI Tests vert, #1049 fermee doublon)
- [x] P0 - Paywall ne s ouvrait pas (ReferenceError hasAnnual) sur les 6 domaines (@mission_agent, 2026-10-23, PR #1019, deploye + verifie live)
- [x] P1 - Canonicals martinique sur /about /research /investigacion /for-hotels des domaines USD (@mission_agent, 2026-10-23, PR #1019)
- [x] P2 - Lisibilite des puces de carte 9px -> 11.31px (mobile) / 12px (desktop) (@mission_agent, 2026-10-23, PR #1019)
- [x] P2 - Suite locale 57/57 : artefact CRLF de mollie-live-gate.test.cjs corrige (assertion inchangee) (@mission_agent, 2026-10-23, PR #1019)
- [x] P0 - Liens legaux in-app 404 (banniere cookies, paywall, pied de page) sur 4 regions + budget bundle 210.3>210 Ko (@mission_agent, 2026-10-23, branche agent/mission/v3-sargagame-20261022, PR #1016)
- [x] P1 - Sitemap de secours Tulum : pages FR/MQ/GP retirees, 8 URLs regionales (@mission_agent, 2026-10-23, meme branche)

- [x] P0 - PR #1045 CI build avant tests : `npm run build` deplace avant `npm test` dans `.github/workflows/ci-tests.yml` (commit dbf52e5d, push main)
- [x] P1 - PR #1043 Copernicus rebase stash : `git stash --include-untracked` avant fetch/rebase + `git stash pop` sur chemins succes/echec (commits 3576c354, c5374b7c, push main)
- [x] P1 - PR #1044 Protection verdicts stales HeroVerdict : masque verdict/score/compteur quand `isSatelliteFresh12h(sargData)`=false, affiche "Vérification en cours" (commit 95ea62e5, push main, tests 15/15 OK, bundle 208.0/210 Ko)

- [x] P0 - Refonte UX visible : CTA « Trouve ta plage » accueil + bannière consent + SOS or (@ui_agent, 2026-10-14, branche agent/ui/p0-first-screen-20261014)
- [x] P0 - Premier écran : chat d'hésitation n'occlut plus le premier écran sans interaction (@coding_agent, 2026-10-27, branche agent/coding/p0-first-screen-chat, commit abc721593)

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
- **Statut** : [~] TASK-P2-002 — in_progress by coding_agent

### TASK-P2-003 Pages dédiée payment succès/erreur
- **Priorité** : P2
- **Rôle** : coding_agent + UX_agent
- **Description** : Aujourd'hui via query params; les pages dédiées `/payement/good` et `/payment/error` seraient plus propres.
- **Estimation** : 3h
- **Statut** : [~] TASK-P2-003 — in_progress by coding_agent

### TASK-P2-004. Transitions « case BD » entre écrans + Refactoring UI global + Playwright
- **Priorité** : P2
- **Rôle** : coding_agent + UX_agent
- **Description** : Refactoring UI global (hiérarchie visuelle, responsive, accessibilité, états chargement/erreur) + transitions style BD entre écrans + tests Playwright avec captures avant/après sur 3 viewports (1440×900, 768×1024, 390×844).
- **Estimation** : 6h
- **Statut** : [x] done by coding_agent (branch agent/coding/ui-refactoring-playwright)

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
