# Autopilot — Expériences

> Chaque implémentation shippée = une expérience avec flag de rollback et métrique de succès.

| ID | Date | Surface | Changement | Rollback flag | Métrique succès | Verdict |
|----|------|---------|-----------|---------------|------------------|---------|
| OPP-2026-001 | 2026-09-24 | Paywall strip « Ta semaine » (PassOffer) | initiale du jour + aria-label sur chaque pastille (7 ✓ anonymes → semaine lisible) | `?triplabels=0` | modal→CTA 7j vs baseline (263 opens → 6 CTA au 24/09) | QA OK 2026-09-24 — build 0 · bundle 38,2 Ko · smoke 4/4 · unit ALL PASS · proof labels-on/off (preview local) · REVIEW=MERGE (affichage pur, zéro data/paiement, i18n FR/EN/ES) |
</content>
