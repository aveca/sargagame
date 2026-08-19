# Architecture Agent Plan — Tech Debt, Decisions, Scalability

## Mission
Architecture, dette tech, décisions techniques. Source: `.ai/decisions.md`, `docs/ARCHITECTURE.md`, `vite.config.js`.

## Stack Actuelle
- **Frontend**: React 18 + Vite 5, JSX pur (no TS), single monolith `src/Sargasses_PROD.jsx` (~14.7k lines)
- **Build**: Vite → `dist/` → FTP deploy 5 domaines
- **Data**: ERDDAP → `scripts/fetch-sargassum-live.cjs` → `public/api/copernicus/*.json`
- **Payments**: Mollie on-site (PHP `public/api/mollie.php`), Stripe legacy read-only
- **Backend state**: Supabase (new), Apps Script (legacy, frozen)
- **Deploy**: GitHub Actions → FTP (5 domaines) + Cloudflare Pages (preview)
- **Bundle budget**: ≤210 Ko gzip eager (CI gate)

## Priorités P0-P2

### P0 — Stabilisation
1. **Monolith decomposition** (TASK-P2-001 DONE — PremiumModal split)
   - Current: `src/Sargasses_PROD.jsx` 14.7k lines
   - Done: `PremiumModal.jsx` + 9 sous-modules (`ComicPaywall`, `WorldPaywall`, `OnsiteCheckout`, `B2BModal`, `AccountSheet`, `FiabiliteProof`, `PassOffer`, `ComicDetail`, `ErrorModal`)
   - Next: Extract `MapView`, `BeachSheet`, `SargaChat`, `ArchipelView`, `ScrollStory`

2. **State management audit**
   - Current: 50+ `useState`/`useRef` dans monolith
   - Target: Context providers par domaine (Auth, Premium, Map, Data, UI)
   - Migration: incremental, feature-flagged

3. **Build performance**
   - Current: 3.8s build, 182.8 Ko gzip
   - Target: <3s build, <180 Ko gzip
   - Levers: dynamic imports (lazy), tree-shaking, three.js vendor split

### P1 — Scalabilité
4. **API layer unification**
   - Current: `public/api/*.php` (FTP) + `railway-api/` (Docker/Render)
   - Target: Single OpenAPI spec → generated clients
   - Endpoints: `/mollie`, `/paypal`, `/b2b-trial`, `/widget`, `/reliability`

5. **Supabase migration** (Apps Script → Supabase)
   - Frozen: Apps Script (clasp push = founder mobile blocker)
   - New state: `payment_grants`, `b2b_trials`, `user_preferences`, `analytics_events`
   - RLS policies: owner-only read/write, service-role for webhooks

6. **Real-time / WebSocket** (future)
   - Live beach updates: Supabase Realtime + ERDDAP polling
   - Live paywall status: Mollie webhook → Supabase → push client
   - Tech: Supabase Realtime or Cloudflare Workers + Durable Objects

### P2 — Platform
7. **Multi-region edge**
   - Current: FTP → shared hosting (Apache/PHP)
   - Target: Cloudflare Workers + Pages + R2 + D1
   - Benefits: <50ms latency global, zero-origin for static

8. **Observability stack**
   - Logs: structured JSON → Loki/Grafana Cloud
   - Metrics: Prometheus + Grafana (build time, bundle size, conversion)
   - Traces: OpenTelemetry → Tempo (payment flow, ERDDAP fetch)
   - Alerts: PagerDuty/Slack on conversion drop, data stale, payment failure

9. **Feature flags framework**
   - Current: `abVariant("key", ["a","b"])` + URL params (`?flag=0`)
   - Target: LaunchDarkly-style: targeting, rollout %, kill switch
   - Storage: Supabase `feature_flags` table + client cache

## Décisions archivées (`.ai/decisions.md`)
- Mollie = caisse active, Stripe = legacy read-only
- ERDDAP = source unique, jamais remplacée
- Apps Script = bloquant, ne pas étendre
- Bundle ≤210 Ko gzip eager
- Rollback: `?flag=0` pour tout ajout conversion/UI

## Artefacts
- `docs/ARCHITECTURE.md` — diagrammes, flux, décisions
- `vite.config.js` — config build, chunks, plugins
- `wrangler.jsonc` — Cloudflare Workers/Pages config (future)
- `supabase-schema.sql` — tables, RLS, indexes

## SLA
| Métrique | Target |
|----------|--------|
| Build time | <3s |
| Bundle gzip | ≤210 Ko |
| Monolith lines | <10k (progressive) |
| API latency p95 | <200ms |
| Deploy time | <5min (5 domaines) |