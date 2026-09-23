# E11 BASELINE — gelée 2026-09-20 (Phase 1, AUCUN CODE MODIFIÉ)

> Verdict : **E11_BASELINE_READY**. Sources : `scripts/automation/data/
> funnel-snapshot.json` + `daily-metrics.json` (committés, pipeline
> `funnel-from-supabase.cjs`, zéro credential, zéro requête ad hoc).

## Fenêtre exacte (UTC)

- Glissante 7 j du `funnel-snapshot` : **2026-09-12T20:26:52Z → ~2026-09-19T20:26Z**
  (`window_days:7`, `total_rows:14665`, régénéré quotidiennement par workflow).
- Recoupée jour par jour via `daily-metrics.json` (entrées 2026-09-13 → 2026-09-19).

## Chiffres (métrique primaire E11)

- **Dénominateur** `pass_offer_view` (vues PassOffer) : **250** (snapshot) / 248 (somme daily 09-13→09-19, écart = bord de fenêtre, négligeable).
- **Numérateur** `pass_cta` (CTA) : **28** (identique dans les deux pipelines).
- **Taux CTA = 28/250 = 11,2 %** (pipeline : `cta_view_to_click:11.2`).

## Jour par jour (daily-metrics, `modalCta`/`ctaViews`)

| Date | Vues | CTA | Taux |
|------|------|-----|------|
| 09-13 | 18 | 0 | 0 % |
| 09-14 | 26 | 0 | 0 % |
| 09-15 | 58 | 24 | 41,4 % ⚠️ spike inexpliqué |
| 09-16 | 20 | 0 | 0 % |
| 09-17 | 43 | 0 | 0 % |
| 09-18 | 60 | 1 | 1,7 % |
| 09-19 | 23 | 3 | 13,0 % |

## Volume aval disponible

- `onsite_checkout_opened` : 28/28 CTA (100 %) · `conversion` : 0 · `mollie_redirect` : 0.
- Par île (vues/CTA) : MQ 140/24 (17,1 %) · GP 31/3 · PUNTACANA 43/0 · FLORIDA 25/0 · RIVIERAMAYA 10/1 · TULUM 1/0.

## Exclusions / limites

- Ancienne baseline ~1,3 % **NON comparable** : autre dénominateur (`premium_modal_open`,
  390→5) + fenêtre périmée (J0-J30). Ne pas l'utiliser comme référence décisionnelle.
- N faible (248 vues) + volatilité forte (4 jours à 0 %, un spike 41 % le 09-15
  de cause inconnue) → exiger une fenêtre post-ship de même taille avant de
  conclure un lift ; seuil pratique : sortie de la bande 0–13 % hors spike.
- `conversion` = 0 sur la fenêtre : E11 ne peut être jugé que sur le CTA, jamais
  sur le revenu.
- Données = events allowlistés existants ; aucune instrumentation ajoutée.

## Règle de décision post-ship (rappel cadrage)

Lift CTA rate vs 11,2 % sur 7 j comparables, sans baisse aval (checkout/close),
0 pageerror, bundle ≤ 210 Ko — sinon revert (`?trust_row=0`).
