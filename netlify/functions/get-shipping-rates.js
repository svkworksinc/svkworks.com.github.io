const { validateCart, totalWeightOz, PARCEL_DIMENSIONS_IN, SHIPPING_OPTIONS } = require('./_pricing');
const { getRatesForAddress } = require('./_shippo');

function flatRateFallback() {
  return Object.entries(SHIPPING_OPTIONS).map(([id, opt]) => ({
    id,
    label: opt.label,
    desc: opt.desc,
    price: opt.price,
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { cartItems, shippingAddress } = JSON.parse(event.body);

    if (!shippingAddress?.address?.trim() || !shippingAddress?.city?.trim() || !shippingAddress?.state?.trim() || !/^\d{5}$/.test(shippingAddress?.zip || '')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'A complete shipping address (street, city, state, 5-digit ZIP) is required.' }) };
    }

    const { items } = validateCart(cartItems);
    const weightOz = totalWeightOz(items);

    let rates;
    let source = 'flat';
    try {
      const shippoRates = await getRatesForAddress(shippingAddress, weightOz, PARCEL_DIMENSIONS_IN);
      if (shippoRates && shippoRates.length) {
        rates = shippoRates
          .map(r => ({
            id: r.object_id,
            label: [r.provider, r.servicelevel?.name].filter(Boolean).join(' '),
            desc: r.estimated_days ? `${r.estimated_days} business day${r.estimated_days === 1 ? '' : 's'} (estimate)` : 'Delivery estimate unavailable',
            price: Math.round(parseFloat(r.amount) * 100) / 100,
          }))
          .sort((a, b) => a.price - b.price)
          .slice(0, 8);
        source = 'shippo';
      }
    } catch (err) {
      // Shippo not reachable/misconfigured — log and fall through to flat rates so checkout keeps working.
      console.error('[get-shipping-rates] Shippo error, falling back to flat rates:', err.message);
    }

    if (!rates || !rates.length) {
      rates = flatRateFallback();
      source = 'flat';
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates, source }),
    };
  } catch (err) {
    console.error('get-shipping-rates error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal server error.' }) };
  }
};
