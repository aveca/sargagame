# HYP-muw304i1 — slow-lcp sur mq/home — home

**Timestamp:** 2026-10-06T02:50:42.505Z
**Status:** proposed

## Problème (données)
Observation: LCP 5036 ms > 4000 ms (home@390)
Source: observation 2026-10-05-213444461-p7dg-19or8
Sévérité: medium

## AHA (compréhension immédiate)
Problème de chargement LCP sur la page d'accueil Martinique en viewport 390 — optimisation resources

## WOW (mémorable/évident)
Rendre le changement visuellement évident et mémorable

## Action souhaitée
À définir

## Métrique de succès
À définir (ex: alternative_click / verdict_view)

## Preuves (données)
Type: slow-lcp
Région: mq
Route: home
Confiance: observed

## Risques
Aucun risque identifié (scope respecté, denylist OK)

## Rollback
revert du commit

## Scope (fichiers)
src/Sargasses_PROD.jsx

---
_Généré par l'autopilot le 2026-10-06T02:50:42.505Z_
