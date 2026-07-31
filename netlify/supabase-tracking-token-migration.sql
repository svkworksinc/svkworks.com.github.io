-- Adds a private, unguessable share token to every order so a tracking
-- link can be handed directly to the customer (svkworks.com/tracking?t=<token>)
-- without exposing the order number (which is short and somewhat guessable)
-- or requiring them to re-enter their email every time.
--
-- Run this once in the Supabase SQL editor.

alter table orders add column if not exists share_token text;

-- Backfill existing rows before the column is made NOT NULL.
update orders
set share_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)
where share_token is null;

alter table orders
  alter column share_token set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);

alter table orders
  alter column share_token set not null;

create unique index if not exists orders_share_token_idx on orders (share_token);

-- No RLS policy changes needed: both the guest lookup (track-order.js) and
-- the token lookup (track-order-token.js) run server-side with the
-- service-role key, which bypasses RLS entirely.
