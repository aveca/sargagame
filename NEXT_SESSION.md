# NEXT_SESSION — sargagame

*Session précédente : 2026-06-10 (matinée ~04-06h UTC). **CI multi-régions VERT, carte MQ re-verte (purge mémoire), marketing Punta Cana lancé (post live dans un groupe 193K), provisioning GSC/GA4 automatisé à 2 clics près.** Tout est poussé.*

## 🎯 État cash USD

| Région | Domaine | Site | Payment Links LIVE | SSL |
|---|---|---|---|---|
| **Punta Cana** | sargassumpuntacana.com | ✅ LIVE complet | ✅ $9.99/$79 | ✅ |
| **Riviera Maya** | sargassumcancun.com | ✅ déployé | ✅ | ⏳ AutoSSL (cert partagé encore servi à 04h UTC — si >12h, cPanel SSL/TLS Status) |
| **Florida** | sargassummiami.com | ✅ déployé | ✅ | ⏳ idem |

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

## ⚠️ À FAIRE (ordre)

1. **2 clics humains Google, puis tout est automatique** :
   - Enable **Site Verification API** : https://console.developers.google.com/apis/api/siteverification.googleapis.com/overview?project=48071671409
   - GA4 Admin → compte « comptegoogleanalytics » (276662454) → Account Access Management → passer le service account en **Editor**.
   - Puis : `gh workflow run provision-gsc.yml` + `gh workflow run provision-ga4.yml` → GSC vérifié + sitemaps soumis + propriétés GA4 créées (le run imprime les G-XXXX). Reporter les G-XXXX dans `regions/*.json` (`ga4Id`), bump SW (v25→v26), push (= rebuild auto).
2. **Vérifier la carte MQ verte en prod** après le run en cours + demander à l'user un hard-refresh (SW v25) pour confirmer les fixes carte/clics.
3. **AutoSSL cancun/miami** : `curl -sI https://…` sans `-k`. Si toujours cert partagé >12h après création (≈14h UTC), cPanel SSL/TLS Status (session SSO Namecheap, user se logge dans la fenêtre Playwright).
4. **Réconciliation webhook J+1** (2026-06-11).
5. **FB quotidien** : re-run `fb-find-groups.cjs --dry` (voir approbations passées member), poster via `fb-post-groups.cjs` (lit le dernier `marketing/fb-posts-*.json` — en créer un frais avec les données du jour), 2e vague joins (`Monitoreo de sargazo Punta Cana` 26K, Hard Rock 22K, RIU Palace…). ⚠️ 1 seul Edge sur `.fb-session-edge/` à la fois.
6. **OneSignal (3 apps) + Clarity (3 projets)** : pas d'API de création — login user dans la fenêtre Playwright (OneSignal accepte aussi une clé Org API si l'user la colle).
7. Contenu région-aware (content-generation EN/ES) + i18n restant (~188 ternaires sans ES) + sales tax US (`automatic_tax` OFF partout).

## Notes
- ⚠️ Navigateur : le MCP Playwright pilote SA PROPRE fenêtre — le Chrome normal de l'user y est invisible. L'user tape ses creds dans la fenêtre pilotée (pattern validé : Stripe, Namecheap).
- Scripts FB et automation marketing : volontairement NON committés (repo public). `submit-indexnow.cjs`, `fb-find-groups.cjs` etc. vivent en local.
- cPanel sans creds : Namecheap SSO → GO TO CPANEL → token cpsess → UAPI Ftp/Fileman OK, AddonDomain via json-api API2. DNS : ZoneEdit API2.
- A/B MQ/GP (`pw_cta_order`, `pw_prelude`) : ne pas toucher.
- MRR : €34,93 (7 payants EUR). Premier cash USD = checkout LIVE PC réel (action user ou 1er client organique).
