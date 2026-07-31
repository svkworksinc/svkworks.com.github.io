// Direct shareable tracking link — looks up an order by its private
// share_token instead of order number + email. The token is a 20-char
// unguessable value generated server-side for every order (see
// netlify/supabase-tracking-token-migration.sql), so it's safe to hand
// straight to the customer as a bookmarkable link:
//   https://www.svkworks.com/tracking?t=<token>
// See track-order.html for the page that renders this.
const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, clientKey, tooManyRequests } = require('./_ratelimit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // The token itself is the secret (20 chars, server-generated), so this is
  // far less guessable than the order-number+email pair track-order.js rate
  // limits — but a generous cap still keeps automated scraping in check.
  const rl = await checkRateLimit(supabase, clientKey(event), 'track-order-token', {
    limit: 30,
    windowSeconds: 600,
  });
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  const token = (event.queryStringParameters?.t || '').trim();
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing tracking link token.' }) };
  }

  try {
    // Only shipping-relevant fields are selected; payment internals
    // (payment_id, refund_id) are never exposed here.
    const { data: order, error } = await supabase
      .from('orders')
      .select('order_number, status, items, options, total_price, submitted_at, tracking_number, carrier, refunded_amount, product, customer_name, share_token')
      .eq('share_token', token)
      .maybeSingle();

    if (error || !order) {
      return { statusCode: 404, body: JSON.stringify({ error: 'This tracking link is invalid or has expired.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    };
  } catch (err) {
    console.error('track-order-token error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error.' }) };
  }
};
