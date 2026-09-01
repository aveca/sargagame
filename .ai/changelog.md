# .ai/changelog.md — Historique des changements agents

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

## 2026-08-31 · Sprint #25 — /beach/ 404 + Puntacana + Apple Pay

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