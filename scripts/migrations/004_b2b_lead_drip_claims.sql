-- P0.127 — Atomic B2B drip claims and safe manual recovery.
--
-- ⚠️ MIGRATION PRÉPARÉE, NON APPLIQUÉE.
-- Production application requires explicit approval.
--
-- No prospect rows are read, rewritten or deleted by this migration.
-- last_contact_error stores fixed non-PII reason codes only.

DO $$
BEGIN
  IF to_regclass('public.b2b_leads') IS NULL THEN
    RAISE NOTICE 'public.b2b_leads absent : migration sans effet.';
    RETURN;
  END IF;

  ALTER TABLE public.b2b_leads
    ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
    ADD COLUMN IF NOT EXISTS contact_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_contact_error text;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.b2b_leads'::regclass
      AND conname = 'b2b_leads_contact_attempts_nonnegative'
  ) THEN
    ALTER TABLE public.b2b_leads
      ADD CONSTRAINT b2b_leads_contact_attempts_nonnegative
      CHECK (contact_attempts >= 0) NOT VALID;
  END IF;

  ALTER TABLE public.b2b_leads
    VALIDATE CONSTRAINT b2b_leads_contact_attempts_nonnegative;

  CREATE INDEX IF NOT EXISTS b2b_leads_new_drip_idx
    ON public.b2b_leads (created_at)
    WHERE status = 'new';

  CREATE INDEX IF NOT EXISTS b2b_leads_processing_claimed_idx
    ON public.b2b_leads (claimed_at)
    WHERE status = 'processing';
END;
$$;
