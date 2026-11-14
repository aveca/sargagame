-- P0.127 — Remove unused client grants from internal B2B tables.
--
-- ⚠️ MIGRATION PRÉPARÉE, NON APPLIQUÉE.
-- Production application requires explicit approval.
--
-- Read-only catalog inspection (2026-11-06) found these tables with RLS
-- enabled, no policies, and broad anon/authenticated grants:
--   b2b_prospects, b2b_contacts, b2b_scores, b2b_concierge,
--   b2b_forecast_deliveries, b2b_payments, b2b_events.
--
-- Repository code search found no direct client-side references to these
-- tables. The recovered sg-payments Worker uses SUPABASE_SERVICE_KEY for
-- its database access. RLS remains enabled and service_role is untouched.
--
-- This migration removes only client-role table privileges. It does not
-- create policies, alter columns, or touch customer rows.
-- The separate migration 007 also removes TRUNCATE from all public tables.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'b2b_prospects',
    'b2b_contacts',
    'b2b_scores',
    'b2b_concierge',
    'b2b_forecast_deliveries',
    'b2b_payments',
    'b2b_events'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;
END;
$$;
