-- P0.118 §1 — Moindre privilège sur public.b2b_leads.
--
-- ⚠️ MIGRATION PRÉPARÉE, NON APPLIQUÉE.
-- L'application sur la base de production exige une autorisation explicite
-- (mission P0.118 §12). Les tests associés ne s'exécutent que sur une base
-- JETABLE (cf. tests/unit/p0-118-migrations-privileges.test.cjs), jamais sur
-- la production.
--
-- OBJECTIF
-- `public.b2b_leads` contient des prospects B2B (PII : email, organisation,
-- téléphone). Aucun rôle applicatif ne doit pouvoir lire ni écrire cette
-- table depuis le client : seule la Worker (service_role) écrit, et la
-- lecture se fait par surface serveur.
--
--   anon          : SELECT / INSERT / UPDATE / DELETE / TRUNCATE INTERDITS
--   authenticated : idem
--   service_role  : PRÉSERVÉ (il contourne les RLS et reste propriétaire)
--
-- Aucun nom de colonne n'est inventé : la migration n'agit que sur les
-- PRIVILÈGES au niveau table et sur l'activation des RLS. Elle ne modifie
-- aucune donnée, aucune colonne et aucune politique existante.

DO $$
BEGIN
  IF to_regclass('public.b2b_leads') IS NULL THEN
    RAISE NOTICE 'public.b2b_leads absent : aucun privilège modifié (migration sans effet).';
    RETURN;
  END IF;

  -- Supprimer la policy permissive TO public constatée en production.
  EXECUTE 'DROP POLICY IF EXISTS "Allow all b2b_leads" ON public.b2b_leads';
  EXECUTE 'ALTER TABLE public.b2b_leads ENABLE ROW LEVEL SECURITY';

  -- Révocation complète pour PUBLIC et les rôles applicatifs (inclut TRUNCATE).
  EXECUTE 'REVOKE ALL ON TABLE public.b2b_leads FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.b2b_leads FROM anon';
  EXECUTE 'REVOKE ALL ON TABLE public.b2b_leads FROM authenticated';

  -- service_role n'est PAS révoqué : il doit conserver l'accès d'écriture
  -- de la Worker.
  RAISE NOTICE 'public.b2b_leads : RLS activée, privilèges anon/authenticated révoqués, service_role préservé.';
END;
$$;
