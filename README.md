# Sargassum Beach Monitoring

Live sargassum (seaweed) monitoring for Caribbean and Florida beaches. One codebase powers five regional sites: an interactive beach map, a 0-100 Beach Score per beach, and a 7-day per-beach forecast — refreshed from the Copernicus/ERDDAP pipeline.

## Live sites

| Region | Site | Language |
|---|---|---|
| Martinique | [sargasses-martinique.com](https://sargasses-martinique.com) | FR |
| Guadeloupe | [sargasses-guadeloupe.com](https://sargasses-guadeloupe.com) | FR |
| Punta Cana (DR) | [sargassumpuntacana.com](https://sargassumpuntacana.com) | EN |
| Miami / Florida | [sargassummiami.com](https://sargassummiami.com) | EN |
| Cancún / Riviera Maya (MX) | [sargassumcancun.com](https://sargassumcancun.com) | ES |
| Tulum (MX) | [sargazotulum.com](https://sargazotulum.com) | ES |

## How it works

- **Detection** — Copernicus/ERDDAP satellite composites are sampled offshore of monitored beaches; the pipeline remains the scientific source of truth.
- **Beach memory** — landed sargassum persists after the ocean clears through an exponential-decay accumulation model.
- **Forecast** — per-beach 7-day outlook combining persistence, offshore drift and onshore wind signals, with lower confidence on the far horizon.
- **Beach Score 0-100** — combines sargassum with year-round environmental factors so the product remains useful outside peak season.

## Products & pricing

The current-day per-beach verdict is free; paid products unlock the multi-day forecast, alerts and B2B features. Payment processing uses the repository's active Mollie path; Stripe remains legacy/read-only where applicable. The satellite verdict is data-driven: paid partner placement never changes beach status.

## Stack

- **Frontend** — React 18 + Vite, production-compatible runtime optimizations, custom SVG mapping and PWA/service-worker support.
- **Payments** — PHP endpoints under `public/api/` with Mollie as the active checkout path; deployment includes secret injection at the hosting/edge layer.
- **Data** — Node.js automation + Copernicus ERDDAP pipeline, deterministic region configs under `regions/`.
- **Supabase** — Postgres/Storage/Edge Functions for supported stateful features.
- **QA** — Playwright smoke tests, funnel checks and visual regression.
- **Cloudflare** — Workers + static assets are deployed by GitHub Actions; production health checks verify the public domains and payment API surface.
- **Automation** — local 24/7 autopilot plus scheduled GitHub Actions for data, SEO, growth and operations.

## Autonomous factory

The local factory is designed to continue working without a prompt on every cycle:

`OBSERVE → ANALYZE → PRIORITIZE → IMPLEMENT → TEST → BROWSER/Visual QA → DELIVER → RESUME`

The self-healing supervisor is intentionally scoped to factory/autopilot/test infrastructure. A repair runs in an isolated Git worktree, is policy-checked and tested before it can become a PR. Application money-path files, workers, secrets, regions and production API files remain outside the repair scope.

### Live production sentinel

`.github/workflows/live-production-sentinel.yml` runs every 10 minutes and on demand. It is designed to:

- probe the public production sites (`/`, `robots.txt`, `sitemap.xml`, `version.json`);
- smoke-test `/api/mollie.php` without creating a payment;
- inspect recent GitHub Actions failures;
- ingest bounded Cloudflare Worker error-tail output when Wrangler access is configured;
- write a deduplicated incident report for the autonomous factory instead of asking the founder to paste logs manually.

No secrets or full production response bodies are persisted by the sentinel.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATA-PIPELINE.md](docs/DATA-PIPELINE.md)
- [docs/OPERATIONS.md](docs/OPERATIONS.md)
- [.ai/autopilot/README.md](.ai/autopilot/README.md)
- [scripts/local-factory/README.md](scripts/local-factory/README.md)

## Development

```bash
npm install
npm run dev
npm run build
VITE_REGION=puntacana npm run build
```
