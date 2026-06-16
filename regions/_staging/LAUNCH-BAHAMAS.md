# LAUNCH — Bahamas (sargassum-bahamas.com)

Checklist ORDONNÉE. Les fichiers de ce dossier `_staging/` sont prêts et validés
(14 plages, coordonnées croisées OSM/Sandee/Wikipedia — y compris la correction
Treasure Cay 26.6772,-77.2800 : le pin Sandee/abacoescape pointait la marina, pas
la plage). `regions/index.cjs` les ignore tant qu'ils restent dans `_staging/`
(préfixe `_` skippé). NE RIEN déplacer avant l'étape 3.

Région : `bahamas` · ids plages `bs001..bs014` · USD no-trial · TZ America/Nassau ·
marché EN (mot-clé « sargassum », pas « sargasses »).

---

## 1. Acheter le domaine (user, Namecheap)

- [ ] **sargassum-bahamas.com** — vérifié LIBRE (DNS NXDOMAIN + RDAP Verisign 404).
      Match exact de l'orthographe EN utilisée par les touristes US + tiret aligné
      sur sargasses-martinique/guadeloupe.
- [ ] Recommandé en parallèle : **sargassumbahamas.com** (sans tiret, anti-typo) →
      301 vers le principal (pattern Tulum : addon + `.htaccess` via cPanel Fileman API).
- [ ] Si le plan principal est compromis au moment de l'achat : fallback
      `sargassumbahamas.com` seul, puis remplacer `domain` + `emails` dans
      `regions/_staging/bahamas.json` AVANT l'étape 3.
- [ ] DNS → pointer sur l'hébergement cPanel existant (mêmes NS que sargassummiami.com).

## 2. cPanel : addon domain + compte FTP claudedeploy

Pattern éprouvé (memory `reference_ftp_creds.md`, créations 2026-06-10) :
session **SSO Namecheap** → **cPanel UAPI**.

- [ ] Addon domain `sargassum-bahamas.com` → docroot `/home/locazeqn/sargassum-bahamas.com`.
- [ ] Compte FTP `claudedeploy@sargassum-bahamas.com`, home dir = docroot,
      mot de passe **24 caractères alphanumériques uniquement** (zéro métacaractère shell).
- [ ] Consigner le credential dans memory `reference_ftp_creds.md` (jamais dans le repo).
- [ ] Sanity : `curl -sI http://sargassum-bahamas.com` répond (même une coquille vide).

## 3. Déplacer les 3 fichiers de _staging/ vers leurs emplacements

```bash
git mv regions/_staging/bahamas.json              regions/bahamas.json
git mv regions/_staging/seo-content/bahamas.json  regions/seo-content/bahamas.json
git mv regions/_staging/resorts/bahamas.json      regions/resorts/bahamas.json
```

- [ ] `node -e "console.log(require('./regions/index.cjs').getRegion('bahamas').name)"`
      → `Bahamas` (les invariants island/bbox de index.cjs tournent au load).

## 4. Webhook Stripe : $KNOWN_REGIONS

- [ ] Ajouter `'bahamas'` à `$KNOWN_REGIONS` dans `public/api/stripe-webhook.php`
      (ligne ~111 : `['mq', 'gp', 'puntacana', 'florida', 'rivieramaya']`).
      **Le test de parité CI (`scripts/test-stripe-webhook.cjs`, gate de
      daily-copernicus, commit 854df3b) échouera tant que ce n'est pas fait — c'est
      voulu : impossible d'oublier.**
- [ ] Le PHP modifié part avec le prochain deploy FTP (il vit dans `public/api/`).

## 5. Payment Links Stripe (no-trial auto)

```bash
node scripts/create-region-payment-links.cjs bahamas
```

- `noTrial: true` dans le JSON → `TRIAL_DAYS = 0` automatique (leçon audit
  2026-06-12 / 6002431 : les sites USD promettent un prélèvement immédiat).
- Idempotent ; écrit `paymentLinks{}` + `stripeProducts{}` dans `regions/bahamas.json`.
- Option prudence : `STRIPE_KEY=sk_test_... node scripts/create-region-payment-links.cjs bahamas` d'abord.
- [ ] Vérifier les 2 liens en navigation privée : prélèvement immédiat, pas « 7 days free ».

## 6. Photos plages (Google Places → qualité → upscale)

```bash
GOOGLE_PLACES_KEY=... node scripts/download-google-photos.cjs --region=bahamas
node scripts/compute-photo-quality.cjs
# upscale Real-ESRGAN : générer scripts/tmp-wf-results/upscale-list.json
# (fichiers bs*.jpg < 1600px de public/beaches/) puis :
node scripts/upscale-photos.cjs
```

- [ ] Curation manuelle : vérifier les 14 photos (leçon FL session 40 — mangrove,
      carrefour). Plages à risque de POI générique : Pig Beach (cochons OK c'est
      le sujet), Volleyball Beach (Chat 'N' Chill), Gold Rock (marée basse = top).
- [ ] Re-run `compute-photo-quality.cjs` après remplacement éventuel.

## 7. Heroes vidéo DepthFlow

```bash
node scripts/video/depthflow-batch.cjs --only=bs
gh release upload depthflow-heroes assets/hero-depthflow/bs*.mp4 --clobber --repo aveca/sargagame
```

(Pool = photos qualité ≥85 ; le CI les télécharge depuis la release
`depthflow-heroes` à chaque daily build.)

## 8. Secrets GitHub Actions FTP

Convention réelle des workflows : `FTP_SERVER_* / FTP_USERNAME_* / FTP_PASSWORD_*`
(pas HOST/USER/PASS) :

```bash
gh secret set FTP_SERVER_BAHAMAS   --repo aveca/sargagame --body "ftp.locationvoituremartinique.com"
gh secret set FTP_USERNAME_BAHAMAS --repo aveca/sargagame --body "claudedeploy@sargassum-bahamas.com"
gh secret set FTP_PASSWORD_BAHAMAS --repo aveca/sargagame --body "<mdp étape 2>"
```

- [ ] **Éditer `.github/workflows/daily-copernicus.yml`** : ajouter les 3 lignes
      `FTP_*_BAHAMAS` dans l'env du step deploy régions (les secrets sont mappés
      EXPLICITEMENT par région, cf. lignes ~404-406 pour FLORIDA — la région est
      découverte automatiquement par `getAllRegions()` mais pas ses secrets).

## 9. Provisioning analytics / GSC

```bash
gh workflow run provision-ga4.yml --repo aveca/sargagame -f regions=bahamas
gh workflow run provision-gsc.yml --repo aveca/sargagame -f regions=bahamas
```

- [ ] Reporter le `ga4Id` retourné dans `regions/bahamas.json`.
- [ ] Clarity : projet créé À LA MAIN (pas d'API) → `clarityProjectId` dans le JSON.
- [ ] OneSignal : app web via le Chrome user (astuce formulaires Ember en memory
      `reference_ftp_creds.md`) → `onesignalAppId` dans le JSON + secret
      `ONESIGNAL_API_KEY_BAHAMAS` (format os_v2, header `Key`).
      Ajouter le mapping env dans daily-copernicus.yml (cf. ligne ~99 FLORIDA).
- [ ] GSC : propriété URL-prefix dans le Chrome user (token déjà en ligne via le workflow).

## 10. Push → build auto

- [ ] Commit + push `main` (regions/*.json + webhook PHP + workflow). Le push
      déclenche `daily-copernicus.yml` en full build : pipeline région
      `api/copernicus/bahamas/` + build Vite + pages SEO + deploy `bahamas-ftp/`.
- [ ] `gh run watch` — le gate parité webhook (étape 4) doit passer.

## 11. Vérifications live (leçons apprises — toutes obligatoires)

- [ ] **Pipeline** : `curl -s https://sargassum-bahamas.com/api/copernicus/bahamas/sargassum.json`
      → `source` ERDDAP, `dataAgeMinutes` < 720, 14 entrées `levels`.
- [ ] **Couches map ! (leçon 2026-06-11, e5e0901)** : heatmap AFAI + bancs VISIBLES
      sur la carte Bahamas. Le bug historique : split lat 15.5 MQ/GP vidait la grille
      des nouvelles régions + filtre bancs island mq|gp. Le fix est générique mais
      VÉRIFIER : grid points > 0 dans la bbox données (bbox affichage élargie
      -0.8/+0.8 lat, -0.7/+1.2 lng par `dataBboxFor`) et `banks[].island === "bahamas"`.
- [ ] **Pins** : 14 pins, zoom/center cadrent Nassau→Grand Bahama→Exumas
      (bbox volontairement large : archipel 4°×4.2°, zoom 7 continental — leçon
      clic Miami session 40).
- [ ] **Hubs SEO** : curl 200 sur `/sargassum-forecast/`, `/beaches-without-sargassum-today/`,
      `/seaweed-map/`, `/sargassum-season-bahamas/`, `/reliability/`, 2-3 pages
      `/beaches/<slug>/`, 2-3 `/resorts/<slug>/` (feedback_validate_hrefs : JAMAIS
      shipper un lien sans curl).
- [ ] **Paywall** : modal Premium → Payment Link → page Stripe SANS mention d'essai.
- [ ] **Sitemap + hreflang** : `/sitemap.xml` servi, hreflang en/es self-référents
      (leçon f1a8095).
- [ ] **SW/health** : `gh run list` propre le lendemain ; health-check inclut le
      nouveau domaine.

## Post-lancement (non bloquant)

- [ ] FB : `discover-groups` requêtes « Bahamas travel », « Exuma », « Eleuthera »
      (le canal réel des questions « is there seaweed now? » d'après l'étude marché).
- [ ] Drip email Resend : vérifier que l'expéditeur `alerts@sargassum-bahamas.com`
      est vérifié côté Resend avant d'activer la séquence.
- [ ] Backtest forecast après 2-3 semaines de données (`forecast-accuracy.json`)
      → la page `/reliability/` affichera des chiffres réels.
