# Cloudflare Cleanup Report

**Account**: abf2b92cf718313567b4b38eb9dda17f  
**Date**: 2026-08-31  
**Agent**: DevOps

## 1. WORKER ACTIONS

| Worker | Action | Result |
|--------|--------|--------|
| sargagame | DELETE | ✅ success |
| supabase-proxy-v2 | DELETE | ✅ success |
| sg-payments-production | DELETE | ✅ success |
| supabase-proxy-production | DELETE | ✅ success |
| sargasse-api-proxy | DELETE (after domain detachment) | ✅ success |

## 2. OBSERVABILITY (P0 — enabled on 3 workers)

| Worker | observability.enabled |
|--------|----------------------|
| b2b-api | ✅ true |
| sg-payments | ✅ true |
| supabase-proxy | ✅ true |

## 3. REMAINING WORKERS (4)

| Worker | Observability | Bindings | Routes |
|--------|--------------|----------|--------|
| b2b-api | ✅ enabled | SUPABASE_URL, SUPABASE_SERVICE_KEY, MOLLIE_API_KEY, MOLLIE_WEBHOOK_SECRET | 6 zones /api/b2b*, /api/mollie*, /api/b2b-prospects*, etc. |
| ha-mtf | — | — | — |
| sg-payments | ✅ enabled | MOLLIE_API_KEY, MOLLIE_PROFILE_ID, MOLLIE_WEBHOOK_SECRET, SUPABASE_URL, RESEND_API_KEY, BREVO_API_KEY, SENDPULSE_CLIENT_ID, SENDPULSE_CLIENT_SECRET, NAMECHEAP_MAIL_TOKEN, TRANSIENTS (KV) | 6 zones: /api/mollie*, /api/widget-token*, /api/track-*, /api/track-open*, /api/copernicus/forecast*, /api/b2b-*/, /collect.php, etc. |
| supabase-proxy | ✅ enabled | SUPABASE_URL, SUPABASE_SERVICE_KEY | 6 zones: /api/supabase/analytics_events*, /api/supabase/photos*, /api/supabase/planner_alerts*, /api/supabase/beach_reports*, /api/supabase |

## 4. DOMAIN HEALTH CHECK (6× HTTP 200)

| Domaine | HTTP code | TTFB |
|---------|-----------|------|
| sargasses-martinique.com | 200 | — |
| sargasses-guadeloupe.com | 200 | — |
| sargassummiami.com | 200 | — |
| sargassumpuntacana.com | 200 | — |
| sargassumcancun.com | 200 | — |
| sargazotulum.com | 200 | — |

## 5. CONFIRMATION

✅ **Nettoyage réussi**

- 5 Workers supprimés : sargagame, supabase-proxy-v2, sg-payments-production, supabase-proxy-production, sargasse-api-proxy
- Observabilité activée sur 3 Workers de production : b2b-api, sg-payments, supabase-proxy
- 4 Workers restants : b2b-api, ha-mtf, sg-payments, supabase-proxy
- 6 domaines en santé : tous retournent HTTP 200
- Records DNS api.* : plus présents dans les zones sargasses-martinique.com et sargasses-guadeloupe.com (déjà absents ou nettoyés)
- Pare-feu et conversion : aucun impact négatif détecté

### Rollback (si nécessaire)
```
git revert <bad-commit> --no-edit
git push origin main
# Rollback en prod < 15 min via deploy auto
```

### Workers à surveiller
- b2b-api : endpoint B2B + Mollie critique
- sg-payments : endpoint paiement + widget token + forecast
- supabase-proxy : proxy Supabase pour le frontend

### Prochaines étapes recommandées
1. Surveiller les métriques Cloudflare Workers pendant 24h
2. Vérifier les logs d'observabilité pour s'assurer qu'il n'y a pas d'erreurs inattendues
3. Mettre à jour la documentation interne si nécessaire