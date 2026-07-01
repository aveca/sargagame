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

create index if not exists beach_reports_approved_idx
  on public.beach_reports (beach_id, status, created_at desc);

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
