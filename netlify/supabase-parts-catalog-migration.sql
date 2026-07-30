-- SVK Works — "Parts Catalog" migration (3D Parts / Other Parts / Relay & Power Kits)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Requires auth_is_admin() — created by netlify/supabase-used-parts-migration.sql.
-- Safe to re-run.

-- 1. Table
create table if not exists parts_catalog (
  id          uuid primary key default gen_random_uuid(),
  subcategory text not null check (subcategory in ('3d-parts', 'other-parts', 'relay-power-kits')),
  title       text not null,
  slug        text,
  description text,
  price       numeric(10,2) not null default 0 check (price >= 0),
  engine      text,                          -- optional filter tag, e.g. '1UZ-FE' / '2JZ-GTE' / 'K24'
  images      jsonb not null default '[]',
  weight_oz   integer not null default 16 check (weight_oz > 0),
  status      text not null default 'coming_soon' check (status in ('available', 'coming_soon')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists parts_catalog_subcategory_idx on parts_catalog(subcategory);
create unique index if not exists parts_catalog_slug_idx on parts_catalog(slug) where slug is not null;

-- 2. Row Level Security
alter table parts_catalog enable row level security;

-- Everyone (including logged-out visitors) can see every listing — "coming
-- soon" items are meant to be publicly visible, just not purchasable yet
-- (enforced server-side in netlify/functions/_pricing.js).
create policy "Public can view parts catalog"
  on parts_catalog for select
  using (true);

create policy "Admins manage parts catalog"
  on parts_catalog for all
  using (auth_is_admin())
  with check (auth_is_admin());

-- ============================================================
-- 3. Storage bucket for part photos
-- ============================================================
-- Create the bucket via the Supabase Dashboard:
--   Dashboard → Storage → New bucket
--   Name: parts-catalog
--   Public bucket: ON

create policy "Public read parts-catalog images"
  on storage.objects for select
  using (bucket_id = 'parts-catalog');

create policy "Admins upload parts-catalog images"
  on storage.objects for insert
  with check (bucket_id = 'parts-catalog' and auth_is_admin());

create policy "Admins delete parts-catalog images"
  on storage.objects for delete
  using (bucket_id = 'parts-catalog' and auth_is_admin());

-- ============================================================
-- 4. Seed: the two "coming soon" Relay & Power Kits
-- ============================================================
insert into parts_catalog (subcategory, title, slug, description, price, status)
select 'relay-power-kits', 'Fuel Pump Relay Kit',
  'fuel-pump-relay-kit',
  'Plug-and-play fuel pump relay upgrade kit — full details coming soon.',
  0, 'coming_soon'
where not exists (select 1 from parts_catalog where slug = 'fuel-pump-relay-kit');

insert into parts_catalog (subcategory, title, slug, description, price, status)
select 'relay-power-kits', 'Fan Relay Kit',
  'fan-relay-kit',
  'Plug-and-play cooling fan relay upgrade kit — full details coming soon.',
  0, 'coming_soon'
where not exists (select 1 from parts_catalog where slug = 'fan-relay-kit');
