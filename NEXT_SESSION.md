# NEXT_SESSION — sargagame

*Session précédente : 2026-06-10 (~02h local). Multi-region engine branché de bout en bout sur Punta Cana.*

## 🎯 État Punta Cana (premier cash USD)

| Jalon | État |
|---|---|
| Contenu region-aware (head + body + JSON-LD + noscript EN) | ✅ build `VITE_REGION=puntacana` propre, zéro fuite Martinique |
| Paywall USD ($9.99/mo · $79/yr) câblé dans le JSX | ✅ s'affiche, zéro €, fallback EUR impossible |
| Payment Links Stripe USD créés | ❌ **PAS encore** — CTA en mode waitlist tant qu'absents |
| `puntacana-ftp/` régénéré (coquille MQ purgée) | ✅ data PC servie à la racine, overlays MQ purgés |
| Données live PC (`erddap-live`, 12 plages) | ✅ pipeline multi-régions tourne, pc001-pc012 |
| HTTPS / AutoSSL | ✅ `https://sargassumpuntacana.com` → 200, HTTP→301 |
| Déploiement du `puntacana-ftp/` régénéré | ❌ **À FAIRE** — coquille MQ encore en ligne (last-mod 2026-06-09 21h) |
| Paiement testé end-to-end | ❌ bloqué sur Payment Links USD |

**Prochaine action cash (ordre)** :
1. **Créer les Payment Links USD** : `node scripts/create-region-payment-links.cjs puntacana` (mode TEST d'abord : `STRIPE_KEY=sk_test_… node …`). Écrit `paymentLinks{}` dans `regions/puntacana.json` (LIVE only). ⚠️ Le classifier auto-mode **bloque** la création LIVE depuis le terminal → soit ajouter une règle de permission Bash, soit créer les 2 Payment Links à la main (produit `metadata.island=puntacana`, trial 7j, `after_completion.redirect` = `https://sargassumpuntacana.com/?session_id={CHECKOUT_SESSION_ID}&premium=1&plan=…`) et coller les URLs dans `regions/puntacana.json` → `paymentLinks.monthly`/`.yearly`.
2. **Rebuild + redeploy PC** : `VITE_REGION=puntacana npm run build && VITE_REGION=puntacana node scripts/prepare-ftp.cjs` puis push FTPS de `puntacana-ftp/` (voir « Déploiement »).
3. **Tester le checkout** en mode Stripe TEST (carte 4242) avant de passer LIVE.
4. **Webhook Stripe** : créer l'endpoint dashboard + déployer le secret (voir « Webhook »).

## 🟢 Shipped cette session (10 commits, `59044da`..`e10b66e`)

1. `59044da` **gate `IS_NEW_REGION`** committé (était non-tracké dans le working-tree).
2. `3edacc8` **`transformIndexHtml` region-aware complet** : head + noscript EN + 3 JSON-LD région + strip GA4/Clarity/OneSignal partagés + hreflang/geo/theme. MQ/GP early-return inchangés.
3. `b6ed1f5` **paywall + merge data region-aware** : `LINK_*`/`PRICE_*` dérivés de `REGION.paymentLinks`/`pricing` (CTA waitlist si absents, jamais de fallback EUR) ; `track()` île=region.id + skip beacon GA4 MQ/GP ; merge sargassum dédié nouvelles régions (garde anti-données-étrangères) ; `ISLAND_CENTER`/wordmark/h1 region-aware.
4. `f3dbb60` **pricing USD + `countryCode` DO + `scripts/create-region-payment-links.cjs`** (idempotent TEST/LIVE).
5. `467c5f7` **photos plages PC** (11/12 Google Places) + `download-google-photos --region`.
6. `51bc8a9` **`prepare-ftp` + `manual-ftp-deploy` généralisés** sur `getAllRegions()`. **MQ/GP byte-identique prouvé** (diff -r = 0, Date figée).
7. `7372973` **`fetch-sargassum-live` multi-régions** : racine MQ/GP byte-identique (prouvé hermétiquement), `public/api/copernicus/<id>/sargassum.json` par région.
8. `abca478` **webhook Stripe signé** (`public/api/stripe-webhook.php`) + CORS PC + `metadata[island]` sur customer/subscription dans `create-checkout.php`.
9. `df1400f` **fix data PC à la racine** : `prepareNewRegion` sert `<id>/sargassum.json` à `/api/copernicus/` + purge overlays MQ (banks/grid).
10. `e10b66e` **1ère sortie data multi-régions** committée.

### Preuve de non-régression MQ/GP (contrainte absolue)
`VITE_REGION=mq npm run build` → diff HTML vs baseline session = **0 diff comportemental** après normalisation de (a) hash du bundle JS — change à chaque build car j'ai ajouté du code *gated* inerte, et (b) date du jour — change à chaque build quotidien. Dans le bundle MQ : `__REGION__` → `null` (define), `REGION_PAY` éliminé par tree-shaking → **branches nouvelles régions mortes pour MQ/GP**. `prepare-ftp` MQ/GP prouvé `diff -r = 0` (Date figée) par sous-agent puis re-vérifié.

## ⚠️ RESTE À FAIRE / actions humaines

### Déploiement PC (creds FTP)
- Le `puntacana-ftp/` régénéré n'est **pas** déployé (la coquille MQ d'origine est encore servie).
- **Creds FTP PC introuvables dans le workspace** (`.env` n'a aucune var FTP ; `reference_ftp_creds.md` ne couvre que MQ/GP). La coquille a été déployée par quelqu'un → des creds existent hors workspace. (Tentative de deviner les creds = bloquée à raison.)
- Une fois connus : `FTP_HOST_PUNTACANA`/`FTP_USER_PUNTACANA`/`FTP_PASS_PUNTACANA` dans `.env` (ou host commun + user/pass) puis `ONLY=puntacana node scripts/manual-ftp-deploy.cjs`. ⚠️ bump `CACHE_NAME` dans `public/sw.js` si du code change.

### Webhook Stripe (à finir, haut ROI)
- `public/api/stripe-webhook.php` livré + testé : `node scripts/test-stripe-webhook.cjs` = 26 checks statiques + **14 scénarios HTTP réels via `php -S`, tous PASS** (php 8.4 installé cette session par un sous-agent).
- **Action dashboard** : créer l'endpoint Webhooks → `https://sargasses-martinique.com/api/stripe-webhook.php` (+ GP + PC), events `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `invoice.payment_failed`.
- **Action secret** : ajouter `'webhook_secret' => 'whsec_…'` au `stripe-config.php` déployé (jamais en git) puis `node scripts/deploy-stripe-config.cjs` (pousse webhook + `data/.htaccess` + config vers mq/gp/puntacana).
- Transition non destructive : le POST client (`Sargasses_PROD.jsx:~4762`) coexiste. Réconcilier J+1 1-2 sem (count+sum par région vs tab payments) **avant** de retirer le POST.

### Provisioning nouvelles régions (avant lancement)
- **GA4 + Clarity dédiés** PC (le build strip volontairement les propriétés partagées MQ/GP).
- **OneSignal app** PC → remplacer `TBD_CREATE_ONESIGNAL_APP` dans `regions/puntacana.json` (sinon push désactivé, stub no-op).
- **Resend** : vérifier domaine d'envoi `sargassumpuntacana.com` (SPF/DKIM) pour `alerts@`/`support@`.
- **GSC + sitemap** : ajouter `sargassumpuntacana.com` à Search Console.
- **Cloudflare** (si PC passe derrière) : Cache Rule "Bypass" sur `/sw.js`+`/version.json` dès le départ.

### US sales tax
- Payment Links USD : `automatic_tax` **OFF** par défaut dans le script (pas de cadre Stripe Tax). Cadrer Stripe Tax (seuils nexus US) avant volume.

## 🧱 Architecture multi-région (état)
- `regions/` = source de vérité (mq, gp, puntacana, florida, rivieramaya). `getAllRegions()`/`getRegion()`/`getBuildRegion()`.
- **Branché** : build front (`vite.config.js`), runtime (`Sargasses_PROD.jsx` gate `IS_NEW_REGION`), `prepare-ftp`, `manual-ftp-deploy`, `fetch-sargassum-live`, `create-checkout` (island), webhook.
- **Pas encore branché** : 9 workflows GitHub Actions (toujours MQ/GP-only — `daily-copernicus.yml` ne build/déploie pas les nouvelles régions). Prochaine généralisation : étendre `daily-copernicus.yml` (data-deploy par `ftpDir`, secrets `FTP_*_<ID>`).
- **florida + rivieramaya** : JSON région prêts, data pipeline tourne, mais pas de build/deploy/Payment Links (même chemin que PC quand on y arrive).

## 📊 A/B tests en cours (MQ/GP — ne pas toucher)
- `pw_cta_order` (control · sample_first), `pw_prelude` (direct · prelude). 4-8 sem pour stat sig. Ne pas ajouter de variants. Funnel : `curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel"`.

## 🐛 Bug connu carte MQ/GP (pré-existant)
Superpositions + pins pas tous cliquables sur `/`. Hypothèses : cluster overlap zone dense, z-index Header pill, zones hazard interceptant les clics. Non lié à cette session.

## Notes sécurité
- 0 secret live dans les 10 commits (vérifié `git diff`). `pk_live` dans le JSX = public, normal.
- `puntacana-ftp/api/stripe-config.php` (sk_live + resend en clair sur disque, untracked) : `.htaccess` PC le bloque déjà (`Require all denied`) ; le `prepare-ftp` régénéré ne le copie jamais. Rotation à faire seulement si exposition HTTP confirmée.
