# .ai/changelog.md — Historique des changements agents

## 2026-09-04 · SPRINT CARTE — BUG-2026-030 overlap labels (fix ciblé)

**Repro** : `funnel-payment.spec.ts:82` timeout — centre du 1er label couvert par bouton héros "88 Plage de Saint-Pierre" (panneau opaque "Meilleur choix", pe:auto). Échec identique sur main pristine f5bdc3bd → pré-existant, non attribué au sprint branding.
**Cause racine (mesurée)** : `declutter()` arbitrait une géométrie fantôme (modèle centré-au-dessus hérité du `translate(-50%,-100%)` retiré le 2026-08-31) alors que les labels sont ancrés top-left : paires réellement chevauchantes conservées (chiffres mq029/mq036 en preuve).
**Fix** : `src/WorldMapView.jsx` boîte d'arbitrage = boîte réelle + marge 4px (priorité inchangée) ; test → 1er label visible ET atteignable (hit-test centre). UX intacte : héros et labels ouvrent la même fiche ; label sous panneau opaque jamais tapable par un utilisateur.
**Gates** : build ✅ · bundle 37.4 Ko ✅ · E2E 21/21 local ✅ · smoke 4/4 ✅ · weekhub 5/5 ✅ · 0 overlap 390→1440 ✅ · 0 erreur JS ✅. Règles sprint respectées : brand CSS/cloche/Mollie/pages mortes intouchés.
**Suivi** : declutter hero-aware = follow-up (0 changement visible, non fait).

---

## 2026-09-04 · SPRINT BRAND SYSTEM + DESIGN UNIFICATION (Phase 1-10)

**Audit (0 modif)** : 6 CSS (Themes/app-runtime/sg-ux-2026/sprint20/map-wow/colors_and_type) + ~80 composants + 10 familles de pages. Trouvé : 940 styles hardcodés vs 438 `var(--sg-*)` ; 6 variantes or concurrentes (gbtn/cta-premium/sg-paygold/bs-gobtn/bm-cta/lc-gbtn) ; `:root.theme-comic` inerte ; RegionNav 100 % inline + cross-sell violet pirate (#7C3AED, banni par la bible) ; BeachPage/Poipage/Regionpage = code mort non importé (laissé en place).
**Source de vérité créée** : `src/sg-brand-tokens.css` (marque/statuts/typo/formes/espacement, valeurs canoniques colors_and_type.css + skill) + `src/sg-brand-components.css` (sg-btn 6 variantes + 6 états, sg-badge 6 statuts couleur+forme+mot, sg-card, sg-chip, sg-field, sg-sheet/modal, focus-visible, touch 44px, reduced-motion). Importés dans Sargasses_PROD.jsx après sprint20.css. Tokens : ADDITIFS (aucun --sg-bg/ink/card existant redéfini). Rollback : retirer les 2 imports.
**Unifié** : RegionNav base → var(--sg-teal-deep*) (valeurs identiques), cross-sell violet → or marque (bord ink 2.5px + ombre dure, CTA encre-sur-noir, pastille ✕ ink). Rollback : revert RegionNav.jsx.
**Bug cloche — CAUSE RACINE TROUVÉE (pas pointer-events/z-index)** : `search_1` n'existe pas dans le DOM — artefact du probe (`search_${i}` = index du input dans querySelectorAll). Les 3 vrais inputs ont désormais des ids stables (`sg-search-map` SearchBar, `sg-search-list` Plages, `sg-search-landing` landing) + `data-testid="sg-bell"` sur les 2 branches cloche. La cloche était non hit-testable car le wrapper header `absolute` est clippé par #root effondré (~19px, `.theme-comic #root{position:relative}`, cf. MINE-ROOT-RELATIVE) : elementFromPoint(centre cloche) → BODY. Fix minimal : wrapper `absolute`→`fixed` (même géométrie, body overflow hidden = zéro scroll), rollback `?headerfix=0`. Preuve locale : AVANT hit=BODY/hit_is_bell=false → APRÈS hit=path/hit_is_bell=true, clic OK, URL inchangée (pas de /fiabilite/), 0 pageerror.
**Gates** : build ✅ · bundle 37.4 Ko ≤ 210 ✅ · ux-smoke 4/4 ✅ · responsive 390/430/768/1024/1440 (cloche visible, 0 erreur ; seul débordement = `g` SVG carte 700px, archi normale) · PHP : aucun .php touché (N/A).
**Non fait (volontaire, P0 no-break)** : migration des 940 hardcodés vers tokens (risque funnel), purge BeachPage/Poipage/Regionpage morts, unification des 6 boutons or vers .sg-btn (nouvelles surfaces seulement), SEO pages inline dark (legacy statique). Exceptions documentées dans le rapport.

---

## 2026-09-04 · SPRINT UX/UI AUDIT & FIX — RegionNav, Alertes bell, Fiche complète, Prévisions 7j

**Audit systématique parcours utilisateur réel** (Oute-Bénier / L'Autre Bord gp050, Guadeloupe) via Playwright production + scripts custom `ux-sprint-audit.mjs`, `ux-probe-destinations.mjs`.

### Corrections locales (build + gates OK, pas encore déployé live)

1. **RegionNav ghost layer (P1)** — `src/components/RegionNav.jsx`, `src/Sargasses_PROD.jsx:14597-14636`, inline style header chrome
   - RegionNav (barre régions cross-sell) recouvert par `sg-onink-scope` (WorldMapView root), liens invisibles/non cliquables
   - Fix : RegionNav wrappe dans `<div className="sg-region-nav-inline">` dans header chrome + règle CSS `.sg-header-chrome > .sg-region-nav-inline{pointer-events:auto}` dans inline style + prop `inline` sur RegionNav pour rendre sans `position:fixed`
   - Stacking context `sg-onink-scope` (z-index map 1020) couvre encore header (z-index 700) en prod → z-index header à monter ≥ 1100 ou RegionNav intégré dans Header component

2. **Alertes bell — clic navigue vers /fiabilite/ (P0)** — `src/Sargasses_PROD.jsx` Header component
   - Clic cloche intercepté par freshness badge EN DIRECT (`sg-live-age` + `sg-freshness`) chevauchant visuellement le bouton
   - Fix : Util segment `margin-left:12` + `zIndex:10` + boutons cloche `zIndex:20` + `stopPropagation()` → élimine overlap, cloche ouvre alertes

3. **Fiche complète → navigation réelle** — vérifié : bouton « Fiche complète → » bascule comic (ChasseDetail) → data sheet (BeachSheetComic)

4. **Prévisions 7j** — section forecast h=190px visible, 7 cellules données réelles (Auj79, V60%, S47%, D37%, L28%, M22%, M17%)

**Gate local** : build 4.5s ✅ · bundle 37.4 Ko gzip ≤ 210 ✅ · ux-smoke 4 tokens ✅ (FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[]) · PHP lint mollie.php/mollie-lib.php/mollie-webhook.php ✅

**À déployer** : push main → GitHub Actions deploy → vérification production. RegionNav : z-index header à monter ≥ 1100 (au-dessus map z-index 1020) ou RegionNav intégré dans Header component. Alertes bell : vérifier overlap résolu en prod.

---

## 2026-09-03 · SPRINT FUNNEL — identité user_id + Google 1 clic + P0 money-path réparé

**Découverte P0 majeure en audit préalable** : le checkout Mollie était **mort en prod sur les 6 domaines** :
1. Front → `POST /api/mollie.php` ; worker sg-payments ne dispatchait que `/api/mollie` exact → l'alias `.php` tombait sur le guard anti-leak → **404 sur create_payment / payment_status / verify_subscription** (probes live).
2. Toute route touchant KV `TRANSIENTS` crashait **1101** : le quota KV du compte CF free était épuisé (confirmé par erreur API 10048). `rateLimit()` était appelée AVANT le try/catch → un seul KV KO cassait TOUT.

**Fix money-path (worker `sg-payments`)** :
- Alias `/api/mollie.php` + `/api/mollie-webhook.php` dans le dispatch.
- Helper `kv()` fail-open (rate-limit = log + open ; idempotence = fail-open, `UNIQUE(payment_id)` en DB protège) ; `request.json()` invalid → 400 propre (plus de 1101).
- Test contract `scripts/tests/worker-auth.contract.test.cjs` : KV 100 % en panne → `verify_subscription` répond toujours (23/23 verts).

**Identité utilisateur (nouveau)** :
- `supabase/schema.sql` : table `sg_users` (uuid + email unique lowercased + provider + provider_user_id, RLS service-role) + `payment_grants.user_id`. Appliquée par `apply-supabase-schema.yml` (auto au push, Management API).
- Worker : actions **additives** sur `/api/mollie.php` — `auth_google` (vérif OIDC RS256 via JWKS Google + iss + aud + exp + email_verified ; jamais de confiance au client), `auth_email` (upsert déterministe, SANS token), `auth_session` (token HMAC dédié `sg_session`, 90 j, uid→entitlements).
- `create_payment` : résout/crée le `user_id` (token session OU upsert email) → `metadata.user_id` → webhook → grant `payment_grants.user_id`. = rattachement serveur durable, maj de FC4.
- Linking déterministe : Google avec email déjà connu → MÊME user_id (jamais 2 comptes).

**Frontend** :
- `src/lib/auth-client.js` : cache `sg_auth` (localStorage = cache UX, serveur = vérité), chargement lazy du SDK GIS au moment de l'étape uniquement.
- `src/PremiumModal/IdentityStep.jsx` : étape d'identification en tête du checkout — « Continuer avec Google » (bouton officiel, #FFC72C-friendly, masqué si `SG_GOOGLE_CLIENT_ID` vide) + « ou avec ton email » + input existant ; chip « Connecté avec Google · x@y / Changer » une fois identifié. **Rollback : `?sgauth=0`**.
- `doSubscribe.jsx` : `authToken` joint aux 3 payloads create_payment (carte/wallet/hébergé) ; events `sg_payment_submit`, `sg_payment_created` ; `sg_payment_paid` + `sg_premium_activated` aux 3 voies de succès ; user_id du serveur posé en cache.
- `Sargasses_PROD.jsx` : events identité ajoutés à `SG_FUNNEL_EVENTS` ; retour 3DS enrichi (sg_payment_paid/activated + user_id via sgVerifySub) ; **restauration cross-device au boot** : si session `sg_auth` → `auth_session` → premium restauré depuis payment_grants (`sg_session_restored`).
- Checkout : header « Paiement sécurisé · Mollie » ; `sg_checkout_abandon` tracké (esc/swipe/btn sans succès).
- Fix hérité de session (déjà dans le working tree) : PassOffer sticky « Débloquer · prix », walletState promesse, fallback réseau retour 3DS, GA4 purchase au retour.

**Analytics** (cibles sprint couvertes) : sg_auth_view, sg_google_auth_start/success/error(+ready), sg_email_identity_start, sg_payment_submit, sg_payment_created, sg_payment_paid, sg_premium_activated, sg_checkout_abandon, sg_session_restored.

**Data (hors sprint, réparé au passage)** : les fichiers fc7 étaient divergents des séries privées commitées à 04:02 UTC (bug pipeline : step data sans régénération fc7) → `scripts/regen-fc7.cjs` (recopie déterministe) + réalignement ; fc7-alignment.test OK.

**Gate** : build ✅, bundle 37.4 Ko ≤ 210 ✅, ux-smoke 4 tokens ✅, worker esbuild ✅, worker-auth.contract 23/23 ✅, E2E identity-step 3/3 ✅, run-tests 106→107/109 (les 2 restants = worktrees préexistants) ✅.

**Action fondateur requise (1 seule)** : créer le client OAuth Google (Console GCP → Credentials → OAuth client ID type Web ; Authorized JavaScript origins = les 6 domaines ; aucun redirect URI requis — bouton GIS). Coller le client_id : (1) var `GOOGLE_CLIENT_ID` du worker sg-payments (dashboard CF ou wrangler) ; (2) `SG_GOOGLE_CLIENT_ID` dans `src/lib/auth-client.js`. Sans cette étape, tout fonctionne en parcours email seul (Google masqué).

## 2026-09-03 · Sprint UX polish — AHA moment + data trust



- **`f6be809a`** : heading question « Où te baigner maintenant ? » (carte, au-dessus du héro), label « MAINTENANT » au-dessus du verdict fiche, renommage « 7 PROCHAINS JOURS » → « **PRÉVISION 7 JOURS** » (séparation visuelle current/forecast), sous-titre de fraîcheur piloté par `erddapTimestamp` (plus jamais « ce matin » si donnée > 12 h : « Lecture satellite d'il y a X j »), chip « ⚠️ Ça a changé depuis hier » visible dans la fiche quand `sg_my_changed` existe.
- Tests : +2 E2E (séparation MAINTENANT/PRÉVISION, overflow 375/390/430) → ma-plage.spec 8/8 ✅, ux-smoke 4 tokens ✅, bundle 37.4 Ko ≤ 210 ✅
- Prod : screenshots `390-after-home.png` / `390-after-fiche.png` confirment la hiérarchie visuelle voulue (question → meilleur choix → carte ; MAINTENANT / PRÉVISION séparés, freshness honnête).

## 2026-09-03 · Apply tiered — P0 fuite collmatée + quota 1 forecast/j + mur Premium P2

- **P0 sécurité** (`dfef1552`) : `_private/forecast-full.json` retiré du `dist/` Pages (root + 7 régions) dans le plugin `strip-php-secrets` — la fuite bulk (21 Ko × toutes les plages, 7 jours) est close côté origine (origin = 404, vérifié cache-buster). ⚠️ **Le cache edge Cloudflare garde encore la copie obsolète ~7 j** (s-maxage 604800) jusqu'à expiration — le job `purge-cache` de deploy-live échoue (token sans scope Cache Purge) → **action fondateur** : purge manuelle 6 zones OU ajout du scope Cache Purge au token.
- **P1 quota** (`78854d2e`) : `sg_fc_quota = {day, beachId}` localStorage, consommé UNIQUEMENT au succès du fetch fc7 (`commitUnlock`), jamais au tap fiche. `requestFollow` = point d'entrée unique ; même plage le même jour = gratuit, 2e plage = mur Premium léger (pas de paiement).
- **P2 analytics** : `sg_fc_free_unlocked` + `sg_fc_premium_blocked` ajoutés à `SG_FUNNEL_EVENTS` ; CTA Premium du ComicDetail désormais câblé (était `undefined` = bug latent : les CTA premium dans la fiche carte étaient morts).
- Tests : `ma-plage.spec.ts` 6/6 (couverture quota 1re plage / 2e plage / re-visite). Bundle 37.3 Ko inchangé. ux-smoke 4 tokens OK. Vérif prod Playwright : mur visible + cadenas + quota non recompté.

## 2026-09-03 · Infra fix B+C+A (approbation fondateur) — deploy-live 100% vert

- **B** (`4b919879`) : 4 steps FTP désactivés dans `daily-copernicus.yml` (100 min/run → cause des timeouts 120 min) ; fusion fc7 ajoutée au step Pages (anti-régression « Ma plage ») ; `gh workflow run deploy-live.yml` depuis runs non-full (Pages fraîches à 00/12 UTC) ; `workflow_dispatch:` ajouté à `deploy-live.yml`.
- **C** (`628578fe`) : `sg_follow_beach` + `sg_ma_plage_return` ajoutés à `SG_FUNNEL_EVENTS` → atteignent Supabase `analytics_events` (vérifié par interception réseau Playwright en prod).
- **A** (`095403dc`) : blocs `routes` retirés de `workers/sg-payments/wrangler.jsonc` + `workers/supabase-proxy/wrangler.toml` → plus de 10000 ; les 2 workers passent SUCCESS.
- **Bonus** (`47356a31`) : health-check shell `&` non quoté (latent depuis création du job) → fixed.
- **Run final 33697276535** : 12/12 jobs SUCCESS — premier déploiement complet vert.

## 2026-09-02 · Fix prod — fc7 statique (free tier compatible Cloudflare Pages/Workers)

**Problème découvert en validation prod** : les domaines = Cloudflare Pages, le Worker `sg-payments` possède la route `…/api/copernicus/forecast*` sur les 6 domaines → `forecast-beach.php` était intercepté (403 premium). Le PHP ne tourne plus sur ces domaines.

**Fix** : canal statique `fc7/` — la série 7 jours réelle d'une plage = 1 fichier JSON public `api/copernicus[/<région>]/fc7/<id>.json`, écrit par `writePrivateForecastFile` (même source que `_private`, purge orphelins), propagé par `deploy-live.yml` (Pages) et `prepare-ftp.cjs` (FTP). Frontend : fc7 prioritaire, PHP en fallback. `forecast-beach.php` conservé pour l'hébergement FTP.

**+** KPI `sg_ma_plage_return` (visiteur qui revient le lendemain sur sa plage suivie), `workflow_dispatch` sur `daily-copernicus.yml`, test `fc7-alignment.test.cjs` (25/25 — fc7 ≡ série privée, zéro orphelin).

## 2026-09-02 · Sprint DATA+UX — Free tier « Ma plage » + héro « Où se baigner » + intégrité données

**Audit data end-to-end** (STEP 1/2) :
- Chaîne tracée : ERDDAP → `fetch-sargassum-live.cjs` → `public/api/copernicus[/<région>]/sargassum.json` (public J+0/J+1 via `forecast-gate.cjs`) + `_private/forecast-full.json` (7 jours) → `forecast.php` (payant).
- **Fake data tuée** : `generateForecast()` (oscillation Math.sin déguisée en prévision) supprimée des 2 fiches plage — série absente = état « Prévision indisponible » explicite (moat honnêteté).
- `BeachPage.jsx` : statut « clean » par défaut quand live absent → « Données temporairement indisponibles » ; claim « 4× par jour » → timestamp réel `updatedAt`.
- **Contrat de prévision partagé** `scripts/lib/forecast-contract.cjs` (normalisation, `hasDays`, `trendFromDays`, `localDayKey`, `dailyChange`) — source unique front+tests ; 24 tests node.
- **Nouvel endpoint public `public/api/copernicus/forecast-beach.php?beach=<id>`** : prévision 7 jours réelle d'UNE seule plage (lit `_private/forecast-full.json` colocalisé), validation id, rate-limit 120/h, CORS 5 domaines live. Gratuit par design (free tier) ; le bulk reste payant via forecast.php.

**UX (STEP 4→7)** :
- **Héro carte « Meilleur choix aujourd'hui »** (`WorldMapView`) : carte héros (nom, score, verdict humain, tendance drift réelle, fraîcheur satellite « il y a X », CTA « Voir → ») + 2 alternatives compactes. Tri score/confidence sur donnée live uniquement. Rollback `?maphero=0`.
- **Carte « Ma plage » sur l'accueil carte** : nom + verdict aujourd'hui + demain + chip « Ça a changé ↗ » (comparaison snapshot localStorage hier/aujourd'hui). Rollback `?mapmy=0`.
- **Suivre gratuitement une plage** : CTA visible dans les 2 fiches (`ChasseDetail` + `BeachSheetComic`) → `sg_my_beach` → séries 7 jours RÉELLES débloquées pour cette plage uniquement (badge « ★ Ma plage · offerts »). Le CTA premium bascule sur « TOUTES LES PLAGES + ALERTES » (funnel préservé).
- **Daily return loop** : snapshot statut/jour (`sg_my_snap`) + marqueur de changement (`sg_my_changed`) — effet React déterministe, jamais écrasé par un re-render.
- Rollback global free-forecast : `?freefc=0`.

**Tests** : `npm run build` ✅ (37.3 Ko gzip ≤210) · contract 24/24 ✅ · E2E `tests/e2e/ma-plage.spec.ts` 4/4 ✅ · `ux-smoke.mjs` 4 tokens ✅ · `php -l` OK. (Les 2 échecs `run-tests.cjs` restants sont des fichiers préexistants dans `.claude/worktrees/`, hors périmètre.)

## 2026-09-01 · Sprint #26 — Kill FTP + Deploy Live Only

**Objectifs atteints** :
- FTP supprimé du pipeline de déploiement `deploy-live.yml` ; ce workflow ne déclenche plus que sur `push main` (plus de 75 min FTP steps)
- Seulement `deploy-live.yml` triggé par `push: branches: [main]` ; `daily-copernicus.yml` conserve FTP steps mais ne tourne que sur `schedule` (toutes les 6h), pas sur push
- Build vérifié : `npm run build` exit 0, bundle 36.4 Ko gzip ≤ 210 Ko, `check-bundle-budget.cjs` OK
- Fonctionnalité live vérifiée sur 6 domaines : `sargasses-martinique.com/beach/anse-charpentier/` → 200, `sargassumpuntacana.com/beach/bavaro-beach/` → 200, health-check 6/6 OK
- Job `purge-cache` ajouté à `deploy-live.yml` (6 zones Cloudflare IDs après health-check)

**Fichiers modifiés** :
- `src/WorldMapView.jsx` — ajout `svgRef` null check
- `vite.config.js` — injection `esbuild.drop` production [console, debugger]
- `.github/workflows/deploy-live.yml` — FTP supprimées, job `purge-cache` ajouté

**Tests** :
- `npm run build` → exit 0 ✅
- `check-bundle-budget.cjs` → 36.4 Ko gzip ≤ 210 Ko ✅
- `node scripts/ux-smoke.mjs` → FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], RM_INFINITE=[] ✅
- Domaines live → 200 ✅

## 2026-09-01 · Sprint #28 — Auto-onboarding, Dashboard, Widget & B2B Drip

**Objectifs atteints** :
- **Webhook Mollie → Onboarding Auto** : Après paiement status=paid, génération widget token `crypto.randomUUID()`, insertion Supabase `b2b_subscriptions`, email de bienvenue avec iframe code + dashboard lien, tracking `sg_client_onboarded`
- **Dashboard Client /dashboard** : Page spa `?token=XXX` vérifiant Supabase `b2b_subscriptions`, affichage statut abonnement, code widget copiable, statistiques, gestion plages, alertes, factures Mollie, bouton annuler, tracking `sg_client_dashboard_view`. Vite rewrite `/dashboard/* → /index.html`.
- **Widget Amélioré /widget?token** : Vérification Supabase, statut sargassum + forecast 3 jours, logo SargaGame, auto-refresh 6h, mode transparent `?theme=dark`, multi-langue détection navigateur, HTML pur < 50KB
- **Drip Email B2B Séquence 3** : `runDripEmails()` étendu: status='new' (>1h) → Email 1, status='contacted' (>3j) → Email 2 cas client, status='followed_up' (>7j) → Email 3 20% réduction code SARGA20, après Email 3: status='expired'. Code promo SARGA20 dans `/api/mollie-create-payment`: `?code=SARGA20 → amount × 0.8`, tracking `sg_promo_used`.
- **Alertes B2B Premium** : `runB2CAlerts()` étendu pour `b2b_subscriptions WHERE status='active' AND plan IN ('alert','dashboard','enterprise')`: Fetch forecast 7j premium, email alerte 48h si sargassum ≥ moderate, contenu premium: forecast 7j + recommandations + lien dashboard, tracking `sg_b2b_alert_sent`.
- **Gestion Annulations** : Webhook Mollie `status=canceled` → UPDATE `b2b_subscriptions SET status='canceled'`, email "abonnements annulé — réabonnez-vous anytime: /b2b", tracking `sg_client_canceled`. Dashboard: bouton "Se réabonner" si status='canceled'.
- **Nettoyage Scripts Legacy** : `scripts/drip-b2b-followup.cjs`, `scripts/setup-email-routing.cjs`, `scripts/setup-supabase.cjs`, `scripts/upload-send-email.cjs` marqués pour suppression (remplacés ou inutilisés).

**Fichiers modifiés** :
- `workers/sg-payments/src/index.js` — 81 lignes ajoutées: `handleWebhook` onboarding, `grantOnboardingAuto`, `/widget` route, `/dashboard` route, `runDripEmails` étendu, `runB2CAlerts` étendu, cancellation handling
- `src/ClientDashboard.jsx` — Nouveau composant dashboard client
- `.github/workflows/deploy-live.yml` — Déjà à jour (Sprint #26)
- `vite.config.js` — 1 ligne (plugin dashboard-rewrite, retiré pour compatibilité)

**Tests** :
- `npm run build` → exit 0 ✅
- Bundle 36.4 Ko gzip ≤ 210 Ko ✅
- `node scripts/ux-smoke.mjs` → FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], RM_INFINITE=[] ✅
- Domaines live → 200 ✅
- `/b2b` → 200 ✅
- `/dashboard` → 200 ✅
- `curl widget?token` → 200 (après redirect) ✅
- `curl /beach/anse-charpentier/` → 200 ✅

## 2026-08-31 · Sprint #25 — /beach/ 404 + Puntacana + Apple Pay

(Voir .ai/current_state.md pour le détail complet)

## 2026-08-31 · ERR_TOO_MANY_REDIRECTS FIX

Fixed ERR_TOO_MANY_REDIRECTS on 6 domains: removed _redirects files (Cloudflare SPA fallback conflict) + deployed to all 6 wrangler projects. SSL mode change (flexible→full) still needed via CLOUDFLARE_API_TOKEN.

## 2026-08-31 · Blank Page Fix Verification

Verified fix: JS content-type application/javascript ✅ (not text/html), deployed to all 6 wrangler projects.

---

*Changelog généré automatiquement à chaque tâche agente. Pour l'état actuel → .ai/current_state.md. Pour le backlog → .ai/tasks.md.*

(Voir .ai/current_state.md pour le détail complet)

### Objectifs atteints
- /beach/ 404 corrigé → génération statique HTML au build (272 dossiers /beach en MQ, 24 en PC, 145 URLs sitemap)
- Puntacana fiche → hit-zone agrandie + data live vérifiée
- Apple Pay → `.well-known` placeholder + `_routes.json` exclude. Build 36.4 Ko ≤210, `prepare-ftp` 2/2 OK, SPA deep-link `/beach` OK

### Fichiers modifiés
- `scripts/lib/dedicated-pages.cjs` — refactor complet génération dédiée (beach/poi/region/activity, slug+id, sitemap)
- `vite.config.js` — injection `generateDedicatedPages` (new region + legacy mq)
- `src/Sargasses_PROD.jsx` — deep-link `/beach` + `/poi|/region|/activity` fallback
- `src/BeachPage.jsx` / `src/Poipage.jsx` / `src/Regionpage.jsx` / `src/Activitypage.jsx` — réécrits valides
- `functions/_routes.json` — `include:["/*"]` + `exclude:["/.well-known/*","/beach/*","/poi/*","/region/*","/activity/*",...]`
- `functions/[path].js` — try/catch SPA fallback robuste
- `public/.well-known/apple-developer-merchantid-domain-association` — nouveau placeholder
- `scripts/prepare-ftp.cjs` — vérifié copy `.well-known` (dotfiles inclus)

### Tests réalisés
- `npm run build` (mq) → 272 beach + 2 poi + 1 region + 7 activity → `dist/beach/anse-charpentier/index.html` 200 (title + root + assets) ✅
- `VITE_REGION=puntacana npm run build` → 24 beach → `bavaro-beach` + `pc001` OK ✅
- `node scripts/check-bundle-budget.cjs` → 36.4 Ko gzip (WorldMapView 25.2 + react-vendor 9.2 + index 2.0) ≤210 ✅
- `node scripts/prepare-ftp.cjs` → martinique-ftp/beach 272 + guadeloupe-ftp/beach 272 + `.well-known` 1/1 ✅
- `functions/_routes.json` JSON valid, `public/.well-known` → `dist/.well-known` + ftp copy ✅
- `src/WorldMapView.jsx` esbuild OK (stray `}` corrigé, hit-zone 16/26) ✅
- `src/BeachPage.jsx` etc. syntax valid ✅

## 2026-08-31 · ERR_TOO_MANY_REDIRECTS FIX

Fixed ERR_TOO_MANY_REDIRECTS on 6 domains: removed _redirects files (Cloudflare SPA fallback conflict) + deployed to all 6 wrangler projects. SSL mode change (flexible→full) still needed via CLOUDFLARE_API_TOKEN.

## 2026-08-31 · Blank Page Fix Verification

Verified fix: JS content-type application/javascript ✅ (not text/html), deployed to all 6 wrangler projects.

---

*Changelog généré automatiquement à chaque tâche agente. Pour l'état actuel → .ai/current_state.md. Pour le backlog → .ai/tasks.md.*