# Sargassum Beach Monitoring

Live sargassum (seaweed) monitoring for Caribbean and Florida beaches. One codebase powers five regional sites: an interactive beach map, a 0-100 Beach Score per beach, and a 7-day per-beach forecast — refreshed several times a day from NOAA satellite data.

## Live sites

| Region | Site | Language |
|---|---|---|
| Martinique | [sargasses-martinique.com](https://sargasses-martinique.com) | FR |
| Guadeloupe | [sargasses-guadeloupe.com](https://sargasses-guadeloupe.com) | FR |
| Punta Cana (DR) | [sargassumpuntacana.com](https://sargassumpuntacana.com) | EN |
| Miami / Florida | [sargassummiami.com](https://sargassummiami.com) | EN |
| Cancún / Riviera Maya (MX) | [sargassumcancun.com](https://sargassumcancun.com) | ES |

## How it works

- **Detection** — NOAA ERDDAP AFAI satellite composites (7-day primary + 1-day rapid-change signal), sampled offshore of each monitored beach (sargassum is detected 10-100 km out, not at the shoreline).
- **Beach memory** — landed sargassum stays on the beach after the ocean clears; an exponential-decay accumulation model (half-life 5 days) keeps the displayed status honest.
- **Forecast** — per-beach 7-day outlook from exponential persistence, drifting offshore bank detection (wind + current), and onshore wind components. Days beyond +4 are explicitly flagged as low-confidence horizon.
- **Beach Score 0-100** — sargassum is one of seven factors (swell, wind, water temperature, cloud cover, UV, tide) so the score stays useful year-round.

## Stack

- **Frontend** — React 18 + Vite, Leaflet (lazy-loaded), PWA with service worker. No backend server: fully static hosting per domain.
- **Data pipeline** — Node.js scripts run 4×/day by GitHub Actions; outputs are plain JSON committed to this repo and deployed over FTPS.
- **Multi-region engine** — one config file per region under `regions/`; new regions build as dedicated single-page apps via `VITE_REGION=<id> npm run build`.
- **SEO** — 136+ static pages generated at build time for the French sites (per-beach pages, editorial content, sitemaps).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — codebase layout, multi-region build, deploy flow, service worker rules
- [docs/DATA-PIPELINE.md](docs/DATA-PIPELINE.md) — satellite sources, beach memory, forecast model, beach score
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — runbook: secrets inventory, workflows, manual deploy, new-region checklist

## Development

```bash
npm install
npm run dev                      # local dev server (MQ/GP shared build)
npm run build                    # production build (MQ/GP)
VITE_REGION=puntacana npm run build   # build a specific region
```
