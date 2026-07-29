const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { validateCart } = require('./_pricing');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { cartItems, customerName, customerEmail, customerNotes } = JSON.parse(event.body);

    if (!customerName?.trim() || !customerEmail?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required.' }) };
    }

    // Server-side price validation
    const { items, total } = validateCart(cartItems);

    // Create order record in Supabase
    const orderNumber = `SVK-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert({
        product: items.map(i => i.name).join(', '),
        options: { items },
        total_price: total,
        notes: customerNotes || '',
        status: 'pending_payment',
        payment_method: 'stripe',
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim().toLowerCase(),
        order_number: orderNumber,
        items,
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Supabase insert error:', dbError);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create order record.' }) };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100), // Stripe uses cents
      currency: 'usd',
      receipt_email: customerEmail.trim().toLowerCase(),
      description: `SVK Works Order ${orderNumber}`,
      metadata: {
        supabaseOrderId: order.id,
        orderNumber,
        customerName: customerName.trim(),
      },
    });

    // Store the Stripe intent ID so the webhook can find this order
    await supabase
      .from('orders')
      .update({ payment_id: intent.id })
      .eq('id', order.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientSecret: intent.client_secret,
        supabaseOrderId: order.id,
        orderNumber,
        total,
      }),
    };
  } catch (err) {
    console.error('create-stripe-intent error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
