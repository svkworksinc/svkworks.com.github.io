/* ============================================
   SVK Works — Shipment Tracking Helper
   Builds a deep link to the carrier's own tracking page from a
   carrier name + tracking number. Used by track-order.html,
   account.html, and admin.html.
   ============================================ */

const SVK_CARRIER_TRACKERS = {
  ups:         n => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`,
  usps:        n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  fedex:       n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  dhl:         n => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
  ontrac:      n => `https://www.ontrac.com/tracking?number=${encodeURIComponent(n)}`,
  'canada post': n => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(n)}`,
  dpd:         n => `https://tracking.dpd.de/status/en_US/parcel/${encodeURIComponent(n)}`,
  amazon:      n => `https://track.amazon.com/tracking/${encodeURIComponent(n)}`,
};

// Free-text carrier names admins might type into the "Carrier" field.
const SVK_CARRIER_ALIASES = {
  'united parcel service': 'ups',
  'us postal service': 'usps',
  'usps ground advantage': 'usps',
  'united states postal service': 'usps',
  'united states postal service (usps)': 'usps',
  'fed ex': 'fedex',
  'fedex ground': 'fedex',
  'fedex express': 'fedex',
  'fedex home delivery': 'fedex',
  'amazon logistics': 'amazon',
};

/**
 * Resolve a tracking URL from a (possibly missing/misspelled) carrier name
 * and a tracking number. Falls back to auto-detection from the tracking
 * number's format, then to a universal multi-carrier tracker for anything
 * unrecognized (regional/international carriers, etc.) so every shipment
 * gets a working "Track Package" link.
 */
function svkTrackingUrl(carrier, trackingNumber) {
  const num = String(trackingNumber || '').trim();
  if (!num) return null;

  const key = String(carrier || '').trim().toLowerCase();
  const normalized = SVK_CARRIER_ALIASES[key] || key;
  if (SVK_CARRIER_TRACKERS[normalized]) return SVK_CARRIER_TRACKERS[normalized](num);

  const clean = num.replace(/\s+/g, '').toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(clean)) return SVK_CARRIER_TRACKERS.ups(num);
  if (/^[A-Z]{2}\d{9}US$/.test(clean) || /^(92|93|94|95)\d{20,22}$/.test(clean)) return SVK_CARRIER_TRACKERS.usps(num);
  if (/^\d{12}$/.test(clean) || /^\d{15}$/.test(clean) || /^96\d{20}$/.test(clean)) return SVK_CARRIER_TRACKERS.fedex(num);

  // Universal fallback — auto-detects the carrier from the number itself,
  // covering everything not explicitly listed above ("and more").
  return `https://www.ship24.com/tracking?p=${encodeURIComponent(num)}`;
}

/** Renders the "Tracking" meta row used on account/track-order/admin pages. */
function svkRenderTrackingRow(order) {
  if (!order || !order.tracking_number) return '';
  const url = svkTrackingUrl(order.carrier, order.tracking_number);
  const carrierSuffix = order.carrier ? ` (${order.carrier})` : '';
  const link = url
    ? ` <a href="${url}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="margin-left:8px;text-decoration:none;">Track Package →</a>`
    : '';
  return `<div><div class="om-meta-label">Tracking</div><div class="om-meta-value" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${order.tracking_number}${carrierSuffix}${link}</div></div>`;
}
