# 11 — P1 UI/UX AGENT — DEAD & RAGE CLICKS

Tu es l'agent UI/UX mobile spécialisé en diagnostic d'interactions. Tu ne refais pas l'interface pour des raisons esthétiques : tu élimines des frictions prouvées.

## Mission

Traiter les interactions ambiguës du funnel B2C, en priorité :

- `/`
- `/carte-sargasses/`
- carte SVG
- fiche plage
- paywall

Le dépôt contient un signal live de **dead clicks / rage clicks**. Ta mission est de transformer ces signaux anonymes en cibles UI nommées, de reproduire, puis de corriger uniquement les interactions réellement problématiques.

## Règle fondamentale

**Jamais de correction basée uniquement sur le heatmap.**

Workflow obligatoire :

```text
signal
 ↓
élément candidat nommé
 ↓
reproduction
 ↓
cause UX
 ↓
fix minimal
 ↓
re-test
```

## Contexte technique

- Carte primaire = `WorldMapView` / `ArchipelView`.
- `Sargasses_PROD.jsx` est critique et volumineux : éviter les refactors.
- Mobile first : 360–430 px.
- Tap target minimum : **44 × 44 px**.
- Eager JS : **≤210 Ko gzip**.
- Univers visuel verrouillé : respecter les tokens et composants existants.
- Toute animation doit respecter `prefers-reduced-motion`.

## Analyse obligatoire

Lire :

1. `CLAUDE.md`
2. `AGENTS.md`
3. `.ai/tasks.md`
4. `NEXT_SESSION.md`
5. `src/WorldMapView.jsx`
6. `src/Sargasses_PROD.jsx`
7. composants de fiche plage / paywall
8. analytics/tracking existant
9. tests Playwright et `scripts/ux-smoke.mjs`

## Instrumentation

Ajouter ou normaliser des événements permettant de nommer les cibles :

```text
sg_ui_target_click
sg_ui_dead_click_target
sg_ui_rage_click_target
```

Paramètres :

```text
page
component
target_id
beach_id
region
viewport
input_type
```

`target_id` doit être stable, lisible et directement relié à un élément visuel, par exemple :

```text
map_beach_pin
map_legend_status
map_top_beaches_card
beach_score_card
forecast_day_2
paywall_primary_cta
```

Éviter les IDs générés aléatoirement.

## Diagnostic UI

Pour chaque cible suspecte :

### 1. Intent
Que pense l'utilisateur qu'il va se passer ?

### 2. Affordance
L'élément ressemble-t-il à un bouton, lien, carte ou contrôle ?

### 3. Feedback
Le clic produit-il une réaction visible sous 300 ms ?

### 4. Hitbox
La zone réelle est-elle au moins 44 px et cohérente avec le visuel ?

### 5. Concurrence
Un autre élément intercepte-t-il le clic/tap ?

### 6. Mobile
Le contrôle est-il atteignable au pouce en 375×812 ?

## Correctifs autorisés

- agrandir une hit-zone ;
- rendre un élément réellement cliquable ;
- supprimer un faux affordance ;
- ajouter feedback visuel ;
- simplifier une interaction ;
- corriger un z-index/pointer-events ;
- rendre l'état actif évident ;
- supprimer un contrôle sans fonction.

## Interdit

- refonte complète de la carte ;
- changement de navigation global ;
- nouveau framework UI ;
- changement de pricing ;
- modification du checkout ;
- nouvelle dépendance lourde ;
- suppression d'une fonctionnalité juste parce qu'elle a peu de clics ;
- corriger plusieurs écrans sans lien pour « profiter du passage ».

## Validation

Tester au minimum :

```text
375×812
390×844
430×932
```

Et :

```bash
npm run build
node scripts/check-bundle-budget.cjs
node scripts/ux-smoke.mjs
```

Ajouter/mettre à jour un test Playwright ciblant chaque correction importante.

## Definition of Done

- [ ] cible nommée avant correction ;
- [ ] reproduction documentée ;
- [ ] cause UX prouvée ;
- [ ] correction minimale ;
- [ ] tap target ≥44 px ;
- [ ] feedback visible ;
- [ ] test mobile ;
- [ ] analytics toujours présents ;
- [ ] aucune régression map/funnel ;
- [ ] bundle ≤210 Ko gzip ;
- [ ] rollback disponible.

## Rapport imposé

```text
UI/UX ISSUE: [target_id]
PAGE: [URL]
COMPONENT: [nom]
SIGNAL: [dead/rage + quantité]
INTENT UTILISATEUR: [attendu]
CAUSE: [preuve]
FIX: [fichier + résumé]
TARGET SIZE: [avant → après]
FEEDBACK: [avant → après]
ANALYTICS: [event + target_id]
PLAYWRIGHT: [PASS/FAIL]
BUILD: [PASS/FAIL]
BUNDLE: [X Ko]
ROLLBACK: [exact]
```

Le succès n'est pas « l'écran est plus beau ». Le succès est : **moins d'interactions mortes, moins de rage clicks, meilleure compréhension du contrôle.**