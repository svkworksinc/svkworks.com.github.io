const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { validateCart, calculateTotals } = require('./_pricing');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // TESTING MODE — reject any non-test Stripe key to prevent live charges
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.error('SAFETY BLOCK: Stripe key is not a test key. Live payments are disabled during testing.');
    return { statusCode: 503, body: JSON.stringify({ error: 'Payment processing is in test mode only. Live keys are not permitted.' }) };
  }

  try {
    const { cartItems, customerName, customerEmail, customerNotes, shippingOptionId, shippingAddress } = JSON.parse(event.body);

    if (!customerName?.trim() || !customerEmail?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required.' }) };
    }
    if (!shippingAddress?.address?.trim() || !shippingAddress?.city?.trim() || !shippingAddress?.state?.trim() || !shippingAddress?.zip?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Complete shipping address is required.' }) };
    }
    if (!shippingOptionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Shipping method is required.' }) };
    }

    // Server-side price validation
    const { items, subtotal } = validateCart(cartItems);
    const { shipping, shippingLabel, tax, grandTotal } = calculateTotals(subtotal, shippingOptionId, shippingAddress.state);

    // Create order record in Supabase
    const orderNumber = `SVK-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert({
        product: items.map(i => i.name).join(', '),
        options: { items, shippingAddress, shippingMethod: shippingOptionId, shippingLabel, subtotal, shipping, tax },
        total_price: grandTotal,
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
      return { statusCode: 500, body: JSON.stringify({ error: `Failed to create order record: ${dbError.message}` }) };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(grandTotal * 100),
      currency: 'usd',
      receipt_email: customerEmail.trim().toLowerCase(),
      description: `SVK Works Order ${orderNumber}`,
      automatic_payment_methods: { enabled: true },
      metadata: {
        supabaseOrderId: order.id,
        orderNumber,
        customerName: customerName.trim(),
      },
    }, {
      idempotencyKey: `pi-${order.id}`,
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
        subtotal,
        shipping,
        tax,
        grandTotal,
      }),
    };
  } catch (err) {
    console.error('create-stripe-intent error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
