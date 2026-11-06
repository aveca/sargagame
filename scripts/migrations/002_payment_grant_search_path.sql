-- P0.118 §3 — Durcissement de public.sg_upsert_payment_grant.
--
-- ⚠️ MIGRATION PRÉPARÉE, NON APPLIQUÉE.
-- L'application sur la base de production exige une autorisation explicite
-- (mission P0.118 §12 : aucune migration de production sans approbation).
-- Ne pas exécuter ce fichier dans le cadre de la revue de PR.
--
-- OBJECTIF
-- Fixer `search_path = ''` sur la fonction : aucun objet ne peut alors être
-- résolu implicitement via le search_path de la session (protection contre le
-- search_path hijacking et contre l'escalade de privilèges par un objet
-- temporaire). Tous les objets utilisés sont qualifiés explicitement.
--
-- La signature des 7 arguments est INCHANGÉE : c'est le contrat sur lequel
-- repose `workers/sg-payments/index.js` (§7).
--
-- Idempotent : peut être rejoué sans effet de bord.

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
SET search_path = ''
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

-- Les privilèges d'exécution sont rejoués ici pour que la migration soit
-- autonome et idempotente : la fonction n'est exécutable que par
-- service_role.
REVOKE EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sg_upsert_payment_grant(text, text, text, text, timestamptz, timestamptz, jsonb) TO service_role;
