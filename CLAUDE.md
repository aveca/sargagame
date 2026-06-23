# SARGAGAME — REGLES CLAUDE

## Session Startup

**Raccourci** : `npm run session` → `scripts/cursor-session-startup.cjs` regroupe les checks ci-dessous + load mémoire projet.

Au lancement de chaque session dans ce dossier, exécuter automatiquement (zéro confirmation) :

1. **Pipeline freshness** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const h=(Date.now()-new Date(d.updatedAt))/3.6e6;console.log('Source:',d.source,'| Age:',h.toFixed(1)+'h |',h<12?'OK':'STALE')"
   ```

2. **Métriques business du jour** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const l=d[d.length-1];console.log('Last:',l.date,'| Payments:',l.payments,'| Emails:',l.emails,'| Feedbacks:',l.feedbacks)"
   ```

3. **MRR — source de vérité = Stripe** (bloc `stripe` dans daily-metrics) :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const s=[...d].reverse().find(x=>x.stripe&&x.stripe.active!=null).stripe;console.log('MRR Stripe: €'+s.mrr.eur+' |',s.active,'actifs | pastDue',s.pastDue,'| cancelScheduled',s.cancelScheduled)"
   ```
   ⚠️ Le `payments_real`/`revenue_real` du funnel Apps Script **sous-compte ~7×** (l'event de conversion ne se déclenche pas après redirect Stripe). Ne PAS l'utiliser pour le revenu. Garder le funnel uniquement pour les **taux d'engagement** (modal→CTA, CTA→redirect) :
   ```bash
   curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel" | python -c "import json,sys; d=json.load(sys.stdin); print(f'modal {d[\"rates\"][\"modal_to_cta\"]}% CTA | CTA→redirect {d[\"rates\"][\"cta_to_redirect\"]}% | opens {d[\"premium_modal_open\"]} → cta {d[\"premium_modal_cta\"]}')"
   ```

4. **Workflows GitHub Actions récents** : `gh run list --repo aveca/sargagame --limit 5` (skip si gh non-authed).

5. **Lire la mémoire projet** :
   - `NEXT_SESSION.md` (repo) — **handoff canonique, à lire EN PREMIER** (entrées datées en tête = état le plus récent)
   - `PRODUCT.md` (repo) — **north-star produit** (pivot « Le Veilleur », à lire AVANT tout dev UI)
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_metrics.md` — MRR actuel
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_decisions.md` — funnel snapshot

6. **Auto-trigger si pipeline STALE** (>12h) :
   ```bash
   gh workflow run daily-copernicus.yml --repo aveca/sargagame --ref main
   ```

7. Reporter l'état en 5 lignes max puis attendre les instructions.

## Règles de déploiement

- **Auto-deploy sur push main** : `daily-copernicus.yml` full build quand `github.event_name == 'push'`. Aucun `railway up` nécessaire (ce repo est full-static, pas de Railway).
- **Workflows GitHub Actions autonomes** — ne pas créer de crons Claude dupliqués. **17 workflows** (`.github/workflows/`) couvrent daily data (`daily-copernicus`), briefs (`daily-brief`, `morning-brief`), SEO hebdo (`weekly-seo-automation`, `seo-guard`), optimisation (`weekly-optimize`, `ab-evaluator`), outreach (`weekly-outreach`), UX (`weekly-ux-report`), email (`weekend-email`, `smtp-test`), OG images, provisioning analytics (`provision-ga4`, `provision-gsc`, `ga4-diagnose`), CI (`ci-tests`).
- **Concurrency guard** sur les workflows qui écrivent des JSON générés + `git rebase -X theirs` pour éviter les races.
- **Garde-fous deploy** : EUR/MQ-GP smoke d'abord · `stripe-config.php` jamais committé · SW bump par deploy (`scripts/stamp-sw-hash.cjs`) · **jamais `git add -A` / `git reset --hard` / `git clean`** (sessions Claude concurrentes sur ce repo → toujours committer en pathspec explicite) · Shabbat ven 18h→sam 19h no-deploy.

## Architecture rapide

- **App principale** : `src/Sargasses_PROD.jsx` (~15 500 lignes, monolithe React). **Split = NON** (décision assumée : helpers partagés entremêlés, mauvais ROI, risque funnel).
- **Surfaces produit « Le Veilleur »** (pivot comic-book, cf `PRODUCT.md`) : `src/ChasseHome.jsx` (arène + détail in-world), `src/VeilleurHero.jsx`, `src/ArenaSplash.jsx`, `src/ArenaOnboarding.jsx`, `src/WorldMapView.jsx` (carte golden-hour), `src/PaidOnboarding.jsx`, `src/CleanList.jsx`, `src/Conditions.jsx`, `src/DiveTransition.jsx`, `src/HomeAZ.jsx`, `src/PassOffer.jsx`, `src/BeachDive.jsx`. Styles : `src/Themes.css` + système de classes `.lc-`.
- **Carte** : **Leaflet RETIRÉ** entièrement (flashait au lancement via cache PWA ; `src/MapView.jsx` supprimé, dép désinstallée). La carte d'accueil = `src/WorldMapView.jsx` (monde rasterisé baked + pins SVG vivants).
- **Perf cold-start** : **React → Preact/compat** via `resolve.alias` dans `vite.config.js` (~38 Ko gz économisés). Rollback = retirer le bloc alias (1 ligne). ⚠️ Surveiller MRR post-Preact (Stripe = iframe non touchée par Preact, mais paiement carte réel à vérifier).
- **Pipeline données v3** : `scripts/fetch-sargassum-live.cjs` + `scripts/lib/forecast.cjs` + `scripts/lib/confidence.cjs` (persistance exponentielle, half-life 3,5j). Source = ERDDAP-live, 4×/j. Sortie = `public/api/copernicus/sargassum.json`.
- **Build** : Vite (`npm run build` = `sync-version` + `build-sargassum-json` + `vite build` + `stamp-sw-hash`). **136+ pages plages SEO** générées par `vite.config.js` (3 systèmes d'ids à connaître : slug SEO ≠ id data sargassum.json ≠ beach-id `mqNNN`, table `SARG_TO_BEACH` dans `vite.config.js`).
- **FTP deploy** (les domaines USD/legacy hors auto-deploy GH) : `scripts/prepare-ftp.cjs` → `martinique-ftp/` + `guadeloupe-ftp/` → `scripts/manual-ftp-deploy.cjs` (sessions FTPS fragmentées). Helpers : `npm run martinique`, `npm run ftp-deploy`, `npm run verify-ftp`.
- **Outils perf** (`scripts/perf/`) : `measure-map-paint.cjs` (LA métrique runtime carte), `measure-load.cjs` (cold-load Slow-4G), `measure-bundle.cjs` (tailles gz), `smoke-preact.cjs` (smoke funnel/carte/paywall). ⚠️ Toujours mesurer sur **build prod** (`npx vite build` + `npx vite preview`), JAMAIS `npm run dev` (l'import `.cjs` `coast-zones` casse en ESM dev).
- **Automation** (`scripts/automation/`) : ~90 scripts — métriques (`daily-stats-check`, `daily-metrics.json`), email (couche `lib/email-send.cjs` sur **nodemailer/SMTP** `alerte@sargasses-martinique.com` — Resend RETIRÉ), drip/recovery, ~40 scripts SEO (`seo-*`), outreach B2B/backlinks, A/B eval (`ab-eval.cjs`), Facebook publisher (`fb-*`).
- **Email** : tout part du SMTP de `alerte@` (secret `SMTP_PASS`). Plus de Resend → tracking opens/clicks figé, mais attribution revenu via `stripe.metadata.source` intacte.
- **Domains** : sargasses-martinique.com, sargasses-guadeloupe.com (auto-deploy GH) ; régions USD/ES (Florida/Cancún/Punta Cana) via FTP, domaines Namecheap.
- **Repo** : aveca/sargagame (public, minutes illimitées GH Actions).

## Vérification avant merge (NON négociable)

- App buildée : `npx vite build` → sert `dist/` (`npx vite preview --port 4173`) ; le dev server ne tourne PAS pour cette app.
- Smoke runtime : `node scripts/ux-smoke.mjs` (attrape les TDZ que le build seul rate · boutons blancs = 0).
- Funnel P0 INTACT (tap pin → fiche · paywall → Stripe) à chaque touche du monolithe.

## État business au 2026-06-23

- **MRR** : €79,84/mois (16 abonnés actifs × 4,99 — source Stripe, daily-metrics) · pastDue 1 · cancelScheduled 0.
- **Leads** : ~232 emails captés.
- **Bottleneck #1** : conversion **modal→CTA ~2%** (structurellement non concluable à ~1444 sessions/mois — ~150k/bras requis). Levier = produit/copy/offre + SEO volume + capture email + B2B, PAS un Nᵉ test paywall.
- **Pivot produit « Le Veilleur »** (depuis 19/06) : monde comic-book animé (Spider-Verse / aberration chromatique steppée), accueil = arène « La Chasse » + détail plage in-world, paywall `ComicPaywall` promu défaut (`?pwcomic=0` rollback). Backlog écrans = `SCREENS_V2.md` (prendre le prochain `[ ]`, 1 écran = 1 session fraîche). Garde-fous = `AUTONOMOUS_BUILD.md` (Stripe jamais touché, additif/réversible, escalader les gros refactors).
- **A/B** : ~25 flags conversion tournent, quasi tous non-sig. à ce traffic → discipline anti-dilution, **récolter** plutôt que lancer. Réf : mémoire `reference_ab_tests`.
- **Pipeline** : ERDDAP-live, 4×/j, stable. Gardes anti fausse-carte-verte câblées en CI.

## Docs de référence dans le repo

- `NEXT_SESSION.md` — handoff canonique (le plus à jour).
- `PRODUCT.md` — north-star produit (pivot Veilleur, §4 tokens design, §8 inventaire écrans).
- `SCREENS_V2.md` — backlog des écrans de la maquette ARENA v2.
- `AUTONOMOUS_BUILD.md` — garde-fous du build autonome.
- `NIGHTLY_SWEEP.md` / `NIGHT_LOG.md` — ledgers des passes nocturnes.
- `DEPLOI-FTP.md` / `DEPLOY-GUIDE.md` — procédures de déploiement.

Pour les opérations détaillées (deploy manuel, A/B eval, backtest forecast, stats), invoquer le skill `sargasses`.
