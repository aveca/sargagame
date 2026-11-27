-- P0.46 — MARQUEURS DE LIVRAISON DURABLES POUR LES ALERTES B2C.
--
-- ⚠️ MIGRATION PRÉPARÉE, NON APPLIQUÉE.
-- L'application sur la base de production exige une autorisation explicite
-- (mission P0.46 §8 : aucune modification de base de production).
-- Ne pas exécuter ce fichier dans le cadre de la revue de PR.
--
-- PRÉ-CONDITION DE DÉPLOIEMENT
-- La migration DOIT être appliquée AVANT de déployer la version du Worker
-- qui réclame le marqueur (`workers/sg-payments/index.js`, §6). Si la table
-- ou la fonction est absente, le moteur d'alertes reste FAIL-CLOSED :
-- aucune alerte n'est envoyée (aucun doublon, aucune fausse alerte).
--
-- OBJECTIF
-- Un abonné ne doit jamais recevoir deux fois la même alerte pour la même
-- observation satellite. Clé d'identité d'une alerte :
--     (subscription_id, observation_ts, beaches_hash)
--   • une NOUVELLE observation satellite => nouvelle clé => nouvelle alerte
--     (autorisée) ;
--   • la MÊME observation rejouée (reprise du cron, double exécution
--     concurrente) => même clé => doublon SUPPRIMÉ.
-- Le SHA-256 des IDs de plage évite qu'un simple ajout de plage dans
-- l'abonnement ne « recycle » l'ancien marqueur.
--
-- SÉCURITÉ / DONNÉES
--   • Aucune ligne existante n'est lue, écrite ou supprimée : la table est
--     neuve et public.b2c_alerts (les abonnements) n'est jamais modifiée.
--   • Aucune PII stockée : ni email, ni nom — identifiant d'abonnement,
--     région, horodatage d'observation et empreinte SHA-256 des IDs de plage.
--   • RLS activée : seuls `service_role` (le Worker) et le propriétaire de la
--     table accèdent aux lignes.
--
-- Idempotent : peut être rejoué sans effet de bord.

CREATE TABLE IF NOT EXISTS public.b2c_alert_deliveries (
  subscription_id text        NOT NULL,
  observation_ts  timestamptz NOT NULL,
  beaches_hash    text        NOT NULL,
  region          text,
  status          text        NOT NULL DEFAULT 'claimed',
  provider        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2c_alert_deliveries_pkey
    PRIMARY KEY (subscription_id, observation_ts, beaches_hash),
  CONSTRAINT b2c_alert_deliveries_status_check
    CHECK (status IN ('claimed', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS b2c_alert_deliveries_created_at_idx
  ON public.b2c_alert_deliveries (created_at);

-- Leclaim atomique : la cle primaire fait foi. Deux appels concurrents
-- (deux Workers, deux cron) ne peuvent obtenir le marqueur qu'une fois.
CREATE OR REPLACE FUNCTION public.sg_claim_b2c_alert_delivery(
  p_subscription_id text,
  p_observation_ts  timestamptz,
  p_beaches_hash    text,
  p_region          text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_subscription_id IS NULL OR btrim(p_subscription_id) = '' THEN
    RETURN false;
  END IF;
  IF p_observation_ts IS NULL OR p_beaches_hash IS NULL OR btrim(p_beaches_hash) = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.b2c_alert_deliveries (
    subscription_id, observation_ts, beaches_hash, region, status
  ) VALUES (
    p_subscription_id, p_observation_ts, p_beaches_hash, p_region, 'claimed'
  )
  ON CONFLICT (subscription_id, observation_ts, beaches_hash) DO NOTHING;

  -- FOUND = true uniquement si la ligne vient d'etre inseree.
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sg_claim_b2c_alert_delivery(text, timestamptz, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sg_claim_b2c_alert_delivery(text, timestamptz, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sg_claim_b2c_alert_delivery(text, timestamptz, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sg_claim_b2c_alert_delivery(text, timestamptz, text, text) TO service_role;

-- Les clients PostgREST (anon / authenticated) ne lisent ni n'ecrivent les
-- marqueurs : `service_role` (bypass RLS) et la fonction SECURITY DEFINER
-- sont les seuls acces.
ALTER TABLE public.b2c_alert_deliveries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.b2c_alert_deliveries IS
  'P0.46 — marqueurs de livraison durables des alertes B2C (aucune PII, abonnements non modifies).';
COMMENT ON FUNCTION public.sg_claim_b2c_alert_delivery(text, timestamptz, text, text) IS
  'Reclame atomiquement un marqueur de livraison B2C. true = envoi autorise, false = doublon.';
