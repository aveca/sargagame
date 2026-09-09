## SPRINT 2 « GAME ICON PASS » — [x] done → RELEASE CANDIDATE (2026-09-09, PR #665)
- Scope purifié par rebase (hors-scope `da8a16796` exclu, 0 conflit) ; fix blocker `mediaKit.js` + contrat (base seule = build rouge, prouvé)
- CI #665 : scan/pass, MERGEABLE/CLEAN, 0 review bloquante. `gp.json` intact/hors scope. BUG-2026-035 OPEN/P2.
- NEXT : MERGE PR #665 (séquencement avec #664 à trancher — #664 rouge sans le lib)
- **TASK-SPRINT2-GLYPHS**: R1 (flags→code-chips, barre 186px) + R2 (jeu→ComicIcons, canvas vectoriel) + R6 (paywall/community→glyphs) — DONE
  - Gates : build exit 0 (375 modules, 0 erreur esbuild), bundle 37.8 Ko ≤ 210, smoke 4/4, E2E 39 passed + 3 skipped + 2 failed pré-existants (BUG-2026-035, prouvé sur worktree pristine `da8a16796`)
  - Preuves : `.ai/ui-audit/SPRINT2-GAME-ICON-PASS-REPORT.md` + `.ai/ui-audit/shots-sprint2/mq/` (3 viewports × 5 surfaces + asserts)
  - Frontières : glyphes texte conservés, share-messages inchangés, map-chrome → Sprint 3 candidat
  - Suivi : PR empilée sur `agent/coding/phaseB-sprint1` (base PR #664) ; BUG-2026-035 → fix z-index dédié ; règle process : ne jamais rmdir un dossier contenant une jonction

## PHASE B SPRINT 1 — [x] done (2026-09-09, GREEN) — CLÔTURE FINALE
- **TASK-PHASEB-SPRINT1**: Remédiation globale P0 (01→06) + P1 conversion/navigation
  - Preuves : `.ai/ui-audit/PHASE-B-SPRINT1-REPORT.md` (§11-12 clôture) + `.ai/ui-audit/shots-phaseB/{mq,gp,florida,rivieramaya,puntacana,tulum}/` (6/6 × 3 viewports, 90 PNG + 6 asserts.json)
  - Clôture 2026-09-09 : build MQ exit 0 + builds PC/Tulum exit 0 (37.7 Ko), smoke 4/4 ×2, E2E funnel 13/13, RM_INFINITE=[], 0 contamination, MQ non-régression, P0 6/6 + P1 14/14, 0 ticket créé (R6 documenté P2)
  - Suivi Sprint 2 (P2) : « game icon pass » — R1 flags RegionNav→SVG + R2 emojis jeu→set SVG + R6 paywall ✅/FbPostsStrip→glyphs ; R3 fil de l'eau ; R5 code mort Sprint 3
  - Hors scope noté : ajout non commité 83 `beaches` dans `regions/gp.json` (pré-existant, non touché, tâche dédiée requise)

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