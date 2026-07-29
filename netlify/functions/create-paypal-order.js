const { createClient } = require('@supabase/supabase-js');
const { validateCart } = require('./_pricing');
const { createOrder } = require('./_paypal');

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

    // Server-side price validation — never trust the client-supplied price
    const { items, total } = validateCart(cartItems);

    // Create order record in Supabase with pending_payment status
    const orderNumber = `SVK-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert({
        product: items.map(i => i.name).join(', '),
        options: { items },
        total_price: total,
        notes: customerNotes || '',
        status: 'pending_payment',
        payment_method: 'paypal',
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

    const supabaseOrderId = order.id;

    // Create the PayPal order server-side — amount is sourced from our validated DB record, not the client
    const paypalOrder = await createOrder(total, supabaseOrderId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paypalOrderId: paypalOrder.id, supabaseOrderId, orderNumber, total }),
    };
  } catch (err) {
    console.error('create-paypal-order error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
