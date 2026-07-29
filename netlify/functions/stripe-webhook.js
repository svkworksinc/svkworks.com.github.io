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

  const sig = event.headers['stripe-signature'];
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let stripeEvent;

  try {
    // event.body is the raw string Netlify passes — required for signature verification
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const intent = stripeEvent.data.object;
    const supabaseOrderId = intent.metadata?.supabaseOrderId;

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
      console.error('Order not found for payment intent:', intent.id);
      return { statusCode: 200, body: 'OK' };
    }

    if (order.status !== 'paid') {
      await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', supabaseOrderId);

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
    }
  }

  return { statusCode: 200, body: 'OK' };
};
