# NEXT_SESSION — sargagame

*Session précédente : 2026-06-10 (nuit, ~05h). **3 sites USD en ligne** (Punta Cana, Cancún, Miami) + fix data MQ + workflows généralisés. ~19 commits locaux `59044da`..`85fde66` — **RIEN POUSSÉ** (le push déclenche un full build+deploy auto de toutes les régions).*

## 🎯 État cash USD

| Région | Domaine | Site | Payment Links LIVE | SSL |
|---|---|---|---|---|
| **Punta Cana** | sargassumpuntacana.com | ✅ **LIVE** (build region-aware, paywall USD, SW v25, webhook+config+API déployés) | ✅ $9.99/$79 (`prod_UfwY2ccTPRZkkI`) | ✅ |
| **Riviera Maya** | sargassumcancun.com (acheté 2026-06-09) | ✅ déployé, DNS propagé | ✅ (`prod_Ufy4txmZPNEHwP`) | ⏳ AutoSSL en attente |
| **Florida** | sargassummiami.com (acheté 2026-06-09) | ✅ déployé, DNS propagé | ✅ (`prod_Ufy4VXB7M8tFze`) | ⏳ AutoSSL en attente |
| Tulum | sargazotulum.com | 301 → sargassumcancun.com (.htaccess) | — | — |

- **Checkout TEST validé end-to-end** (PC, 4242 → redirect → Premium activé, sub `trialing` island=puntacana). Le checkout LIVE réel n'a pas été exécuté (= vrai paiement, à faire par l'user ou attendre le 1er client).
- **Webhook Stripe LIVE provisionné** : `we_1TgacyP9RK8Orx51i2avowKp` → MQ (1 seul endpoint pour toutes les régions, filtre `metadata.island`, forward Apps Script). Secret déployé MQ+GP+PC.
- **FTP** : comptes `claudedeploy@` créés pour les 3 nouveaux domaines (cf. mémoire `reference_ftp_creds.md`), creds en `.env` + secrets GitHub `FTP_{SERVER,USERNAME,PASSWORD}_{PUNTACANA,FLORIDA,RIVIERAMAYA}`. NB : `deploy@sargassumpuntacana.com` pré-existait (coexistence volontaire, comme MQ/GP).

## 🟢 Shipped cette session (commits clés)

- `c184134` Payment Links LIVE USD PC · `88d819c` domaines réels FL/RM + leurs Payment Links + audit-stripe-duplicates (zéro doublon trouvé)
- `5dd203f` **fix(map)** clic ambigu → zoom désambiguïsation (plages trop proches insélectionnables)
- `98a7c86` **fix(i18n)** + crash InstallPrompt (`lang` non défini depuis avril, 1 crash furtif/device) + _t(fr,en,es) écrans premium/install/feedback + SUPPORT_EMAIL région + SW v25
- `0848065` **fix(paywall)** exemples value-cards région-aware (fini Pc001/Sainte-Anne sur PC)
- `e73ac9b` **fix(pipeline)** : le 2026-06-09, TOUTE la MQ a flippé moderate (afai 0.05→0.21 overnight). Cause prouvée au pixel : correction 1D sur 8 pixels (4 saturés au cap capteur 4e-3) partagés par toutes les plages sauf tartane, base 7D pourtant clean (0.06-0.08). Fix : corr × min(1, n1D/20). Validé sur grilles réelles : 9 plages reviennent clean, tartane inchangée. **Le prochain run cron (4×/j) republie du vert.** Seuils/normalizeAfai intouchés (floor-ban respecté).
- `85fde66` **ci(actions)** : `daily-copernicus.yml` multi-régions — builds séquentiels nouvelles régions AVANT build MQ/GP partagé (ordre critique : dist/ écrasé), data-only copie `public/api/copernicus/<id>/*.json` → `<ftpDir>/`, deploy unique multi-secrets, skip silencieux sans creds, timeout 25→60 min.

## ⚠️ À FAIRE (ordre)

1. **PUSH les ~19 commits** (accord user requis) → full build+deploy auto des 5 régions + livre les fixes carte/i18n/crash/data aux users MQ/GP.
2. **Vérifier AutoSSL** cancun/miami (`curl -sI https://…` sans `-k`) — auto sous quelques heures, pas de trigger manuel sur ce plan cPanel.
3. **Premier checkout LIVE** PC (vrai paiement/trial — action user ou 1er client organique). Réconciliation webhook J+1 1-2 sem avant de retirer le POST client.
4. **Avis/communauté MQ** : pas un bug — dernier report in-app 27 mai, fb-reports gelé 13 avril (décroissance → 0). Relancer `fb-to-reports.cjs` + machine FB.
5. **Provisioning par nouvelle région** (bloque la généralisation des 8 autres workflows — audit complet dans le commit 85fde66 / mémoire) : GA4, Clarity, OneSignal app (`TBD_CREATE_ONESIGNAL_APP` dans les 3 configs), GSC + sitemaps, Resend domaines (SPF/DKIM).
6. **Contenu région-aware** pour content-generation (articles EN/ES par marché) — pré-requis avant de généraliser ce workflow.
7. **i18n reste** : ~188 ternaires fr/en sans branche ES (dict T es complet, écrans critiques fixés).
8. US sales tax : `automatic_tax` OFF sur tous les Payment Links USD — cadrer avant volume.

## Notes
- cPanel via SSO Namecheap (user se connecte à namecheap.com dans le navigateur piloté) : UAPI `Ftp::add_ftp` + `Fileman::save_file_content` OK ; AddonDomain/Domains UAPI **retirés** → API2 `json-api/cpanel?cpanel_jsonapi_module=AddonDomain&cpanel_jsonapi_func=addaddondomain`.
- Docroots : `/home/locazeqn/<domaine>/` pour tous les addon domains.
- A/B MQ/GP (`pw_cta_order`, `pw_prelude`) : ne pas toucher, mesure en cours.
