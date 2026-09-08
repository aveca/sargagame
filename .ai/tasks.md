# S0 — 6-Région Quality Gate Tasks

## PHASE B SPRINT 1 — [x] done (2026-09-08, GREEN)
- **TASK-PHASEB-SPRINT1**: Remédiation globale P0 (01→06) + P1 conversion/navigation
  - Preuves : `.ai/ui-audit/PHASE-B-SPRINT1-REPORT.md` + `.ai/ui-audit/shots-phaseB/{mq,gp,florida,rivieramaya}/`
  - Suivi Sprint 2 (P2) : game icon pass (ChasseDetail/arène), flags RegionNav → SVG, nettoyage code mort
    (StatusBadge/FilterChip/filtersIcon), captures puntacana/tulum dédiées si doute.

## Priorité #1 — [x] done
- **TASK-S0-AUDIT**: Réaliser audit complet S0 6 régions (mq, gp, florida, puntacana, rivieramaya, tulum)
  - Sous-tâches : validation unité, intégration, E2E, UX, SEO, territorialité, payment, bundle
  - Statut : TERMINÉ — tout green, 0 P0, matrice complète produite

## Priorité #2
- **TASK-SEO-HREFLANG**: Audit et correction hreflang/canonical sur les 6 régions
  - Responsable : data_agent
  - Dépendances : output production des region-seo-pages.cjs
  - Critère succès : hreflang tags cohérents, canonical pointant vers bonne région

## Priorité #3
- **TASK-PAYLINKS**: Ajouter paymentLinks config dans region JSON pour rivieramaya + tulum
  - Responsable : coding_agent
  - Dépendances : schema region JSON, stripe price IDs existants
  - Critère succès : paymentLinks présent avec monthly/yearly/tripPass pour USD régions

## Priorité #4
- **TASK-RM-INFINITE**: Vérifier RM_INFINITE=[] en émulation reduced-motion live
  - Responsable : qa_agent
  - Dépendances : emulateMedia sur chaque domaine régional
  - Critère succès : aucune animation infinie visible quand prefers-reduced-motion:reduce

## Priorité #5
- **TASK-MQ-BASELINE**: Maintenir baseline MQ non-régression
  - Responsable : devops_agent
  - Dépendances : daily-copernicus.yml, backtest-results.json
  - Critère succès : MQ build unchanged, 97% global hit-rate préservée