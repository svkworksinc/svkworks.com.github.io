const { createClient } = require('@supabase/supabase-js');
const { captureOrder } = require('./_paypal');
const { sendInvoiceEmail } = require('./_email');
const { markUsedPartsSold } = require('./_pricing');
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
    const { paypalOrderId, supabaseOrderId } = JSON.parse(event.body);

    if (!paypalOrderId || !supabaseOrderId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields.' }) };
    }

    // Fetch our order from Supabase to get the authoritative total
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', supabaseOrderId)
      .single();

    if (fetchError || !order) {
      console.error(`[capture-paypal-order] Order not found: id=${supabaseOrderId} supabase_project=${process.env.SUPABASE_URL} error=${fetchError?.message}`);
      return { statusCode: 404, body: JSON.stringify({ error: 'Order not found.' }) };
    }
    console.log(`[capture-paypal-order] Order found: id=${order.id} order_number=${order.order_number} status=${order.status}`);
    if (order.status !== 'pending_payment') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Order already processed.' }) };
    }

    // Capture payment via PayPal
    const capture = await captureOrder(paypalOrderId);
    const captureUnit = capture.purchase_units?.[0]?.payments?.captures?.[0];

    if (!captureUnit || capture.status !== 'COMPLETED') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment capture incomplete.' }) };
    }

    // Verify captured amount matches our DB price — prevents price-manipulation attacks
    const capturedAmount = parseFloat(captureUnit.amount.value);
    if (Math.abs(capturedAmount - order.total_price) > 0.01) {
      console.error(`Amount mismatch: captured $${capturedAmount}, expected $${order.total_price}`);
      return { statusCode: 422, body: JSON.stringify({ error: 'Captured amount does not match order total.' }) };
    }

    // Mark order paid — 'pending' matches the admin panel's fulfillment vocabulary
    // (pending -> in_progress -> shipped -> complete) so it shows up correctly under
    // the "Pending" filter instead of an unrecognized 'paid' status.
    await supabase
      .from('orders')
      .update({ status: 'pending', payment_id: paypalOrderId, payment_capture_id: captureUnit.id })
      .eq('id', supabaseOrderId);

    await markUsedPartsSold(supabase, order.items);

    // Send invoice email before returning — must be awaited or Netlify kills the in-flight fetch
    const orderDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const opts = order.options || {};
    try {
      await sendInvoiceEmail({
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        orderNumber: order.order_number,
        orderDate,
        items: order.items || [],
        subtotal: opts.subtotal,
        shipping: opts.shipping,
        shippingLabel: opts.shippingLabel,
        tax: opts.tax,
        total: order.total_price,
        shippingAddress: opts.shippingAddress,
        paymentMethod: 'PayPal',
      });
    } catch (err) {
      console.error('Email send failed:', err.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        order: {
          orderNumber: order.order_number,
          orderDate,
          items: order.items || [],
          subtotal: opts.subtotal,
          shipping: opts.shipping,
          shippingLabel: opts.shippingLabel,
          tax: opts.tax,
          total: order.total_price,
          shippingAddress: opts.shippingAddress,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          paymentMethod: 'PayPal',
        },
      }),
    };
  } catch (err) {
    console.error('capture-paypal-order error:', err);
    await captureException(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
