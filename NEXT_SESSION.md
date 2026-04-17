# NEXT_SESSION — sargagame

*Dernière session : 2026-04-17, fin ~18h local (Shabbat entrée).*

## Shipped vendredi 2026-04-17

| Commit | Impact attendu |
|---|---|
| `cb403f0` fix funnel CTA defer | `cta_to_redirect` 50% → 95%+ (mesurable lundi après 3j) |
| `59f7c66` A/B pw_cta_order (sample-first) | réduire les 85% modal_dismiss (10+ j pour conclure) |
| `4c05d47` CI concurrency + rebase -X theirs | 0 failure concurrente GH Actions |
| `266c4e5` npm cache + retention 14j | ~60 min/mois GH économisés |
| `f815114` digest + memory updates | — |

## Premier check à faire au retour

1. **Apps Script funnel** — `curl "APPS_SCRIPT_URL?action=funnel"` et regarder :
   - `premium_modal_cta` vs `checkout_redirect` — **target ratio ≥ 0.95** (vs 0.50 avant le fix)
   - `ab_pw_cta_order=0` vs `=1` split + modal_close rates par variant
2. **GA4 A/B** — dashboard ou `node scripts/automation/ab-fetch-ga4.cjs` pour voir les counts
3. **GH Actions** — `gh run list --limit 20` doit être 100% green (le `-X theirs` + concurrency couvrent les cas de race)
4. **Live sites** — `curl -o/dev/null -s -w "%{http_code}" https://sargasses-martinique.com` + idem GP, tous 200
5. **Pipeline freshness** — `cat public/api/copernicus/sargassum.json | grep updatedAt` < 12h

## Ce qui tourne pendant que tu n'es pas là

- **Chaque jour** : daily-copernicus 4×/j (00h/06h/12h/18h UTC), morning-brief 7h57 MQ
- **Samedi** : rien d'actif programmé (évite la charge)
- **Dimanche** : rien d'actif programmé
- **Lundi** : weekly-seo-automation 11h UTC (22-step SEO), content-generation 8h UTC (article Claude), weekly-optimize Monday mode (SEO enrichment + A/B)
- **Mardi** : weekly-outreach 10h UTC, weekly-optimize Tuesday mode (email stats)
- **Mercredi** : weekly-optimize Wednesday (data quality + forecast backtest)
- **Jeudi** : weekly-optimize Thursday (A/B mid-week)
- **Vendredi** : weekly-optimize Friday (weekend prep), weekly-ux-report 11h UTC

## Décisions qui t'attendent

- **Fix funnel tient-il ?** Si `cta_to_redirect` est encore < 95% après 3 jours, passer au plan B (batch beacon en 1 payload, voir memory `project_funnel_cta_redirect_leak`)
- **A/B modal** : laisser tourner 10+ jours avant conclusion (besoin ≥ 200 vues par variant)
- **Next big lever** : une fois modal_dismiss stabilisé, attaquer le drop onboarding → favori → premium_email (voir memory `project_next_funnel`)

## Si quelque chose s'est cassé pendant Shabbat

- Pipeline sargasses > 12h stale → `gh workflow run daily-copernicus.yml --ref main`
- Site 503/500 → `node scripts/manual-ftp-deploy.cjs` (credentials FTP manuelles dans memory `reference_ftp_creds`)
- GH Actions rouge : le `notify-failure` job envoie un email, mais si tu vois le flag dans le digest, fais `gh run view <id> --log-failed`
