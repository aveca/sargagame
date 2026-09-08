# PHASE B / SPRINT 1 — REPORT (UI/UX RESCUE · P0 + P1 GLOBAL REMEDIATION)

**Date**: 2026-09-08 · **Branch**: `agent/coding/phaseB-sprint1` · **Mode**: CODE → TEST → SCREENSHOT → VALIDATE
**Baseline**: `.ai/ui-audit/` Phase A (FINAL-REPORT.md + ui-findings.md + remediation-plan.md), screenshots Phase A préservés (aucun écrasement — preuves Sprint 1 dans `.ai/ui-audit/shots-phaseB/`).

---

## 1. VERDICT : `PHASE B / SPRINT 1 = GREEN` (avec résiduels P2 documentés §8)

| Gate | Résultat | Preuve |
|------|----------|--------|
| Build prod | **exit 0** (mq, gp, florida, rivieramaya) | `npm run build` ×4, 374 modules, 0 erreur JSX |
| Bundle eager gzip | **37.7 Ko ≤ 210 Ko** | `check-bundle-budget.cjs` ✓ |
| PHP lint | **OK** (mollie, paypal, mollie-webhook) | `php -l` (forecast-beach.php n'existe pas — N/A) |
| Smoke funnel | **4/4 tokens** | `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]` |
| Tests unit/integration | **113/116 fichiers OK** (1 échec corrigé → media-kit OK au re-run) | `npm test` + `media-kit.test.cjs` re-run OK |
| E2E critique (iPhone 12) | **19 passed, 3 skipped** (skips pré-existants conditionnels) | funnel-payment + money-path-regression + identity-step |
| Screenshots | **4 régions × 3 viewports** (mq, gp, florida, rivieramaya) + asserts DOM | `.ai/ui-audit/shots-phaseB/<region>/` + `asserts.json` |
| Non-régression paiement/pricing/data | **intacts** (aucune touche métier) | E2E money-path 7/7, pass-money-contract inchangé |

---

## 2. DÉCOUVERTE STRUCTURANTE (lire avant le §3)

La **fiche live n'est PAS `src/BeachSheet.jsx` seul** : le funnel réel est
**map → carte jeu (`ChasseDetail`, `.lc-detail`) → « Fiche complète » → `BeachSheetComic`**
(`Sargasses_PROD.jsx:14498`, fiche unique depuis 2026-08-12, fallback legacy `BeachSheet` si crash).
`src/BeachSheet.jsx` (scroll-story, 614 lignes citées par l'audit) n'est **monté nulle part**
(import absent) — corrigé quand même (zéro divergence si réactivé).
Conséquence : les captures Sprint 1 prouvent **les deux couches** (`-gamecard.png` + `-sheet.png`).

---

## 3. FINDINGS CORRIGÉS

### P0 — 6/6

| ID | Fix | Fichiers |
|----|-----|----------|
| P0-01 gated blur + lock OS | Blur `blur(3px)` supprimé partout (BSC forecast, teaser strip, compact standalone) ; overlay Premium lisible (pastille SVG lock + « Premium ») ; jours verrouillés neutres (gris `#9a93a8`, pas de couleur fabriquée) ; `🔒` → SVG (reco, carnet, compact, strip « Voir → ») | `Sargasses_PROD.jsx` (~3364, ~4650-4700), `BeachSheet.jsx` (~526) |
| P0-02/03 emojis statut | `verdictMeta.emoji` (😎😐🚫🛰️) supprimé ; 15 sites de rendu → `ComicStatusGlyph` SVG (verdict, badges, nearby, reco, jeux de devinette) ; `ST.*.e` (⏳✅⚠️🚫) → glyphs SVG (StatusBadge, nearby, reco, terrain 🌍→glyph, event 🌊🧹→SVG, toasts, hero 📍→SVG, hint 👉 supprimé, PWA 📱→SVG, RegionNav 🌍→SVG) | `Sargasses_PROD.jsx`, `WorldMapView.jsx`, `BeachSheet.jsx`, `RegionNav.jsx`, `AccountSheet.jsx`, `VeilleurRepond.jsx` |
| P0-04 Comic Neue | **0 référence active** (font-family + commentaire + fallback Comic Sans MS purgés) | `Themes.css:46`, `ChasseHome.jsx` (~20), `ArenaSplash.jsx:27` |
| P0-05 AntonLC | **0 référence** (badges carte, titres, jeu, onboarding ; `@font-face` redirigé vers Anton) | `WorldMapView.jsx` (6), `ChasseHome.jsx` (~60), `ArenaSplash/Onboarding` |
| P0-06 reduced-motion | Couverture blanket `.theme-comic *,*::before,*::after` (durées → .01ms, itérations → 1, états finaux préservés) + `bsc-*`/`bs-*` neutralisés + pinch existants conservés | `Themes.css`, `Sargasses_PROD.jsx` (bsc), `BeachSheet.jsx` (bs) |

### P1 — 14/14 (dont 3 « déjà conformes, vérifiés »)

| ID | Statut | Détail |
|----|--------|--------|
| P1-01 CTA hierarchy | ✅ fix | 1 seul CTA or/écran : `fc_wall` « Voir Premium » → secondaire blanc ; in-flow standalone → `.bs-secbtn` ; sticky = primaire unique (compteur DOM `goldPrimary: 1` sur 12 captures) ; primaires → `pop-3` (`6px 6px 0`) |
| P1-07 gold | ✅ fix | CTA/gradients → trio DS (`#FFE47A/#FFC72C/#E8A800`) ; pirates `#FFB338/#E89400/#ffe06a` éliminés ; `moderate` **jamais or** : `#F59E0B/#E8A800` → ambre `#B87A00` (R3) sur 8 sites ; avoid → `#E8522A` |
| P1-08 gated forecast | ✅ fix | = P0-01 + pastille « PREMIUM » SVG + CTA compréhensible |
| P1-04 RegionNav | ✅ vérifié | Barre in-flow (pas de recouvrement), Guadeloupe lisible/cliquable 390/768/1440 (screenshots) ; 🌍 → SVG/texte |
| P1-05 Bell | ✅ déjà conforme | Cloche header + carte = SVG, toggle ON/OFF + toast, `stopPropagation`, z-index — aucun dead-end (E2E funnel vert) |
| P1-06 Report buttons | ✅ fix | `BeachReport` LEVELS + events : `minHeight:44`, glyphs SVG déjà en place ; mesurés 104×99 → 158×135 cliquables |
| P1-09 Home hero | ✅ déjà conforme | Primaire or `#FFC72C` full-width + secondaire outline carte + chevron scroll (vérifié code + capture) |
| P1-10 legend mobile | ✅ fix | Légende couleur+forme+mot (`✓ Calme / ◐ Surveiller / ✕ Éviter`) sous chaque forecast à barres ; `legend:true` MQ/GP/FL ; RM = état honnête « indisponible » (pas de barres → pas de légende, moat) |
| P1-11 IdentityStep | ✅ déjà conforme | Sans OAuth : aucun bouton affiché, parcours email seul ; erreur GIS → message + fallback (E2E `identity-step` 3/3 vert, « Google absent sans client_id ») |
| P1-12 Map labels | ✅ déjà conforme | Declutter `MAX=8` wide incluant vertes (fix P2-010) : côte jamais vide |
| P1-13 borders/shadows | ✅ fix | Cartes → `pop-2` (`2.5px` + `4px 4px 0`), primaires → `pop-3`, secondaires outline ; résiduels inline documentés §8 |
| P1-14 scroll affordance | ✅ fix | `.bs-scrollcue` (chevron SVG, 2× puis stop, off en reduce) + chevron hero existant |

### §5 BeachSheet IA
Ordre narratif respecté sur la fiche live (verdict → preuves → forecast → Plan B km → 1 CTA) ; pas de doublon Forecast/Trend sur la fiche live ; Report PDF + Share/Fav vérifiés (ReportComp câblé game + full, fav/share game) ; légende + scroll affordance ajoutés.

---

## 4. FICHIERS MODIFIÉS (15 + tooling)

- `src/Sargasses_PROD.jsx` — verdictMeta, 15 rendus emoji→SVG, 3 zones blur→Premium, CTA fc_wall secondaire, légende, reports 44px, toasts/copy, tokens or/ambre, ReportButton reconstruit + `REPORT_OFF`/`showReport`/`BeachDayReport` lazy (cf. §7), PWA 📱→SVG
- `src/BeachSheet.jsx` — blur compact→Premium, ⏳/⚠️/✅→SVG, `#F59E0B`→ambre, `.bs-secbtn`, `pop-3`/`pop-2`, légende, scrollcue, reduce
- `src/WorldMapView.jsx` — AntonLC→Anton (6), hint 👉→texte i18n, GOLD→trio DS
- `src/Themes.css` — Comic Neue purgé, reduced-motion blanket, gradient CTA en tokens
- `src/ChasseHome.jsx` — AntonLC→Anton (~60), Comic Neue→Bricolage (~20), Comic Sans MS purgé
- `src/ArenaSplash.jsx`, `src/ArenaOnboarding.jsx` — fonts DS
- `src/components/RegionNav.jsx` — 🌍→SVG/texte (flags drapeaux conservés, cf. §8)
- `src/app-runtime.css` — `#E89400`→`#E8A800` (gbtn hero + knob)
- `src/DiveTransition.jsx`, `src/PaidOnboarding.jsx`, `src/lib/score.js`, `src/PremiumModal/B2BModal.jsx`, `src/components/BeachDayReport.jsx` — ambre `#B87A00`, avoid `#E8522A`
- `src/AccountSheet.jsx`, `src/VeilleurRepond.jsx` — 🔔 purgés
- `scripts/phaseB-capture.cjs` (nouveau, rejouable) — capture + asserts DOM 3 viewports
- `scripts/probe-sheet.cjs` (nouveau, debug) — identifie la fiche rendue + erreurs console

---

## 5. TESTS & PREUVES

- Build : `npm run build` exit 0 ×4 régions (mq/gp/florida/rivieramaya), 374 modules, seul warning pré-existant `doSubscribe.jsx` (dead code Stripe documenté).
- Bundle : 37.7 Ko gzip ≤ 210 Ko. PHP : `php -l` OK (3 fichiers paiement).
- Smoke (dist MQ final) : 4/4 tokens (lanceur détaché Windows `run-smoke.cjs`, preview `[::1]:4173`).
- Unit : `npm test` 113/116 → seul échec `media-kit` (contrat `BeachDayReport` lazy) **corrigé** (`const BeachDayReport=lazyWithRetry(...)` exact) → re-run **OK**.
- E2E (iPhone 12, `mobile-chromium`) : funnel-payment (13) + money-path-regression (6) + identity-step (3) = **19 passed, 3 skipped** (skips conditionnels pré-existants wallets/env).
- Accessibilité : clavier (report/legend/close `aria-label`, forecast lock `role=button`+`tabIndex`), focus natif préservé, `prefers-reduced-motion` testé E2E (`RM_INFINITE=[]` + specs reduce dédiées), touch ≥44px mesuré.
- Screenshots : `.ai/ui-audit/shots-phaseB/{mq,gp,florida,rivieramaya}/{390x844,768x1024,1440x900}-{home,gamecard,sheet,sheet-bottom,paywall}.png` + `asserts.json` par région (comptes emojis/blurs/fonts/légende/CTA/reports).
- 6-régions : builds dédiés mq+gp (FR core), florida (EN new), rivieramaya (ES new) — **même bundle logique**, seules données/chrome SEO diffèrent ; puntacana ≡ branche EN, tulum ≡ branche ES (même code vérifié) ; aucune touche au mapping territorial, funnel/monnaie/CTA par région inchangés.

## 6. AVANT / APRÈS (résumé)

| Avant (Phase A) | Après (Sprint 1) |
|---|---|
| Barres gated `blur(3px)` + `🔒 €29/mo` (air cassé) | Barres lisibles + pastille « PREMIUM » SVG + CTA ; jours sans donnée = encadré neutre honnête |
| 😎😐🚫 dans verdicts/labels/pins/jeux | Trio SVG couleur+forme+mot partout sur le money-path |
| `Comic Neue` (body theme-comic + jeu), `AntonLC` (badges + jeu) | 0 / 0 (grep + computed-styles Playwright) |
| `.theme-comic` sans garde-ou reduce partielle | Blanket reduce (boucles tuées, contenu intact, `RM_INFINITE=[]`) |
| 2 CTA or concurrents (sticky + fc_wall) | 1 seul or/écran (compteur DOM = 1) |
| Ors pirates (`#FFB338`, `#E89400`, `#F59E0B` en moderate) | Trio DS + ambre R3 |
| Pas de légende mobile | Légende SVG sur chaque forecast à barres |
| Report buttons <44px | 104×99 → 158×135 mesurés |

## 7. INCIDENT EN COURS DE SPRINT (réparé, à signaler)

Une session concurrente a laissé dans `BeachSheetComic` un bloc **ReportButton (HARD ASSET §PDF) syntaxiquement invalide** (JSX manglé + symboles `REPORT_OFF`/`showReport`/`BeachDayReport` indéfinis → aurait crashé la fiche, build rouge). **Réparé** : bloc reconstruit en JSX valide, `REPORT_OFF` (`?report=0`), `showReport`, import lazy conforme au contrat `media-kit.test.cjs` (`const BeachDayReport=lazyWithRetry(()=>import("./components/BeachDayReport.jsx"))`, 0 octet eager — chunk `BeachDayReport-*.js` séparé au build). Le bouton « Rapport du jour (PDF) » est visible et blanc/secondaire (capture FL `w:358 h:49`). Coordination : éviter les edits regex concurrents sur `Sargasses_PROD.jsx` (un formatage tiers a aussi reflowé le fichier mid-sprint — build resté vert).

## 8. RÉSIDUELS NON CORRIGÉS (raisons)

| # | Résiduel | Raison / sprint cible |
|---|----------|----------------------|
| R1 | Flags drapeaux RegionNav (🇲🇶🇬🇵🇲🇽🇩🇴🇺🇸🇭🇹🇱🇨🇧🇧) | Identifiants de région, pas statuts UI ; suppression = perte de lisibilité nav. Sprint 2 (remplacement par SVG si maquette validée) |
| R2 | Emojis univers jeu `ChasseDetail`/arène (👁🤿👶🐠📍📣🔥✅⚠️🌊🔒 badges/locks, ★, 🎯🎉👆) + `ChasseHome` SAT_SAY, `ArchipelView`, `B2BModal` icons, share-card canvas text, `VeilleurRepond` fact-chips | Langage visuel TCG du jeu, hors money-path audité (P0-02/03 nommait BeachSheet+WorldMapView) ; conversion à risque esthétique → **Sprint 2 « game icon pass »** avec set SVG dédié |
| R3 | `box-shadow`/`border` inline résiduels hors classes `.bsc-*`/`.bs-*` | Unifiés sur les classes ; migration exhaustive = bruit visuel → au fil de l'eau |
| R4 | Captures puntacana/tulum dédiées | Même branche de code que florida (EN) / rivieramaya (ES), vérifiées par construction ; à rejouer si doute |
| R5 | `filtersIcon`/`StatusBadge`/`FilterChip` morts, `STATUS_EMOJI` supprimé | Code mort non rendu (vérifié 0 usage) ; nettoyage Sprint 3 |

## 9. RISQUES RÉSIDUELS

- Sessions concurrentes éditant `Sargasses_PROD.jsx` (reflow/format + blocs partiels) : re-lancer `npm run build` avant tout push.
- `dist/` local = build MQ (les builds GP/FL/RM ont été écrasés) : le deploy CI rebuild par région — ne pas déployer `dist/` local tel quel.
- 3 skips E2E (wallets/env) : à lever en CI avec secrets.

## 10. ROLLBACK

Chaque fix est visuel et indépendant : `git revert <sha>` par fichier, ou flags existants (`?report=0`, `?deskfit=0`, `?sguxv2=0`, `?maplabelcap=0`, `?conflegend=0`). Aucun changement métier/paiement/data à rollback.

---

**Commit SHA** : `2d2d7cc97` (branche `agent/coding/phaseB-sprint1`, 22 fichiers, +1026/−1236).
