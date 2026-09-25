# SECURITY BACKLOG — NEXT (2026-09-25K, §25)

> DOCUMENTATION SEULEMENT — aucune correction, aucune migration DB ce
> cycle. Statuts ci-dessous = **NON VÉRIFIÉS localement** (pas d'accès
> service Supabase depuis ce poste) + requêtes exactes pour le contrôle
> avec accès (dashboard SQL ou `SUPABASE_SERVICE_KEY`).

## À vérifier (fondateur / agent avec accès)
1. **RLS enabled, no policy** : `analytics_events` et `b2c_alerts` doivent
   avoir RLS activée AVEC policies insert-only anon.
   ```sql
   select tablename, rowsecurity from pg_tables where schemaname='public';
   select * from pg_policies where tablename in ('analytics_events','b2c_alerts');
   ```
   Attendu : rowsecurity=true + ≥1 policy restrictive par table.
2. **function_search_path_mutable** : fonctions `public.*` sans
   `search_path` fixe.
   ```sql
   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proconfig is null;
   ```
   Attendu : 0 ligne, sinon `ALTER FUNCTION ... SET search_path = ''`.
3. **Unindexed FK** : clés étrangères sans index (écritures funnel).
   ```sql
   select conrelid::regclass, conname from pg_constraint
   where contype='f' and not exists (
     select 1 from pg_index where indrelid=conrelid
     and (indkey::text like '%' || conkey::text || '%'));
   ```
4. **Unused index** : `pg_stat_user_indexes` (idx_scan=0 sur 30 j) —
   candidats suppression (jamais en aveugle : vérifier les plans EXPLAIN
   des requêtes funnel d'abord).

## Contexte prouvé localement
- Front écrit en anon RLS insert-only (`logAnalyticsEvent`, probe 2026-09
  montre des POST émis ; ingestion ligne = dashboard, hors portée).
- Aucun secret commité (secret-scan vert). Aucune migration ce cycle.
