# PERFORMANCE — métriques, harnais de mesure, leviers

> Référence perf de chargement/affichage de l'app (SPA React→Preact, full-static FTP/CDN-less,
> servie aussi en PWA). Audience mobile-first, Caraïbes/Floride sur 3G/4G variable.
> Travail initial : **PR #201** (`claude/app-performance-metrics-pq5c19`).

## 1. Les métriques à traquer (cibles)

### Core Web Vitals (classement Google + UX réelle)
| Métrique | Mesure | Cible mobile | Cible desktop |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | apparition du plus gros élément (héro/verdict ou carte) | ≤ 2,5 s (viser 2,0) | ≤ 2,0 s |
| **INP** (Interaction to Next Paint) | latence de la pire interaction (tap chip, paywall, zoom carte) | ≤ 200 ms | ≤ 200 ms |
| **CLS** (Cumulative Layout Shift) | décalages visuels inattendus | ≤ 0,1 | ≤ 0,1 |

### Support (diagnostic)
| Métrique | Cible mobile | Cible desktop |
|---|---|---|
| **FCP** (First Contentful Paint) | ≤ 1,8 s | ≤ 1,0 s |
| **TTFB** (Time To First Byte) | ≤ 0,8 s | ≤ 0,6 s |
| **TBT** (Total Blocking Time, lab) | ≤ 200 ms | ≤ 150 ms |

### Budgets spécifiques app
| Indicateur | Cible |
|---|---|
| **JS eager** (entry + modulepreload, gzip) | ≤ 210 Ko (cf. `scripts/check-bundle-budget.cjs`) |
| TTI carte (SVG cliquable, Slow-4G + 4× CPU) | ≤ 3,5 s |
| Requêtes au first paint | ≤ 15 |
| Fonts woff2 (latin préchargé) | 2 fichiers preload |
| PWA cache hit (repeat visit) | ≥ 90 % |

## 2. Comment mesurer

### En place
- **CrUX field** (LCP/INP/CLS/TTFB p75) via `scripts/automation/seo-audit.cjs` (+ alerting `seo-cwv-tracker.cjs`, email `ux-watch.cjs`). Limite : agrégat Chrome **laggé 2-4 sem.**, non segmentable région/device.
- **RUM first-party** (PR #201) : `src/perf-vitals.js` envoie LCP/INP/CLS/FCP/TTFB à **GA4** (`gtag('event','web_vitals',…)`) segmentés **`sg_region`** (dérivée hostname) + **`effective_type`** (3g/4g) + `metric_rating`. Chargé en idle depuis `src/main.jsx` → chunk **lazy** (≈2,8 Ko gzip), zéro impact first paint. Couvre les 5 domaines (bundle partagé).
  - **Pour exploiter dans GA4** : enregistrer `metric_name`, `metric_value`, `metric_rating`, `sg_region`, `effective_type` comme **dimensions/métriques personnalisées** (la collecte tourne déjà sans ça).
- **Garde-fous CI** (PR #201) :
  - `scripts/check-bundle-budget.cjs` — mesure la taille **gzip** du JS **eager** (entry + modulepreload) et **échoue si > budget** (`BUNDLE_BUDGET_KB`, défaut 210). Lancé dans `.github/workflows/perf-budget.yml` (**bloquant**).
  - `lighthouserc.json` + `perf-budget.yml` — **Lighthouse CI mobile** sur PR/push, **report-only** au départ (seuils LCP/TBT/CLS/perf-score en `warn` → à promouvoir en `error` une fois la baseline terrain connue).
- **Harnais synthétiques** (manuels) : `scripts/measure-load.cjs`, `measure-map-fps.cjs`, `audit-capture.cjs`.

### Mesurer en local (méthode utilisée pour PR #201)
```bash
npx vite build
npx --yes http-server dist -p 8099 -s &
# Lighthouse mobile (Chromium préinstallé) :
CHROME_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome \
npx --yes lighthouse "http://localhost:8099/" --only-categories=performance \
  --form-factor=mobile --screenEmulation.mobile \
  --chrome-flags="--no-sandbox --headless=new" --output=json --output-path=lh.json --quiet
```
⚠️ **`http-server` ne compresse pas** → LCP/FCP **gonflés** vs prod (brotli via `.htaccess`). Bon pour le **relatif** (avant/après) et le **TBT** (parse-bound, indépendant du transfert), **pas** pour l'absolu. Profil CPU mount : CDP `Profiler` + `Emulation.setCPUThrottlingRate:4`. Régression visuelle : screenshot Playwright (`executablePath` du chromium préinstallé, `--no-sandbox`).

## 3. Ce qui a été fait (PR #201)

| Commit | Changement | Effet vérifié |
|---|---|---|
| 1 | RUM web-vitals → GA4 ; preload polices latin ; fix template FTP GP (Google Fonts→self-hosted, GA4 différé idle) ; budget bundle ; Lighthouse CI | infra mesure + garde-fous |
| 2 | Preload carte first-paint (`WorldMapView`) — plugin Vite injecte `<link rel=modulepreload>` du chunk hashé | **LCP 7,6→6,8 s**, TTI 8,8→6,8 s (Lighthouse local, médiane 3 runs) |
| 3 | Bake SVG→PNG de `WorldMapView` différé à `requestIdleCallback` | cède la priorité à l'input (gain INP) |
| 4 | Bake encodé off-main-thread (`canvas.toBlob` async vs `toDataURL` sync) + objectURL (révoqué) | coût main-thread du bake **2237→684 ms** (profil 4× CPU) |

Notes :
- **CLS = 0** (swap skeleton→app déjà parfait). Un CLS lab intermittent ~0,05 est du **reflow texte/police** (attribué via `PerformanceObserver` à 0,0012, pas le bake), atténué par les preloads de police.
- **Compression + cache déjà optimaux** dans `public/.htaccess` : `mod_brotli` + `mod_deflate` + `Cache-Control: immutable max-age=1an` sur assets hashés (JS/CSS) et woff2, `no-cache` sur `sw.js`/`version.json`. → **Pré-compresser au build serait redondant.**
- Commits 3-4 : LCP/TBT **lab plats** (le bake est post-TTI dans la trace Lighthouse) ; leur gain est **INP/réactivité terrain** (~1,5 s de thread libéré plus tôt), à confirmer au **RUM**.

## 4. Leviers restants (data-driven)

Priorité à confirmer **sur les chiffres RUM réels** (une fois #201 mergé+déployé) avant d'investir :
1. **Alléger le `drawImage` du bake** `WorldMapView` (~684 ms restants, hors fenêtre critique) — ex. résolution 2,5×→2,0× (−36 % pixels). Risque : sharpness sur zoom profond → **régression visuelle obligatoire**.
2. **Découper le monolithe** `Sargasses_PROD.jsx` (13,4k lignes, entry 82 % inutilisé au first paint) — bornée par le couplage des helpers ; gain = parse/TBT.
3. **CDN (Cloudflare gratuit)** devant le FTP — levier **TTFB** majeur pour Floride/Caraïbes (hébergement FR sans edge). **Décision infra** (DNS/proxy).

## 5. Garde-fous — ne pas régresser
- Toute PR passe `perf-budget.yml` : budget gzip eager **bloquant** (≤ 210 Ko) + Lighthouse CI (report-only).
- `WorldMapView` est la **carte vedette animée** (funnel/revenu) : **jamais** de refacto sans **screenshot de régression visuelle** + vérif que le bake produit toujours son PNG (blob) après settle + profil avant/après.
- Le RUM ne doit **jamais** casser l'app (tout est try/catch, chargé en idle).
