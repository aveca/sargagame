# NEXT_SESSION — sargagame

*Session 2026-06-10 « 0→1, rank-1, 50k ». Audit multi-agents (4 workflows : sweep repo 19 ag., concurrents 10 ag., data/funnel 5 ag.) + click-test Playwright live → **~18 commits poussés**. Tous les bugs critical/high trouvés sont corrigés. Docs créées (`docs/`). RGPD assaini. SEO des 3 sites USD shippé.*

## 🎯 État cash USD
| Région | Domaine | Site | Payment Links | Analytics + Push |
|---|---|---|---|---|
| Punta Cana | sargassumpuntacana.com | ✅ LIVE | ✅ $9.99/$79 | ✅ GA4+Clarity+OneSignal(clé REST) |
| Riviera Maya | sargassumcancun.com | ✅ LIVE (ES) | ✅ | ✅ |
| Florida | sargassummiami.com | ✅ LIVE | ✅ | ✅ |

- **0 paiement USD encore** — réconciliation webhook J+1 (demain) toujours à faire.
- MRR €34,93 (7 EUR) + 1 paiement détecté hier.

## 🟢 Shippé cette session (tout poussé)
- **SEO** : 52-53 pages/site USD (`scripts/lib/region-seo-pages.cjs`) régénérées 4×/j — hubs forecast/today/map/saison/méthodo(backtests)/semáforo + 12 plages + 35 resorts long-tail/région. Contenu EN/ES natif (`regions/seo-content/`, `regions/resorts/`). FAQPage schema, sitemaps complets, maillage réseau inter-sites, IndexNow post-deploy. Home Cancún = "Sargazo en Cancún HOY".
- **Data** : bande shore 0-10km (fini PC tout-clean dilué ; MQ/GP byte-identique), météo per-beach 5 régions (fini scores 85/85/85), météo dégelée (était figée 2 mois), raisons Beach Score i18n fr/en/es.
- **UX** : clic cluster ne meurt plus (zoom→ouvre la plage visée), 36/36 photos plages, SW v31 ne cache plus les 404.
- **RGPD** : 171 emails → subscribers.json gitignoré + état hashé SHA-256 (idempotence prouvée).
- **Infra** : docs/ (ARCHITECTURE/OPERATIONS/DATA-PIPELINE/README), 3 clés OneSignal + GA4_ACCOUNT en secrets, FB scripts re-bascule Edge, nettoyage 29 fichiers.

## ⚠️ À FAIRE (ordre)
1. **Vérifier le deploy en prod** (run 27264041916) : pages SEO indexables (curl `/sargassum-forecast/`, `/beaches/bavaro-beach/`, `/resorts/hard-rock-punta-cana/`), spread data PC (pc007 moderate), raisons EN/ES, sitemaps. `node scripts/ux-clicktest.cjs` + `node scripts/sweep-live-ui.cjs`.
2. **Réconciliation webhook J+1** (2026-06-11).
3. **2 chips utilisateur en attente** (Chrome co-loggé) : (a) **token API Cloudflare** → `gh secret set CLOUDFLARE_API_TOKEN` puis `node scripts/automation/cloudflare-provision.cjs --only=sargazotulum.com` (canari) puis les 3 sites — CDN+SSL+cache, règle le throttle perf ; (b) **purge historique git des 171 emails** (force-push à confirmer).
4. **Indexation** : soumettre les 3 sitemaps dans GSC (propriétés déjà vérifiées), suivre impressions sous 7j. Le produit est déjà supérieur au top 5 — gap = indexation+autorité.
5. **Tunnel (audit funnel)** : prefill `?prefilled_email=`+`?client_reference_id=` sur les Payment Links (débloque l'attribution), email capture visible en peek (0,21%→~1%), repositionner free=bilan / premium=reco 7h. Bulletin weekend mort depuis 17 avril (fix horaire poussé, à confirmer vendredi).
6. **Backlog** : stripe-webhook `$KNOWN_REGIONS` hardcodé, °F/mph Floride, alertes favoris MQ/GP (mismatch ids fav_mq014 vs fav_grande-anse = 0 destinataire), dédup notifs (spam 4-6×/j).

## Notes
- Outils locaux non committés : `scripts/sweep-live-ui.cjs`, `scripts/ux-clicktest.cjs` (Playwright 5 domaines).
- Throttle/522 transitoires pendant un sweep = hôte mutualisé, pas un site down. Cloudflare réglera.
- Rôles navigateurs (FERME, [[browser-roles]]) : Chrome=provisioning user (Claude in Chrome), Edge=automation FB. Doc dans docs/OPERATIONS.md.
- A/B MQ/GP : pw_prelude seul vivant. Ne pas toucher.
