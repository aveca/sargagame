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

> **⚠️ BLOQUÉ en mode autonome.** `clasp push` / `clasp deploy` exigent un ordinateur ; le fondateur est 100 % mobile → impossible. **Ne crée JAMAIS une nouvelle action `Code.js`** : réutilise les actions existantes. Tout NOUVEL état serveur piloté → **Supabase via HTTP** (pilotable au mobile), JAMAIS Apps Script. Les commandes ci-dessous sont conservées pour référence / le jour où un ordinateur est disponible.

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

## Métriques (vivantes — ne pas figer ici)

- **Source de vérité** : `scripts/automation/data/daily-metrics.json`. Le bloc `stripe` y est la source du MRR (snapshot actuel : **€79,84/mois · 16 abonnés actifs** — base Stripe legacy). Les chiffres du jour (payments / emails / feedbacks) sont la dernière entrée du fichier.
- **Modèle de paiement** : **Mollie pass-only** (paiement unique, plus d'abonnement) — EUR 7,99 / 14,99 / 24,99 €. Stripe ne sert plus de caisse (16 abos EUR legacy continuent d'y facturer ; liens USD désactivés).
- **Funnel / A/B / SEO** : voir les références dédiées (table ci-dessous) et `NEXT_SESSION.md` pour le snapshot courant.
- **Pipeline** : ERDDAP-live, stable.

## Fichiers canoniques par topic

| Topic | Référence |
|-------|-----------|
| Deploy technique | Ce fichier + `memory/reference_deploy.md` |
| FTP | `DEPLOI-FTP.md` + `scripts/prepare-ftp.cjs` |
| Apps Script | `memory/reference_apps_script_deploy.md` |
| Paiement (Mollie, actuel) | `MOLLIE_MIGRATION.md` + `public/api/mollie.php` |
| Stripe (legacy — 16 abos EUR, MRR only) | `memory/reference_stripe_checkout.md` |
| Email system | `memory/reference_email_system.md` |
| SEO | `memory/reference_seo_strategy.md` |
| A/B tests | `memory/reference_ab_tests.md` |
| Handoff | `NEXT_SESSION.md` |
