# Etat du projet — 6 avril 2026

## Ce qui tourne automatiquement (rien a faire)

- **4x/jour** : ERDDAP → sargassum.json + grid → push notifs → FTP deploy MQ + GP
- **4x/jour** : Stats check → daily-metrics.json (trend detection)
- **Vendredi** : Email weekend bulletin (quand Apps Script sera mis a jour)
- **Lundi** : SEO audit → auto-optimize → auto-copywriting → build → deploy
- **Jeudi** : UX report
- **Continu** : GA4 events (15 events funnel + 5 A/B tests), Clarity heatmaps

## Deploy Apps Script (via clasp)

Le code canonique vit dans `scripts/appscript/Code.js`. Deploy en 2 commandes :

```bash
cd scripts/appscript
clasp push --force
clasp deploy -i AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w -d "v21 description"
```

Le `deploymentId` est fixe — l'URL webhook ne change jamais. Voir `memory/reference_apps_script_deploy.md` pour la procédure complète.

## Metriques a ce jour

- 3 clients premium (4.99 EUR/mois)
- 1 email capture
- 0 feedback (widget deploye, apparait apres 3e visite)
- 5 A/B tests actifs (resultats attendus ~14 avril)
- GP SEO position 70 → fix hreflang deploye (4-6 semaines pour remonter)
