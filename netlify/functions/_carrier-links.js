// Carrier detection + fallback deep links for netlify/functions/carrier-tracking.js.
// Server-side counterpart to js/tracking.js's carrier table — kept separate
// because the browser file uses `window`, which doesn't exist in a Netlify
// Function.

const CARRIER_LABELS = {
  ups: 'UPS',
  usps: 'USPS',
  fedex: 'FedEx',
  dhl: 'DHL',
  ontrac: 'OnTrac',
  'canada post': 'Canada Post',
  dpd: 'DPD',
  amazon: 'Amazon Logistics',
};

const CARRIER_TRACK_URLS = {
  ups:    n => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`,
  usps:   n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  fedex:  n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  dhl:    n => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
  ontrac: n => `https://www.ontrac.com/tracking?number=${encodeURIComponent(n)}`,
  'canada post': n => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(n)}`,
  dpd:    n => `https://tracking.dpd.de/status/en_US/parcel/${encodeURIComponent(n)}`,
  amazon: n => `https://track.amazon.com/tracking/${encodeURIComponent(n)}`,
};

// Shippo's carrier slug for each carrier we can detect/label. Anything not
// listed here still gets a fallback deep link — it just can't be looked up
// live through Shippo.
const SHIPPO_CARRIER_TOKENS = {
  ups: 'ups',
  usps: 'usps',
  fedex: 'fedex',
  dhl: 'dhl_express',
  ontrac: 'ontrac',
  'canada post': 'canada_post',
  dpd: 'dpd',
};

// Free-text carrier names (e.g. typed into the admin "Carrier" field).
const ALIASES = {
  'united parcel service': 'ups',
  'us postal service': 'usps',
  'usps ground advantage': 'usps',
  'united states postal service': 'usps',
  'fed ex': 'fedex',
  'fedex ground': 'fedex',
  'fedex express': 'fedex',
  'fedex home delivery': 'fedex',
  'amazon logistics': 'amazon',
};

/**
 * Resolve a carrier key from either a carrier name (exact/alias match) or,
 * failing that, the shape of a tracking number itself.
 */
function detectCarrier(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const key = raw.toLowerCase();
  if (CARRIER_LABELS[key]) return key;
  if (ALIASES[key]) return ALIASES[key];

  const clean = raw.replace(/\s+/g, '').toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(clean)) return 'ups';
  if (/^[A-Z]{2}\d{9}US$/.test(clean) || /^(92|93|94|95)\d{20,22}$/.test(clean)) return 'usps';
  if (/^\d{12}$/.test(clean) || /^\d{15}$/.test(clean) || /^96\d{20}$/.test(clean)) return 'fedex';
  return null;
}

/** Deep link to the carrier's own tracking page; a universal fallback if the carrier is unknown. */
function carrierTrackingUrl(carrierKey, trackingNumber) {
  const num = String(trackingNumber || '').trim();
  if (!num) return null;
  const builder = CARRIER_TRACK_URLS[carrierKey];
  if (builder) return builder(num);
  // Auto-detects the carrier from the number itself — covers anything not
  // explicitly listed above ("and more").
  return `https://www.ship24.com/tracking?p=${encodeURIComponent(num)}`;
}

module.exports = { CARRIER_LABELS, SHIPPO_CARRIER_TOKENS, detectCarrier, carrierTrackingUrl };
