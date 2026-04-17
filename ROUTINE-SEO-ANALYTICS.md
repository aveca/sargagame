# Routine SEO & Analytics — Sargasses Martinique & Guadeloupe

*Mis à jour 2026-04-17. 90% de cette routine est désormais AUTOMATISÉE via GH Actions. Ce doc sert de backup pour les checks manuels + rappels de config.*

## Outils connectés

| Outil | Martinique | Guadeloupe | URL |
|-------|-----------|------------|-----|
| Google Analytics 4 | G-V8JGMDZZ2Y | G-Q31VV3LLM9 | https://analytics.google.com |
| Microsoft Clarity | w4o6w9aenv | w4oect7ph3 | https://clarity.microsoft.com |
| Google Search Console | sc-domain:sargasses-martinique.com | sc-domain:sargasses-guadeloupe.com | https://search.google.com/search-console |
| Bing Webmaster Tools | validé 2026-04-13 (`public/BingSiteAuth.xml`) | pas encore ajouté | https://www.bing.com/webmasters |
| GA4 ↔ GSC | Associé | Associé | Admin > Associations > Search Console |

## Automatisations actives

### `weekly-seo-automation.yml` (Lundi 11h UTC)
Pipeline 22-step qui fait automatiquement :
- SEO audit (GSC + GA4 + CrUX)
- UX audit (Clarity data)
- Position tracker 90j avec drop alerts
- Orphan detector, CTR diagnostic, cannibalization, CWV tracker
- `auto-optimize.cjs` + `auto-copywriting.cjs` (meta rewrites GSC-driven)
- Fix 404, optimize meta, enrich content, generate new SEO pages
- Build + deploy + submit URLs to Google Indexing API
- Link-graph analysis, broken-links check, schema validation, meta uniqueness, canonical/hreflang, content depth, sitemap check, image audit, orphan healer

Output : ~15 JSON dans `scripts/automation/data/` avec findings exploitables.

### `weekly-optimize.yml` (Mar/Mer/Ven 10h UTC)
- Mardi : bounce cleanup, drip check, email stats
- Mercredi : backtest forecast, health check, daily stats + trend
- Vendredi : weekend prep, full rebuild, submit URLs

### `weekly-ux-report.yml` (Vendredi 11h UTC)
UX audit automatique avec Clarity + GA4 → rapport JSON.

### `weekly-outreach.yml` (Mardi 10h UTC)
Outreach backlinks + social.

## Checks manuels utiles (si tu veux un coup d'œil)

### GSC — 2 min
1. **Indexation** : pas de nouvelles erreurs 404 ? Sitemaps lus < 7 jours ?
2. **Performances** : quels mots-clés apportent du trafic cette semaine ?
3. **CWV** : tout en vert ?

### Clarity — 2 min
1. Dashboard : rage clicks < 5% ? dead clicks en baisse ?
2. 3-5 session recordings récentes (filtre mobile, 7j) : friction apparente ?

### GA4 — 1 min
1. **Temps réel** : tracking fonctionne (ouvre le site, voir le hit)
2. **Engagement > Pages** : top pages cette semaine
3. **Acquisition** : ratio Google / direct / social

### Apps Script funnel — 30 sec
```bash
curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel"
```
Source de vérité revenu : `payments_real` + `revenue_real` + rates.

## Commandes Claude utiles

- "lance la routine SEO" → je check GSC manuellement + corrige les nouvelles erreurs
- "lance la routine UX" → je teste mobile/desktop + optim CWV si besoin
- "lance la routine analytics" → je vérifie tracking + propose optims pages populaires

## Métriques clés à surveiller

| Métrique | Objectif | Actuel (2026-04-17) | Source |
|----------|----------|---------------------|--------|
| Pages indexées | >30 MQ + >30 GP | 136 total (54 MQ + 83 GP sitemap) | GSC Indexation |
| Clics organiques/semaine | >200 MQ+GP combiné | ~1200 MQ + 400 GP | GSC Performances |
| Position moyenne MQ | <5 | 3,8 (all-time best) | GSC |
| Position moyenne GP head term | <20 | 70 (pré-fix cannibalization) | GSC |
| Taux de rebond | <60% | à vérifier | GA4 |
| Rage clicks | <3% des sessions | variable | Clarity |
| Erreurs 404 | 0 | 0 | GSC |
| MRR | 100 €/mois (3m) | 34,93 €/mois | Apps Script funnel |
| Subscribers | 50 (2 sem) | 58 | Apps Script funnel |

## Checklist mensuelle (le 1er du mois)

- [ ] Workflow GH Actions quotidien n'a rien cassé (run list ≥ 25 succès consécutifs)
- [ ] Sitemaps lus < 7 jours (GSC > Sitemaps)
- [ ] Mots-clés position 5-15 : opportunités gain rapide
- [ ] Validité données structurées (GSC > Améliorations)
- [ ] Trafic mois N vs mois N-1 : tendance
- [ ] Revenue trend (Stripe Dashboard + Apps Script `payments` sheet)

## Architecture technique

- **Cron principal** : `daily-copernicus.yml` 4×/jour (0/6/12/18 UTC). Full build à 09h/21h UTC ou sur push human. Data-only deploy autrement.
- **GA4** : `gtag.js` dans `<head>` + Measurement Protocol beacon direct (bypass DMA block) + Apps Script queue critique events
- **Clarity** : script async dans `<head>`, patché par `prepare-ftp.cjs` pour GP
- **Sitemaps** : générés dynamiquement pendant `npm run build` (lastmod = date build)
- **Pages plages** : 136 pages statiques générées pendant le build (53 MQ + 83 GP)
- **Redirections 301** : ~100 règles dans `public/.htaccess`
