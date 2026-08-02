-- SVK Works — Used parts inventory reservation
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Problem: used_parts are one-off (never more than one buyer), but the
-- checkout flow only marked a part "sold" *after* payment succeeded. Two
-- customers could both pass validation, both pay, and only then discover
-- only one of them actually gets the part. With live card processing this
-- becomes a real refund-and-apologize situation instead of a theoretical one.
--
-- Fix: reserve the part atomically at checkout time (before payment), with
-- a short expiry so an abandoned cart doesn't lock inventory forever. The
-- atomicity has to live in the database — two concurrent serverless function
-- invocations don't share memory, so a plain "read status, then write" from
-- JS can always race. A single UPDATE ... WHERE is what makes this safe.

-- 1. New columns
alter table used_parts add column if not exists reserved_at timestamptz;
alter table used_parts add column if not exists reserved_order_id uuid references orders(id) on delete set null;

-- 2. Widen the status constraint to include the new in-between state
alter table used_parts drop constraint if exists used_parts_status_check;
alter table used_parts add constraint used_parts_status_check check (status in ('available', 'reserved', 'sold'));

-- 3. Atomically claim one or more parts for an order. Returns the subset of
-- p_ids that were actually claimed — the caller must check this against
-- what it asked for, since a partial result means someone else already has
-- the rest. A row is claimable if it's available, OR if it was reserved by
-- a *different, expired* attempt (abandoned checkout) — reservations older
-- than p_ttl_minutes are treated as free again.
create or replace function reserve_used_parts(p_ids uuid[], p_order_id uuid, p_ttl_minutes int default 20)
returns table(id uuid)
language sql
security definer
as $$
  update used_parts
  set status = 'reserved', reserved_at = now(), reserved_order_id = p_order_id
  where used_parts.id = any(p_ids)
    and (
      status = 'available'
      or (status = 'reserved' and reserved_at < now() - make_interval(mins => p_ttl_minutes))
    )
  returning used_parts.id;
$$;

-- 4. Release a reservation, but only the caller's own — guarded by
-- reserved_order_id so a delayed/duplicate webhook can never release
-- inventory that was legitimately reclaimed by a different order in the
-- meantime (e.g. after this order's reservation already expired).
create or replace function release_used_parts_reservation(p_ids uuid[], p_order_id uuid)
returns void
language sql
security definer
as $$
  update used_parts
  set status = 'available', reserved_at = null, reserved_order_id = null
  where used_parts.id = any(p_ids)
    and reserved_order_id = p_order_id
    and status = 'reserved';
$$;

-- No RLS changes needed: the public read policy already only shows
-- status='available', so 'reserved' rows disappear from listings exactly
-- like 'sold' ones do. Admins already see everything via auth_is_admin().
