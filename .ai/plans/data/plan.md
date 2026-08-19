# Data Agent Plan — Pipeline ERDDAP, Forecast, ML, Analytics

## Mission
Pipeline ERDDAP, forecast, fiabilité, analytics. Source unique = ERDDAP (NOAA AFAI 7D). Jamais de fabrication.

## Priorités P0-P2

### P0 — Pipeline santé
1. **Pipeline ERDDAP freshness** (4x/jour via daily-copernicus)
   - Source: NOAA ERDDAP `noaa_aoml_atlantic_oceanwatch_AFAI_7D`
   - Régions: MQ, GP, FL, PC, RM, Barbados (6 live)
   - Output: `public/api/copernicus/sargassum.json` + per-region
   - SLA: data age <12h, `stale=false`

2. **Data integrity guards**
   - `satelliteTimestamp` ≤ `updatedAt` (jamais futur)
   - `confidence` 0-100% basé sur `near/off` pixels Sentinel-2
   - `stale=true` si data ERDDAP >24h ou `confidence<50%`

### P1 — Forecast & ML
3. **Forecast model backtest** (F1)
   - Input: ERDDAP 7D + wind/wave forecast (NOAA GFS/NOAA WaveWatch)
   - Model: drift (HYCOM currents) + accumulation decay + shore interaction
   - Backtest: 90 jours rolling vs ground truth (Sentinel-2 + reports communautaires)
   - Metrics: MAE arrival time, precision/recall échouage, Brier score

4. **Propensity model** (F8)
   - Features: `useFrustrationDetection.js` events (rage clicks, dwell, scroll depth, revisit)
   - Target: `sg_conversion` within session + 24h
   - Model: XGBoost / LightGBM (on-device via WebAssembly ou serverless)
   - Output: `propensity_score` → personnalisation paywall timing

5. **Personalized alerts** (F6)
   - OneSignal segmentation: plage favorite, fréquence (quotidien/hebdo), langue
   - Trigger: `score≤40` + `confidence≥70%` + `propensity≥0.6`
   - Channel: push + email (Resend) + webhook B2B

### P2 — Advanced
6. **Reliability dashboard** (public `/fiabilite/`)
   - Backtest 365j: accuracy globale, par région, par plage
   - Calibration curve: predicted probability vs observed frequency
   - False alarm rate, missed event rate
   - Update: hebdo via `scripts/automation/reliability-backtest.cjs`

7. **Sentinel-2 integration** (G17)
   - CDSE API: true-color + AFAI 10m résolution
   - Fusion: ERDDAP 1km (7D) + Sentinel-2 10m (5j revisit)
   - Output: `confidence` boost où Sentinel confirme

8. **Community reports weighting**
   - `reports` table: user_id, beach_id, status, timestamp, photo?
   - Weight: proximité temporelle + historique fiabilité user
   - Intégration: `beachScore` adjustment ±10pts

## Artefacts techniques
- `public/api/copernicus/sargassum.json` — main payload (updateAt, regions, beaches, banks)
- `public/api/copernicus/sargassum-banks.json` — DBSCAN clusters + drift vectors
- `public/api/copernicus/forecast-archive.json` — append-only 30j
- `public/api/copernicus/history.json` — daily snapshots pour backtest
- `scripts/fetch-sargassum-live.cjs` — pipeline principal (≈2min/run)
- `scripts/lib/forecast.cjs` — modèle drift + accumulation
- `scripts/lib/confidence.cjs` — score 0-100% multi-facteur

## Validation (Gate de ship)
- [ ] `node scripts/fetch-sargassum-live.cjs` → exit 0, 6 régions OK
- [ ] `node -e "require('./regions/index.cjs').assertAllRegionsValid()"` → OK
- [ ] `public/api/copernicus/sargassum.json` → `stale:false`, `source:erddap-live`
- [ ] Backtest MAE < 12h arrival, precision > 0.75

## SLA
| Métrique | Target |
|----------|--------|
| Pipeline success rate | 100% (4x/jour) |
| Data age | <12h |
| Forecast MAE arrival | <12h |
| Confidence calibration | Brier < 0.15 |
| False alarm rate | <10% |