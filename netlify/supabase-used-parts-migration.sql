-- SVK Works — "Used Parts" feature migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Requires the base schema + admin setup from js/auth.js (profiles.is_admin, auth_is_admin())
-- to already exist — see the comment block at the top of js/auth.js if not.

-- 1. Table
create table if not exists used_parts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  price       numeric(10,2) not null check (price >= 0),
  condition   text not null check (condition in ('open_box_new', 'good', 'fair', 'untested', 'junk')),
  category    text,
  weight_oz   integer not null default 16 check (weight_oz > 0),
  images      jsonb not null default '[]',
  status      text not null default 'available' check (status in ('available', 'sold')),
  admin_notes text,
  created_at  timestamptz not null default now(),
  sold_at     timestamptz
);

create index if not exists used_parts_status_idx on used_parts(status);

-- 2. Row Level Security
alter table used_parts enable row level security;

-- Anyone (including anon/logged-out visitors) can see available parts.
-- auth_is_admin() is the security-definer function already created for the
-- orders/profiles admin setup in js/auth.js — reused here so admins can also
-- see sold parts through the same read path.
create policy "Public can view available used parts"
  on used_parts for select
  using (status = 'available' or auth_is_admin());

-- Only admins can create/edit/delete listings.
create policy "Admins manage used parts"
  on used_parts for all
  using (auth_is_admin())
  with check (auth_is_admin());

-- ============================================================
-- 3. Storage bucket for part photos
-- ============================================================
-- Create the bucket itself via the Supabase Dashboard (simpler/more reliable
-- than inserting into storage.buckets directly):
--   Dashboard → Storage → New bucket
--   Name: used-parts
--   Public bucket: ON
--
-- Then run the policies below so only admins can upload/delete photos, while
-- everyone can view them (needed since they're rendered on public pages).

create policy "Public read used-parts images"
  on storage.objects for select
  using (bucket_id = 'used-parts');

create policy "Admins upload used-parts images"
  on storage.objects for insert
  with check (bucket_id = 'used-parts' and auth_is_admin());

create policy "Admins delete used-parts images"
  on storage.objects for delete
  using (bucket_id = 'used-parts' and auth_is_admin());
