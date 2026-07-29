-- SVK Works — Supabase schema migration for payment integration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add new columns to the orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_id     TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS customer_name  TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS order_number   TEXT,
  ADD COLUMN IF NOT EXISTS items          JSONB;

-- 2. Make user_id nullable so guest (unauthenticated) orders can be stored
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

-- 3. Allow anonymous (guest) users to INSERT orders.
--    The service role key used in Netlify Functions bypasses RLS entirely,
--    so this policy only matters if you ever want anon users to insert via the anon key.
CREATE POLICY "Allow anon insert" ON orders
  FOR INSERT TO anon
  WITH CHECK (true);

-- 4. (Optional) Allow users to read their own orders by customer_email if not logged in.
--    Skip this if you only want logged-in users to view past orders.
-- CREATE POLICY "Allow select by email" ON orders
--   FOR SELECT TO anon
--   USING (customer_email = current_setting('request.jwt.claims', true)::json->>'email');
