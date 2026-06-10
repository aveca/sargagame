# NEXT_SESSION — sargagame

*Session précédente : 2026-06-10 (matinée ~04-06h UTC). **CI multi-régions VERT, carte MQ re-verte (purge mémoire), marketing Punta Cana lancé (post live dans un groupe 193K), provisioning GSC/GA4 automatisé à 2 clics près.** Tout est poussé.*

## 🎯 État cash USD

| Région | Domaine | Site | Payment Links LIVE | SSL |
|---|---|---|---|---|
| **Punta Cana** | sargassumpuntacana.com | ✅ LIVE complet | ✅ $9.99/$79 | ✅ |
| **Riviera Maya** | sargassumcancun.com | ✅ déployé | ✅ | ✅ (émis ~04h UTC) |
| **Florida** | sargassummiami.com | ✅ déployé | ✅ | ✅ |

- **Aucun paiement USD encore** — réconciliation webhook J+1 à faire (count+sum par région vs tab payments Apps Script). Ne PAS retirer le POST client avant 1-2 sem de parité.
- Webhook LIVE `we_1TgacyP9RK8Orx51i2avowKp` → MQ, filtre metadata.island, déployé MQ+GP+PC.

## 🟢 Shipped 2026-06-10 (matin)

- **Run 27250167625 SUCCESS** = 1er full build multi-régions (5 sites auto-déployés sur push).
- `faa1a07` **purge mémoire jour corrompu** : le fix e73ac9b marchait (satellite 0.13) mais la beach memory gardait le 9 juin corrompu (0.21-0.23) → 9 plages moderate à tort. Entrée history du 09-06 interpolée 08↔10 (toutes <0.15 = inertes). **MQ 10/10 clean vérifié localement.** Leçon : jour corrompu = purger history.json EN PLUS du fix code.
- `9bcb780` **fix leads** : email/feedback POSTs étaient hostname-only → un lead PC partait island=MQ. 3 occurrences alignées sur IS_NEW_REGION. Bundle MQ prouvé inchangé.
- `46c1c50` **GA4/Clarity région-aware** : vite injecte `ga4Id`/`clarityProjectId` des configs (placeholders TBD posés). Build MQ byte-identique (diff -r = 0).
- `42ef0d3` **emails** : welcome EN/ES via sender MQ (`Sargassum <Region> <alerte@sargasses-martinique.com>`, pattern GP, Resend free = 1 domaine), drip skip non-MQ/GP.
- `a68798c`+`58a774c` **provision-gsc.cjs / provision-ga4.cjs** + workflows dispatch (voir ci-dessous).
- **Marketing PC (ZERO MANUAL)** : `fb-find-groups.cjs` (nouveau, search+join+réponses questions d'admission). Membre de **Punta Cana Travel (193K)** + Punta Cana Tips 2026. **1er post publié dans le groupe 193K** (03:57Z, pc-status-travel-en, données du jour 12/12 clean + lien). 8 joins en attente d'approbation : CENTRO DE MONITOREO DE SARGAZO BÁVARO (84K), All-Inclusive (93K), Bahia Principe (61K), Sunscape (36K), Occidental (33K), Royalton, RIU, Vacaciones&Turismo. Posts EN/ES/FR : `marketing/fb-posts-2026-06-10.json`.
- **IndexNow** 5 domaines (202), script généralisé. Sitemaps/robots vérifiés sur les 3 nouveaux sites.
- **Communauté MQ relancée** : fb-scrape→analyze→to-reports → 3 plages, committé.

## ✅ Provisioning outils — FAIT cette session (via le Chrome de l'user, MCP Claude in Chrome)

- **GSC** : 3 propriétés URL-prefix vérifiées (token FILE uploadé FTPS + validation auto). Sitemaps soumis. `provision-gsc.yml` opérationnel (re-dispatchable).
- **GA4** : SA `seo-automation` passé **Éditeur** au compte 276662454 → `provision-ga4.yml` a créé les 3 propriétés + streams : puntacana **G-ZSPG79DBQB**, florida **G-3LYNDLV1VH**, rivieramaya **G-YHCQGRPG8G**.
- **Clarity** : 3 projets créés : puntacana **x4orv6qepl**, florida **x4ov7qlguf**, rivieramaya **x4ox737k79**.
- IDs injectés dans `regions/*.json`, build PC vérifié (GA4/Clarity dédiés présents, zéro fuite MQ), MQ byte-identique (215 HTML hash-only, 0 diff contenu), SW v27, poussé (c4ceac4 → rebuild+redeploy auto des 3 régions avec analytics actifs).

## ⚠️ À FAIRE (ordre)

1. **Vérifier en prod après le run analytics** : GA4 G-ZSPG79DBQB + Clarity x4orv6qepl dans le HTML de sargassumpuntacana.com ; head ES sur sargassumcancun.com ; carte MQ verte (hard-refresh SW **v27**).
2. **OneSignal (3 apps)** : seul outil restant — pas d'API de création, login user dans le Chrome piloté (remplacer `onesignalAppId: TBD` dans les 3 configs, rebuild). Resend : nouvelles régions routées via sender MQ (fait, plan free 1 domaine).
3. **Réconciliation webhook J+1** (2026-06-11) — toujours 0 paiement USD.
4. **SEO = le vrai moteur USD** : GSC vient de démarrer l'horloge (sitemaps soumis aujourd'hui). Suivre l'indexation sous 1-2 sem. C'est le canal scalable, vs FB qui ne fait que semer.
5. **FB = canal d'amorçage léger, PAS la priorité** (cf. data : blitz avril = +4 payants/10j mais flat +1 sur 47j ensuite ; les groupes resort sont promo-hostiles, « composer not found » = modération). 2 membres (Punta Cana Travel 193K, Tips 2026), 1 post live, 8 joins en attente. Quand approuvés → `fb-post-groups.cjs` (Chrome maintenant, pas Edge — scripts switchés). 2e vague : Monitoreo sargazo PC 26K, Hard Rock 22K. ⚠️ **session FB Chrome à re-logger 1× : `.fb-session-chrome/` neuf** (scripts basculés d'Edge vers Chrome à ta demande).
6. Contenu région-aware (content-generation EN/ES) + i18n restant (~188 ternaires sans ES) + sales tax US (`automatic_tax` OFF partout).

## Notes
- ⚠️ Navigateur : le MCP Playwright pilote SA PROPRE fenêtre — le Chrome normal de l'user y est invisible. L'user tape ses creds dans la fenêtre pilotée (pattern validé : Stripe, Namecheap).
- Scripts FB et automation marketing : volontairement NON committés (repo public). `submit-indexnow.cjs`, `fb-find-groups.cjs` etc. vivent en local.
- cPanel sans creds : Namecheap SSO → GO TO CPANEL → token cpsess → UAPI Ftp/Fileman OK, AddonDomain via json-api API2. DNS : ZoneEdit API2.
- A/B MQ/GP (`pw_cta_order`, `pw_prelude`) : ne pas toucher.
- MRR : €34,93 (7 payants EUR). Premier cash USD = checkout LIVE PC réel (action user ou 1er client organique).
