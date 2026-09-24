# Personalization V1 — règles déterministes + mesures (mission §4)

> Zéro ML. Zéro signal sensible. Zéro activation sans mesure.
> Une règle = hypothèse mesurable attachée à la chaîne AHA → revenue (paid prime).

## Signaux autorisés (déjà disponibles, non sensibles)

`region` (build) · `lang` (path /en|/es) · `beach` (fiche ouverte) · `intention`
(mots-clé saisie/chat : "demain", "où aller", "annuler") · `source` (utm/deeplink
ex. ?pro=1, beach_page) · `étape funnel` (vue carte / fiche / premium_open / CTA /
checkout) · `interaction session` (sg_trip_open, sg_tomorrow_reveal…) · `retour`
(sg_seen_beach présent, pass expiré).

## Candidats de règles (statut : MESURÉ D'ABORD, activé après)

| Règle | Signal | Surface adaptée | Mesure (avant activation) |
|-------|--------|-----------------|---------------------------|
| R1 « je pars demain » | intention demain / fiche ouverte | Tomorrow → 7 jours → Plan séjour → Premium | sg_tomorrow_reveal → sg_trip_open → sg_premium_modal_open → sg_pass_cta → paid |
| R2 « quelle plage maintenant ? » | arrivée carte sans plage | Verdict → Backup (plan B réel) → Premium | sg_beach_open → sg_alternative_reveal → sg_pass_cta → paid |

## Interdits

- Aucune décision « gagnante » sur les clics seuls (cf. lib/metrics.cjs).
- Aucune règle activée sans cohortes A/B + fenêtre + échantillon (cf. lib/experiments.cjs).
- Jamais de fake data pour simuler une intention (le moat = honnêteté).
- B2B non concerné par ces règles B2C (boucle séparée).
