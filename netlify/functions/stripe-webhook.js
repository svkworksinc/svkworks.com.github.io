const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { sendInvoiceEmail } = require('./_email');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // TESTING MODE — reject any non-test Stripe key
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.error('SAFETY BLOCK: Stripe key is not a test key. Webhook rejected.');
    return { statusCode: 503, body: 'Test mode only.' };
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

    if (order.status !== 'paid') {
      await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', supabaseOrderId);

      console.log('[webhook] Triggering invoice email for:', order.order_number);
      const orderDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      sendInvoiceEmail({
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        orderNumber: order.order_number,
        orderDate,
        items: order.items || [],
        total: order.total_price,
        paymentMethod: 'Credit / Debit Card',
      }).catch(err => console.error('Email send failed:', err));
    } else {
      console.log('[webhook] Order already paid — skipping email');
    }
  }

  return { statusCode: 200, body: 'OK' };
};
