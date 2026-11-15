-- =====================================================================
-- Supabase Schema cible — Migration Google Sheets/Apps Script → Supabase
-- Projet : rswdmjtdzrucqzzukfmd (us-east-1, PostgreSQL 17)
-- Idempotent : safe à (re)coller dans le SQL Editor du dashboard Supabase
-- =====================================================================

-- Extension pour UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) b2b_contact_emails — Abonnés B2C (source : onglet `emails`)
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
  -- Traçabilité source (règle R2)
  source_sheet     text not null default 'emails',
  source_row_id    text,                          -- identifiant de ligne dans le Sheet d'origine
  source_updated_at timestamptz                   -- horodatage de la ligne source
);

-- ------------------------------------------------------------
-- 2) contact_feedback — Retours utilisateurs (source : onglet `feedback`)
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
-- 3) contact_payments — Paiements (source : onglet `payments`)
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
-- 4) contact_subscriptions — Cycle de vie abonnements (source : onglet `subscription_events`)
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
-- 5) email_campaigns — Campagnes d'email (source : `email_log` + `digest_log`)
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
-- 6) email_messages — Messages individuels (source : `email_tracking` + `email_events`)
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
-- 7) email_suppressions — Désabonnements + bounces (dérivé)
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
-- 8) contact_consents — Consentements (source : `feedback_requests`)
-- ------------------------------------------------------------
create table if not exists public.contact_consents (
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
-- 9) automation_runs — Automatisations (source : `drip_log` + `analytics_events`)
-- ------------------------------------------------------------
create table if not exists public.automation_runs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email            text not null,
  drip_id          text,                          -- drip_j3 | drip_j7 | drip_j14
  drip_day         int check (drip_day in (3, 7, 14)),
  island           text,
  status           text not null default 'sent',  -- sent | skipped | failed
  event_name       text,                          -- pour analytics_events
  raw_params       jsonb,                         -- params bruts (analytics)
  source_sheet     text not null default 'drip_log',
  source_row_id    text,
  source_updated_at timestamptz
);

-- ------------------------------------------------------------
-- 10) source_sync_runs — Audit trail des synchronisations
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

create index if not exists idx_b2b_contact_emails_email_hash
  on public.b2b_contact_emails(email_hash);
create index if not exists idx_b2b_contact_emails_island_status
  on public.b2b_contact_emails(island, unsubscribed);
create index if not exists idx_contact_subscriptions_event
  on public.contact_subscriptions(event_type, object_id);
create index if not exists idx_email_messages_campaign
  on public.email_messages(campaign_id, status);
create index if not exists idx_email_messages_resend_id
  on public.email_messages(resend_id);
create index if not exists idx_automation_runs_drip
  on public.automation_runs(drip_id, created_at);
create index if not exists idx_source_sync_runs_source
  on public.source_sync_runs(source_table, created_at desc);

-- =====================================================================
-- Contraintes de déduplication
-- =====================================================================

alter table public.b2b_contact_emails
  add constraint if not exists uk_b2b_contact_emails_email_hash_island
  unique (email_hash, island);

alter table public.contact_subscriptions
  add constraint if not exists uk_contact_subscriptions_event_object
  unique (event_type, object_id);

alter table public.automation_runs
  add constraint if not exists uk_automation_runs_email_drip_day
  unique (email, drip_id, drip_day);

alter table public.email_messages
  add constraint if not exists uk_email_messages_resend_id
  unique (resend_id);

alter table public.email_suppressions
  add constraint if not exists uk_email_suppressions_email
  unique (email);

alter table public.source_sync_runs
  add constraint if not exists uk_source_sync_runs_table_start
  unique (source_table, sync_started_at);

-- =====================================================================
-- Row Level Security (RLS)
-- Règle : aucune donnée B2C accessible par le rôle `anon`
-- Seule `service_role` peut lire/écrire les tables B2C
-- Exception : `anon` peut INSERT dans `b2b_contact_emails` (newsletter publique)
-- =====================================================================

alter table public.b2b_contact_emails enable row level security;
alter table public.contact_feedback enable row level security;
alter table public.contact_payments enable row level security;
alter table public.contact_subscriptions enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.contact_consents enable row level security;
alter table public.automation_runs enable row level security;
alter table public.source_sync_runs enable row level security;

-- b2b_contact_emails : INSERT public autorisé (newsletter), SELECT/UPDATE service_role uniquement
create policy if not exists b2b_contact_emails_insert_public
  on public.b2b_contact_emails for insert
  to anon
  with check (true);

create policy if not exists b2b_contact_emails_service_role_all
  on public.b2b_contact_emails
  using (true);

-- Toutes les autres tables B2C : service_role uniquement
create policy if not exists contact_feedback_service_role_all
  on public.contact_feedback using (true);
create policy if not exists contact_payments_service_role_all
  on public.contact_payments using (true);
create policy if not exists contact_subscriptions_service_role_all
  on public.contact_subscriptions using (true);
create policy if not exists email_campaigns_service_role_all
  on public.email_campaigns using (true);
create policy if not exists email_messages_service_role_all
  on public.email_messages using (true);
create policy if not exists email_suppressions_service_role_all
  on public.email_suppressions using (true);
create policy if not exists contact_consents_service_role_all
  on public.contact_consents using (true);
create policy if not exists automation_runs_service_role_all
  on public.automation_runs using (true);
create policy if not exists source_sync_runs_service_role_all
  on public.source_sync_runs using (true);

-- =====================================================================
-- Note : les tables B2B existantes (b2b_leads, b2b_subscriptions, b2c_alerts,
-- b2b_prospects, b2b_contacts, b2b_scores, b2b_concierge,
-- b2b_forecast_deliveries, b2b_payments, b2b_events) sont conservées
-- telles quelles et ne sont pas modifiées par ce schéma.
-- =====================================================================
