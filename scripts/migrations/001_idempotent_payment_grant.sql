-- Idempotent server-side B2C pass grant.
-- Apply before deploying the Worker version that calls this RPC.
CREATE OR REPLACE FUNCTION public.sg_upsert_payment_grant(
  p_payment_id  text,
  p_pass        text,
  p_email       text,
  p_currency    text,
  p_expires_at  timestamptz,
  p_granted_at  timestamptz,
  p_metadata    jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.payment_grants (
    payment_id, type, pass, email, currency,
    expires_at, granted_at, metadata
  ) VALUES (
    p_payment_id, 'b2c_pass', p_pass, p_email, p_currency,
    p_expires_at, p_granted_at, p_metadata
  )
  ON CONFLICT (payment_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) TO service_role;
