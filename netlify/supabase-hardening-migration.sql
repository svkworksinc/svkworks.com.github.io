-- SVK Works — Rate limiting, discount codes, newsletter
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Requires auth_is_admin() — created by netlify/supabase-used-parts-migration.sql.
-- Safe to re-run.

-- ============================================================================
-- 1. Rate limiting
-- ============================================================================
-- Netlify Functions are stateless, so per-caller request counts can't live in
-- process memory. Fixed-window buckets keyed by (caller, endpoint, window).

create table if not exists rate_limits (
  id           bigint generated always as identity primary key,
  key          text        not null,      -- caller identity (client IP)
  endpoint     text        not null,      -- which function
  window_start timestamptz not null,
  count        int         not null default 0,
  unique (key, endpoint, window_start)
);

create index if not exists rate_limits_window_idx on rate_limits(window_start);

-- Never exposed to the browser — only the service-role client touches this.
alter table rate_limits enable row level security;

-- Atomically increment and return the new count. Doing this in one statement
-- (rather than SELECT-then-UPDATE from the function) means two concurrent
-- requests can't both read the same count and each decide they're under the
-- limit. Returns the post-increment count.
create or replace function bump_rate_limit(
  p_key text,
  p_endpoint text,
  p_window_start timestamptz
) returns int language plpgsql security definer as $$
declare
  new_count int;
begin
  insert into rate_limits (key, endpoint, window_start, count)
  values (p_key, p_endpoint, p_window_start, 1)
  on conflict (key, endpoint, window_start)
    do update set count = rate_limits.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- Housekeeping: drop buckets older than a day. Call periodically (Supabase
-- Dashboard → Database → Cron, or any scheduled job). Not required for
-- correctness — old rows are simply never read again — but keeps the table small.
create or replace function prune_rate_limits()
returns void language sql security definer as $$
  delete from rate_limits where window_start < now() - interval '1 day'
$$;

-- ============================================================================
-- 2. Discount codes
-- ============================================================================
create table if not exists discount_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text        not null unique,
  kind         text        not null check (kind in ('percent', 'fixed')),
  value        numeric(10,2) not null check (value > 0),
  min_subtotal numeric(10,2) not null default 0,
  max_uses     int,                       -- null = unlimited
  times_used   int         not null default 0,
  starts_at    timestamptz,               -- null = active immediately
  expires_at   timestamptz,               -- null = never expires
  active       boolean     not null default true,
  description  text,
  created_at   timestamptz not null default now()
);

-- Codes are matched case-insensitively, so uniqueness must be too.
create unique index if not exists discount_codes_code_lower_idx
  on discount_codes (lower(code));

alter table discount_codes enable row level security;

-- Admin-only. Customers never read this table directly — validation happens
-- server-side in the Netlify functions via the service-role client, so a
-- browser can never enumerate valid codes.
drop policy if exists "discount_codes admin all" on discount_codes;
create policy "discount_codes admin all" on discount_codes
  for all using (auth_is_admin()) with check (auth_is_admin());

-- Atomically consume one use. Returns true if a use was recorded, false if the
-- code has hit max_uses in the meantime. Called only after payment succeeds.
create or replace function consume_discount_code(p_id uuid)
returns boolean language plpgsql security definer as $$
declare
  ok boolean;
begin
  update discount_codes
     set times_used = times_used + 1
   where id = p_id
     and (max_uses is null or times_used < max_uses)
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

-- ============================================================================
-- 3. Newsletter subscribers
-- ============================================================================
create table if not exists newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text        not null unique,
  source     text,                        -- which page/form they signed up from
  created_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_email_lower_idx
  on newsletter_subscribers (lower(email));

alter table newsletter_subscribers enable row level security;

-- Only admins can read the list. Inserts go through the subscribe function
-- (service role), so no public insert policy is needed — that also keeps the
-- table from being used to test whether an address is already subscribed.
drop policy if exists "newsletter admin read" on newsletter_subscribers;
create policy "newsletter admin read" on newsletter_subscribers
  for select using (auth_is_admin());

-- ============================================================================
-- 4. Discount columns on orders
-- ============================================================================
alter table orders
  add column if not exists discount_code   text,
  add column if not exists discount_amount numeric(10,2);
