// UPS Track API — direct integration, no third-party aggregator or
// billing account required beyond a free UPS developer account.
//
// Setup (free):
//   1. Sign up at https://developer.ups.com and log in.
//   2. Create an app ("Add Apps") and add the "Tracking" API to it.
//   3. Copy the app's Client ID / Client Secret into Netlify env vars
//      UPS_CLIENT_ID / UPS_CLIENT_SECRET.
// That's it — no payment method needed for read-only tracking calls.
//
// Set UPS_API_ENV=sandbox to hit UPS's CIE test environment instead of
// production. Note CIE only returns mock data for UPS's documented test
// tracking numbers, not real shipments — use production credentials to
// track a real number like the rest of this integration expects.

const AUTH_URL = process.env.UPS_API_ENV === 'sandbox'
  ? 'https://wwwcie.ups.com/security/v1/oauth/token'
  : 'https://onlinetools.ups.com/security/v1/oauth/token';

const TRACK_URL = process.env.UPS_API_ENV === 'sandbox'
  ? 'https://wwwcie.ups.com/api/track/v1/details'
  : 'https://onlinetools.ups.com/api/track/v1/details';

function isConfigured() {
  return !!(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET);
}

// OAuth tokens last ~1hr (UPS default); cached on the warm function
// instance so we're not re-authenticating on every tracking request.
let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const basicAuth = Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`UPS OAuth token request failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3000) * 1000,
  };
  return cachedToken.token;
}

// UPS's currentStatus.type codes — mapped to our status-badge classes.
const STATUS_TYPE_CLASS = {
  D: 'status-complete',  // Delivered
  I: 'status-progress',  // In Transit
  P: 'status-progress',  // Pickup
  M: 'status-pending',   // Manifest / label created, not yet picked up
  X: 'status-cancelled', // Exception
};

function parseUpsDateTime(date, time) {
  if (!date || date.length !== 8) return null;
  const y = date.slice(0, 4), mo = date.slice(4, 6), d = date.slice(6, 8);
  const t = time && time.length === 6 ? `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}` : '00:00:00';
  // UPS reports local time at the scan location, not UTC — treated as UTC
  // here for simplicity, so displayed times may be off by the local
  // timezone offset. Good enough for a "when did this happen" timeline.
  return `${y}-${mo}-${d}T${t}Z`;
}

/** @returns {Promise<null|{statusLabel, statusClass, statusDetail, estimatedDelivery, events}>} */
async function trackUps(trackingNumber) {
  if (!isConfigured()) return null; // caller falls back to Shippo/carrier link

  const token = await getAccessToken();
  const res = await fetch(`${TRACK_URL}/${encodeURIComponent(trackingNumber)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      transId: `svk-${Date.now()}`,
      transactionSrc: 'svkworks.com',
    },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`UPS tracking lookup failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  const pkg = data?.trackResponse?.shipment?.[0]?.package?.[0];
  if (!pkg) throw new Error('UPS response had no package details.');

  const statusType = pkg.currentStatus?.type;
  const events = (pkg.activity || []).map(a => ({
    date: parseUpsDateTime(a.date, a.time),
    description: a.status?.description || 'Update',
    location: [a.location?.address?.city, a.location?.address?.stateProvince, a.location?.address?.country]
      .filter(Boolean).join(', '),
  }));

  const deliveryDate = pkg.deliveryDate?.[0]?.date;

  return {
    statusLabel: pkg.currentStatus?.description || 'Status Unknown',
    statusClass: STATUS_TYPE_CLASS[statusType] || 'status-pending',
    statusDetail: '',
    estimatedDelivery: deliveryDate ? parseUpsDateTime(deliveryDate) : null,
    events,
  };
}

module.exports = { isConfigured, trackUps };
