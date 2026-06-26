# SARGAGAME — REGLES CLAUDE

## Session Startup

**Raccourci** : `npm run session` → `scripts/cursor-session-startup.cjs` regroupe les checks ci-dessous + load mémoire projet.

Au lancement de chaque session dans ce dossier, exécuter automatiquement (zéro confirmation) :

1. **Pipeline freshness** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const run=(Date.now()-new Date(d.updatedAt))/3.6e6;const sat=d.erddapTimestamp?(Date.now()-new Date(d.erddapTimestamp).getTime())/3.6e6:null;console.log('Source:',d.source,'| run:',run.toFixed(1)+'h',run<12?'OK':'STALE','| satellite:',sat?sat.toFixed(1)+'h':'n/a',(d.stale||(sat&&sat>=36))?'STALE':'OK')"
   ```
   > `run` = âge du dernier passage pipeline (re-run le corrige). `satellite` = âge réel du composite ERDDAP (`erddapTimestamp`/flag `stale`, seuil 36h) — si STALE, ERDDAP est en retard et un re-run NE corrige PAS.

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

- **App principale** : `Sargasses_PROD.jsx` (~16k lignes, React, carte SVG `WorldMapView`/`ArchipelView`). **Perf 26/06 (soir)** : paywall extrait en chunk LAZY → `src/PremiumModal.jsx` (PremiumModal+World/Comic/B2B, deps via **exports nommés** de Sargasses_PROD, `lazyWithRetry`) ; CSS applicatif sorti du bundle JS → `src/app-runtime.css` (import statique, appliqué AVANT mount) ; scènes hors first-paint en lazy (ArenaSplash/Onboarding/VeilleurHero/DiveTransition) ; **squelette UI réel** inline (`index.html` + template GP de `prepare-ftp.cjs`). **BottomNav (Carte/Liste/Premium) RETIRÉE** (nav = carte ; Premium via dock « Veilleur »/CTA). Entry JS **~169 Ko gzip (−26 %)**. **Crop bas standalone iOS (nuit 26/06)** : `#root` doit être `top/right/bottom/left:0` SANS `width/height:100%` (sinon `height` écrase `bottom:0` → bande vide ; cf. `index.html`+`app-runtime.css`+GP template). **Note sargasses (`BeachReport`) sur la preview comic** : passée en prop `ReportComp` (Sargasses_PROD→ComicDetail→ChasseDetail) pour éviter l'import circulaire. **Cloche notif** 🔔 dans le Header (`onEnableNotif`→`requestPermission`).
- **Pipeline v3** : `scripts/fetch-sargassum-live.cjs` + `scripts/lib/forecast.cjs` + `scripts/lib/confidence.cjs` (persistance exponentielle, half-life 5,0j — backtest 3,5/4/5/6 = 75% identique, donc valeur libre, on garde 5,0)
- **Build** : Vite, 136+ pages plages SEO-générées par `vite.config.js`
- **FTP deploy** : `scripts/prepare-ftp.cjs` → `martinique-ftp/` + `guadeloupe-ftp/` → `scripts/manual-ftp-deploy.cjs` (sessions FTPS fragmentées)
- **Domains** : sargasses-martinique.com, sargasses-guadeloupe.com
- **Trust page** : `/a-propos/` (shipped 2026-04-17, standalone HTML + colors_and_type.css)
- **Repo** : aveca/sargagame (public, minutes illimitées GH Actions)

## État business au 2026-06-26 (nuit)

- **Modèle = PASS-ONLY** (paiement UNIQUE, plus d'abonnement) via **Mollie on-site PARTOUT** (carte Components + Apple Pay natif). EUR : 7,99/14,99/24,99 € · USD : $5.99/$11.99/$19.99. Mollie encaisse l'USD et règle en EUR (FX Mollie).
- **GO-LIVE paiements réels** : EUR (MQ/GP) 25/06 · **USD (Floride/Punta Cana/Cancún) 26/06** (validé par un vrai paiement $5.99). Barbados = reste en capture (pas câblé Mollie). Stripe = NE sert plus de caisse (16 abos EUR legacy continuent d'y facturer ; ses liens USD sont DÉSACTIVÉS — ne jamais y renvoyer un CTA).
- **MRR** : €79,84/mois (16 abonnés Stripe legacy — source de vérité Stripe/daily-metrics) · pastDue 1 (dunning auto `--send` actif). Premières conversions pass/USD à suivre (dashboard Mollie).
- **Leads** : ~246 emails. Relances go-live parties (235 EUR + 4 USD EN/ES). **Nudge install PWA + alertes** greffé sous le verdict quotidien (`drip-email.cjs`, gating usage : ≥3 verdicts, cap 3, ≥10j).
- **⚠️ Funnel NON fiable jusqu'à ~23/07** : fenêtre 28j → mélange l'ancien design abo (avant 25/06). `Code.js` compte désormais `sg_pass_cta` (vrai CTA) mais **nécessite `clasp push`** (action fondateur, reporting only). Revenu = Stripe/Mollie, jamais le funnel.
- **Boucles d'alerte auto** : `revenue-watch` (mouvements Stripe) + `ux-watch` (criticals rage/dead-clicks de ux-report) → email fondateur, dans daily-copernicus.
- **A/B tests live** : `pw_cta_order` + `pw_prelude` + `ab_fiche_dive` (50/50) + `home_az` (50%) + `map_world` (50%). **`molo_ladder` TRANCHÉ 26/06 → molo figé à 100 %** (zéro prompt géoloc à froid ; MQ +201 % checkout-redirect, sig. 99 %, ennui 13→11 %). **`dock_glass` RETIRÉ** avec la BottomNav. Réévaluer le reste sur données POST-refonte.
- **Pipeline** : ERDDAP-live, 4×/j, stable. **Détail complet de la session 26/06 → `NEXT_SESSION.md` (entrée en tête).**

Pour les opérations détaillées (deploy manuel, A/B eval, backtest forecast, stats), invoquer le skill `sargasses`.
