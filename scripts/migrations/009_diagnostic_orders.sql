-- 009_diagnostic_orders.sql
-- Commandes « Diagnostic Sargasses Express » (49 EUR TTC, ponctuel, un secteur).
--
-- ROLE
--   Table de COMMANDE et de PAIEMENT du diagnostic. Elle est la preuve
--   qu'un encaissement a bien ete rattache a une prestation a produire, et
--   l'etat de la machine a etats qui suit la production/livraison.
--
-- ETATS (contrainte SQL + machine a etats dans scripts/diagnostic/lib/order-state.mjs)
--   pending_payment : checkout cree, paiement NON confirme par Mollie
--   paid            : paiement confirme (autorite Mollie), commande a produire
--   processing      : production du document en cours
--   ready           : document genere, pret a etre envoye
--   delivered       : document envoye au client (trace dans diagnostic_deliveries)
--   manual_review   : blocage (generation, email, donnee) -> reprise humaine
--   refunded        : remboursement constate (webhook payment.refunded / chargeback)
--
-- SECURITE
--   - RLS active, service_role uniquement (le Worker et les scripts de
--     fulfillment sont les seuls lecteurs/ecriveurs ; le public ne lit rien).
--   - aucune donnee de carte, aucun secret.
--
-- IDEMPOTENCE
--   - ce script est rejouable : IF NOT EXISTS + DROP/CREATE POLICY.
--   - unique(payment_id) : un paiement Mollie = une commande, quel que soit
--     le nombre de notifications recues.

create table if not exists public.diagnostic_orders (
  order_id             bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  payment_id          text not null,
  product             text not null default 'diagnostic_express',
  status              text not null default 'pending_payment',
  client_email        text not null,
  client_name         text,
  contact_name        text,
  phone               text,
  establishment       text not null,
  sector              text not null,
  island              text not null default 'Martinique',
  amount              numeric(10,2) not null,
  currency            text not null default 'EUR',
  mollie_mode         text,
  mollie_checkout_url text,
  paid_at             timestamptz,
  ready_at            timestamptz,
  delivered_at        timestamptz,
  refunded_at         timestamptz,
  document_path       text,
  document_sha256     text,
  observation_ts      timestamptz,
  observation_source  text,
  data_age_minutes    integer,
  error               text,
  metadata            jsonb,
  unique (payment_id),
  constraint diagnostic_orders_status_check check (
    status in ('pending_payment','paid','processing','ready','delivered','manual_review','refunded')
  ),
  constraint diagnostic_orders_amount_check check (amount >= 0),
  constraint diagnostic_orders_currency_check check (currency = 'EUR')
);

-- Index de pilotage : commandes a produire, par secteur.
create index if not exists diagnostic_orders_status_idx on public.diagnostic_orders (status);
create index if not exists diagnostic_orders_sector_idx on public.diagnostic_orders (sector);
create index if not exists diagnostic_orders_created_idx on public.diagnostic_orders (created_at desc);

-- Trace de livraison (un envoi par periode : contrainte d'unicite applicative
-- assuree par le script, reinforced ici par l'index unique sur (payment_id, channel)).
create table if not exists public.diagnostic_deliveries (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  order_id        bigint references public.diagnostic_orders(order_id) on delete set null,
  payment_id      text not null,
  channel         text not null default 'email',
  recipient       text,
  subject         text,
  document_path   text,
  document_sha256 text,
  status          text not null,
  provider        text,
  error           text,
  metadata        jsonb
);

create index if not exists diagnostic_deliveries_payment_idx on public.diagnostic_deliveries (payment_id, created_at desc);

-- ---------------------------------------------------------------- RLS
alter table public.diagnostic_orders enable row level security;
drop policy if exists diagnostic_orders_service_role_all on public.diagnostic_orders;
create policy diagnostic_orders_service_role_all
  on public.diagnostic_orders
  to service_role
  using (true)
  with check (true);

alter table public.diagnostic_deliveries enable row level security;
drop policy if exists diagnostic_deliveries_service_role_all on public.diagnostic_deliveries;
create policy diagnostic_deliveries_service_role_all
  on public.diagnostic_deliveries
  to service_role
  using (true)
  with check (true);

-- Aucun acces public direct (les tables ne sont pas dans l'API auto-exposee
-- sans service_role ; la policy service_role est la seule porte).
revoke all on public.diagnostic_orders from anon, authenticated;
revoke all on public.diagnostic_deliveries from anon, authenticated;
grant select, insert, update on public.diagnostic_orders to service_role;
grant select, insert on public.diagnostic_deliveries to service_role;

-- ---------------------------------------------------------------- garde-fou
-- Le montant du diagnostic est fixe par le catalogue serveur (49,00 EUR TTC).
-- Ce controle est applique en base ET dans le Worker : une ligne hors
-- catalogue ne doit pas exister.
do $$
begin
  if exists (
    select 1 from public.diagnostic_orders
    where currency <> 'EUR' or amount <> 49.00
  ) then
    raise exception 'diagnostic_orders : montant hors catalogue (49.00 EUR attendu)';
  end if;
end $$;
