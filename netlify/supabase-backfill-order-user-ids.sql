-- SVK Works — Backfill user_id on orders placed before checkout linked accounts
-- Run this once in the Supabase SQL Editor if past orders don't show up in a
-- customer's account order history (fixed going forward as of this migration
-- — see create-stripe-intent.js / create-paypal-order.js / netlify/functions/_auth.js).
--
-- Matches by email against auth.users, since those older orders only ever
-- stored customer_email, never user_id. Safe to re-run — only touches rows
-- still missing a user_id.

update orders o
set user_id = u.id
from auth.users u
where o.user_id is null
  and o.customer_email is not null
  and lower(o.customer_email) = lower(u.email);
