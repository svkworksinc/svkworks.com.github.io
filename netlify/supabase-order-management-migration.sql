-- SVK Works — Order Management upgrade
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Requires auth_is_admin() — created by netlify/supabase-used-parts-migration.sql.
-- Safe to re-run.

-- 1. New columns on orders
alter table orders
  add column if not exists tracking_number    text,
  add column if not exists carrier            text,
  add column if not exists admin_notes        text,
  add column if not exists cancelled_at       timestamptz,
  add column if not exists cancel_reason      text,
  add column if not exists refund_id          text,
  add column if not exists refunded_amount    numeric(10,2),
  -- PayPal's refund API needs the CAPTURE id, not the order id that
  -- payment_id already stores. Stripe refunds use payment_id (the
  -- PaymentIntent id) directly, so this is PayPal-only.
  add column if not exists payment_capture_id text;

-- 2. Audit trail — every accept / ship / complete / cancel / edit, who did it, when
create table if not exists order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  admin_id    uuid,
  admin_name  text,
  action      text not null,        -- 'accept' | 'ship' | 'complete' | 'cancel' | 'edit'
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists order_events_order_id_idx on order_events(order_id);

alter table order_events enable row level security;

-- All writes go through the service-role Netlify function
-- (admin-update-order.js), which bypasses RLS — only a read policy is needed
-- so the admin panel can display the audit timeline.
create policy "Admins view order events"
  on order_events for select
  using (auth_is_admin());
