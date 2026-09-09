# Changelog — S0 6-Région Quality Gate Audit

## 2026-09-09 — RELEASE GATE SPRINT 2 (PR #665 → RELEASE CANDIDATE)

- Rebase de portée : commit local-only `da8a16796` exclu du diff (PR = 41 fichiers, 100 % Sprint 2 + fix blocker, 0 conflit).
- Release blocker : base distante sans `src/lib/mediaKit.js` (importé par BeachDayReport) → base seule = build rouge (prouvé). Fix `11a0e0f79` : lib + contrat media-kit restaurés (docs exclues). Corollaire : PR #664 est rouge sans ce fix — ordre de merge à trancher.
- Gates re-validés après rebase : build 375 modules, bundle 37.8 Ko, smoke 4/4, media-kit 41/41, E2E 39+3skip+2 pré-existants (BUG-2026-035 OPEN/P2).
- CI #665 : scan/pass, MERGEABLE/CLEAN, 0 review bloquante. `regions/gp.json` : dirt pré-existant intact, hors scope.
- Statut : SPRINT 2 = DONE / RELEASE CANDIDATE. Prochaine action : MERGE PR #665 (après décision de séquencement avec #664).

## 2026-09-09 — SPRINT 2 « GAME ICON PASS » : R1+R2+R6 → SVG (DONE, gates verts)

- Nouveau `src/components/ComicIcons.jsx` (~50 pictos mono-trait ink + `RegionCode`), dépendance-free.
- R1 : RegionNav + CrossRegionNav flags → pastilles code (barre 390px : 186px, < 192 avant).
- R2 : ChasseHome (~45 sites), SAT_SAY ×2, ArenaOnboarding, share-cards canvas 100 % vectorielles, écrans bonus.
- R6 : paywall/checklist/FiabiliteProof/PassOffer/FbPostsStrip/LeadCapture/B2BModal/WorldMapView-notice/OnsiteCheckout/ErrorModal/AccountSheet/PaidOnboarding/WelcomePoste/GeoSoftAsk/prompt-alertes/météo-forecast → glyphs.
- Gates : build exit 0 (375 modules), bundle 37.8 Ko, smoke 4/4, E2E 39+3skip (2 fails = BUG-2026-035 pré-existant prouvé sur pristine). Captures `shots-sprint2/mq/`.
- Incident réparé : barre nav 244px cassait le hit-test carte → resserrée à 186px (mesure diag).
- Frontières : glyphes texte conservés, share-messages inchangés, map-chrome → Sprint 3. Rapport : `.ai/ui-audit/SPRINT2-GAME-ICON-PASS-REPORT.md`. Branche `agent/ui-ux/sprint2-game-icon-pass`.

## 2026-09-09 — PHASE B SPRINT 1 : CLÔTURE FINALE GREEN (0 code produit)

- mq : `npm run build` exit 0 (374 modules) + smoke 4/4 + E2E 13/13, bundle 37.7 Ko, captures 15 PNG vérifiées.
- gp : assert régions OK + captures 15 PNG vérifiées (blurs/fonts 0, goldPrimary 1).
- florida : assert régions OK + captures 15 PNG vérifiées (Daily report PDF 358×49, chrome EN).
- rivieramaya : assert régions OK + captures 15 PNG vérifiées (chrome ES, 1 CTA or).
- puntacana : `vite build` exit 0 (374 modules, 12 plages, 66 URLs SEO) + 15 PNG **nouvelles** (Bavaro Beach EN, ≈$0.33/day) — R4 clos.
- tulum : `vite build` exit 0 (374 modules, 8 plages, 16 URLs) + 15 PNG **nouvelles** (Playa Paraíso ES, ≈$0.33/day) — R4 clos.
- Transverse : RM_INFINITE=[] (smoke ×2 + E2E ×2), 0 contamination territoriale, MQ non-régression (backtest 97%/3339 paires), P0 6/6 + P1 14/14 clos, 0 ticket créé (R6 paywall ✅ documenté P2). Rapport : `.ai/ui-audit/PHASE-B-SPRINT1-REPORT.md` §11-12. Branche `agent/coding/phaseB-sprint1`.

## 2026-09-09 — PHASE B SPRINT 1 : P0+P1 remediation GREEN

- P0-01→P0-06 corrigés : blur gated→Premium SVG (3 zones), emojis statut→`ComicStatusGlyph` (15 sites),
  Comic Neue=0, AntonLC=0, reduced-motion blanket `.theme-comic`, gold #FFC72C unique.
- P1 : 1 CTA or/écran (`goldPrimary:1` mesuré), or consolidé `#FFC72C` + ambre R3 `#B87A00`,
  légende forecast SVG, reports ≥44px (104×99→158×135), RegionNav/Bell/Home/IdentityStep/map-labels
  vérifiés sur 6 régions × 3 viewports.
- Découverte : funnel réel = map → carte jeu → « Fiche complète » → `BeachSheetComic`
  (`src/BeachSheet.jsx` corrigé).
- Incident réparé : bloc ReportButton §PDF (session concurrente) invalide → reconstruit + lazy
  conforme `media-kit.test.cjs` (`?report=0`).
- Gates : build ×6 régions exit 0, bundle 37.6 Ko, smoke 6/6 (FUNNEL_REACHED=map+fiche+paywall,
  ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[]), unit 113/116→OK, E2E 25/25 passed
  (toutes régions), captures `.ai/ui-audit/shots-phaseB/{mq,gp,florida,puntaCANA,rivieramaya,tulum}/`.
- Rapport final: `.ai/ui-audit/PHASE-B-SPRINT1-REPORT.md`.
- Résiduels P2 (Sprint 2) : game icon pass, flags RegionNav, code mort.

## 2026-09-08 — UI/UX RESCUE Phase A : audit + plan (AUDIT ONLY, zéro code produit)

- 35 screenshots (390/768/1440, build prod v219 MQ servi en local) + `manifest.json` + `audit2.json`
  dans `.ai/ui-audit/shots/` via `scripts/ui-rescue-capture.cjs` + `ui-rescue-capture2.cjs` (rejouables, Phase C).
- 7 livrables : `.ai/ui-audit/{screen-inventory,screenshot-matrix,ui-findings,beach-sheet-audit,asset-map,skill-map,remediation-plan}.md`.
- Top findings : **P0 LST-01** onglet Plages = vide noir (lignes en DOM, clippées par ancêtre absolute h=19 — `#root` effondré, preuve probe) ;
  **P0-si-confirmé PAY-02** texte pâle sur carte blanche onsite ; **P1** hero overlap (MAP-01), CTA 2 prix (PAY-01),
  Plus tard sous fold (PAY-03), RegionNav par-dessus sheet (SHEET-01), ✕ 32px coupé (SHEET-02), cookie 40px + recouvre day-strip (COO-01).
- Build 37.6 Ko ≤ 210 ✓ (non modifié). Branche `agent/ui-ux/rescue-audit` (docs + 2 scripts capture uniquement).

## 2026-09-07 — S0 Audit Completed (QA/UX)

### Régions auditées
- **mq** (Martinique) — validé, EUR, 83 plages GP reference préservée
- **gp** (Guadeloupe) — validé, EUR, 83 plages inline
- **florida** (Miami) — validé, USD, 20 plages, island IDs corrects
- **puntacana** — validé, USD, 12 plages, island IDs corrects
- **rivieramaya** — validé, USD, 20 plages, island IDs corrects
- **tulum** — validé, USD, 8 plages inline, island IDs corrects

### Résultats clés
- **FUNNEL_REACHED** = map+fiche+paywall (toutes surfaces atteintes)
- **WHITE_OR_TRANSPARENT_BUTTONS** = [] (aucun bouton fantôme)
- **ERRORS** = [] (aucune erreur console critique)
- **RM_INFINITE** = [] (token présent, conformité a11y)
- **Bundle** = 37.6 Ko gzip ≤ 210 Ko (toutes régions)
- **0 contamination territoriale** (tous beach island IDs validés)
- **MQ non-régression** = 97% global hit-rate préservée

### Tickets créés
- TASK-SEO-HREFLANG : audit hreflang/canonical 6 régions (P2)
- TASK-PAYLINKS : ajouter paymentLinks rivieramaya + tulum (P2)
- TASK-RM-INFINITE : vérifier reduced-motion en live (P2)

### Statut final
GREEN — toutes conditions gate validées, prêt déploiement main