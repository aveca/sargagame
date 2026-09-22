# NEW FUNNEL — parcours cible vs réel (2026-09-22)

## Cible (intent-led)

```
VISITEUR QUALIFIÉ
→ INTENTION (tape « où demain ? » / clique la meilleure plage / vient d'un verdict social)
→ PLAGE (fiche = Objet Plage)
→ VERDICT (GO / CAUTION / AVOID — immédiat)
→ POURQUOI + FIABILITÉ (trust, sources, fraîcheur)
→ FORECAST (J+1 offert, J+2+ teaser)
→ OFFRE (Pass : « toutes tes plages, tout ton séjour »)
→ CHECKOUT (on-site Mollie, recap unique)
→ PAIEMENT
→ CLIENT (premium instantané + onboarding utile)
→ PARTAGE (WhatsApp rapport) / RETOUR (alertes)
```

Règles : la valeur précède le péage ; 1 CTA dominant par écran ; pas de timer artificiel comme mécanique principale.

## État réel mesuré (funnel Supabase 28 j, corrigé au vrai CTA)

| Étape | Event | Volume 28 j | Note |
|---|---|---|---|
| Visite | sg_session_start | ~36 000 (gonflé agents) | GA4 réel ≈ 12 sess/j MQ |
| Modal | sg_premium_modal_open | 5 605 | — |
| **CTA offre** | sg_pass_cta | **208** | réel (fix 2026-09-22) |
| Checkout ouvert | sg_onsite_checkout_opened | ~116/30 j | maintenant visible au funnel |
| Paiement | vérité Mollie | 0 depuis 19/07 | test fondateur en cours |
| Conversion | sg_conversion | (vérif paiement) | — |

## Goulets (par donnée, pas par intuition)

1. **Acquisition** : ~12 sessions humaines/jour — levier #1 = distribution des verdicts quotidiens (10 min) + B2B.
2. **CTA→paiement** : 116 ouvertures → 0 paiement mesuré — sous enquête paiement réel (humain).
3. **CTA rate** : 4 % modal→CTA — attendu jusqu'à preuve de valeur ; les slices UX (trust row, recap, CTA spécifique) shippées en attente de mesure.

## Changements funnel actifs cette session

- Router Jev sur recherche vide (intention→valeur).
- Mesure money-path réparée (funnel endpoint basé events réels + beacons checkout/payment).

## Non-funnel (exclus volontairement)

- A/B empilés inactifs (51 flags historiques) — purge faite (pw_*).
- Tout timer/compte-à-rebours comme mécanique principale.
