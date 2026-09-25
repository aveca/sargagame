# SUPABASE RAIL VERIFICATION — SQL (2026-09-25K, §21)

> Read-only. Nécessite la service key (dashboard ou agent avec accès).
> Le probe J (`probe-rail-prod.mjs`) est SYNTHETIC (`synthetic:true`) :
> l'écarter des KPI (WHERE ci-dessous).

```sql
-- 1. Le fix allowlist collecte-t-il ? (rows depuis le deploy #750)
select date_trunc('day', created_at) d, event_type, count(*)
from analytics_events
where event_type like 'sg\_home\_rail\_%' escape '\'
  and created_at > now() - interval '14 days'
group by 1, 2 order by 1, 2;

-- 2. Réel vs synthetic
select
  sum(case when (params->>'synthetic')::boolean is true then 1 else 0 end) as synthetic,
  sum(case when coalesce((params->>'synthetic')::boolean, false) = false then 1 else 0 end) as real
from analytics_events
where event_type like 'sg\_home\_rail\_%' escape '\'
  and created_at > now() - interval '14 days';

-- 3. Funnel AHA (réel uniquement) : rail → best → beach → plan → trip → premium
select event_type, count(*) from analytics_events
where event_type in ('sg_home_rail_focus','sg_home_best_open','sg_beach_open','sg_plan_generate','sg_trip_open','sg_premium_modal_open','sg_pass_cta')
  and coalesce((params->>'synthetic')::boolean, false) = false
  and created_at > now() - interval '7 days'
group by 1;
```
