All facts verified. The entire `regions/` directory AND `puntacana-ftp/` are untracked working-tree — the multi-region engine is uncommitted. Now I have everything needed to produce both deliverables with precision.

# SARGASSES — SCOPE & HANDOFF : 100% AUTOMATISÉ MULTI-DOMAINES

> Livrable de session. Daté 2026-06-09. Toutes les refs `fichier:ligne` sont vérifiées dans le working-tree. Repo : `aveca/sargagame` (**public**). Commit HEAD : `526efd2`.

## 0. TL;DR pour décideur

- **Le moteur multi-régions existe et est bien conçu** (`regions/*.json` + `regions/index.cjs` + injection `__REGION__` au build), MAIS **il est 100% en working-tree non-commité** (`git ls-files regions/` = vide). Personne ne peut le perdre sauf un `git clean`. À committer tôt.
- **Le moteur n'est branché QUE sur le build front** (head meta + lang + beaches inline). **Toute la couche basse — pipeline data, FTP deploy, paiement, notifs, workflows CI — ignore `regions/`** et reste hardcodée MQ/GP.
- **`puntacana-ftp/` est une coquille trompeuse** : head transformé (title/canonical OK) mais **body = Martinique** (JSON-LD, noscript H1 FR, `sargassum.json` = plages MQ). Non déployable en l'état : duplicate content + cannibalisation SEO.
- **Cash actuel = uniquement MQ/GP, EUR, via 2 Payment Links Stripe hardcodés** (`Sargasses_PROD.jsx:348-349`). MRR ~34,93 €/mo, 7 payants. **Contrainte absolue : MQ/GP doit rester byte-identique.**
- **Le ROI rapide = finir Punta Cana (HTTPS + paiement USD + vrai contenu), puis cloner Florida/RivieraMaya, puis automatiser.**

---

## 1. ARCHITECTURE RÉELLE

**Stack** : React mono-fichier (`Sargasses_PROD.jsx`, ~5 300 l.) + Leaflet lazy (`src/MapView.jsx`), build **Vite** statique (pas de serveur Node en prod), backend = **PHP mutualisé** (`public/api/create-checkout.php`) + **Google Apps Script** (`scripts/appscript/Code.js`, webhook/funnel/email) + **Google Sheet** (source de vérité revenu). Hébergement **cPanel mutualisé**, deploy **FTPS fragmenté** (reset socket ~660 STOR → batchs de 150). CI = **9 GitHub Actions** (minutes illimitées, repo public).

**Flux de données** : `fetch-sargassum-live.cjs` (ERDDAP NOAA AFAI + fallback scraper Copernicus + Open-Meteo) → `public/api/copernicus/*.json` → consommé par le runtime (Beach Score 0-100, IDW, forecast 7j).

**Flux de déploiement** : `npm run build` (1 région, `VITE_REGION` défaut `mq`) → `prepare-ftp.cjs` (fabrique `martinique-ftp/` + `guadeloupe-ftp/` par réécriture textuelle FR→GP d'UN seul `dist/`) → `manual-ftp-deploy.cjs` (upload FTPS). Orchestré par `daily-copernicus.yml` (cron 4×/j, full build gated 1×/j 09h/21h UTC, sinon data-only deploy).

**Couche région (le moteur)** : `regions/index.cjs` = source de vérité unique (`getAllRegions`, `getRegion`, `getRegionByDomain`, `getBuildRegion` défaut `mq`, fail-fast). 5 régions : `mq`, `gp` (sans beaches inline → `beaches-list.json`), `puntacana`/`florida`/`rivieramaya` (12 plages inline chacune). `_schema.json` draft-07 complet. Champs clés : `id, domain, ftpDir, primaryLang, secondaryLangs, currency, stripeProducts{monthly,yearly}, bbox, center, zoom, onesignalAppId, emails, beachFilter.island, routes, geoDetect, beaches[]`.

**Gate de non-régression** : `IS_NEW_REGION = REGION && id!=='mq' && id!=='gp'`. Quand faux → `REGION=null` runtime, tout le chemin historique MQ/GP est strictement inchangé. Présent dans `vite.config.js:40` (build) et `Sargasses_PROD.jsx:27` (runtime). **C'est la ligne de défense — à préserver à l'octet.**

---

## 2. ÉTAT ACTUEL : LIVE vs COMMITÉ vs WORKING-TREE

| Élément | Live (prod) | Commité (git) | Working-tree non-commité |
|---|---|---|---|
| MQ/GP sites | ✅ en prod, EUR, 7 payants | ✅ | — |
| `Sargasses_PROD.jsx` | ✅ (version commitée) | ✅ HEAD | ⚠️ **modifié non-commité** |
| **`regions/` (moteur entier)** | ❌ pas consommé en prod | ❌ **NON tracké** | ✅ **uniquement ici** |
| `vite.config.js` region-aware | ✅ (no-op MQ/GP) | ✅ | — |
| **`puntacana-ftp/`** | ⚠️ servi en HTTP, contenu MQ | ❌ **NON tracké** | ✅ |
| SW `sargasses-v24` | ✅ | ✅ (`526efd2`) | — |
| Secrets (`.env`, `stripe-config.php`) | local + cPanel | ❌ **gitignorés (bien)** | ✅ local |

**Working-tree modifié** : `Sargasses_PROD.jsx`, `scripts/automation/{ab-results,optimization-log}.json`, `scripts/download-google-photos.cjs`. **Untracked critique** : `regions/`, `puntacana-ftp/`, fichiers `.png` de debug, `marketing/fb-posts-*.json`.

**Bug cache/SW = DÉJÀ RÉSOLU** (commits `6cc567e` + `526efd2`, juin 2026). SW + `version.json` exclus du cache long via `.htaccess:227-236`, force-reload onglets à l'activation. **Ne PAS re-déboguer.**

**Secrets — état sûr** : `.env` (238 o, `GITHUB_TOKEN`/`GOOGLE_PLACES_KEY`/`STRIPE_SECRET_KEY`) et `**/stripe-config.php` sont gitignorés (`.gitignore:20,28`). MAIS `puntacana-ftp/api/stripe-config.php` contient un **`sk_live_` + `resend_key` en clair sur disque** dans un dossier untracked → risque si commité/uploadé en HTTP. `STRIPE_PK` (`pk_live`) est en clair dans le JSX → **normal** (clé publique).

---

## 3. INVENTAIRE DOMAINES

| Domaine | Région | Lang | Devise | État réel |
|---|---|---|---|---|
| sargasses-martinique.com | `mq` | fr | EUR | ✅ **PROD complète** |
| sargasses-guadeloupe.com | `gp` | fr | EUR | ✅ **PROD complète** |
| sargassumpuntacana.com | `puntacana` | en/es | USD | ⚠️ **HTTP, contenu MQ, paiement cassé, pas HTTPS** |
| sargassum-florida.com | `florida` | en/es | USD | ❌ JSON seul, 0 ftp/build/stripe/onesignal |
| sargassum-rivieramaya.com | `rm` | en/es | USD | ❌ JSON seul (1 région Cancún+Playa+Tulum+Cozumel) |

**Note "Tulum/Cancún domaines séparés"** : n'existe **pas** dans le code. `rivieramaya.json` = UNE région. Décision requise avant de splitter en `cancun.json`/`tulum.json`.

**État précis Punta Cana** : ✅ `puntacana.json`, build SPA, head meta (title/canonical/og), dossier présent. ❌ JSON-LD + noscript = Martinique FR, `api/copernicus/sargassum.json` = plages MQ, OneSignal placeholder, prix EUR (USD pas créés Stripe), CORS checkout rejette le domaine (`create-checkout.php:5`), HTTPS absent, `.htaccess` mauvais domaine, pipeline data live absente.

---

## 4. PAIEMENT / ABONNEMENT : ACTUEL vs CIBLE

**Constat n°1 (load-bearing)** : il y a **DEUX systèmes parallèles**. Le cash réel passe par des **Stripe Payment Links hardcodés** (`Sargasses_PROD.jsx:348-349`), redirect même-onglet. `create-checkout.php` (SetupIntent/Subscription) **n'est plus utilisé pour vendre** (modale inline supprimée session 36) — il ne sert plus QUE `verify_subscription` + `portal`. Les actions `setup`/`subscribe` sont du **code mort**.

**Lifecycle actuel** : renouvellement / échec CB / retry / dunning = **100% géré par Stripe natif** (Smart Retries) dès qu'on vend via Payment Link. Livraison d'accès = `localStorage sg_premium` + `verify_subscription` multi-device. **Trou** : le "webhook" est un **POST client `no-cors` au retour navigateur** (`:4762`) — non signé, falsifiable, et **manqué si l'utilisateur ne revient pas sur l'onglet** → MRR sous-compté + provisioning raté. Annulation ⇒ `sg_premium` jamais révoqué.

**Cible (100% auto, sans humain)** :
1. **Payment Links USD** créés (monthly 9,99 $ / yearly 79 $) sur le même compte Stripe → `paymentLinks{}` dans chaque `regions/*.json`.
2. Runtime lit `REGION.paymentLinks` (fallback = constantes EUR pour MQ/GP → zéro régression).
3. **Vrai webhook Stripe signé** (vérif `Stripe-Signature`) traitant `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed` → log Sheet + provisioning fiable.
4. **Révocation auto** : au boot premium, re-`verify_subscription` ; si `active=false` → `removeItem("sg_premium")`.
5. **Cron de réconciliation** (Apps Script time-trigger ou GH Action) : Stripe `/subscriptions?status=all` → Sheet → couvre les retours-onglet manqués.
6. **CORS region-aware** (`create-checkout.php:5`), emails/welcome region-aware (+ bloc ES), funnel devise-safe (ne pas sommer EUR+USD bruts, `Code.js:601-617`).

⚠️ **US sales tax / nexus** : `automatic_tax=true` (`:182`) sur USD/US → cadrer Stripe Tax avant d'ouvrir Florida/PC pour ne pas bloquer des checkouts.

---

## 5. AUTOMATION (état)

9 workflows fonctionnels, **tous MQ/GP-only** : `daily-copernicus.yml` (cœur, 4×/j), `weekly-optimize`, `weekly-seo-automation`, `content-generation` (**seul coût $ — Anthropic API, budget refusé par le user**), `morning-brief`, `weekly-outreach`, `weekly-ux-report`, `ga4-diagnose`, `push-debug`. **`grep VITE_REGION|puntacana|getAllRegions .github/workflows/` = vide.** Aucun ne build/déploie une nouvelle région. Secrets FTP = `_MQ`/`_GP` uniquement.

**Donnée brute déjà dispo** : `fetch-caribbean-afai.cjs` couvre **8-28°N / 90-55°W** (toute la Caraïbe + Golfe Mexique + Atlantique) → PC/Florida/RM sont DANS cette zone. La donnée existe, elle n'est juste pas découpée par région au niveau beach.

---

## 6. PLAN D'EXÉCUTION PRIORISÉ (end-to-end)

**Garde-fou transversal (toutes phases)** : avant chaque merge, `VITE_REGION=mq npm run build` + `prepare-ftp` + `diff -r martinique-ftp/ <backup>` → **ZÉRO diff**. Idem GP.

### Phase 0 — Sécuriser (immédiat)
- Committer `regions/` (le moteur, actuellement perdable). Vérifier qu'aucun `stripe-config.php` / `.env` ne part avec.
- **Rotation `sk_live_` + `resend_key`** exposés dans `puntacana-ftp/api/stripe-config.php`. Corriger `.htaccess` PC.

### Phase 1 — CASH RAPIDE : finir Punta Cana (HTTPS + paiement + vrai contenu)
- **P0 contenu** : étendre `vite.config.js transformIndexHtml` (`:89-106`) pour réécrire le **body noscript + 4 blocs JSON-LD** depuis `REGION` (name/lang/beaches), pas seulement le head. Aujourd'hui PC ment à Google.
- **P0 paywall USD** : créer 2 Payment Links USD Stripe → champ `paymentLinks{}` dans `puntacana.json` → `Sargasses_PROD.jsx` lit `REGION.paymentLinks || {EUR}`. **Tester en Stripe TEST d'abord.**
- **P0 deploy** : régénérer `puntacana-ftp/` proprement (purge contenu MQ stale) ; `.htaccess`/`robots`/`sitemap`/`404` au domaine PC.
- **Infra** : cPanel addon domain → DNS A → AutoSSL/HTTPS → upload → CORS `create-checkout.php:5` + `sargassumpuntacana.com` → test paiement end-to-end.

### Phase 2 — Industrialiser le build/deploy N-régions (sans casser MQ/GP)
- `prepare-ftp.cjs` : `require('../regions/index.cjs')`, remplacer arrays figés (`:73-86`, `:21-24`, `:67-70`) par `getAllRegions()`. Extraire le bloc `if(dir==='guadeloupe-ftp')` (`:183-493`) en `writeRegionIndex(region)` paramétrée, **early-return chemin exact MQ/GP**.
- `manual-ftp-deploy.cjs` : `targets` (`:32-51`) depuis `getAllRegions()` + env `FTP_*_<ID>` (skip silencieux si creds absents — pattern `:107`).
- `npm run build:all` : boucle `VITE_REGION=<id> vite build --outDir dist-<id>` (outDir distinct, sinon `emptyOutDir` écrase).
- SW : bump `CACHE_NAME` + régénérer `version.json` au hash par ftpDir (auto, pas manuel).

### Phase 3 — Pipeline data live nouvelles régions
- `fetch-sargassum-live.cjs` : remplacer `BBOX`/`BEACHES` hardcodés (`:33-73`) par boucle `getAllRegions()`, `region.bbox`/`region.beaches`. Écrire `public/api/copernicus/<id>/sargassum.json`. **Garder alias racine pour MQ/GP** (rétro-compat sites live). Ajouter `coast`/`coastNormal` aux beaches nouvelles régions (modèle de menace).
- Runtime : lever `!IS_NEW_REGION` sur le merge live (`Sargasses_PROD.jsx:5051`) une fois `sargassum.json` régional dispo. Seuil island générique (pas `lat<15.5`). `MapView.jsx:10` : `REGION.center/zoom` (sinon map centre Martinique).

### Phase 4 — Cloner 1-2 domaines (Florida + RivieraMaya)
- Créer apps OneSignal → `onesignalAppId` réels. Injecter via `transformIndexHtml`. GA4 + Clarity + GSC **par domaine** (sinon trafic PC pollue la propriété MQ = source de vérité revenu). Ajouter `ga4Id`/`clarityId` au schéma.
- Runbook par domaine : achat → cPanel addon → DNS → build → ftp → HTTPS → stripe-config → GSC sitemap → GA4/Clarity → test paiement.

### Phase 5 — Lifecycle 100% auto + workflows
- Webhook Stripe signé (`webhook.php`) → remplace le faux POST client. Révocation auto sur `verify`. Cron réconciliation quotidien.
- `daily-copernicus.yml` : boucle data-deploy sur `ftpDir` de `getAllRegions()` ; full-build gated 1×/j ; secrets `FTP_*_<ID>`. Health-check par `r.domain`. **Attention quota** : data-only deploy par défaut, builds régionaux décalés (matrice naïve = explosion budget). Garder `content-generation` hors scope (coût $).
- `Code.js` : dict région indexé sur `payload.island` (remplacer défaut `'MQ'` + mapping binaire `:185`), funnel par devise.

**Ordre cash-first** : Phase 0 → 1 (PC live payant) → 3 (PC a de vraies données) → 4 (1 clone) → 2/5 (scaler proprement).

---

## 7. PIÈGES (ne jamais)

- Casser le rendu EUR/fr MQ/GP (diff binaire obligatoire). Ne pas toucher les Payment Links EUR `:348-349`, ni le funnel A/B en cours (`pw_prelude`/`pw_cta_order`, mesure 4-8 sem.).
- Re-déboguer le cache/SW (résolu). Ne jamais re-cacher `sw.js`/`version.json`.
- Déployer `puntacana-ftp/` tel quel (body MQ). Pointer `sargassumpuntacana.com` dessus avant vraies données = SEO cassé.
- Committer/exposer `sk_live`/`resend_key` (repo public). GA4/Clarity partagés → séparer avant tout lancement.
