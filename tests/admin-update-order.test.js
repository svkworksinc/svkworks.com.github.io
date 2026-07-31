const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const HANDLER_PATH = path.join(__dirname, '../netlify/functions/admin-update-order.js');

// In-memory fake DB, reset before every test.
let ORDERS, PROFILES, EVENTS, USED_PARTS;
function resetDb() {
  ORDERS = {
    'order-1': { id: 'order-1', status: 'pending', payment_method: 'stripe', payment_id: 'pi_123', total_price: '150.00', customer_name: 'Jane', customer_email: 'jane@example.com', order_number: 'SVK-1', items: [{ id: 'up-1', isUsedPart: true }] },
    'order-2': { id: 'order-2', status: 'in_progress', payment_method: 'paypal', payment_capture_id: 'CAP123', total_price: '89.99', customer_name: 'Bob', customer_email: 'bob@example.com', order_number: 'SVK-2', items: [] },
    'order-3': { id: 'order-3', status: 'complete', payment_method: 'stripe', payment_id: 'pi_999', total_price: '50.00', customer_name: 'Sam', customer_email: 'sam@example.com', order_number: 'SVK-3', items: [] },
  };
  PROFILES = { 'admin-user': { full_name: 'Admin Person', is_admin: true }, 'regular-user': { full_name: 'Not Admin', is_admin: false } };
  EVENTS = [];
  USED_PARTS = { 'up-1': { id: 'up-1', status: 'sold' } };
}

const originalRequire = Module.prototype.require;
function mockRequire(id) {
  if (id === '@supabase/supabase-js') {
    return {
      createClient: () => ({
        auth: {
          getUser: async (token) => {
            if (token === 'valid-admin-token') return { data: { user: { id: 'admin-user' } }, error: null };
            if (token === 'valid-nonadmin-token') return { data: { user: { id: 'regular-user' } }, error: null };
            return { data: null, error: { message: 'invalid' } };
          },
        },
        from(table) {
          const state = { filterVal: null, updateFields: null };
          const chain = {
            select() { return chain; },
            eq(col, val) { state.filterVal = val; return chain; },
            single: async () => {
              if (table === 'profiles') return { data: PROFILES[state.filterVal], error: null };
              if (table === 'orders') return { data: ORDERS[state.filterVal], error: state.filterVal in ORDERS ? null : { message: 'not found' } };
              return { data: null, error: { message: 'unknown' } };
            },
            update(fields) { state.updateFields = fields; return chain; },
            insert(fields) {
              if (table === 'order_events') EVENTS.push(fields);
              return Promise.resolve({ error: null });
            },
            in(col, ids) {
              if (table === 'used_parts') {
                ids.forEach(id => { if (USED_PARTS[id]) Object.assign(USED_PARTS[id], state.updateFields); });
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: null });
            },
            then: (resolve) => {
              if (table === 'orders' && state.updateFields) {
                if (ORDERS[state.filterVal]) Object.assign(ORDERS[state.filterVal], state.updateFields);
              }
              resolve({ error: null });
            },
          };
          return chain;
        },
      }),
    };
  }
  if (id === 'stripe') {
    return function FakeStripe() {
      return { refunds: { create: async ({ payment_intent }) => ({ id: 're_' + payment_intent }) } };
    };
  }
  if (id === './_paypal') {
    return { refundCapture: async (captureId) => ({ id: 'RF_' + captureId }) };
  }
  if (id === './_email') {
    return { sendOrderStatusEmail: async () => {} };
  }
  return originalRequire.apply(this, arguments);
}

let handler;

test.before(() => {
  Module.prototype.require = mockRequire;
  delete require.cache[HANDLER_PATH];
  ({ handler } = require(HANDLER_PATH));
});

test.after(() => {
  Module.prototype.require = originalRequire;
  delete require.cache[HANDLER_PATH];
});

test.before(() => {
  resetDb();
});

function post(body) {
  return handler({ httpMethod: 'POST', body: JSON.stringify(body) });
}

// Tests below run sequentially (node:test's default within a file) and
// deliberately share mutated DB state across the accept -> ship -> cancel
// lifecycle of order-1/order-2, mirroring a real order's life cycle. resetDb()
// is called again only where a fresh order is needed (before the edit test).

test('non-admin is rejected with 403', async () => {
  const res = await post({ orderId: 'order-1', accessToken: 'valid-nonadmin-token', action: 'accept' });
  assert.equal(res.statusCode, 403);
});

test('invalid token is rejected with 401', async () => {
  const res = await post({ orderId: 'order-1', accessToken: 'garbage', action: 'accept' });
  assert.equal(res.statusCode, 401);
});

test('missing accessToken is rejected with 400', async () => {
  const res = await post({ orderId: 'order-1', action: 'accept' });
  assert.equal(res.statusCode, 400);
});

test('accept transitions pending -> in_progress and logs an event', async () => {
  const res = await post({ orderId: 'order-1', accessToken: 'valid-admin-token', action: 'accept' });
  assert.equal(res.statusCode, 200);
  assert.equal(ORDERS['order-1'].status, 'in_progress');
  assert.ok(EVENTS.some(e => e.action === 'accept'));
});

test('accepting an already-complete order is rejected with 409', async () => {
  const res = await post({ orderId: 'order-3', accessToken: 'valid-admin-token', action: 'accept' });
  assert.equal(res.statusCode, 409);
});

test('ship without a tracking number is rejected with 400', async () => {
  const res = await post({ orderId: 'order-1', accessToken: 'valid-admin-token', action: 'ship', trackingNumber: '' });
  assert.equal(res.statusCode, 400);
});

test('ship with a tracking number succeeds and persists it', async () => {
  const res = await post({ orderId: 'order-1', accessToken: 'valid-admin-token', action: 'ship', trackingNumber: '1Z999', carrier: 'UPS' });
  assert.equal(res.statusCode, 200);
  assert.equal(ORDERS['order-1'].status, 'shipped');
  assert.equal(ORDERS['order-1'].tracking_number, '1Z999');
});

test('cancel without a reason is rejected with 400', async () => {
  const res = await post({ orderId: 'order-2', accessToken: 'valid-admin-token', action: 'cancel', reason: '' });
  assert.equal(res.statusCode, 400);
});

test('cancelling a Stripe order refunds via payment_id and releases used-part inventory', async () => {
  const res = await post({ orderId: 'order-1', accessToken: 'valid-admin-token', action: 'cancel', reason: 'Customer changed mind' });
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.refundId, 're_pi_123');
  assert.equal(ORDERS['order-1'].status, 'cancelled');
  assert.equal(USED_PARTS['up-1'].status, 'available');
});

test('cancelling a PayPal order refunds via payment_capture_id', async () => {
  const res = await post({ orderId: 'order-2', accessToken: 'valid-admin-token', action: 'cancel', reason: 'Out of stock' });
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.refundId, 'RF_CAP123');
});

test('edit updates shipping address and logs an event', async () => {
  resetDb(); // order-2 was cancelled above; start from a fresh in_progress order
  const res = await post({ orderId: 'order-2', accessToken: 'valid-admin-token', action: 'edit', shippingAddress: { address: '123 New St', city: 'Austin', state: 'TX', zip: '78701' } });
  assert.equal(res.statusCode, 200);
  assert.ok(EVENTS.some(e => e.action === 'edit'));
});
