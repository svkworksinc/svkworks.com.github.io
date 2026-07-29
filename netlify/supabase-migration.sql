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

-- 4. Index order lookups by payment_id (used in webhook handlers)
CREATE INDEX IF NOT EXISTS orders_payment_id_idx ON orders (payment_id);

-- 5. (Optional) Allow users to read their own orders by customer_email if not logged in.
--    Skip this if you only want logged-in users to view past orders.
-- CREATE POLICY "Allow select by email" ON orders
--   FOR SELECT TO anon
--   USING (customer_email = current_setting('request.jwt.claims', true)::json->>'email');

-- ============================================================
-- Required Netlify environment variables (set in Netlify UI)
-- ============================================================
-- SUPABASE_URL                — from Supabase project settings
-- SUPABASE_SERVICE_ROLE_KEY   — from Supabase project settings (service role)
-- STRIPE_SECRET_KEY           — from Stripe Dashboard → API keys (sk_live_...)
-- STRIPE_PUBLISHABLE_KEY      — from Stripe Dashboard → API keys (pk_live_...) — used in checkout.html
-- STRIPE_WEBHOOK_SECRET       — from Stripe Dashboard → Webhooks → Signing secret (whsec_...)
--                               Endpoint URL: https://www.svkworks.com/.netlify/functions/stripe-webhook
--                               Event to listen for: payment_intent.succeeded
-- PAYPAL_CLIENT_ID            — from PayPal Developer Dashboard (used in checkout.html + _paypal.js)
-- PAYPAL_CLIENT_SECRET        — from PayPal Developer Dashboard (server-side only)
-- PAYPAL_MODE                 — "live" for production, "sandbox" for testing
-- PAYPAL_WEBHOOK_ID           — from PayPal Developer Dashboard → Webhooks (optional but recommended)
--                               Endpoint URL: https://www.svkworks.com/.netlify/functions/paypal-webhook
--                               Event to listen for: PAYMENT.CAPTURE.COMPLETED
-- RESEND_API_KEY              — from Resend dashboard (for invoice emails)
