const { createClient } = require('@supabase/supabase-js');
const { validateCart, resolveShipping, calculateTotals } = require('./_pricing');
const { createOrder } = require('./_paypal');
const { resolveUserId } = require('./_auth');
const { captureException } = require('./_sentry');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { cartItems, customerName, customerEmail, customerNotes, shippingOptionId, shippingAddress, accessToken } = JSON.parse(event.body);

    if (!customerName?.trim() || !customerEmail?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required.' }) };
    }
    if (!shippingAddress?.address?.trim() || !shippingAddress?.city?.trim() || !shippingAddress?.state?.trim() || !shippingAddress?.zip?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Complete shipping address is required.' }) };
    }
    if (!shippingOptionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Shipping method is required.' }) };
    }

    // Server-side price validation — never trust the client-supplied price.
    // Shipping is independently resolved/verified (see resolveShipping in _pricing.js).
    const { items, subtotal } = await validateCart(cartItems, supabase);
    const { shipping, shippingLabel } = await resolveShipping(shippingOptionId);
    const { tax, grandTotal } = calculateTotals(subtotal, shipping, shippingAddress.state);
    const userId = await resolveUserId(supabase, accessToken);

    // Create order record in Supabase with pending_payment status
    const orderNumber = `SVK-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        product: items.map(i => i.name).join(', '),
        options: { items, shippingAddress, shippingMethod: shippingOptionId, shippingLabel, subtotal, shipping, tax },
        total_price: grandTotal,
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
      return { statusCode: 500, body: JSON.stringify({ error: `Failed to create order record: ${dbError.message}` }) };
    }
    console.log(`[create-paypal-order] Order inserted: id=${order.id} order_number=${orderNumber} supabase_project=${process.env.SUPABASE_URL}`);

    const supabaseOrderId = order.id;

    // Create the PayPal order server-side — amount is sourced from our validated DB record, not the client
    const paypalOrder = await createOrder(grandTotal, supabaseOrderId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paypalOrderId: paypalOrder.id, supabaseOrderId, orderNumber, subtotal, shipping, tax, grandTotal }),
    };
  } catch (err) {
    console.error('create-paypal-order error:', err);
    await captureException(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
