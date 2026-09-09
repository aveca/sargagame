# SPRINT 2 « GAME ICON PASS » — REPORT (R1 + R2 + R6 → SVG)

**Date** : 2026-09-09 · **Branche** : `agent/ui-ux/sprint2-game-icon-pass` (base : Sprint 1 `154310717`+`da8a1679`)
**Base** : PR #664 (Sprint 1, OPEN) — cette branche s'empile dessus (PR à baser sur `agent/coding/phaseB-sprint1`).
**Périmètre strict** : R1 (flags nav) + R2 (jeu) + R6 (paywall/community). Zéro touche business/paiement/données/scaffold territorial.

---

## 1. VERDICT : `SPRINT 2 = DONE` (gates verts, 2 échecs pré-existants documentés BUG-2026-035)

| Gate | Résultat | Preuve |
|------|----------|--------|
| Build prod | **exit 0**, 375 modules, 0 erreur esbuild | `npm run build` ×3 (MQ full pipeline) |
| Bundle eager gzip | **37.8 Ko ≤ 210 Ko** (+0.1 Ko vs Sprint 1) | `check-bundle-budget.cjs` ✓ |
| Smoke funnel | **4/4 tokens** | `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]` |
| E2E pertinent | **39 passed, 3 skipped, 2 failed pré-existants** | funnel 13/13 + money 6/6 + identity 3/3 + week-hub 13/13 + ma-plage 6/8 + b2b 3/3 |
| Zero-emoji R1/R2/R6 | **0 codepoint emoji-presentation rendu** | scan source (VS16/1F300-1FAFF/indicators/2B50/2764) + captures |
| Captures | MQ 3 viewports × 5 surfaces + asserts | `.ai/ui-audit/shots-sprint2/mq/` |

## 2. CE QUI A ÉTÉ FAIT

- **Nouveau** `src/components/ComicIcons.jsx` (~50 pictos SVG mono-trait ink 24×24 + `RegionCode`) — seule source, dépendance-free (safe pour chunks lazy + eager).
- **R1** : `RegionNav.jsx` + `CrossRegionNav.jsx` — flags emoji → pastilles code (MQ/GP/RM/TL/PC/FL/HT/LC/BB) ; champs `flag:` gardés en donnée morte (revert instantané). Barre 390px : 186px (vs 192 avant, vs 244 première passe — voir §5).
- **R2** : `ChasseHome.jsx` (~45 sites : typeEmoji/powers→noms d'icônes, badges CHASSE_BADGES→noms, streak/deck/ladder/alerts/facts/boutons défi ▲▼ texte), `ArchipelView.jsx` + `Sargasses_PROD.jsx` SAT_SAY (emoji retirés des bulles SVG-texte), `ArenaOnboarding.jsx` (vague/paquet/cadenas/papillon), share-cards canvas **100 % vectorielles** (`_scFlame/_scStar/_scCheck/_scCross/_scHalf/_scTarget/_scWave` + chips trio), écrans bonus 🎁/🎉.
- **R6** : checklist paywall ✅→check, FiabiliteProof ✅, badges Premium (PassOffer 🔒💳⚡→lock/card/zap, fiabilité, captures email ✅×5, toast), FbPostsStrip `statusEmoji`→glyphs + 📷/💬→camera/chat, LeadCapture, B2BModal (TIERS mail/bell/bank + 🛰️/🔒), WorldMapView notice email ✅, OnsiteCheckout 🔒, ErrorModal/ErrorInline/ToastError ⚠️→cross, AccountSheet/PaidOnboarding/WelcomePoste ⭐→star, GeoSoftAsk 📍→pin, prompt alertes 🔔→bell, météo forecast (💨🌧️🌤️☀️)→sun/cloud/rain/wind, story heading ⚠️/☀️ retirés.

## 3. FRONTIÈRES DOCUMENTÉES (pas des oublis)

- **Glyphes texte conservés** (rendus fonte, pas OS-emoji) : ★☆✕×·→←▲▼✓✗⚠ (sans VS16), `›`, `→`.
- **Messages de partage** (navigator.share/clipboard : ChasseHome, buildShareCard) : texte brut à destination du share-sheet OS — volontairement inchangés.
- **Donnée morte** : champs `flag:`, `ST.*.e`, `filtersIcon` (R5), SAT_SAY nettoyées.
- **Hors scope → Sprint 3 « map chrome »** : chips preuve WorldMapView (👥🛰), hero pick 🏆, teaser B2B 🏨, PoiLayer 📍🏨🅿️, pastille premium ★, jour-cases 🔒, 🚩 dérive, SargaChat chips, StoryScenes 👆, B2BWidget.

## 4. PREUVES VISUELLES

- `.ai/ui-audit/shots-sprint2/mq/{390x844,768x1024,1440x900}-{home,gamecard,sheet,sheet-bottom,paywall}.png` + `asserts.json`
- Sheet MQ : seuls ✕ texte restants ; nav : 9 pastilles code ; fiche jeu : légende trio SVG + 1 CTA or ; paywall modal : 0 emoji-presentation (restes = chips map + ✓ texte).

## 5. INCIDENT EN COURS DE SPRINT (détecté par E2E, réparé, preuve à l'appui)

- **Symptôme** : `funnel-payment` carte→fiche rouge (tapIdx=-1) après 1re passe R1.
- **Cause prouvée** : pastilles 1re version trop larges → barre 192→244px (+1 rangée wrap) → label visible sous le panneau héros. Mesure diag (`tmp-diag-labels.cjs`, supprimé après usage).
- **Fix** : chips resserrés (padding 2px 4px, LS .02em) + liens 12→9px + gap 8→6 → barre **186px** (< 192 d'origine). Re-run : test vert (×2).
- **Leçon** : toute variation de hauteur du fixed-top casse le hit-test carte à 390px — non-régression E2E obligatoire sur ce fichier.

## 6. ÉCHECS RESTANTS (pré-existants, prouvés, hors scope)

- `ma-plage` 2/8 : `.lc-detail-x` recouvert par `button.sg-lang` (header) — **reproduit à l'identique sur worktree pristine `da8a16796`** (build + test isolés) → **BUG-2026-035** (P2, dialogue fermable par swipe/backdrop/Échap). Fix = chantier z-index header/dialogue dédié (Sprint 3 candidat).
- **Alerte process (grave)** : `rmdir /S /Q` d'un worktree contenant une JONCTION `node_modules` a traversé la jonction et supprimé `node_modules/.bin` du repo principal. Réparé par `npm install` (manifests intacts, `package.json`/`package-lock.json` inchangés, build+smoke+E2E re-validés). **Règle : ne JAMAIS rmdir un dossier contenant une jonction — supprimer la jonction d'abord, et ne JAMAIS créer de jonction vers node_modules.**

## 7. ROLLBACK

`git revert 42f5fb38f` (1 commit, 19 fichiers, visuel seul). Aucun flag runtime (échange 1:1 d'icônes, copies/textes/layouts métier inchangés). Données mortes `flag:`/`e:` permettent aussi un revert ciblé par fichier.

## 8. FICHIERS MODIFIÉS (19)

`src/components/ComicIcons.jsx` (nouveau) · `RegionNav.jsx` · `CrossRegionNav.jsx` · `ChasseHome.jsx` · `ArchipelView.jsx` · `ArenaOnboarding.jsx` · `VeilleurRepond.jsx` · `Sargasses_PROD.jsx` · `WorldMapView.jsx` · `LeadCapture.jsx` · `PassOffer.jsx` · `PaidOnboarding.jsx` · `WelcomePoste.jsx` · `AccountSheet.jsx` · `PremiumModal/{B2BModal,ErrorModal,FiabiliteProof,OnsiteCheckout}.jsx` · `.ai/{tasks,bugs,changelog,current_state}.md` · ce rapport · `shots-sprint2/mq/`.

**Non touchés** : `regions/` (dont `gp.json`), paiements (`mollie*.php`, `doSubscribe.jsx`, `PayGatewayHandler`), data pipeline, prix/plans, mapping territorial, tests existants.

---

## 9. RELEASE GATE — 2026-09-09 (PR #665 → `agent/coding/phaseB-sprint1`)

- **Rebase de portée** : la branche contenait le commit local-only `da8a16796` (HARD ASSET, jamais poussé) → PR incluait du hors-scope. Rebase `--onto origin/agent/coding/phaseB-sprint1` (conflits : 0). Diff final : 41 fichiers, 100 % Sprint 2 + fix blocker.
- **Release blocker trouvé et fixé (§6, seul élargissement autorisé)** : la base distante ne contient pas `src/lib/mediaKit.js` alors que `BeachDayReport.jsx` l'importe → **la base SEULE ne build pas** (erreur rollup `Could not resolve`, prouvée). `11a0e0f79` restaure `src/lib/mediaKit.js` + `scripts/tests/media-kit.test.cjs` depuis `da8a16796` (`docs/ASSET-MATRIX.md` exclu, hors scope). Conséquence : **PR #664 est rouge sans ce fix** — ordre de merge à gérer (voir PR #665).
- **Gates re-validés APRÈS rebase+fix** : build exit 0 (375 modules, 0 esbuild), bundle 37.8 Ko, smoke 4/4, media-kit 41/41, E2E 39+3skip+2 pré-existants (BUG-2026-035).
- **CI PR #665** : `scan/pass` sur le nouveau head, `MERGEABLE/CLEAN`, 0 review bloquante, 0 thread.
- **`regions/gp.json`** : dirt pré-existant intact, hors PR, documenté.
- **Statut** : `SPRINT 2 = DONE / RELEASE CANDIDATE` — prêt à merger (séquencement avec #664 à trancher par le release manager).
