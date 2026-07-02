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

- **Frontend** — React 18 API surface (aliased to Preact/compat in production for a smaller runtime bundle) + Vite, a custom SVG map (`WorldMapView`/`ArchipelView`), installable PWA with a service worker. Each region builds to a self-contained static bundle. (A legacy `?nav=map` fallback remains for the old Leaflet map mode.)
- **Payments** — plain PHP under `public/api/`, deployed over FTPS to shared hosting (no PHP framework, no app server): Mollie (primary, on-site Card/Apple Pay/Google Pay) and PayPal (secondary) are live; a Stripe integration is kept legacy/read-only. Real secrets live in gitignored `*-config.php` files on the host, never in the repo.
- **Data pipeline** — Node.js scripts run 4×/day via GitHub Actions: pull NOAA ERDDAP satellite composites, run the forecast/confidence model, and output plain JSON consumed by the frontend and deployed over FTPS.
- **Backend-as-a-service** — Supabase (Postgres + Storage + Edge Functions in TypeScript) powers the visitor-photo feature (upload, moderation, notifications).
- **Automation** — 100+ Node.js scripts (`scripts/automation/`) covering SEO content generation, B2B outreach, email drip campaigns (SMTP/IMAP), and analytics ingestion.
- **Video** — Remotion (programmatic React video) renders daily per-beach video briefs for social distribution.
- **QA** — Playwright drives smoke tests and visual-regression checks against the production build before every deploy.
- **Multi-region engine** — one config file per region under `regions/`; new regions build as dedicated single-page apps via `VITE_REGION=<id> npm run build`.
- **SEO** — 136+ static pages generated at build time for the French sites (per-beach pages, editorial content, sitemaps, JSON-LD).
- **CI/CD** — GitHub Actions (27 workflows): build, FTPS deploy, health-checks, and all recurring growth/ops automation. No servers to manage beyond the PHP-capable static host.

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
