const test = require('node:test');
const assert = require('node:assert/strict');
const { reserveUsedParts, releaseUsedPartsReservation } = require('../netlify/functions/_pricing.js');

// Mock Supabase client exposing only .rpc(), which is all these two
// functions call — reservation atomicity lives in the DB function itself
// (see netlify/supabase-used-parts-reservation-migration.sql), so these
// tests exercise the JS-side contract: what gets sent, and how partial /
// error results are handled.
function makeSupabase({ reserveReturns = null, reserveError = null, releaseError = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, params) {
      calls.push({ name, params });
      if (name === 'reserve_used_parts') {
        if (reserveError) return Promise.resolve({ data: null, error: reserveError });
        const ids = reserveReturns ?? params.p_ids;
        return Promise.resolve({ data: ids.map(id => ({ id })), error: null });
      }
      if (name === 'release_used_parts_reservation') {
        return Promise.resolve({ data: null, error: releaseError });
      }
      throw new Error('unexpected rpc: ' + name);
    },
  };
}

const CART = [
  { id: 'u1', name: 'Old ECU', isUsedPart: true },
  { id: 'u2', name: 'Old Harness', isUsedPart: true },
];

test('reserveUsedParts is a no-op when the cart has no used parts', async () => {
  const supabase = makeSupabase();
  await reserveUsedParts(supabase, [{ id: 'svk-tshirt', isUsedPart: false }], 'order-1');
  assert.equal(supabase.calls.length, 0);
});

test('reserveUsedParts succeeds and passes the order id + ttl when everything is claimed', async () => {
  const supabase = makeSupabase({ reserveReturns: ['u1', 'u2'] });
  await reserveUsedParts(supabase, CART, 'order-1');
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].name, 'reserve_used_parts');
  assert.deepEqual(supabase.calls[0].params.p_ids.sort(), ['u1', 'u2']);
  assert.equal(supabase.calls[0].params.p_order_id, 'order-1');
  assert.ok(supabase.calls[0].params.p_ttl_minutes > 0);
});

test('reserveUsedParts throws naming the item(s) it could not claim', async () => {
  const supabase = makeSupabase({ reserveReturns: ['u1'] }); // u2 already taken
  await assert.rejects(
    () => reserveUsedParts(supabase, CART, 'order-1'),
    (err) => err.message.includes('Old Harness') && !err.message.includes('Old ECU')
  );
});

test('reserveUsedParts rolls back a partial claim before throwing', async () => {
  const supabase = makeSupabase({ reserveReturns: ['u1'] }); // u2 unavailable
  await assert.rejects(() => reserveUsedParts(supabase, CART, 'order-1'));
  const releaseCall = supabase.calls.find(c => c.name === 'release_used_parts_reservation');
  assert.ok(releaseCall, 'expected a rollback release call');
  assert.deepEqual(releaseCall.params.p_ids, ['u1']);
  assert.equal(releaseCall.params.p_order_id, 'order-1');
});

test('reserveUsedParts does not attempt a rollback when nothing was claimed', async () => {
  const supabase = makeSupabase({ reserveReturns: [] }); // nothing claimed
  await assert.rejects(() => reserveUsedParts(supabase, CART, 'order-1'));
  const releaseCall = supabase.calls.find(c => c.name === 'release_used_parts_reservation');
  assert.equal(releaseCall, undefined);
});

test('reserveUsedParts throws a generic customer-safe error when the RPC itself errors', async () => {
  const supabase = makeSupabase({ reserveError: { message: 'db is down' } });
  await assert.rejects(
    () => reserveUsedParts(supabase, CART, 'order-1'),
    (err) => !err.message.includes('db is down') // internal detail not leaked to the customer
  );
});

test('releaseUsedPartsReservation is a no-op for an empty id list', async () => {
  const supabase = makeSupabase();
  await releaseUsedPartsReservation(supabase, [], 'order-1');
  assert.equal(supabase.calls.length, 0);
});

test('releaseUsedPartsReservation calls the RPC with the order id guard', async () => {
  const supabase = makeSupabase();
  await releaseUsedPartsReservation(supabase, ['u1'], 'order-1');
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].name, 'release_used_parts_reservation');
  assert.deepEqual(supabase.calls[0].params, { p_ids: ['u1'], p_order_id: 'order-1' });
});

test('releaseUsedPartsReservation does not throw when the RPC errors (best-effort)', async () => {
  const supabase = makeSupabase({ releaseError: { message: 'transient failure' } });
  await assert.doesNotReject(() => releaseUsedPartsReservation(supabase, ['u1'], 'order-1'));
});
