// Shared rate limiter for public Netlify functions.
//
// Netlify Functions are stateless and horizontally scaled, so an in-memory
// counter would reset on every cold start and wouldn't be shared between
// concurrent containers. State lives in a Supabase `rate_limits` table
// instead (see netlify/supabase-hardening-migration.sql).
//
// Fixed-window counting: requests are bucketed by the window they fall in, so
// each caller gets `limit` requests per `windowSeconds`. Simpler than a
// sliding window and more than adequate for keeping brute-force lookups and
// runaway third-party API costs in check.

/** Best-effort caller identity. Netlify sets x-nf-client-connection-ip. */
function clientKey(event) {
  const h = event.headers || {};
  return (
    h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    h['client-ip'] ||
    'unknown'
  );
}

/**
 * @returns {Promise<{allowed: boolean, retryAfter: number}>}
 *
 * Fails OPEN: if the rate-limit table itself errors, the request is allowed
 * through. A monitoring mechanism must never be able to take down checkout.
 */
async function checkRateLimit(supabase, key, endpoint, { limit, windowSeconds }) {
  try {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();
    const retryAfter = Math.ceil((Math.floor(now / windowMs) * windowMs + windowMs - now) / 1000);

    // Atomic increment-and-return via a security-definer RPC, so two
    // concurrent requests can't both read the same count and each allow
    // themselves through.
    const { data, error } = await supabase.rpc('bump_rate_limit', {
      p_key: key,
      p_endpoint: endpoint,
      p_window_start: windowStart,
    });

    if (error) {
      console.error(`[ratelimit] ${endpoint} check failed, allowing through:`, error.message);
      return { allowed: true, retryAfter: 0 };
    }

    const count = typeof data === 'number' ? data : data?.count ?? 0;
    return { allowed: count <= limit, retryAfter };
  } catch (err) {
    console.error(`[ratelimit] ${endpoint} threw, allowing through:`, err.message);
    return { allowed: true, retryAfter: 0 };
  }
}

/** Standard 429 response body/headers. */
function tooManyRequests(retryAfter) {
  return {
    statusCode: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter || 60) },
    body: JSON.stringify({
      error: 'Too many requests. Please wait a moment and try again.',
    }),
  };
}

module.exports = { checkRateLimit, clientKey, tooManyRequests };
