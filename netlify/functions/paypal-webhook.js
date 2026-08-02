const { createClient } = require('@supabase/supabase-js');
const { sendInvoiceEmail } = require('./_email');
const { markUsedPartsSold, consumeDiscount } = require('./_pricing');
const { captureException } = require('./_sentry');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Live by default (mirrors _paypal.js). Set PAYPAL_MODE=sandbox to point at
// PayPal's sandbox API instead.
const BASE_URL = process.env.PAYPAL_MODE === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

async function getAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function verifyWebhookSignature(event, payload) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: event.headers['paypal-auth-algo'],
      cert_url: event.headers['paypal-cert-url'],
      transmission_id: event.headers['paypal-transmission-id'],
      transmission_sig: event.headers['paypal-transmission-sig'],
      transmission_time: event.headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: payload,
    }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Verify webhook signature when PAYPAL_WEBHOOK_ID is configured
  if (process.env.PAYPAL_WEBHOOK_ID) {
    try {
      const valid = await verifyWebhookSignature(event, payload);
      if (!valid) {
        console.error('PayPal webhook signature verification failed');
        return { statusCode: 400, body: 'Invalid webhook signature' };
      }
    } catch (err) {
      console.error('PayPal webhook verification error:', err.message);
      return { statusCode: 400, body: 'Verification error' };
    }
  }

  try {
    // Handle PAYMENT.CAPTURE.COMPLETED — fired when a PayPal payment is fully captured
    if (payload.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const captureId = payload.resource?.id;
      // custom_id is the supabaseOrderId stored when the order was created
      const supabaseOrderId = payload.resource?.custom_id;

      if (!supabaseOrderId) {
        console.log('PayPal webhook: no custom_id on capture, skipping');
        return { statusCode: 200, body: 'OK' };
      }

      const { data: order, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', supabaseOrderId)
        .single();

      if (error || !order) {
        console.error('PayPal webhook: order not found:', supabaseOrderId);
        return { statusCode: 200, body: 'OK' };
      }

      console.log('[paypal-webhook] Order found:', order.order_number, '— status:', order.status);

      // This is a redundant safety-net path — capture-paypal-order.js normally marks the
      // order paid synchronously during checkout. Only act if it's still pre-payment, so a
      // late-arriving webhook event can't re-send the invoice email or clobber a status the
      // admin has already moved forward (in_progress/shipped/etc).
      if (order.status === 'pending_payment') {
        // 'pending' matches the admin panel's fulfillment vocabulary (pending -> in_progress
        // -> shipped -> complete), same as capture-paypal-order.js / stripe-webhook.js.
        await supabase
          .from('orders')
          .update({
            status: 'pending',
            payment_id: captureId || order.payment_id,
            payment_capture_id: captureId || order.payment_capture_id,
          })
          .eq('id', supabaseOrderId);

        await markUsedPartsSold(supabase, order.items);
        // Only now that payment cleared does a discount code burn a use.
        await consumeDiscount(supabase, order.discount_code);

        console.log('[paypal-webhook] Triggering invoice email for:', order.order_number);
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
      } else {
        console.log('[paypal-webhook] Order already processed (status:', order.status + ') — skipping email');
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('paypal-webhook error:', err);
    await captureException(err);
    // 500 so PayPal retries the webhook instead of silently losing the event.
    return { statusCode: 500, body: 'Internal server error.' };
  }
};
