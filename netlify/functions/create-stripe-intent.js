const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { validateCart, resolveShipping, calculateTotals, resolveDiscount, reserveUsedParts, releaseUsedPartsReservation } = require('./_pricing');
const { resolveUserId } = require('./_auth');
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

  // TESTING MODE — reject any non-test Stripe key to prevent live charges
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.error('SAFETY BLOCK: Stripe key is not a test key. Live payments are disabled during testing.');
    return { statusCode: 503, body: JSON.stringify({ error: 'Payment processing is in test mode only. Live keys are not permitted.' }) };
  }

  // Each call creates a pending_payment order row and a Stripe PaymentIntent.
  // Unthrottled, a script could fill the orders table with junk and hammer
  // Stripe's API. 20/10min leaves plenty of headroom for a customer retrying.
  const rl = await checkRateLimit(supabase, clientKey(event), 'create-stripe-intent', {
    limit: 20,
    windowSeconds: 600,
  });
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  try {
    const { cartItems, customerName, customerEmail, customerNotes, shippingOptionId, shippingAddress, accessToken, discountCode } = JSON.parse(event.body);

    if (!customerName?.trim() || !customerEmail?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required.' }) };
    }
    if (!shippingAddress?.address?.trim() || !shippingAddress?.city?.trim() || !shippingAddress?.state?.trim() || !shippingAddress?.zip?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Complete shipping address is required.' }) };
    }
    if (!shippingOptionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Shipping method is required.' }) };
    }

    // Server-side price validation — shipping and any discount are both
    // independently resolved/verified, never trusted from the client (see
    // resolveShipping / resolveDiscount in _pricing.js)
    const { items, subtotal } = await validateCart(cartItems, supabase);
    const { shipping, shippingLabel } = await resolveShipping(shippingOptionId);
    const { discount, discountCode: resolvedCode, discountCodeId } =
      await resolveDiscount(supabase, discountCode, subtotal);
    const { tax, grandTotal } = calculateTotals(subtotal, shipping, shippingAddress.state, discount);
    const userId = await resolveUserId(supabase, accessToken);

    // Create order record in Supabase
    const orderNumber = `SVK-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        product: items.map(i => i.name).join(', '),
        options: { items, shippingAddress, shippingMethod: shippingOptionId, shippingLabel, subtotal, shipping, tax, discount, discountCode: resolvedCode },
        total_price: grandTotal,
        discount_code: resolvedCode,
        discount_amount: discount || null,
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
    console.log(`[create-stripe-intent] Order inserted: id=${order.id} order_number=${orderNumber} supabase_project=${process.env.SUPABASE_URL}`);

    // Hold any one-off used parts before we let the customer pay for them —
    // never charge a card for inventory someone else might also be buying
    // right now. On failure, the order never had a real payment attempt
    // against it, so it's marked cancelled rather than left as a phantom
    // pending_payment row.
    try {
      await reserveUsedParts(supabase, items, order.id);
    } catch (reserveErr) {
      await supabase
        .from('orders')
        .update({ status: 'cancelled', admin_notes: reserveErr.message })
        .eq('id', order.id);
      return { statusCode: 409, body: JSON.stringify({ error: reserveErr.message }) };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    let intent;
    try {
      intent = await stripe.paymentIntents.create({
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
    } catch (stripeErr) {
      // Stripe rejected the intent — don't leave the part reserved for a
      // checkout that never actually started.
      const usedIds = items.filter(i => i.isUsedPart).map(i => i.id);
      await releaseUsedPartsReservation(supabase, usedIds, order.id);
      await supabase
        .from('orders')
        .update({ status: 'cancelled', admin_notes: `Stripe intent creation failed: ${stripeErr.message}` })
        .eq('id', order.id);
      throw stripeErr;
    }

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
        discount,
        discountCode: resolvedCode,
        grandTotal,
      }),
    };
  } catch (err) {
    console.error('create-stripe-intent error:', err);
    await captureException(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
