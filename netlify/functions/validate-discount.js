// Live discount-code preview for the cart/checkout UI.
//
// Read-only on purpose: it tells the customer what a code is worth but never
// records a redemption. Usage is only consumed after payment succeeds (see
// consumeDiscount in _pricing.js), so an abandoned checkout can't burn a
// single-use code.
//
// The subtotal is recomputed from the cart server-side rather than trusted
// from the request, so the preview can't be inflated by editing the payload,
// and it always matches what create-stripe-intent/create-paypal-order will
// independently charge.
const { createClient } = require('@supabase/supabase-js');
const { validateCart, resolveDiscount } = require('./_pricing');
const { checkRateLimit, clientKey, tooManyRequests } = require('./_ratelimit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Guessing codes is the obvious abuse here, so this gets a tight budget.
  const rl = await checkRateLimit(supabase, clientKey(event), 'validate-discount', {
    limit: 15,
    windowSeconds: 600,
  });
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  try {
    const { code, cartItems } = JSON.parse(event.body);
    if (!code?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Please enter a discount code.' }) };
    }
    if (!Array.isArray(cartItems) || !cartItems.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Your cart is empty.' }) };
    }

    const { subtotal } = await validateCart(cartItems, supabase);

    let result;
    try {
      result = await resolveDiscount(supabase, code, subtotal);
    } catch (err) {
      // Expected rejection (invalid/expired/min-subtotal) — a 200 with ok:false
      // keeps this distinguishable from a server fault on the client.
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: err.message }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        code: result.discountCode,
        label: result.label,
        discount: result.discount,
        subtotal,
      }),
    };
  } catch (err) {
    console.error('validate-discount error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not check that code right now.' }) };
  }
};
