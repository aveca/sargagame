# NEXT_SESSION — sargagame

*Session précédente : 2026-06-10 (~03h30 local). Payment Links LIVE créés, checkout TEST validé, webhook provisionné en prod, fixes carte/i18n/paywall. 4 commits : `c184134`..`0848065` (au-dessus des 12 de la veille — TOUJOURS RIEN POUSSÉ).*

## 🎯 État Punta Cana (premier cash USD)

| Jalon | État |
|---|---|
| Payment Links Stripe **LIVE USD** ($9.99/mo · $79/yr, trial 7j) | ✅ créés + écrits dans `regions/puntacana.json` (`prod_UfwY2ccTPRZkkI`) |
| Checkout **TEST** end-to-end (4242 → redirect → "Premium activé" → sub `trialing` `island=puntacana`) | ✅ validé (produit TEST `prod_UfwUk3iYVFw8uM`) |
| Build PC final (paywall USD live, EN, exemples plages PC, SW v25) | ✅ `puntacana-ftp/` régénéré, vérifié au navigateur en local |
| **Déploiement** de `puntacana-ftp/` | ❌ **SEUL BLOCKER CASH** — creds FTP PC toujours hors workspace (pas non plus dans les GH secrets, vérifié). La vieille coquille MQ/GP est encore en ligne. |
| Webhook Stripe signé | ✅ **provisionné en prod** : endpoint LIVE `we_1TgacyP9RK8Orx51i2avowKp` → `https://sargasses-martinique.com/api/stripe-webhook.php` (4 events), secret dans `stripe-config.php` déployé MQ+GP (`deploy-stripe-config.cjs`). Probes : 400 sans signature / 405 GET / 403 data-log. **UN SEUL endpoint** (pas 3) : le PHP forward tout au même Apps Script avec filtre `metadata.island` — 3 endpoints = forwards en triple + 3 secrets pour 1 config. PC pas encore poussé (creds), MQ/GP suffisent (l'event arrive chez Stripe, pas chez le payeur). |
| Paiement LIVE réel testé | ❌ après deploy PC (le redirect retombe sur la coquille tant que pas déployé) |

**Prochaine action cash** : obtenir les creds FTP PC (ou login cPanel dans le navigateur → créer un compte `claudedeploy@sargassumpuntacana.com` comme fait pour MQ/GP en avril) → `FTP_HOST_PUNTACANA`/`FTP_USER_PUNTACANA`/`FTP_PASS_PUNTACANA` dans `.env` → `ONLY=puntacana node scripts/manual-ftp-deploy.cjs` → test checkout LIVE (petit vrai paiement ou trial) → marketing PC.

## 🟢 Shipped cette session (4 commits)

1. `c184134` Payment Links LIVE USD écrits dans `regions/puntacana.json`.
2. `5dd203f` **fix(map) clic ambigu** : ≥2 centres de pins à <18px du doigt → `setView` +2 zooms sur le point cliqué (cap zoom 15) au lieu de router au plus proche (la plage du dessous était insélectionnable — signalé 3× par l'user). `src/MapView.jsx`.
3. `98a7c86` **fix(i18n) + crash InstallPrompt** : `lang` référencé sans définition depuis `dabafa2` (avril) → ReferenceError au 1er render du prompt PWA (crash furtif 1×/device : flag localStorage posé avant le render). + traduction `_t(fr,en,es)` : toast premium, manage portal (alerts/prompts), "déjà abonné", install PWA iOS/Android, FeedbackWidget. + `SUPPORT_EMAIL` région-aware. + SW `CACHE_NAME` v24→v25.
4. `0848065` **fix(paywall) exemples région-aware** : `_topName` lookup `REGION.beaches` (sinon "Pc001"), cartes 02/03 avec plages PC (Cabeza de Toro/Playa Blanca/Macao) au lieu de Sainte-Anne/Les Salines/Grande Anse.

**Non-régression MQ/GP re-prouvée** : rebuild MQ → strings FR identiques, 0 réf `lang` libre, 0 fuite `sargassumpuntacana`, exemples paywall MQ inchangés.

## 📊 Diagnostic data MQ (plainte user "tout reset / côte caraïbe marron / plus d'avis")

- **Data live fraîche** (erddap-live, 4×/j) — PAS un bug de pipeline : la prod tourne sur l'ANCIEN code (rien poussé). Côte caraïbe (grande-anse, anse-mitan, anse-noire, anse-madame) à `afai 0.22-0.23 → moderate` = composante offshore du bloom record 2026 qui bave sur la côte ouest (`combined-XXXnear-3604off`). Sud à 0.21. À **croiser avec source externe** (sargassummonitoring / USF) avant tout "fix" — interdit de re-toucher les seuils (cf. `feedback_forecast_floor_ban`).
- **Avis users "disparus"** : pas un bug — décroissance exponentielle + AUCUN report frais (dernier user report 27 mai, fb-reports.json gelé au 13 avril). Relancer la machine FB (`fb-to-reports.cjs`) et/ou les reports in-app.
- **PC "12/12 clean"** : tous à `afai 0.12` (sous le seuil 0.15), mesures ERDDAP réelles. Crédibilité à vérifier vs terrain avant marketing (juin 2026 = saison record, les resorts ratissent quotidiennement).

## ⚠️ RESTE À FAIRE

1. **Creds FTP PC** (blocker cash) — voir ci-dessus.
2. **PUSH** : 16 commits locaux (12 région + 4 session). Le push déclenche full build+deploy MQ/GP via Actions → livre les fixes carte/i18n/crash aux users MQ/GP. L'user a demandé les fixes → pousser dès qu'il confirme.
3. **Réconciliation webhook** : J+1 pendant 1-2 sem, count+sum par région (tab payments Apps Script) vs Stripe, AVANT de retirer le POST client (`Sargasses_PROD.jsx:~4825`).
4. **Test event Stripe dashboard** : "Send test event" sur l'endpoint → vérifier 200 + ligne Apps Script (fait : probes HTTP seulement, pas d'event signé réel encore).
5. **i18n reste** : ~188 ternaires `lang==="en"?fr:en` sans branche ES (ES = lang secondaire PC/RM). Le dict `T` a déjà es complet. Pass dédiée si l'ES devient prioritaire.
6. **Provisioning lancement PC** : GA4+Clarity dédiés, OneSignal app (`TBD_CREATE_ONESIGNAL_APP`), Resend domaine PC (SPF/DKIM), GSC+sitemap. US sales tax : `automatic_tax` OFF — cadrer avant volume.
7. **Généraliser les 9 workflows GH Actions** (MQ/GP-only) : `daily-copernicus.yml` build+data-deploy par `ftpDir` + secrets `FTP_*_<ID>`.
8. **florida + rivieramaya** : même chemin que PC (Payment Links script prêt, data tourne).

## Notes sécurité
- Secret webhook : dans `public/api/stripe-config.php` (gitignoré) + déployé. Jamais en git (vérifié sur les 4 commits).
- `.env` : + creds FTP MQ/GP (claudedeploy, copiés de la mémoire), STRIPE_SECRET_KEY live.
- Clé TEST Stripe : lisible dashboard → Developers → API keys (mode test), pas stockée en local.

## 📊 A/B tests en cours (MQ/GP — ne pas toucher)
`pw_cta_order` + `pw_prelude`, mesure 4-8 sem. Funnel : `curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel"`.
