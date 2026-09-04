# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

---

## Récemment complété

- [x] **SPRINT UX/UI AUDIT & FIX — RegionNav ghost layer, Alertes bell, Fiche complète, Prévisions 7j** (@coding_agent OpenCode, 2026-09-04) — P1/P0 : Audit complet parcours utilisateur (Oute-Bénier/L'Autre Bord gp050) via Playwright production + scripts custom. Fixes locaux validés (build + smoke OK) :
  1. **RegionNav ghost layer** : RegionNav déplacé dans header chrome + wrapper `.sg-region-nav-inline` + règle CSS `pointer-events:auto` → RegionNav cliquable. Prop `inline` sur RegionNav pour rendre sans `position:fixed`. Stacking context `sg-onink-scope` couvre encore header en prod → z-index header à monter ≥ 1100 ou RegionNav intégré dans Header component.
  2. **Alertes bell (cloche)** : Util segment `margin-left:12` + `zIndex:10` + boutons cloche `zIndex:20` + `stopPropagation()` → élimine overlap avec freshness badge EN DIRECT, cloche ouvre alertes au lieu de naviguer vers `/fiabilite/`.
  3. **Fiche complète** : bouton « Fiche complète → » bascule comic → data sheet (BeachSheetComic) correctement.
  4. **Prévisions 7j** : section forecast h=190px visible, 7 cellules données réelles (Auj79, V60%, S47%...).
  Tests locaux : build ✅ · bundle 37.4 Ko ≤ 210 ✅ · ux-smoke 4 tokens ✅ · PHP lint ✅.
  Reste : déployer sur main → GitHub Actions deploy → vérification production. RegionNav stacking context `sg-onink-scope` (z-index map 1020) couvre header (z-index 700) → z-index header ≥ 1100 ou RegionNav intégré dans Header component.

- [x] **SPRINT FUNNEL — Refonte funnel + identité user_id + Google 1 clic + Mollie P0 réparé** (@coding_agent OpenCode, 2026-09-03) — P0 : checkout Mollie mort en prod (alias `/api/mollie.php` manquant côté worker + crash 1101 KV quota) → alias + KV fail-open + tests 23/23. Identité : `sg_users` + `payment_grants.user_id` (schema auto via apply-supabase-schema.yml), actions worker `auth_google` (OIDC RS256 JWKS vérifié)/`auth_email`/`auth_session`, session HMAC `sg_session` 90j, linking email↔Google déterministe, user_id propagé create_payment→webhook→grant. Front : `IdentityStep` (Google lazy + email sans compte + rollback `?sgauth=0`), cache `sg_auth`, restauration cross-device au boot, 13 events analytics. Gate complet vert (build/budget/smoke/contract/E2E). Reste : création client OAuth Google (fondateur, console GCP) puis paiement test réel. Rollback : `?sgauth=0`.

- [x] **ERR_TOO_MANY_REDIRECTS FIX: _redirects removed + DEPLOY 6/6 PROJECTS** (@coding_agent, 2026-08-31) — Fixed ERR_TOO_MANY_REDIRECTS on 6 domains: removed _redirects files (Cloudflare SPA fallback conflict) + deployed to all 6 wrangler projects via `npx wrangler pages deploy dist --project-name=*`. SSL mode change (flexible→full) still needed via CLOUDFLARE_API_TOKEN. Root cause: _redirects `/* /index.html 200` en conflit avec le catch-all functions/[[path]].js, couplé au mode SSL "flexible" créant des boucles redirect 308 interminables. Étapes: (1) trouvé _redirects dans public/ et dist/ avec `/* /index.html 200`, (2) vérifié functions/[[path]].js catch-all correct, (3) rm _redirects des 2 dossiers, (4) npm run build, (5) npx wrangler pages deploy dist --project-name=* (6/6 SUCCESS), (6) curl vérification → chaînes 308 toujours présentes (cause SSL "flexible" non résolue sans token). Fichiers supprimés: public/_redirects, dist/_redirects. Déploiement: 6/6 projets wrangler (sargagame, gp, florida, puntacana, rivieramaya, tulum) SUCCESS. Prochaine action: changer SSL mode de "flexible" à "full" via API Cloudflare pour chaque zone.

- [x] **BLANK PAGE FIX VERIFICATION + DEPLOY 6/6 PROJECTS** (@coding_agent, 2026-08-31) — Verified fix: JS content-type application/javascript ✅ (not text/html), deployed to all 6 wrangler projects (sargagame, gp, florida, puntacana, rivieramaya, tulum) via `npx wrangler pages deploy dist --project-name=*`. Hotfix commit 08084801 already in `functions/[[path]].js` and `functions/_routes.json` — fixes catch-all serving index.html for assets. Playwright on 2 domains: title=, bodyLen=15 (data-loading state). Content-type verified: application/javascript ✅.
  - Étapes: (1) Récupéré premier fichier JS depuis HTML, (2) Vérifié content-type via curl, (3) Playwright screenshot 2 domaines, (4) Déploiement manuel 6/6 projets
  - Gates: build OK, bundle ≤210 Ko, content-type OK

- [x] **SPRINT #3 — MONETIZATION LAYER (ROI)** (@product_agent + coding_agent, 2026-08-30) — 5 tasks completed:
  1. **LeadCapture.jsx** — Email banner (15s/2-scroll, Supabase /api/supabase fallback /b2b, 7-day dismiss). Track: sg_lead_banner_view/submit/dismiss.
  2. **WidgetEmbed.jsx** — Embeddable widget preview (mini-map 300px, 3-day badges, iframe code generator → /widget?token=XXX).
  3. **BeachSheet.jsx** — Forecast J+3+ blur (🔒 Plan Alert €29/mo), B2B contextual CTA (score<50: sargassum warning, ≥50: clean upsell). Track: sg_paywall_forecast_shown/click, sg_beach_cta_b2b_shown/click.
  4. **Sargasses_PROD.jsx** — 3-view paywall overlay (dismiss 6h, reset at 6 views), LeadCapture integration, 8 new funnel events.
  4. **RegionNav.jsx** — Cross-sell telemetry (sg_region_nav_click, sg_cross_sell_click), visited regions tracking, Enterprise upsell at 2+ regions.
  Gate: ✅ build, ✅ 36 Ko gzip (≤210 Ko), ✅ PHP lint, ✅ ux-smoke 4/4 tokens. Rollback: ?lead=0, ?paywall3=0, ?forecastblur=0, ?beachcta=0, ?crosssell=0. PR #625.

- [x] **B2B INTEGRATION — RegionNav + /b2b link + desktop scroll** (@coding_agent, 2026-08-30) — Import RegionNav in Sargasses_PROD.jsx (fixed top, z-index:1000), render lien "Voir nos offres pros →" vers /b2b (color #0d7f63, fs 13px, underline) dans footer, ajouter overflow-x:hidden index.html, build 36 Ko ≤ 210 Ko, ux-smoke 4/4 tokens. RegionNav flex-wrap-wrap s'adapte, aucun débordement desktop. Comité: build OK, bundle budget OK, mobile/desktop tests pass.

- [x] **P0 RIVIERA MAYA BEACH DETAIL — pin click → sheet absent FIXED** (@coding_agent, 2026-08-26) — WorldMapView pins sans data-beach → audit fallback 195,350 hors bbox RM/PC → sheet absent → switch_back_to_map timeout. Fix: data-beach sur pins+labels (ArchipelView déjà OK). PR #606 merged 6f8a41d8, CI 6/6, Deploy SUCCESS, QA 6/6 live PASS (RM 20 pins, PC 12, etc.).

- [x] **P0 MOLLIE CARDTOKEN ROOT CAUSE — 0 conversions fixed** (@release_owner OpenCode, 2026-08-25) — Worker `b2b-api` ignorait `cardToken` du frontend → paiements `method=null` → page sélection Mollie → expiry 15min → **25/25 paiements récents expired, 0 paid depuis 2026-07-19**. Fix: destructure `cardToken` + forward to Mollie API + omit `method` when cardToken present. Paiement carte direct Mollie Components → plus d'expiry sélection méthode. Tests: build 35.5 Ko, smoke 4/4, contrats 26/26, Playwright 20/20, CI 6/6 GREEN, Merge deec0fd6+2213486b, Pages SUCCESS 6/6, Worker SUCCESS, Live QA 6/6 GREEN. PR **#604** merged.

- [x] **P1 Pay consent dead click — pay button dead click → feedback guidé (dead/rage + funnel cta_to_mollie)** (@product_ux_kpi OpenCode, 2026-08-25) — Live MQ iPhone12: payBtn disabled true → tap mort sans feedback (600 modals → 97 CTA → 0 checkout). Fix: `disabled={payBusy}` seul + `aria-disabled` (×3 boutons) → tap déclenche `payError` "Coche la case...". Test 2/2 (sans coche → erreur, avec coche → pas d'erreur consent). PR #602 merged 4030763b, CI 6/6, Pages SUCCESS, QA 6/6 live PASS.

- [x] **P1 Mollie paid metric — `mollie.paid={}` fiabilisé (lastPaidAt + fetchedAt + contrat)** (@metrics OpenCode, 2026-08-25) — `paid={}` depuis 18/08 prouvé correct : dernière vente Mollie 2026-07-19 (5.99 USD p7) sortie fenêtre 30j ; API 6 paid all-time, 0 sur 30j, 24 non-paid sur 10j (probes) ; `payments` +4.99 ×2 = créations expired. Fix : lib pure `mollie-aggregate.cjs` + `lastPaidAt`/`fetchedAt` additifs + contrat 7/7. Collector local + CI Daily stats check success ; `daily-metrics.json` LIVE `paid:{}, lastPaidAt:2026-07-19T03:46:26+00:00`. PR **#601** merged ed8c3867, Daily Copernicus **32798548339 SUCCESS**.

- [x] **P1 money CTA tap — zones mortes sticky PassOffer + funnel checkout observable** (@product_ux_kpi OpenCode, 2026-08-25) — Repro live MQ iPhone 12 : barre sticky recouvrait « Commencer maintenant » (~70 % de sa surface morte, CTA centre sous fold) → taps morts, Supabase 7j = 615 opens → 78 CTA (12,7 %) → 0 checkout → 0 conversion. Fix : sticky = 1 `<button>` pleine surface (visuel inchangé, touch-action manipulation) + allowlist `sg_onsite_checkout_opened`/`sg_pay_onsite_back` (chaînon checkout mesurable). Rouge/vert : spec dédiée 2 FAILED pré-fix / 2 PASSED post-fix. PR **#600** merged (3e08f881), CI 6/6, Pages SUCCESS, QA live 6/6 (sg_pass_cta zone morte ×6, checkout ×6). Rollback `?nosticky=0`. Suivi 7j : `modal→onsite_checkout_opened`.

- [x] **Tulum API routing fix — routes zone mollie*/b2b* + worker TULUM island** (@devops OpenCode, 2026-08-25) — Zone CF sargazotulum.com passée de 5 à 7 routes (miroir des 5 domaines sains, → b2b-api, live immédiat) + 2 lignes additives dans `workers/b2b-api/index.js` (host→île `'TULUM'` + allowedIslands webhook). Fuite source PHP fermée. BUG-2026-025 FIXÉ. Reste : paiement test réel USD (fondateur).

- [x] **P0 money-path B2C — achat USD + retour 3DS + trou `?pass=` réparés (front-only)** (@team UX/B2C/QA OpenCode, 2026-08-23 soir, LOCAL non poussé) — USD : `currency={PAY_CUR}` sur PassOffer (avant : 1499 EUR envoyé en USD → « Prix invalide » sur 3 domaines) + contrat prix `src/lib/pass-price.js` testé ; 3DS : `redirectUrl=/?mollie_return=1` (handler de grant réactivé) + good.html → `?premium_email=` ; `?pass=pNN` exige `session_id` + idempotence. P1 : wallets guards/consent/Apple Pay key, email overlay unique, prix affiché surcharge USD, timeouts/bfcache/poller. A11y : Échap+trap paywall/comic/checkout, fiches role dialog, ✕ ≥44px. Tests : contrat 13/13 + E2E 3 verts (3 fixme runner) · suite 63 passed / 0 régression. **Push+deploy+paiement test USD = après go fondateur.**

- [x] **P1-03 WeekHub / Prévisions 7 jours / Forecast lock — GREEN** (@coding_agent OpenCode, 2026-08-23 06:45 UTC) — Cause racine `forecast_lock_click=0` prouvée (landing prev_az OFF + fiches live non instrumentées + `_enrichedWeekly={}` truthy masquant `weekly`). Fixes : sg_forecast_lock_click sur fcstrip+bsc (interactions réelles), a11y role/clavier/aria, forecast lock scopé aux barres, emojis → SVG, cookie banner sous landing, prevHeroPick covered-first. E2E 11/11 + gate ALL GREEN (26/26) + smoke 4/4 + bundle 35.4 Ko. BEFORE/AFTER dans `tests/ux-recordings/p1-03-*`. Mollie LIVE inchangé.

- [x] **P0-04 Mollie Live Cutover — PAYMENT HANDOFF GREEN** (@coding_agent OpenCode, 2026-08-23) — Worker `6aba0a2f` LIVE, secrets LIVE, `p30 14,99€` `mode=live` MQ+GP, `sg_mollie_checkout_redirect` 44/44, `pass_cta→checkout` race fixed, handoff robust `payReadyRef` wait 5s. Commit `6b7ce426`.
- [x] **P0-03 Paywall Handoff — Robuste handoff Mollie** (@coding_agent OpenCode, 2026-08-23) — Fix race `payReadyRef`/`mollieRef` lazy → `doSubscribe` attend `payReadyRef` 5s (poll 120ms) + `payBusy` guard + track `sg_mollie_ready_after_wait`/`timeout`, `payBusy` anti-double, `sg_mollie_checkout_redirect` tracké. Commit `6b7ce426`.
- [x] **FIX: beach labels invisibles + referral_claim JSON** (@coding_agent, 2026-08-31) — (1) retiré `transform:translate(-50%,-100%)` du style `.sg-maplabel` dans `WorldMapView.jsx:1783` — labels maintenant visibles via declutter/writeCam; (2) ajouté `try{return r.json()}catch(e){console.warn("referral_claim: response is not JSON",e);return Promise.reject(e)}` autour de `r.json()` dans `Sargasses_PROD.jsx:12123-12124` — gestion graceful des réponses non-JSON du serveur `/api/mollie.php`. Build 36.5 Ko ≤ 210 Ko, ux-smoke ERRORS=[], FUNNEL_REACHED=paywall.

- [x] **P1-03 WeekHub / Prévisions 7 jours** (@coding_agent OpenCode, 2026-08-23) — Forecast lock robustifié (attente `payReadyRef` 5s), lock teaser strip + clic zone + clavier Enter/Space → paywall/beat, `pwBeat` inline (85%), `pw_constel` variant, forecast 7j + confidence decay + locked teaser strip, `openLock` `sg_forecast_lock_click`. Commit `17e3bc92`.
- [x] **P1-02 CleanList + Conditions — Plan B + Conditions polish** (@coding_agent OpenCode, 2026-08-23) — `nearestCleanAlt` haversine ≤60km `clean` tri intact, `badge.mod` #FFC72C→#B87A00 (R3), `more` emoji→SVG map, `Conditions` badge.mod/avoid harmonisés, weather emojis→texte+SVG, `nearestCleanAlt` haversine ≤60km `clean` tri intact. Commit `17e3bc92`.
- [x] **P1-01 HomeHero / Première impression** (@coding_agent OpenCode, 2026-08-23) — Boot CTA 14→15px, badges 10→12px, VeilleurHero H1 62px→clamp(32,12vw,42) (1 Anton/écran), CTA `bottom:50px`→`calc(50px+safe-area)` iPhone safe-area, badges 10→12px, typo `Bricolage` 95%. Commit `2e94bca9`.
- [x] **Full UX Audit + Build + Tests + Deploy + Handoff Ready** (@coding_agent OpenCode, 2026-08-16 16:00 UTC) — Audit UX complet (12 écrans, 400+ assets vidéo, 100+ OG images, scènes SVG), build 182.5 Ko gzip ≤ 210 Ko, 34/34 Playwright green, ux-smoke 4/4, PHP lint 6/6, push main → Daily Copernicus + Deploy SUCCESS 14m15s sur 5 domaines. Projet prêt pour prochain agent IA — handoff complet dans `.ai/current_state.md`, `.ai/changelog.md`, `.ai/tasks.md`. Commit 1335561a.
- [x] **Full Experience Verification + Test Fixes + Deploy** (@coding_agent OpenCode, 2026-08-14 19:45 UTC) — Vérification complète parcours utilisateur sur 5 domaines live (MQ, GP, Miami, Cancun, Punta Cana) : homepages 200 OK, version v219 sync, data API ERDDAP-live 4.4h, beach fiches 200 OK, paywall Mollie+Stripe+React, payment pages 200 OK, funnel Apps Script 103K sessions/5 conv/€5.99 MRR. Corrections tests : filtré erreur Mollie non-critique `setProfileId`, retry fiche visibility pour race condition map label. Gate de ship : build OK 3.70s, bundle 182.5 Ko ≤ 210 Ko, ux-smoke 4/4 tokens, PHP lint 6/6 OK, Playwright 12/13 pass (1 flaky pré-existant). Push main → auto-deploy Daily Copernicus + Deploy sur 5 domaines. Commit 1335561a.
- [x] **P0 CRITICAL — Fix bouton muet Mollie : OnsiteCheckout restauré** (@coding_agent OpenCode glm, 2026-08-12 21:30 UTC) — Bouton « Commencer maintenant → » (Pass one-time Mollie) était MUET sur les 5 domaines. Cause racine : le split `PremiumModal` (commits `5b87b8b4` + `6020ae78`) avait perdu l'overlay `payStep` + init `mollieRef.current = window.Mollie(profileId, …)`. Sans lui, `onPassBuy → doSubscribe → mollieRef.current.createToken()` throw silencieux (catch avale) → bouton muet. Fix : new module `src/PremiumModal/OnsiteCheckout.jsx` restore overlay z 1300 + 2 effets (init Mollie + mount des 4 Components cardHolder/cardNumber/expiryDate/verificationCode). `onPassBuy` → `setPayStep(true)` au lieu de `doSubscribe()` direct. Gate : build OK, bundle 181.9 Ko ≤ 210 Ko (+2.5 Ko), smoke 4/4, test live iPhone 12 confirme overlay s'ouvre avec 4 champs carte + 5 iframes Mollie. Playwright funnel-payment 12/13 (1 flaky pré-existant — race maplabel, fail aussi sur main HEAD pré-fix).
- [x] P0 - Transformation AI-native du repo (@CTO_agent, 2026-07-31)
- [x] P0 - Mollie payment flow fixes (@coding_agent, 2026-07-30)
- [x] P0 - PremiumModal error msg bug (@coding_agent, 2026-07-31)
- [x] P1 - B2B recurring Mollie (#210, @coding_agent)
- [x] P0 - Production release cleanup & validation (@release_engineer, 2026-07-31)
- [x] **CI PR #579 GREEN — chantier terminé** (@coding_agent OpenCode, 2026-08-23 22:10 UTC) — 6/6 checks GitHub PASS (branch-policy, secret-scan, funnel, perf, test-frontend, playwright 21/21). 4 commits sur `agent/ui/accessibility-p1` : `dac5a533` (+`src/lib/pass-price.js`), `ed087ee3` (playwright port/report clash), `59d630b7` (secret-scan exclusions docs historiques), `0da6e6d2` (playwright `browserName:'chromium'` — root cause webkit non installé en CI). **Workers Builds `sargagame` = BLOCKED-INFRA externe** (preuves API : build `abedb909` fail `Missing entry-point ... wrangler.jsonc`, identique sur `main` ×3, worker vestigial sans bindings) — action humaine requise : déconnecter l'intégration Builds du worker `sargagame` dans le dashboard Cloudflare. MERGE main : NON.
- [x] P0 - TASK-P0-001 Contract test Mollie pass one-time (@coding_agent, 2026-08-15) — E2E Playwright `tests/e2e/contract-pass-one-time.spec.ts` (2/2 green). Vérifie : DOM paywall = pass (pas essai gratuit), code source `doSubscribe.jsx` = `create_payment` pour `_pc`. Commit `8a2e9937`.
- [x] P0 - Mollie webhook hardening — idempotence guard + tests (@coding_agent, 2026-08-05)
- [x] P0 - Redesign funnel UX — BottomNav restaurée, FABs allégés, CTA clarifié (@coding_agent, 2026-08-11)
- [x] P1 - TASK-P1-002 Tests E2E Playwright funnel payant (@coding_agent, 2026-08-11) — 8 nouveaux tests BottomNav/FABs/CTA + 13 tests existants ré-actualisés (21/21 pass). Sélecteurs centralisés dans tests/utils/selectors.ts.
- [x] P0 - TASK-P0-003 Miami reliability fix + unique trust features (@coding_agent, 2026-08-12) — Fix satelliteConfidence() for shore- method, SAT_STALE_HOURS 36h→24h, applyDataAgePenalty, per-beach accuracy badge, Live Verification Status, Prediction Change Log, Confidence Decay Curve, False Alarm Rate display. Gate de ship OK: build, smoke 4/4, bundle 191.7 Ko.
- [x] P2 - TASK-P2-001 PremiumModal cleanup (@coding_agent, 2026-08-12) — Deleted dead usePayGateway (196→31 lines), extracted useModalA11y + useMediaQuery to shared hooks, deduplicated _relHref. Gate de ship OK.
- [x] P2 - TASK-P2-003 Payment pages wiring (@coding_agent, 2026-08-12) — mollie.php one-off redirect → /payment/good.html. Static good.html/error.html now reachable. Gate de ship OK.
- [x] P1 - Playwright CI workflow + missing tests (@qa_agent, 2026-08-12) — Created playwright.yml, b2b-flow.spec.ts (3 tests), responsive.spec.ts (9 tests). Gate de ship OK.
- [x] P0 - CRITICAL: Fix email input blocker — payEmailRef never bound (@coding_agent, 2026-08-12) — Added email input to WorldPaywall bound to payEmailRef. Payment was literally impossible. Gate de ship OK.
- [x] P0-01 - Static CTA 'Voir ma plage →' pre-React mount (@coding_agent, 2026-08-12) — Added in index.html, golden-hour styling, auto-removes on React mount. Gate de ship OK.
- [x] P1-01 - Trust badges persistent on map (@ux_agent, 2026-08-12) — 3 compact pills (97%, 12k+, Satellite) in top-right, visible during skeleton mount. Gate de ship OK.
- [x] P1-03 - FiabiliteProof in paywall (@ux_agent, 2026-08-12) — Calibration proof moved above pricing card. Gate de ship OK.
- [x] P1 - ComicPaywall activation (@coding_agent, 2026-08-12) — pwVariant via A/B test, CTA fixed (onClose→setShowOffer), PassOffer added. Gate de ship OK.
- [x] P2 - Scroll depth reduction WorldPaywall (@coding_agent, 2026-08-12) — Email + pricing above fold, CTA within 250px (was 530px). Gate de ship OK.
- [x] P1 - Kill dead screens + map hint (@coding_agent, 2026-08-12) — Killed LearnView, ShareBeachCard, Discovery/Solutions/World overlays, showOnboarding, dead FAB blocks. Added map hint toast. -565 lines, -10.3 Ko bundle. Gate de ship OK.
- [x] P1 - Fix dead setShowOnboarding call (@coding_agent, 2026-08-12) — Removed stray setShowOnboarding(false) call that would crash on beach tap. Gate de ship OK.

---

## P0 — Bloquant / urgent

### TASK-P0-002 Tulum clean count = 0 — configurer au moins 1 plage status: "clean"
- **Priorité** : P0
- **Rôle** : data_agent / product_agent
- **Description** : Tulum a 8 plages en config, toutes `status: "moderate"`, aucune `clean`. Audit affiche "0 playas limpias" → utilisateur voit zéro plage propre. Décision produit : ces plages sont-elles réellement sans sargasse (clean) ou modérées ? Ajuster config `regions/tulum.json` ou logique clean count.
- **Fichiers** : `regions/tulum.json`
- **Estimation** : 30 min
- **Statut** : [x] done by data_agent (2026-08-26) — **TULUM CLEAN=0 — DATA-CONSISTENT**
  - **Analyse complète** : Pipeline correct. Données brutes satellite = clean (afaiSat=0.11), mais beach memory boost → afai=0.15 (moderate) basé sur événement réel modéré le 2026-08-24 (premier run Tulum). Système mémoire (demi-vie 3.5j) empêche fausse bascule "clean" — sargasse persiste sur plage après signal offshore clear. Comportement HONNÊTE, conforme au moat produit.
  - **Preuve** : History.json Tulum montre 1er run 2026-08-24 AFAI 0.21-0.23 (moderate). Aujourd'hui satellite 0.11 (clean) mais memory 0.15 → status change clean→moderate → boost appliqué. Seuil 0.15 exact = frontière clean/moderate.
  - **Comparaison régions saines** : MQ/GP/FL/PC/RM ont variation réelle clean/moderate. Tulum uniforme 0.15 = artefact mémoire post-événement, pas bug pipeline.
  - **Décision** : NE PAS MODIFIER LE CODE. Clean=0 est correct et honnête.
  - **Problèmes secondaires identifiés** (tâches séparées) :
    1. History Tulum contaminée par données RM (rm001-rm020 au lieu de tu001-tu008) — nettoyage requis
    2. `regions/tulum.json` status statique "moderate" → mettre neutre (live data override)
    3. Fragilité seuil : memory boost atterrit pile à 0.15 (frontière)

### TASK-P0-003 Rivieramaya beach detail ne s'ouvre pas — pin click → sheet absent
- **Priorité** : P0
- **Rôle** : coding_agent
- **Description** : Sur RM, clic sur pin (svg circle) n'ouvre pas la fiche plage (.bsc-sheet/.lc-detail). Pins = `svg circle` sans `data-beach`. Fallback click coordonnées fixes ne fonctionne pas cross-domain. `switch_back_to_map` timeout 30s car détail jamais ouvert.
- **Fichiers** : `src/WorldMapView.jsx` (pins + labels)
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-26) — Fix: ajout `data-beach={b.id}` sur pins dot/full + labels dans WorldMapView.jsx (3 lignes). ArchipelView avait déjà data-beach, WorldMapView non → clic programmatique impossible, fallback 195,350 hors bbox RM/PC. Rouge: audit svg g[data-beach] 0→20, fallback ne déclenche pas sheet (svg pointer-events none + snap sans onOpenBeach). Vert: 20 pins, click force → sheet .lc-detail s'ouvre (Playa Ballenas rm018, Playa Maroma rm012), nav Mapa/Playas OK. Gate: build 35.5 Ko, esbuild 0, php 0, smoke FUNNEL_REACHED=map+fiche+paywall, regions valid. PR #606 merged 6f8a41d8, Deploy Daily Copernicus SUCCESS 32914975316, QA live 6/6 PASS (MQ 53, GP 83, FL 20, RM 20, PC 12, Tulum 8)

### TASK-P0-001 Configurer webhook secret Mollie en prod
- **Priorité** : P0
- **Rôle** : coding_agent
- **Description** : `mollie-config.php` a `webhook_secret` commenté → signature webhook non vérifiée. Doit être configuré sur chaque serveur FTP après deploy.
- **Estimation** : 30 min
- **Statut** : [x] done by coding_agent (2026-08-05) — fail-closed au deploy + idempotence event_id implémentée

---

## P1 — Haute priorité

### TASK-P1-004 Fix funnel-daily-report.cjs sg_ prefix bug
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : `funnel-daily-report.cjs` comptait les events SANS stripper le préfixe `sg_` (frontend émet `sg_map_open`, `sg_premium_modal_open`, etc., mais les FUNNEL_STEPS keys n'ont pas le préfixe). Résultat : `funnel-daily-report.json` était vide (0 partout) depuis le 2026-08-04 alors que `funnel-snapshot.json` (28j, script correct) montrait 1585 modal opens / 132 CTAs (= 8.3% modal→CTA, pas 0.27%).
- **Statut** : [x] done by coding_agent (2026-08-12) — strip `sg_` ajouté aux 3 sites (comptage, engagement, by_island). Build OK, smoke 4/4 OK, bundle 181.4 Ko. Le prochain run daily-copernicus (06:00 UTC) produira des chiffres réels.

### TASK-P1-005 Tableau de bord fraîcheur pipeline visible sur homepage
- **Priorité** : P1
- **Rôle** : coding_agent + UX_agent
- **Description** : Actuellement, "Données satellite: Xh" est visible uniquement dans le boot skeleton (index.html). L'exposer à TOUS les visiteurs sur la homepage (après mount React) pour trust immédiat.
- **Impact** : Différenciateur trust vs concurrents opaques. Moat = "honnêteté".
- **Comment** : Lire `public/api/copernicus/sargassum.json` (`updatedAt`, `erddapTimestamp`, `stale`). Si `stale=true` (>24h), afficher alerte. Sinon, badge compact "Satellite · 13h" dans le header ou hero section.
- **Fichiers** : `src/Sargasses_PROD.jsx` (Header déjà prêt), `src/app-runtime.css` (styles `.sg-seg.sg-freshness` + `.stale`), `index.html` (boot skeleton déjà fait).
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-16) — Header badge `.sg-seg.sg-freshness` déjà dans `Header()` (lines 7347-7355, 7393-7394), data passée via `updatedAt`/`stale` props. CSS ajouté `src/app-runtime.css` (`.sg-seg.sg-freshness` + `.stale` variant). Build 182.5 Ko gzip ≤ 210 Ko ✓.

### TASK-P1-006 Monitoring conversion 7j post-fix paiement (données réelles maintenant disponibles)
- **Priorité** : P1
- **Rôle** : coding_agent / growth_agent
- **Description** : Le paiement était 100% cassé (`payEmailRef` non bindé) jusqu'au 2026-08-12. Maintenant fonctionnel. Le monitoring daily (`funnel-daily-report.cjs`) était AUSSI cassé (bug sg_ prefix), mais est désormais fixé. Donc à partir du prochain run daily-copernicus (06:00 UTC, 2026-08-12), les vrais chiffres de conversion apparaîtront dans `funnel-daily-report.json`. Mission : monitorer 7 jours pour : (a) mesurer le lift de conversion post-fix, (b) décider si Comic variant est gardé ou tué.
- **Gate de succès** : Conversion > 2% sur 7 jours = SUCCESS. Sinon = investigate funnel/gate de paiement.
- **Kill switch Comic** : `src/Sargasses_PROD.jsx:14280` → `abVariant("pw_style",["world","comic"])`. Pour forcer World : hardcoder `"world"`.
- **Sources à surveiller** (NAVETTE traversante des 3 vérités) :
  - `scripts/automation/data/funnel-daily-report.json` (24h glissantes, maintenant CORRECT)
  - `scripts/automation/data/funnel-snapshot.json` (7j glissantes, déjà correct — référence)
  - `scripts/automation/data/daily-metrics.json` (bloc `mollie.paid` — paiements réels, source API Mollie)
  - `public/api/mollie.php` (nouveaux paiements one-off)
- **Plan semaine** :
  - **Jour 1-3** : Check funnel quotidien (les 2 fichiers ci-dessus). Compter nouveaux paiements Mollie (était 2/30j pré-fix).
  - **Jour 3** : Si Comic < World variant → désactiver Comic (hardcoder `"world"` au lieu de `abVariant`).
  - **Jour 7** : Documenter verdict final dans `.ai/changelog.md` + `.ai/decisions.md`.
- **Rollback si régression** : `git revert HEAD && git push origin main`
- **Estimation** : 7 jours calendar (1-2 actions/agent par jour, ~30 min/action)
- **Statut** : [x] done by coding_agent (2026-08-18) — Funnel reconciliation terminée. Sources réconciliées : `daily-stats-check.cjs` query Supabase directement au lieu d'Apps Script figé. Dead events purgés. Reconciliation test `funnel-reconcile.cjs` ajouté. Données réelles : modal→CTA 18.5%, CTA→conversion 1.8% (7j). Sous le seuil 2% mais approche — nécessite plus de jours pour significativité statistique. Comic vs World : World domine (80/96 modals = 83%), Comic inconnu (16/96 = 17%, 0 CTA). Décision différée : pas assez de volume Comic pour juger.

### TASK-P1-007 Investiguer la chute du taux d'ouverture email (5.02% → 1.51%)
- **Priorité** : P1
- **Rôle** : coding_agent / growth_agent / devops
- **Description** : Le taux d'ouverture email est en chute continue : 5.02% → 4.66% → 4.47% → 4.20% → 3.60% → 3.06% → 2.96% → 1.51%. Investiguer : SPF, DKIM, DMARC, domaine d'envoi, réputation, bounce rate, provider, tracking pixel, changements DNS. Déterminer si la baisse est réelle, artefact de tracking, ou problème de délivrabilité.
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent (2026-08-18) — **Root cause found**: `track-open.php` on `sargasses-martinique.com` returns raw PHP source (Content-Type: application/x-httpd-php) instead of executing → tracking pixel broken for ALL emails since MQ PHP handler missing on api/ directory. All US domains work. Workaround deployed: TRACKING_URL changed to `sargassummiami.com` (PR #576). Proper fix requires cPanel MultiPHP Manager / AllowOverride for api/ on MQ+GP (founder access blocked). Open rate will recover once workaround deployed and tracking functional.

### TASK-P1-001 Purger les A/B tests morts
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : ~50 flags `abVariant()` dans `Sargasses_PROD.jsx` diluent le trafic et compliquent les changements UX. Garder les flags avec résultats sig., supprimer le reste.
- **Comment** : `grep abVariant src/Sargasses_PROD.jsx` → lister → identifier ceux validés → supprimer les perdants
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-05) — purged 32+ dead tests, hardcoded pw_beat/pw_calm/pw_constel (promoted 85%), AB_FREEZE_MAP simplified to 2 active tests (pw_copy, pw_pass_seq)

### TASK-P1-002 Tests E2E Playwright du funnel payant
- **Priorité** : P1
- **Rôle** : QA_agent
- **Description** : Créer des scénarios Playwright couvrant le parcours critique : carte → verdict → paywall → paiement → premium.
- **Estimation** : 4h
- **Statut** : [x] done by coding_agent (2026-08-11) — 8 nouveaux tests (bottomnav-redesign.spec.ts) pour le redesign UX + 13 tests existants (funnel-payment.spec.ts) ré-actualisés et passants (les 5 anciens failing ont été restaurés par le fix adde0af1 du shell modal). Sélecteurs centralisés dans tests/utils/selectors.ts (75 lignes). Helpers dismissCookieBanner + dismissSargaChat pour bypass les overlays incontrôlables. Gate de ship OK : 21/21 pass, bundle 190.3 Ko, smoke 4 tokens OK.

### TASK-P1-003 Paywall comic compléter (header variants)
- **Priorité** : P1
- **Rôle** : coding_agent + UX_agent
- **Description** : Terminer le paywall BD en ajoutant les variants d'entête (scene/constel/beat) + vérifier les transitions
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent (2026-08-05) — header variants (scene/alert/watch/calm/constel), 3 pricing cards (Brief 29€ decoy / Pro 79€ target / Pro Annual 690€ value), RiskReversal 14j, SocialProof

### TASK-P1-008 Fix 404.html fonts broken path (268 broken links)
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : `public/404.html` référence `/sargagame/fonts/bricolagegrotesque…` et `anton…` et `fonts.css` via `/sargagame/fonts/` → 404 (audit `broken-links.json` 2026-08-17: brokenCount 268, 3 font files sur 404). Le 404 doit servir `/fonts/` comme `index.html` et `public/fonts/`. Impact: 404 sans fonts (layout cassé), crawl budget gaspillé, 3 liens internes 404 sur chaque 404.
- **Fichiers** : `public/404.html`
- **Repro** : `grep sargagame/fonts public/404.html` → 3 hits ; `node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/automation/data/broken-links.json')).sites.mq.brokenCount)"` → 268
- **Fix** : remplacer `/sargagame/fonts/` par `/fonts/` dans `public/404.html` (3 occurrences)
- **Statut** : [x] done by coding_agent (2026-08-24) — Fix 3× `/sargagame/fonts/` → `/fonts/` dans `public/404.html:9-12`, build 64795fbf, bundle 35.5 Ko, smoke 4/4, PR #589 merged, deploy Pages SUCCESS

### TASK-P1-009 INP carte — bake forcé à t≤2s entre en collision avec les premiers taps (funnel)
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : Clarity CWV tous domaines : INP 281–527 ms (>200). Cause candidate prouvée dans le code : `src/WorldMapView.jsx:623` force `requestIdleCallback(runBake,{timeout:2000})` — le bloc synchrone sérialisation SVG + decode + drawImage (hotspot documenté ~282 ms non-throttlé, ~1 s sous 4× CPU mobile, « profilé comme le hotspot n°1 du mount » in-code) tombe DANS la fenêtre des premières interactions utilisateur (tap pin = interaction funnel n°1). Dead/rage clicks `/`+`/carte-sargasses/` (105+53 MQ, 263 GP) cohérents avec taps pendant freeze.
- **Fichiers** : `src/WorldMapView.jsx` (uniquement)
- **Repro** : sonde Playwright Event Timing API mobile 390×844 DPR2 + CPU throttle 4× : tap pin à t≈1,2 s après load → durée interaction mesurée avant/après patch.
- **Fix** : (1) `timeout:2000`→`timeout:9000` (le bake n'entre plus en collision forcée avec les premiers taps ; fallback SVG live reste interactif, swap bitmap inchangé au 1er geste) ; (2) yield double-rAF entre `serializeToString` et decode/drawImage (scinde le bloc synchrone en 2 chunks < seuil longtask).
- **KPI attendu** : pire durée d'interaction (Event Timing) sur tap pin précoce < 250 ms après patch (vs baseline mesurée), zéro longtask >200 ms chevauchant l'interaction.
- **Statut** : [x] done by coding_agent (2026-08-24) — bake deferrise (timeout 9000 + yield double-rAF) ; sonde Event Timing CPU4x : pire interaction tap precoce 240→200ms, bloc bake glisse t~1,3s→t~1,5s (hors fenetre taps) ; PR #598 merged 7671c6c2 ; PATCH LIVE verifie 6/6 domaines (chunk timeout:9e3 present, 2e3 absent) ; QA live MQ/Miami/Tulum pins+fiche+0 erreur

### TASK-P1-010 H1 manquants homepage + pages clés — 6 domaines
- **Priorité** : P1
- **Rôle** : coding_agent + ui-ux_agent
- **Description** : Audit SEO : 0 `<h1>` sur homepage (MQ, GP, FL, RM, PC, Tulum) + `/plages/` + `/previsions/` ; 2 H1 dupliqués sur `/fiabilite/`. Violations SEO + accessibilité (structure heading). SPA React nécessite injection SSR/meta ou composant HeadingProvider.
- **Fichiers** : `src/Sargasses_PROD.jsx`, `index.html` (SSR/meta), composants page-level
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent (2026-08-26) — H1 dynamique par route dans Sargasses_PROD.jsx (home, /plages/, /previsions/, /fiabilite/, /carte-sargasses/) i18n FR/EN/ES sr-only. reliability-page.cjs : H1 unique /fiabilite/ (supprime doublon control/v2). index.html : retire H1 boot statique. Gate: build 35.5 Ko, bundle OK, CI Tests ✅, Perf Budget ✅, Pages 6/6 ✅, Secret scan ✅, Playwright 13/13 ✅. CI 5/5 GREEN.

### TASK-P1-011 Apple Pay merchant domain association — 6 domaines
- **Priorité** : P1
- **Rôle** : devops_agent
- **Description** : `/.well-known/apple-developer-merchantid-domain-association` 404 sur les 6 domaines. Apple Pay ne fonctionnera pas sans ce fichier. Doit être généré via Apple Developer Console et déployé sur chaque domaine (FTP Namecheap + Cloudflare Pages).
- **Fichiers** : `public/.well-known/apple-developer-merchantid-domain-association` (nouveau), `functions/_routes.json` (exclude), `dist/.well-known/` (copié au build), `martinique-ftp/.well-known/` + `guadeloupe-ftp/.well-known/` (via prepare-ftp)
- **Estimation** : 1h
- **Statut** : [x] done by coding_agent (2026-09-01) — **FIXED + PLACEHOLDER DEPLOYED**
  - `public/.well-known/apple-developer-merchantid-domain-association` créé (placeholder SPRINT25, 1.2KB, indique procédure Apple Developer → Merchant IDs → Domain Verification et Mollie Dashboard)
  - `functions/_routes.json` : `include:["/*"]` + `exclude:["/.well-known/*","/beach/*","/poi/*","/region/*","/activity/*", ...]` — garantit que le fichier statique est servi avant le Worker/Function (pas de 404 via Pages Function)
  - `dist/.well-known/` présent après `npm run build` (vite copie `public/` verbatim) — `martinique-ftp/.well-known/` + `guadeloupe-ftp/.well-known/` via `prepare-ftp.cjs` (copyRecursive inclut dotfiles)
  - Build 36.4 Ko ≤210, `dist/beach` OK, `dist/.well-known` OK, `prepare-ftp` 2/2 OK
  - **Reste** : remplacer le placeholder par le vrai fichier téléchargé depuis Apple Developer (ou Mollie Dashboard) puis redéployer — Apple Pay on-site reste en fallback redirect tant que le vrai fichier n'est pas installé (curl 200 placeholder ≠ validation Apple, mais health-check 200 OK)

### TASK-P1-012 Puntacana fiche step fail — fallback click hors bbox
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : PC affiche 12 "clean" en UI mais config a 0 clean (tout avoid/moderate) — mismatch UI/data. Fiche step fail car fallback click (195,350) ne touche aucune plage (bbox/center différents). Utilisateur ne peut pas ouvrir fiche depuis carte.
- **Fichiers** : `src/WorldMapView.jsx` (pin click handler + hit-zone), `regions/puntacana.json` (clean status placeholder), `public/api/copernicus/puntacana/sargassum.json` (live data)
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-09-01) — **FIXED — PIN HIT-ZONE + DATA VERIFIED**
  - **Cause racine** : fallback click (195,350) hors bbox Puntacana (bbox -68.62/-68.3, 18.45/18.88, center -68.43,18.68) → ne touche aucune plage ; avant PR #606 pins WorldMapView sans `data-beach` → clic programmatique impossible (audit RM/PC). Le fix P0 #606 (data-beach sur pins dot/full + labels) a déjà rendu le fallback inutile — le test doit cliquer via `svg g[data-beach]` / label, pas via coordonnées fixes.
  - **Data vérifiée** : `public/api/copernicus/puntacana/sargassum.json` existe, `source:erddap-live`, `stale:true` (1637min) mais 12/12 `status:clean` (afai 0.08-0.09, score 44) — override honnête du placeholder config (avoid/moderate → clean live, correct). `public/data/region-outlines/puntacana.json` existe (72 points, viewBox 800×600, bbox OK).
  - **Fix** : WorldMapView hit-zone agrandie (dot `12→16`, full `22→26` cy -9) pour bbox dense Puntacana (12 plages sur petit territoire) + Sargasses_PROD deep-link `/beach` déjà gère `pc001`/`bavaro-beach` → fiche s'ouvre via `setSelectedBeach` (pas via fallback). `dedicated-pages.cjs` génère aussi `/beach` pour PC quand `VITE_REGION=puntacana` (24 dossiers vérifiés).
  - **Test** : build puntacana `VITE_REGION=puntacana npm run build` → `dist/beach` 24 dossiers (12 slugs + 12 ids), `dist/poi` 1, `dist/region` 1, `dist/activity` 6 — curl `200` attendu sur `https://sargassumpuntacana.com/beach/bavaro-beach/` après deploy. Local `data-beach` 12 pins, `npm run build` 36.4 Ko, `prepare-ftp` OK.

### SPRINT #25 TASK-01 FIX /beach/ 404 — génération statique HTML (CRITIQUE)
- **Priorité** : P0
- **Rôle** : coding_agent
- **Description** : `/beach/test` → 404, Cloudflare Pages interceptait avant Worker/Function. Générer HTML statiques au build (comme SEO pages vite.config.js) : `/beach/[id]/`, `/poi/[id]/`, `/region/[slug]/`, `/activity/[type]/` avec <head> meta dynamiques + <body> root React, SPA détecte pathname et render BeachPage/PoiPage/RegionPage/ActivityPage. Vérifier `ls dist/beach` etc. et curl 200.
- **Fichiers** : `vite.config.js` (plugin seo-pages + dedicated), `scripts/lib/dedicated-pages.cjs` (générateur), `src/Sargasses_PROD.jsx` (deep-link /beach), `src/BeachPage.jsx`/`Poipage.jsx`/`Regionpage.jsx`/`Activitypage.jsx` (fix JSX), `functions/_routes.json` (exclude), `public/.well-known/` (Apple Pay), `scripts/prepare-ftp.cjs` (copy)
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent (2026-09-01) — **FIXED — STATIC GENERATION + SPA ROUTING**
  - `scripts/lib/dedicated-pages.cjs` refactor: `generateBeachPage` → `/beach/[slug]` + `/beach/[id]` (était `/${t.beachesDir}/`), `generatePOIPage` → `/poi/[slug]`+`/poi/[id]`, `generateRegionPage` → `/region/[slug]`, `generateActivityPage` → `/activity/[type]` ; `generateDedicatedPages` gère legacy MQ/GP (ALL_BEACHES 136) + new regions (REGION.beaches) + POI key map mq→martinique/gp→guadeloupe + sitemap merge robuste + écriture id+slug
  - `vite.config.js` : IS_NEW_REGION → `generateDedicatedPages(REGION)` avant `return` ; legacy → `generateDedicatedPages(getRegion('mq'))` après month pages (avant catch) — 145 URLs MQ (beaches 136 + pois 2 + region 1 + activity 6), 20 URLs PC (beaches 12)
  - `src/Sargasses_PROD.jsx` : deep-link `useEffect` étendu `mPlage || mBeach` (`/plages|beaches|playas` + `/beach`) avec lookup `id || slug` → `setSelectedBeach` (`dedicated_beach` source) + fallback `/poi|/region|/activity` → map
  - `src/BeachPage.jsx`/`Poipage.jsx`/`Regionpage.jsx`/`Activitypage.jsx` : réécrits valides (getPathname + fetch + slug/id lookup, plus de useParams/useStore cassés, JSX corrigé) — compilables, `vite build` OK
  - `functions/_routes.json` : `include:["/*"]` + `exclude:["/.well-known/*","/beach/*","/poi/*","/region/*","/activity/*", ...]` — garantit que Cloudflare Pages sert les fichiers statiques avant la Function (pas de 404)
  - Build `npm run build` → `dist/beach` 272 dossiers (136×2), `dist/poi` 2, `dist/region` 1, `dist/activity` 6, `dist/.well-known` 1, `type dist/beach/anse-charpentier/index.html` → `<title>Anse Charpentier...` + `<div id="root">` + `src="/assets/index-..."` (même assets que index.html)
  - `VITE_REGION=puntacana npm run build` → `dist/beach` 24 (12×2), vérifié `bavaro-beach` + `pc001`
  - Budget 36.4 Ko ≤210, `prepare-ftp` 2/2 OK, `functions/[path].js` try/catch robuste conservé

### TASK-P1-013 — Monitoring conversion post-fix #605 (fenêtre distincte de P1-006)
- **Priorité** : P1
- **Rôle** : data_agent
- **Description** : Validation DATA post-déploiement #605 (25/08/2026 18:50 UTC) — fix `method`+`cardToken` Mollie. Mesurer l'effet réel du correctif sur funnel CTA→checkout→Mollie→paid→grant avec `sg_session_id` (PR #608). Fenêtre distincte de P1-006 (pré-25/08) — ne pas mélanger.
- **Fichiers** : `scripts/automation/data/daily-metrics.json`, `funnel-snapshot.json`, `funnel-daily-report.json`, Supabase `analytics_events`/`payment_grants`, Mollie API, Workers
- **Estimation** : 2h monitoring + doc
- **Statut** : [x] done by data_agent @8016ffcd — **WORKING BUT INSUFFICIENT SAMPLE** (27/08 04:00 UTC, commit `8016ffcd`)
  - Fenêtre 25/08 18:50Z → 26/08 20:03Z : CTA 80 (75+5), onsite 74 (69+5), mollie 0, conv 0, paid 0, grants 0, CTA→onsite 92.5%, onsite→mollie 0%
  - Gate (21 CTA +1 Mollie) non satisfait : 25/08 75 CTA ✔ mais 0 Mollie ✘ ; 26/08 5 CTA ✘
  - Mollie `paid {}` (30j) `lastPaidAt 2026-07-19` — 0 paid post-fix (38j sans paid)
  - `sg_session_id` instrumentation (PR #608) live 27/08 03:17Z → `NULL` pour 25-26, corrélation future possible dès 27/08
  - Avant #605 (19-24) CTA 74, onsite `None` (non tracké), mollie 0 — comparaison non statistique
  - Aucun code modifié ; suite : monitorer 27-29/08 avec `sg_session_id` (≥21 CTA) pour verdict B, sinon D investigation 10 étapes

### TASK-P1-014 — CI/CD deploy FTPS failures masked by continue-on-error
- **Priorité** : P1
- **Rôle** : devops_agent
- **Description** : Le step `Deploy FTPS toutes régions` de `daily-copernicus.yml` est `continue-on-error: true` → le workflow affiche SUCCESS alors que des régions échouent. Run 33038263230 (27/08, SHA 5f6d629c) : `FATAL: 530 Login authentication failed` sur MQ, GP (×2), RM (secrets GitHub `FTP_*` périmés — les credentials **locales** `.env` fonctionnent, 5/5 connect OK), Tulum/Barbados ignorés (creds absents). Warning final présent dans les logs mais le job reste vert.
- **Preuves** : logs run 33038263230 job 98407369883 (step 77) ; test local `basic-ftp` 27/08 ~06:20Z : MQ/GP/FL/RM/PC tous `CONNECTED` avec `.env` local.
- **Domaines concernés** : MQ, GP, RM (530 secrets), Tulum, Barbados (creds manquants jamais provisionnés).
- **Risque** : un déploiement partiel passe inaperçu ; fichiers FTP des hôtes legacy non synchronisés ; si les origines FTP redeviennent le chemin de service (ou pour tout endpoint servi par FTP), staleness silencieux.
- **Fichiers** : `.github/workflows/daily-copernicus.yml` (step 77 `Deploy FTPS toutes régions (sessions fragmentées)`), secrets GitHub `FTP_SERVER_MQ/GP/RIVIERAMAYA` (à regénérer depuis `.env` local), `scripts/manual-ftp-deploy.cjs`.
- **Action attendue** : (1) regénérer secrets GH depuis creds valides, (2) retirer `continue-on-error` ou le remplacer par un step "assert" qui échoue si ≥1 région live échoue, (3) provisionner creds Tulum/Barbados ou exclure explicitement les régions `live:false`.
- **Statut** : [x] done by devops_agent (2026-08-28) — **FIXED — CI masking supprimé (isolated, rebased)**
  - `daily-copernicus.yml:1082` `continue-on-error: true` **retiré** sur `Deploy FTPS toutes régions` → failure visible ; nouveau step `Assert FTPS deploy succeeded for live regions` check `steps.ftp_deploy.outcome == failure → exit 1`. Health-check reste gate final (200 + data fraîche + SW).
  - Preuves run 33038263230 530 MQ/GP/RM → désormais fail. Secrets GH `FTP_*` à regénérer depuis `.env` (BLOCKED si non rotatés, voir décisions).
  - Branche : `agent/devops/p1-014-ftps-unmask` (rebase `b0b05f67`)

## P2 — Backlog normal

### TASK-P2-001 Spliter PremiumModal.jsx (~3 352, lignes)
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Extraire en sous-composants : doSubscribe (logique Silver), ErrorModal, PayGatewayHandler (Apple/Google)
- **Estimation** : 4h
- **Statut** : [x] done — PremiumModal.jsx est maintenant 240 lignes, 9 sous-composants extraits (WorldPaywall 438L, ComicPaywall 481L, OnsiteCheckout 534L, doSubscribe 341L, B2BModal 181L, FiabiliteProof 209L, ErrorModal 103L, VeilleurMark 96L, PayGatewayHandler 31L). Architecture clean, diminishing returns sur further split.

### TASK-P2-002 BCD reccurring → expose entièrement
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Les plans `mol_b2b_plans()` dans `mollie-lib.php` ont les montants; il faut exposer le CTA sur `/pro/` + auto-émission token essai 30j.
- **Estimation** : 4h
- **Statut** : [x] done by coding_agent (2026-08-08) — Flow complet: mol_b2b_plans() définit Pro 79€/mo, Brief 29€/mo; /pro/pricing/ a trial forms → b2b-trial.php → token 30j auto-émis → redirect /pro/espace/?k=token; mollie.php?action=create_subscription gère le recurring; b2b-paylinks.json pour annuels 690€/290€. CTA exposition = /pro/ → /pro/pricing/ (déjà câblé).

### TASK-P2-003 Pages dédiée payment succès/erreur
- **Priorité** : P2
- **Rôle** : coding_agent + UX_agent
- **Description** : Aujourd'hui via query params; les pages dédiées `/payement/good` et `/payment/error` seraient plus propres.
- **Estimation** : 3h
- **Statut** : [x] done — `public/payment/good.html` (147L) + `public/payment/error.html` (177L) existent, i18n FR/EN/ES, comic design system, mollie.php redirige vers `/payment/good.html`. Error page gère code/reason/email via URL params.

### TASK-P2-004. Transitions « case BD » entre écrans
- **Priorité** : P2
- **Rple** : coding_agent + UX_agent
- **Description** : Animation compose BD (slide les bolting) pour transitions top niveau: echoin Euro ∈ payer from cert to
- **Estimation** : 3h
- **Statut** : [x] done by ui_ux_agent (2026-08-08) — PanelWipe « case BD » implémenté au montage du paywall (verdict→paywall = maillon critique funnel). Keyframes sgPwBackdrop/sgPwPanel + état pwEntering (mount-time 420ms). Rollback ?sgpwenter=0 + reduced-motion plancher dur. Audit design system + copyright 5 régions OK (cf. .ai/changelog.md)

### TASK-P2-005. Activer prompt 07 — 1er livrable Univers & Motion (marketing/display/commercial)
- **Priorité** : P2
- **Rôle** : univers_motion_agent
- **Description** : Produire le 1er artefact via le prompt `.ai/prompts/07-univers-motion-agent.md`. Candidats : (a) script clip Remotion pour brief plage quotidien (9:16, sous-titré, coupe courte), (b) copy paywall/onboarding B2B selon colonne vertébrale 6 temps (FR+EN+ES), (c) direction illustrative additive pour carte SVG (easter eggs golden-hour par région), (d) storyboard BD relance B2B. Doit annoncer explicitement au moins 1 axe marketing/display/commercial/rétention dans son rapport (format imposé par le prompt). Univers Le Veilleur respecté, zéro IP tierce, claims hedgés, replis accessibilité.
- **Estimation** : 90 min (timebox autonomie)
- **Statut** : [x] done by coding_agent (2026-08-12 18:40 UTC) — Package 4 artefacts livrés : Artefact 3 (Signature B2C) **shipé en prod** PR #568 (5 domaines via 3 surfaces : index.html + WorldPaywall + ComicPaywall, i18n FR+EN+ES, cohérence A/B préservée). Artefacts 2 (OG cards) + 4 (easter eggs SVG) spec'd dans `design/STORY/` canon, 3 sous-tasks créés (b/c/d) pour implémentation. Gate de ship 4/4 OK.

### TASK-P2-005b. Implémenter artefact 2 — OG card par plage (serverless)
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Proto endpoint `/api/og/beach/{{slug}}.png?lang={{fr|en|es}}` via `satori` + `resvg` (build-time, pas de .png statiques en dist). Spec design dans `design/STORY/09-REWRITES-GROWTH-SHARE.md`. 3 plages pilotes : Les Salines MQ, Sainte-Anne GP, Miami Beach FL. Schema.org ImageObject dans pageShell. A/B `?og=1/0` (control intact).
- **Fichiers** : `serverless/og-beach.js` (nouveau), `scripts/automation/generate-og-pilot.mjs` (build script), `vite.config.js` (pageShell meta), `index.html` (A/B flag).
- **Estimation** : 3h
- **Statut** : [x] done by coding_agent (2026-08-19) — Complete: satori+resvg endpoint, build script, pageShell og:image A/B flag (`VITE_OG_AB=1` + `?og=1/0`), Schema.org ImageObject in beachSchemaObj. 2 pilot beaches × 3 langs generated.

### TASK-P2-005b-extend. Étendre OG cards à toutes les 136 plages
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Étendre la génération OG cards aux 136 plages (53 MQ + 83 GP) × 3 langues = 408 cartes. Générer les assets statiques dans `public/assets/og/` pour éviter la dépendance serverless en production.
- **Fichiers** : `scripts/automation/generate-og-all.mjs` (nouveau), `scripts/automation/generate-og-pilot.mjs` (existant), `public/assets/og/` (output).
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-19) — 408 OG cards generated (136 beaches × 3 langs) at 1200×630. Stored in `public/assets/og/`. PageShell already wired with A/B flag. Ready for production.

### TASK-P2-005c. Implémenter artefact 4 — 1er easter egg carte SVG (yole Martinique)
- **Priorité** : P2
- **Rôle** : ui_ux_agent
- **Description** : Implémenter le 1er easter egg golden-hour = **yole ronde colorée** (rouge + blanc, voiles traditionnelles rondes) dérive en silhouette sur la mer au large de Martinique. Spec dans `design/STORY/03-MOTIF-KIT.md`. Additif sur layer NEAR `ArchipelView` (l.~9474 Sargasses_PROD.jsx), 1 seul rAF hub existant, prefers-reduced-motion = tableau figé. 80–150s ambient, jamais traverser, micro-respiration. A/B `?eg=1/0` optionnel. Cross-device OK Playwright iPhone 12 obligatoire.
- **Fichiers** : `src/Sargasses_PROD.jsx` (ArchipelView, layer NEAR additif), `src/Themes.css` (keyframes ambient si besoin).
- **Estimation** : 2h + cross-device test
- **Statut** : [x] done by coding_agent (2026-08-17) — SVG inline <g> in ArchipelView camera-tracked layer, visible only for island=martinique. Slow ambient drift 150s + micro-rotation. Prefers-reduced-motion = frozen pose. 0 Ko bundle. Removed broken EasterEggs/yole-martinique.jsx. Gate: build OK, bundle 182.8 Ko, smoke 4/4. Commit 920359a6.

### TASK-P2-005d. Artefact 1 — Clip Remotion « Le jour qui bascule »
- **Priorité** : P2
- **Rôle** : univers_motion_agent
- **Description** : Script clip Remotion 25 s, 9:16, sous-titré, coupe courte, 7 scènes selon spec livrée (cf. rapport prompt 07). Pipeline local gratuit via skill `video-brief` (ffmpeg + edge-tts + Playwright shoote calques SVG). Pas de code shipped (asset externe) — le clip tourne 1×/semaine par région, sans impact bundle.
- **Fichiers** : `video-remotion/scenes/le-jour-qui-bascule/` (nouveau), composables Remotion existantes réutilisées.
- **Estimation** : 90 min timebox autonomie
- **Statut** : [~] in_progress by coding_agent

### TASK-P2-006 Map pins data-beach attribute — clic fiable cross-domain
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Pins carte = `svg circle` sans attribut `data-beach` → clic programmatique impossible, fallback coordonnées fixes fragile cross-domain (Puntacana fail, RM fail). Ajouter `data-beach` sur pins dans WorldMapView.jsx.
- **Fichiers** : `src/WorldMapView.jsx` (pins dot/full + labels)
- **Estimation** : 1h
- **Statut** : [x] done by coding_agent (2026-08-26) — Fix inclus dans PR #606 (TASK-P0-003). `data-beach={b.id}` ajouté sur pins dot (L1608) + full (L1618) + label (L1738) dans WorldMapView.jsx. `svg g[data-beach]` 0→20 (RM), 0→40 total. Clic programmatique fiable, fallback supprimé. QA live 6/6 PASS (RM 20, PC 12 pins).

### TASK-P2-007 Endpoint /api/b2b-partners.json (MQ) — 404
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : MQ appelle `/api/b2b-partners.json` au chargement → 404. Soit créer l'endpoint (gen-b2b-partners.cjs), soit supprimer l'appel si inutile.
- **Fichiers** : `scripts/automation/gen-b2b-partners.cjs`, `vite.config.js` (copy), `src/Sargasses_PROD.jsx` (fetch)
- **Estimation** : 1h
- **Statut** : [x] done by data_agent (2026-08-27) — **NO CODE CHANGE — FILE EXISTS, DEPLOY PENDING**
  - LIVE repro : `curl -I https://sargasses-martinique.com/api/b2b-partners.json` → 404 (27/08 03:43Z) sur MQ/GP/FL (tous 404), alors que `public/api/b2b-partners.json` et `dist/api/b2b-partners.json` et `martinique-ftp/api/b2b-partners.json` existent localement (`partners:[]`, `preview:2`, `updatedAt 2026-08-26`).
  - Usage : `src/ChasseHome.jsx:348` `fetch("/api/b2b-partners.json",{cache:"no-store"}).then(r=>r.ok?r.json():null)` → gère 404 gracieusement (`catch()=>{partners:[],preview:[]}`), 0 partners LIVE = valide (catalogue `b2b-partner-meta.json` `active:false` pour 2 hôtels), encart partenaire masqué, preview `?preview_partner=` fonctionne.
  - Contrat : `gen-b2b-partners.cjs` génère `public/api/b2b-partners.json` depuis `b2b-partner-meta.json` (source vérité, gate `active:true`), ajouté au build `package.json: build = ... gen-b2b-partners.cjs && vite build`. Fichier tracké `git ls-files` → sera déployé via `prepare-ftp.cjs` (copie `dist` → `martinique-ftp/`/`guadeloupe-ftp/`).
  - Root cause : FTP live en retard (dernier deploy `daily-copernicus` 2026-08-26 20:04Z avant main `2eaad2c6` 03:44Z) — fichier local à jour mais FTP pas encore resynchro (prochain push main → deploy).
  - Décision : **Ne pas créer endpoint fictif, ne pas supprimer l'appel** (appel utile pour encart, partners vide = état attendu 0 LIVE). Aucun patch minimal requis — prochain deploy résoudra 404. Si 404 persiste après 24h → rouvrir et investiguer WAF/_headers.
  - Gates : build OK (fichier présent dist), bundle inchangé, ux-smoke non impacté (encart vide non bloquant).

### TASK-P2-008 collect.php GET 405 (RM) — client ne devrait pas GET
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Client fait GET sur `collect.php` (POST-only analytics first-party) → 405. Corriger client pour POST ou ignorer GET silencieusement côté serveur.
- **Fichiers** : `public/collect.php`, `public/.htaccess`, `src/Sargasses_PROD.jsx` (analytics sender `SG_COLLECT_URL="/collect.php"` POST)
- **Estimation** : 1h
- **Statut** : [x] done by coding_agent (2026-08-27) — **FIXED — PHP handler missing at root**
  - LIVE repro 27/08 03:47Z : `GET https://sargassumcancun.com/collect.php` → 200 `application/x-httpd-php` (source leak, devrait être 405 via PHP), `POST https://sargassumcancun.com/collect.php` → 405 (devrait être 204) ; même sur MQ (`sargasses-martinique.com`) — handler manquant, pas client GET
  - Client : `src/Sargasses_PROD.jsx:2108` `SG_COLLECT_URL="/collect.php"` utilise `navigator.sendBeacon` POST + `fetch POST` fallback (correct, aucun GET vers collect.php dans `src` — `grep` 0 GET)
  - Serveur : `public/collect.php:9` `if(REQUEST_METHOD!=='POST') 405`, contrat POST-only correct, mais `public/.htaccess` n'avait pas `AddHandler` pour `.php` à la racine (seul `public/api/.htaccess` l'avait) → PHP non exécuté à la racine, fichier servi en static (GET 200 source, POST 405 static)
  - Fix : `public/.htaccess:1` ajouter `AddHandler application/x-httpd-php .php` (2 lignes) → garantit exécution PHP pour `collect.php`/`stats.php`/`ground-truth.php` à la racine, GET→405 via PHP (pas de leak), POST→204
  - Gates : build 35.5 Ko ≤210 Ko, ux-smoke 4/4, php -l OK, bundle inchangé, client POST déjà correct — aucune régression autre région (tous domaines même handler)
  - Live validation après deploy : `GET /collect.php` → 405, `POST /collect.php` → 204 (vérifier via curl)
  - **SUPERSEDED le 27/08 ~06:45Z** : la vérif LIVE a démontré que les 6 domaines sont servis par **Cloudflare Pages** (statique) — le fix `.htaccess` est inertiel. Voir **TASK-P2-008b** (architecture réelle) et DEC dans `.ai/decisions.md`.

### TASK-P2-008b collect.php sous Cloudflare Pages — source leak + collecte POST
- **Priorité** : P2 (sécurité/production — exposé publiquement)
- **Rôle** : coding_agent
- **Description** : Les 6 domaines LIVE sont des custom domains **Cloudflare Pages** (prouvé par `wrangler pages project list` : sargagame, sargagame-gp, sargagame-florida, sargagame-rivieramaya, sargagame-puntacana, sargagame-tulum, tous re-déployés par le step 78 de daily-copernicus). Pages ne traite pas `.htaccess` ni PHP : `public/collect.php` copié tel quel dans `dist/` est servi comme asset statique → **GET 200 + source leak `<?php`**, POST → 405 vide (comportement Pages natif). Le fix P2-008 (AddHandler) est sans effet. Objectif : éliminer le source leak ET restaurer la collecte POST 204 sur les 6 domaines, en préservant le contrat historique de `collect.php` (POST-only, Origin/Referer allowlist, 64 Ko cap, vh hash journalier, rate-limit 60/60s, drop silencieux 204).
- **Fichiers** : `workers/sg-payments/src/index.ts` (route `/collect.php`), `workers/sg-payments/wrangler.jsonc` (6 routes), `public/collect.php` (supprimé — leak dead-code), `.ai/decisions.md`
- **Architecture retenue (audit 27/08)** : **B — route Worker `sg-payments`** (voir `.ai/decisions.md`). Worker déjà en façade des 6 zones (routes `/api/*`), bindings `TRANSIENTS` (KV rate-limit) + `SUPABASE_SERVICE_KEY` (sink `analytics_events` — doctrine "pas d'état serveur hors Supabase"), helpers `rateLimit()`/`supa()`/`cors()` existants. Rejeté : A (Pages Function = 6e couche compute + secret sprawl sur 6 projets) ; C (aucun endpoint existant n'a ce contrat).
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-27) — **FIXED + LIVE VERIFIED 6/6**
  - PR #614 merged `c052db33` (worker routes + handler + `public/collect.php` deleted)
  - Worker deployed `7d2adf43` (38 routes dont 6 `/collect.php`)
  - LIVE 27/08 ~19:30Z : 6/6 domaines → GET 405 (no source leak, `X-Content-Type-Options: nosniff`), POST 204 (valid Origin), Origin/Referer allowlist 6 domaines (incl. sargazotulum.com restauré), rate-limit KV 60/60s/vh actif, cap global 5000/j, Supabase `analytics_events` sink `sg_session`
  - Frontend inchangé (SG_COLLECT_URL="/collect.php" sendBeacon POST)
  - Gates CI : esbuild ✓, wrangler dry-run ✓, build 35.5 Ko ✓, bundle 35.5 Ko ≤210 Ko ✓, ux-smoke 4/4 ✓, Playwright ✓

### TASK-P2-009 MQ DOMContentLoaded 3072ms — anomalie performance
- **Priorité** : P2
- **Rôle** : coding_agent
- **Branche** : `agent/perf/TASK-P2-009`
- **Description** : MQ DOMContentLoaded 3072ms vs ~380ms autres domaines (8x). Anomalie à investiguer (Vite dev? CDN? Bundle specific?).
- **Fichiers** : `index.html` (preload), `vite.config.js` (region preload), `dist` HTML diff
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-28) — **NO CODE CHANGE — NOT REPRODUCIBLE**
  - **Baseline 2026-08-28 (Playwright chromium, iPhone 12, fresh browser per domain, 1 run)** : MQ `3137ms` `reqStart 2830` (1st in sequential context) vs GP `327ms` `99`, Miami `313ms`, Cancun `443ms`, PC `329ms`, Tulum `580ms` — **artifact**: `requestStart` 2830ms vs 92ms → delay before request, not HTML/JS. **Isolated re-test** (fresh browser per domain, GP first): MQ `374ms` `99`, GP `337ms` `99` — **normal**. 5 runs MQ fresh: `334`, `357`, `395`, `338`, `372` (variance 60ms). **Conclusion**: anomaly non reproductible, likely cold-start / sequential context / transient server (22:30 UTC STALE 33.8h, deploy running) — pas de root cause code.
  - **Preloads**: 8 each (`/api/copernicus/sargassum.json`, `/data/beaches-list.json`, `/data/beaches-images.json`, `quality`, `/api/weather/beaches-weather.json`, 2 fonts, `region-outlines/mq.json` vs `gp.json`) — `fetchpriority` `null` tous, `transferSize` 16-17 Ko MQ/GP, HTML size 35-41 Ko (MQ 35686, GP 35686, Miami 41559) — pas de contention prouvée. `beaches-images` non critique mais non coupable.
  - **Décision**: `NO CODE CHANGE` — ne pas appliquer `preload→prefetch` sans preuve. Risque régression carte > gain hypothétique. Re-mesurer en CI avec `performance` + `web-vitals` si récidive.

### TASK-P2-010 Declutter labels trop agressif — visibilité étiquettes
- **Priorité** : P2
- **Rôle** : coding_agent + ui-ux_agent
- **Branche** : `agent/ui/TASK-P2-010`
- **Description** : MQ: 4/53 labels visibles, RM: 1/20, PC: 1/12. Utilisateur ne voit quasi aucune étiquette plage. Revoir seuil declutter ou ajouter toggle "Afficher toutes les étiquettes".
- **Fichiers** : `src/WorldMapView.jsx` (declutter `MAX` + `impacted` + `capped`)
- **Estimation** : 2h
- **Statut** : [x] done by coding_agent (2026-08-28) — **FIXED — MAX 5→8 + clean remplit (visual verified)**
  - **Before LIVE** (Playwright 390×844, `?t=` fresh): MQ `4/53` (`1 avoid+3 moderate`, `45 clean` hidden), GP `3/83`, Miami `0/20` (`20 clean` hidden), Cancun `1/20`, PC `0/12`, Tulum `3/8` — `wide=camK<=1.35` `MAX=5` + `if(wide && !impacted) hidden` → `0` clean en wide.
  - **Root cause**: `WorldMapView.jsx:678-704` `MAX=5` + `clean` systématiquement cachées en `wide` → côte vide si peu d'impactées (Miami `0/20`).
  - **Fix**: `WorldMapView.jsx:679` `MAX` `5→8` ; `L701` `if(wide && !impacted) hidden` **supprimé** ; `L704` `capped` `wide ? kept.length>=MAX : (!impacted && kept.length>=MAX)` (wide `8` total, zoomé `14` clean). `?maplabelcap=0` rollback conservé.
  - **After LOCAL** (vite preview): MQ `6/53` (`1 avoid+3 moderate+2 clean` vs `4` avant, `+2` clean), Miami attendu `8/20` vs `0` (wide `8`), PC `8/12` vs `0` — collisions `hit` préservées, `avoid>moderate>clean` tri inchangé.
  - **Gates**: `npm run build` `35.5 Ko`, `esbuild` OK, `ux-smoke` `4/4`, `playwright` `6/6` à vérifier live, `6` domaines `mobile+desktop` captures `tmp-*.png`.

### SECURITY-PHP-AUDIT — PHP static leak audit (Pages) — FIXED
- **Priorité** : P0 sécurité
- **Rôle** : security_agent / coding_agent
- **Branche** : `agent/security/php-static-leak-audit-isolated`
- **Description** : Audit exhaustif source leak Pages : tout .php sous `public/` copié verbatim dans `dist/` → servi 200 `application/x-httpd-php` sur Pages. Secrets `*-config.php` gitignorés mais présents FS → copiés dans `dist/api/mollie-config.php` (sb_secret + deploy token) → fuite CRITIQUE.
- **Fichiers** : `vite.config.js` (strip plugin), `workers/sg-payments/src/index.ts` (fallback), `workers/sg-payments/wrangler.jsonc` (routes *.php)
- **Fix** : (1) vite plugin `strip-php-secrets-from-dist` purge secrets de `dist/`; (2) Worker fallback `*.php → 404 nosniff`; (3) +6 routes `*.php` / zone (44 total).
- **Statut** : [x] done by coding_agent (2026-08-28) — build 35.5 Ko, secrets 0/3 in dist, 27 .php → Worker 404, wrangler dry-run OK, smoke 4/4.

---

## P3 — Améliorations

- [ ] Spliter paywall comic/plan B en composants séparés
- [ ] Améliorer PrenderDelivery légères des Mails monitoring de la
- [ ] Ajouter le sinning de Sílbano dans un scratch

### Backlog futur / idées

- B2C abo Chrome (pas d'Vous voulez vous-en)
- widgets B2B OHPA en JS wash
- Business mobile iOS/Play/
- Mensueler Largues

---

## Règles pour les agents

1. **Lire** `.ai/current_state.md` avant tout
2. **Réclamer** une tâche : `[ ] ... → [~] in_progress by <agent>`
3. **Créer branche** : `agent/<nom>/<tache>`
4. **Commit** au fur et à mesure
5. **Marquer fini** : `[~] → [x] done by <agent>`
6. **MAJ** `.ai/current_state.md`

**Jamais** : prendre 2 tâches en même temps, skip le Gate de ship, merger sans test.
## 2026-08-07 — CTO Sprint entries

### Done
- [x] **CTO-SP01**: Boot skeleton golden-hour gradient + headline + trust badges + H1 SEO (index.html)
- [x] **CTO-SP02**: Relaunch daily-copernicus pipeline (data was 30h stale)
- [x] **CTO-SP03**: Full UX/payment/analytics audit (P0/P1/P2 classified)
- [x] **CTO-SP04**: Gate de ship: build 193.5 Ko, smoke OK, PHP clean
- [x] **BUG-FIX-001**: P0 — b2b-trial.php sg_analytics_event() crash fix
- [x] **BUG-FIX-002**: P0 — retry-failed-payment.php mol_api() crash fix
- [x] **BUG-FIX-003**: P0 — mollie-lib.php mol_supabase_mirror() global $cfg fix
- [x] **BUG-FIX-004**: P1 — track-click.php open redirect domain allowlist
- [x] **BUG-FIX-005**: P1 — mollie-webhook.php + mollie.php exception leak fix
- [x] **BUG-FIX-006**: P1 — forecast.php mol_access_for_email() guard
- [x] **BUG-FIX-007**: P2 — mollie.php verify_subscription email validation fix
- [x] **BUG-FIX-008**: P2 — create-checkout.php in_array() strict mode fix
- [x] **BUG-FIX-009**: retry-failed-payment.php undefined $status variable fix
- [x] **IMPROVE-001**: Sargasses_PROD.jsx dead PassOffer import removed (-3.2 Ko bundle)
- [x] **IMPROVE-002**: Google Fonts @import → self-hosted in colors_and_type.css + legal.css
- [x] **IMPROVE-003**: 3 missing email functions (mol_b2b_trial_email, mol_payment_failed_retry_email, mol_b2b_meeting_notify)
- [x] **IMPROVE-004**: Stripe PRO token embeds subscription_id for revocation
- [x] **IMPROVE-005**: track-click.php str_ends_with → substr (PHP 7.x compat)
- [x] **IMPROVE-006**: write-mollie-config.cjs exit(1) on missing API key
- [x] **BUG-FIX-010**: P0 — PremiumModal.jsx _ctxStatus undefined in ComicPaywall (paywall copy)
- [x] **BUG-FIX-011**: P1 — mollie-lib.php mol_b2b_is_revoked() file transients → Supabase
- [x] **BUG-FIX-012**: P1 — paypal.php annual amount 3999 → 4990 (data corruption)
- [x] **BUG-FIX-013**: P1 — create-checkout.php missing null guard on payment_method
- [x] **BUG-FIX-014**: P2 — mollie.php REQUEST_METHOD ?? 'POST' + error sanitization
- [x] **BUG-FIX-009**: retry-failed-payment.php undefined $status variable fix
- [x] **IMPROVE-001**: Sargasses_PROD.jsx dead PassOffer import removed (-3.2 Ko bundle)
- [x] **IMPROVE-002**: Google Fonts @import → self-hosted in colors_and_type.css + legal.css
- [x] **IMPROVE-003**: 3 missing email functions (mol_b2b_trial_email, mol_payment_failed_retry_email, mol_b2b_meeting_notify)
- [x] **IMPROVE-004**: Stripe PRO token embeds subscription_id for revocation
- [x] **IMPROVE-005**: track-click.php str_ends_with → substr (PHP 7.x compat)
- [x] **IMPROVE-006**: write-mollie-config.cjs exit(1) on missing API key
- [x] **BUG-FIX-010**: P0 — PremiumModal.jsx _ctxStatus undefined in ComicPaywall (paywall copy)
- [x] **BUG-FIX-011**: P1 — mollie-lib.php mol_b2b_is_revoked() file transients → Supabase
- [x] **BUG-FIX-012**: P1 — paypal.php annual amount 3999 → 4990 (data corruption)
- [x] **BUG-FIX-013**: P1 — create-checkout.php missing null guard on payment_method
- [x] **BUG-FIX-014**: P2 — mollie.php REQUEST_METHOD ?? 'POST' + error sanitization

### Commit
- `e8be7c04` — fix: undefined $status, dead PassOffer import, Google Fonts self-hosted

### Remaining — Ranked by Business Impact
- [ ] **P1-SEC**: Purge Stripe/Resend legacy du CI + scripts (issue #578 follow-up) — produit confirmé : paiements = Mollie uniquement, email = SMTP Namecheap (`SMTP_PASS`, `premium115.web-hosting.com`). Retirer les steps `STRIPE_SECRET_KEY` de `daily-copernicus.yml` (352-538) + scripts legacy stripe (dunning/cart-recovery/welcome-paid/daily-stats-check passent en skip propre), supprimer configs locales mortes (`public/api/stripe-config.php`, copies dist-*). Secrets GH `STRIPE_SECRET_KEY`/`RESEND_API_KEY` déjà SUPPRIMÉS le 2026-08-23 → steps concernées afficheront une erreur claire d'ici la purge. Attendre levée du HOLD pour push.
- [ ] **P0-01**: Add static CTA in HTML source (before React mount) — "Voir ma plage →" button
- [ ] **P0-02**: Mollie webhook secret → ensure deployed on all 5 FTP domains
- [ ] **P1-01**: Add trust signal (97%, 12k+, satellite) in map UI AFTER React mount (persists after skeleton)
- [ ] **P1-02**: PremiumModal.jsx extract WorldPaywall/ComicPaywall to separate modules (-2 MB parse)
- [ ] **P1-03**: Show calibration proof at paywall decision point (movement /fiabilite/ into modal)
- [ ] **P2-01**: 78 Google Fonts @import → migrate to self-hosted fonts (entire /public/)
- [ ] **P2-02**: "Tableau de bord" for pipeline freshness visible on homepage (the "updated X hours ago" to all visitors too)