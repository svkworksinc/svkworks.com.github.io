/* ============================================
   SVK Works — Shipment Tracking Helper
   Builds links to SVK Works' own hosted tracking pages:
     /tracking?t=<share_token>   — our order-status pipeline (Received /
                                    Building / Shipped / Complete)
     /tracking?number=<tracking> — live carrier scan events (UPS/USPS/
                                    FedEx/etc.), rendered on-site instead
                                    of sending the customer to the
                                    carrier's own website.
   Used by track-order.html, account.html, and admin.html.
   ============================================ */

/** URL to our own branded carrier-tracking page for a tracking number. */
function svkCarrierTrackingPageUrl(trackingNumber, carrier) {
  const num = String(trackingNumber || '').trim();
  if (!num) return null;
  const params = new URLSearchParams({ number: num });
  if (carrier) params.set('carrier', carrier);
  return `${window.location.origin}/tracking?${params.toString()}`;
}

/** Renders the "Tracking" meta row used on account/track-order/admin pages. */
function svkRenderTrackingRow(order) {
  if (!order || !order.tracking_number) return '';
  const url = svkCarrierTrackingPageUrl(order.tracking_number, order.carrier);
  const carrierSuffix = order.carrier ? ` (${order.carrier})` : '';
  const link = url
    ? ` <a href="${url}" class="btn btn-sm btn-ghost" style="margin-left:8px;text-decoration:none;">Track Package →</a>`
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
