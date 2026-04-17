# Guide de déploiement — sargagame

*Mis à jour 2026-04-17.*

## Ce qui tourne automatiquement (rien à faire)

- **4×/jour** (00/06/12/18 UTC) : `daily-copernicus.yml` → ERDDAP + grid + push notifs + email drip + backtest + full build à 09h/21h UTC + FTP deploy MQ+GP
- **Lundi 11h UTC** : `weekly-seo-automation.yml` — 22-step SEO audit + auto-fixes + rebuild
- **Lun+Mer+Ven 8h UTC** : `content-generation.yml` — 1 article SEO via Anthropic API
- **Mar+Mer+Ven 10h UTC** + Ven 14h UTC : `weekly-optimize.yml` — email stats, A/B eval, data quality, weekend prep selon jour
- **Mar 10h UTC** : `weekly-outreach.yml`
- **Ven 11h UTC** : `weekly-ux-report.yml`
- **Daily 7h57 MQ local** : `morning-brief.yml` — push OneSignal
- **Continu** : GA4 + Clarity + GSC data collection

Tous ont `cache: 'npm'` et `concurrency` guard depuis 2026-04-17.

## Deploy manuel (push vers main)

```bash
# Un commit/push suffit, daily-copernicus.yml déclenchera full build automatiquement
git add <files> && git commit -m "..." && git push
```

Si conflit concurrency (workflow déjà en cours sur une run précédente) : il se resoudra à la fin, ou forcer manuellement via `gh workflow run daily-copernicus.yml --ref main`.

## Deploy Apps Script (backend)

Le code canonique vit dans `scripts/appscript/Code.js`. Deploy en 2 commandes :

```bash
cd /c/Users/user/AppData/Local/Temp/sarg-appscript
cp ../../../scripts/appscript/Code.js Code.gs
clasp push --force
clasp deploy -i AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w -d "vX description"
```

`deploymentId` fixe → URL webhook ne change jamais. Version actuelle : v22 @38 (2026-04-17).

## Build local (sans push)

```bash
npx vite build                      # → dist/
node scripts/prepare-ftp.cjs        # → martinique-ftp/ + guadeloupe-ftp/
node scripts/manual-ftp-deploy.cjs  # besoin .env avec FTP creds
```

## Métriques 2026-04-17

- **MRR** : €34,93/mois (7 payants × 4,99)
- **Subscribers** : 58 (était 42 le 12 avril, +38% en 5 jours)
- **Funnel** : 8776 sessions → 184 modal opens → 28 CTA → 14 redirect → 7 paiements
- **Leaks mesurés** : 85% modal dismiss, 50% CTA→redirect (fix shipped), 50% redirect→payment
- **A/B tests live** : `pw_cta_order` (control/sample_first) + `pw_prelude` (direct/prelude)
- **SEO MQ** : position ~3,8 (all-time best)
- **SEO GP** : 119 clk/j peak après fix cannibalization (session 38)
- **Pipeline** : ERDDAP-live, stable

## Fichiers canoniques par topic

| Topic | Référence |
|-------|-----------|
| Deploy technique | Ce fichier + `memory/reference_deploy.md` |
| FTP | `DEPLOI-FTP.md` + `scripts/prepare-ftp.cjs` |
| Apps Script | `memory/reference_apps_script_deploy.md` |
| Stripe | `memory/reference_stripe_checkout.md` |
| Email system | `memory/reference_email_system.md` |
| SEO | `memory/reference_seo_strategy.md` |
| A/B tests | `memory/reference_ab_tests.md` |
| Handoff | `NEXT_SESSION.md` |
