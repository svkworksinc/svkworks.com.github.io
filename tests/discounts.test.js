const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTotals, resolveDiscount } = require('../netlify/functions/_pricing.js');

/** Fake Supabase returning a single discount_codes row from .maybeSingle(). */
function makeSupabase(row) {
  return {
    from(table) {
      assert.equal(table, 'discount_codes');
      const chain = {
        select: () => chain,
        ilike: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return chain;
    },
  };
}

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

function code(overrides = {}) {
  return {
    id: 'dc-1', code: 'SAVE10', kind: 'percent', value: 10,
    min_subtotal: 0, max_uses: null, times_used: 0,
    starts_at: null, expires_at: null, active: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------- calculateTotals

test('no discount leaves totals unchanged (regression)', () => {
  const r = calculateTotals(100, 10, 'TX');
  assert.equal(r.discount, 0);
  // 8.25% of (100 + 10)
  assert.equal(r.tax, 9.08);
  assert.equal(r.grandTotal, 119.08);
});

test('discount reduces the taxable base, not just the total', () => {
  const r = calculateTotals(100, 10, 'TX', 20);
  assert.equal(r.discount, 20);
  // tax is on (100 - 20 + 10) = 90, not on 110
  assert.equal(r.tax, 7.43);
  assert.equal(r.grandTotal, 97.43);
});

test('discount never applies to shipping', () => {
  // A discount equal to the whole subtotal still leaves shipping payable.
  const r = calculateTotals(100, 15, 'CA', 100);
  assert.equal(r.discount, 100);
  assert.equal(r.grandTotal, 15);
});

test('a discount larger than the subtotal is clamped, never negative', () => {
  const r = calculateTotals(50, 10, 'CA', 500);
  assert.equal(r.discount, 50);
  assert.equal(r.grandTotal, 10);
  assert.ok(r.grandTotal >= 0);
});

test('a negative discount cannot inflate the total', () => {
  const r = calculateTotals(100, 10, 'CA', -50);
  assert.equal(r.discount, 0);
  assert.equal(r.grandTotal, 110);
});

test('non-TX orders are untaxed with a discount applied', () => {
  const r = calculateTotals(200, 20, 'CA', 50);
  assert.equal(r.tax, 0);
  assert.equal(r.grandTotal, 170);
});

// ---------------------------------------------------------------- resolveDiscount

test('empty code is a no-op rather than an error', async () => {
  const r = await resolveDiscount(makeSupabase(null), '', 100);
  assert.equal(r.discount, 0);
  assert.equal(r.discountCode, null);
});

test('percent code computes off the subtotal', async () => {
  const r = await resolveDiscount(makeSupabase(code()), 'SAVE10', 250);
  assert.equal(r.discount, 25);
  assert.equal(r.discountCode, 'SAVE10');
  assert.equal(r.label, '10% off');
});

test('fixed code returns its face value', async () => {
  const r = await resolveDiscount(makeSupabase(code({ kind: 'fixed', value: 30 })), 'SAVE10', 250);
  assert.equal(r.discount, 30);
  assert.equal(r.label, '$30.00 off');
});

test('fixed code larger than the subtotal is clamped to it', async () => {
  const r = await resolveDiscount(makeSupabase(code({ kind: 'fixed', value: 500 })), 'SAVE10', 80);
  assert.equal(r.discount, 80);
});

test('unknown code is rejected', async () => {
  await assert.rejects(
    () => resolveDiscount(makeSupabase(null), 'NOPE', 100),
    (e) => /isn't valid/.test(e.message)
  );
});

test('inactive code is rejected with the same message as unknown (no enumeration)', async () => {
  await assert.rejects(
    () => resolveDiscount(makeSupabase(code({ active: false })), 'SAVE10', 100),
    (e) => /isn't valid/.test(e.message)
  );
});

test('expired code is rejected', async () => {
  await assert.rejects(
    () => resolveDiscount(makeSupabase(code({ expires_at: past })), 'SAVE10', 100),
    (e) => /expired/.test(e.message)
  );
});

test('not-yet-started code is rejected', async () => {
  await assert.rejects(
    () => resolveDiscount(makeSupabase(code({ starts_at: future })), 'SAVE10', 100),
    (e) => /active yet/.test(e.message)
  );
});

test('code at its usage cap is rejected', async () => {
  await assert.rejects(
    () => resolveDiscount(makeSupabase(code({ max_uses: 5, times_used: 5 })), 'SAVE10', 100),
    (e) => /usage limit/.test(e.message)
  );
});

test('code below its minimum subtotal is rejected', async () => {
  await assert.rejects(
    () => resolveDiscount(makeSupabase(code({ min_subtotal: 200 })), 'SAVE10', 100),
    (e) => /at least \$200\.00/.test(e.message)
  );
});

test('code exactly at its minimum subtotal is accepted', async () => {
  const r = await resolveDiscount(makeSupabase(code({ min_subtotal: 100 })), 'SAVE10', 100);
  assert.equal(r.discount, 10);
});

test('a code with remaining uses is accepted', async () => {
  const r = await resolveDiscount(makeSupabase(code({ max_uses: 5, times_used: 4 })), 'SAVE10', 100);
  assert.equal(r.discount, 10);
});

test('end-to-end: resolved discount feeds calculateTotals correctly', async () => {
  const subtotal = 300;
  const { discount } = await resolveDiscount(makeSupabase(code({ kind: 'percent', value: 15 })), 'SAVE10', subtotal);
  const totals = calculateTotals(subtotal, 25, 'TX', discount);
  assert.equal(discount, 45);
  // taxable base = 300 - 45 + 25 = 280 -> tax 23.10 -> total 303.10
  assert.equal(totals.tax, 23.1);
  assert.equal(totals.grandTotal, 303.1);
});
