# SARGAGAME_SITE_MATRIX — 2026-10-11 (sondé via Playwright headless, navigation non destructive)

| Domaine | Région | HTTP | Titre (extrait) | Labels carte | Donnée `sargassum.json` | Erreurs console notables | Défauts |
|---|---|---|---|---|---|---|---|
| sargasses-martinique.com | mq | 200 | « Plages Martinique aujourd'hui · Score 0-100… » | 53 | 200, `updatedAt` 2026-10-10T21:51Z | CSP bloque Clarity + CF Insights ; 404 `/.well-known/apple-developer-merchantid…` | AP-1, AN-1 |
| sargasses-guadeloupe.com | gp | 200 | « Plages Guadeloupe aujourd'hui… » | 83 | 200, frais | aucune console ; GA `ERR_ABORTED` (probable blocage réseau test) | AN-2 |
| sargassummiami.com | florida | 200 | « Sargassum in Florida Today… » | 20 | 200, frais | CSP Clarity ; 404 apple-merchantid | AP-1, AN-1 |
| sargassumpuntacana.com | puntacana | 200 | « Punta Cana Sargassum Today… » | 12 | 200, frais | CSP Clarity ; 404 apple-merchantid | AP-1, AN-1 |
| sargassumcancun.com | rivieramaya | 200 | « Sargazo en Cancún HOY… » | 20 | 200, frais | CSP Clarity ; 404 apple-merchantid | AP-1, AN-1 |
| sargazotulum.com | tulum | 200 | « Sargazo y Algas en Tulum Hoy… » | 0 → **5 après fix TU-1** | 200, frais | 404 `/data/region-outlines/tulum.json` (corrigé ✔) ; 404 apple-merchantid (corrigé ✔) ; CSP | TU-1 ✔, AP-1 ✔, AN-1 |
| sargassumbarbados.com | barbados (staging) | DNS non résolu | — | — | — | — | attendu (région `_staging`, hors matrice de déploiement) |

**Post-déploiement 17:25 UTC (PR #871)** : merchant file Apple Pay = **200 ×6**, outline Tulum = **200**, carte Tulum = 5 labels (0 avant).

Légende : AP-1 = Apple Pay merchant file 404 · AN-1 = CSP bloque analytics · AN-2 = beacons Supabase aborted · TU-1 = outline Tulum non déployé.

Notes :
- Paywall prod OK (GP, mobile iPhone 12, `?paywall=1`) — voir `screenshots/prod-gp-paywall-mobile.png`.
- Checkout réel NON exécuté (arrêt avant toute session de paiement, conforme mission).
- `/.well-known/apple-developer-merchantid-domain-association` 404 sur les 6 domaines ; `/api/apple-pay-domain-association` 200 (MQ).
- Dernière exécution `cloudflare-production.yml` OK : 2026-10-11T02:23Z.
