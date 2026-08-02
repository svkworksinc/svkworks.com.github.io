const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { releaseUsedPartsReservation } = require('./_pricing');
const { finalizePaidOrder } = require('./_finalize');
const { captureException } = require('./_sentry');

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
    return { statusCode: 503, body: 'Not configured.' };
  }

  const sig = event.headers['stripe-signature'];
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  let stripeEvent;

  try {
    // Netlify may base64-encode the body; decode before signature verification
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  console.log('[webhook] Event received:', stripeEvent.type);

  try {
    if (stripeEvent.type === 'payment_intent.succeeded') {
      const intent = stripeEvent.data.object;
      const supabaseOrderId = intent.metadata?.supabaseOrderId;
      console.log('[webhook] payment_intent.succeeded — supabaseOrderId:', supabaseOrderId || 'MISSING');

      if (!supabaseOrderId) {
        console.error('No supabaseOrderId in payment intent metadata');
        return { statusCode: 200, body: 'OK' };
      }

      const { data: order, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', supabaseOrderId)
        .single();

      if (error || !order) {
        console.error('Order not found for payment intent:', intent.id, error?.message);
        return { statusCode: 200, body: 'OK' };
      }

      console.log('[webhook] Order found:', order.order_number, '— status:', order.status);

      // Shared with confirm-stripe-order.js — whichever path gets here first
      // finalizes the order; the other no-ops. See _finalize.js.
      await finalizePaidOrder(supabase, order, {
        paymentMethodLabel: 'Credit / Debit Card',
        logPrefix: '[webhook]',
      });
    } else if (stripeEvent.type === 'payment_intent.payment_failed' || stripeEvent.type === 'payment_intent.canceled') {
      // Card declined, 3DS abandoned, intent expired, etc. — free the used-parts
      // reservation immediately instead of waiting out the TTL, so the item
      // is buyable again as soon as possible.
      const intent = stripeEvent.data.object;
      const supabaseOrderId = intent.metadata?.supabaseOrderId;
      if (supabaseOrderId) {
        const { data: order } = await supabase
          .from('orders')
          .select('*')
          .eq('id', supabaseOrderId)
          .single();
        if (order && order.status === 'pending_payment') {
          const usedIds = (order.items || []).filter(i => i.isUsedPart).map(i => i.id);
          await releaseUsedPartsReservation(supabase, usedIds, supabaseOrderId);
          await supabase
            .from('orders')
            .update({ status: 'cancelled', admin_notes: `Stripe: ${stripeEvent.type}` })
            .eq('id', supabaseOrderId);
          console.log('[webhook] Released reservation & cancelled order after', stripeEvent.type, '-', order.order_number);
        }
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('stripe-webhook error:', err);
    await captureException(err);
    // 500 so Stripe retries the webhook instead of silently losing the event.
    return { statusCode: 500, body: 'Internal server error.' };
  }
};
