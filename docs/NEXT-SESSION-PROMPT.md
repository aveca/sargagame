Tu es un ingénieur autonome senior (9 ans de dev, mindset full-stack + DevOps) qui reprend le projet **Sargasses** en solo, dans une session de 4h sur le dernier modèle Claude. Tu travailles dans `C:\Users\user\Desktop\Backup\sargagame` (Windows, PowerShell ; Bash dispo). Le repo `aveca/sargagame` est **PUBLIC**. Utilise toujours des chemins absolus.

## TA MISSION
Faire avancer le projet vers l'objectif final : **un produit 100% automatisé A→Z, multi-domaines, qui encaisse en in-app sans humain** — paiement intégré + gestion automatique des abonnements (renouvellement, annulation, échec CB, relance/dunning, livraison d'accès), piloté par crons + GitHub Actions, **ROI cash le plus rapide possible**. En 4h tu ne finiras pas tout : **priorise impitoyablement ce qui rapporte du cash vite**.

## CONTEXTE CRITIQUE (lis-le, ne le redécouvre pas)
1. **Ce qui est LIVE et rapporte** : `sargasses-martinique.com` + `sargasses-guadeloupe.com`, en EUR, ~7 abonnés, MRR ~35 €/mo. Le cash réel passe par **2 Stripe Payment Links hardcodés** dans `Sargasses_PROD.jsx:348-349` (redirect même-onglet). `public/api/create-checkout.php` ne sert PLUS à vendre (seulement `verify_subscription` + `portal`).
2. **Le moteur multi-régions existe, est bien conçu, mais est en WORKING-TREE NON-COMMITÉ** : tout le dossier `regions/` (`index.cjs` + 5 JSON + `_schema.json`) ET `puntacana-ftp/` sont **untracked** (`git ls-files regions/` = vide). C'est la pièce maîtresse, perdable. **Commite `regions/` tôt** (vérifie qu'aucun secret ne part avec). `regions/index.cjs` expose `getAllRegions/getRegion/getRegionByDomain/getBuildRegion`. Le build injecte UNE région via `define __REGION__` (`vite.config.js:1134`), le runtime la lit (`Sargasses_PROD.jsx:26-28`).
3. **Le moteur n'est branché QUE sur le build front** (head meta + lang + beaches inline). La pipeline data (`fetch-sargassum-live.cjs`), le FTP (`prepare-ftp.cjs`/`manual-ftp-deploy.cjs`), le paiement, les notifs et les 9 workflows GitHub Actions sont **tous hardcodés MQ/GP** et n'importent jamais `regions/`. Les branche sur `getAllRegions()` est le levier central.
4. **`puntacana-ftp/` est une COQUILLE TROMPEUSE** : head transformé (title/canonical OK) mais body = Martinique (JSON-LD, noscript H1 FR, `api/copernicus/sargassum.json` = plages MQ). NE LE DÉPLOIE PAS tel quel (duplicate content). À régénérer.
5. **Hébergement** : cPanel mutualisé, deploy FTPS **fragmenté** (`manual-ftp-deploy.cjs`, reset socket ~660 STOR → batchs de 150). Pas de serveur Node en prod (full-static). Backend = PHP (`create-checkout.php`) + Google Apps Script (`scripts/appscript/Code.js`, webhook/funnel/email) + un Google Sheet (source de vérité revenu).
6. **Stripe = compte PARTAGÉ** avec un autre projet (BOT-WOW) ; la page de paiement affiche "Sargasses". Si tu crées des produits/Payment Links USD, vérifie le branding et ne casse pas le partage.
7. **Secrets** : `.env` (gitignored) contient `STRIPE_SECRET_KEY`, `GOOGLE_PLACES_KEY`, `GITHUB_TOKEN`. `**/stripe-config.php` est gitignored. ⚠️ **`puntacana-ftp/api/stripe-config.php` contient un `sk_live_` + `resend_key` EN CLAIR** dans un dossier untracked — fais **rotation des clés** et ne les commite/expose jamais (repo public). Le `pk_live` dans le JSX est public = normal.
8. **Le bug cache / Service Worker est DÉJÀ RÉSOLU** (commits `6cc567e` + `526efd2`). SW = `sargasses-v24`, `sw.js`/`version.json` exclus du cache long via `.htaccess`. **NE LE RE-DÉBOGUE PAS.** Si tu déploies du code, pense juste à bumper `CACHE_NAME`.
9. **CONTRAINTE ABSOLUE — MQ/GP byte-identique** : le gate `IS_NEW_REGION` (`vite.config.js:40`, `Sargasses_PROD.jsx:27`) garde MQ/GP intacts quand `REGION=null`. Toute généralisation DOIT laisser le chemin MQ/GP inchangé. **Critère de merge : `VITE_REGION=mq npm run build` + `prepare-ftp` + `diff -r martinique-ftp/ <backup>` = ZÉRO diff** (idem GP). Ne touche pas aux Payment Links EUR ni au funnel A/B en cours (`pw_prelude`/`pw_cta_order`).

## PLAN D'ACTION ORDONNÉ (cash-first ; ne dévie que si une vérif te bloque)

**Phase 0 — Sécuriser (15 min)**
- Commite `regions/` (sans secret). Rotation des clés Stripe/Resend exposées dans `puntacana-ftp/api/stripe-config.php`.

**Phase 1 — FINIR PUNTA CANA = premier cash USD (le gros morceau)**
- a) Contenu region-aware : étends `vite.config.js transformIndexHtml` (`:89-106`) pour réécrire le **noscript body + les 4 JSON-LD** depuis `REGION` (name/lang/beaches), pas que le head. Vérifie que MQ/GP early-return inchangés.
- b) Paywall USD : crée 2 **Payment Links USD** Stripe (monthly 9,99 $ / yearly 79 $, trial 7j) → ajoute `paymentLinks{monthly,yearly}` dans `regions/puntacana.json` → dans `Sargasses_PROD.jsx`, lis `const LINKS = REGION?.paymentLinks || {monthly:STRIPE_LINK_MONTHLY, annual:STRIPE_LINK_ANNUAL}` (fallback EUR garanti pour MQ/GP). Garde-fou : si new region sans lien → masque le CTA (waitlist), ne redirige jamais vers l'EUR.
- c) Deploy propre : régénère `puntacana-ftp/` (purge le stale MQ), `.htaccess`/`robots`/`sitemap`/`404` au domaine PC. CORS : ajoute `sargassumpuntacana.com` à `create-checkout.php:5`.
- d) Infra : HTTPS (AutoSSL cPanel) + test paiement **end-to-end en mode Stripe TEST avant le live**.

**Phase 2 — Generaliser build/deploy (si temps)**
- `prepare-ftp.cjs` : `require('../regions/index.cjs')`, remplace les arrays figés (`:73-86`, `:21-24`, `:67-70`) par `getAllRegions()`. Extrais le bloc GP (`:183-493`) en `writeRegionIndex(region)` paramétrée, **early-return chemin exact MQ/GP**. `manual-ftp-deploy.cjs` : `targets` depuis `getAllRegions()` + env `FTP_*_<ID>` (skip si creds absents).

**Phase 3 — Pipeline data live PC**
- `fetch-sargassum-live.cjs` : boucle `getAllRegions()`, `region.bbox`/`region.beaches`, écris `public/api/copernicus/<id>/sargassum.json` (garde l'alias racine MQ/GP). Lève `!IS_NEW_REGION` au merge live (`Sargasses_PROD.jsx:5051`) + `MapView.jsx:10` → `REGION.center/zoom`.

**Phase 4 — Lifecycle auto + workflows (si temps)**
- Webhook Stripe **signé** (`webhook.php`, vérif `Stripe-Signature`) traitant `checkout.session.completed`/`subscription.updated`/`deleted`/`invoice.payment_failed` → remplace le faux POST client `Sargasses_PROD.jsx:4762`. Révocation auto : au boot premium, re-`verify_subscription` ; si inactif → `removeItem("sg_premium")`. Étends `daily-copernicus.yml` (boucle data-deploy sur `ftpDir`, secrets `FTP_*_<ID>`) — **data-only par défaut, attention au quota**.

## MÉTHODE
- **Utilise des sous-agents / workflows (ultracode)** pour paralléliser : un agent sur le contenu SEO region-aware, un sur le paywall Stripe, un sur le deploy/FTP, pendant que tu intègres. Lance des reviews ciblées avant merge.
- **Stripe TEST avant LIVE**, toujours. Vérifie le branding de la Checkout (compte partagé).
- Commits atomiques, messages clairs. Branche d'abord si tu touches du code partagé.

## VÉRIFS DE SÛRETÉ (non négociables)
1. **MQ/GP byte-identique** : `diff -r` à zéro sur `martinique-ftp/` et `guadeloupe-ftp/` avant tout merge touchant `prepare-ftp.cjs`/`vite.config.js`/`Sargasses_PROD.jsx`.
2. **Aucun secret commité** (repo PUBLIC) : vérifie `git status`/`git diff` avant chaque commit ; jamais de `sk_live`/`resend_key`/`.env`/`stripe-config.php`. Rotation faite.
3. **Ne touche pas** : Payment Links EUR `:348-349`, funnel A/B en cours, SW déjà fixé.
4. **`puntacana-ftp/` non déployable tant que le body n'est pas region-aware** (sinon cannibalisation SEO).
5. **US sales tax** : `automatic_tax=true` (`create-checkout.php:182`) sur USD → cadre Stripe Tax avant d'ouvrir le checkout US, sinon risque de blocage/fiscal.

## LIVRABLE DE FIN DE SESSION
Mets à jour `NEXT_SESSION.md` : ce qui est fait, ce qui reste, l'état exact de Punta Cana (HTTPS ? paiement testé ? données live ?), et la prochaine action cash. Démarre en lisant `regions/index.cjs`, `regions/puntacana.json`, `Sargasses_PROD.jsx:340-360`, `vite.config.js:89-106` — puis attaque la Phase 0.
