/* ============================================
   SVK Works — Shipment Tracking Helper
   Builds a deep link to the carrier's own tracking page from a
   carrier name + tracking number, and a shareable SVK Works tracking
   link (svkworks.com/tracking?t=<token>) backed by our own order-status
   pipeline. Used by track-order.html, account.html, and admin.html.
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

/** Full URL to SVK Works' own order-status tracking page for a share token. */
function svkTrackingPageUrl(shareToken) {
  if (!shareToken) return null;
  return `${window.location.origin}/tracking?t=${encodeURIComponent(shareToken)}`;
}

/** Copies the SVK Works tracking link to the clipboard, with inline button feedback. */
async function svkCopyTrackingLink(shareToken, btnEl) {
  const url = svkTrackingPageUrl(shareToken);
  if (!url) return;
  const original = btnEl ? btnEl.textContent : null;
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    window.prompt('Copy this tracking link:', url);
    return;
  }
  if (btnEl) {
    btnEl.textContent = 'Link Copied!';
    setTimeout(() => { btnEl.textContent = original; }, 1800);
  }
}

/**
 * Button that copies a direct svkworks.com/tracking?t=… link for this order
 * — works before shipment too (shows the Received/Building/Shipped pipeline),
 * not just once a carrier tracking number exists.
 */
function svkRenderShareLinkButton(order) {
  if (!order || !order.share_token) return '';
  return `<button type="button" class="btn btn-sm btn-ghost" onclick="svkCopyTrackingLink('${order.share_token}', this)">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:3px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Copy Tracking Link
  </button>`;
}
