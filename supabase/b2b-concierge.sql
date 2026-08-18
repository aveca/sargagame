-- =====================================================================
-- B2B Concierge — schéma Supabase (à coller dans le SQL Editor du dashboard).
-- 7 tables pour le CRM B2B minimal + event sourcing.
-- Idempotent → safe à (re)coller sur une base déjà créée.
-- =====================================================================

-- 1) Prospects B2B (hôtels, offices, mairies)
create table if not exists public.b2b_prospects (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  beach       text,
  island      text,            -- mq | gp | florida | rivieramaya | puntacana
  phone       text,
  email       text,
  grade       text not null default 'A',  -- A | B | C
  status      text not null default 'new' -- new | contacted | qualified | concierge | paid | lost
);

alter table public.b2b_prospects enable row level security;

-- 2) Contacts / conversations
create table if not exists public.b2b_contacts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  prospect_id uuid not null references public.b2b_prospects(id) on delete cascade,
  date        timestamptz not null default now(),
  channel     text,            -- phone | email | whatsapp | chat
  summary     text,
  raw_transcript text
);

create index if not exists b2b_contacts_prospect_idx on public.b2b_contacts(prospect_id);
alter table public.b2b_contacts enable row level security;

-- 3) Scores P×F×C×V
create table if not exists public.b2b_scores (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  prospect_id     uuid not null references public.b2b_prospects(id) on delete cascade,
  problem_score   int not null default 0,   -- 0-3
  frequency_score int not null default 0,   -- 0-3
  cost_score      int not null default 0,   -- 0-3
  willingness_score int not null default 0, -- 0-3
  total_score     int not null default 0,   -- 0-12
  computed_at     timestamptz not null default now()
);

create index if not exists b2b_scores_prospect_idx on public.b2b_scores(prospect_id);
alter table public.b2b_scores enable row level security;

-- 4) Programmes concierge (7 jours)
create table if not exists public.b2b_concierge (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  prospect_id         uuid not null references public.b2b_prospects(id) on delete cascade,
  start_date          date not null,
  end_date            date not null,
  status              text not null default 'active',  -- active | completed | cancelled
  current_day         int not null default 0,
  payment_requested   boolean not null default false,
  payment_confirmed   boolean not null default false
);

create index if not exists b2b_concierge_prospect_idx on public.b2b_concierge(prospect_id);
create index if not exists b2b_concierge_status_idx on public.b2b_concierge(status);
alter table public.b2b_concierge enable row level security;

-- 5) Prévisions envoyées
create table if not exists public.b2b_forecast_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  concierge_id        uuid not null references public.b2b_concierge(id) on delete cascade,
  prospect_id         uuid not null references public.b2b_prospects(id) on delete cascade,
  beach               text,
  forecast_date       date,
  day_number          int not null,           -- 1-7
  risk_level          text,                   -- low | moderate | high
  confidence          int,
  explanation         text,
  recommended_action  text,
  channel             text not null default 'email',
  status              text not null default 'draft',  -- draft | ready | sent | failed | responded
  sent_at             timestamptz,
  feedback            text
);

create index if not exists b2b_forecasts_concierge_idx on public.b2b_forecast_deliveries(concierge_id);
create index if not exists b2b_forecasts_status_idx on public.b2b_forecast_deliveries(status);
alter table public.b2b_forecast_deliveries enable row level security;

-- 6) Paiements
create table if not exists public.b2b_payments (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  prospect_id         uuid not null references public.b2b_prospects(id) on delete cascade,
  concierge_id        uuid references public.b2b_concierge(id) on delete set null,
  amount              numeric(10,2) not null default 29.00,
  currency            text not null default 'EUR',
  plan                text not null default 'brief_monthly',
  status              text not null default 'pending',  -- pending | sent | paid | failed | expired
  mollie_payment_id   text,
  paid_at             timestamptz
);

create index if not exists b2b_payments_prospect_idx on public.b2b_payments(prospect_id);
create index if not exists b2b_payments_status_idx on public.b2b_payments(status);
alter table public.b2b_payments enable row level security;

-- 7) Événements (historique immuable — event sourcing)
create table if not exists public.b2b_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  prospect_id uuid references public.b2b_prospects(id) on delete set null,
  type        text not null,   -- PROSPECT_CREATED | CONTACTED | PROBLEM_CAPTURED | CONCIERGE_ACCEPTED | FORECAST_PREPARED | DAY_N_SENT | PAYMENT_REQUESTED | CHECKOUT_CREATED | PAYMENT_CONFIRMED | PAYMENT_FAILED | CONCIERGE_COMPLETED
  actor       text not null default 'system',  -- founder | system | webhook
  metadata    jsonb not null default '{}'
);

create index if not exists b2b_events_prospect_idx on public.b2b_events(prospect_id);
create index if not exists b2b_events_type_idx on public.b2b_events(type);
create index if not exists b2b_events_created_idx on public.b2b_events(created_at desc);
alter table public.b2b_events enable row level security;

-- =====================================================================
-- RLS : service_role only pour toutes les tables B2B (pas d'anonym access)
-- =====================================================================
-- Les policies existantes (empty) bloquent l'anon SELECT/INSERT/UPDATE/DELETE
-- Seule la service_role peut lire/écrire via les endpoints PHP
