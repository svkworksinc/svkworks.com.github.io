const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRateLimit, clientKey, tooManyRequests } = require('../netlify/functions/_ratelimit.js');

/** Fake Supabase whose rpc() emulates the bump_rate_limit counter. */
function makeSupabase() {
  const counts = new Map();
  return {
    counts,
    rpc: async (fn, args) => {
      assert.equal(fn, 'bump_rate_limit');
      const k = `${args.p_key}|${args.p_endpoint}|${args.p_window_start}`;
      const next = (counts.get(k) || 0) + 1;
      counts.set(k, next);
      return { data: next, error: null };
    },
  };
}

const OPTS = { limit: 3, windowSeconds: 600 };

test('allows requests up to the limit and blocks the one after', async () => {
  const supabase = makeSupabase();
  for (let i = 1; i <= 3; i++) {
    const r = await checkRateLimit(supabase, '1.2.3.4', 'track-order', OPTS);
    assert.equal(r.allowed, true, `request ${i} should be allowed`);
  }
  const blocked = await checkRateLimit(supabase, '1.2.3.4', 'track-order', OPTS);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0, 'a blocked response must say when to retry');
});

test('counts are isolated per caller', async () => {
  const supabase = makeSupabase();
  for (let i = 0; i < 3; i++) await checkRateLimit(supabase, 'caller-a', 'track-order', OPTS);
  const other = await checkRateLimit(supabase, 'caller-b', 'track-order', OPTS);
  assert.equal(other.allowed, true, 'one caller exhausting its budget must not block another');
});

test('counts are isolated per endpoint', async () => {
  const supabase = makeSupabase();
  for (let i = 0; i < 3; i++) await checkRateLimit(supabase, '1.2.3.4', 'track-order', OPTS);
  const other = await checkRateLimit(supabase, '1.2.3.4', 'get-shipping-rates', OPTS);
  assert.equal(other.allowed, true, 'exhausting one endpoint must not block a different one');
});

test('fails OPEN when the rate-limit backend returns an error', async () => {
  const broken = { rpc: async () => ({ data: null, error: { message: 'relation does not exist' } }) };
  for (let i = 0; i < 10; i++) {
    const r = await checkRateLimit(broken, '1.2.3.4', 'create-stripe-intent', OPTS);
    assert.equal(r.allowed, true, 'a broken limiter must never block checkout');
  }
});

test('fails OPEN when the rate-limit backend throws', async () => {
  const throwing = { rpc: async () => { throw new Error('connection refused'); } };
  const r = await checkRateLimit(throwing, '1.2.3.4', 'create-paypal-order', OPTS);
  assert.equal(r.allowed, true);
});

test('clientKey prefers the Netlify connection IP header', () => {
  assert.equal(
    clientKey({ headers: { 'x-nf-client-connection-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' } }),
    '9.9.9.9'
  );
});

test('clientKey falls back to the first x-forwarded-for hop', () => {
  assert.equal(clientKey({ headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }), '1.1.1.1');
});

test('clientKey degrades to a constant rather than throwing', () => {
  assert.equal(clientKey({}), 'unknown');
  assert.equal(clientKey({ headers: {} }), 'unknown');
});

test('tooManyRequests returns 429 with a Retry-After header', () => {
  const res = tooManyRequests(42);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '42');
  assert.match(JSON.parse(res.body).error, /too many requests/i);
});
