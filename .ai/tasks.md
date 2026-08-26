# .ai/tasks.md — Backlog priorisé

> Lu par tous les agents pour choisir leur prochaine tâche.
> Priorité : P0 = critique, P1 = haute, P2 = moyenne, P3 = basse.
> 1 agent = 1 tâche à la fois. Toujours choisir la priorité la plus haute disponible.

---

## Récemment complété

- [x] **FULL PRODUCT HEALTH AUDIT — 6 domaines LIVE** (@senior_product_ux_qa OpenCode, 2026-08-25) — Audit complet UX/UI/Performance/Accessibilité/SEO/Broken Links sur MQ, GP, FL, RM, PC, Tulum. 0 P0 nouveaux, 1 P1 systémique (H1 manquants), 3 P0 existants (ERDDAP stale, Tulum clean=0, RM beach detail), 6 P2, 4 P3. Payment path observé 5/6 (PC fiche fail). AUCUNE correction — qualité rapport priorisée. Backlog 10 tâches créées ci-dessous. Artefacts: `tests/ux-recordings/*/`, `.ai/current_state.md` entrée complète.

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
- **Statut** : [ ] pending

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
- **Statut** : [ ] pending

### TASK-P1-011 Apple Pay merchant domain association — 6 domaines
- **Priorité** : P1
- **Rôle** : devops_agent
- **Description** : `/.well-known/apple-developer-merchantid-domain-association` 404 sur les 6 domaines. Apple Pay ne fonctionnera pas sans ce fichier. Doit être généré via Apple Developer Console et déployé sur chaque domaine (FTP Namecheap + Cloudflare Pages).
- **Fichiers** : Déployer sur 6 domaines FTP/Pages
- **Estimation** : 1h
- **Statut** : [ ] pending

### TASK-P1-012 Puntacana fiche step fail — fallback click hors bbox
- **Priorité** : P1
- **Rôle** : coding_agent
- **Description** : PC affiche 12 "clean" en UI mais config a 0 clean (tout avoid/moderate) — mismatch UI/data. Fiche step fail car fallback click (195,350) ne touche aucune plage (bbox/center différents). Utilisateur ne peut pas ouvrir fiche depuis carte.
- **Fichiers** : `scripts/ux-audit.mjs` (fallback coords), `src/MapView.jsx` (pin click handler), `regions/puntacana.json` (clean status)
- **Estimation** : 2h
- **Statut** : [ ] pending

---

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
- **Description** : Pins carte = `svg circle` sans attribut `data-beach` → clic programmatique impossible, fallback coordonnées fixes fragile cross-domain (Puntacana fail, RM fail). Ajouter `data-beach` sur pins dans MapView.jsx.
- **Fichiers** : `src/MapView.jsx`
- **Estimation** : 1h
- **Statut** : [ ] pending

### TASK-P2-007 Endpoint /api/b2b-partners.json (MQ) — 404
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : MQ appelle `/api/b2b-partners.json` au chargement → 404. Soit créer l'endpoint (gen-b2b-partners.cjs), soit supprimer l'appel si inutile.
- **Fichiers** : `scripts/automation/gen-b2b-partners.cjs`, `vite.config.js` (copy), `src/Sargasses_PROD.jsx` (fetch)
- **Estimation** : 1h
- **Statut** : [ ] pending

### TASK-P2-008 collect.php GET 405 (RM) — client ne devrait pas GET
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : Client fait GET sur `collect.php` (POST-only analytics first-party) → 405. Corriger client pour POST ou ignorer GET silencieusement côté serveur.
- **Fichiers** : `public/api/collect.php`, `src/Sargasses_PROD.jsx` (analytics sender)
- **Estimation** : 1h
- **Statut** : [ ] pending

### TASK-P2-009 MQ DOMContentLoaded 3072ms — anomalie performance
- **Priorité** : P2
- **Rôle** : coding_agent
- **Description** : MQ DOMContentLoaded 3072ms vs ~380ms autres domaines (8x). Anomalie à investiguer (Vite dev? CDN? Bundle specific?).
- **Fichiers** : `vite.config.js`, `src/Sargasses_PROD.jsx`, build analysis
- **Estimation** : 2h
- **Statut** : [ ] pending

### TASK-P2-010 Declutter labels trop agressif — visibilité étiquettes
- **Priorité** : P2
- **Rôle** : coding_agent + ui-ux_agent
- **Description** : MQ: 4/53 labels visibles, RM: 1/20, PC: 1/12. Utilisateur ne voit quasi aucune étiquette plage. Revoir seuil declutter ou ajouter toggle "Afficher toutes les étiquettes".
- **Fichiers** : `src/MapView.jsx`, `src/app-runtime.css`
- **Estimation** : 2h
- **Statut** : [ ] pending

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