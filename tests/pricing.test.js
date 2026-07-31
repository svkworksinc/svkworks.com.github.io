const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCart } = require('../netlify/functions/_pricing.js');

function makeSupabase({ usedParts = [], catalogParts = [] }) {
  return {
    from(table) {
      const rows = table === 'used_parts' ? usedParts : table === 'parts_catalog' ? catalogParts : [];
      return {
        select() { return this; },
        in(col, ids) {
          this._filtered = rows.filter(r => ids.includes(r.id));
          return this;
        },
        then(resolve) { resolve({ data: this._filtered, error: null }); },
      };
    },
  };
}

test('static product uses catalog price', async () => {
  const r = await validateCart([{ id: 'svk-tshirt', quantity: 2 }], null);
  assert.equal(r.subtotal, 50);
});

test('available parts_catalog item prices from DB row', async () => {
  const supabase = makeSupabase({ catalogParts: [{ id: 'p1', title: 'Fan Relay Kit', price: 89.99, weight_oz: 12, status: 'available' }] });
  const r = await validateCart([{ id: 'p1', quantity: 1 }], supabase);
  assert.equal(r.subtotal, 89.99);
  assert.equal(r.items[0].weightOz, 12);
});

test('coming_soon parts_catalog item is rejected', async () => {
  const supabase = makeSupabase({ catalogParts: [{ id: 'p2', title: 'Fuel Pump Relay Kit', price: 0, status: 'coming_soon' }] });
  await assert.rejects(
    () => validateCart([{ id: 'p2', quantity: 1 }], supabase),
    (err) => err.message.includes("isn't available")
  );
});

test('unknown product id is rejected', async () => {
  await assert.rejects(
    () => validateCart([{ id: 'nope', quantity: 1 }], null),
    (err) => err.message.includes('Unknown product')
  );
});

test('used_parts items still validate correctly (regression)', async () => {
  const supabase = makeSupabase({ usedParts: [{ id: 'u1', title: 'Old ECU', price: 50, weight_oz: 20, status: 'available' }] });
  const r = await validateCart([{ id: 'u1', quantity: 1 }], supabase);
  assert.equal(r.items[0].quantity, 1);
  assert.equal(r.items[0].isUsedPart, true);
});
