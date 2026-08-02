// Live by default. Set PAYPAL_MODE=sandbox in Netlify env vars to point at
// PayPal's sandbox (fake-money) API instead — useful if testing is ever
// needed again without touching this file.
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PayPal auth failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Builds the description the buyer sees on their PayPal receipt and
// statement. This must accurately reflect what was actually purchased —
// a generic hardcoded label (e.g. always saying "Harness Order") is
// misleading on a non-harness order and unhelpful in a payment dispute.
// PayPal caps this field at 127 characters.
function buildOrderDescription(items, orderNumber) {
  const names = (items || []).map(i => i.name).filter(Boolean);
  if (!names.length) return `SVK Works Order ${orderNumber}`;

  let desc = names.length === 1
    ? names[0]
    : `${names[0]} + ${names.length - 1} more item${names.length > 2 ? 's' : ''}`;

  desc = `SVK Works — ${desc} (Order ${orderNumber})`;
  return desc.length > 127 ? `${desc.slice(0, 124)}...` : desc;
}

async function createOrder(total, supabaseOrderId, { items = [], orderNumber = '' } = {}) {
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
        invoice_id: orderNumber || undefined,
        description: buildOrderDescription(items, orderNumber || supabaseOrderId),
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

async function refundCapture(captureId) {
  const token = await getAccessToken();
  // No `amount` in the body = full refund of the original capture.
  const res = await fetch(`${BASE_URL}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `svk-refund-${captureId}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal refund failed: ${err}`);
  }
  return res.json();
}

module.exports = { createOrder, captureOrder, refundCapture };
