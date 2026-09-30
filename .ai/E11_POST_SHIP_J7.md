# E11 POST-SHIP J+7 — mesure 2026-09-30 (trust row PassOffer, PR #705 mergee 09-22 00:38 UTC)

> Verdict : **INCONCLU — NEUTRE, PAS DE LIFT DEMONTRABLE, PAS DE REGRESSION** (`E11_J7_NEUTRAL`).
> Sources : `scripts/automation/data/daily-metrics.json` (pipeline committe, zero requete ad hoc).
> Comparaison stricte vs `.ai/E11_BASELINE.md` (bande de decision 0-13 %, hors spike 09-15).

## Fenetres comparees (UTC, 7 j chacune)

- Baseline : 2026-09-13 -> 09-19 — **250 vues / 28 CTA = 11,2 %**
- Post-ship : 2026-09-22 -> 09-29 — **114 vues / 9 CTA = 7,9 %**

## Post-ship jour par jour (`ctaViews` = pass_offer_view, `modalCta` = pass_cta)

| Date | Vues | CTA | Taux | Aval (onsite/conv) |
|------|------|-----|------|--------------------|
| 09-22 | 27 | 0 | 0 % | 0 / 0 |
| 09-23 | 8 | 0 | 0 % | 0 / 0 |
| 09-24 | 17 | 4 | 23,5 % | 4 / 0 |
| 09-25 | 14 | 1 | 7,1 % | 1 / 0 |
| 09-26 | 12 | 0 | 0 % | 0 / 0 |
| 09-27 | 6 | 0 | 0 % | 0 / 0 |
| 09-28 | 12 | 0 | 0 % | 0 / 0 |
| 09-29 | 18 | 4 | 22,2 % | 4 / 0 |

## Statistique

- z = 0,968 — p bilateral ≈ 0,33 → **difference non significative** (95 %).
- `cta_to_onsite` reste 100 % (9/9) ; `conversion` = 0 sur les 2 fenetres (E11 jugeable CTA only, cf. baseline).
- Trafic PassOffer quasi divise par 2 : 35,7 vues/j (baseline) -> 16,3 vues/j (post) → puissance statistique faible.

## Decision (regle cadrage baseline)

- Le taux post-ship **reste DANS la bande 0-13 %** → ni lift avouable, ni regression a revertir.
- Lift exige par la regle : non observe → **pas de victoire declaree**.
- Revert : non justifie (pas de baisse aval, 0 pageerror lie, cout fixe nul : +~20 px, copy recyclee, aucun tracking ajoute, rollback `?trust_row=0` dispo).

**Decision d'agent (panel produit/adversarial, adversarial prime en cas de doute)** :
**GARDER la trust row, PROLONGER la mesure a J+14 post-ship (2026-10-06)** pour compenser
la chute de volume et lisser la volatilite journaliere (4 jours a 0 % post-ship).
Si le taux cumule 09-22->10-05 reste sous la bande <=8 % avec N >= 200 vues → revert `?trust_row=0` par defaut.

## Checklist non-regression (rappel)

- Rollback `?trust_row=0` present dans `src/PassOffer.jsx` (regex flags) — OK au 2026-09-30.
- Aucun event ajoute par E11 (`sg_pass_offer_view` unique) — contrat test conserve.

*Mesure par : uiux-agent · Comparaison daily-metrics (reproductible, z-score 2 proportions).*
