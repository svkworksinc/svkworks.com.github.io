// TESTING MODE — hardcoded to PayPal sandbox.
// To enable live payments, remove this constant and uncomment the two lines below.
const BASE_URL = 'https://api-m.sandbox.paypal.com';
// const BASE_URL = process.env.PAYPAL_MODE === 'live'
//   ? 'https://api-m.paypal.com'
//   : 'https://api-m.sandbox.paypal.com';

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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PayPal auth failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function createOrder(total, supabaseOrderId) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `svk-${supabaseOrderId}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: supabaseOrderId,
        reference_id: supabaseOrderId,
        description: 'SVK Works Harness Order',
        amount: { currency_code: 'USD', value: total.toFixed(2) },
      }],
      application_context: {
        brand_name: 'SVK Works',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: 'https://www.svkworks.com/order-confirmation.html',
        cancel_url: 'https://www.svkworks.com/checkout.html',
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal createOrder failed: ${err}`);
  }
  return res.json();
}

async function captureOrder(paypalOrderId) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal capture failed: ${err}`);
  }
  return res.json();
}

module.exports = { createOrder, captureOrder };
