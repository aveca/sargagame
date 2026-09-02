# 10 — P1 CRO « 10 SECONDES POUR DÉCIDER »

Tu es le senior product/CRO engineer de Sargagame. Tu améliores le funnel B2C existant sans casser le money-path.

## Mission produit

Optimiser le parcours réel :

```text
ARRIVÉE
  ↓
CARTE
  ↓
PLAGE
  ↓
VERDICT
  ↓
PAYWALL
  ↓
MOLLIE CHECKOUT
```

Objectif utilisateur : en **≤10 secondes**, comprendre où aller aujourd'hui et, en voyant la valeur du forecast, comprendre pourquoi débloquer les 7 jours.

## Contexte canonique

- Carte primaire = SVG `WorldMapView` / `ArchipelView`.
- `src/Sargasses_PROD.jsx` reste un monolithe critique : pas de refactor opportuniste.
- `PremiumModal` est déjà lazy-loadé.
- B2C = pass one-time ; Mollie = caisse active.
- Ne jamais réintroduire Stripe comme nouvelle caisse.
- Verdict data-driven : le placement partenaire ne doit jamais influencer le statut d'une plage.
- Budget eager JS : **≤210 Ko gzip**.
- Mobile first : 360–430 px, tap targets ≥44 px.

## Étape 1 — Audit avant code

Lire d'abord :

1. `CLAUDE.md`
2. `AGENTS.md`
3. `NEXT_SESSION.md`
4. `.ai/tasks.md`
5. `src/Sargasses_PROD.jsx`
6. `src/WorldMapView.jsx` si présent / composant carte réel
7. `src/PremiumModal.jsx` et sous-composants
8. le tracking funnel existant
9. les tests Playwright / `scripts/ux-smoke.mjs`

Rechercher les issues/constats liés aux **dead clicks** et **rage clicks**. Ne corrige jamais un clic supposé mort sans reproduction ou preuve instrumentation.

## Étape 2 — Instrumentation obligatoire

Chaque étape doit être identifiable par un événement first-party stable :

```text
sg_session_start
sg_map_view
sg_map_beach_click
sg_beach_view
sg_verdict_seen
sg_forecast_preview
sg_paywall_open
sg_paywall_cta
sg_checkout_start
sg_payment_success
```

Pour les interactions ambiguës :

```text
sg_dead_click_target
sg_rage_click_target
```

Paramètres minimum :

```text
page
component
beach_id
region
viewport
device
```

Ne pas introduire de double tracking ni casser les événements historiques utilisés par les dashboards existants.

## Étape 3 — UX cible

### A. Carte

L'utilisateur doit identifier rapidement les plages favorables.

Prioriser :
- statut actuel ;
- score ;
- fraîcheur des données ;
- hiérarchisation des meilleures plages ;
- zones/tap targets sans ambiguïté.

Ne surcharge pas la carte. La carte doit répondre à :

> **« Où aller ? »**

### B. Fiche plage

Au-dessus de la ligne de flottaison :

```text
SCORE 84/100
BON AUJOURD'HUI
Actualisé il y a X h

Pourquoi ?
[éléments de preuve simples]

Demain / J+2 / J+3
[aperçu]
```

Le verdict doit être compréhensible sans jargon scientifique.

### C. Paywall

Montrer la valeur avant la barrière :

```text
Aujourd'hui → verdict complet
J+1 → aperçu
J+2 → aperçu
J+3 → aperçu
...
```

Puis expliquer clairement ce que débloque le pass.

Le copy doit rester honnête : ne jamais promettre une certitude que le modèle n'a pas.

### D. CTA

CTA principal : un seul objectif à la fois.

Contraintes :
- thumb reachable ;
- ≥44 px ;
- libellé explicite ;
- pas de faux boutons ;
- pas de cul-de-sac après clic.

## Étape 4 — Rollback

Toute modification comportementale doit avoir un kill-switch/flag réversible, compatible avec les conventions existantes (`?flag=0` ou mécanisme déjà présent).

Ne change pas simultanément pricing + paiement + UX. Le prix et la logique Mollie sont hors scope.

## Étape 5 — Validation

Exécuter au minimum :

```bash
npm run build
node scripts/check-bundle-budget.cjs
node scripts/ux-smoke.mjs
```

Puis Playwright ciblé sur **mobile 375×812** :

```text
home → map → beach → verdict → paywall → checkout
```

Vérifier explicitement :

- [ ] aucune régression visuelle de la carte ;
- [ ] aucun élément cliquable sans action ;
- [ ] aucun rage/dead click connu reproduit après fix ;
- [ ] tracking continu de session à checkout ;
- [ ] eager JS ≤210 Ko gzip ;
- [ ] Mollie intact ;
- [ ] aucune nouvelle dépendance lourde.

## Definition of Done

La mission est réussie seulement si :

1. le parcours critique reste fonctionnel ;
2. les interactions ambiguës sont nommées et instrumentées ;
3. le verdict est visible et compris rapidement ;
4. la valeur du forecast 7 jours est visible avant paiement ;
5. le changement est mesurable ;
6. le rollback est immédiat ;
7. les tests passent.

## Rapport imposé

```text
SPRINT: CRO 10 SECONDES

BASELINE:
- funnel map→beach: [metric]
- beach→paywall: [metric]
- paywall→CTA: [metric]
- CTA→checkout: [metric]
- checkout→payment: [metric]
- dead clicks: [metric]
- rage clicks: [metric]

CHANGES:
- [fichier] : [résumé]

UX RESULT:
- temps jusqu'au verdict: [mesuré/non mesuré]
- frictions supprimées: [liste]

ANALYTICS:
- événements ajoutés: [liste]

BUILD: [PASS/FAIL]
BUNDLE: [X Ko gzip]
SMOKE: [PASS/FAIL]
PLAYWRIGHT MOBILE: [PASS/FAIL]
MONEY-PATH: [PASS/FAIL]
ROLLBACK: [exact]
```

Ne confonds jamais « plus joli » avec « meilleure conversion ». Chaque changement doit supprimer une friction mesurable du parcours critique.