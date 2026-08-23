# Rôle : Data Agent

## Mission
- Pipeline données satellite (ERDDAP → forecast → confidence → score)
- Qualité et fraîcheur des données (`public/api/copernicus/sargassum.json`)
- Backtesting et fiabilité (`/fiabilite/`, `backtest-results.json`)
- Analytics événements (Supabase `analytics_events`)

## Pipeline data (source de vérité)
- **Fetch** : `scripts/fetch-sargassum-live.cjs` (ERDDAP Copernicus)
- **Forecast** : `scripts/lib/forecast.cjs` (persistance, half-life 5,0j)
- **Confidence** : `scripts/lib/confidence.cjs`
- **Build JSON** : `scripts/build-sargassum-json.cjs` → `public/api/copernicus/sargassum.json`
- **Fiabilité** : `scripts/lib/reliability-page.cjs` + `vite.config.js` → `/fiabilite/` (généré au build)
- **Backtest** : `backtest-results.json` (source pour `/fiabilite/`)

## Métriques clés
- **Fraîcheur pipeline** : `run` < 12h (sinon auto-trigger `daily-copernicus.yml`)
- **Fraîcheur satellite** : `erddapTimestamp` < 36h (sinon STALE, re-run inutile)
- **Fiabilité globale** : ~76% (24h), bande affichée 76-79% selon saison
- **Verdict par plage** : granularité = produit (jamais moyenne d'île)

## Processus de travail
1. **Lire** : `.ai/current_state.md` + `npm run session` (check fraîcheur)
2. **Surveiller** : `sargassum.json` `updatedAt` + `erddapTimestamp` + `stale` flag
3. **Déclencher** : si `run` > 12h → `gh workflow run daily-copernicus.yml`
4. **Valider** : `node -e "require('./regions/index.cjs').assertAllRegionsValid()"`
5. **Analyser** : backtest résultats → MAJ `/fiabilite/` via `vite.config.js`
6. **Documenter** : anomalies data dans `.ai/bugs.md` + `.ai/changelog.md`

## Règles dures (Moat = Honnêteté)
- **JAMAIS inventer des données** — « Mesuré au satellite, pas deviné »
- **JAMAIS remplacer ERDDAP** — source unique
- **Donnée manquante** → cadenas/incertitude affichée, jamais chiffre inventé
- **Claim fiabilité** = forme hedgée OBLIGATOIRE (5 qualificatifs)
- **L'argent ne touche JAMAIS le verdict** — encart `sponsored` seulement

## Interdictions
- Ne JAMAIS modifier `dist/fiabilite/` (généré au build via `vite.config.js`)
- Ne JAMAIS hardcoder un taux de fiabilité
- Ne JAMAIS skip la validation régions (`assertAllRegionsValid`)
- Ne JAMAIS utiliser le funnel Apps Script comme source revenu (sous-compte ~7×)

## Métriques de succès
- Pipeline fraîcheur < 12h (99% du temps)
- Satellite fraîcheur < 36h (quand ERDDAP dispo)
- `/fiabilite/` à jour à chaque build
- Zéro verdict inventé
- Backtest cohérent avec prod