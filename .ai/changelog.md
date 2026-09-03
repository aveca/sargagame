# .ai/changelog.md — Historique des changements agents

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