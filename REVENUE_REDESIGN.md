# REVENUE REDESIGN — stratégie produit (2026-09-22)

## Positionnement

**Beach Decision Engine.** Pas une carte météo. La question : « où aller aujourd'hui/demain/ce séjour ? » — la réponse : verdict + alternative, mesurée.

## Philosophie : SEE → DECIDE → GO → PROTECT

- SEE : verdict par plage (libre, satellite).
- DECIDE : pourquoi (règles visibles).
- GO : action (y aller / alterner).
- PROTECT : alertes + forecast si ça change.

## Actifs conservés (éprouvés)

- Donnée ERDDAP live, prévision v3, fiabilité publique (`/fiabilite/`) — moat honnêteté.
- Univers Veilleur / golden-hour — différenciation émotionnelle vs Google Maps.
- Checkout Mollie on-site (probe vert ×5 domaines) — money-path INTACT.
- Tests régressions + gates (38,2 Ko eager) — vitesse.

## Frictions connues (héritées)

| Friction | Statut |
|---|---|
| Barguignage de l'offre (5 prix fantômes historiques) | paylinks fantômes purgés ; 1 offre visible (Pass 30 j) |
| Jauge funnel cassée (event mort) | réparée |
| Dashboard aveugle checkout→paiement | réparé |
| Intent oublié sur recherche landing | routé (Jev v1) |
| Trafic réel microscopique | distribution + B2B |
| Premium value framing « features » | trust row + recap + CTA spécifique livrés (à mesurer) |

## Stratégie UX (progressive, jamais big-bang)

Refonte totale = plusieurs sessions. Chaque slice : flag de rollback + contrat test + mesure. Slice 1 livrée (JevAsk). Slices candidates suivantes (par preuve) :
1. Homepage: verdict du jour avant tout autre contenu (existe — HeroVerdict).
2. Fiche plage: verdict GO/CAUTION/AVOID explicite + « pourquoi » 1 phrase.
3. Paywall: copy « votre décision plage » (déjà PassOffer — à mesurer vs framer features).

## Métrique de décision de redesign

KPI: REVENUE / QUALIFIED VISITOR (renseigné dès paiements réels connus).
Proxy court terme: pass_cta/session, checkout_open_to_payment.

## Discipline

MONEY-PATH immuable par défaut. Bundle ≤ 210 Ko eager. Aucune fausse preuve sociale. Aucun prix inventé.
