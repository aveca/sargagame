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
   - `NEXT_SESSION.md` (repo) — handoff canonique
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_metrics.md` — MRR actuel
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_decisions.md` — funnel snapshot

6. **Auto-trigger si pipeline STALE** (>12h) :
   ```bash
   gh workflow run daily-copernicus.yml --repo aveca/sargagame --ref main
   ```

7. Reporter l'état en 5 lignes max puis attendre les instructions.

## Règles de déploiement

- **Auto-deploy sur push main** : `daily-copernicus.yml` full build quand `github.event_name == 'push'`. Aucun `railway up` nécessaire (ce repo est full-static, pas de Railway).
- **Workflows GitHub Actions autonomes** — ne pas créer de crons Claude dupliqués. Les 9 workflows couvrent daily data, SEO hebdo, content gen, email drip, UX reports.
- **Concurrency guard** sur 4 workflows (daily-copernicus, content-generation, weekly-optimize, weekly-seo-automation) + `git rebase -X theirs` pour éviter les races sur les JSON générés.

## Architecture rapide

- **App principale** : `Sargasses_PROD.jsx` (~5 300 lignes, React + Leaflet lazy-loaded via `src/MapView.jsx`)
- **Pipeline v3** : `scripts/fetch-sargassum-live.cjs` + `scripts/lib/forecast.cjs` + `scripts/lib/confidence.cjs` (persistance exponentielle, half-life 3,5j)
- **Build** : Vite, 136+ pages plages SEO-générées par `vite.config.js`
- **FTP deploy** : `scripts/prepare-ftp.cjs` → `martinique-ftp/` + `guadeloupe-ftp/` → `scripts/manual-ftp-deploy.cjs` (sessions FTPS fragmentées)
- **Domains** : sargasses-martinique.com, sargasses-guadeloupe.com
- **Trust page** : `/a-propos/` (shipped 2026-04-17, standalone HTML + colors_and_type.css)
- **Repo** : aveca/sargagame (public, minutes illimitées GH Actions)

## État business au 2026-06-17

- **MRR** : €74,85/mois (15 abonnés actifs × 4,99 — source Stripe, daily-metrics) · pastDue 0
- **Leads** : ~213 emails captés
- **Bottleneck #1** : modal→CTA bloqué à **2%** (3 388 opens → 74 CTA) depuis ≥5 jours. CTA→redirect sain (97%). Levier prioritaire = le modal lui-même (offre/copy/anchoring), pas les bords du funnel.
- **A/B tests live** : `pw_cta_order` (control/sample_first) + `pw_prelude` (direct/prelude) — mesure 4-8 semaines
- **Pipeline** : ERDDAP-live, 4×/j, stable

Pour les opérations détaillées (deploy manuel, A/B eval, backtest forecast, stats), invoquer le skill `sargasses`.
