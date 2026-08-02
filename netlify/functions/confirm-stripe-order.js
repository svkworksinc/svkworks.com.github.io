// Browser-triggered Stripe order confirmation — a safety net so the
// customer's order confirmation email doesn't depend solely on Stripe's
// webhook being correctly configured and delivered.
//
// PayPal already works this way (capture-paypal-order.js is called
// directly by the browser), which is why PayPal orders were confirming
// while Stripe orders silently weren't when the webhook wasn't firing.
//
// The client is NOT trusted: it only supplies a payment_intent id, and
// this re-fetches that intent from Stripe to confirm it actually
// succeeded and that its amount matches the order before finalizing.
// Sharing _finalize.js with stripe-webhook.js means whichever path runs
// first wins and the other no-ops — no duplicate emails.
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { finalizePaidOrder } = require('./_finalize');
const { captureException } = require('./_sentry');
const { checkRateLimit, clientKey, tooManyRequests } = require('./_ratelimit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not configured.');
    return { statusCode: 503, body: JSON.stringify({ error: 'Payment processing is not configured.' }) };
  }

  const rl = await checkRateLimit(supabase, clientKey(event), 'confirm-stripe-order', {
    limit: 20,
    windowSeconds: 600,
  });
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  try {
    const { paymentIntentId } = JSON.parse(event.body || '{}');
    if (!paymentIntentId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing payment intent id.' }) };
    }

    // Authoritative check straight from Stripe — never take the browser's
    // word that a payment succeeded.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== 'succeeded') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment has not completed.' }) };
    }

    const supabaseOrderId = intent.metadata?.supabaseOrderId;
    if (!supabaseOrderId) {
      console.error('[confirm-stripe-order] No supabaseOrderId in intent metadata:', paymentIntentId);
      return { statusCode: 422, body: JSON.stringify({ error: 'Payment is not linked to an order.' }) };
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', supabaseOrderId)
      .single();

    if (error || !order) {
      console.error('[confirm-stripe-order] Order not found:', supabaseOrderId, error?.message);
      return { statusCode: 404, body: JSON.stringify({ error: 'Order not found.' }) };
    }

    // The intent must belong to this order, and for the right amount.
    if (order.payment_id && order.payment_id !== intent.id) {
      console.error(`[confirm-stripe-order] Intent ${intent.id} does not match order ${order.order_number} (expected ${order.payment_id})`);
      return { statusCode: 422, body: JSON.stringify({ error: 'Payment does not match this order.' }) };
    }
    const paidAmount = (intent.amount_received ?? intent.amount) / 100;
    if (Math.abs(paidAmount - Number(order.total_price)) > 0.01) {
      console.error(`[confirm-stripe-order] Amount mismatch on ${order.order_number}: paid $${paidAmount}, expected $${order.total_price}`);
      return { statusCode: 422, body: JSON.stringify({ error: 'Paid amount does not match order total.' }) };
    }

    const result = await finalizePaidOrder(supabase, order, {
      paymentMethodLabel: 'Credit / Debit Card',
      extraUpdates: { payment_id: intent.id },
      logPrefix: '[confirm-stripe-order]',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, finalized: result.finalized, orderNumber: order.order_number }),
    };
  } catch (err) {
    console.error('confirm-stripe-order error:', err);
    await captureException(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
