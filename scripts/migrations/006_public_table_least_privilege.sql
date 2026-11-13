-- P0.127 — Least privilege for public-facing B2B/B2C/payment tables.
--
-- ⚠️ MIGRATION PRÉPARÉE, NON APPLIQUÉE.
-- Production application requires explicit approval.
--
-- This migration changes policies and table grants only.
-- It does not read, insert, update or delete customer rows.
--
-- Verified production findings (read-only catalog inspection, 2026-11-06):
--   b2b_subscriptions: permissive PUBLIC ALL policy + broad anon/auth grants
--   b2c_alerts:        permissive PUBLIC ALL policy + broad anon/auth grants
--   payment_grants:    RLS enabled, no policy, broad anon/auth grants
--
-- The recovered sg-payments Worker accesses these tables using
-- SUPABASE_SERVICE_KEY. The service_role grants are deliberately untouched.
-- Client-facing flows must go through the server-side Worker/API.
--
-- Idempotent: safe to review/re-run after schema drift checks.

DO $$
BEGIN
  IF to_regclass('public.b2b_subscriptions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow all b2b_subscriptions" ON public.b2b_subscriptions';
    EXECUTE 'ALTER TABLE public.b2b_subscriptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.b2b_subscriptions FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.b2b_subscriptions FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.b2b_subscriptions FROM authenticated';
  END IF;

  IF to_regclass('public.b2c_alerts') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow all b2c_alerts" ON public.b2c_alerts';
    EXECUTE 'ALTER TABLE public.b2c_alerts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.b2c_alerts FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.b2c_alerts FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.b2c_alerts FROM authenticated';
  END IF;

  IF to_regclass('public.payment_grants') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_grants ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_grants FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_grants FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_grants FROM authenticated';
  END IF;
END;
$$;
