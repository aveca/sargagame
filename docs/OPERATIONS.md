# Operations — Runbook

> Mise à jour : 2026-06. Repo **public** : ce fichier liste des **noms** de secrets, jamais de valeurs.
> Voir aussi : [ARCHITECTURE.md](ARCHITECTURE.md) et [DATA-PIPELINE.md](DATA-PIPELINE.md).

## 1. Secrets GitHub Actions (inventaire complet)

30 secrets sur `aveca/sargagame` (`gh secret list --repo aveca/sargagame` pour l'état à jour).

### Conventions de nommage

- **FTP** : `FTP_SERVER_<ID>`, `FTP_USERNAME_<ID>`, `FTP_PASSWORD_<ID>` où `<ID>` = id de région en **MAJUSCULES** (`MQ`, `GP`, `PUNTACANA`, `FLORIDA`, `RIVIERAMAYA`). `manual-ftp-deploy.cjs` accepte aussi les alias `FTP_HOST_<ID>` / `FTP_USER_<ID>` / `FTP_PASS_<ID>`, et un host commun `FTP_HOST`/`FTP_SERVER` si seuls user/pass sont fournis.
- **OneSignal** : `ONESIGNAL_API_KEY_<ID>` (même `<ID>` majuscule), une clé REST API par app OneSignal régionale.

### Inventaire

| Secret | Rôle | Où le régénérer |
|---|---|---|
| `ANTHROPIC_API_KEY` | Génération de contenu SEO (`content-generation.yml`) — API payante, hors forfait Claude Code | console.anthropic.com → API Keys |
| `APPS_SCRIPT_URL` | URL de l'exec Apps Script (funnel, emails, clean_bounces) | script.google.com → Deploy → Manage deployments (redeploy via clasp, voir mémoire `reference_apps_script_deploy`) |
| `COPERNICUS_USERNAME` / `COPERNICUS_PASSWORD` | Fallback scraper Copernicus Marine si ERDDAP down | data.marine.copernicus.eu → My Account |
| `FTP_SERVER_MQ`, `FTP_USERNAME_MQ`, `FTP_PASSWORD_MQ` | Deploy FTPS sargasses-martinique.com (compte `claudedeploy@`) | Panel de l'hébergeur du domaine → comptes FTP |
| `FTP_SERVER_GP`, `FTP_USERNAME_GP`, `FTP_PASSWORD_GP` | Deploy FTPS sargasses-guadeloupe.com | idem |
| `FTP_SERVER_PUNTACANA`, `FTP_USERNAME_PUNTACANA`, `FTP_PASSWORD_PUNTACANA` | Deploy FTPS sargassumpuntacana.com | idem |
| `FTP_SERVER_FLORIDA`, `FTP_USERNAME_FLORIDA`, `FTP_PASSWORD_FLORIDA` | Deploy FTPS sargassummiami.com | idem |
| `FTP_SERVER_RIVIERAMAYA`, `FTP_USERNAME_RIVIERAMAYA`, `FTP_PASSWORD_RIVIERAMAYA` | Deploy FTPS sargassumcancun.com | idem |
| `GA4_ACCOUNT` | ID du compte GA4 parent — `provision-ga4.yml` y crée les propriétés des nouvelles régions | analytics.google.com → Admin → Account settings |
| `GA4_PROPERTY_ID_MQ` / `GA4_PROPERTY_ID_GP` | Lecture GA4 Data API pour les rapports (weekly-optimize, weekly-seo, weekly-ux, ga4-diagnose) | analytics.google.com → Admin → Property settings (ID numérique) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Clé JSON du service account Google : GSC API, GA4 API, Sheets (subscribers), Indexing API | console.cloud.google.com → IAM → Service Accounts → Keys (révoquer l'ancienne, en générer une nouvelle, coller le JSON entier) |
| `GSC_HUMAN_OWNER` | Email du propriétaire humain GSC — `provision-gsc.yml` le délègue sur les nouvelles propriétés | Valeur = adresse Google de l'utilisateur (pas de dashboard) |
| `ONESIGNAL_API_KEY_MQ` / `_GP` / `_PUNTACANA` / `_FLORIDA` / `_RIVIERAMAYA` | Push notifications (daily, morning brief, push-debug) — clé REST nommée `github-actions` dans chaque app | onesignal.com → app de la région → Settings → Keys & IDs → REST API key |
| `SMTP_PASS` | Tous les emails (welcome, drip, weekend, outreach, alertes failure, health-check) — envoi via SMTP de la boîte `alerte@sargasses-martinique.com` (cPanel `premium115.web-hosting.com:465`). Host/user/port ont des defaults dans `scripts/automation/lib/email-send.cjs` ; seul ce mot de passe est secret. **Plus de Resend.** | cPanel → Email Accounts → `alerte@` → mot de passe |

> Les `onesignalAppId`, `ga4Id`, `clarityProjectId` (IDs **publics**, pas des secrets) vivent dans `regions/<id>.json`.

## 2. Rôles des navigateurs — DIRECTIVE FERME

Ne **jamais** inverser ces deux rôles :

| Navigateur | Rôle | Détails |
|---|---|---|
| **Chrome (profil normal de l'utilisateur)** | **Sessions perso + provisioning** | Sessions Google (GA4, GSC), OneSignal, Clarity, Stripe, Namecheap, Cloudflare. Toute opération de provisioning manuel passe par **MCP Claude in Chrome** sur ce profil. Jamais d'automation Facebook ici. |
| **Edge (Playwright `channel: 'msedge'`, profil `.fb-session-edge/`)** | **TOUTE l'automation Facebook** | Scripts `scripts/automation/fb-*.cjs` (post groupes, replies, comment hunter…). Login FB fait une fois dans `.fb-session-edge/` puis réutilisé. Jamais de session perso Google ici. |

Raison : isoler le risque (un ban FB ne touche pas les sessions Google/Stripe) et garder les cookies FB hors du profil principal. `.fb-session-edge/` est local et gitignoré.

## 3. Workflows GitHub Actions (11)

| Workflow | Déclencheurs | Rôle |
|---|---|---|
| `daily-copernicus.yml` | cron `0 0,6,12,18 * * *` + push main + dispatch | **Le pipeline principal.** Fetch ERDDAP (+fallback Copernicus), météo Open-Meteo, notifications push/email, pipeline emails (bounces→subscribers→weekend/welcome/drip), health-check, backtest, stats. Full build 4 builds Vite (3 nouvelles régions + MQ/GP) à 06/18 UTC (+1 h de tolérance), sur dispatch et sur push humain ; data-only sinon. Commit des JSON (rebase `-X theirs`, 5 retries), deploy FTPS 5 régions, health-check final sur tous les domaines, retry auto 1× après 5 min, email d'alerte si échec. |
| `content-generation.yml` | cron lun/mer/ven 8h UTC + dispatch | Génération de contenu SEO via API Anthropic (payante), redeploy FTP MQ/GP. |
| `morning-brief.yml` | cron `57 11 * * *` (07:57 Antilles) | Push OneSignal quotidien "morning brief" — top plage du jour par région (F3). |
| `weekly-seo-automation.yml` | cron lun 11h UTC | Le gros workflow SEO (~22 étapes, ~12 min) : GSC, analyzers, rapports, redeploy. |
| `weekly-optimize.yml` | cron mar/mer/ven 10h + ven 14h UTC | Tâches d'optimisation par jour (A/B, funnel Apps Script, GA4, weekend prep). `day_override` en dispatch. |
| `weekly-outreach.yml` | cron mar 10h UTC | Backlinks + social outreach (emails via SMTP boîte `alerte@`). |
| `weekly-ux-report.yml` | cron ven 11h UTC | Rapport UX hebdo depuis GA4. |
| `provision-gsc.yml` | dispatch (input `regions`) | Crée/vérifie les propriétés Google Search Console des nouvelles régions (vérification via fichier déposé en FTP), délègue à `GSC_HUMAN_OWNER`. |
| `provision-ga4.yml` | dispatch (input `regions`) | Crée les propriétés GA4 des nouvelles régions sous `GA4_ACCOUNT`. |
| `ga4-diagnose.yml` | dispatch | Diagnostic GA4 MQ/GP (manuel). |
| `push-debug.yml` | dispatch (modes `count-subscribers` / `test-fav-alert`) | Diagnostic OneSignal human-in-the-loop. Jamais schedulé. |

Règles : concurrency guard sur daily-copernicus / content-generation / weekly-optimize / weekly-seo-automation ; **jamais** de `workflow_dispatch` sur un step d'envoi email/notif schedule-only (le retry-on-failure re-dispatche → spam) ; quota = repo public, minutes illimitées.

## 4. Deploy manuel (sans GitHub Actions)

```bash
# 1. Build
npm run build                          # build partagé MQ/GP
VITE_REGION=<id> npm run build         # build d'une nouvelle région (puntacana, florida, rivieramaya)

# 2. Préparer les dossiers FTP (VITE_REGION-aware, même valeur qu'au build)
node scripts/prepare-ftp.cjs
# ou raccourci MQ/GP : npm run martinique  (= build + prepare-ftp)

# 3. Upload FTPS — creds via env FTP_*_<ID> (chargées depuis .env racine si présent)
node scripts/manual-ftp-deploy.cjs     # toutes les régions qui ont creds + dossier
ONLY=puntacana node scripts/manual-ftp-deploy.cjs   # une seule région
# npm run ftp-deploy = alias
```

⚠️ Avant tout deploy de **code** : bumper `CACHE_NAME` dans `public/sw.js` (voir ARCHITECTURE.md §6).
⚠️ Pour les nouvelles régions, builds **séquentiels** : chaque build écrase `dist/`. Toujours finir par le build MQ/GP (sans `VITE_REGION`) si on déploie tout, pour que `martinique-ftp/`/`guadeloupe-ftp/` partent d'un `dist/` propre.

## 5. Checklist — ajouter une région N+1

Dans l'ordre. `<id>` = code court minuscule (ex. `jamaica`), `<ID>` = majuscules.

1. **`regions/<id>.json`** conforme à `regions/_schema.json`. La validation fail-fast de `regions/index.cjs` exige : chaque plage inline avec `island === "<id>"`, toutes les plages **dans la bbox**, `beachFilter.island === "<id>"`. Tester : `node -e "require('./regions/index.cjs').getRegion('<id>')"`.
2. **Domaine + hosting** : acheter le domaine, créer l'hébergement, créer le compte FTP **`claudedeploy@<domaine>`** (convention des comptes deploy).
3. **3 secrets GitHub FTP** : `gh secret set FTP_SERVER_<ID>`, `FTP_USERNAME_<ID>`, `FTP_PASSWORD_<ID>` (repo aveca/sargagame).
4. **`daily-copernicus.yml`** : ajouter les 3 `FTP_*_<ID>` au bloc `env:` du step "Deploy FTPS toutes régions" (et `ONESIGNAL_API_KEY_<ID>` au step "Send notifications" une fois l'app créée — étape 7). Le reste du workflow découvre la région tout seul via `regions/index.cjs`.
5. **Paiement Mollie on-site** (caisse active = Mollie, plus de Stripe) — dans `public/api/mollie.php` : ajouter le domaine à `$allowed` **et** à `$ISLAND_BY_ORIGIN` (mapping origin → `<id>`), puis ajouter `'<id>' => 'EUR'` ou `'USD'` à `$CUR_BY_ISLAND`. Le `mollie-config.php` (secrets `api_key`/`webhook_secret`) est **déployé par FTP** et **jamais committé** (gitignored) — ne pas le toucher en repo. Redéployer le PHP par FTP.
6. **Régions USD** : activer `MOLLIE_LIVE_USD` côté front pour la région (kill-switch `PAY_CAPTURE_ONLY` par surface tant que l'USD n'est pas validé par un vrai paiement). Stripe (`scripts/create-region-payment-links.cjs`, `public/api/stripe-webhook.php`, `$KNOWN_REGIONS`) = **legacy uniquement** (16 abos EUR historiques) ; ne PAS y câbler une nouvelle région ni y renvoyer un CTA.
7. **OneSignal** : créer l'app de la région, copier l'`onesignalAppId` dans `regions/<id>.json`, créer une clé REST API nommée **`github-actions`**, la poser : `gh secret set ONESIGNAL_API_KEY_<ID>`.
8. **Clarity** : créer le projet **manuellement** (pas d'API), copier `clarityProjectId` dans `regions/<id>.json`.
9. **GSC + GA4** : `gh workflow run provision-gsc.yml -f regions="<id>"` puis `gh workflow run provision-ga4.yml -f regions="<id>"` ; reporter le `ga4Id` (G-XXXX) dans `regions/<id>.json`.
10. **Photos plages** : `GOOGLE_PLACES_KEY=... node scripts/download-google-photos.cjs --region=<id>` (sorties dans `public/beaches/`).
11. **OG image** : `node scripts/generate-og-images.cjs --region=<id>` → `regions/og/og-image-<id>.png` (copiée en `og-image.png` par `prepare-ftp.cjs`).
12. **Build + deploy** : `VITE_REGION=<id> npm run build && node scripts/prepare-ftp.cjs && ONLY=<id> node scripts/manual-ftp-deploy.cjs`, ou push main et laisser `daily-copernicus.yml` faire le full build.

## 6. Divers

- **Session startup** : `npm run session` (freshness pipeline, métriques, funnel, workflows récents, mémoire projet).
- **Pipeline STALE (>12 h)** : `gh workflow run daily-copernicus.yml --repo aveca/sargagame --ref main`.
- **`.env` racine** (gitignoré) : mêmes clés que les secrets GitHub (`FTP_SERVER_MQ`, …, `STRIPE_SECRET_KEY`) pour les deploys locaux.
- **Clé de caisse active** : `MOLLIE_API_KEY` (secret GitHub Actions provisionné) est la clé du provider de paiement actif (Mollie on-site). `STRIPE_SECRET_KEY` = legacy uniquement (16 abos EUR historiques).
- **Fichiers jamais committés** : `.env`, `**/mollie-config.php`, `**/stripe-config.php` (legacy), `copernicustxt.txt`, `*-ftp/`, clés service account `*.json`, `SECRETS-GITHUB.txt`, `.fb-session*/`.
