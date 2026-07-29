// Shippo — real-time carrier shipping rates.
// TESTING MODE — only shippo_test_ tokens are accepted. See create-stripe-intent.js
// for the same pattern applied to Stripe.

const BASE_URL = 'https://api.goshippo.com';

function assertTestToken() {
  const key = process.env.SHIPPO_API_KEY;
  if (!key) return null; // Shippo not configured — caller should fall back to flat rates
  if (!key.startsWith('shippo_test_')) {
    throw new Error('SAFETY BLOCK: SHIPPO_API_KEY is not a test token. Live shipping rate calls are disabled during testing.');
  }
  return key;
}

function originAddress() {
  return {
    name: process.env.SHIP_FROM_NAME || 'SVK Works',
    street1: process.env.SHIP_FROM_STREET1,
    street2: process.env.SHIP_FROM_STREET2 || '',
    city: process.env.SHIP_FROM_CITY,
    state: process.env.SHIP_FROM_STATE,
    zip: process.env.SHIP_FROM_ZIP,
    country: process.env.SHIP_FROM_COUNTRY || 'US',
    phone: process.env.SHIP_FROM_PHONE || '',
  };
}

function isOriginConfigured() {
  const o = originAddress();
  return !!(o.street1 && o.city && o.state && o.zip);
}

// weightOz: total shipment weight in ounces. dims: { length, width, height } in inches.
async function getRatesForAddress(destAddress, weightOz, dims) {
  const key = assertTestToken();
  if (!key || !isOriginConfigured()) return null; // not configured — caller falls back to flat rates

  const res = await fetch(`${BASE_URL}/shipments/`, {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address_from: originAddress(),
      address_to: {
        name: destAddress.name || 'Customer',
        street1: destAddress.address,
        city: destAddress.city,
        state: destAddress.state,
        zip: destAddress.zip,
        country: 'US',
      },
      parcels: [{
        length: String(dims.length),
        width: String(dims.width),
        height: String(dims.height),
        distance_unit: 'in',
        weight: String(weightOz),
        mass_unit: 'oz',
      }],
      async: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Shippo shipment request failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  if (data.status === 'ERROR' || !Array.isArray(data.rates)) {
    throw new Error(`Shippo returned no rates: ${JSON.stringify(data.messages || data)}`);
  }
  return data.rates;
}

// Re-fetches a single rate by its Shippo object_id to get the authoritative
// current price — never trust a client-supplied dollar amount for a rate.
async function verifyRate(rateId) {
  const key = assertTestToken();
  if (!key) return null;

  const res = await fetch(`${BASE_URL}/rates/${rateId}`, {
    headers: { Authorization: `ShippoToken ${key}` },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Shippo rate lookup failed: ${res.status} ${err}`);
  }
  return res.json();
}

module.exports = { getRatesForAddress, verifyRate, isOriginConfigured, assertTestToken };
