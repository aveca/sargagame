-- =====================================================================
-- Photos visiteurs â€” schÃ©ma Supabase (Ã  coller dans le SQL Editor du dashboard).
-- Table `photos` + RLS (sÃ©curitÃ©) + bucket de stockage public `beach-photos`.
-- Tout est gÃ©rable ensuite depuis le tÃ©lÃ©phone (dashboard web). Cf.
-- docs/visitor-photos-runbook.md et src/supabasePhotos.js.
-- =====================================================================

-- 1) Table des photos
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  beach_id    text not null,
  beach_name  text,
  island      text,
  level       text,           -- clean | moderate | avoid (optionnel)
  url         text not null,  -- URL publique de l'image (Storage)
  status      text not null default 'pending'  -- pending | approved | rejected
);

-- Colonne `notified` : suivi des alertes email (Ã©vite de re-notifier). Idempotent â†’
-- safe Ã  (re)lancer sur une table dÃ©jÃ  crÃ©Ã©e.
alter table public.photos add column if not exists notified boolean not null default false;

create index if not exists photos_beach_approved_idx
  on public.photos (beach_id, status, created_at desc);

alter table public.photos enable row level security;

-- 2) RLS â€” sÃ©curitÃ© (la clÃ© anon est publique, c'est ICI qu'on protÃ¨ge)
-- a) N'importe qui peut SOUMETTRE une photo, mais FORCÃ‰MENT en 'pending'
drop policy if exists "anon insert pending" on public.photos;
create policy "anon insert pending" on public.photos
  for insert to anon
  with check (status = 'pending');

-- b) N'importe qui ne peut LIRE que les photos 'approved' (modÃ©rÃ©es)
drop policy if exists "anon read approved" on public.photos;
create policy "anon read approved" on public.photos
  for select to anon
  using (status = 'approved');

-- (La modÃ©ration = passer status Ã  'approved' dans le Table Editor du dashboard,
--  ou via la clÃ© service_role. L'anon NE PEUT PAS update/delete : aucune policy.)

-- 3) Bucket de stockage public pour les images
insert into storage.buckets (id, name, public)
  values ('beach-photos', 'beach-photos', true)
  on conflict (id) do update set public = true;

-- a) N'importe qui peut UPLOADER dans ce bucket
drop policy if exists "anon upload beach-photos" on storage.objects;
create policy "anon upload beach-photos" on storage.objects
  for insert to anon
  with check (bucket_id = 'beach-photos');

-- b) Lecture publique des images (bucket public=true â†’ URLs /object/public/â€¦ lisibles).
--    (Pas de policy SELECT nÃ©cessaire pour les URLs publiques.)

-- =====================================================================
-- planner_alerts â€” intentions de sÃ©jour du hub premium Â« La Vigie Â» (WeekHub).
-- Un premium qui planifie un sÃ©jour choisit une date future â†’ l'app insÃ¨re ici
-- {email, domain, region, trip_date}. Le cron scripts/automation/planner-alerts.cjs
-- envoie un rappel J-7 (Â« ton verdict jour par jour est ouvert Â») puis marque
-- notified=true. Idempotent â†’ safe Ã  (re)coller sur une base dÃ©jÃ  crÃ©Ã©e.
-- Ce bloc est aussi (best-effort) auto-crÃ©Ã© par le cron via l'API Management si
-- SUPABASE_ACCESS_TOKEN est prÃ©sent â€” le coller Ã  la main reste le fallback.
-- =====================================================================

create table if not exists public.planner_alerts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  email       text not null,
  domain      text,            -- hostname d'origine â†’ lien du rappel (zÃ©ro mapping serveur)
  region      text,            -- id rÃ©gion / island (analytics)
  beach_id    text,
  beach_name  text,
  trip_date   date not null,   -- date de sÃ©jour visÃ©e
  lang        text,            -- fr | en | es (localise le rappel)
  notified    boolean not null default false
);

create index if not exists planner_alerts_due_idx
  on public.planner_alerts (trip_date, notified);

alter table public.planner_alerts enable row level security;

-- RLS : n'importe qui peut DÃ‰POSER une intention (jamais dÃ©jÃ  notifiÃ©e), personne
-- ne peut la LIRE avec la clÃ© anon (PII). Lecture/update = clÃ© service_role (cron).
drop policy if exists "anon insert planner" on public.planner_alerts;
create policy "anon insert planner" on public.planner_alerts
  for insert to anon
  with check (notified = false);

-- =====================================================================
-- beach_reports â€” Ã‰VÃ‰NEMENTS terrain par plage (Ã©chouement / ramassage).
-- Le satellite voit le banc au large ; il NE VOIT PAS deux transitions rÃ©elles :
--   â€¢ beaching  : les algues viennent d'Ã©chouer sur le sable.
--   â€¢ cleanup   : la commune a ramassÃ© â†’ saut instantanÃ© vers propre.
-- On les capture ici (donnÃ©e terrain, pas de l'argent). En V1 = SIGNAL AFFICHÃ‰
-- modÃ©rÃ© Ã  cÃ´tÃ© du verdict (badge Â« signalÃ© par X visiteurs Â· en cours de
-- vÃ©rification Â») â€” il NE TOUCHE PAS la couleur du verdict (100 % data ERDDAP).
-- La fusion au verdict viendra plus tard, derriÃ¨re un flag + backtest, quand le
-- volume de reports le justifiera (panel adverse 2026-07-01).
-- ModÃ©ration = mÃªme pipeline que `photos` : insert 'pending', lecture 'approved'.
-- Idempotent â†’ safe Ã  (re)coller sur une base dÃ©jÃ  crÃ©Ã©e.
-- =====================================================================

create table if not exists public.beach_reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  beach_id    text not null,
  beach_name  text,
  island      text,
  event       text not null,   -- 'beaching' | 'cleanup'
  note        text,            -- note libre courte (modÃ©rÃ©e), optionnelle
  photo_url   text,            -- preuve optionnelle (URL Storage beach-photos)
  status      text not null default 'pending',  -- pending | approved | rejected
  notified    boolean not null default false
);

-- Colonnes GTT (Ground-Truth Terrain, cf. docs/GROUND_TRUTH_TERRAIN.md). Additives,
-- idempotentes â†’ safe Ã  (re)lancer. Remplies par l'Edge Function submit-report (Phase 0.3) ;
-- restent NULL pour les inserts directs legacy (sans effet sur la modÃ©ration).
--   submitter_hash        : empreinte anti-Sybil calculÃ©e SERVEUR (uid+salt+tranche IP),
--                           base du quorum (jamais un comptage de lignes client).
--   within_150m           : boolÃ©en de prÃ©sence GPS calculÃ© serveur (la coord brute est
--                           JETÃ‰E, jamais persistÃ©e â€” minimisation RGPD).
--   downgrade_confirmed_at : clÃ© 2 du modÃ©rateur (Â« RÃ©trograder le verdict Â») â€” seul champ
--                           qui autorise la lane descente Ã  bouger la couleur (Phase 2).
alter table public.beach_reports add column if not exists submitter_hash text;
alter table public.beach_reports add column if not exists within_150m boolean;
alter table public.beach_reports add column if not exists downgrade_confirmed_at timestamptz;

create index if not exists beach_reports_approved_idx
  on public.beach_reports (beach_id, status, created_at desc);
-- Index quorum : distinct submitter_hash par plage/event/fenÃªtre (calcul serveur du quorum).
create index if not exists beach_reports_quorum_idx
  on public.beach_reports (beach_id, event, status, created_at desc);

alter table public.beach_reports enable row level security;

-- a) N'importe qui peut SIGNALER un Ã©vÃ©nement, mais FORCÃ‰MENT en 'pending'
--    et sur un `event` de la liste blanche (aucun autre type n'entre).
drop policy if exists "anon insert beach_report" on public.beach_reports;
create policy "anon insert beach_report" on public.beach_reports
  for insert to anon
  with check (status = 'pending' and event in ('beaching', 'cleanup'));

-- b) N'importe qui ne peut LIRE que les Ã©vÃ©nements 'approved' (modÃ©rÃ©s)
drop policy if exists "anon read beach_report" on public.beach_reports;
create policy "anon read beach_report" on public.beach_reports
  for select to anon
  using (status = 'approved');

-- (ModÃ©ration = passer status Ã  'approved' au dashboard / clÃ© service_role.
--  L'anon NE PEUT PAS update/delete : aucune policy.)

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- analytics_events â€” sink FUNNEL / tÃ©lÃ©mÃ©trie (migration Apps Script â†’ Supabase,
-- 2026-07). WRITE-ONLY cÃ´tÃ© anon : le front insÃ¨re les Ã©tapes du funnel
-- (sg_session_start â€¦ sg_pass_cta â€¦ sg_conversion), l'agrÃ©gation lit avec la
-- service key (scripts/automation/funnel-from-supabase.cjs). But : ne plus
-- dÃ©pendre d'un `clasp push` (Code.js) pour compter/corriger le funnel. Pas de PII
-- (event + params non-nominatifs). Purge pÃ©riodique conseillÃ©e (>90 j).
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.analytics_events (
  id     bigint generated always as identity primary key,
  event  text not null,
  params jsonb,
  island text,
  ts     timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

-- anon INSERT uniquement (write-only). AUCUNE policy SELECT anon â†’ non lisible
-- cÃ´tÃ© client ; seule la service_role (agrÃ©gation) lit.
drop policy if exists "anon insert analytics" on public.analytics_events;
create policy "anon insert analytics" on public.analytics_events
  for insert to anon
  with check (true);

create index if not exists analytics_events_ts_idx on public.analytics_events (ts desc);
create index if not exists analytics_events_event_idx on public.analytics_events (event);

-- =====================================================================
-- payment_grants â€” MIRROR des grants B2C/B2B (migration file-based â†’ Supabase).
-- Rempli par mol_supabase_mirror() dans mollie-lib.php (webhook Mollie).
-- But : survie aux restarts/dÃ©ploys (le file-based /tmp est volatil).
-- RLS : lecture service_role seulement, Ã©criture = webhook PHP (service key).
-- =====================================================================

create table if not exists public.payment_grants (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  payment_id  text,           -- B2C : paymentId Mollie (pay_once)
  subscription_id text,       -- B2B mensuel : subscriptionId
  type        text not null,  -- 'b2c_pass' | 'b2b_pro'
  pass        text,           -- B2C : 'p30' | 'trip7' | 'season'
  plan        text,           -- B2B : 'pro_monthly' | 'brief_monthly' | 'pro_annual' (one-time)
  email       text,           -- B2C : email payeur
  customer_id text,           -- B2B : customerId Mollie
  currency    text,           -- B2C : EUR/USD
  expires_at  timestamptz not null,
  granted_at  timestamptz not null,
  metadata    jsonb,          -- B2C : metadata complet du paiement
  unique (payment_id),
  unique (subscription_id)
);

alter table public.payment_grants enable row level security;

-- Anon NE PEUT PAS lire (PII : email, customer_id) â€” lecture service_role seulement
-- Ã‰criture = webhook Mollie (clÃ© service) via mol_supabase_mirror()
-- Pas de policy INSERT anon â†’ Ã©criture cÃ´tÃ© serveur seulement
