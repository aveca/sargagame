-- =====================================================================
-- Photos visiteurs — schéma Supabase (à coller dans le SQL Editor du dashboard).
-- Table `photos` + RLS (sécurité) + bucket de stockage public `beach-photos`.
-- Tout est gérable ensuite depuis le téléphone (dashboard web). Cf.
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

-- Colonne `notified` : suivi des alertes email (évite de re-notifier). Idempotent →
-- safe à (re)lancer sur une table déjà créée.
alter table public.photos add column if not exists notified boolean not null default false;

create index if not exists photos_beach_approved_idx
  on public.photos (beach_id, status, created_at desc);

alter table public.photos enable row level security;

-- 2) RLS — sécurité (la clé anon est publique, c'est ICI qu'on protège)
-- a) N'importe qui peut SOUMETTRE une photo, mais FORCÉMENT en 'pending'
drop policy if exists "anon insert pending" on public.photos;
create policy "anon insert pending" on public.photos
  for insert to anon
  with check (status = 'pending');

-- b) N'importe qui ne peut LIRE que les photos 'approved' (modérées)
drop policy if exists "anon read approved" on public.photos;
create policy "anon read approved" on public.photos
  for select to anon
  using (status = 'approved');

-- (La modération = passer status à 'approved' dans le Table Editor du dashboard,
--  ou via la clé service_role. L'anon NE PEUT PAS update/delete : aucune policy.)

-- 3) Bucket de stockage public pour les images
insert into storage.buckets (id, name, public)
  values ('beach-photos', 'beach-photos', true)
  on conflict (id) do update set public = true;

-- a) N'importe qui peut UPLOADER dans ce bucket
drop policy if exists "anon upload beach-photos" on storage.objects;
create policy "anon upload beach-photos" on storage.objects
  for insert to anon
  with check (bucket_id = 'beach-photos');

-- b) Lecture publique des images (bucket public=true → URLs /object/public/… lisibles).
--    (Pas de policy SELECT nécessaire pour les URLs publiques.)

-- =====================================================================
-- planner_alerts — intentions de séjour du hub premium « La Vigie » (WeekHub).
-- Un premium qui planifie un séjour choisit une date future → l'app insère ici
-- {email, domain, region, trip_date}. Le cron scripts/automation/planner-alerts.cjs
-- envoie un rappel J-7 (« ton verdict jour par jour est ouvert ») puis marque
-- notified=true. Idempotent → safe à (re)coller sur une base déjà créée.
-- Ce bloc est aussi (best-effort) auto-créé par le cron via l'API Management si
-- SUPABASE_ACCESS_TOKEN est présent — le coller à la main reste le fallback.
-- =====================================================================

create table if not exists public.planner_alerts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  email       text not null,
  domain      text,            -- hostname d'origine → lien du rappel (zéro mapping serveur)
  region      text,            -- id région / island (analytics)
  beach_id    text,
  beach_name  text,
  trip_date   date not null,   -- date de séjour visée
  lang        text,            -- fr | en | es (localise le rappel)
  notified    boolean not null default false
);

create index if not exists planner_alerts_due_idx
  on public.planner_alerts (trip_date, notified);

alter table public.planner_alerts enable row level security;

-- RLS : n'importe qui peut DÉPOSER une intention (jamais déjà notifiée), personne
-- ne peut la LIRE avec la clé anon (PII). Lecture/update = clé service_role (cron).
drop policy if exists "anon insert planner" on public.planner_alerts;
create policy "anon insert planner" on public.planner_alerts
  for insert to anon
  with check (notified = false);

-- =====================================================================
-- beach_reports — ÉVÉNEMENTS terrain par plage (échouement / ramassage).
-- Le satellite voit le banc au large ; il NE VOIT PAS deux transitions réelles :
--   • beaching  : les algues viennent d'échouer sur le sable.
--   • cleanup   : la commune a ramassé → saut instantané vers propre.
-- On les capture ici (donnée terrain, pas de l'argent). En V1 = SIGNAL AFFICHÉ
-- modéré à côté du verdict (badge « signalé par X visiteurs · en cours de
-- vérification ») — il NE TOUCHE PAS la couleur du verdict (100 % data ERDDAP).
-- La fusion au verdict viendra plus tard, derrière un flag + backtest, quand le
-- volume de reports le justifiera (panel adverse 2026-07-01).
-- Modération = même pipeline que `photos` : insert 'pending', lecture 'approved'.
-- Idempotent → safe à (re)coller sur une base déjà créée.
-- =====================================================================

create table if not exists public.beach_reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  beach_id    text not null,
  beach_name  text,
  island      text,
  event       text not null,   -- 'beaching' | 'cleanup'
  note        text,            -- note libre courte (modérée), optionnelle
  photo_url   text,            -- preuve optionnelle (URL Storage beach-photos)
  status      text not null default 'pending',  -- pending | approved | rejected
  notified    boolean not null default false
);

-- Colonnes GTT (Ground-Truth Terrain, cf. docs/GROUND_TRUTH_TERRAIN.md). Additives,
-- idempotentes → safe à (re)lancer. Remplies par l'Edge Function submit-report (Phase 0.3) ;
-- restent NULL pour les inserts directs legacy (sans effet sur la modération).
--   submitter_hash        : empreinte anti-Sybil calculée SERVEUR (uid+salt+tranche IP),
--                           base du quorum (jamais un comptage de lignes client).
--   within_150m           : booléen de présence GPS calculé serveur (la coord brute est
--                           JETÉE, jamais persistée — minimisation RGPD).
--   downgrade_confirmed_at : clé 2 du modérateur (« Rétrograder le verdict ») — seul champ
--                           qui autorise la lane descente à bouger la couleur (Phase 2).
alter table public.beach_reports add column if not exists submitter_hash text;
alter table public.beach_reports add column if not exists within_150m boolean;
alter table public.beach_reports add column if not exists downgrade_confirmed_at timestamptz;

create index if not exists beach_reports_approved_idx
  on public.beach_reports (beach_id, status, created_at desc);
-- Index quorum : distinct submitter_hash par plage/event/fenêtre (calcul serveur du quorum).
create index if not exists beach_reports_quorum_idx
  on public.beach_reports (beach_id, event, status, created_at desc);

alter table public.beach_reports enable row level security;

-- a) N'importe qui peut SIGNALER un événement, mais FORCÉMENT en 'pending'
--    et sur un `event` de la liste blanche (aucun autre type n'entre).
drop policy if exists "anon insert beach_report" on public.beach_reports;
create policy "anon insert beach_report" on public.beach_reports
  for insert to anon
  with check (status = 'pending' and event in ('beaching', 'cleanup'));

-- b) N'importe qui ne peut LIRE que les événements 'approved' (modérés)
drop policy if exists "anon read beach_report" on public.beach_reports;
create policy "anon read beach_report" on public.beach_reports
  for select to anon
  using (status = 'approved');

-- (Modération = passer status à 'approved' au dashboard / clé service_role.
--  L'anon NE PEUT PAS update/delete : aucune policy.)

-- ─────────────────────────────────────────────────────────────────────────────
-- analytics_events — sink FUNNEL / télémétrie (migration Apps Script → Supabase,
-- 2026-07). WRITE-ONLY côté anon : le front insère les étapes du funnel
-- (sg_session_start … sg_pass_cta … sg_conversion), l'agrégation lit avec la
-- service key (scripts/automation/funnel-from-supabase.cjs). But : ne plus
-- dépendre d'un `clasp push` (Code.js) pour compter/corriger le funnel. Pas de PII
-- (event + params non-nominatifs). Purge périodique conseillée (>90 j).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.analytics_events (
  id     bigint generated always as identity primary key,
  event  text not null,
  params jsonb,
  island text,
  ts     timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

-- anon INSERT uniquement (write-only). AUCUNE policy SELECT anon → non lisible
-- côté client ; seule la service_role (agrégation) lit.
drop policy if exists "anon insert analytics" on public.analytics_events;
create policy "anon insert analytics" on public.analytics_events
  for insert to anon
  with check (true);

create index if not exists analytics_events_ts_idx on public.analytics_events (ts desc);
create index if not exists analytics_events_event_idx on public.analytics_events (event);

-- =====================================================================
-- payment_grants — MIRROR des grants B2C/B2B (migration file-based → Supabase).
-- Rempli par mol_supabase_mirror() dans mollie-lib.php (webhook Mollie).
-- But : survie aux restarts/déploys (le file-based /tmp est volatil).
-- RLS : lecture service_role seulement, écriture = webhook PHP (service key).
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
  session_id  text,           -- Funnel session ID (sgUid) to join CTA→checkout→payment→grant
  metadata    jsonb,          -- B2C : metadata complet du paiement
  unique (payment_id),
  unique (subscription_id)
);

alter table public.payment_grants enable row level security;

-- Anon NE PEUT PAS lire (PII : email, customer_id) — lecture service_role seulement
-- Écriture = webhook Mollie (clé service) via mol_supabase_mirror()
-- Pas de policy INSERT anon → écriture côté serveur seulement

-- =====================================================================
-- sg_users — IDENTITÉ UTILISATEUR STABLE (sprint funnel 2026-09-03)
-- Un user_id interne par personne ; rattache Google Sign-In et les paiements.
-- Jamais l'email comme identifiant primaire (l'email est un attribut mutable).
-- Rattachement déterministe : Google « sub » unique ; email unique ; un compte
-- Google dont l'email correspond à un user existant se LINK au même user_id.
-- RLS : aucune policy anon/auth — accès service_role uniquement (worker).
-- =====================================================================
create table if not exists public.sg_users (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  email            text,                       -- canonique (lowercase, trim)
  provider         text not null default 'email',  -- 'google' | 'email'
  provider_user_id text                        -- Google « sub » (jamais pour email-only)
);
create unique index if not exists sg_users_email_key on public.sg_users (lower(email)) where email is not null;
create unique index if not exists sg_users_google_sub_key on public.sg_users (provider, provider_user_id) where provider_user_id is not null;
alter table public.sg_users enable row level security;

-- Rattachement des entitlements au user_id (additif — l'email reste présent,
-- les anciens grants gardent user_id NULL et restent résolubles par email).
alter table public.payment_grants add column if not exists user_id uuid;
create index if not exists payment_grants_user_idx on public.payment_grants (user_id);

-- =====================================================================
-- b2c_alerts — Alertes B2C sargassum par région (SPRINT #15)
-- Insert via LeadCapture B2C toggle → /api/supabase generic
-- Cron Worker sg-payments 2x/jour (06:00/18:00) → sendEmail si sargassum moderate+
-- Unsubscribe : GET /unsubscribe?token=XXX → status='unsubscribed'
-- =====================================================================
create table if not exists public.b2c_alerts (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  region            text not null,
  domain            text not null,
  beaches           text[],
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  unsubscribe_token text not null default gen_random_uuid()::text
);
create index if not exists b2c_alerts_status_idx on public.b2c_alerts (status);
create index if not exists b2c_alerts_token_idx on public.b2c_alerts (unsubscribe_token);
alter table public.b2c_alerts enable row level security;
drop policy if exists "anon insert b2c_alert" on public.b2c_alerts;
create policy "anon insert b2c_alert" on public.b2c_alerts for insert to anon with check (true);
drop policy if exists "anon select b2c_alert" on public.b2c_alerts;
create policy "anon select b2c_alert" on public.b2c_alerts for select to anon using (true);
-- UPDATE via service_role seulement (Worker unsubscribe), pas d'UPDATE anon
-- Lecture service_role pour cron (tous les actifs)

-- =====================================================================
-- b2b_leads — Leads B2B map_banner (LeadCapture B2B toggle)
-- =====================================================================
create table if not exists public.b2b_leads (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  domain       text not null,
  region       text not null,
  source       text default 'map_banner',
  status       text default 'new',
  contacted_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.b2b_leads enable row level security;
drop policy if exists "b2b_leads_insert" on public.b2b_leads;
create policy "b2b_leads_insert" on public.b2b_leads for insert with check (true);
drop policy if exists "b2b_leads_select" on public.b2b_leads;
create policy "b2b_leads_select" on public.b2b_leads for select using (true);
drop policy if exists "b2b_leads_update" on public.b2b_leads;
create policy "b2b_leads_update" on public.b2b_leads for update using (true);
create index if not exists b2b_leads_status_idx on public.b2b_leads (status, created_at);
