# Etat du projet — 6 avril 2026

## Ce qui tourne automatiquement (rien a faire)

- **4x/jour** : ERDDAP → sargassum.json + grid → push notifs → FTP deploy MQ + GP
- **4x/jour** : Stats check → daily-metrics.json (trend detection)
- **Vendredi** : Email weekend bulletin (quand Apps Script sera mis a jour)
- **Lundi** : SEO audit → auto-optimize → auto-copywriting → build → deploy
- **Jeudi** : UX report
- **Continu** : GA4 events (15 events funnel + 5 A/B tests), Clarity heatmaps

## Quand tu as 10 minutes

1. Ouvre https://script.google.com (projet ID: 1v23rVvp2Oa7bergwETnODYRf-kRbxRiIvGtY3bKonNtxp6ZR1UfpAsRV)
2. Remplace le code par `scripts/apps-script-backend.gs`
3. Deploy > New version
4. Ca debloque : dispatch emails weekend + endpoint /stats + webhook Stripe propre

## Metriques a ce jour

- 3 clients premium (4.99 EUR/mois)
- 1 email capture
- 0 feedback (widget deploye, apparait apres 3e visite)
- 5 A/B tests actifs (resultats attendus ~14 avril)
- GP SEO position 70 → fix hreflang deploye (4-6 semaines pour remonter)
