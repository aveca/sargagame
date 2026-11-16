-- =====================================================================
-- Supabase Schema cible — Migration Google Sheets/Apps Script → Supabase
-- Projet : rswdmjtdzrucqzzukfmd (us-east-1, PostgreSQL 17)
-- Idempotent : safe à (re)coller dans le SQL Editor du dashboard Supabase
-- NE PAS appliquer en production sans audit (P3 bloqué sur SUPABASE_SERVICE_KEY)
-- =====================================================================

-- Extension pour UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) b2b_organisations — Organisations B2B (distinctes des abonnés B2C)
--    Plusieurs contacts et emails peuvent appartenir à une même organisation.
-- ------------------------------------------------------------
create table if not exists public.b2b_organisations (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  name            text not null,                     -- nom de l'organisation (hôtel, office, mairie)
  island          text,                              -- mq | gp | florida | puntacana | rivieramaya | tulum
  beach           text,                              -- plage associée (optionnel)
  phone           text,
  grade           text not null default 'A',         -- A | B | C
  status          text not null default 'new',       -- new | contacted | qualified | concierge | paid | lost
  source_sheet    text not null default 'organisations',
  source_row_id   text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 2) b2b_contact_people — Contacts / interlocuteurs B2B (plusieurs par organisation)
-- ------------------------------------------------------------
create table if not exists public.b2b_contact_people (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  organisation_id  uuid references public.b2b_organisations(id) on delete set null,
  name             text not null,
  email            text,                              -- email du contact (peut être NULL si uniquement email principal de l'org)
  phone            text,
  role             text,                              -- propriétaire | réception | direction | etc.
  source_sheet     text not null default 'contacts',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 3) b2b_contact_emails — Abonnés B2C (source : onglet `emails`)
--    Une adresse B2C peut être liée à une organisation B2B (cas hybride),
--    mais reste distincte conceptuellement des abonnés purs B2C.
-- ------------------------------------------------------------
create table if not exists public.b2b_contact_emails (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  email            text not null,
  email_hash       text not null,                 -- SHA-256 tronqué 128 bits (RGPD)
  island           text not null,                 -- mq | gp | florida | puntacana | rivieramaya | tulum
  source           text,                          -- source d'inscription (sheet, widget, etc.)
  unsubscribed     boolean not null default false,
  unsubscribed_at  timestamptz,
  organisation_id  uuid references public.b2b_organisations(id) on delete set null, -- lien B2B optionnel
  -- Traçabilité source (règle R2)
  source_sheet     text not null default 'emails',
  source_row_id    text,                          -- identifiant de ligne dans le Sheet d'origine
  source_updated_at timestamptz                   -- horodatage de la ligne source
);

-- ------------------------------------------------------------
-- 4) contact_feedback — Retours utilisateurs (source : onglet `feedback`)
-- ------------------------------------------------------------
create table if not exists public.contact_feedback (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email_id         uuid references public.b2b_contact_emails(id) on delete set null,
  rating           int check (rating between 1 and 5),
  text             text,
  island           text,
  source_sheet     text not null default 'feedback',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 5) contact_payments — Paiements (source : onglet `payments`)
-- ------------------------------------------------------------
create table if not exists public.contact_payments (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email_id         uuid references public.b2b_contact_emails(id) on delete set null,
  session_id       text,
  amount           numeric(10,2),
  currency         text default 'EUR',
  status           text,                          -- paid | pending | failed | refunded
  island           text,
  source_sheet     text not null default 'payments',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 6) contact_subscriptions — Cycle de vie abonnements (source : onglet `subscription_events`)
-- ------------------------------------------------------------
create table if not exists public.contact_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email_id         uuid references public.b2b_contact_emails(id) on delete set null,
  event_type       text not null,                 -- invoice.payment_succeeded | customer.subscription.deleted | invoice.payment_failed
  object_id        text not null,                 -- id de l'objet Stripe (invoice, subscription, etc.)
  customer         text,
  subscription     text,
  amount           numeric(10,2),
  currency         text default 'EUR',
  island           text,
  source_sheet     text not null default 'subscription_events',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 7) email_campaigns — Campagnes d'email (source : `email_log` + `digest_log`)
-- ------------------------------------------------------------
create table if not exists public.email_campaigns (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  island           text not null,
  subject          text not null,
  sent             int not null default 0,
  total_subscribers int not null default 0,
  campaign_type    text not null default 'weekend', -- weekend | digest | welcome | drip | feedback
  source_sheet     text not null default 'email_log',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 8) email_messages — Messages individuels (source : `email_tracking` + `email_events`)
--    Une ligne par message envoyé. Dernier statut connu.
-- ------------------------------------------------------------
create table if not exists public.email_messages (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  campaign_id      uuid references public.email_campaigns(id) on delete set null,
  resend_id        text,                          -- ID Resend (unique si présent)
  to               text not null,
  subject          text,
  email_type       text,                          -- welcome | drip | weekend | digest | feedback
  island           text,
  status           text,                          -- sent | delivered | opened | clicked | bounced | complained
  plan             text,
  source           text,
  ab_tests         text,                          -- JSON des tests A/B
  source_sheet     text not null default 'email_tracking',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 9) email_message_events — Événements successifs par message (source : Resend webhook events)
--    Préserve TOUS les événements (opens, clicks, bounces, complaints), pas seulement le dernier.
--    Séparé de email_messages pour garder l'historique complet.
-- ------------------------------------------------------------
create table if not exists public.email_message_events (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  message_id       uuid references public.email_messages(id) on delete cascade,
  event_type       text not null,                 -- sent | delivered | opened | clicked | bounced | complained
  event_timestamp  timestamptz not null,          -- horodatage réel de l'événement Resend
  resend_event_id  text,                          -- ID de l'événement Resend (unique par événement)
  source_sheet     text not null default 'email_events',
  source_row_id    text
);

-- ------------------------------------------------------------
-- 10) email_suppressions — Désabonnements + bounces (dérivé)
-- ------------------------------------------------------------
create table if not exists public.email_suppressions (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email_id         uuid references public.b2b_contact_emails(id) on delete set null,
  email            text not null,
  reason           text not null default 'unsubscribe', -- unsubscribe | bounce | complaint
  suppressed_at    timestamptz not null default now(),
  source_sheet     text not null default 'emails',
  source_row_id    text
);

-- ------------------------------------------------------------
-- 11) contact_consents — Consentements marketing (état actuel)
--    Une demande de feedback (feedback_requests) ne constitue PAS une preuve de consentement.
-- ------------------------------------------------------------
create table if not exists public.contact_consents (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  email_id         uuid references public.b2b_contact_emails(id) on delete set null,
  email            text not null,
  status           text not null default 'pending', -- pending | sent | completed | declined
  requested_at     timestamptz,
  completed_at     timestamptz,
  source_sheet     text not null default 'consents',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 12) feedback_requests — Demandes de feedback (séparé des consentements)
--    Une demande de feedback ne vaut pas consentement marketing.
-- ------------------------------------------------------------
create table if not exists public.feedback_requests (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email_id         uuid references public.b2b_contact_emails(id) on delete set null,
  email            text not null,
  status           text not null default 'pending', -- pending | sent | completed | declined
  requested_at     timestamptz,
  completed_at     timestamptz,
  source_sheet     text not null default 'feedback_requests',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 13) automation_runs — Automatisations (source : `drip_log`)
--    Drip emails uniquement (pas d'analytics). Un événement = une exécution de drip.
-- ------------------------------------------------------------
create table if not exists public.automation_runs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email            text not null,
  drip_id          text,                          -- drip_j3 | drip_j7 | drip_j14
  drip_day         int check (drip_day in (3, 7, 14)),
  island           text,
  status           text not null default 'sent',  -- sent | skipped | failed
  source_sheet     text not null default 'drip_log',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 14) analytics_events — Sink funnel / télémétrie (séparé de automation_runs)
--    Write-only côté anon. Événements funnel (sg_session_start, sg_pass_cta, sg_conversion).
--    Pas de PII (event + params non-nominatifs). Purge conseillée >90 j.
-- ------------------------------------------------------------
create table if not exists public.analytics_events (
  id     bigint generated always as identity primary key,
  event  text not null,
  params jsonb,
  island text,
  ts     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 15) source_sync_runs — Audit trail des synchronisations
-- ------------------------------------------------------------
create table if not exists public.source_sync_runs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  source_table     text not null,                 -- emails | feedback | payments | ...
  sync_started_at  timestamptz not null,
  sync_completed_at timestamptz,
  rows_read        int not null default 0,
  rows_inserted    int not null default 0,
  rows_updated     int not null default 0,
  rows_skipped     int not null default 0,
  status           text not null default 'running', -- running | completed | failed
  error_message    text
);

-- =====================================================================
-- Index de performance
-- =====================================================================

create index if not exists idx_b2b_organisations_island_status
  on public.b2b_organisations(island, status);
create index if not exists idx_b2b_contact_people_organisation
  on public.b2b_contact_people(organisation_id);
create index if not exists idx_b2b_contact_emails_email_hash
  on public.b2b_contact_emails(email_hash);
create index if not exists idx_b2b_contact_emails_island_status
  on public.b2b_contact_emails(island, unsubscribed);
create index if not exists idx_b2b_contact_emails_organisation
  on public.b2b_contact_emails(organisation_id);
create index if not exists idx_contact_subscriptions_event
  on public.contact_subscriptions(event_type, object_id);
create index if not exists idx_email_campaigns_island_type
  on public.email_campaigns(island, campaign_type);
create index if not exists idx_email_messages_campaign
  on public.email_messages(campaign_id, status);
create index if not exists idx_email_messages_resend_id
  on public.email_messages(resend_id);
create index if not exists idx_email_message_events_message
  on public.email_message_events(message_id, event_type);
create index if not exists idx_email_message_events_resend_event
  on public.email_message_events(resend_event_id);
create index if not exists idx_email_suppressions_email
  on public.email_suppressions(email);
create index if not exists idx_contact_consents_email
  on public.contact_consents(email);
create index if not exists idx_feedback_requests_email
  on public.feedback_requests(email);
create index if not exists idx_automation_runs_drip
  on public.automation_runs(drip_id, created_at);
create index if not exists idx_analytics_events_ts
  on public.analytics_events(ts desc);
create index if not exists idx_analytics_events_event
  on public.analytics_events(event);
create index if not exists idx_source_sync_runs_source
  on public.source_sync_runs(source_table, created_at desc);

-- =====================================================================
-- Contraintes de déduplication (idempotentes : drop if exists + add)
-- PostgreSQL ne supporte pas `ADD CONSTRAINT IF NOT EXISTS`.
-- Clés conformes au comportement réel des scripts historiques Apps Script :
--   • email_signup   → dédup par (email, island)          [email_hash, island]
--   • subscription_events → dédup par (type, object_id)   [event_type, object_id]
--   • drip           → dédup par (email, drip_id, jour)   [email, drip_id, drip_day]
--   • Resend events  → dédup par resend_event_id          [resend_event_id]
--   • analytics      → dédup par (event, ts) approximatif [pas de contrainte unique stricte]
-- ------------------------------------------------------------

alter table public.b2b_contact_emails
  drop constraint if exists uk_b2b_contact_emails_email_hash_island;
alter table public.b2b_contact_emails
  add constraint uk_b2b_contact_emails_email_hash_island
  unique (email_hash, island);

alter table public.contact_subscriptions
  drop constraint if exists uk_contact_subscriptions_event_object;
alter table public.contact_subscriptions
  add constraint uk_contact_subscriptions_event_object
  unique (event_type, object_id);

alter table public.automation_runs
  drop constraint if exists uk_automation_runs_email_drip_day;
alter table public.automation_runs
  add constraint uk_automation_runs_email_drip_day
  unique (email, drip_id, drip_day);

alter table public.email_messages
  drop constraint if exists uk_email_messages_resend_id;
alter table public.email_messages
  add constraint uk_email_messages_resend_id
  unique (resend_id);

alter table public.email_message_events
  drop constraint if exists uk_email_message_events_resend_event;
alter table public.email_message_events
  add constraint uk_email_message_events_resend_event
  unique (resend_event_id);

alter table public.email_suppressions
  drop constraint if exists uk_email_suppressions_email;
alter table public.email_suppressions
  add constraint uk_email_suppressions_email
  unique (email);

alter table public.feedback_requests
  drop constraint if exists uk_feedback_requests_email_row;
alter table public.feedback_requests
  add constraint uk_feedback_requests_email_row
  unique (email, source_row_id);

alter table public.source_sync_runs
  drop constraint if exists uk_source_sync_runs_table_start;
alter table public.source_sync_runs
  add constraint uk_source_sync_runs_table_start
  unique (source_table, sync_started_at);

-- =====================================================================
-- Row Level Security (RLS)
-- Règle : aucune donnée B2C ni B2B accessible par le rôle `anon`
-- Seule `service_role` peut lire/écrire toutes les tables.
-- Aucune exception INSERT public (pas de newsletter publique via anon).
-- PostgreSQL ne supporte pas `CREATE POLICY IF NOT EXISTS` → drop + recreate.
-- =====================================================================

alter table public.b2b_organisations enable row level security;
alter table public.b2b_contact_people enable row level security;
alter table public.b2b_contact_emails enable row level security;
alter table public.contact_feedback enable row level security;
alter table public.contact_payments enable row level security;
alter table public.contact_subscriptions enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_message_events enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.contact_consents enable row level security;
alter table public.feedback_requests enable row level security;
alter table public.automation_runs enable row level security;
alter table public.analytics_events enable row level security;
alter table public.source_sync_runs enable row level security;

-- b2b_organisations : service_role uniquement
drop policy if exists b2b_organisations_service_role_all on public.b2b_organisations;
create policy b2b_organisations_service_role_all
  on public.b2b_organisations
  to service_role
  using (true)
  with check (true);

-- b2b_contact_people : service_role uniquement
drop policy if exists b2b_contact_people_service_role_all on public.b2b_contact_people;
create policy b2b_contact_people_service_role_all
  on public.b2b_contact_people
  to service_role
  using (true)
  with check (true);

-- b2b_contact_emails : service_role uniquement (pas d'accès anon)
drop policy if exists b2b_contact_emails_insert_public on public.b2b_contact_emails;
create policy b2b_contact_emails_service_role_all
  on public.b2b_contact_emails
  to service_role
  using (true)
  with check (true);

-- contact_feedback : service_role uniquement
drop policy if exists contact_feedback_service_role_all on public.contact_feedback;
create policy contact_feedback_service_role_all
  on public.contact_feedback
  to service_role
  using (true)
  with check (true);

-- contact_payments : service_role uniquement
drop policy if exists contact_payments_service_role_all on public.contact_payments;
create policy contact_payments_service_role_all
  on public.contact_payments
  to service_role
  using (true)
  with check (true);

-- contact_subscriptions : service_role uniquement
drop policy if exists contact_subscriptions_service_role_all on public.contact_subscriptions;
create policy contact_subscriptions_service_role_all
  on public.contact_subscriptions
  to service_role
  using (true)
  with check (true);

-- email_campaigns : service_role uniquement
drop policy if exists email_campaigns_service_role_all on public.email_campaigns;
create policy email_campaigns_service_role_all
  on public.email_campaigns
  to service_role
  using (true)
  with check (true);

-- email_messages : service_role uniquement
drop policy if exists email_messages_service_role_all on public.email_messages;
create policy email_messages_service_role_all
  on public.email_messages
  to service_role
  using (true)
  with check (true);

-- email_message_events : service_role uniquement
drop policy if exists email_message_events_service_role_all on public.email_message_events;
create policy email_message_events_service_role_all
  on public.email_message_events
  to service_role
  using (true)
  with check (true);

-- email_suppressions : service_role uniquement
drop policy if exists email_suppressions_service_role_all on public.email_suppressions;
create policy email_suppressions_service_role_all
  on public.email_suppressions
  to service_role
  using (true)
  with check (true);

-- contact_consents : service_role uniquement
drop policy if exists contact_consents_service_role_all on public.contact_consents;
create policy contact_consents_service_role_all
  on public.contact_consents
  to service_role
  using (true)
  with check (true);

-- feedback_requests : service_role uniquement
drop policy if exists feedback_requests_service_role_all on public.feedback_requests;
create policy feedback_requests_service_role_all
  on public.feedback_requests
  to service_role
  using (true)
  with check (true);

-- automation_runs : service_role uniquement
drop policy if exists automation_runs_service_role_all on public.automation_runs;
create policy automation_runs_service_role_all
  on public.automation_runs
  to service_role
  using (true)
  with check (true);

-- analytics_events : service_role uniquement (lecture), INSERT côté serveur seulement
drop policy if exists analytics_events_service_role_all on public.analytics_events;
create policy analytics_events_service_role_all
  on public.analytics_events
  to service_role
  using (true)
  with check (true);

-- source_sync_runs : service_role uniquement
drop policy if exists source_sync_runs_service_role_all on public.source_sync_runs;
create policy source_sync_runs_service_role_all
  on public.source_sync_runs
  to service_role
  using (true)
  with check (true);

-- =====================================================================
-- payment_grants : entitlements payants (B2C pass + B2B Pro)
-- Miroir Supabase du webhook Mollie. Source de vérité de verify_subscription
-- (filtre : expires_at > now()). Idempotence : unique(payment_id) /
-- unique(subscription_id) + upsert PostgREST (on_conflict).
--
-- RÉVOCATION : aucune colonne dédiée n'est nécessaire — mol_b2b_revoke()
-- place expires_at dans le passé, ce qui exclut la ligne du filtre
-- serveur. Le schéma reste donc aligné sur la table déjà en production
-- (supabase/schema.sql) : ce bloc est idempotent (if not exists) et
-- n'exige aucune migration destructive.
-- =====================================================================
create table if not exists public.payment_grants (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  payment_id      text,           -- B2C : paymentId Mollie (pay_once)
  subscription_id text,           -- B2B : subscriptionId Mollie
  type            text not null,  -- 'b2c_pass' | 'b2b_pro'
  pass            text,           -- B2C : 'p30' | 'trip7' | 'season' | 'sos'
  plan            text,           -- B2B : 'pro_monthly' | 'brief_monthly' | 'pro_annual' | 'brief_annual'
  email           text,           -- B2C : email payeur ; B2B : email hôtel (cross-device)
  customer_id     text,           -- B2B : customerId Mollie
  currency        text,           -- devise payée (EUR)
  expires_at      timestamptz not null,
  granted_at      timestamptz not null,
  metadata        jsonb,          -- metadata complète du paiement
  unique (payment_id),
  unique (subscription_id)
);

alter table public.payment_grants enable row level security;

drop policy if exists payment_grants_service_role_all on public.payment_grants;
create policy payment_grants_service_role_all
  on public.payment_grants
  to service_role
  using (true)
  with check (true);

-- =====================================================================
-- Note : les tables B2B existantes (b2b_leads, b2b_subscriptions, b2c_alerts,
-- b2b_prospects, b2b_contact_people, b2b_scores, b2b_concierge,
-- b2b_forecast_deliveries, b2b_payments, b2b_events) sont conservées
-- telles quelles et ne sont pas modifiées par ce schéma.
-- Les tables ci-dessus (b2b_organisations, b2b_contact_people) du schéma cible
-- sont distinctes des tables B2B legacy et ne doivent pas être confondues.
-- =====================================================================
