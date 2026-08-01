// Public shipment tracking by raw carrier tracking number — no order
// lookup, no email, nothing SVK-specific required. Powers the branded
// /tracking?number=<trackingNumber> page (see track-order.html), which
// exists so a customer can check a UPS/USPS/FedEx/etc. shipment on
// svkworks.com instead of being sent straight to the carrier's own site.
//
// Two possible live data sources, tried in order:
//   1. A carrier's own API directly (currently just UPS — see _ups.js).
//      Free, no billing account required, just a free developer signup.
//   2. Shippo's multi-carrier Tracking API (_shippo.js) — covers more
//      carriers through one integration, but Shippo requires a payment
//      method on file even for read-only tracking calls.
// If neither is configured/reachable, or the number isn't recognized,
// this still returns 200 with live:false plus a deep link to the
// carrier's own tracking page, so the page is never a dead end.
const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, clientKey, tooManyRequests } = require('./_ratelimit');
const { trackShipment } = require('./_shippo');
const { isConfigured: upsConfigured, trackUps } = require('./_ups');
const { CARRIER_LABELS, SHIPPO_CARRIER_TOKENS, detectCarrier, carrierTrackingUrl } = require('./_carrier-links');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SHIPPO_STATUS_MAP = {
  UNKNOWN:     { label: 'Status Unknown',      cls: 'status-pending' },
  PRE_TRANSIT: { label: 'Label Created',       cls: 'status-pending' },
  TRANSIT:     { label: 'In Transit',          cls: 'status-progress' },
  DELIVERED:   { label: 'Delivered',           cls: 'status-complete' },
  RETURNED:    { label: 'Returned to Sender',  cls: 'status-cancelled' },
  FAILURE:     { label: 'Delivery Exception',  cls: 'status-cancelled' },
};

async function lookupViaShippo(carrierKey, number) {
  const shippoToken = carrierKey && SHIPPO_CARRIER_TOKENS[carrierKey];
  if (!shippoToken) return null;

  const data = await trackShipment(shippoToken, number);
  if (!data || !data.tracking_status) return null;

  const statusInfo = SHIPPO_STATUS_MAP[data.tracking_status.status] || SHIPPO_STATUS_MAP.UNKNOWN;
  const events = (data.tracking_history || []).map(h => ({
    date: h.status_date,
    description: h.status_details || SHIPPO_STATUS_MAP[h.status]?.label || h.status || 'Update',
    location: [h.location?.city, h.location?.state, h.location?.country].filter(Boolean).join(', '),
  }));

  return {
    statusLabel: statusInfo.label,
    statusClass: statusInfo.cls,
    statusDetail: data.tracking_status.status_details || '',
    estimatedDelivery: data.eta || null,
    events,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const rl = await checkRateLimit(supabase, clientKey(event), 'carrier-tracking', {
    limit: 30,
    windowSeconds: 600,
  });
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  const number = (event.queryStringParameters?.number || '').trim();
  if (!number) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing tracking number.' }) };
  }
  const carrierParam = (event.queryStringParameters?.carrier || '').trim();

  const carrierKey = detectCarrier(carrierParam) || detectCarrier(number);
  const fallbackUrl = carrierTrackingUrl(carrierKey, number);
  const carrierLabel = carrierKey ? CARRIER_LABELS[carrierKey] : null;
  const base = { trackingNumber: number, carrier: carrierLabel, fallbackUrl, live: false };
  const respond = (extra) => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(extra ? { ...base, live: true, ...extra } : base),
  });

  if (carrierKey === 'ups' && upsConfigured()) {
    try {
      const result = await trackUps(number);
      if (result) return respond(result);
    } catch (err) {
      console.error('carrier-tracking UPS lookup failed, trying Shippo/fallback:', err.message);
      // fall through — Shippo (if configured) or the plain carrier link below
    }
  }

  try {
    const result = await lookupViaShippo(carrierKey, number);
    if (result) return respond(result);
  } catch (err) {
    // Shippo not reachable, no billing on file, this number/carrier pair
    // not found, etc. — the carrier deep link in `base` still gets the
    // customer to their status.
    console.error('carrier-tracking Shippo lookup failed, falling back to carrier link:', err.message);
  }

  return respond(null);
};
