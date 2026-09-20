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

-- =====================================================================
-- OUTREACH AUTOMATION 0-PC (sprint 2026-09-06) : file d'attente cold
-- email hôtelier + posts sociaux, pilotée par le Worker workers/outreach
-- (Cron Cloudflare). Idempotent (create if not exists). Horaires en UTC ;
-- les fenêtres d'envoi sont calculées par le Worker (Intl, tz par région).
-- AUCUN contact seedé ici (PII) : insertion par le fondateur (SQL Editor).
-- =====================================================================

-- 1) Contacts outreach (machine d'état explicite, jamais un booléen sent)
create table if not exists public.outreach_contacts (
  id                uuid primary key default gen_random_uuid(),
  hotel_name        text not null,
  contact_name      text,
  email             text not null,
  country           text,
  region            text not null default 'MQ',  -- MQ | GP | FLORIDA | PUNTACANA | RIVIERAMAYA | TULUM
  language          text not null default 'fr',  -- fr | en | es
  source            text,                          -- d'où vient le prospect
  status            text not null default 'new',   -- new|ready|queued|sending|sent|replied|positive|negative|unsubscribed|bounced|paused|failed
  campaign_id       text not null default 'b2b-hotel-01',
  current_step      int not null default 0,        -- 0=contact, 1=relance, 2=dernière
  next_action_at    timestamptz,                   -- NULL = dû immédiatement (si status actif)
  last_sent_at      timestamptz,
  last_error_at     timestamptz,
  last_error        text,
  provider_message_id text,
  reply_status      text,                          -- NULL | replied | positive | negative
  unsubscribe_at    timestamptz,
  attempts          int not null default 0,        -- tentatives étape courante (backoff)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.outreach_contacts enable row level security;
drop policy if exists "outreach_contacts_all" on public.outreach_contacts;
create policy "outreach_contacts_all" on public.outreach_contacts for all using (true) with check (true);
create index if not exists outreach_contacts_due_idx on public.outreach_contacts (status, next_action_at) where status in ('ready','queued','failed');
create index if not exists outreach_contacts_email_idx on public.outreach_contacts (email);

-- 2) Journal append-only (sélection/envois/erreurs/réponses/dry-run)
create table if not exists public.outreach_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  contact_id   uuid references public.outreach_contacts(id) on delete set null,
  kind         text not null,   -- selected|sent|failed|retry|bounced|replied|positive|negative|unsubscribed|heartbeat|dry_run|skipped
  step         int,
  detail       text,            -- raison de sélection, code erreur, réf provider (JAMAIS de secret)
  dry_run      boolean not null default false
);
alter table public.outreach_events enable row level security;
drop policy if exists "outreach_events_all" on public.outreach_events;
create policy "outreach_events_all" on public.outreach_events for all using (true) with check (true);
create index if not exists outreach_events_created_idx on public.outreach_events (created_at);
create index if not exists outreach_events_contact_idx on public.outreach_events (contact_id);

-- 3) Posts sociaux planifiés (déterminstes,Rotation contrôlée côté Worker)
create table if not exists public.social_posts (
  id             uuid primary key default gen_random_uuid(),
  platform       text not null default 'facebook', -- facebook (extensible)
  page_id        text,
  region         text not null default 'MQ',
  language       text not null default 'fr',
  category       text not null default 'meteo',    -- meteo|conseil|prevision|tourisme|cta|educatif
  content        text not null,
  media_url      text,
  scheduled_at   timestamptz not null,
  status         text not null default 'scheduled', -- draft|scheduled|publishing|published|failed|cancelled
  provider_post_id text,
  attempts       int not null default 0,
  last_error     text,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.social_posts enable row level security;
drop policy if exists "social_posts_all" on public.social_posts;
create policy "social_posts_all" on public.social_posts for all using (true) with check (true);
create index if not exists social_posts_due_idx on public.social_posts (status, scheduled_at) where status = 'scheduled';


-- ============================================================================
-- B2B SALES ENGINE — PHASE 1 DATA MODEL (2026-09-20)
-- DRY-RUN / REVIEWABLE: this block is only applied to production when merged to
-- main; apply-supabase-schema.yml triggers on main pushes touching this file.
--
-- Design rules:
--   * legal entity + establishment are distinct (SIREN != SIRET)
--   * contact identity is separate from company identity
--   * every enrichment fact keeps source/confidence/timestamp
--   * scores are append-only history, not a single mutable number
--   * suppression / legal basis are first-class records
--   * all new tables are service_role-only (no anon/authenticated policies)
--   * existing outreach engine remains the sending layer (no third engine)
-- ============================================================================

-- 1) Legal entities.
create table if not exists public.companies (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  legal_name        text not null,
  trading_name      text,
  siren             text,
  legal_form        text,
  ape_code          text,
  ape_label          text,
  legal_status      text not null default 'unknown', -- active | inactive | unknown
  is_micro_enterprise boolean,
  employee_range     text,            -- code tranche effectifs SIRENE (NN, 00, 01..53)
  creation_date      date,
  source_updated_at  timestamptz,     -- date du dernier constat source (import SIRENE)
  country_code      text not null default 'FR',
  source             text,
  source_record_id   text
);

create unique index if not exists companies_siren_uidx
  on public.companies (siren)
  where siren is not null;

create index if not exists companies_name_idx
  on public.companies (lower(legal_name));

create index if not exists companies_source_idx
  on public.companies (source, source_record_id);

alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated;
grant all on public.companies to service_role;

-- 2) Physical establishments (SIRET-level).
create table if not exists public.company_establishments (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  siret                text,
  nic                  text,
  establishment_name   text,
  siege                 boolean not null default false, -- etablissementSiege SIRENE
  ape_code              text,                            -- activitePrincipaleEtablissement
  status               text not null default 'unknown', -- active | inactive | unknown
  address_line1        text,
  address_line2        text,
  postal_code          text,
  city                  text,
  region_code           text,
  country_code          text not null default 'FR',
  latitude              double precision,
  longitude             double precision,
  source_updated_at     timestamptz,   -- dernier constat SIRENE
  source                text,
  source_record_id      text
);

create unique index if not exists company_establishments_siret_uidx
  on public.company_establishments (siret)
  where siret is not null;

create index if not exists company_establishments_company_idx
  on public.company_establishments (company_id);

create index if not exists company_establishments_region_idx
  on public.company_establishments (region_code, city);

alter table public.company_establishments enable row level security;
revoke all on public.company_establishments from anon, authenticated;
grant all on public.company_establishments to service_role;

-- 3) Human contacts, separate from the legal entity.
create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  company_id           uuid references public.companies(id) on delete set null,
  establishment_id     uuid references public.company_establishments(id) on delete set null,
  first_name            text,
  last_name             text,
  job_title             text,
  email                 text,
  phone                 text,
  whatsapp_number       text,
  language              text default 'fr',
  source                text,
  source_record_id      text,
  verified_at           timestamptz
);

create index if not exists contacts_company_idx
  on public.contacts (company_id);

create index if not exists contacts_establishment_idx
  on public.contacts (establishment_id);

create unique index if not exists contacts_email_uidx
  on public.contacts (lower(trim(email)))
  where email is not null;

alter table public.contacts enable row level security;
revoke all on public.contacts from anon, authenticated;
grant all on public.contacts to service_role;

-- 4) Field-level enrichment provenance.
create table if not exists public.company_enrichment (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  establishment_id       uuid references public.company_establishments(id) on delete cascade,
  contact_id             uuid references public.contacts(id) on delete cascade,
  field_name             text not null,
  value_json             jsonb not null,
  source_id              uuid,
  confidence             numeric(5,4),
  observed_at            timestamptz,
  fetched_at             timestamptz not null default now(),
  current_value          boolean not null default true,
  constraint company_enrichment_confidence_chk
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists company_enrichment_company_idx
  on public.company_enrichment (company_id, field_name, fetched_at desc);

create index if not exists company_enrichment_current_idx
  on public.company_enrichment (company_id, field_name)
  where current_value;

alter table public.company_enrichment enable row level security;
revoke all on public.company_enrichment from anon, authenticated;
grant all on public.company_enrichment to service_role;

-- 5) Configurable segments (rules are data, not hard-coded branches).
create table if not exists public.segments (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  key                text not null,
  name               text not null,
  description        text,
  rules              jsonb not null default '{}'::jsonb,
  priority            integer not null default 0,
  active              boolean not null default true
);

create unique index if not exists segments_key_uidx on public.segments(key);
create index if not exists segments_active_idx on public.segments(active, priority desc);

alter table public.segments enable row level security;
revoke all on public.segments from anon, authenticated;
grant all on public.segments to service_role;

-- 6) Prospect machine state linking company + establishment + contact + segment.
create table if not exists public.prospects (
  id                    uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  establishment_id       uuid references public.company_establishments(id) on delete set null,
  primary_contact_id     uuid references public.contacts(id) on delete set null,
  segment_id             uuid references public.segments(id) on delete set null,
  status                 text not null default 'new',
  priority               integer not null default 0,
  next_action_at         timestamptz,
  last_contacted_at      timestamptz,
  first_replied_at       timestamptz,
  qualified_at           timestamptz,
  paid_at                timestamptz,
  lost_at                timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  constraint prospects_status_chk check (
    status in (
      'new','enriching','enriched','scored','ready','contacted','replied',
      'interested','not_interested','callback_requested','qualified','converted',
      'concierge','paid','lost','bounced','opted_out','suppressed','paused'
    )
  )
);

create unique index if not exists prospects_establishment_uidx
  on public.prospects (establishment_id)
  where establishment_id is not null;

create index if not exists prospects_status_due_idx
  on public.prospects (status, next_action_at);

create index if not exists prospects_company_idx
  on public.prospects (company_id);

create index if not exists prospects_segment_idx
  on public.prospects (segment_id, status);

alter table public.prospects enable row level security;
revoke all on public.prospects from anon, authenticated;
grant all on public.prospects to service_role;

-- 7) Score history (append-only by design). Deterministic 6-component model
--    (scripts/lib/b2b-scoring.cjs, model 'deterministic-v1') — never a single
--    mutable number, never AI-picked: every component and every reason is
--    stored to keep scores explainable.
create table if not exists public.prospect_scores (
  id                    uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  prospect_id            uuid not null references public.prospects(id) on delete cascade,
  score                  integer not null,
  b2b_relevance          integer not null default 0,   -- 0-25
  sector_relevance       integer not null default 0,   -- 0-25
  commercial_potential   integer not null default 0,   -- 0-20
  contactability         integer not null default 0,   -- 0-15
  company_quality        integer not null default 0,   -- 0-10
  data_confidence        integer not null default 0,   -- 0-5
  reasons                jsonb not null default '[]'::jsonb,
  model_version          text not null default 'deterministic-v1',
  computed_at            timestamptz not null default now(),
  constraint prospect_scores_score_chk check (score between 0 and 100),
  constraint prospect_scores_components_chk check (
    b2b_relevance between 0 and 25 and
    sector_relevance between 0 and 25 and
    commercial_potential between 0 and 20 and
    contactability between 0 and 15 and
    company_quality between 0 and 10 and
    data_confidence between 0 and 5
  )
);

create index if not exists prospect_scores_prospect_idx
  on public.prospect_scores (prospect_id, computed_at desc);

alter table public.prospect_scores enable row level security;
revoke all on public.prospect_scores from anon, authenticated;
grant all on public.prospect_scores to service_role;

-- 8) Unified suppression ledger.
create table if not exists public.suppressions (
  id                    uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  suppression_type      text not null, -- email | phone | company | contact
  normalized_value      text not null,
  reason                text not null, -- unsubscribe | bounce | complaint | manual | legal
  legal_basis            text,
  source                text,
  contact_id             uuid references public.contacts(id) on delete set null,
  company_id             uuid references public.companies(id) on delete set null,
  suppressed_at          timestamptz not null default now(),
  expires_at             timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  constraint suppressions_type_chk
    check (suppression_type in ('email','phone','company','contact'))
);

create unique index if not exists suppressions_value_uidx
  on public.suppressions (suppression_type, normalized_value);

create index if not exists suppressions_active_idx
  on public.suppressions (suppression_type, normalized_value, suppressed_at desc);

alter table public.suppressions enable row level security;
revoke all on public.suppressions from anon, authenticated;
grant all on public.suppressions to service_role;

-- 9) Contact/legal-basis ledger. Does not send or grant permission by itself.
create table if not exists public.consents (
  id                    uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  contact_id             uuid references public.contacts(id) on delete cascade,
  company_id             uuid references public.companies(id) on delete cascade,
  purpose               text not null,
  legal_basis            text not null,
  status                 text not null default 'active', -- active | withdrawn | expired | unknown
  captured_at            timestamptz not null default now(),
  withdrawn_at           timestamptz,
  source                text,
  evidence               jsonb not null default '{}'::jsonb,
  constraint consents_status_chk
    check (status in ('active','withdrawn','expired','unknown'))
);

create index if not exists consents_contact_purpose_idx
  on public.consents (contact_id, purpose, captured_at desc);

create index if not exists consents_company_purpose_idx
  on public.consents (company_id, purpose, captured_at desc);

alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant all on public.consents to service_role;

-- 10) Source registry for SIRENE and future enrichers.
create table if not exists public.data_sources (
  id                    uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  key                   text not null,
  name                  text not null,
  provider              text,
  source_type            text not null, -- registry | website | directory | manual | api
  version                text,
  base_url               text,
  active                 boolean not null default true,
  metadata               jsonb not null default '{}'::jsonb
);

create unique index if not exists data_sources_key_uidx on public.data_sources(key);

alter table public.data_sources enable row level security;
revoke all on public.data_sources from anon, authenticated;
grant all on public.data_sources to service_role;

-- Attach enrichment source FK after both tables exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_enrichment_source_id_fkey'
  ) then
    alter table public.company_enrichment
      add constraint company_enrichment_source_id_fkey
      foreign key (source_id) references public.data_sources(id) on delete set null;
  end if;
end $$;

-- 11) Unified audit trail for decisions/actions across the sales engine.
create table if not exists public.b2b_audit_log (
  id                    uuid primary key default gen_random_uuid(),
  occurred_at            timestamptz not null default now(),
  actor_type             text not null default 'system', -- system | founder | worker | webhook
  actor_id               text,
  action                 text not null,
  entity_type            text not null,
  entity_id              uuid,
  prospect_id            uuid references public.prospects(id) on delete set null,
  metadata               jsonb not null default '{}'::jsonb
);

create index if not exists b2b_audit_log_entity_idx
  on public.b2b_audit_log (entity_type, entity_id, occurred_at desc);

create index if not exists b2b_audit_log_prospect_idx
  on public.b2b_audit_log (prospect_id, occurred_at desc);

alter table public.b2b_audit_log enable row level security;
revoke all on public.b2b_audit_log from anon, authenticated;
grant all on public.b2b_audit_log to service_role;

-- 12) Bridge the new prospect model into the EXISTING outreach worker.
alter table public.outreach_contacts
  add column if not exists prospect_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outreach_contacts_prospect_id_fkey'
  ) then
    alter table public.outreach_contacts
      add constraint outreach_contacts_prospect_id_fkey
      foreign key (prospect_id) references public.prospects(id) on delete set null;
  end if;
end $$;

create index if not exists outreach_contacts_prospect_idx
  on public.outreach_contacts (prospect_id);

-- Explicitly preserve the existing outreach RLS behavior in this phase.
-- Tightening that legacy table is a separate security scope, not part of the model.
