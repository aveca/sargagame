=== PROGRESSIVE DEPLOY — 2026-08-13 ===

Étape 1 (fait + poussé):
- Audit visuel complet (27 screenshots, 7 viewports)
- Fix P0 sources: beach validation, cookie banner z-index, stale toast
- Documentation audit (INVENTORY, TOP20, TOP10)

Étape 2 (fait + poussé):
- Pull données Copernicus fraîches (stale: false, 2026-08-13 07:11)
- Vérification: beach "les-salines" a forecast (2 jours) mais pas 7
- Status undefined → code attend `status` pour le badge

Étape 3 (déployé):
- Push `ff0695bd` (merge + audit docs)
- Pipeline `daily-copernicus.yml` déclenché

Reste (P1 à suivre):
- Remplir forecast complet 7j si données disponibles
- Vérifier status mapping dans `sargData`
- Replay funnel complet A→B (Playwright)
