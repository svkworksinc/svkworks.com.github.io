// Guest order tracking — look up an order by order number + email, no
// account/session required. Guest checkouts already work (orders can have
// user_id: null), but until now there was no way for a guest to check
// status. Runs server-side with the service-role client since a guest has
// no session to satisfy the orders table's RLS policies.
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { orderNumber, email } = JSON.parse(event.body);
    if (!orderNumber?.trim() || !email?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Order number and email are required.' }) };
    }

    // Both filters are case-insensitive (ilike) — customers shouldn't have to
    // remember exact casing. Only shipping-relevant fields are selected;
    // payment internals (payment_id, refund_id) are never exposed here.
    const { data: order, error } = await supabase
      .from('orders')
      .select('order_number, status, items, options, total_price, submitted_at, tracking_number, carrier, refunded_amount, product, customer_name')
      .ilike('order_number', orderNumber.trim())
      .ilike('customer_email', email.trim())
      .maybeSingle();

    // Deliberately generic — never reveal whether the order number or the
    // email was the part that didn't match, so this can't be used to
    // enumerate valid order numbers.
    if (error || !order) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No order found matching that order number and email.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    };
  } catch (err) {
    console.error('track-order error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error.' }) };
  }
};
