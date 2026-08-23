# Architecture — Sargasses / Sargassum monitoring

> Mise à jour : 2026-06. Un seul codebase, 5 domaines en production.
> Voir aussi : [OPERATIONS.md](OPERATIONS.md) (runbook, secrets, deploy) et [DATA-PIPELINE.md](DATA-PIPELINE.md) (pipeline data v3.1).

## 1. Un codebase → 5 domaines

| Région (`id`) | Domaine | Langue | Devise | Dossier FTP | Plages |
|---|---|---|---|---|---|
| `mq` | sargasses-martinique.com | FR | EUR | `martinique-ftp/` | beaches-list.json filtré `island:'mq'` (~53) |
| `gp` | sargasses-guadeloupe.com | FR | EUR | `guadeloupe-ftp/` | beaches-list.json filtré `island:'gp'` (~83) |
| `puntacana` | sargassumpuntacana.com | EN | USD | `puntacana-ftp/` | 12 plages inline dans `regions/puntacana.json` |
| `florida` | sargassummiami.com | EN | USD | `florida-ftp/` | 12 plages inline dans `regions/florida.json` |
| `rivieramaya` | sargassumcancun.com | ES | USD | `rivieramaya-ftp/` | 12 plages inline dans `regions/rivieramaya.json` |

Deux modes de build :

- **MQ/GP = build partagé legacy.** Un seul `npm run build` (sans `VITE_REGION`) produit un `dist/` déployé sur les **deux** domaines FR. La distinction MQ vs GP se fait **au runtime par hostname** (`window.location.hostname.includes("guadeloupe")`). Les pages SEO spécifiques GP sont générées dans `dist/_gp/` puis recopiées par-dessus `guadeloupe-ftp/` (overlay) par `prepare-ftp.cjs`.
- **Nouvelle région = build mono-région.** `VITE_REGION=<id> npm run build` produit une SPA dédiée : la config de `regions/<id>.json` est injectée au build via `define __REGION__` (vite). Pas de génération des 136 pages SEO MQ/GP, métadonnées/JSON-LD/noscript réécrits dans la langue primaire de la région par le plugin `region-index-html` de `vite.config.js`.

### La gate `IS_NEW_REGION` (constant-folded)

Présente à l'identique dans `vite.config.js` et `Sargasses_PROD.jsx` :

```js
const __R = (typeof __REGION__ !== "undefined" && __REGION__) || null
const IS_NEW_REGION = !!(__R && __R.id !== "mq" && __R.id !== "gp")
```

`__REGION__` est une constante de build (vite `define`) → esbuild **constant-fold** la condition. Conséquence : sur un build MQ/GP, toutes les branches `IS_NEW_REGION ? … : …` se réduisent statiquement à la branche historique — **le bundle MQ/GP reste byte-identique** au comportement pré-multi-régions. Sur un build nouvelle région, c'est `__REGION__` qui fait foi partout (centre carte, timezone, langue, emails support, payment links, nom de marque, plages inline).

### Le moteur `regions/`

- `regions/index.cjs` — source de vérité unique, consommée par `vite.config.js`, `scripts/prepare-ftp.cjs`, `scripts/manual-ftp-deploy.cjs`, `scripts/fetch-sargassum-live.cjs` et les scripts d'outillage. API : `getAllRegions()`, `getRegion(id)`, `getRegionByDomain(host)`, `getBuildRegion()`.
- `regions/<id>.json` — un fichier = une région = un domaine = un dossier FTP. Schéma : `regions/_schema.json`.
- **Validation fail-fast au chargement** (toute commande qui touche le moteur crash si invalide) :
  - chaque plage inline doit avoir `island === id` de la région (sinon le front, qui filtre sur `b.island === REGION.id`, n'affiche **aucune** plage — bug Miami/Cancún du 2026-06-10) ;
  - chaque plage doit être **dans la `bbox`** de la région ;
  - `beachFilter.island` doit égaler `id` ;
  - ids en double et JSON invalides rejetés.
- Séparation analytics stricte : une nouvelle région n'hérite **jamais** des IDs GA4/Clarity/OneSignal MQ/GP. Si `ga4Id`/`clarityProjectId`/`onesignalAppId` est absent ou `TBD*`, le bloc correspondant est retiré du HTML (ou stub no-op pour OneSignal).

## 2. App principale

- **`Sargasses_PROD.jsx`** (~13,4k lignes) — monolithe React 18, map-first ("25 % des clics = carte" d'après Clarity). Contient : état global, i18n FR/EN/ES, Beach Score UI, sheet/modal plage, paywall Premium, A/B testing, tracking funnel (events `sg_*` vers Apps Script), favoris, signalements communautaires, ErrorBoundary.
- **Carte = SVG custom inline** (`WorldMapView` / `ArchipelView`, dans `Sargasses_PROD.jsx`) — plus de Leaflet (retiré ; `src/MapView.jsx` n'existe plus, ne survit qu'un commentaire de fallback legacy `?nav=map`). Radar time-slider 5 jours (frames J0..J+4 depuis le forecast).
- **`src/PremiumModal.jsx`** — le seul chunk **lazy-loadé** (`React.lazy` + dynamic import) : le paywall Premium (PremiumModal + variantes World/Comic/B2B), sorti du monolithe pour alléger le first paint.
- **`src/lib/score.js`** — Beach Score côté client (même formule que `scripts/lib/score.cjs`).
- Fonts : Bricolage Grotesque + Anton. Pas de framework CSS.

## 3. Pipeline data v3.1 (résumé)

Détails complets dans [DATA-PIPELINE.md](DATA-PIPELINE.md).

- **Sources** : NOAA ERDDAP AFAI composite **7 jours** (primaire) + composite **1 jour** (bonus, détection des changements rapides), Open-Meteo (vent + marine). Fallback scraper Copernicus Marine si ERDDAP down.
- **Correction 1D pondérée** : la correction `avg1D − avg7D` est multipliée par `min(1, n1D/20)` — un échantillon 1D trop petit (ex. 8 pixels dont 4 saturés, incident 2026-06-09) ne peut plus faire basculer toute une île.
- **Beach memory** : accumulation des échouages avec décroissance exponentielle, demi-vie **5,0 j** (v3.1 — relevée de 3,5 j après backtest). Si le satellite voit propre et frais, la mémoire est ignorée.
- **Forecast v3** : persistance exponentielle + signal d'arrivée des bancs (`sargassum-banks.json`) + vent + tendance (gate r² ≥ 0,4). Horizon utile 4 jours, J+5..7 marqués `horizon`.
- **Beach Score 0-100** : 7 facteurs — sargasses 30, houle 20, vent 15, temp. eau 10, nuages 10, UV 10, marée 5.
- **Sorties** : `public/api/copernicus/sargassum.json` (+ `history.json`, `sargassum-grid.json`, `sargassum-banks.json`, `forecast-archive.json`) pour MQ/GP — contrat racine inchangé — et `public/api/copernicus/<regionId>/sargassum.json` + `history.json` par nouvelle région.
- **Cadence** : 4 runs/jour via GitHub Actions (`daily-copernicus.yml`, cron 0/6/12/18 UTC).

## 4. Build Vite

`npm run build` = `node scripts/build-sargassum-json.cjs && vite build`.

### Build MQ/GP (défaut)

Le plugin `seo-pages` (`closeBundle` dans `vite.config.js`, ~950 lignes) génère **136+ pages statiques** dans `dist/` :

- ~20 pages éditoriales FR (saison, meilleures plages, H2S, méthode, FAQ, lexique, "cette semaine"…) avec contenu noscript complet + variantes EN (`/en/...`) ;
- une page par plage `/plages/<slug>/` (title/desc/JSON-LD/noscript par plage, données météo du jour injectées au build) ;
- hubs `/plages/`, sitemaps, FAQPage schema ;
- miroir GP dans `dist/_gp/` : le générateur boucle GP→MQ (MQ gagne dans `dist/`), les pages GP-correctes sont stockées sous `_gp/` puis **overlay** sur `guadeloupe-ftp/` par `prepare-ftp.cjs`. Sans cet overlay, le site GP shippe des listes de plages MQ (root cause de la cannibalisation GSC, fix session 38).
- Réécriture des liens cross-île : un lien `/plages/<slug>/` vers une plage de l'autre île devient une URL absolue vers le domaine partenaire ; slug mort = balise `<a>` strippée (bug phantom-href).

### Build nouvelle région (`VITE_REGION=<id>`)

- `IS_NEW_REGION=true` → le plugin `seo-pages` **return immédiatement** : pas de pages SEO MQ/GP, SPA seule.
- Le plugin `region-index-html` (`transformIndexHtml`) réécrit l'`index.html` : `<html lang>`, title/desc/og/twitter dans la langue primaire (EN ou ES-first), hreflang racine + x-default, JSON-LD (WebApplication + FAQPage + Organization) régénérés, noscript SEO par commune **sans liens internes** (aucune sous-page n'existe), domaine remplacé, IDs analytics de la région ou blocs retirés.

## 5. Flow de deploy

```
npm run build (ou VITE_REGION=<id> npm run build)
        │ dist/
        ▼
node scripts/prepare-ftp.cjs        # VITE_REGION-aware
        │ <region>-ftp/  (martinique-ftp/ + guadeloupe-ftp/ en mode partagé)
        ▼
node scripts/manual-ftp-deploy.cjs  # creds via env FTP_* (jamais hardcodées)
        │ FTPS, sessions fragmentées
        ▼
   hébergeur mutualisé (1 compte FTP claudedeploy@ par domaine)
```

- **`prepare-ftp.cjs`** : mode partagé → copie `dist/` vers `martinique-ftp/` ET `guadeloupe-ftp/`, applique l'overlay `_gp/`, et ne shippe dans chaque dossier que les pages plages de son île (sinon duplicate content cross-domaine → "Discovered, currently not indexed"). Mode nouvelle région → produit uniquement `<ftpDir>/`, purgé des artefacts MQ/GP (sitemaps, fichiers de vérification Google/Bing, `api/stripe-config.php`, routes des autres domaines), `og-image.png` remplacé par la variante régionale (`regions/og/og-image-<id>.png`), appId OneSignal substitué.
- **`manual-ftp-deploy.cjs`** : l'hébergeur coupe le socket de contrôle FTPS après ~660 commandes STOR → upload **fragmenté** : une session FTPS fraîche par entrée top-level (fichiers racine = 1 chunk, puis chaque sous-dossier = 1 chunk). Itère toutes les régions de `regions/index.cjs` ; région sans creds env ou sans dossier local = skip silencieux. Options : `ONLY=<id>`, `SKIP_UNTIL=<name>`. Charge `.env` à la racine automatiquement.
- Les dossiers `*-ftp/` sont **gitignorés** (ils contiennent des copies de `stripe-config.php` avec clés live).

## 6. Service Worker — règle absolue

`public/sw.js`, cache-first avec `CACHE_NAME = 'sargasses-vNN'`.

> ⚠️ **Bumper `CACHE_NAME` à CHAQUE deploy de code.** Sans bump, les clients existants continuent de servir l'ancien JS/CSS/HTML depuis le cache SW jusqu'à expiration — un fix peut paraître "pas déployé" pendant des jours. Le bump déclenche la purge des anciens caches dans le handler `activate`. (Valeur actuelle : voir la ligne `const CACHE_NAME` dans `public/sw.js`.)

Les JSON data (`/api/copernicus/...`) sont en network-first, donc rafraîchis sans bump ; tout le reste (assets, images, HTML) exige le bump.

## 7. Paiements & backend léger

Le projet est **full-static** (pas de serveur applicatif). Le backend se réduit à :

- **Paiement B2C actif = Mollie on-site PARTOUT** (`public/api/mollie.php`, `PAY_PROVIDER` par défaut `'mollie'`) — carte via Mollie Components + Apple Pay natif, EUR (MQ/GP) **et** USD (florida/puntacana/rivieramaya, Mollie encaisse l'USD et règle en EUR). Modèle **PASS-ONLY** (paiement unique, plus d'abonnement). B2B mensuel récurrent câblé via `mol_b2b_plans` dans `public/api/mollie-lib.php`. Détails de la bascule : [MOLLIE_MIGRATION.md](../MOLLIE_MIGRATION.md).
- **Stripe = legacy DORMANT** (plus une caisse) : `scripts/create-region-payment-links.cjs`, `public/api/stripe-webhook.php`, `STRIPE_PK` ne subsistent que pour les **16 abonnés EUR legacy** (source de vérité du MRR via `scripts/automation/data/daily-metrics.json`). Aucun nouveau CTA ne renvoie vers Stripe ; les liens USD Stripe sont désactivés.
- **Google Apps Script** (funnel + emails) — URL de l'exec dans le secret `APPS_SCRIPT_URL`, déployé via clasp.
- **SMTP** (nodemailer, boîte `alerte@sargasses-martinique.com` sur cPanel) pour TOUS les emails transactionnels/drip/outreach/alertes — couche partagée `scripts/automation/lib/email-send.cjs`, From normalisé sur cette boîte (SPF/DKIM). **OneSignal** pour le push (1 app par région). NB : le tracking opens/clicks (anciens webhooks Resend) n'existe plus en SMTP — l'engagement email se mesure désormais via Apps Script (envois/bounces) ; l'attribution revenu Stripe `metadata.source` ne couvre plus que la base legacy.
